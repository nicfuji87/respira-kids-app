-- AI dev note: 04/11/2026 (pedido do dono, caso Madalena): "@ju remarca/altera a próxima sessão para sexta 9h"
-- na conversa da família. A IA (Comando G1ZIuU7x7j1lSBLZ, acao 'remarcar') escolhe a consulta em
-- criancas[].proximas_consultas e o novo dia/hora; o banco confere e muda. Mesma fisio só (trocar de fisio
-- muda empresa, sala e valor: é pelo app), sem atravessar dia útil/fim de semana. A família recebe a
-- "Consulta Remarcada" pelo fluxo de agendamento, como em qualquer remarcação.

CREATE OR REPLACE FUNCTION public.fn_ju_comando_remarcar(p_conversa_id bigint, p_quem text, d jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  a agendamentos; v_ag uuid; v_nova timestamp; v_antes timestamp; v_prof uuid; v_pac text; v_fisio text;
  v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo'; v_fds_antes boolean; v_fds_nova boolean;
BEGIN
  BEGIN v_ag := (d -> 'agendamento_ids' ->> 0)::uuid; EXCEPTION WHEN OTHERS THEN v_ag := NULL; END;
  SELECT * INTO a FROM agendamentos
   WHERE id = v_ag AND ativo
     AND paciente_id IN (SELECT (x ->> 'paciente_id')::uuid
                           FROM jsonb_array_elements(coalesce(fn_ju_contexto_cliente(p_conversa_id) -> 'pacientes', '[]'::jsonb)) x);
  IF a.id IS NULL THEN
    RETURN jsonb_build_object('texto', 'Não achei essa consulta entre as próximas desta família. Qual consulta devo remarcar?', 'status', 'pergunta');
  END IF;
  IF (SELECT codigo FROM consulta_status WHERE id = a.status_consulta_id) NOT IN ('agendado', 'confirmado') THEN
    RETURN jsonb_build_object('texto', 'Essa consulta não está mais marcada, então não dá para remarcar. Confira no app.', 'status', 'pergunta');
  END IF;
  BEGIN v_nova := (d ->> 'data')::date + (d ->> 'hora')::time; EXCEPTION WHEN OTHERS THEN v_nova := NULL; END;
  IF v_nova IS NULL THEN
    RETURN jsonb_build_object('texto', 'Para qual dia e horário remarco?', 'status', 'pergunta');
  END IF;
  v_antes := a.data_hora AT TIME ZONE 'UTC';
  SELECT split_part(btrim(nome), ' ', 1) INTO v_pac FROM pessoas WHERE id = a.paciente_id;
  SELECT split_part(btrim(nome), ' ', 1) INTO v_fisio FROM pessoas WHERE id = a.profissional_id;
  IF v_nova < v_agora + interval '15 minutes' THEN
    RETURN jsonb_build_object('texto', 'Esse horário já passou. Para qual dia e horário remarco?', 'status', 'pergunta');
  END IF;
  BEGIN v_prof := nullif(d ->> 'profissional_id', '')::uuid; EXCEPTION WHEN OTHERS THEN v_prof := NULL; END;
  IF v_prof IS NOT NULL AND v_prof <> a.profissional_id THEN
    RETURN jsonb_build_object('texto', 'Trocar de fisio muda a sala e o valor, então essa troca é pelo app. Mantendo com a ' || v_fisio || ', posso remarcar.', 'status', 'pergunta');
  END IF;
  IF v_nova = v_antes THEN
    RETURN jsonb_build_object('texto', 'A consulta de ' || v_pac || ' já está ' || fn_ju_quando(v_nova) || '.', 'status', 'pergunta');
  END IF;
  v_fds_antes := extract(isodow FROM v_antes) IN (6, 7) OR EXISTS (SELECT 1 FROM followup_feriados WHERE dia = v_antes::date);
  v_fds_nova := extract(isodow FROM v_nova) IN (6, 7) OR EXISTS (SELECT 1 FROM followup_feriados WHERE dia = v_nova::date);
  IF v_fds_antes <> v_fds_nova THEN
    RETURN jsonb_build_object('texto', 'Passar entre dia útil e fim de semana ou feriado muda o valor, então essa troca é pelo app.', 'status', 'pergunta');
  END IF;
  IF NOT fn_ju_troca_livre(a.id, v_nova) THEN
    RETURN jsonb_build_object('texto', 'A ' || v_fisio || ' não está livre ' || fn_ju_quando(v_nova) || '. Se for encaixe, remarque pelo app.', 'status', 'pergunta');
  END IF;
  UPDATE agendamentos
     SET data_hora = v_nova AT TIME ZONE 'UTC',
         observacao = concat_ws(' ', nullif(btrim(observacao), ''),
           '[@ju] remarcada de ' || fn_ju_quando(v_antes) || ' por ' || coalesce(nullif(btrim(p_quem), ''), 'equipe') || '.'),
         updated_at = now()
   WHERE id = a.id;
  RETURN jsonb_build_object('texto', 'Pronto, consulta remarcada! Vocês vão receber a confirmação em seguida.', 'status', 'agendado',
                            'agendamento_id', a.id, 'de', fn_ju_quando(v_antes), 'para', fn_ju_quando(v_nova));
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_ju_comando_remarcar(bigint, text, jsonb) FROM anon, authenticated, public;

DO $do$
DECLARE d text := pg_get_functiondef('public.fn_ju_comando_executar'::regproc);
BEGIN
  IF position($a$  IF v_acao IN ('lista_espera_adicionar', 'lista_espera_remover', 'lista_espera_ver') THEN$a$ IN d) = 0 THEN
    RAISE EXCEPTION 'fn_ju_comando_executar: trecho não encontrado';
  END IF;
  EXECUTE replace(d, $a$  IF v_acao IN ('lista_espera_adicionar', 'lista_espera_remover', 'lista_espera_ver') THEN$a$,
    $a$  IF v_acao = 'remarcar' THEN
    RETURN public.fn_ju_comando_remarcar(p_conversa_id, v_quem, d);
  END IF;

  IF v_acao IN ('lista_espera_adicionar', 'lista_espera_remover', 'lista_espera_ver') THEN$a$);
END $do$;
