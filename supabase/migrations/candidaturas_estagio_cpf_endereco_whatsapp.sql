-- AI dev note: 1º cadastro do candidato a estágio passa a coletar CPF, endereço
-- completo e o resultado da verificação de WhatsApp (existência + JID normalizado).
-- Esses dados são necessários para gerar o Termo de Compromisso de Estágio e enviar
-- para assinatura (Assinafy) quando o candidato for aprovado.

alter table public.candidaturas_estagio
  add column if not exists cpf text,
  add column if not exists whatsapp_jid text,
  add column if not exists whatsapp_verificado boolean not null default false,
  add column if not exists cep text,
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists bairro text,
  add column if not exists uf text;

-- Estende a RPC de submissão (SECURITY DEFINER) para persistir os novos campos.
-- Mantém toda a correção do situacional no servidor (gabarito não trafega).
CREATE OR REPLACE FUNCTION public.submit_candidatura_estagio(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_gabarito jsonb := '{
    "s1": {"correta": "c", "pontos": {"a": 1, "b": 0, "c": 2, "d": 0}, "perigosas": []},
    "s2": {"correta": "b", "pontos": {"a": 1, "b": 2, "c": 0, "d": 1}, "perigosas": []},
    "s3": {"correta": "c", "pontos": {"a": 0, "b": 1, "c": 2, "d": 0}, "perigosas": ["a", "d"]},
    "s4": {"correta": "c", "pontos": {"a": 0, "b": 1, "c": 2, "d": 0}, "perigosas": []},
    "s5": {"correta": "c", "pontos": {"a": 1, "b": 0, "c": 2, "d": 0}, "perigosas": []},
    "s6": {"correta": "b", "pontos": {"a": 0, "b": 2, "c": 1, "d": 0}, "perigosas": []}
  }'::jsonb;

  v_cand jsonb := COALESCE(payload->'candidato', '{}'::jsonb);
  v_sit jsonb := COALESCE(payload->'situacional', '{}'::jsonb);
  v_escrita jsonb := COALESCE(payload->'escrita', '{}'::jsonb);
  v_estilo jsonb := COALESCE(payload->'estilo', '{}'::jsonb);

  v_nome text := NULLIF(trim(v_cand->>'nome'), '');
  v_email text := NULLIF(trim(v_cand->>'email'), '');
  v_cpf text := NULLIF(regexp_replace(COALESCE(v_cand->>'cpf', ''), '\D', '', 'g'), '');

  v_key text;
  v_escolha text;
  v_correta text;
  v_pontos int;
  v_perigosa boolean;
  v_total int := 0;
  v_max int := 0;
  v_correcao jsonb := '[]'::jsonb;
  v_tem_perigosa boolean := false;

  v_disp text[];
  v_estilo_perfil text;
BEGIN
  IF v_nome IS NULL OR v_email IS NULL THEN
    RAISE EXCEPTION 'Nome e e-mail são obrigatórios';
  END IF;

  -- Corrige situacional (s1..s6) no servidor
  FOR v_key IN SELECT k FROM jsonb_object_keys(v_gabarito) AS k ORDER BY k LOOP
    v_correta := v_gabarito->v_key->>'correta';
    v_escolha := NULLIF(trim(v_sit->>v_key), '');
    v_max := v_max + 2;

    IF v_escolha IS NULL THEN
      v_pontos := 0;
      v_perigosa := false;
    ELSE
      v_pontos := COALESCE((v_gabarito->v_key->'pontos'->>v_escolha)::int, 0);
      v_perigosa := COALESCE((v_gabarito->v_key->'perigosas') ? v_escolha, false);
    END IF;

    v_total := v_total + v_pontos;
    IF v_perigosa THEN
      v_tem_perigosa := true;
    END IF;

    v_correcao := v_correcao || jsonb_build_object(
      'id', v_key,
      'escolha', v_escolha,
      'correta', v_correta,
      'pontos', v_pontos,
      'acertou', COALESCE(v_escolha = v_correta, false),
      'perigosa', v_perigosa
    );
  END LOOP;

  -- Disponibilidade (array de strings) -> text[]
  SELECT COALESCE(array_agg(left(elem, 100)), '{}')
  INTO v_disp
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(v_cand->'disponibilidade') = 'array'
         THEN v_cand->'disponibilidade' ELSE '[]'::jsonb END
  ) AS elem;

  -- Estilo de trabalho: perfil dominante (moda das respostas) — não pontua
  SELECT val INTO v_estilo_perfil
  FROM (
    SELECT value AS val, count(*) AS c
    FROM jsonb_each_text(v_estilo)
    WHERE value IS NOT NULL AND value <> ''
    GROUP BY value
    ORDER BY c DESC, val ASC
    LIMIT 1
  ) t;

  INSERT INTO public.candidaturas_estagio (
    nome, email, telefone, curso, instituicao, periodo, previsao_formatura,
    cidade, disponibilidade, como_soube, linkedin_url,
    cpf, whatsapp_jid, whatsapp_verificado,
    cep, logradouro, numero, complemento, bairro, uf,
    situacional_respostas, situacional_correcao, pontuacao_situacional,
    pontuacao_maxima, tem_resposta_perigosa,
    texto_motivacao, texto_mae_ansiosa,
    estilo_respostas, estilo_perfil
  ) VALUES (
    left(v_nome, 200),
    left(v_email, 200),
    left(NULLIF(trim(v_cand->>'telefone'), ''), 40),
    left(NULLIF(trim(v_cand->>'curso'), ''), 200),
    left(NULLIF(trim(v_cand->>'instituicao'), ''), 200),
    left(NULLIF(trim(v_cand->>'periodo'), ''), 100),
    left(NULLIF(trim(v_cand->>'previsao_formatura'), ''), 100),
    left(NULLIF(trim(v_cand->>'cidade'), ''), 120),
    v_disp,
    left(NULLIF(trim(v_cand->>'como_soube'), ''), 200),
    left(NULLIF(trim(v_cand->>'linkedin_url'), ''), 300),
    left(v_cpf, 14),
    left(NULLIF(trim(v_cand->>'whatsapp_jid'), ''), 60),
    COALESCE((v_cand->>'whatsapp_verificado')::boolean, false),
    left(NULLIF(trim(v_cand->>'cep'), ''), 12),
    left(NULLIF(trim(v_cand->>'logradouro'), ''), 200),
    left(NULLIF(trim(v_cand->>'numero'), ''), 20),
    left(NULLIF(trim(v_cand->>'complemento'), ''), 120),
    left(NULLIF(trim(v_cand->>'bairro'), ''), 120),
    left(NULLIF(trim(v_cand->>'uf'), ''), 2),
    v_sit, v_correcao, v_total, v_max, v_tem_perigosa,
    left(NULLIF(trim(v_escrita->>'motivacao'), ''), 5000),
    left(NULLIF(trim(v_escrita->>'mae_ansiosa'), ''), 5000),
    v_estilo, v_estilo_perfil
  );

  RETURN jsonb_build_object('ok', true);
END;
$function$;
