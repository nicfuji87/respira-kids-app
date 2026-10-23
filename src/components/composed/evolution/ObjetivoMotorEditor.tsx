// Criar ou editar um objetivo do plano terapêutico motor. Usado na evolução,
// na ficha do paciente e na avaliação. Meta numérica e data-limite NÃO são
// obrigatórias: objetivo funcional pode ser só descrito.

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { chipClasse, selectClasse } from './estilos-motora';
import { AREAS_MOTORAS, type AreaMotora } from '@/types/evolucao-clinica';
import {
  GRUPOS_HABILIDADE,
  HABILIDADES,
  HABILIDADE_POR_ID,
  LADOS,
  MEDIDAS_INDICADOR,
  SUGESTOES_OBJETIVO,
  UNIDADE_METRICA,
  type IndicadorObjetivo,
  type LadoHabilidade,
  type MedidaIndicador,
  type MetricaHabilidade,
} from '@/lib/motora-catalogo';
import {
  infoIndicador,
  novoIdObjetivo,
  type ObjetivoMotor,
  type ObjetivoParaSalvar,
} from '@/lib/motora-plano';

const numOuNull = (s: string) => {
  if (s.trim() === '') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export interface ObjetivoMotorEditorProps {
  pacienteId: string;
  inicial?: ObjetivoMotor;
  areasSugeridas?: AreaMotora[];
  /** descrições dos objetivos ativos: a sugestão igual não aparece */
  jaNoPlano?: string[];
  origem: 'evolucao' | 'avaliacao' | 'plano';
  origemId?: string;
  onSalvar: (o: ObjetivoParaSalvar) => Promise<void>;
  onCancelar: () => void;
}

export const ObjetivoMotorEditor: React.FC<ObjetivoMotorEditorProps> = ({
  pacienteId,
  inicial,
  areasSugeridas = [],
  jaNoPlano = [],
  origem,
  origemId,
  onSalvar,
  onCancelar,
}) => {
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '');
  const [areas, setAreas] = useState<AreaMotora[]>(
    inicial?.areas ?? areasSugeridas
  );
  const ind0 = inicial?.indicador ?? null;
  const [tipoInd, setTipoInd] = useState<'nenhum' | 'habilidade' | 'medida'>(
    ind0?.tipo ?? 'nenhum'
  );
  const [habilidade, setHabilidade] = useState(
    ind0?.tipo === 'habilidade' ? ind0.habilidade : ''
  );
  const [metrica, setMetrica] = useState<MetricaHabilidade | ''>(
    ind0?.tipo === 'habilidade' ? (ind0.metrica ?? '') : ''
  );
  const [lado, setLado] = useState<LadoHabilidade | ''>(
    ind0?.tipo === 'habilidade' ? (ind0.lado ?? '') : ''
  );
  const [medida, setMedida] = useState<MedidaIndicador | ''>(
    ind0?.tipo === 'medida' ? ind0.medida : ''
  );
  const [meta, setMeta] = useState(
    inicial?.meta !== null && inicial?.meta !== undefined
      ? String(inicial.meta)
      : ''
  );
  const [metaTexto, setMetaTexto] = useState(inicial?.meta_texto ?? '');
  const [valorInicial, setValorInicial] = useState(
    inicial?.valor_inicial !== null && inicial?.valor_inicial !== undefined
      ? String(inicial.valor_inicial)
      : ''
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const indicador: IndicadorObjetivo | null = useMemo(() => {
    if (tipoInd === 'habilidade' && habilidade)
      return {
        tipo: 'habilidade',
        habilidade,
        ...(metrica ? { metrica } : {}),
        ...(lado ? { lado } : {}),
      };
    if (tipoInd === 'medida' && medida) return { tipo: 'medida', medida };
    return null;
  }, [tipoInd, habilidade, metrica, lado, medida]);
  const info = infoIndicador(indicador);
  const hab = habilidade ? HABILIDADE_POR_ID[habilidade] : undefined;

  const sugestoes = SUGESTOES_OBJETIVO.filter(
    (s) =>
      !jaNoPlano.some(
        (d) => d.trim().toLowerCase() === s.descricao.toLowerCase()
      ) &&
      (areasSugeridas.length === 0 ||
        s.areas.some((a) => areasSugeridas.includes(a)))
  );

  const aplicarSugestao = (i: number) => {
    const s = sugestoes[i];
    setDescricao(s.descricao);
    setAreas(
      s.areas.filter(
        (a) => areasSugeridas.length === 0 || areasSugeridas.includes(a)
      ).length
        ? s.areas.filter(
            (a) => areasSugeridas.length === 0 || areasSugeridas.includes(a)
          )
        : s.areas
    );
    const ind = s.indicador;
    setTipoInd(ind?.tipo ?? 'nenhum');
    setHabilidade(ind?.tipo === 'habilidade' ? ind.habilidade : '');
    setMetrica(ind?.tipo === 'habilidade' ? (ind.metrica ?? '') : '');
    setLado(ind?.tipo === 'habilidade' ? (ind.lado ?? '') : '');
    setMedida(ind?.tipo === 'medida' ? ind.medida : '');
  };

  const salvar = async () => {
    if (!descricao.trim()) {
      setErro('Descreva o objetivo.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar({
        id: inicial?.id ?? novoIdObjetivo(),
        ...(inicial
          ? {}
          : { paciente_id: pacienteId, origem, origem_id: origemId ?? null }),
        descricao: descricao.trim(),
        areas,
        indicador,
        meta: info?.numerico ? numOuNull(meta) : null,
        valor_inicial: info?.numerico ? numOuNull(valorInicial) : null,
        meta_texto: metaTexto.trim() || null,
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
      setSalvando(false);
    }
  };

  return (
    <div className="rounded-lg border p-3 space-y-4 bg-muted/20">
      {!inicial && (
        <div className="space-y-1.5">
          <Label className="text-sm">
            Sugestões (toque para usar e adaptar)
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {sugestoes.map((s, i) => (
              <button
                key={s.descricao}
                type="button"
                onClick={() => aplicarSugestao(i)}
                className={chipClasse(descricao === s.descricao)}
              >
                {s.descricao}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-sm">Objetivo</Label>
        <Input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Ex.: Melhorar o controle cervical em prono"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">Áreas</Label>
        <div className="flex flex-wrap gap-1.5">
          {AREAS_MOTORAS.map((a) => {
            const sel = areas.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={sel}
                onClick={() =>
                  setAreas(
                    sel ? areas.filter((x) => x !== a.id) : [...areas, a.id]
                  )
                }
                className={chipClasse(sel)}
              >
                {a.titulo}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">Como acompanhar</Label>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['nenhum', 'Só descrição'],
              ['habilidade', 'Por uma habilidade'],
              ['medida', 'Por uma medida'],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              aria-pressed={tipoInd === v}
              onClick={() => setTipoInd(v)}
              className={chipClasse(tipoInd === v)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {tipoInd === 'habilidade' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm sm:col-span-3">
            <span className="text-muted-foreground">Habilidade</span>
            <select
              className={selectClasse}
              value={habilidade}
              onChange={(e) => {
                setHabilidade(e.target.value);
                setMetrica('');
                setLado('');
              }}
            >
              <option value="">Escolha…</option>
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
          {hab && hab.metricas.length > 0 && (
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-muted-foreground">Número acompanhado</span>
              <select
                className={selectClasse}
                value={metrica}
                onChange={(e) =>
                  setMetrica(e.target.value as MetricaHabilidade | '')
                }
              >
                <option value="">Nenhum (estado da habilidade)</option>
                {hab.metricas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.rotulo}
                    {UNIDADE_METRICA[m.id] ? ` (${UNIDADE_METRICA[m.id]})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {hab?.porLado && (
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Lado</span>
              <select
                className={selectClasse}
                value={lado}
                onChange={(e) => setLado(e.target.value as LadoHabilidade | '')}
              >
                <option value="">Qualquer</option>
                {LADOS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.rotulo}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {tipoInd === 'medida' && (
        <label className="space-y-1 text-sm block">
          <span className="text-muted-foreground">Medida</span>
          <select
            className={selectClasse}
            value={medida}
            onChange={(e) => setMedida(e.target.value as MedidaIndicador | '')}
          >
            <option value="">Escolha…</option>
            {MEDIDAS_INDICADOR.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </label>
      )}

      {info?.numerico && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">
              Meta individualizada (opcional)
              {info.unidade ? `, em ${info.unidade}` : ''}
              {info.direcao === 'reduzir' ? ' — reduzir até' : ''}
            </span>
            <Input
              type="number"
              inputMode="decimal"
              value={meta}
              onChange={(e) => setMeta(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">
              Registro inicial (opcional; sem ele, vale o primeiro registro)
            </span>
            <Input
              type="number"
              inputMode="decimal"
              value={valorInicial}
              onChange={(e) => setValorInicial(e.target.value)}
            />
          </label>
        </div>
      )}

      <label className="space-y-1 text-sm block">
        <span className="text-muted-foreground">Meta descrita (opcional)</span>
        <Input
          value={metaTexto}
          onChange={(e) => setMetaTexto(e.target.value)}
          placeholder="Ex.: rolar para os dois lados sem assistência"
        />
      </label>

      {erro && <p className="text-sm text-destructive">{erro}</p>}
      <div className="flex flex-wrap gap-2 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onCancelar}
          disabled={salvando}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={salvar}
          disabled={salvando || !descricao.trim()}
        >
          {salvando
            ? 'Salvando…'
            : inicial
              ? 'Salvar objetivo'
              : 'Adicionar ao plano'}
        </Button>
      </div>
    </div>
  );
};
