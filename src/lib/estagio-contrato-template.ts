// AI dev note: Template fixo do Termo de Compromisso de Estágio (Lei 11.788/2008).
// O front preenche as variáveis e grava o resultado em estagio_contratos.conteudo_final;
// a edge function generate-estagio-contract-pdf renderiza esse texto em PDF
// (mesmo renderizador markdown básico do contrato de paciente: **negrito**,
// linha inteira **...** = seção, `---` = separador, `•` = bullet).

export interface EstagioContratoVars {
  // Estagiário (da candidatura)
  estagiarioNome: string;
  estagiarioCpf: string;
  estagiarioRg?: string;
  estagiarioMatricula?: string;
  estagiarioEndereco: string;
  estagiarioEmail?: string;
  estagiarioTelefone?: string;
  curso: string;
  semestre: string;
  responsavelLegal?: string; // se menor de 18

  // Parte Concedente / Clínica (pessoa_empresas + defaults)
  concedenteRazaoSocial: string;
  concedenteCnpj: string;
  concedenteEndereco: string;
  representanteLegal: string;
  supervisorNome: string;
  supervisorCrefito: string;
  comarca: string;

  // Preenchidos na aprovação
  obrigatorio: 'obrigatório' | 'não obrigatório';
  iesNome: string;
  iesCnpj?: string;
  professorOrientador: string;
  cargaHorariaDiaria: string;
  cargaHorariaSemanal: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  bolsaValor: string;
  auxilioTransporte: string;
  avisoRescisaoDias: string;
  cidadeAssinatura: string;
  dataAssinatura: string;
}

const TEMPLATE = `**TERMO DE COMPROMISSO DE ESTÁGIO**

**Estágio em Fisioterapia – Clínica de Fisioterapia Respiratória Pediátrica**

Pelo presente instrumento, e nos termos da Lei nº 11.788, de 25 de setembro de 2008 ("Lei do Estágio"), e, no que couber, da Resolução COFFITO nº 432/2013, as partes abaixo identificadas firmam o presente Termo de Compromisso de Estágio ("Termo"), mediante as cláusulas e condições seguintes:

**1. Identificação das Partes**

**Parte Concedente (Clínica):** {{concedenteRazaoSocial}}, CNPJ nº {{concedenteCnpj}}, com sede em {{concedenteEndereco}}.

**Representante legal da concedente:** {{representanteLegal}}

**Supervisor(a) de estágio (fisioterapeuta responsável):** {{supervisorNome}}, CREFITO nº {{supervisorCrefito}}

**Instituição de Ensino:** {{iesNome}}{{iesCnpjTexto}}

**Professor(a) orientador(a) da IES:** {{professorOrientador}}

**Estagiário(a):** {{estagiarioNome}}, portador(a) do CPF nº {{estagiarioCpf}}{{estagiarioRgTexto}}{{estagiarioMatriculaTexto}}

**Curso / semestre em curso:** {{curso}} – {{semestre}}

**Endereço e contato do(a) estagiário(a):** {{estagiarioEndereco}}{{estagiarioContatoTexto}}

**Responsável legal (se menor de 18 anos):** {{responsavelLegalTexto}}

---

**Cláusula 1ª – Objeto**

O presente Termo tem por objeto a realização de estágio {{obrigatorio}} pelo(a) estagiário(a) acima identificado(a), como ato educativo escolar supervisionado, na área de Fisioterapia Respiratória Pediátrica, visando à aprendizagem de competências próprias da atividade profissional e à contextualização curricular, nos termos do art. 1º da Lei nº 11.788/2008.

**Cláusula 2ª – Plano de Atividades**

Sob supervisão direta e permanente do fisioterapeuta responsável, e sempre compatíveis com o currículo do curso de Fisioterapia, o(a) estagiário(a) desenvolverá as seguintes atividades:

•  Acompanhamento e auxílio na avaliação e no atendimento fisioterapêutico respiratório de pacientes pediátricos;
•  Auxílio no posicionamento e na contenção segura do bebê/criança durante procedimentos terapêuticos, incluindo aspiração de vias aéreas, sempre sob supervisão direta e sem execução autônoma do procedimento;
•  Participação em práticas de biossegurança e controle de infecção, incluindo a higienização e organização de materiais, equipamentos e instrumentais utilizados diretamente no atendimento clínico;
•  Auxílio na orientação de pais/responsáveis quanto a cuidados respiratórios domiciliares, sob supervisão;
•  Observação e registro da evolução clínica dos pacientes, sob supervisão e validação do supervisor;
•  Participação em reuniões clínicas, discussões de caso e demais atividades de ensino-aprendizagem promovidas pela concedente.

**Parágrafo único:** Não integram o presente Plano de Atividades tarefas de natureza puramente administrativa, doméstica ou de limpeza geral sem relação com o aprendizado técnico-profissional, de modo a preservar o caráter pedagógico do estágio e evitar a caracterização de desvio de função, nos termos do art. 3º, III, da Lei nº 11.788/2008.

**Cláusula 3ª – Supervisão**

O(A) estagiário(a) terá supervisão direta do fisioterapeuta indicado na Cláusula 1ª, com formação na área de conhecimento desenvolvida no curso, respeitando-se o limite máximo de estagiários por supervisor previsto na Resolução COFFITO nº 432/2013. O acompanhamento pedagógico ficará a cargo do professor orientador da instituição de ensino.

**Cláusula 4ª – Jornada e Vigência**

O estágio terá carga horária de {{cargaHorariaDiaria}} horas diárias e {{cargaHorariaSemanal}} horas semanais, respeitado o limite legal de 6 (seis) horas diárias e 30 (trinta) horas semanais, vedada a compensação de jornada ou realização de horas extras.

O presente Termo vigorará de {{vigenciaInicio}} a {{vigenciaFim}}, podendo ser renovado mediante aditivo, respeitado o prazo máximo de 2 (dois) anos na mesma parte concedente, salvo estagiário(a) com deficiência (art. 11 da Lei nº 11.788/2008).

**Cláusula 5ª – Bolsa-Auxílio e Benefícios**

A parte concedente pagará ao(à) estagiário(a) bolsa-auxílio no valor de R$ {{bolsaValor}} mensais, bem como auxílio-transporte no valor de R$ {{auxilioTransporte}}, sendo tais benefícios compulsórios em caso de estágio não obrigatório (art. 12 da Lei nº 11.788/2008), sem que isso configure vínculo empregatício.

**Cláusula 6ª – Seguro contra Acidentes Pessoais**

A parte concedente contratará, em favor do(a) estagiário(a), seguro contra acidentes pessoais, com apólice compatível com valores de mercado, conforme art. 9º, IV, da Lei nº 11.788/2008.

**Cláusula 7ª – Recesso**

Ao(à) estagiário(a) fica assegurado recesso de 30 (trinta) dias após cada 12 (doze) meses de estágio, preferencialmente coincidente com as férias escolares, remunerado quando houver bolsa-auxílio, e proporcional quando o estágio for inferior a 12 meses.

**Cláusula 8ª – Ausência de Vínculo Empregatício**

Nos termos do art. 3º da Lei nº 11.788/2008, o presente estágio não gera vínculo empregatício de qualquer natureza, desde que observados os requisitos legais e as atividades permaneçam compatíveis com o previsto no Plano de Atividades constante da Cláusula 2ª.

**Cláusula 9ª – Obrigações da Parte Concedente**

•  Oferecer instalações que proporcionem condições de aprendizagem adequadas;
•  Indicar supervisor com formação na área do curso do estagiário;
•  Contratar o seguro previsto na Cláusula 6ª;
•  Enviar à instituição de ensino relatório de atividades a cada 6 (seis) meses, com ciência do(a) estagiário(a);
•  Entregar termo de realização do estágio ao final, com resumo das atividades desenvolvidas.

**Cláusula 10ª – Obrigações do(a) Estagiário(a)**

•  Cumprir com pontualidade e assiduidade a carga horária estabelecida;
•  Observar as normas técnicas, éticas e de biossegurança da clínica e do CREFITO/COFFITO;
•  Manter sigilo sobre informações de pacientes (LGPD e sigilo profissional);
•  Comunicar à instituição de ensino e à concedente qualquer irregularidade observada na execução do estágio.

**Cláusula 11ª – Rescisão**

O presente Termo poderá ser rescindido a qualquer tempo, unilateralmente, mediante comunicação por escrito com {{avisoRescisaoDias}} dias de antecedência, ou automaticamente ao término do curso, trancamento de matrícula, abandono, conclusão ou interrupção do curso pelo(a) estagiário(a).

**Cláusula 12ª – Foro**

Fica eleito o foro da Comarca de {{comarca}} para dirimir quaisquer dúvidas oriundas do presente Termo.

E, por estarem justos e de acordo, as partes assinam o presente Termo.

{{cidadeAssinatura}}, {{dataAssinatura}}.`;

/** Substitui as variáveis {{chave}} pelo valor correspondente (vazio se ausente). */
export function fillEstagioTemplate(vars: EstagioContratoVars): string {
  const iesCnpjTexto = vars.iesCnpj ? `, CNPJ nº ${vars.iesCnpj}` : '';
  const estagiarioRgTexto = vars.estagiarioRg
    ? `, RG nº ${vars.estagiarioRg}`
    : '';
  const estagiarioMatriculaTexto = vars.estagiarioMatricula
    ? `, matrícula nº ${vars.estagiarioMatricula}`
    : '';
  const contatoParts = [vars.estagiarioEmail, vars.estagiarioTelefone].filter(
    Boolean
  );
  const estagiarioContatoTexto =
    contatoParts.length > 0 ? ` — ${contatoParts.join(' · ')}` : '';
  const responsavelLegalTexto = vars.responsavelLegal || 'Não se aplica';

  const dict: Record<string, string> = {
    ...(vars as unknown as Record<string, string>),
    iesCnpjTexto,
    estagiarioRgTexto,
    estagiarioMatriculaTexto,
    estagiarioContatoTexto,
    responsavelLegalTexto,
  };

  return TEMPLATE.replace(/\{\{(\w+)\}\}/g, (_m, key: string) =>
    dict[key] != null ? String(dict[key]) : ''
  );
}
