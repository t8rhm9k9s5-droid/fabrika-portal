"""Index the visible cells of the repaginated print PDF (pypdf and pdfplumber)."""
from collections import defaultdict
from io import BytesIO
import unicodedata

import pdfplumber
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, NameObject


def key(text):
    return ''.join(unicodedata.normalize('NFKC', str(text or '')).casefold().split())


def form_rows(form):
    """Read each original worksheet table once, before its strips are moved onto print pages."""
    x0, y0, width, height = map(float, form['/BBox'])
    if (x0, y0) != (0, 0) or list(form.get('/Matrix', [1, 0, 0, 1, 0, 0])) != [1, 0, 0, 1, 0, 0]:
        return []
    writer = PdfWriter()
    page = writer.add_blank_page(width, height)
    page[NameObject('/Resources')] = form['/Resources'].clone(writer)
    content = DecodedStreamObject()
    content.set_data(form.get_data())
    page.replace_contents(content)
    memory = BytesIO()
    writer.write(memory)
    memory.seek(0)

    rows = []
    with pdfplumber.open(memory) as doc:
        sheet = doc.pages[0]
        # Only ruled cell borders count. Filled background rectangles would split
        # a single name/price across columns.
        tables = sheet.find_tables({'vertical_strategy': 'lines_strict', 'horizontal_strategy': 'lines_strict'})
        for table in tables:
            section = None
            header = None
            for row, values in zip(table.rows, table.extract()):
                values = [key(v) for v in values]
                if 'модель' in values and values[-5:] == ['i', 'ii', 'iii', 'iv', 'v']:
                    header = values
                    section = None
                    continue
                if not header:
                    continue
                if not section and sum(bool(v) for v in values) == 1:
                    section = next(v for v in values if v)
                    continue
                model_col = header.index('модель')
                if not section or not values[model_col]:
                    continue
                # Exclude photograph cells shared by several rows. Their height
                # can exceed the strip actually drawn on the destination page.
                cells = [c for c, v in zip(row.cells[model_col:], values[model_col:]) if v and c]
                left = min(c[0] for c in cells)
                top = min(c[1] for c in cells)
                right = max(c[2] for c in cells)
                bottom = max(c[3] for c in cells)
                chars = [c for c in sheet.chars if left <= (c['x0'] + c['x1']) / 2 < right
                         and top <= (c['top'] + c['bottom']) / 2 < bottom]
                if chars:
                    # Font boxes contain unpainted ascender/descender padding. A
                    # 1 pt inward tolerance accommodates that padding on the cell rule.
                    bounds = (min(c['x0'] for c in chars), min(c['y0'] for c in chars),
                              max(c['x1'] for c in chars), max(c['y1'] for c in chars))
                    rows.append(((section, tuple(header[model_col:]), *values[model_col:]), bounds))
    return rows


def visible_pages(pdf):
    """Map (section, model, pack, options, five prices) to verified physical pages.

    Printed table pages are composed of q/re/W/n/cm/Do/Q strips. A Form
    XObject can contain many invisible neighbouring rows. Reject unknown layouts
    rather than attributing those rows to every page referencing the same form.
    """
    reader = PdfReader(pdf)
    pages = defaultdict(list)
    forms = {}
    pattern = [b'q', b're', b'W', b'n', b'cm', b'Do', b'Q']
    for number, page in enumerate(reader.pages, 1):
        contents = page.get_contents()
        if contents is None:
            continue
        ops = contents.operations
        if len(ops) % len(pattern) or any(op != pattern[i % 7] for i, (_, op) in enumerate(ops)):
            continue
        for offset in range(0, len(ops), 7):
            x, y, width, height = map(float, ops[offset + 1][0])
            a, b, c, d, tx, ty = map(float, ops[offset + 4][0])
            if (a, b, c, d) != (1, 0, 0, 1):
                continue
            form = page['/Resources']['/XObject'][ops[offset + 5][0][0]]
            if form['/Subtype'] != '/Form':
                continue
            ref = form.indirect_reference
            if ref not in forms:
                forms[ref] = form_rows(form)
            crop = page.cropbox
            left, bottom = max(x, crop.left) - tx, max(y, crop.bottom) - ty
            right, top = min(x + width, crop.right) - tx, min(y + height, crop.top) - ty
            for signature, (x0, y0, x1, y1) in forms[ref]:
                if left <= x0 and right >= x1 and bottom <= y0 + 1 and top >= y1 - 1:
                    if number not in pages[signature]:
                        pages[signature].append(number)
    return pages
