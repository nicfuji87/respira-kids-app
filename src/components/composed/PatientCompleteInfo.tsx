import React, { useState, useRef } from 'react';
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
  RefreshCw,
  Upload,
  Camera,
  MessageCircle,
  Trash2,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/primitives/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { useToast } from '@/components/primitives/use-toast';
import { cn, formatDateBR } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import type { PatientPersonalInfoProps } from '@/types/patient-details';
import { BillingResponsibleSelect } from './BillingResponsibleSelect';
import { PatientPediatriciansSection } from './PatientPediatriciansSection';

// AI dev note: PatientCompleteInfo - Component Composed que une informações pessoais, contato, endereço, responsáveis e consentimentos
// Substitui múltiplos cards por um único card organizado em seções

export const PatientCompleteInfo = React.memo<PatientPersonalInfoProps>(
  ({ patient, userRole, className, onResponsibleClick }) => {
    const [isUpdatingPhoto, setIsUpdatingPhoto] = useState(false);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
    const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(
      patient.foto_perfil || null
    );
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    // 🔍 DEBUG: Verificar dados dos responsáveis
    console.log('🔍 [DEBUG] PatientCompleteInfo dados:', {
      patient_id: patient.id,
      patient_nome: patient.nome,
      responsavel_legal_id: patient.responsavel_legal_id,
      responsavel_legal_nome: patient.responsavel_legal_nome,
      responsavel_financeiro_id: patient.responsavel_financeiro_id,
      responsavel_financeiro_nome: patient.responsavel_financeiro_nome,
      onResponsibleClick: !!onResponsibleClick,
    });

    // AI dev note: Verificar se tem telefone para buscar foto do WhatsApp
    const hasPhone = !!(patient.telefone || patient.responsavel_legal_telefone);

    // AI dev note: Função para disparar webhook de atualização de foto do WhatsApp
    const handleUpdatePhotoFromWhatsApp = async () => {
      if (!hasPhone) {
        toast({
          title: 'Telefone não cadastrado',
          description:
            'Esta pessoa não possui telefone cadastrado para buscar a foto do WhatsApp.',
          variant: 'destructive',
        });
        return;
      }

      try {
        setIsUpdatingPhoto(true);

        // AI dev note: Disparar webhook padrão para atualização de foto
        // O webhook será processado pelo sistema e enviado para a URL configurada
        const { error: webhookError } = await supabase
          .from('webhook_queue')
          .insert({
            evento: 'atualizar_foto_perfil_whatsapp',
            payload: {
              pessoa_id: patient.id,
              pessoa_nome: patient.nome,
              telefone:
                patient.telefone || patient.responsavel_legal_telefone || null,
              foto_perfil_atual: patient.foto_perfil || null,
              timestamp: new Date().toISOString(),
            },
            status: 'pendente',
            tentativas: 0,
            max_tentativas: 3,
          });

        if (webhookError) {
          console.error('❌ Erro ao criar webhook:', webhookError);
          throw new Error('Erro ao solicitar atualização da foto');
        }

        toast({
          title: 'Atualização solicitada',
          description:
            'A foto do WhatsApp será atualizada em alguns instantes.',
          variant: 'default',
        });
        setIsPhotoModalOpen(false);
      } catch (error) {
        console.error('Erro ao solicitar atualização de foto:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível solicitar a atualização da foto.',
          variant: 'destructive',
        });
      } finally {
        setIsUpdatingPhoto(false);
      }
    };

    // AI dev note: Função para upload manual de foto
    const handleManualPhotoUpload = async (
      event: React.ChangeEvent<HTMLInputElement>
    ) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Validar tipo de arquivo
      if (!file.type.startsWith('image/')) {
        toast({
          title: 'Arquivo inválido',
          description: 'Por favor, selecione uma imagem (JPG, PNG, etc).',
          variant: 'destructive',
        });
        return;
      }

      // Validar tamanho (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        toast({
          title: 'Arquivo muito grande',
          description: 'A imagem deve ter no máximo 2MB.',
          variant: 'destructive',
        });
        return;
      }

      try {
        setIsUploadingPhoto(true);

        // Definir caminho no bucket
        const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const filePath = `${patient.id}/profile.${fileExt}`;

        // Upload para o bucket respira-profiles
        const { error: uploadError } = await supabase.storage
          .from('respira-profiles')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: true,
          });

        if (uploadError) {
          console.error('❌ Erro no upload:', uploadError);
          throw new Error('Erro ao fazer upload da foto');
        }

        // Obter URL pública
        const {
          data: { publicUrl },
        } = supabase.storage.from('respira-profiles').getPublicUrl(filePath);

        // Adicionar timestamp para forçar refresh do cache
        const urlWithTimestamp = `${publicUrl}?t=${Date.now()}`;

        // Atualizar campo foto_perfil na tabela pessoas
        const { error: updateError } = await supabase
          .from('pessoas')
          .update({
            foto_perfil: publicUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', patient.id);

        if (updateError) {
          console.error('❌ Erro ao atualizar pessoa:', updateError);
          throw new Error('Erro ao salvar a foto no cadastro');
        }

        // Atualizar estado local
        setCurrentPhotoUrl(urlWithTimestamp);

        toast({
          title: 'Foto atualizada',
          description: 'A foto de perfil foi atualizada com sucesso.',
          variant: 'default',
        });
        setIsPhotoModalOpen(false);
      } catch (error) {
        console.error('Erro ao fazer upload da foto:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível atualizar a foto.',
          variant: 'destructive',
        });
      } finally {
        setIsUploadingPhoto(false);
        // Limpar input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };

    // AI dev note: Função para remover foto
    const handleRemovePhoto = async () => {
      try {
        setIsUploadingPhoto(true);

        // Atualizar campo foto_perfil para null
        const { error: updateError } = await supabase
          .from('pessoas')
          .update({
            foto_perfil: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', patient.id);

        if (updateError) {
          console.error('❌ Erro ao remover foto:', updateError);
          throw new Error('Erro ao remover a foto');
        }

        // Atualizar estado local
        setCurrentPhotoUrl(null);

        toast({
          title: 'Foto removida',
          description: 'A foto de perfil foi removida com sucesso.',
          variant: 'default',
        });
        setIsPhotoModalOpen(false);
      } catch (error) {
        console.error('Erro ao remover foto:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível remover a foto.',
          variant: 'destructive',
        });
      } finally {
        setIsUploadingPhoto(false);
      }
    };

    // AI dev note: Extrair iniciais do nome para fallback do avatar
    const getInitials = (name: string): string => {
      return name
        .split(' ')
        .map((word) => word.charAt(0))
        .join('')
        .substring(0, 2)
        .toUpperCase();
    };

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
          {/* Seção: Avatar clicável para abrir modal */}
          <div className="flex items-center gap-4">
            <div className="relative">
              {/* AI dev note: Avatar clicável - abre modal para visualização e edição */}
              <button
                type="button"
                onClick={() => setIsPhotoModalOpen(true)}
                className={cn(
                  'relative rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                  'transition-transform duration-200 hover:scale-105',
                  (userRole === 'admin' || userRole === 'secretaria') &&
                    'cursor-pointer'
                )}
                disabled={userRole === 'profissional'}
                aria-label="Ver ou alterar foto de perfil"
              >
                <Avatar className="h-20 w-20 ring-2 ring-border">
                  {currentPhotoUrl ? (
                    <AvatarImage
                      src={currentPhotoUrl}
                      alt={patient.nome}
                      className="object-cover"
                    />
                  ) : (
                    <AvatarFallback className="bg-muted text-lg font-semibold">
                      {getInitials(patient.nome)}
                    </AvatarFallback>
                  )}
                </Avatar>

                {/* AI dev note: Ícone de câmera indicando que é editável - apenas admin/secretaria */}
                {(userRole === 'admin' || userRole === 'secretaria') && (
                  <div
                    className={cn(
                      'absolute -bottom-1 -right-1 rounded-full p-1',
                      'bg-primary text-primary-foreground shadow-sm',
                      'border-2 border-background'
                    )}
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </div>
                )}
              </button>
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold truncate">{patient.nome}</h3>
              {patient.sexo && (
                <p className="text-sm text-muted-foreground">
                  {patient.sexo === 'M'
                    ? 'Masculino'
                    : patient.sexo === 'F'
                      ? 'Feminino'
                      : 'Outro'}
                </p>
              )}
            </div>
          </div>

          {/* AI dev note: Modal de visualização e edição da foto de perfil */}
          <Dialog open={isPhotoModalOpen} onOpenChange={setIsPhotoModalOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  Foto de Perfil
                </DialogTitle>
              </DialogHeader>

              <div className="flex flex-col items-center gap-6 py-4">
                {/* Foto em tamanho maior */}
                <div className="relative">
                  <Avatar className="h-40 w-40 ring-4 ring-border">
                    {currentPhotoUrl ? (
                      <AvatarImage
                        src={currentPhotoUrl}
                        alt={patient.nome}
                        className="object-cover"
                      />
                    ) : (
                      <AvatarFallback className="bg-muted text-4xl font-semibold">
                        {getInitials(patient.nome)}
                      </AvatarFallback>
                    )}
                  </Avatar>
                </div>

                <p className="text-center text-sm text-muted-foreground">
                  {patient.nome}
                </p>

                {/* Botões de ação - apenas admin/secretaria */}
                {(userRole === 'admin' || userRole === 'secretaria') && (
                  <div className="flex flex-col gap-3 w-full">
                    {/* Input de arquivo oculto */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleManualPhotoUpload}
                      className="hidden"
                      id="photo-upload-input"
                    />

                    {/* Botão: Enviar foto manualmente */}
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingPhoto || isUpdatingPhoto}
                    >
                      {isUploadingPhoto ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Enviar foto do computador
                    </Button>

                    {/* Botão: Buscar do WhatsApp - só aparece se tiver telefone */}
                    {hasPhone && (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full gap-2"
                        onClick={handleUpdatePhotoFromWhatsApp}
                        disabled={isUploadingPhoto || isUpdatingPhoto}
                      >
                        {isUpdatingPhoto ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <MessageCircle className="h-4 w-4" />
                        )}
                        Buscar foto do WhatsApp
                      </Button>
                    )}

                    {/* Botão: Remover foto - só aparece se tiver foto */}
                    {currentPhotoUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={handleRemovePhoto}
                        disabled={isUploadingPhoto || isUpdatingPhoto}
                      >
                        <Trash2 className="h-4 w-4" />
                        Remover foto
                      </Button>
                    )}

                    {/* Texto informativo */}
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      Formatos aceitos: JPG, PNG, WebP (máx. 2MB)
                    </p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

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
                    {/* AI dev note: Usar formatDateBR para evitar bug de timezone */}
                    Nascimento: {formatDateBR(patient.data_nascimento)}
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

          {/* Seção: Responsáveis - sempre exibida */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Responsáveis
            </h4>
            <div className="space-y-4">
              {!patient.responsavel_legal_nome &&
              !patient.responsavel_financeiro_nome ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum responsável cadastrado
                </p>
              ) : sameResponsible && patient.responsavel_legal_nome ? (
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
                    {onResponsibleClick ? (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log(
                            '🔍 [DEBUG] Click no Responsável Legal (mesmo):',
                            {
                              responsavelLegalId: patient.responsavel_legal_id,
                              onResponsibleClick: !!onResponsibleClick,
                            }
                          );
                          if (patient.responsavel_legal_id) {
                            onResponsibleClick(patient.responsavel_legal_id);
                          } else {
                            console.warn(
                              '⚠️ responsavel_legal_id não disponível'
                            );
                          }
                        }}
                        className="h-auto p-0 text-left justify-start font-medium cursor-pointer text-sm"
                      >
                        {patient.responsavel_legal_nome}
                      </Button>
                    ) : (
                      <p className="text-sm font-medium">
                        {patient.responsavel_legal_nome}
                      </p>
                    )}
                    {patient.responsavel_legal_email &&
                      userRole !== 'profissional' && (
                        <p className="text-sm text-muted-foreground">
                          📧 {patient.responsavel_legal_email}
                        </p>
                      )}
                    {patient.responsavel_legal_telefone &&
                      userRole !== 'profissional' && (
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
                        {onResponsibleClick ? (
                          <Button
                            variant="link"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log(
                                '🔍 [DEBUG] Click no Responsável Legal (separado):',
                                {
                                  responsavelLegalId:
                                    patient.responsavel_legal_id,
                                  onResponsibleClick: !!onResponsibleClick,
                                }
                              );
                              if (patient.responsavel_legal_id) {
                                onResponsibleClick(
                                  patient.responsavel_legal_id
                                );
                              } else {
                                console.warn(
                                  '⚠️ responsavel_legal_id não disponível'
                                );
                              }
                            }}
                            className="h-auto p-0 text-left justify-start font-medium cursor-pointer text-sm"
                          >
                            {patient.responsavel_legal_nome}
                          </Button>
                        ) : (
                          <p className="text-sm font-medium">
                            {patient.responsavel_legal_nome}
                          </p>
                        )}
                        {patient.responsavel_legal_email &&
                          userRole !== 'profissional' && (
                            <p className="text-sm text-muted-foreground">
                              📧 {patient.responsavel_legal_email}
                            </p>
                          )}
                        {patient.responsavel_legal_telefone &&
                          userRole !== 'profissional' && (
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
                        {onResponsibleClick ? (
                          <Button
                            variant="link"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log(
                                '🔍 [DEBUG] Click no Responsável Financeiro:',
                                {
                                  responsavelFinanceiroId:
                                    patient.responsavel_financeiro_id,
                                  onResponsibleClick: !!onResponsibleClick,
                                }
                              );
                              if (patient.responsavel_financeiro_id) {
                                onResponsibleClick(
                                  patient.responsavel_financeiro_id
                                );
                              } else {
                                console.warn(
                                  '⚠️ responsavel_financeiro_id não disponível'
                                );
                              }
                            }}
                            className="h-auto p-0 text-left justify-start font-medium cursor-pointer text-sm"
                          >
                            {patient.responsavel_financeiro_nome}
                          </Button>
                        ) : (
                          <p className="text-sm font-medium">
                            {patient.responsavel_financeiro_nome}
                          </p>
                        )}
                        {patient.responsavel_financeiro_email &&
                          userRole !== 'profissional' && (
                            <p className="text-sm text-muted-foreground">
                              📧 {patient.responsavel_financeiro_email}
                            </p>
                          )}
                        {patient.responsavel_financeiro_telefone &&
                          userRole !== 'profissional' && (
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

          {/* Seção: Responsável pela Cobrança - apenas admin/secretaria */}
          {(userRole === 'admin' || userRole === 'secretaria') && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Responsável pela Cobrança
              </h4>
              <BillingResponsibleSelect
                patientId={patient.id}
                currentResponsibleId={patient.responsavel_cobranca_id}
                currentResponsibleName={patient.responsavel_cobranca_nome}
                userRole={userRole}
                onUpdate={() => {
                  // AI dev note: Em implementação futura, poderia atualizar o estado local
                  // ou disparar um callback para atualizar os dados do paciente
                }}
              />
            </div>
          )}

          {/* Seção: Médicos Pediatras - Gerenciável */}
          <PatientPediatriciansSection patientId={patient.id} />

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
