# Фабрика · передача Claude Code

Ветка `review/portal-audit-20261115` в существующем репозитории `t8rhm9k9s5-droid/fabrika-portal`. В ней код исправлений, тесты и этот файл со всеми 37 замечаниями. Владелец и Claude принимают решение о выпуске вместе. На рабочей площадке проверка форм проводилась до подтверждения действия.

## Навигация и интерфейс

| № | Наблюдение | Что проверить на собранном портале |
|---|---|---|
| F-01 | «Отчёты офисов» открывали обещанные визиты | Выбрать дату. Открывается матрица отчётности за этот день. Скопировать адрес, открыть заново и вернуться. |
| F-02 | «Внешние пространства» приводили в начало каталога | В меню виден статус подготовки. Старая прямая ссылка открывает пояснение по этому подразделу. |
| F-03 | Ссылка ПЭО открывала общую сводку продаж | Открывается расчёт ПЭО, выбранный режим сохраняется в адресе. |
| F-04 | «Буфер заказов» открывал пустой экран | Проверить непустой буфер, нулевой результат и отсутствующую выгрузку, включая старый адрес. |
| F-05 | Главное меню считало корневую страницу моделью 3D | Сверить подсветку и «Назад» при входе на корень. Явный index.html должен по-прежнему открывать 3D. |
| F-06 | У 39 из 59 ссылок на схеме отсутствовало доступное название | У каждой ссылки мини-карты читается имя объекта до перехода. Проверка сравнивает имя с карточкой плана. |
| F-07 | Общее число камер в сводке расходилось с планом | Главная и «Площадка» используют список плана 2D. Проверить общий итог, уличные, внутренние и оставшиеся камеры. |
| F-08 | В поиске появлялся пустой текст «Раздел «»» | Найти «гальваника» и проверить родительские разделы в результатах по производству, качеству, продажам и документам. |
| F-09 | В ППР стояло «1 мероприятий» | Проверить 1, 2, 5, 11, 21 и 22 работы и названия месяцев. |
| F-10 | В пояснении по ремонту транспорта осталось «на;» | Проверить готовую фразу после удаления адреса получателя и сохранение обычного оборота «на завтра». |
| F-11 | В перекрывающихся метках карты открывалась другая камера | Одиночный клик, выбор среди совпадающих меток, клавиатура и перетаскивание. При переносе в новую версию карты учесть обновлённый первоначальный вид и проверять с включённым слоем камер. |
| F-12 | Длинное имя в справочнике не открывало карточку при клике между строк | Проверить двухстрочное имя главного бухгалтера, прямой адрес карточки и отдельные действия телефона и почты. |
| F-13 | «Исполнений по прайсу» вело к двум фотографиям | Открывается каталог по типам с исполнениями. |
| F-14 | «Покупная мебель» вела к движению всех складов | Открывается отчёт о покупной мебели. Нулевой остаток остаётся видимым. |
| F-15 | Две ссылки на складской брак вели к общим показателям | Оба входа открывают расшифровку брака. Сверить дату отчёта с карточкой. |
| F-16 | При одной загрузке каталог сместился на 656 пикселей | На двух повторных открытиях при 1584 × 893 смещение не воспроизвелось. Добавлен тест последовательных загрузок для полноценной частной сборки. |
| F-17 | «Пароль приложения» открывал установку приложения | Пункт открывает личный вход и смену пароля. Руководство по установке на iPhone и iPad доступно отдельно. |
| F-18 | Подпись презентации и адрес указывали на разные облачные сервисы | Открыть карточку и сверить подпись с фактическим доменом. |
| F-19 | Карточки ОСЛО и Самбы сообщали об отсутствии загруженного прайса | Обе ссылки проверены в WebKit. Открылись 2 и 52 исполнения соответственно. |
| F-20 | Две школьные столешницы показывались как банкетки | У обеих название и цена из своей строки Excel. На странице 50 PDF видны обе позиции. |
| F-21 | 216 прежних ссылок открывали неверную страницу прайса | Привязка идёт по видимым ячейкам таблицы. В исходном комплекте все 864 ссылки однозначно совпали с напечатанной строкой. |
| F-22 | В прежнем каталоге было 81 пустое поле базовой цены | Для 861 исполнения в источнике есть число. Для трёх пустых строк указано, где запросить цену. |
| F-23 | Разные исполнения выглядели одинаково | Показаны характеристики и адрес ячейки. Проверены все 864 набора характеристик и пять ценовых базисов. |
| F-24 | В названия попадали фрагменты соседних строк | Все 864 названия HTML сопоставлены со своими строками исходного Excel. |
| F-25 | Скопированная ссылка «Акта рекламации» вела в общие регламенты | Проверены все четыре входа, открытие адреса в отдельном окне, «Назад» и «Вперёд». В WebKit адрес восстановил нужный акт. |

## Документы

| № | Замечание | Решение или статус |
|---|---|---|
| D-01 | Телефон на задних обложках отличался от страницы контактов | На задней обложке прайса и буклета поставить внутренние ссылки на собственные страницы контактов 54 и 19. Обе ссылки проверены в PDF. |
| D-02 | В презентации стульев лишнее «тыс.» увеличивало заявленный выпуск в тысячу раз | На стр. 2 убрать повтор единицы в видимом тексте и слое поиска. |
| D-03 | Две ошибки в оглавлении каталога | Стр. 3, исправить окончание в «Проектное оборудование» и пробел в «Мебель для салонов». |
| D-04 | Повторена опечатка «изображенях» | Исправить на «изображениях» на стр. 2 и 108. |
| D-05 | Расходятся сведения о московском филиале | Отложено владельцем до подтверждения действующего адреса и назначения почтовых ящиков. |
| D-06 | Неясно, к чему относятся две величины площади | Отложено до подтверждения состава помещений, площадок и дат. |
| D-07 | Историческая доля рынка выглядит как текущая | На стр. 2 производственной презентации указаны 2013 год и российский сегмент мебели на металлокаркасе. Убран повтор процентов. |
| D-08 | Инструкции по-разному задают срок ответа на рекламацию | Отложено до решения владельца о применимом правиле и событии начала отсчёта. |
| D-09 | В инструкции упомянуто отсутствующее приложение № 1 | Отложено до получения утверждённой формы «Заявление на отсрочку». |
| D-10 | У четырёх редакций пустые реквизиты введения в действие | Отложено до получения приказов. |
| D-11 | В карточке Excel показывался размер другого представления | Скачиваемый XLSX и PDF-просмотр измеряются отдельно после сборки. Проверено на реальном реестре и на синтетических файлах. |
| D-12 | Часть инструментов не открывала файл Excel из-за регистра имени внутренней части | Имя исправляется в производной копии. Все 416 компонентов совпали с исходными по содержимому. Все 9 листов открылись в openpyxl и LibreOffice. Настольный Microsoft Excel требует отдельной проверки. |

## Перед выпуском

Сопоставьте изменения ветки с текущими частными исходниками, особенно картой, которую уже дорабатывают. Повторите проверки маршрутов, каталога и документов из `.github/workflows/portal-review.yml` и прогон `ci/test_pulse_browser.js` на полной сборке. Сверьте свежие поступления данных и актуальную редакцию прайса. Первый прогон GitHub подтвердил каталог, отчёты, документы, доступные названия и итоги карты. В нём остался один неверный выбор камеры. Проверяйте результат последнего запуска на переданной ревизии. Исходный аудит включал 622 экрана. Часть действий осталась недоступной для индивидуального клика, поэтому результаты этого прохода не подтверждают исправность каждой кнопки рабочего сайта.

## Как получить исправленные PDF из исходных файлов

Ниже один скрипт для закрытой копии исходных документов. Работает с точно проверенными редакциями, пишет новые файлы рядом с выбранным местом назначения. Для прайса и буклета третьим аргументом передайте исходный прайс, из которого берётся шрифт. Для каталога и презентаций достаточно двух аргументов. Использовались Python 3.12 и pypdf 6.21.4. Исправленные XLSX и HTML собирает код ветки.

```python
"""Prepare reviewed PDF derivatives from the four exact input editions. Python + pypdf."""
import hashlib
import io
from pathlib import Path
import sys
from pypdf import PdfReader, PdfWriter
from pypdf._cmap import get_encoding
from pypdf.generic import ArrayObject, ByteStringObject, FloatObject, NameObject, NumberObject, TextStringObject

CATALOGS = {
    '1fb72d1718ede5035f341e258e557f877d9439f236c2e12da598a6da1431af15',
    '15b4e9dfc987b21516242a3ae9950078e0cccaeddaa1462f693c5dbbc2f55803',
}
CHAIRS = 'fc5876586fe6c89383a4e55030b92ec661032fb3da1372e0c4766c85abdd040e'
PRODUCTION = '599dfb53a6a9a39d3b840b280056cddc43e66727594cb1caef8ef64b35951344'

def charmap(page, font):
    f = page['/Resources']['/Font'][font]
    enc, uni = get_encoding(f)
    first = int(f['/FirstChar'])
    return {i: uni.get(enc[i], enc[i]) for i in range(first, int(f['/LastChar'])+1)
            if f['/Widths'][i-first] > 0}

def textbytes(item):
    return item.original_bytes if isinstance(item, TextStringObject) else bytes(item)

def edit_tj(page, ops, index, old, lo, end, add):
    # Preserve the original glyphs and spacing except at the changed characters.
    arr = ops[index][0][0]
    cmap = charmap(page, '/T3_0' if old.startswith('10 ') else '/T1_0')
    inverse = {c: i for i, c in cmap.items()}
    actual = ''.join(''.join(cmap[b] for b in textbytes(item)) for item in arr
                     if isinstance(item, (TextStringObject, bytes)))
    assert actual == old, actual
    position, new = 0, ArrayObject()
    for item in arr:
        if not isinstance(item, (TextStringObject, bytes)):
            if not lo < position < end:
                new.append(item)
            continue
        content = bytearray()
        for code in textbytes(item):
            if position == lo:
                content.extend(inverse[ch] for ch in add)
            if not lo <= position < end:
                content.append(code)
            position += 1
        if content:
            new.append(ByteStringObject(bytes(content)))
    ops[index] = ([new], b'TJ')

def num(*values):
    return [FloatObject(v) for v in values]

def update_page(page, fn):
    stream = page.get_contents()
    fn(page, stream.operations)
    stream.operations = stream.operations
    page.replace_contents(stream)
    page.compress_content_streams()

def catalog(page, ops, number):
    if number == 3:
        edit_tj(page, ops, 118, 'ОБОРУДОВАНИЯ', 11, 12, 'Е')
        edit_tj(page, ops, 278, '8. МЕБЕЛЬДЛЯ', 9, 9, ' ')
        # The author cancels word spacing with Tw here. Restore a visible space before ДЛЯ.
        arr = ops[278][0][0]
        chunk = next(i for i, item in enumerate(arr) if isinstance(item, bytes) and textbytes(item).startswith(b' '))
        original = bytes(arr[chunk])
        arr[chunk:chunk+1] = [ByteStringObject(b' '), FloatObject(-270), ByteStringObject(original[1:])]
        # The subsequent word has its own horizontal position; keep its word space.
        ops[282][0][0] = FloatObject(float(ops[282][0][0]) + .27)
        ops[285][0][0] = FloatObject(float(ops[285][0][0]) - .27)
    else:
        edit_tj(page, ops, 52 if number == 2 else 59, 'изображенях, используемых ', 9, 9, 'и')

def chairs(page, ops):
    edit_tj(page, ops, 13703, '10 000 тыс. единиц мебели каждые сутки', 7, 12, '')
    # The author converted visible lettering to vector outlines. Move the surviving
    # paths and the searchable text together, retaining the centered pill caption.
    removed_width = 86.55
    ops[13702][0][0] = FloatObject(float(ops[13702][0][0]) + removed_width/60)
    ops[11921][0][4] = FloatObject(float(ops[11921][0][4]) + removed_width/2)
    for args, operator in ops[12137:12640]:
        if operator in (b'm', b'l', b'c'):
            for idx in range(0, len(args), 2):
                args[idx] = FloatObject(float(args[idx]) - removed_width)
        else:
            assert operator == b'h'
    del ops[12053:12137]

def production(page, ops):
    cmap = charmap(page, '/T1_0')
    inv = {v: k for k, v in cmap.items()}
    def show(line): return ([ByteStringObject(bytes(inv[c] for c in line))], b'Tj')
    caption = 'ДОЛЯ РЫНКА МЕБЕЛИ НА МЕТАЛЛОКАРКАСЕ В РФ, 2013'
    # Reuse the document's regular typeface, CMYK label colour and original baseline.
    f = page['/Resources']['/Font']['/T1_0']
    width = sum(float(f['/Widths'][inv[ch] - int(f['/FirstChar'])]) for ch in caption) * .008
    assert width < 225
    ops[1166:1167] = [([NameObject('/T1_0'), NumberObject(1)], b'Tf'), show(caption),
                        ([NameObject('/T1_2'), NumberObject(1)], b'Tf')]
    ops[1163:1163] = [([], b'q'), (num(.014,.86,.89,0), b'k'),
                       (num(549.921,450.866,width+5,10.235), b're'), ([], b'f'), ([], b'Q')]
    # Historical scope is explicit both in the label and the paragraph.
    lines = [
        'По данным исследования Intesco Research',
        'Group, в 2013 году ГК «Фабрикант» была',
        'одним из ведущих производителей мебели',
        'на металлокаркасе в России. Доля компании',
        'в этом сегменте составляла 27,6%.',
    ]
    body = [(num(0), b'Tc'), (num(0), b'Tw')]
    for i, line in enumerate(lines):
        assert sum(float(f['/Widths'][inv[ch] - int(f['/FirstChar'])]) for ch in line) * .009 < 222
        body.extend([(num(9,0,0,9,549.92,292.657 - i*12.5), b'Tm'), show(line)])
    ops[557:978] = body

def revise_publication(src, dest):
    data = Path(src).read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    writer = PdfWriter(clone_from=PdfReader(io.BytesIO(data)))
    if digest in CATALOGS:
        for number in (2,3,108):
            update_page(writer.pages[number-1], lambda page, ops: catalog(page, ops, number))
    elif digest == CHAIRS:
        update_page(writer.pages[1], chairs)
    elif digest == PRODUCTION:
        update_page(writer.pages[1], production)
    else:
        raise ValueError('The supplied edition is not one of the four reviewed inputs')
    with Path(dest).open('xb') as out:
        writer.write(out)


from pypdf.annotations import Link
PRICE='ab358269e30dc2565c7efa6a7b58cea65a78f9c6425f13cd277831a9d9f340f5'
SALE='c0094bc0656ac520fb6242fb214775b0a85580571f3c7b131cc4f38f67b7363d'

def revise_cover(src,dest,price):
    data=Path(src).read_bytes(); source_hash=hashlib.sha256(data).hexdigest()
    if source_hash not in (PRICE,SALE):raise ValueError('Unrecognised cover edition')
    font_data=Path(price).read_bytes()
    assert hashlib.sha256(font_data).hexdigest()==PRICE
    writer=PdfWriter(clone_from=PdfReader(io.BytesIO(data)))
    last=len(writer.pages)-1
    reference=PdfReader(io.BytesIO(font_data)).pages[1]
    inv={v:k for k,v in charmap(reference,'/F3+0').items()}
    title='Контакты, стр. '+str(last)
    f=reference['/Resources']['/Font']['/F3+0']
    page=writer.pages[last]
    key=NameObject('/ContactsFont')
    page['/Resources']['/Font'][key]=f.indirect_reference.clone(writer)
    x,y=(420,310) if source_hash==PRICE else (421,304)
    def revise(p,ops):
        if source_hash==PRICE:
            assert len(str(ops[25][0][0])) > 8
            del ops[21:27]
        else:
            assert ops[43][1]==b'q' and ops[433][1]==b'Q'
            # Remove both the outlined phone number and its accessible text.
            del ops[947:957]
            del ops[43:434]
        ops.extend([([],b'q'),(num(0),b'g'),([],b'BT'),([key,NumberObject(24)],b'Tf'),
                    (num(1,0,0,1,x,y),b'Tm'),([ByteStringObject(bytes(inv[c] for c in title))],b'Tj'),([],b'ET'),([],b'Q')])
    update_page(page,revise)
    width=sum(float(f['/Widths'][inv[c]-int(f['/FirstChar'])]) for c in title)*.024
    writer.add_annotation(last,Link(rect=(x,y-4,x+width,y+22),target_page_index=last-1))
    with Path(dest).open('xb') as output:writer.write(output)


if __name__ == '__main__':
    if len(sys.argv) == 3:
        revise_publication(*sys.argv[1:])
    elif len(sys.argv) == 4:
        revise_cover(*sys.argv[1:])
    else:
        raise SystemExit('usage: python revise.py original.pdf corrected.pdf [original-price.pdf]')

```
