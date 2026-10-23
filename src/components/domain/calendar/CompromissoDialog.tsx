import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  CalendarClock,
  Loader2,
  Lock,
  Trash2,
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
  CompromissoError,
  createCompromissos,
  deleteCompromisso,
  deleteCompromissoSerie,
  expandRecorrencia,
  fetchConflitosCompromisso,
  fromWallClockString,
  notifyCompromissosChanged,
  updateCompromisso,
} from '@/lib/agenda-bloqueios-api';
import {
  MOTIVO_BLOQUEIO_CORES,
  MOTIVO_BLOQUEIO_LABELS,
  labelCategoria,
  type CompromissoAgenda,
  type ConflitoCompromisso,
  type MotivoBloqueio,
  type RecorrenciaTipo,
} from '@/types/agenda-bloqueios';
import { eventColorHexMap } from '@/types/calendar';

// AI dev note: "Novo compromisso" (evolução do BloqueioAgendaDialog). Título livre +
// categoria, privado, impedir agendamentos, recorrência. Conflito com consulta
// marcada aparece ao vivo (RPC fn_compromisso_conflitos, sobreposição real);
// profissional não salva por cima, admin/secretária podem registrar mesmo assim
// (fica marcado como conflito pendente). O banco reforça tudo isso por gatilho.

export interface CompromissoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  // Criação: dia (e opcionalmente horário) pré-preenchidos
  initialStart?: Date;
  initialEnd?: Date;
  // Edição: compromisso clicado no calendário
  editCompromisso?: CompromissoAgenda | null;
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_SEMANA_LONGO = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
];

const toDateInput = (d: Date) => format(d, 'yyyy-MM-dd');
const toTimeInput = (d: Date) => format(d, 'HH:mm');

function combine(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

const fmtHora = (iso: string) => format(fromWallClockString(iso), 'HH:mm');
const fmtDiaHora = (iso: string) =>
  format(fromWallClockString(iso), "EEE dd/MM 'às' HH:mm", { locale: ptBR });

export const CompromissoDialog = React.memo<CompromissoDialogProps>(
  ({ isOpen, onClose, onSaved, initialStart, initialEnd, editCompromisso }) => {
    const { toast } = useToast();
    const { user } = useAuth();
    const currentPessoaId = user?.pessoa?.id ?? '';
    const userRole = (user?.pessoa?.role ?? null) as
      | 'admin'
      | 'profissional'
      | 'secretaria'
      | null;
    const isProfissional = userRole === 'profissional';
    const podeForcarConflito =
      userRole === 'admin' || userRole === 'secretaria';

    const editing = editCompromisso ?? null;
    const somenteLeitura = !!editing && !editing.pode_editar;

    // Campos
    const [titulo, setTitulo] = useState('');
    const [categoria, setCategoria] = useState<MotivoBloqueio>('pessoal');
    const [clinicaInteira, setClinicaInteira] = useState(false);
    const [profissionalId, setProfissionalId] = useState('');
    const [diaInteiro, setDiaInteiro] = useState(false);
    const [dataInicio, setDataInicio] = useState('');
    const [dataFim, setDataFim] = useState('');
    const [horaInicio, setHoraInicio] = useState('08:00');
    const [horaFim, setHoraFim] = useState('09:00');
    const [recorrenciaTipo, setRecorrenciaTipo] =
      useState<RecorrenciaTipo>('nenhuma');
    const [diasSemana, setDiasSemana] = useState<number[]>([]);
    const [recorrenciaAte, setRecorrenciaAte] = useState('');
    const [impedeAgendamento, setImpedeAgendamento] = useState(true);
    const [privado, setPrivado] = useState(false);
    const [observacao, setObservacao] = useState('');

    // Fluxo
    const [conflitos, setConflitos] = useState<ConflitoCompromisso[]>([]);
    const [checandoConflito, setChecandoConflito] = useState(false);
    const [aceitarConflito, setAceitarConflito] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const tituloRef = useRef<HTMLInputElement>(null);

    // Preenche ao abrir
    useEffect(() => {
      if (!isOpen) return;
      setError('');
      setConflitos([]);
      setAceitarConflito(false);

      if (editing) {
        const ini = fromWallClockString(editing.inicio);
        const fim = fromWallClockString(editing.fim);
        setTitulo(editing.titulo ?? '');
        setCategoria(
          (editing.categoria as MotivoBloqueio) in MOTIVO_BLOQUEIO_LABELS
            ? (editing.categoria as MotivoBloqueio)
            : 'outro'
        );
        setClinicaInteira(editing.profissional_id === null);
        setProfissionalId(editing.profissional_id ?? '');
        setDiaInteiro(editing.dia_inteiro);
        setDataInicio(toDateInput(ini));
        setHoraInicio(toTimeInput(ini));
        // dia inteiro guarda fim = 00:00 do dia seguinte
        setDataFim(
          toDateInput(
            editing.dia_inteiro ? new Date(fim.getTime() - 1000) : fim
          )
        );
        setHoraFim(toTimeInput(fim));
        setRecorrenciaTipo('nenhuma');
        setDiasSemana([]);
        setRecorrenciaAte('');
        setImpedeAgendamento(editing.impede_agendamento);
        setPrivado(editing.privado);
        setObservacao(editing.observacao ?? '');
        return;
      }

      const base = initialStart ?? new Date();
      const temHora = !!initialStart && !!initialEnd;
      const dia = toDateInput(base);
      setTitulo('');
      setCategoria('pessoal');
      setClinicaInteira(false);
      setProfissionalId(isProfissional ? currentPessoaId : '');
      setDiaInteiro(false);
      setDataInicio(dia);
      setDataFim(toDateInput(initialEnd ?? base));
      setHoraInicio(temHora ? toTimeInput(base) : '08:00');
      setHoraFim(temHora && initialEnd ? toTimeInput(initialEnd) : '09:00');
      setRecorrenciaTipo('nenhuma');
      setDiasSemana([base.getDay()]);
      setRecorrenciaAte(dia);
      setImpedeAgendamento(true);
      setPrivado(false);
      setObservacao('');
      // foco no título
      setTimeout(() => tituloRef.current?.focus(), 50);
    }, [
      isOpen,
      editing,
      initialStart,
      initialEnd,
      isProfissional,
      currentPessoaId,
    ]);

    const intervalo = useMemo((): { inicio: Date; fim: Date } | null => {
      if (!dataInicio || !dataFim) return null;
      if (diaInteiro) {
        const inicio = combine(dataInicio, '00:00');
        const fimDia = combine(dataFim, '00:00');
        const fim = new Date(
          fimDia.getFullYear(),
          fimDia.getMonth(),
          fimDia.getDate() + 1
        );
        return { inicio, fim };
      }
      return {
        inicio: combine(dataInicio, horaInicio),
        fim: combine(dataFim, horaFim),
      };
    }, [dataInicio, dataFim, horaInicio, horaFim, diaInteiro]);

    const ocorrencias = useMemo(() => {
      if (!intervalo || intervalo.fim <= intervalo.inicio) return [];
      if (editing) return [intervalo];
      return expandRecorrencia({
        ...intervalo,
        recorrencia: {
          tipo: recorrenciaTipo,
          diasSemana,
          ate: recorrenciaAte,
        },
      });
    }, [intervalo, editing, recorrenciaTipo, diasSemana, recorrenciaAte]);

    const alvoId = clinicaInteira ? null : profissionalId || null;
    const alvoDefinido = clinicaInteira || !!profissionalId;

    // Conflito ao vivo (debounce) — só quando o compromisso ocupa a agenda
    useEffect(() => {
      if (!isOpen || somenteLeitura) return;
      setAceitarConflito(false);
      if (!impedeAgendamento || !alvoDefinido || ocorrencias.length === 0) {
        setConflitos([]);
        return;
      }
      let cancelado = false;
      setChecandoConflito(true);
      const t = setTimeout(async () => {
        try {
          const c = await fetchConflitosCompromisso(alvoId, ocorrencias);
          if (!cancelado) setConflitos(c);
        } catch (e) {
          console.error('Erro ao checar conflitos do compromisso:', e);
          if (!cancelado) setConflitos([]);
        } finally {
          if (!cancelado) setChecandoConflito(false);
        }
      }, 400);
      return () => {
        cancelado = true;
        clearTimeout(t);
      };
    }, [
      isOpen,
      somenteLeitura,
      impedeAgendamento,
      alvoDefinido,
      alvoId,
      ocorrencias,
    ]);

    const validar = (): string | null => {
      if (!alvoDefinido)
        return 'Escolha o profissional ou marque "Clínica inteira".';
      if (!intervalo) return 'Preencha a data.';
      if (intervalo.fim <= intervalo.inicio)
        return 'O fim precisa ser depois do início.';
      if (!editing && recorrenciaTipo !== 'nenhuma') {
        if (recorrenciaTipo === 'semanal' && diasSemana.length === 0)
          return 'Escolha ao menos um dia da semana.';
        if (!recorrenciaAte)
          return 'Informe até quando o compromisso se repete.';
        if (combine(recorrenciaAte, '23:59') < intervalo.inicio)
          return 'A data final da repetição é antes do início.';
      }
      return null;
    };

    const temConflito = impedeAgendamento && conflitos.length > 0;
    const bloqueadoPorConflito =
      temConflito && (!podeForcarConflito || !aceitarConflito);

    const handleSubmit = async () => {
      setError('');
      const v = validar();
      if (v) {
        setError(v);
        return;
      }
      if (!intervalo || bloqueadoPorConflito) return;

      const comum = {
        profissionalId: alvoId,
        inicio: intervalo.inicio,
        fim: intervalo.fim,
        diaInteiro,
        categoria,
        titulo: titulo.trim() || null,
        observacao: observacao.trim() || null,
        privado: clinicaInteira ? false : privado,
        impedeAgendamento,
        aceitarConflito: temConflito && aceitarConflito,
      };

      setSaving(true);
      try {
        if (editing) {
          await updateCompromisso(editing.id, comum);
          toast({ title: 'Compromisso atualizado' });
        } else {
          const { count } = await createCompromissos({
            ...comum,
            recorrencia: {
              tipo: recorrenciaTipo,
              diasSemana,
              ate: recorrenciaAte,
            },
          });
          toast({
            title: 'Compromisso salvo',
            description:
              count > 1 ? `${count} ocorrências criadas.` : undefined,
          });
        }
        notifyCompromissosChanged();
        onSaved?.();
        onClose();
      } catch (e) {
        if (e instanceof CompromissoError && e.erro.tipo !== 'outro') {
          // corrida: alguém marcou consulta enquanto o formulário estava aberto
          try {
            setConflitos(await fetchConflitosCompromisso(alvoId, ocorrencias));
          } catch {
            /* mantém a mensagem abaixo */
          }
          setError(
            e.erro.tipo === 'sem_permissao_conflito'
              ? 'Há consulta marcada nesse horário. Peça à secretaria para reagendar antes de criar o compromisso.'
              : 'Uma consulta foi marcada nesse horário. Revise o conflito abaixo.'
          );
        } else {
          console.error('Erro ao salvar compromisso:', e);
          setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
        }
      } finally {
        setSaving(false);
      }
    };

    const handleDelete = async (serie: boolean) => {
      if (!editing) return;
      const msg = serie
        ? 'Excluir TODAS as ocorrências desta série?'
        : 'Excluir este compromisso?';
      if (!window.confirm(msg)) return;
      setSaving(true);
      try {
        if (serie && editing.recorrencia_id)
          await deleteCompromissoSerie(editing.recorrencia_id);
        else await deleteCompromisso(editing.id);
        toast({ title: serie ? 'Série excluída' : 'Compromisso excluído' });
        notifyCompromissosChanged();
        onSaved?.();
        onClose();
      } catch (e) {
        console.error('Erro ao excluir compromisso:', e);
        toast({
          title: 'Não foi possível excluir',
          description: e instanceof Error ? e.message : undefined,
          variant: 'destructive',
        });
      } finally {
        setSaving(false);
      }
    };

    const toggleDia = (d: number) =>
      setDiasSemana((prev) =>
        prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
      );

    // ---------------- Prévia ----------------
    const descricaoRepeticao = (() => {
      if (editing) return editing.recorrencia_id ? 'Parte de uma série' : null;
      if (recorrenciaTipo === 'nenhuma') return null;
      const ate = recorrenciaAte
        ? ` até ${format(combine(recorrenciaAte, '00:00'), 'dd/MM')}`
        : '';
      if (recorrenciaTipo === 'diaria') return `Todos os dias${ate}`;
      if (recorrenciaTipo === 'dias_uteis') return `Dias úteis${ate}`;
      if (diasSemana.length === 1)
        return `Toda ${DIAS_SEMANA_LONGO[diasSemana[0]]}${ate}`;
      return `${diasSemana.map((d) => DIAS_SEMANA[d]).join(', ')}${ate}`;
    })();

    const previaHorario = (() => {
      if (!intervalo) return '';
      if (diaInteiro) {
        const fimDia = new Date(intervalo.fim.getTime() - 1000);
        return toDateInput(intervalo.inicio) === toDateInput(fimDia)
          ? 'Dia inteiro'
          : `${format(intervalo.inicio, 'dd/MM')} a ${format(fimDia, 'dd/MM')} · dia inteiro`;
      }
      return toDateInput(intervalo.inicio) === toDateInput(intervalo.fim)
        ? `${format(intervalo.inicio, 'HH:mm')}–${format(intervalo.fim, 'HH:mm')}`
        : `${format(intervalo.inicio, 'dd/MM HH:mm')} – ${format(intervalo.fim, 'dd/MM HH:mm')}`;
    })();

    const corPrevia = eventColorHexMap[MOTIVO_BLOQUEIO_CORES[categoria]];

    // ---------------- Somente leitura (privado de outra pessoa) ----------------
    if (somenteLeitura && editing) {
      const ini = fromWallClockString(editing.inicio);
      const fim = fromWallClockString(editing.fim);
      return (
        <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                {editing.mascarado
                  ? 'Indisponível'
                  : editing.titulo || labelCategoria(editing.categoria)}
              </DialogTitle>
              <DialogDescription>
                {editing.profissional_id === null
                  ? 'Clínica inteira'
                  : (editing.profissional_nome ?? 'Profissional')}{' '}
                ·{' '}
                {editing.dia_inteiro
                  ? format(ini, "dd/MM/yyyy '· dia inteiro'")
                  : `${format(ini, 'dd/MM/yyyy HH:mm')}–${format(fim, 'HH:mm')}`}
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {editing.mascarado
                ? 'Compromisso privado. Só quem criou e o profissional veem os detalhes.'
                : 'Você não tem permissão para alterar este compromisso.'}
              {editing.impede_agendamento &&
                ' O horário fica indisponível para novas consultas.'}
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
        <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />
              {editing ? 'Editar compromisso' : 'Novo compromisso'}
            </DialogTitle>
            <DialogDescription>
              Almoço, reunião, terapia, férias, assuntos pessoais… Aparece na
              agenda como as consultas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Título */}
            <div className="space-y-1.5">
              <Label htmlFor="compromisso-titulo">Título do compromisso</Label>
              <Input
                id="compromisso-titulo"
                ref={tituloRef}
                value={titulo}
                maxLength={120}
                placeholder={`Ex.: Terapia, Buscar Henrique, Dentista`}
                onChange={(e) => setTitulo(e.target.value)}
              />
            </div>

            {/* Categoria */}
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select
                value={categoria}
                onValueChange={(v) => setCategoria(v as MotivoBloqueio)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(MOTIVO_BLOQUEIO_LABELS) as MotivoBloqueio[]
                  ).map((m) => (
                    <SelectItem key={m} value={m}>
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              eventColorHexMap[MOTIVO_BLOQUEIO_CORES[m]],
                          }}
                        />
                        {MOTIVO_BLOQUEIO_LABELS[m]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* De quem */}
            {!isProfissional && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Profissional</Label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={clinicaInteira}
                      onCheckedChange={(v) => {
                        const on = Boolean(v);
                        setClinicaInteira(on);
                        if (on && categoria === 'pessoal') {
                          setCategoria('feriado');
                          setDiaInteiro(true);
                        }
                      }}
                      disabled={!!editing}
                    />
                    Clínica inteira
                  </label>
                </div>
                {clinicaInteira ? (
                  <p className="text-sm text-muted-foreground">
                    Vale para todos os profissionais (ex.: feriado, clínica
                    fechada).
                  </p>
                ) : (
                  <ProfessionalSelect
                    value={profissionalId}
                    onValueChange={setProfissionalId}
                    disabled={!!editing}
                  />
                )}
              </div>
            )}

            {/* Quando */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={diaInteiro}
                  onCheckedChange={(v) => setDiaInteiro(Boolean(v))}
                />
                Dia inteiro
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{diaInteiro ? 'De' : 'Data'}</Label>
                  <Input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDataInicio(v);
                      // mesmo dia por padrão; período longo só no dia inteiro
                      if (!diaInteiro || dataFim < v) setDataFim(v);
                    }}
                  />
                </div>
                {diaInteiro ? (
                  <div className="space-y-1">
                    <Label>Até</Label>
                    <Input
                      type="date"
                      value={dataFim}
                      min={dataInicio}
                      onChange={(e) => setDataFim(e.target.value)}
                    />
                  </div>
                ) : (
                  <div />
                )}
                {!diaInteiro && (
                  <>
                    <div className="space-y-1">
                      <Label>Início</Label>
                      <Input
                        type="time"
                        value={horaInicio}
                        onChange={(e) => setHoraInicio(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Fim</Label>
                      <Input
                        type="time"
                        value={horaFim}
                        onChange={(e) => setHoraFim(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Repetição */}
            {editing ? (
              editing.recorrencia_id && (
                <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  Este compromisso faz parte de uma série. As alterações valem
                  só para esta ocorrência.
                </p>
              )
            ) : (
              <div className="space-y-2">
                <Label>Repetição</Label>
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
                    <SelectItem value="diaria">Todos os dias</SelectItem>
                    <SelectItem value="dias_uteis">
                      Dias úteis (seg a sex)
                    </SelectItem>
                    <SelectItem value="semanal">
                      Semanal (escolher os dias)
                    </SelectItem>
                  </SelectContent>
                </Select>
                {recorrenciaTipo !== 'nenhuma' && (
                  <div className="space-y-2 rounded-md border p-3">
                    {recorrenciaTipo === 'semanal' && (
                      <div className="flex flex-wrap gap-1.5">
                        {DIAS_SEMANA.map((label, idx) => (
                          <label
                            key={idx}
                            className={cn(
                              'flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-sm',
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
                    )}
                    <div className="space-y-1">
                      <Label>Repetir até</Label>
                      <Input
                        type="date"
                        value={recorrenciaAte}
                        min={dataInicio}
                        onChange={(e) => setRecorrenciaAte(e.target.value)}
                      />
                    </div>
                    {ocorrencias.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {ocorrencias.length} ocorrência
                        {ocorrencias.length > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Opções */}
            <div className="space-y-2.5 border-t pt-3">
              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={impedeAgendamento}
                  onCheckedChange={(v) => setImpedeAgendamento(Boolean(v))}
                />
                <span>Impedir agendamentos neste horário</span>
              </label>
              {!clinicaInteira && (
                <label className="flex items-start gap-2.5 text-sm">
                  <Checkbox
                    className="mt-0.5"
                    checked={privado}
                    onCheckedChange={(v) => setPrivado(Boolean(v))}
                  />
                  <span>
                    Compromisso privado
                    <span className="block text-xs text-muted-foreground">
                      A secretaria e os colegas veem só "Indisponível".
                    </span>
                  </span>
                </label>
              )}
            </div>

            {/* Observação */}
            <div className="space-y-1.5">
              <Label>Observação (opcional)</Label>
              <Textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={2}
              />
            </div>

            {/* Prévia */}
            {intervalo && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Prévia na agenda
                </p>
                <div
                  className="flex items-center gap-2 rounded-md border-l-[3px] bg-card px-2.5 py-1.5 text-sm"
                  style={{ borderLeftColor: corPrevia }}
                >
                  <span className="font-medium text-roxo-titulo dark:text-foreground">
                    {titulo.trim() || labelCategoria(categoria)}
                  </span>
                  <span className="text-muted-foreground">
                    · {previaHorario}
                  </span>
                  {privado && !clinicaInteira && (
                    <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {descricaoRepeticao ? `${descricaoRepeticao} · ` : ''}
                  {impedeAgendamento
                    ? 'Horário indisponível para novas consultas'
                    : 'Só informativo: não impede consultas'}
                </p>
              </div>
            )}

            {/* Conflito */}
            {checandoConflito &&
              conflitos.length === 0 &&
              impedeAgendamento && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Conferindo a agenda…
                </p>
              )}
            {temConflito && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  {conflitos.length === 1
                    ? 'Existe um agendamento em conflito'
                    : `Existem ${conflitos.length} agendamentos em conflito`}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {conflitos.length === 1
                    ? 'Uma consulta já ocupa parte desse horário.'
                    : 'Consultas já ocupam parte desse horário.'}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {conflitos.slice(0, 5).map((c) => (
                    <li
                      key={c.agendamento_id}
                      className="rounded-md bg-card px-2.5 py-1.5 text-sm"
                    >
                      <span className="font-medium">
                        {c.paciente_nome ?? 'Consulta'} ·{' '}
                        {fmtDiaHora(c.data_hora)}–{fmtHora(c.fim)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {clinicaInteira && c.profissional_nome
                          ? `${c.profissional_nome.split(' ')[0]} · `
                          : ''}
                        Sobreposição: {fmtHora(c.sobreposicao_inicio)}–
                        {fmtHora(c.sobreposicao_fim)}
                      </span>
                    </li>
                  ))}
                  {conflitos.length > 5 && (
                    <li className="text-xs text-muted-foreground">
                      +{conflitos.length - 5} outras
                    </li>
                  )}
                </ul>
                <p className="mt-2 text-sm">
                  É necessário avaliar o reagendamento antes de confirmar a
                  indisponibilidade.
                </p>
                {podeForcarConflito ? (
                  <label className="mt-2 flex items-start gap-2.5 text-sm">
                    <Checkbox
                      className="mt-0.5"
                      checked={aceitarConflito}
                      onCheckedChange={(v) => setAceitarConflito(Boolean(v))}
                    />
                    <span>
                      Registrar mesmo assim e manter a consulta
                      <span className="block text-xs text-muted-foreground">
                        Os dois ficam marcados como conflito pendente até alguém
                        reagendar.
                      </span>
                    </span>
                  </label>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Peça à secretaria para reagendar a consulta, ou desmarque
                    "Impedir agendamentos" se for só um lembrete.
                  </p>
                )}
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
                <>
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => handleDelete(false)}
                    disabled={saving}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Excluir
                  </Button>
                  {editing.recorrencia_id && (
                    <Button
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => handleDelete(true)}
                      disabled={saving}
                    >
                      Excluir série
                    </Button>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancelar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={saving || bloqueadoPorConflito}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? 'Salvar alterações' : 'Salvar compromisso'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

CompromissoDialog.displayName = 'CompromissoDialog';
