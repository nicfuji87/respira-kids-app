-- 09/11/2026 (caso Raquel/Manuela, ok do dono): antes de dizer "a Lolô vai confirmar quarta às 9h com a Bruna",
-- a Ju confere na agenda. Livre: segue para a Lolô confirmar. Ocupado: oferece até 3 horários livres da mesma fisio.
-- Ferramenta verificar_horario (Atendimento) → Ações "Ação de fixo?" (VERIFICAR_HORARIO) → fn_ju_acao_fixo.
CREATE OR REPLACE FUNCTION public.fn_ju_horario_verificar(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c ju_conversas; v_pac uuid; v_prof uuid; v_prof_nome text; v_fisio text := lower(unaccent(btrim(coalesce(p ->> 'tipo', ''))));
  v_data date; v_hora time; v_quando timestamp; v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_livre boolean; v_ops text[] := '{}'; v_dia date; v_t time;
BEGIN
  SELECT * INTO c FROM ju_conversas WHERE id = (p ->> 'conversa_id')::bigint;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'resposta', 'Conversa não encontrada. Responda exatamente [NADA].'); END IF;
  BEGIN v_data := nullif(p ->> 'data', '')::date; v_hora := nullif(p ->> 'hora', '')::time;
  EXCEPTION WHEN others THEN v_data := NULL; v_hora := NULL; END;
  IF v_data IS NULL OR v_hora IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Faltou o dia (AAAA-MM-DD) ou a hora (HH:MM) que a família pediu. Pergunte só o que faltou.');
  END IF;
  v_quando := v_data + v_hora;
  IF v_quando <= v_agora + interval '15 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Esse horário já passou. Pergunte à família outro dia e horário.');
  END IF;

  BEGIN v_pac := nullif(p ->> 'paciente_id', '')::uuid; EXCEPTION WHEN others THEN v_pac := NULL; END;
  IF v_fisio = 'bia' THEN v_fisio := 'beatriz'; END IF;
  IF v_fisio <> '' THEN
    SELECT pp.id INTO v_prof FROM pessoas pp
     WHERE pp.ativo AND lower(unaccent(split_part(btrim(pp.nome), ' ', 1))) = split_part(v_fisio, ' ', 1)
       AND EXISTS (SELECT 1 FROM agendamentos a WHERE a.profissional_id = pp.id AND a.data_hora > now() - interval '60 days')
     LIMIT 1;
  END IF;
  IF v_prof IS NULL AND v_pac IS NOT NULL THEN
    SELECT a.profissional_id INTO v_prof FROM agendamentos a JOIN consulta_status cs ON cs.id = a.status_consulta_id
     WHERE a.paciente_id = v_pac AND a.ativo AND cs.codigo NOT IN ('cancelado', 'erro')
     ORDER BY a.data_hora DESC LIMIT 1;
  END IF;
  IF v_prof IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Não sei com qual fisio é. Se a família não disse, siga sem conferir: chame a secretaria com o dia e a hora pedidos e diga que a Lolô vê e confirma por aqui.');
  END IF;
  SELECT split_part(btrim(nome), ' ', 1) INTO v_prof_nome FROM pessoas WHERE id = v_prof;

  IF v_hora >= time '18:00' THEN
    RETURN jsonb_build_object('ok', true, 'livre', null, 'resposta',
      'Depois das 18h é encaixe e só a equipe decide. Chame a secretaria com esse pedido e diga que a Lolô vê com a ' || v_prof_nome || ' e confirma por aqui.');
  END IF;

  v_livre := fn_agenda_expressa_slot_livre(v_prof, v_quando AT TIME ZONE 'UTC', 60, false);
  IF v_livre THEN
    RETURN jsonb_build_object('ok', true, 'livre', true, 'resposta',
      fn_ju_quando(v_quando) || ' com a ' || v_prof_nome || ' aparece livre na agenda. Chame a secretaria (AGENDAMENTO ou REMARCACAO) com esse horário e diga à família, numa frase, que o horário está disponível e a Lolô confirma por aqui. Não diga que já está marcado.');
  END IF;

  -- Ocupado: até 3 livres da mesma fisio, no mesmo dia e nos próximos 6 dias.
  v_dia := v_data;
  WHILE v_dia <= v_data + 6 AND cardinality(v_ops) < 3 LOOP
    FOR v_t IN SELECT t FROM unnest(fn_ju_grade(v_prof, v_dia)) t
                WHERE t < time '18:00' AND v_dia + t > v_agora + interval '15 minutes'
                  AND fn_agenda_expressa_slot_livre(v_prof, (v_dia + t) AT TIME ZONE 'UTC', 60, false)
                ORDER BY t LOOP
      EXIT WHEN cardinality(v_ops) >= 3;
      v_ops := v_ops || fn_ju_quando(v_dia + v_t);
    END LOOP;
    v_dia := v_dia + 1;
  END LOOP;
  IF cardinality(v_ops) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'livre', false, 'resposta',
      fn_ju_quando(v_quando) || ' com a ' || v_prof_nome || ' já está ocupado e não há outro horário livre dela nos próximos dias. Diga isso à família em uma frase, chame a secretaria com o pedido e diga que a Lolô vê um encaixe e responde por aqui.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'livre', false, 'opcoes', to_jsonb(v_ops), 'resposta',
    fn_ju_quando(v_quando) || ' com a ' || v_prof_nome || ' já está ocupado. Livres dela: ' || array_to_string(v_ops, '; ')
    || '. Diga à família, numa frase, que esse horário já foi preenchido e ofereça essas opções (sem dizer que viu a agenda inteira). Se ela escolher uma, chame a secretaria com o horário escolhido.');
END $function$;
REVOKE ALL ON FUNCTION public.fn_ju_horario_verificar(jsonb) FROM PUBLIC, anon, authenticated;

DO $mig$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.fn_ju_acao_fixo(jsonb)'::regprocedure);
  v_new := replace(v_def, $s$  IF v_acao = 'RECADO_FISIO' THEN RETURN public.fn_ju_recado_criar(p); END IF;$s$,
    $s$  IF v_acao = 'RECADO_FISIO' THEN RETURN public.fn_ju_recado_criar(p); END IF;
  IF v_acao = 'VERIFICAR_HORARIO' THEN RETURN public.fn_ju_horario_verificar(p); END IF;$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'fn_ju_acao_fixo: despacho não encontrado'; END IF;
  EXECUTE v_new;
END $mig$;
