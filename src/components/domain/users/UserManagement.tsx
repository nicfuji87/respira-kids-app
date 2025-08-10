import React, { useState, useEffect, useCallback } from 'react';
import { Edit, User, Phone, Mail, Calendar, Save, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from '@/components/primitives/avatar';
import { Badge } from '@/components/primitives/badge';
import { Textarea } from '@/components/primitives/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/primitives/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { useToast } from '@/components/primitives/use-toast';
import {
  UserSearch,
  UserFilters,
  UserMetrics,
  GenericTable,
  TypePersonSelect,
  AddressSelect,
  ResponsibleSelect,
  StatusBadge,
} from '@/components/composed';
import type {
  Usuario,
  UsuarioFilters,
  UsuarioMetrics as UsuarioMetricsType,
  UsuarioUpdate,
  PaginatedUsuarios,
} from '@/types/usuarios';
import {
  fetchUsuarios,
  fetchUsuarioMetrics,
  updateUsuario,
} from '@/lib/usuarios-api';
import { cn } from '@/lib/utils';

// AI dev note: Gerencia CRUD completo de usuários com modal de edição detalhado

export interface UserManagementProps {
  className?: string;
}

export const UserManagement = React.memo<UserManagementProps>(
  ({ className }) => {
    const [usuarios, setUsuarios] = useState<PaginatedUsuarios | null>(null);
    const [metrics, setMetrics] = useState<UsuarioMetricsType | null>(null);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState<UsuarioFilters>({});
    const [currentPage, setCurrentPage] = useState(1);
    const [editingUser, setEditingUser] = useState<Usuario | null>(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [updating, setUpdating] = useState(false);

    const { toast } = useToast();

    // Form para edição
    const form = useForm<UsuarioUpdate>();

    // Buscar dados
    const loadData = useCallback(async () => {
      setLoading(true);
      try {
        const [usuariosResult, metricsResult] = await Promise.all([
          fetchUsuarios(filters, currentPage),
          fetchUsuarioMetrics(),
        ]);

        if (usuariosResult.success) {
          setUsuarios(usuariosResult.data);
        } else {
          toast({
            title: 'Erro ao carregar usuários',
            description: usuariosResult.error,
            variant: 'destructive',
          });
        }

        if (metricsResult.success) {
          setMetrics(metricsResult.data);
        }
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
        toast({
          title: 'Erro inesperado',
          description: 'Falha ao carregar dados dos usuários',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    }, [filters, currentPage, toast]);

    // Carregar dados quando filtros, busca ou página mudarem
    useEffect(() => {
      loadData();
    }, [filters, currentPage, loadData]);

    // Reset página quando filtros mudam (mas não quando currentPage muda)
    useEffect(() => {
      if (currentPage !== 1) {
        setCurrentPage(1);
      }
    }, [filters, currentPage]);

    const handleEditUser = (usuario: Usuario) => {
      

      setEditingUser(usuario);
      form.reset({
        nome: usuario.nome || '',
        email: usuario.email || '',
        telefone: usuario.telefone || undefined,
        cpf_cnpj: usuario.cpf_cnpj || '',
        data_nascimento: usuario.data_nascimento
          ? new Date(usuario.data_nascimento).toISOString().split('T')[0]
          : '',
        role: usuario.role || undefined,
        registro_profissional: usuario.registro_profissional || '',
        especialidade: usuario.especialidade || '',
        bio_profissional: usuario.bio_profissional || '',
        numero_endereco: usuario.numero_endereco || '',
        complemento_endereco: usuario.complemento_endereco || '',
        id_endereco: usuario.endereco_id || undefined,
        id_tipo_pessoa: usuario.tipo_pessoa_id || undefined,
      });

      
      setShowEditModal(true);

      // Verificar se o estado mudou após um pequeno delay
      setTimeout(() => {
        
      }, 100);
    };

    const handleUpdateUser = async (data: UsuarioUpdate) => {
      if (!editingUser) return;

      setUpdating(true);
      try {
        // Converter data_nascimento se fornecida
        const updateData = { ...data };
        if (data.data_nascimento) {
          updateData.data_nascimento = data.data_nascimento;
        }

        const result = await updateUsuario(editingUser.id, updateData);
        if (result.success) {
          toast({
            title: 'Usuário atualizado com sucesso',
          });
          setShowEditModal(false);
          setEditingUser(null);
          loadData();
        } else {
          toast({
            title: 'Erro ao atualizar usuário',
            description: result.error,
            variant: 'destructive',
          });
        }
      } finally {
        setUpdating(false);
      }
    };

    // Colunas da tabela
    const columns = [
      {
        key: 'avatar',
        label: '',
        className: 'w-12',
        render: (usuario: Usuario) => (
          <Avatar className="h-8 w-8">
            <AvatarImage src={usuario.foto_perfil || ''} />
            <AvatarFallback className="text-xs">
              {usuario.nome?.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ),
      },
      {
        key: 'nome',
        label: 'Nome',
        render: (usuario: Usuario) => (
          <div>
            <div className="font-medium">{usuario.nome}</div>
            <div className="text-xs text-muted-foreground">
              {usuario.tipo_pessoa_nome}
            </div>
          </div>
        ),
      },
      {
        key: 'contato',
        label: 'Contato',
        render: (usuario: Usuario) => (
          <div className="space-y-1">
            {usuario.email && (
              <div className="flex items-center text-xs">
                <Mail className="h-3 w-3 mr-1" />
                {usuario.email}
              </div>
            )}
            {usuario.telefone && (
              <div className="flex items-center text-xs">
                <Phone className="h-3 w-3 mr-1" />
                {usuario.telefone}
              </div>
            )}
          </div>
        ),
      },
      {
        key: 'role',
        label: 'Função',
        render: (usuario: Usuario) =>
          usuario.role ? (
            <Badge variant="outline" className="capitalize">
              {usuario.role}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">Não definida</span>
          ),
      },
      {
        key: 'status',
        label: 'Status',
        render: (usuario: Usuario) => (
          <div className="space-y-1">
            <StatusBadge ativo={usuario.ativo} />
            {!usuario.is_approved && (
              <Badge
                variant="outline"
                className="text-amber-600 border-amber-200"
              >
                Pendente
              </Badge>
            )}
            {usuario.bloqueado && (
              <Badge variant="destructive">Bloqueado</Badge>
            )}
          </div>
        ),
      },
      {
        key: 'created_at',
        label: 'Cadastro',
        render: (usuario: Usuario) => (
          <div className="flex items-center text-xs">
            <Calendar className="h-3 w-3 mr-1" />
            {new Date(usuario.created_at).toLocaleDateString('pt-BR')}
          </div>
        ),
      },
      {
        key: 'actions',
        label: 'Editar',
        className: 'w-20',
        render: (usuario: Usuario) => (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              
              handleEditUser(usuario);
            }}
          >
            <Edit className="h-3 w-3" />
          </Button>
        ),
      },
    ];

    return (
      <div className={cn('space-y-6', className)}>
        {/* Métricas */}
        <UserMetrics metrics={metrics} loading={loading} />

        {/* Busca e Filtros */}
        <div className="flex flex-col md:flex-row gap-4">
          <UserSearch
            value={filters.busca || ''}
            onChange={(value) => setFilters({ ...filters, busca: value })}
            className="flex-1"
          />
          <UserFilters filters={filters} onChange={setFilters} />
        </div>

        {/* Tabela - SEM campo de busca interno */}
        <GenericTable
          title="Usuários do Sistema"
          description="Gerencie todos os usuários cadastrados na plataforma"
          data={usuarios?.data || []}
          columns={columns}
          loading={loading}
          emptyMessage="Nenhum usuário encontrado"
          showSearch={false}
        />

        {/* Modal de Edição Detalhado */}
        <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
          <DialogContent className="max-w-[95vw] sm:max-w-2xl lg:max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Detalhes do Usuário
              </DialogTitle>
              <DialogDescription>
                Visualize e edite as informações do usuário selecionado
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleUpdateUser)}
                className="space-y-6 px-1"
              >
                {/* Informações Pessoais */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Informações Pessoais
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="nome"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nome Completo *</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input {...field} type="email" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="telefone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Telefone</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="tel"
                                value={field.value || ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  field.onChange(
                                    value ? Number(value) : undefined
                                  );
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="cpf_cnpj"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>CPF/CNPJ</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="data_nascimento"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Data de Nascimento</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value || ''}
                                type="date"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="role"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Função no Sistema</FormLabel>
                            <Select
                              value={field.value || ''}
                              onValueChange={field.onChange}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione uma função" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="secretaria">
                                  Secretaria
                                </SelectItem>
                                <SelectItem value="medico_pediatra">
                                  Médico Pediatra
                                </SelectItem>
                                <SelectItem value="fonoaudiologo">
                                  Fonoaudiólogo
                                </SelectItem>
                                <SelectItem value="psicologo">
                                  Psicólogo
                                </SelectItem>
                                <SelectItem value="nutricionista">
                                  Nutricionista
                                </SelectItem>
                                <SelectItem value="fisioterapeuta">
                                  Fisioterapeuta
                                </SelectItem>
                                <SelectItem value="terapeuta_ocupacional">
                                  Terapeuta Ocupacional
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Informações Profissionais */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Informações Profissionais
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="registro_profissional"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Registro Profissional</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value || ''}
                                placeholder="Ex: CREFITO 123456-F"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="especialidade"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Especialidade</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="bio_profissional"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Biografia Profissional</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              value={field.value || ''}
                              placeholder="Descreva a experiência e formação profissional..."
                              rows={3}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Tipo de Pessoa */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Tipo de Pessoa</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TypePersonSelect
                      value={form.watch('id_tipo_pessoa') || ''}
                      onValueChange={(value) =>
                        form.setValue('id_tipo_pessoa', value)
                      }
                      disabled={updating}
                    />
                  </CardContent>
                </Card>

                {/* Endereço */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Endereço</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <AddressSelect
                      value={form.watch('id_endereco') || ''}
                      onValueChange={(value) =>
                        form.setValue('id_endereco', value)
                      }
                      disabled={updating}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="numero_endereco"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Número</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="complemento_endereco"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Complemento</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value || ''}
                                placeholder="Apto, bloco, sala..."
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Responsáveis (só para pacientes) */}
                {editingUser?.tipo_pessoa_codigo === 'paciente' && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Responsáveis</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsibleSelect personId={editingUser?.id} />
                    </CardContent>
                  </Card>
                )}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowEditModal(false)}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={updating}>
                    <Save className="h-4 w-4 mr-2" />
                    {updating ? 'Salvando...' : 'Salvar Alterações'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
);

UserManagement.displayName = 'UserManagement';
