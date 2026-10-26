-- Base da Ju: descrição dos serviços com os métodos usados (texto do dono, 26/10/2026) e o encaminhamento
-- para a Bruna Cury nas assimetrias de bebê com mais de 6 meses ou mais complexas.
-- As travas continuam: a Ju explica o serviço em termos gerais, mas não avalia o caso nem diagnostica.

INSERT INTO public.ju_conhecimento (id, categoria, texto, ativo) VALUES
('FISIOTERAPIA_RESPIRATORIA', 'SERVICOS',
 'Fisioterapia respiratória (RTA): a Respira Kids usa técnicas manuais suaves, incluindo o Reequilíbrio Toracoabdominal (RTA), para favorecer a ventilação pulmonar, melhorar a mecânica respiratória e ajudar a mobilizar secreções quando indicado. O atendimento é individualizado, considerando a condição respiratória, a idade e as necessidades de cada criança. Pode fazer parte do cuidado em situações como bronquiolite, bronquite, sibilância, pneumonia, acúmulo de secreção e infecções respiratórias de repetição. A necessidade e a conduta são avaliadas pela fisioterapeuta: a Ju não diagnostica nem diz que a criança precisa de fisioterapia pelos sintomas relatados no WhatsApp.',
 true),
('TORCICOLO', 'SERVICOS',
 'Torcicolo e assimetrias posturais (Método Busquet): a Respira Kids usa técnicas manuais não invasivas, incluindo princípios do Método Busquet, para trabalhar tensões, desalinhamentos e restrições de movimento, buscando melhorar a simetria, a mobilidade e a funcionalidade do corpo. Atende bebês com torcicolo congênito ou preferência persistente por olhar para um lado. O ideal é começar o acompanhamento o mais cedo possível, de preferência nos primeiros 4 meses de vida; crianças mais velhas também podem se beneficiar, dependendo da alteração. A duração e a alta dependem da evolução de cada paciente. A Ju não diagnostica torcicolo pelo WhatsApp. Bebê com mais de 6 meses ou caso mais complexo: veja CONVERSA_BRUNA.',
 true),
('ASSIMETRIA_CRANIANA', 'SERVICOS',
 'Assimetrias cranianas, como plagiocefalia e braquicefalia (Método Busquet): a Respira Kids faz avaliação e acompanhamento com técnicas manuais não invasivas, incluindo princípios do Método Busquet, para trabalhar tensões, desalinhamentos e restrições de movimento, buscando melhorar a simetria, a mobilidade e a funcionalidade. A avaliação considera o formato da cabeça, a mobilidade, o posicionamento e o desenvolvimento do bebê. O ideal é começar o mais cedo possível, de preferência nos primeiros 4 meses de vida; bebês mais velhos também podem se beneficiar, dependendo da alteração. A duração e a alta dependem da evolução de cada paciente. A Ju não classifica a gravidade nem interpreta medidas ou fotos. Bebê com mais de 6 meses ou caso mais complexo: veja CONVERSA_BRUNA.',
 true),
('DESENVOLVIMENTO_MOTOR', 'SERVICOS',
 'Desenvolvimento motor (Conceito Bobath): a Respira Kids usa abordagens de fisioterapia neurofuncional, incluindo o Conceito Bobath, para trabalhar o controle postural, o equilíbrio, a coordenação e a aquisição de habilidades motoras (controle da cabeça, rolar, sentar, engatinhar, ficar em pé, andar). Pode ser indicado para bebês e crianças com dificuldades no desenvolvimento motor, alterações de tônus muscular, dificuldades de movimentação ou condições neurológicas. As atividades são adaptadas à idade e às necessidades da criança, para favorecer movimentos funcionais e a participação dela no dia a dia. A frequência das sessões e a duração do acompanhamento são definidas depois da avaliação individual. A Ju não conclui pelo WhatsApp se existe ou não atraso motor.',
 true),
('CONVERSA_BRUNA', 'ATENDIMENTO',
 'Assimetria craniana, torcicolo ou assimetria postural em bebê com mais de 6 meses, ou caso mais complexo (por exemplo, quando a família conta que, além da assimetria, há dificuldade motora, postura do corpo alterada ou outra condição associada): a recomendação da clínica é uma conversa diretamente com a Bruna Cury antes de seguir, para ela avaliar possíveis compensações posturais e dificuldades motoras associadas e definir os objetivos do tratamento. A Ju explica isso em uma frase, sem avaliar o caso, e chama a equipe (CLINICO) com o resumo do que a família contou, pedindo que a Bruna converse com a família. Nesses casos a Ju não faz a triagem completa nem passa para agendar com outra fisio. Na dúvida sobre a idade, pergunte.',
 true)
ON CONFLICT (id) DO UPDATE SET texto = EXCLUDED.texto, categoria = EXCLUDED.categoria, ativo = true, updated_at = now();

UPDATE public.ju_conhecimento
   SET texto = texto || ' Assimetria ou torcicolo em bebê com mais de 6 meses, ou caso mais complexo, segue CONVERSA_BRUNA em vez desta triagem.',
       updated_at = now()
 WHERE id = 'TRIAGEM_MOTORA' AND texto NOT LIKE '%CONVERSA_BRUNA%';

UPDATE public.ju_conhecimento
   SET texto = 'A Respira Kids é uma clínica de fisioterapia pediátrica em Brasília, especializada no atendimento de recém-nascidos, bebês e crianças. Os principais cuidados são fisioterapia respiratória (RTA), desenvolvimento motor (Conceito Bobath), torcicolo e assimetrias posturais e cranianas, como plagiocefalia e braquicefalia (Método Busquet).',
       updated_at = now()
 WHERE id = 'SERVICOS_GERAIS';
