import React from 'react';
import { Button } from '@/components/primitives/button';
import { Card } from '@/components/primitives/card';
import { CheckCircle, Edit } from 'lucide-react';
import { cn, formatDateBR } from '@/lib/utils';
import { formatCPF } from '@/lib/profile';
import type { AdminPatientData } from '@/lib/admin-patient-registration-api';

// AI dev note: AdminReviewStep - Revisão do cadastro administrativo ANTES de
// criar o paciente no banco. Versão enxuta do ReviewStep público, adaptada ao
// shape Partial<AdminPatientData> do dialog. O paciente só é criado após o
// clique em "Confirmar cadastro".

export type AdminReviewEditStep =
  | 'whatsapp'
  | 'responsible-data'
  | 'address'
  | 'patient-data'
  | 'financial-responsible'
  | 'pediatrician'
  | 'authorizations';

export interface AdminReviewStepProps {
  data: Partial<AdminPatientData>;
  onConfirm: () => void;
  onBack: () => void;
  onEdit: (step: AdminReviewEditStep) => void;
  className?: string;
}

interface SectionProps {
  title: string;
  editStep?: AdminReviewEditStep;
  onEdit?: (step: AdminReviewEditStep) => void;
  badge?: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({
  title,
  editStep,
  onEdit,
  badge,
  children,
}) => (
  <Card className="p-4 space-y-3">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-600" />
          {title}
        </h3>
        {badge && (
          <span className="text-xs font-medium text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-300 px-2 py-1 rounded">
            {badge}
          </span>
        )}
      </div>
      {editStep && onEdit && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(editStep)}
          className="text-primary hover:text-primary/80 shrink-0"
        >
          <Edit className="w-4 h-4 mr-1" />
          Editar
        </Button>
      )}
    </div>
    <div className="text-sm space-y-1 text-muted-foreground">{children}</div>
  </Card>
);

const formatWhatsApp = (phone?: string): string => {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone || '';
};

export const AdminReviewStep: React.FC<AdminReviewStepProps> = ({
  data,
  onConfirm,
  onBack,
  onEdit,
  className,
}) => {
  const responsavelExistente = !!data.responsavelId;
  const enderecoExistente = !!data.enderecoId;

  return (
    <div className={cn('w-full space-y-6', className)}>
      {/* Título */}
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-foreground">
          Revisar Cadastro
        </h2>
        <p className="text-sm text-muted-foreground">
          Confira os dados abaixo. O paciente só será criado após a confirmação.
        </p>
      </div>

      <div className="space-y-4">
        {/* Responsável Legal */}
        <Section
          title="Responsável"
          badge={responsavelExistente ? 'Cadastrado' : undefined}
          editStep={responsavelExistente ? 'whatsapp' : 'responsible-data'}
          onEdit={onEdit}
        >
          {data.nomeResponsavel && (
            <p>
              <strong>Nome:</strong> {data.nomeResponsavel}
            </p>
          )}
          {data.cpfResponsavel && (
            <p>
              <strong>CPF:</strong> {formatCPF(data.cpfResponsavel)}
            </p>
          )}
          {data.emailResponsavel && (
            <p>
              <strong>Email:</strong> {data.emailResponsavel}
            </p>
          )}
          {data.whatsappResponsavel && (
            <p>
              <strong>WhatsApp:</strong>{' '}
              {formatWhatsApp(data.whatsappResponsavel)}
            </p>
          )}
        </Section>

        {/* Endereço */}
        {(data.cep || data.logradouro) && (
          <Section
            title="Endereço"
            badge={enderecoExistente ? 'Cadastrado' : undefined}
            editStep={enderecoExistente ? undefined : 'address'}
            onEdit={onEdit}
          >
            {data.cep && (
              <p>
                <strong>CEP:</strong> {data.cep}
              </p>
            )}
            {data.logradouro && (
              <p>
                <strong>Logradouro:</strong> {data.logradouro}
                {data.numeroEndereco ? `, ${data.numeroEndereco}` : ''}
                {data.complementoEndereco
                  ? ` — ${data.complementoEndereco}`
                  : ''}
              </p>
            )}
            {data.bairro && (
              <p>
                <strong>Bairro:</strong> {data.bairro}
              </p>
            )}
            {data.cidade && data.estado && (
              <p>
                <strong>Cidade/UF:</strong> {data.cidade} - {data.estado}
              </p>
            )}
          </Section>
        )}

        {/* Paciente */}
        <Section title="Paciente" editStep="patient-data" onEdit={onEdit}>
          <p>
            <strong>Nome:</strong> {data.nomePaciente || '—'}
          </p>
          {data.dataNascimentoPaciente && (
            <p>
              <strong>Data de Nascimento:</strong>{' '}
              {formatDateBR(data.dataNascimentoPaciente)}
            </p>
          )}
          {data.sexoPaciente && (
            <p>
              <strong>Sexo:</strong>{' '}
              {data.sexoPaciente === 'M' ? 'Masculino' : 'Feminino'}
            </p>
          )}
          {data.cpfPaciente && (
            <p>
              <strong>CPF:</strong> {formatCPF(data.cpfPaciente)}
            </p>
          )}
          {data.emailPaciente && (
            <p>
              <strong>Email:</strong> {data.emailPaciente}
            </p>
          )}
          <p>
            <strong>Endereço:</strong>{' '}
            {data.usarEnderecoResponsavel
              ? 'Mesmo do responsável'
              : 'Endereço próprio'}
          </p>
        </Section>

        {/* Responsável Financeiro */}
        <Section
          title="Responsável Financeiro"
          editStep="financial-responsible"
          onEdit={onEdit}
        >
          <p>
            {data.isResponsavelFinanceiroIgualLegal !== false
              ? 'Mesmo que o responsável legal'
              : 'Outra pessoa (já cadastrada no sistema)'}
          </p>
        </Section>

        {/* Pediatra */}
        <Section title="Pediatra" editStep="pediatrician" onEdit={onEdit}>
          {data.noPediatrician ? (
            <p>Não possui pediatra</p>
          ) : (
            <>
              <p>
                <strong>Nome:</strong> {data.pediatraNome || '—'}
              </p>
              {data.pediatraCrm && (
                <p>
                  <strong>CRM:</strong> {data.pediatraCrm}
                </p>
              )}
              {data.pediatraIsNew && (
                <p className="text-xs italic">
                  Novo pediatra (será cadastrado)
                </p>
              )}
            </>
          )}
        </Section>

        {/* Autorizações */}
        <Section title="Autorizações" editStep="authorizations" onEdit={onEdit}>
          <p>
            <strong>Uso científico:</strong>{' '}
            {data.autorizacoes?.uso_imagem_tratamento ? 'Sim' : 'Não'}
          </p>
          <p>
            <strong>Uso em redes sociais:</strong>{' '}
            {data.autorizacoes?.uso_imagem_marketing ? 'Sim' : 'Não'}
          </p>
          <p>
            <strong>Uso do nome:</strong>{' '}
            {data.autorizacoes?.compartilhamento_equipe ? 'Sim' : 'Não'}
          </p>
        </Section>
      </div>

      {/* Botões */}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          size="lg"
          className="flex-1 h-12 text-base"
        >
          Voltar
        </Button>
        <Button
          onClick={onConfirm}
          size="lg"
          className="flex-1 h-12 text-base font-semibold"
        >
          Confirmar cadastro
        </Button>
      </div>
    </div>
  );
};

AdminReviewStep.displayName = 'AdminReviewStep';
