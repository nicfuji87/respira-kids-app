-- Ajustes da central de Conversas aplicados depois de conversas_central.sql
-- (28/10/2026), na ordem em que foram aplicados em produção, após conferir os
-- números com os dados reais:
--  1. "Confirmado!", "Tá joia", "Agradeço" não são pedidos (lista de palavras).
--  2. Espera conta só minutos de expediente; oportunidades: só as fortes (>= 90).
--  3. Números de teste e da equipe ficam fora das métricas de famílias.
--  4. Contato → pacientes pela chave de telefone (sem nono dígito) e dependentes.
--  5. Automação: categorias reajuste/cadastro/botões; transcrições fora; nomes.
--  6. Desempenho: lista de exclusão calculada uma vez (17 s → 0,2 s).
--  7. service_role pode ler (verificação local e rotinas de servidor).
--  8. Nome pelo cadastro quando o contato vem "Desconhecido"; nota fiscal
--     pendente há mais de 30 dias cai para prioridade média.

-- 1 + 3 ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_conversas_eh_reconhecimento(p text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path TO ''
AS $$
  SELECT p IS NULL OR length(btrim(p)) = 0
      OR (length(btrim(p)) <= 60 AND NOT EXISTS (
            SELECT 1 FROM unnest(regexp_split_to_array(
                     btrim(regexp_replace(lower(p), '[^a-zà-ú]+', ' ', 'g')), '\s+')) w
            WHERE w <> '' AND w NOT IN (
              'ok','okk','okay','oki','obrigado','obrigada','obrigados','obrigadas','obg','brigado','brigada','valeu','vlw',
              'agradeço','agradeco','agradecemos','agradecida','agradecido','disponha','imagina',
              'blz','beleza','certo','certinho','perfeito','perfeita','combinado','combinadíssimo','ta','tá','tabom','bom','boa','joia','jóia',
              'show','top','ótimo','otimo','ótima','otima','amém','amem','de','nada','dia','tarde','noite','tudo','bem','muito',
              'confirmado','confirmada','entendi','entendido','sim','pode','ser','fechado','maravilha','gratidão','gratidao',
              'chegando','cheguei','chegamos','chegou','estou','estamos','caminho','indo',
              'e','a','o','no','na','por','aqui','também','tambem','igualmente','você','voce','vc','pra','para','até','ate',
              'logo','mais','amanhã','amanha','abraço','abraços','bjs','beijos')))
  ;
$$;

CREATE OR REPLACE FUNCTION public.fn_conversas_minutos_expediente(p_ini timestamptz, p_fim timestamptz)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path TO ''
AS $$
  SELECT coalesce(sum(greatest(0, extract(epoch FROM
           least(p_fim AT TIME ZONE 'America/Sao_Paulo', d + time '18:00')
         - greatest(p_ini AT TIME ZONE 'America/Sao_Paulo', d + time '08:00')) / 60)), 0)
  FROM generate_series(date_trunc('day', p_ini AT TIME ZONE 'America/Sao_Paulo'),
                       date_trunc('day', p_fim AT TIME ZONE 'America/Sao_Paulo'), interval '1 day') d
  WHERE extract(isodow FROM d) BETWEEN 1 AND 5 AND p_fim > p_ini;
$$;

CREATE OR REPLACE FUNCTION public.fn_conversas_ids_teste()
RETURNS bigint[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH equipe AS (
    SELECT DISTINCT public.fn_tel_chave(p.telefone::text) AS chave
    FROM public.pessoas p
    WHERE p.telefone IS NOT NULL AND p.role IN ('admin', 'secretaria', 'profissional')
  )
  SELECT coalesce(array_agg(c.id), '{}')
  FROM public.ju_conversas c
  WHERE regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g') ~ '^55619990000\d{2}$'
     OR c.telefone = ANY (coalesce((SELECT numeros_teste FROM public.ju_config LIMIT 1), '{}'))
     OR public.fn_tel_chave(c.telefone) IN (SELECT chave FROM equipe WHERE chave IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.fn_conversas_ids_teste() FROM PUBLIC, anon, authenticated;

-- 4 -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_conversas_mapa_tel()
RETURNS TABLE (chave text, pacientes uuid[])
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH p AS (
    SELECT id, public.fn_tel_chave(telefone::text) AS chave
    FROM public.pessoas WHERE telefone IS NOT NULL AND ativo
  ),
  dep AS (
    SELECT p.chave, pr.id_pessoa AS pac FROM p
    JOIN public.pessoa_responsaveis pr ON pr.id_responsavel = p.id AND pr.ativo
    UNION
    SELECT p.chave, p.id FROM p
  )
  SELECT chave, array_agg(DISTINCT pac) FROM dep WHERE chave IS NOT NULL GROUP BY chave;
$$;
REVOKE ALL ON FUNCTION public.fn_conversas_mapa_tel() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_conversas_nome_por_tel(p_tel text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p.nome FROM public.pessoas p
  WHERE p.telefone IS NOT NULL AND public.fn_tel_chave(p.telefone::text) = public.fn_tel_chave(p_tel)
  ORDER BY (p.role = 'responsavel') DESC NULLS LAST, p.created_at
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.fn_conversas_nome_por_tel(text) FROM PUBLIC, anon, authenticated;

-- 6 -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_conversas_pedidos(p_inicio timestamptz, p_fim timestamptz)
RETURNS TABLE (
  conversa_id bigint, inicio timestamptz, ultima_cliente timestamptz, msgs_cliente int,
  resposta_em timestamptz, respondido_por text, minutos numeric, expediente boolean, repetiu boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH fora AS MATERIALIZED (SELECT public.fn_conversas_ids_teste() AS ids),
  m AS (
    SELECT x.conversa_id, x.origem, x.tipo, x.created_at, x.conteudo,
           lag(x.origem) OVER (PARTITION BY x.conversa_id ORDER BY x.created_at, x.id) AS anterior
    FROM public.ju_mensagens x, fora
    WHERE x.origem IN ('CLIENTE', 'HUMANO', 'JU')
      AND NOT (x.conversa_id = ANY (fora.ids))
      AND x.created_at >= p_inicio - interval '3 days' AND x.created_at < p_fim + interval '3 days'
  ),
  marcado AS (
    SELECT m.*, sum(CASE WHEN m.origem = 'CLIENTE' AND m.anterior IS DISTINCT FROM 'CLIENTE' THEN 1 ELSE 0 END)
                  OVER (PARTITION BY m.conversa_id ORDER BY m.created_at ROWS UNBOUNDED PRECEDING) AS bloco
    FROM m
  ),
  blocos AS (
    SELECT conversa_id, bloco,
           min(created_at) FILTER (WHERE origem = 'CLIENTE') AS inicio,
           max(created_at) FILTER (WHERE origem = 'CLIENTE') AS ultima_cliente,
           count(*) FILTER (WHERE origem = 'CLIENTE')::int AS n,
           bool_and(origem <> 'CLIENTE' OR tipo = 'BOTAO' OR public.fn_conversas_eh_reconhecimento(conteudo)) AS so_reconhecimento,
           min(created_at) FILTER (WHERE origem IN ('HUMANO', 'JU')) AS resposta_em,
           (array_agg(origem ORDER BY created_at) FILTER (WHERE origem IN ('HUMANO', 'JU')))[1] AS quem
    FROM marcado
    WHERE bloco > 0
    GROUP BY conversa_id, bloco
  )
  SELECT b.conversa_id, b.inicio, b.ultima_cliente, b.n, b.resposta_em, b.quem,
         round(extract(epoch FROM (b.resposta_em - b.inicio)) / 60.0, 1),
         public.fn_conversas_expediente(b.inicio),
         (b.n >= 2 AND b.ultima_cliente - b.inicio > interval '30 minutes')
  FROM blocos b
  WHERE NOT b.so_reconhecimento
    AND b.inicio >= p_inicio AND b.inicio < p_fim;
$$;
REVOKE ALL ON FUNCTION public.fn_conversas_pedidos(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

-- 7 -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_conversas_checar_acesso()
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT (session_user = 'postgres'
          OR coalesce(auth.role(), '') = 'service_role'
          OR public.fn_rls_admin_secretaria_ativo()) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_conversas_checar_acesso() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_conversas_hoje() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_conversas_desempenho(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_conversas_qualidade(integer) TO service_role;

-- 2, 3, 6, 8: trechos de fn_conversas_hoje ------------------------------
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.fn_conversas_hoje()'::regprocedure);
  r record;
BEGIN
  IF position('v_fora' IN v_def) > 0 THEN RETURN; END IF;
  FOR r IN SELECT * FROM (VALUES
    ($a$  v_agora timestamptz := now();$a$,
     $b$  v_agora timestamptz := now();
  v_fora bigint[] := public.fn_conversas_ids_teste();$b$),
    ($a$    WHERE b.inicio IS NOT NULL AND b.ultima > v_agora - interval '3 days' AND NOT b.so_rec$a$,
     $b$    WHERE b.inicio IS NOT NULL AND b.ultima > v_agora - interval '3 days' AND NOT b.so_rec
      AND c.id <> ALL (v_fora)$b$),
    ($a$    WHERE s.status = 'ABERTA' AND s.tipo <> 'EXTERNO'$a$,
     $b$    WHERE s.status = 'ABERTA' AND s.tipo <> 'EXTERNO'
      AND (s.conversa_id IS NULL OR s.conversa_id <> ALL (v_fora))$b$),
    ($a$'prioridade', CASE WHEN a.inicio < v_agora - interval '2 hours' THEN 'alta'
                         WHEN a.inicio < v_agora - interval '30 minutes' THEN 'media' ELSE 'baixa' END,$a$,
     $b$'prioridade', CASE WHEN public.fn_conversas_minutos_expediente(a.inicio, v_agora) >= 120 THEN 'alta'
                         WHEN public.fn_conversas_minutos_expediente(a.inicio, v_agora) >= 30 THEN 'media' ELSE 'baixa' END,
      'minutos_expediente', round(public.fn_conversas_minutos_expediente(a.inicio, v_agora)),
      'fora_expediente', NOT public.fn_conversas_expediente(a.inicio),$b$),
    ($a$FROM (SELECT * FROM public.fn_conversas_oportunidades() WHERE pontos >= 50 ORDER BY pontos DESC, ultima_mensagem_em DESC LIMIT 10) o$a$,
     $b$FROM (SELECT * FROM public.fn_conversas_oportunidades() WHERE pontos >= 90 ORDER BY pontos DESC, ultima_mensagem_em DESC LIMIT 8) o$b$),
    ($a$'prioridade', CASE WHEN o.pontos >= 80 THEN 'alta' WHEN o.pontos >= 60 THEN 'media' ELSE 'baixa' END,$a$,
     $b$'prioridade', CASE WHEN o.pontos >= 110 THEN 'alta' ELSE 'media' END,$b$),
    ($a$'oportunidades', (SELECT count(*) FROM public.fn_conversas_oportunidades() WHERE pontos >= 50),$a$,
     $b$'oportunidades', (SELECT count(*) FROM public.fn_conversas_oportunidades() WHERE pontos >= 90),
    'oportunidades_todas', (SELECT count(*) FROM public.fn_conversas_oportunidades()),$b$),
    ($a$      'nome', coalesce(wc.contato_nome, a.nome_whatsapp, 'Contato sem nome'),$a$,
     $b$      'nome', coalesce(nullif(wc.contato_nome, 'Desconhecido'), public.fn_conversas_nome_por_tel(a.telefone), a.nome_whatsapp, 'Contato sem nome'),$b$),
    ($a$      'nome', coalesce(wc.contato_nome, c.nome_whatsapp, (SELECT p.nome FROM public.pessoas p WHERE p.id = s.paciente_id), 'Contato sem nome'),$a$,
     $b$      'nome', coalesce(nullif(wc.contato_nome, 'Desconhecido'), public.fn_conversas_nome_por_tel(c.telefone), c.nome_whatsapp, (SELECT p.nome FROM public.pessoas p WHERE p.id = s.paciente_id), 'Contato sem nome'),$b$),
    ($a$      'nome', coalesce(f.contato_nome, 'Contato sem nome'),$a$,
     $b$      'nome', coalesce(nullif(f.contato_nome, 'Desconhecido'), public.fn_conversas_nome_por_tel(f.contato_telefone), 'Contato sem nome'),$b$),
    ($a$          WHEN f.followup_motivo = 'Há fatura paga sem nota fiscal' THEN 'alta'$a$,
     $b$          WHEN f.followup_motivo = 'Há fatura paga sem nota fiscal' AND f.ult > v_agora - interval '30 days' THEN 'alta'
          WHEN f.followup_motivo = 'Há fatura paga sem nota fiscal' THEN 'media'$b$)
  ) t(velho, novo) LOOP
    IF position(r.velho IN v_def) = 0 THEN RAISE EXCEPTION 'hoje: trecho não encontrado: %', left(r.velho, 70); END IF;
    v_def := replace(v_def, r.velho, r.novo);
  END LOOP;
  EXECUTE v_def;
END $$;

-- 3, 4, 8: fn_conversas_oportunidades ---------------------------------
DO $$
DECLARE v_def text := pg_get_functiondef('public.fn_conversas_oportunidades()'::regprocedure);
BEGIN
  IF position('fn_conversas_mapa_tel' IN v_def) > 0 THEN RETURN; END IF;
  v_def := replace(v_def,
    $a$    SELECT w.*, coalesce(w.ultima_mensagem_em, w.created_at) AS ult,
           array(SELECT (x ->> 'id')::uuid FROM jsonb_array_elements(to_jsonb(w.pacientes_vinculados)) x) AS pacs
    FROM public.vw_whatsapp_conversas_enriquecidas w$a$,
    $b$    SELECT w.*, coalesce(w.ultima_mensagem_em, w.created_at) AS ult,
           coalesce(mt.pacientes, '{}') AS pacs, (mt.chave IS NOT NULL) AS cadastrado_tel
    FROM public.vw_whatsapp_conversas_enriquecidas w
    LEFT JOIN (SELECT * FROM public.fn_conversas_mapa_tel()) mt ON mt.chave = public.fn_tel_chave(w.contato_telefone)$b$);
  v_def := replace(v_def, $a$         + CASE WHEN b.cliente_cadastrado THEN 5 ELSE 0 END$a$, $b$         + CASE WHEN b.cadastrado_tel THEN 5 ELSE 0 END$b$);
  v_def := replace(v_def, $a$           CASE WHEN b.cliente_cadastrado THEN 'já é cadastrada' END),
         b.resumo, b.ult, b.cliente_cadastrado$a$,
                          $b$           CASE WHEN b.cadastrado_tel THEN 'já é cadastrada' END),
         b.resumo, b.ult, b.cadastrado_tel$b$);
  v_def := replace(v_def, $a$         coalesce(b.pessoa_vinculada_nome, b.contato_nome),$a$,
                          $b$         coalesce(b.pessoa_vinculada_nome, nullif(b.contato_nome, 'Desconhecido'), public.fn_conversas_nome_por_tel(b.contato_telefone), b.contato_nome),$b$);
  EXECUTE v_def;
END $$;

-- 3, 4: fn_conversas_desempenho (versão final aplicada recria a função
-- inteira com v_teste e o mapa de telefone; ver conversas_central.sql para o
-- corpo e os trechos abaixo para as diferenças) -------------------------
DO $$
DECLARE v_def text := pg_get_functiondef('public.fn_conversas_desempenho(integer)'::regprocedure);
BEGIN
  IF position('fn_conversas_mapa_tel' IN v_def) > 0 THEN RETURN; END IF;
  v_def := replace(v_def,
    $a$           w.cliente_cadastrado, coalesce(w.iniciada_em, w.created_at) AS ini,
           array(SELECT (x ->> 'id')::uuid FROM jsonb_array_elements(to_jsonb(w.pacientes_vinculados)) x) AS pacs
    FROM public.vw_whatsapp_conversas_enriquecidas w$a$,
    $b$           (mt.chave IS NOT NULL) AS cliente_cadastrado, coalesce(w.iniciada_em, w.created_at) AS ini,
           coalesce(mt.pacientes, '{}') AS pacs
    FROM public.whatsapp_conversas w
    LEFT JOIN (SELECT * FROM public.fn_conversas_mapa_tel()) mt ON mt.chave = public.fn_tel_chave(w.contato_telefone)$b$);
  EXECUTE v_def;
END $$;

-- 5: fn_conversas_qualidade --------------------------------------------
DO $$
DECLARE v_def text := pg_get_functiondef('public.fn_conversas_qualidade(integer)'::regprocedure);
BEGIN
  IF position('reajuste' IN v_def) = 0 THEN
    v_def := replace(v_def,
      $a$      CASE WHEN m.conteudo ~* '(fatura|cobran|pagamento|\mpix\M|vencid|em aberto)' THEN 'cobranca'$a$,
      $b$      CASE WHEN m.conteudo ~* 'reajust|a partir do dia .* os valores' THEN 'reajuste'
           WHEN m.conteudo ~* '^.?cadastro realizado' THEN 'cadastro'
           WHEN m.conteudo = '[NativeFlowMessage]' THEN 'botoes'
           WHEN m.conteudo ~* '(fatura|cobran|pagamento|\mpix\M|vencid|em aberto)' THEN 'cobranca'$b$);
    v_def := replace(v_def,
      $a$    WHERE m.origem = 'AUTOMACAO' AND m.created_at >= greatest(v_ini, now() - interval '30 days')$a$,
      $b$    WHERE m.origem = 'AUTOMACAO' AND m.created_at >= greatest(v_ini, now() - interval '30 days')
      AND coalesce(m.conteudo, '') !~* 'transcri[cç][aã]o autom[aá]tica'$b$);
  END IF;
  IF position('GROUP BY a.conversa_id' IN v_def) = 0 THEN
    v_def := replace(v_def,
      $a$SELECT coalesce(wn.contato_nome, c.nome_whatsapp, 'Contato') AS nome, count(*) AS n,$a$,
      $b$SELECT coalesce(nullif(wn.contato_nome, 'Desconhecido'), c.nome_whatsapp, 'Contato sem nome') AS nome, count(*) AS n,$b$);
    v_def := replace(v_def,
      $a$                         GROUP BY 1 ORDER BY 2 DESC LIMIT 5) z)$a$,
      $b$                         GROUP BY a.conversa_id, wn.contato_nome, c.nome_whatsapp ORDER BY 2 DESC LIMIT 5) z)$b$);
  END IF;
  EXECUTE v_def;
END $$;
