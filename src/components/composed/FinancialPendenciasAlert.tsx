import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Clock } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

// AI dev note: Banner de pendências no topo da Lista de Consultas. Existe porque o
// disparo mensal usa a janela "Mês Anterior": consulta que entra atrasada nunca mais
// aparece e fica órfã para sempre (caso real: Pedro Caversan, 10 sessões de mar/26,
// R$2.620, com TODOS os outros meses pagos). O banner é a rede de segurança — aparece
// sozinho no momento em que o dono já está faturando, sem depender de memória.
// Só renderiza quando há pendência. Lê vw_pendencias_financeiras (cálculo no banco).

interface Pendencias {
  nao_cobradas_qtd: number;
  nao_cobradas_valor: number;
  nao_cobradas_desde: string | null;
  atrasadas_qtd: number;
  atrasadas_valor: number;
}

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    v || 0
  );

const dataBR = (iso?: string | null) => {
  if (!iso) return '';
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', {
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '';
  }
};

interface FinancialPendenciasAlertProps {
  // Aplica o filtro de período "não cobradas" na lista (meses anteriores)
  onVerNaoCobradas?: () => void;
  className?: string;
}

export const FinancialPendenciasAlert: React.FC<
  FinancialPendenciasAlertProps
> = ({ onVerNaoCobradas, className }) => {
  const [dados, setDados] = useState<Pendencias | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const { data, error } = await supabase
        .from('vw_pendencias_financeiras')
        .select('*')
        .maybeSingle();
      if (!cancelado && !error && data) {
        setDados(data as unknown as Pendencias);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  if (!dados) return null;

  const temNaoCobradas = (dados.nao_cobradas_qtd ?? 0) > 0;
  const temAtrasadas = (dados.atrasadas_qtd ?? 0) > 0;
  if (!temNaoCobradas && !temAtrasadas) return null;

  return (
    <div
      className={cn(
        'rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="flex-1 space-y-3">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Pendências financeiras
          </p>

          {temNaoCobradas && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-amber-900 dark:text-amber-200">
                <strong>{dados.nao_cobradas_qtd} consulta(s)</strong> de meses
                anteriores <strong>nunca foram cobradas</strong> —{' '}
                <strong>{brl(Number(dados.nao_cobradas_valor))}</strong>
                {dados.nao_cobradas_desde && (
                  <span className="text-amber-700 dark:text-amber-300">
                    {' '}
                    (a mais antiga de {dataBR(dados.nao_cobradas_desde)})
                  </span>
                )}
              </p>
              {onVerNaoCobradas && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onVerNaoCobradas}
                  className="border-amber-400 bg-white text-amber-900 hover:bg-amber-100"
                >
                  Ver e cobrar
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          )}

          {temAtrasadas && (
            <p className="flex items-center gap-2 text-sm text-amber-900 dark:text-amber-200">
              <Clock className="h-4 w-4 shrink-0 text-amber-600" />
              <span>
                <strong>{dados.atrasadas_qtd} cobrança(s)</strong> já emitidas
                estão <strong>vencidas e não pagas</strong> —{' '}
                <strong>{brl(Number(dados.atrasadas_valor))}</strong>
                <span className="text-amber-700 dark:text-amber-300">
                  {' '}
                  (acompanhe na aba Faturas)
                </span>
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
