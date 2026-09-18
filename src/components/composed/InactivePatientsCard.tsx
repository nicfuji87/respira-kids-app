// AI dev note: InactivePatientsCard - Lista de REATIVAÇÃO da secretária (v2, set/2026)
// Fonte: RPC fn_reativacao_lista (60–540 dias sem sessão realizada, nada agendado).
// Ordem: prioridade (1 alta → 3 baixa) e, dentro dela, quem parou há menos tempo
// (volta mais). No topo, o progresso das metas do mês da própria secretária.
// Perfil só muda a mensagem; para a meta qualquer serviço conta.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Skeleton } from '@/components/primitives/skeleton';
import { Input } from '@/components/primitives/input';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { Progress } from '@/components/primitives/progress';
import {
  Users,
  AlertTriangle,
  Wind,
  Activity,
  RefreshCw,
  Search,
  Ban,
  MessageCircle,
  Clock,
  Flame,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchReativacaoLista } from '@/lib/inatividade-api';
import { fetchMetasDashboard } from '@/lib/metas-api';
import { useAuth } from '@/hooks/useAuth';
import type {
  PerfilReativacao,
  ReativacaoPaciente,
  ResultadoContato,
} from '@/types/inatividade';
import type { MetaDashboard } from '@/types/metas';

export interface InactivePatientsCardProps {
  className?: string;
  maxItems?: number;
  onPatientClick?: (patient: ReativacaoPaciente) => void;
  onContactPatient?: (patient: ReativacaoPaciente) => void;
  onManagePatient?: (patient: ReativacaoPaciente) => void;
}

type Filtro =
  | 'prioridade'
  | 'todos'
  | 'motora'
  | 'antigos'
  | 'contatados'
  | 'bloqueados';

const FILTROS: Array<{
  key: Filtro;
  label: string;
  hint: string;
  match: (p: ReativacaoPaciente) => boolean;
}> = [
  {
    key: 'prioridade',
    label: 'Prioridade alta',
    hint: 'Bebês que já fizeram respiratória e, de fevereiro a abril, altas da motora',
    match: (p) => p.conta_para_meta && p.prioridade === 1,
  },
  {
    key: 'todos',
    label: 'Todos para contatar',
    hint: 'Todos que contam para a meta agora',
    match: (p) => p.conta_para_meta,
  },
  {
    key: 'motora',
    label: 'Alta da motora',
    hint: 'Só fizeram motora: perguntar do desenvolvimento, sem oferecer motora de novo',
    match: (p) => p.conta_para_meta && p.perfil === 'motora_alta',
  },
  {
    key: 'antigos',
    label: 'Mais de 1 ano',
    hint: 'Voltam menos; deixar para quando a fila principal acabar',
    match: (p) => p.conta_para_meta && p.faixa === '365-540',
  },
  {
    key: 'contatados',
    label: 'Já contatados',
    hint: 'Contato nos últimos 90 dias: um novo contato não conta para a meta',
    match: (p) => p.em_carencia && !p.nao_contatar,
  },
  {
    key: 'bloqueados',
    label: 'Não contatar',
    hint: 'Famílias que pediram para não receber contato',
    match: (p) => p.nao_contatar,
  },
];

const PERFIL_INFO: Record<
  PerfilReativacao,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  respiratorio: { label: 'Respiratória', icon: Wind },
  motora_alta: { label: 'Alta da motora', icon: Activity },
  motora_e_respiratoria: { label: 'Motora + respiratória', icon: Activity },
};

const RESULTADO_LABEL: Record<ResultadoContato, string> = {
  marcou_consulta: 'marcou consulta',
  tudo_bem: 'está tudo bem',
  retornar_depois: 'pediu retorno depois',
  nao_respondeu: 'não respondeu',
  sem_interesse: 'sem interesse',
  nao_contatar: 'pediu para não contatar',
};

const formatDateBR = (date: string | null): string => {
  if (!date) return '—';
  const [y, m, d] = date.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

const formatPhone = (phone: string | null): string => {
  if (!phone) return 'sem telefone';
  const s = phone.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (s.length === 11) return s.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (s.length === 10) return s.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return s;
};

const formatIdade = (meses: number | null): string | null => {
  if (meses == null) return null;
  if (meses < 24) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  return `${Math.floor(meses / 12)} anos`;
};

export const InactivePatientsCard: React.FC<InactivePatientsCardProps> = ({
  className,
  maxItems = 25,
  onPatientClick,
  onContactPatient,
  onManagePatient,
}) => {
  const { user } = useAuth();
  const pessoaId = user?.pessoa?.id;
  const [lista, setLista] = useState<ReativacaoPaciente[]>([]);
  const [metas, setMetas] = useState<MetaDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('prioridade');
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hoje = new Date();
      const [l, m] = await Promise.all([
        fetchReativacaoLista(),
        fetchMetasDashboard({
          mes: hoje.getMonth() + 1,
          ano: hoje.getFullYear(),
        }),
      ]);
      setLista(l);
      setMetas(
        m.filter(
          (x) =>
            x.categoria === 'reativacao' &&
            x.status === 'ativa' &&
            (!pessoaId ||
              x.pessoa_id === pessoaId ||
              x.pessoa_role === 'secretaria')
        )
      );
    } catch (err) {
      console.error('Erro ao carregar lista de reativação:', err);
      setError(
        err instanceof Error
          ? `Não foi possível carregar a lista: ${err.message}`
          : 'Não foi possível carregar a lista de reativação'
      );
    } finally {
      setLoading(false);
    }
  }, [pessoaId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const contagens = useMemo(() => {
    const c = {} as Record<Filtro, number>;
    for (const f of FILTROS) c[f.key] = lista.filter(f.match).length;
    return c;
  }, [lista]);

  const filtrados = useMemo(() => {
    const f = FILTROS.find((x) => x.key === filtro)!;
    const termo = search.trim().toLowerCase();
    return lista
      .filter(f.match)
      .filter(
        (p) =>
          !termo ||
          p.nome.toLowerCase().includes(termo) ||
          (p.responsavel_nome || '').toLowerCase().includes(termo)
      )
      .sort(
        (a, b) =>
          a.prioridade - b.prioridade || a.dias_sem_sessao - b.dias_sem_sessao
      );
  }, [lista, filtro, search]);

  const visiveis = filtrados.slice(0, maxItems);
  const filtroAtual = FILTROS.find((x) => x.key === filtro)!;

  return (
    <Card className={cn('border-rosa-suave/40', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-rosa-suave" />
            Reativação de pacientes
            {contagens.todos > 0 && (
              <Badge variant="secondary" className="ml-1">
                {contagens.todos} para contatar
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadData()}
            disabled={loading}
            className="gap-1 text-xs"
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            Atualizar
          </Button>
        </div>

        {metas.length > 0 && <ProgressoMetas metas={metas} />}

        <div className="flex flex-wrap gap-1.5 mt-3">
          {FILTROS.map((f) => (
            <Button
              key={f.key}
              variant={filtro === f.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFiltro(f.key)}
              className="h-7 text-xs gap-1.5"
              title={f.hint}
            >
              {f.key === 'prioridade' && <Flame className="h-3 w-3" />}
              {f.key === 'motora' && <Activity className="h-3 w-3" />}
              {f.label}
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                {contagens[f.key] ?? 0}
              </Badge>
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          {filtroAtual.hint}
        </p>

        <div className="relative mt-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por paciente ou responsável..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {error && (
          <Alert variant="destructive" className="mb-3">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : visiveis.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Ninguém nessa lista agora.
          </div>
        ) : (
          <div className="space-y-2">
            {visiveis.map((p) => {
              const perfil = PERFIL_INFO[p.perfil];
              const PerfilIcon = perfil.icon;
              const idade = formatIdade(p.idade_meses);
              return (
                <div
                  key={p.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-md border hover:bg-muted/40 cursor-pointer transition-colors"
                  onClick={() => onPatientClick?.(p)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{p.nome}</span>
                      {p.prioridade === 1 && (
                        <Badge className="text-[10px] gap-1 bg-rosa-suave hover:bg-rosa-suave">
                          <Flame className="h-3 w-3" />
                          Prioridade
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <PerfilIcon className="h-3 w-3" />
                        {perfil.label}
                      </Badge>
                      {idade && (
                        <span className="text-xs text-muted-foreground">
                          {idade}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Última sessão: {formatDateBR(p.data_ultima_sessao)} (
                        {p.dias_sem_sessao} dias)
                      </span>
                      {p.responsavel_nome && (
                        <span>Resp: {p.responsavel_nome}</span>
                      )}
                      <span
                        className={cn(
                          !p.responsavel_telefone && 'text-destructive'
                        )}
                      >
                        {formatPhone(p.responsavel_telefone)}
                      </span>
                    </div>
                    {p.ultimo_contato_em && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Último contato em {formatDateBR(p.ultimo_contato_em)}
                        {p.ultimo_resultado &&
                          `: ${RESULTADO_LABEL[p.ultimo_resultado] ?? p.ultimo_resultado}`}
                        {p.proximo_contato &&
                          ` · retornar em ${formatDateBR(p.proximo_contato)}`}
                      </div>
                    )}
                  </div>

                  <div
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {onContactPatient && (
                      <Button
                        variant={p.conta_para_meta ? 'default' : 'outline'}
                        size="sm"
                        className="gap-1 h-7"
                        onClick={() => onContactPatient(p)}
                      >
                        <MessageCircle className="h-3 w-3" />
                        Contatar
                      </Button>
                    )}
                    {onManagePatient && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 h-7"
                        onClick={() => onManagePatient(p)}
                        title="Histórico e não contatar"
                      >
                        <Ban className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && filtrados.length > maxItems && (
          <div className="text-center text-xs text-muted-foreground mt-3">
            Mostrando {maxItems} de {filtrados.length}. Conforme você registra
            os contatos, os próximos aparecem.
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// AI dev note: faixa de progresso das metas de reativação do mês. O bônus só
// vale se a meta de contatos (requisito) estiver batida.
const ProgressoMetas: React.FC<{ metas: MetaDashboard[] }> = ({ metas }) => {
  const contatos = metas.find(
    (m) => m.tipo_meta_codigo === 'contatos_inatividade'
  );
  const reativ = metas.find(
    (m) => m.tipo_meta_codigo === 'pacientes_reativados'
  );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 rounded-md bg-muted/40 p-3">
      {contatos && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="font-medium">Contatos no mês</span>
            <span>
              {Number(contatos.valor_atual)} / {Number(contatos.valor_meta)}
            </span>
          </div>
          <Progress
            value={Math.min(100, Number(contatos.percentual_atingido) || 0)}
            className="h-2"
          />
        </div>
      )}
      {reativ && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="font-medium">Pacientes reativados</span>
            <span>
              {Number(reativ.valor_atual)}
              {reativ.niveis?.length
                ? ` · próximo nível: ${
                    reativ.niveis.find(
                      (n) => n.valor > Number(reativ.valor_atual)
                    )?.valor ?? 'todos batidos'
                  }`
                : ` / ${Number(reativ.valor_meta)}`}
            </span>
          </div>
          <Progress
            value={Math.min(100, Number(reativ.percentual_atingido) || 0)}
            className="h-2"
          />
        </div>
      )}
    </div>
  );
};

InactivePatientsCard.displayName = 'InactivePatientsCard';
