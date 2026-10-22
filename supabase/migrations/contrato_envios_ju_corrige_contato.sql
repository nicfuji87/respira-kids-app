-- =====================================================================
-- Contrato: registro de cada envio à Assinafy + Ju corrige e-mail/WhatsApp (22/10/2026)
-- =====================================================================
-- AI dev note: pedido do dono. Quando o contrato está pendente, a Ju confere com a
-- família os dados para onde ele vai; se estiverem certos, reenvia; se não, corrige
-- e reenvia, e avisa o grupo 🔔 Notificações. Peças:
--  1. contrato_envios: o n8n "[RK] Webhook Contrato" grava aqui o resultado de cada
--     envio (fn_contrato_envio_registrar). Falha vira aviso no grupo. Antes o envio
--     falhava em silêncio (caso Laís, contrato de abril nunca chegou).
--  2. ju_avisos_grupo: fila de avisos avulsos; sai pelo fn_ju_tarefas junto com os
--     lembretes (mesmo webhook, com reserva pelo número do Nicolas).
--  3. fn_ju_contrato_corrigir_contato: a Ju troca e-mail e/ou WhatsApp do signatário
--     do contrato pendente. Só se quem conversa É quem assina (CPF, telefone ou nome
--     do responsável identificado pelo número batem com o contrato). Grava no
--     contrato (variáveis + texto) e o e-mail também na ficha, se ela tinha o antigo.
--     pessoas.telefone (JID) nunca é alterado.
--  4. fn_ju_contexto_cliente: contrato.ultimo_envio (quando, ok, erro curto).
-- O reenvio em si: edge ju-acao → send-contract-webhook → n8n.
-- =====================================================================

-- 1. Envios -----------------------------------------------------------------
CREATE TABLE public.contrato_envios (
  id             bigserial PRIMARY KEY,
  contrato_id    uuid NOT NULL REFERENCES public.user_contracts(id) ON DELETE CASCADE,
  ok             boolean NOT NULL,
  documento_id   text,
  assignment_id  text,
  signer_id      text,
  whatsapp_final text,
  erro           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contrato_envios_contrato ON public.contrato_envios (contrato_id, created_at DESC);
ALTER TABLE public.contrato_envios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contrato_envios FROM anon, authenticated;

CREATE TABLE public.ju_avisos_grupo (
  id          bigserial PRIMARY KEY,
  texto       text NOT NULL,
  origem      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  enviado_em  timestamptz
);
CREATE INDEX ju_avisos_grupo_pendentes ON public.ju_avisos_grupo (id) WHERE enviado_em IS NULL;
ALTER TABLE public.ju_avisos_grupo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_avisos_grupo FROM anon, authenticated;

CREATE FUNCTION public.fn_ju_mascara_email(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT CASE WHEN p LIKE '%_@_%' THEN
    left(split_part(p, '@', 1), CASE WHEN length(split_part(p, '@', 1)) > 4 THEN 3 ELSE 1 END)
    || '•••@' || split_part(p, '@', 2) END;
$$;

-- Telefone brasileiro → (DD) 9XXXX-XXXX (o que vai impresso no contrato). NULL se não der.
CREATE FUNCTION public.fn_telefone_br_formatado(p text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $$
DECLARE d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); n text;
BEGIN
  IF length(d) IN (12, 13) AND left(d, 2) = '55' THEN d := substr(d, 3); END IF;
  IF length(d) = 11 AND left(d, 1) = '0' THEN d := substr(d, 2); END IF;
  IF length(d) NOT IN (10, 11) OR left(d, 1) = '0' THEN RETURN NULL; END IF;
  n := substr(d, 3);
  IF length(n) = 8 AND left(n, 1) ~ '[6-9]' THEN n := '9' || n; END IF;
  IF length(n) <> 9 OR left(n, 1) <> '9' THEN RETURN NULL; END IF;
  RETURN '(' || left(d, 2) || ') ' || left(n, 5) || '-' || right(n, 4);
END $$;

CREATE FUNCTION public.fn_contrato_envio_registrar(
  p_contrato_id uuid, p_ok boolean, p_documento_id text DEFAULT NULL, p_assignment_id text DEFAULT NULL,
  p_signer_id text DEFAULT NULL, p_whatsapp text DEFAULT NULL, p_erro text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_pac text; v_resp text; v_fim text := nullif(right(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), 4), '');
BEGIN
  INSERT INTO public.contrato_envios (contrato_id, ok, documento_id, assignment_id, signer_id, whatsapp_final, erro)
  VALUES (p_contrato_id, p_ok, p_documento_id, p_assignment_id, p_signer_id, v_fim, left(p_erro, 1000));
  IF NOT p_ok THEN
    SELECT split_part(btrim(p.nome), ' ', 1), split_part(btrim(u.variaveis_utilizadas ->> 'responsavelLegalNome'), ' ', 1)
      INTO v_pac, v_resp
      FROM public.user_contracts u JOIN public.pessoas p ON p.id = u.pessoa_id WHERE u.id = p_contrato_id;
    INSERT INTO public.ju_avisos_grupo (texto, origem)
    VALUES ('⚠️ O contrato' || coalesce(' da ' || v_pac, '') || ' não chegou à Assinafy.'
            || E'\nQuem assina: ' || coalesce(v_resp, '?') || coalesce(' · WhatsApp final ' || v_fim, '')
            || E'\nErro: ' || left(regexp_replace(coalesce(p_erro, 'sem detalhe'), '\s+', ' ', 'g'), 180)
            || E'\nConfira o WhatsApp e o e-mail no cadastro e reenvie o contrato pelo sistema.',
            'CONTRATO_ENVIO');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.fn_contrato_envio_registrar(uuid, boolean, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_contrato_envio_registrar(uuid, boolean, text, text, text, text, text) TO service_role;

-- 2. Avisos avulsos saem com os lembretes ---------------------------------------
DO $mig$
DECLARE
  d text := pg_get_functiondef('public.fn_ju_tarefas'::regproc);
  v_old text := $o$    INTO v_lembretes FROM t;$o$;
  v_new text := $n$    INTO v_lembretes FROM t;

  WITH a AS (
    UPDATE public.ju_avisos_grupo g SET enviado_em = now()
     WHERE g.id IN (SELECT id FROM public.ju_avisos_grupo WHERE enviado_em IS NULL ORDER BY id LIMIT 10)
    RETURNING g.id, g.texto)
  SELECT v_lembretes || coalesce((SELECT jsonb_agg(jsonb_build_object('aviso_id', a.id, 'texto', a.texto) ORDER BY a.id) FROM a), '[]'::jsonb)
    INTO v_lembretes;$n$;
BEGIN
  IF position(v_old IN d) = 0 THEN RAISE EXCEPTION 'fn_ju_tarefas: trecho não encontrado'; END IF;
  EXECUTE replace(d, v_old, v_new);
END
$mig$;

-- 3. Correção pela Ju ------------------------------------------------------------
ALTER TABLE public.ju_acoes DROP CONSTRAINT ju_acoes_tipo_check;
ALTER TABLE public.ju_acoes ADD CONSTRAINT ju_acoes_tipo_check
  CHECK (tipo = ANY (ARRAY['REENVIO_CONTRATO','NF_EMITIR','RENOVAR_LINK','ATESTADO','CORRIGIR_CONTATO_CONTRATO']));

CREATE FUNCTION public.fn_ju_contrato_corrigir_contato(
  p_conversa_id bigint, p_versao bigint, p_paciente_id uuid, p_email text DEFAULT NULL, p_whatsapp text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_gate    text := public.fn_ju_gate(p_conversa_id, p_versao);
  v_tel     text := (SELECT telefone FROM public.ju_conversas WHERE id = p_conversa_id);
  v_conv    text := regexp_replace(coalesce(v_tel, ''), '\D', '', 'g');
  v_t13     text := substr(v_tel, 2);
  v_t12     text := CASE WHEN v_tel ~ '^\+55[0-9]{2}9[0-9]{8}$' THEN substr(v_tel, 2, 4) || substr(v_tel, 7) END;
  v_email   text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_wa      text := CASE WHEN nullif(btrim(coalesce(p_whatsapp, '')), '') IS NULL THEN NULL
                         ELSE public.fn_telefone_br_formatado(p_whatsapp) END;
  uc        record;
  e_antigo  text;
  w_antigo  text;
  v_cpf     text;
  v_nome    text;
  v_quem    boolean;
  v_acao    bigint;
  v_det     text;
  v_fichas  int := 0;
BEGIN
  IF v_gate IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', v_gate);
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(public.fn_ju_contexto_cliente(p_conversa_id) -> 'pacientes') x
       WHERE (x -> 'acesso_agenda')::boolean AND (x ->> 'paciente_id')::uuid = p_paciente_id) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'PACIENTE_FORA_DO_ESCOPO');
  END IF;
  IF v_email IS NULL AND nullif(btrim(coalesce(p_whatsapp, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'NADA_PARA_CORRIGIR');
  END IF;
  IF v_email IS NOT NULL AND (v_email !~ '^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$' OR length(v_email) > 120) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'EMAIL_INVALIDO');
  END IF;
  IF nullif(btrim(coalesce(p_whatsapp, '')), '') IS NOT NULL AND v_wa IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'WHATSAPP_INVALIDO');
  END IF;

  SELECT u.id, u.status_contrato, u.variaveis_utilizadas AS v INTO uc
  FROM public.user_contracts u
  WHERE u.pessoa_id = p_paciente_id AND u.ativo
  ORDER BY u.data_geracao DESC NULLS LAST LIMIT 1
  FOR UPDATE;
  IF uc.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'SEM_CONTRATO');
  ELSIF uc.status_contrato = 'assinado' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'JA_ASSINADO');
  END IF;

  e_antigo := lower(btrim(coalesce(uc.v ->> 'responsavelLegalEmail', '')));
  w_antigo := coalesce(uc.v ->> 'responsavelLegalTelefone', '');
  v_cpf    := regexp_replace(coalesce(uc.v ->> 'responsavelLegalCpf', ''), '\D', '', 'g');
  v_nome   := lower(regexp_replace(btrim(coalesce(uc.v ->> 'responsavelLegalNome', '')), '\s+', ' ', 'g'));

  -- quem conversa é quem assina? (telefone do contrato, CPF ou nome do responsável deste número)
  SELECT (length(regexp_replace(w_antigo, '\D', '', 'g')) >= 8 AND length(v_conv) >= 8
          AND right(regexp_replace(w_antigo, '\D', '', 'g'), 8) = right(v_conv, 8))
      OR EXISTS (SELECT 1 FROM public.pessoas p
                  WHERE p.ativo AND p.telefone::text IN (v_t13, v_t12)
                    AND ((length(v_cpf) = 11 AND regexp_replace(coalesce(p.cpf_cnpj, ''), '\D', '', 'g') = v_cpf)
                         OR (v_nome <> '' AND lower(regexp_replace(btrim(p.nome), '\s+', ' ', 'g')) = v_nome)))
    INTO v_quem;
  IF NOT coalesce(v_quem, false) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'SIGNATARIO_OUTRA_PESSOA');
  END IF;

  IF v_email = e_antigo THEN v_email := NULL; END IF;
  IF v_wa IS NOT NULL AND right(regexp_replace(v_wa, '\D', '', 'g'), 8) = right(regexp_replace(w_antigo, '\D', '', 'g'), 8) THEN v_wa := NULL; END IF;
  IF v_email IS NULL AND v_wa IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'DADOS_IGUAIS');
  END IF;
  IF (SELECT count(*) FROM public.ju_acoes
       WHERE tipo = 'CORRIGIR_CONTATO_CONTRATO' AND alvo_id = uc.id AND status IN ('SOLICITADA','OK')
         AND created_at > now() - interval '24 hours') >= 2 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'CORRIGIDO_HA_POUCO');
  END IF;

  v_det := concat_ws('; ',
    CASE WHEN v_email IS NOT NULL THEN 'e-mail ' || coalesce(public.fn_ju_mascara_email(e_antigo), '(vazio)') || ' → ' || public.fn_ju_mascara_email(v_email) END,
    CASE WHEN v_wa IS NOT NULL THEN 'WhatsApp final ' || coalesce(nullif(right(regexp_replace(w_antigo, '\D', '', 'g'), 4), ''), '(vazio)') || ' → final ' || right(v_wa, 4) END);

  INSERT INTO public.ju_acoes (conversa_id, versao, tipo, alvo_id, detalhe)
  VALUES (p_conversa_id, p_versao, 'CORRIGIR_CONTATO_CONTRATO', uc.id, v_det)
  ON CONFLICT ON CONSTRAINT ju_acoes_idempotente DO NOTHING
  RETURNING id INTO v_acao;
  IF v_acao IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'JA_SOLICITADO');
  END IF;

  UPDATE public.user_contracts u
     SET variaveis_utilizadas = u.variaveis_utilizadas
           || CASE WHEN v_email IS NOT NULL THEN jsonb_build_object('responsavelLegalEmail', v_email)
                     || CASE WHEN lower(btrim(coalesce(u.variaveis_utilizadas ->> 'email', ''))) = e_antigo AND e_antigo <> ''
                             THEN jsonb_build_object('email', v_email) ELSE '{}'::jsonb END
                   ELSE '{}'::jsonb END
           || CASE WHEN v_wa IS NOT NULL THEN jsonb_build_object('responsavelLegalTelefone', v_wa)
                     || CASE WHEN coalesce(u.variaveis_utilizadas ->> 'telefone', '') = w_antigo AND w_antigo <> ''
                             THEN jsonb_build_object('telefone', v_wa) ELSE '{}'::jsonb END
                   ELSE '{}'::jsonb END,
         conteudo_final = CASE WHEN v_wa IS NOT NULL AND w_antigo <> '' THEN replace(
                            CASE WHEN v_email IS NOT NULL AND e_antigo <> '' THEN replace(u.conteudo_final, e_antigo, v_email) ELSE u.conteudo_final END,
                            w_antigo, v_wa)
                          WHEN v_email IS NOT NULL AND e_antigo <> '' THEN replace(u.conteudo_final, e_antigo, v_email)
                          ELSE u.conteudo_final END,
         observacoes = concat_ws(E'\n', nullif(u.observacoes, ''),
                         to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
                         || ' Ju: contato do signatário corrigido a pedido dele pelo WhatsApp (' || v_det || ').'),
         updated_at = now()
   WHERE u.id = uc.id;

  IF v_email IS NOT NULL THEN
    UPDATE public.pessoas p
       SET email = v_email, updated_at = now()
     WHERE p.ativo AND p.telefone::text IN (v_t13, v_t12)
       AND EXISTS (SELECT 1 FROM public.pessoa_responsaveis pr
                    WHERE pr.id_pessoa = p_paciente_id AND pr.id_responsavel = p.id AND pr.ativo)
       AND (p.email IS NULL OR btrim(p.email) = '' OR lower(btrim(p.email)) = e_antigo);
    GET DIAGNOSTICS v_fichas = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('ok', true, 'acao_id', v_acao, 'contrato_id', uc.id, 'detalhe', v_det,
                            'whatsapp_final', CASE WHEN v_wa IS NOT NULL THEN right(v_wa, 4) END,
                            'ficha_atualizada', v_fichas > 0);
END $$;
REVOKE ALL ON FUNCTION public.fn_ju_contrato_corrigir_contato(bigint, bigint, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_contrato_corrigir_contato(bigint, bigint, uuid, text, text) TO service_role;

CREATE FUNCTION public.fn_ju_contrato_contato_resultado(p_acao_id bigint, p_ok boolean, p_detalhe text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE a record; v_pac text; v_fone text;
BEGIN
  UPDATE public.ju_acoes SET status = CASE WHEN p_ok THEN 'OK' ELSE 'FALHOU' END, updated_at = now()
   WHERE id = p_acao_id
  RETURNING conversa_id, alvo_id, detalhe INTO a;
  IF a.alvo_id IS NULL THEN RETURN; END IF;
  SELECT split_part(btrim(p.nome), ' ', 1) INTO v_pac
    FROM public.user_contracts u JOIN public.pessoas p ON p.id = u.pessoa_id WHERE u.id = a.alvo_id;
  SELECT public.fn_telefone_br_formatado(c.telefone) INTO v_fone FROM public.ju_conversas c WHERE c.id = a.conversa_id;
  INSERT INTO public.ju_avisos_grupo (texto, origem)
  VALUES (CASE WHEN p_ok
            THEN '✏️ A Ju corrigiu o contato do contrato' || coalesce(' da ' || v_pac, '')
                 || ', a pedido de quem assina' || coalesce(' (' || v_fone || ')', '') || ': ' || a.detalhe || '.'
                 || E'\nO contrato foi reenviado. Se a Assinafy recusar, chega outro aviso aqui.'
            ELSE '⚠️ A Ju corrigiu o contato do contrato' || coalesce(' da ' || v_pac, '') || coalesce(' (' || v_fone || ')', '')
                 || ' (' || a.detalhe || '), mas o reenvio falhou: ' || left(coalesce(p_detalhe, 'sem detalhe'), 150)
                 || E'.\nÉ preciso reenviar o contrato pelo sistema.' END,
          'CORRIGIR_CONTATO_CONTRATO');
END $$;
REVOKE ALL ON FUNCTION public.fn_ju_contrato_contato_resultado(bigint, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_contrato_contato_resultado(bigint, boolean, text) TO service_role;

-- 4. A Ju vê o resultado do último envio ------------------------------------------
DO $mig$
DECLARE
  d text := pg_get_functiondef('public.fn_ju_contexto_cliente'::regproc);
  v_old text := $o$'gerado_em', to_char(uc.data_geracao$o$;
  v_new text := $n$'ultimo_envio', CASE WHEN uc.status_contrato IS DISTINCT FROM 'assinado' THEN (
                     SELECT jsonb_build_object(
                              'quando', to_char(ce.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'),
                              'chegou_na_assinafy', ce.ok,
                              'erro', CASE WHEN NOT ce.ok THEN left(ce.erro, 160) END)
                     FROM public.contrato_envios ce WHERE ce.contrato_id = uc.id
                     ORDER BY ce.created_at DESC LIMIT 1) END,
                   'gerado_em', to_char(uc.data_geracao$n$;
BEGIN
  IF position(v_old IN d) = 0 THEN RAISE EXCEPTION 'fn_ju_contexto_cliente: trecho não encontrado'; END IF;
  EXECUTE replace(d, v_old, v_new);
END
$mig$;

-- (aplicado em seguida como ju_contrato_corrigir_contato_search_path)
-- fn_ju_contrato_corrigir_contato atualiza pessoas/user_contracts, cujos gatilhos
-- antigos (ex.: webhook_patient_updated → dispatch_webhook) chamam funções sem
-- schema. Com search_path vazio herdado, quebravam. public, pg_temp resolve.
ALTER FUNCTION public.fn_ju_contrato_corrigir_contato(bigint, bigint, uuid, text, text) SET search_path = public, pg_temp;
