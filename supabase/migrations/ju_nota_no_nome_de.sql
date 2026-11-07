-- AI dev note: 07/11/2026 (pedido do dono, caso Matheus/Ivi). A Ju troca o nome da nota fiscal (tomador) quando a
-- família pede EXPLICITAMENTE: nota no nome da criança (reembolso do plano) ou do responsável financeiro.
-- - Só criança/responsável que a conversa pode ver no financeiro (fn_ju_contexto_cliente.acesso_financeiro).
-- - O tomador precisa ter CPF/CNPJ no cadastro; sem CPF, a Ju chama a secretaria (não pede documento).
-- - Muda pessoas.tomador_nfe_id (próximas notas) e o snapshot dos links de pagamento ainda sem cobrança no Asaas.
-- - Se houver nota da criança paga nos últimos 30 dias em outro nome, chama a edge nfe-trocar-tomador (cancela e
--   reemite avulsa); o cron nfe-avulsa-sincronizar manda o PDF novo à família e avisa o 🔔 se der erro.
CREATE TABLE IF NOT EXISTS public.nfe_trocas_tomador (
  id bigserial PRIMARY KEY,
  fatura_id uuid NOT NULL,
  tomador_id uuid NOT NULL,
  conversa_id bigint,
  req_id bigint,
  criado_em timestamptz NOT NULL DEFAULT now(),
  verificado_em timestamptz,
  resultado jsonb
);
ALTER TABLE public.nfe_trocas_tomador ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nfe_trocas_tomador FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_nfe_aviso_notificacoes(p_texto text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_tok text := fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
BEGIN
  IF v_tok IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url := 'https://infuse.uazapi.com/send/text',
    body := jsonb_build_object('number', '120363433073436578@g.us', 'text', p_texto),
    headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
    timeout_milliseconds := 20000);
END $$;
REVOKE ALL ON FUNCTION public.fn_nfe_aviso_notificacoes(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_ju_trocar_tomador(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  c ju_conversas; pac pessoas; tom pessoas; f faturas;
  v_versao bigint := nullif(p ->> 'versao', '')::bigint;
  v_tipo text := upper(coalesce(nullif(btrim(p ->> 'tipo'), ''), 'CRIANCA'));
  v_pac uuid; v_tom uuid; v_ok boolean; v_req bigint; v_nome text; v_quando text;
BEGIN
  SELECT * INTO c FROM ju_conversas WHERE id = (p ->> 'conversa_id')::bigint;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'resposta', 'Conversa não encontrada; nada foi feito. Responda exatamente [NADA].'); END IF;
  IF c.sem_ia OR (v_versao IS NOT NULL AND c.message_version > v_versao) THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'A conversa mudou (mensagem nova ou marcada SEM IA); nada foi feito. Responda exatamente [NADA].');
  END IF;
  BEGIN v_pac := (p ->> 'paciente_id')::uuid; EXCEPTION WHEN others THEN v_pac := NULL; END;
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(fn_ju_contexto_cliente(c.id) -> 'pacientes', '[]'::jsonb)) x
                  WHERE (x ->> 'paciente_id')::uuid = v_pac AND (x ->> 'acesso_financeiro')::boolean) INTO v_ok;
  IF NOT coalesce(v_ok, false) THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Não achei essa criança no financeiro desta conversa; nada foi alterado. Use o paciente_id da criança em pacientes. Se não der, chame a secretaria (NOTA_FISCAL) com o pedido.');
  END IF;
  SELECT * INTO pac FROM pessoas WHERE id = v_pac;
  v_tom := CASE WHEN v_tipo = 'RESPONSAVEL' THEN pac.responsavel_cobranca_id ELSE pac.id END;
  SELECT * INTO tom FROM pessoas WHERE id = v_tom;
  v_nome := split_part(btrim(coalesce(tom.nome, '')), ' ', 1);
  IF length(regexp_replace(coalesce(tom.cpf_cnpj, ''), '\D', '', 'g')) NOT IN (11, 14) THEN
    RETURN jsonb_build_object('ok', false, 'resposta',
      'O cadastro de ' || coalesce(nullif(v_nome, ''), 'quem vai na nota') || ' não tem CPF, e a nota nesse nome precisa dele; nada foi alterado. '
      || 'Chame a secretaria (NOTA_FISCAL) com o pedido e diga à família, em uma frase, que a Lolô confirma por aqui. Não peça documentos.');
  END IF;

  UPDATE pessoas SET tomador_nfe_id = CASE WHEN v_tom = pac.responsavel_cobranca_id THEN NULL ELSE v_tom END
   WHERE id = pac.id;
  UPDATE pagamento_links SET tomador_nfe_id = v_tom
   WHERE paciente_id = pac.id AND ativo AND status = 'pendente' AND id_asaas IS NULL;

  SELECT * INTO f FROM faturas
   WHERE paciente_id = pac.id AND ativo AND status = 'pago' AND pago_em > now() - interval '30 days'
     AND link_nfe LIKE 'http%' AND coalesce(tomador_nfe_id, responsavel_cobranca_id) IS DISTINCT FROM v_tom
     AND NOT (coalesce(dados_asaas, '{}'::jsonb) ? 'nfe_avulsa_id' AND tomador_nfe_id = v_tom)
   ORDER BY pago_em DESC LIMIT 1;

  IF f.id IS NULL THEN
    PERFORM fn_nfe_aviso_notificacoes('🧾 *Nome na nota alterado pela Ju*' || E'\n'
      || coalesce(nullif(btrim(c.nome_whatsapp), ''), 'Contato') || E'\n'
      || 'A família pediu: as próximas notas de ' || pac.nome || ' saem no nome de ' || tom.nome || '.');
    RETURN jsonb_build_object('ok', true, 'resposta',
      'Pronto: as próximas notas fiscais de ' || split_part(btrim(pac.nome), ' ', 1) || ' saem no nome de ' || v_nome || '. Diga isso à família em uma frase.');
  END IF;

  v_req := net.http_post(
    url := 'https://jqegoentcusnbcykgtxg.supabase.co/functions/v1/nfe-trocar-tomador',
    body := jsonb_build_object('faturaId', f.id, 'tomadorId', v_tom),
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'google_sync_service_key')),
    timeout_milliseconds := 90000);
  INSERT INTO nfe_trocas_tomador (fatura_id, tomador_id, conversa_id, req_id) VALUES (f.id, v_tom, c.id, v_req);
  v_quando := to_char(f.pago_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM');
  PERFORM fn_nfe_aviso_notificacoes('🧾 *Nota reemitida pela Ju*' || E'\n'
    || coalesce(nullif(btrim(c.nome_whatsapp), ''), 'Contato') || E'\n'
    || 'A família pediu a nota no nome de ' || tom.nome || '. A nota de R$ ' || to_char(f.valor_total, 'FM999G990D00')
    || ' (paga em ' || v_quando || ') está sendo cancelada e reemitida nesse nome; as próximas já saem assim.');
  RETURN jsonb_build_object('ok', true, 'resposta',
    'Pronto: as próximas notas saem no nome de ' || v_nome || '. A nota paga em ' || v_quando
    || ' vai ser cancelada e emitida de novo no nome de ' || v_nome || '; o PDF chega por aqui em alguns minutos. Diga isso à família em uma ou duas frases.');
END $$;
REVOKE ALL ON FUNCTION public.fn_ju_trocar_tomador(jsonb) FROM PUBLIC, anon, authenticated;

-- Despacho na ação "fixa" das Ações
DO $do$
DECLARE d text := pg_get_functiondef('public.fn_ju_acao_fixo(jsonb)'::regprocedure); n text;
BEGIN
  IF d LIKE '%TROCAR_TOMADOR%' THEN RETURN; END IF;
  n := replace(d, $a$  IF v_acao = 'RESPONDER_VAGA' THEN RETURN public.fn_ju_vaga_responder(p); END IF;$a$,
                  $a$  IF v_acao = 'RESPONDER_VAGA' THEN RETURN public.fn_ju_vaga_responder(p); END IF;
  IF v_acao = 'TROCAR_TOMADOR' THEN RETURN public.fn_ju_trocar_tomador(p); END IF;$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_acao_fixo: trecho não encontrado'; END IF;
  EXECUTE n;
END $do$;

-- O cron das notas avulsas também confere o resultado das trocas e avisa o 🔔 se a reemissão falhou
CREATE OR REPLACE FUNCTION public.fn_nfe_avulsa_sincronizar()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE r record; n int := 0; v_res jsonb;
BEGIN
  FOR r IN SELECT t.*, x.status_code, x.content, x.error_msg FROM nfe_trocas_tomador t
             LEFT JOIN net._http_response x ON x.id = t.req_id
            WHERE t.verificado_em IS NULL AND t.criado_em < now() - interval '2 minutes'
  LOOP
    BEGIN v_res := r.content::jsonb; EXCEPTION WHEN others THEN v_res := NULL; END;
    UPDATE nfe_trocas_tomador SET verificado_em = now(),
           resultado = coalesce(v_res, jsonb_build_object('erro', coalesce(r.error_msg, 'sem resposta da edge')))
     WHERE id = r.id;
    IF NOT coalesce((v_res ->> 'success')::boolean, false) THEN
      PERFORM fn_nfe_aviso_notificacoes('⚠️ *Não consegui reemitir a nota*' || E'\n'
        || coalesce((SELECT nullif(btrim(nome_whatsapp), '') FROM ju_conversas WHERE id = r.conversa_id), 'Contato') || E'\n'
        || 'Troca para o nome de ' || coalesce((SELECT nome FROM pessoas WHERE id = r.tomador_id), '?')
        || ': ' || left(coalesce(v_res ->> 'error', r.error_msg, 'sem resposta'), 200)
        || CASE WHEN v_res ->> 'etapa' = 'cancelar' THEN ' (a nota nova saiu; a antiga não foi cancelada).'
                WHEN v_res ->> 'cancelada' IS NOT NULL THEN ' (a nota antiga foi cancelada).'
                ELSE ' (a nota antiga continua valendo).' END
        || ' Ver no app.');
    END IF;
  END LOOP;

  FOR r IN SELECT f.id FROM faturas f
            WHERE f.dados_asaas ? 'nfe_avulsa_id' AND coalesce(f.dados_asaas ->> 'nfe_avulsa_enviada_em', '') = ''
              AND coalesce(f.link_nfe, '') <> 'erro'
              AND (f.dados_asaas ->> 'nfe_tomador_trocado_em')::timestamptz > now() - interval '3 days'
  LOOP
    PERFORM net.http_post(
      url := 'https://jqegoentcusnbcykgtxg.supabase.co/functions/v1/nfe-trocar-tomador',
      body := jsonb_build_object('faturaId', r.id, 'acao', 'sincronizar', 'enviar', true),
      headers := jsonb_build_object('Content-Type', 'application/json',
                   'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'google_sync_service_key')),
      timeout_milliseconds := 60000);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.fn_nfe_avulsa_sincronizar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nfe_aviso_notificacoes(text) TO service_role;
