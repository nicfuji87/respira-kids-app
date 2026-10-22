# Follow-up automático de agendamento (V2.1)

Retoma uma conversa em que a família pediu para agendar, a clínica respondeu e a família
parou numa ação necessária (escolher horário, preencher o cadastro, responder uma pergunta).
Sem aprovação humana: quando há dúvida, o sistema decide sozinho **não enviar**. Uma
oportunidade perdida é preferível a um contato inadequado.

Estado em 21/10/2026: **sombra**. O motor faz tudo (programa, redige, valida, revalida),
mas a tentativa termina em `SIMULADA`; **nada vai para a família**
(`followup_config.envio_ativo = false`). Só ligar depois de validar o redator em conversas
novas, que não foram usadas para ajustar o prompt.

## A sequência

| | Quando | Texto |
|---|---|---|
| FU1 | 1 h de inatividade elegível depois da última fala da clínica, na próxima janela | Escrito pela IA no momento do envio, a partir da conversa (até ~180 caracteres, no máximo 1 pergunta, prefixo `*Ju:*`). |
| FU2 | 24 h depois do FU1 aceito, se a família não respondeu | Fixo: "Qualquer coisa, estamos por aqui! 💚" |

Depois, silêncio. No máximo 2 mensagens por oportunidade e 1 sequência por família a cada
30 dias. Janela: dias úteis, 9h às 17h30 (Brasília, feriados do DF em `followup_feriados`).
Fora da janela, o horário passa para a próxima abertura (`fn_followup_proxima_janela`).

Canal: **uazapi** (mesmo número da Ju). Autorização: toda família que entrou em contato está
autorizada (`followup_contatos.autorizacao` padrão `confirmada`); só `recusada` bloqueia.

## Três camadas

| Camada | Onde | O que faz |
|---|---|---|
| A. Regras objetivas | `fn_followup_avaliar()` | Bloqueios e prazos objetivos (upsert; mudança de situação ou de fala reabre a análise da IA). |
| B. Analisador (IA) | n8n `RK Follow-up - Analisador` (`nyTr0ryZO53KVsmT`) | Classificação estruturada (JSON Schema estrito). Não escreve texto nem envia. Cópia do prompt: `scripts/n8n/followup-analisador-montar-pedido.js`. |
| C. Motor | `fn_followup_decidir`, `_revalidar`, `_reservar`, `_resultado`, `_pos_envio` (`followup_motor.sql` + `followup_v21.sql`) | Programa FU1, revalida tudo, reserva atomicamente, registra resultado e programa o FU2. |
| Redator (IA) | n8n `RK Follow-up - Envio` (`YXoMqSHSG828oDsX`) | Escreve o FU1 perto da hora do envio. Pode devolver `gerar=false`. Cópia do prompt: `scripts/n8n/followup-redator-montar-redacao.js`. |

Agenda: um único pg_cron, `followup-ciclo`, a cada 10 min em dia útil (`*/10 12-20 * * 1-5`
em UTC) → `fn_followup_ciclo` = regras → decidir → IA de análise → manutenção →
`fn_followup_envio_disparar` (pg_net com o segredo `ju_tarefas_token`, webhook
`rk-followup-envio-8e4a1c7d2f`).

## Fluxo do envio (n8n)

`fn_followup_envio_lote` entrega as tentativas vencidas (e já aplica cancelamentos) →
para cada uma: precisa texto? → redator → `fn_followup_texto_registrar` (valida) →
`fn_followup_reservar` → se `sombra = false` e `envio_ativo`, `POST /send/text` na uazapi
com `*Ju:*\n` + texto (sem retry) → `fn_followup_resultado`. `ENVIADA` só com id de
mensagem; timeout vira `ENTREGA_DESCONHECIDA` (nunca reenviada sozinha).

## Validação do texto (`fn_followup_validar_texto`)

Reprova: vazio, longo (> 220), mais de uma pergunta, qualquer número/horário, valor ou
desconto, promessa de vaga, conteúdo clínico, cobrança de resposta ("não respondeu",
"sumiu"), reapresentação, prefixo ou link, diminutivo, sem evidência, evidência que não é da
conversa, pendência incerta ou incoerente com o cenário. Erro técnico do redator: tenta de
novo até 3 vezes. `gerar=false` → `SUPRIMIDA ia_nao_gerou`; reprovado →
`SUPRIMIDA texto_reprovado:<regra>`. Texto com mais de 15 min é redigido de novo.

## Cancelamentos (revalidação antes de cada envio)

Família respondeu; Lolô falou, pausou ou assumiu; agendamento criado; etiqueta SEM IA;
recusa ("PARAR", "não quero receber" → `followup_contatos` recusada); sinal clínico;
oportunidade fechada; limite por família; fora da janela; chave geral desligada. Falhou:
não envia. O gatilho `trg_followup_reagir` em `ju_mensagens` reage na hora e nunca quebra o
recebimento da Ju.

## Estados (`followup_tentativas`; histórico só de inclusão em `followup_transicoes`)

`PROGRAMADA → EM_ENVIO → ENVIADA | FALHOU | ENTREGA_DESCONHECIDA`, depois
`RESPONDIDA | CONVERTIDA | ENCERRADA`; também `CANCELADA`, `SUPRIMIDA` e, em sombra,
`SIMULADA`. Índice único por (oportunidade, tipo, sequência, sombra) impede duplicidade.

## Ligar e desligar

```sql
UPDATE public.followup_config SET envio_ativo = true  WHERE id = 1; -- liga
UPDATE public.followup_config SET envio_ativo = false WHERE id = 1; -- chave geral (desliga na hora)
```

Métricas: `vw_followup_metricas`.

## Testes

- `supabase/tests/followup_motor_testes.sql`: 21 verificações do motor v1.
- `supabase/tests/followup_v21_testes.sql`: 20 verificações da V2.1 (sequência FU1→FU2,
  janela, cancelamentos, validação do texto, sombra, reserva dupla).
- `supabase/tests/followup_ia_casos.sql`: 27 conversas fictícias para o analisador. Com
  `gpt-6-luna` (21/10): 27/27, aceitando "cobrança em dobro" como PENDENCIA_OPERACIONAL (nunca vira mensagem).
- `supabase/tests/followup_redator_casos.sql`: 8 conversas fictícias para o redator pelo
  caminho real, em sombra. 21/10 (gpt-6.1-sol): 8/8. Seis textos aprovados e distintos
  (cadastro, escolha entre opções, manhã/tarde, ver horários, bairro, nome e idade);
  sintoma respiratório e "clínica ficou de mandar" corretamente não gerados. Depois de rodar:
  fechar a janela de teste e apagar os dados `55619990007N` (bloco no fim do arquivo).

## Modelos (21/10/2026)

| Uso | Modelo |
|---|---|
| Analisador (classificação) | `gpt-6-luna`, raciocínio baixo |
| Redator do FU1 | `gpt-6.1-sol`, raciocínio baixo (mesma voz da Ju) |

Chat completions com `json_schema` estrito funciona nos dois. Atenção: nesses modelos (e no
gpt-5.5), ferramentas + `reasoning_effort` só funcionam em `/v1/responses`.

## Pendências antes de `envio_ativo = true`

1. Medir em conversas novas, em sombra, comparando com leitura humana independente; zero
   violação de bloqueio.
2. Métricas no painel de Marketing.
