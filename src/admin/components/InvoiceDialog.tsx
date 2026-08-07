import { useState } from 'react';
import { Download, Mail, MessageCircle, Receipt } from 'lucide-react';
import type { OrderRow } from '@/lib/database.types';
import {
  downloadInvoicePdf,
  invoiceMailtoLink,
  invoiceNumber,
  invoiceWhatsAppLink,
} from '@/lib/invoicePdf';
import { isSendableNumber } from '@/lib/phone';
import { money } from '@/lib/format';
import { Button, Modal, Notice, useToast } from '@/ui';

/**
 * Issuing the tax invoice, offered the moment the sale completes.
 *
 * Deliberately here rather than buried in Orders: the only time a customer can
 * be asked where to send their invoice is while they are still at the counter.
 */
export function InvoiceDialog({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<'pdf' | 'wa' | 'mail' | null>(null);

  const canWhatsApp = isSendableNumber(order.customer_phone);
  const canEmail = Boolean(order.customer_email?.includes('@'));

  async function run(kind: 'pdf' | 'wa' | 'mail') {
    // Claimed during the click: publishing the PDF takes long enough that a
    // window.open afterwards is treated as an unrequested popup.
    const tab = kind === 'pdf' ? null : window.open('about:blank', '_blank');
    setBusy(kind);
    try {
      if (kind === 'pdf') {
        await downloadInvoicePdf(order);
      } else {
        const href = kind === 'wa' ? await invoiceWhatsAppLink(order) : await invoiceMailtoLink(order);
        if (tab) tab.location.href = href;
        else window.location.href = href;
      }
    } catch (error) {
      tab?.close();
      toast.error('Could not issue the invoice', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Sale complete"
      description={`Tax invoice ${invoiceNumber(order)}`}
      size="sm"
      footer={<Button variant="ghost" onClick={onClose}>Done</Button>}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl bg-brand-600 px-5 py-4 text-white">
          <Receipt aria-hidden className="h-5 w-5 shrink-0 text-lime-400" />
          <div className="min-w-0">
            <p className="tabular font-display text-2xl font-bold">{money(order.total_amount)}</p>
            <p className="truncate text-sm text-white/80">
              {order.customer_name || 'Cash sale'} · {order.payment_method}
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          <Button
            variant="secondary"
            icon={<Download className="h-4 w-4" />}
            loading={busy === 'pdf'}
            onClick={() => void run('pdf')}
          >
            Download the A4 invoice
          </Button>

          <Button
            variant="success"
            icon={<MessageCircle className="h-4 w-4" />}
            disabled={!canWhatsApp}
            loading={busy === 'wa'}
            onClick={() => void run('wa')}
          >
            Send on WhatsApp
          </Button>

          <Button
            variant="secondary"
            icon={<Mail className="h-4 w-4" />}
            disabled={!canEmail}
            loading={busy === 'mail'}
            onClick={() => void run('mail')}
          >
            Email it
          </Button>
        </div>

        {!canWhatsApp && !canEmail && (
          <Notice tone="info" title="No contact details on this sale">
            Add a phone number or email to the customer and the invoice can be sent from Orders.
          </Notice>
        )}
      </div>
    </Modal>
  );
}
