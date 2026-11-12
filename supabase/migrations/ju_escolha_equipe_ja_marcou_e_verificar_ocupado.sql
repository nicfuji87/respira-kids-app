-- 12/11/2026 (aprovado pelo dono).
-- 1) Casos Tamara e Serena: o número da conversa não está ligado ao cadastro (estrangeiro / babá), a família disse
--    "sim" ao horário que a equipe ofereceu e a Ju pediu cadastro de quem já estava marcado. Agora, antes de pedir
--    cadastro, se já existe consulta da equipe nesse horário com essa fisio, a escolha encerra calada (ja_marcado).
-- 2) verificar_horario para fisio não liberada (Bruna/Flávia): a Ju pode dizer que o horário NÃO está disponível
--    (sem oferecer outros); se estiver livre, vai para a secretaria sem dizer que está livre (a Lolô pode ter marcado
--    algo que ainda não está no sistema).
-- Base da Ju (editada direto em ju_conhecimento): DURACAO_SESSAO (45 min só para respiratória/motora; laser e outros
-- procedimentos ficam com a Lolô) e VALOR_BEATRIZ (por que a Beatriz custa menos).
DO $mig$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.fn_ju_escolha_aplicar(bigint,jsonb)'::regprocedure);
  v_new := regexp_replace(v_def, 'DECLARE\n', E'DECLARE\n  v_fq text;\n');
  v_new := replace(v_new,
$s$  IF v_n = 0 OR v_crianca_nova IS NOT NULL THEN
    IF e.cadastro_pedido_em IS NULL THEN$s$,
$s$  -- 12/11/2026: a equipe já marcou esse horário com essa fisio (número não ligado ao cadastro) → não pede cadastro
  IF v_n = 0 OR v_crianca_nova IS NOT NULL THEN
    v_fq := lower(unaccent(coalesce(nullif(btrim(r -> 'escolha' ->> 'fisio'), ''), nullif(btrim(r ->> 'fisio_historico'), ''), '')));
    IF v_fq = 'bia' THEN v_fq := 'beatriz'; END IF;
    IF v_fq <> '' AND EXISTS (
         SELECT 1 FROM agendamentos a JOIN consulta_status cs ON cs.id = a.status_consulta_id
           JOIN pessoas pf ON pf.id = a.profissional_id
          WHERE a.ativo AND cs.codigo NOT IN ('cancelado', 'erro')
            AND (a.data_hora AT TIME ZONE 'UTC') = v_quando
            AND lower(unaccent(split_part(btrim(pf.nome), ' ', 1))) = split_part(v_fq, ' ', 1)) THEN
      UPDATE ju_escolhas_horario SET status = 'ja_marcado', resultado = jsonb_build_object('motivo', 'equipe_ja_marcou_horario') WHERE id = p_id;
      RETURN jsonb_build_object('ok', false, 'motivo', 'equipe_ja_marcou_horario');
    END IF;
  END IF;
  IF v_n = 0 OR v_crianca_nova IS NOT NULL THEN
    IF e.cadastro_pedido_em IS NULL THEN$s$);
  IF position('equipe_ja_marcou_horario' in v_new) = 0 OR position('v_fq text;' in v_new) = 0 THEN
    RAISE EXCEPTION 'fn_ju_escolha_aplicar: trecho não encontrado';
  END IF;
  EXECUTE v_new;

  v_def := pg_get_functiondef('public.fn_ju_horario_verificar(jsonb)'::regprocedure);
  v_new := replace(v_def,
$s$  IF NOT EXISTS (SELECT 1 FROM ju_reserva_config rc WHERE rc.ativo AND rc.profissional_id = v_prof) THEN
    RETURN jsonb_build_object('ok', true, 'livre', null, 'resposta',$s$,
$s$  IF NOT EXISTS (SELECT 1 FROM ju_reserva_config rc WHERE rc.ativo AND rc.profissional_id = v_prof) THEN
    IF v_hora < time '18:00' AND NOT fn_agenda_expressa_slot_livre(v_prof, v_quando AT TIME ZONE 'UTC', 60, false) THEN
      RETURN jsonb_build_object('ok', true, 'livre', false, 'resposta',
        fn_ju_quando(v_quando) || ' com a ' || v_prof_nome || ' não está disponível. Diga isso à família numa frase. NÃO sugira outros horários dela. '
        || 'Chame a secretaria (AGENDAMENTO ou REMARCACAO) com o pedido e diga que a Lolô vê outra possibilidade com a ' || v_prof_nome || ' e responde por aqui.');
    END IF;
    RETURN jsonb_build_object('ok', true, 'livre', null, 'resposta',$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'fn_ju_horario_verificar: trecho não encontrado'; END IF;
  EXECUTE v_new;
END $mig$;
