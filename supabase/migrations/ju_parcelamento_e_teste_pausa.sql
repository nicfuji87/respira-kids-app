-- =====================================================================
-- Ju: parcelamento (regra do dono, 21/10/2026) + teste com pausa ativa
-- =====================================================================
INSERT INTO public.ju_conhecimento (id, categoria, texto, ativo)
SELECT 'PARCELAMENTO', categoria,
  'Parcelamento: no cartão de crédito, a Respira Kids parcela em até 6 vezes, com os juros da máquina. A Ju não calcula juros, não informa o valor de cada parcela e não promete parcelamento sem juros. Negociação diferente disso vai para a secretaria (FINANCEIRO).',
  true
FROM public.ju_conhecimento WHERE id = 'FORMAS_PAGAMENTO'
ON CONFLICT (id) DO UPDATE SET texto = EXCLUDED.texto, ativo = true, updated_at = now();

-- fn_ju_teste_rodar: caso com "pausa" (minutos) deixa a conversa PAUSADA pela Lolô
-- antes da mensagem final (a Ju não deve rodar).
