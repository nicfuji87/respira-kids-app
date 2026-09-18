-- Meta da pesquisa de experiência (secretaria), piloto out–dez/2026.
--
-- Contexto (18/09/2026): a pesquisa não recebe resposta desde junho. Não é
-- defeito (anon insere normalmente); o link era copiado à mão e ninguém
-- registrava quem recebeu. A meta mede o CONVITE e a QUANTIDADE de respostas,
-- nunca a nota: meta em nota incentiva escolher família satisfeita
-- (ver memória pesquisa-experiencia-antivies).
--
-- Regras:
--  * Família elegível: responsável legal de paciente com 3+ sessões realizadas
--    nos últimos 60 dias, sem pesquisa respondida nos últimos 6 meses
--    (pessoas.pesquisa_experiencia_proxima_em) e sem convite nos últimos 30 dias.
--  * Convite conta 1 vez por família a cada 30 dias.
--  * Respostas = linhas de pesquisas_experiencia no mês (a tabela é anônima,
--    então é o total da clínica).

CREATE OR REPLACE FUNCTION public.fn_pesquisa_lista()
RETURNS TABLE (
  responsavel_id uuid,
  responsavel_nome text,
  responsavel_telefone text,
  pacientes text,
  sessoes_60d integer,
  ultima_sessao date,
  ultimo_convite_em timestamptz,
  total_convites integer,
  respondida_em timestamptz,
  proxima_em date,
  conta_para_meta boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agora timestamp := fn_agora_parede();
  v_hoje date := (fn_agora_parede())::date;
  v_excluir uuid[] := fn_status_sessao_nao_realizada();
BEGIN
  IF NOT fn_rls_admin_secretaria_ativo() THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  RETURN QUERY
  WITH resp AS (
    SELECT DISTINCT ON (pr.id_pessoa) pr.id_pessoa, pr.id_responsavel
    FROM pessoa_responsaveis pr
    WHERE pr.ativo AND pr.tipo_responsabilidade IN ('legal', 'ambos')
    ORDER BY pr.id_pessoa, (pr.tipo_responsabilidade = 'legal') DESC, pr.created_at
  ),
  sess AS (
    SELECT r.id_responsavel, a.paciente_id, (a.data_hora AT TIME ZONE 'UTC') AS quando
    FROM agendamentos a
    JOIN resp r ON r.id_pessoa = a.paciente_id
    WHERE a.ativo
      AND NOT (a.status_consulta_id = ANY (v_excluir))
      AND (a.data_hora AT TIME ZONE 'UTC') <= v_agora
      AND (a.data_hora AT TIME ZONE 'UTC') >= v_agora - interval '60 days'
  ),
  fam AS (
    SELECT s.id_responsavel,
           count(*)::int AS n,
           max(s.quando)::date AS ultima,
           string_agg(DISTINCT split_part(p.nome, ' ', 1), ', ') AS pacientes
    FROM sess s
    JOIN pessoas p ON p.id = s.paciente_id
    GROUP BY s.id_responsavel
    HAVING count(*) >= 3
  ),
  conv AS (
    SELECT pe.pessoa_id, max(pe.data_evento) AS ultimo, count(*)::int AS total
    FROM pessoa_eventos pe
    WHERE pe.tipo_evento = 'convite_pesquisa'
    GROUP BY pe.pessoa_id
  )
  SELECT f.id_responsavel, rp.nome, rp.telefone::text, f.pacientes, f.n, f.ultima,
         c.ultimo, COALESCE(c.total, 0),
         rp.pesquisa_experiencia_respondida_em, rp.pesquisa_experiencia_proxima_em,
         (c.ultimo IS NULL OR c.ultimo < now() - interval '30 days')
  FROM fam f
  JOIN pessoas rp ON rp.id = f.id_responsavel
  LEFT JOIN conv c ON c.pessoa_id = f.id_responsavel
  WHERE rp.ativo
    AND (rp.pesquisa_experiencia_proxima_em IS NULL OR rp.pesquisa_experiencia_proxima_em <= v_hoje);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_pesquisa_lista() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pesquisa_lista() TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_registrar_convite_pesquisa(
  p_responsavel_id uuid,
  p_metodo text DEFAULT 'whatsapp',
  p_mensagem text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_eu uuid;
  v_linha record;
  v_conta boolean := false;
  v_motivo text;
BEGIN
  IF NOT fn_rls_admin_secretaria_ativo() THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT id INTO v_eu FROM pessoas WHERE auth_user_id = auth.uid() LIMIT 1;
  SELECT * INTO v_linha FROM fn_pesquisa_lista() l WHERE l.responsavel_id = p_responsavel_id;

  IF v_linha.responsavel_id IS NULL THEN
    v_motivo := 'família fora da lista (menos de 3 sessões em 60 dias ou pesquisa respondida há menos de 6 meses)';
  ELSIF NOT v_linha.conta_para_meta THEN
    v_motivo := 'já recebeu convite nos últimos 30 dias';
  ELSE
    v_conta := true;
  END IF;

  INSERT INTO pessoa_eventos (pessoa_id, responsavel_id, tipo_evento, categoria, metodo,
                              contatado_por, dados_evento)
  VALUES (p_responsavel_id, p_responsavel_id, 'convite_pesquisa', 'pesquisa', p_metodo, v_eu,
          jsonb_build_object('conta_para_meta', v_conta, 'motivo_nao_conta', v_motivo,
                             'mensagem_enviada', p_mensagem));

  RETURN jsonb_build_object('conta_para_meta', v_conta, 'motivo', v_motivo);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_registrar_convite_pesquisa(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_registrar_convite_pesquisa(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_calcular_pesquisa_convites(p_pessoa_id uuid, p_inicio date, p_fim date)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(DISTINCT pe.pessoa_id)::numeric
  FROM pessoa_eventos pe
  WHERE pe.tipo_evento = 'convite_pesquisa'
    AND (pe.dados_evento ->> 'conta_para_meta')::boolean IS TRUE
    AND (pe.data_evento AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_inicio AND p_fim
    AND (p_pessoa_id IS NULL OR pe.contatado_por = p_pessoa_id);
$$;

-- Respostas são anônimas: total da clínica no período (p_pessoa_id ignorado).
CREATE OR REPLACE FUNCTION public.fn_calcular_pesquisa_respostas(p_pessoa_id uuid, p_inicio date, p_fim date)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::numeric
  FROM pesquisas_experiencia pe
  WHERE (pe.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_inicio AND p_fim;
$$;

ALTER TABLE tipos_meta DROP CONSTRAINT IF EXISTS tipos_meta_categoria_check;
ALTER TABLE tipos_meta ADD CONSTRAINT tipos_meta_categoria_check
  CHECK (categoria = ANY (ARRAY['atendimento','qualidade','produtividade','reativacao','relacionamento','experiencia']));

INSERT INTO tipos_meta (codigo, nome, descricao, categoria, unidade_medida, role_alvo, ativo)
VALUES
  ('pesquisa_convites', 'Convites da Pesquisa de Experiência',
   'Famílias com 3+ sessões em 60 dias convidadas no mês (1 vez a cada 30 dias por família)',
   'experiencia', 'convites', 'secretaria', true),
  ('pesquisa_respostas', 'Respostas da Pesquisa de Experiência',
   'Respostas recebidas no mês (pesquisa anônima: total da clínica). Nunca a nota.',
   'experiencia', 'respostas', 'secretaria', true)
ON CONFLICT (codigo) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_atualizar_meta(p_meta_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_codigo text;
  v_pessoa uuid;
  v_inicio date;
  v_fim date;
  v_valor numeric;
  v_valor_meta numeric;
BEGIN
  SELECT tm.codigo, m.pessoa_id, m.periodo_inicio, m.periodo_fim, m.valor_meta
    INTO v_codigo, v_pessoa, v_inicio, v_fim, v_valor_meta
  FROM metas m
  JOIN tipos_meta tm ON tm.id = m.tipo_meta_id
  WHERE m.id = p_meta_id;

  IF v_codigo IS NULL THEN RETURN 0; END IF;

  v_valor := CASE v_codigo
    WHEN 'consultas_realizadas' THEN fn_calcular_consultas_realizadas(v_pessoa, v_inicio, v_fim)
    WHEN 'evolucoes_no_prazo' THEN fn_calcular_evolucoes_no_prazo(v_pessoa, v_inicio, v_fim)
    WHEN 'taxa_comparecimento' THEN fn_calcular_taxa_comparecimento(v_pessoa, v_inicio, v_fim)
    WHEN 'contatos_inatividade' THEN fn_calcular_contatos_inatividade(v_pessoa, v_inicio, v_fim)
    WHEN 'pacientes_reativados' THEN fn_calcular_pacientes_reativados(v_pessoa, v_inicio, v_fim)
    WHEN 'contatos_pediatras' THEN fn_calcular_contatos_pediatras(v_pessoa, v_inicio, v_fim)
    WHEN 'evolucoes_para_pediatras' THEN fn_calcular_evolucoes_para_pediatras(v_pessoa, v_inicio, v_fim)
    WHEN 'evolucoes_cobertura' THEN fn_calcular_evolucoes_cobertura(v_pessoa, v_inicio, v_fim)
    WHEN 'evolucoes_24h' THEN fn_calcular_evolucoes_24h(v_pessoa, v_inicio, v_fim)
    WHEN 'pesquisa_convites' THEN fn_calcular_pesquisa_convites(v_pessoa, v_inicio, v_fim)
    WHEN 'pesquisa_respostas' THEN fn_calcular_pesquisa_respostas(v_pessoa, v_inicio, v_fim)
    ELSE 0
  END;

  UPDATE metas SET valor_atual = v_valor, updated_at = now() WHERE id = p_meta_id;

  INSERT INTO meta_acompanhamento (meta_id, data_referencia, valor_atual, percentual_atingido)
  VALUES (p_meta_id, (fn_agora_parede())::date, v_valor, CASE WHEN v_valor_meta > 0 THEN ROUND(v_valor / v_valor_meta * 100, 2) ELSE 0 END)
  ON CONFLICT (meta_id, data_referencia) DO UPDATE
    SET valor_atual = EXCLUDED.valor_atual,
        percentual_atingido = EXCLUDED.percentual_atingido;

  RETURN v_valor;
END;
$function$;

-- Piloto out–dez/2026: 50 convites (~2–3 por dia útil) e 12 respostas (~25%).
DO $$
DECLARE
  v_sec uuid := 'df8ed2ab-867d-47b3-97a2-b05891fae798';
  v_admin uuid := '469efda9-8ac5-4f1c-b34f-ad026e6051c9';
  v_conv uuid := (SELECT id FROM tipos_meta WHERE codigo = 'pesquisa_convites');
  v_resp uuid := (SELECT id FROM tipos_meta WHERE codigo = 'pesquisa_respostas');
  v_ini date;
BEGIN
  FOREACH v_ini IN ARRAY ARRAY[date '2026-10-01', date '2026-11-01', date '2026-12-01'] LOOP
    IF EXISTS (SELECT 1 FROM metas WHERE periodo_inicio = v_ini AND tipo_meta_id IN (v_conv, v_resp)) THEN
      CONTINUE;
    END IF;
    INSERT INTO metas (titulo, descricao, tipo_meta_id, escopo, pessoa_id, periodo_inicio, periodo_fim,
                       mes_referencia, ano_referencia, valor_meta, valor_minimo, criado_por)
    VALUES
      ('Convites da pesquisa de experiência',
       'Famílias com 3+ sessões nos últimos 60 dias, seguindo a ordem da lista. Nunca escolher quem "gostou mais".',
       v_conv, 'individual', v_sec, v_ini, (v_ini + interval '1 month - 1 day')::date,
       EXTRACT(month FROM v_ini), EXTRACT(year FROM v_ini), 50, 40, v_admin),
      ('Respostas da pesquisa de experiência',
       'Quantidade de respostas no mês (a pesquisa é anônima). A nota nunca entra na meta.',
       v_resp, 'individual', v_sec, v_ini, (v_ini + interval '1 month - 1 day')::date,
       EXTRACT(month FROM v_ini), EXTRACT(year FROM v_ini), 12, 10, v_admin);
  END LOOP;
END $$;
