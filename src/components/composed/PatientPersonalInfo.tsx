import React from 'react';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  FileText,
  UserCheck,
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

// AI dev note: PatientPersonalInfo - Component Composed para exibir informações pessoais do paciente
// Combina primitivos Card, Badge, Button para interface organizada
// Mostra dados pessoais, endereço, responsáveis com fallback lógica responsável -> paciente

export const PatientPersonalInfo = React.memo<PatientPersonalInfoProps>(
  ({ patient, className }) => {
    // Calcular idade se data de nascimento disponível
    const calculateAge = (birthDate: string) => {
      const today = new Date();
      const birth = new Date(birthDate);
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();

      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birth.getDate())
      ) {
        age--;
      }

      return age;
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

    // Lógica de fallback: responsável -> paciente
    const displayName = patient.responsavel_legal_nome || patient.nome;
    const displayEmail = patient.responsavel_legal_email || patient.email;
    const displayPhone = patient.responsavel_legal_telefone || patient.telefone;

    return (
      <div className={cn('space-y-6', className)}>
        {/* Informações Básicas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Informações Pessoais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nome */}
              <div className="flex items-start gap-3">
                <User className="h-4 w-4 text-muted-foreground mt-1" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Nome Completo</p>
                  <p className="text-sm text-muted-foreground">{displayName}</p>
                  {patient.responsavel_legal_nome && (
                    <Badge variant="outline" className="mt-1 text-xs">
                      Responsável Legal
                    </Badge>
                  )}
                </div>
              </div>

              {/* Idade */}
              {patient.data_nascimento && (
                <div className="flex items-start gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground mt-1" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Idade</p>
                    <p className="text-sm text-muted-foreground">
                      {calculateAge(patient.data_nascimento)} anos
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

              {/* Sexo */}
              {patient.sexo && (
                <div className="flex items-start gap-3">
                  <User className="h-4 w-4 text-muted-foreground mt-1" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Sexo</p>
                    <p className="text-sm text-muted-foreground">
                      {patient.sexo === 'M'
                        ? 'Masculino'
                        : patient.sexo === 'F'
                          ? 'Feminino'
                          : 'Outro'}
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
            </div>
          </CardContent>
        </Card>

        {/* Contato */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Informações de Contato
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Email */}
              {displayEmail && (
                <div className="flex items-start gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground mt-1" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Email</p>
                    <p className="text-sm text-muted-foreground">
                      {displayEmail}
                    </p>
                    {patient.responsavel_legal_email && (
                      <Badge variant="outline" className="mt-1 text-xs">
                        Responsável Legal
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Telefone */}
              {displayPhone && (
                <div className="flex items-start gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground mt-1" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Telefone</p>
                    <p className="text-sm text-muted-foreground">
                      {formatPhone(displayPhone)}
                    </p>
                    {patient.responsavel_legal_telefone && (
                      <Badge variant="outline" className="mt-1 text-xs">
                        Responsável Legal
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Endereço */}
        {(patient.endereco || patient.numero_endereco) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Endereço
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {patient.endereco && (
                  <>
                    <p className="text-sm">
                      <strong>Logradouro:</strong> {patient.endereco.logradouro}
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
            </CardContent>
          </Card>
        )}

        {/* Responsáveis */}
        {(patient.responsavel_legal_nome ||
          patient.responsavel_financeiro_nome) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                Responsáveis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                    {patient.responsavel_legal_email && (
                      <p className="text-sm text-muted-foreground">
                        📧 {patient.responsavel_legal_email}
                      </p>
                    )}
                    {patient.responsavel_legal_telefone && (
                      <p className="text-sm text-muted-foreground">
                        📱 {formatPhone(patient.responsavel_legal_telefone)}
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
                    {patient.responsavel_financeiro_email && (
                      <p className="text-sm text-muted-foreground">
                        📧 {patient.responsavel_financeiro_email}
                      </p>
                    )}
                    {patient.responsavel_financeiro_telefone && (
                      <p className="text-sm text-muted-foreground">
                        📱{' '}
                        {formatPhone(patient.responsavel_financeiro_telefone)}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Origem da Indicação */}
        {patient.origem_indicacao && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                Origem da Indicação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {patient.origem_indicacao}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }
);

PatientPersonalInfo.displayName = 'PatientPersonalInfo';
