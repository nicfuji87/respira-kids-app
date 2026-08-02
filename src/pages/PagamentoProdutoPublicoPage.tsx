// AI dev note: Página pública de pagamento da venda de produto (#/pagamento-produto/:token).
// Sem login: a RPC fn_public_venda_produto_por_token devolve só o necessário
// (itens, valor, Pix), nunca dados do paciente além do primeiro nome.
//
// Diferente de PagamentoPublicoPage (Asaas, escolhe forma de pagamento), aqui não há
// escolha: a cobrança Pix já existe e só precisa ser paga. A página confere se foi
// paga a cada 15s para o cliente ver a confirmação sem recarregar.

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ShoppingBag,
  MessageCircle,
} from 'lucide-react';

import { Skeleton } from '@/components/primitives/skeleton';
import { Button } from '@/components/primitives/button';
import { PixCobrancaCard } from '@/components/domain/produtos/PixCobrancaCard';
import { fetchVendaProdutoPublica } from '@/lib/produtos-api';
import type { VendaProdutoPublica } from '@/types/produtos';

// AI dev note: mesmo WhatsApp usado em PagamentoPublicoPage e SharedSchedulePage.
const CLINIC_WHATSAPP_URL = 'https://wa.me/556181446666';

const INTERVALO_CONFERENCIA_MS = 15_000;

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(v);

export const PagamentoProdutoPublicoPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [venda, setVenda] = useState<VendaProdutoPublica | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!token) {
        setErro('Link inválido.');
        setCarregando(false);
        return;
      }
      if (!silencioso) setCarregando(true);
      try {
        const dados = await fetchVendaProdutoPublica(token);
        if (!dados) {
          setErro('Não encontramos essa cobrança. Confira o link recebido.');
        } else {
          setVenda(dados);
          setErro(null);
        }
      } catch (e) {
        console.error('[PagamentoProdutoPublicoPage]', e);
        if (!silencioso) {
          setErro('Não conseguimos carregar a cobrança. Tente novamente.');
        }
      } finally {
        if (!silencioso) setCarregando(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // confere o pagamento em segundo plano até confirmar
  useEffect(() => {
    if (!venda || venda.status === 'pago' || venda.status === 'cancelado') {
      return;
    }
    const timer = window.setInterval(
      () => void carregar(true),
      INTERVALO_CONFERENCIA_MS
    );
    return () => window.clearInterval(timer);
  }, [venda, carregar]);

  return (
    <div className="min-h-screen bg-bege-fundo/50 px-4 py-8">
      <div className="mx-auto w-full max-w-md space-y-5">
        <header className="text-center">
          <h1 className="text-2xl font-bold text-roxo-titulo">Respira Kids</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pagamento da sua compra
          </p>
        </header>

        {carregando ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
        ) : erro ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
            <p className="text-sm text-foreground">{erro}</p>
          </div>
        ) : venda ? (
          <ConteudoVenda venda={venda} />
        ) : null}

        <div className="pt-2 text-center">
          <Button variant="ghost" size="sm" asChild className="gap-2">
            <a
              href={CLINIC_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="h-4 w-4" />
              Falar com a clínica
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
};

const ConteudoVenda: React.FC<{ venda: VendaProdutoPublica }> = ({ venda }) => {
  const saudacao = venda.paciente_primeiro_nome
    ? `Compra de ${venda.paciente_primeiro_nome}`
    : 'Sua compra';

  if (venda.status === 'cancelado') {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="font-medium text-foreground">Cobrança cancelada</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Essa compra foi cancelada. Se foi engano, é só falar com a gente.
        </p>
      </div>
    );
  }

  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-roxo-titulo">
          <ShoppingBag className="h-4 w-4" />
          <h2 className="text-sm font-semibold">{saudacao}</h2>
        </div>

        <ul className="mt-3 space-y-2">
          {venda.itens.map((item, i) => (
            <li
              key={`${item.nome}-${i}`}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="text-foreground">
                <span className="text-muted-foreground">
                  {item.quantidade}×
                </span>{' '}
                {item.nome}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatBRL(item.preco_unitario * item.quantidade)}
              </span>
            </li>
          ))}
        </ul>

        {venda.desconto > 0 && (
          <div className="mt-2 flex items-baseline justify-between border-t border-border/60 pt-2 text-sm">
            <span className="text-muted-foreground">Desconto</span>
            <span className="tabular-nums text-verde-pipa">
              −{formatBRL(venda.desconto)}
            </span>
          </div>
        )}

        <div className="mt-3 flex items-baseline justify-between border-t border-border/60 pt-3">
          <span className="text-sm font-medium text-foreground">Total</span>
          <span className="text-lg font-bold tabular-nums text-foreground">
            {formatBRL(venda.valor_total)}
          </span>
        </div>
      </section>

      {venda.status === 'pago' ? (
        <section className="rounded-2xl border border-verde-pipa/40 bg-verde-pipa/10 p-6 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-verde-pipa" />
          <p className="text-lg font-semibold text-roxo-titulo">
            Pagamento confirmado
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Recebemos o seu Pix. Pode retirar na clínica quando quiser.
          </p>
        </section>
      ) : venda.pix_copia_cola ? (
        <>
          <PixCobrancaCard
            copiaCola={venda.pix_copia_cola}
            valor={formatBRL(venda.valor_total)}
            expiraEm={venda.pix_expira_em}
            tamanhoQr={220}
          />
          <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Esta página confirma sozinha assim que o pagamento cair.
          </p>
        </>
      ) : (
        <section className="rounded-2xl border border-amarelo-pipa/40 bg-amarelo-pipa/10 p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amarelo-pipa" />
          <p className="text-sm text-foreground">
            A cobrança ainda não foi gerada. Fale com a clínica.
          </p>
        </section>
      )}
    </>
  );
};

export default PagamentoProdutoPublicoPage;
