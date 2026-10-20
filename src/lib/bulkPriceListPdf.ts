/**
 * The customer-facing weekly price list, as a PDF.
 *
 * This is the file that goes out by email, so it carries retail prices and
 * nothing else. No supplier cost, no landed cost, no markup, no margin — not in
 * a column, not in a footnote, not in the document metadata. `buildCustomerPdf`
 * is handed only the fields it is allowed to print, which is why its parameter
 * type is narrower than the row it comes from: the compiler refuses the mistake
 * rather than a reviewer having to catch it.
 *
 * In-stock handsets get a green row, which is the whole point of sending it —
 * the question a dealer actually has is not what a phone costs but whether you
 * have one today.
 */

import { BRAND_GREEN, BRAND_GREEN_SOFT, loadBrandLogo } from './invoicePdf';
import { STORE } from './constants';
import { formatDate, money } from './format';

const INK: [number, number, number] = [13, 38, 63];
const GREY: [number, number, number] = [110, 122, 143];
const LINE: [number, number, number] = [206, 214, 226];
const ROW_ALT: [number, number, number] = [247, 249, 252];

export type StockStatus = 'in_stock' | 'on_order' | 'out_of_stock';

/**
 * Exactly what a customer may see. Deliberately not the full list item: a
 * structural type with no cost field cannot leak one.
 */
export interface CustomerPriceLine {
  display_name: string;
  storage_gb: number | null;
  five_g: boolean;
  final_price: number;
  stock_status: StockStatus;
  /**
   * How many are on the shelf. Not a cost, so it may be shown: the question a
   * dealer actually has is whether the shop can hand one over today, and
   * "four" answers that better than "yes".
   */
  stock_qty: number;
}

export interface CustomerPdfOptions {
  lines: CustomerPriceLine[];
  /** Whose list this is — it heads the page and names the file. */
  brand?: string;
  /** The Monday the list belongs to. */
  weekStart: string;
  generatedAt?: Date;
}

// On the shelf, or coming in. Everything here is on a supplier list the shop
// orders from, so nothing is ever simply unavailable.
const STATUS_LABEL: Record<StockStatus, string> = {
  in_stock: 'In stock',
  on_order: 'On order',
  out_of_stock: 'On order',
};

export function priceListFileName(weekStart: string, brand = 'Samsung'): string {
  return `JR_Importers_${brand}_Price_List_${weekStart}.pdf`;
}

export async function buildCustomerPdf(options: CustomerPdfOptions): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const pageWidth = 210;
  const pageHeight = 297;
  const left = 14;
  const right = pageWidth - 14;
  const logo = await loadBrandLogo();
  const generated = options.generatedAt ?? new Date();
  const brand = options.brand ?? 'Samsung';

  /* ── Masthead ─────────────────────────────────────────────────────────── */
  const header = (): number => {
    doc.setFillColor(...BRAND_GREEN);
    doc.rect(0, 0, pageWidth, 30, 'F');

    if (logo) {
      try {
        doc.addImage(logo, 'PNG', left, 5.5, 19, 19);
      } catch {
        /* A missing logo must not cost the shop its price list. */
      }
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text('JR IMPORTERS', logo ? left + 24 : left, 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.text('SHOP TECH. SHOP SMART.', logo ? left + 24 : left, 19.6);
    doc.text('www.jrimporters.com', logo ? left + 24 : left, 24.4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(`${brand} price list`, right, 14, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.text(`Week of ${formatDate(options.weekStart)}`, right, 19.6, { align: 'right' });
    doc.text(STORE.phone, right, 24.4, { align: 'right' });

    return 40;
  };

  /* ── Column headings ──────────────────────────────────────────────────── */
  const columns = {
    name: left,
    storage: 118,
    status: 140,
    price: right,
  };

  const tableHead = (y: number): number => {
    doc.setFillColor(...INK);
    doc.rect(left, y - 5, right - left, 7.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('HANDSET', columns.name + 2, y);
    doc.text('STORAGE', columns.storage, y);
    doc.text('AVAILABILITY', columns.status, y);
    doc.text('PRICE INCL. VAT', columns.price - 2, y, { align: 'right' });
    return y + 8;
  };

  let y = header();

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`This week’s ${brand} pricing`, left, y);
  y += 5.6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.4);
  doc.setTextColor(...GREY);
  doc.text(
    'Prices include 15% VAT and are quoted in Namibian dollars. Rows shaded green are in stock'
      + ' today, and the tag is how many we hold.',
    left,
    y,
  );
  y += 9;

  y = tableHead(y);

  /* ── Rows ─────────────────────────────────────────────────────────────── */
  const rowHeight = 7.2;
  let striped = false;

  for (const line of options.lines) {
    if (y > pageHeight - 24) {
      doc.addPage();
      y = header();
      y = tableHead(y);
      striped = false;
    }

    const inStock = line.stock_status === 'in_stock';
    if (inStock) {
      doc.setFillColor(...BRAND_GREEN_SOFT);
      doc.rect(left, y - 4.8, right - left, rowHeight, 'F');
    } else if (striped) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(left, y - 4.8, right - left, rowHeight, 'F');
    }
    striped = !striped;

    doc.setTextColor(...INK);
    doc.setFont('helvetica', inStock ? 'bold' : 'normal');
    doc.setFontSize(8.6);
    doc.text(line.display_name, columns.name + 2, y, { maxWidth: columns.storage - left - 6 });

    doc.setFont('helvetica', 'normal');
    doc.text(line.storage_gb ? `${line.storage_gb}GB` : '—', columns.storage, y);

    if (inStock) {
      doc.setTextColor(...BRAND_GREEN);
      doc.setFont('helvetica', 'bold');
    } else {
      doc.setTextColor(...GREY);
    }
    const status = STATUS_LABEL[line.stock_status];
    doc.text(status, columns.status, y);

    // A small tag with the count. Only where there is stock: on an "on order"
    // line the number would always be nought, which reads as a correction
    // rather than as information.
    if (inStock && line.stock_qty > 0) {
      const count = String(line.stock_qty);
      const tagX = columns.status + doc.getTextWidth(status) + 1.8;
      const tagW = Math.max(4.6, doc.getTextWidth(count) + 3.2);
      doc.setFillColor(...BRAND_GREEN);
      doc.roundedRect(tagX, y - 3.2, tagW, 4.4, 1.1, 1.1, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      doc.text(count, tagX + tagW / 2, y - 0.1, { align: 'center' });
      doc.setFontSize(8.6);
    }

    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.text(money(line.final_price), columns.price - 2, y, { align: 'right' });

    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.1);
    doc.line(left, y + 2.4, right, y + 2.4);

    y += rowHeight;
  }

  /* ── Footer on every page ─────────────────────────────────────────────── */
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(...GREY);
    doc.text(
      `${STORE.name} · ${STORE.address} · ${STORE.phone} · ${STORE.email}`,
      pageWidth / 2,
      pageHeight - 12,
      { align: 'center' },
    );
    doc.text(
      'Prices are subject to change and stock availability. Quoted in NAD, VAT included.',
      pageWidth / 2,
      pageHeight - 8.4,
      { align: 'center' },
    );
    doc.text(`Page ${page} of ${pages}`, right, pageHeight - 8.4, { align: 'right' });
    doc.text(`Issued ${formatDate(generated.toISOString())}`, left, pageHeight - 8.4);
  }

  return doc.output('blob');
}
