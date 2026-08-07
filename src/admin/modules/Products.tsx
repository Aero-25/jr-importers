import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Search } from 'lucide-react';
import type { ProductRow } from '@/lib/database.types';
import { products } from '@/data/products';
import { useAuth } from '@/auth/AuthProvider';
import { keys } from '@/data/keys';
import { supabase } from '@/lib/supabase';
import { CATEGORIES } from '@/lib/constants';
import { money, toNumber } from '@/lib/format';
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Input,
  Modal,
  Notice,
  Select,
  StockBadge,
  Textarea,
  type Column,
  useToast,
} from '@/ui';
import { ModuleHeader } from '../components/AdminShell';
import { ImageUploader } from '../components/ImageUploader';
import { ImeiManager } from '../components/ImeiManager';

export default function Products() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<ProductRow | 'new' | null>(null);

  const list = products.useList({
    search: search
      ? { term: search, columns: ['name', 'brand', 'sku', 'barcode', 'category'] }
      : undefined,
    eq: category ? { category } : undefined,
  });

  const columns: Column<ProductRow>[] = [
    {
      key: 'name',
      header: 'Product',
      render: (product) => (
        <div className="flex min-w-0 items-center gap-2.5">
          {product.image ? (
            <img
              src={product.image}
              alt=""
              loading="lazy"
              className="h-9 w-9 shrink-0 rounded object-cover"
            />
          ) : (
            <span aria-hidden className="h-9 w-9 shrink-0 rounded bg-raised" />
          )}
          <div className="min-w-0">
            <p className="truncate text-ink">{product.name}</p>
            <p className="truncate text-xs text-ink-subtle">
              {[product.brand, product.sku].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
        </div>
      ),
      sortValue: (product) => product.name,
    },
    {
      key: 'category',
      header: 'Category',
      secondary: true,
      render: (product) => <span className="text-sm text-ink-muted">{product.category ?? '—'}</span>,
      sortValue: (product) => product.category ?? '',
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      render: (product) => <span className="tabular font-medium">{money(product.price)}</span>,
      sortValue: (product) => Number(product.price),
    },
    // Cost and margin walk out of the door with anyone who leaves, so the
    // column is built only for the roles that are meant to see it.
    ...(isAdmin
      ? [{
      key: 'margin',
      header: 'Margin',
      align: 'right',
      secondary: true,
      render: (product) => {
        const price = Number(product.price);
        const cost = Number(product.cost_price);
        if (!price || !cost) return <span className="text-xs text-ink-subtle">—</span>;
        const margin = ((price - cost) / price) * 100;
        return (
          <span
            className={`tabular text-sm ${margin < 10 ? 'text-warn' : 'text-ink-muted'}`}
            title={`Cost ${money(cost)}`}
          >
            {margin.toFixed(0)}%
          </span>
        );
      },
      sortValue: (product) => {
        const price = Number(product.price);
        const cost = Number(product.cost_price);
        return price && cost ? ((price - cost) / price) * 100 : -1;
      },
    } satisfies Column<ProductRow>]
      : []),
    {
      key: 'stock',
      header: 'Stock',
      render: (product) => (
        <StockBadge stock={product.stock} reorderLevel={product.reorder_level} size="sm" />
      ),
      sortValue: (product) => product.stock,
    },
    {
      key: 'state',
      header: '',
      align: 'right',
      render: (product) => (
        <div className="flex items-center justify-end gap-1.5">
          {product.featured && (
            <Badge tone="lime" size="sm">
              Featured
            </Badge>
          )}
          {!product.active && (
            <Badge tone="neutral" size="sm">
              Hidden
            </Badge>
          )}
          <Pencil aria-hidden className="h-3.5 w-3.5 text-ink-subtle" />
        </div>
      ),
      width: '10rem',
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Products"
        description="Catalogue, pricing and stock levels."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            New product
          </Button>
        }
      />

      <div className="p-6">
        <div className="mb-4 flex flex-wrap gap-3">
          <Input
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, brand, SKU, barcode…"
            leading={<Search className="h-4 w-4" />}
            containerClassName="min-w-64 flex-1"
          />
          <Select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="All categories"
            options={[...CATEGORIES]}
            containerClassName="w-48"
          />
        </div>

        <div className="overflow-hidden rounded-card border border-hairline bg-surface">
          <DataTable
            rows={list.data ?? []}
            columns={columns}
            rowKey={(product) => product.id}
            loading={list.isLoading}
            onRowClick={setEditing}
            defaultSort={{ key: 'name', direction: 'asc' }}
            empty={{
              title: 'No products',
              message: 'Add your first product to start selling.',
              action: <Button onClick={() => setEditing('new')}>New product</Button>,
            }}
          />
        </div>
      </div>

      {editing && <ProductDialog product={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

const BLANK = {
  name: '',
  brand: '',
  category: 'Smartphones',
  description: '',
  price: '',
  cost_price: '',
  stock: '0',
  reorder_level: '10',
  sku: '',
  barcode: '',
  color: '',
  image: '',
  active: true,
  featured: false,
};

function ProductDialog({
  product,
  onClose,
}: {
  product: ProductRow | 'new';
  onClose: () => void;
}) {
  const toast = useToast();
  const create = products.useCreate();
  const update = products.useUpdate();
  const remove = products.useRemove();

  const isNew = product === 'new';
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Serialised products take their stock from the IMEI pool, not the column,
  // so the stock field must go read-only once any unit is booked in. Counts
  // every row, not just available ones — a fully sold-out phone is still
  // serialised, and letting someone re-type its stock would fight the trigger.
  const imeiCount = useQuery({
    queryKey: keys.list('product_imeis', { count: isNew ? null : product.id }),
    enabled: !isNew,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('product_imeis')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', (product as ProductRow).id);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
  const serialised = (imeiCount.data ?? 0) > 0;

  // `image` plus `image1`–`image5` are flattened into one ordered list for
  // editing, and spread back across the columns on save.
  const [images, setImages] = useState<string[]>(() =>
    isNew
      ? []
      : [
          product.image,
          product.image1,
          product.image2,
          product.image3,
          product.image4,
          product.image5,
        ].filter((url): url is string => Boolean(url)),
  );

  const [form, setForm] = useState(() =>
    isNew
      ? BLANK
      : {
          name: product.name,
          brand: product.brand ?? '',
          category: product.category ?? 'Smartphones',
          description: product.description ?? '',
          price: String(product.price ?? ''),
          cost_price: String(product.cost_price ?? ''),
          stock: String(product.stock ?? 0),
          reorder_level: String(product.reorder_level ?? 10),
          sku: product.sku ?? '',
          barcode: product.barcode ?? '',
          color: product.color ?? '',
          image: product.image ?? '',
          active: product.active,
          featured: product.featured,
        },
  );

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!form.name.trim()) {
      toast.warn('Name is required');
      return;
    }

    const values = {
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      category: form.category || null,
      description: form.description.trim() || null,
      price: toNumber(form.price),
      cost_price: toNumber(form.cost_price),
      stock: Math.trunc(toNumber(form.stock)),
      reorder_level: Math.trunc(toNumber(form.reorder_level)),
      sku: form.sku.trim() || null,
      barcode: form.barcode.trim() || null,
      color: form.color.trim() || null,
      image: images[0] ?? null,
      image1: images[1] ?? null,
      image2: images[2] ?? null,
      image3: images[3] ?? null,
      image4: images[4] ?? null,
      image5: images[5] ?? null,
      active: form.active,
      featured: form.featured,
    };

    try {
      if (isNew) {
        await create.mutateAsync(values);
        toast.success('Product created', values.name);
      } else {
        await update.mutateAsync({ id: product.id, values });
        toast.success('Product updated', values.name);
      }
      onClose();
    } catch (error) {
      toast.error('Could not save', error instanceof Error ? error.message : undefined);
    }
  }

  const margin =
    toNumber(form.price) > 0
      ? ((toNumber(form.price) - toNumber(form.cost_price)) / toNumber(form.price)) * 100
      : null;

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={isNew ? 'New product' : form.name || 'Edit product'}
        size="xl"
        footer={
          <>
            {!isNew && (
              <Button variant="danger" onClick={() => setConfirmDelete(true)} className="mr-auto">
                Delete
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} loading={create.isPending || update.isPending}>
              {isNew ? 'Create product' : 'Save changes'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Name"
            required
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            containerClassName="sm:col-span-2"
            data-autofocus
          />
          <Input label="Brand" value={form.brand} onChange={(e) => set('brand', e.target.value)} />
          <Select
            label="Category"
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
            options={[...CATEGORIES]}
          />

          <Input
            label="Selling price (N$)"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={form.price}
            onChange={(e) => set('price', e.target.value)}
            hint="VAT inclusive."
          />
          <Input
            label="Cost price (N$)"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={form.cost_price}
            onChange={(e) => set('cost_price', e.target.value)}
            hint={
              margin === null
                ? 'Landed cost, for margin reporting.'
                : `Margin ${margin.toFixed(1)}%`
            }
          />

          <Input
            label="Stock on hand"
            type="number"
            min={0}
            value={form.stock}
            onChange={(e) => set('stock', e.target.value)}
            disabled={!isNew && serialised}
            hint={
              !isNew && serialised
                ? 'Counted from the booked-in IMEIs below.'
                : 'Use only for stock not tracked by IMEI.'
            }
          />
          <Input
            label="Reorder level"
            type="number"
            min={0}
            value={form.reorder_level}
            onChange={(e) => set('reorder_level', e.target.value)}
          />

          <Input label="SKU" value={form.sku} onChange={(e) => set('sku', e.target.value)} />
          <Input
            label="Barcode"
            value={form.barcode}
            onChange={(e) => set('barcode', e.target.value)}
            hint="Scanned at the till for an exact match."
          />

          <Input label="Colour" value={form.color} onChange={(e) => set('color', e.target.value)} />

          <div className="sm:col-span-2">
            <ImageUploader productName={form.name} images={images} onChange={setImages} />
          </div>

          {isNew ? (
            <div className="sm:col-span-2">
              <Notice tone="info" title="Book in the handsets after saving">
                Phones are stocked one unit at a time. Create the product first, then capture each
                IMEI and its colour — that is what gives the shop its stock count and colour
                options.
              </Notice>
            </div>
          ) : (
            <div className="sm:col-span-2">
              <ImeiManager productId={product.id} />
            </div>
          )}

          <Textarea
            label="Description"
            rows={4}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            className="sm:col-span-2"
          />

          <div className="space-y-2 sm:col-span-2">
            <Checkbox
              label="Visible in the shop"
              hint="Unchecking hides it from customers without deleting it."
              checked={form.active}
              onChange={(e) => set('active', e.target.checked)}
            />
            <Checkbox
              label="Feature on the home page"
              checked={form.featured}
              onChange={(e) => set('featured', e.target.checked)}
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (isNew) return;
          try {
            await remove.mutateAsync(product.id);
            toast.success('Product deleted');
            onClose();
          } catch (error) {
            toast.error(
              'Could not delete',
              error instanceof Error
                ? `${error.message} — hide it instead if it appears on past orders.`
                : undefined,
            );
          }
          setConfirmDelete(false);
        }}
        title="Delete this product?"
        message="If it appears on past orders, hide it instead so the history stays intact."
        confirmLabel="Delete"
        loading={remove.isPending}
      />
    </>
  );
}
