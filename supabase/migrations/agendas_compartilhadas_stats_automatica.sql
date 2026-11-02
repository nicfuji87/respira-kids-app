-- vw_agendas_compartilhadas_stats: + coluna automatica (agenda criada pelo
-- sistema) e total de horários sem os removidos (02/11/2026). Coluna nova vai
-- no fim para o CREATE OR REPLACE aceitar.
CREATE OR REPLACE VIEW public.vw_agendas_compartilhadas_stats AS
 SELECT ac.id,
    ac.profissional_id,
    ac.token,
    ac.titulo,
    ac.data_inicio,
    ac.data_fim,
    ac.ativo,
    ac.criado_por,
    ac.created_at,
    ac.updated_at,
    p.nome AS profissional_nome,
    p.email AS profissional_email,
    p.especialidade AS profissional_especialidade,
    p.foto_perfil AS profissional_foto,
    count(DISTINCT aslt.id) AS total_slots,
    count(DISTINCT aslt.id) FILTER (WHERE (aslt.disponivel = true)) AS slots_disponiveis,
    count(DISTINCT asel.id) AS slots_ocupados,
    count(DISTINCT asv.id) AS total_servicos,
    count(DISTINCT alc.id) AS total_locais,
    count(DISTINCT aemp.id) AS total_empresas,
    ac.automatica
   FROM agendas_compartilhadas ac
     JOIN pessoas p ON p.id = ac.profissional_id
     LEFT JOIN agenda_slots aslt ON aslt.agenda_id = ac.id AND aslt.deleted_at IS NULL
     LEFT JOIN agenda_selecoes asel ON asel.agenda_id = ac.id AND asel.liberada_em IS NULL
     LEFT JOIN agenda_servicos asv ON asv.agenda_id = ac.id
     LEFT JOIN agenda_locais alc ON alc.agenda_id = ac.id
     LEFT JOIN agenda_empresas aemp ON aemp.agenda_id = ac.id
  GROUP BY ac.id, ac.profissional_id, ac.token, ac.titulo, ac.data_inicio, ac.data_fim, ac.ativo, ac.criado_por, ac.created_at, ac.updated_at, p.nome, p.email, p.especialidade, p.foto_perfil, ac.automatica;
