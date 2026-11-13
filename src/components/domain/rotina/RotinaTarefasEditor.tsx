// AI dev note: aba "Tarefas" da Rotina (só admin). Cria, edita e desativa tarefas.
// Tarefa desativada some da tela da secretária e do acompanhamento; o histórico fica no banco.
// Indicador e "auto" (marcação pelo sistema) não são editáveis aqui: estão ligados a regras
// do banco (fn_rotina_indicador). Tarefa nova é sempre de marcar à mão.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Textarea } from '@/components/primitives/textarea';
import { Label } from '@/components/primitives/label';
import { Switch } from '@/components/primitives/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import {
  BLOCOS,
  DIAS_SEMANA,
  descreverQuando,
  fetchTarefasCadastro,
  salvarTarefa,
  type FrequenciaRotina,
  type TarefaCadastro,
} from '@/lib/rotina-api';

const NOVA: TarefaCadastro = {
  titulo: '',
  detalhe: null,
  bloco: 'manha',
  frequencia: 'diaria',
  dia_semana: null,
  dia_mes: null,
  dia_mes_prazo: null,
  horario: null,
  link: null,
  ativo: true,
};

const FREQS: Array<{ valor: FrequenciaRotina; titulo: string }> = [
  { valor: 'diaria', titulo: 'Diárias' },
  { valor: 'semanal', titulo: 'Semanais' },
  { valor: 'mensal', titulo: 'Mensais' },
];

export function RotinaTarefasEditor() {
  const { toast } = useToast();
  const [tarefas, setTarefas] = useState<TarefaCadastro[] | null>(null);
  const [editando, setEditando] = useState<TarefaCadastro | null>(null);

  const carregar = useCallback(async () => {
    try {
      setTarefas(await fetchTarefasCadastro());
    } catch (e) {
      toast({
        title: 'Erro ao carregar as tarefas',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  }, [toast]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const tituloBloco = (b: string) =>
    BLOCOS.find((x) => x.valor === b)?.titulo ?? b;

  if (!tarefas) {
    return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          O que você mudar aqui vale a partir de hoje na tela da recepção.
        </p>
        <Button size="sm" onClick={() => setEditando({ ...NOVA })}>
          <Plus />
          Nova tarefa
        </Button>
      </div>

      {FREQS.map((f) => {
        const lista = tarefas.filter((t) => t.frequencia === f.valor);
        if (lista.length === 0) return null;
        return (
          <Card key={f.valor}>
            <CardContent className="space-y-1 py-4">
              <p className="text-sm font-semibold">{f.titulo}</p>
              <ul className="divide-y">
                {lista.map((t) => (
                  <li
                    key={t.id}
                    className={cn(
                      'flex items-center gap-3 py-2',
                      !t.ativo && 'opacity-50'
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {t.titulo}
                        {t.auto && (
                          <Badge variant="secondary" className="gap-1">
                            <Sparkles className="h-3 w-3" />
                            Sistema marca
                          </Badge>
                        )}
                        {!t.ativo && (
                          <Badge variant="outline">Desativada</Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {descreverQuando(t)} · {tituloBloco(t.bloco)}
                        {t.horario && ` · ${t.horario}`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditando({ ...t })}
                      aria-label={`Editar ${t.titulo}`}
                    >
                      <Pencil />
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}

      <EditarTarefaDialog
        tarefa={editando}
        onClose={() => setEditando(null)}
        onSalvo={async () => {
          setEditando(null);
          await carregar();
        }}
      />
    </div>
  );
}

function EditarTarefaDialog({
  tarefa,
  onClose,
  onSalvo,
}: {
  tarefa: TarefaCadastro | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const { toast } = useToast();
  const [t, setT] = useState<TarefaCadastro | null>(tarefa);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => setT(tarefa), [tarefa]);

  if (!t) return null;
  const set = (p: Partial<TarefaCadastro>) => setT({ ...t, ...p });

  const salvar = async () => {
    if (t.frequencia === 'semanal' && !t.dia_semana) {
      toast({ title: 'Escolha o dia da semana', variant: 'destructive' });
      return;
    }
    if (
      t.frequencia === 'mensal' &&
      (t.dia_mes === null || t.dia_mes === undefined)
    ) {
      toast({ title: 'Escolha o dia do mês', variant: 'destructive' });
      return;
    }
    setSalvando(true);
    try {
      await salvarTarefa(t);
      toast({ title: t.id ? 'Tarefa atualizada' : 'Tarefa criada' });
      onSalvo();
    } catch (e) {
      toast({
        title: 'Não deu para salvar',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={!!tarefa} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.id ? 'Editar tarefa' : 'Nova tarefa'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rotina-titulo">Tarefa</Label>
            <Input
              id="rotina-titulo"
              value={t.titulo}
              onChange={(e) => set({ titulo: e.target.value })}
              placeholder="Ex.: Limpar a geladeira"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rotina-detalhe">Como fazer (opcional)</Label>
            <Textarea
              id="rotina-detalhe"
              value={t.detalhe ?? ''}
              onChange={(e) => set({ detalhe: e.target.value })}
              rows={3}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Frequência</Label>
              <Select
                value={t.frequencia}
                onValueChange={(v) =>
                  set({ frequencia: v as FrequenciaRotina })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="diaria">Todo dia útil</SelectItem>
                  <SelectItem value="semanal">Uma vez por semana</SelectItem>
                  <SelectItem value="mensal">Uma vez por mês</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Parte do dia</Label>
              <Select
                value={t.bloco}
                onValueChange={(v) =>
                  set({ bloco: v as TarefaCadastro['bloco'] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLOCOS.map((b) => (
                    <SelectItem key={b.valor} value={b.valor}>
                      {b.titulo} ({b.faixa})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {t.frequencia === 'semanal' && (
            <div className="space-y-1.5">
              <Label>Dia da semana</Label>
              <Select
                value={t.dia_semana ? String(t.dia_semana) : ''}
                onValueChange={(v) => set({ dia_semana: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {DIAS_SEMANA[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Se cair em feriado, vai para o próximo dia útil da semana.
              </p>
            </div>
          )}

          {t.frequencia === 'mensal' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Começa no dia</Label>
                <Select
                  value={
                    t.dia_mes === null || t.dia_mes === undefined
                      ? ''
                      : String(t.dia_mes)
                  }
                  onValueChange={(v) => set({ dia_mes: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Último dia útil</SelectItem>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        Dia {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prazo (opcional)</Label>
                <Select
                  value={t.dia_mes_prazo ? String(t.dia_mes_prazo) : 'mesmo'}
                  onValueChange={(v) =>
                    set({ dia_mes_prazo: v === 'mesmo' ? null : Number(v) })
                  }
                  disabled={t.dia_mes === 0}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mesmo">No mesmo dia</SelectItem>
                    {Array.from({ length: 28 }, (_, i) => i + 1)
                      .filter((d) => d > (t.dia_mes ?? 0))
                      .map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          Até o dia {d}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rotina-horario">
                Horário sugerido (opcional)
              </Label>
              <Input
                id="rotina-horario"
                type="time"
                value={t.horario ?? ''}
                onChange={(e) => set({ horario: e.target.value || null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rotina-link">Atalho no app (opcional)</Label>
              <Input
                id="rotina-link"
                value={t.link ?? ''}
                onChange={(e) => set({ link: e.target.value || null })}
                placeholder="/estoque"
              />
            </div>
          </div>

          {t.id && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Ativa</p>
                <p className="text-xs text-muted-foreground">
                  Desativada, some da tela da recepção.
                </p>
              </div>
              <Switch
                checked={t.ativo}
                onCheckedChange={(v) => set({ ativo: v })}
              />
            </div>
          )}
          {t.auto && (
            <p className="text-xs text-muted-foreground">
              Esta tarefa o sistema marca sozinho quando o número fica certo.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || !t.titulo.trim()}>
            {salvando && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
