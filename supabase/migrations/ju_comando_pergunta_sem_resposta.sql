-- AI dev note: 05/11/2026 (caso Helena: "@ju agendar ... para a Luiza", a Ju perguntou se era a Helena e ninguém
-- respondeu; a sessão de amanhã ficou sem lançar). fn_ju_comando_sem_resposta (dentro de fn_lista_espera_tick) avisa
-- no 🔔 quando um "@ju" terminou em pergunta há 15 min e ninguém mandou outro "@ju" na conversa. O aviso some sozinho
-- quando vem um "@ju" novo (ou em 1 dia). Só seg a sáb, 8h às 19h59; conversas da equipe e do Chatwoot ficam de fora.

ALTER TABLE public.ju_comandos ADD COLUMN IF NOT EXISTS aviso_req bigint;
ALTER TABLE public.ju_comandos ADD COLUMN IF NOT EXISTS aviso_em timestamptz;
ALTER TABLE public.ju_comandos ADD COLUMN IF NOT EXISTS aviso_resolvido_em timestamptz;

CREATE OR REPLACE FUNCTION public.fn_ju_comando_sem_resposta()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  GRUPO constant text := '120363433073436578@g.us';
  v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  x record; v_tok text; v_txt text; v_n int := 0; v_fim int := 0;
BEGIN
  -- resolvido: veio outro "@ju" na conversa depois da pergunta, ou passou 1 dia
  FOR x IN SELECT k.* FROM ju_comandos k WHERE k.aviso_em IS NOT NULL AND k.aviso_resolvido_em IS NULL LOOP
    IF EXISTS (SELECT 1 FROM ju_comandos o WHERE o.conversa_id = x.conversa_id AND o.created_at > x.created_at)
       OR x.aviso_em < now() - interval '1 day' THEN
      UPDATE ju_comandos SET aviso_resolvido_em = now() WHERE id = x.id;
      PERFORM fn_le_apagar(NULL, x.aviso_req);
      v_fim := v_fim + 1;
    END IF;
  END LOOP;

  v_tok := fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
  IF v_tok IS NULL OR extract(isodow FROM v_agora) = 7 OR v_agora::time < time '08:00' OR v_agora::time >= time '20:00' THEN
    RETURN jsonb_build_object('avisos', 0, 'resolvidos', v_fim);
  END IF;

  FOR x IN
    SELECT k.*, c.telefone, c.nome_whatsapp
      FROM ju_comandos k JOIN ju_conversas c ON c.id = k.conversa_id
     WHERE k.status = 'pergunta' AND k.aviso_em IS NULL
       AND coalesce(k.concluido_em, k.created_at) BETWEEN now() - interval '6 hours' AND now() - interval '15 minutes'
       AND NOT EXISTS (SELECT 1 FROM ju_comandos o WHERE o.conversa_id = k.conversa_id AND o.created_at > k.created_at)
       AND c.wa_chatid !~ '^cw' AND NOT public.fn_ju_eh_equipe(c.telefone)
     ORDER BY k.created_at LIMIT 3
  LOOP
    v_txt := '❓ *A Ju ficou esperando resposta no @ju*' || E'\n'
          || coalesce(nullif(btrim(x.nome_whatsapp), ''), 'Família')
          || coalesce(' · ' || fn_lista_espera_tel_fmt(fn_lista_espera_tel(x.telefone)), '') || E'\n'
          || 'Pedido: ' || left(btrim(x.texto), 200) || E'\n'
          || 'Pergunta da Ju: ' || left(btrim(coalesce(x.resposta, '')), 300) || E'\n\n'
          || '_Responda na conversa começando com @ju. Este aviso some quando o pedido for respondido._';
    UPDATE ju_comandos SET aviso_em = now(),
           aviso_req = net.http_post(url := 'https://infuse.uazapi.com/send/text',
             body := jsonb_build_object('number', GRUPO, 'text', v_txt),
             headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
             timeout_milliseconds := 20000)
     WHERE id = x.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('avisos', v_n, 'resolvidos', v_fim);
END $$;

-- avisos antigos (antes desta regra) não disparam de uma vez: só os das últimas 6 h
UPDATE public.ju_comandos SET aviso_em = now(), aviso_resolvido_em = now()
 WHERE status = 'pergunta' AND aviso_em IS NULL AND created_at < now() - interval '6 hours';

DO $do$
DECLARE d text := pg_get_functiondef('public.fn_lista_espera_tick'::regproc);
BEGIN
  IF position($a$'sem_retorno', public.fn_ju_pedido_sem_retorno());$a$ IN d) = 0 THEN
    RAISE EXCEPTION 'fn_lista_espera_tick: trecho não encontrado';
  END IF;
  EXECUTE replace(d, $a$'sem_retorno', public.fn_ju_pedido_sem_retorno());$a$,
    $a$'sem_retorno', public.fn_ju_pedido_sem_retorno(),
                            'comando_sem_resposta', public.fn_ju_comando_sem_resposta());$a$);
END $do$;
