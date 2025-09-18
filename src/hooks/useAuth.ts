import { useEffect, useState, useRef } from 'react';
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

  // AI dev note: Cache persistente para evitar re-verificações desnecessárias
  // Cache permanece válido até logout (conforme solicitado pelo usuário)
  const authCache = useRef<{
    userId: string | null;
    status: UserStatus | null;
  }>({
    userId: null,
    status: null,
  });

  // AI dev note: Debounce para evitar múltiplos eventos onAuthStateChange em sequência
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  // Função para atualizar status do usuário
  const updateUserStatus = async (user: User | null) => {
    // AI dev note: Melhorada - cache persiste mesmo quando userId muda de null para real ID
    const currentUserId = user?.id || null;

    // Se tem cache válido e é o mesmo usuário (ou transição de null -> real ID)
    if (
      authCache.current.status &&
      (authCache.current.userId === currentUserId ||
        (authCache.current.userId === null && currentUserId))
    ) {
      // Atualizar cache com o ID real se estava null
      if (authCache.current.userId === null && currentUserId) {
        authCache.current.userId = currentUserId;
      }
      setUserStatus(authCache.current.status);
      // AI dev note: Cache hit - verificar se userRole está disponível
      if (
        authCache.current.status.user?.pessoa?.role !== undefined ||
        !authCache.current.status.canAccessDashboard
      ) {
        setLoading(false);
      } else {
        console.warn('⚠️ useAuth: Cache hit mas userRole não disponível');
        setTimeout(() => setLoading(false), 0);
      }
      return;
    }

    // Se não há cache válido, fazer verificação completa

    try {
      // AI dev note: Timeout para garantir que loading nunca fique infinito
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Timeout em updateUserStatus após 10 segundos'));
        }, 10000);
      });

      const statusPromise = checkUserStatus(user);

      const status = await Promise.race([statusPromise, timeoutPromise]);

      // Salvar no cache se usuário pode acessar dashboard
      if (status.canAccessDashboard && currentUserId) {
        authCache.current = {
          userId: currentUserId,
          status: status,
        };
      }

      setUserStatus(status);
      // AI dev note: Só definir loading=false se userRole estiver disponível
      if (
        status.user?.pessoa?.role !== undefined ||
        !status.canAccessDashboard
      ) {
        setLoading(false);
      } else if (status.canAccessDashboard && !status.user?.pessoa?.role) {
        console.warn(
          '⚠️ useAuth: canAccessDashboard=true mas userRole não disponível ainda'
        );
        // Aguardar próximo ciclo para role estar disponível
        setTimeout(() => setLoading(false), 0);
      }
    } catch (error) {
      console.error('❌ useAuth: Erro ao atualizar status do usuário:', error);

      // Fallback: assumir que usuário precisa fazer login novamente
      const fallbackStatus = {
        isAuthenticated: false,
        needsEmailConfirmation: false,
        needsApproval: false,
        needsProfileCompletion: false,
        canAccessDashboard: false,
        user: null,
      };

      // Limpar cache em caso de erro
      authCache.current = { userId: null, status: null };

      setUserStatus(fallbackStatus);
      setLoading(false);
    }
  };

  // Função para forçar re-verificação do status do usuário atual
  const refreshUserStatus = async () => {
    try {
      // Forçar invalidação de cache para refresh manual
      authCache.current = { userId: null, status: null };

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
        // Expected behavior - suppress refresh token errors
      } else {
        console.error('Erro ao atualizar status:', error);
      }
    }
  };

  useEffect(() => {
    let mounted = true;

    // AI dev note: Usar onAuthStateChange como fonte única de verdade
    // INITIAL_SESSION já resolve recuperação de sessão, eliminando race conditions
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return;

        // AI dev note: Debounce para evitar múltiplos eventos em sequência rápida
        if (debounceTimeout.current) {
          clearTimeout(debounceTimeout.current);
        }

        debounceTimeout.current = setTimeout(async () => {
          if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
            if (session?.user) {
              await updateUserStatus(session.user);
            } else {
              // Sem sessão inicial = usuário não logado
              authCache.current = { userId: null, status: null }; // Limpar cache
              setUserStatus({
                isAuthenticated: false,
                needsEmailConfirmation: false,
                needsApproval: false,
                needsProfileCompletion: false,
                canAccessDashboard: false,
                user: null,
              });
              setLoading(false);
            }
          } else if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
            if (session?.user) {
              // Token refreshed com sucesso
              await updateUserStatus(session.user);
            } else {
              // Logout ou token expirado - limpar cache

              authCache.current = { userId: null, status: null };
              setUserStatus({
                isAuthenticated: false,
                needsEmailConfirmation: false,
                needsApproval: false,
                needsProfileCompletion: false,
                canAccessDashboard: false,
                user: null,
              });
              setLoading(false);
            }
          } else if (event === 'USER_UPDATED' && session?.user) {
            await updateUserStatus(session.user);
          }
        }, 300); // 300ms debounce
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();

      // Limpar debounce timeout
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, []);

  return {
    ...userStatus,
    loading,
    refreshUserStatus,
  };
}
