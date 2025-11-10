import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle, Calendar } from 'lucide-react';

import { SharedScheduleSelectorWizard } from '@/components/domain/calendar/SharedScheduleSelectorWizard';
import { Button } from '@/components/primitives/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/primitives/card';
import { fetchSharedScheduleByToken } from '@/lib/shared-schedule-api';
import type { AgendaCompartilhadaCompleta } from '@/types/shared-schedule';

// AI dev note: SharedSchedulePage - Página pública
// Acessa agenda compartilhada via token e renderiza wizard de seleção
// Valida acesso, disponibilidade e exibe mensagens de erro apropriadas

export const SharedSchedulePage = React.memo(() => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [agenda, setAgenda] = useState<AgendaCompartilhadaCompleta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      const result = await fetchSharedScheduleByToken(token);

      if (!result.success || !result.data) {
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
      setError(error instanceof Error ? error.message : 'Erro ao carregar agenda');
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
        <Card className="max-w-md border-destructive">
          <CardHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <CardTitle className="text-center">Ops! Algo deu errado</CardTitle>
            <CardDescription className="text-center">{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
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
          <p className="text-sm text-muted-foreground">Fisioterapia Pediátrica</p>
        </div>

        {/* Wizard */}
        <SharedScheduleSelectorWizard agenda={agenda} onSuccess={handleSuccess} />

        {/* Footer */}
        <div className="text-center mt-8 text-xs text-muted-foreground">
          Seus dados são protegidos conforme a LGPD
        </div>
      </div>
    </div>
  );
});

SharedSchedulePage.displayName = 'SharedSchedulePage';


