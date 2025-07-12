import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';

import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/primitives/form';
import { cn } from '@/lib/utils';

const signUpSchema = z
  .object({
    email: z
      .string()
      .min(1, 'Email é obrigatório')
      .email('Email deve ter formato válido'),
    password: z
      .string()
      .min(8, 'Senha deve ter pelo menos 8 caracteres')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Senha deve ter ao menos: 1 minúscula, 1 maiúscula e 1 número'
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Senhas não conferem',
    path: ['confirmPassword'],
  });

type SignUpFormData = z.infer<typeof signUpSchema>;

interface SignUpFormProps {
  onSubmit: (data: SignUpFormData) => Promise<void>;
  isLoading?: boolean;
  className?: string;
}

export const SignUpForm = React.memo<SignUpFormProps>(
  ({ onSubmit, isLoading = false, className }) => {
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const form = useForm<SignUpFormData>({
      resolver: zodResolver(signUpSchema),
      defaultValues: {
        email: '',
        password: '',
        confirmPassword: '',
      },
    });

    const handleSubmit = async (data: SignUpFormData) => {
      try {
        await onSubmit(data);
      } catch (error) {
        console.error('Erro no cadastro:', error);
      }
    };

    return (
      <div className={cn('space-y-6', className)}>
        {/* Email/Password Form */}
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
            aria-label="Formulário de cadastro"
          >
            {/* Email Field */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground font-medium">
                    Email
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail
                        className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        {...field}
                        type="email"
                        placeholder="seu.email@exemplo.com"
                        disabled={isLoading}
                        className="pl-10 h-12 theme-transition"
                        aria-describedby="email-error"
                      />
                    </div>
                  </FormControl>
                  <FormMessage id="email-error" />
                </FormItem>
              )}
            />

            {/* Password Field */}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground font-medium">
                    Senha
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Lock
                        className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        {...field}
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Sua senha segura"
                        disabled={isLoading}
                        className="pl-10 pr-10 h-12 theme-transition"
                        aria-describedby="password-error password-help"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={isLoading}
                        aria-label={
                          showPassword ? 'Ocultar senha' : 'Mostrar senha'
                        }
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage id="password-error" />
                  <p
                    id="password-help"
                    className="text-xs text-muted-foreground mt-1"
                  >
                    Mínimo 8 caracteres, com maiúscula, minúscula e número
                  </p>
                </FormItem>
              )}
            />

            {/* Confirm Password Field */}
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground font-medium">
                    Confirmar Senha
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Lock
                        className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        {...field}
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Confirme sua senha"
                        disabled={isLoading}
                        className="pl-10 pr-10 h-12 theme-transition"
                        aria-describedby="confirm-password-error"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                        disabled={isLoading}
                        aria-label={
                          showConfirmPassword
                            ? 'Ocultar confirmação de senha'
                            : 'Mostrar confirmação de senha'
                        }
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage id="confirm-password-error" />
                </FormItem>
              )}
            />

            {/* Terms Notice */}
            <p className="text-xs text-muted-foreground text-center px-2">
              Ao se cadastrar você aceita os{' '}
              <button
                type="button"
                className="text-primary hover:underline"
                aria-label="Abrir termos de uso em nova aba"
              >
                termos de uso
              </button>{' '}
              e{' '}
              <button
                type="button"
                className="text-primary hover:underline"
                aria-label="Abrir política de privacidade em nova aba"
              >
                política de privacidade
              </button>
            </p>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 respira-gradient hover:opacity-90 theme-transition font-medium"
              aria-label="Criar conta"
            >
              {isLoading ? 'Criando conta...' : 'Criar Conta'}
            </Button>
          </form>
        </Form>
      </div>
    );
  }
);

SignUpForm.displayName = 'SignUpForm';
