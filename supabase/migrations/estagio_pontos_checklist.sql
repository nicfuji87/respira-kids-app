-- AI dev note: Checklist de saída do estagiário (o que fez no turno), gravado
-- junto da batida de saída em estagio_pontos.checklist (jsonb):
--   { items: { agenda: true, instrumentos: false, ... }, observacao: "..." }
-- Null nas batidas de entrada. Os itens do checklist ficam no front
-- (src/lib/estagio-ponto-checklist.ts), fáceis de editar.
alter table public.estagio_pontos
  add column if not exists checklist jsonb;
