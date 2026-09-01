# -*- coding: utf-8 -*-
"""02 · COAST — the shop as a printed magazine about the coast it sells to.

No nav bar, no card grid, no hero-with-button. A masthead, an editorial spread,
an index with dotted leaders, and a feature article for the product page.
Warm sand paper, high-contrast serif, asymmetry and overlap. Nothing lime,
nothing navy, no glass.
"""
from kit import P, BY, STORE, money, money_plain, svg, phone

SAND, PAPER, CARD = "#e6dbc9", "#f3ece0", "#faf6ee"
INK, DUST, FAINT = "#1a1510", "#7d7264", "#a89c8b"
RUST, ATL, OCHRE = "#b4472a", "#1e4d5c", "#c98f2e"
DISP = "'Bodoni Moda', 'Times New Roman', serif"
BODY = "'Karla', system-ui, sans-serif"
FONTS = ["Bodoni+Moda:opsz,wght@6..96,400;6..96,700;6..96,900", "Karla:wght@400;500;700"]

W = 1440
GRAIN = ("repeating-linear-gradient(0deg, rgba(26,21,16,0.018) 0px, rgba(26,21,16,0.018) 1px, "
         "rgba(0,0,0,0) 1px, rgba(0,0,0,0) 3px)")


def d(text, size, weight=700, color=INK, ls="-0.02em", lh=0.98, tag="div", extra="", italic=False):
    return ('<%s style="margin: 0; font-family: %s; font-weight: %s; font-size: %spx; line-height: %s; '
            'letter-spacing: %s; color: %s;%s%s">%s</%s>'
            % (tag, DISP, weight, size, lh, ls, color, " font-style: italic;" if italic else "", extra, text, tag))


def b(text, size=15, color=DUST, lh=1.72, maxw=None, weight=400, extra="", tag="p", top=0):
    return ('<%s style="margin: %dpx 0 0; font-family: %s; font-weight: %s; font-size: %spx; line-height: %s; '
            'color: %s;%s%s">%s</%s>'
            % (tag, top, BODY, weight, size, lh, color, (" max-width: %dpx;" % maxw) if maxw else "", extra, text, tag))


def label(text, color=RUST, size=10.5, ls="0.28em"):
    return ('<div style="font-family: %s; font-size: %spx; font-weight: 700; letter-spacing: %s; '
            'text-transform: uppercase; color: %s;">%s</div>' % (BODY, size, ls, color, text))


def folio(n, color=RUST):
    return ('<div style="font-family: %s; font-size: 13px; font-weight: 700; letter-spacing: 0.2em; color: %s;">%s</div>'
            % (BODY, color, n))


def rule(color=None, weight=1, top=0, bottom=0):
    return ('<div style="height: %dpx; background: %s; margin: %dpx 0 %dpx;"></div>'
            % (weight, color or "rgba(26,21,16,0.18)", top, bottom))


def link(text, color=INK, size=14):
    return ('<a href="#" style="display: inline-flex; align-items: center; gap: 9px; font-family: %s; font-size: %spx; '
            'font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: %s; text-decoration: none; '
            'border-bottom: 2px solid %s; padding-bottom: 4px;">%s%s</a>'
            % (BODY, size, color, color, text, svg("arrow", 15, "currentColor", 2)))


def solid(text, bg=RUST, fg="#fbf7f0", h=54, wide=False, fs=13):
    return ('<a href="#" style="display: %s; align-items: center; justify-content: center; gap: 10px; height: %dpx; '
            '%spadding: 0 30px; background: %s; color: %s; font-family: %s; font-size: %spx; font-weight: 700; '
            'letter-spacing: 0.16em; text-transform: uppercase; text-decoration: none;">%s</a>'
            % ("flex" if wide else "inline-flex", h, "width: 100%; " if wide else "", bg, fg, BODY, fs, text))


def vertical(text, color=DUST):
    return ('<div style="writing-mode: vertical-rl; transform: rotate(180deg); font-family: %s; font-size: 10.5px; '
            'font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; color: %s; white-space: nowrap;">%s</div>'
            % (BODY, color, text))


def plate(w, h, tone, bg, tilt=0, cap=None):
    """A product 'photograph': a colour plate with the handset drawn on it."""
    inner = ('<div style="position: relative; display: flex; align-items: center; justify-content: center; '
             'width: %dpx; height: %dpx; background: %s; overflow: hidden;%s">%s%s</div>'
             % (w, h, bg, (" transform: rotate(%sdeg);" % tilt) if tilt else "",
                '<div style="position: absolute; inset: 0; background: %s; opacity: 0.5;"></div>' % GRAIN,
                phone(int(w * 0.34), int(w * 0.34 * 1.95), tone,
                      extra=" box-shadow: 0 40px 60px -30px rgba(26,21,16,0.55); position: relative;")))
    if cap:
        return ('<figure style="margin: 0;">%s<figcaption style="margin-top: 12px; font-family: %s; font-size: 11.5px; '
                'font-style: italic; color: %s;">%s</figcaption></figure>' % (inner, DISP, DUST, cap))
    return inner


def page(inner, width=W, bg=SAND):
    return ('<div style="position: relative; width: %dpx; background: %s; color: %s; font-family: %s; overflow: hidden;">'
            '<div style="position: absolute; inset: 0; background: %s; pointer-events: none;"></div>'
            '<div style="position: relative;">%s</div></div>' % (width, bg, INK, BODY, GRAIN, inner))


# ── masthead / colophon ──────────────────────────────────────────────────
def masthead(section="THE SHELF"):
    nav = "".join('<a href="#" style="font-family: %s; font-size: 12px; font-weight: 700; letter-spacing: 0.2em; '
                  'text-transform: uppercase; color: %s; text-decoration: none;">%s</a>'
                  % (BODY, INK if n == section else DUST, n)
                  for n in ["THE SHELF", "THE INDEX", "THE WORKSHOP", "LAY-BY", "THE SHOP"])
    return ('<header style="padding: 22px 56px 0;">'
            '<div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px;">'
            '%s%s%s</div>%s'
            '<div style="display: flex; align-items: flex-end; justify-content: space-between; padding: 18px 0 14px;">'
            '%s<div style="text-align: right;">%s%s</div></div>%s'
            '<div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 0;">'
            '<div style="display: flex; gap: 34px;">%s</div>'
            '<div style="display: flex; align-items: center; gap: 22px;">%s%s</div></div>%s</header>'
            % (label("No. 14", DUST), label("Imported handsets · %s · %s" % (STORE["city"], STORE["country"]), DUST),
               label("Spring 2026", DUST), rule(),
               d("JR IMPORTERS", 88, 900, INK, "-0.03em", 0.86),
               b("Cellphone specialists since 2016", 13, DUST, weight=500),
               b("%s · %s" % (STORE["address"], STORE["phone"]), 13, DUST),
               rule(),
               nav,
               '<span style="font-family: %s; font-size: 12px; font-weight: 700; letter-spacing: 0.2em; color: %s;">SEARCH</span>' % (BODY, DUST),
               '<span style="display: inline-flex; align-items: center; gap: 9px; font-family: %s; font-size: 12px; '
               'font-weight: 700; letter-spacing: 0.2em; color: %s;">%s BAG (2)</span>' % (BODY, INK, svg("bag", 15, "currentColor", 1.7)),
               rule(weight=3, bottom=0)))


def colophon():
    def col(title, items):
        return ('<div>%s<div style="display: flex; flex-direction: column; gap: 10px; margin-top: 16px;">%s</div></div>'
                % (label(title, "#e6dbc9"),
                   "".join('<span style="font-family: %s; font-size: 14px; color: rgba(243,236,224,0.72);">%s</span>' % (BODY, i)
                           for i in items)))
    return ('<footer style="margin-top: 90px; padding: 62px 56px 34px; background: %s; color: #f3ece0;">'
            '<div style="display: grid; grid-template-columns: 1.6fr 1fr 1fr 1fr; gap: 48px;">'
            '<div>%s%s</div>%s%s%s</div>%s'
            '<div style="display: flex; justify-content: space-between; padding-top: 20px;">%s%s</div></footer>'
            % (ATL, d("JR IMPORTERS", 40, 900, "#f3ece0", "-0.02em", 0.9),
               b("Imported Samsung and Ulefone handsets, checked against their IMEI, sold off our own shelf at %s "
                 "and repaired on our own bench." % STORE["address"], 14, "rgba(243,236,224,0.7)", maxw=340, top=16),
               col("THE SHOP", ["Every handset", "Rugged", "Tablets", "Accessories"]),
               col("THE COUNTER", ["Book a repair", "Job card status", "Lay-by", "Warranty"]),
               col("VISIT", [STORE["address"], STORE["phone"], STORE["email"], STORE["hours"]]),
               '<div style="height: 1px; background: rgba(243,236,224,0.22); margin-top: 44px;"></div>',
               b("© 2026 JR Importers · Walvis Bay", 12, "rgba(243,236,224,0.55)"),
               b("Prices include VAT at 15% · Terms · Privacy", 12, "rgba(243,236,224,0.55)")))


def cover():
    hero = (
        '<section style="position: relative; padding: 54px 56px 0;">'
        '<div style="display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 0;">'
        '<div style="position: relative; z-index: 2; margin-right: -130px;">%s%s%s%s'
        '<div style="margin-top: 34px;">%s</div></div>'
        '<div style="position: relative;">%s</div></div>'
        '<div style="position: absolute; left: 18px; top: 130px; height: 300px;">%s</div></section>'
        % (label("The coast edition · No. 14"),
           d("Phones<br>that survive<br>the Atlantic.", 92, 900, INK, "-0.035em", 0.92, extra=" margin-top: 22px;"),
           b("Salt, sand and a two-hour power cut. We import the handsets that hold up here — and we keep them on a "
             "shelf you can walk up to, not in a warehouse three borders away.", 16.5, DUST, 1.75, 430, top=26),
           b("Sealed · IMEI-checked · warrantied on our own bench", 12.5, RUST, maxw=430, weight=700,
             extra=" letter-spacing: 0.14em; text-transform: uppercase;", top=22),
           link("Read the edit"),
           plate(760, 640, "olive", RUST, cap="Ulefone Armor 26 Ultra — thermal camera, IP69K, %s" % money(11999)),
           vertical("Walvis Bay · 22°57′S 14°30′E")))

    def edit_item(pid, w, plate_h, bg, tone, n, top=0, cap=None):
        p = BY[pid]
        return ('<div style="width: %dpx; margin-top: %dpx;">%s'
                '<div style="display: flex; align-items: baseline; justify-content: space-between; margin-top: 20px;">'
                '%s%s</div>%s'
                '<div style="margin-top: 10px;">%s</div>'
                '<div style="display: flex; align-items: baseline; justify-content: space-between; margin-top: 14px;">%s%s</div></div>'
                % (w, top, plate(w, plate_h, tone, bg, cap=cap), folio(n), label(p["brand"], DUST),
                   rule(top=12, bottom=0),
                   d(p["name"], 30, 700, INK, "-0.02em", 1.06),
                   d(money(p["price"]), 26, 400, RUST, "-0.01em", 1, italic=True),
                   link("Buy", INK, 12)))

    edit = ('<section style="padding: 96px 56px 0;">'
            '<div style="display: flex; align-items: flex-end; justify-content: space-between;">%s%s</div>%s'
            '<div style="display: flex; align-items: flex-start; gap: 40px; margin-top: 40px;">%s%s%s</div></section>'
            % (d("The Edit", 56, 900, INK, "-0.03em", 1),
               b("Eight handsets on the shelf this week. The three we would actually carry ourselves.",
                 15, DUST, maxw=420),
               rule(top=26),
               edit_item("s24u", 520, 560, ATL, "graphite", "01", 0, "The flagship. 200MP, titanium, S Pen."),
               edit_item("a15", 340, 380, OCHRE, "violet", "02", 110, "The one everybody actually buys."),
               edit_item("x13", 400, 460, "#6d6152", "sand", "03", 40, "Drop it. Then drop it again.")))

    quote = ('<section style="margin-top: 100px; padding: 76px 56px; background: %s; color: #f3ece0;">'
             '<div style="display: grid; grid-template-columns: 1fr 380px; gap: 60px; align-items: end;">'
             '<div>%s%s</div><div>%s%s</div></div></section>'
             % (ATL,
                d("&ldquo;If it is on this page it is in the building. We do not sell what we cannot hand you.&rdquo;",
                  50, 400, "#f3ece0", "-0.02em", 1.18, italic=True),
                b("Jason R., counter manager — Pelican Mall", 13, "rgba(243,236,224,0.65)", weight=700,
                  extra=" letter-spacing: 0.18em; text-transform: uppercase;", top=28),
                b("Every unit is logged against its IMEI on the same till we ring sales through. When the shop says "
                  "eleven, it is eleven.", 15.5, "rgba(243,236,224,0.78)", 1.75),
                '<div style="margin-top: 22px;">%s</div>' % link("See the index", "#f3ece0", 12)))

    dropcap = ('<span style="float: left; font-family: %s; font-size: 82px; font-weight: 900; line-height: 0.74; '
               'padding: 6px 12px 0 0; color: %s;">A</span>' % (DISP, RUST))
    article = ('<section style="padding: 96px 56px 0;">'
               '<div style="display: grid; grid-template-columns: 300px 1fr 1fr 320px; gap: 44px; align-items: start;">'
               '<div>%s%s%s</div><div>%s</div><div>%s%s</div><div>%s</div></div></section>'
               % (label("From the counter"),
                  d("The repair<br>bench", 44, 900, INK, "-0.03em", 1, extra=" margin-top: 18px;"),
                  '<div style="margin-top: 22px;">%s</div>' % link("Book a repair", RUST, 12),
                  b("%s repair cannot be priced until a technician has the handset in front of them. So we do not "
                    "quote over the phone and we do not guess. You bring it to the counter, we raise a job card, and "
                    "the fault is written down in front of you along with what already works — screen, touch, ringer, "
                    "charge port, cameras." % dropcap, 15.5, INK, 1.8),
                  b("Anything over N$350 is confirmed with you before a technician starts. A minimum handling fee of "
                    "N$200 applies and is non-refundable. Parts we replace carry a thirty-day warranty; keep the "
                    "invoice, because no handset leaves the counter without its job card.", 15.5, DUST, 1.8),
                  b("Most screens are back the same week. Water damage is honest work and honest odds — we will tell "
                    "you which it is.", 15.5, DUST, 1.8, top=18),
                  plate(320, 380, "graphite", "#8d8375", cap="Bench 2, Tuesday afternoon.")))

    numbers = ('<section style="padding: 90px 56px 0;">%s'
               '<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 40px; padding-top: 30px;">%s</div></section>'
               % (rule(),
                  "".join('<div>%s<div style="margin-top: 12px;">%s</div></div>'
                          % (d(v, 52, 400, RUST, "-0.02em", 1, italic=True), b(l, 13.5, DUST, weight=500))
                          for v, l in [("108", "handsets on the shelf as this page loaded"),
                                       ("14", "regions we courier to, from Katima to Lüderitz"),
                                       ("30", "days of warranty on every part we fit"),
                                       ("2016", "the year we opened at Pelican Mall")])))

    return page(masthead("THE SHELF") + hero + edit + quote + article + numbers + colophon())


def index():
    def chapter(title, items, n):
        rows = "".join(
            '<a href="#" style="display: flex; align-items: baseline; gap: 16px; padding: 15px 0; text-decoration: none; '
            'border-bottom: 1px solid rgba(26,21,16,0.13);">'
            '<span style="font-family: %s; font-size: 12px; font-weight: 700; color: %s; width: 34px;">%02d</span>'
            '<span style="font-family: %s; font-size: 25px; font-weight: 700; color: %s; letter-spacing: -0.015em;">%s</span>'
            '<span style="font-family: %s; font-size: 12px; color: %s; letter-spacing: 0.1em; text-transform: uppercase;">%s</span>'
            '<span style="flex-grow: 1; border-bottom: 1px dotted %s; transform: translateY(-4px);"></span>'
            '<span style="font-family: %s; font-size: 12.5px; color: %s;">%s</span>'
            '<span style="font-family: %s; font-size: 22px; font-style: italic; color: %s; width: 150px; text-align: right;">%s</span></a>'
            % (BODY, RUST, i + 1, DISP, INK, p["name"], BODY, DUST, p["brand"], FAINT,
               BODY, DUST if p["stock"] > 8 else RUST, "%d on the shelf" % p["stock"], DISP, INK, money(p["price"]))
            for i, p in enumerate(items))
        return ('<div style="margin-top: 54px;"><div style="display: flex; align-items: baseline; gap: 20px;">%s%s</div>%s%s</div>'
                % (folio(n), d(title, 34, 900, INK, "-0.025em", 1), rule(top=16), rows))

    head = ('<section style="padding: 54px 56px 0;">'
            '<div style="display: grid; grid-template-columns: 1fr 420px; gap: 60px; align-items: end;">'
            '<div>%s%s</div><div>%s%s</div></div></section>'
            % (label("Contents"),
               d("The Index", 90, 900, INK, "-0.035em", 0.94, extra=" margin-top: 18px;"),
               b("Everything in the building, priced, with what is left of it. Sorted the way the till sorts it — "
                 "dearest first, because that is the order they arrive in.", 16, DUST, 1.75),
               '<div style="display: flex; gap: 12px; margin-top: 22px;">%s%s%s</div>'
               % (solid("Samsung", INK, "#f3ece0", 42, fs=11.5), solid("Ulefone", "transparent", INK, 42, fs=11.5),
                  solid("Rugged", "transparent", INK, 42, fs=11.5))))

    smartphones = [BY[k] for k in ["s24u", "a55", "a15"]]
    rugged = [BY[k] for k in ["a26u", "pa18t", "x13", "n16p"]]
    tablets = [BY["tab"]]

    plates = ('<section style="padding: 76px 56px 0;">'
              '<div style="display: flex; align-items: flex-start; gap: 34px;">%s%s%s</div></section>'
              % (plate(420, 300, "graphite", ATL, cap="No. 01 — Galaxy S24 Ultra"),
                 plate(300, 300, "olive", RUST, cap="No. 04 — Armor 26 Ultra"),
                 '<div style="flex: 1 1 0; padding-top: 8px;">%s%s%s</div>'
                 % (d("Ask for a unit<br>by its number.", 34, 900, INK, "-0.025em", 1.04),
                    b("Every line below is a real unit with an IMEI against it. Quote the number at the counter, or "
                      "on WhatsApp, and we will put it aside for thirty minutes.", 15, DUST, 1.75, top=18),
                    '<div style="margin-top: 22px;">%s</div>' % link("WhatsApp the counter", RUST, 12))))

    return page(masthead("THE INDEX") + head + plates +
                '<section style="padding: 20px 56px 0;">%s%s%s</section>'
                % (chapter("Smartphones", smartphones, "I"),
                   chapter("Rugged &amp; outdoor", rugged, "II"),
                   chapter("Tablets", tablets, "III")) + colophon())


def feature():
    p = BY["a26u"]
    banner = ('<section style="position: relative; margin-top: 0;">'
              '<div style="position: relative; display: flex; align-items: center; justify-content: center; '
              'height: 620px; background: %s; overflow: hidden;">'
              '<div style="position: absolute; inset: 0; background: %s; opacity: 0.55;"></div>%s</div>'
              '<div style="position: absolute; left: 56px; bottom: 44px; max-width: 720px;">%s%s</div>'
              '<div style="position: absolute; right: 56px; bottom: 48px; text-align: right;">%s%s</div></section>'
              % (RUST, GRAIN,
                 phone(300, 585, "olive", extra=" box-shadow: 0 60px 90px -40px rgba(26,21,16,0.6); position: relative;"),
                 label("Feature · No. 04", "rgba(251,247,240,0.75)"),
                 d(p["name"], 76, 900, "#fbf7f0", "-0.035em", 0.96, extra=" margin-top: 16px;"),
                 label("From", "rgba(251,247,240,0.7)"),
                 d(money(p["price"]), 44, 400, "#fbf7f0", "-0.02em", 1, italic=True, extra=" margin-top: 8px;")))

    dropcap = ('<span style="float: left; font-family: %s; font-size: 78px; font-weight: 900; line-height: 0.76; '
               'padding: 6px 12px 0 0; color: %s;">T</span>' % (DISP, RUST))

    sidebar = ('<div>%s%s'
               '<div style="margin-top: 18px;">%s</div>'
               '<div style="margin-top: 26px;">%s</div>'
               '<div style="margin-top: 14px;">%s</div>'
               '<div style="margin-top: 26px; padding: 20px; border: 1px solid rgba(26,21,16,0.2);">%s%s%s</div></div>'
               % (label("On the shelf"),
                  d("12 units", 34, 700, INK, "-0.02em", 1.05, extra=" margin-top: 12px;"),
                  b("Held at %s. Reserve one and it is yours for thirty minutes." % STORE["address"], 14, DUST, 1.7),
                  solid("Add to bag · " + money(p["price"]), RUST, "#fbf7f0", 56, wide=True),
                  solid("Reserve for collection", "transparent", INK, 52, wide=True, fs=12),
                  label("Lay-by", DUST),
                  d(money(2399.8) + " down", 26, 400, INK, "-0.01em", 1.1, italic=True, extra=" margin-top: 10px;"),
                  b("then six payments of %s. The unit is put aside with its IMEI against your name."
                    % money(1599.87), 13.5, DUST, 1.7, top=10)))

    article = ('<section style="padding: 66px 56px 0;">'
               '<div style="display: grid; grid-template-columns: 1fr 1fr 340px; gap: 48px; align-items: start;">'
               '<div>%s</div><div>%s%s</div>%s</div></section>'
               % (b("%s here is a category of phone that only makes sense on a coast like this one. Fishermen, "
                    "site foremen, guides running the dunes at Sandwich Harbour — people who will drop a handset "
                    "onto wet rock and expect it to still ring." % dropcap, 16, INK, 1.82),
                  b("The Armor 26 Ultra is Ulefone's answer to that: a 5950mAh battery, IP68 and IP69K sealing, and "
                    "a FLIR thermal camera that is genuinely useful for finding a hot bearing or a leaking pipe "
                    "rather than a novelty.", 16, DUST, 1.82),
                  b("It is heavy — 341 grams, which you feel in a shirt pocket. That is the trade. Nothing this "
                    "sealed is thin.", 16, DUST, 1.82, top=18),
                  sidebar))

    specs = ('<section style="padding: 76px 56px 0;">%s'
             '<div style="display: flex; align-items: baseline; gap: 20px; padding: 22px 0 6px;">%s%s</div>'
             '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0 70px;">%s</div></section>'
             % (rule(weight=3),
                folio("IV"), d("Specification", 34, 900, INK, "-0.025em", 1),
                "".join('<div style="display: flex; align-items: baseline; gap: 14px; padding: 13px 0; '
                        'border-bottom: 1px solid rgba(26,21,16,0.13);">'
                        '<span style="font-family: %s; font-size: 11.5px; font-weight: 700; letter-spacing: 0.18em; '
                        'text-transform: uppercase; color: %s; width: 150px; flex-shrink: 0;">%s</span>'
                        '<span style="flex-grow: 1; border-bottom: 1px dotted %s; transform: translateY(-4px);"></span>'
                        '<span style="font-family: %s; font-size: 16px; color: %s;">%s</span></div>'
                        % (BODY, DUST, k, FAINT, DISP, INK, v) for k, v in p["specs"])))

    cells = "".join(
        '<div style="width: 420px;">%s'
        '<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 14px; margin-top: 16px;">'
        '%s%s</div></div>'
        % (plate(420, 260, BY[k]["tone"], bgc),
           d(BY[k]["name"], 24, 700, INK, "-0.015em", 1.1),
           d(money_plain(BY[k]["price"]), 22, 400, RUST, "-0.01em", 1, italic=True))
        for k, bgc in [("pa18t", ATL), ("x13", OCHRE), ("n16p", "#6d6152")])
    more = ('<section style="padding: 76px 56px 0;">%s'
            '<div style="display: flex; gap: 34px; margin-top: 30px;">%s</div></section>'
            % (d("Also on the shelf", 34, 900, INK, "-0.025em", 1), cells))

    return page(masthead("THE SHELF") + banner + article + specs + more + colophon())


def order():
    def coupon_field(lab, val, w=None):
        return ('<div style="%smargin-bottom: 26px;">%s'
                '<div style="margin-top: 8px; padding-bottom: 8px; border-bottom: 1px solid %s; font-family: %s; '
                'font-size: 20px; color: %s;">%s</div></div>'
                % (("width: %dpx; " % w) if w else "", label(lab, DUST, 10, "0.22em"), INK, DISP, INK, val))

    def choice(title, detail, price, on=False):
        return ('<div style="display: flex; align-items: center; gap: 16px; padding: 16px 0; '
                'border-bottom: 1px solid rgba(26,21,16,0.14);">'
                '<span style="display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; '
                'border-radius: 50%%; border: 1px solid %s; flex-shrink: 0;">%s</span>'
                '<div style="flex-grow: 1;">%s%s</div>%s</div>'
                % (INK if on else FAINT,
                   '<span style="width: 10px; height: 10px; border-radius: 50%%; background: %s;"></span>' % RUST if on else "",
                   '<div style="font-family: %s; font-size: 19px; color: %s;">%s</div>' % (DISP, INK, title),
                   b(detail, 13, DUST, top=3),
                   '<span style="font-family: %s; font-size: 19px; font-style: italic; color: %s;">%s</span>' % (DISP, INK, price)))

    basket = "".join(
        '<div style="display: flex; align-items: baseline; gap: 12px; padding: 12px 0;">'
        '<span style="font-family: %s; font-size: 17px; color: %s;">%s</span>'
        '<span style="font-family: %s; font-size: 12px; color: %s;">x%d</span>'
        '<span style="flex-grow: 1; border-bottom: 1px dotted %s; transform: translateY(-4px);"></span>'
        '<span style="font-family: %s; font-size: 17px; color: %s;">%s</span></div>'
        % (DISP, INK, p["name"], BODY, DUST, q, FAINT, DISP, INK, money(p["price"] * q))
        for p, q in [(BY["a55"], 1), (BY["a15"], 2)])

    totals = ('%s%s%s%s'
              '<div style="display: flex; align-items: baseline; justify-content: space-between; padding-top: 16px; '
              'margin-top: 10px; border-top: 2px solid %s;">%s%s</div>'
              % (basket,
                 '<div style="display: flex; align-items: baseline; gap: 12px; padding: 12px 0;">'
                 '<span style="font-family: %s; font-size: 15px; color: %s;">Courier · nationwide</span>'
                 '<span style="flex-grow: 1; border-bottom: 1px dotted %s; transform: translateY(-4px);"></span>'
                 '<span style="font-family: %s; font-size: 16px; color: %s;">%s</span></div>'
                 % (BODY, DUST, FAINT, DISP, INK, money(150)),
                 '<div style="display: flex; align-items: baseline; gap: 12px; padding: 4px 0;">'
                 '<span style="font-family: %s; font-size: 13px; color: %s;">VAT 15%% included</span>'
                 '<span style="flex-grow: 1; border-bottom: 1px dotted %s; transform: translateY(-4px);"></span>'
                 '<span style="font-family: %s; font-size: 13px; color: %s;">%s</span></div>'
                 % (BODY, FAINT, FAINT, BODY, DUST, money(2040.91)),
                 "", INK,
                 d("Total", 26, 700, INK, "-0.02em", 1), d(money(15647), 34, 400, RUST, "-0.02em", 1, italic=True)))

    stamp = ('<div style="position: absolute; top: 30px; right: 34px; transform: rotate(9deg); width: 138px; height: 138px; '
             'border: 2px solid %s; border-radius: 50%%; display: flex; flex-direction: column; align-items: center; '
             'justify-content: center; text-align: center; color: %s;">'
             '<div style="font-family: %s; font-size: 10px; font-weight: 700; letter-spacing: 0.2em;">HELD FOR</div>'
             '<div style="font-family: %s; font-size: 32px; font-weight: 900; letter-spacing: -0.02em; margin-top: 2px;">28:14</div>'
             '<div style="font-family: %s; font-size: 9.5px; font-weight: 700; letter-spacing: 0.16em; margin-top: 2px;">MINUTES</div></div>'
             % (RUST, RUST, BODY, DISP, BODY))

    left = ('<div style="position: relative; padding: 44px; background: %s; border: 2px dashed rgba(26,21,16,0.35);">'
            '%s%s%s<div style="margin-top: 26px;"></div>'
            '<div style="display: flex; gap: 30px;">%s%s</div>%s%s'
            '<div style="margin-top: 34px;">%s</div>%s%s%s'
            '<div style="margin-top: 34px;">%s</div>%s%s%s</div>'
            % (CARD, stamp, label("Order form · JR-2419"),
               d("Where must it go?", 44, 900, INK, "-0.03em", 1.02, extra=" margin-top: 14px;"),
               coupon_field("Full name", "Johanna Amutenya", 380),
               coupon_field("Mobile", "+264 81 234 5678", 300),
               coupon_field("Email", "johanna@example.na"),
               coupon_field("Delivery address", "12 Nathaniel Maxuilili Street, Swakopmund"),
               d("How", 30, 900, INK, "-0.025em", 1),
               choice("Collect at " + STORE["address"], "Ready within the hour · " + STORE["hours"], "Free"),
               choice("Courier — nationwide", "One to three working days, all 14 regions", money(150), True),
               choice("Local delivery — " + STORE["city"], "Same day if ordered before 14:00", money(60)),
               d("Payment", 30, 900, INK, "-0.025em", 1),
               choice("Card online (DPO)", "Visa, Mastercard · 3D Secure", "Now", True),
               choice("EFT / bank transfer", "Ships once the payment reflects", "1–2 days"),
               choice("Lay-by", "20% deposit, balance over six months", money(3129.4))))

    right = ('<div style="padding-top: 6px;">%s%s%s'
             '<div style="margin-top: 30px;">%s</div>'
             '<div style="margin-top: 18px;">%s</div>'
             '<div style="margin-top: 30px; padding-top: 22px; border-top: 1px solid rgba(26,21,16,0.18);">%s%s</div></div>'
             % (label("Your basket"),
                d("Three units", 34, 900, INK, "-0.025em", 1, extra=" margin-top: 12px;"),
                '<div style="margin-top: 20px;">%s</div>' % totals,
                solid("Pay " + money(15647), RUST, "#fbf7f0", 60, wide=True),
                b("Your IMEIs are printed on the invoice the moment the payment clears.", 13.5, DUST, 1.7),
                label("Any trouble?", DUST),
                b("Call the counter on %s, or WhatsApp us. We answer between %s."
                  % (STORE["phone"], STORE["hours"]), 14, INK, 1.7, top=10)))

    return page(masthead("THE SHOP") +
                '<section style="display: grid; grid-template-columns: 1fr 400px; gap: 56px; padding: 48px 56px 0;">%s%s</section>'
                % (left, right) + colophon())


def mobile():
    def frame(inner, cap):
        return ('<div><div style="margin-bottom: 12px;">%s</div>'
                '<div style="position: relative; width: 390px; height: 844px; overflow: hidden; background: %s; '
                'box-shadow: 0 30px 60px -30px rgba(26,21,16,0.45);">'
                '<div style="position: absolute; inset: 0; background: %s; pointer-events: none;"></div>'
                '<div style="position: relative; height: 100%%;">%s</div></div></div>'
                % (label(cap, DUST), SAND, GRAIN, inner))

    m_head = ('<div style="padding: 16px 20px 12px;">'
              '<div style="display: flex; align-items: center; justify-content: space-between;">%s%s</div>%s'
              '<div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 0 12px;">%s%s</div>%s</div>'
              % (label("No. 14", DUST, 9.5, "0.22em"), label("Bag (2)", INK, 9.5, "0.22em"),
                 rule(top=10),
                 d("JR IMPORTERS", 27, 900, INK, "-0.03em", 1),
                 '<span style="font-family: %s; font-size: 10px; font-weight: 700; letter-spacing: 0.2em; color: %s;">MENU</span>' % (BODY, DUST),
                 rule(weight=2)))

    cover_m = (m_head +
               '<div style="padding: 20px 20px 0;">%s%s%s</div>'
               '<div style="margin-top: 20px;">%s</div>'
               '<div style="padding: 16px 20px 0;">%s</div>'
               '<div style="padding: 18px 20px 0;">%s</div>'
               '<div style="padding: 18px 20px 0;">%s</div>'
               % (label("The coast edition"),
                  d("Phones<br>that survive<br>the Atlantic.", 42, 900, INK, "-0.03em", 0.96, extra=" margin-top: 12px;"),
                  b("Salt, sand and a two-hour power cut. We import the handsets that hold up here.",
                    14.5, DUST, 1.7, top=14),
                  plate(390, 300, "olive", RUST),
                  '<figcaption style="font-family: %s; font-size: 11px; font-style: italic; color: %s;">'
                  'Ulefone Armor 26 Ultra — %s</figcaption>' % (DISP, DUST, money(11999)),
                  solid("Read the edit", RUST, "#fbf7f0", 50, wide=True, fs=12),
                  "".join('<a href="#" style="display: flex; align-items: baseline; gap: 10px; padding: 13px 0; '
                          'text-decoration: none; border-bottom: 1px solid rgba(26,21,16,0.14);">'
                          '<span style="font-family: %s; font-size: 10px; font-weight: 700; color: %s; width: 22px;">%02d</span>'
                          '<span style="font-family: %s; font-size: 18px; color: %s;">%s</span>'
                          '<span style="flex-grow: 1; border-bottom: 1px dotted %s; transform: translateY(-4px);"></span>'
                          '<span style="font-family: %s; font-size: 16px; font-style: italic; color: %s;">%s</span></a>'
                          % (BODY, RUST, i + 1, DISP, INK, BY[k]["name"], FAINT, DISP, INK, money_plain(BY[k]["price"]))
                          for i, k in enumerate(["s24u", "a55", "x13", "a15"]))))

    feature_m = ('<div style="position: relative;">%s'
                 '<div style="position: absolute; left: 20px; bottom: 20px; right: 20px;">%s%s</div></div>'
                 '<div style="padding: 20px;">%s%s'
                 '<div style="margin-top: 18px;">%s</div>'
                 '<div style="margin-top: 14px;">%s</div></div>'
                 '<div style="position: absolute; left: 0; right: 0; bottom: 0; padding: 14px 20px 20px; background: %s; '
                 'border-top: 1px solid rgba(26,21,16,0.18);">'
                 '<div style="display: flex; align-items: center; justify-content: space-between; gap: 14px;">'
                 '<div>%s%s</div><div style="flex-shrink: 0;">%s</div></div></div>'
                 % (plate(390, 420, "olive", RUST),
                    label("Feature · No. 04", "rgba(251,247,240,0.8)", 9.5),
                    d("Armor<br>26 Ultra", 38, 900, "#fbf7f0", "-0.03em", 0.98, extra=" margin-top: 8px;"),
                    b("A category of phone that only makes sense on a coast like this one — dropped onto wet rock and "
                      "still expected to ring.", 14.5, INK, 1.72),
                    "".join('<div style="display: flex; align-items: baseline; gap: 10px; padding: 9px 0; '
                            'border-bottom: 1px solid rgba(26,21,16,0.13);">'
                            '<span style="font-family: %s; font-size: 10px; font-weight: 700; letter-spacing: 0.16em; '
                            'text-transform: uppercase; color: %s; width: 92px;">%s</span>'
                            '<span style="flex-grow: 1; border-bottom: 1px dotted %s; transform: translateY(-4px);"></span>'
                            '<span style="font-family: %s; font-size: 14px; color: %s;">%s</span></div>'
                            % (BODY, DUST, k, FAINT, DISP, INK, v)
                            for k, v in BY["a26u"]["specs"][:4]),
                    b("12 on the shelf at %s" % STORE["address"], 13, RUST, weight=700,
                      extra=" letter-spacing: 0.1em; text-transform: uppercase;"),
                    b("Lay-by from %s down" % money(2399.8), 13, DUST),
                    CARD,
                    label("Cash price", DUST, 9.5),
                    d(money(11999), 26, 400, INK, "-0.02em", 1, italic=True, extra=" margin-top: 4px;"),
                    solid("Add to bag", RUST, "#fbf7f0", 50, fs=12)))

    return page('<div style="display: flex; gap: 48px; padding: 46px;">%s%s</div>'
                % (frame(cover_m, "Cover"), frame(feature_m, "Feature")), width=920, bg=PAPER)


def system():
    sw = "".join('<div style="flex: 1 1 0;">'
                 '<div style="height: 92px; background: %s; border: 1px solid rgba(26,21,16,0.18);"></div>'
                 '<div style="margin-top: 10px; font-family: %s; font-size: 12px; font-weight: 700; letter-spacing: 0.14em; '
                 'text-transform: uppercase; color: %s;">%s</div>'
                 '<div style="margin-top: 3px; font-family: %s; font-size: 11px; color: %s;">%s</div></div>'
                 % (val, BODY, INK, name, BODY, DUST, val)
                 for name, val in [("Sand", SAND), ("Paper", PAPER), ("Card", CARD), ("Ink", INK),
                                   ("Dust", DUST), ("Rust", RUST), ("Atlantic", ATL), ("Ochre", OCHRE)])

    specimen = ('<div style="display: flex; align-items: flex-end; gap: 34px; padding: 10px 0;">'
                '<div style="font-family: %s; font-size: 168px; font-weight: 900; line-height: 0.8; letter-spacing: -0.04em; color: %s;">Aa</div>'
                '<div style="padding-bottom: 14px;">%s%s%s</div></div>'
                % (DISP, INK, b("Bodoni Moda", 22, INK, weight=700),
                   b("400 · 700 · 900 · italic", 14, DUST, top=4),
                   b("Headlines, prices and any number a customer reads as a promise.", 14, DUST, top=10)))

    ramp = "".join('<div style="display: flex; align-items: baseline; gap: 26px; padding: 12px 0; '
                   'border-top: 1px solid rgba(26,21,16,0.13);">'
                   '<span style="width: 210px; flex-shrink: 0; font-family: %s; font-size: 10.5px; font-weight: 700; '
                   'letter-spacing: 0.18em; text-transform: uppercase; color: %s;">%s</span>%s</div>'
                   % (BODY, DUST, spec, sample)
                   for spec, sample in [
                       ("Masthead · 88 · 900", d("JR IMPORTERS", 54, 900, INK, "-0.03em", 1)),
                       ("Headline · 92 · 900", d("Phones that survive", 44, 900, INK, "-0.035em", 1)),
                       ("Section · 34 · 900", d("The Edit", 34, 900, INK, "-0.025em", 1)),
                       ("Price · italic 400", d(money(11999), 30, 400, RUST, "-0.02em", 1, italic=True)),
                       ("Body · Karla 16", b("Salt, sand and a two-hour power cut.", 16, INK)),
                       ("Label · Karla 10.5", label("The coast edition · No. 14"))])

    rules = "".join('<div style="padding: 14px 0; border-top: 1px solid rgba(26,21,16,0.13);">'
                    '<div style="display: flex; align-items: baseline; justify-content: space-between;">'
                    '<span style="font-family: %s; font-size: 13.5px; font-weight: 700; color: %s;">%s</span>'
                    '<span style="font-family: %s; font-size: 15px; color: %s;">%s</span></div></div>'
                    % (BODY, INK, k, DISP, DUST, v)
                    for k, v in [("Page width", "1440 · 56px margin"), ("Column", "no fixed grid — the spread decides"),
                                 ("Rule", "1px, 3px under the masthead"), ("Radius", "none, anywhere"),
                                 ("Plate", "a flat colour field, never a white cut-out"),
                                 ("Leaders", "dotted, price flush right"), ("Hit target", "44px minimum")])

    return page(masthead("THE SHELF") +
                '<section style="padding: 50px 56px 0;">%s%s%s</section>'
                '<section style="padding: 56px 56px 0;">%s<div style="display: flex; gap: 14px; margin-top: 22px;">%s</div></section>'
                '<section style="padding: 56px 56px 0;">%s%s</section>'
                '<section style="padding: 56px 56px 0;">%s<div style="margin-top: 8px;">%s</div></section>'
                '<section style="padding: 56px 56px 0;">%s'
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 56px; margin-top: 22px;">'
                '<div>%s</div><div style="display: flex; flex-direction: column; gap: 14px;">%s%s%s</div></div></section>'
                % (label("Direction 02"),
                   d("Coast", 90, 900, INK, "-0.035em", 0.96, extra=" margin-top: 16px;"),
                   b("A magazine that happens to sell phones. No navigation bar, no card grid, no button that says "
                     "&ldquo;shop now&rdquo;. The page is set like print: a masthead, a spread, an index with dotted "
                     "leaders, and an article where a product page would be.", 17, DUST, 1.75, 640, top=20),
                   d("Palette", 34, 900, INK, "-0.025em", 1), sw,
                   d("Type", 34, 900, INK, "-0.025em", 1), specimen + ramp,
                   d("Plates", 34, 900, INK, "-0.025em", 1),
                   '<div style="display: flex; gap: 20px;">%s%s%s</div>'
                   % (plate(300, 220, "graphite", ATL), plate(300, 220, "olive", RUST), plate(300, 220, "violet", OCHRE)),
                   d("Rules", 34, 900, INK, "-0.025em", 1), rules,
                   solid("Primary action", RUST, "#fbf7f0", 54),
                   solid("Secondary", "transparent", INK, 54),
                   '<div>%s</div>' % link("Tertiary, underlined")) + colophon())


SCREENS = [("cover", "Cover", cover, W, 3450),
           ("index", "The index", index, W, 2600),
           ("feature", "Feature", feature, W, 2700),
           ("order", "Order form", order, W, 2100),
           ("mobile", "Mobile", mobile, 920, 1000),
           ("system", "System", system, W, 2600)]

META = dict(key="c", letter="02", name="Coast",
            strap="A magazine that happens to sell phones",
            fonts=FONTS, bg=SAND, ink=INK, font=BODY,
            why="Nobody remembers a card grid. A masthead, a real edit and an article about the bench give the shop a "
                "voice that a template cannot, and it suits a business whose actual pitch is local knowledge — which "
                "handset survives salt, sand and a power cut.",
            tradeoff="It is slow to shop. An index with dotted leaders is lovely and is not how someone compares four "
                     "phones at 22:00 on a phone screen. It also needs real photography and someone to write the copy "
                     "every season.")
