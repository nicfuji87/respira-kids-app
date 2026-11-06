-- AI dev note: 06/11/2026 ("Entrega 3"): números do atendimento humano no dia, só SQL, para o bloco do resumo das 17h30.
-- Base: pedidos do 🔔 abertos no dia (menos CLINICO/EXTERNO). Espera = minutos operacionais (seg–sex 8h–18h) do pedido
-- até a 1ª mensagem da equipe (fora "@ju"). Pendentes entram à parte (não somem da conta). Faixa pelo horário do pedido.
CREATE OR REPLACE FUNCTION public.fn_ju_atendimento_dia(p_dia date DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  WITH ped AS (
    SELECT s.id, s.conversa_id, s.tipo, s.created_at,
           extract(hour FROM s.created_at AT TIME ZONE 'America/Sao_Paulo')::int h,
           (SELECT min(m.created_at) FROM ju_mensagens m WHERE m.conversa_id = s.conversa_id AND m.origem = 'HUMANO'
              AND m.created_at > s.created_at AND coalesce(m.conteudo, '') !~* '^\s*@ju') hum,
           s.tipo = 'AGENDAMENTO' AND NOT EXISTS (SELECT 1 FROM agendamentos a WHERE a.ativo AND a.created_at < s.created_at
              AND a.paciente_id = ANY (fn_le_pacientes_da_conversa(s.conversa_id))) novo
      FROM ju_solicitacoes s
     WHERE (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date = p_dia AND s.tipo NOT IN ('CLINICO', 'EXTERNO')
       AND s.conversa_id NOT IN (SELECT unnest(fn_conversas_ids_teste()))
  ), b AS (
    SELECT p.*, fn_ju_minutos_operacionais(p.created_at, coalesce(p.hum, now())) espera
      FROM ped p
  ), faixa AS (
    SELECT CASE WHEN h < 10 THEN '8h–10h' WHEN h < 12 THEN '10h–12h' WHEN h < 14 THEN '12h–14h' WHEN h < 16 THEN '14h–16h' ELSE '16h–18h' END f,
           count(*) n, percentile_cont(0.5) WITHIN GROUP (ORDER BY espera) med
      FROM b WHERE h BETWEEN 8 AND 17 GROUP BY 1
  )
  SELECT jsonb_build_object(
    'pedidos', (SELECT count(*) FROM b),
    'respondidos', (SELECT count(*) FROM b WHERE hum IS NOT NULL),
    'mediana_min', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY espera)::numeric) FROM b WHERE hum IS NOT NULL),
    'p90_min', (SELECT round(percentile_cont(0.9) WITHIN GROUP (ORDER BY espera)::numeric) FROM b WHERE hum IS NOT NULL),
    'pendentes', (SELECT count(*) FROM b WHERE hum IS NULL),
    'pendente_mais_antigo_min', (SELECT round(max(espera)) FROM b WHERE hum IS NULL),
    'gargalo', (SELECT jsonb_build_object('faixa', f, 'mediana_min', round(med::numeric), 'pedidos', n)
                  FROM faixa WHERE n >= 2 ORDER BY med DESC LIMIT 1),
    'novos', (SELECT count(*) FROM b WHERE novo),
    'novos_mais_15', (SELECT count(*) FROM b WHERE novo AND espera > 15),
    'novos_mais_30', (SELECT count(*) FROM b WHERE novo AND espera > 30),
    'novos_sem_resposta', (SELECT count(*) FROM b WHERE novo AND hum IS NULL));
$$;
REVOKE ALL ON FUNCTION public.fn_ju_atendimento_dia(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ju_atendimento_dia(date) TO service_role, authenticated;
