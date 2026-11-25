// AI dev note: Inteligência comercial (admin). Do clique no anúncio à receita.
// Cinco abas (P1 do redesenho, 25/11/2026): Resumo (indicadores + até 3 pontos de
// atenção por regra), Canais, Google Ads, Oportunidades (funil + jornadas) e
// Qualidade. "Painel anterior" guarda as abas antigas (visão geral, campanhas,
// coortes) só para comparação até a conciliação ser aprovada; sai no P2.
// Um único recorte (período, canal, campanha, serviço) alimenta todas as abas.
// Sem dado suficiente o indicador fica "Indisponível" com o motivo; nunca estimar.
// Dados só para admin (RLS + fn_atrib_pode_ver nas visões).

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
  CanaisTab,
  CoortesTab,
  FunilTab,
  GoogleAdsTab,
  JornadasTab,
  QualidadeTab,
  ResumoTab,
  VisaoGeralTab,
} from '@/components/domain/marketing';
import type { AbaMarketing, FocoMarketing } from '@/lib/marketing-insights';
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
type Aba = AbaMarketing | 'anterior';
type AbaAnterior = 'visao' | 'campanhas' | 'coortes';

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
  const [aba, setAba] = useState<Aba>('resumo');
  const [anterior, setAnterior] = useState<AbaAnterior>('visao');
  const [foco, setFoco] = useState<FocoMarketing | undefined>();
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
    setAba('oportunidades');
  };
  const irPara = (destino: AbaMarketing, novoFoco?: FocoMarketing) => {
    setFoco(novoFoco);
    setAba(destino);
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
        <Tabs
          value={aba}
          onValueChange={(v) => {
            setFoco(undefined);
            setAba(v as Aba);
          }}
        >
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="canais">Canais</TabsTrigger>
            <TabsTrigger value="google">Google Ads</TabsTrigger>
            <TabsTrigger value="oportunidades">Oportunidades</TabsTrigger>
            <TabsTrigger value="qualidade">Qualidade</TabsTrigger>
            <TabsTrigger value="anterior" className="text-muted-foreground">
              Painel anterior
            </TabsTrigger>
          </TabsList>
          <TabsContent value="resumo" className="mt-4">
            {aba === 'resumo' && <ResumoTab r={r} irPara={irPara} />}
          </TabsContent>
          <TabsContent value="canais" className="mt-4">
            {aba === 'canais' && <CanaisTab r={r} foco={foco} />}
          </TabsContent>
          <TabsContent value="google" className="mt-4">
            {aba === 'google' && <GoogleAdsTab r={r} />}
          </TabsContent>
          <TabsContent value="oportunidades" className="mt-4 space-y-6">
            <FunilTab r={r} abrirJornada={abrirJornada} />
            <JornadasTab r={r} aberta={jornada} setAberta={setJornada} />
          </TabsContent>
          <TabsContent value="qualidade" className="mt-4">
            <QualidadeTab q={qualidade} erro={erroQ} />
          </TabsContent>
          <TabsContent value="anterior" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Abas do painel anterior, mantidas só para comparação até a
              conciliação ser aprovada. Os números de presença e vínculo já
              seguem a regra única; aqui a receita é a recebida (faturas pagas).
            </p>
            <Tabs
              value={anterior}
              onValueChange={(v) => setAnterior(v as AbaAnterior)}
            >
              <TabsList>
                <TabsTrigger value="visao">Visão geral</TabsTrigger>
                <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
                <TabsTrigger value="coortes">Receita e coortes</TabsTrigger>
              </TabsList>
              <TabsContent value="visao" className="mt-4">
                <VisaoGeralTab r={r} />
              </TabsContent>
              <TabsContent value="campanhas" className="mt-4">
                <CampanhasTab r={r} />
              </TabsContent>
              <TabsContent value="coortes" className="mt-4">
                <CoortesTab r={r} />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
};

export default MarketingPage;
