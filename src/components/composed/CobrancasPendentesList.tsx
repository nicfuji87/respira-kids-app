import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Bell,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Stethoscope,
  User,
  X,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
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
import { Skeleton } from '@/components/primitives/skeleton';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import {
  buildWhatsAppUrl,
  conferirStatusAsaas,
  fetchCobrancasPendentes,
  registrarDisparoManual,
  type CobrancaPendente,
} from '@/lib/cobrancas-api';
import {
  buildMensagemCobranca,
  LABEL_SITUACAO,
  type SituacaoCobranca,
} from '@/lib/cobranca-mensagens';

// AI dev note: Lista das cobranças em aberto para a secretária cobrar MANUALMENTE
// pelo WhatsApp. Junta os dois mundos numa lista só (pré-cobrança e fatura Asaas)
// via vw_cobrancas_pendentes.
//
// O botão não envia nada: confere o status no Asaas, e só então abre o WhatsApp
// Web já na conversa com a mensagem escrita. O clique fica registrado em
// cobranca_disparo_log com canal='whatsapp_manual'.
//
// NÃO existe botão separado de "conferir pagamento": a conferência é parte do
// envio, sempre. Um botão à parte seria uma etapa que alguém esquece de fazer
// justamente quando importa — e o custo de errar aqui é cobrar quem já pagou.

const formatCurrency = (value: number | null) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value ?? 0);

const formatDate = (dateString: string | null) => {
  if (!dateString) return '—';
  const [datePart] = dateString.split('T');
  const [year, month, day] = datePart.split('-');
  if (!year || !month || !day) return dateString;
  return `${day}/${month}/${year}`;
};

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
  });
};

const SITUACAO_STYLES: Record<SituacaoCobranca, string> = {
  pendente: 'bg-blue-100 text-blue-800 border-blue-200',
  atrasada: 'bg-amber-100 text-amber-800 border-amber-200',
  muito_atrasada: 'bg-red-100 text-red-800 border-red-200',
};

type FiltroSituacao = 'todas' | SituacaoCobranca;

const FILTROS: { value: FiltroSituacao; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'muito_atrasada', label: 'Muito atrasadas' },
  { value: 'atrasada', label: 'Atrasadas' },
  { value: 'pendente', label: 'A vencer' },
];

const TODOS = '__todos__';

export interface CobrancasPendentesListProps {
  className?: string;
}

export const CobrancasPendentesList: React.FC<CobrancasPendentesListProps> = ({
  className,
}) => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [cobrancas, setCobrancas] = useState<CobrancaPendente[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processando, setProcessando] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroSituacao>('todas');
  const [vencDe, setVencDe] = useState('');
  const [vencAte, setVencAte] = useState('');
  const [empresaId, setEmpresaId] = useState(TODOS);
  const [profissionalId, setProfissionalId] = useState(TODOS);

  const carregar = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchCobrancasPendentes();
      if (result.success && result.data) {
        setCobrancas(result.data);
      } else {
        setError(result.error || 'Erro ao carregar cobranças');
      }
    } catch (e) {
      console.error('Erro ao carregar cobranças:', e);
      setError('Erro inesperado ao carregar cobranças');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Opções dos selects saem da própria lista — não há por que buscar empresas e
  // profissionais que não têm nada em aberto.
  const empresas = useMemo(() => {
    const mapa = new Map<string, string>();
    cobrancas.forEach((c) => {
      if (c.empresa_id) mapa.set(c.empresa_id, c.empresa_nome || 'Sem nome');
    });
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [cobrancas]);

  const profissionais = useMemo(() => {
    const mapa = new Map<string, string>();
    cobrancas.forEach((c) => {
      (c.profissional_ids || []).forEach((id, i) => {
        if (id) mapa.set(id, c.profissionais?.[i] || 'Sem nome');
      });
    });
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [cobrancas]);

  const filtrosAtivos =
    busca.trim() !== '' ||
    filtro !== 'todas' ||
    vencDe !== '' ||
    vencAte !== '' ||
    empresaId !== TODOS ||
    profissionalId !== TODOS;

  const limparFiltros = () => {
    setBusca('');
    setFiltro('todas');
    setVencDe('');
    setVencAte('');
    setEmpresaId(TODOS);
    setProfissionalId(TODOS);
  };

  const listaFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return cobrancas.filter((c) => {
      if (filtro !== 'todas' && c.situacao !== filtro) return false;
      if (empresaId !== TODOS && c.empresa_id !== empresaId) return false;
      if (
        profissionalId !== TODOS &&
        !(c.profissional_ids || []).includes(profissionalId)
      ) {
        return false;
      }
      // Datas ISO comparam direto como string, sem risco de fuso.
      if (vencDe && (!c.vencimento || c.vencimento < vencDe)) return false;
      if (vencAte && (!c.vencimento || c.vencimento > vencAte)) return false;
      if (!termo) return true;
      return (
        (c.paciente_nome || '').toLowerCase().includes(termo) ||
        (c.responsavel_nome || '').toLowerCase().includes(termo)
      );
    });
  }, [cobrancas, busca, filtro, empresaId, profissionalId, vencDe, vencAte]);

  const resumo = useMemo(() => {
    const total = listaFiltrada.reduce((acc, c) => acc + (c.valor ?? 0), 0);
    const atrasadas = listaFiltrada.filter(
      (c) => c.situacao !== 'pendente'
    ).length;
    return { total, atrasadas, quantidade: listaFiltrada.length };
  }, [listaFiltrada]);

  // AI dev note: Confere no Asaas se já foi paga/excluída. Só faturas têm o que
  // conferir — pré-cobrança ainda nem existe lá. Retorna true se pode cobrar.
  const podeCobrar = async (cobranca: CobrancaPendente): Promise<boolean> => {
    if (cobranca.origem !== 'fatura' || !cobranca.fatura_id) return true;

    const check = await conferirStatusAsaas(cobranca.fatura_id);

    if (!check.success || !check.data) {
      // Falha ao consultar não bloqueia: o status local continua valendo e
      // travar aqui deixaria a secretária sem ação nenhuma.
      toast({
        title: 'Não deu para conferir no Asaas',
        description: `${check.error || 'Erro na consulta'}. Confira o pagamento antes de enviar.`,
        variant: 'destructive',
      });
      return true;
    }

    const { status, requerAjusteManual } = check.data;

    if (requerAjusteManual) {
      toast({
        title: 'Cobrança excluída no Asaas',
        description:
          'O link está morto, não dá para cobrar. Marquei como cancelada e tirei da lista — as sessões precisam ser refaturadas no Financeiro.',
        variant: 'destructive',
      });
      await carregar();
      return false;
    }

    if (status === 'pago') {
      toast({
        title: 'Essa já foi paga',
        description:
          'O pagamento estava registrado no Asaas mas não aqui. Atualizei e tirei da lista.',
      });
      await carregar();
      return false;
    }

    if (status !== 'pendente' && status !== 'atrasado') {
      toast({
        title: `Cobrança agora está como "${status}"`,
        description: 'Atualizei o status. Confira antes de cobrar.',
      });
      await carregar();
      return false;
    }

    return true;
  };

  const handleEnviar = async (cobranca: CobrancaPendente) => {
    if (processando) return;

    const mensagem = buildMensagemCobranca(cobranca.situacao, {
      responsavelNome: cobranca.responsavel_nome,
      pacienteNome: cobranca.paciente_nome,
      descricao: cobranca.descricao,
      valor: cobranca.valor,
      vencimento: cobranca.vencimento,
      diasAtraso: cobranca.dias_atraso,
      link: cobranca.link_pagamento,
    });

    const url = buildWhatsAppUrl(cobranca.responsavel_telefone, mensagem);
    if (!url) {
      toast({
        title: 'Sem telefone',
        description:
          'O responsável pelo pagamento não tem telefone cadastrado. Atualize o cadastro.',
        variant: 'destructive',
      });
      return;
    }

    setProcessando(cobranca.cobranca_id);

    // AI dev note: A aba precisa ser aberta DENTRO do gesto do clique. Depois do
    // await da conferência no Asaas o navegador já não considera mais gesto do
    // usuário e o bloqueador de pop-up mata a janela. Por isso abrimos em branco
    // agora e só navegamos depois — fechando se a cobrança não puder seguir.
    const janela = window.open('', '_blank');

    try {
      const liberado = await podeCobrar(cobranca);

      if (!liberado) {
        janela?.close();
        return;
      }

      if (janela) {
        janela.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }

      const registro = await registrarDisparoManual(cobranca);
      if (!registro.success) {
        toast({
          title: 'WhatsApp aberto, mas não registrei',
          description: registro.error || 'Erro ao registrar o envio.',
          variant: 'destructive',
        });
      }

      await carregar();
    } catch (e) {
      console.error('Erro ao preparar cobrança:', e);
      janela?.close();
      toast({
        title: 'Erro ao abrir a cobrança',
        description: 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setProcessando(null);
    }
  };

  if (isLoading) {
    return (
      <div className={cn('space-y-3', className)}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Resumo — acompanha o filtro, senão o número da tela não bate com a lista */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total em aberto</p>
            <p className="text-2xl font-semibold">
              {formatCurrency(resumo.total)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Cobranças</p>
            <p className="text-2xl font-semibold">{resumo.quantidade}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Em atraso</p>
            <p className="text-2xl font-semibold text-red-700">
              {resumo.atrasadas}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por paciente ou responsável..."
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FILTROS.map((f) => (
                <Button
                  key={f.value}
                  size="sm"
                  variant={filtro === f.value ? 'default' : 'outline'}
                  onClick={() => setFiltro(f.value)}
                >
                  {f.label}
                </Button>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={carregar}
                title="Recarregar lista"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Vencimento de</Label>
              <Input
                type="date"
                value={vencDe}
                onChange={(e) => setVencDe(e.target.value)}
                className="h-10 w-full bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">até</Label>
              <Input
                type="date"
                value={vencAte}
                onChange={(e) => setVencAte(e.target.value)}
                className="h-10 w-full bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Empresa</Label>
              <Select value={empresaId} onValueChange={setEmpresaId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todas</SelectItem>
                  {empresas.map(([id, nome]) => (
                    <SelectItem key={id} value={id}>
                      {nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Profissional</Label>
              <Select value={profissionalId} onValueChange={setProfissionalId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {profissionais.map(([id, nome]) => (
                    <SelectItem key={id} value={id}>
                      {nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {filtrosAtivos && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={limparFiltros}
                className="gap-1.5 text-xs"
              >
                <X className="h-3.5 w-3.5" />
                Limpar filtros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!error && listaFiltrada.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <CheckCircle2 className="h-8 w-8 mx-auto text-green-600" />
            <p className="font-medium">Nenhuma cobrança em aberto por aqui</p>
            <p className="text-sm text-muted-foreground">
              {cobrancas.length > 0
                ? 'Nenhuma cobrança bate com os filtros atuais.'
                : 'Tudo em dia.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Lista */}
      <div className="space-y-3">
        {listaFiltrada.map((c) => {
          const ocupado = processando === c.cobranca_id;
          const semTelefone = !c.responsavel_telefone;
          const bloqueado = c.link_expirado || semTelefone;

          return (
            <Card key={c.cobranca_id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="text-base">
                    {c.paciente_id ? (
                      <button
                        type="button"
                        onClick={() => navigate(`/pacientes/${c.paciente_id}`)}
                        className="text-left hover:text-rosa-suave hover:underline transition-colors"
                        title="Abrir detalhes do paciente"
                      >
                        {c.paciente_nome || 'Paciente sem nome'}
                      </button>
                    ) : (
                      (c.paciente_nome ?? 'Paciente sem nome')
                    )}
                  </CardTitle>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge
                      variant="outline"
                      className={cn('text-xs', SITUACAO_STYLES[c.situacao])}
                    >
                      {LABEL_SITUACAO[c.situacao]}
                      {c.situacao !== 'pendente' && c.dias_atraso
                        ? ` · ${c.dias_atraso}d`
                        : ''}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {c.origem === 'fatura' ? 'Asaas' : 'Pré-cobrança'}
                    </Badge>
                    {c.empresa_nome && (
                      <Badge variant="outline" className="text-xs">
                        {c.empresa_nome}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <User className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {c.responsavel_nome || 'Sem responsável'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                    <span>Venc. {formatDate(c.vencimento)}</span>
                  </div>
                  <div className="font-semibold sm:text-right">
                    {formatCurrency(c.valor)}
                  </div>
                </div>

                {c.profissionais?.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Stethoscope className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {c.profissionais.join(', ')}
                    </span>
                  </div>
                )}

                {c.descricao && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {c.descricao.replace(/\s*\n\s*/g, ' ')}
                  </p>
                )}

                {(c.envios_manuais > 0 || c.lembretes_enviados > 0) && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Bell className="h-3.5 w-3.5" />
                    {c.envios_manuais > 0 ? (
                      <span>
                        Enviada {c.envios_manuais}x pela secretaria
                        {c.ultimo_envio_manual_em
                          ? ` · última em ${formatDateTime(c.ultimo_envio_manual_em)}`
                          : ''}
                        {c.ultimo_envio_manual_por
                          ? ` por ${c.ultimo_envio_manual_por}`
                          : ''}
                      </span>
                    ) : (
                      <span>
                        {c.lembretes_enviados} lembrete(s) automático(s)
                      </span>
                    )}
                  </div>
                )}

                {semTelefone && (
                  <Alert variant="destructive" className="py-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Responsável sem telefone cadastrado.
                    </AlertDescription>
                  </Alert>
                )}

                {c.link_expirado && (
                  <Alert className="py-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      O link de pagamento expirou — gere um novo no Financeiro
                      antes de cobrar.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => handleEnviar(c)}
                    disabled={ocupado || bloqueado}
                    className="gap-2 flex-1 sm:flex-none"
                  >
                    {ocupado ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MessageCircle className="h-4 w-4" />
                    )}
                    {ocupado ? 'Conferindo no Asaas...' : 'Enviar cobrança'}
                  </Button>

                  {c.link_pagamento && (
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() =>
                        window.open(
                          c.link_pagamento as string,
                          '_blank',
                          'noopener,noreferrer'
                        )
                      }
                      title={
                        c.origem === 'fatura'
                          ? 'Abrir a fatura no Asaas'
                          : 'Abrir a página de pagamento'
                      }
                    >
                      <ExternalLink className="h-4 w-4" />
                      {c.origem === 'fatura'
                        ? 'Ver fatura'
                        : 'Ver link de pagamento'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

CobrancasPendentesList.displayName = 'CobrancasPendentesList';
