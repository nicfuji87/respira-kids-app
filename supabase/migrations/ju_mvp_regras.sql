-- =====================================================================
-- Ju (MVP): regras de 15/10/2026
--   - contrato: reenvio pela Assinafy (o link de assinatura não existe no
--     banco; pessoas.link_contrato é o PDF já assinado);
--   - nota fiscal: emitir a que não saiu, reemitir a que voltou com erro
--     (uma tentativa por fatura) e reenviar o link da que já saiu;
--   - link de pagamento vencido: renova por 5 dias (antes 30);
--   - agenda pública: só para quem já foi atendido alguma vez;
--   - atestado: a família confirma a sessão e quem acompanhou (um dos
--     responsáveis cadastrados do paciente);
--   - escalada ganha os tipos CONTRATO e NOTA_FISCAL.
-- =====================================================================
-- AI dev note: depende de ju_mvp.sql, ju_mvp_conteudo.sql e ju_mvp_acoes.sql.
-- As chamadas externas (Assinafy via send-contract-webhook, Asaas via
-- nfe-emitir-fatura) ficam no n8n; aqui só se decide se a ação é permitida e
-- se registra em ju_acoes, que é o que impede repetição e permite o
-- acompanhamento da nota depois.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Registro das ações da Ju (limite de repetição e acompanhamento)
-- ---------------------------------------------------------------------
CREATE TABLE public.ju_acoes (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversa_id  bigint NOT NULL REFERENCES public.ju_conversas(id) ON DELETE CASCADE,
  versao       bigint NOT NULL,
  tipo         text NOT NULL CHECK (tipo IN ('REENVIO_CONTRATO','NF_EMITIR','RENOVAR_LINK','ATESTADO')),
  alvo_id      uuid NOT NULL,              -- contrato, fatura, link ou agendamento
  status       text NOT NULL DEFAULT 'SOLICITADA'
               CHECK (status IN ('SOLICITADA','OK','FALHOU','CONCLUIDA','ESCALADA')),
  detalhe      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ju_acoes_idempotente UNIQUE (conversa_id, versao, tipo, alvo_id)  -- retry do n8n
);
CREATE INDEX ju_acoes_alvo_idx ON public.ju_acoes (tipo, alvo_id, created_at DESC);
ALTER TABLE public.ju_acoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_acoes FROM anon, authenticated;

ALTER TABLE public.ju_solicitacoes DROP CONSTRAINT ju_solicitacoes_tipo_check;
ALTER TABLE public.ju_solicitacoes ADD CONSTRAINT ju_solicitacoes_tipo_check
  CHECK (tipo IN ('AGENDAMENTO','REMARCACAO','CANCELAMENTO','FINANCEIRO','CONTRATO','NOTA_FISCAL',
                  'CLINICO','RECLAMACAO','HUMANO','OUTRO'));


-- ---------------------------------------------------------------------
-- 2. Contexto do cliente (mesma assinatura). Mudanças:
--    - contrato: {status: assinado|pendente|sem_contrato, reenviado_pela_ju_em};
--      sai o link_assinatura (link_contrato é o PDF assinado, não um link
--      para assinar);
--    - ja_atendido: alguma consulta finalizada, em qualquer data;
--    - responsaveis_do_paciente: quem pode constar no atestado;
--    - atendimentos_realizados: inclui a sessão de hoje cujo horário já
--      passou (a profissional costuma finalizar depois);
--    - notas_fiscais: fatura_id, situacao_nota e se a Ju já tentou emitir;
--    - links_vencidos e o resto sem mudança.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ju_contexto_cliente(p_conversa_id bigint)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH conv AS (
    SELECT telefone, substr(telefone, 2) AS t13,
           CASE WHEN telefone ~ '^\+55[0-9]{2}9[0-9]{8}$' THEN substr(telefone, 2, 4) || substr(telefone, 7) END AS t12,
           (now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC' AS agora   -- hora de parede
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
        'ja_atendido', CASE WHEN e.agenda THEN EXISTS (
          SELECT 1 FROM public.agendamentos a
          JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
          WHERE a.paciente_id = pac.id AND a.ativo AND cs.codigo = 'finalizado') END,
        'responsaveis_do_paciente', CASE WHEN e.agenda THEN coalesce((
          SELECT jsonb_agg(DISTINCT jsonb_build_object('responsavel_id', r.id, 'nome', r.nome))
          FROM public.pessoa_responsaveis pr
          JOIN public.pessoas r ON r.id = pr.id_responsavel AND r.ativo
          WHERE pr.id_pessoa = pac.id AND pr.ativo
            AND (pr.data_fim IS NULL OR pr.data_fim >= current_date)), '[]'::jsonb) END,
        'proximas_consultas', CASE WHEN e.agenda THEN coalesce((
          SELECT jsonb_agg(jsonb_build_object(
                   'data_hora', to_char(a.data_hora AT TIME ZONE 'UTC', 'DD/MM HH24:MI'),
                   'servico', ts.nome,
                   'profissional', split_part(btrim(prof.nome), ' ', 1)) ORDER BY a.data_hora)
          FROM public.agendamentos a
          JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
          LEFT JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
          LEFT JOIN public.pessoas prof ON prof.id = a.profissional_id
          CROSS JOIN conv
          WHERE a.paciente_id = pac.id AND a.ativo AND cs.codigo IN ('agendado','confirmado')
            AND a.data_hora >= conv.agora
            AND a.data_hora <  conv.agora + interval '60 days'),
          '[]'::jsonb) END,
        'atendimentos_realizados', CASE WHEN e.agenda THEN coalesce((
          SELECT jsonb_agg(jsonb_build_object(
                   'agendamento_id', a.id,
                   'data', to_char(a.data_hora AT TIME ZONE 'UTC', 'DD/MM/YYYY'),
                   'hora', to_char(a.data_hora AT TIME ZONE 'UTC', 'HH24:MI'),
                   'periodo', CASE WHEN extract(hour FROM a.data_hora AT TIME ZONE 'UTC') < 12
                                   THEN 'matutino' ELSE 'vespertino' END,
                   'profissional', split_part(btrim(prof.nome), ' ', 1)) ORDER BY a.data_hora DESC)
          FROM public.agendamentos a
          JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
          LEFT JOIN public.pessoas prof ON prof.id = a.profissional_id
          CROSS JOIN conv
          WHERE a.paciente_id = pac.id AND a.ativo AND a.data_hora < conv.agora
            AND (   (cs.codigo = 'finalizado' AND a.data_hora >= conv.agora - interval '60 days')
                 -- sessão de hoje que já começou e ainda não foi finalizada no sistema
                 OR (cs.codigo IN ('agendado','confirmado') AND a.data_hora::date = conv.agora::date))),
          '[]'::jsonb) END,
        'contrato', CASE WHEN e.agenda THEN coalesce((
          SELECT jsonb_build_object(
                   'status', CASE WHEN uc.status_contrato = 'assinado' THEN 'assinado' ELSE 'pendente' END,
                   'reenviado_pela_ju_em', (
                     SELECT to_char(max(ja.created_at) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
                     FROM public.ju_acoes ja
                     WHERE ja.tipo = 'REENVIO_CONTRATO' AND ja.alvo_id = uc.id AND ja.status = 'OK'))
          FROM public.user_contracts uc
          WHERE uc.pessoa_id = pac.id AND uc.ativo
          ORDER BY uc.data_geracao DESC NULLS LAST LIMIT 1),
          jsonb_build_object('status', 'sem_contrato')) END,
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
                   'fatura_id', n.id,
                   'descricao', n.descricao,
                   'valor', n.valor_total,
                   'pago_em', to_char(n.pago_em AT TIME ZONE 'UTC', 'DD/MM/YYYY'),
                   'situacao_nota', n.situacao,
                   'link_nota', CASE WHEN n.situacao = 'emitida' THEN n.link_nfe END,
                   'ju_ja_tentou_emitir', EXISTS (
                     SELECT 1 FROM public.ju_acoes ja
                     WHERE ja.tipo = 'NF_EMITIR' AND ja.alvo_id = n.id
                       AND NOT (ja.status = 'FALHOU' AND ja.detalhe IS NOT DISTINCT FROM 'SEM_CHAMADA')))
                 ORDER BY n.pago_em DESC)
          FROM (
            SELECT f.id, f.descricao, f.valor_total, f.pago_em, f.link_nfe,
                   CASE WHEN coalesce(f.status_nfe, '') ~* '(falha|retorno da prefeitura|erro)'
                          OR f.link_nfe = 'erro' THEN 'com_erro'
                        WHEN f.link_nfe ~ '^https://' THEN 'emitida'
                        WHEN f.link_nfe = 'sincronizando' THEN 'processando'
                        ELSE 'nao_emitida' END AS situacao
            FROM public.faturas f
            WHERE f.paciente_id = pac.id AND f.ativo AND f.status = 'pago'
              AND f.pago_em > now() - interval '180 days') n), '[]'::jsonb) END
      ) ORDER BY pac.nome)
      FROM escopo e JOIN public.pessoas pac ON pac.id = e.paciente_id), '[]'::jsonb)
  );
$$;


-- ---------------------------------------------------------------------
-- Gate comum das ações: conversa existe, versão é a do turno e a Ju está
-- ativa. Devolve NULL quando pode seguir, ou o motivo.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_gate(p_conversa_id bigint, p_versao bigint)
RETURNS text
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN c.id IS NULL THEN 'CONVERSA_INEXISTENTE'
              WHEN c.message_version <> p_versao THEN 'MENSAGEM_NOVA'
              WHEN c.status <> 'ATIVA' THEN c.status END
  FROM (SELECT 1) x LEFT JOIN public.ju_conversas c ON c.id = p_conversa_id;
$$;


-- ---------------------------------------------------------------------
-- 3. Link de pagamento vencido: mesma regra de antes, agora +5 dias.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ju_renovar_link_pagamento(p_conversa_id bigint, p_versao bigint, p_pagamento_link_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gate  text := public.fn_ju_gate(p_conversa_id, p_versao);
  v_ctx   jsonb;
  pl      public.pagamento_links;
  v_soma  numeric;
BEGIN
  IF v_gate IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', v_gate);
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
     SET status = 'pendente', expira_em = now() + interval '5 days', atualizado_em = now()
   WHERE id = pl.id;

  INSERT INTO public.ju_acoes (conversa_id, versao, tipo, alvo_id, status)
  VALUES (p_conversa_id, p_versao, 'RENOVAR_LINK', pl.id, 'OK')
  ON CONFLICT ON CONSTRAINT ju_acoes_idempotente DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'link', 'https://app.respirakidsbrasilia.com.br/#/pagamento/' || pl.token,
    'valor', pl.valor_base,
    'descricao', pl.descricao,
    'valido_ate', to_char((now() + interval '5 days') AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'));
END;
$$;


-- ---------------------------------------------------------------------
-- 4. Agenda pública: só para paciente cadastrado, com acesso de agenda
--    pelo telefone, que já foi atendido alguma vez. Senão, lista vazia.
-- ---------------------------------------------------------------------
DROP FUNCTION public.fn_ju_agendas_publicas();
CREATE FUNCTION public.fn_ju_agendas_publicas(p_conversa_id bigint)
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
    AND (ac.data_fim IS NULL OR ac.data_fim::date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(public.fn_ju_contexto_cliente(p_conversa_id) -> 'pacientes') x
      WHERE (x -> 'acesso_agenda')::boolean AND (x -> 'ja_atendido')::boolean);
$$;


-- ---------------------------------------------------------------------
-- 5. Reenvio do contrato pela Assinafy. A Ju só aponta o paciente; aqui se
--    confere escopo de agenda, contrato pendente e no máximo um reenvio da
--    Ju por contrato a cada 24 h. O n8n chama send-contract-webhook
--    (reenvio=true) com o contrato_id devolvido e depois fn_ju_acao_resultado.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_contrato_reenviar(p_conversa_id bigint, p_versao bigint, p_paciente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gate  text := public.fn_ju_gate(p_conversa_id, p_versao);
  uc      record;
  v_acao  bigint;
BEGIN
  IF v_gate IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', v_gate);
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(public.fn_ju_contexto_cliente(p_conversa_id) -> 'pacientes') x
       WHERE (x -> 'acesso_agenda')::boolean AND (x ->> 'paciente_id')::uuid = p_paciente_id) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'PACIENTE_FORA_DO_ESCOPO');
  END IF;

  SELECT u.id, u.status_contrato INTO uc
  FROM public.user_contracts u
  WHERE u.pessoa_id = p_paciente_id AND u.ativo
  ORDER BY u.data_geracao DESC NULLS LAST LIMIT 1;

  IF uc.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'SEM_CONTRATO');
  ELSIF uc.status_contrato = 'assinado' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'JA_ASSINADO');
  ELSIF EXISTS (SELECT 1 FROM public.ju_acoes
                WHERE tipo = 'REENVIO_CONTRATO' AND alvo_id = uc.id AND status IN ('SOLICITADA','OK')
                  AND created_at > now() - interval '24 hours') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'REENVIADO_HA_POUCO');
  END IF;

  INSERT INTO public.ju_acoes (conversa_id, versao, tipo, alvo_id)
  VALUES (p_conversa_id, p_versao, 'REENVIO_CONTRATO', uc.id)
  ON CONFLICT ON CONSTRAINT ju_acoes_idempotente DO NOTHING
  RETURNING id INTO v_acao;
  IF v_acao IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'JA_SOLICITADO');
  END IF;

  RETURN jsonb_build_object('ok', true, 'acao_id', v_acao, 'contrato_id', uc.id);
END;
$$;


-- ---------------------------------------------------------------------
-- 6. Nota fiscal: emitir a que não saiu ou reemitir a que deu erro.
--    Uma tentativa da Ju por fatura; a segunda vai para a secretaria.
--    O n8n chama a edge function nfe-emitir-fatura (mesma lógica do botão
--    "Corrigir e reemitir NFe") e depois fn_ju_acao_resultado.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_nf_emitir(p_conversa_id bigint, p_versao bigint, p_fatura_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gate  text := public.fn_ju_gate(p_conversa_id, p_versao);
  v_nota  jsonb;
  v_acao  bigint;
BEGIN
  IF v_gate IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', v_gate);
  END IF;

  SELECT n INTO v_nota
  FROM jsonb_array_elements(public.fn_ju_contexto_cliente(p_conversa_id) -> 'pacientes') x,
       jsonb_array_elements(coalesce(x -> 'notas_fiscais', '[]'::jsonb)) n
  WHERE (x -> 'acesso_financeiro')::boolean AND (n ->> 'fatura_id')::uuid = p_fatura_id
  LIMIT 1;

  IF v_nota IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'FATURA_FORA_DO_ESCOPO');
  ELSIF v_nota ->> 'situacao_nota' NOT IN ('nao_emitida','com_erro') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'NOTA_' || upper(v_nota ->> 'situacao_nota'));
  ELSIF (v_nota -> 'ju_ja_tentou_emitir')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'JA_TENTADA');
  END IF;

  INSERT INTO public.ju_acoes (conversa_id, versao, tipo, alvo_id)
  VALUES (p_conversa_id, p_versao, 'NF_EMITIR', p_fatura_id)
  ON CONFLICT ON CONSTRAINT ju_acoes_idempotente DO NOTHING
  RETURNING id INTO v_acao;
  IF v_acao IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'JA_SOLICITADO');
  END IF;

  RETURN jsonb_build_object('ok', true, 'acao_id', v_acao, 'fatura_id', p_fatura_id);
END;
$$;


-- ---------------------------------------------------------------------
-- 7. Resultado da chamada externa (n8n). FALHOU com detalhe 'SEM_CHAMADA'
--    = a chamada nem chegou ao serviço (não conta como tentativa).
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_acao_resultado(p_acao_id bigint, p_ok boolean, p_detalhe text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.ju_acoes
     SET status = CASE WHEN p_ok THEN 'OK' ELSE 'FALHOU' END,
         detalhe = left(p_detalhe, 1000), updated_at = now()
   WHERE id = p_acao_id AND status = 'SOLICITADA';
$$;


-- ---------------------------------------------------------------------
-- 8. Acompanhamento das notas pedidas pela Ju. A autorização é assíncrona:
--    o Asaas aceita, a prefeitura responde depois e o webhook do Asaas grava
--    link_nfe. Roda pelo n8n a cada 15 min:
--    - nota saiu -> CONCLUIDA (o sistema já envia a nota à família);
--    - voltou com erro -> ESCALADA: cria a solicitação para a secretaria,
--      tira a Ju da conversa e devolve os dados para etiqueta e aviso.
--    A solicitação usa versao = -acao_id para não colidir com a escalada
--    normal (UNIQUE conversa_id, versao).
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_nf_acompanhar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r      record;
  v_out  jsonb := '[]'::jsonb;
  v_sol  bigint;
BEGIN
  UPDATE public.ju_acoes ja
     SET status = 'CONCLUIDA', updated_at = now()
    FROM public.faturas f
   WHERE ja.tipo = 'NF_EMITIR' AND ja.status = 'OK' AND f.id = ja.alvo_id
     AND f.link_nfe ~ '^https://'
     AND coalesce(f.status_nfe, '') !~* '(falha|retorno da prefeitura|erro)';

  FOR r IN
    SELECT ja.id AS acao_id, ja.conversa_id, c.chatwoot_conversation_id, c.telefone,
           f.paciente_id, pac.nome AS paciente_nome, f.descricao, f.status_nfe
    FROM public.ju_acoes ja
    JOIN public.faturas f ON f.id = ja.alvo_id
    JOIN public.ju_conversas c ON c.id = ja.conversa_id
    LEFT JOIN public.pessoas pac ON pac.id = f.paciente_id
    WHERE ja.tipo = 'NF_EMITIR' AND ja.status = 'OK'
      AND ja.created_at > now() - interval '7 days'
      AND (f.link_nfe = 'erro' OR coalesce(f.status_nfe, '') ~* '(falha|retorno da prefeitura)')
    FOR UPDATE OF ja SKIP LOCKED
  LOOP
    INSERT INTO public.ju_solicitacoes (conversa_id, versao, paciente_id, tipo, setor, resumo)
    VALUES (r.conversa_id, -r.acao_id, r.paciente_id, 'NOTA_FISCAL', 'SECRETARIA',
            left('A nota fiscal que a Ju pediu voltou com erro de novo. Fatura: ' || coalesce(r.descricao, '-')
                 || '. Retorno: ' || coalesce(r.status_nfe, 'sem detalhe'), 2000))
    ON CONFLICT (conversa_id, versao) DO NOTHING
    RETURNING id INTO v_sol;

    UPDATE public.ju_acoes SET status = 'ESCALADA', detalhe = left(r.status_nfe, 1000), updated_at = now()
     WHERE id = r.acao_id;
    UPDATE public.ju_conversas SET status = 'AGUARDANDO_EQUIPE', pause_until = NULL, updated_at = now()
     WHERE id = r.conversa_id AND status <> 'AGUARDANDO_EQUIPE';

    v_out := v_out || jsonb_build_object(
      'solicitacao_id', v_sol,
      'chatwoot_conversation_id', r.chatwoot_conversation_id,
      'telefone', r.telefone,
      'paciente_nome', r.paciente_nome,
      'tipo', 'NOTA_FISCAL',
      'resumo', 'A nota fiscal que a Ju pediu voltou com erro de novo. Fatura: ' || coalesce(r.descricao, '-')
                || '. Retorno: ' || coalesce(r.status_nfe, 'sem detalhe'));
  END LOOP;

  RETURN v_out;
END;
$$;


-- ---------------------------------------------------------------------
-- 9. Atestado: a família confirma a sessão e quem acompanhou. O nome do
--    atestado é um dos responsáveis cadastrados do paciente (a IA escolhe o
--    id da lista responsaveis_do_paciente; nunca texto livre).
-- ---------------------------------------------------------------------
DROP FUNCTION public.fn_ju_atestado_dados(bigint, bigint, uuid);
CREATE FUNCTION public.fn_ju_atestado_dados(p_conversa_id bigint, p_versao bigint,
                                            p_agendamento_id uuid, p_responsavel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gate   text := public.fn_ju_gate(p_conversa_id, p_versao);
  v_pac    jsonb;
  v_resp   text;
  a        record;
  v_assin  jsonb;
BEGIN
  IF v_gate IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', v_gate);
  END IF;

  -- o agendamento precisa estar na lista que o próprio telefone enxerga
  SELECT p INTO v_pac
  FROM jsonb_array_elements(public.fn_ju_contexto_cliente(p_conversa_id) -> 'pacientes') p
  WHERE (p -> 'acesso_agenda')::boolean
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(p -> 'atendimentos_realizados') r
                WHERE (r ->> 'agendamento_id')::uuid = p_agendamento_id)
  LIMIT 1;
  IF v_pac IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'AGENDAMENTO_FORA_DO_ESCOPO');
  END IF;

  SELECT r ->> 'nome' INTO v_resp
  FROM jsonb_array_elements(v_pac -> 'responsaveis_do_paciente') r
  WHERE (r ->> 'responsavel_id')::uuid = p_responsavel_id;
  IF v_resp IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'RESPONSAVEL_NAO_CADASTRADO');
  END IF;

  SELECT ag.data_hora, ag.profissional_id INTO a
  FROM public.agendamentos ag WHERE ag.id = p_agendamento_id;

  SELECT jsonb_build_object('nome', pa.nome_exibicao, 'arquivo', pa.arquivo,
                            'titulo', pa.titulo, 'crefito', coalesce(pa.crefito, ''))
    INTO v_assin
  FROM public.profissional_assinaturas pa
  WHERE pa.pessoa_id = a.profissional_id AND pa.ativo;
  IF v_assin IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'PROFISSIONAL_SEM_ASSINATURA');
  END IF;

  INSERT INTO public.ju_acoes (conversa_id, versao, tipo, alvo_id, status)
  VALUES (p_conversa_id, p_versao, 'ATESTADO', p_agendamento_id, 'OK')
  ON CONFLICT ON CONSTRAINT ju_acoes_idempotente DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'agendamento_id', p_agendamento_id,
    'paciente_id', v_pac ->> 'paciente_id',
    'paciente_nome', v_pac ->> 'nome',
    'responsavel_nome', v_resp,
    'data_consulta', to_char(a.data_hora AT TIME ZONE 'UTC', 'DD/MM/YYYY'),
    'periodo', CASE WHEN extract(hour FROM a.data_hora AT TIME ZONE 'UTC') < 12 THEN 'matutino' ELSE 'vespertino' END,
    'data_emissao', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'),
    'assinatura', v_assin);
END;
$$;


-- ---------------------------------------------------------------------
-- 10. Base de conhecimento
-- ---------------------------------------------------------------------
INSERT INTO public.ju_conhecimento (id, categoria, texto) VALUES
('CONTRATO_ASSINATURA', 'DOCUMENTOS',
 'Todo paciente precisa ter o contrato de prestação de serviços assinado. O contrato é enviado pela Assinafy, a plataforma de assinatura digital, que manda a mensagem de um número próprio dela (não é o número da Respira Kids) e também por e-mail. Quando a sessão é agendada e o contrato ainda não foi assinado, o sistema manda uma mensagem automática dizendo que a sessão não poderá ser realizada. Essa mensagem é automática: a sessão pode acontecer normalmente e a equipe ajuda a regularizar o contrato. A Ju pode pedir à Assinafy que reenvie o contrato. Ela não altera dados do contrato; correções de nome, CPF, endereço ou valores ficam com a secretaria.'),
('NOTA_FISCAL', 'DOCUMENTOS',
 'A nota fiscal é emitida para consultas já pagas. A Ju pode reenviar o link de uma nota já emitida, pedir a emissão de uma nota que ainda não saiu ou pedir a reemissão de uma nota que voltou com erro. A emissão depende da prefeitura e pode levar algum tempo; quando a nota sai, o sistema envia para a família. A Ju não promete prazo. Se a nota voltar com erro de novo, a secretaria assume.'),
('PAGAMENTO_APOS_VENCIMENTO', 'FINANCEIRO',
 'É possível pagar depois do vencimento, sem juros. Se o link de pagamento do sistema estiver vencido, a Ju pode renovar o mesmo link (mesmo valor) por mais 5 dias e enviá-lo de novo. Cobrança que o sistema não deixa renovar, ou sem link do sistema, vai para a secretaria. A Ju nunca gera cobrança nova.'),
('AGENDA_PUBLICA', 'ATENDIMENTO',
 'Quando o sistema informar uma agenda pública ativa, a Ju pode enviar o link para a família escolher um horário disponível, mas só para paciente já cadastrado que já foi atendido alguma vez. A Ju não escolhe, não sugere e não confirma horário. Sem agenda pública disponível para a família, a Ju coleta a preferência e encaminha à secretaria.'),
('ATESTADO_COMPARECIMENTO', 'DOCUMENTOS',
 'A Ju pode gerar atestado de comparecimento de uma sessão que já aconteceu (inclusive a de hoje, depois do horário dela). Antes de gerar, ela sempre confirma com a família qual foi a sessão e qual responsável acompanhou a criança. O nome no atestado precisa ser de um responsável cadastrado do paciente. Pedido em nome de outra pessoa, para sessão que não aconteceu ou com qualquer alteração no texto vai para a secretaria.'),
('COBRANCAS', 'FINANCEIRO',
 'A Ju não gera cobranças. Pedido de cobrança nova, segunda via com outro valor, troca de forma de pagamento, parcelamento ou negociação vai para a secretaria.')
ON CONFLICT (id) DO UPDATE
   SET categoria = EXCLUDED.categoria, texto = EXCLUDED.texto, ativo = true, updated_at = now();


-- Só a service_role (n8n) executa.
REVOKE ALL ON FUNCTION
  public.fn_ju_gate(bigint, bigint),
  public.fn_ju_agendas_publicas(bigint),
  public.fn_ju_contrato_reenviar(bigint, bigint, uuid),
  public.fn_ju_nf_emitir(bigint, bigint, uuid),
  public.fn_ju_acao_resultado(bigint, boolean, text),
  public.fn_ju_nf_acompanhar(),
  public.fn_ju_atestado_dados(bigint, bigint, uuid, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.fn_ju_gate(bigint, bigint),
  public.fn_ju_agendas_publicas(bigint),
  public.fn_ju_contrato_reenviar(bigint, bigint, uuid),
  public.fn_ju_nf_emitir(bigint, bigint, uuid),
  public.fn_ju_acao_resultado(bigint, boolean, text),
  public.fn_ju_nf_acompanhar(),
  public.fn_ju_atestado_dados(bigint, bigint, uuid, uuid)
TO service_role;
-- fn_ju_contexto_cliente e fn_ju_renovar_link_pagamento: CREATE OR REPLACE mantém os privilégios.
