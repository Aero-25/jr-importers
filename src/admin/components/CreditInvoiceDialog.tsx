import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { keys } from '@/data/keys';
import { Button, Field, Modal, Notice, Select, Skeleton, Textarea } from '@/ui';

interface InvoiceLine {
  product_id?: number | string | null;
  name?: string | null;
  imei?: string | null;
  imeis?: string[] | null;
  quantity?: number | string | null;
}

interface AvailableUnit {
  product_id: number;
  imei: string | null;
  serial_number: string | null;
  color: string | null;
}

/**
 * Crediting an invoice, and saying what went out in its place.
 *
 * The shop replaces rather than refunds, so a credit note is usually the start
 * of a second handset leaving the counter. The credit note itself deliberately
 * does not move money or stock — that is the shop's rule, and it is what keeps
 * a credit off the day's takings — so until now nothing recorded which handset
 * was handed over. A Samsung A16 went out that way on 5 October and was found
 * missing at the stocktake a fortnight later.
 *
 * Asking here is the only moment anybody knows the answer.
 */
export function CreditInvoiceDialog({
  open,
  invoice,
  onClose,
  onCredited,
}: {
  open: boolean;
  invoice: { id: number; invoice_number?: string | null; items?: unknown } | null;
  onClose: () => void;
  onCredited: (message: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The handsets this invoice sold, one row per IMEI. A line selling two names
  // both, and each can be replaced separately.
  const credited = useMemo(() => {
    const lines = Array.isArray(invoice?.items) ? (invoice!.items as InvoiceLine[]) : [];
    return lines.flatMap((line) => {
      const productId = Number(line.product_id);
      if (!Number.isFinite(productId)) return [];
      const imeis = [
        ...(Array.isArray(line.imeis) ? line.imeis : []),
        ...(line.imei ? [line.imei] : []),
      ].filter((value, index, all) => value && all.indexOf(value) === index);
      return imeis.map((imei) => ({ imei: String(imei), productId, name: line.name ?? 'Handset' }));
    });
  }, [invoice]);

  const productIds = useMemo(
    () => [...new Set(credited.map((row) => row.productId))],
    [credited],
  );

  const units = useQuery<AvailableUnit[], Error>({
    queryKey: keys.list('product_imeis', { replacements: productIds.join(',') }),
    enabled: open && productIds.length > 0,
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from('product_imeis')
        .select('product_id, imei, serial_number, color')
        .in('product_id', productIds)
        .eq('status', 'available')
        .order('created_at');
      if (queryError) throw new Error(queryError.message);
      return (data ?? []) as unknown as AvailableUnit[];
    },
  });

  const close = () => {
    setReason('');
    setChosen({});
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!invoice) return;
    setBusy(true);
    setError(null);
    try {
      const replacements = Object.entries(chosen)
        .filter(([, replacement]) => replacement !== '')
        .map(([imei, replacement]) => ({ imei, replacement_imei: replacement }));

      const { data, error: rpcError } = await supabase.rpc('credit_invoice', {
        p_invoice_id: invoice.id,
        p_reason: reason.trim() === '' ? null : reason.trim(),
        p_replacements: replacements as unknown as never,
      });
      if (rpcError) throw new Error(rpcError.message);

      const result = data as { ok?: boolean; message?: string } | null;
      if (!result?.ok) throw new Error(result?.message ?? 'The credit note could not be raised.');

      onCredited(result.message ?? 'Credit note raised.');
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const replacing = Object.values(chosen).filter((value) => value !== '').length;

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Credit ${invoice?.invoice_number ?? 'this invoice'}?`}
    >
      <p className="text-sm text-ink-muted">
        A credit note is raised against it, carrying the same lines at negative value. Both
        documents stay on the record and the pair nets to nothing. The credit does not reach
        today&rsquo;s takings.
      </p>

      {credited.length > 0 && (
        <div className="mt-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">What went out in its place?</h3>
            <p className="mt-0.5 text-xs text-ink-subtle">
              A credit note does not move stock, so a replacement handed over has to be named here
              or it stays on the books as though it were still on the shelf.
            </p>
          </div>

          {units.isLoading ? (
            <Skeleton className="h-20" />
          ) : (
            credited.map((row) => {
              const options = (units.data ?? []).filter((unit) => unit.product_id === row.productId);
              return (
                <Field
                  key={row.imei}
                  label={`${row.name} · ${row.imei}`}
                  htmlFor={`replacement-${row.imei}`}
                  hint={
                    options.length === 0
                      ? 'None of these on the shelf to give.'
                      : undefined
                  }
                >
                  <Select
                    id={`replacement-${row.imei}`}
                    value={chosen[row.imei] ?? ''}
                    disabled={options.length === 0}
                    onChange={(e) =>
                      setChosen((prev) => ({ ...prev, [row.imei]: e.target.value }))
                    }
                  >
                    <option value="">No replacement given</option>
                    {options.map((unit) => {
                      const id = unit.imei ?? unit.serial_number ?? '';
                      return (
                        <option key={id} value={id}>
                          {id}
                          {unit.color ? ` · ${unit.color}` : ''}
                        </option>
                      );
                    })}
                  </Select>
                </Field>
              );
            })
          )}
        </div>
      )}

      <Field label="Reason" htmlFor="credit-reason" className="mt-4">
        <Textarea
          id="credit-reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Faulty screen, wrong model, …"
        />
      </Field>

      {error && (
        <Notice tone="danger" className="mt-3">
          {error}
        </Notice>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => void submit()} disabled={busy}>
          {busy
            ? 'Raising…'
            : replacing > 0
              ? `Raise the credit note and take ${replacing} replacement${replacing === 1 ? '' : 's'}`
              : 'Raise the credit note'}
        </Button>
        <Button variant="ghost" onClick={close} disabled={busy}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
