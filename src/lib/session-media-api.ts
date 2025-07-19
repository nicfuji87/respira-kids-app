import { supabase } from '@/lib/supabase';
import type {
  SessionMediaWithDocument,
  SessionMediaGroup,
  MediaFilters,
} from '@/types/session-media';

// AI dev note: API view-only para session_media + document_storage
// Busca mídias agrupadas por sessão/agendamento para MediaGallery da Fase 4

/**
 * Buscar todas as mídias de um paciente agrupadas por sessão
 */
export async function fetchMediaByPatient(
  patientId: string,
  filters?: MediaFilters
): Promise<SessionMediaGroup[]> {
  try {
    let query = supabase
      .from('session_media')
      .select(
        `
        *,
        document:document_storage(*),
        agendamento:agendamentos(
          id,
          data_hora,
          profissional:pessoas!profissional_id(nome),
          tipo_servico:tipo_servicos(nome)
        )
      `
      )
      .eq('ativo', true)
      .eq('visivel_paciente', true)
      .in('agendamento.paciente_id', [patientId])
      .order('created_at', { ascending: false });

    // Aplicar filtros
    if (filters?.tipo_midia && filters.tipo_midia !== 'all') {
      query = query.eq('tipo_midia', filters.tipo_midia);
    }

    if (filters?.momento_sessao && filters.momento_sessao !== 'all') {
      query = query.eq('momento_sessao', filters.momento_sessao);
    }

    if (filters?.data_inicio) {
      query = query.gte('agendamento.data_hora', filters.data_inicio);
    }

    if (filters?.data_fim) {
      query = query.lte('agendamento.data_hora', filters.data_fim);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar mídias do paciente:', error);
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Agrupar por agendamento/sessão
    const groupedMedia = data.reduce(
      (acc: Record<string, SessionMediaGroup>, item) => {
        const agendamentoId = item.agendamento_id;

        if (!acc[agendamentoId]) {
          acc[agendamentoId] = {
            agendamento_id: agendamentoId,
            data_sessao: item.agendamento?.data_hora || '',
            profissional_nome:
              item.agendamento?.profissional?.nome || 'Não informado',
            tipo_servico:
              item.agendamento?.tipo_servico?.nome || 'Não informado',
            medias: [],
          };
        }

        acc[agendamentoId].medias.push({
          ...item,
          document: item.document,
        } as SessionMediaWithDocument);

        return acc;
      },
      {}
    );

    // Converter para array e ordenar por data (mais recente primeiro)
    return Object.values(groupedMedia).sort(
      (a, b) =>
        new Date(b.data_sessao).getTime() - new Date(a.data_sessao).getTime()
    );
  } catch (err) {
    console.error('Erro ao buscar mídias do paciente:', err);
    throw err;
  }
}

/**
 * Buscar mídias de uma sessão específica
 */
export async function fetchMediaBySession(
  agendamentoId: string
): Promise<SessionMediaWithDocument[]> {
  try {
    const { data, error } = await supabase
      .from('session_media')
      .select(
        `
        *,
        document:document_storage(*)
      `
      )
      .eq('agendamento_id', agendamentoId)
      .eq('ativo', true)
      .eq('visivel_paciente', true)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Erro ao buscar mídias da sessão:', error);
      throw new Error(error.message);
    }

    return (data || []).map((item) => ({
      ...item,
      document: item.document,
    })) as SessionMediaWithDocument[];
  } catch (err) {
    console.error('Erro ao buscar mídias da sessão:', err);
    throw err;
  }
}

/**
 * Contar total de mídias do paciente
 */
export async function countMediaByPatient(patientId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('session_media')
      .select('*', { count: 'exact', head: true })
      .eq('ativo', true)
      .eq('visivel_paciente', true)
      .in('agendamento.paciente_id', [patientId]);

    if (error) {
      console.error('Erro ao contar mídias do paciente:', error);
      return 0;
    }

    return count || 0;
  } catch (err) {
    console.error('Erro ao contar mídias do paciente:', err);
    return 0;
  }
}

/**
 * Verificar se o usuário pode baixar mídias (admin/secretaria)
 */
export function canDownloadMedia(userRole?: string): boolean {
  return userRole === 'admin' || userRole === 'secretaria';
}

/**
 * Gerar URL de download segura (se permitido)
 */
export async function getMediaDownloadUrl(
  media: SessionMediaWithDocument,
  userRole?: string
): Promise<string | null> {
  if (!canDownloadMedia(userRole)) {
    return null;
  }

  try {
    const { data, error } = await supabase.storage
      .from(media.document.bucket_name)
      .createSignedUrl(media.document.caminho_arquivo, 300); // 5 minutos

    if (error) {
      console.error('Erro ao gerar URL de download:', error);
      return null;
    }

    return data?.signedUrl || null;
  } catch (err) {
    console.error('Erro ao gerar URL de download:', err);
    return null;
  }
}
