-- 07/11/2026: recados da família para a fisio (Bruna, Flávia, Beatriz).
-- A família pede "avisa a Flávia..." ou dá retorno de uma sessão: a Ju manda o recado no privado da fisio
-- (pelo número da clínica) e avisa no 🔔. A fisio responde com @ju (ou citando o recado) e a Ju passa
-- para a família com texto humano ("A Flávia pediu para te dizer que..."), ou agenda, se ela pedir.
-- Recado só sai das 7h às 20h; fora disso fica na fila para as 7h. Sem resposta em 2 h úteis: aviso no 🔔.

-- Quem recebe recado pela Ju.
CREATE TABLE IF NOT EXISTS public.ju_recado_destinatarios (
  profissional_id uuid PRIMARY KEY REFERENCES public.pessoas(id),
  ativo boolean NOT NULL DEFAULT true
);
ALTER TABLE public.ju_recado_destinatarios ENABLE ROW LEVEL SECURITY;
INSERT INTO public.ju_recado_destinatarios (profissional_id) VALUES
  ('c4883f76-d010-4fb4-ac5b-248914e56e6e'),  -- Bruna
  ('2b1da16a-4294-47c0-b8c1-3f1595590332'),  -- Flávia
  ('b3e954bf-02dd-4821-aa58-aa4fb34c3e02')   -- Beatriz
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ju_recados (
  id bigserial PRIMARY KEY,
  conversa_id bigint NOT NULL REFERENCES public.ju_conversas(id),
  paciente_id uuid,
  profissional_id uuid NOT NULL REFERENCES public.pessoas(id),
  recado text NOT NULL,
  mensagem text NOT NULL,
  familia text,
  crianca text,
  status text NOT NULL DEFAULT 'fila' CHECK (status IN ('fila', 'enviado', 'respondido', 'expirado', 'falhou')),
  enviar_em timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz,
  envio_req bigint,
  respondido_em timestamptz,
  respostas int NOT NULL DEFAULT 0,
  alerta_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ju_recados ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ju_recados_prof_idx ON public.ju_recados (profissional_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ju_recados_status_idx ON public.ju_recados (status) WHERE status IN ('fila', 'enviado');

ALTER TABLE public.ju_comandos ADD COLUMN IF NOT EXISTS recado_id bigint REFERENCES public.ju_recados(id);

-- Texto simples para um chat 1:1 pelo número da clínica (marca o eco como Ju quando há conversa).
CREATE OR REPLACE FUNCTION public.fn_ju_recado_whats(p_numero text, p_texto text, p_conversa_id bigint DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_tok text := fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
BEGIN
  IF v_tok IS NULL OR coalesce(p_numero, '') = '' OR coalesce(btrim(p_texto), '') = '' THEN RETURN NULL; END IF;
  IF p_conversa_id IS NOT NULL THEN
    PERFORM fn_ju_marcar_envio(p_conversa_id, p_texto);
  END IF;
  RETURN net.http_post(
    url := 'https://infuse.uazapi.com/send/text',
    body := jsonb_build_object('number', p_numero, 'text', CASE WHEN p_conversa_id IS NOT NULL THEN '*Ju:* ' ELSE '' END || p_texto),
    headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
    timeout_milliseconds := 20000);
END $function$;

-- Chat e conversa da fisio com a clínica.
CREATE OR REPLACE FUNCTION public.fn_ju_recado_chat_fisio(p_profissional_id uuid)
RETURNS TABLE (numero text, conversa_id bigint, nome text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(c.wa_chatid, regexp_replace(p.telefone::text, '\D', '', 'g')),
         c.id, split_part(btrim(p.nome), ' ', 1)
    FROM pessoas p
    LEFT JOIN LATERAL (SELECT jc.id, jc.wa_chatid FROM ju_conversas jc
                        WHERE fn_ju_telefone(jc.telefone) = fn_ju_telefone(p.telefone::text)
                          AND jc.wa_chatid NOT LIKE '%@g.us'
                        ORDER BY jc.updated_at DESC NULLS LAST LIMIT 1) c ON true
   WHERE p.id = p_profissional_id AND p.telefone IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.fn_ju_recado_enviar(p_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r ju_recados; v_num text; v_req bigint;
BEGIN
  SELECT * INTO r FROM ju_recados WHERE id = p_id AND status = 'fila' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT numero INTO v_num FROM fn_ju_recado_chat_fisio(r.profissional_id);
  v_req := fn_ju_recado_whats(v_num, r.mensagem, NULL);
  UPDATE ju_recados
     SET status = CASE WHEN v_req IS NULL THEN 'falhou' ELSE 'enviado' END,
         enviado_em = now(), envio_req = v_req
   WHERE id = p_id;
  IF v_req IS NULL THEN
    INSERT INTO ju_avisos_grupo (texto, origem, conversa_id)
    VALUES ('⚠️ Não consegui mandar o recado de ' || coalesce(r.familia, 'uma família') || '/' || coalesce(r.crianca, '?')
            || ' para a fisio. Recado: “' || left(r.recado, 300) || '”', 'RECADO_FISIO', r.conversa_id);
  END IF;
END $function$;

-- Ferramenta recado_fisio da Ju (acao RECADO_FISIO, via fn_ju_acao_fixo).
-- p: conversa_id, versao, paciente_id, tipo (= nome da fisio), resumo (= recado), relacao (mãe, pai, avó...).
CREATE OR REPLACE FUNCTION public.fn_ju_recado_criar(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c ju_conversas; ctx jsonb; v_versao bigint := nullif(p ->> 'versao', '')::bigint;
  v_txt text := btrim(regexp_replace(coalesce(p ->> 'resumo', ''), '^[“"]+|[”"]+$', '', 'g'));
  v_pac uuid; v_crianca text; v_fisio_nome text := lower(unaccent(btrim(coalesce(p ->> 'tipo', ''))));
  v_prof uuid; v_prof_nome text; v_outra text;
  v_familia text; v_rel text := lower(btrim(coalesce(p ->> 'relacao', '')));
  v_fem boolean; v_tel text; v_sess text; v_dh timestamp;
  v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_enviar timestamptz; v_msg text; v_id bigint; v_fila boolean;
BEGIN
  SELECT * INTO c FROM ju_conversas WHERE id = (p ->> 'conversa_id')::bigint;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'resposta', 'Conversa não encontrada; nada foi feito. Responda exatamente [NADA].'); END IF;
  IF c.sem_ia OR (v_versao IS NOT NULL AND c.message_version > v_versao) THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'A conversa mudou (mensagem nova ou marcada SEM IA); nada foi feito. Responda exatamente [NADA].');
  END IF;
  IF length(v_txt) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Nada foi enviado: faltou o recado (resumo) com as palavras da família.');
  END IF;
  ctx := fn_ju_contexto_cliente(c.id);

  -- Criança: a indicada (se é da família) ou a única com atendimento.
  BEGIN v_pac := nullif(p ->> 'paciente_id', '')::uuid; EXCEPTION WHEN OTHERS THEN v_pac := NULL; END;
  IF v_pac IS NOT NULL AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(ctx -> 'pacientes', '[]')) x
                                        WHERE (x ->> 'paciente_id')::uuid = v_pac) THEN
    v_pac := NULL;
  END IF;
  IF v_pac IS NULL THEN
    SELECT CASE WHEN count(*) = 1 THEN (array_agg((x ->> 'paciente_id')::uuid))[1] END INTO v_pac
      FROM jsonb_array_elements(coalesce(ctx -> 'pacientes', '[]')) x
     WHERE jsonb_array_length(coalesce(nullif(x -> 'atendimentos_realizados', 'null'), '[]')) > 0
        OR jsonb_array_length(coalesce(nullif(x -> 'proximas_consultas', 'null'), '[]')) > 0;
  END IF;
  SELECT split_part(btrim(nome), ' ', 1) INTO v_crianca FROM pessoas WHERE id = v_pac;

  -- Fisio: a citada; senão a da última sessão da criança.
  IF v_fisio_nome <> '' THEN
    SELECT d.profissional_id INTO v_prof
      FROM ju_recado_destinatarios d JOIN pessoas pp ON pp.id = d.profissional_id
     WHERE d.ativo AND pp.ativo
       AND lower(unaccent(split_part(btrim(pp.nome), ' ', 1))) = split_part(v_fisio_nome, ' ', 1)
     LIMIT 1;
    IF v_prof IS NULL THEN
      SELECT split_part(btrim(pp.nome), ' ', 1) INTO v_outra FROM pessoas pp
        JOIN pessoa_tipos t ON t.id = pp.id_tipo_pessoa
       WHERE pp.ativo AND t.codigo IN ('profissional', 'admin', 'secretaria')
         AND lower(unaccent(split_part(btrim(pp.nome), ' ', 1))) = split_part(v_fisio_nome, ' ', 1)
       LIMIT 1;
      RETURN jsonb_build_object('ok', false, 'resposta',
        CASE WHEN v_outra IS NOT NULL
             THEN 'Nada foi enviado: a ' || v_outra || ' não recebe recado pela Ju. Use chamar_secretaria (tipo OUTRO) com o recado completo e diga à família que você passou para a equipe.'
             ELSE 'Nada foi enviado: não achei a fisio "' || (p ->> 'tipo') || '". Os recados vão para a Bruna, a Flávia ou a Beatriz. Se não souber qual é, pergunte à família com quem foi a sessão.' END);
    END IF;
  ELSIF v_pac IS NOT NULL THEN
    SELECT a.profissional_id INTO v_prof
      FROM agendamentos a JOIN ju_recado_destinatarios d ON d.profissional_id = a.profissional_id AND d.ativo
     WHERE a.paciente_id = v_pac AND a.ativo AND (a.data_hora AT TIME ZONE 'UTC') <= v_agora
     ORDER BY a.data_hora DESC LIMIT 1;
  END IF;
  IF v_prof IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'resposta',
      'Nada foi enviado: não sei para qual fisio é o recado. Pergunte à família, em uma frase, com quem foi a sessão.');
  END IF;
  SELECT split_part(btrim(nome), ' ', 1) INTO v_prof_nome FROM pessoas WHERE id = v_prof;

  -- Repetição da mesma chamada: não manda de novo.
  IF EXISTS (SELECT 1 FROM ju_recados WHERE conversa_id = c.id AND profissional_id = v_prof
               AND created_at > now() - interval '30 minutes' AND lower(recado) = lower(v_txt)) THEN
    RETURN jsonb_build_object('ok', true, 'resposta',
      'Esse recado já foi passado para a ' || v_prof_nome || '. Não repita a confirmação se já disse; senão diga: "Passei seu recado para a ' || v_prof_nome || '. Quando ela responder, eu te mando por aqui."');
  END IF;

  -- Quem manda e a última sessão com essa fisio.
  v_familia := split_part(btrim(coalesce(nullif(ctx ->> 'responsavel_identificado', ''), nullif(c.nome_whatsapp, ''), 'Família')), ' ', 1);
  v_rel := CASE WHEN v_rel ~ '^[a-záéíóúâêôãõç ]{2,15}$' THEN v_rel ELSE '' END;
  v_fem := v_rel = '' OR v_rel ~ '(mãe|mae|avó|tia|madrinha|babá|baba|madrasta|irmã)';
  v_tel := regexp_replace(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), '^55(\d{2})(\d{4,5})(\d{4})$', '(\1) \2-\3');
  SELECT a.data_hora AT TIME ZONE 'UTC' INTO v_dh
    FROM agendamentos a
   WHERE a.paciente_id = v_pac AND a.profissional_id = v_prof AND a.ativo
     AND (a.data_hora AT TIME ZONE 'UTC') <= v_agora + interval '30 minutes'
     AND (a.data_hora AT TIME ZONE 'UTC') > v_agora - interval '30 days'
   ORDER BY a.data_hora DESC LIMIT 1;
  IF v_dh IS NOT NULL THEN
    v_sess := 'sessão com você '
      || CASE WHEN v_dh::date = v_agora::date THEN 'hoje'
              WHEN v_dh::date = v_agora::date - 1 THEN 'ontem'
              ELSE CASE WHEN extract(dow FROM v_dh) IN (0, 6) THEN 'no ' ELSE 'na ' END
                   || (ARRAY['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[extract(dow FROM v_dh)::int + 1]
                   || ', ' || to_char(v_dh, 'DD/MM') || ',' END
      || ' às ' || regexp_replace(to_char(v_dh, 'FMHH24"h"MI'), 'h00$', 'h');
  END IF;

  v_msg := '📩 Recado ' || CASE WHEN v_fem THEN 'da ' ELSE 'do ' END || v_familia
        || CASE WHEN v_crianca IS NOT NULL THEN ' (' || coalesce(nullif(v_rel, ''), 'família') || ' de ' || v_crianca || ')' ELSE '' END
        || CASE WHEN v_tel <> '' THEN ', ' || v_tel ELSE '' END
        || coalesce(', ' || v_sess, '') || ':'
        || E'\n“' || v_txt || '”'
        || E'\n\nResponda esta mensagem com @ju que eu passo para ' || CASE WHEN v_fem THEN 'a ' ELSE 'o ' END || v_familia
        || '. Se quiser que eu agende, responda com @ju agendar e o dia e horário.';

  -- Janela das 7h às 20h.
  v_fila := v_agora::time < time '07:00' OR v_agora::time >= time '20:00';
  v_enviar := CASE WHEN NOT v_fila THEN now()
                   WHEN v_agora::time < time '07:00' THEN (v_agora::date + time '07:00') AT TIME ZONE 'America/Sao_Paulo'
                   ELSE (v_agora::date + 1 + time '07:00') AT TIME ZONE 'America/Sao_Paulo' END;

  INSERT INTO ju_recados (conversa_id, paciente_id, profissional_id, recado, mensagem, familia, crianca, enviar_em)
  VALUES (c.id, v_pac, v_prof, v_txt, v_msg, v_familia, v_crianca, v_enviar)
  RETURNING id INTO v_id;
  IF NOT v_fila THEN PERFORM fn_ju_recado_enviar(v_id); END IF;

  INSERT INTO ju_avisos_grupo (texto, origem, conversa_id)
  VALUES ('📩 Recado para a ' || v_prof_nome || ': ' || v_familia || coalesce('/' || v_crianca, '')
          || CASE WHEN v_fila THEN ' (sai às 7h)' ELSE '' END, 'RECADO_FISIO', c.id);

  RETURN jsonb_build_object('ok', true, 'recado_id', v_id, 'resposta',
    'Recado enviado para a ' || v_prof_nome || CASE WHEN v_fila THEN ' (ela recebe às 7h)' ELSE '' END
    || '. Diga à família exatamente: "Passei seu recado para a ' || v_prof_nome || '. Quando ela responder, eu te mando por aqui." Não fale de prazo e não acrescente orientação clínica.');
END $function$;

-- Resposta da fisio no privado: com @ju ou citando o recado. Devolve o roteamento para o @ju da família,
-- ou NULL quando não é resposta a recado (segue o @ju normal da fisio).
CREATE OR REPLACE FUNCTION public.fn_ju_recado_rotear(p_conversa_id bigint, p_mensagem_id bigint, p_texto text, p_telefone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prof uuid; v_q text; v_txt text; v_norm text; r ju_recados; v_n int; v_lista text;
  fam ju_conversas; f record; v_cmd text; v_ju boolean;
BEGIN
  SELECT d.profissional_id INTO v_prof
    FROM ju_recado_destinatarios d JOIN pessoas pp ON pp.id = d.profissional_id
   WHERE d.ativo AND pp.ativo AND pp.telefone IS NOT NULL
     AND fn_ju_telefone(pp.telefone::text) = fn_ju_telefone(p_telefone)
   LIMIT 1;
  IF v_prof IS NULL THEN RETURN NULL; END IF;

  v_ju := coalesce(p_texto, '') ~* '^\s*@ju([^[:alnum:]]|$)';
  v_q := substring(coalesce(p_texto, '') FROM '\[respondendo a: "(.*)"\]\s*$');
  v_txt := btrim(regexp_replace(coalesce(p_texto, ''), '\s*\[respondendo a: ".*"\]\s*$', ''));
  v_norm := lower(unaccent(regexp_replace(v_txt, '^\s*@ju[[:space:][:punct:]]*', '', 'i')));

  IF v_q IS NOT NULL THEN
    -- Citou uma mensagem: só vale se for um recado dela (últimos 7 dias).
    v_q := left(btrim(v_q), 60);
    SELECT * INTO r FROM ju_recados
     WHERE profissional_id = v_prof AND status IN ('enviado', 'respondido', 'expirado')
       AND created_at > now() - interval '7 days'
       AND left(regexp_replace(mensagem, '\s+', ' ', 'g'), length(v_q)) = v_q
     ORDER BY created_at DESC LIMIT 1;
    IF r.id IS NULL THEN RETURN NULL; END IF;
  ELSE
    IF NOT v_ju THEN RETURN NULL; END IF;
    -- Pedido da própria agenda da fisio segue o @ju normal.
    IF v_norm ~ '(minha|meu|meus|minhas) (agenda|paciente|numero|horario)|\m(ver|mostra\w*) (a )?agenda|\m(fecha|fechar|abre|abrir|reserva|reservar)\M|lista de espera|evoluc|proximo paciente|confirmac' THEN
      RETURN NULL;
    END IF;
    SELECT count(*), string_agg(coalesce(familia, '?') || coalesce(' (' || crianca || ')', ''), ', ' ORDER BY created_at)
      INTO v_n, v_lista
      FROM ju_recados
     WHERE profissional_id = v_prof
       AND ((status = 'enviado' AND enviado_em > now() - interval '3 days')
         OR (status = 'respondido' AND respondido_em > now() - interval '12 hours'));
    IF v_n = 0 THEN RETURN NULL; END IF;
    IF v_n = 1 THEN
      SELECT * INTO r FROM ju_recados
       WHERE profissional_id = v_prof
         AND ((status = 'enviado' AND enviado_em > now() - interval '3 days')
           OR (status = 'respondido' AND respondido_em > now() - interval '12 hours'))
       LIMIT 1;
    ELSE
      -- Vários abertos: tenta pelo nome da criança ou de quem mandou (só se apontar para uma família).
      SELECT count(DISTINCT x.conversa_id), max(x.id) INTO v_n, r.id FROM ju_recados x
       WHERE x.profissional_id = v_prof
         AND ((x.status = 'enviado' AND x.enviado_em > now() - interval '3 days')
           OR (x.status = 'respondido' AND x.respondido_em > now() - interval '12 hours'))
         AND (v_norm ~ ('\m' || lower(unaccent(coalesce(x.crianca, '#'))) || '\M')
           OR v_norm ~ ('\m' || lower(unaccent(coalesce(x.familia, '#'))) || '\M'));
      IF v_n = 1 THEN SELECT * INTO r FROM ju_recados WHERE id = r.id; END IF;
      IF v_n <> 1 THEN
        SELECT * INTO f FROM fn_ju_recado_chat_fisio(v_prof);
        PERFORM fn_ju_recado_whats(f.numero,
          'Você tem recados de mais de uma família: ' || v_lista
          || '. Para eu saber de qual é, responda citando o recado (segure a mensagem e toque em Responder) ou diga o nome da criança, sempre com @ju.',
          p_conversa_id);
        RETURN jsonb_build_object('acao', 'NADA', 'motivo', 'RECADO_QUAL', 'conversa_id', p_conversa_id);
      END IF;
    END IF;
  END IF;

  SELECT * INTO fam FROM ju_conversas WHERE id = r.conversa_id;
  SELECT * INTO f FROM fn_ju_recado_chat_fisio(v_prof);
  v_cmd := CASE WHEN v_ju THEN v_txt ELSE '@ju ' || v_txt END;

  INSERT INTO ju_comandos (conversa_id, mensagem_id, texto, recado_id)
  VALUES (r.conversa_id, p_mensagem_id, v_cmd, r.id)
  ON CONFLICT (mensagem_id) DO NOTHING;
  UPDATE ju_recados
     SET status = 'respondido', respondido_em = now(), respostas = respostas + 1
   WHERE id = r.id;

  RETURN jsonb_build_object(
    'acao', 'NADA', 'motivo', 'RECADO_RESPOSTA', 'comando', true, 'recado', true,
    'conversa_id', r.conversa_id, 'mensagem_id', p_mensagem_id, 'wa_chatid', fam.wa_chatid,
    'quem_pediu', f.nome,
    'historico_externo', jsonb_build_object(
      'recado_id', r.id, 'fisio', f.nome, 'fisio_chatid', f.numero, 'fisio_conversa_id', coalesce(f.conversa_id, p_conversa_id),
      'familia', r.familia, 'crianca', r.crianca, 'recado', r.recado,
      'enviado', to_char(r.enviado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'),
      'resposta', regexp_replace(v_txt, '^\s*@ju[[:space:][:punct:]]*', '', 'i'))::text);
END $function$;

-- Fila das 7h, aviso de 2 h úteis sem resposta e expiração (3 dias).
CREATE OR REPLACE FUNCTION public.fn_ju_recados_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r record; v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
BEGIN
  IF v_agora::time >= time '07:00' AND v_agora::time < time '20:00' THEN
    FOR r IN SELECT id FROM ju_recados WHERE status = 'fila' AND enviar_em <= now() ORDER BY id LIMIT 20 LOOP
      PERFORM fn_ju_recado_enviar(r.id);
    END LOOP;
  END IF;

  FOR r IN
    SELECT x.id, x.conversa_id, x.familia, x.crianca, x.enviado_em, split_part(btrim(pp.nome), ' ', 1) AS fisio
      FROM ju_recados x JOIN pessoas pp ON pp.id = x.profissional_id
     WHERE x.status = 'enviado' AND x.alerta_em IS NULL AND x.enviado_em > now() - interval '3 days'
       AND fn_ju_minutos_operacionais(x.enviado_em, now()) >= 120
     FOR UPDATE OF x SKIP LOCKED
  LOOP
    UPDATE ju_recados SET alerta_em = now() WHERE id = r.id;
    INSERT INTO ju_avisos_grupo (texto, origem, conversa_id)
    VALUES ('⏰ A ' || r.fisio || ' ainda não respondeu o recado de ' || coalesce(r.familia, '?') || coalesce('/' || r.crianca, '')
            || ' (enviado ' || to_char(r.enviado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24"h"MI') || ').',
            'RECADO_FISIO', r.conversa_id);
  END LOOP;

  UPDATE ju_recados SET status = 'expirado'
   WHERE status = 'enviado' AND enviado_em < now() - interval '3 days';
END $function$;

-- Contexto do @ju: na resposta a recado, quem pediu é a fisio e o recado vai junto.
CREATE OR REPLACE FUNCTION public.fn_ju_recado_ctx(p_mensagem_id bigint, p_ctx jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN r.id IS NULL THEN p_ctx
              ELSE p_ctx || jsonb_build_object(
                'quem_pediu', jsonb_build_object('nome', split_part(btrim(pp.nome), ' ', 1), 'profissional_id', pp.id),
                'recado', jsonb_build_object('familia', r.familia, 'crianca', r.crianca, 'texto', r.recado,
                                             'enviado', to_char(r.enviado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')))
         END
    FROM (SELECT 1) one
    LEFT JOIN ju_comandos k ON k.mensagem_id = p_mensagem_id AND k.recado_id IS NOT NULL
    LEFT JOIN ju_recados r ON r.id = k.recado_id
    LEFT JOIN pessoas pp ON pp.id = r.profissional_id;
$function$;

DO $mig$
DECLARE v_def text; v_new text;
BEGIN
  -- fn_ju_receber: resposta da fisio (com @ju ou citando o recado) vira @ju na conversa da família.
  v_def := pg_get_functiondef('public.fn_ju_receber(text,text,text,boolean,boolean,text,text)'::regprocedure);
  v_new := replace(v_def,
    $s$AND NOT (v_tipo = 'TEXT' AND coalesce(p_conteudo, '') ~* '^\s*@ju([^[:alnum:]]|$)' AND p_wa_chatid NOT LIKE '%@g.us'$s$,
    $s$AND NOT (v_tipo = 'TEXT' AND (coalesce(p_conteudo, '') ~* '^\s*@ju([^[:alnum:]]|$)' OR coalesce(p_conteudo, '') ~ '\[respondendo a: "📩 Recado') AND p_wa_chatid NOT LIKE '%@g.us'$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'fn_ju_receber: trecho v_conta não encontrado'; END IF;
  v_def := v_new;
  v_new := replace(v_def,
    $s$  IF v_origem = 'CLIENTE' AND NOT v_conta AND v_tipo = 'TEXT' AND coalesce(p_conteudo, '') ~* '^\s*@ju([^[:alnum:]]|$)' THEN$s$,
    $s$  IF v_origem = 'CLIENTE' AND NOT v_conta AND v_tipo = 'TEXT' THEN
    v_alerta := public.fn_ju_recado_rotear(c.id, v_msg, p_conteudo, coalesce(c.telefone, public.fn_ju_telefone(p_telefone)));
    IF v_alerta IS NOT NULL THEN RETURN v_alerta; END IF;
    v_alerta := NULL;
  END IF;

  IF v_origem = 'CLIENTE' AND NOT v_conta AND v_tipo = 'TEXT' AND coalesce(p_conteudo, '') ~* '^\s*@ju([^[:alnum:]]|$)' THEN$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'fn_ju_receber: trecho do comando não encontrado'; END IF;
  EXECUTE v_new;

  -- fn_ju_comando_contexto: quem pediu = fisio do recado.
  v_def := pg_get_functiondef('public.fn_ju_comando_contexto(bigint,bigint)'::regprocedure);
  v_new := replace(v_def, $s$  RETURN jsonb_build_object(
    'agora',$s$, $s$  RETURN public.fn_ju_recado_ctx(p_mensagem_id, jsonb_build_object(
    'agora',$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'fn_ju_comando_contexto: início não encontrado'; END IF;
  v_def := v_new;
  v_new := replace(v_def, $s$WHERE dia BETWEEN agora::date AND agora::date + 60), '[]'::jsonb));
END$s$, $s$WHERE dia BETWEEN agora::date AND agora::date + 60), '[]'::jsonb)));
END$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'fn_ju_comando_contexto: fim não encontrado'; END IF;
  EXECUTE v_new;

  -- fn_ju_comando_executar: quem pediu = fisio do recado.
  v_def := pg_get_functiondef('public.fn_ju_comando_executar(bigint,bigint,jsonb)'::regprocedure);
  v_new := replace(v_def, $s$  v_quem := CASE WHEN (SELECT origem FROM public.ju_mensagens WHERE id = p_mensagem_id) = 'CLIENTE'$s$,
    $s$  v_quem := public.fn_ju_recado_ctx(p_mensagem_id, '{}'::jsonb) -> 'quem_pediu' ->> 'nome';
  IF v_quem IS NULL THEN
  v_quem := CASE WHEN (SELECT origem FROM public.ju_mensagens WHERE id = p_mensagem_id) = 'CLIENTE'$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'fn_ju_comando_executar: v_quem não encontrado'; END IF;
  v_def := v_new;
  v_new := regexp_replace(v_def, $r$(                 ELSE 'Recepção' END;)$r$, E'\\1\n  END IF;');
  IF v_new = v_def THEN RAISE EXCEPTION 'fn_ju_comando_executar: fim do v_quem não encontrado'; END IF;
  EXECUTE v_new;
END $mig$;

-- Registrar resposta do @ju: na resposta a recado, a fisio recebe a confirmação do que foi passado.
CREATE OR REPLACE FUNCTION public.fn_ju_comando_resposta(p_mensagem_id bigint, p_status text, p_resposta text, p_proposta jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE k ju_comandos; r ju_recados; f record; v_txt text;
BEGIN
  SELECT * INTO k FROM ju_comandos WHERE mensagem_id = p_mensagem_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE ju_comandos
     SET resposta = left(p_resposta, 1000),
         status = CASE WHEN status IN ('agendado', 'cobrado', 'nota') THEN status ELSE coalesce(p_status, status) END,
         proposta = coalesce(proposta, p_proposta),
         concluido_em = coalesce(concluido_em, now())
   WHERE id = k.id;

  IF k.recado_id IS NULL OR k.concluido_em IS NOT NULL THEN RETURN; END IF;
  IF coalesce(p_status, '') IN ('pergunta', 'ajuda', 'nao_suportado') THEN RETURN; END IF; -- já foi para a fisio
  SELECT * INTO r FROM ju_recados WHERE id = k.recado_id;
  SELECT * INTO f FROM fn_ju_recado_chat_fisio(r.profissional_id);
  v_txt := CASE
    WHEN p_status = 'agendado' THEN '✅ Agendado. ' || CASE WHEN r.familia IS NOT NULL THEN 'A família de ' || coalesce(r.crianca, r.familia) ELSE 'A família' END || ' recebe a confirmação em seguida.'
    WHEN p_status = 'recusado' THEN 'Não consegui fazer isso pelo sistema. Avisei a recepção no grupo para resolver.'
    WHEN p_status = 'erro' THEN 'Não consegui passar sua resposta agora. Avisei a recepção no grupo.'
    WHEN coalesce(btrim(p_resposta), '') = '' THEN NULL
    ELSE '✅ Passei para ' || CASE WHEN r.familia IS NOT NULL THEN 'a família de ' || coalesce(r.crianca, r.familia) ELSE 'a família' END
         || ': “' || left(btrim(p_resposta), 600) || '”'
  END;
  IF v_txt IS NOT NULL THEN
    PERFORM fn_ju_recado_whats(f.numero, v_txt, f.conversa_id);
  END IF;
END $function$;

-- Ferramenta da Ju.
DO $mig$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.fn_ju_acao_fixo(jsonb)'::regprocedure);
  v_new := replace(v_def, $s$  IF v_acao = 'TROCAR_TOMADOR' THEN RETURN public.fn_ju_trocar_tomador(p); END IF;$s$,
    $s$  IF v_acao = 'TROCAR_TOMADOR' THEN RETURN public.fn_ju_trocar_tomador(p); END IF;
  IF v_acao = 'RECADO_FISIO' THEN RETURN public.fn_ju_recado_criar(p); END IF;$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'fn_ju_acao_fixo: despacho não encontrado'; END IF;
  EXECUTE v_new;
END $mig$;

REVOKE ALL ON FUNCTION public.fn_ju_recado_whats(text, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_recado_chat_fisio(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_recado_enviar(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_recado_criar(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_recado_rotear(bigint, bigint, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_recados_tick() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_recado_ctx(bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_comando_resposta(bigint, text, text, jsonb) FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('ju-recados') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ju-recados');
SELECT cron.schedule('ju-recados', '*/5 * * * *', 'SELECT public.fn_ju_recados_tick()');
