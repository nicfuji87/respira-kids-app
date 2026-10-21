// AI dev note: Configurações > Integrações > Boletos por e-mail (só admin).
//
// Três blocos: caixas do Gmail conectadas (OAuth só leitura), remetentes cujos
// boletos viram conta a pagar, e o registro do que foi lido. A leitura roda sozinha
// (pg_cron → edge email-boletos a cada 15 min em horário comercial); "Ler agora"
// só antecipa. Nada aqui paga: o pagamento é agendado pelo link que a Ju manda no
// grupo de notas (/#/boleto/:id).

import React, { useCallback, useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { Switch } from '@/components/primitives/switch';
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
import { useToast } from '@/components/primitives/use-toast';
import {
  AlertTriangle,
  Inbox,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  definirCaixaAtiva,
  excluirRemetente,
  lerEmailsAgora,
  listarCaixas,
  listarContasFixas,
  listarEmailsLidos,
  listarFornecedoresAtivos,
  listarRemetentes,
  salvarRemetente,
  urlConectarGmail,
  type EmailCaixa,
  type EmailLido,
  type OpcaoSimples,
  type RemetenteBoleto,
  type RemetenteInput,
} from '@/lib/boletos-email-api';

const formatData = (s: string | null) =>
  s
    ? new Date(s).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '—';

const STATUS_EMAIL: Record<
  EmailLido['status'],
  { label: string; cls: string }
> = {
  boleto: {
    label: 'Boleto',
    cls: 'bg-verde-pipa/20 text-roxo-titulo border-verde-pipa/40',
  },
  duplicado: { label: 'Repetido', cls: 'bg-muted text-muted-foreground' },
  sem_boleto: {
    label: 'Sem boleto',
    cls: 'bg-amarelo-pipa/20 text-roxo-titulo border-amarelo-pipa/40',
  },
  ignorado: { label: 'Ignorado', cls: 'bg-muted text-muted-foreground' },
  erro: {
    label: 'Erro',
    cls: 'bg-destructive/10 text-destructive border-destructive/30',
  },
};

const NOVO: RemetenteInput = {
  email: '',
  fornecedor_id: '',
  lancamento_recorrente_id: null,
  identificador: null,
  observacao: null,
  ativo: true,
};

export const BoletosEmailManagement: React.FC = () => {
  const { toast } = useToast();
  const [caixas, setCaixas] = useState<EmailCaixa[]>([]);
  const [remetentes, setRemetentes] = useState<RemetenteBoleto[]>([]);
  const [lidos, setLidos] = useState<EmailLido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [lendo, setLendo] = useState(false);

  const [fornecedores, setFornecedores] = useState<OpcaoSimples[]>([]);
  const [contasFixas, setContasFixas] = useState<OpcaoSimples[]>([]);
  const [editando, setEditando] = useState<{
    id?: string;
    dados: RemetenteInput;
  } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [c, r, l] = await Promise.all([
        listarCaixas(),
        listarRemetentes(),
        listarEmailsLidos(),
      ]);
      setCaixas(c);
      setRemetentes(r);
      setLidos(l);
    } catch (e) {
      toast({
        title: 'Não foi possível carregar',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const fornecedorId = editando?.dados.fornecedor_id;
  useEffect(() => {
    if (!fornecedorId) {
      setContasFixas([]);
      return;
    }
    listarContasFixas(fornecedorId)
      .then(setContasFixas)
      .catch(() => setContasFixas([]));
  }, [fornecedorId]);

  const abrirEdicao = async (r?: RemetenteBoleto) => {
    if (!fornecedores.length) {
      try {
        setFornecedores(await listarFornecedoresAtivos());
      } catch {
        // a lista vazia já mostra que algo deu errado
      }
    }
    setEditando(
      r
        ? {
            id: r.id,
            dados: {
              email: r.email,
              fornecedor_id: r.fornecedor_id,
              lancamento_recorrente_id: r.lancamento_recorrente_id,
              identificador: r.identificador,
              observacao: r.observacao,
              ativo: r.ativo,
            },
          }
        : { dados: { ...NOVO } }
    );
  };

  const salvar = async () => {
    if (!editando) return;
    const { dados } = editando;
    if (!/@/.test(dados.email) || !dados.fornecedor_id) {
      toast({
        title: 'Faltam dados',
        description: 'Informe o e-mail (ou @domínio) e o fornecedor.',
        variant: 'destructive',
      });
      return;
    }
    setSalvando(true);
    try {
      await salvarRemetente(dados, editando.id);
      setEditando(null);
      await carregar();
    } catch (e) {
      toast({
        title: 'Não foi possível salvar',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (r: RemetenteBoleto) => {
    try {
      await excluirRemetente(r.id);
      await carregar();
    } catch (e) {
      toast({
        title: 'Não foi possível remover',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const lerAgora = async () => {
    setLendo(true);
    try {
      await lerEmailsAgora();
      await carregar();
      toast({ title: 'Caixas lidas' });
    } catch (e) {
      toast({
        title: 'A leitura falhou',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setLendo(false);
    }
  };

  const alternarCaixa = async (c: EmailCaixa) => {
    try {
      await definirCaixaAtiva(c.id, !c.ativo);
      await carregar();
    } catch (e) {
      toast({
        title: 'Não foi possível alterar',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  const dados = editando?.dados;
  const setDados = (parcial: Partial<RemetenteInput>) =>
    setEditando((e) => (e ? { ...e, dados: { ...e.dados, ...parcial } } : e));

  return (
    <div className="space-y-6">
      {/* Caixas */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Inbox className="h-5 w-5" /> Caixas de e-mail
            </CardTitle>
            <CardDescription>
              O sistema lê só os e-mails com PDF dos remetentes cadastrados
              abaixo, a cada 15 minutos em horário comercial. Acesso somente
              leitura.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void lerAgora()}
            disabled={lendo || !caixas.some((c) => c.conectada && c.ativo)}
            className="shrink-0 gap-2"
          >
            {lendo ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Ler agora
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {caixas.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma caixa conectada ainda.
            </p>
          )}
          {caixas.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{c.email}</p>
                <p className="text-xs text-muted-foreground">
                  Última leitura: {formatData(c.ultima_leitura_em)}
                  {c.conectado_por ? ` · conectada por ${c.conectado_por}` : ''}
                </p>
                {c.ultimo_erro && (
                  <p className="mt-1 flex items-start gap-1 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {c.ultimo_erro}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {c.ultimo_erro && (
                  <Button asChild variant="outline" size="sm">
                    <a href={urlConectarGmail(c.email)}>Reconectar</a>
                  </Button>
                )}
                <Label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={c.ativo}
                    onCheckedChange={() => void alternarCaixa(c)}
                  />
                  {c.ativo ? 'Lendo' : 'Pausada'}
                </Label>
              </div>
            </div>
          ))}
          <Button asChild variant="secondary" className="gap-2">
            <a href={urlConectarGmail()}>
              <Mail className="h-4 w-4" /> Conectar caixa do Gmail
            </a>
          </Button>
          <p className="text-xs text-muted-foreground">
            Faça login com a conta da caixa (ex.:
            financeiro@respirakids.com.br). Se o Google avisar que o app não foi
            verificado, toque em “Avançado” e continue: o acesso é só de
            leitura.
          </p>
        </CardContent>
      </Card>

      {/* Remetentes */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">Remetentes de boletos</CardTitle>
            <CardDescription>
              Quem manda boleto por e-mail. Cada boleto vira conta a pagar e
              chega no grupo de notas com o link para agendar no Inter.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => void abrirEdicao()}
            className="shrink-0 gap-2"
          >
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {remetentes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum remetente cadastrado.
            </p>
          )}
          {remetentes.map((r) => (
            <div
              key={r.id}
              className={cn(
                'flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3',
                !r.ativo && 'opacity-60'
              )}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{r.email}</p>
                <p className="text-sm text-muted-foreground">
                  {r.fornecedor?.nome_fantasia ||
                    r.fornecedor?.nome_razao_social}
                  {r.recorrente?.descricao
                    ? ` · preenche “${r.recorrente.descricao}”`
                    : ''}
                  {r.identificador
                    ? ` · quando citar “${r.identificador}”`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!r.ativo && <Badge variant="outline">Inativo</Badge>}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Editar"
                  onClick={() => void abrirEdicao(r)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remover"
                  onClick={() => void remover(r)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Registro */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">E-mails lidos</CardTitle>
          <CardDescription>Os 30 mais recentes.</CardDescription>
        </CardHeader>
        <CardContent>
          {lidos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada lido ainda.</p>
          ) : (
            <ul className="divide-y">
              {lidos.map((m) => {
                const st = STATUS_EMAIL[m.status];
                return (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-start justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {m.assunto || '(sem assunto)'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.remetente} · {formatData(m.recebido_em)}
                        {m.detalhe ? ` · ${m.detalhe}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.solicitacao_id && m.status === 'boleto' && (
                        <a
                          href={`#/boleto/${m.solicitacao_id}`}
                          className="text-xs text-roxo-titulo underline"
                        >
                          Abrir
                        </a>
                      )}
                      <Badge variant="outline" className={st.cls}>
                        {st.label}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editando?.id ? 'Editar remetente' : 'Novo remetente'}
            </DialogTitle>
            <DialogDescription>
              Só e-mails deste remetente são lidos. Use “@dominio.com.br” para
              aceitar qualquer endereço do domínio.
            </DialogDescription>
          </DialogHeader>

          {dados && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rem-email">E-mail do remetente</Label>
                <Input
                  id="rem-email"
                  value={dados.email}
                  onChange={(e) => setDados({ email: e.target.value })}
                  placeholder="confianca.service@terra.com.br"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Fornecedor</Label>
                <Select
                  value={dados.fornecedor_id || undefined}
                  onValueChange={(v) =>
                    setDados({
                      fornecedor_id: v,
                      lancamento_recorrente_id: null,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    {fornecedores.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Conta fixa que o boleto preenche</Label>
                <Select
                  value={dados.lancamento_recorrente_id ?? '__nenhuma__'}
                  onValueChange={(v) =>
                    setDados({
                      lancamento_recorrente_id: v === '__nenhuma__' ? null : v,
                    })
                  }
                  disabled={!dados.fornecedor_id}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__nenhuma__">
                      Nenhuma (cria uma conta a pagar)
                    </SelectItem>
                    {contasFixas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Ex.: o condomínio já é lançado todo mês com valor zero; o
                  boleto completa o valor e o vencimento em vez de duplicar.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rem-id">
                  Só quando o e-mail citar (opcional)
                </Label>
                <Input
                  id="rem-id"
                  value={dados.identificador ?? ''}
                  onChange={(e) => setDados({ identificador: e.target.value })}
                  placeholder="A-311"
                />
                <p className="text-xs text-muted-foreground">
                  Para quando o mesmo remetente manda boletos de contas
                  diferentes (uma sala e outra, por exemplo).
                </p>
              </div>

              <Label className="flex items-center gap-2">
                <Switch
                  checked={dados.ativo}
                  onCheckedChange={(v) => setDados({ ativo: v })}
                />
                Ativo
              </Label>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void salvar()} disabled={salvando}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

BoletosEmailManagement.displayName = 'BoletosEmailManagement';
