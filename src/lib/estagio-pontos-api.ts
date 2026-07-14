// AI dev note: API do controle de ponto dos estagiários (foto-comprovante) + VT.
// Cada linha em estagio_pontos é uma batida (entrada/saida). O quiosque (tablet)
// tira a selfie -> uploadPontoFoto -> registrarPonto. O fechamento mensal agrega
// as batidas em dias de presença e horas, e cruza com o valor/dia do contrato
// (estagio_contratos.variaveis_utilizadas.auxilioTransporte) para o VT a pagar.
// Estagiário é identificado por candidatura_id (não existe em `pessoas`).

import { supabase } from './supabase';
import type { ChecklistData } from './estagio-ponto-checklist';

const TABLE = 'estagio_pontos';
const BUCKET = 'estagio-pontos';

export type PontoTipo = 'entrada' | 'saida';

export interface EstagiarioAtivo {
  id: string; // candidatura_id
  nome: string;
}

export interface PontoRow {
  id: string;
  candidatura_id: string;
  tipo: PontoTipo;
  registrado_em: string;
  foto_path: string | null;
  dispositivo: string | null;
  origem: 'kiosk' | 'manual';
  observacao: string | null;
  registrado_por: string | null;
  lat: number | null;
  lng: number | null;
  precisao_m: number | null;
  checklist: ChecklistData | null;
  ativo: boolean;
}

export interface Coords {
  lat: number;
  lng: number;
  precisao: number;
}

export interface EstagioTermos {
  vtDia: number;
  cargaDiaria: number;
  cargaSemanal: number;
}

/** Converte "11", "11,00", "1.100,50" ou "R$ 11,00" em número. */
export function parseMoneyBR(raw?: string | null): number {
  if (raw == null) return 0;
  const clean = String(raw)
    .replace(/[^\d,.-]/g, '')
    .trim();
  if (!clean) return 0;
  // Remove separador de milhar (ponto seguido de 3 dígitos) e troca vírgula por ponto.
  const normalized = clean.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Data local (America/Sao_Paulo ≈ horário do tablet) no formato YYYY-MM-DD. */
export function localDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Estagiários que podem bater ponto: candidaturas aprovadas e ativas. */
export async function fetchEstagiariosAtivos(): Promise<EstagiarioAtivo[]> {
  const { data, error } = await supabase
    .from('candidaturas_estagio')
    .select('id, nome')
    .eq('status', 'aprovado')
    .eq('ativo', true)
    .order('nome');
  if (error) throw error;
  return (data ?? []) as EstagiarioAtivo[];
}

/** Sobe a selfie do comprovante e devolve o path no bucket. */
export async function uploadPontoFoto(
  candidaturaId: string,
  blob: Blob
): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `${candidaturaId}/${stamp}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** URL assinada temporária para visualizar um comprovante (bucket privado). */
export async function getPontoFotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 10);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Batidas de HOJE de um estagiário (para decidir se a próxima é entrada/saída). */
export async function fetchPontosHoje(
  candidaturaId: string
): Promise<PontoRow[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('candidatura_id', candidaturaId)
    .eq('ativo', true)
    .gte('registrado_em', start.toISOString())
    .order('registrado_em', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PontoRow[];
}

/** Próxima batida esperada: entrada se a última foi saída (ou não há nenhuma). */
export function proximaBatida(pontosHoje: PontoRow[]): PontoTipo {
  const ultimo = pontosHoje[pontosHoje.length - 1];
  return ultimo?.tipo === 'entrada' ? 'saida' : 'entrada';
}

/**
 * Pede a localização do dispositivo (navigator.geolocation). Resolve com null se
 * o navegador negar, não tiver GPS ou estourar o timeout — a batida ainda é
 * registrada, só que sem local. Exige secure context (HTTPS/localhost).
 */
export function getGeolocation(timeoutMs = 8000): Promise<Coords | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precisao: pos.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

/** Registra uma batida (chamado pelo quiosque). */
export async function registrarPonto(params: {
  candidaturaId: string;
  tipo: PontoTipo;
  fotoPath: string | null;
  registradoPor: string | null;
  coords?: Coords | null;
  checklist?: ChecklistData | null;
}): Promise<void> {
  const { error } = await supabase.from(TABLE).insert({
    candidatura_id: params.candidaturaId,
    tipo: params.tipo,
    foto_path: params.fotoPath,
    dispositivo:
      typeof navigator !== 'undefined'
        ? navigator.userAgent.slice(0, 200)
        : null,
    origem: 'kiosk',
    registrado_por: params.registradoPor,
    lat: params.coords?.lat ?? null,
    lng: params.coords?.lng ?? null,
    precisao_m: params.coords?.precisao ?? null,
    checklist: params.checklist ?? null,
  });
  if (error) throw error;
}

/** Mapa id→nome dos acessos (admin/secretaria) que podem registrar ponto. */
export async function fetchStaffNomes(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('pessoas')
    .select('id, nome')
    .in('role', ['admin', 'secretaria'])
    .eq('ativo', true);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const p of (data ?? []) as { id: string; nome: string }[]) {
    map[p.id] = p.nome;
  }
  return map;
}

/** Todas as batidas ativas de um mês (mes: 1-12), para o fechamento. */
export async function fetchPontosMes(
  ano: number,
  mes: number
): Promise<PontoRow[]> {
  const start = new Date(ano, mes - 1, 1, 0, 0, 0, 0);
  const end = new Date(ano, mes, 1, 0, 0, 0, 0);
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('ativo', true)
    .gte('registrado_em', start.toISOString())
    .lt('registrado_em', end.toISOString())
    .order('registrado_em', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PontoRow[];
}

/** Variáveis do contrato mais recente (clínica, IES, supervisor, carga etc.). */
export async function fetchContratoVars(
  candidaturaId: string
): Promise<Record<string, string> | null> {
  const { data, error } = await supabase
    .from('estagio_contratos')
    .select('variaveis_utilizadas')
    .eq('candidatura_id', candidaturaId)
    .eq('ativo', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return (data.variaveis_utilizadas ?? {}) as Record<string, string>;
}

/** Termos do contrato (valor VT/dia e carga horária) do estagiário. */
export async function fetchTermosContrato(
  candidaturaId: string
): Promise<EstagioTermos | null> {
  const v = await fetchContratoVars(candidaturaId);
  if (!v) return null;
  return {
    vtDia: parseMoneyBR(v.auxilioTransporte),
    cargaDiaria: parseFloat(v.cargaHorariaDiaria) || 0,
    cargaSemanal: parseFloat(v.cargaHorariaSemanal) || 0,
  };
}

// =====================================================
// Agregação do fechamento (client-side; volumes pequenos)
// =====================================================

export interface DiaPresenca {
  data: string; // YYYY-MM-DD (local)
  primeira: string; // ISO da primeira batida
  ultima: string; // ISO da última batida
  horas: number; // do primeiro ao último registro do dia
  batidas: number;
}

export interface FechamentoLinha {
  candidaturaId: string;
  nome: string;
  diasPresenca: number;
  totalHoras: number;
  vtDia: number;
  vtTotal: number;
  dias: DiaPresenca[];
  /** Batidas cruas do mês (para a auditoria: quem registrou + localização). */
  pontos: PontoRow[];
}

/** Agrupa as batidas de um estagiário em dias de presença. */
export function agruparDias(pontos: PontoRow[]): DiaPresenca[] {
  const porDia = new Map<string, PontoRow[]>();
  for (const p of pontos) {
    const key = localDateKey(p.registrado_em);
    const arr = porDia.get(key) ?? [];
    arr.push(p);
    porDia.set(key, arr);
  }
  const dias: DiaPresenca[] = [];
  for (const [data, arr] of porDia) {
    arr.sort((a, b) => a.registrado_em.localeCompare(b.registrado_em));
    const primeira = arr[0].registrado_em;
    const ultima = arr[arr.length - 1].registrado_em;
    const horas =
      (new Date(ultima).getTime() - new Date(primeira).getTime()) / 3_600_000;
    dias.push({
      data,
      primeira,
      ultima,
      horas: Math.max(0, Math.round(horas * 100) / 100),
      batidas: arr.length,
    });
  }
  dias.sort((a, b) => a.data.localeCompare(b.data));
  return dias;
}
