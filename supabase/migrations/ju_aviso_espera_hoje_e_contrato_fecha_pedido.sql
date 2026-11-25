-- 25/11/2026 (pedido do dono, depois da análise da tarde):
-- 1) aviso ⏳ de pedido parado para pacientes da casa vale para pedidos abertos desde 00h de 25/11 (antes, só a
--    partir das 18h), para os pedidos de pagamento e horário que já estavam parados aparecerem no 🔔;
-- 2) contrato assinado fecha sozinho o pedido CONTRATO aberto da família (caso Yan: assinado e o pedido ficou
--    aberto, a família seguia na lista de pendências). Fecha pelo fn_ju_concluir e apaga o card do grupo.

DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_oportunidade_espera()'::regprocedure);
  n := replace(d, $a$INICIO_TODOS constant timestamptz := '2026-11-25 21:00:00+00';$a$,
                  $a$INICIO_TODOS constant timestamptz := '2026-11-25 03:00:00+00';$a$);
  IF n = d THEN RAISE EXCEPTION 'oportunidade_espera: trecho não encontrado'; END IF;
  EXECUTE n;
END $$;

CREATE OR REPLACE FUNCTION public.fn_trg_contrato_assinado_fecha_pedido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s record; v_chaves text[];
BEGIN
  IF NEW.status_contrato IS DISTINCT FROM 'assinado' OR OLD.status_contrato IS NOT DISTINCT FROM 'assinado' THEN
    RETURN NULL;
  END IF;
  -- telefones da família: responsáveis da criança + quem assinou o contrato
  SELECT array_agg(DISTINCT k) FILTER (WHERE k IS NOT NULL) INTO v_chaves FROM (
    SELECT fn_atrib_tel_chave(r.telefone::text) AS k
      FROM pessoa_responsaveis pr JOIN pessoas r ON r.id = pr.id_responsavel
     WHERE pr.id_pessoa = NEW.pessoa_id AND pr.ativo
    UNION ALL
    SELECT fn_atrib_tel_chave(NEW.variaveis_utilizadas ->> 'responsavelLegalTelefone')) t;

  FOR s IN
    SELECT so.id, so.notificacao_msg_id FROM ju_solicitacoes so JOIN ju_conversas c ON c.id = so.conversa_id
     WHERE so.tipo = 'CONTRATO' AND so.status = 'ABERTA'
       AND (so.paciente_id = NEW.pessoa_id OR fn_atrib_tel_chave(c.telefone) = ANY (coalesce(v_chaves, '{}')))
  LOOP
    PERFORM fn_ju_concluir(s.id, NULL, NULL, 'sistema (contrato assinado)');
    IF s.notificacao_msg_id IS NOT NULL THEN PERFORM fn_le_apagar(s.notificacao_msg_id, NULL); END IF;
  END LOOP;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RAISE WARNING 'fechar pedido de contrato assinado falhou (contrato %): %', NEW.id, SQLERRM;
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS trg_contrato_assinado_fecha_pedido ON public.user_contracts;
CREATE TRIGGER trg_contrato_assinado_fecha_pedido
  AFTER UPDATE OF status_contrato ON public.user_contracts
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_contrato_assinado_fecha_pedido();
