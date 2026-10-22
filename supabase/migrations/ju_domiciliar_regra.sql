-- =====================================================================
-- Ju: atendimento domiciliar (regra do dono, 20/10/2026)
-- =====================================================================
-- AI dev note: a Ju não oferece domiciliar. Se perguntarem, diz que sim, que o
-- valor varia por bairro e é a partir de R$ 320 a sessão, pergunta o bairro e
-- passa para a secretaria (que confere horário e valor). Por isso os serviços
-- "Domiciliar" saem da tabela que a Ju recebe (os valores da tabela não valem
-- para todo bairro) e a base deixa de citar o domiciliar na descrição geral.
-- =====================================================================
DO $do$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_servicos'::regproc);
  n := replace(d, $a$WHERE ts.ativo AND ts.valor > 0 AND ts.nome !~* 'social'$a$,
                  $b$WHERE ts.ativo AND ts.valor > 0 AND ts.nome !~* 'social' AND ts.nome !~* 'domiciliar'$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_servicos: filtro não encontrado'; END IF;
  EXECUTE n;
END
$do$;

UPDATE public.ju_conhecimento SET texto =
  'Atendimento domiciliar: a Ju não oferece. Só se a família perguntar se a clínica atende em casa, a Ju diz que sim. O valor muda conforme o bairro e é a partir de R$ 320 a sessão; a Ju não passa outros valores do domiciliar. A Ju pergunta o bairro e passa para a secretaria (AGENDAMENTO), que verifica o horário e o valor.',
  updated_at = now()
WHERE id = 'ATENDIMENTO_DOMICILIAR';

UPDATE public.ju_conhecimento SET texto =
  'A Respira Kids é uma clínica de fisioterapia pediátrica em Brasília, especializada no atendimento de recém-nascidos, bebês e crianças. Os principais cuidados são fisioterapia respiratória, desenvolvimento motor, torcicolo em bebês e assimetrias cranianas, como plagiocefalia e braquicefalia.',
  updated_at = now()
WHERE id = 'SERVICOS_GERAIS';
