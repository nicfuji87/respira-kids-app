-- 25/11/2026: pacote de melhorias da Ju a partir da análise de ~180 conversas (11 a 25/11), aprovado pelo dono.
-- Banco (este arquivo):
--  1) pendências sem brechas: tirar a etiqueta só dispensa se a equipe escreveu depois do pedido; promessa
--     da Ju ("a Lolô vai…", "a equipe vai conferir") não conta como resposta;
--  2) aviso ⏳ de pedido parado vale também para pacientes da casa (60 min de expediente) e cumprimento
--     sozinho da equipe ("Oi, tudo bem?") não conta como tratar o pedido;
--  3) turno: a Lolô "conduzindo" vale 30 min (era até 90); depois disso a Ju pode acolher uma vez
--     (flags lolo_sem_responder_min e ja_avisou_lolo_vendo);
--  4) gatilhos de saúde ganham tosse/catarro/secreção/saturação/ouvido/dor;
--  5) caso clínico urgente fora do expediente vai para o WhatsApp da Bruna com contato e resumo;
--  6) cancelamento com menos de 6 h pedido por texto: a Ju cancela com o aviso da cláusula de 50%, igual ao botão;
-- 11) aviso de contrato no máximo 2 vezes em 30 dias e nunca logo depois de um cancelamento; contrato
--     recusado pela Assinafy avisa o dono no celular;
-- 12) lembrete de fixo (link da agenda) espera a conversa acalmar (equipe falou há <60 min ou família há <20 min);
-- 13) recado para a fisio não gera alerta ⏰ quando a equipe já respondeu na conversa da família;
-- 14) turno sem mensagem nova da família não chama a IA; solicitações de erro técnico (rate limit) fechadas.

-- ───────────────────────── helper: mensagem da equipe que trata o pedido ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_ju_humano_trata(p text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- false para @ju (comando para a Ju) e para cumprimento sozinho ("Oi, tudo bem? Sou a Lolô")
  SELECT NOT (
    coalesce(p, '') ~* '^\s*@ju'
    OR (length(coalesce(p, '')) < 90
        AND coalesce(p, '') ~* '^\s*(oi+|ol[aá]|bom dia|boa tarde|boa noite|tudo bem|lol[oô] aqui|sou a lol[oô])'
        AND coalesce(p, '') !~ '\d'
        AND coalesce(p, '') !~* '(hor[aá]rio|agenda|marc|sess[aã]o|consulta|pagamento|pix|link|valor|nota|contrato|atestado|amanh[aã]|hoje)')
    OR coalesce(btrim(p), '') ~ '^[^[:alnum:]]*$'
  );
$function$;

-- ───────────────────────── 1) pendências ─────────────────────────
DO $$
DECLARE d text; n text;
  v_valida text := $v$EXISTS (SELECT 1 FROM ju_mensagens hh WHERE hh.conversa_id = c.id AND hh.origem = 'HUMANO'
                       AND public.fn_ju_humano_trata(hh.conteudo)
                       AND hh.created_at > coalesce((SELECT max(mm.created_at) FROM ju_mensagens mm
                                                      WHERE mm.conversa_id = c.id AND mm.origem = 'CLIENTE'
                                                        AND mm.created_at <= c.resumo_dispensado_em), '-infinity'::timestamptz))$v$;
BEGIN
  d := pg_get_functiondef('public.fn_ju_esperando_resposta(integer)'::regprocedure);
  n := replace(d, 'SELECT c.id, c.wa_chatid, c.telefone, c.sem_ia, c.resumo_dispensado_em, r.primeira_vez',
    'SELECT c.id, c.wa_chatid, c.telefone, c.sem_ia,
           CASE WHEN c.resumo_dispensado_em IS NOT NULL AND ' || v_valida || ' THEN c.resumo_dispensado_em END AS resumo_dispensado_em,
           (c.resumo_dispensado_em IS NOT NULL AND c.ultima_mensagem_cliente <= c.resumo_dispensado_em AND NOT ' || v_valida || ') AS etiqueta_sem_resposta,
           r.primeira_vez');
  n := replace(n, 'AND (c.resumo_dispensado_em IS NULL OR c.ultima_mensagem_cliente > c.resumo_dispensado_em)',
    'AND (c.resumo_dispensado_em IS NULL OR c.ultima_mensagem_cliente > c.resumo_dispensado_em OR NOT ' || v_valida || ')');
  n := replace(n, $a$(m2.origem = 'JU'
$a$, $a$(m2.origem = 'JU' AND coalesce(m2.conteudo, '') !~* '(a lol[oô]|a equipe|a recep[cç][aã]o|a secretaria|o financeiro)[^.!?]{0,25}(vai|v[aã]o|te respond|confer|verific|retorn|confirm)'
$a$);
  n := replace(n, $a$'sem_ia', p.sem_ia,$a$, $a$'sem_ia', p.sem_ia,
           'etiqueta_tirada_sem_resposta', p.etiqueta_sem_resposta,$a$);
  IF n = d OR strpos(n, 'etiqueta_sem_resposta') = 0 OR strpos(n, 'te respond|confer') = 0
     OR strpos(n, 'etiqueta_tirada_sem_resposta') = 0 THEN
    RAISE EXCEPTION 'esperando_resposta: trecho não encontrado';
  END IF;
  EXECUTE n;
END $$;

-- ───────────────────────── 2) aviso ⏳ de pedido parado ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_ju_oportunidade_espera()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  GRUPO constant text := '120363433073436578@g.us';
  INICIO_TODOS constant timestamptz := '2026-11-25 21:00:00+00';  -- pacientes da casa: só pedidos a partir daqui
  x record; v_tok text; v_txt text; v_n int := 0; v_fim int := 0; v_min numeric; v_novo boolean; v_lim int;
BEGIN
  v_tok := fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';

  FOR x IN
    SELECT s.* FROM ju_solicitacoes s
     WHERE s.dados ? 'alerta_espera_em' AND NOT s.dados ? 'alerta_espera_fim'
  LOOP
    IF x.status <> 'ABERTA'
       OR EXISTS (SELECT 1 FROM ju_mensagens h WHERE h.conversa_id = x.conversa_id AND h.origem = 'HUMANO'
                    AND h.created_at > x.created_at AND fn_ju_humano_trata(h.conteudo))
       OR (x.tipo = 'AGENDAMENTO' AND EXISTS (SELECT 1 FROM agendamentos a WHERE a.ativo AND a.created_at > x.created_at
                    AND a.paciente_id = ANY (fn_le_pacientes_da_conversa(x.conversa_id)))) THEN
      UPDATE ju_solicitacoes SET dados = coalesce(dados, '{}'::jsonb) || jsonb_build_object('alerta_espera_fim', now())
       WHERE id = x.id;
      PERFORM fn_le_apagar(NULL, (x.dados ->> 'alerta_espera_req')::bigint);
      v_fim := v_fim + 1;
    END IF;
  END LOOP;

  IF v_tok IS NULL THEN RETURN jsonb_build_object('avisos', 0, 'resolvidos', v_fim); END IF;

  FOR x IN
    SELECT s.*, c.telefone, c.nome_whatsapp
      FROM ju_solicitacoes s JOIN ju_conversas c ON c.id = s.conversa_id
     WHERE s.status = 'ABERTA' AND NOT coalesce(s.dados ? 'alerta_espera_em', false)
       AND s.tipo IN ('AGENDAMENTO', 'REMARCACAO', 'CANCELAMENTO', 'FINANCEIRO', 'NOTA_FISCAL', 'CONTRATO', 'OUTRO')
       AND s.created_at > now() - interval '3 days' AND NOT c.sem_ia
       AND s.conversa_id NOT IN (SELECT unnest(fn_conversas_ids_teste()))
       AND NOT EXISTS (SELECT 1 FROM ju_mensagens h WHERE h.conversa_id = s.conversa_id AND h.origem = 'HUMANO'
                         AND h.created_at > s.created_at AND fn_ju_humano_trata(h.conteudo))
     ORDER BY s.created_at LIMIT 8
  LOOP
    v_novo := x.tipo = 'AGENDAMENTO' AND public.fn_ju_contato_novo(x.conversa_id);
    CONTINUE WHEN NOT v_novo AND x.created_at < INICIO_TODOS;
    v_lim := CASE WHEN v_novo THEN 15 ELSE 60 END;
    v_min := fn_ju_minutos_operacionais(x.created_at, now());
    CONTINUE WHEN v_min < v_lim;
    v_txt := CASE WHEN v_novo THEN '⏳ *Contato novo esperando há ' || floor(v_min)::int || ' min*'
                  ELSE '⏳ *Família esperando há ' || floor(v_min)::int || ' min*' END || E'\n'
          || coalesce(nullif(btrim(x.nome_whatsapp), ''), 'Família')
          || coalesce(' · ' || fn_lista_espera_tel_fmt(fn_lista_espera_tel(x.telefone)), '') || E'\n'
          || CASE WHEN v_novo THEN 'Quer agendar e ainda não teve resposta da equipe.'
                  ELSE 'Pedido: ' || left(regexp_replace(coalesce(x.resumo, '?'), '\s+', ' ', 'g'), 180) END
          || E'\n_Este aviso some quando alguém responder na conversa (um "oi" sozinho não conta)._';
    UPDATE ju_solicitacoes
       SET dados = coalesce(dados, '{}'::jsonb) || jsonb_build_object(
             'alerta_espera_em', now(), 'alerta_espera_min', v_min,
             'alerta_espera_req', net.http_post(url := 'https://infuse.uazapi.com/send/text',
               body := jsonb_build_object('number', GRUPO, 'text', v_txt)
                       || CASE WHEN x.notificacao_msg_id IS NOT NULL THEN jsonb_build_object('replyid', x.notificacao_msg_id) ELSE '{}'::jsonb END,
               headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
               timeout_milliseconds := 20000))
     WHERE id = x.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('avisos', v_n, 'resolvidos', v_fim);
END $function$;

-- ───────────────────────── 3) + 14) turno ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_ju_turno(p_conversa_id bigint, p_versao bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  c        public.ju_conversas;
  v_motivo text;
  v_ult_h  timestamptz;
  v_ult_j  timestamptz;
BEGIN
  SELECT * INTO c FROM public.ju_conversas WHERE id = p_conversa_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('pode', false, 'motivo', 'CONVERSA_INEXISTENTE');
  END IF;

  v_motivo := CASE
    WHEN c.sem_ia THEN 'SEM_IA'
    WHEN public.fn_ju_eh_equipe(c.telefone) THEN 'EQUIPE'
    WHEN NOT public.fn_ju_liberado(c.telefone) AND NOT public.fn_ju_sombra(c.telefone) THEN 'MODO_TESTE'
    WHEN c.message_version <> p_versao THEN 'MENSAGEM_NOVA'
    WHEN p_versao <= c.ultima_versao_respondida THEN 'JA_RESPONDIDA'
    WHEN EXISTS (SELECT 1 FROM public.ju_mensagens m
                 WHERE m.conversa_id = c.id AND m.origem = 'CLIENTE'
                   AND m.tipo IN ('AUDIO','IMAGE','DOCUMENT') AND m.conteudo IS NULL
                   AND m.created_at > now() - interval '2 minutes') THEN 'MIDIA_PENDENTE'
    -- 25/11/2026: sem mensagem nova da família nesta faixa de versões, não chama a IA
    WHEN NOT EXISTS (SELECT 1 FROM public.ju_mensagens m
                      WHERE m.conversa_id = c.id AND m.origem = 'CLIENTE'
                        AND m.versao > c.ultima_versao_respondida AND m.versao <= p_versao) THEN 'SEM_MENSAGEM_NOVA'
  END;
  IF v_motivo IS NOT NULL THEN
    RETURN jsonb_build_object('pode', false, 'motivo', v_motivo);
  END IF;

  SELECT max(h.created_at) INTO v_ult_h FROM public.ju_mensagens h WHERE h.conversa_id = c.id AND h.origem = 'HUMANO';
  SELECT max(j.created_at) INTO v_ult_j FROM public.ju_mensagens j WHERE j.conversa_id = c.id AND j.origem = 'JU';

  -- 20/11/2026: a Lolô está conduzindo e a mensagem não pede nada da Ju → não gasta IA.
  -- 25/11/2026: "conduzindo" vale 30 min desde a última fala dela (antes ia até 90 min no expediente
  -- e a família ficava no vácuo quando a Lolô sumia).
  IF v_ult_h > now() - interval '30 minutes'
     AND v_ult_h > coalesce(v_ult_j, '-infinity'::timestamptz)
     AND NOT public.fn_ju_precisa_ia_com_equipe(c.id) THEN
    INSERT INTO public.ia_uso (fluxo, conversa_id, modelo, chamadas, resultado, estimado, execucao)
    SELECT 'atendimento', c.id, 'gpt-6.2-sol', 0, 'pulada', true, 'v' || p_versao
     WHERE NOT EXISTS (SELECT 1 FROM public.ia_uso x WHERE x.conversa_id = c.id AND x.resultado = 'pulada'
                          AND x.execucao = 'v' || p_versao);
    RETURN jsonb_build_object('pode', false, 'motivo', 'EQUIPE_CONDUZINDO');
  END IF;

  RETURN jsonb_build_object(
    'pode', true,
    'so_cumprimento', public.fn_ju_so_cumprimento(c.id),
    'equipe_por_perto', (c.status = 'PAUSADA' AND c.pause_until > now())
       OR EXISTS (SELECT 1 FROM public.ju_mensagens h
                   WHERE h.conversa_id = c.id AND h.origem = 'HUMANO'
                     AND (h.created_at > now() - interval '30 minutes'
                          OR (h.created_at > now() - interval '90 minutes'
                              AND extract(isodow FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 1 AND 5
                              AND extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 8 AND 19))),
    'lolo_conduzindo', EXISTS (
       SELECT 1 FROM public.ju_mensagens h
        WHERE h.conversa_id = c.id AND h.origem = 'HUMANO'
          AND (h.created_at > now() - interval '30 minutes'
               OR (h.created_at > now() - interval '90 minutes'
                   AND extract(isodow FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 1 AND 5
                   AND extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 8 AND 19))
          AND h.created_at > coalesce(v_ult_j, '-infinity'::timestamptz)),
    -- 25/11/2026: a Lolô falou por último há mais de 30 min (e há menos de 4 h) e a família voltou a escrever
    'lolo_sem_responder_min', CASE WHEN v_ult_h IS NOT NULL AND v_ult_h <= now() - interval '30 minutes'
                                        AND v_ult_h > now() - interval '4 hours'
                                        AND v_ult_h > coalesce(v_ult_j, '-infinity'::timestamptz)
                                   THEN floor(extract(epoch FROM now() - v_ult_h) / 60)::int END,
    'ja_avisou_lolo_vendo', EXISTS (SELECT 1 FROM public.ju_mensagens j
                                     WHERE j.conversa_id = c.id AND j.origem = 'JU'
                                       AND j.created_at > coalesce(v_ult_h, now() - interval '1 day')
                                       AND j.conteudo ~* '(avisei|j[aá] (passei|chamei)).{0,40}lol[oô]|lol[oô].{0,20}(est[aá] vendo|j[aá] est[aá])'),
    'ultimo_autor', (SELECT CASE u.origem WHEN 'HUMANO' THEN 'LOLO' ELSE u.origem END
                       FROM public.ju_mensagens u
                      WHERE u.conversa_id = c.id AND u.origem <> 'CLIENTE'
                      ORDER BY u.created_at DESC LIMIT 1),
    'alerta_recente', (SELECT to_char(max(s.created_at) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
                         FROM public.ju_solicitacoes s
                        WHERE s.conversa_id = c.id AND s.tipo = 'CLINICO' AND s.urgente
                          AND s.created_at > now() - interval '24 hours'),
    'sombra', public.fn_ju_sombra(c.telefone),
    'primeira_interacao', NOT EXISTS (SELECT 1 FROM public.ju_mensagens j WHERE j.conversa_id = c.id AND j.origem = 'JU')
                         AND NOT (public.fn_ju_sombra(c.telefone)
                                  AND EXISTS (SELECT 1 FROM public.ju_sombra js
                                               WHERE js.conversa_id = c.id AND js.destino = 'familia' AND js.barrada IS NULL))
                         AND NOT EXISTS (SELECT 1 FROM public.ju_mensagens h WHERE h.conversa_id = c.id AND h.origem = 'HUMANO'
                                           AND h.created_at > now() - interval '24 hours'),
    'dentro_do_horario', (extract(isodow FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 1 AND 5
                          AND (now() AT TIME ZONE 'America/Sao_Paulo')::time >= time '08:00'
                          AND (now() AT TIME ZONE 'America/Sao_Paulo')::time < time '18:00'
                          AND NOT EXISTS (SELECT 1 FROM public.followup_feriados f
                                           WHERE f.dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date)),
    'wa_chatid', c.wa_chatid,
    'etiqueta_sem_ia', (SELECT k.etiqueta_sem_ia FROM public.ju_config k WHERE k.id = 1),
    'modo', CASE WHEN c.status = 'AGUARDANDO_EQUIPE' AND NOT public.fn_ju_pre_atendimento(c.id) THEN 'ANOTAR' ELSE 'RESPONDER' END,
    'oferta_vaga', public.fn_lista_espera_oferta(c.id),
    'oferta_horarios', public.fn_ju_oferta_atual(c.id),
    'contato_profissional', public.fn_ju_contato_profissional(c.id),
    'indicacoes_medicas', public.fn_ju_indicacoes_medicas(c.id),
    'contato_novo', public.fn_ju_contato_novo(c.id),
    'pre_atendimento', public.fn_ju_pre_atendimento(c.id),
      'pode_reservar', coalesce((public.fn_ju_reserva_elegivel(c.id) ->> 'ok')::boolean, false),
      'reserva_horario', public.fn_ju_reserva_atual(c.id),
    'nome_whatsapp', c.nome_whatsapp,
    'aviso_equipe_ja_dado', public.fn_ju_aviso_equipe_dado(c.id),
    'conversa_id', c.id,
    'versao', p_versao,
    'agora', (ARRAY['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'])
               [extract(dow FROM now() AT TIME ZONE 'America/Sao_Paulo')::int + 1]
             || ', ' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
    'feriados', coalesce((SELECT jsonb_agg(to_char(f.dia, 'DD/MM') || ' (' || (ARRAY['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[extract(dow FROM f.dia)::int + 1] || ') ' || f.nome ORDER BY f.dia)
                            FROM public.followup_feriados f
                           WHERE f.dia BETWEEN (now() AT TIME ZONE 'America/Sao_Paulo')::date
                                           AND (now() AT TIME ZONE 'America/Sao_Paulo')::date + 30), '[]'::jsonb),
    'cliente', public.fn_ju_json_enxuto(public.fn_ju_contexto_cliente(c.id)),
    'pedidos_abertos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('tipo', s.tipo, 'resumo', s.resumo,
                                          'aberto_em', to_char(s.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'))
                       ORDER BY s.created_at)
      FROM public.ju_solicitacoes s WHERE s.conversa_id = c.id AND s.status = 'ABERTA'), '[]'::jsonb),
    'historico', coalesce((
      SELECT jsonb_agg(h.linha ORDER BY h.created_at)
      FROM (
        SELECT m.created_at,
               to_char(m.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') || ' ' ||
               CASE m.origem WHEN 'CLIENTE' THEN CASE WHEN m.durante_sem_ia
                                              THEN 'Cliente (do período em que a Ju estava bloqueada; a equipe já cuidou)'
                                              ELSE 'Cliente' END
                             WHEN 'JU' THEN 'Ju'
                             WHEN 'HUMANO' THEN 'Recepção (Lolô)'
                             ELSE 'Mensagem automática' || coalesce(' (' || (
                               SELECT a.descricao FROM public.ju_assinaturas_automacao a
                                WHERE a.ativo AND btrim(coalesce(m.conteudo, '')) ~* a.padrao
                                ORDER BY (a.padrao = 'mensagem autom[aá]tica'), a.id LIMIT 1) || ')', '') END || ': ' ||
               coalesce(left(m.conteudo, CASE WHEN m.origem = 'AUTOMACAO' THEN 300 ELSE 2000 END), '[' || lower(m.tipo) || ' sem texto]') AS linha
        FROM public.ju_mensagens m
        WHERE m.conversa_id = c.id
          AND m.created_at > now() - interval '30 days'
          AND NOT (m.origem = 'AUTOMACAO' AND m.conteudo LIKE 'Transcrição do áudio:%')
        ORDER BY m.created_at DESC
        LIMIT 40) h), '[]'::jsonb),
    'agendas_publicas', public.fn_ju_agendas_publicas(c.id),
    'servicos', public.fn_ju_servicos(),
    'loja', public.fn_ju_loja(c.id),
    'termos_contrato', public.fn_ju_termos_contrato(),
    'base_de_conhecimento', coalesce((SELECT jsonb_object_agg(k.id, k.texto)
                                      FROM public.ju_conhecimento k WHERE k.ativo), '{}'::jsonb));
END;
$function$;

-- ───────────────────────── 4) gatilhos de saúde ─────────────────────────
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_precisa_ia_com_equipe(bigint)'::regprocedure);
  n := replace(d, $a$|v[oô]mit|engasg|chiad|respira[nç]'$a$,
                  $a$|v[oô]mit|engasg|chiad|respira[nç]|tosse|tossindo|catarr|secre[cç]|satura|ouvido|\mdor\M|dores'$a$);
  IF n = d THEN RAISE EXCEPTION 'precisa_ia: trecho não encontrado'; END IF;
  EXECUTE n;
END $$;

-- ───────────────────────── 6) cancelamento < 6 h igual ao botão ─────────────────────────
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_cancelar_consulta(bigint,bigint,uuid)'::regprocedure);
  n := replace(d, $a$  IF v_horas < 6 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'MENOS_DE_6H', 'faltam_horas', round(v_horas, 1),
                              'paciente', v_pac, 'quando', v_quando, 'profissional', v_prof);
  END IF;
$a$, '');
  n := replace(n, $a$'profissional', v_prof, 'faltavam_horas', round(v_horas, 1), 'link_agenda', public.fn_ju_link_agenda_publica(a.id));$a$,
  $a$'profissional', v_prof, 'faltavam_horas', round(v_horas, 1), 'link_agenda', public.fn_ju_link_agenda_publica(a.id),
                            'aviso_menos_de_6h', CASE WHEN v_horas < 6 THEN
                              'Como previsto em nosso contrato na Cláusula 4a, cancelamentos com menos de 6 horas de antecedência estão sujeitos a cobrança de 50% do valor da consulta, em razão da reserva exclusiva do horário.' END);$a$);
  IF n = d OR strpos(n, 'MENOS_DE_6H') > 0 OR strpos(n, 'aviso_menos_de_6h') = 0 THEN
    RAISE EXCEPTION 'cancelar_consulta: trecho não encontrado';
  END IF;
  EXECUTE n;
END $$;

-- ───────────────────────── 5) urgente fora do expediente → Bruna ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_ju_fora_do_expediente(p_ts timestamptz DEFAULT now())
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT NOT (extract(isodow FROM p_ts AT TIME ZONE 'America/Sao_Paulo') BETWEEN 1 AND 5
              AND (p_ts AT TIME ZONE 'America/Sao_Paulo')::time >= time '08:00'
              AND (p_ts AT TIME ZONE 'America/Sao_Paulo')::time < time '18:00'
              AND NOT EXISTS (SELECT 1 FROM followup_feriados f WHERE f.dia = (p_ts AT TIME ZONE 'America/Sao_Paulo')::date));
$function$;

CREATE OR REPLACE FUNCTION public.fn_trg_ju_urgente_para_bruna()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  BRUNA constant uuid := 'c4883f76-d010-4fb4-ac5b-248914e56e6e';
  c ju_conversas; f record; v_txt text; v_tel text; v_hist text; v_cri text;
BEGIN
  IF NEW.tipo <> 'CLINICO' OR NOT coalesce(NEW.urgente, false) OR NOT fn_ju_fora_do_expediente(NEW.created_at) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO c FROM ju_conversas WHERE id = NEW.conversa_id;
  IF c.id IS NULL OR c.id IN (SELECT unnest(fn_conversas_ids_teste())) THEN RETURN NULL; END IF;
  SELECT * INTO f FROM fn_ju_recado_chat_fisio(BRUNA);
  IF f.numero IS NULL THEN RETURN NULL; END IF;

  v_tel := regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g');
  v_cri := (SELECT split_part(btrim(nome), ' ', 1) FROM pessoas WHERE id = NEW.paciente_id);
  SELECT string_agg(l, E'\n' ORDER BY t) INTO v_hist FROM (
    SELECT m.created_at AS t,
           '• ' || to_char(m.created_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') || ' '
           || CASE m.origem WHEN 'CLIENTE' THEN 'Família' WHEN 'JU' THEN 'Ju' WHEN 'HUMANO' THEN 'Lolô' ELSE 'Auto' END
           || ': ' || left(regexp_replace(coalesce(m.conteudo, '[' || lower(m.tipo) || ']'), '\s+', ' ', 'g'), 220) AS l
      FROM ju_mensagens m
     WHERE m.conversa_id = c.id AND m.origem IN ('CLIENTE', 'JU', 'HUMANO')
       AND m.created_at > now() - interval '12 hours'
     ORDER BY m.created_at DESC LIMIT 8) z;

  v_txt := '🚨 *Caso urgente fora do expediente*' || E'\n'
        || 'Família: ' || coalesce(nullif(btrim(c.nome_whatsapp), ''), 'sem nome') || coalesce(' · criança: ' || v_cri, '') || E'\n'
        || CASE WHEN length(v_tel) >= 10 THEN 'Falar com a família: https://wa.me/' || v_tel || E'\n' ELSE '' END
        || 'Resumo: ' || left(regexp_replace(coalesce(NEW.resumo, '?'), '\s+', ' ', 'g'), 400)
        || coalesce(E'\n\nÚltimas mensagens:\n' || v_hist, '')
        || E'\n\n_A família ouviu que você foi avisada e vai falar com ela assim que puder._';
  PERFORM fn_ju_recado_whats(f.numero, v_txt, NULL);
  UPDATE ju_solicitacoes SET dados = coalesce(dados, '{}'::jsonb) || jsonb_build_object('urgente_bruna_em', now())
   WHERE id = NEW.id;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RAISE WARNING 'urgente para Bruna falhou (solicitação %): %', NEW.id, SQLERRM;
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS trg_ju_urgente_para_bruna ON public.ju_solicitacoes;
CREATE TRIGGER trg_ju_urgente_para_bruna
  AFTER INSERT ON public.ju_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_ju_urgente_para_bruna();

-- ───────────────────────── 11) contrato: avisos e erro para o dono ─────────────────────────
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_aviso_contrato_reservar(text,text)'::regprocedure);
  n := replace(d, $a$  DELETE FROM public.aviso_contrato_enviados WHERE dia < current_date - 30;
$a$, $a$  DELETE FROM public.aviso_contrato_enviados WHERE dia < current_date - 30;
  -- 25/11/2026: no máximo 2 avisos em 30 dias por telefone
  IF (SELECT count(*) FROM public.aviso_contrato_enviados WHERE telefone_chave = v_chave) >= 2 THEN
    RETURN jsonb_build_object('enviar', false, 'motivo', 'limite_de_avisos');
  END IF;
  -- 25/11/2026: nunca junto de um cancelamento recente da família
  IF EXISTS (SELECT 1 FROM public.ju_conversas c2
               JOIN public.ju_acoes ja ON ja.conversa_id = c2.id AND ja.tipo = 'CANCELAR_CONSULTA'
                                       AND ja.created_at > now() - interval '3 hours'
              WHERE public.fn_atrib_tel_chave(c2.telefone) = v_chave)
     OR EXISTS (SELECT 1 FROM public.ju_conversas c3
               JOIN public.ju_mensagens mc ON mc.conversa_id = c3.id AND mc.origem = 'CLIENTE'
                                          AND mc.created_at > now() - interval '3 hours'
                                          AND mc.conteudo ~* '^\s*cancelar\.'
              WHERE public.fn_atrib_tel_chave(c3.telefone) = v_chave) THEN
    RETURN jsonb_build_object('enviar', false, 'motivo', 'cancelamento_recente');
  END IF;
$a$);
  IF n = d THEN RAISE EXCEPTION 'aviso_contrato: trecho não encontrado'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.fn_contrato_envio_registrar(uuid,boolean,text,text,text,text,text)'::regprocedure);
  n := replace(d, $a$            'CONTRATO_ENVIO', ARRAY['contrato:' || p_contrato_id::text]);
$a$, $a$            'CONTRATO_ENVIO', ARRAY['contrato:' || p_contrato_id::text]);
    -- 25/11/2026: o dono pediu para receber no celular quando a Assinafy recusar
    PERFORM public.fn_ju_recado_whats('5561981446666',
      '⚠️ Contrato não chegou à Assinafy' || coalesce(' (' || v_pac || ')', '') || E'\n'
      || 'Quem assina: ' || coalesce(v_resp, '?') || coalesce(' · WhatsApp final ' || v_fim, '') || E'\n'
      || 'Erro: ' || left(regexp_replace(coalesce(p_erro, 'sem detalhe'), '\s+', ' ', 'g'), 180)
      || CASE WHEN coalesce(p_erro, '') ~* 'mail' THEN
           E'\nE-mail no contrato: ' || coalesce('"' || v_email || '"', '(vazio)')
           || coalesce(' → ' || public.fn_email_problema(v_email), '') ELSE '' END,
      NULL);
$a$);
  IF n = d OR strpos(n, '5561981446666') = 0 THEN RAISE EXCEPTION 'contrato_envio: trecho não encontrado'; END IF;
  EXECUTE n;
END $$;

-- ───────────────────────── 12) lembrete de fixo espera a conversa acalmar ─────────────────────────
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_fixos_liberar_envio()'::regprocedure);
  n := replace(d, $a$     WHERE status = 'fila' ORDER BY fila_em, id LIMIT 1 FOR UPDATE SKIP LOCKED;$a$,
                  $a$     WHERE status = 'fila' AND coalesce(fila_em, '-infinity'::timestamptz) <= now() ORDER BY fila_em NULLS FIRST, id LIMIT 1 FOR UPDATE SKIP LOCKED;$a$);
  n := replace(n, $a$      UPDATE public.pacientes_fixos_envios SET status = 'cancelado', erro = 'Já marcou na semana' WHERE id = e.id;
      CONTINUE;
    END IF;
    EXIT;$a$, $a$      UPDATE public.pacientes_fixos_envios SET status = 'cancelado', erro = 'Já marcou na semana' WHERE id = e.id;
      CONTINUE;
    END IF;
    -- 25/11/2026: conversa em andamento (equipe falou há < 60 min ou família há < 20 min): espera 30 min
    IF EXISTS (SELECT 1 FROM public.ju_conversas cv JOIN public.ju_mensagens mv ON mv.conversa_id = cv.id
                WHERE public.fn_atrib_tel_chave(cv.telefone) = public.fn_atrib_tel_chave(e.telefone)
                  AND ((mv.origem = 'HUMANO' AND mv.created_at > now() - interval '60 minutes')
                    OR (mv.origem = 'CLIENTE' AND mv.created_at > now() - interval '20 minutes'))) THEN
      UPDATE public.pacientes_fixos_envios SET fila_em = now() + interval '30 minutes' WHERE id = e.id;
      CONTINUE;
    END IF;
    EXIT;$a$);
  IF n = d OR strpos(n, '''-infinity''::timestamptz) <= now()') = 0 OR strpos(n, 'conversa em andamento') = 0 THEN
    RAISE EXCEPTION 'fixos_liberar: trecho não encontrado';
  END IF;
  EXECUTE n;
END $$;

-- ───────────────────────── 13) recado: sem ⏰ quando a equipe já respondeu ─────────────────────────
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_recados_tick()'::regprocedure);
  n := replace(d, $a$AND fn_ju_minutos_operacionais(x.enviado_em, now()) >= 120$a$,
                  $a$AND fn_ju_minutos_operacionais(x.enviado_em, now()) >= 120
       AND NOT EXISTS (SELECT 1 FROM ju_mensagens hm WHERE hm.conversa_id = x.conversa_id AND hm.origem = 'HUMANO'
                         AND hm.created_at > x.enviado_em AND fn_ju_humano_trata(hm.conteudo))$a$);
  IF n = d THEN RAISE EXCEPTION 'recados_tick: trecho não encontrado'; END IF;
  EXECUTE n;
END $$;

-- ───────────────────────── 14) solicitações de erro técnico paradas ─────────────────────────
UPDATE public.ju_solicitacoes
   SET status = 'RESOLVIDA', resolvida_em = now(), resolvida_por = 'sistema (erro técnico já superado)'
 WHERE status = 'ABERTA' AND resumo ILIKE '%rate limit%';
