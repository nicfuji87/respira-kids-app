-- =====================================================================
-- Aviso de consulta combinada e não lançada (22/10/2026)
-- =====================================================================
-- AI dev note: pedido do dono. Na análise de 22/10, 5 consultas confirmadas à
-- família pelo WhatsApp ("Marcado!") não estavam na agenda (sem lembrete, sem
-- cobrança, a fisio não vê). Regra:
--  - mensagem da EQUIPE (ju_mensagens.origem = 'HUMANO') com marcado/agendado/
--    remarcado/marquei/agendei; fora: pergunta (?), áudio, frase sobre consulta que
--    já existe ("está agendado", "sessão agendada", "temos uma sessão agendada");
--  - 1 h depois: se nenhuma consulta FUTURA de uma criança ligada à conversa foi
--    criada ou alterada desde 3 h antes da mensagem → aviso no 🔔 Notificações
--    (fila ju_avisos_grupo, que sai pelo fn_ju_tarefas com a reserva do Nicolas);
--  - número sem criança no cadastro → aviso pedindo para lançar ou cadastrar;
--  - por conversa, só a última mensagem do grupo de mensagens conta;
--  - roda das 8h às 20h; janela de 26 h; mais de 3 avisos de uma vez viram um resumo.
-- Nomes: só as crianças (acesso_agenda). Conversas de teste (+5561999000xx) ficam de fora.
-- Medição antes de ligar (8 dias): 16 mensagens, 8 lançadas na hora, 3 lançadas só
-- no dia seguinte, 5 nunca (2 com criança ligada, 3 sem cadastro ligado).
-- =====================================================================
CREATE TABLE public.agenda_confirmacoes_verificadas (
  mensagem_id   bigint PRIMARY KEY REFERENCES public.ju_mensagens(id) ON DELETE CASCADE,
  conversa_id   bigint NOT NULL,
  resultado     text NOT NULL CHECK (resultado IN ('lancada', 'avisada', 'sem_cadastro', 'agrupada')),
  verificado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agenda_confirmacoes_verificadas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agenda_confirmacoes_verificadas FROM anon, authenticated;

CREATE FUNCTION public.fn_agenda_confirmacoes_verificar() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  hora   int := extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo');
  r      record;
  pacs   uuid[];
  nomes  text;
  ok     boolean;
  linhas text[] := '{}';
  textos text[] := '{}';
  item   text;
  n      int := 0;
BEGIN
  IF hora < 8 OR hora >= 20 THEN RETURN 0; END IF;

  FOR r IN
    WITH cand AS (
      SELECT m.id, m.conversa_id, m.created_at, m.conteudo,
             row_number() OVER (PARTITION BY m.conversa_id ORDER BY m.created_at DESC) AS ult
      FROM public.ju_mensagens m
      WHERE m.origem = 'HUMANO'
        AND m.created_at >= now() - interval '26 hours'
        AND m.created_at <= now() - interval '60 minutes'
        AND m.conteudo ~* '(^|[^[:alnum:]])(marcad[oa]s?|agendad[oa]s?|agendei|marquei|remarcad[oa]s?|remarquei)([^[:alnum:]]|$)'
        AND m.conteudo !~ '\?'
        AND m.conteudo !~* '^[ ]*[áa]udio:'
        AND m.conteudo !~* '(est[aá]|est[aã]o|tem|temos|j[aá] (est[aá]|tem)|sess[aã]o|consulta)[[:space:]]+(uma[[:space:]]+)?(sess[aã]o[[:space:]]+)?agendad'
        AND NOT EXISTS (SELECT 1 FROM public.agenda_confirmacoes_verificadas v WHERE v.mensagem_id = m.id)
        AND NOT EXISTS (SELECT 1 FROM public.ju_conversas t WHERE t.id = m.conversa_id AND t.telefone ~ '^\+?5561999000'))
    SELECT c.*, public.fn_telefone_br_formatado(cv.telefone) AS fone
    FROM cand c JOIN public.ju_conversas cv ON cv.id = c.conversa_id
    ORDER BY c.created_at
  LOOP
    IF r.ult > 1 THEN
      INSERT INTO public.agenda_confirmacoes_verificadas (mensagem_id, conversa_id, resultado) VALUES (r.id, r.conversa_id, 'agrupada');
      CONTINUE;
    END IF;

    SELECT array_agg((x ->> 'paciente_id')::uuid),
           string_agg(split_part(btrim(x ->> 'nome'), ' ', 1), ' e ')
      INTO pacs, nomes
      FROM (SELECT x FROM jsonb_array_elements(public.fn_ju_contexto_cliente(r.conversa_id) -> 'pacientes') x
             WHERE (x ->> 'acesso_agenda')::boolean LIMIT 4) s;

    SELECT EXISTS (
      SELECT 1 FROM public.agendamentos a
       WHERE a.paciente_id = ANY(coalesce(pacs, '{}')) AND a.ativo
         AND a.data_hora >= date_trunc('day', r.created_at AT TIME ZONE 'America/Sao_Paulo')
         AND (a.created_at >= r.created_at - interval '3 hours' OR a.updated_at >= r.created_at - interval '3 hours'))
      INTO ok;

    IF ok THEN
      INSERT INTO public.agenda_confirmacoes_verificadas (mensagem_id, conversa_id, resultado) VALUES (r.id, r.conversa_id, 'lancada');
      CONTINUE;
    END IF;

    item := coalesce(nomes, 'Família sem cadastro ligado a este número') || ' · ' || coalesce(r.fone, 'número não disponível')
            || E'\nÀs ' || to_char(r.created_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI')
            || CASE WHEN (r.created_at AT TIME ZONE 'America/Sao_Paulo')::date < (now() AT TIME ZONE 'America/Sao_Paulo')::date
                    THEN ' de ' || to_char(r.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM') ELSE '' END
            || ' a equipe escreveu: "' || left(regexp_replace(btrim(r.conteudo), '\s+', ' ', 'g'), 110)
            || CASE WHEN length(btrim(r.conteudo)) > 110 THEN '...' ELSE '' END || '"';
    linhas := linhas || item;
    textos := textos || ('📅 Consulta combinada e ainda não lançada?' || E'\n' || item || E'\n'
            || CASE WHEN pacs IS NULL
                    THEN 'Este número não está ligado a nenhuma criança no cadastro, então não deu para conferir. Se a consulta ainda não foi lançada, lance (e, se for família nova, faça o cadastro).'
                    ELSE 'Até agora nenhuma consulta dessa família entrou ou mudou na agenda. Se foi marcada, lance para a família receber lembrete e cobrança.' END);
    INSERT INTO public.agenda_confirmacoes_verificadas (mensagem_id, conversa_id, resultado)
    VALUES (r.id, r.conversa_id, CASE WHEN pacs IS NULL THEN 'sem_cadastro' ELSE 'avisada' END);
    n := n + 1;
  END LOOP;

  IF n = 0 THEN RETURN 0; END IF;
  IF n <= 3 THEN
    INSERT INTO public.ju_avisos_grupo (texto, origem) SELECT t, 'AGENDA_NAO_LANCADA' FROM unnest(textos) t;
  ELSE
    INSERT INTO public.ju_avisos_grupo (texto, origem)
    VALUES ('📅 ' || n || ' consultas combinadas e ainda não lançadas?' || E'\n\n'
            || array_to_string(linhas, E'\n\n')
            || E'\n\nNenhuma dessas entrou ou mudou na agenda. Se foram marcadas, lance para a família receber lembrete e cobrança. Quando o número não está ligado a uma criança no cadastro, confira pelo nome.',
            'AGENDA_NAO_LANCADA');
  END IF;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.fn_agenda_confirmacoes_verificar() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('agenda-confirmacoes', '*/10 * * * *', $c$ SELECT public.fn_agenda_confirmacoes_verificar(); $c$);

-- (22/10/2026, migration agenda_confirmacao_horario_4h_24h) horário passou a ser das 4h à meia-noite:
-- IF hora < 4 THEN RETURN 0; END IF;
