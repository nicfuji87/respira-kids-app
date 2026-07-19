import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Loader2,
  AlertTriangle,
  CreditCard,
  QrCode,
  Copy,
  CalendarDays,
  CheckCircle2,
  Check,
  ShieldCheck,
  Lock,
  MessageCircle,
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
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import { fetchLinkPublico, confirmarPagamento } from '@/lib/payment-links-api';
import type {
  PagamentoLinkPublico,
  FormaPagamento,
} from '@/types/payment-links';

// AI dev note: Página pública de pagamento (#/pagamento/:token).
// O cliente vê as datas das consultas e escolhe a forma de pagamento (PIX ou cartão
// 1x..Nx) com os valores já calculados (repasse de taxas). Ao confirmar, a edge
// function confirm-payment-link cria a cobrança no Asaas: PIX exibe o QR aqui;
// cartão redireciona para o checkout hospedado do Asaas (invoiceUrl).
// A seleção é unificada (PIX ou cartão+parcelas) com check visível na opção escolhida.

// AI dev note: WhatsApp de contato da clínica (mesmo número usado em
// SharedSchedulePage e PatientRegistrationSteps). Se mudar, atualizar nos três.
const CLINIC_WHATSAPP_URL = 'https://wa.me/556181446666';

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(v);

const formatDateBR = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

// Seleção do cliente: PIX ou cartão com nº de parcelas.
type Selecao = { tipo: 'pix' } | { tipo: 'credit_card'; parcelas: number };

export const PagamentoPublicoPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();

  const [link, setLink] = useState<PagamentoLinkPublico | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Por padrão já vem com PIX selecionado (forma sem acréscimo).
  const [selecao, setSelecao] = useState<Selecao>({ tipo: 'pix' });
  const [isConfirming, setIsConfirming] = useState(false);
  const [pixResult, setPixResult] = useState<{
    encodedImage?: string;
    payload?: string;
    expirationDate?: string;
  } | null>(null);

  // CTA: ao selecionar uma opção, rolamos a tela até o botão e o destacamos por
  // um instante, deixando claro que ainda é preciso CONFIRMAR para gerar o pagamento.
  const ctaRef = useRef<HTMLDivElement>(null);
  const [ctaHighlight, setCtaHighlight] = useState(false);

  const selecionar = useCallback((s: Selecao) => {
    setSelecao(s);
    setCtaHighlight(true);
    window.setTimeout(() => {
      ctaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    window.setTimeout(() => setCtaHighlight(false), 1500);
  }, []);

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

  // ---------- Estados de carregamento / erro ----------
  if (isLoading) {
    return (
      <PageShell>
        <Card className="w-full max-w-md rounded-2xl shadow-lg">
          <CardHeader>
            <Skeleton className="mx-auto h-12 w-12 rounded-full" />
            <Skeleton className="mx-auto h-5 w-2/3" />
            <Skeleton className="mx-auto h-4 w-1/2" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (error || !link) {
    return (
      <LinkIndisponivelScreen
        titulo="Este link de pagamento não está mais disponível"
        descricao="Ele pode ter expirado ou o pagamento já pode ter sido concluído. Se precisar de um novo link, é só falar com a gente."
      />
    );
  }

  const invalido =
    link.expirado || link.status === 'expirado' || link.status === 'cancelado';

  if (invalido) {
    const expirou = link.expirado || link.status === 'expirado';
    return (
      <LinkIndisponivelScreen
        titulo={
          expirou
            ? 'Este link de pagamento expirou'
            : 'Este link de pagamento foi cancelado'
        }
        descricao={
          expirou
            ? 'Por segurança, os links de pagamento têm prazo de validade. Fale com a clínica para receber um novo link.'
            : 'Se você acredita que isso foi um engano ou precisa de um novo link, fale com a clínica.'
        }
      />
    );
  }

  // ---------- PIX gerado: exibir QR ----------
  if (pixResult) {
    return (
      <PageShell>
        <Card className="w-full max-w-md rounded-2xl shadow-lg">
          <CardHeader className="text-center">
            <IconBubble tone="verde">
              <QrCode className="h-6 w-6" />
            </IconBubble>
            <CardTitle>Pague com PIX</CardTitle>
            <CardDescription>
              Escaneie o QR Code no app do seu banco ou copie o código abaixo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Valor em destaque para conferência no app do banco */}
            <div className="rounded-xl border bg-muted/30 p-3 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Valor a pagar
              </p>
              <p className="text-3xl font-bold tracking-tight text-foreground">
                {formatBRL(link.opcoes.pix.total)}
              </p>
              {link.paciente_nome && (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {link.paciente_nome}
                  {link.empresa_nome && ` • ${link.empresa_nome}`}
                </p>
              )}
            </div>
            {pixResult.encodedImage && (
              <div className="flex justify-center">
                <img
                  src={`data:image/png;base64,${pixResult.encodedImage}`}
                  alt="QR Code PIX"
                  className="h-60 w-60 rounded-xl border bg-white p-2"
                />
              </div>
            )}
            {pixResult.payload && (
              <div className="space-y-2">
                <div className="break-all rounded-lg bg-muted p-3 text-xs text-muted-foreground">
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
                  Copiar código PIX (copia e cola)
                </Button>
              </div>
            )}
            <div className="flex items-center justify-center gap-2 rounded-lg bg-verde-pipa/10 p-3 text-sm text-verde-pipa">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>Assim que você pagar, a confirmação é automática.</span>
            </div>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  // ---------- Já confirmado anteriormente ----------
  if (link.status === 'confirmado' && link.forma_escolhida) {
    return (
      <PageShell>
        <Card className="w-full max-w-md rounded-2xl shadow-lg">
          <CardHeader className="text-center">
            <IconBubble tone="verde">
              <CheckCircle2 className="h-6 w-6" />
            </IconBubble>
            <CardTitle>Pagamento já iniciado</CardTitle>
            <CardDescription>
              {link.forma_escolhida === 'pix'
                ? 'Você escolheu pagar com PIX.'
                : `Você escolheu cartão de crédito${
                    link.installment_count && link.installment_count > 1
                      ? ` em ${link.installment_count}x`
                      : ' à vista'
                  }.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              className="h-12 w-full text-base"
              disabled={isConfirming}
              onClick={() =>
                handleConfirmar(
                  link.forma_escolhida as FormaPagamento,
                  link.installment_count || 1
                )
              }
            >
              {isConfirming && (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              )}
              Continuar pagamento
            </Button>

            {/* Orientação: o que fazer em cada situação */}
            <div className="space-y-1.5 rounded-xl border bg-muted/30 p-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">Já pagou?</strong> Pode
                desconsiderar este link — a confirmação é automática.
              </p>
              <p>
                <strong className="text-foreground">Teve algum problema</strong>{' '}
                ou quer trocar a forma de pagamento? Fale com a clínica.
              </p>
            </div>

            <WhatsAppCta variant="outline" />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  // ---------- Estado principal: escolher forma de pagamento ----------
  const opcoes = link.opcoes;

  // Valor e rótulo da seleção atual (para o CTA)
  const opcaoCartao =
    selecao.tipo === 'credit_card'
      ? opcoes.cartao.find((c) => c.parcelas === selecao.parcelas)
      : undefined;
  const totalSelecionado =
    selecao.tipo === 'pix' ? opcoes.pix.total : (opcaoCartao?.total ?? 0);
  const labelCta =
    selecao.tipo === 'pix'
      ? `Pagar ${formatBRL(opcoes.pix.total)} com PIX`
      : opcaoCartao
        ? `Pagar ${formatBRL(opcaoCartao.total)} no cartão${
            opcaoCartao.parcelas > 1
              ? ` em ${opcaoCartao.parcelas}x`
              : ' à vista'
          }`
        : 'Selecione uma forma de pagamento';

  const confirmarSelecao = () => {
    if (selecao.tipo === 'pix') handleConfirmar('pix', 1);
    else handleConfirmar('credit_card', selecao.parcelas);
  };

  return (
    <PageShell>
      <Card className="w-full max-w-md overflow-hidden rounded-2xl shadow-lg">
        <CardHeader className="space-y-3 text-center">
          <IconBubble tone="verde">
            <ShieldCheck className="h-6 w-6" />
          </IconBubble>
          <div>
            <CardTitle className="text-xl">Pagamento</CardTitle>
            <CardDescription className="mt-1">
              {link.empresa_nome && (
                <span className="font-medium text-foreground">
                  {link.empresa_nome}
                </span>
              )}
              {link.empresa_nome && ' • '}
              {link.paciente_nome}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Banner explicativo de confiança */}
          <div className="flex gap-2 rounded-xl border border-verde-pipa/30 bg-verde-pipa/5 p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-verde-pipa" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Escolha abaixo como prefere pagar. A cobrança é gerada com
              segurança pelo <strong className="text-foreground">Asaas</strong>{' '}
              somente <strong className="text-foreground">após</strong> a sua
              confirmação.
            </p>
          </div>

          {/* Resumo do atendimento */}
          <div className="space-y-2 rounded-xl border bg-muted/30 p-3 text-sm">
            {link.descricao && (
              <p className="leading-relaxed text-muted-foreground">
                {link.descricao}
              </p>
            )}
            {link.datas_consultas?.length > 0 && (
              <div className="flex items-start gap-2 border-t pt-2 text-muted-foreground">
                <CalendarDays className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>
                  {link.datas_consultas.map(formatDateBR).join(' • ')}
                </span>
              </div>
            )}
          </div>

          {/* Seleção: PIX */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Forma de pagamento
              </p>
              <p className="text-[11px] text-muted-foreground">
                escolha e confirme abaixo
              </p>
            </div>

            <OptionRow
              selected={selecao.tipo === 'pix'}
              onClick={() => selecionar({ tipo: 'pix' })}
              icon={<QrCode className="h-5 w-5" />}
              title="PIX"
              subtitle="Aprovação na hora · sem acréscimo"
              value={formatBRL(opcoes.pix.total)}
            />
          </div>

          {/* Seleção: Cartão de crédito */}
          {opcoes.cartao.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <CreditCard className="h-3.5 w-3.5" />
                  Cartão de crédito
                </p>
                <span className="text-[11px] text-muted-foreground">
                  taxas já incluídas
                </span>
              </div>

              <div className="space-y-2">
                {opcoes.cartao.map((opcao) => (
                  <OptionRow
                    key={opcao.parcelas}
                    selected={
                      selecao.tipo === 'credit_card' &&
                      selecao.parcelas === opcao.parcelas
                    }
                    onClick={() =>
                      selecionar({
                        tipo: 'credit_card',
                        parcelas: opcao.parcelas,
                      })
                    }
                    title={
                      opcao.parcelas === 1
                        ? 'À vista'
                        : `${opcao.parcelas}x de ${formatBRL(opcao.valor_parcela)}`
                    }
                    value={formatBRL(opcao.total)}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>

        {/* CTA fixo na base do card */}
        <div
          ref={ctaRef}
          className={cn(
            'space-y-2 border-t bg-background p-4 transition-colors',
            ctaHighlight && 'bg-verde-pipa/5'
          )}
        >
          <Button
            className={cn(
              'h-12 w-full text-base transition-all',
              ctaHighlight && 'ring-2 ring-verde-pipa ring-offset-2'
            )}
            disabled={isConfirming || totalSelecionado <= 0}
            onClick={confirmarSelecao}
          >
            {isConfirming ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Lock className="mr-2 h-4 w-4" />
            )}
            {isConfirming ? 'Gerando pagamento…' : labelCta}
          </Button>
          <p className="flex items-center justify-center gap-1 text-center text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" />
            Pagamento processado com segurança pelo Asaas
          </p>
        </div>
      </Card>
    </PageShell>
  );
};

// ---------- Subcomponentes de UI ----------

const PageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-background to-muted/40 p-4">
    {children}
  </div>
);

// CTA de contato com a clínica (WhatsApp). Primário quando é a única saída da
// tela (ex.: link indisponível); outline quando é ação secundária.
const WhatsAppCta: React.FC<{ variant?: 'default' | 'outline' }> = ({
  variant = 'default',
}) => (
  <Button
    asChild
    variant={variant}
    className={cn(
      'h-12 w-full text-base',
      variant === 'outline' && 'text-sm font-medium'
    )}
  >
    <a href={CLINIC_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
      <MessageCircle className="mr-2 h-5 w-5" />
      Falar com a clínica no WhatsApp
    </a>
  </Button>
);

// Tela completa (com marca) para link inexistente, expirado ou cancelado.
// Nunca deixar a pessoa sem saída: sempre oferecer o WhatsApp da clínica.
const LinkIndisponivelScreen: React.FC<{
  titulo: string;
  descricao: string;
}> = ({ titulo, descricao }) => (
  <PageShell>
    <Card className="w-full max-w-md rounded-2xl shadow-lg">
      <CardHeader className="space-y-4 text-center">
        <img
          src="/images/logos/nome-logo-respira-kids.png"
          alt="Respira Kids"
          className="mx-auto h-10 w-auto"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <IconBubble tone="muted">
          <AlertTriangle className="h-6 w-6" />
        </IconBubble>
        <div className="space-y-1.5">
          <CardTitle className="text-xl leading-snug">{titulo}</CardTitle>
          <CardDescription className="leading-relaxed">
            {descricao}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <WhatsAppCta />
      </CardContent>
    </Card>
  </PageShell>
);

const IconBubble: React.FC<{
  children: React.ReactNode;
  tone: 'verde' | 'muted';
}> = ({ children, tone }) => (
  <div
    className={cn(
      'mx-auto flex h-12 w-12 items-center justify-center rounded-full',
      tone === 'verde'
        ? 'bg-verde-pipa/15 text-verde-pipa'
        : 'bg-muted text-muted-foreground'
    )}
  >
    {children}
  </div>
);

interface OptionRowProps {
  selected: boolean;
  onClick: () => void;
  title: string;
  value: string;
  subtitle?: string;
  icon?: React.ReactNode;
}

const OptionRow: React.FC<OptionRowProps> = ({
  selected,
  onClick,
  title,
  value,
  subtitle,
  icon,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={cn(
      'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all',
      selected
        ? 'border-verde-pipa bg-verde-pipa/10 ring-1 ring-verde-pipa'
        : 'hover:border-muted-foreground/30 hover:bg-muted/50'
    )}
  >
    {/* Indicador de seleção (check) */}
    <span
      className={cn(
        'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        selected
          ? 'border-verde-pipa bg-verde-pipa text-white'
          : 'border-muted-foreground/30'
      )}
    >
      {selected && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>

    {icon && (
      <span
        className={cn(
          'flex-shrink-0',
          selected ? 'text-verde-pipa' : 'text-muted-foreground'
        )}
      >
        {icon}
      </span>
    )}

    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium">{title}</span>
      {subtitle && (
        <span className="block truncate text-xs text-muted-foreground">
          {subtitle}
        </span>
      )}
    </span>

    <span
      className={cn(
        'flex-shrink-0 text-sm font-semibold',
        selected ? 'text-verde-pipa' : 'text-foreground'
      )}
    >
      {value}
    </span>
  </button>
);

export default PagamentoPublicoPage;
