// AI dev note: Dialog para criar nova meta (admin)
// Usa tipos_meta + ProfessionalSelect/role_alvo para escopo individual

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Label } from '@/components/primitives/label';
import { Input } from '@/components/primitives/input';
import { Textarea } from '@/components/primitives/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { useToast } from '@/components/primitives/use-toast';
import { Loader2, Plus } from 'lucide-react';
import { ProfessionalSelect } from './ProfessionalSelect';
import { createMeta, fetchTiposMeta } from '@/lib/metas-api';
import { supabase } from '@/lib/supabase';
import type { CreateMetaInput, MetaEscopo, TipoMeta } from '@/types/metas';

export interface CreateMetaDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultPessoaId?: string;
  lockedRoleAlvo?: TipoMeta['role_alvo'];
}

interface PessoaOption {
  id: string;
  nome: string;
  role: string;
}

const firstDayOfMonth = (date = new Date()): string => {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  return d.toISOString().slice(0, 10);
};

const lastDayOfMonth = (date = new Date()): string => {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
};

export const CreateMetaDialog: React.FC<CreateMetaDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultPessoaId,
  lockedRoleAlvo,
}) => {
  const { toast } = useToast();
  const [tipos, setTipos] = useState<TipoMeta[]>([]);
  const [loadingTipos, setLoadingTipos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [secretarias, setSecretarias] = useState<PessoaOption[]>([]);
  const [admins, setAdmins] = useState<PessoaOption[]>([]);

  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tipoMetaId, setTipoMetaId] = useState<string>('');
  const [escopo, setEscopo] = useState<MetaEscopo>('individual');
  const [pessoaId, setPessoaId] = useState<string>(defaultPessoaId || '');
  const [valorMeta, setValorMeta] = useState<string>('');
  const [valorMinimo, setValorMinimo] = useState<string>('');
  const [periodoInicio, setPeriodoInicio] = useState(firstDayOfMonth());
  const [periodoFim, setPeriodoFim] = useState(lastDayOfMonth());

  useEffect(() => {
    if (!isOpen) return;
    setLoadingTipos(true);
    fetchTiposMeta()
      .then(setTipos)
      .finally(() => setLoadingTipos(false));

    // Carregar admins e secretarias
    (async () => {
      const { data } = await supabase
        .from('pessoas')
        .select('id, nome, role')
        .in('role', ['admin', 'secretaria'])
        .eq('ativo', true);
      const list = (data || []) as PessoaOption[];
      setAdmins(list.filter((p) => p.role === 'admin'));
      setSecretarias(list.filter((p) => p.role === 'secretaria'));
    })();
  }, [isOpen]);

  // Reset ao abrir
  useEffect(() => {
    if (isOpen) {
      setTitulo('');
      setDescricao('');
      setTipoMetaId('');
      setEscopo('individual');
      setPessoaId(defaultPessoaId || '');
      setValorMeta('');
      setValorMinimo('');
      setPeriodoInicio(firstDayOfMonth());
      setPeriodoFim(lastDayOfMonth());
    }
  }, [isOpen, defaultPessoaId]);

  const tipoSelecionado = useMemo(
    () => tipos.find((t) => t.id === tipoMetaId),
    [tipos, tipoMetaId]
  );

  const tiposFiltrados = useMemo(() => {
    if (!lockedRoleAlvo) return tipos;
    return tipos.filter(
      (t) => t.role_alvo === lockedRoleAlvo || t.role_alvo === 'todos'
    );
  }, [tipos, lockedRoleAlvo]);

  // Datas em formato ISO (yyyy-mm-dd): comparação de string equivale à cronológica
  const periodoInvalido = Boolean(
    periodoInicio && periodoFim && periodoFim < periodoInicio
  );

  const handleSubmit = async () => {
    if (!titulo.trim() || !tipoMetaId || !valorMeta) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha título, tipo de meta e valor.',
        variant: 'destructive',
      });
      return;
    }
    if (escopo === 'individual' && !pessoaId) {
      toast({
        title: 'Selecione a pessoa',
        description: 'Metas individuais precisam de uma pessoa atribuída.',
        variant: 'destructive',
      });
      return;
    }
    if (periodoInvalido) {
      toast({
        title: 'Período inválido',
        description: 'O fim do período deve ser igual ou posterior ao início.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const input: CreateMetaInput = {
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        tipo_meta_id: tipoMetaId,
        escopo,
        pessoa_id: escopo === 'individual' ? pessoaId : null,
        periodo_inicio: periodoInicio,
        periodo_fim: periodoFim,
        valor_meta: Number(valorMeta),
        valor_minimo: valorMinimo ? Number(valorMinimo) : null,
      };
      await createMeta(input);
      toast({
        title: 'Meta criada',
        description: 'A meta foi criada e o progresso será calculado.',
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      toast({
        title: 'Erro ao criar meta',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const renderPessoaSelect = () => {
    if (!tipoSelecionado) return null;
    const role = tipoSelecionado.role_alvo;

    if (role === 'profissional') {
      return (
        <ProfessionalSelect
          value={pessoaId}
          onValueChange={setPessoaId}
          placeholder="Selecionar profissional..."
        />
      );
    }

    const opcoes = role === 'admin' ? admins : secretarias;
    return (
      <Select value={pessoaId} onValueChange={setPessoaId}>
        <SelectTrigger>
          <SelectValue
            placeholder={`Selecionar ${role === 'admin' ? 'admin' : 'secretária'}...`}
          />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-rosa-suave" />
            Nova Meta
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: 80 consultas em maio"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de meta</Label>
            <Select value={tipoMetaId} onValueChange={setTipoMetaId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loadingTipos ? 'Carregando...' : 'Selecione o tipo'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {tiposFiltrados.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome} ({t.role_alvo})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tipoSelecionado?.descricao && (
              <p className="text-xs text-muted-foreground">
                {tipoSelecionado.descricao}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Escopo</Label>
              <Select
                value={escopo}
                onValueChange={(v) => setEscopo(v as MetaEscopo)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="clinica">Clínica</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {escopo === 'individual' && (
              <div className="space-y-1.5">
                <Label>Pessoa</Label>
                {renderPessoaSelect()}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                Valor da meta ({tipoSelecionado?.unidade_medida || '—'})
              </Label>
              <Input
                type="number"
                step="0.01"
                value={valorMeta}
                onChange={(e) => setValorMeta(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor mínimo (opcional)</Label>
              <Input
                type="number"
                step="0.01"
                value={valorMinimo}
                onChange={(e) => setValorMinimo(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Início do período</Label>
              <Input
                type="date"
                value={periodoInicio}
                onChange={(e) => setPeriodoInicio(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fim do período</Label>
              <Input
                type="date"
                value={periodoFim}
                onChange={(e) => setPeriodoFim(e.target.value)}
                aria-invalid={periodoInvalido}
                className={
                  periodoInvalido
                    ? 'border-destructive focus-visible:ring-destructive'
                    : undefined
                }
              />
            </div>
            {periodoInvalido && (
              <p className="col-span-2 text-xs text-destructive">
                O fim do período deve ser igual ou posterior ao início.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Descrição (opcional)</Label>
            <Textarea
              rows={2}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || periodoInvalido}
            className="gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Criar Meta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

CreateMetaDialog.displayName = 'CreateMetaDialog';
