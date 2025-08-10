import React, { useState, useEffect } from 'react';
import { AuthCard, CompleteProfileForm } from '@/components/composed';
import { useToast } from '@/components/primitives/use-toast';
import {
  updateProfile,
  getCurrentProfile,
  formatPhone,
  type CompleteProfileData,
} from '@/lib/profile';
import { getCurrentUser } from '@/lib/auth';

interface CompleteProfileFormData {
  nome: string;
  cpf_cnpj: string;
  telefone: string;
  data_nascimento?: string;
  cep: string;
  numero_endereco: string;
  complemento_endereco?: string;
}

interface CompleteProfilePageProps {
  onProfileComplete?: () => void;
  onBackToLogin?: () => void;
  className?: string;
}

export const CompleteProfilePage = React.memo<CompleteProfilePageProps>(
  ({ onProfileComplete, onBackToLogin, className }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [initialData, setInitialData] = useState<
      Partial<CompleteProfileFormData>
    >({});
    const [loadingInitialData, setLoadingInitialData] = useState(true);
    const { toast } = useToast();

    // Carregar dados existentes do perfil
    useEffect(() => {
      const loadCurrentProfile = async () => {
        try {
          const currentUser = await getCurrentUser();

          if (!currentUser) {
            throw new Error('Usuário não encontrado');
          }

          const profileData = await getCurrentProfile(currentUser.id);

          if (profileData) {
            // Converter telefone numérico de volta para string formatada
            const telefoneString = profileData.telefone
              ? profileData.telefone.toString()
              : '';
            const telefoneFormatado = telefoneString
              ? formatPhone(telefoneString)
              : '';

            setInitialData({
              nome: profileData.nome || '',
              cpf_cnpj: profileData.cpf_cnpj || '',
              telefone: telefoneFormatado,
              data_nascimento: profileData.data_nascimento || '',
              cep: profileData.enderecos?.[0]?.cep || '',
              numero_endereco: profileData.numero_endereco || '',
              complemento_endereco: profileData.complemento_endereco || '',
            });
          }
        } catch (error) {
          console.error('Erro ao carregar perfil atual:', error);
          // Não mostrar erro, apenas continuar com dados vazios
        } finally {
          setLoadingInitialData(false);
        }
      };

      loadCurrentProfile();
    }, []);

    const handleSubmit = async (data: CompleteProfileFormData) => {
      
      setIsLoading(true);

      try {
        
        const currentUser = await getCurrentUser();

        if (!currentUser) {
          throw new Error('Usuário não encontrado');
        }

        

        // Preparar dados para atualização
        const profileData: CompleteProfileData = {
          nome: data.nome,
          cpf_cnpj: data.cpf_cnpj,
          telefone: data.telefone,
          data_nascimento: data.data_nascimento,
          cep: data.cep,
          numero_endereco: data.numero_endereco,
          complemento_endereco: data.complemento_endereco,
        };

        
        await updateProfile(currentUser.id, profileData);
        

        toast({
          title: 'Perfil completado com sucesso!',
          description:
            'Seus dados foram salvos. Redirecionando para o sistema...',
          variant: 'default',
        });

        // Aguardar um momento para mostrar o toast
        setTimeout(() => {
          
          if (onProfileComplete) {
            onProfileComplete();
          }
        }, 1500);
      } catch (error) {
        console.error('Erro ao completar perfil:', error);
        toast({
          title: 'Erro ao salvar perfil',
          description:
            error instanceof Error
              ? error.message
              : 'Não foi possível salvar os dados. Tente novamente.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    const handleBackToLogin = () => {
      if (onBackToLogin) {
        onBackToLogin();
      }
    };

    // Loading state para dados iniciais
    if (loadingInitialData) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-bege-fundo to-background">
          <div className="text-center space-y-4">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground">Carregando seus dados...</p>
          </div>
        </div>
      );
    }

    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center p-4 ${className || ''}`}
      >
        <AuthCard
          title="Complete seu cadastro"
          description="Preencha os dados abaixo para finalizar seu perfil"
          className="w-full max-w-md"
          showLogo={true}
        >
          <CompleteProfileForm
            onSubmit={handleSubmit}
            isLoading={isLoading}
            initialData={initialData}
          />
        </AuthCard>

        {/* Navigation Actions */}
        <div className="w-full max-w-md mt-6">
          <div className="text-center">
            <button
              type="button"
              onClick={handleBackToLogin}
              disabled={isLoading}
              className="text-sm text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
              aria-label="Voltar para o login"
            >
              ← Voltar para o login
            </button>
          </div>
        </div>
      </div>
    );
  }
);

CompleteProfilePage.displayName = 'CompleteProfilePage';
