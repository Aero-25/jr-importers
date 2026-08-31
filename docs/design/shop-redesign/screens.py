# -*- coding: utf-8 -*-
"""Every screen of the shop, written once and rendered by all three systems."""
from catalog import (P, BY, STORE, BRANDS, BANDS, STORAGE, JOB_CHECKS, ORDER_ROWS,
                     money, money_plain)
from system import icon

PAD = {"a": 40, "b": 56, "c": 32}


def pad(ds):
    return PAD[ds.key]


def wrap(ds, inner, top=0):
    return '<div style="padding: %dpx %dpx 0;">%s</div>' % (top, pad(ds), inner)


# ── hero, per direction ──────────────────────────────────────────────────
def hero(ds):
    if ds.key == "a":
        stats = "".join(
            '<div style="background: %s; padding: 18px %dpx 18px %s;">'
            '<div style="font-family: %s; font-size: 25px; font-weight: 600; letter-spacing: -0.02em;">%s</div>'
            '<div style="margin-top: 4px; font-size: 13px; color: %s;">%s</div></div>'
            % (ds.bg, 20, "0" if i == 0 else "20px", ds.f_num, v, ds.muted, l)
            for i, (v, l) in enumerate([("108", "handsets on the shelf right now"),
                                        ("N$ 2 799,00", "cheapest handset in stock"),
                                        ("30 min", "stock held while you check out")]))
        left = (
            '<div style="display: inline-flex; flex-direction: column; gap: 7px;">%s'
            '<span style="height: 6px; background: %s;"></span></div>%s%s'
            '<div style="display: flex; gap: 12px; margin-top: 34px;">%s%s</div>'
            '<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; margin-top: 48px; '
            'background: %s; border-top: 1px solid %s; border-bottom: 1px solid %s;">%s</div>'
            % (ds.eyebrow("Stock list · updated today"), ds.accent,
               ds.disp("Import prices,<br>on a shelf you<br>can walk up to.", 78, "h1", " margin-top: 26px;"),
               ds.body("This shop runs on the same stock system as our till. Every Samsung and Ulefone handset listed "
                       "is sealed, checked against its IMEI, warrantied, and physically at %s — delivered anywhere in "
                       "%s, or collected the same day." % (STORE["address"], STORE["country"]),
                       17, ds.muted, 520, top=28),
               ds.btn("Browse the shelf", "primary", 54, arrow=True, fs=16),
               ds.btn("Book a repair", "secondary", 54, fs=16),
               ds.line, ds.line, ds.line, stats))
        p = BY["s24u"]
        right = (
            '<div style="background: %s; border: 1px solid %s;">'
            '<div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; '
            'border-bottom: 1px solid %s; font-family: %s; font-size: 11px; letter-spacing: 0.12em; '
            'text-transform: uppercase; color: %s;"><span>%s</span>%s</div>'
            '<div style="display: flex; align-items: center; justify-content: center; padding: 34px 0 28px; background: %s;">%s</div>'
            '<div style="padding: 22px 22px 24px; border-top: 1px solid %s;">%s'
            '<div style="margin-top: 6px; font-family: %s; font-weight: 600; font-size: 24px; letter-spacing: -0.02em;">%s</div>'
            '<div style="margin-top: 16px;">%s</div>'
            '<div style="display: flex; align-items: flex-end; justify-content: space-between; margin-top: 22px; '
            'padding-top: 18px; border-top: 1px solid %s;"><div>%s%s</div>%s</div></div></div>'
            % (ds.panel, ds.line, ds.line, ds.f_num, ds.muted, p["sku"], ds.stock(p["stock"]),
               ds.media_bg, ds.device(150, 288, p["tone"]), ds.line, ds.eyebrow(p["brand"]),
               ds.f_display, p["name"], ds.spec_table(p["specs"][:4], "96px minmax(0, 1fr)", 12.5), ds.ink,
               ds.eyebrow("Cash price"), ds.price(money(p["price"]), 30, extra_top=4),
               ds.btn("Add to cart", "buy", 48, fs=15)))
        return ('<div style="display: grid; grid-template-columns: minmax(0, 1fr) 520px; gap: 64px; '
                'align-items: start; padding: 72px %dpx 60px;"><div>%s</div>%s</div>' % (pad(ds), left, right))

    if ds.key == "b":
        p = BY["s24u"]
        left = (
            '%s%s%s<div style="display: flex; gap: 14px; margin-top: 40px;">%s%s</div>'
            '<div style="display: flex; gap: 40px; margin-top: 56px; padding-top: 26px; border-top: 1px solid %s;">%s%s%s</div>'
            % (ds.eyebrow("Samsung · Ulefone · imported direct", ds.accent),
               ds.disp("Sealed, tested,<br>and standing<br>on our shelf.", 86, "h1", " margin-top: 26px;"),
               ds.body("No grey imports, no drop-shipping. Every handset is in the building at %s, checked against "
                       "its IMEI, and warrantied by the same people who repair it." % STORE["address"],
                       17.5, ds.muted, 470, top=30, lh=1.7),
               ds.btn("Browse the shelf", "primary", 56, arrow=True, fs=16),
               ds.btn("Book a repair", "secondary", 56, fs=16), ds.line,
               ds.stat("108", "handsets in stock"), ds.stat("14", "regions couriered"),
               ds.stat("In-house", "screen &amp; battery workshop")))
        right = (
            '<div style="position: relative; display: flex; align-items: center; justify-content: center; height: 620px;">'
            '<div style="position: absolute; width: 400px; height: 400px; border-radius: 50%%; '
            'background: radial-gradient(circle, rgba(163,230,53,0.22), rgba(10,11,13,0) 68%%);"></div>'
            '<div style="position: relative;">%s</div>'
            '<div style="position: absolute; right: 6px; bottom: 74px; padding: 16px 20px; border-radius: 18px; '
            'background: rgba(18, 20, 24, 0.86); border: 1px solid rgba(242,241,238,0.12);">%s'
            '<div style="margin-top: 7px; font-family: %s; font-weight: 700; font-size: 17px;">%s</div>'
            '<div style="margin-top: 5px; font-size: 21px; font-weight: 700;">%s</div></div></div>'
            % (ds.device(268, 546, p["tone"], border=" box-shadow: 0 60px 90px -40px rgba(0,0,0,0.9), 0 0 0 1px rgba(242,241,238,0.08);"),
               ds.eyebrow("Flagship", ds.accent), ds.f_display, p["short"], money(p["price"])))
        return ('%s%s<div style="position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 560px; '
                'align-items: center; gap: 40px; padding: 96px %dpx 80px;"><div>%s</div>%s</div>'
                % (ds.glow(780, -280, 1100), ds.glow(-300, 120, 900, "rgba(120,160,210,0.10)"), pad(ds), left, right))

    p = BY["s24u"]
    left = (
        '<div style="display: inline-flex; align-items: center; height: 36px; padding: 0 14px; background: %s; '
        'color: %s; font-size: 12px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase;">'
        'Samsung &amp; Ulefone · %s</div>%s%s'
        '<div style="display: flex; gap: 14px; margin-top: 34px;">%s%s</div>'
        % (ds.ink, ds.inv_ink, STORE["city"],
           ds.disp("PHONES AT<br>IMPORT<br>PRICES.", 92, "h1", " margin-top: 24px; line-height: 0.9;"),
           ds.body("We import the handsets ourselves and sell them off our own shelf at %s — sealed, IMEI-checked, "
                   "warrantied. Collect today or we courier it to you." % STORE["address"],
                   17, ds.ink, 480, top=26, lh=1.6),
           ds.btn("SHOP ALL PHONES", "primary", 58, arrow=True, fs=16.5),
           ds.btn("BOOK A REPAIR", "secondary", 58, fs=16.5)))
    right = (
        '<div style="position: relative; display: flex; align-items: center; justify-content: center; height: 470px;">%s'
        '<div style="position: absolute; top: 14px; right: -4px; transform: rotate(7deg); padding: 14px 18px; '
        'background: %s; border: 3px solid %s; box-shadow: 6px 6px 0 %s; text-align: center;">'
        '<div style="font-size: 11.5px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;">Handsets from</div>'
        '<div style="margin-top: 4px; font-family: %s; font-size: 30px; letter-spacing: -0.03em;">N$ 2 799</div></div>'
        '<div style="position: absolute; bottom: 22px; left: -8px; transform: rotate(-5deg); padding: 11px 16px; '
        'background: %s; color: %s; font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;">'
        '108 in stock today</div></div>'
        % (ds.device(214, 424, p["tone"], border=" border: 3px solid %s;" % ds.ink),
           ds.panel, ds.ink, ds.ink, ds.f_display, ds.ink, ds.inv_ink))
    return ('<div style="padding: 34px %dpx 0;"><div style="display: grid; grid-template-columns: minmax(0, 1fr) 460px; '
            'gap: 32px; align-items: center; padding: 52px 48px; background: %s; border: 3px solid %s; '
            'box-shadow: 10px 10px 0 %s;"><div>%s</div>%s</div></div>' % (pad(ds), ds.accent, ds.ink, ds.ink, left, right))


# ── services band, shared shape ──────────────────────────────────────────
def services(ds):
    a_title = "Screens, batteries, data recovery." if ds.key != "c" else "CRACKED SCREEN?<br>BRING IT IN."
    b_title = "Put it aside, pay it off." if ds.key != "c" else "PAY IT OFF<br>MONTH BY MONTH."
    a_body = ("A repair cannot be priced until a technician has the handset in front of them, so repairs are booked at "
              "the counter and quoted on a job card. Anything over N$350 is confirmed with you before work starts.")
    b_body = ("Pay a deposit and we hold the handset — the same unit, with its IMEI reserved against your name — until "
              "the balance is settled. Track every payment from your account.")
    if ds.key == "a":
        return wrap(ds, '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; '
                        'background: %s; border: 1px solid %s;">'
                        '<div style="background: %s; color: %s; padding: 40px;">%s%s%s<div style="margin-top: 26px;">%s</div></div>'
                        '<div style="background: %s; padding: 40px;">%s%s%s<div style="margin-top: 26px;">%s</div></div></div>'
                        % (ds.line, ds.line, ds.ink, ds.inv_ink, ds.eyebrow("In-house workshop", ds.accent),
                           ds.disp(a_title, 34, "h3", " margin-top: 14px;", ds.inv_ink),
                           ds.body(a_body, 15, "#b9c3ce", 460, top=14),
                           ds.btn("Book a repair", "buy", 48, fs=15),
                           ds.panel, ds.eyebrow("Lay-by"), ds.disp(b_title, 34, "h3", " margin-top: 14px;"),
                           ds.body(b_body, 15, ds.muted, 460, top=14),
                           ds.btn("How lay-by works", "secondary", 48, fs=15)), top=56)
    if ds.key == "b":
        return ('<div style="margin: 88px %dpx 0; padding: 52px 56px; border-radius: 30px; '
                'border: 1px solid rgba(163,230,53,0.28); background: linear-gradient(120deg, rgba(163,230,53,0.09), rgba(10,11,13,0) 58%%);">'
                '<div style="display: flex; align-items: center; justify-content: space-between; gap: 48px;">'
                '<div>%s%s%s</div>%s</div></div>'
                % (pad(ds), ds.eyebrow("The workshop", ds.accent),
                   ds.disp("Cracked it? We fix it here,<br>not somewhere else.", 40, "h3", " margin-top: 18px;"),
                   ds.body(a_body, 15.5, ds.muted, 560, top=16, lh=1.7),
                   ds.btn("Book a repair", "secondary", 58, arrow=True, fs=16)))
    return wrap(ds, '<div style="display: grid; grid-template-columns: 1.25fr 1fr; gap: 20px;">'
                    '<div style="padding: 42px 44px; background: %s; color: %s; border: 3px solid %s; box-shadow: 10px 10px 0 %s;">'
                    '%s%s%s<div style="margin-top: 28px;">%s</div></div>'
                    '<div style="padding: 42px 44px; border: 3px solid %s; box-shadow: 10px 10px 0 %s;">'
                    '%s%s%s<div style="margin-top: 28px;">%s</div></div></div>'
                    % (ds.ink, ds.inv_ink, ds.ink, ds.accent,
                       ds.badge("In-house workshop"), ds.disp(a_title, 40, "h3", " margin-top: 20px; line-height: 1.02;", ds.inv_ink),
                       ds.body(a_body, 15.5, "#b9c6d3", 520, top=16),
                       ds.btn("BOOK A REPAIR", "buy", 54, fs=15.5),
                       ds.ink, ds.ink, ds.badge("Lay-by", "ink"),
                       ds.disp(b_title, 40, "h3", " margin-top: 20px; line-height: 1.02;"),
                       ds.body(b_body, 15.5, ds.muted, top=16),
                       ds.btn("HOW IT WORKS", "secondary", 54, fs=15.5)), top=60)


def promises(ds):
    items = [("truck", "Nationwide delivery", "Courier to all 14 regions"),
             ("shield", "Genuine handsets", "Imported, tested, warrantied"),
             ("wrench", "We repair too", "Screens, batteries, data recovery")]
    cells = []
    for name, title, detail in items:
        cells.append(
            '<div style="display: flex; align-items: center; gap: 14px; padding: %dpx; background: %s; border: %s; '
            'border-radius: %s; box-shadow: %s;">'
            '<span style="display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; '
            'flex-shrink: 0; border-radius: %s; background: %s;">%s</span>'
            '<div><div style="font-size: 15px; font-weight: 600;">%s</div>'
            '<div style="margin-top: 3px; font-size: 13px; color: %s;">%s</div></div></div>'
            % (20, ds.panel if ds.key != "b" else ds.panel2, ds.border, ds.r_card, ds.shadow,
               "999px" if ds.key == "b" else "0", ds.accent, icon(name, 19, ds.accent_ink, 2),
               title, ds.muted, detail))
    return wrap(ds, ds.grid(cells, 3, 20 if ds.key != "a" else 1), top=56 if ds.key != "b" else 88)


def home(ds):
    featured = [BY[k] for k in ["a26u", "a55", "x13", "a15"]]
    filters = "".join([ds.chip("All", True), ds.chip("Samsung", False, 4), ds.chip("Ulefone", False, 4)])
    grid = ds.card_grid([ds.card(p) for p in featured], 4)
    sec = ds.section("The shelf" if ds.key == "a" else ("In stock tonight" if ds.key == "b" else "ON THE SHELF<br>RIGHT NOW"),
                     grid,
                     sub="Samsung and Ulefone, sealed and IMEI-checked. Sorted the way our till sees them." if ds.key != "c" else None,
                     right=filters, pad="0", size=38 if ds.key == "a" else (44 if ds.key == "b" else 46))
    return ds.root(ds.header("shop") + hero(ds) + wrap(ds, sec, top=64) + promises(ds) + services(ds) + ds.footer())


# ── catalogue ────────────────────────────────────────────────────────────
def facet(ds, title, rows):
    lines = []
    for label, count in rows:
        box = ('<span style="display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; '
               'border: %s; border-radius: %s; background: %s;">%s</span>'
               % ("2px solid " + ds.ink if ds.key == "c" else "1px solid " + (ds.line if ds.key != "b" else "rgba(242,241,238,0.3)"),
                  "4px" if ds.key != "b" else "5px",
                  "transparent",
                  ""))
        lines.append('<label style="display: flex; align-items: center; gap: 11px; min-height: 44px; font-size: 14.5px;">'
                     '%s<span style="flex-grow: 1;">%s</span>'
                     '<span style="font-family: %s; font-size: 12.5px; color: %s;">%d</span></label>'
                     % (box, label, ds.f_num if ds.key == "a" else ds.f_body, ds.muted, count))
    return ('<div style="padding: 20px 0; border-top: 1px solid %s;">%s<div style="margin-top: 10px;">%s</div></div>'
            % (ds.line, ds.eyebrow(title), "".join(lines)))


def shop(ds):
    side = ('<aside style="width: 268px; flex-shrink: 0;">'
            '<div style="display: flex; align-items: center; justify-content: space-between;">%s'
            '<span style="font-size: 13px; color: %s;">Clear all</span></div>%s%s%s'
            '<div style="padding: 20px 0; border-top: 1px solid %s;">%s'
            '<div style="display: flex; align-items: center; gap: 12px; margin-top: 14px;">%s%s</div>'
            '<div style="margin-top: 12px; height: 4px; background: %s; position: relative;">'
            '<div style="position: absolute; left: 12%%; right: 22%%; top: 0; bottom: 0; background: %s;"></div></div></div>'
            '<div style="padding: 20px 0; border-top: 1px solid %s;">%s'
            '<label style="display: flex; align-items: center; gap: 11px; min-height: 44px; font-size: 14.5px; margin-top: 8px;">'
            '<span style="display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; '
            'border: 1px solid %s; background: %s;">%s</span>In stock only</label></div></aside>'
            % (ds.disp("Filters", 20), ds.muted,
               facet(ds, "Brand", BRANDS), facet(ds, "Price band", BANDS), facet(ds, "Storage", STORAGE),
               ds.line, ds.eyebrow("Price range"),
               ds.field("", "N$ 2 799", w=126, h=44), ds.field("", "N$ 26 499", w=126, h=44),
               ds.line, ds.accent, ds.line, ds.eyebrow("Availability"),
               ds.line if ds.key != "c" else ds.ink, ds.accent, icon("check", 12, ds.accent_ink, 3)))

    chips = "".join([ds.chip("In stock only ×", True), ds.chip("Clear all")])
    toolbar = ('<div style="display: flex; align-items: center; justify-content: space-between; gap: 20px;">'
               '<div style="display: flex; align-items: center; gap: 10px;">%s</div>'
               '<div style="display: flex; align-items: center; gap: 12px;">'
               '<span style="font-size: 13.5px; color: %s;">Sort</span>%s</div></div>'
               % (chips, ds.muted, ds.chip("Price: high to low", True)))

    grid = ds.card_grid([ds.card(p) for p in P[:8]], 3 if ds.key == "b" else 4)
    pager = ('<div style="display: flex; align-items: center; justify-content: center; gap: 10px; padding: 44px 0 0;">'
             '%s%s%s%s</div>'
             % (ds.chip("1", True), ds.chip("2"), ds.chip("3"), ds.chip("Next →")))

    head = ('<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding-bottom: 26px;">'
            '<div>%s%s</div><div style="font-family: %s; font-size: 13.5px; color: %s;">Showing 1–8 of 78</div></div>'
            % (ds.disp("All phones" if ds.key != "c" else "ALL PHONES", 44, "h1"),
               ds.body("Every Samsung and Ulefone handset on the shelf at %s." % STORE["address"], 15.5, ds.muted, top=9),
               ds.f_num if ds.key == "a" else ds.f_body, ds.muted))

    crumbs = ('<div style="display: flex; align-items: center; gap: 9px; padding: 26px 0 0; font-size: 13px; color: %s;">'
              'Home %s Shop %s <span style="color: %s;">All phones</span></div>'
              % (ds.muted, icon("chevron", 13, ds.subtle, 2), icon("chevron", 13, ds.subtle, 2), ds.ink))

    body = ('<div style="display: flex; gap: 40px; padding-bottom: 20px;">%s'
            '<div style="flex-grow: 1; min-width: 0;">%s<div style="margin-top: 26px;">%s</div>%s</div></div>'
            % (side, toolbar, grid, pager))

    return ds.root(ds.header("shop") + wrap(ds, crumbs + head + body, top=0) + ds.footer())


# ── product detail ───────────────────────────────────────────────────────
def product(ds):
    p = BY["s24u"]
    thumbs = "".join(
        '<div style="display: flex; align-items: center; justify-content: center; width: 92px; height: 92px; '
        'background: %s; border: %s; border-radius: %s;">%s</div>'
        % (ds.panel2 if ds.key != "b" else ds.panel,
           ("3px solid " + ds.ink) if (ds.key == "c" and i == 0) else ds.border,
           ds.r_card if ds.key == "b" else "0", ds.device(26, 52, t))
        for i, t in enumerate(["graphite", "silver", "violet", "olive"]))

    trust = "".join(
        '<div style="display: flex; align-items: center; gap: 11px; padding: 16px; background: %s; border: %s; '
        'border-radius: %s; box-shadow: %s;">%s<div>'
        '<div style="font-size: 13.5px; font-weight: 600;">%s</div>'
        '<div style="margin-top: 2px; font-size: 12.5px; color: %s;">%s</div></div></div>'
        % (ds.panel if ds.key != "b" else ds.panel2, ds.border, ds.r_card, ds.shadow,
           icon(ic, 18, ds.accent if ds.key == "b" else ds.ink, 1.9), t, ds.muted, d)
        for ic, t, d in [("shield", "IMEI checked", "Recorded on your invoice"),
                         ("wrench", "Bench tested", "Before it goes on the shelf"),
                         ("pin", "In the building", "Not drop-shipped")])

    gallery = ('<div style="display: flex; gap: 18px;">'
               '<div style="display: flex; flex-direction: column; gap: 12px;">%s</div>'
               '<div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; height: 560px; '
               'background: %s; border: %s; border-radius: %s;">%s</div></div>'
               '<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 18px;">%s</div>'
               % (thumbs, ds.media_bg if ds.key != "b" else "transparent",
                  ds.border if ds.key != "b" else ds.border, ds.r_card,
                  ds.device(230, 468, p["tone"]), trust))

    options = "".join(
        '<span style="display: inline-flex; align-items: center; height: 46px; padding: 0 18px; border: %s; '
        'border-radius: %s; background: %s; color: %s; font-size: 14px; font-weight: 600;">%s</span>'
        % (("3px solid " + ds.ink) if ds.key == "c" else ds.border, ds.r_btn if ds.key == "b" else "0",
           ds.accent if sel else "transparent", ds.accent_ink if sel else ds.ink, lbl)
        for lbl, sel in [("256GB", True), ("512GB", False)])

    colours = "".join(
        '<span style="display: inline-flex; align-items: center; gap: 9px; height: 46px; padding: 0 16px; border: %s; '
        'border-radius: %s; font-size: 14px; font-weight: 500;">'
        '<span style="width: 16px; height: 16px; border-radius: 50%%; background: linear-gradient(140deg, %s);"></span>%s</span>'
        % (("3px solid " + ds.ink) if ds.key == "c" else ds.border, ds.r_btn if ds.key == "b" else "0",
           "#6b7683, #2b333d", lbl)
        for lbl in ["Titanium Gray", "Titanium Black"])

    qty = ('<div style="display: flex; align-items: center; height: 52px; border: %s; border-radius: %s;">'
           '<span style="display: flex; align-items: center; justify-content: center; width: 48px; height: 100%%;">%s</span>'
           '<span style="width: 44px; text-align: center; font-family: %s; font-size: 16px; font-weight: 600;">1</span>'
           '<span style="display: flex; align-items: center; justify-content: center; width: 48px; height: 100%%;">%s</span></div>'
           % (("3px solid " + ds.ink) if ds.key == "c" else ds.border, ds.r_btn if ds.key == "b" else "0",
              icon("minus", 16, ds.muted, 2), ds.f_num, icon("plus", 16, ds.ink, 2)))

    layby = ('<div style="margin-top: 22px; padding: 20px; background: %s; border: %s; border-radius: %s;">'
             '<div style="display: flex; align-items: center; justify-content: space-between;">%s%s</div>'
             '<div style="display: flex; align-items: baseline; gap: 8px; margin-top: 12px;">%s'
             '<span style="font-size: 14px; color: %s;">deposit, then 6 × N$ 3 533,20</span></div>'
             '<div style="margin-top: 12px; height: 6px; background: %s; border-radius: 3px; overflow: hidden;">'
             '<div style="width: 20%%; height: 100%%; background: %s;"></div></div>'
             '<div style="margin-top: 10px; font-size: 13px; color: %s;">The exact unit is held with its IMEI against '
             'your name until the balance is settled.</div></div>'
             % (ds.panel2 if ds.key != "b" else "rgba(163,230,53,0.06)",
                ds.border if ds.key != "c" else "3px solid " + ds.ink, ds.r_card,
                ds.eyebrow("Lay-by from"), ds.badge("Popular", "plain"),
                ds.price(money(5299.8), 26), ds.muted,
                ds.line if ds.key != "c" else "#dfe4e9", ds.accent, ds.muted))

    fulfil = "".join(
        '<div style="display: flex; gap: 12px; padding: 14px 0; border-top: 1px solid %s;">'
        '<span style="flex-shrink: 0; margin-top: 2px;">%s</span>'
        '<div><div style="font-size: 14.5px; font-weight: 600;">%s</div>'
        '<div style="margin-top: 3px; font-size: 13.5px; color: %s;">%s</div></div></div>'
        % (ds.line, icon(ic, 18, ds.accent if ds.key == "b" else ds.ink, 1.9), t, ds.muted, d)
        for ic, t, d in [
            ("pin", "Collect today at %s" % STORE["address"], "Ready within the hour, %s" % STORE["hours"].split(" · ")[0]),
            ("truck", "Courier, N$ 150,00", "1–3 working days to all 14 regions"),
            ("shield", "12-month warranty", "Handled in-house — the same bench that repairs it"),
            ("clock", "Stock held 30 minutes", "Your unit is reserved the moment you check out")])

    buy = ('<div>%s<div style="display: flex; align-items: center; gap: 14px; margin-top: 10px;">%s%s</div>'
           '%s<div style="margin-top: 22px;">%s<div style="display: flex; gap: 10px; margin-top: 10px;">%s</div></div>'
           '<div style="margin-top: 18px;">%s<div style="display: flex; gap: 10px; margin-top: 10px;">%s</div></div>'
           '<div style="display: flex; gap: 12px; margin-top: 26px;">%s%s</div>'
           '<div style="display: flex; gap: 12px; margin-top: 12px;">%s%s</div>%s'
           '<div style="margin-top: 24px;">%s</div></div>'
           % (ds.eyebrow(p["brand"]),
              ds.disp(p["name"], 34, "h1"), "",
              ds.body(p["blurb"], 15.5, ds.muted, top=14),
              ds.eyebrow("Storage"), options,
              ds.eyebrow("Colour"), colours,
              qty, ds.btn("Add to cart", "buy", 52, wide=False, icon_name="bag", fs=15.5),
              ds.btn("Buy now", "primary", 52, fs=15.5), ds.btn("Compare", "ghost", 52, icon_name="scale", fs=15.5),
              layby, fulfil))

    price_block = ('<div style="display: flex; align-items: flex-end; justify-content: space-between; padding-bottom: 18px; '
                   'border-bottom: 1px solid %s;"><div>%s%s</div><div style="text-align: right;">%s'
                   '<div style="margin-top: 6px; font-family: %s; font-size: 12.5px; color: %s;">SKU %s</div></div></div>'
                   % (ds.line, ds.price(money(p["price"]), 40),
                      '<div style="margin-top: 6px; font-size: 13.5px; color: %s;">VAT included · N$ 3 456,39 VAT</div>' % ds.muted,
                      ds.stock(p["stock"], 14), ds.f_num if ds.key == "a" else ds.f_body, ds.muted, p["sku"]))

    tabs = "".join(ds.chip(t, i == 0) for i, t in enumerate(["Specification", "In the box", "Warranty &amp; returns"]))
    box = ("".join('<div style="display: flex; align-items: center; gap: 10px; padding: 10px 0; font-size: 14.5px;">%s%s</div>'
                   % (icon("check", 16, ds.accent if ds.key == "b" else ds.ink, 2.2), t)
                   for t in ["Handset, sealed", "USB-C cable", "SIM tool", "Quick start guide",
                             "JR Importers warranty card", "IMEI recorded on your invoice"]))

    detail = ('<div style="display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 56px; margin-top: 26px;">'
              '<div>%s</div><div>%s</div></div>'
              % (ds.spec_table(p["specs"]),
                 '<div style="padding: 24px; background: %s; border: %s; border-radius: %s; box-shadow: %s;">%s'
                 '<div style="margin-top: 8px;">%s</div></div>'
                 % (ds.panel2 if ds.key != "b" else ds.panel, ds.border, ds.r_card, ds.shadow,
                    ds.eyebrow("In the box"), box)))

    related = ds.card_grid([ds.card(BY[k]) for k in ["a26u", "a55", "x13", "a15"]], 4)

    crumbs = ('<div style="display: flex; align-items: center; gap: 9px; padding: 26px 0 22px; font-size: 13px; color: %s;">'
              'Home %s All phones %s Samsung %s <span style="color: %s;">%s</span></div>'
              % (ds.muted, icon("chevron", 13, ds.subtle, 2), icon("chevron", 13, ds.subtle, 2),
                 icon("chevron", 13, ds.subtle, 2), ds.ink, p["short"]))

    body = (crumbs +
            '<div style="display: grid; grid-template-columns: minmax(0, 1fr) 520px; gap: 56px;">%s<div>%s%s</div></div>'
            % (gallery, price_block, '<div style="margin-top: 22px;">%s</div>' % buy) +
            '<div style="margin-top: 72px; padding-top: 30px; border-top: 1px solid %s;">'
            '<div style="display: flex; gap: 10px;">%s</div>%s</div>' % (ds.line, tabs, detail) +
            ds.section("You might also need" if ds.key != "c" else "MORE ON THE SHELF", related, pad="72px 0 0", size=34))

    return ds.root(ds.header("shop") + wrap(ds, body) + ds.footer())


# ── cart ─────────────────────────────────────────────────────────────────
def cart(ds):
    lines = []
    for p, q in [(BY["a55"], 1), (BY["a15"], 2)]:
        lines.append(
            '<div style="display: flex; gap: 20px; padding: 22px 0; border-top: 1px solid %s;">'
            '<div style="display: flex; align-items: center; justify-content: center; width: 108px; height: 132px; '
            'flex-shrink: 0; background: %s; border: %s; border-radius: %s;">%s</div>'
            '<div style="flex-grow: 1; min-width: 0;">%s'
            '<div style="margin-top: 4px; font-size: 16.5px; font-weight: 600;">%s</div>'
            '<div style="margin-top: 6px; font-family: %s; font-size: 12.5px; color: %s;">SKU %s · %s</div>'
            '<div style="margin-top: 10px;">%s</div></div>'
            '<div style="display: flex; align-items: center; gap: 12px;">'
            '<div style="display: flex; align-items: center; height: 44px; border: %s; border-radius: %s;">'
            '<span style="display: flex; align-items: center; justify-content: center; width: 42px;">%s</span>'
            '<span style="width: 34px; text-align: center; font-family: %s; font-weight: 600;">%d</span>'
            '<span style="display: flex; align-items: center; justify-content: center; width: 42px;">%s</span></div></div>'
            '<div style="width: 150px; text-align: right;">%s<div style="margin-top: 10px;">%s</div></div></div>'
            % (ds.line, ds.panel2 if ds.key != "b" else ds.panel, ds.border, ds.r_card, ds.device(58, 112, p["tone"]),
               ds.eyebrow(p["brand"]), p["name"], ds.f_num if ds.key == "a" else ds.f_body, ds.muted, p["sku"],
               p["specs"][2][1], ds.stock(p["stock"]),
               ("3px solid " + ds.ink) if ds.key == "c" else ds.border, ds.r_btn if ds.key == "b" else "0",
               icon("minus", 15, ds.muted, 2), ds.f_num, q, icon("plus", 15, ds.ink, 2),
               ds.price(money(p["price"] * q), 20),
               '<span style="display: inline-flex; align-items: center; gap: 7px; font-size: 13px; color: %s;">%s Remove</span>'
               % (ds.muted, icon("trash", 14, ds.muted, 1.8))))

    def row(label, value, strong=False, muted=False):
        return ('<div style="display: flex; align-items: baseline; justify-content: space-between; padding: 9px 0; '
                'font-size: %spx; color: %s;"><span style="%s">%s</span>'
                '<span style="font-family: %s; font-weight: %s;">%s</span></div>'
                % (16 if strong else 14.5, ds.muted if muted else ds.ink,
                   "font-weight: 600;" if strong else "", label,
                   ds.f_num, "700" if strong else "500", value))

    summary = ('<div style="padding: %dpx; background: %s; border: %s; border-radius: %s; box-shadow: %s;">%s'
               '<div style="margin-top: 14px;">%s%s%s</div>'
               '<div style="margin-top: 8px; padding-top: 14px; border-top: 1px solid %s;">%s</div>'
               '<div style="margin-top: 20px;">%s</div>'
               '<div style="margin-top: 12px;">%s</div>'
               '<div style="display: flex; gap: 10px; margin-top: 18px; padding-top: 16px; border-top: 1px solid %s;">'
               '<span style="margin-top: 1px;">%s</span>'
               '<span style="font-size: 13px; color: %s;">Your units are reserved for <strong style="color: %s;">28:14</strong> '
               'while you check out. After that they go back on the shelf.</span></div></div>'
               % (26, ds.panel2 if ds.key != "b" else ds.panel, ds.border, ds.r_card, ds.shadow,
                  ds.disp("Order summary" if ds.key != "c" else "ORDER SUMMARY", 22),
                  row("Subtotal (3 items)", money(15497)), row("Courier · nationwide", money(150)),
                  row("VAT 15% included", money(2040.91), muted=True),
                  ds.line, row("Total", money(15647), strong=True),
                  ds.btn("Checkout", "buy", 54, wide=True, arrow=True, fs=16),
                  ds.btn("Continue shopping", "ghost", 48, wide=True, fs=14.5),
                  ds.line, icon("clock", 16, ds.accent if ds.key == "b" else ds.ink, 2), ds.muted, ds.ink))

    body = ('<div style="padding: 30px 0 0;">%s%s</div>'
            '<div style="display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 48px; margin-top: 26px;">'
            '<div>%s<div style="display: flex; align-items: center; gap: 12px; margin-top: 26px;">%s%s</div></div>'
            '<div>%s</div></div>'
            % (ds.disp("Your cart" if ds.key != "c" else "YOUR CART", 44, "h1"),
               ds.body("3 items · held for 30 minutes", 15.5, ds.muted, top=9),
               "".join(lines),
               ds.field("Voucher code", "", "Enter code", w=240, h=48),
               '<div style="margin-top: 22px;">%s</div>' % ds.btn("Apply", "secondary", 48, fs=14.5),
               summary))

    return ds.root(ds.header("shop") + wrap(ds, body) + ds.footer())


# ── checkout ─────────────────────────────────────────────────────────────
def checkout(ds):
    steps = []
    for i, (n, lbl, state) in enumerate([("1", "Cart", "done"), ("2", "Delivery", "current"),
                                         ("3", "Payment", "next"), ("4", "Confirmation", "next")]):
        dot = ('<span style="display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; '
               'border-radius: %s; background: %s; color: %s; border: %s; font-family: %s; font-size: 13px; font-weight: 700;">%s</span>'
               % ("50%" if ds.key != "c" else "0",
                  ds.accent if state == "current" else (ds.ink if state == "done" else "transparent"),
                  ds.accent_ink if state == "current" else (ds.inv_ink if state == "done" else ds.muted),
                  ("3px solid " + ds.ink) if ds.key == "c" else ds.border, ds.f_num,
                  icon("check", 14, "currentColor", 3) if state == "done" else n))
        steps.append('<div style="display: flex; align-items: center; gap: 10px;">%s'
                     '<span style="font-size: 14px; font-weight: %s; color: %s;">%s</span></div>'
                     % (dot, "600" if state == "current" else "500",
                        ds.ink if state != "next" else ds.muted, lbl))
        if i < 3:
            steps.append('<div style="flex-grow: 1; height: 1px; background: %s;"></div>' % ds.line)
    stepper = ('<div style="display: flex; align-items: center; gap: 16px; padding: 28px 0 34px;">%s</div>' % "".join(steps))

    def option(title, detail, price, selected=False, ic="truck"):
        return ('<label style="display: flex; align-items: center; gap: 16px; padding: 18px 20px; border: %s; '
                'border-radius: %s; background: %s; box-shadow: %s;">'
                '<span style="display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; '
                'flex-shrink: 0; border-radius: 50%%; border: %s; background: %s;">%s</span>%s'
                '<div style="flex-grow: 1;"><div style="font-size: 15px; font-weight: 600;">%s</div>'
                '<div style="margin-top: 3px; font-size: 13.5px; color: %s;">%s</div></div>'
                '<span style="font-family: %s; font-size: 15px; font-weight: 600;">%s</span></label>'
                % (("3px solid " + ds.ink) if ds.key == "c" else
                   ("1px solid " + (ds.accent if selected else (ds.line if ds.key != "b" else "rgba(242,241,238,0.11)"))),
                   ds.r_card, ds.panel if not selected else (ds.panel2 if ds.key != "b" else "rgba(163,230,53,0.06)"),
                   ds.shadow if selected else "none",
                   "1px solid " + (ds.ink if selected else ds.line), ds.accent if selected else "transparent",
                   '<span style="width: 8px; height: 8px; border-radius: 50%%; background: %s;"></span>' % ds.accent_ink if selected else "",
                   icon(ic, 20, ds.muted, 1.8), title, ds.muted, detail, ds.f_num, price))

    delivery = ('<div style="display: flex; flex-direction: column; gap: 12px; margin-top: 16px;">%s%s%s</div>'
                % (option("Collect at %s" % STORE["address"], "Ready within the hour · %s" % STORE["hours"], "Free", False, "pin"),
                   option("Courier — nationwide", "1–3 working days, all 14 regions", money(150), True, "truck"),
                   option("Local delivery — %s" % STORE["city"], "Same day if ordered before 14:00", money(60), False, "truck")))

    payment = ('<div style="display: flex; flex-direction: column; gap: 12px; margin-top: 16px;">%s%s%s%s</div>'
               % (option("Card online (DPO)", "Visa, Mastercard — 3D Secure", "Now", True, "shield"),
                  option("EFT / bank transfer", "Order ships once payment reflects", "1–2 days", False, "clock"),
                  option("Cash on collection", "Pay at the counter when you collect", "At counter", False, "pin"),
                  option("Lay-by", "20% deposit, balance over 6 months", money(3129.4), False, "clock")))

    form = ('<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 16px;">'
            '%s%s%s%s</div><div style="margin-top: 16px;">%s</div>'
            % (ds.field("Full name", "Johanna Amutenya"), ds.field("Mobile number", "+264 81 234 5678"),
               ds.field("Email", "johanna@example.na"), ds.field("Town / city", "Swakopmund"),
               ds.field("Delivery address", "12 Nathaniel Maxuilili Street, Swakopmund")))

    def head(n, t):
        return ('<div style="display: flex; align-items: center; gap: 12px; margin-top: 38px;">%s</div>'
                % ds.disp(("%s. %s" % (n, t)) if ds.key != "c" else ("%s. %s" % (n, t.upper())), 24, "h2"))

    def row(label, value, strong=False, muted=False):
        return ('<div style="display: flex; align-items: baseline; justify-content: space-between; padding: 9px 0; '
                'font-size: %spx; color: %s;"><span>%s</span>'
                '<span style="font-family: %s; font-weight: %s;">%s</span></div>'
                % (16 if strong else 14.5, ds.muted if muted else ds.ink, label, ds.f_num,
                   "700" if strong else "500", value))

    minis = "".join(
        '<div style="display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid %s;">'
        '<div style="display: flex; align-items: center; justify-content: center; width: 52px; height: 62px; flex-shrink: 0; '
        'background: %s; border: %s;">%s</div>'
        '<div style="flex-grow: 1; min-width: 0;"><div style="font-size: 14px; font-weight: 600;">%s</div>'
        '<div style="margin-top: 3px; font-size: 12.5px; color: %s;">Qty %d</div></div>'
        '<span style="font-family: %s; font-size: 14px; font-weight: 600;">%s</span></div>'
        % (ds.line, ds.panel2 if ds.key != "b" else ds.panel, ds.border, ds.device(28, 54, p["tone"]),
           p["name"], ds.muted, q, ds.f_num, money(p["price"] * q))
        for p, q in [(BY["a55"], 1), (BY["a15"], 2)])

    summary = ('<div style="position: relative; padding: 26px; background: %s; border: %s; border-radius: %s; box-shadow: %s;">'
               '%s<div style="margin-top: 10px;">%s</div>'
               '<div style="margin-top: 14px; padding-top: 6px;">%s%s%s</div>'
               '<div style="margin-top: 8px; padding-top: 14px; border-top: 1px solid %s;">%s</div>'
               '<div style="margin-top: 20px;">%s</div>'
               '<div style="display: flex; gap: 10px; margin-top: 16px;"><span style="margin-top: 1px;">%s</span>'
               '<span style="font-size: 12.5px; line-height: 1.55; color: %s;">Stock reserved <strong style="color: %s;">28:14</strong>. '
               'Your IMEI is recorded on the invoice the moment payment clears.</span></div></div>'
               % (ds.panel2 if ds.key != "b" else ds.panel, ds.border, ds.r_card, ds.shadow,
                  ds.disp("Order summary" if ds.key != "c" else "ORDER SUMMARY", 22), minis,
                  row("Subtotal", money(15497)), row("Courier", money(150)), row("VAT 15% included", money(2040.91), muted=True),
                  ds.line, row("Total due", money(15647), strong=True),
                  ds.btn("Pay %s" % money(15647), "buy", 56, wide=True, fs=16),
                  icon("shield", 15, ds.accent if ds.key == "b" else ds.ink, 2), ds.muted, ds.ink))

    body = (stepper +
            '<div style="display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 56px;">'
            '<div>%s%s%s%s%s%s</div><div>%s</div></div>'
            % (ds.disp("Checkout" if ds.key != "c" else "CHECKOUT", 44, "h1"),
               head("1", "Your details"), form, head("2", "How you want it"), delivery + head("3", "Payment") + payment,
               '<div style="display: flex; gap: 12px; margin-top: 30px;">%s%s</div>'
               % (ds.btn("Back to cart", "ghost", 52, fs=15), ds.btn("Place order", "primary", 52, arrow=True, fs=15)),
               summary))

    return ds.root(ds.header("shop") + wrap(ds, body, top=8) + ds.footer())


# ── repairs / job card ───────────────────────────────────────────────────
def repairs(ds):
    steps = []
    for n, t, d in [("01", "Bring it in", "Counter at %s. No appointment needed." % STORE["address"]),
                    ("02", "We raise a job card", "Fault noted, bench checklist run, handset signed in."),
                    ("03", "We quote you first", "Anything over N$350 is confirmed with you before work starts."),
                    ("04", "Collect and pay", "30-day warranty on parts replaced. Keep your invoice.")]:
        steps.append('<div style="padding: 24px; background: %s; border: %s; border-radius: %s; box-shadow: %s;">'
                     '<div style="font-family: %s; font-size: 30px; font-weight: %s; color: %s;">%s</div>'
                     '<div style="margin-top: 12px; font-size: 16px; font-weight: 600;">%s</div>'
                     '<div style="margin-top: 7px; font-size: 13.5px; line-height: 1.6; color: %s;">%s</div></div>'
                     % (ds.panel if ds.key != "b" else ds.panel2, ds.border, ds.r_card, ds.shadow,
                        ds.f_num, ds.num_w(), ds.accent if ds.key == "b" else ds.muted, n, t, ds.muted, d))

    checks = "".join(
        '<label style="display: flex; align-items: center; gap: 10px; min-height: 44px; font-size: 14px;">'
        '<span style="display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; '
        'border: %s; border-radius: %s; background: %s;">%s</span>%s</label>'
        % (("2.5px solid " + ds.ink) if ds.key == "c" else ds.border, "4px" if ds.key != "b" else "6px",
           ds.accent if c in ("LCD", "Touch", "Charge") else "transparent",
           icon("check", 13, ds.accent_ink, 3) if c in ("LCD", "Touch", "Charge") else "", c)
        for c in JOB_CHECKS)

    form = ('<div style="padding: %dpx; background: %s; border: %s; border-radius: %s; box-shadow: %s;">%s'
            '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 18px;">%s%s%s%s</div>'
            '<div style="margin-top: 18px;">%s</div>'
            '<div style="margin-top: 24px;">%s'
            '<div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; margin-top: 10px;">%s</div></div>'
            '<div style="display: flex; align-items: center; gap: 14px; margin-top: 26px; padding-top: 20px; border-top: 1px solid %s;">'
            '%s<span style="font-size: 13px; color: %s;">A minimum handling fee of N$200 applies and is non-refundable.</span></div></div>'
            % (30, ds.panel if ds.key != "b" else ds.panel2, ds.border, ds.r_card, ds.shadow,
               ds.disp("Book a repair" if ds.key != "c" else "BOOK A REPAIR", 28, "h2"),
               ds.field("Your name", "Petrus Shikongo"), ds.field("Mobile number", "+264 85 998 1122"),
               ds.field("Handset make &amp; model", "Samsung Galaxy A15"), ds.field("IMEI", "35 987654 321098 7"),
               ds.field("What is wrong with it?", "Screen cracked after a drop, touch works in the top half only"),
               ds.eyebrow("Bench checklist — what works when you hand it in"), checks, ds.line,
               ds.btn("Book it in", "buy", 52, arrow=True, fs=15.5), ds.muted))

    terms = ("".join('<div style="display: flex; gap: 10px; padding: 9px 0; font-size: 13.5px; line-height: 1.6; color: %s;">'
                     '<span style="flex-shrink: 0; margin-top: 3px;">%s</span><span>%s</span></div>'
                     % (ds.muted, icon("check", 14, ds.accent if ds.key == "b" else ds.ink, 2.4), t)
                     for t in ["Minimum handling fee of N$200, non-refundable.",
                               "Repairs over N$350 are confirmed with you before any work is carried out.",
                               "Parts replaced carry a 30-day warranty. Keep your invoice.",
                               "No warranty on liquid or physical damage repairs, or on software.",
                               "Collect within 90 days or the handset is sold to defray repair costs.",
                               "No handset is released without the job card present."]))

    tracker_rows = "".join(
        '<div style="display: flex; align-items: center; gap: 14px; padding: 14px 0; border-top: 1px solid %s;">'
        '<span style="display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; '
        'border-radius: %s; background: %s; color: %s; border: %s;">%s</span>'
        '<div style="flex-grow: 1;"><div style="font-size: 14.5px; font-weight: %s;">%s</div>'
        '<div style="margin-top: 2px; font-size: 12.5px; color: %s;">%s</div></div>%s</div>'
        % (ds.line, "50%" if ds.key != "c" else "0",
           ds.accent if state != "next" else "transparent", ds.accent_ink,
           ("1px solid " + ds.line) if state == "next" else "1px solid transparent",
           icon("check", 14, "currentColor", 3) if state == "done" else
           ('<span style="width: 8px; height: 8px; border-radius: 50%%; background: %s;"></span>' % ds.accent_ink if state == "current" else ""),
           "600" if state != "next" else "500", label, ds.muted, when,
           ds.badge("Now", "accent") if state == "current" else "")
        for label, when, state in [("Received", "Tue 09:14 · signed in by Rauna", "done"),
                                   ("Awaiting quote approval", "Tue 11:40 · N$ 1 450,00 quoted", "done"),
                                   ("Approved — in repair", "Tue 14:02 · bench 2", "current"),
                                   ("Ready for collection", "—", "next"),
                                   ("Collected", "—", "next")])

    tracker = ('<div style="padding: 26px; background: %s; border: %s; border-radius: %s; box-shadow: %s;">'
               '<div style="display: flex; align-items: center; justify-content: space-between;">%s%s</div>'
               '<div style="margin-top: 6px; font-family: %s; font-size: 13px; color: %s;">Job card JC-1184 · Galaxy A15 · 35 987654 321098 7</div>'
               '<div style="margin-top: 14px;">%s</div></div>'
               % (ds.panel2 if ds.key != "b" else ds.panel, ds.border, ds.r_card, ds.shadow,
                  ds.disp("Track a repair" if ds.key != "c" else "TRACK A REPAIR", 22),
                  ds.badge("In repair", "accent"), ds.f_num if ds.key == "a" else ds.f_body, ds.muted, tracker_rows))

    sidebar = ('%s<div style="margin-top: 26px; padding: 26px; background: %s; border: %s; border-radius: %s; box-shadow: %s;">'
               '%s<div style="margin-top: 10px;">%s</div></div>'
               % (tracker, ds.panel if ds.key != "b" else ds.panel2, ds.border, ds.r_card, ds.shadow,
                  ds.disp("The terms, as printed on the card" if ds.key != "c" else "THE PRINTED TERMS", 20), terms))

    hero_r = ('<div style="padding: 44px %dpx; background: %s; color: %s; %s">'
              '<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 40px;">'
              '<div>%s%s%s</div><div style="display: flex; gap: 30px;">%s%s%s</div></div></div>'
              % (pad(ds), ds.ink if ds.key != "b" else "transparent", ds.inv_ink if ds.key != "b" else ds.ink,
                 "border-bottom: 3px solid %s;" % ds.ink if ds.key == "c" else "",
                 ds.eyebrow("In-house workshop", ds.accent),
                 ds.disp("We fix it here, on our own bench." if ds.key != "c" else "WE FIX IT HERE,<br>ON OUR OWN BENCH.",
                         46, "h1", " margin-top: 16px;", ds.inv_ink if ds.key != "b" else ds.ink),
                 ds.body("Screens, batteries, charging ports and data recovery — booked in on a job card at the counter, "
                         "quoted before a technician starts.", 16,
                         "#b9c3ce" if ds.key != "b" else ds.muted, 560, top=14),
                 ds.stat("N$200", "minimum handling fee"), ds.stat("N$350", "quote threshold"),
                 ds.stat("30 days", "warranty on parts")))

    body = ('<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: %dpx; padding: 56px 0 0;">%s</div>'
            '<div style="display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 40px; padding: 48px 0 0;">'
            '<div>%s</div><div>%s</div></div>'
            % (20 if ds.key != "a" else 16, "".join(steps), form, sidebar))

    return ds.root(ds.header("repairs") + hero_r + wrap(ds, body) + ds.footer())


# ── account ──────────────────────────────────────────────────────────────
def account(ds):
    nav_items = [("Orders", True), ("Lay-bys", False), ("Job cards", False), ("Addresses", False), ("Details", False)]
    nav = "".join(
        '<div style="display: flex; align-items: center; justify-content: space-between; min-height: 46px; padding: 0 16px; '
        'background: %s; color: %s; border: %s; border-radius: %s; font-size: 14.5px; font-weight: %s;">%s%s</div>'
        % (ds.accent if a else "transparent", ds.accent_ink if a else ds.ink,
           ds.border if (a or ds.key == "c") else "1px solid transparent",
           ds.r_btn if ds.key == "b" else "0", "600" if a else "500", t,
           icon("chevron", 15, "currentColor", 2))
        for t, a in nav_items)

    rows = "".join(
        '<div style="display: grid; grid-template-columns: 110px minmax(0, 1fr) 150px 190px 40px; align-items: center; '
        'gap: 16px; padding: 16px 0; border-top: 1px solid %s;">'
        '<span style="font-family: %s; font-size: 13.5px; font-weight: 600;">%s</span>'
        '<span style="font-size: 14.5px;">%s</span>'
        '<span style="font-family: %s; font-size: 14.5px; font-weight: 600;">%s</span>'
        '<span>%s</span><span style="text-align: right;">%s</span></div>'
        % (ds.line, ds.f_num, ref, what, ds.f_num, amt, ds.badge(status, tone), icon("chevron", 16, ds.muted, 2))
        for ref, what, amt, status, tone in ORDER_ROWS)

    orders = ('<div style="padding: %dpx; background: %s; border: %s; border-radius: %s; box-shadow: %s;">'
              '<div style="display: flex; align-items: center; justify-content: space-between;">%s%s</div>'
              '<div style="display: grid; grid-template-columns: 110px minmax(0, 1fr) 150px 190px 40px; gap: 16px; '
              'padding: 18px 0 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: %s;">'
              '<span>Order</span><span>Items</span><span>Total</span><span>Status</span><span></span></div>%s</div>'
              % (28, ds.panel if ds.key != "b" else ds.panel2, ds.border, ds.r_card, ds.shadow,
                 ds.disp("Your orders" if ds.key != "c" else "YOUR ORDERS", 26),
                 ds.chip("All statuses", False), ds.muted, rows))

    layby = ('<div style="padding: 26px; background: %s; border: %s; border-radius: %s; box-shadow: %s;">'
             '<div style="display: flex; align-items: center; justify-content: space-between;">%s%s</div>'
             '<div style="margin-top: 14px; font-size: 15px; font-weight: 600;">Galaxy S24 Ultra 256GB</div>'
             '<div style="margin-top: 4px; font-family: %s; font-size: 12.5px; color: %s;">IMEI reserved · JR-SGS24U-256</div>'
             '<div style="display: flex; align-items: baseline; justify-content: space-between; margin-top: 16px;">'
             '<span style="font-size: 13.5px; color: %s;">Paid to date</span>%s</div>'
             '<div style="margin-top: 10px; height: 8px; background: %s; border-radius: 4px; overflow: hidden;">'
             '<div style="width: 42%%; height: 100%%; background: %s;"></div></div>'
             '<div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 12.5px; color: %s;">'
             '<span>42%% of %s</span><span>Next payment 15 Sep</span></div>'
             '<div style="margin-top: 18px;">%s</div></div>'
             % (ds.panel2 if ds.key != "b" else ds.panel, ds.border, ds.r_card, ds.shadow,
                ds.disp("Active lay-by" if ds.key != "c" else "ACTIVE LAY-BY", 20), ds.badge("On track", "success"),
                ds.f_num if ds.key == "a" else ds.f_body, ds.muted, ds.muted,
                ds.price(money(11129.58), 22), ds.line if ds.key != "c" else "#dfe4e9", ds.accent, ds.muted,
                money(26499), ds.btn("Make a payment", "primary", 46, wide=True, fs=14.5)))

    job = ('<div style="margin-top: 22px; padding: 26px; background: %s; border: %s; border-radius: %s; box-shadow: %s;">'
           '<div style="display: flex; align-items: center; justify-content: space-between;">%s%s</div>'
           '<div style="margin-top: 12px; font-size: 15px; font-weight: 600;">Galaxy A15 · cracked screen</div>'
           '<div style="margin-top: 4px; font-family: %s; font-size: 12.5px; color: %s;">JC-1184 · quoted N$ 1 450,00</div>'
           '<div style="margin-top: 16px;">%s</div></div>'
           % (ds.panel2 if ds.key != "b" else ds.panel, ds.border, ds.r_card, ds.shadow,
              ds.disp("Repair in progress" if ds.key != "c" else "REPAIR IN PROGRESS", 20),
              ds.badge("Bench 2", "plain"), ds.f_num if ds.key == "a" else ds.f_body, ds.muted,
              ds.btn("Open job card", "secondary", 46, wide=True, fs=14.5)))

    body = ('<div style="padding: 30px 0 0;">%s%s</div>'
            '<div style="display: grid; grid-template-columns: 240px minmax(0, 1fr) 340px; gap: 32px; margin-top: 28px;">'
            '<div style="display: flex; flex-direction: column; gap: 6px;">%s</div><div>%s</div><div>%s%s</div></div>'
            % (ds.disp("Johanna Amutenya" if ds.key != "c" else "JOHANNA AMUTENYA", 40, "h1"),
               ds.body("johanna@example.na · +264 81 234 5678 · Swakopmund", 15, ds.muted, top=9),
               nav, orders, layby, job))

    return ds.root(ds.header("account") + wrap(ds, body) + ds.footer())


# ── mobile ───────────────────────────────────────────────────────────────
def _frame(ds, inner, label):
    return ('<div><div style="font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; '
            'color: %s; margin-bottom: 14px;">%s</div>'
            '<div style="position: relative; width: 390px; height: 844px; overflow: hidden; background: %s; '
            'border: %s; border-radius: %s; box-shadow: %s;">%s</div></div>'
            % (ds.muted, label, ds.bg, ds.border if ds.key != "b" else "1px solid rgba(242,241,238,0.16)",
               "34px" if ds.key != "c" else "0", ds.shadow if ds.key == "c" else "0 30px 60px -34px rgba(0,0,0,0.4)", inner))


def _m_header(ds):
    return ('<div style="display: flex; align-items: center; justify-content: space-between; height: 62px; padding: 0 18px; '
            'background: %s; color: %s; %s">'
            '<div style="display: flex; align-items: center; gap: 10px;">%s'
            '<span style="font-family: %s; font-weight: %s; font-size: 17px; letter-spacing: -0.02em;">%s</span></div>'
            '<div style="display: flex; align-items: center; gap: 16px;">%s%s</div></div>'
            % (ds.ink if ds.key != "b" else "transparent", ds.inv_ink if ds.key != "b" else ds.ink,
               ("border-bottom: 3px solid %s;" % ds.ink) if ds.key == "c" else
               ("border-bottom: 1px solid %s;" % ds.line if ds.key == "b" else ""),
               '<span style="width: 10px; height: 20px; background: %s;"></span>' % ds.accent if ds.key == "a" else
               ('<span style="display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; '
                'background: %s; color: %s; font-family: %s; font-size: 13px;">JR</span>' % (ds.accent, ds.ink, ds.f_display)
                if ds.key == "c" else ""),
               ds.f_display, ds.disp_w, "JR IMPORTERS" if ds.key != "b" else "JR.IMPORTERS",
               icon("search", 20, "currentColor", 1.9), icon("bag", 20, "currentColor", 1.9)))


def _m_tabbar(ds):
    items = [("bag", "Shop", True), ("search", "Search", False), ("wrench", "Repairs", False), ("user", "Account", False)]
    cells = "".join(
        '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; '
        'flex-grow: 1; height: 100%%; color: %s;">%s<span style="font-size: 11px; font-weight: %s;">%s</span></div>'
        % (ds.ink if a else ds.muted, icon(ic, 21, "currentColor", 2 if a else 1.7), "700" if a else "500", lbl)
        for ic, lbl, a in items)
    return ('<div style="position: absolute; left: 0; right: 0; bottom: 0; display: flex; height: 74px; background: %s; '
            'border-top: %s;">%s</div>'
            % (ds.panel if ds.key != "b" else "#0d0f12",
               ("3px solid " + ds.ink) if ds.key == "c" else ("1px solid " + ds.line), cells))


def mobile(ds):
    # home
    chips = "".join('<span style="display: inline-flex; align-items: center; height: 38px; padding: 0 15px; border: %s; '
                    'border-radius: %s; background: %s; color: %s; font-size: 13px; font-weight: 600; flex-shrink: 0;">%s</span>'
                    % (("2.5px solid " + ds.ink) if ds.key == "c" else ds.border, ds.r_chip,
                       ds.accent if i == 0 else "transparent", ds.accent_ink if i == 0 else ds.ink, t)
                    for i, t in enumerate(["All phones", "Samsung", "Ulefone", "Tablets"]))
    m_cards = "".join(
        '<div style="display: flex; flex-direction: column; background: %s; border: %s; border-radius: %s; box-shadow: %s; padding: 12px;">'
        '<div style="display: flex; align-items: center; justify-content: center; height: 132px;">%s</div>'
        '<div style="margin-top: 6px; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: %s;">%s</div>'
        '<div style="margin-top: 3px; font-size: 13.5px; font-weight: 600; line-height: 1.25;">%s</div>'
        '<div style="margin-top: 8px;">%s</div>'
        '<div style="margin-top: 10px;">%s</div></div>'
        % (ds.panel, ds.border, ds.r_card, ds.shadow if ds.key == "c" else "none",
           ds.device(60, 116, p["tone"]), ds.muted, p["brand"], p["short"],
           ds.price(money_plain(p["price"]), 17), ds.btn("Add", "buy" if ds.key != "a" else "primary", 44, wide=True, fs=13.5))
        for p in [BY["a26u"], BY["a55"], BY["x13"], BY["a15"]])

    m_hero = ('<div style="padding: 20px 18px 0;">%s%s'
              '<div style="margin-top: 16px;">%s</div></div>'
              % (ds.eyebrow("108 on the shelf · %s" % STORE["city"], ds.accent if ds.key == "b" else ds.muted),
                 ds.disp("Import prices,<br>on a real shelf." if ds.key != "c" else "PHONES AT<br>IMPORT PRICES.",
                         32, "h1", " margin-top: 10px;"),
                 ds.btn("Browse the shelf", "buy" if ds.key != "a" else "primary", 50, wide=True, arrow=True, fs=15)))

    home_m = (_m_header(ds) + m_hero +
              '<div style="display: flex; gap: 8px; padding: 20px 18px 0; overflow: hidden;">%s</div>'
              '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 18px 18px 90px;">%s</div>'
              % (chips, m_cards) + _m_tabbar(ds))

    # product
    p = BY["a26u"]
    buybar = ('<div style="position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center; gap: 12px; '
              'padding: 14px 18px 20px; background: %s; border-top: %s;">'
              '<div style="flex-grow: 1;"><div style="font-size: 11.5px; color: %s;">Total</div>%s</div>%s</div>'
              % (ds.panel if ds.key != "b" else "#0d0f12",
                 ("3px solid " + ds.ink) if ds.key == "c" else ("1px solid " + ds.line),
                 ds.muted, ds.price(money(p["price"]), 21),
                 ds.btn("Add to cart", "buy", 52, icon_name="bag", fs=15)))

    specs_m = "".join(
        '<div style="display: flex; align-items: center; gap: 10px; padding: 11px 0; border-top: 1px solid %s; font-size: 13.5px;">'
        '%s<span style="color: %s; flex-grow: 1;">%s</span><span style="font-weight: 600;">%s</span></div>'
        % (ds.line, icon(ic, 17, ds.muted, 1.8), ds.muted, k, v)
        for ic, k, v in [("screen", "Display", "6.78″ 120Hz"), ("cpu", "Chip", "Dimensity 8200"),
                         ("camera", "Camera", "100MP + thermal"), ("battery", "Battery", "5950mAh")])

    prod_m = (_m_header(ds) +
              '<div style="display: flex; align-items: center; justify-content: center; height: 268px; background: %s;">%s</div>'
              '<div style="padding: 16px 18px 158px;">'
              '<div style="display: flex; align-items: center; justify-content: space-between;">%s%s</div>'
              '<div style="margin-top: 6px; font-family: %s; font-weight: %s; font-size: 24px; letter-spacing: -0.03em;">%s</div>'
              '<div style="margin-top: 10px;">%s</div>'
              '<div style="margin-top: 14px;">%s</div>'
              '<div style="margin-top: 18px; padding: 14px; background: %s; border: %s; border-radius: %s;">'
              '<div style="font-size: 12.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: %s;">Lay-by from</div>'
              '<div style="margin-top: 6px; font-size: 15px;">N$ 2 399,80 deposit, then 6 × N$ 1 599,87</div></div></div>'
              % (ds.media_bg if ds.key != "b" else "transparent", ds.device(136, 244, p["tone"]),
                 ds.eyebrow(p["brand"]), ds.badge("%d in stock" % p["stock"]),
                 ds.f_display, ds.disp_w, p["name"],
                 ds.body(p["blurb"], 14, ds.muted, lh=1.6), specs_m,
                 ds.panel2 if ds.key != "b" else "rgba(163,230,53,0.06)", ds.border, ds.r_card, ds.muted) +
              buybar)

    inner = ('<div style="display: flex; gap: 48px; padding: 48px 44px;">%s%s</div>'
             % (_frame(ds, home_m, "Home"), _frame(ds, prod_m, "Product")))
    return ds.root(inner, width=920)


# ── design system sheet ──────────────────────────────────────────────────
def sheet(ds):
    def block(title, inner, note=None):
        return ('<section style="padding: 34px 0; border-top: 1px solid %s;">'
                '<div style="display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 40px;">'
                '<div>%s%s</div><div>%s</div></div></section>'
                % (ds.line, ds.disp(title, 20), ds.body(note, 13.5, ds.muted, top=8) if note else "", inner))

    swatches = []
    for label, val, hexed in [("Ground", ds.bg, ds.bg), ("Panel", ds.panel, ds.panel),
                              ("Ink", ds.ink, ds.ink), ("Muted", ds.muted, ds.muted),
                              ("Hairline", ds.line, ds.line), ("Accent", ds.accent, ds.accent),
                              ("Accent ink", ds.accent_ink, ds.accent_ink)]:
        swatches.append('<div style="width: 128px;">'
                        '<div style="height: 76px; background: %s; border: %s; border-radius: %s;"></div>'
                        '<div style="margin-top: 8px; font-size: 13px; font-weight: 600;">%s</div>'
                        '<div style="margin-top: 2px; font-family: %s; font-size: 11px; color: %s; word-break: break-all;">%s</div></div>'
                        % (val, ds.border, ds.r_card if ds.key == "b" else "0", label, ds.f_num, ds.muted,
                           hexed if hexed.startswith("#") else hexed.split("(")[0]))

    ramp = "".join('<div style="display: flex; align-items: baseline; gap: 24px; padding: 10px 0; border-top: 1px solid %s;">'
                   '<span style="width: 130px; flex-shrink: 0; font-family: %s; font-size: 11.5px; color: %s;">%s</span>%s</div>'
                   % (ds.line, ds.f_num, ds.muted, spec, sample)
                   for spec, sample in [
                       ("Display / 78", ds.disp("Import prices", 40)),
                       ("Display / 44", ds.disp("Section heading", 30)),
                       ("Body / 17", '<span style="font-size: 17px;">Every handset is sealed, IMEI-checked and warrantied.</span>'),
                       ("Body / 14.5", '<span style="font-size: 14.5px; color: %s;">Courier to all 14 regions, 1–3 working days.</span>' % ds.muted),
                       ("Numerals / 22", ds.price(money(26499), 22)),
                       ("Label / 11", ds.eyebrow("Stock list · updated today"))])

    buttons = ('<div style="display: flex; flex-wrap: wrap; gap: 12px;">%s%s%s%s</div>'
               '<div style="display: flex; flex-wrap: wrap; gap: 12px; margin-top: 14px;">%s%s%s</div>'
               % (ds.btn("Primary action", "primary", 52, arrow=True), ds.btn("Buy / add to cart", "buy", 52, icon_name="bag"),
                  ds.btn("Secondary", "secondary", 52), ds.btn("Ghost", "ghost", 52),
                  ds.btn("Small primary", "primary", 44, fs=14), ds.btn("Small buy", "buy", 44, fs=14),
                  ds.btn("Small ghost", "ghost", 44, fs=14)))

    chips = ('<div style="display: flex; flex-wrap: wrap; gap: 10px;">%s%s%s</div>'
             '<div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px;">%s%s%s%s%s%s</div>'
             % (ds.chip("Selected", True), ds.chip("Samsung", False, 4), ds.chip("N$4 000 – N$10 000"),
                ds.badge("Featured"), ds.badge("Rugged", "plain"), ds.badge("Dispatched", "ink"),
                ds.badge("Ready for collection", "success"), ds.badge("Pending", "warn"), ds.badge("Refunded", "danger")))

    forms = ('<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px;">%s%s%s</div>'
             % (ds.field("Filled", "Johanna Amutenya"), ds.field("Empty", "", "+264 81 ..."),
                ds.field("Town / city", "Swakopmund")))

    anatomy = ('<div style="display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 32px; align-items: start;">'
               '<div>%s</div><div>%s</div></div>'
               % (ds.card_grid([ds.card(BY["a26u"])], 1), ds.spec_table(BY["a26u"]["specs"][:6])))

    tokens = "".join('<div style="display: flex; gap: 16px; padding: 9px 0; border-top: 1px solid %s; font-size: 13.5px;">'
                     '<span style="width: 150px; flex-shrink: 0; color: %s;">%s</span>'
                     '<span style="font-family: %s;">%s</span></div>'
                     % (ds.line, ds.muted, k, ds.f_num, v)
                     for k, v in [("Corner radius", ds.r_card + " cards · " + ds.r_btn + " controls"),
                                  ("Border", ds.border),
                                  ("Elevation", ds.shadow if ds.shadow != "none" else "none — hairlines carry the structure"),
                                  ("Display face", ds.f_display.split(",")[0].strip("'")),
                                  ("Body face", ds.f_body.split(",")[0].strip("'")),
                                  ("Numerals", ds.f_num.split(",")[0].strip("'")),
                                  ("Page gutter", "%dpx" % pad(ds)),
                                  ("Hit target floor", "44px")])

    head = ('<div style="padding: 48px 0 30px;">'
            '<div style="display: flex; align-items: center; gap: 14px;">'
            '<span style="display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; '
            'border-radius: %s; background: %s; color: %s; font-family: %s; font-size: 20px; font-weight: %s;">%s</span>%s</div>%s</div>'
            % ("50%" if ds.key != "c" else "0", ds.accent, ds.accent_ink, ds.f_display, ds.disp_w, ds.letter,
               ds.disp(ds.name if ds.key != "c" else ds.name.upper(), 40, "h1"),
               ds.body(ds.strap + " — the tokens and components every screen in this direction is built from.",
                       16, ds.muted, 640, top=12)))

    body = (head +
            block("Palette", ds.flex(swatches, 16, "flex-start", wrap="wrap"), "Accent is an action surface, never body text.") +
            block("Type", ramp, "Display for headings, body for prose, a separate face for every number.") +
            block("Buttons", buttons, "One primary action per view; buy actions carry the accent.") +
            block("Chips &amp; status", chips, "Order statuses reuse the console's tones.") +
            block("Form controls", forms, "44px minimum on every control.") +
            block("Product card &amp; spec table", anatomy) +
            block("Tokens", tokens))

    return ds.root(wrap(ds, body))


SCREENS = [
    ("home", "Home", home, 1440),
    ("shop", "Catalogue", shop, 1440),
    ("product", "Product", product, 1440),
    ("cart", "Cart", cart, 1440),
    ("checkout", "Checkout", checkout, 1440),
    ("repairs", "Repairs", repairs, 1440),
    ("account", "Account", account, 1440),
    ("mobile", "Mobile", mobile, 920),
    ("sheet", "Design system", sheet, 1440),
]

CAPTIONS = {
    "home": "Live-stock hero off the same catalogue query the grid uses, featured shelf, promises, repairs and lay-by.",
    "shop": "Faceted catalogue: brand, price band, storage and availability, with applied-filter chips and paging.",
    "product": "Buy box with storage/colour, lay-by breakdown, collect-or-courier, full spec table and what's in the box.",
    "cart": "Line items with IMEI-backed stock, VAT-inclusive totals and the 30-minute stock reservation.",
    "checkout": "Four-step flow: details, delivery (collect / courier / local), payment (DPO, EFT, cash, lay-by).",
    "repairs": "Counter booking with the bench checklist, the printed terms verbatim, and live job-card tracking.",
    "account": "Orders with console status tones, active lay-by progress and the job card in the workshop.",
    "mobile": "Home and product at 390×844 — the traffic this shop actually gets.",
    "sheet": "The tokens and components every screen above is assembled from.",
}
