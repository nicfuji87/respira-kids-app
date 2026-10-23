// AI dev note: Ponto pelo celular da estagiária (rota pública #/ponto).
// A estagiária NÃO é usuária do Supabase Auth: entra com login + senha cadastrados
// pelo admin e recebe um token de sessão (guardado no localStorage do celular; no
// banco só fica o hash). Tudo passa por RPCs SECURITY DEFINER que recebem o token
// (migration estagio_ponto_celular_recados.sql). A localização é obrigatória e a
// cerca é conferida no servidor. A selfie sobe pela edge function
// estagio-ponto-foto, no caminho que a RPC reservou para aquela batida.

import { supabase } from './supabase';
import type { ChecklistData } from './estagio-ponto-checklist';
import type { Coords, PontoTipo } from './estagio-pontos-api';

const TOKEN_KEY = 'rk-ponto-celular-token';

export interface RecadoPendente {
  id: string;
  texto: string;
  autor: string;
  created_at: string;
}

export interface MeuRecado {
  texto: string;
  created_at: string;
  lido_por: { nome: string; lido_em: string }[];
}

export interface CercaPublica {
  lat: number;
  lng: number;
  raio_m: number;
  ativo: boolean;
}

export interface StatusCelular {
  nome: string;
  hoje: { tipo: PontoTipo; registrado_em: string }[];
  proxima: PontoTipo;
  recados: RecadoPendente[];
  meu_recado: MeuRecado | null;
  cerca: CercaPublica | null;
}

export type ErroCelular =
  | 'LOGIN_INVALIDO'
  | 'BLOQUEADO'
  | 'SESSAO_INVALIDA'
  | 'SEM_LOCALIZACAO'
  | 'CERCA_DESLIGADA'
  | 'FORA_DA_CLINICA'
  | 'ACABOU_DE_REGISTRAR'
  | 'FALHA';

export class CelularError extends Error {
  codigo: ErroCelular;
  extra: Record<string, unknown>;
  constructor(codigo: ErroCelular, extra: Record<string, unknown> = {}) {
    super(codigo);
    this.codigo = codigo;
    this.extra = extra;
  }
}

// ---------------------------------------------------------------------------
// Token no aparelho (try/catch: modo anônimo pode bloquear o storage)
// ---------------------------------------------------------------------------
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // sem storage: a sessão vale só enquanto a página estiver aberta
  }
}

function dispositivo(): string | null {
  return typeof navigator !== 'undefined'
    ? navigator.userAgent.slice(0, 200)
    : null;
}

type Resposta = { ok: boolean; erro?: ErroCelular } & Record<string, unknown>;

async function chamar(
  fn: string,
  args: Record<string, unknown>
): Promise<Resposta> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error || !data) throw new CelularError('FALHA');
  const r = data as Resposta;
  if (!r.ok) {
    if (r.erro === 'SESSAO_INVALIDA') setToken(null);
    throw new CelularError(r.erro ?? 'FALHA', r);
  }
  return r;
}

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------
export async function login(loginTxt: string, senha: string): Promise<string> {
  const r = await chamar('fn_estagio_celular_login', {
    p_login: loginTxt,
    p_senha: senha,
    p_dispositivo: dispositivo(),
  });
  setToken(r.token as string);
  return r.nome as string;
}

export async function logout(): Promise<void> {
  const token = getToken();
  setToken(null);
  if (token) {
    await supabase
      .rpc('fn_estagio_celular_logout', { p_token: token })
      .then(() => undefined);
  }
}

export async function fetchStatus(): Promise<StatusCelular> {
  const token = getToken();
  if (!token) throw new CelularError('SESSAO_INVALIDA');
  const r = await chamar('fn_estagio_celular_status', { p_token: token });
  return r as unknown as StatusCelular;
}

// ---------------------------------------------------------------------------
// Localização (obrigatória): diferencia "negou a permissão" de "sem sinal"
// ---------------------------------------------------------------------------
export type GeoFalha = 'negado' | 'indisponivel' | 'sem_suporte';

export function pedirLocalizacao(
  timeoutMs = 20000
): Promise<{ coords: Coords } | { falha: GeoFalha }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ falha: 'sem_suporte' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          coords: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            precisao: pos.coords.accuracy,
          },
        }),
      (err) =>
        resolve({
          falha: err.code === err.PERMISSION_DENIED ? 'negado' : 'indisponivel',
        }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

// ---------------------------------------------------------------------------
// Registro da batida
// ---------------------------------------------------------------------------
export async function registrar(params: {
  coords: Coords;
  foto: Blob | null;
  checklist?: ChecklistData | null;
  recado?: string;
  recadosLidos?: string[];
}): Promise<{ tipo: PontoTipo; registradoEm: string; fotoOk: boolean }> {
  const token = getToken();
  if (!token) throw new CelularError('SESSAO_INVALIDA');
  const r = await chamar('fn_estagio_celular_registrar', {
    p_token: token,
    p_lat: params.coords.lat,
    p_lng: params.coords.lng,
    p_precisao: params.coords.precisao,
    p_checklist: params.checklist ?? null,
    p_recado: params.recado?.trim() || null,
    p_recados_lidos: params.recadosLidos?.length ? params.recadosLidos : null,
    p_dispositivo: dispositivo(),
  });

  // A batida já valeu; a foto é o comprovante. Tenta subir duas vezes.
  let fotoOk = false;
  if (params.foto && typeof r.foto_path === 'string') {
    for (let i = 0; i < 2 && !fotoOk; i++) {
      const form = new FormData();
      form.append('token', token);
      form.append('path', r.foto_path);
      form.append('foto', params.foto, 'selfie.jpg');
      const { data, error } = await supabase.functions.invoke(
        'estagio-ponto-foto',
        { body: form }
      );
      fotoOk = !error && (data as { ok?: boolean } | null)?.ok === true;
    }
  }
  return {
    tipo: r.tipo as PontoTipo,
    registradoEm: r.registrado_em as string,
    fotoOk,
  };
}

// ---------------------------------------------------------------------------
// Equipe: cadastro do acesso + recados (sessão admin/secretaria)
// ---------------------------------------------------------------------------
export interface AcessoEstagiaria {
  candidatura_id: string;
  nome: string;
  login: string | null;
  ativo: boolean;
  ultimo_login: string | null;
  bloqueado_ate: string | null;
  celulares_conectados: number;
}

export async function fetchAcessos(): Promise<AcessoEstagiaria[]> {
  const { data, error } = await supabase.rpc('fn_estagio_acessos_listar');
  if (error) throw error;
  return (data ?? []) as AcessoEstagiaria[];
}

export async function salvarAcesso(
  candidaturaId: string,
  loginTxt: string,
  senha: string | null
): Promise<void> {
  const { error } = await supabase.rpc('fn_estagio_acesso_salvar', {
    p_candidatura_id: candidaturaId,
    p_login: loginTxt,
    p_senha: senha,
  });
  if (error) throw error;
}

export async function desativarAcesso(candidaturaId: string): Promise<void> {
  const { error } = await supabase.rpc('fn_estagio_acesso_desativar', {
    p_candidatura_id: candidaturaId,
  });
  if (error) throw error;
}

/** Quiosque: recados que a estagiária escolhida ainda não leu. */
export async function fetchRecadosPendentes(
  candidaturaId: string
): Promise<RecadoPendente[]> {
  const { data, error } = await supabase.rpc('fn_estagio_recados_pendentes', {
    p_candidatura_id: candidaturaId,
  });
  if (error) return [];
  return (data ?? []) as RecadoPendente[];
}

/** Quiosque: grava o recado deixado na saída. */
export async function criarRecado(
  candidaturaId: string,
  pontoId: string | null,
  texto: string
): Promise<void> {
  const { error } = await supabase.from('estagio_recados').insert({
    candidatura_id: candidaturaId,
    ponto_id: pontoId,
    texto: texto.trim().slice(0, 1000),
  });
  if (error) throw error;
}

/** Quiosque: marca como lidos os recados mostrados na entrada. */
export async function marcarRecadosLidos(
  candidaturaId: string,
  recadoIds: string[]
): Promise<void> {
  if (!recadoIds.length) return;
  await supabase.from('estagio_recado_leituras').upsert(
    recadoIds.map((id) => ({ recado_id: id, candidatura_id: candidaturaId })),
    { onConflict: 'recado_id,candidatura_id', ignoreDuplicates: true }
  );
}

export interface RecadoRecente {
  id: string;
  texto: string;
  autor: string;
  created_at: string;
  lido_por: { nome: string; lido_em: string }[];
}

export async function fetchRecadosRecentes(dias = 7): Promise<RecadoRecente[]> {
  const { data, error } = await supabase.rpc('fn_estagio_recados_recentes', {
    p_dias: dias,
  });
  if (error) throw error;
  return (data ?? []) as RecadoRecente[];
}

/** Endereço que a estagiária abre no celular. */
export function linkPontoCelular(): string {
  const base =
    (import.meta.env.VITE_APP_URL as string | undefined) ||
    window.location.origin;
  return `${base.replace(/\/$/, '')}/#/ponto`;
}
