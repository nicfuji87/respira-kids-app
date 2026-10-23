// Avaliação motora aberta pela consulta da agenda:
// - consulta de "Avaliação Fisioterapêutica Motora": abre a avaliação ligada
//   a ela (ou cria, com a data da consulta) e permite mandar a anamnese aos
//   pais;
// - sessão motora de criança que já tem avaliação: abre/cria a reavaliação.

import React, { useEffect, useState } from 'react';
import { ClipboardList, RefreshCw, Send } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { EvaluationFormModal } from '@/components/composed/evaluation/EvaluationFormModal';
import { EnviarAnamneseDialog } from '@/components/composed/evaluation/EnviarAnamneseDialog';
import {
  fetchAvaliacaoPorAgendamento,
  fetchUltimaAvaliacaoDoPaciente,
} from '@/lib/avaliacao-motora';
import { getTipoEvolucaoPorServico } from '@/types/evolucao-clinica';

const diaDeParede = (dataHora: string) => dataHora.slice(0, 10);

const ehServicoAvaliacaoMotora = (servico: string | null | undefined) =>
  !!servico &&
  servico.toLowerCase().includes('avalia') &&
  getTipoEvolucaoPorServico(servico) === 'motora_assimetria';

export const AvaliacaoMotoraAgenda: React.FC<{
  agendamentoId: string;
  dataHora: string;
  servicoNome: string | null | undefined;
  pacienteId: string;
  pacienteNome?: string;
  pacienteNascimento?: string | null;
  pacienteTelefone?: number | string | null;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
  currentUserId?: string;
}> = ({
  agendamentoId,
  dataHora,
  servicoNome,
  pacienteId,
  pacienteNome,
  pacienteNascimento,
  pacienteTelefone,
  userRole,
  currentUserId,
}) => {
  const ehAvaliacao = ehServicoAvaliacaoMotora(servicoNome);
  const ehMotora =
    !!servicoNome &&
    getTipoEvolucaoPorServico(servicoNome) === 'motora_assimetria';
  const podeAvaliar = userRole === 'admin' || userRole === 'profissional';

  const [ligada, setLigada] = useState<{ id: string; status: string } | null>(
    null
  );
  const [ultima, setUltima] = useState<string | null>(null);
  const [modal, setModal] = useState<{
    id: string | null;
    reavaliacaoDe: string | null;
  } | null>(null);
  const [anamnese, setAnamnese] = useState(false);

  useEffect(() => {
    if (!ehMotora || !podeAvaliar) return;
    let cancelado = false;
    fetchAvaliacaoPorAgendamento(agendamentoId)
      .then((a) => !cancelado && setLigada(a))
      .catch(() => undefined);
    if (!ehAvaliacao)
      fetchUltimaAvaliacaoDoPaciente(pacienteId)
        .then((a) => !cancelado && setUltima(a?.id ?? null))
        .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [agendamentoId, pacienteId, ehMotora, ehAvaliacao, podeAvaliar, modal]);

  if (!ehMotora) return null;
  const mostraReavaliacao =
    !ehAvaliacao && podeAvaliar && (!!ligada || !!ultima);
  if (!ehAvaliacao && !mostraReavaliacao) return null;

  return (
    <div className="flex flex-col gap-2">
      {ehAvaliacao && podeAvaliar && (
        <Button
          variant="outline"
          size="sm"
          className="w-full flex items-center gap-2"
          onClick={() =>
            setModal({ id: ligada?.id ?? null, reavaliacaoDe: null })
          }
        >
          <ClipboardList className="h-4 w-4" />
          {ligada ? 'Abrir avaliação motora' : 'Fazer avaliação motora'}
        </Button>
      )}
      {mostraReavaliacao && (
        <Button
          variant="outline"
          size="sm"
          className="w-full flex items-center gap-2"
          onClick={() =>
            setModal(
              ligada
                ? { id: ligada.id, reavaliacaoDe: null }
                : { id: null, reavaliacaoDe: ultima }
            )
          }
        >
          <RefreshCw className="h-4 w-4" />
          {ligada ? 'Abrir reavaliação motora' : 'Registrar reavaliação motora'}
        </Button>
      )}
      {ehAvaliacao && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full flex items-center gap-2"
          onClick={() => setAnamnese(true)}
        >
          <Send className="h-4 w-4" />
          Enviar anamnese aos pais
        </Button>
      )}

      {modal && (
        <EvaluationFormModal
          isOpen
          onClose={() => setModal(null)}
          onSave={() => setModal(null)}
          avaliacaoId={modal.id}
          patientId={pacienteId}
          patientName={pacienteNome}
          patientBirthDate={pacienteNascimento}
          currentUserId={currentUserId}
          mode={modal.id ? 'edit' : 'create'}
          agendamentoId={agendamentoId}
          dataAvaliacao={diaDeParede(dataHora)}
          reavaliacaoDe={modal.reavaliacaoDe}
        />
      )}
      <EnviarAnamneseDialog
        open={anamnese}
        onOpenChange={setAnamnese}
        pacienteId={pacienteId}
        pacienteNome={pacienteNome}
        agendamentoId={agendamentoId}
        telefone={pacienteTelefone}
      />
    </div>
  );
};
