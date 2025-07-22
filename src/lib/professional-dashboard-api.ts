import { supabase } from './supabase';

// AI dev note: Professional Dashboard API - funções para métricas do profissional
// Usa view vw_agendamentos_completos e tabelas relacionadas

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

    // Buscar consultas do mês atual
    const { data: consultasAtual, error: errorAtual } = await supabase
      .from('vw_agendamentos_completos')
      .select('*')
      .eq('profissional_id', professionalId)
      .gte('data_hora', mesAtual.toISOString().split('T')[0])
      .lte('data_hora', endDate)
      .eq('ativo', true);

    if (errorAtual) throw errorAtual;

    // Buscar consultas do mês anterior
    const { data: consultasAnterior, error: errorAnterior } = await supabase
      .from('vw_agendamentos_completos')
      .select('*')
      .eq('profissional_id', professionalId)
      .gte('data_hora', mesAnterior.toISOString().split('T')[0])
      .lte('data_hora', fimMesAnterior.toISOString().split('T')[0])
      .eq('ativo', true);

    if (errorAnterior) throw errorAnterior;

    const consultasAtualArray = consultasAtual || [];
    const consultasAnteriorArray = consultasAnterior || [];

    // Calcular métricas do mês atual
    const consultasNoMes = consultasAtualArray.length;
    const consultasNoMesAnterior = consultasAnteriorArray.length;

    // Faturamento a receber: consultas finalizadas com evolução
    const faturamentoAReceber = consultasAtualArray
      .filter(
        (c) =>
          c.status_consulta_codigo === 'finalizado' &&
          c.possui_evolucao === 'sim'
      )
      .reduce(
        (total, c) => total + parseFloat(c.comissao_valor_calculado || '0'),
        0
      );

    // Total faturado: todas as consultas com evolução (independente do status)
    const faturamentoTotalFaturado = consultasAtualArray
      .filter((c) => c.possui_evolucao === 'sim')
      .reduce(
        (total, c) => total + parseFloat(c.comissao_valor_calculado || '0'),
        0
      );

    // Faturamento do mês anterior
    const faturamentoMesAnterior = consultasAnteriorArray
      .filter(
        (c) =>
          c.status_consulta_codigo === 'finalizado' &&
          c.possui_evolucao === 'sim'
      )
      .reduce(
        (total, c) => total + parseFloat(c.comissao_valor_calculado || '0'),
        0
      );

    // Próximos agendamentos (próximos 7 dias)
    const proximos7Dias = new Date();
    proximos7Dias.setDate(hoje.getDate() + 7);

    const proximosAgendamentos = consultasAtualArray.filter((c) => {
      const dataConsulta = new Date(c.data_hora);
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
      tipoServico: a.tipo_servico_nome,
      local: a.local_atendimento_nome || 'Local não definido',
      valor: parseFloat(a.comissao_valor_calculado || '0'), // Usar comissao_valor_calculado para profissional
      statusConsulta: a.status_consulta_descricao,
      statusPagamento: a.status_pagamento_descricao,
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
    const { data: consultas, error } = await supabase
      .from('vw_agendamentos_completos')
      .select('*')
      .eq('profissional_id', professionalId)
      .eq('status_consulta_codigo', 'finalizado')
      .eq('possui_evolucao', 'não')
      .eq('ativo', true)
      .order('data_hora', { ascending: false })
      .limit(20);

    if (error) throw error;

    const hoje = new Date();

    return (consultas || []).map((c) => {
      const dataConsulta = new Date(c.data_hora);
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
        valor: parseFloat(c.comissao_valor_calculado || '0'), // Usar comissao_valor_calculado para profissional
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

    // Buscar todas as consultas do ano atual (sem filtrar por status ou evolução)
    const { data: consultas, error } = await supabase
      .from('vw_agendamentos_completos')
      .select('*')
      .eq('profissional_id', professionalId)
      .gte('data_hora', inicioAno.toISOString().split('T')[0])
      .lte('data_hora', fimAno.toISOString().split('T')[0])
      .eq('ativo', true);

    if (error) throw error;

    const consultasArray = consultas || [];

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
      const dataConsulta = new Date(consulta.data_hora);
      const mes = dataConsulta.getMonth() + 1; // getMonth() retorna 0-11
      const valor = parseFloat(consulta.comissao_valor_calculado || '0');

      const dadosExistentes = dadosPorMes.get(mes) || {
        faturamentoTotal: 0,
        faturamentoAReceber: 0,
        consultasRealizadas: 0,
        consultasComEvolucao: 0,
      };

      // Sempre contar consulta realizada
      dadosExistentes.consultasRealizadas += 1;

      // Se tem evolução, contar no faturamento total
      if (consulta.possui_evolucao === 'sim') {
        dadosExistentes.faturamentoTotal += valor;
        dadosExistentes.consultasComEvolucao += 1;

        // Se está finalizada, também contar no faturamento a receber
        if (consulta.status_consulta_codigo === 'finalizado') {
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
