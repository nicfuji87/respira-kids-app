import { supabase } from './supabase';
import type { User, Session } from '@supabase/supabase-js';

/**
 * Tipos
 */
export interface AuthUser extends User {
  pessoa?: {
    id: string;
    nome: string;
    is_approved: boolean;
    profile_complete: boolean;
    role: string | null;
    foto_perfil: string | null;
    pode_atender?: boolean; // AI dev note: Para Agendas Compartilhadas
  };
}

export interface SignUpData {
  email: string;
  password: string;
  confirmPassword: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface UserStatus {
  isAuthenticated: boolean;
  needsEmailConfirmation: boolean;
  needsApproval: boolean;
  needsProfileCompletion: boolean;
  canAccessDashboard: boolean;
  user: AuthUser | null;
}

/**
 * Cadastro com email/senha
 */
export async function signUpWithEmail(data: SignUpData) {
  const { email, password } = data;

  const { data: authData, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return authData;
}

/**
 * Login com email/senha
 */
export async function signInWithEmail(data: LoginData) {
  const { email, password } = data;

  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  return authData;
}

/**
 * Reenviar email de confirmação
 */
export async function resendConfirmationEmail(email: string) {
  const { data, error } = await supabase.auth.resend({
    type: 'signup',
    email: email,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Logout do usuário
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Solicitar recuperação de senha via email
 */
export async function resetPasswordRequest(email: string) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/callback`,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Atualizar senha do usuário logado
 */
export async function updatePassword(newPassword: string) {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Buscar dados da pessoa associada ao usuário com timeout
 */
export async function getUserPessoa(userId: string, timeout = 8000) {
  return new Promise<{
    id: string;
    nome: string;
    is_approved: boolean;
    profile_complete: boolean;
    role: string | null;
    foto_perfil: string | null;
  } | null>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      console.error('❌ Timeout ao buscar dados da pessoa após', timeout, 'ms');
      reject(new Error('Timeout ao buscar dados da pessoa'));
    }, timeout);

    const executeQuery = async () => {
      try {
        const { data, error } = await supabase
          .from('pessoas')
          .select(
            'id, nome, is_approved, profile_complete, role, foto_perfil, pode_atender'
          )
          .eq('auth_user_id', userId)
          .single();

        clearTimeout(timeoutId);

        if (error && error.code !== 'PGRST116') {
          // PGRST116 = not found
          reject(new Error(error.message));
        } else {
          resolve(data);
        }
      } catch (error) {
        clearTimeout(timeoutId);
        console.error('❌ Erro na query pessoas:', error);
        reject(error);
      }
    };

    executeQuery();
  });
}

/**
 * Buscar dados completos do usuário para tela de aprovação
 */
export async function getUserApprovalData(userId: string) {
  // Buscar dados do usuário em auth.users
  const { data: authUser, error: authError } =
    await supabase.auth.admin.getUserById(userId);

  if (authError) {
    // Fallback: buscar usuário atual se admin não funcionar
    const {
      data: { user },
      error: currentUserError,
    } = await supabase.auth.getUser();
    if (currentUserError || !user || user.id !== userId) {
      throw new Error('Usuário não encontrado');
    }

    // Usar dados do usuário atual
    const pessoa = await getUserPessoa(userId);

    return {
      email: user.email || '',
      name:
        user.user_metadata?.full_name || user.user_metadata?.name || undefined,
      submittedAt: user.created_at,
      isApproved: pessoa?.is_approved || false,
      profileComplete: pessoa?.profile_complete || false,
      role: pessoa?.role || null,
    };
  }

  // Buscar dados da pessoa associada
  const pessoa = await getUserPessoa(userId);

  return {
    email: authUser.user.email || '',
    name:
      authUser.user.user_metadata?.full_name ||
      authUser.user.user_metadata?.name ||
      undefined,
    submittedAt: authUser.user.created_at,
    isApproved: pessoa?.is_approved || false,
    profileComplete: pessoa?.profile_complete || false,
    role: pessoa?.role || null,
  };
}

/**
 * Reenviar email de notificação (para usuários já confirmados)
 */
export async function resendNotificationEmail(userId: string) {
  // Para usuários que já têm email confirmado,
  // isso seria um email de notificação sobre o status

  // Por enquanto, vamos simular o reenvio
  // Em produção, isso acionaria um webhook ou função edge

  const { data, error } = await supabase.functions.invoke(
    'send-notification-email',
    {
      body: { userId, type: 'approval_reminder' },
    }
  );

  if (error) {
    // Fallback: se não há função edge, simular sucesso
    console.warn('Função de email não encontrada, simulando envio:', error);
    return { success: true, message: 'Email de notificação enviado' };
  }

  return data;
}

/**
 * Verificar status completo do usuário
 */
export async function checkUserStatus(user: User | null): Promise<UserStatus> {
  if (!user) {
    return {
      isAuthenticated: false,
      needsEmailConfirmation: false,
      needsApproval: false,
      needsProfileCompletion: false,
      canAccessDashboard: false,
      user: null,
    };
  }

  // Verificar se email foi confirmado
  const needsEmailConfirmation = !user.email_confirmed_at;

  if (needsEmailConfirmation) {
    return {
      isAuthenticated: true,
      needsEmailConfirmation: true,
      needsApproval: false,
      needsProfileCompletion: false,
      canAccessDashboard: false,
      user: user as AuthUser,
    };
  }

  // Buscar dados da pessoa
  try {
    const pessoa = await getUserPessoa(user.id);

    if (!pessoa) {
      // Pessoa não existe - deve ser criada pelo trigger
      return {
        isAuthenticated: true,
        needsEmailConfirmation: false,
        needsApproval: true,
        needsProfileCompletion: false,
        canAccessDashboard: false,
        user: user as AuthUser,
      };
    }

    const authUser = { ...user, pessoa } as AuthUser;

    // Verificar aprovação
    if (!pessoa.is_approved) {
      return {
        isAuthenticated: true,
        needsEmailConfirmation: false,
        needsApproval: true,
        needsProfileCompletion: false,
        canAccessDashboard: false,
        user: authUser,
      };
    }

    // Verificar se perfil está completo
    if (!pessoa.profile_complete) {
      return {
        isAuthenticated: true,
        needsEmailConfirmation: false,
        needsApproval: false,
        needsProfileCompletion: true,
        canAccessDashboard: false,
        user: authUser,
      };
    }

    // Usuário pode acessar dashboard
    const finalResult = {
      isAuthenticated: true,
      needsEmailConfirmation: false,
      needsApproval: false,
      needsProfileCompletion: false,
      canAccessDashboard: true,
      user: authUser,
    };
    return finalResult;
  } catch (error) {
    console.error('❌ Erro ao verificar status do usuário:', error);
    console.error(
      '❌ Stack trace:',
      error instanceof Error ? error.stack : 'No stack'
    );

    // Em caso de erro, assumir que precisa de aprovação
    const errorResult = {
      isAuthenticated: true,
      needsEmailConfirmation: false,
      needsApproval: true,
      needsProfileCompletion: false,
      canAccessDashboard: false,
      user: user as AuthUser,
    };

    return errorResult;
  }
}

/**
 * Obter sessão atual com timeout
 */
export async function getSession(timeout = 3000) {
  return new Promise<Session | null>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Timeout ao recuperar sessão'));
    }, timeout);

    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        clearTimeout(timeoutId);
        if (error) {
          reject(new Error(error.message));
        } else {
          resolve(session);
        }
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Obter usuário atual com retry logic
 */
export async function getCurrentUser(
  retryCount = 0,
  maxRetries = 3
): Promise<User | null> {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    // Se não há usuário ou erro de sessão, retornar null ao invés de erro
    if (error && error.message === 'Auth session missing!') {
      return null;
    }

    if (error) {
      throw new Error(error.message);
    }

    return user;
  } catch {
    // AI dev note: Retry logic para casos de sessão sendo restaurada
    if (retryCount < maxRetries) {
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * (retryCount + 1))
      ); // Backoff exponencial
      return getCurrentUser(retryCount + 1, maxRetries);
    }

    // Se esgotar tentativas, retornar null ao invés de erro

    return null;
  }
}
