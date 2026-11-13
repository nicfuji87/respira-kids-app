// AI dev note: faixa da Rotina no topo do dashboard da secretária: quanto do dia já foi
// feito, o que está atrasado e a cota de hoje das metas, com o atalho para /rotina.
// Some se a chamada falhar (o dashboard não pode quebrar por causa dela).

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListChecks } from 'lucide-react';
import { Card, CardContent } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Progress } from '@/components/primitives/progress';
import { fetchRotinaDia, type RotinaDia } from '@/lib/rotina-api';

export function RotinaResumoCard() {
  const navigate = useNavigate();
  const [dados, setDados] = useState<RotinaDia | null>(null);

  useEffect(() => {
    fetchRotinaDia()
      .then(setDados)
      .catch(() => setDados(null));
  }, []);

  if (!dados || dados.tarefas.length === 0) return null;

  const total = dados.tarefas.length;
  const feitas = dados.tarefas.filter((t) => t.feito).length;
  const atrasadas = dados.tarefas.filter((t) => t.atrasada).length;
  const cotas = dados.metas.filter((m) => (m.cota_hoje ?? 0) > 0);

  return (
    <Card className="border-primary/40">
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="h-4 w-4 text-primary" />
            Rotina de hoje: {feitas} de {total} feitas
            {atrasadas > 0 && (
              <span className="text-destructive">
                · {atrasadas} atrasada{atrasadas > 1 ? 's' : ''}
              </span>
            )}
          </p>
          <Progress
            value={(feitas / total) * 100}
            className="h-1.5 w-full sm:w-72"
          />
          {cotas.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {cotas
                .map(
                  (m) => `${m.titulo}: ${m.hoje ?? 0} de ${m.cota_hoje} hoje`
                )
                .join(' · ')}
            </p>
          )}
        </div>
        <Button size="sm" onClick={() => navigate('/rotina')}>
          Abrir a rotina
        </Button>
      </CardContent>
    </Card>
  );
}
