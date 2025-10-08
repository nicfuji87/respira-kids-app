import React, { useState, useCallback } from 'react';
import { Button } from '@/components/primitives/button';
import { Card } from '@/components/primitives/card';
import { CheckCircle, Edit } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResponsibleData } from './ResponsibleDataStep';
import type { AddressData } from './AddressStep';
import type { PatientData } from './PatientDataStep';
import type { PediatricianData } from './PediatricianStep';
import type { AuthorizationsData } from './AuthorizationsStep';

// AI dev note: ReviewStep - Etapa final de revisão antes de gerar o contrato
// Exibe todos os dados coletados e permite edição antes de confirmar

export interface ExistingUserData {
  id: string;
  nome: string;
  cpf_cnpj?: string;
  telefone?: string;
  email?: string;
  data_nascimento?: string;
  sexo?: string;
  id_tipo_pessoa?: string;
  tipo_responsabilidade?: string; // 'legal', 'financeiro' ou 'ambos'
  cep?: string;
  logradouro?: string;
  numero_endereco?: string; // AI dev note: Campo correto da view vw_usuarios_admin
  complemento_endereco?: string; // AI dev note: Campo correto da view vw_usuarios_admin
  bairro?: string;
  cidade?: string; // AI dev note: Campo correto da view vw_usuarios_admin
  estado?: string; // AI dev note: Campo correto da view vw_usuarios_admin
}

export interface ReviewStepProps {
  onConfirm: () => void;
  onEdit?: (step: string) => void;
  data: {
    phoneNumber?: string;
    responsavel?: ResponsibleData;
    endereco?: AddressData;
    responsavelFinanceiroMesmoQueLegal?: boolean;
    responsavelFinanceiro?: {
      nome: string;
      cpf: string;
      email: string;
      telefone: string;
      whatsappJid: string;
      endereco: AddressData;
    };
    paciente?: PatientData;
    pediatra?: PediatricianData;
    autorizacoes?: AuthorizationsData;
    existingPersonId?: string;
    existingUserData?: ExistingUserData;
  };
  isLoading?: boolean;
  className?: string;
}

export const ReviewStep = React.memo<ReviewStepProps>(
  ({ onConfirm, onEdit, data, isLoading = false, className }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Use external loading state if provided
    const loading = isLoading || isSubmitting;

    const handleConfirm = useCallback(async () => {
      setIsSubmitting(true);
      try {
        await onConfirm();
      } finally {
        setIsSubmitting(false);
      }
    }, [onConfirm]);

    const handleEditSection = useCallback(
      (step: string) => {
        if (onEdit) {
          onEdit(step);
        }
      },
      [onEdit]
    );

    return (
      <div className={cn('w-full max-w-md mx-auto space-y-6', className)}>
        {/* Título */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            Revisar Informações
          </h1>
          <p className="text-base text-muted-foreground">
            ⚠️ Estamos quase terminando! Por favor, revise todos os dados antes
            de gerar o contrato.
          </p>
        </div>

        {/* Alerta importante */}
        <div className="p-4 bg-yellow-50 dark:bg-yellow-950/30 border-2 border-yellow-400 dark:border-yellow-700 rounded-lg">
          <p className="text-sm text-yellow-900 dark:text-yellow-100 font-medium">
            <strong>⚠️ Atenção:</strong> Ainda não terminamos! Revise
            cuidadosamente todas as informações antes de confirmar.
          </p>
        </div>

        <div className="space-y-4">
          {/* WhatsApp Validado */}
          {data.phoneNumber && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  WhatsApp Validado
                </h3>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>
                  <strong>Número:</strong> +{data.phoneNumber}
                </p>
              </div>
            </Card>
          )}

          {/* Responsável Legal - Novo ou Existente */}
          {(data.responsavel || data.existingUserData) && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-base flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    Responsável
                  </h3>
                  {/* Badges de tipo */}
                  {data.existingUserData?.tipo_responsabilidade === 'ambos' && (
                    <>
                      <span className="text-xs font-semibold text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-1 rounded">
                        Legal
                      </span>
                      <span className="text-xs font-semibold text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-300 px-2 py-1 rounded">
                        Financeiro
                      </span>
                    </>
                  )}
                  {data.existingUserData?.tipo_responsabilidade === 'legal' && (
                    <span className="text-xs font-semibold text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-1 rounded">
                      Legal
                    </span>
                  )}
                  {data.existingUserData?.tipo_responsabilidade ===
                    'financeiro' && (
                    <span className="text-xs font-semibold text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-300 px-2 py-1 rounded">
                      Financeiro
                    </span>
                  )}
                  {!data.existingUserData && (
                    <span className="text-xs font-semibold text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-1 rounded">
                      Legal
                    </span>
                  )}
                  {data.existingPersonId && (
                    <span className="text-xs font-medium text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-300 px-2 py-1 rounded">
                      Cadastrado
                    </span>
                  )}
                </div>
                {onEdit && !data.existingPersonId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditSection('responsible-data')}
                    className="text-primary hover:text-primary/80"
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Editar
                  </Button>
                )}
              </div>
              <div className="text-sm space-y-1 text-muted-foreground">
                {data.existingUserData ? (
                  <>
                    <p>
                      <strong>Nome Completo:</strong>{' '}
                      {data.existingUserData.nome}
                    </p>
                    {data.existingUserData.cpf_cnpj && (
                      <p>
                        <strong>CPF:</strong> {data.existingUserData.cpf_cnpj}
                      </p>
                    )}
                    {data.existingUserData.telefone && (
                      <p>
                        <strong>WhatsApp:</strong>{' '}
                        {data.existingUserData.telefone}
                      </p>
                    )}
                    {data.existingUserData.email && (
                      <p>
                        <strong>Email:</strong> {data.existingUserData.email}
                      </p>
                    )}
                    {data.existingUserData.data_nascimento && (
                      <p>
                        <strong>Data de Nascimento:</strong>{' '}
                        {(() => {
                          const date = new Date(
                            data.existingUserData.data_nascimento + 'T00:00:00'
                          );
                          return date.toLocaleDateString('pt-BR', {
                            timeZone: 'UTC',
                          });
                        })()}
                      </p>
                    )}
                    {data.existingUserData.sexo && (
                      <p>
                        <strong>Sexo:</strong>{' '}
                        {data.existingUserData.sexo === 'M'
                          ? 'Masculino'
                          : 'Feminino'}
                      </p>
                    )}
                  </>
                ) : data.responsavel ? (
                  <>
                    <p>
                      <strong>Nome Completo:</strong> {data.responsavel.nome}
                    </p>
                    <p>
                      <strong>CPF:</strong> {data.responsavel.cpf}
                    </p>
                    <p>
                      <strong>Email:</strong> {data.responsavel.email}
                    </p>
                  </>
                ) : null}
              </div>
            </Card>
          )}

          {/* Endereço - Novo ou Existente */}
          {(data.endereco || data.existingUserData?.cep) && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  Endereço do Responsável
                </h3>
                {onEdit && !data.existingPersonId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditSection('address')}
                    className="text-primary hover:text-primary/80"
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Editar
                  </Button>
                )}
              </div>
              <div className="text-sm space-y-1 text-muted-foreground">
                {data.existingUserData?.cep ? (
                  <>
                    {data.existingUserData.cep && (
                      <p>
                        <strong>CEP:</strong> {data.existingUserData.cep}
                      </p>
                    )}
                    {data.existingUserData.logradouro && (
                      <p>
                        <strong>Logradouro:</strong>{' '}
                        {data.existingUserData.logradouro}
                      </p>
                    )}
                    {data.existingUserData.numero_endereco && (
                      <p>
                        <strong>Número:</strong>{' '}
                        {data.existingUserData.numero_endereco}
                      </p>
                    )}
                    {data.existingUserData.complemento_endereco && (
                      <p>
                        <strong>Complemento:</strong>{' '}
                        {data.existingUserData.complemento_endereco}
                      </p>
                    )}
                    {data.existingUserData.bairro && (
                      <p>
                        <strong>Bairro:</strong> {data.existingUserData.bairro}
                      </p>
                    )}
                    {data.existingUserData.cidade &&
                      data.existingUserData.estado && (
                        <p>
                          <strong>Cidade/UF:</strong>{' '}
                          {data.existingUserData.cidade} -{' '}
                          {data.existingUserData.estado}
                        </p>
                      )}
                  </>
                ) : data.endereco ? (
                  <>
                    <p>
                      <strong>CEP:</strong> {data.endereco.cep}
                    </p>
                    <p>
                      <strong>Logradouro:</strong> {data.endereco.logradouro}
                    </p>
                    <p>
                      <strong>Número:</strong> {data.endereco.numero}
                    </p>
                    {data.endereco.complemento && (
                      <p>
                        <strong>Complemento:</strong>{' '}
                        {data.endereco.complemento}
                      </p>
                    )}
                    <p>
                      <strong>Bairro:</strong> {data.endereco.bairro}
                    </p>
                    <p>
                      <strong>Cidade/UF:</strong> {data.endereco.cidade} -{' '}
                      {data.endereco.estado}
                    </p>
                  </>
                ) : null}
              </div>
            </Card>
          )}

          {/* Responsável Financeiro - Apenas se for diferente do Legal */}
          {!data.existingPersonId &&
            !data.responsavelFinanceiroMesmoQueLegal &&
            data.responsavelFinanceiro && (
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      Responsável
                    </h3>
                    <span className="text-xs font-semibold text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-300 px-2 py-1 rounded">
                      Financeiro
                    </span>
                  </div>
                  {onEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditSection('financial-responsible')}
                      className="text-primary hover:text-primary/80"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Editar
                    </Button>
                  )}
                </div>
                <div className="text-sm space-y-1 text-muted-foreground">
                  <p>
                    <strong>Nome Completo:</strong>{' '}
                    {data.responsavelFinanceiro.nome}
                  </p>
                  <p>
                    <strong>CPF:</strong> {data.responsavelFinanceiro.cpf}
                  </p>
                  <p>
                    <strong>Email:</strong> {data.responsavelFinanceiro.email}
                  </p>
                  <p>
                    <strong>Telefone:</strong>{' '}
                    {data.responsavelFinanceiro.telefone}
                  </p>
                </div>
              </Card>
            )}

          {/* Paciente */}
          {data.paciente && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  Dados do Paciente
                </h3>
                {onEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditSection('patient-data')}
                    className="text-primary hover:text-primary/80"
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Editar
                  </Button>
                )}
              </div>
              <div className="text-sm space-y-2 text-muted-foreground">
                <p>
                  <strong>Nome Completo:</strong> {data.paciente.nome}
                </p>
                <p>
                  <strong>Data de Nascimento:</strong>{' '}
                  {(() => {
                    const date = new Date(
                      data.paciente.dataNascimento + 'T00:00:00'
                    );
                    return date.toLocaleDateString('pt-BR', {
                      timeZone: 'UTC',
                    });
                  })()}
                </p>
                <p>
                  <strong>Sexo:</strong>{' '}
                  {data.paciente.sexo === 'M' ? 'Masculino' : 'Feminino'}
                </p>
                {data.paciente.cpf && (
                  <p>
                    <strong>CPF:</strong> {data.paciente.cpf}
                  </p>
                )}
                <div className="pt-2 mt-2 border-t border-border">
                  <p className="text-xs italic">
                    💳 <strong>Nota Fiscal:</strong> Será emitida com os dados
                    do responsável financeiro. Os dados do paciente constarão
                    nas observações.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Pediatra */}
          {data.pediatra && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  Pediatra
                </h3>
                {onEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditSection('pediatrician')}
                    className="text-primary hover:text-primary/80"
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Editar
                  </Button>
                )}
              </div>
              <div className="text-sm space-y-1 text-muted-foreground">
                {data.pediatra.noPediatrician ? (
                  <p>❌ Não possui pediatra</p>
                ) : (
                  <>
                    <p>
                      <strong>Nome:</strong> {data.pediatra.nome}
                    </p>
                    {/* Especialidade removida do cadastro */}
                    {data.pediatra.isNew && (
                      <p className="text-xs italic">
                        🆕 Novo pediatra cadastrado
                      </p>
                    )}
                  </>
                )}
              </div>
            </Card>
          )}

          {/* Autorizações */}
          {data.autorizacoes && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  Autorizações
                </h3>
                {onEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditSection('authorizations')}
                    className="text-primary hover:text-primary/80"
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Editar
                  </Button>
                )}
              </div>
              <div className="text-sm space-y-1 text-muted-foreground">
                <p>
                  <strong>Uso Científico:</strong>{' '}
                  {data.autorizacoes.usoCientifico ? '✅ Sim' : '❌ Não'}
                </p>
                <p>
                  <strong>Uso Redes Sociais:</strong>{' '}
                  {data.autorizacoes.usoRedesSociais ? '✅ Sim' : '❌ Não'}
                </p>
                <p>
                  <strong>Uso do Nome:</strong>{' '}
                  {data.autorizacoes.usoNome ? '✅ Sim' : '❌ Não'}
                </p>
              </div>
            </Card>
          )}
        </div>

        {/* Observação final */}
        <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-900 dark:text-blue-100">
            <strong>📄 Próximo passo:</strong> Após confirmar, o contrato será
            gerado automaticamente com todos os dados informados.
          </p>
        </div>

        {/* Botão de confirmação */}
        <Button
          onClick={handleConfirm}
          size="lg"
          className="w-full h-12 text-sm font-semibold"
          disabled={loading}
        >
          {loading ? 'Gerando contrato...' : '✅ Confirmo e Gerar Contrato'}
        </Button>
      </div>
    );
  }
);

ReviewStep.displayName = 'ReviewStep';
