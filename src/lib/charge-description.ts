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

interface ProfessionalData {
  nome: string;
  cpf: string;
  registro: string;
  tipo: string;
}

// AI dev note: Gera descrição da cobrança baseada no template especificado
// Agrupa por profissional quando há mais de um, mantendo formato legível
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

  // Buscar dados de todos os profissionais únicos
  const uniqueProfessionalIds = [
    ...new Set(
      consultationData
        .map((c) => c.profissional_id)
        .filter((id) => id) as string[]
    ),
  ];

  const professionalsDataMap = new Map<string, ProfessionalData>();

  if (uniqueProfessionalIds.length > 0) {
    const { data: professionalsData, error: professionalsError } =
      await supabase
        .from('pessoas')
        .select('id, cpf_cnpj, registro_profissional, especialidade')
        .in('id', uniqueProfessionalIds);

    if (!professionalsError && professionalsData) {
      professionalsData.forEach((prof) => {
        let profTipo = 'fisioterapeuta'; // Default
        if (prof.especialidade?.toLowerCase().includes('fisioterapeuta')) {
          profTipo = 'fisioterapeuta';
        }

        // Encontrar o nome do profissional nas consultas
        const consultationWithName = consultationData.find(
          (c) => c.profissional_id === prof.id
        );
        const profNome =
          consultationWithName?.profissional_nome || 'Profissional';

        professionalsDataMap.set(prof.id, {
          nome: profNome,
          cpf: prof.cpf_cnpj || '',
          registro: prof.registro_profissional || '',
          tipo: profTipo,
        });
      });
    }
  }

  console.log('👨‍⚕️ Dados dos profissionais carregados:', professionalsDataMap);

  // Agrupar consultas por profissional
  const professionalGroups = new Map<string, ConsultationData[]>();

  consultationData.forEach((consultation) => {
    const profId = consultation.profissional_id || 'sem-profissional';
    if (!professionalGroups.has(profId)) {
      professionalGroups.set(profId, []);
    }
    professionalGroups.get(profId)!.push(consultation);
  });

  console.log('📊 Consultas agrupadas por profissional:', professionalGroups);

  // Dados do paciente
  const pacienteNome = patientData?.nome || 'Paciente';
  const pacienteCpf = patientData?.cpf_cnpj || 'não informado';

  console.log('👤 Dados do paciente:', { pacienteNome, pacienteCpf });

  // Verificar se há mais de um profissional
  const hasManyProfessionals = professionalGroups.size > 1;

  if (hasManyProfessionals) {
    // FORMATO PARA MÚLTIPLOS PROFISSIONAIS
    const professionalDescriptions: string[] = [];

    professionalGroups.forEach((consultations, profId) => {
      const professionalData =
        professionalsDataMap.get(profId) ||
        ({
          nome: consultations[0]?.profissional_nome || 'Profissional',
          cpf: '',
          registro: '',
          tipo: 'fisioterapeuta',
        } as ProfessionalData);

      // Agrupar consultas deste profissional por tipo de serviço
      const serviceGroups = consultations.reduce(
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

      // Gerar descrição de cada serviço deste profissional
      const serviceDescriptionTexts = Object.entries(serviceGroups).map(
        ([serviceType, serviceConsultations]) => {
          const count = serviceConsultations.length;
          const serviceDescription =
            serviceDescriptions[serviceType] || serviceType.toLowerCase();

          // Determinar o tipo base e aplicar plural adequadamente
          let finalDescription = serviceDescription;

          if (count > 1) {
            // Aplicar plural conforme tipo de serviço
            if (serviceDescription.toLowerCase().includes('sessão')) {
              finalDescription = serviceDescription.replace(
                /sessão/gi,
                'sessões'
              );
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

      const servicesText = serviceDescriptionTexts.join(', ');

      // Ordenar consultas cronologicamente
      const sortedConsultations = [...consultations].sort(
        (a, b) =>
          parseSupabaseDatetime(a.data_hora).getTime() -
          parseSupabaseDatetime(b.data_hora).getTime()
      );

      // Construir lista de datas e valores
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

      // Unir datas com vírgula e substituir a última por " e "
      const datesAndValues =
        datesAndValuesArray.length > 1
          ? datesAndValuesArray.slice(0, -1).join(', ') +
            ' e ' +
            datesAndValuesArray[datesAndValuesArray.length - 1]
          : datesAndValuesArray[0] || '';

      // Determinar singular/plural para "dia(s)"
      const diaText = sortedConsultations.length === 1 ? 'dia' : 'dias';

      // Montar texto do registro com CREFITO
      const registroText = professionalData.registro
        ? `, CREFITO ${professionalData.registro}`
        : '';

      // Montar descrição para este profissional
      const profDescription = `${servicesText}, ${sortedConsultations.length === 1 ? 'realizada' : 'realizadas'} pel${professionalData.tipo === 'fisioterapeuta' ? 'a fisioterapeuta' : 'o profissional'} ${professionalData.nome}, CPF ${professionalData.cpf}${registroText}, no${sortedConsultations.length === 1 ? '' : 's'} ${diaText} ${datesAndValues}.`;

      professionalDescriptions.push(profDescription);
    });

    // Juntar todas as descrições e adicionar texto final
    const fullDescription =
      professionalDescriptions.join('\n') +
      `\nAtendimentos realizados ao paciente ${pacienteNome}, CPF ${pacienteCpf}.`;

    console.log(
      '📝 Descrição gerada (múltiplos profissionais):',
      fullDescription
    );
    return fullDescription;
  } else {
    // FORMATO PARA UM ÚNICO PROFISSIONAL (mesmo padrão de múltiplos profissionais)
    const profId = Array.from(professionalGroups.keys())[0];
    const consultations = professionalGroups.get(profId)!;

    const professionalData =
      professionalsDataMap.get(profId) ||
      ({
        nome: consultations[0]?.profissional_nome || 'Profissional',
        cpf: '',
        registro: '',
        tipo: 'fisioterapeuta',
      } as ProfessionalData);

    // Agrupar consultas por tipo de serviço
    const serviceGroups = consultations.reduce(
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

    // Gerar descrição de cada serviço (mesmo formato que múltiplos profissionais)
    const serviceDescriptionTexts = Object.entries(serviceGroups).map(
      ([serviceType, serviceConsultations]) => {
        const count = serviceConsultations.length;
        const serviceDescription =
          serviceDescriptions[serviceType] || serviceType.toLowerCase();

        // Determinar o tipo base e aplicar plural adequadamente
        let finalDescription = serviceDescription;

        if (count > 1) {
          // Aplicar plural conforme tipo de serviço
          if (serviceDescription.toLowerCase().includes('sessão')) {
            finalDescription = serviceDescription.replace(
              /sessão/gi,
              'sessões'
            );
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

    const servicesText = serviceDescriptionTexts.join(', ');

    // Ordenar consultas cronologicamente
    const sortedConsultations = [...consultations].sort(
      (a, b) =>
        parseSupabaseDatetime(a.data_hora).getTime() -
        parseSupabaseDatetime(b.data_hora).getTime()
    );

    // Construir lista de datas e valores
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

    // Unir datas com vírgula e substituir a última por " e "
    const datesAndValues =
      datesAndValuesArray.length > 1
        ? datesAndValuesArray.slice(0, -1).join(', ') +
          ' e ' +
          datesAndValuesArray[datesAndValuesArray.length - 1]
        : datesAndValuesArray[0] || '';

    // Determinar singular/plural para "dia(s)"
    const totalConsultations = sortedConsultations.length;
    const diaText = totalConsultations === 1 ? 'dia' : 'dias';
    const atendimentoText =
      totalConsultations === 1
        ? 'Atendimento realizado'
        : 'Atendimentos realizados';

    // Montar texto do registro com CREFITO
    const registroText = professionalData.registro
      ? `, CREFITO ${professionalData.registro}`
      : '';

    // Template no mesmo formato que múltiplos profissionais
    const profDescription = `${servicesText}, ${totalConsultations === 1 ? 'realizada' : 'realizadas'} pel${professionalData.tipo === 'fisioterapeuta' ? 'a fisioterapeuta' : 'o profissional'} ${professionalData.nome}, CPF ${professionalData.cpf}${registroText}, no${totalConsultations === 1 ? '' : 's'} ${diaText} ${datesAndValues}.`;

    const description = `${profDescription}\n${atendimentoText} ao paciente ${pacienteNome}, CPF ${pacienteCpf}.`;

    console.log('📝 Descrição gerada (profissional único):', description);
    return description;
  }
}
