export function getLowStockSuggestions(products, options = {}) {
  const defaultCoverageDays = options.defaultCoverageDays || 30;
  const minimumOrderQty = options.minimumOrderQty || 1;

  return [...(products || [])]
    .filter((product) => Number(product.stock || 0) <= Number(product.reorder_level || 10))
    .map((product) => {
      const stock = Number(product.stock || 0);
      const reorderLevel = Number(product.reorder_level || 10);
      const targetStock = Math.max(reorderLevel * 2, reorderLevel + minimumOrderQty);
      const suggestedOrderQty = Math.max(minimumOrderQty, targetStock - stock);

      return {
        ...product,
        stock,
        reorderLevel,
        shortage: Math.max(0, reorderLevel - stock),
        targetStock,
        suggestedOrderQty,
        estimatedCost: suggestedOrderQty * Number(product.cost_price || 0),
        coverageDays: defaultCoverageDays
      };
    })
    .sort((a, b) => a.stock - b.stock || b.suggestedOrderQty - a.suggestedOrderQty);
}
