// AI dev note: Marcar/desmarcar a pesquisa de experiência com "Desfazer".
// A secretaria às vezes marca sem querer: todo marcar e desmarcar mostra um
// toast com Desfazer, que regrava exatamente o estado anterior. Usado no card
// do paciente, nos detalhes do agendamento e na lista de convites.

import { useState } from 'react';
import { ToastAction } from '@/components/primitives/toast';
import { useToast } from '@/components/primitives/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  clearResponsibleExperienceSurveyTracking,
  markResponsibleExperienceSurveyAnswered,
  setResponsibleExperienceSurveyTracking,
  type ExperienceSurveyTracking,
} from '@/lib/patient-api';

type SurveyTrackingValues = Pick<
  ExperienceSurveyTracking,
  'respondidaEm' | 'proximaEm' | 'marcadoPor'
>;

const UNDO_DURATION_MS = 10000;

export function useExperienceSurveyMarking(
  onChange: (tracking: ExperienceSurveyTracking) => void
) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);

  const restore = async (
    responsavelId: string,
    previous: SurveyTrackingValues
  ) => {
    setIsSaving(true);
    try {
      const restored = await setResponsibleExperienceSurveyTracking(
        responsavelId,
        previous
      );
      onChange(restored);
      toast({ title: 'Alteração desfeita' });
    } catch (error) {
      console.error('Erro ao desfazer controle da pesquisa:', error);
      toast({
        title: 'Não foi possível desfazer',
        description: 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const apply = async (
    responsavelId: string,
    previous: SurveyTrackingValues | null | undefined,
    action: 'marcar' | 'desmarcar'
  ) => {
    if (isSaving) return;

    const snapshot: SurveyTrackingValues = {
      respondidaEm: previous?.respondidaEm ?? null,
      proximaEm: previous?.proximaEm ?? null,
      marcadoPor: previous?.marcadoPor ?? null,
    };

    setIsSaving(true);
    try {
      const updated =
        action === 'marcar'
          ? await markResponsibleExperienceSurveyAnswered(
              responsavelId,
              user?.pessoa?.id
            )
          : await clearResponsibleExperienceSurveyTracking(responsavelId);
      onChange(updated);

      const { dismiss } = toast({
        title:
          action === 'marcar'
            ? 'Pesquisa marcada como respondida'
            : 'Marcação da pesquisa removida',
        description:
          action === 'marcar'
            ? 'O próximo lembrete fica para daqui a 6 meses. Marcou sem querer? Clique em Desfazer.'
            : 'A família volta para a lista de convites da pesquisa.',
        duration: UNDO_DURATION_MS,
        action: (
          <ToastAction
            altText="Desfazer"
            onClick={() => {
              dismiss();
              void restore(responsavelId, snapshot);
            }}
          >
            Desfazer
          </ToastAction>
        ),
      });
    } catch (error) {
      console.error('Erro ao salvar controle da pesquisa:', error);
      toast({
        title: 'Não foi possível salvar',
        description: 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return {
    isSaving,
    markAnswered: (
      responsavelId: string,
      previous: SurveyTrackingValues | null | undefined
    ) => apply(responsavelId, previous, 'marcar'),
    unmark: (
      responsavelId: string,
      previous: SurveyTrackingValues | null | undefined
    ) => apply(responsavelId, previous, 'desmarcar'),
  };
}
