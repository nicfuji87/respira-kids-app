-- Testes do P0 do Marketing (cálculo único). Rodar DEPOIS da migração
-- atribuicao_v2_p0_calculo_unico.sql, como postgres. Só leitura: o bloco termina com
-- RAISE EXCEPTION, que desfaz tudo (inclusive o alerta de convênio) e devolve o relatório.
-- Para comparar com o painel antigo, rode antes da migração:
--   CREATE TEMP TABLE t_antes AS SELECT paciente_id, canal, aquisicao_em, primeiro_atendimento_id
--     FROM public.vw_atrib_aquisicoes;
DO $teste$
DECLARE
  j  jsonb := public.fn_atrib_retorno_canais('2026-10-01', '2026-11-30', 'aquisicao');
  ja jsonb := public.fn_atrib_retorno_anuncios('2026-10-01', '2026-11-30');
  falhas text[] := '{}';
  r jsonb;
  dif int;
BEGIN
  -- 1. Mesmo paciente, mesmo resultado: Retorno por canal × Google Ads.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(ja->'pacientes') a
      JOIN jsonb_array_elements(j->'pacientes') c ON c->>'paciente_id' = a->>'paciente_id'
     WHERE a->>'presenca' IS DISTINCT FROM c->>'presenca'
        OR a->>'receita_realizada' IS DISTINCT FROM c->>'receita_realizada'
        OR a->>'sessoes_realizadas' IS DISTINCT FROM c->>'sessoes_realizadas')
  THEN falhas := falhas || 'paciente com presença ou receita diferente entre canais e anúncios'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(j->'pacientes') c WHERE c->>'canal' = 'google_ads')
     <> jsonb_array_length(ja->'pacientes')
  THEN falhas := falhas || 'Google Ads tem pacientes diferentes nas duas visões'; END IF;
  IF (SELECT sum((k->>'agendaram')::int) FROM jsonb_array_elements(j->'canais') k WHERE k->>'canal' = 'google_ads')
     <> (SELECT sum((k->>'agendaram')::int) FROM jsonb_array_elements(ja->'campanhas') k)
  THEN falhas := falhas || 'agendaram do Google Ads difere entre canais e anúncios'; END IF;

  -- 2. Sessão paga sem baixa nunca é presença confirmada.
  IF EXISTS (SELECT 1 FROM interno.vw_atrib_sessoes s
              WHERE s.status_consulta IN ('agendado', 'confirmado') AND s.presenca = 'confirmada')
  THEN falhas := falhas || 'sessão sem baixa classificada como confirmada'; END IF;

  -- 3. Falta: receita sim, atendimento não.
  IF EXISTS (SELECT 1 FROM interno.vw_atrib_sessoes s WHERE s.status_consulta = 'faltou' AND s.presenca <> 'falta')
  THEN falhas := falhas || 'falta com presença errada'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(j->'pacientes') p
              WHERE (p->>'sessoes_realizadas')::int = 0 AND (p->>'sessoes_provaveis')::int = 0
                AND (p->>'sessoes_pendentes')::int = 0 AND (p->>'faltas')::int > 0
                AND p->>'presenca' IN ('confirmada', 'provavel', 'pendente'))
  THEN falhas := falhas || 'paciente só com falta contado como atendido'; END IF;

  -- 4. Davi (vínculo manual de 25/11) segue só agendado até a 1ª sessão acontecer.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(j->'pacientes') p
              WHERE p->>'nome' ILIKE 'Davi Cremonez%' AND (p->>'sessoes_realizadas')::int = 0
                AND p->>'presenca' NOT IN ('agendada', 'pendente', 'provavel'))
  THEN falhas := falhas || 'Davi com presença errada'; END IF;

  -- 5. Totais = soma das linhas (sem duplicar conversa com irmãos).
  IF (SELECT sum((k->>'conversas')::int) FROM jsonb_array_elements(j->'canais') k) <> jsonb_array_length(j->'conversas')
  THEN falhas := falhas || 'total de conversas difere da lista'; END IF;
  IF (SELECT sum((k->>'atendidas')::int) FROM jsonb_array_elements(j->'canais') k)
     <> (SELECT count(*) FROM jsonb_array_elements(j->'pacientes') p WHERE p->>'presenca' = 'confirmada')
  THEN falhas := falhas || 'total de atendidas difere da lista'; END IF;

  -- 6. Filtros mudam os totais (ou devolvem nulo quando não se aplicam).
  r := public.fn_atrib_retorno_canais('2026-10-01', '2026-11-30', 'aquisicao', 'tipo:pago');
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'canais') k WHERE k->>'canal' NOT IN ('google_ads', 'meta_ads'))
  THEN falhas := falhas || 'filtro tipo:pago deixou passar canal orgânico'; END IF;
  r := public.fn_atrib_retorno_canais('2026-10-01', '2026-11-30', 'aquisicao', NULL, NULL,
         (SELECT p->>'servico' FROM jsonb_array_elements(j->'pacientes') p WHERE p->>'servico' IS NOT NULL LIMIT 1));
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'canais') k WHERE k->>'conversas' IS NOT NULL OR k->>'investimento' IS NOT NULL)
  THEN falhas := falhas || 'filtro de serviço manteve conversas/investimento'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'pacientes') p WHERE p->>'servico' IS DISTINCT FROM r->'recorte'->>'servico')
  THEN falhas := falhas || 'filtro de serviço deixou passar outro serviço'; END IF;

  -- 7. Painel antigo intacto (quando t_antes existir).
  IF to_regclass('pg_temp.t_antes') IS NOT NULL THEN
    EXECUTE $q$SELECT count(*) FROM ((SELECT * FROM t_antes EXCEPT
              SELECT paciente_id, canal, aquisicao_em, primeiro_atendimento_id FROM public.vw_atrib_aquisicoes)
              UNION ALL (SELECT paciente_id, canal, aquisicao_em, primeiro_atendimento_id FROM public.vw_atrib_aquisicoes
              EXCEPT SELECT * FROM t_antes)) x$q$ INTO dif;
    IF dif > 0 THEN falhas := falhas || ('painel antigo mudou em ' || dif || ' linha(s)'); END IF;
  END IF;

  RAISE EXCEPTION 'RESULTADO %', jsonb_build_object(
    'falhas', to_jsonb(falhas),
    'canais', (SELECT jsonb_agg(jsonb_build_object('canal', k->>'canal', 'conv', k->'conversas', 'agend', k->'agendaram',
                 'confirm', k->'atendidas', 'novas', k->'novas_atendidas', 'provav', k->'atendidas_provaveis',
                 'pend', k->'presenca_pendente', 'realizada', k->'receita_realizada', 'conferir', k->'receita_a_conferir',
                 'recebida', k->'receita_recebida', 'invest', k->'investimento'))
                 FROM jsonb_array_elements(j->'canais') k),
    'anuncios', (SELECT jsonb_agg(jsonb_build_object('nome', k->>'nome', 'invest', k->'investimento', 'conv', k->'conversas',
                 'agend', k->'agendaram', 'pac', k->'pacientes', 'novas', k->'pacientes_novas', 'provav', k->'pacientes_provaveis',
                 'realizada', k->'receita_realizada', 'conferir', k->'receita_a_conferir'))
                 FROM jsonb_array_elements(ja->'campanhas') k),
    'presenca_sessoes_out_nov', (SELECT jsonb_object_agg(presenca, n) FROM (SELECT presenca, count(*) n
                 FROM interno.vw_atrib_sessoes WHERE dh >= '2026-10-01' AND dh < '2026-12-01' GROUP BY 1) x),
    'davi', (SELECT jsonb_agg(p - 'nome' - 'paciente_id') FROM jsonb_array_elements(j->'pacientes') p WHERE p->>'nome' ILIKE 'Davi Cremonez%'),
    'convenio', public.fn_atrib_alerta_convenio());
END
$teste$;
