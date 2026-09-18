// AI dev note: Convites da Pesquisa de Experiência (painel da secretaria/admin).
// Lista do servidor (fn_pesquisa_lista) em ordem de sessão mais recente, sem
// filtro por "quem gostou": a secretária segue a ordem. Convidar = mensagem
// neutra editável → registra o convite (servidor decide se conta) → abre o
// WhatsApp. "Já respondeu" marca o responsável por 6 meses e tira da lista.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Skeleton } from '@/components/primitives/skeleton';
import { Textarea } from '@/components/primitives/textarea';
import { Progress } from '@/components/primitives/progress';
import { useToast } from '@/components/primitives/use-toast';
import {
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { buildWhatsAppLink } from '@/lib/inatividade-api';
import { fetchMetasDashboard } from '@/lib/metas-api';
import { markResponsibleExperienceSurveyAnswered } from '@/lib/patient-api';
import {
  fetchPesquisaLista,
  linkPublicoPesquisa,
  montarConvitePesquisa,
  registrarConvitePesquisa,
  type FamiliaPesquisa,
} from '@/lib/pesquisa-convites-api';
import type { MetaDashboard } from '@/types/metas';

const dataBR = (d: string | null) =>
  d ? d.slice(0, 10).split('-').reverse().join('/') : '—';

export const PesquisaConvitesManager: React.FC<{ maxItems?: number }> = ({
  maxItems = 15,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [lista, setLista] = useState<FamiliaPesquisa[]>([]);
  const [metas, setMetas] = useState<MetaDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'convidar' | 'convidados'>('convidar');
  const [alvo, setAlvo] = useState<FamiliaPesquisa | null>(null);
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const hoje = new Date();
      const [l, m] = await Promise.all([
        fetchPesquisaLista(),
        fetchMetasDashboard({
          mes: hoje.getMonth() + 1,
          ano: hoje.getFullYear(),
        }),
      ]);
      setLista(l);
      setMetas(
        m.filter((x) => x.categoria === 'experiencia' && x.status === 'ativa')
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const filtrados = useMemo(
    () =>
      lista
        .filter((f) =>
          filtro === 'convidar' ? f.conta_para_meta : !f.conta_para_meta
        )
        .sort((a, b) => (a.ultima_sessao < b.ultima_sessao ? 1 : -1)),
    [lista, filtro]
  );
  const paraConvidar = lista.filter((f) => f.conta_para_meta).length;

  const abrir = (f: FamiliaPesquisa) => {
    setAlvo(f);
    setMensagem(
      montarConvitePesquisa({
        responsavelNome: f.responsavel_nome,
        secretariaNome: user?.pessoa?.nome ?? null,
        link: linkPublicoPesquisa(),
      })
    );
  };

  const convidar = async () => {
    if (!alvo) return;
    const link = buildWhatsAppLink(alvo.responsavel_telefone, mensagem);
    // Abre antes do await: depois dele o navegador trata como pop-up e bloqueia.
    if (link) window.open(link, '_blank', 'noopener,noreferrer');
    setSalvando(true);
    try {
      const r = await registrarConvitePesquisa(alvo.responsavel_id, mensagem);
      toast({
        title: r.conta_para_meta
          ? 'Convite registrado e contando para a meta'
          : 'Convite registrado',
        description: r.conta_para_meta
          ? undefined
          : `Não conta para a meta: ${r.motivo ?? 'fora das regras'}.`,
      });
      setAlvo(null);
      void carregar();
    } catch (e) {
      toast({
        title: 'Erro ao registrar convite',
        description: e instanceof Error ? e.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  const marcarRespondida = async (f: FamiliaPesquisa) => {
    try {
      await markResponsibleExperienceSurveyAnswered(
        f.responsavel_id,
        user?.pessoa?.id ?? null
      );
      toast({
        title: 'Marcado como respondida',
        description: 'A família volta para a lista daqui a 6 meses.',
      });
      void carregar();
    } catch (e) {
      toast({
        title: 'Erro ao marcar',
        description: e instanceof Error ? e.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    }
  };

  const convites = metas.find(
    (m) => m.tipo_meta_codigo === 'pesquisa_convites'
  );
  const respostas = metas.find(
    (m) => m.tipo_meta_codigo === 'pesquisa_respostas'
  );

  return (
    <Card className="border-verde-pipa/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-5 w-5 text-azul-respira" />
            Pesquisa de experiência
            {paraConvidar > 0 && (
              <Badge variant="secondary" className="ml-1">
                {paraConvidar} para convidar
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => void carregar()}
            disabled={loading}
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            Atualizar
          </Button>
        </div>

        {(convites || respostas) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 rounded-md bg-muted/40 p-3">
            {[convites, respostas].map(
              (m) =>
                m && (
                  <div key={m.id} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium">
                        {m.tipo_meta_codigo === 'pesquisa_convites'
                          ? 'Convites no mês'
                          : 'Respostas no mês'}
                      </span>
                      <span>
                        {Number(m.valor_atual)} / {Number(m.valor_meta)}
                      </span>
                    </div>
                    <Progress
                      value={Math.min(100, Number(m.percentual_atingido) || 0)}
                      className="h-2"
                    />
                  </div>
                )
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 mt-3">
          <Button
            size="sm"
            className="h-7 text-xs"
            variant={filtro === 'convidar' ? 'default' : 'outline'}
            onClick={() => setFiltro('convidar')}
          >
            Para convidar
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            variant={filtro === 'convidados' ? 'default' : 'outline'}
            onClick={() => setFiltro('convidados')}
          >
            Convidadas nos últimos 30 dias
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          Famílias com 3 ou mais sessões nos últimos 60 dias. Siga a ordem da
          lista: a meta conta convites e respostas, nunca a nota.
        </p>
      </CardHeader>

      <CardContent className="pt-0">
        {erro && <p className="text-sm text-destructive mb-2">{erro}</p>}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Ninguém nessa lista agora.
          </div>
        ) : (
          <div className="space-y-2">
            {filtrados.slice(0, maxItems).map((f) => (
              <div
                key={f.responsavel_id}
                className="flex items-start justify-between gap-3 p-3 rounded-md border"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">
                    {f.responsavel_nome ?? 'Responsável sem nome'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {f.pacientes && <span>Paciente: {f.pacientes}</span>}
                    <span>
                      {f.sessoes_60d} sessões em 60 dias · última em{' '}
                      {dataBR(f.ultima_sessao)}
                    </span>
                    {f.ultimo_convite_em && (
                      <span>Convidada em {dataBR(f.ultimo_convite_em)}</span>
                    )}
                    {!f.responsavel_telefone && (
                      <span className="text-destructive">sem telefone</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    className="h-7"
                    variant={f.conta_para_meta ? 'default' : 'outline'}
                    onClick={() => abrir(f)}
                    disabled={!f.responsavel_telefone}
                  >
                    Convidar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => void marcarRespondida(f)}
                    title="A família avisou que respondeu"
                  >
                    Já respondeu
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!alvo} onOpenChange={(o) => !o && setAlvo(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              Convidar {alvo?.responsavel_nome ?? 'família'} para a pesquisa
            </DialogTitle>
          </DialogHeader>
          {alvo && !alvo.conta_para_meta && (
            <div className="rounded-md bg-amarelo-pipa/20 p-2 text-xs">
              Esta família já foi convidada nos últimos 30 dias. Pode mandar de
              novo, mas não conta para a meta.
            </div>
          )}
          <Textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            rows={9}
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Mantenha o texto neutro: não peça elogio nem nota alta.
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              variant="outline"
              onClick={() => setAlvo(null)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void convidar()}
              disabled={salvando}
              className="gap-2"
            >
              {salvando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Registrar e abrir WhatsApp
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

PesquisaConvitesManager.displayName = 'PesquisaConvitesManager';
