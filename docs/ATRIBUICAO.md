# Atribuição de pacientes (v2, sobre a base da Ju)

Do clique no anúncio à receita, sem mandar dado de paciente para Google ou Meta.
Aplicada em produção em 21/10/2026. Substitui o rascunho `app_01_atribuicao.sql`
do repositório do site, que dependia do Chatwoot.

## Princípios

- **Google/Meta recebem só o clique no WhatsApp.** Paciente, agenda, sessões e
  receita ficam aqui. Nenhuma tabela `atrib_*` guarda gclid, gbraid, wbraid,
  fbclid ou telefone (só a chave DDD + 8 dígitos, para casar conversas).
- **Paciente não é telefone.** Aquisição = 1º atendimento realizado da _criança_,
  creditado a uma única oportunidade. Família nova e contato novo são contados à parte.
- **Fontes oficiais:** agenda (`agendamentos`), faturas e pedidos da Ju. Nada é copiado;
  estado e etapa são recalculados dos fatos a cada 5 minutos.
- **Origem não verificável = não atribuída.** Nunca inventada.
- **Atribuição não é causalidade.** Os relatórios mostram o que foi ligado, com a
  amostra e a cobertura ao lado.

## Fluxo

```
Site (código RK-XXXXXXXX + UTMs, Supabase do site)
   │  família envia a mensagem
   ▼
ju_mensagens ──gatilho atrib_captura──► atrib_toques (+ oportunidade)
   │                                         │ job a cada 2 min (pg_net, token no vault)
   │                                         ▼
   │                           Supabase do site: obter_contato_clique_app → campanha
   ▼
job atrib_processar (5 min): pedidos da Ju, primeiros contatos, vínculo com a
agenda, etapa e estado ─► atrib_eventos (histórico só de inserção)
```

## Peças

| Objeto                            | Para quê                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `atrib_oportunidades`             | interesse comercial: abre com código, pedido de agendamento da Ju ou 1º contato de contato novo. Pedido de rotina de quem está em tratamento não abre. |
| `atrib_toques`                    | cada código RK (ou origem declarada por humano) com campanha, grupo, palavra-chave de **segmentação** ({keyword}, não é o termo pesquisado)            |
| `atrib_oportunidade_agendamentos` | vínculo com a agenda: `pedido_ju` (alta), `provavel` (média), `humano`                                                                                 |
| `atrib_eventos`                   | histórico imutável (UPDATE bloqueado) com a hora do fato                                                                                               |
| `atrib_custos_diarios`            | custo por conta × campanha × dia (`fn_atrib_custos_importar`, idempotente, `cost_micros`)                                                              |
| `atrib_cliques_whatsapp_diarios`  | contagem agregada de cliques no botão (vem do site)                                                                                                    |
| `vw_atrib_receita_sessao`         | receita por sessão: fatura paga rateada, estorno zera, cancelada+paga = `a_conciliar`                                                                  |
| `vw_atrib_aquisicoes`             | por criança: canal/campanha, família nova, receita 1ª sessão/30/90/180 dias, LTV realizado, sessões e retorno                                          |
| `vw_atrib_oportunidade_pacientes` | por oportunidade × criança: nova, recorrente (retenção) ou sem atendimento                                                                             |
| `vw_atrib_funil_mensal`           | funil por mês e origem                                                                                                                                 |
| `vw_atrib_campanhas_mensal`       | as três contagens (anúncio, WhatsApp, conversa), CAC de mídia, custo por agendamento, ROAS 1ª sessão/30/90/180 com flag de coorte madura e amostra     |
| `vw_atrib_cobertura_mensal`       | qualidade da medição: clique→mensagem, % não atribuídos                                                                                                |
| `fn_atrib_revisar`                | correção humana (estado, motivo, confirmar/remover vínculo, origem declarada)                                                                          |

Acesso: só admin lê; escrita só pelas funções/jobs. `atrib_config` guarda janelas
(vínculo 60 dias, perda por inatividade 30, tratamento ativo 90).

## Regras de crédito

1. Vínculo mais forte (humano > pedido da Ju > provável).
2. Empate: a oportunidade com origem rastreada (último toque não-direto).
3. Empate: a mais recente. O toque creditado é o último **antes** de o agendamento ser criado.

Paciente já atendido que volta por campanha conta como retenção, não entra no CAC.

## Custos do Google Ads (fase 2, `atribuicao_v2_custos.sql`)

- **Script:** `scripts/google-ads/atrib-custos.js`, colado na conta 874-439-1492 e
  agendado para rodar diariamente. A cada execução manda os últimos 7 dias (por dia e
  campanha: `cost_micros`, impressões, cliques, nome e status) e o total da conta por dia.
- **Entrada:** `fn_atrib_custos_receber(p, p_token)` pela chave pública + token próprio
  (vault `atrib_custos_token`; trocar com `vault.update_secret` e colar no script).
  Nenhuma credencial administrativa do Supabase vai para o Google.
- **Validação:** conta fixa (`atrib_config.google_ads_conta_id`), moeda BRL, janela de no
  máximo 31 dias, campos numéricos. Rejeição não muda nada e fica registrada.
- **Idempotência:** cada envio substitui a janela daquela conta. Repetir não duplica;
  ajustes do Google em dias anteriores são absorvidos.
- **Conciliação:** soma das campanhas × total da conta por dia; diferença acima de
  1 centavo marca a importação como `divergente` (dados entram, painel avisa).
- **Monitoramento:** `vw_atrib_custos_status` (uma linha por plataforma): última
  importação, cobertura, último status, `desatualizado` (sem importação há 36 h).
- **Regra do ROAS:** `vw_atrib_campanhas_mensal.custo_status` = `completo` |
  `desatualizado` | `sem_dados` | `nao_se_aplica`. CAC, custo por agendamento e ROAS só
  aparecem com custo completo; fora disso são NULL ("não disponível"), nunca zero.
  O gasto inteiro da campanha é o denominador. O ROAS é "atribuído observado": parte das
  conversas pode não ter origem vinculada — ler junto da cobertura.
- **Coorte:** pelo mês do clique (`vw_atrib_aquisicoes.mes_origem`), alinhado ao mês do
  gasto. Quem clicou em outubro e foi atendido em novembro conta em outubro; a receita de
  novembro e dezembro entra na coorte de outubro pelos horizontes 30/90/180, uma vez só.
- **Indicador renomeado:** `taxa_vinculacao_rk_observada` (cliques no botão → mensagens
  com código). Não é taxa de conversão do WhatsApp.

## Testes

`supabase/tests/atribuicao_v2_cenarios.sql` — 34 verificações com dados fictícios,
numa transação sempre desfeita: 1ª criança pelo Google, 2º filho, dois responsáveis,
paciente antigo voltando, remarcação, cancelamento e recuperação, falta cobrada,
fatura com desconto e sessão não paga, estorno, sem origem, fatos fora de ordem,
reprocessamento, reconstrução do zero; custos (importar, repetir, reprocessar, divergência,
moeda/conta/linha inválidas, token errado, custo completo × parado, campanha sem custo) e
coorte de um mês para o outro. Carga real: 0,8 s na 1ª rodada, 0,2 s nas seguintes.

**Conferência com dados reais (21/10/2026, só totais):** a receita por sessão bate com as
faturas pagas — jul R$ 124.560,00 (exato), ago R$ 184.750,00 × 184.750,02 (2 centavos de
arredondamento do rateio), set R$ 151.900,00 (exato); 661 faturas, nenhuma sem sessão.
Pagamento fora de fatura no trimestre: R$ 3.200 (quase tudo sessão de valor zero).

## Limites conhecidos

- `contato_novo` só enxerga o histórico da Ju (desde out/2026) e o cadastro; lead
  antigo que nunca virou cadastro pode aparecer como novo.
- `pago_em` antigo pode ser data pura gravada como meia-noite UTC; cartão parcelado
  entra inteiro na data do pagamento.
- Margem de contribuição ainda não calculada (comissão, imposto, taxa de cartão,
  materiais): o painel deve chamar de receita, não de lucro.
- O job precisa rodar continuamente: se ficar parado semanas, um código novo da
  mesma família pode cair na oportunidade anterior (o crédito por criança continua certo).

## Pendências

- Colar e agendar o Google Ads Script (precisa de quem tem acesso à conta) e, na
  primeira vez, rodar com `DIAS = 31` para trazer o histórico.
- Validar uma aquisição paga de ponta a ponta quando a campanha estiver no ar
  (clique no anúncio → RK → WhatsApp → agenda → atendimento → receita).
- Painel admin. Classificação de qualificação/motivo de perda pela análise da noite (fase 3).
- Meta: anúncio de clique para WhatsApp (dados de referral na Entrada).
- Jurídico: base legal de cada operação (dado de saúde de criança: art. 11 da LGPD),
  retenção (24 meses proposto) e LIA. Anonimização ainda **não** agendada.

## Rollback

`supabase/migrations/atribuicao_v2_custos_rollback.sql` (fase 2, desfaz só os custos),
`supabase/migrations/atribuicao_v2_ju_rollback.sql` (sistema, tudo) e
`docs/atribuicao/sql/site_02_leitura_app_rollback.sql` (repo do site).
