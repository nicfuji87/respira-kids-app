import React, { useState, useEffect, useCallback } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { Badge } from '@/components/primitives/badge';
import { PhoneInput } from '@/components/primitives/PhoneInput';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/primitives/dialog';
import {
  UserPlus,
  Check,
  AlertTriangle,
  Loader2,
  DollarSign,
  Database,
  Globe,
  Search,
  Users,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/primitives/use-toast';
import {
  validateWhatsAppOnly,
  findPersonByCpf,
  findPersonByPhone,
} from '@/lib/financial-responsible-api';
import {
  fetchAddressByCep,
  type EnderecoViaCepDataExtended,
} from '@/lib/enderecos-api';

// AI dev note: BillingResponsibleSelect - Componente UNIFICADO para gerenciar todos os responsáveis de um paciente
// Funcionalidades: listar responsáveis, alterar tipo (legal/financeiro/ambos), definir responsável de cobrança,
// buscar pessoa existente no sistema, cadastrar nova pessoa, remover responsáveis
// Este componente substitui o antigo ResponsibleSelect para evitar duplicação

export interface BillingResponsibleSelectProps {
  personId?: string; // ID do paciente (alias para patientId)
  patientId?: string; // ID do paciente para qual estamos gerenciando o responsável de cobrança
  currentBillingResponsibleId?: string; // ID do responsável atual (alias para currentResponsibleId)
  currentResponsibleId?: string; // ID do responsável atual
  currentResponsibleName?: string; // Nome do responsável atual (para exibição)
  className?: string;
  userRole?: string; // Role do usuário (não usado no componente, mas aceito para compatibilidade)
  onBillingResponsibleChange?: (responsibleId: string | null) => void;
  onUpdate?: () => void; // Callback após atualização (alias para onBillingResponsibleChange)
}

interface Pessoa {
  id: string;
  nome: string;
  email: string | null;
  telefone: bigint | null;
  cpf_cnpj: string | null;
  tipo_pessoa_nome: string | null;
}

interface ResponsavelAssociado {
  id: string;
  id_responsavel: string;
  nome: string;
  email: string | null;
  tipo_responsabilidade: 'legal' | 'financeiro' | 'ambos';
  // Dados de endereço
  cep: string | null;
  logradouro: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  numero_endereco: string | null;
  complemento_endereco: string | null;
}

export const BillingResponsibleSelect: React.FC<
  BillingResponsibleSelectProps
> = ({
  personId,
  patientId,
  currentBillingResponsibleId,
  currentResponsibleId,
  // currentResponsibleName não está sendo usado atualmente
  className,
  onBillingResponsibleChange,
  onUpdate,
}) => {
  // AI dev note: Aceitar tanto personId quanto patientId para compatibilidade
  const effectivePatientId = patientId || personId;
  const effectiveResponsibleId =
    currentResponsibleId || currentBillingResponsibleId;

  // Wrapper para callbacks - onUpdate não recebe parâmetros, onBillingResponsibleChange recebe
  const triggerCallback = useCallback(
    (responsibleId?: string | null) => {
      onUpdate?.();
      onBillingResponsibleChange?.(responsibleId || null);
    },
    [onUpdate, onBillingResponsibleChange]
  );

  // Responsáveis já associados ao paciente
  const [responsaveisAssociados, setResponsaveisAssociados] = useState<
    ResponsavelAssociado[]
  >([]);
  const [selectedResponsibleId, setSelectedResponsibleId] = useState<
    string | null
  >(effectiveResponsibleId || null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal de busca de responsável existente
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Pessoa[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Modal de criar novo responsável
  const [showAddModal, setShowAddModal] = useState(false);

  // Estados do formulário de novo responsável
  const [phone, setPhone] = useState('');
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');

  // Estados de validação
  const [isValidatingPhone, setIsValidatingPhone] = useState(false);
  const [phoneValid, setPhoneValid] = useState(false);
  const [validatedJid, setValidatedJid] = useState<string | null>(null); // AI dev note: JID completo retornado pela validação do WhatsApp
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [cepFound, setCepFound] = useState(false);
  const [cepSource, setCepSource] = useState<'supabase' | 'viacep' | null>(
    null
  );
  const [existingPersonId, setExistingPersonId] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [creatingPerson, setCreatingPerson] = useState(false);

  // Estado para usar endereço de responsável existente
  const [useExistingAddress, setUseExistingAddress] = useState<string | null>(
    null
  );

  // Estado para controlar remoção de responsável
  const [removingResponsibleId, setRemovingResponsibleId] = useState<
    string | null
  >(null);

  // AI dev note: Estado para tipo de responsabilidade selecionado nos modais de busca/criação
  const [selectedTipoResponsabilidade, setSelectedTipoResponsabilidade] =
    useState<'legal' | 'financeiro' | 'ambos'>('ambos');

  // Buscar responsáveis associados ao paciente
  const fetchResponsaveisAssociados = useCallback(async () => {
    if (!effectivePatientId) {
      setLoading(false);
      return;
    }

    try {
      // Buscar responsáveis já associados ao paciente com dados de endereço
      const { data: respData, error: respError } = await supabase
        .from('pessoa_responsaveis')
        .select(
          `
          id,
          id_responsavel,
          tipo_responsabilidade,
          responsavel:pessoas!pessoa_responsaveis_id_responsavel_fkey(
            id, 
            nome, 
            email,
            numero_endereco,
            complemento_endereco,
            endereco:enderecos!pessoas_id_endereco_fkey(
              cep,
              logradouro,
              bairro,
              cidade,
              estado
            )
          )
        `
        )
        .eq('id_pessoa', effectivePatientId)
        .eq('ativo', true);

      if (respError) {
        console.error('Erro ao carregar responsáveis associados:', respError);
      } else {
        const responsaveisFormatados = (respData || []).map((resp) => {
          const responsavel = resp.responsavel as unknown as {
            id: string;
            nome: string;
            email: string | null;
            numero_endereco: string | null;
            complemento_endereco: string | null;
            endereco: {
              cep: string;
              logradouro: string;
              bairro: string;
              cidade: string;
              estado: string;
            } | null;
          };
          return {
            id: resp.id,
            id_responsavel: resp.id_responsavel,
            nome: responsavel?.nome || 'Nome não encontrado',
            email: responsavel?.email || null,
            tipo_responsabilidade: resp.tipo_responsabilidade as
              | 'legal'
              | 'financeiro'
              | 'ambos',
            cep: responsavel?.endereco?.cep || null,
            logradouro: responsavel?.endereco?.logradouro || null,
            bairro: responsavel?.endereco?.bairro || null,
            cidade: responsavel?.endereco?.cidade || null,
            estado: responsavel?.endereco?.estado || null,
            numero_endereco: responsavel?.numero_endereco || null,
            complemento_endereco: responsavel?.complemento_endereco || null,
          };
        });
        setResponsaveisAssociados(responsaveisFormatados);
      }

      // Buscar dados do responsável atual
      if (effectiveResponsibleId) {
        const { data: responsibleData, error: responsibleError } =
          await supabase
            .from('vw_usuarios_admin')
            .select('id, nome, email, telefone, cpf_cnpj, tipo_pessoa_nome')
            .eq('id', effectiveResponsibleId)
            .maybeSingle();

        if (!responsibleError && responsibleData) {
          setSelectedResponsibleId(responsibleData.id);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [effectivePatientId, effectiveResponsibleId]);

  useEffect(() => {
    fetchResponsaveisAssociados();
  }, [fetchResponsaveisAssociados]);

  // Buscar pessoas por nome (para modal de busca)
  const handleSearchPessoas = useCallback(async () => {
    if (searchTerm.length < 3) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from('vw_usuarios_admin')
        .select('id, nome, email, telefone, cpf_cnpj, tipo_pessoa_nome')
        .ilike('nome', `%${searchTerm}%`)
        .order('nome')
        .limit(20);

      if (error) {
        console.error('Erro ao buscar pessoas:', error);
        setSearchResults([]);
      } else {
        setSearchResults(data || []);
      }
    } finally {
      setIsSearching(false);
    }
  }, [searchTerm]);

  // Debounce para busca
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchTerm.length >= 3) {
        handleSearchPessoas();
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, handleSearchPessoas]);

  // Preencher endereço quando selecionar usar endereço de responsável existente
  useEffect(() => {
    if (useExistingAddress) {
      const responsavel = responsaveisAssociados.find(
        (r) => r.id_responsavel === useExistingAddress
      );
      if (responsavel && responsavel.cep) {
        setCep(responsavel.cep);
        setLogradouro(responsavel.logradouro || '');
        setBairro(responsavel.bairro || '');
        setCidade(responsavel.cidade || '');
        setEstado(responsavel.estado || '');
        setNumero(responsavel.numero_endereco || '');
        setComplemento(responsavel.complemento_endereco || '');
        setCepFound(true);
        setCepSource('supabase');
      }
    } else {
      // Limpar campos de endereço quando desmarcar
      setCep('');
      setLogradouro('');
      setBairro('');
      setCidade('');
      setEstado('');
      setNumero('');
      setComplemento('');
      setCepFound(false);
      setCepSource(null);
    }
  }, [useExistingAddress, responsaveisAssociados]);

  // Validar telefone (WhatsApp)
  useEffect(() => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 11) {
      setPhoneValid(false);
      setValidatedJid(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsValidatingPhone(true);

      try {
        const result = await validateWhatsAppOnly(phone);
        setPhoneValid(result.exists);

        if (!result.exists) {
          setErrors((prev) => ({ ...prev, phone: 'WhatsApp inválido' }));
          setValidatedJid(null);
        } else {
          setErrors((prev) => ({ ...prev, phone: '' }));

          // AI dev note: Salvar o JID completo retornado pela API do WhatsApp
          // O JID é o número antes do @ (ex: 5511999999999)
          if (result.jid) {
            // Remover o @s.whatsapp.net ou qualquer sufixo se existir
            const jidNumber = result.jid.split('@')[0];
            setValidatedJid(jidNumber);
            console.log('📱 JID validado:', jidNumber);
          }

          // Buscar se pessoa já existe por telefone
          const existingPerson = await findPersonByPhone(cleanPhone);
          if (existingPerson) {
            setExistingPersonId(existingPerson.id);
            setNome(existingPerson.nome);
            setCpf(existingPerson.cpf_cnpj || '');
            setEmail(existingPerson.email || '');
          }
        }
      } catch (error) {
        console.error('Erro ao validar WhatsApp:', error);
        setErrors((prev) => ({ ...prev, phone: 'Erro ao validar' }));
        setValidatedJid(null);
      } finally {
        setIsValidatingPhone(false);
      }
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [phone]);

  // Buscar pessoa por CPF
  useEffect(() => {
    const cleanCpf = cpf.replace(/\D/g, '');
    if (cleanCpf.length !== 11) return;

    const timeoutId = setTimeout(async () => {
      try {
        const existingPerson = await findPersonByCpf(cleanCpf);
        if (existingPerson) {
          setExistingPersonId(existingPerson.id);
          setNome(existingPerson.nome);
          setEmail(existingPerson.email || '');
          setPhone(
            existingPerson.telefone ? existingPerson.telefone.toString() : ''
          );
        }
      } catch (error) {
        console.error('Erro ao buscar por CPF:', error);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [cpf]);

  // Handler para buscar CEP
  const handleSearchCep = useCallback(async () => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    setIsSearchingCep(true);
    setErrors((prev) => ({ ...prev, cep: '' }));

    try {
      const result = await fetchAddressByCep(cep);

      if (result.success && result.data) {
        const addressData: EnderecoViaCepDataExtended = result.data;
        setLogradouro(addressData.logradouro);
        setBairro(addressData.bairro);
        setCidade(addressData.cidade);
        setEstado(addressData.estado);
        setCepFound(true);
        setCepSource(addressData.source);
      } else {
        setErrors((prev) => ({ ...prev, cep: 'CEP não encontrado' }));
        setCepFound(false);
        setCepSource(null);
      }
    } catch (error) {
      console.error('Erro ao buscar CEP:', error);
      setErrors((prev) => ({ ...prev, cep: 'Erro ao buscar CEP' }));
      setCepFound(false);
      setCepSource(null);
    } finally {
      setIsSearchingCep(false);
    }
  }, [cep]);

  // Auto-buscar CEP quando completo
  useEffect(() => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      handleSearchCep();
    }
  }, [cep, handleSearchCep]);

  // Validar formulário
  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!phoneValid) newErrors.phone = 'Telefone WhatsApp válido é obrigatório';
    if (!nome.trim()) newErrors.nome = 'Nome é obrigatório';
    if (cpf.replace(/\D/g, '').length !== 11) newErrors.cpf = 'CPF inválido';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const hasSpecialChars = /[àáâãäåèéêëìíîïòóôõöùúûü]/i.test(email);

    if (!emailRegex.test(email)) {
      newErrors.email = 'E-mail inválido';
    } else if (hasSpecialChars) {
      newErrors.email =
        'E-mail não pode conter caracteres especiais (ã, ç, é, etc)';
    }

    if (cep.replace(/\D/g, '').length !== 8) newErrors.cep = 'CEP inválido';
    if (!logradouro.trim()) newErrors.logradouro = 'Logradouro é obrigatório';
    if (!numero.trim()) newErrors.numero = 'Número é obrigatório';
    if (!bairro.trim()) newErrors.bairro = 'Bairro é obrigatório';
    if (!cidade.trim()) newErrors.cidade = 'Cidade é obrigatória';
    if (!estado.trim()) newErrors.estado = 'Estado é obrigatório';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [
    phoneValid,
    nome,
    cpf,
    email,
    cep,
    logradouro,
    numero,
    bairro,
    cidade,
    estado,
  ]);

  // Handler para selecionar responsável do dropdown (associados)
  const handleSelectResponsible = async (responsibleId: string) => {
    if (!effectivePatientId) return;

    // Valor especial para abrir modal de busca
    if (responsibleId === '__SEARCH_OTHER__') {
      setShowSearchModal(true);
      return;
    }

    // Valor especial para abrir modal de cadastro
    if (responsibleId === '__ADD_NEW__') {
      setShowAddModal(true);
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('pessoas')
        .update({ responsavel_cobranca_id: responsibleId })
        .eq('id', effectivePatientId);

      if (error) {
        console.error('Erro ao atualizar responsável:', error);
        toast({
          title: 'Erro ao atualizar responsável',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Responsável pela cobrança atualizado',
      });

      setSelectedResponsibleId(responsibleId);
      triggerCallback(responsibleId);
    } finally {
      setSaving(false);
    }
  };

  // Handler para selecionar pessoa do modal de busca
  const handleSelectFromSearch = async (pessoa: Pessoa) => {
    if (!effectivePatientId) return;

    setSaving(true);
    try {
      // AI dev note: Verificar se já existe registro (ativo ou inativo) para evitar 409 Conflict
      // na constraint UNIQUE (id_pessoa, id_responsavel)
      const { data: existingAssoc } = await supabase
        .from('pessoa_responsaveis')
        .select('id, ativo, tipo_responsabilidade')
        .eq('id_pessoa', effectivePatientId)
        .eq('id_responsavel', pessoa.id)
        .maybeSingle();

      // AI dev note: Usar o tipo selecionado pelo usuário no modal de busca
      if (existingAssoc) {
        if (!existingAssoc.ativo) {
          // Inativo - reativar com o tipo selecionado
          await supabase
            .from('pessoa_responsaveis')
            .update({
              ativo: true,
              tipo_responsabilidade: selectedTipoResponsabilidade,
              data_inicio: new Date().toISOString().split('T')[0],
              data_fim: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingAssoc.id);
        } else if (
          existingAssoc.tipo_responsabilidade !== selectedTipoResponsabilidade
        ) {
          // Ativo mas tipo diferente - atualizar
          await supabase
            .from('pessoa_responsaveis')
            .update({
              tipo_responsabilidade: selectedTipoResponsabilidade,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingAssoc.id);
        }
      } else {
        // Não existe - criar associação com o tipo selecionado
        await supabase.from('pessoa_responsaveis').insert({
          id_pessoa: effectivePatientId,
          id_responsavel: pessoa.id,
          tipo_responsabilidade: selectedTipoResponsabilidade,
          ativo: true,
        });
      }

      // Se o tipo inclui financeiro, definir como responsável de cobrança
      const tipoInclui =
        selectedTipoResponsabilidade === 'financeiro' ||
        selectedTipoResponsabilidade === 'ambos';
      if (tipoInclui) {
        const { error } = await supabase
          .from('pessoas')
          .update({ responsavel_cobranca_id: pessoa.id })
          .eq('id', effectivePatientId);

        if (error) {
          console.error('Erro ao atualizar responsável de cobrança:', error);
        } else {
          setSelectedResponsibleId(pessoa.id);
          triggerCallback(pessoa.id);
        }
      }

      toast({
        title: 'Responsável adicionado',
        description: `${pessoa.nome} foi vinculado ao paciente`,
      });

      setShowSearchModal(false);
      setSearchTerm('');
      setSearchResults([]);
      setSelectedTipoResponsabilidade('ambos');

      // Recarregar responsáveis associados
      await fetchResponsaveisAssociados();
    } finally {
      setSaving(false);
    }
  };

  // AI dev note: Handler para alterar o tipo de responsabilidade de um responsável já associado
  const handleChangeTipo = async (
    responsavelAssocId: string,
    novoTipo: 'legal' | 'financeiro' | 'ambos'
  ) => {
    try {
      const { error } = await supabase
        .from('pessoa_responsaveis')
        .update({
          tipo_responsabilidade: novoTipo,
          updated_at: new Date().toISOString(),
        })
        .eq('id', responsavelAssocId);

      if (error) {
        console.error('Erro ao alterar tipo:', error);
        toast({
          title: 'Erro ao alterar tipo de responsabilidade',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Tipo de responsabilidade atualizado',
      });

      await fetchResponsaveisAssociados();
    } catch (error) {
      console.error('Erro ao alterar tipo:', error);
    }
  };

  // AI dev note: Função para desassociar um responsável do paciente (soft delete via ativo = false)
  // AI dev note: A tabela pessoa_responsaveis usa id_pessoa (não id_paciente) para referenciar o paciente
  const handleRemoveResponsible = async (responsibleId: string) => {
    if (!effectivePatientId) return;

    setRemovingResponsibleId(responsibleId);
    try {
      // Desativar a associação (soft delete)
      const { error } = await supabase
        .from('pessoa_responsaveis')
        .update({ ativo: false })
        .eq('id_pessoa', effectivePatientId)
        .eq('id_responsavel', responsibleId);

      if (error) {
        console.error('Erro ao desassociar responsável:', error);
        toast({
          title: 'Erro ao desassociar responsável',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      // Se o responsável removido era o responsável de cobrança, limpar essa referência
      if (selectedResponsibleId === responsibleId) {
        const { error: updateError } = await supabase
          .from('pessoas')
          .update({ responsavel_cobranca_id: null })
          .eq('id', effectivePatientId);

        if (updateError) {
          console.error('Erro ao limpar responsável de cobrança:', updateError);
        }

        setSelectedResponsibleId(null);
        triggerCallback(null);
      }

      toast({
        title: 'Responsável desassociado',
        description: 'O responsável foi removido da lista do paciente',
      });

      // Recarregar responsáveis associados
      await fetchResponsaveisAssociados();
    } finally {
      setRemovingResponsibleId(null);
    }
  };

  // Handler para criar nova pessoa e definir como responsável
  const handleCreateAndSetResponsible = async () => {
    if (!effectivePatientId || !validateForm()) return;

    // Se pessoa já existe, apenas vincular
    if (existingPersonId) {
      const pessoa: Pessoa = {
        id: existingPersonId,
        nome: nome.trim(),
        email: email.trim(),
        telefone: null,
        cpf_cnpj: cpf.replace(/\D/g, ''),
        tipo_pessoa_nome: null,
      };
      await handleSelectFromSearch(pessoa);
      resetForm();
      setShowAddModal(false);
      return;
    }

    setCreatingPerson(true);
    try {
      // 1. Buscar tipo pessoa "responsavel"
      const { data: tipoPessoa, error: tipoPessoaError } = await supabase
        .from('pessoa_tipos')
        .select('id')
        .eq('codigo', 'responsavel')
        .maybeSingle();

      if (tipoPessoaError || !tipoPessoa) {
        throw new Error('Tipo de pessoa "responsavel" não encontrado');
      }

      // 2. Criar ou buscar endereço
      const cleanCep = cep.replace(/\D/g, '');
      let enderecoId: string;

      // Verificar se CEP já existe
      const { data: existingEndereco } = await supabase
        .from('enderecos')
        .select('id')
        .eq('cep', cleanCep)
        .maybeSingle();

      if (existingEndereco) {
        enderecoId = existingEndereco.id;
      } else {
        // Criar novo endereço
        const { data: newEndereco, error: enderecoError } = await supabase
          .from('enderecos')
          .insert({
            cep: cleanCep,
            logradouro,
            bairro,
            cidade,
            estado,
          })
          .select('id')
          .single();

        if (enderecoError) {
          throw new Error(`Erro ao criar endereço: ${enderecoError.message}`);
        }
        enderecoId = newEndereco.id;
      }

      // 3. Criar nova pessoa
      // AI dev note: Usar o JID completo retornado pela validação do WhatsApp
      // O JID já vem no formato correto (ex: 5511999999999) da API
      if (!validatedJid) {
        throw new Error(
          'JID do WhatsApp não disponível. Por favor, aguarde a validação do telefone.'
        );
      }

      // AI dev note: Gerar UUID antes para poder definir responsavel_cobranca_id como self-reference
      // Responsáveis apontam para si mesmos como responsável de cobrança
      const newPersonId = crypto.randomUUID();

      const { data: novaPessoa, error: pessoaError } = await supabase
        .from('pessoas')
        .insert({
          id: newPersonId,
          nome: nome.trim(),
          cpf_cnpj: cpf.replace(/\D/g, ''),
          email: email.trim(),
          telefone: validatedJid,
          id_tipo_pessoa: tipoPessoa.id,
          id_endereco: enderecoId,
          numero_endereco: numero,
          complemento_endereco: complemento || null,
          ativo: true,
          is_approved: true,
          responsavel_cobranca_id: newPersonId, // Self-reference: responsável é seu próprio responsável de cobrança
        })
        .select('id')
        .single();

      if (pessoaError) {
        throw new Error(`Erro ao criar pessoa: ${pessoaError.message}`);
      }

      // 4. Adicionar como responsável na tabela pessoa_responsaveis com o tipo selecionado
      await supabase.from('pessoa_responsaveis').insert({
        id_pessoa: effectivePatientId,
        id_responsavel: novaPessoa.id,
        tipo_responsabilidade: selectedTipoResponsabilidade,
        ativo: true,
      });

      // 5. Se inclui financeiro, definir como responsável de cobrança
      const tipoInclui =
        selectedTipoResponsabilidade === 'financeiro' ||
        selectedTipoResponsabilidade === 'ambos';
      if (tipoInclui) {
        const { error: updateError } = await supabase
          .from('pessoas')
          .update({ responsavel_cobranca_id: novaPessoa.id })
          .eq('id', effectivePatientId);

        if (updateError) {
          console.error(
            'Erro ao definir responsável de cobrança:',
            updateError
          );
        }
      }

      const tipoLabel =
        selectedTipoResponsabilidade === 'legal'
          ? 'legal'
          : selectedTipoResponsabilidade === 'financeiro'
            ? 'financeiro'
            : 'legal e financeiro';

      toast({
        title: 'Responsável criado e vinculado',
        description: `${nome.trim()} foi cadastrado como responsável ${tipoLabel}`,
      });

      // Atualizar lista e estado
      await fetchResponsaveisAssociados();
      setSelectedResponsibleId(novaPessoa.id);
      triggerCallback(novaPessoa.id);
      resetForm();
      setShowAddModal(false);
    } catch (error) {
      console.error('Erro ao criar responsável:', error);
      toast({
        title: 'Erro ao criar responsável',
        description:
          error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setCreatingPerson(false);
    }
  };

  // Limpar formulário
  const resetForm = () => {
    setPhone('');
    setNome('');
    setCpf('');
    setEmail('');
    setCep('');
    setLogradouro('');
    setNumero('');
    setComplemento('');
    setBairro('');
    setCidade('');
    setEstado('');
    setPhoneValid(false);
    setValidatedJid(null);
    setCepFound(false);
    setCepSource(null);
    setExistingPersonId(undefined);
    setErrors({});
    setUseExistingAddress(null);
    setSelectedTipoResponsabilidade('ambos');
  };

  if (!effectivePatientId) {
    return (
      <div className={cn('space-y-2', className)}>
        <p className="text-sm text-muted-foreground">
          Carregando dados do paciente...
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="space-y-3">
          {/* AI dev note: Lista unificada de responsáveis com: tipo editável, indicador de cobrança, e ações */}
          {responsaveisAssociados.length > 0 ? (
            <div className="space-y-2">
              {responsaveisAssociados.map((resp) => (
                <div
                  key={resp.id_responsavel}
                  className={cn(
                    'flex items-center justify-between p-3 border rounded-lg gap-2',
                    selectedResponsibleId === resp.id_responsavel
                      ? 'bg-primary/5 border-primary/30'
                      : 'bg-muted/30'
                  )}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 min-w-0">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm">
                        {resp.nome}
                      </p>
                      {resp.email && (
                        <p className="text-xs text-muted-foreground truncate">
                          {resp.email}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Select inline para alterar tipo de responsabilidade */}
                      <Select
                        value={resp.tipo_responsabilidade}
                        onValueChange={(
                          value: 'legal' | 'financeiro' | 'ambos'
                        ) => handleChangeTipo(resp.id, value)}
                      >
                        <SelectTrigger className="h-7 w-auto min-w-[120px] text-xs px-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="legal">Legal</SelectItem>
                          <SelectItem value="financeiro">Financeiro</SelectItem>
                          <SelectItem value="ambos">
                            Legal e Financeiro
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {selectedResponsibleId === resp.id_responsavel && (
                        <Badge variant="default" className="text-xs shrink-0">
                          <DollarSign className="h-3 w-3 mr-1" />
                          Cobrança
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Botão para definir como responsável de cobrança */}
                    {selectedResponsibleId !== resp.id_responsavel && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() =>
                          handleSelectResponsible(resp.id_responsavel)
                        }
                        disabled={saving}
                        title="Definir como responsável de cobrança"
                      >
                        <DollarSign className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() =>
                        handleRemoveResponsible(resp.id_responsavel)
                      }
                      disabled={removingResponsibleId === resp.id_responsavel}
                      title="Desassociar responsável"
                    >
                      {removingResponsibleId === resp.id_responsavel ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum responsável cadastrado
            </p>
          )}

          {/* Botões para adicionar responsáveis */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowSearchModal(true)}
              disabled={saving}
            >
              <Search className="h-4 w-4 mr-2" />
              Buscar existente
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddModal(true)}
              disabled={saving}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Cadastrar novo
            </Button>
          </div>
        </div>
      )}

      {/* Modal de busca de responsável existente */}
      <Dialog open={showSearchModal} onOpenChange={setShowSearchModal}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Buscar Responsável
            </DialogTitle>
            <DialogDescription>
              Digite o nome do responsável para buscar no sistema
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Tipo de responsabilidade para o novo vínculo */}
            <div className="space-y-2">
              <Label>Tipo de Responsabilidade</Label>
              <Select
                value={selectedTipoResponsabilidade}
                onValueChange={(value: 'legal' | 'financeiro' | 'ambos') =>
                  setSelectedTipoResponsabilidade(value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="legal">Legal</SelectItem>
                  <SelectItem value="financeiro">Financeiro</SelectItem>
                  <SelectItem value="ambos">Legal e Financeiro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Campo de busca */}
            <div className="space-y-2">
              <Label htmlFor="search">Nome do responsável</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Digite pelo menos 3 caracteres..."
                  className="pl-9"
                />
              </div>
            </div>

            {/* Resultados da busca */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {isSearching && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="ml-2 text-sm text-muted-foreground">
                    Buscando...
                  </span>
                </div>
              )}

              {!isSearching &&
                searchTerm.length >= 3 &&
                searchResults.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum resultado encontrado
                  </p>
                )}

              {!isSearching &&
                searchResults.map((pessoa) => (
                  <button
                    key={pessoa.id}
                    onClick={() => handleSelectFromSearch(pessoa)}
                    disabled={saving}
                    className="w-full p-3 border rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <p className="font-medium">{pessoa.nome}</p>
                    {pessoa.email && (
                      <p className="text-xs text-muted-foreground">
                        {pessoa.email}
                      </p>
                    )}
                    {pessoa.cpf_cnpj && (
                      <p className="text-xs text-muted-foreground">
                        CPF:{' '}
                        {pessoa.cpf_cnpj.replace(
                          /(\d{3})(\d{3})(\d{3})(\d{2})/,
                          '$1.$2.$3-$4'
                        )}
                      </p>
                    )}
                  </button>
                ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowSearchModal(false);
                setSearchTerm('');
                setSearchResults([]);
              }}
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para cadastrar novo responsável */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Cadastrar Novo Responsável
            </DialogTitle>
            <DialogDescription>
              Cadastre uma nova pessoa como responsável do paciente
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Tipo de responsabilidade */}
            <div className="space-y-2">
              <Label>Tipo de Responsabilidade *</Label>
              <Select
                value={selectedTipoResponsabilidade}
                onValueChange={(value: 'legal' | 'financeiro' | 'ambos') =>
                  setSelectedTipoResponsabilidade(value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="legal">Legal</SelectItem>
                  <SelectItem value="financeiro">Financeiro</SelectItem>
                  <SelectItem value="ambos">Legal e Financeiro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Alerta se pessoa existe */}
            {existingPersonId && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <Check className="h-4 w-4" />
                  <span>
                    Pessoa já cadastrada no sistema. Clique em "Vincular" para
                    usar esta pessoa.
                  </span>
                </div>
              </div>
            )}

            {/* Telefone */}
            <div className="space-y-2">
              <Label htmlFor="phone">WhatsApp *</Label>
              <PhoneInput
                value={phone}
                onChange={setPhone}
                placeholder="(00) 00000-0000"
                disabled={isValidatingPhone}
              />
              {isValidatingPhone && (
                <p className="text-xs text-muted-foreground animate-pulse">
                  Validando...
                </p>
              )}
              {phoneValid && (
                <div className="flex items-center gap-2 text-xs text-green-600">
                  <Check className="h-3 w-3" />
                  <span>WhatsApp válido</span>
                </div>
              )}
              {errors.phone && (
                <div className="flex items-center gap-2 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  <span>{errors.phone}</span>
                </div>
              )}
            </div>

            {/* Nome */}
            <div className="space-y-2">
              <Label htmlFor="nome">Nome completo *</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome completo"
              />
              {errors.nome && (
                <p className="text-xs text-destructive">{errors.nome}</p>
              )}
            </div>

            {/* CPF */}
            <div className="space-y-2">
              <Label htmlFor="cpf">CPF *</Label>
              <Input
                id="cpf"
                value={cpf}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  const formatted = value.replace(
                    /(\d{3})(\d{3})(\d{3})(\d{2})/,
                    '$1.$2.$3-$4'
                  );
                  setCpf(formatted);
                }}
                placeholder="000.000.000-00"
                maxLength={14}
              />
              {errors.cpf && (
                <p className="text-xs text-destructive">{errors.cpf}</p>
              )}
            </div>

            {/* E-mail */}
            <div className="space-y-2">
              <Label htmlFor="email">E-mail *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email}</p>
              )}
            </div>

            {/* Opção de usar endereço de responsável existente */}
            {responsaveisAssociados.filter((r) => r.cep).length > 0 && (
              <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                <Label>Usar endereço de responsável já cadastrado</Label>
                <Select
                  value={useExistingAddress || ''}
                  onValueChange={(value) =>
                    setUseExistingAddress(
                      value === '__NEW_ADDRESS__' ? null : value
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Informar novo endereço" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__NEW_ADDRESS__">
                      <span>Informar novo endereço</span>
                    </SelectItem>
                    {responsaveisAssociados
                      .filter((r) => r.cep)
                      .map((resp) => (
                        <SelectItem
                          key={resp.id_responsavel}
                          value={resp.id_responsavel}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{resp.nome}</span>
                            <span className="text-xs text-muted-foreground">
                              {resp.logradouro}, {resp.numero_endereco} -{' '}
                              {resp.bairro}, {resp.cidade}/{resp.estado}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* CEP */}
            <div className="space-y-2">
              <Label htmlFor="cep">CEP *</Label>
              <div className="flex gap-2 items-center">
                <Input
                  id="cep"
                  value={cep}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    const formatted = value.replace(/^(\d{5})(\d)/, '$1-$2');
                    setCep(formatted);
                  }}
                  placeholder="00000-000"
                  maxLength={9}
                  disabled={!!useExistingAddress}
                />
                {isSearchingCep && (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                )}
                {cepFound && <Check className="h-5 w-5 text-green-600" />}
              </div>
              {errors.cep && (
                <p className="text-xs text-destructive">{errors.cep}</p>
              )}
              {cepFound && !useExistingAddress && (
                <div className="space-y-1">
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    {logradouro && bairro
                      ? 'Endereço encontrado. Informe apenas o número e complemento.'
                      : 'Endereço encontrado. Preencha os campos vazios manualmente.'}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {cepSource === 'supabase' ? (
                      <>
                        <Database className="h-3 w-3" />
                        Dados do sistema
                      </>
                    ) : (
                      <>
                        <Globe className="h-3 w-3" />
                        Dados do ViaCEP
                      </>
                    )}
                  </p>
                </div>
              )}
              {useExistingAddress && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Usando endereço do responsável selecionado
                </p>
              )}
            </div>

            {/* Logradouro */}
            <div className="space-y-2">
              <Label htmlFor="logradouro">Logradouro *</Label>
              <Input
                id="logradouro"
                value={logradouro}
                onChange={(e) => setLogradouro(e.target.value)}
                placeholder="Rua, Avenida, etc"
                disabled={
                  !!useExistingAddress ||
                  (cepFound && (cepSource === 'supabase' || logradouro !== ''))
                }
              />
              {errors.logradouro && (
                <p className="text-xs text-destructive">{errors.logradouro}</p>
              )}
            </div>

            {/* Número e Complemento */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="numero">Número *</Label>
                <Input
                  id="numero"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  placeholder="123"
                  disabled={!!useExistingAddress}
                />
                {errors.numero && (
                  <p className="text-xs text-destructive">{errors.numero}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="complemento">Complemento</Label>
                <Input
                  id="complemento"
                  value={complemento}
                  onChange={(e) => setComplemento(e.target.value)}
                  placeholder="Apto, Bloco, etc"
                  disabled={!!useExistingAddress}
                />
              </div>
            </div>

            {/* Bairro */}
            <div className="space-y-2">
              <Label htmlFor="bairro">Bairro *</Label>
              <Input
                id="bairro"
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
                placeholder="Bairro"
                disabled={
                  !!useExistingAddress ||
                  (cepFound && (cepSource === 'supabase' || bairro !== ''))
                }
              />
              {errors.bairro && (
                <p className="text-xs text-destructive">{errors.bairro}</p>
              )}
            </div>

            {/* Cidade e Estado */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cidade">Cidade *</Label>
                <Input
                  id="cidade"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  placeholder="Cidade"
                  disabled={
                    !!useExistingAddress ||
                    (cepFound && (cepSource === 'supabase' || cidade !== ''))
                  }
                />
                {errors.cidade && (
                  <p className="text-xs text-destructive">{errors.cidade}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="estado">Estado *</Label>
                <Input
                  id="estado"
                  value={estado}
                  onChange={(e) => setEstado(e.target.value.toUpperCase())}
                  placeholder="UF"
                  maxLength={2}
                  disabled={
                    !!useExistingAddress ||
                    (cepFound && (cepSource === 'supabase' || estado !== ''))
                  }
                />
                {errors.estado && (
                  <p className="text-xs text-destructive">{errors.estado}</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                setShowAddModal(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreateAndSetResponsible}
              disabled={
                creatingPerson ||
                isValidatingPhone ||
                (!phoneValid && !existingPersonId)
              }
            >
              {creatingPerson ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : existingPersonId ? (
                'Vincular Pessoa Existente'
              ) : (
                'Cadastrar e Vincular'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

BillingResponsibleSelect.displayName = 'BillingResponsibleSelect';
