-- 29/10/2026 (pedido do dono):
-- 1) Campo novo pessoas.anotacoes_ju ("Anotações para a Ju"): texto livre que a Ju lê e usa na conversa
--    (ex.: "prefere segunda às 11h"). O campo "observacoes" continua como está (anotações internas).
-- 2) "@ju grava/anota/lembra que..." acrescenta no campo; a própria Ju sugere anotações no grupo
--    (botões Acrescentar/Descartar) quando percebe uma preferência na conversa.
-- 3) "@ju fecha/abre a agenda" em qualquer conversa, inclusive vindo do celular da profissional
--    ("@ju fecha minha agenda amanhã").

ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS anotacoes_ju text;
COMMENT ON COLUMN public.pessoas.anotacoes_ju IS 'Anotações para a Ju: preferências e informações que a assistente pode usar na conversa com a família. Não usar para comentários internos (use observacoes).';

-- A Ju recebe as anotações de cada pessoa da família
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_contexto_cliente(bigint)'::regprocedure); n text;
BEGIN
  IF d LIKE '%anotacoes_ju%' THEN RETURN; END IF;
  n := replace(d, $a$'paciente_id', pac.id,
        'nome', pac.nome,$a$,
                  $a$'paciente_id', pac.id,
        'nome', pac.nome,
        'anotacoes_ju', nullif(btrim(regexp_replace(coalesce(pac.anotacoes_ju, ''), '<[^>]+>|&nbsp;', ' ', 'g')), ''),$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_contexto_cliente: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

-- Acrescenta uma linha nas anotações (sem repetir o que já está escrito)
CREATE OR REPLACE FUNCTION public.fn_ju_anotar(p_pessoa_id uuid, p_texto text, p_origem text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE v_txt text := left(btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g')), 400); v_atual text; v_nome text;
BEGIN
  IF v_txt = '' THEN RETURN jsonb_build_object('ok', false, 'erro', 'texto vazio'); END IF;
  SELECT anotacoes_ju, split_part(btrim(nome), ' ', 1) INTO v_atual, v_nome FROM public.pessoas WHERE id = p_pessoa_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'erro', 'pessoa não encontrada'); END IF;
  IF position(lower(v_txt) IN lower(coalesce(v_atual, ''))) > 0 THEN
    RETURN jsonb_build_object('ok', true, 'ja_existia', true, 'nome', v_nome);
  END IF;
  UPDATE public.pessoas
     SET anotacoes_ju = nullif(btrim(coalesce(anotacoes_ju, '') || E'\n' || v_txt), ''),
         updated_at = now()
   WHERE id = p_pessoa_id;
  RETURN jsonb_build_object('ok', true, 'nome', v_nome, 'texto', v_txt, 'origem', p_origem);
END $f$;
REVOKE ALL ON FUNCTION public.fn_ju_anotar(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_anotar(uuid, text, text) TO service_role;

-- Sugestões da própria Ju (vão para o grupo com botões)
CREATE TABLE IF NOT EXISTS public.ju_anotacoes_sugeridas (
  id bigserial PRIMARY KEY,
  conversa_id bigint REFERENCES public.ju_conversas(id) ON DELETE CASCADE,
  pessoa_id uuid REFERENCES public.pessoas(id) ON DELETE CASCADE,
  texto text NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aceita', 'descartada')),
  msg_id text,
  decidida_por text,
  decidida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ju_anotacoes_sugeridas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_anotacoes_sugeridas FROM anon, authenticated;

-- p_alvo: primeiro nome da pessoa a quem a anotação se refere (criança ou responsável); sem alvo, o responsável da conversa
CREATE OR REPLACE FUNCTION public.fn_ju_anotacao_sugerir(p_conversa_id bigint, p_alvo text, p_texto text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE
  ctx jsonb := public.fn_ju_contexto_cliente(p_conversa_id);
  v_txt text := left(btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g')), 300);
  v_alvo text := lower(btrim(coalesce(p_alvo, '')));
  v_pessoa uuid; v_nome text; v_atual text; v_id bigint;
BEGIN
  IF v_txt = '' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'texto vazio'); END IF;
  SELECT (x ->> 'paciente_id')::uuid, x ->> 'nome' INTO v_pessoa, v_nome
    FROM jsonb_array_elements(coalesce(ctx -> 'pacientes', '[]'::jsonb)) x
   WHERE v_alvo <> '' AND lower(split_part(btrim(x ->> 'nome'), ' ', 1)) = split_part(v_alvo, ' ', 1)
   LIMIT 1;
  IF v_pessoa IS NULL THEN
    SELECT (x ->> 'paciente_id')::uuid, x ->> 'nome' INTO v_pessoa, v_nome
      FROM jsonb_array_elements(coalesce(ctx -> 'pacientes', '[]'::jsonb)) x
     WHERE x ->> 'nome' = ctx ->> 'responsavel_identificado'
     LIMIT 1;
  END IF;
  IF v_pessoa IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa não identificada'); END IF;
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
END $f$;
REVOKE ALL ON FUNCTION public.fn_ju_anotacao_sugerir(bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_anotacao_sugerir(bigint, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_ju_anotacao_guardar_msg(p_id bigint, p_msg_id text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $f$ UPDATE public.ju_anotacoes_sugeridas SET msg_id = p_msg_id WHERE id = p_id; $f$;
REVOKE ALL ON FUNCTION public.fn_ju_anotacao_guardar_msg(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_anotacao_guardar_msg(bigint, text) TO service_role;

-- Botão do grupo: aceitar grava no cadastro; descartar só registra
CREATE OR REPLACE FUNCTION public.fn_ju_anotacao_decidir(p_id bigint, p_aceitar boolean, p_quem text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE s public.ju_anotacoes_sugeridas; v_nome text;
BEGIN
  SELECT * INTO s FROM public.ju_anotacoes_sugeridas WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sugestão não encontrada'); END IF;
  SELECT split_part(btrim(nome), ' ', 1) INTO v_nome FROM public.pessoas WHERE id = s.pessoa_id;
  IF s.status <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'já decidida', 'status', s.status, 'nome', v_nome, 'msg_id', s.msg_id);
  END IF;
  IF p_aceitar THEN PERFORM public.fn_ju_anotar(s.pessoa_id, s.texto, 'sugestão da Ju'); END IF;
  UPDATE public.ju_anotacoes_sugeridas
     SET status = CASE WHEN p_aceitar THEN 'aceita' ELSE 'descartada' END, decidida_por = p_quem, decidida_em = now()
   WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'aceita', p_aceitar, 'nome', v_nome, 'texto', s.texto, 'msg_id', s.msg_id,
                            'quem', coalesce(nullif(p_quem, ''), 'alguém'));
END $f$;
REVOKE ALL ON FUNCTION public.fn_ju_anotacao_decidir(bigint, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_anotacao_decidir(bigint, boolean, text) TO service_role;

-- Comando: quem pediu (recepção ou a profissional pelo celular dela) e com quem é a conversa
CREATE OR REPLACE FUNCTION public.fn_ju_equipe_por_telefone(p_telefone text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
  SELECT jsonb_build_object('pessoa_id', p.id, 'nome', btrim(p.nome), 'role', p.role)
    FROM public.pessoas p
   WHERE p.ativo AND p.role IN ('profissional', 'admin', 'secretaria')
     AND public.fn_atrib_tel_chave(p.telefone::text) = public.fn_atrib_tel_chave(p_telefone)
   ORDER BY (p.role = 'profissional') DESC
   LIMIT 1
$f$;
REVOKE ALL ON FUNCTION public.fn_ju_equipe_por_telefone(text) FROM PUBLIC, anon, authenticated;

DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_comando_contexto(bigint,bigint)'::regprocedure); n text;
BEGIN
  IF d LIKE '%conversa_com%' THEN RETURN; END IF;
  n := replace(d, $a$'comando', (SELECT conteudo FROM ju_mensagens WHERE id = p_mensagem_id),$a$,
                  $a$'comando', (SELECT conteudo FROM ju_mensagens WHERE id = p_mensagem_id),
    'quem_pediu', CASE WHEN (SELECT origem FROM ju_mensagens WHERE id = p_mensagem_id) = 'CLIENTE'
                       THEN public.fn_ju_equipe_por_telefone((SELECT telefone FROM ju_conversas WHERE id = p_conversa_id))
                       ELSE jsonb_build_object('nome', 'Recepção') END,
    'conversa_com', public.fn_ju_equipe_por_telefone((SELECT telefone FROM ju_conversas WHERE id = p_conversa_id)),$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_comando_contexto: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

-- Execução das ações novas do @ju (anotar, fechar e abrir agenda). Devolve o texto da resposta.
CREATE OR REPLACE FUNCTION public.fn_ju_comando_executar(p_conversa_id bigint, p_mensagem_id bigint, p_decisao jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
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
                                              THEN 'Pronto, reabri a agenda de ' || (v_r ->> 'profissional') || '.'
                                              ELSE 'Não achei bloqueio na agenda de ' || (v_r ->> 'profissional') || ' nesse período.' END,
                                'status', 'agenda');
    END IF;
    v_periodo := CASE WHEN v_r ->> 'de' = v_r ->> 'ate' THEN 'em ' || (v_r ->> 'de') ELSE 'de ' || (v_r ->> 'de') || ' a ' || (v_r ->> 'ate') END
                 || CASE WHEN (v_r ->> 'dia_inteiro')::boolean THEN ', o dia todo'
                         ELSE ', das ' || (v_r ->> 'hora_inicio') || ' às ' || (v_r ->> 'hora_fim') END;
    v_txt := 'Pronto, fechei a agenda de ' || (v_r ->> 'profissional') || ' ' || v_periodo || '.';
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
END $f$;
REVOKE ALL ON FUNCTION public.fn_ju_comando_executar(bigint, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_comando_executar(bigint, bigint, jsonb) TO service_role;

-- "@ju ..." escrito pela própria profissional (do celular dela) vira comando, e a Ju não responde como atendimento
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_receber(text,text,text,boolean,boolean,text,text)'::regprocedure); n text;
BEGIN
  IF d LIKE '%COMANDO_EQUIPE%' THEN RETURN; END IF;
  n := replace(d, $a$  v_conta := v_origem = 'CLIENTE' AND v_tipo <> 'BOTAO';$a$,
                  $a$  v_conta := v_origem = 'CLIENTE' AND v_tipo <> 'BOTAO'
             AND NOT (v_tipo = 'TEXT' AND coalesce(p_conteudo, '') ~* '^\s*@ju([^[:alnum:]]|$)' AND p_wa_chatid NOT LIKE '%@g.us'
                      AND public.fn_ju_eh_equipe(coalesce(c.telefone, public.fn_ju_telefone(p_telefone))));$a$);
  n := replace(n, $a$  IF v_origem = 'HUMANO' THEN
    UPDATE public.ju_conversas$a$,
                  $a$  IF v_origem = 'CLIENTE' AND NOT v_conta AND v_tipo = 'TEXT' AND coalesce(p_conteudo, '') ~* '^\s*@ju([^[:alnum:]]|$)' THEN
    INSERT INTO public.ju_comandos (conversa_id, mensagem_id, texto) VALUES (c.id, v_msg, btrim(p_conteudo))
    ON CONFLICT (mensagem_id) DO NOTHING;
    RETURN jsonb_build_object('acao', 'NADA', 'motivo', 'COMANDO_EQUIPE', 'conversa_id', c.id, 'midia', false,
                              'comando', true, 'mensagem_id', v_msg, 'wa_chatid', c.wa_chatid);
  END IF;

  IF v_origem = 'HUMANO' THEN
    UPDATE public.ju_conversas$a$);
  IF n NOT LIKE '%COMANDO_EQUIPE%' OR n NOT LIKE '%AND NOT (v_tipo = ''TEXT''%' THEN
    RAISE EXCEPTION 'fn_ju_receber: trecho não encontrado';
  END IF;
  EXECUTE n;
END
$mig$;
