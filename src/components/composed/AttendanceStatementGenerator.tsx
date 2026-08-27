// AI dev note: AttendanceStatementGenerator - Componente para geração de atestado de comparecimento
// Usado para emitir atestado de que o responsável acompanhou o paciente na consulta
// Disponível em detalhes da consulta para admin e secretaria
// Usa imagem de fundo atestado.png do bucket Supabase (apenas fundo, texto gerado)

import React, { useState, useEffect } from 'react';
import { FileText, Loader2, Printer, Send } from 'lucide-react';
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

export interface AttendanceStatementGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentId: string;
  appointmentDate: string; // ISO date string
  patientId: string;
  patientName: string;
}

// AI dev note: Interface para responsáveis carregados do banco
interface ResponsibleOption {
  id: string;
  name: string;
  type: string;
  telefone?: number | null;
  email?: string | null;
}

// AI dev note: URLs das imagens no Supabase Storage (bucket público)
const SUPABASE_STORAGE_URL =
  'https://jqegoentcusnbcykgtxg.supabase.co/storage/v1/object/public/respira-documents';

const BACKGROUND_IMAGE_URL = `${SUPABASE_STORAGE_URL}/atestado.png`;

// Profissionais disponíveis para assinar o atestado
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
    crefito: '',
  },
  {
    id: 'beatriz',
    name: 'Beatriz Perisse',
    signatureFile: 'Beatriz Perisse.png',
    title: 'Fisioterapeuta',
    crefito: '',
  },
];

// AI dev note: nomes de paciente/responsavel sao interpolados direto no HTML gerado
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Formatar data brasileira completa
const formatDateBR = (date: Date): string => {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

// AI dev note: Formatar data usando UTC para evitar deslocamento de fuso horário.
// As datas no banco usam convenção "Brasília mascarado" (hora local salva com offset +00),
// então getUTC*() retorna a hora/data real de Brasília.
const formatDateBR_UTC = (date: Date): string => {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

// AI dev note: Determinar turno baseado no horário.
// Usa getUTCHours() porque as datas no banco usam convenção "Brasília mascarado"
// (hora local salva com offset +00). Se usarmos getHours(), o navegador subtrai 3h
// (UTC-3), fazendo consultas das 12h-14h aparecerem como "matutino" incorretamente.
const getShift = (dateString: string): string => {
  const date = new Date(dateString);
  const hours = date.getUTCHours();
  return hours < 12 ? 'matutino' : 'vespertino';
};

export const AttendanceStatementGenerator: React.FC<
  AttendanceStatementGeneratorProps
> = ({
  isOpen,
  onClose,
  appointmentId,
  appointmentDate,
  patientId,
  patientName,
}) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingResponsibles, setIsLoadingResponsibles] = useState(false);
  const [selectedProfessional, setSelectedProfessional] = useState<string>('');
  const [selectedResponsible, setSelectedResponsible] = useState<string>('');

  // Estado para armazenar dados do atestado gerado
  const [generatedStatementData, setGeneratedStatementData] = useState<{
    htmlContent: string;
    professionalName: string;
    responsibleName: string;
  } | null>(null);

  // AI dev note: Estado para armazenar todos os responsáveis do paciente
  const [responsibleOptions, setResponsibleOptions] = useState<
    ResponsibleOption[]
  >([]);

  // Buscar todos os responsáveis do paciente quando o modal abre
  useEffect(() => {
    const fetchResponsibles = async () => {
      if (!isOpen || !patientId) return;

      setIsLoadingResponsibles(true);
      try {
        // Buscar todos os responsáveis ativos do paciente
        const { data: responsaveisData, error } = await supabase
          .from('pessoa_responsaveis')
          .select(
            `
            id_responsavel,
            tipo_responsabilidade,
            pessoas!pessoa_responsaveis_id_responsavel_fkey(id, nome, telefone, email)
          `
          )
          .eq('id_pessoa', patientId)
          .eq('ativo', true);

        if (error) {
          console.error('Erro ao buscar responsáveis:', error);
          return;
        }

        if (responsaveisData && responsaveisData.length > 0) {
          const options: ResponsibleOption[] = [];

          responsaveisData.forEach((r) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pessoa = r.pessoas as any;
            if (pessoa?.nome) {
              // Mapear tipo de responsabilidade para label amigável
              let typeLabel = 'Responsável';
              if (r.tipo_responsabilidade === 'legal') {
                typeLabel = 'Responsável Legal';
              } else if (r.tipo_responsabilidade === 'financeiro') {
                typeLabel = 'Responsável Financeiro';
              } else if (r.tipo_responsabilidade === 'ambos') {
                typeLabel = 'Responsável Legal e Financeiro';
              }

              options.push({
                id: pessoa.id,
                name: pessoa.nome,
                type: typeLabel,
                telefone: pessoa.telefone,
                email: pessoa.email,
              });
            }
          });

          setResponsibleOptions(options);
        } else {
          setResponsibleOptions([]);
        }
      } catch (err) {
        console.error('Erro ao buscar responsáveis:', err);
      } finally {
        setIsLoadingResponsibles(false);
      }
    };

    fetchResponsibles();
  }, [isOpen, patientId]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedProfessional('');
      setSelectedResponsible('');
      setGeneratedStatementData(null);
      setResponsibleOptions([]);
    }
  }, [isOpen]);

  // Gerar HTML do atestado
  const generateStatementHTML = (
    professionalId: string,
    responsibleId: string
  ): string => {
    const professional = PROFESSIONALS.find((p) => p.id === professionalId);
    const responsible = responsibleOptions.find((r) => r.id === responsibleId);

    if (!professional || !responsible) return '';

    const signatureUrl = `${SUPABASE_STORAGE_URL}/${encodeURIComponent(professional.signatureFile)}`;
    const appointmentDateObj = new Date(appointmentDate);
    const appointmentDateFormatted = formatDateBR_UTC(appointmentDateObj);
    const shift = getShift(appointmentDate);
    const hoje = formatDateBR(new Date());
    const safePatientName = escapeHtml(patientName);
    const safeResponsibleName = escapeHtml(responsible.name);

    // AI dev note: Template HTML do atestado usando imagem de fundo do Supabase Storage
    // Todo o texto e gerado dinamicamente, o fundo e apenas decorativo
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=1123">
  <title>Atestado de Comparecimento - ${safePatientName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    /* AI dev note: a folha tem medida fisica fixa (A4 paisagem) na tela E na impressao.
       A versao anterior trocava para height:100vh dentro de @media print - a altura da
       viewport nao bate com a da folha, entao sobrava uma segunda pagina em branco e o
       fundo esticado deslocava assinatura e data. */
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
      font-family: 'Poppins', Arial, sans-serif;
      color: #333;
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
       quando "Graficos de plano de fundo" esta marcado no dialogo, e o atestado saia em branco. */
    .page-bg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: fill;
    }

    /* AI dev note: caixa de conteudo ancorada nas quatro bordas + flex column: o texto ocupa
       o espaco livre e a assinatura fica colada no rodape, sem empurrar nada para fora da folha. */
    .content {
      position: absolute;
      top: 12%;
      left: 9%;
      right: 9%;
      bottom: 7%;
      display: flex;
      flex-direction: column;
    }

    .title {
      text-align: center;
      font-size: 28px;
      font-weight: 700;
      line-height: 1.3;
      color: #1a365d;
      margin-bottom: 48px;
    }

    .statement-text {
      flex: 1;
      font-size: 16px;
      line-height: 2;
      color: #333;
      text-align: justify;
    }

    .statement-text p {
      margin-bottom: 24px;
      text-indent: 40px;
    }

    .highlight {
      font-weight: 600;
    }

    .signature-section {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .signature-image {
      width: 220px;
      height: 110px;
      object-fit: contain;
    }

    .location-date {
      font-size: 16px;
      line-height: 1.6;
      text-align: center;
      margin-top: 8px;
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
    <img src="${BACKGROUND_IMAGE_URL}" alt="" class="page-bg" />

    <div class="content">
      <h1 class="title">Atestado de Comparecimento</h1>

      <div class="statement-text">
        <p>
          Confirmo que, <span class="highlight">${safeResponsibleName}</span> esteve presente na consulta
          fisioterapêutica do(a) menor <span class="highlight">${safePatientName}</span> que ocorreu na data
          <span class="highlight">${appointmentDateFormatted}</span>, no período <span class="highlight">${shift}</span>.
        </p>

        <p>
          Sem mais para o momento, firmo a presente declaração para que produza seus efeitos legais.
        </p>
      </div>

      <div class="signature-section">
        <img src="${signatureUrl}" alt="Assinatura ${escapeHtml(professional.name)}" class="signature-image" />
        <div class="location-date">
          Brasília, ${hoje}
        </div>
      </div>
    </div>
  </div>
</body>
</html>
    `;
  };

  // Handler para gerar e imprimir o atestado
  const handleGenerateStatement = () => {
    if (!selectedProfessional) {
      toast({
        title: 'Atenção',
        description: 'Selecione o profissional que irá assinar o atestado',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedResponsible) {
      toast({
        title: 'Atenção',
        description: 'Selecione o responsável que compareceu',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const professional = PROFESSIONALS.find(
        (p) => p.id === selectedProfessional
      );
      const responsible = responsibleOptions.find(
        (r) => r.id === selectedResponsible
      );

      if (!professional || !responsible) {
        throw new Error('Profissional ou responsável não encontrado');
      }

      const htmlContent = generateStatementHTML(
        selectedProfessional,
        selectedResponsible
      );

      // Salvar dados do atestado gerado
      setGeneratedStatementData({
        htmlContent,
        professionalName: professional.name,
        responsibleName: responsible.name,
      });

      // Abrir nova janela para impressão/PDF
      // AI dev note: openPrintWindow só chama print() depois que fundo, assinatura e fontes
      // terminaram de carregar - o setTimeout fixo de 1s imprimia com as imagens em branco.
      const printWindow = openPrintWindow(htmlContent);
      if (printWindow) {
        toast({
          title: 'Atestado gerado',
          description: 'O atestado foi aberto para impressão/download',
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
      console.error('Erro ao gerar atestado:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível gerar o atestado',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handler para enviar atestado ao responsável via webhook
  const handleSendToResponsible = async () => {
    if (!selectedProfessional || !selectedResponsible) {
      toast({
        title: 'Atenção',
        description: 'Selecione o profissional e o responsável primeiro',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);

    try {
      const professional = PROFESSIONALS.find(
        (p) => p.id === selectedProfessional
      );
      const responsible = responsibleOptions.find(
        (r) => r.id === selectedResponsible
      );

      if (!professional || !responsible) {
        throw new Error('Profissional ou responsável não encontrado');
      }

      // Gerar HTML do atestado
      const htmlContent =
        generatedStatementData?.htmlContent ||
        generateStatementHTML(selectedProfessional, selectedResponsible);

      // AI dev note: Usar dados do responsável diretamente do estado (já carregado)
      const responsibleData = {
        nome: responsible.name,
        telefone: responsible.telefone,
        email: responsible.email,
        tipo: responsible.type,
      };

      // 2. Fazer upload do HTML para o storage
      const timestamp = Date.now();
      const fileName = `atestado_${appointmentId}_${timestamp}.html`;
      const filePath = `atestados/${patientId}/${fileName}`;

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
          `Erro ao fazer upload do atestado: ${uploadError.message}`
        );
      }

      // 3. Obter URL pública do arquivo
      const { data: urlData } = supabase.storage
        .from('respira-documents')
        .getPublicUrl(filePath);

      const statementUrl = urlData.publicUrl;

      // 4. Inserir na fila de webhooks
      const webhookPayload = {
        evento: 'atestado_gerado',
        payload: {
          tipo: 'atestado_gerado',
          timestamp: new Date().toISOString(),
          webhook_id: crypto.randomUUID(),
          data: {
            agendamento_id: appointmentId,
            paciente: {
              id: patientId,
              nome: patientName,
            },
            responsavel: {
              nome: responsibleData.nome,
              telefone: responsibleData.telefone,
              email: responsibleData.email || null,
              tipo: responsible.type,
            },
            atestado: {
              url: statementUrl,
              profissional_assinante: professional.name,
              data_consulta: appointmentDate,
              turno: getShift(appointmentDate),
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
        throw new Error('Erro ao agendar envio do atestado');
      }

      toast({
        title: 'Atestado enviado!',
        description: `O atestado foi enviado para ${responsibleData.nome || 'o responsável'}`,
      });

      // Fechar modal após envio bem-sucedido
      onClose();
    } catch (error) {
      console.error('Erro ao enviar atestado:', error);
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

  // Calcular turno para exibição
  const displayShift = getShift(appointmentDate);
  const appointmentDateFormatted = formatDateBR_UTC(new Date(appointmentDate));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Atestado de Comparecimento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Info da Consulta (somente leitura) */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">
              Dados da Consulta
            </Label>
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
              <p className="font-medium text-blue-800 dark:text-blue-200">
                {patientName}
              </p>
              <p className="text-sm text-blue-600 dark:text-blue-400">
                📅 {appointmentDateFormatted} - Período {displayShift}
              </p>
            </div>
          </div>

          {/* Seleção de Responsável */}
          <div className="space-y-2">
            <Label htmlFor="responsible">Responsável que compareceu *</Label>
            {isLoadingResponsibles ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando responsáveis...
              </div>
            ) : responsibleOptions.length > 0 ? (
              <Select
                value={selectedResponsible}
                onValueChange={setSelectedResponsible}
              >
                <SelectTrigger id="responsible">
                  <SelectValue placeholder="Selecione o responsável..." />
                </SelectTrigger>
                <SelectContent>
                  {responsibleOptions.map((responsible) => (
                    <SelectItem key={responsible.id} value={responsible.id}>
                      <div className="flex flex-col">
                        <span>{responsible.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {responsible.type}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-destructive">
                Nenhum responsável cadastrado para este paciente.
              </p>
            )}
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
          {selectedProfessional && selectedResponsible && (
            <div className="p-4 bg-gradient-to-r from-blue-50 to-teal-50 dark:from-blue-950/30 dark:to-teal-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <h4 className="font-semibold text-blue-700 dark:text-blue-300 mb-2">
                Prévia do Atestado
              </h4>
              <p className="text-sm text-muted-foreground">
                Confirmo que,{' '}
                <strong>
                  {responsibleOptions.find((r) => r.id === selectedResponsible)
                    ?.name || ''}
                </strong>{' '}
                esteve presente na consulta fisioterapêutica do(a) menor{' '}
                <strong>{patientName}</strong> que ocorreu na data{' '}
                <strong>{appointmentDateFormatted}</strong>, no período{' '}
                <strong>{displayShift}</strong>.
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
              onClick={handleGenerateStatement}
              disabled={
                isLoading ||
                isSending ||
                !selectedProfessional ||
                !selectedResponsible
              }
              className="gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4" />
                  Gerar Atestado
                </>
              )}
            </Button>
          </div>

          {/* Botão de enviar ao responsável */}
          {selectedProfessional && selectedResponsible && (
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

AttendanceStatementGenerator.displayName = 'AttendanceStatementGenerator';
