# -*- coding: utf-8 -*-
"""03 · ASK — the shop as one question instead of a catalogue.

There is no browse grid and no category nav. The page opens with a single
question, answers it in plain language, and puts the shortlist in front of you
as comparable rows. Buying is a consequence of the answer, not of browsing.
"""
from kit import P, BY, STORE, money, money_plain, svg, phone

WHITE, MIST, CHALK = "#ffffff", "#f5f5f7", "#ebebef"
INK, MID, SOFT = "#0d0d10", "#66666f", "#a3a3ad"
LINE = "#e3e3e9"
LIME, LIME_SOFT, LIME_DEEP = "#a3e635", "#f2fbe0", "#4d7c0f"
GOOD = "#0f9d58"
FONT = "'Schibsted Grotesk', system-ui, -apple-system, sans-serif"
FONTS = ["Schibsted+Grotesk:wght@400;500;600;700;800"]

W = 1440

# What the shop actually knows about each handset, scored 1-5 so two phones can
# be put side by side without reading a spec sheet.
SCORES = {
    "s24u": dict(battery=3, tough=2, camera=5, value=2, blurb="The best camera we stock, and the price to match."),
    "a26u": dict(battery=4, tough=5, camera=4, value=4, blurb="Survives a building site. Thermal camera is the party trick."),
    "pa18t": dict(battery=5, tough=5, camera=3, value=4, blurb="Two days off-grid, easily. Heavy in a pocket."),
    "a55": dict(battery=4, tough=2, camera=4, value=4, blurb="The sensible one. Nothing about it annoys you."),
    "tab": dict(battery=5, tough=2, camera=1, value=4, blurb="A screen for the whole family, not a phone."),
    "x13": dict(battery=5, tough=5, camera=2, value=5, blurb="Cheapest way to stop breaking phones."),
    "a15": dict(battery=4, tough=2, camera=3, value=5, blurb="What most of Walvis Bay actually buys."),
    "n16p": dict(battery=3, tough=2, camera=3, value=5, blurb="Cheapest handset we will put our name on."),
}
ATTRS = [("battery", "Battery"), ("tough", "Toughness"), ("camera", "Camera"), ("value", "Value")]


def txt(s, size=16, color=INK, weight=400, lh=1.55, ls="0", tag="span", extra="", top=0):
    return ('<%s style="margin: %dpx 0 0; font-family: %s; font-size: %spx; font-weight: %s; line-height: %s; '
            'letter-spacing: %s; color: %s;%s">%s</%s>' % (tag, top, FONT, size, weight, lh, ls, color, extra, s, tag))


def h(s, size=44, color=INK, weight=700, lh=1.06, ls="-0.03em", tag="div", extra="", top=0):
    return txt(s, size, color, weight, lh, ls, tag, extra, top)


def eyebrow(s, color=LIME_DEEP):
    return txt(s, 12.5, color, 700, 1.4, "0.1em", "div", " text-transform: uppercase;")


def pill(s, on=False, h_=44, fs=14.5):
    return ('<span style="display: inline-flex; align-items: center; gap: 8px; height: %dpx; padding: 0 18px; '
            'border-radius: 999px; border: 1px solid %s; background: %s; color: %s; font-family: %s; font-size: %spx; '
            'font-weight: 500; white-space: nowrap;">%s</span>'
            % (h_, LIME_DEEP if on else LINE, LIME_SOFT if on else WHITE, INK, FONT, fs, s))


def button(s, kind="primary", h_=54, wide=False, fs=16, arrow=False):
    styles = {"primary": (LIME, INK, LIME), "quiet": (WHITE, INK, LINE), "dark": (INK, WHITE, INK),
              "soft": (LIME_SOFT, LIME_DEEP, LIME_SOFT)}
    bg, fg, bd = styles[kind]
    return ('<a href="#" style="display: %s; align-items: center; justify-content: center; gap: 10px; height: %dpx; '
            '%spadding: 0 26px; border-radius: 14px; background: %s; color: %s; border: 1px solid %s; font-family: %s; '
            'font-size: %spx; font-weight: 600; text-decoration: none; white-space: nowrap;">%s%s</a>'
            % ("flex" if wide else "inline-flex", h_, "width: 100%; " if wide else "", bg, fg, bd, FONT, fs, s,
               svg("arrow", 17, "currentColor", 2.2) if arrow else ""))


def meter(score, w=104, color=None):
    seg_w = max(9, int((w - 12) / 5.0))
    segs = "".join('<span style="display: inline-block; width: %dpx; height: 7px; border-radius: 4px; background: %s;"></span>'
                   % (seg_w, (color or INK) if i < score else CHALK) for i in range(5))
    return '<span style="display: inline-flex; gap: 3px; flex-shrink: 0;">%s</span>' % segs


def attr_row(key, label_, score, w=104, lw=78):
    return ('<div style="display: flex; align-items: center; gap: 12px; min-width: 0;">'
            '<span style="width: %dpx; flex-shrink: 0; font-size: 13px; color: %s; white-space: nowrap;">%s</span>%s</div>'
            % (lw, MID, label_, meter(score, w)))


def device_chip(p, size=54):
    return ('<div style="display: flex; align-items: center; justify-content: center; width: %dpx; height: %dpx; '
            'flex-shrink: 0; border-radius: 16px; background: %s;">%s</div>'
            % (size + 26, size + 40, MIST, phone(int(size * 0.52), int(size * 1.0), p["tone"])))


def topbar(cart=2):
    return ('<div style="display: flex; align-items: center; justify-content: space-between; height: 68px; '
            'padding: 0 40px; border-bottom: 1px solid %s; background: %s;">'
            '<div style="display: flex; align-items: center; gap: 12px;">'
            '<span style="display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; '
            'border-radius: 9px; background: %s; color: %s; font-size: 13px; font-weight: 800;">JR</span>%s</div>'
            '<div style="display: flex; align-items: center; gap: 10px;">%s%s%s</div></div>'
            % (LINE, WHITE, INK, WHITE,
               txt("JR Importers", 16, INK, 700, ls="-0.01em"),
               pill("Walvis Bay", False, 38, 13.5),
               pill("Repairs", False, 38, 13.5),
               '<span style="display: inline-flex; align-items: center; gap: 9px; height: 38px; padding: 0 16px; '
               'border-radius: 999px; background: %s; color: %s; font-family: %s; font-size: 13.5px; font-weight: 600;">'
               '%s Bag %d</span>' % (INK, WHITE, FONT, svg("bag", 15, "currentColor", 1.9), cart)))


def footer():
    return ('<div style="margin-top: 96px; padding: 44px 40px; border-top: 1px solid %s; background: %s;">'
            '<div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 40px;">'
            '<div style="max-width: 380px;">%s%s</div>'
            '<div style="display: flex; gap: 60px;">%s</div></div></div>'
            % (LINE, MIST,
               txt("JR Importers", 16, INK, 700),
               txt("Imported Samsung and Ulefone handsets, sold off our own shelf at %s and repaired on our own bench."
                   % STORE["address"], 14, MID, lh=1.7, tag="p", top=10),
               "".join('<div><div style="font-size: 12.5px; font-weight: 700; text-transform: uppercase; '
                       'letter-spacing: 0.1em; color: %s;">%s</div>'
                       '<div style="display: flex; flex-direction: column; gap: 10px; margin-top: 14px;">%s</div></div>'
                       % (SOFT, title, "".join(txt(i, 14, MID, tag="div") for i in items))
                       for title, items in [("Shop", ["Ask", "Everything", "Lay-by", "Track an order"]),
                                            ("Counter", ["Book a repair", "Job card", "Warranty"]),
                                            ("Visit", [STORE["address"], STORE["phone"], STORE["hours"]])])))


def page(inner, width=W, bg=WHITE):
    return ('<div style="width: %dpx; background: %s; color: %s; font-family: %s;">%s</div>' % (width, bg, INK, FONT, inner))


def ask():
    chips = "".join('<span style="margin: 0 8px 10px 0; display: inline-block;">%s</span>' % pill(c)
                    for c in ["Rugged, for site work", "Biggest battery", "Under N$ 4 000", "Best camera",
                              "For my mother", "Something that lasts 3 years"])

    field = ('<div style="display: flex; align-items: center; gap: 14px; height: 84px; padding: 0 12px 0 26px; '
             'border: 2px solid %s; border-radius: 22px; background: %s; box-shadow: 0 20px 50px -30px rgba(101,163,13,0.55);">'
             '<span style="flex-shrink: 0;">%s</span>'
             '<span style="flex-grow: 1; font-size: 21px; color: %s;">A tough phone under N$ 5 000 that lasts two days'
             '<span style="display: inline-block; width: 2px; height: 22px; background: %s; margin-left: 3px; '
             'transform: translateY(4px);"></span></span>%s</div>'
             % (LIME_DEEP, WHITE, svg("sparkle", 22, LIME_DEEP, 2), INK, LIME,
                button("Ask", "primary", 60, fs=16, arrow=True)))

    scales = "".join(
        '<div style="padding: 26px; border: 1px solid %s; border-radius: 20px; background: %s;">'
        '<div style="display: flex; align-items: center; justify-content: space-between;">%s%s</div>'
        '<div style="margin-top: 18px; position: relative; height: 6px; border-radius: 3px; background: %s;">'
        '<div style="position: absolute; left: 0; top: 0; bottom: 0; width: %d%%; border-radius: 3px; background: %s;"></div>'
        '<div style="position: absolute; left: %d%%; top: -7px; width: 20px; height: 20px; margin-left: -10px; '
        'border-radius: 50%%; background: %s; border: 3px solid %s; box-shadow: 0 2px 8px rgba(13,13,16,0.2);"></div></div>'
        '<div style="display: flex; justify-content: space-between; margin-top: 12px;">%s%s</div></div>'
        % (LINE, WHITE, txt(title, 17, INK, 600), txt(val, 15, LIME_DEEP, 700), CHALK, pct, LIME, pct, WHITE, LIME_DEEP,
           txt(lo, 12.5, SOFT), txt(hi, 12.5, SOFT))
        for title, val, pct, lo, hi in [("Budget", "N$ 5 000", 34, "N$ 2 799", "N$ 26 499"),
                                        ("Battery life", "2 days", 70, "A day", "3 days +"),
                                        ("Toughness", "Site-proof", 88, "Careful", "Drop it"),
                                        ("Camera", "Good enough", 45, "Calls only", "Everything")])

    counter = "".join(
        '<div style="display: flex; gap: 16px; padding: 24px 0; border-top: 1px solid %s;">'
        '<span style="display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; '
        'flex-shrink: 0; border-radius: 12px; background: %s; color: %s;">%s</span>'
        '<div>%s%s</div></div>'
        % (LINE, LIME_SOFT, LIME_DEEP, svg(ic, 19, "currentColor", 2), txt(t_, 16, INK, 600, tag="div"),
           txt(d_, 14.5, MID, lh=1.65, tag="div", top=6))
        for ic, t_, d_ in [
            ("shield", "We only answer for stock we hold",
             "Every phone below is in the building at %s, with its IMEI logged against the till." % STORE["address"]),
            ("wrench", "The people answering also fix them",
             "Which handsets come back to our bench is the most useful thing we know, and it shapes these answers."),
            ("truck", "Collect today, or couriered in 1–3 days",
             "All 14 regions. Reserve a unit and it is held for thirty minutes.")])

    hero = ('<section style="padding: 92px 40px 0;">'
            '<div style="max-width: 880px; margin: 0 auto; text-align: center;">%s%s%s'
            '<div style="margin-top: 40px; text-align: left;">%s</div>'
            '<div style="margin-top: 22px;">%s</div></div></section>'
            % (eyebrow("Tell us what it is for"),
               h("What do you<br>need it to do?", 74, INK, 800, 1.02, "-0.04em", extra=" margin-top: 20px;"),
               txt("Not what brand, not how many megapixels. Describe the job and we will tell you which of the "
                   "handsets on our shelf can do it — and which cannot.",
                   19, MID, lh=1.65, tag="p", top=22,
                   extra=" max-width: 640px; margin-left: auto; margin-right: auto;"),
               field, chips))

    return page(topbar() + hero +
                '<section style="max-width: 1100px; margin: 92px auto 0; padding: 0 40px;">'
                '<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 30px;">'
                '<div>%s%s</div>%s</div>'
                '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 28px;">%s</div>'
                '</section>'
                '<section style="max-width: 1100px; margin: 96px auto 0; padding: 0 40px;">'
                '<div style="display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 60px;">'
                '<div>%s%s</div><div>%s</div></div></section>'
                % (h("Or move the sliders", 34, INK, 700),
                   txt("Four things decide it. Everything else is noise.", 16, MID, tag="div", top=10),
                   button("Skip — show me everything", "quiet", 48, fs=15),
                   scales,
                   h("Answered by the counter,<br>not by a catalogue", 34, INK, 700),
                   txt("The same people who ring up the sale and replace the screen.", 16, MID, lh=1.6, tag="p", top=14),
                   counter) + footer())


def result_row(pid, rank, picked=False):
    p, s = BY[pid], SCORES[pid]
    return ('<div style="display: flex; align-items: center; gap: 26px; padding: 24px 26px; border: 1px solid %s; '
            'border-radius: 20px; background: %s; margin-bottom: 14px;">'
            '<div style="width: 34px; flex-shrink: 0;">%s</div>%s'
            '<div style="flex: 1 1 0; min-width: 200px;">%s%s%s</div>'
            '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 22px; '
            'width: 360px; flex-shrink: 0;">%s</div>'
            '<div style="width: 170px; flex-shrink: 0; text-align: right;">%s%s</div>'
            '<div style="width: 132px; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px;">%s%s</div></div>'
            % (LIME_DEEP if picked else LINE, LIME_SOFT if picked else WHITE,
               txt("%02d" % rank, 15, LIME_DEEP if picked else SOFT, 700),
               device_chip(p),
               txt(p["brand"], 12.5, SOFT, 600, ls="0.08em", tag="div", extra=" text-transform: uppercase;"),
               txt(p["name"], 20, INK, 700, 1.2, "-0.02em", "div", top=4),
               txt(s["blurb"], 14, MID, lh=1.55, tag="div", top=8),
               "".join(attr_row(k, lab, s[k], 76) for k, lab in ATTRS),
               txt(money(p["price"]), 25, INK, 700, 1, "-0.02em", "div"),
               txt("%d on the shelf" % p["stock"], 13, GOOD, 600, tag="div", top=6),
               button("Add to bag", "primary" if picked else "quiet", 44, wide=True, fs=14),
               '<span style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; '
               'border-radius: 12px; border: 1px solid %s; color: %s; font-size: 13.5px; font-weight: 600;">'
               '<span style="display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; '
               'border-radius: 5px; border: 1px solid %s; background: %s;">%s</span>Compare</span>'
               % (LINE, MID, LIME_DEEP if picked else LINE, LIME if picked else WHITE,
                  svg("check", 11, INK, 3.4) if picked else "")))


def shortlist():
    answer = ('<div style="padding: 34px 36px; border-radius: 24px; background: %s; border: 1px solid %s;">'
              '<div style="display: flex; gap: 16px;">'
              '<span style="display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; '
              'flex-shrink: 0; border-radius: 12px; background: %s; color: %s;">%s</span>'
              '<div style="flex-grow: 1;">%s%s'
              '<div style="display: flex; gap: 10px; margin-top: 20px;">%s%s</div></div></div></div>'
              % (LIME_SOFT, LIME_SOFT, LIME, INK, svg("sparkle", 20, "currentColor", 2.2),
                 h("Two of ours will do it. One of them we would not sell you.", 27, INK, 700, 1.25, "-0.02em"),
                 txt("Under N$ 5 000, only three handsets on the shelf are rated for site work. The Armor X13 is the "
                     "one we would hand you — it is the cheapest way to stop breaking phones, and we see the fewest "
                     "of them back on the bench. The Power Armor 18T runs two full days but it is 460 grams and over "
                     "budget. The Note 16 Pro is in budget and is not a rugged phone, whatever the case says.",
                     17, MID, lh=1.75, tag="p", top=14),
                 button("Compare the top three", "dark", 46, fs=14.5),
                 button("Change the question", "quiet", 46, fs=14.5)))

    query = ('<div style="display: flex; align-items: center; gap: 14px; height: 66px; padding: 0 12px 0 24px; '
             'border: 1px solid %s; border-radius: 18px; background: %s;">%s'
             '<span style="flex-grow: 1; font-size: 17px; color: %s;">A tough phone under N$ 5 000 that lasts two days</span>'
             '%s</div>' % (LINE, MIST, svg("sparkle", 19, LIME_DEEP, 2), INK, button("Edit", "quiet", 44, fs=14)))

    filters = ('<div style="display: flex; align-items: center; gap: 10px; margin-top: 24px; flex-wrap: wrap;">%s</div>'
               % "".join(pill(c, on, 40, 14) for c, on in
                         [("Rugged", True), ("Under N$ 5 000", True), ("2-day battery", True),
                          ("In stock", True), ("+ Add a condition", False)]))

    rows = (result_row("x13", 1, True) + result_row("pa18t", 2) + result_row("n16p", 3) +
            result_row("a15", 4) + result_row("a26u", 5))

    tray = ('<div style="margin-top: 26px; padding: 18px 26px; border-radius: 20px; '
            'background: %s; color: %s; display: flex; align-items: center; gap: 22px;">'
            '%s<div style="display: flex; gap: 10px; flex-grow: 1;">%s</div>%s</div>'
            % (INK, WHITE, txt("Comparing", 15, "rgba(255,255,255,0.6)", 600),
               "".join('<span style="display: inline-flex; align-items: center; gap: 10px; height: 44px; padding: 0 16px; '
                       'border-radius: 12px; background: %s; font-size: 14px; font-weight: 600; color: %s;">%s'
                       '<span style="color: rgba(255,255,255,0.45);">x</span></span>'
                       % ("rgba(255,255,255,0.10)", WHITE, nm)
                       for nm in ["Armor X13", "Power Armor 18T"]) +
               '<span style="display: inline-flex; align-items: center; height: 44px; padding: 0 16px; border-radius: 12px; '
               'border: 1px dashed rgba(255,255,255,0.28); font-size: 14px; color: rgba(255,255,255,0.5);">Add a third</span>',
               button("Compare", "primary", 46, fs=15, arrow=True)))

    return page(topbar() +
                '<section style="max-width: 1300px; margin: 0 auto; padding: 34px 40px 0;">%s%s'
                '<div style="margin-top: 26px;">%s</div>'
                '<div style="display: flex; align-items: baseline; justify-content: space-between; margin-top: 40px;">%s%s</div>'
                '<div style="margin-top: 20px;">%s</div>%s</section>'
                % (query, filters, answer,
                   h("Five that match", 30, INK, 700),
                   txt("Sorted by how well they answer the question, not by price.", 15, MID),
                   rows, tray) + footer())


def compare():
    ids = ["x13", "pa18t", "n16p"]
    cols = [BY[i] for i in ids]

    def headcell(p, best=False):
        return ('<div style="padding: 26px; border-radius: 20px; border: 1px solid %s; background: %s;">'
                '<div style="display: flex; align-items: center; justify-content: space-between;">%s%s</div>'
                '<div style="display: flex; justify-content: center; padding: 18px 0 14px;">%s</div>'
                '%s%s<div style="margin-top: 18px;">%s</div></div>'
                % (LIME_DEEP if best else LINE, LIME_SOFT if best else WHITE,
                   txt(p["brand"], 12.5, SOFT, 600, ls="0.08em", tag="div", extra=" text-transform: uppercase;"),
                   ('<span style="display: inline-flex; align-items: center; height: 24px; padding: 0 10px; '
                    'border-radius: 999px; background: %s; color: %s; font-size: 11.5px; font-weight: 700;">OUR PICK</span>'
                    % (LIME, INK)) if best else "",
                   phone(74, 144, p["tone"]),
                   txt(p["name"], 22, INK, 700, 1.2, "-0.02em", "div"),
                   txt(money(p["price"]), 26, INK, 700, 1.2, "-0.02em", "div", top=10),
                   button("Add to bag", "primary" if best else "quiet", 46, wide=True, fs=14.5)))

    def cmprow(label_, values, note=None):
        cells = "".join('<div style="padding: 18px 26px; %s">%s</div>'
                        % ("border-left: 1px solid %s;" % LINE if i else "", v)
                        for i, v in enumerate(values))
        return ('<div style="display: grid; grid-template-columns: 220px repeat(3, minmax(0, 1fr)); '
                'border-top: 1px solid %s;">'
                '<div style="padding: 18px 0;">%s%s</div>%s</div>'
                % (LINE, txt(label_, 15, INK, 600, tag="div"),
                   txt(note, 13, SOFT, lh=1.5, tag="div", top=4) if note else "", cells))

    def m(pid, key):
        return ('<span style="display: inline-flex; align-items: center; gap: 12px;">%s%s</span>'
                % (meter(SCORES[pid][key], 104), txt("%d/5" % SCORES[pid][key], 13.5, MID, 600)))

    rows = "".join([
        cmprow("Verdict", [txt(SCORES[i]["blurb"], 14.5, MID, lh=1.6) for i in ids]),
        cmprow("Battery", [m(i, "battery") for i in ids], "Real days, not milliamp-hours"),
        cmprow("Toughness", [m(i, "tough") for i in ids], "How it survives a site"),
        cmprow("Camera", [m(i, "camera") for i in ids]),
        cmprow("Value", [m(i, "value") for i in ids], "What you get for the money here"),
        cmprow("Battery cell", [txt(BY[i]["specs"][3][1], 15, INK, 600) for i in ids]),
        cmprow("Memory", [txt(BY[i]["specs"][2][1], 15, INK, 600) for i in ids]),
        cmprow("Weight", [txt(BY[i]["specs"][7][1], 15, INK, 600) for i in ids]),
        cmprow("Sealing", [txt(v, 15, INK, 600) for v in ["IP68 / IP69K", "IP68 / IP69K", "None — it is not rugged"]]),
        cmprow("On the shelf", [txt("%d units" % BY[i]["stock"], 15, GOOD, 700) for i in ids]),
        cmprow("Lay-by from", [txt(money(BY[i]["price"] * 0.2), 15, INK, 600) for i in ids], "20% down, six months"),
        cmprow("Back on our bench", [txt(v, 14.5, MID, lh=1.6) for v in
                                     ["Rarely — 2 in the last year", "Rarely — 1 in the last year",
                                      "Screens, mostly. It is a normal phone."]],
               "The number nobody else will show you"),
    ])

    return page(topbar() +
                '<section style="max-width: 1280px; margin: 0 auto; padding: 36px 40px 0;">'
                '<div style="display: flex; align-items: baseline; justify-content: space-between;">%s%s</div>'
                '<div style="display: grid; grid-template-columns: 220px repeat(3, minmax(0, 1fr)); gap: 0; '
                'align-items: end; margin-top: 26px;">'
                '<div style="padding-right: 26px;">%s%s</div>'
                '<div style="padding: 0 8px;">%s</div><div style="padding: 0 8px;">%s</div><div style="padding: 0 8px;">%s</div></div>'
                '<div style="margin-top: 26px;">%s</div>'
                '<div style="display: flex; gap: 12px; margin-top: 30px;">%s%s</div></section>'
                % (h("Three, side by side", 34, INK, 700),
                   txt("For: a tough phone under N$ 5 000 that lasts two days", 15, MID),
                   txt("What actually differs", 15, INK, 700, tag="div"),
                   txt("Scores are ours, from what comes back to the bench — not the manufacturer's.",
                       13.5, SOFT, lh=1.55, tag="div", top=8),
                   headcell(cols[0], True), headcell(cols[1]), headcell(cols[2]),
                   rows,
                   button("Back to the shortlist", "quiet", 50, fs=15),
                   button("Ask a different question", "quiet", 50, fs=15)) + footer())


def product():
    p, s = BY["x13"], SCORES["x13"]
    verdict = ('<div style="padding: 30px 34px; border-radius: 22px; background: %s;">%s%s</div>'
               % (LIME_SOFT,
                  h("Why we would hand you this one", 22, INK, 700, 1.3, "-0.02em"),
                  txt("It is the cheapest handset on our shelf that genuinely survives a site — IP68 and IP69K, a "
                      "6320mAh cell that gets through two days, and a body that has come back to our bench twice in "
                      "a year. You give up the camera. If you take photographs that matter, buy the A55 instead and "
                      "put it in a case.", 16.5, MID, lh=1.75, tag="p", top=12)))

    meters = "".join('<div style="display: flex; align-items: center; justify-content: space-between; gap: 20px; '
                     'padding: 14px 0; border-bottom: 1px solid %s;">%s'
                     '<span style="display: inline-flex; align-items: center; gap: 14px;">%s%s</span></div>'
                     % (LINE, txt(lab, 15.5, INK, 500), meter(s[k], 132), txt("%d/5" % s[k], 13.5, MID, 600))
                     for k, lab in ATTRS)

    specs = "".join('<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 20px; '
                    'padding: 13px 0; border-bottom: 1px solid %s;">%s%s</div>'
                    % (LINE, txt(k, 14.5, MID), txt(v, 14.5, INK, 600)) for k, v in p["specs"])

    buy = ('<div style="padding: 28px; border: 1px solid %s; border-radius: 22px; position: relative;">'
           '<div style="display: flex; align-items: baseline; justify-content: space-between;">%s%s</div>'
           '%s<div style="margin-top: 20px;">%s</div><div style="margin-top: 10px;">%s</div>'
           '<div style="margin-top: 22px; padding-top: 20px; border-top: 1px solid %s;">%s%s</div></div>'
           % (LINE, txt(money(p["price"]), 38, INK, 700, 1, "-0.03em"),
              txt("VAT included", 13.5, SOFT),
              txt("%d on the shelf at %s · reserved for 30 minutes when you check out"
                  % (p["stock"], STORE["address"]), 14, GOOD, 600, lh=1.6, tag="div", top=10),
              button("Add to bag", "primary", 56, wide=True, fs=16.5),
              button("Reserve for collection today", "quiet", 50, wide=True, fs=15),
              LINE,
              txt("Lay-by", 13, SOFT, 700, ls="0.1em", tag="div", extra=" text-transform: uppercase;"),
              txt("%s down, then six payments of %s. The unit is held with its IMEI against your name."
                  % (money(p["price"] * 0.2), money(p["price"] * 0.8 / 6)), 14.5, MID, lh=1.65, tag="p", top=8)))

    return page(topbar() +
                '<section style="max-width: 1180px; margin: 0 auto; padding: 30px 40px 0;">'
                '<div style="display: flex; align-items: center; gap: 10px;">%s%s%s</div>'
                '<div style="display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 56px; margin-top: 24px;">'
                '<div>%s%s%s<div style="margin-top: 34px;">%s</div>'
                '<div style="margin-top: 34px;">%s<div style="margin-top: 10px;">%s</div></div>'
                '<div style="margin-top: 34px;">%s<div style="margin-top: 6px;">%s</div></div></div>'
                '<div>%s<div style="margin-top: 20px;">%s</div></div></div></section>'
                % (txt("Shortlist", 13.5, MID), svg("chevron", 14, SOFT, 2), txt(p["name"], 13.5, INK, 600),
                   txt(p["brand"], 13, SOFT, 700, ls="0.1em", tag="div", extra=" text-transform: uppercase;"),
                   h(p["name"], 52, INK, 800, 1.05, "-0.035em", extra=" margin-top: 10px;"),
                   txt(p["blurb"], 19, MID, lh=1.7, tag="p", top=16, extra=" max-width: 620px;"),
                   verdict,
                   txt("How it scores", 17, INK, 700, tag="div"), meters,
                   txt("Everything else", 17, INK, 700, tag="div"), specs,
                   '<div style="display: flex; align-items: center; justify-content: center; height: 420px; '
                   'border-radius: 22px; background: %s;">%s</div>' % (MIST, phone(150, 292, p["tone"])),
                   buy) + footer())


def checkout():
    def block(n, title, inner, open_=True, done=False):
        return ('<div style="padding: 26px 28px; border: 1px solid %s; border-radius: 20px; margin-bottom: 14px; background: %s;">'
                '<div style="display: flex; align-items: center; gap: 14px;">'
                '<span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; '
                'border-radius: 9px; background: %s; color: %s; font-size: 13.5px; font-weight: 700;">%s</span>%s%s</div>%s</div>'
                % (LIME_DEEP if open_ else LINE, WHITE,
                   GOOD if done else (LIME if open_ else CHALK), WHITE if done else (INK if open_ else MID),
                   svg("check", 15, "currentColor", 3) if done else str(n),
                   txt(title, 19, INK, 700, 1.2, "-0.02em"),
                   '<span style="margin-left: auto;">%s</span>' % txt("Change", 14, LIME_DEEP, 600) if done else "",
                   '<div style="margin-top: 22px;">%s</div>' % inner if open_ else ""))

    def field(lab, val, w=None):
        return ('<label style="display: flex; flex-direction: column; gap: 8px;%s">%s'
                '<span style="display: flex; align-items: center; height: 54px; padding: 0 16px; border: 1px solid %s; '
                'border-radius: 13px; font-size: 16px; color: %s;">%s</span></label>'
                % ((" width: %dpx;" % w) if w else "", txt(lab, 13.5, MID, 500), LINE, INK, val))

    def opt(title, detail, price, on=False):
        return ('<label style="display: flex; align-items: center; gap: 16px; padding: 18px 20px; border: 1px solid %s; '
                'border-radius: 16px; background: %s; margin-bottom: 10px;">'
                '<span style="display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; '
                'flex-shrink: 0; border-radius: 50%%; border: 1.5px solid %s; background: %s;">%s</span>'
                '<div style="flex-grow: 1;">%s%s</div>%s</label>'
                % (LIME_DEEP if on else LINE, LIME_SOFT if on else WHITE, LIME_DEEP if on else LINE,
                   LIME if on else WHITE,
                   '<span style="width: 7px; height: 7px; border-radius: 50%%; background: %s;"></span>' % INK if on else "",
                   txt(title, 16, INK, 600, tag="div"), txt(detail, 13.5, MID, tag="div", top=4),
                   txt(price, 15.5, INK, 600)))

    lines = "".join(
        '<div style="display: flex; align-items: center; gap: 14px; padding: 14px 0; border-bottom: 1px solid %s;">'
        '<div style="display: flex; align-items: center; justify-content: center; width: 52px; height: 62px; flex-shrink: 0; '
        'border-radius: 12px; background: %s;">%s</div>'
        '<div style="flex-grow: 1; min-width: 0;">%s%s</div>%s</div>'
        % (LINE, MIST, phone(24, 46, p["tone"]),
           txt(p["name"], 15, INK, 600, 1.3, tag="div"), txt("Qty %d" % q, 13, SOFT, tag="div", top=3),
           txt(money(p["price"] * q), 15, INK, 600))
        for p, q in [(BY["x13"], 1), (BY["a15"], 2)])

    def line(k, v, strong=False):
        return ('<div style="display: flex; align-items: baseline; justify-content: space-between; padding: 8px 0;">'
                '%s%s</div>' % (txt(k, 16 if strong else 14.5, INK if strong else MID, 700 if strong else 400),
                                txt(v, 20 if strong else 14.5, INK, 700 if strong else 500)))

    summary = ('<div style="padding: 26px; border-radius: 22px; background: %s;">%s%s'
               '<div style="margin-top: 16px; padding-top: 14px; border-top: 1px solid %s;">%s%s%s</div>'
               '<div style="margin-top: 10px; padding-top: 14px; border-top: 1px solid %s;">%s</div>'
               '<div style="margin-top: 20px;">%s</div>'
               '<div style="display: flex; gap: 10px; margin-top: 18px;">%s'
               '<span style="font-size: 13px; line-height: 1.6; color: %s;">Your units are held for '
               '<strong style="color: %s;">28:14</strong>. IMEIs are printed on the invoice when payment clears.</span></div></div>'
               % (MIST, txt("Your bag", 17, INK, 700, tag="div"), lines, LINE,
                  line("Subtotal", money(11497)), line("Courier · nationwide", money(150)),
                  line("VAT 15% included", money(1519.17)), LINE,
                  line("Total", money(11647), True),
                  button("Pay " + money(11647), "primary", 56, wide=True, fs=16.5),
                  svg("clock", 15, MID, 2), MID, INK))

    return page(topbar() +
                '<section style="max-width: 1180px; margin: 0 auto; padding: 34px 40px 0;">%s'
                '<div style="display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 48px; margin-top: 26px;">'
                '<div>%s%s%s</div><div>%s</div></div></section>'
                % (h("Nearly done", 40, INK, 800, 1.05, "-0.03em"),
                   block(1, "Who is it for?",
                         '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px;">%s%s%s%s</div>'
                         % (field("Full name", "Johanna Amutenya"), field("Mobile", "+264 81 234 5678"),
                            field("Email", "johanna@example.na"), field("Town", "Swakopmund")), True, False),
                   block(2, "How should it reach you?",
                         opt("Collect at " + STORE["address"], "Ready within the hour · " + STORE["hours"], "Free") +
                         opt("Courier — nationwide", "1–3 working days, all 14 regions", money(150), True) +
                         opt("Local delivery — " + STORE["city"], "Same day if ordered before 14:00", money(60))),
                   block(3, "How are you paying?",
                         opt("Card online (DPO)", "Visa, Mastercard · 3D Secure", "Now", True) +
                         opt("EFT / bank transfer", "Ships once the payment reflects", "1–2 days") +
                         opt("Cash on collection", "Pay at the counter", "At counter") +
                         opt("Lay-by", "20% deposit, balance over six months", money(2329.4))),
                   summary) + footer())


def mobile():
    def frame(inner, cap):
        return ('<div><div style="margin-bottom: 12px;">%s</div>'
                '<div style="position: relative; width: 390px; height: 844px; overflow: hidden; background: %s; '
                'border-radius: 30px; border: 1px solid %s; box-shadow: 0 30px 60px -34px rgba(13,13,16,0.35);">%s</div></div>'
                % (txt(cap, 12.5, MID, 700, ls="0.14em", tag="div", extra=" text-transform: uppercase;"),
                   WHITE, LINE, inner))

    m_top = ('<div style="display: flex; align-items: center; justify-content: space-between; height: 60px; '
             'padding: 0 18px; border-bottom: 1px solid %s;">'
             '<div style="display: flex; align-items: center; gap: 10px;">'
             '<span style="display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; '
             'border-radius: 8px; background: %s; color: %s; font-size: 11.5px; font-weight: 800;">JR</span>%s</div>%s</div>'
             % (LINE, INK, WHITE, txt("JR Importers", 15, INK, 700),
                '<span style="display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 13px; '
                'border-radius: 999px; background: %s; color: %s; font-size: 13px; font-weight: 600;">%s 2</span>'
                % (INK, WHITE, svg("bag", 14, "currentColor", 1.9))))

    ask_m = (m_top +
             '<div style="padding: 30px 20px 0;">%s%s'
             '<div style="margin-top: 22px; padding: 16px 18px; border: 2px solid %s; border-radius: 18px;">%s'
             '<div style="margin-top: 14px;">%s</div></div>'
             '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px;">%s</div>'
             '<div style="margin-top: 28px;">%s</div></div>'
             % (eyebrow("Tell us what it is for"),
                h("What do you<br>need it to do?", 36, INK, 800, 1.05, "-0.035em", extra=" margin-top: 12px;"),
                LIME_DEEP,
                txt("A tough phone under N$ 5 000 that lasts two days", 16.5, INK, 400, lh=1.5, tag="div"),
                button("Ask", "primary", 50, wide=True, fs=15.5, arrow=True),
                "".join(pill(c, False, 38, 13) for c in ["Rugged", "Big battery", "Under N$ 4 000", "Best camera"]),
                "".join('<div style="display: flex; gap: 12px; padding: 14px 0; border-top: 1px solid %s;">'
                        '<span style="display: inline-flex; align-items: center; justify-content: center; width: 34px; '
                        'height: 34px; flex-shrink: 0; border-radius: 10px; background: %s; color: %s;">%s</span>'
                        '<div>%s%s</div></div>'
                        % (LINE, LIME_SOFT, LIME_DEEP, svg(ic, 16, "currentColor", 2),
                           txt(t_, 14.5, INK, 600, tag="div"), txt(d_, 13, MID, lh=1.55, tag="div", top=3))
                        for ic, t_, d_ in [("shield", "Only stock we hold", "108 units in the building right now"),
                                           ("wrench", "The people who fix them answer", "Which ones come back shapes the answer"),
                                           ("truck", "Collect today or courier", "1–3 days, all 14 regions")])))

    def m_row(pid, rank, on=False):
        p, sc = BY[pid], SCORES[pid]
        return ('<div style="padding: 16px; border: 1px solid %s; border-radius: 18px; background: %s; margin-bottom: 12px;">'
                '<div style="display: flex; gap: 14px;">'
                '<div style="display: flex; align-items: center; justify-content: center; width: 62px; height: 74px; '
                'flex-shrink: 0; border-radius: 14px; background: %s;">%s</div>'
                '<div style="flex-grow: 1; min-width: 0;">'
                '<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 10px;">%s%s</div>'
                '%s<div style="display: flex; align-items: center; gap: 10px; margin-top: 10px;">%s%s</div></div></div>'
                '<div style="display: flex; align-items: center; gap: 10px; margin-top: 14px;">%s%s</div></div>'
                % (LIME_DEEP if on else LINE, LIME_SOFT if on else WHITE, MIST, phone(30, 58, p["tone"]),
                   txt(p["name"], 16.5, INK, 700, 1.25, "-0.01em"),
                   txt(money_plain(p["price"]), 16.5, INK, 700),
                   txt(sc["blurb"], 13, MID, lh=1.5, tag="div", top=6),
                   meter(sc["tough"], 62), txt("%d on the shelf" % p["stock"], 12.5, GOOD, 600),
                   '<div style="flex-grow: 1;">%s</div>' % button("Add to bag", "primary" if on else "quiet", 44, wide=True, fs=14),
                   '<span style="display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; '
                   'border-radius: 12px; border: 1px solid %s; color: %s;">%s</span>'
                   % (LINE, MID, svg("plus", 16, "currentColor", 2))))

    list_m = (m_top +
              '<div style="padding: 16px 18px 0;">'
              '<div style="display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-radius: 14px; background: %s;">'
              '%s<span style="flex-grow: 1; font-size: 14px; color: %s;">Tough, under N$ 5 000, 2 days</span>%s</div>'
              '<div style="margin-top: 16px; padding: 18px; border-radius: 18px; background: %s;">%s%s</div>'
              '<div style="display: flex; align-items: baseline; justify-content: space-between; margin-top: 22px;">%s%s</div>'
              '<div style="margin-top: 14px;">%s%s%s</div></div>'
              % (MIST, svg("sparkle", 16, LIME_DEEP, 2), INK, txt("Edit", 13.5, LIME_DEEP, 600),
                 LIME_SOFT,
                 txt("Two of ours will do it.", 19, INK, 700, 1.3, "-0.02em", tag="div"),
                 txt("The Armor X13 is the one we would hand you — cheapest way to stop breaking phones, and we see "
                     "the fewest of them back on the bench.", 14, MID, lh=1.6, tag="p", top=8),
                 txt("Five that match", 18, INK, 700), txt("Best first", 13, SOFT),
                 m_row("x13", 1, True), m_row("pa18t", 2), m_row("n16p", 3)))

    return page('<div style="display: flex; gap: 48px; padding: 46px;">%s%s</div>'
                % (frame(ask_m, "Ask"), frame(list_m, "Shortlist")), width=920, bg=MIST)


def system():
    sw = "".join('<div style="flex: 1 1 0;"><div style="height: 78px; border-radius: 14px; background: %s; border: 1px solid %s;"></div>'
                 '%s%s</div>'
                 % (val, LINE, txt(nm, 13.5, INK, 600, tag="div", top=10), txt(val, 12, SOFT, tag="div", top=2))
                 for nm, val in [("White", WHITE), ("Mist", MIST), ("Chalk", CHALK), ("Line", LINE),
                                 ("Ink", INK), ("Mid", MID), ("Lime", LIME), ("Lime soft", LIME_SOFT),
                                 ("Lime deep", LIME_DEEP), ("Good", GOOD)])

    ramp = "".join('<div style="display: flex; align-items: baseline; gap: 26px; padding: 14px 0; border-top: 1px solid %s;">'
                   '<span style="width: 200px; flex-shrink: 0; font-size: 12.5px; font-weight: 600; color: %s; '
                   'text-transform: uppercase; letter-spacing: 0.1em;">%s</span>%s</div>'
                   % (LINE, SOFT, spec, sample)
                   for spec, sample in [
                       ("Ask · 74 · 800", h("What do you need it to do?", 40, INK, 800, 1.05, "-0.04em")),
                       ("Section · 34 · 700", h("Five that match", 30, INK, 700)),
                       ("Product · 20 · 700", txt("Ulefone Armor X13", 20, INK, 700)),
                       ("Body · 16.5", txt("The cheapest way to stop breaking phones.", 16.5, MID)),
                       ("Price · 25 · 700", txt(money(4499), 25, INK, 700)),
                       ("Label · 12.5 · 700", eyebrow("Tell us what it is for"))])

    return page(topbar() +
                '<section style="max-width: 1100px; margin: 0 auto; padding: 46px 40px 0;">%s%s%s'
                '<div style="margin-top: 54px;">%s<div style="display: flex; gap: 12px; margin-top: 18px;">%s</div></div>'
                '<div style="margin-top: 54px;">%s<div style="margin-top: 10px;">%s</div></div>'
                '<div style="margin-top: 54px;">%s%s'
                '<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 20px;">%s%s%s%s</div></div>'
                '<div style="margin-top: 54px;">%s%s'
                '<div style="display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px;">%s%s%s%s%s</div></div>'
                '<div style="margin-top: 54px;">%s%s</div></section>'
                % (eyebrow("Direction 03"),
                   h("Ask", 76, INK, 800, 1, "-0.04em", extra=" margin-top: 14px;"),
                   txt("One question instead of a catalogue. There is no browse grid, no category nav and no hero "
                       "with a button — the page asks what the phone is for, answers in plain language, and puts the "
                       "shortlist in front of you as rows you can actually compare.",
                       18, MID, lh=1.7, tag="p", top=18, extra=" max-width: 660px;"),
                   h("Palette", 28, INK, 700), sw,
                   h("Type — Schibsted Grotesk", 28, INK, 700), ramp,
                   h("Meters", 28, INK, 700),
                   txt("Four scores, ours, from what comes back to the bench. They are the only comparison a "
                       "customer needs before the spec sheet.", 15.5, MID, lh=1.65, tag="p", top=10,
                       extra=" max-width: 620px;"),
                   attr_row("battery", "Battery", 5, 132), attr_row("tough", "Toughness", 5, 132),
                   attr_row("camera", "Camera", 2, 132), attr_row("value", "Value", 5, 132),
                   h("Controls", 28, INK, 700),
                   txt("44px minimum on everything, 14px radius, one accent.", 15.5, MID, tag="p", top=10),
                   button("Primary", "primary", 54), button("Quiet", "quiet", 54), button("Dark", "dark", 54),
                   pill("Filter", True), pill("Filter"),
                   h("Rows", 28, INK, 700),
                   '<div style="margin-top: 20px;">%s</div>' % result_row("x13", 1, True)) + footer())


SCREENS = [("ask", "Ask", ask, W, 2100),
           ("shortlist", "Shortlist", shortlist, W, 2200),
           ("compare", "Compare", compare, W, 1900),
           ("product", "Product", product, W, 2100),
           ("checkout", "Checkout", checkout, W, 1700),
           ("mobile", "Mobile", mobile, 920, 1000),
           ("system", "System", system, W, 2400)]

META = dict(key="a", letter="03", name="Ask",
            strap="One question instead of a catalogue",
            fonts=FONTS, bg=WHITE, ink=INK, font=FONT,
            why="Most people walking into the shop cannot name the phone they want — they describe a job. This turns "
                "the counter conversation into the interface, and it lets the shop say the useful thing a catalogue "
                "never can: which handset comes back to our own bench, and which one we would not sell you.",
            tradeoff="It needs the shop to have an opinion and keep it current — the scores and the verdicts are "
                     "written by someone, not generated. And a customer who already knows exactly what they want has "
                     "to get past a question first.")
