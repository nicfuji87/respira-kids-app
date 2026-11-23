# Google Ads — estrutura e regras das campanhas (v2.2, 25/10/2026)

Criadas pelo script `scripts/google-ads/criar-campanhas.js` (tudo PAUSADO). Este documento
explica o porquê.

**Como o script cria (v3, depois do 1º Visualizar de 25/10):** o Visualizar mostrou que (1) o
Google recusa algumas palavras-chave por política ("não atende às diretrizes editoriais" —
ex.: "fisioterapia infantil", "fisioterapeuta pediátrico", "torcicolo congênito" exata; a
decisão é por texto exato) e (2) local/idioma/vínculo de listas dão erro genérico quando a
campanha ainda não existe. Por isso: **fase 1** atômica (listas, orçamentos, campanhas,
grupos, anúncios, recursos — tudo isso passou); **fase 2** com ids reais e falha parcial
(local, idioma, listas, negativas, palavras-chave), registrando cada `RECUSADA`; no fim,
`VERIFICA` confere DF + português + listas em cada campanha. Rodar de novo = modo reparo
(só cria o que falta). Palavras recusadas: ver o motivo na interface ao adicionar uma delas
e, se a política permitir, pedir exceção/revisão.

**Execução real (25/10/2026 17:57):** 394 operações concluídas + 33 erros = as 427 planejadas.
Campanhas (todas pausadas): Respiratória `24396048449`, Desenvolvimento `24401740240`,
Marca `24401740243`. Local DF, português e listas entraram nas 3 (a Marca recebe só a lista
"Emprego e formação", de propósito). Ficaram 93 palavras-chave. Os 33 erros são todos
palavras-chave, e o motivo real (visto na interface) é **"Health in personalized
advertising"** — o classificador trata a palavra de saúde como se fosse segmentação por
público sensível. É um falso positivo para Pesquisa (palavra-chave é segmentação
contextual) e a política é **passível de exceção** ("Solicitar uma exceção" no formulário
de adicionar palavras-chave). Muitas recusadas já têm variação próxima aceita (sem acento,
com/sem "para", ordem trocada), que a correspondência de frase cobre. As do grupo
bronquiolite ficam de fora até a revisão clínica.

**Exceção pedida (25/10/2026, autorizada pelo dono):** as 25 recusadas fora do grupo
bronquiolite foram readicionadas pela interface com "Solicitar uma exceção" marcado
(Fisioterapia pediátrica 10, Desenvolvimento motor 4, Torcicolo 2, Assimetria 2,
Respiratória infantil 7). Todas entraram como "Em análise"; a revisão do Google aprova ou
reprova cada uma. Conferir a coluna Status antes de ativar: se alguma ficar "Reprovada",
manter a variação aceita e não insistir. As 8 do grupo bronquiolite NÃO foram enviadas
(pedir exceção junto com a revisão clínica).

**Anúncio de Torcicolo reprovado (26/10/2026):** "Substâncias não aprovadas — O destino contém:
VIRA A". O Google lê "vira a cabeça" como o remédio Vira-A (vidarabina). A página trocou para
"gira a cabeça" (respirakids-site#25) e a reprovação foi contestada com "Fiz alterações". Regra:
**nunca escrever "vira a" em página de destino de anúncio.**

## Contexto que define a estratégia

- **Demanda pequena.** Volumes nacionais (Semrush, br): "fisioterapia respiratória
  infantil" 720/mês, "fisioterapia respiratória bebê" 590, "torcicolo congênito" 1.000,
  "plagiocefalia" 12.100 (muito informativa), "fisioterapia infantil" 1.600. O DF é
  ~1,5–3% disso — estimativa nacional. Os primeiros 7 dias servem para achar erros,
  buscas ruins e falhas de tracking; conclusão sobre a demanda do DF só com 30–45 dias
  (parte das buscas de baixo volume nem aparece no relatório de termos). Logo: poucas
  campanhas, sem fragmentar.
- **CPC baixo e pouca concorrência** (R$ 0,50–0,80 nacional; sem dados de anunciantes
  concorrentes no Semrush para esses termos).
- **Saúde:** sem remarketing, sem públicos de dados próprios, sem personalização.
- **Lead mais quente:** todo anúncio leva ao site (sem WhatsApp/ligação no anúncio).
- **Foco na clínica (decisão do dono, 25/10):** atendemos em casa, mas não anunciamos;
  "domiciliar", "atendimento em casa", "home care" entram numa lista de negativas
  ("em casa" sozinho não: "exercícios em casa" é família pedindo orientação).

## Estrutura

| Campanha                                | Grupos (página de destino)                                                                                                                                                                                        | Orçamento/dia |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| RK \| Pesquisa \| Respiratória \| DF    | Fisioterapia respiratória infantil · Bronquiolite, catarro e aspiração **pausado até revisão clínica** (`/fisioterapia-respiratoria/`)                                                                            | R$ 20         |
| RK \| Pesquisa \| Desenvolvimento \| DF | Torcicolo congênito (`/torcicolo-em-bebes/`) · Assimetria craniana (`/assimetria-craniana/`) · Desenvolvimento motor (`/desenvolvimento-motor/`) · Fisioterapia pediátrica (`/fisioterapia-pediatrica-brasilia/`) | R$ 30         |
| RK \| Pesquisa \| Marca                 | Marca e equipe (`/`)                                                                                                                                                                                              | R$ 5          |

~R$ 1.650/mês (aprovado). Valores atuais (desde 28/10: Respiratória 30 → 20,
Desenvolvimento 20 → 30). Teto de CPC do Maximizar cliques: R$ 5 (Resp./Desenv., desde
03/11) e R$ 1,50 (Marca). Local: Distrito Federal por **presença**; português; só
Pesquisa Google (sem parceiros, sem Display).

- **Intenção de contratar primeiro.** Termos "nus" e muito informativos (`plagiocefalia`,
  `braquicefalia`, `assimetria craniana`, `torcicolo congênito`, `estimulação precoce`,
  `fisioterapia respiratória`) só na **exata**; na frase, só com bebê/tratamento/
  fisioterapia. Sintoma puro ("bebê com catarro") fica de fora na fase 1 — é pergunta de
  saúde, não procura por atendimento. Aspiração de secreções (serviço real) entra só
  ligada a atendimento profissional ("aspiração nasal bebê" puro traz quem quer usar
  aspirador em casa).
- **Bronquiolite/aspiração pausado** até a responsável técnica aprovar textos e página
  (a indicação depende do quadro; ex.: a NICE não recomenda fisioterapia torácica de
  rotina na bronquiolite sem comorbidades). A revisão vale para a OFERTA, não só para o
  texto: enquanto pausado, o grupo geral da respiratória e o genérico mantêm as negativas
  de condição (bronquiolite, catarro, chiado, secreção, aspiração, asma, pneumonia) —
  essas buscas ficam sem anúncio até a aprovação; aí é só ativar o grupo.
- **Frase + exata** na fase 1. Ampla/AI Max só na fase 3.
- **8 listas compartilhadas** (`RK NEG | …`, 226 termos): emprego/formação; gratuito/
  público (SUS, HRAN, HMIB…); informativo/caseiro; adulto/outras áreas; **convênios** —
  sempre as expressões de credenciamento ("aceita convênio", "pelo plano", "rede
  credenciada"…); com `NEGAR_OPERADORAS = true` também
  "convênio/plano de saúde" soltos e as operadoras (nacionais e as fortes no DF: Cassi,
  GEAP, Saúde Caixa, Postal Saúde, INAS/GDF Saúde, Capesesp, E-Vida, Fusex/Fusma/Funsa,
  Plan-Assiste, Pró-Social, STF-Med, TST/TRT Saúde, Serpro…). Custo conhecido: a negativa
  vale para a busca inteira, então "fisioterapia cassi reembolso" também é bloqueada;
  **decisão de 25/10: `false`** nos primeiros 30 dias — medir quantos contatos citam
  operadora, quantos aceitam particular, quantos agendam e quanto custam; se for ruim,
  virar `true`; **atendimento em casa**; outras
  cidades; produtos/compras. A Marca só recebe emprego.
- **Sem negativas cruzadas entre campanhas** (v1 tinha; a auditoria apontou que buscas
  combinadas como "torcicolo e bronquiolite" ficavam inelegíveis nas duas). Quem decide
  entre palavras-chave elegíveis é o Google (prefere a mais idêntica à busca). Ficam só:
  marca negada nas genéricas; o grupo genérico (pediátrica) nega os temas específicos —
  a busca não sai de circulação, só vai para o grupo específico.
- **Anúncios:** 1 RSA por grupo, 15 títulos/4 descrições, sem fixar; `{KeyWord:…}` no 1º
  título; sem inserção de local. Mensagem própria por serviço (aspiração de secreções;
  exercícios e posicionamento para os pais; avaliação motora completa). O grupo geral da
  respiratória não promete efeito clínico ("conduta definida após a avaliação").
- **Preço certo por serviço:** respiratória/pediátrica "a partir de R$ 280" (vale após o
  reajuste de 1º/11). Torcicolo/assimetria/motor **sem preço no anúncio**: a sessão é a
  partir de R$ 320, mas a **avaliação motora é R$ 370** (tipo_servicos) — "a partir de
  R$ 320" criaria expectativa errada na 1ª consulta. ⚠️ As páginas desses serviços dizem
  "a partir de R$ 320" e não citam a avaliação de R$ 370 — corrigido no site em 25/10
  (dono confirmou: avaliação inicial obrigatória de R$ 370 nos três; sessões a partir de
  R$ 320).
- **Recursos da conta:** 6 sitelinks, 8 frases de destaque, snippet "Serviços"; local do
  Perfil da Empresa (vinculado). **Antes de ativar**, pela interface: logo, nome da
  empresa e imagens (fotos da clínica).

## Tracking (não mexer)

- **Sufixo de URL final só na CONTA** (`utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_id={campaignid}&utm_term={keyword}&utm_content={creative}&rk_adgroup={adgroupid}&rk_match={matchtype}&rk_network={network}&rk_device={device}`).
  Sufixo em campanha/grupo/anúncio **substitui** o da conta. Rede de segurança: sem UTM,
  o site marca `google/cpc` + `sem-sufixo` pelo gclid.
- Conversão principal: **Conversa iniciada (WhatsApp)** (upload de hora em hora);
  "Clique WhatsApp (site)" secundária.
- No sistema: código RK → `atrib_toques` (`google_ads`, campanha/grupo/palavra) → agenda
  → receita; custo diário pelo script de custos → CAC/ROAS no `/marketing`.

## Lances por fase (critérios, não só contagem)

1. **Fase 1:** Maximizar cliques, teto R$ 3,50 (marca R$ 1,50).
2. **Fase 2 → Maximizar conversões** quando, na campanha, nos últimos 30 dias: ≥ 15
   conversas iniciadas **e** uploads sem erro por 14 dias **e** ≥ 50% das conversas com
   intenção de contratar no `/marketing` (qualidade). Sem CPA alvo por 2 semanas.
3. **CPA desejado** depois de 2–3 semanas estáveis, ≈ CPA real; ajuste máx. 15%/semana.
4. **Fase 3:** ≥ 30 conversões/mês → experimento 50/50 com ampla (ou AI Max).

**Conversões mais profundas (decisão pendente do dono):** hoje o Google só recebe
"conversa iniciada". O próximo degrau seria "pedido de agendamento" (a Ju abriu
AGENDAMENTO — evento comercial, sem dado clínico) como conversão de maior valor.
Agendamento/comparecimento/receita **não** vão ao Google (decisão de 21/10: saúde) —
ficam no `/marketing`, que é onde se decide orçamento.

## Rotina

- **Diária (1ª semana):** termos de pesquisa → negativar; conferir uploads (Metas →
  Uploads) e `google_ads` no `/marketing`; impressões reais do DF vs. estimativa (sem concluir sobre demanda antes de 30–45 dias).
- **Semanal:** termos de pesquisa, parcela perdida por orçamento/ranking, qualidade dos
  anúncios, `utm_content=sem-sufixo` no painel (= sufixo mexido), testes de títulos.
- **Mensal:** CAC e ROAS 1ª sessão/30 dias no `/marketing`; realocar orçamento pela
  receita. Sazonalidade: respiratória sobe no outono/inverno (bronquiolite, mar–jul).

## Diário de ajustes

**27/10/2026 (1,5 dia no ar: 7 cliques, R$ 18,78; 1º lead pago às 05:25 pela
"clínica de fisioterapia respiratória")**

- 13 negativas de curiosidade na lista "RK NEG | Informativo e caseiro" ("quando o
  bebê", "com quantos meses", "como acontece", "começa a sentar/andar/engatinhar",
  "psicomotor", "marcos/fases do desenvolvimento"…) — vieram de termos reais da
  Desenvolvimento.
- Pausada "fisioterapia respiratoria infantil" (sem acento, nota de qualidade 1); a
  versão com acento cobre a busca.
- Removida "bebê só vira a cabeça para um lado" e trocado "vira a cabeça" por "gira a
  cabeça" no blog (respirakids-site#27): a 1ª contestação do torcicolo foi negada ainda
  por "VIRA A". Anúncio e sitelink de torcicolo contestados de novo em 27/10.
- Logo reprovado por "espaço em branco": trocado por versão recortada
  (`google-ads-recursos/logo-quadrado-v2-1200x1200.png`, o desenho ocupa 96%). A conta
  aceita 1 logo só — o antigo foi removido antes.
- "Local actions - Directions" (Rotas) apareceu como principal, mas fora das metas da
  conta: não entra nas conversões das campanhas e o campo não é editável.
- Site (respirakids-site#27): ao entrar, "Medição e anúncios" já vem ativada (aviso
  "ao continuar navegando, você concorda", só o link "Gerenciar cookies"). Antes,
  ninguém aceitava cookies e a "Conversa iniciada" nunca chegava ao Google; agora o
  gclid é guardado para todos que não desligarem.
- Leituras sem mexer na conta: usar o script "Campanhas" em Visualizar (já autorizado).
  Atenção: Visualizar e Salvar gravam o código — restaurar `criar-campanhas.js` depois.

**28/10/2026 (2,5 dias: 415 impressões, 30 cliques, R$ 67,01; 4 conversas pagas,
nenhuma agendada ainda)**

- Os 3 primeiros uploads da "Conversa iniciada" (27/10) foram recusados por formato de
  hora: o Google não aceita "20261027 211001 America/Sao_Paulo" nem "...-03:00" (offset
  com dois-pontos). Aceito: "2026-10-27 21:10:01 America/Sao_Paulo" (tabela da ajuda
  7014069). Script corrigido no Ads e no repo; os 3 cliques reenviados às 08:58 ("3
  concluídos"). Ao executar à mão no editor, aparece o diálogo "Visualizar antes de
  executar?" — é preciso clicar "Executar sem visualizar".
- Torcicolo: 2ª contestação também negada (anúncio segue "Reprovado").
- R$ 9,49 (14%) foram para nomes de outras clínicas ("qualifisio advance", "aquafisio
  asa sul"), puxados pela palavra "fisioterapia asa sul".
- Leitura (script "Campanhas" em Visualizar): grupo **Bronquiolite estava ATIVO** (o
  script criou pausado; reativado pela interface em 27/10 09:14, login brunacurylp),
  anúncio aprovado, 3 palavras elegíveis, 0 impressões. Desenvolvimento perdia 46% das
  impressões por orçamento; Respiratória já aparecia em 73% (4% perdido por orçamento).
- Aplicado por `scripts/google-ads/ajustes-2026-10-28.js` (18 alterações, sem erro):
  grupo Bronquiolite PAUSADO; "fisioterapia asa sul" PAUSADA (63 impr., 4 cliques,
  R$ 12,65, zero conversa); lista nova "RK NEG | Concorrentes" (fisiotrauma, qualifisio,
  aquafisio, videre, fisioclinic(a), fisioquer, san corp, clinica recuperar) ligada à
  Respiratória e à Desenvolvimento; "tummy time" e "jeito certo" no Informativo;
  orçamentos Desenvolvimento R$ 30 e Respiratória R$ 20 (total segue R$ 55).
  "Estimulação precoce"/"prematuro" NÃO negativados (famílias reais).
  `criar-campanhas.js` atualizado igual.
- Conversa iniciada ganhou confirmação: a cada hora o script compara, por dia do clique,
  o que enviou com o que o Google contou; confirma, reenfileira após 24 h ou marca
  "falhou" após 2 reenvios (execução acusa erro). Banco: respirakids-site
  `site_05_conversoes_confirmacao.sql` (aplicado).
- 29/10 — análise de 26–28/10: 48 cliques, R$ 106,31, 6 conversas pagas (todas com
  código; Google contou as 5 enviadas com gclid). 3 das 6 perguntaram de convênio
  (sinal gravado nas 3). Fisioterapia pediátrica: 4 conversas por R$ 41; Desenvolvimento
  motor: 10 cliques, 0 conversa, buscas de "como fazer" → 9 negativas novas no
  Informativo (`scripts/google-ads/ajustes-2026-10-29.js`). Janela de tempo passou a
  contar VISITANTES (site_06 + `atribuicao_v2_janela_visitante.sql`): dois toques do
  mesmo visitante deixavam a conversa "ambígua" e uma paciente atendida ficou sem origem
  (conversa 5633, religada).
- 30/10 — **pacote anti-convênio** (dono: "convênio não é nosso público"). Antes:
  Ads × GA4 × sistema batiam (7 toques no WhatsApp nos três; 5 conversões enviadas = 5
  contadas). 3 de 6 conversas pagas perguntaram de plano, nenhuma busca citou convênio e
  5 de 7 toques vieram do botão flutuante no celular. Fora do pago, ~1 em 4 contatos novos
  pergunta de convênio (a maioria sem origem: Maps/perfil, indicação). Aplicado:
  - `ajustes-2026-10-30.js` (69 alterações): anúncio novo em Respiratória infantil,
    Fisioterapia pediátrica, Desenvolvimento motor e Assimetria com "Atendimento
    Particular" fixado na posição 2 e "sem convênio" fixado na descrição 1 (o antigo segue
    ativo até o novo ser aprovado; rodar o script de novo para pausá-lo); 49 negativas de
    operadora/convênio (NEGAR_OPERADORAS = true); 11 de "como fazer"; capacete/órtese;
    pausadas "desenvolvimento motor bebê/infantil". Torcicolo e Marca de fora.
  - Site (respirakids-site#28): etiqueta "Particular · sem convênio" acima do botão
    flutuante + linha "particular, sem convênio" abaixo dos botões do topo.
  - Conversão só de conversa qualificada (site_07 + `atribuicao_v2_conversao_qualificada`,
    cron 30 min): espera 24 h; convênio sem agendamento não vai ao Google.
  - Manual (dono): "não atendemos convênio; nota para reembolso" no Perfil da Empresa e na
    descrição do WhatsApp Business.
- 30/10 — **só dias úteis** (dono: recepção atende sábado alternado e nunca domingo).
  `scripts/google-ads/agenda-anuncios.js` nas 3 campanhas: seg 6h–24h, ter–qui o dia todo,
  sex até 18h (fuso da conta = São Paulo). Orçamento diário mantido. Próximo teste
  sugerido: domingo 18h–22h, julgar por agendamento depois de 2–3 domingos.
- 03/11 — **análise completa** (26/10–03/11): 87 cliques, R$ 211,78, 9 conversas pagas
  (4 de convênio, 3 delas antes do pacote de 30/10), 1ª conversa paga com agendamento
  em andamento (03/11). Ads × GA4 × sistema batem: 11 cliques no WhatsApp nos três;
  6 "Conversa iniciada" enviadas = 6 contadas. Fim de semana sem impressão (agenda ok).
  Achados: Desenvolvimento perdia 49–90% por classificação (0% por orçamento), CTR
  esperado "abaixo da média", anúncios novos com força "Média" (pinagem), Torcicolo
  ainda reprovado após as contestações de 28/10. Aplicado (`ajustes-2026-11-03.js`,
  21 alterações): teto de CPC R$ 3,50 → R$ 5 (Respiratória e Desenvolvimento); 11
  negativas ("atividades", "tipos de", "hidroterapia"… + cardiopulmonary, respicare,
  fisioemov); palavras "fisioterapia pulmonar infantil/bebê" e "fisioterapia neonatal";
  anúncio e sitelink de Torcicolo recriados (revisão nova) depois de tirar toda palavra
  "vira" do site (respirakids-site#29: post renomeado para "...cabeca-gira-sempre..."
  com 301, capa no próprio site, /equipe/ → /nossa-equipe/).
  Search Console (28 dias): 74 cliques, 2,06 mil impressões, posição 6,7; 17 páginas
  indexadas; perfis da equipe "rastreados, não indexados".
- Torcicolo: a contestação de 27/10 nem foi revisada ("Duplicado"); site inteiro sem
  "vira a" (varredura do HTML de todas as páginas do sitemap). Nova contestação deixada
  preenchida para o dono enviar.
- 03/11 (tarde) — **auditoria externa dos ajustes de 03/11**, correções:
  - Torcicolo resolvido: anúncio novo (830401024705) e sitelink novo "Torcicolo em
    Bebês" APROVADOS e elegíveis; o anúncio antigo segue pausado e reprovado. Sobra 1
    sitelink "Fisioterapia Respiratória" como "aprovado (limitado)" — é o aviso "Corrigir
    sitelinks reprovados" do painel; não está reprovado.
  - **Negativas amplas por engano:** as listas nasceram em frase, mas os scripts de
    28/10, 29/10, 30/10 e 03/11 usavam `addNegativeKeywords('texto')`, que cria AMPLA.
    Eram 94 (Informativo 30, Convênio 49, Concorrentes 12, Produtos 3); as de várias
    palavras ("idade para", "sinais que", "como estimular") bloqueavam qualquer busca com
    as palavras em qualquer ordem. `ajustes-2026-11-03b.js` troca todas por frase num lote
    atômico (190 operações) e passa "fisioterapia neonatal" para **exata** ("neonatal"
    também é UTI; "fisioterapia pediátrica e neonatal" já entra pela frase do grupo).
    **Executado 03/11 16:29** (dono autorizou): 190 operações; conferido na conta: 286
    negativas em frase, 0 amplas; neonatal só exata. Script "Campanhas" restaurado.
  - Scripts corrigidos para novas execuções: negativa nova sempre em frase e só a frase
    conta como existente; palavra existente = texto + tipo; recusa do Google derruba o
    script; checagem da conta; Torcicolo separa existir / aprovado / reprovado (reprovado
    não é recriado: contesta) e o sitelink usa a decisão de política, não primary_status.
  - Negativas genéricas de 03/11 conferidas nos termos de 30 dias: "atividades",
    "sensoriais", "alto contraste", "como incentivar", "hidroterapia" só pegaram buscas
    informativas, nenhuma com clique; mantidas (em frase).
  - `criar-campanhas.js` não é rotina de sincronização (modo reparo não troca tipo, não
    pausa, não refaz anúncios); conferir a conta com relatório só leitura.
  - Próximos 7–14 dias **sem mexer em lance**: julgar o teto de R$ 5 por perda por
    classificação, cliques, CPC médio, conversas qualificadas, custo por conversa
    qualificada e agendamentos. Se só subir CPC e gasto, voltar para relevância (anúncio,
    página, termos) antes de lance. Depois de estabilizar: testar menos pinagem.
  - Consentimento/cookies e gclid: mantidos como estão (decisão do dono, 28/10).
- 04/11 — **análise (26/10–04/11):** R$ 315,40, 113 cliques (CPC médio R$ 2,79), 11 conversas
  pagas (R$ 28,67 cada), 1 agendamento (paciente nova pela Marca, 12/11). Por campanha:
  Desenvolvimento R$ 226,65 / 6 conversas / 0 agendamento; Respiratória R$ 82,82 / 4 / 0;
  Marca R$ 5,93 / 1 / 1. Rastreio bate: 13 toques no WhatsApp no Ads, 11 conversas no app
  (2 toques sem mensagem), 8 "Conversa iniciada" enviadas = 8 contadas, 2 de 04/11
  esperando as 24 h. Teto R$ 5 (dia 1–2): Desenvolvimento perdeu menos por classificação
  (50% → 38%), mas o CPC médio subiu para R$ 4,81 e o gasto passou do orçamento (R$ 48 e
  R$ 38 com orçamento de R$ 30). Respiratória não perde por orçamento (0%): mais verba não
  compra impressão. Gargalo agora é conversa → agendamento: das 5 conversas pagas desde
  30/10, 2 bebês prematuros pararam no último passo e o follow-up automático não mandou
  nada (IA "INCERTA" e "BLOQUEADA"); as outras 2 foram bloqueadas por "menção de saúde".
  Convênio desde 30/10: 2 de 5 perguntaram (1 agendou mesmo assim). Anúncio diz "a partir
  de R$ 280" na respiratória; o preço de dia útil é R$ 260 (a Ju informa R$ 260).
- 06/11 — **análise (26/10–05/11):** R$ 401,52, 135 cliques, 14 conversas pagas (R$ 28,68
  cada), 2 agendamentos de pacientes novas (Marca 03/11 → respiratória 12/11; "estimulação
  precoce bebê" 05/11 → avaliação motora 06/11, a 1ª de anúncio que não é de marca), ou
  R$ 200 por agendamento. Desenvolvimento R$ 269,32 / 9 conversas / 1; Respiratória
  R$ 125,14 / 4 / 0; Marca R$ 7,06 / 1 / 1. Rastreio: 16 toques no Ads × 14 conversas;
  10 "Conversa iniciada" no Google = 10 no site; 1 descartada por convênio (regra ok).
  Teto R$ 5 (04–05/11 × 26/10–02/11), Desenvolvimento: CPC R$ 2,38 → R$ 4,27, parcela
  ~49% → 66%, cliques/dia iguais (~10), conversas/dia 0,8 → 2 (amostra pequena).
  Respiratória: 15 cliques e só 1 conversa em 04–05/11. QS 2–3 com página "abaixo da
  média" em "fisioterapia respiratória" [E] e "fisioterapia pediátrica".
  **Follow-up automático não age nos melhores leads** (21/10–06/11, contatos novos):
  9 bloqueados porque a Lolô escreveu "desculpe a demora" (fn_followup_clima_ruim conta
  desculpa da equipe como clima ruim), 6 por "hospital/internação" mesmo após alta
  (v_re_saude), ~3 pela IA ("preocupação clínica" = catarro em prematuro) e ~4 "INCERTA"
  quando a Ju ofereceu agendar e a família parou.
- 16/11 — **análise de 3 semanas (26/10–15/11):** R$ 777,06, 230 cliques, 25 conversas pagas
  (R$ 31 cada), 2 pacientes novas que viraram recorrentes (motora: 06, 12 e 19/11;
  respiratória: 12 e 17/11), ou R$ 388 por paciente. Desenvolvimento R$ 559 / 159 cl /
  20 conversas / 1 paciente; Respiratória R$ 196 / 52 / 4 / 0; Marca R$ 22 / 19 / 1 / 1.
  Conversão de contato novo em agendamento (26/10–13/11): Google Ads 2/25 (8%), orgânico
  1/9, Instagram 8/14, sem origem (Maps/indicação) 25/76; convênio em 36% dos pagos.
  Teto R$ 5: Desenvolvimento CPC 2,26 → 4,18, parcela 46% → 58%, conversa/clique 8% → 15%,
  custo por conversa estável (~R$ 28) — manter. Respiratória: 0 conversa na semana 09/11.
  Termos visíveis = 40% do gasto; desperdício visível pequeno (~R$ 35: "é normal",
  "guideline", "como moldar", concorrentes antes da lista). Leads fora do escopo (fratura,
  gesso) vêm de buscas genéricas. "Calls from ads" (4) e "Local actions" estão como
  principais. Nada alterado na conta.
- 20/11 — **revisão das sugestões (auditoria externa × dados):** 26/10–19/11 ≈ R$ 1.012,
  33 conversas pagas, 4 pacientes atendidas (2 pela Marca) + 1 reservada (plagiocefalia,
  26/11). Semana 16–19/11: 3 de 8 viraram atendimento/reserva (antes 2 de 25) — bebês com
  catarro atendidos no mesmo dia; horário concreto e rápido fecha. Desenvolvimento passou
  a perder 13% por orçamento (29% em 17/11; gasta R$ 43–68/dia com orçamento de R$ 30) →
  subir para R$ 35 se justifica. Respiratória gasta ~R$ 16/dia útil e perde 0–2% por
  orçamento: cortar para R$ 15 não economiza nada. [fisioterapia respiratória] exata:
  169 imp / 10 cl / R$ 27 / 0 conv, termos genéricos (não necessariamente adulto) —
  pausar é ganho pequeno. Assimetria já tem os títulos certos (a auditoria acertou); o
  peso está no H2 e na descrição fixos ("Atendimento Particular"/"sem convênio") em 100%
  das impressões. Concorrente "Heads" (capacete craniano) gastou R$ 13,38 → negativa.
  Metas: só "Conversa iniciada" (site) e "Calls from ads" entram no lance; ações locais
  não — nada a corrigir. **Ligações: 14 desde 27/10** (12 atendidas, 2 perdidas; 4 com mais
  de 60 s), fora do funil do WhatsApp. Nada alterado na conta.
- 20/11 (noite) — **`ajustes-2026-11-20.js` executado ~19:55** (dono autorizou): Desenvolvimento
  R$ 30 → R$ 35/dia; negativas em frase "heads" (Concorrentes), "guideline" e "artigo"
  (Informativo), "fratura" e "gesso" (Adulto). Visualização: 6 operações, sem erro. O lote
  é atômico e se confere sozinho depois de executar (falha se o orçamento ou alguma
  negativa não ficar certo). Registro (19:55): APLICADO 6 operações; CONFERE orçamento
  R$ 35 e as 3 listas ok. Script "Campanhas" restaurado (criar-campanhas.js, 1539 linhas).
  Reavaliar em ~2 semanas: perda por orçamento de Desenvolvimento e conversas/agendamentos.
- 21/11 — **Retorno no sistema:** aba Marketing → "Retorno dos anúncios" (PR em
  feat/marketing-retorno-anuncios; RPC `fn_atrib_retorno_anuncios`, migration
  `atribuicao_v2_retorno_anuncios.sql`, aplicada). Mostra investimento, conversas,
  pacientes, sessões e receita realizada (sessão já passada, mesmo sem baixa) /
  recebida (fatura paga) / agendada, ROAS e CAC com e sem a campanha de marca.
  26/10–21/11: R$ 1.055 investidos; 4 pacientes novas (Isaac, Yan, Clarice, João),
  11 sessões realizadas, R$ 3.340 realizados + R$ 1.160 agendados (ROAS realizado
  3,2x; sem marca 1,6x; CAC R$ 264, sem marca R$ 513). Recebido R$ 0 até a cobrança
  mensal. Escopo da clínica (dono): sem pós-fratura; pós-cirúrgico e prematuros sim;
  até 12 anos.
- 23/11 — **escopo clínico nos anúncios** (`ajustes-2026-11-23.js`, executado 17:13, 12 operações,
  conferido): lista "Adulto e outras áreas" + "entorse", "luxação", "ortopedia",
  "adolescente(s)", "uti adulto", "intensivista"; saiu "uti" (barrava pós-UTI neonatal, público
  da clínica). Frases de destaque novas: "Crianças até 12 anos" e "Prematuros e pós-cirurgia"
  (aguardam revisão do Google). A Ju já tinha o escopo (ESCOPO_ATENDIMENTO, commit 0109924).
  Script "Campanhas" restaurado.
- 23/11 — **análise completa (26/10–23/11):** R$ 1.111, 318 cliques, 36 conversas, 6 pacientes
  atendidas + 1 agendada (Davi, plagiocefalia, 26/11 — cadastro no telefone da mãe, sem vínculo
  automático). Respiratória R$ 314 → 3 pacientes (CAC ~R$ 105; todas com horário no mesmo dia);
  Desenvolvimento R$ 768 → 1 paciente + 1 agendada (grupo Pediátrica genérico: R$ 392, 19
  conversas, 0 pacientes); Marca R$ 28 → 2. Receita realizada R$ 4.440 + R$ 1.420 agendada.
  **Bloqueio grande:** o grupo "Fisioterapia respiratória infantil" nega asma, catarro, pneumonia,
  secreção, chiado, aspiração e bronquiolite (para mandar ao grupo Bronquiolite), mas o grupo
  Bronquiolite está PAUSADO → ninguém aparece nessas buscas. Anúncios/sitelink dizem "a partir de
  R$ 280" na respiratória; o valor com a Beatriz é R$ 260.
- 23/11 (noite) — **revisão do grupo Bronquiolite preparada para a Bruna:** página
  https://claude.ai/artifact/X4R4UC6GzMhdRNPWN7qFii (situações a anunciar, títulos, descrições,
  preço, palavras). Script pronto e NÃO executado: `scripts/google-ads/ativar-bronquiolite.js`
  (anúncio novo + pausa do antigo + negativas do grupo em lote atômico; palavras por situação
  aprovada com falha parcial; ativa o grupo só com anúncio e palavra ativos). Bronquiolite aguda
  começa como `false` até o "sim" dela. Correção: o pico de bronquiolite no DF é mar–jul, não nov.
- 23/11 (noite, 2) — **plano dos grupos da Respiratória aprovado (revisão externa + dono):**
  A "Catarro e secreções" (novo), B "Bronquiolite em bebês" (reaproveita o grupo pausado, com as 9
  palavras e o anúncio antigos pausados), C "Pós-pneumonia e pós-internação" (novo), + negativa
  "sibilância" no grupo geral. Fora: asma, chiado, aspiração e **respiração bucal (dono: não
  anunciar)**. "internação" só vira negativa no geral depois de ver o C elegível. Orçamento segue
  R$ 60/dia. **Cookies e consentimento ficam como estão (dono, de novo em 23/11).**
  Preço conferido no sistema: respiratória DU R$ 260 (Beatriz) / R$ 280 (Bruna e Flávia), sem
  avaliação cobrada à parte (a 1ª sessão já é a avaliação); a Beatriz fez 38 das 81 primeiras
  sessões respiratórias dos últimos 60 dias → "a partir de R$ 260" é legítimo.
  Script único `scripts/google-ads/grupos-respiratoria.js` (substitui ativar-bronquiolite.js):
  cria tudo PAUSADO, nunca ativa grupo, confere no fim (grupos pausados, anúncio e URL, palavras
  não aprovadas, negativas que bloqueiam, Desenvolvimento/Marca sem mudança). **Visualizado em
  23/11 18:42: 22 operações na fase 1, 3 palavras de B ok, nenhuma palavra bloqueada; NÃO
  executado.** Script "Campanhas" restaurado e conferido.
  Site: rascunho no ramo `feat/pagina-respiratoria-grupos` (worktree
  `respirakids-site/.wt/resp-page`, sem commit): seções catarro / bronquiolite ("nem todo bebê
  precisa") / pós-internação, aspiração "não é rotina", serviço sem "tratamento de bronquiolite",
  R$ 260 na respiratória, preços do site alinhados (FAQ, contato, início; domiciliar R$ 300) e
  "fala direto com a fisioterapeuta" trocado por "equipe da clínica". Falta aprovação da Bruna.
- 23/11 (noite, 3) — **textos finais dos grupos A/B/C** (`grupos-respiratoria.js`): junção do plano
  externo com a versão anterior; **sem "Nota 5,0 no Google" (dono: não faz sentido)**. A ganhou as 5
  palavras do plano e negativas "bronquiolite", "asma", "chiado", "sibilância" (não mistura ofertas);
  C ficou com 3 palavras de frase (as variações exatas/"infantil" do plano já são cobertas). O script
  agora lista negativas da campanha que podem barrar pós-alta (hospital, intubado, uti, alta…).
  Fora deste pacote: reescrever os anúncios já aprovados (geral, Desenvolvimento, Marca) e negativas de
  respiração bucal. Correção de preço nos anúncios existentes fica para um passo separado. Não visualizado de
  novo nem executado.
- 23/11 (noite, 4) — **leitura das ferramentas do Google (só leitura):**
  - Termos 26/10–23/11: 431 termos, 71 com clique. **Nenhum** com catarro/bronquiolite/pneumonia/internação
    (bloqueados pelas negativas do grupo geral). Lixo a negativar: concorrentes "heads" (3 cl, R$ 13),
    "qualifisio", "fisiotrauma"; "capacete"/"órtese craniana"/"como moldar"; "pdf"/"manual"/"guideline";
    "psicomotricidade educação infantil"; "autistas" (fora do escopo?).
  - Planejador (DF, média 12 meses): fisioterapia respiratória 210/mês; infantil 40; bebê 40; fisio
    respiratória infantil 40; pulmonar 50; **bronquiolite: ~10 variações com fisioterapia de ~10/mês
    (pico mar–jul)**; fisioterapia para catarro 10; pneumonia infantil 10; o resto "—". Grupos novos
    somam ~150 buscas/mês no ano, pouco agora (nov). Acrescentadas "bronquiolite fisioterapia" (B) e
    "fisioterapia pneumonia infantil" (C) ao script.
  - Qualidade: QS 1–3 na maioria; "experiência na página" abaixo da média em quase todos os grupos
    (respiratória, torcicolo, motor) e CTR esperado abaixo da média. Marca QS 8.
  - Parcela de impressões 14 dias: Respiratória 81% (perde 19% por classificação, 0% por verba);
    Desenvolvimento 55% (perde 35% por classificação, 9% por verba); Marca 97%.
  - Leilão: só 1 concorrente visível (fisioclinicfisioterapia.com.br, 6% de sobreposição).
  - Celular 91% dos cliques; madrugada (0–5h) 14 cliques R$ 45, 1 conversa; 15 ligações (2 perdidas).
  - Recomendações abertas: parceiros de pesquisa, Display, PMax, CPA desejado, maximizar conversões,
    imagens dinâmicas — todas a ignorar por enquanto.
  - Site: aviso de convênio saiu da hero; abertura "não é bater nas costas" reescrita (PR #30 do site).
- 23/11 (noite, 5) — **auditoria das negativas por data (só leitura):** os termos ruins são
  histórico, não falha atual. Concorrentes aquafisio/fisiotrauma/qualifisio só em 27/10; "heads" em
  16 e 19/11 (R$ 14), antes da negativa de 20/11; "guideline" 13/11, antes de 20/11; capacete/órtese
  só de 27 a 30/10 (lista "Produtos e compras" segurou depois). **Não houve busca com "pdf"**: o
  "fisioterapia respiratoria pdf" era só o rótulo de uma categoria dos insights de termos, não uma
  busca real; a negativa "pdf" está na lista Informativo. Seguem aparecendo, sem clique relevante:
  "tem cura", "o que fazer", "é normal" (informativos; não negativar genérico). "fisioterapia em
  crianças autistas" veio da Pediátrica (Motor já nega autismo/tea; "autismo" não pega "autistas").
  Lista "Atendimento em casa" nega "domiciliar" nas duas campanhas, embora a clínica ofereça
  domiciliar: decisão do dono a confirmar. Nenhuma negativa nova aplicada.
  Site (PR #30, commit e903052): bronquiolite "não indicada de rotina", aspiração genérica até a
  Bruna descrever, pós-internação com indicação e liberação, estimulação precoce na página motora,
  bloco de escolha na pediátrica, avaliação motora "a partir de R$ 370" (Bruna/Flávia R$ 390).
- 23/11 20:08 — **autismo bloqueado** (`ajustes-2026-11-23b.js`, executado e conferido): lista
  "RK NEG | Adulto e outras áreas" (Respiratória e Desenvolvimento) + "autismo", "autista",
  "autistas", "tea" (frase). Dono: público é de bebês/prematuros, fase em que o autismo quase não é
  diagnosticado; sem oferta para TEA. Segunda visualização: "nada (já estavam)". Script "Campanhas"
  restaurado e conferido.
- 23/11 — **domiciliar continua bloqueado nos anúncios** (dono): o tráfego pago é para levar a
  família até a clínica. A lista "RK NEG | Atendimento em casa" (domiciliar, a domicílio, em casa…)
  fica como está nas campanhas Respiratória e Desenvolvimento.
