"""Measure file representations after the library is copied into a release."""
import json
from pathlib import Path
import re


def update_library_sizes(fragment, site):
    match = re.search(r'(<script id="lib-data"[^>]*>)(.*?)(</script>)', fragment, re.S)
    data = json.loads(match.group(2))
    root = (Path(site) / 'library').resolve()

    def delivered_size(name):
        if not name or not name.startswith('library/'):
            return None
        path = (root / name[len('library/'):]).resolve()
        if root not in path.parents or not path.is_file():
            return None
        return path.stat().st_size

    def refresh(node):
        if isinstance(node, list):
            for item in node:
                refresh(item)
        elif isinstance(node, dict):
            if isinstance(node.get('file'), str) and node['file'].startswith('library/'):
                node['bytes'] = delivered_size(node['file'])
                preview = data.get('view', {}).get(node['file'])
                if preview:
                    node['previewBytes'] = delivered_size(preview)
            for value in node.values():
                refresh(value)

    refresh(data)
    encoded = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    return fragment[:match.start(2)] + encoded + fragment[match.end(2):]
