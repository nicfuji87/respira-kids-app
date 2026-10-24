// Registro de habilidades motoras (mesmo catálogo na avaliação e na
// evolução): cartões das habilidades registradas, sugestões (objetivos,
// já acompanhadas e típicas da idade) e o catálogo completo.

import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Label } from '@/components/primitives/label';
import {
  GRUPOS_HABILIDADE,
  HABILIDADES,
  HABILIDADE_POR_ID,
  ROTULO_ESTADO,
} from '@/lib/motora-catalogo';
import {
  chaveRegistro,
  comComparacoes,
  criarRegistro,
  dataCurta,
  habilidadesSugeridas,
  nomeHabilidade,
  nomeRegistro,
  textoMetricasCurto,
  ultimosRegistros,
  type ContextoRegistro,
  type ObjetivoMotor,
} from '@/lib/motora-plano';
import type { AreaMotora, RegistroHabilidade } from '@/types/evolucao-clinica';
import { HabilidadeCard } from './HabilidadeCard';
import { selectClasse } from './estilos-motora';

export interface HabilidadesRegistroProps {
  registros: RegistroHabilidade[];
  onChange: (r: RegistroHabilidade[]) => void;
  contexto: ContextoRegistro;
  idadeMeses?: number;
  areas: AreaMotora[];
  objetivos?: Pick<ObjetivoMotor, 'status' | 'indicador'>[];
  disabled?: boolean;
  titulo?: string;
  vazio?: string;
}

export const HabilidadesRegistro: React.FC<HabilidadesRegistroProps> = ({
  registros,
  onChange,
  contexto,
  idadeMeses,
  areas,
  objetivos = [],
  disabled,
  titulo = 'Habilidades observadas hoje',
  vazio = 'Toque em uma habilidade abaixo para registrar. Só o que foi observado hoje.',
}) => {
  const [outra, setOutra] = useState('');
  const ultimos = useMemo(
    () =>
      ultimosRegistros(
        contexto.evolucoes,
        contexto.excluirAgendamentoId,
        contexto.ateData,
        contexto.excluirAvaliacaoId
      ),
    [contexto]
  );
  const sugeridas = habilidadesSugeridas({
    idadeMeses,
    areas,
    objetivos,
    ultimos,
  }).filter((id) => !registros.some((r) => r.habilidade === id));

  const adicionar = (id: string, lado?: RegistroHabilidade['lado']) => {
    const novo = criarRegistro(id, lado, contexto);
    if (!novo) return;
    if (registros.some((r) => chaveRegistro(r) === chaveRegistro(novo))) return;
    onChange([...registros, novo]);
  };

  const atualizar = (i: number, r: RegistroHabilidade) => {
    const antigo = registros[i];
    const novo =
      antigo && antigo.lado !== r.lado ? comComparacoes(r, contexto) : r;
    onChange(registros.map((x, j) => (j === i ? novo : x)));
  };

  return (
    <section className="space-y-3">
      <h3 className="font-semibold">{titulo}</h3>
      {registros.length === 0 && (
        <p className="text-sm text-muted-foreground">{vazio}</p>
      )}
      {registros.map((r, i) => (
        <HabilidadeCard
          key={chaveRegistro(r) + i}
          registro={r}
          onChange={(novo) => atualizar(i, novo)}
          onRemover={() => onChange(registros.filter((_, j) => j !== i))}
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
                [...ultimos.values()].find((x) => x.registro.habilidade === id);
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
  );
};
