
-- (23/10/2026, migrations agenda_aviso_ignora_negacao_e_acompanhamento_sem_teste e
-- agenda_aviso_negacao_mesma_oracao) Falso positivo: "Estou olhando as agendas e não ficou agendada a
-- sessão segunda" gerou aviso (com 10h tirado de uma mensagem antiga da família). Agora a mensagem não
-- conta se tiver "não" na mesma oração antes de marcado/agendado/remarcado/marquei/agendei:
--   AND m.conteudo !~* '(^|[^[:alnum:]])n[aã]o([^[:alnum:]][^.!,;\n]{0,30})?(marcad|agendad|remarcad|marquei|agendei)'
-- ("Não se preocupe, ficou marcado sexta 10h" continua valendo: a vírgula corta). Testado 7/7.
-- fn_ju_acompanhar também ignora conversa falsa de teste (55619990000NN).
