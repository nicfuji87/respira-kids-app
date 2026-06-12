import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Loader2,
  AlertTriangle,
  CreditCard,
  QrCode,
  Copy,
  CalendarDays,
  CheckCircle2,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import { fetchLinkPublico, confirmarPagamento } from '@/lib/payment-links-api';
import type {
  PagamentoLinkPublico,
  FormaPagamento,
} from '@/types/payment-links';

// AI dev note: Página pública de pagamento (#/pagamento/:token).
// O cliente vê as datas das consultas e escolhe a forma de pagamento (PIX ou cartão
// 1x..Nx) com os valores já calculados (repasse de taxas). Ao escolher, a edge
// function confirm-payment-link cria a cobrança no Asaas: PIX exibe o QR aqui;
// cartão redireciona para o checkout hospedado do Asaas (invoiceUrl).

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(v);

const formatDateBR = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

export const PagamentoPublicoPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();

  const [link, setLink] = useState<PagamentoLinkPublico | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedParcelas, setSelectedParcelas] = useState(1);
  const [isConfirming, setIsConfirming] = useState(false);
  const [pixResult, setPixResult] = useState<{
    encodedImage?: string;
    payload?: string;
    expirationDate?: string;
  } | null>(null);

  const load = useCallback(async (t: string) => {
    setIsLoading(true);
    setError(null);
    const res = await fetchLinkPublico(t);
    if (!res.success || !res.data) {
      setError(res.error || 'Link de pagamento não encontrado');
    } else {
      setLink(res.data);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!token) {
      setError('Link inválido');
      setIsLoading(false);
      return;
    }
    load(token);
  }, [token, load]);

  const handleConfirmar = async (forma: FormaPagamento, parcelas: number) => {
    if (!token) return;
    setIsConfirming(true);
    try {
      const res = await confirmarPagamento(token, forma, parcelas);
      if (!res.success || !res.data) {
        toast({
          title: 'Não foi possível gerar o pagamento',
          description: res.error,
          variant: 'destructive',
        });
        return;
      }

      if (forma === 'credit_card') {
        if (res.data.invoiceUrl) {
          window.location.href = res.data.invoiceUrl;
          return;
        }
        toast({
          title: 'Erro',
          description: 'Não foi possível abrir o checkout do cartão.',
          variant: 'destructive',
        });
        return;
      }

      // PIX: exibir QR Code (ou cair no invoiceUrl)
      if (res.data.pix?.encodedImage || res.data.pix?.payload) {
        setPixResult(res.data.pix);
      } else if (res.data.invoiceUrl) {
        window.location.href = res.data.invoiceUrl;
      } else {
        toast({
          title: 'Erro',
          description: 'Não foi possível gerar o PIX.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsConfirming(false);
    }
  };

  // ---------- Render states ----------
  if (isLoading) {
    return (
      <PageShell>
        <Card className="w-full max-w-md">
          <CardHeader>
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (error || !link) {
    return (
      <PageShell>
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {error || 'Link de pagamento não encontrado'}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const invalido =
    link.expirado || link.status === 'expirado' || link.status === 'cancelado';

  if (invalido) {
    return (
      <PageShell>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Link indisponível</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {link.expirado || link.status === 'expirado'
                  ? 'Este link de pagamento expirou. Entre em contato para gerar um novo.'
                  : 'Este link de pagamento foi cancelado.'}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  // PIX gerado: exibir QR
  if (pixResult) {
    return (
      <PageShell>
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <QrCode className="h-5 w-5 text-verde-pipa" />
              Pague com PIX
            </CardTitle>
            <CardDescription>
              Escaneie o QR Code ou copie o código abaixo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pixResult.encodedImage && (
              <div className="flex justify-center">
                <img
                  src={`data:image/png;base64,${pixResult.encodedImage}`}
                  alt="QR Code PIX"
                  className="h-56 w-56 rounded-lg border"
                />
              </div>
            )}
            {pixResult.payload && (
              <div className="space-y-2">
                <div className="break-all rounded-md bg-muted p-3 text-xs">
                  {pixResult.payload}
                </div>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(pixResult.payload!);
                    toast({ title: 'Código PIX copiado' });
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar código PIX
                </Button>
              </div>
            )}
            <p className="text-center text-sm text-muted-foreground">
              Após o pagamento, a confirmação é automática.
            </p>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  // Já confirmado anteriormente (forma escolhida) -> permite continuar
  if (link.status === 'confirmado' && link.forma_escolhida) {
    return (
      <PageShell>
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-verde-pipa" />
              Pagamento já iniciado
            </CardTitle>
            <CardDescription>
              {link.forma_escolhida === 'pix'
                ? 'Você escolheu pagar com PIX.'
                : 'Você escolheu pagar com cartão de crédito.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              disabled={isConfirming}
              onClick={() =>
                handleConfirmar(
                  link.forma_escolhida as FormaPagamento,
                  link.installment_count || 1
                )
              }
            >
              {isConfirming && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Continuar pagamento
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  // Estado normal: escolher forma de pagamento
  const opcoes = link.opcoes;
  const opcaoCartaoSelecionada = opcoes.cartao.find(
    (c) => c.parcelas === selectedParcelas
  );

  return (
    <PageShell>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Pagamento</CardTitle>
          <CardDescription>
            {link.empresa_nome && <span>{link.empresa_nome} • </span>}
            {link.paciente_nome}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Resumo */}
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            {link.descricao && (
              <p className="mb-2 text-muted-foreground">{link.descricao}</p>
            )}
            {link.datas_consultas?.length > 0 && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <CalendarDays className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>
                  {link.datas_consultas.map(formatDateBR).join(' • ')}
                </span>
              </div>
            )}
          </div>

          {/* PIX */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium">
                <QrCode className="h-4 w-4 text-verde-pipa" />
                PIX
              </div>
              <span className="text-lg font-semibold text-verde-pipa">
                {formatBRL(opcoes.pix.total)}
              </span>
            </div>
            <Button
              className="w-full"
              disabled={isConfirming}
              onClick={() => handleConfirmar('pix', 1)}
            >
              {isConfirming && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Pagar com PIX
            </Button>
          </div>

          {/* Cartão */}
          {opcoes.cartao.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-medium">
                <CreditCard className="h-4 w-4 text-verde-pipa" />
                Cartão de crédito
              </div>
              <div className="grid grid-cols-1 gap-2">
                {opcoes.cartao.map((opcao) => {
                  const isSelected = opcao.parcelas === selectedParcelas;
                  return (
                    <button
                      key={opcao.parcelas}
                      type="button"
                      onClick={() => setSelectedParcelas(opcao.parcelas)}
                      className={cn(
                        'flex items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors',
                        isSelected
                          ? 'border-verde-pipa bg-verde-pipa/10'
                          : 'hover:bg-muted/50'
                      )}
                    >
                      <span>
                        {opcao.parcelas === 1
                          ? 'À vista'
                          : `${opcao.parcelas}x de ${formatBRL(opcao.valor_parcela)}`}
                      </span>
                      <span className="font-semibold">
                        {formatBRL(opcao.total)}
                      </span>
                    </button>
                  );
                })}
              </div>
              <Button
                className="w-full"
                variant="outline"
                disabled={isConfirming || !opcaoCartaoSelecionada}
                onClick={() => handleConfirmar('credit_card', selectedParcelas)}
              >
                {isConfirming && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Pagar com cartão
                {opcaoCartaoSelecionada
                  ? ` (${formatBRL(opcaoCartaoSelecionada.total)})`
                  : ''}
              </Button>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Pagamento processado com segurança pelo Asaas.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
};

const PageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
    {children}
  </div>
);

export default PagamentoPublicoPage;
