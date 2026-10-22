-- =====================================================================
-- Ju (MVP): estado das conversas e contexto do cliente para o n8n
-- =====================================================================
-- AI dev note: NÃO APLICADA (aguarda revisão). O n8n usa a service_role
-- só nos nós determinísticos; o AI Agent não tem ferramenta de banco.
-- O telefone vem sempre do webhook (gravado em ju_conversas); a IA nunca
-- escolhe telefone nem paciente.
--
-- Estados da conversa:
--   ATIVA              a Ju responde
--   PAUSADA            humano respondeu; volta sozinha quando pause_until passa
--   AGUARDANDO_EQUIPE  a Ju escalou; só sai quando um humano responde
-- =====================================================================

CREATE TABLE public.ju_conversas (
  id                        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chatwoot_conversation_id  bigint NOT NULL UNIQUE,
  telefone                  text CHECK (telefone ~ '^\+[1-9][0-9]{7,14}$'),
  status                    text NOT NULL DEFAULT 'ATIVA'
                            CHECK (status IN ('ATIVA','PAUSADA','AGUARDANDO_EQUIPE')),
  pause_until               timestamptz,
  message_version           bigint NOT NULL DEFAULT 0,
  ultima_mensagem_cliente   timestamptz,
  ultima_mensagem_humano    timestamptz,
  paciente_foco_id          uuid REFERENCES public.pessoas(id) ON DELETE SET NULL,
  memoria                   jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(memoria) = 'object'),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ju_conversas_pausa_ck CHECK ((status = 'PAUSADA') = (pause_until IS NOT NULL))
);

CREATE TABLE public.ju_mensagens (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversa_id          bigint NOT NULL REFERENCES public.ju_conversas(id) ON DELETE CASCADE,
  chatwoot_message_id  bigint NOT NULL UNIQUE,          -- deduplica reenvio do webhook
  origem               text NOT NULL CHECK (origem IN ('CLIENTE','JU','HUMANO')),
  tipo                 text NOT NULL DEFAULT 'TEXT'
                       CHECK (tipo IN ('TEXT','AUDIO','IMAGE','DOCUMENT','VIDEO','OUTRO')),
  conteudo             text,
  versao               bigint,                          -- só mensagens do cliente
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ju_mensagens_conversa_idx ON public.ju_mensagens (conversa_id, created_at DESC);

CREATE TABLE public.ju_solicitacoes (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversa_id  bigint NOT NULL REFERENCES public.ju_conversas(id) ON DELETE CASCADE,
  versao       bigint NOT NULL,                         -- versão que gerou a escalada
  paciente_id  uuid REFERENCES public.pessoas(id) ON DELETE SET NULL,
  tipo         text NOT NULL CHECK (tipo IN ('AGENDAMENTO','REMARCACAO','CANCELAMENTO','FINANCEIRO',
                                             'CLINICO','RECLAMACAO','HUMANO','OUTRO')),
  setor        text NOT NULL CHECK (setor IN ('SECRETARIA','FISIOTERAPIA','FINANCEIRO')),
  resumo       text NOT NULL,
  status       text NOT NULL DEFAULT 'ABERTA' CHECK (status IN ('ABERTA','RESOLVIDA')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolvida_em timestamptz,
  CONSTRAINT ju_solicitacoes_idempotente UNIQUE (conversa_id, versao)  -- retry do n8n não duplica
);

CREATE TABLE public.ju_conhecimento (
  id          text PRIMARY KEY,                        -- ex.: CONVENIO, ENDERECO, VALORES
  categoria   text NOT NULL,
  texto       text NOT NULL,
  ativo       boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ju_logs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversa_id  bigint REFERENCES public.ju_conversas(id) ON DELETE SET NULL,
  versao       bigint,
  intencao     text,
  acao         text,
  erro         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ju_logs_created_idx ON public.ju_logs (created_at);

-- Fechado para o app: só a service_role (que ignora RLS) lê e escreve.
ALTER TABLE public.ju_conversas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ju_mensagens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ju_solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ju_conhecimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ju_logs         ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_conversas, public.ju_mensagens, public.ju_solicitacoes,
              public.ju_conhecimento, public.ju_logs FROM anon, authenticated;


-- ---------------------------------------------------------------------
-- Telefone canônico (+55DD9XXXXXXXX). Celular antigo sem o 9º dígito ganha o 9.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_telefone(p_telefone text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  WITH d0 AS (SELECT regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g') AS n,
                     btrim(coalesce(p_telefone, '')) LIKE '+%' AS com_ddi),
       d AS (  -- sem '+' e com 10/11 dígitos: DDD brasileiro sem o 55
         SELECT CASE WHEN NOT com_ddi AND length(n) IN (10, 11) THEN '55' || n ELSE n END AS n FROM d0)
  SELECT CASE
    WHEN n ~ '^55[0-9]{2}[6-9][0-9]{7}$' THEN '+' || left(n, 4) || '9' || substr(n, 5)
    WHEN n ~ '^55[0-9]{2}(9[0-9]{8}|[2-5][0-9]{7})$' THEN '+' || n
    WHEN length(n) BETWEEN 8 AND 15 AND left(n, 2) <> '55' THEN '+' || n
  END
  FROM d;
$$;


-- ---------------------------------------------------------------------
-- 1. Registra a mensagem do webhook. Deduplica, soma a versão (no banco,
--    nunca no n8n) e aplica a pausa humana.
--    Remetente: Ju se for o usuário técnico da Ju; cliente se incoming;
--    qualquer outro outgoing (inclusive sem remetente) é HUMANO e pausa.
--    Devolve acao = PROCESSAR (seguir para o atendimento) ou NENHUMA.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_registrar_mensagem(
  p_chatwoot_conversation_id bigint, p_chatwoot_message_id bigint, p_message_type text,
  p_sender_id bigint, p_ju_user_id bigint, p_telefone text, p_tipo text, p_conteudo text,
  p_pausa_minutos integer DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c        public.ju_conversas;
  v_origem text;
  v_msg    bigint;
BEGIN
  v_origem := CASE
    WHEN p_message_type = 'incoming' THEN 'CLIENTE'
    WHEN p_sender_id IS NOT NULL AND p_sender_id = p_ju_user_id THEN 'JU'
    ELSE 'HUMANO'
  END;

  INSERT INTO public.ju_conversas (chatwoot_conversation_id)
  VALUES (p_chatwoot_conversation_id)
  ON CONFLICT (chatwoot_conversation_id) DO NOTHING;
  SELECT * INTO c FROM public.ju_conversas
  WHERE chatwoot_conversation_id = p_chatwoot_conversation_id FOR UPDATE;

  INSERT INTO public.ju_mensagens (conversa_id, chatwoot_message_id, origem, tipo, conteudo, versao)
  VALUES (c.id, p_chatwoot_message_id, v_origem,
          CASE WHEN upper(p_tipo) IN ('TEXT','AUDIO','IMAGE','DOCUMENT','VIDEO') THEN upper(p_tipo) ELSE 'OUTRO' END,
          p_conteudo,
          CASE WHEN v_origem = 'CLIENTE' THEN c.message_version + 1 END)
  ON CONFLICT (chatwoot_message_id) DO NOTHING
  RETURNING id INTO v_msg;
  IF v_msg IS NULL THEN
    RETURN jsonb_build_object('acao', 'NENHUMA', 'motivo', 'DUPLICADA');
  END IF;

  IF v_origem = 'HUMANO' THEN
    -- a equipe assumiu a conversa escalada: a solicitação está atendida
    IF c.status = 'AGUARDANDO_EQUIPE' THEN
      UPDATE public.ju_solicitacoes
         SET status = 'RESOLVIDA', resolvida_em = now()
       WHERE conversa_id = c.id AND status = 'ABERTA';
    END IF;
    UPDATE public.ju_conversas
       SET status = 'PAUSADA', pause_until = now() + make_interval(mins => p_pausa_minutos),
           ultima_mensagem_humano = now(), updated_at = now()
     WHERE id = c.id;
    RETURN jsonb_build_object('acao', 'NENHUMA', 'motivo', 'HUMANO_PAUSOU', 'conversa_id', c.id);
  ELSIF v_origem = 'JU' THEN
    RETURN jsonb_build_object('acao', 'NENHUMA', 'motivo', 'MENSAGEM_DA_JU', 'conversa_id', c.id);
  END IF;

  -- CLIENTE (o telefone só é aprendido de mensagem do próprio cliente)
  UPDATE public.ju_conversas
     SET message_version = message_version + 1,
         telefone = coalesce(public.fn_ju_telefone(p_telefone), telefone),
         ultima_mensagem_cliente = now(),
         -- pausa vencida volta a ATIVA aqui mesmo
         status = CASE WHEN status = 'PAUSADA' AND pause_until <= now() THEN 'ATIVA' ELSE status END,
         pause_until = CASE WHEN status = 'PAUSADA' AND pause_until <= now() THEN NULL ELSE pause_until END,
         updated_at = now()
   WHERE id = c.id
  RETURNING * INTO c;

  RETURN jsonb_build_object(
    'acao', CASE WHEN c.status = 'ATIVA' THEN 'PROCESSAR' ELSE 'NENHUMA' END,
    'motivo', c.status, 'conversa_id', c.id, 'versao', c.message_version);
END;
$$;


-- ---------------------------------------------------------------------
-- 2. Contexto do cliente a partir do telefone gravado na conversa.
--    Telefone -> responsáveis (ou paciente adulto) -> filhos, com o que cada
--    um pode ver: agenda (legal/ambos) e financeiro (financeiro/ambos).
--    agendamentos.data_hora é hora de parede (+00): formatar sem converter.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_contexto_cliente(p_conversa_id bigint)
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
      -- (82 pacientes nessa situação em 03/10/2026)
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
    'pacientes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'paciente_id', pac.id,
        'nome', pac.nome,
        'idade_meses', (extract(year FROM age(pac.data_nascimento)) * 12
                        + extract(month FROM age(pac.data_nascimento)))::int,
        -- explícito para o modelo não confundir "sem acesso" com "não há nada"
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
        'contrato', CASE WHEN e.agenda THEN (
          SELECT uc.status_contrato FROM public.user_contracts uc
          WHERE uc.pessoa_id = pac.id AND uc.ativo
          ORDER BY uc.data_geracao DESC NULLS LAST LIMIT 1) END,
        'cobrancas_em_aberto', CASE WHEN e.financeiro THEN coalesce((
          SELECT jsonb_agg(jsonb_build_object(
                   'descricao', cp.descricao, 'valor', cp.valor, 'vencimento', cp.vencimento,
                   'situacao', cp.situacao,
                   -- só o link do nosso app. Fatura direta do Asaas (sem token) não
                   -- tem link para a Ju: a página do Asaas esconde o QR atrás de
                   -- reCAPTCHA; nesse caso a Ju encaminha ao financeiro.
                   'link', CASE WHEN cp.token IS NOT NULL
                                THEN 'https://app.respirakidsbrasilia.com.br/#/pagamento/' || cp.token END))
          FROM public.vw_cobrancas_pendentes cp WHERE cp.paciente_id = pac.id), '[]'::jsonb) END,
        'pagamentos_ultimos_45_dias', CASE WHEN e.financeiro THEN coalesce((
          SELECT jsonb_agg(jsonb_build_object('valor', f.valor_total,
                                              'data', (f.pago_em AT TIME ZONE 'UTC')::date))
          FROM public.faturas f
          WHERE f.paciente_id = pac.id AND f.ativo AND f.status = 'pago'
            AND f.pago_em > now() - interval '45 days'), '[]'::jsonb) END
      ) ORDER BY pac.nome)
      FROM escopo e JOIN public.pessoas pac ON pac.id = e.paciente_id), '[]'::jsonb)
  );
$$;


-- ---------------------------------------------------------------------
-- 3. Checagem final antes de responder OU escalar: nenhuma mensagem nova
--    do cliente e nenhum humano assumiu desde que o turno começou.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_pode_enviar(p_conversa_id bigint, p_versao bigint)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'pode', c.message_version = p_versao AND c.status = 'ATIVA',
    'motivo', CASE WHEN c.message_version <> p_versao THEN 'MENSAGEM_NOVA'
                   WHEN c.status <> 'ATIVA' THEN c.status END)
  FROM public.ju_conversas c WHERE c.id = p_conversa_id;
$$;


-- ---------------------------------------------------------------------
-- 4. Escalada: cria a solicitação (idempotente por versão) e tira a Ju da
--    conversa até um humano responder. Paciente fora do escopo do telefone
--    vira NULL (a IA nunca amplia acesso).
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_escalar(p_conversa_id bigint, p_versao bigint, p_tipo text,
                                     p_setor text, p_paciente_id uuid, p_resumo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c    public.ju_conversas;
  v_id bigint;
BEGIN
  -- O gate se repete aqui, com a linha travada: entre o fn_ju_pode_enviar e
  -- esta chamada o cliente pode ter escrito ou um humano ter assumido.
  SELECT * INTO c FROM public.ju_conversas WHERE id = p_conversa_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('criada', false, 'motivo', 'CONVERSA_INEXISTENTE');
  ELSIF c.message_version <> p_versao THEN
    RETURN jsonb_build_object('criada', false, 'motivo', 'MENSAGEM_NOVA');
  ELSIF c.status <> 'ATIVA' THEN
    RETURN jsonb_build_object('criada', false, 'motivo', c.status);
  END IF;

  IF p_paciente_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(public.fn_ju_contexto_cliente(p_conversa_id) -> 'pacientes') x
       WHERE (x ->> 'paciente_id')::uuid = p_paciente_id) THEN
    p_paciente_id := NULL;
  END IF;

  INSERT INTO public.ju_solicitacoes (conversa_id, versao, paciente_id, tipo, setor, resumo)
  VALUES (p_conversa_id, p_versao, p_paciente_id, p_tipo, p_setor, left(p_resumo, 2000))
  ON CONFLICT (conversa_id, versao) DO NOTHING
  RETURNING id INTO v_id;

  UPDATE public.ju_conversas
     SET status = 'AGUARDANDO_EQUIPE', pause_until = NULL, updated_at = now()
   WHERE id = p_conversa_id AND status = 'ATIVA';

  RETURN jsonb_build_object('criada', v_id IS NOT NULL, 'solicitacao_id', v_id,
                            'motivo', CASE WHEN v_id IS NULL THEN 'JA_EXISTIA' END);
END;
$$;


-- Só a service_role (n8n) executa. O default de public daria EXECUTE ao anon.
REVOKE ALL ON FUNCTION
  public.fn_ju_telefone(text),
  public.fn_ju_registrar_mensagem(bigint, bigint, text, bigint, bigint, text, text, text, integer),
  public.fn_ju_contexto_cliente(bigint),
  public.fn_ju_pode_enviar(bigint, bigint),
  public.fn_ju_escalar(bigint, bigint, text, text, uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.fn_ju_telefone(text),
  public.fn_ju_registrar_mensagem(bigint, bigint, text, bigint, bigint, text, text, text, integer),
  public.fn_ju_contexto_cliente(bigint),
  public.fn_ju_pode_enviar(bigint, bigint),
  public.fn_ju_escalar(bigint, bigint, text, text, uuid, text)
TO service_role;

-- Conteúdo das mensagens não fica para sempre (dado de saúde de criança).
SELECT cron.schedule('ju-limpar-mensagens', '30 6 * * *',
  $$DELETE FROM public.ju_mensagens WHERE created_at < now() - interval '90 days'$$);
