// AI dev note: Mappers para converter dados do Supabase para interfaces do calendário
// Converte agendamentos e pessoas para CalendarEvent e User types

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { CalendarEvent, EventColor } from '@/types/calendar';
import type {
  SupabaseAgendamentoCompleto,
  SupabaseAgendamentoCompletoFlat,
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

// AI dev note: Converte dados flat da view para estrutura aninhada
export const mapAgendamentoFlatToCompleto = (
  flat: SupabaseAgendamentoCompletoFlat
): SupabaseAgendamentoCompleto => {
  if (process.env.NODE_ENV === 'development') {
    console.log('🔄 Mapeando agendamento flat→completo:', {
      id: flat.id,
      data_hora: flat.data_hora,
      paciente_nome: flat.paciente_nome,
      profissional_nome: flat.profissional_nome,
      tipo_servico_nome: flat.tipo_servico_nome,
    });
  }

  const mapped = {
    id: flat.id,
    data_hora: flat.data_hora,
    paciente_id: flat.paciente_id,
    profissional_id: flat.profissional_id,
    tipo_servico_id: flat.tipo_servico_id,
    local_id: flat.local_atendimento_id,
    status_consulta_id: flat.status_consulta_id,
    status_pagamento_id: flat.status_pagamento_id,
    valor_servico: parseFloat(flat.valor_servico || '0'),
    id_pagamento_externo: flat.id_pagamento_externo,
    link_nfe: flat.link_nfe,
    observacao: flat.observacao,
    agendado_por: flat.agendado_por_id,
    criado_por: null, // Não disponível na view
    atualizado_por: null, // Não disponível na view
    created_at: flat.created_at,
    updated_at: flat.updated_at,
    // Objetos aninhados
    paciente: {
      id: flat.paciente_id,
      nome: flat.paciente_nome,
      email: flat.paciente_email,
      telefone: flat.paciente_telefone ? BigInt(flat.paciente_telefone) : null,
      role: flat.paciente_role as
        | 'admin'
        | 'profissional'
        | 'secretaria'
        | null,
      auth_user_id: null, // Não disponível na view
      especialidade: null,
      registro_profissional: null,
      bio_profissional: null,
      foto_perfil: flat.paciente_foto_perfil,
      is_approved: flat.paciente_is_approved,
      profile_complete: flat.paciente_profile_complete,
      ativo: flat.paciente_ativo,
      bloqueado: false, // Assumindo false se não disponível
      created_at: flat.created_at,
      updated_at: flat.updated_at,
    },
    profissional: {
      id: flat.profissional_id,
      nome: flat.profissional_nome,
      email: flat.profissional_email,
      telefone: flat.profissional_telefone
        ? BigInt(flat.profissional_telefone)
        : null,
      role: flat.profissional_role as
        | 'admin'
        | 'profissional'
        | 'secretaria'
        | null,
      auth_user_id: null, // Não disponível na view
      especialidade: flat.profissional_especialidade,
      registro_profissional: flat.profissional_registro_profissional,
      bio_profissional: flat.profissional_bio_profissional,
      foto_perfil: flat.profissional_foto_perfil,
      is_approved: flat.profissional_is_approved,
      profile_complete: flat.profissional_profile_complete,
      ativo: flat.profissional_ativo,
      bloqueado: false, // Assumindo false se não disponível
      created_at: flat.created_at,
      updated_at: flat.updated_at,
    },
    tipo_servico: {
      id: flat.tipo_servico_id,
      nome: flat.tipo_servico_nome,
      descricao: flat.tipo_servico_descricao,
      duracao_minutos: flat.tipo_servico_duracao_minutos,
      valor: parseFloat(flat.tipo_servico_valor || '0'),
      cor: flat.tipo_servico_cor,
      ativo: flat.tipo_servico_ativo,
      criado_por: null, // Não disponível na view
      atualizado_por: null, // Não disponível na view
      created_at: flat.created_at,
      updated_at: flat.updated_at,
    },
    local_atendimento: flat.local_atendimento_id
      ? {
          id: flat.local_atendimento_id,
          nome: flat.local_atendimento_nome || '',
          tipo_local: flat.local_atendimento_tipo_local as
            | 'clinica'
            | 'domiciliar'
            | 'externa',
          ativo: flat.local_atendimento_ativo || false,
          id_endereco: null, // Não disponível na view
          numero_endereco: null, // Não disponível na view
          complemento_endereco: null, // Não disponível na view
          criado_por: null, // Não disponível na view
          atualizado_por: null, // Não disponível na view
          created_at: flat.created_at,
          updated_at: flat.updated_at,
        }
      : null,
    status_consulta: {
      id: flat.status_consulta_id,
      codigo: flat.status_consulta_codigo,
      descricao: flat.status_consulta_descricao,
      cor: flat.status_consulta_cor,
      created_at: flat.created_at,
      updated_at: flat.updated_at,
    },
    status_pagamento: {
      id: flat.status_pagamento_id,
      codigo: flat.status_pagamento_codigo,
      descricao: flat.status_pagamento_descricao,
      cor: flat.status_pagamento_cor,
      created_at: flat.created_at,
      updated_at: flat.updated_at,
    },
    agendado_por_pessoa: {
      id: flat.agendado_por_id,
      nome: flat.agendado_por_nome,
      email: flat.agendado_por_email,
      telefone: null, // Não disponível na view
      role: null, // Não disponível na view
      auth_user_id: null, // Não disponível na view
      especialidade: null,
      registro_profissional: null,
      bio_profissional: null,
      foto_perfil: null,
      is_approved: true, // Assumindo true se conseguiu agendar
      profile_complete: true, // Assumindo true se conseguiu agendar
      ativo: true, // Assumindo true se conseguiu agendar
      bloqueado: false,
      created_at: flat.created_at,
      updated_at: flat.updated_at,
    },
  };

  if (process.env.NODE_ENV === 'development') {
    console.log('✅ Agendamento mapeado com sucesso:', {
      id: mapped.id,
      titulo_gerado: `${mapped.tipo_servico.nome} - ${mapped.paciente.nome}`,
      data_inicio: mapped.data_hora,
      duracao: mapped.tipo_servico.duracao_minutos,
    });
  }

  return mapped;
};

// AI dev note: Converte SupabaseAgendamentoCompleto para CalendarEvent
export const mapAgendamentoToCalendarEvent = (
  agendamento: SupabaseAgendamentoCompleto
): CalendarEvent => {
  // AI dev note: Tratar horário como local removendo timezone para evitar conversão
  // Remove qualquer timezone (+00, Z, etc) para que seja interpretado como horário local
  const localDateString = agendamento.data_hora.replace(
    /[+-]\d{2}:\d{2}$|[+-]\d{2}$|Z$/i,
    ''
  );
  const start = new Date(localDateString);
  const end = new Date(
    start.getTime() + (agendamento.tipo_servico?.duracao_minutos || 60) * 60000
  );

  // AI dev note: Defensive coding - verificar se dados relacionados existem
  const pacienteNome = agendamento.paciente?.nome || 'Paciente não encontrado';
  const profissionalNome =
    agendamento.profissional?.nome || 'Profissional não encontrado';
  const tipoServicoNome =
    agendamento.tipo_servico?.nome || 'Serviço não encontrado';

  return {
    id: agendamento.id,
    title: `${tipoServicoNome} - ${pacienteNome}`,
    description:
      agendamento.observacao || `Atendimento com ${profissionalNome}`,
    start,
    end,
    color: mapSupabaseColorToEventColor(
      agendamento.tipo_servico?.cor || '#3B82F6'
    ),
    attendees: [
      agendamento.paciente?.email,
      agendamento.profissional?.email,
    ].filter(Boolean) as string[],
    location: agendamento.local_atendimento?.nome || 'Local não definido',
    allDay: false,
    // Metadados específicos do Supabase
    metadata: {
      pacienteId: agendamento.paciente_id,
      profissionalId: agendamento.profissional_id,
      tipoServicoId: agendamento.tipo_servico_id,
      statusConsulta:
        agendamento.status_consulta?.descricao || 'Status não encontrado',
      statusPagamento:
        agendamento.status_pagamento?.descricao || 'Status não encontrado',
      valorServico: agendamento.valor_servico,
      localId: agendamento.local_id,
      observacao: agendamento.observacao,
      tipoServicoCor: agendamento.tipo_servico?.cor || '#3B82F6', // Cor original do tipo de serviço
      // Dados adicionais
      profissionalNome,
      statusConsultaCor: agendamento.status_consulta?.cor || '#3B82F6',
      statusPagamentoCor: agendamento.status_pagamento?.cor || '#3B82F6',
    },
  };
};

// AI dev note: Converte dados flat da view diretamente para CalendarEvent
export const mapAgendamentoFlatToCalendarEvent = (
  flat: SupabaseAgendamentoCompletoFlat
): CalendarEvent => {
  // AI dev note: Tratar horário como local removendo timezone para evitar conversão
  const localDateString = flat.data_hora.replace(
    /[+-]\d{2}:\d{2}$|[+-]\d{2}$|Z$/i,
    ''
  );
  const start = new Date(localDateString);
  const end = new Date(
    start.getTime() + flat.tipo_servico_duracao_minutos * 60000
  );

  return {
    id: flat.id,
    title: `${flat.tipo_servico_nome} - ${flat.paciente_nome}`,
    description: flat.observacao || `Atendimento com ${flat.profissional_nome}`,
    start,
    end,
    color: mapSupabaseColorToEventColor(flat.tipo_servico_cor),
    attendees: [flat.paciente_email, flat.profissional_email].filter(
      Boolean
    ) as string[],
    location: flat.local_atendimento_nome || 'Local não definido',
    allDay: false,
    // Metadados específicos da view flat
    metadata: {
      pacienteId: flat.paciente_id,
      profissionalId: flat.profissional_id,
      tipoServicoId: flat.tipo_servico_id,
      statusConsulta: flat.status_consulta_descricao,
      statusPagamento: flat.status_pagamento_descricao,
      valorServico: parseFloat(flat.valor_servico || '0'),
      localId: flat.local_atendimento_id,
      observacao: flat.observacao,
      tipoServicoCor: flat.tipo_servico_cor,
      // Dados extras da view flat
      profissionalNome: flat.profissional_nome,
      responsavelLegalNome: flat.responsavel_legal_nome,
      statusConsultaCor: flat.status_consulta_cor,
      statusPagamentoCor: flat.status_pagamento_cor,
      possuiEvolucao: flat.possui_evolucao,
      // AI dev note: Dados completos para AppointmentDetailsManager
      appointmentData: flat,
    },
  };
};

// AI dev note: Converte CalendarEvent para dados de agendamento do Supabase
export const mapCalendarEventToAgendamento = (
  event: Omit<CalendarEvent, 'id'> & { id?: string },
  currentUserId: string
) => {
  const isUpdate = !!event.id;

  // AI dev note: Para atualizações, undefined significa "não alterar o campo"
  // Para criações, campos obrigatórios devem ter valores válidos
  const baseData = {
    data_hora: event.start.toISOString(),
    paciente_id: isUpdate
      ? (event.metadata?.pacienteId as string) || undefined
      : (event.metadata?.pacienteId as string) || '',
    profissional_id: isUpdate
      ? (event.metadata?.profissionalId as string) || undefined
      : (event.metadata?.profissionalId as string) || '',
    tipo_servico_id: isUpdate
      ? (event.metadata?.tipoServicoId as string) || undefined
      : (event.metadata?.tipoServicoId as string) || '',
    local_id: (event.metadata?.localId as string) || undefined,
    status_consulta_id: isUpdate
      ? (event.metadata?.statusConsultaId as string) || undefined
      : (event.metadata?.statusConsultaId as string) || '',
    status_pagamento_id: isUpdate
      ? (event.metadata?.statusPagamentoId as string) || undefined
      : (event.metadata?.statusPagamentoId as string) || '',
    valor_servico: (event.metadata?.valorServico as number) || 0,
    observacao: event.description || undefined,
    agendado_por: currentUserId,
  };

  // For updates, always include atualizado_por
  if (isUpdate) {
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
