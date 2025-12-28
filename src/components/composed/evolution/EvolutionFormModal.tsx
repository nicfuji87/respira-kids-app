import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const isReadOnly = mode === 'view';

  // Scroll to top when section changes
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        '[data-radix-scroll-area-viewport]'
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = 0;
      }
    }
  }, [currentSection]);

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
  const getStatusIcon = (secaoId: string, className?: string) => {
    const dados =
      tipoEvolucao === 'respiratoria' ? evolucaoRespiratoria : evolucaoMotora;
    const status = verificarSecaoEvolucaoCompleta(tipoEvolucao, secaoId, dados);

    const baseClass = className || 'h-4 w-4';

    switch (status) {
      case 'completo':
        return <CheckCircle2 className={cn(baseClass, 'text-green-500')} />;
      case 'parcial':
        return <AlertCircle className={cn(baseClass, 'text-yellow-500')} />;
      default:
        return <Circle className={cn(baseClass, 'text-muted-foreground')} />;
    }
  };

  const getTipoLabel = () => {
    return tipoEvolucao === 'respiratoria'
      ? '🫁 Evolução Respiratória'
      : '🦴 Evolução Motora/Assimetria';
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-[900px] h-[95vh] sm:h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-4 py-3 sm:px-6 sm:py-4 border-b flex-shrink-0 space-y-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center justify-between sm:justify-start gap-2">
                <DialogTitle className="text-base sm:text-lg font-semibold truncate">
                  {getTipoLabel()}
                </DialogTitle>
                <Badge variant="secondary" className="sm:hidden text-xs">
                  {progresso}%
                </Badge>
              </div>
              {patientName && (
                <span className="text-xs sm:text-sm text-muted-foreground truncate max-w-[200px] sm:max-w-none">
                  Paciente: {patientName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-1 sm:pb-0">
              {/* Seletor de tipo - Compacto em mobile */}
              <div className="flex gap-1 shrink-0">
                <Button
                  variant={
                    tipoEvolucao === 'respiratoria' ? 'default' : 'outline'
                  }
                  size="sm"
                  onClick={() => !isReadOnly && setTipoEvolucao('respiratoria')}
                  disabled={isReadOnly}
                  className="h-7 text-xs sm:h-9 sm:text-sm px-2 sm:px-4"
                >
                  <span className="sm:hidden">Resp.</span>
                  <span className="hidden sm:inline">🫁 Respiratória</span>
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
                  className="h-7 text-xs sm:h-9 sm:text-sm px-2 sm:px-4"
                >
                  <span className="sm:hidden">Motora</span>
                  <span className="hidden sm:inline">🦴 Motora</span>
                </Button>
              </div>
              <Badge variant="secondary" className="hidden sm:inline-flex">
                {progresso}% completo
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 sm:hidden ml-auto"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Progress value={progresso} className="h-1 mt-2 hidden sm:block" />
        </DialogHeader>

        {/* Conteúdo principal - sem sidebar */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header da seção com indicadores de progresso */}
          <div className="px-4 py-2 sm:px-6 sm:py-3 border-b bg-muted/20 flex-shrink-0">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="text-xl sm:text-2xl shrink-0">
                  {currentSectionData?.icone}
                </span>
                <h3 className="text-base sm:text-lg font-medium truncate">
                  {currentSectionData?.titulo}
                </h3>
              </div>
              <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap ml-2">
                {currentSection + 1} / {secoes.length}
              </span>
            </div>
            {/* Indicadores de seção (bolinhas) */}
            <div className="flex items-center justify-start sm:justify-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
              {secoes.map((secao, index) => (
                <TooltipProvider key={secao.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setCurrentSection(index)}
                        className={cn(
                          'flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-full transition-all shrink-0',
                          currentSection === index
                            ? 'bg-primary text-primary-foreground scale-110'
                            : 'bg-muted hover:bg-accent'
                        )}
                      >
                        {getStatusIcon(secao.id, 'h-3 w-3 sm:h-4 sm:w-4')}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {secao.icone} {secao.titulo}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </div>

          {/* Conteúdo da seção */}
          <ScrollArea className="flex-1" ref={scrollAreaRef}>
            <div className="p-4 sm:p-6">
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
          <div className="px-4 py-3 sm:px-6 sm:py-4 border-t bg-background flex-shrink-0">
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                onClick={goToPrev}
                disabled={currentSection === 0}
                className="flex-1 sm:flex-none"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                <span className="sm:inline">Anterior</span>
              </Button>

              <div className="hidden sm:flex items-center gap-2">
                <Button variant="outline" onClick={onClose} disabled={isSaving}>
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

              {/* Mobile Action Button (Next or Save) */}
              <div className="flex sm:hidden flex-1 gap-2">
                {currentSection === secoes.length - 1 ? (
                  !isReadOnly && (
                    <Button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="flex-1"
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Salvar
                    </Button>
                  )
                ) : (
                  <Button
                    variant="default" // Mudado para default para destacar "Próximo" em mobile
                    onClick={goToNext}
                    disabled={currentSection === secoes.length - 1}
                    className="flex-1"
                  >
                    Próximo
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </div>

              <Button
                variant="outline"
                onClick={goToNext}
                disabled={currentSection === secoes.length - 1}
                className="hidden sm:flex"
              >
                Próximo
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

EvolutionFormModal.displayName = 'EvolutionFormModal';
