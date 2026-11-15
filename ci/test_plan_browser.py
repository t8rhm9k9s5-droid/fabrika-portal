"""Exercise hit testing in the actual assembled plan with the edits service offline."""
import argparse
from pathlib import Path
import re
import subprocess
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]

TEST_JS = """
window.addEventListener('load', () => setTimeout(() => {
  const result = document.getElementById('audit-result');
  try {
    const markers = Array.from(document.querySelectorAll('#marks .cam[data-camera-id]'));
    if (!markers.length || markers.length !== DATA.cams.length) throw Error('Camera markers missing');
    const missed = [];
    let shared = 0, direct = 0, covered = 0;
    for (const marker of markers) {
      const box = marker.getBoundingClientRect();
      const x = box.left + box.width / 2, y = box.top + box.height / 2;
      const target = document.elementFromPoint(x, y);
      if (!target || !target.closest('#map')) { covered++; continue; }
      target.dispatchEvent(new MouseEvent('click', {bubbles:true, detail:1, clientX:x, clientY:y}));
      const options = Array.from(document.querySelectorAll('#card button[data-choice]'));
      if (options.length) {
        shared++;
        const intended = options.find(button => button.dataset.choice === marker.dataset.cameraId);
        if (intended) intended.click();
        else { missed.push(marker.dataset.cameraId); continue; }
      } else { direct++; }
      if (!marker.classList.contains('sel')) missed.push(marker.dataset.cameraId);
    }
    const first = markers[0];
    first.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    if (!first.classList.contains('sel')) throw Error('Keyboard selection failed');
    if (missed.length || !shared || !direct) throw Error(JSON.stringify({missed,shared,direct,covered}));
    result.textContent = 'PASS ' + JSON.stringify({markers:markers.length,shared,direct,covered});
    result.dataset.status = 'pass';
  } catch (error) {
    result.textContent = String(error);
    result.dataset.status = 'fail';
  }
}, 400));
"""


def fixture():
    portal = ROOT / 'portal'
    source = (portal / 'build/plan_frag.html').read_text()
    source = re.sub(r'<script\s+src="[^"]+"></script>', '', source)
    # Exercise the same public API that the page builder installs in the generated plan.
    builder = (portal / 'build/build_site.py').read_text()
    export = re.search(r'"(window\.T14Plan=.+?;)" \+ _tf', builder)[1]
    anchor = "tog('tFov','nofov','cctv.fov');"
    assert source.count(anchor) == 1
    source = source.replace(anchor, export + anchor)
    source += '<script>' + (portal / 'assets/mapinfo.js').read_text() + '</script>'
    source = re.sub(r'<link\b[^>]+>', '', source)
    # The local snapshot has no user edits or network calls.
    stub = """window.T14Site={panel:()=>'',wire:()=>{},keys:()=>{}}; window.T14Edits={ready:async()=>{},ids:()=>[],get:()=>null,on:()=>{},centroid:poly=>{
      const n=poly.length; return poly.reduce((p,v)=>[p[0]+v[0]/n,p[1]+v[1]/n],[0,0]); }};"""
    policy = """<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">"""
    return (policy + '<script>' + stub + '</script>' + source
            + '<output id="audit-result"></output><script>' + TEST_JS + '</script>')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixture', type=Path)
    parser.add_argument('--browser', default='google-chrome')
    args = parser.parse_args()
    if args.fixture:
        args.fixture.write_text(fixture())
    else:
        with TemporaryDirectory() as folder:
            page = Path(folder) / 'map.html'
            page.write_text(fixture())
            output = subprocess.run([args.browser, '--headless', '--no-sandbox', '--disable-gpu',
                                     '--window-size=1584,893', '--virtual-time-budget=2000',
                                     '--dump-dom', page.as_uri()], check=True, capture_output=True, text=True)
            result = re.search(r'<output id="audit-result"[^>]*>([^<]*)</output>', output.stdout)
            if not result or 'data-status="pass"' not in result[0]:
                raise SystemExit('Map browser regression: ' + (result[1] if result else 'no result'))
            print(result[1])
