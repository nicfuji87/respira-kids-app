import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Ban,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  RefreshCw,
  Undo2,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { Textarea } from '@/components/primitives/textarea';
import { Label } from '@/components/primitives/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { useToast } from '@/components/primitives/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { emitirNfeFatura } from '@/lib/faturas-api';
import {
  dispensarNfeFatura,
  fetchNfePendencias,
  normalizarMotivo,
  type MotivoNfePendencia,
  type NfePendencia,
} from '@/lib/nfe-pendencias-api';
import {
  FinancialNfeEmissaoMassa,
  type FaturaParaNfe,
} from './FinancialNfeEmissaoMassa';

// AI dev note: painel "Notas pendentes". Mostra TODA fatura paga sem nota
// (vw_nfe_pendencias), agrupada pelo motivo que o banco já classificou, com a
// dica de correção de cada grupo. A ordem dos grupos segue o quanto dá para
// resolver aqui mesmo: cadastro e "nunca pedida" primeiro; o que depende de
// configuração no Asaas (RPS, IBS/CBS) no meio; o que é só esperar no fim.
// "Sem nota por decisão" (recebido em dinheiro) não é pendência: fica por último,
// fechado, e fora dos totais.

interface MotivoInfo {
  titulo: string;
  dica: string;
  // Grupo em que "Emitir/Reemitir" faz sentido. Os de espera (prefeitura,
  // nota já agendada, autorizada) não ganham botão: emitir de novo ali só
  // gera nota duplicada ou erro.
  emitivel: boolean;
}

const MOTIVOS: Record<MotivoNfePendencia, MotivoInfo> = {
  nunca_pedida: {
    titulo: 'Nota nunca pedida',
    dica: 'Nenhuma nota foi pedida para essas cobranças. Use Emitir nota em cada linha ou Emitir todas deste grupo.',
    emitivel: true,
  },
  email: {
    titulo: 'E-mail de quem recebe a nota',
    dica: 'O e-mail está vazio ou inválido. Corrija no cadastro do responsável (ou de quem recebe a nota) e depois reemita.',
    emitivel: true,
  },
  endereco: {
    titulo: 'Endereço incompleto',
    dica: 'Falta endereço ou CEP no cadastro de quem recebe a nota. Complete o cadastro e depois reemita.',
    emitivel: true,
  },
  telefone: {
    titulo: 'Telefone inválido',
    dica: 'O telefone do cadastro foi recusado. Corrija no cadastro de quem recebe a nota e depois reemita.',
    emitivel: true,
  },
  documento: {
    titulo: 'CPF ou CNPJ',
    dica: 'CPF ou CNPJ ausente ou inválido no cadastro de quem recebe a nota. Corrija e depois reemita.',
    emitivel: true,
  },
  rps: {
    titulo: 'RPS já utilizado (prefeitura de Brasília)',
    dica: 'A numeração de RPS da F.S PACHECO ficou atrás da prefeitura. No Asaas, abra Notas Fiscais > Informações Fiscais, ajuste o número do próximo RPS e depois reemita.',
    emitivel: true,
  },
  ibs_cbs: {
    titulo: 'IBS/CBS ausente (reforma tributária)',
    dica: 'Erro EM061: a nota saiu sem o grupo IBS/CBS. A configuração fiscal da BC FISIO no Asaas está sendo corrigida. Reemita só depois que ela estiver certa.',
    emitivel: true,
  },
  e0014_portal: {
    titulo: 'DPS repetida (Portal Nacional)',
    dica: 'Erro E0014 do Portal Nacional, usado pela F.S PACHECO desde 06/11. Reemita uma nota por vez e espere o resultado antes da próxima.',
    emitivel: true,
  },
  cancelamento_anterior: {
    titulo: 'Falha ao cancelar a nota anterior',
    dica: 'O Asaas não conseguiu cancelar a nota antiga. Confira a cobrança no Asaas antes de reemitir.',
    emitivel: true,
  },
  ja_agendada: {
    titulo: 'Nota já agendada',
    dica: 'Já existe uma nota agendada para essa cobrança no Asaas. Normalmente é só esperar. Se demorar, confira no Asaas.',
    emitivel: false,
  },
  erro_sem_detalhe: {
    titulo: 'Erro sem detalhe',
    dica: 'A nota deu erro e o Asaas não informou o motivo. Veja a cobrança no Asaas ou tente reemitir.',
    emitivel: true,
  },
  outro: {
    titulo: 'Outros erros',
    dica: 'Leia a mensagem de cada linha. Se for dado de cadastro, corrija e reemita.',
    emitivel: true,
  },
  em_processamento: {
    titulo: 'Aguardando a prefeitura',
    dica: 'A nota foi enviada e a prefeitura ainda não respondeu. Não precisa fazer nada, só esperar.',
    emitivel: false,
  },
  autorizada_sem_link: {
    titulo: 'Autorizada, link a caminho',
    dica: 'A nota já foi autorizada. O link entra sozinho na próxima sincronização.',
    emitivel: false,
  },
  sem_nota_decisao: {
    titulo: 'Sem nota por decisão',
    dica: 'Recebido em dinheiro ou outro caso em que se decidiu não emitir nota. Não conta como pendência.',
    emitivel: false,
  },
};

const ORDEM_MOTIVOS: MotivoNfePendencia[] = [
  'nunca_pedida',
  'email',
  'endereco',
  'telefone',
  'documento',
  'rps',
  'ibs_cbs',
  'e0014_portal',
  'cancelamento_anterior',
  'ja_agendada',
  'erro_sem_detalhe',
  'outro',
  'em_processamento',
  'autorizada_sem_link',
  'sem_nota_decisao',
];

const EMPRESAS_PADRAO = ['BC FISIO', 'F.S PACHECO'];
const LINHAS_POR_GRUPO = 10;
const MOTIVO_DINHEIRO = 'Recebido em dinheiro';

const brl = (v: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    v || 0
  );

// pago_em pode ser data pura gravada como 00:00Z; converter o fuso erraria o
// dia. Lê só a parte da data, como o resto da tela de faturas.
const formatarData = (valor: string | null) => {
  if (!valor) return '--/--/----';
  const [ano, mes, dia] = valor.split('T')[0].split('-');
  return `${dia}/${mes}/${ano}`;
};

const textoIdade = (dias: number | null) => {
  if (dias === null || dias === undefined) return '';
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'há 1 dia';
  return `há ${dias} dias`;
};

const corIdade = (dias: number | null) => {
  if (dias !== null && dias > 60) return 'text-red-600 dark:text-red-400';
  if (dias !== null && dias > 30) return 'text-amber-600 dark:text-amber-400';
  return 'text-muted-foreground';
};

// Mesmo critério de emitirNfeFatura: só aceita link vazio ou 'erro'.
const linkPermiteEmissao = (link: string | null) => !link || link === 'erro';

interface FinancialNfePendenciasProps {
  className?: string;
}

export const FinancialNfePendencias: React.FC<FinancialNfePendenciasProps> = ({
  className,
}) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [linhas, setLinhas] = useState<NfePendencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [jaCarregou, setJaCarregou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState<string>('todas');
  const [fechados, setFechados] = useState<Set<MotivoNfePendencia>>(
    () => new Set<MotivoNfePendencia>(['sem_nota_decisao'])
  );
  const [expandidos, setExpandidos] = useState<Set<MotivoNfePendencia>>(
    () => new Set<MotivoNfePendencia>()
  );
  const [emitindoId, setEmitindoId] = useState<string | null>(null);
  const [desfazendoId, setDesfazendoId] = useState<string | null>(null);
  const [alvoDispensa, setAlvoDispensa] = useState<NfePendencia | null>(null);
  const [motivoDispensa, setMotivoDispensa] = useState('');
  const [salvandoDispensa, setSalvandoDispensa] = useState(false);
  const [emissaoMassa, setEmissaoMassa] = useState<FaturaParaNfe[] | null>(
    null
  );

  const carregar = useCallback(async () => {
    setCarregando(true);
    const res = await fetchNfePendencias();
    if (res.success) {
      setLinhas(res.data || []);
      setErro(null);
    } else {
      setErro(res.error || 'Erro ao carregar as notas pendentes');
    }
    setCarregando(false);
    setJaCarregou(true);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const empresas = useMemo(() => {
    const set = new Set(EMPRESAS_PADRAO);
    linhas.forEach((l) => {
      if (l.empresa_nome) set.add(l.empresa_nome);
    });
    return Array.from(set).sort();
  }, [linhas]);

  const pendentesTodas = useMemo(
    () =>
      linhas.filter((l) => normalizarMotivo(l.motivo) !== 'sem_nota_decisao'),
    [linhas]
  );

  const linhasFiltradas = useMemo(
    () =>
      empresa === 'todas'
        ? linhas
        : linhas.filter((l) => l.empresa_nome === empresa),
    [linhas, empresa]
  );

  const resumo = useMemo(() => {
    const pendentes = linhasFiltradas.filter(
      (l) => normalizarMotivo(l.motivo) !== 'sem_nota_decisao'
    );
    const porEmpresa = empresas.map((nome) => {
      const da = pendentesTodas.filter((l) => l.empresa_nome === nome);
      return {
        nome,
        qtd: da.length,
        valor: da.reduce((s, l) => s + (l.valor_total || 0), 0),
      };
    });
    return {
      qtd: pendentes.length,
      valor: pendentes.reduce((s, l) => s + (l.valor_total || 0), 0),
      maisAntiga: pendentes.reduce(
        (max, l) => Math.max(max, l.dias_desde_pagamento || 0),
        0
      ),
      semNota: linhasFiltradas.length - pendentes.length,
      porEmpresa,
    };
  }, [linhasFiltradas, pendentesTodas, empresas]);

  const grupos = useMemo(() => {
    const mapa = new Map<MotivoNfePendencia, NfePendencia[]>();
    linhasFiltradas.forEach((l) => {
      const m = normalizarMotivo(l.motivo);
      const lista = mapa.get(m) || [];
      lista.push(l);
      mapa.set(m, lista);
    });
    return ORDEM_MOTIVOS.filter((m) => mapa.has(m)).map((m) => {
      const itens = (mapa.get(m) || []).sort(
        (a, b) => (b.dias_desde_pagamento || 0) - (a.dias_desde_pagamento || 0)
      );
      return {
        motivo: m,
        itens,
        valor: itens.reduce((s, l) => s + (l.valor_total || 0), 0),
      };
    });
  }, [linhasFiltradas]);

  const alternarGrupo = (m: MotivoNfePendencia) =>
    setFechados((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });

  const expandirGrupo = (m: MotivoNfePendencia) =>
    setExpandidos((prev) => new Set(prev).add(m));

  const handleEmitir = async (linha: NfePendencia) => {
    if (!user?.pessoa?.id) {
      toast({
        title: 'Erro de autenticação',
        description: 'Usuário não autenticado.',
        variant: 'destructive',
      });
      return;
    }
    setEmitindoId(linha.fatura_id);
    try {
      const res = await emitirNfeFatura(linha.fatura_id, user.pessoa.id);
      if (res.success) {
        toast({
          title: 'Nota pedida',
          description: `${linha.paciente_nome || 'Fatura'}: a nota está sendo gerada.`,
        });
      } else {
        toast({
          title: 'Não deu para emitir a nota',
          description: res.error || 'Erro desconhecido',
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('Erro ao emitir nota:', err);
      toast({
        title: 'Não deu para emitir a nota',
        description: 'Ocorreu um erro ao processar o pedido.',
        variant: 'destructive',
      });
    } finally {
      setEmitindoId(null);
      // Recarrega nos dois casos: emitirNfeFatura muda link_nfe também no erro.
      carregar();
    }
  };

  const abrirDispensa = (linha: NfePendencia) => {
    setMotivoDispensa('');
    setAlvoDispensa(linha);
  };

  const confirmarDispensa = async () => {
    if (!alvoDispensa) return;
    const motivo = motivoDispensa.trim();
    if (!motivo) return;
    setSalvandoDispensa(true);
    const res = await dispensarNfeFatura(alvoDispensa.fatura_id, true, motivo);
    setSalvandoDispensa(false);
    if (res.success) {
      toast({
        title: 'Marcada como sem nota por decisão',
        description: alvoDispensa.paciente_nome || undefined,
      });
      setAlvoDispensa(null);
      carregar();
    } else {
      toast({
        title: 'Não deu para salvar',
        description: res.error,
        variant: 'destructive',
      });
    }
  };

  const handleDesfazer = async (linha: NfePendencia) => {
    setDesfazendoId(linha.fatura_id);
    const res = await dispensarNfeFatura(linha.fatura_id, false, null);
    setDesfazendoId(null);
    if (res.success) {
      toast({
        title: 'Voltou para as pendências',
        description: linha.paciente_nome || undefined,
      });
      carregar();
    } else {
      toast({
        title: 'Não deu para desfazer',
        description: res.error,
        variant: 'destructive',
      });
    }
  };

  const abrirEmissaoMassa = (itens: NfePendencia[]) => {
    const alvo = itens
      .filter((l) => linkPermiteEmissao(l.link_nfe))
      .map<FaturaParaNfe>((l) => ({
        id: l.fatura_id,
        responsavel_nome: l.paciente_nome || l.responsavel_nome,
        valor_total: l.valor_total || 0,
        link_nfe: l.link_nfe,
      }));
    if (alvo.length === 0) {
      toast({
        title: 'Nada para emitir',
        description: 'Nenhuma fatura deste grupo pode ser emitida agora.',
      });
      return;
    }
    setEmissaoMassa(alvo);
  };

  const ocupado = emitindoId !== null;

  const renderLinha = (linha: NfePendencia, motivo: MotivoNfePendencia) => {
    const info = MOTIVOS[motivo];
    const podeEmitir = info.emitivel && linkPermiteEmissao(linha.link_nfe);
    const podeDispensar =
      motivo !== 'sem_nota_decisao' && motivo !== 'autorizada_sem_link';
    const mostraTomador =
      !!linha.tomador_id &&
      linha.tomador_id !== linha.responsavel_cobranca_id &&
      !!linha.tomador_nome;
    const textoErro =
      motivo === 'sem_nota_decisao'
        ? `Motivo: ${linha.nfe_dispensada_motivo || MOTIVO_DINHEIRO}`
        : linha.nfe_erro_asaas || linha.status_nfe;

    return (
      <div
        key={linha.fatura_id}
        className="flex flex-col gap-3 rounded-md border bg-card p-3 md:flex-row md:items-center"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {linha.paciente_id ? (
              <button
                type="button"
                onClick={() => navigate(`/pacientes/${linha.paciente_id}`)}
                className="text-left text-sm font-medium text-roxo-titulo underline-offset-4 hover:underline dark:text-foreground"
              >
                {linha.paciente_nome || 'Paciente sem nome'}
              </button>
            ) : (
              <span className="text-sm font-medium">
                {linha.paciente_nome || 'Paciente não identificado'}
              </span>
            )}
            {linha.empresa_nome && (
              <Badge variant="outline" className="text-[10px]">
                {linha.empresa_nome}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {linha.responsavel_nome && (
              <span>
                Resp.:{' '}
                {linha.responsavel_cobranca_id ? (
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/pessoa/${linha.responsavel_cobranca_id}`)
                    }
                    className="underline-offset-4 hover:underline"
                  >
                    {linha.responsavel_nome}
                  </button>
                ) : (
                  linha.responsavel_nome
                )}
              </span>
            )}
            {mostraTomador && (
              <span>
                Nota no nome de:{' '}
                <button
                  type="button"
                  onClick={() => navigate(`/pessoa/${linha.tomador_id}`)}
                  className="underline-offset-4 hover:underline"
                >
                  {linha.tomador_nome}
                </button>
              </span>
            )}
          </div>
          {textoErro && (
            <p
              className="line-clamp-2 break-words text-xs text-muted-foreground"
              title={textoErro}
            >
              {textoErro}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 md:w-40 md:flex-col md:items-end md:gap-0.5">
          <span className="text-sm font-semibold">
            {brl(linha.valor_total)}
          </span>
          <span className="text-right text-xs text-muted-foreground">
            Pago em {formatarData(linha.pago_em)}{' '}
            <span
              className={cn(
                'font-medium',
                corIdade(linha.dias_desde_pagamento)
              )}
            >
              {textoIdade(linha.dias_desde_pagamento)}
            </span>
          </span>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 md:w-auto md:justify-end">
          {podeEmitir && (
            <Button
              size="sm"
              onClick={() => handleEmitir(linha)}
              disabled={ocupado}
            >
              {emitindoId === linha.fatura_id ? (
                <Loader2 className="animate-spin" />
              ) : (
                <FileText />
              )}
              {motivo === 'nunca_pedida' ? 'Emitir nota' : 'Reemitir'}
            </Button>
          )}
          {podeDispensar && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => abrirDispensa(linha)}
              disabled={emitindoId === linha.fatura_id}
            >
              <Ban />
              Sem nota por decisão
            </Button>
          )}
          {motivo === 'sem_nota_decisao' && linha.nfe_dispensada && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDesfazer(linha)}
              disabled={desfazendoId === linha.fatura_id}
            >
              {desfazendoId === linha.fatura_id ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Undo2 />
              )}
              Desfazer
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <Card className={className}>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5" />
                Notas pendentes
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Faturas pagas nos últimos 180 dias que ainda não têm nota
                fiscal, separadas pelo motivo.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={carregar}
              disabled={carregando}
            >
              <RefreshCw className={cn(carregando && 'animate-spin')} />
              Atualizar
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {['todas', ...empresas].map((e) => (
              <Button
                key={e}
                size="sm"
                variant={empresa === e ? 'default' : 'outline'}
                onClick={() => setEmpresa(e)}
              >
                {e === 'todas' ? 'Todas' : e}
              </Button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {erro && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}

          {!jaCarregou ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">
                    Pendentes{empresa !== 'todas' ? ` (${empresa})` : ''}
                  </p>
                  <p className="text-2xl font-semibold">{resumo.qtd}</p>
                  <p className="text-xs text-muted-foreground">
                    {brl(resumo.valor)}
                  </p>
                </div>
                {resumo.porEmpresa.map((e) => (
                  <button
                    key={e.nome}
                    type="button"
                    onClick={() =>
                      setEmpresa((atual) =>
                        atual === e.nome ? 'todas' : e.nome
                      )
                    }
                    className={cn(
                      'rounded-md border p-3 text-left transition-colors hover:bg-muted',
                      empresa === e.nome && 'border-primary bg-muted'
                    )}
                  >
                    <p className="text-xs text-muted-foreground">{e.nome}</p>
                    <p className="text-2xl font-semibold">{e.qtd}</p>
                    <p className="text-xs text-muted-foreground">
                      {brl(e.valor)}
                    </p>
                  </button>
                ))}
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Mais antiga</p>
                  <p
                    className={cn(
                      'text-2xl font-semibold',
                      resumo.qtd > 0 && corIdade(resumo.maisAntiga)
                    )}
                  >
                    {resumo.qtd > 0 ? `${resumo.maisAntiga} dias` : '-'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    desde o pagamento
                  </p>
                </div>
              </div>

              {resumo.semNota > 0 && (
                <p className="text-xs text-muted-foreground">
                  Fora da conta: {resumo.semNota}{' '}
                  {resumo.semNota === 1 ? 'fatura' : 'faturas'} sem nota por
                  decisão.
                </p>
              )}

              {grupos.length === 0 && !erro && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma fatura paga sem nota. Tudo em dia.
                </p>
              )}

              <div className="space-y-3">
                {grupos.map((g) => {
                  const info = MOTIVOS[g.motivo];
                  const aberto = !fechados.has(g.motivo);
                  const mostrarTodas = expandidos.has(g.motivo);
                  const visiveis = mostrarTodas
                    ? g.itens
                    : g.itens.slice(0, LINHAS_POR_GRUPO);
                  const emitiveisGrupo =
                    g.motivo === 'nunca_pedida'
                      ? g.itens.filter((l) => linkPermiteEmissao(l.link_nfe))
                          .length
                      : 0;

                  return (
                    <div
                      key={g.motivo}
                      className={cn(
                        'rounded-lg border',
                        g.motivo === 'sem_nota_decisao' && 'bg-muted/40'
                      )}
                    >
                      <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
                        <button
                          type="button"
                          onClick={() => alternarGrupo(g.motivo)}
                          className="flex min-w-0 flex-1 items-start gap-2 text-left"
                          aria-expanded={aberto}
                        >
                          {aberto ? (
                            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" />
                          ) : (
                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />
                          )}
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold">
                                {info.titulo}
                              </span>
                              <Badge
                                variant={
                                  g.motivo === 'sem_nota_decisao'
                                    ? 'muted'
                                    : info.emitivel
                                      ? 'warning'
                                      : 'secondary'
                                }
                              >
                                {g.itens.length}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {brl(g.valor)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {info.dica}
                            </p>
                          </div>
                        </button>
                        {emitiveisGrupo > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="self-start"
                            onClick={() => abrirEmissaoMassa(g.itens)}
                            disabled={ocupado}
                          >
                            <FileText />
                            Emitir todas deste grupo ({emitiveisGrupo})
                          </Button>
                        )}
                      </div>

                      {aberto && (
                        <div className="space-y-2 border-t p-3">
                          {visiveis.map((l) => renderLinha(l, g.motivo))}
                          {!mostrarTodas &&
                            g.itens.length > LINHAS_POR_GRUPO && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="w-full"
                                onClick={() => expandirGrupo(g.motivo)}
                              >
                                Mostrar todas ({g.itens.length})
                              </Button>
                            )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!alvoDispensa}
        onOpenChange={(aberto) => {
          if (!aberto && !salvandoDispensa) setAlvoDispensa(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sem nota por decisão</DialogTitle>
            <DialogDescription>
              {alvoDispensa?.paciente_nome || 'Fatura'},{' '}
              {brl(alvoDispensa?.valor_total)}. A fatura sai das pendências e
              não terá nota. Dá para desfazer depois.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="nfe-dispensa-motivo">Motivo</Label>
            <Textarea
              id="nfe-dispensa-motivo"
              value={motivoDispensa}
              onChange={(e) => setMotivoDispensa(e.target.value)}
              placeholder="Ex.: recebido em dinheiro"
              rows={3}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setMotivoDispensa(MOTIVO_DINHEIRO)}
            >
              {MOTIVO_DINHEIRO}
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAlvoDispensa(null)}
              disabled={salvandoDispensa}
            >
              Voltar
            </Button>
            <Button
              onClick={confirmarDispensa}
              disabled={salvandoDispensa || !motivoDispensa.trim()}
            >
              {salvandoDispensa && <Loader2 className="animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FinancialNfeEmissaoMassa
        faturas={emissaoMassa || []}
        open={!!emissaoMassa}
        onOpenChange={(aberto) => {
          if (!aberto) setEmissaoMassa(null);
        }}
        onConcluido={carregar}
      />
    </>
  );
};
