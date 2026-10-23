// AI dev note: Bônus das estagiárias por evolução no prazo, dentro da tela Metas
// (aba Clínica). Regra combinada na reunião de 23/10/2026: R$100 por mês, −R$5
// por sessão sem evolução no prazo (24h; sábado/domingo até segunda 23h59),
// domiciliar não conta, meta da dupla. Fonte: fn_estagio_bonus_evolucoes (a
// mesma da aba Reuniões). Só admin/secretaria leem; para os outros some.

import React, { useEffect, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import {
  brl,
  fetchBonusEvolucoes,
  nomeMes,
  type BonusEvolucoes,
} from '@/lib/estagio-reunioes-api';
import { REUNIOES } from '@/lib/estagio-reunioes';

interface Props {
  mes: number; // 1-12
  ano: number;
}

export const BonusEstagiariasCard: React.FC<Props> = ({ mes, ano }) => {
  const [dados, setDados] = useState<BonusEvolucoes | null>(null);

  useEffect(() => {
    let cancel = false;
    const yyyymm = `${ano}-${String(mes).padStart(2, '0')}`;
    fetchBonusEvolucoes(yyyymm)
      .then((d) => {
        if (!cancel) setDados(d);
      })
      .catch(() => {
        if (!cancel) setDados(null);
      });
    return () => {
      cancel = true;
    };
  }, [mes, ano]);

  if (!dados) return null;

  const inicio = REUNIOES[0]?.bonusInicio;
  const simulacao = inicio ? dados.mes < inicio : false;
  const pct = dados.contadas
    ? Math.round((100 * dados.no_prazo) / dados.contadas)
    : 0;

  return (
    <Card className="mb-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <GraduationCap className="h-4 w-4 text-azul-respira" />
          Bônus das estagiárias: evoluções no prazo
          {simulacao && <Badge variant="secondary">simulação</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <p className="text-2xl font-bold text-roxo-titulo">
            {brl(dados.bonus)}
            <span className="text-sm font-normal text-muted-foreground">
              {' '}
              de {brl(dados.bonus_base)}
            </span>
          </p>
          <p className="text-muted-foreground">
            {dados.no_prazo} de {dados.contadas} no prazo ({pct}%) ·{' '}
            {dados.perdidas} perdida{dados.perdidas === 1 ? '' : 's'} ·{' '}
            {dados.em_risco} ainda no prazo
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Meta: 100% das evoluções no prazo. {brl(dados.desconto_por_perdida)} a
          menos por sessão perdida (24h; sábado e domingo vencem segunda 23h59).
          Domiciliar não conta. A meta é da dupla.
          {simulacao && inicio && ` Vale a partir de ${nomeMes(inicio)}.`}
        </p>
      </CardContent>
    </Card>
  );
};

BonusEstagiariasCard.displayName = 'BonusEstagiariasCard';
