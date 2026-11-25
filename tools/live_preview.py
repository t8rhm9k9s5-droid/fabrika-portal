# Просмотр страницы портала до выкладки: действующие файлы с хостинга (расшифровка) + файлы заплатки поверх. 26.11.2026
#   python3 live_preview.py <каталог заплатки plain> <порт>   → http://localhost:<порт>/plan.html
import sys, os, mimetypes, http.server, socketserver
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import live_get as g
PL = sys.argv[1]; ROOT = os.path.realpath(PL); PORT = int(sys.argv[2]); CACHE = {}
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        rel = os.path.normpath(self.path.split('?')[0].lstrip('/') or 'home.html').replace(os.sep, '/')
        if rel.startswith(('..', '/')) or '\x00' in rel:   # только файлы заплатки и портала, никаких путей наружу
            self.send_response(400); self.end_headers(); return
        f = os.path.join(ROOT, rel)
        if os.path.commonpath([ROOT, os.path.realpath(f)]) != ROOT: self.send_response(400); self.end_headers(); return
        try:
            if os.path.isfile(f): b = open(f, 'rb').read()
            else:
                if rel not in CACHE: CACHE[rel] = g.read(rel)
                b = CACHE[rel]
        except Exception:
            self.send_response(404); self.end_headers(); return
        self.send_response(200); self.send_header('Content-Type', (mimetypes.guess_type(rel)[0] or 'application/octet-stream') + ('; charset=utf-8' if rel.endswith(('.html', '.js', '.css', '.json')) else '')); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
socketserver.ThreadingTCPServer.allow_reuse_address = True
socketserver.ThreadingTCPServer(('10.0.0.6', PORT), H).serve_forever()
