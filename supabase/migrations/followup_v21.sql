-- =====================================================================
-- Follow-up automático V2.1 — sequência de até 2 mensagens (sombra)
-- =====================================================================
-- AI dev note (21/10/2026, especificação V2.1 do dono):
--   FU1: 1 h depois da última fala da clínica, em dia útil 9h-17h30, texto
--        escrito pela IA (redator) perto da hora de envio, validado no banco.
--   FU2: 24 h depois do FU1 aceito, texto fixo "Qualquer coisa, estamos por
--        aqui! 💚", só se a família não respondeu. Depois disso, silêncio.
--   Canal: uazapi. Autorização: todo contato que escreveu está autorizado;
--   só "recusada" (PARAR) bloqueia.
--   Continua em SOMBRA (envio_ativo = false): a sequência roda inteira, mas
--   cada envio vira SIMULADA (nada sai). Tentativas de sombra não contam para
--   os limites reais (sombra = true).
-- Regras (fn_followup_avaliar): classificação INALTERADA; só o tempo mínimo
-- passou de "1 dia útil" para minutos configuráveis (60), e a avaliação agora
-- roda a cada 10 min (upsert, sem apagar a análise da IA quando nada mudou).
-- =====================================================================

-- ── Configuração ─────────────────────────────────────────────────────
ALTER TABLE public.followup_config
  ADD COLUMN IF NOT EXISTS espera_min_minutos     int  NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS janela_inicio          time NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS janela_fim             time NOT NULL DEFAULT '17:30',
  ADD COLUMN IF NOT EXISTS fu2_horas              int  NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS texto_max_caracteres   int  NOT NULL DEFAULT 220,
  ADD COLUMN IF NOT EXISTS texto_validade_minutos int  NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS redator_max_tentativas int  NOT NULL DEFAULT 3;
UPDATE public.followup_config SET canal = 'uazapi', canal_autorizado = true, atualizado_em = now() WHERE id = 1;

-- Autorização: quem escreveu está autorizado (decisão do dono); PARAR = recusada.
ALTER TABLE public.followup_contatos ALTER COLUMN autorizacao SET DEFAULT 'confirmada';
ALTER TABLE public.followup_avaliacoes ALTER COLUMN autorizacao SET DEFAULT 'confirmada';

INSERT INTO public.followup_mensagens (codigo, cenario, texto, ativo, aprovado_canal)
VALUES ('FINAL', 'ENCERRAMENTO', 'Qualquer coisa, estamos por aqui! 💚', true, true)
ON CONFLICT (codigo) DO UPDATE SET texto = EXCLUDED.texto, ativo = true, aprovado_canal = true;
-- A, B, C e D (V1) ficam inativas: o FU1 agora é escrito pelo redator.
UPDATE public.followup_mensagens SET ativo = false WHERE codigo IN ('A','B','C','D');

-- ── Tentativas: sequência, sombra e texto ────────────────────────────
ALTER TABLE public.followup_tentativas
  ADD COLUMN IF NOT EXISTS sequencia            int NOT NULL DEFAULT 1 CHECK (sequencia IN (1, 2)),
  ADD COLUMN IF NOT EXISTS sombra               boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS base_em              timestamptz,  -- última fala da clínica que gerou a pendência
  ADD COLUMN IF NOT EXISTS anterior_id          uuid REFERENCES public.followup_tentativas(id),
  ADD COLUMN IF NOT EXISTS texto                text,
  ADD COLUMN IF NOT EXISTS texto_status         text CHECK (texto_status IN ('aprovado','reprovado','nao_gerado','erro')),
  ADD COLUMN IF NOT EXISTS texto_resultado      jsonb,
  ADD COLUMN IF NOT EXISTS texto_em             timestamptz,
  ADD COLUMN IF NOT EXISTS texto_tentativas     int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disparada_em         timestamptz;  -- última vez que foi mandada ao n8n
ALTER TABLE public.followup_tentativas DROP CONSTRAINT IF EXISTS followup_tentativas_oportunidade_id_tipo_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_followup_tentativas_seq
  ON public.followup_tentativas (oportunidade_id, tipo, sequencia, sombra);
ALTER TABLE public.followup_tentativas DROP CONSTRAINT IF EXISTS followup_tentativas_estado_check;
ALTER TABLE public.followup_tentativas ADD CONSTRAINT followup_tentativas_estado_check CHECK (estado IN
  ('IDENTIFICADA','ELEGIVEL','PROGRAMADA','CANCELADA','SUPRIMIDA','EM_ENVIO','ENVIADA','FALHOU',
   'ENTREGA_DESCONHECIDA','RESPONDIDA','CONVERTIDA','ENCERRADA','SIMULADA'));

-- ── Calendário: janela contínua 9h-17h30 em dia útil ─────────────────
CREATE OR REPLACE FUNCTION public.fn_followup_na_janela(p_em timestamptz)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT public.fn_followup_dia_util((p_em AT TIME ZONE 'America/Sao_Paulo')::date)
     AND (p_em AT TIME ZONE 'America/Sao_Paulo')::time >= k.janela_inicio
     AND (p_em AT TIME ZONE 'America/Sao_Paulo')::time <  k.janela_fim
    FROM public.followup_config k WHERE k.id = 1
$$;

-- primeiro instante >= p_desde que está dentro da janela
CREATE OR REPLACE FUNCTION public.fn_followup_proxima_janela(p_desde timestamptz)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE k public.followup_config; d date := (p_desde AT TIME ZONE 'America/Sao_Paulo')::date; i int; v timestamptz;
BEGIN
  SELECT * INTO k FROM public.followup_config WHERE id = 1;
  IF public.fn_followup_na_janela(p_desde) THEN RETURN p_desde; END IF;
  FOR i IN 0 .. 20 LOOP
    IF public.fn_followup_dia_util(d + i) THEN
      v := ((d + i) + k.janela_inicio) AT TIME ZONE 'America/Sao_Paulo';
      IF v >= p_desde THEN RETURN v; END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

-- ── Camada A: regras (mesma classificação; tempo em minutos; upsert) ──
CREATE OR REPLACE FUNCTION public.fn_followup_avaliar()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  k public.followup_config;
  v_dia   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  r       record;
  v_sit text; v_mot text; v_ctx text; v_txt text; v_nome text;
  v_evid text[]; v_acao text; v_conf text; v_pop text; v_aut text;
  v_cli   text; v_cli_t text; v_clin text; v_clin3 text;
  v_ult text; v_ult_clin timestamptz; v_ult_fam timestamptz; v_du int;
  v_pediu boolean; v_escolheu boolean; v_conv boolean; v_vencida boolean; v_pend boolean;
  v_re_recusa  text := '(n[ãa]o (quero|preciso|vou mais|tenho interesse)|desist|j[áa] (marquei|agendei|consegui|resolvi|fechei)|outra cl[íi]nica|n[ãa]o precisa mais|fica pra pr[óo]xima|por enquanto n[ãa]o)';
  v_re_saude   text := '(hospital|internad|interna[çc][ãa]o|pronto.?socorro|\mupa\M|emerg[êe]ncia|piorou|\muti\M)';
  v_re_vai_ver text := '(te (aviso|falo|retorno|chamo)|(vou|vamos) (ver|pensar|conversar|olhar|decidir)|semana que vem|m[êe]s que vem|depois (eu|te|a gente)|mais pra frente)';
  v_re_combin  text := '((me|nos) (chama|liga|manda mensagem|procura|avisa)|pode (me |nos )?(chamar|ligar|procurar)|(fala|fale) comigo|entra em contato|entre em contato).{0,40}(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|amanh[ãa]|semana que vem|m[êe]s que vem|\mdia \d|depois d)';
  v_re_pedido  text := '(agend|marcar|marca[çc]|hor[áa]rio|vaga|encaixe|dispon[íi]v|\m\d{1,2}\s?(h|hs|horas)\M|\d{1,2}:\d{2}|quando (tem|pode|d[áa]))';
  v_re_hora    text := '(\m\d{1,2}\s?(h|hs|horas)\M|\d{1,2}:\d{2})';
  v_re_conv    text := '(plano de sa[úu]de|\mplano\M|conv[êe]nio|assefaz|unimed|amil|bradesco sa|sul ?am[ée]rica|cassi|geap|postal sa)';
  v_re_pend    text := '(\?|hor[áa]rio|dispon[íi]v|cadastro|link|prefer[êe]|pode ser|confirm|preench|qual (dia|per[íi]odo|hor|o nome|a idade)|bairro|\mvaga)';
  v_re_despede text := '^\W*(disponha|obrigad|de nada|imagina|por nada|tenha um|estamos (à|a) disposi|qualquer (coisa|d[úu]vida)|fico (à|a) disposi|at[ée] (logo|mais|breve))';
  n_lin int := 0;
BEGIN
  SELECT * INTO k FROM public.followup_config WHERE id = 1;
  DELETE FROM public.followup_avaliacoes WHERE dia < v_dia - 90;

  FOR r IN
    SELECT o.id, x.conversa_id, x.telefone_chave, o.aberta_em, o.etapa_maxima_ord, c.telefone, c.sem_ia
      FROM public.vw_atrib_oportunidades_painel o
      JOIN public.atrib_oportunidades x ON x.id = o.id
      JOIN public.ju_conversas c ON c.id = x.conversa_id
     WHERE o.estado = 'aberta' AND o.intencao = 'contratar'
       AND o.aberta_em > now() - interval '30 days'
       AND NOT public.fn_ju_eh_equipe(c.telefone)
       AND NOT public.fn_ju_numero_teste(c.telefone)
     ORDER BY o.aberta_em DESC
  LOOP
    v_sit := NULL; v_mot := NULL; v_ctx := NULL; v_txt := NULL; v_nome := NULL;
    v_evid := '{}'; v_acao := NULL; v_conf := NULL; v_pop := NULL;

    SELECT m.origem INTO v_ult FROM public.ju_mensagens m
     WHERE m.conversa_id = r.conversa_id AND m.origem IN ('CLIENTE','HUMANO','JU')
     ORDER BY m.created_at DESC LIMIT 1;
    SELECT max(m.created_at) FILTER (WHERE m.origem IN ('HUMANO','JU')),
           max(m.created_at) FILTER (WHERE m.origem = 'CLIENTE')
      INTO v_ult_clin, v_ult_fam
      FROM public.ju_mensagens m WHERE m.conversa_id = r.conversa_id;
    SELECT string_agg(coalesce(q.conteudo, ''), ' | ') INTO v_cli FROM (
      SELECT m.conteudo FROM public.ju_mensagens m
       WHERE m.conversa_id = r.conversa_id AND m.origem = 'CLIENTE'
       ORDER BY m.created_at DESC LIMIT 3) q;
    SELECT string_agg(coalesce(m.conteudo, ''), ' | ' ORDER BY m.created_at) INTO v_cli_t
      FROM public.ju_mensagens m
     WHERE m.conversa_id = r.conversa_id AND m.origem = 'CLIENTE' AND m.created_at >= r.aberta_em - interval '1 day';
    SELECT m.conteudo INTO v_clin FROM public.ju_mensagens m
     WHERE m.conversa_id = r.conversa_id AND m.origem IN ('HUMANO','JU') AND btrim(coalesce(m.conteudo, '')) <> ''
     ORDER BY m.created_at DESC LIMIT 1;
    SELECT string_agg(q.conteudo, ' | ') INTO v_clin3 FROM (
      SELECT m.conteudo FROM public.ju_mensagens m
       WHERE m.conversa_id = r.conversa_id AND m.origem IN ('HUMANO','JU') AND btrim(coalesce(m.conteudo, '')) <> ''
       ORDER BY m.created_at DESC LIMIT 3) q;
    v_du := CASE WHEN v_ult_clin IS NOT NULL THEN public.fn_followup_dias_uteis(v_ult_clin, now()) END;

    v_escolheu := coalesce(v_cli_t, '') ~* v_re_hora;
    v_pediu := r.etapa_maxima_ord >= 4 OR coalesce(v_cli_t, '') ~* v_re_pedido
               OR coalesce(v_clin3, '') ~* 'cadastro.*agend|agend.*cadastro';
    v_conv := coalesce(v_cli_t, '') ~* v_re_conv
              OR coalesce(v_clin3, '') ~* 'n[ãa]o (atendemos|aceitamos|trabalhamos com|temos) (pelo |por |)(plano|conv[êe]nio)';
    v_vencida := EXISTS (
      SELECT 1 FROM public.ju_mensagens m
       WHERE m.conversa_id = r.conversa_id AND m.origem = 'CLIENTE' AND m.created_at >= r.aberta_em - interval '1 day'
         AND ((m.conteudo ~* '(\m(hoje|hj|agora)\M|ainda (hoje|nesta|nessa|essa|esta)|(nesta|nessa|essa|esta) (manh|tarde|noite))'
               AND (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date < v_dia)
           OR (m.conteudo ~* '\mamanh[ãa]\M'
               AND (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date + 1 < v_dia)
           OR m.conteudo ~* 'antes d[ao] (viagem|viajar|f[ée]rias)'));
    v_pend := coalesce(v_clin3, '') ~* v_re_pend
              AND NOT (coalesce(v_clin, '') ~* v_re_despede AND position('?' IN coalesce(v_clin, '')) = 0);

    IF r.sem_ia THEN v_sit := 'bloqueado'; v_mot := 'sem_ia';
    ELSIF EXISTS (SELECT 1 FROM public.ju_solicitacoes s
                   WHERE s.conversa_id = r.conversa_id AND s.status = 'ABERTA'
                     AND s.tipo IN ('RECLAMACAO','CLINICO','HUMANO','EXTERNO')) THEN
      v_sit := 'bloqueado';
      v_mot := 'pedido_aberto_' || lower((SELECT s.tipo FROM public.ju_solicitacoes s
                 WHERE s.conversa_id = r.conversa_id AND s.status = 'ABERTA'
                   AND s.tipo IN ('RECLAMACAO','CLINICO','HUMANO','EXTERNO') LIMIT 1));
    ELSIF r.telefone_chave IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.fn_atrib_pacientes_do_contato(r.telefone_chave) pc
              JOIN public.agendamentos a ON a.paciente_id = pc.paciente_id AND a.ativo
             WHERE a.created_at >= r.aberta_em) THEN
      v_sit := 'bloqueado'; v_mot := 'ja_tem_agendamento';
    ELSIF coalesce(v_cli, '') ~* v_re_recusa THEN v_sit := 'bloqueado'; v_mot := 'recusa_ou_resolvido';
    ELSIF coalesce(v_cli_t, '') ~* v_re_saude THEN v_sit := 'bloqueado'; v_mot := 'mencao_saude';
    ELSIF coalesce(v_clin3, '') ~* '(\mmarcad[oa]|\magendad[oa]|ficou (marcad|agendad)|est[áa] confirmad|confirmad[oa] (para|pra|dia|às|as))' THEN
      v_sit := 'bloqueado'; v_mot := 'clinica_ja_marcou'; v_pop := 'conferir_agenda';
    ELSIF v_ult IS NULL THEN v_sit := 'bloqueado'; v_mot := 'sem_mensagens';
    ELSIF v_ult = 'CLIENTE' THEN
      v_sit := 'aguardando_clinica'; v_mot := 'clinica_deve_resposta'; v_pop := 'responder_familia';
    ELSIF coalesce(v_cli, '') ~* v_re_combin THEN v_sit := 'retorno_combinado'; v_mot := 'familia_pediu_contato_em_data';
    ELSIF v_conv AND NOT v_pediu THEN v_sit := 'nao_elegivel'; v_mot := 'so_convenio';
    ELSIF v_conv THEN v_sit := 'revisar'; v_mot := 'convenio_com_interesse';
    ELSIF coalesce(v_cli, '') ~* v_re_vai_ver THEN v_sit := 'nao_elegivel'; v_mot := 'familia_vai_ver';
    ELSIF NOT v_pediu THEN v_sit := 'nao_elegivel'; v_mot := 'so_pesquisou';
    ELSIF v_vencida THEN v_sit := 'revisar'; v_mot := 'intencao_vencida';
    ELSIF NOT v_pend THEN v_sit := 'nao_elegivel'; v_mot := 'sem_pendencia_da_familia';
    -- V2.1: espera mínima em minutos (antes: 1 dia útil)
    ELSIF v_ult_clin IS NULL OR now() - v_ult_clin < make_interval(mins => k.espera_min_minutos) THEN
      v_sit := 'cedo'; v_mot := 'menos_de_' || k.espera_min_minutos || '_min';
    ELSIF v_du > k.validade_dias_uteis THEN v_sit := 'expirado'; v_mot := 'mais_de_' || k.validade_dias_uteis || '_dias_uteis';
    ELSIF EXISTS (SELECT 1 FROM public.followup_avaliacoes f
                   JOIN public.atrib_oportunidades x2 ON x2.id = f.oportunidade_id
                  WHERE f.dia = v_dia AND f.situacao = 'candidato' AND f.oportunidade_id <> r.id
                    AND x2.telefone_chave = r.telefone_chave) THEN
      v_sit := 'bloqueado'; v_mot := 'familia_ja_listada_hoje';
    ELSE v_sit := 'candidato'; v_mot := 'familia_parou';
    END IF;

    IF r.etapa_maxima_ord >= 4 THEN v_evid := array_append(v_evid, 'Pedido de agendamento registrado'); END IF;
    IF v_escolheu THEN v_evid := array_append(v_evid, 'Escolheu horário');
    ELSIF coalesce(v_cli_t, '') ~* v_re_pedido THEN v_evid := array_append(v_evid, 'Pediu horário'); END IF;
    IF coalesce(v_clin3, '') ~* 'cadastro' THEN v_evid := array_append(v_evid, 'Recebeu o pré-cadastro'); END IF;
    IF coalesce(v_clin3, '') ~* '(hor[áa]rio|dispon[íi]v|\mvaga)' THEN v_evid := array_append(v_evid, 'Recebeu opções de horário'); END IF;

    v_ctx := CASE WHEN coalesce(v_clin3, '') ~* '(domicili|em casa|bairro)' THEN 'domiciliar'
                  WHEN coalesce(v_clin3, '') ~* 'cadastro' THEN 'cadastro'
                  WHEN coalesce(v_clin3, '') ~* '(\d{1,2}\s?h(\d{2})?\M|\d{1,2}:\d{2}|hor[áa]rio|vaga|dispon[íi]vel)' THEN 'horarios'
                  ELSE 'geral' END;
    IF v_sit IN ('candidato','revisar','retorno_combinado') THEN
      v_acao := CASE v_ctx WHEN 'cadastro' THEN 'Concluir o cadastro' WHEN 'horarios' THEN 'Escolher um horário'
                           WHEN 'domiciliar' THEN 'Responder sobre o atendimento domiciliar' ELSE 'Responder à clínica' END;
      v_conf := CASE WHEN r.etapa_maxima_ord >= 4 OR v_escolheu OR coalesce(v_clin3, '') ~* 'cadastro.*agend|agend.*cadastro'
                     THEN 'alta' ELSE 'media' END;
    END IF;
    SELECT x.autorizacao INTO v_aut FROM public.followup_contatos x WHERE x.telefone_chave = r.telefone_chave;

    -- upsert: se a situação mudou (mensagem nova, prazo), a IA analisa de novo
    INSERT INTO public.followup_avaliacoes (dia, oportunidade_id, conversa_id, situacao, motivo, ultimo_autor,
        ultima_clinica_em, ultima_familia_em, dias_uteis, contexto, texto_sugerido,
        intencao, evidencia, acao_pendente, confianca, autorizacao, decisao_lolo, pendencia_operacional)
    VALUES (v_dia, r.id, r.conversa_id, v_sit, v_mot, v_ult, v_ult_clin, v_ult_fam, v_du,
        CASE WHEN v_sit IN ('candidato','revisar','retorno_combinado') THEN v_ctx END, NULL,
        CASE WHEN v_pediu THEN 'Solicitou agendamento' WHEN v_conv THEN 'Perguntou sobre convênio' ELSE 'Pesquisou serviço ou valor' END,
        nullif(array_to_string(v_evid, '; '), ''), v_acao, v_conf, coalesce(v_aut, 'confirmada'), NULL, v_pop)
    ON CONFLICT (oportunidade_id, dia) DO UPDATE SET
        avaliado_em = CASE WHEN (followup_avaliacoes.situacao, followup_avaliacoes.motivo,
                                 followup_avaliacoes.ultima_clinica_em, followup_avaliacoes.ultima_familia_em)
                                IS DISTINCT FROM (EXCLUDED.situacao, EXCLUDED.motivo, EXCLUDED.ultima_clinica_em, EXCLUDED.ultima_familia_em)
                           THEN now() ELSE followup_avaliacoes.avaliado_em END,
        ia_em = CASE WHEN (followup_avaliacoes.situacao, followup_avaliacoes.ultima_clinica_em, followup_avaliacoes.ultima_familia_em)
                          IS DISTINCT FROM (EXCLUDED.situacao, EXCLUDED.ultima_clinica_em, EXCLUDED.ultima_familia_em)
                     THEN NULL ELSE followup_avaliacoes.ia_em END,
        ia_classificacao = CASE WHEN (followup_avaliacoes.situacao, followup_avaliacoes.ultima_clinica_em, followup_avaliacoes.ultima_familia_em)
                          IS DISTINCT FROM (EXCLUDED.situacao, EXCLUDED.ultima_clinica_em, EXCLUDED.ultima_familia_em)
                     THEN NULL ELSE followup_avaliacoes.ia_classificacao END,
        decisao_motor = CASE WHEN (followup_avaliacoes.situacao, followup_avaliacoes.ultima_clinica_em, followup_avaliacoes.ultima_familia_em)
                          IS DISTINCT FROM (EXCLUDED.situacao, EXCLUDED.ultima_clinica_em, EXCLUDED.ultima_familia_em)
                     THEN NULL ELSE followup_avaliacoes.decisao_motor END,
        situacao = EXCLUDED.situacao, motivo = EXCLUDED.motivo, ultimo_autor = EXCLUDED.ultimo_autor,
        ultima_clinica_em = EXCLUDED.ultima_clinica_em, ultima_familia_em = EXCLUDED.ultima_familia_em,
        dias_uteis = EXCLUDED.dias_uteis, contexto = EXCLUDED.contexto, intencao = EXCLUDED.intencao,
        evidencia = EXCLUDED.evidencia, acao_pendente = EXCLUDED.acao_pendente, confianca = EXCLUDED.confianca,
        autorizacao = EXCLUDED.autorizacao, pendencia_operacional = EXCLUDED.pendencia_operacional;
    n_lin := n_lin + 1;
  END LOOP;

  RETURN (SELECT jsonb_object_agg(situacao, n) FROM (
            SELECT situacao, count(*) n FROM public.followup_avaliacoes WHERE dia = v_dia GROUP BY 1) z);
END $$;
REVOKE ALL ON FUNCTION public.fn_followup_avaliar() FROM PUBLIC, anon, authenticated;

-- ── Camada B: a IA só analisa o que pode virar decisão, e uma vez por estado ──
-- transcrição comum à IA analisadora e ao redator (máx. 40 mensagens)
CREATE OR REPLACE FUNCTION public.fn_followup_transcricao(p_conversa_id bigint, p_desde timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id,
           'autor', CASE q.origem WHEN 'CLIENTE' THEN 'FAMILIA' WHEN 'HUMANO' THEN 'CLINICA (Lolô/equipe)'
                                  WHEN 'JU' THEN 'CLINICA (Ju)' ELSE 'SISTEMA (mensagem automática)' END,
           'em', to_char(q.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'),
           'texto', CASE WHEN q.tipo = 'BOTAO' THEN '[tocou num botão] ' ELSE '' END
                    || coalesce(left(q.conteudo, CASE WHEN q.origem = 'AUTOMACAO' THEN 300 ELSE 700 END), '[mídia sem texto]'))
         ORDER BY q.created_at), '[]'::jsonb)
    FROM (SELECT m.* FROM public.ju_mensagens m
           WHERE m.conversa_id = p_conversa_id AND m.created_at >= p_desde
           ORDER BY m.created_at DESC LIMIT 40) q
$$;

CREATE OR REPLACE FUNCTION public.fn_followup_ia_item(p_avaliacao_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'avaliacao_id', f.id,
    'hoje', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ', '
            || (ARRAY['segunda','terça','quarta','quinta','sexta','sábado','domingo'])
               [extract(isodow FROM now() AT TIME ZONE 'America/Sao_Paulo')::int]
            || CASE WHEN public.fn_followup_dia_util((now() AT TIME ZONE 'America/Sao_Paulo')::date) THEN '' ELSE ' (não é dia útil)' END,
    'minutos_desde_ultima_fala_da_clinica',
      CASE WHEN f.ultima_clinica_em IS NOT NULL THEN floor(extract(epoch FROM now() - f.ultima_clinica_em) / 60)::int END,
    'dias_uteis_desde_ultima_fala_da_clinica',
      CASE WHEN f.ultima_clinica_em IS NOT NULL THEN public.fn_followup_dias_uteis_motor(f.ultima_clinica_em, now()) END,
    'conversa', public.fn_followup_transcricao(f.conversa_id, o.aberta_em - interval '2 days'))
    FROM public.followup_avaliacoes f
    JOIN public.atrib_oportunidades o ON o.id = f.oportunidade_id
   WHERE f.id = p_avaliacao_id
$$;

CREATE OR REPLACE FUNCTION public.fn_followup_ia_lote()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('itens', coalesce(jsonb_agg(public.fn_followup_ia_item(f.id) ORDER BY f.id), '[]'::jsonb))
    FROM public.followup_avaliacoes f
   WHERE f.dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date AND f.ia_em IS NULL
     AND f.situacao IN ('candidato','revisar','retorno_combinado')
     AND NOT EXISTS (SELECT 1 FROM public.followup_tentativas t WHERE t.oportunidade_id = f.oportunidade_id)
$$;

-- ── Camada C: decisão → tentativa FU1 (real ou sombra) ───────────────
CREATE OR REPLACE FUNCTION public.fn_followup_decidir(p_avaliacao_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  f public.followup_avaliacoes; k public.followup_config; x public.atrib_oportunidades;
  v_ia jsonb; v_dec text; v_mot text; v_imp text; v_aut text; v_id uuid; v_sombra boolean;
BEGIN
  SELECT * INTO f FROM public.followup_avaliacoes WHERE id = p_avaliacao_id FOR UPDATE;
  SELECT * INTO k FROM public.followup_config WHERE id = 1;
  SELECT * INTO x FROM public.atrib_oportunidades WHERE id = f.oportunidade_id;
  v_ia := f.ia_resultado;
  v_sombra := NOT (k.envio_ativo AND k.canal_autorizado);

  IF k.ia_ativa AND f.ia_em IS NULL THEN
    v_dec := 'AGUARDANDO_IA';
  ELSIF f.situacao = 'retorno_combinado' AND f.ia_classificacao = 'RETORNO_COMBINADO' THEN
    v_dec := 'RETORNO_COMBINADO'; v_mot := 'registrado_sem_programar';
  ELSIF f.situacao <> 'candidato' THEN
    v_dec := 'NAO_ENVIA'; v_mot := 'regras:' || f.situacao || ':' || f.motivo;
  ELSIF f.ia_classificacao IS DISTINCT FROM 'CANDIDATA' THEN
    v_dec := 'NAO_ENVIA'; v_mot := 'ia:' || coalesce(f.ia_classificacao, 'sem_resultado');
  ELSIF coalesce(v_ia ->> 'quem_deve_agir', '') <> 'FAMILIA' THEN
    v_dec := 'NAO_ENVIA'; v_mot := 'ia:quem_deve_agir=' || coalesce(v_ia ->> 'quem_deve_agir', '?');
  ELSIF jsonb_array_length(coalesce(v_ia -> 'sinais_de_preocupacao_clinica', '[]')) > 0 THEN
    v_dec := 'NAO_ENVIA'; v_mot := 'ia:preocupacao_clinica';
  ELSIF jsonb_array_length(coalesce(v_ia -> 'sinais_de_desinteresse', '[]')) > 0 THEN
    v_dec := 'NAO_ENVIA'; v_mot := 'ia:desinteresse';
  ELSE
    v_dec := 'ENVIARIA'; v_mot := 'regras_e_ia_concordam';
  END IF;

  IF v_dec = 'ENVIARIA' THEN
    SELECT c.autorizacao INTO v_aut FROM public.followup_contatos c WHERE c.telefone_chave = x.telefone_chave;
    v_imp := CASE
      WHEN coalesce(v_aut, 'confirmada') = 'recusada' THEN 'contato_recusou'
      WHEN EXISTS (SELECT 1 FROM public.followup_tentativas t
                    WHERE t.telefone_chave = x.telefone_chave AND t.tipo = 'RECUPERACAO_COMERCIAL' AND t.sequencia = 1
                      AND t.sombra = v_sombra AND t.oportunidade_id <> f.oportunidade_id
                      AND t.estado IN ('EM_ENVIO','ENVIADA','ENTREGA_DESCONHECIDA','RESPONDIDA','CONVERTIDA','ENCERRADA','SIMULADA','PROGRAMADA')
                      AND coalesce(t.tentativa_em, t.criada_em) > now() - make_interval(days => k.intervalo_familia_dias))
        THEN 'limite_familia_30_dias'
    END;
    IF v_imp IS NULL THEN
      INSERT INTO public.followup_tentativas (oportunidade_id, conversa_id, telefone_chave, tipo, sequencia, sombra, estado,
                                              motivo, avaliacao_id, mensagem_codigo, base_em, programada_para)
      VALUES (f.oportunidade_id, f.conversa_id, x.telefone_chave, 'RECUPERACAO_COMERCIAL', 1, v_sombra, 'PROGRAMADA',
              v_mot, f.id, 'IA', f.ultima_clinica_em,
              public.fn_followup_proxima_janela(greatest(now(), f.ultima_clinica_em + make_interval(mins => k.espera_min_minutos))))
      ON CONFLICT (oportunidade_id, tipo, sequencia, sombra) DO NOTHING
      RETURNING id INTO v_id;
      IF v_id IS NULL THEN v_imp := 'oportunidade_ja_tem_tentativa'; END IF;
    END IF;
  END IF;

  UPDATE public.followup_avaliacoes
     SET decisao_motor = v_dec, decisao_motivo = v_mot, envio_impedido_por = v_imp,
         mensagem_codigo = CASE WHEN v_id IS NOT NULL THEN 'IA' END
   WHERE id = f.id;
  RETURN jsonb_build_object('ok', true, 'decisao', v_dec, 'motivo', v_mot, 'impedido_por', v_imp,
                            'tentativa_id', v_id, 'sombra', v_sombra);
END $$;

-- ── Revalidação (vale para FU1 e FU2, real ou sombra) ────────────────
-- Devolve motivo NULL quando pode enviar. Motivos "de espera" deixam a
-- tentativa programada; os demais encerram (ver fn_followup_aplicar).
CREATE OR REPLACE FUNCTION public.fn_followup_revalidar(p_tentativa_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t public.followup_tentativas; a public.followup_tentativas; k public.followup_config; c public.ju_conversas;
  o public.atrib_oportunidades; v_aut text; v_desde timestamptz; v_agora timestamptz := now(); r text;
BEGIN
  SELECT * INTO t FROM public.followup_tentativas WHERE id = p_tentativa_id;
  SELECT * INTO a FROM public.followup_tentativas WHERE id = t.anterior_id;
  SELECT * INTO k FROM public.followup_config WHERE id = 1;
  SELECT * INTO c FROM public.ju_conversas WHERE id = t.conversa_id;
  SELECT * INTO o FROM public.atrib_oportunidades WHERE id = t.oportunidade_id;
  SELECT x.autorizacao INTO v_aut FROM public.followup_contatos x WHERE x.telefone_chave = t.telefone_chave;
  -- fatos posteriores a isto cancelam: FU1 = a fala da clínica que gerou a pendência; FU2 = o FU1
  v_desde := CASE WHEN t.sequencia = 1 THEN t.base_em ELSE a.tentativa_em END;

  r := CASE
    WHEN t.id IS NULL THEN 'tentativa_inexistente'
    WHEN t.estado <> 'PROGRAMADA' THEN 'estado_' || t.estado
    WHEN NOT t.sombra AND NOT k.envio_ativo THEN 'envio_desligado'
    WHEN NOT t.sombra AND NOT k.canal_autorizado THEN 'canal_nao_autorizado'
    WHEN c.sem_ia THEN 'sem_ia'
    WHEN coalesce(v_aut, 'confirmada') = 'recusada' THEN 'contato_recusou'
    WHEN o.estado IS DISTINCT FROM 'aberta' THEN 'oportunidade_' || coalesce(o.estado, 'inexistente')
    WHEN v_desde IS NULL THEN 'sem_referencia'
    WHEN EXISTS (SELECT 1 FROM public.ju_mensagens m WHERE m.conversa_id = t.conversa_id
                   AND m.origem = 'CLIENTE' AND m.created_at > v_desde) THEN 'familia_escreveu'
    WHEN t.telefone_chave IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.fn_atrib_pacientes_do_contato(t.telefone_chave) pc
             JOIN public.agendamentos ag ON ag.paciente_id = pc.paciente_id AND ag.ativo
            WHERE ag.created_at >= o.aberta_em) THEN 'ja_tem_agendamento'
    WHEN EXISTS (SELECT 1 FROM public.ju_mensagens m WHERE m.conversa_id = t.conversa_id
                   AND m.origem = 'HUMANO' AND m.created_at > v_desde)
      OR (t.sequencia = 1 AND EXISTS (SELECT 1 FROM public.ju_mensagens m WHERE m.conversa_id = t.conversa_id
                   AND m.origem = 'JU' AND m.created_at > v_desde))
      OR (c.status = 'PAUSADA' AND c.pause_until > v_agora)
      OR c.status = 'AGUARDANDO_EQUIPE' THEN 'lolo_conduzindo'
    WHEN EXISTS (SELECT 1 FROM public.ju_solicitacoes s WHERE s.conversa_id = t.conversa_id AND s.status = 'ABERTA'
                   AND s.tipo IN ('CLINICO','RECLAMACAO','HUMANO','EXTERNO')) THEN 'pedido_sensivel_aberto'
    WHEN t.sequencia = 2 AND a.estado NOT IN ('ENVIADA','SIMULADA') THEN 'fu1_' || coalesce(a.estado, 'inexistente')
    WHEN public.fn_followup_dias_uteis_motor(t.base_em, v_agora) > k.validade_dias_uteis THEN 'prazo_vencido'
    WHEN t.sequencia = 1 AND v_agora < t.base_em + make_interval(mins => k.espera_min_minutos) THEN 'cedo'
    WHEN t.sequencia = 2 AND v_agora < a.tentativa_em + make_interval(hours => k.fu2_horas) THEN 'cedo'
    WHEN NOT public.fn_followup_na_janela(v_agora) THEN 'fora_da_janela'
    WHEN t.programada_para IS NULL OR v_agora < t.programada_para THEN 'fora_da_janela'
    WHEN t.sequencia = 1 AND EXISTS (
           SELECT 1 FROM public.followup_tentativas z
            WHERE z.id <> t.id AND z.telefone_chave = t.telefone_chave AND z.tipo = 'RECUPERACAO_COMERCIAL'
              AND z.sequencia = 1 AND z.sombra = t.sombra AND z.oportunidade_id <> t.oportunidade_id
              AND z.estado IN ('EM_ENVIO','ENVIADA','ENTREGA_DESCONHECIDA','RESPONDIDA','CONVERTIDA','ENCERRADA','SIMULADA')
              AND z.tentativa_em > v_agora - make_interval(days => k.intervalo_familia_dias)) THEN 'limite_familia_30_dias'
    WHEN t.sequencia = 1 AND (t.texto_status IS DISTINCT FROM 'aprovado'
           OR t.texto_em < v_agora - make_interval(mins => k.texto_validade_minutos)) THEN 'texto_pendente'
    WHEN t.sequencia = 2 AND NOT EXISTS (SELECT 1 FROM public.followup_mensagens m
                                          WHERE m.codigo = 'FINAL' AND m.ativo AND m.aprovado_canal) THEN 'mensagem_nao_aprovada'
  END;
  RETURN jsonb_build_object('ok', r IS NULL, 'motivo', r);
END $$;

-- motivos que só adiam (a tentativa continua programada)
CREATE OR REPLACE FUNCTION public.fn_followup_motivo_espera(p_motivo text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT p_motivo IN ('fora_da_janela','envio_desligado','canal_nao_autorizado','cedo','texto_pendente')
$$;

-- aplica um motivo terminal: CANCELADA (algo aconteceu na conversa) ou SUPRIMIDA (bloqueio)
CREATE OR REPLACE FUNCTION public.fn_followup_aplicar(p_tentativa_id uuid, p_motivo text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.followup_tentativas
     SET estado = CASE WHEN p_motivo IN ('familia_escreveu','lolo_conduzindo','ja_tem_agendamento') THEN 'CANCELADA'
                       WHEN p_motivo LIKE 'fu1_%' OR p_motivo = 'prazo_vencido' THEN 'ENCERRADA'
                       ELSE 'SUPRIMIDA' END,
         motivo = p_motivo, atualizada_em = now()
   WHERE id = p_tentativa_id AND estado = 'PROGRAMADA'
$$;

-- ── Reserva atômica. Sombra: vira SIMULADA (nada é enviado) ──────────
CREATE OR REPLACE FUNCTION public.fn_followup_reservar(p_tentativa_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.followup_tentativas; v jsonb; v_texto text;
BEGIN
  SELECT * INTO t FROM public.followup_tentativas WHERE id = p_tentativa_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'tentativa_inexistente'); END IF;
  v := public.fn_followup_revalidar(p_tentativa_id);
  IF NOT (v ->> 'ok')::boolean THEN
    IF NOT public.fn_followup_motivo_espera(v ->> 'motivo') AND t.estado = 'PROGRAMADA' THEN
      PERFORM public.fn_followup_aplicar(t.id, v ->> 'motivo');
    END IF;
    RETURN v;
  END IF;
  v_texto := CASE WHEN t.sequencia = 1 THEN t.texto
                  ELSE (SELECT m.texto FROM public.followup_mensagens m WHERE m.codigo = 'FINAL') END;
  IF t.sombra THEN
    UPDATE public.followup_tentativas SET estado = 'SIMULADA', motivo = 'sombra', tentativa_em = now(),
           mensagem_codigo = CASE WHEN t.sequencia = 1 THEN 'IA' ELSE 'FINAL' END, atualizada_em = now()
     WHERE id = t.id;
    PERFORM public.fn_followup_pos_envio(t.id);
    RETURN jsonb_build_object('ok', true, 'sombra', true, 'tentativa_id', t.id, 'texto', v_texto);
  END IF;
  UPDATE public.followup_tentativas SET estado = 'EM_ENVIO', motivo = 'reservada', tentativa_em = now(),
         mensagem_codigo = CASE WHEN t.sequencia = 1 THEN 'IA' ELSE 'FINAL' END, atualizada_em = now()
   WHERE id = t.id;
  -- o eco volta como fala da Ju (não pausa a Ju nem parece a Lolô)
  PERFORM public.fn_ju_marcar_envio(t.conversa_id, v_texto);
  RETURN jsonb_build_object('ok', true, 'sombra', false, 'tentativa_id', t.id,
    'wa_chatid', (SELECT c.wa_chatid FROM public.ju_conversas c WHERE c.id = t.conversa_id), 'texto', v_texto);
END $$;

-- depois do FU1 aceito (ou simulado): programa o FU2; depois do FU2: encerra a sequência
CREATE OR REPLACE FUNCTION public.fn_followup_pos_envio(p_tentativa_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.followup_tentativas; k public.followup_config;
BEGIN
  SELECT * INTO t FROM public.followup_tentativas WHERE id = p_tentativa_id;
  SELECT * INTO k FROM public.followup_config WHERE id = 1;
  IF t.estado NOT IN ('ENVIADA','SIMULADA') THEN RETURN; END IF;
  IF t.sequencia = 1 THEN
    INSERT INTO public.followup_tentativas (oportunidade_id, conversa_id, telefone_chave, tipo, sequencia, sombra, estado,
                                            motivo, avaliacao_id, mensagem_codigo, base_em, anterior_id, programada_para)
    VALUES (t.oportunidade_id, t.conversa_id, t.telefone_chave, t.tipo, 2, t.sombra, 'PROGRAMADA',
            'fu1_aceito', t.avaliacao_id, 'FINAL', t.base_em, t.id,
            public.fn_followup_proxima_janela(t.tentativa_em + make_interval(hours => k.fu2_horas)))
    ON CONFLICT (oportunidade_id, tipo, sequencia, sombra) DO NOTHING;
  ELSE
    UPDATE public.followup_tentativas SET estado = 'ENCERRADA', motivo = 'sequencia_concluida', atualizada_em = now()
     WHERE id = t.anterior_id AND estado IN ('ENVIADA','SIMULADA');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_followup_resultado(p_tentativa_id uuid, p_estado text, p_provedor_id text, p_detalhe text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_estado NOT IN ('ENVIADA','FALHOU','ENTREGA_DESCONHECIDA') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'estado_invalido');
  END IF;
  UPDATE public.followup_tentativas
     SET estado = p_estado, motivo = 'provedor', provedor_id = p_provedor_id, provedor_detalhe = left(p_detalhe, 500),
         atualizada_em = now()
   WHERE id = p_tentativa_id AND estado = 'EM_ENVIO';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  PERFORM public.fn_followup_pos_envio(p_tentativa_id);  -- FU2 só nasce de ENVIADA
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── Redator: validação do texto proposto pela IA ─────────────────────
-- Regras objetivas. Qualquer falha = não envia (nunca troca por texto genérico).
CREATE OR REPLACE FUNCTION public.fn_followup_validar_texto(p_texto text, p_tipo text, p_cenario text,
                                                            p_ids int[], p_ids_validos int[], p_max int)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN btrim(coalesce(p_texto, '')) = '' THEN 'vazio'
    WHEN length(p_texto) > p_max THEN 'longo'
    WHEN length(p_texto) - length(replace(p_texto, '?', '')) > 1 THEN 'mais_de_uma_pergunta'
    WHEN p_texto ~ '\d' THEN 'numero_ou_horario'
    WHEN p_texto ~* '(r\$|\mreais\M|\mvalor|pre[çc]o|desconto|promo[çc]|gr[áa]tis|cupom|\mtaxa)' THEN 'valor_ou_desconto'
    WHEN p_texto ~* '(\mvaga|reservad|reserv(ei|amos)|garant|confirmad|est[áa] (agendad|marcad)|ficou (agendad|marcad)|dispon[íi]ve|consegui (um|uma|o|a) )' THEN 'promessa_de_vaga'
    WHEN p_texto ~* '(tosse|catarro|febre|respira|chiad|bronq|pneumon|asma|alergi|torcicolo|\mdor\M|doen[çc]|sintom|diagn|tratament|internad|hospital|cansad|secre[çc]|nariz|obstru|engasg|v[ôo]mit|diarr|refluxo|cl[íi]nic|melhor[ao]u|piorou|sa[úu]de del)' THEN 'conteudo_clinico'
    WHEN p_texto ~* '(percebe(mos|u|i)|n[ãa]o (respondeu|tivemos resposta|recebemos)|sem resposta|ainda n[ãa]o (respondeu|recebemos|recebi)|aguardando (sua|seu|a sua|o seu) (resposta|retorno)|sumiu|lembrete|lembrando que)' THEN 'cobranca_de_resposta'
    WHEN p_texto ~* '(sou a ju|ajudante da recep)' THEN 'reapresentacao'
    WHEN p_texto ~* '(\*ju:\*|https?://|www\.)' THEN 'prefixo_ou_link'
    WHEN p_texto ~* '\m(olhadinha|rapidinh|minutinh|certinh|direitinh|jeitinh|horarinh|cadastrinh|pouquinh)' THEN 'diminutivo'
    WHEN coalesce(array_length(p_ids, 1), 0) = 0 THEN 'sem_evidencia'
    WHEN NOT (p_ids <@ p_ids_validos) THEN 'evidencia_invalida'
    WHEN p_tipo NOT IN ('cadastro','escolha_de_horario','informacao_pendente','domiciliar') THEN 'pendencia_incerta'
    WHEN p_cenario = 'CADASTRO_PENDENTE' AND p_tipo <> 'cadastro' THEN 'pendencia_incoerente'
    WHEN p_cenario = 'OPCOES_HORARIO' AND p_tipo <> 'escolha_de_horario' THEN 'pendencia_incoerente'
    WHEN p_tipo = 'cadastro' AND p_texto !~* 'cadastr' THEN 'texto_fora_da_pendencia'
    WHEN p_tipo = 'escolha_de_horario' AND p_texto !~* '(hor[áa]rio|op[çc][õo]es|\mdia\M|per[íi]odo|manh[ãa]|tarde|agend)' THEN 'texto_fora_da_pendencia'
  END
$$;

CREATE OR REPLACE FUNCTION public.fn_followup_texto_registrar(p_tentativa_id uuid, p_resultado jsonb, p_modelo text, p_erro text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t public.followup_tentativas; k public.followup_config; v_cen text; v_ids_validos int[]; v_ids int[]; v_mot text;
BEGIN
  SELECT * INTO t FROM public.followup_tentativas WHERE id = p_tentativa_id FOR UPDATE;
  IF NOT FOUND OR t.estado <> 'PROGRAMADA' OR t.sequencia <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tentativa_nao_aceita_texto');
  END IF;
  SELECT * INTO k FROM public.followup_config WHERE id = 1;
  IF p_resultado IS NULL THEN  -- erro técnico: tenta de novo no próximo ciclo, até o limite
    UPDATE public.followup_tentativas
       SET texto_status = 'erro', texto_tentativas = texto_tentativas + 1, texto_resultado = jsonb_build_object('erro', left(p_erro, 300)),
           disparada_em = NULL, atualizada_em = now()
     WHERE id = t.id;
    IF t.texto_tentativas + 1 >= k.redator_max_tentativas THEN
      PERFORM public.fn_followup_aplicar(t.id, 'redator_falhou');
    END IF;
    RETURN jsonb_build_object('ok', false, 'motivo', 'erro_tecnico');
  END IF;
  IF NOT coalesce((p_resultado ->> 'gerar')::boolean, false) THEN
    UPDATE public.followup_tentativas SET texto_status = 'nao_gerado', texto_resultado = p_resultado, texto_em = now()
     WHERE id = t.id;
    PERFORM public.fn_followup_aplicar(t.id, 'ia_nao_gerou');
    RETURN jsonb_build_object('ok', false, 'motivo', 'ia_nao_gerou');
  END IF;
  SELECT f.ia_resultado ->> 'cenario' INTO v_cen FROM public.followup_avaliacoes f WHERE f.id = t.avaliacao_id;
  SELECT array_agg(m.id::int) INTO v_ids_validos FROM public.ju_mensagens m WHERE m.conversa_id = t.conversa_id;
  SELECT array_agg(e::int) INTO v_ids FROM jsonb_array_elements_text(coalesce(p_resultado -> 'evidencias_mensagem_ids', '[]')) e;
  v_mot := public.fn_followup_validar_texto(p_resultado ->> 'texto', p_resultado ->> 'tipo_pendencia', v_cen,
                                            coalesce(v_ids, '{}'), coalesce(v_ids_validos, '{}'), k.texto_max_caracteres);
  IF v_mot IS NOT NULL THEN
    UPDATE public.followup_tentativas SET texto_status = 'reprovado', texto_resultado = p_resultado, texto = p_resultado ->> 'texto',
           texto_em = now() WHERE id = t.id;
    PERFORM public.fn_followup_aplicar(t.id, 'texto_reprovado:' || v_mot);
    RETURN jsonb_build_object('ok', false, 'motivo', 'texto_reprovado:' || v_mot);
  END IF;
  UPDATE public.followup_tentativas
     SET texto = btrim(p_resultado ->> 'texto'), texto_status = 'aprovado', texto_resultado = p_resultado,
         texto_em = now(), atualizada_em = now()
   WHERE id = t.id;
  RETURN jsonb_build_object('ok', true, 'texto', btrim(p_resultado ->> 'texto'));
END $$;

-- ── Lote para o n8n "RK Follow-up - Envio" ───────────────────────────
-- Antes de chamar a IA, aplica os motivos terminais (não gasta crédito à toa).
CREATE OR REPLACE FUNCTION public.fn_followup_envio_lote()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t record; v jsonb; itens jsonb := '[]'::jsonb; k public.followup_config;
BEGIN
  SELECT * INTO k FROM public.followup_config WHERE id = 1;
  FOR t IN SELECT * FROM public.followup_tentativas
            WHERE estado = 'PROGRAMADA' AND programada_para <= now()
              AND (disparada_em IS NULL OR disparada_em < now() - interval '10 minutes')
            ORDER BY programada_para FOR UPDATE SKIP LOCKED
  LOOP
    -- texto aprovado que ficou velho: escreve de novo com a conversa atual
    IF t.sequencia = 1 AND t.texto_status = 'aprovado' AND t.texto_em < now() - make_interval(mins => k.texto_validade_minutos) THEN
      UPDATE public.followup_tentativas SET texto_status = NULL, texto = NULL WHERE id = t.id;
      t.texto_status := NULL;
    END IF;
    v := public.fn_followup_revalidar(t.id);
    IF NOT (v ->> 'ok')::boolean AND NOT public.fn_followup_motivo_espera(v ->> 'motivo') THEN
      PERFORM public.fn_followup_aplicar(t.id, v ->> 'motivo');
      CONTINUE;
    END IF;
    IF NOT (v ->> 'ok')::boolean AND v ->> 'motivo' <> 'texto_pendente' THEN CONTINUE; END IF;
    UPDATE public.followup_tentativas SET disparada_em = now() WHERE id = t.id;
    itens := itens || jsonb_build_object(
      'tentativa_id', t.id, 'sequencia', t.sequencia, 'sombra', t.sombra,
      'precisa_texto', t.sequencia = 1 AND t.texto_status IS DISTINCT FROM 'aprovado',
      'redacao', CASE WHEN t.sequencia = 1 AND t.texto_status IS DISTINCT FROM 'aprovado' THEN jsonb_build_object(
          'hoje', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
          'analise', (SELECT jsonb_build_object('cenario', f.ia_resultado ->> 'cenario',
                                                'pendencia_atual', f.ia_resultado ->> 'pendencia_atual',
                                                'acao_pendente', f.acao_pendente)
                        FROM public.followup_avaliacoes f WHERE f.id = t.avaliacao_id),
          'conversa', public.fn_followup_transcricao(t.conversa_id,
                        (SELECT o.aberta_em - interval '2 days' FROM public.atrib_oportunidades o WHERE o.id = t.oportunidade_id)))
        END);
  END LOOP;
  RETURN jsonb_build_object('itens', itens);
END $$;

CREATE OR REPLACE FUNCTION public.fn_followup_envio_disparar()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v jsonb; v_token text;
BEGIN
  v := public.fn_followup_envio_lote();
  IF jsonb_array_length(v -> 'itens') = 0 THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name = 'ju_tarefas_token';
  RETURN net.http_post(
    url := 'https://flows-principal.infusecomunicacao.online/webhook/rk-followup-envio-8e4a1c7d2f',
    body := v,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ju-tarefas', v_token),
    timeout_milliseconds := 10000);
END $$;

-- ── Manutenção: conversão, encerramento e varredura de programadas ───
CREATE OR REPLACE FUNCTION public.fn_followup_manutencao()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE k public.followup_config; n_conv int; n_enc int; n_var int := 0; pr record; v jsonb;
BEGIN
  SELECT * INTO k FROM public.followup_config WHERE id = 1;
  WITH c AS (
    UPDATE public.followup_tentativas t
       SET estado = 'CONVERTIDA', motivo = 'agendamento_depois_do_followup', atualizada_em = now(),
           agendamento_em = (SELECT min(a.created_at) FROM public.fn_atrib_pacientes_do_contato(t.telefone_chave) pc
                              JOIN public.agendamentos a ON a.paciente_id = pc.paciente_id AND a.ativo
                             WHERE a.created_at > t.tentativa_em)
     WHERE t.estado IN ('ENVIADA','ENTREGA_DESCONHECIDA','RESPONDIDA','SIMULADA','ENCERRADA') AND t.telefone_chave IS NOT NULL
       AND t.agendamento_em IS NULL AND t.tentativa_em > now() - interval '30 days'
       AND EXISTS (SELECT 1 FROM public.fn_atrib_pacientes_do_contato(t.telefone_chave) pc
                     JOIN public.agendamentos a ON a.paciente_id = pc.paciente_id AND a.ativo
                    WHERE a.created_at > t.tentativa_em)
    RETURNING 1)
  SELECT count(*) INTO n_conv FROM c;
  WITH e AS (
    UPDATE public.followup_tentativas t
       SET estado = 'ENCERRADA', motivo = 'sem_resposta', atualizada_em = now()
     WHERE t.estado IN ('ENVIADA','ENTREGA_DESCONHECIDA','SIMULADA')
       AND t.tentativa_em < now() - make_interval(days => k.dias_sem_resposta)
    RETURNING 1)
  SELECT count(*) INTO n_enc FROM e;
  -- programadas que perderam o sentido (família falou, agendou, prazo...) encerram já
  FOR pr IN SELECT id FROM public.followup_tentativas WHERE estado = 'PROGRAMADA' LOOP
    v := public.fn_followup_revalidar(pr.id);
    IF NOT (v ->> 'ok')::boolean AND NOT public.fn_followup_motivo_espera(v ->> 'motivo') THEN
      PERFORM public.fn_followup_aplicar(pr.id, v ->> 'motivo'); n_var := n_var + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('convertidas', n_conv, 'encerradas', n_enc, 'varridas', n_var);
END $$;

-- ── Ciclo completo (a cada 10 min no horário) ────────────────────────
CREATE OR REPLACE FUNCTION public.fn_followup_ciclo()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a jsonb; m jsonb; d record;
BEGIN
  a := public.fn_followup_avaliar();
  -- decisões que dependem só das regras (IA já analisou o mesmo estado) são refeitas
  FOR d IN SELECT id FROM public.followup_avaliacoes
            WHERE dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date AND ia_em IS NOT NULL AND decisao_motor IS NULL LOOP
    PERFORM public.fn_followup_decidir(d.id);
  END LOOP;
  PERFORM public.fn_followup_ia_disparar();
  m := public.fn_followup_manutencao();
  PERFORM public.fn_followup_envio_disparar();
  RETURN jsonb_build_object('regras', a, 'manutencao', m);
END $$;

-- ── Métricas (painel de Marketing) ───────────────────────────────────
CREATE OR REPLACE VIEW public.vw_followup_metricas WITH (security_invoker = true) AS
SELECT date_trunc('week', t.criada_em AT TIME ZONE 'America/Sao_Paulo')::date AS semana,
       t.sombra, t.sequencia, t.estado, split_part(coalesce(t.motivo, ''), ':', 1) AS motivo,
       count(*) AS tentativas,
       count(*) FILTER (WHERE t.texto_status = 'reprovado') AS textos_reprovados,
       count(*) FILTER (WHERE t.resposta_em IS NOT NULL) AS respondidas,
       count(*) FILTER (WHERE t.agendamento_em IS NOT NULL) AS com_agendamento_depois
  FROM public.followup_tentativas t
 GROUP BY 1, 2, 3, 4, 5;
REVOKE ALL ON public.vw_followup_metricas FROM PUBLIC, anon;
GRANT SELECT ON public.vw_followup_metricas TO authenticated;

-- ── Permissões ───────────────────────────────────────────────────────
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['fn_followup_na_janela(timestamptz)','fn_followup_proxima_janela(timestamptz)',
      'fn_followup_transcricao(bigint,timestamptz)','fn_followup_ia_item(bigint)','fn_followup_ia_lote()',
      'fn_followup_decidir(bigint)','fn_followup_revalidar(uuid)','fn_followup_motivo_espera(text)',
      'fn_followup_aplicar(uuid,text)','fn_followup_reservar(uuid)','fn_followup_pos_envio(uuid)',
      'fn_followup_resultado(uuid,text,text,text)','fn_followup_validar_texto(text,text,text,int[],int[],int)',
      'fn_followup_texto_registrar(uuid,jsonb,text,text)','fn_followup_envio_lote()','fn_followup_envio_disparar()',
      'fn_followup_manutencao()','fn_followup_ciclo()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END $$;

-- ── Agenda: ciclo a cada 10 min, seg-sex 9h-17h59 (Brasília) ─────────
SELECT cron.unschedule(j) FROM unnest(ARRAY['followup-sombra','followup-ia-repescagem','followup-ciclo']) j
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = j);
SELECT cron.schedule('followup-ciclo', '*/10 12-20 * * 1-5', $$SELECT public.fn_followup_ciclo()$$);
