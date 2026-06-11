// AI dev note: Seção de conversas de WhatsApp no detalhe do paciente.
// Reutiliza o WhatsAppConversaCard (mesma análise + conciliação do dashboard).
// Acesso restrito a admin/secretaria; profissional não vê.

import React, { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Skeleton } from '@/components/primitives/skeleton';
import { MessagesSquare } from 'lucide-react';
import { WhatsAppConversaCard } from './WhatsAppConversaCard';
import { fetchWhatsAppConversasByPaciente } from '@/lib/whatsapp-conversas-api';
import type { WhatsAppConversaRow } from '@/types/whatsapp-conversas';

interface PatientConversasSectionProps {
  patientId: string;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
  className?: string;
}

export const PatientConversasSection = React.memo<PatientConversasSectionProps>(
  ({ patientId, userRole, className }) => {
    const [rows, setRows] = useState<WhatsAppConversaRow[]>([]);
    const [loading, setLoading] = useState(true);

    const podeVer = userRole === 'admin' || userRole === 'secretaria';

    useEffect(() => {
      if (!podeVer || !patientId) {
        setLoading(false);
        return;
      }
      let ativo = true;
      setLoading(true);
      fetchWhatsAppConversasByPaciente(patientId)
        .then((data) => {
          if (ativo) setRows(data);
        })
        .catch((err) => {
          console.error('[PatientConversasSection] erro:', err);
          if (ativo) setRows([]);
        })
        .finally(() => {
          if (ativo) setLoading(false);
        });
      return () => {
        ativo = false;
      };
    }, [patientId, podeVer]);

    // Sem acesso, ou sem conversas: não renderiza nada (não polui o detalhe).
    if (!podeVer) return null;
    if (!loading && rows.length === 0) return null;

    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base md:text-lg font-semibold flex items-center gap-2">
            <MessagesSquare className="w-5 h-5 text-azul-respira" />
            Conversas no WhatsApp
            {rows.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({rows.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            rows.map((row) => (
              <WhatsAppConversaCard key={row.id} row={row} hideNavigation />
            ))
          )}
        </CardContent>
      </Card>
    );
  }
);

PatientConversasSection.displayName = 'PatientConversasSection';
