/* eslint-disable @typescript-eslint/no-explicit-any */
// AI dev note: execução dos pedidos "@ju" da equipe (n8n "RK Ju - Comando"), 25/10/2026.
// Só aceita a service_role. A IA só escolhe ids do contexto; quem confere é o banco
// (fn_ju_comando_preparar: família, sessão cobrável, trava contra execução dupla).
//
// acao 'cobrar': uma cobrança por paciente + empresa (o banco já agrupa). Cada link nasce IGUAL ao
//   app: descrição = port de src/lib/charge-description.ts; taxas/opções = CÓPIA VERBATIM do fee math
//   de src/lib/payment-fees.ts (mesma cópia do generate-payment-links-bulk); envio = pista expressa do
//   avulso (já, se 8h-20h de Brasília; senão no próximo 8h). Se mudar lá, mude aqui.
// acao 'nota': nota emitida → devolve o link; não emitida ou com erro → nfe-emitir-fatura (a mesma
//   edge do botão "Reemitir nota"; ela faz o PUT na reemissão, nunca cancela).
// Devolve dados estruturados; o texto para a família é montado no n8n.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// quem aparece como autor (mesma pessoa do agendado_por do fn_ju_agendar)
const AUTOR_JU = 'df8ed2ab-867d-47b3-97a2-b05891fae798';

interface TaxaFaixaCartao {
  min: number;
  max: number;
  mdr: number;
  antecipacao_mes: number;
  meses?: number | null;
}
interface TaxasCartaoConfig {
  max_parcelas: number;
  pix: { percent: number; fixo: number };
  cartao: { fixo: number; faixas: TaxaFaixaCartao[] };
  imposto?: { percent: number };
}
interface OpcaoCartao {
  parcelas: number;
  valor_parcela: number;
  total: number;
}
interface OpcoesPagamento {
  valor_base: number;
  pix: { total: number };
  cartao: OpcaoCartao[];
}
interface Consulta {
  id: string;
  data_hora: string; // hora de parede 'YYYY-MM-DDTHH:MM:SS'
  servico_nome: string;
  valor_servico: number;
  profissional_nome: string;
  profissional_id?: string;
  tipo_servico_id?: string;
}

// ============ Fee math — CÓPIA VERBATIM de src/lib/payment-fees.ts ============
const round2 = (v: number): number =>
  Math.round((v + Number.EPSILON) * 100) / 100;
const ceil2 = (v: number): number =>
  Math.ceil((v - Number.EPSILON) * 100) / 100;

function mesesAntecipacao(n: number, mesesOverride?: number | null): number {
  if (typeof mesesOverride === 'number' && mesesOverride > 0)
    return mesesOverride;
  return (n + 1) / 2;
}
// AI dev note: fator de segurança da antecipação no PARCELADO — MANTER IDÊNTICO à
// cópia em src/lib/payment-fees.ts. A antecipação real do Asaas no parcelado fica
// ~3-4% acima do modelo linear; sem isso a clínica recebe ~R$1-2 a menos que a base.
const FATOR_ANTECIPACAO_PARCELADO = 1.04;
function faixaParaParcela(
  taxas: TaxasCartaoConfig,
  n: number
): TaxaFaixaCartao | undefined {
  return taxas.cartao.faixas.find((f) => n >= f.min && n <= f.max);
}
function calcularOpcoesPagamento(
  valorBase: number,
  taxas: TaxasCartaoConfig
): OpcoesPagamento {
  if (!(valorBase > 0)) {
    throw new Error('valorBase deve ser maior que zero');
  }
  const pixTotal = ceil2(
    valorBase * (1 + (taxas.pix?.percent || 0) / 100) + (taxas.pix?.fixo || 0)
  );
  const maxParcelas = Math.max(1, taxas.max_parcelas || 1);
  const fixoCartao = taxas.cartao?.fixo || 0;
  const fracaoImposto = Math.max(0, (taxas.imposto?.percent || 0) / 100);
  const cartao: OpcaoCartao[] = [];
  for (let n = 1; n <= maxParcelas; n++) {
    const faixa = faixaParaParcela(taxas, n);
    if (!faixa) continue;
    const temOverride = typeof faixa.meses === 'number' && faixa.meses > 0;
    const meses =
      mesesAntecipacao(n, faixa.meses) *
      (temOverride ? 1 : FATOR_ANTECIPACAO_PARCELADO);
    const fracaoTaxa = faixa.mdr / 100 + (faixa.antecipacao_mes / 100) * meses;
    const denom = 1 - fracaoTaxa - fracaoImposto;
    if (denom <= 0) continue;
    const bruto = ceil2((valorBase * (1 - fracaoImposto) + fixoCartao) / denom);
    cartao.push({
      parcelas: n,
      total: bruto,
      valor_parcela: round2(bruto / n),
    });
  }
  return { valor_base: round2(valorBase), pix: { total: pixTotal }, cartao };
}
function gerarTaxasCartaoPadrao(): TaxasCartaoConfig {
  return {
    max_parcelas: 12,
    pix: { percent: 0, fixo: 0 },
    imposto: { percent: 0 },
    cartao: {
      fixo: 0.49,
      faixas: [
        { min: 1, max: 1, mdr: 2.99, antecipacao_mes: 1.15, meses: 1 },
        { min: 2, max: 6, mdr: 3.49, antecipacao_mes: 1.6, meses: null },
        { min: 7, max: 12, mdr: 3.99, antecipacao_mes: 1.6, meses: null },
      ],
    },
  };
}

// ============ refreshTaxasFromAsaas — port fiel (reusa asaas-simulate-payment) ============
async function refreshTaxasFromAsaas(
  supabase: any,
  empresaId: string,
  valorBase: number,
  taxas: TaxasCartaoConfig
): Promise<TaxasCartaoConfig> {
  try {
    const installmentCounts = Array.from(
      new Set(taxas.cartao.faixas.map((f) => f.min))
    );
    const { data, error } = await supabase.functions.invoke(
      'asaas-simulate-payment',
      { body: { empresaId, value: valorBase, installmentCounts } }
    );
    if (error || !data?.success || !Array.isArray(data.results)) return taxas;
    const byCount = new Map<
      number,
      { feePercentage: number | null; operationFee: number | null }
    >();
    for (const r of data.results) byCount.set(r.installmentCount, r);
    const fixoAsaas = byCount.get(1)?.operationFee;
    return {
      ...taxas,
      cartao: {
        ...taxas.cartao,
        fixo: typeof fixoAsaas === 'number' ? fixoAsaas : taxas.cartao.fixo,
        faixas: taxas.cartao.faixas.map((f) => {
          const r = byCount.get(f.min);
          return typeof r?.feePercentage === 'number'
            ? { ...f, mdr: r.feePercentage }
            : f;
        }),
      },
    };
  } catch {
    return taxas;
  }
}

// Token url-safe (~21 chars). Índice de token não é único; colisão é astronômica.
function gerarToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .slice(0, 21);
}

function ymd(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

// ============ Descrição — port de src/lib/charge-description.ts (generateChargeDescription) ============
// Mesmo texto do app. Diferença só de ambiente: lá a data vem de parseSupabaseDatetime + toLocaleDateString
// no navegador; aqui a data_hora já chega como hora de parede e vira DD/MM/AAAA direto.
function dataBr(dh: string): string {
  const [y, m, d] = dh.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
function pluralServico(desc: string, count: number): string {
  if (count <= 1) return desc;
  if (desc.toLowerCase().includes('sessão')) return desc.replace(/sessão/gi, 'sessões');
  if (desc.toLowerCase().includes('consulta')) return desc.replace(/consulta/gi, 'consultas');
  if (desc.toLowerCase().includes('avaliação')) return desc.replace(/avaliação/gi, 'avaliações');
  return desc;
}
async function gerarDescricao(
  supabase: any,
  consultasIn: Consulta[],
  paciente: { nome: string; cpf_cnpj: string }
): Promise<string> {
  const vistos = new Set<string>();
  const consultas = consultasIn.filter((c) => {
    if (!c?.id) return true;
    if (vistos.has(c.id)) return false;
    vistos.add(c.id);
    return true;
  });

  const serviceIds = consultas.map((c) => c.tipo_servico_id).filter((id) => id);
  let serviceDescriptions: Record<string, string> = {};
  if (serviceIds.length > 0) {
    const { data } = await supabase.from('tipo_servicos').select('id, nome, descricao').in('id', serviceIds);
    serviceDescriptions = (data || []).reduce((acc: Record<string, string>, s: any) => {
      acc[s.nome] = s.descricao || s.nome;
      return acc;
    }, {});
  }

  const profIds = [...new Set(consultas.map((c) => c.profissional_id).filter((id) => id) as string[])];
  const profMap = new Map<string, { nome: string; cpf: string; registro: string; tipo: string }>();
  if (profIds.length > 0) {
    const { data } = await supabase
      .from('pessoas')
      .select('id, cpf_cnpj, registro_profissional, especialidade')
      .in('id', profIds);
    for (const prof of data || []) {
      const comNome = consultas.find((c) => c.profissional_id === prof.id);
      profMap.set(prof.id, {
        nome: comNome?.profissional_nome || 'Profissional',
        cpf: prof.cpf_cnpj || '',
        registro: prof.registro_profissional || '',
        tipo: 'fisioterapeuta',
      });
    }
  }

  const grupos = new Map<string, Consulta[]>();
  for (const c of consultas) {
    const k = c.profissional_id || 'sem-profissional';
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(c);
  }
  const pacienteNome = paciente?.nome || 'Paciente';
  const pacienteCpf = paciente?.cpf_cnpj || 'não informado';

  const textoProf = (profId: string, lista: Consulta[]) => {
    const p = profMap.get(profId) || {
      nome: lista[0]?.profissional_nome || 'Profissional',
      cpf: '',
      registro: '',
      tipo: 'fisioterapeuta',
    };
    const porServico: Record<string, Consulta[]> = {};
    for (const c of lista) {
      const s = c.servico_nome || 'Atendimento';
      (porServico[s] ||= []).push(c);
    }
    const servicos = Object.entries(porServico)
      .map(([s, cs]) => `${cs.length} ${pluralServico(serviceDescriptions[s] || s.toLowerCase(), cs.length)}`)
      .join(', ');
    const ordenadas = [...lista].sort((a, b) => a.data_hora.localeCompare(b.data_hora));
    const datas = ordenadas.map(
      (c) => `${dataBr(c.data_hora)} (R$ ${Number(c.valor_servico || 0).toFixed(2).replace('.', ',')})`
    );
    const datasTxt = datas.length > 1 ? datas.slice(0, -1).join(', ') + ' e ' + datas[datas.length - 1] : datas[0] || '';
    const n = ordenadas.length;
    const registro = p.registro ? `, CREFITO ${p.registro}` : '';
    return {
      n,
      texto: `${servicos}, ${n === 1 ? 'realizada' : 'realizadas'} pel${p.tipo === 'fisioterapeuta' ? 'a fisioterapeuta' : 'o profissional'} ${p.nome}, CPF ${p.cpf}${registro}, no${n === 1 ? '' : 's'} ${n === 1 ? 'dia' : 'dias'} ${datasTxt}.`,
    };
  };

  if (grupos.size > 1) {
    const partes: string[] = [];
    grupos.forEach((lista, profId) => partes.push(textoProf(profId, lista).texto));
    return partes.join('\n') + `\nAtendimentos realizados ao paciente ${pacienteNome}, CPF ${pacienteCpf}.`;
  }
  const [profId] = Array.from(grupos.keys());
  const t = textoProf(profId, grupos.get(profId)!);
  return `${t.texto}\n${t.n === 1 ? 'Atendimento realizado' : 'Atendimentos realizados'} ao paciente ${pacienteNome}, CPF ${pacienteCpf}.`;
}

// Pista expressa do avulso (igual a proximoEnvioAvulsoBRT do app): 8h-20h de Brasília envia já;
// fora disso, no próximo 8h.
function proximoEnvioAvulso(): { quando: string; texto: string } {
  const agora = new Date();
  const h = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(agora)
  );
  if (h >= 8 && h < 20) return { quando: agora.toISOString(), texto: 'agora' };
  const [y, m, d] = ymd(agora).split('-').map(Number);
  const base = Date.UTC(y, m - 1, d);
  const alvo = new Date(h >= 20 ? base + 86400000 : base);
  const iso = `${alvo.getUTCFullYear()}-${String(alvo.getUTCMonth() + 1).padStart(2, '0')}-${String(alvo.getUTCDate()).padStart(2, '0')}T11:00:00Z`;
  return { quando: new Date(iso).toISOString(), texto: h >= 20 ? 'amanhã às 8h' : 'hoje às 8h' };
}

// Cria UM link (mesma sequência do criarLinkPagamento / processarItem do bulk).
async function criarLink(supabase: any, item: any, descricao: string, envioEm: string, ensaio = false) {
  const { data: empresa } = await supabase.from('pessoa_empresas').select('taxas_cartao').eq('id', item.empresa_id).single();
  const taxasConfig: TaxasCartaoConfig = (empresa?.taxas_cartao as TaxasCartaoConfig) || gerarTaxasCartaoPadrao();
  const taxasAsaas = await refreshTaxasFromAsaas(supabase, item.empresa_id, Number(item.valor_base), taxasConfig);
  const { data: aliquota } = await supabase.rpc('fn_aliquota_imposto_repasse', {});
  const taxas: TaxasCartaoConfig = { ...taxasAsaas, imposto: { percent: Number(aliquota) || 0 } };
  const opcoes = calcularOpcoesPagamento(Number(item.valor_base), taxas);

  const { data: pac } = await supabase.from('pessoas').select('tomador_nfe_id').eq('id', item.paciente_id).maybeSingle();
  const tomadorId = pac?.tomador_nfe_id || item.responsavel_id;

  const hoje = new Date();
  const vencimento = ymd(new Date(hoje.getTime() + 86400000));
  const expiraEm = new Date(`${ymd(new Date(hoje.getTime() + 30 * 86400000))}T23:59:59-03:00`).toISOString();
  const ids: string[] = item.consultas.map((c: Consulta) => c.id);
  // ensaio (só teste manual, o n8n nunca manda): mostra o que seria criado e para aqui
  if (ensaio) return { link_id: null, ensaio: { descricao, vencimento, pix: opcoes.pix.total, cartao: opcoes.cartao.map((o) => o.total) } };

  const { data: link, error: linkError } = await supabase
    .from('pagamento_links')
    .insert({
      token: gerarToken(),
      paciente_id: item.paciente_id,
      responsavel_cobranca_id: item.responsavel_id,
      tomador_nfe_id: tomadorId,
      empresa_id: item.empresa_id,
      valor_base: Number(item.valor_base),
      descricao,
      vencimento,
      status: 'pendente',
      taxas_snapshot: taxas,
      opcoes_snapshot: opcoes,
      expira_em: expiraEm,
      criado_por: AUTOR_JU,
    })
    .select('id, token')
    .single();
  if (linkError || !link) throw new Error(`Erro ao criar link: ${linkError?.message}`);

  const { data: statusCobranca } = await supabase.from('pagamento_status').select('id').eq('codigo', 'cobranca_gerada').single();
  const { data: reservadas, error: updErr } = await supabase
    .from('agendamentos')
    .update({
      pagamento_link_id: link.id,
      cobranca_gerada_em: new Date().toISOString(),
      cobranca_gerada_por: AUTOR_JU,
      ...(statusCobranca?.id ? { status_pagamento_id: statusCobranca.id } : {}),
    })
    .in('id', ids)
    .is('fatura_id', null)
    .is('pagamento_link_id', null)
    .select('id');
  if (updErr || !reservadas || reservadas.length !== ids.length) {
    // alguém cobrou ao mesmo tempo: desfaz para não mandar link com consulta de outra cobrança
    const { data: pendente } = await supabase.from('pagamento_status').select('id').eq('codigo', 'pendente').single();
    await supabase.from('agendamentos').update({ pagamento_link_id: null, cobranca_gerada_em: null, cobranca_gerada_por: null,
      ...(pendente?.id ? { status_pagamento_id: pendente.id } : {}) })
      .eq('pagamento_link_id', link.id);
    await supabase.from('pagamento_links').update({ status: 'cancelado', ativo: false }).eq('id', link.id);
    throw new Error('Consultas cobradas por outro caminho no mesmo instante');
  }

  const url = `https://app.respirakidsbrasilia.com.br/#/pagamento/${link.token}`;
  await supabase.from('webhook_queue').insert({
    evento: 'pagamento_link_criado',
    payload: {
      tipo: 'pagamento_link_criado',
      timestamp: new Date().toISOString(),
      webhook_id: crypto.randomUUID(),
      data: {
        pagamento_link_id: link.id,
        token: link.token,
        url,
        paciente_id: item.paciente_id,
        responsavel_cobranca_id: item.responsavel_id,
        tomador_nfe_id: tomadorId,
        empresa_id: item.empresa_id,
        valor_base: Number(item.valor_base),
        descricao,
        vencimento,
      },
    },
    status: 'pendente',
    tentativas: 0,
    max_tentativas: 3,
    proximo_retry: envioEm,
  });
  return { link_id: link.id, url };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, erro: 'Use POST' }, 405);
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceKey || req.headers.get('Authorization') !== `Bearer ${serviceKey}`) {
    return json({ ok: false, erro: 'Não autorizado' }, 401);
  }
  const supabase = createClient(url, serviceKey);
  const b = await req.json().catch(() => ({}));
  const acao = String(b.acao || '');
  const mensagem = Number(b.mensagem_id);
  const ensaio = b.ensaio === true;

  try {
    const { data: prep, error } = await supabase.rpc('fn_ju_comando_preparar', {
      p_conversa_id: Number(b.conversa_id),
      p_mensagem_id: mensagem,
      p_acao: acao,
      p_ids: Array.isArray(b.ids) ? b.ids : [],
    });
    if (error) throw new Error(`fn_ju_comando_preparar: ${error.message}`);
    if (!prep?.ok) return json({ ok: false, acao, codigo: prep?.codigo || 'FALHOU', recusadas: prep?.recusadas || [] });

    const itens: any[] = prep.itens || [];
    const recusadas: any[] = prep.recusadas || [];

    if (acao === 'cobrar') {
      const envio = proximoEnvioAvulso();
      const geradas: any[] = [];
      const erros: any[] = [];
      for (const item of itens) {
        const base = {
          crianca: item.crianca,
          valor: Number(item.valor_base),
          sessoes: (item.consultas || []).length,
          datas: (item.consultas || []).map((c: Consulta) => dataBr(c.data_hora).slice(0, 5)),
        };
        if ((item.faltando || []).length > 0) {
          erros.push({ ...base, motivo: 'CADASTRO_INCOMPLETO', faltando: item.faltando });
          continue;
        }
        try {
          const descricao = await gerarDescricao(supabase, item.consultas, {
            nome: item.paciente_nome,
            cpf_cnpj: item.paciente_cpf,
          });
          const r: any = await criarLink(supabase, item, descricao, envio.quando, ensaio);
          geradas.push({ ...base, link_id: r.link_id, ...(r.ensaio ? { ensaio: r.ensaio } : {}) });
        } catch (e) {
          erros.push({ ...base, motivo: 'FALHOU', detalhe: e instanceof Error ? e.message : String(e) });
        }
      }
      const resultado = { acao, geradas, erros, recusadas, envio: envio.texto };
      await supabase.rpc('fn_ju_comando_registrar', {
        p_mensagem_id: mensagem,
        p_status: geradas.length > 0 ? 'cobrado' : 'recusado',
        p_resultado: resultado,
      });
      return json({ ok: true, ...resultado });
    }

    // nota
    const emitidas: any[] = [];
    const pedidas: any[] = [];
    const processando: any[] = [];
    const erros: any[] = [];
    for (const n of itens) {
      const base = { crianca: n.crianca, valor: n.valor, pago_em: n.pago_em };
      if (n.situacao_nota === 'emitida' && n.link_nota) {
        emitidas.push({ ...base, link: n.link_nota });
      } else if (n.situacao_nota === 'processando') {
        processando.push(base);
      } else if (ensaio) {
        pedidas.push({ ...base, reemissao: n.situacao_nota === 'com_erro', ensaio: true });
      } else {
        const res = await fetch(`${url}/functions/v1/nfe-emitir-fatura`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ faturaId: n.fatura_id }),
          signal: AbortSignal.timeout(90000),
        }).catch((e) => ({ ok: false, json: async () => ({ success: false, error: String(e) }) }) as any);
        const e = await res.json().catch(() => ({ success: false, error: 'resposta ilegível' }));
        if (e?.success === true) pedidas.push({ ...base, reemissao: n.situacao_nota === 'com_erro' });
        else if (e?.jaEmitida === true) processando.push(base);
        else erros.push({ ...base, detalhe: String(e?.error ?? 'falha') });
      }
    }
    const resultado = { acao, emitidas, pedidas, processando, erros, recusadas };
    await supabase.rpc('fn_ju_comando_registrar', {
      p_mensagem_id: mensagem,
      p_status: emitidas.length + pedidas.length + processando.length > 0 ? 'nota' : 'recusado',
      p_resultado: resultado,
    });
    return json({ ok: true, ...resultado });
  } catch (e) {
    const detalhe = e instanceof Error ? e.message : String(e);
    await supabase.rpc('fn_ju_comando_registrar', { p_mensagem_id: mensagem, p_status: 'erro', p_resultado: { acao, erro: detalhe } });
    return json({ ok: false, acao, codigo: 'ERRO', detalhe }, 500);
  }
});
