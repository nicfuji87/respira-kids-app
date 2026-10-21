// AI dev note: Inteligência comercial (admin). Painel da atribuição v2: do
// clique no anúncio à receita. Um único recorte (período, canal, campanha,
// serviço) alimenta todas as abas — regras em src/lib/marketing-atribuicao.ts.
// Sem dado suficiente o indicador fica "Indisponível" com o motivo; nunca
// estimar. Dados só para admin (RLS + fn_atrib_pode_ver nas visões).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/primitives/tabs';
import { Button } from '@/components/primitives/button';
import { Card, CardContent } from '@/components/primitives/card';
import { Skeleton } from '@/components/primitives/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { PageHeader } from '@/components/composed/PageHeader';
import {
  CampanhasTab,
  CoortesTab,
  FunilTab,
  JornadasTab,
  QualidadeTab,
  VisaoGeralTab,
} from '@/components/domain/marketing';
import {
  anoMes,
  carregarPainel,
  carregarQualidade,
  dataHora,
  mesesEntre,
  recortar,
  rotuloCanal,
  TRAFEGOS,
  trafegoDe,
  rotuloMes,
  type DadosPainel,
  type Filtros,
  type Qualidade,
} from '@/lib/marketing-atribuicao';

const INICIO = '2026-10'; // o site passou a gerar o código RK em 14/10/2026
type Aba =
  | 'visao'
  | 'funil'
  | 'campanhas'
  | 'jornadas'
  | 'coortes'
  | 'qualidade';

const Filtro: React.FC<{
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  opcoes: [string, string][];
}> = ({ rotulo, valor, onChange, opcoes }) => (
  <label className="flex min-w-[9rem] flex-col gap-1 text-xs text-muted-foreground">
    {rotulo}
    <Select value={valor} onValueChange={onChange}>
      <SelectTrigger
        className="h-9 text-sm text-foreground"
        aria-label={rotulo}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opcoes.map(([v, r]) => (
          <SelectItem key={v} value={v}>
            {r}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </label>
);

export const MarketingPage: React.FC = () => {
  const hoje = anoMes(new Date().toISOString());
  const [dados, setDados] = useState<DadosPainel | null>(null);
  const [qualidade, setQualidade] = useState<Qualidade | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroQ, setErroQ] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<Aba>('visao');
  const [jornada, setJornada] = useState<number | null>(null);
  const [f, setF] = useState<Filtros>({
    mesInicio: INICIO,
    mesFim: hoje,
    canal: 'todos',
    campanha: 'todas',
    servico: 'todos',
  });

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    setErroQ(null);
    try {
      setDados(await carregarPainel());
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setCarregando(false);
    }
    carregarQualidade()
      .then(setQualidade)
      .catch((e: Error) => setErroQ(e.message));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const r = useMemo(() => (dados ? recortar(dados, f) : null), [dados, f]);
  const meses = mesesEntre(INICIO, hoje).map(
    (m) => [m, rotuloMes(m)] as [string, string]
  );
  const canais = useMemo(() => {
    const s = new Set<string>();
    dados?.oportunidades.forEach((o) => s.add(o.canal));
    dados?.aquisicoes.forEach((a) => s.add(a.canal));
    dados?.campanhas.forEach((c) => c.plataforma && s.add(c.plataforma));
    // Grupos primeiro (mídia paga só aparece quando existir), depois cada canal.
    const tipos = new Set([...s].map((c) => trafegoDe(c)));
    return [
      ['todos', 'Todos os canais'],
      ...(['pago', 'organico', 'sem_origem'] as const)
        .filter((t) => tipos.has(t))
        .map((t) => [`tipo:${t}`, `Grupo: ${TRAFEGOS[t]}`]),
      ...[...s]
        .filter((c) => trafegoDe(c) !== 'sem_origem')
        .map((c) => [c, rotuloCanal(c)]),
    ] as [string, string][];
  }, [dados]);
  const campanhas = useMemo(() => {
    const m = new Map<string, string>();
    dados?.campanhas.forEach(
      (c) =>
        c.campanha_id && m.set(c.campanha_id, c.campanha_nome ?? c.campanha_id)
    );
    dados?.oportunidades.forEach(
      (o) =>
        o.campanha_id &&
        !m.has(o.campanha_id) &&
        m.set(o.campanha_id, o.campanha_nome ?? o.campanha_id)
    );
    return [['todas', 'Todas as campanhas'], ...m.entries()] as [
      string,
      string,
    ][];
  }, [dados]);
  const servicos = useMemo(() => {
    const s = new Set<string>();
    dados?.aquisicoes.forEach((a) => a.servico && s.add(a.servico));
    return [
      ['todos', 'Todos os serviços'],
      ...[...s].sort().map((x) => [x, x]),
    ] as [string, string][];
  }, [dados]);

  const abrirJornada = (id: number) => {
    setJornada(id);
    setAba('jornadas');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        description={
          <>
            Do clique no anúncio à receita. Indicador sem dado suficiente
            aparece como indisponível, nunca estimado.
            {dados && (
              <> Carregado {dataHora(dados.carregadoEm.toISOString())}.</>
            )}
          </>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void carregar()}
            disabled={carregando}
          >
            <RefreshCw
              className={carregando ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
            />
            Atualizar
          </Button>
        }
      />

      <div
        className="flex flex-wrap items-end gap-3"
        role="group"
        aria-label="Filtros do painel"
      >
        <Filtro
          rotulo="De"
          valor={f.mesInicio}
          onChange={(v) =>
            setF({ ...f, mesInicio: v, mesFim: v > f.mesFim ? v : f.mesFim })
          }
          opcoes={meses}
        />
        <Filtro
          rotulo="Até"
          valor={f.mesFim}
          onChange={(v) =>
            setF({
              ...f,
              mesFim: v,
              mesInicio: v < f.mesInicio ? v : f.mesInicio,
            })
          }
          opcoes={meses}
        />
        <Filtro
          rotulo="Canal"
          valor={f.canal}
          onChange={(v) => setF({ ...f, canal: v })}
          opcoes={canais}
        />
        <Filtro
          rotulo="Campanha"
          valor={f.campanha}
          onChange={(v) => setF({ ...f, campanha: v })}
          opcoes={campanhas}
        />
        <Filtro
          rotulo="Serviço (pacientes)"
          valor={f.servico}
          onChange={(v) => setF({ ...f, servico: v })}
          opcoes={servicos}
        />
        {(f.canal !== 'todos' ||
          f.campanha !== 'todas' ||
          f.servico !== 'todos') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setF({
                ...f,
                canal: 'todos',
                campanha: 'todas',
                servico: 'todos',
              })
            }
          >
            Limpar filtros
          </Button>
        )}
      </div>

      {erro && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="flex-1 text-sm">Não foi possível carregar: {erro}</p>
            <Button variant="ghost" size="sm" onClick={() => void carregar()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {carregando && !dados ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : r ? (
        <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="visao">Visão geral</TabsTrigger>
            <TabsTrigger value="funil">Funil</TabsTrigger>
            <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
            <TabsTrigger value="jornadas">Jornadas</TabsTrigger>
            <TabsTrigger value="coortes">Receita e coortes</TabsTrigger>
            <TabsTrigger value="qualidade">Qualidade dos dados</TabsTrigger>
          </TabsList>
          <TabsContent value="visao" className="mt-4">
            <VisaoGeralTab r={r} />
          </TabsContent>
          <TabsContent value="funil" className="mt-4">
            <FunilTab r={r} abrirJornada={abrirJornada} />
          </TabsContent>
          <TabsContent value="campanhas" className="mt-4">
            <CampanhasTab r={r} />
          </TabsContent>
          <TabsContent value="jornadas" className="mt-4">
            <JornadasTab r={r} aberta={jornada} setAberta={setJornada} />
          </TabsContent>
          <TabsContent value="coortes" className="mt-4">
            <CoortesTab r={r} />
          </TabsContent>
          <TabsContent value="qualidade" className="mt-4">
            <QualidadeTab q={qualidade} erro={erroQ} />
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
};

export default MarketingPage;
