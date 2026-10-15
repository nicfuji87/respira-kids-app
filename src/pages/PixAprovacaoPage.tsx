// AI dev note: Página /pix/:id (só admin) — destino do link que a @ju manda no
// grupo de notas quando alguém pede "@ju paga ...". A Ju não paga: ela prepara o
// pedido com a chave Pix DO CADASTRO do fornecedor; aqui o admin logado confere
// e toca Pagar. A tela mostra de onde veio a chave (quem cadastrou e quando)
// porque trocar a chave do fornecedor é o golpe clássico.

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Skeleton } from '@/components/primitives/skeleton';
import { useToast } from '@/components/primitives/use-toast';
import {
  CheckCircle2,
  Loader2,
  Send,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  cancelarPixSolicitacao,
  fetchPixSolicitacao,
  pagarPixSolicitacao,
  type PixSolicitacao,
  type PixSolicitacaoStatus,
} from '@/lib/pix-solicitacao-api';

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    v
  );

const formatData = (s: string | null) =>
  s
    ? new Date(s).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '—';

const STATUS: Record<
  PixSolicitacaoStatus,
  { label: string; className: string }
> = {
  aguardando: {
    label: 'Aguardando aprovação',
    className: 'bg-amarelo-pipa/20 text-roxo-titulo border-amarelo-pipa/40',
  },
  pagando: {
    label: 'Enviando…',
    className: 'bg-amarelo-pipa/20 text-roxo-titulo border-amarelo-pipa/40',
  },
  pago: {
    label: 'Pago',
    className: 'bg-verde-pipa/20 text-roxo-titulo border-verde-pipa/40',
  },
  erro: {
    label: 'Falhou',
    className: 'bg-destructive/10 text-destructive border-destructive/30',
  },
  cancelado: {
    label: 'Cancelado',
    className: 'bg-muted text-muted-foreground',
  },
  expirado: { label: 'Expirado', className: 'bg-muted text-muted-foreground' },
};

export const PixAprovacaoPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [pix, setPix] = useState<PixSolicitacao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [pagando, setPagando] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    setCarregando(true);
    try {
      setPix(await fetchPixSolicitacao(id));
      setErroCarga(null);
    } catch (e) {
      setErroCarga(
        e instanceof Error ? e.message : 'Não foi possível carregar'
      );
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const pagar = async () => {
    if (!pix) return;
    setPagando(true);
    try {
      await pagarPixSolicitacao(pix.id);
      toast({
        title: 'Pix enviado',
        description: `${formatBRL(Number(pix.valor))} para ${pix.favorecido ?? 'o fornecedor'}.`,
      });
    } catch (e) {
      toast({
        title: 'Pix não foi enviado',
        description: e instanceof Error ? e.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setPagando(false);
      await carregar();
    }
  };

  const cancelar = async () => {
    if (!pix) return;
    try {
      await cancelarPixSolicitacao(pix.id);
      toast({ title: 'Pedido cancelado' });
    } catch (e) {
      toast({
        title: 'Não foi possível cancelar',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      await carregar();
    }
  };

  if (carregando && !pix) {
    return (
      <div className="mx-auto max-w-md space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (erroCarga || !pix) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {erroCarga ?? 'Pedido de Pix não encontrado.'}
          </CardContent>
        </Card>
      </div>
    );
  }

  const podePagar = pix.status === 'aguardando' || pix.status === 'erro';
  const st = STATUS[pix.status];

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Send className="h-6 w-6 text-roxo-titulo" />
          Pix pedido pela Ju
        </h1>
        <p className="text-muted-foreground">
          Confira e pague pela conta do Inter.
        </p>
      </div>

      <Card className={cn(podePagar && 'border-amarelo-pipa/50')}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">
              {pix.favorecido ?? 'Fornecedor'}
            </CardTitle>
            <Badge variant="outline" className={cn('shrink-0', st.className)}>
              {st.label}
            </Badge>
          </div>
          {pix.descricao && (
            <p className="text-sm text-muted-foreground">{pix.descricao}</p>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-3xl font-bold tabular-nums">
            {formatBRL(Number(pix.valor))}
          </p>

          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Chave Pix</dt>
              <dd className="break-all font-medium">{pix.chave_pix}</dd>
              <dd className="text-xs text-muted-foreground">
                {pix.chave_pix_origem ?? 'Cadastrada no sistema'}
                {pix.chave_pix_atualizada_em
                  ? ` em ${formatData(pix.chave_pix_atualizada_em)}`
                  : ''}
              </dd>
            </div>
            {pix.fornecedor_cnpj && (
              <div>
                <dt className="text-muted-foreground">CNPJ no cadastro</dt>
                <dd>{pix.fornecedor_cnpj}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Pedido</dt>
              <dd>
                {pix.solicitante ? `${pix.solicitante}, ` : ''}
                {formatData(pix.created_at)}
              </dd>
            </div>
            {pix.status === 'pago' && (
              <div>
                <dt className="text-muted-foreground">Pago</dt>
                <dd>
                  {formatData(pix.concluido_em)}
                  {pix.aprovado_por ? ` por ${pix.aprovado_por}` : ''}
                </dd>
              </div>
            )}
            {pix.status === 'aguardando' && (
              <div>
                <dt className="text-muted-foreground">Link vale até</dt>
                <dd>{formatData(pix.expira_em)}</dd>
              </div>
            )}
          </dl>

          {pix.status === 'erro' && pix.erro && (
            <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {pix.erro}
            </p>
          )}

          {podePagar && (
            <>
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amarelo-pipa" />
                Sai dinheiro de verdade da conta do Inter. Pix enviado não
                volta.
              </p>
              <Button
                onClick={() => void pagar()}
                disabled={pagando}
                className="h-12 w-full gap-2 text-base"
              >
                {pagando ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
                Pagar {formatBRL(Number(pix.valor))}
              </Button>
              <Button
                variant="ghost"
                onClick={() => void cancelar()}
                disabled={pagando}
                className="w-full gap-2"
              >
                <XCircle className="h-4 w-4" />
                Cancelar pedido
              </Button>
            </>
          )}

          {pix.status === 'pago' && (
            <p className="flex items-center gap-2 text-sm text-roxo-titulo">
              <CheckCircle2 className="h-5 w-5 text-verde-pipa" />
              Conta baixada no financeiro. A Ju avisa no grupo.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

PixAprovacaoPage.displayName = 'PixAprovacaoPage';
