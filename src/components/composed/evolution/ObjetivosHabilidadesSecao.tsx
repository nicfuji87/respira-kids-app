// Seção "Objetivos" da evolução motora (1.4).
// Os objetivos ficam agrupados pelas áreas marcadas, em ordem alfabética.
// Tocar num objetivo marca "trabalhado hoje" e abre só o que ele acompanha:
// a habilidade (com os números) e as medidas. Goniometria e craniometria
// abrem nas próximas seções; MFS, FSOS-2, tensão e desenvolvimento ficam aqui.

import React, { useMemo, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { cn } from '@/lib/utils';
import {
  OBJETIVOS_CATALOGO,
  RESULTADOS_FUNCIONAIS,
  RECURSOS,
  RECURSOS_ANTIGOS,
  FINALIDADE_POR_ID,
  REGIOES,
  nomeDe,
  type ObjetivoCatalogo,
} from '@/lib/motora-catalogo';
import {
  areaDoObjetivo,
  calcularIdade,
  catalogoDoObjetivo,
  chaveRegistro,
  comComparacoes,
  criarRegistro,
  dataCurta,
  diferenca,
  fmtValor,
  objetivoParaSessao,
  objetivoProvisorio,
  situacaoObjetivo,
  ultimoEstadoDoIndicador,
  valorIndicadorNaEvolucao,
  ROTULO_STATUS_OBJETIVO,
  type ContextoRegistro,
  type ObjetivoMotor,
  type StatusObjetivo,
} from '@/lib/motora-plano';
import {
  AREAS_MOTORAS,
  NOME_MEDIDA_MOTORA,
  medidasDoDia,
  type AreaMotora,
  type EvolucaoMotoraAssimetria,
  type MedicaoSessao,
  type ObjetivoSessao,
  type RegistroHabilidade,
  type TipoMedidaMotora,
} from '@/types/evolucao-clinica';
import { HabilidadeCard } from './HabilidadeCard';
import { MedicaoSessaoBloco } from './MedicoesMotoras';
import { ObjetivoMotorEditor } from './ObjetivoMotorEditor';
import { chipClasse, opcaoClasse } from './estilos-motora';
import { usePlanoMotor } from './plano-motor-context';
import { useMedidasEvolucao } from './medidas-evolucao-context';

export interface ObjetivosHabilidadesSecaoProps {
  evolucao: EvolucaoMotoraAssimetria;
  onChange: (updates: Partial<EvolucaoMotoraAssimetria>) => void;
  disabled?: boolean;
}

/** Medidas com seção própria: abrem como passo da evolução */
const COM_SECAO: TipoMedidaMotora[] = ['goniometria', 'craniometria'];

// Registro da habilidade do objetivo, mesmo ainda "não observado hoje"
// (registroDoIndicador ignora esses, porque não têm valor)
const registroDaHabilidade = (
  ind: ObjetivoMotor['indicador'],
  registros: RegistroHabilidade[]
): RegistroHabilidade | undefined => {
  if (ind?.tipo !== 'habilidade') return undefined;
  const daHab = registros.filter((r) => r.habilidade === ind.habilidade);
  if (ind.lado) return daHab.find((r) => (r.lado ?? 'ambos') === ind.lado);
  return daHab.find((r) => !r.lado || r.lado === 'ambos') ?? daHab[0];
};

/** O que foi feito na última sessão em que o objetivo foi trabalhado */
function ultimosRecursos(
  item: { cat?: ObjetivoCatalogo; plano?: ObjetivoMotor },
  evolucoes: { data: string; objetivos_sessao: ObjetivoSessao[] | null }[]
): string[] | undefined {
  const ordenadas = [...evolucoes].sort((a, b) => b.data.localeCompare(a.data));
  for (const e of ordenadas) {
    const s = (e.objetivos_sessao || []).find(
      (x) =>
        (item.plano && x.objetivo_id === item.plano.id) ||
        (item.cat && x.catalogo_id === item.cat.id)
    );
    if (s?.recursos?.length) return s.recursos;
  }
  return undefined;
}

interface ItemObjetivo {
  chave: string;
  descricao: string;
  cat?: ObjetivoCatalogo;
  plano?: ObjetivoMotor;
}

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

// ------------------------------------------------- objetivo trabalhado hoje

const DetalheObjetivo: React.FC<{
  item: ItemObjetivo;
  objetivo: ObjetivoMotor;
  evolucao: EvolucaoMotoraAssimetria;
  sessao: ObjetivoSessao;
  registro: RegistroHabilidade | undefined;
  onSessao: (s: ObjetivoSessao) => void;
  onRegistro: (r: RegistroHabilidade) => void;
  onEditar: () => void;
  onStatus: (s: StatusObjetivo, motivo?: string) => Promise<void>;
  disabled?: boolean;
}> = ({
  item,
  objetivo: o,
  evolucao,
  sessao,
  registro,
  onSessao,
  onRegistro,
  onEditar,
  onStatus,
  disabled,
}) => {
  const ctx = usePlanoMotor();
  const h = ctx?.historico ?? { evolucoes: [], medidas: [] };
  const anteriores = h.evolucoes.filter(
    (e) => e.agendamento_id !== ctx?.agendamentoId
  );
  const ultimoEstado = ultimoEstadoDoIndicador(o.indicador, anteriores);
  const sit = situacaoObjetivo(o, {
    evolucoes: anteriores,
    medidas: h.medidas,
  });
  const un = sit.info?.unidade ?? '';
  const hoje = valorIndicadorNaEvolucao(o.indicador, evolucao);
  const antes = sessao.valor_anterior ?? sit.ultimo?.valor;
  const dif = diferenca(hoje, antes, un);
  const [acao, setAcao] = useState<StatusObjetivo | null>(null);
  const [motivo, setMotivo] = useState('');
  const [mudando, setMudando] = useState(false);

  return (
    <div className="space-y-3 border-t pt-3">
      {(sit.info?.numerico || ultimoEstado) && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {sit.info?.numerico && (
            <p>
              {sit.ultimo ? (
                <>
                  Último {fmtValor(sit.ultimo.valor, un)} (
                  {dataCurta(sit.ultimo.data)})
                </>
              ) : (
                'Sem número registrado antes'
              )}
              {o.meta !== null && <> · meta {fmtValor(o.meta, un)}</>}
              {hoje !== undefined && (
                <>
                  {' '}
                  · hoje <strong>{fmtValor(hoje, un)}</strong>
                  {dif && <> ({dif})</>}
                </>
              )}
            </p>
          )}
          {ultimoEstado && <p>{ultimoEstado}</p>}
          <BarraMeta proporcao={sit.proporcao} />
        </div>
      )}

      {registro && (
        <HabilidadeCard
          registro={registro}
          onChange={onRegistro}
          disabled={disabled}
        />
      )}

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">
          O que foi feito <span className="text-destructive">*</span>
        </Label>
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label={`O que foi feito: ${o.descricao}`}
        >
          {RECURSOS.map((r) => {
            const sel = !!sessao.recursos?.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={sel}
                disabled={disabled}
                onClick={() => {
                  const atuais = sessao.recursos || [];
                  const novos = sel
                    ? atuais.filter((x) => x !== r.id)
                    : [...atuais, r.id];
                  const n = { ...sessao };
                  if (novos.length) n.recursos = novos;
                  else delete n.recursos;
                  onSessao(n);
                }}
                className={chipClasse(sel)}
              >
                {r.nome}
              </button>
            );
          })}
        </div>
        {sessao.recursos_da_ultima && (
          <p className="text-xs text-muted-foreground">
            Marcado como na última sessão. Toque para trocar.
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">
          Resultado hoje <span className="text-destructive">*</span>
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
        placeholder="Observação (opcional)"
        disabled={disabled}
      />

      {/* Plano: só para objetivo que já está no plano da criança */}
      {!disabled && item.plano && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <button
            type="button"
            onClick={onEditar}
            className="text-primary hover:underline"
          >
            Meta e indicador
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
  const contexto: ContextoRegistro = useMemo(
    () => ({
      evolucoes: ctx?.historico?.evolucoes ?? [],
      excluirAgendamentoId: ctx?.agendamentoId,
      ateData: dataSessao || undefined,
    }),
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
  const ativos = useMemo(
    () => (ctx?.objetivos ?? []).filter((o) => o.status === 'ativo'),
    [ctx?.objetivos]
  );

  // Catálogo da área + objetivos próprios do plano, em ordem alfabética
  const itensDaArea = (area: AreaMotora): ItemObjetivo[] => {
    const itens: ItemObjetivo[] = OBJETIVOS_CATALOGO.filter(
      (c) => c.area === area
    ).map((c) => ({
      chave: c.id,
      descricao: c.descricao,
      cat: c,
      plano: ativos.find((o) => catalogoDoObjetivo(o)?.id === c.id),
    }));
    for (const o of ativos)
      if (!catalogoDoObjetivo(o) && areaDoObjetivo(o) === area)
        itens.push({ chave: o.id, descricao: o.descricao, plano: o });
    return itens.sort((a, b) =>
      a.descricao.localeCompare(b.descricao, 'pt-BR')
    );
  };

  const sessaoDe = (item: ItemObjetivo) =>
    sessoes.find(
      (s) =>
        (item.plano && s.objetivo_id === item.plano.id) ||
        (item.cat && s.catalogo_id === item.cat.id)
    );

  const objetivoDe = (item: ItemObjetivo, s?: ObjetivoSessao) =>
    item.plano ??
    objetivoProvisorio(item.cat!, ctx?.pacienteId ?? '', s?.objetivo_id);

  const registroDe = (o: ObjetivoMotor) =>
    registroDaHabilidade(o.indicador, registros);

  const alternar = (item: ItemObjetivo) => {
    if (disabled) return;
    const atual = sessaoDe(item);
    if (atual) {
      // Sai da sessão; a habilidade só sai se ninguém mais a usa e se
      // continua sem registro
      const resto = sessoes.filter((s) => s !== atual);
      const o = objetivoDe(item, atual);
      const r = registroDe(o);
      const usadaPorOutro = resto.some((s) => {
        const it = OBJETIVOS_CATALOGO.find((c) => c.id === s.catalogo_id);
        return (
          it?.indicador?.tipo === 'habilidade' &&
          o.indicador?.tipo === 'habilidade' &&
          it.indicador.habilidade === o.indicador.habilidade
        );
      });
      const habilidades =
        r && !usadaPorOutro && r.estado === 'nao_observado' && !r.metricas
          ? registros.filter((x) => x !== r)
          : registros;
      onChange({ objetivos_sessao: resto, habilidades });
      return;
    }
    const o = objetivoDe(item);
    const h = ctx?.historico ?? { evolucoes: [], medidas: [] };
    const ultimos = ultimosRecursos(item, h.evolucoes);
    const s: ObjetivoSessao = {
      ...objetivoParaSessao(o, evolucao, h, dataSessao, ctx?.agendamentoId),
      ...(item.cat
        ? {
            catalogo_id: item.cat.id,
            area: item.cat.area,
            regiao: item.cat.regiao,
          }
        : {}),
      ...(ultimos ? { recursos: ultimos, recursos_da_ultima: true } : {}),
      ...(!item.plano && item.cat
        ? {
            novo_no_plano: {
              descricao: item.cat.descricao,
              areas: [item.cat.area],
              indicador: item.cat.indicador,
            },
          }
        : {}),
    };
    let habilidades = registros;
    if (o.indicador?.tipo === 'habilidade' && !registroDe(o)) {
      const novo = criarRegistro(
        o.indicador.habilidade,
        o.indicador.lado,
        contexto
      );
      if (
        novo &&
        !registros.some((x) => chaveRegistro(x) === chaveRegistro(novo))
      )
        habilidades = [...registros, novo];
    }
    onChange({ objetivos_sessao: [...sessoes, s], habilidades });
  };

  const atualizarSessao = (antiga: ObjetivoSessao, nova: ObjetivoSessao) => {
    // Mexeu no que foi feito: deixa de ser a cópia da última sessão
    const n = { ...nova };
    if (n.recursos !== antiga.recursos) delete n.recursos_da_ultima;
    onChange({
      objetivos_sessao: sessoes.map((s) => (s === antiga ? n : s)),
    });
  };

  // Outra intervenção (fora de objetivo) e o quadro antigo, se veio de
  // rascunho do formato anterior
  const is = evolucao.intervencao_sessao || {};
  const quadroAntigo = [
    ...(is.finalidades || []).map((f) => FINALIDADE_POR_ID[f]?.nome ?? f),
    ...(is.regioes || []).map((r) => nomeDe(REGIOES, r)),
    ...(is.recursos || []).map((r) =>
      nomeDe([...RECURSOS, ...RECURSOS_ANTIGOS], r)
    ),
  ];

  const atualizarRegistro = (
    antigo: RegistroHabilidade,
    novo: RegistroHabilidade
  ) => {
    const r = antigo.lado !== novo.lado ? comComparacoes(novo, contexto) : novo;
    onChange({ habilidades: registros.map((x) => (x === antigo ? r : x)) });
  };

  // Habilidades registradas que nenhum objetivo de hoje usa (registros
  // antigos, de antes do 1.4): continuam visíveis para editar ou tirar
  const usadas = new Set(
    sessoes
      .map((s) => {
        const item = s.catalogo_id
          ? OBJETIVOS_CATALOGO.find((c) => c.id === s.catalogo_id)
          : ativos.find((o) => o.id === s.objetivo_id);
        const r = item
          ? registroDaHabilidade(item.indicador, registros)
          : undefined;
        return r ? chaveRegistro(r) : null;
      })
      .filter(Boolean) as string[]
  );
  const soltas = registros.filter((r) => !usadas.has(chaveRegistro(r)));

  // Medidas puxadas pelos objetivos de hoje
  const doDia = medidasDoDia(evolucao);
  const semSecao = doDia.filter((m) => !COM_SECAO.includes(m));
  const comSecao = doDia.filter((m) => COM_SECAO.includes(m));
  const setMedicao = (tipo: TipoMedidaMotora, m: MedicaoSessao | undefined) => {
    const novo = { ...(evolucao.medicoes || {}) };
    if (m) novo[tipo] = m;
    else delete novo[tipo];
    onChange({ medicoes: novo });
  };

  const areasOrdenadas = AREAS_MOTORAS.filter((a) => areas.includes(a.id));

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

      {areasOrdenadas.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Marque as áreas trabalhadas hoje (acima) para ver os objetivos.
        </p>
      )}

      {areasOrdenadas.map((area) => (
        <section key={area.id} className="space-y-2">
          <h3 className="font-semibold">{area.titulo}</h3>
          <div className="rounded-lg border divide-y">
            {itensDaArea(area.id).map((item) => {
              const sessao = sessaoDe(item);
              const o = sessao ? objetivoDe(item, sessao) : undefined;
              return (
                <div key={item.chave} className={cn(sessao && 'bg-primary/5')}>
                  <button
                    type="button"
                    aria-pressed={!!sessao}
                    disabled={disabled}
                    onClick={() => alternar(item)}
                    className="w-full text-left px-3 py-2.5 flex items-center gap-3 disabled:cursor-default"
                  >
                    <span
                      className={cn(
                        'h-5 w-5 shrink-0 rounded border-2 flex items-center justify-center',
                        sessao
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-muted-foreground/40'
                      )}
                      aria-hidden
                    >
                      {sessao && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="flex-1 min-w-0 text-sm">
                      {item.descricao}
                    </span>
                    {item.plano && (
                      <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                        no plano
                      </span>
                    )}
                  </button>
                  {sessao && o && (
                    <div className="px-3 pb-3">
                      <DetalheObjetivo
                        item={item}
                        objetivo={o}
                        evolucao={evolucao}
                        sessao={sessao}
                        registro={registroDe(o)}
                        onSessao={(n) => atualizarSessao(sessao, n)}
                        onRegistro={(r) => {
                          const antigo = registroDe(o);
                          if (antigo) atualizarRegistro(antigo, r);
                        }}
                        onEditar={() => item.plano && setEditor(item.plano)}
                        onStatus={async (st, motivo) => {
                          if (!item.plano || !ctx) return;
                          await ctx.mudarStatus(item.plano.id, st, motivo);
                          onChange({
                            objetivos_sessao: sessoes.filter(
                              (x) => x !== sessao
                            ),
                          });
                        }}
                        disabled={disabled}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Objetivo fora do catálogo */}
      {ctx && !ctx.erro && !disabled && areasOrdenadas.length > 0 && (
        <div className="space-y-3">
          {editor === null ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditor('novo')}
            >
              <Plus className="h-4 w-4 mr-1" />
              Outro objetivo
            </Button>
          ) : (
            <ObjetivoMotorEditor
              pacienteId={ctx.pacienteId}
              inicial={editor === 'novo' ? undefined : editor}
              areasSugeridas={areas}
              jaNoPlano={[
                ...ativos.map((o) => o.descricao),
                ...OBJETIVOS_CATALOGO.map((c) => c.descricao),
              ]}
              origem="evolucao"
              origemId={ctx.agendamentoId}
              onSalvar={async (o) => {
                await ctx.salvarObjetivo(o);
                setEditor(null);
              }}
              onCancelar={() => setEditor(null)}
            />
          )}
        </div>
      )}

      {areasOrdenadas.length > 0 && (
        <section className="space-y-2">
          <Label className="text-sm font-medium">
            Outra intervenção (opcional)
          </Label>
          {quadroAntigo.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Do rascunho anterior: {quadroAntigo.join(', ')}.
            </p>
          )}
          <Input
            value={is.detalhe ?? ''}
            onChange={(e) => {
              const n = { ...is };
              if (e.target.value) n.detalhe = e.target.value;
              else delete n.detalhe;
              onChange({ intervencao_sessao: n });
            }}
            placeholder="O que mais foi feito, fora dos objetivos acima"
            disabled={disabled}
          />
        </section>
      )}

      {/* Medidas dos objetivos de hoje */}
      {(semSecao.length > 0 || comSecao.length > 0) && (
        <section className="space-y-3">
          <h3 className="font-semibold">Medidas dos objetivos de hoje</h3>
          {comSecao.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {comSecao.map((m) => NOME_MEDIDA_MOTORA[m]).join(' e ')}{' '}
              {comSecao.length > 1 ? 'abrem' : 'abre'} nas próximas seções.
            </p>
          )}
          {semSecao.map((tipo) => (
            <MedicaoSessaoBloco
              key={tipo}
              tipo={tipo}
              valor={evolucao.medicoes?.[tipo]}
              onChange={(m) => setMedicao(tipo, m)}
              disabled={disabled}
            />
          ))}
        </section>
      )}

      {soltas.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-semibold">Outras habilidades registradas</h3>
          {soltas.map((r) => (
            <HabilidadeCard
              key={chaveRegistro(r)}
              registro={r}
              onChange={(novo) => atualizarRegistro(r, novo)}
              onRemover={() =>
                onChange({ habilidades: registros.filter((x) => x !== r) })
              }
              disabled={disabled}
            />
          ))}
        </section>
      )}
    </div>
  );
};
