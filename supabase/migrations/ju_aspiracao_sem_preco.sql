-- AI dev note: 05/11/2026 (decisão do dono): a Ju passou o preço da aspiração e a Lolô agendou a sessão. A criança
-- sempre passa por uma sessão de fisioterapia respiratória; a fisio decide na hora se só aspira ou faz o atendimento
-- completo, e isso não precisa ser dito à família. A Ju diz que aspiramos, sim, e se perguntarem o preço informa o da
-- sessão respiratória. "Aspiração de Secreções" sai da tabela que a Ju recebe (o serviço continua na agenda e no contrato).

DO $do$
DECLARE d text := pg_get_functiondef('public.fn_ju_servicos'::regproc);
  a text := $a$WHERE ts.ativo AND ts.valor > 0 AND ts.nome !~* 'social'$a$;
BEGIN
  IF position(a IN d) = 0 THEN RAISE EXCEPTION 'fn_ju_servicos: trecho não encontrado'; END IF;
  EXECUTE replace(d, a, $a$WHERE ts.ativo AND ts.valor > 0 AND ts.nome !~* 'social' AND ts.nome !~* 'aspira'$a$);
END $do$;

UPDATE public.ju_conhecimento
   SET texto = replace(replace(texto,
     'O valor é o de "Aspiração de Secreções" da tabela de serviços.',
     'A aspiração é feita dentro da sessão de fisioterapia respiratória: a Ju não fala em valor de aspiração separado. Se a família perguntar o preço para aspirar, informe o valor da sessão de fisioterapia respiratória (da fisio, se já souber qual) e, se ela quiser, siga para o agendamento da sessão. Não explique que a fisio decide na hora o que fazer na sessão.'),
     'seguem a regra de GRAVIDADE: atendimento médico de urgência, sem esperar agendamento na clínica.',
     'seguem a regra de SITUAÇÃO CRÍTICA: a Ju chama a equipe na hora.'),
       updated_at = now()
 WHERE id = 'ASPIRACAO';
