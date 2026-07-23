// AI dev note: Edge Function para finalizar cadastro público de paciente
// Cria todas as entidades no banco de dados seguindo a ordem correta
// Logs detalhados em cada etapa para rastreamento
// Versão 45: Tomador da NFS-e desacoplado do pagador. "Nota no nome do paciente"
//            grava pessoas.tomador_nfe_id = pacienteId; responsavel_cobranca_id
//            permanece no responsável financeiro (pagador). Sem conflação.
// Versão 44: Opção de nota fiscal no nome do paciente define o tomador fiscal
//            via responsavel_cobranca_id = pacienteId, sem alterar vínculos de responsáveis
// Versão 43: Idempotência no STEP 6+ para retry de cadastro público
//            - Reutiliza paciente ativo já existente para o mesmo responsável financeiro
//            - Evita duplicar relacionamentos e contrato em reenvios do mesmo cadastro
// Versão 42: Fluxo de assinatura digital via n8n + Assinafy
//            - Contrato criado com status 'gerado' (não mais 'assinado')
//            - data_assinatura NÃO é preenchida (será setada quando assinatura chegar)
//            - Gera PDF via edge function generate-contract-pdf
//            - Faz upload do PDF no bucket respira-contracts/{pessoa_id}/{contract_id}.pdf
//            - Gera signed URL (24h) e enfileira webhook contrato_gerado para n8n
// Versão 41: Fix CPF duplicado - (1) STEP 3 reutiliza pessoa existente com
//            mesmo CPF em retries, (2) mensagens de erro mais detalhadas

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface PatientRegistrationData {
  sessionId?: string;
  existingPersonId?: string;
  existingUserData?: {
    id: string;
    nome: string;
    email: string;
    telefone: string;
  };
  responsavelLegal?: {
    nome: string;
    cpf: string;
    email: string;
  };
  responsavelFinanceiroMesmoQueLegal: boolean;
  responsavelFinanceiroExistingId?: string;
  newPersonData?: {
    nome: string;
    cpf: string;
    email: string;
    whatsapp?: string;
    whatsappJid?: string;
  };
  endereco: {
    cep: string;
    logradouro: string;
    bairro: string;
    cidade: string;
    estado: string;
    numero: string;
    complemento?: string;
  };
  paciente: {
    nome: string;
    dataNascimento: string;
    sexo: string;
    cpf?: string;
    emitirNotaNomePaciente?: boolean;
  };
  pediatra: {
    id?: string;
    nome: string;
    crm?: string;
    noPediatrician?: boolean;
  };
  autorizacoes: {
    usoCientifico: boolean;
    usoRedesSociais: boolean;
    usoNome: boolean;
  };
  contractVariables: Record<string, unknown>;
  whatsappJid?: string;
  phoneNumber?: string;
}

function extractPhoneFromJid(jid: string): string {
  return jid.split('@')[0];
}

// AI dev note: Nome canônico do pediatra-sentinela. Usado quando o responsável marca
// "não possui pediatra" — é informação afirmativa (criança sem pediatra fixo, atendida
// em posto), então vira vínculo normal apontando SEMPRE para o mesmo registro.
const PEDIATRA_NAO_INFORMADO = 'Não Informado';

// AI dev note: Normaliza nome de pediatra para deduplicação. Sem isto,
// "Dr. Carlos Zaconeta", "carlos zaconeta" e "Carlos  Zaconeta" viravam três
// pediatras distintos.
// PRECISA continuar equivalente a fn_normalizar_nome_profissional() no banco
// (migration dedup_pediatra_obstetra.sql), que é o que alimenta o índice único
// idx_pessoas_pediatra_nome_unico. Se as duas divergirem, esta busca não acha o
// registro que o índice depois recusa, e o cadastro cai no tratamento de corrida
// à toa. O separador do prefixo é "ponto + espaços opcionais" OU "espaços" —
// exigir um dos dois evita decepar nomes como "Drauzio" em "auzio".
function normalizarNomePediatra(nome: string): string {
  return nome
    .trim()
    .replace(/^(dr|dra)(\.\s*|\s+)/i, '')
    .normalize('NFD') // Decompor caracteres acentuados
    .replace(/\p{M}/gu, '') // Remover diacríticos (marcas combinantes)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// AI dev note: Formata data ISO (YYYY-MM-DD) para formato brasileiro (DD/MM/YYYY)
// Usa manipulação de string para EVITAR PROBLEMAS DE TIMEZONE
// Quando usamos new Date('2024-04-16'), JavaScript interpreta como meia-noite UTC
// No Brasil (UTC-3), isso vira 21:00 do dia anterior, causando bugs de exibição
function formatDateBR(dateISO: string | null | undefined): string {
  if (!dateISO) return '';
  // Extrair apenas a parte da data (remover hora se existir)
  const datePart = dateISO.split('T')[0];
  const parts = datePart.split('-');
  if (parts.length !== 3) return dateISO;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

// AI dev note: Função helper para limpar CPF antes de salvar no banco
// Remove toda formatação (pontos, traços) e valida se tem 11 dígitos
function cleanCPF(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const cleaned = cpf.replace(/\D/g, '');
  return cleaned.length === 11 ? cleaned : null;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let supabase: SupabaseClient;
  let sessionId = 'unknown';
  let startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    console.log(
      '🔍 [DEBUG] Request body completo recebido:',
      JSON.stringify(requestBody)
    );

    const { action, data } = requestBody as {
      action: string;
      data: PatientRegistrationData;
    };

    sessionId = data?.sessionId || 'unknown';
    startTime = Date.now();

    console.log('🚀 [PUBLIC-PATIENT-REGISTRATION] Iniciando cadastro público');
    console.log('📋 [LOGGING] Session ID:', sessionId);
    console.log('📋 [STEP 0] Ação:', action);

    // Validações básicas
    console.log('🔍 [DEBUG] data é null?', data === null);
    console.log('🔍 [DEBUG] data é undefined?', data === undefined);
    console.log('🔍 [DEBUG] typeof data:', typeof data);

    if (!data) {
      console.error('❌ [ERROR] data está null ou undefined!');
      throw new Error('Dados de cadastro não fornecidos no request body');
    }

    console.log('🔍 [DEBUG] data.paciente existe?', !!data.paciente);
    console.log('🔍 [DEBUG] data.paciente:', JSON.stringify(data.paciente));
    console.log('🔍 [DEBUG] data.pediatra existe?', !!data.pediatra);
    console.log('🔍 [DEBUG] data.pediatra:', JSON.stringify(data.pediatra));

    console.log(
      '📋 [STEP 0] Dados recebidos (resumo):',
      JSON.stringify({
        hasExistingUser: !!data.existingPersonId,
        hasResponsavelLegal: !!data.responsavelLegal,
        responsavelFinanceiroMesmoQueLegal:
          data.responsavelFinanceiroMesmoQueLegal,
        responsavelFinanceiroExistingId: data.responsavelFinanceiroExistingId,
        hasNewPersonData: !!data.newPersonData,
        pacienteNome: data.paciente?.nome || 'não fornecido',
        emitirNotaNomePaciente: !!data.paciente?.emitirNotaNomePaciente,
        pediatraId: data.pediatra?.id || 'novo pediatra',
        pediatraNome: data.pediatra?.nome || 'não fornecido',
        hasContractVariables: !!data.contractVariables,
      })
    );

    if (action !== 'finalize_registration') {
      throw new Error(`Ação desconhecida: ${action}`);
    }

    if (!data.contractVariables) {
      throw new Error('Variáveis do contrato são obrigatórias');
    }

    // ============================================
    // STEP 1: Buscar tipos de pessoa
    // ============================================
    console.log('📋 [STEP 1] Buscando tipos de pessoa...');

    const { data: tipoResponsavel, error: errorTipoResponsavel } =
      await supabase
        .from('pessoa_tipos')
        .select('id')
        .eq('codigo', 'responsavel')
        .single();

    if (errorTipoResponsavel || !tipoResponsavel) {
      console.error(
        '❌ [STEP 1] Erro ao buscar tipo responsavel:',
        errorTipoResponsavel
      );
      throw new Error('Tipo de pessoa "responsavel" não encontrado');
    }
    console.log('✅ [STEP 1] Tipo responsavel:', tipoResponsavel.id);

    const { data: tipoPaciente, error: errorTipoPaciente } = await supabase
      .from('pessoa_tipos')
      .select('id')
      .eq('codigo', 'paciente')
      .single();

    if (errorTipoPaciente || !tipoPaciente) {
      console.error(
        '❌ [STEP 1] Erro ao buscar tipo paciente:',
        errorTipoPaciente
      );
      throw new Error('Tipo de pessoa "paciente" não encontrado');
    }
    console.log('✅ [STEP 1] Tipo paciente:', tipoPaciente.id);

    // ============================================
    // STEP 2: Buscar ou Criar ENDEREÇO do Responsável Legal
    // ============================================
    console.log('📋 [STEP 2] Buscando ou criando endereço...');
    console.log('📋 [STEP 2] CEP:', data.endereco.cep);

    // AI dev note: Normalizar CEP removendo caracteres não numéricos antes de buscar/inserir
    const cepNormalizado = data.endereco.cep.replace(/\D/g, '');
    console.log('📋 [STEP 2] CEP normalizado:', cepNormalizado);

    let enderecoId: string;

    // AI dev note: Buscar endereço APENAS por CEP (constraint UNIQUE no CEP)
    // Campos logradouro/bairro/cidade/estado são bloqueados no frontend após busca
    const { data: enderecoExistente, error: errorEnderecoSearch } =
      await supabase
        .from('enderecos')
        .select('id')
        .eq('cep', cepNormalizado)
        .maybeSingle();

    if (errorEnderecoSearch) {
      console.error(
        '❌ [STEP 2] Erro ao buscar endereço:',
        errorEnderecoSearch
      );
      throw new Error('Erro ao buscar endereço');
    }

    if (enderecoExistente) {
      enderecoId = enderecoExistente.id;
      console.log('✅ [STEP 2] Endereço já existe (reutilizando):', enderecoId);
    } else {
      console.log('📋 [STEP 2] Criando novo endereço...');

      // Log detalhado dos dados do endereço antes da inserção
      console.log('🔍 [DEBUG] Dados do endereço a serem inseridos:', {
        cep: cepNormalizado,
        cep_length: cepNormalizado.length,
        logradouro: data.endereco.logradouro,
        logradouro_length: data.endereco.logradouro?.length || 0,
        logradouro_trimmed: data.endereco.logradouro?.trim(),
        bairro: data.endereco.bairro,
        bairro_length: data.endereco.bairro?.length || 0,
        bairro_trimmed: data.endereco.bairro?.trim(),
        cidade: data.endereco.cidade,
        cidade_length: data.endereco.cidade?.length || 0,
        cidade_trimmed: data.endereco.cidade?.trim(),
        estado: data.endereco.estado,
        estado_length: data.endereco.estado?.length || 0,
        estado_trimmed: data.endereco.estado?.trim(),
        estado_trimmed_length: data.endereco.estado?.trim()?.length || 0,
        estado_raw_chars: data.endereco.estado
          ? data.endereco.estado
              .split('')
              .map((c) => `'${c}' (code: ${c.charCodeAt(0)})`)
          : [],
      });

      // AI dev note: Adicionar trim() em todos os campos para evitar espaços em branco
      // A constraint do banco requer que estado tenha exatamente 2 caracteres
      let estadoNormalizado = data.endereco.estado?.trim()?.toUpperCase();
      let logradouro = data.endereco.logradouro?.trim() || '';
      let bairro = data.endereco.bairro?.trim() || '';
      let cidade = data.endereco.cidade?.trim() || '';

      // Validar estado obrigatório com 2 caracteres
      // SE FALHAR: Tentar buscar no ViaCEP como fallback (resiliência para dados incompletos)
      if (!estadoNormalizado || estadoNormalizado.length !== 2) {
        console.warn(
          `⚠️ [STEP 2] Estado inválido ou vazio ("${estadoNormalizado}"). Tentando buscar no ViaCEP...`
        );

        try {
          const viaCepResponse = await fetch(
            `https://viacep.com.br/ws/${cepNormalizado}/json/`
          );
          const viaCepData = await viaCepResponse.json();

          if (viaCepData.erro) {
            throw new Error('CEP não encontrado no ViaCEP');
          }

          console.log(
            '✅ [STEP 2] Dados recuperados do ViaCEP:',
            viaCepData.uf
          );

          // Preencher dados faltantes
          estadoNormalizado = viaCepData.uf;
          if (!logradouro) logradouro = viaCepData.logradouro;
          if (!bairro) bairro = viaCepData.bairro;
          if (!cidade) cidade = viaCepData.localidade;
        } catch (viaCepError) {
          console.error(
            '❌ [STEP 2] Falha no fallback do ViaCEP:',
            viaCepError
          );
          // Se falhar o fallback, lança o erro original
          throw new Error(
            `Estado (UF) deve ter exatamente 2 caracteres (ex: SP, RJ, MG). Recebido: "${estadoNormalizado || '(vazio)'}" e falha ao buscar automaticamente.`
          );
        }
      }

      // Revalidar após fallback
      if (!estadoNormalizado || estadoNormalizado.length !== 2) {
        throw new Error(
          `Estado (UF) deve ter exatamente 2 caracteres (ex: SP, RJ, MG). Recebido: "${estadoNormalizado || '(vazio)'}"`
        );
      }

      const { data: novoEndereco, error: errorEnderecoInsert } = await supabase
        .from('enderecos')
        .insert({
          cep: cepNormalizado, // AI dev note: Usar CEP normalizado sem formatação
          logradouro: logradouro,
          bairro: bairro,
          cidade: cidade,
          estado: estadoNormalizado, // Já validado com 2 caracteres
        })
        .select('id')
        .single();

      if (errorEnderecoInsert || !novoEndereco) {
        console.error(
          '❌ [STEP 2] Erro ao criar endereço:',
          errorEnderecoInsert
        );
        console.error(
          '❌ [STEP 2] Detalhes do erro:',
          JSON.stringify(errorEnderecoInsert, null, 2)
        );

        // Mensagem mais específica baseada no erro
        let errorMessage = 'Erro ao criar endereço';

        if (errorEnderecoInsert?.message?.includes('enderecos_estado_check')) {
          errorMessage =
            'Erro: Estado (UF) deve ter exatamente 2 caracteres (ex: SP, RJ, MG)';
        } else if (errorEnderecoInsert?.code === '23505') {
          errorMessage = 'Erro: CEP já cadastrado no sistema';
        } else if (errorEnderecoInsert?.message?.includes('not-null')) {
          errorMessage = 'Erro: Todos os campos de endereço são obrigatórios';
        } else if (errorEnderecoInsert?.message) {
          errorMessage = `Erro ao criar endereço: ${errorEnderecoInsert.message}`;
        }

        throw new Error(errorMessage);
      }

      enderecoId = novoEndereco.id;
      console.log('✅ [STEP 2] Novo endereço criado:', enderecoId);
    }

    // ============================================
    // STEP 3: Criar ou Usar RESPONSÁVEL LEGAL
    // ============================================
    let responsavelLegalId: string;

    // AI dev note: Verificar se há pessoa existente (pode vir em existingPersonId ou existingUserData.id)
    const existingId = data.existingPersonId || data.existingUserData?.id;

    if (existingId && data.existingUserData) {
      // Usar pessoa existente
      responsavelLegalId = existingId;
      console.log(
        '✅ [STEP 3] Usando pessoa existente como responsável legal:',
        responsavelLegalId
      );
      console.log('📋 [STEP 3] Dados do usuário existente:', {
        nome: data.existingUserData.nome,
        email: data.existingUserData.email,
        telefone: data.existingUserData.telefone,
      });

      // Atualizar endereço da pessoa existente
      console.log(
        '📋 [STEP 3] Atualizando endereço do responsável existente...'
      );
      const { error: errorUpdateEndereco } = await supabase
        .from('pessoas')
        .update({
          id_endereco: enderecoId,
          numero_endereco: data.endereco.numero,
          complemento_endereco: data.endereco.complemento || null,
        })
        .eq('id', responsavelLegalId);

      if (errorUpdateEndereco) {
        console.error(
          '❌ [STEP 3] Erro ao atualizar endereço:',
          errorUpdateEndereco
        );
        throw new Error('Erro ao atualizar endereço do responsável');
      }
      console.log('✅ [STEP 3] Endereço atualizado para responsável existente');
    } else {
      // Criar novo responsável legal
      console.log('📋 [STEP 3] Criando novo responsável legal...');

      const telefoneResponsavelLegal = data.whatsappJid
        ? extractPhoneFromJid(data.whatsappJid)
        : data.phoneNumber;

      const cpfResponsavelLegal = cleanCPF(data.responsavelLegal.cpf);

      console.log('📋 [STEP 3] Dados:', {
        nome: data.responsavelLegal?.nome,
        cpf: cpfResponsavelLegal,
        email: data.responsavelLegal?.email,
        telefone: telefoneResponsavelLegal,
      });

      // AI dev note: Verificar se já existe pessoa ativa com o mesmo CPF
      // Isso acontece em cenários de retry: a 1a tentativa criou o responsável
      // mas falhou em etapa posterior (ex: paciente). Na 2a tentativa, o responsável
      // já existe e deve ser reutilizado em vez de tentar inserir novamente.
      if (cpfResponsavelLegal) {
        const { data: pessoaExistenteCpf, error: errorBuscaCpf } =
          await supabase
            .from('pessoas')
            .select('id')
            .eq('cpf_cnpj', cpfResponsavelLegal)
            .eq('ativo', true)
            .maybeSingle();

        if (!errorBuscaCpf && pessoaExistenteCpf) {
          responsavelLegalId = pessoaExistenteCpf.id;
          console.log(
            '✅ [STEP 3] Pessoa com mesmo CPF já existe (reutilizando):',
            responsavelLegalId
          );

          // Atualizar dados que podem ter mudado
          const { error: errorUpdateExistente } = await supabase
            .from('pessoas')
            .update({
              nome: data.responsavelLegal.nome,
              telefone: telefoneResponsavelLegal,
              email: data.responsavelLegal.email,
              id_endereco: enderecoId,
              numero_endereco: data.endereco.numero,
              complemento_endereco: data.endereco.complemento || null,
            })
            .eq('id', responsavelLegalId);

          if (errorUpdateExistente) {
            console.warn(
              '⚠️ [STEP 3] Falha ao atualizar dados da pessoa existente (continuando):',
              errorUpdateExistente
            );
          }
        }
      }

      // Só criar se não encontrou pessoa existente
      if (!responsavelLegalId) {
        const tempId = crypto.randomUUID();

        const { data: novoResponsavelLegal, error: errorResponsavelLegal } =
          await supabase
            .from('pessoas')
            .insert({
              id: tempId,
              nome: data.responsavelLegal.nome,
              cpf_cnpj: cpfResponsavelLegal,
              telefone: telefoneResponsavelLegal,
              email: data.responsavelLegal.email,
              id_tipo_pessoa: tipoResponsavel.id,
              id_endereco: enderecoId,
              numero_endereco: data.endereco.numero,
              complemento_endereco: data.endereco.complemento || null,
              responsavel_cobranca_id: tempId,
              ativo: true,
            })
            .select('id')
            .single();

        if (errorResponsavelLegal || !novoResponsavelLegal) {
          console.error(
            '❌ [STEP 3] Erro ao criar responsável legal:',
            errorResponsavelLegal
          );
          const detalhes =
            errorResponsavelLegal?.message || 'Erro desconhecido';
          throw new Error(`Erro ao criar responsável legal: ${detalhes}`);
        }

        responsavelLegalId = novoResponsavelLegal.id;
        console.log(
          '✅ [STEP 3] Responsável legal criado:',
          responsavelLegalId
        );

        // Atualizar auto-referência
        console.log('📋 [STEP 3.1] Atualizando auto-referência...');
        const { error: errorAutoReferencia } = await supabase
          .from('pessoas')
          .update({ responsavel_cobranca_id: responsavelLegalId })
          .eq('id', responsavelLegalId);

        if (errorAutoReferencia) {
          console.error(
            '❌ [STEP 3.1] Erro ao atualizar auto-referência:',
            errorAutoReferencia
          );
          throw new Error('Erro ao atualizar auto-referência do responsável');
        }
        console.log('✅ [STEP 3.1] Auto-referência atualizada');
      }
    }

    // ============================================
    // STEP 4: Criar ou Usar RESPONSÁVEL FINANCEIRO
    // ============================================
    let responsavelFinanceiroId: string;

    if (data.responsavelFinanceiroMesmoQueLegal) {
      // Responsável financeiro é o mesmo que o legal
      responsavelFinanceiroId = responsavelLegalId;
      console.log(
        '✅ [STEP 4] Responsável financeiro = legal:',
        responsavelFinanceiroId
      );
    } else if (data.responsavelFinanceiroExistingId) {
      // Usar pessoa existente como responsável financeiro
      responsavelFinanceiroId = data.responsavelFinanceiroExistingId;
      console.log(
        '✅ [STEP 4] Usando responsável financeiro existente:',
        responsavelFinanceiroId
      );

      // Verificar se pessoa existe
      const { data: pessoaExistente, error: errorPessoaCheck } = await supabase
        .from('pessoas')
        .select('id, nome')
        .eq('id', responsavelFinanceiroId)
        .eq('ativo', true)
        .single();

      if (errorPessoaCheck || !pessoaExistente) {
        console.error(
          '❌ [STEP 4] Pessoa existente não encontrada:',
          errorPessoaCheck
        );
        throw new Error('Responsável financeiro não encontrado no sistema');
      }
      console.log(
        '✅ [STEP 4] Pessoa existente confirmada:',
        pessoaExistente.nome
      );

      // Atualizar endereço do responsável financeiro existente
      console.log(
        '📋 [STEP 4] Atualizando endereço do responsável financeiro existente...'
      );
      const { error: errorUpdateEnderecoFin } = await supabase
        .from('pessoas')
        .update({
          id_endereco: enderecoId,
          numero_endereco: data.endereco.numero,
          complemento_endereco: data.endereco.complemento || null,
        })
        .eq('id', responsavelFinanceiroId);

      if (errorUpdateEnderecoFin) {
        console.error(
          '❌ [STEP 4] Erro ao atualizar endereço financeiro:',
          errorUpdateEnderecoFin
        );
        throw new Error('Erro ao atualizar endereço do responsável financeiro');
      }
      console.log(
        '✅ [STEP 4] Endereço atualizado para responsável financeiro existente'
      );
    } else if (data.newPersonData) {
      // Criar novo responsável financeiro
      console.log('📋 [STEP 4] Criando novo responsável financeiro...');

      const telefoneResponsavelFin = data.newPersonData.whatsappJid
        ? extractPhoneFromJid(data.newPersonData.whatsappJid)
        : data.newPersonData.whatsapp;

      console.log('📋 [STEP 4] Dados:', {
        nome: data.newPersonData.nome,
        cpf: data.newPersonData.cpf,
        email: data.newPersonData.email,
        telefone: telefoneResponsavelFin,
      });

      // Usar mesmo endereço do responsável legal
      console.log('✅ [STEP 4] Usando mesmo endereço do responsável legal');

      console.log('📋 [STEP 4] Inserindo nova pessoa financeira...');
      const tempFinId = crypto.randomUUID();

      const { data: novoResponsavelFin, error: errorResponsavelFin } =
        await supabase
          .from('pessoas')
          .insert({
            id: tempFinId, // ID temporário para auto-referência
            nome: data.newPersonData.nome,
            cpf_cnpj: cleanCPF(data.newPersonData.cpf), // AI dev note: Limpar CPF antes de salvar
            telefone: telefoneResponsavelFin,
            email: data.newPersonData.email,
            id_tipo_pessoa: tipoResponsavel.id,
            id_endereco: enderecoId,
            numero_endereco: data.endereco.numero,
            complemento_endereco: data.endereco.complemento || null,
            responsavel_cobranca_id: tempFinId, // Auto-referência
            ativo: true,
          })
          .select('id')
          .single();

      if (errorResponsavelFin || !novoResponsavelFin) {
        console.error(
          '❌ [STEP 4] Erro ao criar responsável financeiro:',
          errorResponsavelFin
        );
        throw new Error('Erro ao criar responsável financeiro');
      }

      responsavelFinanceiroId = novoResponsavelFin.id;
      console.log(
        '✅ [STEP 4] Responsável financeiro criado:',
        responsavelFinanceiroId
      );

      // Atualizar auto-referência
      console.log(
        '📋 [STEP 4.1] Atualizando auto-referência do responsável financeiro...'
      );
      const { error: errorAutoRefFin } = await supabase
        .from('pessoas')
        .update({ responsavel_cobranca_id: responsavelFinanceiroId })
        .eq('id', responsavelFinanceiroId);

      if (errorAutoRefFin) {
        console.error(
          '❌ [STEP 4.1] Erro ao atualizar auto-referência financeiro:',
          errorAutoRefFin
        );
        throw new Error(
          'Erro ao atualizar auto-referência do responsável financeiro'
        );
      }
      console.log('✅ [STEP 4.1] Auto-referência financeiro atualizada');
    } else {
      throw new Error('Dados do responsável financeiro não fornecidos');
    }

    // ============================================
    // STEP 5: Criar ou Usar PEDIATRA
    // ============================================
    console.log('📋 [STEP 5] Processando pediatra...');
    let pediatraId: string | null = null;

    // AI dev note: "Não Informado" é resposta afirmativa do responsável (a criança
    // não tem pediatra, só posto de saúde) — precisa virar vínculo, não ausência.
    // O que estava errado era criar uma pessoa NOVA a cada cadastro; agora cai no
    // mesmo lookup por nome e reutiliza o registro canônico único.
    const nomeAlvo = data.pediatra.noPediatrician
      ? PEDIATRA_NAO_INFORMADO
      : data.pediatra.nome;
    const nomeNormalizado = normalizarNomePediatra(nomeAlvo);

    // AI dev note: chamado duas vezes — no lookup inicial e de novo se o insert
    // colidir com o índice único (corrida com outro cadastro simultâneo).
    // Volume baixo (~300), filtro em memória porque o PostgREST não compara sem acento.
    const buscarPediatraExistente = async (): Promise<string | null> => {
      const { data: candidatos, error: errorBusca } = await supabase
        .from('pessoas')
        .select('id, nome, pessoa_pediatra!inner(id, ativo)')
        .eq('ativo', true)
        .eq('pessoa_pediatra.ativo', true)
        // Ordem fixa: o match cai sempre no registro mais antigo (o canônico)
        .order('created_at', { ascending: true });

      if (errorBusca) {
        // Não aborta o cadastro: segue para o fluxo de criação
        console.error(
          '⚠️ [STEP 5] Erro ao buscar pediatras existentes:',
          errorBusca
        );
        return null;
      }

      const achado = (candidatos || []).find(
        (p) => normalizarNomePediatra(p.nome) === nomeNormalizado
      );

      if (!achado) return null;

      const vinculo = Array.isArray(achado.pessoa_pediatra)
        ? achado.pessoa_pediatra[0]
        : achado.pessoa_pediatra;

      console.log(
        '✅ [STEP 5] Pediatra já cadastrado, reutilizando:',
        achado.nome,
        vinculo.id
      );
      return vinculo.id;
    };

    if (data.pediatra.id) {
      // Usar pediatra existente
      pediatraId = data.pediatra.id;
      console.log('✅ [STEP 5] Usando pediatra existente:', pediatraId);
    } else {
      // AI dev note: procurar antes de criar. O front só manda id quando o usuário
      // CLICA na sugestão; digitando o nome inteiro vinha sem id e duplicava
      // (9x "Flavia Querubim" acumuladas até jul/2026).
      console.log(
        '🔍 [STEP 5] Procurando pediatra existente:',
        nomeNormalizado
      );
      pediatraId = await buscarPediatraExistente();
    }

    if (!pediatraId) {
      // Criar novo pediatra
      console.log('📋 [STEP 5] Criando novo pediatra...');
      console.log('📋 [STEP 5] Nome:', nomeAlvo);
      console.log('📋 [STEP 5] CRM:', data.pediatra.crm || 'não fornecido');

      // Buscar tipo 'medico' para pediatra
      const { data: tipoPediatra, error: errorTipoPediatra } = await supabase
        .from('pessoa_tipos')
        .select('id')
        .eq('codigo', 'medico')
        .single();

      if (errorTipoPediatra || !tipoPediatra) {
        console.error(
          '❌ [STEP 5] Erro ao buscar tipo médico/pediatra:',
          errorTipoPediatra
        );
        throw new Error(
          'Tipo de pessoa "medico" (Médico Pediatra) não encontrado'
        );
      }

      // Criar pessoa do tipo médico
      // AI dev note: grava o nome limpo (sem prefixo Dr./Dra., sem espaço duplicado)
      // preservando a capitalização — assim o lookup acima casa nos próximos cadastros
      const nomeParaGravar = nomeAlvo
        .trim()
        .replace(/^(dr|dra)(\.\s*|\s+)/i, '')
        .replace(/\s+/g, ' ');

      const tempPedId = crypto.randomUUID();
      const { data: novoPediatra, error: errorPediatra } = await supabase
        .from('pessoas')
        .insert({
          id: tempPedId,
          nome: nomeParaGravar,
          id_tipo_pessoa: tipoPediatra.id,
          responsavel_cobranca_id: tempPedId, // Auto-referência
          ativo: true,
        })
        .select('id')
        .single();

      if (errorPediatra || !novoPediatra) {
        // AI dev note: o índice idx_pessoas_pediatra_nome_unico barra duplicata por
        // nome. Cair aqui com 23505 significa corrida: outro cadastro simultâneo
        // criou este mesmo pediatra entre o lookup acima e este insert. Reaproveita
        // o registro dele em vez de derrubar o cadastro do paciente inteiro.
        if (errorPediatra?.code === '23505') {
          console.log(
            '🔁 [STEP 5] Pediatra criado em paralelo, refazendo busca:',
            nomeNormalizado
          );
          pediatraId = await buscarPediatraExistente();
        }

        if (!pediatraId) {
          console.error(
            '❌ [STEP 5] Erro ao criar pessoa pediatra:',
            errorPediatra
          );
          throw new Error('Erro ao criar pediatra');
        }
      } else {
        // Só entra aqui quando a pessoa foi realmente criada. Se a corrida acima
        // resolveu o pediatraId, não há pessoa nova para vincular.
        const pediatraPessoaId = novoPediatra.id;
        console.log('✅ [STEP 5] Pessoa pediatra criada:', pediatraPessoaId);

        // Criar registro na tabela pessoa_pediatra
        console.log('📋 [STEP 5] Criando registro pessoa_pediatra...');
        const { data: pessoaPediatra, error: errorPessoaPediatra } =
          await supabase
            .from('pessoa_pediatra')
            .insert({
              pessoa_id: pediatraPessoaId,
              crm: data.pediatra.crm || null,
              especialidade: 'Pediatria',
              ativo: true,
            })
            .select('id')
            .single();

        if (errorPessoaPediatra || !pessoaPediatra) {
          console.error(
            '❌ [STEP 5] Erro ao criar pessoa_pediatra:',
            errorPessoaPediatra
          );

          // AI dev note: estes 2 inserts não são atômicos (não é RPC). Sem desfazer o
          // primeiro, a pessoa fica órfã: existe como médico mas sem pessoa_pediatra,
          // então nunca aparece no autocomplete e nunca é reaproveitada — só engorda a
          // lista. Foi assim que 20 registros vazaram entre set/2025 e jan/2026.
          const { error: errorRollback } = await supabase
            .from('pessoas')
            .delete()
            .eq('id', pediatraPessoaId);

          if (errorRollback) {
            console.error(
              '⚠️ [STEP 5] Falha ao desfazer a pessoa órfã:',
              pediatraPessoaId,
              errorRollback
            );
          } else {
            console.log('↩️ [STEP 5] Pessoa órfã removida:', pediatraPessoaId);
          }

          throw new Error('Erro ao criar registro de pediatra');
        }

        pediatraId = pessoaPediatra.id;
        console.log('✅ [STEP 5] Registro pessoa_pediatra criado:', pediatraId);
      }
    }

    // ============================================
    // STEP 6: Criar PACIENTE
    // ============================================
    console.log('📋 [STEP 6] Criando ou reutilizando paciente...');

    // AI dev note: Data já vem no formato ISO do frontend
    const pacienteNome = data.paciente.nome.trim();
    const dataNascimentoISO = data.paciente.dataNascimento;
    const cpfPaciente = cleanCPF(data.paciente.cpf);
    const emitirNotaNomePaciente =
      data.paciente.emitirNotaNomePaciente === true;

    if (emitirNotaNomePaciente && !cpfPaciente) {
      throw new Error(
        'CPF do paciente é obrigatório para emissão de nota fiscal no nome do paciente'
      );
    }

    console.log('📋 [STEP 6] Dados:', {
      nome: pacienteNome,
      dataNascimento: data.paciente.dataNascimento,
      sexo: data.paciente.sexo,
      cpf: cpfPaciente || 'não fornecido',
      emitirNotaNomePaciente,
    });

    // AI dev note: emitirNotaNomePaciente altera apenas o tomador fiscal.
    // Quando true, grava pessoas.tomador_nfe_id = paciente (Asaas/NFe usam o CPF da
    // criança), enquanto responsavel_cobranca_id permanece no responsável financeiro
    // (pagador). pessoa_responsaveis segue representando os vínculos legal/financeiro.
    // AI dev note: A validação inicial do cadastro é por WhatsApp/responsável.
    // A constraint pessoas_nome_responsavel_unique_when_active é a garantia final
    // no banco; por isso o backend precisa ser idempotente aqui para retries.
    // AI dev note: responsavel_cobranca_id agora é SEMPRE o responsável financeiro
    // (pagador). O tomador da nota é separado (tomador_nfe_id), então a busca de
    // paciente existente usa o mesmo critério (nome + financeiro) para os dois casos
    // — casa com a constraint pessoas_nome_responsavel_unique_when_active.
    const { data: pacienteExistente, error: errorPacienteExistente } =
      await supabase
        .from('pessoas')
        .select('id')
        .eq('id_tipo_pessoa', tipoPaciente.id)
        .eq('ativo', true)
        .eq('responsavel_cobranca_id', responsavelFinanceiroId)
        .eq('nome', pacienteNome)
        .limit(1)
        .maybeSingle();

    if (errorPacienteExistente) {
      console.error(
        '❌ [STEP 6] Erro ao buscar paciente existente:',
        errorPacienteExistente
      );
      throw new Error('Erro ao verificar paciente existente');
    }

    let pacienteId: string;

    if (pacienteExistente) {
      pacienteId = pacienteExistente.id;
      console.log('✅ [STEP 6] Paciente já existe (reutilizando):', pacienteId);

      if (emitirNotaNomePaciente) {
        // AI dev note: tomador fiscal separado do pagador — grava tomador_nfe_id =
        // paciente e mantém responsavel_cobranca_id no responsável financeiro.
        const { error: errorUpdateTomadorPaciente } = await supabase
          .from('pessoas')
          .update({
            cpf_cnpj: cpfPaciente,
            tomador_nfe_id: pacienteId,
            responsavel_cobranca_id: responsavelFinanceiroId,
          })
          .eq('id', pacienteId);

        if (errorUpdateTomadorPaciente) {
          console.error(
            '❌ [STEP 6] Erro ao atualizar tomador fiscal do paciente:',
            errorUpdateTomadorPaciente
          );
          throw new Error('Erro ao definir tomador fiscal do paciente');
        }
        console.log('✅ [STEP 6] Paciente definido como tomador fiscal');
      }
    } else {
      const novoPacienteId = crypto.randomUUID();

      const { data: novoPaciente, error: errorPaciente } = await supabase
        .from('pessoas')
        .insert({
          id: novoPacienteId,
          nome: pacienteNome,
          data_nascimento: dataNascimentoISO,
          sexo: data.paciente.sexo,
          cpf_cnpj: cpfPaciente,
          id_tipo_pessoa: tipoPaciente.id,
          id_endereco: enderecoId,
          numero_endereco: data.endereco.numero,
          complemento_endereco: data.endereco.complemento || null,
          // AI dev note: pagador = responsável financeiro; tomador da nota é separado
          responsavel_cobranca_id: responsavelFinanceiroId,
          tomador_nfe_id: emitirNotaNomePaciente ? novoPacienteId : null,
          autorizacao_uso_cientifico: data.autorizacoes.usoCientifico,
          autorizacao_uso_redes_sociais: data.autorizacoes.usoRedesSociais,
          autorizacao_uso_do_nome: data.autorizacoes.usoNome,
          ativo: true,
        })
        .select('id')
        .single();

      if (errorPaciente || !novoPaciente) {
        console.error('❌ [STEP 6] Erro ao criar paciente:', errorPaciente);

        if (errorPaciente?.code === '23505') {
          const { data: pacienteCriadoEmRetry } = await supabase
            .from('pessoas')
            .select('id')
            .eq('id_tipo_pessoa', tipoPaciente.id)
            .eq('ativo', true)
            .eq('responsavel_cobranca_id', responsavelFinanceiroId)
            .ilike('nome', pacienteNome)
            .limit(1)
            .maybeSingle();

          if (pacienteCriadoEmRetry) {
            pacienteId = pacienteCriadoEmRetry.id;
            console.log(
              '✅ [STEP 6] Paciente encontrado após conflito de retry:',
              pacienteId
            );

            if (emitirNotaNomePaciente) {
              const { error: errorUpdateRetryTomador } = await supabase
                .from('pessoas')
                .update({ cpf_cnpj: cpfPaciente, tomador_nfe_id: pacienteId })
                .eq('id', pacienteId);

              if (errorUpdateRetryTomador) {
                console.error(
                  '❌ [STEP 6] Erro ao atualizar tomador fiscal após retry:',
                  errorUpdateRetryTomador
                );
                throw new Error('Erro ao definir tomador fiscal do paciente');
              }
            }
          } else {
            const detalhes = errorPaciente?.message || 'Erro desconhecido';
            throw new Error(`Erro ao criar paciente: ${detalhes}`);
          }
        } else {
          const detalhes = errorPaciente?.message || 'Erro desconhecido';
          throw new Error(`Erro ao criar paciente: ${detalhes}`);
        }
      } else {
        pacienteId = novoPaciente.id;
        console.log('✅ [STEP 6] Paciente criado:', pacienteId);
      }
    }

    console.log('✅ [STEP 6] Paciente resolvido:', pacienteId);

    const ensureResponsavelRelationship = async (
      idResponsavel: string,
      tipoResponsabilidade: 'ambos' | 'legal' | 'financeiro',
      label: string
    ) => {
      const { data: relExistente, error: errorRelSearch } = await supabase
        .from('pessoa_responsaveis')
        .select('id, tipo_responsabilidade')
        .eq('id_pessoa', pacienteId)
        .eq('id_responsavel', idResponsavel)
        .eq('ativo', true)
        .limit(1)
        .maybeSingle();

      if (errorRelSearch) {
        console.error(
          `❌ [STEP 7/8] Erro ao verificar relacionamento ${label}:`,
          errorRelSearch
        );
        throw new Error(`Erro ao verificar relacionamento ${label}`);
      }

      if (relExistente) {
        console.log(
          `✅ [STEP 7/8] Relacionamento ${label} já existe (reutilizando):`,
          relExistente.id
        );
        return;
      }

      const { error: errorRelInsert } = await supabase
        .from('pessoa_responsaveis')
        .insert({
          id_pessoa: pacienteId,
          id_responsavel: idResponsavel,
          tipo_responsabilidade: tipoResponsabilidade,
          ativo: true,
        });

      if (errorRelInsert) {
        console.error(
          `❌ [STEP 7/8] Erro ao criar relacionamento ${label}:`,
          errorRelInsert
        );
        throw new Error(`Erro ao criar relacionamento ${label}`);
      }

      console.log(`✅ [STEP 7/8] Relacionamento ${label} criado`);
    };

    // ============================================
    // STEP 7/8: Criar relacionamentos paciente ↔ responsáveis
    // ============================================
    if (responsavelFinanceiroId === responsavelLegalId) {
      // Mesma pessoa é responsável legal E financeiro
      console.log(
        '📋 [STEP 7] Criando relacionamento paciente ↔ responsável (legal e financeiro)...'
      );
      await ensureResponsavelRelationship(
        responsavelLegalId,
        'ambos',
        'com responsável'
      );
    } else {
      // Pessoas diferentes para responsável legal e financeiro
      console.log(
        '📋 [STEP 7] Criando relacionamento paciente ↔ responsável legal...'
      );
      await ensureResponsavelRelationship(
        responsavelLegalId,
        'legal',
        'com responsável legal'
      );

      console.log(
        '📋 [STEP 8] Criando relacionamento paciente ↔ responsável financeiro...'
      );
      await ensureResponsavelRelationship(
        responsavelFinanceiroId,
        'financeiro',
        'com responsável financeiro'
      );
    }

    // ============================================
    // STEP 9: Criar relacionamento paciente ↔ pediatra
    // ============================================
    console.log('📋 [STEP 9] Criando relacionamento paciente ↔ pediatra...');
    if (!pediatraId) {
      // AI dev note: inalcançável — STEP 5 sempre resolve um pediatraId (reutilizado
      // ou criado, inclusive o "Não Informado"). Guarda só para não inserir nulo.
      console.error('❌ [STEP 9] pediatraId não resolvido no STEP 5');
      throw new Error('Erro ao resolver pediatra do paciente');
    } else {
      const { data: relPediatraExistente, error: errorRelPediatraSearch } =
        await supabase
          .from('paciente_pediatra')
          .select('id')
          .eq('paciente_id', pacienteId)
          .eq('pediatra_id', pediatraId)
          .eq('ativo', true)
          .limit(1)
          .maybeSingle();

      if (errorRelPediatraSearch) {
        console.error(
          '❌ [STEP 9] Erro ao verificar relacionamento pediatra:',
          errorRelPediatraSearch
        );
        throw new Error('Erro ao verificar relacionamento com pediatra');
      }

      if (relPediatraExistente) {
        console.log(
          '✅ [STEP 9] Relacionamento pediatra já existe (reutilizando):',
          relPediatraExistente.id
        );
      } else {
        const { error: errorRelPediatra } = await supabase
          .from('paciente_pediatra')
          .insert({
            paciente_id: pacienteId,
            pediatra_id: pediatraId,
            ativo: true,
          });

        if (errorRelPediatra) {
          console.error(
            '❌ [STEP 9] Erro ao criar relacionamento pediatra:',
            errorRelPediatra
          );
          throw new Error('Erro ao criar relacionamento com pediatra');
        }
        console.log('✅ [STEP 9] Relacionamento pediatra criado');
      }
    }

    // ============================================
    // STEP 10: Criar ou reutilizar contrato
    // ============================================
    console.log('📋 [STEP 10] Criando ou reutilizando contrato...');
    console.log(
      '📋 [STEP 10] Responsável Financeiro ID:',
      responsavelFinanceiroId
    );
    console.log('📋 [STEP 10] Paciente ID:', pacienteId);

    const nomeContrato = `Contrato Respira Kids - ${pacienteNome}`;
    let contratoId: string;
    let contratoCriadoAgora = false;

    // AI dev note: o contrato é DO PACIENTE — pessoa_id = pacienteId (não o responsável).
    // Um responsável pode ter vários pacientes; gravar sob o responsável tornava
    // impossível saber a qual filho o contrato pertence e quebrava as checagens de
    // "tem contrato assinado?" (app/n8n/link_contrato), que usam o id do paciente.
    const { data: contratoExistente, error: errorContratoExistente } =
      await supabase
        .from('user_contracts')
        .select('id, status_contrato')
        .eq('pessoa_id', pacienteId)
        .eq('nome_contrato', nomeContrato)
        .eq('ativo', true)
        .in('status_contrato', ['gerado', 'assinado'])
        .order('data_geracao', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (errorContratoExistente) {
      console.error(
        '❌ [STEP 10] Erro ao buscar contrato existente:',
        errorContratoExistente
      );
      throw new Error('Erro ao verificar contrato existente');
    }

    if (contratoExistente) {
      contratoId = contratoExistente.id;
      console.log(
        '✅ [STEP 10] Contrato já existe (reutilizando):',
        contratoId
      );
    } else {
      // Buscar template de contrato ativo
      const { data: template, error: errorTemplate } = await supabase
        .from('contract_templates')
        .select('id, nome, conteudo_template')
        .eq('ativo', true)
        .order('versao', { ascending: false })
        .limit(1)
        .single();

      if (errorTemplate || !template) {
        console.error('❌ [STEP 10] Erro ao buscar template:', errorTemplate);
        throw new Error('Template de contrato não encontrado');
      }

      console.log('✅ [STEP 10] Template encontrado:', template.nome);

      // Substituir variáveis no template
      let conteudoFinal = template.conteudo_template;
      Object.entries(data.contractVariables).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        conteudoFinal = conteudoFinal.replace(regex, value ?? '');
      });

      console.log('✅ [STEP 10] Variáveis substituídas no contrato');

      // AI dev note: Contrato criado com status 'gerado' (aguardando assinatura via n8n/Assinafy)
      // data_assinatura permanece NULL e é preenchida quando n8n confirmar a assinatura
      // arquivo_url será atualizado abaixo com o caminho no bucket após upload do PDF
      const { data: contrato, error: errorContrato } = await supabase
        .from('user_contracts')
        .insert({
          contract_template_id: template.id,
          pessoa_id: pacienteId,
          nome_contrato: nomeContrato,
          conteudo_final: conteudoFinal,
          variaveis_utilizadas: data.contractVariables,
          status_contrato: 'gerado',
          data_geracao: new Date().toISOString(),
          arquivo_url: 'Aguardando',
          ativo: true,
        })
        .select('id')
        .single();

      if (errorContrato || !contrato) {
        console.error('❌ [STEP 10] Erro ao criar contrato:', errorContrato);
        throw new Error('Erro ao criar contrato');
      }

      contratoId = contrato.id;
      contratoCriadoAgora = true;
      console.log(
        '✅ [STEP 10] Contrato criado (aguardando assinatura):',
        contratoId
      );
    }

    // ============================================
    // STEP 10.1: Gerar PDF, fazer upload no bucket e enfileirar webhook
    // ============================================
    // AI dev note: Chama edge function generate-contract-pdf para renderizar o PDF,
    // faz upload em respira-contracts/{pessoa_id}/{contract_id}.pdf,
    // gera signed URL de 24h e enfileira evento 'contrato_gerado' em webhook_queue
    // para que o n8n processe a assinatura via Assinafy.
    if (contratoCriadoAgora) {
      console.log('📋 [STEP 10.1] Gerando PDF do contrato...');

      let pdfSignedUrl: string | null = null;
      const PDF_URL_EXPIRES_IN = 60 * 60 * 24; // 24 horas
      // AI dev note: caminho do bucket usa o id do PACIENTE (pessoa_id do contrato).
      const pdfStoragePath = `${pacienteId}/${contratoId}.pdf`;

      try {
        const pdfResponse = await fetch(
          `${supabaseUrl}/functions/v1/generate-contract-pdf`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${supabaseServiceKey}`,
              apikey: supabaseServiceKey,
            },
            body: JSON.stringify({
              contractId: contratoId,
              patientName: pacienteNome,
            }),
          }
        );

        if (!pdfResponse.ok) {
          const errText = await pdfResponse.text();
          throw new Error(
            `generate-contract-pdf retornou ${pdfResponse.status}: ${errText}`
          );
        }

        const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
        console.log('✅ [STEP 10.1] PDF gerado:', pdfBytes.length, 'bytes');

        // Upload no bucket (usa upsert para permitir regeração/reenvio)
        const { error: uploadError } = await supabase.storage
          .from('respira-contracts')
          .upload(pdfStoragePath, pdfBytes, {
            contentType: 'application/pdf',
            upsert: true,
          });

        if (uploadError) {
          console.error(
            '❌ [STEP 10.1] Erro ao fazer upload do PDF:',
            uploadError
          );
          throw new Error(`Upload do PDF falhou: ${uploadError.message}`);
        }
        console.log('✅ [STEP 10.1] PDF enviado ao bucket:', pdfStoragePath);

        // Gerar signed URL com 24h de validade para o n8n baixar
        const { data: signedData, error: signedError } = await supabase.storage
          .from('respira-contracts')
          .createSignedUrl(pdfStoragePath, PDF_URL_EXPIRES_IN);

        if (signedError || !signedData?.signedUrl) {
          console.error(
            '❌ [STEP 10.1] Erro ao gerar signed URL:',
            signedError
          );
          throw new Error(
            `Signed URL falhou: ${signedError?.message || 'sem URL'}`
          );
        }

        pdfSignedUrl = signedData.signedUrl;
        console.log('✅ [STEP 10.1] Signed URL gerada (24h)');

        // AI dev note: NÃO sobrescrever arquivo_url aqui. Mantemos 'Aguardando'
        // enquanto o contrato não foi assinado. Quando o n8n confirmar a assinatura,
        // ele atualiza arquivo_url com o caminho do bucket (o mesmo usado neste upload,
        // que será substituído pelo PDF assinado via x-upsert: true).

        // Enfileirar webhook contrato_gerado para o n8n processar assinatura
        // AI dev note: payload segue o MESMO padrão do webhook `appointment_updated`
        // (gerado por trigger no banco): tudo encapsulado em `data`, com `tipo`,
        // `timestamp` e `webhook_id` no mesmo nível das demais entidades dentro de `data`.
        // Não inclua nenhum campo específico de provedor de assinatura (Assinafy etc.).
        const responsavelNome =
          data.responsavelLegal?.nome || data.existingUserData?.nome || '';
        const responsavelEmail =
          data.responsavelLegal?.email || data.existingUserData?.email || '';
        const responsavelTelefone = data.whatsappJid
          ? extractPhoneFromJid(data.whatsappJid)
          : data.phoneNumber;

        const contratoTimestamp = new Date().toISOString();
        const contratoWebhookId = crypto.randomUUID();

        const { error: queueError } = await supabase
          .from('webhook_queue')
          .insert({
            evento: 'contrato_gerado',
            payload: {
              data: {
                id: contratoId,
                ativo: true,
                nome_contrato: nomeContrato,
                status_contrato: 'gerado',
                data_geracao: contratoTimestamp,
                data_assinatura: null,
                paciente: {
                  id: pacienteId,
                  nome: pacienteNome,
                  ativo: true,
                  email: null,
                  telefone: null,
                },
                responsavel_legal: {
                  id: responsavelFinanceiroId,
                  nome: responsavelNome,
                  email: responsavelEmail,
                  telefone: responsavelTelefone,
                },
                responsavel_financeiro: {
                  id: responsavelFinanceiroId,
                  nome: responsavelNome,
                },
                pdf: {
                  signed_url: pdfSignedUrl,
                  expires_in_seconds: PDF_URL_EXPIRES_IN,
                  storage_path: pdfStoragePath,
                },
                reenvio: false,
                tipo: 'contrato_gerado',
                timestamp: contratoTimestamp,
                webhook_id: contratoWebhookId,
              },
            },
            status: 'pendente',
            tentativas: 0,
            max_tentativas: 3,
          });

        if (queueError) {
          console.error(
            '❌ [STEP 10.1] Erro ao enfileirar webhook contrato_gerado:',
            queueError
          );
        } else {
          console.log(
            '✅ [STEP 10.1] Webhook contrato_gerado enfileirado para n8n'
          );
        }
      } catch (pdfError) {
        console.error(
          '❌ [STEP 10.1] Erro ao processar PDF/webhook do contrato:',
          pdfError
        );
        // AI dev note: Falha na geração de PDF não deve quebrar o cadastro.
        // O contrato foi criado no banco e poderá ser reenviado manualmente pelo admin.
      }
    } else {
      console.log(
        '⏭️ [STEP 10.1] Contrato já existia; PDF/webhook não reenfileirados'
      );
    }

    // ============================================
    // STEP 11: Enviar webhook de confirmação (opcional)
    // ============================================
    console.log('📋 [STEP 11] Enviando webhook de confirmação...');
    const webhookUrl = Deno.env.get('REGISTRATION_WEBHOOK_URL');

    if (webhookUrl) {
      try {
        // AI dev note: Incluir dados formatados no payload para evitar problemas de timezone
        // no sistema externo (n8n) ao formatar datas
        const webhookResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'patient_registered',
            pacienteId,
            responsavelLegalId,
            responsavelFinanceiroId,
            contratoId: contratoId,
            timestamp: new Date().toISOString(),
            // Dados extras já formatados para evitar problemas de timezone
            paciente: {
              nome: pacienteNome,
              dataNascimento: data.paciente.dataNascimento, // ISO: YYYY-MM-DD
              dataNascimentoFormatada: formatDateBR(
                data.paciente.dataNascimento
              ), // BR: DD/MM/YYYY
              sexo: data.paciente.sexo,
            },
            responsavelLegal: {
              nome:
                data.responsavelLegal?.nome ||
                data.existingUserData?.nome ||
                '',
            },
            whatsappJid: data.whatsappJid,
            phoneNumber: data.phoneNumber,
          }),
        });

        if (!webhookResponse.ok) {
          console.warn(
            '⚠️ [STEP 11] Webhook retornou erro:',
            webhookResponse.status
          );
        } else {
          console.log('✅ [STEP 11] Webhook enviado com sucesso');
        }
      } catch (webhookError) {
        console.error('⚠️ [STEP 11] Erro ao enviar webhook:', webhookError);
        // Não falhar o cadastro por erro no webhook
      }
    } else {
      console.log('⏭️ [STEP 11] Webhook não configurado');
    }

    // ============================================
    // FINALIZAÇÃO
    // ============================================
    console.log('🎉 [FINALIZAÇÃO] Cadastro concluído com sucesso!');
    console.log('📋 [FINALIZAÇÃO] IDs criados:', {
      pacienteId,
      responsavelLegalId,
      responsavelFinanceiroId,
      contratoId: contratoId,
    });

    const result = {
      success: true,
      pacienteId,
      responsavelLegalId,
      responsavelFinanceiroId,
      contratoId: contratoId,
      message: 'Cadastro realizado com sucesso!',
    };

    // Salvar log de sucesso
    try {
      await supabase.from('public_registration_api_logs').insert({
        session_id: sessionId,
        http_status: 200,
        duration_ms: Date.now() - startTime,
        edge_function_version: 45, // AI dev note: Incrementar versão
        paciente_id: pacienteId,
        responsavel_legal_id: responsavelLegalId,
        responsavel_financeiro_id: responsavelFinanceiroId,
        contrato_id: contratoId,
      });
    } catch (logError) {
      console.warn('⚠️ [LOGGING] Erro ao salvar log (ignorado):', logError);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('❌ [ERROR] Erro fatal no cadastro:', error);
    console.error(
      '❌ [ERROR] Stack trace:',
      error instanceof Error ? error.stack : 'N/A'
    );
    console.error('❌ [ERROR] Tipo do erro:', typeof error);
    console.error(
      '❌ [ERROR] Error completo:',
      JSON.stringify(error, Object.getOwnPropertyNames(error))
    );

    const result = {
      success: false,
      error:
        error instanceof Error
          ? `${error.message}\n\nStack: ${error.stack}`
          : String(error),
    };

    // Salvar log de erro
    try {
      await supabase.from('public_registration_api_logs').insert({
        session_id: sessionId,
        http_status: 500,
        duration_ms: Date.now() - startTime,
        edge_function_version: 43, // AI dev note: Incrementar versão
        error_type: 'database_error',
        error_details: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
    } catch (logError) {
      console.warn(
        '⚠️ [LOGGING] Erro ao salvar log de erro (ignorado):',
        logError
      );
    }

    // Inserir na fila de webhook para notificar erro
    try {
      await supabase.from('webhook_queue').insert({
        evento: 'registration_error',
        payload: {
          tipo: 'registration_error',
          session_id: sessionId,
          timestamp: new Date().toISOString(),
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
          metadata: {
            ip_address: req.headers.get('x-forwarded-for'),
            user_agent: req.headers.get('user-agent'),
            edge_function_version: 43,
          },
        },
        status: 'pendente',
        tentativas: 0,
        max_tentativas: 3,
      });
    } catch (webhookError) {
      console.warn(
        '⚠️ [WEBHOOK] Erro ao inserir webhook de erro (ignorado):',
        webhookError
      );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
