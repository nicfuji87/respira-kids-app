-- ============================================================================
-- TRAVA FINAL contra pediatra duplicado — APLICAR SÓ DEPOIS DO DEPLOY
-- ============================================================================
--
-- PRÉ-REQUISITO OBRIGATÓRIO: a edge function public-patient-registration precisa
-- estar deployada com o lookup por nome (a versão em dedup_pediatra_obstetra.sql
-- e no index.ts atual do repo):
--
--     supabase login
--     supabase functions deploy public-patient-registration \
--       --project-ref jqegoentcusnbcykgtxg
--
-- POR QUE A ORDEM IMPORTA (erro cometido e revertido em 20/07/2026):
-- a versão publicada da edge function insere o pediatra sem procurar antes. Com o
-- índice ativo, um nome que já existe deixa de virar duplicata silenciosa e passa a
-- estourar unique_violation — a função dá throw e o cadastro do PACIENTE inteiro
-- falha. O caso mais comum seria o pior: quem marca "não possui pediatra" manda
-- "Não Informado", que já existe, e não conseguiria concluir o cadastro.
-- O índice chegou a ficar ~10 minutos ativo e foi removido; nenhum cadastro público
-- ocorreu na janela (verificado em public_registration_api_logs), impacto zero.
--
-- Depois do deploy, tanto a edge function quanto a RPC create_and_link_pediatrician
-- reaproveitam o registro existente e ainda tratam unique_violation como corrida,
-- refazendo a busca. Aí o índice vira rede de proteção, não armadilha.
--
-- ANTES DE APLICAR, confirme que não há duplicata (precisa retornar 0):
--   SELECT count(*) FROM (
--     SELECT fn_normalizar_nome_profissional(p.nome)
--     FROM pessoas p JOIN pessoa_tipos t ON t.id = p.id_tipo_pessoa
--     WHERE t.codigo = 'medico' AND p.ativo
--     GROUP BY 1 HAVING count(*) > 1) x;
--
-- Parcial de propósito:
--   - só vale para o tipo 'medico' (pediatras). Responsáveis e pacientes homônimos
--     continuam livres, que é o normal (pai e filho com mesmo nome, por exemplo).
--   - só vale para ativos, então desativar um registro libera o nome de novo.
--
-- O uuid do tipo está literal porque o predicado de um índice parcial precisa ser
-- IMMUTABLE (subquery não é permitida). Se o tipo 'medico' for recriado com outro
-- id, este índice para de valer em silêncio — recriar apontando para o novo id.
--
-- Efeito colateral aceito: dois pediatras reais com nome idêntico passam a ser
-- tratados como um só. Esse já era o comportamento do lookup por nome; o índice
-- apenas impede contorná-lo. Se acontecer, diferencie o cadastro (ex.: incluir o
-- hospital no nome) — o erro aparece explicitamente em vez de duplicar calado.

CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_pediatra_nome_unico
ON public.pessoas (public.fn_normalizar_nome_profissional(nome))
WHERE id_tipo_pessoa = 'a514dfab-c173-409e-bb90-6c54caba19ff'::uuid
  AND ativo = true;

COMMENT ON INDEX public.idx_pessoas_pediatra_nome_unico IS
  'Impede pediatras duplicados por nome (normalizado: sem acento/caixa/prefixo Dr.). Parcial: apenas id_tipo_pessoa=medico e ativo=true.';
