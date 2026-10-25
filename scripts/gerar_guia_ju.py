"""Gera o Guia da Ju (PDF para a equipe da clínica).

Uso: python scripts/gerar_guia_ju.py docs/Guia_da_Ju.pdf
Linguagem simples, sem termos técnicos: o público é a equipe (recepção e fisios).
Atualizado em 25/10/2026: @ju também no WhatsApp da Bruna (pelo Chatwoot).
"""
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                KeepTogether, ListFlowable, ListItem)

OUT = sys.argv[1]
pdfmetrics.registerFont(TTFont('Seg', 'C:/Windows/Fonts/segoeui.ttf'))
pdfmetrics.registerFont(TTFont('SegB', 'C:/Windows/Fonts/segoeuib.ttf'))
pdfmetrics.registerFont(TTFont('SegI', 'C:/Windows/Fonts/segoeuii.ttf'))
pdfmetrics.registerFontFamily('Seg', normal='Seg', bold='SegB', italic='SegI', boldItalic='SegB')

TEAL = colors.HexColor('#0F766E')
TEAL_L = colors.HexColor('#E6F4F2')
RED = colors.HexColor('#B42318')
RED_L = colors.HexColor('#FDECEA')
AMBER = colors.HexColor('#B54708')
AMBER_L = colors.HexColor('#FEF0C7')
GRAY = colors.HexColor('#475467')
LINE = colors.HexColor('#D0D5DD')

base = ParagraphStyle('base', fontName='Seg', fontSize=10, leading=14, textColor=colors.HexColor('#1D2939'))
h_title = ParagraphStyle('t', parent=base, fontName='SegB', fontSize=24, leading=28, textColor=TEAL)
h_sub = ParagraphStyle('s', parent=base, fontSize=11, leading=15, textColor=GRAY)
h1 = ParagraphStyle('h1', parent=base, fontName='SegB', fontSize=13.5, leading=18, textColor=TEAL,
                    spaceBefore=12, spaceAfter=5)
cell = ParagraphStyle('cell', parent=base, fontSize=9.4, leading=12.6)
cellb = ParagraphStyle('cellb', parent=cell, fontName='SegB')
cellh = ParagraphStyle('cellh', parent=cell, fontName='SegB', textColor=colors.white)


def P(t, s=base):
    return Paragraph(t, s)


def bullets(items, style=base):
    return ListFlowable([ListItem(P(i, style), leftIndent=10, value='•') for i in items],
                        bulletType='bullet', start='•', leftIndent=10, bulletFontName='Seg',
                        bulletFontSize=9, bulletColor=TEAL, spaceBefore=1)


def box(content, bg=TEAL_L, border=TEAL):
    t = Table([[content]], colWidths=[174 * mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg),
        ('LINEBEFORE', (0, 0), (0, -1), 3, border),
        ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    return t


def table(rows, widths, head=True):
    data = []
    for i, r in enumerate(rows):
        st = cellh if (head and i == 0) else cell
        data.append([P(c, cellb if (not (head and i == 0) and j == 0) else st) for j, c in enumerate(r)])
    t = Table(data, colWidths=[w * mm for w in widths], repeatRows=1 if head else 0)
    style = [
        ('GRID', (0, 0), (-1, -1), 0.5, LINE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    if head:
        style.append(('BACKGROUND', (0, 0), (-1, 0), TEAL))
    t.setStyle(TableStyle(style))
    return t


def section(title, *flow, keep=1):
    return [KeepTogether([P(title, h1)] + list(flow[:keep]))] + list(flow[keep:])


s = []
s.append(P('Conheça a Ju', h_title))
s.append(P('A ajudante da recepção da Respira Kids · guia para a equipe · outubro de 2026', h_sub))
s.append(Spacer(1, 8))

s.append(box([
    P('<b>Em resumo:</b> a Ju é uma assistente virtual que responde o WhatsApp da clínica a qualquer hora. '
      'Ela resolve sozinha as coisas simples e passa o resto para a equipe pelo grupo <b>RK · Notificações</b>.'),
    Spacer(1, 4),
    P('<b>O que a equipe faz:</b> acompanhar o grupo, falar com a família quando a Ju pedir e, no fim, tocar em '
      '<b>Concluído</b>. Em caso de emergência, falar com a família na hora.'),
]))
s.append(Spacer(1, 6))
s.append(box([
    P('<b>Começa na sexta, 23/10:</b> a partir desse dia a Ju responde as famílias de verdade. Nos primeiros dias, '
      'fiquem de olho no grupo e mandem para o Nicolas o print de qualquer resposta estranha.'),
], AMBER_L, AMBER))

# 1
s += section('1. Quem é a Ju', bullets([
    'Ela responde no WhatsApp da clínica, <b>(61) 99131-0529</b>, de dia, de noite e no fim de semana.',
    'Se apresenta como "a ajudante da recepção". As mensagens dela começam com <b>"Ju:"</b> para a família saber '
    'quem está falando. Se alguém perguntar se ela é um robô, ela diz que sim.',
    'Ela só usa o que está no cadastro e na agenda da clínica, e as informações que a equipe passou para ela. '
    'Quando não sabe alguma coisa, não inventa: chama a equipe.',
    'Ela não responde os números da equipe (sócias, fisios e recepção).',
    'Escreve curto, como numa conversa. Fora do horário da clínica, avisa que a equipe responde quando o atendimento voltar.',
]))

# 2
s += section('2. O que ela resolve sozinha', table([
    ['Assunto', 'O que a Ju faz'],
    ['Dúvidas gerais', 'Endereço, horário, estacionamento, farmácia, quem é a equipe, que serviços a clínica oferece, '
                       'valores da tabela, formas de pagamento, parcelamento no cartão, reajuste de novembro e reembolso pelo plano.'],
    ['Consultas marcadas', 'Diz o dia, a hora e a fisio das consultas já marcadas. Se a família falar de uma consulta '
                           'que não está na agenda, ela não confirma nem desmente: chama a recepção.'],
    ['Contrato', 'Confere com a família para quem o contrato está indo (nome, WhatsApp e e-mail). Se estiver tudo certo, '
                 'reenvia. Se algum dado estiver errado, pede o certo, corrige e reenvia. Depois avisa o grupo do que mudou.'],
    ['Nota fiscal', 'Reenvia a nota que já saiu e pede a emissão da nota de uma consulta já paga.'],
    ['Link de pagamento', 'Se o link venceu, renova por mais 5 dias, com o mesmo valor.'],
    ['Atestado', 'Faz e manda o atestado de comparecimento de uma sessão que já aconteceu, depois de confirmar a data '
                 'e quem acompanhou a criança.'],
    ['Cancelar consulta', 'Cancela sozinha quando a família pede com 6 h ou mais de antecedência (se o pedido não '
                          'estiver claro, pergunta antes). A fisio e o grupo de atendimentos são avisados. Com menos de '
                          '6 h, com o horário já passado ou com cobrança gerada, passa para a recepção, sem falar de multa.'],
    ['Áudio, foto e PDF', 'Entende áudios (e manda o texto do áudio na conversa), fotos e documentos, como pedido médico '
                          'e comprovante.'],
], [38, 136]))

# 3
s += section('3. O que ela nunca faz', bullets([
    '<b>Marcar consulta.</b> Ela não oferece horário nem diz que tem vaga. Assim que a família pede para agendar, '
    'ela passa para a recepção e já pergunta o que falta (nome da criança, motivo, melhor dia e período).',
    '<b>Falar do caso da criança.</b> Ela não avalia sintomas, não dá diagnóstico e não orienta tratamento. Isso vai para as fisios.',
    '<b>Mexer em dinheiro.</b> Ela não faz cobrança nova, não dá desconto, não negocia e não confirma pagamento por comprovante.',
    '<b>Oferecer atendimento em casa.</b> Se perguntarem, ela diz que sim, a partir de R$ 320 (depende do bairro), '
    'pergunta o bairro e passa para a recepção.',
    'Indicar pediatra ou outro profissional (passa para as fisios) e mandar relatório ou prontuário.',
]))

# 4
s += section('4. Quando ela chama a equipe', keep=3, *[P(
    'A Ju manda uma mensagem no grupo <b>RK · Notificações</b> com o assunto, o nome da criança, o telefone, '
    'um resumo do que a família quer e o botão <b>Concluído</b>. Ela também coloca uma etiqueta na conversa:'),
    Spacer(1, 4),
    table([
        ['Etiqueta', 'Quando aparece'],
        ['Encaixe urgente', 'Assunto clínico urgente. Para as fisios.'],
        ['Lead sem agendar', 'Pedido de agendamento.'],
        ['Remarcar/cancelar', 'Remarcação, ou cancelamento que a Ju não pôde fazer (menos de 6 h).'],
        ['Revisar cobrança', 'Pagamento: comprovante, desconto, cobrança errada.'],
        ['NF pendente', 'Nota fiscal ou contrato.'],
        ['Responder', 'Todo o resto: dúvida clínica, reclamação, quem pediu para falar com uma pessoa, currículo, '
                      'fornecedor, assunto que a Ju não entendeu.'],
    ], [38, 136]),
    Spacer(1, 6),
    P('<b>Enquanto o pedido está aberto</b>, a Ju só responde dúvidas simples (valor, endereço, convênio) se a recepção '
      'ainda não entrou na conversa. O resto ela anota no próprio pedido no grupo: a mensagem antiga some e o pedido '
      'volta para o fim do grupo com a novidade. Ao tocar em Concluído, o pedido sai do grupo.'),
    Spacer(1, 4),
    P('<b>Lembretes</b> (no máximo 2 por pedido, no grupo, com o nome da criança e o resumo):'),
    Spacer(1, 3),
    table([
        ['Pedido', '1º lembrete', '2º lembrete', 'Quando'],
        ['Normal', 'depois de 10 min', 'depois de 30 min', 'Só no horário da clínica (seg a sex, 8h às 18h)'],
        ['Urgente', 'depois de 5 min', 'depois de 15 min', 'A qualquer hora'],
    ], [38, 32, 32, 72]),
])

# 5
s += section('5. Como encerrar um pedido', bullets([
    'Primeiro resolva com a família. Depois toque em <b>Concluído</b> na mensagem do grupo, <b>ou</b> tire a etiqueta da conversa.',
    'A Ju confirma no grupo e volta a atender aquela família.',
    '<b>Não esqueça de concluir:</b> enquanto o pedido estiver aberto, a Ju fica calada naquela conversa.',
]))

# 6
s += section('6. Quando alguém da equipe entra na conversa', bullets([
    'É só escrever para a família (pelo celular, computador ou tablet). A Ju <b>para sozinha</b>: fica 30 minutos '
    'sem responder no horário da clínica e 15 minutos fora dele. Cada mensagem nova da equipe renova esse tempo.',
    'Nesse tempo a conversa é de quem entrou. Se a família escrever algo que pareça emergência, chega no grupo um '
    '<b>ALERTA CLÍNICO</b> (a família não recebe nada automático).',
    'Se a família escrever e ninguém responder, a Ju volta a atender quando esse tempo acabar.',
    'Mesmo depois disso, se a recepção estiver conduzindo a conversa, a Ju não se mete: ela só responde uma pergunta '
    'nova e simples.',
    'As mensagens automáticas da clínica (lembrete de consulta, cobrança, pesquisa) não fazem a Ju parar.',
]))

# 7
emerg = [
    P('<font color="#B42318"><b>7. Emergência</b></font>', ParagraphStyle('he', parent=h1, spaceBefore=0)),
    P('Se a família contar um sinal de gravidade acontecendo agora (dificuldade para respirar, lábios roxos, criança '
      'muito mole, convulsão, engasgo que não passa, febre em bebê com menos de 3 meses), a Ju manda na hora o texto '
      'aprovado pelas fisios:'),
    Spacer(1, 3),
    P('<i>"Pelo que você descreveu, o mais seguro é procurar agora um pronto-socorro ou ligar para o SAMU (192). '
      'Estou avisando a equipe de fisioterapia da clínica agora."</i>'),
    Spacer(1, 4),
    bullets([
        'No grupo chega um pedido <b>URGENTE</b>.',
        'Se o texto não chegou para a família, o aviso no grupo diz <b>"ligue para a família agora"</b>.',
        'Se for algo grave que já passou ("ontem ele ficou roxo"), vai um pedido urgente para as fisios, sem orientação para a família.',
        '<b>O que fazer:</b> uma fisio ou a recepção fala com a família imediatamente. Depois, conclua o pedido.',
        'Fora do horário da clínica, vale a escala combinada pela equipe.',
    ]),
]
s.append(Spacer(1, 8))
s.append(KeepTogether(box(emerg, RED_L, RED)))

# 8
s += section('8. Etiqueta SEM IA (para a Ju não atender)', bullets([
    '<b>Para que serve:</b> para conversas que a Ju não deve atender de jeito nenhum (caso delicado, família que '
    'prefere falar só com a equipe).',
    '<b>Quem coloca e tira:</b> só a equipe, pelo celular ou computador. A Ju nunca mexe nessa etiqueta.',
    '<b>Com a etiqueta:</b> a Ju não responde e não faz nada. A recepção atende normalmente; lembretes e cobranças '
    'automáticos continuam.',
    '<b>Segurança:</b> se a família escrever algo que pareça emergência, chega no grupo um <b>ALERTA CLÍNICO</b>, mesmo '
    'com a etiqueta. Esse alerta procura palavras: não substitui olhar a conversa.',
    '<b>Quando tirar a etiqueta:</b> a Ju volta a atender só as mensagens novas.',
]))

# 9
s += section('9. O que aparece no grupo RK · Notificações', table([
    ['Mensagem', 'O que fazer'],
    ['Pedido novo (com botão Concluído)', 'Falar com a família, resolver e tocar em Concluído.'],
    ['URGENTE', 'Falar com a família na hora.'],
    ['"Ligue para a família agora"', 'Ligar na hora.'],
    ['ALERTA CLÍNICO', 'Abrir a conversa e olhar na hora.'],
    ['Pedido ainda sem resposta', 'Lembrete de um pedido aberto. Resolver ou concluir.'],
    ['Anotação da Ju', 'A família mandou algo novo num pedido já aberto. Ler antes de responder.'],
    ['A Ju corrigiu o contato do contrato', 'Só para registro. A família trocou o e-mail ou o WhatsApp e a Ju reenviou.'],
    ['O contrato não chegou à Assinafy', 'Conferir o WhatsApp e o e-mail da família no cadastro e reenviar o contrato. '
                                           '(A Assinafy é quem manda o contrato para a família assinar.)'],
    ['A Ju está fora do ar / voltou', 'Enquanto ela estiver fora, a recepção atende tudo. Avise o Nicolas.'],
    ['O WhatsApp da clínica está desconectado', 'Vem pelo número do Nicolas. Nada sai pelo WhatsApp da clínica até '
                                                  'reconectar: avise o Nicolas.'],
    ['Consulta combinada e ainda não lançada? (botão Lançar consulta)', 'Alguém da equipe confirmou uma consulta no WhatsApp e '
                                           'ela não entrou na agenda. Toque no botão: o app abre com a criança, o dia, a hora e a '
                                           'fisio já preenchidos. Confira e salve. Se já estava lançada, toque em "Já estava lançada".'],
    ['Concluído', 'Só confirmação. Nada a fazer.'],
], [64, 110]))

# 10
s += section('10. Pedir para a Ju agendar: @ju', bullets([
    'Na conversa com a família, quando o horário estiver combinado, escreva uma mensagem começando com <b>@ju</b>. '
    'Exemplos: <b>@ju agenda</b>, <b>@ju agenda para a Bruna</b>, <b>@ju agende o Pedro amanhã às 9h</b>.',
    'A Ju lê a conversa e lança a consulta na agenda: a criança, o dia, a hora, a fisio e o tipo de atendimento '
    '(sábado, domingo e feriado já entram com o valor de fim de semana). A sala segue o padrão: Bruna sala 2, '
    'Flávia sala 1, as demais sala 3.',
    'Depois ela reage com o sinal verde de certo na sua mensagem do @ju e escreve para a família só "Pronto, consulta agendada! '
    'Vocês vão receber a confirmação em seguida". Os dados da consulta chegam pela mensagem automática de '
    'sempre; vale conferir a consulta na agenda.',
    'Se faltar alguma coisa (qual criança, qual horário, qual atendimento), a Ju pergunta ali mesmo. Responda '
    'começando de novo com <b>@ju</b>, por exemplo <b>@ju o Pedro</b> ou <b>@ju isso</b>.',
    'Ela não agenda se o horário já estiver ocupado, se a criança já tiver consulta perto desse horário ou se a '
    'família ainda não tiver cadastro. Nesses casos ela avisa na conversa.',
    'A família também vê a mensagem com @ju. Só funciona quando quem escreve é a clínica; se a família escrever '
    '@ju, nada acontece.',
    'Por enquanto o @ju só agenda. Remarcar, cancelar, nota e atestado continuam como antes.',
    '<b>No WhatsApp da Bruna</b> funciona igual: ela escreve <b>@ju agenda</b> na conversa dela com a família. '
    'Se o pedido não disser outra fisio, a consulta fica com a própria Bruna. A resposta da Ju sai do número '
    'da Bruna, sem o sinal verde de certo. A Ju só lê a mensagem do @ju e a conversa daquela família; o '
    'restante do WhatsApp da Bruna ela não lê.',
]))

# 11
s += section('11. Se a Ju errar', bullets([
    'Entre na conversa e escreva para a família: a Ju para sozinha.',
    'Se ela não deve mais atender aquela família, coloque a etiqueta SEM IA.',
    'Mande um print para o Nicolas, para ele ajustar.',
]))


def on_page(c, d):
    c.saveState()
    c.setFont('Seg', 8)
    c.setFillColor(GRAY)
    c.drawRightString(A4[0] - 18 * mm, 10 * mm, 'Guia da Ju · Respira Kids · uso interno · página %d' % d.page)
    c.restoreState()


doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                        topMargin=16 * mm, bottomMargin=16 * mm,
                        title='Guia da Ju', author='Respira Kids')
doc.build(s, onFirstPage=on_page, onLaterPages=on_page)
print('ok')
