-- Ficha de entrevista (roteiro preenchido durante a entrevista presencial).
-- Estrutura livre em jsonb:
--   { itens: {[id]: {ok,aval,nota}}, impressao_geral, pontos_fortes,
--     pontos_atencao, concluida, atualizado_em }
-- Editável por admin/secretaria via as policies de UPDATE já existentes na tabela.
ALTER TABLE public.candidaturas_estagio
  ADD COLUMN IF NOT EXISTS entrevista jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.candidaturas_estagio.entrevista IS
  'Ficha de entrevista preenchida pelo avaliador (checklist do roteiro + notas). Editável por admin/secretaria via RLS existente.';
