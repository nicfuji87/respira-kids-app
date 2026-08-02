// AI dev note: Aviso de credencial externa perto de vencer. Existe por causa de um
// modo de falha específico: o certificado do Banco Inter vale 12 meses e, quando
// vence, a cobrança Pix simplesmente para de ser emitida — sem erro visível para
// quem está no balcão. O aviso aparece 45 dias antes (dias_aviso na tabela).
//
// Fica silencioso o ano inteiro: a view vw_credenciais_a_vencer só devolve linha
// dentro da janela, então normalmente este componente não renderiza nada.

import React, { useEffect, useState } from 'react';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchCredenciaisAVencer } from '@/lib/produtos-api';
import type { CredencialAVencer } from '@/types/produtos';

export const CredencialVencimentoAlert: React.FC<{ className?: string }> = ({
  className,
}) => {
  const [credenciais, setCredenciais] = useState<CredencialAVencer[]>([]);

  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const dados = await fetchCredenciaisAVencer();
        if (ativo) setCredenciais(dados);
      } catch (err) {
        // um aviso que falha ao carregar não pode atrapalhar a tela
        console.warn('[CredencialVencimentoAlert] não carregou:', err);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  if (credenciais.length === 0) return null;

  return (
    <div className={cn('space-y-2', className)}>
      {credenciais.map((c) => (
        <div
          key={c.chave}
          className={cn(
            'rounded-xl border p-4',
            c.vencida
              ? 'border-destructive/40 bg-destructive/5'
              : 'border-amarelo-pipa/40 bg-amarelo-pipa/10'
          )}
        >
          <div className="flex items-start gap-3">
            {c.vencida ? (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            ) : (
              <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amarelo-pipa" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {c.vencida
                  ? `${c.descricao} — VENCIDO`
                  : `${c.descricao} vence em ${c.dias_restantes} dia${c.dias_restantes === 1 ? '' : 's'}`}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {c.vencida
                  ? 'A cobrança por Pix está fora do ar até renovar.'
                  : 'Depois do vencimento, a cobrança por Pix para de funcionar sem aviso.'}
              </p>
              {c.instrucao_renovacao && (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {c.instrucao_renovacao}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
