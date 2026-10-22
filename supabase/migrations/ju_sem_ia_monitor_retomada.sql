-- =====================================================================
-- Ju: etiqueta "🚫 SEM IA" — monitor de emergência + marco de retomada
-- =====================================================================
-- AI dev note (aprovado pelo dono em 21/10/2026):
-- 1. Monitor de segurança independente da Ju. Em conversa SEM IA, mensagem
--    nova do cliente com sinal de emergência gera um aviso urgente no grupo
--    🔔 Notificações (fluxo de Entrada). A Ju não é chamada, nada vai para a
--    família e a etiqueta continua. Um aviso por conversa a cada 30 min (os
--    seguintes ficam AGRUPADO). Confere texto, transcrição de áudio e legenda
--    de imagem/documento (não a descrição da imagem feita por IA: "roxo" num
--    brinquedo daria alarme falso). É só palavra-chave: proteção adicional,
--    não monitoramento clínico. A lista fica em ju_config.regex_emergencia.
-- 2. Ao tirar a etiqueta, o marco de retomada é a última mensagem recebida
--    (sem_ia_marco_msg_id) e a versão atual vira "respondida": nada recebido
--    durante o bloqueio é respondido depois, nem por execução atrasada nem
--    pela retomada das Tarefas. A pausa da Lolô não é mexida. No histórico da
--    Ju essas mensagens aparecem marcadas como já tratadas pela equipe.
-- =====================================================================

ALTER TABLE public.ju_config ADD COLUMN regex_emergencia text NOT NULL DEFAULT
  'n[aã]o (est[aá] |consegue )?respir|parou de respirar|sem respirar|dificuldade (pra|para|de) respirar|respirando (muito|com esfor)|roxo|roxa|arroxead|azulad|cianos|convuls|desmai|desacordad|inconscien|engasg|n[aã]o acorda|muito mole|falta de ar|sufoc|tiragem|costelas? afundand|socorro|emerg[eê]ncia';

ALTER TABLE public.ju_conversas ADD COLUMN sem_ia_marco_msg_id bigint;
ALTER TABLE public.ju_mensagens ADD COLUMN durante_sem_ia boolean NOT NULL DEFAULT false;

CREATE TABLE public.ju_alertas_sem_ia (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversa_id  bigint NOT NULL REFERENCES public.ju_conversas(id) ON DELETE CASCADE,
  mensagem_id  bigint NOT NULL UNIQUE REFERENCES public.ju_mensagens(id) ON DELETE CASCADE,
  sinal        text NOT NULL,
  trecho       text,
  status       text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'ENVIADO', 'FALHOU', 'AGRUPADO')),
  grupo_msg_id text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  enviado_em   timestamptz
);
CREATE INDEX ju_alertas_sem_ia_conversa_idx ON public.ju_alertas_sem_ia (conversa_id, created_at DESC);
ALTER TABLE public.ju_alertas_sem_ia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_alertas_sem_ia FROM anon, authenticated;


-- Confere uma mensagem do cliente. Devolve {id, texto} quando é para avisar o
-- grupo; NULL em todo o resto (conversa sem a etiqueta, sem sinal, repetida).
CREATE FUNCTION public.fn_ju_monitor_sem_ia(p_msg_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  m        public.ju_mensagens;
  c        public.ju_conversas;
  v_txt    text;
  v_sinal  text;
  v_id     bigint;
  v_ctx    jsonb;
  v_contato text;
  v_pac    text;
  v_trecho text;
BEGIN
  SELECT * INTO m FROM public.ju_mensagens WHERE id = p_msg_id;
  IF NOT FOUND OR m.origem <> 'CLIENTE' THEN RETURN NULL; END IF;
  SELECT * INTO c FROM public.ju_conversas WHERE id = m.conversa_id FOR UPDATE;
  IF NOT c.sem_ia THEN RETURN NULL; END IF;

  v_txt := CASE WHEN m.tipo IN ('TEXT', 'AUDIO') THEN m.conteudo
                ELSE substring(m.conteudo FROM '^Legenda: ([^\n]*)') END;
  IF nullif(btrim(v_txt), '') IS NULL THEN RETURN NULL; END IF;

  v_sinal := (regexp_match(v_txt, '(' || (SELECT k.regex_emergencia FROM public.ju_config k WHERE k.id = 1) || ')', 'i'))[1];
  IF v_sinal IS NULL THEN RETURN NULL; END IF;

  v_trecho := CASE WHEN length(v_txt) > 300 THEN left(v_txt, 300) || '…' ELSE v_txt END;

  -- mesma ocorrência: já avisou (ou está avisando) essa conversa há menos de 30 min
  IF EXISTS (SELECT 1 FROM public.ju_alertas_sem_ia a
              WHERE a.conversa_id = c.id AND a.status IN ('PENDENTE', 'ENVIADO')
                AND a.created_at > now() - interval '30 minutes') THEN
    INSERT INTO public.ju_alertas_sem_ia (conversa_id, mensagem_id, sinal, trecho, status)
    VALUES (c.id, m.id, v_sinal, v_trecho, 'AGRUPADO')
    ON CONFLICT (mensagem_id) DO NOTHING;
    RETURN NULL;
  END IF;

  INSERT INTO public.ju_alertas_sem_ia (conversa_id, mensagem_id, sinal, trecho)
  VALUES (c.id, m.id, v_sinal, v_trecho)
  ON CONFLICT (mensagem_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN NULL; END IF;

  v_ctx := public.fn_ju_contexto_cliente(c.id);
  v_contato := coalesce(v_ctx->>'responsavel_identificado',
                        (SELECT string_agg(x, ' / ') FROM jsonb_array_elements_text(v_ctx->'responsaveis') x),
                        'não identificado');
  v_pac := (SELECT string_agg(p->>'nome', ', ') FROM jsonb_array_elements(v_ctx->'pacientes') p);

  RETURN jsonb_build_object(
    'id', v_id,
    'texto',
      '🚨 *ALERTA CLÍNICO — CONVERSA SEM IA*' || E'\n\n' ||
      'Possível emergência numa conversa bloqueada para atendimento automático.' || E'\n\n' ||
      '*Contato:* ' || v_contato || coalesce(' · ' || c.telefone, '') || E'\n' ||
      coalesce('*Paciente:* ' || v_pac || E'\n', '') ||
      '*Sinal detectado:* "' || v_sinal || '"' || E'\n' ||
      '*Mensagem:* "' || v_trecho || '"' || E'\n\n' ||
      'A família *NÃO* recebeu orientação automática.' || E'\n' ||
      '*Ação necessária:* verificar a conversa imediatamente.' ||
      coalesce(E'\n' || 'https://wa.me/' || nullif(ltrim(c.telefone, '+'), ''), ''));
END;
$$;

-- Resultado do envio para o grupo (o fluxo de Entrada chama depois de enviar).
CREATE FUNCTION public.fn_ju_alerta_sem_ia_status(p_id bigint, p_grupo_msg_id text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.ju_alertas_sem_ia
     SET status = CASE WHEN nullif(p_grupo_msg_id, '') IS NOT NULL THEN 'ENVIADO' ELSE 'FALHOU' END,
         grupo_msg_id = nullif(p_grupo_msg_id, ''),
         enviado_em = now()
   WHERE id = p_id AND status = 'PENDENTE'
  RETURNING jsonb_build_object('id', id, 'status', status);
$$;

REVOKE ALL ON FUNCTION public.fn_ju_monitor_sem_ia(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_alerta_sem_ia_status(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_monitor_sem_ia(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ju_alerta_sem_ia_status(bigint, text) TO service_role;


-- Ao tirar a etiqueta: marco = última mensagem recebida; a versão atual conta
-- como respondida. Status e pausa ficam como estão (a Lolô tem prioridade).
CREATE OR REPLACE FUNCTION public.fn_ju_sem_ia_sync(p_wa_chatid text, p_etiquetas text[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_et   text := (SELECT k.etiqueta_sem_ia FROM public.ju_config k WHERE k.id = 1);
  v_novo boolean := coalesce(v_et = ANY (p_etiquetas), false);
  c      public.ju_conversas;
BEGIN
  IF p_wa_chatid IS NULL OR p_wa_chatid !~ '@(s\.whatsapp\.net|lid)$' THEN RETURN NULL; END IF;
  INSERT INTO public.ju_conversas (wa_chatid, telefone)
  VALUES (p_wa_chatid, CASE WHEN p_wa_chatid LIKE '%@s.whatsapp.net'
                            THEN public.fn_ju_telefone(split_part(p_wa_chatid, '@', 1)) END)
  ON CONFLICT (wa_chatid) DO NOTHING;
  SELECT * INTO c FROM public.ju_conversas WHERE wa_chatid = p_wa_chatid FOR UPDATE;
  IF c.sem_ia IS DISTINCT FROM v_novo THEN
    IF v_novo THEN
      UPDATE public.ju_conversas SET sem_ia = true, sem_ia_em = now(), updated_at = now() WHERE id = c.id;
    ELSE
      UPDATE public.ju_conversas
         SET sem_ia = false, sem_ia_em = now(), updated_at = now(),
             sem_ia_marco_msg_id = (SELECT max(m.id) FROM public.ju_mensagens m WHERE m.conversa_id = c.id),
             ultima_versao_respondida = greatest(coalesce(ultima_versao_respondida, 0), message_version),
             retomada_versao = message_version
       WHERE id = c.id;
    END IF;
    INSERT INTO public.ju_bloqueio_log (conversa_id, wa_chatid, acao)
    VALUES (c.id, p_wa_chatid, CASE WHEN v_novo THEN 'APLICADA' ELSE 'REMOVIDA' END);
  END IF;
  RETURN v_novo;
END;
$$;


DO $do$
DECLARE d text; n text;
BEGIN
  -- entrada: marca a mensagem recebida com a etiqueta e roda o monitor
  d := pg_get_functiondef('public.fn_ju_receber'::regproc);
  n := replace(d, $a$  v_env    bigint;
BEGIN$a$, $b$  v_env    bigint;
  v_alerta jsonb;
BEGIN$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_receber: DECLARE não encontrado'; END IF;
  d := n;
  n := replace(d, $a$(conversa_id, wa_message_id, origem, tipo, conteudo, versao)$a$,
                  $b$(conversa_id, wa_message_id, origem, tipo, conteudo, versao, durante_sem_ia)$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_receber: colunas do INSERT não encontradas'; END IF;
  d := n;
  n := replace(d, $a$CASE WHEN v_conta THEN c.message_version + 1 END)
  ON CONFLICT (wa_message_id)$a$, $b$CASE WHEN v_conta THEN c.message_version + 1 END, c.sem_ia)
  ON CONFLICT (wa_message_id)$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_receber: VALUES do INSERT não encontrado'; END IF;
  d := n;
  n := replace(d, $a$   WHERE id = c.id
  RETURNING * INTO c;

  RETURN jsonb_build_object($a$, $b$   WHERE id = c.id
  RETURNING * INTO c;

  v_alerta := public.fn_ju_monitor_sem_ia(v_msg);

  RETURN jsonb_build_object($b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_receber: retorno final não encontrado'; END IF;
  d := n;
  n := replace(d, $a$    'sem_ia', c.sem_ia);$a$, $b$    'sem_ia', c.sem_ia,
    'alerta_sem_ia', v_alerta);$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_receber: sem_ia do retorno não encontrado'; END IF;
  EXECUTE n;

  -- mídia: depois da transcrição/legenda, roda o monitor de novo
  d := pg_get_functiondef('public.fn_ju_midia'::regproc);
  n := replace(d, $a$    'versao', c.message_version);$a$, $b$    'versao', c.message_version,
    'alerta_sem_ia', public.fn_ju_monitor_sem_ia(
      (SELECT m.id FROM public.ju_mensagens m WHERE m.wa_message_id = p_wa_message_id)));$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_midia: retorno não encontrado'; END IF;
  EXECUTE n;

  -- histórico da Ju: o que chegou durante o bloqueio já foi tratado pela equipe
  d := pg_get_functiondef('public.fn_ju_turno'::regproc);
  n := replace(d, $a$CASE m.origem WHEN 'CLIENTE' THEN 'Cliente' WHEN 'JU'$a$,
                  $b$CASE m.origem WHEN 'CLIENTE' THEN CASE WHEN m.durante_sem_ia
                                              THEN 'Cliente (enviada com a Ju bloqueada; a equipe já cuidou)'
                                              ELSE 'Cliente' END
                             WHEN 'JU'$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_turno: rótulo do histórico não encontrado'; END IF;
  EXECUTE n;
END
$do$;


-- ---------------------------------------------------------------------
-- Ajustes do teste ao vivo (21/10/2026, cenário "etiqueta reaplicada"):
-- a) Mensagem que chegou ANTES da etiqueta e ficou sem resposta também é
--    fechada pelo marco: ao tirar a etiqueta, toda mensagem do cliente com
--    versão ainda não respondida ganha durante_sem_ia = true (o histórico da
--    Ju a mostra como já tratada pela equipe). No teste, a pergunta chegou 7 s
--    antes da etiqueta e a Ju a respondeu junto com a nova.
-- b) O turno devolve o id da etiqueta, para o Atendimento conferir as
--    etiquetas da conversa direto no WhatsApp logo antes de enviar (o evento
--    chat_labels chega ~1,5 s depois de a Lolô aplicar a etiqueta).
-- ---------------------------------------------------------------------
DO $do$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_sem_ia_sync'::regproc);
  n := replace(d, $a$             retomada_versao = message_version
       WHERE id = c.id;$a$, $b$             retomada_versao = message_version
       WHERE id = c.id;
      UPDATE public.ju_mensagens m
         SET durante_sem_ia = true
       WHERE m.conversa_id = c.id AND m.origem = 'CLIENTE'
         AND m.versao > coalesce(c.ultima_versao_respondida, 0);$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_sem_ia_sync: trecho da remoção não encontrado'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.fn_ju_turno'::regproc);
  n := replace(d, $a$    'wa_chatid', c.wa_chatid,$a$, $b$    'wa_chatid', c.wa_chatid,
    'etiqueta_sem_ia', (SELECT k.etiqueta_sem_ia FROM public.ju_config k WHERE k.id = 1),$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_turno: wa_chatid não encontrado'; END IF;
  d := n;
  n := replace(d, $a$THEN 'Cliente (enviada com a Ju bloqueada; a equipe já cuidou)'$a$,
                  $b$THEN 'Cliente (do período em que a Ju estava bloqueada; a equipe já cuidou)'$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_turno: rótulo não encontrado'; END IF;
  EXECUTE n;
END
$do$;

-- c) Ações também confere ao vivo: o modo da conversa devolve o chat e o id
--    da etiqueta (o fluxo pergunta à uazapi /chat/details; se a consulta
--    falhar, vale o que o banco diz).
CREATE OR REPLACE FUNCTION public.fn_ju_modo_conversa(p_conversa_id bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'sombra', coalesce(public.fn_ju_sombra(c.telefone), false),
    'sem_ia', c.sem_ia,
    'wa_chatid', c.wa_chatid,
    'etiqueta_sem_ia', (SELECT k.etiqueta_sem_ia FROM public.ju_config k WHERE k.id = 1),
    'alerta_simulado', (SELECT k.sombra_alerta FROM public.ju_config k WHERE k.id = 1))
  FROM public.ju_conversas c WHERE c.id = p_conversa_id;
$$;
