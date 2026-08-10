// AI dev note: Flags para ligar/desligar funcionalidades sem mexer na lógica dos fluxos.
// Mantenha cada flag com o motivo e a data — elas são temporárias por natureza.

/**
 * Envio e conferência do código de 6 dígitos no WhatsApp.
 *
 * Quando `false`, os fluxos públicos (cadastro de paciente, agenda compartilhada e
 * cadastro de responsável financeiro) apenas verificam se o número existe/é válido
 * e seguem direto — sem enviar código e sem pedir código.
 *
 * Suspenso temporariamente em 10/08/2026 por problemas no envio das mensagens.
 * Voltar para `true` restaura o fluxo completo, sem nenhuma outra mudança de código.
 */
// Tipado como boolean (e não como o literal `false`) para o TS não tratar
// o caminho com código como código morto enquanto a flag está desligada.
export const WHATSAPP_CODE_VALIDATION_ENABLED: boolean = false;
