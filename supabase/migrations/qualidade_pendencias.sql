-- Pendências de adequação: ações concretas levantadas a partir do levantamento
-- (documentos de licenciamento, Solução de Consulta tributária, achados de risco).
-- Diferente de qualidade_levantamento_respostas (que é Q&A): aqui cada linha é uma
-- AÇÃO com status, categoria e responsável — o que fica pra fazer, não o que já se sabe.

CREATE TABLE IF NOT EXISTS public.qualidade_pendencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),

  titulo text NOT NULL,
  descricao text,

  categoria text NOT NULL
    CHECK (categoria IN ('licenciamento', 'tributario', 'estrutural', 'pop', 'treinamento')),
  criticidade text NOT NULL DEFAULT 'media'
    CHECK (criticidade IN ('alta', 'media', 'baixa')),

  responsavel_sugerido text,
  prazo date,

  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'em_andamento', 'concluido')),
  concluido_em timestamptz,

  -- referência solta a de onde veio (ex.: 'A3', 'levantamento G5') — sem FK,
  -- pergunta_id do levantamento não é chave estável o bastante pra isso
  origem text,

  ordem smallint NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_qualidade_pendencias_status
  ON public.qualidade_pendencias(status, categoria, ordem);

CREATE OR REPLACE FUNCTION public.fn_touch_pendencia()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em := now();
  IF NEW.status = 'concluido' AND OLD.status <> 'concluido' THEN
    NEW.concluido_em := now();
  ELSIF NEW.status <> 'concluido' THEN
    NEW.concluido_em := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_pendencia ON public.qualidade_pendencias;
CREATE TRIGGER trg_touch_pendencia
  BEFORE UPDATE ON public.qualidade_pendencias
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_pendencia();

ALTER TABLE public.qualidade_pendencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qualidade_pendencias_admin ON public.qualidade_pendencias;
CREATE POLICY qualidade_pendencias_admin ON public.qualidade_pendencias
  FOR ALL TO authenticated
  USING (public.fn_is_admin())
  WITH CHECK (public.fn_is_admin());

DROP POLICY IF EXISTS qualidade_pendencias_service_role ON public.qualidade_pendencias;
CREATE POLICY qualidade_pendencias_service_role ON public.qualidade_pendencias
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- AI dev note: schema public concede tudo ao anon por default privilege —
-- toda tabela nova nasce com o furo *_anon_crud. Ver [[anon-crud-banco-aberto]].
REVOKE ALL ON public.qualidade_pendencias FROM anon;

-- ============================================================
-- Seed: pendências levantadas nesta rodada (licenciamento, tributário,
-- estrutural/sanitário, POPs a escrever, treinamento). Já aplicado em produção
-- em 29/07/2026 — este arquivo espelha o que foi executado via MCP.
-- ============================================================
INSERT INTO public.qualidade_pendencias
  (titulo, descricao, categoria, criticidade, responsavel_sugerido, prazo, origem, ordem)
VALUES

-- LICENCIAMENTO (prazo duro: 18/08/2026)
('Renovar licenciamento sanitário na Visa-DF',
 'Certificado RedeSim nº 53202974191 (CNAE 8650-0/04) vence em 18/08/2026. É o prazo que organiza todo o resto.',
 'licenciamento', 'alta', 'Bruna (RT)', '2026-08-18', 'A3', 1),

('Licenciar a segunda sala (unidade alugada)',
 'Consultório + recepção + banheiro + depósito não constam no CNES, RedeSim nem cadastro fiscal. Definir com quem cuida do licenciamento: inclusão no alvará existente ou licença própria.',
 'licenciamento', 'alta', 'Bruna (RT) + despachante/contador', '2026-08-18', 'A3, B1, B13', 2),

('Alinhar horário licenciado ao horário real, incluindo plantão de urgência',
 'Licenciado Seg-Sáb 8h-18h, sem domingo. Real: Seg-Sex até 19h, Sáb até 16h, Dom 8h-12h (emergências respiratórias). Verificar se precisa constar como regime de plantão ou basta ampliar o horário declarado.',
 'licenciamento', 'alta', 'Bruna (RT) + despachante', '2026-08-18', 'A3, A8', 3),

('Atualizar classificação no CNES',
 'Consta "Consultório Isolado / Individual" para uma operação de 3 consultórios, 3 fisioterapeutas, 2 estagiárias e 1 secretária em 2 unidades.',
 'licenciamento', 'media', 'Bruna (diretora clínica no CNES)', '2026-08-18', 'A3, A4', 4),

-- TRIBUTÁRIO
('Levar a Solução de Consulta 10.006/2026 ao contador',
 'O enquadramento em IRPJ 8%/CSLL 12% (em vez de 32%/32%) depende do alvará provar conformidade Anvisa. Alinhar a renovação do alvará com o time fiscal para não perder o benefício numa eventual fiscalização.',
 'tributario', 'alta', 'Contador', '2026-08-18', 'A3, A10', 5),

('Formalizar "elemento de empresa" no dossiê fiscal',
 'Organograma, descrição de função, e contratos dos PJs individuais atuando sob a BC Fisio Kids — documenta que a sociedade é empresária de fato, não só no papel.',
 'tributario', 'media', 'Contador', NULL, 'A10', 6),

-- ESTRUTURAL / SANITÁRIO
('Decidir o processamento do Proetz',
 'Toca mucosa nasal (material semicrítico). Micro-ondas não sustenta POP — falta controle de tempo/temperatura e indicador de eficácia. Escolher: autoclave de bancada, desinfecção de alto nível documentada, ou uso único.',
 'estrutural', 'alta', 'Bruna (RT)', NULL, 'G4, G5, Q1', 7),

('Resolver separação sujo/limpo no depósito',
 'Depósito acumula recepção de material sujo e guarda de material processado, sem fluxo unidirecional. Fica na 2ª sala — confirmar como o material sujo se desloca da 1ª sala até lá (área comum do prédio?).',
 'estrutural', 'alta', 'Bruna (RT)', NULL, 'B13, Q2', 8),

('Elaborar PGRSS próprio da clínica',
 'Plano de Gerenciamento de Resíduos de Serviços de Saúde. A coleta do prédio não substitui o plano da clínica — vocês geram resíduo infectante (aspiração, papel com secreção, luvas) mesmo sem perfurocortante.',
 'estrutural', 'media', 'Bruna (RT)', NULL, 'K1', 9),

('Elaborar/confirmar PMOC do ar-condicionado',
 'Plano de Manutenção, Operação e Controle. Serviço respiratório com climatização exige o plano documentado.',
 'estrutural', 'media', 'Administrativo', NULL, 'B14', 10),

('Fotografar e conferir rótulos dos produtos de limpeza',
 'Registro ANVISA e diluição de cada produto usado (álcool, detergente, o que a equipe de limpeza traz). Sem isso o POP de limpeza fica genérico.',
 'estrutural', 'media', 'Admin/Secretaria', NULL, 'F1, F2, FOTO-1', 11),

('Confirmar acabamentos executados nas duas salas',
 'Piso (porcelanato amadeirado, conforme projeto?), parede (marcenaria laqueada ou crua?), forro (perfurado — lavável?). Projeto cobre só a sala principal.',
 'estrutural', 'baixa', 'Admin', NULL, 'B3, B4, B5', 12),

-- POPs A ESCREVER (a maioria depende das decisões estruturais acima)
('POP: higienização das mãos', NULL, 'pop', 'media', 'Bruna (RT) + Claude', NULL, 'D', 20),
('POP: limpeza e desinfecção da maca/trocador', NULL, 'pop', 'media', 'Bruna (RT) + Claude', NULL, 'I', 21),
('POP: limpeza da sala entre pacientes',
 'Formalizar como medida de controle de infecção: duas recepções separadas + agenda espaçada para pacientes respiratórios não se cruzarem — é o ponto mais forte da clínica.',
 'pop', 'alta', 'Bruna (RT) + Claude', NULL, 'C, J9', 22),
('POP: limpeza terminal (fim do expediente)', NULL, 'pop', 'media', 'Bruna (RT) + Claude', NULL, 'J10', 23),
('POP: desinfecção de brinquedos', NULL, 'pop', 'media', 'Bruna (RT) + Claude', NULL, 'H', 24),
('POP: processamento de materiais respiratórios reutilizáveis',
 'Depende da decisão sobre o Proetz (pendência acima) — escrever só depois de decidido.',
 'pop', 'alta', 'Bruna (RT) + Claude', NULL, 'G', 25),
('POP: uso e descarte de EPIs', NULL, 'pop', 'media', 'Bruna (RT) + Claude', NULL, 'E', 26),
('POP: gerenciamento de resíduos', NULL, 'pop', 'media', 'Bruna (RT) + Claude', NULL, 'K', 27),
('POP: preparo e diluição de produtos de limpeza',
 'Depende da conferência dos rótulos (pendência acima).',
 'pop', 'media', 'Bruna (RT) + Claude', NULL, 'F', 28),
('POP: atendimento a paciente com suspeita de doença transmissível', NULL, 'pop', 'alta', 'Bruna (RT) + Claude', NULL, 'C7, C8, C10', 29),
('Cronograma de limpeza (diário/semanal/mensal)', NULL, 'pop', 'media', 'Bruna (RT) + Claude', NULL, 'J', 30),
('Implementar registro/checklist de limpeza executada no app',
 'Aba Registros do módulo Qualidade — schema já proposto em qualidade_manual_pops.sql, falta aplicar e construir a UI.',
 'pop', 'media', 'Claude', NULL, NULL, 31),

-- TREINAMENTO
('Formalizar o processo de treinamento de estagiária nova',
 'Hoje é informal, sem registro. Precisa existir um roteiro mínimo + registro de quem foi treinado em qual versão do Manual.',
 'treinamento', 'media', 'Bruna (RT)', NULL, 'M1, M2', 40),
('Confirmar exigência de carteira de vacinação da equipe',
 'Hepatite B, influenza, tríplice viral, dTpa — checar o que já é exigido hoje.',
 'treinamento', 'baixa', 'Admin', NULL, 'M3', 41)

ON CONFLICT DO NOTHING;
