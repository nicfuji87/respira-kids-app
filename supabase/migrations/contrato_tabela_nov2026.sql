-- AI dev note: 04/11/2026 (decisões do dono): tabela de valores do contrato padrão revista.
-- Valores padrão de tipo_servicos (algumas fisios têm valor próprio, que pode ser maior), domiciliar, aspiração
-- e laserterapia entram, emergencial após 19h continua, motora = "desenvolvimento, mobilidade, torcicolo e
-- assimetria", reajuste a qualquer tempo com 30 dias de aviso. Corrige também a frase invertida do
-- atendimento externo (Cláusula 2a) e o parágrafo sexto grudado no quinto. Vale para contratos gerados
-- daqui para frente (user_contracts guarda o texto final de cada contrato).
-- Também renomeia a descrição dos serviços de motora (mensagens, fatura e nota).

DO $do$
DECLARE
  t text := (SELECT conteudo_template FROM public.contract_templates WHERE id = '555e28ea-7c83-41b7-826f-00d843bee79a');
  v_ini int; v_fim int;
  v_antes_fim text := 'implicam anuência expressa aos valores reajustados.';
  v_novo text;
BEGIN
  v_ini := position('**Cláusula 6a.**' IN t);
  v_fim := position(v_antes_fim IN t);
  IF v_ini = 0 OR v_fim = 0 OR v_fim < v_ini
     OR position('A **CONTRATANTE** deve informar às **CONTRATADAS** o valor da sessão com antecedência para os atendimentos externos.' IN t) = 0
     OR position('em razão das faltas ocorridas.**Parágrafo sexto.**' IN t) = 0 THEN
    RAISE EXCEPTION 'contrato: trecho não encontrado';
  END IF;

  v_novo := $c$**Cláusula 6a.** A **CONTRATANTE** pagará às **CONTRATADAS** os valores da tabela a seguir, que são os valores padrão da clínica. Algumas fisioterapeutas têm valor próprio, que pode ser superior aos apresentados na tabela a seguir, informado à **CONTRATANTE** antes do agendamento.

**TABELA DE VALORES:**

*Fisioterapia respiratória*

• **Sessão (dia útil)** - R$ 260,00
• **Sessão (fim de semana)** - R$ 280,00
• **Atendimento emergencial (após 19h / sáb e dom após 14h)** - R$ 300,00
• **Sessão domiciliar (dia útil)** - R$ 300,00
• **Sessão domiciliar (fim de semana)** - R$ 340,00
• **Aspiração de secreções das vias respiratórias** - R$ 180,00

*Fisioterapia motora (desenvolvimento, mobilidade, torcicolo e assimetria)*

• **Avaliação** - R$ 370,00
• **Avaliação domiciliar** - R$ 400,00
• **Sessão (dia útil)** - R$ 320,00
• **Sessão (fim de semana)** - R$ 350,00
• **Sessão domiciliar (dia útil)** - R$ 370,00

*Outros*

• **Laserterapia** - R$ 150,00

**Valores vigentes em novembro/2026.** Feriados têm valor próprio, informado antes do agendamento. O atendimento domiciliar é realizado nas regiões atendidas pelas **CONTRATADAS**.

**Parágrafo primeiro.** Os valores da tabela acima referem-se a pagamentos via PIX, feitos pelo link de pagamento enviado. Nos pagamentos com cartão de crédito ou débito incidirá acréscimo correspondente às taxas da operadora/adquirente vigentes na data da cobrança, informado previamente à **CONTRATANTE**.

**Parágrafo segundo.** Os valores poderão ser reajustados a qualquer tempo, mediante aviso prévio de 30 (trinta) dias à **CONTRATANTE**, enviado pelo WhatsApp ou e-mail cadastrados. A **CONTRATANTE** poderá optar pela descontinuidade do tratamento, mediante aviso prévio por escrito com antecedência mínima de 6 (seis) horas da sessão. A continuidade das sessões após o fim do prazo do aviso implica concordância com os novos valores.$c$;

  t := left(t, v_ini - 1) || v_novo || substr(t, v_fim + length(v_antes_fim));
  t := replace(t, 'A **CONTRATANTE** deve informar às **CONTRATADAS** o valor da sessão com antecedência para os atendimentos externos.',
                  'Nesses casos, valem os valores de atendimento domiciliar da Cláusula 6a.');
  t := replace(t, 'em razão das faltas ocorridas.**Parágrafo sexto.**', E'em razão das faltas ocorridas.\n\n**Parágrafo sexto.**');

  UPDATE public.contract_templates SET conteudo_template = t, versao = coalesce(versao, 1) + 1, updated_at = now()
   WHERE id = '555e28ea-7c83-41b7-826f-00d843bee79a';
END $do$;

UPDATE public.tipo_servicos
   SET descricao = 'Avaliação inicial de fisioterapia motora (desenvolvimento, mobilidade, torcicolo e assimetria)', updated_at = now()
 WHERE id IN ('2865a746-ee32-46e1-8581-46232e2bb5c1', '5fff67f0-fe67-4ce0-a801-750d27fdeeb9');
UPDATE public.tipo_servicos
   SET descricao = 'Sessão de fisioterapia motora (desenvolvimento, mobilidade, torcicolo e assimetria)', updated_at = now()
 WHERE id IN ('4ce371bb-9634-4c41-9d30-b14c38420b24', '8736126b-db31-4abc-b675-1d4b5f26f434',
              '6cc2891f-107f-4a92-ac94-e1fcac8cde51', 'c62ec2fa-6b33-4509-9789-5049c1a1a1a0');
