-- =====================================================================
-- Atribuição de pacientes v2 — sobre a base da Ju (substitui o rascunho
-- app_01_atribuicao.sql do repo do site, que dependia do Chatwoot)
-- =====================================================================
-- AI dev note (aprovado pelo dono em 21/10/2026):
-- * Google/Meta recebem só o clique; paciente, agenda e receita ficam aqui.
--   NUNCA guardar gclid/gbraid/wbraid/fbclid nem telefone em atrib_*.
-- * Captura do código RK-XXXXXXXX: gatilho em ju_mensagens (na chegada, sem
--   IA, sem rede; erro vai para atrib_erros e nunca bloqueia a mensagem).
-- * Campanha do clique: job pg_net consulta o Supabase do site pela função
--   obter_contato_clique_app (token no vault). Sem clique = "recuperada"
--   (campanha desconhecida), nunca inventada.
-- * Oportunidade = interesse comercial (código, pedido de agendamento da Ju
--   ou primeiro contato de um contato novo). Pedido de rotina de paciente em
--   tratamento NÃO abre oportunidade.
-- * Estado e etapa são RECALCULADOS dos fatos (agenda, faturas, pedidos) a
--   cada rodada: eventos fora de ordem e reprocessamento convergem. O
--   histórico (atrib_eventos) é só de inserção.
-- * Paciente ≠ telefone: aquisição = 1º atendimento realizado da CRIANÇA,
--   creditado a UMA oportunidade (vínculo mais forte; empate = mais recente).
--   Família nova e contato novo são medidos à parte. Paciente já atendido que
--   volta por campanha = retenção, fora do CAC.
-- * Receita = faturas pagas rateadas pelas sessões (valor_servico), estorno
--   zera, cancelada+paga fica "a_conciliar". Agendamento é a fonte oficial;
--   nada clínico é copiado.
-- * Acesso: só admin lê; escrita só por funções (service_role / cron).
-- =====================================================================

-- ── Configuração ─────────────────────────────────────────────────────
CREATE TABLE public.atrib_config (
  id                      int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  inicio                  date NOT NULL DEFAULT date '2026-10-14',  -- site começou a gerar o código
  janela_vinculo_dias     int  NOT NULL DEFAULT 60,   -- agendamento criado até N dias após a oportunidade
  dias_sem_atividade      int  NOT NULL DEFAULT 30,   -- sem agendamento nem conversa → perdida
  dias_tratamento_ativo   int  NOT NULL DEFAULT 90,   -- atendido nesse período = em tratamento
  site_url                text NOT NULL DEFAULT 'https://obhimiwxpnwcjpgqfail.supabase.co',
  busca_max_tentativas    int  NOT NULL DEFAULT 6
);
INSERT INTO public.atrib_config DEFAULT VALUES;

-- ── Funções de apoio ─────────────────────────────────────────────────
-- Telefone: DDD + 8 últimos dígitos (casa com e sem o 9 e com/sem 55).
CREATE FUNCTION public.fn_atrib_tel_chave(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT CASE WHEN length(d) >= 10
              THEN left(right(d, length(d) - CASE WHEN d LIKE '55%' AND length(d) >= 12 THEN 2 ELSE 0 END), 2) || right(d, 8) END
  FROM (SELECT regexp_replace(coalesce(p, ''), '\D', '', 'g') AS d) s
$$;
CREATE INDEX atrib_pessoas_tel_chave_idx ON public.pessoas (public.fn_atrib_tel_chave(telefone::text));

CREATE FUNCTION public.fn_atrib_etapa_ord(p text)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(array_position(ARRAY['contato','identificado','qualificado','agendamento_solicitado',
                                       'agendado','atendido','pago'], p), 0)
$$;

-- Conversa fora da atribuição: equipe, números de teste e conversas fictícias.
CREATE FUNCTION public.fn_atrib_excluida(p_wa_chatid text, p_telefone text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(p_wa_chatid LIKE '55619990000%', false)
      OR coalesce(public.fn_ju_eh_equipe(p_telefone), false)
      OR coalesce(public.fn_ju_numero_teste(p_telefone), false)
$$;

-- Crianças (e adultos pacientes) ligados a um telefone.
CREATE FUNCTION public.fn_atrib_pacientes_do_contato(p_chave text)
RETURNS TABLE (paciente_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH r AS (
    SELECT p.id, t.codigo FROM public.pessoas p JOIN public.pessoa_tipos t ON t.id = p.id_tipo_pessoa
     WHERE p_chave IS NOT NULL AND public.fn_atrib_tel_chave(p.telefone::text) = p_chave)
  SELECT pr.id_pessoa FROM r JOIN public.pessoa_responsaveis pr ON pr.id_responsavel = r.id AND pr.ativo
  UNION SELECT pac.id FROM r JOIN public.pessoas pac ON pac.responsavel_cobranca_id = r.id
  UNION SELECT r.id FROM r WHERE r.codigo = 'paciente'
$$;

-- Canal e plataforma a partir dos parâmetros do clique.
CREATE FUNCTION public.fn_atrib_canal(p_source text, p_medium text, p_referrer text)
RETURNS TABLE (canal text, plataforma text) LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
           WHEN s IN ('google','adwords') AND m IN ('cpc','ppc','paid','paid_search','sem') THEN 'google_ads'
           WHEN s IN ('facebook','fb','instagram','ig','meta') AND m IN ('cpc','ppc','paid','paid_social','ads') THEN 'meta_ads'
           WHEN s IN ('instagram','ig') THEN 'instagram'
           WHEN s IN ('facebook','fb') THEN 'facebook'
           WHEN s <> '' THEN 'outro'
           WHEN r ~ '(^|\.)google\.' THEN 'google_organico'
           WHEN r ~ '(chatgpt|openai|perplexity|gemini|copilot|claude)' THEN 'ia_assistente'
           WHEN r ~ '(instagram|facebook)' THEN 'instagram'
           WHEN r = '' THEN 'direto'
           ELSE 'outro' END,
         CASE WHEN s IN ('google','adwords') AND m IN ('cpc','ppc','paid','paid_search','sem') THEN 'google_ads'
              WHEN s IN ('facebook','fb','instagram','ig','meta') AND m IN ('cpc','ppc','paid','paid_social','ads') THEN 'meta_ads' END
  FROM (SELECT lower(coalesce(p_source, '')) s, lower(coalesce(p_medium, '')) m, lower(coalesce(p_referrer, '')) r) x
$$;

-- ── Tabelas ──────────────────────────────────────────────────────────
CREATE TABLE public.atrib_oportunidades (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversa_id            bigint REFERENCES public.ju_conversas(id) ON DELETE SET NULL,
  telefone_chave         text,
  aberta_em              timestamptz NOT NULL,
  motivo_abertura        text NOT NULL CHECK (motivo_abertura IN ('toque','pedido_agendamento','primeiro_contato','humano')),
  contato_novo           boolean NOT NULL DEFAULT false,
  etapa_atual            text NOT NULL DEFAULT 'contato' CHECK (public.fn_atrib_etapa_ord(etapa_atual) > 0),
  etapa_maxima           text NOT NULL DEFAULT 'contato' CHECK (public.fn_atrib_etapa_ord(etapa_maxima) > 0),
  estado                 text NOT NULL DEFAULT 'aberta'
                         CHECK (estado IN ('aberta','agendada','convertida','perdida','descartada')),
  estado_em              timestamptz,
  motivo_perda           text CHECK (motivo_perda IN ('sem_agendamento','cancelou','faltou','ja_paciente','nao_comercial',
                                                      'preco','sem_horario','localizacao','convenio','desistiu','outro')),
  motivo_fonte           text CHECK (motivo_fonte IN ('regra','sistema','ia','humano')),
  motivo_evidencia       text CHECK (motivo_evidencia IS NULL OR length(motivo_evidencia) <= 280),
  qualificada_em         timestamptz,                 -- IA ou humano (fase 3)
  qualificada_fonte      text CHECK (qualificada_fonte IN ('ia','humano')),
  classificacao_ia       jsonb,                       -- sugestão da IA (motivo + evidência); não decide sozinha
  revisao_humana         jsonb,                       -- {estado, motivo_perda}: prevalece sobre as regras
  ultima_atividade_em    timestamptz,
  processada_em          timestamptz,
  anonimizada_em         timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atrib_preco_com_evidencia CHECK (motivo_perda IS DISTINCT FROM 'preco' OR motivo_evidencia IS NOT NULL)
);
CREATE INDEX atrib_op_conversa_idx ON public.atrib_oportunidades (conversa_id, aberta_em);
CREATE INDEX atrib_op_tel_idx ON public.atrib_oportunidades (telefone_chave, aberta_em);

CREATE TABLE public.atrib_toques (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  oportunidade_id     bigint REFERENCES public.atrib_oportunidades(id) ON DELETE CASCADE,
  conversa_id         bigint REFERENCES public.ju_conversas(id) ON DELETE SET NULL,
  mensagem_id         bigint REFERENCES public.ju_mensagens(id) ON DELETE SET NULL,
  ref                 text UNIQUE CHECK (ref IS NULL OR ref ~ '^RK-[A-HJ-NP-Z2-9]{8}$'),
  origem_tipo         text NOT NULL CHECK (origem_tipo IN ('site','declarada','meta_ctwa')),
  canal               text NOT NULL DEFAULT 'desconhecido',
  plataforma          text CHECK (plataforma IN ('google_ads','meta_ads')),
  campanha_id         text,           -- utm_id = {campaignid}: chave estável para custos
  campanha_nome       text,           -- utm_campaign
  grupo_id            text,           -- rk_adgroup = {adgroupid}
  conteudo            text,           -- utm_content (variação / {creative})
  palavra_chave       text,           -- utm_term = {keyword}: palavra-chave de SEGMENTAÇÃO, não o termo pesquisado
  correspondencia     text,           -- rk_match
  rede                text,           -- rk_network
  dispositivo         text,           -- rk_device
  utm_source          text,
  utm_medium          text,
  referrer_host       text,
  landing_path        text,
  page_path           text,
  servico_pagina      text,
  cta_posicao         text,
  base_legal          text,
  clicado_em          timestamptz,    -- clique no botão do WhatsApp (site)
  mensagem_em         timestamptz,    -- mensagem com o código chegou
  clique_status       text NOT NULL DEFAULT 'pendente'
                      CHECK (clique_status IN ('pendente','encontrado','nao_encontrado','nao_se_aplica')),
  clique_tentativas   int NOT NULL DEFAULT 0,
  proxima_busca_em    timestamptz DEFAULT now(),
  declarado_por       uuid REFERENCES public.pessoas(id) ON DELETE SET NULL,
  registrado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX atrib_toques_op_idx ON public.atrib_toques (oportunidade_id);
CREATE INDEX atrib_toques_busca_idx ON public.atrib_toques (proxima_busca_em) WHERE clique_status = 'pendente';

CREATE TABLE public.atrib_oportunidade_agendamentos (
  oportunidade_id  bigint NOT NULL REFERENCES public.atrib_oportunidades(id) ON DELETE CASCADE,
  agendamento_id   uuid   NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  tipo_vinculo     text   NOT NULL CHECK (tipo_vinculo IN ('humano','pedido_ju','provavel')),
  confianca        text   NOT NULL CHECK (confianca IN ('alta','media')),
  vinculado_em     timestamptz NOT NULL DEFAULT now(),
  removido_em      timestamptz,       -- humano desfez: o job não religa
  PRIMARY KEY (oportunidade_id, agendamento_id)
);
CREATE INDEX atrib_oa_ag_idx ON public.atrib_oportunidade_agendamentos (agendamento_id);

CREATE TABLE public.atrib_eventos (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  oportunidade_id  bigint NOT NULL REFERENCES public.atrib_oportunidades(id) ON DELETE CASCADE,
  tipo             text NOT NULL CHECK (tipo IN ('aberta','toque','pedido','vinculo','etapa','estado','motivo','revisao')),
  valor_anterior   text,
  valor_novo       text,
  fonte            text NOT NULL CHECK (fonte IN ('sistema','regra','ia','humano')),
  evidencia        text,
  ocorrido_em      timestamptz NOT NULL,   -- hora do fato (não a do processamento)
  registrado_em    timestamptz NOT NULL DEFAULT now(),
  chave            text NOT NULL UNIQUE    -- idempotência
);
CREATE INDEX atrib_eventos_op_idx ON public.atrib_eventos (oportunidade_id, ocorrido_em);

-- Histórico imutável: nada de UPDATE; DELETE só pela anonimização futura.
CREATE FUNCTION public.fn_atrib_eventos_imutavel() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('atrib.permitir_apagar', true) = 'on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'atrib_eventos é só de inserção';
END $$;
CREATE TRIGGER atrib_eventos_imutavel BEFORE UPDATE OR DELETE ON public.atrib_eventos
  FOR EACH ROW EXECUTE FUNCTION public.fn_atrib_eventos_imutavel();

CREATE TABLE public.atrib_custos_diarios (
  plataforma     text NOT NULL CHECK (plataforma IN ('google_ads','meta_ads')),
  conta_id       text NOT NULL,
  campanha_id    text NOT NULL,
  data           date NOT NULL,
  campanha_nome  text,
  impressoes     bigint,
  cliques        bigint,
  custo_micros   bigint,
  custo          numeric(14,2) NOT NULL CHECK (custo >= 0),
  moeda          text NOT NULL DEFAULT 'BRL',
  fonte          text NOT NULL CHECK (fonte IN ('google_ads_script','meta_api','manual','csv')),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plataforma, conta_id, campanha_id, data)
);

-- Cliques no botão do WhatsApp por dia (contagem agregada vinda do site; sem pessoa).
CREATE TABLE public.atrib_cliques_whatsapp_diarios (
  dia            date NOT NULL,
  canal          text NOT NULL,
  campanha_id    text NOT NULL DEFAULT '',
  campanha_nome  text,
  cliques        int NOT NULL,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dia, canal, campanha_id)
);

CREATE TABLE public.atrib_revisoes (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  oportunidade_id bigint NOT NULL REFERENCES public.atrib_oportunidades(id) ON DELETE CASCADE,
  campo           text NOT NULL,
  valor_anterior  text,
  valor_novo      text,
  observacao      text,
  revisor         uuid REFERENCES public.pessoas(id) ON DELETE SET NULL,
  revisado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.atrib_site_requisicoes (
  req_id     bigint PRIMARY KEY,
  tipo       text NOT NULL CHECK (tipo IN ('clique','diario')),
  toque_id   bigint REFERENCES public.atrib_toques(id) ON DELETE CASCADE,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.atrib_erros (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  etapa       text NOT NULL,
  referencia  text,
  detalhe     text,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

-- ── RLS: só admin lê; ninguém escreve direto ─────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['atrib_config','atrib_oportunidades','atrib_toques','atrib_oportunidade_agendamentos',
                           'atrib_eventos','atrib_custos_diarios','atrib_cliques_whatsapp_diarios','atrib_revisoes',
                           'atrib_site_requisicoes','atrib_erros'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.is_admin()))', t || '_admin', t);
  END LOOP;
END $$;
REVOKE UPDATE, DELETE, TRUNCATE ON public.atrib_eventos FROM service_role;


-- ── Contato novo: primeira interação identificada daquele telefone ───
CREATE FUNCTION public.fn_atrib_contato_novo(p_chave text, p_conversa bigint, p_em timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.atrib_oportunidades o
                      WHERE o.aberta_em < p_em AND (o.conversa_id = p_conversa OR (p_chave IS NOT NULL AND o.telefone_chave = p_chave)))
     AND NOT EXISTS (SELECT 1 FROM public.pessoas p
                      WHERE p_chave IS NOT NULL AND public.fn_atrib_tel_chave(p.telefone::text) = p_chave
                        AND p.created_at < p_em - interval '1 day')
     AND NOT EXISTS (SELECT 1 FROM public.ju_mensagens m JOIN public.ju_conversas c ON c.id = m.conversa_id
                      WHERE m.origem = 'CLIENTE' AND m.created_at < p_em - interval '7 days'
                        AND (c.id = p_conversa OR (p_chave IS NOT NULL AND public.fn_atrib_tel_chave(c.telefone) = p_chave)))
$$;

-- ── Oportunidade que cobre um fato (ou uma nova) ─────────────────────
CREATE FUNCTION public.fn_atrib_oportunidade_para(p_conversa bigint, p_em timestamptz, p_motivo text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c      public.ju_conversas;
  o      public.atrib_oportunidades;
  v_jan  interval := make_interval(days => (SELECT k.janela_vinculo_dias FROM public.atrib_config k WHERE k.id = 1));
  v_ch   text;
  v_id   bigint;
BEGIN
  SELECT * INTO c FROM public.ju_conversas WHERE id = p_conversa;
  IF NOT FOUND OR public.fn_atrib_excluida(c.wa_chatid, c.telefone) THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('atrib_op:' || p_conversa));

  -- a) oportunidade em curso naquele momento
  SELECT * INTO o FROM public.atrib_oportunidades x
   WHERE x.conversa_id = p_conversa AND x.aberta_em <= p_em AND p_em <= x.aberta_em + v_jan
     AND NOT (x.estado IN ('convertida','perdida','descartada') AND x.estado_em <= p_em)
   ORDER BY x.aberta_em DESC LIMIT 1;
  IF FOUND THEN RETURN o.id; END IF;

  -- b) fato que chegou fora de ordem: oportunidade aberta logo depois dele
  SELECT * INTO o FROM public.atrib_oportunidades x
   WHERE x.conversa_id = p_conversa AND x.aberta_em > p_em AND x.aberta_em <= p_em + v_jan
   ORDER BY x.aberta_em LIMIT 1;
  IF FOUND THEN
    UPDATE public.atrib_oportunidades SET aberta_em = p_em, updated_at = now() WHERE id = o.id;
    RETURN o.id;
  END IF;

  v_ch := public.fn_atrib_tel_chave(c.telefone);
  INSERT INTO public.atrib_oportunidades (conversa_id, telefone_chave, aberta_em, motivo_abertura, contato_novo,
                                          ultima_atividade_em, estado_em)
  VALUES (p_conversa, v_ch, p_em, p_motivo, public.fn_atrib_contato_novo(v_ch, p_conversa, p_em), p_em, p_em)
  RETURNING id INTO v_id;
  INSERT INTO public.atrib_eventos (oportunidade_id, tipo, valor_novo, fonte, ocorrido_em, chave)
  VALUES (v_id, 'aberta', p_motivo, 'sistema', p_em, 'op:' || v_id || ':aberta');
  RETURN v_id;
END $$;


-- ── Captura do código na chegada da mensagem ─────────────────────────
CREATE FUNCTION public.fn_atrib_capturar_mensagem() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_ref text; v_op bigint; v_t bigint;
BEGIN
  IF NEW.origem IS DISTINCT FROM 'CLIENTE' OR NEW.conteudo IS NULL
     OR NEW.conteudo !~ 'RK-[A-HJ-NP-Z2-9]{8}' THEN
    RETURN NULL;
  END IF;
  BEGIN
    FOR v_ref IN SELECT DISTINCT (regexp_matches(NEW.conteudo, 'RK-[A-HJ-NP-Z2-9]{8}', 'g'))[1] LOOP
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.atrib_toques t WHERE t.ref = v_ref);
      v_op := public.fn_atrib_oportunidade_para(NEW.conversa_id, coalesce(NEW.created_at, now()), 'toque');
      CONTINUE WHEN v_op IS NULL;   -- equipe, teste ou conversa fictícia
      INSERT INTO public.atrib_toques (oportunidade_id, conversa_id, mensagem_id, ref, origem_tipo, mensagem_em)
      VALUES (v_op, NEW.conversa_id, NEW.id, v_ref, 'site', coalesce(NEW.created_at, now()))
      ON CONFLICT (ref) DO NOTHING
      RETURNING id INTO v_t;
      IF v_t IS NOT NULL THEN
        INSERT INTO public.atrib_eventos (oportunidade_id, tipo, valor_novo, fonte, ocorrido_em, chave)
        VALUES (v_op, 'toque', v_ref, 'sistema', coalesce(NEW.created_at, now()), 'toque:' || v_ref)
        ON CONFLICT (chave) DO NOTHING;
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.atrib_erros (etapa, referencia, detalhe) VALUES ('captura', NEW.id::text, SQLERRM);
  END;
  RETURN NULL;
END $$;
CREATE TRIGGER atrib_captura AFTER INSERT OR UPDATE OF conteudo ON public.ju_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.fn_atrib_capturar_mensagem();


-- ── Dados do clique (vindos do site) num toque ───────────────────────
CREATE FUNCTION public.fn_atrib_aplicar_clique(p_toque bigint, p_clique jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.fn_atrib_canal(p_clique->>'utm_source', p_clique->>'utm_medium', p_clique->>'referrer_host');
  UPDATE public.atrib_toques t SET
    canal = v.canal, plataforma = v.plataforma,
    campanha_id = nullif(p_clique->>'utm_id', ''), campanha_nome = nullif(p_clique->>'utm_campaign', ''),
    grupo_id = nullif(p_clique->>'rk_adgroup', ''), conteudo = nullif(p_clique->>'utm_content', ''),
    palavra_chave = nullif(p_clique->>'utm_term', ''), correspondencia = nullif(p_clique->>'rk_match', ''),
    rede = nullif(p_clique->>'rk_network', ''), dispositivo = nullif(p_clique->>'rk_device', ''),
    utm_source = nullif(p_clique->>'utm_source', ''), utm_medium = nullif(p_clique->>'utm_medium', ''),
    referrer_host = nullif(p_clique->>'referrer_host', ''), landing_path = nullif(p_clique->>'landing_path', ''),
    page_path = nullif(p_clique->>'page_path', ''), servico_pagina = nullif(p_clique->>'service', ''),
    cta_posicao = nullif(p_clique->>'cta_position', ''), base_legal = nullif(p_clique->>'base_legal', ''),
    clicado_em = nullif(p_clique->>'criado_em', '')::timestamptz,
    clique_status = 'encontrado', proxima_busca_em = NULL
  WHERE t.id = p_toque;
END $$;


-- ── Job: busca no site (pg_net, assíncrono) ──────────────────────────
CREATE FUNCTION public.fn_atrib_site_post(p_rpc text, p_body jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_url  text := (SELECT k.site_url FROM public.atrib_config k WHERE k.id = 1);
  v_anon text := (SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = 'atrib_site_anon');
  v_tok  text := (SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = 'atrib_site_token');
BEGIN
  IF v_anon IS NULL OR v_tok IS NULL THEN RETURN NULL; END IF;
  RETURN net.http_post(
    url := v_url || '/rest/v1/rpc/' || p_rpc,
    body := p_body || jsonb_build_object('p_token', v_tok),
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_anon, 'Authorization', 'Bearer ' || v_anon),
    timeout_milliseconds := 10000);
END $$;

CREATE FUNCTION public.fn_atrib_buscar_cliques()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r       record;
  v_resp  record;
  v_body  jsonb;
  v_req   bigint;
  v_max   int := (SELECT k.busca_max_tentativas FROM public.atrib_config k WHERE k.id = 1);
  v_ok    int := 0; v_nao int := 0; v_env int := 0; v_err int := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('atrib_buscar_cliques')) THEN RETURN '{"ocupado":true}'; END IF;

  -- 1) respostas que já voltaram
  FOR r IN SELECT q.* FROM public.atrib_site_requisicoes q LOOP
    SELECT h.status_code, h.content, h.timed_out, h.error_msg INTO v_resp
      FROM net._http_response h WHERE h.id = r.req_id;
    IF NOT FOUND THEN
      IF r.criado_em < now() - interval '15 minutes' THEN       -- perdida: tenta de novo
        DELETE FROM public.atrib_site_requisicoes WHERE req_id = r.req_id;
        IF r.tipo = 'clique' THEN
          UPDATE public.atrib_toques SET proxima_busca_em = now() WHERE id = r.toque_id AND clique_status = 'pendente';
        END IF;
      END IF;
      CONTINUE;
    END IF;
    DELETE FROM public.atrib_site_requisicoes WHERE req_id = r.req_id;
    IF v_resp.status_code IS DISTINCT FROM 200 THEN
      v_err := v_err + 1;
      INSERT INTO public.atrib_erros (etapa, referencia, detalhe)
      VALUES ('site_' || r.tipo, coalesce(r.toque_id::text, r.req_id::text),
              left(coalesce(v_resp.status_code::text, 'sem status') || ' ' || coalesce(v_resp.error_msg, v_resp.content, ''), 500));
      IF r.tipo = 'clique' THEN
        UPDATE public.atrib_toques
           SET clique_tentativas = clique_tentativas + 1,
               clique_status = CASE WHEN clique_tentativas + 1 >= v_max THEN 'nao_encontrado' ELSE 'pendente' END,
               proxima_busca_em = CASE WHEN clique_tentativas + 1 >= v_max THEN NULL
                                       ELSE now() + make_interval(mins => 5 * power(3, clique_tentativas)::int) END
         WHERE id = r.toque_id;
      END IF;
      CONTINUE;
    END IF;
    BEGIN
      v_body := v_resp.content::jsonb;
    EXCEPTION WHEN OTHERS THEN v_body := NULL;
    END;
    IF r.tipo = 'clique' THEN
      IF coalesce((v_body->>'encontrado')::boolean, false) THEN
        PERFORM public.fn_atrib_aplicar_clique(r.toque_id, v_body->'clique');
        v_ok := v_ok + 1;
      ELSE
        -- o registro do clique pode chegar depois da mensagem: tenta de novo (5, 15, 45 min…)
        UPDATE public.atrib_toques
           SET clique_tentativas = clique_tentativas + 1,
               clique_status = CASE WHEN clique_tentativas + 1 >= v_max THEN 'nao_encontrado' ELSE 'pendente' END,
               proxima_busca_em = CASE WHEN clique_tentativas + 1 >= v_max THEN NULL
                                       ELSE now() + make_interval(mins => 5 * power(3, clique_tentativas)::int) END
         WHERE id = r.toque_id;
        v_nao := v_nao + 1;
      END IF;
    ELSIF r.tipo = 'diario' AND jsonb_typeof(v_body) = 'array' THEN
      INSERT INTO public.atrib_cliques_whatsapp_diarios (dia, canal, campanha_id, campanha_nome, cliques, atualizado_em)
      SELECT (e->>'dia')::date, ch.canal, coalesce(e->>'utm_id', ''), max(e->>'utm_campaign'), sum((e->>'cliques')::int), now()
        FROM jsonb_array_elements(v_body) e
        CROSS JOIN LATERAL public.fn_atrib_canal(e->>'utm_source', e->>'utm_medium', e->>'referrer_host') ch
       GROUP BY 1, 2, 3
      ON CONFLICT (dia, canal, campanha_id) DO UPDATE
        SET cliques = excluded.cliques, campanha_nome = excluded.campanha_nome, atualizado_em = now();
    END IF;
  END LOOP;

  -- 2) novos pedidos de clique (no máximo 20 por rodada)
  FOR r IN SELECT t.id, t.ref FROM public.atrib_toques t
            WHERE t.clique_status = 'pendente' AND t.ref IS NOT NULL AND t.proxima_busca_em <= now()
              AND NOT EXISTS (SELECT 1 FROM public.atrib_site_requisicoes q WHERE q.toque_id = t.id)
            ORDER BY t.proxima_busca_em LIMIT 20 LOOP
    v_req := public.fn_atrib_site_post('obter_contato_clique_app', jsonb_build_object('p_ref', r.ref));
    EXIT WHEN v_req IS NULL;   -- segredos ainda não configurados
    INSERT INTO public.atrib_site_requisicoes (req_id, tipo, toque_id) VALUES (v_req, 'clique', r.id);
    v_env := v_env + 1;
  END LOOP;

  -- 3) contagem diária de cliques no WhatsApp (uma vez por hora, últimos 7 dias)
  IF NOT EXISTS (SELECT 1 FROM public.atrib_site_requisicoes q WHERE q.tipo = 'diario')
     AND coalesce((SELECT max(d.atualizado_em) FROM public.atrib_cliques_whatsapp_diarios d), '-infinity') < now() - interval '1 hour' THEN
    v_req := public.fn_atrib_site_post('contato_cliques_diarios_app',
               jsonb_build_object('p_desde', (now() AT TIME ZONE 'America/Sao_Paulo')::date - 7));
    IF v_req IS NOT NULL THEN
      INSERT INTO public.atrib_site_requisicoes (req_id, tipo) VALUES (v_req, 'diario');
    END IF;
  END IF;

  RETURN jsonb_build_object('encontrados', v_ok, 'nao_encontrados', v_nao, 'enviados', v_env, 'erros', v_err);
END $$;


-- ── Job: oportunidades, vínculos com a agenda e estado ───────────────
CREATE FUNCTION public.fn_atrib_processar()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  k       public.atrib_config;
  r       record;
  o       public.atrib_oportunidades;
  f       record;
  v_op    bigint;
  v_desde timestamptz;
  v_etapa text; v_max text; v_estado text; v_motivo text; v_mfonte text; v_quando timestamptz;
  n_ped int := 0; n_novo int := 0; n_vinc int := 0; n_mud int := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('atrib_processar')) THEN RETURN '{"ocupado":true}'; END IF;
  SELECT * INTO k FROM public.atrib_config WHERE id = 1;
  v_desde := greatest(k.inicio::timestamptz, now() - interval '180 days');

  -- 1) Pedidos de agendamento abertos pela Ju
  FOR r IN SELECT s.id, s.conversa_id, s.created_at, s.paciente_id
             FROM public.ju_solicitacoes s
            WHERE s.tipo = 'AGENDAMENTO' AND s.created_at >= v_desde
              AND NOT EXISTS (SELECT 1 FROM public.atrib_eventos e WHERE e.chave = 'pedido:' || s.id)
            ORDER BY s.created_at LOOP
    -- pedido de rotina de quem está em tratamento não é oportunidade nova
    CONTINUE WHEN r.paciente_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.agendamentos a JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
       WHERE a.paciente_id = r.paciente_id AND a.ativo AND cs.codigo = 'finalizado'
         AND a.data_hora < r.created_at AND a.data_hora >= r.created_at - make_interval(days => k.dias_tratamento_ativo));
    v_op := public.fn_atrib_oportunidade_para(r.conversa_id, r.created_at, 'pedido_agendamento');
    CONTINUE WHEN v_op IS NULL;
    INSERT INTO public.atrib_eventos (oportunidade_id, tipo, valor_novo, fonte, ocorrido_em, chave)
    VALUES (v_op, 'pedido', 'agendamento_solicitado', 'sistema', r.created_at, 'pedido:' || r.id)
    ON CONFLICT (chave) DO NOTHING;
    n_ped := n_ped + 1;
  END LOOP;

  -- 2) Primeiro contato de quem nunca falou com a clínica
  FOR r IN SELECT c.id, c.telefone, min(m.created_at) AS primeira
             FROM public.ju_conversas c JOIN public.ju_mensagens m ON m.conversa_id = c.id AND m.origem = 'CLIENTE'
            WHERE c.ultima_mensagem_cliente >= v_desde
              AND NOT EXISTS (SELECT 1 FROM public.atrib_oportunidades oo WHERE oo.conversa_id = c.id)
            GROUP BY c.id, c.telefone
           HAVING min(m.created_at) >= v_desde LOOP
    CONTINUE WHEN NOT public.fn_atrib_contato_novo(public.fn_atrib_tel_chave(r.telefone), r.id, r.primeira);
    IF public.fn_atrib_oportunidade_para(r.id, r.primeira, 'primeiro_contato') IS NOT NULL THEN
      n_novo := n_novo + 1;
    END IF;
  END LOOP;

  -- 3) Vínculo oportunidade ↔ agendamento: criança ligada ao telefone, agendamento
  --    criado na janela da oportunidade e antes da próxima, e criança que não
  --    estava em tratamento (paciente em tratamento não é oportunidade).
  WITH cand AS (
    SELECT oo.id AS op, a.id AS ag,
           EXISTS (SELECT 1 FROM public.ju_solicitacoes s
                    WHERE s.conversa_id = oo.conversa_id AND s.tipo = 'AGENDAMENTO' AND s.paciente_id = a.paciente_id
                      AND s.created_at BETWEEN oo.aberta_em - interval '2 hours' AND a.created_at) AS pedido_ok
      FROM public.atrib_oportunidades oo
      CROSS JOIN LATERAL public.fn_atrib_pacientes_do_contato(oo.telefone_chave) pc
      JOIN public.agendamentos a ON a.paciente_id = pc.paciente_id AND a.ativo
     WHERE oo.anonimizada_em IS NULL
       AND oo.aberta_em >= now() - make_interval(days => k.janela_vinculo_dias + 1)   -- só essas ainda podem ganhar agendamento
       AND a.created_at >= oo.aberta_em - interval '2 hours'
       AND a.created_at <  oo.aberta_em + make_interval(days => k.janela_vinculo_dias)
       AND a.created_at <  coalesce((SELECT min(o2.aberta_em) FROM public.atrib_oportunidades o2
                                      WHERE o2.conversa_id = oo.conversa_id AND o2.aberta_em > oo.aberta_em), 'infinity')
       AND NOT EXISTS (SELECT 1 FROM public.agendamentos a0 JOIN public.consulta_status c0 ON c0.id = a0.status_consulta_id
                        WHERE a0.paciente_id = a.paciente_id AND a0.ativo AND c0.codigo = 'finalizado'
                          AND a0.data_hora < oo.aberta_em
                          AND a0.data_hora >= oo.aberta_em - make_interval(days => k.dias_tratamento_ativo)))
  INSERT INTO public.atrib_oportunidade_agendamentos (oportunidade_id, agendamento_id, tipo_vinculo, confianca)
  SELECT op, ag, CASE WHEN pedido_ok THEN 'pedido_ju' ELSE 'provavel' END,
                 CASE WHEN pedido_ok THEN 'alta' ELSE 'media' END
    FROM cand
  ON CONFLICT (oportunidade_id, agendamento_id) DO UPDATE
    SET tipo_vinculo = 'pedido_ju', confianca = 'alta'
    WHERE public.atrib_oportunidade_agendamentos.tipo_vinculo = 'provavel'
      AND public.atrib_oportunidade_agendamentos.removido_em IS NULL
      AND excluded.tipo_vinculo = 'pedido_ju';
  GET DIAGNOSTICS n_vinc = ROW_COUNT;

  -- 4) Etapa e estado recalculados dos fatos
  -- só o que pode ter mudado: em andamento, nunca processada, revisão a cada
  -- 6 h (regras de tempo) ou com agendamento/evento novo desde a última vez.
  FOR o IN SELECT * FROM public.atrib_oportunidades x
            WHERE x.anonimizada_em IS NULL AND x.aberta_em >= now() - interval '400 days'
              AND (x.estado IN ('aberta','agendada') OR x.processada_em IS NULL
                   OR x.processada_em < now() - interval '6 hours'
                   OR x.updated_at > x.processada_em
                   OR EXISTS (SELECT 1 FROM public.atrib_oportunidade_agendamentos oa
                                JOIN public.agendamentos a ON a.id = oa.agendamento_id
                               WHERE oa.oportunidade_id = x.id
                                 AND (a.updated_at > x.processada_em - interval '10 minutes'
                                      OR oa.vinculado_em > x.processada_em - interval '10 minutes'))
                   OR EXISTS (SELECT 1 FROM public.atrib_eventos e
                               WHERE e.oportunidade_id = x.id AND e.registrado_em > x.processada_em - interval '10 minutes'))
            ORDER BY x.id LOOP
    SELECT
      EXISTS (SELECT 1 FROM public.atrib_eventos e WHERE e.oportunidade_id = o.id AND e.tipo = 'pedido') AS pedido,
      EXISTS (SELECT 1 FROM public.atrib_toques t WHERE t.oportunidade_id = o.id) AS toque,
      (o.telefone_chave IS NOT NULL AND EXISTS (SELECT 1 FROM public.pessoas p
          WHERE public.fn_atrib_tel_chave(p.telefone::text) = o.telefone_chave)) AS identificado,
      count(v.*) AS n_vinc,
      bool_or(v.cons IN ('agendado','confirmado')) AS valido,
      bool_or(v.cons = 'finalizado') AS final,
      bool_or(v.cons = 'finalizado' AND v.receita > 0) AS pago,
      bool_or(v.cons = 'faltou') AS falta,
      min(v.data_hora) FILTER (WHERE v.cons = 'finalizado') AS final_em,
      min(v.created_at) FILTER (WHERE v.cons IN ('agendado','confirmado','finalizado')) AS agendado_em,
      max(v.updated_at) AS ag_mudou_em,
      (SELECT max(m.created_at) FROM public.ju_mensagens m
        WHERE m.conversa_id = o.conversa_id AND m.origem = 'CLIENTE' AND m.created_at >= o.aberta_em) AS ult_msg,
      EXISTS (SELECT 1 FROM public.ju_solicitacoes s WHERE s.conversa_id = o.conversa_id AND s.tipo = 'EXTERNO'
                 AND s.created_at BETWEEN o.aberta_em - interval '2 hours' AND o.aberta_em + interval '30 days') AS externo,
      EXISTS (SELECT 1 FROM public.fn_atrib_pacientes_do_contato(o.telefone_chave) pc
                JOIN public.agendamentos a ON a.paciente_id = pc.paciente_id AND a.ativo
                JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
               WHERE cs.codigo = 'finalizado' AND a.data_hora < o.aberta_em
                 AND a.data_hora >= o.aberta_em - make_interval(days => k.dias_tratamento_ativo)) AS ja_paciente
    INTO f
    FROM (SELECT cs.codigo AS cons, a.data_hora, a.created_at, a.updated_at,
                 -- mesma regra de "recebida" da vw_atrib_receita_sessao, sem varrer todas as faturas
                 CASE WHEN ps.codigo IS DISTINCT FROM 'estornado'
                       AND (fa.status = 'pago' OR (fa.id IS NULL AND ps.codigo = 'pago')) THEN 1 ELSE 0 END AS receita
            FROM public.atrib_oportunidade_agendamentos oa
            JOIN public.agendamentos a ON a.id = oa.agendamento_id AND a.ativo
            JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
            LEFT JOIN public.pagamento_status ps ON ps.id = a.status_pagamento_id
            LEFT JOIN public.faturas fa ON fa.id = a.fatura_id AND fa.ativo
           WHERE oa.oportunidade_id = o.id AND oa.removido_em IS NULL) v;

    v_etapa := CASE WHEN f.pago THEN 'pago' WHEN f.final THEN 'atendido' WHEN f.valido THEN 'agendado'
                    WHEN f.pedido THEN 'agendamento_solicitado' WHEN o.qualificada_em IS NOT NULL THEN 'qualificado'
                    WHEN f.identificado THEN 'identificado' ELSE 'contato' END;
    v_max := CASE WHEN public.fn_atrib_etapa_ord(v_etapa) > public.fn_atrib_etapa_ord(o.etapa_maxima) THEN v_etapa ELSE o.etapa_maxima END;
    v_motivo := NULL; v_mfonte := NULL;
    IF o.revisao_humana ? 'estado' THEN
      v_estado := o.revisao_humana->>'estado'; v_quando := coalesce((o.revisao_humana->>'em')::timestamptz, now());
      v_motivo := o.revisao_humana->>'motivo_perda'; v_mfonte := CASE WHEN v_motivo IS NOT NULL THEN 'humano' END;
    ELSIF f.final THEN
      v_estado := 'convertida'; v_quando := f.final_em;
    ELSIF f.valido THEN
      v_estado := 'agendada'; v_quando := f.agendado_em;
    ELSIF f.n_vinc > 0 THEN
      v_estado := 'perdida'; v_quando := f.ag_mudou_em;
      v_motivo := CASE WHEN f.falta THEN 'faltou' ELSE 'cancelou' END; v_mfonte := 'sistema';
    ELSIF f.externo AND NOT f.pedido AND NOT f.toque THEN
      v_estado := 'descartada'; v_quando := o.aberta_em; v_motivo := 'nao_comercial'; v_mfonte := 'regra';
    ELSIF f.ja_paciente AND NOT f.pedido THEN
      v_estado := 'descartada'; v_quando := o.aberta_em; v_motivo := 'ja_paciente'; v_mfonte := 'regra';
    ELSIF greatest(o.aberta_em, coalesce(f.ult_msg, o.aberta_em)) < now() - make_interval(days => k.dias_sem_atividade) THEN
      v_estado := 'perdida';
      v_quando := greatest(o.aberta_em, coalesce(f.ult_msg, o.aberta_em)) + make_interval(days => k.dias_sem_atividade);
      v_motivo := coalesce(o.classificacao_ia->>'motivo_perda', 'sem_agendamento');
      v_mfonte := CASE WHEN o.classificacao_ia ? 'motivo_perda' THEN 'ia' ELSE 'regra' END;
    ELSE
      v_estado := 'aberta'; v_quando := o.aberta_em;
    END IF;
    IF v_motivo = 'preco' AND coalesce(o.classificacao_ia->>'evidencia', o.revisao_humana->>'evidencia') IS NULL THEN
      v_motivo := 'outro';   -- "preço" só com evidência
    END IF;

    IF v_etapa IS DISTINCT FROM o.etapa_atual OR v_max IS DISTINCT FROM o.etapa_maxima
       OR v_estado IS DISTINCT FROM o.estado OR v_motivo IS DISTINCT FROM o.motivo_perda THEN
      IF v_estado IS DISTINCT FROM o.estado THEN
        INSERT INTO public.atrib_eventos (oportunidade_id, tipo, valor_anterior, valor_novo, fonte, ocorrido_em, chave)
        VALUES (o.id, 'estado', o.estado, v_estado,
                CASE WHEN o.revisao_humana ? 'estado' THEN 'humano' WHEN v_mfonte = 'regra' THEN 'regra' ELSE 'sistema' END,
                coalesce(v_quando, now()),
                'op:' || o.id || ':estado:' || o.estado || '>' || v_estado || ':' || floor(extract(epoch FROM coalesce(v_quando, now())))::bigint)
        ON CONFLICT (chave) DO NOTHING;
      END IF;
      IF v_etapa IS DISTINCT FROM o.etapa_atual THEN
        INSERT INTO public.atrib_eventos (oportunidade_id, tipo, valor_anterior, valor_novo, fonte, ocorrido_em, chave)
        VALUES (o.id, 'etapa', o.etapa_atual, v_etapa, 'sistema', coalesce(v_quando, now()),
                'op:' || o.id || ':etapa:' || o.etapa_atual || '>' || v_etapa || ':' || floor(extract(epoch FROM coalesce(v_quando, now())))::bigint)
        ON CONFLICT (chave) DO NOTHING;
      END IF;
      IF v_motivo IS DISTINCT FROM o.motivo_perda AND v_motivo IS NOT NULL THEN
        INSERT INTO public.atrib_eventos (oportunidade_id, tipo, valor_anterior, valor_novo, fonte, evidencia, ocorrido_em, chave)
        VALUES (o.id, 'motivo', o.motivo_perda, v_motivo, coalesce(v_mfonte, 'sistema'),
                CASE v_mfonte WHEN 'ia' THEN o.classificacao_ia->>'evidencia' WHEN 'humano' THEN o.revisao_humana->>'evidencia' END,
                coalesce(v_quando, now()),
                'op:' || o.id || ':motivo:' || coalesce(o.motivo_perda, '-') || '>' || v_motivo || ':' || floor(extract(epoch FROM coalesce(v_quando, now())))::bigint)
        ON CONFLICT (chave) DO NOTHING;
      END IF;
      UPDATE public.atrib_oportunidades
         SET etapa_atual = v_etapa, etapa_maxima = v_max, estado = v_estado, estado_em = v_quando,
             motivo_perda = v_motivo, motivo_fonte = v_mfonte,
             motivo_evidencia = CASE v_mfonte WHEN 'ia' THEN o.classificacao_ia->>'evidencia'
                                              WHEN 'humano' THEN o.revisao_humana->>'evidencia' END,
             updated_at = now()
       WHERE id = o.id;
      n_mud := n_mud + 1;
    END IF;
    UPDATE public.atrib_oportunidades
       SET ultima_atividade_em = greatest(o.aberta_em, coalesce(f.ult_msg, o.aberta_em)), processada_em = now()
     WHERE id = o.id;
  END LOOP;

  RETURN jsonb_build_object('pedidos', n_ped, 'contatos_novos', n_novo, 'vinculos', n_vinc, 'mudancas', n_mud);
END $$;


-- ── Importação de custos (Google Ads Script; idempotente) ────────────
-- p = {plataforma, conta_id, fonte, linhas:[{data, campanha_id, campanha_nome, impressoes, cliques, custo_micros, moeda}]}
CREATE FUNCTION public.fn_atrib_custos_importar(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n int;
BEGIN
  IF coalesce(p->>'plataforma', '') NOT IN ('google_ads','meta_ads') OR coalesce(p->>'conta_id', '') = '' THEN
    RAISE EXCEPTION 'plataforma e conta_id obrigatórios';
  END IF;
  INSERT INTO public.atrib_custos_diarios (plataforma, conta_id, campanha_id, data, campanha_nome, impressoes, cliques,
                                           custo_micros, custo, moeda, fonte, atualizado_em)
  SELECT p->>'plataforma', p->>'conta_id', l->>'campanha_id', (l->>'data')::date, l->>'campanha_nome',
         (l->>'impressoes')::bigint, (l->>'cliques')::bigint, (l->>'custo_micros')::bigint,
         round((l->>'custo_micros')::numeric / 1000000, 2), coalesce(l->>'moeda', 'BRL'),
         coalesce(p->>'fonte', 'google_ads_script'), now()
    FROM jsonb_array_elements(p->'linhas') l
   WHERE coalesce(l->>'campanha_id', '') <> '' AND (l->>'data') IS NOT NULL
  ON CONFLICT (plataforma, conta_id, campanha_id, data) DO UPDATE
    SET campanha_nome = excluded.campanha_nome, impressoes = excluded.impressoes, cliques = excluded.cliques,
        custo_micros = excluded.custo_micros, custo = excluded.custo, moeda = excluded.moeda,
        fonte = excluded.fonte, atualizado_em = now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('linhas', n);
END $$;


-- ── Correção humana (painel do admin) ────────────────────────────────
-- campo: estado | motivo_perda | vinculo_confirmar | vinculo_remover | origem_declarada | limpar
CREATE FUNCTION public.fn_atrib_revisar(p_oportunidade bigint, p_campo text, p_valor text, p_observacao text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_me uuid; o public.atrib_oportunidades; v_ant text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'sem permissão'; END IF;
  SELECT id INTO v_me FROM public.pessoas WHERE auth_user_id = auth.uid();
  SELECT * INTO o FROM public.atrib_oportunidades WHERE id = p_oportunidade FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'oportunidade inexistente'; END IF;
  IF p_campo = 'estado' THEN
    IF p_valor NOT IN ('aberta','agendada','convertida','perdida','descartada') THEN RAISE EXCEPTION 'estado inválido'; END IF;
    v_ant := o.estado;
    UPDATE public.atrib_oportunidades
       SET revisao_humana = coalesce(revisao_humana, '{}'::jsonb) || jsonb_build_object('estado', p_valor, 'em', now(), 'evidencia', p_observacao)
     WHERE id = o.id;
  ELSIF p_campo = 'motivo_perda' THEN
    v_ant := o.motivo_perda;
    UPDATE public.atrib_oportunidades
       SET revisao_humana = coalesce(revisao_humana, '{}'::jsonb)
                            || jsonb_build_object('estado', 'perdida', 'motivo_perda', p_valor, 'em', now(), 'evidencia', p_observacao)
     WHERE id = o.id;
  ELSIF p_campo = 'vinculo_confirmar' THEN
    INSERT INTO public.atrib_oportunidade_agendamentos (oportunidade_id, agendamento_id, tipo_vinculo, confianca)
    VALUES (o.id, p_valor::uuid, 'humano', 'alta')
    ON CONFLICT (oportunidade_id, agendamento_id) DO UPDATE SET tipo_vinculo = 'humano', confianca = 'alta', removido_em = NULL;
  ELSIF p_campo = 'vinculo_remover' THEN
    UPDATE public.atrib_oportunidade_agendamentos SET removido_em = now()
     WHERE oportunidade_id = o.id AND agendamento_id = p_valor::uuid;
  ELSIF p_campo = 'origem_declarada' THEN
    INSERT INTO public.atrib_toques (oportunidade_id, conversa_id, origem_tipo, canal, clique_status, proxima_busca_em, declarado_por, mensagem_em)
    VALUES (o.id, o.conversa_id, 'declarada', p_valor, 'nao_se_aplica', NULL, v_me, now());
  ELSIF p_campo = 'limpar' THEN
    UPDATE public.atrib_oportunidades SET revisao_humana = NULL WHERE id = o.id;
  ELSE
    RAISE EXCEPTION 'campo inválido';
  END IF;
  INSERT INTO public.atrib_revisoes (oportunidade_id, campo, valor_anterior, valor_novo, observacao, revisor)
  VALUES (o.id, p_campo, v_ant, p_valor, p_observacao, v_me);
  INSERT INTO public.atrib_eventos (oportunidade_id, tipo, valor_anterior, valor_novo, fonte, evidencia, ocorrido_em, chave)
  VALUES (o.id, 'revisao', v_ant, p_campo || '=' || coalesce(p_valor, ''), 'humano', p_observacao, now(),
          'revisao:' || o.id || ':' || gen_random_uuid());
END $$;

REVOKE ALL ON FUNCTION public.fn_atrib_tel_chave(text), public.fn_atrib_etapa_ord(text), public.fn_atrib_canal(text, text, text)
  FROM anon;
REVOKE ALL ON FUNCTION public.fn_atrib_excluida(text, text), public.fn_atrib_pacientes_do_contato(text),
  public.fn_atrib_contato_novo(text, bigint, timestamptz), public.fn_atrib_oportunidade_para(bigint, timestamptz, text),
  public.fn_atrib_aplicar_clique(bigint, jsonb), public.fn_atrib_site_post(text, jsonb), public.fn_atrib_buscar_cliques(),
  public.fn_atrib_processar(), public.fn_atrib_custos_importar(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_atrib_processar(), public.fn_atrib_buscar_cliques(),
  public.fn_atrib_custos_importar(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.fn_atrib_revisar(bigint, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_atrib_revisar(bigint, text, text, text) TO authenticated;


-- =====================================================================
-- VISÕES (security_invoker: herdam a RLS, só admin vê)
-- =====================================================================

-- Receita por sessão. Fatura paga é rateada pelas sessões dela (valor_servico
-- = receita líquida); estorno zera; cancelada e paga fica "a_conciliar".
-- Limites conhecidos: pago_em de fatura antiga pode ser data pura gravada como
-- meia-noite UTC; cartão parcelado entra inteiro na data do pagamento.
CREATE VIEW public.vw_atrib_receita_sessao WITH (security_invoker = true) AS
WITH fat AS (
  SELECT a.fatura_id, sum(coalesce(a.valor_servico, 0)) AS soma, count(*) AS n
    FROM public.agendamentos a WHERE a.ativo AND a.fatura_id IS NOT NULL GROUP BY a.fatura_id)
SELECT a.id AS agendamento_id, a.paciente_id, a.data_hora, a.created_at,
       cs.codigo AS status_consulta, ps.codigo AS status_pagamento,
       a.valor_servico AS valor_previsto, a.fatura_id, f.status AS fatura_status, x.situacao,
       CASE x.situacao
         WHEN 'recebida' THEN round(coalesce(f.valor_servico, f.valor_total, 0)
                                    * CASE WHEN fat.soma > 0 THEN coalesce(a.valor_servico, 0) / fat.soma ELSE 1.0 / fat.n END, 2)
         WHEN 'recebida_manual' THEN coalesce(a.valor_servico, 0)
         ELSE 0 END AS receita_recebida,
       CASE WHEN x.situacao = 'recebida' THEN f.pago_em END AS recebida_em
  FROM public.agendamentos a
  JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
  LEFT JOIN public.pagamento_status ps ON ps.id = a.status_pagamento_id
  LEFT JOIN public.faturas f ON f.id = a.fatura_id AND f.ativo
  LEFT JOIN fat ON fat.fatura_id = a.fatura_id
  CROSS JOIN LATERAL (SELECT CASE
      WHEN ps.codigo = 'estornado' THEN 'estornada'
      WHEN (f.status = 'pago' OR (f.id IS NULL AND ps.codigo = 'pago')) AND cs.codigo IN ('cancelado','erro') THEN 'a_conciliar'
      WHEN f.status = 'pago' THEN 'recebida'
      WHEN f.id IS NULL AND ps.codigo = 'pago' THEN 'recebida_manual'
      WHEN cs.codigo IN ('cancelado','erro','reagendado') THEN 'sem_receita'
      ELSE 'pendente' END AS situacao) x
 WHERE a.ativo
   AND ((SELECT public.is_admin()) OR current_user IN ('postgres', 'service_role'));

-- Oportunidade com a origem (último toque da oportunidade).
CREATE VIEW public.vw_atrib_oportunidades WITH (security_invoker = true) AS
SELECT o.*,
       public.fn_atrib_etapa_ord(o.etapa_maxima) AS etapa_maxima_ord,
       lt.id AS toque_id, coalesce(lt.canal, 'nao_atribuido') AS canal, lt.plataforma, lt.campanha_id, lt.campanha_nome,
       lt.grupo_id, lt.palavra_chave AS palavra_chave_segmentacao,
       CASE WHEN lt.id IS NULL THEN 'nao_atribuida'
            WHEN lt.origem_tipo = 'declarada' THEN 'declarada'
            WHEN lt.clique_status = 'encontrado' THEN 'site_completa'
            WHEN lt.clique_status = 'pendente' THEN 'pendente'
            ELSE 'site_recuperada' END AS tipo_origem,
       ft.canal AS canal_primeiro_toque, ft.campanha_id AS campanha_primeiro_toque,
       (SELECT count(*) FROM public.atrib_toques t WHERE t.oportunidade_id = o.id) AS n_toques
  FROM public.atrib_oportunidades o
  LEFT JOIN LATERAL (SELECT t.* FROM public.atrib_toques t WHERE t.oportunidade_id = o.id
                      ORDER BY coalesce(t.mensagem_em, t.registrado_em) DESC, t.id DESC LIMIT 1) lt ON true
  LEFT JOIN LATERAL (SELECT t.* FROM public.atrib_toques t WHERE t.oportunidade_id = o.id
                      ORDER BY coalesce(t.clicado_em, t.mensagem_em, t.registrado_em), t.id LIMIT 1) ft ON true;

-- Aquisição = 1º atendimento realizado da CRIANÇA, creditado a UMA oportunidade:
-- vínculo mais forte (humano > pedido da Ju > provável), depois a que tem origem
-- rastreada (último toque não-direto), depois a mais recente. O toque creditado é
-- o último ANTES de o agendamento ser criado.
CREATE VIEW public.vw_atrib_aquisicoes WITH (security_invoker = true) AS
WITH prim AS (
  SELECT DISTINCT ON (a.paciente_id) a.paciente_id, a.id AS agendamento_id, a.data_hora AS aquisicao_em
    FROM public.agendamentos a JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
   WHERE a.ativo AND cs.codigo = 'finalizado'
   ORDER BY a.paciente_id, a.data_hora, a.id),
cand AS (
  SELECT p.paciente_id, oa.oportunidade_id,
         max(CASE oa.tipo_vinculo WHEN 'humano' THEN 3 WHEN 'pedido_ju' THEN 2 ELSE 1 END) AS forca,
         min(a.created_at) AS ag_criado_em
    FROM prim p
    JOIN public.agendamentos a ON a.paciente_id = p.paciente_id AND a.ativo AND a.created_at <= p.aquisicao_em
    JOIN public.atrib_oportunidade_agendamentos oa ON oa.agendamento_id = a.id AND oa.removido_em IS NULL
   GROUP BY p.paciente_id, oa.oportunidade_id),
cred AS (
  SELECT DISTINCT ON (c.paciente_id) c.paciente_id, c.oportunidade_id, c.ag_criado_em,
         CASE c.forca WHEN 3 THEN 'humano' WHEN 2 THEN 'pedido_ju' ELSE 'provavel' END AS tipo_vinculo,
         CASE WHEN c.forca >= 2 THEN 'alta' ELSE 'media' END AS confianca
    FROM cand c JOIN public.atrib_oportunidades o ON o.id = c.oportunidade_id
   ORDER BY c.paciente_id, c.forca DESC,
            EXISTS (SELECT 1 FROM public.atrib_toques t WHERE t.oportunidade_id = o.id) DESC,
            o.aberta_em DESC, o.id DESC)
SELECT p.paciente_id, p.agendamento_id AS primeiro_atendimento_id, p.aquisicao_em,
       date_trunc('month', p.aquisicao_em AT TIME ZONE 'UTC')::date AS mes,
       (p.aquisicao_em AT TIME ZONE 'UTC')::date >= (SELECT k.inicio FROM public.atrib_config k WHERE k.id = 1) AS periodo_rastreado,
       c.oportunidade_id, coalesce(c.tipo_vinculo, 'sem_vinculo') AS tipo_vinculo, c.confianca,
       coalesce(t.canal, 'nao_atribuido') AS canal, t.plataforma, t.campanha_id, t.campanha_nome,
       CASE WHEN c.oportunidade_id IS NULL THEN 'sem_vinculo'
            WHEN t.id IS NULL THEN 'nao_atribuida'
            WHEN t.origem_tipo = 'declarada' THEN 'declarada'
            WHEN t.clique_status = 'encontrado' THEN 'site_completa'
            WHEN t.clique_status = 'pendente' THEN 'pendente'
            ELSE 'site_recuperada' END AS tipo_origem,
       o.contato_novo,
       NOT EXISTS (SELECT 1 FROM public.pessoa_responsaveis r1
                     JOIN public.pessoa_responsaveis r2 ON r2.id_responsavel = r1.id_responsavel AND r2.id_pessoa <> r1.id_pessoa
                     JOIN public.agendamentos a2 ON a2.paciente_id = r2.id_pessoa AND a2.ativo AND a2.data_hora < p.aquisicao_em
                     JOIN public.consulta_status c2 ON c2.id = a2.status_consulta_id AND c2.codigo = 'finalizado'
                    WHERE r1.id_pessoa = p.paciente_id) AS familia_nova,
       coalesce(r.receita_primeira_sessao, 0) AS receita_primeira_sessao,
       coalesce(r.receita_30d, 0) AS receita_30d, coalesce(r.receita_90d, 0) AS receita_90d,
       coalesce(r.receita_180d, 0) AS receita_180d, coalesce(r.receita_total, 0) AS ltv_realizado,
       coalesce(r.sessoes_30d, 0) AS sessoes_30d, coalesce(r.sessoes_90d, 0) AS sessoes_90d,
       coalesce(r.sessoes_180d, 0) AS sessoes_180d, coalesce(r.sessoes_total, 0) AS sessoes_total,
       coalesce(r.sessoes_30d, 0) > 1 AS retornou_30d, coalesce(r.sessoes_90d, 0) > 1 AS retornou_90d,
       coalesce(r.sessoes_180d, 0) > 1 AS retornou_180d,
       ((now() AT TIME ZONE 'America/Sao_Paulo')::date - (p.aquisicao_em AT TIME ZONE 'UTC')::date) AS dias_desde_aquisicao
  FROM prim p
  LEFT JOIN cred c ON c.paciente_id = p.paciente_id
  LEFT JOIN public.atrib_oportunidades o ON o.id = c.oportunidade_id
  LEFT JOIN LATERAL (SELECT tt.* FROM public.atrib_toques tt WHERE tt.oportunidade_id = c.oportunidade_id
                      ORDER BY (coalesce(tt.mensagem_em, tt.registrado_em) <= c.ag_criado_em) DESC,
                               coalesce(tt.mensagem_em, tt.registrado_em) DESC, tt.id DESC
                      LIMIT 1) t ON true
  LEFT JOIN LATERAL (
    SELECT sum(rs.receita_recebida) FILTER (WHERE rs.agendamento_id = p.agendamento_id) AS receita_primeira_sessao,
           sum(rs.receita_recebida) FILTER (WHERE rs.data_hora < p.aquisicao_em + interval '30 days')  AS receita_30d,
           sum(rs.receita_recebida) FILTER (WHERE rs.data_hora < p.aquisicao_em + interval '90 days')  AS receita_90d,
           sum(rs.receita_recebida) FILTER (WHERE rs.data_hora < p.aquisicao_em + interval '180 days') AS receita_180d,
           sum(rs.receita_recebida) AS receita_total,
           count(*) FILTER (WHERE rs.status_consulta = 'finalizado' AND rs.data_hora < p.aquisicao_em + interval '30 days')  AS sessoes_30d,
           count(*) FILTER (WHERE rs.status_consulta = 'finalizado' AND rs.data_hora < p.aquisicao_em + interval '90 days')  AS sessoes_90d,
           count(*) FILTER (WHERE rs.status_consulta = 'finalizado' AND rs.data_hora < p.aquisicao_em + interval '180 days') AS sessoes_180d,
           count(*) FILTER (WHERE rs.status_consulta = 'finalizado') AS sessoes_total
      FROM public.vw_atrib_receita_sessao rs
     WHERE rs.paciente_id = p.paciente_id AND rs.data_hora >= p.aquisicao_em) r ON true;

-- Cada criança de cada oportunidade: nova (adquirida por ela), recorrente
-- (já atendida antes = retenção) ou ainda sem atendimento.
CREATE VIEW public.vw_atrib_oportunidade_pacientes WITH (security_invoker = true) AS
SELECT oa.oportunidade_id, a.paciente_id,
       CASE WHEN aq.oportunidade_id = oa.oportunidade_id THEN 'novo'
            WHEN aq.aquisicao_em IS NULL THEN 'sem_atendimento'
            WHEN aq.aquisicao_em < o.aberta_em THEN 'recorrente'
            ELSE 'novo_outra_oportunidade' END AS tipo_paciente,
       count(*) AS agendamentos,
       count(*) FILTER (WHERE rs.status_consulta = 'finalizado') AS atendimentos,
       coalesce(sum(rs.receita_recebida), 0) AS receita_vinculada
  FROM public.atrib_oportunidade_agendamentos oa
  JOIN public.atrib_oportunidades o ON o.id = oa.oportunidade_id
  JOIN public.agendamentos a ON a.id = oa.agendamento_id AND a.ativo
  LEFT JOIN public.vw_atrib_receita_sessao rs ON rs.agendamento_id = a.id
  LEFT JOIN public.vw_atrib_aquisicoes aq ON aq.paciente_id = a.paciente_id
 WHERE oa.removido_em IS NULL
 GROUP BY oa.oportunidade_id, a.paciente_id, aq.oportunidade_id, aq.aquisicao_em, o.aberta_em;

-- Funil por mês da oportunidade × origem.
CREATE VIEW public.vw_atrib_funil_mensal WITH (security_invoker = true) AS
SELECT date_trunc('month', o.aberta_em AT TIME ZONE 'America/Sao_Paulo')::date AS mes,
       o.canal, o.plataforma, o.campanha_id, max(o.campanha_nome) AS campanha_nome,
       count(*) AS oportunidades,
       count(*) FILTER (WHERE o.contato_novo) AS contatos_novos,
       count(*) FILTER (WHERE o.etapa_maxima_ord >= 2) AS identificadas,
       count(*) FILTER (WHERE o.etapa_maxima_ord >= 3) AS qualificadas,
       count(*) FILTER (WHERE o.etapa_maxima_ord >= 4) AS pediram_agendamento,
       count(*) FILTER (WHERE o.etapa_maxima_ord >= 5) AS agendaram,
       count(*) FILTER (WHERE o.etapa_maxima_ord >= 6) AS atendidas,
       count(*) FILTER (WHERE o.etapa_maxima_ord >= 7) AS pagas,
       count(*) FILTER (WHERE o.estado = 'aberta') AS em_aberto,
       count(*) FILTER (WHERE o.estado = 'agendada') AS agendadas_agora,
       count(*) FILTER (WHERE o.estado = 'perdida') AS perdidas,
       count(*) FILTER (WHERE o.estado = 'descartada') AS descartadas,
       count(*) FILTER (WHERE o.tipo_origem = 'site_recuperada') AS origem_recuperada
  FROM public.vw_atrib_oportunidades o
 WHERE o.anonimizada_em IS NULL
 GROUP BY 1, 2, 3, 4;

-- Campanha × mês: as três contagens, CAC e ROAS por horizonte. ROAS de um
-- horizonte só é "maduro" quando a coorte inteira já passou daquele prazo.
-- Amostra = novos pacientes; com poucos pacientes o número oscila.
CREATE VIEW public.vw_atrib_campanhas_mensal WITH (security_invoker = true) AS
WITH custo AS (
  SELECT date_trunc('month', d.data)::date AS mes, d.plataforma, d.campanha_id, max(d.campanha_nome) AS campanha_nome,
         sum(d.custo) AS investimento, sum(d.impressoes) AS impressoes, sum(d.cliques) AS cliques_anuncio
    FROM public.atrib_custos_diarios d GROUP BY 1, 2, 3),
wpp AS (
  SELECT date_trunc('month', w.dia)::date AS mes, w.campanha_id, sum(w.cliques) AS cliques_whatsapp
    FROM public.atrib_cliques_whatsapp_diarios w WHERE w.campanha_id <> '' GROUP BY 1, 2),
ops AS (
  SELECT date_trunc('month', o.aberta_em AT TIME ZONE 'America/Sao_Paulo')::date AS mes, o.plataforma, o.campanha_id,
         count(*) AS conversas, count(*) FILTER (WHERE o.etapa_maxima_ord >= 5) AS agendaram
    FROM public.vw_atrib_oportunidades o WHERE o.campanha_id IS NOT NULL GROUP BY 1, 2, 3),
aq AS (
  SELECT a.mes, a.plataforma, a.campanha_id, count(*) AS novos_pacientes,
         count(*) FILTER (WHERE a.familia_nova) AS familias_novas,
         sum(a.receita_primeira_sessao) AS r1, sum(a.receita_30d) AS r30, sum(a.receita_90d) AS r90,
         sum(a.receita_180d) AS r180, sum(a.ltv_realizado) AS ltv, min(a.dias_desde_aquisicao) AS idade_min
    FROM public.vw_atrib_aquisicoes a WHERE a.campanha_id IS NOT NULL GROUP BY 1, 2, 3),
base AS (
  SELECT mes, plataforma, campanha_id, c.campanha_nome, c.investimento, c.impressoes, c.cliques_anuncio,
         o.conversas, o.agendaram, a.novos_pacientes, a.familias_novas, a.r1, a.r30, a.r90, a.r180, a.ltv, a.idade_min
    FROM custo c
    FULL JOIN ops o USING (mes, plataforma, campanha_id)
    FULL JOIN aq a USING (mes, plataforma, campanha_id))
SELECT b.mes, b.plataforma, b.campanha_id,
       coalesce(b.campanha_nome, (SELECT max(t.campanha_nome) FROM public.atrib_toques t WHERE t.campanha_id = b.campanha_id)) AS campanha_nome,
       coalesce(b.investimento, 0) AS investimento, b.impressoes, b.cliques_anuncio, w.cliques_whatsapp,
       coalesce(b.conversas, 0) AS conversas_com_codigo, coalesce(b.agendaram, 0) AS agendaram,
       coalesce(b.novos_pacientes, 0) AS novos_pacientes, coalesce(b.familias_novas, 0) AS familias_novas,
       round(b.investimento / nullif(b.agendaram, 0), 2) AS custo_por_agendamento,
       round(b.investimento / nullif(b.novos_pacientes, 0), 2) AS cac_midia,
       round(b.r1 / nullif(b.investimento, 0), 2) AS roas_primeira_sessao,
       round(b.r30 / nullif(b.investimento, 0), 2) AS roas_30d,   coalesce(b.idade_min >= 30, false)  AS roas_30d_maduro,
       round(b.r90 / nullif(b.investimento, 0), 2) AS roas_90d,   coalesce(b.idade_min >= 90, false)  AS roas_90d_maduro,
       round(b.r180 / nullif(b.investimento, 0), 2) AS roas_180d, coalesce(b.idade_min >= 180, false) AS roas_180d_maduro,
       coalesce(b.ltv, 0) AS receita_acumulada, coalesce(b.novos_pacientes, 0) AS amostra
  FROM base b
  LEFT JOIN wpp w ON w.mes = b.mes AND w.campanha_id = b.campanha_id;

-- Qualidade da medição: sem isto o CAC atribuído parece o CAC total.
CREATE VIEW public.vw_atrib_cobertura_mensal WITH (security_invoker = true) AS
WITH aq AS (
  SELECT a.mes, count(*) AS novos_pacientes,
         count(*) FILTER (WHERE a.tipo_vinculo <> 'sem_vinculo') AS com_oportunidade,
         count(*) FILTER (WHERE a.tipo_origem = 'site_completa') AS origem_completa,
         count(*) FILTER (WHERE a.tipo_origem = 'site_recuperada') AS origem_recuperada,
         count(*) FILTER (WHERE a.tipo_origem = 'declarada') AS origem_declarada,
         count(*) FILTER (WHERE a.tipo_origem IN ('sem_vinculo','nao_atribuida')) AS nao_atribuidos,
         count(*) FILTER (WHERE a.confianca = 'alta') AS vinculo_alto
    FROM public.vw_atrib_aquisicoes a WHERE a.periodo_rastreado GROUP BY 1),
msg AS (
  SELECT date_trunc('month', t.mensagem_em AT TIME ZONE 'America/Sao_Paulo')::date AS mes,
         count(*) AS mensagens_com_codigo,
         count(*) FILTER (WHERE t.clique_status = 'encontrado') AS codigos_com_clique
    FROM public.atrib_toques t WHERE t.origem_tipo = 'site' GROUP BY 1),
cli AS (
  SELECT date_trunc('month', w.dia)::date AS mes, sum(w.cliques) AS cliques_whatsapp
    FROM public.atrib_cliques_whatsapp_diarios w GROUP BY 1)
SELECT mes, cli.cliques_whatsapp, msg.mensagens_com_codigo, msg.codigos_com_clique,
       round(100.0 * msg.mensagens_com_codigo / nullif(cli.cliques_whatsapp, 0), 1) AS pct_clique_virou_mensagem,
       aq.novos_pacientes, aq.com_oportunidade, aq.origem_completa, aq.origem_recuperada, aq.origem_declarada,
       aq.nao_atribuidos, aq.vinculo_alto,
       round(100.0 * aq.nao_atribuidos / nullif(aq.novos_pacientes, 0), 1) AS pct_nao_atribuidos
  FROM aq FULL JOIN msg USING (mes) FULL JOIN cli USING (mes);

REVOKE ALL ON public.vw_atrib_receita_sessao, public.vw_atrib_oportunidades, public.vw_atrib_aquisicoes,
  public.vw_atrib_oportunidade_pacientes, public.vw_atrib_funil_mensal, public.vw_atrib_campanhas_mensal,
  public.vw_atrib_cobertura_mensal FROM anon;


-- ── Carga inicial: códigos que já chegaram desde o início do site ────
-- Reescrever o conteúdo dispara o gatilho de captura (sem mudar o texto).
UPDATE public.ju_mensagens m SET conteudo = m.conteudo
 WHERE m.origem = 'CLIENTE' AND m.conteudo ~ 'RK-[A-HJ-NP-Z2-9]{8}'
   AND m.created_at >= (SELECT k.inicio FROM public.atrib_config k WHERE k.id = 1);

-- ── Jobs (pg_cron) ───────────────────────────────────────────────────
SELECT cron.schedule('atrib_processar', '*/5 * * * *', $c$SELECT public.fn_atrib_processar()$c$);
SELECT cron.schedule('atrib_buscar_cliques', '*/2 * * * *', $c$SELECT public.fn_atrib_buscar_cliques()$c$);
