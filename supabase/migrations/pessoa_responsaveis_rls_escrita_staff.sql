-- AI dev note: pessoa_responsaveis tinha RLS ligado mas SÓ com política de SELECT
-- (`Allow public read for patient list`, ativo = true) e o bypass de service_role.
-- Resultado: nenhuma escrita vinda do app (role `authenticated`) passava — INSERT e
-- UPDATE morriam com 42501. Como parte das telas ignora o erro do supabase-js
-- (ex.: BillingResponsibleSelect), a UI dizia "Responsável adicionado / foi vinculado
-- ao paciente" sem gravar nada, e o responsável nunca aparecia no atestado de
-- comparecimento nem nas demais telas. Só o cadastro público funcionava, porque roda
-- na edge function com service_role.
--
-- O SELECT existente só enxerga ativo = true. Os fluxos de vínculo consultam o par
-- (id_pessoa, id_responsavel) SEM filtrar ativo para decidir entre reativar e inserir;
-- sem enxergar a linha inativa eles caem no INSERT e batem na UNIQUE
-- (id_pessoa, id_responsavel) → 409. Por isso admin/secretaria também ganham SELECT
-- irrestrito aqui.
--
-- Padrão seguido: mesmo desenho de `pessoas` e `agendamentos` (admin ALL via is_admin(),
-- secretaria com leitura + insert + update, sem DELETE — remoção é soft delete
-- via ativo = false).

-- Admin: acesso total
DROP POLICY IF EXISTS pessoa_responsaveis_admin_full_access ON public.pessoa_responsaveis;
CREATE POLICY pessoa_responsaveis_admin_full_access
  ON public.pessoa_responsaveis
  FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Secretaria: enxerga inclusive vínculos inativos (necessário para reativar em vez de duplicar)
DROP POLICY IF EXISTS pessoa_responsaveis_secretaria_view_all ON public.pessoa_responsaveis;
CREATE POLICY pessoa_responsaveis_secretaria_view_all
  ON public.pessoa_responsaveis
  FOR SELECT
  TO authenticated
  USING (is_secretaria());

-- Secretaria: criar vínculo
DROP POLICY IF EXISTS pessoa_responsaveis_secretaria_insert ON public.pessoa_responsaveis;
CREATE POLICY pessoa_responsaveis_secretaria_insert
  ON public.pessoa_responsaveis
  FOR INSERT
  TO authenticated
  WITH CHECK (is_secretaria());

-- Secretaria: alterar tipo / reativar / desativar (soft delete)
DROP POLICY IF EXISTS pessoa_responsaveis_secretaria_update ON public.pessoa_responsaveis;
CREATE POLICY pessoa_responsaveis_secretaria_update
  ON public.pessoa_responsaveis
  FOR UPDATE
  TO authenticated
  USING (is_secretaria())
  WITH CHECK (is_secretaria());
