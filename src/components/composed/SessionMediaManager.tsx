import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Upload } from 'lucide-react';

// AI dev note: SessionMediaManager temporariamente como placeholder
// TODO: Refatorar para usar nova API session_media + document_storage da Fase 4

export interface SessionMediaManagerProps {
  agendamentoId: string;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
  criadoPor?: string;
  disabled?: boolean;
  onMediaChange?: () => void;
  className?: string;
}

export const SessionMediaManager: React.FC<SessionMediaManagerProps> = ({
  className,
}) => {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Mídias da Sessão
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="p-8 border-2 border-dashed border-gray-300 rounded-lg text-center text-gray-500">
          <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <p className="text-lg font-medium mb-2">SessionMediaManager</p>
          <p className="text-sm">Aguardando refatoração para nova API</p>
          <p className="text-xs mt-2">
            Use MediaGallery no detalhamento do paciente para visualizar mídias
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

SessionMediaManager.displayName = 'SessionMediaManager';
