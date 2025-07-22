import React from 'react';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  FileText,
  Shield,
  Check,
  X,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { cn } from '@/lib/utils';
import type { PatientPersonalInfoProps } from '@/types/patient-details';

// AI dev note: PatientCompleteInfo - Component Composed que une informações pessoais, contato, endereço, responsáveis e consentimentos
// Substitui múltiplos cards por um único card organizado em seções

export const PatientCompleteInfo = React.memo<PatientPersonalInfoProps>(
  ({ patient, userRole, className }) => {
    // AI dev note: Calcular idade com suporte a meses para bebês menores de 1 ano
    const calculateAge = (birthDate: string) => {
      const today = new Date();
      const birth = new Date(birthDate);
      let ageInYears = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();

      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birth.getDate())
      ) {
        ageInYears--;
      }

      // Se tem menos de 1 ano, calcular em meses
      if (ageInYears < 1) {
        let ageInMonths = (today.getFullYear() - birth.getFullYear()) * 12;
        ageInMonths -= birth.getMonth();
        ageInMonths += today.getMonth();

        // Ajustar se o dia atual for menor que o dia de nascimento
        if (today.getDate() < birth.getDate()) {
          ageInMonths--;
        }

        return { value: Math.max(0, ageInMonths), unit: 'meses' };
      }

      return { value: ageInYears, unit: 'anos' };
    };

    // Função para formatar telefone
    const formatPhone = (phone: number | bigint | null) => {
      if (!phone) return null;
      const phoneStr = phone.toString();

      if (phoneStr.length === 11) {
        return phoneStr.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
      } else if (phoneStr.length === 10) {
        return phoneStr.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
      }

      return phoneStr;
    };

    // Função para formatar CPF
    const formatCPF = (cpf: string | null) => {
      if (!cpf) return null;
      return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    };

    // AI dev note: Lógica de prioridade: paciente -> responsável legal (fallback)
    const displayEmail = patient.email || patient.responsavel_legal_email;
    const displayPhone = patient.telefone
      ? formatPhone(patient.telefone)
      : patient.responsavel_legal_telefone
        ? formatPhone(patient.responsavel_legal_telefone)
        : null;

    // Verificar se responsável legal e financeiro são a mesma pessoa
    const sameResponsible =
      patient.responsavel_legal_nome === patient.responsavel_financeiro_nome &&
      patient.responsavel_legal_email ===
        patient.responsavel_financeiro_email &&
      patient.responsavel_legal_telefone ===
        patient.responsavel_financeiro_telefone;

    // Componente para consentimento
    const ConsentItem = ({
      label,
      value,
    }: {
      label: string;
      value: boolean | null | undefined;
    }) => (
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium">{label}</p>
        </div>
        <div className="flex items-center gap-1">
          {value === true ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : value === false ? (
            <X className="h-4 w-4 text-red-500" />
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
          <span className="text-xs text-muted-foreground">
            {value === true ? 'Sim' : value === false ? 'Não' : 'Não definido'}
          </span>
        </div>
      </div>
    );

    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Informações Pessoais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Seção: Informações Básicas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Idade */}
            {patient.data_nascimento && (
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground mt-1" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Idade</p>
                  <p className="text-sm text-muted-foreground">
                    {(() => {
                      const age = calculateAge(patient.data_nascimento);
                      return `${age.value} ${age.unit}`;
                    })()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Nascimento:{' '}
                    {new Date(patient.data_nascimento).toLocaleDateString(
                      'pt-BR'
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* CPF */}
            {patient.cpf_cnpj && (
              <div className="flex items-start gap-3">
                <FileText className="h-4 w-4 text-muted-foreground mt-1" />
                <div className="flex-1">
                  <p className="text-sm font-medium">CPF</p>
                  <p className="text-sm text-muted-foreground">
                    {formatCPF(patient.cpf_cnpj)}
                  </p>
                </div>
              </div>
            )}

            {/* Email - oculto para role profissional */}
            {displayEmail && userRole !== 'profissional' && (
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 text-muted-foreground mt-1" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Email</p>
                  <p className="text-sm text-muted-foreground">
                    {displayEmail}
                  </p>
                </div>
              </div>
            )}

            {/* Telefone - oculto para role profissional */}
            {displayPhone && userRole !== 'profissional' && (
              <div className="flex items-start gap-3">
                <Phone className="h-4 w-4 text-muted-foreground mt-1" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Telefone</p>
                  <p className="text-sm text-muted-foreground">
                    {displayPhone}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Seção: Endereço */}
          {(patient.endereco || patient.numero_endereco) && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Endereço
              </h4>
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                <div className="flex-1 space-y-1">
                  {patient.endereco && (
                    <>
                      <p className="text-sm">
                        <strong>Logradouro:</strong>{' '}
                        {patient.endereco.logradouro}
                        {patient.numero_endereco &&
                          `, ${patient.numero_endereco}`}
                      </p>

                      {patient.complemento_endereco && (
                        <p className="text-sm">
                          <strong>Complemento:</strong>{' '}
                          {patient.complemento_endereco}
                        </p>
                      )}

                      <p className="text-sm">
                        <strong>Bairro:</strong> {patient.endereco.bairro}
                      </p>

                      <p className="text-sm">
                        <strong>Cidade:</strong> {patient.endereco.cidade}/
                        {patient.endereco.estado}
                      </p>

                      <p className="text-sm">
                        <strong>CEP:</strong> {patient.endereco.cep}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Seção: Responsáveis */}
          {(patient.responsavel_legal_nome ||
            patient.responsavel_financeiro_nome) && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Responsáveis
              </h4>
              <div className="space-y-4">
                {sameResponsible && patient.responsavel_legal_nome ? (
                  // Responsável Legal e Financeiro são a mesma pessoa
                  <div className="flex items-start gap-3">
                    <div className="flex gap-1">
                      <Badge variant="outline" className="text-xs">
                        Legal
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Financeiro
                      </Badge>
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium">
                        {patient.responsavel_legal_nome}
                      </p>
                      {patient.responsavel_legal_email && userRole !== 'profissional' && (
                        <p className="text-sm text-muted-foreground">
                          📧 {patient.responsavel_legal_email}
                        </p>
                      )}
                      {patient.responsavel_legal_telefone && userRole !== 'profissional' && (
                        <p className="text-sm text-muted-foreground">
                          📱 {formatPhone(patient.responsavel_legal_telefone)}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  // Responsáveis diferentes
                  <>
                    {/* Responsável Legal */}
                    {patient.responsavel_legal_nome && (
                      <div className="flex items-start gap-3">
                        <Badge variant="outline" className="mt-1">
                          Legal
                        </Badge>
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium">
                            {patient.responsavel_legal_nome}
                          </p>
                          {patient.responsavel_legal_email && userRole !== 'profissional' && (
                            <p className="text-sm text-muted-foreground">
                              📧 {patient.responsavel_legal_email}
                            </p>
                          )}
                          {patient.responsavel_legal_telefone && userRole !== 'profissional' && (
                            <p className="text-sm text-muted-foreground">
                              📱{' '}
                              {formatPhone(patient.responsavel_legal_telefone)}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Responsável Financeiro */}
                    {patient.responsavel_financeiro_nome && (
                      <div className="flex items-start gap-3">
                        <Badge variant="outline" className="mt-1">
                          Financeiro
                        </Badge>
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium">
                            {patient.responsavel_financeiro_nome}
                          </p>
                          {patient.responsavel_financeiro_email && userRole !== 'profissional' && (
                            <p className="text-sm text-muted-foreground">
                              📧 {patient.responsavel_financeiro_email}
                            </p>
                          )}
                          {patient.responsavel_financeiro_telefone && userRole !== 'profissional' && (
                            <p className="text-sm text-muted-foreground">
                              📱{' '}
                              {formatPhone(
                                patient.responsavel_financeiro_telefone
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Seção: Consentimentos e Autorizações */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Consentimentos e Autorizações
            </h4>
            <div className="space-y-3">
              <ConsentItem
                label="Autorização para Uso Científico"
                value={patient.autorizacao_uso_cientifico}
              />
              <ConsentItem
                label="Autorização para Redes Sociais"
                value={patient.autorizacao_uso_redes_sociais}
              />
              <ConsentItem
                label="Autorização para Uso do Nome"
                value={patient.autorizacao_uso_nome}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
);

PatientCompleteInfo.displayName = 'PatientCompleteInfo';
