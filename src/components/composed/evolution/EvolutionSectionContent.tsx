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
  QueixaPrincipalRespiratoria,
  PadraoRespiratorio,
  SinaisDesconforto,
  AuscultaPulmonar,
  SecrecaoRespiratoria,
  EstadoGeralCrianca,
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
import { calcularMetricasCraniometriaEvolucao } from '@/types/evolucao-clinica';

// AI dev note: EvolutionSectionContent - Renderiza conteúdo de cada seção da evolução
// Suporta evolução respiratória e motora/assimetria

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
      // QUEIXA PRINCIPAL
      // -----------------------------------------------------------------
      case 'queixa': {
        const queixa = evolucao.queixa_principal;

        const updateQueixa = (
          updates: Partial<QueixaPrincipalRespiratoria>
        ) => {
          onRespiratoriaChange({
            queixa_principal: { ...queixa, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                💬 Registre em linguagem objetiva a queixa principal relatada
                pelo responsável.
              </p>
            </div>

            <Field label="Tipo de Tosse">
              <RadioButtonGroup
                value={queixa.tosse}
                onChange={(v) =>
                  updateQueixa({ tosse: v as 'seca' | 'produtiva' })
                }
                options={[
                  { valor: 'seca', label: 'Tosse Seca' },
                  { valor: 'produtiva', label: 'Tosse Produtiva' },
                ]}
                disabled={disabled}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <CheckboxField
                label="Chiado"
                checked={queixa.chiado || false}
                onChange={(checked) => updateQueixa({ chiado: checked })}
                disabled={disabled}
              />
              <CheckboxField
                label="Cansaço Respiratório"
                checked={queixa.cansaco_respiratorio || false}
                onChange={(checked) =>
                  updateQueixa({ cansaco_respiratorio: checked })
                }
                disabled={disabled}
              />
              <CheckboxField
                label="Dificuldade Alimentar"
                checked={queixa.dificuldade_alimentar || false}
                onChange={(checked) =>
                  updateQueixa({ dificuldade_alimentar: checked })
                }
                disabled={disabled}
              />
              <CheckboxField
                label="Piora Noturna"
                checked={queixa.piora_noturna || false}
                onChange={(checked) => updateQueixa({ piora_noturna: checked })}
                disabled={disabled}
              />
              <CheckboxField
                label="Infecção Recente"
                checked={queixa.infeccao_recente || false}
                onChange={(checked) =>
                  updateQueixa({ infeccao_recente: checked })
                }
                disabled={disabled}
              />
            </div>

            {queixa.tosse === 'produtiva' && (
              <>
                <Field label="Cor da Secreção">
                  <RadioButtonGroup
                    value={queixa.secrecao_cor}
                    onChange={(v) =>
                      updateQueixa({
                        secrecao_cor: v as 'clara' | 'amarelada' | 'esverdeada',
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

                <Field label="Quantidade da Secreção">
                  <RadioButtonGroup
                    value={queixa.secrecao_quantidade}
                    onChange={(v) =>
                      updateQueixa({
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
              </>
            )}

            <Field label="Observações / Episódios Recentes">
              <Textarea
                value={queixa.observacoes || ''}
                onChange={(e) => updateQueixa({ observacoes: e.target.value })}
                placeholder="Ex: Mãe relata tosse produtiva predominante à noite, com piora há 2 dias."
                disabled={disabled}
                rows={3}
              />
            </Field>
          </div>
        );
      }

      // -----------------------------------------------------------------
      // AVALIAÇÃO ANTES DA INTERVENÇÃO
      // -----------------------------------------------------------------
      case 'avaliacao_antes': {
        const avaliacao = evolucao.avaliacao_antes;

        const updatePadrao = (updates: Partial<PadraoRespiratorio>) => {
          onRespiratoriaChange({
            avaliacao_antes: {
              ...avaliacao,
              padrao_respiratorio: {
                ...avaliacao.padrao_respiratorio,
                ...updates,
              },
            },
          });
        };

        const updateSinais = (updates: Partial<SinaisDesconforto>) => {
          onRespiratoriaChange({
            avaliacao_antes: {
              ...avaliacao,
              sinais_desconforto: {
                ...avaliacao.sinais_desconforto,
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

        const updateSecrecao = (updates: Partial<SecrecaoRespiratoria>) => {
          onRespiratoriaChange({
            avaliacao_antes: {
              ...avaliacao,
              secrecao: { ...avaliacao.secrecao, ...updates },
            },
          });
        };

        return (
          <div className="space-y-8">
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

              <Field label="Ritmo">
                <RadioButtonGroup
                  value={avaliacao.padrao_respiratorio.ritmo}
                  onChange={(v) =>
                    updatePadrao({ ritmo: v as 'regular' | 'irregular' })
                  }
                  options={[
                    { valor: 'regular', label: 'Regular' },
                    { valor: 'irregular', label: 'Irregular' },
                  ]}
                  disabled={disabled}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <CheckboxField
                  label="Taquipneia"
                  checked={avaliacao.padrao_respiratorio.taquipneia}
                  onChange={(checked) => updatePadrao({ taquipneia: checked })}
                  disabled={disabled}
                />
                <CheckboxField
                  label="Uso de Musculatura Acessória"
                  checked={
                    avaliacao.padrao_respiratorio.uso_musculatura_acessoria
                  }
                  onChange={(checked) =>
                    updatePadrao({ uso_musculatura_acessoria: checked })
                  }
                  disabled={disabled}
                />
              </div>
            </div>

            {/* Sinais de Desconforto */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-orange-700">
                🔹 Sinais de Desconforto Respiratório
              </h4>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <CheckboxField
                  label="Batimento de Asa Nasal"
                  checked={avaliacao.sinais_desconforto.batimento_asa_nasal}
                  onChange={(checked) =>
                    updateSinais({ batimento_asa_nasal: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Tiragem Intercostal"
                  checked={avaliacao.sinais_desconforto.tiragem_intercostal}
                  onChange={(checked) =>
                    updateSinais({ tiragem_intercostal: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Tiragem Subcostal"
                  checked={avaliacao.sinais_desconforto.tiragem_subcostal}
                  onChange={(checked) =>
                    updateSinais({ tiragem_subcostal: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Tiragem Supraclavicular"
                  checked={avaliacao.sinais_desconforto.tiragem_supraclavicular}
                  onChange={(checked) =>
                    updateSinais({ tiragem_supraclavicular: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Gemência"
                  checked={avaliacao.sinais_desconforto.gemencia}
                  onChange={(checked) => updateSinais({ gemencia: checked })}
                  disabled={disabled}
                />
                <CheckboxField
                  label="Postura Antálgica"
                  checked={avaliacao.sinais_desconforto.postura_antalgica}
                  onChange={(checked) =>
                    updateSinais({ postura_antalgica: checked })
                  }
                  disabled={disabled}
                />
              </div>
            </div>

            {/* Ausculta Pulmonar */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-purple-700">
                🔹 Ausculta Pulmonar
              </h4>

              <Field label="Murmúrio Vesicular">
                <RadioButtonGroup
                  value={avaliacao.ausculta.murmurio_vesicular}
                  onChange={(v) =>
                    updateAusculta({
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

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <CheckboxField
                  label="Sibilos"
                  checked={avaliacao.ausculta.sibilos}
                  onChange={(checked) => updateAusculta({ sibilos: checked })}
                  disabled={disabled}
                />
                <CheckboxField
                  label="Roncos"
                  checked={avaliacao.ausculta.roncos}
                  onChange={(checked) => updateAusculta({ roncos: checked })}
                  disabled={disabled}
                />
              </div>

              <Field label="Estertores">
                <RadioButtonGroup
                  value={avaliacao.ausculta.estertores}
                  onChange={(v) =>
                    updateAusculta({
                      estertores: v as 'ausente' | 'finos' | 'grossos',
                    })
                  }
                  options={[
                    { valor: 'ausente', label: 'Ausente' },
                    { valor: 'finos', label: 'Finos' },
                    { valor: 'grossos', label: 'Grossos' },
                  ]}
                  disabled={disabled}
                />
              </Field>

              <Field label="Lateralidade/Localização">
                <Input
                  value={avaliacao.ausculta.lateralidade || ''}
                  onChange={(e) =>
                    updateAusculta({ lateralidade: e.target.value })
                  }
                  placeholder="Ex: base direita, ápice esquerdo"
                  disabled={disabled}
                />
              </Field>
            </div>

            {/* Secreção */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-green-700">🔹 Secreção</h4>

              <BooleanField
                value={avaliacao.secrecao.presente}
                onChange={(checked) => updateSecrecao({ presente: checked })}
                label="Secreção Presente"
                disabled={disabled}
              />

              {avaliacao.secrecao.presente && (
                <>
                  <Field label="Característica">
                    <RadioButtonGroup
                      value={avaliacao.secrecao.caracteristica}
                      onChange={(v) =>
                        updateSecrecao({
                          caracteristica: v as 'fluida' | 'espessa',
                        })
                      }
                      options={[
                        { valor: 'fluida', label: 'Fluida' },
                        { valor: 'espessa', label: 'Espessa' },
                      ]}
                      disabled={disabled}
                    />
                  </Field>

                  <Field label="Cor">
                    <RadioButtonGroup
                      value={avaliacao.secrecao.cor}
                      onChange={(v) =>
                        updateSecrecao({
                          cor: v as 'clara' | 'amarelada' | 'esverdeada',
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

                  <CheckboxField
                    label="Mobilizável"
                    checked={avaliacao.secrecao.mobilizavel || false}
                    onChange={(checked) =>
                      updateSecrecao({ mobilizavel: checked })
                    }
                    disabled={disabled}
                  />
                </>
              )}
            </div>

            {/* Saturação */}
            <Field label="Saturação de O₂ (%) - Em ar ambiente">
              <Input
                type="number"
                min={0}
                max={100}
                value={avaliacao.saturacao_o2 || ''}
                onChange={(e) =>
                  onRespiratoriaChange({
                    avaliacao_antes: {
                      ...avaliacao,
                      saturacao_o2: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    },
                  })
                }
                placeholder="Ex: 97"
                disabled={disabled}
                className="w-32"
              />
            </Field>
          </div>
        );
      }

      // -----------------------------------------------------------------
      // ESTADO GERAL
      // -----------------------------------------------------------------
      case 'estado_geral': {
        const estado = evolucao.estado_geral;

        const updateEstado = (updates: Partial<EstadoGeralCrianca>) => {
          onRespiratoriaChange({
            estado_geral: { ...estado, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            <Field label="Nível de Alerta" required>
              <RadioButtonGroup
                value={estado.nivel_alerta}
                onChange={(v) =>
                  updateEstado({
                    nivel_alerta: v as 'ativo' | 'sonolento' | 'irritado',
                  })
                }
                options={[
                  { valor: 'ativo', label: '😊 Ativo' },
                  { valor: 'sonolento', label: '😴 Sonolento' },
                  { valor: 'irritado', label: '😤 Irritado' },
                ]}
                disabled={disabled}
              />
            </Field>

            <Field label="Tolerância ao Manuseio" required>
              <RadioButtonGroup
                value={estado.tolerancia_manuseio}
                onChange={(v) =>
                  updateEstado({
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

            <div className="grid grid-cols-2 gap-4">
              <CheckboxField
                label="Choro Durante Atendimento"
                checked={estado.choro_durante_atendimento}
                onChange={(checked) =>
                  updateEstado({ choro_durante_atendimento: checked })
                }
                disabled={disabled}
              />
              <CheckboxField
                label="Interferência no Sono"
                checked={estado.interferencia_sono || false}
                onChange={(checked) =>
                  updateEstado({ interferencia_sono: checked })
                }
                disabled={disabled}
              />
              <CheckboxField
                label="Interferência na Alimentação"
                checked={estado.interferencia_alimentacao || false}
                onChange={(checked) =>
                  updateEstado({ interferencia_alimentacao: checked })
                }
                disabled={disabled}
              />
            </div>

            <Field label="Observações">
              <Textarea
                value={estado.observacoes || ''}
                onChange={(e) => updateEstado({ observacoes: e.target.value })}
                placeholder="Observações adicionais sobre o estado geral..."
                disabled={disabled}
                rows={3}
              />
            </Field>
          </div>
        );
      }

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
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-800">
                🩺 Descreva o que foi realizado, não apenas liste as técnicas.
              </p>
            </div>

            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-blue-700">
                Técnicas de Desobstrução Brônquica
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <CheckboxField
                  label="AFE (Aumento do Fluxo Expiratório)"
                  checked={intervencao.afe}
                  onChange={(checked) => updateIntervencao({ afe: checked })}
                  disabled={disabled}
                />
                <CheckboxField
                  label="DRR (Drenagem Rítmica Respiratória)"
                  checked={intervencao.drr}
                  onChange={(checked) => updateIntervencao({ drr: checked })}
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
              </div>
            </div>

            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-purple-700">Outras Técnicas</h4>

              <div className="grid grid-cols-2 gap-4">
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
                  label="Aspiração"
                  checked={intervencao.aspiracao}
                  onChange={(checked) =>
                    updateIntervencao({ aspiracao: checked })
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
            </div>

            <Field label="Outras Técnicas Utilizadas">
              <Textarea
                value={intervencao.outras_tecnicas || ''}
                onChange={(e) =>
                  updateIntervencao({ outras_tecnicas: e.target.value })
                }
                placeholder="Descreva outras técnicas..."
                disabled={disabled}
                rows={2}
              />
            </Field>

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
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                📈 Este é um dos pontos mais importantes da evolução. Registre a
                resposta imediata ao tratamento.
              </p>
            </div>

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

            {depois.eliminacao_secrecao && (
              <Field label="Quantidade de Secreção Eliminada">
                <RadioButtonGroup
                  value={depois.quantidade_secrecao_eliminada}
                  onChange={(v) =>
                    updateDepois({
                      quantidade_secrecao_eliminada: v as
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
            )}

            <Field label="Mudança na Ausculta Pulmonar">
              <Textarea
                value={depois.mudanca_ausculta || ''}
                onChange={(e) =>
                  updateDepois({ mudanca_ausculta: e.target.value })
                }
                placeholder="Ex: Redução de roncos difusos, melhora do MV..."
                disabled={disabled}
                rows={2}
              />
            </Field>

            <Field label="Saturação de O₂ (%) - Após Intervenção">
              <Input
                type="number"
                min={0}
                max={100}
                value={depois.saturacao_o2 || ''}
                onChange={(e) =>
                  updateDepois({
                    saturacao_o2: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
                placeholder="Ex: 98"
                disabled={disabled}
                className="w-32"
              />
            </Field>

            <Field label="Comportamento da Criança Após a Sessão">
              <RadioButtonGroup
                value={depois.comportamento_crianca}
                onChange={(v) =>
                  updateDepois({
                    comportamento_crianca: v as
                      | 'calmo'
                      | 'sonolento'
                      | 'irritado'
                      | 'sem_mudanca',
                  })
                }
                options={[
                  { valor: 'calmo', label: '😊 Calmo' },
                  { valor: 'sonolento', label: '😴 Sonolento' },
                  { valor: 'irritado', label: '😤 Irritado' },
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
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-blue-700">
                Orientações Fornecidas
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <CheckboxField
                  label="Higiene Nasal"
                  checked={orientacoes.higiene_nasal}
                  onChange={(checked) =>
                    updateOrientacoes({ higiene_nasal: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Posicionamento para Dormir"
                  checked={orientacoes.posicionamento_dormir}
                  onChange={(checked) =>
                    updateOrientacoes({ posicionamento_dormir: checked })
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
              </div>
            </div>

            <Field label="Frequência Sugerida das Sessões">
              <Input
                value={orientacoes.frequencia_sessoes || ''}
                onChange={(e) =>
                  updateOrientacoes({ frequencia_sessoes: e.target.value })
                }
                placeholder="Ex: 2x por semana"
                disabled={disabled}
              />
            </Field>

            <Field label="Cuidados Domiciliares">
              <Textarea
                value={orientacoes.cuidados_domiciliares || ''}
                onChange={(e) =>
                  updateOrientacoes({ cuidados_domiciliares: e.target.value })
                }
                placeholder="Descreva os cuidados domiciliares orientados..."
                disabled={disabled}
                rows={3}
              />
            </Field>

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
            <BooleanField
              value={conduta.manter_fisioterapia}
              onChange={(checked) =>
                updateConduta({ manter_fisioterapia: checked })
              }
              label="Manter Fisioterapia Respiratória"
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
                        | 'semanal',
                    })
                  }
                  options={[
                    { valor: 'diaria', label: 'Diária' },
                    { valor: '3x_semana', label: '3x/semana' },
                    { valor: '2x_semana', label: '2x/semana' },
                    { valor: 'semanal', label: 'Semanal' },
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
                placeholder="Ex: 7"
                disabled={disabled}
                className="w-32"
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

            {conduta.encaminhamento_medico && (
              <Field label="Motivo do Encaminhamento">
                <Textarea
                  value={conduta.motivo_encaminhamento || ''}
                  onChange={(e) =>
                    updateConduta({ motivo_encaminhamento: e.target.value })
                  }
                  placeholder="Descreva o motivo do encaminhamento..."
                  disabled={disabled}
                  rows={2}
                />
              </Field>
            )}

            <BooleanField
              value={conduta.alta_parcial}
              onChange={(checked) => updateConduta({ alta_parcial: checked })}
              label="Alta Parcial / Acompanhamento"
              disabled={disabled}
            />

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

              <div className="grid grid-cols-2 gap-4">
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
                className="w-32"
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
