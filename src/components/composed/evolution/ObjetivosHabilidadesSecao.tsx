// Seção "Objetivos e habilidades" da evolução motora 1.3.
// Já chega preenchida com o que a criança tem: idade, objetivos ativos,
// habilidades acompanhadas e últimos valores. A fisio registra só o que
// trabalhou hoje.

import React, { useMemo, useState } from 'react';
import { Plus, Target } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { cn } from '@/lib/utils';
import {
  GRUPOS_HABILIDADE,
  HABILIDADES,
  HABILIDADE_POR_ID,
  RESULTADOS_FUNCIONAIS,
  ROTULO_ESTADO,
} from '@/lib/motora-catalogo';
import {
  anteriorDe,
  calcularIdade,
  chaveRegistro,
  dataCurta,
  diferenca,
  fmtValor,
  habilidadesSugeridas,
  nomeHabilidade,
  objetivoParaSessao,
  registroDoIndicador,
  situacaoObjetivo,
  textoMetricasCurto,
  nomeRegistro,
  ultimoEstadoDoIndicador,
  ultimosRegistros,
  valorIndicadorNaEvolucao,
  ROTULO_STATUS_OBJETIVO,
  type ObjetivoMotor,
  type StatusObjetivo,
} from '@/lib/motora-plano';
import type {
  EvolucaoMotoraAssimetria,
  ObjetivoSessao,
  RegistroHabilidade,
} from '@/types/evolucao-clinica';
import { HabilidadeCard } from './HabilidadeCard';
import { ObjetivoMotorEditor } from './ObjetivoMotorEditor';
import { chipClasse, opcaoClasse, selectClasse } from './estilos-motora';
import { usePlanoMotor } from './plano-motor-context';
import { useMedidasEvolucao } from './medidas-evolucao-context';

export interface ObjetivosHabilidadesSecaoProps {
  evolucao: EvolucaoMotoraAssimetria;
  onChange: (updates: Partial<EvolucaoMotoraAssimetria>) => void;
  disabled?: boolean;
}

// ----------------------------------------------------------- um objetivo

const BarraMeta: React.FC<{ proporcao?: number }> = ({ proporcao }) =>
  proporcao === undefined ? null : (
    <div
      className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
      role="img"
      aria-label={`${Math.round(proporcao * 100)}% do caminho até a meta (não é escala de desenvolvimento)`}
    >
      <div
        className="h-full bg-primary"
        style={{ width: `${Math.round(proporcao * 100)}%` }}
      />
    </div>
  );

const ObjetivoNaSessao: React.FC<{
  objetivo: ObjetivoMotor;
  evolucao: EvolucaoMotoraAssimetria;
  sessao: ObjetivoSessao | undefined;
  onSessao: (s: ObjetivoSessao | undefined) => void;
  onRegistrarHabilidade: () => void;
  onEditar: () => void;
  onStatus: (s: StatusObjetivo, motivo?: string) => Promise<void>;
  disabled?: boolean;
}> = ({
  objetivo: o,
  evolucao,
  sessao,
  onSessao,
  onRegistrarHabilidade,
  onEditar,
  onStatus,
  disabled,
}) => {
  const ctx = usePlanoMotor();
  const h = ctx?.historico ?? { evolucoes: [], medidas: [] };
  const ultimoEstado = ultimoEstadoDoIndicador(
    o.indicador,
    h.evolucoes.filter((e) => e.agendamento_id !== ctx?.agendamentoId)
  );
  const sit = situacaoObjetivo(o, {
    evolucoes: h.evolucoes.filter(
      (e) => e.agendamento_id !== ctx?.agendamentoId
    ),
    medidas: h.medidas,
  });
  const un = sit.info?.unidade ?? '';
  const hoje = valorIndicadorNaEvolucao(o.indicador, evolucao);
  const antes = sessao?.valor_anterior ?? sit.ultimo?.valor;
  const dif = diferenca(hoje, antes, un);
  const precisaHabilidade =
    o.indicador?.tipo === 'habilidade' &&
    !registroDoIndicador(o.indicador, evolucao.habilidades || []);
  const [acao, setAcao] = useState<StatusObjetivo | null>(null);
  const [motivo, setMotivo] = useState('');
  const [mudando, setMudando] = useState(false);

  return (
    <div className="rounded-lg border p-3 space-y-3 bg-background">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="font-medium leading-tight">{o.descricao}</p>
          {sit.info && (
            <p className="text-xs text-muted-foreground">
              Indicador: {sit.info.rotulo}
            </p>
          )}
          {sit.info?.numerico && (
            <p className="text-xs">
              {sit.inicial !== undefined && (
                <>Inicial {fmtValor(sit.inicial, un)} · </>
              )}
              {sit.ultimo ? (
                <>
                  Último {fmtValor(sit.ultimo.valor, un)} (
                  {dataCurta(sit.ultimo.data)})
                </>
              ) : (
                'Sem registro numérico ainda'
              )}
              {o.meta !== null && <> · Meta {fmtValor(o.meta, un)}</>}
            </p>
          )}
          {ultimoEstado && <p className="text-xs">{ultimoEstado}</p>}
          {o.meta_texto && (
            <p className="text-xs text-muted-foreground">
              Meta: {o.meta_texto}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-pressed={!!sessao}
          disabled={disabled}
          onClick={() =>
            onSessao(
              sessao
                ? undefined
                : ctx
                  ? objetivoParaSessao(
                      o,
                      evolucao,
                      h,
                      ctx.dataSessao,
                      ctx.agendamentoId
                    )
                  : { objetivo_id: o.id, descricao: o.descricao }
            )
          }
          className={cn(chipClasse(!!sessao), 'shrink-0')}
        >
          {sessao ? 'Trabalhado hoje' : 'Trabalhei hoje'}
        </button>
      </div>
      <BarraMeta proporcao={sit.proporcao} />

      {sessao && (
        <div className="space-y-3 border-t pt-3">
          {sit.info?.numerico && (
            <p className="text-sm">
              Hoje:{' '}
              {hoje !== undefined ? (
                <strong>{fmtValor(hoje, un)}</strong>
              ) : (
                <span className="text-muted-foreground">não mensurado</span>
              )}
              {antes !== undefined && <> · antes {fmtValor(antes, un)}</>}
              {dif && (
                <>
                  {' '}
                  · <strong>{dif}</strong>
                </>
              )}
            </p>
          )}
          {precisaHabilidade && (
            <button
              type="button"
              onClick={onRegistrarHabilidade}
              disabled={disabled}
              className="text-sm text-primary underline-offset-2 hover:underline"
            >
              Registrar a habilidade deste objetivo
            </button>
          )}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Resultado em relação ao objetivo
            </Label>
            <div
              className="grid grid-cols-2 sm:grid-cols-4 gap-2"
              role="radiogroup"
              aria-label={`Resultado: ${o.descricao}`}
            >
              {RESULTADOS_FUNCIONAIS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={sessao.resultado === r.id}
                  disabled={disabled}
                  onClick={() =>
                    onSessao({
                      ...sessao,
                      resultado: sessao.resultado === r.id ? undefined : r.id,
                    })
                  }
                  className={opcaoClasse(sessao.resultado === r.id)}
                >
                  {r.rotulo}
                </button>
              ))}
            </div>
          </div>
          <Input
            value={sessao.observacao ?? ''}
            onChange={(e) =>
              onSessao({ ...sessao, observacao: e.target.value || undefined })
            }
            placeholder="Observação sobre o objetivo (opcional)"
            disabled={disabled}
          />
        </div>
      )}

      {!disabled && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <button
            type="button"
            onClick={onEditar}
            className="text-primary hover:underline"
          >
            Editar
          </button>
          {(['atingido', 'suspenso', 'encerrado'] as StatusObjetivo[]).map(
            (s) => (
              <button
                key={s}
                type="button"
                onClick={() => setAcao(acao === s ? null : s)}
                className="text-muted-foreground hover:underline"
              >
                {s === 'atingido'
                  ? 'Marcar atingido'
                  : s === 'suspenso'
                    ? 'Suspender'
                    : 'Encerrar'}
              </button>
            )
          )}
        </div>
      )}
      {acao && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (opcional)"
          />
          <Button
            type="button"
            size="sm"
            disabled={mudando}
            onClick={async () => {
              setMudando(true);
              try {
                await onStatus(acao, motivo);
                setAcao(null);
              } finally {
                setMudando(false);
              }
            }}
          >
            Confirmar: {ROTULO_STATUS_OBJETIVO[acao].toLowerCase()}
          </Button>
        </div>
      )}
    </div>
  );
};

// --------------------------------------------------------------- a seção

export const ObjetivosHabilidadesSecao: React.FC<
  ObjetivosHabilidadesSecaoProps
> = ({ evolucao, onChange, disabled }) => {
  const ctx = usePlanoMotor();
  const { dataSessao: dataMedidas } = useMedidasEvolucao();
  const dataSessao = ctx?.dataSessao || dataMedidas || '';
  const registros = evolucao.habilidades || [];
  const sessoes = evolucao.objetivos_sessao || [];
  const areas = evolucao.areas || [];
  const [editor, setEditor] = useState<'novo' | ObjetivoMotor | null>(null);
  const [outra, setOutra] = useState('');

  const ultimos = useMemo(
    () =>
      ultimosRegistros(
        ctx?.historico?.evolucoes ?? [],
        ctx?.agendamentoId,
        dataSessao || undefined
      ),
    [ctx?.historico, ctx?.agendamentoId, dataSessao]
  );
  const idade = useMemo(
    () =>
      ctx?.historico
        ? calcularIdade(
            ctx.historico.data_nascimento,
            ctx.historico.idade_gestacional_semanas,
            dataSessao
          )
        : null,
    [ctx?.historico, dataSessao]
  );
  const ativos = (ctx?.objetivos ?? []).filter((o) => o.status === 'ativo');
  const sugeridas = habilidadesSugeridas({
    idadeMeses: idade?.meses_para_sugestao,
    areas,
    objetivos: ativos,
    ultimos,
  }).filter((id) => !registros.some((r) => r.habilidade === id));

  // ------------------------------------------------- ações das habilidades
  const setRegistros = (novos: RegistroHabilidade[]) =>
    onChange({ habilidades: novos });

  const adicionar = (id: string, lado?: RegistroHabilidade['lado']) => {
    const hab = HABILIDADE_POR_ID[id];
    if (!hab) return;
    const l = lado ?? (hab.porLado ? 'ambos' : undefined);
    const chave = chaveRegistro({ habilidade: id, lado: l });
    if (registros.some((r) => chaveRegistro(r) === chave)) return;
    const anterior = anteriorDe(ultimos.get(chave));
    setRegistros([
      ...registros,
      {
        habilidade: id,
        ...(l ? { lado: l } : {}),
        estado: 'nao_observado',
        ...(anterior ? { anterior } : {}),
      },
    ]);
  };

  const atualizar = (i: number, r: RegistroHabilidade) => {
    const antigo = registros[i];
    let novo = r;
    if (antigo && antigo.lado !== r.lado) {
      const anterior = anteriorDe(ultimos.get(chaveRegistro(r)));
      novo = { ...r };
      if (anterior) novo.anterior = anterior;
      else delete novo.anterior;
    }
    setRegistros(registros.map((x, j) => (j === i ? novo : x)));
  };

  const setSessao = (id: string, s: ObjetivoSessao | undefined) => {
    const resto = sessoes.filter((x) => x.objetivo_id !== id);
    onChange({ objetivos_sessao: s ? [...resto, s] : resto });
  };

  return (
    <div className="space-y-6">
      {idade && (
        <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">Idade:</span> {idade.cronologica_texto}
          {idade.corrigida_texto && (
            <>
              {' '}
              · <span className="font-medium">corrigida:</span>{' '}
              {idade.corrigida_texto}
            </>
          )}
          {idade.observacao && (
            <span className="block text-xs text-muted-foreground">
              {idade.observacao}
            </span>
          )}
        </div>
      )}

      {/* Plano terapêutico */}
      {ctx && !ctx.erro && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Target className="h-4 w-4" />
              Objetivos ativos
            </h3>
            {!disabled && editor === null && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditor('novo')}
              >
                <Plus className="h-4 w-4 mr-1" />
                Novo objetivo
              </Button>
            )}
          </div>
          {ctx.carregando && ctx.objetivos === null && (
            <p className="text-sm text-muted-foreground">Carregando o plano…</p>
          )}
          {ctx.objetivos !== null && ativos.length === 0 && editor === null && (
            <div className="rounded-lg border border-dashed p-3 text-sm space-y-2">
              <p>Esta criança ainda não tem objetivos ativos.</p>
              {!disabled && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setEditor('novo')}
                >
                  Escolher uma sugestão ou criar
                </Button>
              )}
            </div>
          )}
          {editor !== null && (
            <ObjetivoMotorEditor
              pacienteId={ctx.pacienteId}
              inicial={editor === 'novo' ? undefined : editor}
              areasSugeridas={areas}
              jaNoPlano={ativos.map((o) => o.descricao)}
              origem="evolucao"
              origemId={ctx.agendamentoId}
              onSalvar={async (o) => {
                await ctx.salvarObjetivo(o);
                setEditor(null);
              }}
              onCancelar={() => setEditor(null)}
            />
          )}
          {ativos.map((o) => (
            <ObjetivoNaSessao
              key={o.id}
              objetivo={o}
              evolucao={evolucao}
              sessao={sessoes.find((s) => s.objetivo_id === o.id)}
              onSessao={(s) => setSessao(o.id, s)}
              onRegistrarHabilidade={() =>
                o.indicador?.tipo === 'habilidade' &&
                adicionar(o.indicador.habilidade, o.indicador.lado)
              }
              onEditar={() => setEditor(o)}
              onStatus={(s, motivo) => ctx.mudarStatus(o.id, s, motivo)}
              disabled={disabled}
            />
          ))}
          {ativos.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Objetivo novo, editado ou encerrado entra no plano da criança na
              hora, mesmo sem salvar a evolução.
            </p>
          )}
        </section>
      )}

      {/* Habilidades */}
      <section className="space-y-3">
        <h3 className="font-semibold">Habilidades observadas hoje</h3>
        {registros.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Toque em uma habilidade abaixo para registrar. Só o que foi
            observado hoje.
          </p>
        )}
        {registros.map((r, i) => (
          <HabilidadeCard
            key={chaveRegistro(r) + i}
            registro={r}
            onChange={(novo) => atualizar(i, novo)}
            onRemover={() => setRegistros(registros.filter((_, j) => j !== i))}
            disabled={disabled}
          />
        ))}

        {!disabled && sugeridas.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Acompanhadas e típicas da idade
            </Label>
            <div className="rounded-lg border divide-y">
              {sugeridas.map((id) => {
                const hab = HABILIDADE_POR_ID[id];
                const u =
                  ultimos.get(
                    chaveRegistro({
                      habilidade: id,
                      lado: hab.porLado ? 'ambos' : undefined,
                    })
                  ) ??
                  [...ultimos.values()].find(
                    (x) => x.registro.habilidade === id
                  );
                const metricas = textoMetricasCurto(u?.registro.metricas);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => adicionar(id, u?.registro.lado)}
                    className="w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0">
                      <span className="text-sm">
                        {u ? nomeRegistro(u.registro) : nomeHabilidade(id)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {u
                          ? `Último: ${ROTULO_ESTADO[u.registro.estado].toLowerCase()}${metricas ? ` · ${metricas}` : ''} em ${dataCurta(u.data)}`
                          : 'Sem registro anterior'}
                      </span>
                    </span>
                    <Plus className="h-4 w-4 shrink-0 text-primary" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!disabled && (
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">
              Outra habilidade
            </span>
            <select
              className={selectClasse}
              value={outra}
              onChange={(e) => {
                if (e.target.value) adicionar(e.target.value);
                setOutra('');
              }}
            >
              <option value="">Escolher no catálogo…</option>
              {GRUPOS_HABILIDADE.map((g) => (
                <optgroup key={g.id} label={g.nome}>
                  {HABILIDADES.filter((h) => h.grupo === g.id).map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.nome}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        <p className="text-xs text-muted-foreground">
          Checklist clínica da Respira Kids para acompanhar o desempenho. Não é
          escala padronizada nem gera pontuação de desenvolvimento.
        </p>
      </section>
    </div>
  );
};
