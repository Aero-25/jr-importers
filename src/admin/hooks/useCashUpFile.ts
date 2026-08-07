import { useEffect, useState } from 'react';
import { prepareCashUpFile } from '@/lib/cashUpPdf';
import type { CashUp } from '@/data/till';

/**
 * Renders the cash-up PDF as soon as the report exists, so the file is already
 * in hand when "Send on WhatsApp" is tapped.
 *
 * This is not an optimisation. Safari counts the await on a PDF render as
 * spending the user activation, after which navigator.share() throws — so
 * building the file inside the click handler loses the attachment on iOS, which
 * is exactly where the till gets closed.
 */
export function useCashUpFile(report: CashUp | null | undefined): File | undefined {
  const [file, setFile] = useState<File>();

  useEffect(() => {
    if (!report) {
      setFile(undefined);
      return;
    }
    let live = true;
    void prepareCashUpFile(report)
      .then((f) => {
        if (live) setFile(f);
      })
      // Not worth surfacing here: shareCashUp rebuilds the file on demand and
      // reports the failure then, where somebody is waiting on an answer.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [report]);

  return file;
}
