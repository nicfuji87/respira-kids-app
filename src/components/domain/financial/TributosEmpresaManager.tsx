import React from 'react';
import { Plus, Edit, Trash2, Percent, Building2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Skeleton,
} from '@/components/primitives';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// AI dev note: CRUD de tributos por empresa (tabela tributos_empresa, com vigência).
// A soma das alíquotas vigentes de cada empresa é o imposto aplicado sobre o bruto
// no cálculo da margem do Caixa da Clínica (ver CaixaClinicaPanel / fn_processar_margens_fatura).

interface Empresa {
  id: string;
  nome_fantasia: string;
  regime_tributario: string | null;
}

interface Tributo {
  id: string;
  empresa_id: string;
  tipo_tributo: string;
  aliquota_percent: number;
  base: string;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  observacoes: string | null;
  ativo: boolean;
}

const TIPOS_TRIBUTO = [
  'DAS',
  'ISS',
  'INSS',
  'PIS',
  'COFINS',
  'IRPJ',
  'CSLL',
  'OUTRO',
];

const emptyForm = {
  empresa_id: '',
  tipo_tributo: 'ISS',
  aliquota_percent: '',
  vigencia_inicio: new Date().toISOString().slice(0, 10),
  observacoes: '',
};

export const TributosEmpresaManager = React.memo(() => {
  const [empresas, setEmpresas] = React.useState<Empresa[]>([]);
  const [tributos, setTributos] = React.useState<Tributo[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [editing, setEditing] = React.useState<Tributo | null>(null);
  const [form, setForm] = React.useState({ ...emptyForm });
  const [deleting, setDeleting] = React.useState<Tributo | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const load = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const [empRes, tribRes] = await Promise.all([
        supabase
          .from('pessoa_empresas')
          .select('id, nome_fantasia, regime_tributario')
          .eq('ativo', true)
          .order('nome_fantasia'),
        supabase
          .from('tributos_empresa')
          .select('*')
          .eq('ativo', true)
          .order('tipo_tributo'),
      ]);
      if (empRes.error) throw empRes.error;
      if (tribRes.error) throw tribRes.error;
      setEmpresas(empRes.data || []);
      setTributos(
        (tribRes.data || []).map((t) => ({
          ...t,
          aliquota_percent: Number(t.aliquota_percent ?? 0),
        }))
      );
    } catch (error) {
      console.error('Erro ao carregar tributos:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar',
        description: 'Não foi possível carregar os tributos.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, empresa_id: empresas[0]?.id || '' });
    setShowForm(true);
  };

  const openEdit = (t: Tributo) => {
    setEditing(t);
    setForm({
      empresa_id: t.empresa_id,
      tipo_tributo: t.tipo_tributo,
      aliquota_percent: String(t.aliquota_percent),
      vigencia_inicio: t.vigencia_inicio,
      observacoes: t.observacoes || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    const aliquota = parseFloat(form.aliquota_percent.replace(',', '.'));
    if (!form.empresa_id || !form.tipo_tributo || !(aliquota >= 0)) {
      toast({
        variant: 'destructive',
        title: 'Dados inválidos',
        description: 'Informe empresa, tributo e uma alíquota válida.',
      });
      return;
    }
    try {
      const payload = {
        empresa_id: form.empresa_id,
        tipo_tributo: form.tipo_tributo,
        aliquota_percent: aliquota,
        vigencia_inicio: form.vigencia_inicio,
        observacoes: form.observacoes || null,
        atualizado_por: user?.pessoa?.id ?? null,
      };
      const { error } = editing
        ? await supabase
            .from('tributos_empresa')
            .update(payload)
            .eq('id', editing.id)
        : await supabase.from('tributos_empresa').insert(payload);
      if (error) throw error;

      toast({
        title: editing ? 'Tributo atualizado' : 'Tributo cadastrado',
        description: 'As alíquotas da margem já consideram este valor.',
      });
      setShowForm(false);
      load();
    } catch (error) {
      console.error('Erro ao salvar tributo:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar o tributo.',
      });
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const { error } = await supabase
        .from('tributos_empresa')
        .update({ ativo: false })
        .eq('id', deleting.id);
      if (error) throw error;
      toast({ title: 'Tributo removido' });
      load();
    } catch (error) {
      console.error('Erro ao remover tributo:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao remover',
        description: 'Não foi possível remover o tributo.',
      });
    } finally {
      setDeleting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Tributos por Empresa</h2>
          <p className="text-muted-foreground">
            Alíquotas usadas no cálculo da margem (imposto sobre o faturamento
            bruto)
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Tributo
        </Button>
      </div>

      {empresas.map((emp) => {
        const lista = tributos.filter((t) => t.empresa_id === emp.id);
        const total = lista.reduce((s, t) => s + t.aliquota_percent, 0);
        return (
          <Card key={emp.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {emp.nome_fantasia}
                  {emp.regime_tributario && (
                    <Badge variant="outline" className="text-xs font-normal">
                      {emp.regime_tributario.replace('_', ' ')}
                    </Badge>
                  )}
                </span>
                <span className="flex items-center gap-1 text-emerald-600">
                  <Percent className="h-4 w-4" />
                  {total.toFixed(3).replace('.', ',')}% total
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lista.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum tributo cadastrado.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tributo</TableHead>
                      <TableHead className="text-right">Alíquota</TableHead>
                      <TableHead>Vigência</TableHead>
                      <TableHead>Obs.</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lista.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">
                          {t.tipo_tributo}
                        </TableCell>
                        <TableCell className="text-right">
                          {t.aliquota_percent.toFixed(3).replace('.', ',')}%
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          desde{' '}
                          {new Date(t.vigencia_inicio).toLocaleDateString(
                            'pt-BR'
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {t.observacoes}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(t)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleting(t)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar Tributo' : 'Novo Tributo'}
            </DialogTitle>
            <DialogDescription>
              Alíquota efetiva sobre o faturamento bruto. Some os tributos para
              chegar na carga total da empresa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Empresa</Label>
              <Select
                value={form.empresa_id}
                onValueChange={(v) => setForm((f) => ({ ...f, empresa_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome_fantasia}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tributo</Label>
                <Select
                  value={form.tipo_tributo}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, tipo_tributo: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_TRIBUTO.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Alíquota (%)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex.: 8,5"
                  value={form.aliquota_percent}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, aliquota_percent: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Vigência a partir de</Label>
              <Input
                type="date"
                value={form.vigencia_inicio}
                onChange={(e) =>
                  setForm((f) => ({ ...f, vigencia_inicio: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Observações</Label>
              <Input
                value={form.observacoes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, observacoes: e.target.value }))
                }
                placeholder="Opcional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de remoção */}
      <Dialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover tributo</DialogTitle>
            <DialogDescription>
              Remover <strong>{deleting?.tipo_tributo}</strong> (
              {deleting?.aliquota_percent.toFixed(3).replace('.', ',')}%)? Isso
              reduz a carga usada no cálculo da margem daqui pra frente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

TributosEmpresaManager.displayName = 'TributosEmpresaManager';
