-- 30/10/2026 (pedido do dono): a Dra. Flávia Querubim (pneumopediatra) escreveu indicando uma paciente e a Ju
-- tratou a médica como mãe; o pai escreveu em outra conversa e a Ju não sabia da indicação.
--
-- 1. O número do médico fica no cadastro dele (pessoas.telefone, tipo médico/profissional externo). Com isso a Ju
--    reconhece o contato em qualquer conversa (contato_profissional) e não o trata como contato novo.
-- 2. Quando o profissional se apresenta, a Ju marca [PROFISSIONAL Nome | especialidade] e o banco liga sozinho
--    se houver exatamente um cadastro com esse nome e sem telefone. Sem cadastro, com mais de um, ou com
--    conflito: card no grupo 🔔 com botões (É ela / Cadastrar / Ignorar). O clique resolve e apaga o card.
-- 3. A indicação feita por um profissional nas últimas 72 h aparece para a família com dois sobrenomes em comum
--    (indicacoes_medicas), para a Ju não perguntar de novo e saber do pedido de prioridade.
--
-- Conferido antes: gravar telefone em cadastro de médico não manda mensagem a ninguém (o resumo diário de
-- pediatras vai para números fixos da clínica; "cadastro realizado" só age para paciente).

-- ---------------------------------------------------------------- nomes
CREATE OR REPLACE FUNCTION public.fn_ju_nome_tokens(p text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO '' AS $f$
  SELECT coalesce(array_agg(w ORDER BY o), '{}')
    FROM regexp_split_to_table(lower(public.unaccent(coalesce(p, ''))), '[^a-z]+') WITH ORDINALITY t(w, o)
   WHERE length(w) >= 3 AND w NOT IN ('dra', 'doutor', 'doutora', 'das', 'dos', 'del');
$f$;

-- sobrenomes pouco comuns (sem o primeiro nome), para ligar indicação à família sem confundir "Silva" com "Silva"
CREATE OR REPLACE FUNCTION public.fn_ju_sobrenomes_raros(p text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO '' AS $f$
  SELECT coalesce(array_agg(w), '{}')
    FROM unnest((public.fn_ju_nome_tokens(p))[2:]) w
   WHERE w NOT IN ('silva','santos','souza','sousa','oliveira','pereira','lima','costa','ferreira','rodrigues',
                   'almeida','carvalho','gomes','martins','araujo','ribeiro','alves','barbosa','rocha','dias',
                   'nascimento','moreira','cardoso','teixeira','mendes','freitas','vieira','soares','castro',
                   'campos','andrade','lopes','monteiro','pinto','machado','nunes','melo','ramos','batista',
                   'fernandes','marques','reis','junior','filho','neto','sobrinho','jesus','paula','maria');
$f$;

-- ---------------------------------------------------------------- quem é o contato
CREATE OR REPLACE FUNCTION public.fn_ju_contato_profissional(p_conversa_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  SELECT jsonb_build_object(
           'pessoa_id', p.id,
           'nome', btrim(p.nome),
           'tipo', CASE t.codigo WHEN 'medico' THEN 'médico' ELSE 'profissional externo' END,
           'especialidade', coalesce(nullif(btrim(p.especialidade), ''),
                                     (SELECT nullif(btrim(pp.especialidade), '') FROM public.pessoa_pediatra pp
                                       WHERE pp.pessoa_id = p.id AND coalesce(pp.ativo, true) LIMIT 1)),
           'pacientes_na_clinica', (SELECT count(DISTINCT pc.paciente_id) FROM public.pessoa_pediatra pp
                                      JOIN public.paciente_pediatra pc ON pc.pediatra_id = pp.id AND pc.ativo
                                     WHERE pp.pessoa_id = p.id))
    FROM public.ju_conversas c
    JOIN public.pessoa_tipos t ON t.codigo IN ('medico', 'prof_externo')
    JOIN public.pessoas p ON p.id_tipo_pessoa = t.id AND p.ativo AND p.telefone IS NOT NULL
                         AND public.fn_atrib_tel_chave(p.telefone::text) = public.fn_atrib_tel_chave(c.telefone)
   WHERE c.id = p_conversa_id
   ORDER BY p.updated_at DESC
   LIMIT 1;
$f$;
REVOKE ALL ON FUNCTION public.fn_ju_contato_profissional(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_contato_profissional(bigint) TO service_role;

-- profissional não é contato novo (sem pré-cadastro, sem reserva)
CREATE OR REPLACE FUNCTION public.fn_ju_contato_novo(p_conversa_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  SELECT public.fn_ju_contato_profissional(p_conversa_id) IS NULL AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(public.fn_ju_contexto_cliente(p_conversa_id) -> 'pacientes', '[]'::jsonb)) x
    JOIN public.agendamentos a ON a.paciente_id = (x ->> 'paciente_id')::uuid AND a.ativo
    JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
    WHERE cs.codigo NOT IN ('cancelado', 'erro'));
$f$;

-- ---------------------------------------------------------------- pendências (card no grupo)
CREATE TABLE IF NOT EXISTS public.ju_profissional_pendencias (
  id bigserial PRIMARY KEY,
  conversa_id bigint NOT NULL REFERENCES public.ju_conversas(id),
  telefone bigint NOT NULL,
  nome_dito text NOT NULL,
  especialidade text,
  candidatos jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'automatico', 'vinculado', 'cadastrado', 'ignorado')),
  pessoa_id uuid REFERENCES public.pessoas(id),
  decidido_por text,
  decidido_em timestamptz,
  msg_req bigint,
  msg_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ju_profissional_pendencias ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.ju_profissional_pendencias IS
  'Profissional (médico etc.) que se apresentou numa conversa: ligação automática ao cadastro ou card no grupo com botões ju_prof_*.';

CREATE OR REPLACE FUNCTION public.fn_ju_profissional_identificar(p_conversa_id bigint, p_texto text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  c public.ju_conversas; v_nome text; v_esp text; v_tok text[]; v_tel bigint; v_cands jsonb; v_n int;
  v_c0 jsonb; v_id bigint; v_txt text; v_choices jsonb; v_tok_uaz text; v_req bigint; v_familia boolean;
BEGIN
  SELECT * INTO c FROM public.ju_conversas WHERE id = p_conversa_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'CONVERSA'); END IF;
  IF public.fn_ju_contato_profissional(c.id) IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'acao', 'ja_identificado'); END IF;
  IF EXISTS (SELECT 1 FROM public.ju_profissional_pendencias WHERE conversa_id = c.id
              AND (status = 'pendente' OR (status = 'ignorado' AND decidido_em > now() - interval '30 days'))) THEN
    RETURN jsonb_build_object('ok', true, 'acao', 'ja_avisado');
  END IF;

  v_nome := btrim(regexp_replace(split_part(coalesce(p_texto, ''), '|', 1), '^\s*(dra?\.?|doutora?)\s+', '', 'i'));
  v_esp := coalesce(nullif(btrim(split_part(coalesce(p_texto, ''), '|', 2)), ''),
                    nullif(btrim(substring(v_nome from '\s[-–—]\s*(.*)$')), ''));
  v_nome := btrim(regexp_replace(v_nome, '\s+[-–—].*$', ''));
  v_tok := public.fn_ju_nome_tokens(v_nome);
  IF coalesce(array_length(v_tok, 1), 0) = 0 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'SEM_NOME'); END IF;

  v_tel := CASE WHEN c.wa_chatid ~ '^[0-9]+@s\.whatsapp\.net$' THEN split_part(c.wa_chatid, '@', 1)::bigint
                ELSE nullif(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), '')::bigint END;
  IF v_tel IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'SEM_TELEFONE'); END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY (x ->> 'pacientes')::int DESC), '[]'::jsonb), count(*) INTO v_cands, v_n
    FROM (SELECT jsonb_build_object('pessoa_id', p.id, 'nome', btrim(p.nome), 'telefone', p.telefone,
                   'pacientes', (SELECT count(DISTINCT pc.paciente_id) FROM public.pessoa_pediatra pp
                                   JOIN public.paciente_pediatra pc ON pc.pediatra_id = pp.id AND pc.ativo
                                  WHERE pp.pessoa_id = p.id)) x
            FROM public.pessoas p JOIN public.pessoa_tipos t ON t.id = p.id_tipo_pessoa
           WHERE p.ativo AND t.codigo IN ('medico', 'prof_externo')
             AND public.fn_ju_nome_tokens(p.nome) @> v_tok) s;

  -- quem já é família nesta conversa (médica que também é mãe): a equipe decide
  v_familia := coalesce((public.fn_ju_contexto_cliente(c.id) ->> 'identificado')::boolean, false);
  v_c0 := v_cands -> 0;

  IF v_n = 1 AND array_length(v_tok, 1) >= 2 AND NOT v_familia AND (v_c0 ->> 'telefone') IS NULL THEN
    UPDATE public.pessoas SET telefone = v_tel WHERE id = (v_c0 ->> 'pessoa_id')::uuid;
    INSERT INTO public.ju_profissional_pendencias (conversa_id, telefone, nome_dito, especialidade, candidatos,
                                                   status, pessoa_id, decidido_por, decidido_em)
    VALUES (c.id, v_tel, coalesce(p_texto, v_nome), v_esp, v_cands, 'automatico', (v_c0 ->> 'pessoa_id')::uuid, 'Ju', now());
    RETURN jsonb_build_object('ok', true, 'acao', 'vinculado', 'pessoa', v_c0 ->> 'nome');
  END IF;

  INSERT INTO public.ju_profissional_pendencias (conversa_id, telefone, nome_dito, especialidade, candidatos)
  VALUES (c.id, v_tel, coalesce(p_texto, v_nome), v_esp, v_cands) RETURNING id INTO v_id;

  v_txt := '🩺 *Profissional se apresentou na conversa*' || E'\n'
        || coalesce(nullif(btrim(c.nome_whatsapp), ''), 'Contato') || ' · +' || v_tel::text || E'\n'
        || 'Disse ser: "' || left(coalesce(p_texto, v_nome), 120) || '"' || E'\n\n'
        || CASE WHEN v_n = 0 THEN 'Não achei esse nome nos cadastros de médicos. Cadastrar com este telefone?'
                WHEN v_n = 1 AND v_familia THEN 'Achei ' || (v_c0 ->> 'nome') || ', mas este número já é de uma família. É a mesma pessoa?'
                WHEN v_n = 1 THEN 'Achei ' || (v_c0 ->> 'nome') || ', que já tem outro telefone. É ela/ele? O número vai para o cadastro.'
                WHEN v_n = 2 THEN 'Achei 2 cadastros parecidos. Qual é? O número vai para o cadastro.'
                ELSE 'Achei ' || v_n || ' cadastros com esse nome; nos botões estão os 2 com mais pacientes. Se não for nenhum, toque em Ignorar e ponha o telefone pela tela do pediatra.' END;
  v_choices := CASE
    WHEN v_n = 0 THEN jsonb_build_array('➕ Cadastrar|ju_prof_novo:' || v_id, '❌ Ignorar|ju_prof_nao:' || v_id)
    WHEN v_n = 1 THEN jsonb_build_array('✅ ' || left(v_c0 ->> 'nome', 20) || '|ju_prof_vinc:' || v_id || ':0',
                                        '➕ Cadastrar novo|ju_prof_novo:' || v_id, '❌ Ignorar|ju_prof_nao:' || v_id)
    ELSE jsonb_build_array('✅ ' || left(v_cands -> 0 ->> 'nome', 20) || '|ju_prof_vinc:' || v_id || ':0',
                           '✅ ' || left(v_cands -> 1 ->> 'nome', 20) || '|ju_prof_vinc:' || v_id || ':1',
                           '❌ Ignorar|ju_prof_nao:' || v_id) END;

  v_tok_uaz := public.fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
  IF v_tok_uaz IS NOT NULL THEN
    v_req := net.http_post(url := 'https://infuse.uazapi.com/send/menu',
      body := jsonb_build_object('number', '120363433073436578@g.us', 'type', 'button', 'text', v_txt, 'choices', v_choices),
      headers := jsonb_build_object('token', v_tok_uaz, 'Content-Type', 'application/json', 'Accept', 'application/json'),
      timeout_milliseconds := 20000);
    UPDATE public.ju_profissional_pendencias SET msg_req = v_req WHERE id = v_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'acao', 'card', 'id', v_id, 'candidatos', v_n);
END $f$;
REVOKE ALL ON FUNCTION public.fn_ju_profissional_identificar(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_profissional_identificar(bigint, text) TO service_role;

-- guarda o id da mensagem do card enquanto a resposta do pg_net existe (ela some em poucas horas)
CREATE OR REPLACE FUNCTION public.fn_ju_profissional_resolver_msgs()
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $f$
  WITH u AS (
    UPDATE public.ju_profissional_pendencias pp
       SET msg_id = nullif(coalesce(h.content::jsonb ->> 'messageid', h.content::jsonb ->> 'id'), '')
      FROM net._http_response h
     WHERE pp.msg_id IS NULL AND pp.msg_req IS NOT NULL AND h.id = pp.msg_req AND h.content IS NOT NULL
    RETURNING 1)
  SELECT count(*)::int FROM u;
$f$;
REVOKE ALL ON FUNCTION public.fn_ju_profissional_resolver_msgs() FROM PUBLIC, anon, authenticated;

-- clique no card (vem pela Entrada, junto dos botões de reserva)
CREATE OR REPLACE FUNCTION public.fn_ju_profissional_botao(p_botao text, p_quem text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  m text[]; r public.ju_profissional_pendencias; v_msg text; v_cand jsonb; v_pessoa uuid; v_tipo uuid;
  v_nome text; v_txt text; v_tok text;
BEGIN
  m := regexp_match(coalesce(p_botao, ''), '^ju_prof_(vinc|novo|nao):(\d+)(?::(\d+))?$');
  IF m IS NULL THEN RETURN jsonb_build_object('ok', false, 'texto', 'Botão não reconhecido.'); END IF;
  SELECT * INTO r FROM public.ju_profissional_pendencias WHERE id = m[2]::bigint FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'texto', 'Aviso não encontrado.'); END IF;
  v_msg := coalesce(r.msg_id, (SELECT nullif(coalesce(h.content::jsonb ->> 'messageid', h.content::jsonb ->> 'id'), '')
                                  FROM net._http_response h WHERE h.id = r.msg_req));
  IF r.status <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'status', r.status, 'msg_id', v_msg, 'texto', 'Esse aviso já foi resolvido.');
  END IF;

  IF m[1] = 'vinc' THEN
    v_cand := r.candidatos -> coalesce(m[3], '0')::int;
    IF v_cand IS NULL THEN RETURN jsonb_build_object('ok', false, 'msg_id', v_msg, 'texto', 'Cadastro não encontrado.'); END IF;
    v_pessoa := (v_cand ->> 'pessoa_id')::uuid;
    UPDATE public.pessoas SET telefone = r.telefone WHERE id = v_pessoa;
    v_txt := 'Número ligado ao cadastro de ' || (v_cand ->> 'nome') || '.';
    UPDATE public.ju_profissional_pendencias SET status = 'vinculado', pessoa_id = v_pessoa, decidido_por = p_quem,
           decidido_em = now(), msg_id = v_msg WHERE id = r.id;
  ELSIF m[1] = 'novo' THEN
    SELECT id INTO v_tipo FROM public.pessoa_tipos WHERE codigo = 'medico';
    v_nome := initcap(btrim(regexp_replace(split_part(r.nome_dito, '|', 1), '^\s*(dra?\.?|doutora?)\s+', '', 'i')));
    v_nome := btrim(regexp_replace(v_nome, '\s*[-–—].*$', ''));
    INSERT INTO public.pessoas (id_tipo_pessoa, nome, telefone, especialidade)
    VALUES (v_tipo, v_nome, r.telefone, r.especialidade) RETURNING id INTO v_pessoa;
    IF coalesce(r.especialidade, r.nome_dito) ~* 'ped' THEN
      INSERT INTO public.pessoa_pediatra (pessoa_id, especialidade) VALUES (v_pessoa, coalesce(r.especialidade, 'Pediatria'));
    END IF;
    v_txt := v_nome || ' cadastrada com este número.';
    UPDATE public.ju_profissional_pendencias SET status = 'cadastrado', pessoa_id = v_pessoa, decidido_por = p_quem,
           decidido_em = now(), msg_id = v_msg WHERE id = r.id;
  ELSE
    v_txt := 'Ignorado.';
    UPDATE public.ju_profissional_pendencias SET status = 'ignorado', decidido_por = p_quem, decidido_em = now(),
           msg_id = v_msg WHERE id = r.id;
  END IF;

  -- o card some do grupo
  v_tok := public.fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
  IF v_msg IS NOT NULL AND v_tok IS NOT NULL THEN
    PERFORM net.http_post(url := 'https://infuse.uazapi.com/message/delete',
      body := jsonb_build_object('id', v_msg),
      headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
      timeout_milliseconds := 20000);
  END IF;
  RETURN jsonb_build_object('ok', true, 'aceita', m[1] <> 'nao', 'msg_id', v_msg, 'texto', v_txt);
END $f$;
REVOKE ALL ON FUNCTION public.fn_ju_profissional_botao(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_profissional_botao(text, text) TO service_role;

-- a porta dos botões da Entrada passa a aceitar os de profissional (p_prof)
DO $mig$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_reserva_botao(bigint, uuid, boolean, text, text)'::regprocedure);
  n := replace(d, 'p_chatid text)', 'p_chatid text, p_prof text DEFAULT NULL::text)');
  n := replace(n, $a$BEGIN
  v_prof := CASE$a$, $a$BEGIN
  IF p_prof IS NOT NULL THEN
    IF coalesce(p_chatid, '') <> '120363433073436578@g.us' THEN
      RETURN jsonb_build_object('ok', false, 'texto', 'Esse botão só vale no grupo.');
    END IF;
    RETURN public.fn_ju_profissional_botao(p_prof, p_quem);
  END IF;
  v_prof := CASE$a$);
  IF n NOT LIKE '%p_prof text DEFAULT NULL::text)%' OR n NOT LIKE '%fn_ju_profissional_botao(p_prof, p_quem)%' THEN
    RAISE EXCEPTION 'fn_ju_reserva_botao: trecho não encontrado';
  END IF;
  DROP FUNCTION public.fn_ju_reserva_botao(bigint, uuid, boolean, text, text);
  EXECUTE n;
END
$mig$;
REVOKE ALL ON FUNCTION public.fn_ju_reserva_botao(bigint, uuid, boolean, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_reserva_botao(bigint, uuid, boolean, text, text, text) TO service_role;

-- ---------------------------------------------------------------- indicação → família
CREATE OR REPLACE FUNCTION public.fn_ju_indicacoes_medicas(p_conversa_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE ctx jsonb; pac jsonb; v_sob text[];
BEGIN
  IF public.fn_ju_contato_profissional(p_conversa_id) IS NOT NULL THEN RETURN '[]'::jsonb; END IF;
  ctx := public.fn_ju_contexto_cliente(p_conversa_id);
  pac := CASE WHEN jsonb_typeof(ctx -> 'pacientes') = 'array' THEN ctx -> 'pacientes' ELSE '[]'::jsonb END;
  SELECT coalesce(array_agg(DISTINCT w), '{}') INTO v_sob
    FROM (SELECT unnest(public.fn_ju_sobrenomes_raros(n)) w
            FROM (SELECT x ->> 'nome' n FROM jsonb_array_elements(pac) x
                  UNION ALL
                  SELECT r ->> 'nome' FROM jsonb_array_elements(pac) x,
                         jsonb_array_elements(CASE WHEN jsonb_typeof(x -> 'responsaveis_do_paciente') = 'array'
                                                   THEN x -> 'responsaveis_do_paciente' ELSE '[]'::jsonb END) r
                  UNION ALL
                  SELECT nome_whatsapp FROM public.ju_conversas WHERE id = p_conversa_id) a) b;
  IF coalesce(array_length(v_sob, 1), 0) < 2 THEN RETURN '[]'::jsonb; END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'indicado_por', coalesce(public.fn_ju_contato_profissional(s.conversa_id) ->> 'nome',
                                      (SELECT pp.nome_dito FROM public.ju_profissional_pendencias pp
                                        WHERE pp.conversa_id = s.conversa_id ORDER BY pp.id DESC LIMIT 1)),
             'especialidade', public.fn_ju_contato_profissional(s.conversa_id) ->> 'especialidade',
             'quando', to_char(s.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'),
             'urgente', s.urgente,
             'o_que_disse', left(s.resumo || coalesce(' ' || (SELECT string_agg(coalesce(a ->> 'texto', a ->> 'resumo', a #>> '{}'), ' ')
                                                               FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.atualizacoes) = 'array'
                                                                                              THEN s.atualizacoes ELSE '[]'::jsonb END) a), ''), 700))
           ORDER BY s.created_at DESC)
      FROM public.ju_solicitacoes s
     WHERE s.created_at > now() - interval '72 hours'
       AND s.conversa_id <> p_conversa_id
       AND (public.fn_ju_contato_profissional(s.conversa_id) IS NOT NULL
            OR EXISTS (SELECT 1 FROM public.ju_profissional_pendencias pp
                        WHERE pp.conversa_id = s.conversa_id AND pp.status <> 'ignorado'))
       AND (SELECT count(DISTINCT w) FROM unnest(public.fn_ju_nome_tokens(s.resumo || ' ' || coalesce(s.atualizacoes::text, ''))) w
             WHERE w = ANY (v_sob)) >= 2), '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RETURN '[]'::jsonb;  -- nunca derruba o turno da Ju
END $f$;
REVOKE ALL ON FUNCTION public.fn_ju_indicacoes_medicas(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_indicacoes_medicas(bigint) TO service_role;

-- ---------------------------------------------------------------- turno e reserva
DO $mig$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_turno'::regproc);
  n := replace(d, $a$    'contato_novo', public.fn_ju_contato_novo(c.id),$a$,
                  $a$    'contato_profissional', public.fn_ju_contato_profissional(c.id),
    'indicacoes_medicas', public.fn_ju_indicacoes_medicas(c.id),
    'contato_novo', public.fn_ju_contato_novo(c.id),$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_turno: trecho não encontrado'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.fn_ju_reserva_elegivel'::regproc);
  n := replace(d, $a$THEN RETURN jsonb_build_object('ok', false, 'motivo', 'EQUIPE'); END IF;$a$,
                  $a$THEN RETURN jsonb_build_object('ok', false, 'motivo', 'EQUIPE'); END IF;
  IF public.fn_ju_contato_profissional(c.id) IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'PROFISSIONAL'); END IF;$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_reserva_elegivel: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

SELECT cron.schedule('ju-profissional-msgs', '*/5 * * * *', 'SELECT public.fn_ju_profissional_resolver_msgs()');
