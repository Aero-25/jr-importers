# -*- coding: utf-8 -*-
"""Emit the design-canvas artboards and the standalone viewer page."""
import io, json, os
from system import SYSTEMS
from screens import SCREENS, CAPTIONS

OUT = os.path.dirname(os.path.abspath(__file__))

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
    body { margin: 0; background: %(bg)s; font-family: %(body_font)s; }
    a { color: %(ink)s; text-decoration: none; }
    a:hover { opacity: 0.86; }
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

# Frame heights on the canvas. Generous: surplus paints the direction's ground,
# clipping is the only real failure.
H = {"home": 3050, "shop": 2680, "product": 3260, "cart": 1560, "checkout": 2320,
     "repairs": 2320, "account": 1460, "mobile": 1010, "sheet": 1900}

ROWS = [["home", "shop", "product"], ["cart", "checkout", "repairs"], ["account", "mobile", "sheet"]]
ROW_Y = [0, 3420, 5940]
COL_X = [0, 1620, 3240]

NOTES = {
    "a": ("A · IMPORT DESK — editorial trade catalogue.\n\nPaper ground, hairline rules, no radii, no shadows. "
          "Bricolage Grotesque with every number — price, SKU, stock, spec — in IBM Plex Mono.\n\n"
          "Why: the pitch is “import prices, real shelf”. This reads like the stock list it actually is, "
          "and it scales to hundreds of SKUs without getting louder.\n"
          "Tradeoff: restrained. It sells trust and accuracy, not desire — a flagship launch will feel undersold."),
    "b": ("B · NIGHT COUNTER — dark showroom.\n\nNear-black ground with a spotlight, Syne display, one lime accent, "
          "generous space, one product hero'd at a time.\n\n"
          "Why: makes a N$ 26 499 handset feel like one, and the rugged Ulefone line photographs well against black.\n"
          "Tradeoff: it lives or dies on photography. Dense screens — catalogue, cart, account — need the most care here."),
    "c": ("C · KIOSK — price-led poster commerce.\n\nArchivo Black, 3px ink borders, hard offset shadows, lime blocks, "
          "oversized prices, sticker badges.\n\n"
          "Why: price is why people buy from an importer, so price is the loudest thing on the page. Holds up on a cheap "
          "phone in bright daylight, which is most of the traffic.\n"
          "Tradeoff: loud. It works against the premium Samsung end, and heavy borders need discipline on long forms."),
}


def stem(ds, key):
    if ds.key == "a" and key == "home":
        return "Main"
    return ds.letter + key.capitalize()


def build_artboards():
    files, boards, annotations = [], [], []
    pages = []
    for ds in SYSTEMS:
        page = "page-" + ds.key
        pages.append({"id": page, "name": "%s · %s" % (ds.letter, ds.name)})
        for ri, row in enumerate(ROWS):
            for ci, key in enumerate(row):
                name, fn, w = next((n, f, wd) for k, n, f, wd in SCREENS if k == key)
                inner = fn(ds)
                fname = stem(ds, key) + ".dc.html"
                io.open(os.path.join(OUT, fname), "w", encoding="utf-8").write(
                    DC % dict(fonts="&".join("family=" + f for f in ds.fonts), bg=ds.bg,
                              body_font=ds.f_body, ink=ds.ink, inner=inner, w=w, h=H[key]))
                files.append(fname)
                boards.append({"file": fname, "title": "%s%d · %s" % (ds.letter, ri * 3 + ci + 1, name),
                               "x": COL_X[ci], "y": ROW_Y[ri], "w": w, "h": H[key], "page": page})
        annotations.append({"id": "note-" + ds.key, "x": 0, "y": -300, "w": 760,
                            "text": NOTES[ds.key], "page": page})
    canvas = {"artboards": boards, "annotations": annotations, "pages": pages,
              "launch": {"view": "canvas", "page": "page-a"}}
    io.open(os.path.join(OUT, "canvas.json"), "w", encoding="utf-8").write(
        json.dumps(canvas, indent=2, ensure_ascii=False))
    return files


ALL_FONTS = []
for _ds in SYSTEMS:
    for _f in _ds.fonts:
        if _f not in ALL_FONTS:
            ALL_FONTS.append(_f)

VIEWER_CSS = """
  :root {
    --ui-bg: #eceae5; --ui-panel: #ffffff; --ui-ink: #191c1f; --ui-muted: #5f676f;
    --ui-line: #d5d1c9; --ui-accent: #101b28;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ui-bg: #121316; --ui-panel: #1a1c20; --ui-ink: #ececea; --ui-muted: #9aa1a9;
      --ui-line: #2c2f34; --ui-accent: #a3e635;
    }
  }
  :root[data-theme="dark"] {
    --ui-bg: #121316; --ui-panel: #1a1c20; --ui-ink: #ececea; --ui-muted: #9aa1a9;
    --ui-line: #2c2f34; --ui-accent: #a3e635;
  }
  body { margin: 0; background: var(--ui-bg); color: var(--ui-ink);
         font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
         -webkit-text-size-adjust: 100%; }
  .wrap { max-width: 1240px; margin: 0 auto; padding: 0 14px 60px; }
  header.top { padding: 22px 0 6px; }
  header.top h1 { margin: 0; font-size: 19px; font-weight: 700; letter-spacing: -0.015em; }
  header.top p { margin: 7px 0 0; max-width: 66ch; color: var(--ui-muted); font-size: 14px; }
  .nav { position: sticky; top: 0; z-index: 5; margin: 14px -14px 0; padding: 10px 14px 0;
         background: var(--ui-bg); border-bottom: 1px solid var(--ui-line); }
  .row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 10px; -webkit-overflow-scrolling: touch; }
  .row + .row { border-top: 1px solid var(--ui-line); padding-top: 10px; }
  button { font: inherit; cursor: pointer; }
  .dir, .scr {
    display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 16px; flex: 0 0 auto;
    border: 1px solid var(--ui-line); border-radius: 999px; background: var(--ui-panel); color: var(--ui-ink);
    font-size: 14px; font-weight: 600; white-space: nowrap;
  }
  .scr { min-height: 40px; padding: 0 14px; font-size: 13.5px; font-weight: 500; }
  .dir[aria-selected="true"], .scr[aria-selected="true"] {
    background: var(--ui-ink); color: var(--ui-bg); border-color: var(--ui-ink); }
  .letter { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px;
            border-radius: 50%; background: var(--ui-accent); color: var(--ui-bg); font-size: 11px; font-weight: 700; }
  .dir[aria-selected="true"] .letter { background: var(--ui-bg); color: var(--ui-ink); }
  .meta { padding: 22px 0 14px; }
  .meta h2 { margin: 0; font-size: 21px; letter-spacing: -0.02em; }
  .meta p { margin: 8px 0 0; max-width: 74ch; color: var(--ui-muted); font-size: 14.5px; }
  .bar { display: flex; align-items: center; gap: 10px; padding-bottom: 10px; }
  .zoom { display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px; border: 1px solid var(--ui-line);
          border-radius: 999px; background: var(--ui-panel); color: var(--ui-ink); font-size: 13.5px; font-weight: 600; }
  .hint { font-size: 13px; color: var(--ui-muted); }
  .stage { overflow: auto hidden; border: 1px solid var(--ui-line); border-radius: 10px; background: var(--ui-panel);
           -webkit-overflow-scrolling: touch; }
  .stage.actual { overflow: auto; }
  .scaler { position: relative; }
  .board { transform-origin: top left; }
  .board a { text-decoration: none; }
"""

VIEWER_JS = """
  (function () {
    var dirs = Array.prototype.slice.call(document.querySelectorAll('.dir'));
    var scrs = Array.prototype.slice.call(document.querySelectorAll('.scr'));
    var cur = { d: 'a', s: 'home' };

    function panel() { return document.getElementById('p-' + cur.d + '-' + cur.s); }

    function fit(p) {
      if (!p) return;
      var stage = p.querySelector('[data-stage]');
      var scaler = p.querySelector('[data-scaler]');
      var board = p.querySelector('[data-board]');
      var w = parseInt(board.getAttribute('data-w'), 10);
      if (stage.classList.contains('actual')) {
        board.style.transform = ''; scaler.style.width = w + 'px'; scaler.style.height = '';
        return;
      }
      var s = Math.min(1, stage.clientWidth / w);
      board.style.transform = 'scale(' + s + ')';
      scaler.style.width = (w * s) + 'px';
      scaler.style.height = (board.offsetHeight * s) + 'px';
    }

    function show() {
      dirs.forEach(function (b) { b.setAttribute('aria-selected', b.dataset.dir === cur.d ? 'true' : 'false'); });
      scrs.forEach(function (b) { b.setAttribute('aria-selected', b.dataset.scr === cur.s ? 'true' : 'false'); });
      Array.prototype.forEach.call(document.querySelectorAll('.panel'), function (p) {
        p.hidden = p.id !== 'p-' + cur.d + '-' + cur.s;
      });
      fit(panel());
      try { localStorage.setItem('jr-redesign-view', cur.d + '|' + cur.s); } catch (e) {}
    }

    dirs.forEach(function (b) { b.addEventListener('click', function () { cur.d = b.dataset.dir; show(); }); });
    scrs.forEach(function (b) { b.addEventListener('click', function () { cur.s = b.dataset.scr; show(); }); });

    Array.prototype.forEach.call(document.querySelectorAll('.panel'), function (p) {
      var stage = p.querySelector('[data-stage]');
      var bar = p.querySelector('[data-bar]');
      var btn = bar.querySelector('button');
      var hint = bar.querySelector('.hint');
      btn.addEventListener('click', function () {
        var actual = stage.classList.toggle('actual');
        btn.textContent = actual ? 'Fit to screen' : 'Actual size';
        hint.textContent = actual ? 'Full width — scroll to pan' : 'Scaled to fit';
        fit(p);
      });
    });

    try {
      var saved = (localStorage.getItem('jr-redesign-view') || '').split('|');
      if (saved.length === 2 && document.getElementById('p-' + saved[0] + '-' + saved[1])) {
        cur.d = saved[0]; cur.s = saved[1];
      }
    } catch (e) {}
    show();
    addEventListener('resize', function () { fit(panel()); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fit(panel()); });
    setTimeout(function () { fit(panel()); }, 500);
  })();
"""


def build_viewer():
    dirtabs = "".join('<button type="button" class="dir" data-dir="%s" aria-selected="false">'
                      '<span class="letter">%s</span>%s</button>' % (ds.key, ds.letter, ds.name)
                      for ds in SYSTEMS)
    scrtabs = "".join('<button type="button" class="scr" data-scr="%s" aria-selected="false">%s</button>' % (k, n)
                      for k, n, _f, _w in SCREENS)
    panels = []
    for ds in SYSTEMS:
        for key, name, fn, w in SCREENS:
            panels.append(
                '<section class="panel" id="p-%s-%s" hidden>'
                '<div class="meta"><h2>%s%d · %s — %s</h2><p>%s</p></div>'
                '<div class="bar" data-bar><button type="button" class="zoom">Actual size</button>'
                '<span class="hint">Scaled to fit</span></div>'
                '<div class="stage" data-stage><div class="scaler" data-scaler>'
                '<div class="board" data-board data-w="%d" style="width: %dpx;">%s</div></div></div></section>'
                % (ds.key, key, ds.letter, [k for k, _n, _f, _w2 in SCREENS].index(key) + 1, name, ds.name,
                   CAPTIONS[key], w, w, fn(ds)))

    html = ('<title>JR Importers Shop Redesign</title>\n'
            '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
            '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?%s&display=swap">\n'
            '<style>%s</style>\n'
            '<div class="wrap">\n'
            '<header class="top"><h1>JR Importers — storefront redesign</h1>'
            '<p>Three complete directions, nine screens each: home, catalogue, product, cart, checkout, repairs booking, '
            'account, mobile, and the design system behind them. Real catalogue data throughout — Samsung and Ulefone, '
            'prices and stock from the live seed. Device images are drawn placeholders where product photography goes.</p></header>\n'
            '<div class="nav"><div class="row">%s</div><div class="row">%s</div></div>\n'
            '%s\n</div>\n<script>%s</script>\n'
            % ("&".join("family=" + f for f in ALL_FONTS), VIEWER_CSS, dirtabs, scrtabs,
               "\n".join(panels), VIEWER_JS))
    io.open(os.path.join(OUT, "jr-importers-shop-redesign-viewer.html"), "w", encoding="utf-8").write(html)
    return len(html)


if __name__ == "__main__":
    files = build_artboards()
    n = build_viewer()
    print("artboards: %d" % len(files))
    print("viewer: %d bytes" % n)
