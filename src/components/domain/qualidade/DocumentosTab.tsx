// AI dev note: Aba Documentos — Manual de Boas Práticas e POPs versionados.
// Cada documento tem código estável e versão; só um pode estar vigente por código
// (garantido no banco). O PDF é requisito de conformidade, não conveniência: a
// vigilância pede para ver o documento no local, impresso ou na tela.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Skeleton } from '@/components/primitives/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/primitives/tabs';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  Download,
  FileText,
  Printer,
  RefreshCw,
} from 'lucide-react';
import { fetchDocumentos } from '@/lib/qualidade-documentos-api';
import { baixarPopPdf, imprimirPopPdf } from '@/lib/pdf/pop';
import type { PopPdfEmpresa } from '@/lib/pdf/pop';
import type { DocumentoRow, DocumentoStatus } from '@/types/qualidade';

// AI dev note: dados da clínica no cabeçalho do PDF. Vêm do licenciamento
// (RedeSim/CNES) — ver bloco A do levantamento. Ficam aqui porque o PDF precisa
// deles em toda emissão e eles não mudam; se um dia mudarem, virá de pessoa_empresas.
const EMPRESA: PopPdfEmpresa = {
  razaoSocial: 'BC Fisio Kids LTDA',
  cnpj: '51.869.785/0001-74',
  endereco:
    'SEPS Q 709/909, Centro Médico Julio Adnet, Bloco A, Sala 311 — Asa Sul, Brasília/DF',
};

const STATUS_META: Record<DocumentoStatus, { label: string; classe: string }> =
  {
    vigente: {
      label: 'Vigente',
      classe: 'border-verde-pipa/60 text-roxo-titulo bg-verde-pipa/20',
    },
    rascunho: {
      label: 'Minuta',
      classe: 'border-amarelo-pipa/60 text-roxo-titulo bg-amarelo-pipa/20',
    },
    substituido: {
      label: 'Substituído',
      classe: 'border-border text-muted-foreground',
    },
  };

type Filtro = 'todos' | 'vigente' | 'rascunho';

function formatarData(iso?: string | null): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

export const DocumentosTab: React.FC = () => {
  const { toast } = useToast();
  const [documentos, setDocumentos] = useState<DocumentoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [aberto, setAberto] = useState<DocumentoRow | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      setDocumentos(await fetchDocumentos());
    } catch (e) {
      console.error('[DocumentosTab] erro ao carregar:', e);
      setErro('Não consegui carregar os documentos. Tente de novo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const filtrados = useMemo(() => {
    if (filtro === 'todos') return documentos;
    return documentos.filter((d) => d.status === filtro);
  }, [documentos, filtro]);

  const contagem = useMemo(
    () => ({
      total: documentos.length,
      vigentes: documentos.filter((d) => d.status === 'vigente').length,
      minutas: documentos.filter((d) => d.status === 'rascunho').length,
    }),
    [documentos]
  );

  const handlePdf = useCallback(
    (doc: DocumentoRow, acao: 'baixar' | 'imprimir') => {
      try {
        if (acao === 'baixar') baixarPopPdf(doc, EMPRESA);
        else imprimirPopPdf(doc, EMPRESA);
      } catch (e) {
        console.error('[DocumentosTab] erro ao gerar PDF:', e);
        toast({
          title: 'Não consegui gerar o PDF',
          description: 'Tente de novo em instantes.',
          variant: 'destructive',
        });
      }
    },
    [toast]
  );

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
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

      <Card>
        <CardContent className="p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground/80 font-medium">
              Documentos do Manual
            </p>
            <p className="text-2xl font-bold text-foreground mt-0.5">
              {contagem.vigentes}
              <span className="text-muted-foreground font-normal text-lg">
                {' '}
                vigente(s)
              </span>
              {contagem.minutas > 0 && (
                <span className="text-muted-foreground font-normal text-base">
                  {' '}
                  · {contagem.minutas} minuta(s)
                </span>
              )}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void carregar()}
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </Button>
        </CardContent>
      </Card>

      <Tabs value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="todos">Todos ({contagem.total})</TabsTrigger>
          <TabsTrigger value="vigente">
            Vigentes ({contagem.vigentes})
          </TabsTrigger>
          <TabsTrigger value="rascunho">
            Minutas ({contagem.minutas})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {filtrados.length === 0 ? (
        <Card className="bg-bege-fundo/30 border-azul-respira/20">
          <CardContent className="p-8 text-center space-y-2">
            <FileText className="w-10 h-10 text-azul-respira mx-auto" />
            <p className="font-medium text-foreground">
              Nenhum documento neste filtro.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtrados.map((doc) => (
            <Card
              key={doc.id}
              className={cn(
                'transition-colors',
                doc.status === 'vigente'
                  ? 'border-verde-pipa/40'
                  : 'border-border/60'
              )}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold px-2 py-1 rounded-md bg-muted text-muted-foreground">
                        {doc.codigo}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          STATUS_META[doc.status].classe
                        )}
                      >
                        {STATUS_META[doc.status].label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        v{doc.versao}
                      </span>
                    </div>

                    <p className="font-semibold text-foreground leading-snug">
                      {doc.titulo}
                    </p>

                    {doc.resumo && (
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {doc.resumo}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-0.5">
                      <span>
                        Vigente desde:{' '}
                        <span className="text-foreground">
                          {formatarData(doc.vigente_desde)}
                        </span>
                      </span>
                      <span>
                        Próxima revisão:{' '}
                        <span className="text-foreground">
                          {formatarData(doc.proxima_revisao)}
                        </span>
                      </span>
                      {doc.aprovado_por_nome && (
                        <span>
                          Aprovado por:{' '}
                          <span className="text-foreground">
                            {doc.aprovado_por_nome}
                            {doc.aprovado_por_registro
                              ? ` — ${doc.aprovado_por_registro}`
                              : ''}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAberto(doc)}
                    className="gap-1.5 text-xs h-8"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Ler
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePdf(doc, 'baixar')}
                    className="gap-1.5 text-xs h-8"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePdf(doc, 'imprimir')}
                    className="gap-1.5 text-xs h-8"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Imprimir
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!aberto} onOpenChange={(o) => !o && setAberto(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-left">
              {aberto?.codigo} — {aberto?.titulo}
            </DialogTitle>
          </DialogHeader>
          {aberto && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handlePdf(aberto, 'baixar')}
                  className="gap-1.5 text-xs h-8"
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar PDF
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handlePdf(aberto, 'imprimir')}
                  className="gap-1.5 text-xs h-8"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimir
                </Button>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm text-foreground leading-relaxed border-t border-border/60 pt-4">
                {aberto.conteudo_md}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentosTab;
