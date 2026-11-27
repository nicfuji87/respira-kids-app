import React, { useEffect, useState } from 'react';
import { Check, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Textarea } from '@/components/primitives/textarea';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

// AI dev note: anotações que a Ju (IA do WhatsApp) lê antes de responder a família.
// Campo próprio (pessoas.anotacoes_ju), separado de "Observações", que continua como está.
// Uma anotação por linha. Também é preenchido pelo "@ju anota ..." e pelo botão
// "Acrescentar" das sugestões que a Ju manda no grupo de notificações.

interface AnotacoesJuProps {
  pessoaId: string;
  className?: string;
}

export const AnotacoesJu = React.memo<AnotacoesJuProps>(
  ({ pessoaId, className }) => {
    const [salvo, setSalvo] = useState('');
    const [texto, setTexto] = useState('');
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [ok, setOk] = useState(false);

    useEffect(() => {
      let ativo = true;
      setCarregando(true);
      supabase
        .from('pessoas')
        .select('anotacoes_ju')
        .eq('id', pessoaId)
        .single()
        .then(({ data, error }) => {
          if (!ativo) return;
          if (error) setErro('Não foi possível carregar as anotações.');
          const v = (data?.anotacoes_ju as string | null) ?? '';
          setSalvo(v);
          setTexto(v);
          setCarregando(false);
        });
      return () => {
        ativo = false;
      };
    }, [pessoaId]);

    const salvar = async () => {
      setSalvando(true);
      setErro(null);
      const limpo = texto.trim();
      const { error } = await supabase
        .from('pessoas')
        .update({ anotacoes_ju: limpo || null })
        .eq('id', pessoaId);
      setSalvando(false);
      if (error) {
        setErro('Não foi possível salvar. Tente de novo.');
        return;
      }
      setSalvo(limpo);
      setTexto(limpo);
      setOk(true);
      setTimeout(() => setOk(false), 2500);
    };

    const mudou = texto.trim() !== salvo.trim();

    return (
      <div className={cn('space-y-3', className)}>
        <p className="text-sm text-muted-foreground">
          A Ju lê estas anotações antes de responder a família no WhatsApp. Use
          para preferências e combinados, uma por linha. Exemplo: "Prefere
          segunda às 11h" ou "Gosta de ser chamada de Mari".
        </p>
        {carregando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : (
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={5}
            placeholder="Nenhuma anotação ainda."
            aria-label="Anotações para a Ju"
          />
        )}
        <p className="text-xs text-muted-foreground">
          Não coloque aqui informação clínica sigilosa: o texto entra no
          contexto da conversa com a família.
        </p>
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        <div className="flex items-center justify-end gap-2">
          {ok && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <Check className="h-4 w-4" /> Salvo
            </span>
          )}
          <Button
            size="sm"
            onClick={salvar}
            disabled={carregando || salvando || !mudou}
          >
            {salvando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar
          </Button>
        </div>
      </div>
    );
  }
);

AnotacoesJu.displayName = 'AnotacoesJu';
