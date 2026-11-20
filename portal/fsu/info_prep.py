#!/usr/bin/env python3
"""Инфографика FTP → карточки сайта: info_done.json (dl_info.py) + база подбора → work/fsu/info/<fid>.webp|.2k.webp и info.json {код товара на сайте: [[fid, w, h, W], …]}"""
import json, os, sys, shutil, collections
SRC = sys.argv[1]; DBP = sys.argv[2]; HERE = os.path.dirname(os.path.abspath(__file__))
done = json.load(open(os.path.join(SRC, 'info_done.json'))); db = {x['id']: x for x in json.load(open(DBP))}
out = collections.defaultdict(list); D = os.path.join(HERE, 'info'); shutil.rmtree(D, ignore_errors=True); os.makedirs(D)
for fid, v in sorted(done.items(), key=lambda kv: kv[1]['p']):
    x = db.get(v['pid'])
    if not x: continue
    for nm in (fid + '.webp', fid + '.2k.webp'):
        os.link(os.path.join(SRC, 'info', nm), os.path.join(D, nm))
    out[x['code']].append([fid, v['w'], v['h'], v['W']])
json.dump(out, open(os.path.join(HERE, 'info.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(out), 'товаров,', sum(map(len, out.values())), 'картинок')
