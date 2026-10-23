// Página pública: anamnese respondida pelos pais antes da avaliação motora.
// Rota: #/anamnese/:token (sem login). Só os campos permitidos são gravados
// (o banco filtra). A fisio confere e aplica na avaliação.

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Textarea } from '@/components/primitives/textarea';
import { cn } from '@/lib/utils';
import {
  PERGUNTAS_ANAMNESE,
  buscarAnamnesePublica,
  responderAnamnesePublica,
  type PerguntaAnamnese,
} from '@/lib/avaliacao-motora';

type Valor = string | number | boolean | string[];

const chip = (sel: boolean) =>
  cn(
    'rounded-full border px-3 py-2 text-sm transition-colors',
    sel
      ? 'bg-primary text-primary-foreground border-primary'
      : 'bg-background text-muted-foreground hover:bg-muted'
  );

const Pergunta: React.FC<{
  p: PerguntaAnamnese;
  valor: Valor | undefined;
  onChange: (v: Valor | undefined) => void;
}> = ({ p, valor, onChange }) => (
  <div className="space-y-2">
    <p className="font-medium">{p.pergunta}</p>
    {p.ajuda && <p className="text-sm text-muted-foreground">{p.ajuda}</p>}
    {p.tipo === 'texto' && (
      <Textarea
        value={(valor as string) ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        rows={3}
      />
    )}
    {p.tipo === 'numero' && (
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        className="max-w-[10rem]"
        value={(valor as number | undefined) ?? ''}
        onChange={(e) =>
          onChange(e.target.value === '' ? undefined : Number(e.target.value))
        }
      />
    )}
    {p.tipo === 'simnao' && (
      <div className="flex gap-2">
        {[
          [true, 'Sim'],
          [false, 'Não'],
        ].map(([v, l]) => (
          <button
            key={String(v)}
            type="button"
            className={chip(valor === v)}
            onClick={() => onChange(valor === v ? undefined : (v as boolean))}
          >
            {l as string}
          </button>
        ))}
      </div>
    )}
    {p.tipo === 'opcao' && (
      <div className="flex flex-wrap gap-2">
        {p.opcoes!.map((o) => (
          <button
            key={o.valor}
            type="button"
            className={chip(valor === o.valor)}
            onClick={() => onChange(valor === o.valor ? undefined : o.valor)}
          >
            {o.label}
          </button>
        ))}
      </div>
    )}
    {p.tipo === 'multipla' && (
      <div className="flex flex-wrap gap-2">
        {p.opcoes!.map((o) => {
          const lista = (valor as string[] | undefined) ?? [];
          const sel = lista.includes(o.valor);
          return (
            <button
              key={o.valor}
              type="button"
              aria-pressed={sel}
              className={chip(sel)}
              onClick={() => {
                const nova = sel
                  ? lista.filter((x) => x !== o.valor)
                  : [...lista, o.valor];
                onChange(nova.length ? nova : undefined);
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    )}
  </div>
);

export const AnamnesePaisPage: React.FC = () => {
  const { token = '' } = useParams();
  const [estado, setEstado] = useState<
    'carregando' | 'invalido' | 'expirado' | 'form' | 'enviando' | 'pronto'
  >('carregando');
  const [nome, setNome] = useState('');
  const [respostas, setRespostas] = useState<Record<string, Valor>>({});
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    buscarAnamnesePublica(token)
      .then((r) => {
        if (!r) return setEstado('invalido');
        setNome(r.nome);
        if (r.expirado) return setEstado('expirado');
        setRespostas((r.respostas as Record<string, Valor>) ?? {});
        setEstado('form');
      })
      .catch(() => setEstado('invalido'));
  }, [token]);

  const blocos = useMemo(
    () => [...new Set(PERGUNTAS_ANAMNESE.map((p) => p.bloco))],
    []
  );

  const enviar = async () => {
    setEstado('enviando');
    setErro(null);
    try {
      const ok = await responderAnamnesePublica(token, respostas);
      if (!ok) {
        setEstado('expirado');
        return;
      }
      setEstado('pronto');
      window.scrollTo({ top: 0 });
    } catch {
      setErro('Não foi possível enviar agora. Tente de novo em instantes.');
      setEstado('form');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        <header className="space-y-1">
          <p className="text-sm text-muted-foreground">Respira Kids</p>
          <h1 className="text-2xl font-semibold">
            Antes da avaliação{nome ? ` de ${nome}` : ''}
          </h1>
        </header>

        {estado === 'carregando' && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </p>
        )}
        {estado === 'invalido' && (
          <p>Este link não é válido. Peça um novo link à clínica.</p>
        )}
        {estado === 'expirado' && (
          <p>
            Este link já foi usado ou expirou. Se precisar mudar alguma
            resposta, fale com a clínica.
          </p>
        )}
        {estado === 'pronto' && (
          <div className="rounded-xl border p-6 space-y-2 text-center">
            <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-600" />
            <p className="text-lg font-medium">Respostas enviadas. Obrigado!</p>
            <p className="text-sm text-muted-foreground">
              A fisioterapeuta vai conferir tudo com vocês na consulta. Até lá,
              dá para voltar neste link e ajustar alguma resposta.
            </p>
            <Button variant="outline" onClick={() => setEstado('form')}>
              Rever respostas
            </Button>
          </div>
        )}

        {(estado === 'form' || estado === 'enviando') && (
          <>
            <p className="text-muted-foreground">
              Responda o que souber. Nenhuma pergunta é obrigatória e leva
              poucos minutos. Isso ajuda a fisioterapeuta a aproveitar melhor o
              tempo da consulta.
            </p>
            {blocos.map((b) => (
              <section key={b} className="rounded-xl border p-4 space-y-5">
                <h2 className="text-lg font-semibold">{b}</h2>
                {PERGUNTAS_ANAMNESE.filter((p) => p.bloco === b).map((p) => (
                  <Pergunta
                    key={p.campo}
                    p={p}
                    valor={respostas[p.campo]}
                    onChange={(v) =>
                      setRespostas((r) => {
                        const n = { ...r };
                        if (v === undefined) delete n[p.campo];
                        else n[p.campo] = v;
                        return n;
                      })
                    }
                  />
                ))}
              </section>
            ))}
            {erro && <p className="text-sm text-destructive">{erro}</p>}
            <Button
              className="w-full h-12 text-base"
              onClick={enviar}
              disabled={estado === 'enviando'}
            >
              {estado === 'enviando' ? 'Enviando…' : 'Enviar respostas'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
