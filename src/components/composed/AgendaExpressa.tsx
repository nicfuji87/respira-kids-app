// AI dev note: Agenda Expressa — bloco "Próxima sessão" que repete a consulta
// de hoje (criança, serviço, local) e marca a próxima em 2 a 3 toques: dia,
// horário, botão. Fica no topo da evolução (respiratória e motora) e no card da
// consulta. Salva na hora, sem depender de finalizar a evolução.
//
// Sem "Desfazer" de propósito: o aviso de nova consulta sai para a família no
// insert; desfazer mandaria um aviso de cancelamento logo depois. O botão já
// diz o dia e a hora antes de marcar.
//
// Regras de quem marca onde ficam no banco (fn_agenda_expressa_*).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/primitives/button';
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
  criarAgendaExpressa,
  fetchAgendaExpressaContexto,
  fetchAgendaExpressaHorarios,
  mensagemErroAgendaExpressa,
  type AgendaExpressaContexto,
  type AgendaExpressaDia,
} from '@/lib/agenda-expressa-api';

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// "AAAA-MM-DD" -> Date local (sem fuso). Nunca new Date("AAAA-MM-DD"), que é UTC.
const parseDia = (data: string): Date => {
  const [y, m, d] = data.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const diaIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;

const somarDias = (data: string, dias: number): string => {
  const d = parseDia(data);
  d.setDate(d.getDate() + dias);
  return diaIso(d);
};

const rotuloDiaCurto = (data: string, hoje: string): string => {
  if (data === hoje) return 'Hoje';
  if (data === somarDias(hoje, 1)) return 'Amanhã';
  return DIAS_SEMANA[parseDia(data).getDay()];
};

// "sex 30/10"
const rotuloDiaCompleto = (data: string): string => {
  const d = parseDia(data);
  return `${DIAS_SEMANA[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(
    d.getMonth() + 1
  ).padStart(2, '0')}`;
};

// "AAAA-MM-DDTHH:MM" -> "qui 05/11 às 14:00"
const rotuloDataHora = (dataHora: string): string => {
  const [data, hora = ''] = dataHora.split('T');
  return `${rotuloDiaCompleto(data)} às ${hora.slice(0, 5)}`;
};

const primeiroNome = (nome?: string | null): string =>
  (nome || '').trim().split(/\s+/)[0] || '';

export interface AgendaExpressaProps {
  agendamentoId: string;
  /** Abre já expandido (ex.: card da consulta quando ainda não há próxima). */
  defaultOpen?: boolean;
  /**
   * Cada mudança (> 0) pede para abrir o bloco — ex.: a evolução marcou
   * "Manter Fisioterapia". Não abre se a próxima já está marcada.
   */
  abrirSinal?: number;
  onCreated?: (novoAgendamentoId: string) => void;
  className?: string;
}

export const AgendaExpressa: React.FC<AgendaExpressaProps> = ({
  agendamentoId,
  defaultOpen = false,
  abrirSinal = 0,
  onCreated,
  className,
}) => {
  const { toast } = useToast();
  const [contexto, setContexto] = useState<AgendaExpressaContexto | null>(null);
  const [carregandoContexto, setCarregandoContexto] = useState(true);
  const [aberto, setAberto] = useState(defaultOpen);
  const [profissionalId, setProfissionalId] = useState<string | null>(null);
  const [dias, setDias] = useState<AgendaExpressaDia[] | null>(null);
  const [carregandoHorarios, setCarregandoHorarios] = useState(false);
  const [erroHorarios, setErroHorarios] = useState<string | null>(null);
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [horaSel, setHoraSel] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<string[]>([]);

  const hoje = useMemo(() => diaIso(new Date()), []);

  const carregarContexto = useCallback(async () => {
    try {
      const ctx = await fetchAgendaExpressaContexto(agendamentoId);
      setContexto(ctx);
      setProfissionalId(
        (atual) => atual ?? ctx.profissional_padrao?.id ?? null
      );
    } catch (e) {
      console.error('Agenda Expressa: erro ao carregar contexto', e);
      setContexto({ ok: false, motivo: 'erro' });
    } finally {
      setCarregandoContexto(false);
    }
  }, [agendamentoId]);

  const carregarHorarios = useCallback(async () => {
    if (!profissionalId) return;
    setCarregandoHorarios(true);
    setErroHorarios(null);
    try {
      const res = await fetchAgendaExpressaHorarios(
        agendamentoId,
        profissionalId,
        14
      );
      if (!res.ok) {
        setErroHorarios(
          res.motivo === 'sem_permissao'
            ? 'Você não pode marcar na agenda desta profissional.'
            : 'Não deu para carregar os horários.'
        );
        setDias([]);
      } else {
        setDias(res.dias ?? []);
      }
    } catch (e) {
      console.error('Agenda Expressa: erro ao carregar horários', e);
      setErroHorarios('Não deu para carregar os horários.');
      setDias([]);
    } finally {
      setCarregandoHorarios(false);
    }
  }, [agendamentoId, profissionalId]);

  useEffect(() => {
    setCarregandoContexto(true);
    setContexto(null);
    setDias(null);
    setDiaSel(null);
    setHoraSel(null);
    setMarcadas([]);
    setProfissionalId(null);
    carregarContexto();
  }, [carregarContexto]);

  // Pedido de fora para abrir (conduta "Manter Fisioterapia" = sim). Só abre
  // se ainda não há próxima sessão marcada nem marcada agora.
  useEffect(() => {
    if (!abrirSinal || !contexto?.ok || contexto.pode_marcar === false) return;
    if ((contexto.proximas ?? []).length > 0 || marcadas.length > 0) return;
    setAberto(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reage só ao sinal e ao contexto carregado
  }, [abrirSinal, contexto?.ok]);

  // Horários só quando o bloco está aberto (e a cada troca de profissional)
  useEffect(() => {
    if (aberto && contexto?.ok && contexto.pode_marcar !== false) {
      carregarHorarios();
    }
  }, [aberto, contexto?.ok, contexto?.pode_marcar, carregarHorarios]);

  const origem = contexto?.origem;
  const horaOrigem = origem?.hora ?? null;
  const diaMaisSete = origem
    ? somarDias(origem.data_hora.slice(0, 10), 7)
    : null;

  const diaAtual = useMemo(
    () => dias?.find((d) => d.data === diaSel) ?? null,
    [dias, diaSel]
  );

  const escolherDia = (dia: AgendaExpressaDia) => {
    setErro(null);
    setDiaSel(dia.data);
    // Mesmo horário de hoje já vem escolhido quando está livre
    const mesmo = dia.horarios.find((h) => h.hora === horaOrigem && h.livre);
    setHoraSel(mesmo ? mesmo.hora : null);
  };

  const marcar = async () => {
    if (!diaSel || !horaSel || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await criarAgendaExpressa(
        agendamentoId,
        `${diaSel}T${horaSel}`,
        profissionalId
      );
      const rotulo = `${rotuloDataHora(res.data_hora)}${
        profissionalId !== contexto?.profissional_padrao?.id
          ? ` · ${primeiroNome(res.profissional_nome)}`
          : ''
      }`;
      setMarcadas((m) => [...m, rotulo]);
      toast({
        title: 'Próxima sessão marcada',
        description: `${rotulo}. A família recebe o aviso.`,
      });
      setDiaSel(null);
      setHoraSel(null);
      setAberto(false);
      onCreated?.(res.id);
      carregarContexto();
    } catch (e) {
      setErro(mensagemErroAgendaExpressa(e));
      // Alguém pode ter ocupado o horário: recarrega a grade
      carregarHorarios();
    } finally {
      setSalvando(false);
    }
  };

  if (carregandoContexto) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 text-sm text-muted-foreground',
          className
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando próxima sessão…
      </div>
    );
  }

  // Sem contexto (sem permissão ou consulta inativa): não mostra nada
  if (!contexto?.ok || !origem) return null;

  const proximas = contexto.proximas ?? [];
  const podeMarcar = contexto.pode_marcar !== false;
  const nomeProfAtual =
    contexto.profissionais?.find((p) => p.id === profissionalId)?.nome ??
    contexto.profissional_padrao?.nome;

  const resumoFechado =
    marcadas.length > 0
      ? null
      : proximas.length > 0
        ? `Já marcada: ${rotuloDataHora(proximas[0].data_hora)}${
            proximas[0].profissional_nome
              ? ` · ${primeiroNome(proximas[0].profissional_nome)}`
              : ''
          }${proximas.length > 1 ? ` (+${proximas.length - 1})` : ''}`
        : 'Ainda não marcada';

  return (
    <div className={cn('rounded-lg border bg-card', className)}>
      {/* Cabeçalho: sempre visível */}
      <div className="flex items-center gap-3 px-3 py-2">
        <CalendarPlus className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">Próxima sessão</span>
            <Zap
              className="h-3.5 w-3.5 text-amber-500"
              aria-label="Agenda Expressa"
            />
          </div>
          {marcadas.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {marcadas.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800 border border-green-200"
                >
                  <CalendarCheck className="h-3 w-3" />
                  {m}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground truncate">
              {resumoFechado}
            </p>
          )}
        </div>
        {podeMarcar && (
          <Button
            type="button"
            size="sm"
            variant={aberto ? 'ghost' : 'outline'}
            onClick={() => setAberto((a) => !a)}
            className="shrink-0 h-9"
            aria-expanded={aberto}
          >
            {aberto ? (
              <>
                Fechar <ChevronUp className="h-4 w-4 ml-1" />
              </>
            ) : marcadas.length > 0 ? (
              <>
                <Plus className="h-4 w-4 mr-1" /> Marcar mais uma
              </>
            ) : (
              <>
                Marcar <ChevronDown className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        )}
      </div>

      {aberto && podeMarcar && (
        <div className="border-t px-3 pb-3 pt-2 space-y-3">
          {/* O que vai ser repetido */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>
              Repete hoje: {origem.servico_nome || 'mesmo serviço'}
              {origem.local_nome ? ` · ${origem.local_nome}` : ''}
              {!contexto.pode_trocar && nomeProfAtual
                ? ` · ${nomeProfAtual}`
                : ''}
            </span>
            {contexto.pode_trocar ? (
              <Select
                value={profissionalId ?? undefined}
                onValueChange={(v) => {
                  setProfissionalId(v);
                  setDiaSel(null);
                  setHoraSel(null);
                  setErro(null);
                }}
              >
                <SelectTrigger className="h-7 w-auto gap-1 px-2 text-xs">
                  <SelectValue placeholder="Profissional" />
                </SelectTrigger>
                <SelectContent>
                  {(contexto.profissionais ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          {/* Dias */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">
              Quando volta?
            </p>
            {carregandoHorarios && !dias ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando horários…
              </div>
            ) : erroHorarios ? (
              <p className="text-sm text-destructive py-2">{erroHorarios}</p>
            ) : (dias ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                Nenhum dia com horário nas próximas duas semanas.
              </p>
            ) : (
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                {(dias ?? []).map((dia) => {
                  const sel = dia.data === diaSel;
                  const cheio = dia.livres === 0;
                  const d = parseDia(dia.data);
                  return (
                    <button
                      key={dia.data}
                      type="button"
                      onClick={() => escolherDia(dia)}
                      aria-pressed={sel}
                      className={cn(
                        'flex-shrink-0 min-w-[60px] rounded-md border px-2 py-1.5 text-center transition-colors',
                        sel
                          ? 'border-primary bg-primary/10 ring-1 ring-primary'
                          : 'bg-background hover:bg-muted',
                        cheio && !sel && 'opacity-60'
                      )}
                    >
                      <div
                        className={cn(
                          'text-xs leading-tight',
                          sel ? 'text-primary' : 'text-muted-foreground'
                        )}
                      >
                        {rotuloDiaCurto(dia.data, hoje)}
                      </div>
                      <div
                        className={cn(
                          'text-base font-semibold leading-tight',
                          sel && 'text-primary'
                        )}
                      >
                        {String(d.getDate()).padStart(2, '0')}
                      </div>
                      <div className="text-xs leading-tight text-muted-foreground">
                        {cheio
                          ? 'cheio'
                          : dia.data === diaMaisSete
                            ? '+7 dias'
                            : `${dia.livres} livre${dia.livres > 1 ? 's' : ''}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Horários do dia escolhido */}
          {diaAtual && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">
                Horários de {rotuloDiaCompleto(diaAtual.data)}
                {primeiroNome(nomeProfAtual)
                  ? ` · ${primeiroNome(nomeProfAtual)}`
                  : ''}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {diaAtual.horarios.map((h) => {
                  const sel = h.hora === horaSel;
                  const mesmo = h.hora === horaOrigem;
                  return (
                    <button
                      key={h.hora}
                      type="button"
                      disabled={!h.livre}
                      onClick={() => {
                        setErro(null);
                        setHoraSel(h.hora);
                      }}
                      aria-pressed={sel}
                      className={cn(
                        'rounded-md border py-2 text-sm transition-colors',
                        !h.livre &&
                          'bg-muted/50 text-muted-foreground/60 line-through cursor-not-allowed',
                        h.livre && !sel && 'bg-background hover:bg-muted',
                        sel &&
                          'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary'
                      )}
                    >
                      {h.hora}
                      {mesmo && h.livre && (
                        <span className="block text-xs font-normal leading-tight">
                          mesmo horário
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {erro && <p className="text-sm text-destructive">{erro}</p>}

          <Button
            type="button"
            className="w-full h-11 text-base"
            disabled={!diaSel || !horaSel || salvando}
            onClick={marcar}
          >
            {salvando ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Marcando…
              </>
            ) : !diaSel ? (
              'Escolha o dia'
            ) : !horaSel ? (
              'Escolha o horário'
            ) : (
              `Marcar ${rotuloDiaCompleto(diaSel)} às ${horaSel}`
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

AgendaExpressa.displayName = 'AgendaExpressa';
