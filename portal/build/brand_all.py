#!/usr/bin/env python3
"""«Фабрика» — все файлы раздела «Документы» в фирменном стиле ГК «Фабрикант» (14.11.2026).
Т. В., 14.11.2026: «все файлы на портале, какими бы они ни были, обязаны иметь только фирменный стиль оформления,
кроме каталогов и презентаций — которые и так оформлены».

Содержание файлов не меняется — меняется только оформление (официальный бланк 27.10.2026, regs.json['style']):
  PDF   — каждая страница ставится на фирменный лист А4: первый лист — шапка бланка (логотип, fabrikant.su, info@, 8-800;
          у документов ФТС / ЖПС — с реквизитами юрлица), следующие — короткая шапка с логотипом; подвал «название · Лист N из M»,
          шрифт ALS Ekibastuz, серые акценты. Документы сторонних организаций (выписки, акты, образцы конкурентов, планы выставки)
          внутри рамки остаются как есть, в подвале — «Документ сторонней организации — приводится без изменений».
  Word  — шапка бланка на первом листе, короткая шапка с логотипом на следующих, подвал «Лист N из M», шрифт ALS Ekibastuz.
          PDF-двойник рядом (тот же файл .pdf) пересобирается из оформленного Word.
  Excel — на каждом листе сверху фирменная плашка (логотип, название, юрлицо · сайт · почта · 8-800), при печати —
          подвал «ГК «Фабрикант» · название · Лист N из M». Строки вставляются средствами LibreOffice — формулы, объединения,
          фильтры и условное форматирование сдвигаются сами. Формат файла (.xlsx / .xls / .ods) сохраняется.
Не трогаем: каталоги, прайсы и акции (оформлены отделом маркетинга), презентации, бланки и логотип (это и есть фирменный стиль),
регламенты (оформлены 27.10), договоры, служебные записки и карточки предприятий (уже на фирменном бланке; новые редакции договоров —
после юриста), перевыпуски ИИ (library/raw/reissue, кроме распознанных сканов), подписанные документы с бланком (предписания ПТО),
PDF-копии для просмотра (*.docx.pdf, *.xlsx.pdf … — docs2pdf.py пересобирает их из оформленных файлов), картинки и макеты.

Оригиналы — /home/claude/library/orig/<тот же путь> (на портал не выкладываются). Журнал — build/brand_log.json:
путь → контрольная сумма оформленного файла; повторный запуск пропускает оформленные, а новый или заменённый файл оформляет.
Запуск: python3 build/brand_all.py [--dry] [--only подстрока]. Встроен в build_site.py перед docs2pdf.py; ошибка одного файла
не останавливает остальные и сборку."""
import os, sys, json, re, hashlib, shutil, subprocess, time, datetime, zipfile, tempfile, traceback
import pathlib   # 14.11.2026: чтение/запись файлов с закрытием (CodeQL py/file-not-closed)

LIB = '/home/claude/library'
RAW = LIB + '/raw'
ORIG = LIB + '/orig'
LOG = '/home/claude/build/brand_log.json'
BR = '/home/claude/docs_brand/brand/'
FONTS = '/home/claude/docs_brand/fonts/'
FR, FB = FONTS + 'ALS Ekibastuz Regular.otf', FONTS + 'ALS Ekibastuz Bold.otf'
MEDIA = '/home/claude/build/brand_media/'          # шапки бланков, вынутые из library/raw/brand/blank_*.docx
DRY = '--dry' in sys.argv
ONLY = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else ''
MARK = 'fabrikant-brand'
CONTACTS = 'fabrikant.su · user6@example.org · +7 000 000-00-01'
GREY, INK = (0.43, 0.43, 0.45), (0.11, 0.11, 0.12)

SKIP_DIRS = ('brand', 'catalogs', 'prices', 'regs', 'dogovory', 'memo', 'cards', 'archive')
SKIP_RE = [r'^katalog', r'^reports/stock-week-', r'^reports/svodnoe_predpisanie_', r'^reports/prilozhenie_ishodnye_predpisaniya_',
           r'^other/shema_sborki_tris_g\.pdf$', r'^marketing/ch_ch_', r'_prezentaciya\.pdf$', r'^dogovory/_прежние']
EXTERNAL_RE = [r'^certs/', r'^other/obrazec_', r'^marketing/umids_', r'^utils/', r'_ocr\.pdf$']
VIEW_RE = r'\.(docx?|xlsx?|ods)\.pdf$'


def log(*a): print('[brand]', *a, flush=True)


def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''): h.update(b)
    return h.hexdigest()[:20]


def titles():
    """названия файлов — как на портале: library.json (в т. ч. скрытые), econ.json, dogovory.json, журнал перевыпуска"""
    T = {}

    def norm(f):
        f = f.replace('\\', '/')
        for pre in ('library/raw/', 'raw/', 'library/'): 
            if f.startswith(pre): return f[len(pre):]
        return f

    def walk(o, title=None):
        if isinstance(o, dict):
            t = o.get('title') or o.get('t')
            f = o.get('file')
            if isinstance(f, str) and isinstance(t, str) and t: T.setdefault(norm(f), t)
            ai = o.get('ai')
            if isinstance(ai, dict) and isinstance(t, str):
                for g in ai.get('files') or []: T.setdefault(norm(g), t)
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    for jf in (LIB + '/library.json', LIB + '/econ.json', LIB + '/dogovory.json', '/home/claude/build/docs_reissue.json'):
        try: walk(json.loads(pathlib.Path(jf).read_text(encoding='utf-8')))
        except Exception: pass
    return T


def pretty(rel):
    s = os.path.splitext(os.path.basename(rel))[0].replace('_', ' ').replace('-', ' ')
    return s[:1].upper() + s[1:]


def entity(rel, title):
    s = (rel + ' ' + title).lower()
    if re.search(r'\bfts\b|_fts|fts_|фтс|фабрика торговых', s): return 'fts', 'ООО «ФТС»'
    if re.search(r'zhps|_zps|zps_|_jps|jps_|жпс|жилпромсервис', s): return 'zps', 'ЗАО «Жилпромсервис»'
    return 'fab', 'ГК «Фабрикант»'


def media():
    """шапки и фон первого листа из официальных бланков (Word) — один раз"""
    os.makedirs(MEDIA, exist_ok=True)
    for k in ('fab', 'fts', 'zps'):
        dst = MEDIA + 'strip_%s.jpg' % k
        if os.path.exists(dst) and (k != 'fab' or os.path.exists(MEDIA + 'bg_a4.jpg')): continue
        z = zipfile.ZipFile('%s/brand/blank_%s.docx' % (RAW, {'fab': 'fabrikant'}.get(k, k)))
        imgs = sorted((n for n in z.namelist() if n.startswith('word/media/')), key=lambda n: z.getinfo(n).file_size)
        from PIL import Image
        import io
        for n in imgs:
            try: im = Image.open(io.BytesIO(z.read(n)))
            except Exception: continue
            if im.size[0] > im.size[1] * 2 and not os.path.exists(dst):   # полоса шапки (ширина ≫ высоты)
                im.convert('RGB').save(dst, quality=92)
            if k == 'fab' and im.size[1] > im.size[0] and not os.path.exists(MEDIA + 'bg_a4.jpg'):
                im.convert('RGB').save(MEDIA + 'bg_a4.jpg', quality=85)   # фон листа (детали мебели в левом нижнем углу)


# REDACTED_B64_9 PDF
def brand_pdf(src, dst, title, ent, external):
    import pymupdf
    S = pymupdf.open(src)
    D = pymupdf.open()
    fr, fb = pymupdf.Font(fontfile=FR), pymupdf.Font(fontfile=FB)
    mm = 72 / 25.4
    n = len(S)
    logo = BR + 'logo-h.png'
    strip = MEDIA + 'strip_%s.jpg' % ent[0]
    from PIL import Image
    sw, sh_ = Image.open(strip).size

    def text(p, x, y, s, size=7.5, bold=False, color=GREY, right=False):
        f = fb if bold else fr
        if right: x -= f.text_length(s, fontsize=size)
        p.insert_text((x, y), s, fontsize=size, fontname='ekb' if bold else 'ekr', fontfile=FB if bold else FR, color=color)

    def fit(s, width, size):
        while s and fr.text_length(s, fontsize=size) > width: s = s[:-2].rstrip() + '…' if not s.endswith('…') else s[:-3].rstrip() + '…'
        return s

    for i in range(n):
        sp = S[i]
        r = sp.rect
        land = r.width > r.height * 1.05
        W, H = (841.89, 595.28) if land else (595.28, 841.89)
        p = D.new_page(width=W, height=H)
        if i == 0 and not land and not external:
            hh = W * sh_ / sw
            p.insert_image(pymupdf.Rect(0, 0, W, hh), filename=strip)
            top = hh + 3 * mm
        else:
            lw = 38 * mm; lh = lw * 321 / 1556
            p.insert_image(pymupdf.Rect(12 * mm, 7 * mm, 12 * mm + lw, 7 * mm + lh), filename=logo)
            yb = 7 * mm + lh
            if i == 0:
                text(p, W - 12 * mm, 7 * mm + 3.2 * mm, CONTACTS, 7.5, right=True)
                text(p, W - 12 * mm, 7 * mm + 7 * mm, 'Документ сторонней организации' if external else ent[1], 7.5, bold=not external, color=INK, right=True)
            else:
                text(p, W - 12 * mm, yb - 0.6 * mm, fit(title, W - 70 * mm, 7.5), 7.5, right=True)
            p.draw_line((12 * mm, yb + 2.2 * mm), (W - 12 * mm, yb + 2.2 * mm), color=(0.55, 0.55, 0.55), width=0.6)
            top = yb + 4.5 * mm
        bot = H - 13 * mm
        # подвал
        p.draw_line((12 * mm, bot + 2 * mm), (W - 12 * mm, bot + 2 * mm), color=(0.75, 0.75, 0.75), width=0.4)
        foot = ('Документ сторонней организации — приводится без изменений · ' if external else ent[1] + ' · ') + title
        text(p, W - 12 * mm, bot + 6 * mm, 'Лист %d из %d' % (i + 1, n), 7.5, right=True)
        text(p, 12 * mm, bot + 6 * mm, fit(foot, W - 50 * mm, 7.5), 7.5)
        # страница исходника — целиком, пропорционально, по верхнему краю
        box = pymupdf.Rect(10 * mm, top, W - 10 * mm, bot)
        k = min(box.width / r.width, box.height / r.height)
        w, h = r.width * k, r.height * k
        x0 = box.x0 + (box.width - w) / 2
        p.show_pdf_page(pymupdf.Rect(x0, box.y0, x0 + w, box.y0 + h), S, i)
    meta = dict(S.metadata or {})
    meta.update(title=title, author='ГК «Фабрикант»', keywords=MARK, creator='Фабрика · фирменный стиль', producer='brand_all.py')
    D.set_metadata(meta)
    try: D.subset_fonts()
    except Exception: pass
    D.save(dst, garbage=3, deflate=True)
    return n


# REDACTED_B64_9 Word
def brand_docx(src, dst, title, ent):
    from docx import Document
    from docx.shared import Mm, Pt, RGBColor
    from docx.enum.text import WD_TAB_ALIGNMENT
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    from PIL import Image
    d = Document(src)
    FONT = 'ALS Ekibastuz'

    def set_fonts(el):
        for rf in el.iter(qn('w:rFonts')):
            a = rf.get(qn('w:ascii')) or ''
            if a in ('Symbol', 'Wingdings', 'Webdings', 'Courier New', 'MS Gothic', 'Segoe UI Symbol'): continue
            for t in ('w:asciiTheme', 'w:hAnsiTheme', 'w:cstheme', 'w:eastAsiaTheme'):
                if rf.get(qn(t)) is not None: del rf.attrib[qn(t)]
            for t in ('w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'): rf.set(qn(t), FONT)
    set_fonts(d.element.body)
    set_fonts(d.styles.element)
    # шрифт по умолчанию документа
    rpd = d.styles.element.find(qn('w:docDefaults'))
    if rpd is not None:
        rpr = rpd.find(qn('w:rPrDefault') + '/' + qn('w:rPr'))
        if rpr is not None:
            rf = rpr.find(qn('w:rFonts'))
            if rf is None: rf = OxmlElement('w:rFonts'); rpr.insert(0, rf)
            set_fonts(rpd)
    for st in ('Normal',):
        try: d.styles[st].font.name = FONT
        except KeyError: pass

    def clear(part):
        for ch in list(part._element): part._element.remove(ch)

    def border(par, side, sz=6, color='8C8C8C'):
        pPr = par._p.get_or_add_pPr()
        b = pPr.find(qn('w:pBdr'))
        if b is None: b = OxmlElement('w:pBdr'); pPr.append(b)
        e = OxmlElement('w:' + side); e.set(qn('w:val'), 'single'); e.set(qn('w:sz'), str(sz)); e.set(qn('w:space'), '4'); e.set(qn('w:color'), color)
        b.append(e)

    def run(par, s, size=7.5, bold=False, color=(0x6E, 0x6E, 0x73)):
        r = par.add_run(s); r.font.name = FONT; r.font.size = Pt(size); r.font.bold = bold; r.font.color.rgb = RGBColor(*color)
        rf = r._r.get_or_add_rPr().find(qn('w:rFonts'))
        if rf is not None:
            for t in ('w:cs', 'w:eastAsia'): rf.set(qn(t), FONT)
        return r

    def field(par, code, size=7.5):
        """поле Word (PAGE / NUMPAGES): отдельные прогоны begin · instrText · separate · результат · end, у каждого свой шрифт"""
        for kind, txt in (('begin', None), ('instr', code), ('separate', None), ('text', '1'), ('end', None)):
            r = run(par, '', size)
            if kind == 'instr':
                it = OxmlElement('w:instrText'); it.set(qn('xml:space'), 'preserve'); it.text = ' %s ' % code; r._r.append(it)
            elif kind == 'text':
                t = OxmlElement('w:t'); t.text = txt; r._r.append(t)
            else:
                fc = OxmlElement('w:fldChar'); fc.set(qn('w:fldCharType'), kind); r._r.append(fc)

    strip = MEDIA + 'strip_%s.jpg' % ent[0]
    sw, sh_ = Image.open(strip).size
    short = title if len(title) <= 70 else title[:68].rstrip() + '…'
    for k, sec in enumerate(d.sections):
        if k > 0:
            for hf in (sec.header, sec.footer, sec.first_page_header, sec.first_page_footer, sec.even_page_header, sec.even_page_footer):
                hf.is_linked_to_previous = True
            continue
        land = sec.page_width > sec.page_height
        sec.different_first_page_header_footer = True
        if not land: sec.left_margin, sec.right_margin = Mm(18), Mm(14)
        else: sec.left_margin, sec.right_margin = max(sec.left_margin, Mm(12)), max(sec.right_margin, Mm(12))
        sec.header_distance, sec.footer_distance = Mm(7), Mm(7)
        sec.top_margin = Mm(24)            # короткая шапка; на первом листе шапка бланка выше — Word сам сдвигает текст ниже неё
        sec.bottom_margin = max(sec.bottom_margin, Mm(18))
        pw = sec.page_width
        # первый лист — полоса бланка во всю ширину листа
        fh = sec.first_page_header; fh.is_linked_to_previous = False; clear(fh)
        par = fh.add_paragraph()
        pf = par.paragraph_format; pf.left_indent = -sec.left_margin; pf.right_indent = -sec.right_margin; pf.space_after = Mm(3)
        wmm = (210 if not land else 210)
        par.add_run().add_picture(strip, width=Mm(wmm))
        if land:
            run(par, '')
        # следующие листы — логотип + название
        hd = sec.header; hd.is_linked_to_previous = False; clear(hd)
        par = hd.add_paragraph()
        tw = pw - sec.left_margin - sec.right_margin
        par.paragraph_format.tab_stops.add_tab_stop(tw, WD_TAB_ALIGNMENT.RIGHT)
        par.add_run().add_picture(BR + 'logo-h.png', height=Mm(7.5))
        run(par, '\t' + short)
        border(par, 'bottom')
        # подвалы
        for ft in (sec.first_page_footer, sec.footer):
            ft.is_linked_to_previous = False; clear(ft)
            par = ft.add_paragraph()
            par.paragraph_format.tab_stops.add_tab_stop(tw, WD_TAB_ALIGNMENT.RIGHT)
            border(par, 'top', 4, 'BFBFBF')
            run(par, ent[1] + ' · ' + short + '\tЛист ')
            field(par, 'PAGE'); run(par, ' из '); field(par, 'NUMPAGES')
    cp = d.core_properties
    cp.keywords = MARK; cp.title = title; cp.author = 'ГК «Фабрикант»'
    d.save(dst)


# REDACTED_B64_9 Excel (LibreOffice UNO)
class LO:
    def __init__(self):
        self.prof = tempfile.mkdtemp(prefix='lo_brand_')
        self.port = 2017
        self.proc = subprocess.Popen(['soffice', '-env:UserInstallation=file://' + self.prof, '--headless', '--invisible', '--norestore',
                                      '--nologo', '--accept=socket,host=10.0.0.6,port=%d;urp;' % self.port],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        import uno
        self.uno = uno
        local = uno.getComponentContext()
        res = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
        for _ in range(60):
            try:
                self.ctx = res.resolve('uno:socket,host=10.0.0.6,port=%d;urp;StarOffice.ComponentContext' % self.port); break
            except Exception: time.sleep(0.5)
        else: raise RuntimeError('LibreOffice не запустился')
        self.desk = self.ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', self.ctx)

    def P(self, n, v):
        from com.sun.star.beans import PropertyValue
        p = PropertyValue(); p.Name = n; p.Value = v; return p

    def open(self, path):
        return self.desk.loadComponentFromURL(self.uno.systemPathToFileUrl(path), '_blank', 0, (self.P('Hidden', True),))

    def close(self):
        try: self.desk.terminate()
        except Exception: pass
        try: self.proc.wait(10)
        except Exception: self.proc.kill()
        shutil.rmtree(self.prof, ignore_errors=True)


FILTER = {'.xlsx': 'Calc MS Excel 2007 XML', '.xls': 'MS Excel 97', '.ods': 'calc8'}


def brand_sheet(lo, src, dst, title, ent):
    from com.sun.star.awt import Size, Point
    from com.sun.star.table import BorderLine2
    doc = lo.open(src)
    if doc is None: raise RuntimeError('не открылся')
    try:
        gp = lo.ctx.ServiceManager.createInstanceWithContext('com.sun.star.graphic.GraphicProvider', lo.ctx)
        ctrl = doc.getCurrentController()
        done = 0
        for name in doc.Sheets.ElementNames:
            sh = doc.Sheets.getByName(name)
            if not sh.IsVisible: continue
            cur = sh.createCursor(); cur.gotoEndOfUsedArea(False)
            ra = cur.getRangeAddress()
            last = max(ra.EndColumn, 3)
            if ra.EndRow == 0 and ra.EndColumn == 0 and not sh.getCellByPosition(0, 0).getString(): continue
            frz = None
            try:
                ctrl.setActiveSheet(sh)
                if ctrl.hasFrozenPanes(): frz = (ctrl.getSplitColumn(), ctrl.getSplitRow())
            except Exception: pass
            sh.Rows.insertByIndex(0, 4)
            rows = sh.Rows
            for i, hgt in enumerate((1250, 720, 560, 260)):        # 1/100 мм
                rr = rows.getByIndex(i); rr.Height = hgt; rr.IsVisible = True
                try: rr.OptimalHeight = False
                except Exception: pass
            band = sh.getCellRangeByPosition(0, 0, last, 2)
            band.CellBackColor = 0xF2F2F2
            band.CharFontName = 'ALS Ekibastuz'
            band.IsTextWrapped = False
            line = BorderLine2(); line.OuterLineWidth = 50; line.LineWidth = 50; line.Color = 0x8C8C8C
            sh.getCellRangeByPosition(0, 2, last, 2).BottomBorder = line
            c = sh.getCellByPosition(0, 1); c.setString(title); c.CharHeight = 12; c.CharWeight = 150; c.CharColor = 0x1C1C1E
            c.VertJustify = 2
            c = sh.getCellByPosition(0, 2); c.setString(ent[1] + '  ·  ' + CONTACTS); c.CharHeight = 8; c.CharColor = 0x6E6E73
            c.VertJustify = 1
            c = sh.getCellByPosition(last, 0); c.setString('fabrikant.su'); c.CharHeight = 8; c.CharColor = 0x6E6E73; c.HoriJustify = 3; c.VertJustify = 2
            # логотип
            g = gp.queryGraphic((lo.P('URL', lo.uno.systemPathToFileUrl(BR + 'logo-h.png')),))
            shp = doc.createInstance('com.sun.star.drawing.GraphicObjectShape')
            sh.DrawPage.add(shp)
            shp.Graphic = g
            shp.setSize(Size(4000, int(4000 * 321 / 1556)))
            shp.setPosition(Point(250, 200))
            try: shp.Anchor = sh.getCellByPosition(0, 0)
            except Exception: pass
            try:                                                   # область печати сдвинулась вниз — включаем в неё плашку
                pa = list(sh.getPrintAreas())
                if pa:
                    for a in pa:
                        if a.StartRow <= 4: a.StartRow = 0
                    sh.setPrintAreas(tuple(pa))
            except Exception: pass
            if frz and (frz[0] or frz[1]):
                try: ctrl.freezeAtPosition(frz[0], frz[1] + 4)
                except Exception: pass
            # печать: подвал «ГК «Фабрикант» · название · Лист N из M»
            try:
                ps = doc.StyleFamilies.getByName('PageStyles').getByName(sh.PageStyle)
                ps.FooterIsOn = True
                fc = ps.RightPageFooterContent
                fc.LeftText.setString((ent[1] + ' · ' + title)[:110]); fc.CenterText.setString('')
                rt = fc.RightText; rt.setString('Лист ')
                tc = rt.createTextCursor(); tc.gotoEnd(False)
                rt.insertTextContent(tc, doc.createInstance('com.sun.star.text.TextField.PageNumber'), False)
                tc.gotoEnd(False); rt.insertString(tc, ' из ', False); tc.gotoEnd(False)
                rt.insertTextContent(tc, doc.createInstance('com.sun.star.text.TextField.PageCount'), False)
                ps.RightPageFooterContent = fc
            except Exception as e: log('  подвал печати не задан:', name, e)
            done += 1
        try: ctrl.setActiveSheet(doc.Sheets.getByIndex(0))
        except Exception: pass
        dp = doc.DocumentProperties; dp.Keywords = (MARK,); dp.Title = title; dp.Author = 'ГК «Фабрикант»'
        doc.storeToURL(lo.uno.systemPathToFileUrl(dst), (lo.P('FilterName', FILTER[os.path.splitext(src)[1].lower()]),))
        return done
    finally:
        doc.close(True)


def to_pdf(lo, src, dst):
    doc = lo.open(src)
    try: doc.storeToURL(lo.uno.systemPathToFileUrl(dst), (lo.P('FilterName', 'writer_pdf_Export'),))
    finally: doc.close(True)


def has_mark(p):
    try:
        if p.endswith('.pdf'):
            import pymupdf
            return MARK in ((pymupdf.open(p).metadata or {}).get('keywords') or '')
        if zipfile.is_zipfile(p):
            z = zipfile.ZipFile(p)
            return any(MARK.encode() in z.read(n) for n in ('docProps/core.xml', 'meta.xml') if n in z.namelist())
        return MARK.encode('utf-16-le') in pathlib.Path(p).read_bytes() or MARK.encode() in pathlib.Path(p).read_bytes()
    except Exception: return False


# REDACTED_B64_9 main
def plan():
    T = titles()
    todo = []
    for root, dirs, files in os.walk(RAW):
        for f in sorted(files):
            p = os.path.join(root, f); rel = os.path.relpath(p, RAW)
            top = rel.split('/')[0]
            ext = os.path.splitext(f)[1].lower()
            if top in SKIP_DIRS or any(re.search(x, rel) for x in SKIP_RE) or re.search(VIEW_RE, rel): continue
            if top == 'reissue' and not rel.endswith('_ocr.pdf'): continue
            if ext not in ('.pdf', '.docx', '.xlsx', '.xls', '.ods'): continue
            if ONLY and ONLY not in rel: continue
            stem = os.path.splitext(p)[0]
            twin = ext == '.pdf' and os.path.exists(stem + '.docx')
            sib = [T[k] for k in T if os.path.splitext(k)[0] == os.path.splitext(rel)[0]]
            title = T.get(rel) or (sib[0] if sib else '') or pretty(rel)
            title = re.sub(r'\s*\((PDF|Word|Excel)[^)]*\)\s*$', '', title).strip()
            todo.append(dict(rel=rel, path=p, ext=ext, title=title, twin=twin,
                             external=any(re.search(x, rel) for x in EXTERNAL_RE), ent=entity(rel, title)))
    return todo


def main():
    try: L = json.loads(pathlib.Path(LOG).read_text(encoding='utf-8'))
    except Exception: L = {}
    media()
    todo = [x for x in plan() if L.get(x['rel'], {}).get('sha') != sha(x['path'])]
    log('к оформлению:', len(todo))
    for x in todo: log(' ', x['ext'], x['rel'], '| сторонний' if x['external'] else '', '| двойник Word' if x['twin'] else '', '|', x['title'][:60])
    if DRY or not todo: return
    lo = None
    order = sorted(todo, key=lambda x: (x['twin'], x['ext'] == '.pdf'))   # Word раньше своих PDF-двойников
    for x in order:
        rel, p = x['rel'], x['path']
        o = os.path.join(ORIG, rel)
        try:
            os.makedirs(os.path.dirname(o), exist_ok=True)
            if has_mark(p):                                        # уже оформлен (журнал потерян) — второй раз не оформляем
                L[rel] = dict(sha=sha(p), orig='orig/' + rel, how='уже в фирменном стиле', title=x['title']); continue
            shutil.copy2(p, o)                                     # новый или заменённый исходник → в оригиналы
            tmp = p + '.brand' + x['ext']
            if x['ext'] == '.pdf' and x['twin']:
                if lo is None: lo = LO()
                to_pdf(lo, os.path.splitext(p)[0] + '.docx', tmp); how = 'из оформленного Word'
            elif x['ext'] == '.pdf':
                n = brand_pdf(o, tmp, x['title'], x['ent'], x['external']); how = 'фирменный лист, %d стр.' % n
            elif x['ext'] == '.docx':
                brand_docx(o, tmp, x['title'], x['ent']); how = 'бланк Word'
            else:
                if lo is None: lo = LO()
                n = brand_sheet(lo, o, tmp, x['title'], x['ent']); how = 'плашка на %d лист.' % n
            os.replace(tmp, p)
            L[rel] = dict(sha=sha(p), orig='orig/' + rel, how=how, title=x['title'], entity=x['ent'][1], external=x['external'],
                          at=datetime.datetime.now().strftime('%Y-%m-%d %H:%M'))
            log('  ✓', rel, '—', how)
        except Exception as e:
            log('  ✗', rel, e); traceback.print_exc(limit=2)
            try: os.path.exists(p + '.brand' + x['ext']) and os.remove(p + '.brand' + x['ext'])
            except Exception: pass
        pathlib.Path(LOG).write_text(json.dumps(L, ensure_ascii=False, indent=1), encoding='utf-8')
    if lo: lo.close()


if __name__ == '__main__':
    try: main()
    except Exception as e: log('остановлено:', e); traceback.print_exc(limit=3)
