// AI dev note: Geração de descrições de cobranças para ASAAS
// Módulo centralizado para garantir consistência entre criação e edição de faturas

import { supabase } from '@/lib/supabase';
import { parseSupabaseDatetime } from './calendar-mappers';

export interface ConsultationData {
  id: string;
  data_hora: string;
  servico_nome: string;
  valor_servico: number;
  profissional_nome: string;
  profissional_id?: string;
  tipo_servico_id?: string;
}

export interface PatientData {
  nome: string;
  cpf_cnpj: string;
}

// AI dev note: Gera descrição da cobrança baseada no template especificado
export async function generateChargeDescription(
  consultationData: ConsultationData[],
  patientData: PatientData
): Promise<string> {
  console.log('🎯 Gerando descrição da cobrança:', {
    consultationsCount: consultationData.length,
    patientData: patientData,
  });

  // Buscar dados completos dos tipos de serviço para obter as descrições
  const serviceIds = consultationData
    .map((consultation) => consultation.tipo_servico_id)
    .filter((id) => id);

  let serviceDescriptions: Record<string, string> = {};

  if (serviceIds.length > 0) {
    const { data: serviceData, error: serviceError } = await supabase
      .from('tipo_servicos')
      .select('id, nome, descricao')
      .in('id', serviceIds);

    if (!serviceError && serviceData) {
      serviceDescriptions = serviceData.reduce(
        (acc, service) => {
          acc[service.nome] = service.descricao || service.nome;
          return acc;
        },
        {} as Record<string, string>
      );
    }
  }

  // Agrupar consultas por tipo de serviço
  const serviceGroups = consultationData.reduce(
    (groups: Record<string, ConsultationData[]>, consultation) => {
      const serviceType = consultation.servico_nome || 'Atendimento';
      if (!groups[serviceType]) {
        groups[serviceType] = [];
      }
      groups[serviceType].push(consultation);
      return groups;
    },
    {}
  );

  console.log('📋 Grupos de serviços:', serviceGroups);

  // AI dev note: Construir descrição dos serviços com plural correto
  const serviceDescriptionTexts = Object.entries(serviceGroups).map(
    ([serviceType, consultations]) => {
      const count = consultations.length;
      const serviceDescription =
        serviceDescriptions[serviceType] || serviceType.toLowerCase();

      // Determinar o tipo base e aplicar plural adequadamente
      let finalDescription = serviceDescription;

      if (count > 1) {
        // Aplicar plural conforme tipo de serviço
        if (serviceDescription.toLowerCase().includes('sessão')) {
          finalDescription = serviceDescription.replace(/sessão/gi, 'sessões');
        } else if (serviceDescription.toLowerCase().includes('consulta')) {
          finalDescription = serviceDescription.replace(
            /consulta/gi,
            'consultas'
          );
        } else if (serviceDescription.toLowerCase().includes('avaliação')) {
          finalDescription = serviceDescription.replace(
            /avaliação/gi,
            'avaliações'
          );
        }
      }

      return count === 1
        ? `1 ${finalDescription}`
        : `${count} ${finalDescription}`;
    }
  );

  const servicesText = serviceDescriptionTexts.join('. ');

  // Buscar dados completos do profissional da primeira consulta
  const firstConsultation = consultationData[0];
  const profissionalNome =
    firstConsultation?.profissional_nome || 'Profissional';

  let profissionalCpf = '';
  let profissionalRegistro = '';
  let profissionalTipo = 'fisioterapeuta'; // Default para respira kids

  // Buscar CPF e registro do profissional no banco
  if (firstConsultation.profissional_id) {
    console.log(
      '🔍 Buscando dados completos do profissional:',
      firstConsultation.profissional_id
    );

    try {
      const { data: profissionalData, error: profissionalError } =
        await supabase
          .from('pessoas')
          .select('cpf_cnpj, registro_profissional, especialidade')
          .eq('id', firstConsultation.profissional_id)
          .single();

      if (!profissionalError && profissionalData) {
        profissionalCpf = profissionalData.cpf_cnpj || '';
        profissionalRegistro = profissionalData.registro_profissional || '';
        // Determinar tipo profissional baseado na especialidade ou manter default
        if (
          profissionalData.especialidade
            ?.toLowerCase()
            .includes('fisioterapeuta')
        ) {
          profissionalTipo = 'fisioterapeuta';
        }
        console.log('✅ Dados do profissional encontrados:', {
          profissionalCpf,
          profissionalRegistro,
          profissionalTipo,
        });
      } else {
        console.warn(
          '⚠️ Erro ao buscar dados do profissional:',
          profissionalError
        );
      }
    } catch (error) {
      console.error('❌ Erro na busca do profissional:', error);
    }
  }

  // Dados do paciente
  const pacienteNome = patientData?.nome || 'Paciente';
  const pacienteCpf = patientData?.cpf_cnpj || 'Não Informado';

  console.log('👨‍⚕️ Dados do profissional:', {
    profissionalNome,
    profissionalCpf,
    profissionalRegistro,
    profissionalTipo,
  });
  console.log('👤 Dados do paciente:', { pacienteNome, pacienteCpf });

  // Construir lista de datas e valores formatadas adequadamente
  // AI dev note: Ordenar consultas cronologicamente antes de gerar descrição
  const sortedConsultations = [...consultationData].sort(
    (a, b) =>
      parseSupabaseDatetime(a.data_hora).getTime() -
      parseSupabaseDatetime(b.data_hora).getTime()
  );

  const datesAndValuesArray = sortedConsultations.map((consultation) => {
    const date = parseSupabaseDatetime(consultation.data_hora);
    const formattedDate = date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const valueNumber = Number(consultation.valor_servico || 0);
    const formattedValue = valueNumber.toFixed(2).replace('.', ',');
    const value = `R$ ${formattedValue}`;
    return `${formattedDate} (${value})`;
  });

  // AI dev note: Unir datas com vírgula e substituir a última por " e " sem afetar valores monetários
  const datesAndValues =
    datesAndValuesArray.length > 1
      ? datesAndValuesArray.slice(0, -1).join(', ') +
        ' e ' +
        datesAndValuesArray[datesAndValuesArray.length - 1]
      : datesAndValuesArray[0] || '';

  // Template conforme especificado no formato exato
  const registroText = profissionalRegistro ? ` ${profissionalRegistro}` : '';
  const description = `${servicesText}. Atendimento realizado ao paciente ${pacienteNome} CPF ${pacienteCpf}, pela ${profissionalTipo} ${profissionalNome} CPF ${profissionalCpf}${registroText}. Nos dias ${datesAndValues}`;

  console.log('📝 Descrição gerada:', description);
  return description;
}
