import React, { useEffect, useState } from 'react';
import { UserCog } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { useToast } from '@/components/primitives/use-toast';
import { updateUsuario } from '@/lib/usuarios-api';
import type { UsuarioUpdate } from '@/types/usuarios';

// AI dev note: PersonQuickEditDialog - edição rápida dos dados de cadastro de uma
// pessoa direto na tela de detalhes (cadastro), sem precisar ir em
// Configurações > Usuários. Usa updateUsuario (que já sincroniza o cadastro com
// todas as contas ASAAS). Cobre os campos principais de cadastro.

export interface PersonQuickEditPerson {
  id: string;
  nome?: string | null;
  email?: string | null;
  telefone?: number | bigint | null;
  cpf_cnpj?: string | null;
  data_nascimento?: string | null;
  numero_endereco?: string | null;
  complemento_endereco?: string | null;
}

export interface PersonQuickEditDialogProps {
  person: PersonQuickEditPerson | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export const PersonQuickEditDialog: React.FC<PersonQuickEditDialogProps> = ({
  person,
  open,
  onOpenChange,
  onSaved,
}) => {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [numeroEndereco, setNumeroEndereco] = useState('');
  const [complementoEndereco, setComplementoEndereco] = useState('');

  useEffect(() => {
    if (open && person) {
      setNome(person.nome || '');
      setEmail(person.email || '');
      setTelefone(
        person.telefone !== null && person.telefone !== undefined
          ? String(person.telefone)
          : ''
      );
      setCpfCnpj(person.cpf_cnpj || '');
      setDataNascimento((person.data_nascimento || '').split('T')[0]);
      setNumeroEndereco(person.numero_endereco || '');
      setComplementoEndereco(person.complemento_endereco || '');
    }
  }, [open, person]);

  const handleSave = async () => {
    if (!person) return;

    if (!nome.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome da pessoa.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const telefoneDigits = telefone.replace(/\D/g, '');
      const cpfDigits = cpfCnpj.replace(/\D/g, '');

      const updates: UsuarioUpdate = {
        nome: nome.trim(),
        email: email.trim() || undefined,
        telefone: telefoneDigits ? Number(telefoneDigits) : null,
        cpf_cnpj: cpfDigits || null,
        data_nascimento: dataNascimento || null,
        numero_endereco: numeroEndereco.trim() || null,
        complemento_endereco: complementoEndereco.trim() || null,
      };

      const result = await updateUsuario(person.id, updates);
      if (result.success) {
        toast({
          title: 'Cadastro atualizado',
          description:
            'Os dados foram salvos e estão sendo sincronizados com o ASAAS.',
        });
        onSaved?.();
        onOpenChange(false);
      } else {
        toast({
          title: 'Erro ao atualizar',
          description: result.error || 'Não foi possível salvar o cadastro.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Erro ao atualizar cadastro:', error);
      toast({
        title: 'Erro ao atualizar',
        description: 'Erro inesperado ao salvar o cadastro.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-azul-respira" />
            Editar cadastro
          </DialogTitle>
          <DialogDescription>
            Atualize os dados de cadastro. As alterações são sincronizadas
            automaticamente com as contas do ASAAS.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="qe-nome">Nome</Label>
            <Input
              id="qe-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qe-cpf">CPF/CNPJ</Label>
              <Input
                id="qe-cpf"
                value={cpfCnpj}
                onChange={(e) => setCpfCnpj(e.target.value)}
                placeholder="Somente números"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qe-nascimento">Data de nascimento</Label>
              <Input
                id="qe-nascimento"
                type="date"
                value={dataNascimento}
                onChange={(e) => setDataNascimento(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qe-email">Email</Label>
              <Input
                id="qe-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qe-telefone">Telefone</Label>
              <Input
                id="qe-telefone"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="DDD + número"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qe-numero">Número do endereço</Label>
              <Input
                id="qe-numero"
                value={numeroEndereco}
                onChange={(e) => setNumeroEndereco(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qe-complemento">Complemento</Label>
              <Input
                id="qe-complemento"
                value={complementoEndereco}
                onChange={(e) => setComplementoEndereco(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

PersonQuickEditDialog.displayName = 'PersonQuickEditDialog';
