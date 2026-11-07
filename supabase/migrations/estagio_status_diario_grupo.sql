-- 07/11/2026: status diário das evoluções no grupo 🎓 RK · Estágio (seg-sex 18h).
-- Usa a mesma regra do bônus (fn_estagio_bonus_evolucoes_calc): sem domiciliar, motora só a partir
-- de 01/12/2026, prazo de 24 h (sábado/domingo vencem segunda 23h59).
-- Também conserta a tela "Evoluções" do celular das estagiárias: fn_estagio_evolucoes_dados chamava
-- fn_estagio_bonus_evolucoes, que tem trava de admin, e a sessão do celular não é admin ("acesso negado").

DO $mig$
DECLARE v_def text; v_new text;
BEGIN
  -- Cálculo puro, sem a trava de admin (só postgres/service_role executam direto).
  v_def := pg_get_functiondef('public.fn_estagio_bonus_evolucoes(date)'::regprocedure);
  IF position('fn_estagio_bonus_evolucoes_calc' in v_def) > 0 THEN RETURN; END IF; -- já aplicada
  v_new := replace(v_def, 'FUNCTION public.fn_estagio_bonus_evolucoes(', 'FUNCTION public.fn_estagio_bonus_evolucoes_calc(');
  v_new := replace(v_new, $s$  IF NOT fn_rls_admin_secretaria_ativo() THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
$s$, '');
  IF v_new = v_def OR position('fn_rls_admin_secretaria_ativo' in v_new) > 0 THEN RAISE EXCEPTION 'trava não removida'; END IF;
  EXECUTE v_new;

  v_def := pg_get_functiondef('public.fn_estagio_evolucoes_dados(date)'::regprocedure);
  v_new := replace(v_def, 'v_bonus := fn_estagio_bonus_evolucoes(v_inicio);', 'v_bonus := fn_estagio_bonus_evolucoes_calc(v_inicio);');
  IF v_new = v_def THEN RAISE EXCEPTION 'fn_estagio_evolucoes_dados: chamada não encontrada'; END IF;
  EXECUTE v_new;

  EXECUTE $f$
CREATE OR REPLACE FUNCTION public.fn_estagio_bonus_evolucoes(p_mes date DEFAULT NULL::date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $b$
BEGIN
  IF NOT fn_rls_admin_secretaria_ativo() THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  RETURN fn_estagio_bonus_evolucoes_calc(p_mes);
END $b$;
$f$;
END $mig$;

REVOKE ALL ON FUNCTION public.fn_estagio_bonus_evolucoes_calc(date) FROM PUBLIC, anon, authenticated;

-- Texto do status (também serve para conferir: SELECT fn_estagio_status_diario_texto();).
CREATE OR REPLACE FUNCTION public.fn_estagio_status_diario_texto()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  b jsonb := fn_estagio_bonus_evolucoes_calc(NULL);
  v_agora timestamp := fn_agora_parede();
  v_hoje date := fn_agora_parede()::date;
  v_motora boolean := coalesce((b ->> 'conta_motora')::boolean, false);
  h record; v_pend text; v_perd text; v_prof text; v_txt text; v_pct int;
  v_ini_mes date := date_trunc('month', fn_agora_parede())::date;
  v_meses text[] := ARRAY['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  v_dias text[] := ARRAY['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
BEGIN
  -- Sessões que contam (mesma regra do bônus), de hoje até agora e das últimas 48 h para pendências.
  CREATE TEMP TABLE IF NOT EXISTS _est_s (inicio timestamp, prazo timestamp, evo_em timestamp, paciente text, profissional text) ON COMMIT DROP;
  TRUNCATE _est_s;
  INSERT INTO _est_s
  SELECT (a.data_hora AT TIME ZONE 'UTC'),
         fn_evolucao_prazo(a.data_hora AT TIME ZONE 'UTC'),
         (SELECT min(re.created_at AT TIME ZONE 'America/Sao_Paulo') FROM relatorio_evolucao re WHERE re.id_agendamento = a.id),
         split_part(coalesce(pp.nome, ''), ' ', 1), split_part(coalesce(pr.nome, ''), ' ', 1)
    FROM agendamentos a
    JOIN tipo_servicos ts ON ts.id = a.tipo_servico_id
    LEFT JOIN pessoas pp ON pp.id = a.paciente_id
    LEFT JOIN pessoas pr ON pr.id = a.profissional_id
   WHERE a.ativo AND a.paciente_id IS NOT NULL
     AND NOT (a.status_consulta_id = ANY (fn_status_sessao_nao_realizada()))
     AND ts.nome NOT ILIKE '%domiciliar%'
     AND (v_motora OR ts.nome ILIKE '%avalia%' OR ts.nome NOT ILIKE '%motora%')
     AND (a.data_hora AT TIME ZONE 'UTC') <= v_agora
     AND (a.data_hora AT TIME ZONE 'UTC') >= least(v_ini_mes::timestamp, v_agora - interval '4 days')
     AND (a.data_hora AT TIME ZONE 'UTC')::date >= (b ->> 'vigencia_inicio')::date;

  SELECT count(*) AS sessoes, count(*) FILTER (WHERE evo_em IS NOT NULL) AS evoluidas,
         count(*) FILTER (WHERE evo_em IS NULL) AS pendentes
    INTO h FROM _est_s WHERE inicio::date = v_hoje;

  -- Ainda no prazo, sem evolução (o mais urgente primeiro).
  SELECT string_agg('• ' || paciente || ' · ' || profissional || ' · '
           || CASE WHEN inicio::date = v_hoje THEN 'hoje' WHEN inicio::date = v_hoje - 1 THEN 'ontem'
                   ELSE v_dias[extract(dow FROM inicio)::int + 1] END
           || ' ' || regexp_replace(to_char(inicio, 'FMHH24"h"MI'), 'h00$', 'h')
           || ' → até ' || CASE WHEN prazo::date = v_hoje THEN 'hoje' WHEN prazo::date = v_hoje + 1 THEN 'amanhã'
                                ELSE v_dias[extract(dow FROM prazo)::int + 1] END
           || ' ' || regexp_replace(to_char(prazo, 'FMHH24"h"MI'), 'h00$', 'h'), E'\n' ORDER BY prazo)
    INTO v_pend FROM _est_s WHERE evo_em IS NULL AND prazo > v_agora;

  -- Venceram hoje sem evolução no prazo.
  SELECT string_agg(paciente || ' (' || profissional || ', '
           || CASE WHEN inicio::date = v_hoje - 1 THEN 'ontem' ELSE to_char(inicio, 'DD/MM') END
           || ' ' || regexp_replace(to_char(inicio, 'FMHH24"h"MI'), 'h00$', 'h') || ')', ', ' ORDER BY inicio)
    INTO v_perd FROM _est_s
   WHERE prazo::date = v_hoje AND prazo <= v_agora AND (evo_em IS NULL OR evo_em > prazo);

  -- Por profissional, no mês (só sessões cujo prazo já venceu, como no bônus).
  SELECT string_agg('• ' || profissional || ': ' || no_prazo || ' de ' || total || ' no prazo'
           || CASE WHEN fora > 0 THEN ' · ' || fora || ' fora' ELSE '' END, E'\n' ORDER BY total DESC, profissional)
    INTO v_prof
    FROM (SELECT profissional, count(*) AS total,
                 count(*) FILTER (WHERE evo_em IS NOT NULL AND evo_em <= prazo) AS no_prazo,
                 count(*) FILTER (WHERE evo_em IS NULL OR evo_em > prazo) AS fora
            FROM _est_s WHERE inicio::date >= v_ini_mes AND prazo <= v_agora
           GROUP BY profissional) x;

  v_pct := CASE WHEN (b ->> 'contadas')::int > 0
                THEN round(100.0 * (b ->> 'no_prazo')::int / (b ->> 'contadas')::int) END;

  v_txt := '📊 *Evoluções · ' || v_dias[extract(dow FROM v_hoje)::int + 1] || ', ' || to_char(v_hoje, 'DD/MM') || '*'
    || E'\n\n*Hoje:* ' || h.sessoes || CASE WHEN h.sessoes = 1 THEN ' sessão' ELSE ' sessões' END
    || ' · ' || h.evoluidas || CASE WHEN h.evoluidas = 1 THEN ' evoluída' ELSE ' evoluídas' END
    || ' · ' || h.pendentes || CASE WHEN h.pendentes = 1 THEN ' pendente' ELSE ' pendentes' END
    || E'\n*' || initcap(v_meses[extract(month FROM v_hoje)::int]) || ':* '
    || (b ->> 'no_prazo') || ' de ' || (b ->> 'contadas') || ' evoluídas em até 24 h'
    || coalesce(' (' || v_pct || '%)', '')
    || ' · ' || (b ->> 'perdidas') || ' fora do prazo'
    || E'\n*Bônus do mês:* R$ ' || replace(to_char((b ->> 'bonus')::numeric, 'FM999990.00'), '.', ',')
    || ' de R$ ' || replace(to_char((b ->> 'bonus_base')::numeric, 'FM999990.00'), '.', ',')
    || ' (cada evolução fora do prazo tira R$ ' || (b ->> 'desconto_por_perdida')::numeric::int || ')';

  IF v_prof IS NOT NULL THEN
    v_txt := v_txt || E'\n\n👩‍⚕️ *Evoluções em 24 h por profissional (' || v_meses[extract(month FROM v_hoje)::int] || E'):*\n' || v_prof;
  END IF;
  IF v_pend IS NOT NULL THEN
    v_txt := v_txt || E'\n\n⏳ *Faltam evoluir (ainda no prazo):*\n' || v_pend;
  ELSE
    v_txt := v_txt || E'\n\n✅ Nada pendente no prazo. Obrigada!';
  END IF;
  IF v_perd IS NOT NULL THEN
    v_txt := v_txt || E'\n\n❌ *Venceram hoje sem evolução:* ' || v_perd;
  END IF;
  IF NOT v_motora THEN
    v_txt := v_txt || E'\n\n_Domiciliar não conta. Motora passa a contar em ' || to_char((b ->> 'motora_desde')::date, 'DD/MM') || '._';
  END IF;
  RETURN regexp_replace(v_txt, 'R\$ (\d+),00', 'R$ \1', 'g');
END $function$;
REVOKE ALL ON FUNCTION public.fn_estagio_status_diario_texto() FROM PUBLIC, anon, authenticated;

-- Envio no 🎓 RK · Estágio. Não manda em feriado.
CREATE OR REPLACE FUNCTION public.fn_estagio_status_diario_enviar()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_tok text := fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
BEGIN
  IF v_tok IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM followup_feriados WHERE dia = fn_agora_parede()::date) THEN RETURN NULL; END IF;
  RETURN net.http_post(
    url := 'https://infuse.uazapi.com/send/text',
    body := jsonb_build_object('number', '120363426932235532@g.us', 'text', fn_estagio_status_diario_texto()),
    headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
    timeout_milliseconds := 20000);
END $function$;
REVOKE ALL ON FUNCTION public.fn_estagio_status_diario_enviar() FROM PUBLIC, anon, authenticated;

-- 18h de Brasília (UTC-3, sem horário de verão) de segunda a sexta.
SELECT cron.unschedule('estagio-status-diario') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'estagio-status-diario');
SELECT cron.schedule('estagio-status-diario', '0 21 * * 1-5', 'SELECT public.fn_estagio_status_diario_enviar()');
