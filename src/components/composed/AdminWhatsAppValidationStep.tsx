import React, { useState, useEffect, useCallback } from 'react';
import { PhoneInput } from '@/components/primitives/PhoneInput';
import { Label } from '@/components/primitives/label';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { Card, CardContent } from '@/components/primitives/card';
import { AlertTriangle, CheckCircle, Loader2, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { validateWhatsAppAndGetJID } from '@/lib/patient-registration-api';
import { lerTelefoneDigitado } from '@/lib/telefone-internacional';

// Hook personalizado para debounce
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface AdminWhatsAppValidationStepProps {
  onContinue: (data: {
    whatsapp: string;
    jid: string;
    existingPerson?: {
      id: string;
      nome: string;
      cpf_cnpj: string;
      ativo: boolean;
      email?: string;
      numero_endereco?: string;
      complemento_endereco?: string;
      endereco?: {
        id: string;
        cep: string;
        logradouro: string;
        bairro: string;
        cidade: string;
        estado: string;
      };
    };
  }) => void;
  onBack: () => void;
  initialValue?: string;
}

// AI dev note: Validação automática de WhatsApp sem envio de código
export const AdminWhatsAppValidationStep: React.FC<
  AdminWhatsAppValidationStepProps
> = ({ onContinue, onBack, initialValue = '' }) => {
  const [whatsapp, setWhatsapp] = useState(initialValue);
  const [validationStatus, setValidationStatus] = useState<
    'idle' | 'validating' | 'valid' | 'invalid'
  >('idle');
  const [validationMessage, setValidationMessage] = useState<string>('');
  const [jid, setJid] = useState<string>('');
  const [existingPerson, setExistingPerson] = useState<{
    id: string;
    nome: string;
    cpf_cnpj: string;
    ativo: boolean;
    email?: string;
    numero_endereco?: string;
    complemento_endereco?: string;
    endereco?: {
      id: string;
      cep: string;
      logradouro: string;
      bairro: string;
      cidade: string;
      estado: string;
    };
  } | null>(null);

  const debouncedWhatsapp = useDebounce(whatsapp, 500);

  // Buscar pessoa existente pelo telefone (JID sem @)
  const searchExistingPerson = useCallback(async (phoneNumber: string) => {
    try {
      const { data, error } = await supabase
        .from('pessoas')
        .select(
          `
          id,
          nome,
          cpf_cnpj,
          ativo,
          email,
          numero_endereco,
          complemento_endereco,
          enderecos!id_endereco (
            id,
            cep,
            logradouro,
            bairro,
            cidade,
            estado
          )
        `
        )
        .eq('telefone', phoneNumber)
        .maybeSingle();

      if (error) {
        console.error('Erro ao buscar pessoa:', error);
        return null;
      }

      return data;
    } catch (err) {
      console.error('Erro ao buscar pessoa existente:', err);
      return null;
    }
  }, []);

  // Validar WhatsApp quando o número mudar
  useEffect(() => {
    const validateNumber = async () => {
      const telefone = lerTelefoneDigitado(debouncedWhatsapp);

      // Brasil: 11 dígitos. Exterior: DDI + número entre 8 e 15 dígitos.
      if (!telefone.valido) {
        setValidationStatus('idle');
        setValidationMessage('');
        setExistingPerson(null);
        return;
      }

      setValidationStatus('validating');
      setValidationMessage('Validando WhatsApp...');

      try {
        // Validar WhatsApp usando função existente
        // Brasil: 11 dígitos locais (igual antes). Exterior: "+DDI número".
        const validation = await validateWhatsAppAndGetJID(
          telefone.internacional ? debouncedWhatsapp : telefone.nacional
        );

        if (validation.exists && validation.jid) {
          setJid(validation.jid);

          // Extrair número do JID (remover @s.whatsapp.net)
          const phoneNumber = validation.jid.split('@')[0];

          // Buscar pessoa existente
          const person = await searchExistingPerson(phoneNumber);

          if (person) {
            setExistingPerson(person);
            if (!person.ativo) {
              setValidationMessage(
                'Responsável encontrado (inativo - será reativado)'
              );
            } else {
              setValidationMessage('Responsável legal já cadastrado');
            }
          } else {
            setValidationMessage('WhatsApp válido - Novo responsável');
          }

          setValidationStatus('valid');
        } else {
          setJid('');
          setExistingPerson(null);
          setValidationStatus('invalid');
          setValidationMessage('Número não encontrado no WhatsApp');
        }
      } catch (err) {
        console.error('Erro na validação:', err);
        setValidationStatus('invalid');
        setValidationMessage('Erro ao validar WhatsApp');
      }
    };

    if (debouncedWhatsapp) {
      validateNumber();
    } else {
      setValidationStatus('idle');
      setValidationMessage('');
      setExistingPerson(null);
    }
  }, [debouncedWhatsapp, searchExistingPerson]);

  const handleContinue = () => {
    if (validationStatus === 'valid' || validationStatus === 'invalid') {
      onContinue({
        whatsapp,
        jid,
        existingPerson: existingPerson || undefined,
      });
    }
  };

  const canContinue =
    validationStatus === 'valid' ||
    (validationStatus === 'invalid' && lerTelefoneDigitado(whatsapp).valido);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">
          WhatsApp do Responsável Legal
        </h2>
        <p className="text-muted-foreground">
          Digite o WhatsApp do responsável legal do paciente
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="whatsapp">WhatsApp *</Label>
          <PhoneInput
            id="whatsapp"
            placeholder="(11) 98765-4321"
            value={whatsapp}
            onChange={setWhatsapp}
            className={
              validationStatus === 'valid'
                ? 'border-green-500'
                : validationStatus === 'invalid'
                  ? 'border-yellow-500'
                  : ''
            }
          />
        </div>

        {/* Status de validação */}
        {validationStatus === 'validating' && (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription>{validationMessage}</AlertDescription>
          </Alert>
        )}

        {validationStatus === 'valid' && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              {validationMessage}
            </AlertDescription>
          </Alert>
        )}

        {validationStatus === 'invalid' && (
          <Alert className="border-yellow-200 bg-yellow-50">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800">
              {validationMessage}
              <br />
              <span className="text-sm">
                O responsável não receberá notificações automáticas via WhatsApp
              </span>
            </AlertDescription>
          </Alert>
        )}

        {/* Dados do responsável existente */}
        {existingPerson && (
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="flex items-start space-x-3">
                <User className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium text-blue-900">
                    {existingPerson.nome}
                  </p>
                  <p className="text-sm text-blue-700">
                    CPF: {existingPerson.cpf_cnpj}
                  </p>
                  {existingPerson.endereco && (
                    <p className="text-sm text-blue-700">
                      {existingPerson.endereco.logradouro},{' '}
                      {existingPerson.endereco.bairro}
                    </p>
                  )}
                  {!existingPerson.ativo && (
                    <p className="text-sm font-medium text-orange-600 mt-2">
                      ⚠️ Este cadastro será reativado automaticamente
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Voltar
        </button>

        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue}
          className={`px-4 py-2 text-sm font-medium text-white rounded-md ${
            canContinue
              ? 'bg-primary hover:bg-primary/90'
              : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          Continuar
        </button>
      </div>
    </div>
  );
};
