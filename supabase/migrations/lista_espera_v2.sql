-- AI dev note: Lista de espera v2 (03/11/2026, pedido do dono a partir do relato da Lolô).
--
-- 1. Preferência estruturada (dia, hora, fisio, consulta atual) para casar com o horário que vaga.
-- 2. A Ju lê a conversa quando uma consulta é marcada/remarcada e, se a família queria outro horário,
--    manda um card no grupo 🩺 Agenda e atendimentos: ✅ Incluir / ❌ Descartar (edge lista-espera-ju).
--    Caso urgente sem horário (pedido de agendamento parado há 30 min) entra sozinho na lista.
-- 3. Vagou (cancelou, remarcou ou desativou, de 2 h a 7 dias): card com o melhor candidato e o efeito
--    em cadeia ("se trocar, vaga 9h30: a Letícia quer"). Botões: 📲 Oferecer horário (a Ju escreve à
--    família), 🔁 Já combinei, trocar (muda a consulta) e ❌ Descartar (vai para o próximo).
--    Todo card some do grupo depois do clique ou quando o horário é ocupado.
-- 4. Pedido de troca na lista só sai quando a troca acontece (antes saía em qualquer consulta nova).
-- 5. Oferta de horário da reserva da Ju diz a fisio ("amanhã às 11h ou às 12h com a Beatriz").
-- 6. Card do 🔔 fechado com pedido da família só anotado (caso Diane): a Ju retoma a conversa.

-- ============================================================ estrutura
ALTER TABLE public.lista_espera
  ADD COLUMN IF NOT EXISTS pref_data date,
  ADD COLUMN IF NOT EXISTS pref_dias int[],
  ADD COLUMN IF NOT EXISTS pref_hora_ini time,
  ADD COLUMN IF NOT EXISTS pref_hora_fim time,
  ADD COLUMN IF NOT EXISTS pref_profissional_id uuid REFERENCES public.pessoas(id),
  ADD COLUMN IF NOT EXISTS agendamento_atual_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem text;

ALTER TABLE public.ju_conversas ADD COLUMN IF NOT EXISTS retomar_pendente_em timestamptz;

CREATE TABLE IF NOT EXISTS public.lista_espera_analises (
  id bigserial PRIMARY KEY,
  motivo text NOT NULL CHECK (motivo IN ('agendou', 'remarcou', 'urgente')),
  conversa_id bigint NOT NULL REFERENCES public.ju_conversas(id) ON DELETE CASCADE,
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  solicitacao_id bigint REFERENCES public.ju_solicitacoes(id) ON DELETE CASCADE,
  data_hora_antes timestamp,
  processar_apos timestamptz NOT NULL DEFAULT now() + interval '3 minutes',
  tentativas int NOT NULL DEFAULT 0,
  pego_em timestamptz,
  processado_em timestamptz,
  resultado jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lista_espera_analises_solicitacao_uq
  ON public.lista_espera_analises (solicitacao_id) WHERE solicitacao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lista_espera_analises_pendentes
  ON public.lista_espera_analises (processar_apos) WHERE processado_em IS NULL;

CREATE TABLE IF NOT EXISTS public.lista_espera_sugestoes (
  id bigserial PRIMARY KEY,
  analise_id bigint REFERENCES public.lista_espera_analises(id) ON DELETE SET NULL,
  conversa_id bigint REFERENCES public.ju_conversas(id) ON DELETE SET NULL,
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  paciente_id uuid REFERENCES public.pessoas(id),
  tipo text NOT NULL,
  nome text NOT NULL,
  telefone text,
  preferencia text,
  evidencia text,
  pref_data date, pref_dias int[], pref_hora_ini time, pref_hora_fim time,
  pref_profissional_id uuid REFERENCES public.pessoas(id),
  urgente boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'incluida', 'descartada', 'expirada')),
  card_req_id bigint, card_msg_id text,
  decidido_por text, decidido_em timestamptz,
  lista_espera_id bigint REFERENCES public.lista_espera(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lista_espera_vagas (
  id bigserial PRIMARY KEY,
  agendamento_origem_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  profissional_id uuid NOT NULL REFERENCES public.pessoas(id),
  data_hora timestamp NOT NULL, -- hora de parede
  tipo text NOT NULL,
  candidato_id bigint REFERENCES public.lista_espera(id) ON DELETE SET NULL,
  descartados bigint[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta', 'oferecida', 'trocada', 'sem_candidatos', 'preenchida', 'expirada')),
  card_req_id bigint, card_msg_id text,
  oferta_conversa_id bigint REFERENCES public.ju_conversas(id) ON DELETE SET NULL,
  oferta_em timestamptz, oferta_por text,
  resolvido_por text, resolvido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lista_espera_vagas_abertas
  ON public.lista_espera_vagas (profissional_id, data_hora) WHERE status IN ('aberta', 'oferecida');

-- Só o banco (funções SECURITY DEFINER) e o service role mexem nessas tabelas.
ALTER TABLE public.lista_espera_analises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lista_espera_sugestoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lista_espera_vagas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lista_espera_analises, public.lista_espera_sugestoes, public.lista_espera_vagas FROM anon, authenticated;

-- ============================================================ utilitários
-- Hora de parede legível para a família: "hoje às 10h30", "amanhã (quarta) às 9h", "sexta, 06/11, às 14h".
CREATE OR REPLACE FUNCTION public.fn_le_quando(p timestamp)
RETURNS text LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT CASE WHEN p::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'hoje'
              WHEN p::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date + 1
                THEN 'amanhã (' || (ARRAY['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[extract(dow FROM p)::int + 1] || ')'
              ELSE (ARRAY['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[extract(dow FROM p)::int + 1] || ', ' || to_char(p, 'DD/MM') || ','
         END || ' às ' || regexp_replace(to_char(p, 'FMHH24"h"MI'), 'h00$', 'h');
$$;

CREATE OR REPLACE FUNCTION public.fn_le_hora(p time)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT regexp_replace(to_char(p, 'FMHH24"h"MI'), 'h00$', 'h');
$$;

-- Card no grupo 🩺 Agenda e atendimentos (botões "rótulo|id", até 3). Devolve o id do pg_net.
CREATE OR REPLACE FUNCTION public.fn_le_card(p_texto text, p_botoes text[])
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_tok text := fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
BEGIN
  IF v_tok IS NULL THEN RETURN NULL; END IF;
  RETURN net.http_post(
    url := 'https://infuse.uazapi.com/send/' || CASE WHEN cardinality(coalesce(p_botoes, '{}')) > 0 THEN 'menu' ELSE 'text' END,
    body := CASE WHEN cardinality(coalesce(p_botoes, '{}')) > 0
                 THEN jsonb_build_object('number', '120363402677285308@g.us', 'type', 'button', 'text', p_texto, 'choices', to_jsonb(p_botoes))
                 ELSE jsonb_build_object('number', '120363402677285308@g.us', 'text', p_texto) END,
    headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
    timeout_milliseconds := 20000);
END $$;

CREATE OR REPLACE FUNCTION public.fn_le_msg_id(p_req bigint)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT coalesce(content::jsonb ->> 'messageid', nullif(split_part(content::jsonb ->> 'id', ':', 2), ''))
    FROM net._http_response WHERE id = p_req AND status_code BETWEEN 200 AND 299 AND content ~ '^\s*\{';
$$;

CREATE OR REPLACE FUNCTION public.fn_le_apagar(p_msg text, p_req bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_msg text := coalesce(p_msg, fn_le_msg_id(p_req)); v_tok text := fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
BEGIN
  IF v_msg IS NULL OR v_tok IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url := 'https://infuse.uazapi.com/message/delete', body := jsonb_build_object('id', v_msg),
    headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
    timeout_milliseconds := 20000);
END $$;

-- Pacientes ligados ao telefone de uma conversa (o próprio paciente ou quem é responsável por ele).
CREATE OR REPLACE FUNCTION public.fn_le_pacientes_da_conversa(p_conversa_id bigint)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  WITH k AS (SELECT fn_atrib_tel_chave(telefone) AS ch FROM ju_conversas WHERE id = p_conversa_id)
  SELECT coalesce(array_agg(DISTINCT x.id), '{}') FROM (
    SELECT p.id FROM pessoas p, k WHERE k.ch IS NOT NULL AND fn_atrib_tel_chave(p.telefone::text) = k.ch
    UNION
    SELECT pr.id_pessoa FROM pessoa_responsaveis pr JOIN pessoas r ON r.id = pr.id_responsavel, k
     WHERE k.ch IS NOT NULL AND pr.ativo IS NOT FALSE AND fn_atrib_tel_chave(r.telefone::text) = k.ch) x;
$$;

-- Conversas da família de um paciente (mais recente primeiro).
CREATE OR REPLACE FUNCTION public.fn_le_conversas_do_paciente(p_paciente uuid)
RETURNS bigint[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  WITH t AS (
    SELECT fn_atrib_tel_chave(p.telefone::text) AS ch FROM pessoas p WHERE p.id = p_paciente
    UNION
    SELECT fn_atrib_tel_chave(r.telefone::text) FROM pessoa_responsaveis pr JOIN pessoas r ON r.id = pr.id_responsavel
     WHERE pr.id_pessoa = p_paciente AND pr.ativo IS NOT FALSE)
  SELECT coalesce(array_agg(c.id ORDER BY c.ultima_mensagem_cliente DESC NULLS LAST), '{}')
    FROM ju_conversas c WHERE c.wa_chatid NOT LIKE '%@g.us'
     AND fn_atrib_tel_chave(c.telefone) IN (SELECT ch FROM t WHERE ch IS NOT NULL);
$$;

-- ============================================================ candidatos para um horário que vagou
CREATE OR REPLACE FUNCTION public.fn_le_candidatos(p_prof uuid, p_dh timestamp, p_tipo text, p_excluir_paciente uuid, p_excluir bigint[])
RETURNS SETOF public.lista_espera LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT l.* FROM lista_espera l
    LEFT JOIN agendamentos a ON a.id = l.agendamento_atual_id
    LEFT JOIN consulta_status cs ON cs.id = a.status_consulta_id
   WHERE l.removido_em IS NULL AND l.tipo = p_tipo
     AND NOT (l.id = ANY (coalesce(p_excluir, '{}')))
     AND (p_excluir_paciente IS NULL OR l.paciente_id IS DISTINCT FROM p_excluir_paciente)
     AND (l.pref_profissional_id IS NULL OR l.pref_profissional_id = p_prof)
     AND (l.pref_data IS NULL OR l.pref_data = p_dh::date)
     AND (l.pref_dias IS NULL OR cardinality(l.pref_dias) = 0 OR extract(isodow FROM p_dh)::int = ANY (l.pref_dias))
     AND (l.pref_hora_ini IS NULL
          OR p_dh::time BETWEEN l.pref_hora_ini - interval '30 minutes' AND coalesce(l.pref_hora_fim, l.pref_hora_ini) + interval '30 minutes')
     -- quem já tem consulta só troca com a mesma fisio, para uma consulta futura que ainda está marcada
     AND (l.agendamento_atual_id IS NULL
          OR (a.ativo AND a.profissional_id = p_prof AND cs.codigo IN ('agendado', 'confirmado')
              AND (a.data_hora AT TIME ZONE 'UTC') > (now() AT TIME ZONE 'America/Sao_Paulo')
              AND (a.data_hora AT TIME ZONE 'UTC') <> p_dh))
     -- a criança já não tem consulta nesse horário
     AND NOT EXISTS (SELECT 1 FROM agendamentos x JOIN consulta_status xs ON xs.id = x.status_consulta_id
                      WHERE l.paciente_id IS NOT NULL AND x.paciente_id = l.paciente_id AND x.ativo
                        AND xs.codigo IN ('agendado', 'confirmado') AND (x.data_hora AT TIME ZONE 'UTC') = p_dh)
   ORDER BY l.urgente DESC,
            ((l.pref_data IS NOT NULL)::int + (l.pref_hora_ini IS NOT NULL)::int
             + (l.pref_profissional_id IS NOT NULL)::int + (l.pref_dias IS NOT NULL)::int) DESC,
            l.created_at;
$$;

-- O horário da vaga já foi ocupado (consulta ou reserva da mesma fisio a menos de 30 min)?
CREATE OR REPLACE FUNCTION public.fn_le_vaga_ocupada(v public.lista_espera_vagas)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT EXISTS (SELECT 1 FROM agendamentos x JOIN consulta_status cs ON cs.id = x.status_consulta_id
                  WHERE x.profissional_id = v.profissional_id AND x.ativo
                    AND cs.codigo NOT IN ('cancelado', 'erro', 'reagendado')
                    AND x.id IS DISTINCT FROM v.agendamento_origem_id
                    AND abs(extract(epoch FROM (x.data_hora AT TIME ZONE 'UTC') - v.data_hora)) < 1800)
      OR EXISTS (SELECT 1 FROM ju_reservas r
                  WHERE r.profissional_id = v.profissional_id
                    AND (r.status = 'pendente' OR (r.status = 'aguardando_cadastro' AND r.expira_em > now()))
                    AND abs(extract(epoch FROM (r.data_hora AT TIME ZONE 'UTC') - v.data_hora)) < 1800);
$$;

-- ============================================================ card da vaga
CREATE OR REPLACE FUNCTION public.fn_le_vaga_card(p_vaga_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v lista_espera_vagas; c lista_espera; a agendamentos; v_prof text; v_txt text; v_bot text[];
  v_atual timestamp; v_cadeia text; v_outros text; v_pode_oferecer boolean;
BEGIN
  SELECT * INTO v FROM lista_espera_vagas WHERE id = p_vaga_id;
  SELECT * INTO c FROM lista_espera WHERE id = v.candidato_id;
  IF c.id IS NULL THEN RETURN; END IF;
  SELECT split_part(btrim(nome), ' ', 1) INTO v_prof FROM pessoas WHERE id = v.profissional_id;
  IF c.agendamento_atual_id IS NOT NULL THEN
    SELECT * INTO a FROM agendamentos WHERE id = c.agendamento_atual_id;
    v_atual := a.data_hora AT TIME ZONE 'UTC';
  END IF;
  v_pode_oferecer := c.conversa_id IS NOT NULL OR c.telefone IS NOT NULL
                     OR (c.paciente_id IS NOT NULL AND cardinality(fn_le_conversas_do_paciente(c.paciente_id)) > 0);

  v_txt := CASE WHEN v.status = 'oferecida' THEN '📲 *Horário oferecido*' ELSE '🟢 *Vagou um horário*' END || E'\n'
        || fn_ju_quando(v.data_hora) || coalesce(' · ' || v_prof, '') || ' · '
        || CASE v.tipo WHEN 'respiratoria' THEN 'respiratória' ELSE 'motora' END || E'\n\n';

  IF v.status = 'oferecida' THEN
    v_txt := v_txt || 'Mandei para a família de *' || c.nome || '* às '
          || to_char(v.oferta_em AT TIME ZONE 'America/Sao_Paulo', 'HH24"h"MI') || '. '
          || CASE WHEN a.id IS NOT NULL THEN 'Se aceitarem, chega aqui o card de troca para confirmar.'
                  ELSE 'Se aceitarem, a Ju abre o pedido para marcar.' END;
    v_bot := CASE WHEN a.id IS NOT NULL THEN ARRAY['🔁 Já combinei, trocar|ju_vg_tr:' || v.id] ELSE '{}' END
             || ARRAY['➡️ Próximo da lista|ju_vg_desc:' || v.id];
  ELSE
    v_txt := v_txt || '👉 *' || c.nome || '*' || CASE WHEN c.urgente THEN ' 🔴' ELSE '' END
          || CASE WHEN a.id IS NOT NULL
                  THEN ' (marcado ' || fn_ju_quando(v_atual) || coalesce(', prefere ' || nullif(btrim(c.preferencia), ''), '') || ')'
                  ELSE coalesce(', ' || c.idade, '') || coalesce(' · ' || nullif(btrim(c.queixa), ''), '')
                       || coalesce(E'\n' || '   prefere ' || nullif(btrim(c.preferencia), ''), '') END;
    IF a.id IS NOT NULL THEN
      SELECT x.nome INTO v_cadeia FROM fn_le_candidatos(v.profissional_id, v_atual, v.tipo, c.paciente_id, ARRAY[c.id]) x LIMIT 1;
      v_txt := v_txt || E'\n' || '↪️ Se trocar, vaga ' || fn_ju_quando(v_atual)
            || CASE WHEN v_cadeia IS NOT NULL THEN ': *' || v_cadeia || '* quer esse horário.'
                    ELSE ' e ninguém da lista quer esse horário (fica furo).' END;
    END IF;
    SELECT string_agg(x.nome, ', ') INTO v_outros
      FROM (SELECT y.nome FROM fn_le_candidatos(v.profissional_id, v.data_hora, v.tipo,
                                                (SELECT paciente_id FROM agendamentos WHERE id = v.agendamento_origem_id),
                                                v.descartados || c.id) y LIMIT 4) x;
    v_txt := v_txt || coalesce(E'\n' || 'Outros na lista para esse horário: ' || v_outros, '')
          || CASE WHEN a.id IS NULL THEN E'\n\n' || '_Combinou direto? Marque na agenda: o card some sozinho._' ELSE '' END;
    v_bot := CASE WHEN v_pode_oferecer THEN ARRAY['📲 Oferecer horário|ju_vg_of:' || v.id] ELSE '{}' END
          || CASE WHEN a.id IS NOT NULL THEN ARRAY['🔁 Já combinei, trocar|ju_vg_tr:' || v.id] ELSE '{}' END
          || ARRAY['❌ Descartar|ju_vg_desc:' || v.id];
  END IF;
  UPDATE lista_espera_vagas SET card_req_id = fn_le_card(v_txt, v_bot), card_msg_id = NULL WHERE id = v.id;
END $$;

-- Abre a vaga se alguém da lista combina com o horário (2 h a 7 dias à frente).
CREATE OR REPLACE FUNCTION public.fn_le_vaga_abrir(p_ag uuid, p_prof uuid, p_dh timestamp, p_tipo text, p_paciente uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo'; v_cand bigint; v_id bigint;
BEGIN
  IF p_tipo IS NULL OR p_prof IS NULL OR p_dh < v_agora + interval '2 hours' OR p_dh > v_agora + interval '7 days' THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM lista_espera_vagas WHERE profissional_id = p_prof AND data_hora = p_dh AND status IN ('aberta', 'oferecida')) THEN
    RETURN NULL;
  END IF;
  SELECT id INTO v_cand FROM fn_le_candidatos(p_prof, p_dh, p_tipo, p_paciente, '{}') LIMIT 1;
  IF v_cand IS NULL THEN RETURN NULL; END IF;
  INSERT INTO lista_espera_vagas (agendamento_origem_id, profissional_id, data_hora, tipo, candidato_id)
  VALUES (p_ag, p_prof, p_dh, p_tipo, v_cand) RETURNING id INTO v_id;
  PERFORM fn_le_vaga_card(v_id);
  RETURN v_id;
END $$;

-- Próximo da lista (ou fecha a vaga quando ninguém mais combina).
CREATE OR REPLACE FUNCTION public.fn_le_vaga_avancar(p_vaga_id bigint, p_quem text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v lista_espera_vagas; v_cand bigint;
BEGIN
  SELECT * INTO v FROM lista_espera_vagas WHERE id = p_vaga_id FOR UPDATE;
  PERFORM fn_le_apagar(v.card_msg_id, v.card_req_id);
  v.descartados := v.descartados || coalesce(v.candidato_id, 0::bigint);
  SELECT id INTO v_cand FROM fn_le_candidatos(v.profissional_id, v.data_hora, v.tipo,
                                              (SELECT paciente_id FROM agendamentos WHERE id = v.agendamento_origem_id),
                                              v.descartados) LIMIT 1;
  UPDATE lista_espera_vagas
     SET descartados = v.descartados, candidato_id = v_cand, card_req_id = NULL, card_msg_id = NULL,
         status = CASE WHEN v_cand IS NULL THEN 'sem_candidatos' ELSE 'aberta' END,
         oferta_conversa_id = NULL, oferta_em = NULL,
         resolvido_por = CASE WHEN v_cand IS NULL THEN p_quem END,
         resolvido_em = CASE WHEN v_cand IS NULL THEN now() END
   WHERE id = v.id;
  IF v_cand IS NOT NULL THEN PERFORM fn_le_vaga_card(v.id); END IF;
END $$;

-- 📲 Oferecer horário: a Ju escreve à família (a resposta cai no atendimento com oferta_vaga nos dados).
CREATE OR REPLACE FUNCTION public.fn_le_vaga_oferecer(p_vaga_id bigint, p_quem text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v lista_espera_vagas; c lista_espera; a agendamentos; conv ju_conversas; v_prof text; v_pac text;
  v_txt text; v_chat text; v_tok text := fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
BEGIN
  SELECT * INTO v FROM lista_espera_vagas WHERE id = p_vaga_id FOR UPDATE;
  SELECT * INTO c FROM lista_espera WHERE id = v.candidato_id;
  IF c.id IS NULL OR c.removido_em IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'texto', '⚠️ Essa pessoa já saiu da lista. Toque em Descartar para ver a próxima.');
  END IF;
  IF v_tok IS NULL THEN RETURN jsonb_build_object('ok', false, 'texto', '⚠️ WhatsApp sem conexão. Ofereça pela conversa.'); END IF;
  SELECT * INTO conv FROM ju_conversas
   WHERE id = coalesce(c.conversa_id, (fn_le_conversas_do_paciente(c.paciente_id))[1])
      OR (c.conversa_id IS NULL AND c.paciente_id IS NULL AND fn_atrib_tel_chave(telefone) = fn_atrib_tel_chave(c.telefone))
   ORDER BY ultima_mensagem_cliente DESC NULLS LAST LIMIT 1;
  v_chat := coalesce(conv.wa_chatid, CASE WHEN c.telefone IS NOT NULL THEN regexp_replace(c.telefone, '\D', '', 'g') || '@s.whatsapp.net' END);
  IF v_chat IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'texto', '⚠️ Não achei o WhatsApp de ' || c.nome || '. Ofereça pela conversa.');
  END IF;
  IF conv.sem_ia THEN
    RETURN jsonb_build_object('ok', false, 'texto', '⚠️ A conversa de ' || c.nome || ' está sem IA. Ofereça por lá.');
  END IF;
  SELECT split_part(btrim(nome), ' ', 1) INTO v_prof FROM pessoas WHERE id = v.profissional_id;
  v_pac := split_part(btrim(coalesce((SELECT nome FROM pessoas WHERE id = c.paciente_id), c.nome)), ' ', 1);
  SELECT * INTO a FROM agendamentos WHERE id = c.agendamento_atual_id;
  v_txt := 'Oi! Abriu um horário ' || fn_le_quando(v.data_hora) || ' com a ' || v_prof
        || CASE WHEN a.id IS NOT NULL
                THEN '. A consulta de ' || v_pac || ' está marcada para ' || fn_le_quando(a.data_hora AT TIME ZONE 'UTC')
                     || '. Quer trocar para esse horário? É só me responder por aqui.'
                ELSE ' para o atendimento de ' || v_pac || '. Quer esse horário? É só me responder por aqui que a equipe confirma.' END;
  -- o eco volta pela Entrada e fica no histórico como mensagem da Ju
  IF conv.id IS NOT NULL THEN
    UPDATE ju_conversas
       SET resposta_pendente = concat_ws(E'\x1f', CASE WHEN resposta_pendente_em > now() - interval '5 minutes' THEN resposta_pendente END, v_txt),
           resposta_pendente_em = now()
     WHERE id = conv.id;
  END IF;
  PERFORM net.http_post(url := 'https://infuse.uazapi.com/send/text',
    body := jsonb_build_object('number', v_chat, 'text', '*Ju:*' || E'\n' || v_txt),
    headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
    timeout_milliseconds := 20000);
  PERFORM fn_le_apagar(v.card_msg_id, v.card_req_id);
  UPDATE lista_espera_vagas SET status = 'oferecida', oferta_conversa_id = conv.id, oferta_em = now(), oferta_por = p_quem,
         card_req_id = NULL, card_msg_id = NULL
   WHERE id = v.id;
  PERFORM fn_le_vaga_card(v.id);
  RETURN jsonb_build_object('ok', true, 'silencioso', true);
END $$;

-- 🔁 Já combinei, trocar: move a consulta atual do candidato para o horário vago.
CREATE OR REPLACE FUNCTION public.fn_le_vaga_trocar(p_vaga_id bigint, p_quem text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v lista_espera_vagas; c lista_espera; a agendamentos; v_pac text;
BEGIN
  SELECT * INTO v FROM lista_espera_vagas WHERE id = p_vaga_id FOR UPDATE;
  SELECT * INTO c FROM lista_espera WHERE id = v.candidato_id;
  SELECT * INTO a FROM agendamentos WHERE id = c.agendamento_atual_id;
  IF a.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'texto', '⚠️ ' || coalesce(c.nome, 'Essa pessoa') || ' não tem consulta para trocar. Marque o horário na agenda.');
  END IF;
  SELECT split_part(btrim(nome), ' ', 1) INTO v_pac FROM pessoas WHERE id = a.paciente_id;
  IF NOT a.ativo OR (SELECT codigo FROM consulta_status WHERE id = a.status_consulta_id) NOT IN ('agendado', 'confirmado') THEN
    RETURN jsonb_build_object('ok', false, 'texto', '⚠️ A consulta de ' || v_pac || ' não está mais marcada. Nada foi alterado.');
  END IF;
  IF a.profissional_id <> v.profissional_id OR fn_le_vaga_ocupada(v) OR NOT fn_ju_troca_livre(a.id, v.data_hora) THEN
    RETURN jsonb_build_object('ok', false, 'texto', '⚠️ ' || fn_ju_quando(v.data_hora) || ' não está mais livre para ' || v_pac || '. Nada foi alterado.');
  END IF;
  UPDATE agendamentos
     SET data_hora = v.data_hora AT TIME ZONE 'UTC',
         observacao = concat_ws(' ', nullif(btrim(observacao), ''),
           '[Lista de espera] trocado de ' || fn_ju_quando(a.data_hora AT TIME ZONE 'UTC') || ' por ' || coalesce(p_quem, 'equipe') || '.'),
         updated_at = now()
   WHERE id = a.id;
  PERFORM fn_le_apagar(v.card_msg_id, v.card_req_id);
  UPDATE lista_espera_vagas SET status = 'trocada', resolvido_por = p_quem, resolvido_em = now(), card_req_id = NULL, card_msg_id = NULL
   WHERE id = v.id;
  RETURN jsonb_build_object('ok', true, 'silencioso', true);
END $$;

-- ============================================================ botões (vêm por fn_ju_reserva_botao)
CREATE OR REPLACE FUNCTION public.fn_lista_espera_botao(p_botao text, p_quem text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_acao text := split_part(p_botao, ':', 1); v_id bigint := nullif(split_part(p_botao, ':', 2), '')::bigint;
  s lista_espera_sugestoes; v lista_espera_vagas; v_le bigint; v_quem text := coalesce(nullif(btrim(p_quem), ''), 'equipe');
BEGIN
  IF v_quem ~* '^(respira|recep|alguém|alguem)' THEN v_quem := 'Recepção'; END IF;

  IF v_acao IN ('ju_le_inc', 'ju_le_desc', 'ju_le_ok', 'ju_le_tirar') THEN
    SELECT * INTO s FROM lista_espera_sugestoes WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'texto', '⚠️ Não achei esse card.'); END IF;
    PERFORM fn_le_apagar(s.card_msg_id, s.card_req_id);
    IF v_acao = 'ju_le_inc' THEN
      IF s.status <> 'pendente' THEN RETURN jsonb_build_object('ok', true, 'silencioso', true); END IF;
      INSERT INTO lista_espera (tipo, nome, paciente_id, telefone, queixa, preferencia, conversa_id, incluido_por,
                                agendamento_atual_id, pref_data, pref_dias, pref_hora_ini, pref_hora_fim, pref_profissional_id, origem, urgente)
      VALUES (s.tipo, s.nome, s.paciente_id, s.telefone,
              CASE WHEN s.agendamento_id IS NOT NULL
                   THEN 'troca de horário (marcado ' || fn_ju_quando((SELECT data_hora AT TIME ZONE 'UTC' FROM agendamentos WHERE id = s.agendamento_id)) || ')' END,
              s.preferencia, s.conversa_id, v_quem, s.agendamento_id, s.pref_data, s.pref_dias, s.pref_hora_ini, s.pref_hora_fim,
              s.pref_profissional_id, 'ju_detectou', s.urgente)
      RETURNING id INTO v_le;
      UPDATE lista_espera_sugestoes SET status = 'incluida', decidido_por = v_quem, decidido_em = now(), lista_espera_id = v_le,
             card_req_id = NULL, card_msg_id = NULL WHERE id = s.id;
      PERFORM fn_lista_espera_marcar();
    ELSIF v_acao = 'ju_le_desc' THEN
      UPDATE lista_espera_sugestoes SET status = CASE WHEN status = 'pendente' THEN 'descartada' ELSE status END,
             decidido_por = coalesce(decidido_por, v_quem), decidido_em = coalesce(decidido_em, now()), card_req_id = NULL, card_msg_id = NULL
       WHERE id = s.id;
    ELSIF v_acao = 'ju_le_tirar' THEN
      UPDATE lista_espera SET removido_em = now(), removido_por = v_quem, removido_motivo = 'tirado pela equipe'
       WHERE id = s.lista_espera_id AND removido_em IS NULL;
      UPDATE lista_espera_sugestoes SET status = 'descartada', decidido_por = v_quem, decidido_em = now(), card_req_id = NULL, card_msg_id = NULL
       WHERE id = s.id;
      PERFORM fn_lista_espera_marcar();
    ELSE
      UPDATE lista_espera_sugestoes SET card_req_id = NULL, card_msg_id = NULL WHERE id = s.id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'silencioso', true);
  END IF;

  SELECT * INTO v FROM lista_espera_vagas WHERE id = v_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'texto', '⚠️ Não achei essa vaga.'); END IF;
  IF v.status NOT IN ('aberta', 'oferecida') THEN
    PERFORM fn_le_apagar(v.card_msg_id, v.card_req_id);
    RETURN jsonb_build_object('ok', true, 'silencioso', true);
  END IF;
  IF v.data_hora < (now() AT TIME ZONE 'America/Sao_Paulo') + interval '30 minutes' OR fn_le_vaga_ocupada(v) THEN
    PERFORM fn_le_apagar(v.card_msg_id, v.card_req_id);
    UPDATE lista_espera_vagas SET status = CASE WHEN fn_le_vaga_ocupada(v) THEN 'preenchida' ELSE 'expirada' END,
           resolvido_em = now(), card_req_id = NULL, card_msg_id = NULL WHERE id = v.id;
    RETURN jsonb_build_object('ok', false, 'texto', '⚠️ ' || fn_ju_quando(v.data_hora) || ' já foi ocupado ou passou. Card retirado.');
  END IF;
  IF v_acao = 'ju_vg_of' THEN RETURN fn_le_vaga_oferecer(v.id, v_quem); END IF;
  IF v_acao = 'ju_vg_tr' THEN RETURN fn_le_vaga_trocar(v.id, v_quem); END IF;
  IF v_acao = 'ju_vg_desc' THEN
    PERFORM fn_le_vaga_avancar(v.id, v_quem);
    RETURN jsonb_build_object('ok', true, 'silencioso', true);
  END IF;
  RETURN jsonb_build_object('ok', false, 'texto', '⚠️ Botão desconhecido.');
END $$;

-- ============================================================ oferta em aberto (vai para os dados do turno da Ju)
CREATE OR REPLACE FUNCTION public.fn_lista_espera_oferta(p_conversa_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT jsonb_build_object(
           'quando', fn_ju_quando(v.data_hora), 'data', to_char(v.data_hora, 'YYYY-MM-DD'), 'hora', to_char(v.data_hora, 'HH24:MI'),
           'fisio', split_part(btrim(p.nome), ' ', 1), 'paciente', c.nome, 'agendamento_id', c.agendamento_atual_id,
           'instrucao',
           CASE WHEN c.agendamento_atual_id IS NOT NULL
                THEN 'A equipe ofereceu à família o horário que vagou (' || fn_ju_quando(v.data_hora) || ' com a ' || split_part(btrim(p.nome), ' ', 1)
                     || ') no lugar da consulta de ' || fn_ju_quando(a.data_hora AT TIME ZONE 'UTC')
                     || '. Se a família aceitar, use trocar_horario com esse agendamento_id, data e hora: a equipe confirma pelo grupo e você só diz que vai confirmar e avisa. Se recusar, agradeça e diga que a consulta continua como está. Não ofereça outros horários.'
                ELSE 'A equipe ofereceu à família o horário que vagou (' || fn_ju_quando(v.data_hora) || ' com a ' || split_part(btrim(p.nome), ' ', 1)
                     || '). Se a família aceitar, chame a secretaria (AGENDAMENTO) dizendo que aceitou esse horário e diga que a equipe confirma por aqui. Se recusar, agradeça e diga que continua na lista de espera. Não ofereça outros horários.' END)
    FROM lista_espera_vagas v
    JOIN lista_espera c ON c.id = v.candidato_id
    JOIN pessoas p ON p.id = v.profissional_id
    LEFT JOIN agendamentos a ON a.id = c.agendamento_atual_id
   WHERE v.oferta_conversa_id = p_conversa_id AND v.status = 'oferecida' AND v.oferta_em > now() - interval '24 hours'
     AND v.data_hora > now() AT TIME ZONE 'America/Sao_Paulo'
   ORDER BY v.oferta_em DESC LIMIT 1;
$$;

-- ============================================================ gatilhos da agenda
-- Vagou: cancelou, remarcou, desativou ou trocou de fisio (o horário antigo fica livre).
CREATE OR REPLACE FUNCTION public.trg_lista_espera_vagou()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM lista_espera WHERE removido_em IS NULL) THEN RETURN NEW; END IF;
  BEGIN
    IF NOT OLD.ativo OR (SELECT codigo FROM consulta_status WHERE id = OLD.status_consulta_id) NOT IN ('agendado', 'confirmado') THEN
      RETURN NEW;
    END IF;
    IF NEW.ativo AND (SELECT codigo FROM consulta_status WHERE id = NEW.status_consulta_id) IN ('agendado', 'confirmado')
       AND NEW.data_hora = OLD.data_hora AND NEW.profissional_id IS NOT DISTINCT FROM OLD.profissional_id THEN
      RETURN NEW;
    END IF;
    PERFORM fn_le_vaga_abrir(OLD.id, OLD.profissional_id, OLD.data_hora AT TIME ZONE 'UTC',
                             fn_lista_espera_tipo_servico(OLD.tipo_servico_id), OLD.paciente_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_lista_espera_vagou: %', SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lista_espera_vagou ON public.agendamentos;
CREATE TRIGGER trg_lista_espera_vagou AFTER UPDATE OF status_consulta_id, data_hora, ativo, profissional_id ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.trg_lista_espera_vagou();

-- Saiu da lista: consulta marcada. Pedido de troca (agendamento_atual_id) só sai quando a própria
-- consulta muda de horário ou quando a criança ganha uma consulta no horário que queria.
CREATE OR REPLACE FUNCTION public.trg_lista_espera_agendou()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_tipo text; v_tels text[]; v_n int; v_dh timestamp := NEW.data_hora AT TIME ZONE 'UTC';
BEGIN
  IF NOT NEW.ativo OR NOT EXISTS (SELECT 1 FROM lista_espera WHERE removido_em IS NULL) THEN RETURN NEW; END IF;
  IF (SELECT codigo FROM consulta_status WHERE id = NEW.status_consulta_id) NOT IN ('agendado', 'confirmado') THEN RETURN NEW; END IF;
  BEGIN
    v_tipo := fn_lista_espera_tipo_servico(NEW.tipo_servico_id);
    SELECT array_agg(DISTINCT fn_lista_espera_tel(t)) INTO v_tels FROM (
      SELECT p.telefone::text AS t FROM pessoas p WHERE p.id = NEW.paciente_id
      UNION ALL
      SELECT r.telefone::text FROM pessoa_responsaveis pr JOIN pessoas r ON r.id = pr.id_responsavel
       WHERE pr.id_pessoa = NEW.paciente_id AND pr.ativo IS NOT FALSE) x WHERE t IS NOT NULL;
    UPDATE lista_espera l
       SET removido_em = now(), removido_por = 'sistema',
           removido_motivo = CASE WHEN l.agendamento_atual_id IS NOT NULL THEN 'troca feita' ELSE 'consulta marcada' END,
           agendamento_id = NEW.id, paciente_id = coalesce(l.paciente_id, NEW.paciente_id)
     WHERE l.removido_em IS NULL
       AND (v_tipo IS NULL OR l.tipo = v_tipo)
       AND (l.paciente_id = NEW.paciente_id OR (l.paciente_id IS NULL AND l.telefone = ANY (coalesce(v_tels, '{}'))))
       AND (l.agendamento_atual_id IS NULL
            OR (TG_OP = 'UPDATE' AND l.agendamento_atual_id = NEW.id)
            OR ((l.pref_data IS NULL OR l.pref_data = v_dh::date)
                AND (l.pref_dias IS NULL OR extract(isodow FROM v_dh)::int = ANY (l.pref_dias))
                AND l.pref_hora_ini IS NOT NULL
                AND v_dh::time BETWEEN l.pref_hora_ini - interval '30 minutes' AND coalesce(l.pref_hora_fim, l.pref_hora_ini) + interval '30 minutes'));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN PERFORM fn_lista_espera_marcar(); END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_lista_espera_agendou: %', SQLERRM;
  END;
  RETURN NEW;
END $$;

-- Marcou ou remarcou: a Ju lê a conversa da família 3 min depois (a família pode ter pedido outro horário).
CREATE OR REPLACE FUNCTION public.trg_lista_espera_analisar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_conv bigint; v_dh timestamp := NEW.data_hora AT TIME ZONE 'UTC'; v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
BEGIN
  BEGIN
    IF NOT NEW.ativo OR v_dh < v_agora OR v_dh > v_agora + interval '30 days'
       OR fn_lista_espera_tipo_servico(NEW.tipo_servico_id) IS NULL
       OR (SELECT codigo FROM consulta_status WHERE id = NEW.status_consulta_id) NOT IN ('agendado', 'confirmado') THEN
      RETURN NEW;
    END IF;
    SELECT c.id INTO v_conv FROM ju_conversas c
     WHERE c.id = ANY (fn_le_conversas_do_paciente(NEW.paciente_id)) AND NOT c.sem_ia
       AND c.ultima_mensagem_cliente > now() - interval '3 days'
     ORDER BY c.ultima_mensagem_cliente DESC LIMIT 1;
    IF v_conv IS NULL THEN RETURN NEW; END IF;
    -- uma análise pendente por conversa basta (lote de sessões gera um só card)
    IF EXISTS (SELECT 1 FROM lista_espera_analises WHERE conversa_id = v_conv AND processado_em IS NULL) THEN RETURN NEW; END IF;
    INSERT INTO lista_espera_analises (motivo, conversa_id, agendamento_id, data_hora_antes)
    VALUES (CASE WHEN TG_OP = 'UPDATE' THEN 'remarcou' ELSE 'agendou' END, v_conv, NEW.id,
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.data_hora AT TIME ZONE 'UTC' END);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_lista_espera_analisar: %', SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lista_espera_analisar ON public.agendamentos;
CREATE TRIGGER trg_lista_espera_analisar AFTER INSERT ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.trg_lista_espera_analisar();
DROP TRIGGER IF EXISTS trg_lista_espera_analisar_upd ON public.agendamentos;
CREATE TRIGGER trg_lista_espera_analisar_upd AFTER UPDATE OF data_hora ON public.agendamentos
  FOR EACH ROW WHEN (OLD.data_hora IS DISTINCT FROM NEW.data_hora) EXECUTE FUNCTION public.trg_lista_espera_analisar();

-- ============================================================ análise pela IA (edge lista-espera-ju)
CREATE OR REPLACE FUNCTION public.fn_lista_espera_analises_pegar(p_limite int DEFAULT 5)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE r record; v_out jsonb := '[]'::jsonb; a agendamentos; s ju_solicitacoes;
BEGIN
  FOR r IN SELECT * FROM lista_espera_analises
            WHERE processado_em IS NULL AND processar_apos <= now() AND tentativas < 3
              AND (pego_em IS NULL OR pego_em < now() - interval '5 minutes')
            ORDER BY processar_apos LIMIT p_limite FOR UPDATE SKIP LOCKED LOOP
    UPDATE lista_espera_analises SET pego_em = now(), tentativas = tentativas + 1 WHERE id = r.id;
    a := NULL; s := NULL;
    SELECT * INTO a FROM agendamentos WHERE id = r.agendamento_id;
    SELECT * INTO s FROM ju_solicitacoes WHERE id = r.solicitacao_id;
    v_out := v_out || jsonb_build_object(
      'id', r.id, 'motivo', r.motivo,
      'agora', fn_ju_quando((now() AT TIME ZONE 'America/Sao_Paulo')::timestamp(0)) || '/' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY'),
      'consulta', CASE WHEN a.id IS NOT NULL THEN jsonb_build_object(
          'paciente', (SELECT nome FROM pessoas WHERE id = a.paciente_id),
          'fisio', (SELECT split_part(btrim(nome), ' ', 1) FROM pessoas WHERE id = a.profissional_id),
          'quando', fn_ju_quando(a.data_hora AT TIME ZONE 'UTC'),
          'antes', CASE WHEN r.data_hora_antes IS NOT NULL THEN fn_ju_quando(r.data_hora_antes) END,
          'servico', (SELECT nome FROM tipo_servicos WHERE id = a.tipo_servico_id)) END,
      'pedido', CASE WHEN s.id IS NOT NULL THEN jsonb_build_object('resumo', s.resumo, 'urgente', s.urgente) END,
      'mensagens', coalesce((
        SELECT jsonb_agg(x.l ORDER BY x.created_at) FROM (
          SELECT m.created_at,
                 to_char(m.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') || ' '
                 || CASE m.origem WHEN 'CLIENTE' THEN 'FAMÍLIA' WHEN 'HUMANO' THEN 'EQUIPE' WHEN 'JU' THEN 'JU' ELSE 'AUTOMÁTICO' END
                 || ': ' || left(regexp_replace(coalesce(m.conteudo, ''), '\s+', ' ', 'g'), 400) AS l
            FROM ju_mensagens m
           WHERE m.conversa_id = r.conversa_id AND m.created_at > now() - interval '4 days' AND m.conteudo IS NOT NULL
           ORDER BY m.created_at DESC LIMIT 60) x), '[]'::jsonb));
  END LOOP;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.fn_lista_espera_analise_registrar(p_id bigint, p_res jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  r lista_espera_analises; a agendamentos; conv ju_conversas; v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_data date; v_ini time; v_fim time; v_dias int[]; v_prof uuid; v_tipo text; v_nome text; v_pref text; v_sug bigint; v_le bigint;
  v_txt text; v_meses int; v_urg boolean;
BEGIN
  SELECT * INTO r FROM lista_espera_analises WHERE id = p_id FOR UPDATE;
  IF r.id IS NULL OR r.processado_em IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'ja_processada'); END IF;
  UPDATE lista_espera_analises SET processado_em = now(), resultado = p_res WHERE id = r.id;
  SELECT * INTO conv FROM ju_conversas WHERE id = r.conversa_id;
  BEGIN v_data := nullif(p_res ->> 'data', '')::date; EXCEPTION WHEN OTHERS THEN v_data := NULL; END;
  BEGIN v_ini := nullif(p_res ->> 'hora_ini', '')::time; EXCEPTION WHEN OTHERS THEN v_ini := NULL; END;
  BEGIN v_fim := nullif(p_res ->> 'hora_fim', '')::time; EXCEPTION WHEN OTHERS THEN v_fim := NULL; END;
  BEGIN
    SELECT array_agg(DISTINCT d::int ORDER BY d::int) INTO v_dias FROM jsonb_array_elements_text(coalesce(p_res -> 'dias_semana', '[]')) d WHERE d ~ '^[1-7]$';
  EXCEPTION WHEN OTHERS THEN v_dias := NULL; END;
  IF nullif(btrim(p_res ->> 'profissional'), '') IS NOT NULL THEN
    -- quem atendeu nos últimos 120 dias, pelo primeiro nome (a dona é admin e também atende)
    SELECT p.id INTO v_prof FROM pessoas p
     WHERE p.id IN (SELECT DISTINCT profissional_id FROM agendamentos WHERE ativo AND data_hora > now() - interval '120 days')
       AND public.unaccent(lower(split_part(btrim(p.nome), ' ', 1))) = public.unaccent(lower(split_part(btrim(p_res ->> 'profissional'), ' ', 1)))
     LIMIT 1;
  END IF;
  v_pref := nullif(btrim(left(p_res ->> 'preferencia_texto', 120)), '');

  IF r.motivo IN ('agendou', 'remarcou') THEN
    IF coalesce((p_res ->> 'quer_outro_horario')::boolean, false) IS NOT TRUE OR v_pref IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'acao', 'nada');
    END IF;
    SELECT * INTO a FROM agendamentos WHERE id = r.agendamento_id;
    IF a.id IS NULL OR NOT a.ativo THEN RETURN jsonb_build_object('ok', true, 'acao', 'consulta_sumiu'); END IF;
    IF v_data IS NOT NULL AND (v_data < v_agora::date OR (v_data = v_agora::date AND coalesce(v_fim, v_ini, time '23:59') < v_agora::time)) THEN
      RETURN jsonb_build_object('ok', true, 'acao', 'preferencia_passou');
    END IF;
    IF v_data IS NULL AND v_ini IS NULL AND v_dias IS NULL THEN RETURN jsonb_build_object('ok', true, 'acao', 'sem_preferencia_util'); END IF;
    v_tipo := fn_lista_espera_tipo_servico(a.tipo_servico_id);
    -- já está na lista ou a mesma sugestão foi descartada há pouco
    IF EXISTS (SELECT 1 FROM lista_espera WHERE removido_em IS NULL AND paciente_id = a.paciente_id AND tipo = v_tipo)
       OR EXISTS (SELECT 1 FROM lista_espera_sugestoes WHERE paciente_id = a.paciente_id AND created_at > now() - interval '7 days'
                    AND (status = 'pendente' OR (status = 'descartada' AND pref_data IS NOT DISTINCT FROM v_data AND pref_hora_ini IS NOT DISTINCT FROM v_ini))) THEN
      RETURN jsonb_build_object('ok', true, 'acao', 'ja_tratado');
    END IF;
    SELECT split_part(btrim(nome), ' ', 1) || coalesce(' ' || nullif(split_part(btrim(nome), ' ', 2), ''), '') INTO v_nome FROM pessoas WHERE id = a.paciente_id;
    INSERT INTO lista_espera_sugestoes (analise_id, conversa_id, agendamento_id, paciente_id, tipo, nome, telefone, preferencia, evidencia,
                                        pref_data, pref_dias, pref_hora_ini, pref_hora_fim, pref_profissional_id)
    VALUES (r.id, r.conversa_id, a.id, a.paciente_id, v_tipo, v_nome, fn_lista_espera_tel(conv.telefone), v_pref,
            nullif(btrim(left(p_res ->> 'evidencia', 160)), ''), v_data, v_dias, v_ini, coalesce(v_fim, v_ini),
            coalesce(v_prof, CASE WHEN coalesce((p_res ->> 'mesma_fisio')::boolean, true) THEN a.profissional_id END))
    RETURNING id INTO v_sug;
    v_txt := '📝 *Preferência de horário*' || E'\n'
          || v_nome || ' · ' || (SELECT split_part(btrim(nome), ' ', 1) FROM pessoas WHERE id = a.profissional_id) || E'\n'
          || 'Queria: ' || v_pref || E'\n'
          || 'Ficou: ' || fn_ju_quando(a.data_hora AT TIME ZONE 'UTC')
          || coalesce(E'\n' || '💬 _"' || nullif(btrim(left(p_res ->> 'evidencia', 160)), '') || '"_', '') || E'\n\n'
          || 'Coloco na lista de espera? Se vagar, aviso aqui.';
    UPDATE lista_espera_sugestoes SET card_req_id = fn_le_card(v_txt, ARRAY['✅ Incluir|ju_le_inc:' || v_sug, '❌ Descartar|ju_le_desc:' || v_sug])
     WHERE id = v_sug;
    RETURN jsonb_build_object('ok', true, 'acao', 'sugestao', 'sugestao_id', v_sug);
  END IF;

  -- urgente: caso urgente sem horário entra sozinho na lista
  v_meses := CASE WHEN p_res ->> 'idade_meses' ~ '^\d{1,3}$' THEN (p_res ->> 'idade_meses')::int END;
  v_urg := coalesce((p_res ->> 'urgente')::boolean, false) OR coalesce(v_meses < 6, false);
  IF NOT v_urg OR nullif(btrim(p_res ->> 'nome'), '') IS NULL THEN RETURN jsonb_build_object('ok', true, 'acao', 'nada'); END IF;
  IF EXISTS (SELECT 1 FROM lista_espera WHERE conversa_id = r.conversa_id AND created_at > now() - interval '7 days')
     OR EXISTS (SELECT 1 FROM lista_espera WHERE removido_em IS NULL AND telefone = fn_lista_espera_tel(conv.telefone)) THEN
    RETURN jsonb_build_object('ok', true, 'acao', 'ja_na_lista');
  END IF;
  v_tipo := CASE WHEN p_res ->> 'tipo' = 'motora' THEN 'motora' ELSE 'respiratoria' END;
  v_nome := left(btrim(p_res ->> 'nome'), 60);
  INSERT INTO lista_espera (tipo, nome, telefone, idade, idade_meses, pediatra, queixa, urgente, urgencia_motivo, conversa_id, incluido_por,
                            preferencia, pref_data, pref_dias, pref_hora_ini, pref_hora_fim, pref_profissional_id, origem)
  VALUES (v_tipo, v_nome, fn_lista_espera_tel(conv.telefone), nullif(btrim(left(p_res ->> 'idade', 30)), ''), v_meses,
          nullif(btrim(left(p_res ->> 'pediatra', 60)), ''), nullif(btrim(left(p_res ->> 'queixa', 80)), ''), true,
          nullif(btrim(left(p_res ->> 'motivo', 80)), ''), r.conversa_id, 'Ju', v_pref, NULL, v_dias, v_ini, coalesce(v_fim, v_ini), v_prof, 'urgente')
  RETURNING id INTO v_le;
  PERFORM fn_lista_espera_marcar();
  INSERT INTO lista_espera_sugestoes (analise_id, conversa_id, tipo, nome, telefone, preferencia, urgente, status, decidido_por, decidido_em, lista_espera_id)
  VALUES (r.id, r.conversa_id, v_tipo, v_nome, fn_lista_espera_tel(conv.telefone), v_pref, true, 'incluida', 'Ju', now(), v_le)
  RETURNING id INTO v_sug;
  v_txt := '🔴 *Caso urgente sem horário*' || E'\n'
        || v_nome || coalesce(', ' || nullif(btrim(p_res ->> 'idade'), ''), '') || coalesce(' · ' || nullif(btrim(p_res ->> 'queixa'), ''), '')
        || coalesce(E'\n' || 'Prefere ' || v_pref, '') || E'\n\n'
        || 'Coloquei na lista de espera. Se vagar um horário, aviso aqui.';
  UPDATE lista_espera_sugestoes SET card_req_id = fn_le_card(v_txt, ARRAY['👍 Ok|ju_le_ok:' || v_sug, '❌ Tirar da lista|ju_le_tirar:' || v_sug])
   WHERE id = v_sug;
  RETURN jsonb_build_object('ok', true, 'acao', 'urgente_incluido', 'lista_espera_id', v_le);
END $$;

-- ============================================================ tique de 1 min
CREATE OR REPLACE FUNCTION public.fn_lista_espera_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo'; v lista_espera_vagas; sg lista_espera_sugestoes;
  v_n int := 0; v_fila int; v_req bigint;
BEGIN
  -- id das mensagens dos cards (para poder apagar depois)
  UPDATE lista_espera_sugestoes SET card_msg_id = fn_le_msg_id(card_req_id)
   WHERE card_req_id IS NOT NULL AND card_msg_id IS NULL AND fn_le_msg_id(card_req_id) IS NOT NULL;
  UPDATE lista_espera_vagas SET card_msg_id = fn_le_msg_id(card_req_id)
   WHERE card_req_id IS NOT NULL AND card_msg_id IS NULL AND fn_le_msg_id(card_req_id) IS NOT NULL;

  -- vaga ocupada ou perto demais: card sai do grupo
  FOR v IN SELECT * FROM lista_espera_vagas WHERE status IN ('aberta', 'oferecida') LOOP
    IF fn_le_vaga_ocupada(v) OR v.data_hora < v_agora + interval '1 hour' THEN
      PERFORM fn_le_apagar(v.card_msg_id, v.card_req_id);
      UPDATE lista_espera_vagas SET status = CASE WHEN fn_le_vaga_ocupada(v) THEN 'preenchida' ELSE 'expirada' END,
             resolvido_em = now(), card_req_id = NULL, card_msg_id = NULL WHERE id = v.id;
      v_n := v_n + 1;
    END IF;
  END LOOP;

  -- sugestão sem resposta por 1 dia: card sai
  FOR sg IN SELECT * FROM lista_espera_sugestoes WHERE status = 'pendente' AND created_at < now() - interval '24 hours' LOOP
    PERFORM fn_le_apagar(sg.card_msg_id, sg.card_req_id);
    UPDATE lista_espera_sugestoes SET status = 'expirada', card_req_id = NULL, card_msg_id = NULL WHERE id = sg.id;
  END LOOP;
  -- card "caso urgente" some quando a criança sai da lista
  FOR sg IN SELECT s.* FROM lista_espera_sugestoes s JOIN lista_espera l ON l.id = s.lista_espera_id
             WHERE s.status = 'incluida' AND (s.card_req_id IS NOT NULL OR s.card_msg_id IS NOT NULL) AND l.removido_em IS NOT NULL LOOP
    PERFORM fn_le_apagar(sg.card_msg_id, sg.card_req_id);
    UPDATE lista_espera_sugestoes SET card_req_id = NULL, card_msg_id = NULL WHERE id = sg.id;
  END LOOP;

  -- preferência de data que passou / consulta que seria trocada não está mais marcada
  UPDATE lista_espera l SET removido_em = now(), removido_por = 'sistema',
         removido_motivo = CASE WHEN l.pref_data < v_agora::date THEN 'data pedida passou' ELSE 'consulta atual mudou' END
   WHERE l.removido_em IS NULL
     AND (l.pref_data < v_agora::date
          OR (l.agendamento_atual_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM agendamentos a JOIN consulta_status cs ON cs.id = a.status_consulta_id
                 WHERE a.id = l.agendamento_atual_id AND a.ativo AND cs.codigo IN ('agendado', 'confirmado')
                   AND (a.data_hora AT TIME ZONE 'UTC') > v_agora)));
  GET DIAGNOSTICS v_fila = ROW_COUNT;
  IF v_fila > 0 THEN PERFORM fn_lista_espera_marcar(); END IF;

  -- pedido de agendamento com cara de urgente, parado há 30 min sem consulta marcada: a Ju analisa
  INSERT INTO lista_espera_analises (motivo, conversa_id, solicitacao_id, processar_apos)
  SELECT 'urgente', s.conversa_id, s.id, now()
    FROM ju_solicitacoes s JOIN ju_conversas c ON c.id = s.conversa_id
   WHERE s.tipo = 'AGENDAMENTO' AND s.created_at BETWEEN now() - interval '48 hours' AND now() - interval '30 minutes'
     AND (s.urgente OR s.resumo ~* '(urg[eê]n|bronquiol|chiad|cansa|crise|intern|pronto[- ]?socorro|hospital|satura|oxig|febre)')
     AND NOT c.sem_ia
     AND NOT EXISTS (SELECT 1 FROM lista_espera_analises x WHERE x.solicitacao_id = s.id)
     AND NOT EXISTS (SELECT 1 FROM lista_espera l WHERE l.conversa_id = s.conversa_id AND l.created_at > now() - interval '7 days')
     AND NOT EXISTS (SELECT 1 FROM agendamentos a
                      WHERE a.paciente_id = ANY (fn_le_pacientes_da_conversa(s.conversa_id)) AND a.ativo
                        AND (a.created_at > s.created_at OR (a.data_hora AT TIME ZONE 'UTC') > v_agora))
  ON CONFLICT DO NOTHING;

  -- chama a IA quando há análise vencida
  IF EXISTS (SELECT 1 FROM lista_espera_analises WHERE processado_em IS NULL AND processar_apos <= now() AND tentativas < 3
               AND (pego_em IS NULL OR pego_em < now() - interval '5 minutes')) THEN
    v_req := net.http_post(
      url := 'https://jqegoentcusnbcykgtxg.supabase.co/functions/v1/lista-espera-ju',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', fn_email_boletos_token()),
      body := '{}'::jsonb, timeout_milliseconds := 120000);
  END IF;
  RETURN jsonb_build_object('vagas_fechadas', v_n, 'saiu_da_lista', v_fila, 'ia', v_req IS NOT NULL);
END $$;

-- ============================================================ funções existentes (troca de trecho)
DO $do$
DECLARE d text;
BEGIN
  -- 5. reserva da Ju: a oferta diz a fisio
  d := pg_get_functiondef('public.fn_ju_horarios_livres'::regproc);
  IF position($a$v_sug jsonb; v_sug_txt text;$a$ IN d) = 0
     OR position($a$SELECT * INTO cfg FROM public.ju_reserva_config WHERE id = 1;$a$ IN d) = 0
     OR position($a$'sugeridos', v_sug,
    'resposta', 'Ofereça primeiro estes dois horários (deixam a agenda da fisio corrida, sem buracos): ' || v_sug_txt$a$ IN d) = 0
     OR position($a$'. Fale de forma natural (ex.: "amanhã tem às 12h ou às 13h. Algum fica bom?"). '$a$ IN d) = 0 THEN
    RAISE EXCEPTION 'fn_ju_horarios_livres: trecho não encontrado';
  END IF;
  d := replace(d, $a$v_sug jsonb; v_sug_txt text;$a$, $a$v_sug jsonb; v_sug_txt text; v_fisio text;$a$);
  d := replace(d, $a$SELECT * INTO cfg FROM public.ju_reserva_config WHERE id = 1;$a$,
    $a$SELECT * INTO cfg FROM public.ju_reserva_config WHERE id = 1;
  SELECT split_part(btrim(nome), ' ', 1) INTO v_fisio FROM public.pessoas WHERE id = cfg.profissional_id;$a$);
  d := replace(d, $a$'sugeridos', v_sug,
    'resposta', 'Ofereça primeiro estes dois horários (deixam a agenda da fisio corrida, sem buracos): ' || v_sug_txt$a$,
    $a$'sugeridos', v_sug, 'fisio', v_fisio,
    'resposta', 'Ofereça primeiro estes dois horários com a ' || v_fisio || ' (deixam a agenda dela corrida, sem buracos): ' || v_sug_txt$a$);
  d := replace(d, $a$'. Fale de forma natural (ex.: "amanhã tem às 12h ou às 13h. Algum fica bom?"). '$a$,
    $a$'. Diga sempre o dia, a hora e a fisio, de forma natural (ex.: "amanhã, quarta, tem às 12h ou às 13h com a ' || v_fisio || '. Algum fica bom?"). Se perguntarem o valor, diga só o da ' || v_fisio || ', não a tabela de todas as fisios. '$a$);
  EXECUTE d;

  -- troca pedida pela família e ocupada: entra na lista com a preferência estruturada
  d := pg_get_functiondef('public.fn_ju_troca_pedir'::regproc);
  IF position($a$queixa = 'troca de horário (marcado ' || fn_ju_quando(v_antes) || ')'
     WHERE removido_em IS NULL$a$ IN d) = 0
     OR position($a$INSERT INTO lista_espera (tipo, nome, paciente_id, telefone, queixa, preferencia, conversa_id, incluido_por)$a$ IN d) = 0
     OR position($a$fn_ju_quando(v_nova), c.id, 'Ju');$a$ IN d) = 0 THEN
    RAISE EXCEPTION 'fn_ju_troca_pedir: trecho não encontrado';
  END IF;
  d := replace(d, $a$queixa = 'troca de horário (marcado ' || fn_ju_quando(v_antes) || ')'
     WHERE removido_em IS NULL$a$,
    $a$queixa = 'troca de horário (marcado ' || fn_ju_quando(v_antes) || ')',
           agendamento_atual_id = a.id, pref_data = v_nova::date, pref_dias = NULL, pref_hora_ini = v_nova::time,
           pref_hora_fim = v_nova::time, pref_profissional_id = a.profissional_id, origem = 'troca'
     WHERE removido_em IS NULL$a$);
  d := replace(d, $a$INSERT INTO lista_espera (tipo, nome, paciente_id, telefone, queixa, preferencia, conversa_id, incluido_por)$a$,
    $a$INSERT INTO lista_espera (tipo, nome, paciente_id, telefone, queixa, preferencia, conversa_id, incluido_por,
                                agendamento_atual_id, pref_data, pref_hora_ini, pref_hora_fim, pref_profissional_id, origem)$a$);
  d := replace(d, $a$fn_ju_quando(v_nova), c.id, 'Ju');$a$,
    $a$fn_ju_quando(v_nova), c.id, 'Ju', a.id, v_nova::date, v_nova::time, v_nova::time, a.profissional_id, 'troca');$a$);
  EXECUTE d;

  -- botões da lista de espera passam pela mesma porta dos botões do grupo da agenda
  d := pg_get_functiondef('public.fn_ju_reserva_botao'::regproc);
  IF position($a$  IF p_prof LIKE 'ju_troca_%' THEN$a$ IN d) = 0 THEN RAISE EXCEPTION 'fn_ju_reserva_botao: trecho não encontrado'; END IF;
  d := replace(d, $a$  IF p_prof LIKE 'ju_troca_%' THEN$a$,
    $a$  IF p_prof ~ '^ju_(le|vg)_' THEN
    IF coalesce(p_chatid, '') <> '120363402677285308@g.us' THEN
      RETURN jsonb_build_object('ok', false, 'texto', 'Esse botão só vale no grupo da agenda.');
    END IF;
    RETURN public.fn_lista_espera_botao(p_prof, p_quem);
  END IF;
  IF p_prof LIKE 'ju_troca_%' THEN$a$);
  EXECUTE d;

  -- 6. card fechado com pedido só anotado: a Ju retoma (caso Diane, 03/11/2026)
  d := pg_get_functiondef('public.fn_ju_concluir'::regproc);
  IF position($a$  RETURN jsonb_build_object('ok', true, 'ja_concluido', false,$a$ IN d) = 0 THEN
    RAISE EXCEPTION 'fn_ju_concluir: trecho não encontrado';
  END IF;
  d := replace(d, $a$  RETURN jsonb_build_object('ok', true, 'ja_concluido', false,$a$,
    $a$  -- 03/11/2026 (caso Diane): o que a família pediu com o card aberto ficou só anotado nele. Fechado o
  -- card sem ninguém responder no WhatsApp depois, a Ju retoma a conversa (fn_ju_tarefas, 1 min depois).
  IF v_restam = 0 THEN
    UPDATE public.ju_conversas c
       SET ultima_versao_respondida = c.message_version - 1, retomar_pendente_em = now()
     WHERE c.id = s.conversa_id AND c.status = 'ATIVA' AND NOT c.sem_ia
       AND c.message_version > 0 AND c.ultima_versao_respondida = c.message_version
       AND c.ultima_mensagem_cliente > coalesce(c.ultima_mensagem_humano, '-infinity'::timestamptz)
       AND c.ultima_mensagem_cliente > now() - interval '2 hours'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(s.atualizacoes, '[]'::jsonb)) u
                    WHERE u ->> 'origem' = 'nota'
                      AND (u ->> 'em')::timestamptz > coalesce(c.ultima_mensagem_humano, '-infinity'::timestamptz));
  END IF;

  RETURN jsonb_build_object('ok', true, 'ja_concluido', false,$a$);
  EXECUTE d;

  d := pg_get_functiondef('public.fn_ju_tarefas'::regproc);
  IF position($a$    INTO v_retomar FROM r;$a$ IN d) = 0 THEN RAISE EXCEPTION 'fn_ju_tarefas: trecho não encontrado'; END IF;
  d := replace(d, $a$    INTO v_retomar FROM r;$a$,
    $a$    INTO v_retomar FROM r;

  -- 03/11/2026: card fechado com pedido da família só anotado (marcado por fn_ju_concluir).
  WITH r2 AS (
    UPDATE public.ju_conversas c
       SET retomada_versao = c.message_version, retomar_pendente_em = NULL
     WHERE c.retomar_pendente_em IS NOT NULL AND c.retomar_pendente_em <= now() - interval '1 minute'
       AND c.status = 'ATIVA' AND NOT c.sem_ia
       AND c.message_version > c.ultima_versao_respondida
       AND c.ultima_mensagem_cliente > coalesce(c.ultima_mensagem_humano, '-infinity'::timestamptz)
       AND c.retomada_versao IS DISTINCT FROM c.message_version
    RETURNING c.id, c.message_version)
  SELECT v_retomar || coalesce(jsonb_agg(jsonb_build_object('conversa_id', id, 'versao', message_version)), '[]'::jsonb)
    INTO v_retomar FROM r2;
  UPDATE public.ju_conversas SET retomar_pendente_em = NULL WHERE retomar_pendente_em < now() - interval '30 minutes';$a$);
  EXECUTE d;

  -- oferta de vaga em aberto vai nos dados do turno da Ju
  d := pg_get_functiondef('public.fn_ju_turno'::regproc);
  IF position($a$'contato_profissional', public.fn_ju_contato_profissional(c.id),$a$ IN d) = 0 THEN
    RAISE EXCEPTION 'fn_ju_turno: trecho não encontrado';
  END IF;
  d := replace(d, $a$'contato_profissional', public.fn_ju_contato_profissional(c.id),$a$,
    $a$'oferta_vaga', public.fn_lista_espera_oferta(c.id),
    'contato_profissional', public.fn_ju_contato_profissional(c.id),$a$);
  EXECUTE d;
END $do$;

-- rodapé da mensagem fixada: a lista agora também se enche pelos cards da Ju
DO $do$
DECLARE d text := pg_get_functiondef('public.fn_lista_espera_texto'::regproc);
BEGIN
  IF position($a$'_Ao marcar a consulta, o paciente sai da lista sozinho. Para incluir ou tirar: @ju na conversa da família._'$a$ IN d) = 0 THEN
    RAISE EXCEPTION 'fn_lista_espera_texto: trecho não encontrado';
  END IF;
  d := replace(d, $a$'_Ao marcar a consulta, o paciente sai da lista sozinho. Para incluir ou tirar: @ju na conversa da família._'$a$,
    $a$'_Ao marcar (ou trocar) a consulta, o paciente sai da lista sozinho. Quando vagar um horário que combina, aviso aqui._'$a$);
  EXECUTE d;
END $do$;

REVOKE EXECUTE ON FUNCTION public.fn_lista_espera_botao(text, text), public.fn_lista_espera_tick(),
  public.fn_lista_espera_analises_pegar(int), public.fn_lista_espera_analise_registrar(bigint, jsonb),
  public.fn_le_vaga_oferecer(bigint, text), public.fn_le_vaga_trocar(bigint, text), public.fn_le_vaga_avancar(bigint, text),
  public.fn_le_vaga_abrir(uuid, uuid, timestamp, text, uuid), public.fn_le_vaga_card(bigint), public.fn_le_card(text, text[]),
  public.fn_le_apagar(text, bigint), public.fn_lista_espera_oferta(bigint)
  FROM anon, authenticated, public;

-- cron (aplicado à parte): SELECT cron.schedule('lista-espera-v2', '* * * * *', 'SELECT public.fn_lista_espera_tick();');
