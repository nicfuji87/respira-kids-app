-- 30/10/2026: cadastro feito na hora e consulta marcada logo depois → a Assinafy mandava o contrato e, no mesmo
-- minuto, saía o aviso "o contrato ainda não foi assinado, posso reenviar?" (João/Madalena, Paulo/Antonia).
-- Criança com contrato gerado ou enviado à Assinafy nas últimas 6 h não entra no aviso; sem ninguém, não avisa
-- (e libera a reserva do dia para um aviso posterior).
CREATE OR REPLACE FUNCTION public.fn_aviso_contrato_reservar(p_telefone text, p_paciente_nome text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_chave text := public.fn_atrib_tel_chave(p_telefone);
  v_ok boolean; v_conv bigint; v_todos jsonb; v_nomes text[]; v_frase text; v_recentes int := 0;
BEGIN
  IF v_chave IS NULL THEN RETURN jsonb_build_object('enviar', false, 'motivo', 'sem_telefone'); END IF;
  DELETE FROM public.aviso_contrato_enviados WHERE dia < current_date - 30;
  INSERT INTO public.aviso_contrato_enviados (telefone_chave, dia)
  VALUES (v_chave, (now() AT TIME ZONE 'America/Sao_Paulo')::date)
  ON CONFLICT (telefone_chave, dia) DO NOTHING
  RETURNING true INTO v_ok;
  IF NOT coalesce(v_ok, false) THEN RETURN jsonb_build_object('enviar', false); END IF;

  BEGIN
    SELECT c.id INTO v_conv FROM public.ju_conversas c
     WHERE public.fn_atrib_tel_chave(c.telefone) = v_chave ORDER BY c.updated_at DESC NULLS LAST LIMIT 1;
    IF v_conv IS NOT NULL THEN
      v_todos := public.fn_ju_contexto_cliente(v_conv) -> 'pacientes';
      IF jsonb_typeof(v_todos) = 'array' THEN
        WITH t AS (
          SELECT initcap(btrim(x ->> 'nome')) AS nome, i,
                 coalesce(x -> 'contrato' ->> 'status', '') <> 'assinado'
                   AND ((CASE WHEN jsonb_typeof(x -> 'proximas_consultas') = 'array'
                              THEN jsonb_array_length(x -> 'proximas_consultas') ELSE 0 END) > 0
                        OR lower(btrim(x ->> 'nome')) = lower(btrim(coalesce(p_paciente_nome, '')))) AS pendente,
                 EXISTS (SELECT 1 FROM public.user_contracts u
                          WHERE u.pessoa_id = (x ->> 'paciente_id')::uuid AND u.ativo
                            AND (u.data_geracao > now() - interval '6 hours'
                                 OR EXISTS (SELECT 1 FROM public.contrato_envios e
                                             WHERE e.contrato_id = u.id AND e.ok
                                               AND e.created_at > now() - interval '6 hours'))) AS recente
            FROM jsonb_array_elements(v_todos) WITH ORDINALITY AS a(x, i)
        ), n AS (
          SELECT t.*, CASE WHEN (SELECT count(*) FROM t t2 WHERE lower(split_part(t2.nome, ' ', 1)) = lower(split_part(t.nome, ' ', 1))) > 1
                           THEN split_part(t.nome, ' ', 1) || ' ' || split_part(t.nome, ' ', 2)
                           ELSE split_part(t.nome, ' ', 1) END AS curto
            FROM t
        )
        SELECT array_agg(curto ORDER BY i) FILTER (WHERE pendente AND NOT recente),
               count(*) FILTER (WHERE pendente AND recente)
          INTO v_nomes, v_recentes FROM n;
      END IF;
    END IF;
  EXCEPTION WHEN others THEN
    v_nomes := NULL; v_recentes := 0;
  END;

  IF coalesce(array_length(v_nomes, 1), 0) = 0 AND v_recentes > 0 THEN
    -- o contrato acabou de chegar pela Assinafy: nada de aviso agora, e o dia fica livre para um aviso depois
    DELETE FROM public.aviso_contrato_enviados
     WHERE telefone_chave = v_chave AND dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    RETURN jsonb_build_object('enviar', false, 'motivo', 'contrato_enviado_ha_pouco');
  END IF;

  IF coalesce(array_length(v_nomes, 1), 0) = 0 THEN
    v_nomes := ARRAY[nullif(initcap(split_part(btrim(coalesce(p_paciente_nome, '')), ' ', 1)), '')];
  END IF;
  IF array_length(v_nomes, 1) > 1 THEN
    v_frase := 'Os contratos de *' || array_to_string(v_nomes[1:array_length(v_nomes, 1) - 1], '*, *')
               || '* e *' || v_nomes[array_length(v_nomes, 1)] || '* ainda não foram assinados.';
  ELSIF v_nomes[1] IS NOT NULL THEN
    v_frase := 'O contrato de *' || v_nomes[1] || '* ainda não foi assinado.';
  END IF;
  RETURN jsonb_build_object('enviar', true, 'frase', v_frase, 'criancas', to_jsonb(v_nomes));
END $function$;
