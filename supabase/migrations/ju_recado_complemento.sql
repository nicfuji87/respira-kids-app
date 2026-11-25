-- 25/11/2026: recados seguidos da mesma família viram um só (caso Dante, conversa 21487: vômito às 8h40 e
-- dor de ouvido/PS às 8h42 viraram dois recados e a família recebeu a mesma frase duas vezes).
-- Se a família mandar outro recado para a mesma fisio em até 30 min e o anterior ainda não foi respondido:
--   - na fila (fora do horário): o texto entra no mesmo recado, que sai uma vez só;
--   - já enviado: a fisio recebe "➕ Complemento do recado de X (criança): “…”";
--   - a família ouve "Passei isso também para a X." em vez de repetir a frase.
-- A fisio pode responder citando o complemento (fn_ju_recado_rotear acha o recado pelo nome).

DO $$
DECLARE d text; n text;
BEGIN
  -- 1) fn_ju_recado_criar: junta ao recado aberto
  d := pg_get_functiondef('public.fn_ju_recado_criar(jsonb)'::regprocedure);
  n := replace(d, $a$  v_enviar timestamptz; v_msg text; v_id bigint; v_fila boolean;$a$,
                  $a$  v_enviar timestamptz; v_msg text; v_id bigint; v_fila boolean; v_ant ju_recados; v_num text;$a$);
  n := replace(n, $a$  v_familia := split_part(btrim(coalesce(nullif(ctx ->> 'responsavel_identificado', ''), nullif(c.nome_whatsapp, ''), 'Família')), ' ', 1);$a$,
$a$  -- 25/11/2026: complemento de recado aberto (mesma família e fisio, até 30 min, ainda sem resposta)
  SELECT * INTO v_ant FROM ju_recados
   WHERE conversa_id = c.id AND profissional_id = v_prof AND status IN ('fila', 'enviado')
     AND created_at > now() - interval '30 minutes'
   ORDER BY id DESC LIMIT 1;
  IF v_ant.id IS NOT NULL THEN
    IF v_ant.status = 'fila' THEN
      UPDATE ju_recados
         SET recado = recado || E'\n' || v_txt,
             mensagem = regexp_replace(mensagem, '”(\n\nResponda)', E'\n' || replace(v_txt, '\', '\\') || '”\1')
       WHERE id = v_ant.id;
    ELSE
      UPDATE ju_recados SET recado = recado || E'\n' || v_txt WHERE id = v_ant.id;
      SELECT numero INTO v_num FROM fn_ju_recado_chat_fisio(v_prof);
      PERFORM fn_ju_recado_whats(v_num,
        '➕ Complemento do recado de ' || coalesce(v_ant.familia, 'família') || coalesce(' (' || v_ant.crianca || ')', '') || ':'
        || E'\n“' || v_txt || '”', NULL);
    END IF;
    RETURN jsonb_build_object('ok', true, 'recado_id', v_ant.id, 'complemento', true, 'resposta',
      'Isso entrou junto com o recado que você já passou para a ' || v_prof_nome
      || '. Diga à família exatamente: "Passei isso também para a ' || v_prof_nome || '." Não repita a frase anterior, não fale de prazo e não acrescente orientação clínica.');
  END IF;

  v_familia := split_part(btrim(coalesce(nullif(ctx ->> 'responsavel_identificado', ''), nullif(c.nome_whatsapp, ''), 'Família')), ' ', 1);$a$);
  IF n = d OR strpos(n, 'v_ant ju_recados') = 0 OR strpos(n, 'Complemento do recado') = 0 THEN
    RAISE EXCEPTION 'recado_criar: trecho não encontrado';
  END IF;
  EXECUTE n;

  -- 2) fn_ju_recado_rotear: resposta citando o complemento + não confundir com aviso
  d := pg_get_functiondef('public.fn_ju_recado_rotear(bigint,bigint,text,text)'::regprocedure);
  n := replace(d, $a$IF v_ju AND coalesce(v_q, '') !~ '^\s*📩'$a$, $a$IF v_ju AND coalesce(v_q, '') !~ '^\s*(📩|➕)'$a$);
  n := replace(n, $a$       ORDER BY created_at DESC LIMIT 1;
      IF r.id IS NULL THEN RETURN NULL; END IF;$a$,
$a$       ORDER BY created_at DESC LIMIT 1;
      IF r.id IS NULL AND v_q ~ '^\s*➕' THEN
        SELECT * INTO r FROM ju_recados
         WHERE profissional_id = v_prof AND status IN ('enviado', 'respondido', 'expirado')
           AND created_at > now() - interval '7 days'
           AND (v_q ILIKE '%(' || coalesce(crianca, '#') || ')%' OR v_q ILIKE '% de ' || coalesce(familia, '#') || '%')
         ORDER BY created_at DESC LIMIT 1;
      END IF;
      IF r.id IS NULL THEN RETURN NULL; END IF;$a$);
  IF n = d OR strpos(n, '(📩|➕)') = 0 OR strpos(n, 'v_q ~ ''^\s*➕''') = 0 THEN
    RAISE EXCEPTION 'rotear: trecho não encontrado';
  END IF;
  EXECUTE n;
END $$;
