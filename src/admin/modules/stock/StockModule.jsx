import { useMemo, useState } from 'react';
import { formatCurrency } from '../../lib/format';
import { getLowStockSuggestions } from './lowStock';

export function StockModule({ db, products, suppliers, onRefresh, notify }) {
  const suggestions = useMemo(() => getLowStockSuggestions(products), [products]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');

  async function draftPurchaseOrder(product) {
    const supplier = suppliers.find((item) => String(item.id) === String(selectedSupplierId));
    const payload = {
      supplier_id: selectedSupplierId || null,
      supplier_name: supplier?.name || supplier?.company || 'Unassigned supplier',
      status: 'draft',
      items: [{
        product_id: product.id,
        name: product.name,
        sku: product.sku || product.barcode || '',
        qty: product.suggestedOrderQty,
        cost_price: product.cost_price || 0
      }],
      total_amount: product.estimatedCost,
      notes: `Auto-drafted from low-stock suggestion. Current stock ${product.stock}, reorder level ${product.reorderLevel}.`,
      created_at: new Date().toISOString()
    };

    const { error } = await db.from('purchase_orders').insert(payload);
    if (error) {
      notify(error.message, 'error');
      return;
    }

    notify('Purchase order draft created', 'success');
    onRefresh();
  }

  return (
    <section className="module">
      <header className="module-header">
        <div>
          <h1>Low Stock</h1>
          <p>{suggestions.length} reorder suggestion{suggestions.length === 1 ? '' : 's'}</p>
        </div>
        <div className="toolbar">
          <select value={selectedSupplierId} onChange={(event) => setSelectedSupplierId(event.target.value)}>
            <option value="">No supplier selected</option>
            {suppliers.map((supplier) => (
              <option value={supplier.id} key={supplier.id}>{supplier.name || supplier.company}</option>
            ))}
          </select>
        </div>
      </header>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Stock</th>
              <th>Reorder Level</th>
              <th>Suggested Qty</th>
              <th>Estimated Cost</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map((product) => (
              <tr key={product.id}>
                <td>
                  <div className="product-cell">
                    {product.image || product.image1 ? <img src={product.image || product.image1} alt={product.name} /> : <span className="thumb-placeholder">JR</span>}
                    <div>
                      <strong>{product.name}</strong>
                      <span>{product.brand || product.category || 'No brand'}</span>
                    </div>
                  </div>
                </td>
                <td><span className="badge warning">{product.stock}</span></td>
                <td>{product.reorderLevel}</td>
                <td>{product.suggestedOrderQty}</td>
                <td>{formatCurrency(product.estimatedCost)}</td>
                <td className="row-actions">
                  <button className="button primary" type="button" onClick={() => draftPurchaseOrder(product)}>Draft PO</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
