// Intervalos das medidas da evolução motora (admin).
// Intervalo vazio = sem lembrete automático: a medida só é lembrada quando a
// fisio programa a próxima data na evolução. Os números são decisão clínica
// da equipe; o sistema não traz valor padrão.

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Switch } from '@/components/primitives/switch';
import { useToast } from '@/components/primitives/use-toast';
import {
  fetchConfigMedidas,
  salvarConfigMedida,
  type ConfigMedida,
} from '@/lib/motora-medidas';

export const MedidasConfigManagement: React.FC = () => {
  const { toast } = useToast();
  const [linhas, setLinhas] = useState<ConfigMedida[]>([]);
  const [original, setOriginal] = useState<ConfigMedida[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetchConfigMedidas()
      .then((d) => {
        setLinhas(d);
        setOriginal(d);
      })
      .catch((e) => {
        console.error(e);
        toast({
          title: 'Não foi possível carregar as medidas',
          variant: 'destructive',
        });
      })
      .finally(() => setCarregando(false));
  }, [toast]);

  const alterar = (tipo: string, parcial: Partial<ConfigMedida>) =>
    setLinhas((ls) =>
      ls.map((l) => (l.tipo === tipo ? { ...l, ...parcial } : l))
    );

  const alteradas = linhas.filter(
    (l) =>
      JSON.stringify(l) !==
      JSON.stringify(original.find((o) => o.tipo === l.tipo))
  );

  const salvar = async () => {
    setSalvando(true);
    try {
      for (const l of alteradas) await salvarConfigMedida(l);
      setOriginal(linhas);
      toast({ title: 'Intervalos salvos' });
    } catch (e) {
      console.error(e);
      toast({
        title: 'Erro ao salvar',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  if (carregando)
    return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Medidas da evolução motora</h3>
        <p className="text-sm text-muted-foreground">
          Com intervalo definido, a medida volta a ser lembrada na agenda depois
          desse número de dias desde o último registro. Em branco, ela só é
          lembrada quando a fisio programa a próxima data na evolução. A janela
          é quantos dias antes da data a sessão já recebe o lembrete.
        </p>
      </div>

      <div className="rounded-lg border divide-y">
        {linhas.map((l) => (
          <div
            key={l.tipo}
            className="grid gap-3 p-3 sm:grid-cols-[1fr_9rem_9rem_auto] sm:items-end"
          >
            <div>
              <p className="font-medium">{l.nome}</p>
            </div>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Intervalo (dias)</span>
              <Input
                type="number"
                min={1}
                max={365}
                value={l.intervalo_padrao_dias ?? ''}
                placeholder="Sem lembrete"
                onChange={(e) =>
                  alterar(l.tipo, {
                    intervalo_padrao_dias: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Janela (dias antes)</span>
              <Input
                type="number"
                min={0}
                max={60}
                value={l.janela_antes_dias}
                onChange={(e) =>
                  alterar(l.tipo, {
                    janela_antes_dias: e.target.value
                      ? Number(e.target.value)
                      : 0,
                  })
                }
              />
            </label>
            <label className="flex items-center gap-2 text-sm pb-2">
              <Switch
                checked={l.ativo}
                onCheckedChange={(v) => alterar(l.tipo, { ativo: v })}
              />
              Ativa
            </label>
          </div>
        ))}
      </div>

      <Button onClick={salvar} disabled={salvando || alteradas.length === 0}>
        {salvando ? 'Salvando…' : 'Salvar intervalos'}
      </Button>
    </div>
  );
};
