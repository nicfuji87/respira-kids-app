// AI dev note: Resolve o motivo REAL da rejeição de uma NFe para exibir na UI.
// Não dá para confiar em faturas.status_nfe: quem grava link_nfe='erro' é o
// webhook de NFe (n8n), que não mexe em status_nfe — a coluna fica com o último
// texto do app, quase sempre um marcador de sucesso. Era assim que a tela
// mostrava "Erro na emissão da NFe: Emitida com sucesso - aguardando link".
// Quando o texto guardado não explica nada, buscamos a mensagem da prefeitura
// no ASAAS (e o fetch grava de volta em status_nfe, curando a fatura).

import { useCallback, useState } from 'react';
import { fetchMotivoErroNfe, motivoErroNfeArmazenado } from '@/lib/faturas-api';

export const MOTIVO_ERRO_NFE_DESCONHECIDO =
  'O ASAAS não informou o motivo da rejeição. Confirme para corrigir a nota e emitir novamente.';

export function useMotivoErroNfe() {
  const [motivo, setMotivo] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  // Devolve o texto pronto para o toast e deixa `motivo` atualizado para o diálogo.
  const resolverMotivo = useCallback(
    async (
      statusNfe?: string | null,
      idAsaas?: string | null
    ): Promise<string> => {
      const armazenado = motivoErroNfeArmazenado(statusNfe);
      setMotivo(armazenado);

      if (armazenado || !idAsaas) {
        return armazenado || MOTIVO_ERRO_NFE_DESCONHECIDO;
      }

      setBuscando(true);
      try {
        const resultado = await fetchMotivoErroNfe(idAsaas);
        const real = resultado.success ? (resultado.data ?? null) : null;
        setMotivo(real);
        return real || MOTIVO_ERRO_NFE_DESCONHECIDO;
      } finally {
        setBuscando(false);
      }
    },
    []
  );

  return { motivo, buscando, resolverMotivo };
}
