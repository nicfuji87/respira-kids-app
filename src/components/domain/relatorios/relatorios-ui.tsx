// AI dev note: Peças compartilhadas da página Relatórios (tradicionais + insights).
// Tabela simples com exportação CSV (separador ; e vírgula decimal, abre certo
// no Excel em pt-BR) e card de insight no formato "número → o que quer dizer →
// o que fazer".

import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Download, Lightbulb, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { paraCsv } from '@/lib/relatorios-analise';

export interface Coluna<T> {
  chave: keyof T & string;
  titulo: string;
  formato?: (v: T[keyof T], linha: T) => React.ReactNode;
  alinhar?: 'esquerda' | 'direita';
}

function baixarCsv(nome: string, conteudo: string) {
  const blob = new Blob(['﻿' + conteudo], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nome}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TabelaRelatorio<T extends object>({
  linhas,
  colunas,
  rodape,
}: {
  linhas: T[];
  colunas: Coluna<T>[];
  rodape?: Partial<Record<keyof T & string, React.ReactNode>>;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {colunas.map((c) => (
              <th
                key={c.chave}
                className={cn(
                  'px-3 py-2 font-medium text-muted-foreground whitespace-nowrap',
                  c.alinhar === 'direita' ? 'text-right' : 'text-left'
                )}
              >
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-t">
              {colunas.map((c) => (
                <td
                  key={c.chave}
                  className={cn(
                    'px-3 py-2 whitespace-nowrap tabular-nums',
                    c.alinhar === 'direita' ? 'text-right' : 'text-left'
                  )}
                >
                  {c.formato
                    ? c.formato(l[c.chave], l)
                    : String(l[c.chave] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
          {rodape && (
            <tr className="border-t bg-muted/30 font-medium">
              {colunas.map((c) => (
                <td
                  key={c.chave}
                  className={cn(
                    'px-3 py-2 whitespace-nowrap tabular-nums',
                    c.alinhar === 'direita' ? 'text-right' : 'text-left'
                  )}
                >
                  {rodape[c.chave] ?? ''}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export const SecaoRelatorio: React.FC<{
  titulo: string;
  descricao?: string;
  csv?: {
    nome: string;
    linhas: object[];
    colunas: { chave: string; titulo: string }[];
  };
  children: React.ReactNode;
}> = ({ titulo, descricao, csv, children }) => (
  <Card>
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="text-base">{titulo}</CardTitle>
          {descricao && (
            <p className="text-sm text-muted-foreground mt-1">{descricao}</p>
          )}
        </div>
        {csv && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() =>
              baixarCsv(
                csv.nome,
                paraCsv(csv.linhas as Record<string, unknown>[], csv.colunas)
              )
            }
          >
            <Download className="h-4 w-4" />
            CSV
          </Button>
        )}
      </div>
    </CardHeader>
    <CardContent className="space-y-4">{children}</CardContent>
  </Card>
);

export const Indicador: React.FC<{
  rotulo: string;
  valor: React.ReactNode;
  detalhe?: React.ReactNode;
}> = ({ rotulo, valor, detalhe }) => (
  <div className="rounded-md border p-3">
    <div className="text-xs text-muted-foreground">{rotulo}</div>
    <div className="text-2xl font-bold tabular-nums mt-1">{valor}</div>
    {detalhe && (
      <div className="text-xs text-muted-foreground mt-1">{detalhe}</div>
    )}
  </div>
);

// AI dev note: card de insight. O número vem primeiro; "significa" explica
// sem jargão; "fazer" é a ação concreta. Os textos são montados com os números
// do momento, então mudam sozinhos conforme os dados.
export const CardInsight: React.FC<{
  titulo: string;
  destaque: React.ReactNode;
  significa: React.ReactNode;
  fazer: React.ReactNode;
  children?: React.ReactNode;
}> = ({ titulo, destaque, significa, fazer, children }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-base">{titulo}</CardTitle>
      <div className="text-sm mt-1">{destaque}</div>
    </CardHeader>
    <CardContent className="space-y-4">
      {children}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md bg-muted/40 p-3 text-sm">
          <div className="flex items-center gap-1.5 font-medium mb-1">
            <Lightbulb className="h-4 w-4 text-amarelo-pipa" />O que isso quer
            dizer
          </div>
          <div className="text-muted-foreground">{significa}</div>
        </div>
        <div className="rounded-md border border-azul-respira/40 p-3 text-sm">
          <div className="flex items-center gap-1.5 font-medium mb-1">
            <ArrowRight className="h-4 w-4 text-azul-respira" />O que fazer
          </div>
          <div className="text-muted-foreground">{fazer}</div>
        </div>
      </div>
    </CardContent>
  </Card>
);
