-- 20/11/2026: mapa credencial do n8n → chave de API da OpenAI (teste com uma chamada gpt-5.4 por
-- credencial, conferida minuto a minuto na API de uso). Só três credenciais caem na organização do dono:
--   OpenAI RK - Ju (flows-principal)          → cadafase_clientes
--   RK Analise Conversacional (editori)        → Sistema Analise Conversacional
--   RK - Guido Proposta (editori)              → guido-proposta
-- Arnel, Vetta e os demais clientes usam chaves de outras organizações. O gpt-5.5 de 20–22/10 em
-- cadafase_clientes era a própria Ju antes de ir para o 6.1-sol.
INSERT INTO public.ia_chaves_rk (nome, observacao) VALUES
  ('guido-proposta', 'Credencial "RK - Guido Proposta" (editori): Webhook Principal, Webhook Recebe Email, E-mails recebidos, [Sistema RK] Webhook, Webhook RK. Também usada pelo fluxo Fathom (ativo) e por Procave/Momma/Guido (desligados)')
ON CONFLICT (nome) DO UPDATE SET observacao = EXCLUDED.observacao;
UPDATE public.ia_chaves_rk SET observacao = 'Ju (atendimento, @ju, resumo, imagem, áudio, notas, conferência, follow-up). O gpt-5.5 de 20–22/10 era a própria Ju antes da troca para 6.1-sol' WHERE nome = 'cadafase_clientes';
UPDATE public.ia_chaves_rk SET observacao = '[RK] Análise Conversacional (gpt-6.2-sol desde 20/11/2026; antes gpt-5.5) e [Sistema RK] Webhook Botão (gpt-5.4-nano)' WHERE nome = 'Sistema Analise Conversacional';
