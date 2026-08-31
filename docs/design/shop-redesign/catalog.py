# -*- coding: utf-8 -*-
"""Real JR Importers catalogue data, lifted from supabase/seed.sql + seed_phones.sql.

Prices are the live seed prices; money strings follow src/lib/format.ts money()
(en-NA: space thousands separator, comma decimals, "N$ " prefix).
"""

def money(v):
    whole, cents = divmod(int(round(float(v) * 100)), 100)
    return "N$ %s,%02d" % ("{:,}".format(whole).replace(",", " "), cents)

def money_plain(v):
    return "N$ " + "{:,}".format(int(v)).replace(",", " ")

STORE = {
    "name": "JR Importers",
    "tagline": "Namibia’s cellphone specialists",
    "address": "Pelican Mall, Walvis Bay",
    "city": "Walvis Bay",
    "country": "Namibia",
    "phone": "+264 81 562 9203",
    "email": "sales@jrimporters.com",
    "hours": "Mon–Fri 09:00–17:00 · Sat 09:00–12:00",
}

# tone -> (frame gradient, screen gradient)
TONES = {
    "graphite": ("#5c6b7f, #171d26 55%, #45536a", "#2c3a4c, #101620"),
    "olive":    ("#4d5a48, #14180f 55%, #3d4a35", "#26301f, #0e120b"),
    "sand":     ("#7c5730, #2a1a0c 55%, #6b4522", "#8a6640, #2f2013"),
    "violet":   ("#56527a, #1b1a26 55%, #43405c", "#4a4770, #1c1b27"),
    "teal":     ("#3f5a52, #101815 55%, #2f4a42", "#1f3831, #0b1210"),
    "silver":   ("#8e9aa8, #2b333d 55%, #6f7d8c", "#59697b, #1d2530"),
}

P = [
    dict(id="s24u", brand="Samsung", name="Galaxy S24 Ultra 256GB", short="Galaxy S24 Ultra",
         price=26499, stock=11, sku="JR-SGS24U-256", tone="graphite", featured=True,
         blurb="Galaxy AI is here. Titanium build, built-in S Pen and a 200MP camera system.",
         specs=[("Display", "6.8″ QHD+ Dynamic AMOLED 2X 120Hz"), ("Processor", "Snapdragon 8 Gen 3"),
                ("Memory", "12GB RAM · 256GB"), ("Battery", "5000mAh"),
                ("Rear camera", "200MP + 50MP + 12MP + 10MP"), ("Front camera", "12MP"),
                ("Software", "Android 14 / One UI 6.1"), ("Weight", "232g"),
                ("Colour", "Titanium Gray"), ("Extras", "S Pen, IP68, 45W charging")],
         tags=["Flagship", "S Pen", "IP68"]),
    dict(id="a26u", brand="Ulefone", name="Armor 26 Ultra", short="Armor 26 Ultra",
         price=11999, stock=12, sku="JRP-UF26U", tone="olive", featured=True,
         blurb="Rugged flagship with a FLIR thermal camera, 100MP main sensor and military-grade durability — built for the toughest Namibian conditions.",
         specs=[("Display", "6.78″ FHD+ 120Hz"), ("Processor", "MediaTek Dimensity 8200"),
                ("Memory", "12GB RAM · 512GB"), ("Battery", "5950mAh"),
                ("Rear camera", "100MP + FLIR thermal + 64MP night"), ("Front camera", "32MP"),
                ("Software", "Android 14"), ("Weight", "341g"),
                ("Colour", "Black"), ("Extras", "IP68/IP69K, thermal cam, 120W charge")],
         tags=["Rugged", "Thermal", "IP69K"]),
    dict(id="pa18t", brand="Ulefone", name="Power Armor 18T", short="Power Armor 18T",
         price=9499, stock=14, sku="JRP-UFPA18T", tone="teal", featured=False,
         blurb="Big-battery rugged powerhouse with thermal imaging and fast 66W charging for days off-grid.",
         specs=[("Display", "6.58″ FHD+ 120Hz"), ("Processor", "MediaTek Dimensity 900"),
                ("Memory", "12GB RAM · 256GB"), ("Battery", "9600mAh"),
                ("Rear camera", "108MP + thermal"), ("Front camera", "32MP"),
                ("Software", "Android 12"), ("Weight", "460g"),
                ("Colour", "Black/Green"), ("Extras", "66W charge, IP68/IP69K")],
         tags=["Rugged", "9600mAh"]),
    dict(id="a55", brand="Samsung", name="Galaxy A55 5G 128GB", short="Galaxy A55 5G",
         price=8499, stock=27, sku="JR-SGA55-128", tone="silver", featured=False,
         blurb="Premium mid-ranger with a metal frame, 120Hz Super AMOLED and a 50MP OIS camera.",
         specs=[("Display", "6.6″ FHD+ Super AMOLED 120Hz"), ("Processor", "Exynos 1480"),
                ("Memory", "8GB RAM · 128GB"), ("Battery", "5000mAh"),
                ("Rear camera", "50MP OIS + 12MP + 5MP"), ("Front camera", "32MP"),
                ("Software", "Android 14 / One UI 6.1"), ("Weight", "213g"),
                ("Colour", "Awesome Navy"), ("Extras", "25W charging, IP67")],
         tags=["5G", "120Hz"]),
    dict(id="tab", brand="Samsung", name="Galaxy Tab A9+ 128GB", short="Galaxy Tab A9+",
         price=5499, stock=9, sku="JR-TABA9P-128", tone="graphite", featured=False,
         blurb="A big, immersive screen with quad speakers — perfect for streaming and the whole family.",
         specs=[("Display", "11″ WUXGA 90Hz"), ("Processor", "Snapdragon 695"),
                ("Memory", "8GB RAM · 128GB"), ("Battery", "7040mAh"),
                ("Rear camera", "8MP"), ("Front camera", "5MP"),
                ("Software", "Android 13 / One UI"), ("Weight", "480g"),
                ("Colour", "Graphite"), ("Extras", "Quad Dolby Atmos speakers, microSD")],
         tags=["Tablet", "Quad speakers"]),
    dict(id="x13", brand="Ulefone", name="Armor X13", short="Armor X13",
         price=4499, stock=22, sku="JRP-UFX13", tone="sand", featured=False,
         blurb="Affordable rugged phone with a massive battery and drop/dust/water resistance — work-ready and reliable.",
         specs=[("Display", "6.52″ HD+"), ("Processor", "MediaTek Helio G36"),
                ("Memory", "6GB RAM · 128GB"), ("Battery", "6320mAh"),
                ("Rear camera", "50MP + 2MP"), ("Front camera", "8MP"),
                ("Software", "Android 13"), ("Weight", "298g"),
                ("Colour", "Orange"), ("Extras", "IP68/IP69K, drop tested")],
         tags=["Rugged", "6320mAh"]),
    dict(id="a15", brand="Samsung", name="Galaxy A15 4G 128GB", short="Galaxy A15",
         price=3499, stock=40, sku="JR-SGA15-128", tone="violet", featured=False,
         blurb="A dependable everyday smartphone with a vivid Super AMOLED screen and big battery.",
         specs=[("Display", "6.5″ FHD+ Super AMOLED 90Hz"), ("Processor", "MediaTek Helio G99"),
                ("Memory", "4GB RAM · 128GB"), ("Battery", "5000mAh"),
                ("Rear camera", "50MP + 5MP + 2MP"), ("Front camera", "13MP"),
                ("Software", "Android 14 / One UI 6"), ("Weight", "200g"),
                ("Colour", "Blue Black"), ("Extras", "25W charging")],
         tags=["Best seller", "Under N$4 000"]),
    dict(id="n16p", brand="Ulefone", name="Note 16 Pro", short="Note 16 Pro",
         price=2799, stock=30, sku="JRP-UFN16P", tone="teal", featured=False,
         blurb="Slim, stylish everyday smartphone with a big display and dependable battery at a great price.",
         specs=[("Display", "6.52″ HD+ 90Hz"), ("Processor", "Unisoc T606"),
                ("Memory", "8GB RAM · 128GB"), ("Battery", "4400mAh"),
                ("Rear camera", "50MP + 2MP"), ("Front camera", "8MP"),
                ("Software", "Android 13"), ("Weight", "191g"),
                ("Colour", "Midnight Green"), ("Extras", "Dual SIM, microSD")],
         tags=["Entry", "Cheapest"]),
]

BY = {p["id"]: p for p in P}

BRANDS = [("Samsung", 4), ("Ulefone", 4)]
BANDS = [("Under N$4 000", 2), ("N$4 000 – N$10 000", 4), ("N$10 000 and up", 2)]
STORAGE = [("128GB", 5), ("256GB", 2), ("512GB", 1)]

JOB_CHECKS = ["LCD", "Touch", "Ringer", "Volume", "Power", "Charge", "Ear spk.", "Mic", "Cameras", "Signed"]

ORDER_ROWS = [
    ("JR-2418", "Galaxy A55 5G 128GB", "N$ 8 499,00", "Dispatched", "info"),
    ("JR-2411", "Armor X13 · Note 16 Pro", "N$ 7 298,00", "Delivered", "success"),
    ("JR-2402", "Galaxy S24 Ultra 256GB", "N$ 26 499,00", "Ready for Collection", "info"),
    ("JR-2388", "Galaxy Buds2 Pro", "N$ 2 999,00", "Refunded", "danger"),
]
