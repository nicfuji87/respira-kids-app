# Conferência de agenda (Conversas → Conferência)

Confere todo dia se a agenda bate com o que foi combinado no WhatsApp e consigo mesma,
para a cobrança do mês sair certa. Criada em 03/11/2026, depois da conferência manual de
outubro (38 achados nas conversas + 9 da própria agenda).

## Como roda

| Hora (Brasília)            | O quê                                                                                                                                       | Onde                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5h30                       | Lê as conversas com mensagem da família nas últimas 26h (caixa 39 recepção e 38 celular da Bruna) e pede ao `gpt-6-luna` a lista de sessões | pg_cron `conferencia-conversas` → `fn_conferencia_conversas_disparar(26)` → n8n flows-principal **RK Conferência de agenda** (`N4ZakTeyal7vAVWo`) |
| fim da leitura e 6h40      | Compara com a agenda e roda as checagens; abre e fecha itens                                                                                | `fn_conferencia_agenda_rodar(45)` (n8n e pg_cron `conferencia-agenda`)                                                                            |
| quando clicar em Atualizar | Só a comparação (sem IA)                                                                                                                    | aba Conferência                                                                                                                                   |

A IA só extrai sessões (paciente, dia, hora, profissional, combinada/realizada/cancelada/
remarcada/falta, mensagem que decide). Quem decide se há problema é o banco, por regra.
Equipe, grupos e números de teste são pulados; contato sem paciente no cadastro só vai para a
IA se a conversa falar de agenda.

## O que aparece

| Grupo                    | Tipos                                                                                                                                                                    | Origem            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| Corrigir antes de cobrar | status de consulta x pagamento contraditório, duplicada (< 90 min), horário fora do expediente (antes de 6h ou depois de 22h), desmarcada na conversa e ativa no sistema | agenda e conversa |
| Lançar ou acertar        | não lançada, sem cadastro, cancelada no sistema mas a conversa manteve                                                                                                   | conversa          |
| Decidir                  | falta sem consulta, desmarcação com menos de 6h cancelada sem cobrança                                                                                                   | conversa          |
| Conferir                 | consulta apagada (rastro em `agendamentos_excluidos` desde 03/11/2026) e casos manuais                                                                                   | agenda            |
| Só horário               | combinado num horário, lançado em outro no mesmo dia (só com confiança alta)                                                                                             | conversa          |

Itens das conversas só valem para dias que já passaram (o dia de hoje ainda pode ser lançado).
Item que deixa de valer fecha sozinho (`fechado_auto`); resolvido/ignorado à mão fica como está.
"Lançar" cria um registro em `agenda_sugestoes` (conversa_id = 0) e abre `/agenda/lancar/:id`.

## Tabelas e funções

- `conferencia_sessoes_conversa`: sessões lidas pela IA, uma por conversa + paciente + dia
  (a leitura mais nova vence; leitura mais antiga não sobrescreve).
- `conferencia_agenda_itens`: o relatório. `origem` = sistema | conversa | carga (outubro).
- `fn_conferencia_contexto(telefone)`, `fn_conferencia_sessoes_salvar(...)`: só service_role (n8n).
- `fn_conferencia_agenda_listar(mes)`, `fn_conferencia_agenda_marcar(id, status, nota)`,
  `fn_conferencia_item_lancar(id)`: admin e secretaria.

## Custo

Só a leitura usa IA: cerca de 100 conversas por dia, cada uma com até 120 mensagens dos
últimos 10 dias. As checagens e a comparação são SQL.

## Pontos conhecidos

- **Pagamento acompanha a consulta (06/11/2026, `pagamento_sincronia_e_cortesia.sql`).** O gatilho
  antigo só cancelava o pagamento quando a consulta _mudava_ para "cancelado". Escapavam
  consulta criada já cancelada, status "reagendado"/"erro", edição que devolvia o pagamento para
  "pendente" e consulta reativada. Agora `fn_agendamento_sincronizar_pagamento` (INSERT e UPDATE
  do status da consulta ou do pagamento) cancela o pagamento de consulta parada (menos pago e
  estornado) e reabre como "pendente" a consulta que volta a ficar ativa (sem fatura nem link).
  10 consultas antigas (jul a out/2026) foram corrigidas na hora, com o webhook de alteração
  desligado para não avisar famílias.
- **Cortesia:** status de pagamento `cortesia` para sessão que aconteceu e não será cobrada.
  Só admin e secretaria marcam, pelo botão "Marcar como cortesia" nos detalhes da consulta
  (`CortesiaAction`, RPC `fn_agendamento_cortesia`, motivo obrigatório). Quando é a secretaria,
  o aviso vai para o grupo 🩺 RK · Agenda e atendimentos (`ju_avisos_grupo`, origem CORTESIA).
  Fica fora de `podeGerarCobranca` e não aparece no seletor comum de status.
- A geração em massa no servidor (`generate-payment-links-bulk`) só confere ativo/fatura/link;
  quem filtra status é o front (`podeGerarCobranca`).
- A IA pode confundir marcar a próxima sessão com remarcar a atual. O prompt e o banco
  (desmarcação depois do horário é ignorada) seguram isso; o botão Ignorar existe para o resto.
