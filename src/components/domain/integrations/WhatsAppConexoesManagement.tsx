// AI dev note: Configurações > Integrações > WhatsApp (só admin na aba; a edge
// também aceita secretaria).
//
// O número da recepção tem dois "aparelhos conectados": a uazapi (Ju e automações)
// e o "sistema" (servidor QuePasa que alimenta o Chatwoot). Os dois caem de vez em
// quando; aqui dá para ver o status, gerar o QR para reconectar e ler as
// orientações que evitam novas quedas. O QR só é gerado depois do checklist de
// preparo do celular (remover o aparelho antigo, limpar cache, reiniciar).
// Tokens ficam no Vault, ver supabase/functions/whatsapp-conexoes.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Checkbox } from '@/components/primitives/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { useToast } from '@/components/primitives/use-toast';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  QrCode,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  buscarStatusWhatsApp,
  gerarQrWhatsApp,
  reiniciarChatwootWhatsApp,
  type InstanciaWhatsApp,
  type StatusConexaoWhatsApp,
} from '@/lib/whatsapp-conexoes-api';

interface InfoInstancia {
  titulo: string;
  // nome que aparece em WhatsApp > Aparelhos conectados
  aparelho: string;
  usadoPor: string;
  quandoCai: string;
  // quanto tempo a tela espera a leitura antes de dar o QR como vencido
  segundosQr: number;
  // a uazapi renova o QR sozinha enquanto espera; o QuePasa não
  qrRenovaSozinho: boolean;
}

const INFO: Record<InstanciaWhatsApp, InfoInstancia> = {
  uazapi: {
    titulo: 'uazapi',
    aparelho: 'uazapi',
    usadoPor:
      'Ju, lembretes de consulta, cobranças e avisos automáticos, etiquetas e grupos.',
    quandoCai:
      'A Ju para de responder e os envios automáticos falham (as cobranças ficam com erro no log de disparo).',
    segundosQr: 120,
    qrRenovaSozinho: true,
  },
  chatwoot: {
    titulo: 'sistema (Chatwoot)',
    aparelho: 'sistema',
    usadoPor:
      'Caixa de entrada do Chatwoot e 1º canal do envio de fatura (a uazapi é o reserva).',
    quandoCai:
      'As mensagens dos clientes param de chegar no Chatwoot e a equipe não consegue responder por lá.',
    segundosQr: 45,
    qrRenovaSozinho: false,
  },
};

const ORDEM: InstanciaWhatsApp[] = ['uazapi', 'chatwoot'];

const ESTADO_BADGE: Record<
  StatusConexaoWhatsApp['estado'],
  {
    label: string;
    variant: 'success' | 'warning' | 'attention' | 'muted';
  }
> = {
  conectado: { label: 'Conectado', variant: 'success' },
  conectando: { label: 'Aguardando leitura do QR', variant: 'warning' },
  desconectado: { label: 'Desconectado', variant: 'attention' },
  indisponivel: { label: 'Sem resposta', variant: 'muted' },
};

const formatData = (s: string | null) =>
  s
    ? new Date(s).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : null;

function formatTelefone(n: string | null) {
  if (!n) return '—';
  const d = n.replace(/\D/g, '');
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : n;
}

const PREPARO = (aparelho: string) => [
  {
    id: 'remover',
    texto: (
      <>
        No celular da recepção, abra o WhatsApp &gt; <b>Aparelhos conectados</b>{' '}
        e remova o aparelho <b>“{aparelho}”</b>, se ele ainda aparecer.
      </>
    ),
  },
  {
    id: 'cache',
    texto: (
      <>
        Limpe o cache do WhatsApp: Configurações do celular &gt; Apps &gt;
        WhatsApp Business &gt; Armazenamento &gt; <b>Limpar cache</b>.{' '}
        <span className="font-semibold text-destructive">
          Não toque em “Limpar dados”: isso apaga as conversas do celular.
        </span>
      </>
    ),
  },
  {
    id: 'reiniciar',
    texto: (
      <>
        <b>Reinicie o celular</b> e espere ele voltar com internet (Wi-Fi da
        clínica ou 4G).
      </>
    ),
  },
  {
    id: 'tela',
    texto: (
      <>
        Abra o WhatsApp e deixe na tela{' '}
        <b>Aparelhos conectados &gt; Conectar aparelho</b>, pronto para ler o
        QR.
      </>
    ),
  },
];

const DICAS: { titulo: string; texto: string }[] = [
  {
    titulo: 'Celular sempre ligado e com internet',
    texto:
      'Deixe o celular da recepção na tomada, no Wi-Fi da clínica. Aparelho desligado ou sem rede por muito tempo derruba as duas conexões.',
  },
  {
    titulo: 'Abrir o WhatsApp no celular todo dia',
    texto:
      'Se o celular principal passar 14 dias sem abrir o WhatsApp, o próprio WhatsApp desconecta todos os aparelhos conectados.',
  },
  {
    titulo: 'Tirar o WhatsApp da economia de bateria',
    texto:
      'Configurações > Apps > WhatsApp Business > Bateria > “Sem restrições”. Com restrição, o Android fecha o app e as conexões caem.',
  },
  {
    titulo: 'No máximo 4 aparelhos conectados',
    texto:
      'É o limite do WhatsApp, e a uazapi e o sistema já ocupam dois. Remova WhatsApp Web de computadores que ninguém usa.',
  },
  {
    titulo: 'Nunca “Sair de todos os aparelhos”',
    texto:
      'E não desconecte à mão os aparelhos “uazapi” e “sistema”. Só remova quando for reconectar por esta tela.',
  },
  {
    titulo: 'Avisar antes de mexer no celular ou no app',
    texto:
      'Reinstalar o WhatsApp, trocar de chip ou de celular e restaurar backup derrubam as duas conexões na hora.',
  },
  {
    titulo: 'WhatsApp atualizado e hora automática',
    texto:
      'Atualize o WhatsApp Business pela Play Store e mantenha data e hora do celular no automático. Versão velha ou hora errada causam quedas.',
  },
  {
    titulo: 'Sem QR em sequência',
    texto:
      'Se a leitura falhar, espere um minuto antes de gerar outro. Muitas tentativas seguidas fazem o WhatsApp bloquear novas conexões por um tempo.',
  },
  {
    titulo: 'Cuidado com mensagens em massa',
    texto:
      'Muitas mensagens iguais para números que não salvaram o contato da clínica geram denúncias e podem bloquear o número.',
  },
];

// ---------------------------------------------------------------------------

export const WhatsAppConexoesManagement: React.FC = () => {
  const { toast } = useToast();
  const [conexoes, setConexoes] = useState<StatusConexaoWhatsApp[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [verificadoEm, setVerificadoEm] = useState<Date | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [reiniciando, setReiniciando] = useState(false);
  const [alvo, setAlvo] = useState<InstanciaWhatsApp | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setConexoes(await buscarStatusWhatsApp());
      setVerificadoEm(new Date());
      setErroGeral(null);
    } catch (e) {
      setErroGeral((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const reiniciar = async () => {
    setReiniciando(true);
    try {
      await reiniciarChatwootWhatsApp();
      toast({
        title: 'Conexão reiniciada',
        description:
          'Aguarde uns 30 segundos e clique em Atualizar para ver se voltou.',
      });
      setTimeout(carregar, 15000);
    } catch (e) {
      toast({
        title: 'Não foi possível reiniciar',
        description: (e as Error).message,
        variant: 'destructive',
      });
    } finally {
      setReiniciando(false);
    }
  };

  const porInstancia = (i: InstanciaWhatsApp) =>
    conexoes.find((c) => c.instancia === i);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>WhatsApp da recepção</CardTitle>
            <CardDescription>
              O número da recepção fica ligado a duas conexões. Quando uma cai,
              gere o QR aqui e leia com o celular da recepção.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={carregar}
            disabled={carregando}
          >
            {carregando ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Atualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {erroGeral && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Não foi possível consultar as conexões: {erroGeral}</span>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {ORDEM.map((inst) => (
              <CartaoConexao
                key={inst}
                instancia={inst}
                status={porInstancia(inst)}
                carregando={carregando && conexoes.length === 0}
                reiniciando={reiniciando}
                onGerarQr={() => setAlvo(inst)}
                onReiniciar={inst === 'chatwoot' ? reiniciar : undefined}
              />
            ))}
          </div>

          {verificadoEm && (
            <p className="text-xs text-muted-foreground">
              Verificado às{' '}
              {verificadoEm.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              .
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Para não cair com frequência
          </CardTitle>
          <CardDescription>
            A maioria das quedas começa no celular principal. Combine estes
            cuidados com quem fica com o celular da recepção.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-x-6 gap-y-4 md:grid-cols-2">
            {DICAS.map((d) => (
              <li key={d.titulo} className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{d.titulo}</p>
                  <p className="text-sm text-muted-foreground">{d.texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {alvo && (
        <DialogQr
          instancia={alvo}
          onFechar={() => {
            setAlvo(null);
            carregar();
          }}
          onConectou={(c) =>
            setConexoes((atual) =>
              atual.map((x) => (x.instancia === c.instancia ? c : x))
            )
          }
        />
      )}
    </div>
  );
};

WhatsAppConexoesManagement.displayName = 'WhatsAppConexoesManagement';

// ---------------------------------------------------------------------------

interface CartaoConexaoProps {
  instancia: InstanciaWhatsApp;
  status?: StatusConexaoWhatsApp;
  carregando: boolean;
  reiniciando: boolean;
  onGerarQr: () => void;
  onReiniciar?: () => void;
}

const CartaoConexao: React.FC<CartaoConexaoProps> = ({
  instancia,
  status,
  carregando,
  reiniciando,
  onGerarQr,
  onReiniciar,
}) => {
  const info = INFO[instancia];
  const badge = status ? ESTADO_BADGE[status.estado] : null;
  const conectado = !!status?.conectado;
  const queda = formatData(status?.ultima_queda ?? null);

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-4',
        status && !conectado && 'border-vermelho-kids'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">{info.titulo}</span>
        </div>
        {carregando ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          badge && <Badge variant={badge.variant}>{badge.label}</Badge>
        )}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Número</dt>
        <dd>{formatTelefone(status?.numero ?? null)}</dd>
        <dt className="text-muted-foreground">Usado por</dt>
        <dd>{info.usadoPor}</dd>
        {queda && (
          <>
            <dt className="text-muted-foreground">
              {conectado ? 'Última queda' : 'Caiu em'}
            </dt>
            <dd>
              {queda}
              {status?.motivo_queda && (
                <span className="text-muted-foreground">
                  {' '}
                  · {status.motivo_queda}
                </span>
              )}
            </dd>
          </>
        )}
      </dl>

      {status?.erro && (
        <p className="text-sm text-destructive">{status.erro}</p>
      )}

      {status && !conectado && (
        <p className="rounded-md bg-vermelho-kids/30 p-2 text-sm">
          {info.quandoCai}
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <Button
          size="sm"
          onClick={onGerarQr}
          disabled={carregando || conectado}
          title={conectado ? 'Já está conectado' : undefined}
        >
          <QrCode />
          Gerar QR code
        </Button>
        {onReiniciar && !conectado && status && (
          <Button
            size="sm"
            variant="outline"
            onClick={onReiniciar}
            disabled={reiniciando}
            title="Tenta reconectar sem QR. Use primeiro quando a queda foi de rede."
          >
            {reiniciando ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            Reiniciar conexão
          </Button>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

interface DialogQrProps {
  instancia: InstanciaWhatsApp;
  onFechar: () => void;
  onConectou: (c: StatusConexaoWhatsApp) => void;
}

const DialogQr: React.FC<DialogQrProps> = ({
  instancia,
  onFechar,
  onConectou,
}) => {
  const info = INFO[instancia];
  const { toast } = useToast();
  const passos = PREPARO(info.aparelho);
  const [feitos, setFeitos] = useState<Record<string, boolean>>({});
  const [etapa, setEtapa] = useState<'preparo' | 'qr' | 'conectado'>('preparo');
  const [qr, setQr] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [restante, setRestante] = useState(0);
  const vencido = etapa === 'qr' && !!qr && restante <= 0;
  const ativo = useRef(true);

  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);

  const tudoFeito = passos.every((p) => feitos[p.id]);

  const gerar = async () => {
    setGerando(true);
    setErro(null);
    try {
      const code = await gerarQrWhatsApp(instancia);
      if (!ativo.current) return;
      setQr(code);
      setRestante(info.segundosQr);
      setEtapa('qr');
    } catch (e) {
      setErro((e as Error).message);
      setEtapa('qr');
      setQr(null);
    } finally {
      setGerando(false);
    }
  };

  // contagem regressiva do QR
  useEffect(() => {
    if (etapa !== 'qr' || !qr || restante <= 0) return;
    const t = setTimeout(() => setRestante((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [etapa, qr, restante]);

  // enquanto o QR está na tela, consulta o status para saber se conectou
  // (e, na uazapi, pegar o QR novo que ela gera sozinha)
  useEffect(() => {
    if (etapa !== 'qr' || !qr || vencido) return;
    const t = setInterval(async () => {
      try {
        const lista = await buscarStatusWhatsApp();
        if (!ativo.current) return;
        const s = lista.find((c) => c.instancia === instancia);
        if (!s) return;
        if (s.conectado) {
          setEtapa('conectado');
          onConectou(s);
          toast({ title: `${info.titulo}: conectado de novo` });
        } else if (info.qrRenovaSozinho && s.qrcode && s.qrcode !== qr) {
          setQr(s.qrcode);
        }
      } catch {
        // falha pontual de rede: tenta de novo no próximo ciclo
      }
    }, 4000);
    return () => clearInterval(t);
  }, [etapa, qr, vencido, instancia, info, onConectou, toast]);

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reconectar {info.titulo}</DialogTitle>
          <DialogDescription>
            {etapa === 'preparo'
              ? 'Antes de gerar o QR, prepare o celular da recepção. Marque cada passo conforme fizer.'
              : etapa === 'conectado'
                ? 'Pronto. A conexão voltou.'
                : 'Leia o QR com o celular da recepção em Aparelhos conectados > Conectar aparelho.'}
          </DialogDescription>
        </DialogHeader>

        {etapa === 'preparo' && (
          <ol className="space-y-3">
            {passos.map((p, i) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm has-[:checked]:bg-muted/50">
                  <Checkbox
                    className="mt-0.5"
                    checked={!!feitos[p.id]}
                    onCheckedChange={(v) =>
                      setFeitos((f) => ({ ...f, [p.id]: v === true }))
                    }
                  />
                  <span>
                    <span className="mr-1 font-semibold">{i + 1}.</span>
                    {p.texto}
                  </span>
                </label>
              </li>
            ))}
          </ol>
        )}

        {etapa === 'qr' && (
          <div className="flex flex-col items-center gap-3">
            {erro ? (
              <div className="flex w-full items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{erro}</span>
              </div>
            ) : (
              qr && (
                <>
                  <div className="relative">
                    <img
                      src={qr}
                      alt="QR code para conectar o WhatsApp"
                      className={cn(
                        'h-64 w-64 rounded-lg border bg-white p-2',
                        vencido && 'opacity-20'
                      )}
                    />
                    {vencido && (
                      <span className="absolute inset-0 flex items-center justify-center text-center text-sm font-semibold">
                        QR vencido
                      </span>
                    )}
                  </div>
                  <p className="text-sm">
                    {vencido ? (
                      'O tempo acabou. Espere alguns segundos e gere outro.'
                    ) : (
                      <>
                        Vale por mais <b>{restante}s</b>
                        {info.qrRenovaSozinho
                          ? ' (o QR se renova sozinho nesse tempo).'
                          : '.'}
                      </>
                    )}
                  </p>
                  {!vencido && (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Esperando a leitura…
                    </p>
                  )}
                </>
              )
            )}
            <p className="text-xs text-muted-foreground">
              {info.qrRenovaSozinho
                ? 'Cada QR do WhatsApp vale cerca de 20 segundos; a tela troca por um novo sozinha por até 2 minutos.'
                : 'Este QR não se renova sozinho e vale menos de 1 minuto. Deixe o celular já na tela de leitura antes de gerar.'}
            </p>
          </div>
        )}

        {etapa === 'conectado' && (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-primary" />
            <p className="text-sm">
              Confira no celular se o aparelho “{info.aparelho}” aparece em
              Aparelhos conectados.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {etapa === 'conectado' ? (
            <Button onClick={onFechar}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onFechar}>
                Cancelar
              </Button>
              {etapa === 'preparo' && (
                <Button onClick={gerar} disabled={!tudoFeito || gerando}>
                  {gerando ? <Loader2 className="animate-spin" /> : <QrCode />}
                  Já fiz tudo, gerar QR
                </Button>
              )}
              {etapa === 'qr' && (erro || vencido) && (
                <Button onClick={gerar} disabled={gerando}>
                  {gerando ? <Loader2 className="animate-spin" /> : <QrCode />}
                  Gerar outro QR
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
