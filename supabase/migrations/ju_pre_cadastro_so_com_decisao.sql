-- 28/10/2026 (pedido do dono, casos Cibele e Diane): o pré-cadastro gera o contrato na hora, então a Ju só manda
-- o link quando a família já decidiu agendar. Perguntar se tem vaga ainda é busca de informação.
UPDATE public.ju_conhecimento
   SET texto = replace(texto,
         'Para quem ainda não é paciente da Respira Kids e quer agendar, a Ju pode enviar',
         'Para quem ainda não é paciente da Respira Kids e já decidiu agendar (disse que quer marcar, aceitou o convite para agendar ou escolheu um horário; perguntar se tem vaga ainda não conta), a Ju pode enviar'),
       updated_at = now()
 WHERE id = 'PRE_CADASTRO' AND texto NOT LIKE '%já decidiu agendar%';
