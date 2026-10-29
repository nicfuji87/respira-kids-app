-- 29/10/2026 (pedido do dono): o aviso de contrato pendente dizia só o primeiro nome da criança que
-- disparou ("O contrato de *Maria*"), e a família da Dylliany tem duas Marias. Com a trava de 1 aviso por
-- dia, a segunda criança nunca aparecia. Agora a função devolve a frase com TODAS as crianças da família
-- com sessão marcada e contrato não assinado; irmãos com o mesmo primeiro nome saem com o segundo nome.
-- O n8n (Agendamento "Paciente sem contrato", Lembrete "Envia Notificação"/"Envia Notificação1") usa `frase`.
DROP FUNCTION IF EXISTS public.fn_aviso_contrato_reservar(text);

CREATE OR REPLACE FUNCTION public.fn_aviso_contrato_reservar(p_telefone text, p_paciente_nome text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE
  v_chave text := public.fn_atrib_tel_chave(p_telefone);
  v_ok boolean; v_conv bigint; v_todos jsonb; v_nomes text[]; v_frase text;
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
          SELECT btrim(x ->> 'nome') AS nome, i,
                 coalesce(x -> 'contrato' ->> 'status', '') <> 'assinado'
                   AND ((CASE WHEN jsonb_typeof(x -> 'proximas_consultas') = 'array'
                              THEN jsonb_array_length(x -> 'proximas_consultas') ELSE 0 END) > 0
                        OR lower(btrim(x ->> 'nome')) = lower(btrim(coalesce(p_paciente_nome, '')))) AS pendente
            FROM jsonb_array_elements(v_todos) WITH ORDINALITY AS a(x, i)
        ), n AS (
          SELECT t.*, CASE WHEN (SELECT count(*) FROM t t2 WHERE lower(split_part(t2.nome, ' ', 1)) = lower(split_part(t.nome, ' ', 1))) > 1
                           THEN split_part(t.nome, ' ', 1) || ' ' || split_part(t.nome, ' ', 2)
                           ELSE split_part(t.nome, ' ', 1) END AS curto
            FROM t
        )
        SELECT array_agg(curto ORDER BY i) INTO v_nomes FROM n WHERE pendente;
      END IF;
    END IF;
  EXCEPTION WHEN others THEN
    v_nomes := NULL;
  END;

  IF coalesce(array_length(v_nomes, 1), 0) = 0 THEN
    v_nomes := ARRAY[nullif(split_part(btrim(coalesce(p_paciente_nome, '')), ' ', 1), '')];
  END IF;
  IF array_length(v_nomes, 1) > 1 THEN
    v_frase := 'Os contratos de *' || array_to_string(v_nomes[1:array_length(v_nomes, 1) - 1], '*, *')
               || '* e *' || v_nomes[array_length(v_nomes, 1)] || '* ainda não foram assinados.';
  ELSIF v_nomes[1] IS NOT NULL THEN
    v_frase := 'O contrato de *' || v_nomes[1] || '* ainda não foi assinado.';
  END IF;
  RETURN jsonb_build_object('enviar', true, 'frase', v_frase, 'criancas', to_jsonb(v_nomes));
END $f$;
REVOKE ALL ON FUNCTION public.fn_aviso_contrato_reservar(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_aviso_contrato_reservar(text, text) TO service_role;

INSERT INTO public.ju_assinaturas_automacao (padrao, descricao, ativo)
SELECT 'os contratos de .{1,200} ainda n[aã]o foram assinados', 'aviso de contrato pendente com várias crianças (29/10/2026)', true
 WHERE NOT EXISTS (SELECT 1 FROM public.ju_assinaturas_automacao WHERE padrao = 'os contratos de .{1,200} ainda n[aã]o foram assinados');
