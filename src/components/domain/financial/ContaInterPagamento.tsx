// AI dev note: Pagamentos pela conta do Inter (boleto, DARF e Pix). SÓ ADMIN.
//
// Fica separado do painel de saldo/extrato de propósito: ver a conta é rotina,
// mandar dinheiro não é. As travas de verdade estão no servidor (inter-pagar) —
// aqui a UI só evita erro honesto: confirmação em duas etapas mostrando o valor
// por extenso, e o histórico de auditoria sempre visível abaixo do formulário,
// porque saber o que já saiu hoje é parte de decidir mandar mais.

import React, { useCallback, useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { Skeleton } from '@/components/primitives/skeleton';
import { CurrencyInput } from '@/components/primitives/currency-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/primitives/alert-dialog';
import { useToast } from '@/components/primitives/use-toast';
import { Send, Loader2, ShieldAlert, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  enviarPagamentoInter,
  fetchPagamentosInter,
  type PagamentoAuditoria,
  type TipoPagamento,
} from '@/lib/inter-conta-api';

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(v);

const STATUS_STYLE: Record<PagamentoAuditoria['status'], string> = {
  sucesso: 'bg-verde-pipa/20 text-roxo-titulo border-verde-pipa/30',
  enviando: 'bg-amarelo-pipa/20 text-amarelo-pipa border-amarelo-pipa/30',
  erro: 'bg-destructive/10 text-destructive border-destructive/30',
};

const TIPO_LABEL: Record<TipoPagamento, string> = {
  boleto: 'Boleto',
  darf: 'DARF',
  pix: 'Pix',
};

export const ContaInterPagamento: React.FC = () => {
  const { toast } = useToast();

  const [tipo, setTipo] = useState<TipoPagamento>('pix');
  const [valor, setValor] = useState<number | null>(null);
  const [chave, setChave] = useState('');
  const [favorecido, setFavorecido] = useState('');
  const [codigoBarras, setCodigoBarras] = useState('');
  const [descricao, setDescricao] = useState('');

  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const [historico, setHistorico] = useState<PagamentoAuditoria[]>([]);
  const [carregandoHist, setCarregandoHist] = useState(true);

  const carregarHistorico = useCallback(async () => {
    setCarregandoHist(true);
    try {
      setHistorico(await fetchPagamentosInter());
    } catch (e) {
      console.error('[ContaInterPagamento] histórico:', e);
    } finally {
      setCarregandoHist(false);
    }
  }, []);

  useEffect(() => {
    void carregarHistorico();
  }, [carregarHistorico]);

  const limpar = () => {
    setValor(null);
    setChave('');
    setFavorecido('');
    setCodigoBarras('');
    setDescricao('');
  };

  const podeEnviar =
    valor !== null &&
    valor > 0 &&
    (tipo === 'pix' ? chave.trim().length > 0 : true) &&
    (tipo === 'boleto' ? codigoBarras.trim().length > 0 : true) &&
    tipo !== 'darf'; // DARF exige campos próprios; ainda não modelado na tela

  const enviar = async () => {
    if (valor === null) return;
    setEnviando(true);
    try {
      await enviarPagamentoInter({
        tipo,
        valor,
        descricao: descricao.trim() || undefined,
        chave: tipo === 'pix' ? chave.trim() : undefined,
        favorecido: favorecido.trim() || undefined,
        codigoBarras: tipo === 'boleto' ? codigoBarras.trim() : undefined,
      });
      toast({
        title: 'Pagamento enviado',
        description: `${TIPO_LABEL[tipo]} de ${formatBRL(valor)}.`,
      });
      limpar();
      await carregarHistorico();
    } catch (e) {
      toast({
        title: 'Pagamento não foi enviado',
        description: e instanceof Error ? e.message : 'Tente novamente.',
        variant: 'destructive',
      });
      // recarrega mesmo em falha: a tentativa fica registrada na auditoria
      await carregarHistorico();
    } finally {
      setEnviando(false);
      setConfirmando(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-amarelo-pipa/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldAlert className="h-5 w-5 text-amarelo-pipa" />
            Pagar pela conta do Inter
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Sai dinheiro de verdade da conta. Pix enviado não volta. Toda
            operação fica registrada com o nome de quem enviou.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={tipo}
                onValueChange={(v) => setTipo(v as TipoPagamento)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">Transferência Pix</SelectItem>
                  <SelectItem value="boleto">Boleto / tributo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pag-valor">Valor</Label>
              <CurrencyInput id="pag-valor" value={valor} onChange={setValor} />
            </div>
          </div>

          {tipo === 'pix' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pag-chave">Chave Pix do destinatário</Label>
                <Input
                  id="pag-chave"
                  value={chave}
                  onChange={(e) => setChave(e.target.value)}
                  placeholder="CPF, CNPJ, e-mail, telefone ou aleatória"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pag-favorecido">
                  Favorecido{' '}
                  <span className="text-muted-foreground">(sua anotação)</span>
                </Label>
                <Input
                  id="pag-favorecido"
                  value={favorecido}
                  onChange={(e) => setFavorecido(e.target.value)}
                  placeholder="Para quem é este pagamento"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="pag-barras">
                Código de barras / linha digitável
              </Label>
              <Input
                id="pag-barras"
                value={codigoBarras}
                onChange={(e) => setCodigoBarras(e.target.value)}
                placeholder="Somente números"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pag-desc">Descrição (opcional)</Label>
            <Input
              id="pag-desc"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>

          <Button
            onClick={() => setConfirmando(true)}
            disabled={!podeEnviar || enviando}
            className="w-full gap-2"
          >
            <Send className="h-4 w-4" />
            Revisar e enviar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Pagamentos feitos pelo sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          {carregandoHist ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : historico.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhum pagamento enviado pelo sistema ainda.
            </p>
          ) : (
            <div className="space-y-1.5">
              {historico.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-lg border border-border/60 p-3"
                >
                  <Badge
                    variant="outline"
                    className={cn('shrink-0 text-xs', STATUS_STYLE[p.status])}
                  >
                    {p.status}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">
                      {TIPO_LABEL[p.tipo]}
                      {p.favorecido ? ` · ${p.favorecido}` : ''}
                      {p.descricao ? ` · ${p.descricao}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.criado_em).toLocaleString('pt-BR')}
                      {p.solicitante?.nome ? ` · ${p.solicitante.nome}` : ''}
                    </p>
                    {p.erro && (
                      <p className="mt-0.5 truncate text-xs text-destructive">
                        {p.erro}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatBRL(Number(p.valor))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar pagamento</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Você está prestes a enviar{' '}
                  <strong className="text-foreground">
                    {valor !== null ? formatBRL(valor) : '—'}
                  </strong>{' '}
                  por {TIPO_LABEL[tipo]}.
                </p>
                {tipo === 'pix' && (
                  <p>
                    Chave de destino:{' '}
                    <strong className="break-all text-foreground">
                      {chave}
                    </strong>
                  </p>
                )}
                <p className="text-destructive">
                  Confira o destinatário. Pix enviado não pode ser desfeito.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void enviar();
              }}
              disabled={enviando}
              className="gap-2"
            >
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar pagamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
