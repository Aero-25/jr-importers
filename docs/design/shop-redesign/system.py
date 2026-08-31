# -*- coding: utf-8 -*-
"""Three design systems for the JR Importers storefront redesign.

Each direction is a real system, not a skin: tokens plus a component set that
every screen is built from. Screens are written once (screens.py) and rendered
three times, so the directions stay comparable and internally consistent.
"""
from catalog import STORE, TONES, money, money_plain

NAV = [("shop", "All phones"), ("tablets", "Tablets"), ("accessories", "Accessories"),
       ("repairs", "Repairs"), ("laybuy", "Lay-by"), ("about", "About us")]

ICON = {
    "search": '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.6-3.6"></path>',
    "bag": '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><path d="M3 6h18"></path><path d="M16 10a4 4 0 0 1-8 0"></path>',
    "user": '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
    "arrow": '<path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path>',
    "check": '<path d="M20 6 9 17l-5-5"></path>',
    "truck": '<path d="M14 17V5H2v12h2"></path><path d="M14 9h4l4 4v4h-2"></path><circle cx="7" cy="17" r="2"></circle><circle cx="17" cy="17" r="2"></circle>',
    "shield": '<path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6Z"></path><path d="m9 12 2 2 4-4"></path>',
    "wrench": '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-5-5 8-8Z"></path><path d="m6 18 1.5 1.5"></path>',
    "pin": '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle>',
    "scale": '<path d="M12 3v18"></path><path d="M5 7h14"></path><path d="m5 7-3 7h6Z"></path><path d="m19 7-3 7h6Z"></path>',
    "star": '<path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.8 6.6 19.7l1.2-6.1L3.3 9.4l6.1-.8Z"></path>',
    "clock": '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
    "phone": '<path d="M5 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2Z"></path>',
    "plus": '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
    "minus": '<path d="M5 12h14"></path>',
    "trash": '<path d="M4 7h16"></path><path d="M9 7V5h6v2"></path><path d="M6 7l1 13h10l1-13"></path>',
    "chevron": '<path d="m9 6 6 6-6 6"></path>',
    "camera": '<path d="M4 8h3l2-3h6l2 3h3v11H4Z"></path><circle cx="12" cy="13" r="4"></circle>',
    "battery": '<rect x="2" y="8" width="16" height="9" rx="2"></rect><path d="M21 11v3"></path>',
    "cpu": '<rect x="6" y="6" width="12" height="12" rx="2"></rect><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"></path>',
    "screen": '<rect x="3" y="4" width="18" height="13" rx="2"></rect><path d="M8 21h8"></path>',
}


def icon(name, size=18, color="currentColor", sw=1.8):
    return ('<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="%s" '
            'stroke-width="%s" stroke-linecap="round" stroke-linejoin="round">%s</svg>'
            % (size, size, color, sw, ICON[name]))


class DS(object):
    """Base component set. Subclasses set tokens and override the loud parts."""

    key = ""; letter = ""; name = ""; strap = ""
    fonts = []
    bg = panel = panel2 = ink = muted = subtle = line = accent = accent_ink = ""
    inv_ink = "#ffffff"
    f_body = f_display = f_num = ""
    r_card = r_btn = r_chip = r_pill = "0"
    border = "1px solid"
    shadow = "none"
    shadow_lift = "none"
    disp_w = "700"; disp_ls = "-0.03em"
    label_ls = "0.14em"
    media_bg = ""
    ok = "#16a34a"

    # ── atoms ────────────────────────────────────────────────────────────
    def root(self, inner, width=1440, extra=""):
        return ('<div style="width: %dpx; background: %s; color: %s; font-family: %s;%s">%s</div>'
                % (width, self.bg, self.ink, self.f_body, extra, inner))

    def disp(self, text, size, tag="div", extra="", color=None):
        return ('<%s style="margin: 0; font-family: %s; font-weight: %s; font-size: %spx; '
                'line-height: 1.02; letter-spacing: %s; color: %s;%s">%s</%s>'
                % (tag, self.f_display, self.disp_w, size, self.disp_ls, color or self.ink, extra, text, tag))

    def eyebrow(self, text, color=None):
        return ('<div style="font-family: %s; font-size: 11px; font-weight: 700; letter-spacing: %s; '
                'text-transform: uppercase; color: %s;">%s</div>'
                % (self.f_label(), self.label_ls, color or self.muted, text))

    def f_label(self):
        return self.f_num if self.key == "a" else self.f_body

    def body(self, text, size=15, color=None, maxw=None, top=0, lh=1.65):
        w = ("max-width: %dpx; " % maxw) if maxw else ""
        return ('<p style="margin: %dpx 0 0; %sfont-size: %spx; line-height: %s; color: %s;">%s</p>'
                % (top, w, size, lh, color or self.muted, text))

    def price(self, text, size=22, color=None, weight=None, extra_top=0):
        return ('<div style="margin-top: %dpx; font-family: %s; font-weight: %s; font-size: %spx; '
                'letter-spacing: -0.02em; color: %s;">%s</div>'
                % (extra_top, self.f_num, weight or self.num_w(), size, color or self.ink, text))

    def num_w(self):
        return "600"

    def btn(self, label, kind="primary", h=52, wide=False, arrow=False, icon_name=None, fs=15.5):
        bg, fg, bd, sh = self.btn_style(kind)
        inner = label
        if icon_name:
            inner = icon(icon_name, 17, "currentColor", 2) + inner
        if arrow:
            inner = inner + icon("arrow", 17, "currentColor", 2.2)
        return ('<a href="#" style="display: %s; align-items: center; justify-content: center; gap: 10px; '
                'height: %dpx; %s border-radius: %s; background: %s; color: %s; border: %s; box-shadow: %s; '
                'font-family: %s; font-size: %spx; font-weight: %s; text-decoration: none; white-space: nowrap;">%s</a>'
                % ("flex" if wide else "inline-flex", h,
                   ("" if wide else "padding: 0 %dpx;" % (26 if h > 46 else 20)),
                   self.r_btn, bg, fg, bd, sh, self.f_body, fs, self.btn_w(), inner))

    def btn_w(self):
        return "600"

    def btn_style(self, kind):
        raise NotImplementedError

    def chip(self, label, active=False, count=None):
        raise NotImplementedError

    def badge(self, label, tone="accent"):
        raise NotImplementedError

    def panel(self, inner, pad=24, extra="", bg=None):
        return ('<div style="background: %s; border: %s; border-radius: %s; box-shadow: %s; padding: %dpx;%s">%s</div>'
                % (bg or self.panel, self.border, self.r_card, self.shadow, pad, extra, inner))

    def rule(self, top=0, bottom=0):
        return '<div style="height: 1px; background: %s; margin: %dpx 0 %dpx;"></div>' % (self.line, top, bottom)

    def stock(self, n, size=12.5):
        return ('<div style="display: inline-flex; align-items: center; gap: 7px; font-family: %s; font-size: %spx; '
                'font-weight: 600; color: %s;"><span style="width: 7px; height: 7px; border-radius: 50%%; '
                'background: %s;"></span>%d in stock</div>' % (self.f_body, size, self.ok_text(), self.ok, n))

    def ok_text(self):
        return self.muted

    # ── device art ───────────────────────────────────────────────────────
    def device(self, w, h, tone="graphite", frame_r=None, bezel=None, border=""):
        frame, screen = TONES[tone]
        r = frame_r or max(10, int(w * 0.14))
        pad = bezel or max(4, int(w * 0.045))
        cam = int(w * 0.27)
        return ('<div style="width: %dpx; height: %dpx; border-radius: %dpx; background: linear-gradient(150deg, %s); '
                'padding: %dpx;%s"><div style="position: relative; height: 100%%; border-radius: %dpx; '
                'background: linear-gradient(165deg, %s); overflow: hidden;">'
                '<div style="position: absolute; top: %dpx; left: %dpx; width: %dpx; height: %dpx; border-radius: %dpx; '
                'background: rgba(6, 9, 13, 0.55);"></div>'
                '<div style="position: absolute; inset: 0; background: linear-gradient(115deg, rgba(255,255,255,0.10) 0%%, rgba(255,255,255,0) 40%%);"></div>'
                '</div></div>'
                % (w, h, r, frame, pad, border, r - pad, screen,
                   int(w * 0.09), int(w * 0.09), cam, int(cam * 1.15), int(cam * 0.3)))

    # ── shared molecules ─────────────────────────────────────────────────
    def spec_table(self, specs, cols="150px minmax(0, 1fr)", fs=13.5):
        cells = []
        for i, (k, v) in enumerate(specs):
            bt = "border-top: 1px solid %s;" % self.line
            cells.append('<div style="padding: 11px 0; %s color: %s; font-size: %spx;">%s</div>' % (bt, self.muted, fs, k))
            cells.append('<div style="padding: 11px 0; %s font-size: %spx; font-family: %s;">%s</div>'
                         % (bt, fs, self.f_num if self.key == "a" else self.f_body, v))
        return ('<div style="display: grid; grid-template-columns: %s;">%s</div>' % (cols, "".join(cells)))

    def field(self, label, value="", placeholder=None, w=None, h=52):
        shown = value or placeholder or ""
        col = self.ink if value else self.subtle
        return ('<label style="display: flex; flex-direction: column; gap: 8px;%s">'
                '<span style="font-size: 12.5px; font-weight: 600; color: %s;">%s</span>'
                '<span style="display: flex; align-items: center; height: %dpx; padding: 0 16px; border: %s; '
                'border-radius: %s; background: %s; color: %s; font-size: 15px;">%s</span></label>'
                % ((" width: %dpx;" % w) if w else "", self.muted, label, h, self.border,
                   self.r_btn if self.r_btn != "999px" else "12px", self.input_bg(), col, shown))

    def input_bg(self):
        return self.panel

    def section(self, title, body, sub=None, right=None, pad="72px 0 0", size=40):
        head = '<div>%s%s</div>' % (self.disp(title, size, "h2"),
                                    self.body(sub, 15.5, self.muted, top=9) if sub else "")
        rightblk = ('<div style="display: flex; gap: 10px; align-items: center;">%s</div>' % right) if right else ""
        return ('<section style="padding: %s;">'
                '<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 24px;">%s%s</div>'
                '<div style="margin-top: 28px;">%s</div></section>' % (pad, head, rightblk, body))

    def grid(self, items, cols=4, gap=22):
        return ('<div style="display: grid; grid-template-columns: repeat(%d, minmax(0, 1fr)); gap: %dpx;">%s</div>'
                % (cols, gap, "".join(items)))

    def flex(self, items, gap=12, align="center", justify="flex-start", wrap="nowrap", extra=""):
        return ('<div style="display: flex; align-items: %s; justify-content: %s; gap: %dpx; flex-wrap: %s;%s">%s</div>'
                % (align, justify, gap, wrap, extra, "".join(items)))

    def stat(self, value, label, size=27):
        return ('<div><div style="font-family: %s; font-weight: %s; font-size: %spx; letter-spacing: -0.02em;">%s</div>'
                '<div style="margin-top: 5px; font-size: 13px; color: %s;">%s</div></div>'
                % (self.f_num if self.key == "a" else self.f_display, self.num_w(), size, value, self.muted, label))

    # to be provided by each direction
    def header(self, active="shop"):
        raise NotImplementedError

    def footer(self):
        raise NotImplementedError

    def card(self, p, tall=True):
        raise NotImplementedError

    def pad(self):
        return 40


# ══════════════════════════════════════════════════════════════════════════
# A · IMPORT DESK — editorial trade catalogue. Paper, hairlines, mono numerals.
# ══════════════════════════════════════════════════════════════════════════
class ImportDesk(DS):
    key = "a"; letter = "A"; name = "Import Desk"
    strap = "Editorial trade catalogue"
    fonts = ["Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800", "IBM+Plex+Sans:wght@400;500;600",
             "IBM+Plex+Mono:wght@400;500;600"]
    bg = "#f6f4ef"; panel = "#ffffff"; panel2 = "#f1efe8"
    ink = "#101b28"; muted = "#5c6b7d"; subtle = "#8b8577"; line = "#ddd8cc"
    accent = "#a3e635"; accent_ink = "#101b28"; inv_ink = "#f6f4ef"
    f_body = "'IBM Plex Sans', system-ui, sans-serif"
    f_display = "'Bricolage Grotesque', system-ui, sans-serif"
    f_num = "'IBM Plex Mono', ui-monospace, monospace"
    r_card = "0"; r_btn = "0"; r_chip = "0"; r_pill = "0"
    border = "1px solid #ddd8cc"
    disp_w = "800"; disp_ls = "-0.035em"; label_ls = "0.15em"
    media_bg = "linear-gradient(180deg, #ffffff, #f1efe8)"

    def btn_style(self, kind):
        if kind == "primary":
            return (self.ink, self.inv_ink, "1px solid " + self.ink, "none")
        if kind == "buy":
            return (self.accent, self.ink, "1px solid " + self.ink, "none")
        if kind == "secondary":
            return ("transparent", self.ink, "1px solid " + self.ink, "none")
        return ("transparent", self.muted, "1px solid " + self.line, "none")

    def chip(self, label, active=False, count=None):
        c = ("background: %s; color: %s; border: 1px solid %s;" % (self.ink, self.inv_ink, self.ink) if active
             else "background: transparent; color: %s; border: 1px solid %s;" % (self.ink, self.line))
        tail = ('<span style="font-family: %s; font-size: 11px; color: %s; margin-left: 6px;">%s</span>'
                % (self.f_num, self.inv_ink if active else self.muted, count)) if count is not None else ""
        return ('<span style="display: inline-flex; align-items: center; height: 40px; padding: 0 16px; %s '
                'font-size: 13.5px; font-weight: 500;">%s%s</span>' % (c, label, tail))

    def badge(self, label, tone="accent"):
        m = {"accent": (self.accent, self.ink), "ink": (self.ink, self.inv_ink),
             "warn": ("#fdf1dc", "#8a5308"), "danger": ("#fbe3e3", "#a12626"),
             "success": ("#e2f6eb", "#0f6b3a"), "plain": (self.panel2, self.muted)}
        bg, fg = m.get(tone, m["accent"])
        return ('<span style="display: inline-flex; align-items: center; height: 24px; padding: 0 9px; background: %s; '
                'color: %s; font-family: %s; font-size: 10.5px; font-weight: 600; letter-spacing: 0.1em; '
                'text-transform: uppercase;">%s</span>' % (bg, fg, self.f_num, label))

    def card_grid(self, items, cols=4):
        return ('<div style="display: grid; grid-template-columns: repeat(%d, minmax(0, 1fr)); gap: 1px; '
                'background: %s; border: 1px solid %s;">%s</div>' % (cols, self.line, self.line, "".join(items)))

    def header(self, active="shop"):
        nav = "".join(
            '<a href="#" style="text-decoration: none; font-size: 15px; font-weight: %s; color: %s; '
            'padding-bottom: 3px; border-bottom: 2px solid %s;">%s</a>'
            % ("600" if k == active else "500", self.ink, self.accent if k == active else "transparent", lbl)
            for k, lbl in NAV)
        return (
            '<div style="display: flex; align-items: center; justify-content: space-between; height: 36px; '
            'padding: 0 40px; background: %s; color: %s; font-family: %s; font-size: 11px; letter-spacing: 0.09em; '
            'text-transform: uppercase;">'
            '<div style="display: flex; gap: 26px;"><span>%s</span><span style="color: %s;">%s</span></div>'
            '<div style="display: flex; gap: 26px;"><span>Courier to all 14 regions</span><span>%s</span></div></div>'
            '<div style="display: flex; align-items: center; justify-content: space-between; height: 88px; '
            'padding: 0 40px; border-bottom: 1px solid %s; background: %s;">'
            '<div style="display: flex; align-items: center; gap: 12px;">'
            '<div style="width: 14px; height: 26px; background: %s;"></div>'
            '<div style="font-family: %s; font-weight: 800; font-size: 23px; letter-spacing: -0.02em;">JR IMPORTERS</div></div>'
            '<div style="display: flex; align-items: center; gap: 28px;">%s</div>'
            '<div style="display: flex; align-items: center; gap: 12px;">'
            '<div style="display: flex; align-items: center; gap: 10px; width: 200px; height: 44px; padding: 0 14px; '
            'border: 1px solid %s; background: %s;">%s<span style="font-size: 14px; color: %s;">Search the shelf</span></div>'
            '<div style="display: flex; align-items: center; gap: 9px; height: 44px; padding: 0 18px; background: %s; '
            'color: %s; font-size: 14px; font-weight: 600;">%s Cart · 2</div></div></div>'
            % (self.ink, self.inv_ink, self.f_num, STORE["address"], self.accent, STORE["hours"], STORE["phone"],
               self.line, self.bg, self.accent, self.f_display, nav, self.line, self.panel,
               icon("search", 16, self.subtle), self.subtle, self.ink, self.inv_ink, icon("bag", 16, "currentColor")))

    def footer(self):
        def col(title, items):
            return ('<div>%s<div style="display: flex; flex-direction: column; gap: 11px; margin-top: 16px; '
                    'font-size: 14px; color: #cfd7de;">%s</div></div>'
                    % (self.eyebrow(title, self.accent), "".join("<span>%s</span>" % i for i in items)))
        return (
            '<div style="margin-top: 64px; background: %s; color: %s; padding: 52px 40px 34px;">'
            '<div style="display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr; gap: 40px;">'
            '<div><div style="display: flex; align-items: center; gap: 12px;">'
            '<div style="width: 14px; height: 26px; background: %s;"></div>'
            '<div style="font-family: %s; font-weight: 800; font-size: 21px; letter-spacing: -0.02em;">JR IMPORTERS</div></div>'
            '<p style="margin: 16px 0 0; max-width: 300px; font-size: 14px; line-height: 1.65; color: #9fabb8;">'
            'Cellphone specialists in Walvis Bay. Imported Samsung and Ulefone handsets, checked against their IMEI, '
            'with repairs done in-house.</p></div>%s%s%s</div>'
            '<div style="display: flex; justify-content: space-between; margin-top: 40px; padding-top: 20px; '
            'border-top: 1px solid #2a3746; font-family: %s; font-size: 11px; letter-spacing: 0.08em; '
            'text-transform: uppercase; color: #7d8b99;"><span>© 2026 JR Importers</span>'
            '<span>Terms · Privacy · Namibia</span></div></div>'
            % (self.ink, self.inv_ink, self.accent, self.f_display,
               col("Shop", ["All phones", "Tablets", "Accessories", "Track my order"]),
               col("Service", ["Book a repair", "Job card status", "Lay-by", "Warranty"]),
               col("Visit", [STORE["address"], STORE["phone"], STORE["email"], "Mon–Fri 09:00–17:00"]),
               self.f_num))

    def card(self, p, tall=True):
        return ('<div style="display: flex; flex-direction: column; background: %s; padding: 22px;">'
                '<div style="display: flex; align-items: center; justify-content: center; height: 210px;">%s</div>'
                '%s<div style="margin-top: 6px; font-size: 16px; font-weight: 600; line-height: 1.3;">%s</div>'
                '<div style="margin-top: 6px; font-family: %s; font-size: 12px; color: %s; line-height: 1.5;">%s</div>'
                '<div style="margin-top: auto; padding-top: 18px;">%s<div style="margin-top: 8px;">%s</div>%s</div></div>'
                % (self.panel, self.device(96, 186, p["tone"]),
                   self.eyebrow(p["brand"]), p["name"], self.f_num, self.muted,
                   p["specs"][2][1] + "<br>" + p["specs"][3][1],
                   self.price(money(p["price"]), 22), self.stock(p["stock"]),
                   '<div style="margin-top: 14px;">%s</div>' % self.btn("Add to cart", "primary", 46, wide=True, fs=14.5)))


# ══════════════════════════════════════════════════════════════════════════
# B · NIGHT COUNTER — dark showroom. Spotlight, Syne, one lime accent.
# ══════════════════════════════════════════════════════════════════════════
class NightCounter(DS):
    key = "b"; letter = "B"; name = "Night Counter"
    strap = "Dark showroom"
    fonts = ["Syne:wght@600;700;800", "Manrope:wght@400;500;600;700"]
    bg = "#0a0b0d"; panel = "linear-gradient(180deg, #101317, #0b0d10)"; panel2 = "#0d0f12"
    ink = "#f2f1ee"; muted = "rgba(242, 241, 238, 0.62)"; subtle = "rgba(242, 241, 238, 0.38)"
    line = "rgba(242, 241, 238, 0.11)"
    accent = "#a3e635"; accent_ink = "#0a0b0d"; inv_ink = "#0a0b0d"
    f_body = "'Manrope', system-ui, sans-serif"
    f_display = "'Syne', system-ui, sans-serif"
    f_num = "'Manrope', system-ui, sans-serif"
    r_card = "26px"; r_btn = "999px"; r_chip = "999px"; r_pill = "999px"
    border = "1px solid rgba(242, 241, 238, 0.11)"
    disp_w = "800"; disp_ls = "-0.035em"; label_ls = "0.2em"
    ok = "#a3e635"
    media_bg = "transparent"

    def num_w(self):
        return "700"

    def btn_w(self):
        return "700"

    def ok_text(self):
        return self.accent

    def input_bg(self):
        return "rgba(242, 241, 238, 0.04)"

    def btn_style(self, kind):
        if kind == "primary":
            return (self.accent, self.inv_ink, "1px solid " + self.accent, "0 14px 34px -18px rgba(163,230,53,0.8)")
        if kind == "buy":
            return (self.accent, self.inv_ink, "1px solid " + self.accent, "0 14px 34px -18px rgba(163,230,53,0.8)")
        if kind == "secondary":
            return ("transparent", self.ink, "1px solid rgba(242, 241, 238, 0.24)", "none")
        return ("rgba(242, 241, 238, 0.06)", self.muted, "1px solid transparent", "none")

    def chip(self, label, active=False, count=None):
        c = ("background: %s; color: %s; border: 1px solid %s;" % (self.ink, self.inv_ink, self.ink) if active
             else "background: transparent; color: %s; border: 1px solid rgba(242,241,238,0.18);" % self.ink)
        tail = ('<span style="opacity: .55; margin-left: 7px;">%s</span>' % count) if count is not None else ""
        return ('<span style="display: inline-flex; align-items: center; height: 42px; padding: 0 20px; border-radius: 999px; %s '
                'font-size: 13.5px; font-weight: 600;">%s%s</span>' % (c, label, tail))

    def badge(self, label, tone="accent"):
        m = {"accent": ("rgba(163, 230, 53, 0.14)", self.accent), "ink": (self.ink, self.inv_ink),
             "warn": ("rgba(240, 176, 64, 0.16)", "#f0b040"), "danger": ("rgba(248, 113, 113, 0.16)", "#f87171"),
             "success": ("rgba(74, 214, 130, 0.16)", "#4ad682"), "plain": ("rgba(242,241,238,0.08)", self.muted)}
        bg, fg = m.get(tone, m["accent"])
        return ('<span style="display: inline-flex; align-items: center; height: 26px; padding: 0 12px; border-radius: 999px; '
                'background: %s; color: %s; font-size: 11.5px; font-weight: 700; letter-spacing: 0.04em;">%s</span>'
                % (bg, fg, label))

    def card_grid(self, items, cols=4):
        return self.grid(items, cols, 22)

    def glow(self, x, y, size, color="rgba(163, 230, 53, 0.13)"):
        return ('<div style="position: absolute; top: %dpx; left: %dpx; width: %dpx; height: %dpx; border-radius: 50%%; '
                'background: radial-gradient(circle, %s, rgba(10,11,13,0) 64%%); pointer-events: none;"></div>'
                % (y, x, size, size, color))

    def header(self, active="shop"):
        nav = "".join('<a href="#" style="text-decoration: none; font-size: 14.5px; font-weight: %s; color: %s;">%s</a>'
                      % ("700" if k == active else "500", self.ink if k == active else self.muted, lbl)
                      for k, lbl in NAV)
        return (
            '<div style="display: flex; align-items: center; justify-content: space-between; height: 92px; padding: 0 56px; '
            'border-bottom: 1px solid %s;">'
            '<div style="display: flex; align-items: center; gap: 44px;">'
            '<div style="font-family: %s; font-weight: 800; font-size: 22px; letter-spacing: -0.01em;">JR<span style="color: %s;">.</span>IMPORTERS</div>'
            '<div style="display: flex; gap: 26px;">%s</div></div>'
            '<div style="display: flex; align-items: center; gap: 18px;">'
            '<div style="display: inline-flex; align-items: center; gap: 9px; height: 40px; padding: 0 16px; '
            'border: 1px solid rgba(242,241,238,0.16); border-radius: 999px; font-size: 12px; font-weight: 600; '
            'letter-spacing: 0.08em; text-transform: uppercase; color: %s;">'
            '<span style="width: 7px; height: 7px; border-radius: 50%%; background: %s;"></span>Live stock · %s</div>'
            '%s%s<div style="display: inline-flex; align-items: center; gap: 9px; height: 44px; padding: 0 20px; '
            'border-radius: 999px; background: %s; color: %s; font-size: 14px; font-weight: 700;">%s 2</div></div></div>'
            % (self.line, self.f_display, self.accent, nav, self.muted, self.accent, STORE["city"],
               icon("search", 21, self.ink, 1.6), icon("user", 21, self.ink, 1.6),
               self.ink, self.inv_ink, icon("bag", 16, "currentColor", 1.9)))

    def footer(self):
        def col(title, items):
            return ('<div>%s<div style="display: flex; flex-direction: column; gap: 12px; margin-top: 18px; '
                    'font-size: 14px; color: %s;">%s</div></div>'
                    % (self.eyebrow(title, self.accent), self.muted, "".join("<span>%s</span>" % i for i in items)))
        return (
            '<div style="margin-top: 92px; padding: 56px 56px 36px; border-top: 1px solid %s;">'
            '<div style="display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: 40px;">'
            '<div><div style="font-family: %s; font-weight: 800; font-size: 20px;">JR<span style="color: %s;">.</span>IMPORTERS</div>'
            '<p style="margin: 16px 0 0; max-width: 300px; font-size: 14px; line-height: 1.7; color: %s;">'
            'Cellphone specialists in Walvis Bay. Imported Samsung and Ulefone handsets, checked against their IMEI, '
            'with repairs done in-house.</p></div>%s%s%s</div>'
            '<div style="display: flex; justify-content: space-between; margin-top: 44px; padding-top: 22px; '
            'border-top: 1px solid %s; font-size: 12.5px; color: %s;"><span>© 2026 JR Importers</span>'
            '<span>Terms · Privacy · Namibia</span></div></div>'
            % (self.line, self.f_display, self.accent, self.subtle,
               col("Shop", ["All phones", "Tablets", "Accessories", "Track my order"]),
               col("Service", ["Book a repair", "Job card status", "Lay-by", "Warranty"]),
               col("Visit", [STORE["address"], STORE["phone"], STORE["email"], "Mon–Fri 09:00–17:00"]),
               self.line, self.subtle))

    def card(self, p, tall=True):
        return ('<div style="display: flex; flex-direction: column; border-radius: %s; border: %s; background: %s; padding: 24px;">'
                '<div style="display: flex; align-items: center; justify-content: space-between;">%s%s</div>'
                '<div style="display: flex; align-items: center; justify-content: center; height: 264px;">%s</div>'
                '<div style="font-family: %s; font-weight: 700; font-size: 19px;">%s</div>'
                '<div style="margin-top: 8px; font-size: 13px; color: %s;">%s</div>'
                '<div style="display: flex; align-items: center; justify-content: space-between; margin-top: 20px;">%s%s</div></div>'
                % (self.r_card, self.border, self.panel, self.eyebrow(p["brand"], self.subtle),
                   self.badge("%d in stock" % p["stock"]),
                   self.device(124, 238, p["tone"], border=" box-shadow: 0 40px 60px -34px rgba(0,0,0,0.95);"),
                   self.f_display, p["name"], self.muted, p["specs"][2][1],
                   self.price(money(p["price"]), 21),
                   self.btn("Add", "primary", 44, fs=14)))


# ══════════════════════════════════════════════════════════════════════════
# C · KIOSK — price-led poster commerce. Hard borders, offset shadows.
# ══════════════════════════════════════════════════════════════════════════
class Kiosk(DS):
    key = "c"; letter = "C"; name = "Kiosk"
    strap = "Price-led poster commerce"
    fonts = ["Archivo+Black", "DM+Sans:wght@400;500;700"]
    bg = "#ffffff"; panel = "#ffffff"; panel2 = "#f2f4f2"
    ink = "#0d263f"; muted = "#5a6b7c"; subtle = "#8b98a5"; line = "#0d263f"
    accent = "#a3e635"; accent_ink = "#0d263f"; inv_ink = "#ffffff"
    f_body = "'DM Sans', system-ui, sans-serif"
    f_display = "'Archivo Black', system-ui, sans-serif"
    f_num = "'Archivo Black', system-ui, sans-serif"
    r_card = "0"; r_btn = "0"; r_chip = "0"; r_pill = "0"
    border = "3px solid #0d263f"
    shadow = "8px 8px 0 #0d263f"
    disp_w = "400"; disp_ls = "-0.04em"; label_ls = "0.14em"
    ok = "#3f7d2f"
    media_bg = "#f2f4f2"

    def num_w(self):
        return "400"

    def btn_w(self):
        return "700"

    def ok_text(self):
        return "#3f7d2f"

    def btn_style(self, kind):
        if kind == "primary":
            return (self.ink, self.inv_ink, "3px solid " + self.ink, "none")
        if kind == "buy":
            return (self.accent, self.ink, "3px solid " + self.ink, "5px 5px 0 " + self.ink)
        if kind == "secondary":
            return (self.panel, self.ink, "3px solid " + self.ink, "none")
        return ("transparent", self.muted, "3px solid " + self.line, "none")

    def chip(self, label, active=False, count=None):
        c = ("background: %s; color: %s;" % (self.ink, self.inv_ink) if active
             else "background: %s; color: %s;" % (self.panel, self.ink))
        tail = ('<span style="margin-left: 7px; opacity: .6;">%s</span>' % count) if count is not None else ""
        return ('<span style="display: inline-flex; align-items: center; height: 44px; padding: 0 18px; border: 3px solid %s; %s '
                'font-size: 13.5px; font-weight: 700;">%s%s</span>' % (self.ink, c, label, tail))

    def badge(self, label, tone="accent"):
        m = {"accent": (self.accent, self.ink), "ink": (self.ink, self.inv_ink),
             "warn": ("#ffd166", self.ink), "danger": ("#ff6b6b", self.inv_ink),
             "success": (self.accent, self.ink), "plain": (self.panel, self.ink)}
        bg, fg = m.get(tone, m["accent"])
        return ('<span style="display: inline-flex; align-items: center; height: 26px; padding: 0 10px; background: %s; '
                'color: %s; border: 2.5px solid %s; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; '
                'text-transform: uppercase;">%s</span>' % (bg, fg, self.ink, label))

    def card_grid(self, items, cols=4):
        return self.grid(items, cols, 22)

    def header(self, active="shop"):
        nav = "".join(self.chip(lbl, k == active) for k, lbl in NAV[:4])
        ticker = "".join(
            '<span>%s</span><span style="width: 9px; height: 9px; background: %s; flex-shrink: 0;"></span>' % (t, self.accent)
            for t in ["Courier to all 14 regions", "Same-day collection in Walvis Bay", "Lay-by available",
                      "Sealed &amp; IMEI-checked", "Repairs done in-house", "Courier to all 14 regions"])
        return (
            '<div style="display: flex; align-items: center; gap: 26px; height: 42px; padding: 0 32px; background: %s; '
            'color: %s; font-size: 12.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; '
            'overflow: hidden; white-space: nowrap;">%s</div>'
            '<div style="display: flex; align-items: center; justify-content: space-between; padding: 20px 32px; '
            'border-bottom: 3px solid %s;">'
            '<div style="display: flex; align-items: center; gap: 14px;">'
            '<div style="display: flex; align-items: center; justify-content: center; width: 54px; height: 54px; '
            'background: %s; border: 3px solid %s; font-family: %s; font-size: 22px;">JR</div>'
            '<div style="font-family: %s; font-size: 25px; letter-spacing: -0.03em; line-height: 1;">IMPORTERS</div></div>'
            '<div style="display: flex; align-items: center; gap: 10px;">%s</div>'
            '<div style="display: flex; align-items: center; gap: 12px;">'
            '<div style="display: inline-flex; align-items: center; gap: 10px; height: 46px; padding: 0 16px; '
            'border: 3px solid %s; font-size: 14px; font-weight: 500; color: %s;">%s Search</div>'
            '<div style="display: inline-flex; align-items: center; gap: 10px; height: 46px; padding: 0 20px; background: %s; '
            'color: %s; font-size: 14.5px; font-weight: 700; box-shadow: 5px 5px 0 %s;">%s Cart · 2</div></div></div>'
            % (self.ink, self.inv_ink, ticker, self.ink, self.accent, self.ink, self.f_display, self.f_display,
               nav, self.ink, self.muted, icon("search", 17, self.ink, 2.4), self.ink, self.inv_ink, self.accent,
               icon("bag", 17, "currentColor", 2.2)))

    def footer(self):
        def col(title, items):
            return ('<div>%s<div style="display: flex; flex-direction: column; gap: 11px; margin-top: 16px; '
                    'font-size: 14px; color: #cdd8e2;">%s</div></div>'
                    % (self.eyebrow(title, self.accent), "".join("<span>%s</span>" % i for i in items)))
        return (
            '<div style="margin-top: 64px; padding: 48px 32px 32px; background: %s; color: %s;">'
            '<div style="display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: 40px;">'
            '<div><div style="display: flex; align-items: center; gap: 12px;">'
            '<div style="display: flex; align-items: center; justify-content: center; width: 46px; height: 46px; '
            'background: %s; color: %s; font-family: %s; font-size: 19px;">JR</div>'
            '<div style="font-family: %s; font-size: 21px; letter-spacing: -0.03em;">IMPORTERS</div></div>'
            '<p style="margin: 18px 0 0; max-width: 300px; font-size: 14px; line-height: 1.65; color: #a8b7c6;">'
            'Cellphone specialists in Walvis Bay. Imported Samsung and Ulefone handsets, checked against their IMEI, '
            'with repairs done in-house.</p></div>%s%s%s</div>'
            '<div style="display: flex; justify-content: space-between; margin-top: 38px; padding-top: 20px; '
            'border-top: 1px solid #26445f; font-size: 12.5px; color: #8fa0b1;"><span>© 2026 JR Importers</span>'
            '<span>Terms · Privacy · Namibia</span></div></div>'
            % (self.ink, self.inv_ink, self.accent, self.ink, self.f_display, self.f_display,
               col("Shop", ["All phones", "Tablets", "Accessories", "Track my order"]),
               col("Service", ["Book a repair", "Job card status", "Lay-by", "Warranty"]),
               col("Visit", [STORE["address"], STORE["phone"], STORE["email"], "Mon–Fri 09:00–17:00"])))

    def card(self, p, tall=True):
        tag = p["tags"][0] if p["tags"] else "In stock"
        return ('<div style="display: flex; flex-direction: column; border: %s; box-shadow: %s;">'
                '<div style="position: relative; display: flex; align-items: center; justify-content: center; height: 250px; '
                'overflow: hidden; background: %s; border-bottom: 3px solid %s;">'
                '<div style="position: absolute; top: 12px; left: 12px;">%s</div>%s</div>'
                '<div style="display: flex; flex-direction: column; flex-grow: 1; padding: 18px;">'
                '%s<div style="margin-top: 6px; font-size: 17px; font-weight: 700; line-height: 1.25;">%s</div>'
                '<div style="margin-top: auto; padding-top: 16px;">%s'
                '<div style="margin-top: 6px; font-size: 12.5px; font-weight: 700; color: %s;">%d in stock</div>'
                '<div style="margin-top: 14px;">%s</div></div></div></div>'
                % (self.border, self.shadow, self.panel2, self.ink, self.badge(tag),
                   self.device(108, 208, p["tone"], border=" border: 2.5px solid %s;" % self.ink),
                   self.eyebrow(p["brand"]), p["name"],
                   self.price(money_plain(p["price"]), 27), self.ok, p["stock"],
                   self.btn("ADD TO CART", "primary", 50, wide=True, fs=14.5)))


SYSTEMS = [ImportDesk(), NightCounter(), Kiosk()]
