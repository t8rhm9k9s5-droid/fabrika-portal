"""Synthetic regressions for row identity, missing prices, clipping and package repair."""
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from zipfile import ZipFile

from openpyxl import Workbook

from catalog_pdf import visible_pages
from gen_catalog import read_variants, render, workbook_copy


class CatalogTest(unittest.TestCase):
    def test_workbook_copy_preserves_package_and_repairs_case(self):
        with TemporaryDirectory() as directory:
            src = Path(directory) / 'source.xlsx'
            dst = Path(directory) / 'output.xlsx'
            with ZipFile(src, 'w') as archive:
                archive.writestr('xl/SharedStrings.xml', b'<sst/>')
                archive.writestr('xl/media/image1.png', b'picture')
                archive.writestr('xl/_rels/workbook.xml.rels', b'<Relationship Target="SharedStrings.xml"/>')
            before = src.read_bytes()
            workbook_copy(src, dst)
            with ZipFile(dst) as copy:
                self.assertEqual(copy.read('xl/media/image1.png'), b'picture')
                self.assertEqual(copy.read('xl/sharedStrings.xml'), b'<sst/>')
                self.assertNotIn('xl/SharedStrings.xml', copy.namelist())
                self.assertIn(b'Target="sharedStrings.xml"', copy.read('xl/_rels/workbook.xml.rels'))
            self.assertEqual(before, src.read_bytes())
            with self.assertRaises(ValueError):
                workbook_copy(src, src)

    def test_excel_rows_and_missing_prices_keep_their_identity(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'input.xlsx'
            book = Workbook()
            sheet = book.active
            sheet.title = 'Тест'
            sheet.append(['НАИМЕНОВАНИЕ', None, 'КРАТНОСТЬ'])
            sheet.append(['Фото', 'Модель', None, 'Обивка', 'I', 'II', 'III', 'IV', 'V'])
            sheet.append(['Раздел'])
            sheet.append([None, 'Изделие A', 2, 'Вариант А', 100, 101, 102, 103, 104])
            sheet.append([None, 'Изделие A', 2, 'Вариант Б'])
            book.save(path)
            rows = list(read_variants(path))
            self.assertEqual([v.cell for v in rows], ['B4', 'B5'])
            self.assertNotEqual(rows[0].pdf_key(), rows[1].pdf_key())
            fragment, counts = render(rows, {rows[0].pdf_key(): [3]}, 'prais_2000-01-01')
            self.assertEqual((counts['isp'], counts['pdf_linked']), (2, 1))
            self.assertIn('отделе продаж', fragment)
            self.assertIn('Обивка — Вариант Б', fragment)
            self.assertEqual(fragment.count('.pdf#page=3'), 1)
            ambiguous, _ = render(rows[:1], {rows[0].pdf_key(): [3, 4]}, 'prais_2000-01-01')
            self.assertNotIn('.pdf#page=', ambiguous)
            self.assertIn('Страница PDF не подтверждена', ambiguous)
            sheet.append([None, None, 2, 'Другой вариант', 121, 122, 123, 124, 125])
            book.save(path)
            with self.assertRaisesRegex(ValueError, 'строка 6'):
                list(read_variants(path))

    def test_clipped_form_only_exposes_the_rows_of_each_print_page(self):
        class Form(dict):
            indirect_reference = 42

        class Page(dict):
            cropbox = SimpleNamespace(left=0, right=200, bottom=0, top=200)

            def __init__(self, offset):
                super().__init__({'/Resources': {'/XObject': {'/Sheet': Form({'/Subtype': '/Form'})}}})
                self.offset = offset

            def get_contents(self):
                return SimpleNamespace(operations=[
                    ([], b'q'), ([0, 0, 200, 50], b're'), ([], b'W'), ([], b'n'),
                    ([1, 0, 0, 1, 0, self.offset], b'cm'), (['/Sheet'], b'Do'), ([], b'Q')
                ])

        rows = [(('first',), (8, 10, 180, 22)), (('second',), (8, 60, 180, 72)),
                (('straddles',), (8, 44, 180, 56))]
        with patch('catalog_pdf.PdfReader', return_value=SimpleNamespace(pages=[Page(0), Page(-50)])), \
                patch('catalog_pdf.form_rows', return_value=rows) as parse_form:
            self.assertEqual(visible_pages('test.pdf'), {('first',): [1], ('second',): [2]})
            parse_form.assert_called_once()


if __name__ == '__main__':
    unittest.main()
