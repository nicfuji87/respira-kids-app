-- Atas das reuniões com as estagiárias (aba Reuniões da seção Estagiários).
--
-- estagio_reuniao_atas: o texto da ata (markdown), ligado à reunião pelo
--   reuniao_ref (= id em src/lib/estagio-reunioes.ts, ex. '2026-10-23').
--   Reunião sem slides também pode ter ata (reuniao_ref nulo).
-- estagio_reuniao_itens: encaminhamentos (tipo 'acao') e pontos a confirmar
--   (tipo 'confirmar'), cada um marcável como feito.
--
-- Acesso: admin e secretaria (mesmo público da seção Estagiários).
-- Nada é apagado de fato: ativo = false.

CREATE TABLE IF NOT EXISTS public.estagio_reuniao_atas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reuniao_ref text UNIQUE,
  data date NOT NULL,
  titulo text NOT NULL,
  participantes text[] NOT NULL DEFAULT '{}',
  conteudo text NOT NULL DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid REFERENCES public.pessoas(id),
  atualizado_por uuid REFERENCES public.pessoas(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.estagio_reuniao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ata_id uuid NOT NULL REFERENCES public.estagio_reuniao_atas(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('acao', 'confirmar')),
  descricao text NOT NULL,
  responsavel text,
  prazo text,
  observacao text,
  feito boolean NOT NULL DEFAULT false,
  feito_em timestamptz,
  feito_por uuid REFERENCES public.pessoas(id),
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estagio_reuniao_itens_ata_idx
  ON public.estagio_reuniao_itens (ata_id, tipo, ordem);

ALTER TABLE public.estagio_reuniao_atas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estagio_reuniao_itens ENABLE ROW LEVEL SECURITY;

-- (select fn()) evita reavaliar a função por linha (ver rls-subquery-reentra-policy).
CREATE POLICY estagio_reuniao_atas_staff_select ON public.estagio_reuniao_atas
  FOR SELECT TO authenticated USING ((SELECT public.fn_rls_admin_secretaria_ativo()));
CREATE POLICY estagio_reuniao_atas_staff_insert ON public.estagio_reuniao_atas
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.fn_rls_admin_secretaria_ativo()));
CREATE POLICY estagio_reuniao_atas_staff_update ON public.estagio_reuniao_atas
  FOR UPDATE TO authenticated
  USING ((SELECT public.fn_rls_admin_secretaria_ativo()))
  WITH CHECK ((SELECT public.fn_rls_admin_secretaria_ativo()));

CREATE POLICY estagio_reuniao_itens_staff_select ON public.estagio_reuniao_itens
  FOR SELECT TO authenticated USING ((SELECT public.fn_rls_admin_secretaria_ativo()));
CREATE POLICY estagio_reuniao_itens_staff_insert ON public.estagio_reuniao_itens
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.fn_rls_admin_secretaria_ativo()));
CREATE POLICY estagio_reuniao_itens_staff_update ON public.estagio_reuniao_itens
  FOR UPDATE TO authenticated
  USING ((SELECT public.fn_rls_admin_secretaria_ativo()))
  WITH CHECK ((SELECT public.fn_rls_admin_secretaria_ativo()));

REVOKE ALL ON public.estagio_reuniao_atas FROM anon;
REVOKE ALL ON public.estagio_reuniao_itens FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.estagio_reuniao_atas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.estagio_reuniao_itens TO authenticated;

-- updated_at automático
CREATE OR REPLACE FUNCTION public.fn_estagio_reuniao_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER estagio_reuniao_atas_touch
  BEFORE UPDATE ON public.estagio_reuniao_atas
  FOR EACH ROW EXECUTE FUNCTION public.fn_estagio_reuniao_touch();
CREATE TRIGGER estagio_reuniao_itens_touch
  BEFORE UPDATE ON public.estagio_reuniao_itens
  FOR EACH ROW EXECUTE FUNCTION public.fn_estagio_reuniao_touch();

COMMENT ON TABLE public.estagio_reuniao_atas IS
  'Atas das reuniões com as estagiárias (texto em markdown). reuniao_ref = id da reunião em src/lib/estagio-reunioes.ts.';
COMMENT ON TABLE public.estagio_reuniao_itens IS
  'Encaminhamentos (acao) e pontos a confirmar (confirmar) de cada ata, marcáveis como feitos.';
