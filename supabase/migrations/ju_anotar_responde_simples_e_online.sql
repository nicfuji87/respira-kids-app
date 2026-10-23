-- Análise de 23/10/2026.
-- 1) Base: a clínica não faz atendimento online (resposta da Lolô à Tabata). A Ju responde sozinha.
-- 2) Modo ANOTAR (pedido já com a equipe): a Ju pode responder direto à família uma pergunta
--    simples que está nos dados (valor, endereço, convênio...) enquanto a Lolô ainda não entrou
--    na conversa. Caso Erika: perguntou o valor e esperou 16 min com a resposta pronta no grupo.
--    O n8n manda p_modo = 'RESPONDER_SIMPLES' quando a saída da IA começa com [FAMILIA].
--    O banco só libera se ninguém da equipe falou na conversa depois do pedido aberto.

INSERT INTO public.ju_conhecimento (id, categoria, texto, ativo)
VALUES ('ATENDIMENTO_ONLINE', 'SERVICOS',
        'A Respira Kids não faz atendimento online: a fisioterapia é presencial, feita com a criança na clínica ou em casa (domiciliar). Para quem mora longe ou fora do país, a orientação é procurar o pediatra da criança, que pode indicar um fisioterapeuta no local.',
        true)
ON CONFLICT (id) DO UPDATE SET texto = EXCLUDED.texto, categoria = EXCLUDED.categoria, ativo = true, updated_at = now();

DO $mig$
DECLARE
  d text := pg_get_functiondef('public.fn_ju_responder(bigint,bigint,text,text)'::regprocedure);
  n text;
BEGIN
  IF d LIKE '%RESPONDER_SIMPLES%' THEN RETURN; END IF;

  n := replace(d,
    $a$    WHEN p_modo = 'ANOTAR' THEN c.status = 'AGUARDANDO_EQUIPE'$a$,
    $a$    WHEN p_modo = 'ANOTAR' THEN c.status = 'AGUARDANDO_EQUIPE'
    WHEN p_modo = 'RESPONDER_SIMPLES' THEN
      c.status = 'AGUARDANDO_EQUIPE'
      AND NOT EXISTS (
        SELECT 1 FROM public.ju_mensagens m
         WHERE m.conversa_id = c.id AND m.origem = 'HUMANO'
           AND m.created_at > coalesce((SELECT min(s.created_at) FROM public.ju_solicitacoes s
                                         WHERE s.conversa_id = c.id AND s.status = 'ABERTA'),
                                       now() - interval '90 minutes'))$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_responder: trecho do ANOTAR não encontrado'; END IF;
  d := n;

  -- a resposta simples sai para a família como a do RESPONDER
  n := replace(d, $a$resposta_pendente = CASE WHEN p_modo = 'RESPONDER' THEN$a$,
                  $a$resposta_pendente = CASE WHEN p_modo IN ('RESPONDER', 'RESPONDER_SIMPLES') THEN$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_responder: resposta_pendente não encontrado'; END IF;
  d := n;
  n := replace(d, $a$resposta_pendente_em = CASE WHEN p_modo = 'RESPONDER' THEN$a$,
                  $a$resposta_pendente_em = CASE WHEN p_modo IN ('RESPONDER', 'RESPONDER_SIMPLES') THEN$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_responder: resposta_pendente_em não encontrado'; END IF;

  EXECUTE n;
END
$mig$;
