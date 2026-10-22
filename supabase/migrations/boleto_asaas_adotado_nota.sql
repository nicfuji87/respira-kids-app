-- Conta da BC agendada à mão no app do Asaas (22/10/2026, pedido do dono: "não quero clicar
-- em botão para marcar como pago"). A edge email-boletos (adotarDoAsaas) procura na lista do
-- Asaas o pagamento de conta com a mesma linha/código de barras das solicitações 'externo' da
-- conta Asaas e passa a acompanhá-lo como os agendados pela API (status 'agendado' +
-- asaas_bill_id); quando o Asaas paga, a baixa é automática.
-- Aqui só muda o texto da baixa: "agendado pela API" vale só para o que a edge criou
-- (externalReference = id da solicitação); o adotado diz "agendado no app do Asaas".
DO $m$
DECLARE d text := pg_get_functiondef('public.fn_boleto_confirmar_pagamento(uuid,boolean,text)'::regprocedure);
  a1 text := $q$|| ' (agendado pela API, pagamento ' || s.asaas_bill_id || ', liberado no app do Asaas).'$q$;
  b1 text := $q$|| CASE WHEN s.asaas_resposta ->> 'externalReference' = s.id::text
              THEN ' (agendado pela API, pagamento ' || s.asaas_bill_id || ', liberado no app do Asaas).'
              ELSE ' (agendado no app do Asaas; o sistema achou o pagamento ' || s.asaas_bill_id || ' e deu baixa sozinho).' END$q$;
  a2 text := $q$WHEN v_asa THEN 'Boleto recebido por e-mail, pago pelo Asaas (agendado pela API).'$q$;
  b2 text := $q$WHEN v_asa THEN 'Boleto recebido por e-mail, pago pelo Asaas'
                 || CASE WHEN s.asaas_resposta ->> 'externalReference' = s.id::text THEN ' (agendado pela API).' ELSE ' (agendado no app do Asaas, baixa automática).' END$q$;
BEGIN
  IF position(a1 in d) = 0 OR position(a2 in d) = 0 THEN RAISE EXCEPTION 'trecho não encontrado'; END IF;
  EXECUTE replace(replace(d, a1, b1), a2, b2);
END $m$;

-- (migration boleto_asaas_adotado_aviso) Aviso no grupo: o adotado não gera "agendado"
-- (quem agendou à mão já sabe); só o "✅ paga pelo Asaas" quando o Asaas pagar.
DO $m$
DECLARE d text := pg_get_functiondef('public.fn_pix_solicitacoes_para_avisar()'::regprocedure);
  a text := $q$OR (b.anunciado_em IS NOT NULL AND b.notificado_em IS NULL AND b.status IN ('agendado', 'pago', 'erro')));$q$;
  n text := $q$OR (b.anunciado_em IS NOT NULL AND b.notificado_em IS NULL
          AND (b.status IN ('pago', 'erro')
               -- agendado à mão no app do Asaas e achado pelo sistema: só avisa quando pagar
               OR (b.status = 'agendado' AND NOT (b.asaas_bill_id IS NOT NULL
                   AND b.asaas_resposta ->> 'externalReference' IS DISTINCT FROM b.id::text)))));$q$;
BEGIN
  IF position(a in d) = 0 THEN RAISE EXCEPTION 'trecho não encontrado'; END IF;
  EXECUTE replace(d, a, n);
END $m$;
