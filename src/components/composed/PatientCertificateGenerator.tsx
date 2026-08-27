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
import { openPrintWindow } from '@/lib/print-document';

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

// AI dev note: o nome do paciente e interpolado direto no HTML gerado
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// AI dev note: a faixa rosa do fundo tem ~670px uteis na folha A4 paisagem (1122px de largura).
// A fonte Caveat ocupa ~0.38 x o font-size por caractere, entao reduzimos o corpo quando o nome
// e longo - antes o `white-space: nowrap` fazia nomes grandes estourarem a faixa.
const FIT_NAME_MAX_WIDTH_PX = 670;
const FIT_NAME_CHAR_RATIO = 0.38;

const fitNameFontSize = (name: string): number => {
  const length = Math.max(name.trim().length, 1);
  const ideal = Math.floor(
    FIT_NAME_MAX_WIDTH_PX / (length * FIT_NAME_CHAR_RATIO)
  );
  return Math.max(24, Math.min(46, ideal));
};

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

  // Estado para armazenar dados do certificado gerado (para reutilização)
  const [generatedCertificateData, setGeneratedCertificateData] = useState<{
    htmlContent: string;
    professionalName: string;
  } | null>(null);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedProfessional('');
      setGeneratedCertificateData(null);
    }
  }, [isOpen]);

  // Gerar HTML do certificado
  const generateCertificateHTML = (professionalId: string): string => {
    const professional = PROFESSIONALS.find((p) => p.id === professionalId);
    if (!professional) return '';

    const signatureUrl = `${SUPABASE_STORAGE_URL}/${encodeURIComponent(professional.signatureFile)}`;
    const hoje = formatDateBR(new Date());
    const safeName = escapeHtml(patientName);
    const nameFontSize = fitNameFontSize(patientName);

    // AI dev note: Template HTML do certificado - apenas posiciona nome, assinatura e data
    // O fundo (certificado.png) ja contem todo o texto estatico
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=1123">
  <title>Certificado de Conquista - ${safeName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    /* AI dev note: a folha tem medida fisica fixa (A4 paisagem) na tela E na impressao.
       A versao anterior trocava para height:100vh dentro de @media print - a altura da
       viewport nao bate com a da folha, entao o certificado vazava para uma segunda pagina
       e o fundo esticado empurrava assinatura e data para fora do lugar. */
    @page {
      size: A4 landscape;
      margin: 0;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html,
    body {
      width: 297mm;
      height: 210mm;
      background: #fff;
    }

    .page {
      position: relative;
      width: 297mm;
      height: 210mm;
      overflow: hidden;
      page-break-after: avoid;
      break-after: avoid;
    }

    /* AI dev note: fundo como <img> e nao background-image - o Chrome so imprime background
       quando "Graficos de plano de fundo" esta marcado no dialogo, e a nota saia em branco. */
    .page-bg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: fill;
    }

    /* Nome do paciente - centralizado na faixa rosa do fundo */
    .patient-name {
      position: absolute;
      top: 34.5%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 60%;
      font-family: 'Caveat', 'Segoe Script', cursive;
      font-size: ${nameFontSize}px;
      line-height: 1.1;
      font-weight: 600;
      color: #1a365d;
      text-align: center;
      white-space: nowrap;
    }

    /* Assinatura - centro inferior, logo abaixo do texto do fundo */
    .signature-section {
      position: absolute;
      bottom: 9%;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .signature-image {
      width: 240px;
      height: 110px;
      object-fit: contain;
    }

    /* Data - abaixo do carimbo */
    .date-section {
      position: absolute;
      bottom: 4.5%;
      left: 50%;
      transform: translateX(-50%);
      font-family: 'Caveat', 'Segoe Script', cursive;
      font-size: 20px;
      color: #40C4AA;
    }

    @media print {
      html,
      body {
        overflow: hidden;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Fundo -->
    <img src="${BACKGROUND_IMAGE_URL}" alt="" class="page-bg" />

    <!-- Nome do paciente -->
    <div class="patient-name">${safeName}</div>

    <!-- Assinatura/Carimbo -->
    <div class="signature-section">
      <img src="${signatureUrl}" alt="Assinatura ${escapeHtml(professional.name)}" class="signature-image" />
    </div>

    <!-- Data -->
    <div class="date-section">${hoje}</div>
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

      // Abrir nova janela para impressão/PDF
      // AI dev note: openPrintWindow só chama print() depois que fundo, assinatura e fontes
      // terminaram de carregar - o setTimeout fixo de 1s imprimia com as imagens em branco.
      const printWindow = openPrintWindow(htmlContent);
      if (printWindow) {
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
    if (!selectedProfessional) {
      toast({
        title: 'Atenção',
        description: 'Selecione o profissional que irá assinar o certificado',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);

    try {
      // Gerar HTML do certificado (usa dados já gerados ou gera novamente)
      const professional = PROFESSIONALS.find(
        (p) => p.id === selectedProfessional
      );
      if (!professional) {
        throw new Error('Profissional não encontrado');
      }

      const htmlContent =
        generatedCertificateData?.htmlContent ||
        generateCertificateHTML(selectedProfessional);

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
      const htmlFile = new File([htmlContent], fileName, {
        type: 'text/html',
      });

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
              profissional_assinante: professional.name,
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
              onValueChange={setSelectedProfessional}
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

          {/* Botão de enviar ao responsável - sempre disponível quando profissional selecionado */}
          {selectedProfessional && (
            <div className="flex justify-end pt-2 border-t border-dashed">
              <Button
                onClick={handleSendToResponsible}
                disabled={isSending || isLoading}
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
