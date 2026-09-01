# -*- coding: utf-8 -*-
"""Emit the overhaul artboards, canvas.json and the standalone viewer."""
import io, json, os
import d1_terminal, d2_coast, d3_ask

OUT = os.path.dirname(os.path.abspath(__file__))
DIRS = [d1_terminal, d2_coast, d3_ask]

DC = """<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?%(fonts)s&display=swap">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: %(bg)s; font-family: %(font)s; }
    a { color: %(ink)s; text-decoration: none; }
  </style>
</helmet>
%(inner)s
</x-dc>
<script data-dc-script data-props='{"$preview":{"width":%(w)d,"height":%(h)d}}'>
class Component extends DCLogic {}
</script>
</body>
</html>
"""

CAPTIONS = {
    ("t", "shelf"): "The whole storefront: every unit, sortable, with the till feed running live underneath.",
    ("t", "unit"): "The product page as a stock record — including the IMEI pool, which no competitor can show.",
    ("t", "buy"): "Checkout as a terminal form; the summary prints like a till slip.",
    ("t", "workshop"): "The repair queue and one open job card, with the printed terms carried over verbatim.",
    ("t", "mobile"): "390×844 — the same table, condensed to two lines a row.",
    ("t", "system"): "Ten colours, one typeface, and the row states everything is built from.",
    ("c", "cover"): "A masthead, a spread and an edit — no nav bar, no card grid.",
    ("c", "index"): "The catalogue as a magazine contents page: numbered, dotted leaders, price flush right.",
    ("c", "feature"): "The product page as a feature article, with the buy panel as a sidebar.",
    ("c", "order"): "Checkout as a reply coupon — dashed rule, ruled fields, a reservation stamp.",
    ("c", "mobile"): "Cover and feature at 390×844.",
    ("c", "system"): "Bodoni specimen, the paper palette, and the rules that keep it print-like.",
    ("a", "ask"): "The shop opens as one question, with four sliders for people who would rather not type.",
    ("a", "shortlist"): "The answer in plain language, then rows you can actually compare, with a compare tray.",
    ("a", "compare"): "Three side by side — including how often each comes back to our own bench.",
    ("a", "product"): "Why we would hand you this one, what you give up, then the specs.",
    ("a", "checkout"): "Three collapsing steps and a bag that never leaves the screen.",
    ("a", "mobile"): "Ask and shortlist at 390×844.",
    ("a", "system"): "The scores, the one accent, and the row component.",
}

COL_X = [0, 1660, 3320]
ROW_GAP = 240


def stem(meta, key):
    if meta["key"] == "t" and key == "shelf":
        return "Main"
    return meta["key"].upper() + key.capitalize()


def build_artboards():
    boards, notes, pages = [], [], []
    for mod in DIRS:
        m = mod.META
        page_id = "page-" + m["key"]
        pages.append({"id": page_id, "name": "%s · %s" % (m["letter"], m["name"])})
        y = 0
        for i, (key, name, fn, w, h) in enumerate(mod.SCREENS):
            fname = stem(m, key) + ".dc.html"
            io.open(os.path.join(OUT, fname), "w", encoding="utf-8").write(
                DC % dict(fonts="&".join("family=" + f for f in m["fonts"]), bg=m["bg"], ink=m["ink"],
                          font=m["font"], inner=fn(), w=w, h=h))
            col = i % 3
            if col == 0 and i:
                y += ROW_GAP
            boards.append({"file": fname, "title": "%s.%d · %s" % (m["letter"], i + 1, name),
                           "x": COL_X[col], "y": y, "w": w, "h": h, "page": page_id})
            if col == 2 or i == len(mod.SCREENS) - 1:
                y += max(b["h"] for b in boards[-(col + 1):])
        notes.append({"id": "note-" + m["key"], "x": 0, "y": -340, "w": 820, "page": page_id,
                      "text": "%s · %s — %s\n\nWHY: %s\n\nTRADEOFF: %s"
                              % (m["letter"], m["name"].upper(), m["strap"], m["why"], m["tradeoff"])})
    canvas = {"artboards": boards, "annotations": notes, "pages": pages,
              "launch": {"view": "canvas", "page": "page-t"}}
    io.open(os.path.join(OUT, "canvas.json"), "w", encoding="utf-8").write(
        json.dumps(canvas, indent=2, ensure_ascii=False))
    return [b["file"] for b in boards]


ALL_FONTS = []
for _m in DIRS:
    for _f in _m.META["fonts"]:
        if _f not in ALL_FONTS:
            ALL_FONTS.append(_f)

CSS = """
  :root { --bg:#f0efec; --panel:#fff; --ink:#16171a; --mid:#5f636b; --line:#dcdad5; --hot:#16171a; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { --bg:#101113; --panel:#191b1e; --ink:#ececea; --mid:#9aa0a8; --line:#2a2d32; --hot:#ececea; }
  }
  :root[data-theme="dark"] { --bg:#101113; --panel:#191b1e; --ink:#ececea; --mid:#9aa0a8; --line:#2a2d32; --hot:#ececea; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-text-size-adjust:100%; }
  .wrap { max-width:1280px; margin:0 auto; padding:0 14px 60px; }
  header.top { padding:24px 0 8px; }
  header.top h1 { margin:0; font-size:20px; font-weight:700; letter-spacing:-0.02em; }
  header.top p { margin:8px 0 0; max-width:68ch; color:var(--mid); font-size:14px; }
  .nav { position:sticky; top:0; z-index:5; margin:16px -14px 0; padding:10px 14px 0; background:var(--bg);
         border-bottom:1px solid var(--line); }
  .row { display:flex; gap:8px; overflow-x:auto; padding-bottom:10px; -webkit-overflow-scrolling:touch; }
  .row + .row { border-top:1px solid var(--line); padding-top:10px; }
  button { font:inherit; cursor:pointer; }
  .dir, .scr { display:inline-flex; align-items:center; gap:9px; min-height:44px; padding:0 16px; flex:0 0 auto;
    border:1px solid var(--line); border-radius:10px; background:var(--panel); color:var(--ink);
    font-size:14px; font-weight:600; white-space:nowrap; }
  .scr { min-height:40px; padding:0 14px; font-size:13.5px; font-weight:500; border-radius:999px; }
  .dir[aria-selected="true"], .scr[aria-selected="true"] { background:var(--hot); color:var(--bg); border-color:var(--hot); }
  .num { font-size:11.5px; font-weight:700; opacity:.55; letter-spacing:.06em; }
  .meta { padding:24px 0 14px; }
  .meta h2 { margin:0; font-size:22px; letter-spacing:-0.02em; }
  .meta p { margin:9px 0 0; max-width:76ch; color:var(--mid); font-size:14.5px; }
  .why { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; margin:16px 0 0; }
  .why div { padding:14px 16px; border:1px solid var(--line); border-radius:12px; background:var(--panel); }
  .why b { display:block; font-size:11.5px; letter-spacing:.14em; text-transform:uppercase; color:var(--mid); margin-bottom:6px; }
  .why span { font-size:14px; line-height:1.6; }
  @media (max-width:720px) { .why { grid-template-columns:1fr; } }
  .bar { display:flex; align-items:center; gap:10px; padding-bottom:10px; }
  .zoom { display:inline-flex; align-items:center; min-height:44px; padding:0 16px; border:1px solid var(--line);
    border-radius:999px; background:var(--panel); color:var(--ink); font-size:13.5px; font-weight:600; }
  .hint { font-size:13px; color:var(--mid); }
  .stage { overflow:auto hidden; border:1px solid var(--line); border-radius:12px; background:var(--panel);
    -webkit-overflow-scrolling:touch; }
  .stage.actual { overflow:auto; }
  .scaler { position:relative; }
  .board { transform-origin:top left; }
"""

JS = """
  (function(){
    var dirs=[].slice.call(document.querySelectorAll('.dir'));
    var cur={d:'t',s:'shelf'};
    function panel(){return document.getElementById('p-'+cur.d+'-'+cur.s);}
    function fit(p){ if(!p) return;
      var st=p.querySelector('[data-stage]'), sc=p.querySelector('[data-scaler]'), bd=p.querySelector('[data-board]');
      var w=parseInt(bd.getAttribute('data-w'),10);
      if(st.classList.contains('actual')){bd.style.transform='';sc.style.width=w+'px';sc.style.height='';return;}
      var s=Math.min(1,st.clientWidth/w);
      bd.style.transform='scale('+s+')'; sc.style.width=(w*s)+'px'; sc.style.height=(bd.offsetHeight*s)+'px';
    }
    function show(){
      dirs.forEach(function(b){b.setAttribute('aria-selected',b.dataset.dir===cur.d?'true':'false');});
      [].forEach.call(document.querySelectorAll('.scr'),function(b){
        b.hidden = b.dataset.dir!==cur.d;
        b.setAttribute('aria-selected',(b.dataset.dir===cur.d&&b.dataset.scr===cur.s)?'true':'false');
      });
      [].forEach.call(document.querySelectorAll('.panel'),function(p){p.hidden = p.id!=='p-'+cur.d+'-'+cur.s;});
      fit(panel());
      try{localStorage.setItem('jr-overhaul',cur.d+'|'+cur.s);}catch(e){}
    }
    dirs.forEach(function(b){b.addEventListener('click',function(){
      cur.d=b.dataset.dir; cur.s=b.dataset.first; show();
    });});
    [].forEach.call(document.querySelectorAll('.scr'),function(b){
      b.addEventListener('click',function(){cur.d=b.dataset.dir;cur.s=b.dataset.scr;show();});
    });
    [].forEach.call(document.querySelectorAll('.panel'),function(p){
      var st=p.querySelector('[data-stage]'), bar=p.querySelector('[data-bar]');
      var btn=bar.querySelector('button'), hint=bar.querySelector('.hint');
      btn.addEventListener('click',function(){
        var a=st.classList.toggle('actual');
        btn.textContent=a?'Fit to screen':'Actual size';
        hint.textContent=a?'Full width — scroll to pan':'Scaled to fit';
        fit(p);
      });
    });
    try{var sv=(localStorage.getItem('jr-overhaul')||'').split('|');
      if(sv.length===2&&document.getElementById('p-'+sv[0]+'-'+sv[1])){cur.d=sv[0];cur.s=sv[1];}}catch(e){}
    show();
    addEventListener('resize',function(){fit(panel());});
    if(document.fonts&&document.fonts.ready) document.fonts.ready.then(function(){fit(panel());});
    setTimeout(function(){fit(panel());},600);
  })();
"""


def build_viewer():
    dirtabs, scrtabs, panels = [], [], []
    for mod in DIRS:
        m = mod.META
        first = mod.SCREENS[0][0]
        dirtabs.append('<button type="button" class="dir" data-dir="%s" data-first="%s" aria-selected="false">'
                       '<span class="num">%s</span>%s</button>' % (m["key"], first, m["letter"], m["name"]))
        for i, (key, name, fn, w, h) in enumerate(mod.SCREENS):
            scrtabs.append('<button type="button" class="scr" data-dir="%s" data-scr="%s" aria-selected="false" hidden>%s</button>'
                           % (m["key"], key, name))
            panels.append(
                '<section class="panel" id="p-%s-%s" hidden>'
                '<div class="meta"><h2>%s.%d · %s — %s</h2><p>%s</p>'
                '<div class="why"><div><b>Why this direction</b><span>%s</span></div>'
                '<div><b>What it costs you</b><span>%s</span></div></div></div>'
                '<div class="bar" data-bar><button type="button" class="zoom">Actual size</button>'
                '<span class="hint">Scaled to fit</span></div>'
                '<div class="stage" data-stage><div class="scaler" data-scaler>'
                '<div class="board" data-board data-w="%d" style="width:%dpx;">%s</div></div></div></section>'
                % (m["key"], key, m["letter"], i + 1, name, m["name"],
                   CAPTIONS.get((m["key"], key), ""), m["why"], m["tradeoff"], w, w, fn()))

    html = ('<title>JR Importers Shop Overhaul</title>\n'
            '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
            '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?%s&display=swap">\n'
            '<style>%s</style>\n<div class="wrap">\n'
            '<header class="top"><h1>JR Importers — three overhauls</h1>'
            '<p>Not three palettes on one layout. Three structurally different shops: a live stock terminal, a printed '
            'magazine, and a shop that opens with a question. Different information architecture, different typefaces, '
            'different palettes, nothing shared between them. Real catalogue data throughout; drawn placeholders where '
            'product photography goes.</p></header>\n'
            '<div class="nav"><div class="row">%s</div><div class="row">%s</div></div>\n%s\n</div>\n'
            '<script>%s</script>\n'
            % ("&".join("family=" + f for f in ALL_FONTS), CSS, "".join(dirtabs), "".join(scrtabs),
               "\n".join(panels), JS))
    io.open(os.path.join(OUT, "jr-importers-shop-overhaul-viewer.html"), "w", encoding="utf-8").write(html)
    return len(html)


if __name__ == "__main__":
    files = build_artboards()
    n = build_viewer()
    print("artboards: %d" % len(files))
    print("viewer: %d bytes" % n)
