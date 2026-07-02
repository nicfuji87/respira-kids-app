// AI dev note: API para gerenciamento de contratos
// Funções para buscar templates, gerar contratos e registrar aceites

import { supabase } from './supabase';
import { formatCPF } from './profile';

// Interfaces conforme plano aprovado
export interface ContractVariables {
  // AI dev note: Novas variáveis - Responsável Legal (SEMPRE é o contratante)
  responsavelLegalNome: string;
  responsavelLegalCpf: string;
  responsavelLegalTelefone: string;
  responsavelLegalEmail: string;
  responsavelLegalFinanceiro: string; // "e Financeiro" ou vazio

  // AI dev note: Cláusula condicional para responsável financeiro diferente
  clausulaResponsavelFinanceiro: string; // Parágrafo completo ou vazio

  // AI dev note: Variáveis antigas mantidas para compatibilidade (podem ser removidas futuramente)
  contratante: string;
  cpf: string;
  telefone: string;
  email: string;

  endereco_completo: string; // AI dev note: Endereço formatado corretamente sem vírgulas duplas
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  paciente: string;
  dnPac: string; // dd/mm/aaaa
  cpfPac?: string;
  hoje: string; // dd/mm/aaaa
  autorizo: 'autorizo' | 'não autorizo';
  fimTerapeutico: string;
  vinculoNome: 'poderão' | 'não poderão';
}

// AI dev note: Autorizações de uso de imagem/nome captadas no cadastro (3 perguntas
// independentes Sim/Não). Cada uma vira uma cláusula própria no contrato.
export interface UsoImagemAutorizacoes {
  usoCientifico: boolean;
  usoRedesSociais: boolean;
  usoNome: boolean;
}

export interface UsoImagemVars {
  autorizo: 'autorizo' | 'não autorizo';
  fimTerapeutico: string;
  vinculoNome: 'poderão' | 'não poderão';
}

// AI dev note: Monta as variáveis da Cláusula 13a (DO USO DE NOME E IMAGEM).
// IMPORTANTE: uso científico e uso em redes sociais são autorizações INDEPENDENTES.
// Cada resposta (Sim/Não) do cadastro gera sua própria frase, sem misturar as duas.
//
// Bug histórico (corrigido aqui): a lógica anterior negava "divulgações científicas"
// junto com as redes sociais quando o responsável autorizava só o científico — ou
// seja, o contrato dizia que ele NÃO autorizava o científico que ele HAVIA autorizado.
// Pior: quando ambas eram "Não", o texto gerado era o de autorização TOTAL. Agora
// cada caso é tratado separadamente e sem contradição.
export function buildUsoImagemVars(auth: UsoImagemAutorizacoes): UsoImagemVars {
  const FINS_TERAPEUTICOS =
    'fins terapêuticos, com o objetivo de aprimorar os procedimentos técnicos dos aplicadores e a evolução clínica do paciente, sejam elas impressas ou digitais';
  const DIVULGACAO_CIENTIFICA =
    'divulgações científicas e jornalísticas, produções fotográficas, materiais impressos, publicações internas e externas, palestras e materiais EAD, acervos de biblioteca e periódicos';
  const DIVULGACAO_REDES =
    'divulgações publicitárias, programas televisivos, redes sociais e demais materiais de divulgação da clínica';
  const SEM_LUCRO = ', sempre sem fins lucrativos';

  const c = auth.usoCientifico;
  const r = auth.usoRedesSociais;

  let autorizo: 'autorizo' | 'não autorizo' = 'autorizo';
  let fimTerapeutico: string;

  if (c && r) {
    // Autoriza tudo: uso terapêutico/científico + redes sociais.
    fimTerapeutico = `${FINS_TERAPEUTICOS}, bem como em ${DIVULGACAO_CIENTIFICA}, ${DIVULGACAO_REDES}${SEM_LUCRO}`;
  } else if (c && !r) {
    // Autoriza científico, NÃO autoriza redes sociais (caso reportado pelo cliente).
    fimTerapeutico = `${FINS_TERAPEUTICOS}, bem como em ${DIVULGACAO_CIENTIFICA}${SEM_LUCRO}. A CONTRATANTE não autoriza, contudo, o uso e a veiculação das imagens em ${DIVULGACAO_REDES}`;
  } else if (!c && r) {
    // Autoriza redes sociais, NÃO autoriza uso científico/terapêutico.
    fimTerapeutico = `${DIVULGACAO_REDES}${SEM_LUCRO}. A CONTRATANTE não autoriza, contudo, o uso e a veiculação das imagens para ${FINS_TERAPEUTICOS}, tampouco em ${DIVULGACAO_CIENTIFICA}`;
  } else {
    // Não autoriza nenhum uso de imagem.
    autorizo = 'não autorizo';
    fimTerapeutico = 'quaisquer finalidades';
  }

  return {
    autorizo,
    fimTerapeutico,
    vinculoNome: auth.usoNome ? 'poderão' : 'não poderão',
  };
}

export interface ContractTemplate {
  id: string;
  nome: string;
  descricao: string | null;
  conteudo_template: string;
  variaveis_disponiveis: Array<{ nome: string; descricao: string }>;
  versao: number;
  ativo: boolean;
}

export interface UserContract {
  id: string;
  contract_template_id: string;
  pessoa_id: string;
  agendamento_id: string | null;
  nome_contrato: string;
  conteudo_final: string;
  variaveis_utilizadas: Record<string, string>;
  arquivo_url: string | null;
  status_contrato: 'rascunho' | 'gerado' | 'assinado' | 'cancelado';
  data_geracao: string | null;
  data_assinatura: string | null;
  assinatura_digital_id: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Buscar template ativo de contrato
 * @returns Template de contrato ativo
 */
export async function fetchContractTemplate(): Promise<ContractTemplate> {
  const { data, error } = await supabase
    .from('contract_templates')
    .select('*')
    .eq('ativo', true)
    .order('versao', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error('❌ Erro ao buscar template de contrato:', error);
    throw new Error('Não foi possível carregar o template de contrato');
  }

  if (!data) {
    throw new Error('Nenhum template de contrato ativo encontrado');
  }

  return data as ContractTemplate;
}

/**
 * Substituir variáveis no template
 * @param template - Conteúdo do template com placeholders {{variavel}}
 * @param variables - Objeto com valores das variáveis
 * @returns Conteúdo com variáveis substituídas
 */
export function replaceVariables(
  template: string,
  variables: ContractVariables
): string {
  let result = template;

  // Substituir cada variável
  Object.entries(variables).forEach(([key, value]) => {
    // Substituir {{variavel}} por valor (ou string vazia se undefined/null)
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, value ?? '');
  });

  return result;
}

/**
 * Gerar PREVIEW do contrato (sem salvar no banco)
 * @param variables - Variáveis do contrato
 * @returns Objeto com conteúdo do contrato e template ID
 */
export async function generateContractPreview(
  variables: ContractVariables
): Promise<{ conteudo: string; templateId: string; templateNome: string }> {
  try {
    // 1. Buscar template ativo
    const template = await fetchContractTemplate();

    // 2. Substituir variáveis
    const conteudoFinal = replaceVariables(
      template.conteudo_template,
      variables
    );

    return {
      conteudo: conteudoFinal,
      templateId: template.id,
      templateNome: template.nome,
    };
  } catch (error) {
    console.error('❌ Erro em generateContractPreview:', error);
    throw error;
  }
}

/**
 * Gerar e SALVAR contrato no banco
 * @param pessoaId - ID da pessoa (paciente ou responsável)
 * @param variables - Variáveis do contrato
 * @param agendamentoId - ID do agendamento (opcional)
 * @returns Contrato gerado
 */
export async function generateContract(
  pessoaId: string,
  variables: ContractVariables,
  agendamentoId?: string
): Promise<UserContract> {
  try {
    // 1. Gerar preview (busca template e substitui variáveis)
    const preview = await generateContractPreview(variables);

    // 2. Preparar dados do contrato
    const contractData = {
      contract_template_id: preview.templateId,
      pessoa_id: pessoaId,
      agendamento_id: agendamentoId || null,
      nome_contrato: `Contrato Respira Kids - ${variables.paciente}`,
      conteudo_final: preview.conteudo,
      variaveis_utilizadas: variables as unknown as Record<string, string>,
      status_contrato: 'gerado' as const,
      data_geracao: new Date().toISOString(),
      ativo: true,
    };

    // 3. Inserir no banco
    const { data, error } = await supabase
      .from('user_contracts')
      .insert(contractData)
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao gerar contrato:', error);
      throw new Error('Não foi possível gerar o contrato');
    }

    return data as UserContract;
  } catch (error) {
    console.error('❌ Erro em generateContract:', error);
    throw error;
  }
}

/**
 * Montar as variáveis do contrato a partir dos dados ATUAIS do paciente.
 * AI dev note: fonte única de verdade para a projeção "dados do cadastro -> contrato".
 * Usada tanto na geração quanto no "refazer", garantindo que os dois caminhos
 * produzam exatamente o mesmo texto (autorizações via buildUsoImagemVars).
 */
export async function buildContractVariablesForPatient(
  patientId: string
): Promise<ContractVariables> {
  const { data: p, error } = await supabase
    .from('pacientes_com_responsaveis_view')
    .select('*')
    .eq('id', patientId)
    .single();

  if (error || !p) {
    console.error(
      '❌ Erro ao buscar dados do paciente para o contrato:',
      error
    );
    throw new Error('Dados do paciente não encontrados');
  }

  // AI dev note: a view não expõe o CPF dos responsáveis (só o do paciente em
  // cpf_cnpj). Buscamos direto em `pessoas` pelos ids e formatamos (a view
  // guardava dígitos crus; o contrato usa xxx.xxx.xxx-xx).
  const respIds = [p.responsavel_legal_id, p.responsavel_financeiro_id].filter(
    Boolean
  ) as string[];
  const cpfPorPessoa: Record<string, string> = {};
  if (respIds.length > 0) {
    const { data: resps } = await supabase
      .from('pessoas')
      .select('id, cpf_cnpj')
      .in('id', respIds);
    for (const r of resps ?? []) {
      cpfPorPessoa[r.id] = r.cpf_cnpj ? formatCPF(r.cpf_cnpj) : '';
    }
  }
  const responsavelLegalCpf = p.responsavel_legal_id
    ? cpfPorPessoa[p.responsavel_legal_id] || ''
    : '';
  const responsavelFinanceiroCpf = p.responsavel_financeiro_id
    ? cpfPorPessoa[p.responsavel_financeiro_id] || ''
    : '';

  const formatarDataBrasileira = (dataISO: string): string => {
    if (!dataISO) return '';
    const [year, month, day] = dataISO.split('-');
    return `${day}/${month}/${year}`;
  };

  const formatarTelefone = (telefone: bigint | number | null): string => {
    if (!telefone) return '';
    const tel = telefone.toString();
    if (tel.length === 11) {
      return `(${tel.slice(0, 2)}) ${tel.slice(2, 7)}-${tel.slice(7)}`;
    }
    return tel;
  };

  const mesmoResponsavel =
    p.responsavel_legal_id === p.responsavel_financeiro_id;

  return {
    // Responsável Legal
    responsavelLegalNome: p.responsavel_legal_nome || '',
    responsavelLegalCpf: responsavelLegalCpf,
    responsavelLegalTelefone: formatarTelefone(p.responsavel_legal_telefone),
    responsavelLegalEmail: p.responsavel_legal_email || '',
    responsavelLegalFinanceiro: mesmoResponsavel ? 'e Financeiro' : '',

    // Cláusula condicional para responsável financeiro diferente
    clausulaResponsavelFinanceiro:
      !mesmoResponsavel && p.responsavel_financeiro_nome
        ? `\n\n**Parágrafo único:** Os pagamentos referentes aos serviços prestados serão realizados por **${p.responsavel_financeiro_nome}**, CPF nº ${responsavelFinanceiroCpf}, telefone ${formatarTelefone(p.responsavel_financeiro_telefone)}, email ${p.responsavel_financeiro_email || ''}, na qualidade de **RESPONSÁVEL FINANCEIRO**.`
        : '',

    // Variáveis antigas (compatibilidade)
    contratante: p.responsavel_legal_nome || '',
    cpf: responsavelLegalCpf,
    telefone: formatarTelefone(p.responsavel_legal_telefone),
    email: p.responsavel_legal_email || '',

    // Endereço
    endereco_completo: [
      p.logradouro,
      p.numero_endereco && `, ${p.numero_endereco}`,
      p.complemento_endereco && ` ${p.complemento_endereco}`,
      p.bairro && `, ${p.bairro}`,
      p.cidade && `, ${p.cidade}`,
      p.estado && ` - ${p.estado}`,
      p.cep && `, CEP ${p.cep}`,
    ]
      .filter(Boolean)
      .join(''),
    logradouro: p.logradouro || '',
    numero: p.numero_endereco || '',
    complemento: p.complemento_endereco,
    bairro: p.bairro || '',
    cidade: p.cidade || '',
    uf: p.estado || '',
    cep: p.cep || '',

    // Paciente
    paciente: p.nome || '',
    dnPac: formatarDataBrasileira(p.data_nascimento || ''),
    cpfPac: p.cpf_cnpj ? formatCPF(p.cpf_cnpj) : 'não fornecido',

    // Data
    hoje: new Date().toLocaleDateString('pt-BR'),

    // Autorizações (uso científico e redes sociais são INDEPENDENTES)
    ...buildUsoImagemVars({
      usoCientifico: p.autorizacao_uso_cientifico ?? false,
      usoRedesSociais: p.autorizacao_uso_redes_sociais ?? false,
      usoNome: p.autorizacao_uso_do_nome ?? false,
    }),
  };
}

export interface RefazerContratoParams {
  /** Paciente dono do contrato */
  patientId: string;
  /** Novos valores das autorizações (podem ser iguais aos atuais) */
  autorizacoes: UsoImagemAutorizacoes;
  /** Motivo do refazer (obrigatório para auditoria) */
  motivo: string;
  /** pessoas.id de quem está refazendo (para auditoria); null se não resolvido */
  refeitoPor: string | null;
}

/**
 * Refazer o contrato do paciente.
 * AI dev note: NÃO sobrescreve o contrato assinado. Fluxo (preserva histórico):
 *  1. Salva as autorizações atuais em `pessoas`.
 *  2. Cancela o contrato ativo (`ativo=false`, status `cancelado`).
 *  3. Gera um NOVO contrato a partir dos dados atuais (texto já corrigido).
 *  4. Registra em `contrato_audit_log` (quem, quando, motivo, o que mudou).
 * O envio para assinatura (send-contract-webhook) é disparado pelo chamador,
 * como já acontece na geração/reenvio.
 */
export async function refazerContrato(
  params: RefazerContratoParams
): Promise<UserContract> {
  const { patientId, autorizacoes, motivo, refeitoPor } = params;

  // 1. Ler autorizações atuais (para o "antes" da auditoria) e salvar as novas.
  const { data: pessoaAntes } = await supabase
    .from('pessoas')
    .select(
      'autorizacao_uso_cientifico, autorizacao_uso_redes_sociais, autorizacao_uso_do_nome'
    )
    .eq('id', patientId)
    .single();

  const { error: updateAuthError } = await supabase
    .from('pessoas')
    .update({
      autorizacao_uso_cientifico: autorizacoes.usoCientifico,
      autorizacao_uso_redes_sociais: autorizacoes.usoRedesSociais,
      autorizacao_uso_do_nome: autorizacoes.usoNome,
      updated_at: new Date().toISOString(),
    })
    .eq('id', patientId);

  if (updateAuthError) {
    console.error('❌ Erro ao salvar autorizações:', updateAuthError);
    throw new Error('Não foi possível salvar as autorizações');
  }

  // 2. Buscar o contrato ativo atual (será cancelado).
  const contratoAtual = await fetchUserContract(patientId);

  // 3. Montar as variáveis a partir dos dados atuais (já com as novas autorizações).
  const variables = await buildContractVariablesForPatient(patientId);

  // 4. Cancelar o contrato atual (mantém como histórico do que foi assinado).
  if (contratoAtual) {
    const carimbo = new Date().toLocaleString('pt-BR');
    const novaObs = [
      contratoAtual.observacoes,
      `Refeito em ${carimbo}: ${motivo}`,
    ]
      .filter(Boolean)
      .join('\n');

    const { error: cancelError } = await supabase
      .from('user_contracts')
      .update({
        ativo: false,
        status_contrato: 'cancelado',
        atualizado_por: refeitoPor,
        observacoes: novaObs,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contratoAtual.id);

    if (cancelError) {
      console.error('❌ Erro ao cancelar contrato anterior:', cancelError);
      throw new Error('Não foi possível cancelar o contrato anterior');
    }
  }

  // 5. Gerar o novo contrato (status 'gerado').
  const novo = await generateContract(patientId, variables);

  await supabase
    .from('user_contracts')
    .update({ criado_por: refeitoPor, arquivo_url: 'Aguardando' })
    .eq('id', novo.id);

  // 6. Registrar auditoria (quem, quando, motivo e o que mudou).
  const { error: auditError } = await supabase
    .from('contrato_audit_log')
    .insert({
      pessoa_id: patientId,
      contrato_id_anterior: contratoAtual?.id ?? null,
      contrato_id_novo: novo.id,
      acao: 'refazer',
      motivo,
      detalhes: {
        autorizacoes_antes: pessoaAntes
          ? {
              cientifico: pessoaAntes.autorizacao_uso_cientifico,
              redes: pessoaAntes.autorizacao_uso_redes_sociais,
              nome: pessoaAntes.autorizacao_uso_do_nome,
            }
          : null,
        autorizacoes_depois: {
          cientifico: autorizacoes.usoCientifico,
          redes: autorizacoes.usoRedesSociais,
          nome: autorizacoes.usoNome,
        },
      },
      refeito_por: refeitoPor,
    });

  if (auditError) {
    // Não bloqueia o refazer (contrato já foi gerado), mas loga o problema.
    console.error('⚠️ Erro ao registrar auditoria do refazer:', auditError);
  }

  return novo;
}

/**
 * Buscar contrato de um usuário/pessoa
 * @param pessoaId - ID da pessoa
 * @returns Último contrato ativo ou null
 */
export async function fetchUserContract(
  pessoaId: string
): Promise<UserContract | null> {
  const { data, error } = await supabase
    .from('user_contracts')
    .select('*')
    .eq('pessoa_id', pessoaId)
    .eq('ativo', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('❌ Erro ao buscar contrato do usuário:', error);
    throw new Error('Não foi possível buscar o contrato');
  }

  return data as UserContract | null;
}

/**
 * Buscar contrato por ID
 * @param contractId - ID do contrato
 * @returns Contrato ou null
 */
export async function fetchContractById(
  contractId: string
): Promise<UserContract | null> {
  const { data, error } = await supabase
    .from('user_contracts')
    .select('*')
    .eq('id', contractId)
    .single();

  if (error) {
    console.error('❌ Erro ao buscar contrato por ID:', error);
    return null;
  }

  return data as UserContract;
}

/**
 * Registrar aceite do contrato
 * @param contractId - ID do contrato
 * @param assinaturaDigitalId - ID da assinatura digital (ex: whatsapp_{phone}_{timestamp})
 * @returns Contrato atualizado
 */
export async function acceptContract(
  contractId: string,
  assinaturaDigitalId: string
): Promise<UserContract> {
  const { data, error } = await supabase
    .from('user_contracts')
    .update({
      status_contrato: 'assinado',
      data_assinatura: new Date().toISOString(),
      assinatura_digital_id: assinaturaDigitalId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contractId)
    .select()
    .single();

  if (error) {
    console.error('❌ Erro ao aceitar contrato:', error);
    throw new Error('Não foi possível registrar o aceite do contrato');
  }

  return data as UserContract;
}

/**
 * Verificar se pessoa tem contrato assinado
 * @param pessoaId - ID da pessoa
 * @returns true se tem contrato assinado ativo
 */
export async function hasActiveContract(pessoaId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_contracts')
    .select('id')
    .eq('pessoa_id', pessoaId)
    .eq('status_contrato', 'assinado')
    .eq('ativo', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('❌ Erro ao verificar contrato ativo:', error);
    return false;
  }

  return !!data;
}

/**
 * Atualizar URL do arquivo PDF do contrato
 * @param contractId - ID do contrato
 * @param arquivoUrl - URL do arquivo PDF
 * @returns Contrato atualizado
 */
export async function updateContractPdfUrl(
  contractId: string,
  arquivoUrl: string
): Promise<UserContract> {
  const { data, error } = await supabase
    .from('user_contracts')
    .update({
      arquivo_url: arquivoUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contractId)
    .select()
    .single();

  if (error) {
    console.error('❌ Erro ao atualizar URL do PDF:', error);
    throw new Error('Não foi possível atualizar o contrato');
  }

  return data as UserContract;
}

/**
 * Atualizar link do contrato na tabela pessoas
 * @param pessoaId - ID da pessoa
 * @param linkContrato - URL do contrato
 */
export async function updatePersonContractLink(
  pessoaId: string,
  linkContrato: string
): Promise<void> {
  const { error } = await supabase
    .from('pessoas')
    .update({
      link_contrato: linkContrato,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pessoaId);

  if (error) {
    console.error('❌ Erro ao atualizar link do contrato na pessoa:', error);
    throw new Error('Não foi possível atualizar o link do contrato');
  }
}
