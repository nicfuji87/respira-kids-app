// AI dev note: Cartão do Pix da venda de produto. Usado nos dois lugares onde a
// cobrança aparece: na recepção (o cliente aponta a câmera para a tela) e na página
// pública que vai por WhatsApp. Por isso o QR é grande e o botão de copiar é
// explícito — quem está no balcão escaneia, quem está em casa cola no banco.
//
// A API Pix do Inter devolve só o copia-e-cola (payload EMV), não uma imagem.
// O QR é desenhado no cliente a partir desse texto, que é o padrão do Bacen.

import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, QrCode, Clock } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { cn } from '@/lib/utils';

interface PixCobrancaCardProps {
  copiaCola: string;
  valor: string;
  expiraEm?: string | null;
  className?: string;
  // na recepção o QR pode ser menor; na página do cliente ele é o protagonista
  tamanhoQr?: number;
}

function formatarExpiracao(iso: string): string | null {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const PixCobrancaCard: React.FC<PixCobrancaCardProps> = ({
  copiaCola,
  valor,
  expiraEm,
  className,
  tamanhoQr = 200,
}) => {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(copiaCola);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      // clipboard bloqueado (http, permissão): o código segue visível para
      // seleção manual, então não vale interromper com um erro
    }
  };

  const expiracao = expiraEm ? formatarExpiracao(expiraEm) : null;

  return (
    <div
      className={cn(
        'rounded-2xl border border-azul-respira/25 bg-bege-fundo/40 p-5',
        className
      )}
    >
      <div className="flex items-center justify-center gap-2 text-roxo-titulo">
        <QrCode className="h-5 w-5" />
        <span className="text-sm font-semibold uppercase tracking-wide">
          Pague com Pix
        </span>
      </div>

      <p className="mt-3 text-center text-3xl font-bold tabular-nums text-foreground">
        {valor}
      </p>

      <div className="mt-4 flex justify-center">
        <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
          <QRCodeSVG
            value={copiaCola}
            size={tamanhoQr}
            level="M"
            marginSize={0}
          />
        </div>
      </div>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Abra o app do seu banco, escolha Pix e aponte a câmera para o código.
      </p>

      <div className="mt-4 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          Ou use o Pix copia e cola:
        </p>
        <p className="max-h-20 overflow-y-auto break-all rounded-lg border border-border/60 bg-card p-2.5 font-mono text-xs leading-relaxed text-muted-foreground">
          {copiaCola}
        </p>
        <Button
          type="button"
          variant={copiado ? 'secondary' : 'default'}
          onClick={() => void copiar()}
          className="w-full gap-2"
        >
          {copiado ? (
            <>
              <Check className="h-4 w-4" />
              Código copiado
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copiar código Pix
            </>
          )}
        </Button>
      </div>

      {expiracao && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          Válido até {expiracao}
        </p>
      )}
    </div>
  );
};
