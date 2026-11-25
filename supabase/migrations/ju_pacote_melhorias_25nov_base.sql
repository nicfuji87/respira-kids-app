-- 25/11/2026 (parte 2 do pacote): base de conhecimento e conversa com a Bruna antes da avaliação motora.
--  7) assimetria craniana e torcicolo (qualquer idade) e caso motor complexo: a Ju faz a triagem curta, passa o
--     valor e manda a FICHA para a Bruna pelo recado (resumo começando com [AVALIACAO]); a Bruna decide quem
--     atende (ela, Beatriz ou Flávia), sem isso ser dito à família. Alerta ⏰ do recado vale se ela não responder.
--  8) triagem motora em 2 rodadas, uma pergunta por vez, valor logo depois do motivo e da idade;
--     "para eu agendar aqui no sistema" saiu (a Ju não fala como se fosse a recepção).
--  9) osteopatia; respiração bucal sai das áreas atendidas (decisão do dono em 25/11).

-- ── base ──
UPDATE public.ju_conhecimento SET texto =
'O QUE A CLÍNICA ATENDE: crianças até 12 anos, em quatro áreas: fisioterapia respiratória, desenvolvimento motor, assimetria craniana (plagiocefalia, braquicefalia) e torcicolo congênito. Também atende prematuros e pós-cirúrgico (por exemplo, cirurgia cardíaca ou torácica).
O QUE NÃO ATENDE: fisioterapia ortopédica ou pós-fratura (braço ou perna quebrada, gesso, entorse, joelho, coluna), respiração bucal (respiração pela boca) e pacientes com mais de 12 anos. Nesses casos, explique com gentileza logo na primeira resposta que esse tipo de atendimento não faz parte do que a clínica oferece, diga em uma frase o que a clínica atende e não faça perguntas de pré-atendimento nem ofereça horário. Se a família insistir ou o caso misturar algo que a clínica atende, chame a secretaria.',
       updated_at = now()
 WHERE id = 'ESCOPO_ATENDIMENTO';

INSERT INTO public.ju_conhecimento (id, categoria, texto, ativo, updated_at)
VALUES ('OSTEOPATIA', 'SERVICOS',
'Osteopatia: as fisioterapeutas da Respira Kids não são osteopatas, mas tratam o desenvolvimento motor, torcicolo e assimetrias com técnicas manuais da fisioterapia. Se a família perguntar se a fisio é osteopata, diga isso em uma frase e siga o atendimento normalmente.',
        true, now())
ON CONFLICT (id) DO UPDATE SET texto = excluded.texto, categoria = excluded.categoria, ativo = true, updated_at = now();

UPDATE public.ju_conhecimento SET texto =
'Triagem de contato novo para fisioterapia motora (desenvolvimento motor, estimulação precoce, tensões). No máximo duas rodadas, com uma pergunta por mensagem e só o que ainda não foi dito:
1) a idade e o que está acontecendo. Logo que souber os dois, já diga o valor da avaliação motora (AVALIACAO_PRIMEIRA_SESSAO e servicos);
2) quem indicou ou quem é o pediatra.
Não pergunte mais nada: acompanhamento com outros profissionais e amamentação a equipe vê depois. Se a família responder só parte, não repita a pergunta; siga em frente. Se disser que não tem indicação, que não sabe o pediatra ou que é atendida pelo SUS, aceite e siga. Nunca condicione a conversa a mandar foto de pedido médico.
Assimetria craniana (plagiocefalia, braquicefalia) e torcicolo, em qualquer idade, ou caso motor mais complexo seguem CONVERSA_BRUNA.',
       updated_at = now()
 WHERE id = 'TRIAGEM_MOTORA';

UPDATE public.ju_conhecimento SET texto =
'Assimetria craniana (plagiocefalia, braquicefalia), torcicolo ou assimetria postural, em qualquer idade, ou caso motor mais complexo (além da queixa, dificuldade motora, postura alterada ou outra condição associada): antes da avaliação, a Bruna Cury, fisioterapeuta responsável da clínica, conversa com a família. A Ju faz só a triagem curta (idade, o que está acontecendo, quem indicou ou o pediatra, uma pergunta por mensagem), passa o valor da avaliação motora e então usa recado_fisio com tipo "Bruna" e o resumo começando com "[AVALIACAO]" seguido da ficha do caso em poucas linhas (idade, queixa nas palavras da família, quem indicou, preferência de dia ou horário se disseram). Responda à família só o que a ferramenta mandar. Nunca diga quem vai atender, nem que a Bruna decide a profissional. Na dúvida sobre a idade, pergunte.',
       updated_at = now()
 WHERE id = 'CONVERSA_BRUNA';

UPDATE public.ju_conhecimento SET texto = replace(texto,
  'Bebê com mais de 6 meses ou caso mais complexo: veja CONVERSA_BRUNA.',
  'Para agendar a avaliação, siga CONVERSA_BRUNA (conversa com a Bruna Cury antes).'), updated_at = now()
 WHERE id = 'ASSIMETRIA_CRANIANA';

-- ── recado com [AVALIACAO] vira ficha para a Bruna ──
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_recado_criar(jsonb)'::regprocedure);
  n := replace(d, 'v_ant ju_recados; v_num text;', 'v_ant ju_recados; v_num text; v_aval boolean := false; v_link text;');
  n := replace(n, $a$  ctx := fn_ju_contexto_cliente(c.id);
$a$, $a$  -- 25/11/2026: ficha para a Bruna conversar antes da avaliação motora
  IF v_txt ~* '^\s*\[AVALIACAO\]' THEN
    v_aval := true;
    v_txt := btrim(regexp_replace(v_txt, '^\s*\[AVALIACAO\]\s*', '', 'i'));
  END IF;
  ctx := fn_ju_contexto_cliente(c.id);
$a$);
  n := replace(n, $a$  v_fila := v_agora::time < time '07:00'$a$, $a$  IF v_aval THEN
    v_link := regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g');
    v_msg := '🩺 *Conversa antes da avaliação motora*' || E'\n'
          || coalesce(v_familia, 'Família') || coalesce(' · criança: ' || v_crianca, '') || CASE WHEN v_tel <> '' THEN ' · ' || v_tel ELSE '' END
          || E'\n\n' || v_txt
          || CASE WHEN length(v_link) >= 10 THEN E'\n\nFalar com a família: https://wa.me/' || v_link ELSE '' END
          || E'\n\nSe preferir que eu passe a mensagem, responda esta com @ju e o que dizer (ou "@ju agendar" com o dia, a hora e a fisio).';
  END IF;
  v_fila := v_agora::time < time '07:00'$a$);
  n := replace(n, $a$  RETURN jsonb_build_object('ok', true, 'recado_id', v_id, 'resposta',
    'Recado enviado$a$, $a$  IF v_aval THEN
    RETURN jsonb_build_object('ok', true, 'recado_id', v_id, 'resposta',
      'Ficha enviada para a Bruna Cury' || CASE WHEN v_fila THEN ' (ela recebe às 7h)' ELSE '' END
      || '. Diga à família, com suas palavras e em uma frase, que a Bruna Cury, fisioterapeuta responsável da clínica, vai conversar com ela por aqui antes de marcar a avaliação. Não diga quem vai atender, não fale de prazo e não ofereça horário.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'recado_id', v_id, 'resposta',
    'Recado enviado$a$);
  IF n = d OR strpos(n, 'v_aval := true') = 0 OR strpos(n, 'Conversa antes da avaliação') = 0
     OR strpos(n, 'Ficha enviada para a Bruna') = 0 OR strpos(n, 'v_aval boolean') = 0 THEN
    RAISE EXCEPTION 'recado_criar: trecho não encontrado';
  END IF;
  EXECUTE n;

  -- a Ju não fala como se fosse a recepção
  d := pg_get_functiondef('public.fn_ju_escolha_aplicar(bigint,jsonb)'::regprocedure);
  n := replace(d, 'Preciso só que você faça o cadastro para eu agendar aqui no sistema: ',
                  'Pra confirmar o horário, falta só o cadastro da criança: ');
  IF n = d THEN RAISE EXCEPTION 'escolha_aplicar: trecho não encontrado'; END IF;
  EXECUTE n;
END $$;

-- resposta da Bruna citando a ficha (🩺) segue o caminho do recado, não o do aviso da fisio
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_recado_rotear(bigint,bigint,text,text)'::regprocedure);
  n := replace(d, $a$!~ '^\s*(📩|➕)'$a$, $a$!~ '^\s*(📩|➕|🩺)'$a$);
  IF n = d THEN RAISE EXCEPTION 'rotear: trecho não encontrado'; END IF;
  EXECUTE n;
END $$;
