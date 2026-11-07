// AI dev note: aba Conferência da central de Conversas. Confere a agenda do mês para a
// cobrança sair certa, juntando duas fontes que o banco cruza todo dia:
//   - checagens da própria agenda (status de consulta x pagamento, duplicada, horário
//     01:00/22:30, consulta apagada), sem IA;
//   - sessões que a IA (gpt-6-luna, n8n "RK Conferência de agenda", 5h30) leu nas
//     conversas do WhatsApp, comparadas com a agenda no banco.
// Item que deixa de valer (ex.: a consulta foi lançada) fecha sozinho na rodada seguinte.
// Grupos na ordem em que a cobrança precisa: corrigir → lançar → decidir → conferir →
// só horário (não muda o valor, fica recolhido).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  ExternalLink,
  EyeOff,
  Gavel,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  UserRound,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import {
  fetchConferencia,
  lancarItemConferencia,
  marcarItemConferencia,
  rodarConferencia,
  TIPO_LABEL,
  TIPOS_LANCAVEIS,
  type Conferencia,
  type GrupoConferencia,
  type ItemConferencia,
} from '@/lib/conferencia-agenda-api';
import { chatwootUrl } from '@/lib/conversas-central-api';
import { Kpi, Vazio } from './central-ui';

const GRUPOS: Array<{
  valor: GrupoConferencia;
  titulo: string;
  ajuda: string;
  icon: LucideIcon;
}> = [
  {
    valor: 'corrigir',
    titulo: 'Corrigir antes de cobrar',
    ajuda: 'Do jeito que está, a cobrança sai errada (a mais ou a menos).',
    icon: Wrench,
  },
  {
    valor: 'lancar',
    titulo: 'Lançar ou acertar',
    ajuda: 'A sessão aconteceu ou foi combinada e hoje não seria cobrada.',
    icon: CalendarPlus,
  },
  {
    valor: 'decidir',
    titulo: 'Decidir',
    ajuda:
      'Faltas e desmarcações com menos de 6h que ficaram sem cobrança. Contrato: falta integral, menos de 6h 50%.',
    icon: Gavel,
  },
  {
    valor: 'conferir',
    titulo: 'Conferir com a equipe',
    ajuda: 'A conversa e a agenda não fecham; só quem atendeu sabe.',
    icon: Search,
  },
  {
    valor: 'horario',
    titulo: 'Só horário',
    ajuda: 'Mesmo dia, horário diferente do combinado. Não muda o valor.',
    icon: Clock,
  },
];

type Filtro = 'abertos' | 'tratados';

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
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

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function primeiroDoMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Mês padrão: até o dia 10 a cobrança ainda é do mês anterior. */
function mesPadrao(): string {
  const hoje = new Date();
  const ref =
    hoje.getDate() <= 10
      ? new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
      : hoje;
  return primeiroDoMes(ref);
}

function somarMes(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  return primeiroDoMes(new Date(a, m - 1 + n, 1));
}

function rotuloMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} de ${a}`;
}

function rotuloData(data: string, hora: string | null): string {
  const [a, m, d] = data.split('-').map(Number);
  const dia = DIAS[new Date(a, m - 1, d).getDay()];
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')} ${dia}${
    hora ? ` · ${hora.slice(0, 5)}` : ''
  }`;
}

function rotuloQuando(iso: string | null): string {
  if (!iso) return 'ainda não rodou';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const tratado = (i: ItemConferencia) =>
  i.status === 'resolvido' ||
  i.status === 'ignorado' ||
  i.status === 'fechado_auto';

export function ConferenciaTab() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [mes, setMes] = useState<string>(mesPadrao);
  const [dados, setDados] = useState<Conferencia | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('abertos');
  const [grupoFoco, setGrupoFoco] = useState<GrupoConferencia | null>(null);
  const [ocupado, setOcupado] = useState<number | 'rodar' | null>(null);
  const [horarioAberto, setHorarioAberto] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setDados(await fetchConferencia(mes));
    } catch (e) {
      console.error(e);
      setErro('Não foi possível carregar a conferência.');
    } finally {
      setCarregando(false);
    }
  }, [mes]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const itens = useMemo(() => dados?.itens ?? [], [dados]);
  const abertos = useMemo(() => itens.filter((i) => !tratado(i)), [itens]);

  const resumo = useMemo(() => {
    const por = (g: GrupoConferencia) => abertos.filter((i) => i.grupo === g);
    const lancar = por('lancar');
    return {
      corrigir: por('corrigir').length,
      lancar: lancar.length,
      lancarValor: lancar.reduce((s, i) => s + (Number(i.valor) || 0), 0),
      decidir: por('decidir').length,
      conferir: por('conferir').length,
      horario: por('horario').length,
    };
  }, [abertos]);

  const visiveis = useMemo(
    () =>
      itens.filter((i) => (filtro === 'abertos' ? !tratado(i) : tratado(i))),
    [itens, filtro]
  );

  const marcar = async (
    item: ItemConferencia,
    status: 'aberto' | 'resolvido' | 'ignorado'
  ) => {
    setOcupado(item.id);
    try {
      await marcarItemConferencia(item.id, status);
      setDados((d) =>
        d
          ? {
              ...d,
              itens: d.itens.map((x) =>
                x.id === item.id
                  ? {
                      ...x,
                      status,
                      resolvido_em:
                        status === 'aberto' ? null : new Date().toISOString(),
                    }
                  : x
              ),
            }
          : d
      );
    } catch (e) {
      console.error(e);
      toast({ title: 'Não foi possível atualizar', variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  const lancar = async (item: ItemConferencia) => {
    setOcupado(item.id);
    try {
      const id = await lancarItemConferencia(item.id);
      navigate(`/agenda/lancar/${id}`);
    } catch (e) {
      console.error(e);
      toast({
        title: 'Não foi possível abrir o lançamento',
        variant: 'destructive',
      });
      setOcupado(null);
    }
  };

  const rodar = async () => {
    setOcupado('rodar');
    try {
      await rodarConferencia();
      await carregar();
      toast({ title: 'Conferência atualizada com a agenda de agora' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Não foi possível atualizar', variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Mês anterior"
            onClick={() => setMes((m) => somarMes(m, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[10rem] text-center text-sm font-semibold capitalize">
            {rotuloMes(mes)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Próximo mês"
            onClick={() => setMes((m) => somarMes(m, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>
            Conversas lidas até{' '}
            {rotuloQuando(dados?.ultima_leitura_conversas ?? null)}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={ocupado === 'rodar'}
            onClick={() => void rodar()}
            title="Refaz a comparação com a agenda de agora (não lê conversas de novo)"
          >
            {ocupado === 'rodar' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Atualizar
          </Button>
        </div>
      </div>

      {erro && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm flex-1">{erro}</p>
            <Button variant="ghost" size="sm" onClick={() => void carregar()}>
              Tentar de novo
            </Button>
          </CardContent>
        </Card>
      )}

      {carregando && !dados ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi
            icon={Wrench}
            label="Corrigir antes de cobrar"
            value={resumo.corrigir}
            hint="Cobrança sairia errada"
            destaque={resumo.corrigir > 0 ? 'atencao' : 'ok'}
            onClick={() => setGrupoFoco('corrigir')}
          />
          <Kpi
            icon={CalendarPlus}
            label="Lançar ou acertar"
            value={resumo.lancar}
            hint={
              resumo.lancarValor > 0
                ? `cerca de ${brl(resumo.lancarValor)} sem cobrar`
                : 'Sessões fora da cobrança'
            }
            destaque={resumo.lancar > 0 ? 'atencao' : 'ok'}
            onClick={() => setGrupoFoco('lancar')}
          />
          <Kpi
            icon={Gavel}
            label="Decidir"
            value={resumo.decidir}
            hint="Falta ou desmarcação < 6h"
            onClick={() => setGrupoFoco('decidir')}
          />
          <Kpi
            icon={Search}
            label="Conferir com a equipe"
            value={resumo.conferir}
            hint={`${resumo.horario} só de horário`}
            onClick={() => setGrupoFoco('conferir')}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ['abertos', `Em aberto (${abertos.length})`],
            ['tratados', `Tratados (${itens.length - abertos.length})`],
          ] as Array<[Filtro, string]>
        ).map(([v, label]) => (
          <Button
            key={v}
            size="sm"
            variant={filtro === v ? 'default' : 'outline'}
            onClick={() => setFiltro(v)}
          >
            {label}
          </Button>
        ))}
        {grupoFoco && (
          <Button size="sm" variant="ghost" onClick={() => setGrupoFoco(null)}>
            Mostrar todos os grupos
          </Button>
        )}
      </div>

      {dados && visiveis.length === 0 && (
        <Card>
          <CardContent className="p-0">
            <Vazio
              texto={
                filtro === 'abertos'
                  ? 'Nada em aberto neste mês. A agenda bate com as conversas.'
                  : 'Nenhum item tratado neste mês.'
              }
            />
          </CardContent>
        </Card>
      )}

      {GRUPOS.filter((g) => !grupoFoco || g.valor === grupoFoco).map((g) => {
        const lista = visiveis.filter((i) => i.grupo === g.valor);
        if (!lista.length) return null;
        const recolhido = g.valor === 'horario' && !horarioAberto;
        return (
          <section key={g.valor} className="space-y-2">
            <button
              type="button"
              className="flex w-full items-start gap-2 text-left"
              onClick={() =>
                g.valor === 'horario' && setHorarioAberto((v) => !v)
              }
            >
              <g.icon
                className="h-4 w-4 mt-0.5 text-azul-respira"
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="text-sm font-semibold">
                  {g.titulo}{' '}
                  <span className="text-muted-foreground font-normal">
                    ({lista.length})
                  </span>
                </span>
                <span className="block text-xs text-muted-foreground">
                  {g.ajuda}
                </span>
              </span>
              {g.valor === 'horario' && (
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    horarioAberto && 'rotate-180'
                  )}
                  aria-hidden
                />
              )}
            </button>
            {!recolhido && (
              <div className="space-y-2">
                {lista.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    ocupado={ocupado === item.id}
                    onMarcar={(s) => void marcar(item, s)}
                    onLancar={() => void lancar(item)}
                    onPaciente={
                      item.paciente_id
                        ? () => navigate(`/pacientes/${item.paciente_id}`)
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {dados && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
          {dados.conversas_lidas_mes} conversas e {dados.sessoes_lidas_mes}{' '}
          sessões lidas pela IA neste mês. As conversas são lidas todo dia às
          5h30; a agenda é conferida de novo às 6h40 e quando você clica em
          Atualizar.
        </p>
      )}
    </div>
  );
}

function ItemCard({
  item,
  ocupado,
  onMarcar,
  onLancar,
  onPaciente,
}: {
  item: ItemConferencia;
  ocupado: boolean;
  onMarcar: (s: 'aberto' | 'resolvido' | 'ignorado') => void;
  onLancar: () => void;
  onPaciente?: () => void;
}) {
  const url = chatwootUrl(
    item.chatwoot_conversa_id ? String(item.chatwoot_conversa_id) : null
  );
  const feito = tratado(item);
  const origem =
    item.origem === 'sistema'
      ? 'Agenda'
      : item.origem === 'conversa'
        ? 'Conversa'
        : 'Conferência manual';
  return (
    <Card className={cn(feito && 'opacity-70')}>
      <CardContent className="p-4 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug">
              {item.paciente_nome || 'Paciente não identificado'}
            </p>
            <p className="text-xs text-muted-foreground">
              {rotuloData(item.data, item.hora)}
              {item.profissional && item.profissional !== '-'
                ? ` · ${item.profissional}`
                : ''}
              {item.valor ? ` · ${brl(Number(item.valor))}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline">
              {TIPO_LABEL[item.tipo] ?? item.tipo}
            </Badge>
            <Badge variant="secondary">{origem}</Badge>
          </div>
        </div>

        {item.detalhe && <p className="text-sm">{item.detalhe}</p>}
        {item.evidencia && (
          <p className="text-xs text-muted-foreground border-l-2 border-border pl-2 italic">
            “{item.evidencia}”
          </p>
        )}
        {(item.agendamento_status || item.agendamento_pagamento) && (
          <p className="text-xs text-muted-foreground">
            Hoje no sistema: consulta {item.agendamento_status ?? '—'},
            pagamento {item.agendamento_pagamento ?? '—'}
          </p>
        )}
        {feito && (
          <p className="text-xs text-muted-foreground">
            {item.status === 'fechado_auto'
              ? 'Fechou sozinho: a agenda passou a bater.'
              : `${item.status === 'resolvido' ? 'Resolvido' : 'Ignorado'}${
                  item.resolvido_por_nome
                    ? ` por ${item.resolvido_por_nome}`
                    : ''
                }${item.resolvido_em ? ` em ${rotuloQuando(item.resolvido_em)}` : ''}.`}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5 pt-1">
          {!feito && TIPOS_LANCAVEIS.has(item.tipo) && (
            <Button
              size="sm"
              className="gap-1.5"
              disabled={ocupado}
              onClick={onLancar}
            >
              <CalendarPlus className="h-4 w-4" />
              Lançar
            </Button>
          )}
          {url && (
            <Button size="sm" variant="outline" className="gap-1.5" asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Conversa
              </a>
            </Button>
          )}
          {onPaciente && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={onPaciente}
            >
              <UserRound className="h-4 w-4" />
              Paciente
            </Button>
          )}
          {!feito ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5"
                disabled={ocupado}
                onClick={() => onMarcar('resolvido')}
              >
                {ocupado ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Resolvido
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-muted-foreground"
                disabled={ocupado}
                onClick={() => onMarcar('ignorado')}
                title="Não era problema (a leitura errou ou já estava certo)"
              >
                <EyeOff className="h-4 w-4" />
                Ignorar
              </Button>
            </>
          ) : (
            item.status !== 'fechado_auto' && (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5"
                disabled={ocupado}
                onClick={() => onMarcar('aberto')}
              >
                <RotateCcw className="h-4 w-4" />
                Reabrir
              </Button>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
