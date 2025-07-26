import React, { useState, useEffect } from 'react';
import { Label } from '@/components/primitives/label';
import { Badge } from '@/components/primitives/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

// AI dev note: ResponsibleSelect é um componente Composed para exibição de responsáveis
// Mostra responsabilidades existentes para uma pessoa

export interface ResponsibleSelectProps {
  personId?: string; // ID da pessoa para qual estamos vendo responsáveis
  className?: string;
}

interface Responsabilidade {
  id: string;
  id_responsavel: string;
  nome_responsavel: string;
  tipo_responsabilidade: 'legal' | 'financeiro' | 'ambos';
}

export const ResponsibleSelect: React.FC<ResponsibleSelectProps> = ({
  personId,
  className,
}) => {
  const [responsabilidades, setResponsabilidades] = useState<
    Responsabilidade[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchResponsabilidades = async () => {
      if (!personId) {
        setLoading(false);
        return;
      }

      try {
        // Carregar responsabilidades existentes
        const { data: respData, error: respError } = await supabase
          .from('pessoa_responsaveis')
          .select(
            `
            id,
            id_responsavel,
            tipo_responsabilidade,
            responsavel:pessoas!pessoa_responsaveis_id_responsavel_fkey(nome)
          `
          )
          .eq('id_pessoa', personId)
          .eq('ativo', true);

        if (respError) {
          console.error('Erro ao carregar responsabilidades:', respError);
        } else {
          const responsabilidadesFormatted = (respData || []).map((resp) => ({
            id: resp.id,
            id_responsavel: resp.id_responsavel,
            nome_responsavel:
              (resp as { responsavel?: { nome?: string } }).responsavel?.nome ||
              'Nome não encontrado',
            tipo_responsabilidade: resp.tipo_responsabilidade,
          }));
          setResponsabilidades(responsabilidadesFormatted);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchResponsabilidades();
  }, [personId]);

  const getResponsabilityBadgeVariant = (tipo: string) => {
    switch (tipo) {
      case 'legal':
        return 'default';
      case 'financeiro':
        return 'secondary';
      case 'ambos':
        return 'outline';
      default:
        return 'default';
    }
  };

  const getResponsabilityLabel = (tipo: string) => {
    switch (tipo) {
      case 'legal':
        return 'Legal';
      case 'financeiro':
        return 'Financeiro';
      case 'ambos':
        return 'Legal e Financeiro';
      default:
        return tipo;
    }
  };

  if (!personId) {
    return (
      <div className={cn('space-y-2', className)}>
        <Label>Responsáveis</Label>
        <p className="text-sm text-muted-foreground">
          Selecione um usuário primeiro para ver responsáveis
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <Label>Responsáveis</Label>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : responsabilidades.length > 0 ? (
        <div className="space-y-2">
          {responsabilidades.map((resp) => (
            <div
              key={resp.id}
              className="flex items-center gap-2 p-2 border rounded-lg"
            >
              <span className="font-medium">{resp.nome_responsavel}</span>
              <Badge
                variant={getResponsabilityBadgeVariant(
                  resp.tipo_responsabilidade
                )}
              >
                {getResponsabilityLabel(resp.tipo_responsabilidade)}
              </Badge>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhum responsável cadastrado
        </p>
      )}
    </div>
  );
};

ResponsibleSelect.displayName = 'ResponsibleSelect';
