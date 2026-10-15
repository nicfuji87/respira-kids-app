-- @ju no grupo de notas: cadastrar chave Pix de fornecedor, preparar Pix e listar contas.
--
-- O Pix NÃO sai pelo WhatsApp. A Ju prepara um pedido (pix_solicitacoes) e manda no grupo
-- o link do app; um admin logado abre e toca "Pagar", e o app chama a inter-pagar como
-- sempre (só admin, tetos, auditoria). Depois um fluxo do n8n avisa o grupo.
-- Decisão do dono em 15/10/2026, depois que a execução direta pelo WhatsApp foi barrada.

ALTER TABLE public.fornecedores
  ADD COLUMN IF NOT EXISTS chave_pix text,
  ADD COLUMN IF NOT EXISTS chave_pix_atualizada_em timestamptz,
  ADD COLUMN IF NOT EXISTS chave_pix_origem text;

ALTER TABLE public.inter_pagamentos
  ADD COLUMN IF NOT EXISTS lancamento_id uuid REFERENCES public.lancamentos_financeiros(id);

CREATE TABLE IF NOT EXISTS public.pix_solicitacoes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id      uuid NOT NULL REFERENCES public.lancamentos_financeiros(id),
  fornecedor_id      uuid REFERENCES public.fornecedores(id),
  valor              numeric NOT NULL CHECK (valor > 0),
  chave_pix          text NOT NULL,
  favorecido         text,
  descricao          text,
  status             text NOT NULL DEFAULT 'aguardando'
                     CHECK (status IN ('aguardando', 'pagando', 'pago', 'erro', 'cancelado', 'expirado')),
  solicitante        text,
  chatid             text,
  messageid          text,
  expira_em          timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  aprovado_por       uuid REFERENCES public.pessoas(id),
  iniciado_em        timestamptz,
  concluido_em       timestamptz,
  inter_pagamento_id uuid REFERENCES public.inter_pagamentos(id),
  erro               text,
  notificado_em      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- um pedido vivo por conta: dois "@ju paga" seguidos não geram dois links
CREATE UNIQUE INDEX IF NOT EXISTS ux_pix_solicitacoes_lancamento_vivo
  ON public.pix_solicitacoes (lancamento_id)
  WHERE status IN ('aguardando', 'pagando', 'pago');

ALTER TABLE public.pix_solicitacoes ENABLE ROW LEVEL SECURITY;
-- sem policy: o app só acessa pelas funções abaixo, que conferem admin

-- ---------------------------------------------------------------------------
-- n8n (service_role)
-- ---------------------------------------------------------------------------

-- Cadastra (ou troca) a chave Pix do fornecedor citado pelo nome.
CREATE OR REPLACE FUNCTION public.fn_ju_cadastrar_pix(
  p_fornecedor text,
  p_chave text,
  p_solicitante text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_chave    text := nullif(trim(coalesce(p_chave, '')), '');
  v_cands    jsonb;
  v_top      record;
  v_segundo  numeric;
  v_anterior text;
BEGIN
  IF v_chave IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Faltou a chave Pix');
  END IF;
  -- chave numérica (CPF, CNPJ, telefone) guarda só os dígitos; e-mail e aleatória ficam como vieram
  IF v_chave ~ '^[0-9 ().+/-]+$' THEN
    v_chave := regexp_replace(v_chave, '[^0-9]', '', 'g');
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('nome', s.nome, 'score', s.score) ORDER BY s.score DESC), '[]'::jsonb)
  INTO v_cands
  FROM public.fn_financeiro_sugerir_fornecedor(NULL, p_fornecedor) s;

  SELECT s.* INTO v_top FROM public.fn_financeiro_sugerir_fornecedor(NULL, p_fornecedor) s ORDER BY s.score DESC LIMIT 1;
  SELECT s.score INTO v_segundo FROM public.fn_financeiro_sugerir_fornecedor(NULL, p_fornecedor) s ORDER BY s.score DESC OFFSET 1 LIMIT 1;

  IF v_top.fornecedor_id IS NULL OR v_top.score < 0.5 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Não achei o fornecedor "' || coalesce(p_fornecedor, '') || '" no cadastro', 'candidatos', v_cands);
  END IF;
  IF v_segundo IS NOT NULL AND v_top.score - v_segundo < 0.1 AND v_top.score < 1 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Tem mais de um fornecedor parecido com "' || p_fornecedor || '"', 'candidatos', v_cands);
  END IF;

  SELECT chave_pix INTO v_anterior FROM public.fornecedores WHERE id = v_top.fornecedor_id;

  UPDATE public.fornecedores
  SET chave_pix = v_chave,
      chave_pix_atualizada_em = now(),
      chave_pix_origem = 'WhatsApp @ju' || coalesce(' por ' || nullif(p_solicitante, ''), '')
  WHERE id = v_top.fornecedor_id;

  RETURN jsonb_build_object('ok', true, 'fornecedor_id', v_top.fornecedor_id, 'fornecedor_nome', v_top.nome,
    'chave', v_chave, 'chave_anterior', v_anterior);
END;
$$;

-- "@ju paga ...": acha a conta (nota citada, fornecedor citado ou nota da mesma pessoa
-- na última hora) e cria o pedido de Pix. Não paga nada.
CREATE OR REPLACE FUNCTION public.fn_ju_preparar_pix(
  p_lancamento_id uuid DEFAULT NULL,
  p_fornecedor text DEFAULT NULL,
  p_sender text DEFAULT NULL,
  p_valor numeric DEFAULT NULL,
  p_solicitante text DEFAULT NULL,
  p_chatid text DEFAULT NULL,
  p_messageid text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_forn   uuid;
  v_score  numeric;
  v_ids    uuid[];
  l        record;
  v_valor  numeric;
  v_cands  jsonb;
  s        record;
BEGIN
  IF p_lancamento_id IS NOT NULL THEN
    v_ids := ARRAY[p_lancamento_id];
  ELSE
    IF nullif(trim(coalesce(p_fornecedor, '')), '') IS NOT NULL THEN
      SELECT x.fornecedor_id, x.score INTO v_forn, v_score
      FROM public.fn_financeiro_sugerir_fornecedor(NULL, p_fornecedor) x ORDER BY x.score DESC LIMIT 1;
      IF v_forn IS NULL OR v_score < 0.5 THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Não achei o fornecedor "' || p_fornecedor || '" no cadastro');
      END IF;
    END IF;

    -- em aberto: pré-lançamento não pago ou lançamento validado com parcela pendente
    SELECT array_agg(x.id ORDER BY x.created_at DESC) INTO v_ids
    FROM (
      SELECT l2.id, l2.created_at
      FROM public.lancamentos_financeiros l2
      WHERE l2.tipo_lancamento = 'despesa'
        AND l2.status_lancamento <> 'cancelado'
        AND NOT l2.pago
        AND (l2.status_lancamento = 'pre_lancamento'
             OR EXISTS (SELECT 1 FROM public.contas_pagar cp WHERE cp.lancamento_id = l2.id AND cp.status_pagamento = 'pendente'))
        AND (
          (v_forn IS NOT NULL AND l2.fornecedor_id = v_forn)
          OR (v_forn IS NULL AND nullif(p_sender, '') IS NOT NULL
              AND l2.dados_ia #>> '{whatsapp,sender}' = p_sender
              AND l2.created_at >= now() - interval '60 minutes')
        )
        AND (p_valor IS NULL OR abs(l2.valor_total - p_valor) < 0.01)
    ) x;

    IF coalesce(array_length(v_ids, 1), 0) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'erro',
        CASE WHEN v_forn IS NOT NULL THEN 'Não achei conta em aberto desse fornecedor'
             ELSE 'Não sei qual conta pagar. Responda em cima da mensagem da nota ou diga o fornecedor.' END);
    END IF;
    IF array_length(v_ids, 1) > 1 THEN
      SELECT jsonb_agg(jsonb_build_object('descricao', l3.descricao, 'valor', l3.valor_total, 'data', l3.data_emissao)
                       ORDER BY l3.data_emissao)
      INTO v_cands FROM public.lancamentos_financeiros l3 WHERE l3.id = ANY (v_ids);
      RETURN jsonb_build_object('ok', false, 'erro', 'Tem mais de uma conta em aberto. Diga o valor ou responda em cima da nota.',
        'candidatos', v_cands);
    END IF;
  END IF;

  SELECT lf.*, coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social) AS forn_nome, f.chave_pix
  INTO l
  FROM public.lancamentos_financeiros lf
  LEFT JOIN public.fornecedores f ON f.id = lf.fornecedor_id
  WHERE lf.id = v_ids[1];

  IF NOT FOUND OR l.status_lancamento = 'cancelado' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Conta não encontrada');
  END IF;
  IF l.pago THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Essa conta já está paga');
  END IF;
  IF l.fornecedor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'A nota está sem fornecedor identificado. Ajuste no sistema ou diga o fornecedor.');
  END IF;
  IF nullif(l.chave_pix, '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'sem_chave', true, 'fornecedor_nome', l.forn_nome,
      'erro', l.forn_nome || ' não tem chave Pix cadastrada. Mande: @ju cadastre o pix da ' || l.forn_nome || ' <chave>');
  END IF;

  -- valor: o da parcela pendente, se já validado; senão o da nota
  SELECT cp.valor_parcela INTO v_valor
  FROM public.contas_pagar cp
  WHERE cp.lancamento_id = l.id AND cp.status_pagamento = 'pendente'
  ORDER BY cp.numero_parcela LIMIT 1;
  v_valor := coalesce(v_valor, l.valor_total);

  IF p_valor IS NOT NULL AND abs(p_valor - v_valor) >= 0.01 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'O valor pedido (R$ ' || p_valor || ') é diferente do valor da conta (R$ ' || v_valor || ')');
  END IF;

  -- pedido vivo para a mesma conta: devolve o mesmo link (expira os vencidos antes)
  UPDATE public.pix_solicitacoes SET status = 'expirado'
  WHERE lancamento_id = l.id AND status = 'aguardando' AND expira_em < now();

  SELECT * INTO s FROM public.pix_solicitacoes
  WHERE lancamento_id = l.id AND status IN ('aguardando', 'pagando', 'pago', 'erro')
  ORDER BY (status = 'erro'), created_at DESC LIMIT 1;

  -- pedido que falhou volta a valer (mesmo link), em vez de nascer um segundo link pagável
  IF FOUND AND s.status = 'erro' THEN
    UPDATE public.pix_solicitacoes
    SET status = 'aguardando', expira_em = now() + interval '24 hours', erro = NULL, iniciado_em = NULL,
        aprovado_por = NULL, notificado_em = NULL, valor = v_valor, chave_pix = l.chave_pix,
        solicitante = coalesce(p_solicitante, solicitante), chatid = coalesce(p_chatid, chatid),
        messageid = coalesce(p_messageid, messageid)
    WHERE id = s.id
    RETURNING * INTO s;
  END IF;

  IF FOUND AND s.status = 'pago' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Essa conta já foi paga pelo Inter');
  END IF;
  IF FOUND AND s.status = 'pagando' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'O Pix dessa conta está sendo enviado agora');
  END IF;

  IF NOT FOUND THEN
    INSERT INTO public.pix_solicitacoes (lancamento_id, fornecedor_id, valor, chave_pix, favorecido, descricao,
                                         solicitante, chatid, messageid)
    VALUES (l.id, l.fornecedor_id, v_valor, l.chave_pix, l.forn_nome, l.descricao,
            p_solicitante, p_chatid, p_messageid)
    RETURNING * INTO s;
  END IF;

  RETURN jsonb_build_object('ok', true, 'solicitacao_id', s.id, 'lancamento_id', l.id, 'descricao', l.descricao,
    'valor', s.valor, 'fornecedor_nome', l.forn_nome, 'chave', s.chave_pix, 'expira_em', s.expira_em,
    'repetido', s.created_at < now() - interval '5 seconds');
END;
$$;

-- "@ju o que tem pra pagar": contas em aberto até p_dias à frente (e as atrasadas).
CREATE OR REPLACE FUNCTION public.fn_ju_contas_a_pagar(p_dias integer DEFAULT 7)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH abertas AS (
    SELECT l.descricao, cp.valor_parcela AS valor, cp.data_vencimento AS vence, false AS pre
    FROM public.contas_pagar cp
    JOIN public.lancamentos_financeiros l ON l.id = cp.lancamento_id
    WHERE cp.status_pagamento = 'pendente' AND l.tipo_lancamento = 'despesa'
      AND l.status_lancamento = 'validado'
      AND cp.data_vencimento <= (now() AT TIME ZONE 'America/Sao_Paulo')::date + greatest(p_dias, 0)
    UNION ALL
    SELECT l.descricao, l.valor_total, coalesce(l.data_vencimento, l.data_emissao), true
    FROM public.lancamentos_financeiros l
    WHERE l.status_lancamento = 'pre_lancamento' AND l.origem_lancamento = 'api_ia'
      AND l.tipo_lancamento = 'despesa' AND NOT l.pago
  )
  SELECT jsonb_build_object(
    'total', coalesce(sum(valor), 0),
    'itens', coalesce(jsonb_agg(jsonb_build_object('descricao', descricao, 'valor', valor, 'vence', vence, 'pre', pre)
                                ORDER BY vence), '[]'::jsonb))
  FROM abertas;
$$;

-- Fluxo de aviso (a cada minuto): resolve Pix que ficou "pagando" (app fechou no meio)
-- olhando a auditoria do Inter e devolve o que precisa ser avisado no grupo.
CREATE OR REPLACE FUNCTION public.fn_pix_solicitacoes_para_avisar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  s  record;
  ip record;
BEGIN
  FOR s IN SELECT * FROM public.pix_solicitacoes WHERE status = 'pagando' AND iniciado_em < now() - interval '3 minutes'
  LOOP
    SELECT * INTO ip FROM public.inter_pagamentos
    WHERE tipo = 'pix' AND chave_pix = s.chave_pix AND abs(valor - s.valor) < 0.01
      AND criado_em >= s.iniciado_em - interval '1 minute'
      AND solicitado_por IS NOT DISTINCT FROM s.aprovado_por
    ORDER BY criado_em DESC LIMIT 1;

    IF FOUND AND ip.status = 'sucesso' THEN
      PERFORM public.fn_pix_registrar_pago(s.id, ip.id);
    ELSIF FOUND AND ip.status = 'erro' THEN
      UPDATE public.pix_solicitacoes SET status = 'erro', erro = ip.erro, concluido_em = now() WHERE id = s.id;
    ELSIF NOT FOUND AND s.iniciado_em < now() - interval '10 minutes' THEN
      -- o app travou antes de chamar o Inter: nada saiu, libera para tentar de novo
      UPDATE public.pix_solicitacoes SET status = 'aguardando', iniciado_em = NULL, aprovado_por = NULL WHERE id = s.id;
    END IF;
  END LOOP;

  UPDATE public.pix_solicitacoes SET status = 'expirado'
  WHERE status = 'aguardando' AND expira_em < now();

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', ps.id, 'status', ps.status, 'valor', ps.valor, 'favorecido', ps.favorecido,
      'chatid', ps.chatid, 'messageid', ps.messageid, 'erro', ps.erro,
      'aprovado_por', (SELECT p.nome FROM public.pessoas p WHERE p.id = ps.aprovado_por)))
    FROM public.pix_solicitacoes ps
    WHERE ps.status IN ('pago', 'erro', 'expirado') AND ps.notificado_em IS NULL AND ps.chatid IS NOT NULL
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_pix_solicitacao_marcar_avisada(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  UPDATE public.pix_solicitacoes SET notificado_em = now() WHERE id = p_id;
$$;

-- ---------------------------------------------------------------------------
-- Baixa (interno): parcela pendente vira paga na conta Inter; pré-lançamento fica
-- pago e guarda data/conta para a parcela nascer certa quando o app validar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_pix_registrar_pago(p_solicitacao_id uuid, p_inter_pagamento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  s       record;
  v_inter uuid;
  v_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_parc  uuid;
  v_nota  text;
  v_quem  text;
BEGIN
  SELECT * INTO s FROM public.pix_solicitacoes WHERE id = p_solicitacao_id FOR UPDATE;
  IF NOT FOUND OR s.status = 'pago' THEN
    RETURN;
  END IF;

  SELECT id INTO v_inter FROM public.contas_bancarias WHERE banco_codigo = '077' AND ativo LIMIT 1;
  SELECT nome INTO v_quem FROM public.pessoas WHERE id = s.aprovado_por;

  UPDATE public.pix_solicitacoes
  SET status = 'pago', inter_pagamento_id = p_inter_pagamento_id, concluido_em = now(), erro = NULL
  WHERE id = s.id;

  UPDATE public.inter_pagamentos SET lancamento_id = s.lancamento_id
  WHERE id = p_inter_pagamento_id AND lancamento_id IS NULL;

  v_nota := 'Pago por: Inter da Clínica (Pix em ' || to_char(v_hoje, 'DD/MM/YYYY')
            || coalesce(', pedido pela @ju por ' || nullif(s.solicitante, ''), '')
            || coalesce(', aprovado por ' || v_quem, '') || ').';

  SELECT cp.id INTO v_parc
  FROM public.contas_pagar cp
  WHERE cp.lancamento_id = s.lancamento_id AND cp.status_pagamento = 'pendente'
  ORDER BY cp.numero_parcela LIMIT 1;

  IF v_parc IS NOT NULL THEN
    UPDATE public.contas_pagar
    SET status_pagamento = 'pago', data_pagamento = v_hoje,
        valor_pago = valor_parcela, valor_final = valor_parcela,
        conta_bancaria_id = v_inter, pago_por = s.aprovado_por,
        observacoes = concat_ws(' ', observacoes, 'Pix pelo Inter pedido pela @ju.')
    WHERE id = v_parc;
  ELSE
    UPDATE public.lancamentos_financeiros
    SET pago = true,
        dados_ia = coalesce(dados_ia, '{}'::jsonb) || jsonb_build_object('pagamento', jsonb_build_object(
          'conta_bancaria_id', v_inter, 'data', v_hoje, 'inter_pagamento_id', p_inter_pagamento_id,
          'pago_por', s.aprovado_por, 'via', 'ju_whatsapp'))
    WHERE id = s.lancamento_id;
  END IF;

  UPDATE public.lancamentos_financeiros
  SET observacoes = CASE
        WHEN coalesce(observacoes, '') LIKE '%Pago por: não informado.%' THEN replace(observacoes, 'Pago por: não informado.', v_nota)
        WHEN coalesce(observacoes, '') LIKE '%Situação: a pagar (ainda não pago).%' THEN replace(observacoes, 'Situação: a pagar (ainda não pago).', v_nota)
        ELSE concat_ws(' ', observacoes, v_nota) END
  WHERE id = s.lancamento_id;
END;
$$;

-- Pré-lançamento pago pela @ju: quando o app valida e cria a parcela já paga, ela herda
-- a data e a conta reais do Pix (o app usaria a data da validação e nenhuma conta).
CREATE OR REPLACE FUNCTION public.fn_trg_parcela_herda_pagamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pag jsonb;
BEGIN
  IF NEW.status_pagamento = 'pago' THEN
    SELECT dados_ia -> 'pagamento' INTO v_pag FROM public.lancamentos_financeiros WHERE id = NEW.lancamento_id;
    IF v_pag IS NOT NULL THEN
      NEW.data_pagamento := coalesce((v_pag ->> 'data')::date, NEW.data_pagamento);
      NEW.conta_bancaria_id := coalesce(NEW.conta_bancaria_id, (v_pag ->> 'conta_bancaria_id')::uuid);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parcela_herda_pagamento ON public.contas_pagar;
CREATE TRIGGER trg_parcela_herda_pagamento
  BEFORE INSERT ON public.contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_parcela_herda_pagamento();

-- ---------------------------------------------------------------------------
-- App (admin logado)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_pix_solicitacao_obter(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.fn_rls_admin_aprovado_ativo() THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;

  UPDATE public.pix_solicitacoes SET status = 'expirado'
  WHERE id = p_id AND status = 'aguardando' AND expira_em < now();

  RETURN (
    SELECT jsonb_build_object(
      'id', s.id, 'status', s.status, 'valor', s.valor, 'chave_pix', s.chave_pix,
      'favorecido', s.favorecido, 'descricao', s.descricao, 'solicitante', s.solicitante,
      'expira_em', s.expira_em, 'created_at', s.created_at, 'concluido_em', s.concluido_em,
      'erro', s.erro, 'lancamento_id', s.lancamento_id,
      'fornecedor_cnpj', f.cpf_cnpj,
      'chave_pix_origem', f.chave_pix_origem,
      'chave_pix_atualizada_em', f.chave_pix_atualizada_em,
      'aprovado_por', (SELECT p.nome FROM public.pessoas p WHERE p.id = s.aprovado_por))
    FROM public.pix_solicitacoes s
    LEFT JOIN public.fornecedores f ON f.id = s.fornecedor_id
    WHERE s.id = p_id
  );
END;
$$;

-- Trava o pedido antes de chamar o Inter: dois celulares tocando juntos não pagam duas vezes.
CREATE OR REPLACE FUNCTION public.fn_pix_solicitacao_iniciar(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pessoa uuid;
  s        record;
BEGIN
  IF NOT public.fn_rls_admin_aprovado_ativo() THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  SELECT id INTO v_pessoa FROM public.pessoas WHERE auth_user_id = auth.uid() LIMIT 1;

  UPDATE public.pix_solicitacoes
  SET status = 'pagando', iniciado_em = now(), aprovado_por = v_pessoa, erro = NULL
  WHERE id = p_id
    AND (status = 'erro' OR (status = 'aguardando' AND expira_em >= now()))
    AND NOT EXISTS (SELECT 1 FROM public.lancamentos_financeiros l WHERE l.id = lancamento_id AND l.pago)
    -- nova tentativa só se nenhum Pix igual saiu (ou está saindo) desde o pedido
    AND NOT EXISTS (
      SELECT 1 FROM public.inter_pagamentos ip
      WHERE ip.tipo = 'pix' AND ip.chave_pix = pix_solicitacoes.chave_pix
        AND abs(ip.valor - pix_solicitacoes.valor) < 0.01
        AND ip.criado_em >= pix_solicitacoes.created_at
        AND ip.status IN ('sucesso', 'enviando'))
  RETURNING * INTO s;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Este Pix não pode mais ser pago (já pago, em andamento, cancelado ou expirado). Recarregue a página.');
  END IF;

  RETURN jsonb_build_object('ok', true, 'valor', s.valor, 'chave_pix', s.chave_pix,
    'favorecido', s.favorecido, 'descricao', s.descricao);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_pix_solicitacao_concluir(
  p_id uuid,
  p_inter_pagamento_id uuid DEFAULT NULL,
  p_erro text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  ip record;
BEGIN
  IF NOT public.fn_rls_admin_aprovado_ativo() THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;

  -- só conclui com o registro do Inter deste Pix (mesma chave e valor, depois do início)
  IF p_inter_pagamento_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.inter_pagamentos ip2
       JOIN public.pix_solicitacoes s ON s.id = p_id
       WHERE ip2.id = p_inter_pagamento_id AND ip2.status = 'sucesso' AND ip2.tipo = 'pix'
         AND ip2.chave_pix = s.chave_pix AND abs(ip2.valor - s.valor) < 0.01
         AND ip2.criado_em >= s.iniciado_em - interval '1 minute') THEN
    PERFORM public.fn_pix_registrar_pago(p_id, p_inter_pagamento_id);
    RETURN jsonb_build_object('ok', true, 'status', 'pago');
  END IF;

  -- o app diz que falhou, mas a resposta pode ter se perdido com o Pix já enviado:
  -- confere a auditoria antes de liberar nova tentativa
  SELECT ip3.* INTO ip
  FROM public.inter_pagamentos ip3
  JOIN public.pix_solicitacoes s ON s.id = p_id
  WHERE ip3.tipo = 'pix' AND ip3.chave_pix = s.chave_pix AND abs(ip3.valor - s.valor) < 0.01
    AND ip3.criado_em >= s.iniciado_em - interval '1 minute' AND ip3.status IN ('sucesso', 'enviando')
  ORDER BY ip3.criado_em DESC LIMIT 1;

  IF FOUND AND ip.status = 'sucesso' THEN
    PERFORM public.fn_pix_registrar_pago(p_id, ip.id);
    RETURN jsonb_build_object('ok', true, 'status', 'pago');
  ELSIF FOUND THEN
    -- ainda "enviando" no Inter: fica "pagando" e o fluxo de aviso resolve depois
    RETURN jsonb_build_object('ok', true, 'status', 'pagando');
  END IF;

  UPDATE public.pix_solicitacoes
  SET status = 'erro', erro = left(coalesce(p_erro, 'Falha sem mensagem'), 500), concluido_em = now(), notificado_em = NULL
  WHERE id = p_id AND status = 'pagando';
  RETURN jsonb_build_object('ok', true, 'status', 'erro');
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_pix_solicitacao_cancelar(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.fn_rls_admin_aprovado_ativo() THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  UPDATE public.pix_solicitacoes SET status = 'cancelado', concluido_em = now(), notificado_em = now()
  WHERE id = p_id AND status IN ('aguardando', 'erro');
  RETURN jsonb_build_object('ok', FOUND);
END;
$$;

REVOKE ALL ON TABLE public.pix_solicitacoes FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_cadastrar_pix(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_preparar_pix(uuid, text, text, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_contas_a_pagar(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_pix_solicitacoes_para_avisar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_pix_solicitacao_marcar_avisada(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_pix_registrar_pago(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_trg_parcela_herda_pagamento() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_pix_solicitacao_obter(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_pix_solicitacao_iniciar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_pix_solicitacao_concluir(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_pix_solicitacao_cancelar(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_ju_cadastrar_pix(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ju_preparar_pix(uuid, text, text, numeric, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ju_contas_a_pagar(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pix_solicitacoes_para_avisar() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pix_solicitacao_marcar_avisada(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pix_solicitacao_obter(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pix_solicitacao_iniciar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pix_solicitacao_concluir(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pix_solicitacao_cancelar(uuid) TO authenticated;
