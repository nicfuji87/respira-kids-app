import { supabase } from '@/lib/supabase';
import type {
  SessionMediaWithDocument,
  SessionMediaGroup,
  MediaFilters,
} from '@/types/session-media';

// AI dev note: API view-only para session_media + document_storage
// Busca mídias agrupadas por sessão/agendamento para MediaGallery da Fase 4
// Corrigido para primeiro buscar agendamentos do paciente, depois as mídias

/**
 * Buscar todas as mídias de um paciente agrupadas por sessão
 * AI dev note: A query nested filter não funciona no Supabase (.in('agendamento.paciente_id'))
 * Por isso, primeiro buscamos os agendamentos do paciente, depois as mídias
 */
export async function fetchMediaByPatient(
  patientId: string,
  filters?: MediaFilters
): Promise<SessionMediaGroup[]> {
  try {
    // AI dev note: Primeiro buscar IDs dos agendamentos do paciente
    const { data: agendamentos, error: agendamentosError } = await supabase
      .from('agendamentos')
      .select(
        'id, data_hora, profissional:pessoas!profissional_id(nome), tipo_servico:tipo_servicos(nome)'
      )
      .eq('paciente_id', patientId)
      .eq('ativo', true)
      .order('data_hora', { ascending: false });

    if (agendamentosError) {
      console.error(
        'Erro ao buscar agendamentos do paciente:',
        agendamentosError
      );
      throw new Error(agendamentosError.message);
    }

    if (!agendamentos || agendamentos.length === 0) {
      return [];
    }

    // AI dev note: Filtrar por data se necessário
    let filteredAgendamentos = agendamentos;
    if (filters?.data_inicio) {
      filteredAgendamentos = filteredAgendamentos.filter(
        (a) => new Date(a.data_hora) >= new Date(filters.data_inicio!)
      );
    }
    if (filters?.data_fim) {
      filteredAgendamentos = filteredAgendamentos.filter(
        (a) => new Date(a.data_hora) <= new Date(filters.data_fim!)
      );
    }

    const agendamentoIds = filteredAgendamentos.map((a) => a.id);

    if (agendamentoIds.length === 0) {
      return [];
    }

    // AI dev note: Agora buscar mídias para esses agendamentos
    let query = supabase
      .from('session_media')
      .select(
        `
        *,
        document:document_storage(*)
      `
      )
      .eq('ativo', true)
      .eq('visivel_paciente', true)
      .in('agendamento_id', agendamentoIds)
      .order('created_at', { ascending: false });

    // Aplicar filtros de tipo e momento
    if (filters?.tipo_midia && filters.tipo_midia !== 'all') {
      query = query.eq('tipo_midia', filters.tipo_midia);
    }

    if (filters?.momento_sessao && filters.momento_sessao !== 'all') {
      query = query.eq('momento_sessao', filters.momento_sessao);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar mídias do paciente:', error);
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      return [];
    }

    // AI dev note: Criar mapa de agendamentos para lookup rápido
    const agendamentoMap = new Map(filteredAgendamentos.map((a) => [a.id, a]));

    // Agrupar por agendamento/sessão
    const groupedMedia = data.reduce(
      (acc: Record<string, SessionMediaGroup>, item) => {
        const agendamentoId = item.agendamento_id;
        const agendamento = agendamentoMap.get(agendamentoId);

        if (!acc[agendamentoId]) {
          // AI dev note: Supabase retorna joins como arrays, então acessamos [0]
          const profissionalData = agendamento?.profissional as
            | { nome: string }[]
            | null;
          const tipoServicoData = agendamento?.tipo_servico as
            | { nome: string }[]
            | null;

          acc[agendamentoId] = {
            agendamento_id: agendamentoId,
            data_sessao: agendamento?.data_hora || '',
            profissional_nome: profissionalData?.[0]?.nome || 'Não informado',
            tipo_servico: tipoServicoData?.[0]?.nome || 'Não informado',
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
    // AI dev note: Primeiro buscar agendamentos do paciente
    const { data: agendamentos, error: agendamentosError } = await supabase
      .from('agendamentos')
      .select('id')
      .eq('paciente_id', patientId);

    if (agendamentosError) {
      console.error(
        'Erro ao buscar agendamentos do paciente:',
        agendamentosError
      );
      return 0;
    }

    if (!agendamentos || agendamentos.length === 0) {
      return 0;
    }

    // AI dev note: Contar mídias dos agendamentos encontrados
    const agendamentoIds = agendamentos.map((a) => a.id);
    const { count, error } = await supabase
      .from('session_media')
      .select('*', { count: 'exact', head: true })
      .eq('ativo', true)
      .eq('visivel_paciente', true)
      .in('agendamento_id', agendamentoIds);

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

// AI dev note: Funções de upload para session_media + document_storage
// Bucket: respira-sessions, path: {agendamento_id}/{timestamp}.{ext}

interface UploadSessionMediaParams {
  file: File;
  agendamentoId: string;
  tipoMidia: 'foto' | 'video' | 'audio' | 'documento';
  momentoSessao?: 'pre_sessao' | 'durante_sessao' | 'pos_sessao';
  descricao?: string;
  criadoPor?: string;
}

interface UploadSessionMediaResult {
  success: boolean;
  media?: SessionMediaWithDocument;
  error?: string;
}

/**
 * Upload de mídia para sessão - salva no bucket e registra nas tabelas
 */
export async function uploadSessionMedia(
  params: UploadSessionMediaParams
): Promise<UploadSessionMediaResult> {
  const {
    file,
    agendamentoId,
    tipoMidia,
    momentoSessao = 'durante_sessao',
    descricao,
    criadoPor,
  } = params;

  try {
    // AI dev note: Validar arquivo
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return {
        success: false,
        error: `Arquivo muito grande. Máximo ${maxSize / 1024 / 1024}MB permitido.`,
      };
    }

    // Gerar nome único do arquivo
    const timestamp = Date.now();
    const fileExtension = file.name.split('.').pop() || 'jpg';
    const fileName = `${timestamp}.${fileExtension}`;
    const filePath = `${agendamentoId}/${fileName}`;

    console.log('📁 Uploading mídia para:', filePath);

    // AI dev note: 1. Upload para Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('respira-sessions')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('❌ Erro no upload:', uploadError);
      return {
        success: false,
        error: `Erro ao fazer upload: ${uploadError.message}`,
      };
    }

    console.log('✅ Upload concluído:', uploadData.path);

    // AI dev note: 2. Gerar URL pública (assinada) do arquivo
    const { data: urlData, error: urlError } = await supabase.storage
      .from('respira-sessions')
      .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 ano

    if (urlError) {
      console.error('❌ Erro ao gerar URL:', urlError);
      // Tentar limpar o arquivo uploaded
      await supabase.storage.from('respira-sessions').remove([filePath]);
      return {
        success: false,
        error: `Erro ao gerar URL: ${urlError.message}`,
      };
    }

    // AI dev note: 3. Criar registro em document_storage
    const { data: documentData, error: documentError } = await supabase
      .from('document_storage')
      .insert({
        nome_arquivo: fileName,
        nome_original: file.name,
        bucket_name: 'respira-sessions',
        caminho_arquivo: filePath,
        url_publica: urlData?.signedUrl || null,
        tipo_documento:
          tipoMidia === 'foto'
            ? 'foto_sessao'
            : tipoMidia === 'video'
              ? 'video_sessao'
              : 'arquivo_paciente',
        mime_type: file.type,
        tamanho_bytes: file.size,
        agendamento_relacionado_id: agendamentoId,
        criado_por: criadoPor || null,
      })
      .select()
      .single();

    if (documentError) {
      console.error('❌ Erro ao criar document_storage:', documentError);
      // Tentar limpar o arquivo uploaded
      await supabase.storage.from('respira-sessions').remove([filePath]);
      return {
        success: false,
        error: `Erro ao registrar documento: ${documentError.message}`,
      };
    }

    console.log('✅ Document storage criado:', documentData.id);

    // AI dev note: 4. Criar registro em session_media
    const { data: sessionMediaData, error: sessionMediaError } = await supabase
      .from('session_media')
      .insert({
        agendamento_id: agendamentoId,
        document_storage_id: documentData.id,
        tipo_midia: tipoMidia,
        momento_sessao: momentoSessao,
        descricao: descricao || null,
        timestamp_captura: new Date().toISOString(),
        visivel_paciente: true,
        usado_relatorio: false,
        ativo: true,
        criado_por: criadoPor || null,
      })
      .select()
      .single();

    if (sessionMediaError) {
      console.error('❌ Erro ao criar session_media:', sessionMediaError);
      // Tentar limpar registros criados
      await supabase
        .from('document_storage')
        .delete()
        .eq('id', documentData.id);
      await supabase.storage.from('respira-sessions').remove([filePath]);
      return {
        success: false,
        error: `Erro ao registrar mídia: ${sessionMediaError.message}`,
      };
    }

    console.log('✅ Session media criado:', sessionMediaData.id);

    // AI dev note: 5. Retornar mídia completa
    return {
      success: true,
      media: {
        ...sessionMediaData,
        document: documentData,
      } as SessionMediaWithDocument,
    };
  } catch (err) {
    console.error('❌ Erro geral no upload:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro desconhecido no upload',
    };
  }
}

/**
 * Deletar mídia de sessão - remove do bucket e das tabelas
 */
export async function deleteSessionMedia(
  mediaId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // AI dev note: 1. Buscar mídia e documento associado
    const { data: media, error: mediaError } = await supabase
      .from('session_media')
      .select('*, document:document_storage(*)')
      .eq('id', mediaId)
      .single();

    if (mediaError || !media) {
      return { success: false, error: 'Mídia não encontrada' };
    }

    const document = media.document as {
      bucket_name: string;
      caminho_arquivo: string;
      id: string;
    };

    // AI dev note: 2. Deletar arquivo do storage
    const { error: storageError } = await supabase.storage
      .from(document.bucket_name)
      .remove([document.caminho_arquivo]);

    if (storageError) {
      console.error('Erro ao deletar do storage:', storageError);
      // Continuar mesmo com erro no storage
    }

    // AI dev note: 3. Soft delete em session_media
    const { error: softDeleteError } = await supabase
      .from('session_media')
      .update({ ativo: false })
      .eq('id', mediaId);

    if (softDeleteError) {
      return {
        success: false,
        error: `Erro ao deletar mídia: ${softDeleteError.message}`,
      };
    }

    // AI dev note: 4. Soft delete em document_storage
    await supabase
      .from('document_storage')
      .update({ ativo: false })
      .eq('id', document.id);

    return { success: true };
  } catch (err) {
    console.error('Erro ao deletar mídia:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao deletar mídia',
    };
  }
}
