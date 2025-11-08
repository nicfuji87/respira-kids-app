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
    console.log('🔍 Debug - Auth:', {
      hasUser: !!auth.user,
      hasPessoa: !!auth.user?.pessoa,
      role: auth.user?.pessoa?.role,
      canCreate: canCreatePatient,
    });

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
      {/* Header com ações */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pacientes</h1>
          <p className="text-muted-foreground">
            Gerencie seus pacientes e histórico de atendimentos
          </p>
        </div>
        <Button onClick={handleNewPatient}>
          <UserPlus className="h-4 w-4 mr-2" />
          Novo Paciente
        </Button>
      </div>

      {/* Lista paginada de pacientes */}
      <PatientsList className="w-full" />

      {/* Dialog de cadastro administrativo */}
      <AdminPatientRegistrationDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSuccess={handlePatientCreated}
      />
    </div>
  );
};
