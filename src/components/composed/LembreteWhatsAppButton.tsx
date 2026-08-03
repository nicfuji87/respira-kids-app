import React, { useState } from 'react';
import { Loader2, MessageCircle } from 'lucide-react';

import { Button } from '@/components/primitives/button';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import {
  buildWhatsAppUrl,
  fetchDadosLembrete,
  registrarLembreteManual,
  type ResumoLembreteManual,
} from '@/lib/lembrete-agendamento-api';
import { buildMensagemLembrete } from '@/lib/lembrete-mensagem';
import type { CalendarEvent } from '@/types/calendar';

// AI dev note: Botão "Lembrete" no card da visão Agenda. Abre o WhatsApp Web já
// na conversa do responsável legal com o lembrete da consulta escrito — a
// secretária só aperta enter. Nasceu porque a API não oficial usada pelo n8n cai
// e leva junto o lembrete automático.
//
// Cuidados que este componente resolve:
// 1. O card inteiro é clicável (abre o modal do agendamento) — todo clique aqui
//    precisa de stopPropagation.
// 2. window.open TEM que acontecer dentro do gesto do clique; depois do await da
//    RPC o navegador já não considera gesto e o bloqueador de pop-up mata a aba.
//    Por isso abrimos em branco e só navegamos depois.

export interface LembreteWhatsAppButtonProps {
  event: CalendarEvent;
  resumo?: ResumoLembreteManual;
  onEnviado?: () => void;
  className?: string;
}

export const LembreteWhatsAppButton: React.FC<LembreteWhatsAppButtonProps> = ({
  event,
  resumo,
  onEnviado,
  className,
}) => {
  const { toast } = useToast();
  const [ocupado, setOcupado] = useState(false);

  const statusConsulta = (
    (event.metadata?.statusConsulta as string) || ''
  ).toLowerCase();
  const isCancelado = statusConsulta === 'cancelado';

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (ocupado) return;

    setOcupado(true);
    const janela = window.open('', '_blank');

    try {
      const resultado = await fetchDadosLembrete(event.id);

      if (!resultado.success || !resultado.data) {
        janela?.close();
        toast({
          title: 'Não foi possível montar o lembrete',
          description:
            resultado.error || 'Erro ao buscar os dados da consulta.',
          variant: 'destructive',
        });
        return;
      }

      const dados = resultado.data;

      const mensagem = buildMensagemLembrete(dados.destinatario_nome, {
        // AI dev note: a data vem do evento já parseado (parseSupabaseDatetime),
        // que é o mesmo valor que o card mostra. Reparsear o timestamptz da RPC
        // no browser arriscaria mostrar uma hora diferente da que está na tela.
        dataHora: event.start,
        pacienteNome: dados.paciente_nome,
        profissionalNome: dados.profissional_nome,
        servico: dados.servico,
        tipoLocal: dados.tipo_local,
        enderecoLogradouro: dados.endereco_logradouro,
        enderecoNumero: dados.endereco_numero,
        enderecoComplemento: dados.endereco_complemento,
        enderecoBairro: dados.endereco_bairro,
        enderecoCidade: dados.endereco_cidade,
      });

      const url = buildWhatsAppUrl(dados.destinatario_telefone, mensagem);

      if (!url) {
        janela?.close();
        toast({
          title: 'Sem telefone',
          description: `${dados.destinatario_nome || 'O responsável'} não tem telefone cadastrado. Atualize o cadastro do paciente.`,
          variant: 'destructive',
        });
        return;
      }

      if (janela) {
        janela.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }

      const registro = await registrarLembreteManual(
        event.id,
        dados.destinatario_telefone
      );

      if (!registro.success) {
        toast({
          title: 'WhatsApp aberto, mas não registrei',
          description: registro.error || 'Erro ao registrar o lembrete.',
          variant: 'destructive',
        });
      }

      onEnviado?.();
    } catch (err) {
      console.error('Erro ao preparar lembrete:', err);
      janela?.close();
      toast({
        title: 'Erro ao abrir o lembrete',
        description: 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setOcupado(false);
    }
  };

  if (isCancelado) return null;

  const jaEnviado = (resumo?.total ?? 0) > 0;

  return (
    <Button
      type="button"
      size="sm"
      variant={jaEnviado ? 'outline' : 'default'}
      onClick={handleClick}
      disabled={ocupado}
      // AI dev note: min-h-[44px] — em mobile a view agenda é a tela principal
      // do calendário, então o alvo de toque precisa ser confortável.
      className={cn('gap-1.5 min-h-[44px] md:min-h-0', className)}
      title={
        jaEnviado
          ? `Lembrete já enviado ${resumo?.total}x — enviar novamente`
          : 'Enviar lembrete pelo WhatsApp'
      }
      aria-label="Enviar lembrete da consulta pelo WhatsApp"
    >
      {ocupado ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <MessageCircle className="h-4 w-4" />
      )}
      <span className="hidden sm:inline">Lembrete</span>
      {jaEnviado && (
        <span className="text-xs font-normal opacity-70">{resumo?.total}x</span>
      )}
    </Button>
  );
};

LembreteWhatsAppButton.displayName = 'LembreteWhatsAppButton';
