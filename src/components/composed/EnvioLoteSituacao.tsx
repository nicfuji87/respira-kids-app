import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, PauseCircle, PlayCircle, WifiOff } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { Button } from '@/components/primitives/button';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';

// AI dev note: proteção do envio em lote das cobranças (07/11/2026). As regras
// moram no banco (fn_liberar_envio_lote): WhatsApp fora do ar segura o lote e
// volta sozinho; mais de 10% de falha pausa o lote até alguém tocar em
// "Retomar envio" (fn_cobranca_envio_retomar). Quem falhou ganha nova tentativa
// em 30 min e, se falhar de novo, o n8n manda por e-mail.

interface Conexao {
  instancia: 'uazapi' | 'quepasa';
  conectado: boolean | null;
  estado: string | null;
  verificado_em: string | null;
}

interface SituacaoEnvio {
  pausa: { motivo: string; detalhe: string | null; desde: string } | null;
  whatsapp_ok: boolean;
  conexoes: Conexao[] | null;
  na_fila: number;
  enviados: number;
  falhas: number;
}

const fmtHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export const EnvioLoteSituacao: React.FC = () => {
  const { toast } = useToast();
  const [sit, setSit] = useState<SituacaoEnvio | null>(null);
  const [retomando, setRetomando] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('fn_cobranca_envio_situacao');
    if (error) {
      console.error('❌ fn_cobranca_envio_situacao:', error);
      return;
    }
    setSit(data as SituacaoEnvio);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const retomar = async () => {
    setRetomando(true);
    const { error } = await supabase.rpc('fn_cobranca_envio_retomar');
    setRetomando(false);
    if (error) {
      toast({
        title: 'Não foi possível retomar',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: 'Envio retomado',
      description: 'As cobranças do lote voltam a sair no ritmo normal.',
    });
    await carregar();
  };

  if (!sit) return null;

  if (sit.pausa) {
    return (
      <Alert variant="destructive">
        <PauseCircle className="h-4 w-4" />
        <AlertDescription className="space-y-2">
          <p>
            <strong>Envio do lote pausado</strong> desde{' '}
            {fmtHora(sit.pausa.desde)}
            {sit.pausa.detalhe ? `: ${sit.pausa.detalhe}.` : '.'} {sit.na_fila}{' '}
            cobrança(s) esperando. Confira o WhatsApp da recepção (Configurações
            &gt; Integrações &gt; WhatsApp) antes de retomar.
          </p>
          <Button
            size="sm"
            onClick={retomar}
            disabled={retomando}
            className="gap-2"
          >
            {retomando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            Retomar envio
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!sit.whatsapp_ok && sit.na_fila > 0) {
    return (
      <Alert variant="destructive">
        <WifiOff className="h-4 w-4" />
        <AlertDescription>
          <strong>Envio segurado:</strong> o WhatsApp da recepção está
          desconectado. {sit.na_fila} cobrança(s) do lote esperando; o envio
          volta sozinho quando reconectar.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
};
