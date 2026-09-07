import { useRef, useState } from 'react';
import { Download, Mail, MessageCircle } from 'lucide-react';
import { Button, Input, useToast } from '@/ui';
import {
  downloadSharedPdf, pdfMessageLink, pdfRecipient, publishSharedPdf, validPdfRecipient,
  type PdfChannel, type PdfDocument,
} from '@/lib/pdfSharing';

/** Reusable document actions, with an editable recipient for walk-in sales. */
export function PdfActions({ document, disabled = false }: { document: PdfDocument; disabled?: boolean }) {
  const toast = useToast();
  const [channel, setChannel] = useState<PdfChannel | null>(null);
  const [recipient, setRecipient] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  async function choose(next: PdfChannel) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setChannel(next);
    setRecipient('');
    try {
      setRecipient(await pdfRecipient(document, next));
    } catch {
      toast.info('Enter the recipient', 'The saved contact details could not be loaded.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function run(download = false) {
    if (lock.current || (!download && (!channel || !validPdfRecipient(channel, recipient)))) return;
    lock.current = true;
    setBusy(true);
    // Reserve the browsing context in the click, before rendering/uploading.
    const tab = download ? null : window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
      if (download) {
        await downloadSharedPdf(document);
      } else if (channel) {
        const url = await publishSharedPdf(document);
        const href = pdfMessageLink(document, channel, recipient, url);
        if (tab) tab.location.href = href;
        else window.location.href = href;
      }
    } catch (error) {
      tab?.close();
      toast.error('Could not prepare the PDF', error instanceof Error ? error.message : undefined);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-hairline bg-raised p-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} disabled={busy || disabled} onClick={() => void run(true)}>PDF</Button>
        <Button size="sm" variant="success" icon={<MessageCircle className="h-4 w-4" />} disabled={busy || disabled} onClick={() => void choose('whatsapp')}>WhatsApp PDF</Button>
        <Button size="sm" variant="secondary" icon={<Mail className="h-4 w-4" />} disabled={busy || disabled} onClick={() => void choose('email')}>Email PDF</Button>
      </div>
      {channel && (
        <div className="mt-3 space-y-2 border-t border-hairline pt-3">
          <Input label={channel === 'whatsapp' ? 'WhatsApp number' : 'Email address'} type={channel === 'whatsapp' ? 'tel' : 'email'} value={recipient} disabled={busy || disabled} onChange={(event) => setRecipient(event.target.value)} placeholder={channel === 'whatsapp' ? '081 234 5678' : 'customer@example.com'} />
          <p className="text-xs text-ink-muted">Opens a message with a downloadable PDF link. Review and send it in {channel === 'whatsapp' ? 'WhatsApp' : 'your email app'}.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={busy} disabled={disabled || !validPdfRecipient(channel, recipient)} onClick={() => void run()}>{channel === 'whatsapp' ? 'Open WhatsApp' : 'Open email'}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setChannel(null)}>Cancel sharing</Button>
          </div>
        </div>
      )}
    </div>
  );
}
