// AI dev note: Mappers para converter dados do Supabase para interfaces do calendário
// Converte agendamentos e pessoas para CalendarEvent e User types

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { CalendarEvent, EventColor } from '@/types/calendar';
import type {
  SupabaseAgendamentoCompleto,
  SupabasePessoa,
  CalendarStats,
  CalendarPermissions,
} from '@/types/supabase-calendar';
import type { AdminUser } from '@/components/templates/dashboard/AdminCalendarTemplate';
import type { ProfissionalUser } from '@/components/templates/dashboard/ProfissionalCalendarTemplate';
import type { SecretariaUser } from '@/components/templates/dashboard/SecretariaCalendarTemplate';

// AI dev note: Mapeamento de cores do Supabase para EventColor
export const mapSupabaseColorToEventColor = (
  supabaseColor: string
): EventColor => {
  const colorMap: Record<string, EventColor> = {
    '#EF4444': 'red',
    '#F97316': 'orange',
    '#EAB308': 'orange', // Mapeando amarelo para laranja
    '#22C55E': 'green',
    '#3B82F6': 'blue',
    '#8B5CF6': 'purple',
    '#EC4899': 'pink',
    '#6B7280': 'gray',
  };

  return colorMap[supabaseColor] || 'blue';
};

// AI dev note: Converte cor EventColor para hex usado no Supabase
export const mapEventColorToHex = (eventColor: EventColor): string => {
  const colorMap: Record<EventColor, string> = {
    red: '#EF4444',
    orange: '#F97316',
    green: '#22C55E',
    blue: '#3B82F6',
    purple: '#8B5CF6',
    pink: '#EC4899',
    gray: '#6B7280',
  };

  return colorMap[eventColor];
};

// AI dev note: Converte SupabaseAgendamentoCompleto para CalendarEvent
export const mapAgendamentoToCalendarEvent = (
  agendamento: SupabaseAgendamentoCompleto
): CalendarEvent => {
  const start = new Date(agendamento.data_hora);
  const end = new Date(
    start.getTime() + agendamento.tipo_servico.duracao_minutos * 60000
  );

  return {
    id: agendamento.id,
    title: `${agendamento.tipo_servico.nome} - ${agendamento.paciente.nome}`,
    description:
      agendamento.observacao ||
      `Atendimento com ${agendamento.profissional.nome}`,
    start,
    end,
    color: mapSupabaseColorToEventColor(agendamento.tipo_servico.cor),
    attendees: [
      agendamento.paciente.email,
      agendamento.profissional.email,
    ].filter(Boolean) as string[],
    location: agendamento.local_atendimento?.nome || 'Local não definido',
    allDay: false,
    // Metadados específicos do Supabase
    metadata: {
      pacienteId: agendamento.paciente_id,
      profissionalId: agendamento.profissional_id,
      tipoServicoId: agendamento.tipo_servico_id,
      statusConsulta: agendamento.status_consulta.descricao,
      statusPagamento: agendamento.status_pagamento.descricao,
      valorServico: agendamento.valor_servico,
      agendadoPor: agendamento.agendado_por_pessoa.nome,
      pacienteNome: agendamento.paciente.nome,
      profissionalNome: agendamento.profissional.nome,
      tipoServicoNome: agendamento.tipo_servico.nome,
      duracao: agendamento.tipo_servico.duracao_minutos,
    },
  };
};

// AI dev note: Converte CalendarEvent para dados de agendamento do Supabase
export const mapCalendarEventToAgendamento = (
  event: Omit<CalendarEvent, 'id'> & { id?: string },
  currentUserId: string
) => {
  const baseData = {
    data_hora: event.start.toISOString(),
    paciente_id: (event.metadata?.pacienteId as string) || '',
    profissional_id: (event.metadata?.profissionalId as string) || '',
    tipo_servico_id: (event.metadata?.tipoServicoId as string) || '',
    local_id: (event.metadata?.localId as string) || undefined,
    status_consulta_id: (event.metadata?.statusConsultaId as string) || '',
    status_pagamento_id: (event.metadata?.statusPagamentoId as string) || '',
    valor_servico: (event.metadata?.valorServico as number) || 0,
    observacao: event.description || undefined,
    agendado_por: currentUserId,
  };

  // For updates, always include atualizado_por
  if (event.id) {
    return {
      ...baseData,
      atualizado_por: currentUserId,
    };
  }

  // For creates, include criado_por
  return {
    ...baseData,
    criado_por: currentUserId,
  };
};

// AI dev note: Converte SupabasePessoa para AdminUser
export const mapPessoaToAdminUser = (pessoa: SupabasePessoa): AdminUser => {
  return {
    id: pessoa.id,
    name: pessoa.nome,
    email: pessoa.email || '',
    role: 'admin',
    avatar: pessoa.foto_perfil || undefined,
  };
};

// AI dev note: Converte SupabasePessoa para ProfissionalUser
export const mapPessoaToProfissionalUser = (
  pessoa: SupabasePessoa
): ProfissionalUser => {
  return {
    id: pessoa.id,
    name: pessoa.nome,
    email: pessoa.email || '',
    role: 'profissional',
    avatar: pessoa.foto_perfil || undefined,
    specialization: pessoa.especialidade || undefined,
    registrationNumber: pessoa.registro_profissional || undefined,
  };
};

// AI dev note: Converte SupabasePessoa para SecretariaUser
export const mapPessoaToSecretariaUser = (
  pessoa: SupabasePessoa
): SecretariaUser => {
  return {
    id: pessoa.id,
    name: pessoa.nome,
    email: pessoa.email || '',
    role: 'secretaria',
    avatar: pessoa.foto_perfil || undefined,
    authorizedProfessionals: [], // Será carregado separadamente
  };
};

// AI dev note: Calcula estatísticas do calendário a partir dos agendamentos
export const calculateCalendarStats = (
  agendamentos: SupabaseAgendamentoCompleto[]
): CalendarStats => {
  const now = new Date();
  const proximosEventos = agendamentos.filter(
    (agendamento) => new Date(agendamento.data_hora) > now
  ).length;

  const participantesUnicos = new Set(
    agendamentos.flatMap((ag) => [ag.paciente_id, ag.profissional_id])
  ).size;

  const eventosPorStatus = agendamentos.reduce(
    (acc, ag) => {
      const status = ag.status_consulta.descricao;
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const eventosPorTipoServico = agendamentos.reduce(
    (acc, ag) => {
      const tipo = ag.tipo_servico.nome;
      acc[tipo] = (acc[tipo] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const valorTotalServicos = agendamentos.reduce(
    (total, ag) => total + ag.valor_servico,
    0
  );

  return {
    totalEventos: agendamentos.length,
    proximosEventos,
    participantesUnicos,
    eventosPorStatus,
    eventosPorTipoServico,
    valorTotalServicos,
  };
};

// AI dev note: Determina permissões do calendário baseado no role e permissões específicas
export const calculateCalendarPermissions = (
  userRole: 'admin' | 'profissional' | 'secretaria',
  userId: string,
  allowedProfessionals: string[] = []
): CalendarPermissions => {
  switch (userRole) {
    case 'admin':
      return {
        canCreateEvents: true,
        canEditEvents: true,
        canDeleteEvents: true,
        canViewAllEvents: true,
        allowedProfessionals: [], // Admin pode ver todos
      };

    case 'profissional':
      return {
        canCreateEvents: true,
        canEditEvents: true,
        canDeleteEvents: true,
        canViewAllEvents: false,
        allowedProfessionals: [userId], // Apenas próprios eventos
      };

    case 'secretaria':
      return {
        canCreateEvents: true,
        canEditEvents: true,
        canDeleteEvents: false, // Secretária não pode deletar
        canViewAllEvents: false,
        allowedProfessionals, // Profissionais autorizados
      };

    default:
      return {
        canCreateEvents: false,
        canEditEvents: false,
        canDeleteEvents: false,
        canViewAllEvents: false,
        allowedProfessionals: [],
      };
  }
};

// AI dev note: Formata display de evento para diferentes contextos
export const formatEventDisplay = (
  event: CalendarEvent,
  context: 'compact' | 'default' | 'detailed' = 'default'
): {
  title: string;
  subtitle: string;
  timeDisplay: string;
  locationDisplay: string;
} => {
  const timeDisplay = format(event.start, 'HH:mm', { locale: ptBR });
  const duration = Math.round(
    (event.end.getTime() - event.start.getTime()) / 60000
  );

  switch (context) {
    case 'compact':
      return {
        title: (event.metadata?.tipoServicoNome as string) || 'Evento',
        subtitle: (event.metadata?.pacienteNome as string) || 'Paciente',
        timeDisplay,
        locationDisplay: event.location || '',
      };

    case 'detailed':
      return {
        title: (event.metadata?.tipoServicoNome as string) || 'Evento',
        subtitle: `${(event.metadata?.pacienteNome as string) || 'Paciente'} - ${(event.metadata?.profissionalNome as string) || 'Profissional'}`,
        timeDisplay: `${timeDisplay} (${duration}min)`,
        locationDisplay: event.location || '',
      };

    default:
      return {
        title: (event.metadata?.tipoServicoNome as string) || 'Evento',
        subtitle: (event.metadata?.pacienteNome as string) || 'Paciente',
        timeDisplay,
        locationDisplay: event.location || '',
      };
  }
};
