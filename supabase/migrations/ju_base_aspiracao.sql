-- Base da Ju: aspiração de vias aéreas, invasiva e não invasiva (texto do dono, 26/10/2026).
-- Sinal de gravidade continua na regra GRAVIDADE do prompt (alerta_clinico com o texto de segurança aprovado).

INSERT INTO public.ju_conhecimento (id, categoria, texto, ativo) VALUES
('ASPIRACAO', 'SERVICOS',
 'Aspiração de vias aéreas: a Respira Kids faz os dois tipos, escolhidos conforme a avaliação e as necessidades de cada criança. Não invasiva (Método Proetz): usa um dispositivo de sucção, sem introduzir sonda nas vias respiratórias; ajuda a remover secreções nasais e a desobstruir as vias aéreas superiores, podendo aliviar a congestão nasal. Invasiva (com sonda): usa uma sonda flexível para remover secreções que a criança tem dificuldade de eliminar sozinha; é feita por profissional habilitado, quando há indicação clínica, pesando benefícios e riscos, e pode causar desconforto, por isso a equipe avalia se é necessária. Quem decide se a criança precisa de aspiração e qual técnica usar é a fisioterapeuta, depois da avaliação: nem toda criança com secreção ou nariz entupido precisa ser aspirada. A Ju não garante que haverá aspiração na sessão e não apresenta a aspiração como tratamento obrigatório para bronquiolite, resfriado ou outra doença respiratória. O valor é o de "Aspiração de Secreções" da tabela de serviços. Dificuldade respiratória importante, lábios arroxeados, pausas na respiração ou criança prostrada seguem a regra de GRAVIDADE: atendimento médico de urgência, sem esperar agendamento na clínica.',
 true)
ON CONFLICT (id) DO UPDATE SET texto = EXCLUDED.texto, categoria = EXCLUDED.categoria, ativo = true, updated_at = now();

UPDATE public.ju_conhecimento
   SET texto = replace(texto, 'Os principais cuidados são fisioterapia respiratória (RTA),',
                              'Os principais cuidados são fisioterapia respiratória (RTA) e aspiração de vias aéreas,'),
       updated_at = now()
 WHERE id = 'SERVICOS_GERAIS' AND texto NOT LIKE '%aspiração%';
