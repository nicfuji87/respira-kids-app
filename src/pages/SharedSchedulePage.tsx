import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle, Calendar, CalendarOff } from 'lucide-react';

import { SharedScheduleSelectorWizard } from '@/components/domain/calendar/SharedScheduleSelectorWizard';
import { Button } from '@/components/primitives/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { fetchSharedScheduleByToken } from '@/lib/shared-schedule-api';
import type { AgendaCompartilhadaCompleta } from '@/types/shared-schedule';

// AI dev note: SharedSchedulePage - Página pública
// Acessa agenda compartilhada via token e renderiza wizard de seleção
// Valida acesso, disponibilidade e exibe mensagens de erro apropriadas

export const SharedSchedulePage = React.memo(() => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [agenda, setAgenda] = useState<AgendaCompartilhadaCompleta | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Token inválido');
      setIsLoading(false);
      return;
    }

    loadAgenda(token);
  }, [token]);

  const loadAgenda = async (token: string) => {
    try {
      setIsLoading(true);
      setError(null);
      setIsExpired(false);

      const result = await fetchSharedScheduleByToken(token);

      if (!result.success || !result.data) {
        // Verificar se é expiração
        if (result.isExpired) {
          setIsExpired(true);
          setError(result.error || 'Esta agenda expirou');
          return;
        }

        throw new Error(result.error || 'Agenda não encontrada');
      }

      const agenda = result.data;

      // Validações
      if (!agenda.ativo) {
        setError('Esta agenda não está mais disponível');
        return;
      }

      if (agenda.slots_disponiveis === 0) {
        setError('Todos os horários já foram ocupados');
        return;
      }

      setAgenda(agenda);
    } catch (error) {
      console.error('Erro ao carregar agenda:', error);
      setError(
        error instanceof Error ? error.message : 'Erro ao carregar agenda'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuccess = (agendamentoId: string) => {
    console.log('Agendamento criado:', agendamentoId);
    // Success já é tratado no wizard
  };

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Carregando agenda...</p>
        </div>
      </div>
    );
  }

  // Error
  if (error || !agenda) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card
          className={
            isExpired
              ? 'max-w-md border-amber-500'
              : 'max-w-md border-destructive'
          }
        >
          <CardHeader>
            <div
              className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3 ${
                isExpired ? 'bg-amber-500/10' : 'bg-destructive/10'
              }`}
            >
              {isExpired ? (
                <CalendarOff className="w-6 h-6 text-amber-500" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-destructive" />
              )}
            </div>
            <CardTitle className="text-center">
              {isExpired ? 'Agenda Expirada' : 'Ops! Algo deu errado'}
            </CardTitle>
            <CardDescription className="text-center">
              {isExpired ? (
                <>
                  Esta agenda estava disponível até o dia{' '}
                  <span className="font-medium">
                    {agenda?.data_fim
                      ? new Date(agenda.data_fim).toLocaleDateString('pt-BR')
                      : 'a data definida'}
                  </span>
                  .
                  <br />
                  <br />
                  Entre em contato para obter um novo link de agendamento.
                </>
              ) : (
                error
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate('/')}
            >
              Voltar para o Início
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success - render wizard
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Logo/Header (opcional) */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Calendar className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold">Respira Kids</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Fisioterapia Pediátrica
          </p>
        </div>

        {/* Wizard */}
        <SharedScheduleSelectorWizard
          agenda={agenda}
          onSuccess={handleSuccess}
        />

        {/* Footer */}
        <div className="text-center mt-8 text-xs text-muted-foreground">
          Seus dados são protegidos conforme a LGPD
        </div>
      </div>
    </div>
  );
});

SharedSchedulePage.displayName = 'SharedSchedulePage';
