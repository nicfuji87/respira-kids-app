// AI dev note: Saldo e extrato da conta do Inter para a aba Financeiro.
// Somente leitura — nenhum caminho daqui move dinheiro.
//
// Admin e secretaria podem ver: o extrato é a base da conciliação (o que caiu de
// verdade x o que o sistema registrou), e quem concilia no dia a dia é a
// secretaria. Pagamento é outra função, com outra regra.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { obterSaldo, obterExtrato } from '../_shared/inter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// o extrato do Inter aceita no máximo 90 dias por consulta
const MAX_DIAS = 90;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const jwt = (req.headers.get('Authorization') ?? '')
      .replace('Bearer ', '')
      .trim();
    if (!jwt) return json({ error: 'Não autenticado' }, 401);

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return json({ error: 'Sessão inválida' }, 401);
    }

    const { data: pessoa } = await admin
      .from('pessoas')
      .select('role, ativo, bloqueado, is_approved')
      .eq('auth_user_id', userData.user.id)
      .single();

    const podeVer =
      pessoa &&
      ['admin', 'secretaria'].includes(pessoa.role as string) &&
      pessoa.ativo &&
      pessoa.is_approved &&
      !pessoa.bloqueado;
    if (!podeVer) return json({ error: 'Sem permissão' }, 403);

    const { data_inicio, data_fim, pagina } = (await req
      .json()
      .catch(() => ({}))) as {
      data_inicio?: string;
      data_fim?: string;
      pagina?: number;
    };

    const hoje = new Date();
    const fim = data_fim ?? hoje.toISOString().slice(0, 10);
    const inicio =
      data_inicio ??
      new Date(hoje.getTime() - 30 * 86400000).toISOString().slice(0, 10);

    const dias =
      (new Date(fim).getTime() - new Date(inicio).getTime()) / 86400000;
    if (Number.isNaN(dias) || dias < 0) {
      return json({ error: 'Período inválido' }, 400);
    }
    if (dias > MAX_DIAS) {
      return json(
        {
          error: `O extrato do Inter aceita no máximo ${MAX_DIAS} dias por consulta.`,
        },
        400
      );
    }

    // saldo e extrato em paralelo: são chamadas independentes
    const [saldo, extrato] = await Promise.all([
      obterSaldo(),
      obterExtrato(inicio, fim, pagina ?? 0),
    ]);

    return json({ saldo, extrato, periodo: { inicio, fim } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[inter-conta]', msg);
    return json({ error: msg }, 500);
  }
});
