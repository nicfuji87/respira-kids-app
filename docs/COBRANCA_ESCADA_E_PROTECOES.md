# Cobrança: escada de inadimplência, travas e proteções do envio

Pedido do dono em 07/11/2026, depois da auditoria das cobranças de jun–out/2026.

## Travas (item 10)

- **Valor zero**: consulta que sai de R$ 0 (serviço SOCIAL) e estava "paga" sem fatura
  volta a "pendente" (`auto_mark_zero_value_as_paid`). Antes ficava paga sem cobrança.
- **Consulta cobrada não muda valor, serviço nem empresa**
  (`trg_agendamento_trava_cobrada`). Para mudar, tira-se a consulta da cobrança (editar
  a fatura ou o link) ou cancela-se a cobrança. Sistema (cron, edge, SQL) passa. A tela
  da consulta trava os três campos e explica.
- **Recebido em dinheiro**: botão na seleção de consultas do Financeiro. Cria o link sem
  envio, a edge `confirm-payment-link` (forma `dinheiro`, só admin/secretaria) cria a
  cobrança no Asaas, dá baixa em dinheiro (`receiveInCash`) e grava a fatura paga com
  `nfe_dispensada = true`. Nada vai para a família. Falhou no Asaas: o link é cancelado
  e as consultas voltam a pendente.

## Cobrança automática depois de 7 dias (itens 7 e 8)

- Cron `pre-cobranca-converter-asaas` (dias úteis, 10h) → `fn_pre_cobranca_converter_asaas`
  → chama `confirm-payment-link` com `forma: 'pix'`, `origem: 'auto_7dias'`.
- Entra: pré-cobrança vencida há 7 dias ou mais, só com sessões que já aconteceram, fora
  de negociação interna e sem pausa de cobrança. Resultado em `pagamento_links`
  (`convertido_auto_em` ou `conversao_erro`).
- O link da família continua o mesmo; a página passa a mostrar o Pix da cobrança.

## Escada de inadimplência (item 6)

Regras em `fn_cobranca_pode_lembrar` (vale para a régua do banco e para o n8n
"[Sistema RK] Asaas Inadimplencia 3"). Dias contam do vencimento original do link.

| Etapa                  | Robô                    | Equipe                                                                                    |
| ---------------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| até 15 dias            | lembra normal (ter/sex) | nada                                                                                      |
| 15 dias ou 4 lembretes | 1 vez por semana        | tarefa "Ligar ou mandar áudio" na aba Hoje (Financeiro)                                   |
| 30 dias                | para                    | tarefa "Robô parou de cobrar" + aviso na agenda ao marcar sessão                          |
| 60 dias                | parado                  | tarefa "Decidir a cobrança" (Gestão): acordo, Asaas com boleto e negativação ou suspender |

- `vw_inadimplencia_itens`: pré-cobranças + faturas Asaas em atraso com `dias` e `etapa`.
- `fn_inadimplencia_tarefas()` alimenta a aba Hoje (tipo `inadimplencia`, ref
  `inad:<responsável>:<15|30|60>`; resolver some só daquela etapa).
- `fn_inadimplencia_paciente(paciente)`: aviso no formulário de agendamento (só
  admin/secretaria veem valores).
- **Negociação interna** (`cobranca_negociacoes`, RPC `fn_cobranca_negociacao`, botão
  na tela Cobranças): tira a família do robô, da cobrança automática e dos números de
  inadimplência (`vw_pendencias_financeiras`).

## Tela de nota fiscal (item 1)

- A conferência diária de notas (`fn_asaas_reconciliar_aplicar`, tipo `nfe`) passou a
  gravar `faturas.nfe_status_asaas`, `nfe_erro_asaas`, `nfe_verificado_em`.
- `vw_nfe_pendencias` classifica cada nota pendente (`motivo`: nunca pedida, RPS,
  IBS/CBS, E0014, e-mail, endereço, telefone, sem nota por decisão...).
- `fn_fatura_nfe_dispensar(fatura, bool, motivo)`: marca/desmarca "sem nota por decisão".

## Envio que falha (item 11)

- `whatsapp_status`: cron `whatsapp-status-conferir` (a cada 5 min, 7h–20h) confere
  uazapi e QuePasa via pg_net (mesmos tokens da aba Integrações, no Vault).
- `fn_liberar_envio_lote`: WhatsApp fora do ar segura o lote e avisa o grupo (no máximo
  a cada 2 h), volta sozinho. Mais de 10% de falha (mín. 3) desde a última retomada pausa
  o lote (`cobranca_envio_pausas`) e avisa o grupo; só volta pelo botão "Retomar envio"
  (Financeiro > Faturas > Disparos e na lista de consultas).
- Cron `cobranca-reenviar-falhas` (10 em 10 min): quem falhou ganha 1 nova tentativa 30
  min depois (`data.reenvio = true`).
- n8n `[Sistema RK] Webhook Asaas` (editori, WCbXbaYj4lS3tZk6): na falha de um envio com
  `reenvio = true`, manda a cobrança por e-mail (nó "E-mail da cobrança (2ª falha)") e
  registra em `cobranca_disparo_log` com `canal = 'email'`.
