import * as React from 'react';
import { ChevronDown, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/primitives/input';
import {
  PAISES_TELEFONE,
  PAIS_BRASIL,
  PAIS_OUTRO_ID,
  TELEFONE_E164_MAX,
  apenasDigitos,
  lerTelefoneDigitado,
  montarValorInternacional,
} from '@/lib/telefone-internacional';

// AI dev note: PhoneInput mobile-first para validação de WhatsApp.
// Brasil (padrão): máscara automática (XX) XXXXX-XXXX, igual sempre foi.
// Outro país: seletor de DDI + número só com dígitos. O valor emitido segue a
// convenção de src/lib/telefone-internacional.ts:
//   Brasil   -> "(61) 98144-6666"
//   Exterior -> "+972 543316400"
// Use lerTelefoneDigitado(valor) para validar e obter os dígitos com DDI.
// Campos de texto usam o primitivo Input (useComposableField) por causa do IME
// dos tablets Samsung.

export interface PhoneInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'type' | 'value' | 'onChange'
  > {
  value: string;
  onChange: (value: string) => void;
  isValidating?: boolean;
  isValid?: boolean | null;
  errorMessage?: string;
  /** Mostra o seletor de país (padrão: true). Sem ele, só aceita Brasil. */
  permitirInternacional?: boolean;
}

/**
 * Formata número de telefone brasileiro para (XX) XXXXX-XXXX
 */
const formatPhoneNumber = (value: string): string => {
  // Remove tudo que não é dígito
  const digits = value.replace(/\D/g, '');

  // Limita a 11 dígitos
  const limited = digits.slice(0, 11);

  // Aplica máscara
  if (limited.length === 0) return '';
  if (limited.length <= 2) return `(${limited}`;
  if (limited.length <= 7)
    return `(${limited.slice(0, 2)}) ${limited.slice(2)}`;

  return `(${limited.slice(0, 2)}) ${limited.slice(2, 7)}-${limited.slice(7)}`;
};

/** País do seletor a partir do valor (sem "+" é Brasil). */
const paisDoValor = (value: string, atual?: string): string => {
  if (!value.trim().startsWith('+')) return PAIS_BRASIL.id;
  const { internacional, ddi } = lerTelefoneDigitado(value);
  if (!internacional) return PAIS_BRASIL.id;
  if (atual === PAIS_OUTRO_ID) return PAIS_OUTRO_ID;
  return PAISES_TELEFONE.find((p) => p.ddi === ddi)?.id ?? PAIS_OUTRO_ID;
};

const limitarNacional = (ddi: string, nacional: string): string =>
  apenasDigitos(nacional).slice(0, Math.max(TELEFONE_E164_MAX - ddi.length, 0));

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  (
    {
      className,
      value,
      onChange,
      isValidating = false,
      isValid = null,
      errorMessage,
      disabled,
      permitirInternacional = true,
      placeholder,
      ...props
    },
    ref
  ) => {
    const errorId = React.useId();
    const [paisId, setPaisId] = React.useState(() => paisDoValor(value));

    // Valor alterado por fora (reset do formulário, cadastro carregado):
    // acompanha o país. Em "Outro" o usuário pode estar digitando um DDI que
    // coincide com um país da lista; não troca o seletor no meio da digitação.
    React.useEffect(() => {
      setPaisId((atual) => paisDoValor(value, atual));
    }, [value]);

    const telefone = lerTelefoneDigitado(value);
    const ehBrasil = !permitirInternacional || paisId === PAIS_BRASIL.id;
    const paisAtual =
      PAISES_TELEFONE.find((p) => p.id === paisId) ?? PAIS_BRASIL;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (ehBrasil) {
        onChange(formatPhoneNumber(e.target.value));
        return;
      }
      onChange(
        montarValorInternacional(
          telefone.ddi,
          limitarNacional(telefone.ddi, e.target.value)
        )
      );
    };

    const handleDdiChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const ddi = apenasDigitos(e.target.value).slice(0, 3);
      if (ddi === PAIS_BRASIL.ddi) {
        setPaisId(PAIS_BRASIL.id);
        onChange(formatPhoneNumber(telefone.nacional));
        return;
      }
      onChange(
        montarValorInternacional(ddi, limitarNacional(ddi, telefone.nacional))
      );
    };

    const handlePaisChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const novoId = e.target.value;
      setPaisId(novoId);
      if (novoId === PAIS_BRASIL.id) {
        onChange(formatPhoneNumber(telefone.nacional));
        return;
      }
      const ddi =
        novoId === PAIS_OUTRO_ID
          ? telefone.internacional
            ? telefone.ddi
            : ''
          : (PAISES_TELEFONE.find((p) => p.id === novoId)?.ddi ?? '');
      onChange(
        montarValorInternacional(ddi, limitarNacional(ddi, telefone.nacional))
      );
    };

    // Determinar cor da borda baseado no estado de validação
    const getBorderColor = () => {
      if (isValidating) return 'border-primary/50';
      if (isValid === true) return 'border-green-500';
      if (isValid === false) return 'border-destructive';
      return 'border-input';
    };

    const bloqueado = disabled || isValidating;

    return (
      <div className="w-full">
        <div className="flex w-full flex-wrap gap-2 sm:flex-nowrap">
          {permitirInternacional && (
            <div
              className={cn(
                'relative flex h-14 shrink-0 items-center gap-1 rounded-lg border border-input bg-background px-2.5 shadow-sm',
                'focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2',
                'hover:border-primary/30',
                bloqueado && 'cursor-not-allowed opacity-50'
              )}
            >
              <span className="text-lg leading-none" aria-hidden="true">
                {paisId === PAIS_OUTRO_ID ? '🌐' : paisAtual.bandeira}
              </span>
              <span
                className="text-base font-medium text-foreground"
                aria-hidden="true"
              >
                {paisId === PAIS_OUTRO_ID ? 'Outro' : `+${paisAtual.ddi}`}
              </span>
              <ChevronDown
                className="h-3.5 w-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              {/* Select nativo por cima: abre a lista do próprio celular */}
              <select
                aria-label="País do telefone"
                value={paisId}
                onChange={handlePaisChange}
                disabled={bloqueado}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              >
                {PAISES_TELEFONE.map((pais) => (
                  <option key={pais.id} value={pais.id}>
                    {pais.nome} (+{pais.ddi})
                  </option>
                ))}
                <option value={PAIS_OUTRO_ID}>Outro país</option>
              </select>
            </div>
          )}

          {!ehBrasil && paisId === PAIS_OUTRO_ID && (
            <div className="relative w-20 shrink-0">
              <span
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-medium text-muted-foreground"
                aria-hidden="true"
              >
                +
              </span>
              <Input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-country-code"
                aria-label="Código do país"
                placeholder="DDI"
                value={telefone.ddi}
                onChange={handleDdiChange}
                disabled={bloqueado}
                className="h-14 rounded-lg bg-background pl-7 pr-2 text-lg font-medium shadow-sm md:text-lg"
              />
            </div>
          )}

          {/* Em "Outro" no celular o número desce para a linha de baixo */}
          <div
            className={cn(
              'relative min-w-0 flex-1',
              !ehBrasil && paisId === PAIS_OUTRO_ID && 'basis-full sm:basis-0'
            )}
          >
            {/* Ícone do telefone (só sem o seletor de país) */}
            {!permitirInternacional && (
              <Phone
                className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground z-10"
                aria-hidden="true"
              />
            )}

            {/* Input com máscara */}
            <Input
              ref={ref}
              type="tel"
              inputMode={ehBrasil ? 'numeric' : 'tel'}
              value={ehBrasil ? value : telefone.nacional}
              onChange={handleChange}
              disabled={bloqueado}
              className={cn(
                // Base styles - mobile-first (h-14 = 56px para touch target)
                'flex h-14 w-full rounded-lg border bg-background py-4',
                // Com o seletor de país ao lado, o campo é mais estreito no
                // celular: fonte e respiros menores para o número caber inteiro
                permitirInternacional
                  ? 'pl-3 pr-10 text-base sm:text-lg md:text-lg'
                  : 'pl-12 pr-12 text-lg md:text-lg',
                'font-medium text-foreground',
                'shadow-sm transition-all duration-200',
                'placeholder:text-muted-foreground/60',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                // Cor da borda baseada no estado
                getBorderColor(),
                // Animação sutil no hover
                'hover:border-primary/30',
                className
              )}
              placeholder={
                ehBrasil
                  ? (placeholder ?? '(00) 00000-0000')
                  : 'Número com código de área'
              }
              aria-label={
                ehBrasil ? undefined : `Número de telefone (+${telefone.ddi})`
              }
              aria-invalid={isValid === false}
              aria-describedby={errorMessage ? errorId : undefined}
              {...props}
            />

            {/* Spinner de validação */}
            {isValidating && (
              <div
                className={cn(
                  'absolute top-1/2 transform -translate-y-1/2 z-10',
                  permitirInternacional ? 'right-3' : 'right-4'
                )}
              >
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Ícone de sucesso */}
            {isValid === true && !isValidating && (
              <div
                className={cn(
                  'absolute top-1/2 transform -translate-y-1/2 z-10',
                  permitirInternacional ? 'right-3' : 'right-4'
                )}
              >
                <svg
                  className="w-5 h-5 text-green-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            )}

            {/* Ícone de erro */}
            {isValid === false && !isValidating && (
              <div
                className={cn(
                  'absolute top-1/2 transform -translate-y-1/2 z-10',
                  permitirInternacional ? 'right-3' : 'right-4'
                )}
              >
                <svg
                  className="w-5 h-5 text-destructive"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
            )}
          </div>
        </div>

        {!ehBrasil && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Número estrangeiro: digite o número com código de área, sem o zero
            inicial.
          </p>
        )}

        {/* Mensagem de erro */}
        {errorMessage && isValid === false && (
          <p
            id={errorId}
            className="mt-2 text-sm text-destructive font-medium"
            role="alert"
          >
            {errorMessage}
          </p>
        )}
      </div>
    );
  }
);

PhoneInput.displayName = 'PhoneInput';
