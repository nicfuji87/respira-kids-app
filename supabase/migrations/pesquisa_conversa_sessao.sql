-- Pergunta nova na Pesquisa de Experiência (03/10/2026): equilíbrio da conversa
-- durante a sessão. Nasceu de uma observação da secretaria (estagiária contando
-- da própria vida para a família), mas a pergunta NÃO cita estagiária:
--  * a família muitas vezes não distingue estagiária de fisioterapeuta;
--  * pesquisa anônima avaliando pessoa identificável é injusta com a estudante;
--  * citar o problema no enunciado induziria a resposta (regras anti-viés em
--    src/lib/pesquisa-experiencia-questions.ts).
-- A escala é simétrica: fala de menos (2 degraus) / na medida / se estende (2).
ALTER TABLE pesquisas_experiencia ADD COLUMN IF NOT EXISTS conversa_sessao text;
COMMENT ON COLUMN pesquisas_experiencia.conversa_sessao IS
  'Equilíbrio da conversa na sessão: muito_pouca | pouca | certa | as_vezes_demais | muitas_vezes_demais | nao_sei';
