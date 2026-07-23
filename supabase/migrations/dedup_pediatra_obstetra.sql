-- Deduplicação de pediatras e obstetras na origem.
--
-- Contexto (jul/2026): o cadastro de pediatra tinha 3 portas de entrada e nenhuma
-- procurava por nome antes de inserir. Resultado: 413 pessoas tipo médico para 316
-- médicos reais — "Não Informado" 45x, Carlos Zaconeta 5x (contando os "Dr."),
-- Nathália Sarkis 3x fatiando 130 pacientes. Além disso, 20 pessoas ficaram órfãs
-- (tipo médico sem pessoa_pediatra) porque a edge function faz 2 inserts não
-- atômicos e não desfazia o primeiro quando o segundo falhava.
--
-- O passivo foi consolidado (86 cópias removidas, backup em
-- _bkp_consolidacao_pediatras e _bkp_merge_pessoas_duplicadas). Esta migration
-- fecha a origem.
--
-- Decisões:
--  - pediatra continua tipo 'medico', obstetra continua 'prof_externo'. Nenhum
--    registro muda de tipo: foi verificado que NENHUMA leitura do sistema depende
--    de pessoa_tipos.codigo — todos os consumidores entram por pessoa_pediatra /
--    paciente_pediatra (views vw_usuarios_admin, pacientes_com_responsaveis_view,
--    vw_pediatras_relacionamento e a RPC fn_search_pacientes_paginado).
--  - as RPCs mantêm assinatura e formato de retorno, então os call sites do front
--    seguem funcionando sem alteração.
--  - "Não Informado" é resposta afirmativa do responsável (criança sem pediatra
--    fixo, atendida em posto), não ausência de dado. Continua virando vínculo —
--    o que muda é apontar sempre para o mesmo registro canônico.

-- ============================================================================
-- 1. Normalização canônica de nome de profissional
-- ============================================================================
-- IMMUTABLE de propósito: unaccent() é apenas STABLE (depende de dicionário) e não
-- pode ser usada em índice. translate() cobre os acentos do português e é
-- determinística. Verificado contra unaccent() em 331 nomes reais: zero divergência.
--
-- Ordem importa: o trim vem ANTES de tirar o prefixo, senão "  Dr. Fulano" (com
-- espaço à esquerda) não casa com o âncora ^ e o prefixo sobrevive, separando-o de
-- "Fulano". O separador é "ponto + espaços opcionais" OU "espaços" — exigir um dos
-- dois evita decepar nomes próprios que começam igual (Drauzio, Dragan, Draco).
--
-- Espelha normalizarNomePediatra() em
-- supabase/functions/public-patient-registration/index.ts. As duas PRECISAM
-- continuar equivalentes: é esta função que alimenta o índice único no fim do
-- arquivo, e a da edge function que decide se reutiliza. Se divergirem, a busca não
-- acha o registro que o índice depois recusa.
CREATE OR REPLACE FUNCTION public.fn_normalizar_nome_profissional(p_nome text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(
    trim(
      regexp_replace(
        regexp_replace(
          trim(
            translate(
              lower(coalesce(p_nome, '')),
              'áàâãäéèêëíìîïóòôõöúùûüçñ',
              'aaaaaeeeeiiiiooooouuuucn'
            )
          ),
          '^(dr|dra)(\.\s*|\s+)', '', ''
        ),
        '\s+', ' ', 'g'
      )
    ),
    ''
  );
$$;

COMMENT ON FUNCTION public.fn_normalizar_nome_profissional(text) IS
  'Normaliza nome de pediatra/obstetra para deduplicacao: minusculas, sem acento, sem prefixo Dr./Dra., espacos colapsados. IMMUTABLE para permitir uso em indice.';

-- ============================================================================
-- 2. Limpeza de nome preservando a capitalização original
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_limpar_nome_profissional(p_nome text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(
    trim(regexp_replace(regexp_replace(trim(coalesce(p_nome, '')), '^(dr|dra)(\.\s*|\s+)', '', 'i'), '\s+', ' ', 'g')),
    ''
  );
$$;

COMMENT ON FUNCTION public.fn_limpar_nome_profissional(text) IS
  'Limpa nome preservando capitalizacao: remove prefixo Dr./Dra. e colapsa espacos.';

-- ============================================================================
-- 3. create_and_link_pediatrician — reutiliza em vez de duplicar
-- ============================================================================
-- Mudanças em relação à versão anterior:
--   a) procura por nome normalizado antes de criar (era o defeito principal);
--   b) o vínculo paciente↔pediatra virou idempotente, então chamar duas vezes não
--      estoura a UNIQUE (paciente_id, pediatra_id);
--   c) grava o nome limpo, para que a próxima busca case;
--   d) completa o CRM se a pessoa já existia sem ele;
--   e) tolera corrida contra o índice único (ver bloco EXCEPTION).
--
-- Atenção ao ON CONFLICT: RETURNS TABLE(pediatra_id ...) declara uma variável
-- PL/pgSQL com o mesmo nome da coluna paciente_pediatra.pediatra_id, e
-- "ON CONFLICT (paciente_id, pediatra_id)" aborta com 42702 (ambiguidade).
-- Por isso a constraint é referenciada pelo nome.
CREATE OR REPLACE FUNCTION public.create_and_link_pediatrician(
  p_paciente_id uuid,
  p_nome text,
  p_crm text DEFAULT NULL::text
)
RETURNS TABLE(pediatra_id uuid, pessoa_id uuid, success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pessoa_id UUID;
  v_pediatra_id UUID;
  v_tipo_medico_id UUID;
  v_user_role TEXT;
  v_nome_limpo TEXT;
  v_nome_norm TEXT;
  v_reutilizado BOOLEAN := FALSE;
BEGIN
  -- 1. Permissao (regra inalterada: admin ou secretaria)
  SELECT role INTO v_user_role
  FROM pessoas
  WHERE auth_user_id = auth.uid();

  IF v_user_role IS NULL OR v_user_role NOT IN ('admin', 'secretaria') THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'Sem permissao para criar pediatras'::TEXT;
    RETURN;
  END IF;

  -- 2. Normalizar entrada
  v_nome_limpo := fn_limpar_nome_profissional(p_nome);
  IF v_nome_limpo IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'Nome do pediatra e obrigatorio'::TEXT;
    RETURN;
  END IF;
  v_nome_norm := fn_normalizar_nome_profissional(v_nome_limpo);

  -- 3. Reutilizar pediatra existente (o mais antigo = canonico)
  SELECT pp.id, pp.pessoa_id
    INTO v_pediatra_id, v_pessoa_id
  FROM pessoa_pediatra pp
  JOIN pessoas pe ON pe.id = pp.pessoa_id
  WHERE pp.ativo
    AND pe.ativo
    AND fn_normalizar_nome_profissional(pe.nome) = v_nome_norm
  ORDER BY pe.created_at
  LIMIT 1;

  IF v_pediatra_id IS NOT NULL THEN
    v_reutilizado := TRUE;

    IF p_crm IS NOT NULL THEN
      UPDATE pessoa_pediatra
      SET crm = p_crm
      WHERE id = v_pediatra_id AND crm IS NULL;
    END IF;
  ELSE
    -- 4. Criar do zero
    SELECT id INTO v_tipo_medico_id
    FROM pessoa_tipos
    WHERE codigo = 'medico'
    LIMIT 1;

    IF v_tipo_medico_id IS NULL THEN
      RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'Tipo medico nao encontrado'::TEXT;
      RETURN;
    END IF;

    BEGIN
      v_pessoa_id := gen_random_uuid();

      INSERT INTO pessoas (id, nome, id_tipo_pessoa, responsavel_cobranca_id, ativo)
      VALUES (v_pessoa_id, v_nome_limpo, v_tipo_medico_id, v_pessoa_id, TRUE);

      INSERT INTO pessoa_pediatra (pessoa_id, crm, especialidade, ativo)
      VALUES (v_pessoa_id, p_crm, 'Pediatria', TRUE)
      RETURNING id INTO v_pediatra_id;
    EXCEPTION WHEN unique_violation THEN
      -- Dois cadastros simultaneos informaram o mesmo pediatra novo: ambos fizeram o
      -- lookup, nenhum achou, e este perdeu a corrida para o indice unico. O bloco
      -- reverte o insert parcial; basta reaproveitar o registro do concorrente.
      v_pediatra_id := NULL;

      SELECT pp.id, pp.pessoa_id
        INTO v_pediatra_id, v_pessoa_id
      FROM pessoa_pediatra pp
      JOIN pessoas pe ON pe.id = pp.pessoa_id
      WHERE pp.ativo
        AND pe.ativo
        AND fn_normalizar_nome_profissional(pe.nome) = v_nome_norm
      ORDER BY pe.created_at
      LIMIT 1;

      IF v_pediatra_id IS NULL THEN
        RAISE;
      END IF;

      v_reutilizado := TRUE;
    END;
  END IF;

  -- 5. Vincular ao paciente (idempotente: reativa se estava desativado)
  INSERT INTO paciente_pediatra (paciente_id, pediatra_id, ativo)
  VALUES (p_paciente_id, v_pediatra_id, TRUE)
  ON CONFLICT ON CONSTRAINT unique_paciente_pediatra
  DO UPDATE SET ativo = TRUE, updated_at = now();

  RETURN QUERY SELECT
    v_pediatra_id,
    v_pessoa_id,
    TRUE,
    (CASE WHEN v_reutilizado
          THEN 'Pediatra ja cadastrado, vinculado ao paciente'
          ELSE 'Pediatra criado e vinculado com sucesso'
     END)::TEXT;
END;
$function$;

-- ============================================================================
-- 4. create_or_get_obstetrician — mesma proteção para o lado obstetra
-- ============================================================================
-- O front da avaliação clínica inseria direto em pessoas + pessoa_obstetra, sem
-- procurar. Hoje são só 3 obstetras sem duplicata, mas é o mesmo padrão que gerou
-- 97 pediatras excedentes.
-- Atenção à assimetria do schema: avaliacoes_clinicas.obstetra_id referencia
-- pessoas(id), não pessoa_obstetra(id) — por isso o retorno expõe os dois ids e o
-- front usa pessoa_id.
CREATE OR REPLACE FUNCTION public.create_or_get_obstetrician(
  p_nome text,
  p_crm text DEFAULT NULL::text
)
RETURNS TABLE(obstetra_id uuid, pessoa_id uuid, success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pessoa_id UUID;
  v_obstetra_id UUID;
  v_tipo_id UUID;
  v_user_role TEXT;
  v_nome_limpo TEXT;
  v_nome_norm TEXT;
  v_reutilizado BOOLEAN := FALSE;
BEGIN
  SELECT role INTO v_user_role
  FROM pessoas
  WHERE auth_user_id = auth.uid();

  IF v_user_role IS NULL OR v_user_role NOT IN ('admin', 'secretaria') THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'Sem permissao para criar obstetras'::TEXT;
    RETURN;
  END IF;

  v_nome_limpo := fn_limpar_nome_profissional(p_nome);
  IF v_nome_limpo IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'Nome do obstetra e obrigatorio'::TEXT;
    RETURN;
  END IF;
  v_nome_norm := fn_normalizar_nome_profissional(v_nome_limpo);

  SELECT po.id, po.pessoa_id
    INTO v_obstetra_id, v_pessoa_id
  FROM pessoa_obstetra po
  JOIN pessoas pe ON pe.id = po.pessoa_id
  WHERE po.ativo
    AND pe.ativo
    AND fn_normalizar_nome_profissional(pe.nome) = v_nome_norm
  ORDER BY pe.created_at
  LIMIT 1;

  IF v_obstetra_id IS NOT NULL THEN
    v_reutilizado := TRUE;

    IF p_crm IS NOT NULL THEN
      UPDATE pessoa_obstetra
      SET crm = p_crm
      WHERE id = v_obstetra_id AND crm IS NULL;
    END IF;
  ELSE
    SELECT id INTO v_tipo_id
    FROM pessoa_tipos
    WHERE codigo = 'prof_externo'
    LIMIT 1;

    IF v_tipo_id IS NULL THEN
      RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'Tipo profissional externo nao encontrado'::TEXT;
      RETURN;
    END IF;

    v_pessoa_id := gen_random_uuid();

    INSERT INTO pessoas (id, nome, id_tipo_pessoa, responsavel_cobranca_id, ativo)
    VALUES (v_pessoa_id, v_nome_limpo, v_tipo_id, v_pessoa_id, TRUE);

    INSERT INTO pessoa_obstetra (pessoa_id, crm, especialidade, ativo)
    VALUES (v_pessoa_id, p_crm, 'Ginecologia e Obstetricia', TRUE)
    RETURNING id INTO v_obstetra_id;
  END IF;

  RETURN QUERY SELECT
    v_obstetra_id,
    v_pessoa_id,
    TRUE,
    (CASE WHEN v_reutilizado
          THEN 'Obstetra ja cadastrado, reutilizado'
          ELSE 'Obstetra criado com sucesso'
     END)::TEXT;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_or_get_obstetrician(text, text) TO authenticated, service_role;

-- ============================================================================
-- 5. A trava (índice único) fica em arquivo separado — NÃO aplicar junto
-- ============================================================================
-- Ver dedup_pediatra_indice_unico.sql. Ele SÓ pode ser aplicado depois que a edge
-- function public-patient-registration for deployada: a versão publicada hoje
-- ainda insere pediatra sem procurar, e o índice transformaria essa duplicação
-- silenciosa em erro que derruba o cadastro do paciente inteiro.
