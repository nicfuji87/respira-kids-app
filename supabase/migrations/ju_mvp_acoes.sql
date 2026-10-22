-- =====================================================================
-- Ju (MVP) — contrato, nota fiscal, link de pagamento vencido,
-- pré-cadastro e agenda pública
-- =====================================================================
-- AI dev note: depende de ju_mvp.sql e ju_mvp_conteudo.sql.
-- Tudo continua determinístico: o telefone define o que a Ju enxerga e a
-- IA só escolhe ids que vieram do próprio contexto; o banco confere de novo.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Base de conhecimento (novos itens e ajustes)
-- ---------------------------------------------------------------------
INSERT INTO public.ju_conhecimento (id, categoria, texto) VALUES
('CONTRATO_ASSINATURA', 'DOCUMENTOS',
 'Todo paciente precisa ter o contrato de prestação de serviços assinado. Se o sistema mostrar que o contrato do paciente está assinado, a Ju confirma isso à família (avisos automáticos antigos podem ter chegado depois da assinatura). Se o contrato não estiver assinado e houver link de assinatura no contexto, a Ju envia esse link ao responsável legal identificado. Sem contrato ou sem link, a Ju encaminha à secretaria.'),
('NOTA_FISCAL', 'DOCUMENTOS',
 'A Ju pode enviar a nota fiscal de uma consulta já paga quando o link da nota estiver no contexto, apenas para o responsável com acesso ao financeiro do paciente. Se a nota ainda não estiver disponível ou tiver tido algum problema na emissão, a Ju encaminha ao financeiro e não promete prazo.'),
('PAGAMENTO_APOS_VENCIMENTO', 'FINANCEIRO',
 'É possível pagar depois do vencimento, sem juros. Se o link de pagamento do sistema estiver vencido, a Ju pode renovar o mesmo link (mesmo valor) e enviá-lo de novo. Cobrança que o sistema não deixa renovar, ou sem link do sistema, vai para o financeiro.'),
('PRE_CADASTRO', 'ATENDIMENTO',
 'Para quem ainda não é paciente da Respira Kids e quer agendar, a Ju pode enviar o link de pré-cadastro: https://app.respirakidsbrasilia.com.br/#/cadastro-paciente . Com o cadastro preenchido, a secretaria conclui o agendamento mais rápido. O pré-cadastro não garante horário.'),
('AGENDA_PUBLICA', 'ATENDIMENTO',
 'Quando o sistema informar uma agenda pública ativa, a Ju pode enviar o link para a própria família escolher um horário disponível. A Ju não escolhe, não sugere e não confirma horário. Sem agenda pública ativa, a Ju coleta a preferência e encaminha à secretaria.'),
('REEMBOLSO', 'CONVENIO_REEMBOLSO',
 'Algumas famílias conseguem solicitar reembolso ao próprio plano de saúde. A Respira Kids fornece a documentação necessária, como a nota fiscal da consulta paga. A aprovação, o percentual e as regras do reembolso dependem exclusivamente do plano de saúde da família, por isso a Ju não deve prometer que o reembolso será aprovado nem informar um valor de reembolso sem documentação do próprio plano.')
ON CONFLICT (id) DO UPDATE
   SET categoria = EXCLUDED.categoria, texto = EXCLUDED.texto, ativo = true, updated_at = now();


-- ---------------------------------------------------------------------
-- 2. Contexto do cliente (mesma assinatura; acréscimos):
--    - contrato passa a ser objeto {status, link_assinatura};
--    - cobrancas_em_aberto traz pagamento_link_id e link_vencido, e o
--      link só sai quando está válido;
--    - links_vencidos: pré-cobranças vencidas (inclusive status 'expirado',
--      que a vw_cobrancas_pendentes não mostra), candidatas a renovação;
--    - notas_fiscais: consultas pagas nos últimos 180 dias e o link da nota
--      quando ele existe e a emissão não falhou.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ju_contexto_cliente(p_conversa_id bigint)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH conv AS (
    SELECT telefone, substr(telefone, 2) AS t13,
           CASE WHEN telefone ~ '^\+55[0-9]{2}9[0-9]{8}$' THEN substr(telefone, 2, 4) || substr(telefone, 7) END AS t12
    FROM public.ju_conversas WHERE id = p_conversa_id
  ),
  resp AS (                       -- pessoas dona(s) do telefone
    SELECT p.id, p.nome, t.codigo
    FROM conv JOIN public.pessoas p ON p.telefone::text IN (conv.t13, conv.t12)
    JOIN public.pessoa_tipos t ON t.id = p.id_tipo_pessoa
    WHERE p.ativo
      AND (t.codigo = 'responsavel'
           OR (t.codigo = 'paciente' AND p.data_nascimento <= current_date - interval '18 years'))
  ),
  escopo AS (                     -- paciente + finalidades
    SELECT x.paciente_id, bool_or(x.agenda) AS agenda, bool_or(x.financeiro) AS financeiro
    FROM (
      SELECT pr.id_pessoa AS paciente_id,
             pr.tipo_responsabilidade IN ('legal','ambos') AS agenda,
             pr.tipo_responsabilidade IN ('financeiro','ambos') AS financeiro
      FROM resp JOIN public.pessoa_responsaveis pr ON pr.id_responsavel = resp.id
      WHERE pr.ativo AND (pr.data_fim IS NULL OR pr.data_fim >= current_date)
      UNION ALL
      -- quem paga também vê o financeiro, mesmo vinculado só como "legal"
      SELECT pac.id, false, true
      FROM resp JOIN public.pessoas pac ON pac.responsavel_cobranca_id = resp.id
      UNION ALL
      SELECT id, true, true FROM resp WHERE codigo = 'paciente'
    ) x
    JOIN public.pessoas pac ON pac.id = x.paciente_id AND pac.ativo
    GROUP BY x.paciente_id
  )
  SELECT jsonb_build_object(
    'identificado', EXISTS (SELECT 1 FROM resp),
    'responsaveis', coalesce((SELECT jsonb_agg(split_part(btrim(nome), ' ', 1)) FROM resp), '[]'::jsonb),
    'responsavel_identificado', CASE WHEN (SELECT count(*) FROM resp) = 1 THEN (SELECT nome FROM resp) END,
    'pacientes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'paciente_id', pac.id,
        'nome', pac.nome,
        'idade_meses', (extract(year FROM age(pac.data_nascimento)) * 12
                        + extract(month FROM age(pac.data_nascimento)))::int,
        'acesso_agenda', e.agenda,
        'acesso_financeiro', e.financeiro,
        'proximas_consultas', CASE WHEN e.agenda THEN coalesce((
          SELECT jsonb_agg(jsonb_build_object(
                   'data_hora', to_char(a.data_hora AT TIME ZONE 'UTC', 'DD/MM HH24:MI'),
                   'servico', ts.nome,
                   'profissional', split_part(btrim(prof.nome), ' ', 1)) ORDER BY a.data_hora)
          FROM public.agendamentos a
          JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
          LEFT JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
          LEFT JOIN public.pessoas prof ON prof.id = a.profissional_id
          WHERE a.paciente_id = pac.id AND a.ativo AND cs.codigo IN ('agendado','confirmado')
            AND a.data_hora >= (now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC'
            AND a.data_hora <  (now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC' + interval '60 days'),
          '[]'::jsonb) END,
        'atendimentos_realizados', CASE WHEN e.agenda THEN coalesce((
          SELECT jsonb_agg(jsonb_build_object(
                   'agendamento_id', a.id,
                   'data', to_char(a.data_hora AT TIME ZONE 'UTC', 'DD/MM/YYYY'),
                   'periodo', CASE WHEN extract(hour FROM a.data_hora AT TIME ZONE 'UTC') < 12
                                   THEN 'matutino' ELSE 'vespertino' END,
                   'profissional', split_part(btrim(prof.nome), ' ', 1)) ORDER BY a.data_hora DESC)
          FROM public.agendamentos a
          JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
          LEFT JOIN public.pessoas prof ON prof.id = a.profissional_id
          WHERE a.paciente_id = pac.id AND a.ativo AND cs.codigo = 'finalizado'
            AND a.data_hora >= (now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC' - interval '60 days'
            AND a.data_hora <  (now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC'),
          '[]'::jsonb) END,
        'contrato', CASE WHEN e.agenda THEN (
          SELECT jsonb_build_object(
                   'status', uc.status_contrato,
                   -- link só enquanto não está assinado
                   'link_assinatura', CASE WHEN uc.status_contrato <> 'assinado' THEN nullif(btrim(pac.link_contrato), '') END)
          FROM public.user_contracts uc
          WHERE uc.pessoa_id = pac.id AND uc.ativo
          ORDER BY uc.data_geracao DESC NULLS LAST LIMIT 1) END,
        'cobrancas_em_aberto', CASE WHEN e.financeiro THEN coalesce((
          SELECT jsonb_agg(jsonb_build_object(
                   'pagamento_link_id', cp.pagamento_link_id,
                   'descricao', cp.descricao, 'valor', cp.valor, 'vencimento', cp.vencimento,
                   'situacao', cp.situacao,
                   'link_vencido', coalesce(cp.link_expirado, false),
                   -- só o link do nosso app e só válido; vencido -> renovar;
                   -- fatura direta do Asaas (sem token) -> financeiro
                   'link', CASE WHEN cp.token IS NOT NULL AND NOT coalesce(cp.link_expirado, false)
                                THEN 'https://app.respirakidsbrasilia.com.br/#/pagamento/' || cp.token END))
          FROM public.vw_cobrancas_pendentes cp WHERE cp.paciente_id = pac.id), '[]'::jsonb) END,
        'links_vencidos', CASE WHEN e.financeiro THEN coalesce((
          SELECT jsonb_agg(jsonb_build_object(
                   'pagamento_link_id', pl.id, 'descricao', pl.descricao,
                   'valor', pl.valor_base, 'vencimento', pl.vencimento))
          FROM public.pagamento_links pl
          WHERE pl.paciente_id = pac.id AND pl.ativo AND pl.fatura_id IS NULL AND pl.id_asaas IS NULL
            AND (pl.status = 'expirado' OR (pl.status = 'pendente' AND pl.expira_em < now()))), '[]'::jsonb) END,
        'pagamentos_ultimos_45_dias', CASE WHEN e.financeiro THEN coalesce((
          SELECT jsonb_agg(jsonb_build_object('valor', f.valor_total,
                                              'data', (f.pago_em AT TIME ZONE 'UTC')::date))
          FROM public.faturas f
          WHERE f.paciente_id = pac.id AND f.ativo AND f.status = 'pago'
            AND f.pago_em > now() - interval '45 days'), '[]'::jsonb) END,
        'notas_fiscais', CASE WHEN e.financeiro THEN coalesce((
          SELECT jsonb_agg(jsonb_build_object(
                   'descricao', f.descricao,
                   'valor', f.valor_total,
                   'pago_em', (f.pago_em AT TIME ZONE 'UTC')::date,
                   'link_nota', CASE WHEN f.link_nfe ~ '^https://'
                                      AND coalesce(f.status_nfe, '') !~* '(falha|retorno da prefeitura|erro)'
                                     THEN f.link_nfe END)
                 ORDER BY f.pago_em DESC)
          FROM public.faturas f
          WHERE f.paciente_id = pac.id AND f.ativo AND f.status = 'pago'
            AND f.pago_em > now() - interval '180 days'), '[]'::jsonb) END
      ) ORDER BY pac.nome)
      FROM escopo e JOIN public.pessoas pac ON pac.id = e.paciente_id), '[]'::jsonb)
  );
$$;


-- ---------------------------------------------------------------------
-- 3. Renovar link de pagamento vencido. Mesma regra da renovação
--    automática da régua de lembretes (pre_cobranca_lembretes_auto_renovacao):
--    só pré-cobrança saudável (sem fatura/Asaas, valor = soma das consultas
--    reservadas); estende a validade 30 dias e reabre o link. Não mexe em
--    valor nem vencimento (não há juros).
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_renovar_link_pagamento(p_conversa_id bigint, p_versao bigint, p_pagamento_link_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c       public.ju_conversas;
  v_ctx   jsonb;
  pl      public.pagamento_links;
  v_soma  numeric;
BEGIN
  SELECT * INTO c FROM public.ju_conversas WHERE id = p_conversa_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'CONVERSA_INEXISTENTE');
  ELSIF c.message_version <> p_versao THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'MENSAGEM_NOVA');
  ELSIF c.status <> 'ATIVA' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', c.status);
  END IF;

  -- o link precisa estar entre os vencidos que o próprio telefone enxerga
  v_ctx := public.fn_ju_contexto_cliente(p_conversa_id);
  IF NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_ctx -> 'pacientes') p,
                     jsonb_array_elements(coalesce(p -> 'links_vencidos', '[]'::jsonb)) l
       WHERE (p -> 'acesso_financeiro')::boolean
         AND (l ->> 'pagamento_link_id')::uuid = p_pagamento_link_id) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'LINK_FORA_DO_ESCOPO');
  END IF;

  SELECT * INTO pl FROM public.pagamento_links WHERE id = p_pagamento_link_id FOR UPDATE;
  SELECT coalesce(sum(a.valor_servico), 0) INTO v_soma
  FROM public.agendamentos a
  WHERE a.pagamento_link_id = pl.id AND a.ativo;

  IF NOT (pl.ativo AND pl.fatura_id IS NULL AND pl.id_asaas IS NULL
          AND pl.status IN ('pendente','expirado') AND pl.valor_base = v_soma) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'LINK_NAO_RENOVAVEL');
  END IF;

  UPDATE public.pagamento_links
     SET status = 'pendente', expira_em = now() + interval '30 days', atualizado_em = now()
   WHERE id = pl.id;

  RETURN jsonb_build_object(
    'ok', true,
    'link', 'https://app.respirakidsbrasilia.com.br/#/pagamento/' || pl.token,
    'valor', pl.valor_base,
    'descricao', pl.descricao,
    'valido_ate', to_char((now() + interval '30 days') AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'));
END;
$$;


-- ---------------------------------------------------------------------
-- 4. Agendas públicas ativas (a família escolhe o horário sozinha).
--    Sem agenda ativa, lista vazia: a Ju coleta preferência e encaminha.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_agendas_publicas()
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'titulo', ac.titulo,
           'profissional', split_part(btrim(p.nome), ' ', 1),
           'de', to_char(ac.data_inicio, 'DD/MM/YYYY'),
           'ate', to_char(ac.data_fim, 'DD/MM/YYYY'),
           'link', 'https://app.respirakidsbrasilia.com.br/#/agenda-publica/' || ac.token)
         ORDER BY ac.data_inicio), '[]'::jsonb)
  FROM public.agendas_compartilhadas ac
  LEFT JOIN public.pessoas p ON p.id = ac.profissional_id
  WHERE ac.ativo AND ac.token IS NOT NULL
    AND (ac.data_fim IS NULL OR ac.data_fim::date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date);
$$;


-- Só a service_role (n8n) executa.
REVOKE ALL ON FUNCTION
  public.fn_ju_renovar_link_pagamento(bigint, bigint, uuid),
  public.fn_ju_agendas_publicas()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.fn_ju_renovar_link_pagamento(bigint, bigint, uuid),
  public.fn_ju_agendas_publicas()
TO service_role;
