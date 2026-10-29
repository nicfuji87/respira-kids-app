import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import {
  AlertTriangle,
  BookmarkCheck,
  CalendarCheck,
  Clock,
  Loader2,
  Trash2,
  UserX,
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
import { PatientSelect, ProfessionalSelect } from '@/components/composed';
import { useToast } from '@/components/primitives/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  CompromissoError,
  createReserva,
  deleteCompromisso,
  fetchConflitosCompromisso,
  fromWallClockString,
  notifyCompromissosChanged,
  updateReserva,
} from '@/lib/agenda-bloqueios-api';
import type {
  CompromissoAgenda,
  ConflitoCompromisso,
} from '@/types/agenda-bloqueios';

// AI dev note: RESERVA de horário. Segura o horário de um profissional até alguém
// confirmar a consulta. Observação obrigatória, paciente opcional (com ou sem
// cadastro). Não vence sozinha (decisão de 29/10/2026): sai ao confirmar ou excluir.
// "Confirmar agendamento" devolve os dados ao CalendarTemplate, que abre o
// formulário de consulta com reservaId (o banco encerra a reserva ao salvar).

export interface DadosConfirmacaoReserva {
  reservaId: string;
  profissionalId: string;
  pacienteId: string | null;
  data: Date;
  hora: string; // HH:mm
  observacao: string;
}

export interface ReservaDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialStart?: Date;
  initialEnd?: Date;
  editReserva?: CompromissoAgenda | null;
  // Só quem cria consulta confirma (profissional reserva, não confirma)
  podeConfirmar?: boolean;
  onConfirmar?: (dados: DadosConfirmacaoReserva) => void;
}

const toDateInput = (d: Date) => format(d, 'yyyy-MM-dd');
const toTimeInput = (d: Date) => format(d, 'HH:mm');

function combine(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

// 29/10/2026 (dono): reserva não vence sozinha (tem família que só faz o cadastro
// depois da sessão). Fica na agenda até alguém confirmar ou excluir.
function textoVencimento(inicio: Date | null): string | null {
  if (!inicio) return null;
  return 'A reserva fica na agenda até alguém confirmar ou excluir.';
}

export const ReservaDialog = React.memo<ReservaDialogProps>(
  ({
    isOpen,
    onClose,
    initialStart,
    initialEnd,
    editReserva,
    podeConfirmar = false,
    onConfirmar,
  }) => {
    const { toast } = useToast();
    const { user } = useAuth();
    const currentPessoaId = user?.pessoa?.id ?? '';
    const isProfissional = user?.pessoa?.role === 'profissional';

    const editing = editReserva ?? null;
    const somenteLeitura = !!editing && !editing.pode_editar;

    const [profissionalId, setProfissionalId] = useState('');
    const [data, setData] = useState('');
    const [horaInicio, setHoraInicio] = useState('08:00');
    const [horaFim, setHoraFim] = useState('09:00');
    const [pacienteId, setPacienteId] = useState('');
    const [observacao, setObservacao] = useState('');

    const [conflitos, setConflitos] = useState<ConflitoCompromisso[]>([]);
    const [checando, setChecando] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const obsRef = useRef<HTMLTextAreaElement>(null);

    // Preenche ao abrir
    useEffect(() => {
      if (!isOpen) return;
      setError('');
      setConflitos([]);
      if (editing) {
        const ini = fromWallClockString(editing.inicio);
        const fim = fromWallClockString(editing.fim);
        setProfissionalId(editing.profissional_id ?? '');
        setData(toDateInput(ini));
        setHoraInicio(toTimeInput(ini));
        setHoraFim(toTimeInput(fim));
        setPacienteId(editing.paciente_id ?? '');
        setObservacao(editing.observacao ?? '');
        return;
      }
      const base = initialStart ?? new Date();
      const temHora = !!initialStart && !!initialEnd;
      setProfissionalId(isProfissional ? currentPessoaId : '');
      setData(toDateInput(base));
      setHoraInicio(temHora ? toTimeInput(base) : '08:00');
      setHoraFim(temHora && initialEnd ? toTimeInput(initialEnd) : '09:00');
      setPacienteId('');
      setObservacao('');
    }, [
      isOpen,
      editing,
      initialStart,
      initialEnd,
      isProfissional,
      currentPessoaId,
    ]);

    const intervalo = useMemo(() => {
      if (!data || !horaInicio || !horaFim) return null;
      return { inicio: combine(data, horaInicio), fim: combine(data, horaFim) };
    }, [data, horaInicio, horaFim]);

    const intervaloValido = !!intervalo && intervalo.fim > intervalo.inicio;

    // Consulta marcada no horário (ao vivo). Outros compromissos/reservas o banco
    // recusa ao salvar, com a mensagem de quem ocupa.
    useEffect(() => {
      if (!isOpen || somenteLeitura || !profissionalId || !intervaloValido) {
        setConflitos([]);
        return;
      }
      let cancelado = false;
      setChecando(true);
      const t = setTimeout(async () => {
        try {
          const c = await fetchConflitosCompromisso(profissionalId, [
            intervalo!,
          ]);
          if (!cancelado) setConflitos(c);
        } catch (e) {
          console.error('Erro ao checar a agenda da reserva:', e);
          if (!cancelado) setConflitos([]);
        } finally {
          if (!cancelado) setChecando(false);
        }
      }, 400);
      return () => {
        cancelado = true;
        clearTimeout(t);
      };
    }, [isOpen, somenteLeitura, profissionalId, intervalo, intervaloValido]);

    const validar = (): string | null => {
      if (!profissionalId) return 'Escolha o profissional.';
      if (!intervalo) return 'Preencha a data e o horário.';
      if (!intervaloValido) return 'O fim precisa ser depois do início.';
      if (!observacao.trim())
        return 'Escreva uma observação (quem reservou, para quem, o que falta).';
      return null;
    };

    const temConflito = conflitos.length > 0;

    const handleSalvar = async () => {
      setError('');
      const v = validar();
      if (v) {
        setError(v);
        if (!observacao.trim()) obsRef.current?.focus();
        return;
      }
      if (!intervalo || temConflito) return;
      const input = {
        profissionalId,
        inicio: intervalo.inicio,
        fim: intervalo.fim,
        pacienteId: pacienteId || null,
        observacao: observacao.trim(),
      };
      setSaving(true);
      try {
        if (editing) {
          await updateReserva(editing.id, input);
          toast({ title: 'Reserva atualizada' });
        } else {
          await createReserva(input);
          toast({
            title: 'Horário reservado',
            description: 'Ninguém consegue agendar por cima até confirmar.',
          });
        }
        notifyCompromissosChanged();
        onClose();
      } catch (e) {
        if (e instanceof CompromissoError && e.erro.tipo !== 'outro') {
          setError(e.erro.mensagem);
          try {
            setConflitos(
              await fetchConflitosCompromisso(profissionalId, [intervalo])
            );
          } catch {
            /* fica a mensagem */
          }
        } else {
          console.error('Erro ao salvar reserva:', e);
          setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
        }
      } finally {
        setSaving(false);
      }
    };

    const handleExcluir = async () => {
      if (!editing) return;
      if (!window.confirm('Excluir esta reserva? O horário fica livre.'))
        return;
      setSaving(true);
      try {
        await deleteCompromisso(editing.id);
        toast({ title: 'Reserva excluída', description: 'Horário liberado.' });
        notifyCompromissosChanged();
        onClose();
      } catch (e) {
        console.error('Erro ao excluir reserva:', e);
        toast({
          title: 'Não foi possível excluir',
          description: e instanceof Error ? e.message : undefined,
          variant: 'destructive',
        });
      } finally {
        setSaving(false);
      }
    };

    const handleConfirmar = () => {
      if (!editing || !onConfirmar) return;
      setError('');
      const v = validar();
      if (v) {
        setError(v);
        return;
      }
      onConfirmar({
        reservaId: editing.id,
        profissionalId,
        pacienteId: pacienteId || null,
        data: combine(data, '00:00'),
        hora: horaInicio,
        observacao: observacao.trim(),
      });
    };

    const vencimento = textoVencimento(intervalo?.inicio ?? null);

    // ---------------- Somente leitura ----------------
    if (somenteLeitura && editing) {
      const ini = fromWallClockString(editing.inicio);
      const fim = fromWallClockString(editing.fim);
      return (
        <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BookmarkCheck className="h-5 w-5" />
                {editing.titulo ?? 'Reserva'}
              </DialogTitle>
              <DialogDescription>
                {editing.profissional_nome ?? 'Profissional'} ·{' '}
                {format(ini, 'dd/MM/yyyy HH:mm')}–{format(fim, 'HH:mm')}
              </DialogDescription>
            </DialogHeader>
            {editing.observacao && (
              <p className="whitespace-pre-line text-sm">
                {editing.observacao}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Horário reservado. Você não tem permissão para alterar esta
              reserva.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }

    return (
      <Dialog open={isOpen} onOpenChange={(o) => !o && !saving && onClose()}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookmarkCheck className="h-5 w-5" />
              {editing ? 'Reserva de horário' : 'Nova reserva'}
            </DialogTitle>
            <DialogDescription>
              Segura o horário para ninguém agendar por cima. Depois é só
              confirmar o agendamento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Profissional */}
            {!isProfissional && (
              <div className="space-y-1.5">
                <Label>Profissional</Label>
                <ProfessionalSelect
                  value={profissionalId}
                  onValueChange={setProfissionalId}
                />
              </div>
            )}

            {/* Quando */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="reserva-data">Data</Label>
                <Input
                  id="reserva-data"
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reserva-inicio">Início</Label>
                <Input
                  id="reserva-inicio"
                  type="time"
                  value={horaInicio}
                  onChange={(e) => {
                    const novo = e.target.value;
                    // mantém a duração ao mover o início
                    if (data && novo && intervalo && intervaloValido) {
                      const dur =
                        intervalo.fim.getTime() - intervalo.inicio.getTime();
                      const fim = new Date(combine(data, novo).getTime() + dur);
                      if (toDateInput(fim) === data)
                        setHoraFim(toTimeInput(fim));
                    }
                    setHoraInicio(novo);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reserva-fim">Fim</Label>
                <Input
                  id="reserva-fim"
                  type="time"
                  value={horaFim}
                  onChange={(e) => setHoraFim(e.target.value)}
                />
              </div>
            </div>

            {/* Paciente (opcional) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>
                  Paciente{' '}
                  <span className="font-normal text-muted-foreground">
                    (opcional)
                  </span>
                </Label>
                {pacienteId && (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setPacienteId('')}
                  >
                    <UserX className="h-3.5 w-3.5" />
                    Sem cadastro
                  </button>
                )}
              </div>
              <PatientSelect
                value={pacienteId}
                onValueChange={setPacienteId}
                placeholder="Buscar paciente já cadastrado…"
              />
              {!pacienteId && (
                <p className="text-xs text-muted-foreground">
                  Ainda sem cadastro? Deixe em branco e escreva na observação
                  quem é. O paciente é escolhido na hora de confirmar.
                </p>
              )}
            </div>

            {/* Observação (obrigatória) */}
            <div className="space-y-1.5">
              <Label htmlFor="reserva-obs">Observação</Label>
              <Textarea
                id="reserva-obs"
                ref={obsRef}
                rows={3}
                value={observacao}
                placeholder="Ex.: Mãe da Laura, retorna amanhã para confirmar"
                onChange={(e) => setObservacao(e.target.value)}
              />
            </div>

            {/* Vencimento */}
            {intervaloValido && vencimento && (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                {vencimento}
              </p>
            )}

            {checando && !temConflito && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Conferindo a agenda…
              </p>
            )}
            {temConflito && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="flex items-center gap-2 font-semibold text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Já tem consulta nesse horário
                </p>
                <ul className="mt-1.5 space-y-1">
                  {conflitos.slice(0, 3).map((c) => (
                    <li key={c.agendamento_id}>
                      {c.paciente_nome ?? 'Consulta'} ·{' '}
                      {format(fromWallClockString(c.data_hora), 'HH:mm')}–
                      {format(fromWallClockString(c.fim), 'HH:mm')}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-muted-foreground">
                  Escolha outro horário para a reserva.
                </p>
              </div>
            )}

            {error && (
              <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex gap-2">
              {editing && (
                <Button
                  variant="ghost"
                  className="text-destructive"
                  onClick={handleExcluir}
                  disabled={saving}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Excluir
                </Button>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {editing ? (
                <>
                  <Button
                    variant="outline"
                    onClick={handleSalvar}
                    disabled={saving || temConflito}
                  >
                    {saving && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Salvar alterações
                  </Button>
                  {podeConfirmar && onConfirmar && (
                    <Button onClick={handleConfirmar} disabled={saving}>
                      <CalendarCheck className="mr-1.5 h-4 w-4" />
                      Confirmar agendamento
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={onClose} disabled={saving}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleSalvar}
                    disabled={saving || temConflito}
                  >
                    {saving && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Reservar horário
                  </Button>
                </>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

ReservaDialog.displayName = 'ReservaDialog';
