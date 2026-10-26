-- Contato novo = família sem nenhuma consulta na agenda (passada ou futura, que não foi cancelada).
-- O critério anterior (nenhuma criança com sessão "finalizada") marcava como novo quem já é paciente,
-- porque muitas sessões que aconteceram ficam como agendado/confirmado (26/10/2026: Melissa, Matheus).
CREATE OR REPLACE FUNCTION public.fn_ju_contato_novo(p_conversa_id bigint)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT NOT EXISTS (
    SELECT 1
      FROM jsonb_array_elements(coalesce(public.fn_ju_contexto_cliente(p_conversa_id) -> 'pacientes', '[]'::jsonb)) x
      JOIN public.agendamentos a ON a.paciente_id = (x ->> 'paciente_id')::uuid AND a.ativo
      JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
     WHERE cs.codigo NOT IN ('cancelado', 'erro'));
$function$;
