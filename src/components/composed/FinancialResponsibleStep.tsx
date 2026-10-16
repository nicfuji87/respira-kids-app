import React, { useState, useCallback } from 'react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/primitives/radio-group';
import { cn } from '@/lib/utils';
import { AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import {
  searchPersonByCPF,
  type PersonByCPFResult,
} from '@/lib/patient-registration-api';
import { validateCPF } from '@/lib/cpf-validator';
import { FinancialResponsibleDataStep } from './FinancialResponsibleDataStep';

// AI dev note: FinancialResponsibleStep - Etapa para definir responsável financeiro
// 1) Pergunta se é o mesmo que legal ou outra pessoa
// 2) Se outra pessoa: pede CPF e busca no sistema
// 3) Se encontrou: mostra dados e confirma
// 4) Se não encontrou: TODO - avança para cadastro completo

export interface FinancialResponsibleData {
  isSameAsLegal: boolean;
  existingPersonId?: string; // Se encontrou pessoa por CPF
  personData?: {
    nome: string;
    cpf: string;
    email?: string;
    telefone?: string;
  };
  newPersonData?: {
    // Se é pessoa nova (não encontrada por CPF)
    cpf: string;
    nome: string;
    email: string;
    whatsapp: string;
    whatsappJid: string;
  };
}

export interface FinancialResponsibleStepProps {
  onContinue: (data: FinancialResponsibleData) => void;
  onBack?: () => void;
  defaultValue?: FinancialResponsibleData;
  className?: string;
}

type StepState =
  | 'selection'
  | 'cpf-search'
  | 'person-found'
  | 'person-not-found'
  | 'register-new';

export const FinancialResponsibleStep =
  React.memo<FinancialResponsibleStepProps>(
    ({ onContinue, onBack, defaultValue, className }) => {
      const [stepState, setStepState] = useState<StepState>('selection');
      const [isSameAsLegal, setIsSameAsLegal] = useState<boolean | null>(
        defaultValue?.isSameAsLegal ?? null
      );
      const [cpf, setCpf] = useState('');
      const [cpfError, setCpfError] = useState('');
      const [isSearching, setIsSearching] = useState(false);
      const [foundPerson, setFoundPerson] = useState<
        PersonByCPFResult['person'] | null
      >(null);
      const [error, setError] = useState('');

      console.log('💰 [FinancialResponsibleStep] Estado:', stepState);

      // Formatar CPF enquanto digita
      const formatCPF = (value: string) => {
        const numbers = value.replace(/\D/g, '');
        if (numbers.length <= 11) {
          return numbers
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
        }
        return value;
      };

      const handleCPFChange = (value: string) => {
        const formatted = formatCPF(value);
        setCpf(formatted);
        setCpfError('');
      };

      const handleSelectionContinue = useCallback(() => {
        console.log('➡️ [FinancialResponsibleStep] handleSelectionContinue');

        if (isSameAsLegal === null) {
          setError('Selecione uma opção para continuar');
          return;
        }

        if (isSameAsLegal) {
          // Se é o mesmo, retorna direto
          onContinue({
            isSameAsLegal: true,
          });
        } else {
          // Se é diferente, vai para busca de CPF
          setStepState('cpf-search');
        }
      }, [isSameAsLegal, onContinue]);

      const handleCPFSearch = useCallback(
        async (cpfToSearch?: string) => {
          const cpfValue = cpfToSearch || cpf;
          console.log(
            '🔍 [FinancialResponsibleStep] handleCPFSearch - CPF:',
            cpfValue
          );

          // Validar CPF com algoritmo robusto
          const validation = validateCPF(cpfValue);
          if (!validation.valid) {
            setCpfError(validation.error || 'CPF inválido');
            return;
          }

          setIsSearching(true);
          setCpfError('');

          const cpfLimpo = cpfValue.replace(/\D/g, '');

          try {
            console.log(
              '🔍 [FinancialResponsibleStep] Chamando searchPersonByCPF com:',
              cpfLimpo
            );
            const result = await searchPersonByCPF(cpfLimpo);
            console.log(
              '📋 [FinancialResponsibleStep] Resultado da busca:',
              result
            );

            if (result.error) {
              console.log(
                '❌ [FinancialResponsibleStep] Erro retornado:',
                result.error
              );
              setCpfError(result.error);
              setIsSearching(false);
              return;
            }

            if (result.exists && result.person) {
              console.log(
                '✅ [FinancialResponsibleStep] Pessoa encontrada:',
                result.person.nome
              );
              setFoundPerson(result.person);
              setStepState('person-found');
            } else {
              console.log(
                '❌ [FinancialResponsibleStep] Pessoa não encontrada'
              );
              setStepState('person-not-found');
            }
          } catch (err) {
            console.error('❌ [FinancialResponsibleStep] Erro ao buscar:', err);
            setCpfError('Erro ao buscar CPF. Tente novamente.');
          } finally {
            setIsSearching(false);
          }
        },
        [cpf]
      );

      const handleConfirmFoundPerson = useCallback(() => {
        console.log(
          '✅ [FinancialResponsibleStep] Confirmando pessoa encontrada'
        );
        if (!foundPerson) return;

        onContinue({
          isSameAsLegal: false,
          existingPersonId: foundPerson.id,
          personData: {
            nome: foundPerson.nome,
            cpf: foundPerson.cpf_cnpj,
            email: foundPerson.email,
            telefone: foundPerson.telefone,
          },
        });
      }, [foundPerson, onContinue]);

      const handleNewPersonContinue = useCallback(() => {
        console.log('🆕 [FinancialResponsibleStep] Avançando para cadastro');
        setStepState('register-new');
      }, []);

      const handleNewPersonDataSubmit = useCallback(
        (data: {
          cpf: string;
          nome: string;
          email: string;
          whatsapp: string;
          whatsappJid: string;
        }) => {
          console.log(
            '✅ [FinancialResponsibleStep] Nova pessoa cadastrada:',
            data
          );
          onContinue({
            isSameAsLegal: false,
            newPersonData: data,
          });
        },
        [onContinue]
      );

      const handleBackToSearch = useCallback(() => {
        setStepState('cpf-search');
        setCpf('');
        setFoundPerson(null);
      }, []);

      const handleBackToSelection = useCallback(() => {
        setStepState('selection');
        setIsSameAsLegal(null);
        setCpf('');
        setFoundPerson(null);
      }, []);

      // Renderizar estado de seleção inicial
      if (stepState === 'selection') {
        return (
          <div className={cn('w-full px-4 space-y-6', className)}>
            {/* Título */}
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold text-foreground">
                Responsável Financeiro
              </h2>
              <p className="text-xs text-muted-foreground">
                Quem será responsável pelos pagamentos deste paciente?
              </p>
            </div>

            <div className="space-y-5">
              {/* Explicação */}
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      O que é o responsável financeiro?
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      É a pessoa que receberá as cobranças, notificações de
                      pagamento e as notas fiscais dos atendimentos{' '}
                      <strong>deste paciente</strong>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Card de Seleção */}
              <div className="space-y-3">
                <Label className="text-xs text-muted-foreground font-normal">
                  Quem é o responsável financeiro?{' '}
                  <span className="text-destructive">*</span>
                </Label>

                <RadioGroup
                  value={
                    isSameAsLegal === null
                      ? undefined
                      : isSameAsLegal
                        ? 'same'
                        : 'different'
                  }
                  onValueChange={(value) => {
                    setIsSameAsLegal(value === 'same');
                    setError('');
                  }}
                  className="space-y-3"
                >
                  {/* Mesma pessoa */}
                  <div
                    className={cn(
                      'flex items-start space-x-3 p-4 rounded-lg border transition-all cursor-pointer',
                      isSameAsLegal === true
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted'
                    )}
                  >
                    <RadioGroupItem value="same" id="same" className="mt-0.5" />
                    <Label htmlFor="same" className="flex-1 cursor-pointer">
                      <div className="font-medium text-sm mb-1">
                        Eu mesmo (responsável legal)
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Serei eu quem receberá as cobranças e notas fiscais.
                      </p>
                    </Label>
                  </div>

                  {/* Pessoa diferente */}
                  <div
                    className={cn(
                      'flex items-start space-x-3 p-4 rounded-lg border transition-all cursor-pointer',
                      isSameAsLegal === false
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted'
                    )}
                  >
                    <RadioGroupItem
                      value="different"
                      id="different"
                      className="mt-0.5"
                    />
                    <Label
                      htmlFor="different"
                      className="flex-1 cursor-pointer"
                    >
                      <div className="font-medium text-sm mb-1">
                        Outra pessoa
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Vamos buscar ou cadastrar o responsável financeiro.
                      </p>
                    </Label>
                  </div>
                </RadioGroup>

                {error && (
                  <p className="text-xs text-destructive flex items-center gap-2">
                    <AlertCircle className="w-3 h-3" />
                    {error}
                  </p>
                )}
              </div>

              {/* Botões de navegação */}
              <div className="flex gap-3">
                {onBack && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onBack}
                    className="flex-1 h-12"
                  >
                    Voltar
                  </Button>
                )}
                <Button
                  onClick={handleSelectionContinue}
                  className="flex-1 h-12"
                  disabled={isSameAsLegal === null}
                >
                  Continuar
                </Button>
              </div>
            </div>
          </div>
        );
      }

      // Renderizar busca por CPF
      if (stepState === 'cpf-search') {
        return (
          <div className={cn('w-full px-4 space-y-6', className)}>
            {/* Título */}
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold text-foreground">
                Buscar Responsável Financeiro
              </h2>
              <p className="text-xs text-muted-foreground">
                Informe o CPF para verificar se a pessoa já está cadastrada
              </p>
            </div>

            <div className="space-y-5">
              {/* Info */}
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Por que buscar por CPF?
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      Se a pessoa já possui cadastro, não será necessário
                      preencher todos os dados novamente. Basta confirmar as
                      informações.
                    </p>
                  </div>
                </div>
              </div>

              {/* Campo CPF */}
              <div className="space-y-2">
                <Label
                  htmlFor="cpf"
                  className="text-xs text-muted-foreground font-normal"
                >
                  CPF do Responsável Financeiro{' '}
                  <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="cpf"
                    type="text"
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={(e) => {
                      const value = e.target.value;
                      handleCPFChange(value);
                      // Buscar automaticamente quando CPF estiver completo (11 dígitos)
                      const cpfLimpo = value.replace(/\D/g, '');
                      if (cpfLimpo.length === 11) {
                        handleCPFSearch(value);
                      }
                    }}
                    className="h-11"
                    maxLength={14}
                    disabled={isSearching}
                  />
                  {isSearching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
                {cpfError && (
                  <p className="text-xs text-destructive flex items-center gap-2">
                    <AlertCircle className="w-3 h-3" />
                    {cpfError}
                  </p>
                )}
              </div>

              {/* Dica */}
              <p className="text-xs text-muted-foreground/70 italic">
                💡 A busca será realizada automaticamente ao digitar o CPF
                completo
              </p>

              {/* Botão Voltar */}
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBackToSelection}
                  className="w-full h-12"
                  disabled={isSearching}
                >
                  Voltar
                </Button>
              </div>
            </div>
          </div>
        );
      }

      // Renderizar pessoa encontrada
      if (stepState === 'person-found' && foundPerson) {
        return (
          <div className={cn('w-full px-4 space-y-6', className)}>
            {/* Título */}
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
                Pessoa Encontrada!
              </h2>
              <p className="text-xs text-muted-foreground">
                Confirme se esta é a pessoa correta
              </p>
            </div>

            <div className="space-y-5">
              {/* Dados da pessoa */}
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-green-700 dark:text-green-400 font-medium mb-1">
                      Nome Completo
                    </p>
                    <p className="text-sm text-green-900 dark:text-green-100 font-semibold">
                      {foundPerson.nome}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-green-700 dark:text-green-400 font-medium mb-1">
                      CPF
                    </p>
                    <p className="text-sm text-green-900 dark:text-green-100">
                      {foundPerson.cpf_cnpj.replace(
                        /(\d{3})(\d{3})(\d{3})(\d{2})/,
                        '$1.$2.$3-$4'
                      )}
                    </p>
                  </div>
                  {foundPerson.email && (
                    <div>
                      <p className="text-xs text-green-700 dark:text-green-400 font-medium mb-1">
                        Email
                      </p>
                      <p className="text-sm text-green-900 dark:text-green-100">
                        {foundPerson.email}
                      </p>
                    </div>
                  )}
                  {foundPerson.telefone && (
                    <div>
                      <p className="text-xs text-green-700 dark:text-green-400 font-medium mb-1">
                        Telefone
                      </p>
                      <p className="text-sm text-green-900 dark:text-green-100">
                        {foundPerson.telefone}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Confirmação */}
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex gap-3">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Esta pessoa receberá todas as cobranças e notas fiscais
                    relacionadas a este paciente.
                  </p>
                </div>
              </div>

              {/* Botões */}
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBackToSearch}
                  className="flex-1 h-12"
                >
                  Buscar Outro CPF
                </Button>
                <Button
                  onClick={handleConfirmFoundPerson}
                  className="flex-1 h-12"
                >
                  Confirmar
                </Button>
              </div>
            </div>
          </div>
        );
      }

      // Renderizar pessoa não encontrada
      if (stepState === 'person-not-found') {
        return (
          <div className={cn('w-full px-4 space-y-6', className)}>
            {/* Título */}
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold text-foreground">
                Pessoa Não Encontrada
              </h2>
              <p className="text-xs text-muted-foreground">
                CPF não cadastrado no sistema
              </p>
            </div>

            <div className="space-y-5">
              {/* Info */}
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      O que fazer agora?
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      Você pode buscar outro CPF ou cadastrar uma nova pessoa
                      como responsável financeiro (em breve).
                    </p>
                  </div>
                </div>
              </div>

              {/* CPF digitado */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-1">
                  CPF buscado
                </p>
                <p className="text-sm font-mono font-semibold">{cpf}</p>
              </div>

              {/* Botões */}
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBackToSearch}
                  className="flex-1 h-12"
                >
                  Buscar Outro CPF
                </Button>
                <Button
                  onClick={handleNewPersonContinue}
                  className="flex-1 h-12"
                >
                  Cadastrar Novo
                </Button>
              </div>
            </div>
          </div>
        );
      }

      // Renderizar cadastro de nova pessoa
      if (stepState === 'register-new') {
        return (
          <FinancialResponsibleDataStep
            onContinue={handleNewPersonDataSubmit}
            onBack={handleBackToSearch}
            cpf={cpf.replace(/\D/g, '')}
            className={className}
          />
        );
      }

      return null;
    }
  );

FinancialResponsibleStep.displayName = 'FinancialResponsibleStep';
