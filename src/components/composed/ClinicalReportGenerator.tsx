// AI dev note: ClinicalReportGenerator - Componente para geração de relatórios clínicos
// Substitui PatientMedicalReports com funcionalidade completa
// Permite selecionar evoluções, assinar com Bruna ou Flavia, e enviar ao responsável
// Usa fundo orcamento_fisio_capa.png do bucket Supabase

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Loader2,
  Printer,
  Send,
  User,
  Sparkles,
  AlertCircle,
  Eye,
  Save,
  PenLine,
  ArrowLeft,
  CheckCircle,
  Trash2,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Label } from '@/components/primitives/label';
import { Input } from '@/components/primitives/input';
import { Textarea } from '@/components/primitives/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { Badge } from '@/components/primitives/badge';
import { ScrollArea } from '@/components/primitives/scroll-area';
import { Separator } from '@/components/primitives/separator';
import { Checkbox } from '@/components/primitives/checkbox';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

// AI dev note: Interface para evoluções do paciente
interface PatientEvolution {
  id: string;
  tipo_evolucao: 'respiratoria' | 'motora_assimetria' | null;
  conteudo: string;
  created_at: string;
  consulta_data: string;
  profissional_nome: string;
  servico_nome: string;
}

// AI dev note: Interface para relatórios salvos
interface SavedReport {
  id: string;
  conteudo: string;
  pdf_url: string | null;
  created_at: string;
  criado_por_nome: string | null;
}

export interface ClinicalReportGeneratorProps {
  patientId: string;
  patientName: string;
  className?: string;
}

// URLs das imagens no Supabase Storage (bucket público)
const SUPABASE_STORAGE_URL =
  'https://jqegoentcusnbcykgtxg.supabase.co/storage/v1/object/public/respira-documents';

const BACKGROUND_IMAGE_URL = `${SUPABASE_STORAGE_URL}/orcamento_fisio_capa.png`;

// Profissionais disponíveis para assinar
const PROFESSIONALS = [
  {
    id: 'bruna',
    name: 'Bruna Cury',
    signatureFile: 'Bruna Cury.png',
    title: 'Fisioterapeuta',
    crefito: 'CREFITO 11-167135-F',
  },
  {
    id: 'flavia',
    name: 'Flavia Pacheco',
    signatureFile: 'Flavia Pacheco.png',
    title: 'Fisioterapeuta',
    crefito: '',
  },
];

// Formatar data brasileira
const formatDateBR = (date: Date): string => {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

// Formatar data por extenso
const formatDateExtended = (date: Date): string => {
  return date.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

export const ClinicalReportGenerator = React.memo<ClinicalReportGeneratorProps>(
  ({ patientId, patientName, className }) => {
    const { toast } = useToast();
    const { user } = useAuth();

    // Estados do componente
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoadingEvolutions, setIsLoadingEvolutions] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSending, setIsSending] = useState(false);

    // Estados para evoluções e seleção
    const [evolutions, setEvolutions] = useState<PatientEvolution[]>([]);
    const [selectedEvolutions, setSelectedEvolutions] = useState<Set<string>>(
      new Set()
    );
    const [selectedProfessional, setSelectedProfessional] =
      useState<string>('');
    const [reportDate, setReportDate] = useState<string>(
      new Date().toISOString().split('T')[0]
    );
    // AI dev note: Estado para contexto completo do paciente (anamnese, pediatra, etc.)
    const [patientContext, setPatientContext] = useState<{
      dataNascimento?: string;
      responsavelNome?: string;
      pediatraNome?: string;
      pediatraCRM?: string;
      anamnese?: string;
      observacoes?: string;
    }>({});

    // Estados para relatórios salvos
    const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
    const [isLoadingReports, setIsLoadingReports] = useState(true);

    // Estado para relatório gerado (para preview/envio)
    const [generatedReportData, setGeneratedReportData] = useState<{
      htmlContent: string;
      reportUrl: string | null;
    } | null>(null);

    // AI dev note: Estados para editor de relatório
    // Permite que o usuário edite o conteúdo gerado pela IA antes de salvar
    const [editorMode, setEditorMode] = useState<
      'configure' | 'editing' | 'saved'
    >('configure');
    // AI dev note: Agora usa um único campo de texto em vez de 3 seções separadas
    const [editableContent, setEditableContent] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const userRole = user?.pessoa?.role as
      | 'admin'
      | 'profissional'
      | 'secretaria'
      | null;
    const isAdmin = userRole === 'admin';
    const canGenerateReports =
      userRole === 'admin' || userRole === 'secretaria';

    // Carregar relatórios salvos ao montar
    useEffect(() => {
      loadSavedReports();
    }, [patientId]);

    // Carregar evoluções e contexto do paciente quando o modal abre
    useEffect(() => {
      if (isModalOpen) {
        loadEvolutions();
        loadPatientContext();
      } else {
        // Reset state when modal closes
        setSelectedEvolutions(new Set());
        setSelectedProfessional('');
        setReportDate(new Date().toISOString().split('T')[0]);
        setGeneratedReportData(null);
        setPatientContext({});
        setEditorMode('configure');
        setEditableContent('');
      }
    }, [isModalOpen, patientId]);

    // Carregar contexto completo do paciente (anamnese, pediatra, observações)
    const loadPatientContext = async () => {
      try {
        // Buscar dados da view e da tabela pessoas (para anamnese/observações)
        const [viewResult, pessoaResult] = await Promise.all([
          supabase
            .from('pacientes_com_responsaveis_view')
            .select(
              `
              data_nascimento,
              responsavel_legal_nome,
              responsavel_financeiro_nome,
              nomes_responsaveis,
              pediatras_nomes,
              pediatras_crms
            `
            )
            .eq('id', patientId)
            .single(),
          supabase
            .from('pessoas')
            .select('anamnese, observacoes')
            .eq('id', patientId)
            .single(),
        ]);

        if (viewResult.error) {
          console.warn(
            'Erro ao buscar contexto do paciente:',
            viewResult.error
          );
          return;
        }

        const data = viewResult.data;
        const pessoaData = pessoaResult.data;

        if (data) {
          setPatientContext({
            dataNascimento: data.data_nascimento || undefined,
            // Priorizar nomes_responsaveis (todos), senão usar legal ou financeiro
            responsavelNome:
              data.nomes_responsaveis ||
              data.responsavel_legal_nome ||
              data.responsavel_financeiro_nome ||
              undefined,
            pediatraNome: data.pediatras_nomes || undefined,
            pediatraCRM: data.pediatras_crms || undefined,
            anamnese: pessoaData?.anamnese || undefined,
            observacoes: pessoaData?.observacoes || undefined,
          });
        }
      } catch (err) {
        console.warn('Erro ao carregar contexto:', err);
      }
    };

    const loadSavedReports = async () => {
      try {
        setIsLoadingReports(true);

        // Buscar tipo de relatório 'relatorio_medico'
        const { data: tipoData, error: tipoError } = await supabase
          .from('relatorios_tipo')
          .select('id')
          .eq('codigo', 'relatorio_medico')
          .single();

        if (tipoError) {
          console.error('Erro ao buscar tipo relatório:', tipoError);
          setSavedReports([]);
          return;
        }

        // Buscar relatórios do paciente
        const { data, error: fetchError } = await supabase
          .from('relatorios_medicos')
          .select(
            `
            id,
            conteudo,
            pdf_url,
            created_at,
            criado_por_pessoa:pessoas!relatorios_medicos_criado_por_fkey(nome)
          `
          )
          .eq('id_pessoa', patientId)
          .eq('tipo_relatorio_id', tipoData.id)
          .eq('ativo', true)
          .order('created_at', { ascending: false });

        if (fetchError) {
          console.error('Erro ao buscar relatórios:', fetchError);
          setSavedReports([]);
          return;
        }

        const reports: SavedReport[] = (data || []).map((item) => ({
          id: item.id,
          conteudo: item.conteudo,
          pdf_url: item.pdf_url,
          created_at: item.created_at,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          criado_por_nome: (item.criado_por_pessoa as any)?.nome || null,
        }));

        setSavedReports(reports);
      } catch (err) {
        console.error('Erro ao carregar relatórios:', err);
        setSavedReports([]);
      } finally {
        setIsLoadingReports(false);
      }
    };

    const loadEvolutions = async () => {
      try {
        setIsLoadingEvolutions(true);

        // AI dev note: Buscar apenas consultas FINALIZADAS do paciente
        // Não incluir canceladas, faltou, reagendado, etc.
        const { data, error: fetchError } = await supabase
          .from('vw_agendamentos_completos')
          .select('id, data_hora, profissional_nome, servico_nome')
          .eq('paciente_id', patientId)
          .eq('status_consulta_codigo', 'finalizado')
          .order('data_hora', { ascending: false });

        if (fetchError) {
          console.error('Erro ao buscar agendamentos:', fetchError);
          setEvolutions([]);
          return;
        }

        if (!data || data.length === 0) {
          setEvolutions([]);
          return;
        }

        const agendamentoIds = data.map((a) => a.id);
        const agendamentoMap = new Map(data.map((a) => [a.id, a]));

        // AI dev note: Buscar ID do tipo 'evolucao' para filtrar APENAS evoluções clínicas
        // NÃO incluir historico_evolucao ou relatorio_compilado_evolucoes
        const { data: tipoData, error: tipoError } = await supabase
          .from('relatorios_tipo')
          .select('id')
          .eq('codigo', 'evolucao')
          .single();

        if (tipoError || !tipoData) {
          console.error('Erro ao buscar tipo evolucao:', tipoError);
          setEvolutions([]);
          return;
        }

        // Buscar APENAS evoluções clínicas (tipo='evolucao'), não históricos
        const { data: evolData, error: evolError } = await supabase
          .from('relatorio_evolucao')
          .select('id, id_agendamento, tipo_evolucao, conteudo, created_at')
          .in('id_agendamento', agendamentoIds)
          .eq('tipo_relatorio_id', tipoData.id) // AI dev note: Filtrar apenas tipo 'evolucao'
          .not('conteudo', 'is', null)
          .order('created_at', { ascending: false });

        if (evolError) {
          console.error('Erro ao buscar evoluções:', evolError);
          setEvolutions([]);
          return;
        }

        // Mapear evoluções com dados do agendamento
        const evols: PatientEvolution[] = (evolData || []).map((e) => {
          const agendamento = agendamentoMap.get(e.id_agendamento);
          return {
            id: e.id,
            tipo_evolucao: e.tipo_evolucao as
              | 'respiratoria'
              | 'motora_assimetria'
              | null,
            conteudo: e.conteudo,
            created_at: e.created_at,
            consulta_data: agendamento?.data_hora || e.created_at,
            profissional_nome:
              agendamento?.profissional_nome || 'Não informado',
            servico_nome: agendamento?.servico_nome || 'Não informado',
          };
        });

        setEvolutions(evols);
      } catch (err) {
        console.error('Erro ao carregar evoluções:', err);
        setEvolutions([]);
      } finally {
        setIsLoadingEvolutions(false);
      }
    };

    const toggleEvolutionSelection = (id: string) => {
      setSelectedEvolutions((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
        return newSet;
      });
    };

    const selectAllEvolutions = () => {
      if (selectedEvolutions.size === evolutions.length) {
        setSelectedEvolutions(new Set());
      } else {
        setSelectedEvolutions(new Set(evolutions.map((e) => e.id)));
      }
    };

    // AI dev note: Gera HTML do relatório clínico com conteúdo da IA
    const generateReportHTML = (
      selectedEvols: PatientEvolution[],
      professional: (typeof PROFESSIONALS)[0],
      reportDateStr: string,
      aiSummary: string,
      generatedBy?: string,
      patientData?: {
        dataNascimento?: string;
        responsavelNome?: string;
        pediatraNome?: string;
        pediatraCRM?: string;
      }
    ): string => {
      const signatureUrl = `${SUPABASE_STORAGE_URL}/${encodeURIComponent(professional.signatureFile)}`;
      const reportDateObj = new Date(reportDateStr + 'T12:00:00');
      const hoje = formatDateExtended(reportDateObj);
      const agora = new Date();
      const geradoEm = `${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

      // Ordenar evoluções por data
      const sortedEvols = [...selectedEvols].sort(
        (a, b) =>
          new Date(a.consulta_data).getTime() -
          new Date(b.consulta_data).getTime()
      );

      // Gerar lista de datas dos atendimentos agrupadas por ano
      const datesByYear: Record<string, string[]> = {};
      sortedEvols.forEach((evol) => {
        const date = new Date(evol.consulta_data);
        const year = date.getFullYear().toString();
        const dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!datesByYear[year]) {
          datesByYear[year] = [];
        }
        if (!datesByYear[year].includes(dateStr)) {
          datesByYear[year].push(dateStr);
        }
      });

      const datesHTML = Object.entries(datesByYear)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(
          ([year, dates]) => `<strong>${year}:</strong> ${dates.join(', ')}.`
        )
        .join('<br>');

      // Formatar conteúdo da IA com melhor estrutura HTML
      // Processar markdown-like para HTML
      let contentHTML = aiSummary
        // Converter **texto** para <strong>texto</strong> (negrito markdown)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        // Converter ## Título para h3 (markdown headers)
        .replace(/^##\s*(.+)$/gm, '\n<h3 class="section-subtitle">$1</h3>\n')
        // Títulos das seções sem ## (reconhecer variações por nome)
        .replace(
          /^(Histórico e Encaminhamento|Evolução e Importância da Fisioterapia Respiratória|Evolução e Importância|Proposta [Tt]erapêutica:?|Proposta [Tt]erapêutica)[\s:]*$/gm,
          '\n<h3 class="section-subtitle">$1</h3>\n'
        )
        // Listas com "-" ou "•"
        .replace(/\n[-•]\s*([^\n]+)/g, '\n<li>$1</li>')
        // Agrupar <li> consecutivos em <ul>
        .replace(/(<li>.*<\/li>\n?)+/gs, '<ul>$&</ul>')
        // Parágrafos (duas quebras de linha)
        .replace(/\n\n+/g, '</p>\n<p>')
        // Quebras simples
        .replace(/\n(?!<)/g, '<br>\n');

      // Limpar tags vazias e ajustar estrutura
      contentHTML = '<p>' + contentHTML + '</p>';
      contentHTML = contentHTML
        .replace(/<p>\s*<\/p>/g, '') // Remover parágrafos vazios
        .replace(/<p>\s*<h3/g, '<h3') // Não envolver títulos em <p>
        .replace(/<\/h3>\s*<\/p>/g, '</h3>') // Fechar corretamente
        .replace(/<p>\s*<ul>/g, '<ul>') // Não envolver listas em <p>
        .replace(/<\/ul>\s*<\/p>/g, '</ul>'); // Fechar corretamente

      // Período do relatório
      const firstDate =
        sortedEvols.length > 0
          ? new Date(sortedEvols[0].consulta_data)
          : new Date();
      const lastDate =
        sortedEvols.length > 0
          ? new Date(sortedEvols[sortedEvols.length - 1].consulta_data)
          : new Date();
      const periodoStr = `${formatDateBR(firstDate)} a ${formatDateBR(lastDate)}`;

      // Info do paciente formatada
      const patientDOB = patientData?.dataNascimento
        ? formatDateBR(new Date(patientData.dataNascimento + 'T12:00:00'))
        : null;
      const responsavelNome = patientData?.responsavelNome;

      return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Relatório Clínico - ${patientName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Poppins', sans-serif;
      background: white;
      color: #333;
      line-height: 1.7;
      font-size: 11pt;
    }
    
    /* AI dev note: Container principal com margens laterais maiores */
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      position: relative;
      padding: 0;
    }
    
    /* AI dev note: Imagem de fundo do cabeçalho - apenas primeira página */
    .header-bg {
      width: 100%;
      height: 38mm;
      background-image: url('${BACKGROUND_IMAGE_URL}');
      background-size: cover;
      background-position: top center;
      background-repeat: no-repeat;
    }
    
    /* AI dev note: Conteúdo principal com margens laterais aumentadas */
    .main-content {
      padding: 8mm 25mm 20mm 25mm;
    }
    
    .header {
      text-align: center;
      margin-bottom: 15px;
    }
    
    .title {
      font-size: 20pt;
      font-weight: 700;
      color: #1a365d;
      margin-bottom: 3px;
    }
    
    .subtitle {
      font-size: 11pt;
      color: #40C4AA;
      font-weight: 500;
    }
    
    .patient-info {
      background: #f0fdf4;
      border-left: 4px solid #40C4AA;
      padding: 12px 15px;
      margin-bottom: 20px;
      border-radius: 0 6px 6px 0;
    }
    
    .patient-info p {
      margin: 3px 0;
      font-size: 10pt;
    }
    
    .patient-info strong {
      color: #1a365d;
    }
    
    .content-section {
      margin-bottom: 20px;
      text-align: justify;
    }
    
    .content-section p {
      margin-bottom: 10px;
      text-indent: 20px;
    }
    
    .section-subtitle {
      font-size: 12pt;
      font-weight: 700;
      color: #1a365d;
      margin: 20px 0 10px 0;
      padding-bottom: 4px;
      border-bottom: 2px solid #40C4AA;
      text-indent: 0 !important;
    }
    
    .content-section ul {
      margin: 10px 0 15px 30px;
      padding-left: 0;
      list-style-type: disc;
    }
    
    .content-section li {
      margin-bottom: 6px;
      text-indent: 0;
      line-height: 1.5;
    }
    
    .dates-section {
      margin-top: 20px;
      padding: 12px 15px;
      background: #f8fafc;
      border-radius: 6px;
      font-size: 9pt;
      line-height: 1.6;
    }
    
    .dates-section h3 {
      font-size: 10pt;
      font-weight: 600;
      color: #1a365d;
      margin-bottom: 8px;
      text-decoration: underline;
    }
    
    .signature-section {
      margin-top: 30px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    
    .signature-image {
      max-width: 180px;
      max-height: 90px;
      object-fit: contain;
    }
    
    .signature-info {
      margin-top: 8px;
      font-size: 10pt;
      color: #1a365d;
    }
    
    .signature-name {
      font-weight: 600;
    }
    
    .signature-title {
      font-size: 9pt;
      color: #64748b;
    }
    
    .location-date {
      margin-top: 12px;
      font-size: 10pt;
      color: #666;
    }
    
    .audit-section {
      margin-top: 25px;
      text-align: right;
      font-size: 7pt;
      color: #aaa;
      font-style: italic;
    }
    
    /* Rodapé da primeira página */
    .page-footer {
      text-align: center;
      font-size: 8pt;
      color: #40C4AA;
      margin-top: 20px;
      padding-top: 10px;
      border-top: 1px solid #e0e0e0;
    }
    
    /* Elementos para impressão - escondidos na tela */
    .print-header {
      display: none;
    }
    
    .print-footer {
      display: none;
    }
    
    /* Estilos para visualização em tela */
    @media screen {
      .page {
        box-shadow: 0 0 10px rgba(0,0,0,0.1);
        margin-bottom: 20px;
      }
    }
    
    /* AI dev note: CSS para impressão - SEM header/footer fixo, apenas margens adequadas */
    @media print {
      @page {
        size: A4;
        margin: 15mm 20mm 15mm 20mm;
      }
      
      html, body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        margin: 0;
        padding: 0;
      }
      
      .page {
        width: 100%;
        min-height: auto;
        margin: 0;
        padding: 0;
      }
      
      /* Imagem de fundo visível na impressão */
      .header-bg {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* AI dev note: DESABILITAR header/footer fixo - causa sobreposição */
      .print-header {
        display: none !important;
      }
      
      .print-footer {
        display: none !important;
      }
      
      /* Conteúdo com padding lateral adequado */
      .main-content {
        padding: 5mm 15mm 20mm 15mm;
        margin-top: 0;
      }
      
      /* Esconder o footer HTML da primeira página na impressão */
      .page-footer {
        display: none;
      }
      
      /* Evitar quebras ruins */
      .patient-info {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      
      .section-subtitle {
        break-after: avoid;
        page-break-after: avoid;
      }
      
      .signature-section {
        break-inside: avoid;
        page-break-inside: avoid;
        margin-bottom: 10mm;
      }
      
      .dates-section {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      
      .audit-section {
        break-inside: avoid;
        page-break-inside: avoid;
        margin-bottom: 5mm;
      }
    }
  </style>
</head>
<body>
  <!-- AI dev note: Barra verde fixa para impressão - só "Relatório Clínico" no canto direito -->
  <div class="print-header">
    <div class="print-header-content">
      <span class="print-header-text">Relatório Clínico</span>
    </div>
  </div>
  
  <!-- Rodapé fixo para impressão - apenas o site -->
  <div class="print-footer">
    www.respirakids.com.br
  </div>

  <div class="page">
    <!-- Imagem de fundo do cabeçalho (logo Respira Kids) -->
    <div class="header-bg"></div>
    
    <div class="main-content">
      <div class="header">
        <h1 class="title">Relatório Clínico</h1>
        <p class="subtitle">Fisioterapia Pediátrica</p>
      </div>
      
      <div class="patient-info">
        <p><strong>Paciente:</strong> ${patientName}</p>
        ${patientDOB ? `<p><strong>Data de Nascimento:</strong> ${patientDOB}</p>` : ''}
        ${responsavelNome ? `<p><strong>Responsável:</strong> ${responsavelNome}</p>` : ''}
        ${patientData?.pediatraNome ? `<p><strong>Pediatra:</strong> ${patientData.pediatraNome}${patientData.pediatraCRM && patientData.pediatraCRM !== 'Não informado' ? ` (CRM: ${patientData.pediatraCRM})` : ''}</p>` : ''}
        <p><strong>Período do Relatório:</strong> ${periodoStr}</p>
      </div>
      
      <div class="content-section">
        ${contentHTML}
      </div>
      
      ${
        sortedEvols.length > 0
          ? `
      <div class="dates-section">
        <h3>Datas dos Atendimentos Realizados</h3>
        ${datesHTML}
      </div>
      `
          : ''
      }
      
      <div class="signature-section">
        <img src="${signatureUrl}" alt="Assinatura ${professional.name}" class="signature-image" />
        <div class="signature-info">
          <div class="signature-name">${professional.name}</div>
          <div class="signature-title">${professional.title}${professional.crefito ? ` - ${professional.crefito}` : ''}</div>
        </div>
        <div class="location-date">
          Brasília, ${hoje}
        </div>
      </div>
      
      <div class="audit-section">
        Documento gerado por ${generatedBy || 'Sistema'} em ${geradoEm}
      </div>
      
      <div class="page-footer">
        www.respirakids.com.br
      </div>
    </div>
  </div>
</body>
</html>
      `;
    };

    const handleGenerateReport = async () => {
      if (selectedEvolutions.size === 0) {
        toast({
          title: 'Atenção',
          description: 'Selecione pelo menos uma evolução para o relatório',
          variant: 'destructive',
        });
        return;
      }

      if (!selectedProfessional) {
        toast({
          title: 'Atenção',
          description: 'Selecione o profissional que assinará o relatório',
          variant: 'destructive',
        });
        return;
      }

      setIsGenerating(true);

      try {
        const professional = PROFESSIONALS.find(
          (p) => p.id === selectedProfessional
        );
        if (!professional) throw new Error('Profissional não encontrado');

        // AI dev note: SEMPRE usar IA para gerar relatório narrativo
        toast({
          title: 'Gerando relatório com IA...',
          description: 'Isso pode levar alguns segundos',
        });

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        // AI dev note: Passar contexto completo para a IA (anamnese, observações, etc.)
        const response = await fetch(
          `${supabaseUrl}/functions/v1/patient-history-ai`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({
              patientId,
              userId: user?.pessoa?.id,
              maxCharacters: 5000, // Limite maior para relatório completo
              // Passar contexto adicional para enriquecer o relatório
              patientContext: {
                nome: patientName,
                dataNascimento: patientContext.dataNascimento,
                responsavel: patientContext.responsavelNome,
                pediatra: patientContext.pediatraNome,
                anamnese: patientContext.anamnese,
                observacoes: patientContext.observacoes,
              },
              // IDs das evoluções selecionadas para filtrar
              evolutionIds: Array.from(selectedEvolutions),
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Erro na resposta da IA');
        }

        const result = await response.json();
        if (!result.success || !result.history) {
          throw new Error(result.error || 'Erro na geração do relatório');
        }

        const aiSummary = result.history;

        // AI dev note: Setar o conteúdo editável diretamente (um único campo)
        setEditableContent(aiSummary.trim());
        setEditorMode('editing');

        toast({
          title: 'Relatório gerado!',
          description:
            'Revise e edite o conteúdo conforme necessário antes de salvar.',
        });
      } catch (err) {
        console.error('Erro ao gerar relatório:', err);
        toast({
          title: 'Erro',
          description:
            err instanceof Error ? err.message : 'Erro ao gerar relatório',
          variant: 'destructive',
        });
      } finally {
        setIsGenerating(false);
      }
    };

    // AI dev note: Função para salvar o relatório editado
    const handleSaveReport = async () => {
      if (!selectedProfessional) {
        toast({
          title: 'Atenção',
          description: 'Selecione o profissional que assinará o relatório',
          variant: 'destructive',
        });
        return;
      }

      setIsSaving(true);

      try {
        const professional = PROFESSIONALS.find(
          (p) => p.id === selectedProfessional
        );
        if (!professional) throw new Error('Profissional não encontrado');

        const selectedEvols = evolutions.filter((e) =>
          selectedEvolutions.has(e.id)
        );

        // AI dev note: Usar o conteúdo editado diretamente (único campo)
        const combinedContent = editableContent.trim();

        // Gerar HTML final com o conteúdo editado
        const htmlContent = generateReportHTML(
          selectedEvols,
          professional,
          reportDate,
          combinedContent,
          user?.pessoa?.nome || 'Sistema',
          {
            dataNascimento: patientContext.dataNascimento,
            responsavelNome: patientContext.responsavelNome,
            pediatraNome: patientContext.pediatraNome,
            pediatraCRM: patientContext.pediatraCRM,
          }
        );

        // Upload do HTML para o storage
        const timestamp = Date.now();
        const fileName = `relatorio_clinico_${patientId}_${timestamp}.html`;
        const filePath = `relatorios/${patientId}/${fileName}`;

        // AI dev note: Usar Blob em vez de File para melhor compatibilidade com mobile
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });

        const { error: uploadError } = await supabase.storage
          .from('respira-documents')
          .upload(filePath, htmlBlob, {
            upsert: true,
            contentType: 'text/html',
          });

        if (uploadError) {
          console.error('Erro no upload:', uploadError);
          throw new Error(`Erro ao fazer upload: ${uploadError.message}`);
        }

        // Obter URL pública
        const {
          data: { publicUrl },
        } = supabase.storage.from('respira-documents').getPublicUrl(filePath);

        // Salvar no banco de dados
        const { data: tipoData, error: tipoError } = await supabase
          .from('relatorios_tipo')
          .select('id')
          .eq('codigo', 'relatorio_medico')
          .single();

        if (tipoError) {
          console.error('Erro ao buscar tipo de relatório:', tipoError);
          throw new Error('Tipo de relatório não encontrado');
        }

        const periodoStr =
          selectedEvols.length > 0
            ? `${formatDateBR(new Date(selectedEvols[0]?.consulta_data || new Date()))} a ${formatDateBR(new Date(selectedEvols[selectedEvols.length - 1]?.consulta_data || new Date()))}`
            : formatDateBR(new Date());

        // AI dev note: Preparar dados para inserção, tratando criado_por como opcional
        const insertData = {
          id_pessoa: patientId,
          tipo_relatorio_id: tipoData.id,
          conteudo: `Relatório clínico com ${selectedEvols.length} evolução(ões). Período: ${periodoStr}. Assinado por: ${professional.name}. Data de emissão: ${formatDateBR(new Date(reportDate + 'T12:00:00'))}`,
          pdf_url: publicUrl,
          transcricao: false,
          ativo: true,
          ...(user?.pessoa?.id && { criado_por: user.pessoa.id }),
        };

        const { error: saveError } = await supabase
          .from('relatorios_medicos')
          .insert(insertData);

        if (saveError) {
          console.error('Erro ao salvar relatório no banco:', saveError);
          throw new Error(
            `Erro ao salvar no banco de dados: ${saveError.message}`
          );
        }

        setGeneratedReportData({
          htmlContent,
          reportUrl: publicUrl,
        });

        setEditorMode('saved');

        toast({
          title: 'Sucesso!',
          description:
            'Relatório salvo com sucesso. Agora você pode exportar em PDF ou enviar.',
        });

        // Recarregar lista de relatórios
        await loadSavedReports();
      } catch (err) {
        console.error('Erro ao salvar relatório:', err);
        toast({
          title: 'Erro',
          description:
            err instanceof Error ? err.message : 'Erro ao salvar relatório',
          variant: 'destructive',
        });
      } finally {
        setIsSaving(false);
      }
    };

    const handlePrint = () => {
      if (!generatedReportData?.htmlContent) return;

      // Abrir nova janela e escrever o HTML diretamente para renderização correta
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(generatedReportData.htmlContent);
        printWindow.document.close();
        // Aguardar carregamento das imagens antes de imprimir
        setTimeout(() => {
          printWindow.print();
        }, 1000);
      }
    };

    const handleSendToResponsible = async () => {
      if (!generatedReportData?.reportUrl) {
        toast({
          title: 'Atenção',
          description: 'Gere o relatório primeiro antes de enviar',
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

        const professional = PROFESSIONALS.find(
          (p) => p.id === selectedProfessional
        );

        // Montar payload do webhook
        const webhookPayload = {
          evento: 'relatorio_clinico_gerado',
          payload: {
            tipo: 'relatorio_clinico_gerado',
            timestamp: new Date().toISOString(),
            webhook_id: crypto.randomUUID(),
            data: {
              paciente: {
                id: patientId,
                nome: patientName,
              },
              responsavel_legal: {
                nome: patientData.responsavel_legal_nome,
                telefone: patientData.responsavel_legal_telefone,
                email: patientData.responsavel_legal_email || null,
              },
              relatorio: {
                url: generatedReportData.reportUrl,
                data_emissao: reportDate,
                profissional: professional?.name || 'Não informado',
                total_evolucoes: selectedEvolutions.size,
              },
            },
          },
        };

        // Enfileirar webhook (seguindo mesmo padrão do orçamento)
        const { error: webhookError } = await supabase
          .from('webhook_queue')
          .insert(webhookPayload);

        if (webhookError) {
          console.error('Erro ao enfileirar webhook:', webhookError);
          throw new Error('Erro ao enviar para o responsável');
        }

        toast({
          title: 'Enviado!',
          description: 'O relatório foi enviado ao responsável',
        });

        setIsModalOpen(false);
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
    };

    const handleViewReport = async (url: string) => {
      try {
        // Buscar o conteúdo HTML do relatório
        const response = await fetch(url);
        const htmlContent = await response.text();

        // Abrir nova janela e escrever o HTML diretamente
        const viewWindow = window.open('', '_blank');
        if (viewWindow) {
          viewWindow.document.write(htmlContent);
          viewWindow.document.close();
        }
      } catch (err) {
        console.error('Erro ao abrir relatório:', err);
        toast({
          title: 'Erro',
          description: 'Não foi possível abrir o relatório',
          variant: 'destructive',
        });
      }
    };

    // AI dev note: Função para imprimir/gerar PDF de um relatório salvo
    const handlePrintSavedReport = async (url: string) => {
      try {
        const response = await fetch(url);
        const htmlContent = await response.text();

        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(htmlContent);
          printWindow.document.close();
          setTimeout(() => {
            printWindow.print();
          }, 1000);
        }
      } catch (err) {
        console.error('Erro ao imprimir relatório:', err);
        toast({
          title: 'Erro',
          description: 'Não foi possível imprimir o relatório',
          variant: 'destructive',
        });
      }
    };

    // AI dev note: Função para enviar relatório salvo ao responsável via webhook
    const handleSendSavedReport = async (reportUrl: string) => {
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

        // Montar payload do webhook
        const webhookPayload = {
          evento: 'relatorio_clinico_gerado',
          payload: {
            tipo: 'relatorio_clinico_gerado',
            timestamp: new Date().toISOString(),
            webhook_id: crypto.randomUUID(),
            data: {
              paciente: {
                id: patientId,
                nome: patientName,
              },
              responsavel_legal: {
                nome: patientData.responsavel_legal_nome,
                telefone: patientData.responsavel_legal_telefone,
                email: patientData.responsavel_legal_email || null,
              },
              relatorio: {
                url: reportUrl,
              },
            },
          },
        };

        // Enfileirar webhook
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
    };

    // AI dev note: Função para excluir relatório - APENAS ADMIN pode executar
    const handleDeleteReport = async (reportId: string) => {
      if (!isAdmin) {
        toast({
          title: 'Acesso negado',
          description: 'Apenas administradores podem excluir relatórios',
          variant: 'destructive',
        });
        return;
      }

      if (!window.confirm('Tem certeza que deseja excluir este relatório?')) {
        return;
      }

      try {
        const { error } = await supabase
          .from('relatorios_medicos')
          .update({ ativo: false }) // Soft delete
          .eq('id', reportId);

        if (error) {
          console.error('Erro ao excluir relatório:', error);
          throw new Error('Erro ao excluir relatório');
        }

        toast({
          title: 'Relatório excluído',
          description: 'O relatório foi removido com sucesso',
        });

        // Recarregar lista
        await loadSavedReports();
      } catch (err) {
        console.error('Erro ao excluir relatório:', err);
        toast({
          title: 'Erro',
          description:
            err instanceof Error ? err.message : 'Erro ao excluir relatório',
          variant: 'destructive',
        });
      }
    };

    return (
      <>
        <Card className={cn('w-full', className)}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Relatórios Clínicos
              </CardTitle>
              {canGenerateReports && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsModalOpen(true)}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Gerar Relatório
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Loading State */}
            {isLoadingReports && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Empty State */}
            {!isLoadingReports && savedReports.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p className="text-sm">
                  Nenhum relatório clínico gerado ainda.
                </p>
                {canGenerateReports && (
                  <p className="text-xs mt-1">
                    Clique em "Gerar Relatório" para criar um novo.
                  </p>
                )}
              </div>
            )}

            {/* Lista de Relatórios */}
            {!isLoadingReports && savedReports.length > 0 && (
              <div className="space-y-3">
                {savedReports.map((report, index) => (
                  <div
                    key={report.id}
                    className="border rounded-lg p-4 space-y-2 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="font-medium text-sm">
                          Relatório #{savedReports.length - index}
                        </span>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {formatDateBR(new Date(report.created_at))}
                      </Badge>
                    </div>

                    <div className="text-xs text-muted-foreground space-y-1">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>
                          Gerado por:{' '}
                          <strong className="text-foreground">
                            {report.criado_por_nome || 'Sistema'}
                          </strong>
                          {' em '}
                          {new Date(report.created_at).toLocaleDateString(
                            'pt-BR'
                          )}{' '}
                          às{' '}
                          {new Date(report.created_at).toLocaleTimeString(
                            'pt-BR',
                            {
                              hour: '2-digit',
                              minute: '2-digit',
                            }
                          )}
                        </span>
                      </div>
                    </div>

                    {report.conteudo && (
                      <>
                        <Separator />
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {report.conteudo}
                        </p>
                      </>
                    )}

                    <div className="flex gap-2 pt-2 flex-wrap">
                      {report.pdf_url && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewReport(report.pdf_url!)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handlePrintSavedReport(report.pdf_url!)
                            }
                          >
                            <Printer className="h-4 w-4 mr-1" />
                            PDF
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() =>
                              handleSendSavedReport(report.pdf_url!)
                            }
                            disabled={isSending}
                          >
                            <Send className="h-4 w-4 mr-1" />
                            Enviar
                          </Button>
                          {/* AI dev note: Botão de excluir - APENAS para admins */}
                          {isAdmin && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteReport(report.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal de Geração de Relatório */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editorMode === 'configure' && (
                  <>
                    <FileText className="h-5 w-5 text-primary" />
                    Gerar Relatório Clínico
                  </>
                )}
                {editorMode === 'editing' && (
                  <>
                    <PenLine className="h-5 w-5 text-primary" />
                    Editar Relatório
                  </>
                )}
                {editorMode === 'saved' && (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    Relatório Salvo
                  </>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-4 py-4">
              {/* MODO: CONFIGURAÇÃO */}
              {editorMode === 'configure' && (
                <>
                  {/* Info do Paciente */}
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
                    <p className="font-medium text-blue-800 dark:text-blue-200">
                      {patientName}
                    </p>
                  </div>

                  {/* Seleção de Evoluções */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">
                        Evoluções a incluir *
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={selectAllEvolutions}
                        disabled={evolutions.length === 0}
                      >
                        {selectedEvolutions.size === evolutions.length
                          ? 'Desmarcar todas'
                          : 'Selecionar todas'}
                      </Button>
                    </div>

                    {isLoadingEvolutions ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Carregando evoluções...
                      </div>
                    ) : evolutions.length === 0 ? (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Este paciente não possui evoluções clínicas
                          registradas.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <ScrollArea className="h-40 border rounded-md p-2">
                        <div className="space-y-2">
                          {evolutions.map((evol) => {
                            const evolDate = new Date(evol.consulta_data);
                            const isSelected = selectedEvolutions.has(evol.id);

                            return (
                              <div
                                key={evol.id}
                                className={cn(
                                  'flex items-start gap-3 p-2 rounded-md cursor-pointer transition-colors',
                                  isSelected
                                    ? 'bg-primary/10'
                                    : 'hover:bg-accent/50'
                                )}
                                onClick={() =>
                                  toggleEvolutionSelection(evol.id)
                                }
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() =>
                                    toggleEvolutionSelection(evol.id)
                                  }
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {formatDateBR(evolDate)}
                                    </Badge>
                                    <Badge
                                      variant={
                                        evol.tipo_evolucao === 'respiratoria'
                                          ? 'default'
                                          : 'secondary'
                                      }
                                      className="text-xs"
                                    >
                                      {evol.tipo_evolucao === 'respiratoria'
                                        ? 'Respiratória'
                                        : evol.tipo_evolucao ===
                                            'motora_assimetria'
                                          ? 'Motora'
                                          : 'Geral'}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1 truncate">
                                    {evol.profissional_nome} •{' '}
                                    {evol.servico_nome}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    )}

                    {selectedEvolutions.size > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {selectedEvolutions.size} evolução(ões) selecionada(s)
                      </p>
                    )}
                  </div>

                  {/* Info: Relatório editável */}
                  <div className="p-3 bg-violet-50 dark:bg-violet-950/30 rounded-md border border-violet-200 dark:border-violet-800 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-violet-600 flex-shrink-0" />
                    <p className="text-sm text-violet-700 dark:text-violet-300">
                      A IA irá gerar o conteúdo e você poderá{' '}
                      <strong>editar antes de salvar</strong>.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Data do Relatório */}
                    <div className="space-y-2">
                      <Label htmlFor="reportDate">Data de Emissão *</Label>
                      <Input
                        id="reportDate"
                        type="date"
                        value={reportDate}
                        onChange={(e) => setReportDate(e.target.value)}
                      />
                    </div>

                    {/* Seleção de Profissional */}
                    <div className="space-y-2">
                      <Label htmlFor="professional">Assinatura *</Label>
                      <Select
                        value={selectedProfessional}
                        onValueChange={setSelectedProfessional}
                      >
                        <SelectTrigger id="professional">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {PROFESSIONALS.map((prof) => (
                            <SelectItem key={prof.id} value={prof.id}>
                              <span>{prof.name}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              {/* MODO: EDIÇÃO */}
              {editorMode === 'editing' && (
                <>
                  {/* Info do paciente compacta */}
                  <div className="p-2 bg-muted rounded-md flex items-center justify-between">
                    <span className="text-sm font-medium">{patientName}</span>
                    <Badge variant="outline">
                      {selectedEvolutions.size} evoluções
                    </Badge>
                  </div>

                  {/* AI dev note: Editor único para todo o conteúdo do relatório */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <PenLine className="h-4 w-4 text-primary" />
                      Conteúdo do Relatório
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Edite o texto abaixo conforme necessário. Mantenha os
                      títulos das seções (Histórico, Evolução, Proposta) para
                      melhor formatação.
                    </p>
                    <Textarea
                      value={editableContent}
                      onChange={(e) => setEditableContent(e.target.value)}
                      placeholder="Conteúdo do relatório clínico..."
                      className="min-h-[400px] resize-y font-mono text-sm"
                    />
                  </div>
                </>
              )}

              {/* MODO: SALVO */}
              {editorMode === 'saved' && (
                <div className="space-y-4">
                  <Alert className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800 dark:text-green-200">
                      Relatório de <strong>{patientName}</strong> salvo com
                      sucesso! Agora você pode exportar em PDF ou enviar ao
                      responsável.
                    </AlertDescription>
                  </Alert>

                  {/* Preview resumido */}
                  <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4" />
                      <span className="font-medium">Paciente:</span>
                      <span>{patientName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4" />
                      <span className="font-medium">Evoluções:</span>
                      <span>{selectedEvolutions.size} incluídas</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <PenLine className="h-4 w-4" />
                      <span className="font-medium">Assinatura:</span>
                      <span>
                        {
                          PROFESSIONALS.find(
                            (p) => p.id === selectedProfessional
                          )?.name
                        }
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer com botões */}
            <div className="flex gap-3 pt-4 border-t">
              {editorMode === 'configure' && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleGenerateReport}
                    disabled={
                      isGenerating ||
                      selectedEvolutions.size === 0 ||
                      !selectedProfessional
                    }
                    className="flex-1"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Gerando com IA...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Gerar com IA
                      </>
                    )}
                  </Button>
                </>
              )}

              {editorMode === 'editing' && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setEditorMode('configure')}
                    className="flex-1"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Voltar
                  </Button>
                  <Button
                    onClick={handleSaveReport}
                    disabled={isSaving || !editableContent.trim()}
                    className="flex-1"
                  >
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
                </>
              )}

              {editorMode === 'saved' && (
                <>
                  <Button
                    variant="outline"
                    onClick={handlePrint}
                    className="flex-1"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Exportar PDF
                  </Button>
                  <Button
                    onClick={handleSendToResponsible}
                    disabled={isSending}
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
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }
);

ClinicalReportGenerator.displayName = 'ClinicalReportGenerator';
