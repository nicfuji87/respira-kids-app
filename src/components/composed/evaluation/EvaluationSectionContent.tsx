import React from 'react';
import {
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  Info,
  Clock,
} from 'lucide-react';
import { Label } from '@/components/primitives/label';
import { Input } from '@/components/primitives/input';
import { Textarea } from '@/components/primitives/textarea';
import { Badge } from '@/components/primitives/badge';
import { cn } from '@/lib/utils';
import {
  BooleanToggle,
  RadioButtonGroup,
  CheckboxGroup,
  ScaleSelector,
} from './inputs';
import { EvolutionEditor } from '@/components/composed/EvolutionEditor';
import { PatientRegistrationSection } from './PatientRegistrationSection';
import type {
  AvaliacaoClinica,
  AvaliacaoClinicaUpdate,
  AvaliacaoSecao,
  Goniometria,
  FuncoesSensoriais,
  MedidasCraniometricas,
  AssimetriaCraniana,
  FSOS2,
  FSOS2ItemsPorPosicao,
  FuncionalidadeCervical,
  ObjetivosTratamento,
  GestacaoInfo,
  MarcosMotoresAtingidos,
  TipoAssistenciaVentilatoria,
  TensaoNeuromeningeaDetalhada,
  TensaoNeuromeningeaAvaliacao,
  TensaoNeuromeningeaSintoma,
  TorcicoloDetalhado,
  AtitudeCabeca,
  ElevacaoOmbro,
  TonusECOM,
  LocalizacaoNodulo,
  TamanhoNodulo,
  TorcicoloTipoClinico,
  EarShift,
  BossingFrontal,
  RespostaPostural,
  ManutencaoLinhaMeadia,
  AlcanceLinhaMeadia,
  ToleranciaTummyTime,
  CargaPesoProno,
  ControleCabecaProno,
  HeadLag,
  AtivacaoFlexores,
  PadraoLandau,
  AIMSDetalhada,
} from '@/types/avaliacoes-clinicas';
import {
  ASSIMETRIAS_OPCOES,
  APRESENTACAO_FETAL_OPCOES,
  LIQUIDO_AMNIOTICO_OPCOES,
  INSTRUMENTOS_PARTO_OPCOES,
  ESTADO_EMOCIONAL_OPCOES,
  ONDE_DORME_OPCOES,
  QUALIDADE_SONO_OPCOES,
  POSICAO_PREFERENCIA_OPCOES,
  SIM_NAO_SUSPEITA_OPCOES,
  TIPO_REFLUXO_OPCOES,
  LOCAL_INTERNACAO_OPCOES,
  PLAGIOCEFALIA_TIPO_OPCOES,
  OUTRAS_ASSIMETRIAS_OPCOES,
  REAVALIACAO_OPCOES,
  MARCOS_MOTORES,
  FSOS2_ITENS,
  FSOS2_PONTUACAO,
  FSOS2_POSICOES,
  MFS_PONTUACAO,
  MFS_REFERENCIA_IDADE,
  TIPOS_ASSISTENCIA_VENTILATORIA,
  GONIOMETRIA_REFERENCIA_IDADE,
  GONIOMETRIA_CLASSIFICACAO_ASSIMETRIA,
  GONIOMETRIA_QUALIDADE_OPCOES,
  GONIOMETRIA_SENSACAO_FINAL_OPCOES,
  TENSAO_SINTOMAS_OPCOES,
  TENSAO_END_FEEL_OPCOES,
  RASTREIO_VISUAL_OPCOES,
  CONTATO_VISUAL_OPCOES,
  ALINHAMENTO_OCULAR_OPCOES,
  VEDAMENTO_LABIAL_OPCOES,
  ANATOMIA_LINGUA_OPCOES,
  FRENECTOMIA_OPCOES,
  COORDENACAO_SDR_OPCOES,
  REFLEXO_GAG_OPCOES,
  LOCALIZACAO_SONORA_OPCOES,
  REACAO_RUIDOS_OPCOES,
  ATITUDE_CABECA_OPCOES,
  ELEVACAO_OMBRO_OPCOES,
  TONUS_ECOM_OPCOES,
  LOCALIZACAO_NODULO_OPCOES,
  TAMANHO_NODULO_OPCOES,
  TIPO_CLINICO_TORCICOLO_OPCOES,
  calcularGrauSeveridadeTorcicolo,
  detectarInconsistenciasTorcicolo,
  PLAGIOCEFALIA_CLASSIFICACAO,
  BRAQUICEFALIA_CLASSIFICACAO,
  EAR_SHIFT_OPCOES,
  BOSSING_FRONTAL_OPCOES,
  calcularMetricasCraniometricas,
  getCorPlagiocefalia,
  getCorBraquicefalia,
  MANUTENCAO_LINHA_MEDIA_OPCOES,
  ALCANCE_LINHA_MEDIA_OPCOES,
  TOLERANCIA_TUMMY_TIME_OPCOES,
  CARGA_PESO_PRONO_OPCOES,
  CONTROLE_CABECA_PRONO_OPCOES,
  HEAD_LAG_OPCOES,
  ATIVACAO_FLEXORES_OPCOES,
  PADRAO_LANDAU_OPCOES,
  AIMS_REFERENCIA_PERCENTIL,
  calcularPercentilAIMS,
  getCorClassificacaoAIMS,
  AIMS_ITENS_PRONO,
  AIMS_ITENS_SUPINO,
  AIMS_ITENS_SENTADO,
  AIMS_ITENS_EM_PE,
  calcularSeveridadeAutomatica,
  gerarDiagnosticoAutomatico,
} from '@/types/avaliacoes-clinicas';

// AI dev note: EvaluationSectionContent - Renderiza o conteúdo de cada seção da avaliação
// Cada seção tem seus campos específicos com componentes otimizados para preenchimento rápido

interface EvaluationSectionContentProps {
  secao: AvaliacaoSecao;
  avaliacao: AvaliacaoClinica;
  onChange: (updates: Partial<AvaliacaoClinicaUpdate>) => void;
  isReadOnly: boolean;
  patientName?: string;
  patientAgeInMonths?: number; // Idade do paciente em meses para marcos motores
}

export const EvaluationSectionContent: React.FC<
  EvaluationSectionContentProps
> = ({
  secao,
  avaliacao,
  onChange,
  isReadOnly,
  patientName,
  patientAgeInMonths = 0,
}) => {
  // Helper para renderizar campo com label
  const Field = ({
    label,
    children,
    className,
  }: {
    label: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <div className={cn('space-y-2', className)}>
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );

  // Renderizar conteúdo baseado na seção
  const renderContent = () => {
    switch (secao.id) {
      // =====================================================
      // SEÇÃO 1: Cadastro do Paciente
      // =====================================================
      case 'cadastro':
        return (
          <div className="space-y-6">
            {/* Paciente, Pai, Mãe, Pediatra e Obstetra */}
            <PatientRegistrationSection
              patientId={avaliacao.pessoa_id}
              patientName={patientName}
              avaliacaoObstetraId={avaliacao.obstetra_id}
              onObstetraChange={(obstetraId) =>
                onChange({ obstetra_id: obstetraId })
              }
              isReadOnly={isReadOnly}
            />
          </div>
        );

      // =====================================================
      // SEÇÃO 2: Queixa Principal
      // =====================================================
      case 'queixa':
        return (
          <Field label="Queixa Principal / Relato dos Pais">
            <EvolutionEditor
              value={avaliacao.queixa_principal || ''}
              onChange={(value) => onChange({ queixa_principal: value })}
              disabled={isReadOnly}
              placeholder="Descreva a queixa principal relatada pelos pais..."
            />
          </Field>
        );

      // =====================================================
      // SEÇÃO 3: Pré-natal
      // =====================================================
      case 'prenatal': {
        const gestacoes = (avaliacao.gestacoes_info || []) as GestacaoInfo[];
        const numGestacoes = avaliacao.numero_gestacoes || 1;
        const isGestacaoMultipla = numGestacoes > 1;

        // Função para atualizar gestação específica
        const updateGestacao = (
          index: number,
          field: keyof GestacaoInfo,
          value: number | string | undefined
        ) => {
          const novasGestacoes = [...gestacoes];
          if (!novasGestacoes[index]) {
            novasGestacoes[index] = { numero: index + 1 };
          }
          novasGestacoes[index] = { ...novasGestacoes[index], [field]: value };
          onChange({ gestacoes_info: novasGestacoes });
        };

        return (
          <div className="space-y-6">
            <Field label="Número de gestações">
              <Input
                type="number"
                value={avaliacao.numero_gestacoes ?? ''}
                onChange={(e) => {
                  const num = e.target.value ? parseInt(e.target.value) : null;
                  onChange({
                    numero_gestacoes: num,
                    gestacao_multipla: num !== null && num > 1,
                  });
                }}
                disabled={isReadOnly}
                min={1}
                max={10}
                className="w-32"
              />
              {isGestacaoMultipla && (
                <p className="text-xs text-primary mt-1 font-medium">
                  Gestação múltipla ({numGestacoes} gestações)
                </p>
              )}
            </Field>

            {/* Idade Gestacional */}
            {!isGestacaoMultipla ? (
              <Field label="Idade Gestacional (semanas)">
                <Input
                  type="number"
                  min={20}
                  max={45}
                  value={avaliacao.idade_gestacional_semanas ?? ''}
                  onChange={(e) =>
                    onChange({
                      idade_gestacional_semanas: e.target.value
                        ? parseInt(e.target.value)
                        : null,
                    })
                  }
                  disabled={isReadOnly}
                  placeholder="Ex: 38"
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Entre 20 e 45 semanas
                </p>
              </Field>
            ) : (
              <div className="space-y-4">
                <Label className="text-sm font-medium">
                  Idade Gestacional de cada gestação
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Array.from({ length: numGestacoes }).map((_, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg"
                    >
                      <span className="text-sm font-medium text-muted-foreground w-24">
                        Gestação {index + 1}:
                      </span>
                      <Input
                        type="number"
                        min={20}
                        max={45}
                        value={
                          gestacoes[index]?.idade_gestacional_semanas ?? ''
                        }
                        onChange={(e) =>
                          updateGestacao(
                            index,
                            'idade_gestacional_semanas',
                            e.target.value
                              ? parseInt(e.target.value)
                              : undefined
                          )
                        }
                        disabled={isReadOnly}
                        placeholder="Semanas"
                        className="w-24"
                      />
                      <span className="text-xs text-muted-foreground">sem</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Field label="Líquido amniótico">
              <RadioButtonGroup
                value={avaliacao.liquido_amniotico}
                onChange={(v) =>
                  onChange({
                    liquido_amniotico:
                      v as AvaliacaoClinica['liquido_amniotico'],
                  })
                }
                options={LIQUIDO_AMNIOTICO_OPCOES}
                disabled={isReadOnly}
              />
              {avaliacao.liquido_amniotico === 'outro' && (
                <Input
                  value={avaliacao.liquido_amniotico_outro || ''}
                  onChange={(e) =>
                    onChange({ liquido_amniotico_outro: e.target.value })
                  }
                  disabled={isReadOnly}
                  placeholder="Especifique..."
                  className="mt-2"
                />
              )}
            </Field>

            <Field label="Apresentação fetal">
              <RadioButtonGroup
                value={avaliacao.apresentacao_fetal}
                onChange={(v) =>
                  onChange({
                    apresentacao_fetal:
                      v as AvaliacaoClinica['apresentacao_fetal'],
                  })
                }
                options={APRESENTACAO_FETAL_OPCOES}
                disabled={isReadOnly}
              />
              {avaliacao.apresentacao_fetal === 'outra' && (
                <Input
                  value={avaliacao.apresentacao_fetal_outra || ''}
                  onChange={(e) =>
                    onChange({ apresentacao_fetal_outra: e.target.value })
                  }
                  disabled={isReadOnly}
                  placeholder="Especifique..."
                  className="mt-2"
                />
              )}
            </Field>

            <Field label="Encaixe precoce?">
              <BooleanToggle
                value={avaliacao.encaixe_precoce}
                onChange={(v) => onChange({ encaixe_precoce: v })}
                disabled={isReadOnly}
              />
            </Field>

            <Field label="Circular de cordão?">
              <BooleanToggle
                value={avaliacao.circular_cordao}
                onChange={(v) => onChange({ circular_cordao: v })}
                disabled={isReadOnly}
              />
            </Field>

            <Field label="Outras intercorrências">
              <EvolutionEditor
                value={avaliacao.intercorrencias_prenatais || ''}
                onChange={(value) =>
                  onChange({ intercorrencias_prenatais: value })
                }
                disabled={isReadOnly}
                placeholder="Descreva outras intercorrências pré-natais..."
              />
            </Field>
          </div>
        );
      }

      // =====================================================
      // SEÇÃO 3: Peri-natal
      // =====================================================
      case 'perinatal':
        return (
          <div className="space-y-6">
            <Field label="Tipo de parto">
              <RadioButtonGroup
                value={avaliacao.tipo_parto}
                onChange={(v) =>
                  onChange({ tipo_parto: v as AvaliacaoClinica['tipo_parto'] })
                }
                options={[
                  { valor: 'normal', label: 'Normal' },
                  { valor: 'cesarea', label: 'Cesárea' },
                ]}
                disabled={isReadOnly}
              />
            </Field>

            <Field label="Instrumentos / Intervenções utilizados">
              <CheckboxGroup
                value={avaliacao.instrumentos_parto}
                onChange={(v) => {
                  const instrumentos =
                    v as AvaliacaoClinica['instrumentos_parto'];
                  // Atualiza também os campos legados para compatibilidade
                  onChange({
                    instrumentos_parto: instrumentos,
                    forceps: instrumentos?.includes('forceps') || false,
                    vacuo_extrator:
                      instrumentos?.includes('vacuo_extrator') || false,
                  });
                }}
                options={INSTRUMENTOS_PARTO_OPCOES}
                disabled={isReadOnly}
              />
              {avaliacao.instrumentos_parto?.includes('outro') && (
                <Input
                  value={avaliacao.instrumentos_parto_outro || ''}
                  onChange={(e) =>
                    onChange({ instrumentos_parto_outro: e.target.value })
                  }
                  disabled={isReadOnly}
                  placeholder="Especifique o instrumento/intervenção..."
                  className="mt-2"
                />
              )}
              {(!avaliacao.instrumentos_parto ||
                avaliacao.instrumentos_parto.length === 0) && (
                <p className="text-xs text-muted-foreground mt-1">
                  Nenhum instrumento selecionado = parto sem intervenções
                </p>
              )}
            </Field>

            <Field label="Duração do trabalho de parto">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={72}
                  value={
                    avaliacao.duracao_trabalho_parto_minutos
                      ? Math.floor(
                          avaliacao.duracao_trabalho_parto_minutos / 60
                        )
                      : ''
                  }
                  onChange={(e) => {
                    const horas = parseInt(e.target.value) || 0;
                    const minutosAtuais =
                      (avaliacao.duracao_trabalho_parto_minutos || 0) % 60;
                    onChange({
                      duracao_trabalho_parto_minutos:
                        horas * 60 + minutosAtuais,
                    });
                  }}
                  disabled={isReadOnly}
                  placeholder="0"
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">h</span>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={
                    avaliacao.duracao_trabalho_parto_minutos
                      ? avaliacao.duracao_trabalho_parto_minutos % 60
                      : ''
                  }
                  onChange={(e) => {
                    const minutos = parseInt(e.target.value) || 0;
                    const horasAtuais = Math.floor(
                      (avaliacao.duracao_trabalho_parto_minutos || 0) / 60
                    );
                    onChange({
                      duracao_trabalho_parto_minutos:
                        horasAtuais * 60 + minutos,
                    });
                  }}
                  disabled={isReadOnly}
                  placeholder="0"
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">min</span>
              </div>
            </Field>

            <Field label="Intercorrências">
              <EvolutionEditor
                value={avaliacao.intercorrencias_perinatais || ''}
                onChange={(value) =>
                  onChange({ intercorrencias_perinatais: value })
                }
                disabled={isReadOnly}
                placeholder="Descreva intercorrências durante o parto..."
              />
            </Field>
          </div>
        );

      // =====================================================
      // SEÇÃO 4: Pós-natal
      // =====================================================
      case 'posnatal':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Field label="APGAR 1 minuto">
                <ScaleSelector
                  value={avaliacao.apgar_1min}
                  onChange={(v) => onChange({ apgar_1min: v })}
                  min={0}
                  max={10}
                  disabled={isReadOnly}
                />
              </Field>
              <Field label="APGAR 5 minutos">
                <ScaleSelector
                  value={avaliacao.apgar_5min}
                  onChange={(v) => onChange({ apgar_5min: v })}
                  min={0}
                  max={10}
                  disabled={isReadOnly}
                />
              </Field>
            </div>

            <Field label="Tempo de internação (dias)">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={365}
                  value={avaliacao.tempo_internacao_dias ?? ''}
                  onChange={(e) =>
                    onChange({
                      tempo_internacao_dias: e.target.value
                        ? parseInt(e.target.value)
                        : null,
                    })
                  }
                  disabled={isReadOnly}
                  placeholder="0"
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">dias</span>
              </div>
            </Field>

            <Field label="Local de internação">
              <RadioButtonGroup
                value={avaliacao.local_internacao}
                onChange={(v) =>
                  onChange({
                    local_internacao: v as AvaliacaoClinica['local_internacao'],
                  })
                }
                options={LOCAL_INTERNACAO_OPCOES}
                disabled={isReadOnly}
              />
              {avaliacao.local_internacao === 'outro' && (
                <Input
                  value={avaliacao.local_internacao_outro || ''}
                  onChange={(e) =>
                    onChange({ local_internacao_outro: e.target.value })
                  }
                  disabled={isReadOnly}
                  placeholder="Especifique..."
                  className="mt-2"
                />
              )}
            </Field>

            <Field label="Assistência ventilatória?">
              <BooleanToggle
                value={avaliacao.assistencia_ventilatoria}
                onChange={(v) => onChange({ assistencia_ventilatoria: v })}
                disabled={isReadOnly}
              />
              {avaliacao.assistencia_ventilatoria && (
                <div className="mt-4 space-y-4 p-4 bg-muted/30 rounded-lg border">
                  <Field label="Tipo(s) de assistência ventilatória">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {TIPOS_ASSISTENCIA_VENTILATORIA.map((tipo) => {
                        const tiposSelecionados =
                          (avaliacao.tipos_assistencia_ventilatoria ||
                            []) as TipoAssistenciaVentilatoria[];
                        const isSelected = tiposSelecionados.includes(
                          tipo.valor as TipoAssistenciaVentilatoria
                        );

                        return (
                          <button
                            key={tipo.valor}
                            type="button"
                            onClick={() => {
                              if (isReadOnly) return;
                              const novosValores = isSelected
                                ? tiposSelecionados.filter(
                                    (v) => v !== tipo.valor
                                  )
                                : [
                                    ...tiposSelecionados,
                                    tipo.valor as TipoAssistenciaVentilatoria,
                                  ];
                              onChange({
                                tipos_assistencia_ventilatoria: novosValores,
                              });
                            }}
                            disabled={isReadOnly}
                            className={cn(
                              'flex items-start gap-3 p-3 rounded-lg border-2 transition-all text-left',
                              isSelected
                                ? 'bg-primary/10 border-primary'
                                : 'bg-background border-border hover:border-primary/50',
                              isReadOnly && 'cursor-default'
                            )}
                          >
                            <div
                              className={cn(
                                'w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border-2 mt-0.5',
                                isSelected
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'border-muted-foreground/30'
                              )}
                            >
                              {isSelected && (
                                <svg
                                  className="w-3 h-3"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={3}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-sm">
                                {tipo.label}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {tipo.descricao}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </Field>

                  {/* Campo para "Outro" */}
                  {(
                    (avaliacao.tipos_assistencia_ventilatoria ||
                      []) as TipoAssistenciaVentilatoria[]
                  ).includes('outro') && (
                    <Field label="Especifique outro tipo">
                      <Input
                        value={
                          avaliacao.tipo_assistencia_ventilatoria_outro || ''
                        }
                        onChange={(e) =>
                          onChange({
                            tipo_assistencia_ventilatoria_outro: e.target.value,
                          })
                        }
                        disabled={isReadOnly}
                        placeholder="Descreva o tipo de assistência..."
                      />
                    </Field>
                  )}

                  {/* Tempo de assistência */}
                  <Field label="Tempo de assistência ventilatória">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={365}
                        value={
                          avaliacao.tempo_assistencia_ventilatoria_dias ?? ''
                        }
                        onChange={(e) =>
                          onChange({
                            tempo_assistencia_ventilatoria_dias: e.target.value
                              ? parseInt(e.target.value)
                              : null,
                          })
                        }
                        disabled={isReadOnly}
                        placeholder="0"
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">
                        dias
                      </span>
                    </div>
                  </Field>
                </div>
              )}
            </Field>

            <Field label="Idade em que se notou inclinação da cabeça (dias)">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={365}
                  value={avaliacao.idade_inclinacao_cabeca_dias ?? ''}
                  onChange={(e) =>
                    onChange({
                      idade_inclinacao_cabeca_dias: e.target.value
                        ? parseInt(e.target.value)
                        : null,
                    })
                  }
                  disabled={isReadOnly}
                  placeholder="0"
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">dias</span>
              </div>
            </Field>

            <Field label="Assimetrias percebidas">
              <CheckboxGroup
                value={avaliacao.assimetrias_percebidas}
                onChange={(v) =>
                  onChange({
                    assimetrias_percebidas:
                      v as AvaliacaoClinica['assimetrias_percebidas'],
                  })
                }
                options={ASSIMETRIAS_OPCOES}
                disabled={isReadOnly}
              />
              {avaliacao.assimetrias_percebidas?.includes('outra') && (
                <Input
                  value={avaliacao.assimetrias_percebidas_outra || ''}
                  onChange={(e) =>
                    onChange({ assimetrias_percebidas_outra: e.target.value })
                  }
                  disabled={isReadOnly}
                  placeholder="Especifique a assimetria..."
                  className="mt-2"
                />
              )}
            </Field>
          </div>
        );

      // =====================================================
      // SEÇÃO 5: Características do Bebê
      // =====================================================
      case 'caracteristicas':
        return (
          <div className="space-y-6">
            <Field label="Estado emocional geral">
              <CheckboxGroup
                value={avaliacao.estado_emocional_opcoes}
                onChange={(v) =>
                  onChange({
                    estado_emocional_opcoes:
                      v as AvaliacaoClinica['estado_emocional_opcoes'],
                  })
                }
                options={ESTADO_EMOCIONAL_OPCOES}
                disabled={isReadOnly}
              />
            </Field>

            <Field label="Onde dorme">
              <RadioButtonGroup
                value={avaliacao.onde_dorme_opcao}
                onChange={(v) =>
                  onChange({
                    onde_dorme_opcao: v as AvaliacaoClinica['onde_dorme_opcao'],
                  })
                }
                options={ONDE_DORME_OPCOES}
                disabled={isReadOnly}
              />
              {avaliacao.onde_dorme_opcao === 'outro' && (
                <Input
                  value={avaliacao.onde_dorme_outro || ''}
                  onChange={(e) =>
                    onChange({ onde_dorme_outro: e.target.value })
                  }
                  disabled={isReadOnly}
                  placeholder="Especifique onde dorme..."
                  className="mt-2"
                />
              )}
            </Field>

            <Field label="Qualidade do sono">
              <RadioButtonGroup
                value={avaliacao.qualidade_sono_opcao}
                onChange={(v) =>
                  onChange({
                    qualidade_sono_opcao:
                      v as AvaliacaoClinica['qualidade_sono_opcao'],
                  })
                }
                options={QUALIDADE_SONO_OPCOES}
                disabled={isReadOnly}
              />
            </Field>

            <Field label="Posição de preferência">
              <RadioButtonGroup
                value={avaliacao.posicao_preferencia_opcao}
                onChange={(v) =>
                  onChange({
                    posicao_preferencia_opcao:
                      v as AvaliacaoClinica['posicao_preferencia_opcao'],
                  })
                }
                options={POSICAO_PREFERENCIA_OPCOES}
                disabled={isReadOnly}
              />
            </Field>

            <Field label="Refluxo?">
              <RadioButtonGroup
                value={avaliacao.refluxo_status}
                onChange={(v) => {
                  const status = v as AvaliacaoClinica['refluxo_status'];
                  onChange({
                    refluxo_status: status,
                    refluxo: status === 'sim',
                    refluxo_tipo:
                      status !== 'sim' ? null : avaliacao.refluxo_tipo,
                  });
                }}
                options={SIM_NAO_SUSPEITA_OPCOES}
                disabled={isReadOnly}
              />
              {avaliacao.refluxo_status === 'sim' && (
                <div className="mt-3 p-3 bg-muted/30 rounded-lg">
                  <Label className="text-xs text-muted-foreground mb-2 block">
                    Tipo de refluxo:
                  </Label>
                  <RadioButtonGroup
                    value={avaliacao.refluxo_tipo}
                    onChange={(v) =>
                      onChange({
                        refluxo_tipo: v as AvaliacaoClinica['refluxo_tipo'],
                      })
                    }
                    options={TIPO_REFLUXO_OPCOES}
                    disabled={isReadOnly}
                  />
                </div>
              )}
            </Field>

            <Field label="APLV (Alergia à Proteína do Leite de Vaca)?">
              <RadioButtonGroup
                value={avaliacao.aplv}
                onChange={(v) =>
                  onChange({ aplv: v as AvaliacaoClinica['aplv'] })
                }
                options={SIM_NAO_SUSPEITA_OPCOES}
                disabled={isReadOnly}
              />
            </Field>

            <Field label="Disquesia?">
              <RadioButtonGroup
                value={avaliacao.disquesia}
                onChange={(v) =>
                  onChange({ disquesia: v as AvaliacaoClinica['disquesia'] })
                }
                options={SIM_NAO_SUSPEITA_OPCOES}
                disabled={isReadOnly}
              />
            </Field>

            <Field label="Habilidades motoras presentes (idade de aparecimento)">
              <EvolutionEditor
                value={avaliacao.habilidades_motoras || ''}
                onChange={(value) => onChange({ habilidades_motoras: value })}
                disabled={isReadOnly}
                placeholder="Descreva as habilidades motoras e quando apareceram..."
              />
            </Field>
          </div>
        );

      // =====================================================
      // SEÇÃO 7: Marcos Motores
      // =====================================================
      case 'marcos_motores': {
        // Filtra marcos motores baseado na idade do paciente
        const marcosRelevantes = MARCOS_MOTORES.filter(
          (marco) =>
            marco.idade_max_meses <= patientAgeInMonths ||
            marco.idade_min_meses <= patientAgeInMonths
        );

        // Agrupa marcos por faixa etária
        const marcosPorFaixa = marcosRelevantes.reduce(
          (acc, marco) => {
            if (!acc[marco.faixa]) {
              acc[marco.faixa] = [];
            }
            acc[marco.faixa].push(marco);
            return acc;
          },
          {} as Record<string, typeof MARCOS_MOTORES>
        );

        const marcosAtingidos = (avaliacao.marcos_motores_atingidos ||
          {}) as MarcosMotoresAtingidos;

        const toggleMarco = (marcoId: string) => {
          const novosMarcosAtingidos = {
            ...marcosAtingidos,
            [marcoId]: !marcosAtingidos[marcoId],
          };
          onChange({ marcos_motores_atingidos: novosMarcosAtingidos });
        };

        // Conta marcos atingidos por faixa
        const contarAtingidos = (faixa: string) => {
          const marcosNaFaixa = marcosPorFaixa[faixa] || [];
          return marcosNaFaixa.filter((m) => marcosAtingidos[m.id]).length;
        };

        return (
          <div className="space-y-6">
            <div className="p-3 bg-primary/10 rounded-lg">
              <p className="text-sm">
                <span className="font-medium">Idade do paciente:</span>{' '}
                {patientAgeInMonths < 12
                  ? `${patientAgeInMonths} ${patientAgeInMonths === 1 ? 'mês' : 'meses'}`
                  : `${Math.floor(patientAgeInMonths / 12)} ${Math.floor(patientAgeInMonths / 12) === 1 ? 'ano' : 'anos'}${patientAgeInMonths % 12 > 0 ? ` e ${patientAgeInMonths % 12} ${patientAgeInMonths % 12 === 1 ? 'mês' : 'meses'}` : ''}`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Marque os marcos motores que o paciente já atingiu
              </p>
            </div>

            {Object.keys(marcosPorFaixa).length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                Nenhum marco motor para a idade informada
              </p>
            ) : (
              Object.entries(marcosPorFaixa).map(([faixa, marcos]) => (
                <div key={faixa} className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2 flex justify-between items-center">
                    <h4 className="font-semibold text-sm">{faixa}</h4>
                    <span className="text-xs text-muted-foreground">
                      {contarAtingidos(faixa)}/{marcos.length} atingidos
                    </span>
                  </div>
                  <div className="divide-y">
                    {marcos.map((marco) => (
                      <label
                        key={marco.id}
                        className={cn(
                          'flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors',
                          isReadOnly && 'cursor-default'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={!!marcosAtingidos[marco.id]}
                          onChange={() => !isReadOnly && toggleMarco(marco.id)}
                          disabled={isReadOnly}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span
                          className={cn(
                            'text-sm',
                            marcosAtingidos[marco.id] &&
                              'text-primary font-medium'
                          )}
                        >
                          {marco.descricao}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        );
      }

      // =====================================================
      // SEÇÃO 8: Tipo de Torcicolo (inclui observação postural)
      // =====================================================
      case 'torcicolo': {
        const torc = (avaliacao.torcicolo_detalhado ||
          {}) as TorcicoloDetalhado;

        // Calcular déficit de rotação da goniometria (se disponível)
        const gonioData = avaliacao.goniometria || {};
        const rotacaoDireita = gonioData.rotacao?.passiva_direita || 0;
        const rotacaoEsquerda = gonioData.rotacao?.passiva_esquerda || 0;
        const deficitRotacao = Math.abs(rotacaoDireita - rotacaoEsquerda);

        // Verificar se há nódulo em algum lado
        const temNoduloDir =
          torc.ecom_direito_nodulo && torc.ecom_direito_nodulo !== 'ausente';
        const temNoduloEsq =
          torc.ecom_esquerdo_nodulo && torc.ecom_esquerdo_nodulo !== 'ausente';
        const temNodulo = temNoduloDir || temNoduloEsq;

        // Calcular grau automaticamente
        const grauCalculado = patientAgeInMonths
          ? calcularGrauSeveridadeTorcicolo(
              patientAgeInMonths,
              deficitRotacao,
              !!temNodulo
            )
          : null;

        // Detectar inconsistências
        const inconsistencias = torc.tipo_clinico
          ? detectarInconsistenciasTorcicolo(
              torc.tipo_clinico,
              deficitRotacao,
              !!temNodulo
            )
          : [];

        // Helper para atualizar torcicolo detalhado
        const updateTorcicolo = (updates: Partial<TorcicoloDetalhado>) => {
          onChange({
            torcicolo_detalhado: { ...torc, ...updates },
            // Atualiza campos legados para compatibilidade
            tem_torcicolo: updates.tipo_clinico
              ? updates.tipo_clinico !== 'POST' || deficitRotacao > 0
              : avaliacao.tem_torcicolo,
          });
        };

        return (
          <div className="space-y-6">
            {/* Explicação */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                    Classificação do Torcicolo
                  </h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Avalie a postura, realize a palpação do ECOM e classifique o
                    tipo. O sistema calculará automaticamente o grau de
                    severidade baseado nos dados coletados (idade, goniometria e
                    presença de nódulo).
                  </p>
                </div>
              </div>
            </div>

            {/* SEÇÃO A: INSPEÇÃO VISUAL */}
            <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                <span className="bg-purple-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">
                  A
                </span>
                Inspeção Visual (Postura)
              </h4>

              <div className="space-y-4">
                <Field label="Atitude da Cabeça">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {ATITUDE_CABECA_OPCOES.map((opt) => (
                      <button
                        key={opt.valor}
                        type="button"
                        onClick={() =>
                          !isReadOnly &&
                          updateTorcicolo({
                            atitude_cabeca: opt.valor as AtitudeCabeca,
                          })
                        }
                        disabled={isReadOnly}
                        className={cn(
                          'p-3 rounded-lg border text-left transition-all',
                          torc.atitude_cabeca === opt.valor
                            ? opt.valor === 'atipica'
                              ? 'border-red-500 bg-red-50 dark:bg-red-900/30'
                              : 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300',
                          isReadOnly && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{opt.icone}</span>
                          <span className="font-medium">{opt.label}</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {opt.descricao}
                        </p>
                      </button>
                    ))}
                  </div>
                </Field>

                {torc.atitude_cabeca === 'atipica' && (
                  <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <span className="font-medium text-red-800 dark:text-red-200">
                        ⚠️ Red Flag - Investigar!
                      </span>
                    </div>
                    <Textarea
                      value={torc.atitude_cabeca_obs || ''}
                      onChange={(e) =>
                        updateTorcicolo({ atitude_cabeca_obs: e.target.value })
                      }
                      disabled={isReadOnly}
                      placeholder="Descreva o padrão atípico observado..."
                      className="mt-2"
                    />
                  </div>
                )}

                <Field label="Elevação de Ombro">
                  <RadioButtonGroup
                    value={torc.elevacao_ombro}
                    onChange={(v) =>
                      updateTorcicolo({ elevacao_ombro: v as ElevacaoOmbro })
                    }
                    options={ELEVACAO_OMBRO_OPCOES.map((o) => ({
                      valor: o.valor,
                      label: o.label,
                    }))}
                    disabled={isReadOnly}
                  />
                </Field>
              </div>
            </div>

            {/* SEÇÃO B: PALPAÇÃO */}
            <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                <span className="bg-orange-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">
                  B
                </span>
                Palpação (Músculo ECOM)
              </h4>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ECOM Direito */}
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                  <h5 className="font-medium mb-3 flex items-center gap-2">
                    <span className="text-red-500">●</span> ECOM Direito
                  </h5>

                  <div className="space-y-3">
                    <Field label="Tônus">
                      <RadioButtonGroup
                        value={torc.ecom_direito_tonus}
                        onChange={(v) =>
                          updateTorcicolo({
                            ecom_direito_tonus: v as TonusECOM,
                          })
                        }
                        options={TONUS_ECOM_OPCOES.map((o) => ({
                          valor: o.valor,
                          label: o.label,
                        }))}
                        disabled={isReadOnly}
                      />
                    </Field>

                    <Field label="Nódulo/Massa">
                      <RadioButtonGroup
                        value={torc.ecom_direito_nodulo}
                        onChange={(v) => {
                          const loc = v as LocalizacaoNodulo;
                          updateTorcicolo({
                            ecom_direito_nodulo: loc,
                            // Limpa tamanho se ausente
                            ecom_direito_nodulo_tamanho:
                              loc === 'ausente'
                                ? undefined
                                : torc.ecom_direito_nodulo_tamanho,
                          });
                        }}
                        options={LOCALIZACAO_NODULO_OPCOES.map((o) => ({
                          valor: o.valor,
                          label: o.label,
                        }))}
                        disabled={isReadOnly}
                      />
                    </Field>

                    {temNoduloDir && (
                      <Field label="Tamanho do Nódulo">
                        <RadioButtonGroup
                          value={torc.ecom_direito_nodulo_tamanho}
                          onChange={(v) =>
                            updateTorcicolo({
                              ecom_direito_nodulo_tamanho: v as TamanhoNodulo,
                            })
                          }
                          options={TAMANHO_NODULO_OPCOES.map((o) => ({
                            valor: o.valor,
                            label: o.label,
                          }))}
                          disabled={isReadOnly}
                        />
                      </Field>
                    )}
                  </div>
                </div>

                {/* ECOM Esquerdo */}
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                  <h5 className="font-medium mb-3 flex items-center gap-2">
                    <span className="text-blue-500">●</span> ECOM Esquerdo
                  </h5>

                  <div className="space-y-3">
                    <Field label="Tônus">
                      <RadioButtonGroup
                        value={torc.ecom_esquerdo_tonus}
                        onChange={(v) =>
                          updateTorcicolo({
                            ecom_esquerdo_tonus: v as TonusECOM,
                          })
                        }
                        options={TONUS_ECOM_OPCOES.map((o) => ({
                          valor: o.valor,
                          label: o.label,
                        }))}
                        disabled={isReadOnly}
                      />
                    </Field>

                    <Field label="Nódulo/Massa">
                      <RadioButtonGroup
                        value={torc.ecom_esquerdo_nodulo}
                        onChange={(v) => {
                          const loc = v as LocalizacaoNodulo;
                          updateTorcicolo({
                            ecom_esquerdo_nodulo: loc,
                            ecom_esquerdo_nodulo_tamanho:
                              loc === 'ausente'
                                ? undefined
                                : torc.ecom_esquerdo_nodulo_tamanho,
                          });
                        }}
                        options={LOCALIZACAO_NODULO_OPCOES.map((o) => ({
                          valor: o.valor,
                          label: o.label,
                        }))}
                        disabled={isReadOnly}
                      />
                    </Field>

                    {temNoduloEsq && (
                      <Field label="Tamanho do Nódulo">
                        <RadioButtonGroup
                          value={torc.ecom_esquerdo_nodulo_tamanho}
                          onChange={(v) =>
                            updateTorcicolo({
                              ecom_esquerdo_nodulo_tamanho: v as TamanhoNodulo,
                            })
                          }
                          options={TAMANHO_NODULO_OPCOES.map((o) => ({
                            valor: o.valor,
                            label: o.label,
                          }))}
                          disabled={isReadOnly}
                        />
                      </Field>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* SEÇÃO C: DIAGNÓSTICO/CLASSIFICAÇÃO */}
            <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                <span className="bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">
                  C
                </span>
                Diagnóstico Clínico
              </h4>

              <Field label="Tipo Clínico">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {TIPO_CLINICO_TORCICOLO_OPCOES.map((opt) => (
                    <button
                      key={opt.valor}
                      type="button"
                      onClick={() =>
                        !isReadOnly &&
                        updateTorcicolo({
                          tipo_clinico: opt.valor as TorcicoloTipoClinico,
                        })
                      }
                      disabled={isReadOnly}
                      className={cn(
                        'p-3 rounded-lg border text-left transition-all',
                        torc.tipo_clinico === opt.valor
                          ? 'border-2 border-gray-900 dark:border-white'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300',
                        isReadOnly && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn('w-3 h-3 rounded-full', opt.cor)} />
                        <span className="font-medium">{opt.label}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {opt.descricao}
                      </p>
                    </button>
                  ))}
                </div>
              </Field>

              {torc.tipo_clinico === 'outros' && (
                <Field label="Especifique" className="mt-3">
                  <Input
                    value={torc.tipo_clinico_outros || ''}
                    onChange={(e) =>
                      updateTorcicolo({ tipo_clinico_outros: e.target.value })
                    }
                    disabled={isReadOnly}
                    placeholder="Ex: Torcicolo ocular, ósseo, neurológico..."
                  />
                </Field>
              )}

              {torc.tipo_clinico && torc.tipo_clinico !== 'POST' && (
                <Field label="Lado Afetado" className="mt-3">
                  <RadioButtonGroup
                    value={torc.lado_afetado}
                    onChange={(v) =>
                      updateTorcicolo({
                        lado_afetado: v as TorcicoloDetalhado['lado_afetado'],
                      })
                    }
                    options={[
                      { valor: 'direito', label: 'Direito (ECOM D)' },
                      { valor: 'esquerdo', label: 'Esquerdo (ECOM E)' },
                      { valor: 'bilateral', label: 'Bilateral' },
                    ]}
                    disabled={isReadOnly}
                  />
                </Field>
              )}
            </div>

            {/* ALERTAS DE INCONSISTÊNCIA */}
            {inconsistencias.length > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4">
                <h4 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Atenção - Verificar Classificação
                </h4>
                {inconsistencias.map((msg, idx) => (
                  <p
                    key={idx}
                    className="text-sm text-yellow-700 dark:text-yellow-300 mb-1"
                  >
                    {msg}
                  </p>
                ))}
              </div>
            )}

            {/* GRAU DE SEVERIDADE CALCULADO */}
            {grauCalculado && torc.tipo_clinico && (
              <div
                className={cn(
                  'border rounded-lg p-4',
                  grauCalculado.grau <= 3
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                    : grauCalculado.grau <= 5
                      ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700'
                      : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                )}
              >
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <CheckCircle2
                    className={cn(
                      'h-5 w-5',
                      grauCalculado.grau <= 3
                        ? 'text-green-600'
                        : grauCalculado.grau <= 5
                          ? 'text-yellow-600'
                          : 'text-red-600'
                    )}
                  />
                  Classificação de Severidade (Automática)
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Grau
                    </span>
                    <p className="font-bold text-lg">
                      {grauCalculado.descricao}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Tempo Est. Tratamento
                    </span>
                    <p className="font-medium">
                      {grauCalculado.tempoTratamento}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Déficit Rotação
                    </span>
                    <p className="font-medium">
                      {deficitRotacao}° (da goniometria)
                    </p>
                  </div>
                </div>

                {grauCalculado.alertas.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-current/20">
                    <span className="text-sm font-medium">
                      Alertas Clínicos:
                    </span>
                    <ul className="mt-1 space-y-1">
                      {grauCalculado.alertas.map((alerta, idx) => (
                        <li
                          key={idx}
                          className="text-sm flex items-start gap-2"
                        >
                          <span className="text-yellow-600">•</span>
                          {alerta}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* OBSERVAÇÃO POSTURAL (movida para cá) */}
            <div className="border-t pt-6">
              <h4 className="font-semibold mb-4">
                Observação Postural Complementar
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Preferência de rotação cervical">
                  <RadioButtonGroup
                    value={avaliacao.preferencia_rotacao_cervical}
                    onChange={(v) =>
                      onChange({
                        preferencia_rotacao_cervical:
                          v as AvaliacaoClinica['preferencia_rotacao_cervical'],
                      })
                    }
                    options={[
                      { valor: 'direita', label: 'Direita' },
                      { valor: 'esquerda', label: 'Esquerda' },
                      { valor: 'sem_preferencia', label: 'Sem preferência' },
                    ]}
                    disabled={isReadOnly}
                  />
                </Field>

                <Field label="Inclinação lateral observada">
                  <RadioButtonGroup
                    value={avaliacao.inclinacao_lateral}
                    onChange={(v) =>
                      onChange({
                        inclinacao_lateral:
                          v as AvaliacaoClinica['inclinacao_lateral'],
                      })
                    }
                    options={[
                      { valor: 'direita', label: 'Direita' },
                      { valor: 'esquerda', label: 'Esquerda' },
                      { valor: 'ausente', label: 'Ausente' },
                    ]}
                    disabled={isReadOnly}
                  />
                </Field>
              </div>

              <Field label="Observações" className="mt-4">
                <Textarea
                  value={torc.observacoes || ''}
                  onChange={(e) =>
                    updateTorcicolo({ observacoes: e.target.value })
                  }
                  disabled={isReadOnly}
                  placeholder="Observações sobre postura, assimetrias, correlação com plagiocefalia..."
                />
              </Field>
            </div>

            {/* LINK COM PLAGIOCEFALIA */}
            {avaliacao.assimetria_craniana && (
              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                <h4 className="font-medium text-purple-800 dark:text-purple-200 mb-2">
                  🔗 Correlação com Assimetria Craniana
                </h4>
                <p className="text-sm text-purple-700 dark:text-purple-300">
                  Verifique se o lado do torcicolo corresponde à plagiocefalia.
                  Ex: Torcicolo com ECOM direito encurtado geralmente leva a
                  plagiocefalia occipital direita.
                </p>
              </div>
            )}
          </div>
        );
      }

      // =====================================================
      // SEÇÃO 8: Goniometria
      // =====================================================
      case 'goniometria': {
        const gonio = (avaliacao.goniometria || {}) as Goniometria;

        // Função para obter referência por idade (interpolação linear)
        const getReferenciaIdade = (idadeMeses: number) => {
          if (idadeMeses <= 2) return GONIOMETRIA_REFERENCIA_IDADE[0];
          if (idadeMeses >= 10) return GONIOMETRIA_REFERENCIA_IDADE[3];

          // Interpolação linear
          const refs = GONIOMETRIA_REFERENCIA_IDADE;
          for (let i = 0; i < refs.length - 1; i++) {
            if (
              idadeMeses >= refs[i].idade_meses &&
              idadeMeses < refs[i + 1].idade_meses
            ) {
              const ratio =
                (idadeMeses - refs[i].idade_meses) /
                (refs[i + 1].idade_meses - refs[i].idade_meses);
              return {
                idade_meses: idadeMeses,
                rotacao_media:
                  refs[i].rotacao_media +
                  ratio * (refs[i + 1].rotacao_media - refs[i].rotacao_media),
                inclinacao_media:
                  refs[i].inclinacao_media +
                  ratio *
                    (refs[i + 1].inclinacao_media - refs[i].inclinacao_media),
              };
            }
          }
          return GONIOMETRIA_REFERENCIA_IDADE[0];
        };

        // Função para classificar assimetria
        const classificarAssimetria = (diferenca: number) => {
          for (const nivel of GONIOMETRIA_CLASSIFICACAO_ASSIMETRIA) {
            if (diferenca >= nivel.min && diferenca < nivel.max) {
              return nivel;
            }
          }
          return GONIOMETRIA_CLASSIFICACAO_ASSIMETRIA[0];
        };

        // Cálculos automáticos
        const rotDir = gonio.rotacao?.passiva_direita ?? null;
        const rotEsq = gonio.rotacao?.passiva_esquerda ?? null;
        const incDir = gonio.inclinacao?.passiva_direita ?? null;
        const incEsq = gonio.inclinacao?.passiva_esquerda ?? null;

        const rotAssimetria =
          rotDir !== null && rotEsq !== null ? Math.abs(rotDir - rotEsq) : null;
        const incAssimetria =
          incDir !== null && incEsq !== null ? Math.abs(incDir - incEsq) : null;
        const rotTotal =
          rotDir !== null && rotEsq !== null ? rotDir + rotEsq : null;
        const incTotal =
          incDir !== null && incEsq !== null ? incDir + incEsq : null;

        const rotClassificacao =
          rotAssimetria !== null ? classificarAssimetria(rotAssimetria) : null;
        const incClassificacao =
          incAssimetria !== null ? classificarAssimetria(incAssimetria) : null;

        const ladoRestritoRot =
          rotDir !== null && rotEsq !== null
            ? rotDir < rotEsq
              ? 'Direito'
              : rotDir > rotEsq
                ? 'Esquerdo'
                : 'Simétrico'
            : null;
        const ladoRestritoInc =
          incDir !== null && incEsq !== null
            ? incDir < incEsq
              ? 'Direito'
              : incDir > incEsq
                ? 'Esquerdo'
                : 'Simétrico'
            : null;

        // Referência por idade do paciente
        const idadeMeses = patientAgeInMonths || 0;
        const referencia = getReferenciaIdade(idadeMeses);

        // Porcentagem da norma (usando o lado mais restrito)
        const rotMenor =
          rotDir !== null && rotEsq !== null ? Math.min(rotDir, rotEsq) : null;
        const incMenor =
          incDir !== null && incEsq !== null ? Math.min(incDir, incEsq) : null;
        const rotPctNorma =
          rotMenor !== null
            ? Math.round((rotMenor / referencia.rotacao_media) * 100)
            : null;
        const incPctNorma =
          incMenor !== null
            ? Math.round((incMenor / referencia.inclinacao_media) * 100)
            : null;

        // Handler para atualizar valores
        const handleGonioChange = (
          tipo: 'rotacao' | 'inclinacao',
          campo:
            | 'ativa_direita'
            | 'passiva_direita'
            | 'ativa_esquerda'
            | 'passiva_esquerda',
          valor: string
        ) => {
          const numValue = valor ? parseInt(valor) : undefined;
          const tipoAtual = gonio[tipo] || {};
          onChange({
            goniometria: {
              ...gonio,
              [tipo]: {
                ...tipoAtual,
                [campo]: numValue,
              },
            },
          });
        };

        return (
          <div className="space-y-6">
            {/* Explicação Geral */}
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                <span>📐</span>
                Goniometria Cervical - Avaliação Quantitativa
              </h4>
              <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                Avalia a <strong>amplitude de movimento (ADM)</strong> da coluna
                cervical. O objetivo principal é{' '}
                <strong>identificar assimetrias</strong> entre os lados.
              </p>

              {/* Explicação ADM Ativa vs Passiva */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div className="p-2 bg-blue-100/50 dark:bg-blue-900/30 rounded-lg">
                  <p className="font-medium text-sm text-blue-900 dark:text-blue-100 flex items-center gap-1">
                    <span>🏃</span> ADM Ativa
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Movimento que o <strong>paciente realiza sozinho</strong>,
                    sem ajuda externa. Reflete a força muscular e controle
                    motor.
                  </p>
                </div>
                <div className="p-2 bg-blue-100/50 dark:bg-blue-900/30 rounded-lg">
                  <p className="font-medium text-sm text-blue-900 dark:text-blue-100 flex items-center gap-1">
                    <span>🤲</span> ADM Passiva
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Movimento que o <strong>examinador realiza</strong> no
                    paciente. Reflete a flexibilidade articular e tecidual (mais
                    importante para diagnóstico de TMC).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700 dark:text-blue-300">
                <div className="space-y-1">
                  <p className="font-medium">🔄 Teste de Rotação:</p>
                  <ul className="text-xs space-y-0.5 ml-4 list-disc">
                    <li>Paciente em supino, ombros estabilizados</li>
                    <li>Apoio em occiptal, "convida" a rotacionar</li>
                    <li>Bochecha em direção ao ombro ≈ 90°</li>
                  </ul>
                </div>
                <div className="space-y-1">
                  <p className="font-medium">↔️ Teste de Inclinação:</p>
                  <ul className="text-xs space-y-0.5 ml-4 list-disc">
                    <li>Paciente em supino, ombros estabilizados</li>
                    <li>Apoio em occiptal, "convida" a inclinar</li>
                    <li>Orelha em direção ao ombro ≈ 70°</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Valores de Referência por Idade */}
            <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-900">
              <h5 className="font-medium text-sm mb-2 text-green-800 dark:text-green-200 flex items-center gap-2">
                <span>📊</span>
                Valores de Referência por Idade (Klackenberg et al., 2005)
              </h5>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-green-700 dark:text-green-300">
                      <th className="text-left py-1 px-2 font-medium">Idade</th>
                      <th className="text-center py-1 px-2 font-medium">
                        Rotação (média)
                      </th>
                      <th className="text-center py-1 px-2 font-medium">
                        Inclinação (média)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-green-800 dark:text-green-200">
                    {GONIOMETRIA_REFERENCIA_IDADE.map((ref) => (
                      <tr
                        key={ref.idade_meses}
                        className={cn(
                          'border-t border-green-200 dark:border-green-800',
                          idadeMeses >= ref.idade_meses - 1 &&
                            idadeMeses <= ref.idade_meses + 1
                            ? 'bg-green-100 dark:bg-green-900/50 font-medium'
                            : ''
                        )}
                      >
                        <td className="py-1 px-2">{ref.idade_meses} meses</td>
                        <td className="py-1 px-2 text-center">
                          {ref.rotacao_media}°
                        </td>
                        <td className="py-1 px-2 text-center">
                          {ref.inclinacao_media}°
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {idadeMeses > 0 && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                  📍 Paciente: <strong>{idadeMeses.toFixed(1)} meses</strong> →
                  Referência: Rotação ~{referencia.rotacao_media.toFixed(1)}° |
                  Inclinação ~{referencia.inclinacao_media.toFixed(1)}°
                </p>
              )}
            </div>

            {/* Tabela de Medições - ROTAÇÃO */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-primary/10 px-4 py-2 border-b">
                <h5 className="font-semibold flex items-center gap-2">
                  <span>🔄</span>
                  Rotação Cervical
                  <span className="text-xs font-normal text-muted-foreground">
                    (Norma ≈ {referencia.rotacao_media.toFixed(0)}°)
                  </span>
                </h5>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-5 gap-2 text-sm mb-2 text-center font-medium">
                  <div>Lado</div>
                  <div>ADM Ativa (°)</div>
                  <div>ADM Passiva (°)</div>
                  <div>% da Norma</div>
                  <div>Diferença</div>
                </div>

                {/* Direita */}
                <div className="grid grid-cols-5 gap-2 items-center py-2 border-t">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold">
                      D
                    </span>
                    <span className="text-sm">Direita</span>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={180}
                    value={gonio.rotacao?.ativa_direita ?? ''}
                    onChange={(e) =>
                      handleGonioChange(
                        'rotacao',
                        'ativa_direita',
                        e.target.value
                      )
                    }
                    disabled={isReadOnly}
                    placeholder="—"
                    className="h-8 text-center"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={180}
                    value={gonio.rotacao?.passiva_direita ?? ''}
                    onChange={(e) =>
                      handleGonioChange(
                        'rotacao',
                        'passiva_direita',
                        e.target.value
                      )
                    }
                    disabled={isReadOnly}
                    placeholder="—"
                    className="h-8 text-center"
                  />
                  <div className="text-center text-sm">
                    {rotDir !== null ? (
                      <span
                        className={cn(
                          'font-medium',
                          rotDir / referencia.rotacao_media < 0.9
                            ? 'text-red-500'
                            : 'text-green-500'
                        )}
                      >
                        {Math.round((rotDir / referencia.rotacao_media) * 100)}%
                      </span>
                    ) : (
                      '—'
                    )}
                  </div>
                  <div className="text-center">
                    {rotAssimetria !== null && (
                      <div
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold text-white',
                          rotClassificacao?.cor
                        )}
                      >
                        {rotAssimetria}°
                      </div>
                    )}
                  </div>
                </div>

                {/* Esquerda */}
                <div className="grid grid-cols-5 gap-2 items-center py-2 border-t">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xs font-bold">
                      E
                    </span>
                    <span className="text-sm">Esquerda</span>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={180}
                    value={gonio.rotacao?.ativa_esquerda ?? ''}
                    onChange={(e) =>
                      handleGonioChange(
                        'rotacao',
                        'ativa_esquerda',
                        e.target.value
                      )
                    }
                    disabled={isReadOnly}
                    placeholder="—"
                    className="h-8 text-center"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={180}
                    value={gonio.rotacao?.passiva_esquerda ?? ''}
                    onChange={(e) =>
                      handleGonioChange(
                        'rotacao',
                        'passiva_esquerda',
                        e.target.value
                      )
                    }
                    disabled={isReadOnly}
                    placeholder="—"
                    className="h-8 text-center"
                  />
                  <div className="text-center text-sm">
                    {rotEsq !== null ? (
                      <span
                        className={cn(
                          'font-medium',
                          rotEsq / referencia.rotacao_media < 0.9
                            ? 'text-red-500'
                            : 'text-green-500'
                        )}
                      >
                        {Math.round((rotEsq / referencia.rotacao_media) * 100)}%
                      </span>
                    ) : (
                      '—'
                    )}
                  </div>
                  <div></div>
                </div>

                {/* Resumo Rotação */}
                {rotAssimetria !== null && (
                  <div
                    className={cn(
                      'mt-3 p-3 rounded-lg text-sm',
                      rotClassificacao?.nivel === 'normal'
                        ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900'
                        : rotClassificacao?.nivel === 'leve'
                          ? 'bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900'
                          : rotClassificacao?.nivel === 'moderada'
                            ? 'bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900'
                            : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900'
                    )}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <span className="font-medium">Assimetria: </span>
                        <span
                          className={cn(
                            'font-bold',
                            rotClassificacao?.nivel === 'normal'
                              ? 'text-green-600'
                              : rotClassificacao?.nivel === 'leve'
                                ? 'text-yellow-600'
                                : rotClassificacao?.nivel === 'moderada'
                                  ? 'text-orange-600'
                                  : 'text-red-600'
                          )}
                        >
                          {rotClassificacao?.label} ({rotAssimetria}°)
                        </span>
                      </div>
                      {ladoRestritoRot !== 'Simétrico' && (
                        <div>
                          <span className="font-medium">Lado restrito: </span>
                          <span className="font-bold">{ladoRestritoRot}</span>
                        </div>
                      )}
                      <div>
                        <span className="font-medium">ADM Total: </span>
                        <span className="font-bold">{rotTotal}°</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Tabela de Medições - INCLINAÇÃO */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-primary/10 px-4 py-2 border-b">
                <h5 className="font-semibold flex items-center gap-2">
                  <span>↔️</span>
                  Inclinação Lateral
                  <span className="text-xs font-normal text-muted-foreground">
                    (Norma ≈ {referencia.inclinacao_media.toFixed(0)}°)
                  </span>
                </h5>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-5 gap-2 text-sm mb-2 text-center font-medium">
                  <div>Lado</div>
                  <div>ADM Ativa (°)</div>
                  <div>ADM Passiva (°)</div>
                  <div>% da Norma</div>
                  <div>Diferença</div>
                </div>

                {/* Direita */}
                <div className="grid grid-cols-5 gap-2 items-center py-2 border-t">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold">
                      D
                    </span>
                    <span className="text-sm">Direita</span>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={90}
                    value={gonio.inclinacao?.ativa_direita ?? ''}
                    onChange={(e) =>
                      handleGonioChange(
                        'inclinacao',
                        'ativa_direita',
                        e.target.value
                      )
                    }
                    disabled={isReadOnly}
                    placeholder="—"
                    className="h-8 text-center"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={90}
                    value={gonio.inclinacao?.passiva_direita ?? ''}
                    onChange={(e) =>
                      handleGonioChange(
                        'inclinacao',
                        'passiva_direita',
                        e.target.value
                      )
                    }
                    disabled={isReadOnly}
                    placeholder="—"
                    className="h-8 text-center"
                  />
                  <div className="text-center text-sm">
                    {incDir !== null ? (
                      <span
                        className={cn(
                          'font-medium',
                          incDir / referencia.inclinacao_media < 0.9
                            ? 'text-red-500'
                            : 'text-green-500'
                        )}
                      >
                        {Math.round(
                          (incDir / referencia.inclinacao_media) * 100
                        )}
                        %
                      </span>
                    ) : (
                      '—'
                    )}
                  </div>
                  <div className="text-center">
                    {incAssimetria !== null && (
                      <div
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold text-white',
                          incClassificacao?.cor
                        )}
                      >
                        {incAssimetria}°
                      </div>
                    )}
                  </div>
                </div>

                {/* Esquerda */}
                <div className="grid grid-cols-5 gap-2 items-center py-2 border-t">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xs font-bold">
                      E
                    </span>
                    <span className="text-sm">Esquerda</span>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={90}
                    value={gonio.inclinacao?.ativa_esquerda ?? ''}
                    onChange={(e) =>
                      handleGonioChange(
                        'inclinacao',
                        'ativa_esquerda',
                        e.target.value
                      )
                    }
                    disabled={isReadOnly}
                    placeholder="—"
                    className="h-8 text-center"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={90}
                    value={gonio.inclinacao?.passiva_esquerda ?? ''}
                    onChange={(e) =>
                      handleGonioChange(
                        'inclinacao',
                        'passiva_esquerda',
                        e.target.value
                      )
                    }
                    disabled={isReadOnly}
                    placeholder="—"
                    className="h-8 text-center"
                  />
                  <div className="text-center text-sm">
                    {incEsq !== null ? (
                      <span
                        className={cn(
                          'font-medium',
                          incEsq / referencia.inclinacao_media < 0.9
                            ? 'text-red-500'
                            : 'text-green-500'
                        )}
                      >
                        {Math.round(
                          (incEsq / referencia.inclinacao_media) * 100
                        )}
                        %
                      </span>
                    ) : (
                      '—'
                    )}
                  </div>
                  <div></div>
                </div>

                {/* Resumo Inclinação */}
                {incAssimetria !== null && (
                  <div
                    className={cn(
                      'mt-3 p-3 rounded-lg text-sm',
                      incClassificacao?.nivel === 'normal'
                        ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900'
                        : incClassificacao?.nivel === 'leve'
                          ? 'bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900'
                          : incClassificacao?.nivel === 'moderada'
                            ? 'bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900'
                            : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900'
                    )}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <span className="font-medium">Assimetria: </span>
                        <span
                          className={cn(
                            'font-bold',
                            incClassificacao?.nivel === 'normal'
                              ? 'text-green-600'
                              : incClassificacao?.nivel === 'leve'
                                ? 'text-yellow-600'
                                : incClassificacao?.nivel === 'moderada'
                                  ? 'text-orange-600'
                                  : 'text-red-600'
                          )}
                        >
                          {incClassificacao?.label} ({incAssimetria}°)
                        </span>
                      </div>
                      {ladoRestritoInc !== 'Simétrico' && (
                        <div>
                          <span className="font-medium">Lado restrito: </span>
                          <span className="font-bold">{ladoRestritoInc}</span>
                        </div>
                      )}
                      <div>
                        <span className="font-medium">ADM Total: </span>
                        <span className="font-bold">{incTotal}°</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Avaliação Qualitativa */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 border-b">
                <h5 className="font-semibold">Avaliação Qualitativa</h5>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Qualidade da Rotação">
                    <div className="grid grid-cols-2 gap-2">
                      {GONIOMETRIA_QUALIDADE_OPCOES.map((opt) => {
                        const isSelected =
                          gonio.rotacao_qualidade === opt.valor;
                        return (
                          <button
                            key={opt.valor}
                            type="button"
                            onClick={() =>
                              !isReadOnly &&
                              onChange({
                                goniometria: {
                                  ...gonio,
                                  rotacao_qualidade:
                                    opt.valor as Goniometria['rotacao_qualidade'],
                                },
                              })
                            }
                            disabled={isReadOnly}
                            className={cn(
                              'p-2 rounded-lg border-2 text-left transition-all',
                              isSelected
                                ? 'bg-primary/10 border-primary'
                                : 'bg-background border-border hover:border-primary/50',
                              isReadOnly && 'cursor-default'
                            )}
                          >
                            <p className="text-sm font-medium">{opt.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {opt.descricao}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </Field>

                  <Field label="Qualidade da Inclinação">
                    <div className="grid grid-cols-2 gap-2">
                      {GONIOMETRIA_QUALIDADE_OPCOES.map((opt) => {
                        const isSelected =
                          gonio.inclinacao_qualidade === opt.valor;
                        return (
                          <button
                            key={opt.valor}
                            type="button"
                            onClick={() =>
                              !isReadOnly &&
                              onChange({
                                goniometria: {
                                  ...gonio,
                                  inclinacao_qualidade:
                                    opt.valor as Goniometria['inclinacao_qualidade'],
                                },
                              })
                            }
                            disabled={isReadOnly}
                            className={cn(
                              'p-2 rounded-lg border-2 text-left transition-all',
                              isSelected
                                ? 'bg-primary/10 border-primary'
                                : 'bg-background border-border hover:border-primary/50',
                              isReadOnly && 'cursor-default'
                            )}
                          >
                            <p className="text-sm font-medium">{opt.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {opt.descricao}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                </div>

                <Field label="Sensação Final (End-feel)">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {GONIOMETRIA_SENSACAO_FINAL_OPCOES.map((opt) => {
                      const isSelected = gonio.sensacao_final === opt.valor;
                      return (
                        <button
                          key={opt.valor}
                          type="button"
                          onClick={() =>
                            !isReadOnly &&
                            onChange({
                              goniometria: {
                                ...gonio,
                                sensacao_final:
                                  opt.valor as Goniometria['sensacao_final'],
                              },
                            })
                          }
                          disabled={isReadOnly}
                          className={cn(
                            'p-2 rounded-lg border-2 text-center transition-all',
                            isSelected
                              ? 'bg-primary/10 border-primary'
                              : 'bg-background border-border hover:border-primary/50',
                            isReadOnly && 'cursor-default'
                          )}
                        >
                          <p className="text-sm font-medium">{opt.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {opt.descricao}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </Field>

                <Field label="Observações">
                  <Textarea
                    value={gonio.observacoes || ''}
                    onChange={(e) =>
                      onChange({
                        goniometria: { ...gonio, observacoes: e.target.value },
                      })
                    }
                    disabled={isReadOnly}
                    placeholder="Observações sobre a avaliação goniométrica..."
                  />
                </Field>
              </div>
            </div>

            {/* Alertas Automáticos */}
            {(rotAssimetria !== null || incAssimetria !== null) && (
              <div className="space-y-2">
                {rotClassificacao && rotClassificacao.nivel !== 'normal' && (
                  <div
                    className={cn(
                      'p-3 rounded-lg flex items-start gap-2',
                      rotClassificacao.nivel === 'leve'
                        ? 'bg-yellow-50 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200'
                        : rotClassificacao.nivel === 'moderada'
                          ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-200'
                          : 'bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200'
                    )}
                  >
                    <span>⚠️</span>
                    <span className="text-sm">
                      <strong>
                        Assimetria de Rotação {rotClassificacao.label}
                      </strong>{' '}
                      detectada ({rotAssimetria}°). Lado {ladoRestritoRot}{' '}
                      apresenta restrição.
                    </span>
                  </div>
                )}
                {incClassificacao && incClassificacao.nivel !== 'normal' && (
                  <div
                    className={cn(
                      'p-3 rounded-lg flex items-start gap-2',
                      incClassificacao.nivel === 'leve'
                        ? 'bg-yellow-50 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200'
                        : incClassificacao.nivel === 'moderada'
                          ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-200'
                          : 'bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200'
                    )}
                  >
                    <span>⚠️</span>
                    <span className="text-sm">
                      <strong>
                        Assimetria de Inclinação {incClassificacao.label}
                      </strong>{' '}
                      detectada ({incAssimetria}°). Lado {ladoRestritoInc}{' '}
                      apresenta restrição.
                    </span>
                  </div>
                )}
                {rotPctNorma !== null && rotPctNorma < 90 && (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 flex items-start gap-2">
                    <span>📉</span>
                    <span className="text-sm">
                      <strong>Hipo-mobilidade de Rotação:</strong> Lado mais
                      restrito está em {rotPctNorma}% da norma esperada para a
                      idade.
                    </span>
                  </div>
                )}
                {incPctNorma !== null && incPctNorma < 90 && (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 flex items-start gap-2">
                    <span>📉</span>
                    <span className="text-sm">
                      <strong>Hipo-mobilidade de Inclinação:</strong> Lado mais
                      restrito está em {incPctNorma}% da norma esperada para a
                      idade.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }

      // =====================================================
      // SEÇÃO 9: Escala MFS
      // =====================================================
      case 'mfs': {
        // Função para renderizar botão de pontuação MFS
        const renderMFSButton = (
          lado: 'direito' | 'esquerdo',
          pont: (typeof MFS_PONTUACAO)[number],
          valorAtual: number | null | undefined
        ) => {
          const isSelected = valorAtual === pont.valor;
          return (
            <button
              key={pont.valor}
              type="button"
              onClick={() =>
                !isReadOnly && onChange({ [`mfs_${lado}`]: pont.valor })
              }
              disabled={isReadOnly}
              title={`${pont.angulo}: ${pont.descricao}`}
              className={cn(
                'flex-1 p-3 rounded-lg font-bold text-sm transition-all border-2 flex flex-col items-center gap-1',
                isSelected
                  ? `${pont.cor} text-white border-transparent`
                  : 'bg-muted border-border hover:border-primary/50',
                isReadOnly && 'cursor-default'
              )}
            >
              <span className="text-xl">{pont.valor}</span>
              <span
                className={cn(
                  'text-[10px] font-normal',
                  isSelected ? 'text-white/90' : 'text-muted-foreground'
                )}
              >
                {pont.angulo}
              </span>
            </button>
          );
        };

        return (
          <div className="space-y-6">
            {/* Explicação Geral */}
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                <span>💪</span>
                MFS - Muscle Function Scale for Infants
              </h4>
              <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                Avalia a{' '}
                <strong>
                  força/resistência dos flexores laterais do pescoço
                </strong>{' '}
                através da capacidade de retificação da cabeça quando o bebê é
                inclinado lateralmente.
              </p>

              <div className="space-y-2 text-sm text-blue-700 dark:text-blue-300">
                <p className="flex items-start gap-2">
                  <span>📋</span>
                  <span>
                    <strong>Procedimento:</strong> Paciente suspenso, sair da
                    posição vertical para horizontal
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <span>⏱️</span>
                  <span>
                    <strong>Tempo:</strong> Aguardar 5 segundos para pontuar
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <span>👶</span>
                  <span>
                    <strong>Idade:</strong> A partir de 2 meses
                  </span>
                </p>
              </div>
            </div>

            {/* Dica Importante */}
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-900">
              <p className="text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
                <span>⚠️</span>
                <span>
                  <strong>Importante:</strong> Ao levar a criança para a{' '}
                  <strong>direita</strong>, testamos os{' '}
                  <strong>flexores esquerdos</strong>. O que encontramos de um
                  lado, devemos encontrar do outro.
                </span>
              </p>
            </div>

            {/* Legenda de Pontuação */}
            <div className="p-3 bg-muted/50 rounded-lg">
              <h5 className="font-medium text-sm mb-3">
                Pontuação (0 a 5) - Ângulo de retificação da cabeça:
              </h5>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {MFS_PONTUACAO.map((pont) => (
                  <div
                    key={pont.valor}
                    className={cn(
                      'text-xs p-2 rounded border flex items-center gap-2',
                      'bg-background'
                    )}
                  >
                    <span
                      className={cn(
                        'w-6 h-6 rounded flex items-center justify-center text-white font-bold',
                        pont.cor
                      )}
                    >
                      {pont.valor}
                    </span>
                    <div>
                      <p className="font-medium">{pont.angulo}</p>
                      <p className="text-muted-foreground text-[10px]">
                        {pont.descricao}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Valores de Referência por Idade */}
            <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-900">
              <h5 className="font-medium text-sm mb-2 text-green-800 dark:text-green-200">
                📊 Valores de Referência por Idade
              </h5>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-green-700 dark:text-green-300">
                      <th className="text-left py-1 px-2 font-medium">Idade</th>
                      <th className="text-center py-1 px-2 font-medium">
                        Média
                      </th>
                      <th className="text-center py-1 px-2 font-medium">
                        Variação
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-green-800 dark:text-green-200">
                    {MFS_REFERENCIA_IDADE.map((ref) => (
                      <tr
                        key={ref.idade}
                        className="border-t border-green-200 dark:border-green-800"
                      >
                        <td className="py-1.5 px-2">{ref.idade}</td>
                        <td className="py-1.5 px-2 text-center font-medium">
                          {ref.media}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          {ref.variacao}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-green-600 dark:text-green-400 mt-2 italic">
                Quanto mais velho, mais retificado deve estar.
              </p>
            </div>

            {/* Avaliação dos Lados */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Lado Direito (testa flexores esquerdos) */}
              <div className="p-4 border rounded-lg bg-background">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="font-semibold flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 flex items-center justify-center text-sm">
                      D
                    </span>
                    Inclinação para Direita
                  </h5>
                  {avaliacao.mfs_direito !== null &&
                    avaliacao.mfs_direito !== undefined && (
                      <Badge variant="outline" className="text-lg font-bold">
                        {avaliacao.mfs_direito}
                      </Badge>
                    )}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Testa flexores <strong>esquerdos</strong>
                </p>
                <div className="flex gap-1">
                  {MFS_PONTUACAO.map((pont) =>
                    renderMFSButton('direito', pont, avaliacao.mfs_direito)
                  )}
                </div>
              </div>

              {/* Lado Esquerdo (testa flexores direitos) */}
              <div className="p-4 border rounded-lg bg-background">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="font-semibold flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400 flex items-center justify-center text-sm">
                      E
                    </span>
                    Inclinação para Esquerda
                  </h5>
                  {avaliacao.mfs_esquerdo !== null &&
                    avaliacao.mfs_esquerdo !== undefined && (
                      <Badge variant="outline" className="text-lg font-bold">
                        {avaliacao.mfs_esquerdo}
                      </Badge>
                    )}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Testa flexores <strong>direitos</strong>
                </p>
                <div className="flex gap-1">
                  {MFS_PONTUACAO.map((pont) =>
                    renderMFSButton('esquerdo', pont, avaliacao.mfs_esquerdo)
                  )}
                </div>
              </div>
            </div>

            {/* Comparação e Resultado */}
            {avaliacao.mfs_direito !== null &&
              avaliacao.mfs_direito !== undefined &&
              avaliacao.mfs_esquerdo !== null &&
              avaliacao.mfs_esquerdo !== undefined && (
                <div
                  className={cn(
                    'p-4 rounded-lg border',
                    avaliacao.mfs_direito === avaliacao.mfs_esquerdo
                      ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900'
                      : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h5
                        className={cn(
                          'font-semibold',
                          avaliacao.mfs_direito === avaliacao.mfs_esquerdo
                            ? 'text-green-800 dark:text-green-200'
                            : 'text-amber-800 dark:text-amber-200'
                        )}
                      >
                        {avaliacao.mfs_direito === avaliacao.mfs_esquerdo
                          ? '✓ Simétrico'
                          : '⚠ Assimétrico'}
                      </h5>
                      <p
                        className={cn(
                          'text-sm',
                          avaliacao.mfs_direito === avaliacao.mfs_esquerdo
                            ? 'text-green-700 dark:text-green-300'
                            : 'text-amber-700 dark:text-amber-300'
                        )}
                      >
                        {avaliacao.mfs_direito === avaliacao.mfs_esquerdo
                          ? 'Os dois lados apresentam a mesma pontuação'
                          : `Diferença de ${Math.abs((avaliacao.mfs_direito ?? 0) - (avaliacao.mfs_esquerdo ?? 0))} ponto(s) entre os lados`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Média</p>
                      <p className="text-2xl font-bold">
                        {(
                          ((avaliacao.mfs_direito ?? 0) +
                            (avaliacao.mfs_esquerdo ?? 0)) /
                          2
                        ).toFixed(1)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

            <Field label="Observações">
              <Textarea
                value={avaliacao.mfs_observacoes || ''}
                onChange={(e) => onChange({ mfs_observacoes: e.target.value })}
                disabled={isReadOnly}
                placeholder="Observações sobre a avaliação MFS..."
              />
            </Field>
          </div>
        );
      }

      // =====================================================
      // SEÇÃO 10: Tensão Neuromeníngea
      // =====================================================
      case 'tensao': {
        const tensaoData = (avaliacao.tensao_neuromeningea_detalhada ||
          {}) as TensaoNeuromeningeaDetalhada;

        // Handler para atualizar um membro específico
        const handleTensaoChange = (
          membro: keyof TensaoNeuromeningeaDetalhada,
          campo: keyof TensaoNeuromeningeaAvaliacao,
          valor: unknown
        ) => {
          const membroAtual = (tensaoData[membro] ||
            {}) as TensaoNeuromeningeaAvaliacao;
          onChange({
            tensao_neuromeningea_detalhada: {
              ...tensaoData,
              [membro]: {
                ...membroAtual,
                [campo]: valor,
              },
            },
          });
        };

        // Handler para toggle de sintomas
        const handleSintomaToggle = (
          membro: keyof TensaoNeuromeningeaDetalhada,
          sintoma: TensaoNeuromeningeaSintoma
        ) => {
          const membroAtual = (tensaoData[membro] ||
            {}) as TensaoNeuromeningeaAvaliacao;
          const sintomasAtuais = membroAtual.sintomas || [];
          const novosSintomas = sintomasAtuais.includes(sintoma)
            ? sintomasAtuais.filter((s) => s !== sintoma)
            : [...sintomasAtuais, sintoma];
          handleTensaoChange(membro, 'sintomas', novosSintomas);
        };

        // Verifica se há algum teste positivo
        const temTestePositivo =
          tensaoData.membro_superior_direito?.status === 'alterado' ||
          tensaoData.membro_superior_esquerdo?.status === 'alterado' ||
          tensaoData.membro_inferior_direito?.status === 'alterado' ||
          tensaoData.membro_inferior_esquerdo?.status === 'alterado' ||
          tensaoData.flexao_passiva_pescoco?.status === 'alterado';

        // Verifica assimetria entre lados
        const assimetriaSuperior =
          tensaoData.membro_superior_direito?.status !==
            tensaoData.membro_superior_esquerdo?.status &&
          tensaoData.membro_superior_direito?.status !== 'nao_testado' &&
          tensaoData.membro_superior_esquerdo?.status !== 'nao_testado';
        const assimetriaInferior =
          tensaoData.membro_inferior_direito?.status !==
            tensaoData.membro_inferior_esquerdo?.status &&
          tensaoData.membro_inferior_direito?.status !== 'nao_testado' &&
          tensaoData.membro_inferior_esquerdo?.status !== 'nao_testado';

        // Componente para card de avaliação de membro
        const TensaoCard = ({
          titulo,
          icone,
          membro,
          corBg,
        }: {
          titulo: string;
          icone: string;
          membro: keyof TensaoNeuromeningeaDetalhada;
          corBg: string;
        }) => {
          const dados = (tensaoData[membro] ||
            {}) as TensaoNeuromeningeaAvaliacao;
          const isAlterado = dados.status === 'alterado';

          return (
            <div
              className={cn(
                'border rounded-lg overflow-hidden',
                isAlterado
                  ? 'border-red-300 dark:border-red-800'
                  : 'border-border'
              )}
            >
              <div className={cn('px-4 py-2 border-b', corBg)}>
                <h5 className="font-semibold flex items-center gap-2 text-sm">
                  <span>{icone}</span>
                  {titulo}
                </h5>
              </div>
              <div className="p-4 space-y-4">
                {/* Toggle Normal/Alterado */}
                <div className="flex gap-2">
                  {['normal', 'alterado', 'nao_testado'].map((status) => {
                    const isSelected = dados.status === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() =>
                          !isReadOnly &&
                          handleTensaoChange(membro, 'status', status)
                        }
                        disabled={isReadOnly}
                        className={cn(
                          'flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-all border-2',
                          status === 'normal' && isSelected
                            ? 'bg-green-500 text-white border-green-600'
                            : status === 'alterado' && isSelected
                              ? 'bg-red-500 text-white border-red-600'
                              : status === 'nao_testado' && isSelected
                                ? 'bg-gray-400 text-white border-gray-500'
                                : 'bg-muted border-border hover:border-primary/50',
                          isReadOnly && 'cursor-default'
                        )}
                      >
                        {status === 'normal'
                          ? '✓ Normal'
                          : status === 'alterado'
                            ? '⚠ Alterado'
                            : '— Não testado'}
                      </button>
                    );
                  })}
                </div>

                {/* Se Alterado, mostrar opções */}
                {isAlterado && (
                  <div className="space-y-3 pt-2 border-t">
                    <p className="text-sm font-medium text-muted-foreground">
                      O que foi observado?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {TENSAO_SINTOMAS_OPCOES.map((sintoma) => {
                        const isSelected = (dados.sintomas || []).includes(
                          sintoma.valor as TensaoNeuromeningeaSintoma
                        );
                        return (
                          <button
                            key={sintoma.valor}
                            type="button"
                            onClick={() =>
                              !isReadOnly &&
                              handleSintomaToggle(
                                membro,
                                sintoma.valor as TensaoNeuromeningeaSintoma
                              )
                            }
                            disabled={isReadOnly}
                            title={sintoma.descricao}
                            className={cn(
                              'px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5',
                              isSelected
                                ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 border-2 border-red-300 dark:border-red-700'
                                : 'bg-muted border-2 border-transparent hover:border-primary/30',
                              isReadOnly && 'cursor-default'
                            )}
                          >
                            <span>{sintoma.icone}</span>
                            {sintoma.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* End-Feel */}
                    <div className="pt-2">
                      <p className="text-sm font-medium text-muted-foreground mb-2">
                        Sensação final (End-feel):
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {TENSAO_END_FEEL_OPCOES.map((opt) => {
                          const isSelected = dados.endFeel === opt.valor;
                          return (
                            <button
                              key={opt.valor}
                              type="button"
                              onClick={() =>
                                !isReadOnly &&
                                handleTensaoChange(membro, 'endFeel', opt.valor)
                              }
                              disabled={isReadOnly}
                              className={cn(
                                'p-2 rounded-lg text-xs text-center transition-all border-2',
                                isSelected
                                  ? 'bg-primary/10 border-primary'
                                  : 'bg-background border-border hover:border-primary/50',
                                isReadOnly && 'cursor-default'
                              )}
                            >
                              <p className="font-medium">{opt.label}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        };

        return (
          <div className="space-y-6">
            {/* Explicação Geral */}
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                <span>🔌</span>
                Tensão Neuromeníngea - Testes Neurodinâmicos
              </h4>
              <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                Avalia a <strong>mobilidade do sistema nervoso</strong>. São
                testes provocativos onde observamos a resposta do bebê ao
                alongamento das estruturas neurais.
              </p>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-900">
                <p className="text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
                  <span>👶</span>
                  <span>
                    <strong>Em pediatria (0-3 anos):</strong> O bebê não relata
                    dor verbalmente. Observe: <strong>Choro</strong>,{' '}
                    <strong>Resistência muscular</strong>,
                    <strong>Retração do membro</strong> ou{' '}
                    <strong>Expressão facial de dor</strong>.
                  </span>
                </p>
              </div>
            </div>

            {/* Membros Superiores */}
            <div>
              <h5 className="font-semibold mb-2 flex items-center gap-2">
                <span>💪</span>
                Membros Superiores
                <span className="text-xs font-normal text-muted-foreground">
                  (Plexo Braquial / ULTT)
                </span>
              </h5>

              {/* Instruções do teste */}
              <div className="mb-3 p-3 bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-slate-200 dark:border-slate-800 text-sm">
                <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">
                  📋 Como realizar:
                </p>
                <ol className="text-xs text-slate-600 dark:text-slate-400 space-y-1 ml-4 list-decimal">
                  <li>Bebê em supino, estabilize o ombro</li>
                  <li>Abdução do ombro a 90° + extensão do cotovelo</li>
                  <li>Adicione extensão do punho e dedos</li>
                  <li>Observe a reação do bebê durante todo o movimento</li>
                </ol>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-2 italic">
                  💡 Comparar sempre os dois lados. A diferença de resposta é
                  mais importante que o resultado isolado.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TensaoCard
                  titulo="Direito"
                  icone="👉"
                  membro="membro_superior_direito"
                  corBg="bg-blue-50 dark:bg-blue-950/30"
                />
                <TensaoCard
                  titulo="Esquerdo"
                  icone="👈"
                  membro="membro_superior_esquerdo"
                  corBg="bg-purple-50 dark:bg-purple-950/30"
                />
              </div>
            </div>

            {/* Membros Inferiores */}
            <div>
              <h5 className="font-semibold mb-2 flex items-center gap-2">
                <span>🦵</span>
                Membros Inferiores
                <span className="text-xs font-normal text-muted-foreground">
                  (SLR - Elevação da Perna Estendida)
                </span>
              </h5>

              {/* Instruções do teste */}
              <div className="mb-3 p-3 bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-slate-200 dark:border-slate-800 text-sm">
                <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">
                  📋 Como realizar:
                </p>
                <ol className="text-xs text-slate-600 dark:text-slate-400 space-y-1 ml-4 list-decimal">
                  <li>Bebê em supino, estabilize a pelve</li>
                  <li>Mantenha o joelho em extensão</li>
                  <li>Eleve lentamente a perna (flexão de quadril)</li>
                  <li>
                    Observe resistência, choro ou retração durante a elevação
                  </li>
                </ol>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-2 italic">
                  💡 Normal: elevação livre até ~70-90°. Positivo se houver
                  resistência precoce ou reação adversa.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TensaoCard
                  titulo="Direito"
                  icone="👉"
                  membro="membro_inferior_direito"
                  corBg="bg-blue-50 dark:bg-blue-950/30"
                />
                <TensaoCard
                  titulo="Esquerdo"
                  icone="👈"
                  membro="membro_inferior_esquerdo"
                  corBg="bg-purple-50 dark:bg-purple-950/30"
                />
              </div>
            </div>

            {/* Neuroeixo */}
            <div>
              <h5 className="font-semibold mb-2 flex items-center gap-2">
                <span>🧠</span>
                Neuroeixo
                <span className="text-xs font-normal text-muted-foreground">
                  (Flexão Passiva do Pescoço)
                </span>
              </h5>

              {/* Instruções do teste */}
              <div className="mb-3 p-3 bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-slate-200 dark:border-slate-800 text-sm">
                <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">
                  📋 Como realizar:
                </p>
                <ol className="text-xs text-slate-600 dark:text-slate-400 space-y-1 ml-4 list-decimal">
                  <li>Bebê em supino, relaxado</li>
                  <li>Apoie a cabeça com ambas as mãos</li>
                  <li>
                    Flexione passivamente o pescoço (queixo em direção ao peito)
                  </li>
                  <li>Observe resistência, extensão dos membros ou choro</li>
                </ol>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-2 italic">
                  💡 Teste de tensão meníngea. Positivo se houver extensão
                  reflexa dos membros ou resistência à flexão.
                </p>
              </div>

              <TensaoCard
                titulo="Flexão Passiva do Pescoço"
                icone="🔄"
                membro="flexao_passiva_pescoco"
                corBg="bg-green-50 dark:bg-green-950/30"
              />
            </div>

            {/* Alertas Automáticos */}
            {(temTestePositivo || assimetriaSuperior || assimetriaInferior) && (
              <div className="space-y-2">
                {temTestePositivo && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 flex items-start gap-2">
                    <span>🚨</span>
                    <div className="text-sm text-red-800 dark:text-red-200">
                      <strong>Tensão Neural Alterada detectada!</strong>
                      <p className="text-xs mt-1">
                        Evitar alongamento passivo forçado neste segmento.
                        Tratamento deve incluir mobilização neural suave.
                      </p>
                    </div>
                  </div>
                )}
                {assimetriaSuperior && (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 flex items-start gap-2">
                    <span>⚠️</span>
                    <span className="text-sm text-amber-800 dark:text-amber-200">
                      <strong>Assimetria nos Membros Superiores:</strong>{' '}
                      Respostas diferentes entre lados.
                    </span>
                  </div>
                )}
                {assimetriaInferior && (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 flex items-start gap-2">
                    <span>⚠️</span>
                    <span className="text-sm text-amber-800 dark:text-amber-200">
                      <strong>Assimetria nos Membros Inferiores:</strong>{' '}
                      Respostas diferentes entre lados.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Correlação com Goniometria */}
            {temTestePositivo && avaliacao.goniometria && (
              <div className="p-4 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg border border-indigo-200 dark:border-indigo-900">
                <h5 className="font-semibold text-indigo-900 dark:text-indigo-100 mb-2 flex items-center gap-2">
                  <span>🔗</span>
                  Correlação com Goniometria
                </h5>
                <p className="text-sm text-indigo-800 dark:text-indigo-200">
                  A restrição de movimento pode possuir{' '}
                  <strong>componente neural</strong>. O tratamento deve incluir{' '}
                  <strong>mobilização neural suave</strong>, não apenas
                  muscular.
                </p>
              </div>
            )}

            {/* Observações Gerais */}
            <Field label="Observações gerais">
              <Textarea
                value={tensaoData.observacoes_gerais || ''}
                onChange={(e) =>
                  onChange({
                    tensao_neuromeningea_detalhada: {
                      ...tensaoData,
                      observacoes_gerais: e.target.value,
                    },
                  })
                }
                disabled={isReadOnly}
                placeholder="Observações sobre a avaliação de tensão neuromeníngea..."
              />
            </Field>
          </div>
        );
      }

      // =====================================================
      // SEÇÃO 11: Funções Sensoriais
      // =====================================================
      case 'sensoriais': {
        const funcoes = (avaliacao.funcoes_sensoriais ||
          {}) as FuncoesSensoriais;

        // Handler genérico para atualizar funções sensoriais
        const handleFuncoesChange = (
          tipo: 'visual' | 'auditiva' | 'oral',
          campo: string,
          valor: unknown
        ) => {
          const tipoAtual = funcoes[tipo] || {};
          onChange({
            funcoes_sensoriais: {
              ...funcoes,
              [tipo]: {
                ...tipoAtual,
                [campo]: valor,
              },
            },
          });
        };

        // Componente para botões de seleção
        const SelectButton = ({
          opcoes,
          valor,
          onChange: onChangeSelect,
          disabled,
        }: {
          opcoes: readonly {
            valor: string;
            label: string;
            descricao?: string;
            icone?: string;
          }[];
          valor: string | undefined;
          onChange: (v: string) => void;
          disabled: boolean;
        }) => (
          <div className="flex flex-wrap gap-2">
            {opcoes.map((opt) => {
              const isSelected = valor === opt.valor;
              return (
                <button
                  key={opt.valor}
                  type="button"
                  onClick={() => !disabled && onChangeSelect(opt.valor)}
                  disabled={disabled}
                  title={opt.descricao}
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm font-medium transition-all border-2 flex items-center gap-1.5',
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted border-border hover:border-primary/50',
                    disabled && 'cursor-default opacity-60'
                  )}
                >
                  {opt.icone && <span>{opt.icone}</span>}
                  {opt.label}
                </button>
              );
            })}
          </div>
        );

        // Detectar alertas
        const alertaVisualRestrito =
          funcoes.visual?.rastreio_visual &&
          funcoes.visual.rastreio_visual !== 'simetrico';
        const alertaRespiradorOral =
          funcoes.oral?.vedamento_labial === 'labios_abertos';
        const alertaFrenuloCurto =
          funcoes.oral?.anatomia_lingua &&
          funcoes.oral.anatomia_lingua !== 'normal';
        const alertaCoordenacao =
          funcoes.oral?.coordenacao_sdr &&
          funcoes.oral.coordenacao_sdr !== 'coordenada';
        const alertaSustoExacerbado =
          funcoes.auditiva?.reacao_ruidos === 'susto_exacerbado';

        return (
          <div className="space-y-6">
            {/* Explicação Geral */}
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                <span>👁️</span>
                Funções Sensoriais
              </h4>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Avalia as funções <strong>visual</strong>, <strong>oral</strong>{' '}
                e <strong>auditiva</strong>. Importante para identificar
                assimetrias que influenciam no torcicolo e na respiração.
              </p>
            </div>

            {/* ========== FUNÇÃO VISUAL ========== */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-purple-50 dark:bg-purple-950/30 px-4 py-3 border-b">
                <h5 className="font-semibold flex items-center gap-2">
                  <span>👁️</span>
                  Função Visual
                </h5>
                <p className="text-xs text-muted-foreground mt-1">
                  Se o bebê não olha para um lado, não vai alongar o pescoço
                  para o outro
                </p>
              </div>
              <div className="p-4 space-y-4">
                <Field label="Rastreio Visual (Campo Visual)">
                  <SelectButton
                    opcoes={RASTREIO_VISUAL_OPCOES}
                    valor={funcoes.visual?.rastreio_visual}
                    onChange={(v) =>
                      handleFuncoesChange('visual', 'rastreio_visual', v)
                    }
                    disabled={isReadOnly}
                  />
                  {alertaVisualRestrito && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                      <span>⚠️</span>
                      Restrição visual pode indicar preferência de posição ou
                      torcicolo
                    </p>
                  )}
                </Field>

                <Field label="Contato Visual">
                  <SelectButton
                    opcoes={CONTATO_VISUAL_OPCOES}
                    valor={funcoes.visual?.contato_visual}
                    onChange={(v) =>
                      handleFuncoesChange('visual', 'contato_visual', v)
                    }
                    disabled={isReadOnly}
                  />
                </Field>

                <Field label="Alinhamento Ocular (Estrabismo)">
                  <SelectButton
                    opcoes={ALINHAMENTO_OCULAR_OPCOES}
                    valor={funcoes.visual?.alinhamento_ocular}
                    onChange={(v) =>
                      handleFuncoesChange('visual', 'alinhamento_ocular', v)
                    }
                    disabled={isReadOnly}
                  />
                </Field>

                <Field label="Observações">
                  <Textarea
                    value={funcoes.visual?.observacoes || ''}
                    onChange={(e) =>
                      handleFuncoesChange(
                        'visual',
                        'observacoes',
                        e.target.value
                      )
                    }
                    disabled={isReadOnly}
                    placeholder="Observações sobre a função visual..."
                    rows={2}
                  />
                </Field>
              </div>
            </div>

            {/* ========== FUNÇÃO ORAL ========== */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-pink-50 dark:bg-pink-950/30 px-4 py-3 border-b">
                <h5 className="font-semibold flex items-center gap-2">
                  <span>👄</span>
                  Função Oral
                </h5>
                <p className="text-xs text-muted-foreground mt-1">
                  Qualidade da mamada e anatomia oral - impacto na respiração e
                  tensão cervical
                </p>
              </div>
              <div className="p-4 space-y-4">
                <Field label="Vedamento Labial (Repouso)">
                  <SelectButton
                    opcoes={VEDAMENTO_LABIAL_OPCOES}
                    valor={funcoes.oral?.vedamento_labial}
                    onChange={(v) =>
                      handleFuncoesChange('oral', 'vedamento_labial', v)
                    }
                    disabled={isReadOnly}
                  />
                  {alertaRespiradorOral && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2 flex items-center gap-1">
                      <span>🚨</span>
                      <strong>Respirador Oral!</strong> Importante para
                      fisioterapia respiratória
                    </p>
                  )}
                </Field>

                <Field label="Língua (Anatomia)">
                  <SelectButton
                    opcoes={ANATOMIA_LINGUA_OPCOES}
                    valor={funcoes.oral?.anatomia_lingua}
                    onChange={(v) =>
                      handleFuncoesChange('oral', 'anatomia_lingua', v)
                    }
                    disabled={isReadOnly}
                  />
                  {alertaFrenuloCurto && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                      <span>⚠️</span>
                      Língua presa pode causar tensão na fáscia cervical
                      anterior
                    </p>
                  )}
                </Field>

                {/* Mostrar campo de frenectomia se houver alteração na língua */}
                {funcoes.oral?.anatomia_lingua &&
                  funcoes.oral.anatomia_lingua !== 'normal' && (
                    <Field label="Frenectomia (Cirurgia de frênulo)">
                      <SelectButton
                        opcoes={FRENECTOMIA_OPCOES}
                        valor={funcoes.oral?.frenectomia}
                        onChange={(v) =>
                          handleFuncoesChange('oral', 'frenectomia', v)
                        }
                        disabled={isReadOnly}
                      />
                      {funcoes.oral?.frenectomia === 'sim' && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center gap-1">
                          <span>✓</span>
                          Frenectomia realizada - reavaliar mobilidade da língua
                        </p>
                      )}
                      {funcoes.oral?.frenectomia === 'aguardando' && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 flex items-center gap-1">
                          <span>⏳</span>
                          Aguardando procedimento - acompanhar evolução
                        </p>
                      )}
                    </Field>
                  )}

                <Field label="Coordenação S/D/R (Sucção/Deglutição/Respiração)">
                  <SelectButton
                    opcoes={COORDENACAO_SDR_OPCOES}
                    valor={funcoes.oral?.coordenacao_sdr}
                    onChange={(v) =>
                      handleFuncoesChange('oral', 'coordenacao_sdr', v)
                    }
                    disabled={isReadOnly}
                  />
                  {alertaCoordenacao && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                      <span>⚠️</span>
                      Descoordenação pode indicar disfagia ou imaturidade
                      neuromotora
                    </p>
                  )}
                </Field>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Reflexo de Busca">
                    <RadioButtonGroup
                      value={funcoes.oral?.reflexo_busca}
                      onChange={(v) =>
                        handleFuncoesChange('oral', 'reflexo_busca', v)
                      }
                      options={[
                        { valor: 'presente', label: 'Presente' },
                        { valor: 'ausente', label: 'Ausente' },
                      ]}
                      disabled={isReadOnly}
                    />
                  </Field>

                  <Field label="Reflexo de Vômito (Gag)">
                    <SelectButton
                      opcoes={REFLEXO_GAG_OPCOES}
                      valor={funcoes.oral?.reflexo_gag}
                      onChange={(v) =>
                        handleFuncoesChange('oral', 'reflexo_gag', v)
                      }
                      disabled={isReadOnly}
                    />
                  </Field>
                </div>

                <Field label="Observações">
                  <Textarea
                    value={funcoes.oral?.observacoes || ''}
                    onChange={(e) =>
                      handleFuncoesChange('oral', 'observacoes', e.target.value)
                    }
                    disabled={isReadOnly}
                    placeholder="Observações sobre a função oral..."
                    rows={2}
                  />
                </Field>
              </div>
            </div>

            {/* ========== FUNÇÃO AUDITIVA ========== */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-green-50 dark:bg-green-950/30 px-4 py-3 border-b">
                <h5 className="font-semibold flex items-center gap-2">
                  <span>👂</span>
                  Função Auditiva
                </h5>
                <p className="text-xs text-muted-foreground mt-1">
                  Reação ao som indica estado do sistema nervoso autônomo
                </p>
              </div>
              <div className="p-4 space-y-4">
                <Field label="Localização Sonora">
                  <SelectButton
                    opcoes={LOCALIZACAO_SONORA_OPCOES}
                    valor={funcoes.auditiva?.localizacao_sonora}
                    onChange={(v) =>
                      handleFuncoesChange('auditiva', 'localizacao_sonora', v)
                    }
                    disabled={isReadOnly}
                  />
                </Field>

                <Field label="Reação a Ruídos">
                  <SelectButton
                    opcoes={REACAO_RUIDOS_OPCOES}
                    valor={funcoes.auditiva?.reacao_ruidos}
                    onChange={(v) =>
                      handleFuncoesChange('auditiva', 'reacao_ruidos', v)
                    }
                    disabled={isReadOnly}
                  />
                  {alertaSustoExacerbado && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                      <span>⚠️</span>
                      Moro intenso pode indicar sistema nervoso autônomo em
                      alerta/estressado
                    </p>
                  )}
                </Field>

                <Field label="Observações">
                  <Textarea
                    value={funcoes.auditiva?.observacoes || ''}
                    onChange={(e) =>
                      handleFuncoesChange(
                        'auditiva',
                        'observacoes',
                        e.target.value
                      )
                    }
                    disabled={isReadOnly}
                    placeholder="Observações sobre a função auditiva..."
                    rows={2}
                  />
                </Field>
              </div>
            </div>

            {/* Alertas Resumidos */}
            {(alertaVisualRestrito ||
              alertaRespiradorOral ||
              alertaFrenuloCurto ||
              alertaCoordenacao ||
              alertaSustoExacerbado) && (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-900">
                <h5 className="font-semibold text-amber-800 dark:text-amber-200 mb-2 flex items-center gap-2">
                  <span>📋</span>
                  Resumo de Alertas
                </h5>
                <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
                  {alertaVisualRestrito && (
                    <li className="flex items-center gap-2">
                      <span>👁️</span>
                      Rastreio visual restrito à{' '}
                      {funcoes.visual?.rastreio_visual === 'restrito_direita'
                        ? 'direita'
                        : 'esquerda'}
                    </li>
                  )}
                  {alertaRespiradorOral && (
                    <li className="flex items-center gap-2">
                      <span>👄</span>
                      Respirador oral (lábios abertos em repouso)
                    </li>
                  )}
                  {alertaFrenuloCurto && (
                    <li className="flex items-center gap-2">
                      <span>👅</span>
                      Alteração de frênulo lingual (
                      {funcoes.oral?.anatomia_lingua === 'frenulo_curto'
                        ? 'curto'
                        : 'em coração'}
                      )
                    </li>
                  )}
                  {alertaCoordenacao && (
                    <li className="flex items-center gap-2">
                      <span>🍼</span>
                      Descoordenação S/D/R (
                      {funcoes.oral?.coordenacao_sdr === 'cansaco_pausas'
                        ? 'cansaço/pausas'
                        : 'engasgos/tosse'}
                      )
                    </li>
                  )}
                  {alertaSustoExacerbado && (
                    <li className="flex items-center gap-2">
                      <span>👂</span>
                      Susto exacerbado (SNA em alerta)
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        );
      }

      // =====================================================
      // SEÇÃO 12: Medidas Craniométricas
      // =====================================================
      case 'craniometria': {
        const medidas = (avaliacao.medidas_craniometricas ||
          {}) as MedidasCraniometricas;

        // Calcular métricas automaticamente
        const metricasCalculadas = calcularMetricasCraniometricas(medidas);

        // Helper para atualizar medidas e recalcular
        const updateMedidas = (updates: Partial<MedidasCraniometricas>) => {
          const novasMedidas = { ...medidas, ...updates };
          const novasMetricas = calcularMetricasCraniometricas(novasMedidas);
          onChange({
            medidas_craniometricas: {
              ...novasMedidas,
              cva_mm: novasMetricas.cva_mm ?? undefined,
              cvai_percentual: novasMetricas.cvai_percentual ?? undefined,
              ci_percentual: novasMetricas.ci_percentual ?? undefined,
              plagiocefalia_severidade:
                novasMetricas.plagiocefalia_severidade ?? undefined,
              braquicefalia_severidade:
                novasMetricas.braquicefalia_severidade ?? undefined,
              formato_craniano: novasMetricas.formato_craniano,
            },
          });
        };

        return (
          <div className="space-y-6">
            {/* Explicação */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                    Cefalometria Completa
                  </h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Use o craniômetro para medir as diagonais e dimensões. O
                    sistema calculará automaticamente o CVA (assimetria), CVAI
                    (índice de plagiocefalia) e CI (índice cefálico para
                    braquicefalia).
                  </p>
                </div>
              </div>
            </div>

            {/* Controle de Qualidade */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <input
                type="checkbox"
                id="pontos_marcados"
                checked={medidas.pontos_marcados_fita || false}
                onChange={(e) =>
                  updateMedidas({ pontos_marcados_fita: e.target.checked })
                }
                disabled={isReadOnly}
                className="rounded"
              />
              <label htmlFor="pontos_marcados" className="text-sm">
                Pontos marcados com fita dermatográfica (aumenta precisão)
              </label>
            </div>

            {/* SEÇÃO 1: Diagonais (Plagiocefalia) */}
            <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <span className="bg-purple-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">
                  1
                </span>
                Diagonais Cruzadas (para Plagiocefalia)
              </h4>
              <p className="text-xs text-gray-500 mb-4">
                Meça as diagonais cruzadas do crânio. Diagonal A: Testa Esq →
                Nuca Dir. Diagonal B: Testa Dir → Nuca Esq.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Diagonal A (mm)">
                  <div className="relative">
                    <Input
                      type="number"
                      value={medidas.diagonal_a_mm ?? ''}
                      onChange={(e) =>
                        updateMedidas({
                          diagonal_a_mm: e.target.value
                            ? parseFloat(e.target.value)
                            : undefined,
                        })
                      }
                      disabled={isReadOnly}
                      placeholder="Ex: 145"
                      className="pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      mm
                    </span>
                  </div>
                </Field>

                <Field label="Diagonal B (mm)">
                  <div className="relative">
                    <Input
                      type="number"
                      value={medidas.diagonal_b_mm ?? ''}
                      onChange={(e) =>
                        updateMedidas({
                          diagonal_b_mm: e.target.value
                            ? parseFloat(e.target.value)
                            : undefined,
                        })
                      }
                      disabled={isReadOnly}
                      placeholder="Ex: 135"
                      className="pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      mm
                    </span>
                  </div>
                </Field>
              </div>

              {/* Resultado CVA/CVAI */}
              {medidas.diagonal_a_mm && medidas.diagonal_b_mm && (
                <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <span className="text-xs text-gray-500">
                        CVA (Assimetria)
                      </span>
                      <p className="font-bold text-lg">
                        {metricasCalculadas.cva_mm?.toFixed(1)} mm
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">
                        CVAI (Índice)
                      </span>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-lg">
                          {metricasCalculadas.cvai_percentual?.toFixed(2)}%
                        </p>
                        {metricasCalculadas.plagiocefalia_severidade && (
                          <Badge
                            className={cn(
                              'text-white',
                              getCorPlagiocefalia(
                                metricasCalculadas.cvai_percentual
                              )
                            )}
                          >
                            {
                              PLAGIOCEFALIA_CLASSIFICACAO.find(
                                (p) =>
                                  p.severidade ===
                                  metricasCalculadas.plagiocefalia_severidade
                              )?.label
                            }
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <span className="text-xs text-gray-500">
                        Classificação
                      </span>
                      <p className="font-medium">
                        {
                          PLAGIOCEFALIA_CLASSIFICACAO.find(
                            (p) =>
                              p.severidade ===
                              metricasCalculadas.plagiocefalia_severidade
                          )?.emoji
                        }{' '}
                        Nível{' '}
                        {PLAGIOCEFALIA_CLASSIFICACAO.find(
                          (p) =>
                            p.severidade ===
                            metricasCalculadas.plagiocefalia_severidade
                        )?.nivel || '-'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SEÇÃO 2: Comprimento e Largura (Braquicefalia) */}
            <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <span className="bg-orange-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">
                  2
                </span>
                Dimensões (para Braquicefalia/Escafocefalia)
              </h4>
              <p className="text-xs text-gray-500 mb-4">
                Comprimento: Glabela (entre sobrancelhas) → Opistocrânio (ponto
                mais posterior). Largura: Eurion → Eurion (parte mais larga,
                acima das orelhas).
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Comprimento AP (mm)">
                  <div className="relative">
                    <Input
                      type="number"
                      value={medidas.comprimento_ap_mm ?? ''}
                      onChange={(e) =>
                        updateMedidas({
                          comprimento_ap_mm: e.target.value
                            ? parseFloat(e.target.value)
                            : undefined,
                        })
                      }
                      disabled={isReadOnly}
                      placeholder="Ex: 120"
                      className="pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      mm
                    </span>
                  </div>
                </Field>

                <Field label="Largura ML (mm)">
                  <div className="relative">
                    <Input
                      type="number"
                      value={medidas.largura_ml_mm ?? ''}
                      onChange={(e) =>
                        updateMedidas({
                          largura_ml_mm: e.target.value
                            ? parseFloat(e.target.value)
                            : undefined,
                        })
                      }
                      disabled={isReadOnly}
                      placeholder="Ex: 110"
                      className="pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      mm
                    </span>
                  </div>
                </Field>
              </div>

              {/* Resultado CI */}
              {medidas.comprimento_ap_mm && medidas.largura_ml_mm && (
                <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs text-gray-500">
                        CI (Índice Cefálico)
                      </span>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-lg">
                          {metricasCalculadas.ci_percentual?.toFixed(1)}%
                        </p>
                        {metricasCalculadas.braquicefalia_severidade && (
                          <Badge
                            className={cn(
                              'text-white',
                              getCorBraquicefalia(
                                metricasCalculadas.ci_percentual
                              )
                            )}
                          >
                            {
                              BRAQUICEFALIA_CLASSIFICACAO.find(
                                (b) =>
                                  b.severidade ===
                                  metricasCalculadas.braquicefalia_severidade
                              )?.label
                            }
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Descrição</span>
                      <p className="font-medium text-sm">
                        {
                          BRAQUICEFALIA_CLASSIFICACAO.find(
                            (b) =>
                              b.severidade ===
                              metricasCalculadas.braquicefalia_severidade
                          )?.descricao
                        }
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SEÇÃO 3: Perímetro Cefálico */}
            <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <span className="bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">
                  3
                </span>
                Perímetro Cefálico
              </h4>

              <Field label="Perímetro Cefálico (cm)">
                <div className="relative w-40">
                  <Input
                    type="number"
                    step="0.1"
                    value={medidas.perimetro_cefalico_cm ?? ''}
                    onChange={(e) =>
                      updateMedidas({
                        perimetro_cefalico_cm: e.target.value
                          ? parseFloat(e.target.value)
                          : undefined,
                      })
                    }
                    disabled={isReadOnly}
                    placeholder="Ex: 42.5"
                    className="pr-12"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    cm
                  </span>
                </div>
              </Field>
            </div>

            {/* RESUMO / ALERTAS */}
            {metricasCalculadas.alertas.length > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4">
                <h4 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Alertas Clínicos
                </h4>
                <ul className="space-y-1">
                  {metricasCalculadas.alertas.map((alerta, idx) => (
                    <li
                      key={idx}
                      className="text-sm text-yellow-700 dark:text-yellow-300"
                    >
                      {alerta}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Formato Craniano Final */}
            {metricasCalculadas.formato_craniano !== 'normal' && (
              <div
                className={cn(
                  'border rounded-lg p-4',
                  metricasCalculadas.formato_craniano === 'misto'
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-300'
                    : 'bg-orange-50 dark:bg-orange-900/20 border-orange-300'
                )}
              >
                <h4 className="font-semibold mb-2">
                  Formato Craniano:{' '}
                  {metricasCalculadas.formato_craniano.toUpperCase()}
                </h4>
                <p className="text-sm">
                  {metricasCalculadas.formato_craniano === 'plagiocefalia' &&
                    'Assimetria craniana detectada. Foco no reposicionamento e alongamento cervical.'}
                  {metricasCalculadas.formato_craniano === 'braquicefalia' &&
                    'Cabeça achatada posteriormente. Foco em tummy time e variedade de posições.'}
                  {metricasCalculadas.formato_craniano === 'escafocefalia' &&
                    'Cabeça alongada. Avaliar histórico de posicionamento lateral.'}
                  {metricasCalculadas.formato_craniano === 'misto' &&
                    'Combinação de plagiocefalia + alteração de formato. Tratamento multifocal necessário.'}
                </p>
              </div>
            )}

            {/* Escala de Referência */}
            <details className="bg-gray-50 dark:bg-gray-800 rounded-lg">
              <summary className="p-3 cursor-pointer font-medium text-sm">
                📊 Ver escalas de classificação (CVAI e CI)
              </summary>
              <div className="p-4 pt-0 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h5 className="font-medium text-sm mb-2">
                    Plagiocefalia (CVAI)
                  </h5>
                  <div className="space-y-1">
                    {PLAGIOCEFALIA_CLASSIFICACAO.map((n) => (
                      <div
                        key={n.nivel}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span className={cn('w-3 h-3 rounded-full', n.cor)} />
                        <span>
                          Nível {n.nivel}: {n.label} ({n.cvai_min}% -{' '}
                          {n.cvai_max}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h5 className="font-medium text-sm mb-2">
                    Braquicefalia (CI)
                  </h5>
                  <div className="space-y-1">
                    {BRAQUICEFALIA_CLASSIFICACAO.map((n) => (
                      <div
                        key={n.severidade}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span className={cn('w-3 h-3 rounded-full', n.cor)} />
                        <span>
                          {n.label} ({n.ci_min}% - {n.ci_max}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </details>
          </div>
        );
      }

      // =====================================================
      // SEÇÃO 13: Assimetria Craniana (Classificação Qualitativa)
      // =====================================================
      case 'assimetria': {
        const assimetria = (avaliacao.assimetria_craniana ||
          {}) as AssimetriaCraniana;
        const medidasCranio = avaliacao.medidas_craniometricas || {};

        // Helper para atualizar assimetria
        const updateAssimetria = (updates: Partial<AssimetriaCraniana>) => {
          onChange({
            assimetria_craniana: { ...assimetria, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            {/* Resumo das Métricas (se disponíveis) */}
            {(medidasCranio.cvai_percentual || medidasCranio.ci_percentual) && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">
                  📊 Classificação Automática (das Medidas Craniométricas)
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {medidasCranio.cvai_percentual != null && (
                    <div>
                      <span className="text-xs text-gray-500">
                        Plagiocefalia (CVAI)
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge
                          className={cn(
                            'text-white',
                            getCorPlagiocefalia(medidasCranio.cvai_percentual)
                          )}
                        >
                          {medidasCranio.cvai_percentual.toFixed(1)}%
                        </Badge>
                        <span className="text-sm font-medium">
                          {
                            PLAGIOCEFALIA_CLASSIFICACAO.find(
                              (p) =>
                                p.severidade ===
                                medidasCranio.plagiocefalia_severidade
                            )?.label
                          }
                        </span>
                      </div>
                    </div>
                  )}
                  {medidasCranio.ci_percentual != null && (
                    <div>
                      <span className="text-xs text-gray-500">
                        Forma da Cabeça (CI)
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge
                          className={cn(
                            'text-white',
                            getCorBraquicefalia(medidasCranio.ci_percentual)
                          )}
                        >
                          {medidasCranio.ci_percentual.toFixed(1)}%
                        </Badge>
                        <span className="text-sm font-medium">
                          {
                            BRAQUICEFALIA_CLASSIFICACAO.find(
                              (b) =>
                                b.severidade ===
                                medidasCranio.braquicefalia_severidade
                            )?.label
                          }
                        </span>
                      </div>
                    </div>
                  )}
                  {medidasCranio.formato_craniano && (
                    <div>
                      <span className="text-xs text-gray-500">Formato</span>
                      <p className="font-medium capitalize">
                        {medidasCranio.formato_craniano}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tipo de Plagiocefalia */}
            <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
              <h4 className="font-semibold mb-3">Tipo de Plagiocefalia</h4>
              <Field label="Localização da Assimetria">
                <RadioButtonGroup
                  value={assimetria.plagiocefalia?.tipo}
                  onChange={(v) =>
                    updateAssimetria({
                      plagiocefalia: {
                        ...assimetria.plagiocefalia,
                        tipo: v as 'aboboda' | 'base' | 'mista',
                        severidade: medidasCranio.plagiocefalia_severidade,
                      },
                    })
                  }
                  options={PLAGIOCEFALIA_TIPO_OPCOES}
                  disabled={isReadOnly}
                />
              </Field>
            </div>

            {/* Observações Qualitativas */}
            <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <span className="bg-purple-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">
                  A
                </span>
                Observações Qualitativas
              </h4>
              <p className="text-xs text-gray-500 mb-4">
                Avaliação complementar para confirmar se a assimetria afetou a
                base do crânio e face.
              </p>

              <div className="space-y-4">
                {/* Ear Shift */}
                <Field label="Desalinhamento das Orelhas (Ear Shift)">
                  <RadioButtonGroup
                    value={assimetria.ear_shift}
                    onChange={(v) =>
                      updateAssimetria({ ear_shift: v as EarShift })
                    }
                    options={EAR_SHIFT_OPCOES.map((o) => ({
                      valor: o.valor,
                      label: o.label,
                    }))}
                    disabled={isReadOnly}
                  />
                  {assimetria.ear_shift &&
                    assimetria.ear_shift !== 'alinhadas' && (
                      <div className="mt-2">
                        <Field label="Qual orelha está anteriorizada?">
                          <RadioButtonGroup
                            value={assimetria.ear_shift_lado}
                            onChange={(v) =>
                              updateAssimetria({
                                ear_shift_lado: v as 'direita' | 'esquerda',
                              })
                            }
                            options={[
                              { valor: 'direita', label: 'Direita' },
                              { valor: 'esquerda', label: 'Esquerda' },
                            ]}
                            disabled={isReadOnly}
                          />
                        </Field>
                      </div>
                    )}
                </Field>

                {assimetria.ear_shift === 'maior_5mm' && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-300">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Desalinhamento maior que 5mm indica que a assimetria
                      afetou a base do crânio. Tratamento pode ser mais
                      prolongado.
                    </p>
                  </div>
                )}

                {/* Bossing Frontal */}
                <Field label="Bossing Frontal (Proeminência da Testa)">
                  <RadioButtonGroup
                    value={assimetria.bossing_frontal}
                    onChange={(v) =>
                      updateAssimetria({ bossing_frontal: v as BossingFrontal })
                    }
                    options={BOSSING_FRONTAL_OPCOES.map((o) => ({
                      valor: o.valor,
                      label: o.label,
                    }))}
                    disabled={isReadOnly}
                  />
                  {assimetria.bossing_frontal &&
                    assimetria.bossing_frontal !== 'ausente' &&
                    assimetria.bossing_frontal !== 'bilateral' && (
                      <div className="mt-2">
                        <Field label="Qual lado está proeminente?">
                          <RadioButtonGroup
                            value={assimetria.bossing_frontal_lado}
                            onChange={(v) =>
                              updateAssimetria({
                                bossing_frontal_lado: v as
                                  | 'direita'
                                  | 'esquerda',
                              })
                            }
                            options={[
                              { valor: 'direita', label: 'Direita' },
                              { valor: 'esquerda', label: 'Esquerda' },
                            ]}
                            disabled={isReadOnly}
                          />
                        </Field>
                      </div>
                    )}
                </Field>

                {/* Assimetria Facial */}
                <Field label="Assimetria Facial Visível?">
                  <BooleanToggle
                    value={assimetria.assimetria_facial}
                    onChange={(v) => updateAssimetria({ assimetria_facial: v })}
                    disabled={isReadOnly}
                  />
                </Field>

                {assimetria.assimetria_facial && (
                  <Field label="Descreva a assimetria facial">
                    <Textarea
                      value={assimetria.assimetria_facial_descricao || ''}
                      onChange={(e) =>
                        updateAssimetria({
                          assimetria_facial_descricao: e.target.value,
                        })
                      }
                      disabled={isReadOnly}
                      placeholder="Ex: Olho direito menor, mandíbula desviada..."
                    />
                  </Field>
                )}
              </div>
            </div>

            {/* Outras Assimetrias */}
            <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <span className="bg-orange-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">
                  B
                </span>
                Outras Assimetrias Observadas
              </h4>

              <CheckboxGroup
                value={assimetria.outras}
                onChange={(v) =>
                  updateAssimetria({
                    outras: v as AssimetriaCraniana['outras'],
                  })
                }
                options={OUTRAS_ASSIMETRIAS_OPCOES}
                disabled={isReadOnly}
              />
            </div>

            {/* Correlação com Torcicolo */}
            {avaliacao.torcicolo_detalhado?.tipo_clinico && (
              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                <h4 className="font-medium text-purple-800 dark:text-purple-200 mb-2">
                  🔗 Correlação Esperada com Torcicolo
                </h4>
                <p className="text-sm text-purple-700 dark:text-purple-300">
                  {avaliacao.torcicolo_detalhado.lado_afetado === 'direito' &&
                    'ECOM Direito afetado → espera-se plagiocefalia occipital direita (achatamento à direita, bossing frontal à esquerda)'}
                  {avaliacao.torcicolo_detalhado.lado_afetado === 'esquerdo' &&
                    'ECOM Esquerdo afetado → espera-se plagiocefalia occipital esquerda (achatamento à esquerda, bossing frontal à direita)'}
                  {avaliacao.torcicolo_detalhado.lado_afetado === 'bilateral' &&
                    'Torcicolo bilateral → pode haver braquicefalia simétrica ou plagiocefalia alternante'}
                  {!avaliacao.torcicolo_detalhado.lado_afetado &&
                    'Verifique se o lado da assimetria corresponde ao lado do torcicolo.'}
                </p>
              </div>
            )}

            {/* Observações Gerais */}
            <Field label="Observações">
              <Textarea
                value={assimetria.observacoes || ''}
                onChange={(e) =>
                  updateAssimetria({ observacoes: e.target.value })
                }
                disabled={isReadOnly}
                placeholder="Observações adicionais sobre a assimetria craniana..."
              />
            </Field>
          </div>
        );
      }

      // =====================================================
      // SEÇÃO 14: Palpação Muscular
      // =====================================================
      case 'palpacao':
        return (
          <div className="space-y-6">
            <Field label="Tônus">
              <RadioButtonGroup
                value={avaliacao.tonus}
                onChange={(v) =>
                  onChange({ tonus: v as AvaliacaoClinica['tonus'] })
                }
                options={[
                  { valor: 'normal', label: 'Normal' },
                  { valor: 'aumentado', label: 'Aumentado' },
                  { valor: 'reduzido', label: 'Reduzido' },
                ]}
                disabled={isReadOnly}
              />
            </Field>

            <Field label="Nódulos presentes?">
              <BooleanToggle
                value={avaliacao.nodulos_presentes}
                onChange={(v) => onChange({ nodulos_presentes: v })}
                disabled={isReadOnly}
                labelSim="Presentes"
                labelNao="Ausentes"
              />
            </Field>

            {avaliacao.nodulos_presentes && (
              <Field label="Localização dos nódulos">
                <Input
                  value={avaliacao.nodulos_localizacao || ''}
                  onChange={(e) =>
                    onChange({ nodulos_localizacao: e.target.value })
                  }
                  disabled={isReadOnly}
                  placeholder="Descreva a localização..."
                />
              </Field>
            )}
          </div>
        );

      // =====================================================
      // SEÇÃO 15: Comportamento Motor
      // =====================================================
      case 'motor':
        return (
          <div className="space-y-6">
            <Field label="Preferência manual">
              <RadioButtonGroup
                value={avaliacao.preferencia_manual}
                onChange={(v) =>
                  onChange({
                    preferencia_manual:
                      v as AvaliacaoClinica['preferencia_manual'],
                  })
                }
                options={[
                  { valor: 'direita', label: 'Direita' },
                  { valor: 'esquerda', label: 'Esquerda' },
                  { valor: 'indefinida', label: 'Indefinida' },
                ]}
                disabled={isReadOnly}
              />
            </Field>

            <Field label="Reações posturais">
              <Textarea
                value={avaliacao.reacoes_posturais || ''}
                onChange={(e) =>
                  onChange({ reacoes_posturais: e.target.value })
                }
                disabled={isReadOnly}
              />
            </Field>

            <Field label="Engajamento visual">
              <Textarea
                value={avaliacao.engajamento_visual || ''}
                onChange={(e) =>
                  onChange({ engajamento_visual: e.target.value })
                }
                disabled={isReadOnly}
              />
            </Field>
          </div>
        );

      // =====================================================
      // SEÇÃO 16: FSOS-2
      // =====================================================
      case 'fsos2': {
        const fsos = (avaliacao.fsos2 || {}) as FSOS2;

        // Função para calcular subtotal de uma posição
        const calcularSubtotalPosicao = (
          posicaoData: FSOS2ItemsPorPosicao | undefined
        ): number => {
          if (!posicaoData) return 0;
          return FSOS2_ITENS.reduce((total, item) => {
            const valor = posicaoData[item.id as keyof FSOS2ItemsPorPosicao];
            return total + (typeof valor === 'number' ? valor : 0);
          }, 0);
        };

        // Calcular subtotais e total
        const subtotais = {
          supino: calcularSubtotalPosicao(fsos.supino),
          prono: calcularSubtotalPosicao(fsos.prono),
          sentado: calcularSubtotalPosicao(fsos.sentado),
          em_pe: calcularSubtotalPosicao(fsos.em_pe),
        };
        const scoreTotal =
          subtotais.supino +
          subtotais.prono +
          subtotais.sentado +
          subtotais.em_pe;

        // Handler para atualizar item de uma posição
        const handleFSOS2Change = (
          posicao: 'supino' | 'prono' | 'sentado' | 'em_pe',
          itemId: string,
          valor: number | string
        ) => {
          const posicaoAtual = fsos[posicao] || {};
          onChange({
            fsos2: {
              ...fsos,
              [posicao]: {
                ...posicaoAtual,
                [itemId]: valor,
              },
              score_total: scoreTotal,
            },
          });
        };

        return (
          <div className="space-y-6">
            {/* Explicação Geral */}
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                <span>📊</span>
                FSOS-2 - Escala de Observação de Simetria Funcional
              </h4>
              <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                Avalia o <strong>quão simétrico</strong> está o comportamento
                motor do bebê em cada posição. Observa se os movimentos são
                iguais dos dois lados, se há preferência de um lado, e se
                existem padrões posturais ou motores assimétricos.
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 italic">
                💡 Dica: Observe por pelo menos 1-2 minutos por posição, sem
                interferir demais no movimento natural.
              </p>
            </div>

            {/* Legenda de Pontuação */}
            <div className="p-3 bg-muted/50 rounded-lg">
              <h5 className="font-medium text-sm mb-2">Pontuação (0 a 4):</h5>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                {FSOS2_PONTUACAO.map((pont) => (
                  <div
                    key={pont.valor}
                    className="text-xs p-2 bg-background rounded border"
                  >
                    <span className="font-bold text-primary">{pont.valor}</span>
                    <span className="text-muted-foreground ml-1">
                      - {pont.label.split(' - ')[1]}
                    </span>
                    <p className="text-muted-foreground/70 mt-0.5 text-[10px]">
                      {pont.descricao}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Seções por Posição */}
            {FSOS2_POSICOES.map((posicao) => {
              const posicaoData = (fsos[posicao.id as keyof FSOS2] ||
                {}) as FSOS2ItemsPorPosicao;
              const subtotal = subtotais[posicao.id as keyof typeof subtotais];
              const porcentagem = Math.round((subtotal / 28) * 100);

              return (
                <details
                  key={posicao.id}
                  open={posicao.id === 'supino'}
                  className="group border rounded-lg overflow-hidden"
                >
                  <summary className="w-full flex items-center justify-between px-4 py-3 text-base font-semibold hover:bg-muted/50 cursor-pointer list-none">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{posicao.icone}</span>
                      <span>{posicao.label}</span>
                      <Badge
                        variant={
                          porcentagem >= 75
                            ? 'default'
                            : porcentagem >= 50
                              ? 'secondary'
                              : 'destructive'
                        }
                        className="ml-2"
                      >
                        {subtotal}/28 ({porcentagem}%)
                      </Badge>
                    </div>
                    <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <div className="border-t">
                    <div className="divide-y">
                      {FSOS2_ITENS.map((item, index) => {
                        const valorAtual = posicaoData[
                          item.id as keyof FSOS2ItemsPorPosicao
                        ] as number | undefined;
                        return (
                          <div
                            key={item.id}
                            className={cn(
                              'p-3',
                              index % 2 === 0 ? 'bg-background' : 'bg-muted/30'
                            )}
                          >
                            <div className="flex flex-col md:flex-row md:items-center gap-2">
                              <div className="flex-1">
                                <p className="font-medium text-sm flex items-center gap-2">
                                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center">
                                    {index + 1}
                                  </span>
                                  {item.label}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1 ml-7">
                                  {item.descricao}
                                </p>
                              </div>
                              <div className="flex gap-1 ml-7 md:ml-0">
                                {FSOS2_PONTUACAO.map((pont) => (
                                  <button
                                    key={pont.valor}
                                    type="button"
                                    onClick={() =>
                                      !isReadOnly &&
                                      handleFSOS2Change(
                                        posicao.id as
                                          | 'supino'
                                          | 'prono'
                                          | 'sentado'
                                          | 'em_pe',
                                        item.id,
                                        pont.valor
                                      )
                                    }
                                    disabled={isReadOnly}
                                    title={pont.descricao}
                                    className={cn(
                                      'w-10 h-10 rounded-lg font-bold text-sm transition-all',
                                      valorAtual === pont.valor
                                        ? pont.valor === 4
                                          ? 'bg-green-500 text-white border-2 border-green-600'
                                          : pont.valor === 3
                                            ? 'bg-lime-500 text-white border-2 border-lime-600'
                                            : pont.valor === 2
                                              ? 'bg-yellow-500 text-white border-2 border-yellow-600'
                                              : pont.valor === 1
                                                ? 'bg-orange-500 text-white border-2 border-orange-600'
                                                : 'bg-red-500 text-white border-2 border-red-600'
                                        : 'bg-muted border-2 border-border hover:border-primary/50',
                                      isReadOnly && 'cursor-default'
                                    )}
                                  >
                                    {pont.valor}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Observações por posição */}
                    <div className="p-3 border-t bg-muted/20">
                      <Field label="Observações">
                        <Textarea
                          value={posicaoData.observacoes || ''}
                          onChange={(e) =>
                            handleFSOS2Change(
                              posicao.id as
                                | 'supino'
                                | 'prono'
                                | 'sentado'
                                | 'em_pe',
                              'observacoes',
                              e.target.value
                            )
                          }
                          disabled={isReadOnly}
                          placeholder={`Observações sobre a posição ${posicao.label.toLowerCase()}...`}
                          className="min-h-[60px]"
                        />
                      </Field>
                    </div>
                  </div>
                </details>
              );
            })}

            {/* Score Total */}
            <div className="p-4 bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-lg">Score Total FSOS-2</h4>
                  <p className="text-sm text-muted-foreground">
                    Quanto maior, mais simétrico o comportamento motor
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-primary">
                    {scoreTotal}
                  </p>
                  <p className="text-sm text-muted-foreground">/112 pontos</p>
                </div>
              </div>

              {/* Barra de progresso */}
              <div className="mt-3">
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all',
                      scoreTotal >= 84
                        ? 'bg-green-500'
                        : scoreTotal >= 56
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                    )}
                    style={{ width: `${(scoreTotal / 112) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                  <span>Assimétrico</span>
                  <span>Simétrico</span>
                </div>
              </div>

              {/* Resumo por posição */}
              <div className="grid grid-cols-4 gap-2 mt-4">
                {FSOS2_POSICOES.map((posicao) => {
                  const subtotal =
                    subtotais[posicao.id as keyof typeof subtotais];
                  return (
                    <div
                      key={posicao.id}
                      className="text-center p-2 bg-background rounded"
                    >
                      <p className="text-lg">{posicao.icone}</p>
                      <p className="text-xs text-muted-foreground">
                        {posicao.label}
                      </p>
                      <p className="font-bold">{subtotal}/28</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      }

      // =====================================================
      // SEÇÃO 17: Funcionalidade Cervical
      // =====================================================
      case 'funcionalidade': {
        const func = (avaliacao.funcionalidade_cervical ||
          {}) as FuncionalidadeCervical;

        // Helper para atualizar funcionalidade
        const updateFunc = (updates: Partial<FuncionalidadeCervical>) => {
          onChange({ funcionalidade_cervical: { ...func, ...updates } });
        };

        return (
          <div className="space-y-6">
            {/* Explicação */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                    Controle Motor Cervical
                  </h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Avalie a biomecânica e controle motor do bebê. Foco: "Ele
                    segura a cabeça no meio?" e "Ele empurra o chão de bruços?".
                    Crucial para plagiocefalia - se não mantém no meio, a cabeça
                    amassa.
                  </p>
                </div>
              </div>
            </div>

            {/* SUPINO (Barriga para cima) */}
            <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <span className="bg-purple-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">
                  1
                </span>
                Supino (Barriga para cima)
              </h4>

              <div className="space-y-4">
                <Field label="Manutenção na Linha Média">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {MANUTENCAO_LINHA_MEDIA_OPCOES.map((opt) => (
                      <button
                        key={opt.valor}
                        type="button"
                        onClick={() =>
                          !isReadOnly &&
                          updateFunc({
                            supino: {
                              ...func.supino,
                              manutencao_linha_media:
                                opt.valor as ManutencaoLinhaMeadia,
                            },
                          })
                        }
                        disabled={isReadOnly}
                        className={cn(
                          'p-3 rounded-lg border text-left transition-all',
                          func.supino?.manutencao_linha_media === opt.valor
                            ? `border-2 border-gray-900 dark:border-white ${opt.cor} bg-opacity-20`
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300',
                          isReadOnly && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn('w-3 h-3 rounded-full', opt.cor)}
                          />
                          <span className="font-medium text-sm">
                            {opt.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {opt.descricao}
                        </p>
                      </button>
                    ))}
                  </div>
                  {func.supino?.manutencao_linha_media ===
                    'cai_preferencia' && (
                    <p className="text-xs text-yellow-600 mt-2 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Preferência postural
                      pode agravar plagiocefalia
                    </p>
                  )}
                </Field>

                <Field label="Alcance de Linha Média (Mãos)">
                  <RadioButtonGroup
                    value={func.supino?.alcance_linha_media}
                    onChange={(v) =>
                      updateFunc({
                        supino: {
                          ...func.supino,
                          alcance_linha_media: v as AlcanceLinhaMeadia,
                        },
                      })
                    }
                    options={ALCANCE_LINHA_MEDIA_OPCOES.map((o) => ({
                      valor: o.valor,
                      label: o.label,
                    }))}
                    disabled={isReadOnly}
                  />
                </Field>

                <Field label="Observações (Supino)">
                  <Textarea
                    value={func.supino?.observacoes || ''}
                    onChange={(e) =>
                      updateFunc({
                        supino: { ...func.supino, observacoes: e.target.value },
                      })
                    }
                    disabled={isReadOnly}
                    rows={2}
                    placeholder="Observações sobre o comportamento em supino..."
                  />
                </Field>
              </div>
            </div>

            {/* PRONO (Tummy Time) */}
            <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <span className="bg-orange-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">
                  2
                </span>
                Prono (Tummy Time - Bruços)
              </h4>

              <div className="space-y-4">
                <Field label="Tolerância ao Tummy Time">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {TOLERANCIA_TUMMY_TIME_OPCOES.map((opt) => (
                      <button
                        key={opt.valor}
                        type="button"
                        onClick={() =>
                          !isReadOnly &&
                          updateFunc({
                            prono: {
                              ...func.prono,
                              tolerancia: opt.valor as ToleranciaTummyTime,
                            },
                          })
                        }
                        disabled={isReadOnly}
                        className={cn(
                          'p-3 rounded-lg border text-left transition-all',
                          func.prono?.tolerancia === opt.valor
                            ? `border-2 border-gray-900 dark:border-white ${opt.cor} bg-opacity-20`
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300',
                          isReadOnly && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn('w-3 h-3 rounded-full', opt.cor)}
                          />
                          <span className="font-medium text-sm">
                            {opt.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {opt.descricao}
                        </p>
                      </button>
                    ))}
                  </div>
                </Field>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Carga de Peso (Apoio)">
                    <RadioButtonGroup
                      value={func.prono?.carga_peso}
                      onChange={(v) =>
                        updateFunc({
                          prono: {
                            ...func.prono,
                            carga_peso: v as CargaPesoProno,
                          },
                        })
                      }
                      options={CARGA_PESO_PRONO_OPCOES.map((o) => ({
                        valor: o.valor,
                        label: o.label,
                      }))}
                      disabled={isReadOnly}
                    />
                  </Field>

                  <Field label="Controle de Cabeça">
                    <RadioButtonGroup
                      value={func.prono?.controle_cabeca}
                      onChange={(v) =>
                        updateFunc({
                          prono: {
                            ...func.prono,
                            controle_cabeca: v as ControleCabecaProno,
                          },
                        })
                      }
                      options={CONTROLE_CABECA_PRONO_OPCOES.map((o) => ({
                        valor: o.valor,
                        label: o.label,
                      }))}
                      disabled={isReadOnly}
                    />
                  </Field>
                </div>

                <Field label="Observações (Prono)">
                  <Textarea
                    value={func.prono?.observacoes || ''}
                    onChange={(e) =>
                      updateFunc({
                        prono: { ...func.prono, observacoes: e.target.value },
                      })
                    }
                    disabled={isReadOnly}
                    rows={2}
                    placeholder="Observações sobre o tummy time..."
                  />
                </Field>
              </div>
            </div>

            {/* Alertas de correlação */}
            {func.prono?.tolerancia === 'chora_imediato' && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 rounded-lg p-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <strong>Dica:</strong> Bebês que rejeitam tummy time tendem a
                  desenvolver plagiocefalia. Oriente os pais sobre técnicas
                  graduais de adaptação.
                </p>
              </div>
            )}
          </div>
        );
      }

      // =====================================================
      // SEÇÃO 18: Resposta Postural (Testes Provocativos)
      // =====================================================
      case 'resposta': {
        const resp = (avaliacao.resposta_postural || {}) as RespostaPostural;

        // Helper para atualizar resposta postural
        const updateResp = (updates: Partial<RespostaPostural>) => {
          onChange({ resposta_postural: { ...resp, ...updates } });
        };

        return (
          <div className="space-y-6">
            {/* Explicação */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                    Testes Provocativos (30 segundos)
                  </h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Avaliação rápida de tônus e controle neuromotor. O Teste de
                    Tração é o principal indicador de atraso motor.
                  </p>
                </div>
              </div>
            </div>

            {/* TESTE DE TRAÇÃO (Pull-to-Sit) */}
            <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <span className="bg-purple-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">
                  1
                </span>
                Teste de Tração (Pull-to-Sit)
              </h4>
              <p className="text-xs text-gray-500 mb-4">
                Segure os punhos do bebê e puxe-o lentamente para sentar.
                Observe se a cabeça acompanha ou fica para trás.
              </p>

              <div className="space-y-4">
                <Field label="Head Lag (Atraso da Cabeça)">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {HEAD_LAG_OPCOES.map((opt) => (
                      <button
                        key={opt.valor}
                        type="button"
                        onClick={() =>
                          !isReadOnly &&
                          updateResp({
                            tracao: {
                              ...resp.tracao,
                              head_lag: opt.valor as HeadLag,
                            },
                          })
                        }
                        disabled={isReadOnly}
                        className={cn(
                          'p-3 rounded-lg border text-left transition-all',
                          resp.tracao?.head_lag === opt.valor
                            ? `border-2 border-gray-900 dark:border-white ${opt.cor} bg-opacity-20`
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300',
                          isReadOnly && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn('w-3 h-3 rounded-full', opt.cor)}
                          />
                          <span className="font-medium text-sm">
                            {opt.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {opt.descricao}
                        </p>
                      </button>
                    ))}
                  </div>
                </Field>

                {resp.tracao?.head_lag === 'total' && (
                  <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-300">
                    <p className="text-sm text-red-800 dark:text-red-200 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      <strong>RED FLAG:</strong> Head lag total após 4 meses
                      pode indicar hipotonia significativa. Considere avaliação
                      neurológica complementar.
                    </p>
                  </div>
                )}

                <Field label="Ativação de Flexores">
                  <RadioButtonGroup
                    value={resp.tracao?.ativacao_flexores}
                    onChange={(v) =>
                      updateResp({
                        tracao: {
                          ...resp.tracao,
                          ativacao_flexores: v as AtivacaoFlexores,
                        },
                      })
                    }
                    options={ATIVACAO_FLEXORES_OPCOES.map((o) => ({
                      valor: o.valor,
                      label: o.label,
                    }))}
                    disabled={isReadOnly}
                  />
                </Field>

                <Field label="Observações">
                  <Textarea
                    value={resp.tracao?.observacoes || ''}
                    onChange={(e) =>
                      updateResp({
                        tracao: { ...resp.tracao, observacoes: e.target.value },
                      })
                    }
                    disabled={isReadOnly}
                    rows={2}
                    placeholder="Observações sobre o teste de tração..."
                  />
                </Field>
              </div>
            </div>

            {/* REFLEXO DE LANDAU (Suspensão Ventral) */}
            <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <span className="bg-orange-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">
                  2
                </span>
                Reflexo de Landau (Suspensão Ventral)
              </h4>
              <p className="text-xs text-gray-500 mb-4">
                Suspenda o bebê horizontalmente pela barriga. O padrão normal é
                "aviãozinho" com extensão de cabeça, tronco e pernas.
              </p>

              <div className="space-y-4">
                <Field label="Padrão Observado">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {PADRAO_LANDAU_OPCOES.map((opt) => (
                      <button
                        key={opt.valor}
                        type="button"
                        onClick={() =>
                          !isReadOnly &&
                          updateResp({
                            landau: {
                              ...resp.landau,
                              padrao: opt.valor as PadraoLandau,
                            },
                          })
                        }
                        disabled={isReadOnly}
                        className={cn(
                          'p-3 rounded-lg border text-left transition-all',
                          resp.landau?.padrao === opt.valor
                            ? `border-2 border-gray-900 dark:border-white ${opt.cor} bg-opacity-20`
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300',
                          isReadOnly && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn('w-3 h-3 rounded-full', opt.cor)}
                          />
                          <span className="font-medium text-sm">
                            {opt.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {opt.descricao}
                        </p>
                      </button>
                    ))}
                  </div>
                </Field>

                {resp.landau?.padrao === 'hipotonico' && (
                  <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-300">
                    <p className="text-sm text-red-800 dark:text-red-200 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Padrão hipotônico (U invertido) indica baixo tônus
                      muscular. Investigar causas e fortalecer musculatura
                      extensora.
                    </p>
                  </div>
                )}

                <Field label="Observações">
                  <Textarea
                    value={resp.landau?.observacoes || ''}
                    onChange={(e) =>
                      updateResp({
                        landau: { ...resp.landau, observacoes: e.target.value },
                      })
                    }
                    disabled={isReadOnly}
                    rows={2}
                    placeholder="Observações sobre o reflexo de Landau..."
                  />
                </Field>
              </div>
            </div>

            {/* Repercussões */}
            <Field label="Repercussões em tronco/membros">
              <Textarea
                value={
                  resp.repercussoes_tronco_membros ||
                  avaliacao.repercussoes_tronco_membros ||
                  ''
                }
                onChange={(e) =>
                  updateResp({ repercussoes_tronco_membros: e.target.value })
                }
                disabled={isReadOnly}
                rows={3}
                placeholder="Descreva repercussões observadas em tronco e membros..."
              />
            </Field>
          </div>
        );
      }

      // =====================================================
      // SEÇÃO 19: AIMS (Alberta Infant Motor Scale)
      // =====================================================
      case 'aims': {
        const aimsDetalhada = (avaliacao.aims_detalhada || {
          itens_marcados: {},
        }) as AIMSDetalhada;
        const aimsIdadeMeses = patientAgeInMonths || 0;

        // Calcular scores baseados nos itens marcados
        const calcularScoresAIMS = (itens: Record<string, boolean>) => {
          const prono = AIMS_ITENS_PRONO.filter((i) => itens[i.id]).length;
          const supino = AIMS_ITENS_SUPINO.filter((i) => itens[i.id]).length;
          const sentado = AIMS_ITENS_SENTADO.filter((i) => itens[i.id]).length;
          const em_pe = AIMS_ITENS_EM_PE.filter((i) => itens[i.id]).length;
          return {
            prono,
            supino,
            sentado,
            em_pe,
            total: prono + supino + sentado + em_pe,
          };
        };

        const aimsScores = calcularScoresAIMS(aimsDetalhada.itens_marcados);
        const aimsResultado =
          aimsScores.total > 0 && aimsIdadeMeses > 0
            ? calcularPercentilAIMS(aimsIdadeMeses, aimsScores.total)
            : null;

        // Helper para marcar/desmarcar item
        const toggleItemAIMS = (itemId: string) => {
          const novosItens = {
            ...aimsDetalhada.itens_marcados,
            [itemId]: !aimsDetalhada.itens_marcados[itemId],
          };
          const novosScores = calcularScoresAIMS(novosItens);
          const novoResultado =
            novosScores.total > 0 && aimsIdadeMeses > 0
              ? calcularPercentilAIMS(aimsIdadeMeses, novosScores.total)
              : null;

          onChange({
            aims_detalhada: {
              itens_marcados: novosItens,
              prono: novosScores.prono,
              supino: novosScores.supino,
              sentado: novosScores.sentado,
              em_pe: novosScores.em_pe,
              score_total: novosScores.total,
              percentil: novoResultado?.percentil,
              classificacao: novoResultado?.classificacao,
              idade_meses_avaliacao: aimsIdadeMeses,
            },
            // Atualiza também o campo legado
            aims: {
              prono: novosScores.prono,
              supino: novosScores.supino,
              sentado: novosScores.sentado,
              em_pe: novosScores.em_pe,
              score_total: novosScores.total,
              percentil: novoResultado?.percentil,
              classificacao: novoResultado?.classificacao,
            },
          });
        };

        // Marcar todos até uma idade específica
        const marcarTodosAteIdade = (idadeLimite: number) => {
          const novosItens: Record<string, boolean> = {
            ...aimsDetalhada.itens_marcados,
          };
          [
            ...AIMS_ITENS_PRONO,
            ...AIMS_ITENS_SUPINO,
            ...AIMS_ITENS_SENTADO,
            ...AIMS_ITENS_EM_PE,
          ].forEach((item) => {
            if (item.idade_tipica_meses < idadeLimite) {
              novosItens[item.id] = true;
            }
          });
          const novosScores = calcularScoresAIMS(novosItens);
          const novoResultado =
            novosScores.total > 0 && aimsIdadeMeses > 0
              ? calcularPercentilAIMS(aimsIdadeMeses, novosScores.total)
              : null;

          onChange({
            aims_detalhada: {
              itens_marcados: novosItens,
              prono: novosScores.prono,
              supino: novosScores.supino,
              sentado: novosScores.sentado,
              em_pe: novosScores.em_pe,
              score_total: novosScores.total,
              percentil: novoResultado?.percentil,
              classificacao: novoResultado?.classificacao,
              idade_meses_avaliacao: aimsIdadeMeses,
            },
            aims: {
              prono: novosScores.prono,
              supino: novosScores.supino,
              sentado: novosScores.sentado,
              em_pe: novosScores.em_pe,
              score_total: novosScores.total,
              percentil: novoResultado?.percentil,
              classificacao: novoResultado?.classificacao,
            },
          });
        };

        // Componente para renderizar uma sub-escala
        const renderSubescala = (
          titulo: string,
          emoji: string,
          cor: string,
          itens: typeof AIMS_ITENS_PRONO,
          scoreAtual: number
        ) => (
          <details className="bg-white dark:bg-gray-800 border rounded-lg" open>
            <summary
              className={cn(
                'p-3 cursor-pointer font-semibold flex items-center justify-between',
                cor
              )}
            >
              <span>
                {emoji} {titulo}
              </span>
              <Badge className="bg-gray-900 text-white">
                {scoreAtual}/{itens.length}
              </Badge>
            </summary>
            <div className="p-3 pt-0">
              <div className="grid grid-cols-1 gap-1 mt-2">
                {itens.map((item) => {
                  const isChecked =
                    aimsDetalhada.itens_marcados[item.id] || false;
                  const isEsperado = item.idade_tipica_meses < aimsIdadeMeses;
                  return (
                    <label
                      key={item.id}
                      className={cn(
                        'flex items-start gap-2 p-2 rounded cursor-pointer transition-all text-sm',
                        isChecked
                          ? 'bg-green-100 dark:bg-green-900/30 border border-green-300'
                          : isEsperado
                            ? 'bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 hover:bg-yellow-100'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-700 border border-transparent',
                        isReadOnly && 'cursor-not-allowed opacity-60'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => !isReadOnly && toggleItemAIMS(item.id)}
                        disabled={isReadOnly}
                        className="mt-1 rounded"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{item.nome}</span>
                          <span className="text-xs text-gray-500">
                            ~{item.idade_tipica_meses}m
                          </span>
                          {isEsperado && !isChecked && (
                            <span className="text-xs text-yellow-600 bg-yellow-100 px-1 rounded">
                              esperado
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {item.descricao}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </details>
        );

        return (
          <div className="space-y-6">
            {/* Explicação Geral */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                    AIMS - Alberta Infant Motor Scale
                  </h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Marque cada item que o bebê demonstrar espontaneamente. Os
                    scores são calculados automaticamente. Idade do paciente:{' '}
                    <strong>{aimsIdadeMeses} meses</strong>
                  </p>
                </div>
              </div>
            </div>

            {/* Ações Rápidas */}
            {!isReadOnly && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 rounded-lg p-3">
                <h5 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2 text-sm">
                  ⚡ Ações Rápidas
                </h5>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-2">
                  Marque automaticamente todos os itens esperados para bebês
                  mais novos que a idade selecionada:
                </p>
                <div className="flex flex-wrap gap-2">
                  {[2, 4, 6, 8, 10, 12].map((idade) => (
                    <button
                      key={idade}
                      type="button"
                      onClick={() => marcarTodosAteIdade(idade)}
                      className={cn(
                        'px-3 py-1 rounded text-xs font-medium transition-all',
                        idade <= aimsIdadeMeses
                          ? 'bg-green-500 text-white hover:bg-green-600'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      )}
                    >
                      Marcar até {idade}m
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Score Resumo */}
            <div
              className={cn(
                'border rounded-lg p-4',
                aimsResultado?.classificacao === 'atipico'
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-300'
                  : aimsResultado?.classificacao === 'suspeito'
                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300'
                    : aimsScores.total > 0
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-300'
                      : 'bg-gray-50 dark:bg-gray-800'
              )}
            >
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-center">
                <div>
                  <span className="text-xs text-gray-500">🔶 Prono</span>
                  <p className="font-bold text-lg text-orange-600">
                    {aimsScores.prono}/21
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">🔷 Supino</span>
                  <p className="font-bold text-lg text-blue-600">
                    {aimsScores.supino}/9
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">🟢 Sentado</span>
                  <p className="font-bold text-lg text-green-600">
                    {aimsScores.sentado}/12
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">🔴 Em Pé</span>
                  <p className="font-bold text-lg text-red-600">
                    {aimsScores.em_pe}/16
                  </p>
                </div>
                <div className="border-l pl-3">
                  <span className="text-xs text-gray-500">TOTAL</span>
                  <p className="font-bold text-xl">{aimsScores.total}/58</p>
                </div>
                <div className="border-l pl-3">
                  <span className="text-xs text-gray-500">Percentil</span>
                  {aimsResultado ? (
                    <Badge
                      className={cn(
                        'text-white mt-1',
                        getCorClassificacaoAIMS(aimsResultado.classificacao)
                      )}
                    >
                      P{aimsResultado.percentil}
                    </Badge>
                  ) : (
                    <p className="text-gray-400">-</p>
                  )}
                </div>
              </div>

              {/* Barra de progresso */}
              {aimsScores.total > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={cn(
                        'h-2 rounded-full transition-all',
                        aimsResultado?.classificacao === 'atipico'
                          ? 'bg-red-500'
                          : aimsResultado?.classificacao === 'suspeito'
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                      )}
                      style={{
                        width: `${Math.min((aimsScores.total / 58) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Sub-escalas com Checkboxes */}
            <div className="space-y-3">
              {renderSubescala(
                'PRONO (De bruços)',
                '🔶',
                'text-orange-700 dark:text-orange-300',
                AIMS_ITENS_PRONO,
                aimsScores.prono
              )}
              {renderSubescala(
                'SUPINO (Barriga para cima)',
                '🔷',
                'text-blue-700 dark:text-blue-300',
                AIMS_ITENS_SUPINO,
                aimsScores.supino
              )}
              {renderSubescala(
                'SENTADO',
                '🟢',
                'text-green-700 dark:text-green-300',
                AIMS_ITENS_SENTADO,
                aimsScores.sentado
              )}
              {renderSubescala(
                'EM PÉ',
                '🔴',
                'text-red-700 dark:text-red-300',
                AIMS_ITENS_EM_PE,
                aimsScores.em_pe
              )}
            </div>

            {/* Resultado Calculado */}
            {aimsScores.total > 0 && (
              <div
                className={cn(
                  'border rounded-lg p-4',
                  aimsResultado?.classificacao === 'atipico'
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-300'
                    : aimsResultado?.classificacao === 'suspeito'
                      ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300'
                      : 'bg-green-50 dark:bg-green-900/20 border-green-300'
                )}
              >
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <CheckCircle2
                    className={cn(
                      'h-5 w-5',
                      aimsResultado?.classificacao === 'atipico'
                        ? 'text-red-600'
                        : aimsResultado?.classificacao === 'suspeito'
                          ? 'text-yellow-600'
                          : 'text-green-600'
                    )}
                  />
                  Resultado AIMS (Calculado Automaticamente)
                </h4>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <span className="text-xs text-gray-500">Score Total</span>
                    <p className="font-bold text-2xl">{aimsScores.total}/58</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Percentil</span>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-2xl">
                        {aimsResultado?.percentil || '-'}%
                      </p>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Classificação</span>
                    <Badge
                      className={cn(
                        'text-white mt-1',
                        getCorClassificacaoAIMS(aimsResultado?.classificacao)
                      )}
                    >
                      {aimsResultado?.classificacao === 'atipico' &&
                        '⚠️ Atípico'}
                      {aimsResultado?.classificacao === 'suspeito' &&
                        '⚡ Suspeito'}
                      {aimsResultado?.classificacao === 'normal' && '✅ Normal'}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Idade</span>
                    <p className="font-medium">{aimsIdadeMeses} meses</p>
                  </div>
                </div>

                {/* Alertas */}
                {aimsResultado?.classificacao === 'atipico' && (
                  <div className="mt-4 pt-3 border-t border-current/20">
                    <p className="text-sm flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>
                        <strong>
                          Desenvolvimento Atípico (Percentil ≤5%):
                        </strong>{' '}
                        Indica possível atraso motor significativo. Recomenda-se
                        avaliação neurológica complementar e intensificação da
                        estimulação.
                      </span>
                    </p>
                  </div>
                )}
                {aimsResultado?.classificacao === 'suspeito' && (
                  <div className="mt-4 pt-3 border-t border-current/20">
                    <p className="text-sm flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>
                        <strong>
                          Desenvolvimento Suspeito (Percentil 6-10%):
                        </strong>{' '}
                        Monitorar de perto. Reavaliar em 4-6 semanas para
                        confirmar ou descartar atraso.
                      </span>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Interpretação dos Resultados */}
            <details
              className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
              open={aimsScores.total > 0}
            >
              <summary className="p-4 cursor-pointer font-semibold text-green-900 dark:text-green-100">
                📋 Como interpretar o resultado
              </summary>
              <div className="p-4 pt-0 space-y-3 text-sm">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border-l-4 border-green-500">
                    <h5 className="font-semibold text-green-700 dark:text-green-300">
                      ✅ Normal (P {'>'} 10%)
                    </h5>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Desenvolvimento motor dentro do esperado para a idade.
                      Manter estimulação e acompanhamento de rotina.
                    </p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border-l-4 border-yellow-500">
                    <h5 className="font-semibold text-yellow-700 dark:text-yellow-300">
                      ⚡ Suspeito (P 6-10%)
                    </h5>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Zona de alerta. Reavaliar em 4-6 semanas. Orientar
                      estimulação motora mais intensiva em casa.
                    </p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border-l-4 border-red-500">
                    <h5 className="font-semibold text-red-700 dark:text-red-300">
                      ⚠️ Atípico (P ≤ 5%)
                    </h5>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Atraso motor significativo. Investigar causas. Considerar
                      avaliação neurológica e intervenção precoce.
                    </p>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-xs">
                  <h5 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
                    💬 Como comunicar aos pais:
                  </h5>
                  <ul className="space-y-1 text-blue-700 dark:text-blue-300 list-disc list-inside">
                    <li>
                      <strong>Normal:</strong> "O desenvolvimento motor do bebê
                      está adequado para a idade."
                    </li>
                    <li>
                      <strong>Suspeito:</strong> "Vamos acompanhar mais de perto
                      e intensificar os exercícios em casa."
                    </li>
                    <li>
                      <strong>Atípico:</strong> "Identificamos alguns pontos que
                      precisam de atenção. Vamos trabalhar juntos e fazer
                      avaliações complementares."
                    </li>
                  </ul>
                </div>
              </div>
            </details>

            {/* Tabela de Referência */}
            <details className="bg-gray-50 dark:bg-gray-800 rounded-lg">
              <summary className="p-3 cursor-pointer font-medium text-sm">
                📊 Ver tabela de referência AIMS por idade
              </summary>
              <div className="p-4 pt-0 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="p-2 text-left">Idade (meses)</th>
                      <th className="p-2">P5</th>
                      <th className="p-2">P10</th>
                      <th className="p-2">P25</th>
                      <th className="p-2 bg-blue-50 dark:bg-blue-900/20">
                        P50
                      </th>
                      <th className="p-2">P75</th>
                      <th className="p-2">P90</th>
                    </tr>
                  </thead>
                  <tbody>
                    {AIMS_REFERENCIA_PERCENTIL.filter(
                      (r) => r.idade_meses <= 12
                    ).map((ref) => (
                      <tr
                        key={ref.idade_meses}
                        className={cn(
                          'border-b',
                          Math.abs(ref.idade_meses - aimsIdadeMeses) < 0.5 &&
                            'bg-yellow-50 dark:bg-yellow-900/20 font-bold'
                        )}
                      >
                        <td className="p-2">{ref.idade_meses}m</td>
                        <td className="p-2 text-center text-red-600">
                          {ref.p5}
                        </td>
                        <td className="p-2 text-center text-yellow-600">
                          {ref.p10}
                        </td>
                        <td className="p-2 text-center">{ref.p25}</td>
                        <td className="p-2 text-center bg-blue-50 dark:bg-blue-900/20">
                          {ref.p50}
                        </td>
                        <td className="p-2 text-center">{ref.p75}</td>
                        <td className="p-2 text-center text-green-600">
                          {ref.p90}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-gray-500 mt-2">
                  Valores de referência baseados em Piper & Darrah (1994). P5 =
                  Percentil 5 (atípico), P50 = Percentil 50 (mediana).
                </p>
              </div>
            </details>

            {/* Dicas Práticas */}
            <details className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
              <summary className="p-3 cursor-pointer font-medium text-sm text-orange-900 dark:text-orange-100">
                💡 Dicas práticas para a avaliação
              </summary>
              <div className="p-4 pt-0 text-xs space-y-2 text-orange-800 dark:text-orange-200">
                <p>
                  • <strong>Ambiente:</strong> Superfície firme, temperatura
                  agradável, bebê só de fralda
                </p>
                <p>
                  • <strong>Timing:</strong> Após alimentação (30-60 min), bebê
                  alerta e calmo
                </p>
                <p>
                  • <strong>Materiais:</strong> Brinquedos coloridos, sonoros,
                  de fácil preensão
                </p>
                <p>
                  • <strong>Prematuros:</strong> Use a idade corrigida até os 2
                  anos
                </p>
                <p>
                  • <strong>Documentação:</strong> Filme trechos para comparação
                  futura
                </p>
                <p>
                  • <strong>Repetição:</strong> Se em dúvida sobre um item,
                  observe novamente em outra sessão
                </p>
              </div>
            </details>
          </div>
        );
      }

      // =====================================================
      // SEÇÃO 20: Grau de Severidade
      // =====================================================
      case 'severidade': {
        // =====================================================
        // CÁLCULO AUTOMÁTICO DE SEVERIDADE
        // Baseado em: Idade + Goniometria + Palpação (Nódulo)
        // =====================================================

        // Obter dados necessários da avaliação
        const gonioSev = avaliacao.goniometria;
        const torcicoloSev = avaliacao.torcicolo_detalhado;

        // Calcular déficit de rotação (da goniometria)
        let deficitRotacaoSev = 0;
        if (gonioSev?.rotacao) {
          const rotDirSev = gonioSev.rotacao.passiva_direita ?? 0;
          const rotEsqSev = gonioSev.rotacao.passiva_esquerda ?? 0;
          deficitRotacaoSev = Math.abs(rotDirSev - rotEsqSev);
        }

        // Verificar presença de nódulo (da palpação) - usando estrutura correta
        const temNoduloSev = !!(
          (torcicoloSev?.ecom_direito_nodulo &&
            torcicoloSev.ecom_direito_nodulo !== 'ausente') ||
          (torcicoloSev?.ecom_esquerdo_nodulo &&
            torcicoloSev.ecom_esquerdo_nodulo !== 'ausente')
        );

        // Calcular severidade automaticamente
        const severidadeCalc = calcularSeveridadeAutomatica(
          patientAgeInMonths || 0,
          deficitRotacaoSev,
          temNoduloSev
        );

        // Verificar se há dados suficientes
        const temDadosGoniometria =
          gonioSev?.rotacao &&
          (gonioSev.rotacao.passiva_direita !== undefined ||
            gonioSev.rotacao.passiva_esquerda !== undefined);
        const temDadosTorcicolo =
          torcicoloSev?.tipo_clinico !== undefined ||
          avaliacao.tem_torcicolo !== undefined;
        const dadosSuficientes =
          temDadosGoniometria || temDadosTorcicolo || temNoduloSev;

        return (
          <div className="space-y-6">
            {/* Explicação */}
            <div className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-500 rounded-lg">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="font-semibold text-purple-900 dark:text-purple-100 mb-1">
                    🤖 Classificação Automática
                  </h4>
                  <p className="text-sm text-purple-800 dark:text-purple-200">
                    O grau de severidade é calculado automaticamente baseado nos
                    dados coletados:
                  </p>
                  <ul className="mt-2 text-xs text-purple-700 dark:text-purple-300 space-y-1">
                    <li>
                      • <strong>Idade:</strong> {patientAgeInMonths || 0} meses
                    </li>
                    <li>
                      • <strong>Déficit de Rotação:</strong> {deficitRotacaoSev}
                      ° (da Goniometria)
                    </li>
                    <li>
                      • <strong>Nódulo:</strong>{' '}
                      {temNoduloSev ? 'Presente' : 'Ausente'} (da Palpação)
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Resultado Automático */}
            {dadosSuficientes ? (
              <div
                className={cn(
                  'p-6 rounded-xl border-2 text-center',
                  severidadeCalc.corTailwind
                )}
                style={{ borderColor: severidadeCalc.cor }}
              >
                <div className="text-6xl font-bold mb-2">
                  {severidadeCalc.grau}
                </div>
                <div className="text-xl font-semibold mb-1">
                  GRAU {severidadeCalc.grau} -{' '}
                  {severidadeCalc.titulo.toUpperCase()}
                </div>
                <div className="text-sm opacity-90 mb-4">
                  Grupo:{' '}
                  {severidadeCalc.grupo === 'precoce'
                    ? 'Precoce (0-6m)'
                    : severidadeCalc.grupo === 'tardio'
                      ? 'Tardio (7-12m)'
                      : 'Muito Tardio (>12m)'}
                </div>

                {/* Critérios utilizados */}
                <div className="mt-4 p-3 bg-black/10 rounded-lg text-left">
                  <p className="text-xs font-semibold mb-2">
                    📋 Critérios utilizados:
                  </p>
                  <ul className="text-xs space-y-1 opacity-90">
                    <li>
                      • Faixa etária: {severidadeCalc.criterios.idade_grupo}
                    </li>
                    <li>
                      • Déficit de rotação:{' '}
                      {severidadeCalc.criterios.deficit_rotacao}
                    </li>
                    <li>
                      • Nódulo:{' '}
                      {severidadeCalc.criterios.nodulo ? 'Presente' : 'Ausente'}
                    </li>
                  </ul>
                </div>

                {/* Prognóstico */}
                <div className="mt-4 p-4 bg-white/20 rounded-lg">
                  <p className="text-sm font-bold mb-1">
                    ⏱️ Prognóstico Estimado
                  </p>
                  <p className="text-2xl font-bold">
                    {severidadeCalc.prognostico.min_meses} a{' '}
                    {severidadeCalc.prognostico.max_meses} meses
                  </p>
                  <p className="text-xs mt-2 opacity-90">
                    {severidadeCalc.prognostico.mensagem}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-center bg-gray-50 dark:bg-gray-800/50">
                <div className="text-4xl mb-3">📊</div>
                <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Aguardando Dados
                </h4>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Complete as seguintes seções para o cálculo automático:
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {!temDadosGoniometria && (
                    <span className="px-3 py-1 bg-orange-100 text-orange-700 text-xs rounded-full">
                      9. Goniometria
                    </span>
                  )}
                  {!temDadosTorcicolo && (
                    <span className="px-3 py-1 bg-orange-100 text-orange-700 text-xs rounded-full">
                      8. Tipo de Torcicolo
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Tabela de Referência */}
            <details className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border">
              <summary className="p-3 cursor-pointer font-semibold text-sm">
                📖 Tabela de Referência (Cheng et al.)
              </summary>
              <div className="p-4 pt-0">
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Precoce */}
                  <div className="space-y-2">
                    <h5 className="font-semibold text-green-700 dark:text-green-400 text-sm border-b border-green-200 pb-1">
                      🟢 PRECOCE (0-6 meses)
                    </h5>
                    <div className="space-y-1 text-xs">
                      <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded">
                        <strong>Grau 1:</strong> Diferença &lt;15° (Postural)
                      </div>
                      <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded">
                        <strong>Grau 2:</strong> Diferença 15-30°
                      </div>
                      <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded">
                        <strong>Grau 3:</strong> Diferença &gt;30° ou Nódulo
                      </div>
                    </div>
                  </div>

                  {/* Tardio */}
                  <div className="space-y-2">
                    <h5 className="font-semibold text-orange-700 dark:text-orange-400 text-sm border-b border-orange-200 pb-1">
                      🟠 TARDIO (7-12 meses)
                    </h5>
                    <div className="space-y-1 text-xs">
                      <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded">
                        <strong>Grau 4:</strong> 7-9m, Diferença &lt;15°
                      </div>
                      <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded">
                        <strong>Grau 5:</strong> 10-12m, Diferença &lt;15°
                      </div>
                      <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded">
                        <strong>Grau 6:</strong> 7-9m ≥15° ou 10-12m 15-30°
                      </div>
                      <div className="p-2 bg-red-200 dark:bg-red-900/50 rounded">
                        <strong>Grau 7:</strong> Nódulo ou 10-12m &gt;30°
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs">
                  <strong className="text-red-700 dark:text-red-400">
                    🔴 Grau 8 - Muito Tardio:
                  </strong>
                  <span className="text-red-600 dark:text-red-300">
                    {' '}
                    Qualquer caso após 12 meses.
                  </span>
                </div>
              </div>
            </details>

            <Field label="Observações adicionais">
              <Textarea
                value={avaliacao.grau_severidade_obs || ''}
                onChange={(e) =>
                  onChange({ grau_severidade_obs: e.target.value })
                }
                disabled={isReadOnly}
                placeholder="Observações complementares sobre a classificação..."
              />
            </Field>
          </div>
        );
      }

      // =====================================================
      // SEÇÃO 21: Exames Complementares
      // =====================================================
      case 'exames':
        return (
          <Field label="Exames Complementares">
            <EvolutionEditor
              value={avaliacao.exames_complementares || ''}
              onChange={(value) => onChange({ exames_complementares: value })}
              disabled={isReadOnly}
              placeholder="Descreva os exames complementares realizados ou solicitados..."
            />
          </Field>
        );

      // =====================================================
      // SEÇÃO 22: Diagnóstico
      // =====================================================
      case 'diagnostico': {
        // Gerar diagnóstico automático
        const diagnosticoGerado = gerarDiagnosticoAutomatico(
          avaliacao,
          patientName || 'Paciente',
          patientAgeInMonths || 0,
          avaliacao.nome_pai ?? undefined,
          avaliacao.nome_mae ?? undefined
        );

        const handleGerarDiagnostico = () => {
          onChange({
            diagnostico_cinetico_funcional: diagnosticoGerado.texto_completo,
          });
        };

        const handleExportarPDF = async () => {
          // Criar conteúdo HTML para PDF
          const conteudoHTML = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>Avaliação TM/AC - ${patientName}</title>
              <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; line-height: 1.6; color: #333; }
                .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
                .header h1 { color: #1e40af; margin: 0; font-size: 24px; }
                .header p { color: #6b7280; margin: 5px 0; }
                .section { margin-bottom: 25px; }
                .section h2 { color: #1e40af; font-size: 14px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 10px; }
                .content { text-align: justify; }
                .tags { margin-top: 30px; padding: 15px; background: #f3f4f6; border-radius: 8px; }
                .tags h3 { font-size: 12px; color: #6b7280; margin: 0 0 10px 0; }
                .tag { display: inline-block; background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-size: 10px; margin: 2px; }
                .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; }
                .signature { margin-top: 60px; }
                .signature-line { border-top: 1px solid #333; width: 250px; margin: 0 auto; }
                .signature-text { text-align: center; margin-top: 5px; font-size: 12px; }
              </style>
            </head>
            <body>
              <div class="header">
                <h1>AVALIAÇÃO FISIOTERAPÊUTICA</h1>
                <p>Torcicolo Muscular / Assimetria Craniana</p>
                <p>Data: ${new Date().toLocaleDateString('pt-BR')}</p>
              </div>
              
              <div class="section">
                <h2>Identificação</h2>
                <div class="content">${diagnosticoGerado.secoes.identificacao || '-'}</div>
              </div>
              
              ${
                diagnosticoGerado.secoes.queixa_anamnese
                  ? `
              <div class="section">
                <h2>Queixa e Anamnese</h2>
                <div class="content">${diagnosticoGerado.secoes.queixa_anamnese}</div>
              </div>
              `
                  : ''
              }
              
              ${
                diagnosticoGerado.secoes.achados_fisicos
                  ? `
              <div class="section">
                <h2>Achados Físicos</h2>
                <div class="content">${diagnosticoGerado.secoes.achados_fisicos}</div>
              </div>
              `
                  : ''
              }
              
              ${
                diagnosticoGerado.secoes.classificacao_torcicolo
                  ? `
              <div class="section">
                <h2>Classificação do Torcicolo</h2>
                <div class="content">${diagnosticoGerado.secoes.classificacao_torcicolo}</div>
              </div>
              `
                  : ''
              }
              
              ${
                diagnosticoGerado.secoes.assimetria_craniana
                  ? `
              <div class="section">
                <h2>Assimetria Craniana</h2>
                <div class="content">${diagnosticoGerado.secoes.assimetria_craniana}</div>
              </div>
              `
                  : ''
              }
              
              ${
                diagnosticoGerado.secoes.desenvolvimento_motor
                  ? `
              <div class="section">
                <h2>Desenvolvimento Motor</h2>
                <div class="content">${diagnosticoGerado.secoes.desenvolvimento_motor}</div>
              </div>
              `
                  : ''
              }
              
              ${
                diagnosticoGerado.secoes.conclusao_funcional
                  ? `
              <div class="section">
                <h2>Conclusão Funcional</h2>
                <div class="content">${diagnosticoGerado.secoes.conclusao_funcional}</div>
              </div>
              `
                  : ''
              }
              
              ${
                diagnosticoGerado.secoes.plano_tratamento
                  ? `
              <div class="section">
                <h2>Prognóstico e Plano de Tratamento</h2>
                <div class="content">${diagnosticoGerado.secoes.plano_tratamento}</div>
              </div>
              `
                  : ''
              }
              
              <div class="tags">
                <h3>Tags Clínicas Detectadas:</h3>
                ${diagnosticoGerado.tags_detectadas.map((t) => `<span class="tag">${t}</span>`).join('')}
              </div>
              
              <div class="signature">
                <div class="signature-line"></div>
                <p class="signature-text">Fisioterapeuta Responsável</p>
              </div>
              
              <div class="footer">
                <p>Documento gerado automaticamente em ${new Date().toLocaleString('pt-BR')}</p>
              </div>
            </body>
            </html>
          `;

          // Abrir janela de impressão/PDF
          const printWindow = window.open('', '_blank');
          if (printWindow) {
            printWindow.document.write(conteudoHTML);
            printWindow.document.close();
            setTimeout(() => {
              printWindow.print();
            }, 500);
          }
        };

        return (
          <div className="space-y-6">
            {/* Explicação */}
            <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 rounded-lg border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-emerald-500 rounded-lg">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="font-semibold text-emerald-900 dark:text-emerald-100 mb-1">
                    ✨ Gerador de Diagnóstico Inteligente
                  </h4>
                  <p className="text-sm text-emerald-800 dark:text-emerald-200">
                    O sistema pode gerar automaticamente um texto de diagnóstico
                    cinético-funcional baseado em todas as informações coletadas
                    nesta avaliação. Você pode revisar e editar o texto antes de
                    salvar.
                  </p>
                </div>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleGerarDiagnostico}
                disabled={isReadOnly}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all',
                  'bg-emerald-600 text-white hover:bg-emerald-700',
                  isReadOnly && 'opacity-50 cursor-not-allowed'
                )}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                Gerar Diagnóstico Automático
              </button>

              <button
                type="button"
                onClick={handleExportarPDF}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all bg-blue-600 text-white hover:bg-blue-700"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Exportar PDF
              </button>
            </div>

            {/* Preview das Seções Detectadas */}
            <details
              className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border"
              open
            >
              <summary className="p-3 cursor-pointer font-semibold text-sm flex items-center gap-2">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
                Preview do Diagnóstico Gerado
              </summary>
              <div className="p-4 pt-2 space-y-3 text-sm">
                {Object.entries(diagnosticoGerado.secoes).map(
                  ([key, value]) => {
                    if (!value) return null;
                    const labels: Record<string, string> = {
                      identificacao: '👤 Identificação',
                      queixa_anamnese: '📝 Queixa/Anamnese',
                      achados_fisicos: '🔍 Achados Físicos',
                      classificacao_torcicolo: '🎯 Classificação',
                      assimetria_craniana: '📐 Assimetria Craniana',
                      desenvolvimento_motor: '🚼 Desenvolvimento Motor',
                      conclusao_funcional: '✅ Conclusão Funcional',
                      plano_tratamento: '📋 Plano/Prognóstico',
                    };
                    return (
                      <div
                        key={key}
                        className="p-2 bg-white dark:bg-gray-700 rounded border-l-4 border-emerald-500"
                      >
                        <p className="font-medium text-emerald-700 dark:text-emerald-300 text-xs mb-1">
                          {labels[key] || key}
                        </p>
                        <p className="text-gray-700 dark:text-gray-300">
                          {value}
                        </p>
                      </div>
                    );
                  }
                )}

                {/* Tags detectadas */}
                {diagnosticoGerado.tags_detectadas.length > 0 && (
                  <div className="pt-3 border-t">
                    <p className="text-xs font-medium text-gray-500 mb-2">
                      🏷️ Tags Clínicas Detectadas:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {diagnosticoGerado.tags_detectadas.map((tag, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </details>

            {/* Campo de Texto Editável */}
            <Field label="Diagnóstico Cinético-Funcional (Editável)">
              <EvolutionEditor
                value={avaliacao.diagnostico_cinetico_funcional || ''}
                onChange={(value) =>
                  onChange({ diagnostico_cinetico_funcional: value })
                }
                disabled={isReadOnly}
                placeholder="Clique em 'Gerar Diagnóstico Automático' ou escreva manualmente..."
              />
            </Field>
          </div>
        );
      }

      // =====================================================
      // SEÇÃO 23: Objetivos do Tratamento
      // =====================================================
      case 'objetivos': {
        const objetivos = (avaliacao.objetivos_tratamento ||
          {}) as ObjetivosTratamento;
        return (
          <div className="space-y-6">
            <Field label="Curto prazo">
              <Textarea
                value={objetivos.curto_prazo || ''}
                onChange={(e) =>
                  onChange({
                    objetivos_tratamento: {
                      ...objetivos,
                      curto_prazo: e.target.value,
                    },
                  })
                }
                disabled={isReadOnly}
                rows={3}
              />
            </Field>

            <Field label="Médio prazo">
              <Textarea
                value={objetivos.medio_prazo || ''}
                onChange={(e) =>
                  onChange({
                    objetivos_tratamento: {
                      ...objetivos,
                      medio_prazo: e.target.value,
                    },
                  })
                }
                disabled={isReadOnly}
                rows={3}
              />
            </Field>

            <Field label="Longo prazo">
              <Textarea
                value={objetivos.longo_prazo || ''}
                onChange={(e) =>
                  onChange({
                    objetivos_tratamento: {
                      ...objetivos,
                      longo_prazo: e.target.value,
                    },
                  })
                }
                disabled={isReadOnly}
                rows={3}
              />
            </Field>
          </div>
        );
      }

      // =====================================================
      // SEÇÃO 24: Plano de Tratamento
      // =====================================================
      case 'plano':
        return (
          <Field label="Plano de Tratamento Inicial">
            <EvolutionEditor
              value={avaliacao.plano_tratamento || ''}
              onChange={(value) => onChange({ plano_tratamento: value })}
              disabled={isReadOnly}
              placeholder="Descreva o plano de tratamento..."
            />
          </Field>
        );

      // =====================================================
      // SEÇÃO 25: Reavaliação
      // =====================================================
      case 'reavaliacao':
        return (
          <div className="space-y-6">
            <Field label="Reavaliação Recomendada">
              <RadioButtonGroup
                value={avaliacao.reavaliacao_recomendada}
                onChange={(v) =>
                  onChange({
                    reavaliacao_recomendada:
                      v as AvaliacaoClinica['reavaliacao_recomendada'],
                  })
                }
                options={REAVALIACAO_OPCOES}
                disabled={isReadOnly}
              />
            </Field>

            {avaliacao.reavaliacao_recomendada === 'outro' && (
              <Field label="Especifique">
                <Input
                  value={avaliacao.reavaliacao_outro || ''}
                  onChange={(e) =>
                    onChange({ reavaliacao_outro: e.target.value })
                  }
                  disabled={isReadOnly}
                />
              </Field>
            )}
          </div>
        );

      // =====================================================
      // SEÇÃO 26: Observações Gerais
      // =====================================================
      case 'observacoes':
        return (
          <Field label="Observações Gerais">
            <EvolutionEditor
              value={avaliacao.observacoes_gerais || ''}
              onChange={(value) => onChange({ observacoes_gerais: value })}
              disabled={isReadOnly}
              placeholder="Observações adicionais sobre a avaliação..."
            />
          </Field>
        );

      default:
        return (
          <div className="text-center py-8 text-muted-foreground">
            Seção não implementada
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Título da Seção */}
      <div className="border-b pb-4">
        <h3 className="text-xl font-semibold">
          {secao.numero}. {secao.titulo}
        </h3>
        {secao.descricao && (
          <p className="text-sm text-muted-foreground mt-1">
            {secao.descricao}
          </p>
        )}
      </div>

      {/* Conteúdo da Seção */}
      {renderContent()}
    </div>
  );
};

EvaluationSectionContent.displayName = 'EvaluationSectionContent';
