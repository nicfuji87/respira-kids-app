-- AI dev note: 07/11/2026, ajuste do dono na troca do nome da nota pela Ju:
-- - O tomador pode ser a criança, o responsável financeiro ou qualquer responsável ativo dela (legal etc.,
--   pessoa_responsaveis). Alguém fora do cadastro → a Ju chama a secretaria (regra no prompt).
-- - Sem CPF no cadastro: a ferramenta pede para a Ju perguntar o CPF à família; com o CPF (p.cpf), confere os
--   dígitos (fn_pix_cpf_valido) e grava em pessoas.cpf_cnpj. Nunca sobrescreve um CPF diferente já gravado e
--   não grava CPF que já é de outra pessoa ativa: nesses casos, secretaria.
CREATE OR REPLACE FUNCTION public.fn_ju_trocar_tomador(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  c ju_conversas; pac pessoas; tom pessoas; f faturas;
  v_versao bigint := nullif(p ->> 'versao', '')::bigint;
  v_tipo text := upper(coalesce(nullif(btrim(p ->> 'tipo'), ''), 'CRIANCA'));
  v_cpf text := regexp_replace(coalesce(p ->> 'cpf', ''), '\D', '', 'g');
  v_pac uuid; v_pes uuid; v_tom uuid; v_ok boolean; v_req bigint; v_nome text; v_quando text; v_doc text;
BEGIN
  SELECT * INTO c FROM ju_conversas WHERE id = (p ->> 'conversa_id')::bigint;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'resposta', 'Conversa não encontrada; nada foi feito. Responda exatamente [NADA].'); END IF;
  IF c.sem_ia OR (v_versao IS NOT NULL AND c.message_version > v_versao) THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'A conversa mudou (mensagem nova ou marcada SEM IA); nada foi feito. Responda exatamente [NADA].');
  END IF;
  BEGIN v_pac := (p ->> 'paciente_id')::uuid; EXCEPTION WHEN others THEN v_pac := NULL; END;
  BEGIN v_pes := nullif(p ->> 'pessoa_id', '')::uuid; EXCEPTION WHEN others THEN v_pes := NULL; END;
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(fn_ju_contexto_cliente(c.id) -> 'pacientes', '[]'::jsonb)) x
                  WHERE (x ->> 'paciente_id')::uuid = v_pac AND (x ->> 'acesso_financeiro')::boolean) INTO v_ok;
  IF NOT coalesce(v_ok, false) THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Não achei essa criança no financeiro desta conversa; nada foi alterado. Use o paciente_id da criança em pacientes. Se não der, chame a secretaria (NOTA_FISCAL) com o pedido.');
  END IF;
  SELECT * INTO pac FROM pessoas WHERE id = v_pac;

  -- Quem vai na nota: a criança, o responsável financeiro ou um responsável ativo dela
  v_tom := coalesce(v_pes, CASE WHEN v_tipo IN ('RESPONSAVEL', 'RESPONSAVEL_FINANCEIRO') THEN pac.responsavel_cobranca_id ELSE pac.id END);
  IF v_tom IS DISTINCT FROM pac.id AND v_tom IS DISTINCT FROM pac.responsavel_cobranca_id
     AND NOT EXISTS (SELECT 1 FROM pessoa_responsaveis r WHERE r.id_pessoa = pac.id AND r.id_responsavel = v_tom
                       AND coalesce(r.ativo, true) AND (r.data_fim IS NULL OR r.data_fim >= current_date)) THEN
    RETURN jsonb_build_object('ok', false, 'resposta',
      'Essa pessoa não está no cadastro da criança como responsável; nada foi alterado. Chame a secretaria (NOTA_FISCAL) com o pedido e diga à família, em uma frase, que a Lolô confirma por aqui.');
  END IF;
  SELECT * INTO tom FROM pessoas WHERE id = v_tom;
  v_nome := split_part(btrim(coalesce(tom.nome, '')), ' ', 1);
  v_doc := regexp_replace(coalesce(tom.cpf_cnpj, ''), '\D', '', 'g');

  -- CPF: pede à família ou grava o que ela mandou
  IF length(v_doc) NOT IN (11, 14) THEN
    IF v_cpf = '' THEN
      RETURN jsonb_build_object('ok', false, 'precisa_cpf', true, 'resposta',
        'O cadastro de ' || tom.nome || ' ainda não tem CPF, e a nota nesse nome precisa dele; nada foi alterado ainda. '
        || 'Pergunte à família, em uma frase, o CPF de ' || v_nome || '. Quando ela mandar, use nota_no_nome_de de novo com o mesmo paciente_id e pessoa_id e o cpf.');
    END IF;
    IF NOT fn_pix_cpf_valido(v_cpf) THEN
      RETURN jsonb_build_object('ok', false, 'precisa_cpf', true, 'resposta',
        'Esse CPF não confere (os dígitos não batem); nada foi alterado. Peça à família, em uma frase, para conferir o CPF de ' || v_nome || '. Não repita o número na mensagem.');
    END IF;
    IF EXISTS (SELECT 1 FROM pessoas o WHERE o.ativo AND o.id <> v_tom
                 AND regexp_replace(coalesce(o.cpf_cnpj, ''), '\D', '', 'g') = v_cpf) THEN
      RETURN jsonb_build_object('ok', false, 'resposta',
        'Esse CPF já está no cadastro de outra pessoa; nada foi alterado. Chame a secretaria (NOTA_FISCAL) explicando o pedido (sem escrever o CPF) e diga à família que a Lolô confirma por aqui.');
    END IF;
    BEGIN
      UPDATE pessoas SET cpf_cnpj = v_cpf WHERE id = v_tom;
    EXCEPTION WHEN unique_violation OR check_violation THEN
      RETURN jsonb_build_object('ok', false, 'resposta',
        'Não consegui gravar o CPF no cadastro; nada foi alterado. Chame a secretaria (NOTA_FISCAL) explicando o pedido (sem escrever o CPF) e diga à família que a Lolô confirma por aqui.');
    END;
  ELSIF v_cpf <> '' AND v_cpf <> v_doc THEN
    RETURN jsonb_build_object('ok', false, 'resposta',
      'O cadastro de ' || v_nome || ' já tem outro CPF; nada foi alterado. Chame a secretaria (NOTA_FISCAL) explicando o pedido (sem escrever o CPF) e diga à família que a Lolô confirma por aqui.');
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
      || 'A família pediu: as próximas notas de ' || pac.nome || ' saem no nome de ' || tom.nome || '.'
      || CASE WHEN length(v_doc) NOT IN (11, 14) THEN ' CPF informado pela família e gravado no cadastro.' ELSE '' END);
    RETURN jsonb_build_object('ok', true, 'resposta',
      'Pronto: as próximas notas fiscais de ' || split_part(btrim(pac.nome), ' ', 1) || ' saem no nome de ' || v_nome
      || '. Diga isso à família em uma frase, sem repetir o CPF.');
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
    || ' (paga em ' || v_quando || ') está sendo cancelada e reemitida nesse nome; as próximas já saem assim.'
    || CASE WHEN length(v_doc) NOT IN (11, 14) THEN ' CPF informado pela família e gravado no cadastro.' ELSE '' END);
  RETURN jsonb_build_object('ok', true, 'resposta',
    'Pronto: as próximas notas saem no nome de ' || v_nome || '. A nota paga em ' || v_quando
    || ' vai ser cancelada e emitida de novo no nome de ' || v_nome || '; o PDF chega por aqui em alguns minutos. Diga isso à família em uma ou duas frases, sem repetir o CPF.');
END $$;
REVOKE ALL ON FUNCTION public.fn_ju_trocar_tomador(jsonb) FROM PUBLIC, anon, authenticated;
