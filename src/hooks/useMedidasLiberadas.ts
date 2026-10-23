// Piloto da programação de medidas: o usuário logado está liberado?
// (admin sempre; profissional só se estiver no piloto). Pergunta ao banco
// uma vez por sessão do navegador; quem não está liberado vê a evolução e a
// agenda como antes. O banco também barra as funções, isto é só a tela.

import { useEffect, useState } from 'react';
import { fetchMedidasLiberado } from '@/lib/motora-medidas';

let consulta: Promise<boolean> | null = null;

/** Para a aba de configuração: depois de mudar o piloto, perguntar de novo */
export const esquecerMedidasLiberadas = () => {
  consulta = null;
};

export function useMedidasLiberadas(ativo: boolean): boolean {
  const [liberado, setLiberado] = useState(false);
  useEffect(() => {
    if (!ativo) {
      setLiberado(false);
      return;
    }
    let cancelado = false;
    consulta ??= fetchMedidasLiberado().catch((e) => {
      console.error('Erro ao consultar piloto de medidas:', e);
      consulta = null;
      return false;
    });
    consulta.then((v) => {
      if (!cancelado) setLiberado(v);
    });
    return () => {
      cancelado = true;
    };
  }, [ativo]);
  return liberado;
}
