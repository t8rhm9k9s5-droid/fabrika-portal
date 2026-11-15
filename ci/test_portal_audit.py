"""Offline regressions using the checked-in plan and synthetic report captions."""
from html.parser import HTMLParser
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
# 15.11.2026: в репозитории — portal/build и portal/assets; в рабочей копии — /home/claude/build и /home/claude/site/assets
def _portal(rel):
    if (ROOT / 'portal').is_dir(): return ROOT / 'portal' / rel
    top, _, rest = str(rel).partition('/')
    return Path('/home/claude') / ('site/assets' if top == 'assets' else top) / rest


BUILD = _portal('build')
sys.path.insert(0, str(BUILD))
from site_widgets import build_minimap, repair_note


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.targets = []
        self.svg_role = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a':
            self.targets.append((attrs['href'].split('#')[1], attrs.get('aria-label')))
        if tag == 'svg':
            self.svg_role = attrs.get('role')


class PortalAudit(unittest.TestCase):
    def test_all_buildings_and_camera_totals_come_from_destination(self):
        page = (BUILD / 'plan_frag.html').read_text()
        plan = json.JSONDecoder().raw_decode(page.split('const DATA=', 1)[1])[0]
        html, counts = build_minimap(page)
        links = Links()
        links.feed(html)
        self.assertEqual(links.svg_role, 'group')
        self.assertTrue(links.targets)
        self.assertEqual(counts['b'], len({key for key, label in links.targets}))
        self.assertEqual(counts['c'], len(plan['cams']))
        for key, label in links.targets:
            self.assertEqual(label, plan['b'][key]['name'])

    def test_quoted_names_survive_markup(self):
        data = {'b': {'b1': {'name': 'A & "B"'}}, 'cams': []}
        page = '<path class="bld" data-b="b1" d="M0 0"/>const DATA=' + json.dumps(data)
        html, counts = build_minimap(page)
        links = Links()
        links.feed(html)
        self.assertEqual(links.targets, [('b1', 'A & "B"')])
        self.assertEqual(counts, {'b': 1, 'c': 0})

    def REDACTED_B64_21(self):
        self.assertEqual(repair_note('Отчёт на user124@example.org; с понедельника открыто.'), 'Отчёт; с понедельника открыто.')
        self.assertEqual(repair_note('Сведения на; приложение обновлено.'), 'Сведения; приложение обновлено.')
        self.assertEqual(repair_note('Отчёт на завтра.'), 'Отчёт на завтра.')
        self.assertEqual(repair_note('Данные на user125@example.org.'), 'Данные.')


if __name__ == '__main__':
    unittest.main()
