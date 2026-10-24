// Gera o link da anamnese para os pais responderem antes da avaliação e
// abre o WhatsApp com a mensagem pronta. As respostas aparecem na avaliação
// para a fisio aplicar (só preenche o que estiver em branco).

import React, { useEffect, useState } from 'react';
import { Copy, MessageCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { buildWhatsAppUrl } from '@/lib/cobrancas-api';
import {
  criarConviteAnamnese,
  fetchTelefonePaciente,
  linkAnamnese,
  mensagemAnamnese,
} from '@/lib/avaliacao-motora';

export const EnviarAnamneseDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pacienteId: string;
  pacienteNome?: string;
  agendamentoId?: string | null;
  telefone?: string | number | null;
}> = ({
  open,
  onOpenChange,
  pacienteId,
  pacienteNome,
  agendamentoId,
  telefone,
}) => {
  const [link, setLink] = useState<string | null>(null);
  const [fone, setFone] = useState<string | number | null>(telefone ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!open) {
      setLink(null);
      setErro(null);
      setCopiado(false);
      return;
    }
    let cancelado = false;
    criarConviteAnamnese(pacienteId, agendamentoId)
      .then((token) => !cancelado && setLink(linkAnamnese(token)))
      .catch(
        (e) =>
          !cancelado &&
          setErro(
            e instanceof Error ? e.message : 'Não foi possível gerar o link.'
          )
      );
    if (!telefone)
      fetchTelefonePaciente(pacienteId).then((t) => !cancelado && setFone(t));
    return () => {
      cancelado = true;
    };
  }, [open, pacienteId, agendamentoId, telefone]);

  const primeiroNome = (pacienteNome ?? '').split(' ')[0] || 'o bebê';
  const mensagem = link ? mensagemAnamnese(primeiroNome, link) : '';
  const urlWhats = link ? buildWhatsAppUrl(fone, mensagem) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Anamnese pelos pais</DialogTitle>
          <DialogDescription>
            Os pais respondem pelo link (vale 14 dias). As respostas aparecem
            aqui na avaliação para você conferir e aplicar.
          </DialogDescription>
        </DialogHeader>
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        {!erro && !link && (
          <p className="text-sm text-muted-foreground">Gerando o link…</p>
        )}
        {link && (
          <div className="space-y-3">
            <p className="text-sm whitespace-pre-wrap rounded-md border bg-muted/30 p-3">
              {mensagem}
            </p>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(mensagem);
                    setCopiado(true);
                  } catch {
                    setCopiado(false);
                  }
                }}
              >
                <Copy className="h-4 w-4 mr-1.5" />
                {copiado ? 'Copiado' : 'Copiar mensagem'}
              </Button>
              {urlWhats ? (
                <Button asChild>
                  <a href={urlWhats} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4 mr-1.5" />
                    Abrir no WhatsApp
                  </a>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground self-center">
                  Sem telefone no cadastro: copie e envie a mensagem.
                </span>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
