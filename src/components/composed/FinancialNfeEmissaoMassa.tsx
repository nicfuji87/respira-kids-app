import React, { useCallback, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Progress } from '@/components/primitives/progress';
import { ScrollArea } from '@/components/primitives/scroll-area';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/primitives/use-toast';
import { emitirNfeFatura } from '@/lib/faturas-api';

// AI dev note: Emissão de NFS-e em MASSA sobre o conjunto já filtrado na lista de
// faturas. Não há seleção por checkbox de propósito: a lista é paginada e o dono
// já restringe pelos filtros (período, empresa, estado da NFe) — agir sobre "o que
// está no filtro" é o mesmo contrato do Exportar PDF desta tela.
//
// Reusa emitirNfeFatura, que já cobre os DOIS casos que o dono pediu:
//   - link_nfe vazio  -> agenda + autoriza (com auto-cura se já existir invoice órfã)
//   - link_nfe 'erro' -> CANCELA as invoices anteriores no ASAAS e reemite
//
// Sequencial e com pausa entre itens: o ASAAS limita requisições e cada emissão são
// 2 a 5 chamadas. Paralelizar aqui derruba o lote inteiro por rate limit.
//
// O resumo agrupa por MENSAGEM DE ERRO porque as falhas aqui são sistêmicas, não
// individuais: em jul/2026, 54 das 56 falhas eram a MESMA causa (numeração de RPS
// dessincronizada com a prefeitura de Brasília, que se resolve no painel do ASAAS,
// não no código). Uma lista de 54 toasts esconderia isso; uma linha "54× RPS já
// utilizado" manda o dono direto para a correção certa.

const PAUSA_ENTRE_EMISSOES_MS = 400;

export interface FaturaParaNfe {
  id: string;
  responsavel_nome?: string | null;
  valor_total: number;
  link_nfe?: string | null;
}

interface FinancialNfeEmissaoMassaProps {
  faturas: FaturaParaNfe[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConcluido?: () => void;
}

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    v || 0
  );

type Etapa = 'confirmar' | 'executando' | 'resumo';

interface Falha {
  nome: string;
  erro: string;
}

export const FinancialNfeEmissaoMassa: React.FC<
  FinancialNfeEmissaoMassaProps
> = ({ faturas, open, onOpenChange, onConcluido }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [etapa, setEtapa] = useState<Etapa>('confirmar');
  const [processados, setProcessados] = useState(0);
  const [sucessos, setSucessos] = useState(0);
  const [falhas, setFalhas] = useState<Falha[]>([]);
  const [atual, setAtual] = useState<string>('');
  const cancelarRef = useRef(false);

  const emErro = faturas.filter((f) => f.link_nfe === 'erro');
  const semNota = faturas.filter((f) => f.link_nfe !== 'erro');
  const valorTotal = faturas.reduce((s, f) => s + (f.valor_total || 0), 0);

  const resetar = useCallback(() => {
    cancelarRef.current = false;
    setEtapa('confirmar');
    setProcessados(0);
    setSucessos(0);
    setFalhas([]);
    setAtual('');
  }, []);

  const handleFechar = useCallback(
    (aberto: boolean) => {
      // Não deixa fechar no meio da execução — fechar não cancelaria as chamadas
      // já em voo e o dono ficaria sem saber o que foi emitido.
      if (!aberto && etapa === 'executando') return;
      if (!aberto) {
        resetar();
        if (etapa === 'resumo') onConcluido?.();
      }
      onOpenChange(aberto);
    },
    [etapa, onOpenChange, onConcluido, resetar]
  );

  const executar = useCallback(async () => {
    if (!user?.pessoa?.id) {
      toast({
        title: 'Erro de autenticação',
        description: 'Usuário não autenticado.',
        variant: 'destructive',
      });
      return;
    }

    cancelarRef.current = false;
    setEtapa('executando');
    setProcessados(0);
    setSucessos(0);
    setFalhas([]);

    let ok = 0;
    const erros: Falha[] = [];

    for (let i = 0; i < faturas.length; i++) {
      if (cancelarRef.current) break;

      const fatura = faturas[i];
      const nome = fatura.responsavel_nome || 'Sem responsável';
      setAtual(nome);

      try {
        const r = await emitirNfeFatura(fatura.id, user.pessoa.id);
        if (r.success) {
          ok++;
          setSucessos(ok);
        } else {
          erros.push({ nome, erro: r.error || 'Erro desconhecido' });
          setFalhas([...erros]);
        }
      } catch (err) {
        erros.push({
          nome,
          erro: err instanceof Error ? err.message : 'Erro inesperado',
        });
        setFalhas([...erros]);
      }

      setProcessados(i + 1);

      if (i < faturas.length - 1 && !cancelarRef.current) {
        await new Promise((r) => setTimeout(r, PAUSA_ENTRE_EMISSOES_MS));
      }
    }

    setAtual('');
    setEtapa('resumo');
  }, [faturas, user?.pessoa?.id, toast]);

  // Agrupa as falhas por mensagem — é o que revela causa sistêmica vs. caso isolado
  const falhasAgrupadas = React.useMemo(() => {
    const mapa = new Map<string, { erro: string; nomes: string[] }>();
    for (const f of falhas) {
      const atual = mapa.get(f.erro);
      if (atual) atual.nomes.push(f.nome);
      else mapa.set(f.erro, { erro: f.erro, nomes: [f.nome] });
    }
    return [...mapa.values()].sort((a, b) => b.nomes.length - a.nomes.length);
  }, [falhas]);

  const progresso = faturas.length
    ? Math.round((processados / faturas.length) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={handleFechar}>
      <DialogContent className="max-w-lg">
        {etapa === 'confirmar' && (
          <>
            <DialogHeader>
              <DialogTitle>Emitir notas fiscais em massa</DialogTitle>
              <DialogDescription>
                Serão processadas as {faturas.length} fatura(s) do filtro atual,
                somando {brl(valorTotal)}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-sm">
              {semNota.length > 0 && (
                <p>
                  <strong>{semNota.length}</strong> sem nota emitida — serão
                  emitidas agora.
                </p>
              )}
              {emErro.length > 0 && (
                <p>
                  <strong>{emErro.length}</strong> com erro — a nota anterior
                  será <strong>cancelada no ASAAS</strong> e emitida novamente.
                </p>
              )}

              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-amber-900 dark:text-amber-200">
                  A nota é emitida com a <strong>data de hoje</strong>, não com
                  a data do pagamento. Em lote grande de meses anteriores,
                  confirme a competência com a contabilidade antes de seguir.
                </p>
              </div>

              <p className="text-muted-foreground">
                O processo é sequencial e pode levar alguns minutos. Mantenha
                esta janela aberta.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleFechar(false)}>
                Cancelar
              </Button>
              <Button onClick={executar} disabled={faturas.length === 0}>
                <FileText className="mr-2 h-4 w-4" />
                Emitir {faturas.length} nota(s)
              </Button>
            </DialogFooter>
          </>
        )}

        {etapa === 'executando' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Emitindo notas fiscais
              </DialogTitle>
              <DialogDescription>
                {processados} de {faturas.length} processada(s)
                {atual && ` · ${atual}`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <Progress value={progresso} />
              <div className="flex gap-4 text-sm">
                <span className="text-green-700 dark:text-green-400">
                  {sucessos} emitida(s)
                </span>
                {falhas.length > 0 && (
                  <span className="text-red-600 dark:text-red-400">
                    {falhas.length} falha(s)
                  </span>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  cancelarRef.current = true;
                }}
              >
                <X className="mr-2 h-4 w-4" />
                Parar após a atual
              </Button>
            </DialogFooter>
          </>
        )}

        {etapa === 'resumo' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {falhas.length === 0 ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                )}
                Resultado da emissão
              </DialogTitle>
              <DialogDescription>
                {sucessos} nota(s) solicitada(s) com sucesso
                {falhas.length > 0 && ` · ${falhas.length} falha(s)`}
                {processados < faturas.length &&
                  ` · interrompido em ${processados} de ${faturas.length}`}
              </DialogDescription>
            </DialogHeader>

            {sucessos > 0 && (
              <p className="text-sm text-muted-foreground">
                As notas emitidas ficam como “Gerando NFe” até a prefeitura
                confirmar e o link chegar pelo webhook.
              </p>
            )}

            {falhasAgrupadas.length > 0 && (
              <ScrollArea className="max-h-64 pr-3">
                <div className="space-y-3">
                  {falhasAgrupadas.map((g) => (
                    <div
                      key={g.erro}
                      className="rounded-md border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30"
                    >
                      <p className="font-semibold text-red-800 dark:text-red-300">
                        {g.nomes.length}× {g.erro}
                      </p>
                      <p className="mt-1 text-xs text-red-700 dark:text-red-400">
                        {g.nomes.slice(0, 5).join(', ')}
                        {g.nomes.length > 5 && ` e mais ${g.nomes.length - 5}`}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            <DialogFooter>
              <Button onClick={() => handleFechar(false)}>Fechar</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
