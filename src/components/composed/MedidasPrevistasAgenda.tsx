// Lembrete de medida na agenda: busca, numa chamada só, as medidas previstas
// ou atrasadas das consultas visíveis e mostra um ícone 📐 no cartão.
// Só para admin e profissional (o banco devolve vazio para os demais).

import React, { useEffect, useMemo, useState } from 'react';
import { Ruler } from 'lucide-react';
import { Badge } from '@/components/primitives/badge';
import { cn } from '@/lib/utils';
import { MedidasPrevistasAgendaContext } from './medidas-previstas-agenda-context';
import {
  fetchMedidasPrevistas,
  type MedidaPrevista,
} from '@/lib/motora-medidas';

export const MedidasPrevistasAgendaProvider: React.FC<{
  agendamentoIds: string[];
  ativo: boolean;
  children: React.ReactNode;
}> = ({ agendamentoIds, ativo, children }) => {
  const [mapa, setMapa] = useState<Map<string, MedidaPrevista[]>>(new Map());
  // a lista de eventos é recriada a cada render: só busca quando os ids mudam
  const chave = useMemo(
    () => (ativo ? [...new Set(agendamentoIds)].sort().join(',') : ''),
    [ativo, agendamentoIds]
  );

  useEffect(() => {
    if (!chave) {
      setMapa(new Map());
      return;
    }
    let cancelado = false;
    fetchMedidasPrevistas(chave.split(','))
      .then((linhas) => {
        if (cancelado) return;
        const m = new Map<string, MedidaPrevista[]>();
        for (const l of linhas) {
          m.set(l.agendamento_id, [...(m.get(l.agendamento_id) ?? []), l]);
        }
        setMapa(m);
      })
      .catch((e) => {
        console.error('Erro ao buscar medidas previstas da agenda:', e);
        if (!cancelado) setMapa(new Map());
      });
    return () => {
      cancelado = true;
    };
  }, [chave]);

  return (
    <MedidasPrevistasAgendaContext.Provider value={mapa}>
      {children}
    </MedidasPrevistasAgendaContext.Provider>
  );
};

const descrever = (itens: MedidaPrevista[]) =>
  `Medir nesta sessão: ${itens
    .map((i) => `${i.nome}${i.estado === 'atrasada' ? ' (atrasada)' : ''}`)
    .join(', ')}`;

/** Ícone pequeno para blocos estreitos (semana, mês) */
export const IconeMedidaPrevista: React.FC<{
  itens: MedidaPrevista[];
  className?: string;
}> = ({ itens, className }) => {
  if (itens.length === 0) return null;
  const texto = descrever(itens);
  const atrasada = itens.some((i) => i.estado === 'atrasada');
  return (
    <span
      className={cn(
        'inline-flex flex-shrink-0',
        atrasada ? 'text-red-600' : 'text-amber-600',
        className
      )}
      title={texto}
    >
      <Ruler className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
      <span className="sr-only">{texto}</span>
    </span>
  );
};

/** Selo com o nome das medidas, para cartões maiores (lista, agenda) */
export const SeloMedidaPrevista: React.FC<{ itens: MedidaPrevista[] }> = ({
  itens,
}) => {
  if (itens.length === 0) return null;
  const atrasada = itens.some((i) => i.estado === 'atrasada');
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-xs px-1.5 py-0.5 md:px-2 md:py-1 gap-1',
        atrasada
          ? 'border-red-300 bg-red-50 text-red-900'
          : 'border-amber-300 bg-amber-50 text-amber-900'
      )}
      title={descrever(itens)}
    >
      <Ruler className="h-3 w-3" aria-hidden="true" />
      Medir: {itens.map((i) => i.nome).join(', ')}
    </Badge>
  );
};
