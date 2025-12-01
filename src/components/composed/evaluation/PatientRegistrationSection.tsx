import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Baby,
  Stethoscope,
  UserPlus,
  Check,
  X,
  Loader2,
  Save,
} from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/primitives/use-toast';

// AI dev note: PatientRegistrationSection - Gerencia pai/mãe, pediatra e obstetra
// Permite selecionar responsáveis existentes como pai/mãe e editar seus dados

interface ResponsavelCompleto {
  id: string;
  nome: string;
  cpf_cnpj?: string | null;
  data_nascimento?: string | null;
  profissao?: string | null;
}

interface Pediatra {
  id: string;
  pessoa_id: string;
  nome: string;
  crm?: string | null;
  especialidade?: string | null;
}

interface Obstetra {
  id: string;
  pessoa_id: string;
  nome: string;
  crm?: string | null;
  especialidade?: string | null;
}

interface PatientRegistrationSectionProps {
  patientId: string;
  patientName?: string;
  avaliacaoObstetraId?: string | null;
  onObstetraChange: (obstetraId: string | null) => void;
  isReadOnly: boolean;
}

const NOVO_RESPONSAVEL_ID = '__novo__';

// AI dev note: Funções utilitárias movidas para fora do componente para evitar recriação a cada render

// Função para calcular idade em anos
const calcularIdadeAnos = (
  dataNascimento: string | null | undefined
): number | null => {
  if (!dataNascimento) return null;
  const nascimento = new Date(dataNascimento);
  if (isNaN(nascimento.getTime())) return null;

  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const mesAtual = hoje.getMonth();
  const mesNascimento = nascimento.getMonth();

  if (
    mesAtual < mesNascimento ||
    (mesAtual === mesNascimento && hoje.getDate() < nascimento.getDate())
  ) {
    idade--;
  }

  return idade >= 0 ? idade : null;
};

// Função para formatar data de yyyy-mm-dd para dd/mm/yyyy
const formatarDataExibicao = (data: string | null | undefined): string => {
  if (!data) return '';
  const partes = data.split('-');
  if (partes.length !== 3) return data;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
};

// AI dev note: Componente ResponsavelFields movido para FORA do componente pai
// Isso evita que o componente seja recriado a cada render, causando perda de foco nos inputs
interface ResponsavelFieldsProps {
  data: ResponsavelCompleto;
  onUpdate: (field: keyof ResponsavelCompleto, value: string) => void;
  onSave: () => void;
  editado: boolean;
  label: string;
  isReadOnly: boolean;
  isSaving: boolean;
}

const ResponsavelFields: React.FC<ResponsavelFieldsProps> = ({
  data,
  onUpdate,
  onSave,
  editado,
  label,
  isReadOnly,
  isSaving,
}) => {
  const [dataInput, setDataInput] = React.useState(
    formatarDataExibicao(data.data_nascimento)
  );
  const idadeAnos = calcularIdadeAnos(data.data_nascimento);

  // Atualiza o input quando data externa muda
  React.useEffect(() => {
    setDataInput(formatarDataExibicao(data.data_nascimento));
  }, [data.data_nascimento]);

  const handleDataChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value;
    // Remove tudo exceto números
    const numeros = valor.replace(/\D/g, '');

    // Formata automaticamente com barras
    let formatado = '';
    for (let i = 0; i < numeros.length && i < 8; i++) {
      if (i === 2 || i === 4) formatado += '/';
      formatado += numeros[i];
    }

    setDataInput(formatado);

    // Se tiver 8 dígitos, atualiza o campo
    if (numeros.length === 8) {
      const dia = numeros.substring(0, 2);
      const mes = numeros.substring(2, 4);
      const ano = numeros.substring(4, 8);
      const dataISO = `${ano}-${mes}-${dia}`;
      onUpdate('data_nascimento', dataISO);
    } else if (numeros.length === 0) {
      onUpdate('data_nascimento', '');
    }
  };

  return (
    <div className="mt-3 p-4 bg-muted/30 rounded-lg space-y-3 border">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Nome Completo</Label>
          <Input
            value={data.nome}
            onChange={(e) => onUpdate('nome', e.target.value)}
            disabled={isReadOnly}
            placeholder="Nome completo"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Data de Nascimento
            {idadeAnos !== null && (
              <span className="ml-2 text-primary font-medium">
                ({idadeAnos} anos)
              </span>
            )}
          </Label>
          <Input
            value={dataInput}
            onChange={handleDataChange}
            disabled={isReadOnly}
            placeholder="dd/mm/aaaa"
            maxLength={10}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">CPF</Label>
          <Input
            value={data.cpf_cnpj || ''}
            onChange={(e) => onUpdate('cpf_cnpj', e.target.value)}
            disabled={isReadOnly}
            placeholder="000.000.000-00"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Profissão</Label>
          <Input
            value={data.profissao || ''}
            onChange={(e) => onUpdate('profissao', e.target.value)}
            disabled={isReadOnly}
            placeholder="Profissão"
          />
        </div>
      </div>

      {!isReadOnly && editado && (
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={onSave}
            disabled={isSaving}
            className="gap-2"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar {label}
          </Button>
        </div>
      )}
    </div>
  );
};

export const PatientRegistrationSection: React.FC<
  PatientRegistrationSectionProps
> = ({
  patientId,
  patientName,
  avaliacaoObstetraId,
  onObstetraChange,
  isReadOnly,
}) => {
  const { toast } = useToast();

  // Estados para dados carregados
  const [responsaveis, setResponsaveis] = useState<ResponsavelCompleto[]>([]);
  const [pediatras, setPediatras] = useState<Pediatra[]>([]);
  const [obstetras, setObstetras] = useState<Obstetra[]>([]);
  const [pediatraPaciente, setPediatraPaciente] = useState<Pediatra | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);

  // Estados para pai e mãe selecionados
  const [paiId, setPaiId] = useState<string | null>(null);
  const [maeId, setMaeId] = useState<string | null>(null);

  // Estados para dados editáveis do pai
  const [paiData, setPaiData] = useState<ResponsavelCompleto | null>(null);
  const [paiEditado, setPaiEditado] = useState(false);

  // Estados para dados editáveis da mãe
  const [maeData, setMaeData] = useState<ResponsavelCompleto | null>(null);
  const [maeEditado, setMaeEditado] = useState(false);

  // Estados para modal de cadastro
  const [showNewResponsavelDialog, setShowNewResponsavelDialog] =
    useState(false);
  const [tipoNovoResponsavel, setTipoNovoResponsavel] = useState<
    'pai' | 'mae' | null
  >(null);
  const [showNewPediatraDialog, setShowNewPediatraDialog] = useState(false);
  const [showNewObstetraDialog, setShowNewObstetraDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Estados para novo responsável
  const [novoResponsavel, setNovoResponsavel] = useState({
    nome: '',
    cpf_cnpj: '',
    data_nascimento: '',
    profissao: '',
  });

  // Estados para novo médico
  const [novoMedico, setNovoMedico] = useState({
    nome: '',
    crm: '',
    especialidade: '',
  });

  // Carregar dados do paciente
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Carregar responsáveis do paciente com dados completos
      const { data: responsaveisData, error: responsaveisError } =
        await supabase
          .from('pessoa_responsaveis')
          .select(
            `
          id,
          tipo_responsabilidade,
          responsavel:id_responsavel(
            id,
            nome,
            cpf_cnpj,
            data_nascimento,
            bio_profissional
          )
        `
          )
          .eq('id_pessoa', patientId)
          .eq('ativo', true);

      if (responsaveisError) throw responsaveisError;

      const responsaveisFormatados = (responsaveisData || [])
        .map((r) => {
          const resp = r.responsavel as unknown as {
            id: string;
            nome: string;
            cpf_cnpj?: string | null;
            data_nascimento?: string | null;
            bio_profissional?: string | null;
          } | null;
          return {
            id: resp?.id || '',
            nome: resp?.nome || '',
            cpf_cnpj: resp?.cpf_cnpj || null,
            data_nascimento: resp?.data_nascimento || null,
            profissao: resp?.bio_profissional || null,
          };
        })
        .filter((r) => r.id);

      setResponsaveis(responsaveisFormatados);

      // Carregar pediatra do paciente
      const { data: pediatraData, error: pediatraError } = await supabase
        .from('paciente_pediatra')
        .select(
          `
          pediatra:pediatra_id(
            id,
            pessoa_id,
            crm,
            especialidade,
            pessoa:pessoa_id(nome)
          )
        `
        )
        .eq('paciente_id', patientId)
        .eq('ativo', true)
        .maybeSingle();

      if (pediatraError) throw pediatraError;

      if (pediatraData?.pediatra) {
        const ped = pediatraData.pediatra as unknown as {
          id: string;
          pessoa_id: string;
          crm?: string | null;
          especialidade?: string | null;
          pessoa?: { nome: string } | null;
        };
        setPediatraPaciente({
          id: ped.id,
          pessoa_id: ped.pessoa_id,
          nome: ped.pessoa?.nome || '',
          crm: ped.crm,
          especialidade: ped.especialidade,
        });
      }

      // Carregar lista de pediatras para seleção
      const { data: pediatrasData, error: pediatrasError } = await supabase
        .from('pessoa_pediatra')
        .select(
          `
          id,
          pessoa_id,
          crm,
          especialidade,
          pessoa:pessoa_id(nome)
        `
        )
        .eq('ativo', true)
        .limit(100);

      if (pediatrasError) throw pediatrasError;

      setPediatras(
        (pediatrasData || []).map((p) => {
          const pessoa = p.pessoa as unknown as { nome: string } | null;
          return {
            id: p.id,
            pessoa_id: p.pessoa_id,
            nome: pessoa?.nome || '',
            crm: p.crm,
            especialidade: p.especialidade,
          };
        })
      );

      // Carregar lista de obstetras para seleção
      const { data: obstetrasData, error: obstetrasError } = await supabase
        .from('pessoa_obstetra')
        .select(
          `
          id,
          pessoa_id,
          crm,
          especialidade,
          pessoa:pessoa_id(nome)
        `
        )
        .eq('ativo', true)
        .limit(100);

      if (obstetrasError) throw obstetrasError;

      setObstetras(
        (obstetrasData || []).map((o) => {
          const pessoa = o.pessoa as unknown as { nome: string } | null;
          return {
            id: o.id,
            pessoa_id: o.pessoa_id,
            nome: pessoa?.nome || '',
            crm: o.crm,
            especialidade: o.especialidade,
          };
        })
      );
    } catch (error) {
      console.error('Erro ao carregar dados do paciente:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os dados do paciente.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [patientId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Quando seleciona um pai
  const handleSelectPai = (id: string) => {
    if (id === NOVO_RESPONSAVEL_ID) {
      setTipoNovoResponsavel('pai');
      setShowNewResponsavelDialog(true);
      return;
    }
    setPaiId(id);
    const resp = responsaveis.find((r) => r.id === id);
    if (resp) {
      setPaiData({ ...resp });
      setPaiEditado(false);
    }
  };

  // Quando seleciona uma mãe
  const handleSelectMae = (id: string) => {
    if (id === NOVO_RESPONSAVEL_ID) {
      setTipoNovoResponsavel('mae');
      setShowNewResponsavelDialog(true);
      return;
    }
    setMaeId(id);
    const resp = responsaveis.find((r) => r.id === id);
    if (resp) {
      setMaeData({ ...resp });
      setMaeEditado(false);
    }
  };

  // Atualizar dados do pai
  const handleUpdatePai = (field: keyof ResponsavelCompleto, value: string) => {
    if (paiData) {
      setPaiData({ ...paiData, [field]: value });
      setPaiEditado(true);
    }
  };

  // Atualizar dados da mãe
  const handleUpdateMae = (field: keyof ResponsavelCompleto, value: string) => {
    if (maeData) {
      setMaeData({ ...maeData, [field]: value });
      setMaeEditado(true);
    }
  };

  // Salvar dados do pai
  const handleSavePai = async () => {
    if (!paiData || !paiId) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('pessoas')
        .update({
          nome: paiData.nome,
          cpf_cnpj: paiData.cpf_cnpj || null,
          data_nascimento: paiData.data_nascimento || null,
          bio_profissional: paiData.profissao || null,
        })
        .eq('id', paiId);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Dados do pai atualizados.',
      });
      setPaiEditado(false);
      loadData();
    } catch (error) {
      console.error('Erro ao salvar pai:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar os dados do pai.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Salvar dados da mãe
  const handleSaveMae = async () => {
    if (!maeData || !maeId) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('pessoas')
        .update({
          nome: maeData.nome,
          cpf_cnpj: maeData.cpf_cnpj || null,
          data_nascimento: maeData.data_nascimento || null,
          bio_profissional: maeData.profissao || null,
        })
        .eq('id', maeId);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Dados da mãe atualizados.',
      });
      setMaeEditado(false);
      loadData();
    } catch (error) {
      console.error('Erro ao salvar mãe:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar os dados da mãe.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Cadastrar novo responsável
  const handleSaveResponsavel = async () => {
    if (!novoResponsavel.nome.trim()) {
      toast({
        title: 'Erro',
        description: 'O nome do responsável é obrigatório.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      // Buscar tipo_pessoa para responsável
      const { data: tipoPessoa, error: tipoPessoaError } = await supabase
        .from('pessoa_tipos')
        .select('id')
        .eq('codigo', 'responsavel')
        .single();

      if (tipoPessoaError) throw tipoPessoaError;

      // Criar nova pessoa
      const { data: novaPessoa, error: pessoaError } = await supabase
        .from('pessoas')
        .insert({
          nome: novoResponsavel.nome,
          cpf_cnpj: novoResponsavel.cpf_cnpj || null,
          data_nascimento: novoResponsavel.data_nascimento || null,
          bio_profissional: novoResponsavel.profissao || null,
          id_tipo_pessoa: tipoPessoa.id,
          ativo: true,
        })
        .select()
        .single();

      if (pessoaError) throw pessoaError;

      // Criar vínculo como responsável legal
      const { error: vinculoError } = await supabase
        .from('pessoa_responsaveis')
        .insert({
          id_pessoa: patientId,
          id_responsavel: novaPessoa.id,
          tipo_responsabilidade: 'legal',
          ativo: true,
        });

      if (vinculoError) throw vinculoError;

      toast({
        title: 'Sucesso',
        description: 'Responsável cadastrado e associado ao paciente.',
      });

      // Resetar formulário e recarregar dados
      setNovoResponsavel({
        nome: '',
        cpf_cnpj: '',
        data_nascimento: '',
        profissao: '',
      });
      setShowNewResponsavelDialog(false);

      // Após recarregar, selecionar o novo responsável
      await loadData();

      // Selecionar como pai ou mãe
      if (tipoNovoResponsavel === 'pai') {
        setPaiId(novaPessoa.id);
        setPaiData({
          id: novaPessoa.id,
          nome: novoResponsavel.nome,
          cpf_cnpj: novoResponsavel.cpf_cnpj || null,
          data_nascimento: novoResponsavel.data_nascimento || null,
          profissao: novoResponsavel.profissao || null,
        });
      } else if (tipoNovoResponsavel === 'mae') {
        setMaeId(novaPessoa.id);
        setMaeData({
          id: novaPessoa.id,
          nome: novoResponsavel.nome,
          cpf_cnpj: novoResponsavel.cpf_cnpj || null,
          data_nascimento: novoResponsavel.data_nascimento || null,
          profissao: novoResponsavel.profissao || null,
        });
      }

      setTipoNovoResponsavel(null);
    } catch (error) {
      console.error('Erro ao cadastrar responsável:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível cadastrar o responsável.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Cadastrar novo pediatra
  const handleSavePediatra = async () => {
    if (!novoMedico.nome.trim()) {
      toast({
        title: 'Erro',
        description: 'O nome do pediatra é obrigatório.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const { data: tipoPessoa } = await supabase
        .from('pessoa_tipos')
        .select('id')
        .eq('codigo', 'prof_externo')
        .maybeSingle();

      let tipoPessoaId = tipoPessoa?.id;
      if (!tipoPessoaId) {
        const { data: novoTipo, error: novoTipoError } = await supabase
          .from('pessoa_tipos')
          .insert({
            codigo: 'prof_externo',
            nome: 'Profissional Externo',
            descricao: 'Profissionais externos como pediatras e obstetras',
            ativo: true,
          })
          .select()
          .single();

        if (novoTipoError) throw novoTipoError;
        tipoPessoaId = novoTipo.id;
      }

      const { data: novaPessoa, error: pessoaError } = await supabase
        .from('pessoas')
        .insert({
          nome: novoMedico.nome,
          especialidade: novoMedico.especialidade || 'Pediatria',
          registro_profissional: novoMedico.crm || null,
          id_tipo_pessoa: tipoPessoaId,
          ativo: true,
        })
        .select()
        .single();

      if (pessoaError) throw pessoaError;

      const { data: novoPediatra, error: pediatraError } = await supabase
        .from('pessoa_pediatra')
        .insert({
          pessoa_id: novaPessoa.id,
          crm: novoMedico.crm || null,
          especialidade: novoMedico.especialidade || 'Pediatria',
          ativo: true,
        })
        .select()
        .single();

      if (pediatraError) throw pediatraError;

      const { error: vinculoError } = await supabase
        .from('paciente_pediatra')
        .insert({
          paciente_id: patientId,
          pediatra_id: novoPediatra.id,
          ativo: true,
        });

      if (vinculoError) throw vinculoError;

      toast({
        title: 'Sucesso',
        description: 'Pediatra cadastrado e associado ao paciente.',
      });

      setNovoMedico({ nome: '', crm: '', especialidade: '' });
      setShowNewPediatraDialog(false);
      loadData();
    } catch (error) {
      console.error('Erro ao cadastrar pediatra:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível cadastrar o pediatra.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Cadastrar novo obstetra
  const handleSaveObstetra = async () => {
    if (!novoMedico.nome.trim()) {
      toast({
        title: 'Erro',
        description: 'O nome do obstetra é obrigatório.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const { data: tipoPessoa } = await supabase
        .from('pessoa_tipos')
        .select('id')
        .eq('codigo', 'prof_externo')
        .maybeSingle();

      let tipoPessoaId = tipoPessoa?.id;
      if (!tipoPessoaId) {
        const { data: novoTipo, error: novoTipoError } = await supabase
          .from('pessoa_tipos')
          .insert({
            codigo: 'prof_externo',
            nome: 'Profissional Externo',
            descricao: 'Profissionais externos como pediatras e obstetras',
            ativo: true,
          })
          .select()
          .single();

        if (novoTipoError) throw novoTipoError;
        tipoPessoaId = novoTipo.id;
      }

      const { data: novaPessoa, error: pessoaError } = await supabase
        .from('pessoas')
        .insert({
          nome: novoMedico.nome,
          especialidade:
            novoMedico.especialidade || 'Ginecologia e Obstetrícia',
          registro_profissional: novoMedico.crm || null,
          id_tipo_pessoa: tipoPessoaId,
          ativo: true,
        })
        .select()
        .single();

      if (pessoaError) throw pessoaError;

      const { error: obstetraError } = await supabase
        .from('pessoa_obstetra')
        .insert({
          pessoa_id: novaPessoa.id,
          crm: novoMedico.crm || null,
          especialidade:
            novoMedico.especialidade || 'Ginecologia e Obstetrícia',
          ativo: true,
        })
        .select()
        .single();

      if (obstetraError) throw obstetraError;

      onObstetraChange(novaPessoa.id);

      toast({
        title: 'Sucesso',
        description: 'Obstetra cadastrado e associado à avaliação.',
      });

      setNovoMedico({ nome: '', crm: '', especialidade: '' });
      setShowNewObstetraDialog(false);
      loadData();
    } catch (error) {
      console.error('Erro ao cadastrar obstetra:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível cadastrar o obstetra.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Selecionar pediatra existente
  const handleSelectPediatra = async (pediatraId: string) => {
    try {
      await supabase
        .from('paciente_pediatra')
        .update({ ativo: false })
        .eq('paciente_id', patientId);

      const { error } = await supabase.from('paciente_pediatra').insert({
        paciente_id: patientId,
        pediatra_id: pediatraId,
        ativo: true,
      });

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Pediatra associado ao paciente.',
      });

      loadData();
    } catch (error) {
      console.error('Erro ao associar pediatra:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível associar o pediatra.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Paciente - no topo e destacado */}
      <div className="p-4 bg-primary/10 rounded-lg border-2 border-primary/30">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/20 rounded-full">
            <Baby className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Paciente
            </p>
            <p className="text-xl font-bold text-primary">
              {patientName || 'Não identificado'}
            </p>
          </div>
        </div>
      </div>

      {/* Nome do Pai */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Nome do Pai</Label>
        <Select
          value={paiId || ''}
          onValueChange={handleSelectPai}
          disabled={isReadOnly}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione o pai" />
          </SelectTrigger>
          <SelectContent>
            {responsaveis
              .filter((r) => r.id !== maeId) // Não mostrar se já selecionado como mãe
              .map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.nome}
                </SelectItem>
              ))}
            <SelectItem
              value={NOVO_RESPONSAVEL_ID}
              className="text-primary font-medium"
            >
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                Cadastrar novo responsável
              </div>
            </SelectItem>
          </SelectContent>
        </Select>

        {paiId && paiData && (
          <ResponsavelFields
            data={paiData}
            onUpdate={handleUpdatePai}
            onSave={handleSavePai}
            editado={paiEditado}
            label="Pai"
            isReadOnly={isReadOnly}
            isSaving={isSaving}
          />
        )}
      </div>

      {/* Nome da Mãe */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Nome da Mãe</Label>
        <Select
          value={maeId || ''}
          onValueChange={handleSelectMae}
          disabled={isReadOnly}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione a mãe" />
          </SelectTrigger>
          <SelectContent>
            {responsaveis
              .filter((r) => r.id !== paiId) // Não mostrar se já selecionado como pai
              .map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.nome}
                </SelectItem>
              ))}
            <SelectItem
              value={NOVO_RESPONSAVEL_ID}
              className="text-primary font-medium"
            >
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                Cadastrar novo responsável
              </div>
            </SelectItem>
          </SelectContent>
        </Select>

        {maeId && maeData && (
          <ResponsavelFields
            data={maeData}
            onUpdate={handleUpdateMae}
            onSave={handleSaveMae}
            editado={maeEditado}
            label="Mãe"
            isReadOnly={isReadOnly}
            isSaving={isSaving}
          />
        )}
      </div>

      {/* Pediatra */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-blue-500" />
            <Label className="text-sm font-medium">Pediatra</Label>
          </div>
          {!isReadOnly && !pediatraPaciente && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNewPediatraDialog(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Novo
            </Button>
          )}
        </div>

        {pediatraPaciente ? (
          <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900">
            <div>
              <p className="font-medium">{pediatraPaciente.nome}</p>
              {pediatraPaciente.crm && (
                <p className="text-xs text-muted-foreground">
                  CRM: {pediatraPaciente.crm}
                </p>
              )}
            </div>
            <Check className="h-5 w-5 text-blue-500" />
          </div>
        ) : (
          <div className="space-y-2">
            {!isReadOnly && pediatras.length > 0 && (
              <Select onValueChange={handleSelectPediatra}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um pediatra" />
                </SelectTrigger>
                <SelectContent>
                  {pediatras.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome} {p.crm && `(CRM: ${p.crm})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {responsaveis.length === 0 && pediatras.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum pediatra disponível.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Obstetra */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-pink-500" />
            <Label className="text-sm font-medium">Obstetra</Label>
          </div>
          {!isReadOnly && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNewObstetraDialog(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Novo
            </Button>
          )}
        </div>

        {avaliacaoObstetraId ? (
          <div className="flex items-center justify-between p-3 bg-pink-50 dark:bg-pink-950/30 rounded-lg border border-pink-200 dark:border-pink-900">
            <div>
              <p className="font-medium">
                {obstetras.find((o) => o.pessoa_id === avaliacaoObstetraId)
                  ?.nome || 'Obstetra selecionado'}
              </p>
            </div>
            {!isReadOnly && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onObstetraChange(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {!isReadOnly && obstetras.length > 0 && (
              <Select onValueChange={(value) => onObstetraChange(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um obstetra" />
                </SelectTrigger>
                <SelectContent>
                  {obstetras.map((o) => (
                    <SelectItem key={o.id} value={o.pessoa_id}>
                      {o.nome} {o.crm && `(CRM: ${o.crm})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {obstetras.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum obstetra disponível.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Dialog: Novo Responsável */}
      <Dialog
        open={showNewResponsavelDialog}
        onOpenChange={setShowNewResponsavelDialog}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Novo Responsável{' '}
              {tipoNovoResponsavel === 'pai'
                ? '(Pai)'
                : tipoNovoResponsavel === 'mae'
                  ? '(Mãe)'
                  : ''}
            </DialogTitle>
            <DialogDescription>
              Cadastre um novo responsável. Somente o nome é obrigatório.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="resp-nome">Nome Completo *</Label>
              <Input
                id="resp-nome"
                value={novoResponsavel.nome}
                onChange={(e) =>
                  setNovoResponsavel({
                    ...novoResponsavel,
                    nome: e.target.value,
                  })
                }
                placeholder="Nome completo do responsável"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="resp-nascimento">Data de Nascimento</Label>
              <Input
                id="resp-nascimento"
                value={formatarDataExibicao(novoResponsavel.data_nascimento)}
                onChange={(e) => {
                  const valor = e.target.value;
                  const numeros = valor.replace(/\D/g, '');
                  let formatado = '';
                  for (let i = 0; i < numeros.length && i < 8; i++) {
                    if (i === 2 || i === 4) formatado += '/';
                    formatado += numeros[i];
                  }
                  if (numeros.length === 8) {
                    const dia = numeros.substring(0, 2);
                    const mes = numeros.substring(2, 4);
                    const ano = numeros.substring(4, 8);
                    setNovoResponsavel({
                      ...novoResponsavel,
                      data_nascimento: `${ano}-${mes}-${dia}`,
                    });
                  } else {
                    // Armazena temporariamente formatado para exibição
                    setNovoResponsavel({
                      ...novoResponsavel,
                      data_nascimento: numeros.length > 0 ? formatado : '',
                    });
                  }
                }}
                placeholder="dd/mm/aaaa"
                maxLength={10}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="resp-cpf">CPF</Label>
              <Input
                id="resp-cpf"
                value={novoResponsavel.cpf_cnpj}
                onChange={(e) =>
                  setNovoResponsavel({
                    ...novoResponsavel,
                    cpf_cnpj: e.target.value,
                  })
                }
                placeholder="000.000.000-00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="resp-profissao">Profissão</Label>
              <Input
                id="resp-profissao"
                value={novoResponsavel.profissao}
                onChange={(e) =>
                  setNovoResponsavel({
                    ...novoResponsavel,
                    profissao: e.target.value,
                  })
                }
                placeholder="Profissão do responsável"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewResponsavelDialog(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveResponsavel} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Novo Pediatra */}
      <Dialog
        open={showNewPediatraDialog}
        onOpenChange={setShowNewPediatraDialog}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-blue-500" />
              Novo Pediatra
            </DialogTitle>
            <DialogDescription>
              Cadastre um novo pediatra. Somente o nome é obrigatório.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ped-nome">Nome Completo *</Label>
              <Input
                id="ped-nome"
                value={novoMedico.nome}
                onChange={(e) =>
                  setNovoMedico({ ...novoMedico, nome: e.target.value })
                }
                placeholder="Dr(a). Nome Completo"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ped-crm">CRM</Label>
              <Input
                id="ped-crm"
                value={novoMedico.crm}
                onChange={(e) =>
                  setNovoMedico({ ...novoMedico, crm: e.target.value })
                }
                placeholder="CRM/UF 00000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ped-especialidade">Especialidade</Label>
              <Input
                id="ped-especialidade"
                value={novoMedico.especialidade}
                onChange={(e) =>
                  setNovoMedico({
                    ...novoMedico,
                    especialidade: e.target.value,
                  })
                }
                placeholder="Pediatria"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewPediatraDialog(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSavePediatra} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Novo Obstetra */}
      <Dialog
        open={showNewObstetraDialog}
        onOpenChange={setShowNewObstetraDialog}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-pink-500" />
              Novo Obstetra
            </DialogTitle>
            <DialogDescription>
              Cadastre um novo obstetra. Somente o nome é obrigatório.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="obs-nome">Nome Completo *</Label>
              <Input
                id="obs-nome"
                value={novoMedico.nome}
                onChange={(e) =>
                  setNovoMedico({ ...novoMedico, nome: e.target.value })
                }
                placeholder="Dr(a). Nome Completo"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="obs-crm">CRM</Label>
              <Input
                id="obs-crm"
                value={novoMedico.crm}
                onChange={(e) =>
                  setNovoMedico({ ...novoMedico, crm: e.target.value })
                }
                placeholder="CRM/UF 00000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="obs-especialidade">Especialidade</Label>
              <Input
                id="obs-especialidade"
                value={novoMedico.especialidade}
                onChange={(e) =>
                  setNovoMedico({
                    ...novoMedico,
                    especialidade: e.target.value,
                  })
                }
                placeholder="Ginecologia e Obstetrícia"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewObstetraDialog(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveObstetra} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

PatientRegistrationSection.displayName = 'PatientRegistrationSection';
