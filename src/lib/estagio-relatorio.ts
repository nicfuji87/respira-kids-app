// AI dev note: Monta o "Relatório de Estágio" (frequência + atividades + avaliação
// do supervisor + assinaturas) como HTML imprimível. Segue o padrão do projeto
// (AttendanceStatementGenerator): sem lib de PDF — gera HTML e abre em nova janela
// para imprimir/salvar como PDF. A frequência vem do ponto (estagio_pontos); os
// dados de clínica/IES/supervisor vêm das variáveis do contrato (estagio_contratos).

import type { DiaPresenca } from './estagio-pontos-api';

export interface RelatorioEstagioParams {
  estagiarioNome: string;
  /** Mês de referência já formatado, ex.: "julho de 2026". */
  mesRef: string;
  /** variaveis_utilizadas do contrato (clínica, IES, supervisor, carga etc.). */
  vars: Record<string, string>;
  dias: DiaPresenca[];
  totalHoras: number;
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDiaBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function diaSemana(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const nomes = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  return nomes[new Date(y, m - 1, d).getDay()];
}

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtHoras(n: number): string {
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h`;
}

const CRITERIOS_AVALIACAO = [
  'Assiduidade e pontualidade',
  'Postura ética e profissional',
  'Interesse, iniciativa e proatividade',
  'Aplicação dos conhecimentos técnicos',
  'Relacionamento com a equipe e com pacientes/famílias',
  'Evolução e aprendizado no período',
];

const ATIVIDADES_PADRAO = [
  'Acompanhamento e auxílio na avaliação e no atendimento fisioterapêutico respiratório de pacientes pediátricos, sob supervisão direta;',
  'Auxílio no posicionamento e na contenção segura do bebê/criança durante procedimentos terapêuticos;',
  'Participação em práticas de biossegurança e controle de infecção (higienização e organização de materiais e equipamentos);',
  'Auxílio na orientação de pais/responsáveis quanto a cuidados respiratórios domiciliares, sob supervisão;',
  'Observação e registro da evolução clínica dos pacientes, sob validação do supervisor;',
  'Participação em reuniões clínicas e discussões de caso.',
];

/** Monta o HTML completo (documento A4) do relatório de estágio. */
export function buildRelatorioEstagioHTML(p: RelatorioEstagioParams): string {
  const v = p.vars;
  const totalDias = p.dias.length;

  const linhasFreq =
    p.dias.length === 0
      ? `<tr><td colspan="5" style="text-align:center;color:#888;padding:14px">Sem registros de ponto neste mês.</td></tr>`
      : p.dias
          .map(
            (d) => `<tr>
      <td>${esc(fmtDiaBR(d.data))} <span class="dow">(${esc(diaSemana(d.data))})</span></td>
      <td class="center">${esc(fmtHora(d.primeira))}</td>
      <td class="center">${d.batidas > 1 ? esc(fmtHora(d.ultima)) : '—'}</td>
      <td class="center">${esc(fmtHoras(d.horas))}</td>
      <td></td>
    </tr>`
          )
          .join('\n');

  const criterios = CRITERIOS_AVALIACAO.map(
    (c) => `<tr>
      <td>${esc(c)}</td>
      <td class="chk"></td><td class="chk"></td><td class="chk"></td><td class="chk"></td>
    </tr>`
  ).join('\n');

  const atividades = ATIVIDADES_PADRAO.map((a) => `<li>${esc(a)}</li>`).join(
    '\n'
  );

  const info = (label: string, val: string) =>
    `<div class="info"><span class="lbl">${esc(label)}</span><span class="val">${esc(val) || '—'}</span></div>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Relatório de Estágio — ${esc(p.estagiarioNome)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 12px; margin: 0; padding: 28px 32px; }
  h1 { font-size: 18px; text-align: center; margin: 0 0 2px; }
  .sub { text-align: center; color: #555; font-size: 12px; margin-bottom: 18px; }
  h2 { font-size: 13px; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 1.5px solid #333; text-transform: uppercase; letter-spacing: .3px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; }
  .info { display: flex; gap: 6px; padding: 2px 0; }
  .info .lbl { color: #555; min-width: 130px; }
  .info .val { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #bbb; padding: 5px 8px; font-size: 11.5px; }
  th { background: #f0efe9; text-align: left; }
  td.center, th.center { text-align: center; }
  .dow { color: #888; font-size: 10px; }
  tfoot td { font-weight: 700; background: #faf9f5; }
  .chk { width: 42px; text-align: center; }
  ul { margin: 4px 0 0; padding-left: 18px; }
  li { margin-bottom: 3px; }
  .obs-lines { border: 1px solid #bbb; border-top: none; padding: 8px; min-height: 70px; }
  .obs-lines .line { border-bottom: 1px solid #ddd; height: 20px; }
  .sign-row { display: flex; justify-content: space-between; gap: 24px; margin-top: 48px; }
  .sign { flex: 1; text-align: center; }
  .sign .rule { border-top: 1px solid #333; margin-bottom: 4px; }
  .sign .who { font-weight: 600; font-size: 11.5px; }
  .sign .role { color: #666; font-size: 10.5px; }
  .foot { margin-top: 40px; text-align: right; color: #444; }
  @page { size: A4 portrait; margin: 12mm; }
  @media print { body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <h1>Relatório de Estágio Supervisionado</h1>
  <div class="sub">Fisioterapia — Termo de Compromisso (Lei nº 11.788/2008) · Mês de referência: <strong>${esc(p.mesRef)}</strong></div>

  <h2>1. Identificação</h2>
  <div class="grid">
    ${info('Estagiário(a)', p.estagiarioNome)}
    ${info('CPF', v.estagiarioCpf)}
    ${info('Curso / período', [v.curso, v.semestre].filter(Boolean).join(' – '))}
    ${info('Instituição de ensino', v.iesNome)}
    ${info('Professor(a) orientador(a)', v.professorOrientador)}
    ${info('Concedente (clínica)', v.concedenteRazaoSocial)}
    ${info('CNPJ da clínica', v.concedenteCnpj)}
    ${info('Supervisor(a)', [v.supervisorNome, v.supervisorCrefito ? `CREFITO ${v.supervisorCrefito}` : ''].filter(Boolean).join(' – '))}
    ${info('Carga horária', [v.cargaHorariaDiaria ? `${v.cargaHorariaDiaria}h/dia` : '', v.cargaHorariaSemanal ? `${v.cargaHorariaSemanal}h/semana` : ''].filter(Boolean).join(' · '))}
    ${info('Vigência', [v.vigenciaInicio, v.vigenciaFim].filter(Boolean).join(' a '))}
  </div>

  <h2>2. Controle de Frequência</h2>
  <table>
    <thead>
      <tr><th>Data</th><th class="center">Entrada</th><th class="center">Saída</th><th class="center">Horas</th><th class="center">Visto</th></tr>
    </thead>
    <tbody>
      ${linhasFreq}
    </tbody>
    <tfoot>
      <tr><td>Total: ${totalDias} dia(s)</td><td class="center" colspan="2"></td><td class="center">${esc(fmtHoras(p.totalHoras))}</td><td></td></tr>
    </tfoot>
  </table>

  <h2>3. Atividades Desenvolvidas</h2>
  <ul>
    ${atividades}
  </ul>

  <h2>4. Avaliação do Supervisor</h2>
  <table>
    <thead>
      <tr><th>Critério</th><th class="chk">Insuf.</th><th class="chk">Regular</th><th class="chk">Bom</th><th class="chk">Ótimo</th></tr>
    </thead>
    <tbody>
      ${criterios}
    </tbody>
  </table>
  <div style="margin-top:8px;color:#555">Parecer / observações do(a) supervisor(a):</div>
  <div class="obs-lines">
    <div class="line"></div><div class="line"></div><div class="line"></div>
  </div>

  <h2>5. Assinaturas</h2>
  <div class="sign-row">
    <div class="sign"><div class="rule"></div><div class="who">${esc(p.estagiarioNome)}</div><div class="role">Estagiário(a)</div></div>
    <div class="sign"><div class="rule"></div><div class="who">${esc(v.supervisorNome)}</div><div class="role">Supervisor(a)${v.supervisorCrefito ? ' · CREFITO ' + esc(v.supervisorCrefito) : ''}</div></div>
    <div class="sign"><div class="rule"></div><div class="who">${esc(v.professorOrientador)}</div><div class="role">Professor(a) orientador(a) — IES</div></div>
  </div>

  <div class="foot">${esc(v.cidadeAssinatura || 'Brasília')}, ______ de _________________ de 20____.</div>
</body>
</html>`;
}

/** Abre o HTML em nova janela para impressão/salvar como PDF. */
export function abrirRelatorioParaImpressao(html: string): boolean {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 600);
  return true;
}
