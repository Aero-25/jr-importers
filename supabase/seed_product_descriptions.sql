-- Product descriptions for the 49 listed items that had none.
--
-- Written on 20 October 2026. Of 113 products on the shop, 49 had a name and a
-- price and nothing else — which gives a search engine nothing to index and a
-- shopper no reason to choose one over another. They are also what the product
-- page uses as its meta description.
--
-- Kept here so the text is in version control rather than only in the database:
-- it is reproducible, reviewable, and safe to re-run.
--
-- Every claim comes from the product's own spec fields. Where a product has no
-- specs but a sibling of the same model does, the shared hardware is carried
-- across and the storage taken from the name — never the RAM, which differs
-- between storage variants. Six items with no spec sheet and no sibling get a
-- short honest line rather than a confident guess.
--
-- Only rows that are still empty are written, so this cannot overwrite anything
-- typed since.

begin;

select set_config('request.jwt.claims',
  '{"sub":"d235f065-753e-4ad2-a677-2380752624a9","email":"info@jrimporters.com","role":"authenticated"}',
  true);

create temp table written(id bigint, name text, chars int);

with copy(id, body) as (values
  (1, 'The Galaxy A17 with 256 GB of storage and 8 GB of RAM, on a 6.7-inch Super AMOLED 90Hz display. Its 50 MP main camera has optical image stabilisation, joined by ultra-wide and macro lenses, and the 5000 mAh battery fast charges at 25W. Android 15 with One UI 7 and Gorilla Glass Victus.'),
  (2, 'The Galaxy A07 with 64 GB of storage, running Android 15 and One UI 7 on a MediaTek Helio G99. A 6.7-inch 90Hz display and a 5000 mAh battery with 25W fast charging, plus a 50 MP main camera, a 3.5 mm headphone jack and microSD expansion.'),
  (3, 'The Galaxy A26 5G with 256 GB of storage, a 6.7-inch Super AMOLED screen at 120Hz and an Exynos 1380. IP67 rated against dust and water, with a 50 MP stabilised main camera, 8 MP ultra-wide and a 5000 mAh battery on 25W fast charging. Android 15 with One UI 7.'),
  (4, 'The Galaxy A37 5G with 256 GB of storage, driven by an Exynos 1480 behind a 6.7-inch 120Hz Super AMOLED with Vision Booster for bright sunlight. A 50 MP main camera with ultra-wide and macro, and a 5000 mAh battery that reaches 60% in half an hour on 45W Super Fast Charging. Takes microSD up to 2 TB.'),
  (5, 'The 256 GB Galaxy A36 5G: a 6.7-inch 120Hz Super AMOLED display, a Snapdragon 6 Gen 3 and 8 GB of RAM. The 50 MP main camera is stabilised and backed by ultra-wide and macro lenses, and the 5000 mAh battery takes 45W fast charging. IP67 rated, on Android 15.'),
  (6, 'Samsung''s Galaxy A05s with 64 GB of storage and a 6.7-inch 90Hz FHD+ display. A Snapdragon 680 and a 5000 mAh battery with 25W fast charging make it an easy all-day phone, and the 50 MP main camera handles everyday shots well. Keeps the 3.5 mm headphone jack and takes a microSD card.'),
  (7, 'The 128 GB Galaxy A05s, with a 6.7-inch 90Hz FHD+ screen and a Snapdragon 680. A 5000 mAh battery with 25W fast charging lasts the day, and the 50 MP main camera is backed by depth and macro lenses. Headphone jack, microSD expansion and a side fingerprint sensor.'),
  (8, 'The Galaxy A56 5G with 128 GB of storage and an Exynos 1580, on a 6.7-inch 120Hz Super AMOLED display. A 50 MP stabilised main camera with a 12 MP ultra-wide, a 5000 mAh battery on 45W fast charging, and an IP67 rating. Android 15 with One UI 7.'),
  (9, 'An honest entry-level Samsung: the Galaxy A06 with 64 GB of storage, a 6.7-inch 90Hz display and a MediaTek Helio G85. The 5000 mAh battery with 25W fast charging is the strong point, alongside a 50 MP main camera, a headphone jack and microSD expansion.'),
  (10, 'A rugged phone that stays affordable: the Armor X16 with 128 GB of storage, 6 GB of RAM and a 10,360 mAh battery on 33W fast charging. A bright 910-nit 6.56-inch 90Hz display, a 48 MP main camera and a 20 MP night-vision lens. IP68 and IP69K rated, MIL-STD-810H certified, with NFC and a headphone jack.'),
  (11, 'The RugKing 3 Pro: 128 GB of UFS 2.2 storage, 8 GB of RAM and a 5700 mAh battery in a body rated IP68 and IP69K and certified to MIL-STD-810H. A 6.56-inch 120Hz display behind Gorilla Glass 3, a 48 MP main camera, and a Water-Lock mode for washing it down. Android 15.'),
  (12, 'The RugKing 4 Pro pairs a 10,200 mAh battery with 256 GB of UFS 2.2 storage and 8 GB of RAM, so it lasts well beyond a working day. A 6.56-inch display, a 48 MP main camera, dual SIM and microSD up to 2 TB. IP68 and IP69K rated, MIL-STD-810H certified, on Android 15.'),
  (13, 'The Armor 26 Ultra is the camera phone of the rugged range: a 200 MP Samsung HP3 main sensor with 3.2x optical zoom, a 50 MP ultra-wide and 64 MP night vision. A Dimensity 8020 5G chip, 512 GB of storage, 12 GB of RAM and a 15,600 mAh battery that takes 120W wired charging. IP68, IP69K and MIL-STD-810H.'),
  (14, 'The Armor 30 Pro 5G adds a second 3.4-inch display on the back, so you can frame a shot on the main camera or check a notification without opening the phone. A Dimensity 7300X, 16 GB of RAM, 512 GB of storage and a 12,800 mAh battery with 66W fast charging, behind a 6.95-inch 120Hz FHD+ screen. IP68, IP69K and MIL-STD-810H.'),
  (15, 'A 4G rugged phone with a 10,600 mAh battery, 33W fast charging and 30W wireless charging. The Armor 27 carries 256 GB of UFS 2.2 storage, 12 GB of RAM and a 50 MP Samsung GN1 main camera with 50 MP ultra-wide and 64 MP night vision, behind a 6.78-inch 120Hz FHD+ display. IP68, IP69K and MIL-STD-810H.'),
  (16, 'Built around a 22,000 mAh battery — days of use, not hours — with 66W fast charging and 10W reverse charging to top up other devices. The Armor 24 pairs 256 GB of storage and 12 GB of RAM with a 1000-lumen camping light, a 64 MP Sony main camera and 64 MP night vision. IP68 and IP69K rated, MIL-STD-810H certified, with NFC and a headphone jack.'),
  (17, 'A rugged 5G flagship: the RugOne Xever 7 with 512 GB of storage and 12 GB of RAM on a 6.67-inch 120Hz AMOLED. The 5550 mAh battery is removable and a second battery and covers are in the box, so a long shift never ends the day. Three cameras including 64 MP night vision with infrared, IP68 and IP69K rated and MIL-STD-810H certified. Android 16.'),
  (18, 'An inexpensive everyday Android: the Note 16 Pro with 128 GB of storage, a 6.52-inch HD+ display and a Unisoc T606. A 50 MP main camera, a 4400 mAh battery, dual SIM, a side fingerprint sensor and a 3.5 mm headphone jack.'),
  (19, 'The Note 18 Pro with 256 GB of storage and 6 GB of RAM, on a 6.78-inch 90Hz display behind Corning Gorilla Glass. A 64 MP Sony main camera with a 50 MP ultra-wide, a 5450 mAh battery, NFC and an IR blaster. Takes microSD up to 2 TB.'),
  (20, 'The Note 17 Pro is built around a 108 MP main camera and a 6.78-inch 120Hz AMOLED display — a lot of screen and sensor for the money. 256 GB of storage, 12 GB of RAM, a 32 MP front camera and a 5050 mAh battery, with the 33W charger included in the box.'),
  (21, 'A rugged 8-inch tablet for sites and vehicles. The Armor Pad Pro has 128 GB of storage, 8 GB of RAM and a 7650 mAh battery, with dual SIM 4G and VoLTE calling so it works as a phone too. A 48 MP Samsung camera, Wi-Fi 802.11ac, NFC and a headphone jack. IP68 and IP69K rated, MIL-STD-810H certified.'),
  (22, 'A tablet built for children: the Tab A9 Pro Kids ships in a shockproof foam case with a rotating handle and kickstand, and a stylus is included. Kids Space parental controls, an 8.68-inch 90Hz screen certified by TÜV SÜD for low blue light, 128 GB of storage and a 5040 mAh battery. Android 15, dual SIM and dual-band Wi-Fi.'),
  (23, 'The Armor 27T Pro Plus carries a FLIR thermal imaging camera that reads from -10°C to 450°C and sees through smoke, glare and darkness — genuinely useful for electrical, plumbing and vehicle work. A Dimensity 6300 5G chip, 256 GB of UFS 3.1 storage, 12 GB of RAM and a 10,600 mAh battery with wired, wireless and reverse charging. Works from -30°C to 55°C.'),
  (24, 'The Armor Watch Pro is a rugged outdoor watch with a 1.5-inch AMOLED display at 466 x 466 and a 410 mAh battery — 8 days of normal use, 34 days on standby. Built-in GPS, IP68 and IP69K rated, 5ATM waterproof and MIL-STD-810H certified, with a 48mm case and a 22mm strap that fits wrists from 138 to 233 mm.'),
  (26, 'A fitted protective case for the Ulefone Armor 22, shaped to the phone so the ports, buttons and camera stay clear.'),
  (27, 'A fitted protective case for the Ulefone Armor X16, shaped to the phone so the ports, buttons and camera stay clear.'),
  (28, 'A fitted protective case for the Ulefone Armor 11, shaped to the phone so the ports, buttons and camera stay clear.'),
  (29, 'A fitted protective case for the Ulefone Armor 12S in black, shaped to the phone so the ports, buttons and camera stay clear.'),
  (30, 'A dual-camera inspection endoscope for Ulefone Armor and RugKing phones with a uSmart expansion connector — it is not a universal USB endoscope. Front and side 720p cameras with seven dimmable LEDs on an 8 mm lens and a 2 m semi-rigid cable. Magnet and hook attachments, lens case and screws are in the box.'),
  (31, 'An outdoor sports watch with real navigation hardware: GPS, compass, altimeter and barometer, on a 2.01-inch full-touch display. The 600 mAh battery runs 5 to 10 days, and it tracks heart rate, blood oxygen and sleep across 100+ sports modes. IP68 rated in an alloy case, with an LED flashlight. Works with Android and iOS.'),
  (32, 'A 1.96-inch full-touch sports watch with Bluetooth calling, 100+ sports modes and heart rate, blood oxygen and sleep tracking. 3ATM water resistant with a 420 mAh battery, music control, SOS and voice assistant, through the GloryFit app on Android or iOS.'),
  (33, 'A 1.3-inch round touchscreen smart watch in black. Ask us in store or on WhatsApp for the full specification and current availability.'),
  (34, 'A 1.3-inch round touchscreen smart watch in grey. Ask us in store or on WhatsApp for the full specification and current availability.'),
  (35, 'Wireless earbuds with 10mm dynamic drivers and Bluetooth 5.1, good for about 5 hours per charge and 20 hours with the case. SBC and AAC, a 10 m range, USB-C charging and three pairs of tips in the box.'),
  (36, 'A solar-powered alarm with a 120 dB siren and a PIR intrusion sensor, for indoor or outdoor use. No wiring and no mains power needed, which suits a gate, a shed or an outbuilding.'),
  (38, 'A Bluetooth OBD2 scanner for reading and clearing engine fault codes and live data. Uses the ELM327 interface and supports all OBD-II protocols, pairing with Android phones, tablets and Windows laptops. Not compatible with iPhone — iOS does not support the Bluetooth profile this adapter uses.'),
  (39, 'A 50W wireless charging stand with 3D air cooling and a 3200 rpm fan, plus over-current, over-voltage and over-temperature protection and foreign object detection. The full 50W applies to the Ulefone Armor 23 and 28 series; other Qi phones charge at 15W EPP, 10W Samsung or 7.5W Apple. A USB-C cable is included but the 5-20V/3A adapter is not.'),
  (41, 'Compact wireless earbuds with 7.2mm dynamic drivers and Bluetooth 5.0 — about 4 hours per charge and 12 hours with the USB-C charging case. Touch controls.'),
  (42, 'A security camera that screws into an ordinary E27 light socket, so there is no wiring to run. Dual lens with 350-degree pan and 90-degree tilt, colour night vision, two-way audio and motion detection with human tracking. Records to microSD and works over its own hotspot if there is no network.'),
  (45, 'A USB-A to USB-C cable for charging and data transfer.'),
  (65, 'The Mobicel S1, a straightforward entry-level Android phone and a sensible first handset or spare. Ask us in store or on WhatsApp for the full specification and current availability.'),
  (90, 'The Galaxy A36 5G with 128 GB of storage, built on a Snapdragon 6 Gen 3 behind a 6.7-inch 120Hz Super AMOLED display. A 50 MP stabilised main camera with 8 MP ultra-wide, a 5000 mAh battery on 45W fast charging, and an IP67 rating. Android 15 with One UI 7.'),
  (109, 'The Samsung Galaxy A57 5G with 256 GB of storage, new and sealed. Ask us in store or on WhatsApp for the full specification and current availability.'),
  (110, 'The Samsung Galaxy A16 with 128 GB of storage, new and sealed. Ask us in store or on WhatsApp for the full specification and current availability.'),
  (111, 'The Samsung Galaxy A57 5G with 128 GB of storage, new and sealed. Ask us in store or on WhatsApp for the full specification and current availability.'),
  (112, 'The Galaxy A37 5G with 128 GB of storage, built around an Exynos 1480 and a 6.7-inch 120Hz Super AMOLED with Vision Booster. A 50 MP main camera with ultra-wide and macro lenses, and 45W Super Fast Charging on a 5000 mAh battery.'),
  (113, 'The Galaxy A17 with 128 GB of storage, on a 6.7-inch Super AMOLED 90Hz display driven by a MediaTek Helio G99. The 50 MP main camera is optically stabilised and the 5000 mAh battery fast charges at 25W. Android 15 with One UI 7.'),
  (114, 'The Galaxy A26 5G with 128 GB of storage, pairing a 6.7-inch 120Hz Super AMOLED display with an Exynos 1380. IP67 rated against dust and water, with a 50 MP stabilised main camera and a 5000 mAh battery on 25W fast charging.'),
  (117, 'The Ulefone Note 20 Pro with 256 GB of storage and 4 GB of RAM. Ask us in store or on WhatsApp for the full specification and current availability.')
)
update public.products p
   set description = c.body, updated_at = now()
  from copy c
 where p.id = c.id
   and length(coalesce(p.description, '')) < 40;

insert into written
select p.id, p.name, length(p.description)
from public.products p
where p.id in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 38, 39, 41, 42, 45, 65, 90, 109, 110, 111, 112, 113, 114, 117);

commit;

select count(*) as products_described,
       min(chars) as shortest,
       round(avg(chars)) as average,
       max(chars) as longest
from written where chars >= 40;
