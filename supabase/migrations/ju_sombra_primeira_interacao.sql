-- Ju: na sombra, não se apresentar de novo a cada turno.
-- AI dev note (21/10/2026): na sombra a Ju nunca grava mensagem JU, então
-- primeira_interacao ficava true em todo turno e ela se apresentava 4x na mesma
-- conversa (leitura da sombra de 21/10). Agora, SÓ quando o turno atual é
-- sombra, uma resposta simulada para a família (ju_sombra.destino='familia')
-- conta como fala da Ju. Fora da sombra (ligada) a regra é a de antes: quem só
-- viu respostas simuladas nunca recebeu a apresentação de verdade.
DO $do$
DECLARE d text;
  v_velho text := $v$'primeira_interacao', NOT EXISTS (SELECT 1 FROM public.ju_mensagens j WHERE j.conversa_id = c.id AND j.origem = 'JU')$v$;
  v_novo text := $v$'primeira_interacao', NOT EXISTS (SELECT 1 FROM public.ju_mensagens j WHERE j.conversa_id = c.id AND j.origem = 'JU')
                         AND NOT (public.fn_ju_sombra(c.telefone)
                                  AND EXISTS (SELECT 1 FROM public.ju_sombra js
                                               WHERE js.conversa_id = c.id AND js.destino = 'familia'))$v$;
BEGIN
  d := pg_get_functiondef('public.fn_ju_turno(bigint, bigint)'::regprocedure);
  IF (length(d) - length(replace(d, v_velho, ''))) / length(v_velho) <> 1 THEN
    RAISE EXCEPTION 'fn_ju_turno: trecho de primeira_interacao não encontrado';
  END IF;
  EXECUTE replace(d, v_velho, v_novo);
END
$do$;
