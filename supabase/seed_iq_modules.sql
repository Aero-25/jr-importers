-- Seed data for the IQ-Retail modules (idempotent on seed tags).
begin;

-- ---------------- Debtors (accounts receivable) ----------------
delete from public.account_transactions where created_by = 'seed';

insert into public.account_transactions (account_type, customer_id, party_name, txn_type, amount, method, reference, doc_type, notes, txn_date, created_by)
select 'debtor', c.id, c.name, 'invoice', 25497.00, null, 'INV-A1001', 'invoice', 'Wholesale stock order on account', current_date - 48, 'seed'
from public.customers c where c.email = 'petrus@jrseed.na';
insert into public.account_transactions (account_type, customer_id, party_name, txn_type, amount, method, reference, doc_type, notes, txn_date, created_by)
select 'debtor', c.id, c.name, 'payment', -15000.00, 'EFT', 'RCT-7741', 'receipt', 'Part payment', current_date - 20, 'seed'
from public.customers c where c.email = 'petrus@jrseed.na';

insert into public.account_transactions (account_type, customer_id, party_name, txn_type, amount, method, reference, doc_type, notes, txn_date, created_by)
select 'debtor', c.id, c.name, 'invoice', 17495.00, null, 'INV-A1002', 'invoice', 'Bulk handset order', current_date - 12, 'seed'
from public.customers c where c.email = 'frans@jrseed.na';
insert into public.account_transactions (account_type, customer_id, party_name, txn_type, amount, method, reference, doc_type, notes, txn_date, created_by)
select 'debtor', c.id, c.name, 'payment', -10000.00, 'Cash', 'RCT-7782', 'receipt', 'Deposit', current_date - 5, 'seed'
from public.customers c where c.email = 'frans@jrseed.na';

-- ---------------- Creditors (accounts payable) ----------------
insert into public.account_transactions (account_type, supplier_id, party_name, txn_type, amount, method, reference, doc_type, notes, txn_date, created_by)
select 'creditor', s.id, s.name, 'bill', 126000.00, null, 'MW-INV-5521', 'bill', 'iPhone import shipment', current_date - 40, 'seed'
from public.suppliers s where s.name = 'Mobile World Imports';
insert into public.account_transactions (account_type, supplier_id, party_name, txn_type, amount, method, reference, doc_type, notes, txn_date, created_by)
select 'creditor', s.id, s.name, 'payment', -80000.00, 'EFT', 'PMT-3301', 'payment', 'Part settlement', current_date - 18, 'seed'
from public.suppliers s where s.name = 'Mobile World Imports';

insert into public.account_transactions (account_type, supplier_id, party_name, txn_type, amount, method, reference, doc_type, notes, txn_date, created_by)
select 'creditor', s.id, s.name, 'bill', 45000.00, null, 'TDA-INV-2290', 'bill', 'Samsung & accessories', current_date - 25, 'seed'
from public.suppliers s where s.name = 'Tech Distributors Africa';
insert into public.account_transactions (account_type, supplier_id, party_name, txn_type, amount, method, reference, doc_type, notes, txn_date, created_by)
select 'creditor', s.id, s.name, 'payment', -20000.00, 'EFT', 'PMT-3302', 'payment', 'On account', current_date - 8, 'seed'
from public.suppliers s where s.name = 'Tech Distributors Africa';

insert into public.account_transactions (account_type, supplier_id, party_name, txn_type, amount, method, reference, doc_type, notes, txn_date, created_by)
select 'creditor', s.id, s.name, 'bill', 18900.00, null, 'AGS-INV-118', 'bill', 'Audio gear restock', current_date - 6, 'seed'
from public.suppliers s where s.name = 'Audio & Gadget Supply';

-- ---------------- Quotes ----------------
delete from public.quotes where created_by = 'seed';
insert into public.quotes (quote_number, customer_id, customer_name, customer_email, customer_phone, items, subtotal_amount, vat_amount, total_amount, status, valid_until, notes, created_by)
select 'QUO-1001', c.id, c.name, c.email, c.phone,
  '[{"id":4,"name":"Samsung Galaxy S24 Ultra 256GB","qty":1,"price":26499,"cost":21000},{"id":19,"name":"Samsung Galaxy Buds2 Pro","qty":1,"price":2999,"cost":2200}]'::jsonb,
  25650.43, 3847.57, 29498.00, 'sent', current_date + 14, 'Customer comparing Ultra vs iPhone', 'seed'
from public.customers c where c.email = 'helena@jrseed.na';
insert into public.quotes (quote_number, customer_id, customer_name, customer_email, customer_phone, items, subtotal_amount, vat_amount, total_amount, status, valid_until, notes, created_by)
select 'QUO-1002', c.id, c.name, c.email, c.phone,
  '[{"id":9,"name":"Apple MacBook Air 13 M3 256GB","qty":2,"price":23999,"cost":19200}]'::jsonb,
  41737.39, 6260.61, 47998.00, 'draft', current_date + 21, 'Business bulk order - awaiting approval', 'seed'
from public.customers c where c.email = 'petrus@jrseed.na';

-- ---------------- Layby ----------------
delete from public.laybys where created_by = 'seed';
insert into public.laybys (layby_number, customer_id, customer_name, customer_phone, items, total_amount, deposit_amount, paid_amount, balance_amount, payments, status, due_date, notes, created_by)
select 'LAY-1001', c.id, c.name, c.phone,
  '[{"id":1,"name":"Apple iPhone 15 Pro Max 256GB","qty":1,"price":28999,"cost":23200}]'::jsonb,
  28999.00, 8000.00, 12000.00, 16999.00,
  ('[{"amount":8000,"method":"Cash","date":"'||(current_date - 21)||'","by":"admin@jrimporters.com"},{"amount":4000,"method":"Cash","date":"'||(current_date - 7)||'","by":"admin@jrimporters.com"}]')::jsonb,
  'active', current_date + 30, 'Christmas gift layby', 'seed'
from public.customers c where c.email = 'sanet@jrseed.na';

-- ---------------- Stock take ----------------
delete from public.stock_takes where created_by = 'seed';
insert into public.stock_takes (reference, status, items, total_variance, total_items, notes, created_by, completed_at)
values ('ST-1001', 'completed',
  '[{"product_id":15,"name":"Apple AirPods Pro 2 (USB-C)","sku":"JR-APP2-USBC","system_qty":33,"counted_qty":32,"variance":-1},{"product_id":24,"name":"Samsung 45W Super Fast Charger","sku":"JR-SAM45W","system_qty":38,"counted_qty":38,"variance":0},{"product_id":22,"name":"Apple 20W USB-C Power Adapter","sku":"JR-APL20W","system_qty":60,"counted_qty":61,"variance":1}]'::jsonb,
  0, 3, 'Monthly accessories count', 'seed', now() - interval '2 days');

commit;
select 'debtor_txns' k, count(*) n from public.account_transactions where account_type='debtor'
union all select 'creditor_txns', count(*) from public.account_transactions where account_type='creditor'
union all select 'quotes', count(*) from public.quotes
union all select 'laybys', count(*) from public.laybys
union all select 'stock_takes', count(*) from public.stock_takes;
