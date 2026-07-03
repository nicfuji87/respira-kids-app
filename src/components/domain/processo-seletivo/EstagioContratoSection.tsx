// AI dev note: Seção "Contrato de estágio" no detalhe do candidato APROVADO.
// Preenche as variáveis do Termo (dados do estagiário vêm da candidatura; dados
// da clínica vêm de pessoa_empresas + campos editáveis) e dispara a geração/envio
// para assinatura (Assinafy) via gerarEnviarEstagioContrato. Se já existe contrato,
// mostra o status (gerado/assinado), link do PDF e permite reenviar.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, FileText, Send, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { Badge } from '@/components/primitives/badge';
import { useToast } from '@/components/primitives/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import {
  fetchEstagioContrato,
  gerarEnviarEstagioContrato,
  reenviarEstagioContrato,
  buildEstagiarioEndereco,
  type EstagioContratoRow,
} from '@/lib/estagio-contratos-api';
import type { EstagioContratoVars } from '@/lib/estagio-contrato-template';
import type { CandidaturaEstagioRow } from '@/types/processo-seletivo';

interface Props {
  row: CandidaturaEstagioRow;
}

// Campos editáveis do form de aprovação (o restante vem da candidatura).
interface FormState {
  obrigatorio: 'obrigatório' | 'não obrigatório';
  iesNome: string;
  iesCnpj: string;
  professorOrientador: string;
  cargaHorariaDiaria: string;
  cargaHorariaSemanal: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  bolsaValor: string;
  auxilioTransporte: string;
  avisoRescisaoDias: string;
  concedenteRazaoSocial: string;
  concedenteCnpj: string;
  concedenteEndereco: string;
  representanteLegal: string;
  supervisorNome: string;
  supervisorCrefito: string;
  comarca: string;
  cidadeAssinatura: string;
}

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  gerado: 'Aguardando assinatura',
  assinado: 'Assinado',
};

function fmtDateBR(iso: string): string {
  if (!iso) return '';
  try {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  } catch {
    return iso;
  }
}

export const EstagioContratoSection: React.FC<Props> = ({ row }) => {
  const { toast } = useToast();
  const { user } = useAuth();

  const [contrato, setContrato] = useState<EstagioContratoRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [form, setForm] = useState<FormState>({
    obrigatorio: 'não obrigatório',
    iesNome: row.instituicao || '',
    iesCnpj: '',
    professorOrientador: '',
    cargaHorariaDiaria: '4',
    cargaHorariaSemanal: '20',
    vigenciaInicio: '',
    vigenciaFim: '',
    bolsaValor: '',
    auxilioTransporte: '',
    avisoRescisaoDias: '30',
    concedenteRazaoSocial: '',
    concedenteCnpj: '',
    concedenteEndereco: '',
    representanteLegal: '',
    supervisorNome: '',
    supervisorCrefito: '',
    comarca: '',
    cidadeAssinatura: row.cidade || '',
  });

  const set = useCallback(
    (patch: Partial<FormState>) => setForm((p) => ({ ...p, ...patch })),
    []
  );

  // Carrega contrato existente + defaults da clínica (pessoa_empresas).
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [existing, empresaRes] = await Promise.all([
          fetchEstagioContrato(row.id),
          supabase
            .from('pessoa_empresas')
            .select('razao_social, cnpj')
            .eq('ativo', true)
            .order('razao_social')
            .limit(1)
            .maybeSingle(),
        ]);
        if (cancel) return;
        setContrato(existing);
        if (empresaRes.data) {
          set({
            concedenteRazaoSocial: empresaRes.data.razao_social || '',
            concedenteCnpj: empresaRes.data.cnpj || '',
          });
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [row.id, set]);

  const estagiarioEndereco = useMemo(() => buildEstagiarioEndereco(row), [row]);

  const semEmail = !row.email;
  const semCpf = !row.cpf;

  const podeGerar = useMemo(() => {
    const req = [
      form.iesNome,
      form.professorOrientador,
      form.cargaHorariaDiaria,
      form.cargaHorariaSemanal,
      form.vigenciaInicio,
      form.vigenciaFim,
      form.bolsaValor,
      form.concedenteRazaoSocial,
      form.concedenteCnpj,
      form.concedenteEndereco,
      form.representanteLegal,
      form.supervisorNome,
      form.supervisorCrefito,
      form.comarca,
      form.cidadeAssinatura,
    ];
    return req.every((v) => v && v.trim().length > 0) && !semEmail && !semCpf;
  }, [form, semEmail, semCpf]);

  const handleGerar = useCallback(async () => {
    setSending(true);
    try {
      const vars: EstagioContratoVars = {
        estagiarioNome: row.nome,
        estagiarioCpf: row.cpf || '',
        estagiarioEndereco: estagiarioEndereco,
        estagiarioEmail: row.email || undefined,
        estagiarioTelefone: row.telefone || undefined,
        curso: row.curso || 'Fisioterapia',
        semestre: row.periodo || '',
        obrigatorio: form.obrigatorio,
        iesNome: form.iesNome,
        iesCnpj: form.iesCnpj || undefined,
        professorOrientador: form.professorOrientador,
        cargaHorariaDiaria: form.cargaHorariaDiaria,
        cargaHorariaSemanal: form.cargaHorariaSemanal,
        vigenciaInicio: fmtDateBR(form.vigenciaInicio),
        vigenciaFim: fmtDateBR(form.vigenciaFim),
        bolsaValor: form.bolsaValor,
        auxilioTransporte: form.auxilioTransporte || '0,00',
        avisoRescisaoDias: form.avisoRescisaoDias || '30',
        concedenteRazaoSocial: form.concedenteRazaoSocial,
        concedenteCnpj: form.concedenteCnpj,
        concedenteEndereco: form.concedenteEndereco,
        representanteLegal: form.representanteLegal,
        supervisorNome: form.supervisorNome,
        supervisorCrefito: form.supervisorCrefito,
        comarca: form.comarca,
        cidadeAssinatura: form.cidadeAssinatura,
        dataAssinatura: new Date().toLocaleDateString('pt-BR'),
      };
      await gerarEnviarEstagioContrato({
        candidaturaId: row.id,
        vars,
        criadoPor: user?.pessoa?.id ?? null,
      });
      const refreshed = await fetchEstagioContrato(row.id);
      setContrato(refreshed);
      toast({
        title: 'Contrato enviado para assinatura',
        description: `${row.nome} vai receber o Termo de Estágio na Assinafy.`,
      });
    } catch (e) {
      toast({
        title: 'Falha ao gerar o contrato',
        description: e instanceof Error ? e.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  }, [row, form, estagiarioEndereco, user, toast]);

  const handleReenviar = useCallback(async () => {
    if (!contrato) return;
    setSending(true);
    try {
      await reenviarEstagioContrato(contrato.id);
      const refreshed = await fetchEstagioContrato(row.id);
      setContrato(refreshed);
      toast({ title: 'Contrato reenviado para assinatura' });
    } catch (e) {
      toast({
        title: 'Falha ao reenviar',
        description: e instanceof Error ? e.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  }, [contrato, row.id, toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando contrato...
      </div>
    );
  }

  const field = (
    key: keyof FormState,
    label: string,
    opts: { type?: string; placeholder?: string; full?: boolean } = {}
  ) => (
    <div className={opts.full ? 'sm:col-span-2 space-y-1.5' : 'space-y-1.5'}>
      <Label className="text-foreground">{label}</Label>
      <Input
        type={opts.type || 'text'}
        placeholder={opts.placeholder}
        value={form[key]}
        onChange={(e) => set({ [key]: e.target.value } as Partial<FormState>)}
      />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Estado do contrato existente */}
      {contrato && (
        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <FileText className="w-4 h-4 text-azul-respira" />
            <span className="font-semibold text-foreground">
              {contrato.nome_contrato || 'Termo de Estágio'}
            </span>
            <Badge
              variant={
                contrato.status_contrato === 'assinado'
                  ? 'default'
                  : 'secondary'
              }
            >
              {contrato.status_contrato === 'assinado' && (
                <CheckCircle2 className="w-3 h-3 mr-1" />
              )}
              {STATUS_LABEL[contrato.status_contrato] ||
                contrato.status_contrato}
            </Badge>
          </div>
          {contrato.link_contrato && (
            <a
              href={contrato.link_contrato}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-azul-respira underline"
            >
              Abrir PDF do contrato
            </a>
          )}
          {contrato.status_contrato !== 'assinado' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReenviar}
              disabled={sending}
            >
              {sending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Reenviar para assinatura
            </Button>
          )}
        </div>
      )}

      {/* Dados do estagiário (somente leitura, vêm da candidatura) */}
      <div className="rounded-xl border border-border/60 bg-bege-fundo/30 p-4 text-sm space-y-1">
        <p className="font-semibold text-foreground">Dados do estagiário</p>
        <p className="text-muted-foreground">
          {row.nome} · CPF {row.cpf || '—'}
        </p>
        <p className="text-muted-foreground">{estagiarioEndereco || '—'}</p>
        <p className="text-muted-foreground">
          {row.email || '— (sem e-mail)'} · {row.telefone || '—'}
        </p>
        {(semEmail || semCpf) && (
          <p className="text-vermelho-kids text-xs pt-1">
            Faltam dados obrigatórios do estagiário (CPF/e-mail) para gerar o
            contrato.
          </p>
        )}
      </div>

      {/* Form dos campos variáveis */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-foreground">Tipo de estágio</Label>
          <Select
            value={form.obrigatorio}
            onValueChange={(v) =>
              set({ obrigatorio: v as FormState['obrigatorio'] })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="não obrigatório">Não obrigatório</SelectItem>
              <SelectItem value="obrigatório">Obrigatório</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {field('iesNome', 'Instituição de ensino')}
        {field('iesCnpj', 'CNPJ da instituição (opcional)')}
        {field('professorOrientador', 'Professor(a) orientador(a)')}
        {field('cargaHorariaDiaria', 'Carga horária diária (h)', {
          type: 'number',
        })}
        {field('cargaHorariaSemanal', 'Carga horária semanal (h)', {
          type: 'number',
        })}
        {field('vigenciaInicio', 'Início da vigência', { type: 'date' })}
        {field('vigenciaFim', 'Fim da vigência', { type: 'date' })}
        {field('bolsaValor', 'Bolsa-auxílio (R$/mês)', {
          placeholder: '0,00',
        })}
        {field('auxilioTransporte', 'Auxílio-transporte (R$)', {
          placeholder: '0,00',
        })}
        {field('avisoRescisaoDias', 'Aviso de rescisão (dias)', {
          type: 'number',
        })}

        <div className="sm:col-span-2 pt-1 border-t border-border/50" />
        {field('concedenteRazaoSocial', 'Clínica (razão social)', {
          full: true,
        })}
        {field('concedenteCnpj', 'CNPJ da clínica')}
        {field('concedenteEndereco', 'Endereço da clínica', { full: true })}
        {field('representanteLegal', 'Representante legal da clínica')}
        {field('supervisorNome', 'Supervisor(a) (fisioterapeuta)')}
        {field('supervisorCrefito', 'CREFITO do supervisor')}
        {field('comarca', 'Comarca (foro)')}
        {field('cidadeAssinatura', 'Cidade da assinatura')}
      </div>

      <div className="flex justify-end pt-1">
        <Button onClick={handleGerar} disabled={!podeGerar || sending}>
          {sending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          {contrato ? 'Regerar e reenviar' : 'Gerar e enviar para assinatura'}
        </Button>
      </div>
    </div>
  );
};

EstagioContratoSection.displayName = 'EstagioContratoSection';
