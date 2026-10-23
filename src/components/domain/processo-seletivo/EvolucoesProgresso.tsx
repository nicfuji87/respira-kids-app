// AI dev note: Progresso das evoluções no celular da estagiária (#/ponto).
// Calendário do mês (por dia: agendamentos x evoluções, concluído ou quanto
// falta) + lista do que falta evoluir com o tempo até vencer + bônus do mês.
// Dados de fn_estagio_celular_evolucoes; prazo = 24h, sábado/domingo vencem
// segunda 23h59 (fn_evolucao_prazo). A meta é da dupla: mostra a clínica toda.
// Horários vêm em hora de parede sem fuso; a contagem regressiva usa a hora do
// servidor como referência (diferença entre dois horários do mesmo relógio).

import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileWarning,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  DiaEvolucoes,
  EvolucoesCelular,
  SessaoPendente,
} from '@/lib/estagio-celular-api';
import { REUNIOES } from '@/lib/estagio-reunioes';

const SEMANA = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const DIA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** "2026-10-24T10:00:00" → Date no relógio local (sem conversão de fuso). */
function parede(s: string): Date {
  const [d, t = '00:00:00'] = s.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm, ss] = t.split(':').map((x) => parseInt(x, 10) || 0);
  return new Date(y, m - 1, day, hh, mm, ss);
}

function dataCurta(s: string): string {
  const d = parede(s);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function horaCurta(s: string): string {
  const d = parede(s);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function quandoVence(s: string): string {
  const d = parede(s);
  return `${DIA_SEMANA[d.getDay()]} ${dataCurta(s)} às ${horaCurta(s)}`;
}

function tempoRestante(ms: number): string {
  if (ms <= 0) return 'venceu';
  const totalMin = Math.floor(ms / 60000);
  const dias = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (dias > 0) return `${dias}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  return `${m}min`;
}

function fimDeSemana(s: SessaoPendente): boolean {
  const dow = parede(s.inicio).getDay();
  return dow === 0 || dow === 6;
}

type EstadoDia = 'futuro' | 'vazio' | 'perdida' | 'falta' | 'andamento' | 'ok';

function estadoDia(d: DiaEvolucoes | undefined, data: string, hoje: string) {
  if (data > hoje) return 'futuro' as EstadoDia;
  if (!d || d.sessoes === 0) return 'vazio' as EstadoDia;
  if (d.perdidas > 0) return 'perdida' as EstadoDia;
  if (d.faltam > 0) return 'falta' as EstadoDia;
  if (d.realizadas < d.sessoes) return 'andamento' as EstadoDia;
  return 'ok' as EstadoDia;
}

const COR_DIA: Record<EstadoDia, string> = {
  futuro: 'bg-card text-muted-foreground',
  vazio: 'bg-transparent text-muted-foreground/60',
  perdida: 'bg-vermelho-kids/15 text-foreground',
  falta: 'bg-amarelo-pipa/30 text-foreground',
  andamento: 'bg-azul-respira/10 text-foreground',
  ok: 'bg-verde-pipa/30 text-foreground',
};

interface Props {
  dados: EvolucoesCelular;
  /** Date.now() no momento em que os dados chegaram (para o relógio andar). */
  recebidoEm: number;
}

export const EvolucoesProgresso: React.FC<Props> = ({ dados, recebidoEm }) => {
  const [agoraLocal, setAgoraLocal] = useState(() => Date.now());
  const [selecionado, setSelecionado] = useState(dados.hoje);
  const [verVencidas, setVerVencidas] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setAgoraLocal(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Hora do servidor "andando" desde o recebimento.
  const agoraServidor = useMemo(
    () => parede(dados.agora).getTime() + (agoraLocal - recebidoEm),
    [dados.agora, agoraLocal, recebidoEm]
  );

  const porData = useMemo(() => {
    const m = new Map<string, DiaEvolucoes>();
    dados.dias.forEach((d) => m.set(d.data, d));
    return m;
  }, [dados.dias]);

  const [ano, mes] = dados.mes.split('-').map(Number);
  const celulas = useMemo(() => {
    const primeiro = new Date(ano, mes - 1, 1);
    const offset = (primeiro.getDay() + 6) % 7; // segunda = 0
    const total = new Date(ano, mes, 0).getDate();
    const out: (string | null)[] = Array(offset).fill(null);
    for (let i = 1; i <= total; i++) {
      out.push(
        `${ano}-${String(mes).padStart(2, '0')}-${String(i).padStart(2, '0')}`
      );
    }
    return out;
  }, [ano, mes]);

  const bonusInicio = REUNIOES[0]?.bonusInicio;
  const simulacao = bonusInicio ? dados.mes < bonusInicio : false;
  const diaSel = porData.get(selecionado);
  const estadoSel = estadoDia(diaSel, selecionado, dados.hoje);
  const aindaVao = diaSel ? diaSel.sessoes - diaSel.realizadas : 0;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-4">
      {/* Cabeçalho + bônus */}
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">
          Evoluções da clínica · {MESES[mes - 1]}
        </p>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-2xl font-bold text-roxo-titulo">
            R$ {dados.bonus.valor.toFixed(0)}
            <span className="text-sm font-normal text-muted-foreground">
              {' '}
              de R$ {dados.bonus.base.toFixed(0)}
            </span>
          </p>
          <p className="text-xs text-muted-foreground text-right">
            {dados.bonus.perdidas} perdida
            {dados.bonus.perdidas === 1 ? '' : 's'} · −R$ {dados.bonus.desconto}{' '}
            cada
          </p>
        </div>
        {simulacao && bonusInicio && (
          <p className="text-xs text-muted-foreground">
            Simulação: o bônus vale a partir de{' '}
            {MESES[Number(bonusInicio.split('-')[1]) - 1]}.
          </p>
        )}
      </div>

      {/* Calendário */}
      <div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {SEMANA.map((s, i) => (
            <span
              key={i}
              className="text-center text-xs font-medium text-muted-foreground"
            >
              {s}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {celulas.map((data, i) => {
            if (!data) return <span key={`v${i}`} />;
            const d = porData.get(data);
            const est = estadoDia(d, data, dados.hoje);
            const dia = Number(data.slice(8));
            const clicavel = !!d && d.sessoes > 0;
            return (
              <button
                key={data}
                type="button"
                disabled={!clicavel}
                onClick={() => setSelecionado(data)}
                className={cn(
                  'flex flex-col items-center justify-center rounded-lg h-12 leading-tight',
                  COR_DIA[est],
                  data === dados.hoje && 'ring-2 ring-azul-respira',
                  data === selecionado &&
                    data !== dados.hoje &&
                    'ring-2 ring-roxo-titulo/60'
                )}
              >
                <span className="text-xs font-semibold">{dia}</span>
                {d && d.sessoes > 0 && (
                  <span className="text-xs">
                    {est === 'futuro'
                      ? `${d.sessoes}`
                      : est === 'ok'
                        ? '✓'
                        : `${d.evoluidas}/${d.sessoes}`}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-verde-pipa/60" />
            concluído
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-amarelo-pipa/60" />
            falta, no prazo
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-vermelho-kids/40" />
            teve perdida
          </span>
        </div>
      </div>

      {/* Resumo do dia escolhido */}
      {diaSel && diaSel.sessoes > 0 && (
        <div className="rounded-xl bg-muted/50 p-3 text-sm">
          <p className="font-medium text-foreground">
            {DIA_SEMANA[parede(selecionado).getDay()]}, {dataCurta(selecionado)}
            {selecionado === dados.hoje ? ' (hoje)' : ''}
          </p>
          {estadoSel === 'futuro' ? (
            <p className="text-muted-foreground">
              {diaSel.sessoes} agendamento{diaSel.sessoes === 1 ? '' : 's'}
            </p>
          ) : (
            <>
              <p className="text-muted-foreground">
                {diaSel.sessoes} agendamento{diaSel.sessoes === 1 ? '' : 's'} ·{' '}
                {diaSel.evoluidas} evoluç
                {diaSel.evoluidas === 1 ? 'ão' : 'ões'} preenchida
                {diaSel.evoluidas === 1 ? '' : 's'}
              </p>
              <p
                className={cn(
                  'font-medium',
                  diaSel.faltam === 0 && aindaVao === 0
                    ? 'text-verde-pipa'
                    : diaSel.perdidas > 0
                      ? 'text-vermelho-kids'
                      : 'text-roxo-titulo'
                )}
              >
                {diaSel.faltam === 0 && aindaVao === 0
                  ? 'Dia concluído'
                  : diaSel.faltam > 0
                    ? `Falta ${diaSel.faltam}`
                    : 'Nada pendente até agora'}
                {aindaVao > 0 &&
                  ` · ${aindaVao} ainda ${aindaVao === 1 ? 'vai' : 'vão'} acontecer`}
                {diaSel.perdidas > 0 &&
                  ` · ${diaSel.perdidas} ${diaSel.perdidas === 1 ? 'perdeu' : 'perderam'} o prazo`}
              </p>
            </>
          )}
        </div>
      )}

      {/* Falta evoluir, ainda no prazo */}
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Clock className="w-4 h-4 text-amarelo-pipa" />
          Falta evoluir, ainda no prazo ({dados.no_prazo.length})
        </p>
        {dados.no_prazo.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-verde-pipa">
            <CheckCircle2 className="w-4 h-4" />
            Nada pendente no prazo. Tudo em dia!
          </p>
        ) : (
          <ul className="space-y-2">
            {dados.no_prazo.map((s) => {
              const ms = parede(s.prazo).getTime() - agoraServidor;
              const urgente = ms < 3 * 3_600_000;
              const atencao = ms < 8 * 3_600_000;
              return (
                <li
                  key={s.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border/60 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {s.paciente} · {s.grupo}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sessão {dataCurta(s.inicio)} {horaCurta(s.inicio)} com{' '}
                      {s.profissional}
                    </p>
                    {fimDeSemana(s) && (
                      <p className="text-xs text-azul-respira">
                        Fim de semana: vence segunda 23h59
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={cn(
                        'text-sm font-semibold',
                        urgente
                          ? 'text-vermelho-kids'
                          : atencao
                            ? 'text-amarelo-pipa'
                            : 'text-foreground'
                      )}
                    >
                      {tempoRestante(ms)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      até {quandoVence(s.prazo)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Vencidas sem evolução (últimos 7 dias) */}
      {dados.vencidas_total > 0 && (
        <div className="rounded-xl border border-vermelho-kids/30">
          <button
            type="button"
            onClick={() => setVerVencidas((v) => !v)}
            className="w-full flex items-center justify-between gap-2 p-3 text-left"
          >
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <FileWarning className="w-4 h-4 text-vermelho-kids" />
              Prazo vencido, ainda sem evolução ({dados.vencidas_total})
            </span>
            {verVencidas ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          {verVencidas && (
            <div className="border-t border-vermelho-kids/20 p-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Últimos 7 dias. Não salvam mais o bônus, mas o prontuário
                precisa ser feito.
              </p>
              <ul className="space-y-1.5">
                {dados.vencidas.map((s) => (
                  <li key={s.id} className="text-sm">
                    <span className="font-medium text-foreground">
                      {s.paciente}
                    </span>{' '}
                    <span className="text-muted-foreground">
                      · {s.grupo} · {dataCurta(s.inicio)} {horaCurta(s.inicio)}{' '}
                      com {s.profissional}
                    </span>
                  </li>
                ))}
              </ul>
              {dados.vencidas_total > dados.vencidas.length && (
                <p className="text-xs text-muted-foreground">
                  e mais {dados.vencidas_total - dados.vencidas.length}.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

EvolucoesProgresso.displayName = 'EvolucoesProgresso';
