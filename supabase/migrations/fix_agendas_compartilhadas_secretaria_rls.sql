-- Permite que secretárias com permissão ativa (permissoes_agendamento)
-- gerenciem agendas compartilhadas dos profissionais autorizados.
-- Antes, apenas admins atendentes podiam criar/ver/editar/deletar suas
-- próprias agendas, o que bloqueava o fluxo de secretária com erro de RLS
-- (mascarado no front como "Erro desconhecido").

-- Helper SECURITY DEFINER: true se o usuário logado pode gerenciar a agenda
-- de p_profissional_id (é o próprio admin atendente OU secretária autorizada).
CREATE OR REPLACE FUNCTION public.fn_pode_gerenciar_agenda_compartilhada(
  p_profissional_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Admin atendente gerenciando a própria agenda
    EXISTS (
      SELECT 1
      FROM pessoas p
      WHERE p.auth_user_id = auth.uid()
        AND p.id = p_profissional_id
        AND p.role = 'admin'
        AND p.pode_atender = true
    )
    OR
    -- Secretária com permissão ativa para o profissional
    EXISTS (
      SELECT 1
      FROM permissoes_agendamento pa
      JOIN pessoas s ON s.id = pa.id_secretaria
      WHERE s.auth_user_id = auth.uid()
        AND pa.id_profissional = p_profissional_id
        AND pa.ativo = true
    );
$$;

-- Função é apenas auxiliar de RLS: não deve ser exposta como RPC pública.
REVOKE ALL ON FUNCTION public.fn_pode_gerenciar_agenda_compartilhada(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_pode_gerenciar_agenda_compartilhada(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_pode_gerenciar_agenda_compartilhada(uuid) TO authenticated;

-- Recriar as políticas usando o helper (cobre admin atendente + secretária)
DROP POLICY IF EXISTS "Admins atendentes criam suas agendas" ON public.agendas_compartilhadas;
DROP POLICY IF EXISTS "Admins atendentes veem suas agendas" ON public.agendas_compartilhadas;
DROP POLICY IF EXISTS "Admins atendentes editam suas agendas" ON public.agendas_compartilhadas;
DROP POLICY IF EXISTS "Admins atendentes deletam suas agendas" ON public.agendas_compartilhadas;

CREATE POLICY "Gerenciar agendas compartilhadas: criar"
  ON public.agendas_compartilhadas
  FOR INSERT TO public
  WITH CHECK (public.fn_pode_gerenciar_agenda_compartilhada(profissional_id));

CREATE POLICY "Gerenciar agendas compartilhadas: ver"
  ON public.agendas_compartilhadas
  FOR SELECT TO public
  USING (public.fn_pode_gerenciar_agenda_compartilhada(profissional_id));

CREATE POLICY "Gerenciar agendas compartilhadas: editar"
  ON public.agendas_compartilhadas
  FOR UPDATE TO public
  USING (public.fn_pode_gerenciar_agenda_compartilhada(profissional_id))
  WITH CHECK (public.fn_pode_gerenciar_agenda_compartilhada(profissional_id));

CREATE POLICY "Gerenciar agendas compartilhadas: deletar"
  ON public.agendas_compartilhadas
  FOR DELETE TO public
  USING (public.fn_pode_gerenciar_agenda_compartilhada(profissional_id));
