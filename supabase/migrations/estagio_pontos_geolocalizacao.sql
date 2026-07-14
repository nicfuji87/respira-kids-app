-- AI dev note: Geolocalização da batida de ponto. Comprova que o estagiário bateu
-- na clínica (não de casa usando o acesso de alguém). Capturado via
-- navigator.geolocation no quiosque (exige HTTPS). Nullable: se o navegador negar
-- ou não tiver GPS, a batida ainda é registrada, só marcada "sem localização".
-- A auditoria no fechamento mostra, por batida, qual acesso (registrado_por) e o
-- link do mapa (lat/lng).

alter table public.estagio_pontos
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists precisao_m double precision;
