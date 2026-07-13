import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Ban,
  Trash2,
  Pencil,
  AlertTriangle,
  Loader2,
  CalendarOff,
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
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { Textarea } from '@/components/primitives/textarea';
import { Switch } from '@/components/primitives/switch';
import { Checkbox } from '@/components/primitives/checkbox';
import { Badge } from '@/components/primitives/badge';
import { Separator } from '@/components/primitives/separator';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { ProfessionalSelect } from '@/components/composed';
import { useToast } from '@/components/primitives/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  createBloqueios,
  listBloqueios,
  updateBloqueio,
  deleteBloqueio,
  deleteBloqueioSerie,
  fetchConflitosParaBloqueio,
} from '@/lib/agenda-bloqueios-api';
import {
  MOTIVO_BLOQUEIO_LABELS,
  type MotivoBloqueio,
  type RecorrenciaTipo,
  type ConflitoBloqueio,
  type AgendaBloqueioComProfissional,
} from '@/types/agenda-bloqueios';

export interface BloqueioAgendaDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  initialDate?: Date;
  // Quando fornecido ao abrir, o diálogo carrega este bloqueio em modo edição
  editBloqueio?: AgendaBloqueioComProfissional | null;
}

// AI dev note: notifica o calendário (useCalendarData ouve) que bloqueios mudaram
const notifyBloqueiosChanged = () =>
  window.dispatchEvent(new Event('bloqueios:changed'));

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const toDateInput = (d: Date) => format(d, 'yyyy-MM-dd');

function combine(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

export const BloqueioAgendaDialog = React.memo<BloqueioAgendaDialogProps>(
  ({ isOpen, onClose, onSaved, initialDate, editBloqueio }) => {
    const { toast } = useToast();
    const { user } = useAuth();
    const currentPessoaId = user?.pessoa?.id ?? '';
    const userRole = (user?.pessoa?.role ?? null) as
      | 'admin'
      | 'profissional'
      | 'secretaria'
      | null;
    const isProfissional = userRole === 'profissional';

    // Alvo
    const [clinicaInteira, setClinicaInteira] = useState(false);
    const [profissionalId, setProfissionalId] = useState<string>('');

    // Período
    const [motivo, setMotivo] = useState<MotivoBloqueio>('pessoal');
    const [diaInteiro, setDiaInteiro] = useState(false);
    const [dataInicio, setDataInicio] = useState('');
    const [horaInicio, setHoraInicio] = useState('08:00');
    const [dataFim, setDataFim] = useState('');
    const [horaFim, setHoraFim] = useState('09:00');
    const [observacao, setObservacao] = useState('');

    // Recorrência
    const [recorrenciaTipo, setRecorrenciaTipo] =
      useState<RecorrenciaTipo>('nenhuma');
    const [diasSemana, setDiasSemana] = useState<number[]>([]);
    const [recorrenciaAte, setRecorrenciaAte] = useState('');

    // Fluxo
    const [conflitos, setConflitos] = useState<ConflitoBloqueio[]>([]);
    const [conflitosReconhecidos, setConflitosReconhecidos] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

    // Lista
    const [bloqueios, setBloqueios] = useState<AgendaBloqueioComProfissional[]>(
      []
    );
    const [loadingList, setLoadingList] = useState(false);

    const resetForm = useCallback(() => {
      const base = initialDate ?? new Date();
      const dia = toDateInput(base);
      setClinicaInteira(false);
      setProfissionalId(isProfissional ? currentPessoaId : '');
      setMotivo('pessoal');
      setDiaInteiro(false);
      setDataInicio(dia);
      setDataFim(dia);
      setHoraInicio('08:00');
      setHoraFim('09:00');
      setObservacao('');
      setRecorrenciaTipo('nenhuma');
      setDiasSemana([]);
      setRecorrenciaAte(dia);
      setConflitos([]);
      setConflitosReconhecidos(false);
      setError('');
      setEditingId(null);
    }, [initialDate, isProfissional, currentPessoaId]);

    const loadList = useCallback(async () => {
      setLoadingList(true);
      try {
        const from = new Date().toISOString();
        const data = await listBloqueios(
          isProfissional
            ? { profissionalId: currentPessoaId, incluirClinica: true, from }
            : { from }
        );
        setBloqueios(data);
      } catch (e) {
        console.error('Erro ao listar bloqueios:', e);
      } finally {
        setLoadingList(false);
      }
    }, [isProfissional, currentPessoaId]);

    useEffect(() => {
      if (isOpen) {
        resetForm();
        loadList();
      }
    }, [isOpen, resetForm, loadList]);

    // Qualquer mudança relevante invalida o reconhecimento de conflitos
    useEffect(() => {
      setConflitosReconhecidos(false);
      setConflitos([]);
    }, [
      dataInicio,
      horaInicio,
      dataFim,
      horaFim,
      diaInteiro,
      profissionalId,
      clinicaInteira,
      recorrenciaTipo,
    ]);

    const computeInicioFim = useCallback((): {
      inicio: Date;
      fim: Date;
    } | null => {
      if (!dataInicio || !dataFim) return null;
      if (diaInteiro) {
        const inicio = combine(dataInicio, '00:00');
        // fim = 00:00 do dia seguinte ao dataFim (cobre o dia inteiro)
        const fim = new Date(
          combine(dataFim, '00:00').getTime() + 24 * 60 * 60 * 1000
        );
        return { inicio, fim };
      }
      return {
        inicio: combine(dataInicio, horaInicio),
        fim: combine(dataFim, horaFim),
      };
    }, [dataInicio, dataFim, horaInicio, horaFim, diaInteiro]);

    const validar = useCallback(
      (inicio: Date, fim: Date): string | null => {
        if (!clinicaInteira && !profissionalId)
          return 'Selecione o profissional ou marque "Clínica inteira".';
        if (fim <= inicio) return 'O fim deve ser depois do início.';
        if (recorrenciaTipo === 'semanal') {
          if (diasSemana.length === 0)
            return 'Escolha ao menos um dia da semana para a recorrência.';
          if (!recorrenciaAte)
            return 'Informe até quando a recorrência se repete.';
          if (combine(recorrenciaAte, '23:59') < inicio)
            return 'A data-limite da recorrência é anterior ao início.';
        }
        return null;
      },
      [
        clinicaInteira,
        profissionalId,
        recorrenciaTipo,
        diasSemana,
        recorrenciaAte,
      ]
    );

    const alvoId = clinicaInteira ? null : profissionalId || null;

    const handleSubmit = useCallback(async () => {
      setError('');
      const range = computeInicioFim();
      if (!range) {
        setError('Preencha as datas.');
        return;
      }
      const validationError = validar(range.inicio, range.fim);
      if (validationError) {
        setError(validationError);
        return;
      }

      setSaving(true);
      try {
        // Modo edição: atualiza um único bloqueio
        if (editingId) {
          await updateBloqueio(editingId, {
            inicio: range.inicio.toISOString(),
            fim: range.fim.toISOString(),
            dia_inteiro: diaInteiro,
            motivo,
            observacao: observacao || null,
          });
          toast({
            title: 'Bloqueio atualizado',
            description: 'As alterações foram salvas.',
          });
          resetForm();
          await loadList();
          notifyBloqueiosChanged();
          onSaved?.();
          return;
        }

        // Aviso de consultas em conflito antes de confirmar (1ª ocorrência)
        if (!conflitosReconhecidos) {
          const c = await fetchConflitosParaBloqueio(
            alvoId,
            range.inicio.toISOString(),
            range.fim.toISOString()
          );
          if (c.length > 0) {
            setConflitos(c);
            setConflitosReconhecidos(true);
            setSaving(false);
            return; // exige um segundo clique para confirmar
          }
        }

        const { count } = await createBloqueios({
          profissionalId: alvoId,
          inicio: range.inicio.toISOString(),
          fim: range.fim.toISOString(),
          diaInteiro,
          motivo,
          observacao: observacao || null,
          recorrencia: {
            tipo: recorrenciaTipo,
            diasSemana,
            ate: recorrenciaAte,
          },
          criadoPor: currentPessoaId,
        });

        toast({
          title: 'Agenda bloqueada',
          description:
            count > 1
              ? `${count} bloqueios criados.`
              : 'Bloqueio criado com sucesso.',
        });
        resetForm();
        await loadList();
        notifyBloqueiosChanged();
        onSaved?.();
      } catch (e) {
        console.error('Erro ao salvar bloqueio:', e);
        setError(
          e instanceof Error ? e.message : 'Não foi possível salvar o bloqueio.'
        );
      } finally {
        setSaving(false);
      }
    }, [
      computeInicioFim,
      validar,
      editingId,
      diaInteiro,
      motivo,
      observacao,
      conflitosReconhecidos,
      alvoId,
      recorrenciaTipo,
      diasSemana,
      recorrenciaAte,
      currentPessoaId,
      toast,
      resetForm,
      loadList,
      onSaved,
    ]);

    const handleEdit = useCallback((b: AgendaBloqueioComProfissional) => {
      const ini = new Date(b.inicio);
      const fim = new Date(b.fim);
      setEditingId(b.id);
      setClinicaInteira(b.profissional_id === null);
      setProfissionalId(b.profissional_id ?? '');
      setMotivo((b.motivo as MotivoBloqueio) ?? 'pessoal');
      setDiaInteiro(b.dia_inteiro);
      setDataInicio(toDateInput(ini));
      setHoraInicio(format(ini, 'HH:mm'));
      setDataFim(
        toDateInput(b.dia_inteiro ? new Date(fim.getTime() - 1000) : fim)
      );
      setHoraFim(format(fim, 'HH:mm'));
      setObservacao(b.observacao ?? '');
      setRecorrenciaTipo('nenhuma');
      setError('');
      setConflitos([]);
    }, []);

    // Ao abrir a partir de um clique no bloqueio do calendário, carrega em edição
    useEffect(() => {
      if (isOpen && editBloqueio) handleEdit(editBloqueio);
    }, [isOpen, editBloqueio, handleEdit]);

    const handleDelete = useCallback(
      async (b: AgendaBloqueioComProfissional, serie: boolean) => {
        if (serie && b.recorrencia_id) {
          if (
            !window.confirm(
              'Excluir TODA a série recorrente deste bloqueio? Esta ação remove todas as ocorrências futuras e passadas da série.'
            )
          )
            return;
        }
        try {
          if (serie && b.recorrencia_id) {
            await deleteBloqueioSerie(b.recorrencia_id);
            toast({ title: 'Série removida' });
          } else {
            await deleteBloqueio(b.id);
            toast({ title: 'Bloqueio removido' });
          }
          if (editingId === b.id) resetForm();
          await loadList();
          notifyBloqueiosChanged();
          onSaved?.();
        } catch (e) {
          console.error('Erro ao remover bloqueio:', e);
          toast({
            title: 'Erro',
            description: 'Não foi possível remover o bloqueio.',
            variant: 'destructive',
          });
        }
      },
      [toast, editingId, resetForm, loadList, onSaved]
    );

    const toggleDia = (d: number) => {
      setDiasSemana((prev) =>
        prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
      );
    };

    const formatBloqueioPeriodo = (b: AgendaBloqueioComProfissional) => {
      const ini = new Date(b.inicio);
      const fim = new Date(b.fim);
      if (b.dia_inteiro) {
        const fimDia = new Date(fim.getTime() - 1000);
        const mesmoDia = toDateInput(ini) === toDateInput(fimDia);
        return mesmoDia
          ? `${format(ini, 'dd/MM/yyyy', { locale: ptBR })} · dia inteiro`
          : `${format(ini, 'dd/MM')} – ${format(fimDia, 'dd/MM/yyyy')} · dia inteiro`;
      }
      const mesmoDia = toDateInput(ini) === toDateInput(fim);
      return mesmoDia
        ? `${format(ini, 'dd/MM/yyyy HH:mm')} – ${format(fim, 'HH:mm')}`
        : `${format(ini, 'dd/MM HH:mm')} – ${format(fim, 'dd/MM HH:mm')}`;
    };

    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5" />
              {editingId ? 'Editar bloqueio' : 'Bloquear agenda'}
            </DialogTitle>
            <DialogDescription>
              Marque horários em que{' '}
              {isProfissional
                ? 'você não estará'
                : 'o profissional (ou a clínica) não estará'}{' '}
              disponível. Nenhuma consulta poderá ser agendada nesse período.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Alvo */}
            {!isProfissional && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Profissional</Label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={clinicaInteira}
                      onCheckedChange={(v) => setClinicaInteira(Boolean(v))}
                      disabled={!!editingId}
                    />
                    Clínica inteira
                  </label>
                </div>
                {!clinicaInteira && (
                  <ProfessionalSelect
                    value={profissionalId}
                    onValueChange={setProfissionalId}
                    disabled={!!editingId}
                  />
                )}
                {clinicaInteira && (
                  <p className="text-sm text-muted-foreground">
                    O bloqueio valerá para todos os profissionais (ex.:
                    feriado).
                  </p>
                )}
              </div>
            )}

            {/* Motivo */}
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Select
                value={motivo}
                onValueChange={(v) => setMotivo(v as MotivoBloqueio)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(MOTIVO_BLOQUEIO_LABELS) as MotivoBloqueio[]
                  ).map((m) => (
                    <SelectItem key={m} value={m}>
                      {MOTIVO_BLOQUEIO_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dia inteiro */}
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={diaInteiro}
                onCheckedChange={(v) => setDiaInteiro(Boolean(v))}
              />
              Dia inteiro
            </label>

            {/* Período */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Início</Label>
                <Input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                />
              </div>
              {!diaInteiro && (
                <div className="space-y-1">
                  <Label>Hora início</Label>
                  <Input
                    type="time"
                    value={horaInicio}
                    onChange={(e) => setHoraInicio(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label>Fim</Label>
                <Input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                />
              </div>
              {!diaInteiro && (
                <div className="space-y-1">
                  <Label>Hora fim</Label>
                  <Input
                    type="time"
                    value={horaFim}
                    onChange={(e) => setHoraFim(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Recorrência (só na criação) */}
            {!editingId && (
              <div className="space-y-2">
                <Label>Recorrência</Label>
                <Select
                  value={recorrenciaTipo}
                  onValueChange={(v) =>
                    setRecorrenciaTipo(v as RecorrenciaTipo)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma">Não se repete</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                  </SelectContent>
                </Select>

                {recorrenciaTipo === 'semanal' && (
                  <div className="space-y-2 rounded-md border p-3">
                    <div className="flex flex-wrap gap-2">
                      {DIAS_SEMANA.map((label, idx) => (
                        <label
                          key={idx}
                          className={cn(
                            'flex items-center gap-1 rounded px-2 py-1 text-sm cursor-pointer',
                            diasSemana.includes(idx) && 'bg-muted'
                          )}
                        >
                          <Checkbox
                            checked={diasSemana.includes(idx)}
                            onCheckedChange={() => toggleDia(idx)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <div className="space-y-1">
                      <Label>Repetir até</Label>
                      <Input
                        type="date"
                        value={recorrenciaAte}
                        onChange={(e) => setRecorrenciaAte(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Observação */}
            <div className="space-y-1">
              <Label>Observação (opcional)</Label>
              <Textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={2}
              />
            </div>

            {/* Conflitos */}
            {conflitos.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium">
                    {conflitos.length} consulta(s) já existem nesse período:
                  </p>
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {conflitos.slice(0, 6).map((c, i) => (
                      <li key={i}>
                        {format(new Date(c.data_hora), 'dd/MM HH:mm')} —{' '}
                        {c.paciente_nome ?? 'Paciente'}
                        {!alvoId && c.profissional_nome
                          ? ` (${c.profissional_nome})`
                          : ''}
                      </li>
                    ))}
                    {conflitos.length > 6 && (
                      <li>+{conflitos.length - 6} outras…</li>
                    )}
                  </ul>
                  <p className="mt-1 text-sm">
                    Elas não serão canceladas. Clique novamente em "Bloquear"
                    para confirmar mesmo assim.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Lista de bloqueios */}
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CalendarOff className="h-4 w-4" />
                Próximos bloqueios
              </div>
              {loadingList ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando…
                </div>
              ) : bloqueios.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum bloqueio futuro.
                </p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {bloqueios.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {formatBloqueioPeriodo(b)}
                          </span>
                          {b.recorrencia_id && (
                            <Badge variant="secondary" className="text-xs">
                              recorrente
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {b.profissional_id === null
                            ? 'Clínica inteira'
                            : (b.profissional_nome ?? 'Profissional')}
                          {b.motivo
                            ? ` · ${
                                MOTIVO_BLOQUEIO_LABELS[
                                  b.motivo as MotivoBloqueio
                                ] ?? b.motivo
                              }`
                            : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleEdit(b)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive"
                          onClick={() => handleDelete(b, false)}
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        {b.recorrencia_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs text-destructive"
                            onClick={() => handleDelete(b, true)}
                            title="Excluir série"
                          >
                            série
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            {editingId && (
              <Button variant="outline" onClick={resetForm} disabled={saving}>
                Cancelar edição
              </Button>
            )}
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Fechar
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId
                ? 'Salvar alterações'
                : conflitos.length > 0
                  ? 'Bloquear mesmo assim'
                  : 'Bloquear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

BloqueioAgendaDialog.displayName = 'BloqueioAgendaDialog';
