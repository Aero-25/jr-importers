# -*- coding: utf-8 -*-
"""Only what all three overhaul directions genuinely share: data and icons.

Deliberately tiny. The previous round shared a component system, and that is
exactly what made three "directions" come out as one layout in three palettes.
Each direction below builds its own everything.
"""
from catalog import P, BY, STORE, money, money_plain, TONES

PATHS = {
    "arrow": '<path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path>',
    "arrow_ne": '<path d="M7 17 17 7"></path><path d="M8 7h9v9"></path>',
    "check": '<path d="M20 6 9 17l-5-5"></path>',
    "search": '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.6-3.6"></path>',
    "bag": '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><path d="M3 6h18"></path><path d="M16 10a4 4 0 0 1-8 0"></path>',
    "user": '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
    "pin": '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle>',
    "truck": '<path d="M14 17V5H2v12h2"></path><path d="M14 9h4l4 4v4h-2"></path><circle cx="7" cy="17" r="2"></circle><circle cx="17" cy="17" r="2"></circle>',
    "shield": '<path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6Z"></path><path d="m9 12 2 2 4-4"></path>',
    "wrench": '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-5-5 8-8Z"></path><path d="m6 18 1.5 1.5"></path>',
    "clock": '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
    "plus": '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
    "minus": '<path d="M5 12h14"></path>',
    "chevron": '<path d="m9 6 6 6-6 6"></path>',
    "chevron_d": '<path d="m6 9 6 6 6-6"></path>',
    "star": '<path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.8 6.6 19.7l1.2-6.1L3.3 9.4l6.1-.8Z"></path>',
    "sparkle": '<path d="M12 3v6M12 15v6M3 12h6M15 12h6"></path>',
    "grid": '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect>',
    "list": '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"></path>',
}


def svg(name, size=18, color="currentColor", sw=1.8):
    return ('<svg width="%s" height="%s" viewBox="0 0 24 24" fill="none" stroke="%s" stroke-width="%s" '
            'stroke-linecap="round" stroke-linejoin="round">%s</svg>' % (size, size, color, sw, PATHS[name]))


def phone(w, h, tone="graphite", radius=None, pad=None, extra="", screen_extra=""):
    """A drawn stand-in for product photography."""
    frame, scr = TONES[tone]
    r = radius or max(8, int(w * 0.14))
    p = pad or max(3, int(w * 0.04))
    cam = int(w * 0.26)
    return ('<div style="width: %dpx; height: %dpx; border-radius: %dpx; background: linear-gradient(150deg, %s); '
            'padding: %dpx;%s"><div style="position: relative; height: 100%%; border-radius: %dpx; '
            'background: linear-gradient(165deg, %s); overflow: hidden;%s">'
            '<div style="position: absolute; top: %dpx; left: %dpx; width: %dpx; height: %dpx; border-radius: %dpx; '
            'background: rgba(4, 6, 9, 0.55);"></div>'
            '<div style="position: absolute; inset: 0; background: linear-gradient(118deg, rgba(255,255,255,0.12) 0%%, rgba(255,255,255,0) 42%%);"></div>'
            '</div></div>'
            % (w, h, r, frame, p, extra, r - p, scr, screen_extra,
               int(w * 0.085), int(w * 0.085), cam, int(cam * 1.15), int(cam * 0.3)))
