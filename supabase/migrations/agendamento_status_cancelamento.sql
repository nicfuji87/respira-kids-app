-- AI dev note: 05/11/2026 (caso Ian): a Lolô cancelou a consulta duplicada (havia outra ativa no mesmo horário) e a
-- família recebeu "Sua consulta foi cancelada". O [RK] Webhook Confirmacao (nó "Status atual") consulta esta função
-- antes de avisar: duplicada = existe outra consulta ativa, não cancelada, da mesma criança no mesmo horário (±10 min).
-- Duplicada: não avisa família, e-mail nem fisio.
CREATE OR REPLACE FUNCTION public.fn_agendamento_status_cancelamento(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT jsonb_build_object(
    'codigo', cs.codigo,
    'duplicada', EXISTS (SELECT 1 FROM agendamentos o JOIN consulta_status c2 ON c2.id = o.status_consulta_id
                          WHERE o.paciente_id = a.paciente_id AND o.id <> a.id AND o.ativo
                            AND c2.codigo NOT IN ('cancelado', 'reagendado', 'erro')
                            AND o.data_hora BETWEEN a.data_hora - interval '10 minutes' AND a.data_hora + interval '10 minutes'))
    FROM agendamentos a JOIN consulta_status cs ON cs.id = a.status_consulta_id
   WHERE a.id = p_id;
$$;
REVOKE ALL ON FUNCTION public.fn_agendamento_status_cancelamento(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_agendamento_status_cancelamento(uuid) TO service_role;
