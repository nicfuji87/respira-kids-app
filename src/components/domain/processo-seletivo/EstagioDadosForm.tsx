// AI dev note: Formulário de dados do candidato (1 tela, antes das perguntas).
// Campos 'multi' e 'select' são renderizados como chips para manter o visual leve.
// Além dos campos genéricos (DADOS_FIELDS), coleta CPF + endereço completo e
// verifica o WhatsApp ao continuar (reusa validateWhatsAppAndGetJID, o mesmo
// endpoint do cadastro de paciente / link público da agenda).

import React, { useCallback, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { Button } from '@/components/primitives/button';
import { cn } from '@/lib/utils';
import { DADOS_FIELDS } from '@/lib/processo-seletivo-questions';
import { isValidCPF } from '@/lib/cpf-validator';
import { formatCPF, formatCEP } from '@/lib/profile';
import { fetchAddressByCep } from '@/lib/enderecos-api';
import { validateWhatsAppAndGetJID } from '@/lib/patient-registration-api';
import type { CandidatoDados } from '@/types/processo-seletivo';

interface EstagioDadosFormProps {
  value: CandidatoDados;
  onChange: (patch: Partial<CandidatoDados>) => void;
  onContinue: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputCls =
  'h-11 rounded-xl border-2 border-border/60 bg-card focus-visible:border-azul-respira focus-visible:ring-2 focus-visible:ring-azul-respira/30';

export const EstagioDadosForm = React.memo<EstagioDadosFormProps>(
  ({ value, onChange, onContinue }) => {
    const [waChecking, setWaChecking] = useState(false);
    const [waError, setWaError] = useState<string>('');
    const [cepLoading, setCepLoading] = useState(false);
    const [cepError, setCepError] = useState<string>('');

    const cpfDigits = (value.cpf || '').replace(/\D/g, '');
    const cepDigits = (value.cep || '').replace(/\D/g, '');
    const cpfValid = isValidCPF(cpfDigits);

    const isValid = useMemo(() => {
      const nomeOk = (value.nome || '').trim().length >= 3;
      const emailOk = EMAIL_RE.test((value.email || '').trim());
      const telOk =
        (value.telefone || '').trim().replace(/\D/g, '').length >= 10;
      const cpfOk = isValidCPF((value.cpf || '').replace(/\D/g, ''));
      const cepOk = (value.cep || '').replace(/\D/g, '').length === 8;
      const logradouroOk = (value.logradouro || '').trim().length > 0;
      const numeroOk = (value.numero || '').trim().length > 0;
      const bairroOk = (value.bairro || '').trim().length > 0;
      const cidadeOk = (value.cidade || '').trim().length > 0;
      const ufOk = (value.uf || '').trim().length === 2;
      return (
        nomeOk &&
        emailOk &&
        telOk &&
        cpfOk &&
        cepOk &&
        logradouroOk &&
        numeroOk &&
        bairroOk &&
        cidadeOk &&
        ufOk
      );
    }, [value]);

    const toggleMulti = useCallback(
      (field: keyof CandidatoDados, optValue: string) => {
        const current = (value[field] as string[] | undefined) || [];
        const next = current.includes(optValue)
          ? current.filter((v) => v !== optValue)
          : [...current, optValue];
        onChange({ [field]: next } as Partial<CandidatoDados>);
      },
      [value, onChange]
    );

    // Busca endereço pelo CEP (ViaCEP) e preenche os campos.
    const handleCepLookup = useCallback(async () => {
      const digits = (value.cep || '').replace(/\D/g, '');
      if (digits.length !== 8) return;
      setCepLoading(true);
      setCepError('');
      try {
        const result = await fetchAddressByCep(digits);
        if (result.success && result.data) {
          onChange({
            logradouro: result.data.logradouro || value.logradouro,
            bairro: result.data.bairro || value.bairro,
            cidade: result.data.cidade || value.cidade,
            uf: result.data.estado || value.uf,
          });
        } else {
          setCepError(result.error || 'CEP não encontrado');
        }
      } catch {
        setCepError('Erro ao buscar CEP');
      } finally {
        setCepLoading(false);
      }
    }, [value, onChange]);

    // Ao continuar: verifica se o número existe no WhatsApp e guarda o JID.
    const handleContinue = useCallback(async () => {
      setWaError('');
      const tel = (value.telefone || '').replace(/\D/g, '');
      setWaChecking(true);
      try {
        const res = await validateWhatsAppAndGetJID(tel);
        if (!res.exists || !res.jid) {
          setWaError(
            res.error ||
              'Não encontramos esse número no WhatsApp. Confira o DDD e o número.'
          );
          return;
        }
        onChange({
          whatsapp_jid: res.jid.replace('@s.whatsapp.net', ''),
          whatsapp_verificado: true,
        });
        onContinue();
      } catch {
        setWaError('Não foi possível verificar o WhatsApp. Tente novamente.');
      } finally {
        setWaChecking(false);
      }
    }, [value.telefone, onChange, onContinue]);

    return (
      <div className="w-full flex flex-col gap-6 animate-in fade-in slide-in-from-right-2 duration-400">
        <div className="space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground leading-tight">
            Vamos começar com seus dados
          </h2>
          <p className="text-base text-muted-foreground">
            Assim conseguimos entrar em contato com você. Campos com{' '}
            <span className="text-vermelho-kids">*</span> são obrigatórios.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {DADOS_FIELDS.map((field) => {
            const fieldKey = `dados-${field.id}`;
            const colSpan = field.fullWidth ? 'sm:col-span-2' : '';

            // Campos de texto
            if (
              field.type === 'text' ||
              field.type === 'email' ||
              field.type === 'tel'
            ) {
              return (
                <div key={fieldKey} className={cn('space-y-1.5', colSpan)}>
                  <Label htmlFor={fieldKey} className="text-foreground">
                    {field.label}
                    {field.required && (
                      <span className="text-vermelho-kids ml-0.5">*</span>
                    )}
                  </Label>
                  <Input
                    id={fieldKey}
                    type={field.type}
                    inputMode={field.type === 'tel' ? 'tel' : undefined}
                    placeholder={field.placeholder}
                    value={(value[field.id] as string | undefined) || ''}
                    onChange={(e) =>
                      onChange({
                        [field.id]: e.target.value,
                      } as Partial<CandidatoDados>)
                    }
                    className={inputCls}
                  />
                </div>
              );
            }

            // Chips (multi / select)
            const selectedValues =
              field.type === 'multi'
                ? (value[field.id] as string[] | undefined) || []
                : value[field.id]
                  ? [value[field.id] as string]
                  : [];

            return (
              <div key={fieldKey} className={cn('space-y-2', colSpan)}>
                <Label className="text-foreground">{field.label}</Label>
                <div className="flex flex-wrap gap-2">
                  {field.options?.map((opt) => {
                    const isSelected = selectedValues.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          field.type === 'multi'
                            ? toggleMulti(field.id, opt.value)
                            : onChange({
                                [field.id]: opt.value,
                              } as Partial<CandidatoDados>)
                        }
                        className={cn(
                          'px-4 py-2 rounded-full border-2 text-sm font-medium transition-all duration-200',
                          isSelected
                            ? 'border-azul-respira bg-azul-respira/10 text-roxo-titulo'
                            : 'border-border/60 bg-card text-foreground hover:border-azul-respira/50'
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Documentos e endereço (necessários para o contrato de estágio) */}
        <div className="space-y-4 pt-2 border-t border-border/50">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">
              Documentos e endereço
            </h3>
            <p className="text-sm text-muted-foreground">
              Usamos para gerar o contrato de estágio, caso você seja
              aprovado(a).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* CPF */}
            <div className="space-y-1.5">
              <Label htmlFor="dados-cpf" className="text-foreground">
                CPF<span className="text-vermelho-kids ml-0.5">*</span>
              </Label>
              <Input
                id="dados-cpf"
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={value.cpf ? formatCPF(value.cpf) : ''}
                onChange={(e) =>
                  onChange({ cpf: e.target.value.replace(/\D/g, '') })
                }
                maxLength={14}
                className={cn(
                  inputCls,
                  cpfDigits.length === 11 &&
                    !cpfValid &&
                    'border-vermelho-kids focus-visible:border-vermelho-kids'
                )}
              />
              {cpfDigits.length === 11 && !cpfValid && (
                <p className="text-xs text-vermelho-kids">CPF inválido.</p>
              )}
            </div>

            {/* CEP */}
            <div className="space-y-1.5">
              <Label htmlFor="dados-cep" className="text-foreground">
                CEP<span className="text-vermelho-kids ml-0.5">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="dados-cep"
                  inputMode="numeric"
                  placeholder="00000-000"
                  value={value.cep ? formatCEP(value.cep) : ''}
                  onChange={(e) => {
                    setCepError('');
                    onChange({ cep: e.target.value.replace(/\D/g, '') });
                  }}
                  onBlur={handleCepLookup}
                  maxLength={9}
                  className={inputCls}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCepLookup}
                  disabled={cepLoading || cepDigits.length !== 8}
                  className="h-11 rounded-xl px-3 shrink-0"
                >
                  {cepLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {cepError && (
                <p className="text-xs text-vermelho-kids">{cepError}</p>
              )}
            </div>

            {/* Logradouro */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="dados-logradouro" className="text-foreground">
                Endereço (rua/avenida)
                <span className="text-vermelho-kids ml-0.5">*</span>
              </Label>
              <Input
                id="dados-logradouro"
                placeholder="Rua, avenida..."
                value={value.logradouro || ''}
                onChange={(e) => onChange({ logradouro: e.target.value })}
                className={inputCls}
              />
            </div>

            {/* Número */}
            <div className="space-y-1.5">
              <Label htmlFor="dados-numero" className="text-foreground">
                Número<span className="text-vermelho-kids ml-0.5">*</span>
              </Label>
              <Input
                id="dados-numero"
                placeholder="123"
                value={value.numero || ''}
                onChange={(e) => onChange({ numero: e.target.value })}
                className={inputCls}
              />
            </div>

            {/* Complemento */}
            <div className="space-y-1.5">
              <Label htmlFor="dados-complemento" className="text-foreground">
                Complemento
              </Label>
              <Input
                id="dados-complemento"
                placeholder="Apto, bloco... (opcional)"
                value={value.complemento || ''}
                onChange={(e) => onChange({ complemento: e.target.value })}
                className={inputCls}
              />
            </div>

            {/* Bairro */}
            <div className="space-y-1.5">
              <Label htmlFor="dados-bairro" className="text-foreground">
                Bairro<span className="text-vermelho-kids ml-0.5">*</span>
              </Label>
              <Input
                id="dados-bairro"
                placeholder="Bairro"
                value={value.bairro || ''}
                onChange={(e) => onChange({ bairro: e.target.value })}
                className={inputCls}
              />
            </div>

            {/* Cidade */}
            <div className="space-y-1.5">
              <Label htmlFor="dados-cidade" className="text-foreground">
                Cidade<span className="text-vermelho-kids ml-0.5">*</span>
              </Label>
              <Input
                id="dados-cidade"
                placeholder="Cidade"
                value={value.cidade || ''}
                onChange={(e) => onChange({ cidade: e.target.value })}
                className={inputCls}
              />
            </div>

            {/* UF */}
            <div className="space-y-1.5">
              <Label htmlFor="dados-uf" className="text-foreground">
                UF<span className="text-vermelho-kids ml-0.5">*</span>
              </Label>
              <Input
                id="dados-uf"
                placeholder="SP"
                value={value.uf || ''}
                onChange={(e) =>
                  onChange({
                    uf: e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase(),
                  })
                }
                maxLength={2}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {waError && (
          <p className="text-sm text-vermelho-kids -mb-2">{waError}</p>
        )}

        <div className="flex justify-end pt-2">
          <Button
            size="lg"
            onClick={handleContinue}
            disabled={!isValid || waChecking}
            className="w-full sm:w-auto min-w-[200px] h-12 rounded-full"
          >
            {waChecking ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Verificando WhatsApp...
              </>
            ) : (
              'Continuar'
            )}
          </Button>
        </div>
      </div>
    );
  }
);

EstagioDadosForm.displayName = 'EstagioDadosForm';
