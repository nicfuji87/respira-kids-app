import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Skeleton } from '@/components/primitives/skeleton';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { EditProfileForm } from './EditProfileForm';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/primitives/use-toast';
import {
  getUserProfile,
  updateUserProfile,
  uploadAvatar,
  removeAvatar,
  type ProfileData,
  type UpdateProfileData,
} from '@/lib/profile-api';
import type { UserRole } from '@/lib/navigation';
import { User, AlertCircle } from 'lucide-react';

// AI dev note: MyProfileSection domain combina EditProfileForm + gerenciamento de estado
// Seção completa "Meu Perfil" com loading, error handling e toast notifications

export interface MyProfileSectionProps {
  userRole?: UserRole;
  showAllFields?: boolean; // Admin pode editar todos os campos
  className?: string;
}

export const MyProfileSection = React.memo<MyProfileSectionProps>(
  ({ userRole, showAllFields = false, className }) => {
    const { user, refreshUserStatus } = useAuth();
    const { toast } = useToast();

    const [profileData, setProfileData] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Carregar dados do perfil
    const loadProfileData = async () => {
      if (!user) {
        setError('Usuário não autenticado');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const profile = await getUserProfile(user);
        setProfileData(profile);

        console.log('✅ Perfil carregado:', profile);
      } catch (error) {
        console.error('❌ Erro ao carregar perfil:', error);
        setError(
          error instanceof Error ? error.message : 'Erro ao carregar perfil'
        );
      } finally {
        setLoading(false);
      }
    };

    // Carregar dados na inicialização e quando user mudar
    useEffect(() => {
      loadProfileData();
    }, [user]);

    // Salvar alterações do perfil
    const handleSubmit = async (
      formData: UpdateProfileData,
      avatarFile?: File
    ) => {
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      setSaving(true);

      try {
        console.log('🔄 Salvando perfil:', formData, 'avatar:', avatarFile);

        // Upload do avatar se fornecido
        let avatarUrl = profileData?.foto_perfil;
        if (avatarFile) {
          avatarUrl = await uploadAvatar(user, avatarFile);
          console.log('✅ Avatar uploadado:', avatarUrl);
        }

        // Preparar dados para atualização
        const updateData: UpdateProfileData = {
          ...formData,
          foto_perfil: avatarUrl,
        };

        // Atualizar perfil
        const updatedProfile = await updateUserProfile(user, updateData);
        setProfileData(updatedProfile);

        // AI dev note: Refresh useAuth para sincronizar avatar no header
        await refreshUserStatus();

        toast({
          title: 'Perfil atualizado',
          description: 'Suas informações foram salvas com sucesso',
          variant: 'default',
        });

        console.log('✅ Perfil atualizado com sucesso');
      } catch (error) {
        console.error('❌ Erro ao salvar perfil:', error);

        toast({
          title: 'Erro ao salvar',
          description:
            error instanceof Error ? error.message : 'Tente novamente',
          variant: 'destructive',
        });

        throw error; // Re-throw para o form tratar
      } finally {
        setSaving(false);
      }
    };

    // Upload de avatar independente
    const handleAvatarUpload = async (file: File): Promise<string> => {
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      try {
        const avatarUrl = await uploadAvatar(user, file);

        // Atualizar apenas o avatar no perfil
        const updatedProfile = await updateUserProfile(user, {
          foto_perfil: avatarUrl,
        });

        setProfileData(updatedProfile);

        // AI dev note: Refresh useAuth para sincronizar estado global (header)
        await refreshUserStatus();

        toast({
          title: 'Foto atualizada',
          description: 'Sua foto de perfil foi atualizada',
          variant: 'default',
        });

        return avatarUrl;
      } catch (error) {
        console.error('❌ Erro ao fazer upload do avatar:', error);
        throw error;
      }
    };

    // Remover avatar
    const handleAvatarRemove = async (): Promise<void> => {
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      try {
        await removeAvatar(user);

        // Atualizar estado local
        setProfileData((prev) =>
          prev ? { ...prev, foto_perfil: null } : null
        );

        // AI dev note: Refresh useAuth para sincronizar estado global (header)
        await refreshUserStatus();

        toast({
          title: 'Foto removida',
          description: 'Sua foto de perfil foi removida',
          variant: 'default',
        });
      } catch (error) {
        console.error('❌ Erro ao remover avatar:', error);
        throw error;
      }
    };

    // Tentar recarregar em caso de erro
    const handleRetry = () => {
      loadProfileData();
    };

    if (loading) {
      return (
        <Card className={className}>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-6 w-32" />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar skeleton */}
            <div className="flex justify-center">
              <Skeleton className="h-32 w-32 rounded-full" />
            </div>

            {/* Form fields skeleton */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-12 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-12 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-12 w-full" />
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (error) {
      return (
        <Card className={className}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Meu Perfil
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{error}</span>
                <button
                  onClick={handleRetry}
                  className="underline hover:no-underline ml-4"
                >
                  Tentar novamente
                </button>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Meu Perfil
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EditProfileForm
            initialData={profileData || undefined}
            onSubmit={handleSubmit}
            onAvatarUpload={handleAvatarUpload}
            onAvatarRemove={handleAvatarRemove}
            isLoading={saving}
            userRole={userRole}
            showAllFields={showAllFields}
          />
        </CardContent>
      </Card>
    );
  }
);

MyProfileSection.displayName = 'MyProfileSection';
