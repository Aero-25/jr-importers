import io, re, json

SECTIONS = [
    ("a", "A", "Import Desk", "Main.dc.html", "'IBM Plex Sans', system-ui, sans-serif", "#101b28",
     "Editorial trade catalogue. Paper ground, hairline rules, no radii, no shadows. Bricolage Grotesque with every number — price, SKU, stock, spec — set in IBM Plex Mono.",
     "The pitch is “import prices, real shelf”. This looks like a supplier's stock list, not a marketing site, and it scales to hundreds of SKUs without getting louder.",
     "Restrained. It sells trust and accuracy rather than desire, so a flagship launch will feel undersold."),
    ("b", "B", "Night Counter", "DirectionB.dc.html", "'Manrope', system-ui, sans-serif", "#f2f1ee",
     "Dark showroom. Near-black ground with a spotlight, Syne display type, one lime accent, generous space, one product hero'd at a time.",
     "Makes a N$ 26 499 handset feel like one, and the rugged Ulefone line photographs well against black.",
     "It lives or dies on photography — weak product shots look worse here than anywhere else. Denser pages (catalogue, cart, account) will need a lighter companion surface."),
    ("c", "C", "Kiosk", "DirectionC.dc.html", "'DM Sans', system-ui, sans-serif", "#0d263f",
     "Price-led poster commerce. Archivo Black, 3px ink borders, hard offset shadows, lime blocks, oversized prices, sticker badges.",
     "Price is why people buy from an importer, so price is the loudest thing on the page. Holds up on a cheap phone in bright daylight, which is most of the traffic.",
     "Loud. It works against the premium Samsung end of the range, and heavy borders need discipline on long forms — checkout, job cards, account."),
]

FONT_LINKS = """<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Syne:wght@600;700;800&family=Manrope:wght@400;500;600;700&family=Archivo+Black&family=DM+Sans:wght@400;500;700&display=swap">"""


def artboard(path):
    s = io.open(path, encoding="utf-8").read()
    inner = s.split("<x-dc>", 1)[1].split("</x-dc>", 1)[0]
    inner = re.sub(r"<helmet>.*?</helmet>", "", inner, flags=re.S)
    return inner.strip()


tabs, panels = [], []
for key, letter, name, path, font, ink, what, why, tradeoff in SECTIONS:
    tabs.append(
        f'<button type="button" class="tab" data-tab="{key}" aria-selected="false">'
        f'<span class="tab-letter">{letter}</span>{name}</button>'
    )
    panels.append(f"""<section class="panel" id="panel-{key}" hidden>
  <div class="brief">
    <h2><span class="brief-letter">{letter}</span>{name}</h2>
    <p class="what">{what}</p>
    <dl>
      <dt>Why</dt><dd>{why}</dd>
      <dt>Tradeoff</dt><dd>{tradeoff}</dd>
    </dl>
  </div>
  <div class="stage" data-stage>
    <div class="scaler" data-scaler>
      <div class="board" data-board style="font-family: {font}; color: {ink};">
{artboard(path)}
      </div>
    </div>
  </div>
</section>""")

html = f"""<title>JR Importers Shop Redesign</title>
{FONT_LINKS}
<style>
  :root {{
    --ui-bg: #eceae5;
    --ui-panel: #ffffff;
    --ui-ink: #191c1f;
    --ui-muted: #5f676f;
    --ui-line: #d5d1c9;
    --ui-accent: #101b28;
  }}
  @media (prefers-color-scheme: dark) {{
    :root:not([data-theme="light"]) {{
      --ui-bg: #121316;
      --ui-panel: #1a1c20;
      --ui-ink: #ececea;
      --ui-muted: #9aa1a9;
      --ui-line: #2c2f34;
      --ui-accent: #a3e635;
    }}
  }}
  :root[data-theme="dark"] {{
    --ui-bg: #121316;
    --ui-panel: #1a1c20;
    --ui-ink: #ececea;
    --ui-muted: #9aa1a9;
    --ui-line: #2c2f34;
    --ui-accent: #a3e635;
  }}

  body {{
    margin: 0;
    background: var(--ui-bg);
    color: var(--ui-ink);
    font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-text-size-adjust: 100%;
  }}
  .wrap {{ max-width: 1180px; margin: 0 auto; padding: 0 14px 56px; }}

  header.top {{ padding: 22px 0 14px; }}
  header.top h1 {{ margin: 0; font-size: 19px; font-weight: 700; letter-spacing: -0.015em; }}
  header.top p {{ margin: 7px 0 0; max-width: 62ch; color: var(--ui-muted); font-size: 14px; }}

  .tabs {{
    position: sticky; top: 0; z-index: 5;
    display: flex; gap: 8px; overflow-x: auto;
    margin: 16px -14px 0; padding: 10px 14px;
    background: var(--ui-bg);
    border-bottom: 1px solid var(--ui-line);
    -webkit-overflow-scrolling: touch;
  }}
  .tab {{
    display: inline-flex; align-items: center; gap: 8px;
    min-height: 44px; padding: 0 16px; flex: 0 0 auto;
    border: 1px solid var(--ui-line); border-radius: 999px;
    background: var(--ui-panel); color: var(--ui-ink);
    font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
  }}
  .tab[aria-selected="true"] {{ background: var(--ui-ink); color: var(--ui-bg); border-color: var(--ui-ink); }}
  .tab-letter {{
    display: inline-flex; align-items: center; justify-content: center;
    width: 20px; height: 20px; border-radius: 50%;
    background: var(--ui-accent); color: var(--ui-bg);
    font-size: 11px; font-weight: 700;
  }}
  .tab[aria-selected="true"] .tab-letter {{ background: var(--ui-bg); color: var(--ui-ink); }}

  .brief {{ padding: 24px 0 18px; }}
  .brief h2 {{ display: flex; align-items: center; gap: 10px; margin: 0; font-size: 22px; letter-spacing: -0.02em; }}
  .brief-letter {{
    display: inline-flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: 50%;
    background: var(--ui-ink); color: var(--ui-bg); font-size: 13px; font-weight: 700;
  }}
  .brief .what {{ margin: 10px 0 0; max-width: 68ch; color: var(--ui-muted); }}
  .brief dl {{ display: grid; grid-template-columns: 78px minmax(0, 1fr); gap: 6px 14px; margin: 16px 0 0; max-width: 68ch; }}
  .brief dt {{ font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ui-muted); padding-top: 2px; }}
  .brief dd {{ margin: 0; font-size: 14.5px; }}

  .bar {{ display: flex; align-items: center; gap: 10px; padding-bottom: 10px; }}
  .zoom {{
    display: inline-flex; align-items: center; gap: 8px;
    min-height: 44px; padding: 0 16px;
    border: 1px solid var(--ui-line); border-radius: 999px;
    background: var(--ui-panel); color: var(--ui-ink);
    font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer;
  }}
  .hint {{ font-size: 13px; color: var(--ui-muted); }}

  .stage {{
    overflow: auto hidden;
    border: 1px solid var(--ui-line); border-radius: 10px;
    background: var(--ui-panel);
    -webkit-overflow-scrolling: touch;
  }}
  .stage.actual {{ overflow: auto; }}
  .scaler {{ position: relative; width: 1440px; }}
  .board {{ width: 1440px; transform-origin: top left; }}
  .board a {{ text-decoration: none; }}
</style>

<div class="wrap">
  <header class="top">
    <h1>JR Importers — storefront redesign</h1>
    <p>Three directions for a brand-new look, each a full homepage. Real catalogue data throughout (Samsung and Ulefone, prices from the live seed). Device images are drawn placeholders where product photography goes.</p>
  </header>

  <div class="tabs" role="tablist">
{chr(10).join(tabs)}
  </div>

{chr(10).join(panels)}
</div>

<script>
  (function () {{
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
    var panels = {{}};
    tabs.forEach(function (t) {{ panels[t.dataset.tab] = document.getElementById('panel-' + t.dataset.tab); }});

    function fit(panel) {{
      var stage = panel.querySelector('[data-stage]');
      var scaler = panel.querySelector('[data-scaler]');
      var board = panel.querySelector('[data-board]');
      if (!stage || stage.classList.contains('actual')) {{
        scaler.style.width = '1440px';
        scaler.style.height = '';
        board.style.transform = '';
        return;
      }}
      var s = Math.min(1, stage.clientWidth / 1440);
      board.style.transform = 'scale(' + s + ')';
      scaler.style.width = (1440 * s) + 'px';
      scaler.style.height = (board.offsetHeight * s) + 'px';
    }}

    function fitAll() {{ Object.keys(panels).forEach(function (k) {{ if (!panels[k].hidden) fit(panels[k]); }}); }}

    function select(key) {{
      tabs.forEach(function (t) {{
        var on = t.dataset.tab === key;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        panels[t.dataset.tab].hidden = !on;
      }});
      fit(panels[key]);
      try {{ localStorage.setItem('jr-redesign-tab', key); }} catch (e) {{}}
    }}

    tabs.forEach(function (t) {{ t.addEventListener('click', function () {{ select(t.dataset.tab); }}); }});

    // Fit / actual-size toggle, per panel.
    Object.keys(panels).forEach(function (k) {{
      var panel = panels[k];
      var stage = panel.querySelector('[data-stage]');
      var bar = document.createElement('div');
      bar.className = 'bar';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'zoom';
      btn.textContent = 'Actual size';
      var hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = 'Scaled to fit';
      bar.appendChild(btn);
      bar.appendChild(hint);
      panel.insertBefore(bar, stage);
      btn.addEventListener('click', function () {{
        var actual = stage.classList.toggle('actual');
        btn.textContent = actual ? 'Fit to screen' : 'Actual size';
        hint.textContent = actual ? 'Full 1440px — scroll to pan' : 'Scaled to fit';
        fit(panel);
      }});
    }});

    var saved = null;
    try {{ saved = localStorage.getItem('jr-redesign-tab'); }} catch (e) {{}}
    select(panels[saved] ? saved : 'a');

    addEventListener('resize', fitAll);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
    setTimeout(fitAll, 400);
  }})();
</script>
"""

io.open("jr-importers-shop-redesign-viewer.html", "w", encoding="utf-8").write(html)
print("wrote viewer", len(html), "bytes")
