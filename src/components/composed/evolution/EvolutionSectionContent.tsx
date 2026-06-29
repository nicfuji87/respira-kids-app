import React from 'react';
import { Label } from '@/components/primitives/label';
import { Textarea } from '@/components/primitives/textarea';
import { Input } from '@/components/primitives/input';
import { Checkbox } from '@/components/primitives/checkbox';
import { RadioButtonGroup } from '@/components/composed/evaluation/inputs/RadioButtonGroup';
import { BooleanToggle } from '@/components/composed/evaluation/inputs/BooleanToggle';
import { cn } from '@/lib/utils';
import type {
  TipoEvolucao,
  EvolucaoRespiratoria,
  EvolucaoMotoraAssimetria,
  EstadoGeralAntes,
  PadraoRespiratorio,
  SinaisDispneia,
  RitmoRespiratorio,
  AuscultaPulmonar,
  AuscultaHemitorax,
  IntervencaoRespiratoria,
  AvaliacaoRespiratoriaDepois,
  OrientacoesRespiratoria,
  CondutaRespiratoria,
  CraniometriaEvolucao,
  GoniometriaEvolucao,
  PalpacaoECOMEvolucao,
  ControleMotorEvolucao,
  IntervencaoMotoraAssimetria,
  RespostaIntervencaoMotora,
  OrientacoesMotoraAssimetria,
  CondutaMotoraAssimetria,
} from '@/types/evolucao-clinica';
import {
  calcularMetricasCraniometriaEvolucao,
  calcularClassificacaoClinica,
  getTextoClassificacaoClinica,
  getAvaliacaoRespiratoriaNormal,
} from '@/types/evolucao-clinica';

// AI dev note: EvolutionSectionContent - Renderiza conteúdo de cada seção da evolução
// Suporta evolução respiratória e motora/assimetria

// Constantes para Quadro Compatível Com (em ordem alfabética)
const QUADROS_COMPATIVEIS = [
  'Adenovírus',
  'Amigdalite / Faringite',
  'Asma (ou Bronquite Asmática)',
  'Bocavírus Humano',
  'Bronquiolite',
  'Coqueluche',
  'Coronavírus Sazonais (229E, NL63, OC43, HKU1)',
  'Gripe (Influenza)',
  'Hipertrofia de Adenoide (Carne esponjosa)',
  'Influenza A (H1N1, H3N2)',
  'Influenza B',
  'Laringite (Crupe)',
  'Metapneumovírus Humano',
  'Otite Média (Infecção de ouvido)',
  'Parainfluenza (Tipos 1, 2, 3 e 4)',
  'Pneumonia',
  'Resfriado Comum',
  'Rinite Alérgica',
  'Rinovírus / Enterovírus',
  'SARS-CoV-2 (COVID-19)',
  'Sinusite',
  'Vírus Sincicial Respiratório (VSR)',
];

// Constantes para Origem da Informação do Quadro
const ORIGENS_INFORMACAO_QUADRO = [
  'Diagnóstico médico informado',
  'Relato dos responsáveis',
  'Observação clínica durante avaliação',
  'Documento/exame apresentado',
  'Não informado',
];

interface EvolutionSectionContentProps {
  tipoEvolucao: TipoEvolucao;
  secaoId: string;
  evolucaoRespiratoria: EvolucaoRespiratoria;
  evolucaoMotora: EvolucaoMotoraAssimetria;
  onRespiratoriaChange: (updates: Partial<EvolucaoRespiratoria>) => void;
  onMotoraChange: (updates: Partial<EvolucaoMotoraAssimetria>) => void;
  disabled?: boolean;
}

// Componente auxiliar para campos
const Field: React.FC<{
  label: string;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
}> = ({ label, children, className, required }) => (
  <div className={cn('space-y-2', className)}>
    <Label className="text-sm font-medium">
      {label}
      {required && <span className="text-red-500 ml-1">*</span>}
    </Label>
    {children}
  </div>
);

// Componente auxiliar para checkbox
const CheckboxField: React.FC<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}> = ({ label, checked, onChange, disabled }) => (
  <div className="flex items-center gap-2">
    <Checkbox
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
    />
    <Label className="text-sm cursor-pointer">{label}</Label>
  </div>
);

// Componente auxiliar para BooleanToggle com label
const BooleanField: React.FC<{
  label: string;
  value: boolean | null | undefined;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
}> = ({ label, value, onChange, disabled, className }) => (
  <div
    className={cn(
      'flex items-center justify-between p-3 bg-muted/30 rounded-lg',
      className
    )}
  >
    <Label className="text-sm font-medium">{label}</Label>
    <BooleanToggle value={value} onChange={onChange} disabled={disabled} />
  </div>
);

export const EvolutionSectionContent: React.FC<
  EvolutionSectionContentProps
> = ({
  tipoEvolucao,
  secaoId,
  evolucaoRespiratoria,
  evolucaoMotora,
  onRespiratoriaChange,
  onMotoraChange,
  disabled = false,
}) => {
  // =========================================================================
  // EVOLUÇÃO RESPIRATÓRIA
  // =========================================================================

  if (tipoEvolucao === 'respiratoria') {
    const evolucao = evolucaoRespiratoria;

    switch (secaoId) {
      // -----------------------------------------------------------------
      // ESTADO GERAL (ANTES) - Consolidado: Queixa Principal + Sinais Vitais + Estado + Saturação
      // -----------------------------------------------------------------
      case 'estado_geral_antes': {
        const estado = evolucao.estado_geral_antes;

        const updateEstado = (updates: Partial<EstadoGeralAntes>) => {
          onRespiratoriaChange({
            estado_geral_antes: { ...estado, ...updates },
          });
        };

        // Temperatura: parte inteira/decimal p/ os chips de atalho (passo 0,1)
        const tempInt =
          estado.temperatura_aferida != null
            ? Math.floor(estado.temperatura_aferida)
            : null;
        const tempDec =
          estado.temperatura_aferida != null
            ? Math.round(
                (estado.temperatura_aferida -
                  Math.floor(estado.temperatura_aferida)) *
                  10
              )
            : null;

        return (
          <div className="space-y-8">
            {/* Explicação da seção */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <p className="text-sm text-purple-800">
                <strong>📋 Sobre esta seção:</strong> Registre aqui a avaliação
                inicial do profissional junto com os relatos do responsável
                sobre o estado da criança antes do atendimento.
              </p>
            </div>

            {/* 1️⃣ Estado Geral da Criança */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-purple-700">
                👶 Estado Geral da Criança
              </h4>

              {/* Nível de Consciência */}
              <Field label="Nível de Consciência" required>
                <RadioButtonGroup
                  value={estado.nivel_consciencia}
                  onChange={(v) => {
                    const val = v as 'acordado' | 'sonolento' | 'dormindo';
                    updateEstado({
                      nivel_consciencia: val,
                      // Limpa estado_acordado se não está acordado
                      estado_acordado:
                        val === 'acordado' ? estado.estado_acordado : null,
                    });
                  }}
                  options={[
                    { valor: 'acordado', label: '👁️ Acordado' },
                    { valor: 'sonolento', label: '😴 Sonolento' },
                    { valor: 'dormindo', label: '💤 Dormindo' },
                  ]}
                  disabled={disabled}
                />
              </Field>

              {/* Se acordado: Ativo ou Hipoativo */}
              {estado.nivel_consciencia === 'acordado' && (
                <div className="pl-4 border-l-2 border-purple-200">
                  <Field label="Estado" required>
                    <RadioButtonGroup
                      value={estado.estado_acordado}
                      onChange={(v) =>
                        updateEstado({
                          estado_acordado: v as 'ativo' | 'hipoativo',
                        })
                      }
                      options={[
                        { valor: 'ativo', label: '⚡ Ativo' },
                        { valor: 'hipoativo', label: '😶 Hipoativo' },
                      ]}
                      disabled={disabled}
                    />
                  </Field>
                </div>
              )}

              {/* Comportamento / Reação (múltipla escolha) */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Comportamento / Reação
                </label>
                <p className="text-xs text-gray-500">
                  Múltipla escolha - a criança pode apresentar mais de um
                  comportamento
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <CheckboxField
                    label="😊 Calmo"
                    checked={estado.comportamento_calmo || false}
                    onChange={(checked) =>
                      updateEstado({ comportamento_calmo: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="😤 Irritado"
                    checked={estado.comportamento_irritado || false}
                    onChange={(checked) =>
                      updateEstado({ comportamento_irritado: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="😢 Choroso"
                    checked={estado.comportamento_choroso || false}
                    onChange={(checked) =>
                      updateEstado({ comportamento_choroso: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="🏃 Agitado"
                    checked={estado.comportamento_agitado || false}
                    onChange={(checked) =>
                      updateEstado({ comportamento_agitado: checked })
                    }
                    disabled={disabled}
                  />
                </div>
              </div>
            </div>

            {/* 2️⃣ Sinais Vitais */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-red-700">🌡️ Sinais Vitais</h4>

              {/* Temperatura — chips de atalho em 2 níveis (inteiro + decimal),
                  passo 0,1; input preciso continua p/ edição direta */}
              <Field label="Temperatura (°C)">
                <div className="flex flex-wrap items-center gap-2">
                  <RadioButtonGroup
                    value={tempInt != null ? String(tempInt) : null}
                    onChange={(v) => {
                      const dec =
                        estado.temperatura_aferida != null
                          ? estado.temperatura_aferida % 1
                          : 0;
                      updateEstado({
                        temperatura_aferida: Number(
                          (Number(v) + dec).toFixed(1)
                        ),
                        temperatura_nao_aferida: false,
                      });
                    }}
                    options={[
                      { valor: '35', label: '35' },
                      { valor: '36', label: '36' },
                      { valor: '37', label: '37' },
                      { valor: '38', label: '38' },
                      { valor: '39', label: '39' },
                      { valor: '40', label: '40' },
                      { valor: '41', label: '41' },
                    ]}
                    size="sm"
                    disabled={disabled || estado.temperatura_nao_aferida}
                  />
                  <span className="text-sm text-gray-400">,</span>
                  <RadioButtonGroup
                    value={tempDec != null ? String(tempDec) : null}
                    onChange={(v) => {
                      const intPart =
                        estado.temperatura_aferida != null
                          ? Math.floor(estado.temperatura_aferida)
                          : 36;
                      updateEstado({
                        temperatura_aferida: Number(
                          (intPart + Number(v) / 10).toFixed(1)
                        ),
                        temperatura_nao_aferida: false,
                      });
                    }}
                    options={[
                      { valor: '0', label: ',0' },
                      { valor: '1', label: ',1' },
                      { valor: '2', label: ',2' },
                      { valor: '3', label: ',3' },
                      { valor: '4', label: ',4' },
                      { valor: '5', label: ',5' },
                      { valor: '6', label: ',6' },
                      { valor: '7', label: ',7' },
                      { valor: '8', label: ',8' },
                      { valor: '9', label: ',9' },
                    ]}
                    size="sm"
                    disabled={disabled || estado.temperatura_nao_aferida}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={35}
                    max={42}
                    step={0.1}
                    value={estado.temperatura_aferida || ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9.]/g, '');
                      updateEstado({
                        temperatura_aferida: value ? Number(value) : undefined,
                        temperatura_nao_aferida: value
                          ? false
                          : estado.temperatura_nao_aferida,
                      });
                    }}
                    placeholder="36.5"
                    disabled={disabled || estado.temperatura_nao_aferida}
                    className="w-full sm:w-32"
                  />
                  <CheckboxField
                    label="Não aferida"
                    checked={estado.temperatura_nao_aferida || false}
                    onChange={(checked) =>
                      updateEstado({
                        temperatura_nao_aferida: checked,
                        temperatura_aferida: checked
                          ? undefined
                          : estado.temperatura_aferida,
                      })
                    }
                    disabled={disabled}
                  />
                </div>
              </Field>

              <Field label="FC (bpm)">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={40}
                  max={220}
                  value={estado.frequencia_cardiaca || ''}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    updateEstado({
                      frequencia_cardiaca: value ? Number(value) : undefined,
                    });
                  }}
                  placeholder="120"
                  disabled={disabled}
                  className="w-full sm:w-32"
                />
              </Field>

              {/* SpO₂ com chips de atalho + campo p/ valores fora da faixa */}
              <Field label="SpO₂ (%) (inicial)">
                <RadioButtonGroup
                  value={
                    estado.saturacao_o2 != null
                      ? String(estado.saturacao_o2)
                      : null
                  }
                  onChange={(v) =>
                    updateEstado({
                      saturacao_o2: Number(v),
                      saturacao_nao_aferida: false,
                    })
                  }
                  options={[
                    { valor: '94', label: '94' },
                    { valor: '95', label: '95' },
                    { valor: '96', label: '96' },
                    { valor: '97', label: '97' },
                    { valor: '98', label: '98' },
                    { valor: '99', label: '99' },
                    { valor: '100', label: '100' },
                  ]}
                  size="sm"
                  disabled={disabled || estado.saturacao_nao_aferida}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    value={estado.saturacao_o2 || ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '');
                      updateEstado({
                        saturacao_o2: value ? Number(value) : undefined,
                        saturacao_nao_aferida: value
                          ? false
                          : estado.saturacao_nao_aferida,
                      });
                    }}
                    placeholder="Outro valor"
                    disabled={disabled || estado.saturacao_nao_aferida}
                    className="w-full sm:w-40"
                  />
                  <CheckboxField
                    label="Não aferida"
                    checked={estado.saturacao_nao_aferida || false}
                    onChange={(checked) =>
                      updateEstado({
                        saturacao_nao_aferida: checked,
                        saturacao_o2: checked ? undefined : estado.saturacao_o2,
                      })
                    }
                    disabled={disabled}
                  />
                </div>
              </Field>

              {/* Suporte de O2 condicional */}
              <div className="space-y-3">
                <CheckboxField
                  label="Necessita de suporte de O₂?"
                  checked={estado.necessita_suporte_o2 || false}
                  onChange={(checked) => {
                    updateEstado({
                      necessita_suporte_o2: checked,
                      saturacao_com_suporte: checked
                        ? estado.saturacao_com_suporte
                        : undefined,
                    });
                  }}
                  disabled={disabled}
                />
                {estado.necessita_suporte_o2 && (
                  <div className="pl-4 border-l-2 border-red-200">
                    <Field label="SpO₂ c/ Suporte (%)">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        value={estado.saturacao_com_suporte || ''}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9]/g, '');
                          updateEstado({
                            saturacao_com_suporte: value
                              ? Number(value)
                              : undefined,
                          });
                        }}
                        placeholder="99"
                        disabled={disabled}
                        className="w-full sm:w-32"
                      />
                    </Field>
                  </div>
                )}
              </div>
            </div>

            {/* 3️⃣ Contexto Clínico Recente */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-indigo-700">
                🏥 Contexto Clínico Recente{' '}
                <span className="text-sm font-normal text-gray-500">
                  (relato do responsável)
                </span>
              </h4>
              <p className="text-sm text-gray-500">
                Fatores que ajudam na interpretação do quadro
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CheckboxField
                  label="Infecção respiratória recente"
                  checked={estado.infeccao_recente || false}
                  onChange={(checked) =>
                    updateEstado({ infeccao_recente: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Episódios recorrentes de sibilância"
                  checked={estado.episodios_recorrentes_sibilancia || false}
                  onChange={(checked) =>
                    updateEstado({ episodios_recorrentes_sibilancia: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Contato recente com pessoas sintomáticas"
                  checked={estado.contato_pessoas_sintomaticas || false}
                  onChange={(checked) =>
                    updateEstado({ contato_pessoas_sintomaticas: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Uso recente de medicação respiratória"
                  checked={estado.uso_medicacao_respiratoria || false}
                  onChange={(checked) =>
                    updateEstado({ uso_medicacao_respiratoria: checked })
                  }
                  disabled={disabled}
                />
              </div>

              <Field label="Início dos sintomas há (dias)">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={365}
                  value={estado.inicio_sintomas_dias || ''}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    updateEstado({
                      inicio_sintomas_dias: value ? Number(value) : undefined,
                    });
                  }}
                  placeholder="Ex: 3"
                  disabled={disabled}
                  className="w-full sm:w-32"
                />
              </Field>

              {/* Quadro Compatível Com */}
              <Field label="Quadro Compatível com (múltipla escolha)">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto p-2 border rounded-lg bg-muted/20">
                  {QUADROS_COMPATIVEIS.map((quadro) => (
                    <CheckboxField
                      key={quadro}
                      label={quadro}
                      checked={
                        estado.quadro_compativel_com?.includes(quadro) || false
                      }
                      onChange={(checked) => {
                        const atual = estado.quadro_compativel_com || [];
                        const novos = checked
                          ? [...atual, quadro]
                          : atual.filter((q) => q !== quadro);
                        updateEstado({ quadro_compativel_com: novos });
                      }}
                      disabled={disabled}
                    />
                  ))}
                </div>
              </Field>

              {/* Origem da Informação do Quadro */}
              <Field label="Origem da Informação do Quadro">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ORIGENS_INFORMACAO_QUADRO.map((origem) => (
                    <CheckboxField
                      key={origem}
                      label={origem}
                      checked={
                        estado.origem_informacao_quadro?.includes(origem) ||
                        false
                      }
                      onChange={(checked) => {
                        const atual = estado.origem_informacao_quadro || [];
                        const novos = checked
                          ? [...atual, origem]
                          : atual.filter((o) => o !== origem);
                        updateEstado({ origem_informacao_quadro: novos });
                      }}
                      disabled={disabled}
                    />
                  ))}
                </div>
              </Field>
            </div>

            {/* 4️⃣ Repercussões Funcionais */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-yellow-700">
                📋 Repercussões Funcionais{' '}
                <span className="text-sm font-normal text-gray-500">
                  (relato do responsável)
                </span>
              </h4>
              <p className="text-sm text-gray-500">
                Impacto dos sintomas no dia a dia
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CheckboxField
                  label="Dificuldade alimentar"
                  checked={estado.dificuldade_alimentar || false}
                  onChange={(checked) =>
                    updateEstado({ dificuldade_alimentar: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Interrupções do sono"
                  checked={estado.interrupcoes_sono || false}
                  onChange={(checked) =>
                    updateEstado({ interrupcoes_sono: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Piora noturna dos sintomas"
                  checked={estado.piora_noturna || false}
                  onChange={(checked) =>
                    updateEstado({ piora_noturna: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Irritabilidade associada à respiração"
                  checked={estado.irritabilidade_respiratoria || false}
                  onChange={(checked) =>
                    updateEstado({ irritabilidade_respiratoria: checked })
                  }
                  disabled={disabled}
                />
              </div>
            </div>

            {/* 5️⃣ Sinais e Sintomas Respiratórios (tosse unificada) */}
            {/* AI dev note: Tosse antes ficava duplicada (checkbox em "Sinais
                Associados" + radio em "Sintomas Respiratórios"). Consolidado em
                um único controle com a cascata de tosse produtiva. */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-orange-700">
                ⚠️ Sinais e Sintomas Respiratórios
              </h4>

              <Field label="Tosse">
                <RadioButtonGroup
                  value={estado.tosse}
                  onChange={(v) => {
                    const val = v as 'ausente' | 'seca' | 'produtiva';
                    updateEstado({
                      tosse: val,
                      // Limpa campos dependentes se não for produtiva
                      tosse_eficacia:
                        val === 'produtiva' ? estado.tosse_eficacia : null,
                      tosse_destino:
                        val === 'produtiva' ? estado.tosse_destino : null,
                      secrecao_cor:
                        val === 'produtiva' ? estado.secrecao_cor : null,
                      secrecao_quantidade:
                        val === 'produtiva' ? estado.secrecao_quantidade : null,
                    });
                  }}
                  options={[
                    { valor: 'ausente', label: '✅ Ausente' },
                    { valor: 'seca', label: '🫁 Seca' },
                    { valor: 'produtiva', label: '💧 Produtiva' },
                  ]}
                  disabled={disabled}
                />
              </Field>

              {/* Se produtiva: eficaz ou ineficaz */}
              {estado.tosse === 'produtiva' && (
                <div className="pl-4 border-l-2 border-blue-200 space-y-4">
                  <Field label="Eficácia da Tosse" required>
                    <RadioButtonGroup
                      value={estado.tosse_eficacia}
                      onChange={(v) => {
                        const val = v as 'eficaz' | 'ineficaz';
                        updateEstado({
                          tosse_eficacia: val,
                          // Limpa campos dependentes se não for eficaz
                          tosse_destino:
                            val === 'eficaz' ? estado.tosse_destino : null,
                          secrecao_cor:
                            val === 'eficaz' &&
                            estado.tosse_destino === 'expectoracao'
                              ? estado.secrecao_cor
                              : null,
                          secrecao_quantidade:
                            val === 'eficaz' &&
                            estado.tosse_destino === 'expectoracao'
                              ? estado.secrecao_quantidade
                              : null,
                        });
                      }}
                      options={[
                        { valor: 'eficaz', label: '✅ Eficaz' },
                        { valor: 'ineficaz', label: '❌ Ineficaz' },
                      ]}
                      disabled={disabled}
                    />
                  </Field>

                  {/* Se eficaz: deglutição ou expectoração */}
                  {estado.tosse_eficacia === 'eficaz' && (
                    <div className="pl-4 border-l-2 border-blue-300 space-y-4">
                      <Field label="Destino da Secreção" required>
                        <RadioButtonGroup
                          value={estado.tosse_destino}
                          onChange={(v) => {
                            const val = v as 'degluticao' | 'expectoracao';
                            updateEstado({
                              tosse_destino: val,
                              // Limpa campos de secreção se não for expectoração
                              secrecao_cor:
                                val === 'expectoracao'
                                  ? estado.secrecao_cor
                                  : null,
                              secrecao_quantidade:
                                val === 'expectoracao'
                                  ? estado.secrecao_quantidade
                                  : null,
                            });
                          }}
                          options={[
                            { valor: 'degluticao', label: '😮‍💨 Deglutição' },
                            { valor: 'expectoracao', label: '💧 Expectoração' },
                          ]}
                          disabled={disabled}
                        />
                      </Field>

                      {/* Se expectoração: cor e quantidade */}
                      {estado.tosse_destino === 'expectoracao' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-4 border-l-2 border-blue-400">
                          <Field label="Cor da Secreção">
                            <RadioButtonGroup
                              value={estado.secrecao_cor}
                              onChange={(v) =>
                                updateEstado({
                                  secrecao_cor: v as
                                    | 'clara'
                                    | 'amarelada'
                                    | 'esverdeada',
                                })
                              }
                              options={[
                                { valor: 'clara', label: '⚪ Clara' },
                                { valor: 'amarelada', label: '🟡 Amarelada' },
                                { valor: 'esverdeada', label: '🟢 Esverdeada' },
                              ]}
                              disabled={disabled}
                            />
                          </Field>
                          <Field label="Quantidade">
                            <RadioButtonGroup
                              value={estado.secrecao_quantidade}
                              onChange={(v) =>
                                updateEstado({
                                  secrecao_quantidade: v as
                                    | 'pouca'
                                    | 'moderada'
                                    | 'abundante',
                                })
                              }
                              options={[
                                { valor: 'pouca', label: 'Pouca' },
                                { valor: 'moderada', label: 'Moderada' },
                                { valor: 'abundante', label: 'Abundante' },
                              ]}
                              disabled={disabled}
                            />
                          </Field>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Outros sinais (relato do responsável) */}
              <div className="space-y-2 border-t pt-4">
                <label className="text-sm font-medium">
                  Outros sinais{' '}
                  <span className="text-sm font-normal text-gray-500">
                    (relato do responsável)
                  </span>
                </label>
                <p className="text-xs text-gray-500">
                  Podem coexistir com qualquer tipo de tosse
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <CheckboxField
                    label="Sibilo referido pelos responsáveis"
                    checked={estado.chiado_referido || false}
                    onChange={(checked) =>
                      updateEstado({ chiado_referido: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Cansaço respiratório"
                    checked={estado.cansaco_respiratorio || false}
                    onChange={(checked) =>
                      updateEstado({ cansaco_respiratorio: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Esforço respiratório percebido"
                    checked={estado.esforco_respiratorio || false}
                    onChange={(checked) =>
                      updateEstado({ esforco_respiratorio: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Respiração ruidosa"
                    checked={estado.respiracao_ruidosa || false}
                    onChange={(checked) =>
                      updateEstado({ respiracao_ruidosa: checked })
                    }
                    disabled={disabled}
                  />
                </div>
              </div>
            </div>

            {/* Observações Gerais */}
            <Field label="Observações Gerais">
              <Textarea
                value={estado.observacoes || ''}
                onChange={(e) => updateEstado({ observacoes: e.target.value })}
                placeholder="Observações adicionais sobre o estado geral da criança..."
                disabled={disabled}
                rows={2}
              />
            </Field>
          </div>
        );
      }

      // -----------------------------------------------------------------
      // AVALIAÇÃO RESPIRATÓRIA (SEM TEMPERATURA E SATURAÇÃO - MOVIDOS PARA ESTADO GERAL)
      // -----------------------------------------------------------------
      case 'avaliacao_antes': {
        const avaliacao = evolucao.avaliacao_antes;

        const updatePadrao = (updates: Partial<PadraoRespiratorio>) => {
          const novoPadrao = {
            ...avaliacao.padrao_respiratorio,
            ...updates,
          };
          // Calcula classificação automaticamente
          const classificacao = calcularClassificacaoClinica(
            novoPadrao.ritmo_respiratorio,
            novoPadrao.dispneia
          );
          onRespiratoriaChange({
            avaliacao_antes: {
              ...avaliacao,
              padrao_respiratorio: {
                ...novoPadrao,
                classificacao_clinica: classificacao,
              },
            },
          });
        };

        const updateSinais = (updates: Partial<SinaisDispneia>) => {
          onRespiratoriaChange({
            avaliacao_antes: {
              ...avaliacao,
              sinais_dispneia: {
                ...avaliacao.sinais_dispneia,
                ...updates,
              },
            },
          });
        };

        const updateAusculta = (updates: Partial<AuscultaPulmonar>) => {
          onRespiratoriaChange({
            avaliacao_antes: {
              ...avaliacao,
              ausculta: { ...avaliacao.ausculta, ...updates },
            },
          });
        };

        const updateHemitoraxDireito = (
          updates: Partial<AuscultaHemitorax>
        ) => {
          onRespiratoriaChange({
            avaliacao_antes: {
              ...avaliacao,
              ausculta: {
                ...avaliacao.ausculta,
                hemitorax_direito: {
                  ...avaliacao.ausculta.hemitorax_direito,
                  ...updates,
                },
              },
            },
          });
        };

        const updateHemitoraxEsquerdo = (
          updates: Partial<AuscultaHemitorax>
        ) => {
          onRespiratoriaChange({
            avaliacao_antes: {
              ...avaliacao,
              ausculta: {
                ...avaliacao.ausculta,
                hemitorax_esquerdo: {
                  ...avaliacao.ausculta.hemitorax_esquerdo,
                  ...updates,
                },
              },
            },
          });
        };

        // Texto descritivo da classificação
        const classificacaoTexto = avaliacao.padrao_respiratorio
          .classificacao_clinica
          ? getTextoClassificacaoClinica(
              avaliacao.padrao_respiratorio.classificacao_clinica
            )
          : null;

        return (
          <div className="space-y-8">
            {/* Atalho: exame normal (charting by exception) */}
            {!disabled && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() =>
                    onRespiratoriaChange({
                      avaliacao_antes: getAvaliacaoRespiratoriaNormal(),
                    })
                  }
                  className="w-full rounded-lg border-2 border-green-300 bg-green-50 py-2.5 text-sm font-medium text-green-800 transition-colors hover:bg-green-100"
                >
                  ✅ Marcar exame respiratório normal
                </button>
                <p className="text-xs text-gray-500">
                  Preenche eupneico, MV preservado bilateral, sem ruídos e sem
                  dispneia. Depois é só ajustar as exceções.
                </p>
              </div>
            )}

            {/* Padrão Respiratório */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-blue-700">
                🔹 Padrão Respiratório
              </h4>

              <Field label="Tipo">
                <RadioButtonGroup
                  value={avaliacao.padrao_respiratorio.tipo}
                  onChange={(v) =>
                    updatePadrao({ tipo: v as 'nasal' | 'oral' | 'misto' })
                  }
                  options={[
                    { valor: 'nasal', label: 'Nasal' },
                    { valor: 'oral', label: 'Oral' },
                    { valor: 'misto', label: 'Misto' },
                  ]}
                  disabled={disabled}
                />
              </Field>

              <Field label="Ritmo Respiratório" required>
                <RadioButtonGroup
                  value={avaliacao.padrao_respiratorio.ritmo_respiratorio}
                  onChange={(v) =>
                    updatePadrao({ ritmo_respiratorio: v as RitmoRespiratorio })
                  }
                  options={[
                    { valor: 'eupneico', label: '✅ Eupneico (Normal)' },
                    {
                      valor: 'bradipneico',
                      label: '🔵 Bradipneico (FR Baixa)',
                    },
                    { valor: 'taquipneico', label: '🟠 Taquipneico (FR Alta)' },
                  ]}
                  disabled={disabled}
                />
              </Field>

              <BooleanField
                label="Presença de Dispneia (Sinais de Esforço)"
                value={avaliacao.padrao_respiratorio.dispneia}
                onChange={(checked) => updatePadrao({ dispneia: checked })}
                disabled={disabled}
              />
            </div>

            {/* Sinais de Dispneia - Só aparecem se dispneia = true */}
            {avaliacao.padrao_respiratorio.dispneia && (
              <div className="border rounded-lg p-4 space-y-4 bg-orange-50">
                <h4 className="font-medium text-orange-700">
                  ⚠️ Sinais Associados à Dispneia
                </h4>
                <p className="text-sm text-orange-600 mb-4">
                  Selecione os sinais de esforço respiratório observados:
                </p>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <CheckboxField
                    label="Uso de Musculatura Acessória"
                    checked={
                      avaliacao.sinais_dispneia.uso_musculatura_acessoria
                    }
                    onChange={(checked) =>
                      updateSinais({ uso_musculatura_acessoria: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Batimento de Asa Nasal"
                    checked={avaliacao.sinais_dispneia.batimento_asa_nasal}
                    onChange={(checked) =>
                      updateSinais({ batimento_asa_nasal: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Tiragem Intercostal"
                    checked={avaliacao.sinais_dispneia.tiragem_intercostal}
                    onChange={(checked) =>
                      updateSinais({ tiragem_intercostal: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Tiragem Subcostal"
                    checked={avaliacao.sinais_dispneia.tiragem_subcostal}
                    onChange={(checked) =>
                      updateSinais({ tiragem_subcostal: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Tiragem Supraclavicular"
                    checked={avaliacao.sinais_dispneia.tiragem_supraclavicular}
                    onChange={(checked) =>
                      updateSinais({ tiragem_supraclavicular: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Retração de Fúrcula"
                    checked={avaliacao.sinais_dispneia.retracao_furcula}
                    onChange={(checked) =>
                      updateSinais({ retracao_furcula: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Gemência"
                    checked={avaliacao.sinais_dispneia.gemencia}
                    onChange={(checked) => updateSinais({ gemencia: checked })}
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Postura Antálgica"
                    checked={avaliacao.sinais_dispneia.postura_antalgica}
                    onChange={(checked) =>
                      updateSinais({ postura_antalgica: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Tempo Expiratório Prolongado"
                    checked={
                      avaliacao.sinais_dispneia.tempo_expiratorio_prolongado
                    }
                    onChange={(checked) =>
                      updateSinais({ tempo_expiratorio_prolongado: checked })
                    }
                    disabled={disabled}
                  />
                </div>
              </div>
            )}

            {/* Classificação Clínica Automática */}
            {avaliacao.padrao_respiratorio.ritmo_respiratorio && (
              <div
                className={cn(
                  'border rounded-lg p-4 space-y-2',
                  avaliacao.padrao_respiratorio.classificacao_clinica ===
                    'taquidispneico'
                    ? 'bg-red-50 border-red-300'
                    : avaliacao.padrao_respiratorio.classificacao_clinica ===
                        'taquipneico_sem_dispneia'
                      ? 'bg-orange-50 border-orange-300'
                      : avaliacao.padrao_respiratorio.classificacao_clinica ===
                          'dispneico_sem_taquipneia'
                        ? 'bg-yellow-50 border-yellow-300'
                        : 'bg-green-50 border-green-300'
                )}
              >
                <h4 className="font-medium flex items-center gap-2">
                  📋 Classificação Clínica (Automática)
                </h4>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'px-3 py-1 rounded-full text-sm font-semibold',
                      avaliacao.padrao_respiratorio.classificacao_clinica ===
                        'taquidispneico'
                        ? 'bg-red-200 text-red-800'
                        : avaliacao.padrao_respiratorio
                              .classificacao_clinica ===
                            'taquipneico_sem_dispneia'
                          ? 'bg-orange-200 text-orange-800'
                          : avaliacao.padrao_respiratorio
                                .classificacao_clinica ===
                              'dispneico_sem_taquipneia'
                            ? 'bg-yellow-200 text-yellow-800'
                            : 'bg-green-200 text-green-800'
                    )}
                  >
                    {avaliacao.padrao_respiratorio.classificacao_clinica ===
                      'taquidispneico' && '🔴 Taquidispneico'}
                    {avaliacao.padrao_respiratorio.classificacao_clinica ===
                      'taquipneico_sem_dispneia' &&
                      '🟠 Taquipneico sem Dispneia'}
                    {avaliacao.padrao_respiratorio.classificacao_clinica ===
                      'dispneico_sem_taquipneia' &&
                      '🟡 Dispneico sem Taquipneia'}
                    {avaliacao.padrao_respiratorio.classificacao_clinica ===
                      'normal' && '🟢 Normal'}
                  </span>
                </div>
                {classificacaoTexto && (
                  <p className="text-sm text-muted-foreground italic mt-2">
                    {classificacaoTexto}
                  </p>
                )}
                <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                  <strong>Legenda:</strong> Taquipneia = frequência elevada |
                  Dispneia = esforço | Taquidispneia = frequência + esforço
                </div>
              </div>
            )}

            {/* Ausculta Pulmonar por Hemitórax */}
            <div className="border rounded-lg p-4 space-y-6">
              <h4 className="font-medium text-purple-700">
                🩺 Ausculta Pulmonar
              </h4>
              <p className="text-sm text-gray-500">
                Avaliação separada por hemitórax
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Hemitórax Direito */}
                <div className="border rounded-lg p-4 space-y-4 bg-blue-50/50">
                  <h5 className="font-medium text-blue-700">
                    🫁 Hemitórax Direito
                  </h5>

                  <Field label="Murmúrio Vesicular">
                    <RadioButtonGroup
                      value={
                        avaliacao.ausculta.hemitorax_direito.murmurio_vesicular
                      }
                      onChange={(v) =>
                        updateHemitoraxDireito({
                          murmurio_vesicular: v as
                            | 'preservado'
                            | 'diminuido'
                            | 'abolido',
                        })
                      }
                      options={[
                        { valor: 'preservado', label: '✅ Preservado' },
                        { valor: 'diminuido', label: '⚠️ Diminuído' },
                        { valor: 'abolido', label: '❌ Abolido' },
                      ]}
                      disabled={disabled}
                    />
                  </Field>

                  <div className="space-y-2">
                    <span className="text-sm font-medium">
                      Ruídos Adventícios
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <CheckboxField
                        label="Ausentes"
                        checked={
                          avaliacao.ausculta.hemitorax_direito
                            .ruidos_ausentes || false
                        }
                        onChange={(checked) =>
                          updateHemitoraxDireito({
                            ruidos_ausentes: checked,
                            sibilos: checked
                              ? false
                              : avaliacao.ausculta.hemitorax_direito.sibilos,
                            roncos: checked
                              ? false
                              : avaliacao.ausculta.hemitorax_direito.roncos,
                            estertores_finos: checked
                              ? false
                              : avaliacao.ausculta.hemitorax_direito
                                  .estertores_finos,
                            estertores_grossos: checked
                              ? false
                              : avaliacao.ausculta.hemitorax_direito
                                  .estertores_grossos,
                          })
                        }
                        disabled={disabled}
                      />
                      <CheckboxField
                        label="Sibilos"
                        checked={
                          avaliacao.ausculta.hemitorax_direito.sibilos || false
                        }
                        onChange={(checked) =>
                          updateHemitoraxDireito({
                            sibilos: checked,
                            ruidos_ausentes: false,
                          })
                        }
                        disabled={disabled}
                      />
                      <CheckboxField
                        label="Roncos"
                        checked={
                          avaliacao.ausculta.hemitorax_direito.roncos || false
                        }
                        onChange={(checked) =>
                          updateHemitoraxDireito({
                            roncos: checked,
                            ruidos_ausentes: false,
                          })
                        }
                        disabled={disabled}
                      />
                      <CheckboxField
                        label="Roncos de Transmissão"
                        checked={
                          avaliacao.ausculta.hemitorax_direito
                            .roncos_transmissao || false
                        }
                        onChange={(checked) =>
                          updateHemitoraxDireito({
                            roncos_transmissao: checked,
                            ruidos_ausentes: false,
                          })
                        }
                        disabled={disabled}
                      />
                      <CheckboxField
                        label="Estertores finos"
                        checked={
                          avaliacao.ausculta.hemitorax_direito
                            .estertores_finos || false
                        }
                        onChange={(checked) =>
                          updateHemitoraxDireito({
                            estertores_finos: checked,
                            ruidos_ausentes: false,
                          })
                        }
                        disabled={disabled}
                      />
                      <CheckboxField
                        label="Estertores grossos"
                        checked={
                          avaliacao.ausculta.hemitorax_direito
                            .estertores_grossos || false
                        }
                        onChange={(checked) =>
                          updateHemitoraxDireito({
                            estertores_grossos: checked,
                            ruidos_ausentes: false,
                          })
                        }
                        disabled={disabled}
                      />
                    </div>
                  </div>

                  {!avaliacao.ausculta.hemitorax_direito.ruidos_ausentes && (
                    <div className="space-y-2">
                      <span className="text-sm font-medium">
                        📍 Localização
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <CheckboxField
                          label="Difusos"
                          checked={
                            avaliacao.ausculta.hemitorax_direito
                              .localizacao_difusos || false
                          }
                          onChange={(checked) =>
                            updateHemitoraxDireito({
                              localizacao_difusos: checked,
                            })
                          }
                          disabled={disabled}
                        />
                        <CheckboxField
                          label="Ápice"
                          checked={
                            avaliacao.ausculta.hemitorax_direito
                              .localizacao_apice || false
                          }
                          onChange={(checked) =>
                            updateHemitoraxDireito({
                              localizacao_apice: checked,
                            })
                          }
                          disabled={disabled}
                        />
                        <CheckboxField
                          label="Terço Médio"
                          checked={
                            avaliacao.ausculta.hemitorax_direito
                              .localizacao_terco_medio || false
                          }
                          onChange={(checked) =>
                            updateHemitoraxDireito({
                              localizacao_terco_medio: checked,
                            })
                          }
                          disabled={disabled}
                        />
                        <CheckboxField
                          label="Base"
                          checked={
                            avaliacao.ausculta.hemitorax_direito
                              .localizacao_base || false
                          }
                          onChange={(checked) =>
                            updateHemitoraxDireito({
                              localizacao_base: checked,
                            })
                          }
                          disabled={disabled}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Hemitórax Esquerdo */}
                <div className="border rounded-lg p-4 space-y-4 bg-green-50/50">
                  <h5 className="font-medium text-green-700">
                    🫁 Hemitórax Esquerdo
                  </h5>

                  <Field label="Murmúrio Vesicular">
                    <RadioButtonGroup
                      value={
                        avaliacao.ausculta.hemitorax_esquerdo.murmurio_vesicular
                      }
                      onChange={(v) =>
                        updateHemitoraxEsquerdo({
                          murmurio_vesicular: v as
                            | 'preservado'
                            | 'diminuido'
                            | 'abolido',
                        })
                      }
                      options={[
                        { valor: 'preservado', label: '✅ Preservado' },
                        { valor: 'diminuido', label: '⚠️ Diminuído' },
                        { valor: 'abolido', label: '❌ Abolido' },
                      ]}
                      disabled={disabled}
                    />
                  </Field>

                  <div className="space-y-2">
                    <span className="text-sm font-medium">
                      Ruídos Adventícios
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <CheckboxField
                        label="Ausentes"
                        checked={
                          avaliacao.ausculta.hemitorax_esquerdo
                            .ruidos_ausentes || false
                        }
                        onChange={(checked) =>
                          updateHemitoraxEsquerdo({
                            ruidos_ausentes: checked,
                            sibilos: checked
                              ? false
                              : avaliacao.ausculta.hemitorax_esquerdo.sibilos,
                            roncos: checked
                              ? false
                              : avaliacao.ausculta.hemitorax_esquerdo.roncos,
                            estertores_finos: checked
                              ? false
                              : avaliacao.ausculta.hemitorax_esquerdo
                                  .estertores_finos,
                            estertores_grossos: checked
                              ? false
                              : avaliacao.ausculta.hemitorax_esquerdo
                                  .estertores_grossos,
                          })
                        }
                        disabled={disabled}
                      />
                      <CheckboxField
                        label="Sibilos"
                        checked={
                          avaliacao.ausculta.hemitorax_esquerdo.sibilos || false
                        }
                        onChange={(checked) =>
                          updateHemitoraxEsquerdo({
                            sibilos: checked,
                            ruidos_ausentes: false,
                          })
                        }
                        disabled={disabled}
                      />
                      <CheckboxField
                        label="Roncos"
                        checked={
                          avaliacao.ausculta.hemitorax_esquerdo.roncos || false
                        }
                        onChange={(checked) =>
                          updateHemitoraxEsquerdo({
                            roncos: checked,
                            ruidos_ausentes: false,
                          })
                        }
                        disabled={disabled}
                      />
                      <CheckboxField
                        label="Roncos de Transmissão"
                        checked={
                          avaliacao.ausculta.hemitorax_esquerdo
                            .roncos_transmissao || false
                        }
                        onChange={(checked) =>
                          updateHemitoraxEsquerdo({
                            roncos_transmissao: checked,
                            ruidos_ausentes: false,
                          })
                        }
                        disabled={disabled}
                      />
                      <CheckboxField
                        label="Estertores finos"
                        checked={
                          avaliacao.ausculta.hemitorax_esquerdo
                            .estertores_finos || false
                        }
                        onChange={(checked) =>
                          updateHemitoraxEsquerdo({
                            estertores_finos: checked,
                            ruidos_ausentes: false,
                          })
                        }
                        disabled={disabled}
                      />
                      <CheckboxField
                        label="Estertores grossos"
                        checked={
                          avaliacao.ausculta.hemitorax_esquerdo
                            .estertores_grossos || false
                        }
                        onChange={(checked) =>
                          updateHemitoraxEsquerdo({
                            estertores_grossos: checked,
                            ruidos_ausentes: false,
                          })
                        }
                        disabled={disabled}
                      />
                    </div>
                  </div>

                  {!avaliacao.ausculta.hemitorax_esquerdo.ruidos_ausentes && (
                    <div className="space-y-2">
                      <span className="text-sm font-medium">
                        📍 Localização
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <CheckboxField
                          label="Difusos"
                          checked={
                            avaliacao.ausculta.hemitorax_esquerdo
                              .localizacao_difusos || false
                          }
                          onChange={(checked) =>
                            updateHemitoraxEsquerdo({
                              localizacao_difusos: checked,
                            })
                          }
                          disabled={disabled}
                        />
                        <CheckboxField
                          label="Ápice"
                          checked={
                            avaliacao.ausculta.hemitorax_esquerdo
                              .localizacao_apice || false
                          }
                          onChange={(checked) =>
                            updateHemitoraxEsquerdo({
                              localizacao_apice: checked,
                            })
                          }
                          disabled={disabled}
                        />
                        <CheckboxField
                          label="Terço Médio"
                          checked={
                            avaliacao.ausculta.hemitorax_esquerdo
                              .localizacao_terco_medio || false
                          }
                          onChange={(checked) =>
                            updateHemitoraxEsquerdo({
                              localizacao_terco_medio: checked,
                            })
                          }
                          disabled={disabled}
                        />
                        <CheckboxField
                          label="Base"
                          checked={
                            avaliacao.ausculta.hemitorax_esquerdo
                              .localizacao_base || false
                          }
                          onChange={(checked) =>
                            updateHemitoraxEsquerdo({
                              localizacao_base: checked,
                            })
                          }
                          disabled={disabled}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Observações da Ausculta */}
              <Field label="Observações da Ausculta">
                <Textarea
                  value={avaliacao.ausculta.observacoes || ''}
                  onChange={(e) =>
                    updateAusculta({ observacoes: e.target.value })
                  }
                  placeholder="Observações adicionais sobre a ausculta pulmonar..."
                  disabled={disabled}
                  rows={2}
                />
              </Field>
            </div>
          </div>
        );
      }

      // AI dev note: 'estado_geral' foi consolidado em 'estado_geral_antes' para reduzir seções

      // -----------------------------------------------------------------
      // INTERVENÇÃO REALIZADA
      // -----------------------------------------------------------------
      case 'intervencao': {
        const intervencao = evolucao.intervencao;

        const updateIntervencao = (
          updates: Partial<IntervencaoRespiratoria>
        ) => {
          onRespiratoriaChange({
            intervencao: { ...intervencao, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            {/* Técnicas de Desobstrução Brônquica */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-blue-700">
                🫁 Técnicas de Desobstrução Brônquica
              </h4>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <CheckboxField
                  label="AFE (Aumento do Fluxo Expiratório)"
                  checked={intervencao.afe}
                  onChange={(checked) => updateIntervencao({ afe: checked })}
                  disabled={disabled}
                />
                <CheckboxField
                  label="Vibrocompressão"
                  checked={intervencao.vibrocompressao}
                  onChange={(checked) =>
                    updateIntervencao({ vibrocompressao: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Expiração Lenta Prolongada"
                  checked={intervencao.expiração_lenta_prolongada}
                  onChange={(checked) =>
                    updateIntervencao({ expiração_lenta_prolongada: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="RTA (Reequilíbrio Toracoabdominal)"
                  checked={intervencao.rta}
                  onChange={(checked) => updateIntervencao({ rta: checked })}
                  disabled={disabled}
                />
                <CheckboxField
                  label="EPAP"
                  checked={intervencao.epap}
                  onChange={(checked) => updateIntervencao({ epap: checked })}
                  disabled={disabled}
                />
                <CheckboxField
                  label="EPAP Selo d'Água"
                  checked={intervencao.epap_selo_dagua}
                  onChange={(checked) =>
                    updateIntervencao({ epap_selo_dagua: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Redirecionamento de Fluxo"
                  checked={intervencao.redirecionamento_fluxo}
                  onChange={(checked) =>
                    updateIntervencao({ redirecionamento_fluxo: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Posicionamentos Terapêuticos"
                  checked={intervencao.posicionamentos_terapeuticos}
                  onChange={(checked) =>
                    updateIntervencao({ posicionamentos_terapeuticos: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Estímulo à Tosse Eficaz"
                  checked={intervencao.estimulo_tosse}
                  onChange={(checked) =>
                    updateIntervencao({ estimulo_tosse: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Nebulização"
                  checked={intervencao.nebulizacao}
                  onChange={(checked) =>
                    updateIntervencao({ nebulizacao: checked })
                  }
                  disabled={disabled}
                />
              </div>

              {/* PEEP - aparece se usar EPAP ou EPAP selo d'água */}
              {(intervencao.epap || intervencao.epap_selo_dagua) && (
                <Field label="Valor da PEEP (cmH₂O)">
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    step={0.5}
                    value={intervencao.peep_valor || ''}
                    onChange={(e) =>
                      updateIntervencao({
                        peep_valor: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="Ex: 5"
                    disabled={disabled}
                    className="w-full sm:w-32"
                  />
                </Field>
              )}
            </div>

            {/* Aspiração */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-orange-700">🔸 Aspiração</h4>

              <BooleanField
                label="Realizou Aspiração"
                value={intervencao.aspiracao}
                onChange={(checked) =>
                  updateIntervencao({ aspiracao: checked })
                }
                disabled={disabled}
              />

              {intervencao.aspiracao && (
                <div className="space-y-4 pl-4 border-l-2 border-orange-200">
                  <Field label="Tipo de Aspiração" required>
                    <RadioButtonGroup
                      value={intervencao.aspiracao_tipo}
                      onChange={(v) =>
                        updateIntervencao({
                          aspiracao_tipo: v as
                            | 'invasiva'
                            | 'nao_invasiva'
                            | 'ambas',
                        })
                      }
                      options={[
                        { valor: 'nao_invasiva', label: 'Não Invasiva' },
                        { valor: 'invasiva', label: 'Invasiva' },
                        { valor: 'ambas', label: 'Ambas' },
                      ]}
                      disabled={disabled}
                    />
                  </Field>

                  <Field label="Quantidade de Secreção">
                    <RadioButtonGroup
                      value={intervencao.aspiracao_quantidade}
                      onChange={(v) =>
                        updateIntervencao({
                          aspiracao_quantidade: v as
                            | 'pouca'
                            | 'moderada'
                            | 'abundante',
                        })
                      }
                      options={[
                        { valor: 'pouca', label: 'Pouca' },
                        { valor: 'moderada', label: 'Moderada' },
                        { valor: 'abundante', label: 'Abundante' },
                      ]}
                      disabled={disabled}
                    />
                  </Field>

                  <Field label="Consistência da Secreção">
                    <RadioButtonGroup
                      value={intervencao.aspiracao_consistencia}
                      onChange={(v) =>
                        updateIntervencao({
                          aspiracao_consistencia: v as 'fluida' | 'espessa',
                        })
                      }
                      options={[
                        { valor: 'fluida', label: 'Fluida' },
                        { valor: 'espessa', label: 'Espessa' },
                      ]}
                      disabled={disabled}
                    />
                  </Field>

                  <Field label="Aspecto da Secreção">
                    <RadioButtonGroup
                      value={intervencao.aspiracao_aspecto}
                      onChange={(v) =>
                        updateIntervencao({
                          aspiracao_aspecto: v as
                            | 'clara'
                            | 'amarelada'
                            | 'esverdeada'
                            | 'purulenta',
                        })
                      }
                      options={[
                        { valor: 'clara', label: '⚪ Clara' },
                        { valor: 'amarelada', label: '🟡 Amarelada' },
                        { valor: 'esverdeada', label: '🟢 Esverdeada' },
                        { valor: 'purulenta', label: '🟤 Purulenta' },
                      ]}
                      disabled={disabled}
                    />
                  </Field>

                  <Field label="Sangramento">
                    <RadioButtonGroup
                      value={intervencao.aspiracao_sangramento}
                      onChange={(v) =>
                        updateIntervencao({
                          aspiracao_sangramento: v as
                            | 'nao'
                            | 'rajas_sangue'
                            | 'sangramento_ativo',
                        })
                      }
                      options={[
                        { valor: 'nao', label: '✅ Sem sangramento' },
                        { valor: 'rajas_sangue', label: '⚠️ Rajas de sangue' },
                        {
                          valor: 'sangramento_ativo',
                          label: '🔴 Sangramento ativo',
                        },
                      ]}
                      disabled={disabled}
                    />
                  </Field>
                </div>
              )}
            </div>

            <Field label="Observações da Intervenção">
              <Textarea
                value={intervencao.observacoes || ''}
                onChange={(e) =>
                  updateIntervencao({ observacoes: e.target.value })
                }
                placeholder="Detalhes adicionais sobre a intervenção realizada..."
                disabled={disabled}
                rows={3}
              />
            </Field>
          </div>
        );
      }

      // -----------------------------------------------------------------
      // RESPOSTA AO TRATAMENTO (DEPOIS)
      // -----------------------------------------------------------------
      case 'avaliacao_depois': {
        const depois = evolucao.avaliacao_depois;

        const updateDepois = (
          updates: Partial<AvaliacaoRespiratoriaDepois>
        ) => {
          onRespiratoriaChange({
            avaliacao_depois: { ...depois, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <BooleanField
                value={depois.melhora_padrao_respiratorio}
                onChange={(checked) =>
                  updateDepois({ melhora_padrao_respiratorio: checked })
                }
                label="Melhora do Padrão Respiratório"
                disabled={disabled}
              />
              <BooleanField
                value={depois.eliminacao_secrecao}
                onChange={(checked) =>
                  updateDepois({ eliminacao_secrecao: checked })
                }
                label="Eliminação de Secreção"
                disabled={disabled}
              />
              <BooleanField
                value={depois.reducao_desconforto}
                onChange={(checked) =>
                  updateDepois({ reducao_desconforto: checked })
                }
                label="Redução de Sinais de Desconforto"
                disabled={disabled}
              />
            </div>

            {/* Tolerância e Comportamento Durante a Sessão */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-purple-700">
                👶 Tolerância e Comportamento
              </h4>

              <Field label="Tolerância ao Manuseio" required>
                <RadioButtonGroup
                  value={depois.tolerancia_manuseio}
                  onChange={(v) =>
                    updateDepois({
                      tolerancia_manuseio: v as 'boa' | 'regular' | 'ruim',
                    })
                  }
                  options={[
                    { valor: 'boa', label: '✅ Boa' },
                    { valor: 'regular', label: '⚠️ Regular' },
                    { valor: 'ruim', label: '❌ Ruim' },
                  ]}
                  disabled={disabled}
                />
              </Field>

              <Field label="Choro Durante Atendimento">
                <RadioButtonGroup
                  value={depois.choro_durante_atendimento}
                  onChange={(v) =>
                    updateDepois({
                      choro_durante_atendimento: v as
                        | 'ausente'
                        | 'leve'
                        | 'moderado'
                        | 'intenso',
                    })
                  }
                  options={[
                    { valor: 'ausente', label: '😊 Ausente' },
                    { valor: 'leve', label: '😢 Leve' },
                    { valor: 'moderado', label: '😭 Moderado' },
                    { valor: 'intenso', label: '😱 Intenso' },
                  ]}
                  disabled={disabled}
                />
              </Field>
            </div>

            {/* Mudança na Ausculta Pulmonar - Checkboxes */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-purple-700">
                🩺 Mudança na Ausculta Pulmonar
              </h4>

              <div className="flex flex-wrap gap-4">
                <CheckboxField
                  label="Sem Alteração (igual)"
                  checked={depois.ausculta_sem_alteracao}
                  onChange={(checked) => {
                    updateDepois({
                      ausculta_sem_alteracao: checked,
                      // Se marcar "sem alteração", desmarca as outras opções
                      ausculta_melhorou: checked
                        ? false
                        : depois.ausculta_melhorou,
                      ausculta_reducao_roncos: checked
                        ? false
                        : depois.ausculta_reducao_roncos,
                      ausculta_reducao_sibilos: checked
                        ? false
                        : depois.ausculta_reducao_sibilos,
                      ausculta_reducao_estertores: checked
                        ? false
                        : depois.ausculta_reducao_estertores,
                      ausculta_melhora_mv: checked
                        ? false
                        : depois.ausculta_melhora_mv,
                    });
                  }}
                  disabled={disabled}
                />
                <CheckboxField
                  label="Houve Melhora"
                  checked={depois.ausculta_melhorou}
                  onChange={(checked) => {
                    updateDepois({
                      ausculta_melhorou: checked,
                      ausculta_sem_alteracao: checked
                        ? false
                        : depois.ausculta_sem_alteracao,
                    });
                  }}
                  disabled={disabled}
                />
              </div>

              {depois.ausculta_melhorou && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-4 border-l-2 border-purple-200">
                  <CheckboxField
                    label="Redução de Roncos"
                    checked={depois.ausculta_reducao_roncos}
                    onChange={(checked) =>
                      updateDepois({ ausculta_reducao_roncos: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Redução de Sibilos"
                    checked={depois.ausculta_reducao_sibilos}
                    onChange={(checked) =>
                      updateDepois({ ausculta_reducao_sibilos: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Redução de Estertores"
                    checked={depois.ausculta_reducao_estertores}
                    onChange={(checked) =>
                      updateDepois({ ausculta_reducao_estertores: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Melhora do Murmúrio Vesicular"
                    checked={depois.ausculta_melhora_mv}
                    onChange={(checked) =>
                      updateDepois({ ausculta_melhora_mv: checked })
                    }
                    disabled={disabled}
                  />
                </div>
              )}
            </div>

            {/* Sinais Vitais Após */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-green-700">
                🌡️ Sinais Vitais Após Intervenção
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="SpO₂ (%)">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    value={depois.saturacao_o2 || ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '');
                      updateDepois({
                        saturacao_o2: value ? Number(value) : undefined,
                      });
                    }}
                    onKeyDown={(e) => {
                      if (
                        [
                          'Backspace',
                          'Delete',
                          'Tab',
                          'Escape',
                          'Enter',
                        ].includes(e.key) ||
                        (e.ctrlKey &&
                          ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())) ||
                        [
                          'ArrowLeft',
                          'ArrowRight',
                          'ArrowUp',
                          'ArrowDown',
                        ].includes(e.key)
                      ) {
                        return;
                      }
                      if (!/[0-9]/.test(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    placeholder="98"
                    disabled={disabled}
                    className="w-full"
                  />
                </Field>

                <Field label="FC (bpm)">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={40}
                    max={220}
                    value={depois.frequencia_cardiaca || ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '');
                      updateDepois({
                        frequencia_cardiaca: value ? Number(value) : undefined,
                      });
                    }}
                    onKeyDown={(e) => {
                      if (
                        [
                          'Backspace',
                          'Delete',
                          'Tab',
                          'Escape',
                          'Enter',
                        ].includes(e.key) ||
                        (e.ctrlKey &&
                          ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())) ||
                        [
                          'ArrowLeft',
                          'ArrowRight',
                          'ArrowUp',
                          'ArrowDown',
                        ].includes(e.key)
                      ) {
                        return;
                      }
                      if (!/[0-9]/.test(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    placeholder="115"
                    disabled={disabled}
                    className="w-full"
                  />
                </Field>
              </div>
            </div>

            <Field label="Comportamento da Criança Após a Sessão">
              <RadioButtonGroup
                value={depois.comportamento_crianca}
                onChange={(v) =>
                  updateDepois({
                    comportamento_crianca: v as
                      | 'calmo'
                      | 'sonolento'
                      | 'irritado'
                      | 'choroso'
                      | 'sem_mudanca',
                  })
                }
                options={[
                  { valor: 'calmo', label: '😊 Calmo' },
                  { valor: 'sonolento', label: '😴 Sonolento' },
                  { valor: 'irritado', label: '😤 Irritado' },
                  { valor: 'choroso', label: '😢 Choroso' },
                  { valor: 'sem_mudanca', label: '➖ Sem Mudança' },
                ]}
                disabled={disabled}
              />
            </Field>

            <Field label="Observações">
              <Textarea
                value={depois.observacoes || ''}
                onChange={(e) => updateDepois({ observacoes: e.target.value })}
                placeholder="Ex: Após intervenção, criança apresentou redução de roncos difusos e melhora do padrão respiratório, mantendo boa saturação."
                disabled={disabled}
                rows={3}
              />
            </Field>
          </div>
        );
      }

      // -----------------------------------------------------------------
      // ORIENTAÇÕES AOS RESPONSÁVEIS
      // -----------------------------------------------------------------
      case 'orientacoes': {
        const orientacoes = evolucao.orientacoes;

        const updateOrientacoes = (
          updates: Partial<OrientacoesRespiratoria>
        ) => {
          onRespiratoriaChange({
            orientacoes: { ...orientacoes, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            {/* Explicação */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>💡 Orientações importantes:</strong> Marque as
                orientações que foram passadas aos responsáveis durante o
                atendimento. Essas informações ajudam no acompanhamento e na
                continuidade do cuidado em casa.
              </p>
            </div>

            {/* Higiene Nasal */}
            <div className="border rounded-lg p-4 space-y-4">
              <CheckboxField
                label="Higiene Nasal"
                checked={orientacoes.higiene_nasal}
                onChange={(checked) =>
                  updateOrientacoes({ higiene_nasal: checked })
                }
                disabled={disabled}
              />
              {orientacoes.higiene_nasal && (
                <div className="pl-6 border-l-2 border-blue-200 space-y-2">
                  <CheckboxField
                    label="Técnica demonstrada"
                    checked={
                      orientacoes.higiene_nasal_tecnica_demonstrada || false
                    }
                    onChange={(checked) =>
                      updateOrientacoes({
                        higiene_nasal_tecnica_demonstrada: checked,
                      })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Frequência orientada conforme idade"
                    checked={
                      orientacoes.higiene_nasal_frequencia_orientada || false
                    }
                    onChange={(checked) =>
                      updateOrientacoes({
                        higiene_nasal_frequencia_orientada: checked,
                      })
                    }
                    disabled={disabled}
                  />
                </div>
              )}
            </div>

            {/* Posicionamento para Dormir e Repouso */}
            <div className="border rounded-lg p-4 space-y-4">
              <CheckboxField
                label="Posicionamento para Dormir e Repouso"
                checked={orientacoes.posicionamento_dormir}
                onChange={(checked) =>
                  updateOrientacoes({ posicionamento_dormir: checked })
                }
                disabled={disabled}
              />
              {orientacoes.posicionamento_dormir && (
                <div className="pl-6 border-l-2 border-blue-200 space-y-2">
                  <CheckboxField
                    label="Cabeça elevada"
                    checked={orientacoes.posicionamento_cabeca_elevada || false}
                    onChange={(checked) =>
                      updateOrientacoes({
                        posicionamento_cabeca_elevada: checked,
                      })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Alternância de decúbitos"
                    checked={
                      orientacoes.posicionamento_alternancia_decubitos || false
                    }
                    onChange={(checked) =>
                      updateOrientacoes({
                        posicionamento_alternancia_decubitos: checked,
                      })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Prono (barriga para baixo)"
                    checked={orientacoes.posicionamento_prono || false}
                    onChange={(checked) =>
                      updateOrientacoes({
                        posicionamento_prono: checked,
                      })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Decúbito lateral direito"
                    checked={
                      orientacoes.posicionamento_decubito_lateral_direito ||
                      false
                    }
                    onChange={(checked) =>
                      updateOrientacoes({
                        posicionamento_decubito_lateral_direito: checked,
                      })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Decúbito lateral esquerdo"
                    checked={
                      orientacoes.posicionamento_decubito_lateral_esquerdo ||
                      false
                    }
                    onChange={(checked) =>
                      updateOrientacoes({
                        posicionamento_decubito_lateral_esquerdo: checked,
                      })
                    }
                    disabled={disabled}
                  />
                </div>
              )}
            </div>

            {/* Sinais de Alerta */}
            <div className="border rounded-lg p-4 space-y-4">
              <CheckboxField
                label="Sinais de Alerta"
                checked={orientacoes.sinais_alerta}
                onChange={(checked) =>
                  updateOrientacoes({ sinais_alerta: checked })
                }
                disabled={disabled}
              />
              {orientacoes.sinais_alerta && (
                <div className="pl-6 border-l-2 border-orange-200 space-y-2">
                  <CheckboxField
                    label="Aumento do esforço respiratório"
                    checked={
                      orientacoes.sinais_alerta_esforco_respiratorio || false
                    }
                    onChange={(checked) =>
                      updateOrientacoes({
                        sinais_alerta_esforco_respiratorio: checked,
                      })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Piora da tosse ou chiado"
                    checked={
                      orientacoes.sinais_alerta_piora_tosse_chiado || false
                    }
                    onChange={(checked) =>
                      updateOrientacoes({
                        sinais_alerta_piora_tosse_chiado: checked,
                      })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Queda de saturação (quando monitorada)"
                    checked={orientacoes.sinais_alerta_queda_saturacao || false}
                    onChange={(checked) =>
                      updateOrientacoes({
                        sinais_alerta_queda_saturacao: checked,
                      })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Piora da diurese"
                    checked={orientacoes.sinais_alerta_piora_diurese || false}
                    onChange={(checked) =>
                      updateOrientacoes({
                        sinais_alerta_piora_diurese: checked,
                      })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Febre"
                    checked={orientacoes.sinais_alerta_febre || false}
                    onChange={(checked) =>
                      updateOrientacoes({
                        sinais_alerta_febre: checked,
                      })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Prostração"
                    checked={orientacoes.sinais_alerta_prostracao || false}
                    onChange={(checked) =>
                      updateOrientacoes({
                        sinais_alerta_prostracao: checked,
                      })
                    }
                    disabled={disabled}
                  />
                </div>
              )}
            </div>

            <Field label="Outras Orientações">
              <Textarea
                value={orientacoes.outras || ''}
                onChange={(e) => updateOrientacoes({ outras: e.target.value })}
                placeholder="Outras orientações específicas..."
                disabled={disabled}
                rows={2}
              />
            </Field>
          </div>
        );
      }

      // -----------------------------------------------------------------
      // CONDUTA E PLANO
      // -----------------------------------------------------------------
      case 'conduta': {
        const conduta = evolucao.conduta;

        const updateConduta = (updates: Partial<CondutaRespiratoria>) => {
          onRespiratoriaChange({
            conduta: { ...conduta, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            {/* Manter Fisioterapia - principal decisão */}
            <BooleanField
              value={conduta.manter_fisioterapia}
              onChange={(checked) =>
                updateConduta({
                  manter_fisioterapia: checked,
                  // Limpa campos de alta quando manter fisio
                  alta: checked ? false : conduta.alta,
                  alta_parcial: checked ? false : conduta.alta_parcial,
                })
              }
              label="Manter Fisioterapia Respiratória"
              disabled={disabled}
            />

            {/* Se MANTER fisioterapia: mostra apenas Frequência Sugerida */}
            {conduta.manter_fisioterapia && (
              <div className="pl-4 border-l-2 border-green-200 space-y-4">
                <Field label="Frequência Sugerida">
                  <RadioButtonGroup
                    value={conduta.frequencia_sugerida}
                    onChange={(v) =>
                      updateConduta({
                        frequencia_sugerida: v as
                          | 'diaria'
                          | '2x_semana'
                          | '3x_semana'
                          | 'semanal'
                          | 'quinzenal'
                          | 'mensal',
                      })
                    }
                    options={[
                      { valor: 'diaria', label: 'Diária' },
                      { valor: '3x_semana', label: '3x/semana' },
                      { valor: '2x_semana', label: '2x/semana' },
                      { valor: 'semanal', label: 'Semanal' },
                      { valor: 'quinzenal', label: 'Quinzenal' },
                      { valor: 'mensal', label: 'Mensal' },
                    ]}
                    disabled={disabled}
                  />
                </Field>
              </div>
            )}

            {/* Se NÃO manter fisioterapia: mostra opções de Alta */}
            {!conduta.manter_fisioterapia && (
              <div className="pl-4 border-l-2 border-orange-200 space-y-4">
                <Field label="Tipo de Alta" required>
                  <RadioButtonGroup
                    value={
                      conduta.alta
                        ? 'completa'
                        : conduta.alta_parcial
                          ? 'parcial'
                          : null
                    }
                    onChange={(v) =>
                      updateConduta({
                        alta: v === 'completa',
                        alta_parcial: v === 'parcial',
                        // Limpa campos quando muda para alta completa
                        frequencia_sugerida:
                          v === 'completa' ? null : conduta.frequencia_sugerida,
                        reavaliacao_dias:
                          v === 'completa'
                            ? undefined
                            : conduta.reavaliacao_dias,
                        encaminhamento_medico:
                          v === 'completa'
                            ? false
                            : conduta.encaminhamento_medico,
                        especialista_encaminhamento:
                          v === 'completa'
                            ? undefined
                            : conduta.especialista_encaminhamento,
                        motivo_encaminhamento:
                          v === 'completa'
                            ? undefined
                            : conduta.motivo_encaminhamento,
                      })
                    }
                    options={[
                      { valor: 'completa', label: '✅ Alta Completa' },
                      {
                        valor: 'parcial',
                        label: '⏳ Alta Parcial / Acompanhamento',
                      },
                    ]}
                    disabled={disabled}
                  />
                </Field>

                {/* Se Alta Parcial: mostra Frequência e Reavaliação */}
                {conduta.alta_parcial && (
                  <div className="space-y-4 pl-4 border-l-2 border-yellow-200">
                    <Field label="Frequência Sugerida para Acompanhamento">
                      <RadioButtonGroup
                        value={conduta.frequencia_sugerida}
                        onChange={(v) =>
                          updateConduta({
                            frequencia_sugerida: v as
                              | 'diaria'
                              | '2x_semana'
                              | '3x_semana'
                              | 'semanal'
                              | 'quinzenal'
                              | 'mensal',
                          })
                        }
                        options={[
                          { valor: 'diaria', label: 'Diária' },
                          { valor: '3x_semana', label: '3x/semana' },
                          { valor: '2x_semana', label: '2x/semana' },
                          { valor: 'semanal', label: 'Semanal' },
                          { valor: 'quinzenal', label: 'Quinzenal' },
                          { valor: 'mensal', label: 'Mensal' },
                        ]}
                        disabled={disabled}
                      />
                    </Field>

                    <Field label="Reavaliação em (dias)">
                      <Input
                        type="number"
                        min={1}
                        value={conduta.reavaliacao_dias || ''}
                        onChange={(e) =>
                          updateConduta({
                            reavaliacao_dias: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          })
                        }
                        placeholder="Ex: 7"
                        disabled={disabled}
                        className="w-full sm:w-32"
                      />
                    </Field>
                  </div>
                )}
              </div>
            )}

            {/* Encaminhamento Médico - se manter fisioterapia OU alta parcial */}
            {(conduta.manter_fisioterapia || conduta.alta_parcial) && (
              <>
                <BooleanField
                  value={conduta.encaminhamento_medico}
                  onChange={(checked) =>
                    updateConduta({ encaminhamento_medico: checked })
                  }
                  label="Encaminhamento Médico Necessário"
                  disabled={disabled}
                />

                {conduta.encaminhamento_medico && (
                  <div className="space-y-4 pl-4 border-l-2 border-blue-200">
                    <Field label="Especialista">
                      <Input
                        value={conduta.especialista_encaminhamento || ''}
                        onChange={(e) =>
                          updateConduta({
                            especialista_encaminhamento: e.target.value,
                          })
                        }
                        placeholder="Ex: Pneumologista, Otorrinolaringologista..."
                        disabled={disabled}
                      />
                    </Field>
                    <Field label="Motivo do Encaminhamento">
                      <Textarea
                        value={conduta.motivo_encaminhamento || ''}
                        onChange={(e) =>
                          updateConduta({
                            motivo_encaminhamento: e.target.value,
                          })
                        }
                        placeholder="Descreva o motivo do encaminhamento..."
                        disabled={disabled}
                        rows={2}
                      />
                    </Field>
                  </div>
                )}
              </>
            )}

            <Field label="Observações da Conduta">
              <Textarea
                value={conduta.observacoes || ''}
                onChange={(e) => updateConduta({ observacoes: e.target.value })}
                placeholder="Observações adicionais sobre a conduta..."
                disabled={disabled}
                rows={3}
              />
            </Field>
          </div>
        );
      }
    }
  }

  // =========================================================================
  // EVOLUÇÃO MOTORA / ASSIMETRIA
  // =========================================================================

  if (tipoEvolucao === 'motora_assimetria') {
    const evolucao = evolucaoMotora;

    switch (secaoId) {
      // -----------------------------------------------------------------
      // CRANIOMETRIA
      // -----------------------------------------------------------------
      case 'craniometria': {
        const craniometria = evolucao.craniometria || {};

        const updateCraniometria = (updates: Partial<CraniometriaEvolucao>) => {
          const novasCraniometria = { ...craniometria, ...updates };
          const comCalculos =
            calcularMetricasCraniometriaEvolucao(novasCraniometria);
          onMotoraChange({
            craniometria: comCalculos,
          });
        };

        return (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                📐 Medidas craniométricas para acompanhar evolução da
                assimetria. Os índices CVAI e CI são calculados automaticamente.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Diagonal A (mm)">
                <Input
                  type="number"
                  min={0}
                  value={craniometria.diagonal_a_mm || ''}
                  onChange={(e) =>
                    updateCraniometria({
                      diagonal_a_mm: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                  placeholder="Ex: 145"
                  disabled={disabled}
                />
              </Field>
              <Field label="Diagonal B (mm)">
                <Input
                  type="number"
                  min={0}
                  value={craniometria.diagonal_b_mm || ''}
                  onChange={(e) =>
                    updateCraniometria({
                      diagonal_b_mm: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                  placeholder="Ex: 135"
                  disabled={disabled}
                />
              </Field>
              <Field label="Comprimento AP (mm)">
                <Input
                  type="number"
                  min={0}
                  value={craniometria.comprimento_ap_mm || ''}
                  onChange={(e) =>
                    updateCraniometria({
                      comprimento_ap_mm: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                  placeholder="Ex: 120"
                  disabled={disabled}
                />
              </Field>
              <Field label="Largura ML (mm)">
                <Input
                  type="number"
                  min={0}
                  value={craniometria.largura_ml_mm || ''}
                  onChange={(e) =>
                    updateCraniometria({
                      largura_ml_mm: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                  placeholder="Ex: 110"
                  disabled={disabled}
                />
              </Field>
              <Field label="Perímetro Cefálico (cm)">
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={craniometria.perimetro_cefalico_cm || ''}
                  onChange={(e) =>
                    updateCraniometria({
                      perimetro_cefalico_cm: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                  placeholder="Ex: 42.5"
                  disabled={disabled}
                />
              </Field>
            </div>

            {/* Métricas Calculadas */}
            {(craniometria.cva_mm !== undefined ||
              craniometria.cvai_percentual !== undefined) && (
              <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
                <h4 className="font-medium text-gray-700">
                  📊 Métricas Calculadas
                </h4>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {craniometria.cva_mm !== undefined && (
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {craniometria.cva_mm.toFixed(1)} mm
                      </div>
                      <div className="text-xs text-muted-foreground">CVA</div>
                    </div>
                  )}
                  {craniometria.cvai_percentual !== undefined && (
                    <div className="text-center">
                      <div
                        className={cn(
                          'text-2xl font-bold',
                          craniometria.cvai_percentual < 3.5
                            ? 'text-green-600'
                            : craniometria.cvai_percentual < 6.25
                              ? 'text-yellow-600'
                              : craniometria.cvai_percentual < 8.75
                                ? 'text-orange-600'
                                : 'text-red-600'
                        )}
                      >
                        {craniometria.cvai_percentual.toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground">CVAI</div>
                    </div>
                  )}
                  {craniometria.ci_percentual !== undefined && (
                    <div className="text-center">
                      <div
                        className={cn(
                          'text-2xl font-bold',
                          craniometria.ci_percentual >= 75 &&
                            craniometria.ci_percentual <= 85
                            ? 'text-green-600'
                            : craniometria.ci_percentual < 75
                              ? 'text-blue-600'
                              : 'text-orange-600'
                        )}
                      >
                        {craniometria.ci_percentual.toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground">CI</div>
                    </div>
                  )}
                  {craniometria.plagiocefalia_severidade && (
                    <div className="text-center">
                      <div className="text-sm font-medium capitalize">
                        {craniometria.plagiocefalia_severidade.replace(
                          '_',
                          ' '
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Plagiocefalia
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      }

      // -----------------------------------------------------------------
      // GONIOMETRIA
      // -----------------------------------------------------------------
      case 'goniometria': {
        const goniometria = evolucao.goniometria || {};

        const updateGoniometria = (updates: Partial<GoniometriaEvolucao>) => {
          onMotoraChange({
            goniometria: { ...goniometria, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-blue-700">
                Rotação Cervical (graus)
              </h4>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Field label="Ativa D">
                  <Input
                    type="number"
                    min={0}
                    max={90}
                    value={goniometria.rotacao_ativa_direita || ''}
                    onChange={(e) =>
                      updateGoniometria({
                        rotacao_ativa_direita: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                    disabled={disabled}
                  />
                </Field>
                <Field label="Ativa E">
                  <Input
                    type="number"
                    min={0}
                    max={90}
                    value={goniometria.rotacao_ativa_esquerda || ''}
                    onChange={(e) =>
                      updateGoniometria({
                        rotacao_ativa_esquerda: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                    disabled={disabled}
                  />
                </Field>
                <Field label="Passiva D">
                  <Input
                    type="number"
                    min={0}
                    max={90}
                    value={goniometria.rotacao_passiva_direita || ''}
                    onChange={(e) =>
                      updateGoniometria({
                        rotacao_passiva_direita: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                    disabled={disabled}
                  />
                </Field>
                <Field label="Passiva E">
                  <Input
                    type="number"
                    min={0}
                    max={90}
                    value={goniometria.rotacao_passiva_esquerda || ''}
                    onChange={(e) =>
                      updateGoniometria({
                        rotacao_passiva_esquerda: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                    disabled={disabled}
                  />
                </Field>
              </div>
            </div>

            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-purple-700">
                Inclinação Lateral (graus)
              </h4>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Field label="Ativa D">
                  <Input
                    type="number"
                    min={0}
                    max={45}
                    value={goniometria.inclinacao_ativa_direita || ''}
                    onChange={(e) =>
                      updateGoniometria({
                        inclinacao_ativa_direita: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                    disabled={disabled}
                  />
                </Field>
                <Field label="Ativa E">
                  <Input
                    type="number"
                    min={0}
                    max={45}
                    value={goniometria.inclinacao_ativa_esquerda || ''}
                    onChange={(e) =>
                      updateGoniometria({
                        inclinacao_ativa_esquerda: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                    disabled={disabled}
                  />
                </Field>
                <Field label="Passiva D">
                  <Input
                    type="number"
                    min={0}
                    max={45}
                    value={goniometria.inclinacao_passiva_direita || ''}
                    onChange={(e) =>
                      updateGoniometria({
                        inclinacao_passiva_direita: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                    disabled={disabled}
                  />
                </Field>
                <Field label="Passiva E">
                  <Input
                    type="number"
                    min={0}
                    max={45}
                    value={goniometria.inclinacao_passiva_esquerda || ''}
                    onChange={(e) =>
                      updateGoniometria({
                        inclinacao_passiva_esquerda: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                    disabled={disabled}
                  />
                </Field>
              </div>
            </div>

            <Field label="Observações">
              <Textarea
                value={goniometria.observacoes || ''}
                onChange={(e) =>
                  updateGoniometria({ observacoes: e.target.value })
                }
                placeholder="Observações sobre amplitude de movimento..."
                disabled={disabled}
                rows={2}
              />
            </Field>
          </div>
        );
      }

      // -----------------------------------------------------------------
      // PALPAÇÃO ECOM
      // -----------------------------------------------------------------
      case 'palpacao': {
        const palpacao = evolucao.palpacao || {};

        const updatePalpacao = (updates: Partial<PalpacaoECOMEvolucao>) => {
          onMotoraChange({
            palpacao: { ...palpacao, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* ECOM Direito */}
              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-medium text-blue-700">ECOM Direito</h4>

                <Field label="Tônus">
                  <RadioButtonGroup
                    value={palpacao.ecom_direito_tonus}
                    onChange={(v) =>
                      updatePalpacao({
                        ecom_direito_tonus: v as
                          | 'normal'
                          | 'tenso'
                          | 'tenso_corda',
                      })
                    }
                    options={[
                      { valor: 'normal', label: '✅ Normal' },
                      { valor: 'tenso', label: '⚠️ Tenso' },
                      { valor: 'tenso_corda', label: '🔴 Em corda' },
                    ]}
                    layout="vertical"
                    disabled={disabled}
                  />
                </Field>

                <CheckboxField
                  label="Nódulo Presente"
                  checked={palpacao.nodulo_direito || false}
                  onChange={(checked) =>
                    updatePalpacao({ nodulo_direito: checked })
                  }
                  disabled={disabled}
                />
              </div>

              {/* ECOM Esquerdo */}
              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-medium text-purple-700">ECOM Esquerdo</h4>

                <Field label="Tônus">
                  <RadioButtonGroup
                    value={palpacao.ecom_esquerdo_tonus}
                    onChange={(v) =>
                      updatePalpacao({
                        ecom_esquerdo_tonus: v as
                          | 'normal'
                          | 'tenso'
                          | 'tenso_corda',
                      })
                    }
                    options={[
                      { valor: 'normal', label: '✅ Normal' },
                      { valor: 'tenso', label: '⚠️ Tenso' },
                      { valor: 'tenso_corda', label: '🔴 Em corda' },
                    ]}
                    layout="vertical"
                    disabled={disabled}
                  />
                </Field>

                <CheckboxField
                  label="Nódulo Presente"
                  checked={palpacao.nodulo_esquerdo || false}
                  onChange={(checked) =>
                    updatePalpacao({ nodulo_esquerdo: checked })
                  }
                  disabled={disabled}
                />
              </div>
            </div>

            {(palpacao.nodulo_direito || palpacao.nodulo_esquerdo) && (
              <>
                <Field label="Tamanho do Nódulo">
                  <RadioButtonGroup
                    value={palpacao.nodulo_tamanho}
                    onChange={(v) =>
                      updatePalpacao({
                        nodulo_tamanho: v as
                          | 'menor_1cm'
                          | '1_3cm'
                          | 'maior_3cm',
                      })
                    }
                    options={[
                      { valor: 'menor_1cm', label: '< 1cm' },
                      { valor: '1_3cm', label: '1-3cm' },
                      { valor: 'maior_3cm', label: '> 3cm' },
                    ]}
                    disabled={disabled}
                  />
                </Field>

                <Field label="Localização do Nódulo">
                  <RadioButtonGroup
                    value={palpacao.nodulo_localizacao}
                    onChange={(v) =>
                      updatePalpacao({
                        nodulo_localizacao: v as
                          | 'terco_inferior'
                          | 'terco_medio'
                          | 'terco_superior',
                      })
                    }
                    options={[
                      { valor: 'terco_inferior', label: 'Terço Inferior' },
                      { valor: 'terco_medio', label: 'Terço Médio' },
                      { valor: 'terco_superior', label: 'Terço Superior' },
                    ]}
                    disabled={disabled}
                  />
                </Field>
              </>
            )}

            <Field label="Observações">
              <Textarea
                value={palpacao.observacoes || ''}
                onChange={(e) =>
                  updatePalpacao({ observacoes: e.target.value })
                }
                placeholder="Observações sobre palpação..."
                disabled={disabled}
                rows={2}
              />
            </Field>
          </div>
        );
      }

      // -----------------------------------------------------------------
      // CONTROLE MOTOR
      // -----------------------------------------------------------------
      case 'controle_motor': {
        const controle = evolucao.controle_motor || {};

        const updateControle = (updates: Partial<ControleMotorEvolucao>) => {
          onMotoraChange({
            controle_motor: { ...controle, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            {/* Supino */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-blue-700">
                🔷 SUPINO (Barriga para cima)
              </h4>

              <Field label="Manutenção na Linha Média">
                <RadioButtonGroup
                  value={controle.supino_linha_media}
                  onChange={(v) =>
                    updateControle({
                      supino_linha_media: v as
                        | 'mantem_firme'
                        | 'cai_preferencia'
                        | 'instavel',
                    })
                  }
                  options={[
                    { valor: 'mantem_firme', label: '✅ Mantém firme' },
                    {
                      valor: 'cai_preferencia',
                      label: '⚠️ Cai para preferência',
                    },
                    { valor: 'instavel', label: '❌ Instável' },
                  ]}
                  disabled={disabled}
                />
              </Field>

              <Field label="Alcance de Linha Média (Mãos)">
                <RadioButtonGroup
                  value={controle.supino_alcance}
                  onChange={(v) =>
                    updateControle({
                      supino_alcance: v as
                        | 'maos_joelhos'
                        | 'maos_boca'
                        | 'maos_ar'
                        | 'ausente',
                    })
                  }
                  options={[
                    { valor: 'maos_joelhos', label: 'Mãos nos joelhos' },
                    { valor: 'maos_boca', label: 'Mãos na boca' },
                    { valor: 'maos_ar', label: 'Mãos no ar' },
                    { valor: 'ausente', label: 'Ausente' },
                  ]}
                  disabled={disabled}
                />
              </Field>
            </div>

            {/* Prono */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-orange-700">
                🔶 PRONO (Tummy Time)
              </h4>

              <Field label="Tolerância">
                <RadioButtonGroup
                  value={controle.prono_tolerancia}
                  onChange={(v) =>
                    updateControle({
                      prono_tolerancia: v as
                        | 'boa'
                        | 'chora_imediato'
                        | 'cansa_rapido',
                    })
                  }
                  options={[
                    { valor: 'boa', label: '✅ Boa' },
                    { valor: 'cansa_rapido', label: '⚠️ Cansa rápido' },
                    { valor: 'chora_imediato', label: '❌ Chora imediato' },
                  ]}
                  disabled={disabled}
                />
              </Field>

              <Field label="Carga de Peso">
                <RadioButtonGroup
                  value={controle.prono_carga_peso}
                  onChange={(v) =>
                    updateControle({
                      prono_carga_peso: v as
                        | 'cotovelos'
                        | 'maos_estendidas'
                        | 'nao_levanta',
                    })
                  }
                  options={[
                    { valor: 'cotovelos', label: 'Cotovelos' },
                    { valor: 'maos_estendidas', label: 'Mãos estendidas' },
                    { valor: 'nao_levanta', label: 'Não levanta' },
                  ]}
                  disabled={disabled}
                />
              </Field>

              <Field label="Controle de Cabeça">
                <RadioButtonGroup
                  value={controle.prono_controle_cabeca}
                  onChange={(v) =>
                    updateControle({
                      prono_controle_cabeca: v as
                        | '45_graus'
                        | '90_graus'
                        | 'oscila',
                    })
                  }
                  options={[
                    { valor: '45_graus', label: '45°' },
                    { valor: '90_graus', label: '90°' },
                    { valor: 'oscila', label: 'Oscila' },
                  ]}
                  disabled={disabled}
                />
              </Field>
            </div>

            <Field label="Observações">
              <Textarea
                value={controle.observacoes || ''}
                onChange={(e) =>
                  updateControle({ observacoes: e.target.value })
                }
                placeholder="Observações sobre controle motor..."
                disabled={disabled}
                rows={2}
              />
            </Field>
          </div>
        );
      }

      // -----------------------------------------------------------------
      // INTERVENÇÃO (Motora)
      // -----------------------------------------------------------------
      case 'intervencao': {
        const intervencao = evolucao.intervencao;

        const updateIntervencao = (
          updates: Partial<IntervencaoMotoraAssimetria>
        ) => {
          onMotoraChange({
            intervencao: { ...intervencao, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-blue-700">Técnicas Realizadas</h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <CheckboxField
                  label="Alongamentos"
                  checked={intervencao.alongamentos}
                  onChange={(checked) =>
                    updateIntervencao({ alongamentos: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Fortalecimento"
                  checked={intervencao.fortalecimento}
                  onChange={(checked) =>
                    updateIntervencao({ fortalecimento: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Estimulação Sensorial"
                  checked={intervencao.estimulacao_sensorial}
                  onChange={(checked) =>
                    updateIntervencao({ estimulacao_sensorial: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Posicionamentos Terapêuticos"
                  checked={intervencao.posicionamentos_terapeuticos}
                  onChange={(checked) =>
                    updateIntervencao({ posicionamentos_terapeuticos: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Tummy Time"
                  checked={intervencao.tummy_time}
                  onChange={(checked) =>
                    updateIntervencao({ tummy_time: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Bandagem Kinesio"
                  checked={intervencao.bandagem_kinesio}
                  onChange={(checked) =>
                    updateIntervencao({ bandagem_kinesio: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Orientação aos Pais"
                  checked={intervencao.orientacao_pais}
                  onChange={(checked) =>
                    updateIntervencao({ orientacao_pais: checked })
                  }
                  disabled={disabled}
                />
              </div>
            </div>

            <Field label="Outras Técnicas">
              <Textarea
                value={intervencao.outras_tecnicas || ''}
                onChange={(e) =>
                  updateIntervencao({ outras_tecnicas: e.target.value })
                }
                placeholder="Descreva outras técnicas utilizadas..."
                disabled={disabled}
                rows={2}
              />
            </Field>

            <Field label="Observações">
              <Textarea
                value={intervencao.observacoes || ''}
                onChange={(e) =>
                  updateIntervencao({ observacoes: e.target.value })
                }
                placeholder="Detalhes da intervenção..."
                disabled={disabled}
                rows={3}
              />
            </Field>
          </div>
        );
      }

      // -----------------------------------------------------------------
      // RESPOSTA (Motora)
      // -----------------------------------------------------------------
      case 'resposta': {
        const resposta = evolucao.resposta;

        const updateResposta = (
          updates: Partial<RespostaIntervencaoMotora>
        ) => {
          onMotoraChange({
            resposta: { ...resposta, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <BooleanField
                value={resposta.melhora_adm || false}
                onChange={(checked) => updateResposta({ melhora_adm: checked })}
                label="Melhora da ADM"
                disabled={disabled}
              />
              <BooleanField
                value={resposta.reducao_preferencia_postural || false}
                onChange={(checked) =>
                  updateResposta({ reducao_preferencia_postural: checked })
                }
                label="Redução da Preferência Postural"
                disabled={disabled}
              />
              <BooleanField
                value={resposta.melhora_controle_cervical || false}
                onChange={(checked) =>
                  updateResposta({ melhora_controle_cervical: checked })
                }
                label="Melhora do Controle Cervical"
                disabled={disabled}
              />
              <BooleanField
                value={resposta.tolerancia_prono_melhorou || false}
                onChange={(checked) =>
                  updateResposta({ tolerancia_prono_melhorou: checked })
                }
                label="Tolerância ao Prono Melhorou"
                disabled={disabled}
              />
              <BooleanField
                value={resposta.pais_seguindo_orientacoes || false}
                onChange={(checked) =>
                  updateResposta({ pais_seguindo_orientacoes: checked })
                }
                label="Pais Seguindo Orientações"
                disabled={disabled}
              />
            </div>

            <Field label="Observações">
              <Textarea
                value={resposta.observacoes || ''}
                onChange={(e) =>
                  updateResposta({ observacoes: e.target.value })
                }
                placeholder="Observações sobre a resposta ao tratamento..."
                disabled={disabled}
                rows={3}
              />
            </Field>
          </div>
        );
      }

      // -----------------------------------------------------------------
      // ORIENTAÇÕES (Motora)
      // -----------------------------------------------------------------
      case 'orientacoes': {
        const orientacoes = evolucao.orientacoes;

        const updateOrientacoes = (
          updates: Partial<OrientacoesMotoraAssimetria>
        ) => {
          onMotoraChange({
            orientacoes: { ...orientacoes, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <CheckboxField
                label="Posicionamento para Sono"
                checked={orientacoes.posicionamento_sono}
                onChange={(checked) =>
                  updateOrientacoes({ posicionamento_sono: checked })
                }
                disabled={disabled}
              />
              <CheckboxField
                label="Exercícios Domiciliares"
                checked={orientacoes.exercicios_domiciliares}
                onChange={(checked) =>
                  updateOrientacoes({ exercicios_domiciliares: checked })
                }
                disabled={disabled}
              />
              <CheckboxField
                label="Sinais de Alerta"
                checked={orientacoes.sinais_alerta}
                onChange={(checked) =>
                  updateOrientacoes({ sinais_alerta: checked })
                }
                disabled={disabled}
              />
              <CheckboxField
                label="Uso de Capacete (se indicado)"
                checked={orientacoes.uso_capacete || false}
                onChange={(checked) =>
                  updateOrientacoes({ uso_capacete: checked })
                }
                disabled={disabled}
              />
            </div>

            <Field label="Frequência do Tummy Time">
              <Input
                value={orientacoes.tummy_time_frequencia || ''}
                onChange={(e) =>
                  updateOrientacoes({ tummy_time_frequencia: e.target.value })
                }
                placeholder="Ex: 3x ao dia, 10-15 min cada"
                disabled={disabled}
              />
            </Field>

            <Field label="Outras Orientações">
              <Textarea
                value={orientacoes.outras || ''}
                onChange={(e) => updateOrientacoes({ outras: e.target.value })}
                placeholder="Outras orientações específicas..."
                disabled={disabled}
                rows={3}
              />
            </Field>
          </div>
        );
      }

      // -----------------------------------------------------------------
      // CONDUTA (Motora)
      // -----------------------------------------------------------------
      case 'conduta': {
        const conduta = evolucao.conduta;

        const updateConduta = (updates: Partial<CondutaMotoraAssimetria>) => {
          onMotoraChange({
            conduta: { ...conduta, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            <BooleanField
              value={conduta.manter_fisioterapia}
              onChange={(checked) =>
                updateConduta({ manter_fisioterapia: checked })
              }
              label="Manter Fisioterapia"
              disabled={disabled}
            />

            {conduta.manter_fisioterapia && (
              <Field label="Frequência Sugerida">
                <RadioButtonGroup
                  value={conduta.frequencia_sugerida}
                  onChange={(v) =>
                    updateConduta({
                      frequencia_sugerida: v as
                        | 'diaria'
                        | '2x_semana'
                        | '3x_semana'
                        | 'semanal'
                        | 'quinzenal',
                    })
                  }
                  options={[
                    { valor: 'diaria', label: 'Diária' },
                    { valor: '3x_semana', label: '3x/semana' },
                    { valor: '2x_semana', label: '2x/semana' },
                    { valor: 'semanal', label: 'Semanal' },
                    { valor: 'quinzenal', label: 'Quinzenal' },
                  ]}
                  disabled={disabled}
                />
              </Field>
            )}

            <Field label="Reavaliação em (dias)">
              <Input
                type="number"
                min={1}
                value={conduta.reavaliacao_dias || ''}
                onChange={(e) =>
                  updateConduta({
                    reavaliacao_dias: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
                placeholder="Ex: 30"
                disabled={disabled}
                className="w-full sm:w-32"
              />
            </Field>

            <BooleanField
              value={conduta.encaminhamento_medico}
              onChange={(checked) =>
                updateConduta({ encaminhamento_medico: checked })
              }
              label="Encaminhamento Médico Necessário"
              disabled={disabled}
            />

            <BooleanField
              value={conduta.indicacao_capacete || false}
              onChange={(checked) =>
                updateConduta({ indicacao_capacete: checked })
              }
              label="Indicação de Capacete Ortopédico"
              disabled={disabled}
            />

            {(conduta.encaminhamento_medico || conduta.indicacao_capacete) && (
              <Field label="Motivo">
                <Textarea
                  value={conduta.motivo_encaminhamento || ''}
                  onChange={(e) =>
                    updateConduta({ motivo_encaminhamento: e.target.value })
                  }
                  placeholder="Descreva o motivo..."
                  disabled={disabled}
                  rows={2}
                />
              </Field>
            )}

            <Field label="Observações da Conduta">
              <Textarea
                value={conduta.observacoes || ''}
                onChange={(e) => updateConduta({ observacoes: e.target.value })}
                placeholder="Observações adicionais..."
                disabled={disabled}
                rows={3}
              />
            </Field>
          </div>
        );
      }
    }
  }

  // Fallback
  return (
    <div className="text-center text-muted-foreground py-8">
      Seção não encontrada: {secaoId}
    </div>
  );
};

EvolutionSectionContent.displayName = 'EvolutionSectionContent';
