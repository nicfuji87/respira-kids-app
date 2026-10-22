-- =====================================================================
-- Ju: turno do Atendimento (agente com ferramentas) e pedidos à secretaria
-- =====================================================================
-- AI dev note: desenho de 16/10/2026.
--   - fn_ju_turno: gate + tudo que o agente precisa (contexto, histórico do
--     nosso banco, base, serviços, termos, agendas, pedidos abertos), uma
--     chamada por turno. Não responde com mídia do cliente ainda sendo lida
--     (a Entrada chama de novo quando a mídia fica pronta) e responde cada
--     versão uma vez só.
--   - fn_ju_responder: confere de novo logo antes de enviar e marca a versão
--     como respondida. Guarda o texto para reconhecer o eco da uazapi (a
--     mensagem da Ju volta pelo webhook como "enviada pela API").
--   - fn_ju_chamar_secretaria: um pedido aberto por tipo e conversa. Se já
--     existe, só acrescenta a atualização (o grupo recebe uma resposta citando
--     o aviso, não um aviso novo). Já devolve os textos e a etiqueta.
--   - fn_ju_concluir: pelo botão "Concluído" (id do pedido) ou pela etiqueta
--     tirada no celular (chat + etiqueta). Sem pedido aberto, a Ju volta.
-- Etiquetas (decisão do dono, opção A): 22 Responder, 23 Agendar,
-- 24 Remarcar/cancelar, 25 Financeiro, 26 Nota/contrato, 27 Urgente.
-- =====================================================================

ALTER TABLE public.ju_conversas
  ADD COLUMN ultima_versao_respondida bigint NOT NULL DEFAULT 0,
  ADD COLUMN resposta_pendente text,
  ADD COLUMN resposta_pendente_em timestamptz;

ALTER TABLE public.ju_solicitacoes
  DROP CONSTRAINT ju_solicitacoes_idempotente,
  ALTER COLUMN versao DROP NOT NULL,
  ADD COLUMN etiqueta text,
  ADD COLUMN urgente boolean NOT NULL DEFAULT false,
  ADD COLUMN dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN atualizacoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN notificacao_msg_id text,
  ADD COLUMN lembretes integer NOT NULL DEFAULT 0,
  ADD COLUMN resolvida_por text;
-- um pedido aberto por tipo na conversa (é o que segura o aviso duplicado)
CREATE UNIQUE INDEX ju_solicitacoes_aberta_por_tipo
  ON public.ju_solicitacoes (conversa_id, tipo) WHERE status = 'ABERTA';
CREATE INDEX ju_solicitacoes_abertas_idx ON public.ju_solicitacoes (created_at) WHERE status = 'ABERTA';

-- substituídas pelas funções abaixo
DROP FUNCTION public.fn_ju_escalar(bigint, bigint, text, text, uuid, text);
DROP FUNCTION public.fn_ju_pode_enviar(bigint, bigint);
DROP FUNCTION public.fn_ju_dados_turno(bigint);


-- ---------------------------------------------------------------------
-- 1. Turno
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_turno(p_conversa_id bigint, p_versao bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c        public.ju_conversas;
  v_motivo text;
BEGIN
  SELECT * INTO c FROM public.ju_conversas WHERE id = p_conversa_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('pode', false, 'motivo', 'CONVERSA_INEXISTENTE');
  END IF;

  v_motivo := CASE
    WHEN c.message_version <> p_versao THEN 'MENSAGEM_NOVA'
    WHEN p_versao <= c.ultima_versao_respondida THEN 'JA_RESPONDIDA'
    WHEN c.status = 'PAUSADA' AND c.pause_until > now() THEN 'PAUSADA'
    WHEN EXISTS (SELECT 1 FROM public.ju_mensagens m
                 WHERE m.conversa_id = c.id AND m.origem = 'CLIENTE'
                   AND m.tipo IN ('AUDIO','IMAGE','DOCUMENT') AND m.conteudo IS NULL
                   AND m.created_at > now() - interval '2 minutes') THEN 'MIDIA_PENDENTE'
  END;
  IF v_motivo IS NOT NULL THEN
    RETURN jsonb_build_object('pode', false, 'motivo', v_motivo);
  END IF;

  RETURN jsonb_build_object(
    'pode', true,
    'modo', CASE WHEN c.status = 'AGUARDANDO_EQUIPE' THEN 'ANOTAR' ELSE 'RESPONDER' END,
    'conversa_id', c.id,
    'versao', p_versao,
    'agora', (ARRAY['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'])
               [extract(dow FROM now() AT TIME ZONE 'America/Sao_Paulo')::int + 1]
             || ', ' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
    'cliente', public.fn_ju_contexto_cliente(c.id),
    'pedidos_abertos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('tipo', s.tipo, 'resumo', s.resumo,
                                          'aberto_em', to_char(s.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'))
                       ORDER BY s.created_at)
      FROM public.ju_solicitacoes s WHERE s.conversa_id = c.id AND s.status = 'ABERTA'), '[]'::jsonb),
    'historico', coalesce((
      SELECT jsonb_agg(h.linha ORDER BY h.created_at)
      FROM (
        SELECT m.created_at,
               to_char(m.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') || ' ' ||
               CASE m.origem WHEN 'CLIENTE' THEN 'Cliente' WHEN 'JU' THEN 'Ju'
                             WHEN 'HUMANO' THEN 'Recepção (Lolô)' ELSE 'Mensagem automática' END || ': ' ||
               coalesce(m.conteudo, '[' || lower(m.tipo) || ' sem texto]') AS linha
        FROM public.ju_mensagens m
        WHERE m.conversa_id = c.id
          AND m.created_at > now() - interval '30 days'
          -- a transcrição que volta para a família já está no próprio áudio
          AND NOT (m.origem = 'AUTOMACAO' AND m.conteudo LIKE 'Transcrição do áudio:%')
        ORDER BY m.created_at DESC
        LIMIT 40) h), '[]'::jsonb),
    'agendas_publicas', public.fn_ju_agendas_publicas(c.id),
    'servicos', public.fn_ju_servicos(),
    'termos_contrato', public.fn_ju_termos_contrato(),
    'base_de_conhecimento', coalesce((SELECT jsonb_object_agg(k.id, k.texto)
                                      FROM public.ju_conhecimento k WHERE k.ativo), '{}'::jsonb));
END;
$$;


-- ---------------------------------------------------------------------
-- 2. Liberar o envio (logo antes de mandar). Modo RESPONDER: Ju no comando,
--    ou a escalada criada neste mesmo turno (a família precisa ser avisada).
--    Modo ANOTAR: handoff; a nota vai citando o aviso do pedido no grupo.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_responder(p_conversa_id bigint, p_versao bigint, p_modo text, p_texto text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c        public.ju_conversas;
  v_pode   boolean;
BEGIN
  SELECT * INTO c FROM public.ju_conversas WHERE id = p_conversa_id FOR UPDATE;
  IF NOT FOUND OR c.message_version <> p_versao OR p_versao <= c.ultima_versao_respondida THEN
    RETURN jsonb_build_object('pode', false, 'motivo', 'MENSAGEM_NOVA_OU_RESPONDIDA');
  END IF;

  v_pode := CASE
    WHEN p_modo = 'RESPONDER' THEN
      c.status = 'ATIVA'
      OR (c.status = 'PAUSADA' AND c.pause_until <= now())
      OR (c.status = 'AGUARDANDO_EQUIPE' AND EXISTS (
            SELECT 1 FROM public.ju_solicitacoes s
            WHERE s.conversa_id = c.id AND s.status = 'ABERTA' AND s.versao = p_versao))
    WHEN p_modo = 'ANOTAR' THEN c.status = 'AGUARDANDO_EQUIPE'
    ELSE false END;
  IF NOT v_pode THEN
    RETURN jsonb_build_object('pode', false, 'motivo', c.status);
  END IF;

  UPDATE public.ju_conversas
     SET ultima_versao_respondida = p_versao,
         resposta_pendente = CASE WHEN p_modo = 'RESPONDER' THEN btrim(p_texto) END,
         resposta_pendente_em = CASE WHEN p_modo = 'RESPONDER' THEN now() END,
         status = CASE WHEN status = 'PAUSADA' THEN 'ATIVA' ELSE status END,
         pause_until = CASE WHEN status = 'PAUSADA' THEN NULL ELSE pause_until END,
         updated_at = now()
   WHERE id = c.id;

  RETURN jsonb_build_object(
    'pode', true,
    'wa_chatid', c.wa_chatid,
    -- no modo anotar: o aviso mais recente aberto, para citar no grupo
    'citar', (SELECT s.notificacao_msg_id FROM public.ju_solicitacoes s
              WHERE s.conversa_id = c.id AND s.status = 'ABERTA' AND s.notificacao_msg_id IS NOT NULL
              ORDER BY s.created_at DESC LIMIT 1));
END;
$$;


-- ---------------------------------------------------------------------
-- 3. Entrada: o eco da resposta da Ju chega como "enviada pela API";
--    se o texto bate com a resposta pendente, a origem é JU.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ju_receber(
  p_wa_message_id text, p_wa_chatid text, p_telefone text,
  p_from_me boolean, p_via_api boolean, p_tipo text, p_conteudo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c        public.ju_conversas;
  v_origem text := CASE WHEN NOT p_from_me THEN 'CLIENTE'
                        WHEN p_via_api THEN 'AUTOMACAO'
                        ELSE 'HUMANO' END;
  v_tipo   text := CASE WHEN upper(p_tipo) IN ('TEXT','AUDIO','IMAGE','DOCUMENT','VIDEO','BOTAO')
                        THEN upper(p_tipo) ELSE 'OUTRO' END;
  v_conta  boolean := v_origem = 'CLIENTE' AND v_tipo <> 'BOTAO';
  v_msg    bigint;
BEGIN
  INSERT INTO public.ju_conversas (wa_chatid, telefone)
  VALUES (p_wa_chatid, public.fn_ju_telefone(p_telefone))
  ON CONFLICT (wa_chatid) DO NOTHING;
  SELECT * INTO c FROM public.ju_conversas WHERE wa_chatid = p_wa_chatid FOR UPDATE;

  IF v_origem = 'AUTOMACAO' AND c.resposta_pendente IS NOT NULL
     AND c.resposta_pendente_em > now() - interval '5 minutes'
     AND btrim(coalesce(p_conteudo, '')) = c.resposta_pendente THEN
    v_origem := 'JU';
    UPDATE public.ju_conversas SET resposta_pendente = NULL, resposta_pendente_em = NULL WHERE id = c.id;
  END IF;

  INSERT INTO public.ju_mensagens (conversa_id, wa_message_id, origem, tipo, conteudo, versao)
  VALUES (c.id, p_wa_message_id, v_origem, v_tipo, nullif(btrim(p_conteudo), ''),
          CASE WHEN v_conta THEN c.message_version + 1 END)
  ON CONFLICT (wa_message_id) DO NOTHING
  RETURNING id INTO v_msg;
  IF v_msg IS NULL THEN
    RETURN jsonb_build_object('acao', 'NADA', 'motivo', 'DUPLICADA');
  END IF;

  IF v_origem = 'HUMANO' THEN
    UPDATE public.ju_conversas
       SET status = CASE WHEN status = 'AGUARDANDO_EQUIPE' THEN status ELSE 'PAUSADA' END,
           pause_until = CASE WHEN status = 'AGUARDANDO_EQUIPE' THEN NULL ELSE now() + interval '15 minutes' END,
           ultima_mensagem_humano = now(), updated_at = now()
     WHERE id = c.id;
    RETURN jsonb_build_object('acao', 'NADA', 'motivo', 'HUMANO', 'conversa_id', c.id);
  ELSIF NOT v_conta THEN
    RETURN jsonb_build_object('acao', 'NADA', 'motivo', v_origem || ':' || v_tipo, 'conversa_id', c.id);
  END IF;

  UPDATE public.ju_conversas
     SET message_version = message_version + 1,
         telefone = coalesce(public.fn_ju_telefone(p_telefone), telefone),
         ultima_mensagem_cliente = now(),
         status = CASE WHEN status = 'PAUSADA' AND pause_until <= now() THEN 'ATIVA' ELSE status END,
         pause_until = CASE WHEN status = 'PAUSADA' AND pause_until <= now() THEN NULL ELSE pause_until END,
         updated_at = now()
   WHERE id = c.id
  RETURNING * INTO c;

  RETURN jsonb_build_object(
    'acao', CASE c.status WHEN 'ATIVA' THEN 'PROCESSAR'
                          WHEN 'AGUARDANDO_EQUIPE' THEN 'ANOTAR'
                          ELSE 'AGUARDAR' END,
    'motivo', c.status,
    'conversa_id', c.id,
    'versao', c.message_version,
    'midia', v_tipo IN ('AUDIO','IMAGE','DOCUMENT'));
END;
$$;


-- ---------------------------------------------------------------------
-- 4. Chamar a secretaria. Devolve se é aviso novo ou atualização, a
--    etiqueta, o chat e os textos prontos para o grupo.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_chamar_secretaria(
  p_conversa_id bigint, p_versao bigint, p_tipo text, p_resumo text,
  p_urgente boolean DEFAULT false, p_paciente_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c          public.ju_conversas;
  s          public.ju_solicitacoes;
  v_tipo     text := CASE WHEN upper(p_tipo) IN ('AGENDAMENTO','REMARCACAO','CANCELAMENTO','FINANCEIRO','CONTRATO',
                                                 'NOTA_FISCAL','CLINICO','RECLAMACAO','HUMANO','OUTRO')
                          THEN upper(p_tipo) ELSE 'OUTRO' END;
  v_etiqueta text;
  v_assunto  text;
  v_pac      text;
  v_ctx      jsonb;
  v_resumo   text := left(btrim(coalesce(p_resumo, '')), 1800);
BEGIN
  SELECT * INTO c FROM public.ju_conversas WHERE id = p_conversa_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'CONVERSA_INEXISTENTE');
  END IF;

  v_etiqueta := CASE WHEN p_urgente THEN '27'
                     WHEN v_tipo = 'AGENDAMENTO' THEN '23'
                     WHEN v_tipo IN ('REMARCACAO','CANCELAMENTO') THEN '24'
                     WHEN v_tipo = 'FINANCEIRO' THEN '25'
                     WHEN v_tipo IN ('NOTA_FISCAL','CONTRATO') THEN '26'
                     ELSE '22' END;
  v_assunto := CASE v_tipo WHEN 'AGENDAMENTO' THEN 'Agendamento' WHEN 'REMARCACAO' THEN 'Remarcação'
                           WHEN 'CANCELAMENTO' THEN 'Cancelamento' WHEN 'FINANCEIRO' THEN 'Financeiro'
                           WHEN 'CONTRATO' THEN 'Contrato' WHEN 'NOTA_FISCAL' THEN 'Nota fiscal'
                           WHEN 'CLINICO' THEN 'Clínico' WHEN 'RECLAMACAO' THEN 'Reclamação'
                           WHEN 'HUMANO' THEN 'Pediu atendente' ELSE 'Outro' END
               || CASE WHEN p_urgente THEN ' (URGENTE)' ELSE '' END;

  -- paciente só se estiver no escopo do telefone (a IA nunca amplia acesso)
  v_ctx := public.fn_ju_contexto_cliente(c.id);
  SELECT x ->> 'nome' INTO v_pac FROM jsonb_array_elements(v_ctx -> 'pacientes') x
   WHERE (x ->> 'paciente_id')::uuid = p_paciente_id;
  IF v_pac IS NULL THEN p_paciente_id := NULL; END IF;
  IF v_pac IS NULL AND jsonb_array_length(v_ctx -> 'pacientes') = 1 THEN
    v_pac := v_ctx -> 'pacientes' -> 0 ->> 'nome';
  END IF;

  SELECT * INTO s FROM public.ju_solicitacoes
   WHERE conversa_id = c.id AND tipo = v_tipo AND status = 'ABERTA' FOR UPDATE;

  IF FOUND THEN   -- já existe: só acrescenta (o grupo recebe uma resposta citando o aviso)
    UPDATE public.ju_solicitacoes
       SET atualizacoes = atualizacoes || jsonb_build_object('em', now(), 'resumo', v_resumo),
           urgente = urgente OR p_urgente
     WHERE id = s.id;
    RETURN jsonb_build_object(
      'ok', true, 'novo', false, 'solicitacao_id', s.id,
      'wa_chatid', c.wa_chatid, 'etiqueta', s.etiqueta, 'citar', s.notificacao_msg_id,
      'texto_grupo', '📝 Atualização: ' || v_resumo,
      'resposta_ia', 'A secretaria já tinha sido avisada sobre isso; a informação nova foi acrescentada ao pedido. Avise a família que a secretaria segue com o pedido e responde por aqui.');
  END IF;

  INSERT INTO public.ju_solicitacoes (conversa_id, versao, paciente_id, tipo, setor, resumo, etiqueta, urgente)
  VALUES (c.id, p_versao, p_paciente_id, v_tipo,
          CASE WHEN v_tipo = 'CLINICO' THEN 'FISIOTERAPIA' ELSE 'SECRETARIA' END,
          v_resumo, v_etiqueta, p_urgente)
  RETURNING * INTO s;

  UPDATE public.ju_conversas SET status = 'AGUARDANDO_EQUIPE', pause_until = NULL, updated_at = now()
   WHERE id = c.id;

  RETURN jsonb_build_object(
    'ok', true, 'novo', true, 'solicitacao_id', s.id,
    'wa_chatid', c.wa_chatid, 'etiqueta', v_etiqueta,
    'texto_grupo',
      CASE WHEN p_urgente THEN '🚨' ELSE '🔔' END || ' *' || v_assunto || '*' || E'\n'
      || '*Paciente:* ' || coalesce(v_pac, 'não identificado') || E'\n'
      || '*Contato:* ' || coalesce(
           CASE WHEN c.telefone ~ '^\+55[0-9]{11}$'
                THEN '(' || substr(c.telefone, 4, 2) || ') ' || substr(c.telefone, 6, 5) || '-' || substr(c.telefone, 11)
                ELSE c.telefone END, 'sem telefone') || E'\n\n'
      || v_resumo || E'\n\n'
      || 'Quando terminar, toque em Concluído ou tire a etiqueta da conversa.',
    'resposta_ia', 'Pedido registrado e secretaria avisada. Diga à família, em poucas palavras, que a secretaria vai responder por aqui.');
END;
$$;


-- ---------------------------------------------------------------------
-- 5. Guarda o id da mensagem do aviso (para citar nas atualizações e lembretes)
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_solicitacao_notificada(p_solicitacao_id bigint, p_msg_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.ju_solicitacoes SET notificacao_msg_id = nullif(btrim(p_msg_id), '')
   WHERE id = p_solicitacao_id;
$$;


-- ---------------------------------------------------------------------
-- 6. Concluir: pelo botão (p_solicitacao_id) ou pela etiqueta tirada no
--    celular (p_wa_chatid + p_etiqueta). Sem pedido aberto, a Ju volta.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_concluir(p_solicitacao_id bigint DEFAULT NULL, p_wa_chatid text DEFAULT NULL,
                                      p_etiqueta text DEFAULT NULL, p_por text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s public.ju_solicitacoes;
  v_chat text;
  v_restam integer;
BEGIN
  IF p_solicitacao_id IS NOT NULL THEN
    SELECT * INTO s FROM public.ju_solicitacoes WHERE id = p_solicitacao_id FOR UPDATE;
  ELSE
    SELECT so.* INTO s FROM public.ju_solicitacoes so
      JOIN public.ju_conversas c ON c.id = so.conversa_id
     WHERE c.wa_chatid = p_wa_chatid AND so.etiqueta = p_etiqueta AND so.status = 'ABERTA'
     ORDER BY so.created_at LIMIT 1 FOR UPDATE OF so;
  END IF;
  IF s.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'PEDIDO_NAO_ENCONTRADO');
  END IF;

  SELECT wa_chatid INTO v_chat FROM public.ju_conversas WHERE id = s.conversa_id;
  IF s.status <> 'ABERTA' THEN
    RETURN jsonb_build_object('ok', true, 'ja_concluido', true, 'wa_chatid', v_chat, 'etiqueta', s.etiqueta);
  END IF;

  UPDATE public.ju_solicitacoes SET status = 'RESOLVIDA', resolvida_em = now(), resolvida_por = p_por
   WHERE id = s.id;
  SELECT count(*) INTO v_restam FROM public.ju_solicitacoes WHERE conversa_id = s.conversa_id AND status = 'ABERTA';
  IF v_restam = 0 THEN
    UPDATE public.ju_conversas SET status = 'ATIVA', pause_until = NULL, updated_at = now()
     WHERE id = s.conversa_id AND status = 'AGUARDANDO_EQUIPE';
  END IF;

  RETURN jsonb_build_object('ok', true, 'ja_concluido', false, 'solicitacao_id', s.id,
                            'wa_chatid', v_chat, 'etiqueta', s.etiqueta, 'pedidos_restantes', v_restam,
                            -- a etiqueta só sai se nenhum outro pedido aberto usa a mesma
                            'tirar_etiqueta', NOT EXISTS (SELECT 1 FROM public.ju_solicitacoes
                                                           WHERE conversa_id = s.conversa_id AND status = 'ABERTA'
                                                             AND etiqueta = s.etiqueta));
END;
$$;


-- ---------------------------------------------------------------------
-- 7. Acompanhamento das notas: usa o mesmo pedido à secretaria
--    (dedupe, etiqueta, texto do grupo). Devolve só o que precisa de aviso.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ju_nf_acompanhar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r      record;
  v_out  jsonb := '[]'::jsonb;
  v_res  jsonb;
BEGIN
  UPDATE public.ju_acoes ja
     SET status = 'CONCLUIDA', updated_at = now()
    FROM public.faturas f
   WHERE ja.tipo = 'NF_EMITIR' AND ja.status = 'OK' AND f.id = ja.alvo_id
     AND f.link_nfe ~ '^https://'
     AND coalesce(f.status_nfe, '') !~* '(falha|retorno da prefeitura|erro)';

  FOR r IN
    SELECT ja.id AS acao_id, ja.conversa_id, f.paciente_id, f.descricao, f.status_nfe
    FROM public.ju_acoes ja
    JOIN public.faturas f ON f.id = ja.alvo_id
    WHERE ja.tipo = 'NF_EMITIR' AND ja.status = 'OK'
      AND ja.created_at > now() - interval '7 days'
      AND (f.link_nfe = 'erro' OR coalesce(f.status_nfe, '') ~* '(falha|retorno da prefeitura)')
    FOR UPDATE OF ja SKIP LOCKED
  LOOP
    v_res := public.fn_ju_chamar_secretaria(
      r.conversa_id, NULL, 'NOTA_FISCAL',
      'A nota fiscal que a Ju pediu voltou com erro de novo. Fatura: ' || coalesce(r.descricao, '-')
        || '. Retorno: ' || coalesce(r.status_nfe, 'sem detalhe'),
      false, r.paciente_id);
    UPDATE public.ju_acoes SET status = 'ESCALADA', detalhe = left(r.status_nfe, 1000), updated_at = now()
     WHERE id = r.acao_id;
    v_out := v_out || v_res;
  END LOOP;

  RETURN v_out;
END;
$$;


REVOKE ALL ON FUNCTION
  public.fn_ju_turno(bigint, bigint),
  public.fn_ju_responder(bigint, bigint, text, text),
  public.fn_ju_chamar_secretaria(bigint, bigint, text, text, boolean, uuid),
  public.fn_ju_solicitacao_notificada(bigint, text),
  public.fn_ju_concluir(bigint, text, text, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.fn_ju_turno(bigint, bigint),
  public.fn_ju_responder(bigint, bigint, text, text),
  public.fn_ju_chamar_secretaria(bigint, bigint, text, text, boolean, uuid),
  public.fn_ju_solicitacao_notificada(bigint, text),
  public.fn_ju_concluir(bigint, text, text, text)
TO service_role;
