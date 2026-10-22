// AI dev note: Leitura de boleto bancário (linha digitável de 47 dígitos) sem IA.
//
// Valor, vencimento e banco saem do PRÓPRIO código, conferido pelos dígitos
// verificadores (módulo 10 em cada campo + módulo 11 no DV geral). Um número que
// não fecha os DVs é descartado: melhor "não achei boleto" do que pagar errado.
//
// Conta de concessionária (telefone, internet, luz, água, tributo) usa o código de
// ARRECADAÇÃO: 48 dígitos começando com 8, 4 blocos de 11 + DV. Também é conferido
// pelos DVs, mas não traz vencimento: quem chama tira a data do texto da fatura.

export interface Boleto {
  tipo: 'bancario' | 'arrecadacao';
  linha: string; // 47 dígitos (bancário) ou 48 (arrecadação)
  // bancário: 3 dígitos do banco (033 = Santander, 077 = Inter...);
  // arrecadação: "A" + segmento + código da empresa no convênio (ex.: A4-0296)
  banco: string;
  valor: number; // reais; 0 = "valor em aberto" no código
  vencimento: string | null; // YYYY-MM-DD; null quando o código não traz
}

function modulo10(digitos: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = digitos.length - 1; i >= 0; i--) {
    let p = Number(digitos[i]) * peso;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    soma += p;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

function modulo11(digitos: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = digitos.length - 1; i >= 0; i--) {
    soma += Number(digitos[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv = 11 - (soma % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

// Fator de vencimento: dias desde 07/10/1997. Em 22/02/2025 o fator chegou a
// 9999 e recomeçou em 1000; escolhe a data do ciclo mais perto de hoje.
function dataDoFator(fator: number, hoje = new Date()): string | null {
  if (!fator) return null;
  const dia = 86_400_000;
  const ciclo1 = Date.UTC(1997, 9, 7) + fator * dia;
  const ciclo2 = Date.UTC(2025, 1, 22) + (fator - 1000) * dia;
  const agora = hoje.getTime();
  const escolhido =
    fator >= 1000 && Math.abs(ciclo2 - agora) < Math.abs(ciclo1 - agora)
      ? ciclo2
      : ciclo1;
  return new Date(escolhido).toISOString().slice(0, 10);
}

// Confere uma sequência de 47 dígitos como linha digitável de boleto bancário.
export function validarLinha(linha: string, hoje?: Date): Boleto | null {
  if (!/^\d{47}$/.test(linha) || linha[0] === '8') return null;
  const c1 = linha.slice(0, 9);
  const c2 = linha.slice(10, 20);
  const c3 = linha.slice(21, 31);
  if (
    modulo10(c1) !== Number(linha[9]) ||
    modulo10(c2) !== Number(linha[20]) ||
    modulo10(c3) !== Number(linha[31])
  ) {
    return null;
  }
  const dvGeral = linha[32];
  const fatorValor = linha.slice(33, 47);
  const campoLivre = linha.slice(4, 9) + c2 + c3;
  const semDv = linha.slice(0, 4) + fatorValor + campoLivre;
  if (String(modulo11(semDv)) !== dvGeral) return null;

  return {
    tipo: 'bancario',
    linha,
    banco: linha.slice(0, 3),
    valor: Number(fatorValor.slice(4)) / 100,
    vencimento: dataDoFator(Number(fatorValor.slice(0, 4)), hoje),
  };
}

// Código de barras (44 dígitos) → linha digitável, para quando o PDF só traz o código.
export function linhaDoCodigoDeBarras(cb: string): string | null {
  if (!/^\d{44}$/.test(cb) || cb[0] === '8') return null;
  const livre = cb.slice(19);
  const c1 = cb.slice(0, 4) + livre.slice(0, 5);
  const c2 = livre.slice(5, 15);
  const c3 = livre.slice(15, 25);
  return (
    c1 +
    modulo10(c1) +
    c2 +
    modulo10(c2) +
    c3 +
    modulo10(c3) +
    cb[4] +
    cb.slice(5, 19)
  );
}

// Arrecadação: o 3º dígito diz o módulo dos DVs (6/7 = módulo 10, 8/9 = módulo 11).
// No módulo 11 daqui, resto 0 ou 1 vira DV 0 (regra da Febraban para convênios).
function modulo11Arrecadacao(digitos: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = digitos.length - 1; i >= 0; i--) {
    soma += Number(digitos[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv = 11 - (soma % 11);
  return dv >= 10 ? 0 : dv;
}

function dvArrecadacao(id: string, digitos: string): number | null {
  if (id === '6' || id === '7') return modulo10(digitos);
  if (id === '8' || id === '9') return modulo11Arrecadacao(digitos);
  return null;
}

function arrecadacaoDoCodigo(cb: string): Boleto | null {
  if (!/^8\d{43}$/.test(cb)) return null;
  const id = cb[2];
  const dv = dvArrecadacao(id, cb.slice(0, 3) + cb.slice(4));
  if (dv === null || String(dv) !== cb[3]) return null;
  // 6 e 8 trazem o valor efetivo; 7 e 9, valor de referência (fica sem valor)
  const valor = id === '6' || id === '8' ? Number(cb.slice(4, 15)) / 100 : 0;
  const linha = [0, 11, 22, 33]
    .map((i) => {
      const bloco = cb.slice(i, i + 11);
      return bloco + dvArrecadacao(id, bloco);
    })
    .join('');
  return {
    tipo: 'arrecadacao',
    linha,
    banco: `A${cb[1]}-${cb.slice(15, 19)}`,
    valor,
    vencimento: null,
  };
}

// Confere 48 dígitos como linha de arrecadação (cada bloco de 11 + DV).
export function validarArrecadacao(linha: string): Boleto | null {
  if (!/^8\d{47}$/.test(linha)) return null;
  const id = linha[2];
  const blocos = [0, 12, 24, 36].map((i) => linha.slice(i, i + 12));
  for (const b of blocos) {
    if (String(dvArrecadacao(id, b.slice(0, 11))) !== b[11]) return null;
  }
  return arrecadacaoDoCodigo(blocos.map((b) => b.slice(0, 11)).join(''));
}

// Vencimento escrito na fatura ("Vencimento: 20/10/2026", "Vencto 20/10/2026").
export function acharVencimentoNoTexto(texto: string): string | null {
  const m = texto.match(
    /venc(?:imento|to)?\.?[^\d]{0,40}?(\d{2})[/.-](\d{2})[/.-](\d{4})/i
  );
  if (!m) return null;
  const [, d, mes, a] = m;
  const iso = `${a}-${mes}-${d}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

// Procura boletos no texto do PDF. A linha costuma vir com pontos e espaços
// ("03399.12345 67890.123456 ..."), às vezes quebrada; tenta janelas de dígitos.
export function acharBoletos(texto: string, hoje?: Date): Boleto[] {
  const achados = new Map<string, Boleto>();
  // blocos de dígitos separados só por espaço, ponto ou hífen
  const blocos = (texto.match(/\d[\d.\s-]{40,80}\d/g) ?? []).map((b) =>
    b.replace(/\D/g, '')
  );
  for (const d of blocos) {
    for (let i = 0; i + 47 <= d.length; i++) {
      const b = validarLinha(d.slice(i, i + 47), hoje);
      if (b) achados.set(b.linha, b);
    }
    for (let i = 0; i + 48 <= d.length; i++) {
      const b = validarArrecadacao(d.slice(i, i + 48));
      if (b) achados.set(b.linha, b);
    }
  }
  // Código de barras só quando não há linha digitável, e só em bloco do tamanho
  // dele: janelas de 44 dentro de uma linha de 47 geram falso positivo (o DV geral
  // é a única trava e passa 1 vez em 11).
  if (!achados.size) {
    for (const d of blocos) {
      if (d.length !== 44) continue;
      const l = linhaDoCodigoDeBarras(d);
      const b = l ? validarLinha(l, hoje) : arrecadacaoDoCodigo(d);
      if (b) achados.set(b.linha, b);
    }
  }
  return [...achados.values()];
}

function cnpjValido(c: string): boolean {
  if (!/^\d{14}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
  const calc = (base: string, pesos: number[]) => {
    const s = pesos.reduce((a, p, i) => a + Number(base[i]) * p, 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  const d1 = calc(c, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(c, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(c[12]) && d2 === Number(c[13]);
}

// Beneficiário: primeiro CNPJ válido do texto que não seja de uma empresa nossa
// (o pagador também aparece no boleto). Prefere o que vem perto de "Beneficiário".
export function acharBeneficiario(
  texto: string,
  cnpjsNossos: string[]
): { doc: string | null; nome: string | null } {
  const nossos = new Set(cnpjsNossos.map((c) => c.replace(/\D/g, '')));
  const re = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g;
  const cands: { doc: string; pos: number }[] = [];
  for (const m of texto.matchAll(re)) {
    const doc = m[0].replace(/\D/g, '');
    if (cnpjValido(doc) && !nossos.has(doc))
      cands.push({ doc, pos: m.index ?? 0 });
  }
  if (!cands.length) return { doc: null, nome: null };

  const posBenef = texto.search(/benefici[aá]rio|cedente/i);
  const melhor =
    posBenef >= 0
      ? cands.reduce((a, b) =>
          Math.abs(b.pos - posBenef) < Math.abs(a.pos - posBenef) ? b : a
        )
      : cands[0];

  // nome: o texto logo antes do CNPJ ("Beneficiário Centro Médico Julio Adnet 14.652.023/0001-95").
  // O extrator junta o PDF numa linha só, então corta no último rótulo antes do CNPJ.
  const antes =
    (
      texto
        .slice(Math.max(0, melhor.pos - 90), melhor.pos)
        .split(/\n/)
        .pop() ?? ''
    )
      .split(
        /benefici[aá]rio(?:\s+final)?|cedente|raz[aã]o social|nome fantasia|cnpj|cpf|:/i
      )
      .pop() ?? '';
  const nome = antes
    .replace(/[-–/]+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    doc: melhor.doc,
    nome: nome.length >= 3 && /[a-z]/i.test(nome) ? nome.slice(0, 120) : null,
  };
}
