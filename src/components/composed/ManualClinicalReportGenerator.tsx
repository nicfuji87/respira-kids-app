// AI dev note: ManualClinicalReportGenerator - Componente de relatório clínico manual.
// Diferente do ClinicalReportGenerator (gerado a partir de evoluções via IA), este
// permite que o profissional digite o relatório do zero em um editor estilo Word, com:
// - Formatação básica (negrito, itálico, sublinhado, alinhamento, listas, tamanho de fonte)
// - Botões de inserção rápida (nome do paciente, datas, responsáveis, pediatra, etc.)
// - "Melhorar com IA" usando o prompt enhance_text do Supabase (mesmo usado no EvolutionEditor)
// - Inserção de modelo a partir de outro paciente (busca + seleção de relatório)
// - Carimbo do profissional LOGADO ao final, com fallback textual quando não há imagem
// - PDF gerado via Edge Function generate-clinical-report-pdf (com marca d'água respira-kids-mao.png)
// - Webhook 'relatorio_clinico_gerado' enviando o link público do PDF ao responsável
//
// Permissão: apenas admin e profissional (secretaria não pode gerar).

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Undo,
  Redo,
  Type,
  Sparkles,
  FileSearch,
  Plus,
  Loader2,
  Save,
  Printer,
  Send,
  X,
  Search,
  ArrowLeft,
  CheckCircle,
  FileText,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { Badge } from '@/components/primitives/badge';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { Separator } from '@/components/primitives/separator';
import { ScrollArea } from '@/components/primitives/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/primitives/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

// AI dev note: Profissionais com assinatura digital disponível no bucket respira-documents.
// Mapeamento usa "starts with" para casar variações de nome civil completo
// (ex.: pessoa.nome = "Bruna Cury Lourenço Peres" → "Bruna Cury.png").
const PROFESSIONALS_WITH_SIGNATURE: Array<{
  matchPrefix: string;
  signatureFile: string;
  defaultRegistro?: string;
}> = [
  {
    matchPrefix: 'bruna cury',
    signatureFile: 'Bruna Cury.png',
    defaultRegistro: 'CREFITO 11-167135-F',
  },
  {
    matchPrefix: 'flavia pacheco',
    signatureFile: 'Flavia Pacheco.png',
  },
  {
    matchPrefix: 'flavia da silva pacheco',
    signatureFile: 'Flavia Pacheco.png',
  },
  {
    matchPrefix: 'beatriz perisse',
    signatureFile: 'Beatriz Perisse.png',
  },
];

const normalizeName = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const findSignatureForUser = (userName: string | null | undefined) => {
  if (!userName) return null;
  const norm = normalizeName(userName);
  for (const p of PROFESSIONALS_WITH_SIGNATURE) {
    if (norm.startsWith(p.matchPrefix)) {
      return p;
    }
  }
  return null;
};

// ===================== Helpers de data =====================

const formatDateBR = (d: Date): string =>
  d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const formatDateBRFromISO = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

const formatDateExtended = (d: Date): string =>
  d.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

const calculateAge = (birthDateISO: string): string => {
  const birth = new Date(birthDateISO + 'T12:00:00');
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();
  if (months < 0 || (months === 0 && today.getDate() < birth.getDate())) {
    years--;
    months += 12;
  }
  if (years === 0) {
    return `${months} mes${months !== 1 ? 'es' : ''}`;
  }
  return `${years} ano${years !== 1 ? 's' : ''}${months > 0 ? ` e ${months} mes${months !== 1 ? 'es' : ''}` : ''}`;
};

// ===================== Tipos =====================

interface PatientContext {
  nome: string;
  dataNascimento?: string | null;
  responsavelLegal?: string | null;
  responsavelFinanceiro?: string | null;
  pediatra?: string | null;
  pediatraCRM?: string | null;
  endereco?: string | null;
  consultaDatas?: string[]; // ISO strings ordenadas asc
}

interface InlineSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

type Block =
  | {
      type: 'paragraph';
      align?: 'left' | 'center' | 'right' | 'justify';
      segments: InlineSegment[];
    }
  | {
      type: 'heading';
      level: 1 | 2 | 3;
      align?: 'left' | 'center' | 'right';
      segments: InlineSegment[];
    }
  | {
      type: 'list_item';
      ordered: boolean;
      indexInList: number;
      segments: InlineSegment[];
    }
  | { type: 'spacer' };

interface SavedReportRef {
  id: string;
  conteudo: string | null;
  created_at: string;
}

interface PatientSearchHit {
  id: string;
  nome: string;
  data_nascimento?: string | null;
}

// ===================== HTML -> Blocks parser =====================

// AI dev note: Converte o HTML do contentEditable em blocos consumíveis pela
// Edge Function de PDF. Suporta b/i/u, h1/h2/h3, p/div, ul/ol/li e alinhamento
// via style="text-align: ..." aplicado pelo execCommand.
function htmlToBlocks(html: string): Block[] {
  const container = document.createElement('div');
  container.innerHTML = html || '';
  const blocks: Block[] = [];

  const getAlign = (
    el: HTMLElement
  ): 'left' | 'center' | 'right' | 'justify' | undefined => {
    const align = (el.style.textAlign || el.getAttribute('align') || '')
      .trim()
      .toLowerCase();
    if (align === 'center') return 'center';
    if (align === 'right') return 'right';
    if (align === 'justify') return 'justify';
    if (align === 'left') return 'left';
    return undefined;
  };

  const collectSegments = (
    node: Node,
    inherited: { bold: boolean; italic: boolean; underline: boolean }
  ): InlineSegment[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (!text) return [];
      return [
        {
          text,
          bold: inherited.bold || undefined,
          italic: inherited.italic || undefined,
          underline: inherited.underline || undefined,
        },
      ];
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    // Quebra inline: <br> vira "\n"
    if (tag === 'br') {
      return [{ text: '\n' }];
    }

    let bold = inherited.bold;
    let italic = inherited.italic;
    let underline = inherited.underline;

    if (tag === 'b' || tag === 'strong') bold = true;
    if (tag === 'i' || tag === 'em') italic = true;
    if (tag === 'u') underline = true;

    // Style inline (font-weight: bold; font-style: italic; text-decoration: underline)
    const style = el.style;
    if (style) {
      if (
        style.fontWeight &&
        /^(bold|[6-9]00)$/i.test(style.fontWeight.trim())
      ) {
        bold = true;
      }
      if (style.fontStyle && /italic/i.test(style.fontStyle)) italic = true;
      if (style.textDecoration && /underline/i.test(style.textDecoration))
        underline = true;
    }

    const segs: InlineSegment[] = [];
    for (const child of Array.from(el.childNodes)) {
      const s = collectSegments(child, { bold, italic, underline });
      segs.push(...s);
    }
    return segs;
  };

  const isBlockTag = (tag: string) =>
    [
      'p',
      'div',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
    ].includes(tag);

  const flushInline = (inlineSegments: InlineSegment[]) => {
    if (inlineSegments.length === 0) return;
    blocks.push({
      type: 'paragraph',
      align: 'justify',
      segments: inlineSegments,
    });
  };

  // Inline segments que aparecem soltos no nível do container (texto direto)
  let pendingInline: InlineSegment[] = [];

  const handleBlockElement = (el: HTMLElement) => {
    const tag = el.tagName.toLowerCase();

    if (tag === 'ul' || tag === 'ol') {
      const ordered = tag === 'ol';
      const items = Array.from(el.children).filter(
        (c) => c.tagName.toLowerCase() === 'li'
      ) as HTMLElement[];
      items.forEach((li, idx) => {
        const segments = collectSegments(li, {
          bold: false,
          italic: false,
          underline: false,
        });
        blocks.push({
          type: 'list_item',
          ordered,
          indexInList: idx,
          segments,
        });
      });
      return;
    }

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const level = (tag === 'h1' ? 1 : tag === 'h2' ? 2 : 3) as 1 | 2 | 3;
      const segments = collectSegments(el, {
        bold: false,
        italic: false,
        underline: false,
      });
      const align = getAlign(el);
      blocks.push({
        type: 'heading',
        level,
        align:
          align === 'justify'
            ? undefined
            : (align as 'left' | 'center' | 'right' | undefined),
        segments,
      });
      return;
    }

    // p, div, blockquote, pre, h4..h6
    const segments = collectSegments(el, {
      bold: false,
      italic: false,
      underline: false,
    });
    const align = getAlign(el) ?? 'justify';

    // Div vazio = espaçador (quebra de parágrafo)
    const hasOnlyBr =
      el.childNodes.length === 1 &&
      (el.childNodes[0] as HTMLElement).tagName === 'BR';

    if (segments.length === 0 || hasOnlyBr) {
      blocks.push({ type: 'spacer' });
      return;
    }

    blocks.push({ type: 'paragraph', align, segments });
  };

  for (const node of Array.from(container.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text.trim().length > 0) {
        pendingInline.push({ text });
      }
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (isBlockTag(tag)) {
      // Antes de processar bloco, despeja os inline pendentes em um parágrafo
      if (pendingInline.length > 0) {
        flushInline(pendingInline);
        pendingInline = [];
      }
      handleBlockElement(el);
    } else if (tag === 'br') {
      flushInline(pendingInline);
      pendingInline = [];
      blocks.push({ type: 'spacer' });
    } else {
      // Span, b, i, u, etc. — inline solto
      const segs = collectSegments(el, {
        bold: false,
        italic: false,
        underline: false,
      });
      pendingInline.push(...segs);
    }
  }
  if (pendingInline.length > 0) {
    flushInline(pendingInline);
  }

  // Limpa blocos de parágrafo realmente vazios (sem texto e sem espacers consecutivos)
  return blocks.filter((b, idx, arr) => {
    if (
      b.type !== 'paragraph' &&
      b.type !== 'heading' &&
      b.type !== 'list_item'
    )
      return true;
    const text = b.segments
      .map((s) => s.text)
      .join('')
      .trim();
    if (text.length === 0) {
      // Evita virar um parágrafo vazio
      const prev = arr[idx - 1];
      return prev && prev.type === 'spacer' ? false : true;
    }
    return true;
  });
}

// ===================== Componente =====================

export interface ManualClinicalReportGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  /** Disparado após salvar com sucesso para a lista do parent recarregar */
  onSaved?: () => void;
}

export const ManualClinicalReportGenerator =
  React.memo<ManualClinicalReportGeneratorProps>(
    ({ isOpen, onClose, patientId, patientName, onSaved }) => {
      const { toast } = useToast();
      const { user } = useAuth();

      const editorRef = useRef<HTMLDivElement>(null);
      const savedRangeRef = useRef<Range | null>(null);

      const [isLoadingContext, setIsLoadingContext] = useState(false);
      const [isEnhancing, setIsEnhancing] = useState(false);
      const [isSaving, setIsSaving] = useState(false);
      const [isSending, setIsSending] = useState(false);
      const [isExporting, setIsExporting] = useState(false);

      const [reportDate, setReportDate] = useState<string>(
        new Date().toISOString().split('T')[0]
      );

      const [patientContext, setPatientContext] = useState<PatientContext>({
        nome: patientName,
      });

      // Estado para template search
      const [templateOpen, setTemplateOpen] = useState(false);
      const [templateSearch, setTemplateSearch] = useState('');
      const [templateResults, setTemplateResults] = useState<
        PatientSearchHit[]
      >([]);
      const [isSearching, setIsSearching] = useState(false);
      const [selectedTemplatePatient, setSelectedTemplatePatient] =
        useState<PatientSearchHit | null>(null);
      const [templateReports, setTemplateReports] = useState<SavedReportRef[]>(
        []
      );
      const [isLoadingTemplateReports, setIsLoadingTemplateReports] =
        useState(false);

      // Estado de progresso: edição -> salvo (com PDF disponível)
      const [savedReport, setSavedReport] = useState<{
        id: string;
        pdfUrl: string;
      } | null>(null);

      const userRole = user?.pessoa?.role as
        | 'admin'
        | 'profissional'
        | 'secretaria'
        | null;
      const canUse = userRole === 'admin' || userRole === 'profissional';

      // ============== Reset ao abrir/fechar ==============

      useEffect(() => {
        if (isOpen) {
          setReportDate(new Date().toISOString().split('T')[0]);
          setSavedReport(null);
          loadPatientContext();
          // Limpa editor
          requestAnimationFrame(() => {
            if (editorRef.current) {
              editorRef.current.innerHTML = '';
              editorRef.current.focus();
            }
          });
        } else {
          setTemplateOpen(false);
          setTemplateSearch('');
          setTemplateResults([]);
          setSelectedTemplatePatient(null);
          setTemplateReports([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [isOpen, patientId]);

      const loadPatientContext = useCallback(async () => {
        setIsLoadingContext(true);
        try {
          // Dados gerais + endereço + responsáveis + pediatra
          const [viewResp, agendamentosResp] = await Promise.all([
            supabase
              .from('pacientes_com_responsaveis_view')
              .select(
                'nome, data_nascimento, responsavel_legal_nome, responsavel_financeiro_nome, pediatras_nomes, pediatras_crms, logradouro, cep, bairro, cidade, estado'
              )
              .eq('id', patientId)
              .single(),
            supabase
              .from('vw_agendamentos_completos')
              .select('data_hora')
              .eq('paciente_id', patientId)
              .eq('status_consulta_codigo', 'finalizado')
              .order('data_hora', { ascending: true }),
          ]);

          // Buscar número/complemento direto na pessoas
          const pessoaResp = await supabase
            .from('pessoas')
            .select('numero_endereco, complemento_endereco')
            .eq('id', patientId)
            .maybeSingle();

          const v = viewResp.data || ({} as Record<string, unknown>);
          const p = pessoaResp.data || ({} as Record<string, unknown>);

          // Montar endereço
          const logradouro = (v as Record<string, string | null>).logradouro;
          const bairro = (v as Record<string, string | null>).bairro;
          const cidade = (v as Record<string, string | null>).cidade;
          const estado = (v as Record<string, string | null>).estado;
          const cep = (v as Record<string, string | null>).cep;
          const numero = (p as Record<string, string | null>).numero_endereco;
          const complemento = (p as Record<string, string | null>)
            .complemento_endereco;

          const enderecoParts: string[] = [];
          if (logradouro) {
            const lograd = numero ? `${logradouro}, ${numero}` : logradouro;
            enderecoParts.push(
              complemento ? `${lograd} - ${complemento}` : lograd
            );
          }
          if (bairro) enderecoParts.push(bairro);
          if (cidade && estado) enderecoParts.push(`${cidade}/${estado}`);
          else if (cidade) enderecoParts.push(cidade);
          if (cep) enderecoParts.push(`CEP ${cep}`);
          const endereco =
            enderecoParts.length > 0 ? enderecoParts.join(' - ') : null;

          const consultaDatas = (agendamentosResp.data || [])
            .map((a: { data_hora: string | null }) => a.data_hora)
            .filter((d: string | null): d is string => !!d);

          setPatientContext({
            nome: (v as { nome?: string }).nome || patientName,
            dataNascimento:
              (v as { data_nascimento?: string }).data_nascimento || null,
            responsavelLegal:
              (v as { responsavel_legal_nome?: string })
                .responsavel_legal_nome || null,
            responsavelFinanceiro:
              (v as { responsavel_financeiro_nome?: string })
                .responsavel_financeiro_nome || null,
            pediatra:
              (v as { pediatras_nomes?: string }).pediatras_nomes || null,
            pediatraCRM:
              (v as { pediatras_crms?: string }).pediatras_crms || null,
            endereco,
            consultaDatas,
          });
        } catch (err) {
          console.error('Erro ao carregar contexto do paciente:', err);
        } finally {
          setIsLoadingContext(false);
        }
      }, [patientId, patientName]);

      // ============== Editor: cursor + commands ==============

      const saveSelection = useCallback(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (
          editorRef.current &&
          (editorRef.current === range.commonAncestorContainer ||
            editorRef.current.contains(range.commonAncestorContainer))
        ) {
          savedRangeRef.current = range.cloneRange();
        }
      }, []);

      const restoreSelection = useCallback(() => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        if (savedRangeRef.current) {
          const sel = window.getSelection();
          if (!sel) return;
          sel.removeAllRanges();
          sel.addRange(savedRangeRef.current);
        } else {
          // Coloca o cursor no final
          const range = document.createRange();
          range.selectNodeContents(editorRef.current);
          range.collapse(false);
          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      }, []);

      const insertHtmlAtCursor = useCallback(
        (html: string) => {
          restoreSelection();
          document.execCommand('insertHTML', false, html);
          saveSelection();
        },
        [restoreSelection, saveSelection]
      );

      const insertTextAtCursor = useCallback(
        (text: string) => {
          restoreSelection();
          document.execCommand('insertText', false, text);
          saveSelection();
        },
        [restoreSelection, saveSelection]
      );

      const execCmd = useCallback(
        (cmd: string, value?: string) => {
          if (!editorRef.current) return;
          editorRef.current.focus();
          document.execCommand(cmd, false, value);
          saveSelection();
        },
        [saveSelection]
      );

      // ============== Quick insert ==============

      const buildDatasConsultasText = useCallback((): string => {
        const datas = patientContext.consultaDatas ?? [];
        if (datas.length === 0)
          return 'sem atendimentos finalizados registrados';
        const byYear: Record<string, string[]> = {};
        for (const iso of datas) {
          const d = new Date(iso);
          const y = d.getFullYear().toString();
          const dd = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (!byYear[y]) byYear[y] = [];
          if (!byYear[y].includes(dd)) byYear[y].push(dd);
        }
        return Object.entries(byYear)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([y, dds]) => `${y}: ${dds.join(', ')}`)
          .join('; ');
      }, [patientContext.consultaDatas]);

      const quickInsertItems = useMemo(() => {
        const dob = patientContext.dataNascimento;
        return [
          {
            id: 'nome_paciente',
            label: 'Nome do paciente',
            value: patientContext.nome,
          },
          {
            id: 'data_nascimento',
            label: 'Data de nascimento',
            value: dob ? formatDateBRFromISO(dob) : 'não cadastrada',
          },
          {
            id: 'idade',
            label: 'Idade atual',
            value: dob ? calculateAge(dob) : 'não cadastrada',
          },
          {
            id: 'responsavel_legal',
            label: 'Responsável legal',
            value: patientContext.responsavelLegal || 'não cadastrado',
          },
          {
            id: 'responsavel_financeiro',
            label: 'Responsável financeiro',
            value: patientContext.responsavelFinanceiro || 'não cadastrado',
          },
          {
            id: 'pediatra',
            label: 'Pediatra',
            value: patientContext.pediatra
              ? patientContext.pediatraCRM
                ? `${patientContext.pediatra} (CRM: ${patientContext.pediatraCRM})`
                : patientContext.pediatra
              : 'não cadastrado',
          },
          {
            id: 'datas_consultas',
            label: 'Datas das consultas',
            value: buildDatasConsultasText(),
          },
          {
            id: 'data_hoje',
            label: 'Data de hoje (por extenso)',
            value: formatDateExtended(new Date()),
          },
          {
            id: 'endereco',
            label: 'Endereço',
            value: patientContext.endereco || 'não cadastrado',
          },
        ];
      }, [patientContext, buildDatasConsultasText]);

      const handleQuickInsert = useCallback(
        (value: string) => {
          insertTextAtCursor(value);
        },
        [insertTextAtCursor]
      );

      // ============== AI: melhorar texto ==============

      const handleEnhanceText = useCallback(async () => {
        if (!editorRef.current) return;
        const text = editorRef.current.innerText.trim();
        if (text.length < 20) {
          toast({
            title: 'Texto muito curto',
            description:
              'Digite pelo menos 20 caracteres antes de melhorar com a IA.',
            variant: 'destructive',
          });
          return;
        }
        setIsEnhancing(true);
        try {
          const { data, error } = await supabase.functions.invoke(
            'enhance-text',
            {
              body: { text, action: 'improve' },
            }
          );
          if (error) throw error;
          const result = data as {
            success?: boolean;
            enhancedText?: string;
            error?: string;
          };
          if (!result?.success || !result.enhancedText) {
            throw new Error(result?.error || 'Falha ao melhorar texto');
          }
          // Converte texto plano em parágrafos HTML preservando quebras
          const html = result.enhancedText
            .split(/\n{2,}/)
            .map((p) => {
              const safe = p
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');
              return `<p>${safe}</p>`;
            })
            .join('');
          if (editorRef.current) {
            editorRef.current.innerHTML = html;
          }
          toast({
            title: 'Texto aprimorado',
            description: 'Revise as alterações feitas pela IA antes de salvar.',
          });
        } catch (err) {
          console.error('Erro ao melhorar texto:', err);
          toast({
            title: 'Erro',
            description:
              err instanceof Error ? err.message : 'Falha ao melhorar texto',
            variant: 'destructive',
          });
        } finally {
          setIsEnhancing(false);
        }
      }, [toast]);

      // ============== Template: busca de outro paciente ==============

      useEffect(() => {
        if (!templateOpen || !templateSearch || templateSearch.length < 2) {
          setTemplateResults([]);
          return;
        }
        let cancelled = false;
        setIsSearching(true);
        const timer = setTimeout(async () => {
          try {
            const { data, error } = await supabase.rpc('fn_search_pacientes', {
              termo_busca: templateSearch.trim(),
              limite: 20,
            });
            if (cancelled) return;
            if (error) {
              console.error('Erro na busca:', error);
              setTemplateResults([]);
            } else {
              setTemplateResults(
                (
                  (data as Array<{
                    id: string;
                    nome: string;
                    data_nascimento?: string | null;
                  }>) || []
                )
                  .filter((p) => p.id !== patientId)
                  .map((p) => ({
                    id: p.id,
                    nome: p.nome,
                    data_nascimento: p.data_nascimento ?? null,
                  }))
              );
            }
          } catch (err) {
            console.error('Erro na busca:', err);
            if (!cancelled) setTemplateResults([]);
          } finally {
            if (!cancelled) setIsSearching(false);
          }
        }, 300);
        return () => {
          cancelled = true;
          clearTimeout(timer);
        };
      }, [templateSearch, templateOpen, patientId]);

      const loadTemplateReports = useCallback(async (selPatientId: string) => {
        setIsLoadingTemplateReports(true);
        try {
          // Carregar relatórios manuais E os de IA do paciente selecionado
          const { data: tipos } = await supabase
            .from('relatorios_tipo')
            .select('id, codigo')
            .in('codigo', ['relatorio_medico', 'relatorio_medico_manual']);
          const tipoIds = (tipos || []).map((t) => t.id);
          if (tipoIds.length === 0) {
            setTemplateReports([]);
            return;
          }
          const { data, error } = await supabase
            .from('relatorios_medicos')
            .select('id, conteudo, created_at')
            .eq('id_pessoa', selPatientId)
            .eq('ativo', true)
            .in('tipo_relatorio_id', tipoIds)
            .order('created_at', { ascending: false })
            .limit(20);
          if (error) throw error;
          setTemplateReports((data || []) as SavedReportRef[]);
        } catch (err) {
          console.error('Erro ao carregar relatórios do modelo:', err);
          setTemplateReports([]);
        } finally {
          setIsLoadingTemplateReports(false);
        }
      }, []);

      const handlePickTemplatePatient = useCallback(
        (p: PatientSearchHit) => {
          setSelectedTemplatePatient(p);
          loadTemplateReports(p.id);
        },
        [loadTemplateReports]
      );

      const handleInsertTemplate = useCallback(
        async (report: SavedReportRef) => {
          try {
            // Carrega HTML do relatório: prefere o html_conteudo armazenado em
            // pdf_url se for um .html; senão usa apenas o conteudo (texto).
            let htmlToInsert = '';
            // Buscar conteúdo completo (apenas o que está em 'conteudo')
            const { data } = await supabase
              .from('relatorios_medicos')
              .select('conteudo, pdf_url')
              .eq('id', report.id)
              .single();
            if (data?.conteudo) {
              const conteudo = data.conteudo as string;
              // Se for HTML já (contém tags), insere direto. Senão, envolve em parágrafos.
              const looksLikeHtml = /<\w+/.test(conteudo);
              htmlToInsert = looksLikeHtml
                ? conteudo
                : conteudo
                    .split(/\n{2,}/)
                    .map(
                      (p: string) =>
                        `<p>${p
                          .replace(/&/g, '&amp;')
                          .replace(/</g, '&lt;')
                          .replace(/>/g, '&gt;')
                          .replace(/\n/g, '<br>')}</p>`
                    )
                    .join('');
            }
            if (!htmlToInsert) {
              toast({
                title: 'Modelo vazio',
                description:
                  'Este relatório não possui conteúdo para usar como modelo.',
                variant: 'destructive',
              });
              return;
            }
            insertHtmlAtCursor(htmlToInsert);
            setTemplateOpen(false);
            setSelectedTemplatePatient(null);
            setTemplateReports([]);
            setTemplateSearch('');
            setTemplateResults([]);
            toast({
              title: 'Modelo inserido',
              description: 'Edite o texto conforme necessário.',
            });
          } catch (err) {
            console.error('Erro ao inserir modelo:', err);
            toast({
              title: 'Erro',
              description: 'Não foi possível inserir o modelo',
              variant: 'destructive',
            });
          }
        },
        [insertHtmlAtCursor, toast]
      );

      // ============== Profissional logado / assinatura ==============

      const professionalInfo = useMemo(() => {
        const name = user?.pessoa?.nome || 'Profissional';
        const sigEntry = findSignatureForUser(name);
        const registro = user?.pessoa
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((user.pessoa as any).registro_profissional as
              | string
              | undefined) ||
            sigEntry?.defaultRegistro ||
            null
          : sigEntry?.defaultRegistro || null;
        return {
          name,
          registro,
          signaturePath: sigEntry?.signatureFile ?? null,
        };
      }, [user]);

      // ============== Gerar PDF via Edge Function ==============

      const buildPayload = useCallback(() => {
        if (!editorRef.current) return null;
        const blocks = htmlToBlocks(editorRef.current.innerHTML);
        return {
          patientName,
          patientInfo: {
            dataNascimento: patientContext.dataNascimento || null,
            responsavelLegal: patientContext.responsavelLegal || null,
            responsavelFinanceiro: patientContext.responsavelFinanceiro || null,
            pediatra: patientContext.pediatra || null,
            pediatraCRM: patientContext.pediatraCRM || null,
            endereco: patientContext.endereco || null,
          },
          reportDate,
          blocks,
          professional: professionalInfo,
          generatedBy: user?.pessoa?.nome || null,
        };
      }, [patientName, patientContext, reportDate, professionalInfo, user]);

      const callPdfFunction = useCallback(
        async (
          payload: ReturnType<typeof buildPayload>
        ): Promise<Uint8Array> => {
          if (!payload) throw new Error('Conteúdo vazio');
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
          const res = await fetch(
            `${supabaseUrl}/functions/v1/generate-clinical-report-pdf`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${supabaseAnonKey}`,
                apikey: supabaseAnonKey,
              },
              body: JSON.stringify(payload),
            }
          );
          if (!res.ok) {
            const errText = await res.text();
            throw new Error(
              `Falha ao gerar PDF (${res.status}): ${errText.substring(0, 200)}`
            );
          }
          const buf = await res.arrayBuffer();
          return new Uint8Array(buf);
        },
        []
      );

      // ============== Salvar (gera PDF, faz upload, insere no banco) ==============

      const handleSave = useCallback(async () => {
        if (!editorRef.current || !canUse) return;
        const plain = editorRef.current.innerText.trim();
        if (plain.length < 10) {
          toast({
            title: 'Conteúdo muito curto',
            description: 'Escreva o relatório antes de salvar.',
            variant: 'destructive',
          });
          return;
        }
        setIsSaving(true);
        try {
          const payload = buildPayload();
          const pdfBytes = await callPdfFunction(payload);

          // Upload PDF
          const timestamp = Date.now();
          const fileName = `relatorio_manual_${patientId}_${timestamp}.pdf`;
          const filePath = `relatorios/${patientId}/${fileName}`;
          const pdfBlob = new Blob([pdfBytes as unknown as BlobPart], {
            type: 'application/pdf',
          });
          const { error: uploadError } = await supabase.storage
            .from('respira-documents')
            .upload(filePath, pdfBlob, {
              upsert: true,
              contentType: 'application/pdf',
            });
          if (uploadError) {
            throw new Error(`Erro ao fazer upload: ${uploadError.message}`);
          }
          const {
            data: { publicUrl },
          } = supabase.storage.from('respira-documents').getPublicUrl(filePath);

          // tipo_relatorio_id = relatorio_medico_manual
          const { data: tipoData, error: tipoError } = await supabase
            .from('relatorios_tipo')
            .select('id')
            .eq('codigo', 'relatorio_medico_manual')
            .single();
          if (tipoError || !tipoData) {
            throw new Error('Tipo de relatório manual não encontrado');
          }

          // Guarda HTML em 'conteudo' (para permitir uso como modelo no futuro)
          const htmlContent = editorRef.current.innerHTML;

          const insertData = {
            id_pessoa: patientId,
            tipo_relatorio_id: tipoData.id,
            conteudo: htmlContent,
            pdf_url: publicUrl,
            transcricao: false,
            ativo: true,
            ...(user?.pessoa?.id && { criado_por: user.pessoa.id }),
          };
          const { data: inserted, error: insertError } = await supabase
            .from('relatorios_medicos')
            .insert(insertData)
            .select('id')
            .single();
          if (insertError || !inserted) {
            throw new Error(
              `Erro ao salvar no banco: ${insertError?.message || 'desconhecido'}`
            );
          }

          setSavedReport({ id: inserted.id, pdfUrl: publicUrl });
          toast({
            title: 'Relatório salvo',
            description:
              'Agora você pode exportar em PDF ou enviar ao responsável.',
          });
          onSaved?.();
        } catch (err) {
          console.error('Erro ao salvar relatório manual:', err);
          toast({
            title: 'Erro ao salvar',
            description:
              err instanceof Error ? err.message : 'Erro desconhecido',
            variant: 'destructive',
          });
        } finally {
          setIsSaving(false);
        }
      }, [
        canUse,
        buildPayload,
        callPdfFunction,
        patientId,
        user,
        toast,
        onSaved,
      ]);

      // ============== Exportar PDF (apenas baixar) ==============

      const handleExportPdf = useCallback(async () => {
        // Se já foi salvo, abre a URL salva
        if (savedReport?.pdfUrl) {
          window.open(savedReport.pdfUrl, '_blank');
          return;
        }
        if (!editorRef.current) return;
        setIsExporting(true);
        try {
          const payload = buildPayload();
          const pdfBytes = await callPdfFunction(payload);
          const blob = new Blob([pdfBytes as unknown as BlobPart], {
            type: 'application/pdf',
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Relatorio Clinico - ${patientName}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch (err) {
          console.error('Erro ao exportar PDF:', err);
          toast({
            title: 'Erro',
            description:
              err instanceof Error
                ? err.message
                : 'Não foi possível exportar o PDF',
            variant: 'destructive',
          });
        } finally {
          setIsExporting(false);
        }
      }, [savedReport, buildPayload, callPdfFunction, patientName, toast]);

      // ============== Enviar ao responsável ==============

      const handleSendToResponsible = useCallback(async () => {
        if (!savedReport?.pdfUrl) {
          toast({
            title: 'Salve primeiro',
            description: 'Salve o relatório antes de enviar ao responsável.',
            variant: 'destructive',
          });
          return;
        }
        setIsSending(true);
        try {
          // Buscar dados do responsável
          const { data: patientData, error: patientError } = await supabase
            .from('pacientes_com_responsaveis_view')
            .select(
              'responsavel_legal_nome, responsavel_legal_telefone, responsavel_legal_email'
            )
            .eq('id', patientId)
            .single();
          if (patientError || !patientData) {
            throw new Error('Não foi possível buscar dados do responsável');
          }

          const webhookPayload = {
            evento: 'relatorio_clinico_gerado',
            payload: {
              tipo: 'relatorio_clinico_gerado',
              timestamp: new Date().toISOString(),
              webhook_id: crypto.randomUUID(),
              data: {
                paciente: { id: patientId, nome: patientName },
                responsavel_legal: {
                  nome: patientData.responsavel_legal_nome,
                  telefone: patientData.responsavel_legal_telefone,
                  email: patientData.responsavel_legal_email || null,
                },
                relatorio: {
                  url: savedReport.pdfUrl,
                  data_emissao: reportDate,
                  profissional: professionalInfo.name,
                  origem: 'manual',
                },
              },
            },
          };

          const { error: webhookError } = await supabase
            .from('webhook_queue')
            .insert(webhookPayload);
          if (webhookError) {
            console.error('Erro ao enfileirar webhook:', webhookError);
            throw new Error('Erro ao enviar para o responsável');
          }

          toast({
            title: 'Enviado!',
            description: `Relatório enviado para ${patientData.responsavel_legal_nome || 'o responsável'}`,
          });
          onClose();
        } catch (err) {
          console.error('Erro ao enviar relatório:', err);
          toast({
            title: 'Erro',
            description:
              err instanceof Error ? err.message : 'Erro ao enviar relatório',
            variant: 'destructive',
          });
        } finally {
          setIsSending(false);
        }
      }, [
        savedReport,
        patientId,
        patientName,
        reportDate,
        professionalInfo,
        toast,
        onClose,
      ]);

      // ============== Render ==============

      if (!canUse) {
        return null;
      }

      const isBusy = isSaving || isSending || isExporting || isEnhancing;

      return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
          <DialogContent className="max-w-6xl w-full h-[95vh] max-h-[95vh] overflow-hidden flex flex-col p-0">
            <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
              <DialogTitle className="flex items-center gap-2">
                {savedReport ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    Relatório Manual Salvo
                  </>
                ) : (
                  <>
                    <FileText className="h-5 w-5 text-primary" />
                    Relatório Médico Manual
                  </>
                )}
                <Badge variant="secondary" className="ml-2">
                  {patientName}
                </Badge>
              </DialogTitle>
              {isLoadingContext && (
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Carregando dados do paciente...
                </p>
              )}
            </DialogHeader>

            {!savedReport ? (
              <>
                {/* Toolbar: formatação */}
                <div className="border-b bg-muted/30 px-3 py-2 flex flex-wrap items-center gap-1 shrink-0">
                  {/* Tamanho de fonte */}
                  <Select
                    onValueChange={(v) => execCmd('fontSize', v)}
                    defaultValue="3"
                  >
                    <SelectTrigger className="h-8 w-[110px] text-xs">
                      <SelectValue placeholder="Tamanho" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Muito pequeno</SelectItem>
                      <SelectItem value="2">Pequeno</SelectItem>
                      <SelectItem value="3">Normal</SelectItem>
                      <SelectItem value="4">Médio</SelectItem>
                      <SelectItem value="5">Grande</SelectItem>
                      <SelectItem value="6">Muito grande</SelectItem>
                      <SelectItem value="7">Enorme</SelectItem>
                    </SelectContent>
                  </Select>

                  <Separator orientation="vertical" className="h-6 mx-1" />

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => execCmd('bold')}
                    title="Negrito (Ctrl+B)"
                  >
                    <Bold className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => execCmd('italic')}
                    title="Itálico (Ctrl+I)"
                  >
                    <Italic className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => execCmd('underline')}
                    title="Sublinhado (Ctrl+U)"
                  >
                    <Underline className="h-4 w-4" />
                  </Button>

                  <Separator orientation="vertical" className="h-6 mx-1" />

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => execCmd('justifyLeft')}
                    title="Alinhar à esquerda"
                  >
                    <AlignLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => execCmd('justifyCenter')}
                    title="Centralizar"
                  >
                    <AlignCenter className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => execCmd('justifyRight')}
                    title="Alinhar à direita"
                  >
                    <AlignRight className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => execCmd('justifyFull')}
                    title="Justificar"
                  >
                    <AlignJustify className="h-4 w-4" />
                  </Button>

                  <Separator orientation="vertical" className="h-6 mx-1" />

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => execCmd('insertUnorderedList')}
                    title="Lista com marcadores"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => execCmd('insertOrderedList')}
                    title="Lista numerada"
                  >
                    <ListOrdered className="h-4 w-4" />
                  </Button>

                  <Separator orientation="vertical" className="h-6 mx-1" />

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => execCmd('undo')}
                    title="Desfazer (Ctrl+Z)"
                  >
                    <Undo className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => execCmd('redo')}
                    title="Refazer"
                  >
                    <Redo className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => execCmd('removeFormat')}
                    title="Limpar formatação"
                  >
                    <Type className="h-4 w-4" />
                  </Button>

                  <Separator orientation="vertical" className="h-6 mx-1" />

                  {/* Quick insert dropdown */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-2"
                        title="Inserção rápida"
                      >
                        <Plus className="h-4 w-4" />
                        Inserção rápida
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-2" align="start">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground px-2 py-1">
                          Clique para inserir no cursor
                        </p>
                        <Separator />
                        <div className="max-h-72 overflow-y-auto space-y-0.5">
                          {quickInsertItems.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className="w-full text-left px-2 py-1.5 rounded hover:bg-accent transition-colors flex flex-col gap-0.5"
                              onClick={() => handleQuickInsert(item.value)}
                            >
                              <span className="text-xs font-medium">
                                {item.label}
                              </span>
                              <span className="text-[10px] text-muted-foreground truncate max-w-full">
                                {item.value}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* AI melhorar */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-2"
                    onClick={handleEnhanceText}
                    disabled={isEnhancing || isBusy}
                    title="Melhorar texto com IA"
                  >
                    {isEnhancing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Melhorar com IA
                  </Button>

                  {/* Modelo de outro paciente */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-2"
                    onClick={() => setTemplateOpen(true)}
                    title="Inserir relatório de outro paciente como modelo"
                  >
                    <FileSearch className="h-4 w-4" />
                    Modelo
                  </Button>

                  <div className="ml-auto flex items-center gap-2">
                    <Label htmlFor="report_date" className="text-xs">
                      Emissão:
                    </Label>
                    <Input
                      id="report_date"
                      type="date"
                      value={reportDate}
                      onChange={(e) => setReportDate(e.target.value)}
                      className="h-8 w-[150px] text-xs"
                    />
                  </div>
                </div>

                {/* Área do editor - look-and-feel "folha A4" */}
                <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-900/40 p-6">
                  <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={saveSelection}
                    onKeyUp={saveSelection}
                    onMouseUp={saveSelection}
                    className={cn(
                      'mx-auto bg-white text-slate-900 dark:bg-white dark:text-slate-900 shadow-md rounded-sm outline-none',
                      'leading-relaxed text-[15px]',
                      'focus:ring-2 focus:ring-primary/30'
                    )}
                    style={{
                      maxWidth: '21cm',
                      minHeight: '29.7cm',
                      padding: '2.5cm 2.5cm',
                      fontFamily:
                        '"Times New Roman", Georgia, "Segoe UI", system-ui, sans-serif',
                    }}
                    data-placeholder="Digite o relatório clínico aqui..."
                  />
                </div>

                {/* Rodapé */}
                <div className="border-t bg-background px-6 py-3 flex justify-between items-center gap-3 shrink-0">
                  <div className="text-xs text-muted-foreground">
                    Assinatura:{' '}
                    <strong className="text-foreground">
                      {professionalInfo.name}
                    </strong>
                    {!professionalInfo.signaturePath && (
                      <span className="ml-2 italic">
                        (sem carimbo no bucket - usará assinatura textual)
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={onClose}
                      disabled={isBusy}
                    >
                      Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={isBusy}>
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Salvar Relatório
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              // ============ Tela pós salvar ============
              <div className="flex-1 overflow-auto p-6 space-y-4">
                <Alert className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800 dark:text-green-200">
                    Relatório salvo com sucesso! Você pode exportar em PDF ou
                    enviar diretamente ao responsável.
                  </AlertDescription>
                </Alert>

                <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4" />
                    <strong>{patientName}</strong>
                  </div>
                  <div className="text-sm">
                    Data de emissão:{' '}
                    <strong>{formatDateBRFromISO(reportDate)}</strong>
                  </div>
                  <div className="text-sm">
                    Assinatura: <strong>{professionalInfo.name}</strong>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    onClick={handleExportPdf}
                    disabled={isBusy}
                    className="flex-1"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Gerando...
                      </>
                    ) : (
                      <>
                        <Printer className="h-4 w-4 mr-2" />
                        Exportar PDF
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleSendToResponsible}
                    disabled={isBusy}
                    className="flex-1"
                  >
                    {isSending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Enviar ao Responsável
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>

          {/* ============ Dialog secundário: busca de modelo ============ */}
          <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileSearch className="h-5 w-5" />
                  Inserir Relatório de Outro Paciente
                </DialogTitle>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto space-y-4 py-2">
                {!selectedTemplatePatient ? (
                  <>
                    <div className="space-y-2">
                      <Label className="text-sm">
                        Buscar paciente pelo nome
                      </Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          autoFocus
                          value={templateSearch}
                          onChange={(e) => setTemplateSearch(e.target.value)}
                          placeholder="Digite o nome do paciente..."
                          className="pl-9"
                        />
                      </div>
                    </div>

                    {isSearching && (
                      <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Buscando...
                      </div>
                    )}

                    {!isSearching &&
                      templateSearch.length >= 2 &&
                      templateResults.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Nenhum paciente encontrado
                        </p>
                      )}

                    {templateResults.length > 0 && (
                      <ScrollArea className="h-72 border rounded-md">
                        <div className="p-2 space-y-1">
                          {templateResults.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className="w-full text-left p-2 rounded-md hover:bg-accent transition-colors"
                              onClick={() => handlePickTemplatePatient(p)}
                            >
                              <div className="text-sm font-medium">
                                {p.nome}
                              </div>
                              {p.data_nascimento && (
                                <div className="text-xs text-muted-foreground">
                                  Nasc.:{' '}
                                  {formatDateBRFromISO(p.data_nascimento)}
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Paciente selecionado:
                        </p>
                        <p className="text-sm font-medium">
                          {selectedTemplatePatient.nome}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedTemplatePatient(null);
                          setTemplateReports([]);
                        }}
                      >
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Trocar
                      </Button>
                    </div>

                    {isLoadingTemplateReports && (
                      <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Carregando relatórios...
                      </div>
                    )}

                    {!isLoadingTemplateReports &&
                      templateReports.length === 0 && (
                        <Alert>
                          <AlertDescription className="text-sm">
                            Este paciente não possui relatórios salvos para usar
                            como modelo.
                          </AlertDescription>
                        </Alert>
                      )}

                    {templateReports.length > 0 && (
                      <ScrollArea className="h-72 border rounded-md">
                        <div className="p-2 space-y-2">
                          {templateReports.map((r) => (
                            <div
                              key={r.id}
                              className="border rounded-md p-3 hover:bg-accent/40 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <span className="text-xs text-muted-foreground">
                                  {formatDateBR(new Date(r.created_at))}
                                </span>
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => handleInsertTemplate(r)}
                                >
                                  Usar este
                                </Button>
                              </div>
                              {r.conteudo && (
                                <p className="text-xs text-muted-foreground line-clamp-3">
                                  {r.conteudo.replace(/<[^>]+>/g, '')}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </>
                )}
              </div>

              <div className="flex justify-end pt-3 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    setTemplateOpen(false);
                    setSelectedTemplatePatient(null);
                    setTemplateSearch('');
                    setTemplateResults([]);
                    setTemplateReports([]);
                  }}
                >
                  <X className="h-4 w-4 mr-1" />
                  Fechar
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Estilo do placeholder do editor */}
          <style
            dangerouslySetInnerHTML={{
              __html: `
                [contenteditable][data-placeholder]:empty::before {
                  content: attr(data-placeholder);
                  color: #94a3b8;
                  pointer-events: none;
                }
              `,
            }}
          />
        </Dialog>
      );
    }
  );

ManualClinicalReportGenerator.displayName = 'ManualClinicalReportGenerator';
