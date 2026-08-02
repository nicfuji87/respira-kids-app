-- AI dev note: Validade de credenciais externas que expiram em silêncio.
-- O certificado mTLS do Banco Inter vale 12 meses; quando vence, a cobrança para
-- de funcionar sem erro visível para quem usa o sistema. Guardar a data aqui
-- permite avisar ANTES, na própria aplicação (CredencialVencimentoAlert).
--
-- Não guarda segredo nenhum — só metadado (nome, validade, onde renovar).

create table if not exists public.integracao_credenciais (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  descricao text not null,
  vence_em date not null,
  dias_aviso integer not null default 30,
  instrucao_renovacao text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

comment on table public.integracao_credenciais is
  'Validade de credenciais externas que expiram em silencio (ex: certificado mTLS do Inter).';

alter table public.integracao_credenciais enable row level security;

drop policy if exists integracao_credenciais_leitura on public.integracao_credenciais;
create policy integracao_credenciais_leitura on public.integracao_credenciais
  for select to authenticated
  using (is_admin() or is_secretaria());

drop policy if exists integracao_credenciais_admin on public.integracao_credenciais;
create policy integracao_credenciais_admin on public.integracao_credenciais
  for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists integracao_credenciais_service on public.integracao_credenciais;
create policy integracao_credenciais_service on public.integracao_credenciais
  for all to service_role using (true) with check (true);

insert into public.integracao_credenciais (chave, descricao, vence_em, dias_aviso, instrucao_renovacao)
values (
  'inter_certificado',
  'Certificado da integração Pix do Banco Inter (loja de produtos)',
  '2027-08-02',
  45,
  'Internet Banking PJ -> Conta Digital -> Aplicacoes -> integracao "Sistema" -> Acoes -> Renovar. Baixar o .crt e a .key e atualizar os secrets INTER_CERT e INTER_KEY no Supabase.'
)
on conflict (chave) do update
  set vence_em = excluded.vence_em,
      descricao = excluded.descricao,
      instrucao_renovacao = excluded.instrucao_renovacao,
      atualizado_em = now();

-- View pronta para a UI: só o que está dentro da janela de aviso (ou vencido).
create or replace view public.vw_credenciais_a_vencer as
select
  chave,
  descricao,
  vence_em,
  (vence_em - current_date) as dias_restantes,
  (vence_em < current_date) as vencida,
  instrucao_renovacao
from public.integracao_credenciais
where ativo
  and (vence_em - current_date) <= dias_aviso
order by vence_em;

grant select on public.vw_credenciais_a_vencer to authenticated;
