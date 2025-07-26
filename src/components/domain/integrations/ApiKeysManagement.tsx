import React, { useState, useEffect } from 'react';
import { Key, Plus, Shield, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Switch } from '@/components/primitives/switch';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { useToast } from '@/components/primitives/use-toast';
import type { ApiKey, ServiceConfig } from '@/types/integrations';
import { SUPPORTED_SERVICES } from '@/types/integrations';
import {
  fetchApiKeys,
  createApiKey,
  updateApiKey,
  checkAdminRole,
} from '@/lib/integrations-api';
import { cn } from '@/lib/utils';

// AI dev note: ApiKeysManagement é um componente Domain para gerenciar chaves de API
// Foca na segurança e não exposição de chaves sensíveis no frontend
// Agora usa API real com verificação de role admin

export interface ApiKeysManagementProps {
  className?: string;
}

export const ApiKeysManagement = React.memo<ApiKeysManagementProps>(
  ({ className }) => {
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
    const [selectedService, setSelectedService] = useState<string>('');
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
    const [saving, setSaving] = useState(false);

    const { toast } = useToast();

    // Verificar se o usuário é admin e carregar dados
    useEffect(() => {
      const loadData = async () => {
        setLoading(true);
        try {
          // Primeiro verificar se é admin
          const adminCheck = await checkAdminRole();

          if (!adminCheck.success) {
            toast({
              title: 'Erro de autenticação',
              description: adminCheck.error || 'Erro ao verificar permissões',
              variant: 'destructive',
            });
            setIsAdmin(false);
            setLoading(false);
            return;
          }

          setIsAdmin(adminCheck.data || false);

          if (!adminCheck.data) {
            setLoading(false);
            return; // Não carregar dados se não for admin
          }

          // Carregar chaves de API se for admin
          const keysResult = await fetchApiKeys();

          if (keysResult.success && keysResult.data) {
            setApiKeys(keysResult.data.data);
          } else {
            toast({
              title: 'Erro ao carregar chaves de API',
              description:
                keysResult.error ||
                'Falha ao carregar configurações de integração',
              variant: 'destructive',
            });
          }
        } catch (error) {
          console.error('❌ Erro ao carregar dados:', error);
          toast({
            title: 'Erro inesperado',
            description: 'Falha ao carregar dados das integrações',
            variant: 'destructive',
          });
        } finally {
          setLoading(false);
        }
      };

      loadData();
    }, [toast]);

    const handleCreateKey = async () => {
      if (!selectedService) return;

      setSaving(true);
      try {
        const serviceConfig = SUPPORTED_SERVICES[selectedService];
        const createData = {
          service_name: selectedService as 'openai' | 'asaas' | 'evolution',
          encrypted_key: formData.api_key || '', // A API irá criptografar
          is_active: true,
          ...(formData.service_url && { service_url: formData.service_url }),
          ...(formData.instance_name && {
            instance_name: formData.instance_name,
          }),
        };

        const result = await createApiKey(createData);

        if (result.success && result.data) {
          toast({
            title: 'Chave de API criada',
            description: `Integração com ${serviceConfig.label} configurada com sucesso`,
          });

          // Recarregar lista
          const keysResult = await fetchApiKeys();
          if (keysResult.success && keysResult.data) {
            setApiKeys(keysResult.data.data);
          }

          // Reset form
          setFormData({});
          setSelectedService('');
          setShowCreateModal(false);
        } else {
          toast({
            title: 'Erro ao criar chave de API',
            description:
              result.error || 'Falha ao salvar configuração de integração',
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error('❌ Erro ao criar chave:', error);
        toast({
          title: 'Erro ao criar chave de API',
          description: 'Falha ao salvar configuração de integração',
          variant: 'destructive',
        });
      } finally {
        setSaving(false);
      }
    };

    const handleEditKey = (apiKey: ApiKey) => {
      setEditingKey(apiKey);
      setSelectedService(apiKey.service_name);

      // Pré-popular formulário com dados existentes (exceto chave sensível)
      const serviceConfig = SUPPORTED_SERVICES[apiKey.service_name];
      const initialData: Record<string, string> = {};

      serviceConfig.fields.forEach((field) => {
        if (field.name === 'service_url' && apiKey.service_url) {
          initialData[field.name] = apiKey.service_url;
        } else if (field.name === 'instance_name' && apiKey.instance_name) {
          initialData[field.name] = apiKey.instance_name;
        } else if (field.name === 'api_key') {
          initialData[field.name] = ''; // Não pré-popular chave sensível
        }
      });

      setFormData(initialData);
      setShowEditModal(true);
    };

    const handleUpdateKey = async () => {
      if (!editingKey) return;

      setSaving(true);
      try {
        const updateData: Record<string, string | boolean> = {};

        // Só atualizar campos que foram preenchidos
        if (formData.api_key && formData.api_key.trim() !== '') {
          updateData.encrypted_key = formData.api_key; // A API irá criptografar
        }
        if (formData.service_url !== undefined) {
          updateData.service_url = formData.service_url;
        }
        if (formData.instance_name !== undefined) {
          updateData.instance_name = formData.instance_name;
        }

        const result = await updateApiKey(editingKey.id, updateData);

        if (result.success && result.data) {
          toast({
            title: 'Chave de API atualizada',
            description: `Integração com ${SUPPORTED_SERVICES[editingKey.service_name].label} atualizada com sucesso`,
          });

          // Recarregar lista
          const keysResult = await fetchApiKeys();
          if (keysResult.success && keysResult.data) {
            setApiKeys(keysResult.data.data);
          }

          // Reset form
          setFormData({});
          setEditingKey(null);
          setSelectedService('');
          setShowEditModal(false);
        } else {
          toast({
            title: 'Erro ao atualizar chave de API',
            description:
              result.error || 'Falha ao atualizar configuração de integração',
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error('❌ Erro ao atualizar chave:', error);
        toast({
          title: 'Erro ao atualizar chave de API',
          description: 'Falha ao atualizar configuração de integração',
          variant: 'destructive',
        });
      } finally {
        setSaving(false);
      }
    };

    const toggleKeyStatus = async (apiKey: ApiKey) => {
      try {
        const result = await updateApiKey(apiKey.id, {
          is_active: !apiKey.is_active,
        });

        if (result.success) {
          toast({
            title: `Integração ${apiKey.is_active ? 'desativada' : 'ativada'}`,
            description: `${SUPPORTED_SERVICES[apiKey.service_name].label} ${apiKey.is_active ? 'desativado' : 'ativado'} com sucesso`,
          });

          // Atualizar estado local
          setApiKeys((keys) =>
            keys.map((key) =>
              key.id === apiKey.id ? { ...key, is_active: !key.is_active } : key
            )
          );
        } else {
          toast({
            title: 'Erro ao alterar status',
            description:
              result.error || 'Falha ao alterar status da integração',
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error('❌ Erro ao alterar status:', error);
        toast({
          title: 'Erro ao alterar status',
          description: 'Falha ao alterar status da integração',
          variant: 'destructive',
        });
      }
    };

    const toggleShowKey = (keyId: string) => {
      setShowKeys((prev) => ({
        ...prev,
        [keyId]: !prev[keyId],
      }));
    };

    const renderServiceCard = (serviceKey: string, config: ServiceConfig) => {
      const existingKey = apiKeys.find(
        (key) => key.service_name === serviceKey
      );

      return (
        <Card key={serviceKey} className="relative">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Key className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">{config.label}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {config.description}
                  </p>
                </div>
              </div>

              {existingKey && (
                <div className="flex items-center gap-2">
                  <Badge
                    variant={existingKey.is_active ? 'default' : 'secondary'}
                  >
                    {existingKey.is_active ? 'Ativo' : 'Inativo'}
                  </Badge>
                  <Switch
                    checked={existingKey.is_active}
                    onCheckedChange={() => toggleKeyStatus(existingKey)}
                  />
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            {existingKey ? (
              <div className="space-y-3">
                {/* Mostrar campos configurados */}
                {config.fields.map((field) => (
                  <div key={field.name} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {field.label}
                    </Label>
                    <div className="flex items-center gap-2">
                      {field.type === 'password' ? (
                        <div className="flex-1 flex items-center gap-2">
                          <Input
                            type={
                              showKeys[existingKey.id] ? 'text' : 'password'
                            }
                            value={
                              showKeys[existingKey.id]
                                ? existingKey.encrypted_key
                                : '••••••••••••••••'
                            }
                            readOnly
                            className="font-mono text-sm"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleShowKey(existingKey.id)}
                          >
                            {showKeys[existingKey.id] ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      ) : (
                        <Input
                          value={
                            field.name === 'service_url'
                              ? existingKey.service_url || ''
                              : field.name === 'instance_name'
                                ? existingKey.instance_name || ''
                                : ''
                          }
                          readOnly
                          className="flex-1"
                        />
                      )}
                    </div>
                  </div>
                ))}

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditKey(existingKey)}
                    className="flex-1"
                  >
                    Editar Configuração
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-3">
                  Integração não configurada
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedService(serviceKey);
                    setShowCreateModal(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Configurar {config.label}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      );
    };

    const renderFormModal = (isEdit = false) => {
      const serviceConfig = selectedService
        ? SUPPORTED_SERVICES[selectedService]
        : null;
      if (!serviceConfig) return null;

      return (
        <Dialog
          open={isEdit ? showEditModal : showCreateModal}
          onOpenChange={isEdit ? setShowEditModal : setShowCreateModal}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                {isEdit ? 'Editar' : 'Configurar'} {serviceConfig.label}
              </DialogTitle>
              <DialogDescription>
                {isEdit
                  ? 'Atualize as configurações da integração'
                  : 'Configure a integração com segurança'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {serviceConfig.fields.map((field) => (
                <div key={field.name} className="space-y-2">
                  <Label htmlFor={field.name}>
                    {field.label}
                    {field.required && (
                      <span className="text-destructive ml-1">*</span>
                    )}
                  </Label>
                  <Input
                    id={field.name}
                    type={field.type}
                    placeholder={field.placeholder}
                    value={formData[field.name] || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        [field.name]: e.target.value,
                      }))
                    }
                    required={field.required}
                  />
                  {field.description && (
                    <p className="text-xs text-muted-foreground">
                      {field.description}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setFormData({});
                  setSelectedService('');
                  if (isEdit) {
                    setEditingKey(null);
                    setShowEditModal(false);
                  } else {
                    setShowCreateModal(false);
                  }
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={isEdit ? handleUpdateKey : handleCreateKey}
                disabled={saving || !Object.entries(formData).length}
              >
                {saving ? 'Salvando...' : isEdit ? 'Atualizar' : 'Configurar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    };

    if (loading) {
      return (
        <div className={cn('space-y-6', className)}>
          <div className="text-center py-8">
            <p className="text-muted-foreground">Carregando integrações...</p>
          </div>
        </div>
      );
    }

    if (!isAdmin) {
      return (
        <div className={cn('space-y-6', className)}>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Você não tem permissão para gerenciar chaves de API. Por favor,
              entre em contato com o administrador.
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    return (
      <div className={cn('space-y-6', className)}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Chaves de API</h2>
            <p className="text-sm text-muted-foreground">
              Configure integrações com serviços externos de forma segura
            </p>
          </div>
        </div>

        {/* Alert de Segurança */}
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-orange-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-orange-800">
                  Segurança das Chaves
                </h3>
                <p className="text-sm text-orange-700 mt-1">
                  Todas as chaves de API são criptografadas e armazenadas com
                  segurança. Nunca compartilhe suas chaves e mantenha-as
                  atualizadas.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cards dos Serviços */}
        <div className="grid gap-6">
          {Object.entries(SUPPORTED_SERVICES).map(([key, config]) =>
            renderServiceCard(key, config)
          )}
        </div>

        {/* Modais */}
        {renderFormModal(false)}
        {renderFormModal(true)}
      </div>
    );
  }
);

ApiKeysManagement.displayName = 'ApiKeysManagement';
