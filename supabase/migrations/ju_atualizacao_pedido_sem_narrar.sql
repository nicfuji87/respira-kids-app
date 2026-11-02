-- 02/11/2026 (caso Érica): a cada resposta da família a Ju dizia "Acrescentei essas informações ao pedido" e
-- repetia que a secretaria segue com o pedido, porque o retorno da ferramenta mandava avisar. A trava que corta
-- o aviso repetido deixou sobrar só o eco ("Pode ser em qualquer período, com preferência à tarde.").
DO $mig$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_chamar_secretaria(bigint, bigint, text, text, boolean, uuid)'::regprocedure);
  n := replace(d, $a$'resposta_ia', 'A secretaria já tinha sido avisada sobre isso; a informação nova foi acrescentada ao pedido. Avise a família que a secretaria segue com o pedido e responde por aqui.');$a$,
    $a$'resposta_ia', 'Informação acrescentada ao pedido que a secretaria já tem. Não conte isso à família nem repita que a secretaria vai responder: siga a conversa com a próxima pergunta que falta ou, se não falta nada, feche em uma frase natural dizendo o próximo passo (por exemplo, que a Lolô manda os horários assim que começar o atendimento), sem repetir o que a família acabou de dizer.');$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_chamar_secretaria: trecho não encontrado'; END IF;
  EXECUTE n;
END $mig$;
