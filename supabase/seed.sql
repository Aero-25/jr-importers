-- JR Importers demo/production seed data.
-- Idempotent: re-running clears previously seeded rows (marked with JR- SKUs / seed tags) and reinserts.
-- Apply with the Supabase Management API or `supabase db execute`.

begin;

-- ---------------------------------------------------------------------------
-- Store settings (jsonb key/value)
-- ---------------------------------------------------------------------------
insert into public.settings (key, value) values
  ('store_name', to_jsonb('JR Importers'::text)),
  ('store_tagline', to_jsonb('Namibia''s home of genuine phones & electronics'::text)),
  ('store_email', to_jsonb('sales@jrimporters.com'::text)),
  ('store_phone', to_jsonb('+264 81 562 9203'::text)),
  ('store_whatsapp', to_jsonb('26481562920'::text)),
  ('store_address', to_jsonb('Independence Avenue, Windhoek, Namibia'::text)),
  ('store_hours', to_jsonb('Mon–Fri 08:00–18:00 · Sat 09:00–14:00'::text)),
  ('currency', to_jsonb('N$'::text)),
  ('currency_code', to_jsonb('NAD'::text)),
  ('vat_rate', to_jsonb(15)),
  ('delivery_fee', to_jsonb(150)),
  ('free_delivery_threshold', to_jsonb(5000)),
  ('loyalty_earn_rate', to_jsonb(1)),
  ('bank_name', to_jsonb('Bank Windhoek'::text)),
  ('bank_account_name', to_jsonb('JR Importers CC'::text)),
  ('bank_account_number', to_jsonb('8004257139'::text)),
  ('bank_branch_code', to_jsonb('481972'::text)),
  ('facebook_url', to_jsonb('https://facebook.com/jrimporters'::text)),
  ('instagram_url', to_jsonb('https://instagram.com/jrimporters'::text))
on conflict (key) do update set value = excluded.value, updated_at = now();

-- ---------------------------------------------------------------------------
-- Hero banners
-- ---------------------------------------------------------------------------
delete from public.hero_images where title like 'JR%';
insert into public.hero_images (title, image_url, link_url, order_index, active) values
  ('JR | Flagship phones, real Namibian prices', 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=1600&q=80', '#shop', 0, true),
  ('JR | Laptops & tablets built for work and play', 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1600&q=80', '#shop', 1, true),
  ('JR | Audio that moves you', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1600&q=80', '#shop', 2, true);

-- ---------------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------------
delete from public.suppliers where name like 'JR Seed::%' or company in ('Tech Distributors Africa','Mobile World Imports','Audio & Gadget Supply','Coastal Electronics','Apex Computing');
insert into public.suppliers (name, company, contact_person, email, phone, address, payment_terms, active) values
  ('Tech Distributors Africa', 'Tech Distributors Africa', 'Lerato Mokoena', 'orders@techdistafrica.co.za', '+27 11 555 0192', 'Sandton, Johannesburg, South Africa', '30 days', true),
  ('Mobile World Imports', 'Mobile World Imports', 'Ahmed Patel', 'sales@mobileworld.ae', '+971 4 555 8821', 'Deira, Dubai, UAE', '50% deposit', true),
  ('Audio & Gadget Supply', 'Audio & Gadget Supply', 'Maria Goagoses', 'hello@audiogadget.na', '+264 61 240 118', 'Lazarett Street, Walvis Bay, Namibia', 'COD', true),
  ('Coastal Electronics', 'Coastal Electronics', 'Johannes Amupanda', 'procurement@coastalelec.na', '+264 64 205 770', 'Swakopmund, Namibia', '14 days', true),
  ('Apex Computing', 'Apex Computing', 'Priya Naidoo', 'b2b@apexcomputing.co.za', '+27 21 555 7340', 'Cape Town, South Africa', '30 days', true);

-- ---------------------------------------------------------------------------
-- Product catalogue
-- ---------------------------------------------------------------------------
delete from public.products where sku like 'JR-%';

insert into public.products
  (name, brand, category, description, price, cost_price, stock, reorder_level, sku, barcode, color, image, image1,
   spec_display, spec_processor, spec_ram, spec_storage, spec_battery, spec_back_camera, spec_front_camera, spec_os, spec_weight, spec_extras,
   active, featured)
values
-- Smartphones --------------------------------------------------------------
('Apple iPhone 15 Pro Max 256GB', 'Apple', 'Smartphones', 'The ultimate iPhone. Titanium design, A17 Pro chip and a 5x telephoto camera. Imported, sealed and warrantied.', 28999, 23200, 14, 5, 'JR-IP15PM-256', '0194253940010', 'Natural Titanium', 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=900&q=80', 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=900&q=80',
  '6.7-inch Super Retina XDR ProMotion', 'A17 Pro', '8GB', '256GB', '4422mAh', '48MP + 12MP + 12MP', '12MP TrueDepth', 'iOS 17', '221g', 'Titanium frame, USB-C, Action Button, IP68', true, true),
('Apple iPhone 15 128GB', 'Apple', 'Smartphones', 'iPhone 15 with the Dynamic Island, 48MP main camera and USB-C. Sealed and ready to go.', 18999, 15100, 22, 6, 'JR-IP15-128', '0194253930011', 'Blue', 'https://images.unsplash.com/photo-1556656793-08538906a9f8?w=900&q=80', 'https://images.unsplash.com/photo-1556656793-08538906a9f8?w=900&q=80',
  '6.1-inch Super Retina XDR', 'A16 Bionic', '6GB', '128GB', '3349mAh', '48MP + 12MP', '12MP TrueDepth', 'iOS 17', '171g', 'Dynamic Island, USB-C, IP68', true, true),
('Apple iPhone 14 128GB', 'Apple', 'Smartphones', 'A beautifully reliable iPhone with all-day battery and a brilliant dual-camera system.', 15499, 12300, 18, 6, 'JR-IP14-128', '0194253410012', 'Midnight', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=900&q=80', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=900&q=80',
  '6.1-inch Super Retina XDR', 'A15 Bionic', '6GB', '128GB', '3279mAh', '12MP + 12MP', '12MP TrueDepth', 'iOS 16', '172g', 'Crash Detection, IP68', true, false),
('Samsung Galaxy S24 Ultra 256GB', 'Samsung', 'Smartphones', 'Galaxy AI is here. Titanium build, built-in S Pen and a 200MP camera system.', 26499, 21000, 11, 5, 'JR-SGS24U-256', '8806095260013', 'Titanium Gray', 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=900&q=80', 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=900&q=80',
  '6.8-inch QHD+ Dynamic AMOLED 2X 120Hz', 'Snapdragon 8 Gen 3', '12GB', '256GB', '5000mAh', '200MP + 50MP + 12MP + 10MP', '12MP', 'Android 14 / One UI 6.1', '232g', 'Built-in S Pen, Galaxy AI, IP68', true, true),
('Samsung Galaxy A55 5G 128GB', 'Samsung', 'Smartphones', 'Premium mid-ranger with a metal frame, 120Hz Super AMOLED and a 50MP OIS camera.', 8499, 6400, 27, 8, 'JR-SGA55-128', '8806095260014', 'Awesome Iceblue', 'https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=900&q=80', 'https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=900&q=80',
  '6.6-inch FHD+ Super AMOLED 120Hz', 'Exynos 1480', '8GB', '128GB', '5000mAh', '50MP OIS + 12MP + 5MP', '32MP', 'Android 14 / One UI 6.1', '213g', '25W charging, IP67, 4 OS upgrades', true, false),
('Google Pixel 8 Pro 256GB', 'Google', 'Smartphones', 'The most helpful Pixel yet with Google Tensor G3 and pro-grade computational photography.', 19999, 15800, 8, 4, 'JR-PX8P-256', '0840244701015', 'Obsidian', 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=900&q=80', 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=900&q=80',
  '6.7-inch LTPO OLED 120Hz', 'Google Tensor G3', '12GB', '256GB', '5050mAh', '50MP + 48MP + 48MP', '10.5MP', 'Android 14', '213g', '7 years updates, Magic Editor, IP68', true, false),
('Xiaomi Redmi Note 13 Pro 256GB', 'Xiaomi', 'Smartphones', 'Flagship-level 200MP camera and a 120Hz AMOLED display at an unbeatable price.', 5999, 4350, 31, 10, 'JR-RN13P-256', '6941812749016', 'Midnight Black', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=900&q=80&sat=-30', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=900&q=80&sat=-30',
  '6.67-inch FHD+ AMOLED 120Hz', 'Snapdragon 7s Gen 2', '8GB', '256GB', '5100mAh', '200MP OIS + 8MP + 2MP', '16MP', 'Android 13 / MIUI 14', '187g', '67W turbo charging, IP54', true, false),
('Samsung Galaxy A15 4G 128GB', 'Samsung', 'Smartphones', 'A dependable everyday smartphone with a vivid Super AMOLED screen and big battery.', 3499, 2500, 40, 12, 'JR-SGA15-128', '8806095260017', 'Blue Black', 'https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=900&q=80&sat=-20', 'https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=900&q=80&sat=-20',
  '6.5-inch FHD+ Super AMOLED 90Hz', 'MediaTek Helio G99', '4GB', '128GB', '5000mAh', '50MP + 5MP + 2MP', '13MP', 'Android 14 / One UI 6', '200g', '25W charging, expandable storage', true, false),
-- Laptops ------------------------------------------------------------------
('Apple MacBook Air 13 M3 256GB', 'Apple', 'Laptops', 'Strikingly thin, all-day battery and the blazing-fast M3 chip. The perfect everyday laptop.', 23999, 19200, 9, 3, 'JR-MBA13-M3', '0195949000018', 'Midnight', 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=900&q=80', 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=900&q=80',
  '13.6-inch Liquid Retina', 'Apple M3 8-core', '8GB', '256GB SSD', 'Up to 18 hours', null, '1080p FaceTime HD', 'macOS Sonoma', '1.24kg', 'MagSafe, 2x Thunderbolt, backlit Magic Keyboard', true, true),
('Dell XPS 13 Plus i7', 'Dell', 'Laptops', 'A stunning edge-to-edge InfinityEdge display in a premium CNC aluminium chassis.', 21499, 17100, 6, 3, 'JR-DXPS13-I7', '0884116401019', 'Platinum', 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=900&q=80', 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=900&q=80',
  '13.4-inch FHD+ InfinityEdge', 'Intel Core i7-1360P', '16GB', '512GB SSD', 'Up to 12 hours', null, '720p HD', 'Windows 11', '1.26kg', 'Edge-to-edge keyboard, Thunderbolt 4', true, false),
('HP Pavilion 15 Ryzen 5', 'HP', 'Laptops', 'A versatile all-rounder for study and home office with a crisp Full HD display.', 11999, 9200, 13, 4, 'JR-HPP15-R5', '0196068700010', 'Natural Silver', 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=900&q=80', 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=900&q=80',
  '15.6-inch FHD IPS', 'AMD Ryzen 5 7530U', '16GB', '512GB SSD', 'Up to 9 hours', null, '720p HD', 'Windows 11', '1.74kg', 'Backlit keyboard, Wi-Fi 6, USB-C', true, false),
('Lenovo IdeaPad Slim 3 i5', 'Lenovo', 'Laptops', 'Reliable performance and a comfortable keyboard for everyday productivity.', 9499, 7100, 17, 5, 'JR-LNIP3-I5', '0197529400011', 'Arctic Grey', 'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=900&q=80', 'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=900&q=80',
  '15.6-inch FHD', 'Intel Core i5-1235U', '8GB', '512GB SSD', 'Up to 8 hours', null, '720p HD', 'Windows 11', '1.62kg', 'Rapid Charge, privacy shutter', true, false),
-- Tablets ------------------------------------------------------------------
('Apple iPad 10th Gen 64GB Wi-Fi', 'Apple', 'Tablets', 'A colourful, all-screen iPad with the A14 Bionic chip and USB-C. Great for everyone.', 9999, 7900, 15, 5, 'JR-IPAD10-64', '0194253411012', 'Silver', 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=900&q=80', 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=900&q=80',
  '10.9-inch Liquid Retina', 'A14 Bionic', '4GB', '64GB', 'Up to 10 hours', '12MP', '12MP Ultra Wide', 'iPadOS 17', '477g', 'USB-C, Touch ID, Apple Pencil support', true, false),
('Samsung Galaxy Tab A9+ 128GB', 'Samsung', 'Tablets', 'A big, immersive screen with quad speakers — perfect for streaming and the whole family.', 5499, 4100, 19, 6, 'JR-TABA9P-128', '8806095260020', 'Graphite', 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=900&q=80&sat=-40', 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=900&q=80&sat=-40',
  '11-inch WUXGA 90Hz', 'Snapdragon 695', '8GB', '128GB', '7040mAh', '8MP', '5MP', 'Android 13 / One UI', '480g', 'Quad Dolby Atmos speakers, microSD', true, false),
-- Audio --------------------------------------------------------------------
('Apple AirPods Pro 2 (USB-C)', 'Apple', 'Audio', 'Up to 2x more Active Noise Cancellation, Adaptive Audio and a USB-C charging case.', 4799, 3600, 33, 10, 'JR-APP2-USBC', '0194253940021', 'White', 'https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=900&q=80', 'https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=900&q=80',
  null, 'Apple H2', null, null, 'Up to 30h with case', null, null, null, '50.8g', 'Adaptive Audio, Transparency, IP54, USB-C', true, true),
('Sony WH-1000XM5 Wireless', 'Sony', 'Audio', 'Industry-leading noise cancellation with exceptional comfort and 30-hour battery life.', 6499, 4900, 12, 4, 'JR-WH1000XM5', '0027242923011', 'Black', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=900&q=80', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=900&q=80',
  null, null, null, null, 'Up to 30 hours', null, null, null, '250g', '8 mics, multipoint, speak-to-chat', true, true),
('JBL Tune 770NC Wireless', 'JBL', 'Audio', 'Adaptive noise cancelling headphones with JBL Pure Bass and 70-hour battery life.', 2299, 1650, 24, 8, 'JR-JBL770NC', '6925281900012', 'Black', 'https://images.unsplash.com/photo-1545127398-14699f92334b?w=900&q=80', 'https://images.unsplash.com/photo-1545127398-14699f92334b?w=900&q=80',
  null, null, null, null, 'Up to 70 hours', null, null, null, '220g', 'Adaptive ANC, fast charge, multipoint', true, false),
('Samsung Galaxy Buds2 Pro', 'Samsung', 'Audio', 'Hi-Fi 24-bit sound, intelligent ANC and a comfortable, lightweight fit.', 2999, 2200, 21, 7, 'JR-BUDS2PRO', '8806095260023', 'Graphite', 'https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?w=900&q=80', 'https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?w=900&q=80',
  null, null, null, null, 'Up to 29h with case', null, null, null, '5.5g each', 'Intelligent ANC, 360 Audio, IPX7', true, false),
('JBL Flip 6 Portable Speaker', 'JBL', 'Audio', 'Bold JBL Original Pro sound in a rugged, IP67 waterproof and dustproof package.', 1899, 1350, 28, 9, 'JR-JBLFLIP6', '6925281900025', 'Blue', 'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=900&q=80', 'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=900&q=80',
  null, null, null, null, 'Up to 12 hours', null, null, null, '550g', 'IP67 waterproof, PartyBoost', true, false),
-- Wearables ----------------------------------------------------------------
('Apple Watch Series 9 GPS 45mm', 'Apple', 'Wearables', 'A magical new way to use your Watch with the double tap gesture and a brighter display.', 8499, 6700, 10, 4, 'JR-AWS9-45', '0194253940034', 'Midnight', 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=900&q=80', 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=900&q=80',
  '45mm Always-On Retina', 'S9 SiP', null, '64GB', 'Up to 18 hours', null, null, 'watchOS 10', '38.7g', 'Double tap, ECG, blood oxygen, IP6X', true, false),
('Samsung Galaxy Watch6 44mm', 'Samsung', 'Wearables', 'Advanced sleep coaching and personalised heart-rate zones in a refined design.', 5299, 4000, 14, 5, 'JR-GW6-44', '8806095260026', 'Graphite', 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=900&q=80', 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=900&q=80',
  '1.5-inch Super AMOLED', 'Exynos W930', '2GB', '16GB', 'Up to 40 hours', null, null, 'Wear OS / One UI Watch 5', '33.3g', 'BIA sensor, sleep coaching, 5ATM', true, false),
-- Accessories --------------------------------------------------------------
('Anker 737 Power Bank 24000mAh', 'Anker', 'Accessories', 'A 140W three-port power bank that fast-charges a MacBook, iPhone and earbuds at once.', 1599, 1100, 26, 8, 'JR-ANK737', '0194644090012', 'Black', 'https://images.unsplash.com/photo-1585338447937-7082f8fc763d?w=900&q=80', 'https://images.unsplash.com/photo-1585338447937-7082f8fc763d?w=900&q=80',
  null, null, null, '24000mAh', '140W output', null, null, null, '630g', 'Smart digital display, USB-C PD 3.1', true, false),
('Apple 20W USB-C Power Adapter', 'Apple', 'Accessories', 'Fast, efficient charging at home, in the office or on the go.', 449, 290, 60, 15, 'JR-APL20W', '0194252157013', 'White', 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=900&q=80', 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=900&q=80',
  null, null, null, null, '20W USB-C PD', null, null, null, '60g', 'Compact, USB-C Power Delivery', true, false),
('Samsung 45W Super Fast Charger', 'Samsung', 'Accessories', 'Charge compatible Galaxy devices to full in record time with 45W Super Fast Charging.', 599, 390, 38, 12, 'JR-SAM45W', '8806095260029', 'Black', 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=900&q=80&sat=-40', 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=900&q=80&sat=-40',
  null, null, null, null, '45W USB-C PD', null, null, null, '65g', 'PPS, includes 5A USB-C cable', true, false);

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
delete from public.customers where email like '%@jrseed.na';
insert into public.customers (name, email, phone, address, city, region, customer_type, credit_limit, active) values
  ('Tangeni Shikongo', 'tangeni@jrseed.na', '+264 81 234 5671', 'Erf 1204, Klein Windhoek', 'Windhoek', 'Khomas', 'retail', 0, true),
  ('Helena Nakale', 'helena@jrseed.na', '+264 85 234 5672', '12 Sam Nujoma Drive', 'Swakopmund', 'Erongo', 'retail', 0, true),
  ('Petrus Amukwa', 'petrus@jrseed.na', '+264 81 234 5673', 'Shop 8, Maerua Mall', 'Windhoek', 'Khomas', 'wholesale', 50000, true),
  ('Sanet van Wyk', 'sanet@jrseed.na', '+264 81 234 5674', '4 Theo-Ben Gurirab St', 'Walvis Bay', 'Erongo', 'retail', 0, true),
  ('Johannes Haufiku', 'johannes@jrseed.na', '+264 85 234 5675', 'Ongwediva Main Road', 'Ongwediva', 'Oshana', 'retail', 0, true),
  ('Maria Goagoses', 'mariag@jrseed.na', '+264 81 234 5676', '23 Robert Mugabe Ave', 'Windhoek', 'Khomas', 'retail', 0, true),
  ('Frans Iipinge', 'frans@jrseed.na', '+264 81 234 5677', 'Town Centre', 'Oshakati', 'Oshana', 'wholesale', 30000, true),
  ('Lisa Beukes', 'lisa@jrseed.na', '+264 85 234 5678', '7 Nathaniel Maxuilili St', 'Walvis Bay', 'Erongo', 'retail', 0, true);

-- ---------------------------------------------------------------------------
-- Coupons
-- ---------------------------------------------------------------------------
delete from public.coupons where code in ('WELCOME10','FREEDELIVERY','SUMMER500');
insert into public.coupons (code, discount_type, discount_value, discount_percent, min_purchase, max_uses, times_used, valid_from, valid_until, notes, active, created_by) values
  ('WELCOME10', 'percentage', 10, 10, 1000, 500, 37, now() - interval '20 days', now() + interval '60 days', 'First-order welcome discount', true, 'seed'),
  ('FREEDELIVERY', 'fixed', 150, null, 2500, 300, 64, now() - interval '15 days', now() + interval '45 days', 'Free standard delivery promo', true, 'seed'),
  ('SUMMER500', 'fixed', 500, null, 8000, 100, 12, now() - interval '5 days', now() + interval '30 days', 'N$500 off big-ticket items', true, 'seed');

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
delete from public.expenses where created_by = 'seed';
insert into public.expenses (category, description, amount, supplier_vendor, receipt_number, payment_method, tax_deductible, notes, expense_date, created_by) values
  ('Rent', 'Shop rent - Independence Avenue', 18500, 'Windhoek Properties', 'RENT-2026-06', 'EFT', true, 'Monthly', current_date - 8, 'seed'),
  ('Utilities', 'Electricity & water', 3240, 'City of Windhoek', 'COW-88213', 'EFT', true, null, current_date - 6, 'seed'),
  ('Salaries', 'Sales staff wages', 42000, 'Payroll', 'PAY-2026-06', 'EFT', true, '3 staff', current_date - 5, 'seed'),
  ('Marketing', 'Facebook & Instagram ads', 4800, 'Meta Platforms', 'META-552190', 'Card', true, 'June campaign', current_date - 4, 'seed'),
  ('Freight', 'Import clearing & freight', 12600, 'Mobile World Imports', 'FRT-2026-214', 'EFT', true, 'iPhone shipment', current_date - 3, 'seed'),
  ('Supplies', 'Packaging & receipt rolls', 760, 'Office National', 'ON-77410', 'Cash', false, null, current_date - 2, 'seed');

-- ---------------------------------------------------------------------------
-- Orders (spread over last 30 days, mixed statuses, items as jsonb)
-- ---------------------------------------------------------------------------
delete from public.orders where notes = 'seed-order';
insert into public.orders
  (customer_name, customer_email, customer_phone, customer_city, customer_region, delivery_address, delivery_method,
   items, subtotal_amount, vat_amount, total_amount, payment_method, payment_reference, status, notes, created_at, paid_at)
values
  ('Tangeni Shikongo','tangeni@jrseed.na','+264 81 234 5671','Windhoek','Khomas','Erf 1204, Klein Windhoek','Delivery',
   '[{"name":"Apple iPhone 15 128GB","qty":1,"price":18999},{"name":"Apple 20W USB-C Power Adapter","qty":1,"price":449}]'::jsonb,
   16911.30, 2536.70, 19448.00, 'Card (DPO)', 'DPO-558201', 'Completed', 'seed-order', now() - interval '26 days', now() - interval '26 days'),
  ('Helena Nakale','helena@jrseed.na','+264 85 234 5672','Swakopmund','Erongo','12 Sam Nujoma Drive','Delivery',
   '[{"name":"Sony WH-1000XM5 Wireless","qty":1,"price":6499}]'::jsonb,
   5651.30, 847.70, 6499.00, 'Card (DPO)', 'DPO-558977', 'Completed', 'seed-order', now() - interval '22 days', now() - interval '22 days'),
  ('Petrus Amukwa','petrus@jrseed.na','+264 81 234 5673','Windhoek','Khomas','Shop 8, Maerua Mall','Collection',
   '[{"name":"Samsung Galaxy A55 5G 128GB","qty":3,"price":8499}]'::jsonb,
   22171.30, 3325.70, 25497.00, 'EFT', 'EFT-220114', 'Completed', 'seed-order', now() - interval '19 days', now() - interval '19 days'),
  ('Sanet van Wyk','sanet@jrseed.na','+264 81 234 5674','Walvis Bay','Erongo','4 Theo-Ben Gurirab St','Delivery',
   '[{"name":"Apple iPad 10th Gen 64GB Wi-Fi","qty":1,"price":9999},{"name":"JBL Flip 6 Portable Speaker","qty":1,"price":1899}]'::jsonb,
   10346.09, 1551.91, 11898.00, 'Card (DPO)', 'DPO-559440', 'Dispatched', 'seed-order', now() - interval '12 days', now() - interval '12 days'),
  ('Johannes Haufiku','johannes@jrseed.na','+264 85 234 5675','Ongwediva','Oshana','Ongwediva Main Road','Delivery',
   '[{"name":"Xiaomi Redmi Note 13 Pro 256GB","qty":2,"price":5999}]'::jsonb,
   10433.04, 1564.96, 11998.00, 'Card (DPO)', 'DPO-559881', 'Processing', 'seed-order', now() - interval '6 days', now() - interval '6 days'),
  ('Maria Goagoses','mariag@jrseed.na','+264 81 234 5676','Windhoek','Khomas','23 Robert Mugabe Ave','Collection',
   '[{"name":"Apple AirPods Pro 2 (USB-C)","qty":1,"price":4799}]'::jsonb,
   4173.04, 625.96, 4799.00, 'Card (DPO)', 'DPO-560102', 'Paid', 'seed-order', now() - interval '3 days', now() - interval '3 days'),
  ('Frans Iipinge','frans@jrseed.na','+264 81 234 5677','Oshakati','Oshana','Town Centre','Delivery',
   '[{"name":"Samsung Galaxy A15 4G 128GB","qty":5,"price":3499}]'::jsonb,
   15213.04, 2281.96, 17495.00, 'EFT', 'EFT-220556', 'Processing', 'seed-order', now() - interval '2 days', now() - interval '2 days'),
  ('Lisa Beukes','lisa@jrseed.na','+264 85 234 5678','Walvis Bay','Erongo','7 Nathaniel Maxuilili St','Delivery',
   '[{"name":"Apple Watch Series 9 GPS 45mm","qty":1,"price":8499}]'::jsonb,
   7390.43, 1108.57, 8499.00, 'Card (DPO)', null, 'Pending', 'seed-order', now() - interval '20 hours', null),
  ('Tangeni Shikongo','tangeni@jrseed.na','+264 81 234 5671','Windhoek','Khomas','Erf 1204, Klein Windhoek','Collection',
   '[{"name":"JBL Tune 770NC Wireless","qty":1,"price":2299}]'::jsonb,
   1999.13, 299.87, 2299.00, 'Card (DPO)', null, 'Pending', 'seed-order', now() - interval '5 hours', null);

-- Enrich order line items with the real product id, cost and sku so the
-- Sales / Profit reports can compute accurate cost of sale and margins.
update public.orders o
set items = (
  select jsonb_agg(elem || jsonb_build_object('id', p.id, 'cost', p.cost_price, 'sku', p.sku))
  from jsonb_array_elements(o.items) elem
  left join public.products p on p.name = elem->>'name'
)
where o.notes = 'seed-order';

commit;
