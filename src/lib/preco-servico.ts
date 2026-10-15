import { supabase } from '@/lib/supabase';

// AI dev note: Regra de preço do serviço, do mais específico ao geral:
//   1. paciente_precos (acordo do paciente: parceria, desconto combinado)
//   2. profissional_servicos.valor (preço próprio da profissional)
//   3. tipo_servicos.valor (preço padrão)
// Mesma regra de public.fn_valor_servico no banco — manter as duas iguais.
// É só o valor SUGERIDO: quem agenda pode mudar o valor na hora.

export type PrecosProfissional = Map<string, number>;
export type PrecosPaciente = Map<string, { valor: number; motivo: string }>;

export type OrigemPreco = 'paciente' | 'profissional' | 'padrao';

export interface PrecoResolvido {
  valor: number;
  origem: OrigemPreco;
  motivo?: string;
}

const chave = (tipoServicoId: string, profissionalId: string) =>
  `${tipoServicoId}:${profissionalId}`;

const CACHE_MS = 5 * 60 * 1000;
let cacheProfissional: {
  at: number;
  promise: Promise<PrecosProfissional>;
} | null = null;
const cachePaciente = new Map<
  string,
  { at: number; promise: Promise<PrecosPaciente> }
>();

export const invalidarCachePrecos = () => {
  cacheProfissional = null;
  cachePaciente.clear();
};

export const fetchPrecosProfissional =
  async (): Promise<PrecosProfissional> => {
    if (cacheProfissional && Date.now() - cacheProfissional.at < CACHE_MS)
      return cacheProfissional.promise;

    const promise = (async () => {
      const { data, error } = await supabase
        .from('profissional_servicos')
        .select('id_profissional, id_tipo_servico, valor')
        .eq('ativo', true)
        .not('valor', 'is', null);

      if (error) {
        console.error('Erro ao buscar preços por profissional:', error);
        throw error;
      }

      const mapa: PrecosProfissional = new Map();
      for (const row of data || []) {
        mapa.set(
          chave(row.id_tipo_servico, row.id_profissional),
          Number(row.valor)
        );
      }
      return mapa;
    })();

    cacheProfissional = { at: Date.now(), promise };
    promise.catch(() => {
      cacheProfissional = null;
    });
    return promise;
  };

export const fetchPrecosPaciente = async (
  pacienteId: string
): Promise<PrecosPaciente> => {
  const cached = cachePaciente.get(pacienteId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.promise;

  const promise = (async () => {
    const { data, error } = await supabase
      .from('paciente_precos')
      .select('tipo_servico_id, valor, motivo')
      .eq('paciente_id', pacienteId)
      .eq('ativo', true);

    if (error) {
      console.error('Erro ao buscar preços do paciente:', error);
      throw error;
    }

    const mapa: PrecosPaciente = new Map();
    for (const row of data || []) {
      mapa.set(row.tipo_servico_id, {
        valor: Number(row.valor),
        motivo: row.motivo,
      });
    }
    return mapa;
  })();

  cachePaciente.set(pacienteId, { at: Date.now(), promise });
  promise.catch(() => {
    cachePaciente.delete(pacienteId);
  });
  return promise;
};

// Versão síncrona, para telas que já carregaram os mapas (ex.: orçamento).
export const resolverPrecoNosMapas = (
  tipoServico: { id: string; valor: number },
  {
    precosProfissional,
    precosPaciente,
    profissionalId,
  }: {
    precosProfissional?: PrecosProfissional;
    precosPaciente?: PrecosPaciente;
    profissionalId?: string | null;
  }
): PrecoResolvido => {
  const doPaciente = precosPaciente?.get(tipoServico.id);
  if (doPaciente) {
    return {
      valor: doPaciente.valor,
      origem: 'paciente',
      motivo: doPaciente.motivo,
    };
  }
  const daProfissional = profissionalId
    ? precosProfissional?.get(chave(tipoServico.id, profissionalId))
    : undefined;
  if (daProfissional !== undefined) {
    return { valor: daProfissional, origem: 'profissional' };
  }
  return { valor: Number(tipoServico.valor || 0), origem: 'padrao' };
};

// Resolve o preço sugerido de um serviço. Falha ao buscar as exceções não
// pode travar o agendamento: cai no próximo nível da regra.
export const resolverPrecoServico = async (
  tipoServico: { id: string; valor: number },
  {
    profissionalId,
    pacienteId,
  }: { profissionalId?: string | null; pacienteId?: string | null }
): Promise<PrecoResolvido> => {
  const [precosProfissional, precosPaciente] = await Promise.all([
    profissionalId
      ? fetchPrecosProfissional().catch(() => undefined)
      : undefined,
    pacienteId
      ? fetchPrecosPaciente(pacienteId).catch(() => undefined)
      : undefined,
  ]);
  return resolverPrecoNosMapas(tipoServico, {
    precosProfissional,
    precosPaciente,
    profissionalId,
  });
};

export const descreverOrigemPreco = (preco: PrecoResolvido): string | null => {
  if (preco.origem === 'paciente')
    return `Preço especial do paciente${preco.motivo ? ` (${preco.motivo})` : ''}`;
  if (preco.origem === 'profissional') return 'Preço da profissional';
  return null;
};

// ---------------------------------------------------------------------
// Preço por profissional (tela de Serviços)
// ---------------------------------------------------------------------

export interface PrecoProfissionalLinha {
  profissionalId: string;
  valor: number | null;
}

export const listarPrecosProfissionalDoServico = async (
  tipoServicoId: string
): Promise<PrecoProfissionalLinha[]> => {
  const { data, error } = await supabase
    .from('profissional_servicos')
    .select('id_profissional, valor')
    .eq('id_tipo_servico', tipoServicoId)
    .eq('ativo', true)
    .not('valor', 'is', null);

  if (error) throw error;
  return (data || []).map((row) => ({
    profissionalId: row.id_profissional,
    valor: Number(row.valor),
  }));
};

// valor null = volta para o preço padrão do serviço.
export const salvarPrecoProfissional = async (
  tipoServicoId: string,
  profissionalId: string,
  valor: number | null,
  pessoaId?: string
): Promise<void> => {
  const { error } = await supabase.from('profissional_servicos').upsert(
    {
      id_tipo_servico: tipoServicoId,
      id_profissional: profissionalId,
      valor,
      ativo: true,
      atualizado_por: pessoaId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id_profissional,id_tipo_servico' }
  );
  if (error) throw error;
  invalidarCachePrecos();
};

// ---------------------------------------------------------------------
// Preço especial do paciente (ficha do paciente)
// ---------------------------------------------------------------------

export interface PrecoPacienteLinha {
  id: string;
  tipoServicoId: string;
  servicoNome: string;
  servicoValorPadrao: number;
  valor: number;
  motivo: string;
  createdAt: string;
  criadoPorNome: string | null;
}

export const listarPrecosPaciente = async (
  pacienteId: string
): Promise<PrecoPacienteLinha[]> => {
  const { data, error } = await supabase
    .from('paciente_precos')
    .select(
      'id, tipo_servico_id, valor, motivo, created_at, servico:tipo_servicos (nome, valor), criador:pessoas!paciente_precos_criado_por_fkey (nome)'
    )
    .eq('paciente_id', pacienteId)
    .eq('ativo', true)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => {
    const servico = (
      Array.isArray(row.servico) ? row.servico[0] : row.servico
    ) as { nome: string; valor: number } | null;
    const criador = (
      Array.isArray(row.criador) ? row.criador[0] : row.criador
    ) as { nome: string } | null;
    return {
      id: row.id,
      tipoServicoId: row.tipo_servico_id,
      servicoNome: servico?.nome?.replace(/\s+/g, ' ').trim() || 'Serviço',
      servicoValorPadrao: Number(servico?.valor || 0),
      valor: Number(row.valor),
      motivo: row.motivo,
      createdAt: row.created_at,
      criadoPorNome: criador?.nome || null,
    };
  });
};

// Troca o preço vigente: desativa o anterior (fica de histórico) e cria o novo.
export const salvarPrecoPaciente = async ({
  pacienteId,
  tipoServicoId,
  valor,
  motivo,
  pessoaId,
}: {
  pacienteId: string;
  tipoServicoId: string;
  valor: number;
  motivo: string;
  pessoaId?: string;
}): Promise<void> => {
  const { error: errDesativar } = await supabase
    .from('paciente_precos')
    .update({
      ativo: false,
      atualizado_por: pessoaId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('paciente_id', pacienteId)
    .eq('tipo_servico_id', tipoServicoId)
    .eq('ativo', true);
  if (errDesativar) throw errDesativar;

  const { error } = await supabase.from('paciente_precos').insert({
    paciente_id: pacienteId,
    tipo_servico_id: tipoServicoId,
    valor,
    motivo: motivo.trim(),
    criado_por: pessoaId ?? null,
  });
  if (error) throw error;
  invalidarCachePrecos();
};

export const removerPrecoPaciente = async (
  id: string,
  pessoaId?: string
): Promise<void> => {
  const { error } = await supabase
    .from('paciente_precos')
    .update({
      ativo: false,
      atualizado_por: pessoaId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
  invalidarCachePrecos();
};
