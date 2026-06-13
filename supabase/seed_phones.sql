-- Align phone inventory to JR Importers' real brands: Samsung + Ulefone only.
begin;
-- Remove demo smartphones that are not Samsung/Ulefone.
delete from public.products where category = 'Smartphones' and brand not in ('Samsung', 'Ulefone');

-- Ulefone rugged + everyday lineup.
delete from public.products where sku like 'JRP-%';
insert into public.products
  (name, brand, category, description, price, cost_price, stock, reorder_level, sku, barcode, color, image, image1,
   spec_display, spec_processor, spec_ram, spec_storage, spec_battery, spec_back_camera, spec_front_camera, spec_os, spec_weight, spec_extras, active, featured)
values
('Ulefone Armor 26 Ultra', 'Ulefone', 'Smartphones', 'Rugged flagship with a FLIR thermal camera, 100MP main sensor and military-grade durability — built for the toughest Namibian conditions.', 11999, 9100, 12, 4, 'JRP-UF26U', '6937748735010', 'Black', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=900&q=80&sat=-30', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=900&q=80&sat=-30', '6.78-inch FHD+ 120Hz', 'MediaTek Dimensity 8200', '12GB', '512GB', '5950mAh', '100MP + FLIR thermal + 64MP night', '32MP', 'Android 14', '341g', 'IP68/IP69K · thermal cam · 120W charge', true, true),
('Ulefone Armor X13', 'Ulefone', 'Smartphones', 'Affordable rugged phone with a massive battery and drop/dust/water resistance — work-ready and reliable.', 4499, 3200, 22, 8, 'JRP-UFX13', '6937748735027', 'Orange', 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=900&q=80&sat=-20', 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=900&q=80&sat=-20', '6.52-inch HD+', 'MediaTek Helio G36', '6GB', '64GB', '6320mAh', '13MP', '5MP', 'Android 13', '297g', 'IP68/IP69K · 6320mAh · expandable', true, false),
('Ulefone Power Armor 18T', 'Ulefone', 'Smartphones', 'Big-battery rugged powerhouse with thermal imaging and fast 66W charging for days off-grid.', 9499, 7100, 14, 5, 'JRP-UFPA18T', '6937748735034', 'Black/Green', 'https://images.unsplash.com/photo-1556656793-08538906a9f8?w=900&q=80&sat=-25', 'https://images.unsplash.com/photo-1556656793-08538906a9f8?w=900&q=80&sat=-25', '6.58-inch FHD+ 120Hz', 'MediaTek Dimensity 900', '12GB', '256GB', '9600mAh', '108MP + FLIR thermal', '32MP', 'Android 12', '516g', 'IP68/IP69K · 9600mAh · 66W charge', true, true),
('Ulefone Note 16 Pro', 'Ulefone', 'Smartphones', 'Slim, stylish everyday smartphone with a big display and dependable battery at a great price.', 2799, 1950, 30, 10, 'JRP-UFN16P', '6937748735041', 'Midnight Green', 'https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=900&q=80&sat=-15', 'https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=900&q=80&sat=-15', '6.52-inch HD+ 90Hz', 'Unisoc T606', '8GB', '128GB', '4400mAh', '50MP', '8MP', 'Android 13', '189g', '90Hz · 128GB · expandable', true, false);

commit;
select brand, count(*) from public.products where category='Smartphones' group by brand order by 2 desc;
