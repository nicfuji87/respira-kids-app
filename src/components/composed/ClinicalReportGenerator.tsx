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
  List,
  AlertCircle,
  Download,
  Eye,
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
  data_emissao: string | null;
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
    const [generationMode, setGenerationMode] = useState<'list' | 'ai'>('list');

    // Estados para relatórios salvos
    const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
    const [isLoadingReports, setIsLoadingReports] = useState(true);

    // Estado para relatório gerado (para preview/envio)
    const [generatedReportData, setGeneratedReportData] = useState<{
      htmlContent: string;
      reportUrl: string | null;
    } | null>(null);

    const userRole = user?.pessoa?.role as
      | 'admin'
      | 'profissional'
      | 'secretaria'
      | null;
    const canGenerateReports =
      userRole === 'admin' || userRole === 'secretaria';

    // Carregar relatórios salvos ao montar
    useEffect(() => {
      loadSavedReports();
    }, [patientId]);

    // Carregar evoluções quando o modal abre
    useEffect(() => {
      if (isModalOpen) {
        loadEvolutions();
      } else {
        // Reset state when modal closes
        setSelectedEvolutions(new Set());
        setSelectedProfessional('');
        setReportDate(new Date().toISOString().split('T')[0]);
        setGenerationMode('list');
        setGeneratedReportData(null);
      }
    }, [isModalOpen, patientId]);

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
            data_emissao,
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
          data_emissao: item.data_emissao,
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

        // Buscar todas as evoluções do paciente via view
        const { data, error: fetchError } = await supabase
          .from('vw_agendamentos_completos')
          .select('id, data_hora, profissional_nome, servico_nome')
          .eq('paciente_id', patientId)
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

        // Buscar evoluções
        const { data: evolData, error: evolError } = await supabase
          .from('relatorio_evolucao')
          .select('id, id_agendamento, tipo_evolucao, conteudo, created_at')
          .in('id_agendamento', agendamentoIds)
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

    const generateReportHTML = (
      selectedEvols: PatientEvolution[],
      professional: (typeof PROFESSIONALS)[0],
      reportDateStr: string,
      mode: 'list' | 'ai',
      aiSummary?: string,
      generatedBy?: string
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

      // Gerar conteúdo baseado no modo
      let contentHTML = '';

      if (mode === 'ai' && aiSummary) {
        // Modo IA: resumo sintetizado
        contentHTML = `
          <div class="ai-summary">
            <p>${aiSummary.replace(/\n/g, '</p><p>')}</p>
          </div>
        `;
      } else {
        // Modo lista: cada evolução individualmente
        contentHTML = sortedEvols
          .map((evol) => {
            const evolDate = new Date(evol.consulta_data);
            const dateStr = formatDateBR(evolDate);
            const tipoLabel =
              evol.tipo_evolucao === 'respiratoria'
                ? 'Respiratória'
                : evol.tipo_evolucao === 'motora_assimetria'
                  ? 'Motora/Assimetria'
                  : 'Geral';

            return `
              <div class="evolution-item">
                <div class="evolution-header">
                  <span class="evolution-date">${dateStr}</span>
                  <span class="evolution-type">${tipoLabel}</span>
                  <span class="evolution-professional">${evol.profissional_nome}</span>
                </div>
                <div class="evolution-content">
                  <pre>${evol.conteudo}</pre>
                </div>
              </div>
            `;
          })
          .join('');
      }

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
      line-height: 1.6;
    }
    
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      position: relative;
      background-image: url('${BACKGROUND_IMAGE_URL}');
      background-size: 100% 100%;
      background-position: top left;
      background-repeat: no-repeat;
      padding: 50mm 20mm 40mm 20mm;
    }
    
    .header {
      text-align: center;
      margin-bottom: 20px;
    }
    
    .title {
      font-size: 22px;
      font-weight: 700;
      color: #1a365d;
      margin-bottom: 5px;
    }
    
    .subtitle {
      font-size: 14px;
      color: #40C4AA;
      font-weight: 500;
    }
    
    .patient-info {
      background: rgba(64, 196, 170, 0.1);
      border-left: 4px solid #40C4AA;
      padding: 15px;
      margin-bottom: 20px;
      border-radius: 0 8px 8px 0;
    }
    
    .patient-name {
      font-size: 16px;
      font-weight: 600;
      color: #1a365d;
    }
    
    .patient-period {
      font-size: 12px;
      color: #666;
      margin-top: 5px;
    }
    
    .content-section {
      margin-bottom: 20px;
    }
    
    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: #1a365d;
      margin-bottom: 10px;
      padding-bottom: 5px;
      border-bottom: 2px solid #40C4AA;
    }
    
    .evolution-item {
      background: #f8fafc;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 15px;
      page-break-inside: avoid;
    }
    
    .evolution-header {
      display: flex;
      gap: 15px;
      margin-bottom: 10px;
      font-size: 11px;
      flex-wrap: wrap;
    }
    
    .evolution-date {
      background: #40C4AA;
      color: white;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 500;
    }
    
    .evolution-type {
      background: #e2e8f0;
      color: #475569;
      padding: 2px 8px;
      border-radius: 4px;
    }
    
    .evolution-professional {
      color: #64748b;
      font-style: italic;
    }
    
    .evolution-content {
      font-size: 11px;
      color: #334155;
    }
    
    .evolution-content pre {
      font-family: 'Poppins', sans-serif;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-size: 10px;
      line-height: 1.5;
    }
    
    .ai-summary {
      font-size: 12px;
      text-align: justify;
      line-height: 1.8;
    }
    
    .ai-summary p {
      margin-bottom: 10px;
      text-indent: 20px;
    }
    
    .signature-section {
      margin-top: 40px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    
    .signature-image {
      max-width: 200px;
      max-height: 100px;
      object-fit: contain;
    }
    
    .signature-info {
      margin-top: 10px;
      font-size: 12px;
      color: #1a365d;
    }
    
    .signature-name {
      font-weight: 600;
    }
    
    .signature-title {
      font-size: 11px;
      color: #64748b;
    }
    
    .location-date {
      margin-top: 15px;
      font-size: 12px;
      color: #666;
    }
    
    .audit-section {
      position: absolute;
      bottom: 10mm;
      right: 15mm;
      text-align: right;
      font-size: 8px;
      color: #999;
      font-style: italic;
    }
    
    @media print {
      @page {
        size: A4;
        margin: 0;
      }
      
      body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        margin: 0;
        padding: 0;
      }
      
      .page {
        width: 100%;
        min-height: 100vh;
        background-image: url('${BACKGROUND_IMAGE_URL}');
        background-size: 100% 100%;
        background-position: top left;
        background-repeat: no-repeat;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1 class="title">Relatório Clínico</h1>
      <p class="subtitle">Fisioterapia Pediátrica</p>
    </div>
    
    <div class="patient-info">
      <div class="patient-name">Paciente: ${patientName}</div>
      <div class="patient-period">Período: ${periodoStr} | Total de ${sortedEvols.length} evolução(ões)</div>
    </div>
    
    <div class="content-section">
      <h2 class="section-title">
        ${mode === 'ai' ? 'Resumo do Tratamento' : 'Evoluções Clínicas'}
      </h2>
      ${contentHTML}
    </div>
    
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

        const selectedEvols = evolutions.filter((e) =>
          selectedEvolutions.has(e.id)
        );

        let aiSummary: string | undefined;

        // Se modo IA, gerar resumo
        if (generationMode === 'ai') {
          toast({
            title: 'Gerando resumo com IA...',
            description: 'Isso pode levar alguns segundos',
          });

          // Preparar conteúdos para a IA
          const evolutionTexts = selectedEvols.map((e) => e.conteudo);

          try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
                  patientName,
                  evolutions: evolutionTexts,
                }),
              }
            );

            if (response.ok) {
              const result = await response.json();
              aiSummary = result.history || result.summary;
            } else {
              throw new Error('Erro na resposta da IA');
            }
          } catch (aiError) {
            console.error('Erro ao gerar resumo com IA:', aiError);
            toast({
              title: 'Aviso',
              description:
                'Não foi possível gerar resumo com IA. Usando listagem individual.',
              variant: 'destructive',
            });
            // Fallback para modo lista
          }
        }

        // Gerar HTML do relatório
        const htmlContent = generateReportHTML(
          selectedEvols,
          professional,
          reportDate,
          aiSummary ? 'ai' : 'list',
          aiSummary,
          user?.pessoa?.nome || 'Sistema'
        );

        // Upload do HTML para o storage
        const timestamp = Date.now();
        const fileName = `relatorio_clinico_${patientId}_${timestamp}.html`;
        const filePath = `relatorios/${patientId}/${fileName}`;

        const htmlFile = new File([htmlContent], fileName, {
          type: 'text/html',
        });

        const { error: uploadError } = await supabase.storage
          .from('respira-documents')
          .upload(filePath, htmlFile, {
            upsert: true,
          });

        if (uploadError) {
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

        if (tipoError) throw new Error('Tipo de relatório não encontrado');

        const { error: saveError } = await supabase
          .from('relatorios_medicos')
          .insert({
            id_pessoa: patientId,
            tipo_relatorio_id: tipoData.id,
            conteudo: `Relatório clínico com ${selectedEvols.length} evolução(ões). Período: ${formatDateBR(new Date(selectedEvols[0]?.consulta_data || new Date()))} a ${formatDateBR(new Date(selectedEvols[selectedEvols.length - 1]?.consulta_data || new Date()))}. Assinado por: ${professional.name}`,
            pdf_url: publicUrl,
            criado_por: user?.pessoa?.id,
            data_emissao: reportDate,
            transcricao: false,
            ativo: true,
          });

        if (saveError) {
          console.error('Erro ao salvar relatório:', saveError);
          // Continua mesmo com erro no salvamento
        }

        setGeneratedReportData({
          htmlContent,
          reportUrl: publicUrl,
        });

        toast({
          title: 'Sucesso!',
          description: 'Relatório gerado com sucesso',
        });

        // Recarregar lista de relatórios
        await loadSavedReports();
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

        // Enfileirar webhook
        const { error: webhookError } = await supabase
          .from('webhook_queue')
          .insert({
            event_type: 'relatorio_clinico_gerado',
            payload: webhookPayload,
            status: 'pending',
          });

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
                        {report.data_emissao
                          ? formatDateBR(
                              new Date(report.data_emissao + 'T12:00:00')
                            )
                          : formatDateBR(new Date(report.created_at))}
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

                    <div className="flex gap-2 pt-2">
                      {report.pdf_url && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => handleViewReport(report.pdf_url!)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver Relatório
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const link = document.createElement('a');
                              link.href = report.pdf_url!;
                              link.download = `relatorio_${patientName.replace(/\s/g, '_')}.html`;
                              link.click();
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
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
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Gerar Relatório Clínico
              </DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-6 py-4">
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
                      Este paciente não possui evoluções clínicas registradas.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <ScrollArea className="h-48 border rounded-md p-2">
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
                            onClick={() => toggleEvolutionSelection(evol.id)}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() =>
                                toggleEvolutionSelection(evol.id)
                              }
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-xs">
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
                                    : evol.tipo_evolucao === 'motora_assimetria'
                                      ? 'Motora'
                                      : 'Geral'}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 truncate">
                                {evol.profissional_nome} • {evol.servico_nome}
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

              {/* Modo de Geração */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tipo de Relatório</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div
                    className={cn(
                      'border rounded-lg p-3 cursor-pointer transition-all',
                      generationMode === 'list'
                        ? 'border-primary bg-primary/5'
                        : 'hover:border-muted-foreground'
                    )}
                    onClick={() => setGenerationMode('list')}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <List className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">
                        Listagem Individual
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cada evolução listada separadamente
                    </p>
                  </div>
                  <div
                    className={cn(
                      'border rounded-lg p-3 cursor-pointer transition-all',
                      generationMode === 'ai'
                        ? 'border-primary bg-primary/5'
                        : 'hover:border-muted-foreground'
                    )}
                    onClick={() => setGenerationMode('ai')}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">Resumo com IA</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Síntese inteligente das evoluções
                    </p>
                  </div>
                </div>
              </div>

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
                <Label htmlFor="professional">
                  Profissional que assinará *
                </Label>
                <Select
                  value={selectedProfessional}
                  onValueChange={setSelectedProfessional}
                >
                  <SelectTrigger id="professional">
                    <SelectValue placeholder="Selecione o profissional..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PROFESSIONALS.map((prof) => (
                      <SelectItem key={prof.id} value={prof.id}>
                        <div className="flex flex-col">
                          <span>{prof.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {prof.title}
                            {prof.crefito && ` - ${prof.crefito}`}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Botões de Ação após geração */}
              {generatedReportData && (
                <Alert className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                  <FileText className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800 dark:text-green-200">
                    Relatório gerado com sucesso! Você pode imprimir ou enviar
                    ao responsável.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Footer com botões */}
            <div className="flex gap-3 pt-4 border-t">
              {!generatedReportData ? (
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
                        Gerando...
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4 mr-2" />
                        Gerar Relatório
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={handlePrint}
                    className="flex-1"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Imprimir/PDF
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
