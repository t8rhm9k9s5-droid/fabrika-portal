# Страница calc.html для выпуска-заплатки: действующая страница портала + новый фрагмент калькулятора (build/calc_frag.html). 25.11.2026
#   python3 calc_page_patch.py <действующая calc.html> <куда положить новую>
import sys
live = open(sys.argv[1], encoding='utf-8').read(); new = open('/home/claude/build/calc_frag.html', encoding='utf-8').read()
i = live.find(new[:120]); j = live.rfind(new[-120:]); assert i > 0 and j > i, 'границы фрагмента не найдены'
old = live[i:j + 120]; k0 = '<link rel="stylesheet" href="assets/site.css">\n'; assert new.count(k0) == 1 and old.count(k0) == 1
x = old.index(k0) + len(k0); ins = old[x:old.index('<style>', x)]          # строки, которые добавляет сборка портала (стили разделов, тревоги)
page = live[:i] + new.replace(k0, k0 + ins) + live[j + 120:]
open(sys.argv[2], 'w', encoding='utf-8').write(page); print('calc.html', len(live), '→', len(page))
