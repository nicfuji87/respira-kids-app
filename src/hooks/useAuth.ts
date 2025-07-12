import { useEffect, useState } from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { checkUserStatus, getCurrentUser } from '@/lib/auth';
import type { UserStatus } from '@/lib/auth';

export function useAuth() {
  const [userStatus, setUserStatus] = useState<UserStatus>({
    isAuthenticated: false,
    needsEmailConfirmation: false,
    needsApproval: false,
    needsProfileCompletion: false,
    canAccessDashboard: false,
    user: null,
  });
  const [loading, setLoading] = useState(true);

  // Função para atualizar status do usuário
  const updateUserStatus = async (user: User | null) => {
    console.log('🔄 useAuth: Atualizando status do usuário...', user?.email);
    const status = await checkUserStatus(user);
    setUserStatus(status);
    setLoading(false);
  };

  // Função para forçar re-verificação do status do usuário atual
  const refreshUserStatus = async () => {
    try {
      const user = await getCurrentUser();
      await updateUserStatus(user);
    } catch (error: unknown) {
      // Suprimir erro de refresh token inválido (comportamento esperado)
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes('Refresh Token') ||
        errorMessage.includes('Auth session missing')
      ) {
        console.log(
          'Sessão expirada ou não encontrada - redirecionando para login'
        );
      } else {
        console.error('Erro ao atualizar status:', error);
      }
    }
  };

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const user = await getCurrentUser();
        if (mounted) {
          await updateUserStatus(user);
        }
      } catch (error: unknown) {
        // Suprimir erro de refresh token inválido (comportamento esperado)
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes('Refresh Token') ||
          errorMessage.includes('Auth session missing')
        ) {
          console.log(
            'Sessão expirada ou não encontrada - redirecionando para login'
          );
        } else {
          console.error('Erro ao inicializar auth:', error);
        }
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listener para mudanças de autenticação
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        console.log('Auth state changed:', event, session?.user?.email);

        if (!mounted) return;

        if (event === 'SIGNED_IN' && session?.user) {
          await updateUserStatus(session.user);
        } else if (event === 'SIGNED_OUT') {
          setUserStatus({
            isAuthenticated: false,
            needsEmailConfirmation: false,
            needsApproval: false,
            needsProfileCompletion: false,
            canAccessDashboard: false,
            user: null,
          });
          setLoading(false);
        } else if (event === 'USER_UPDATED' && session?.user) {
          await updateUserStatus(session.user);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return {
    ...userStatus,
    loading,
    refreshUserStatus,
  };
}
