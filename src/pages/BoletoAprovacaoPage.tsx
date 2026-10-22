// AI dev note: Página /boleto/:id (só admin) — destino do link que a Ju manda no grupo
// de notas quando um boleto chega por e-mail (edge email-boletos). O admin confere o
// PDF e os alertas e toca "Agendar": o app chama a inter-pagar de sempre com a data
// do vencimento (ou hoje, se já venceu). Boleto adulterado é golpe comum por e-mail,
// por isso alerta "grave" (banco ou beneficiário diferente) exige marcar que conferiu.

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
import { Checkbox } from '@/components/primitives/checkbox';
import { Skeleton } from '@/components/primitives/skeleton';
import { useToast } from '@/components/primitives/use-toast';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Copy,
  FileText,
  Info,
  Loader2,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { abrirDocumentoFinanceiro } from '@/lib/financeiro-storage';
import {
  agendarBoleto,
  cancelarBoletoSolicitacao,
  fetchBoletoSolicitacao,
  minimoExigidoPeloInter,
  type BoletoSolicitacao,
  type BoletoStatus,
} from '@/lib/boletos-email-api';

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    v
  );

// datas puras (YYYY-MM-DD): sem new Date() para não cair um dia pelo fuso
const formatDia = (s: string | null) =>
  s ? s.slice(0, 10).split('-').reverse().join('/') : '—';

const formatDataHora = (s: string | null) =>
  s
    ? new Date(s).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '—';

const formatDoc = (d: string | null) => {
  const s = (d ?? '').replace(/\D/g, '');
  if (s.length === 14)
    return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (s.length === 11)
    return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return d || '—';
};

// 47 dígitos = boleto bancário; 48 = conta de consumo (arrecadação, 4 blocos de 11 + DV)
const formatLinha = (l: string) =>
  l.length === 48
    ? (l.match(/.{12}/g) ?? [])
        .map((b) => `${b.slice(0, 11)}-${b[11]}`)
        .join(' ')
    : `${l.slice(0, 5)}.${l.slice(5, 10)} ${l.slice(10, 15)}.${l.slice(15, 21)} ${l.slice(21, 26)}.${l.slice(26, 32)} ${l[32]} ${l.slice(33)}`;

// "A4-0024" = arrecadação, segmento 4 (telecom), empresa 0024 no convênio
const descreverBanco = (codigo: string) =>
  codigo.startsWith('A')
    ? `Conta de consumo · convênio ${codigo.slice(3)}`
    : `${codigo} · ${BANCOS[codigo] ?? 'outro banco'}`;

const BANCOS: Record<string, string> = {
  '001': 'Banco do Brasil',
  '033': 'Santander',
  '077': 'Inter',
  '104': 'Caixa',
  '237': 'Bradesco',
  '260': 'Nubank',
  '341': 'Itaú',
  '336': 'C6',
  '748': 'Sicredi',
  '756': 'Sicoob',
};

const hojeSP = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date()
  );

const STATUS: Record<BoletoStatus, { label: string; className: string }> = {
  aguardando: {
    label: 'Aguardando',
    className: 'bg-amarelo-pipa/20 text-roxo-titulo border-amarelo-pipa/40',
  },
  pagando: {
    label: 'Enviando…',
    className: 'bg-amarelo-pipa/20 text-roxo-titulo border-amarelo-pipa/40',
  },
  agendado: {
    label: 'Agendado',
    className: 'bg-azul-respira/20 text-roxo-titulo border-azul-respira/40',
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
  debito: {
    label: 'Débito automático',
    className: 'bg-azul-respira/20 text-roxo-titulo border-azul-respira/40',
  },
};

export const BoletoAprovacaoPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [boleto, setBoleto] = useState<BoletoSolicitacao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [conferiu, setConferiu] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    setCarregando(true);
    try {
      setBoleto(await fetchBoletoSolicitacao(id));
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

  const agendar = async (valorPagar?: number) => {
    if (!boleto) return;
    setEnviando(true);
    try {
      const r = await agendarBoleto(boleto.id, valorPagar, boleto.vencimento);
      toast({
        title: 'Boleto enviado ao Inter',
        description: `${formatBRL(valorPagar ?? Number(boleto.valor))} para ${formatDia(r.data_pagamento)}.`,
      });
    } catch (e) {
      toast({
        title: 'O boleto não foi agendado',
        description: e instanceof Error ? e.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setEnviando(false);
      await carregar();
    }
  };

  const cancelar = async () => {
    if (!boleto) return;
    try {
      await cancelarBoletoSolicitacao(boleto.id);
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

  const abrirPdf = async () => {
    if (!boleto?.anexo_path) return;
    const erro = await abrirDocumentoFinanceiro(boleto.anexo_path);
    if (erro)
      toast({
        title: 'Não abriu o PDF',
        description: erro,
        variant: 'destructive',
      });
  };

  const copiarLinha = async () => {
    if (!boleto) return;
    try {
      await navigator.clipboard.writeText(boleto.linha_digitavel);
      toast({ title: 'Linha digitável copiada' });
    } catch {
      // sem permissão de área de transferência: a linha está visível na tela
    }
  };

  if (carregando && !boleto) {
    return (
      <div className="mx-auto max-w-md space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  if (erroCarga || !boleto) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {erroCarga ?? 'Boleto não encontrado.'}
          </CardContent>
        </Card>
      </div>
    );
  }

  const hoje = hojeSP();
  const venceu = boleto.vencimento < hoje;
  const dataAgendar = venceu ? hoje : boleto.vencimento;
  const graves = boleto.alertas.filter((a) => a.nivel === 'grave');
  const podeAgendar =
    boleto.status === 'aguardando' || boleto.status === 'erro';
  const bloqueado = graves.length > 0 && !conferiu;
  const st = STATUS[boleto.status];
  const cnpjCadastro = (boleto.fornecedor_cnpj ?? '').replace(/\D/g, '');
  // vencido: o Inter já respondeu quanto aceita com multa e juros
  const minimoInter =
    boleto.status === 'erro' ? minimoExigidoPeloInter(boleto.erro) : null;
  const encargos =
    minimoInter && minimoInter > Number(boleto.valor)
      ? minimoInter - Number(boleto.valor)
      : null;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <FileText className="h-6 w-6 text-roxo-titulo" />
          Boleto recebido por e-mail
        </h1>
        <p className="text-muted-foreground">
          Confira e agende pela conta do Inter.
        </p>
      </div>

      <Card className={cn(podeAgendar && 'border-amarelo-pipa/50')}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">
              {boleto.fornecedor_nome ?? 'Fornecedor'}
            </CardTitle>
            <Badge variant="outline" className={cn('shrink-0', st.className)}>
              {st.label}
            </Badge>
          </div>
          {boleto.descricao && (
            <p className="text-sm text-muted-foreground">{boleto.descricao}</p>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          <div>
            <p className="text-3xl font-bold tabular-nums">
              {formatBRL(Number(boleto.valor))}
            </p>
            <p
              className={cn(
                'text-sm',
                venceu && podeAgendar
                  ? 'font-medium text-destructive'
                  : 'text-muted-foreground'
              )}
            >
              Vencimento {formatDia(boleto.vencimento)}
            </p>
          </div>

          {boleto.alertas.length > 0 && (
            <ul className="space-y-2">
              {boleto.alertas.map((a, i) => (
                <li
                  key={i}
                  className={cn(
                    'flex items-start gap-2 rounded-lg p-3 text-sm',
                    a.nivel === 'grave' && 'bg-destructive/10 text-destructive',
                    a.nivel === 'atencao' &&
                      'bg-amarelo-pipa/20 text-roxo-titulo',
                    a.nivel === 'info' && 'bg-muted text-muted-foreground'
                  )}
                >
                  {a.nivel === 'info' ? (
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  {a.texto}
                </li>
              ))}
            </ul>
          )}

          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Beneficiário no boleto</dt>
              <dd className="font-medium">{boleto.beneficiario_nome ?? '—'}</dd>
              <dd>{formatDoc(boleto.beneficiario_doc)}</dd>
              {cnpjCadastro && (
                <dd className="text-xs text-muted-foreground">
                  No cadastro: {formatDoc(cnpjCadastro)}
                </dd>
              )}
            </div>
            <div>
              <dt className="text-muted-foreground">Banco do boleto</dt>
              <dd>
                {boleto.banco_codigo
                  ? descreverBanco(boleto.banco_codigo)
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="flex items-center justify-between text-muted-foreground">
                Linha digitável
                <button
                  type="button"
                  onClick={() => void copiarLinha()}
                  className="inline-flex items-center gap-1 text-xs text-roxo-titulo"
                >
                  <Copy className="h-3 w-3" /> Copiar
                </button>
              </dt>
              <dd className="break-all font-mono text-xs">
                {formatLinha(boleto.linha_digitavel)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Recebido</dt>
              <dd>
                {boleto.remetente_email}
                {boleto.caixa ? ` → ${boleto.caixa}` : ''}
              </dd>
              {boleto.assunto && (
                <dd className="text-xs text-muted-foreground">
                  “{boleto.assunto}” · {formatDataHora(boleto.created_at)}
                </dd>
              )}
            </div>
            {(boleto.status === 'agendado' || boleto.status === 'pago') && (
              <div>
                <dt className="text-muted-foreground">
                  {boleto.status === 'pago' ? 'Pago' : 'Agendado para'}
                </dt>
                <dd>
                  {formatDia(boleto.data_pagamento)}
                  {boleto.aprovado_por ? ` · por ${boleto.aprovado_por}` : ''}
                </dd>
                {boleto.valor_pagar &&
                  Number(boleto.valor_pagar) > Number(boleto.valor) && (
                    <dd className="text-xs text-muted-foreground">
                      {formatBRL(Number(boleto.valor_pagar))} com multa e juros
                    </dd>
                  )}
              </div>
            )}
          </dl>

          {boleto.anexo_path && (
            <Button
              variant="outline"
              onClick={() => void abrirPdf()}
              className="w-full gap-2"
            >
              <FileText className="h-4 w-4" /> Ver o boleto (PDF)
            </Button>
          )}

          {boleto.status === 'erro' && boleto.erro && (
            <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {boleto.erro}
            </p>
          )}

          {podeAgendar && (
            <>
              {graves.length > 0 && (
                <label className="flex items-start gap-2 rounded-lg border border-destructive/40 p-3 text-sm">
                  <Checkbox
                    checked={conferiu}
                    onCheckedChange={(v) => setConferiu(v === true)}
                    className="mt-0.5"
                  />
                  Conferi o PDF e confirmei com o fornecedor que estes dados de
                  pagamento estão certos.
                </label>
              )}
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amarelo-pipa" />
                {venceu
                  ? 'Já venceu: o Inter tenta pagar hoje e pode recusar ou cobrar encargos.'
                  : `O Inter debita no dia ${formatDia(dataAgendar)}. Até lá dá para cancelar no app do Inter.`}
              </p>
              {minimoInter && encargos && (
                <>
                  <p className="text-sm text-roxo-titulo">
                    O Inter calculou {formatBRL(encargos)} de multa e juros pelo
                    atraso. Total a pagar hoje:{' '}
                    <strong>{formatBRL(minimoInter)}</strong>.
                  </p>
                  <Button
                    onClick={() => void agendar(minimoInter)}
                    disabled={enviando || bloqueado}
                    className="h-12 w-full gap-2 text-base"
                  >
                    {enviando ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <CalendarClock className="h-5 w-5" />
                    )}
                    Pagar {formatBRL(minimoInter)} com multa e juros
                  </Button>
                </>
              )}
              <Button
                onClick={() => void agendar()}
                disabled={enviando || bloqueado}
                variant={minimoInter ? 'outline' : 'default'}
                className={cn(
                  'w-full gap-2',
                  minimoInter ? 'h-10' : 'h-12 text-base'
                )}
              >
                {enviando ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <CalendarClock className="h-5 w-5" />
                )}
                {dataAgendar === hoje
                  ? `Pagar hoje ${formatBRL(Number(boleto.valor))}`
                  : `Agendar para ${formatDia(dataAgendar)}`}
              </Button>
              <Button
                variant="ghost"
                onClick={() => void cancelar()}
                disabled={enviando}
                className="w-full gap-2"
              >
                <XCircle className="h-4 w-4" />
                Não pagar por aqui
              </Button>
            </>
          )}

          {boleto.status === 'debito' && (
            <>
              <p className="flex items-start gap-2 text-sm text-roxo-titulo">
                <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-azul-respira" />
                Débito automático
                {boleto.conta_debito ? ` no ${boleto.conta_debito}` : ''}. A
                conta já está nas contas a pagar e a baixa sai sozinha em{' '}
                {formatDia(boleto.vencimento)}.
              </p>
              <Button
                variant="ghost"
                onClick={() => void cancelar()}
                className="w-full gap-2"
              >
                <XCircle className="h-4 w-4" />
                Não dar baixa automática
              </Button>
            </>
          )}
          {boleto.status === 'agendado' && (
            <p className="flex items-center gap-2 text-sm text-roxo-titulo">
              <CalendarClock className="h-5 w-5 text-azul-respira" />
              Agendado no Inter. No dia, o sistema confere e dá baixa na conta.
            </p>
          )}
          {boleto.status === 'pago' && (
            <p className="flex items-center gap-2 text-sm text-roxo-titulo">
              <CheckCircle2 className="h-5 w-5 text-verde-pipa" />
              Pago e baixado no financeiro.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

BoletoAprovacaoPage.displayName = 'BoletoAprovacaoPage';
