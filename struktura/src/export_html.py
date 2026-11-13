# -*- coding: utf-8 -*-
"""Оборачивает страницы сайтов в полноценные HTML-файлы для скачивания."""
from _cg1_file_io import read_file as _cg1_read_file
import os as _os
_SRC = _os.path.dirname(_os.path.abspath(__file__))
_ROOT = _os.path.dirname(_SRC)
import re
S = _os.path.join(_ROOT, "sites", "")
for src, dst in [('fabrikant-site.html', _os.path.join(_ROOT, "out", "Сайт_оргструктура_Фабрикант.html")),
                 ('kommercheskiy-otdel.html', _os.path.join(_ROOT, "out", "Сайт_коммерческий_отдел.html"))]:
    body = _cg1_read_file(_os.path.join(S, src), encoding='utf-8')
    m = re.match(r'\s*(<title>.*?</title>)\s*', body, re.S)
    rest = body[m.end():]
    hm = re.match(r'((?:\s*<(?:meta|link)[^>]*>)*\s*<style>.*?</style>)', rest, re.S)
    doc = ('<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
           '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
           + m.group(1) + '\n' + hm.group(1).strip()
           + '\n<style>[hidden]{display:none!important} body{margin:0} img{max-width:100%}</style>\n</head>\n<body>\n'
           + rest[hm.end():].strip() + '\n</body>\n</html>\n')
    with open(dst, 'w', encoding='utf-8') as _cg1_output_20:
        _cg1_output_20.write(doc)
    print('saved', dst)
