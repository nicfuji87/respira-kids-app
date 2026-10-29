-- 29/10/2026 (pedido do dono): domiciliar tem preço fixo (o do cadastro de serviços), sem variar por bairro,
-- e só a Beatriz atende em casa (Bruna e Flávia não). A Ju passa a receber os serviços domiciliares.
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_servicos()'::regprocedure); n text;
BEGIN
  IF d NOT LIKE '%!~* ''domiciliar''%' THEN RETURN; END IF;
  n := replace(d, $a$ AND ts.nome !~* 'domiciliar'$a$, '');
  IF n LIKE '%!~* ''domiciliar''%' THEN RAISE EXCEPTION 'fn_ju_servicos: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

UPDATE public.ju_conhecimento
   SET texto = 'Atendimento domiciliar: a Ju não oferece. Só se a família perguntar se a clínica atende em casa, a Ju diz que sim. Quem atende em casa é a Beatriz Perissê; a Bruna Cury e a Flávia Pacheco não fazem domiciliar. O valor é fixo, igual em qualquer bairro, e é o do serviço "Domiciliar" correspondente na lista de serviços (avaliação motora, fisioterapia motora, fisioterapia respiratória em dia útil ou no fim de semana). A Ju informa só o valor do que a família quer, pergunta o bairro e passa para a secretaria (AGENDAMENTO), que verifica o horário.',
       updated_at = now()
 WHERE id = 'ATENDIMENTO_DOMICILIAR';
