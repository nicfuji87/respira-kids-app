import { supabase } from './supabase';
import { parseSupabaseDatetime } from './calendar-mappers';

// AI dev note: Professional Dashboard API - funções para métricas do profissional
// Usa view vw_agendamentos_completos e tabelas relacionadas
// PERFORMANCE: Implementado sistema de batches para contornar limite de 1000 registros do Supabase JS

interface AgendamentoData {
  status_consulta_codigo: string;
  valor_servico: string;
  data_hora: string;
  possui_evolucao: string;
  // Campos adicionais da view
  paciente_nome?: string;
  profissional_nome?: string;
  servico_nome?: string;
  local_nome?: string;
  status_consulta_nome?: string;
  status_pagamento_nome?: string;
}

export interface ProfessionalMetrics {
  consultasNoMes: number;
  consultasNoMesAnterior: number;
  faturamentoAReceber: number; // Apenas consultas finalizadas com evolução
  faturamentoTotalFaturado: number; // Total já faturado (com evolução)
  faturamentoMesAnterior: number;
  proximosAgendamentos: number;
  consultasAEvoluir: number;
  observacao?: string; // Para faturamento condicionado
  comparativos: {
    consultasVariacao: {
      percentual: number;
      absoluta: number;
      tipo: 'crescimento' | 'queda' | 'estavel';
    };
    faturamentoVariacao: {
      percentual: number;
      absoluta: number;
      tipo: 'crescimento' | 'queda' | 'estavel';
    };
  };
}

export interface FaturamentoComparativo {
  dadosAnuais: Array<{
    periodo: string; // Jan 2024, Fev 2024, etc.
    faturamentoTotal: number; // Todas as consultas com evolução
    faturamentoAReceber: number; // Apenas consultas finalizadas com evolução
    consultasRealizadas: number; // Total de consultas realizadas no mês
    consultasComEvolucao: number; // Consultas que têm evolução
    mes: number; // 1-12
    ano: number;
  }>;
  resumoAno: {
    totalFaturamento: number;
    totalAReceber: number;
    totalConsultas: number;
    mediaMovel: number;
    mesAtual: {
      periodo: string;
      faturamentoTotal: number;
      faturamentoAReceber: number;
      consultas: number;
    };
    melhorMes: {
      periodo: string;
      faturamento: number;
    };
  };
}

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

export interface MaterialRequest {
  id: string;
  descricao: string;
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  dataSolicitacao: string;
  status: 'pendente' | 'aprovado' | 'rejeitado';
}

/**
 * Busca métricas principais do profissional para um período específico
 */
export const fetchProfessionalMetrics = async (
  professionalId: string,
  _startDate: string, // Prefixo underscore para indicar que não é usado
  endDate: string
): Promise<ProfessionalMetrics> => {
  try {
    const hoje = new Date();
    const mesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const mesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fimMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0);

    // AI dev note: Usar batches para métricas mensais
    const batchSize = 1000;

    // Buscar consultas do mês atual COM BATCHES
    let allConsultasAtual: AgendamentoData[] = [];
    let offset = 0;
    let hasMoreData = true;

    while (hasMoreData) {
      const { data: batchData, error: batchError } = await supabase
        .from('vw_agendamentos_completos')
        .select('*')
        .eq('profissional_id', professionalId)
        .gte('data_hora', mesAtual.toISOString().split('T')[0])
        .lte('data_hora', endDate)
        .eq('ativo', true)
        .range(offset, offset + batchSize - 1)
        .order('data_hora', { ascending: false });

      if (batchError) throw batchError;

      if (!batchData || batchData.length === 0) {
        hasMoreData = false;
      } else {
        allConsultasAtual = [
          ...allConsultasAtual,
          ...(batchData as AgendamentoData[]),
        ];
        if (batchData.length < batchSize) {
          hasMoreData = false;
        } else {
          offset += batchSize;
        }
      }

      if (offset > 10000) hasMoreData = false; // Safety menor para mês
    }

    // Buscar consultas do mês anterior COM BATCHES
    let allConsultasAnterior: AgendamentoData[] = [];
    offset = 0;
    hasMoreData = true;

    while (hasMoreData) {
      const { data: batchData, error: batchError } = await supabase
        .from('vw_agendamentos_completos')
        .select('*')
        .eq('profissional_id', professionalId)
        .gte('data_hora', mesAnterior.toISOString().split('T')[0])
        .lte('data_hora', fimMesAnterior.toISOString().split('T')[0])
        .eq('ativo', true)
        .range(offset, offset + batchSize - 1)
        .order('data_hora', { ascending: false });

      if (batchError) throw batchError;

      if (!batchData || batchData.length === 0) {
        hasMoreData = false;
      } else {
        allConsultasAnterior = [
          ...allConsultasAnterior,
          ...(batchData as AgendamentoData[]),
        ];
        if (batchData.length < batchSize) {
          hasMoreData = false;
        } else {
          offset += batchSize;
        }
      }

      if (offset > 10000) hasMoreData = false; // Safety menor para mês
    }

    const consultasAtualArray = allConsultasAtual;
    const consultasAnteriorArray = allConsultasAnterior;

    // Calcular métricas do mês atual
    const consultasNoMes = consultasAtualArray.length;
    const consultasNoMesAnterior = consultasAnteriorArray.length;

    // AI dev note: CORREÇÃO - Faturamento baseado em consultas finalizadas, independente de evolução
    // Faturamento a receber: todas as consultas finalizadas (o que realmente foi faturado)
    const faturamentoAReceber = consultasAtualArray
      .filter((c) => c.status_consulta_codigo === 'finalizado')
      .reduce((total, c) => total + parseFloat(c.valor_servico || '0'), 0);

    // Total faturado: todas as consultas realizadas no mês (independente de status/evolução)
    const faturamentoTotalFaturado = consultasAtualArray.reduce(
      (total, c) => total + parseFloat(c.valor_servico || '0'),
      0
    );

    // Faturamento do mês anterior: todas as consultas finalizadas
    const faturamentoMesAnterior = consultasAnteriorArray
      .filter((c) => c.status_consulta_codigo === 'finalizado')
      .reduce((total, c) => total + parseFloat(c.valor_servico || '0'), 0);

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

    // Calcular variações
    const consultasAbsoluta = consultasNoMes - consultasNoMesAnterior;
    const consultasPercentual =
      consultasNoMesAnterior > 0
        ? (consultasAbsoluta / consultasNoMesAnterior) * 100
        : consultasNoMes > 0
          ? 100
          : 0;

    const faturamentoAbsoluta = faturamentoAReceber - faturamentoMesAnterior;
    const faturamentoPercentual =
      faturamentoMesAnterior > 0
        ? (faturamentoAbsoluta / faturamentoMesAnterior) * 100
        : faturamentoAReceber > 0
          ? 100
          : 0;

    const getVariationType = (absoluta: number, threshold: number = 50) => {
      if (absoluta > threshold) return 'crescimento';
      if (absoluta < -threshold) return 'queda';
      return 'estavel';
    };

    return {
      consultasNoMes,
      consultasNoMesAnterior,
      faturamentoAReceber,
      faturamentoTotalFaturado,
      faturamentoMesAnterior,
      proximosAgendamentos,
      consultasAEvoluir,
      observacao: 'Faturamento condicionado às evoluções realizadas',
      comparativos: {
        consultasVariacao: {
          percentual: Math.round(consultasPercentual * 100) / 100,
          absoluta: consultasAbsoluta,
          tipo: getVariationType(consultasAbsoluta, 1),
        },
        faturamentoVariacao: {
          percentual: Math.round(faturamentoPercentual * 100) / 100,
          absoluta: Math.round(faturamentoAbsoluta * 100) / 100,
          tipo: getVariationType(faturamentoAbsoluta),
        },
      },
    };
  } catch (error) {
    console.error('Erro ao buscar métricas do profissional:', error);
    throw error;
  }
};

// AI dev note: Interface para uma evolução individual
export interface EvolucaoHistorico {
  id: string;
  data: string; // Data formatada para exibição
  dataCompleta: string; // Data ISO para ordenação
  conteudo: string; // Conteúdo completo da evolução
  profissionalNome?: string | null;
}

// AI dev note: Interface para atendimentos da janela atual (anterior, atual, próximo)
export interface CurrentWindowAppointment extends UpcomingAppointment {
  position: 'previous' | 'current' | 'next';
  isInProgress?: boolean; // true se o atendimento está acontecendo agora
  servicoDuracao?: number; // duração em minutos
  pacienteId?: string; // ID do paciente para buscar histórico
  responsavelLegalNome?: string | null; // Nome do responsável legal
  evolucoes?: EvolucaoHistorico[]; // Lista de evoluções do paciente
}

/**
 * Busca os 3 atendimentos da janela atual: anterior, atual e próximo
 * Baseado no horário atual, retorna o contexto imediato de atendimentos
 */
export const fetchCurrentWindowAppointments = async (
  professionalId?: string,
  professionalIds?: string[]
): Promise<CurrentWindowAppointment[]> => {
  try {
    const agora = new Date();

    // Buscar atendimentos do dia atual (para ter contexto completo)
    const inicioDia = new Date(agora);
    inicioDia.setHours(0, 0, 0, 0);

    const fimDia = new Date(agora);
    fimDia.setHours(23, 59, 59, 999);

    let query = supabase
      .from('vw_agendamentos_completos')
      .select('*')
      .gte('data_hora', inicioDia.toISOString())
      .lte('data_hora', fimDia.toISOString())
      .eq('ativo', true)
      .order('data_hora', { ascending: true });

    // Filtrar por profissional específico ou lista de profissionais
    if (professionalId) {
      query = query.eq('profissional_id', professionalId);
    } else if (professionalIds && professionalIds.length > 0) {
      query = query.in('profissional_id', professionalIds);
    }

    const { data: agendamentos, error } = await query;

    if (error) throw error;

    if (!agendamentos || agendamentos.length === 0) {
      return [];
    }

    // Mapear para o formato UpcomingAppointment com dados extras
    const appointments = agendamentos.map((a) => ({
      id: a.id,
      dataHora: a.data_hora,
      pacienteNome: a.paciente_nome,
      tipoServico: a.servico_nome || 'Serviço não definido',
      local: a.local_nome || 'Local não definido',
      valor: parseFloat(a.valor_servico || '0'),
      statusConsulta: a.status_consulta_nome || 'Status não definido',
      statusPagamento: a.status_pagamento_nome || 'Pagamento não definido',
      profissionalNome: a.profissional_nome,
      servicoDuracao: a.servico_duracao || 60,
      // Dados extras para CurrentWindowAppointment
      pacienteId: a.paciente_id,
      responsavelLegalNome: a.responsavel_legal_nome || null,
    }));

    // Encontrar o atendimento atual, anterior e próximo baseado no horário
    const result: CurrentWindowAppointment[] = [];

    let currentIndex = -1;

    // Encontrar o índice do atendimento "atual" ou mais próximo
    for (let i = 0; i < appointments.length; i++) {
      const appointmentTime = parseSupabaseDatetime(appointments[i].dataHora);
      const endTime = new Date(
        appointmentTime.getTime() +
          (appointments[i].servicoDuracao || 60) * 60000
      );

      // Se o atendimento está em andamento (agora está entre início e fim)
      if (agora >= appointmentTime && agora <= endTime) {
        currentIndex = i;
        break;
      }

      // Se o atendimento ainda não começou, este é o próximo
      if (appointmentTime > agora) {
        currentIndex = i;
        break;
      }
    }

    // Se não encontrou nenhum atendimento atual ou futuro (todos já passaram),
    // NÃO mostrar nenhum como "atual" - retorna lista vazia
    if (currentIndex === -1) {
      return [];
    }

    // Coletar IDs de pacientes para buscar histórico
    const pacienteIds = new Set<string>();

    // Adicionar atendimento anterior (se existir)
    if (currentIndex > 0) {
      const prev = appointments[currentIndex - 1];
      pacienteIds.add(prev.pacienteId);
      result.push({
        ...prev,
        position: 'previous',
        isInProgress: false,
      });
    }

    // Adicionar atendimento atual
    if (currentIndex >= 0 && currentIndex < appointments.length) {
      const current = appointments[currentIndex];
      const appointmentTime = parseSupabaseDatetime(current.dataHora);
      const endTime = new Date(
        appointmentTime.getTime() + (current.servicoDuracao || 60) * 60000
      );
      const isInProgress = agora >= appointmentTime && agora <= endTime;

      pacienteIds.add(current.pacienteId);
      result.push({
        ...current,
        position: 'current',
        isInProgress,
      });
    }

    // Adicionar próximo atendimento (se existir)
    if (currentIndex + 1 < appointments.length) {
      const next = appointments[currentIndex + 1];
      pacienteIds.add(next.pacienteId);
      result.push({
        ...next,
        position: 'next',
        isInProgress: false,
      });
    }

    // Buscar todas as evoluções para cada paciente
    const evolucoesMap = new Map<string, EvolucaoHistorico[]>();

    for (const pacienteId of pacienteIds) {
      try {
        // Buscar agendamentos do paciente com dados do profissional
        const { data: agendamentosPaciente } = await supabase
          .from('vw_agendamentos_completos')
          .select('id, data_hora, profissional_nome')
          .eq('paciente_id', pacienteId)
          .eq('ativo', true);

        if (agendamentosPaciente && agendamentosPaciente.length > 0) {
          const agendamentoIds = agendamentosPaciente.map((a) => a.id);
          const agendamentoMap = new Map(
            agendamentosPaciente.map((a) => [a.id, a])
          );

          // Buscar TODAS as evoluções do paciente
          const { data: evolucoes } = await supabase
            .from('relatorio_evolucao')
            .select('id, conteudo, created_at, id_agendamento')
            .in('id_agendamento', agendamentoIds)
            .not('conteudo', 'is', null)
            .order('created_at', { ascending: false });

          if (evolucoes && evolucoes.length > 0) {
            // Mapear evoluções com dados completos
            const evolucoesFormatadas: EvolucaoHistorico[] = evolucoes.map(
              (e) => {
                const agendamento = agendamentoMap.get(e.id_agendamento);
                const dataEvolucao = new Date(e.created_at);

                return {
                  id: e.id,
                  data: dataEvolucao.toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  }),
                  dataCompleta: e.created_at,
                  conteudo: e.conteudo,
                  profissionalNome: agendamento?.profissional_nome || null,
                };
              }
            );

            evolucoesMap.set(pacienteId, evolucoesFormatadas);
          }
        }
      } catch (err) {
        console.warn(
          `Erro ao buscar evoluções do paciente ${pacienteId}:`,
          err
        );
        // Continua sem evoluções para este paciente
      }
    }

    // Adicionar evoluções aos resultados
    const resultWithEvolutions = result.map((appointment) => ({
      ...appointment,
      evolucoes: evolucoesMap.get(appointment.pacienteId || '') || [],
    }));

    return resultWithEvolutions;
  } catch (error) {
    console.error('Erro ao buscar atendimentos da janela atual:', error);
    throw error;
  }
};

/**
 * Busca próximos agendamentos do profissional
 */
export const fetchUpcomingAppointments = async (
  professionalId: string,
  days: number = 7
): Promise<UpcomingAppointment[]> => {
  try {
    const hoje = new Date();
    const proximosDias = new Date();
    proximosDias.setDate(hoje.getDate() + days);

    const { data: agendamentos, error } = await supabase
      .from('vw_agendamentos_completos')
      .select('*')
      .eq('profissional_id', professionalId)
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
      tipoServico: a.servico_nome || 'Serviço não definido',
      local: a.local_nome || 'Local não definido',
      valor: parseFloat(a.valor_servico || '0'),
      statusConsulta: a.status_consulta_nome || 'Status não definido',
      statusPagamento: a.status_pagamento_nome || 'Pagamento não definido',
      // Campos extras para admin e secretaria
      profissionalNome: a.profissional_nome,
    }));
  } catch (error) {
    console.error('Erro ao buscar próximos agendamentos:', error);
    throw error;
  }
};

/**
 * Busca consultas finalizadas que precisam de evolução
 */
export const fetchConsultationsToEvolve = async (
  professionalId: string
): Promise<ConsultationToEvolve[]> => {
  try {
    // AI dev note: OTIMIZAÇÃO - Buscar apenas consultas dos últimos 60 dias para melhor performance
    const hoje = new Date();
    const sessentaDiasAtras = new Date();
    sessentaDiasAtras.setDate(hoje.getDate() - 60);

    // AI dev note: Select apenas campos necessários para lista de consultas a evoluir
    const { data: consultas, error } = await supabase
      .from('vw_agendamentos_completos')
      .select('id, data_hora, paciente_nome, servico_nome, valor_servico')
      .eq('profissional_id', professionalId)
      .eq('status_consulta_codigo', 'finalizado')
      .eq('possui_evolucao', 'não')
      .eq('ativo', true)
      .gte('data_hora', sessentaDiasAtras.toISOString()) // Filtrar apenas últimos 60 dias
      .order('data_hora', { ascending: false })
      .limit(100); // AI dev note: Reduzido de 500 para 100 para performance

    if (error) throw error;

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
        tipoServico: c.servico_nome || 'Serviço não definido',
        valor: parseFloat(c.valor_servico || '0'), // Usar valor_servico para profissional
        diasPendente,
        urgente: diasPendente > 7, // Mais de 7 dias é urgente
        prioridade,
      };
    });
  } catch (error) {
    console.error('Erro ao buscar consultas a evoluir:', error);
    throw error;
  }
};

/**
 * Busca faturamento anual do profissional
 */
export const fetchFaturamentoComparativo = async (
  professionalId: string
): Promise<FaturamentoComparativo> => {
  try {
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();

    // Início e fim do ano atual
    const inicioAno = new Date(anoAtual, 0, 1);
    const fimAno = new Date(anoAtual, 11, 31);

    // AI dev note: Contornar limite de 1000 do Supabase JS com queries em batches
    const batchSize = 1000;
    let allConsultas: AgendamentoData[] = [];
    let offset = 0;
    let hasMoreData = true;

    while (hasMoreData) {
      const { data: batchData, error: batchError } = await supabase
        .from('vw_agendamentos_completos')
        .select('*')
        .eq('profissional_id', professionalId)
        .gte('data_hora', inicioAno.toISOString().split('T')[0])
        .lte('data_hora', fimAno.toISOString().split('T')[0])
        .eq('ativo', true)
        .range(offset, offset + batchSize - 1)
        .order('data_hora', { ascending: false });

      if (batchError) {
        throw new Error(batchError.message);
      }

      if (!batchData || batchData.length === 0) {
        hasMoreData = false;
      } else {
        allConsultas = [...allConsultas, ...(batchData as AgendamentoData[])];

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
        faturamentoTotal: number;
        faturamentoAReceber: number;
        consultasRealizadas: number;
        consultasComEvolucao: number;
      }
    >();

    // Inicializar todos os meses com zeros
    for (let mes = 1; mes <= 12; mes++) {
      dadosPorMes.set(mes, {
        faturamentoTotal: 0,
        faturamentoAReceber: 0,
        consultasRealizadas: 0,
        consultasComEvolucao: 0,
      });
    }

    // Processar consultas
    consultasArray.forEach((consulta) => {
      const dataConsulta = parseSupabaseDatetime(consulta.data_hora);
      const mes = dataConsulta.getMonth() + 1; // getMonth() retorna 0-11
      const valor = parseFloat(consulta.valor_servico || '0');

      const dadosExistentes = dadosPorMes.get(mes) || {
        faturamentoTotal: 0,
        faturamentoAReceber: 0,
        consultasRealizadas: 0,
        consultasComEvolucao: 0,
      };

      // Sempre contar consulta realizada
      dadosExistentes.consultasRealizadas += 1;

      // AI dev note: CORREÇÃO - Contar valores reais baseado no status da consulta
      if (consulta.status_consulta_codigo === 'finalizado') {
        // Faturamento total: todas as consultas finalizadas (valor real gerado)
        dadosExistentes.faturamentoTotal += valor;

        if (consulta.possui_evolucao === 'sim') {
          // Consultas com evolução completa (faturamento efetivo)
          dadosExistentes.consultasComEvolucao += 1;
        } else {
          // Consultas finalizadas sem evolução (valor a receber quando evolução for feita)
          dadosExistentes.faturamentoAReceber += valor;
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
          faturamentoTotal: Math.round(dados.faturamentoTotal * 100) / 100,
          faturamentoAReceber:
            Math.round(dados.faturamentoAReceber * 100) / 100,
          consultasRealizadas: dados.consultasRealizadas,
          consultasComEvolucao: dados.consultasComEvolucao,
          mes,
          ano: anoAtual,
        };
      })
      .sort((a, b) => a.mes - b.mes);

    // Calcular resumo do ano
    const totalFaturamento = dadosAnuais.reduce(
      (total, mes) => total + mes.faturamentoTotal,
      0
    );
    const totalAReceber = dadosAnuais.reduce(
      (total, mes) => total + mes.faturamentoAReceber,
      0
    );
    const totalConsultas = dadosAnuais.reduce(
      (total, mes) => total + mes.consultasRealizadas,
      0
    );
    const mesesComDados = dadosAnuais.filter(
      (mes) => mes.faturamentoTotal > 0
    ).length;
    const mediaMovel = mesesComDados > 0 ? totalFaturamento / mesesComDados : 0;

    // Encontrar melhor mês
    const melhorMes = dadosAnuais.reduce((melhor, atual) =>
      atual.faturamentoTotal > melhor.faturamentoTotal ? atual : melhor
    );

    // Dados do mês atual
    const mesAtual = hoje.getMonth() + 1;
    const dadosMesAtual =
      dadosAnuais.find((m) => m.mes === mesAtual) || dadosAnuais[0];

    return {
      dadosAnuais,
      resumoAno: {
        totalFaturamento: Math.round(totalFaturamento * 100) / 100,
        totalAReceber: Math.round(totalAReceber * 100) / 100,
        totalConsultas,
        mediaMovel: Math.round(mediaMovel * 100) / 100,
        mesAtual: {
          periodo: dadosMesAtual.periodo,
          faturamentoTotal: dadosMesAtual.faturamentoTotal,
          faturamentoAReceber: dadosMesAtual.faturamentoAReceber,
          consultas: dadosMesAtual.consultasRealizadas,
        },
        melhorMes: {
          periodo: melhorMes.periodo,
          faturamento: melhorMes.faturamentoTotal,
        },
      },
    };
  } catch (error) {
    console.error('Erro ao buscar faturamento anual:', error);
    throw error;
  }
};

/**
 * Busca solicitações de material (placeholder - tabela será criada)
 */
export const fetchMaterialRequests = async (
  professionalId: string
): Promise<MaterialRequest[]> => {
  try {
    // TODO: Implementar quando tabela material_requests for criada
    // Por enquanto retorna array vazio
    console.warn(
      `Tabela material_requests ainda não foi criada no Supabase para profissional ${professionalId}`
    );

    return [];
  } catch (error) {
    console.error('Erro ao buscar solicitações de material:', error);
    throw error;
  }
};

// === ADMIN DASHBOARD FUNCTIONS ===

/**
 * Interface para métricas administrativas (todos os profissionais)
 */
export interface AdminMetrics {
  totalPacientes: number;
  consultasNoMes: number;
  consultasNoMesAnterior: number;
  faturamentoTotalMes: number;
  faturamentoMesAnterior: number;
  proximosAgendamentos: number;
  consultasAEvoluir: number;
  profissionaisAtivos: number;
  aprovacoesPendentes: number;
  observacao?: string;
}

/**
 * Busca métricas administrativas gerais (todos os profissionais)
 */
export const fetchAdminMetrics = async (
  endDate: string
): Promise<AdminMetrics> => {
  try {
    const hoje = new Date();
    const mesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const mesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fimMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0);

    // AI dev note: Buscar apenas campos necessários para cálculo de métricas (status e valor)
    // Evita timeout com .select('*') que retorna ~70 campos
    const { data: consultasAtuais, error: errorAtual } = await supabase
      .from('vw_agendamentos_completos')
      .select('status_consulta_codigo, valor_servico')
      .gte('data_hora', mesAtual.toISOString().split('T')[0])
      .lte('data_hora', endDate)
      .eq('ativo', true);

    if (errorAtual) throw errorAtual;

    const { data: consultasAnteriores, error: errorAnterior } = await supabase
      .from('vw_agendamentos_completos')
      .select('status_consulta_codigo, valor_servico')
      .gte('data_hora', mesAnterior.toISOString().split('T')[0])
      .lte('data_hora', fimMesAnterior.toISOString().split('T')[0])
      .eq('ativo', true);

    if (errorAnterior) throw errorAnterior;

    // Contar próximos agendamentos (próximos 7 dias)
    const proximosDias = new Date();
    proximosDias.setDate(hoje.getDate() + 7);

    const { count: proximosAgendamentos, error: errorProximos } = await supabase
      .from('vw_agendamentos_completos')
      .select('*', { count: 'exact', head: true })
      .eq('status_consulta_codigo', 'agendado')
      .gte('data_hora', hoje.toISOString())
      .lte('data_hora', proximosDias.toISOString())
      .eq('ativo', true);

    if (errorProximos) throw errorProximos;

    // Contar consultas a evoluir (todos os profissionais)
    const { count: consultasEvoluir, error: errorEvoluir } = await supabase
      .from('vw_agendamentos_completos')
      .select('*', { count: 'exact', head: true })
      .eq('status_consulta_codigo', 'finalizado')
      .eq('possui_evolucao', 'não')
      .eq('ativo', true);

    if (errorEvoluir) throw errorEvoluir;

    // Buscar ID do tipo "paciente" separadamente
    const { data: tipoPaciente, error: errorTipoPaciente } = await supabase
      .from('pessoa_tipos')
      .select('id')
      .eq('codigo', 'paciente')
      .eq('ativo', true)
      .single();

    if (errorTipoPaciente) throw errorTipoPaciente;

    // Agora buscar pacientes usando o ID encontrado
    const { count: totalPacientesCount, error: errorPacientesCount } =
      await supabase
        .from('pessoas')
        .select('*', { count: 'exact', head: true })
        .eq('id_tipo_pessoa', tipoPaciente.id)
        .eq('ativo', true);

    if (errorPacientesCount) throw errorPacientesCount;

    // Contar profissionais ativos
    const { count: profissionaisAtivos, error: errorProfissionais } =
      await supabase
        .from('pessoas')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'profissional')
        .eq('is_approved', true)
        .eq('ativo', true);

    if (errorProfissionais) throw errorProfissionais;

    // Contar aprovações pendentes
    const { count: aprovacoesPendentes, error: errorAprovacoes } =
      await supabase
        .from('pessoas')
        .select('*', { count: 'exact', head: true })
        .eq('is_approved', false)
        .eq('profile_complete', true)
        .eq('ativo', true);

    if (errorAprovacoes) throw errorAprovacoes;

    // Calcular faturamento total (usar valor_servico ao invés de comissão)
    const faturamentoTotalMes = (consultasAtuais || [])
      .filter(
        (c: unknown) =>
          (c as { status_consulta_codigo?: string }).status_consulta_codigo ===
          'finalizado'
      )
      .reduce(
        (sum: number, c: unknown) =>
          sum +
          parseFloat((c as { valor_servico?: string }).valor_servico || '0'),
        0
      );

    const faturamentoMesAnterior = (consultasAnteriores || [])
      .filter(
        (c: unknown) =>
          (c as { status_consulta_codigo?: string }).status_consulta_codigo ===
          'finalizado'
      )
      .reduce(
        (sum: number, c: unknown) =>
          sum +
          parseFloat((c as { valor_servico?: string }).valor_servico || '0'),
        0
      );

    return {
      totalPacientes: totalPacientesCount || 0,
      consultasNoMes: (consultasAtuais || []).length,
      consultasNoMesAnterior: (consultasAnteriores || []).length,
      faturamentoTotalMes,
      faturamentoMesAnterior,
      proximosAgendamentos: proximosAgendamentos || 0,
      consultasAEvoluir: consultasEvoluir || 0,
      profissionaisAtivos: profissionaisAtivos || 0,
      aprovacoesPendentes: aprovacoesPendentes || 0,
      observacao: 'Dados consolidados de todos os profissionais',
    };
  } catch (error) {
    console.error('Erro ao buscar métricas administrativas:', error);
    throw error;
  }
};

/**
 * Busca próximos agendamentos (todos os profissionais ou filtrados)
 */
export const fetchAllUpcomingAppointments = async (
  days: number = 7,
  professionalIds?: string[],
  limit: number = 10
): Promise<{ appointments: UpcomingAppointment[]; hasMore: boolean }> => {
  try {
    const hoje = new Date();
    const proximosDias = new Date();
    proximosDias.setDate(hoje.getDate() + days);

    let query = supabase
      .from('vw_agendamentos_completos')
      .select('*')
      .eq('status_consulta_codigo', 'agendado')
      .gte('data_hora', hoje.toISOString())
      .lte('data_hora', proximosDias.toISOString())
      .eq('ativo', true);

    // Aplicar filtro de profissionais se fornecido
    if (professionalIds && professionalIds.length > 0) {
      query = query.in('profissional_id', professionalIds);
    }

    // Buscar um a mais que o limite para saber se há mais agendamentos
    const { data: agendamentos, error } = await query
      .order('data_hora', { ascending: true })
      .limit(limit + 1);

    if (error) throw error;

    const appointments = (agendamentos || []).slice(0, limit).map((a) => ({
      id: a.id,
      dataHora: a.data_hora,
      pacienteNome: a.paciente_nome,
      tipoServico: a.servico_nome || 'Serviço não definido',
      local: a.local_nome || 'Local não definido',
      valor: parseFloat(a.valor_servico || '0'), // Admin vê valor total, não comissão
      statusConsulta: a.status_consulta_nome || 'Status não definido',
      statusPagamento: a.status_pagamento_nome || 'Pagamento não definido',
      // Campos extras para admin
      profissionalNome: a.profissional_nome,
    }));

    // Se retornou mais que o limite, significa que há mais agendamentos
    const hasMore = (agendamentos || []).length > limit;

    return { appointments, hasMore };
  } catch (error) {
    console.error('Erro ao buscar próximos agendamentos:', error);
    throw error;
  }
};

/**
 * Busca consultas finalizadas que precisam de evolução (todos os profissionais ou filtrados)
 */
export const fetchAllConsultationsToEvolve = async (
  professionalIds?: string[]
): Promise<ConsultationToEvolve[]> => {
  try {
    // AI dev note: Select apenas campos necessários + limit para performance
    let query = supabase
      .from('vw_agendamentos_completos')
      .select(
        'id, data_hora, paciente_nome, servico_nome, valor_servico, profissional_nome, status_pagamento_nome'
      )
      .eq('status_consulta_codigo', 'finalizado')
      .eq('possui_evolucao', 'não')
      .eq('ativo', true);

    // Aplicar filtro de profissionais se fornecido
    if (professionalIds && professionalIds.length > 0) {
      query = query.in('profissional_id', professionalIds);
    }

    const { data: consultas, error } = await query
      .order('data_hora', { ascending: false })
      .limit(100); // AI dev note: Reduzido de 1000 para 100 para performance

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
        tipoServico: c.servico_nome || 'Serviço não definido',
        valor: parseFloat(c.valor_servico || '0'), // Admin vê valor total
        diasPendente,
        urgente: diasPendente > 7,
        prioridade,
        // Campos extras para admin e secretaria
        profissionalNome: c.profissional_nome,
        statusPagamento: c.status_pagamento_nome || 'Pagamento não definido',
      };
    });
  } catch (error) {
    console.error('Erro ao buscar consultas a evoluir:', error);
    throw error;
  }
};

/**
 * Busca faturamento comparativo anual (todos os profissionais ou filtrados)
 * AI dev note: Busca TODOS os registros históricos disponíveis para permitir filtragem no frontend
 */
export const fetchAdminFaturamentoComparativo = async (
  professionalIds?: string[]
): Promise<FaturamentoComparativo> => {
  try {
    const hoje = new Date();

    // AI dev note: OTIMIZAÇÃO - Buscar apenas últimos 12 meses para evitar timeout
    // Suficiente para gráfico de faturamento comparativo
    const inicioHistorico = new Date();
    inicioHistorico.setMonth(hoje.getMonth() - 12);

    // AI dev note: Select apenas campos necessários para reduzir payload
    let query = supabase
      .from('vw_agendamentos_completos')
      .select(
        'data_hora, valor_servico, status_consulta_codigo, possui_evolucao, status_pagamento_codigo'
      )
      .eq('ativo', true)
      .gte('data_hora', inicioHistorico.toISOString())
      .lte('data_hora', hoje.toISOString())
      .order('data_hora', { ascending: true });

    // Aplicar filtro de profissionais se fornecido
    if (professionalIds && professionalIds.length > 0) {
      query = query.in('profissional_id', professionalIds);
    }

    const { data: allConsultas, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    console.log(
      `📊 Faturamento Comparativo Admin: ${allConsultas?.length || 0} consultas históricas carregadas`
    );

    const consultasArray = allConsultas || [];

    // AI dev note: Agrupar por mês/ano (não apenas por mês do ano atual)
    // Criar chave única: "YYYYMM" para cada mês
    const dadosPorMes = new Map<
      string,
      {
        periodo: string;
        faturamentoTotal: number;
        faturamentoAReceber: number;
        consultasRealizadas: number;
        consultasComEvolucao: number;
        mes: number;
        ano: number;
      }
    >();

    // Processar consultas e criar meses dinamicamente
    consultasArray.forEach((consulta) => {
      const dataConsulta = parseSupabaseDatetime(consulta.data_hora);
      const ano = dataConsulta.getFullYear();
      const mes = dataConsulta.getMonth(); // 0-11
      const mesKey = `${ano}${String(mes + 1).padStart(2, '0')}`; // "202501"

      // Inicializar mês se não existir
      if (!dadosPorMes.has(mesKey)) {
        dadosPorMes.set(mesKey, {
          periodo: new Intl.DateTimeFormat('pt-BR', {
            month: 'short',
            year: 'numeric',
          }).format(new Date(ano, mes, 1)),
          faturamentoTotal: 0,
          faturamentoAReceber: 0,
          consultasRealizadas: 0,
          consultasComEvolucao: 0,
          mes: mes + 1,
          ano: ano,
        });
      }

      const dadosMes = dadosPorMes.get(mesKey)!;

      // AI dev note: CORREÇÃO - Processar todas as consultas, não apenas finalizadas
      const valor = parseFloat(consulta.valor_servico || '0');

      // Sempre contar consulta realizada
      dadosMes.consultasRealizadas += 1;

      if (consulta.status_consulta_codigo === 'finalizado') {
        // Todas as consultas finalizadas geram faturamento total
        dadosMes.faturamentoTotal += valor;

        if (consulta.possui_evolucao === 'sim') {
          // Consultas com evolução completa (já processadas totalmente)
          dadosMes.consultasComEvolucao += 1;
        } else {
          // Consultas finalizadas sem evolução (ainda precisam ser processadas)
          dadosMes.faturamentoAReceber += valor;
        }
      } else if (consulta.status_consulta_codigo === 'agendado') {
        // Consultas agendadas contam no total potencial mas ainda não no a receber
        dadosMes.faturamentoTotal += valor;
      }
    });

    // AI dev note: Ordenar dados por ano e mês (do mais antigo para o mais recente)
    const dadosAnuais = Array.from(dadosPorMes.values()).sort((a, b) => {
      if (a.ano !== b.ano) return a.ano - b.ano;
      return a.mes - b.mes;
    });

    console.log(
      `📊 Dados agrupados em ${dadosAnuais.length} meses (${dadosAnuais[0]?.periodo} a ${dadosAnuais[dadosAnuais.length - 1]?.periodo})`
    );

    // Calcular totais
    const totalFaturamento = dadosAnuais.reduce(
      (sum, d) => sum + d.faturamentoTotal,
      0
    );
    const totalAReceber = dadosAnuais.reduce(
      (sum, d) => sum + d.faturamentoAReceber,
      0
    );
    const totalConsultas = dadosAnuais.reduce(
      (sum, d) => sum + d.consultasRealizadas,
      0
    );

    // Buscar dados do mês atual
    const anoAtual = hoje.getFullYear();
    const mesAtualNum = hoje.getMonth() + 1; // 1-12
    const mesAtualKey = `${anoAtual}${String(mesAtualNum).padStart(2, '0')}`;
    const mesAtualData = dadosPorMes.get(mesAtualKey) || {
      periodo: new Intl.DateTimeFormat('pt-BR', {
        month: 'short',
        year: 'numeric',
      }).format(hoje),
      faturamentoTotal: 0,
      faturamentoAReceber: 0,
      consultasRealizadas: 0,
      consultasComEvolucao: 0,
      mes: mesAtualNum,
      ano: anoAtual,
    };

    // Encontrar melhor mês
    const melhorMes = dadosAnuais.reduce(
      (max, current) =>
        current.faturamentoTotal > max.faturamento
          ? {
              periodo: current.periodo,
              faturamento: current.faturamentoTotal,
              consultas: current.consultasRealizadas,
            }
          : max,
      { periodo: dadosAnuais[0]?.periodo || '', faturamento: 0, consultas: 0 }
    );

    return {
      dadosAnuais,
      resumoAno: {
        totalFaturamento,
        totalAReceber,
        totalConsultas,
        mediaMovel:
          dadosAnuais.length > 0 ? totalFaturamento / dadosAnuais.length : 0,
        mesAtual: {
          periodo: mesAtualData.periodo,
          faturamentoTotal: mesAtualData.faturamentoTotal,
          faturamentoAReceber: mesAtualData.faturamentoAReceber,
          consultas: mesAtualData.consultasRealizadas || 0,
        },
        melhorMes,
      },
    };
  } catch (error) {
    console.error('Erro ao buscar faturamento comparativo admin:', error);
    throw error;
  }
};

/**
 * Busca todas as solicitações de material (todos os profissionais)
 */
export const fetchAllMaterialRequests = async (): Promise<
  MaterialRequest[]
> => {
  try {
    // TODO: Implementar quando tabela material_requests for criada
    // Por enquanto retorna array vazio
    console.warn('Tabela material_requests ainda não foi criada no Supabase');

    return [];
  } catch (error) {
    console.error('Erro ao buscar todas as solicitações de material:', error);
    throw error;
  }
};
