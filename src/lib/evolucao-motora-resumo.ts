// Gera o texto da evolução motora salvo em relatorio_evolucao.conteudo.
// Esse texto é o que o histórico e o relatório por IA leem, então precisa
// trazer tudo o que foi registrado. Regras:
// - só entra o que a profissional registrou; campo vazio não vira "não";
// - "encaminhamento médico = não" nunca é citado (na versão original do
//   formulário ele vinha marcado por padrão, então não prova uma decisão).

import {
  AREAS_MOTORAS,
  classificarDiferencaCervical,
  ladoMenorAmplitude,
  limparAreasNaoTrabalhadas,
  ROTULO_BRAQUICEFALIA,
  ROTULO_PLAGIOCEFALIA,
  VERSAO_FORMULARIO_MOTORA,
  ehFormatoMotoraV13,
  textoSemOrientacao,
  type AdesaoDomiciliar,
  type AutoriaEvolucao,
  type EvolucaoMotoraAssimetria,
  type RespostaObservada,
} from '@/types/evolucao-clinica';
import { linhasMedidasDoResumo } from '@/lib/motora-medidas';
import {
  diferenca,
  dataCurta,
  fmtValor,
  nomeRegistro,
  textoRegistroHabilidade,
} from '@/lib/motora-plano';
import {
  ABORDAGEM_CURTA,
  EXERCICIOS_DOMICILIARES,
  FINALIDADE_POR_ID,
  OCORRENCIAS_SESSAO,
  PARTICIPACOES_SESSAO,
  RECURSOS,
  RECURSOS_ANTIGOS,
  REGIOES,
  RESULTADOS_FUNCIONAIS,
  nomeDe,
  textoTummyTime,
} from '@/lib/motora-catalogo';

const TODOS_RECURSOS = [...RECURSOS, ...RECURSOS_ANTIGOS];
const LADO_TENSO: Record<string, string> = {
  direito: 'mais tenso à direita',
  esquerdo: 'mais tenso à esquerda',
  ambos: 'tenso dos dois lados',
};
const LOCAL_BLOQUEIO: Record<string, string> = {
  cranio: 'crânio',
  escapula: 'escápula',
  quadril: 'quadril',
};

/**
 * Prepara a evolução motora para gravar: identifica a profissional logada
 * (nome, CREFITO, data e hora) e a versão do formulário.
 * - Criação: grava `autor` e a versão atual.
 * - Edição: mantém o autor original e grava `ultima_edicao`. Registro antigo
 *   (sem versão) continua sem versão, porque nele o "não" do encaminhamento
 *   médico pode ser só o valor padrão do formulário antigo.
 * Isso identifica quem registrou; não é uma assinatura eletrônica verificável.
 * Antes, tira o que pertence a áreas desmarcadas (limparAreasNaoTrabalhadas).
 */
export function prepararEvolucaoMotoraParaSalvar(
  evOriginal: EvolucaoMotoraAssimetria,
  profissional: AutoriaEvolucao,
  editando: boolean
): EvolucaoMotoraAssimetria {
  const ev = limparAreasNaoTrabalhadas(evOriginal);
  if (editando) return { ...ev, ultima_edicao: profissional };
  return {
    ...ev,
    versao_formulario: VERSAO_FORMULARIO_MOTORA,
    autor: profissional,
  };
}

const ADESAO: Record<AdesaoDomiciliar, string> = {
  sim: 'sim',
  parcial: 'parcialmente',
  nao: 'não',
  nao_informado: 'não informado',
};

const num = (n: number, casas = 0) =>
  n.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });

const temTexto = (s?: string | null): s is string => !!s && s.trim().length > 0;

const ehNumero = (n?: number | null): n is number => typeof n === 'number';

const TONUS: Record<string, string> = {
  normal: 'normal',
  tenso: 'tenso',
  tenso_corda: 'tenso em corda',
};

const NODULO_TAMANHO: Record<string, string> = {
  menor_1cm: 'menor que 1 cm',
  '1_3cm': 'entre 1 e 3 cm',
  maior_3cm: 'maior que 3 cm',
};

const NODULO_LOCAL: Record<string, string> = {
  terco_inferior: 'terço inferior',
  terco_medio: 'terço médio',
  terco_superior: 'terço superior',
};

const SUPINO_LINHA_MEDIA: Record<string, string> = {
  mantem_firme: 'mantém a cabeça firme na linha média',
  cai_preferencia: 'a cabeça cai para o lado de preferência',
  instavel: 'instável na linha média',
};

const SUPINO_ALCANCE: Record<string, string> = {
  maos_joelhos: 'leva as mãos aos joelhos',
  maos_boca: 'leva as mãos à boca',
  maos_ar: 'eleva as mãos no ar',
  ausente: 'alcance de linha média ausente',
};

const PRONO_TOLERANCIA: Record<string, string> = {
  boa: 'boa tolerância',
  cansa_rapido: 'cansa rápido',
  chora_imediato: 'chora imediatamente',
};

const PRONO_CARGA: Record<string, string> = {
  cotovelos: 'apoio nos cotovelos',
  maos_estendidas: 'apoio nas mãos com braços estendidos',
  nao_levanta: 'não eleva o tronco',
};

const PRONO_CABECA: Record<string, string> = {
  '45_graus': 'eleva a cabeça a 45°',
  '90_graus': 'eleva a cabeça a 90°',
  oscila: 'controle de cabeça oscilante',
};

const FREQUENCIA: Record<string, string> = {
  diaria: 'diária',
  '3x_semana': '3x por semana',
  '2x_semana': '2x por semana',
  semanal: 'semanal',
  quinzenal: 'quinzenal',
};

const RESPOSTA: Record<string, string> = {
  true: 'sim',
  false: 'não',
  nao_avaliado: 'não avaliado',
};

const textoResposta = (v: RespostaObservada | null | undefined) =>
  v === undefined || v === null ? null : RESPOSTA[String(v)];

function secao(titulo: string, linhas: string[]): string {
  if (linhas.length === 0) return '';
  return `${titulo}\n${linhas.map((l) => `• ${l}`).join('\n')}\n\n`;
}

function ladoAlado(
  rotulo: string,
  d: number | undefined,
  e: number | undefined
): string | null {
  if (!ehNumero(d) && !ehNumero(e)) return null;
  const partes = [];
  if (ehNumero(d)) partes.push(`D ${d}°`);
  if (ehNumero(e)) partes.push(`E ${e}°`);
  return `${rotulo}: ${partes.join(', ')}`;
}

export function gerarResumoEvolucaoMotora(
  ev: EvolucaoMotoraAssimetria
): string {
  let texto = '';

  // Áreas trabalhadas na sessão (registros antigos não têm)
  if (Array.isArray(ev.areas) && ev.areas.length > 0) {
    const nomes = AREAS_MOTORAS.filter((a) => ev.areas!.includes(a.id)).map(
      (a) => a.titulo
    );
    texto += `🎯 Áreas trabalhadas: ${nomes.join(', ')}\n\n`;
  }

  const v13 = ehFormatoMotoraV13(ev);
  if (v13) texto += blocosObjetivosHabilidades(ev);

  // Medidas craniométricas
  const c = ev.craniometria || {};
  const cranio: string[] = [];
  if (ehNumero(c.diagonal_a_mm) && ehNumero(c.diagonal_b_mm)) {
    cranio.push(
      `Diagonais: ${num(c.diagonal_a_mm)} mm e ${num(c.diagonal_b_mm)} mm`
    );
  } else if (ehNumero(c.diagonal_a_mm)) {
    cranio.push(`Diagonal A: ${num(c.diagonal_a_mm)} mm`);
  } else if (ehNumero(c.diagonal_b_mm)) {
    cranio.push(`Diagonal B: ${num(c.diagonal_b_mm)} mm`);
  }
  if (ehNumero(c.comprimento_ap_mm))
    cranio.push(`Comprimento AP: ${num(c.comprimento_ap_mm)} mm`);
  if (ehNumero(c.largura_ml_mm))
    cranio.push(`Largura ML: ${num(c.largura_ml_mm)} mm`);
  if (ehNumero(c.perimetro_cefalico_cm))
    cranio.push(`Perímetro cefálico: ${num(c.perimetro_cefalico_cm, 1)} cm`);
  if (ehNumero(c.cva_mm)) cranio.push(`CVA: ${num(c.cva_mm, 1)} mm`);
  if (ehNumero(c.cvai_percentual)) {
    const cls = c.plagiocefalia_severidade
      ? ` (${ROTULO_PLAGIOCEFALIA[c.plagiocefalia_severidade] || c.plagiocefalia_severidade})`
      : '';
    cranio.push(`CVAI: ${num(c.cvai_percentual, 1)}%${cls}`);
  }
  if (ehNumero(c.ci_percentual)) {
    const cls = c.braquicefalia_severidade
      ? ` (${ROTULO_BRAQUICEFALIA[c.braquicefalia_severidade] || c.braquicefalia_severidade})`
      : '';
    cranio.push(`Índice cefálico: ${num(c.ci_percentual, 1)}%${cls}`);
  }
  texto += secao('📐 Medidas craniométricas', cranio);

  // Goniometria cervical
  const g = ev.goniometria || {};
  const gonio = [
    ladoAlado(
      'Rotação ativa',
      g.rotacao_ativa_direita,
      g.rotacao_ativa_esquerda
    ),
    ladoAlado(
      'Rotação passiva',
      g.rotacao_passiva_direita,
      g.rotacao_passiva_esquerda
    ),
    ladoAlado(
      'Inclinação ativa',
      g.inclinacao_ativa_direita,
      g.inclinacao_ativa_esquerda
    ),
    ladoAlado(
      'Inclinação passiva',
      g.inclinacao_passiva_direita,
      g.inclinacao_passiva_esquerda
    ),
  ].filter((l): l is string => !!l);
  const difs: [
    string,
    number | undefined,
    boolean,
    number | undefined,
    number | undefined,
  ][] = [
    [
      'rotação passiva',
      g.diferenca_rotacao_passiva,
      true,
      g.rotacao_passiva_direita,
      g.rotacao_passiva_esquerda,
    ],
    [
      'rotação ativa',
      g.diferenca_rotacao_ativa,
      true,
      g.rotacao_ativa_direita,
      g.rotacao_ativa_esquerda,
    ],
    [
      'inclinação passiva',
      g.diferenca_inclinacao_passiva,
      false,
      g.inclinacao_passiva_direita,
      g.inclinacao_passiva_esquerda,
    ],
    [
      'inclinação ativa',
      g.diferenca_inclinacao_ativa,
      false,
      g.inclinacao_ativa_direita,
      g.inclinacao_ativa_esquerda,
    ],
  ];
  for (const [rotulo, valor, classifica, d, e] of difs) {
    if (!ehNumero(valor)) continue;
    const detalhes = [
      classifica ? classificarDiferencaCervical(valor) : undefined,
      ladoMenorAmplitude(d, e)
        ? `menor amplitude para a ${ladoMenorAmplitude(d, e)}`
        : undefined,
    ].filter(Boolean);
    gonio.push(
      `Diferença entre os lados na ${rotulo}: ${valor}°${detalhes.length ? ` (${detalhes.join('; ')})` : ''}`
    );
  }
  if (temTexto(g.observacoes))
    gonio.push(`Observações: ${g.observacoes.trim()}`);
  texto += secao('📏 Goniometria cervical', gonio);

  // Palpação do ECOM
  const p = ev.palpacao || {};
  const palp: string[] = [];
  if (p.ecom_direito_tonus)
    palp.push(
      `ECOM direito: ${TONUS[p.ecom_direito_tonus] || p.ecom_direito_tonus}`
    );
  if (p.ecom_esquerdo_tonus)
    palp.push(
      `ECOM esquerdo: ${TONUS[p.ecom_esquerdo_tonus] || p.ecom_esquerdo_tonus}`
    );
  if (p.nodulo_direito || p.nodulo_esquerdo) {
    const lados = [
      p.nodulo_direito ? 'direito' : null,
      p.nodulo_esquerdo ? 'esquerdo' : null,
    ]
      .filter(Boolean)
      .join(' e ');
    const detalhes = [
      p.nodulo_tamanho ? NODULO_TAMANHO[p.nodulo_tamanho] : null,
      p.nodulo_localizacao ? NODULO_LOCAL[p.nodulo_localizacao] : null,
    ]
      .filter(Boolean)
      .join(', ');
    palp.push(`Nódulo no ECOM ${lados}${detalhes ? ` (${detalhes})` : ''}`);
  }
  for (const [rot, reg] of [
    ['Musculatura cervical posterior', p.cervical_posterior],
    ['Musculatura cervical anterior', p.cervical_anterior],
  ] as const) {
    if (!reg) continue;
    palp.push(
      reg.tonus === 'normal'
        ? `${rot}: normal`
        : `${rot}: tensa${reg.lado ? ` (${LADO_TENSO[reg.lado]})` : ''}`
    );
  }
  if ((p.bloqueios || []).length)
    palp.push(
      `Bloqueio articular: ${(p.bloqueios || [])
        .map(
          (b) =>
            LOCAL_BLOQUEIO[b.local] + (b.lado ? ` (${LADO_TENSO[b.lado]})` : '')
        )
        .join(', ')}`
    );
  if (temTexto(p.observacoes))
    palp.push(`Observações: ${p.observacoes.trim()}`);
  texto += secao(
    p.cervical_posterior || p.cervical_anterior || (p.bloqueios || []).length
      ? '👋 Palpação'
      : '👋 Palpação do ECOM',
    palp
  );

  // Controle motor
  const cm = ev.controle_motor || {};
  const controle: string[] = [];
  const supino = [
    cm.supino_linha_media ? SUPINO_LINHA_MEDIA[cm.supino_linha_media] : null,
    cm.supino_alcance ? SUPINO_ALCANCE[cm.supino_alcance] : null,
  ].filter(Boolean);
  if (supino.length) controle.push(`Supino: ${supino.join('; ')}`);
  const prono = [
    cm.prono_tolerancia ? PRONO_TOLERANCIA[cm.prono_tolerancia] : null,
    cm.prono_carga_peso ? PRONO_CARGA[cm.prono_carga_peso] : null,
    cm.prono_controle_cabeca ? PRONO_CABECA[cm.prono_controle_cabeca] : null,
  ].filter(Boolean);
  if (prono.length) controle.push(`Prono: ${prono.join('; ')}`);
  if (temTexto(cm.observacoes))
    controle.push(`Observações: ${cm.observacoes.trim()}`);
  texto += secao('🏋️ Controle motor', controle);

  if (v13) texto += blocosIntervencaoResposta(ev);

  // Intervenção (formato anterior)
  const i = v13 ? undefined : ev.intervencao;
  const interv: string[] = [];
  if (i) {
    const tecnicas = [
      i.alongamentos && 'alongamentos',
      i.fortalecimento && 'fortalecimento',
      i.estimulacao_sensorial && 'estimulação sensorial',
      i.posicionamentos_terapeuticos && 'posicionamentos terapêuticos',
      i.tummy_time && 'tummy time',
      i.bandagem_kinesio && 'bandagem kinesio',
      i.orientacao_pais && 'orientação aos pais',
    ].filter((t): t is string => !!t);
    if (tecnicas.length) interv.push(`Técnicas: ${tecnicas.join(', ')}`);
    if (temTexto(i.outras_tecnicas))
      interv.push(`Outras técnicas: ${i.outras_tecnicas.trim()}`);
    if (temTexto(i.observacoes))
      interv.push(`Observações: ${i.observacoes.trim()}`);
  }
  texto += secao('🩺 Intervenção realizada', interv);

  // Resposta ao tratamento (formato anterior)
  const r = (v13 ? {} : ev.resposta) || {};
  const resp: string[] = [];
  const itensResposta: [string, RespostaObservada | null | undefined][] = [
    ['Melhora da ADM', r.melhora_adm],
    ['Redução da preferência postural', r.reducao_preferencia_postural],
    ['Melhora do controle cervical', r.melhora_controle_cervical],
    ['Melhora da tolerância ao prono', r.tolerancia_prono_melhorou],
  ];
  const melhoras: string[] = [];
  for (const [rotulo, valor] of itensResposta) {
    const t = textoResposta(valor);
    if (t) melhoras.push(`${rotulo}: ${t}`);
  }
  resp.push(...melhoras);
  if (r.adesao_domiciliar) {
    resp.push(
      `Responsável relata ter realizado as orientações domiciliares: ${ADESAO[r.adesao_domiciliar]}`
    );
  } else {
    // Registro antigo: pergunta anterior, que misturava relato e observação
    const antigo = textoResposta(r.pais_seguindo_orientacoes);
    if (antigo) resp.push(`Pais seguindo as orientações: ${antigo}`);
  }
  if (temTexto(r.observacoes))
    resp.push(`Observações: ${r.observacoes.trim()}`);
  texto += secao(
    melhoras.length
      ? '📈 Resposta ao tratamento (comparada à sessão anterior)'
      : '📈 Resposta ao tratamento',
    resp
  );

  // Orientações
  const o = ev.orientacoes;
  const orient: string[] = [];
  if (o) {
    if (o.posicionamento_sono)
      orient.push('Sono seguro: de barriga para cima, sem posicionadores');
    if (o.posicionamento_vigilia)
      orient.push(
        'Posicionamento e brincadeiras acordado, estimulando o lado não preferido'
      );
    const tummy =
      textoTummyTime(o.tummy_time_vezes, o.tummy_time_minutos) ||
      (temTexto(o.tummy_time_frequencia) ? o.tummy_time_frequencia.trim() : '');
    if (tummy) orient.push(`Tummy time (acordado e supervisionado): ${tummy}`);
    if (o.colo_alternando) orient.push('Colo alternando os lados');
    if (o.tempo_no_chao)
      orient.push('Mais tempo no chão (menos bebê-conforto e cadeirinha)');
    if (o.exercicios_domiciliares) orient.push('Exercícios domiciliares');
    const exs = (o.exercicios || []).map(
      (x) => EXERCICIOS_DOMICILIARES.find((e) => e.id === x)?.nome ?? x
    );
    if (exs.length) orient.push(`Exercícios para casa: ${exs.join('; ')}`);
    if (o.sinais_alerta) orient.push('Sinais de alerta');
    if (o.uso_capacete) orient.push('Uso do capacete');
    if (temTexto(o.outras)) orient.push(o.outras.trim());
    if (o.sem_orientacao && orient.length === 0)
      orient.push(textoSemOrientacao(o.sem_orientacao_motivo));
  }
  texto += secao('📝 Orientações aos responsáveis', orient);

  // Conduta
  const cd = ev.conduta;
  const conduta: string[] = [];
  if (cd) {
    if (cd.manter_fisioterapia === true) {
      const freq = cd.frequencia_sugerida
        ? `, frequência ${FREQUENCIA[cd.frequencia_sugerida] || cd.frequencia_sugerida}`
        : '';
      conduta.push(`Manter fisioterapia${freq}`);
    } else if (cd.manter_fisioterapia === false) {
      conduta.push('Não manter fisioterapia');
    }
    if (ehNumero(cd.reavaliacao_dias))
      conduta.push(`Reavaliação em ${cd.reavaliacao_dias} dias`);
    if (cd.encaminhamento_medico) conduta.push('Encaminhamento médico');
    if (cd.indicacao_capacete) conduta.push('Indicação de capacete ortopédico');
    if (
      (cd.encaminhamento_medico || cd.indicacao_capacete) &&
      temTexto(cd.motivo_encaminhamento)
    )
      conduta.push(`Motivo: ${cd.motivo_encaminhamento.trim()}`);
    if (temTexto(cd.observacoes))
      conduta.push(`Observações: ${cd.observacoes.trim()}`);
  }
  texto += secao('✅ Conduta', conduta);

  // Medidas previstas que não foram feitas, e próximas reavaliações
  texto += secao('📏 Medidas e reavaliações', linhasMedidasDoResumo(ev));

  // Identificação de quem registrou (não é assinatura eletrônica)
  const responsavel = linhaAutoria('Profissional responsável', ev.autor);
  if (responsavel) texto += `${responsavel}\n`;
  const edicao = linhaAutoria('Última edição por', ev.ultima_edicao);
  if (edicao) texto += `${edicao}\n`;

  return texto.trimEnd() + '\n';
}

// ------------------------------------------------------------ formato 1.3

const ROTULO_RESULTADO = Object.fromEntries(
  RESULTADOS_FUNCIONAIS.map((r) => [r.id, r.rotulo.toLowerCase()])
) as Record<string, string>;

function blocosObjetivosHabilidades(ev: EvolucaoMotoraAssimetria): string {
  let texto = '';
  const idade = ev.idade_sessao;
  if (idade) {
    let l = `👶 Idade: ${idade.cronologica_texto}`;
    if (idade.corrigida_texto)
      l += ` (idade corrigida: ${idade.corrigida_texto})`;
    if (idade.observacao) l += `. ${idade.observacao}`;
    texto += `${l}

`;
  }

  const objs: string[] = [];
  for (const o of ev.objetivos_sessao || []) {
    const partes: string[] = [];
    if (o.resultado) partes.push(ROTULO_RESULTADO[o.resultado] ?? o.resultado);
    if (o.recursos?.length)
      partes.push(
        `feito: ${o.recursos.map((x) => nomeDe(TODOS_RECURSOS, x).toLowerCase()).join(', ')}`
      );
    const un = o.unidade ?? '';
    if (ehNumero(o.valor)) {
      let v = `hoje ${fmtValor(o.valor, un)}`;
      if (ehNumero(o.valor_anterior)) {
        v += ` (antes ${fmtValor(o.valor_anterior, un)}`;
        if (o.data_anterior) v += ` em ${dataCurta(o.data_anterior)}`;
        const d = diferenca(o.valor, o.valor_anterior, un);
        if (d) v += `; ${d}`;
        v += ')';
      }
      partes.push(v);
    } else if (o.rotulo_indicador) {
      partes.push('sem mensuração nesta sessão');
    }
    if (ehNumero(o.meta)) partes.push(`meta ${fmtValor(o.meta, un)}`);
    let l = o.descricao + (partes.length ? `: ${partes.join('; ')}` : '');
    if (temTexto(o.observacao)) l += `. ${o.observacao.trim()}`;
    objs.push(l);
  }
  texto += secao('🎯 Objetivos trabalhados', objs);

  const regs = ev.habilidades || [];
  const hab = regs
    .filter((r) => r.estado !== 'nao_observado')
    .map((r) => textoRegistroHabilidade(r));
  const naoObs = regs
    .filter((r) => r.estado === 'nao_observado')
    .map(nomeRegistro);
  if (naoObs.length) hab.push(`Não observadas hoje: ${naoObs.join(', ')}`);
  texto += secao('🧩 Habilidades observadas', hab);
  return texto;
}

function blocosIntervencaoResposta(ev: EvolucaoMotoraAssimetria): string {
  let texto = '';
  const interv: string[] = [];
  for (const it of ev.intervencoes || []) {
    const nome =
      it.finalidade === 'outra'
        ? it.finalidade_outra?.trim() || 'Outra finalidade'
        : (FINALIDADE_POR_ID[it.finalidade]?.nome ?? it.finalidade);
    const partes: string[] = [];
    const abord = [
      ...(it.abordagens || []).map((a) => ABORDAGEM_CURTA[a] ?? a),
      ...(temTexto(it.abordagem_outra) ? [it.abordagem_outra.trim()] : []),
    ];
    if (abord.length) partes.push(`abordagem: ${abord.join(', ')}`);
    if (it.regioes?.length)
      partes.push(
        `região/função: ${it.regioes.map((x) => nomeDe(REGIOES, x).toLowerCase()).join(', ')}`
      );
    if (it.recursos?.length)
      partes.push(
        `recursos: ${it.recursos.map((x) => nomeDe(TODOS_RECURSOS, x).toLowerCase()).join(', ')}`
      );
    let l = nome + (partes.length ? ` (${partes.join('; ')})` : '');
    if (temTexto(it.detalhe)) l += `. ${it.detalhe.trim()}`;
    interv.push(l);
  }
  const is = ev.intervencao_sessao;
  if (is) {
    const fins = [
      ...(is.finalidades || []).map((f) => FINALIDADE_POR_ID[f]?.nome ?? f),
      ...(temTexto(is.finalidade_outra) ? [is.finalidade_outra.trim()] : []),
    ];
    if (fins.length) interv.push(`Trabalhado: ${fins.join(', ')}`);
    if (is.regioes?.length)
      interv.push(
        `Região: ${is.regioes.map((x) => nomeDe(REGIOES, x).toLowerCase()).join(', ')}`
      );
    if (is.recursos?.length)
      interv.push(
        `Recursos: ${is.recursos.map((x) => nomeDe(TODOS_RECURSOS, x).toLowerCase()).join(', ')}`
      );
    if (temTexto(is.detalhe))
      interv.push(
        fins.length || is.regioes?.length || is.recursos?.length
          ? is.detalhe.trim()
          : `Outra intervenção: ${is.detalhe.trim()}`
      );
  }
  texto += secao('🩺 Intervenções realizadas', interv);

  const r = ev.resposta_sessao || {};
  const resp: string[] = [];
  const part = PARTICIPACOES_SESSAO.find(
    (p) => p.id === r.participacao
  )?.rotulo;
  const ocorr = [
    ...(r.ocorrencias || []).map(
      (o) =>
        OCORRENCIAS_SESSAO.find((x) => x.id === o)?.rotulo.toLowerCase() ?? o
    ),
    ...(temTexto(r.ocorrencia_outra) ? [r.ocorrencia_outra.trim()] : []),
  ];
  if (part || ocorr.length)
    resp.push([part, ...ocorr].filter(Boolean).join('; '));
  if (r.resultado_geral)
    resp.push(`Resultado funcional: ${ROTULO_RESULTADO[r.resultado_geral]}`);
  if (temTexto(r.intercorrencias))
    resp.push(`Intercorrências: ${r.intercorrencias.trim()}`);
  if (temTexto(r.observacoes))
    resp.push(`Observações da fisioterapeuta: ${r.observacoes.trim()}`);
  if (temTexto(r.relato_familia))
    resp.push(`Relato da família: ${r.relato_familia.trim()}`);
  if (r.adesao_domiciliar)
    resp.push(
      `Responsável relata ter realizado as orientações domiciliares: ${ADESAO[r.adesao_domiciliar]}`
    );
  texto += secao('📈 Resposta e participação', resp);
  return texto;
}

function linhaAutoria(rotulo: string, autor?: AutoriaEvolucao): string | null {
  if (!autor?.nome) return null;
  return autor.registro_profissional
    ? `${rotulo}: ${autor.nome} — ${autor.registro_profissional}`
    : `${rotulo}: ${autor.nome}`;
}
