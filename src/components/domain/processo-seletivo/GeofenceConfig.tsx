// AI dev note: Configuração da cerca virtual (geofence) do ponto — define o centro
// (posição atual, capturada DENTRO da clínica) + raio, e liga/desliga o bloqueio.
// Fica no topo da aba "Ponto eletrônico" (admin/secretaria). Enquanto não houver
// config ativa, o ponto funciona sem bloqueio por localização.

import React, { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  MapPin,
  Crosshair,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Badge } from '@/components/primitives/badge';
import { useToast } from '@/components/primitives/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchGeofence,
  salvarGeofence,
  getGeolocation,
  type GeofenceConfig as Cerca,
  type Coords,
} from '@/lib/estagio-pontos-api';

export const GeofenceConfig: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const updatedBy = user?.pessoa?.id ?? null;

  const [config, setConfig] = useState<Cerca | null>(null);
  const [open, setOpen] = useState(false);
  const [ativo, setAtivo] = useState(true);
  const [raio, setRaio] = useState('200');
  const [captured, setCaptured] = useState<Coords | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);

  const carregar = useCallback(async () => {
    const c = await fetchGeofence();
    setConfig(c);
    if (c) {
      setAtivo(c.ativo);
      setRaio(String(c.raio_m));
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const capturar = useCallback(async () => {
    setCapturing(true);
    try {
      const c = await getGeolocation();
      if (!c) {
        toast({
          title: 'Sem localização',
          description: 'Ative o GPS e permita a localização no navegador.',
          variant: 'destructive',
        });
        return;
      }
      setCaptured(c);
    } finally {
      setCapturing(false);
    }
  }, [toast]);

  const salvar = useCallback(async () => {
    const centro =
      captured ?? (config ? { lat: config.lat, lng: config.lng } : null);
    if (!centro) {
      toast({
        title: 'Defina o centro',
        description:
          'Capture a posição atual (estando na clínica) antes de salvar.',
        variant: 'destructive',
      });
      return;
    }
    const raioM = Math.max(30, Number(raio) || 200);
    setSaving(true);
    try {
      await salvarGeofence({
        lat: centro.lat,
        lng: centro.lng,
        raioM,
        ativo,
        updatedBy,
      });
      setCaptured(null);
      await carregar();
      toast({ title: 'Local da clínica salvo' });
    } catch {
      toast({ title: 'Falha ao salvar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [captured, config, raio, ativo, updatedBy, carregar, toast]);

  const definido = !!config;
  const bloqueioAtivo = config?.ativo;

  return (
    <div className="rounded-xl border border-border/60 bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 p-3 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="w-4 h-4 text-azul-respira shrink-0" />
          <span className="text-sm font-medium text-foreground">
            Local da clínica (bloqueio por GPS)
          </span>
          {definido ? (
            <Badge variant={bloqueioAtivo ? 'default' : 'secondary'}>
              {bloqueioAtivo ? (
                <ShieldCheck className="w-3 h-3 mr-1" />
              ) : (
                <ShieldOff className="w-3 h-3 mr-1" />
              )}
              {bloqueioAtivo ? `Ativo · ${config?.raio_m}m` : 'Desativado'}
            </Badge>
          ) : (
            <Badge variant="secondary">Não definido</Badge>
          )}
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-border/60 p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Capture a posição <strong>estando dentro da clínica</strong>. Com o
            bloqueio ativo, o ponto só abre a câmera dentro do raio.
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => void capturar()}
              disabled={capturing}
            >
              {capturing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Crosshair className="w-4 h-4" />
              )}
              Usar minha posição atual
            </Button>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Raio (m)</label>
              <Input
                type="number"
                value={raio}
                onChange={(e) => setRaio(e.target.value)}
                className="h-9 w-24 text-sm"
              />
            </div>
            <Button
              type="button"
              variant={ativo ? 'default' : 'outline'}
              size="sm"
              className="gap-2"
              onClick={() => setAtivo((a) => !a)}
            >
              {ativo ? (
                <ShieldCheck className="w-4 h-4" />
              ) : (
                <ShieldOff className="w-4 h-4" />
              )}
              Bloqueio {ativo ? 'ativado' : 'desativado'}
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            {captured ? (
              <span className="text-verde-pipa">
                Nova posição capturada (±{Math.round(captured.precisao)}m).
                Salve para aplicar.
              </span>
            ) : config ? (
              <span>
                Centro atual: {config.lat.toFixed(5)}, {config.lng.toFixed(5)}
              </span>
            ) : (
              <span>Nenhum centro definido ainda.</span>
            )}
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={() => void salvar()} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

GeofenceConfig.displayName = 'GeofenceConfig';
