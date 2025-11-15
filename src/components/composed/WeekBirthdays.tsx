import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cake, Calendar, Clock, RefreshCw } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import { ScrollArea } from '@/components/primitives/scroll-area';
import { cn } from '@/lib/utils';
import { fetchWeekBirthdays } from '@/lib/patient-api';
import type { WeekBirthdaysProps, WeekBirthday } from '@/types/patient-details';

// AI dev note: WeekBirthdays - Component Composed para exibir aniversários da semana
// Exibe pacientes com aniversário de segunda a domingo da semana atual e da semana seguinte
// Destaque visual para pacientes que têm agendamento na semana
// Reutiliza primitives: Card, Badge, Button, Skeleton

export const WeekBirthdays = React.memo<WeekBirthdaysProps>(
  ({ className, onPatientClick, maxItems = 20 }) => {
    const navigate = useNavigate();
    const [birthdays, setBirthdays] = useState<WeekBirthday[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadBirthdays = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchWeekBirthdays();
        setBirthdays(data.slice(0, maxItems));
      } catch (err) {
        console.error('Erro ao carregar aniversários:', err);
        setError('Erro ao carregar aniversários');
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => {
      loadBirthdays();
    }, [maxItems]);

    const formatDateTime = (dateTime: string) => {
      const date = new Date(dateTime);
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    };

    // Agrupar por dia da semana
    const groupedByDay = birthdays.reduce(
      (acc, birthday) => {
        const day = birthday.dia_semana;
        if (!acc[day]) {
          acc[day] = [];
        }
        acc[day].push(birthday);
        return acc;
      },
      {} as Record<string, WeekBirthday[]>
    );

    // Ordenar dias da semana
    const diasOrdenados = [
      'Segunda-feira',
      'Terça-feira',
      'Quarta-feira',
      'Quinta-feira',
      'Sexta-feira',
      'Sábado',
      'Domingo',
    ];

    // Handler para navegar aos detalhes do paciente
    const handlePatientClick = (patientId: string) => {
      if (onPatientClick) {
        onPatientClick(patientId);
      } else {
        navigate(`/pacientes/${patientId}`);
      }
    };

    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Cake className="h-5 w-5 text-roxo-titulo" />
              Aniversários da Semana
              {birthdays.length > 0 && (
                <Badge variant="secondary">{birthdays.length}</Badge>
              )}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadBirthdays}
              disabled={loading}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Loading State */}
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ))}
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="text-center py-6 text-muted-foreground">
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && birthdays.length === 0 && (
            <div className="text-center py-8">
              <Cake className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Nenhum aniversário esta semana
              </p>
            </div>
          )}

          {/* Birthdays List */}
          {!loading && !error && birthdays.length > 0 && (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {diasOrdenados.map((dia) => {
                  const birthdaysForDay = groupedByDay[dia];
                  if (!birthdaysForDay || birthdaysForDay.length === 0) {
                    return null;
                  }

                  return (
                    <div key={dia} className="space-y-2">
                      {/* Dia da semana */}
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <h4 className="text-sm font-semibold text-foreground">
                          {dia}
                        </h4>
                      </div>

                      {/* Lista de aniversariantes */}
                      <div className="space-y-2 ml-6">
                        {birthdaysForDay.map((birthday) => (
                          <div
                            key={birthday.id}
                            className={cn(
                              'p-3 rounded-lg border transition-colors',
                              birthday.tem_agendamento
                                ? 'border-verde-pipa bg-verde-pipa/5'
                                : 'border-border bg-card'
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="flex flex-col gap-0.5 min-w-0">
                                    <button
                                      onClick={() =>
                                        handlePatientClick(birthday.id)
                                      }
                                      className="font-medium text-sm truncate hover:underline hover:text-primary transition-colors text-left"
                                    >
                                      {birthday.nome}
                                    </button>
                                    {birthday.responsavel_legal_nome && (
                                      <span className="text-xs text-muted-foreground truncate">
                                        Resp: {birthday.responsavel_legal_nome}
                                      </span>
                                    )}
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className="text-xs shrink-0"
                                  >
                                    {birthday.idade}{' '}
                                    {birthday.idade === 1 ? 'ano' : 'anos'}
                                  </Badge>
                                  {birthday.tem_agendamento && (
                                    <Badge className="bg-verde-pipa hover:bg-verde-pipa/90 text-xs shrink-0">
                                      Tem consulta
                                    </Badge>
                                  )}
                                </div>

                                {/* Agendamentos */}
                                {birthday.tem_agendamento &&
                                  birthday.agendamentos && (
                                    <div className="mt-2 space-y-1">
                                      {birthday.agendamentos.map(
                                        (agendamento) => (
                                          <div
                                            key={agendamento.id}
                                            className="flex items-center gap-2 text-xs text-muted-foreground"
                                          >
                                            <Clock className="h-3 w-3" />
                                            <span>
                                              {formatDateTime(
                                                agendamento.data_hora
                                              )}
                                            </span>
                                            {agendamento.profissional_nome && (
                                              <>
                                                <span>•</span>
                                                <span>
                                                  {
                                                    agendamento.profissional_nome
                                                  }
                                                </span>
                                              </>
                                            )}
                                          </div>
                                        )
                                      )}
                                    </div>
                                  )}
                              </div>

                              <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                                <Cake className="h-3 w-3" />
                                <span>
                                  {String(birthday.dia_mes).padStart(2, '0')}/
                                  {String(birthday.mes).padStart(2, '0')}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    );
  }
);

WeekBirthdays.displayName = 'WeekBirthdays';
