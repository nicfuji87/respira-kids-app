// AI dev note: aba Hoje da central de Conversas. Não é fila genérica: cada item
// nasce de uma regra com motivo visível (família sem resposta, pedido aberto
// pela Ju, cobrança em conferência, follow-up com prova, reclamação recente,
// oportunidade com pontuação). Resolver aqui fecha também na origem: pedido da
// Ju vira RESOLVIDA, follow-up vira concluído/ignorado (fn_conversas_tarefa).
// Cobrança em conferência é resolvida só na tela de Cobranças (só admin).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  Hand,
  HandHelping,
  History,
  Inbox,
  Loader2,
  MessageCircle,
  MessagesSquare,
  RefreshCw,
  Sparkles,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import { Textarea } from '@/components/primitives/textarea';
import { Label } from '@/components/primitives/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import {
  atualizarTarefa,
  chatwootUrl,
  fetchHoje,
  fmtDesde,
  whatsappUrl,
  type Hoje,
  type ItemHoje,
  type Prioridade,
  type Responsavel,
  type ResultadoTarefa,
  type TipoItem,
} from '@/lib/conversas-central-api';
import { Kpi, Vazio } from './central-ui';

const TIPO_ICONE: Record<TipoItem, LucideIcon> = {
  familia_aguardando: Clock,
  pedido_ju: HandHelping,
  cobranca: Banknote,
  followup: MessagesSquare,
  reclamacao: AlertTriangle,
  lead: Flame,
};

const PRIORIDADE: Record<
  Prioridade,
  { label: string; classe: string; ordem: number }
> = {
  alta: {
    label: 'Alta',
    classe: 'bg-vermelho-kids/25 border-vermelho-kids/40',
    ordem: 0,
  },
  media: {
    label: 'Média',
    classe: 'bg-amarelo-pipa/20 border-amarelo-pipa/50',
    ordem: 1,
  },
  baixa: { label: 'Baixa', classe: 'bg-muted border-border', ordem: 2 },
};

const RESPONSAVEIS: Array<'Todos' | Responsavel> = [
  'Todos',
  'Recepção',
  'Financeiro',
  'Fisioterapeutas',
  'Gestão',
];

const RESULTADOS: Record<
  TipoItem,
  Array<{ valor: ResultadoTarefa; label: string; ajuda: string }>
> = {
  familia_aguardando: [
    {
      valor: 'respondeu',
      label: 'Respondi a família',
      ajuda: 'Some da lista até a família escrever de novo.',
    },
    {
      valor: 'nao_se_aplica',
      label: 'Não precisava de resposta',
      ajuda: 'Mensagem de encerramento, aviso ou engano.',
    },
  ],
  pedido_ju: [
    {
      valor: 'resolveu',
      label: 'Pedido resolvido',
      ajuda: 'Fecha o pedido da Ju também no grupo de avisos.',
    },
    {
      valor: 'nao_se_aplica',
      label: 'Não se aplica',
      ajuda: 'Pedido duplicado, engano ou já tratado fora daqui.',
    },
  ],
  followup: [
    {
      valor: 'resolveu',
      label: 'Resolvido',
      ajuda: 'Marca o follow-up da conversa como concluído.',
    },
    {
      valor: 'nao_se_aplica',
      label: 'Não precisa mais',
      ajuda:
        'Marca como ignorado; volta se a família escrever de novo pedindo algo.',
    },
  ],
  reclamacao: [
    {
      valor: 'resolveu',
      label: 'Tratada com a família',
      ajuda: 'Registre o que foi feito na observação.',
    },
    {
      valor: 'nao_se_aplica',
      label: 'Não era reclamação',
      ajuda: 'A análise se enganou.',
    },
  ],
  lead: [
    {
      valor: 'agendou',
      label: 'Agendou',
      ajuda: 'Conta como agendamento recuperado.',
    },
    {
      valor: 'respondeu',
      label: 'Falei com a família, sem resposta ainda',
      ajuda: 'Some até a família responder.',
    },
    {
      valor: 'perdeu',
      label: 'Desistiu ou foi para outro lugar',
      ajuda: 'Sai da lista de oportunidades.',
    },
    {
      valor: 'nao_se_aplica',
      label: 'Não era oportunidade',
      ajuda: 'Contato errado, paciente atual ou teste.',
    },
  ],
  cobranca: [],
};

const URGENCIA_TIPO: Record<TipoItem, number> = {
  familia_aguardando: 0,
  pedido_ju: 1,
  cobranca: 2,
  reclamacao: 3,
  lead: 4,
  followup: 5,
};

export interface HojeTabProps {
  onVerRevisao?: () => void;
}

export const HojeTab: React.FC<HojeTabProps> = ({ onVerRevisao }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [dados, setDados] = useState<Hoje | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'Todos' | Responsavel>('Todos');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [resolver, setResolver] = useState<ItemHoje | null>(null);
  const [resultado, setResultado] = useState<ResultadoTarefa | null>(null);
  const [obs, setObs] = useState('');

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    setErro(null);
    try {
      setDados(await fetchHoje());
    } catch {
      setErro('Não conseguimos carregar as prioridades. Tente de novo.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void carregar(true);
    }, 120000);
    return () => window.clearInterval(t);
  }, [carregar]);

  const itens = useMemo(() => {
    const lista = (dados?.itens ?? []).filter(
      (i) => filtro === 'Todos' || i.responsavel === filtro
    );
    return [...lista].sort((a, b) => {
      const p = PRIORIDADE[a.prioridade].ordem - PRIORIDADE[b.prioridade].ordem;
      if (p !== 0) return p;
      // Mesma prioridade: o que é de agora antes do que é antigo.
      const t = URGENCIA_TIPO[a.tipo] - URGENCIA_TIPO[b.tipo];
      if (t !== 0) return t;
      if (a.tipo === 'lead' && b.tipo === 'lead')
        return (b.pontos ?? 0) - (a.pontos ?? 0);
      return new Date(a.desde).getTime() - new Date(b.desde).getTime();
    });
  }, [dados, filtro]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = { Todos: dados?.itens.length ?? 0 };
    for (const i of dados?.itens ?? [])
      c[i.responsavel] = (c[i.responsavel] ?? 0) + 1;
    return c;
  }, [dados]);

  const assumir = async (item: ItemHoje, soltar = false) => {
    setOcupado(item.ref);
    try {
      await atualizarTarefa(item, soltar ? 'soltar' : 'assumir');
      await carregar(true);
    } catch {
      toast({ title: 'Não foi possível registrar', variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  const confirmarResolver = async () => {
    if (!resolver || !resultado) return;
    setOcupado(resolver.ref);
    try {
      await atualizarTarefa(resolver, 'resolver', resultado, obs);
      toast({
        title: 'Registrado',
        description: 'O item saiu da lista de hoje.',
      });
      setResolver(null);
      await carregar(true);
    } catch {
      toast({ title: 'Não foi possível registrar', variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  if (carregando && !dados) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (erro || !dados) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">{erro}</p>
          <Button variant="outline" size="sm" onClick={() => void carregar()}>
            Tentar de novo
          </Button>
        </CardContent>
      </Card>
    );
  }

  const k = dados.kpis;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          icon={Clock}
          label="Famílias esperando resposta"
          value={k.familias_aguardando}
          hint={
            k.familias_aguardando_2h > 0
              ? `${k.familias_aguardando_2h} há mais de 2 h de expediente`
              : 'nenhuma há mais de 2 h de expediente'
          }
          destaque={k.familias_aguardando_2h > 0 ? 'atencao' : undefined}
        />
        <Kpi
          icon={HandHelping}
          label="Pedidos da Ju em aberto"
          value={k.pedidos_ju}
          hint="agendamentos, remarcações e outros pedidos registrados pela Ju"
        />
        <Kpi
          icon={Banknote}
          label="Para o Financeiro"
          value={k.financeiro}
          hint={
            k.cobrancas_conferencia > 0
              ? `${k.cobrancas_conferencia} cobrança(s) em conferência`
              : 'notas, pagamentos e cobranças a conferir'
          }
        />
        <Kpi
          icon={Flame}
          label="Oportunidades para retomar"
          value={k.oportunidades}
          hint={`as mais fortes de ${k.oportunidades_todas} interessados que não agendaram em 60 dias`}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Filtrar por responsável"
        >
          {RESPONSAVEIS.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={filtro === r ? 'default' : 'outline'}
              onClick={() => setFiltro(r)}
              className="gap-1.5"
            >
              {r}
              <span className="text-xs opacity-80 tabular-nums">
                {contagem[r] ?? 0}
              </span>
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void carregar()}
          className="gap-1.5 text-muted-foreground"
        >
          <RefreshCw className={cn('h-4 w-4', carregando && 'animate-spin')} />
          Atualizado {fmtDesde(k.gerado_em)}
        </Button>
      </div>

      {itens.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <CheckCircle2 className="h-8 w-8 mx-auto text-verde-pipa" />
            <Vazio texto="Nada pendente para este filtro agora." />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {itens.map((item) => (
            <ItemCard
              key={item.ref}
              item={item}
              ocupado={ocupado === item.ref}
              onAssumir={() => void assumir(item)}
              onSoltar={() => void assumir(item, true)}
              onResolver={() => {
                setResultado(RESULTADOS[item.tipo][0]?.valor ?? null);
                setObs('');
                setResolver(item);
              }}
              onAbrirInterno={(href) => navigate(href)}
            />
          ))}
        </div>
      )}

      {k.em_revisao > 0 && (
        <Card className="bg-muted/40">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <History
                className="h-5 w-5 text-azul-respira mt-0.5"
                aria-hidden
              />
              <div>
                <p className="text-sm font-medium">
                  {k.em_revisao} conversas antigas para revisar
                </p>
                <p className="text-xs text-muted-foreground">
                  Follow-ups com mais de 14 dias que o sistema não conseguiu
                  confirmar se foram resolvidos. Não entram nas prioridades de
                  hoje.
                </p>
              </div>
            </div>
            {onVerRevisao && (
              <Button size="sm" variant="outline" onClick={onVerRevisao}>
                Revisar em lote
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!resolver} onOpenChange={(o) => !o && setResolver(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Como ficou?</DialogTitle>
            <DialogDescription>
              {resolver?.nome} · {resolver?.titulo}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {resolver &&
              RESULTADOS[resolver.tipo].map((r) => (
                <button
                  key={r.valor}
                  type="button"
                  onClick={() => setResultado(r.valor)}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition-colors',
                    resultado === r.valor
                      ? 'border-azul-respira bg-azul-respira/10'
                      : 'hover:bg-muted/50'
                  )}
                >
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="text-xs text-muted-foreground">{r.ajuda}</p>
                </button>
              ))}
            <div className="space-y-1.5 pt-1">
              <Label htmlFor="obs-hoje">Observação (opcional)</Label>
              <Textarea
                id="obs-hoje"
                rows={2}
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="O que foi combinado com a família"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolver(null)}>
              Voltar
            </Button>
            <Button
              onClick={() => void confirmarResolver()}
              disabled={!resultado || ocupado === resolver?.ref}
            >
              {ocupado === resolver?.ref && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function ItemCard({
  item,
  ocupado,
  onAssumir,
  onSoltar,
  onResolver,
  onAbrirInterno,
}: {
  item: ItemHoje;
  ocupado: boolean;
  onAssumir: () => void;
  onSoltar: () => void;
  onResolver: () => void;
  onAbrirInterno: (href: string) => void;
}) {
  const Icone = TIPO_ICONE[item.tipo];
  const pr = PRIORIDADE[item.prioridade];
  const wa = whatsappUrl(item.telefone);
  const cw = chatwootUrl(item.chatwoot_id);
  const assumido = item.tarefa?.status === 'assumida';

  return (
    <Card className={cn(assumido && 'bg-azul-respira/5')}>
      <CardContent className="p-4 space-y-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <div className={cn('mt-0.5 rounded-lg border p-2', pr.classe)}>
              <Icone className="h-4 w-4 text-roxo-titulo" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="font-semibold leading-snug">{item.titulo}</p>
              <p className="text-sm text-muted-foreground">
                <UserRound
                  className="inline h-3.5 w-3.5 mr-1 -mt-0.5"
                  aria-hidden
                />
                {item.nome} · {fmtDesde(item.desde)}
                {item.fora_expediente ? ' · chegou fora do expediente' : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className={cn('text-xs', pr.classe)}>
              {pr.label}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {item.responsavel}
            </Badge>
          </div>
        </div>

        {item.descricao && (
          <p className="text-sm text-foreground/90 line-clamp-2">
            “{item.descricao}”
          </p>
        )}
        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden />
          {item.evidencia}
        </p>

        {assumido && (
          <p className="text-xs text-azul-respira font-medium">
            <Hand className="inline h-3.5 w-3.5 mr-1 -mt-0.5" aria-hidden />
            Com {item.tarefa?.por?.split(' ')[0] ??
              'alguém da equipe'} desde{' '}
            {new Date(item.tarefa!.em).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'America/Sao_Paulo',
            })}
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-0.5">
          {wa && (
            <Button size="sm" variant="outline" className="gap-1.5" asChild>
              <a href={wa} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            </Button>
          )}
          {cw && (
            <Button size="sm" variant="outline" className="gap-1.5" asChild>
              <a href={cw} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                Chatwoot
              </a>
            </Button>
          )}
          {item.link_interno && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => onAbrirInterno(item.link_interno as string)}
            >
              <Inbox className="h-4 w-4" />
              Abrir Cobranças
            </Button>
          )}
          {item.tipo !== 'cobranca' && (
            <>
              {assumido ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onSoltar}
                  disabled={ocupado}
                >
                  Soltar
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onAssumir}
                  disabled={ocupado}
                  className="gap-1.5"
                >
                  <Hand className="h-4 w-4" />
                  Assumir
                </Button>
              )}
              <Button
                size="sm"
                onClick={onResolver}
                disabled={ocupado}
                className="gap-1.5"
              >
                {ocupado ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Resolver
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
