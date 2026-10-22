-- =====================================================================
-- Follow-up de agendamento interrompido — ETAPA 1 (sombra)
-- =====================================================================
-- AI dev note (21/10/2026, aprovado pelo dono): só IDENTIFICA candidatos e
-- registra o motivo. Não envia nada, não avisa grupo, não mexe em etiqueta.
-- Etapas seguintes (fila de aprovação da Lolô no app e envio) dependem de
-- revisar estes resultados com casos reais e da validação jurídica / canal.
--
-- Regras (plano do dono):
--   - só oportunidade com intenção de contratar, ainda aberta (sem agendamento);
--   - quem deve a próxima ação: última fala da clínica (Lolô/Ju) = família parou;
--     última fala da família = a CLÍNICA está devendo (aguardando_clinica: nunca
--     vira follow-up, é pendência interna);
--   - prazo: 1 a 3 dias úteis desde a última fala da clínica (0 = cedo, >3 = expirado);
--   - bloqueios: SEM IA, pedido aberto de reclamação/clínico/pessoa/externo,
--     agendamento novo da família, recusa ou "já resolvi", menção de hospital ou
--     piora, família que disse que retorna (revisar), equipe e números de teste,
--     clínica que já escreveu "marcado/agendado" (consulta ainda não ligada no
--     sistema) e clínica que respondeu que não atende plano/convênio;
--   - família que só pesquisou (não pediu horário nem chegou a pedido) = revisar;
--   - um candidato por família por dia (telefone);
--   - texto sugerido sem nome da criança, sem diagnóstico, sem preço, sem prometer vaga.
-- Ainda NÃO aplicado: limite de 1 retomada a cada 30 dias por contato e a
-- preferência nao_receber_followup (entram com a tabela de envios, etapa 2).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.followup_avaliacoes (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dia                date        NOT NULL,
  avaliado_em        timestamptz NOT NULL DEFAULT now(),
  oportunidade_id    bigint      NOT NULL,
  conversa_id        bigint      NOT NULL,
  situacao           text        NOT NULL CHECK (situacao IN
                       ('candidato','aguardando_clinica','cedo','expirado','revisar','bloqueado')),
  motivo             text        NOT NULL,
  ultimo_autor       text,
  ultima_clinica_em  timestamptz,
  ultima_familia_em  timestamptz,
  dias_uteis         int,
  contexto           text,       -- horarios | cadastro | domiciliar | geral
  texto_sugerido     text,
  UNIQUE (oportunidade_id, dia)
);
ALTER TABLE public.followup_avaliacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.followup_avaliacoes FROM PUBLIC, anon;
GRANT SELECT ON public.followup_avaliacoes TO authenticated;
DROP POLICY IF EXISTS followup_avaliacoes_ler ON public.followup_avaliacoes;
CREATE POLICY followup_avaliacoes_ler ON public.followup_avaliacoes
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR (SELECT public.is_secretaria()));

-- Dias úteis (seg-sex, fuso de Brasília) entre duas datas: conta (a, b].
-- Feriados ainda não entram (não há tabela de feriados no sistema).
CREATE OR REPLACE FUNCTION public.fn_followup_dias_uteis(p_de timestamptz, p_ate timestamptz)
RETURNS int LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT count(*)::int
    FROM generate_series((p_de AT TIME ZONE 'America/Sao_Paulo')::date + 1,
                         (p_ate AT TIME ZONE 'America/Sao_Paulo')::date, interval '1 day') d
   WHERE extract(isodow FROM d) BETWEEN 1 AND 5
$$;

CREATE OR REPLACE FUNCTION public.fn_followup_avaliar()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_dia  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  r      record;
  v_sit  text; v_mot text; v_ctx text; v_txt text; v_nome text;
  v_cli  text;  -- últimas mensagens da família (até 3)
  v_clin text;  -- última fala da clínica com texto
  v_clin3 text; -- últimas 3 falas da clínica com texto
  v_pediu boolean; -- a família pediu horário/agendamento em algum momento
  v_ult  text; v_ult_clin timestamptz; v_ult_fam timestamptz; v_du int;
  v_re_recusa  text := '(n[ãa]o (quero|preciso|vou mais|tenho interesse)|desist|j[áa] (marquei|agendei|consegui|resolvi|fechei)|outra cl[íi]nica|n[ãa]o precisa mais|fica pra pr[óo]xima|por enquanto n[ãa]o)';
  v_re_saude   text := '(hospital|internad|interna[çc][ãa]o|pronto.?socorro|\mupa\M|emerg[êe]ncia|piorou|\muti\M)';
  v_re_retorno text := '(te (aviso|falo|retorno|chamo)|(vou|vamos) (ver|pensar|conversar|olhar|decidir)|semana que vem|m[êe]s que vem|depois (eu|te|a gente)|mais pra frente)';
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
    -- falas da clínica sem texto (áudio/imagem sem transcrição) não contam para o contexto
    SELECT m.conteudo INTO v_clin FROM public.ju_mensagens m
     WHERE m.conversa_id = r.conversa_id AND m.origem IN ('HUMANO','JU') AND btrim(coalesce(m.conteudo, '')) <> ''
     ORDER BY m.created_at DESC LIMIT 1;
    SELECT string_agg(q.conteudo, ' | ') INTO v_clin3 FROM (
      SELECT m.conteudo FROM public.ju_mensagens m
       WHERE m.conversa_id = r.conversa_id AND m.origem IN ('HUMANO','JU') AND btrim(coalesce(m.conteudo, '')) <> ''
       ORDER BY m.created_at DESC LIMIT 3) q;
    v_pediu := r.etapa_maxima_ord >= 4 OR EXISTS (
      SELECT 1 FROM public.ju_mensagens m
       WHERE m.conversa_id = r.conversa_id AND m.origem = 'CLIENTE' AND m.created_at >= r.aberta_em - interval '1 day'
         AND m.conteudo ~* '(agend|marcar|marca[çc]|hor[áa]rio|vaga|encaixe|dispon[íi]v|\m\d{1,2}\s?(h|hs|horas)\M|\d{1,2}:\d{2}|quando (tem|pode|d[áa]))')
      -- a clínica mandou o cadastro "para agendar": a família já tinha pedido
      OR coalesce(v_clin3, '') ~* 'cadastro.*agend|agend.*cadastro';
    v_du := CASE WHEN v_ult_clin IS NOT NULL THEN public.fn_followup_dias_uteis(v_ult_clin, now()) END;

    -- bloqueios (o primeiro que valer)
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
    ELSIF coalesce(v_cli, '') ~* v_re_saude THEN v_sit := 'bloqueado'; v_mot := 'mencao_saude';
    ELSIF coalesce(v_clin3, '') ~* '(\mmarcad[oa]|\magendad[oa]|ficou (marcad|agendad)|est[áa] confirmad|confirmad[oa] (para|pra|dia|às|as))' THEN
      v_sit := 'bloqueado'; v_mot := 'clinica_ja_marcou';
    ELSIF coalesce(v_clin3, '') ~* 'n[ãa]o (atendemos|aceitamos|trabalhamos com|temos) (pelo |por |)(plano|conv[êe]nio)' THEN
      v_sit := 'bloqueado'; v_mot := 'sem_convenio';
    ELSIF v_ult IS NULL THEN v_sit := 'bloqueado'; v_mot := 'sem_mensagens';
    ELSIF v_ult = 'CLIENTE' THEN v_sit := 'aguardando_clinica'; v_mot := 'clinica_deve_resposta';
    ELSIF coalesce(v_cli, '') ~* v_re_retorno THEN v_sit := 'revisar'; v_mot := 'familia_disse_que_retorna';
    ELSIF coalesce(v_cli, '') || ' ' || coalesce((SELECT string_agg(m.conteudo, ' ') FROM public.ju_mensagens m
             WHERE m.conversa_id = r.conversa_id AND m.origem = 'CLIENTE' AND m.created_at >= r.aberta_em - interval '1 day'), '')
          ~* '(plano de sa[úu]de|\mplano\M|conv[êe]nio|assefaz|unimed|amil|bradesco sa|sul ?am[ée]rica|cassi|geap|postal sa)' THEN
      v_sit := 'revisar'; v_mot := 'perguntou_convenio';
    ELSIF NOT v_pediu THEN v_sit := 'revisar'; v_mot := 'so_pesquisou';
    ELSIF v_du = 0 THEN v_sit := 'cedo'; v_mot := 'menos_de_1_dia_util';
    ELSIF v_du > 3 THEN v_sit := 'expirado'; v_mot := 'mais_de_3_dias_uteis';
    ELSIF EXISTS (SELECT 1 FROM public.followup_avaliacoes f
                   JOIN public.atrib_oportunidades x2 ON x2.id = f.oportunidade_id
                  WHERE f.dia = v_dia AND f.situacao = 'candidato'
                    AND x2.telefone_chave = r.telefone_chave) THEN
      v_sit := 'bloqueado'; v_mot := 'familia_ja_listada_hoje';
    ELSE v_sit := 'candidato'; v_mot := 'familia_parou';
    END IF;

    -- texto sugerido só para candidato (em "revisar" a Lolô decide e escreve se quiser),
    -- escolhido pelo que a clínica disse por último
    IF v_sit = 'candidato' THEN
      v_ctx := CASE WHEN coalesce(v_clin, '') ~* '(domicili|em casa|bairro)' THEN 'domiciliar'
                    WHEN coalesce(v_clin, '') ~* 'cadastro' THEN 'cadastro'
                    WHEN coalesce(v_clin, '') ~* '(\d{1,2}\s?h(\d{2})?\M|\d{1,2}:\d{2}|hor[áa]rio|vaga|dispon[íi]vel)' THEN 'horarios'
                    ELSE 'geral' END;
      SELECT initcap(split_part(btrim(min(p.nome)), ' ', 1)) INTO v_nome
        FROM public.pessoas p JOIN public.pessoa_tipos t ON t.id = p.id_tipo_pessoa
       WHERE r.telefone_chave IS NOT NULL AND t.codigo = 'responsavel' AND p.ativo
         AND public.fn_atrib_tel_chave(p.telefone::text) = r.telefone_chave
      HAVING count(*) = 1;
      v_txt := 'Oi' || coalesce(', ' || v_nome, '') || '! ' || CASE v_ctx
        WHEN 'horarios'   THEN 'Ainda quer que a Lolô confira os horários pra você?'
        WHEN 'cadastro'   THEN 'Você ainda quer continuar com o agendamento? A Lolô pode te ajudar por aqui.'
        WHEN 'domiciliar' THEN 'Você ainda quer que a Lolô confira as opções de atendimento?'
        ELSE 'Você tinha pedido um horário com a gente. Ainda quer que a Lolô veja as opções?' END;
    END IF;

    INSERT INTO public.followup_avaliacoes (dia, oportunidade_id, conversa_id, situacao, motivo, ultimo_autor,
                                            ultima_clinica_em, ultima_familia_em, dias_uteis, contexto, texto_sugerido)
    VALUES (v_dia, r.id, r.conversa_id, v_sit, v_mot, v_ult, v_ult_clin, v_ult_fam, v_du, v_ctx, v_txt);
  END LOOP;

  RETURN (SELECT jsonb_object_agg(situacao, n) FROM (
            SELECT situacao, count(*) n FROM public.followup_avaliacoes WHERE dia = v_dia GROUP BY 1) z);
END $$;
REVOKE ALL ON FUNCTION public.fn_followup_avaliar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_followup_dias_uteis(timestamptz, timestamptz) FROM PUBLIC, anon;

-- Seg-sex 9h30 (Brasília) = 12h30 UTC. Só classifica; nada é enviado.
SELECT cron.unschedule('followup-sombra') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'followup-sombra');
SELECT cron.schedule('followup-sombra', '30 12 * * 1-5', $$SELECT public.fn_followup_avaliar()$$);
