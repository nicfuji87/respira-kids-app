// AI dev note: Marketing → Oportunidades (admin). Ferramenta comercial, não gráfico:
// 1) "Precisam de ação" (fn_atrib_oportunidades_acao, regras em
//    src/lib/marketing-oportunidades.ts), cada item abre a conversa (WhatsApp,
//    Chatwoot) e a jornada; 2) taxas do funil numa linha; 3) a lista de todas as
//    oportunidades (JornadasTab, a jornada abre em diálogo); 4) o funil detalhado
//    (FunilTab) recolhido. Resolver tarefas é em Conversas → Hoje, não aqui.

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, MessageCircle, Route } from 'lucide-react';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import {
  calcularFunil,
  num,
  pct,
  type Recorte,
} from '@/lib/marketing-atribuicao';
import { nomeCanal } from '@/lib/marketing-canais';
import { dataParede } from '@/lib/marketing-retorno';
import {
  chatwootUrl,
  fmtDesde,
  whatsappUrl,
} from '@/lib/conversas-central-api';
import {
  ACAO,
  carregarAcoes,
  TIPOS_ACAO,
  type DadosAcoes,
  type TipoAcao,
} from '@/lib/marketing-oportunidades';
import { cn } from '@/lib/utils';
import { FunilTab } from './FunilTab';
import { JornadasTab } from './JornadasTab';
import { Aviso } from './marketing-ui';

const JANELA_DIAS = 30;

export const OportunidadesTab: React.FC<{
  r: Recorte;
  jornada: number | null;
  setJornada: (id: number | null) => void;
}> = ({ r, jornada, setJornada }) => {
  const navigate = useNavigate();
  const [d, setD] = useState<DadosAcoes | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoAcao | 'todos'>('todos');

  useEffect(() => {
    let vivo = true;
    carregarAcoes(JANELA_DIAS)
      .then((x) => vivo && setD(x))
      .catch((e: Error) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, []);

  const funil = useMemo(() => calcularFunil(r), [r]);
  const contagem = useMemo(() => {
    const c = Object.fromEntries(TIPOS_ACAO.map((t) => [t, 0])) as Record<
      TipoAcao,
      number
    >;
    d?.itens.forEach((i) => (c[i.tipo] += 1));
    return c;
  }, [d]);
  const itens = (d?.itens ?? []).filter(
    (i) => tipo === 'todos' || i.tipo === tipo
  );

  return (
    <div className="space-y-6">
      <section aria-labelledby="acao-titulo" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="acao-titulo" className="text-base font-semibold">
            Precisam de ação
          </h2>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => navigate('/conversas')}
          >
            Fila do dia de todas as conversas: Conversas → Hoje
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Oportunidades de contato novo com intenção de contratar, abertas nos
          últimos {JANELA_DIAS} dias, que pedem um passo da equipe. Uma ação por
          oportunidade, a mais urgente.
          {d &&
            ` ${num(d.itens.length)} de ${num(d.abertas)} abertas precisam de ação; ${num(d.paradas_10d)} estão paradas há mais de 10 dias sem sessão (contadas como perda, fora da lista).`}
        </p>

        {erro ? (
          <p className="text-sm text-destructive">
            Não foi possível carregar as ações: {erro}
          </p>
        ) : !d ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Filtrar por tipo de ação"
            >
              <Button
                size="sm"
                variant={tipo === 'todos' ? 'default' : 'outline'}
                aria-pressed={tipo === 'todos'}
                onClick={() => setTipo('todos')}
              >
                Todas ({num(d.itens.length)})
              </Button>
              {TIPOS_ACAO.map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={tipo === t ? 'default' : 'outline'}
                  aria-pressed={tipo === t}
                  onClick={() => setTipo(t)}
                  disabled={contagem[t] === 0}
                >
                  {ACAO[t].rotulo} ({num(contagem[t])})
                </Button>
              ))}
            </div>
            {tipo !== 'todos' && (
              <Aviso>
                <strong className="text-foreground">Critério: </strong>
                {ACAO[tipo].criterio}
              </Aviso>
            )}
            {itens.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nada pendente aqui.
              </p>
            ) : (
              <ul className="divide-y rounded-md border bg-card">
                {itens.map((i) => {
                  const a = ACAO[i.tipo];
                  const wa = whatsappUrl(i.telefone);
                  const cw = chatwootUrl(i.chatwoot_id);
                  return (
                    <li
                      key={i.oportunidade_id}
                      className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            {i.nome ?? `Conversa #${i.conversa_id}`}
                          </span>
                          <Badge variant={a.variante} title={a.criterio}>
                            {a.rotulo}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {nomeCanal(i.canal)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {i.tipo === 'confirmar_primeira' && i.proxima_sessao
                            ? `1ª sessão ${dataParede(i.proxima_sessao)}. `
                            : `Última mensagem ${i.ultima_origem === 'CLIENTE' ? 'da família' : i.ultima_origem === 'JU' ? 'da Ju' : 'da equipe'} ${fmtDesde(i.desde)}. `}
                          <span className="text-foreground">{a.fazer}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {wa && (
                          <Button size="sm" variant="outline" asChild>
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <MessageCircle className="h-4 w-4" aria-hidden />
                              WhatsApp
                            </a>
                          </Button>
                        )}
                        {cw && (
                          <Button size="sm" variant="outline" asChild>
                            <a
                              href={cw}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-4 w-4" aria-hidden />
                              Chatwoot
                            </a>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setJornada(i.oportunidade_id)}
                        >
                          <Route className="h-4 w-4" aria-hidden />
                          Ver jornada
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="taxas-titulo" className="space-y-2">
        <h2 id="taxas-titulo" className="text-base font-semibold">
          Do contato ao pagamento
        </h2>
        <ol className="flex flex-wrap items-stretch gap-2 text-sm">
          {funil.map((e, idx) => (
            <li
              key={e.rotulo}
              className={cn(
                'flex min-w-[8.5rem] flex-1 flex-col rounded-md border bg-card px-3 py-2',
                idx === 0 && 'bg-muted/40'
              )}
            >
              <span className="text-xs text-muted-foreground">{e.rotulo}</span>
              <span className="text-lg font-semibold tabular-nums">
                {num(e.quantidade)}
              </span>
              <span className="text-xs text-muted-foreground">
                {e.taxa == null ? 'início' : `${pct(e.taxa)} da etapa anterior`}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">
          Conversas do período pela etapa mais avançada. "Atendimento realizado"
          exige sessão finalizada na agenda.
        </p>
      </section>

      <JornadasTab r={r} aberta={jornada} setAberta={setJornada} />

      <details className="rounded-md border bg-card">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          Funil detalhado: o que as conversas pediam, onde estão e por que se
          perderam
        </summary>
        <div className="border-t p-3">
          <FunilTab r={r} abrirJornada={setJornada} />
        </div>
      </details>
    </div>
  );
};
