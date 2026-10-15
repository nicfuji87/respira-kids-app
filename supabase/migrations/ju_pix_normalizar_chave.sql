-- Chave Pix chega do WhatsApp como a pessoa escreveu ("CNPJ: 49.511.936/0001-76").
-- O Inter só aceita a chave pura (DCT29 "Chave em formato inválido"), então o cadastro
-- grava normalizado: CNPJ/CPF só dígitos, telefone +55DDDNÚMERO, e-mail minúsculo,
-- aleatória (EVP) em minúsculo com hífens. Primeiro uso real falhou por isso (15/10/2026).

CREATE OR REPLACE FUNCTION public.fn_pix_cpf_valido(p text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d int[];
  s int;
  r int;
BEGIN
  IF p !~ '^[0-9]{11}$' OR p ~ '^(.)\1{10}$' THEN
    RETURN false;
  END IF;
  d := string_to_array(p, NULL)::int[];
  s := 0;
  FOR i IN 1..9 LOOP s := s + d[i] * (11 - i); END LOOP;
  r := (s * 10) % 11; IF r = 10 THEN r := 0; END IF;
  IF r <> d[10] THEN RETURN false; END IF;
  s := 0;
  FOR i IN 1..10 LOOP s := s + d[i] * (12 - i); END LOOP;
  r := (s * 10) % 11; IF r = 10 THEN r := 0; END IF;
  RETURN r = d[11];
END;
$$;

-- Devolve {tipo, chave} ou {erro}. Rótulo escrito ("telefone", "cpf"...) decide o empate
-- de 11 dígitos; sem rótulo, CPF válido é CPF e o resto com 9 na 3ª posição é celular.
CREATE OR REPLACE FUNCTION public.fn_pix_normalizar_chave(p_texto text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_raw   text := trim(coalesce(p_texto, ''));
  v_low   text := lower(v_raw);
  v_sem   text;
  v_dig   text;
  v_rot   text;
BEGIN
  v_rot := substring(v_low from '^(cnpj|cpf|celular|telefone|fone|tel|whatsapp|e-?mail|aleat[oó]ria|evp|chave|pix)');
  -- tira rótulos do começo ("chave pix:", "CNPJ:", "pix -")
  -- (rótulo só conta se vier seguido de ":", "-" ou espaço: "pix@empresa.com" é e-mail)
  v_sem := trim(regexp_replace(v_raw, '^\s*((chave|pix|cnpj|cpf|celular|telefone|fone|tel|whatsapp|e-?mail|aleat[oóÓ]ria|evp)(\s*[:\-–]\s*|\s+))+', '', 'i'));

  IF v_sem ~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN
    RETURN jsonb_build_object('tipo', 'email', 'chave', lower(v_sem));
  END IF;

  IF v_sem ~* '^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$' THEN
    v_dig := lower(regexp_replace(v_sem, '-', '', 'g'));
    RETURN jsonb_build_object('tipo', 'aleatoria', 'chave',
      substr(v_dig, 1, 8) || '-' || substr(v_dig, 9, 4) || '-' || substr(v_dig, 13, 4) || '-' || substr(v_dig, 17, 4) || '-' || substr(v_dig, 21, 12));
  END IF;

  IF v_sem !~ '^[0-9 ().+/\-]+$' THEN
    RETURN jsonb_build_object('erro', 'Não reconheci a chave "' || v_raw || '". Mande só a chave: CNPJ, CPF, celular com DDD, e-mail ou chave aleatória.');
  END IF;

  v_dig := regexp_replace(v_sem, '[^0-9]', '', 'g');

  IF v_rot IN ('celular', 'telefone', 'fone', 'tel', 'whatsapp') OR v_sem ~ '^\+' THEN
    v_dig := regexp_replace(v_dig, '^55(?=[0-9]{10,11}$)', '');
    IF length(v_dig) NOT IN (10, 11) THEN
      RETURN jsonb_build_object('erro', 'Telefone "' || v_raw || '" precisa de DDD + número');
    END IF;
    RETURN jsonb_build_object('tipo', 'telefone', 'chave', '+55' || v_dig);
  END IF;

  IF length(v_dig) = 14 THEN
    RETURN jsonb_build_object('tipo', 'cnpj', 'chave', v_dig);
  END IF;

  IF length(v_dig) = 11 THEN
    IF v_rot = 'cpf' OR public.fn_pix_cpf_valido(v_dig) THEN
      IF NOT public.fn_pix_cpf_valido(v_dig) THEN
        RETURN jsonb_build_object('erro', 'CPF "' || v_raw || '" inválido (dígito verificador não confere)');
      END IF;
      RETURN jsonb_build_object('tipo', 'cpf', 'chave', v_dig);
    END IF;
    IF substr(v_dig, 3, 1) = '9' THEN
      RETURN jsonb_build_object('tipo', 'telefone', 'chave', '+55' || v_dig);
    END IF;
  END IF;

  IF length(v_dig) = 10 OR (length(v_dig) = 13 AND v_dig LIKE '55%') THEN
    RETURN jsonb_build_object('tipo', 'telefone', 'chave', '+55' || right(v_dig, length(v_dig) - CASE WHEN length(v_dig) = 13 THEN 2 ELSE 0 END));
  END IF;

  RETURN jsonb_build_object('erro', 'A chave "' || v_raw || '" não tem formato de CNPJ (14 dígitos), CPF (11), celular com DDD, e-mail ou chave aleatória.');
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_ju_cadastrar_pix(
  p_fornecedor text,
  p_chave text,
  p_solicitante text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_norm     jsonb := public.fn_pix_normalizar_chave(p_chave);
  v_chave    text;
  v_cands    jsonb;
  v_top      record;
  v_segundo  numeric;
  v_anterior text;
BEGIN
  IF nullif(trim(coalesce(p_chave, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Faltou a chave Pix');
  END IF;
  IF v_norm ? 'erro' THEN
    RETURN jsonb_build_object('ok', false, 'erro', v_norm ->> 'erro');
  END IF;
  v_chave := v_norm ->> 'chave';

  SELECT coalesce(jsonb_agg(jsonb_build_object('nome', s.nome, 'score', s.score) ORDER BY s.score DESC), '[]'::jsonb)
  INTO v_cands
  FROM public.fn_financeiro_sugerir_fornecedor(NULL, p_fornecedor) s;

  SELECT s.* INTO v_top FROM public.fn_financeiro_sugerir_fornecedor(NULL, p_fornecedor) s ORDER BY s.score DESC LIMIT 1;
  SELECT s.score INTO v_segundo FROM public.fn_financeiro_sugerir_fornecedor(NULL, p_fornecedor) s ORDER BY s.score DESC OFFSET 1 LIMIT 1;

  IF v_top.fornecedor_id IS NULL OR v_top.score < 0.5 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Não achei o fornecedor "' || coalesce(p_fornecedor, '') || '" no cadastro', 'candidatos', v_cands);
  END IF;
  IF v_segundo IS NOT NULL AND v_top.score - v_segundo < 0.1 AND v_top.score < 1 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Tem mais de um fornecedor parecido com "' || p_fornecedor || '"', 'candidatos', v_cands);
  END IF;

  SELECT chave_pix INTO v_anterior FROM public.fornecedores WHERE id = v_top.fornecedor_id;

  UPDATE public.fornecedores
  SET chave_pix = v_chave,
      chave_pix_atualizada_em = now(),
      chave_pix_origem = 'WhatsApp @ju' || coalesce(' por ' || nullif(p_solicitante, ''), '')
  WHERE id = v_top.fornecedor_id;

  -- link de Pix aberto desse fornecedor passa a usar a chave nova
  UPDATE public.pix_solicitacoes SET chave_pix = v_chave
  WHERE fornecedor_id = v_top.fornecedor_id AND status IN ('aguardando', 'erro');

  RETURN jsonb_build_object('ok', true, 'fornecedor_id', v_top.fornecedor_id, 'fornecedor_nome', v_top.nome,
    'chave', v_chave, 'tipo_chave', v_norm ->> 'tipo', 'chave_anterior', v_anterior);
END;
$$;

-- conserta o que já foi gravado com rótulo/pontuação (Bio Bella, 15/10/2026)
UPDATE public.fornecedores f
SET chave_pix = public.fn_pix_normalizar_chave(f.chave_pix) ->> 'chave'
WHERE nullif(f.chave_pix, '') IS NOT NULL
  AND NOT (public.fn_pix_normalizar_chave(f.chave_pix) ? 'erro')
  AND f.chave_pix <> public.fn_pix_normalizar_chave(f.chave_pix) ->> 'chave';

UPDATE public.pix_solicitacoes s
SET chave_pix = f.chave_pix
FROM public.fornecedores f
WHERE f.id = s.fornecedor_id AND s.status IN ('aguardando', 'erro')
  AND nullif(f.chave_pix, '') IS NOT NULL AND s.chave_pix <> f.chave_pix;

REVOKE ALL ON FUNCTION public.fn_pix_normalizar_chave(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_pix_cpf_valido(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pix_normalizar_chave(text) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pix_cpf_valido(text) TO service_role, authenticated;
