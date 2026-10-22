-- Ju: a transcrição automática de áudio ("*Ju*: *Transcrição automática do audio:*")
-- mandada pela automação antiga sai pelo número da clínica sem a marca da API e era
-- lida como a recepção escrevendo: pausava a Ju 30 min a cada áudio de família e
-- entrava no histórico como "Recepção (Lolô)". Achado na análise de 22/10/2026
-- (7 casos em 3 dias). Passa a ser AUTOMACAO, e as antigas são reclassificadas.
-- Atenção ao ligar a Ju: a Entrada nova também manda a transcrição; desligar uma das duas.
INSERT INTO public.ju_assinaturas_automacao (padrao, descricao)
VALUES ('transcri[cç][aã]o autom[aá]tica do [aá]udio', 'transcrição de áudio da automação antiga (*Ju*:)')
ON CONFLICT (padrao) DO NOTHING;

UPDATE public.ju_mensagens
   SET origem = 'AUTOMACAO'
 WHERE origem = 'HUMANO'
   AND conteudo ~* 'transcri[cç][aã]o autom[aá]tica do [aá]udio';
