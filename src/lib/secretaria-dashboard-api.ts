import { supabase } from './supabase';
import { parseSupabaseDatetime } from './calendar-mappers';
import { fetchProfissionaisAutorizados } from './calendar-services';
import type { SupabaseAgendamentoCompletoFlat } from '@/types/supabase-calendar';

// AI dev note: Secretaria Dashboard API - funções para métricas operacionais da secretaria
// Foca em quantidade de consultas e operações, sem valores financeiros globais
// Filtra dados apenas pelos profissionais autorizados via permissoes_agendamento

export interface SecretariaMetrics {
  consultasNoMes: number;
  consultasNoMesAnterior: number;
  proximosAgendamentos: number;
  consultasAEvoluir: number;
  profissionaisAutorizados: number;
  pacientesAtendidos: number;
  observacao?: string;
  comparativos: {
    consultasVariacao: {
      percentual: number;
      absoluta: number;
      tipo: 'crescimento' | 'queda' | 'estavel';
    };
  };
}

export interface SecretariaVolumeComparativo {
  dadosAnuais: Array<{
    periodo: string; // Jan 2024, Fev 2024, etc.
    volumeConsultas: number; // Total de consultas realizadas
    consultasComEvolucao: number; // Consultas que têm evolução
    consultasPendentesEvolucao: number; // Consultas sem evolução
    mes: number; // 1-12
    ano: number;
  }>;
  resumoAno: {
    totalConsultas: number;
    totalComEvolucao: number;
    totalPendentesEvolucao: number;
    mediaMovel: number;
    mesAtual: {
      periodo: string;
      volumeConsultas: number;
      consultasComEvolucao: number;
      consultasPendentes: number;
    };
    melhorMes: {
      periodo: string;
      volume: number;
    };
  };
}

// Interfaces reutilizáveis - definidas localmente para evitar problemas de import circular
export interface UpcomingAppointment {
  id: string;
  dataHora: string;
  pacienteNome: string;
  tipoServico: string;
  local: string;
  valor: number;
  statusConsulta: string;
  statusPagamento: string;
  // Campos extras para admin e secretaria
  profissionalNome?: string;
}

export interface ConsultationToEvolve {
  id: string;
  dataHora: string;
  pacienteNome: string;
  tipoServico: string;
  valor: number;
  diasPendente: number;
  urgente: boolean;
  prioridade: 'normal' | 'atencao' | 'urgente'; // normal: 0-2 dias, atencao: 3+ dias, urgente: 7+ dias
  // Campos extras para admin e secretaria
  profissionalNome?: string;
  statusPagamento?: string;
}

/**
 * Busca métricas operacionais da secretaria para profissionais autorizados
 */
export const fetchSecretariaMetrics = async (
  secretariaId: string,
  _startDate: string,
  endDate: string
): Promise<SecretariaMetrics> => {
  try {
    // Buscar profissionais autorizados para esta secretaria
    const profissionaisAutorizados =
      await fetchProfissionaisAutorizados(secretariaId);

    if (profissionaisAutorizados.length === 0) {
      // Se não há profissionais autorizados, retornar métricas zeradas
      return {
        consultasNoMes: 0,
        consultasNoMesAnterior: 0,
        proximosAgendamentos: 0,
        consultasAEvoluir: 0,
        profissionaisAutorizados: 0,
        pacientesAtendidos: 0,
        observacao: 'Nenhum profissional autorizado encontrado',
        comparativos: {
          consultasVariacao: {
            percentual: 0,
            absoluta: 0,
            tipo: 'estavel',
          },
        },
      };
    }

    const hoje = new Date();
    const mesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const mesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fimMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0);

    // Buscar consultas do mês atual (apenas profissionais autorizados)
    const { data: consultasAtual, error: errorAtual } = await supabase
      .from('vw_agendamentos_completos')
      .select('*')
      .in('profissional_id', profissionaisAutorizados)
      .gte('data_hora', mesAtual.toISOString().split('T')[0])
      .lte('data_hora', endDate)
      .eq('ativo', true)
      .order('data_hora', { ascending: false });

    if (errorAtual) throw errorAtual;

    // Buscar consultas do mês anterior (apenas profissionais autorizados)
    const { data: consultasAnterior, error: errorAnterior } = await supabase
      .from('vw_agendamentos_completos')
      .select('*')
      .in('profissional_id', profissionaisAutorizados)
      .gte('data_hora', mesAnterior.toISOString().split('T')[0])
      .lte('data_hora', fimMesAnterior.toISOString().split('T')[0])
      .eq('ativo', true)
      .order('data_hora', { ascending: false });

    if (errorAnterior) throw errorAnterior;

    const consultasAtualArray = consultasAtual || [];
    const consultasAnteriorArray = consultasAnterior || [];

    // Calcular métricas operacionais
    const consultasNoMes = consultasAtualArray.length;
    const consultasNoMesAnterior = consultasAnteriorArray.length;

    // Próximos agendamentos (próximos 7 dias)
    const proximos7Dias = new Date();
    proximos7Dias.setDate(hoje.getDate() + 7);

    const proximosAgendamentos = consultasAtualArray.filter((c) => {
      const dataConsulta = parseSupabaseDatetime(c.data_hora);
      return (
        dataConsulta >= hoje &&
        dataConsulta <= proximos7Dias &&
        c.status_consulta_codigo === 'agendado'
      );
    }).length;

    // Consultas a evoluir (finalizadas sem evolução)
    const consultasAEvoluir = consultasAtualArray.filter(
      (c) =>
        c.status_consulta_codigo === 'finalizado' && c.possui_evolucao === 'não'
    ).length;

    // Pacientes únicos atendidos no mês
    const pacientesUnicos = new Set(
      consultasAtualArray.map((c) => c.paciente_id)
    );
    const pacientesAtendidos = pacientesUnicos.size;

    // Calcular variações apenas para consultas
    const consultasAbsoluta = consultasNoMes - consultasNoMesAnterior;
    const consultasPercentual =
      consultasNoMesAnterior > 0
        ? (consultasAbsoluta / consultasNoMesAnterior) * 100
        : consultasNoMes > 0
          ? 100
          : 0;

    const getVariationType = (absoluta: number, threshold: number = 1) => {
      if (absoluta > threshold) return 'crescimento';
      if (absoluta < -threshold) return 'queda';
      return 'estavel';
    };

    return {
      consultasNoMes,
      consultasNoMesAnterior,
      proximosAgendamentos,
      consultasAEvoluir,
      profissionaisAutorizados: profissionaisAutorizados.length,
      pacientesAtendidos,
      observacao: `Dados de ${profissionaisAutorizados.length} profissional(is) autorizado(s)`,
      comparativos: {
        consultasVariacao: {
          percentual: Math.round(consultasPercentual * 100) / 100,
          absoluta: consultasAbsoluta,
          tipo: getVariationType(consultasAbsoluta),
        },
      },
    };
  } catch (error) {
    console.error('Erro ao buscar métricas da secretaria:', error);
    throw error;
  }
};

/**
 * Busca próximos agendamentos dos profissionais autorizados
 */
export const fetchSecretariaUpcomingAppointments = async (
  secretariaId: string,
  days: number = 7
): Promise<UpcomingAppointment[]> => {
  try {
    // Buscar profissionais autorizados
    const profissionaisAutorizados =
      await fetchProfissionaisAutorizados(secretariaId);

    if (profissionaisAutorizados.length === 0) {
      return [];
    }

    const hoje = new Date();
    const proximosDias = new Date();
    proximosDias.setDate(hoje.getDate() + days);

    const { data: agendamentos, error } = await supabase
      .from('vw_agendamentos_completos')
      .select('*')
      .in('profissional_id', profissionaisAutorizados)
      .eq('status_consulta_codigo', 'agendado')
      .gte('data_hora', hoje.toISOString())
      .lte('data_hora', proximosDias.toISOString())
      .eq('ativo', true)
      .order('data_hora', { ascending: true })
      .limit(10);

    if (error) throw error;

    return (agendamentos || []).map((a) => ({
      id: a.id,
      dataHora: a.data_hora,
      pacienteNome: a.paciente_nome,
      tipoServico: a.tipo_servico_nome,
      local: a.local_atendimento_nome || 'Local não definido',
      valor: 0, // Secretaria não vê valores
      statusConsulta: a.status_consulta_descricao,
      statusPagamento: a.status_pagamento_descricao,
      // Campos extras para secretaria
      profissionalNome: a.profissional_nome,
    }));
  } catch (error) {
    console.error('Erro ao buscar próximos agendamentos da secretaria:', error);
    throw error;
  }
};

/**
 * Busca consultas que precisam de evolução dos profissionais autorizados
 */
export const fetchSecretariaConsultationsToEvolve = async (
  secretariaId: string
): Promise<ConsultationToEvolve[]> => {
  try {
    // Buscar profissionais autorizados
    const profissionaisAutorizados =
      await fetchProfissionaisAutorizados(secretariaId);

    if (profissionaisAutorizados.length === 0) {
      return [];
    }

    const { data: consultas, error } = await supabase
      .from('vw_agendamentos_completos')
      .select('*')
      .in('profissional_id', profissionaisAutorizados)
      .eq('status_consulta_codigo', 'finalizado')
      .eq('possui_evolucao', 'não')
      .eq('ativo', true)
      .order('data_hora', { ascending: false })
      .range(0, 499); // Mostrar até 500 consultas

    if (error) throw error;

    const hoje = new Date();

    return (consultas || []).map((c) => {
      const dataConsulta = parseSupabaseDatetime(c.data_hora);
      const diasPendente = Math.floor(
        (hoje.getTime() - dataConsulta.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Definir prioridade baseada nos dias pendentes
      let prioridade: 'normal' | 'atencao' | 'urgente' = 'normal';
      if (diasPendente > 7) {
        prioridade = 'urgente';
      } else if (diasPendente > 2) {
        prioridade = 'atencao';
      }

      return {
        id: c.id,
        dataHora: c.data_hora,
        pacienteNome: c.paciente_nome,
        tipoServico: c.tipo_servico_nome,
        valor: 0, // Secretaria não vê valores
        diasPendente,
        urgente: diasPendente > 7,
        prioridade,
        // Campos extras para secretaria
        profissionalNome: c.profissional_nome,
        statusPagamento: c.status_pagamento_descricao,
      };
    });
  } catch (error) {
    console.error('Erro ao buscar consultas a evoluir da secretaria:', error);
    throw error;
  }
};

/**
 * Busca volume comparativo de consultas (sem valores financeiros)
 */
export const fetchSecretariaVolumeComparativo = async (
  secretariaId: string
): Promise<SecretariaVolumeComparativo> => {
  try {
    // Buscar profissionais autorizados
    const profissionaisAutorizados =
      await fetchProfissionaisAutorizados(secretariaId);

    if (profissionaisAutorizados.length === 0) {
      const hoje = new Date();
      const anoAtual = hoje.getFullYear();

      // Retornar dados zerados
      const dadosZerados = Array.from({ length: 12 }, (_, mes) => ({
        periodo: new Date(anoAtual, mes, 1).toLocaleDateString('pt-BR', {
          month: 'short',
          year: 'numeric',
        }),
        volumeConsultas: 0,
        consultasComEvolucao: 0,
        consultasPendentesEvolucao: 0,
        mes: mes + 1,
        ano: anoAtual,
      }));

      return {
        dadosAnuais: dadosZerados,
        resumoAno: {
          totalConsultas: 0,
          totalComEvolucao: 0,
          totalPendentesEvolucao: 0,
          mediaMovel: 0,
          mesAtual: {
            periodo: dadosZerados[hoje.getMonth()].periodo,
            volumeConsultas: 0,
            consultasComEvolucao: 0,
            consultasPendentes: 0,
          },
          melhorMes: {
            periodo: dadosZerados[0].periodo,
            volume: 0,
          },
        },
      };
    }

    const hoje = new Date();
    const anoAtual = hoje.getFullYear();

    // Início e fim do ano atual
    const inicioAno = new Date(anoAtual, 0, 1);
    const fimAno = new Date(anoAtual, 11, 31);

    // AI dev note: Usar batches para contornar limite de 1000 do Supabase JS
    const batchSize = 1000;
    let allConsultas: SupabaseAgendamentoCompletoFlat[] = [];
    let offset = 0;
    let hasMoreData = true;

    while (hasMoreData) {
      const { data: batchData, error: batchError } = await supabase
        .from('vw_agendamentos_completos')
        .select('*')
        .in('profissional_id', profissionaisAutorizados)
        .gte('data_hora', inicioAno.toISOString().split('T')[0])
        .lte('data_hora', fimAno.toISOString().split('T')[0])
        .eq('ativo', true)
        .range(offset, offset + batchSize - 1)
        .order('data_hora', { ascending: false });

      if (batchError) throw batchError;

      if (!batchData || batchData.length === 0) {
        hasMoreData = false;
      } else {
        allConsultas = [...allConsultas, ...batchData];
        if (batchData.length < batchSize) {
          hasMoreData = false;
        } else {
          offset += batchSize;
        }
      }

      // Safety: evitar loop infinito
      if (offset > 50000) {
        hasMoreData = false;
      }
    }

    const consultasArray = allConsultas;

    // Agrupar por mês
    const dadosPorMes = new Map<
      number,
      {
        volumeConsultas: number;
        consultasComEvolucao: number;
        consultasPendentesEvolucao: number;
      }
    >();

    // Inicializar todos os meses com zeros
    for (let mes = 1; mes <= 12; mes++) {
      dadosPorMes.set(mes, {
        volumeConsultas: 0,
        consultasComEvolucao: 0,
        consultasPendentesEvolucao: 0,
      });
    }

    // Processar consultas
    consultasArray.forEach((consulta) => {
      const dataConsulta = parseSupabaseDatetime(consulta.data_hora);
      const mes = dataConsulta.getMonth() + 1; // getMonth() retorna 0-11

      const dadosExistentes = dadosPorMes.get(mes) || {
        volumeConsultas: 0,
        consultasComEvolucao: 0,
        consultasPendentesEvolucao: 0,
      };

      // Contar volume total
      dadosExistentes.volumeConsultas += 1;

      // Contar evoluções se finalizada
      if (consulta.status_consulta_codigo === 'finalizado') {
        if (consulta.possui_evolucao === 'sim') {
          dadosExistentes.consultasComEvolucao += 1;
        } else {
          dadosExistentes.consultasPendentesEvolucao += 1;
        }
      }

      dadosPorMes.set(mes, dadosExistentes);
    });

    // Converter para array dos dados anuais
    const dadosAnuais = Array.from(dadosPorMes.entries())
      .map(([mes, dados]) => {
        const data = new Date(anoAtual, mes - 1, 1);
        return {
          periodo: data.toLocaleDateString('pt-BR', {
            month: 'short',
            year: 'numeric',
          }),
          volumeConsultas: dados.volumeConsultas,
          consultasComEvolucao: dados.consultasComEvolucao,
          consultasPendentesEvolucao: dados.consultasPendentesEvolucao,
          mes,
          ano: anoAtual,
        };
      })
      .sort((a, b) => a.mes - b.mes);

    // Calcular resumo do ano
    const totalConsultas = dadosAnuais.reduce(
      (total, mes) => total + mes.volumeConsultas,
      0
    );
    const totalComEvolucao = dadosAnuais.reduce(
      (total, mes) => total + mes.consultasComEvolucao,
      0
    );
    const totalPendentesEvolucao = dadosAnuais.reduce(
      (total, mes) => total + mes.consultasPendentesEvolucao,
      0
    );

    const mesesComDados = dadosAnuais.filter(
      (mes) => mes.volumeConsultas > 0
    ).length;
    const mediaMovel = mesesComDados > 0 ? totalConsultas / mesesComDados : 0;

    // Encontrar melhor mês (maior volume)
    const melhorMes = dadosAnuais.reduce((melhor, atual) =>
      atual.volumeConsultas > melhor.volumeConsultas ? atual : melhor
    );

    // Dados do mês atual
    const mesAtual = hoje.getMonth() + 1;
    const dadosMesAtual =
      dadosAnuais.find((m) => m.mes === mesAtual) || dadosAnuais[0];

    return {
      dadosAnuais,
      resumoAno: {
        totalConsultas,
        totalComEvolucao,
        totalPendentesEvolucao,
        mediaMovel: Math.round(mediaMovel * 100) / 100,
        mesAtual: {
          periodo: dadosMesAtual.periodo,
          volumeConsultas: dadosMesAtual.volumeConsultas,
          consultasComEvolucao: dadosMesAtual.consultasComEvolucao,
          consultasPendentes: dadosMesAtual.consultasPendentesEvolucao,
        },
        melhorMes: {
          periodo: melhorMes.periodo,
          volume: melhorMes.volumeConsultas,
        },
      },
    };
  } catch (error) {
    console.error('Erro ao buscar volume comparativo da secretaria:', error);
    throw error;
  }
};
