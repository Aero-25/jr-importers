import { useRef, useState } from 'react';
import { Download, Mail, MessageCircle } from 'lucide-react';
import { Button, Input, useToast } from '@/ui';
import {
  documentReference, downloadSharedPdf, emailSharedPdf, opensWhatsAppBusinessApp, pdfMessageLink, pdfRecipient,
  publishSharedPdf, validPdfRecipient,
  type PdfChannel, type PdfDocument,
} from '@/lib/pdfSharing';

/** Reusable document actions, with an editable recipient for walk-in sales. */
export function PdfActions({ document, disabled = false }: { document: PdfDocument; disabled?: boolean }) {
  const toast = useToast();
  const [channel, setChannel] = useState<PdfChannel | null>(null);
  const [recipient, setRecipient] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const usesWhatsAppBusiness = channel === 'whatsapp' && opensWhatsAppBusinessApp();

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
    // Android Business must leave this WebView directly; reserving a blank tab
    // sends the user to the web installer instead of the installed app.
    const opensWindow = !download && channel === 'whatsapp';
    const tab = opensWindow && !usesWhatsAppBusiness ? window.open('about:blank', '_blank') : null;
    if (tab) tab.opener = null;
    try {
      if (download) {
        await downloadSharedPdf(document);
      } else if (channel === 'email') {
        await emailSharedPdf(document, recipient);
        toast.success('Email sent', `${documentReference(document)} sent to ${recipient.trim()}.`);
        setChannel(null);
      } else if (channel) {
        const url = await publishSharedPdf(document);
        const href = pdfMessageLink(document, channel, recipient, url);
        if (usesWhatsAppBusiness) window.open(href, '_self');
        else if (tab) tab.location.href = href;
        else window.location.href = href;
      }
    } catch (error) {
      tab?.close();
      toast.error(
        channel === 'email' ? 'Could not send the email' : 'Could not prepare the PDF',
        error instanceof Error ? error.message : undefined,
      );
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
          <p className="text-xs text-ink-muted">
            {channel === 'whatsapp'
              ? 'Opens WhatsApp with a link to the PDF. Review and send it there.'
              : 'Sends the PDF straight from info@jrimporters.com. Nothing else to do.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={busy} disabled={disabled || !validPdfRecipient(channel, recipient)} onClick={() => void run()}>{channel === 'whatsapp' ? (usesWhatsAppBusiness ? 'Open WhatsApp Business' : 'Open WhatsApp') : 'Send email'}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setChannel(null)}>Cancel sharing</Button>
          </div>
        </div>
      )}
    </div>
  );
}
