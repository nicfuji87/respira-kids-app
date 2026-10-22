-- =====================================================================
-- Follow-up 100% automático — motor (fase A: sombra, SEM envio)
-- =====================================================================
-- AI dev note (21/10/2026, especificação do dono "motor de follow-up 100%
-- automático"): três camadas independentes.
--   A. Regras objetivas: fn_followup_avaliar (followup_sombra*.sql), CONGELADAS.
--   B. Agente de IA: n8n "RK Follow-up - Analisador" lê a conversa e devolve só
--      uma classificação estruturada (fn_followup_ia_registrar). Não envia nada.
--   C. Motor: fn_followup_decidir combina A e B; quando tudo permite, cria a
--      tentativa PROGRAMADA. O envio é feito por um fluxo que reserva a tentativa
--      (fn_followup_reservar: trava + revalida as 13 condições), envia pelo canal
--      autorizado e devolve o resultado (fn_followup_resultado).
-- Nasce DESLIGADO: followup_config.envio_ativo = false e canal_autorizado =
-- false; ninguém tem autorização confirmada; nenhuma mensagem do catálogo está
-- aprovada para o canal. Com isso nenhuma tentativa é criada. O fluxo de envio
-- ainda não existe (depende do canal: uazapi x WhatsApp Business Platform).
-- Uma oportunidade perdida é preferível a um contato inadequado.
-- =====================================================================

-- ── Configuração (limites no banco, não no prompt) ────────────────────
CREATE TABLE IF NOT EXISTS public.followup_config (
  id                      int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  envio_ativo             boolean NOT NULL DEFAULT false,  -- chave geral de interrupção
  canal_autorizado        boolean NOT NULL DEFAULT false,  -- canal compatível com as regras do WhatsApp
  canal                   text,                             -- 'uazapi' | 'cloud_api' (quando definido)
  ia_ativa                boolean NOT NULL DEFAULT true,
  modelo_ia               text NOT NULL DEFAULT 'gpt-5.5',
  espera_min_dias_uteis   int  NOT NULL DEFAULT 1,
  validade_dias_uteis     int  NOT NULL DEFAULT 3,
  intervalo_familia_dias  int  NOT NULL DEFAULT 30,
  janelas                 time[] NOT NULL DEFAULT ARRAY['10:00'::time, '15:00'::time],
  janela_tolerancia_min   int  NOT NULL DEFAULT 90,  -- até quanto depois da janela ainda pode sair
  dias_sem_resposta       int  NOT NULL DEFAULT 7,   -- depois disso, ENVIADA vira ENCERRADA
  atualizado_em           timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.followup_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ── Feriados (Brasília) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.followup_feriados (dia date PRIMARY KEY, nome text NOT NULL);
INSERT INTO public.followup_feriados (dia, nome) VALUES
  ('2026-01-01','Confraternização Universal'), ('2026-02-16','Carnaval'), ('2026-02-17','Carnaval'),
  ('2026-04-03','Sexta-feira Santa'), ('2026-04-21','Tiradentes / Fundação de Brasília'),
  ('2026-05-01','Dia do Trabalho'), ('2026-06-04','Corpus Christi'), ('2026-09-07','Independência'),
  ('2026-10-12','Nossa Senhora Aparecida'), ('2026-11-02','Finados'), ('2026-11-15','Proclamação da República'),
  ('2026-11-20','Consciência Negra'), ('2026-11-30','Dia do Evangélico (DF)'), ('2026-12-25','Natal'),
  ('2027-01-01','Confraternização Universal'), ('2027-02-08','Carnaval'), ('2027-02-09','Carnaval'),
  ('2027-03-26','Sexta-feira Santa'), ('2027-04-21','Tiradentes / Fundação de Brasília'),
  ('2027-05-01','Dia do Trabalho'), ('2027-05-27','Corpus Christi'), ('2027-09-07','Independência'),
  ('2027-10-12','Nossa Senhora Aparecida'), ('2027-11-02','Finados'), ('2027-11-15','Proclamação da República'),
  ('2027-11-20','Consciência Negra'), ('2027-11-30','Dia do Evangélico (DF)'), ('2027-12-25','Natal')
ON CONFLICT DO NOTHING;

-- ── Catálogo fechado de mensagens ─────────────────────────────────────
-- A IA nunca escreve o texto enviado. aprovado_canal = false até o texto ser
-- aprovado para o canal (template, quando o canal exigir).
CREATE TABLE IF NOT EXISTS public.followup_mensagens (
  codigo          text PRIMARY KEY,
  cenario         text NOT NULL,
  texto           text NOT NULL,
  ativo           boolean NOT NULL DEFAULT true,
  aprovado_canal  boolean NOT NULL DEFAULT false
);
INSERT INTO public.followup_mensagens (codigo, cenario, texto) VALUES
  ('A', 'AGENDAMENTO_INTERROMPIDO', 'Oi! Você tinha pedido um horário com a gente. Ainda quer continuar?'),
  ('B', 'CADASTRO_PENDENTE',        'Oi! Sobre o agendamento que você pediu, ainda precisa de ajuda com o cadastro?'),
  ('C', 'OPCOES_HORARIO',           'Oi! Você ainda quer continuar com o agendamento que conversamos?'),
  ('D', 'RETORNO_SOLICITADO',       'Oi! Você pediu pra gente retomar o contato hoje. Ainda precisa de ajuda com o agendamento?')
ON CONFLICT DO NOTHING;

-- ── Autorização e recusa por contato (chave de telefone, DDD + 8 dígitos) ──
CREATE TABLE IF NOT EXISTS public.followup_contatos (
  telefone_chave  text PRIMARY KEY,
  autorizacao     text NOT NULL DEFAULT 'nao_confirmada' CHECK (autorizacao IN ('confirmada','nao_confirmada','recusada')),
  origem          text,            -- como a autorização/recusa foi obtida
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

-- ── Resultado da IA ao lado das regras (para comparar) ────────────────
ALTER TABLE public.followup_avaliacoes
  ADD COLUMN IF NOT EXISTS ia_classificacao text,
  ADD COLUMN IF NOT EXISTS ia_resultado     jsonb,
  ADD COLUMN IF NOT EXISTS ia_modelo        text,
  ADD COLUMN IF NOT EXISTS ia_em            timestamptz,
  ADD COLUMN IF NOT EXISTS ia_erro          text,
  ADD COLUMN IF NOT EXISTS decisao_motor    text,   -- ENVIARIA | NAO_ENVIA | RETORNO_COMBINADO | AGUARDANDO_IA
  ADD COLUMN IF NOT EXISTS decisao_motivo   text,
  ADD COLUMN IF NOT EXISTS envio_impedido_por text, -- envio_desligado | canal_nao_autorizado | autorizacao_nao_confirmada | mensagem_nao_aprovada | ...
  ADD COLUMN IF NOT EXISTS mensagem_codigo  text;

-- ── Tentativas e histórico ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.followup_tentativas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidade_id    bigint NOT NULL,
  conversa_id        bigint NOT NULL,
  telefone_chave     text,
  tipo               text NOT NULL CHECK (tipo IN ('RECUPERACAO_COMERCIAL','RETORNO_COMBINADO')),
  estado             text NOT NULL CHECK (estado IN ('IDENTIFICADA','ELEGIVEL','PROGRAMADA','CANCELADA','SUPRIMIDA',
                       'EM_ENVIO','ENVIADA','FALHOU','ENTREGA_DESCONHECIDA','RESPONDIDA','CONVERTIDA','ENCERRADA')),
  motivo             text,
  avaliacao_id       bigint,
  mensagem_codigo    text,
  programada_para    timestamptz,
  tentativa_em       timestamptz,
  provedor_id        text,
  provedor_detalhe   text,
  resposta_em        timestamptz,
  agendamento_em     timestamptz,
  criada_em          timestamptz NOT NULL DEFAULT now(),
  atualizada_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (oportunidade_id, tipo)   -- um follow-up por oportunidade (e por tipo)
);
CREATE INDEX IF NOT EXISTS idx_followup_tentativas_conversa ON public.followup_tentativas (conversa_id);
CREATE INDEX IF NOT EXISTS idx_followup_tentativas_familia  ON public.followup_tentativas (telefone_chave, tentativa_em);

CREATE TABLE IF NOT EXISTS public.followup_transicoes (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tentativa_id  uuid NOT NULL REFERENCES public.followup_tentativas(id) ON DELETE CASCADE,
  de            text,
  para          text NOT NULL,
  motivo        text,
  em            timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.fn_followup_transicao_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.estado IS DISTINCT FROM OLD.estado THEN
    INSERT INTO public.followup_transicoes (tentativa_id, de, para, motivo)
    VALUES (NEW.id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.estado END, NEW.estado, NEW.motivo);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_followup_transicao ON public.followup_tentativas;
CREATE TRIGGER trg_followup_transicao AFTER INSERT OR UPDATE OF estado ON public.followup_tentativas
  FOR EACH ROW EXECUTE FUNCTION public.fn_followup_transicao_log();

-- histórico só cresce
CREATE OR REPLACE FUNCTION public.fn_followup_transicoes_imutavel()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'followup_transicoes é só de inclusão'; END $$;
DROP TRIGGER IF EXISTS trg_followup_transicoes_imutavel ON public.followup_transicoes;
CREATE TRIGGER trg_followup_transicoes_imutavel BEFORE UPDATE ON public.followup_transicoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_followup_transicoes_imutavel();

-- ── Acesso: leitura para admin/secretaria; escrita só pelas funções ────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['followup_config','followup_feriados','followup_mensagens','followup_contatos',
                           'followup_tentativas','followup_transicoes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_ler', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.is_admin()) OR (SELECT public.is_secretaria()))', t || '_ler', t);
  END LOOP;
END $$;

-- ── Calendário ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_followup_dia_util(p_dia date)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT extract(isodow FROM p_dia) BETWEEN 1 AND 5
     AND NOT EXISTS (SELECT 1 FROM public.followup_feriados f WHERE f.dia = p_dia)
$$;

-- dias úteis (com feriados) em (de, até]
CREATE OR REPLACE FUNCTION public.fn_followup_dias_uteis_motor(p_de timestamptz, p_ate timestamptz)
RETURNS int LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT count(*)::int
    FROM generate_series((p_de AT TIME ZONE 'America/Sao_Paulo')::date + 1,
                         (p_ate AT TIME ZONE 'America/Sao_Paulo')::date, interval '1 day') d
   WHERE public.fn_followup_dia_util(d::date)
$$;

-- próxima janela de envio (10h/15h) em dia útil, a partir de p_desde
CREATE OR REPLACE FUNCTION public.fn_followup_proxima_janela(p_desde timestamptz)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE k public.followup_config; d date := (p_desde AT TIME ZONE 'America/Sao_Paulo')::date; j time; i int;
BEGIN
  SELECT * INTO k FROM public.followup_config WHERE id = 1;
  FOR i IN 0 .. 20 LOOP
    IF public.fn_followup_dia_util(d + i) THEN
      FOREACH j IN ARRAY k.janelas LOOP
        IF ((d + i) + j) AT TIME ZONE 'America/Sao_Paulo' >= p_desde THEN
          RETURN ((d + i) + j) AT TIME ZONE 'America/Sao_Paulo';
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

-- ── Camada B: lote para a IA e registro do resultado ──────────────────
-- Conversa desde 2 dias antes da abertura da oportunidade (máx. 40 mensagens).
-- A IA NÃO recebe a classificação das regras (as duas são comparadas depois).
CREATE OR REPLACE FUNCTION public.fn_followup_ia_item(p_avaliacao_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'avaliacao_id', f.id,
    'hoje', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ', '
            || (ARRAY['segunda','terça','quarta','quinta','sexta','sábado','domingo'])
               [extract(isodow FROM now() AT TIME ZONE 'America/Sao_Paulo')::int]
            || CASE WHEN public.fn_followup_dia_util((now() AT TIME ZONE 'America/Sao_Paulo')::date) THEN '' ELSE ' (não é dia útil)' END,
    'dias_uteis_desde_ultima_fala_da_clinica',
      CASE WHEN f.ultima_clinica_em IS NOT NULL THEN public.fn_followup_dias_uteis_motor(f.ultima_clinica_em, now()) END,
    'conversa', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', q.id,
               'autor', CASE q.origem WHEN 'CLIENTE' THEN 'FAMILIA' WHEN 'HUMANO' THEN 'CLINICA (secretaria/equipe)'
                                      WHEN 'JU' THEN 'CLINICA (Ju, assistente)' ELSE 'SISTEMA (mensagem automática)' END,
               'em', to_char(q.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'),
               'texto', CASE WHEN q.tipo = 'BOTAO' THEN '[tocou num botão] ' ELSE '' END
                        || coalesce(left(q.conteudo, CASE WHEN q.origem = 'AUTOMACAO' THEN 300 ELSE 700 END), '[mídia sem texto]'))
             ORDER BY q.created_at)
        FROM (SELECT m.* FROM public.ju_mensagens m
               WHERE m.conversa_id = f.conversa_id AND m.created_at >= o.aberta_em - interval '2 days'
               ORDER BY m.created_at DESC LIMIT 40) q), '[]'::jsonb))
    FROM public.followup_avaliacoes f
    JOIN public.atrib_oportunidades o ON o.id = f.oportunidade_id
   WHERE f.id = p_avaliacao_id
$$;

CREATE OR REPLACE FUNCTION public.fn_followup_ia_lote()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('itens', coalesce(jsonb_agg(public.fn_followup_ia_item(f.id) ORDER BY f.id), '[]'::jsonb))
    FROM public.followup_avaliacoes f
   WHERE f.dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date AND f.ia_em IS NULL
$$;

CREATE OR REPLACE FUNCTION public.fn_followup_ia_disparar()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v jsonb; v_token text;
BEGIN
  IF NOT (SELECT ia_ativa FROM public.followup_config WHERE id = 1) THEN RETURN NULL; END IF;
  v := public.fn_followup_ia_lote();
  IF jsonb_array_length(v -> 'itens') = 0 THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name = 'ju_tarefas_token';
  RETURN net.http_post(
    url := 'https://flows-principal.infusecomunicacao.online/webhook/rk-followup-ia-5d2c8e1a7b',
    body := v,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ju-tarefas', v_token),
    timeout_milliseconds := 10000);
END $$;

CREATE OR REPLACE FUNCTION public.fn_followup_ia_registrar(p_avaliacao_id bigint, p_resultado jsonb, p_modelo text, p_erro text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_cls text := upper(coalesce(p_resultado ->> 'classificacao', ''));
BEGIN
  IF v_cls NOT IN ('CANDIDATA','NAO_ELEGIVEL','BLOQUEADA','AGUARDANDO_CLINICA','RETORNO_COMBINADO',
                   'PENDENCIA_OPERACIONAL','CEDO','INCERTA') THEN
    v_cls := NULL;  -- resposta fora do contrato = sem classificação (não envia)
  END IF;
  UPDATE public.followup_avaliacoes
     SET ia_classificacao = coalesce(v_cls, 'INCERTA'), ia_resultado = p_resultado, ia_modelo = p_modelo,
         ia_em = now(), ia_erro = coalesce(p_erro, CASE WHEN v_cls IS NULL THEN 'resposta_invalida' END)
   WHERE id = p_avaliacao_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'AVALIACAO_INEXISTENTE'); END IF;
  RETURN public.fn_followup_decidir(p_avaliacao_id);
END $$;

-- ── Camada C: decisão ─────────────────────────────────────────────────
-- Bloqueios das regras têm prioridade. Só RECUPERACAO_COMERCIAL nesta versão
-- (agendamento interrompido / cadastro pendente / opções de horário).
-- RETORNO_COMBINADO fica registrado, sem programar (a data ainda não é
-- verificável de forma objetiva).
CREATE OR REPLACE FUNCTION public.fn_followup_decidir(p_avaliacao_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  f public.followup_avaliacoes; k public.followup_config; x public.atrib_oportunidades;
  v_ia jsonb; v_dec text; v_mot text; v_imp text; v_msg text; v_cen text; v_aut text; v_id uuid;
BEGIN
  SELECT * INTO f FROM public.followup_avaliacoes WHERE id = p_avaliacao_id FOR UPDATE;
  SELECT * INTO k FROM public.followup_config WHERE id = 1;
  SELECT * INTO x FROM public.atrib_oportunidades WHERE id = f.oportunidade_id;
  v_ia := f.ia_resultado;

  IF k.ia_ativa AND f.ia_em IS NULL THEN
    v_dec := 'AGUARDANDO_IA';
  ELSIF f.situacao = 'retorno_combinado' AND f.ia_classificacao = 'RETORNO_COMBINADO' THEN
    v_dec := 'RETORNO_COMBINADO'; v_mot := 'registrado_sem_programar';
  ELSIF f.situacao <> 'candidato' THEN
    v_dec := 'NAO_ENVIA'; v_mot := 'regras:' || f.situacao || ':' || f.motivo;
  ELSIF f.ia_classificacao IS DISTINCT FROM 'CANDIDATA' THEN
    v_dec := 'NAO_ENVIA'; v_mot := 'ia:' || coalesce(f.ia_classificacao, 'sem_resultado');
  ELSIF coalesce(v_ia ->> 'quem_deve_agir', '') <> 'FAMILIA' THEN
    v_dec := 'NAO_ENVIA'; v_mot := 'ia:quem_deve_agir=' || coalesce(v_ia ->> 'quem_deve_agir', '?');
  ELSIF jsonb_array_length(coalesce(v_ia -> 'sinais_de_preocupacao_clinica', '[]')) > 0 THEN
    v_dec := 'NAO_ENVIA'; v_mot := 'ia:preocupacao_clinica';
  ELSIF jsonb_array_length(coalesce(v_ia -> 'sinais_de_desinteresse', '[]')) > 0 THEN
    v_dec := 'NAO_ENVIA'; v_mot := 'ia:desinteresse';
  ELSE
    v_dec := 'ENVIARIA'; v_mot := 'regras_e_ia_concordam';
  END IF;

  IF v_dec = 'ENVIARIA' THEN
    v_cen := coalesce(nullif(v_ia ->> 'cenario', 'NENHUM'),
                      CASE f.contexto WHEN 'cadastro' THEN 'CADASTRO_PENDENTE' WHEN 'horarios' THEN 'OPCOES_HORARIO'
                                      ELSE 'AGENDAMENTO_INTERROMPIDO' END);
    SELECT m.codigo INTO v_msg FROM public.followup_mensagens m WHERE m.cenario = v_cen AND m.ativo LIMIT 1;
    SELECT c.autorizacao INTO v_aut FROM public.followup_contatos c WHERE c.telefone_chave = x.telefone_chave;
    v_imp := CASE
      WHEN v_msg IS NULL OR v_cen = 'RETORNO_SOLICITADO' THEN 'sem_mensagem_para_o_cenario'
      WHEN coalesce(v_aut, 'nao_confirmada') = 'recusada' THEN 'contato_recusou'
      WHEN NOT k.envio_ativo THEN 'envio_desligado'
      WHEN NOT k.canal_autorizado THEN 'canal_nao_autorizado'
      WHEN coalesce(v_aut, 'nao_confirmada') <> 'confirmada' THEN 'autorizacao_nao_confirmada'
      WHEN NOT (SELECT m.aprovado_canal FROM public.followup_mensagens m WHERE m.codigo = v_msg) THEN 'mensagem_nao_aprovada'
      WHEN EXISTS (SELECT 1 FROM public.followup_tentativas t
                    WHERE t.telefone_chave = x.telefone_chave AND t.tipo = 'RECUPERACAO_COMERCIAL'
                      AND t.estado IN ('EM_ENVIO','ENVIADA','ENTREGA_DESCONHECIDA','RESPONDIDA','CONVERTIDA','ENCERRADA')
                      AND t.tentativa_em > now() - make_interval(days => k.intervalo_familia_dias)) THEN 'limite_familia_30_dias'
      WHEN EXISTS (SELECT 1 FROM public.followup_tentativas t
                    WHERE t.oportunidade_id = f.oportunidade_id AND t.tipo = 'RECUPERACAO_COMERCIAL') THEN 'oportunidade_ja_tem_tentativa'
    END;
    IF v_imp IS NULL THEN
      INSERT INTO public.followup_tentativas (oportunidade_id, conversa_id, telefone_chave, tipo, estado, motivo,
                                              avaliacao_id, mensagem_codigo, programada_para)
      VALUES (f.oportunidade_id, f.conversa_id, x.telefone_chave, 'RECUPERACAO_COMERCIAL', 'PROGRAMADA', v_mot,
              f.id, v_msg, public.fn_followup_proxima_janela(now()))
      ON CONFLICT (oportunidade_id, tipo) DO NOTHING
      RETURNING id INTO v_id;
      IF v_id IS NULL THEN v_imp := 'oportunidade_ja_tem_tentativa'; END IF;
    END IF;
  END IF;

  UPDATE public.followup_avaliacoes
     SET decisao_motor = v_dec, decisao_motivo = v_mot, envio_impedido_por = v_imp, mensagem_codigo = v_msg
   WHERE id = f.id;
  RETURN jsonb_build_object('ok', true, 'decisao', v_dec, 'motivo', v_mot, 'impedido_por', v_imp,
                            'mensagem', v_msg, 'tentativa_id', v_id);
END $$;

-- ── Revalidação imediatamente antes do envio (as 13 condições) ────────
CREATE OR REPLACE FUNCTION public.fn_followup_revalidar(p_tentativa_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t public.followup_tentativas; k public.followup_config; c public.ju_conversas;
  o public.atrib_oportunidades; f public.followup_avaliacoes; v_aut text; v_corte timestamptz;
  v_agora timestamptz := now(); v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  r text;
BEGIN
  SELECT * INTO t FROM public.followup_tentativas WHERE id = p_tentativa_id;
  SELECT * INTO k FROM public.followup_config WHERE id = 1;
  SELECT * INTO c FROM public.ju_conversas WHERE id = t.conversa_id;
  SELECT * INTO o FROM public.atrib_oportunidades WHERE id = t.oportunidade_id;
  SELECT * INTO f FROM public.followup_avaliacoes WHERE id = t.avaliacao_id;
  SELECT x.autorizacao INTO v_aut FROM public.followup_contatos x WHERE x.telefone_chave = t.telefone_chave;
  v_corte := coalesce(f.avaliado_em, t.criada_em);

  r := CASE
    WHEN t.id IS NULL THEN 'tentativa_inexistente'
    WHEN NOT k.envio_ativo THEN 'envio_desligado'                                               -- chave geral
    WHEN c.sem_ia THEN 'sem_ia'                                                                  -- 1
    WHEN coalesce(v_aut, 'nao_confirmada') = 'recusada' THEN 'contato_recusou'                   -- 2
    WHEN coalesce(v_aut, 'nao_confirmada') <> 'confirmada' THEN 'autorizacao_nao_confirmada'     -- 3
    WHEN o.estado IS DISTINCT FROM 'aberta' THEN 'oportunidade_' || coalesce(o.estado, 'inexistente')  -- 4
    WHEN EXISTS (SELECT 1 FROM public.ju_mensagens m WHERE m.conversa_id = t.conversa_id
                   AND m.origem = 'CLIENTE' AND m.created_at > v_corte) THEN 'familia_escreveu'  -- 5 e 8
    WHEN t.telefone_chave IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.fn_atrib_pacientes_do_contato(t.telefone_chave) pc
             JOIN public.agendamentos a ON a.paciente_id = pc.paciente_id AND a.ativo
            WHERE a.created_at >= o.aberta_em) THEN 'ja_tem_agendamento'                         -- 6 e 9
    WHEN EXISTS (SELECT 1 FROM public.ju_mensagens m WHERE m.conversa_id = t.conversa_id
                   AND m.origem = 'HUMANO' AND m.created_at > v_corte)
      OR (c.status = 'PAUSADA' AND c.pause_until > v_agora)
      OR c.status = 'AGUARDANDO_EQUIPE' THEN 'lolo_conduzindo'                                   -- 7
    WHEN EXISTS (SELECT 1 FROM public.ju_solicitacoes s WHERE s.conversa_id = t.conversa_id AND s.status = 'ABERTA'
                   AND s.tipo IN ('CLINICO','RECLAMACAO','HUMANO','EXTERNO')) THEN 'pedido_sensivel_aberto'  -- 8
    WHEN NOT public.fn_followup_dia_util(v_hoje) THEN 'nao_e_dia_util'                           -- 10
    WHEN f.ultima_clinica_em IS NOT NULL
         AND public.fn_followup_dias_uteis_motor(f.ultima_clinica_em, v_agora) > k.validade_dias_uteis THEN 'prazo_vencido'
    WHEN f.ultima_clinica_em IS NOT NULL
         AND public.fn_followup_dias_uteis_motor(f.ultima_clinica_em, v_agora) < k.espera_min_dias_uteis THEN 'cedo'
    WHEN t.programada_para IS NULL OR v_agora < t.programada_para
         OR v_agora > t.programada_para + make_interval(mins => k.janela_tolerancia_min) THEN 'fora_da_janela'
    WHEN EXISTS (SELECT 1 FROM public.followup_tentativas z
                  WHERE z.id <> t.id AND z.telefone_chave = t.telefone_chave AND z.tipo = 'RECUPERACAO_COMERCIAL'
                    AND z.estado IN ('EM_ENVIO','ENVIADA','ENTREGA_DESCONHECIDA','RESPONDIDA','CONVERTIDA','ENCERRADA')
                    AND z.tentativa_em > v_agora - make_interval(days => k.intervalo_familia_dias)) THEN 'limite_familia_30_dias'
    WHEN NOT k.canal_autorizado THEN 'canal_nao_autorizado'                                      -- 11
    WHEN NOT EXISTS (SELECT 1 FROM public.followup_mensagens m WHERE m.codigo = t.mensagem_codigo
                       AND m.ativo AND m.aprovado_canal) THEN 'mensagem_nao_aprovada'            -- 12
    WHEN t.estado <> 'PROGRAMADA' THEN 'estado_' || t.estado                                     -- 13
  END;
  RETURN jsonb_build_object('ok', r IS NULL, 'motivo', r);
END $$;

-- Reserva atômica: só uma execução consegue passar de PROGRAMADA para EM_ENVIO.
CREATE OR REPLACE FUNCTION public.fn_followup_reservar(p_tentativa_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.followup_tentativas; v jsonb; v_est text;
BEGIN
  SELECT * INTO t FROM public.followup_tentativas WHERE id = p_tentativa_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'tentativa_inexistente'); END IF;
  IF t.estado <> 'PROGRAMADA' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'estado_' || t.estado); END IF;
  v := public.fn_followup_revalidar(p_tentativa_id);
  IF NOT (v ->> 'ok')::boolean THEN
    -- fora da janela / desligado: continua programada (pode sair na próxima janela válida);
    -- o resto encerra a tentativa sem envio
    IF v ->> 'motivo' IN ('fora_da_janela','envio_desligado','canal_nao_autorizado','nao_e_dia_util','cedo') THEN
      RETURN v;
    END IF;
    v_est := CASE WHEN v ->> 'motivo' IN ('familia_escreveu','lolo_conduzindo','ja_tem_agendamento') THEN 'CANCELADA'
                  ELSE 'SUPRIMIDA' END;
    UPDATE public.followup_tentativas SET estado = v_est, motivo = v ->> 'motivo', atualizada_em = now()
     WHERE id = t.id;
    RETURN v;
  END IF;
  UPDATE public.followup_tentativas SET estado = 'EM_ENVIO', motivo = 'reservada', tentativa_em = now(), atualizada_em = now()
   WHERE id = t.id;
  RETURN jsonb_build_object('ok', true, 'tentativa_id', t.id,
    'wa_chatid', (SELECT c.wa_chatid FROM public.ju_conversas c WHERE c.id = t.conversa_id),
    'texto', (SELECT m.texto FROM public.followup_mensagens m WHERE m.codigo = t.mensagem_codigo));
END $$;

-- Resultado do provedor. ENTREGA_DESCONHECIDA nunca volta a ser enviada sozinha.
CREATE OR REPLACE FUNCTION public.fn_followup_resultado(p_tentativa_id uuid, p_estado text, p_provedor_id text, p_detalhe text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_estado NOT IN ('ENVIADA','FALHOU','ENTREGA_DESCONHECIDA') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'estado_invalido');
  END IF;
  UPDATE public.followup_tentativas
     SET estado = p_estado, motivo = 'provedor', provedor_id = p_provedor_id, provedor_detalhe = left(p_detalhe, 500),
         atualizada_em = now()
   WHERE id = p_tentativa_id AND estado = 'EM_ENVIO';
  RETURN jsonb_build_object('ok', FOUND);
END $$;

-- ── Reação a mensagens novas (família ou Lolô) ────────────────────────
-- Nunca pode quebrar o recebimento de mensagens da Ju: erro vira WARNING.
CREATE OR REPLACE FUNCTION public.fn_followup_reagir_mensagem()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_chave text;
BEGIN
  IF NEW.origem NOT IN ('CLIENTE','HUMANO') THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.followup_tentativas t WHERE t.conversa_id = NEW.conversa_id) THEN
    -- recusa vale mesmo sem tentativa aberta
    IF NEW.origem = 'CLIENTE' AND coalesce(NEW.conteudo, '') ~* '^\W*(parar|pare|stop)\W*$' THEN
      SELECT public.fn_atrib_tel_chave(c.telefone) INTO v_chave FROM public.ju_conversas c WHERE c.id = NEW.conversa_id;
      IF v_chave IS NOT NULL THEN
        INSERT INTO public.followup_contatos (telefone_chave, autorizacao, origem)
        VALUES (v_chave, 'recusada', 'respondeu PARAR') ON CONFLICT (telefone_chave)
        DO UPDATE SET autorizacao = 'recusada', origem = 'respondeu PARAR', atualizado_em = now();
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  -- família ou Lolô falou: tentativa ainda programada é cancelada
  UPDATE public.followup_tentativas
     SET estado = 'CANCELADA', motivo = CASE NEW.origem WHEN 'CLIENTE' THEN 'familia_escreveu' ELSE 'lolo_conduzindo' END,
         atualizada_em = now()
   WHERE conversa_id = NEW.conversa_id AND estado = 'PROGRAMADA';
  IF NEW.origem = 'CLIENTE' THEN
    UPDATE public.followup_tentativas
       SET estado = 'RESPONDIDA', motivo = 'familia_respondeu', resposta_em = NEW.created_at, atualizada_em = now()
     WHERE conversa_id = NEW.conversa_id AND estado IN ('ENVIADA','ENTREGA_DESCONHECIDA')
       AND tentativa_em > NEW.created_at - interval '7 days';
    IF coalesce(NEW.conteudo, '') ~* '(^\W*(parar|pare|stop)\W*$|n[ãa]o (quero|desejo) (mais )?receber|n[ãa]o (me )?mand(e|em) mais)' THEN
      SELECT t.telefone_chave INTO v_chave FROM public.followup_tentativas t WHERE t.conversa_id = NEW.conversa_id LIMIT 1;
      IF v_chave IS NOT NULL THEN
        INSERT INTO public.followup_contatos (telefone_chave, autorizacao, origem)
        VALUES (v_chave, 'recusada', 'pediu para não receber') ON CONFLICT (telefone_chave)
        DO UPDATE SET autorizacao = 'recusada', origem = 'pediu para não receber', atualizado_em = now();
        UPDATE public.followup_tentativas SET estado = 'SUPRIMIDA', motivo = 'contato_recusou', atualizada_em = now()
         WHERE telefone_chave = v_chave AND estado = 'PROGRAMADA';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'fn_followup_reagir_mensagem: %', SQLERRM;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_followup_reagir ON public.ju_mensagens;
CREATE TRIGGER trg_followup_reagir AFTER INSERT ON public.ju_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.fn_followup_reagir_mensagem();

-- ── Manutenção diária: conversão e encerramento ───────────────────────
CREATE OR REPLACE FUNCTION public.fn_followup_manutencao()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE k public.followup_config; n_conv int; n_enc int;
BEGIN
  SELECT * INTO k FROM public.followup_config WHERE id = 1;
  WITH c AS (
    UPDATE public.followup_tentativas t
       SET estado = 'CONVERTIDA', motivo = 'agendamento_depois_do_followup', atualizada_em = now(),
           agendamento_em = (SELECT min(a.created_at) FROM public.fn_atrib_pacientes_do_contato(t.telefone_chave) pc
                              JOIN public.agendamentos a ON a.paciente_id = pc.paciente_id AND a.ativo
                             WHERE a.created_at > t.tentativa_em)
     WHERE t.estado IN ('ENVIADA','ENTREGA_DESCONHECIDA','RESPONDIDA') AND t.telefone_chave IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.fn_atrib_pacientes_do_contato(t.telefone_chave) pc
                     JOIN public.agendamentos a ON a.paciente_id = pc.paciente_id AND a.ativo
                    WHERE a.created_at > t.tentativa_em)
    RETURNING 1)
  SELECT count(*) INTO n_conv FROM c;
  WITH e AS (
    UPDATE public.followup_tentativas t
       SET estado = 'ENCERRADA', motivo = 'sem_resposta', atualizada_em = now()
     WHERE t.estado IN ('ENVIADA','ENTREGA_DESCONHECIDA')
       AND t.tentativa_em < now() - make_interval(days => k.dias_sem_resposta)
    RETURNING 1)
  SELECT count(*) INTO n_enc FROM e;
  RETURN jsonb_build_object('convertidas', n_conv, 'encerradas', n_enc);
END $$;

-- ── Permissões das funções: só service_role (n8n) e o próprio banco ───
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['fn_followup_ia_item(bigint)','fn_followup_ia_lote()','fn_followup_ia_disparar()',
      'fn_followup_ia_registrar(bigint,jsonb,text,text)','fn_followup_decidir(bigint)','fn_followup_revalidar(uuid)',
      'fn_followup_reservar(uuid)','fn_followup_resultado(uuid,text,text,text)','fn_followup_manutencao()',
      'fn_followup_proxima_janela(timestamptz)','fn_followup_dia_util(date)','fn_followup_dias_uteis_motor(timestamptz,timestamptz)',
      'fn_followup_transicao_log()','fn_followup_reagir_mensagem()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END $$;

-- ── Agenda: 9h30 regras → IA → manutenção (seg-sex) ───────────────────
SELECT cron.unschedule('followup-sombra') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'followup-sombra');
SELECT cron.schedule('followup-sombra', '30 12 * * 1-5',
  $$SELECT public.fn_followup_avaliar(); SELECT public.fn_followup_ia_disparar(); SELECT public.fn_followup_manutencao();$$);
