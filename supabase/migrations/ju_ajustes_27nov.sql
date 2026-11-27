-- 27/11/2026: ajustes da análise de 27/11 (o dono aprovou tudo).
-- 1) Fichas da conversa com a Bruna:
--    a) uma ficha por família enquanto a anterior não for respondida (Stefane recebeu duas: o "Bom dia!" virou ficha);
--    b) cumprimento e agradecimento não viram recado nem complemento ("Ta ok! Mto obrigada" → "Passei isso também");
--    c) ficha sem resposta da Bruna em 4 h úteis vira pedido aberto (card no 🔔 + PENDÊNCIAS + ⏳).
-- 2) @ju agendar ou escolha da família que falha (horário ocupado etc.) vira pedido aberto de agendamento
--    (caso Giovana: o aviso foi para o 🔔, ninguém retomou e a família acha que está marcada).
-- 3) Valor do contrato diferente do da fisio: a Ju explica (o contrato traz a tabela padrão e avisa que algumas
--    fisioterapeutas têm valor próprio), mesmo com a Lolô conduzindo.
-- 4) Feriado: a regra vale só para o valor; horário oferecido ou marcado pela equipe está confirmado.
-- 6) Depois de um pagamento, a Ju não diz que a nota "já foi enviada" sem saber.

-- ── helpers ──
CREATE OR REPLACE FUNCTION public.fn_ju_eh_cortesia(p_texto text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v text; w text;
  OK constant text[] := ARRAY['ok','okay','oki','obrigada','obrigado','obrigadas','obrigados','brigada','brigado','obg','mto','muito',
    'muitissimo','valeu','vlw','certo','isso','beleza','blz','sim','show','top','perfeito','otimo','ta','to','bom','boa','dia','tarde',
    'noite','oi','ola','tudo','bem','e','voce','vc','combinado','joia','fico','no','na','aguardo','aguardando','entendi','entao',
    'pode','deixar','de','nada','gente','amem','kkk','kkkk','rs','tchau','ate','logo','mais','gratidao','agradeco','demais','ai','aqui'];
BEGIN
  v := btrim(regexp_replace(lower(unaccent(coalesce(p_texto, ''))), '[^a-z ]+', ' ', 'g'));
  IF length(replace(v, ' ', '')) < 3 THEN RETURN true; END IF;
  FOREACH w IN ARRAY regexp_split_to_array(v, '\s+') LOOP
    IF NOT (w = ANY (OK)) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $function$;

-- pedido aberto criado pelo sistema, com card (✅ Concluído / 👀 Estou verificando) no 🔔
CREATE OR REPLACE FUNCTION public.fn_ju_pedido_do_sistema(p_conversa_id bigint, p_tipo text, p_resumo text, p_paciente_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r jsonb; v_tok text; v_req bigint;
  GRUPO constant text := '120363433073436578@g.us';
BEGIN
  r := fn_ju_chamar_secretaria(p_conversa_id, NULL, p_tipo, p_resumo, false, p_paciente_id);
  IF NOT coalesce((r ->> 'ok')::boolean, false) THEN RETURN r; END IF;
  v_tok := fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
  IF v_tok IS NULL THEN RETURN r; END IF;
  IF (r ->> 'novo')::boolean THEN
    v_req := net.http_post(url := 'https://infuse.uazapi.com/send/menu',
      body := jsonb_build_object('number', GRUPO, 'type', 'button', 'text', r ->> 'texto_grupo',
                                 'choices', jsonb_build_array('👀 Estou verificando|ju_verif:' || (r ->> 'solicitacao_id'),
                                                              '✅ Concluído|ju_concluir:' || (r ->> 'solicitacao_id'))),
      headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
      timeout_milliseconds := 20000);
  ELSE
    v_req := net.http_post(url := 'https://infuse.uazapi.com/send/text',
      body := jsonb_build_object('number', GRUPO, 'text', r ->> 'texto_grupo')
              || CASE WHEN nullif(r ->> 'citar', '') IS NOT NULL THEN jsonb_build_object('replyid', r ->> 'citar') ELSE '{}'::jsonb END,
      headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
      timeout_milliseconds := 20000);
  END IF;
  RETURN r || jsonb_build_object('card_req', v_req);
END $function$;
REVOKE ALL ON FUNCTION public.fn_ju_pedido_do_sistema(bigint, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_pedido_do_sistema(bigint, text, text, uuid) TO service_role;

-- ── 1a/1b: recado_criar ──
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_recado_criar(jsonb)'::regprocedure);
  n := replace(d, $a$  ctx := fn_ju_contexto_cliente(c.id);
$a$, $a$  -- 27/11/2026: cumprimento ou agradecimento não vira recado nem complemento
  IF fn_ju_eh_cortesia(v_txt) THEN
    RETURN jsonb_build_object('ok', false, 'cortesia', true, 'resposta',
      'Isso é só cumprimento ou agradecimento: nada foi passado para a fisio. Não diga que passou recado. Se não houver pergunta para responder, responda exatamente [NADA].');
  END IF;
  -- 27/11/2026: ficha já com a Bruna e ainda sem resposta: não manda outra, só junta o que for novo
  IF v_aval THEN
    SELECT * INTO v_ant FROM ju_recados
     WHERE conversa_id = c.id AND mensagem LIKE '🩺%' AND status IN ('fila', 'enviado') AND respondido_em IS NULL
       AND created_at > now() - interval '7 days'
     ORDER BY id DESC LIMIT 1;
    IF v_ant.id IS NOT NULL THEN
      IF position(lower(left(v_txt, 60)) IN lower(v_ant.recado)) = 0 THEN
        UPDATE ju_recados SET recado = recado || E'\n' || v_txt WHERE id = v_ant.id;
      END IF;
      RETURN jsonb_build_object('ok', true, 'duplicado', true, 'recado_id', v_ant.id, 'resposta',
        'A ficha desta família já está com a Bruna Cury e não foi mandada de novo. Se a família só cumprimentou ou perguntou se alguém vai falar com ela, diga em uma frase, com outras palavras, que a Bruna já recebeu e vai falar com ela por aqui. Se já disse isso há pouco, responda [NADA].');
    END IF;
  END IF;
  ctx := fn_ju_contexto_cliente(c.id);
$a$);
  IF n = d OR strpos(n, 'fn_ju_eh_cortesia(v_txt)') = 0 THEN RAISE EXCEPTION 'recado_criar: trecho não encontrado'; END IF;
  EXECUTE n;
END $$;

-- ── 1c: ficha sem resposta em 4 h úteis vira pedido aberto ──
ALTER TABLE public.ju_recados ADD COLUMN IF NOT EXISTS pendencia_em timestamptz;

DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_recados_tick()'::regprocedure);
  n := replace(d, $a$  UPDATE ju_recados SET status = 'expirado'$a$,
$a$  -- 27/11/2026: ficha da conversa com a Bruna sem resposta em 4 h úteis vira pedido aberto (card + PENDÊNCIAS)
  FOR r IN
    SELECT x.id, x.conversa_id, x.familia, x.enviado_em, x.paciente_id
      FROM ju_recados x
     WHERE x.status = 'enviado' AND x.mensagem LIKE '🩺%' AND x.respondido_em IS NULL AND x.pendencia_em IS NULL
       AND x.enviado_em > now() - interval '3 days'
       AND fn_ju_minutos_operacionais(x.enviado_em, now()) >= 240
       AND NOT EXISTS (SELECT 1 FROM ju_mensagens hm WHERE hm.conversa_id = x.conversa_id AND hm.origem = 'HUMANO'
                         AND hm.created_at > x.enviado_em AND fn_ju_humano_trata(hm.conteudo))
     FOR UPDATE OF x SKIP LOCKED
  LOOP
    UPDATE ju_recados SET pendencia_em = now() WHERE id = r.id;
    PERFORM fn_ju_pedido_do_sistema(r.conversa_id, 'AGENDAMENTO',
      '🩺 A ficha da conversa antes da avaliação motora está com a Bruna desde '
      || to_char(r.enviado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24"h"MI')
      || ' e ainda não teve resposta. A família espera a conversa com a Bruna para marcar a avaliação.'
      || ' Se a Bruna já falou com a família por fora, toque em Concluído.', r.paciente_id);
  END LOOP;

  UPDATE ju_recados SET status = 'expirado'$a$);
  IF n = d THEN RAISE EXCEPTION 'recados_tick: trecho não encontrado'; END IF;
  EXECUTE n;
END $$;

-- ── 2: agendamento que falha vira pedido aberto ──
CREATE OR REPLACE FUNCTION public.fn_trg_ju_comando_agendar_falhou()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE c ju_conversas; v_motivo text; v_quando text; v_resumo text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'recusado' OR (TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'recusado') THEN RETURN NULL; END IF;
  IF coalesce(NEW.resultado ->> 'codigo', '') NOT IN ('HORARIO_OCUPADO', 'JA_TEM_CONSULTA_PERTO', 'SISTEMA_RECUSOU', 'NO_PASSADO') THEN RETURN NULL; END IF;
  IF NOT (coalesce(NEW.texto, '') ~* '^\s*@ju\s+agend' OR coalesce(NEW.texto, '') LIKE 'Escolha de horário da família%') THEN RETURN NULL; END IF;
  SELECT * INTO c FROM ju_conversas WHERE id = NEW.conversa_id;
  IF c.id IS NULL OR coalesce(c.wa_chatid, '') LIKE '%@g.us' OR fn_ju_eh_equipe(c.telefone) THEN RETURN NULL; END IF;

  v_motivo := CASE NEW.resultado ->> 'codigo'
                WHEN 'HORARIO_OCUPADO' THEN 'o horário já estava ocupado'
                WHEN 'JA_TEM_CONSULTA_PERTO' THEN 'a criança já tem consulta perto desse horário'
                WHEN 'NO_PASSADO' THEN 'o horário já tinha passado'
                ELSE 'a agenda não aceitou o horário' END;
  v_quando := CASE WHEN NEW.proposta ->> 'data' ~ '^\d{4}-\d{2}-\d{2}$'
                   THEN to_char((NEW.proposta ->> 'data')::date, 'DD/MM') || coalesce(' às ' || left(NEW.proposta ->> 'hora', 5), '') END;
  v_resumo := CASE WHEN NEW.texto LIKE 'Escolha de horário da família%'
                   THEN 'A família aceitou o horário' || coalesce(' de ' || v_quando, '') || ' oferecido pela equipe, mas ' || v_motivo
                        || '. Ela acha que está marcado: ofereça outro horário.'
                   ELSE 'O "' || left(btrim(NEW.texto), 160) || '" não deu certo: ' || v_motivo
                        || '. A família ainda espera o horário: ofereça outro.' END;
  PERFORM fn_ju_pedido_do_sistema(NEW.conversa_id, 'AGENDAMENTO', v_resumo, nullif(NEW.proposta ->> 'paciente_id', '')::uuid);
  RETURN NULL;
EXCEPTION WHEN others THEN
  RAISE WARNING 'pedido do agendamento que falhou (comando %): %', NEW.id, SQLERRM;
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS trg_ju_comando_agendar_falhou ON public.ju_comandos;
CREATE TRIGGER trg_ju_comando_agendar_falhou
  AFTER INSERT OR UPDATE OF status ON public.ju_comandos
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_ju_comando_agendar_falhou();

-- ── 3, 4 e 6: base de conhecimento ──
INSERT INTO public.ju_conhecimento (id, categoria, texto, ativo, updated_at)
VALUES ('CONTRATO_VALOR_PROFISSIONAL', 'FINANCEIRO',
'Se a família disser que o valor do contrato é diferente do valor que foi passado (por exemplo, "o contrato está 20 reais a menos"): o contrato traz a tabela padrão da clínica e avisa que algumas fisioterapeutas têm valor próprio, que pode ser maior, e que esse valor é informado antes do agendamento. Explique isso em uma ou duas frases e diga o valor da sessão com a fisio dela (tabela de serviços). Responda mesmo quando a Lolô estiver conduzindo a conversa: é pergunta de valor e nunca fica sem resposta. Não fale de desconto nem prometa o valor da tabela padrão.',
        true, now())
ON CONFLICT (id) DO UPDATE SET texto = excluded.texto, categoria = excluded.categoria, ativo = true, updated_at = now();

UPDATE public.ju_conhecimento SET texto =
'Feriado tem valor próprio, diferente do fim de semana, e esse valor não está na tabela de serviços. A Ju não informa valor de sessão em feriado: diz que em feriado o valor é diferente e que a Lolô passa o valor. Isso vale só para o VALOR: horário em feriado que a equipe ofereceu ou marcou está confirmado, e a Ju nunca diz que a Lolô ainda vai confirmar o horário ou se a clínica abre nesse caso. Os valores de sábado e domingo são os da tabela (FDS).',
       updated_at = now()
 WHERE id = 'FERIADO_VALOR';

UPDATE public.ju_conhecimento SET texto = texto ||
' Depois de confirmar um pagamento, diga só que a nota fiscal chega por aqui e por e-mail quando for emitida. Nunca diga que a nota "já foi enviada" ou "já foi emitida" se a ferramenta não disser isso.',
       updated_at = now()
 WHERE id = 'NOTA_FISCAL' AND texto NOT LIKE '%Nunca diga que a nota "já foi enviada"%';

-- card postado pelo pg_net: guarda o pedido do envio e, no tick seguinte, o id da mensagem (para o ⏳ citar e o
-- Concluído apagar o card)
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_pedido_do_sistema(bigint,text,text,uuid)'::regprocedure);
  n := replace(d, $a$  RETURN r || jsonb_build_object('card_req', v_req);$a$,
$a$  IF (r ->> 'novo')::boolean AND v_req IS NOT NULL THEN
    UPDATE ju_solicitacoes SET dados = coalesce(dados, '{}'::jsonb) || jsonb_build_object('card_req', v_req)
     WHERE id = (r ->> 'solicitacao_id')::bigint;
  END IF;
  RETURN r || jsonb_build_object('card_req', v_req);$a$);
  IF n = d THEN RAISE EXCEPTION 'pedido_do_sistema: trecho não encontrado'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.fn_ju_recados_tick()'::regprocedure);
  n := replace(d, $a$  UPDATE ju_recados SET status = 'expirado'$a$,
$a$  -- id do card postado pelo pg_net
  UPDATE ju_solicitacoes so
     SET notificacao_msg_id = (h.content::jsonb ->> 'messageid')
    FROM net._http_response h
   WHERE so.notificacao_msg_id IS NULL AND so.status = 'ABERTA' AND so.dados ? 'card_req'
     AND h.id = (so.dados ->> 'card_req')::bigint AND h.status_code = 200
     AND (h.content::jsonb ->> 'messageid') IS NOT NULL;

  UPDATE ju_recados SET status = 'expirado'$a$);
  IF n = d THEN RAISE EXCEPTION 'recados_tick (card): trecho não encontrado'; END IF;
  EXECUTE n;
END $$;

UPDATE public.ju_solicitacoes SET notificacao_msg_id = '3EB02AE963C01067F7FB9C', dados = dados || '{"card_req": 583430}'
 WHERE id = 655 AND notificacao_msg_id IS NULL;
