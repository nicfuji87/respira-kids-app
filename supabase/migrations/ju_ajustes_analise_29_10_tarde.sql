-- 29/10/2026 (análise da tarde, ok do dono)
-- 1) "Oiiieeee" não era reconhecido como cumprimento: letras repetidas são juntadas antes da comparação.
-- 2) Follow-up não sai quando a fala da clínica que gerou a pendência foi da Lolô (HUMANO), só da Ju.
-- 3) "@ju coloca o motivo" no mesmo período atualiza o bloqueio existente em vez de criar outro;
--    na conversa com a própria profissional a resposta diz "sua agenda".
-- 4) Remove o bloqueio duplicado de 05/11 8h-9h (sem título) da Beatriz.
DO $mig$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_so_cumprimento(bigint)'::regprocedure);
  IF d NOT LIKE '%([a-z])\\1+%' THEN
    n := replace(d, $a$btrim(regexp_replace(lower(public.unaccent(coalesce(conteudo, ''))),$a$,
                    $a$btrim(regexp_replace(regexp_replace(lower(public.unaccent(coalesce(conteudo, ''))), '([a-z])\1+', '\1', 'g'),$a$);
    IF n = d THEN RAISE EXCEPTION 'fn_ju_so_cumprimento: trecho não encontrado'; END IF;
    EXECUTE n;
  END IF;

  d := pg_get_functiondef('public.fn_followup_revalidar(uuid)'::regprocedure);
  IF d NOT LIKE '%m.origem = ''HUMANO'' AND m.created_at >= v_desde%' THEN
    n := replace(d, $a$m.origem = 'HUMANO' AND m.created_at > v_desde)$a$, $a$m.origem = 'HUMANO' AND m.created_at >= v_desde - interval '1 minute')$a$);
    IF n = d THEN RAISE EXCEPTION 'fn_followup_revalidar: trecho não encontrado'; END IF;
    EXECUTE n;
  END IF;

  d := pg_get_functiondef('public.fn_ju_agenda_bloquear(text, date, date, time, time, text, text)'::regprocedure);
  IF d NOT LIKE '%v_upd%' THEN
    n := replace(d, $a$  v_n        integer := 0;$a$, $a$  v_n        integer := 0;
  v_upd      integer := 0;$a$);
    n := replace(n, $a$  INSERT INTO public.agenda_bloqueios (profissional_id, inicio, fim, dia_inteiro, motivo, titulo, observacao,$a$,
$a$  UPDATE public.agenda_bloqueios b
     SET titulo = coalesce(left(nullif(trim(coalesce(p_motivo, '')), ''), 120), b.titulo),
         motivo = CASE WHEN nullif(trim(coalesce(p_motivo, '')), '') IS NOT NULL THEN public.fn_ju_motivo_bloqueio(p_motivo) ELSE b.motivo END,
         updated_at = now()
   WHERE b.ativo AND b.deleted_at IS NULL AND b.profissional_id IS NOT DISTINCT FROM v_prof_id
     AND EXISTS (SELECT 1 FROM unnest(v_janelas) j
                  WHERE b.inicio = lower(j) AT TIME ZONE 'UTC' AND b.fim = upper(j) AT TIME ZONE 'UTC');
  GET DIAGNOSTICS v_upd = ROW_COUNT;

  INSERT INTO public.agenda_bloqueios (profissional_id, inicio, fim, dia_inteiro, motivo, titulo, observacao,$a$);
    n := replace(n, $a$  FROM unnest(v_janelas) j;
  GET DIAGNOSTICS v_n = ROW_COUNT;$a$, $a$  FROM unnest(v_janelas) j
  WHERE NOT EXISTS (SELECT 1 FROM public.agenda_bloqueios b
                     WHERE b.ativo AND b.deleted_at IS NULL AND b.profissional_id IS NOT DISTINCT FROM v_prof_id
                       AND b.inicio = lower(j) AT TIME ZONE 'UTC' AND b.fim = upper(j) AT TIME ZONE 'UTC');
  GET DIAGNOSTICS v_n = ROW_COUNT;$a$);
    n := replace(n, $a$'blocos', v_n, 'dia_inteiro'$a$, $a$'blocos', v_n, 'atualizados', v_upd, 'dia_inteiro'$a$);
    IF n NOT LIKE '%GET DIAGNOSTICS v_upd%' OR n NOT LIKE '%''atualizados'', v_upd%' OR n NOT LIKE '%WHERE NOT EXISTS (SELECT 1 FROM public.agenda_bloqueios b%' THEN
      RAISE EXCEPTION 'fn_ju_agenda_bloquear: trecho não encontrado';
    END IF;
    EXECUTE n;
  END IF;

  d := pg_get_functiondef('public.fn_ju_comando_executar(bigint, bigint, jsonb)'::regprocedure);
  IF d NOT LIKE '%v_dono%' THEN
    n := replace(d, $a$v_txt text; v_periodo text;$a$, $a$v_txt text; v_periodo text; v_dono text;$a$);
    n := replace(n, $a$    IF NOT coalesce((v_r ->> 'ok')::boolean, false) THEN
      RETURN jsonb_build_object('texto', coalesce(v_r ->> 'erro', 'Não consegui mexer na agenda agora.'), 'status', 'pergunta');
    END IF;$a$, $a$    IF NOT coalesce((v_r ->> 'ok')::boolean, false) THEN
      RETURN jsonb_build_object('texto', coalesce(v_r ->> 'erro', 'Não consegui mexer na agenda agora.'), 'status', 'pergunta');
    END IF;
    v_dono := CASE WHEN lower(split_part(btrim(v_quem), ' ', 1)) = lower(split_part(btrim(v_r ->> 'profissional'), ' ', 1))
                   THEN 'sua agenda' ELSE 'agenda de ' || split_part(btrim(v_r ->> 'profissional'), ' ', 1) END;$a$);
    n := replace(n, $a$'Pronto, reabri a agenda de ' || split_part(btrim(v_r ->> 'profissional'), ' ', 1) || '.'$a$,
                    $a$'Pronto, reabri a ' || v_dono || '.'$a$);
    n := replace(n, $a$'Não achei bloqueio na agenda de ' || split_part(btrim(v_r ->> 'profissional'), ' ', 1) || ' nesse período.'$a$,
                    $a$'Não achei bloqueio na ' || v_dono || ' nesse período.'$a$);
    n := replace(n, $a$v_txt := 'Pronto, fechei a agenda de ' || split_part(btrim(v_r ->> 'profissional'), ' ', 1) || ' ' || v_periodo || '.';$a$,
                    $a$v_txt := CASE WHEN coalesce((v_r ->> 'blocos')::int, 0) = 0 AND coalesce((v_r ->> 'atualizados')::int, 0) > 0
                  THEN 'Pronto, anotei o motivo' || coalesce(' (' || (v_r ->> 'titulo') || ')', '') || ' no bloqueio da ' || v_dono || ' ' || v_periodo || '.'
                  ELSE 'Pronto, fechei a ' || v_dono || ' ' || v_periodo || '.' END;$a$);
    IF n NOT LIKE '%anotei o motivo%' OR n NOT LIKE '%reabri a '' || v_dono%' THEN RAISE EXCEPTION 'fn_ju_comando_executar: trecho não encontrado'; END IF;
    EXECUTE n;
  END IF;
END
$mig$;

UPDATE public.agenda_bloqueios SET ativo = false, deleted_at = now(), updated_at = now()
 WHERE id = '21f4c43a-1ba7-486c-9b69-6bed6fe804b5' AND titulo IS NULL
   AND EXISTS (SELECT 1 FROM public.agenda_bloqueios o WHERE o.id = '856eaec2-7ec2-4c8d-b0ba-ad3983f28432' AND o.ativo AND o.deleted_at IS NULL);

-- 5) Aviso de contrato sem "É só responder sim": termina na pergunta; a Ju entende qualquer resposta afirmativa.
--    (texto dos nós n8n editori: Agendamento "Paciente sem contrato", Lembrete "Envia Notificação"/"Envia Notificação1")
UPDATE public.ju_conhecimento
   SET texto = replace(texto,
         'o aviso pergunta "Posso reenviar para este WhatsApp e para o e-mail ...? É só responder sim". Quando a família responder que sim (ou "pode", "ok", "reenvia")',
         'o aviso pergunta "Posso reenviar para este WhatsApp e para o e-mail ...?". Quando a família responder de forma afirmativa (sim, pode, ok, reenvia, por favor, um emoji de positivo)'),
       updated_at = now()
 WHERE id = 'CONTRATO_ASSINATURA';
