export const PRODUCT_IMPORT_COLUMNS = [
  'name',
  'brand',
  'category',
  'sku',
  'barcode',
  'cost_price',
  'price',
  'stock',
  'reorder_level',
  'image',
  'description',
  'spec_ram',
  'spec_storage'
];

export async function productsToWorkbook(products) {
  const XLSX = await import('xlsx');
  const rows = (products || []).map((product) => {
    const row = {};
    PRODUCT_IMPORT_COLUMNS.forEach((column) => {
      row[column] = product[column] ?? '';
    });
    return row;
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Products');
  return workbook;
}

export async function parseProductsFile(file) {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

  return XLSX.utils.sheet_to_json(firstSheet, { defval: '' }).map((row) => ({
    name: String(row.name || row.Name || '').trim(),
    brand: String(row.brand || row.Brand || '').trim(),
    category: String(row.category || row.Category || '').trim(),
    sku: String(row.sku || row.SKU || '').trim(),
    barcode: String(row.barcode || row.Barcode || '').trim(),
    cost_price: Number(row.cost_price || row.Cost || 0),
    price: Number(row.price || row.Price || 0),
    stock: Number.parseInt(row.stock || row.Stock || 0, 10),
    reorder_level: Number.parseInt(row.reorder_level || row['Reorder Level'] || 10, 10),
    image: String(row.image || row.Image || '').trim(),
    image1: String(row.image || row.Image || '').trim(),
    description: String(row.description || row.Description || '').trim(),
    spec_ram: String(row.spec_ram || row.RAM || '').trim(),
    spec_storage: String(row.spec_storage || row.Storage || '').trim(),
    active: true
  })).filter((product) => product.name && product.price >= 0);
}
