-- Follow-up (27/10/2026, ok do dono):
-- 1) Contato novo que só perguntou valor ou convênio e parou depois da resposta entra no follow-up,
--    com UMA mensagem só (sem o FU2 de 24 h). Famílias antigas continuam fora (so_pesquisou/so_convenio).
-- 2) Nunca faz follow-up quando a Ju passou o assunto para a Lolô (pedido aberto ou "avisei a Lolô")
--    e a Lolô ainda não respondeu: quem deve a resposta é a clínica, não a família.

-- A Ju passou o assunto para a secretaria e nenhuma mensagem da Lolô veio depois.
CREATE OR REPLACE FUNCTION public.fn_followup_aguardando_secretaria(p_conversa_id bigint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
  WITH h AS (SELECT max(m.created_at) AS t FROM public.ju_mensagens m
              WHERE m.conversa_id = p_conversa_id AND m.origem = 'HUMANO')
  SELECT EXISTS (SELECT 1 FROM public.ju_solicitacoes s, h
                  WHERE s.conversa_id = p_conversa_id AND s.status = 'ABERTA'
                    AND (h.t IS NULL OR h.t < s.created_at))
      OR EXISTS (SELECT 1 FROM public.ju_mensagens m, h
                  WHERE m.conversa_id = p_conversa_id AND m.origem = 'JU'
                    AND m.created_at > now() - interval '15 days'
                    AND (h.t IS NULL OR m.created_at > h.t)
                    AND m.conteudo ~* '((avisei|passei|pedi|encaminhei|vou (passar|avisar|pedir))\M.{0,50}(lol[ôo]|secret[áa]ri|equipe|fisios)|(lol[ôo]|secret[áa]ri[ao]|equipe)\M.{0,80}(respond|confirma|segue|seguir|te cham|retorn|verific|confer))')
$f$;
REVOKE ALL ON FUNCTION public.fn_followup_aguardando_secretaria(bigint) FROM PUBLIC, anon, authenticated;

-- Regras
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_followup_avaliar()'::regprocedure); n text;
BEGIN
  IF d LIKE '%pesquisa_contato_novo%' THEN RETURN; END IF;
  n := d;
  n := replace(n, 'o.etapa_maxima_ord, c.telefone, c.sem_ia',
                  'o.etapa_maxima_ord, c.telefone, c.sem_ia, coalesce(x.contato_novo, false) AS contato_novo');
  n := replace(n, $a$    ELSIF coalesce(v_cli, '') ~* v_re_recusa THEN$a$,
                  $a$    ELSIF public.fn_followup_aguardando_secretaria(r.conversa_id) THEN
      v_sit := 'aguardando_clinica'; v_mot := 'ju_passou_para_secretaria'; v_pop := 'responder_familia';
    ELSIF coalesce(v_cli, '') ~* v_re_recusa THEN$a$);
  n := replace(n, $a$ELSIF v_conv AND NOT v_pediu THEN v_sit := 'nao_elegivel'; v_mot := 'so_convenio';$a$,
                  $a$ELSIF v_conv AND NOT v_pediu AND NOT r.contato_novo THEN v_sit := 'nao_elegivel'; v_mot := 'so_convenio';$a$);
  n := replace(n, $a$ELSIF v_conv THEN v_sit := 'revisar';$a$,
                  $a$ELSIF v_conv AND v_pediu THEN v_sit := 'revisar';$a$);
  n := replace(n, $a$ELSIF NOT v_pediu THEN v_sit := 'nao_elegivel'; v_mot := 'so_pesquisou';$a$,
                  $a$ELSIF NOT v_pediu AND NOT r.contato_novo THEN v_sit := 'nao_elegivel'; v_mot := 'so_pesquisou';$a$);
  n := replace(n, $a$ELSIF NOT v_pend THEN$a$,
                  $a$ELSIF NOT v_pend AND (v_pediu OR (coalesce(v_clin, '') ~* v_re_despede AND position('?' IN coalesce(v_clin, '')) = 0)) THEN$a$);
  n := replace(n, $a$ELSE v_sit := 'candidato'; v_mot := 'familia_parou';$a$,
                  $a$ELSE v_sit := 'candidato'; v_mot := CASE WHEN v_pediu THEN 'familia_parou' ELSE 'pesquisa_contato_novo' END;$a$);
  IF (length(n) - length(d)) < 400 OR n NOT LIKE '%AS contato_novo%' OR n NOT LIKE '%ju_passou_para_secretaria%'
     OR n NOT LIKE '%AND NOT r.contato_novo THEN v_sit := ''nao_elegivel''; v_mot := ''so_convenio''%'
     OR n NOT LIKE '%v_conv AND v_pediu THEN%' OR n NOT LIKE '%AND NOT r.contato_novo THEN v_sit := ''nao_elegivel''; v_mot := ''so_pesquisou''%'
     OR n NOT LIKE '%NOT v_pend AND (v_pediu%' OR n NOT LIKE '%''pesquisa_contato_novo'' END%' THEN
    RAISE EXCEPTION 'fn_followup_avaliar: algum trecho não foi encontrado';
  END IF;
  EXECUTE n;
END
$mig$;

-- Na hora do envio também: Ju passou para a Lolô depois da avaliação = cancela.
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_followup_revalidar(uuid)'::regprocedure); n text;
BEGIN
  IF d LIKE '%fn_followup_aguardando_secretaria%' THEN RETURN; END IF;
  n := replace(d, $a$    WHEN EXISTS (SELECT 1 FROM public.ju_solicitacoes s WHERE s.conversa_id = t.conversa_id AND s.status = 'ABERTA'$a$,
                  $a$    WHEN public.fn_followup_aguardando_secretaria(t.conversa_id) THEN 'lolo_conduzindo'
    WHEN EXISTS (SELECT 1 FROM public.ju_solicitacoes s WHERE s.conversa_id = t.conversa_id AND s.status = 'ABERTA'$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_followup_revalidar: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

-- Pesquisa de contato novo: uma mensagem só, sem FU2.
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_followup_pos_envio(uuid)'::regprocedure); n text;
BEGIN
  IF d LIKE '%pesquisa_contato_novo%' THEN RETURN; END IF;
  n := replace(d, $a$  IF t.sequencia = 1 THEN$a$,
                  $a$  IF t.sequencia = 1 AND EXISTS (SELECT 1 FROM public.followup_avaliacoes f
                                   WHERE f.id = t.avaliacao_id AND f.motivo = 'pesquisa_contato_novo') THEN
    RETURN;  -- só perguntou valor ou convênio: uma mensagem, sem o FU2
  ELSIF t.sequencia = 1 THEN$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_followup_pos_envio: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

-- Analisador e redator recebem o modo da retomada.
CREATE OR REPLACE FUNCTION public.fn_followup_ia_item(p_avaliacao_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'avaliacao_id', f.id,
    'hoje', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ', '
            || (ARRAY['segunda','terça','quarta','quinta','sexta','sábado','domingo'])
               [extract(isodow FROM now() AT TIME ZONE 'America/Sao_Paulo')::int]
            || CASE WHEN public.fn_followup_dia_util((now() AT TIME ZONE 'America/Sao_Paulo')::date) THEN '' ELSE ' (não é dia útil)' END,
    'modo', CASE WHEN f.motivo = 'pesquisa_contato_novo' THEN 'PESQUISA_CONTATO_NOVO' ELSE 'RETOMADA_AGENDAMENTO' END,
    'perguntou_convenio', f.intencao = 'Perguntou sobre convênio',
    'minutos_desde_ultima_fala_da_clinica',
      CASE WHEN f.ultima_clinica_em IS NOT NULL THEN floor(extract(epoch FROM now() - f.ultima_clinica_em) / 60)::int END,
    'dias_uteis_desde_ultima_fala_da_clinica',
      CASE WHEN f.ultima_clinica_em IS NOT NULL THEN public.fn_followup_dias_uteis_motor(f.ultima_clinica_em, now()) END,
    'conversa', public.fn_followup_transcricao(f.conversa_id, o.aberta_em - interval '2 days'))
    FROM public.followup_avaliacoes f
    JOIN public.atrib_oportunidades o ON o.id = f.oportunidade_id
   WHERE f.id = p_avaliacao_id
$function$;

DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_followup_envio_lote()'::regprocedure); n text;
BEGIN
  IF d LIKE '%PESQUISA_CONTATO_NOVO%' THEN RETURN; END IF;
  n := replace(d, $a$'acao_pendente', f.acao_pendente)$a$,
                  $a$'acao_pendente', f.acao_pendente,
                                                'modo', CASE WHEN f.motivo = 'pesquisa_contato_novo' THEN 'PESQUISA_CONTATO_NOVO' ELSE 'RETOMADA_AGENDAMENTO' END,
                                                'perguntou_convenio', f.intencao = 'Perguntou sobre convênio')$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_followup_envio_lote: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

-- Validação do texto: novo tipo de pendência "pesquisa".
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_followup_validar_texto(text,text,text,integer[],integer[],integer)'::regprocedure); n text;
BEGIN
  IF d LIKE '%PESQUISA_RESPONDIDA%' THEN RETURN; END IF;
  n := replace(d, $a$WHEN p_tipo NOT IN ('cadastro','escolha_de_horario','informacao_pendente','domiciliar') THEN 'pendencia_incerta'$a$,
                  $a$WHEN p_tipo NOT IN ('cadastro','escolha_de_horario','informacao_pendente','domiciliar','pesquisa') THEN 'pendencia_incerta'
    WHEN (p_cenario = 'PESQUISA_RESPONDIDA') <> (p_tipo = 'pesquisa') THEN 'pendencia_incoerente'
    WHEN p_tipo = 'pesquisa' AND p_texto !~* '(agend|marcar|d[úu]vida|ajud|reembols|nota fiscal)' THEN 'texto_fora_da_pendencia'$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_followup_validar_texto: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;
