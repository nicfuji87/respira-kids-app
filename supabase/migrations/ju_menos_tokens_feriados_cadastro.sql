-- 20/11/2026 (aprovado pelo dono): reduzir tokens da Ju sem perder desempenho + ajustes da análise de 19/11.
--
-- 1. Filtro sem IA quando a Lolô está conduzindo a conversa. Medição de 18–19/11: 39% das chamadas do
--    Atendimento terminavam em [NADA]; com a Lolô conduzindo eram 70 chamadas (30% dos tokens) e só ~15
--    úteis. Agora, nesse caso, a IA só roda se a mensagem da família tiver um gatilho (pergunta de dado
--    simples, sinal de gravidade, atraso, recado, pagamento/nota/contrato), se houver oferta de horário ou
--    de vaga em aberto, ou se a última mensagem da clínica foi automática (ex.: "posso reenviar o contrato?").
--    Em 3 dias, só 24 de 274 mensagens nesse cenário tinham gatilho.
-- 2. fn_ju_turno devolve os feriados dos próximos 30 dias (a Ju dizia "sexta funciona normalmente" em 20/11).
-- 3. Cadastro em outro número (caso Gabriel/Hellen): a busca também usa os sobrenomes das pessoas já ligadas
--    ao número (o WhatsApp dela é só "Hellen"; o irmão Lucas Fialho Sbardelotto acha o Gabriel).
-- 4. Base de conhecimento: a sala 311 fica no 3º andar.

CREATE OR REPLACE FUNCTION public.fn_ju_precisa_ia_com_equipe(p_conversa_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ult record;
  v_txt text;
BEGIN
  IF fn_ju_oferta_atual(p_conversa_id) IS NOT NULL OR fn_lista_espera_oferta(p_conversa_id) IS NOT NULL THEN
    RETURN true;
  END IF;
  SELECT m.origem, m.created_at INTO v_ult FROM ju_mensagens m
   WHERE m.conversa_id = p_conversa_id AND m.origem <> 'CLIENTE'
   ORDER BY m.created_at DESC LIMIT 1;
  IF v_ult.origem = 'AUTOMACAO' THEN RETURN true; END IF;
  SELECT string_agg(coalesce(m.conteudo, ''), ' ') INTO v_txt FROM ju_mensagens m
   WHERE m.conversa_id = p_conversa_id AND m.origem = 'CLIENTE'
     AND m.created_at > coalesce(v_ult.created_at, '-infinity'::timestamptz);
  RETURN coalesce(v_txt, '') ~* (
    '(endere[cç]o|onde fica|localiza|qual.{0,10}(andar|sala)|estaciona|valor|quanto (custa|fica|é|e )|pre[cç]o'
    || '|\mpix\M|cart[aã]o|parcel|conv[eê]nio|plano de sa|reembolso|nota fiscal|\mnota\M|funciona|abre|fecha|feriado'
    || '|link|pag(ar|amento|uei|o)\M|boleto|contrato|assin|atestado|declara[cç][aã]o|comprovante|recado'
    || '|avis[ae] (a|pra|para) (tia|dra?|fisio|bia|bruna|fl[aá]via|beatriz)'
    || '|febre|falta de ar|cansad|roxo|roxa|arroxead|convuls|desmai|sangu|v[oô]mit|engasg|chiad|respira[nç]'
    || '|emerg[eê]ncia|hospital|pronto.?socorro|interna|piorou|piora'
    || '|atras|a caminho|chegando|tr[aâ]nsito|estacionando|subindo)');
END $function$;

REVOKE ALL ON FUNCTION public.fn_ju_precisa_ia_com_equipe(bigint) FROM PUBLIC, anon, authenticated;

DO $mig$
DECLARE
  v_def text := pg_get_functiondef('public.fn_ju_turno(bigint,bigint)'::regprocedure);
  v_old1 text := $o$  IF v_motivo IS NOT NULL THEN
    RETURN jsonb_build_object('pode', false, 'motivo', v_motivo);
  END IF;
$o$;
  v_new1 text := $n$  IF v_motivo IS NOT NULL THEN
    RETURN jsonb_build_object('pode', false, 'motivo', v_motivo);
  END IF;

  -- 20/11/2026: a Lolô está conduzindo e a mensagem não pede nada da Ju → não gasta IA.
  IF EXISTS (
       SELECT 1 FROM public.ju_mensagens h
        WHERE h.conversa_id = c.id AND h.origem = 'HUMANO'
          AND (h.created_at > now() - interval '30 minutes'
               OR (h.created_at > now() - interval '90 minutes'
                   AND extract(isodow FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 1 AND 5
                   AND extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 8 AND 19))
          AND h.created_at > coalesce((SELECT max(j.created_at) FROM public.ju_mensagens j
                                        WHERE j.conversa_id = c.id AND j.origem = 'JU'), '-infinity'::timestamptz))
     AND NOT public.fn_ju_precisa_ia_com_equipe(c.id) THEN
    RETURN jsonb_build_object('pode', false, 'motivo', 'EQUIPE_CONDUZINDO');
  END IF;
$n$;
  v_old2 text := $o$    'cliente', public.fn_ju_json_enxuto(public.fn_ju_contexto_cliente(c.id)),$o$;
  v_new2 text := $n$    'feriados', coalesce((SELECT jsonb_agg(to_char(f.dia, 'DD/MM') || ' (' || (ARRAY['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[extract(dow FROM f.dia)::int + 1] || ') ' || f.nome ORDER BY f.dia)
                            FROM public.followup_feriados f
                           WHERE f.dia BETWEEN (now() AT TIME ZONE 'America/Sao_Paulo')::date
                                           AND (now() AT TIME ZONE 'America/Sao_Paulo')::date + 30), '[]'::jsonb),
    'cliente', public.fn_ju_json_enxuto(public.fn_ju_contexto_cliente(c.id)),$n$;
BEGIN
  IF position(v_old1 IN v_def) = 0 OR position(v_old2 IN v_def) = 0 THEN RAISE EXCEPTION 'trecho de fn_ju_turno não encontrado'; END IF;
  v_def := replace(v_def, v_old1, v_new1);
  v_def := replace(v_def, v_old2, v_new2);
  EXECUTE v_def;
END $mig$;

CREATE OR REPLACE FUNCTION public.fn_ju_crianca_cadastro_parecido(p_conversa_id bigint, p_crianca text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH conv AS (
    SELECT id, nome_whatsapp, regexp_replace(coalesce(nullif(split_part(wa_chatid, '@', 1), ''), telefone, ''), '\D', '', 'g') AS tel
      FROM ju_conversas WHERE id = p_conversa_id
  ), familia AS (
    -- pessoas já ligadas ao número (responsáveis com esse telefone e os dependentes deles)
    SELECT p.nome FROM pessoas p, conv WHERE p.ativo AND conv.tel <> '' AND regexp_replace(coalesce(p.telefone::text, ''), '\D', '', 'g') = conv.tel
    UNION
    SELECT d.nome FROM pessoas p JOIN pessoa_responsaveis pr ON pr.id_responsavel = p.id AND pr.ativo
      JOIN pessoas d ON d.id = pr.id_pessoa, conv
     WHERE p.ativo AND conv.tel <> '' AND regexp_replace(coalesce(p.telefone::text, ''), '\D', '', 'g') = conv.tel
  ), c AS (
    SELECT array(
      SELECT DISTINCT t FROM (
        SELECT t, i FROM conv, unnest(regexp_split_to_array(lower(unaccent(btrim(coalesce(conv.nome_whatsapp, '')))), '[^a-z]+')) WITH ORDINALITY u(t, i)
        UNION ALL
        SELECT t, i FROM familia, unnest(regexp_split_to_array(lower(unaccent(btrim(familia.nome))), '[^a-z]+')) WITH ORDINALITY u(t, i)
      ) x
      WHERE i > 1 AND length(t) >= 3
        AND t NOT IN ('dos', 'das', 'de', 'da', 'do', 'e', 'silva', 'santos', 'souza', 'sousa', 'oliveira', 'lima',
                      'pereira', 'costa', 'rodrigues', 'alves', 'ferreira', 'gomes', 'ribeiro', 'carvalho', 'martins',
                      'araujo', 'barbosa', 'rocha', 'almeida', 'nascimento', 'filho', 'junior', 'neto')) AS sobren
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
       AND NOT EXISTS (SELECT 1 FROM familia f WHERE btrim(f.nome) = btrim(p.nome))
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

UPDATE public.ju_conhecimento
   SET texto = 'A Respira Kids fica na SEPS 709/909, Centro Médico Júlio Adnet, Bloco A, 3º andar, Sala 311, Brasília-DF, CEP 70390-095.',
       updated_at = now()
 WHERE id = 'ENDERECO';
