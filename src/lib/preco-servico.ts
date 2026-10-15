import { supabase } from '@/lib/supabase';

// AI dev note: Preço de serviço por profissional.
// tipo_servicos.valor é o preço padrão; profissional_servicos.valor (quando
// preenchido) é o preço daquela profissional para aquele serviço.
// Mesma regra de public.fn_valor_servico no banco — manter as duas iguais.

export type PrecosProfissional = Map<string, number>;

const chave = (tipoServicoId: string, profissionalId: string) =>
  `${tipoServicoId}:${profissionalId}`;

const CACHE_MS = 5 * 60 * 1000;
let cache: { at: number; promise: Promise<PrecosProfissional> } | null = null;

export const fetchPrecosProfissional =
  async (): Promise<PrecosProfissional> => {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.promise;

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

    cache = { at: Date.now(), promise };
    promise.catch(() => {
      cache = null;
    });
    return promise;
  };

// Versão síncrona, para telas que já carregaram o mapa (ex.: orçamento).
export const precoNoMapa = (
  precos: PrecosProfissional,
  tipoServico: { id: string; valor: number },
  profissionalId?: string | null
): number => {
  const padrao = Number(tipoServico.valor || 0);
  if (!profissionalId) return padrao;
  return precos.get(chave(tipoServico.id, profissionalId)) ?? padrao;
};

// Resolve o preço de um serviço para uma profissional. Sem profissional (ou
// sem preço específico), devolve o padrão do serviço.
export const valorServicoParaProfissional = async (
  tipoServico: { id: string; valor: number },
  profissionalId?: string | null
): Promise<number> => {
  if (!profissionalId) return Number(tipoServico.valor || 0);
  try {
    const precos = await fetchPrecosProfissional();
    return precoNoMapa(precos, tipoServico, profissionalId);
  } catch {
    // Falha ao buscar a exceção não pode travar o agendamento: cai no padrão
    return Number(tipoServico.valor || 0);
  }
};
