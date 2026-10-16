import React, { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/primitives/button';
import {
  PatientsList,
  AdminPatientRegistrationDialog,
} from '@/components/composed';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/primitives/use-toast';

// AI dev note: PacientesPage atualizada - usa PatientsList com paginação de 20 itens
// Lista completa de pacientes com busca integrada e navegação para detalhes
// Cadastro administrativo integrado para admin/secretaria

export const PacientesPage: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Verificar role do usuário
  const userRole = auth.user?.pessoa?.role as
    | 'admin'
    | 'profissional'
    | 'secretaria'
    | null;
  const canCreatePatient =
    userRole && ['admin', 'secretaria'].includes(userRole);

  const handleNewPatient = () => {
    if (!auth.user) {
      toast({
        title: 'Não autenticado',
        description: 'Você precisa estar logado para cadastrar pacientes',
        variant: 'destructive',
      });
      return;
    }

    if (!canCreatePatient) {
      toast({
        title: 'Sem permissão',
        description: `Apenas administradores e secretária podem cadastrar pacientes. Seu perfil: ${userRole || 'não definido'}`,
        variant: 'destructive',
      });
      return;
    }

    setIsDialogOpen(true);
  };

  const handlePatientCreated = (patientId: string) => {
    // Navegar para detalhes do paciente recém-criado
    navigate(`/pacientes/${patientId}`);
  };

  return (
    <div className="w-full max-w-none space-y-6">
      {/* Lista paginada de pacientes — "Novo Paciente" fica ao lado da busca */}
      <PatientsList
        className="w-full"
        headerAction={
          <Button
            onClick={handleNewPatient}
            className="shrink-0"
            aria-label="Novo Paciente"
          >
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo Paciente</span>
          </Button>
        }
      />

      {/* Dialog de cadastro administrativo */}
      <AdminPatientRegistrationDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSuccess={handlePatientCreated}
      />
    </div>
  );
};
