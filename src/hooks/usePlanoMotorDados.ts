// Carrega o histórico motor e os objetivos da criança e expõe as ações do
// plano terapêutico. Usado na evolução, na ficha do paciente e na avaliação.
// Secretaria recebe erro de permissão do banco: o valor fica com `erro` e as
// telas escondem o plano.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchHistoricoMotor,
  fetchObjetivosMotor,
  mudarStatusObjetivoMotor,
  salvarObjetivoMotor,
  type HistoricoMotor,
  type ObjetivoMotor,
  type ObjetivoParaSalvar,
  type StatusObjetivo,
} from '@/lib/motora-plano';
import type { PlanoMotorValor } from '@/components/composed/evolution/plano-motor-context';

export function usePlanoMotorDados(opts: {
  pacienteId?: string | null;
  ativo: boolean;
  agendamentoId?: string;
  dataSessao?: string;
}): PlanoMotorValor | null {
  const { pacienteId, ativo, agendamentoId, dataSessao = '' } = opts;
  const [historico, setHistorico] = useState<HistoricoMotor | null>(null);
  const [objetivos, setObjetivos] = useState<ObjetivoMotor[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | undefined>();

  const carregar = useCallback(async () => {
    if (!ativo || !pacienteId) return;
    setCarregando(true);
    try {
      const [h, o] = await Promise.all([
        fetchHistoricoMotor(pacienteId),
        fetchObjetivosMotor(pacienteId),
      ]);
      setHistorico(h);
      setObjetivos(o);
      setErro(undefined);
    } catch (e) {
      console.error('Erro ao carregar o plano motor:', e);
      setErro(e instanceof Error ? e.message : 'erro ao carregar');
    } finally {
      setCarregando(false);
    }
  }, [ativo, pacienteId]);

  useEffect(() => {
    if (ativo && pacienteId) void carregar();
    else {
      setHistorico(null);
      setObjetivos(null);
    }
  }, [ativo, pacienteId, carregar]);

  const salvarObjetivo = useCallback(
    async (o: ObjetivoParaSalvar) => {
      await salvarObjetivoMotor(o);
      if (pacienteId) setObjetivos(await fetchObjetivosMotor(pacienteId));
    },
    [pacienteId]
  );

  const mudarStatus = useCallback(
    async (id: string, status: StatusObjetivo, motivo?: string) => {
      await mudarStatusObjetivoMotor(id, status, motivo);
      if (pacienteId) setObjetivos(await fetchObjetivosMotor(pacienteId));
    },
    [pacienteId]
  );

  return useMemo(
    () =>
      ativo && pacienteId
        ? {
            pacienteId,
            agendamentoId,
            dataSessao,
            historico,
            objetivos,
            carregando,
            erro,
            salvarObjetivo,
            mudarStatus,
          }
        : null,
    [
      ativo,
      pacienteId,
      agendamentoId,
      dataSessao,
      historico,
      objetivos,
      carregando,
      erro,
      salvarObjetivo,
      mudarStatus,
    ]
  );
}
