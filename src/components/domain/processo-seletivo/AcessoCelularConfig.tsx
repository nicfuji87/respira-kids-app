// AI dev note: Cadastro do acesso das estagiárias ao ponto pelo celular (#/ponto)
// — SÓ admin. Login + senha ficam em estagio_acessos (hash bcrypt, via RPC
// fn_estagio_acesso_salvar). A senha só aparece aqui no momento em que é criada,
// junto de uma mensagem pronta para mandar no WhatsApp. Trocar a senha desloga o
// celular antigo; desativar corta o acesso na hora. O acesso não abre nada do app
// além do ponto e dos recados.

import React, { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  Smartphone,
  ChevronDown,
  ChevronUp,
  Copy,
  KeyRound,
  Dices,
} from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { Textarea } from '@/components/primitives/textarea';
import { useToast } from '@/components/primitives/use-toast';
import {
  desativarAcesso,
  fetchAcessos,
  linkPontoCelular,
  salvarAcesso,
  type AcessoEstagiaria,
} from '@/lib/estagio-celular-api';

function sugerirLogin(nome: string): string {
  return (nome.trim().split(/\s+/)[0] ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

function gerarSenha(): string {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(n[0] % 1_000_000).padStart(6, '0');
}

function dataHora(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function mensagemWhatsApp(nome: string, login: string, senha: string): string {
  const primeiro = nome.split(' ')[0];
  return [
    `Oi, ${primeiro}! A partir de agora você bate o ponto pelo seu celular:`,
    linkPontoCelular(),
    '',
    `Login: ${login}`,
    `Senha: ${senha}`,
    '',
    'Para registrar, a localização do celular precisa estar ligada e você precisa estar na clínica. Na saída dá para deixar um recado para a estagiária do próximo turno.',
  ].join('\n');
}

export const AcessoCelularConfig: React.FC = () => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [acessos, setAcessos] = useState<AcessoEstagiaria[]>([]);
  const [loading, setLoading] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [saving, setSaving] = useState(false);
  const [mensagem, setMensagem] = useState<{
    id: string;
    texto: string;
  } | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setAcessos(await fetchAcessos());
    } catch {
      toast({
        title: 'Não consegui carregar os acessos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const abrirEdicao = (a: AcessoEstagiaria) => {
    setEditando(a.candidatura_id);
    setLogin(a.login ?? sugerirLogin(a.nome));
    setSenha(gerarSenha());
    setMensagem(null);
  };

  const copiar = useCallback(
    async (texto: string, titulo: string) => {
      try {
        await navigator.clipboard.writeText(texto);
        toast({ title: titulo });
      } catch {
        toast({ title: 'Não consegui copiar', variant: 'destructive' });
      }
    },
    [toast]
  );

  const salvar = useCallback(
    async (a: AcessoEstagiaria) => {
      if (senha.length < 6) {
        toast({
          title: 'A senha precisa ter 6 caracteres ou mais',
          variant: 'destructive',
        });
        return;
      }
      setSaving(true);
      try {
        await salvarAcesso(a.candidatura_id, login, senha);
        setMensagem({
          id: a.candidatura_id,
          texto: mensagemWhatsApp(a.nome, login.trim().toLowerCase(), senha),
        });
        setEditando(null);
        await carregar();
        toast({ title: `Acesso de ${a.nome.split(' ')[0]} salvo` });
      } catch (e) {
        toast({
          title: 'Não consegui salvar',
          description: e instanceof Error ? e.message : undefined,
          variant: 'destructive',
        });
      } finally {
        setSaving(false);
      }
    },
    [login, senha, carregar, toast]
  );

  const desativar = useCallback(
    async (a: AcessoEstagiaria) => {
      setSaving(true);
      try {
        await desativarAcesso(a.candidatura_id);
        await carregar();
        toast({ title: `Acesso de ${a.nome.split(' ')[0]} desativado` });
      } catch {
        toast({ title: 'Não consegui desativar', variant: 'destructive' });
      } finally {
        setSaving(false);
      }
    },
    [carregar, toast]
  );

  const ativos = acessos.filter((a) => a.ativo).length;

  return (
    <div className="rounded-xl border border-border/60 bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 p-3 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Smartphone className="w-4 h-4 text-azul-respira shrink-0" />
          <span className="text-sm font-medium text-foreground">
            Ponto pelo celular (acesso das estagiárias)
          </span>
          <Badge variant={ativos ? 'default' : 'secondary'}>
            {ativos ? `${ativos} com acesso` : 'Nenhum acesso'}
          </Badge>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-border/60 p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Cada estagiária entra com login e senha próprios e só consegue bater
            o ponto e ver os recados. Precisa estar com a localização ligada e
            dentro da cerca da clínica.
          </p>

          <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2.5">
            <span className="text-sm text-foreground truncate flex-1">
              {linkPontoCelular()}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={() => void copiar(linkPontoCelular(), 'Link copiado')}
            >
              <Copy className="w-4 h-4" />
              Copiar link
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-6 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : acessos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma estagiária aprovada.
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {acessos.map((a) => (
                <div key={a.candidatura_id} className="py-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium text-foreground">
                      {a.nome}
                    </span>
                    {a.ativo ? (
                      <span className="text-xs text-muted-foreground">
                        login{' '}
                        <strong className="text-foreground">{a.login}</strong>
                        {a.ultimo_login
                          ? ` · entrou ${dataHora(a.ultimo_login)}`
                          : ' · ainda não entrou'}
                        {a.celulares_conectados > 0 &&
                          ` · ${a.celulares_conectados} celular(es) conectado(s)`}
                      </span>
                    ) : (
                      <Badge variant="secondary">
                        {a.login ? 'Desativado' : 'Sem acesso'}
                      </Badge>
                    )}
                    <div className="ml-auto flex gap-2">
                      {a.ativo && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-vermelho-kids"
                          disabled={saving}
                          onClick={() => void desativar(a)}
                        >
                          Desativar
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() =>
                          editando === a.candidatura_id
                            ? setEditando(null)
                            : abrirEdicao(a)
                        }
                      >
                        <KeyRound className="w-4 h-4" />
                        {a.ativo ? 'Trocar senha' : 'Criar acesso'}
                      </Button>
                    </div>
                  </div>

                  {editando === a.candidatura_id && (
                    <div className="rounded-lg border border-border/60 p-3 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Login</Label>
                          <Input
                            value={login}
                            onChange={(e) => setLogin(e.target.value)}
                            autoCapitalize="none"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Senha</Label>
                          <div className="flex gap-2">
                            <Input
                              value={senha}
                              onChange={(e) => setSenha(e.target.value)}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Gerar outra"
                              onClick={() => setSenha(gerarSenha())}
                            >
                              <Dices className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      {a.ativo && (
                        <p className="text-xs text-muted-foreground">
                          Ao trocar a senha, o celular que está conectado sai e
                          precisa entrar de novo.
                        </p>
                      )}
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditando(null)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          disabled={saving || !login.trim()}
                          onClick={() => void salvar(a)}
                        >
                          {saving && (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          )}
                          Salvar acesso
                        </Button>
                      </div>
                    </div>
                  )}

                  {mensagem?.id === a.candidatura_id && (
                    <div className="rounded-lg border border-verde-pipa/40 bg-verde-pipa/10 p-3 space-y-2">
                      <p className="text-xs font-medium text-foreground">
                        Mande esta mensagem para ela (a senha não aparece de
                        novo depois):
                      </p>
                      <Textarea
                        readOnly
                        value={mensagem.texto}
                        rows={8}
                        className="text-xs bg-card"
                      />
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={() =>
                            void copiar(mensagem.texto, 'Mensagem copiada')
                          }
                        >
                          <Copy className="w-4 h-4" />
                          Copiar mensagem
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

AcessoCelularConfig.displayName = 'AcessoCelularConfig';
