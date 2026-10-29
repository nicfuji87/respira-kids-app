-- 29/10/2026: ajustes depois do teste de ju_anotacoes_e_comandos_agenda.sql
-- 1) fn_ju_anotar não começa o campo com linha em branco.
-- 2) fn_ju_anotacao_sugerir acha a pessoa certa quando a conversa tem vários responsáveis
--    (nome citado > nome do WhatsApp > responsável identificado > quem não é só "acesso à agenda" > pessoa única).
-- 3) fn_ju_comando_executar responde com o primeiro nome da profissional.
-- 4) ju_comandos aceita os status 'anotado' e 'agenda' (migration ju_comandos_status_anotado_agenda).

CREATE OR REPLACE FUNCTION public.fn_ju_anotar(p_pessoa_id uuid, p_texto text, p_origem text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_txt text := left(btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g')), 400); v_atual text; v_nome text;
BEGIN
  IF v_txt = '' THEN RETURN jsonb_build_object('ok', false, 'erro', 'texto vazio'); END IF;
  SELECT anotacoes_ju, split_part(btrim(nome), ' ', 1) INTO v_atual, v_nome FROM public.pessoas WHERE id = p_pessoa_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'erro', 'pessoa não encontrada'); END IF;
  IF position(lower(v_txt) IN lower(coalesce(v_atual, ''))) > 0 THEN
    RETURN jsonb_build_object('ok', true, 'ja_existia', true, 'nome', v_nome);
  END IF;
  UPDATE public.pessoas
     SET anotacoes_ju = CASE WHEN nullif(btrim(coalesce(anotacoes_ju, ''), E' \n\r\t'), '') IS NULL THEN v_txt
                             ELSE rtrim(anotacoes_ju, E' \n\r\t') || E'\n' || v_txt END,
         updated_at = now()
   WHERE id = p_pessoa_id;
  RETURN jsonb_build_object('ok', true, 'nome', v_nome, 'texto', v_txt, 'origem', p_origem);
END $function$;

CREATE OR REPLACE FUNCTION public.fn_ju_anotacao_sugerir(p_conversa_id bigint, p_alvo text, p_texto text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  ctx jsonb := public.fn_ju_contexto_cliente(p_conversa_id);
  v_txt text := left(btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g')), 300);
  v_alvo text := lower(split_part(btrim(coalesce(p_alvo, '')), ' ', 1));
  v_wa text := lower(split_part(btrim(coalesce((SELECT nome_whatsapp FROM public.ju_conversas WHERE id = p_conversa_id), '')), ' ', 1));
  v_pessoa uuid; v_nome text; v_atual text; v_id bigint;
BEGIN
  IF v_txt = '' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'texto vazio'); END IF;
  -- alvo citado > nome do WhatsApp > responsável identificado > um responsável da conversa > a única pessoa
  SELECT (x ->> 'paciente_id')::uuid, x ->> 'nome' INTO v_pessoa, v_nome
    FROM jsonb_array_elements(coalesce(ctx -> 'pacientes', '[]'::jsonb)) WITH ORDINALITY AS t(x, i)
   ORDER BY CASE WHEN v_alvo <> '' AND lower(split_part(btrim(x ->> 'nome'), ' ', 1)) = v_alvo THEN 1
                 WHEN v_alvo = '' AND v_wa <> '' AND lower(split_part(btrim(x ->> 'nome'), ' ', 1)) = v_wa THEN 2
                 WHEN v_alvo = '' AND x ->> 'nome' = ctx ->> 'responsavel_identificado' THEN 3
                 WHEN v_alvo = '' AND NOT coalesce((x ->> 'acesso_agenda')::boolean, false) THEN 4
                 WHEN v_alvo = '' AND jsonb_array_length(ctx -> 'pacientes') = 1 THEN 5
                 ELSE 9 END, i
   LIMIT 1;
  IF v_pessoa IS NULL OR (v_alvo <> '' AND lower(split_part(btrim(v_nome), ' ', 1)) <> v_alvo)
     OR (v_alvo = '' AND v_nome IS NOT DISTINCT FROM NULL) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa não identificada');
  END IF;
  SELECT anotacoes_ju INTO v_atual FROM public.pessoas WHERE id = v_pessoa;
  IF position(lower(v_txt) IN lower(coalesce(v_atual, ''))) > 0
     OR EXISTS (SELECT 1 FROM public.ju_anotacoes_sugeridas s
                 WHERE s.pessoa_id = v_pessoa AND lower(s.texto) = lower(v_txt)
                   AND (s.status IN ('pendente', 'aceita') OR s.created_at > now() - interval '30 days')) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'já anotado ou sugerido');
  END IF;
  INSERT INTO public.ju_anotacoes_sugeridas (conversa_id, pessoa_id, texto) VALUES (p_conversa_id, v_pessoa, v_txt)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'nome', v_nome, 'texto', v_txt,
                            'telefone', (SELECT regexp_replace(c.telefone, '^\+55(\d{2})(\d{4,5})(\d{4})$', '(\1) \2-\3')
                                           FROM public.ju_conversas c WHERE c.id = p_conversa_id));
END $function$;

CREATE OR REPLACE FUNCTION public.fn_ju_comando_executar(p_conversa_id bigint, p_mensagem_id bigint, p_decisao jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  d jsonb := coalesce(p_decisao, '{}'::jsonb);
  ctx jsonb := public.fn_ju_contexto_cliente(p_conversa_id);
  v_acao text := d ->> 'acao';
  v_pessoa uuid; v_r jsonb; v_prof text; v_quem text; v_txt text; v_periodo text;
BEGIN
  v_quem := CASE WHEN (SELECT origem FROM public.ju_mensagens WHERE id = p_mensagem_id) = 'CLIENTE'
                 THEN coalesce(public.fn_ju_equipe_por_telefone((SELECT telefone FROM public.ju_conversas WHERE id = p_conversa_id)) ->> 'nome', 'equipe')
                 ELSE 'Recepção' END;

  IF v_acao = 'anotar' THEN
    SELECT (x ->> 'paciente_id')::uuid INTO v_pessoa
      FROM jsonb_array_elements(coalesce(ctx -> 'pacientes', '[]'::jsonb)) x
     WHERE x ->> 'paciente_id' = d ->> 'pessoa_id' LIMIT 1;
    IF v_pessoa IS NULL THEN
      RETURN jsonb_build_object('texto', 'Não achei de quem é essa anotação. Me diz o nome da criança ou do responsável?', 'status', 'pergunta');
    END IF;
    v_r := public.fn_ju_anotar(v_pessoa, d ->> 'anotacao', '@ju ' || v_quem);
    IF NOT coalesce((v_r ->> 'ok')::boolean, false) THEN
      RETURN jsonb_build_object('texto', 'Não consegui anotar agora.', 'status', 'erro');
    END IF;
    RETURN jsonb_build_object('texto', CASE WHEN (v_r ->> 'ja_existia')::boolean THEN 'Isso já estava anotado.' ELSE 'Anotado.' END,
                              'status', 'anotado');
  END IF;

  IF v_acao IN ('fechar_agenda', 'abrir_agenda') THEN
    v_prof := coalesce(nullif(d ->> 'profissional', ''),
                       (SELECT btrim(nome) FROM public.pessoas WHERE id::text = d ->> 'profissional_id'));
    IF v_prof IS NULL THEN
      RETURN jsonb_build_object('texto', 'De qual profissional é a agenda?', 'status', 'pergunta');
    END IF;
    IF v_acao = 'fechar_agenda' THEN
      v_r := public.fn_ju_agenda_bloquear(v_prof, (d ->> 'data')::date, (d ->> 'data_fim')::date,
                                          (d ->> 'hora')::time, (d ->> 'hora_fim')::time, d ->> 'motivo', v_quem);
    ELSE
      v_r := public.fn_ju_agenda_desbloquear(v_prof, (d ->> 'data')::date, (d ->> 'data_fim')::date,
                                             (d ->> 'hora')::time, (d ->> 'hora_fim')::time, v_quem);
    END IF;
    IF NOT coalesce((v_r ->> 'ok')::boolean, false) THEN
      RETURN jsonb_build_object('texto', coalesce(v_r ->> 'erro', 'Não consegui mexer na agenda agora.'), 'status', 'pergunta');
    END IF;
    IF v_acao = 'abrir_agenda' THEN
      RETURN jsonb_build_object('texto', CASE WHEN jsonb_array_length(coalesce(v_r -> 'removidos', '[]'::jsonb)) > 0
                                              THEN 'Pronto, reabri a agenda de ' || split_part(btrim(v_r ->> 'profissional'), ' ', 1) || '.'
                                              ELSE 'Não achei bloqueio na agenda de ' || split_part(btrim(v_r ->> 'profissional'), ' ', 1) || ' nesse período.' END,
                                'status', 'agenda');
    END IF;
    v_periodo := CASE WHEN v_r ->> 'de' = v_r ->> 'ate' THEN 'em ' || (v_r ->> 'de') ELSE 'de ' || (v_r ->> 'de') || ' a ' || (v_r ->> 'ate') END
                 || CASE WHEN (v_r ->> 'dia_inteiro')::boolean THEN ', o dia todo'
                         ELSE ', das ' || (v_r ->> 'hora_inicio') || ' às ' || (v_r ->> 'hora_fim') END;
    v_txt := 'Pronto, fechei a agenda de ' || split_part(btrim(v_r ->> 'profissional'), ' ', 1) || ' ' || v_periodo || '.';
    IF jsonb_array_length(coalesce(v_r -> 'conflitos', '[]'::jsonb)) > 0 THEN
      v_txt := v_txt || E'\nAtenção: já há consulta nesse período: '
               || (SELECT string_agg((c ->> 'quando') || ' ' || split_part(btrim(c ->> 'paciente'), ' ', 1), ', ')
                     FROM jsonb_array_elements(v_r -> 'conflitos') c)
               || '. Elas continuam marcadas.';
    END IF;
    RETURN jsonb_build_object('texto', v_txt, 'status', 'agenda');
  END IF;

  RETURN jsonb_build_object('texto', '', 'status', 'erro');
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('texto', 'Não consegui fazer isso agora. A recepção vai conferir.', 'status', 'erro',
                            'erro', left(SQLERRM, 200));
END $function$;

ALTER TABLE public.ju_comandos DROP CONSTRAINT IF EXISTS ju_comandos_status_check;
ALTER TABLE public.ju_comandos ADD CONSTRAINT ju_comandos_status_check CHECK (status = ANY (ARRAY[
  'recebido', 'agendado', 'pergunta', 'recusado', 'erro', 'nao_suportado', 'executando',
  'cobrado', 'nota', 'informado', 'ajuda', 'anotado', 'agenda']));
