-- =====================================================================
-- Follow-up — ETAPA 1 (sombra), refinamentos da auditoria do dono (21/10/2026)
-- =====================================================================
-- AI dev note: continua SÓ classificando. Depois desta versão as regras ficam
-- CONGELADAS até a comparação com uma leitura humana independente das
-- classificações novas (a amostra de 21/10 foi usada para calibrar).
--
-- Mudanças:
--  1. Validade da intenção: pedido para uma data que já passou ("hoje",
--     "agora", "amanhã" já vencido, "antes da viagem") → revisar, sem texto.
--  2. Pendência explícita: a clínica ter falado por último não basta; a última
--     fala precisa deixar algo para a família fazer (escolher horário, preencher
--     cadastro, responder pergunta). Fala de despedida ("Disponha", "tenha um
--     ótimo dia") sem pendência → nao_elegivel.
--  3. "Marcado" sem consulta no sistema → bloqueado + pendência operacional
--     conferir_agenda (só registrada; nada é notificado na sombra).
--  4. Revisão só quando há dúvida real: convênio sem interesse particular, "vou
--     ver" sem data e pesquisa de serviço → nao_elegivel; "me chama na sexta" →
--     retorno_combinado (respeitar o dia; não é retomada comercial);
--     convênio + interesse em agendar → revisar.
--  5. Registro completo: intenção, evidência (sem conteúdo clínico), próxima
--     ação da família, confiança, autorização (nao_confirmada: ainda não há
--     mecanismo de permissão) e decisão da Lolô (pendente).
-- Três trilhas separadas: comercial (este motor), operacional
-- (pendencia_operacional) e clínica (fica fora: bloqueado por saúde/CLINICO).
-- =====================================================================

ALTER TABLE public.followup_avaliacoes DROP CONSTRAINT IF EXISTS followup_avaliacoes_situacao_check;
ALTER TABLE public.followup_avaliacoes ADD CONSTRAINT followup_avaliacoes_situacao_check CHECK (situacao IN
  ('candidato','revisar','retorno_combinado','aguardando_clinica','cedo','expirado','nao_elegivel','bloqueado'));
ALTER TABLE public.followup_avaliacoes
  ADD COLUMN IF NOT EXISTS intencao              text,
  ADD COLUMN IF NOT EXISTS evidencia             text,
  ADD COLUMN IF NOT EXISTS acao_pendente         text,
  ADD COLUMN IF NOT EXISTS confianca             text CHECK (confianca IN ('alta','media')),
  ADD COLUMN IF NOT EXISTS autorizacao           text NOT NULL DEFAULT 'nao_confirmada'
                                                   CHECK (autorizacao IN ('confirmada','nao_confirmada','recusada')),
  ADD COLUMN IF NOT EXISTS decisao_lolo          text CHECK (decisao_lolo IN ('pendente','aprovada','descartada','adiada')),
  ADD COLUMN IF NOT EXISTS pendencia_operacional text;  -- conferir_agenda | responder_familia

CREATE OR REPLACE FUNCTION public.fn_followup_avaliar()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_dia   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  r       record;
  v_sit text; v_mot text; v_ctx text; v_txt text; v_nome text;
  v_evid text[]; v_acao text; v_conf text; v_pop text;
  v_cli   text;   -- últimas 3 mensagens da família
  v_cli_t text;   -- todas as mensagens da família desde a abertura
  v_clin  text;   -- última fala da clínica com texto
  v_clin3 text;   -- últimas 3 falas da clínica com texto
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
BEGIN
  DELETE FROM public.followup_avaliacoes WHERE dia = v_dia;
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
    -- falas da clínica sem texto (áudio/imagem sem transcrição) não contam
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
    -- pedido preso a um dia que já passou
    v_vencida := EXISTS (
      SELECT 1 FROM public.ju_mensagens m
       WHERE m.conversa_id = r.conversa_id AND m.origem = 'CLIENTE' AND m.created_at >= r.aberta_em - interval '1 day'
         AND ((m.conteudo ~* '(\m(hoje|hj|agora)\M|ainda (hoje|nesta|nessa|essa|esta)|(nesta|nessa|essa|esta) (manh|tarde|noite))'
               AND (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date < v_dia)
           OR (m.conteudo ~* '\mamanh[ãa]\M'
               AND (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date + 1 < v_dia)
           OR m.conteudo ~* 'antes d[ao] (viagem|viajar|f[ée]rias)'));
    -- a clínica deixou algo para a família fazer, e a última fala não é só despedida
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
      -- a Lolô disse que marcou, mas o sistema não achou consulta: conferir a agenda
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
    ELSIF v_du = 0 THEN v_sit := 'cedo'; v_mot := 'menos_de_1_dia_util';
    ELSIF v_du > 3 THEN v_sit := 'expirado'; v_mot := 'mais_de_3_dias_uteis';
    ELSIF EXISTS (SELECT 1 FROM public.followup_avaliacoes f
                   JOIN public.atrib_oportunidades x2 ON x2.id = f.oportunidade_id
                  WHERE f.dia = v_dia AND f.situacao = 'candidato'
                    AND x2.telefone_chave = r.telefone_chave) THEN
      v_sit := 'bloqueado'; v_mot := 'familia_ja_listada_hoje';
    ELSE v_sit := 'candidato'; v_mot := 'familia_parou';
    END IF;

    -- evidência neutra (sem conteúdo clínico) e próxima ação da família
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

    -- texto sugerido só para candidato; revisar e retorno combinado ficam com a Lolô
    IF v_sit = 'candidato' THEN
      SELECT initcap(split_part(btrim(min(p.nome)), ' ', 1)) INTO v_nome
        FROM public.pessoas p JOIN public.pessoa_tipos t ON t.id = p.id_tipo_pessoa
       WHERE r.telefone_chave IS NOT NULL AND t.codigo = 'responsavel' AND p.ativo
         AND public.fn_atrib_tel_chave(p.telefone::text) = r.telefone_chave
      HAVING count(*) = 1;
      v_txt := 'Oi' || coalesce(', ' || v_nome, '') || '! ' || CASE v_ctx
        WHEN 'cadastro'   THEN 'Sobre o agendamento que você pediu, ainda precisa de ajuda com o cadastro?'
        WHEN 'horarios'   THEN 'Ainda quer que a Lolô confira os horários pra você?'
        WHEN 'domiciliar' THEN 'Você ainda quer que a Lolô confira as opções de atendimento?'
        ELSE 'Você tinha pedido um horário com a gente. Ainda quer que a Lolô veja as opções?' END;
    END IF;

    INSERT INTO public.followup_avaliacoes (dia, oportunidade_id, conversa_id, situacao, motivo, ultimo_autor,
        ultima_clinica_em, ultima_familia_em, dias_uteis, contexto, texto_sugerido,
        intencao, evidencia, acao_pendente, confianca, autorizacao, decisao_lolo, pendencia_operacional)
    VALUES (v_dia, r.id, r.conversa_id, v_sit, v_mot, v_ult, v_ult_clin, v_ult_fam, v_du,
        CASE WHEN v_sit IN ('candidato','revisar','retorno_combinado') THEN v_ctx END, v_txt,
        CASE WHEN v_pediu THEN 'Solicitou agendamento' WHEN v_conv THEN 'Perguntou sobre convênio' ELSE 'Pesquisou serviço ou valor' END,
        nullif(array_to_string(v_evid, '; '), ''), v_acao, v_conf, 'nao_confirmada',
        CASE WHEN v_sit IN ('candidato','revisar','retorno_combinado') THEN 'pendente' END, v_pop);
  END LOOP;

  RETURN (SELECT jsonb_object_agg(situacao, n) FROM (
            SELECT situacao, count(*) n FROM public.followup_avaliacoes WHERE dia = v_dia GROUP BY 1) z);
END $$;
REVOKE ALL ON FUNCTION public.fn_followup_avaliar() FROM PUBLIC, anon, authenticated;
