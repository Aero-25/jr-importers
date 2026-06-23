import { useMemo, useState } from 'react';
import { Modal } from '../../components/Modal.jsx';
import { formatCurrency } from '../../lib/format';
import { PRODUCT_IMAGE_FIELDS } from './images';
import { parseProductsFile, productsToWorkbook } from './excel';

const EMPTY_PRODUCT = {
  name: '',
  brand: '',
  category: 'phones',
  sku: '',
  barcode: '',
  cost_price: 0,
  price: 0,
  stock: 0,
  reorder_level: 10,
  image: '',
  description: '',
  spec_ram: '',
  spec_storage: '',
  active: true
};

function ProductForm({ product, onClose, onSave }) {
  const [form, setForm] = useState({ ...EMPTY_PRODUCT, ...product });

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <Modal title={product?.id ? 'Edit Product' : 'New Product'} onClose={onClose} size="lg">
      <form className="form-grid" onSubmit={(event) => {
        event.preventDefault();
        onSave({
          ...form,
          cost_price: Number(form.cost_price || 0),
          price: Number(form.price || 0),
          stock: Number.parseInt(form.stock || 0, 10),
          reorder_level: Number.parseInt(form.reorder_level || 10, 10),
          image1: form.image1 || form.image,
          active: form.active !== false
        });
      }}>
        {['name', 'brand', 'category', 'sku', 'barcode'].map((field) => (
          <label key={field}>
            <span>{field.replace('_', ' ')}</span>
            <input value={form[field] || ''} onChange={(event) => update(field, event.target.value)} required={field === 'name'} />
          </label>
        ))}
        {['cost_price', 'price', 'stock', 'reorder_level'].map((field) => (
          <label key={field}>
            <span>{field.replace('_', ' ')}</span>
            <input type="number" step={field.includes('price') ? '0.01' : '1'} value={form[field] || 0} onChange={(event) => update(field, event.target.value)} />
          </label>
        ))}
        <label className="span-2">
          <span>image</span>
          <input value={form.image || ''} onChange={(event) => update('image', event.target.value)} />
        </label>
        <label>
          <span>RAM</span>
          <input value={form.spec_ram || ''} onChange={(event) => update('spec_ram', event.target.value)} />
        </label>
        <label>
          <span>Storage</span>
          <input value={form.spec_storage || ''} onChange={(event) => update('spec_storage', event.target.value)} />
        </label>
        <label className="span-2">
          <span>Description</span>
          <textarea value={form.description || ''} onChange={(event) => update('description', event.target.value)} />
        </label>
        <footer className="modal-actions span-2">
          <button type="button" className="button ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary">Save Product</button>
        </footer>
      </form>
    </Modal>
  );
}

function ProductImagesModal({ product, onClose, onSave }) {
  const [imageValue, setImageValue] = useState('');

  function handleDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageValue(reader.result);
    reader.readAsDataURL(file);
  }

  return (
    <Modal title={`Images: ${product.name}`} onClose={onClose} size="lg">
      <div className="image-grid">
        {PRODUCT_IMAGE_FIELDS.map((field) => (
          <div className="image-slot" key={field}>
            <strong>{field}</strong>
            {product[field] ? <img src={product[field]} alt={field} /> : <span>No image</span>}
          </div>
        ))}
      </div>
      <div className="drop-zone" onDrop={handleDrop} onDragOver={(event) => event.preventDefault()}>
        <strong>Drop image here</strong>
        <span>Or paste a hosted URL below. Hosted optimized images are best for performance.</span>
      </div>
      <input className="wide-input" value={imageValue} onChange={(event) => setImageValue(event.target.value)} placeholder="https://..." />
      {imageValue && <img className="image-preview" src={imageValue} alt="Preview" />}
      <footer className="modal-actions">
        <button type="button" className="button ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="button primary" onClick={() => onSave(product, imageValue)}>Save to Next Slot</button>
      </footer>
    </Modal>
  );
}

export function ProductsModule({ db, products, productImeis, onRefresh, notify }) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [imageProduct, setImageProduct] = useState(null);
  const [importRows, setImportRows] = useState([]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((product) => [product.name, product.brand, product.category, product.sku, product.barcode]
      .some((value) => String(value || '').toLowerCase().includes(needle)));
  }, [products, search]);

  async function saveProduct(product) {
    const payload = { ...product };
    const id = payload.id;
    delete payload.id;

    const query = id ? db.from('products').update(payload).eq('id', id) : db.from('products').insert(payload);
    const { error } = await query;
    if (error) throw error;
    notify(id ? 'Product updated' : 'Product created', 'success');
    setEditing(null);
    onRefresh();
  }

  async function deleteProduct(product) {
    if (!confirm(`Delete ${product.name}?`)) return;
    const { error } = await db.from('products').delete().eq('id', product.id);
    if (error) {
      notify(error.message, 'error');
      return;
    }
    notify('Product deleted', 'success');
    onRefresh();
  }

  async function saveImage(product, url) {
    const cleanUrl = String(url || '').trim();
    if (!cleanUrl) {
      notify('Add an image first', 'error');
      return;
    }

    const field = PRODUCT_IMAGE_FIELDS.find((name) => !product[name]) || 'image5';
    const updates = { [field]: cleanUrl };
    if (!product.image) {
      updates.image = cleanUrl;
      updates.image1 = product.image1 || cleanUrl;
    }

    const { error } = await db.from('products').update(updates).eq('id', product.id);
    if (error) {
      notify(error.message, 'error');
      return;
    }
    notify('Image saved', 'success');
    setImageProduct(null);
    onRefresh();
  }

  async function handleImportFile(file) {
    if (!file) return;
    const rows = await parseProductsFile(file);
    setImportRows(rows);
    notify(`${rows.length} rows ready to import`, 'success');
  }

  async function importProducts() {
    if (!importRows.length) return;
    const { error } = await db.from('products').insert(importRows);
    if (error) {
      notify(error.message, 'error');
      return;
    }
    notify(`${importRows.length} products imported`, 'success');
    setImportRows([]);
    onRefresh();
  }

  async function exportProducts() {
    const XLSX = await import('xlsx');
    XLSX.writeFile(await productsToWorkbook(products), `jr_products_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <section className="module">
      <header className="module-header">
        <div>
          <h1>Products</h1>
          <p>{filtered.length} of {products.length} products</p>
        </div>
        <div className="toolbar">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products" />
          <label className="button ghost">
            Import Excel
            <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(event) => handleImportFile(event.target.files?.[0])} />
          </label>
          <button className="button ghost" type="button" onClick={exportProducts}>Export</button>
          <button className="button primary" type="button" onClick={() => setEditing(EMPTY_PRODUCT)}>New Product</button>
        </div>
      </header>

      {importRows.length > 0 && (
        <div className="notice">
          <strong>{importRows.length} import rows staged.</strong>
          <button className="button primary" type="button" onClick={importProducts}>Import Now</button>
          <button className="button ghost" type="button" onClick={() => setImportRows([])}>Clear</button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Price</th>
              <th>Stock</th>
              <th>IMEIs</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((product) => {
              const imeiCount = productImeis.filter((imei) => imei.product_id === product.id && imei.status === 'available').length;
              return (
                <tr key={product.id}>
                  <td>
                    <div className="product-cell">
                      {product.image || product.image1 ? <img src={product.image || product.image1} alt={product.name} /> : <span className="thumb-placeholder">JR</span>}
                      <div>
                        <strong>{product.name}</strong>
                        <span>{product.brand || product.sku || 'No brand'}</span>
                      </div>
                    </div>
                  </td>
                  <td>{product.category || '-'}</td>
                  <td>{formatCurrency(product.price)}</td>
                  <td><span className={`badge ${Number(product.stock || 0) <= Number(product.reorder_level || 10) ? 'warning' : 'success'}`}>{product.stock || 0}</span></td>
                  <td>{imeiCount}</td>
                  <td className="row-actions">
                    <button type="button" onClick={() => setImageProduct(product)}>Images</button>
                    <button type="button" onClick={() => setEditing(product)}>Edit</button>
                    <button type="button" onClick={() => deleteProduct(product)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && <ProductForm product={editing} onClose={() => setEditing(null)} onSave={saveProduct} />}
      {imageProduct && <ProductImagesModal product={imageProduct} onClose={() => setImageProduct(null)} onSave={saveImage} />}
    </section>
  );
}
