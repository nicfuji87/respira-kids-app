// AI dev note: Aba de levantamento do Manual de Boas Práticas.
// Preenchimento acontece andando pela clínica (tablet), então: autosave por
// pergunta, progresso sempre visível, e filtro pra atacar só o que trava o POP.
// A exportação em Markdown é a saída — é o que vira insumo da redação dos POPs.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Progress } from '@/components/primitives/progress';
import { Skeleton } from '@/components/primitives/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/primitives/accordion';
import { Tabs, TabsList, TabsTrigger } from '@/components/primitives/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Download,
  ListChecks,
  RefreshCw,
  Stethoscope,
} from 'lucide-react';
import { LevantamentoPerguntaCard } from './LevantamentoPerguntaCard';
import {
  LEVANTAMENTO_BLOCOS,
  PENDENCIAS_MAPEADAS,
  TOTAL_CRITICAS,
  TOTAL_PERGUNTAS,
} from '@/lib/qualidade-levantamento-questions';
import {
  exportarMarkdown,
  fetchRespostas,
  reassinarAnexos,
  removerAnexo,
  salvarResposta,
  uploadAnexo,
} from '@/lib/qualidade-levantamento-api';
import type {
  LevantamentoAnexo,
  LevantamentoRespostaRow,
} from '@/types/qualidade';

type Filtro = 'todas' | 'criticas' | 'pendentes' | 'rt';

function estaRespondida(r?: LevantamentoRespostaRow): boolean {
  if (!r) return false;
  return (
    r.nao_aplica ||
    r.nao_sei ||
    (r.resposta?.trim().length ?? 0) > 0 ||
    (r.anexos?.length ?? 0) > 0
  );
}

export const LevantamentoTab: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const pessoaId = user?.pessoa?.id ?? null;

  const [respostas, setRespostas] = useState<
    Map<string, LevantamentoRespostaRow>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todas');

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const rows = await fetchRespostas();
      // URLs do bucket privado expiram — reassina o que tem anexo
      const comAnexo = await Promise.all(
        rows.map(async (r) =>
          r.anexos?.length
            ? { ...r, anexos: await reassinarAnexos(r.anexos) }
            : r
        )
      );
      setRespostas(new Map(comAnexo.map((r) => [r.pergunta_id, r])));
    } catch (e) {
      console.error('[LevantamentoTab] erro ao carregar:', e);
      setErro(
        'Não consegui carregar as respostas. Verifique a conexão e tente de novo.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const handleSalvar = useCallback(
    async (input: {
      perguntaId: string;
      bloco: string;
      resposta?: string | null;
      naoSei?: boolean;
      naoAplica?: boolean;
      anexos?: LevantamentoAnexo[];
    }) => {
      try {
        const row = await salvarResposta(input, pessoaId);
        setRespostas((prev) => {
          const next = new Map(prev);
          const anterior = prev.get(input.perguntaId);
          // preserva as URLs assinadas que já estavam em memória
          next.set(input.perguntaId, {
            ...row,
            anexos: input.anexos ?? anterior?.anexos ?? [],
          });
          return next;
        });
      } catch {
        toast({
          title: 'Não consegui salvar',
          description:
            'Sua resposta continua na tela. Tente de novo em instantes.',
          variant: 'destructive',
        });
      }
    },
    [pessoaId, toast]
  );

  const handleUpload = useCallback(
    async (perguntaId: string, file: File): Promise<LevantamentoAnexo> => {
      const anexo = await uploadAnexo(perguntaId, file);
      const atual = respostas.get(perguntaId);
      const bloco = perguntaId.startsWith('FOTO') ? 'FOTOS' : perguntaId[0];
      const novos = [...(atual?.anexos ?? []), anexo];

      await handleSalvar({
        perguntaId,
        bloco,
        resposta: atual?.resposta ?? null,
        naoSei: atual?.nao_sei ?? false,
        naoAplica: atual?.nao_aplica ?? false,
        anexos: novos,
      });
      return anexo;
    },
    [respostas, handleSalvar]
  );

  const handleRemoverAnexo = useCallback(
    async (perguntaId: string, anexo: LevantamentoAnexo) => {
      try {
        await removerAnexo(anexo.path);
        const atual = respostas.get(perguntaId);
        const bloco = perguntaId.startsWith('FOTO') ? 'FOTOS' : perguntaId[0];
        await handleSalvar({
          perguntaId,
          bloco,
          resposta: atual?.resposta ?? null,
          naoSei: atual?.nao_sei ?? false,
          naoAplica: atual?.nao_aplica ?? false,
          anexos: (atual?.anexos ?? []).filter((a) => a.path !== anexo.path),
        });
      } catch {
        toast({
          title: 'Não consegui remover a foto',
          variant: 'destructive',
        });
      }
    },
    [respostas, handleSalvar, toast]
  );

  // ---------------- progresso ----------------
  const progresso = useMemo(() => {
    let respondidas = 0;
    let criticasOk = 0;
    for (const bloco of LEVANTAMENTO_BLOCOS) {
      for (const p of bloco.perguntas) {
        if (estaRespondida(respostas.get(p.id))) {
          respondidas++;
          if (p.critica) criticasOk++;
        }
      }
    }
    return { respondidas, criticasOk };
  }, [respostas]);

  const pctGeral = Math.round((progresso.respondidas / TOTAL_PERGUNTAS) * 100);
  const pctCriticas = Math.round((progresso.criticasOk / TOTAL_CRITICAS) * 100);

  // ---------------- filtro ----------------
  const blocosFiltrados = useMemo(() => {
    return LEVANTAMENTO_BLOCOS.map((b) => {
      const perguntas = b.perguntas.filter((p) => {
        if (filtro === 'criticas') return p.critica;
        if (filtro === 'rt') return p.rt;
        if (filtro === 'pendentes') return !estaRespondida(respostas.get(p.id));
        return true;
      });
      return { ...b, perguntas };
    }).filter((b) => b.perguntas.length > 0);
  }, [filtro, respostas]);

  const handleExportar = useCallback(() => {
    const md = exportarMarkdown(respostas, LEVANTAMENTO_BLOCOS);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `levantamento-pops-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: 'Levantamento exportado',
      description: 'Me mande esse arquivo que eu escrevo o Manual e os POPs.',
    });
  }, [respostas, toast]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {erro && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <p className="flex-1 text-sm text-foreground">{erro}</p>
            <Button variant="ghost" size="sm" onClick={() => void carregar()}>
              Tentar de novo
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Progresso */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground/80 font-medium">
                Progresso do levantamento
              </p>
              <p className="text-2xl font-bold text-foreground mt-0.5">
                {progresso.respondidas}
                <span className="text-muted-foreground font-normal text-lg">
                  {' '}
                  / {TOTAL_PERGUNTAS}
                </span>
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void carregar()}
                className="gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Atualizar
              </Button>
              <Button size="sm" onClick={handleExportar} className="gap-2">
                <Download className="w-4 h-4" />
                Exportar
              </Button>
            </div>
          </div>

          <Progress value={pctGeral} className="h-2" />

          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle
              className={cn(
                'w-4 h-4 shrink-0',
                pctCriticas === 100 ? 'text-verde-pipa' : 'text-vermelho-kids'
              )}
            />
            <span className="text-muted-foreground">
              Perguntas que travam o POP:{' '}
              <span className="font-semibold text-foreground">
                {progresso.criticasOk}/{TOTAL_CRITICAS}
              </span>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Pendências estruturais */}
      <Card className="border-amarelo-pipa/40 bg-amarelo-pipa/5">
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ListChecks className="w-4 h-4" />
            Pendências já mapeadas
          </p>
          <ul className="text-sm text-muted-foreground space-y-1">
            {PENDENCIAS_MAPEADAS.map((p) => (
              <li key={p} className="flex items-start gap-2">
                <span className="text-muted-foreground/50 mt-0.5">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground/80 pt-1">
            Não precisa responder aqui — é o meu checklist do que já sei que
            falta.
          </p>
        </CardContent>
      </Card>

      {/* Filtro */}
      <Tabs value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="todas">Todas ({TOTAL_PERGUNTAS})</TabsTrigger>
          <TabsTrigger value="criticas" className="gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Travam o POP ({TOTAL_CRITICAS})
          </TabsTrigger>
          <TabsTrigger value="pendentes">
            Sem resposta ({TOTAL_PERGUNTAS - progresso.respondidas})
          </TabsTrigger>
          <TabsTrigger value="rt" className="gap-1.5">
            <Stethoscope className="w-3.5 h-3.5" />
            Para a RT
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Blocos */}
      {blocosFiltrados.length === 0 ? (
        <Card className="bg-verde-pipa/10 border-verde-pipa/40">
          <CardContent className="p-8 text-center space-y-2">
            <Check className="w-10 h-10 text-verde-pipa mx-auto" />
            <p className="font-medium text-foreground">
              Nada pendente neste filtro.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-3">
          {blocosFiltrados.map((bloco) => {
            const total = bloco.perguntas.length;
            const feitas = bloco.perguntas.filter((p) =>
              estaRespondida(respostas.get(p.id))
            ).length;
            const completo = feitas === total;

            return (
              <AccordionItem
                key={bloco.id}
                value={bloco.id}
                className={cn(
                  'border rounded-xl px-4 bg-card',
                  completo ? 'border-verde-pipa/50' : 'border-border/60'
                )}
              >
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <span
                      className={cn(
                        'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold',
                        completo
                          ? 'bg-verde-pipa/40 text-roxo-titulo'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {completo ? <Check className="w-4 h-4" /> : bloco.id}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">
                        {bloco.titulo}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {feitas} de {total} respondidas
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="pb-4 space-y-3">
                  {bloco.descricao && (
                    <p className="text-sm text-muted-foreground leading-relaxed border-l-2 border-azul-respira/40 pl-3">
                      {bloco.descricao}
                    </p>
                  )}
                  {bloco.perguntas.map((p) => (
                    <LevantamentoPerguntaCard
                      key={p.id}
                      pergunta={p}
                      bloco={bloco.id}
                      resposta={respostas.get(p.id)}
                      onSalvar={handleSalvar}
                      onUpload={handleUpload}
                      onRemoverAnexo={handleRemoverAnexo}
                    />
                  ))}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
};

export default LevantamentoTab;
