-- 02/11/2026 (pedido do dono): paciente da agenda pública que cancela ou quer trocar o horário recebe da Ju
-- o link da agenda pública para escolher outro horário livre.
-- Paciente da agenda pública = já marcou pelo link (agenda_selecoes) ou está em Pacientes Fixos.
-- Link = agenda ativa da fisio da sessão (ou de outra fisio do fixo dividido) com horário livre
-- da semana da sessão até o fim da semana seguinte (regra da remarcação dos fixos).
-- Sem link (sem agenda ou sem horário livre), a Ju segue o caminho de sempre (Lolô).

CREATE OR REPLACE FUNCTION public.fn_ju_link_agenda_publica(p_agendamento_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE
  a public.agendamentos; v_profs uuid[]; v_ate timestamp; v_agora timestamp; r record;
BEGIN
  SELECT * INTO a FROM public.agendamentos WHERE id = p_agendamento_id;
  IF NOT FOUND OR a.paciente_id IS NULL THEN RETURN NULL; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.agenda_selecoes s WHERE s.paciente_id = a.paciente_id)
     AND NOT EXISTS (SELECT 1 FROM public.pacientes_fixos f WHERE f.paciente_id = a.paciente_id AND f.ativo) THEN
    RETURN NULL;
  END IF;

  SELECT array_remove(ARRAY[a.profissional_id] || coalesce(f.profissionais, '{}') || f.profissional_id, NULL)
    INTO v_profs
    FROM (SELECT 1) x
    LEFT JOIN public.pacientes_fixos f ON f.paciente_id = a.paciente_id AND f.ativo;

  v_agora := (now() AT TIME ZONE 'America/Sao_Paulo') + interval '2 hours';
  v_ate := date_trunc('week', a.data_hora AT TIME ZONE 'UTC') + interval '14 days';
  IF v_ate <= v_agora THEN RETURN NULL; END IF;

  SELECT ag.token, ag.profissional_id, count(*) AS livres,
         min(s.data_hora AT TIME ZONE 'UTC') AS primeiro
    INTO r
    FROM public.agendas_compartilhadas ag
    JOIN public.agenda_slots s ON s.agenda_id = ag.id
   WHERE ag.ativo AND ag.data_fim >= current_date AND ag.profissional_id = ANY (v_profs)
     AND s.disponivel AND s.deleted_at IS NULL
     AND (s.data_hora AT TIME ZONE 'UTC') > v_agora
     AND (s.data_hora AT TIME ZONE 'UTC') < v_ate
     AND s.data_hora <> a.data_hora
   GROUP BY ag.id, ag.token, ag.profissional_id, ag.data_inicio
   ORDER BY (ag.profissional_id = a.profissional_id) DESC, ag.data_inicio
   LIMIT 1;
  IF r.token IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'link', 'https://app.respirakidsbrasilia.com.br/#/agenda-publica/' || r.token,
    'profissional', (SELECT split_part(btrim(p.nome), ' ', 1) FROM public.pessoas p WHERE p.id = r.profissional_id),
    'livres', r.livres);
END $f$;
REVOKE ALL ON FUNCTION public.fn_ju_link_agenda_publica(uuid) FROM PUBLIC, anon, authenticated;

-- cancelar_consulta devolve o link
DO $m$
DECLARE d text := pg_get_functiondef('public.fn_ju_cancelar_consulta(bigint,bigint,uuid)'::regprocedure);
        f text := $$'faltavam_horas', round(v_horas, 1));$$;
BEGIN
  IF (length(d) - length(replace(d, f, ''))) / length(f) <> 1 THEN
    RAISE EXCEPTION 'fn_ju_cancelar_consulta: trecho não encontrado';
  END IF;
  EXECUTE replace(d, f, $$'faltavam_horas', round(v_horas, 1), 'link_agenda', public.fn_ju_link_agenda_publica(a.id));$$);
END $m$;

-- contexto: a Ju sabe quais consultas podem ser trocadas pelo link
DO $m$
DECLARE d text := pg_get_functiondef('public.fn_ju_contexto_cliente(bigint)'::regprocedure);
        f text := $$'confirmada', cs.codigo = 'confirmado',$$;
BEGIN
  IF (length(d) - length(replace(d, f, ''))) / length(f) <> 1 THEN
    RAISE EXCEPTION 'fn_ju_contexto_cliente: trecho não encontrado';
  END IF;
  EXECUTE replace(d, f, f || $$ 'remarcar_pelo_link', public.fn_ju_link_agenda_publica(a.id) IS NOT NULL,$$);
END $m$;
