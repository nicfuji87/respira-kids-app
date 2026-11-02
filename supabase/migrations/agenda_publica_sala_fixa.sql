-- Agenda pública: sala fixa por profissional (02/11/2026, dono:
-- "Beatriz é sempre sala 3, Bruna 2 e Flávia 1").
--
-- A agenda criada (automática ou pelo "Criar agenda" dos fixos) copiava a
-- sala da última agenda da profissional; as da Beatriz saíram na Sala 2
-- porque a agenda anterior dela tinha sido feita na Sala 2.
-- Agora a sala da configuração (agenda_publica_auto.local_id) vence.
-- fn_fixos_agenda_padrao é editada a partir da definição atual (insere a
-- regra antes do RETURN), para não perder mudanças de outros trabalhos.

ALTER TABLE public.agenda_publica_auto
  ADD COLUMN IF NOT EXISTS local_id uuid REFERENCES public.locais_atendimento(id);

COMMENT ON COLUMN public.agenda_publica_auto.local_id IS
  'Sala fixa da profissional na agenda pública (vence a sala da última agenda).';

UPDATE public.agenda_publica_auto c SET local_id = v.local_id
  FROM (VALUES
    ('c4883f76-d010-4fb4-ac5b-248914e56e6e'::uuid, '12e85683-25bd-4591-9419-bb7f62cc2092'::uuid),  -- Bruna: Sala 2
    ('b3e954bf-02dd-4821-aa58-aa4fb34c3e02'::uuid, 'bdc2ec7c-0fdf-43bf-aef2-ea700fbeca44'::uuid),  -- Beatriz: Sala 3
    ('2b1da16a-4294-47c0-b8c1-3f1595590332'::uuid, 'eb732246-5f36-48e1-a2d0-950076421141'::uuid)   -- Flávia: Sala 1
  ) AS v(profissional_id, local_id)
 WHERE c.profissional_id = v.profissional_id;

DO $m$
DECLARE
  d text := pg_get_functiondef('public.fn_fixos_agenda_padrao(uuid)'::regprocedure);
  a text := $a$  RETURN jsonb_build_object(
    'agenda_modelo_id', v_ultima,$a$;
  b text := $a$  -- Sala fixa da profissional (configuração das agendas automáticas)
  v_locais := coalesce(
    (SELECT ARRAY[c.local_id] FROM public.agenda_publica_auto c
      WHERE c.profissional_id = p_profissional_id AND c.local_id IS NOT NULL),
    v_locais);

  RETURN jsonb_build_object(
    'agenda_modelo_id', v_ultima,$a$;
BEGIN
  IF position('agenda_publica_auto' IN d) > 0 THEN
    RAISE NOTICE 'fn_fixos_agenda_padrao já usa a sala da configuração';
    RETURN;
  END IF;
  IF position(a IN d) = 0 THEN
    RAISE EXCEPTION 'fn_fixos_agenda_padrao mudou: trecho esperado não encontrado';
  END IF;
  EXECUTE replace(d, a, b);
END $m$;

REVOKE ALL ON FUNCTION public.fn_fixos_agenda_padrao(uuid) FROM PUBLIC, anon, authenticated;

-- Agendas abertas dessas profissionais passam para a sala certa
DELETE FROM public.agenda_locais al
 USING public.agendas_compartilhadas ac, public.agenda_publica_auto c
 WHERE al.agenda_id = ac.id
   AND c.profissional_id = ac.profissional_id
   AND c.local_id IS NOT NULL
   AND ac.ativo
   AND al.local_id <> c.local_id;

INSERT INTO public.agenda_locais (agenda_id, local_id)
SELECT ac.id, c.local_id
  FROM public.agendas_compartilhadas ac
  JOIN public.agenda_publica_auto c ON c.profissional_id = ac.profissional_id AND c.local_id IS NOT NULL
 WHERE ac.ativo
   AND NOT EXISTS (SELECT 1 FROM public.agenda_locais al WHERE al.agenda_id = ac.id AND al.local_id = c.local_id);
