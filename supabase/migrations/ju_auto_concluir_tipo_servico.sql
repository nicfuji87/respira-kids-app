-- Conclusão automática também quando a recepção troca o tipo de atendimento (decisão do dono, 25/10/2026).
-- Caso Natália/Saulo: a família pediu "motora", a Lolô trocou o serviço na agenda e o pedido seguiu aberto
-- no grupo dizendo "segue registrado como respiratória".

DROP TRIGGER IF EXISTS trg_ju_auto_concluir ON public.agendamentos;
CREATE TRIGGER trg_ju_auto_concluir
  AFTER INSERT OR UPDATE OF status_consulta_id, data_hora, profissional_id, tipo_servico_id, pagamento_link_id, fatura_id
  ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public.trg_ju_auto_concluir_agendamento();

DO $mig$
DECLARE d text := pg_get_functiondef('public.trg_ju_auto_concluir_agendamento()'::regprocedure); n text;
BEGIN
  IF d LIKE '%atendimento ajustado%' THEN RETURN; END IF;
  n := replace(d,
    $a$          AND (NEW.data_hora IS DISTINCT FROM OLD.data_hora OR NEW.profissional_id IS DISTINCT FROM OLD.profissional_id) THEN
      PERFORM public.fn_ju_auto_concluir(NEW.paciente_id, ARRAY['REMARCACAO', 'AGENDAMENTO'], 'automático: consulta remarcada');$a$,
    $a$          AND (NEW.data_hora IS DISTINCT FROM OLD.data_hora OR NEW.profissional_id IS DISTINCT FROM OLD.profissional_id) THEN
      PERFORM public.fn_ju_auto_concluir(NEW.paciente_id, ARRAY['REMARCACAO', 'AGENDAMENTO'], 'automático: consulta remarcada');
    ELSIF v_novo IN ('agendado', 'confirmado') AND NEW.tipo_servico_id IS DISTINCT FROM OLD.tipo_servico_id THEN
      PERFORM public.fn_ju_auto_concluir(NEW.paciente_id, ARRAY['AGENDAMENTO', 'REMARCACAO'], 'automático: atendimento ajustado');$a$);
  IF n = d THEN RAISE EXCEPTION 'trg_ju_auto_concluir_agendamento: trecho da remarcação não encontrado'; END IF;
  EXECUTE n;
END
$mig$;
