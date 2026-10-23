// AI dev note: Ata de uma reunião com as estagiárias. Mostra encaminhamentos e
// pontos a confirmar (marcáveis como feitos) e o texto da ata em markdown.
// Modo edição (ou criação, quando ainda não há ata) troca o texto por campos.
// Dados em src/lib/estagio-atas-api.ts.

import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { CheckCircle2, Pencil, Plus, Trash2, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Textarea } from '@/components/primitives/textarea';
import { Checkbox } from '@/components/primitives/checkbox';
import { Label } from '@/components/primitives/label';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import {
  atualizarAta,
  criarAta,
  criarItemAta,
  marcarItemAta,
  removerItemAta,
  separarParticipantes,
  type AtaReuniao,
  type ItemAta,
  type TipoItemAta,
} from '@/lib/estagio-atas-api';

export interface NovaAtaBase {
  reuniao_ref: string | null;
  data: string;
  titulo: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ata existente; null = registrar nova a partir de `nova`. */
  ata: AtaReuniao | null;
  nova?: NovaAtaBase;
  pessoaId: string | null;
  onChanged: () => void;
  /** Chamado ao registrar uma ata nova (o pai passa a mostrá-la). */
  onCreated?: (ata: AtaReuniao) => void;
}

function dataBR(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

export const AtaReuniaoDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  ata,
  nova,
  pessoaId,
  onChanged,
  onCreated,
}) => {
  const { toast } = useToast();
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [itens, setItens] = useState<ItemAta[]>([]);
  const [data, setData] = useState('');
  const [titulo, setTitulo] = useState('');
  const [participantes, setParticipantes] = useState('');
  const [conteudo, setConteudo] = useState('');

  // Ao abrir: carrega os campos da ata (ou da reunião nova).
  useEffect(() => {
    if (!open) return;
    setItens(ata?.itens ?? []);
    setData(ata?.data ?? nova?.data ?? '');
    setTitulo(ata?.titulo ?? (nova ? `Ata: ${nova.titulo}` : ''));
    setParticipantes((ata?.participantes ?? []).join(', '));
    setConteudo(ata?.conteudo ?? '');
    setEditando(!ata);
  }, [open, ata, nova]);

  const salvarTexto = async () => {
    if (!data || !titulo.trim()) {
      toast({
        title: 'Faltam dados',
        description: 'Preencha a data e o título da ata.',
        variant: 'destructive',
      });
      return;
    }
    setSalvando(true);
    try {
      const dados = {
        data,
        titulo: titulo.trim(),
        participantes: separarParticipantes(participantes),
        conteudo,
      };
      if (ata) {
        await atualizarAta(ata.id, dados, pessoaId);
      } else {
        const criada = await criarAta(
          { ...dados, reuniao_ref: nova?.reuniao_ref ?? null },
          pessoaId
        );
        onCreated?.(criada);
      }
      toast({ title: 'Ata salva' });
      setEditando(false);
      onChanged();
    } catch (err) {
      console.error('[AtaReuniaoDialog] erro ao salvar ata:', err);
      toast({
        title: 'Não consegui salvar a ata',
        description: 'Verifique a conexão e tente de novo.',
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  const alternarItem = async (item: ItemAta) => {
    const feito = !item.feito;
    setItens((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, feito } : i))
    );
    try {
      await marcarItemAta(item.id, feito, pessoaId);
      onChanged();
    } catch (err) {
      console.error('[AtaReuniaoDialog] erro ao marcar item:', err);
      setItens((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, feito: !feito } : i))
      );
      toast({
        title: 'Não consegui marcar o item',
        variant: 'destructive',
      });
    }
  };

  const adicionarItem = async (
    tipo: TipoItemAta,
    descricao: string,
    responsavel: string,
    prazo: string
  ) => {
    if (!ata) return false;
    const ordem =
      Math.max(0, ...itens.filter((i) => i.tipo === tipo).map((i) => i.ordem)) +
      1;
    try {
      const novo = await criarItemAta(
        ata.id,
        { tipo, descricao, responsavel, prazo },
        ordem
      );
      setItens((prev) => [...prev, novo]);
      onChanged();
      return true;
    } catch (err) {
      console.error('[AtaReuniaoDialog] erro ao adicionar item:', err);
      toast({ title: 'Não consegui adicionar', variant: 'destructive' });
      return false;
    }
  };

  const removerItem = async (item: ItemAta) => {
    try {
      await removerItemAta(item.id);
      setItens((prev) => prev.filter((i) => i.id !== item.id));
      onChanged();
    } catch (err) {
      console.error('[AtaReuniaoDialog] erro ao remover item:', err);
      toast({ title: 'Não consegui remover', variant: 'destructive' });
    }
  };

  const acoes = itens.filter((i) => i.tipo === 'acao');
  const confirmar = itens.filter((i) => i.tipo === 'confirmar');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl text-roxo-titulo">
            {ata ? ata.titulo : 'Registrar ata'}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {ata ? (
              <>
                <span>{dataBR(ata.data)}</span>
                {ata.participantes.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    {ata.participantes.join(', ')}
                  </span>
                )}
              </>
            ) : (
              'Cole o texto da ata. Encaminhamentos e pontos a confirmar podem ser adicionados depois de salvar.'
            )}
          </DialogDescription>
        </DialogHeader>

        {editando ? (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-[10rem_1fr] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ata-data">Data</Label>
                <Input
                  id="ata-data"
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ata-titulo">Título</Label>
                <Input
                  id="ata-titulo"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ata-participantes">
                Participantes (separados por vírgula)
              </Label>
              <Input
                id="ata-participantes"
                value={participantes}
                onChange={(e) => setParticipantes(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ata-conteudo">Texto da ata</Label>
              <Textarea
                id="ata-conteudo"
                value={conteudo}
                onChange={(e) => setConteudo(e.target.value)}
                className="min-h-[18rem] font-mono text-sm"
                placeholder={'## 1. Assunto\n\n- O que foi combinado'}
              />
              <p className="text-xs text-muted-foreground">
                Use "## " no começo da linha para títulos e "- " para itens.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              {ata && (
                <Button
                  variant="outline"
                  onClick={() => setEditando(false)}
                  disabled={salvando}
                >
                  Cancelar
                </Button>
              )}
              <Button onClick={() => void salvarTexto()} disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar ata'}
              </Button>
            </div>
          </div>
        ) : (
          ata && (
            <div className="space-y-6">
              <ListaItens
                titulo="Encaminhamentos"
                tipo="acao"
                itens={acoes}
                onToggle={alternarItem}
                onAdd={adicionarItem}
                onRemove={removerItem}
              />
              <ListaItens
                titulo="Pontos a confirmar"
                tipo="confirmar"
                itens={confirmar}
                onToggle={alternarItem}
                onAdd={adicionarItem}
                onRemove={removerItem}
              />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-roxo-titulo">
                    Texto da ata
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setEditando(true)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </Button>
                </div>
                <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5">
                  {ata.conteudo.trim() ? (
                    <ReactMarkdown
                      components={{
                        h2: ({ children }) => (
                          <h2 className="font-semibold text-base text-roxo-titulo mt-5 first:mt-0 mb-2">
                            {children}
                          </h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="font-semibold text-sm text-roxo-titulo mt-4 mb-1.5">
                            {children}
                          </h3>
                        ),
                        p: ({ children }) => (
                          <p className="text-sm leading-relaxed text-foreground/90 mb-3">
                            {children}
                          </p>
                        ),
                        ul: ({ children }) => (
                          <ul className="list-disc ml-5 mb-3 space-y-1.5">
                            {children}
                          </ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal ml-5 mb-3 space-y-1.5">
                            {children}
                          </ol>
                        ),
                        li: ({ children }) => (
                          <li className="text-sm leading-relaxed text-foreground/90">
                            {children}
                          </li>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-semibold text-foreground">
                            {children}
                          </strong>
                        ),
                      }}
                    >
                      {ata.conteudo}
                    </ReactMarkdown>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Ata sem texto.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
};

AtaReuniaoDialog.displayName = 'AtaReuniaoDialog';

// =====================================================
// Lista de itens (encaminhamentos ou pontos a confirmar)
// =====================================================

interface ListaItensProps {
  titulo: string;
  tipo: TipoItemAta;
  itens: ItemAta[];
  onToggle: (item: ItemAta) => void;
  onAdd: (
    tipo: TipoItemAta,
    descricao: string,
    responsavel: string,
    prazo: string
  ) => Promise<boolean>;
  onRemove: (item: ItemAta) => void;
}

const ListaItens: React.FC<ListaItensProps> = ({
  titulo,
  tipo,
  itens,
  onToggle,
  onAdd,
  onRemove,
}) => {
  const [adicionando, setAdicionando] = useState(false);
  const [descricao, setDescricao] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [prazo, setPrazo] = useState('');
  const [removendo, setRemovendo] = useState<string | null>(null);
  const feitos = itens.filter((i) => i.feito).length;

  const salvar = async () => {
    if (!descricao.trim()) return;
    const ok = await onAdd(
      tipo,
      descricao.trim(),
      responsavel.trim(),
      prazo.trim()
    );
    if (ok) {
      setDescricao('');
      setResponsavel('');
      setPrazo('');
      setAdicionando(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-roxo-titulo">
          {titulo}
          {itens.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {feitos} de {itens.length} feitos
            </span>
          )}
        </h3>
        {!adicionando && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => setAdicionando(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar
          </Button>
        )}
      </div>

      {itens.length === 0 && !adicionando && (
        <p className="text-sm text-muted-foreground">Nenhum item.</p>
      )}

      <div className="space-y-1.5">
        {itens.map((item) => (
          <div
            key={item.id}
            className={cn(
              'flex items-start gap-3 rounded-xl border p-3 transition-colors',
              item.feito
                ? 'bg-verde-pipa/15 border-verde-pipa/50'
                : 'bg-card border-border/60'
            )}
          >
            <Checkbox
              checked={item.feito}
              onCheckedChange={() => onToggle(item)}
              className="mt-0.5"
              aria-label={
                item.feito ? 'Marcar como pendente' : 'Marcar como feito'
              }
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'text-sm leading-snug',
                  item.feito
                    ? 'text-muted-foreground line-through decoration-muted-foreground/40'
                    : 'text-foreground'
                )}
              >
                {item.descricao}
              </p>
              {(item.responsavel || item.prazo) && (
                <p className="text-xs text-muted-foreground mt-1">
                  {[item.responsavel, item.prazo].filter(Boolean).join(' · ')}
                </p>
              )}
              {item.observacao && (
                <p className="text-xs text-azul-respira mt-1">
                  {item.observacao}
                </p>
              )}
            </div>
            {item.feito && (
              <CheckCircle2 className="w-4 h-4 text-verde-pipa shrink-0 mt-0.5" />
            )}
            {removendo === item.id ? (
              <div className="flex gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 px-2"
                  onClick={() => {
                    setRemovendo(null);
                    onRemove(item);
                  }}
                >
                  Remover
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => setRemovendo(null)}
                >
                  Não
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRemovendo(item.id)}
                className="text-muted-foreground/60 hover:text-vermelho-kids shrink-0 mt-0.5"
                aria-label="Remover item"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {adicionando && (
        <div className="rounded-xl border border-dashed border-azul-respira/50 p-3 space-y-2">
          <Input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder={
              tipo === 'acao'
                ? 'O que precisa ser feito'
                : 'O que precisa ser confirmado'
            }
            autoFocus
          />
          <div className="grid sm:grid-cols-2 gap-2">
            <Input
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              placeholder="Responsável (opcional)"
            />
            <Input
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              placeholder="Prazo (opcional)"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAdicionando(false)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => void salvar()}
              disabled={!descricao.trim()}
            >
              Adicionar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
