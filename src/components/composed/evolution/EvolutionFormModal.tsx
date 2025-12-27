import React, { useState, useEffect, useCallback } from 'react';
import {
  Save,
  CheckCircle2,
  Circle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Progress } from '@/components/primitives/progress';
import { ScrollArea } from '@/components/primitives/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/primitives/tooltip';
import { cn } from '@/lib/utils';
import {
  type TipoEvolucao,
  type EvolucaoRespiratoria,
  type EvolucaoMotoraAssimetria,
  EVOLUCAO_RESPIRATORIA_SECOES,
  EVOLUCAO_MOTORA_ASSIMETRIA_SECOES,
  criarEvolucaoRespiratoriaVazia,
  criarEvolucaoMotoraAssimetriaVazia,
  verificarSecaoEvolucaoCompleta,
} from '@/types/evolucao-clinica';
import { EvolutionSectionContent } from './EvolutionSectionContent';

// AI dev note: EvolutionFormModal - Modal de formulário de evolução estruturada
// Suporta evolução respiratória e motora/assimetria

export interface EvolutionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (dados: {
    tipo_evolucao: TipoEvolucao;
    evolucao_respiratoria?: EvolucaoRespiratoria;
    evolucao_motora_assimetria?: EvolucaoMotoraAssimetria;
  }) => Promise<void>;
  tipoServico?: string;
  patientName?: string;
  existingData?: {
    tipo_evolucao?: TipoEvolucao;
    evolucao_respiratoria?: EvolucaoRespiratoria;
    evolucao_motora_assimetria?: EvolucaoMotoraAssimetria;
  };
  mode?: 'create' | 'edit' | 'view';
}

export const EvolutionFormModal: React.FC<EvolutionFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  tipoServico,
  patientName,
  existingData,
  mode = 'create',
}) => {
  // Determinar tipo de evolução baseado no serviço
  const determinarTipoEvolucao = useCallback((): TipoEvolucao => {
    if (existingData?.tipo_evolucao) return existingData.tipo_evolucao;

    if (tipoServico) {
      const nomeLower = tipoServico.toLowerCase();
      if (
        nomeLower.includes('respira') ||
        nomeLower.includes('pulmonar') ||
        nomeLower.includes('bronqu') ||
        nomeLower.includes('pneumo')
      ) {
        return 'respiratoria';
      }
    }
    return 'respiratoria'; // Default
  }, [tipoServico, existingData]);

  const [tipoEvolucao, setTipoEvolucao] = useState<TipoEvolucao>(
    determinarTipoEvolucao
  );
  const [evolucaoRespiratoria, setEvolucaoRespiratoria] =
    useState<EvolucaoRespiratoria>(
      existingData?.evolucao_respiratoria || criarEvolucaoRespiratoriaVazia()
    );
  const [evolucaoMotora, setEvolucaoMotora] =
    useState<EvolucaoMotoraAssimetria>(
      existingData?.evolucao_motora_assimetria ||
        criarEvolucaoMotoraAssimetriaVazia()
    );

  const [currentSection, setCurrentSection] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const isReadOnly = mode === 'view';

  // Seções baseadas no tipo
  const secoes =
    tipoEvolucao === 'respiratoria'
      ? EVOLUCAO_RESPIRATORIA_SECOES
      : EVOLUCAO_MOTORA_ASSIMETRIA_SECOES;

  const currentSectionData = secoes[currentSection];

  // Reset quando modal abre
  useEffect(() => {
    if (isOpen) {
      setTipoEvolucao(determinarTipoEvolucao());
      setEvolucaoRespiratoria(
        existingData?.evolucao_respiratoria || criarEvolucaoRespiratoriaVazia()
      );
      setEvolucaoMotora(
        existingData?.evolucao_motora_assimetria ||
          criarEvolucaoMotoraAssimetriaVazia()
      );
      setCurrentSection(0);
    }
  }, [isOpen, existingData, determinarTipoEvolucao]);

  // Handler para atualização de campos respiratórios
  const handleRespiratoriaChange = useCallback(
    (updates: Partial<EvolucaoRespiratoria>) => {
      if (isReadOnly) return;
      setEvolucaoRespiratoria((prev) => ({ ...prev, ...updates }));
    },
    [isReadOnly]
  );

  // Handler para atualização de campos motores
  const handleMotoraChange = useCallback(
    (updates: Partial<EvolucaoMotoraAssimetria>) => {
      if (isReadOnly) return;
      setEvolucaoMotora((prev) => ({ ...prev, ...updates }));
    },
    [isReadOnly]
  );

  // Salvar
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        tipo_evolucao: tipoEvolucao,
        evolucao_respiratoria:
          tipoEvolucao === 'respiratoria' ? evolucaoRespiratoria : undefined,
        evolucao_motora_assimetria:
          tipoEvolucao === 'motora_assimetria' ? evolucaoMotora : undefined,
      });
      onClose();
    } catch (error) {
      console.error('Erro ao salvar evolução:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Navegação
  const goToNext = () => {
    if (currentSection < secoes.length - 1) {
      setCurrentSection((prev) => prev + 1);
    }
  };

  const goToPrev = () => {
    if (currentSection > 0) {
      setCurrentSection((prev) => prev - 1);
    }
  };

  // Calcular progresso
  const calcularProgresso = (): number => {
    let completas = 0;
    const dados =
      tipoEvolucao === 'respiratoria' ? evolucaoRespiratoria : evolucaoMotora;

    for (const secao of secoes) {
      const status = verificarSecaoEvolucaoCompleta(
        tipoEvolucao,
        secao.id,
        dados
      );
      if (status === 'completo') completas++;
    }

    return Math.round((completas / secoes.length) * 100);
  };

  const progresso = calcularProgresso();

  // Obter ícone de status da seção
  const getStatusIcon = (secaoId: string) => {
    const dados =
      tipoEvolucao === 'respiratoria' ? evolucaoRespiratoria : evolucaoMotora;
    const status = verificarSecaoEvolucaoCompleta(tipoEvolucao, secaoId, dados);

    switch (status) {
      case 'completo':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'parcial':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTipoLabel = () => {
    return tipoEvolucao === 'respiratoria'
      ? '🫁 Evolução Respiratória'
      : '🦴 Evolução Motora/Assimetria';
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-[900px] h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <DialogTitle className="text-lg font-semibold">
                {getTipoLabel()}
              </DialogTitle>
              {patientName && (
                <span className="text-sm text-muted-foreground">
                  Paciente: {patientName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Seletor de tipo */}
              <div className="flex gap-1">
                <Button
                  variant={
                    tipoEvolucao === 'respiratoria' ? 'default' : 'outline'
                  }
                  size="sm"
                  onClick={() => !isReadOnly && setTipoEvolucao('respiratoria')}
                  disabled={isReadOnly}
                >
                  🫁 Respiratória
                </Button>
                <Button
                  variant={
                    tipoEvolucao === 'motora_assimetria' ? 'default' : 'outline'
                  }
                  size="sm"
                  onClick={() =>
                    !isReadOnly && setTipoEvolucao('motora_assimetria')
                  }
                  disabled={isReadOnly}
                >
                  🦴 Motora
                </Button>
              </div>
              <Badge variant="secondary">{progresso}% completo</Badge>
            </div>
          </div>
          <Progress value={progresso} className="h-1 mt-2" />
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar de navegação */}
          <div className="w-64 border-r bg-muted/30 flex-shrink-0 hidden md:block">
            <ScrollArea className="h-full">
              <div className="p-3 space-y-1">
                {secoes.map((secao, index) => (
                  <TooltipProvider key={secao.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setCurrentSection(index)}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left',
                            currentSection === index
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-accent'
                          )}
                        >
                          <span className="text-lg">{secao.icone}</span>
                          <span className="flex-1 truncate">
                            {secao.titulo}
                          </span>
                          {getStatusIcon(secao.id)}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {secao.titulo}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Conteúdo principal */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header da seção */}
            <div className="px-6 py-3 border-b bg-muted/20 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{currentSectionData?.icone}</span>
                  <h3 className="text-lg font-medium">
                    {currentSectionData?.titulo}
                  </h3>
                </div>
                <span className="text-sm text-muted-foreground">
                  {currentSection + 1} de {secoes.length}
                </span>
              </div>
            </div>

            {/* Conteúdo da seção */}
            <ScrollArea className="flex-1">
              <div className="p-6">
                <EvolutionSectionContent
                  tipoEvolucao={tipoEvolucao}
                  secaoId={currentSectionData?.id || ''}
                  evolucaoRespiratoria={evolucaoRespiratoria}
                  evolucaoMotora={evolucaoMotora}
                  onRespiratoriaChange={handleRespiratoriaChange}
                  onMotoraChange={handleMotoraChange}
                  disabled={isReadOnly}
                />
              </div>
            </ScrollArea>

            {/* Footer com navegação */}
            <div className="px-6 py-4 border-t bg-background flex-shrink-0">
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={goToPrev}
                  disabled={currentSection === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Anterior
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={onClose}
                    disabled={isSaving}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancelar
                  </Button>

                  {!isReadOnly && (
                    <Button onClick={handleSave} disabled={isSaving}>
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Salvar Evolução
                    </Button>
                  )}
                </div>

                <Button
                  variant="outline"
                  onClick={goToNext}
                  disabled={currentSection === secoes.length - 1}
                >
                  Próximo
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

EvolutionFormModal.displayName = 'EvolutionFormModal';
