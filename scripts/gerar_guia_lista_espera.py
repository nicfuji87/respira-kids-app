"""Gera o guia da lista de espera para a recepção (PDF).

Uso: python scripts/gerar_guia_lista_espera.py docs/Guia_Lista_de_Espera.pdf
Linguagem simples, sem termos técnicos: o público é a secretária. Mesmo visual do Guia da Ju.
Criado em 03/11/2026 junto com a lista de espera v2 (cards no grupo 🩺 Agenda e atendimentos).
"""
import re
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
AMBER = colors.HexColor('#B54708')
AMBER_L = colors.HexColor('#FEF0C7')
GRAY = colors.HexColor('#475467')
LINE = colors.HexColor('#D0D5DD')

base = ParagraphStyle('base', fontName='Seg', fontSize=10, leading=14, textColor=colors.HexColor('#1D2939'))
h_title = ParagraphStyle('t', parent=base, fontName='SegB', fontSize=22, leading=26, textColor=TEAL)
h_sub = ParagraphStyle('s', parent=base, fontSize=11, leading=15, textColor=GRAY)
h1 = ParagraphStyle('h1', parent=base, fontName='SegB', fontSize=13.5, leading=18, textColor=TEAL,
                    spaceBefore=12, spaceAfter=5)
cell = ParagraphStyle('cell', parent=base, fontSize=9.4, leading=12.6)
cellb = ParagraphStyle('cellb', parent=cell, fontName='SegB')
cellh = ParagraphStyle('cellh', parent=cell, fontName='SegB', textColor=colors.white)


EMOJI = re.compile('([🌀-🫿☀-➿⬀-⯿←-⇿])️?')


def P(t, s=base):
    # o PDF não desenha emoji (vira quadrado): sai do texto, os nomes dos botões ficam
    return Paragraph(EMOJI.sub('', t).replace('<b> ', '<b>').replace('( ', '(').replace('  ', ' ').strip(), s)


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


def table(rows, widths):
    data = []
    for i, r in enumerate(rows):
        data.append([P(c, cellh if i == 0 else (cellb if j == 0 else cell)) for j, c in enumerate(r)])
    t = Table(data, colWidths=[w * mm for w in widths], repeatRows=1)
    t.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, LINE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('BACKGROUND', (0, 0), (-1, 0), TEAL),
    ]))
    return t


def section(title, *flow, keep=1):
    return [KeepTogether([P(title, h1)] + list(flow[:keep]))] + list(flow[keep:])


s = []
s.append(P('Lista de espera: o que fazer', h_title))
s.append(P('Guia da recepção · grupo RK · Agenda e atendimentos · novembro de 2026', h_sub))
s.append(Spacer(1, 8))

s.append(box([
    P('<b>Em resumo:</b> a Ju cuida da lista de espera e avisa no grupo da agenda quando precisa de você. '
      'Cada aviso vem com botões. Você toca no botão certo e <b>o aviso some do grupo sozinho</b>, para não acumular.'),
    Spacer(1, 4),
    P('<b>Sua parte:</b> responder os avisos e, quando combinar algo direto com a família (áudio, ligação), '
      'marcar na agenda como sempre. O resto a Ju faz.'),
]))

s += section('1. Os avisos e o que tocar', table([
    ['Aviso', 'Quando aparece', 'O que tocar'],
    ['📝 Preferência de horário',
     'Você marcou ou remarcou uma consulta e a família tinha pedido outro horário que não tinha. '
     'A Ju leu a conversa e mostra o que a família queria e o que ficou.',
     '<b>✅ Incluir</b>: a família ainda quer aquele horário. Ela entra na lista e, se vagar, você é avisada.<br/>'
     '<b>❌ Descartar</b>: foi só um comentário ou a família ficou bem com o horário.<br/>'
     'Sem resposta em 1 dia, o aviso some.'],
    ['🔴 Caso urgente sem horário',
     'Um pedido de agendamento urgente (bebê com menos de 6 meses, bronquiolite, crise, vindo do pronto-socorro) '
     'ficou 30 minutos sem consulta marcada. A Ju já colocou na lista.',
     '<b>👍 Ok</b>: você viu. Retome a conversa com a família.<br/>'
     '<b>❌ Tirar da lista</b>: já resolveu ou não é urgente.'],
    ['🟢 Vagou um horário',
     'Uma consulta entre 2 horas e 7 dias à frente foi cancelada ou mudou de horário, e alguém da lista combina '
     'com o dia, a hora e a fisio.',
     '<b>📲 Oferecer horário</b>: a Ju manda a mensagem para a família e cuida da resposta.<br/>'
     '<b>🔁 Já combinei, trocar</b> (só para quem já tem consulta): a consulta muda na hora e a família recebe a '
     'confirmação automática.<br/>'
     '<b>❌ Descartar</b>: não serve para essa pessoa. Aparece o próximo da lista.'],
    ['📲 Horário oferecido',
     'Você tocou em Oferecer. A Ju está esperando a família responder.',
     'Se a família aceitar, chega o card de troca (<b>✅ Alterar</b>) ou um pedido no grupo de Notificações.<br/>'
     '<b>🔁 Já combinei, trocar</b>: combinou por fora.<br/>'
     '<b>➡️ Próximo da lista</b>: a família não quis ou não respondeu.'],
], [36, 62, 76]))

s += section('2. "Se trocar, vaga..."', P(
    'Quando a pessoa sugerida já tem consulta, o aviso mostra o que acontece com o horário dela se ela trocar. '
    'Se alguém da lista quer esse horário, aparece o nome; se ninguém quer, aparece <b>"fica furo"</b>. '
    'Assim você decide se vale a troca. Quando a troca é feita, o horário antigo vira um novo aviso '
    'de vaga sozinho.'),
    box([P('<b>Exemplo de 03/11:</b> o Miguel cancelou as 10h30 da Flávia. Aviso: <i>"Levi (marcado 9h30, prefere 10h30). '
           'Se trocar, vaga 9h30: a Letícia quer esse horário."</i> Você toca em <b>Já combinei, trocar</b> e logo chega '
           'o aviso das 9h30 com a Letícia.')], AMBER_L, AMBER), keep=2)

s += section('3. Como alguém entra na lista', bullets([
    'A Ju percebe sozinha que a família pediu um horário que não tinha (aviso de preferência, você decide).',
    'A família pede à Ju para trocar para um horário ocupado: entra sozinha, com a consulta atual mantida.',
    'Caso urgente parado: entra sozinho (aviso de caso urgente).',
    'Você pede na conversa da família: <b>@ju coloca na lista de espera, prefere terça de manhã</b>.',
]))

s += section('4. Como alguém sai', bullets([
    'Quando a consulta é marcada ou a troca é feita (pela agenda, pelo botão ou pelo card da Ju).',
    'Quando passa o dia que a família pediu, ou a consulta que seria trocada é cancelada.',
    'Pelo botão <b>❌ Tirar da lista</b> ou com <b>@ju tira da lista</b> na conversa da família.',
]))

s += section('5. A lista fixada no grupo', bullets([
    'A mensagem Lista de espera fica fixada no grupo e se atualiza sozinha a cada mudança.',
    'De segunda a sábado, às 8h, ela é postada de novo para ficar no fim do grupo.',
    'A bolinha vermelha marca os urgentes. Cada nome mostra a preferência e há quantos dias está esperando.',
]))

s += section('6. Dicas', bullets([
    'Use <b>Oferecer horário</b> quando a família ainda não sabe da vaga. Use <b>Já combinei</b> quando já falou com ela.',
    'A Ju oferece só aquele horário. Se a família pedir outro, ela passa para você.',
    'No grupo de Notificações, antes de tocar em <b>Concluído</b>, leia o card até o fim: se a família pediu outra coisa enquanto ele '
    'estava aberto e ninguém respondeu, a Ju retoma a conversa depois que você concluir.',
    'Algo estranho? Mande o print para o Nicolas.',
]))


def on_page(c, d):
    c.saveState()
    c.setFont('Seg', 8)
    c.setFillColor(GRAY)
    c.drawRightString(A4[0] - 18 * mm, 10 * mm, 'Lista de espera · Respira Kids · uso interno · página %d' % d.page)
    c.restoreState()


doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                        topMargin=16 * mm, bottomMargin=16 * mm,
                        title='Lista de espera: o que fazer', author='Respira Kids')
doc.build(s, onFirstPage=on_page, onLaterPages=on_page)
print('ok')
