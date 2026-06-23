// Write operations for the admin/POS. All run against Supabase with the
// admin's authenticated session (RLS: is_admin()). Stock-movement inserts are
// best-effort — a logging failure never blocks the underlying sale/adjustment.

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function cashierName(user) {
  return user?.user_metadata?.name || (user?.email ? user.email.split('@')[0] : 'Staff');
}

export function splitVat(grossTotal, vatRate = 15) {
  const gross = Number(grossTotal) || 0;
  const vat = round2(gross * (vatRate / (100 + vatRate)));
  return { gross, vat, net: round2(gross - vat) };
}

async function logMovement(db, row) {
  try { await db.from('stock_movements').insert(row); } catch { /* logging only */ }
}

/* ----------------------------------------------------------- POS sale */
export async function recordSale(db, { items, payment, customer, tillShift, cashier, settings }) {
  const gross = items.reduce((n, i) => n + i.qty * Number(i.price || 0), 0);
  const { vat, net } = splitVat(gross, Number(settings?.vat_rate || 15));

  const order = {
    user_id: null,
    customer_name: customer?.name?.trim() || 'Walk-in customer',
    customer_email: customer?.email?.trim() || null,
    customer_phone: customer?.phone?.trim() || null,
    delivery_method: 'Collection',
    items: items.map((i) => ({ product_id: i.id, name: i.name, sku: i.sku, price: Number(i.price || 0), quantity: i.qty })),
    subtotal: gross,
    subtotal_amount: net,
    vat_amount: vat,
    total_amount: gross,
    payment_method: payment,
    status: 'Completed',
    paid_at: new Date().toISOString(),
    notes: `POS sale${tillShift ? ` · till #${tillShift.id}` : ''} · ${cashier}`,
  };

  const { data: created, error } = await db.from('orders').insert(order).select().single();
  if (error) throw error;

  // Decrement stock + log movements.
  for (const it of items) {
    const newStock = Math.max(0, Number(it.stock || 0) - it.qty);
    await db.from('products').update({ stock: newStock }).eq('id', it.id);
    await logMovement(db, {
      product_id: it.id, product_name: it.name, movement_type: 'sale',
      quantity: -it.qty, reference_type: 'order', reference_id: String(created.id), user_name: cashier,
    });
  }

  // Roll the sale into the open till shift.
  if (tillShift) {
    const isCash = payment === 'Cash';
    await db.from('till_shifts').update({
      transaction_count: Number(tillShift.transaction_count || 0) + 1,
      total_sales: round2(Number(tillShift.total_sales || 0) + gross),
      cash_sales: round2(Number(tillShift.cash_sales || 0) + (isCash ? gross : 0)),
      card_sales: round2(Number(tillShift.card_sales || 0) + (!isCash ? gross : 0)),
    }).eq('id', tillShift.id);
  }

  return created;
}

/* ----------------------------------------------------------- stock */
export async function adjustStock(db, { product, delta, reason, cashier }) {
  const newStock = Math.max(0, Number(product.stock || 0) + Number(delta));
  const { error } = await db.from('products').update({ stock: newStock }).eq('id', product.id);
  if (error) throw error;
  await logMovement(db, {
    product_id: product.id, product_name: product.name,
    movement_type: delta >= 0 ? 'adjustment_in' : 'adjustment_out',
    quantity: Number(delta), reference_type: 'manual', notes: reason || null, user_name: cashier,
  });
  return newStock;
}

export async function receiveStock(db, { supplier, items, notes, invoiceNo, cashier }) {
  // items: [{ product, qty, cost }]
  let total = 0;
  for (const { product, qty, cost } of items) {
    const newStock = Number(product.stock || 0) + Number(qty);
    await db.from('products').update({ stock: newStock }).eq('id', product.id);
    await logMovement(db, {
      product_id: product.id, product_name: product.name, movement_type: 'grv',
      quantity: Number(qty), reference_type: 'grv', notes: invoiceNo ? `Inv ${invoiceNo}` : null, user_name: cashier,
    });
    total += Number(qty) * Number(cost || product.cost_price || 0);
  }
  const { error } = await db.from('grvs').insert({
    supplier_id: supplier?.id || null,
    supplier_name: supplier?.name || 'Walk-in supplier',
    supplier_invoice_no: invoiceNo || null,
    invoice_date: new Date().toISOString().slice(0, 10),
    items: items.map(({ product, qty, cost }) => ({ product_id: product.id, name: product.name, quantity: qty, cost })),
    total_amount: round2(total),
    notes: notes || null,
    status: 'received',
  });
  if (error) throw error;
  return total;
}

/* ----------------------------------------------------------- till / cash-up */
export async function openShift(db, { cashier, openingFloat }) {
  const { data, error } = await db.from('till_shifts').insert({
    till_id: 1, cashier_name: cashier, opening_float: Number(openingFloat) || 0,
    opening_time: new Date().toISOString(), status: 'Open',
    total_sales: 0, cash_sales: 0, card_sales: 0, transaction_count: 0,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function closeShift(db, { shift, actualCash }) {
  const expected = round2(Number(shift.opening_float || 0) + Number(shift.cash_sales || 0));
  const variance = round2(Number(actualCash) - expected);
  const { data, error } = await db.from('till_shifts').update({
    closing_time: new Date().toISOString(),
    expected_cash: expected, actual_cash: round2(actualCash), cash_variance: variance,
    status: 'Closed',
  }).eq('id', shift.id).select().single();
  if (error) throw error;
  return data;
}

/* ----------------------------------------------------------- invoices */
export async function saveInvoice(db, { customer, items, vatRate, dueDate, status }) {
  const gross = items.reduce((n, i) => n + Number(i.quantity || 1) * Number(i.price || 0), 0);
  const { vat, net } = splitVat(gross, vatRate);
  const { data, error } = await db.from('invoices').insert({
    customer_id: customer?.id || null,
    customer_name: customer?.name || 'Customer',
    customer_email: customer?.email || null,
    items, subtotal_amount: net, vat_amount: vat, total_amount: gross,
    due_date: dueDate || null, status: status || 'draft',
  }).select().single();
  if (error) throw error;
  return data;
}
export async function setInvoiceStatus(db, id, status) {
  const patch = { status };
  if (status === 'paid') patch.paid_at = new Date().toISOString();
  const { error } = await db.from('invoices').update(patch).eq('id', id);
  if (error) throw error;
}

/* ----------------------------------------------------------- orders */
export async function setOrderStatus(db, id, status) {
  const patch = { status };
  if (status === 'Paid') patch.paid_at = new Date().toISOString();
  const { error } = await db.from('orders').update(patch).eq('id', id);
  if (error) throw error;
}

/* ----------------------------------------------------------- CRUD */
export async function upsertProduct(db, product) {
  const row = { ...product };
  delete row.created_at; delete row.updated_at;
  if (row.id) {
    const { error } = await db.from('products').update(row).eq('id', row.id);
    if (error) throw error;
  } else {
    delete row.id;
    const { error } = await db.from('products').insert(row);
    if (error) throw error;
  }
}
export async function archiveProduct(db, id) {
  const { error } = await db.from('products').update({ active: false }).eq('id', id);
  if (error) throw error;
}

export async function upsertRow(db, table, row) {
  const r = { ...row }; delete r.created_at; delete r.updated_at;
  if (r.id) {
    const { error } = await db.from(table).update(r).eq('id', r.id);
    if (error) throw error;
  } else {
    delete r.id;
    const { error } = await db.from(table).insert(r);
    if (error) throw error;
  }
}

export async function addExpense(db, expense) {
  const { error } = await db.from('expenses').insert(expense);
  if (error) throw error;
}
