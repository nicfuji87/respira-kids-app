// AI dev note: Renderizadores dos slides das reuniões com as estagiárias
// (conteúdo em src/lib/estagio-reunioes.ts). Slides "ao vivo" recebem os dados
// de fn_estagio_bonus_evolucoes via props; a apresentação busca e atualiza.
// Barras e números animam ao entrar no slide (cada slide remonta com key).

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Reuniao, Slide } from '@/lib/estagio-reunioes';
import {
  GRUPO_LABEL,
  brl,
  nomeMes,
  partesParede,
  type BonusEvolucoes,
} from '@/lib/estagio-reunioes-api';

// =====================================================
// Helpers
// =====================================================

function pct(parte: number, total: number): number {
  return total > 0 ? Math.round((100 * parte) / total) : 0;
}

/** Valor que sai de 0 e chega ao alvo, para a barra/numero "crescer" ao entrar. */
function useAnimado(alvo: number, duracaoMs = 900): number {
  const [valor, setValor] = useState(0);
  useEffect(() => {
    let raf = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / duracaoMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValor(alvo * eased);
      if (t < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo, duracaoMs]);
  return valor;
}

const BarraAnimada: React.FC<{
  valor: number; // 0-100
  className?: string;
  trilho?: string;
  altura?: string;
}> = ({ valor, className, trilho = 'bg-roxo-titulo/10', altura = 'h-4' }) => {
  const v = useAnimado(Math.max(0, Math.min(100, valor)));
  return (
    <div className={cn('w-full rounded-full overflow-hidden', trilho, altura)}>
      <div
        className={cn('h-full rounded-full', className)}
        style={{ width: `${v}%` }}
      />
    </div>
  );
};

const Kicker: React.FC<{ texto?: string }> = ({ texto }) =>
  texto ? (
    <p className="text-sm md:text-base font-semibold uppercase tracking-[0.18em] text-azul-respira">
      {texto}
    </p>
  ) : null;

const Titulo: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-3xl md:text-4xl xl:text-5xl font-bold text-roxo-titulo leading-tight text-balance">
    {children}
  </h2>
);

// =====================================================
// Props comuns
// =====================================================

export interface DadosAoVivo {
  dados: BonusEvolucoes | null;
  carregando: boolean;
  erro: string | null;
  simulacao: boolean;
}

interface SlideProps {
  slide: Slide;
  reuniao: Reuniao;
  vivo: DadosAoVivo;
}

// =====================================================
// Slides de texto
// =====================================================

const SlideCapa: React.FC<{ slide: Extract<Slide, { tipo: 'capa' }> }> = ({
  slide,
}) => (
  <div className="grid md:grid-cols-[1.1fr_1fr] gap-10 md:gap-16 items-center">
    <div className="space-y-4">
      <div className="h-2 w-24 rounded-full bg-gradient-to-r from-azul-respira to-verde-pipa" />
      <h1 className="text-4xl md:text-6xl font-bold text-roxo-titulo leading-[1.05] text-balance">
        {slide.titulo}
      </h1>
      {slide.subtitulo && (
        <p className="text-xl md:text-2xl text-muted-foreground">
          {slide.subtitulo}
        </p>
      )}
    </div>
    <ol className="space-y-3">
      {slide.itens.map((item, i) => (
        <li
          key={item}
          className="flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
          style={{ animationDelay: `${120 + i * 70}ms` }}
        >
          <span className="w-9 h-9 shrink-0 rounded-full bg-azul-respira/15 text-azul-respira font-bold flex items-center justify-center">
            {i + 1}
          </span>
          <span className="text-lg md:text-xl text-foreground">{item}</span>
        </li>
      ))}
    </ol>
  </div>
);

const SlideLista: React.FC<{ slide: Extract<Slide, { tipo: 'lista' }> }> = ({
  slide,
}) => (
  <div className="space-y-6 md:space-y-8">
    <div className="space-y-3">
      <Kicker texto={slide.kicker} />
      <Titulo>{slide.titulo}</Titulo>
    </div>
    <div className="grid md:grid-cols-2 gap-4">
      {slide.itens.map((item, i) => (
        <div
          key={item.titulo}
          className="rounded-2xl bg-card/80 border border-border/60 p-5 animate-in fade-in slide-in-from-bottom-3 fill-mode-both"
          style={{ animationDelay: `${100 + i * 90}ms` }}
        >
          <p className="text-lg md:text-xl font-semibold text-roxo-titulo">
            {item.titulo}
          </p>
          {item.texto && (
            <p className="mt-1.5 text-base md:text-lg text-muted-foreground leading-snug">
              {item.texto}
            </p>
          )}
        </div>
      ))}
    </div>
    {slide.nota && (
      <p className="text-base md:text-lg text-muted-foreground">{slide.nota}</p>
    )}
  </div>
);

const SlideEvolucaoSemanal: React.FC<{
  slide: Extract<Slide, { tipo: 'evolucao-semanal' }>;
}> = ({ slide }) => (
  <div className="space-y-6 md:space-y-8">
    <div className="space-y-3">
      <Kicker texto={slide.kicker} />
      <Titulo>{slide.titulo}</Titulo>
      <p className="text-lg text-muted-foreground">{slide.subtitulo}</p>
    </div>
    <div className="h-64 md:h-72 flex items-end gap-1.5 md:gap-2.5">
      {slide.dados.map((d, i) => (
        <BarraSemana key={d.rotulo} rotulo={d.rotulo} pct={d.pct} indice={i} />
      ))}
    </div>
    {slide.nota && (
      <p className="text-lg md:text-xl text-foreground font-medium">
        {slide.nota}
      </p>
    )}
  </div>
);

const BarraSemana: React.FC<{
  rotulo: string;
  pct: number;
  indice: number;
}> = ({ rotulo, pct: valor, indice }) => {
  const [ativo, setAtivo] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAtivo(true), 80 + indice * 45);
    return () => clearTimeout(t);
  }, [indice]);
  const cor =
    valor >= 80
      ? 'bg-verde-pipa'
      : valor >= 50
        ? 'bg-amarelo-pipa'
        : 'bg-vermelho-kids';
  return (
    <div className="flex-1 h-full flex flex-col items-center justify-end gap-1 min-w-0">
      <span
        className={cn(
          'text-xs font-semibold text-roxo-titulo transition-opacity duration-500',
          ativo ? 'opacity-100' : 'opacity-0',
          indice % 2 === 1 && 'hidden md:inline'
        )}
      >
        {valor}%
      </span>
      <div className="w-full flex-1 flex items-end">
        <div
          className={cn(
            'w-full rounded-t-md transition-[height] duration-700 ease-out',
            cor
          )}
          style={{ height: ativo ? `${valor}%` : '0%' }}
        />
      </div>
      <span
        className={cn(
          'text-xs text-muted-foreground whitespace-nowrap',
          indice % 2 === 1 && 'invisible md:visible'
        )}
      >
        {rotulo}
      </span>
    </div>
  );
};

const SlideCombinados: React.FC<{
  slide: Extract<Slide, { tipo: 'combinados' }>;
}> = ({ slide }) => {
  const [feitos, setFeitos] = useState<Set<number>>(new Set());
  const alternar = (i: number) =>
    setFeitos((prev) => {
      const novo = new Set(prev);
      if (novo.has(i)) novo.delete(i);
      else novo.add(i);
      return novo;
    });
  return (
    <div className="space-y-6 md:space-y-8">
      <div className="space-y-3">
        <Kicker texto={slide.kicker} />
        <Titulo>{slide.titulo}</Titulo>
        <p className="text-base text-muted-foreground">
          Toque em cada item quando estiver combinado.
        </p>
      </div>
      <div className="space-y-3">
        {slide.itens.map((item, i) => {
          const ok = feitos.has(i);
          return (
            <button
              key={item}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                alternar(i);
              }}
              className={cn(
                'w-full flex items-center gap-4 rounded-2xl border p-4 text-left transition-colors',
                ok
                  ? 'bg-verde-pipa/25 border-verde-pipa'
                  : 'bg-card/80 border-border/60 hover:border-azul-respira/60'
              )}
            >
              {ok ? (
                <CheckCircle2 className="w-7 h-7 text-verde-pipa shrink-0" />
              ) : (
                <Circle className="w-7 h-7 text-muted-foreground shrink-0" />
              )}
              <span className="text-lg md:text-xl text-foreground">{item}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// =====================================================
// Slides ao vivo
// =====================================================

const EstadoVivo: React.FC<{ vivo: DadosAoVivo }> = ({ vivo }) => {
  if (vivo.erro)
    return (
      <p className="text-lg text-vermelho-kids">
        Não consegui carregar os números agora. {vivo.erro}
      </p>
    );
  return (
    <p className="text-lg text-muted-foreground">Carregando os números…</p>
  );
};

const AvisoSimulacao: React.FC<{ reuniao: Reuniao; mes: string }> = ({
  reuniao,
  mes,
}) => (
  <div className="rounded-xl bg-amarelo-pipa/20 border border-amarelo-pipa/60 px-4 py-2.5 text-sm md:text-base text-foreground">
    <strong>Simulação</strong> com os números de {nomeMes(mes)}. A regra vale a
    partir de 1º de {nomeMes(reuniao.bonusInicio)}, com o placar começando em{' '}
    {brl(100)}.
  </div>
);

const SlideCobertura: React.FC<SlideProps> = ({ slide, vivo }) => {
  const s = slide as Extract<Slide, { tipo: 'cobertura-ao-vivo' }>;
  const d = vivo.dados;
  const totalEvo = d?.por_grupo.reduce((a, g) => a + g.com_evolucao, 0) ?? 0;
  return (
    <div className="space-y-6 md:space-y-8">
      <div className="space-y-3">
        <Kicker texto={s.kicker} />
        <Titulo>{s.titulo}</Titulo>
        {d && (
          <p className="text-lg text-muted-foreground">
            Sessões de {nomeMes(d.mes)} que já passaram de 24h (sem domiciliar)
          </p>
        )}
      </div>
      {!d ? (
        <EstadoVivo vivo={vivo} />
      ) : (
        <div className="space-y-4">
          <div className="flex gap-6 text-sm md:text-base text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-azul-respira" /> Com
              evolução
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-verde-pipa" /> Em até 24h
            </span>
          </div>
          {d.por_grupo.map((g) => (
            <LinhaCobertura
              key={g.grupo}
              rotulo={GRUPO_LABEL[g.grupo]}
              sessoes={g.contadas}
              cobertura={pct(g.com_evolucao, g.contadas)}
              prazo={pct(g.no_prazo, g.contadas)}
            />
          ))}
          <div className="border-t border-border/60 pt-5">
            <LinhaCobertura
              rotulo="Clínica"
              destaque
              sessoes={d.contadas}
              cobertura={pct(totalEvo, d.contadas)}
              prazo={pct(d.no_prazo, d.contadas)}
            />
          </div>
        </div>
      )}
      {s.nota && <p className="text-lg md:text-xl font-medium">{s.nota}</p>}
    </div>
  );
};

const LinhaCobertura: React.FC<{
  rotulo: string;
  sessoes: number;
  cobertura: number;
  prazo: number;
  destaque?: boolean;
}> = ({ rotulo, sessoes, cobertura, prazo, destaque }) => (
  <div className="grid grid-cols-[7rem_1fr] md:grid-cols-[10rem_1fr] gap-4 items-center">
    <div>
      <p
        className={cn(
          'text-lg md:text-xl text-roxo-titulo',
          destaque ? 'font-bold' : 'font-semibold'
        )}
      >
        {rotulo}
      </p>
      <p className="text-sm text-muted-foreground">{sessoes} sessões</p>
    </div>
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <BarraAnimada
          valor={cobertura}
          className="bg-azul-respira"
          altura="h-3.5"
        />
        <span className="w-12 text-right font-bold tabular-nums">
          {cobertura}%
        </span>
      </div>
      <div className="flex items-center gap-3">
        <BarraAnimada valor={prazo} className="bg-verde-pipa" altura="h-3.5" />
        <span className="w-12 text-right font-bold tabular-nums">{prazo}%</span>
      </div>
    </div>
  </div>
);

const SlideBonusRegra: React.FC<SlideProps> = ({ slide, reuniao }) => {
  const s = slide as Extract<Slide, { tipo: 'bonus-regra' }>;
  const cards = [
    {
      valor: brl(100),
      texto: 'de bônus para cada estagiária, todo mês',
      cor: 'bg-verde-pipa/30',
    },
    {
      valor: `− ${brl(5)}`,
      texto: 'para cada evolução que passar de 24h',
      cor: 'bg-amarelo-pipa/25',
    },
    {
      valor: '20',
      texto: 'evoluções perdidas zeram o bônus do mês',
      cor: 'bg-vermelho-kids/20',
    },
  ];
  return (
    <div className="space-y-6 md:space-y-8">
      <div className="space-y-3">
        <Kicker texto={s.kicker} />
        <Titulo>{s.titulo}</Titulo>
        <p className="text-lg text-muted-foreground">
          Vale a partir de 1º de {nomeMes(reuniao.bonusInicio)}.
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {cards.map((c, i) => (
          <div
            key={c.valor}
            className={cn(
              'rounded-2xl p-5 md:p-6 animate-in fade-in zoom-in-95 fill-mode-both',
              c.cor
            )}
            style={{ animationDelay: `${100 + i * 140}ms` }}
          >
            <p className="text-4xl md:text-5xl font-bold text-roxo-titulo tabular-nums">
              {c.valor}
            </p>
            <p className="mt-2 text-base md:text-lg text-foreground leading-snug">
              {c.texto}
            </p>
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4 text-base md:text-lg">
        <div className="rounded-2xl bg-card/80 border border-border/60 p-5 space-y-1.5">
          <p className="font-semibold text-roxo-titulo">Conta</p>
          <p>Toda sessão da clínica: respiratória, motora e avaliação.</p>
          <p>
            Evolução feita depois de 24h conta como perdida. Faça mesmo assim: é
            o prontuário da criança.
          </p>
        </div>
        <div className="rounded-2xl bg-card/80 border border-border/60 p-5 space-y-1.5">
          <p className="font-semibold text-roxo-titulo">Não conta</p>
          <p>Atendimento domiciliar (está liberado).</p>
          <p>Sessão cancelada, reagendada ou com falta.</p>
        </div>
      </div>
      <p className="text-lg md:text-xl font-medium">
        A meta é da dupla: as duas recebem o mesmo valor.
      </p>
    </div>
  );
};

const SlideBonusAoVivo: React.FC<SlideProps> = ({ slide, reuniao, vivo }) => {
  const s = slide as Extract<Slide, { tipo: 'bonus-ao-vivo' }>;
  const d = vivo.dados;
  const limite = d ? Math.round(d.bonus_base / d.desconto_por_perdida) : 20;
  const bonusAnimado = useAnimado(d?.bonus ?? 0);
  const corBonus =
    !d || d.bonus >= 60
      ? 'bg-verde-pipa'
      : d.bonus >= 25
        ? 'bg-amarelo-pipa'
        : 'bg-vermelho-kids';
  const manha = d?.por_turno.find((t) => t.turno === 'manha');
  const tarde = d?.por_turno.find((t) => t.turno === 'tarde');

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Kicker texto={s.kicker} />
        <Titulo>{s.titulo}</Titulo>
        {d && vivo.simulacao && (
          <AvisoSimulacao reuniao={reuniao} mes={d.mes} />
        )}
      </div>
      {!d ? (
        <EstadoVivo vivo={vivo} />
      ) : (
        <>
          <div className="rounded-3xl bg-card/90 border border-border/60 p-6 md:p-8 space-y-4">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm uppercase tracking-wide text-muted-foreground">
                  Bônus de cada estagiária em {nomeMes(d.mes)}
                </p>
                <p className="text-6xl md:text-7xl font-bold text-roxo-titulo tabular-nums">
                  {brl(Math.round(bonusAnimado))}
                </p>
              </div>
              <p className="text-lg text-muted-foreground">
                de {brl(d.bonus_base)}
              </p>
            </div>
            <BarraAnimada
              valor={pct(d.bonus, d.bonus_base)}
              className={corBonus}
              altura="h-6"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-card/80 border border-border/60 p-5 space-y-3">
              <div className="flex items-baseline justify-between">
                <p className="text-lg font-semibold text-roxo-titulo">
                  Evoluções perdidas
                </p>
                <p className="text-2xl font-bold tabular-nums">
                  {d.perdidas}
                  <span className="text-base text-muted-foreground font-normal">
                    {' '}
                    (zera em {limite})
                  </span>
                </p>
              </div>
              <BarraAnimada
                valor={pct(Math.min(d.perdidas, limite), limite)}
                className="bg-vermelho-kids"
              />
              <p className="text-sm text-muted-foreground">
                {d.sem_evolucao} ainda sem evolução · {d.feitas_atrasadas}{' '}
                feitas depois de 24h
              </p>
            </div>
            <div className="rounded-2xl bg-card/80 border border-border/60 p-5 space-y-3">
              <div className="flex items-baseline justify-between">
                <p className="text-lg font-semibold text-roxo-titulo">
                  No prazo de 24h
                </p>
                <p className="text-2xl font-bold tabular-nums">
                  {pct(d.no_prazo, d.contadas)}%
                </p>
              </div>
              <BarraAnimada
                valor={pct(d.no_prazo, d.contadas)}
                className="bg-verde-pipa"
              />
              <p className="text-sm text-muted-foreground">
                {d.no_prazo} de {d.contadas} sessões · meta: 100%
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-2 text-base md:text-lg">
            {manha && (
              <span>
                Manhã: <strong>{manha.perdidas}</strong> perdidas de{' '}
                {manha.contadas}
              </span>
            )}
            {tarde && (
              <span>
                Tarde: <strong>{tarde.perdidas}</strong> perdidas de{' '}
                {tarde.contadas}
              </span>
            )}
            {d.domiciliares_liberadas > 0 && (
              <span className="text-muted-foreground">
                {d.domiciliares_liberadas} domiciliares liberadas
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const SlideEmRisco: React.FC<SlideProps> = ({ slide, vivo }) => {
  const s = slide as Extract<Slide, { tipo: 'em-risco' }>;
  const d = vivo.dados;
  const lista = d?.em_risco_lista ?? [];
  const visiveis = lista.slice(0, 10);
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Kicker texto={s.kicker} />
        <Titulo>{s.titulo}</Titulo>
        <p className="text-lg text-muted-foreground">
          Sem evolução ainda, mas dentro do prazo. Cada uma salva {brl(5)}.
        </p>
      </div>
      {!d ? (
        <EstadoVivo vivo={vivo} />
      ) : lista.length === 0 ? (
        <div className="rounded-2xl bg-verde-pipa/25 p-6 flex items-center gap-4">
          <CheckCircle2 className="w-8 h-8 text-verde-pipa" />
          <p className="text-xl">Nada vencendo agora. Tudo em dia.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-vermelho-kids text-lg font-semibold">
            <AlertTriangle className="w-5 h-5" />
            {d.em_risco} sessões dentro da janela de 24h
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            {visiveis.map((r, i) => {
              const prazo = partesParede(r.prazo);
              const inicio = partesParede(r.inicio);
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-xl bg-card/80 border border-border/60 px-4 py-3 animate-in fade-in slide-in-from-left-2 fill-mode-both"
                  style={{ animationDelay: `${60 + i * 50}ms` }}
                >
                  <Clock className="w-5 h-5 text-amarelo-pipa shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">
                      {r.paciente || 'Paciente'} · {GRUPO_LABEL[r.grupo]}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      Sessão {inicio.dia} {inicio.hora}
                      {r.profissional ? ` com ${r.profissional}` : ''}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-right shrink-0">
                    até {prazo.dia}
                    <br />
                    {prazo.hora}
                  </p>
                </div>
              );
            })}
          </div>
          {lista.length > visiveis.length && (
            <p className="text-sm text-muted-foreground">
              e mais {d.em_risco - visiveis.length}.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// =====================================================
// Dispatcher
// =====================================================

export const ReuniaoSlide: React.FC<SlideProps> = (props) => {
  const { slide } = props;
  switch (slide.tipo) {
    case 'capa':
      return <SlideCapa slide={slide} />;
    case 'lista':
      return <SlideLista slide={slide} />;
    case 'evolucao-semanal':
      return <SlideEvolucaoSemanal slide={slide} />;
    case 'combinados':
      return <SlideCombinados slide={slide} />;
    case 'cobertura-ao-vivo':
      return <SlideCobertura {...props} />;
    case 'bonus-regra':
      return <SlideBonusRegra {...props} />;
    case 'bonus-ao-vivo':
      return <SlideBonusAoVivo {...props} />;
    case 'em-risco':
      return <SlideEmRisco {...props} />;
    default:
      return null;
  }
};

ReuniaoSlide.displayName = 'ReuniaoSlide';
