// AI dev note: PatientCertificateGenerator - Componente para geração de certificados de conquista
// Usado quando o paciente recebe alta, emitido pelo admin ou secretaria
// Usa imagem de fundo certificado.png e assinaturas dos profissionais do bucket Supabase

import React, { useState, useEffect } from 'react';
import { Award, Loader2, Printer, Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Label } from '@/components/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';

export interface PatientCertificateGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
}

// AI dev note: URLs das imagens no Supabase Storage (bucket público)
const SUPABASE_STORAGE_URL =
  'https://jqegoentcusnbcykgtxg.supabase.co/storage/v1/object/public/respira-documents';

const BACKGROUND_IMAGE_URL = `${SUPABASE_STORAGE_URL}/certificado.png`;

// Profissionais disponíveis para assinar o certificado
const PROFESSIONALS = [
  {
    id: 'bruna',
    name: 'Bruna Cury',
    signatureFile: 'Bruna Cury.png',
    title: 'Fisioterapeuta',
    crefito: 'CREFITO 167135-F',
  },
  {
    id: 'flavia',
    name: 'Flavia Pacheco',
    signatureFile: 'Flavia Pacheco.png',
    title: 'Fisioterapeuta',
    crefito: '', // Adicionar CREFITO se disponível
  },
];

// Formatar data brasileira
const formatDateBR = (date: Date): string => {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
};

export const PatientCertificateGenerator: React.FC<
  PatientCertificateGeneratorProps
> = ({ isOpen, onClose, patientId, patientName }) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedProfessional, setSelectedProfessional] = useState<string>('');

  // Estado para rastrear se certificado foi gerado
  const [certificateGenerated, setCertificateGenerated] = useState(false);
  const [generatedCertificateData, setGeneratedCertificateData] = useState<{
    htmlContent: string;
    professionalName: string;
  } | null>(null);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedProfessional('');
      setCertificateGenerated(false);
      setGeneratedCertificateData(null);
    }
  }, [isOpen]);

  // Gerar HTML do certificado
  const generateCertificateHTML = (professionalId: string): string => {
    const professional = PROFESSIONALS.find((p) => p.id === professionalId);
    if (!professional) return '';

    const signatureUrl = `${SUPABASE_STORAGE_URL}/${encodeURIComponent(professional.signatureFile)}`;
    const hoje = formatDateBR(new Date());

    // AI dev note: Template HTML do certificado usando imagem de fundo do Supabase Storage
    // O design segue o modelo fornecido com fundo xadrez verde claro, título em destaque,
    // nome do paciente com fundo rosa/salmon, e assinatura do profissional
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Certificado de Conquista - ${patientName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
    @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&display=swap');
    
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
      width: 297mm; /* A4 paisagem */
      height: 210mm;
      margin: 0 auto;
      position: relative;
      background-image: url('${BACKGROUND_IMAGE_URL}');
      background-size: 100% 100%;
      background-position: center;
      background-repeat: no-repeat;
    }
    
    /* Conteúdo principal - posicionado sobre a imagem de fundo */
    .content {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 80px;
      text-align: center;
    }
    
    /* Título */
    .title {
      font-size: 36px;
      font-weight: 700;
      color: #1a365d;
      margin-bottom: 30px;
      letter-spacing: 3px;
      text-transform: uppercase;
    }
    
    /* Nome do paciente com fundo rosa */
    .patient-name-container {
      position: relative;
      margin-bottom: 40px;
    }
    
    .patient-name-bg {
      background-color: #F8B4B4;
      padding: 8px 40px;
      border-radius: 8px;
      display: inline-block;
      transform: rotate(-1deg);
    }
    
    .patient-name {
      font-family: 'Caveat', cursive;
      font-size: 42px;
      font-weight: 600;
      color: #1a365d;
      transform: rotate(1deg);
    }
    
    /* Texto do certificado */
    .certificate-text {
      max-width: 700px;
      margin-bottom: 20px;
    }
    
    .certificate-text p {
      font-size: 15px;
      color: #4a5568;
      margin-bottom: 15px;
      line-height: 1.7;
    }
    
    .highlight-text {
      font-weight: 600;
      color: #1a365d;
    }
    
    .closing-text {
      font-size: 16px;
      font-weight: 600;
      color: #1a365d;
      margin-top: 10px;
    }
    
    /* Assinatura */
    .signature-section {
      margin-top: 30px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    
    .signature-image {
      max-width: 180px;
      max-height: 80px;
      object-fit: contain;
      margin-bottom: 5px;
    }
    
    .signature-name {
      font-family: 'Caveat', cursive;
      font-size: 22px;
      color: #1a365d;
      font-weight: 600;
    }
    
    .signature-title {
      font-size: 12px;
      color: #4a5568;
    }
    
    .signature-crefito {
      font-size: 11px;
      color: #718096;
    }
    
    /* Data */
    .date-section {
      position: absolute;
      bottom: 30px;
      right: 60px;
      font-size: 12px;
      color: #718096;
    }
    
    @media print {
      @page {
        size: A4 landscape;
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
        height: 100vh;
        background-image: url('${BACKGROUND_IMAGE_URL}');
        background-size: 100% 100%;
        background-position: center;
        background-repeat: no-repeat;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="content">
      <h1 class="title">Certificado de Conquista</h1>
      
      <div class="patient-name-container">
        <div class="patient-name-bg">
          <span class="patient-name">${patientName}</span>
        </div>
      </div>
      
      <div class="certificate-text">
        <p>
          Com muita <span class="highlight-text">coragem, sorrisos e determinação</span>, você superou todos os 
          desafios da sua jornada de fisioterapia. Cada movimento foi uma grande 
          vitória, e você mostrou a todos o quão forte e especial você é.
        </p>
        
        <p>
          Hoje, celebramos suas incríveis conquistas e seu progresso admirável.
          Estamos orgulhosos de cada passinho dado em direção ao sucesso.
        </p>
        
        <p class="closing-text">Continue brilhando e crescendo!</p>
      </div>
      
      <div class="signature-section">
        <img src="${signatureUrl}" alt="Assinatura ${professional.name}" class="signature-image" />
        <p class="signature-name">${professional.name}</p>
        <p class="signature-title">${professional.title}</p>
        ${professional.crefito ? `<p class="signature-crefito">${professional.crefito}</p>` : ''}
      </div>
      
      <div class="date-section">
        ${hoje}
      </div>
    </div>
  </div>
</body>
</html>
    `;
  };

  // Handler para gerar e imprimir o certificado
  const handleGenerateCertificate = () => {
    if (!selectedProfessional) {
      toast({
        title: 'Atenção',
        description: 'Selecione o profissional que irá assinar o certificado',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const professional = PROFESSIONALS.find(
        (p) => p.id === selectedProfessional
      );
      if (!professional) {
        throw new Error('Profissional não encontrado');
      }

      const htmlContent = generateCertificateHTML(selectedProfessional);

      // Salvar dados do certificado gerado
      setGeneratedCertificateData({
        htmlContent,
        professionalName: professional.name,
      });
      setCertificateGenerated(true);

      // Abrir nova janela para impressão/PDF
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();

        // Aguardar carregamento das fontes e imagens antes de imprimir
        setTimeout(() => {
          printWindow.print();
        }, 1000);

        toast({
          title: 'Certificado gerado',
          description: 'O certificado foi aberto para impressão/download',
        });
      } else {
        toast({
          title: 'Erro',
          description:
            'Não foi possível abrir a janela de impressão. Verifique se pop-ups estão permitidos.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Erro ao gerar certificado:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível gerar o certificado',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handler para enviar certificado ao responsável via webhook
  const handleSendToResponsible = async () => {
    if (!generatedCertificateData) {
      toast({
        title: 'Atenção',
        description: 'Gere o certificado primeiro antes de enviar',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);

    try {
      // 1. Buscar dados do responsável do paciente
      const { data: patientData, error: patientError } = await supabase
        .from('pacientes_com_responsaveis_view')
        .select(
          'responsavel_legal_nome, responsavel_legal_telefone, responsavel_legal_email, responsavel_cobranca_id, responsavel_cobranca_nome'
        )
        .eq('id', patientId)
        .single();

      if (patientError || !patientData) {
        throw new Error('Não foi possível buscar dados do responsável');
      }

      // 2. Fazer upload do HTML para o storage
      const timestamp = Date.now();
      const fileName = `certificado_${patientId}_${timestamp}.html`;
      const filePath = `certificados/${patientId}/${fileName}`;

      // Criar File object a partir do HTML string
      const htmlFile = new File(
        [generatedCertificateData.htmlContent],
        fileName,
        {
          type: 'text/html',
        }
      );

      const { error: uploadError } = await supabase.storage
        .from('respira-documents')
        .upload(filePath, htmlFile, {
          upsert: true,
        });

      if (uploadError) {
        console.error('Erro no upload:', uploadError);
        throw new Error(
          `Erro ao fazer upload do certificado: ${uploadError.message}`
        );
      }

      // 3. Obter URL pública do arquivo
      const { data: urlData } = supabase.storage
        .from('respira-documents')
        .getPublicUrl(filePath);

      const certificateUrl = urlData.publicUrl;

      // 4. Inserir na fila de webhooks (seguindo o padrão de appointment_created)
      // AI dev note: Formato padronizado com tipo, timestamp, webhook_id e data
      const webhookPayload = {
        evento: 'certificado_gerado',
        payload: {
          tipo: 'certificado_gerado',
          timestamp: new Date().toISOString(),
          webhook_id: crypto.randomUUID(),
          data: {
            paciente: {
              id: patientId,
              nome: patientName,
            },
            responsavel_legal: {
              nome:
                patientData.responsavel_legal_nome ||
                patientData.responsavel_cobranca_nome,
              telefone: patientData.responsavel_legal_telefone,
              email: patientData.responsavel_legal_email || null,
            },
            certificado: {
              url: certificateUrl,
              profissional_assinante: generatedCertificateData.professionalName,
              tipo: 'conquista',
            },
          },
        },
      };

      console.log('📤 Inserindo webhook na fila:', webhookPayload);

      const { error: webhookError } = await supabase
        .from('webhook_queue')
        .insert(webhookPayload);

      if (webhookError) {
        console.error('Erro ao criar webhook:', webhookError);
        throw new Error('Erro ao agendar envio do certificado');
      }

      toast({
        title: 'Certificado enviado!',
        description: `O certificado foi enviado para ${patientData.responsavel_legal_nome || 'o responsável'}`,
      });

      // Fechar modal após envio bem-sucedido
      onClose();
    } catch (error) {
      console.error('Erro ao enviar certificado:', error);
      toast({
        title: 'Erro ao enviar',
        description:
          error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-amber-500" />
            Gerar Certificado de Conquista
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Paciente (somente leitura) */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">
              Paciente
            </Label>
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-md border border-amber-200 dark:border-amber-800">
              <p className="font-medium text-amber-800 dark:text-amber-200">
                {patientName}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                🎉 Parabéns pela alta!
              </p>
            </div>
          </div>

          {/* Seleção de Profissional */}
          <div className="space-y-2">
            <Label htmlFor="professional">Profissional que irá assinar *</Label>
            <Select
              value={selectedProfessional}
              onValueChange={(value) => {
                setSelectedProfessional(value);
                setCertificateGenerated(false);
              }}
            >
              <SelectTrigger id="professional">
                <SelectValue placeholder="Selecione o profissional..." />
              </SelectTrigger>
              <SelectContent>
                {PROFESSIONALS.map((professional) => (
                  <SelectItem key={professional.id} value={professional.id}>
                    <div className="flex flex-col">
                      <span>{professional.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {professional.title}
                        {professional.crefito && ` - ${professional.crefito}`}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Preview info */}
          {selectedProfessional && (
            <div className="p-4 bg-gradient-to-r from-teal-50 to-amber-50 dark:from-teal-950/30 dark:to-amber-950/30 rounded-lg border border-teal-200 dark:border-teal-800">
              <h4 className="font-semibold text-teal-700 dark:text-teal-300 mb-2">
                Prévia do Certificado
              </h4>
              <p className="text-sm text-muted-foreground">
                O certificado será gerado com o nome do paciente em destaque e
                assinado por{' '}
                <strong>
                  {PROFESSIONALS.find((p) => p.id === selectedProfessional)
                    ?.name || ''}
                </strong>
                .
              </p>
            </div>
          )}
        </div>

        {/* Ações */}
        <div className="flex flex-col gap-3 pt-4 border-t">
          {/* Linha principal de ações */}
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isLoading || isSending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleGenerateCertificate}
              disabled={isLoading || isSending || !selectedProfessional}
              className="gap-2 bg-amber-600 hover:bg-amber-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4" />
                  Gerar Certificado
                </>
              )}
            </Button>
          </div>

          {/* Botão de enviar ao responsável - aparece após gerar */}
          {certificateGenerated && generatedCertificateData && (
            <div className="flex justify-end pt-2 border-t border-dashed">
              <Button
                onClick={handleSendToResponsible}
                disabled={isSending}
                variant="secondary"
                className="gap-2"
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Enviar ao Responsável
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

PatientCertificateGenerator.displayName = 'PatientCertificateGenerator';
