-- 15/11/2026 (aprovado pelo dono): a Ju mandava o link de cadastro para criança que já tem cadastro,
-- só que em outro número (Lívia, cadastrada no número do pai; Cecília, no número antigo do pai). A mãe da
-- Lívia tentou e o cadastro deu erro. Antes de mandar o link, procura um paciente parecido:
--   * mesmo início de nome (3 letras, para pegar apelido: "Livinha" → Lívia) quando a família diz o nome;
--   * algum sobrenome do nome do WhatsApp aparece no nome da criança ou de um responsável dela;
--   * criança com consulta no último ano ou cadastrada há menos de 60 dias.
-- Achou → não manda link; avisa a equipe no 🔔 para ligar este número ao cadastro e marcar.

CREATE OR REPLACE FUNCTION public.fn_ju_crianca_cadastro_parecido(p_conversa_id bigint, p_crianca text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH c AS (
    SELECT array(SELECT t FROM unnest(regexp_split_to_array(lower(unaccent(btrim(coalesce(nome_whatsapp, '')))), '[^a-z]+')) WITH ORDINALITY u(t, i)
                  WHERE i > 1 AND length(t) >= 3 AND t NOT IN ('dos', 'das', 'de', 'da', 'do', 'e')) AS sobren
      FROM ju_conversas WHERE id = p_conversa_id
  ), alvo AS (
    SELECT nullif(left(lower(unaccent(split_part(btrim(coalesce(p_crianca, '')), ' ', 1))), 3), '') AS ini
  ), cand AS (
    SELECT p.id, btrim(p.nome) AS nome,
           (SELECT string_agg(btrim(r.nome), '; ') FROM pessoa_responsaveis pr JOIN pessoas r ON r.id = pr.id_responsavel
             WHERE pr.id_pessoa = p.id AND pr.ativo) AS responsaveis,
           (SELECT max(a.data_hora) FROM agendamentos a WHERE a.paciente_id = p.id AND a.ativo) AS ultima
      FROM pessoas p JOIN pessoa_tipos tp ON tp.id = p.id_tipo_pessoa, c, alvo
     WHERE tp.codigo = 'paciente' AND p.ativo
       AND coalesce(array_length(c.sobren, 1), 0) > 0
       AND (alvo.ini IS NULL OR length(alvo.ini) < 3
            OR left(lower(unaccent(split_part(btrim(p.nome), ' ', 1))), 3) = alvo.ini)
       AND (EXISTS (SELECT 1 FROM agendamentos a WHERE a.paciente_id = p.id AND a.ativo AND a.data_hora > now() - interval '365 days')
            OR p.created_at > now() - interval '60 days')
       AND (regexp_split_to_array(lower(unaccent(p.nome)), '[^a-z]+') && c.sobren
            OR EXISTS (SELECT 1 FROM pessoa_responsaveis pr JOIN pessoas r ON r.id = pr.id_responsavel
                        WHERE pr.id_pessoa = p.id AND pr.ativo
                          AND regexp_split_to_array(lower(unaccent(r.nome)), '[^a-z]+') && c.sobren))
  )
  SELECT CASE WHEN count(*) = 0 OR (count(*) > 1 AND (SELECT ini FROM alvo) IS NULL) THEN NULL
              ELSE (SELECT jsonb_build_object('paciente_id', x.id, 'nome', x.nome, 'responsaveis', x.responsaveis, 'n', (SELECT count(*) FROM cand))
                      FROM cand x ORDER BY x.ultima DESC NULLS LAST LIMIT 1) END
    FROM cand;
$function$;

REVOKE ALL ON FUNCTION public.fn_ju_crianca_cadastro_parecido(bigint, text) FROM PUBLIC, anon, authenticated;

DO $mig$
DECLARE
  v_def text := pg_get_functiondef('public.fn_ju_escolha_aplicar(bigint,jsonb)'::regprocedure);
  v_old1 text := $o$  v_fq text;$o$;
  v_new1 text := $n$  v_fq text; v_parecido jsonb;$n$;
  v_old2 text := $o$  IF v_n = 0 OR v_crianca_nova IS NOT NULL THEN
    IF e.cadastro_pedido_em IS NULL THEN$o$;
  v_new2 text := $n$  -- 15/11/2026: criança parecida já cadastrada em outro número → equipe liga o número, sem link de cadastro
  IF (v_n = 0 OR v_crianca_nova IS NOT NULL) AND e.cadastro_pedido_em IS NULL THEN
    v_parecido := fn_ju_crianca_cadastro_parecido(c.id, coalesce(nullif(btrim(r ->> 'crianca'), ''), v_crianca_nova));
    IF v_parecido IS NOT NULL THEN
      UPDATE ju_escolhas_horario SET status = 'avisado',
             resultado = jsonb_build_object('motivo', 'cadastro_em_outro_numero', 'parecido', v_parecido) WHERE id = p_id;
      PERFORM fn_ju_escolha_aviso(c.id, 'A família escolheu ' || v_quando_txt
        || coalesce(' com a ' || initcap(nullif(btrim(r -> 'escolha' ->> 'fisio'), '')), '')
        || ', mas este número não está ligado a nenhum cadastro. Parece ser *' || (v_parecido ->> 'nome') || '*'
        || coalesce(' (responsável: ' || (v_parecido ->> 'responsaveis') || ')', '')
        || '. Não mandei o link de cadastro. Ligue este número ao cadastro dela (adicionar responsável) e marque a consulta.');
      RETURN jsonb_build_object('ok', false, 'motivo', 'cadastro_em_outro_numero');
    END IF;
  END IF;
  IF v_n = 0 OR v_crianca_nova IS NOT NULL THEN
    IF e.cadastro_pedido_em IS NULL THEN$n$;
BEGIN
  IF position(v_old1 IN v_def) = 0 OR position(v_old2 IN v_def) = 0 THEN RAISE EXCEPTION 'trecho não encontrado'; END IF;
  v_def := replace(v_def, v_old1, v_new1);
  v_def := replace(v_def, v_old2, v_new2);
  EXECUTE v_def;
END $mig$;
