-- Piloto das metas (out–dez/2026). Valores definidos a partir do histórico
-- (ver supabase/migrations/metas_reativacao_v2.sql e a aba Insights em Relatórios).
-- Recalibrar em jan/2027 com a conversão real dos contatos.
DO $$
DECLARE
  v_sec uuid := 'df8ed2ab-867d-47b3-97a2-b05891fae798';   -- secretária
  v_admin uuid := '469efda9-8ac5-4f1c-b34f-ad026e6051c9'; -- criado por
  v_contatos uuid := (SELECT id FROM tipos_meta WHERE codigo = 'contatos_inatividade');
  v_reativ uuid := (SELECT id FROM tipos_meta WHERE codigo = 'pacientes_reativados');
  v_cob uuid := (SELECT id FROM tipos_meta WHERE codigo = 'evolucoes_cobertura');
  v_24h uuid := (SELECT id FROM tipos_meta WHERE codigo = 'evolucoes_24h');
  r record;
  v_meta_contatos uuid;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      (date '2026-10-01', date '2026-10-31', 80, 60),
      (date '2026-11-01', date '2026-11-30', 90, 75),
      (date '2026-12-01', date '2026-12-31', 95, 90)
    ) AS t(ini, fim, cobertura, prazo)
  LOOP
    IF EXISTS (SELECT 1 FROM metas WHERE periodo_inicio = r.ini AND tipo_meta_id IN (v_contatos, v_reativ, v_cob, v_24h)) THEN
      CONTINUE; -- idempotente
    END IF;

    INSERT INTO metas (titulo, descricao, tipo_meta_id, escopo, pessoa_id, periodo_inicio, periodo_fim,
                       mes_referencia, ano_referencia, valor_meta, valor_minimo, criado_por)
    VALUES ('Contatos de reativação',
            'Mínimo para liberar o bônus de reativação. Conta 1 vez por família a cada 90 dias, só pacientes com 60+ dias sem sessão e nada agendado.',
            v_contatos, 'individual', v_sec, r.ini, r.fim,
            EXTRACT(month FROM r.ini), EXTRACT(year FROM r.ini), 150, 120, v_admin)
    RETURNING id INTO v_meta_contatos;

    INSERT INTO metas (titulo, descricao, tipo_meta_id, escopo, pessoa_id, periodo_inicio, periodo_fim,
                       mes_referencia, ano_referencia, valor_meta, valor_minimo, criado_por,
                       niveis, requisito_meta_id)
    VALUES ('Pacientes reativados',
            'Paciente contatado que fez sessão em até 30 dias depois do contato (qualquer serviço). Conta no mês da sessão. Sem contato ~8 voltariam sozinhos de 150; os níveis ficam acima disso.',
            v_reativ, 'individual', v_sec, r.ini, r.fim,
            EXTRACT(month FROM r.ini), EXTRACT(year FROM r.ini), 12, 10, v_admin,
            '[{"valor":12,"bonus":150},{"valor":18,"bonus":300},{"valor":25,"bonus":500}]'::jsonb,
            v_meta_contatos);

    INSERT INTO metas (titulo, descricao, tipo_meta_id, escopo, pessoa_id, periodo_inicio, periodo_fim,
                       mes_referencia, ano_referencia, valor_meta, criado_por)
    VALUES ('Sessões com evolução',
            'Meta da clínica (profissionais + estagiárias que ajudam). Base set/2026: 49%. Sobe até 95% em dezembro.',
            v_cob, 'clinica', NULL, r.ini, r.fim,
            EXTRACT(month FROM r.ini), EXTRACT(year FROM r.ini), r.cobertura, v_admin);

    INSERT INTO metas (titulo, descricao, tipo_meta_id, escopo, pessoa_id, periodo_inicio, periodo_fim,
                       mes_referencia, ano_referencia, valor_meta, criado_por)
    VALUES ('Evoluções em até 24h',
            'Meta da clínica. Base set/2026: 36%. Evolução feita no mesmo dia é mais fiel ao atendimento.',
            v_24h, 'clinica', NULL, r.ini, r.fim,
            EXTRACT(month FROM r.ini), EXTRACT(year FROM r.ini), r.prazo, v_admin);
  END LOOP;
END $$;
