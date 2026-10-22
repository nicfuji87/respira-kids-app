-- =====================================================================
-- Ju: pessoa da equipe que também é responsável de paciente
-- =====================================================================
-- AI dev note: fn_ju_contexto_cliente só reconhecia pelo telefone quem tinha
-- tipo 'responsavel' (ou paciente adulto). Quem é da equipe (admin,
-- profissional, secretaria) e também é pai/mãe de paciente ficava como
-- "não identificado" (achado no teste de 17/10/2026: o dono, tipo admin, pai
-- do Henrique). Agora o vínculo ativo em pessoa_responsaveis também conta: é ele
-- que dá o acesso, não o tipo do cadastro. O escopo (agenda/financeiro) continua
-- vindo do tipo_responsabilidade de cada vínculo.
-- =====================================================================
DO $do$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_contexto_cliente'::regproc);
  n := replace(d, $a$OR (t.codigo = 'paciente' AND p.data_nascimento <= current_date - interval '18 years'))$a$,
                  $b$OR (t.codigo = 'paciente' AND p.data_nascimento <= current_date - interval '18 years')
           OR EXISTS (SELECT 1 FROM public.pessoa_responsaveis v
                       WHERE v.id_responsavel = p.id AND v.ativo
                         AND (v.data_fim IS NULL OR v.data_fim >= current_date)))$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_contexto_cliente: trecho não encontrado'; END IF;
  EXECUTE n;
END
$do$;
