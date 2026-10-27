-- Resumo "Esperando resposta" vê a situação do contrato de cada criança (27/10/2026, pedido do dono).
-- Caso Jéssica/Bernardo: a família pediu o link do contrato, a Assinafy reenviou às 8h28 (de um número
-- próprio, então nada aparece na conversa) e o resumo seguiu dizendo "aguarda o link".
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_esperando_resposta(integer)'::regprocedure); n text;
BEGIN
  IF d LIKE '%''contrato''%' THEN RETURN; END IF;
  n := replace(d, $a$'proximas_consultas', x -> 'proximas_consultas'))$a$,
                  $a$'proximas_consultas', x -> 'proximas_consultas',
                                 'contrato', CASE WHEN jsonb_typeof(x -> 'contrato') = 'object' THEN jsonb_strip_nulls(jsonb_build_object(
                                     'status', x -> 'contrato' ->> 'status',
                                     'ultimo_envio', x -> 'contrato' -> 'ultimo_envio',
                                     'reenviado_pela_ju_em', x -> 'contrato' -> 'reenviado_pela_ju_em')) END))$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_esperando_resposta: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;
