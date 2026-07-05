// AI dev note: Diálogo de cadastro/edição de produto vendável (espaçador/brinquedo).
// Suporta variações como produtos distintos (ex: Espaçador Kids / Baby) e kits
// (eh_kit): um kit não controla estoque próprio; sua baixa consome componentes.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/primitives/dialog';
import { Input } from '@/components/primitives/input';
import { CurrencyInput } from '@/components/primitives/currency-input';
import { Textarea } from '@/components/primitives/textarea';
import { Label } from '@/components/primitives/label';
import { Switch } from '@/components/primitives/switch';
import { Button } from '@/components/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { useToast } from '@/components/primitives/use-toast';
import { Plus, Trash2, Loader2, ImagePlus, X } from 'lucide-react';
import {
  criarProduto,
  atualizarProduto,
  fetchKitComponentes,
  salvarKitComponentes,
  uploadProdutoFoto,
} from '@/lib/produtos-api';
import { compressImage } from '@/lib/image-utils';
import {
  CATEGORIA_LABELS,
  type CategoriaVenda,
  type Produto,
} from '@/types/produtos';

interface ComponenteLinha {
  componente_produto_id: string;
  quantidade: string;
}

interface ProdutoFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  produto?: Produto | null;
  // produtos que podem compor um kit (controlam estoque e não são kits)
  produtosDisponiveis: Produto[];
  userId: string;
  onSaved: () => void;
}

export const ProdutoFormDialog: React.FC<ProdutoFormDialogProps> = ({
  open,
  onOpenChange,
  produto,
  produtosDisponiveis,
  userId,
  onSaved,
}) => {
  const { toast } = useToast();
  const isEdit = Boolean(produto);

  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState<CategoriaVenda>('espacador');
  const [preco, setPreco] = useState<number | null>(null);
  const [unidade, setUnidade] = useState('unidade');
  const [descricao, setDescricao] = useState('');
  const [controlaEstoque, setControlaEstoque] = useState(true);
  const [ehKit, setEhKit] = useState(false);
  const [estoqueMinimoStr, setEstoqueMinimoStr] = useState('0');
  const [ativo, setAtivo] = useState(true);
  const [componentes, setComponentes] = useState<ComponenteLinha[]>([]);
  const [saving, setSaving] = useState(false);

  // foto: fotoUrl = já salva; fotoBlob = nova (comprimida) aguardando upload
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [fotoBlob, setFotoBlob] = useState<Blob | null>(null);
  const [fotoExt, setFotoExt] = useState<'webp' | 'jpg'>('webp');
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [processandoFoto, setProcessandoFoto] = useState(false);

  // componentes elegíveis: controlam estoque, não são kits e não são o próprio produto
  const componentesElegiveis = useMemo(
    () =>
      produtosDisponiveis.filter(
        (p) => p.controla_estoque && !p.eh_kit && p.id !== produto?.id
      ),
    [produtosDisponiveis, produto?.id]
  );

  const resetFromProduto = useCallback(async () => {
    setFotoUrl(produto?.foto_url ?? null);
    setFotoBlob(null);
    setFotoPreview(null);
    if (produto) {
      setNome(produto.nome);
      setCategoria(produto.categoria_venda ?? 'outro');
      setPreco(produto.preco_venda);
      setUnidade(produto.unidade_medida || 'unidade');
      setDescricao(produto.descricao ?? '');
      setControlaEstoque(produto.controla_estoque);
      setEhKit(produto.eh_kit);
      setEstoqueMinimoStr(String(produto.estoque_minimo ?? 0));
      setAtivo(produto.ativo);
      if (produto.eh_kit) {
        try {
          const comps = await fetchKitComponentes(produto.id);
          setComponentes(
            comps.map((c) => ({
              componente_produto_id: c.componente_produto_id,
              quantidade: String(c.quantidade),
            }))
          );
        } catch {
          setComponentes([]);
        }
      } else {
        setComponentes([]);
      }
    } else {
      setNome('');
      setCategoria('espacador');
      setPreco(null);
      setUnidade('unidade');
      setDescricao('');
      setControlaEstoque(true);
      setEhKit(false);
      setEstoqueMinimoStr('0');
      setAtivo(true);
      setComponentes([]);
    }
  }, [produto]);

  useEffect(() => {
    if (open) void resetFromProduto();
  }, [open, resetFromProduto]);

  const addComponente = () =>
    setComponentes((prev) => [
      ...prev,
      { componente_produto_id: '', quantidade: '1' },
    ]);

  const updateComponente = (index: number, patch: Partial<ComponenteLinha>) =>
    setComponentes((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c))
    );

  const removeComponente = (index: number) =>
    setComponentes((prev) => prev.filter((_, i) => i !== index));

  const handleFotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-selecionar o mesmo arquivo
    if (!file) return;
    setProcessandoFoto(true);
    try {
      const { blob, ext } = await compressImage(file, {
        maxDimension: 600,
        quality: 0.8,
      });
      setFotoBlob(blob);
      setFotoExt(ext);
      setFotoPreview(URL.createObjectURL(blob));
    } catch (err) {
      toast({
        title: 'Erro ao processar a foto',
        description: err instanceof Error ? err.message : 'Tente outra imagem.',
        variant: 'destructive',
      });
    } finally {
      setProcessandoFoto(false);
    }
  };

  const handleFotoRemove = () => {
    setFotoBlob(null);
    setFotoPreview(null);
    setFotoUrl(null);
  };

  const fotoAtual = fotoPreview || fotoUrl;

  const handleSave = async () => {
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      toast({ title: 'Informe o nome do produto', variant: 'destructive' });
      return;
    }
    if (preco == null || Number.isNaN(preco) || preco < 0) {
      toast({
        title: 'Informe um preço de venda válido',
        variant: 'destructive',
      });
      return;
    }
    if (ehKit) {
      const validos = componentes.filter((c) => c.componente_produto_id);
      if (validos.length === 0) {
        toast({
          title: 'Kit sem componentes',
          description: 'Adicione ao menos um produto que compõe o kit.',
          variant: 'destructive',
        });
        return;
      }
    }

    setSaving(true);
    try {
      // sobe a foto nova (comprimida) antes de salvar; senão mantém a atual/limpa
      let foto_url = fotoUrl;
      if (fotoBlob) {
        foto_url = await uploadProdutoFoto(fotoBlob, fotoExt);
      }

      const input = {
        nome: nomeTrim,
        descricao: descricao.trim() || null,
        unidade_medida: unidade.trim() || 'unidade',
        categoria_venda: categoria,
        preco_venda: preco,
        controla_estoque: controlaEstoque,
        eh_kit: ehKit,
        estoque_minimo: Number(estoqueMinimoStr.replace(',', '.')) || 0,
        foto_url,
        ativo,
      };

      const salvo = isEdit
        ? await atualizarProduto(produto!.id, input, userId)
        : await criarProduto(input, userId);

      if (ehKit) {
        await salvarKitComponentes(
          salvo.id,
          componentes
            .filter((c) => c.componente_produto_id)
            .map((c) => ({
              componente_produto_id: c.componente_produto_id,
              quantidade: Number(c.quantidade.replace(',', '.')) || 1,
            }))
        );
      }

      toast({ title: isEdit ? 'Produto atualizado' : 'Produto criado' });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Erro ao salvar produto',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar produto' : 'Novo produto'}
          </DialogTitle>
          <DialogDescription>
            Espaçadores, brinquedos e kits vendidos na clínica.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Foto do produto (comprimida no cliente) */}
          <div className="flex items-center gap-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-muted">
              {fotoAtual ? (
                <img
                  src={fotoAtual}
                  alt="Foto do produto"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <ImagePlus className="h-6 w-6" />
                </div>
              )}
              {processandoFoto && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Foto</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  asChild
                  disabled={processandoFoto}
                >
                  <label className="cursor-pointer">
                    <ImagePlus className="mr-1 h-4 w-4" />
                    {fotoAtual ? 'Trocar' : 'Adicionar'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFotoSelect}
                    />
                  </label>
                </Button>
                {fotoAtual && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleFotoRemove}
                    className="text-destructive"
                  >
                    <X className="mr-1 h-4 w-4" /> Remover
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Otimizada automaticamente para miniatura.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="produto-nome">Nome</Label>
            <Input
              id="produto-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Espaçador Kids"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select
                value={categoria}
                onValueChange={(v) => setCategoria(v as CategoriaVenda)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORIA_LABELS) as CategoriaVenda[]).map(
                    (c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORIA_LABELS[c]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="produto-preco">Preço de venda</Label>
              <CurrencyInput
                id="produto-preco"
                value={preco}
                onChange={setPreco}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="produto-desc">Descrição (opcional)</Label>
            <Textarea
              id="produto-desc"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
            />
          </div>

          {/* Kit */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="cursor-pointer">É um kit</Label>
              <p className="text-xs text-muted-foreground">
                O kit consome componentes do estoque ao ser vendido.
              </p>
            </div>
            <Switch checked={ehKit} onCheckedChange={setEhKit} />
          </div>

          {ehKit ? (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label>Componentes do kit</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addComponente}
                  className="gap-1"
                >
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              </div>
              {componentes.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhum componente. Adicione os produtos que formam o kit.
                </p>
              )}
              {componentes.map((linha, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    value={linha.componente_produto_id}
                    onValueChange={(v) =>
                      updateComponente(i, { componente_produto_id: v })
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Produto componente" />
                    </SelectTrigger>
                    <SelectContent>
                      {componentesElegiveis.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="w-20"
                    inputMode="numeric"
                    value={linha.quantidade}
                    onChange={(e) =>
                      updateComponente(i, { quantidade: e.target.value })
                    }
                    aria-label="Quantidade no kit"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeComponente(i)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="cursor-pointer">Controla estoque</Label>
                  <p className="text-xs text-muted-foreground">
                    Baixa automática ao vender; alerta de estoque baixo.
                  </p>
                </div>
                <Switch
                  checked={controlaEstoque}
                  onCheckedChange={setControlaEstoque}
                />
              </div>
              {controlaEstoque && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="produto-min">Estoque mínimo</Label>
                    <Input
                      id="produto-min"
                      inputMode="numeric"
                      value={estoqueMinimoStr}
                      onChange={(e) => setEstoqueMinimoStr(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="produto-un">Unidade</Label>
                    <Input
                      id="produto-un"
                      value={unidade}
                      onChange={(e) => setUnidade(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {isEdit && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label className="cursor-pointer">Produto ativo</Label>
              <Switch checked={ativo} onCheckedChange={setAtivo} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
