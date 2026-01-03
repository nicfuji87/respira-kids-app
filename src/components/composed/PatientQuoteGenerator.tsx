// AI dev note: PatientQuoteGenerator - Componente para geração de orçamentos de fisioterapia
// Permite selecionar múltiplos serviços e digitar quantidade de sessões para cada um
// Disponível apenas para roles admin e secretaria
// Após gerar, permite enviar ao responsável via webhook

import React, { useState, useEffect } from 'react';
import { FileText, Loader2, Printer, Plus, Trash2, Send } from 'lucide-react';
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
import { ScrollArea } from '@/components/primitives/scroll-area';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';
import type { SupabaseTipoServico } from '@/types/supabase-calendar';

export interface PatientQuoteGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  patientCpf?: string | null;
}

interface ServicoSelecionado {
  id: string;
  servicoId: string;
  quantidade: number;
}

interface QuoteItem {
  nome: string;
  descricao: string | null;
  quantidade: number;
  valorUnitario: number;
  subtotal: number;
}

// Formatar CPF: 000.000.000-00
const formatCPF = (cpf: string | null | undefined): string => {
  if (!cpf) return 'Não informado';
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length !== 11) return cpf;
  return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

// Formatar valor monetário
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

// Formatar data brasileira
const formatDateBR = (date: Date): string => {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

// Gerar ID único
const generateId = () => Math.random().toString(36).substr(2, 9);

export const PatientQuoteGenerator: React.FC<PatientQuoteGeneratorProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName,
  patientCpf,
}) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [tiposServico, setTiposServico] = useState<SupabaseTipoServico[]>([]);
  const [isLoadingServicos, setIsLoadingServicos] = useState(true);

  // Estado para rastrear se orçamento foi gerado
  const [quoteGenerated, setQuoteGenerated] = useState(false);
  const [generatedQuoteData, setGeneratedQuoteData] = useState<{
    itens: QuoteItem[];
    valorTotal: number;
    htmlContent: string;
  } | null>(null);

  // Lista de serviços selecionados
  const [servicosSelecionados, setServicosSelecionados] = useState<
    ServicoSelecionado[]
  >([{ id: generateId(), servicoId: '', quantidade: 8 }]);

  // Calcular totais
  const calcularTotais = () => {
    let valorTotal = 0;
    const itens: QuoteItem[] = [];

    servicosSelecionados.forEach((item) => {
      const servico = tiposServico.find((s) => s.id === item.servicoId);
      if (servico && item.quantidade > 0) {
        const subtotal = servico.valor * item.quantidade;
        valorTotal += subtotal;
        itens.push({
          nome: servico.nome,
          descricao: servico.descricao,
          quantidade: item.quantidade,
          valorUnitario: servico.valor,
          subtotal,
        });
      }
    });

    return { valorTotal, itens };
  };

  const { valorTotal, itens } = calcularTotais();

  // Carregar tipos de serviço
  useEffect(() => {
    const loadTiposServico = async () => {
      setIsLoadingServicos(true);
      try {
        const { data, error } = await supabase
          .from('tipo_servicos')
          .select('*')
          .eq('ativo', true)
          .order('nome');

        if (error) throw error;
        setTiposServico(data || []);
      } catch (error) {
        console.error('Erro ao carregar tipos de serviço:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar os tipos de serviço',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingServicos(false);
      }
    };

    if (isOpen) {
      loadTiposServico();
    }
  }, [isOpen, toast]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setServicosSelecionados([
        { id: generateId(), servicoId: '', quantidade: 8 },
      ]);
      setQuoteGenerated(false);
      setGeneratedQuoteData(null);
    }
  }, [isOpen]);

  // Adicionar novo serviço
  const handleAddServico = () => {
    setServicosSelecionados((prev) => [
      ...prev,
      { id: generateId(), servicoId: '', quantidade: 8 },
    ]);
    setQuoteGenerated(false);
  };

  // Remover serviço
  const handleRemoveServico = (id: string) => {
    if (servicosSelecionados.length > 1) {
      setServicosSelecionados((prev) => prev.filter((item) => item.id !== id));
      setQuoteGenerated(false);
    }
  };

  // Atualizar serviço selecionado
  const handleServicoChange = (id: string, servicoId: string) => {
    setServicosSelecionados((prev) =>
      prev.map((item) => (item.id === id ? { ...item, servicoId } : item))
    );
    setQuoteGenerated(false);
  };

  // Atualizar quantidade
  const handleQuantidadeChange = (id: string, quantidade: number) => {
    setServicosSelecionados((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, quantidade: Math.max(1, quantidade) } : item
      )
    );
    setQuoteGenerated(false);
  };

  // Verificar se um serviço já foi selecionado
  const isServicoJaSelecionado = (servicoId: string, currentId: string) => {
    return servicosSelecionados.some(
      (item) => item.servicoId === servicoId && item.id !== currentId
    );
  };

  // AI dev note: URL da imagem de fundo do orçamento no Supabase Storage
  const BACKGROUND_IMAGE_URL =
    'https://jqegoentcusnbcykgtxg.supabase.co/storage/v1/object/public/respira-documents/orcamento_fisio_capa.png';

  // Gerar HTML do orçamento
  const generateQuoteHTML = (
    itensCalc: QuoteItem[],
    valorTotalCalc: number
  ): string => {
    const hoje = formatDateBR(new Date());

    // Gerar linhas de serviços
    const servicosHTML = itensCalc
      .map(
        (item) => `
        <div class="service-item">
          <p><span class="service-label">Serviço:</span> ${item.quantidade} ${item.quantidade === 1 ? 'sessão' : 'sessões'} de ${item.nome}${item.descricao ? ` com auxílio da técnica de ${item.descricao}` : ''}.</p>
          <p class="service-detail"><span class="service-label">Valor unitário:</span> ${formatCurrency(item.valorUnitario)}</p>
          <p class="service-detail"><span class="service-label">Subtotal:</span> ${formatCurrency(item.subtotal)}</p>
        </div>
      `
      )
      .join('');

    // AI dev note: Template HTML do orçamento usando imagem de fundo do Supabase Storage
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Orçamento - ${patientName}</title>
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
      height: 297mm;
      margin: 0 auto;
      position: relative;
      background-image: url('${BACKGROUND_IMAGE_URL}');
      background-size: 100% 100%;
      background-position: top left;
      background-repeat: no-repeat;
    }
    
    /* Conteúdo principal - posicionado sobre a imagem de fundo */
    .content {
      position: absolute;
      top: 180px;
      left: 60px;
      right: 60px;
      padding: 20px;
    }
    
    /* Título */
    .title {
      text-align: center;
      font-size: 16px;
      font-weight: 700;
      color: #333;
      margin-bottom: 30px;
      letter-spacing: 1px;
    }
    
    /* Seção de texto */
    .greeting {
      margin-bottom: 15px;
      font-size: 14px;
    }
    
    .intro-text {
      margin-bottom: 20px;
      color: #444;
      font-size: 14px;
    }
    
    /* Detalhes do serviço */
    .services-container {
      margin-bottom: 15px;
    }
    
    .service-item {
      margin-bottom: 15px;
      font-size: 14px;
    }
    
    .service-label {
      font-weight: 600;
      color: #333;
    }
    
    .service-detail {
      margin-left: 15px;
      margin-top: 2px;
      font-size: 13px;
    }
    
    .service-detail::before {
      content: "•";
      color: #40C4AA;
      font-weight: bold;
      margin-right: 8px;
    }
    
    /* Total */
    .total-container {
      margin: 15px 0;
      font-size: 14px;
    }
    
    .total-label {
      font-weight: 600;
      color: #333;
    }
    
    .total-value {
      font-weight: 700;
      color: #333;
    }
    
    /* Informações do paciente */
    .patient-info {
      margin: 20px 0;
      font-size: 14px;
    }
    
    /* Informações de pagamento */
    .payment-info {
      margin: 15px 0;
      color: #444;
      font-size: 14px;
    }
    
    /* Validade */
    .validity {
      font-style: italic;
      color: #666;
      margin: 20px 0;
      font-size: 13px;
    }
    
    /* Assinatura */
    .signature {
      margin-top: 40px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: 14px;
    }
    
    .signature-text {
      color: #333;
    }
    
    .signature-date {
      font-weight: 600;
      color: #333;
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
        height: 100vh;
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
    <div class="content">
      <h1 class="title">ORÇAMENTO DE SERVIÇOS DE FISIOTERAPIA</h1>
      
      <p class="greeting">Prezados,</p>
      
      <p class="intro-text">
        Apresentamos abaixo o orçamento referente aos atendimentos fisioterapêuticos:
      </p>
      
      <div class="services-container">
        ${servicosHTML}
      </div>
      
      <div class="total-container">
        <span class="total-label">Valor total estimado: </span>
        <span class="total-value">${formatCurrency(valorTotalCalc)}</span>
      </div>
      
      <div class="patient-info">
        <p><span class="service-label">Paciente:</span> ${patientName} — CPF ${formatCPF(patientCpf)}</p>
      </div>
      
      <p class="payment-info">
        O pagamento poderá ser efetuado por meio de transferência bancária ou PIX.
      </p>
      
      <p class="validity">
        <em>Este orçamento tem validade de 7 dias a contar da data de envio.</em>
      </p>
      
      <div class="signature">
        <div class="signature-text">
          Atenciosamente,<br>
          <strong>Equipe Respira Kids</strong>
        </div>
        <div class="signature-date">${hoje}</div>
      </div>
    </div>
  </div>
</body>
</html>
    `;
  };

  // Handler para gerar e imprimir o orçamento
  const handleGenerateQuote = () => {
    const servicosValidos = servicosSelecionados.filter(
      (s) => s.servicoId && s.quantidade > 0
    );

    if (servicosValidos.length === 0) {
      toast({
        title: 'Atenção',
        description: 'Adicione pelo menos um serviço com quantidade válida',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const { itens: itensCalc, valorTotal: valorTotalCalc } = calcularTotais();
      const htmlContent = generateQuoteHTML(itensCalc, valorTotalCalc);

      // Salvar dados do orçamento gerado
      setGeneratedQuoteData({
        itens: itensCalc,
        valorTotal: valorTotalCalc,
        htmlContent,
      });
      setQuoteGenerated(true);

      // Abrir nova janela para impressão/PDF
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();

        // Aguardar carregamento das fontes antes de imprimir
        setTimeout(() => {
          printWindow.print();
        }, 500);

        toast({
          title: 'Orçamento gerado',
          description: 'O orçamento foi aberto para impressão/download',
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
      console.error('Erro ao gerar orçamento:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível gerar o orçamento',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handler para enviar orçamento ao responsável via webhook
  const handleSendToResponsible = async () => {
    if (!generatedQuoteData) {
      toast({
        title: 'Atenção',
        description: 'Gere o orçamento primeiro antes de enviar',
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
      const fileName = `orcamento_${patientId}_${timestamp}.html`;
      const filePath = `orcamentos/${fileName}`;

      const htmlBlob = new Blob([generatedQuoteData.htmlContent], {
        type: 'text/html',
      });

      const { error: uploadError } = await supabase.storage
        .from('respira-documents')
        .upload(filePath, htmlBlob, {
          cacheControl: '3600',
          contentType: 'text/html',
        });

      if (uploadError) {
        console.error('Erro no upload:', uploadError);
        throw new Error('Erro ao fazer upload do orçamento');
      }

      // 3. Obter URL pública do arquivo
      const { data: urlData } = supabase.storage
        .from('respira-documents')
        .getPublicUrl(filePath);

      const pdfUrl = urlData.publicUrl;

      // 4. Preparar descrição dos serviços para o webhook
      const servicosDescricao = generatedQuoteData.itens
        .map(
          (item) =>
            `${item.quantidade}x ${item.nome} (${formatCurrency(item.subtotal)})`
        )
        .join('; ');

      // 5. Inserir na fila de webhooks (seguindo o padrão existente)
      // AI dev note: Seguir o mesmo formato do PatientContractSection e AdminContractGenerationStep
      const webhookPayload = {
        evento: 'orcamento_gerado',
        payload: {
          paciente_id: patientId,
          paciente_nome: patientName,
          paciente_cpf: patientCpf || null,
          responsavel_nome:
            patientData.responsavel_legal_nome ||
            patientData.responsavel_cobranca_nome,
          responsavel_telefone: patientData.responsavel_legal_telefone,
          responsavel_email: patientData.responsavel_legal_email || null,
          orcamento_url: pdfUrl,
          valor_total: generatedQuoteData.valorTotal,
          servicos: servicosDescricao,
          itens: generatedQuoteData.itens.map((item) => ({
            servico: item.nome,
            quantidade: item.quantidade,
            valor_unitario: item.valorUnitario,
            subtotal: item.subtotal,
          })),
          data_geracao: new Date().toISOString(),
        },
      };

      console.log('📤 Inserindo webhook na fila:', webhookPayload);

      const { error: webhookError } = await supabase
        .from('webhook_queue')
        .insert(webhookPayload);

      if (webhookError) {
        console.error('Erro ao criar webhook:', webhookError);
        throw new Error('Erro ao agendar envio do orçamento');
      }

      toast({
        title: 'Orçamento enviado!',
        description: `O orçamento foi enviado para ${patientData.responsavel_legal_nome || 'o responsável'}`,
      });

      // Fechar modal após envio bem-sucedido
      onClose();
    } catch (error) {
      console.error('Erro ao enviar orçamento:', error);
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
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-teal-600" />
            Gerar Orçamento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Paciente (somente leitura) */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">
              Paciente
            </Label>
            <div className="p-3 bg-muted/50 rounded-md">
              <p className="font-medium">{patientName}</p>
              {patientCpf && (
                <p className="text-sm text-muted-foreground">
                  CPF: {formatCPF(patientCpf)}
                </p>
              )}
            </div>
          </div>

          {/* Lista de Serviços */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Serviços *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddServico}
                className="gap-1 h-7 text-xs"
              >
                <Plus className="h-3 w-3" />
                Adicionar
              </Button>
            </div>

            <ScrollArea className="max-h-[240px] pr-3">
              <div className="space-y-3">
                {servicosSelecionados.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2 p-3 border rounded-lg bg-background"
                  >
                    <div className="flex-1 space-y-2">
                      {/* Serviço */}
                      <Select
                        value={item.servicoId}
                        onValueChange={(value) =>
                          handleServicoChange(item.id, value)
                        }
                        disabled={isLoadingServicos}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecione o serviço..." />
                        </SelectTrigger>
                        <SelectContent>
                          {tiposServico.map((servico) => (
                            <SelectItem
                              key={servico.id}
                              value={servico.id}
                              disabled={isServicoJaSelecionado(
                                servico.id,
                                item.id
                              )}
                            >
                              <div className="flex items-center justify-between w-full gap-2">
                                <span className="truncate">{servico.nome}</span>
                                <span className="text-muted-foreground text-xs flex-shrink-0">
                                  {formatCurrency(servico.valor)}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Quantidade */}
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={`qtd-${item.id}`}
                          className="text-xs text-muted-foreground whitespace-nowrap"
                        >
                          Sessões:
                        </Label>
                        <Input
                          id={`qtd-${item.id}`}
                          type="number"
                          min={1}
                          value={item.quantidade}
                          onChange={(e) =>
                            handleQuantidadeChange(
                              item.id,
                              parseInt(e.target.value) || 1
                            )
                          }
                          className="h-8 w-20"
                        />
                        {item.servicoId && (
                          <span className="text-xs text-muted-foreground">
                            ={' '}
                            {formatCurrency(
                              (tiposServico.find((s) => s.id === item.servicoId)
                                ?.valor || 0) * item.quantidade
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Botão remover */}
                    {servicosSelecionados.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveServico(item.id)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Resumo do Orçamento */}
          {itens.length > 0 && (
            <div className="p-4 bg-teal-50 dark:bg-teal-950/30 rounded-lg border border-teal-200 dark:border-teal-800 space-y-2">
              <h4 className="font-semibold text-teal-700 dark:text-teal-300">
                Resumo do Orçamento
              </h4>
              <div className="space-y-1 text-sm">
                {itens.map((item, index) => (
                  <div key={index} className="flex justify-between text-xs">
                    <span className="text-muted-foreground truncate max-w-[200px]">
                      {item.quantidade}x {item.nome}
                    </span>
                    <span className="font-medium">
                      {formatCurrency(item.subtotal)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-teal-200 dark:border-teal-800 mt-2">
                  <span className="font-semibold text-teal-700 dark:text-teal-300">
                    Total:
                  </span>
                  <span className="font-bold text-teal-700 dark:text-teal-300 text-lg">
                    {formatCurrency(valorTotal)}
                  </span>
                </div>
              </div>
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
              onClick={handleGenerateQuote}
              disabled={isLoading || isSending || itens.length === 0}
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
                  Gerar Orçamento
                </>
              )}
            </Button>
          </div>

          {/* Botão de enviar ao responsável - aparece após gerar */}
          {quoteGenerated && generatedQuoteData && (
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

PatientQuoteGenerator.displayName = 'PatientQuoteGenerator';
