import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  PauseCircle,
  ShieldCheck,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Textarea } from '@/components/primitives/textarea';
import { Label } from '@/components/primitives/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { useToast } from '@/components/primitives/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  encerrarSuspensaoCobranca,
  fetchSuspensoesCobranca,
  MOTIVO_SUSPENSAO_LABEL,
  RESULTADO_SUSPENSAO_LABEL,
  type ResultadoSuspensao,
  type SuspensaoCobranca,
} from '@/lib/cobrancas-api';

// AI dev note: Painel de conferência do Financeiro. Cada cobrança pausada (pela
// Ju, pela equipe ou pelo teto de lembretes) espera aqui até alguém registrar o
// resultado. Prazo vencido NÃO retoma a cobrança: só destaca a tarefa. Quem
// retoma é um admin escolhendo "Dívida confirmada". O banco recusa o resto.

const formatCurrency = (value: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    value ?? 0
  );

const formatDia = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
      })
    : '—';

const ORIGEM_LABEL: Record<SuspensaoCobranca['origem'], string> = {
  ju: 'Ju',
  equipe: 'equipe',
  sistema: 'sistema',
};

const RESULTADO_AJUDA: Record<ResultadoSuspensao, string> = {
  pagamento_confirmado:
    'Os lembretes dessa cobrança param para sempre. Se o pagamento foi fora do link, dê a baixa no Financeiro (ou "receber em dinheiro" no Asaas) para ela sair da lista.',
  divida_confirmada:
    'Os lembretes automáticos voltam na próxima rodada da régua. Combine com a família antes, se possível.',
  cobranca_cancelada:
    'Os lembretes param para sempre. Cancele a fatura no Financeiro para as sessões voltarem ao faturamento, se for o caso.',
};

export interface CobrancaSuspensoesPanelProps {
  /** Recarrega a lista de cobranças depois de encerrar uma pausa. */
  onChanged?: () => void;
  /** Sinal externo para recarregar (ex.: depois de pausar uma cobrança). */
  reloadKey?: number;
}

export const CobrancaSuspensoesPanel: React.FC<
  CobrancaSuspensoesPanelProps
> = ({ onChanged, reloadKey }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isAdmin = user?.pessoa?.role === 'admin';

  const [itens, setItens] = useState<SuspensaoCobranca[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [verEncerradas, setVerEncerradas] = useState(false);
  const [alvo, setAlvo] = useState<{
    suspensao: SuspensaoCobranca;
    resultado: ResultadoSuspensao;
  } | null>(null);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await fetchSuspensoesCobranca();
    if (r.success && r.data) setItens(r.data);
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar, reloadKey]);

  const abertas = useMemo(
    () =>
      itens
        .filter((s) => s.status !== 'encerrada')
        .sort((a, b) => Number(b.prazo_vencido) - Number(a.prazo_vencido)),
    [itens]
  );
  const encerradas = useMemo(
    () => itens.filter((s) => s.status === 'encerrada'),
    [itens]
  );

  const confirmar = async () => {
    if (!alvo) return;
    setSalvando(true);
    const r = await encerrarSuspensaoCobranca(
      alvo.suspensao.id,
      alvo.resultado,
      observacao
    );
    setSalvando(false);
    if (!r.success) {
      toast({
        title: 'Não foi possível registrar',
        description: r.error,
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: 'Resultado registrado',
      description: RESULTADO_SUSPENSAO_LABEL[alvo.resultado],
    });
    setAlvo(null);
    setObservacao('');
    await carregar();
    onChanged?.();
  };

  if (carregando && itens.length === 0) return null;
  if (abertas.length === 0 && encerradas.length === 0) return null;

  return (
    <Card className="border-amarelo-pipa/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <PauseCircle className="h-5 w-5 text-amarelo-pipa" />
          Em conferência pelo Financeiro
          {abertas.length > 0 && (
            <Badge variant="secondary">{abertas.length}</Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Cobranças com lembretes automáticos parados. Elas só voltam a ser
          cobradas quando alguém registra que a dívida foi confirmada.
          {!isAdmin && ' Só administradores registram o resultado.'}
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {abertas.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma cobrança esperando conferência.
          </p>
        )}

        {abertas.map((s) => (
          <div
            key={s.id}
            className={cn(
              'rounded-md border p-3 space-y-2',
              s.prazo_vencido && 'border-vermelho-kids/50 bg-vermelho-kids/5'
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <button
                  type="button"
                  className="font-medium text-left hover:underline"
                  onClick={() =>
                    s.paciente_id && navigate(`/pacientes/${s.paciente_id}`)
                  }
                >
                  {s.paciente_nome || 'Paciente sem nome'}
                </button>
                <p className="text-xs text-muted-foreground">
                  {s.responsavel_nome || 'Sem responsável'} ·{' '}
                  {formatCurrency(s.valor)} ·{' '}
                  {s.origem_cobranca === 'fatura' ? 'Asaas' : 'Pré-cobrança'}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-xs">
                  {MOTIVO_SUSPENSAO_LABEL[s.motivo]}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs',
                    s.prazo_vencido
                      ? 'border-vermelho-kids/50 text-vermelho-kids'
                      : 'text-muted-foreground'
                  )}
                >
                  {s.prazo_vencido ? (
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Prazo vencido ({formatDia(s.prazo_verificacao)})
                    </span>
                  ) : (
                    `Conferir até ${formatDia(s.prazo_verificacao)}`
                  )}
                </Badge>
              </div>
            </div>

            {s.detalhe && (
              <p className="text-sm text-foreground/90">“{s.detalhe}”</p>
            )}

            <p className="text-xs text-muted-foreground">
              Pausada pela {ORIGEM_LABEL[s.origem]}
              {s.origem === 'equipe' && s.criado_por_nome
                ? ` (${s.criado_por_nome.split(' ')[0]})`
                : ''}{' '}
              em {formatDia(s.criado_em)}
              {s.lembretes_bloqueados > 0 &&
                ` · ${s.lembretes_bloqueados} lembrete(s) automático(s) barrado(s)`}
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              {s.invoice_url && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() =>
                    window.open(
                      s.invoice_url as string,
                      '_blank',
                      'noopener,noreferrer'
                    )
                  }
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ver no Asaas
                </Button>
              )}
              {isAdmin &&
                (
                  [
                    'pagamento_confirmado',
                    'divida_confirmada',
                    'cobranca_cancelada',
                  ] as ResultadoSuspensao[]
                ).map((r) => (
                  <Button
                    key={r}
                    size="sm"
                    variant={
                      r === 'pagamento_confirmado' ? 'default' : 'outline'
                    }
                    onClick={() => {
                      setObservacao('');
                      setAlvo({ suspensao: s, resultado: r });
                    }}
                  >
                    {RESULTADO_SUSPENSAO_LABEL[r]}
                  </Button>
                ))}
            </div>
          </div>
        ))}

        {encerradas.length > 0 && (
          <div className="pt-1">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 text-xs"
              onClick={() => setVerEncerradas((v) => !v)}
            >
              {verEncerradas ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              Encerradas nos últimos 60 dias ({encerradas.length})
            </Button>
            {verEncerradas && (
              <ul className="mt-2 space-y-1.5">
                {encerradas.map((s) => (
                  <li
                    key={s.id}
                    className="text-xs text-muted-foreground flex items-start gap-1.5"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      {s.paciente_nome} · {formatCurrency(s.valor)} ·{' '}
                      {s.resultado
                        ? RESULTADO_SUSPENSAO_LABEL[s.resultado]
                        : ''}{' '}
                      em {formatDia(s.encerrada_em)}
                      {s.encerrada_por_nome
                        ? ` por ${s.encerrada_por_nome.split(' ')[0]}`
                        : ''}
                      {s.observacao_encerramento
                        ? `: ${s.observacao_encerramento}`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={!!alvo} onOpenChange={(o) => !o && setAlvo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {alvo ? RESULTADO_SUSPENSAO_LABEL[alvo.resultado] : ''}
            </DialogTitle>
            <DialogDescription>
              {alvo ? RESULTADO_AJUDA[alvo.resultado] : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="obs-encerramento">O que foi conferido</Label>
            <Textarea
              id="obs-encerramento"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: Pix de R$ 260 encontrado no extrato do Inter em 27/10."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlvo(null)}>
              Voltar
            </Button>
            <Button onClick={confirmar} disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

CobrancaSuspensoesPanel.displayName = 'CobrancaSuspensoesPanel';
