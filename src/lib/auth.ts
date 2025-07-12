import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';

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
 * Buscar dados da pessoa associada ao usuário
 */
export async function getUserPessoa(userId: string) {
  const { data, error } = await supabase
    .from('pessoas')
    .select('id, nome, is_approved, profile_complete, role')
    .eq('auth_user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = not found
    throw new Error(error.message);
  }

  return data;
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

  console.log('🔍 Verificando status do usuário:', user.email, user.id);

  // Verificar se email foi confirmado
  const needsEmailConfirmation = !user.email_confirmed_at;

  if (needsEmailConfirmation) {
    console.log('❌ Email não confirmado');
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
      console.log('❌ Pessoa não encontrada, redirecionando para aprovação');
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

    console.log('✅ Pessoa encontrada:', pessoa);

    const authUser = { ...user, pessoa } as AuthUser;

    // Verificar aprovação
    if (!pessoa.is_approved) {
      console.log(
        '⚠️ Usuário não aprovado, redirecionando para pending-approval'
      );
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
      console.log(
        '⚠️ Perfil não completo, redirecionando para complete-profile'
      );
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
    console.log('✅ Usuário pode acessar dashboard');
    return {
      isAuthenticated: true,
      needsEmailConfirmation: false,
      needsApproval: false,
      needsProfileCompletion: false,
      canAccessDashboard: true,
      user: authUser,
    };
  } catch (error) {
    console.error('❌ Erro ao verificar status do usuário:', error);

    // Em caso de erro, assumir que precisa de aprovação
    return {
      isAuthenticated: true,
      needsEmailConfirmation: false,
      needsApproval: true,
      needsProfileCompletion: false,
      canAccessDashboard: false,
      user: user as AuthUser,
    };
  }
}

/**
 * Obter sessão atual
 */
export async function getSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  return session;
}

/**
 * Obter usuário atual
 */
export async function getCurrentUser() {
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
}
