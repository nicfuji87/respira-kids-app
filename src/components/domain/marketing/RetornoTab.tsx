// AI dev note: aba Retorno dos anúncios (admin). Quem veio do Google Ads, quantas
// sessões fez e quanto rendeu: investimento × receita realizada (sessões que já
// aconteceram), recebida (faturas pagas) e agendada (futuras). Período do painel;
// filtro de campanha do painel; a busca pela marca pode sair da conta (quem procura
// "Respira Kids" já conhecia a clínica). Regras em src/lib/marketing-retorno.ts.

import React, { useEffect, useMemo, useState } from 'react';
import {
  SecaoRelatorio,
  TabelaRelatorio,
} from '@/components/domain/relatorios/relatorios-ui';
import { Skeleton } from '@/components/primitives/skeleton';
import { Badge } from '@/components/primitives/badge';
import { Checkbox } from '@/components/primitives/checkbox';
import {
  brl,
  dataHora,
  num,
  pct,
  vezes,
  type Recorte,
} from '@/lib/marketing-atribuicao';
import { periodoDosMeses } from '@/lib/marketing-otimizacao';
import {
  carregarRetorno,
  dataParede,
  ehMarca,
  RESULTADO,
  somar,
  type ConversaRetorno,
  type DadosRetorno,
  type PacienteRetorno,
} from '@/lib/marketing-retorno';
import { Aviso, CartaoIndicador, ValorIndicador } from './marketing-ui';

export const RetornoTab: React.FC<{ r: Recorte }> = ({ r }) => {
  const [d, setD] = useState<DadosRetorno | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [comMarca, setComMarca] = useState(true);
  const { desde, ate } = periodoDosMeses(r.filtros.mesInicio, r.filtros.mesFim);

  useEffect(() => {
    let vivo = true;
    setD(null);
    setErro(null);
    carregarRetorno(desde, ate)
      .then((x) => vivo && setD(x))
      .catch((e: Error) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [desde, ate]);

  const v = useMemo(() => {
    if (!d) return null;
    const nomes = new Map(d.campanhas.map((c) => [c.campanha_id, c.nome]));
    const filtroCamp = (id: string | null) =>
      r.filtros.campanha === 'todas' || id === r.filtros.campanha;
    const marca = new Set(
      d.campanhas.filter((c) => ehMarca(c.nome)).map((c) => c.campanha_id)
    );
    const entra = (id: string | null) =>
      filtroCamp(id) && (comMarca || !id || !marca.has(id));
    const campanhas = d.campanhas.filter((c) => entra(c.campanha_id));
    const semMarca = d.campanhas.filter(
      (c) => filtroCamp(c.campanha_id) && !marca.has(c.campanha_id)
    );
    return {
      nomes,
      campanhas,
      pacientes: d.pacientes.filter((p) => entra(p.campanha_id)),
      conversas: d.conversas.filter((c) => entra(c.campanha_id)),
      t: somar(campanhas),
      tSemMarca: somar(semMarca),
      temMarca: marca.size > 0,
    };
  }, [d, r.filtros.campanha, comMarca]);

  if (erro)
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar o retorno dos anúncios: {erro}
      </p>
    );
  if (!d || !v) return <Skeleton className="h-64 w-full" />;

  const { t, tSemMarca, nomes } = v;
  const nomeCamp = (id: string | null) =>
    id ? (nomes.get(id) ?? id).replace('RK | Pesquisa | ', '') : '—';
  const semBaixa = v.pacientes.reduce((a, p) => a + p.sessoes_sem_baixa, 0);
  const porResultado = v.conversas.reduce<Record<string, number>>((a, c) => {
    a[c.resultado] = (a[c.resultado] ?? 0) + 1;
    return a;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Google Ads, {dataParede(`${desde}T00:00`).slice(0, 5)} a{' '}
          {dataParede(`${ate}T00:00`).slice(0, 5)}. Custo importado até{' '}
          {d.custo_ultimo_dia
            ? dataParede(`${d.custo_ultimo_dia}T00:00`).slice(0, 5)
            : '—'}
          ; sessões e conversas até agora ({dataHora(d.gerado_em)}).
        </p>
        {v.temMarca && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={comMarca}
              onCheckedChange={(c) => setComMarca(c === true)}
              aria-label="Incluir a campanha de busca pela marca"
            />
            Incluir busca pela marca
          </label>
        )}
      </div>

      <Aviso>
        <strong className="text-foreground">Como ler: </strong>
        receita <strong>realizada</strong> = sessões que já aconteceram, pelo
        valor da agenda (a cobrança é mensal, então o pagamento chega depois);
        <strong> recebida</strong> = faturas já pagas; <strong>agendada</strong>{' '}
        = sessões futuras, fora do ROAS realizado. Valores brutos, sem comissão,
        imposto nem taxa. Quem buscou "Respira Kids" já conhecia a clínica: veja
        os números sem a marca para medir o que o anúncio trouxe de novo.
      </Aviso>

      {semBaixa > 0 && (
        <Aviso tom="atencao">
          <strong className="text-foreground">
            {num(semBaixa)} sessão(ões) já passaram sem baixa.{' '}
          </strong>
          Elas contam como realizadas aqui, mas seguem "Agendado" ou
          "Confirmado" na agenda. Dar baixa ("Finalizado") deixa o restante do
          painel e a cobrança certos.
        </Aviso>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CartaoIndicador
          rotulo="Investimento"
          valor={brl(t.investimento)}
          detalhe={`${num(t.cliques)} cliques · ${num(t.conversas)} conversas`}
        />
        <CartaoIndicador
          rotulo="Pacientes que vieram dos anúncios"
          valor={num(t.pacientes)}
          detalhe={`${num(t.pacientes_novas)} nova(s) · ${num(porResultado.agendada ?? 0)} com 1ª sessão marcada`}
        />
        <CartaoIndicador
          rotulo="Sessões realizadas"
          valor={num(t.sessoes_realizadas)}
          detalhe={
            <>
              + {num(t.sessoes_agendadas)} agendada(s) · média{' '}
              <ValorIndicador
                ind={t.sessoes_por_paciente}
                formato={(x) =>
                  x.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
                }
                compacto
              />{' '}
              por paciente
            </>
          }
        />
        <CartaoIndicador
          rotulo="Receita realizada"
          valor={brl(t.receita_realizada)}
          detalhe={`Recebida ${brl(t.receita_recebida)} · agendada ${brl(t.receita_agendada)}`}
        />
        <CartaoIndicador
          rotulo="ROAS realizado"
          ind={t.roas_realizado}
          formato={vezes}
          detalhe={
            <>
              Com agendadas{' '}
              <ValorIndicador
                ind={t.roas_com_agendadas}
                formato={vezes}
                compacto
              />
              {v.temMarca && comMarca && (
                <>
                  {' '}
                  · sem marca{' '}
                  <ValorIndicador
                    ind={tSemMarca.roas_realizado}
                    formato={vezes}
                    compacto
                  />
                </>
              )}
            </>
          }
        />
        <CartaoIndicador
          rotulo="ROAS recebido"
          ind={t.roas_recebido}
          formato={vezes}
          detalhe="Só faturas pagas; sobe quando a cobrança do mês é paga."
        />
        <CartaoIndicador
          rotulo="Custo por paciente nova (CAC)"
          ind={t.cac}
          formato={brl}
          detalhe={
            v.temMarca && comMarca ? (
              <>
                Sem marca{' '}
                <ValorIndicador ind={tSemMarca.cac} formato={brl} compacto />
              </>
            ) : undefined
          }
        />
        <CartaoIndicador
          rotulo="Custo por conversa"
          ind={t.custo_conversa}
          formato={brl}
          detalhe={`${num(t.convenio)} de ${num(t.conversas)} citaram convênio (${pct(t.conversas ? t.convenio / t.conversas : null)})`}
        />
      </div>

      <SecaoRelatorio
        titulo="Por campanha"
        descricao="Investimento do período (script de custos do Google Ads) e o que as conversas iniciadas no período renderam até hoje."
        csv={{
          nome: `retorno-campanhas_${desde}_${ate}`,
          linhas: v.campanhas,
          colunas: [
            { chave: 'nome', titulo: 'Campanha' },
            { chave: 'investimento', titulo: 'Investimento' },
            { chave: 'cliques', titulo: 'Cliques' },
            { chave: 'conversas', titulo: 'Conversas' },
            { chave: 'pacientes', titulo: 'Pacientes' },
            { chave: 'sessoes_realizadas', titulo: 'Sessões realizadas' },
            { chave: 'receita_realizada', titulo: 'Receita realizada' },
            { chave: 'receita_recebida', titulo: 'Receita recebida' },
            { chave: 'receita_agendada', titulo: 'Receita agendada' },
          ],
        }}
      >
        <TabelaRelatorio
          linhas={v.campanhas.map((c) => {
            const x = somar([c]);
            return { ...c, roas: x.roas_realizado, cac: x.cac };
          })}
          colunas={[
            {
              chave: 'nome',
              titulo: 'Campanha',
              formato: (_, l) => nomeCamp(l.campanha_id),
            },
            {
              chave: 'investimento',
              titulo: 'Investimento',
              alinhar: 'direita',
              formato: (x) => brl(Number(x)),
            },
            { chave: 'cliques', titulo: 'Cliques', alinhar: 'direita' },
            { chave: 'conversas', titulo: 'Conversas', alinhar: 'direita' },
            { chave: 'pacientes', titulo: 'Pacientes', alinhar: 'direita' },
            {
              chave: 'sessoes_realizadas',
              titulo: 'Sessões',
              alinhar: 'direita',
            },
            {
              chave: 'receita_realizada',
              titulo: 'Receita realizada',
              alinhar: 'direita',
              formato: (x) => brl(Number(x)),
            },
            {
              chave: 'receita_agendada',
              titulo: 'Agendada',
              alinhar: 'direita',
              formato: (x) => brl(Number(x)),
            },
            {
              chave: 'roas',
              titulo: 'ROAS realizado',
              alinhar: 'direita',
              formato: (_, l) => (
                <ValorIndicador ind={l.roas} formato={vezes} compacto />
              ),
            },
            {
              chave: 'cac',
              titulo: 'CAC',
              alinhar: 'direita',
              formato: (_, l) => (
                <ValorIndicador ind={l.cac} formato={brl} compacto />
              ),
            },
          ]}
          rodape={{
            nome: 'Total',
            investimento: brl(t.investimento),
            cliques: num(t.cliques),
            conversas: num(t.conversas),
            pacientes: num(t.pacientes),
            sessoes_realizadas: num(t.sessoes_realizadas),
            receita_realizada: brl(t.receita_realizada),
            receita_agendada: brl(t.receita_agendada),
            roas: (
              <ValorIndicador ind={t.roas_realizado} formato={vezes} compacto />
            ),
            cac: <ValorIndicador ind={t.cac} formato={brl} compacto />,
          }}
        />
      </SecaoRelatorio>

      <SecaoRelatorio
        titulo="Pacientes que vieram dos anúncios"
        descricao="Cada paciente ligada a uma conversa iniciada pelo anúncio, com todas as sessões desde a primeira. Sessões que já passaram contam como realizadas mesmo sem baixa; faltas entram na receita (cobradas integral)."
        csv={{
          nome: `retorno-pacientes_${desde}_${ate}`,
          linhas: v.pacientes.map((p) => ({
            ...p,
            campanha: nomeCamp(p.campanha_id),
          })),
          colunas: [
            { chave: 'nome', titulo: 'Paciente' },
            { chave: 'campanha', titulo: 'Campanha' },
            { chave: 'palavra_chave', titulo: 'Palavra-chave' },
            { chave: 'primeiro_contato', titulo: '1º contato' },
            { chave: 'primeira_sessao', titulo: '1ª sessão' },
            { chave: 'sessoes_realizadas', titulo: 'Sessões realizadas' },
            { chave: 'sessoes_agendadas', titulo: 'Sessões agendadas' },
            { chave: 'receita_realizada', titulo: 'Receita realizada' },
            { chave: 'receita_recebida', titulo: 'Receita recebida' },
            { chave: 'receita_agendada', titulo: 'Receita agendada' },
          ],
        }}
      >
        {v.pacientes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma paciente ligada a conversa de anúncio neste período.
          </p>
        ) : (
          <TabelaRelatorio<PacienteRetorno>
            linhas={v.pacientes}
            colunas={[
              {
                chave: 'nome',
                titulo: 'Paciente',
                formato: (x, l) => (
                  <span className="flex items-center gap-2">
                    {String(x ?? '—')}
                    {l.ja_era_paciente && (
                      <Badge variant="muted">já era paciente</Badge>
                    )}
                  </span>
                ),
              },
              {
                chave: 'campanha_id',
                titulo: 'Campanha',
                formato: (x) => nomeCamp(x as string | null),
              },
              {
                chave: 'palavra_chave',
                titulo: 'Palavra-chave',
                formato: (x) => String(x ?? '—'),
              },
              {
                chave: 'primeiro_contato',
                titulo: '1º contato',
                formato: (x) => dataParede(x as string | null),
              },
              {
                chave: 'primeira_sessao',
                titulo: '1ª sessão',
                formato: (x) => dataParede(x as string | null),
              },
              {
                chave: 'sessoes_realizadas',
                titulo: 'Sessões',
                alinhar: 'direita',
                formato: (x, l) => (
                  <span
                    title={
                      l.sessoes_sem_baixa
                        ? `${l.sessoes_sem_baixa} sem baixa na agenda`
                        : undefined
                    }
                  >
                    {num(Number(x))}
                    {l.sessoes_sem_baixa > 0 && (
                      <span
                        className="ml-0.5 text-amarelo-pipa-ink"
                        aria-label={`${l.sessoes_sem_baixa} sem baixa`}
                      >
                        *
                      </span>
                    )}
                    {l.faltas > 0 && ` (+${l.faltas} falta)`}
                  </span>
                ),
              },
              {
                chave: 'proxima_sessao',
                titulo: 'Próxima',
                formato: (x, l) =>
                  x
                    ? `${dataParede(x as string)}${l.sessoes_agendadas > 1 ? ` (+${l.sessoes_agendadas - 1})` : ''}`
                    : '—',
              },
              {
                chave: 'receita_realizada',
                titulo: 'Realizada',
                alinhar: 'direita',
                formato: (x) => brl(Number(x)),
              },
              {
                chave: 'receita_recebida',
                titulo: 'Recebida',
                alinhar: 'direita',
                formato: (x) => brl(Number(x)),
              },
              {
                chave: 'receita_agendada',
                titulo: 'Agendada',
                alinhar: 'direita',
                formato: (x) => brl(Number(x)),
              },
            ]}
          />
        )}
      </SecaoRelatorio>

      <SecaoRelatorio
        titulo="Conversas vindas dos anúncios"
        descricao={`${num(v.conversas.length)} conversa(s): ${(
          Object.keys(RESULTADO) as (keyof typeof RESULTADO)[]
        )
          .map(
            (k) =>
              `${num(porResultado[k] ?? 0)} ${RESULTADO[k].rotulo.toLowerCase()}`
          )
          .join(
            ' · '
          )}. "Pediu horário" = pediu para agendar e ainda não tem sessão marcada.`}
        csv={{
          nome: `retorno-conversas_${desde}_${ate}`,
          linhas: v.conversas.map((c) => ({
            ...c,
            campanha: nomeCamp(c.campanha_id),
            resultado: RESULTADO[c.resultado].rotulo,
            convenio: c.convenio ? 'sim' : 'não',
          })),
          colunas: [
            { chave: 'primeira_msg', titulo: '1ª mensagem' },
            { chave: 'campanha', titulo: 'Campanha' },
            { chave: 'palavra_chave', titulo: 'Palavra-chave' },
            { chave: 'pagina', titulo: 'Página' },
            { chave: 'convenio', titulo: 'Citou convênio' },
            { chave: 'resultado', titulo: 'Resultado' },
          ],
        }}
      >
        <TabelaRelatorio<ConversaRetorno>
          linhas={v.conversas}
          colunas={[
            {
              chave: 'primeira_msg',
              titulo: '1ª mensagem',
              formato: (x) => dataParede(x as string | null),
            },
            {
              chave: 'campanha_id',
              titulo: 'Campanha',
              formato: (x) => nomeCamp(x as string | null),
            },
            {
              chave: 'palavra_chave',
              titulo: 'Palavra-chave',
              formato: (x) => String(x ?? '—'),
            },
            {
              chave: 'pagina',
              titulo: 'Página',
              formato: (x) => String(x ?? '—'),
            },
            {
              chave: 'convenio',
              titulo: 'Convênio',
              formato: (x) => (x ? 'citou' : '—'),
            },
            {
              chave: 'resultado',
              titulo: 'Resultado',
              formato: (x) => {
                const res = RESULTADO[x as keyof typeof RESULTADO];
                return <Badge variant={res.variante}>{res.rotulo}</Badge>;
              },
            },
          ]}
        />
      </SecaoRelatorio>
    </div>
  );
};
