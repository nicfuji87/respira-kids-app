-- =====================================================================
-- Monitor de falha da IA (OpenAI) → aviso no grupo 🔔 Notificações (22/10/2026)
-- =====================================================================
-- AI dev note: em 21/10 a OpenAI ficou sem crédito duas vezes; a Ju e o
-- follow-up pararam e ninguém soube. O aviso NÃO depende da IA:
--  1. Falhas entram em ju_ia_falhas: a Ju pelo n8n (fn_ju_ia_falha, no ramo de
--     erro do Atendimento); o follow-up por gatilho (ia_erro na avaliação e
--     texto_status = 'erro' na tentativa).
--  2. pg_cron ju-ia-monitor (2 em 2 min) roda fn_ju_ia_monitor(): decide e
--     manda o texto pelo webhook RK Ju - Tarefas (ramo "lembretes"), o mesmo
--     que já posta no 🔔 RK · Notificações.
-- Regras: avisa com 2 falhas em 15 min, ou já na 1ª se o erro for de crédito
-- ou limite; repete a cada 2 h enquanto durar; avisa quando voltar (primeiro
-- sucesso depois da última falha). Silêncio das 22h às 7h: o que acontecer à
-- noite sai às 7h (fora ainda → alerta; já voltou → resumo da janela).
-- =====================================================================

CREATE TABLE public.ju_ia_falhas (
  id          bigserial PRIMARY KEY,
  origem      text NOT NULL,
  erro        text,
  conversa_id bigint,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ju_ia_falhas_created ON public.ju_ia_falhas (created_at DESC);
ALTER TABLE public.ju_ia_falhas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_ia_falhas FROM anon, authenticated;

CREATE TABLE public.ju_ia_saude (
  id              int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  em_falha        boolean NOT NULL DEFAULT false,
  desde           timestamptz,          -- 1ª falha do episódio
  ate             timestamptz,          -- quando voltou (episódio fechado)
  ultima_falha_id bigint NOT NULL DEFAULT 0,
  ultimo_aviso_em timestamptz,
  aviso_noturno   boolean NOT NULL DEFAULT false, -- algo aconteceu no silêncio e ainda não foi dito
  updated_at      timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.ju_ia_saude (id, ultima_falha_id) VALUES (1, 0);
ALTER TABLE public.ju_ia_saude ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_ia_saude FROM anon, authenticated;

-- Registro pela n8n (ramo de erro da Ju).
CREATE FUNCTION public.fn_ju_ia_falha(p_origem text, p_erro text, p_conversa_id bigint DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$
  INSERT INTO public.ju_ia_falhas (origem, erro, conversa_id)
  VALUES (left(coalesce(p_origem, '?'), 60), left(p_erro, 1000), p_conversa_id);
$$;
REVOKE ALL ON FUNCTION public.fn_ju_ia_falha(text, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_ia_falha(text, text, bigint) TO service_role;

-- Gatilhos do follow-up (nunca quebram a gravação original).
CREATE FUNCTION public.fn_ju_ia_falha_followup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'followup_avaliacoes' THEN
      INSERT INTO public.ju_ia_falhas (origem, erro, conversa_id)
      VALUES ('Follow-up (análise)', left(NEW.ia_erro, 1000), NEW.conversa_id);
    ELSE
      INSERT INTO public.ju_ia_falhas (origem, erro, conversa_id)
      VALUES ('Follow-up (redação)', left(NEW.texto_resultado ->> 'erro', 1000), NEW.conversa_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $$;

-- Só quando o erro muda (o texto guardado traz o horário, então cada falha nova muda).
CREATE TRIGGER trg_ju_ia_falha_analise
AFTER UPDATE OF ia_erro ON public.followup_avaliacoes
FOR EACH ROW WHEN (NEW.ia_erro IS NOT NULL AND NEW.ia_erro IS DISTINCT FROM OLD.ia_erro)
EXECUTE FUNCTION public.fn_ju_ia_falha_followup();

CREATE TRIGGER trg_ju_ia_falha_redacao
AFTER UPDATE OF texto_tentativas ON public.followup_tentativas
FOR EACH ROW WHEN (NEW.texto_status = 'erro' AND NEW.texto_tentativas IS DISTINCT FROM OLD.texto_tentativas)
EXECUTE FUNCTION public.fn_ju_ia_falha_followup();

-- A IA respondeu depois de p_desde? (Ju real, Ju em sombra, analisador, redator)
CREATE FUNCTION public.fn_ju_ia_sucesso_desde(p_desde timestamptz) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT min(t) FROM (
    SELECT min(created_at) t FROM public.ju_sombra
     WHERE created_at > p_desde AND erro IS NULL AND btrim(coalesce(resposta, '')) <> ''
    UNION ALL
    SELECT min(created_at) FROM public.ju_mensagens WHERE created_at > p_desde AND origem = 'JU'
    UNION ALL
    SELECT min(ia_em) FROM public.followup_avaliacoes WHERE ia_em > p_desde AND ia_classificacao IS NOT NULL
    UNION ALL
    SELECT min(texto_em) FROM public.followup_tentativas
     WHERE texto_em > p_desde AND texto_status IN ('aprovado', 'reprovado', 'nao_gerado')
  ) x;
$$;

-- Texto curto do erro para a equipe.
CREATE FUNCTION public.fn_ju_ia_dica(p_erro text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT CASE
    WHEN p_erro ~* '(credit|quota|billing|insufficient)' THEN
      'Falta de crédito na OpenAI. Recarregar em platform.openai.com, em Billing.'
    WHEN p_erro ~* '(rate.?limit|429|too many requests)' THEN
      'Limite da OpenAI atingido (costuma ser falta de crédito). Conferir o saldo em platform.openai.com, em Billing.'
    ELSE 'Erro técnico: ' || left(regexp_replace(coalesce(p_erro, 'sem detalhe'), '\s+', ' ', 'g'), 140)
  END;
$$;

CREATE FUNCTION public.fn_ju_ia_monitor() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  s        public.ju_ia_saude;
  agora    timestamptz := now();
  hora     int := extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo');
  silencio boolean := hora >= 22 OR hora < 7;
  n_novas  int;
  max_id   bigint;
  primeira timestamptz;
  recentes int;
  ult_erro text;
  credito  boolean;
  volta    timestamptz;
  origens  text;
  sombra   boolean := coalesce((SELECT k.sombra FROM public.ju_config k WHERE k.id = 1), false);
  texto    text;
  fmt      text := 'HH24:MI';
  v_token  text;
BEGIN
  SELECT * INTO s FROM public.ju_ia_saude WHERE id = 1 FOR UPDATE;

  -- Sem episódio aberto, falha isolada com mais de 15 min é descartada (não
  -- pode abrir episódio depois nem puxar o "desde" para trás).
  IF NOT s.em_falha THEN
    UPDATE public.ju_ia_saude
       SET ultima_falha_id = greatest(s.ultima_falha_id,
             coalesce((SELECT max(id) FROM public.ju_ia_falhas WHERE created_at <= agora - interval '15 minutes'), 0))
     WHERE id = 1
    RETURNING * INTO s;
  END IF;

  SELECT count(*), max(id), min(created_at) INTO n_novas, max_id, primeira
    FROM public.ju_ia_falhas WHERE id > s.ultima_falha_id;
  SELECT f.erro INTO ult_erro FROM public.ju_ia_falhas f ORDER BY f.id DESC LIMIT 1;
  -- só falhas ainda não contadas (um episódio encerrado não ajuda a abrir outro)
  SELECT count(*) INTO recentes FROM public.ju_ia_falhas
   WHERE id > s.ultima_falha_id AND created_at > agora - interval '15 minutes';
  credito := coalesce(ult_erro ~* '(credit|quota|billing|insufficient|rate.?limit|429|too many requests)', false);

  IF NOT s.em_falha THEN
    IF n_novas = 0 THEN
      -- nada novo; resumo noturno pendente (episódio que abriu e fechou à noite)
      IF s.aviso_noturno AND NOT silencio THEN
        texto := 'ℹ️ Durante a noite a IA ficou fora do ar das ' || to_char(s.desde AT TIME ZONE 'America/Sao_Paulo', fmt)
                 || ' às ' || to_char(s.ate AT TIME ZONE 'America/Sao_Paulo', fmt) || '. Já voltou ao normal.';
        UPDATE public.ju_ia_saude SET aviso_noturno = false, ultimo_aviso_em = agora, updated_at = agora WHERE id = 1;
      ELSE
        RETURN 'ok';
      END IF;
    ELSIF recentes >= 2 OR credito THEN
      -- abre episódio
      SELECT string_agg(DISTINCT origem, ', ') INTO origens FROM public.ju_ia_falhas WHERE id > s.ultima_falha_id;
      UPDATE public.ju_ia_saude SET em_falha = true, desde = primeira, ate = NULL, ultima_falha_id = max_id,
             aviso_noturno = silencio, ultimo_aviso_em = CASE WHEN silencio THEN NULL ELSE agora END, updated_at = agora
       WHERE id = 1;
      IF silencio THEN RETURN 'falha aberta (silêncio)'; END IF;
      texto := '⚠️ A IA está fora do ar desde as ' || to_char(primeira AT TIME ZONE 'America/Sao_Paulo', fmt) || '.'
               || E'\nAfetado: ' || origens || '.'
               || E'\n' || public.fn_ju_ia_dica(ult_erro)
               || E'\n' || CASE WHEN sombra THEN 'A Ju está em modo sombra, então nenhuma família ficou sem resposta por isso.'
                                ELSE 'Enquanto isso, as conversas que a Ju pegaria vão para a secretaria.' END;
    ELSE
      RETURN 'falha isolada, aguardando';
    END IF;
  ELSE
    -- episódio aberto
    IF n_novas > 0 THEN
      UPDATE public.ju_ia_saude SET ultima_falha_id = max_id, updated_at = agora WHERE id = 1;
    END IF;
    volta := public.fn_ju_ia_sucesso_desde((SELECT max(created_at) FROM public.ju_ia_falhas));
    IF volta IS NOT NULL THEN
      UPDATE public.ju_ia_saude SET em_falha = false, ate = volta, updated_at = agora,
             aviso_noturno = silencio OR (s.aviso_noturno AND s.ultimo_aviso_em IS NULL)
       WHERE id = 1;
      IF silencio THEN RETURN 'voltou (silêncio)'; END IF;
      IF s.ultimo_aviso_em IS NULL THEN
        -- caiu e voltou sem nenhum aviso dado (noite): resumo
        texto := 'ℹ️ A IA ficou fora do ar das ' || to_char(s.desde AT TIME ZONE 'America/Sao_Paulo', fmt)
                 || ' às ' || to_char(volta AT TIME ZONE 'America/Sao_Paulo', fmt) || '. Já voltou ao normal.';
      ELSE
        texto := '✅ A IA voltou a funcionar às ' || to_char(volta AT TIME ZONE 'America/Sao_Paulo', fmt)
                 || ' (estava fora desde as ' || to_char(s.desde AT TIME ZONE 'America/Sao_Paulo', fmt) || ').';
      END IF;
      UPDATE public.ju_ia_saude SET aviso_noturno = false, ultimo_aviso_em = agora WHERE id = 1;
    ELSIF silencio THEN
      RETURN 'ainda fora (silêncio)';
    ELSIF s.ultimo_aviso_em IS NULL OR s.ultimo_aviso_em < agora - interval '2 hours' THEN
      SELECT string_agg(DISTINCT origem, ', ') INTO origens FROM public.ju_ia_falhas WHERE created_at >= s.desde;
      texto := '⚠️ A IA continua fora do ar (desde as ' || to_char(s.desde AT TIME ZONE 'America/Sao_Paulo', fmt)
               || CASE WHEN (s.desde AT TIME ZONE 'America/Sao_Paulo')::date < (agora AT TIME ZONE 'America/Sao_Paulo')::date
                       THEN ' de ' || to_char(s.desde AT TIME ZONE 'America/Sao_Paulo', 'DD/MM') ELSE '' END || ').'
               || E'\nAfetado: ' || origens || '.'
               || E'\n' || public.fn_ju_ia_dica(ult_erro);
      UPDATE public.ju_ia_saude SET ultimo_aviso_em = agora, aviso_noturno = false WHERE id = 1;
    ELSE
      RETURN 'ainda fora, já avisado';
    END IF;
  END IF;

  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name = 'ju_tarefas_token';
  PERFORM net.http_post(
    url := 'https://flows-principal.infusecomunicacao.online/webhook/rk-ju-tarefas-8c3f5a1d7e24',
    body := jsonb_build_object('retomar', '[]'::jsonb, 'notas', '[]'::jsonb,
                               'lembretes', jsonb_build_array(jsonb_build_object('texto', texto))),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ju-tarefas', v_token),
    timeout_milliseconds := 10000);
  RETURN 'avisado: ' || texto;
END $$;
REVOKE ALL ON FUNCTION public.fn_ju_ia_monitor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_ia_sucesso_desde(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_ia_falha_followup() FROM PUBLIC, anon, authenticated;

-- Limpeza: falhas com mais de 90 dias.
SELECT cron.schedule('ju-ia-monitor', '*/2 * * * *', $c$
  SELECT public.fn_ju_ia_monitor();
  DELETE FROM public.ju_ia_falhas WHERE created_at < now() - interval '90 days';
$c$);
