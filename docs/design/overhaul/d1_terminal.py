# -*- coding: utf-8 -*-
"""01 · STOCK TERMINAL — the shop as the live inventory it actually is.

No hero. No product cards. No photography. The whole storefront is one dense,
sortable table of real units, because the one thing this shop has that a
reseller does not is a till-backed, IMEI-level view of what is on the shelf
right now. Monospace throughout; the grid is the design.
"""
from kit import P, BY, STORE, money, money_plain, svg

BG, SURF, SURF2 = "#08090a", "#0d0f11", "#121518"
LINE, LINE2 = "#1c2126", "#2b333a"
INK, DIM, FAINT = "#e6e4df", "#7d868e", "#525a61"
AMBER, GREEN, RED, CYAN = "#ffb000", "#35d07f", "#ff5f56", "#5ec6d9"
MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
FONTS = ["JetBrains+Mono:wght@400;500;700"]

W = 1520


def t(text, size=12.5, color=INK, weight=400, ls="0.02em", extra=""):
    return ('<span style="font-family: %s; font-size: %spx; font-weight: %s; letter-spacing: %s; color: %s;%s">%s</span>'
            % (MONO, size, weight, ls, color, extra, text))


def cell(inner, w=None, align="left", pad="10px 14px", color=INK, size=12.5, weight=400, extra=""):
    return ('<div style="box-sizing: border-box; %spadding: %s; text-align: %s; font-size: %spx; font-weight: %s; color: %s; '
            'white-space: nowrap; overflow: hidden; text-overflow: ellipsis;%s">%s</div>'
            % (("width: %dpx; flex-shrink: 0; " % w) if w else "flex: 1 1 0; min-width: 240px; ",
               pad, align, size, weight, color, extra, inner))


def bar_meter(n, cap=40, color=GREEN, w=54):
    filled = max(2, int(round(w * min(1.0, float(n) / cap))))
    return ('<span style="display: inline-flex; align-items: center; gap: 7px;">'
            '<span style="display: inline-block; width: %dpx; height: 7px; background: %s;">'
            '<span style="display: block; width: %dpx; height: 100%%; background: %s;"></span></span></span>'
            % (w, LINE2, filled, color))


def spark(vals, h=18, color=CYAN):
    mx = float(max(vals))
    bars = "".join('<span style="display: block; width: 3px; height: %dpx; background: %s; opacity: %s;"></span>'
                   % (max(2, int(h * v / mx)), color, 0.45 + 0.55 * v / mx) for v in vals)
    return ('<span style="display: inline-flex; align-items: flex-end; gap: 2px; height: %dpx;">%s</span>' % (h, bars))


def btn(label, kind="amber", w=None, h=34, fs=12):
    styles = {
        "amber": (AMBER, "#0a0b0c", AMBER),
        "ghost": ("transparent", INK, LINE2),
        "green": (GREEN, "#06120c", GREEN),
        "dim": ("transparent", DIM, LINE),
    }
    bg, fg, bd = styles[kind]
    return ('<a href="#" style="display: %s; align-items: center; justify-content: center; height: %dpx; %s'
            'padding: 0 16px; background: %s; color: %s; border: 1px solid %s; font-family: %s; font-size: %spx; '
            'font-weight: 700; letter-spacing: 0.08em; text-decoration: none; text-transform: uppercase;">%s</a>'
            % ("flex" if w == "full" else "inline-flex", h, "width: 100%; " if w == "full" else "",
               bg, fg, bd, MONO, fs, label))


def check(label, count=None, on=False, color=AMBER):
    box = ('<span style="color: %s;">[%s]</span>' % (color if on else FAINT, "x" if on else " "))
    tail = ('<span style="margin-left: auto; color: %s;">%s</span>' % (FAINT, count)) if count is not None else ""
    return ('<div style="display: flex; align-items: center; gap: 9px; min-height: 30px; font-family: %s; '
            'font-size: 12.5px; color: %s;">%s<span>%s</span>%s</div>'
            % (MONO, INK if on else DIM, box, label, tail))


def panel(title, inner, right=None, pad=0):
    head = ('<div style="display: flex; align-items: center; justify-content: space-between; height: 34px; '
            'padding: 0 14px; background: %s; border-bottom: 1px solid %s;">%s%s</div>'
            % (SURF2, LINE, t(title, 11, DIM, 700, "0.16em"), right or ""))
    return ('<div style="border: 1px solid %s; background: %s;">%s<div style="padding: %dpx;">%s</div></div>'
            % (LINE, SURF, head, pad, inner))


def kv(k, v, color=INK, dotted=True):
    return ('<div style="display: flex; align-items: baseline; gap: 10px; padding: 7px 0; font-family: %s; font-size: 12.5px;">'
            '<span style="color: %s; white-space: nowrap;">%s</span>'
            '<span style="flex-grow: 1; height: 1px; border-bottom: 1px %s %s; transform: translateY(-3px);"></span>'
            '<span style="color: %s; white-space: nowrap;">%s</span></div>'
            % (MONO, DIM, k, "dotted" if dotted else "solid", LINE2, color, v))


# ── chrome ───────────────────────────────────────────────────────────────
def statusline(right_extra=""):
    return ('<div style="display: flex; align-items: center; justify-content: space-between; height: 32px; '
            'padding: 0 18px; background: %s; border-bottom: 1px solid %s;">'
            '<div style="display: flex; align-items: center; gap: 14px;">%s%s</div>'
            '<div style="display: flex; align-items: center; gap: 18px;">%s%s%s</div></div>'
            % (SURF2, LINE,
               t("JR IMPORTERS", 12.5, INK, 700, "0.22em"),
               t("// STOCK TERMINAL", 12.5, AMBER, 500, "0.16em"),
               t("WALVIS BAY", 11.5, DIM, 400, "0.14em"),
               t("21:14 SAST", 11.5, DIM, 400, "0.14em"),
               t("SYNC 12s AGO", 11.5, GREEN, 400, "0.14em") + right_extra))


def navline(active="SHELF"):
    tabs = []
    for i, name in enumerate(["SHELF", "UNIT", "WORKSHOP", "ACCOUNT"], start=1):
        on = name == active
        tabs.append('<a href="#" style="display: inline-flex; align-items: center; gap: 8px; height: 46px; '
                    'padding: 0 18px; text-decoration: none; background: %s; border-right: 1px solid %s; '
                    'border-bottom: 2px solid %s;">%s%s</a>'
                    % (SURF if on else "transparent", LINE, AMBER if on else "transparent",
                       t("F%d" % i, 11, AMBER if on else FAINT, 700, "0.1em"),
                       t(name, 12.5, INK if on else DIM, 700 if on else 400, "0.16em")))
    return ('<div style="display: flex; align-items: stretch; justify-content: space-between; height: 46px; '
            'border-bottom: 1px solid %s;"><div style="display: flex; border-left: 1px solid %s;">%s</div>'
            '<div style="display: flex; align-items: center; gap: 18px; padding: 0 18px;">%s%s%s</div></div>'
            % (LINE, LINE, "".join(tabs),
               t("CART 2 UNITS", 12, DIM, 400, "0.12em"),
               t(money(15497), 12.5, INK, 700),
               btn("CHECKOUT", "amber", h=30, fs=11)))


def commandbar(query="brand:samsung price:<10000 stock:>0"):
    tokens = "".join('<span style="display: inline-flex; align-items: center; height: 24px; padding: 0 9px; '
                     'background: %s; border: 1px solid %s; color: %s; font-family: %s; font-size: 11.5px;">%s'
                     '<span style="margin-left: 8px; color: %s;">x</span></span>'
                     % (SURF2, LINE2, CYAN, MONO, tk, FAINT) for tk in query.split())
    return ('<div style="display: flex; align-items: center; gap: 12px; height: 52px; padding: 0 18px; '
            'border-bottom: 1px solid %s; background: %s;">'
            '%s<div style="display: flex; align-items: center; gap: 8px;">%s</div>'
            '<span style="display: inline-block; width: 9px; height: 17px; background: %s;"></span>'
            '<div style="margin-left: auto; display: flex; align-items: center; gap: 16px;">%s%s</div></div>'
            % (LINE, BG, t(">", 15, AMBER, 700), tokens, AMBER,
               t("SORT: PRICE DESC", 11.5, DIM, 400, "0.12em"), t("78 MATCHES", 11.5, INK, 700, "0.12em")))


def footline():
    return ('<div style="display: flex; align-items: center; justify-content: space-between; height: 38px; '
            'padding: 0 18px; border-top: 1px solid %s; background: %s;">%s%s</div>'
            % (LINE, SURF2,
               t("JR IMPORTERS · %s · %s" % (STORE["address"], STORE["phone"]), 11.5, FAINT, 400, "0.1em"),
               t("PRICES INCL. VAT 15%% · %s" % STORE["hours"], 11.5, FAINT, 400, "0.1em")))


def page(inner, width=W):
    return ('<div style="width: %dpx; background: %s; color: %s; font-family: %s;">%s</div>' % (width, BG, INK, MONO, inner))


SHORT = {"s24u": ("6.8\" 120Hz", "5000"), "a26u": ("6.78\" 120Hz", "5950"), "pa18t": ("6.58\" 120Hz", "9600"),
         "a55": ("6.6\" 120Hz", "5000"), "tab": ("11\" 90Hz", "7040"), "x13": ("6.52\" HD+", "6320"),
         "a15": ("6.5\" 90Hz", "5000"), "n16p": ("6.52\" 90Hz", "4400")}

COLS = [("SKU", 142, "left"), ("MODEL", None, "left"), ("RAM/ROM", 120, "left"), ("BATT", 78, "right"),
        ("SCREEN", 114, "left"), ("PRICE N$", 144, "right"), ("ON SHELF", 130, "left"),
        ("30D", 92, "left"), ("", 110, "right")]


def _spark_vals(pid):
    seed = sum(ord(c) for c in pid)
    return [1 + (seed * (i + 3) * 7 % 9) for i in range(12)]


def table_head():
    return ('<div style="display: flex; align-items: stretch; background: %s; border-bottom: 1px solid %s;">%s</div>'
            % (SURF2, LINE2,
               "".join(cell(t(label, 10.5, DIM, 700, "0.18em"), w, align, "11px 14px") for label, w, align in COLS)))


def table_row(p, i, hot=False):
    scr, batt = SHORT[p["id"]]
    lvl = GREEN if p["stock"] > 15 else (AMBER if p["stock"] > 8 else RED)
    bg = SURF if hot else ("transparent" if i % 2 else "rgba(255,255,255,0.014)")
    return ('<div style="display: flex; align-items: center; background: %s; border-bottom: 1px solid %s; '
            'border-left: 2px solid %s;">%s%s%s%s%s%s%s%s%s</div>'
            % (bg, LINE, AMBER if hot else "transparent",
               cell(t(p["sku"], 12, AMBER if hot else DIM, 500), 142),
               cell('<span style="color: %s; font-weight: 700;">%s</span>'
                    '<span style="color: %s; margin-left: 12px; font-weight: 400;">%s</span>'
                    % (INK, p["name"], FAINT, p["brand"].upper()), None),
               cell(t(p["specs"][2][1].replace(" RAM · ", " / "), 12, DIM), 120),
               cell(t(batt, 12, DIM), 78, "right"),
               cell(t(scr, 12, DIM), 114),
               cell(t(money(p["price"]).replace("N$ ", ""), 13.5, INK, 700), 144, "right"),
               cell('<span style="display: inline-flex; align-items: center; gap: 10px;">'
                    '<span style="color: %s; font-weight: 700; width: 20px; display: inline-block;">%d</span>%s</span>'
                    % (lvl, p["stock"], bar_meter(p["stock"], 40, lvl)), 130),
               cell(spark(_spark_vals(p["id"])), 92),
               cell(btn("ADD", "amber" if hot else "ghost", h=28, fs=11), 110, "right", "6px 12px")))


def rail():
    def group(title, rows):
        return ('<div style="padding: 16px 16px 14px; border-bottom: 1px solid %s;">%s'
                '<div style="margin-top: 8px;">%s</div></div>'
                % (LINE, t(title, 10.5, FAINT, 700, "0.18em"), "".join(rows)))
    return ('<div style="width: 246px; flex-shrink: 0; border-right: 1px solid %s; background: %s;">'
            '<div style="display: flex; align-items: center; justify-content: space-between; height: 34px; '
            'padding: 0 16px; background: %s; border-bottom: 1px solid %s;">%s%s</div>%s%s%s%s%s</div>'
            % (LINE, BG, SURF2, LINE, t("FILTERS", 11, DIM, 700, "0.18em"), t("RESET", 11, AMBER, 400, "0.1em"),
               group("BRAND", [check("samsung", 4, True), check("ulefone", 4)]),
               group("PRICE BAND", [check("< 4 000", 2), check("4 000 - 10 000", 4, True), check("> 10 000", 2)]),
               group("STORAGE", [check("128GB", 5, True), check("256GB", 2), check("512GB", 1)]),
               group("FLAGS", [check("rugged / IP69K", 3), check("thermal cam", 2), check("5G", 3),
                               check("in stock only", None, True)]),
               '<div style="padding: 16px;">%s</div>' % btn("APPLY 3 FILTERS", "ghost", "full", 38)))


def tillfeed():
    lines = [("21:12", "SALE", "JR-SGA15-128", "1", 3499, "POS-2"),
             ("20:58", "SALE", "JRP-UFX13", "1", 4499, "POS-1"),
             ("20:41", "LAYBY", "JR-SGS24U-256", "1", 5299.8, "POS-1"),
             ("20:22", "GRV", "JRP-UFN16P", "12", 33588, "GOODS IN"),
             ("19:55", "SALE", "JR-SGA55-128", "2", 16998, "ONLINE")]
    rows = "".join(
        '<div style="display: flex; align-items: center; gap: 0; border-bottom: 1px solid %s;">%s%s%s%s%s%s</div>'
        % (LINE, cell(t(tm, 11.5, FAINT), 74), cell(t(kind, 11.5, GREEN if kind == "SALE" else (CYAN if kind == "GRV" else AMBER), 700, "0.12em"), 84),
           cell(t(sku, 11.5, DIM), 190), cell(t("x" + qty, 11.5, FAINT), 56),
           cell(t(money(amt), 11.5, INK, 500), 150, "right"), cell(t(src, 11.5, FAINT, 400, "0.1em"), None, "right"))
        for tm, kind, sku, qty, amt, src in lines)
    return panel("TILL FEED // LIVE",
                 rows,
                 right='<span style="display: inline-flex; align-items: center; gap: 8px;">'
                       '<span style="width: 7px; height: 7px; border-radius: 50%%; background: %s;"></span>%s</span>'
                       % (GREEN, t("STREAMING", 10.5, GREEN, 700, "0.16em")))


def summary_strip():
    stats = [("UNITS ON SHELF", "108", INK), ("MODELS LISTED", "78", INK), ("SOLD TODAY", "6", GREEN),
             ("LOW STOCK", "3", AMBER), ("RESERVED NOW", "4", CYAN), ("FLOOR PRICE", money_plain(2799), INK)]
    cells = "".join('<div style="flex: 1 1 0; padding: 16px 18px; border-right: 1px solid %s;">%s'
                    '<div style="margin-top: 7px; font-size: 22px; font-weight: 700; color: %s; letter-spacing: -0.01em;">%s</div></div>'
                    % (LINE, t(label, 10.5, FAINT, 700, "0.18em"), col, val)
                    for label, val, col in stats)
    return '<div style="display: flex; border-bottom: 1px solid %s;">%s</div>' % (LINE, cells)


def shelf():
    rows = "".join(table_row(p, i, hot=(p["id"] == "a26u")) for i, p in enumerate(P))
    pager = ('<div style="display: flex; align-items: center; justify-content: space-between; height: 46px; '
             'padding: 0 14px; border-top: 1px solid %s;">%s<div style="display: flex; gap: 8px;">%s%s%s</div></div>'
             % (LINE, t("SHOWING 1-8 OF 78 MATCHES", 11.5, DIM, 400, "0.12em"),
                btn("PREV", "dim", h=28, fs=11), btn("1 / 10", "ghost", h=28, fs=11), btn("NEXT", "ghost", h=28, fs=11)))
    body = ('<div style="display: flex; align-items: stretch;">%s'
            '<div style="flex-grow: 1; min-width: 0;">%s%s%s<div style="padding: 18px;">%s</div></div></div>'
            % (rail(), table_head(), rows, pager, tillfeed()))
    return page(statusline() + navline("SHELF") + commandbar() + summary_strip() + body + footline())


# ── UNIT ─────────────────────────────────────────────────────────────────
IMEIS = [("35 987654 321098 1", "AVAILABLE", "SHELF A2", "12 AUG"),
         ("35 987654 321098 2", "AVAILABLE", "SHELF A2", "12 AUG"),
         ("35 987654 321098 3", "RESERVED", "ONLINE #2418", "12 AUG"),
         ("35 987654 321098 4", "AVAILABLE", "SHELF A2", "28 AUG"),
         ("35 987654 321098 5", "SOLD", "POS-1 · 21:12", "28 AUG"),
         ("35 987654 321098 6", "AVAILABLE", "SHELF A2", "28 AUG")]

IMEI_TONE = {"AVAILABLE": GREEN, "RESERVED": AMBER, "SOLD": FAINT}


def unit():
    p = BY["s24u"]
    crumb = ('<div style="display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 18px; '
             'border-bottom: 1px solid %s;">%s%s%s%s%s</div>'
             % (LINE, t("SHELF", 11.5, DIM), t("/", 11.5, FAINT), t(p["brand"].upper(), 11.5, DIM),
                t("/", 11.5, FAINT), t(p["sku"], 11.5, AMBER, 700)))

    title = ('<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 40px; '
             'padding: 30px 18px 26px; border-bottom: 1px solid %s;">'
             '<div>%s<div style="margin-top: 12px; font-size: 40px; font-weight: 700; letter-spacing: -0.02em; color: %s;">%s</div>'
             '<div style="margin-top: 12px; max-width: 720px; font-size: 13px; line-height: 1.7; color: %s;">%s</div></div>'
             '<div style="text-align: right;">%s'
             '<div style="margin-top: 8px; font-size: 34px; font-weight: 700; color: %s; letter-spacing: -0.01em;">%s</div>'
             '<div style="margin-top: 6px;">%s</div></div></div>'
             % (LINE, t("UNIT RECORD", 11, FAINT, 700, "0.2em"), INK, p["name"], DIM, p["blurb"],
                t("CASH PRICE INCL. VAT", 10.5, FAINT, 700, "0.18em"), AMBER, money(p["price"]),
                t("COST BASIS HIDDEN · MARGIN VISIBLE IN CONSOLE ONLY", 10.5, FAINT)))

    specs = "".join(kv(k.upper(), v) for k, v in p["specs"])

    imei_rows = "".join(
        '<div style="display: flex; align-items: center; border-bottom: 1px solid %s;">%s%s%s%s</div>'
        % (LINE, cell(t(im, 12, INK if st != "SOLD" else FAINT), 210),
           cell('<span style="display: inline-flex; align-items: center; gap: 7px;">'
                '<span style="width: 7px; height: 7px; background: %s;"></span>%s</span>'
                % (IMEI_TONE[st], t(st, 11.5, IMEI_TONE[st], 700, "0.1em")), 140),
           cell(t(loc, 11.5, DIM), None), cell(t(dt, 11.5, FAINT), 90, "right"))
        for im, st, loc, dt in IMEIS)

    buy = ('<div style="display: flex; flex-direction: column; gap: 12px;">'
           '<div style="display: flex; gap: 10px;">%s%s</div>%s%s'
           '<div style="margin-top: 4px;">%s%s%s</div></div>'
           % ('<div style="display: flex; align-items: center; border: 1px solid %s; height: 44px;">'
              '<span style="display: flex; align-items: center; justify-content: center; width: 42px; height: 100%%; color: %s;">%s</span>'
              '<span style="width: 40px; text-align: center; font-size: 14px; font-weight: 700;">1</span>'
              '<span style="display: flex; align-items: center; justify-content: center; width: 42px; height: 100%%; color: %s;">%s</span></div>'
              % (LINE2, DIM, svg("minus", 14, "currentColor", 2), INK, svg("plus", 14, "currentColor", 2)),
              '<div style="flex-grow: 1;">%s</div>' % btn("ADD TO CART", "amber", "full", 44, 13),
              btn("RESERVE FOR COLLECTION · HOLDS 30 MIN", "ghost", "full", 44, 12),
              btn("START A LAY-BY · %s DEPOSIT" % money(5299.8), "ghost", "full", 44, 12),
              kv("COLLECT", "TODAY · " + STORE["address"], GREEN),
              kv("COURIER", "1-3 DAYS · " + money(150)),
              kv("WARRANTY", "12 MONTHS · IN-HOUSE BENCH")))

    hist_vals = [4, 6, 3, 7, 5, 9, 6, 8, 4, 7, 10, 6, 5, 8, 6, 9, 7, 4, 6, 8]
    hist = "".join('<div style="flex: 1 1 0; display: flex; flex-direction: column; justify-content: flex-end; height: 96px;">'
                   '<div style="height: %d%%; background: %s;"></div></div>'
                   % (int(100 * v / 10.0), CYAN if v < 9 else AMBER) for v in hist_vals)

    left = ('<div style="flex: 1 1 0; min-width: 0; border-right: 1px solid %s;">'
            '<div style="padding: 20px 18px;">%s</div>'
            '<div style="padding: 0 18px 22px;">%s</div></div>'
            % (LINE, panel("SPECIFICATION", specs, pad=14),
               panel("UNIT MOVEMENT // LAST 20 DAYS",
                     '<div style="display: flex; align-items: flex-end; gap: 3px; padding: 4px 0 10px;">%s</div>'
                     '<div style="display: flex; justify-content: space-between; padding-top: 10px; border-top: 1px solid %s;">%s%s%s</div>'
                     % (hist, LINE, t("20 AUG", 10.5, FAINT), t("SOLD 24 · RECEIVED 12 · RETURNED 1", 10.5, DIM),
                        t("TODAY", 10.5, FAINT)), pad=14)))

    right = ('<div style="width: 620px; flex-shrink: 0;">'
             '<div style="padding: 20px 18px;">%s</div>'
             '<div style="padding: 0 18px 22px;">%s</div></div>'
             % (panel("PURCHASE", buy, pad=16),
                panel("IMEI POOL // 11 UNITS", imei_rows,
                      right=t("6 SHOWN", 10.5, FAINT, 700, "0.14em"))))

    related = "".join(table_row(BY[k], i) for i, k in enumerate(["a26u", "a55", "a15"]))

    return page(statusline() + navline("UNIT") + crumb + title +
                '<div style="display: flex; align-items: stretch;">%s%s</div>' % (left, right) +
                '<div style="padding: 0 18px 22px;">%s</div>'
                % panel("OTHER UNITS ON THE SHELF", table_head() + related) + footline())


# ── BUY ──────────────────────────────────────────────────────────────────
def radio(label, detail, price, on=False):
    return ('<div style="display: flex; align-items: center; gap: 14px; padding: 14px 16px; border: 1px solid %s; '
            'background: %s; margin-bottom: 8px;">'
            '<span style="color: %s; font-size: 13px;">(%s)</span>'
            '<div style="flex-grow: 1;"><div style="font-size: 13px; font-weight: 700; color: %s;">%s</div>'
            '<div style="margin-top: 3px; font-size: 11.5px; color: %s;">%s</div></div>%s</div>'
            % (AMBER if on else LINE, SURF if on else "transparent", AMBER if on else FAINT,
               "•" if on else " ", INK if on else DIM, label, FAINT, detail,
               t(price, 12.5, INK if on else DIM, 700)))


def tinput(label, value, w=None):
    return ('<div style="%smargin-bottom: 14px;">%s'
            '<div style="display: flex; align-items: center; height: 44px; margin-top: 7px; padding: 0 14px; '
            'border: 1px solid %s; background: %s; font-size: 13px; color: %s;">%s'
            '<span style="display: inline-block; width: 8px; height: 15px; background: %s; margin-left: 3px;"></span></div></div>'
            % (("width: %dpx; " % w) if w else "", t(label, 10.5, FAINT, 700, "0.18em"),
               LINE2, SURF, INK, value, "transparent"))


def buy():
    receipt_rows = "".join(kv(nm, money(amt), INK) for nm, amt in
                           [("GALAXY A55 5G 128GB  x1", 8499), ("GALAXY A15 4G 128GB  x2", 6998),
                            ("COURIER · NATIONWIDE", 150)])
    receipt = ('%s<div style="margin: 10px 0; border-top: 1px dashed %s;"></div>'
               '%s%s<div style="margin: 10px 0; border-top: 1px dashed %s;"></div>'
               '<div style="display: flex; align-items: baseline; justify-content: space-between; padding: 6px 0;">%s%s</div>'
               '<div style="margin-top: 16px; padding: 12px 14px; border: 1px solid %s; background: rgba(255,176,0,0.07);">'
               '<div style="display: flex; align-items: center; justify-content: space-between;">%s%s</div>'
               '<div style="margin-top: 8px; font-size: 11.5px; line-height: 1.6; color: %s;">'
               'Three units are held against your name. IMEIs are written to the invoice the moment payment clears.</div></div>'
               '<div style="margin-top: 14px;">%s</div>'
               % (receipt_rows, LINE2,
                  kv("SUBTOTAL", money(15497), DIM), kv("VAT 15% INCLUDED", money(2040.91), DIM), LINE2,
                  t("TOTAL DUE", 14, INK, 700, "0.14em"), t(money(15647), 20, AMBER, 700),
                  AMBER, t("STOCK RESERVATION", 10.5, AMBER, 700, "0.18em"), t("28:14", 15, AMBER, 700),
                  DIM, btn("CONFIRM ORDER", "amber", "full", 50, 13)))

    left = ('<div style="flex: 1 1 0; min-width: 0; padding: 22px 18px; border-right: 1px solid %s;">'
            '%s<div style="display: flex; gap: 14px;">%s%s</div>%s%s'
            '<div style="margin-top: 26px;">%s</div>%s%s%s'
            '<div style="margin-top: 26px;">%s</div>%s%s%s%s</div>'
            % (LINE,
               '<div style="margin-bottom: 18px;">%s</div>' % t("01 // CUSTOMER", 12, AMBER, 700, "0.2em"),
               tinput("FULL NAME", "Johanna Amutenya", 380), tinput("MOBILE", "+264 81 234 5678", 300),
               tinput("EMAIL", "johanna@example.na", 380),
               tinput("DELIVERY ADDRESS", "12 Nathaniel Maxuilili Street, Swakopmund"),
               t("02 // FULFILMENT", 12, AMBER, 700, "0.2em"),
               '<div style="margin-top: 14px;"></div>',
               radio("COLLECT AT " + STORE["address"].upper(), "READY WITHIN THE HOUR · " + STORE["hours"].upper(), "FREE"),
               radio("COURIER · NATIONWIDE", "1-3 WORKING DAYS · ALL 14 REGIONS", money(150), True),
               t("03 // PAYMENT", 12, AMBER, 700, "0.2em"),
               '<div style="margin-top: 14px;"></div>',
               radio("CARD ONLINE (DPO)", "VISA / MASTERCARD · 3D SECURE", "NOW", True),
               radio("EFT / BANK TRANSFER", "SHIPS ONCE PAYMENT REFLECTS", "1-2 DAYS"),
               radio("LAY-BY", "20% DEPOSIT · BALANCE OVER 6 MONTHS", money(3129.4))))

    right = ('<div style="width: 520px; flex-shrink: 0; padding: 22px 18px;">%s</div>'
             % panel("ORDER // JR-2419", receipt, right=t("3 UNITS", 10.5, FAINT, 700, "0.14em"), pad=16))

    steps = ('<div style="display: flex; align-items: center; gap: 0; height: 44px; border-bottom: 1px solid %s;">%s</div>'
             % (LINE, "".join(
                 '<div style="display: flex; align-items: center; gap: 10px; height: 100%%; padding: 0 20px; '
                 'border-right: 1px solid %s; background: %s;">%s%s</div>'
                 % (LINE, SURF if st == "NOW" else "transparent",
                    t("[%s]" % ("x" if st == "DONE" else (">" if st == "NOW" else " ")), 12,
                      GREEN if st == "DONE" else (AMBER if st == "NOW" else FAINT), 700),
                    t(nm, 11.5, INK if st != "NEXT" else FAINT, 700, "0.16em"))
                 for nm, st in [("CART", "DONE"), ("DETAILS", "NOW"), ("PAYMENT", "NEXT"), ("DONE", "NEXT")])))

    return page(statusline() + navline("SHELF") + steps +
                '<div style="display: flex; align-items: stretch;">%s%s</div>' % (left, right) + footline())


# ── WORKSHOP ─────────────────────────────────────────────────────────────
JOBS = [("JC-1184", "Galaxy A15", "Cracked screen, touch top half", "P. Shikongo", "TUE 09:14", "IN REPAIR", AMBER, "BENCH 2"),
        ("JC-1183", "Armor X13", "Charging port not seating", "T. Nangolo", "TUE 08:40", "AWAITING QUOTE", CYAN, "-"),
        ("JC-1181", "Galaxy A55", "Battery drains overnight", "M. Haufiku", "MON 15:22", "READY", GREEN, "COUNTER"),
        ("JC-1179", "Note 16 Pro", "No signal after water", "E. Amadhila", "MON 11:05", "QUOTE DECLINED", RED, "-"),
        ("JC-1176", "Galaxy S24 Ultra", "Screen replacement", "L. Kandjii", "FRI 14:48", "COLLECTED", FAINT, "-")]

CHECKS = ["LCD", "TOUCH", "RINGER", "VOLUME", "POWER", "CHARGE", "EAR SPK", "MIC", "CAMERAS", "SIGNED"]
CHECKED = {"LCD", "TOUCH", "CHARGE", "SIGNED"}


def workshop():
    head = ('<div style="display: flex; background: %s; border-bottom: 1px solid %s;">%s%s%s%s%s%s%s</div>'
            % (SURF2, LINE2,
               cell(t("JOB", 10.5, DIM, 700, "0.18em"), 108), cell(t("DEVICE", 10.5, DIM, 700, "0.18em"), 190),
               cell(t("FAULT AS REPORTED", 10.5, DIM, 700, "0.18em"), None),
               cell(t("OWNER", 10.5, DIM, 700, "0.18em"), 150), cell(t("BOOKED IN", 10.5, DIM, 700, "0.18em"), 120),
               cell(t("STATUS", 10.5, DIM, 700, "0.18em"), 190), cell(t("BENCH", 10.5, DIM, 700, "0.18em"), 110, "right")))
    rows = "".join(
        '<div style="display: flex; align-items: center; border-bottom: 1px solid %s; border-left: 2px solid %s; background: %s;">%s%s%s%s%s%s%s</div>'
        % (LINE, AMBER if i == 0 else "transparent", SURF if i == 0 else "transparent",
           cell(t(jc, 12, AMBER if i == 0 else DIM, 700), 108),
           cell(t(dev, 12.5, INK, 700), 190), cell(t(fault, 12, DIM), None),
           cell(t(owner, 12, DIM), 150), cell(t(when, 11.5, FAINT), 120),
           cell('<span style="display: inline-flex; align-items: center; gap: 7px;">'
                '<span style="width: 7px; height: 7px; background: %s;"></span>%s</span>'
                % (tone, t(st, 11.5, tone, 700, "0.1em")), 190),
           cell(t(bench, 11.5, FAINT), 110, "right"))
        for i, (jc, dev, fault, owner, when, st, tone, bench) in enumerate(JOBS))

    checks = "".join('<div style="display: flex; align-items: center; gap: 9px; padding: 7px 0; font-size: 12px; color: %s;">'
                     '<span style="color: %s;">[%s]</span>%s</div>'
                     % (INK if c in CHECKED else DIM, GREEN if c in CHECKED else FAINT,
                        "x" if c in CHECKED else " ", c)
                     for c in CHECKS)

    card = panel("JOB CARD JC-1184 // OPEN",
                 '%s%s%s<div style="margin: 16px 0 6px;">%s</div>'
                 '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 24px;">%s</div>'
                 '<div style="margin-top: 18px; padding-top: 14px; border-top: 1px dashed %s;">%s%s%s</div>'
                 '<div style="display: flex; gap: 8px; margin-top: 16px;">%s%s</div>'
                 % (kv("DEVICE", "SAMSUNG GALAXY A15 4G 128GB"),
                    kv("IMEI", "35 987654 321098 7"),
                    kv("OWNER", "P. SHIKONGO · +264 85 998 1122"),
                    t("BENCH CHECKLIST // AS HANDED IN", 10.5, FAINT, 700, "0.18em"), checks, LINE2,
                    kv("QUOTED", money(1450), AMBER), kv("APPROVED", "TUE 14:02 · BY SMS", GREEN),
                    kv("HANDLING FEE", money(200) + " NON-REFUNDABLE", DIM),
                    btn("MARK READY", "green", h=38, fs=12), btn("PRINT CARD", "ghost", h=38, fs=12)),
                 right=t("IN REPAIR", 10.5, AMBER, 700, "0.16em"), pad=16)

    terms = panel("PRINTED TERMS // VERBATIM",
                  "".join('<div style="display: flex; gap: 10px; padding: 7px 0; font-size: 11.5px; line-height: 1.6; color: %s;">'
                          '<span style="color: %s;">%02d</span><span>%s</span></div>' % (DIM, FAINT, i + 1, tx)
                          for i, tx in enumerate([
                              "A minimum handling fee of N$200 is payable / NON REFUNDABLE.",
                              "Repairs over N$350 are confirmed with the customer before work is carried out.",
                              "Parts replaced carry a 30 day warranty. KEEP INVOICE. No warranty on software.",
                              "No warranty on any liquid or physical damage repairs.",
                              "All repairs must be collected within 90 days, or the phone will be sold to defray costs.",
                              "No phone will be collected without a job card present.",
                              "Sim / Memory Cards handed in will be for the risk of the owner."])),
                  pad=14)

    stats = ('<div style="display: flex; border-bottom: 1px solid %s;">%s</div>'
             % (LINE, "".join('<div style="flex: 1 1 0; padding: 16px 18px; border-right: 1px solid %s;">%s'
                              '<div style="margin-top: 7px; font-size: 22px; font-weight: 700; color: %s;">%s</div></div>'
                              % (LINE, t(l, 10.5, FAINT, 700, "0.18em"), c, v)
                              for l, v, c in [("OPEN JOBS", "9", INK), ("ON THE BENCH", "3", AMBER),
                                              ("AWAITING APPROVAL", "2", CYAN), ("READY TO COLLECT", "1", GREEN),
                                              ("OVER 90 DAYS", "0", FAINT), ("AVG TURNAROUND", "2.4 DAYS", INK)])))

    book = panel("BOOK A REPAIR",
                 '%s%s%s%s<div style="margin-top: 6px;">%s</div>'
                 '<div style="margin-top: 10px; font-size: 11.5px; color: %s;">A technician must see the handset before '
                 'it can be priced. Anything over %s is confirmed with you first.</div>'
                 % (tinput("YOUR NAME", "Petrus Shikongo"), tinput("MOBILE", "+264 85 998 1122"),
                    tinput("HANDSET", "Samsung Galaxy A15"), tinput("FAULT", "Screen cracked after a drop"),
                    btn("BOOK IT IN", "amber", "full", 44, 13), DIM, money(350)), pad=16)

    return page(statusline() + navline("WORKSHOP") + stats +
                '<div style="display: flex; align-items: stretch;">'
                '<div style="flex: 1 1 0; min-width: 0; border-right: 1px solid %s;">%s</div>'
                '<div style="width: 560px; flex-shrink: 0; padding: 18px;">%s<div style="margin-top: 18px;">%s</div></div></div>'
                % (LINE,
                   '<div style="padding: 18px;">%s</div><div style="padding: 0 18px 18px;">%s</div>'
                   % (panel("JOB QUEUE", head + rows, right=t("9 OPEN", 10.5, FAINT, 700, "0.14em")), terms),
                   card, book) + footline())


# ── MOBILE ───────────────────────────────────────────────────────────────
def _m_row(p):
    scr, batt = SHORT[p["id"]]
    lvl = GREEN if p["stock"] > 15 else (AMBER if p["stock"] > 8 else RED)
    return ('<div style="padding: 12px 14px; border-bottom: 1px solid %s;">'
            '<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 10px;">'
            '<span style="font-size: 13px; font-weight: 700; color: %s;">%s</span>'
            '<span style="font-size: 13.5px; font-weight: 700; color: %s; white-space: nowrap;">%s</span></div>'
            '<div style="display: flex; align-items: center; justify-content: space-between; margin-top: 7px;">'
            '<span style="font-size: 11px; color: %s;">%s · %s · %s</span>'
            '<span style="display: inline-flex; align-items: center; gap: 7px;">'
            '<span style="font-size: 11px; font-weight: 700; color: %s;">%d</span>%s</span></div></div>'
            % (LINE, INK, p["name"], AMBER, money(p["price"]).replace("N$ ", ""),
               FAINT, p["sku"], p["specs"][2][1].replace(" RAM · ", "/"), batt, lvl, p["stock"],
               bar_meter(p["stock"], 40, lvl, 40)))


def mobile():
    frame_inner = (
        '<div style="display: flex; align-items: center; justify-content: space-between; height: 42px; padding: 0 14px; '
        'background: %s; border-bottom: 1px solid %s;">%s%s</div>'
        '<div style="display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 14px; border-bottom: 1px solid %s;">'
        '%s<span style="font-size: 12px; color: %s;">brand:samsung</span>'
        '<span style="display: inline-block; width: 8px; height: 15px; background: %s;"></span>'
        '<span style="margin-left: auto; font-size: 11px; color: %s;">78</span></div>'
        '<div style="display: flex; border-bottom: 1px solid %s;">%s%s%s</div>'
        '%s'
        '<div style="position: absolute; left: 0; right: 0; bottom: 0; display: flex; height: 62px; border-top: 1px solid %s; background: %s;">%s</div>'
        % (SURF2, LINE, t("JR // TERMINAL", 12, INK, 700, "0.16em"), t("108 UNITS", 11, GREEN, 700, "0.1em"),
           LINE, t(">", 14, AMBER, 700), CYAN, AMBER, FAINT, LINE,
           '<div style="flex: 1 1 0; padding: 12px 14px; border-right: 1px solid %s;">%s'
           '<div style="margin-top: 5px; font-size: 18px; font-weight: 700; color: %s;">108</div></div>'
           % (LINE, t("ON SHELF", 9.5, FAINT, 700, "0.16em"), INK),
           '<div style="flex: 1 1 0; padding: 12px 14px; border-right: 1px solid %s;">%s'
           '<div style="margin-top: 5px; font-size: 18px; font-weight: 700; color: %s;">6</div></div>'
           % (LINE, t("SOLD TODAY", 9.5, FAINT, 700, "0.16em"), GREEN),
           '<div style="flex: 1 1 0; padding: 12px 14px;">%s'
           '<div style="margin-top: 5px; font-size: 18px; font-weight: 700; color: %s;">%s</div></div>'
           % (t("FROM", 9.5, FAINT, 700, "0.16em"), INK, "2 799"),
           "".join(_m_row(p) for p in P[:6]),
           LINE, SURF2,
           "".join('<div style="flex: 1 1 0; display: flex; flex-direction: column; align-items: center; '
                   'justify-content: center; gap: 5px; color: %s;">%s<span style="font-size: 9.5px; font-weight: 700; '
                   'letter-spacing: 0.12em;">%s</span></div>'
                   % (AMBER if on else FAINT, svg(ic, 17, "currentColor", 1.9), lbl)
                   for ic, lbl, on in [("list", "SHELF", True), ("search", "QUERY", False),
                                       ("wrench", "WORKSHOP", False), ("bag", "CART", False)])))

    unit_inner = (
        '<div style="display: flex; align-items: center; justify-content: space-between; height: 42px; padding: 0 14px; '
        'background: %s; border-bottom: 1px solid %s;">%s%s</div>'
        '<div style="padding: 16px 14px; border-bottom: 1px solid %s;">%s'
        '<div style="margin-top: 8px; font-size: 20px; font-weight: 700; color: %s; line-height: 1.2;">%s</div>'
        '<div style="margin-top: 12px; font-size: 24px; font-weight: 700; color: %s;">%s</div>'
        '<div style="margin-top: 8px;">%s</div></div>'
        '<div style="padding: 12px 14px;">%s</div>'
        '<div style="padding: 0 14px;">%s</div>'
        '<div style="position: absolute; left: 0; right: 0; bottom: 0; padding: 12px 14px 16px; background: %s; border-top: 1px solid %s;">%s</div>'
        % (SURF2, LINE, t("< SHELF", 12, DIM, 700, "0.14em"), t("JRP-UF26U", 11, AMBER, 700, "0.1em"),
           LINE, t("ULEFONE // RUGGED", 10.5, FAINT, 700, "0.2em"), INK, "Armor 26 Ultra", AMBER, money(11999),
           '<span style="display: inline-flex; align-items: center; gap: 8px;">'
           '<span style="font-size: 11.5px; font-weight: 700; color: %s;">12 ON SHELF</span>%s</span>'
           % (GREEN, bar_meter(12, 40, GREEN, 60)),
           "".join(kv(k.upper(), v) for k, v in BY["a26u"]["specs"][:5]),
           panel("IMEI POOL", "".join(
               '<div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; '
               'border-bottom: 1px solid %s;"><span style="font-size: 11px; color: %s;">%s</span>'
               '<span style="font-size: 10.5px; font-weight: 700; color: %s;">%s</span></div>'
               % (LINE, DIM, im, IMEI_TONE[st], st) for im, st, _l, _d in IMEIS[:3])),
           SURF2, LINE, btn("ADD TO CART · " + money(11999), "amber", "full", 48, 13)))

    def frame(inner, label):
        return ('<div><div style="margin-bottom: 12px;">%s</div>'
                '<div style="position: relative; width: 390px; height: 844px; overflow: hidden; background: %s; '
                'border: 1px solid %s;">%s</div></div>'
                % (t(label, 11, DIM, 700, "0.2em"), BG, LINE2, inner))

    return page('<div style="display: flex; gap: 44px; padding: 44px;">%s%s</div>'
                % (frame(frame_inner, "SHELF"), frame(unit_inner, "UNIT")), width=912)


# ── SYSTEM ───────────────────────────────────────────────────────────────
def system():
    sw = "".join('<div style="flex: 1 1 0;"><div style="height: 64px; background: %s; border: 1px solid %s;"></div>'
                 '<div style="margin-top: 8px; font-size: 11px; font-weight: 700; color: %s; letter-spacing: 0.1em;">%s</div>'
                 '<div style="margin-top: 3px; font-size: 10.5px; color: %s;">%s</div></div>'
                 % (val, LINE2, INK, name, FAINT, val)
                 for name, val in [("GROUND", BG), ("SURFACE", SURF), ("RAISED", SURF2), ("LINE", LINE2),
                                   ("INK", INK), ("DIM", DIM), ("AMBER", AMBER), ("GREEN", GREEN),
                                   ("RED", RED), ("CYAN", CYAN)])

    ramp = "".join('<div style="display: flex; align-items: baseline; gap: 22px; padding: 9px 0; border-top: 1px solid %s;">'
                   '<span style="width: 190px; flex-shrink: 0; font-size: 10.5px; color: %s; letter-spacing: 0.14em;">%s</span>'
                   '<span style="font-size: %spx; font-weight: %s; color: %s; letter-spacing: %s;">%s</span></div>'
                   % (LINE, FAINT, spec, size, weight, color, ls, sample)
                   for spec, size, weight, color, ls, sample in [
                       ("DISPLAY / 40 / 700", 40, 700, INK, "-0.02em", "Galaxy S24 Ultra"),
                       ("FIGURE / 22 / 700", 22, 700, AMBER, "-0.01em", money(26499)),
                       ("ROW / 12.5 / 700", 12.5, 700, INK, "0.02em", "Armor 26 Ultra"),
                       ("ROW / 12.5 / 400", 12.5, 400, DIM, "0.02em", "12GB / 512GB · 5950mAh · IP69K"),
                       ("LABEL / 10.5 / 700", 10.5, 700, FAINT, "0.18em", "UNITS ON SHELF"),
                       ("STATE / 11.5 / 700", 11.5, 700, GREEN, "0.1em", "AVAILABLE")])

    states = "".join(
        '<div style="display: flex; align-items: center; border-bottom: 1px solid %s; border-left: 2px solid %s; background: %s;">%s%s%s</div>'
        % (LINE, bd, bg, cell(t(label, 11.5, DIM, 700, "0.14em"), 210),
           cell(t("JR-SGA55-128", 12, DIM), 180), cell(t(desc, 11.5, FAINT), None))
        for label, bd, bg, desc in [
            ("DEFAULT", "transparent", "transparent", "1px rule below, no fill"),
            ("ZEBRA", "transparent", "rgba(255,255,255,0.014)", "every second row, 1.4% white"),
            ("HOVER / FOCUS", AMBER, SURF, "amber 2px marker, surface fill"),
            ("LOW STOCK", RED, "transparent", "count and meter turn red under 8"),
            ("SOLD OUT", "transparent", "transparent", "row dims to 45%, action disabled")])

    def blk(title, inner, note=None):
        return ('<section style="padding: 30px 0; border-top: 1px solid %s;">'
                '<div style="display: flex; gap: 40px;"><div style="width: 230px; flex-shrink: 0;">%s%s</div>'
                '<div style="flex: 1 1 0; min-width: 0;">%s</div></div></section>'
                % (LINE, t(title, 13, INK, 700, "0.18em"),
                   ('<div style="margin-top: 9px; font-size: 11.5px; line-height: 1.65; color: %s;">%s</div>' % (FAINT, note)) if note else "",
                   inner))

    head = ('<div style="padding: 44px 0 26px;">%s'
            '<div style="margin-top: 14px; font-size: 44px; font-weight: 700; letter-spacing: -0.02em; color: %s;">STOCK TERMINAL</div>'
            '<div style="margin-top: 14px; max-width: 700px; font-size: 13px; line-height: 1.75; color: %s;">'
            'One typeface, one grid, no photography. Everything is a row in a table because everything in this shop '
            'is a unit with an IMEI. Colour is reserved for state — amber is the cursor and the action, green is '
            'available, red is running out.</div></div>'
            % (t("DIRECTION 01", 11.5, AMBER, 700, "0.24em"), INK, DIM))

    return page(statusline() + navline("ACCOUNT") +
                '<div style="padding: 0 18px 40px;">%s%s%s%s%s%s%s</div>'
                % (head,
                   blk("PALETTE", '<div style="display: flex; gap: 10px;">%s</div>' % sw,
                       "Ten values. Nothing else gets used."),
                   blk("TYPE", ramp, "JetBrains Mono at every size. Figures align in columns because they must."),
                   blk("ROW STATES", states, "The row is the component. Everything else is chrome."),
                   blk("CONTROLS",
                       '<div style="display: flex; flex-wrap: wrap; gap: 10px;">%s%s%s%s</div>'
                       '<div style="display: flex; gap: 10px; margin-top: 14px;">%s%s%s</div>'
                       '<div style="display: flex; gap: 14px; margin-top: 18px; max-width: 640px;">%s%s</div>'
                       % (btn("PRIMARY ACTION", "amber", h=40), btn("SECONDARY", "ghost", h=40),
                          btn("CONFIRM", "green", h=40), btn("DISABLED", "dim", h=40),
                          btn("ADD", "amber", h=28, fs=11), btn("ADD", "ghost", h=28, fs=11),
                          btn("RESERVE", "ghost", h=28, fs=11),
                          tinput("FIELD LABEL", "value"), tinput("EMPTY", "")),
                       "44px hit targets on anything a customer taps; 28px inside a table row."),
                   blk("METERS", '<div style="display: flex; align-items: center; gap: 40px;">%s%s%s%s</div>'
                       % ('<span style="display: inline-flex; align-items: center; gap: 10px;">'
                          '<span style="font-size: 12px; font-weight: 700; color: %s;">40</span>%s</span>' % (GREEN, bar_meter(40, 40, GREEN)),
                          '<span style="display: inline-flex; align-items: center; gap: 10px;">'
                          '<span style="font-size: 12px; font-weight: 700; color: %s;">12</span>%s</span>' % (AMBER, bar_meter(12, 40, AMBER)),
                          '<span style="display: inline-flex; align-items: center; gap: 10px;">'
                          '<span style="font-size: 12px; font-weight: 700; color: %s;">3</span>%s</span>' % (RED, bar_meter(3, 40, RED)),
                          spark([3, 6, 4, 8, 5, 9, 6, 7, 4, 8, 6, 5])),
                       "Stock bar caps at 40 units. The sparkline is 30 days of till sales."),
                   blk("GRID", "".join(kv(k, v) for k, v in [
                       ("PAGE WIDTH", "1520 · full-bleed, no container"),
                       ("RAIL", "246 fixed"), ("ROW HEIGHT", "43"), ("RULE", "1px %s" % LINE),
                       ("GUTTER", "18"), ("RADIUS", "0 everywhere"),
                       ("TYPEFACE", "JetBrains Mono 400 / 500 / 700")]))) + footline())


SCREENS = [("shelf", "Shelf", shelf, W, 1180),
           ("unit", "Unit record", unit, W, 1720),
           ("buy", "Buy", buy, W, 1180),
           ("workshop", "Workshop", workshop, W, 1180),
           ("mobile", "Mobile", mobile, 912, 1000),
           ("system", "System", system, W, 1900)]

META = dict(key="t", letter="01", name="Stock Terminal",
            strap="The shop as the live inventory it actually is",
            fonts=FONTS, bg=BG, ink=INK, font=MONO,
            why="No shop in Namibia can say what this one can: every unit is on the till, with an IMEI, right now. "
                "So the storefront is the stock list — sortable, filterable, honest about counts, with the till feed "
                "running live underneath. It is faster to buy from than any card grid.",
            tradeoff="It asks the customer to read a table. Non-technical buyers and anyone shopping on feel will "
                     "bounce; there is no browsing pleasure and no photography to sell an upgrade.")
