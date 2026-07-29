import React from 'react';
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Copy,
  FileText,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
} from '@/components/primitives';
import { useToast } from '@/components/primitives/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  ingerirDocumentoFiscal,
  reprocessarDocumento,
  descartarDocumento,
  type ResultadoIngestao,
} from '@/lib/documentos-fiscais-api';

// AI dev note: entrada da ingestão por IA (sem WhatsApp). Aceita XML, PDF e foto.
// XML de NF-e/NFS-e é lido por parser determinístico — sem IA, sem custo e sem
// alucinação; por isso o texto orienta a preferir o XML. PDF e foto vão para a IA.
// Nada vira lançamento validado: tudo cai na lista de Pré-Lançamentos abaixo.

const ACEITOS = '.xml,.pdf,.jpg,.jpeg,.png,.webp';
const TAMANHO_MAX = 10 * 1024 * 1024; // igual ao limite do bucket

interface DocumentoFiscalUploadProps {
  onConcluido?: () => void;
  className?: string;
}

export const DocumentoFiscalUpload = React.memo<DocumentoFiscalUploadProps>(
  ({ onConcluido, className }) => {
    const [arrastando, setArrastando] = React.useState(false);
    const [processando, setProcessando] = React.useState(false);
    const [resultados, setResultados] = React.useState<ResultadoIngestao[]>([]);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const { user } = useAuth();
    const { toast } = useToast();

    const processarArquivos = React.useCallback(
      async (arquivos: File[]) => {
        if (arquivos.length === 0) return;

        const grandes = arquivos.filter((f) => f.size > TAMANHO_MAX);
        if (grandes.length > 0) {
          toast({
            variant: 'destructive',
            title: 'Arquivo grande demais',
            description: `${grandes.map((f) => f.name).join(', ')} — o limite é 10 MB.`,
          });
        }

        const validos = arquivos.filter((f) => f.size <= TAMANHO_MAX);
        if (validos.length === 0) return;

        setProcessando(true);

        // Sequencial de propósito: cada documento chama a IA, e o feedback fica
        // legível conforme cada um termina.
        for (const arquivo of validos) {
          try {
            const r = await ingerirDocumentoFiscal(arquivo, user?.pessoa?.id);
            setResultados((prev) => [r, ...prev]);
          } catch (error) {
            setResultados((prev) => [
              {
                documentoId: '',
                nome: arquivo.name,
                status: 'erro',
                erro:
                  error instanceof Error ? error.message : 'Falha inesperada',
              },
              ...prev,
            ]);
          }
        }

        setProcessando(false);
        onConcluido?.();
      },
      [user?.pessoa?.id, toast, onConcluido]
    );

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setArrastando(false);
      processarArquivos(Array.from(e.dataTransfer.files));
    };

    const handleReprocessar = async (documentoId: string, nome: string) => {
      setProcessando(true);
      const r = await reprocessarDocumento(documentoId);
      setResultados((prev) =>
        prev.map((x) =>
          x.documentoId === documentoId ? { ...r, nome: nome || x.nome } : x
        )
      );
      setProcessando(false);
      onConcluido?.();
    };

    const handleDescartar = async (documentoId: string) => {
      await descartarDocumento(documentoId);
      setResultados((prev) =>
        prev.filter((x) => x.documentoId !== documentoId)
      );
    };

    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Enviar nota, boleto ou cupom
          </CardTitle>
          <CardDescription>
            O sistema lê o documento e cria um pré-lançamento aqui embaixo para
            você conferir. <strong>Prefira o XML</strong> da nota: é lido de
            forma exata, sem IA. PDF e foto passam pela leitura automática e
            podem exigir correção.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={handleDrop}
            className={cn(
              'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer',
              arrastando
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50',
              processando && 'pointer-events-none opacity-60'
            )}
          >
            {processando ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium">Lendo documento…</p>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">
                  Arraste os arquivos aqui ou clique para escolher
                </p>
                <p className="text-xs text-muted-foreground">
                  XML, PDF, JPG ou PNG · até 10 MB · vários de uma vez
                </p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACEITOS}
              className="hidden"
              onChange={(e) => {
                processarArquivos(Array.from(e.target.files || []));
                e.target.value = '';
              }}
            />
          </div>

          {resultados.length > 0 && (
            <ul className="space-y-2">
              {resultados.map((r, i) => (
                <li
                  key={`${r.documentoId}-${i}`}
                  className="flex items-start gap-3 rounded-md border p-3 text-sm"
                >
                  {r.status === 'consumido' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                  ) : r.status === 'duplicado' ? (
                    <Copy className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{r.nome}</span>
                      <Badge
                        variant={
                          r.status === 'consumido'
                            ? 'default'
                            : r.status === 'duplicado'
                              ? 'secondary'
                              : 'destructive'
                        }
                      >
                        {r.status === 'consumido'
                          ? 'pré-lançamento criado'
                          : r.status === 'duplicado'
                            ? 'já lançado'
                            : 'não foi lido'}
                      </Badge>
                    </div>
                    {r.erro && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.erro}
                      </p>
                    )}
                  </div>

                  {r.status === 'erro' && r.documentoId && (
                    <div className="flex flex-shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleReprocessar(r.documentoId, r.nome)}
                        disabled={processando}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Tentar de novo
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDescartar(r.documentoId)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }
);

DocumentoFiscalUpload.displayName = 'DocumentoFiscalUpload';
