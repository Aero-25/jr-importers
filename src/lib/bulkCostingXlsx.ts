/**
 * The internal costing workbook.
 *
 * The opposite of the customer PDF: this one carries the supplier cost, the
 * landed cost, the markup and the margin, and it is for administrators only.
 * It is never attached to a customer email — `bulk-dispatch` attaches the PDF
 * and only the PDF.
 *
 * Written as raw OOXML through the store-only zip writer in ./zip. An .xlsx is
 * a handful of XML parts, and the parts needed for a formatted table are few
 * enough that a megabyte of library to emit them would be a poor trade against
 * this project's 400KB chunk budget.
 *
 * A second sheet records the rates the list was priced with. A price list is a
 * statement about one particular Monday, and six months later the only way to
 * check the arithmetic is to know what the import VAT was that week.
 */

import { writeZip, xmlEscape, type ZipEntry } from './zip';

export interface CostingRow {
  display_name: string;
  model: string | null;
  storage_gb: number | null;
  five_g: boolean;
  supplier_cost: number;
  import_vat: number;
  landed_cost: number;
  markup_pct: number;
  price_excl_vat: number;
  sales_vat: number;
  final_price: number;
  stock_status: 'in_stock' | 'on_order' | 'out_of_stock';
  stock_qty: number;
}

export interface CostingWorkbookOptions {
  rows: CostingRow[];
  weekStart: string;
  importVatRate: number;
  salesVatRate: number;
  defaultMarkup: number;
  supplierName?: string | null;
  supplierFile?: string | null;
  generatedBy?: string | null;
  generatedAt?: Date;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function costingFileName(weekStart: string): string {
  return `JR_Importers_Internal_Costing_${weekStart}.xlsx`;
}

/* ── Style indices, in the order they are declared in styles.xml ─────────── */
const S = {
  default: 0,
  title: 1,
  subtitle: 2,
  header: 3,
  text: 4,
  money: 5,
  percent: 6,
  integer: 7,
  textGreen: 8,
  moneyGreen: 9,
  percentGreen: 10,
  integerGreen: 11,
  label: 12,
} as const;

const STATUS_LABEL = {
  in_stock: 'IN STOCK',
  on_order: 'ON ORDER',
  out_of_stock: 'ON ORDER',
} as const;

const colLetter = (index: number): string => {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

type CellValue = { t: 'n'; v: number; s: number } | { t: 's'; v: string; s: number } | null;

const num = (v: number, s: number): CellValue => ({ t: 'n', v, s });
const str = (v: string, s: number): CellValue => ({ t: 's', v, s });

function rowXml(rowIndex: number, cells: CellValue[]): string {
  const parts = cells
    .map((cell, i) => {
      if (!cell) return '';
      const ref = `${colLetter(i)}${rowIndex}`;
      if (cell.t === 'n') return `<c r="${ref}" s="${cell.s}"><v>${cell.v}</v></c>`;
      return `<c r="${ref}" s="${cell.s}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell.v)}</t></is></c>`;
    })
    .join('');
  return `<row r="${rowIndex}">${parts}</row>`;
}

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="&quot;N$&quot;\\ #,##0.00"/>
    <numFmt numFmtId="165" formatCode="0.0&quot;%&quot;"/>
  </numFmts>
  <fonts count="6">
    <font><sz val="10"/><name val="Calibri"/><color rgb="FF0D263F"/></font>
    <font><b/><sz val="16"/><name val="Calibri"/><color rgb="FF123354"/></font>
    <font><sz val="9"/><name val="Calibri"/><color rgb="FF6E7A8F"/></font>
    <font><b/><sz val="9"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>
    <font><sz val="10"/><name val="Calibri"/><color rgb="FF0D263F"/></font>
    <font><b/><sz val="10"/><name val="Calibri"/><color rgb="FF0D263F"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF123354"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEAF7D4"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left/><right/><top/><bottom style="hair"><color rgb="FFCED6E2"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="13">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1">
      <alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="164" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="165" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="1" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="5" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="5" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="165" fontId="5" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="1" fontId="5" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0"/>
  </cellXfs>
</styleSheet>`;

export function buildCostingWorkbook(options: CostingWorkbookOptions): Blob {
  const generated = options.generatedAt ?? new Date();
  const headings = [
    'Handset',
    'Model',
    'Storage (GB)',
    '5G',
    'Supplier cost',
    `Import VAT (${(options.importVatRate * 100).toFixed(1)}%)`,
    'Landed cost',
    'Markup %',
    'Selling excl. VAT',
    `Sales VAT (${(options.salesVatRate * 100).toFixed(1)}%)`,
    'Final selling price',
    'Stock status',
    'On hand',
  ];

  const rows: string[] = [];
  rows.push(rowXml(1, [str('JR IMPORTERS — INTERNAL COSTING', S.title)]));
  rows.push(rowXml(2, [str('Confidential. Supplier costs and margins — not for customers.', S.subtitle)]));
  rows.push(
    rowXml(3, [
      str(`Week of ${options.weekStart}`, S.subtitle),
      null,
      null,
      str(`Generated ${generated.toISOString().slice(0, 16).replace('T', ' ')}`, S.subtitle),
    ]),
  );

  const headerRow = 5;
  rows.push(rowXml(headerRow, headings.map((h) => str(h, S.header))));

  options.rows.forEach((row, index) => {
    const green = row.stock_status === 'in_stock';
    const text = green ? S.textGreen : S.text;
    const money = green ? S.moneyGreen : S.money;
    const pct = green ? S.percentGreen : S.percent;
    const int = green ? S.integerGreen : S.integer;

    rows.push(
      rowXml(headerRow + 1 + index, [
        str(row.display_name, text),
        str(row.model ?? '', text),
        row.storage_gb === null ? str('', text) : num(row.storage_gb, int),
        str(row.five_g ? 'Yes' : 'No', text),
        num(row.supplier_cost, money),
        num(row.import_vat, money),
        num(row.landed_cost, money),
        num(row.markup_pct, pct),
        num(row.price_excl_vat, money),
        num(row.sales_vat, money),
        num(row.final_price, money),
        str(STATUS_LABEL[row.stock_status], text),
        num(row.stock_qty, int),
      ]),
    );
  });

  const lastRow = headerRow + options.rows.length;
  const lastCol = colLetter(headings.length - 1);

  const widths = [38, 12, 13, 6, 14, 16, 14, 10, 17, 16, 18, 14, 9]
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');

  const sheet1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0" showGridLines="0">
    <pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/>
  </sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${widths}</cols>
  <sheetData>${rows.join('')}</sheetData>
  ${options.rows.length ? `<autoFilter ref="A${headerRow}:${lastCol}${lastRow}"/>` : ''}
  <pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
  <pageSetup orientation="landscape" fitToWidth="1" paperSize="9"/>
</worksheet>`;

  // Sheet two: the rates this list was priced with.
  const refRows = [
    rowXml(1, [str('Rates used for this price list', S.title)]),
    rowXml(3, [str('Week of', S.label), str(options.weekStart, S.text)]),
    rowXml(4, [str('Import VAT', S.label), num(options.importVatRate * 100, S.percent)]),
    rowXml(5, [str('Sales VAT', S.label), num(options.salesVatRate * 100, S.percent)]),
    rowXml(6, [str('Default markup', S.label), num(options.defaultMarkup, S.percent)]),
    rowXml(7, [str('Supplier', S.label), str(options.supplierName ?? '—', S.text)]),
    rowXml(8, [str('Supplier file', S.label), str(options.supplierFile ?? '—', S.text)]),
    rowXml(9, [str('Generated by', S.label), str(options.generatedBy ?? '—', S.text)]),
    rowXml(10, [str('Generated at', S.label), str(generated.toISOString(), S.text)]),
    rowXml(12, [str('Handsets priced', S.label), num(options.rows.length, S.integer)]),
    rowXml(13, [
      str('In stock', S.label),
      num(options.rows.filter((r) => r.stock_status === 'in_stock').length, S.integer),
    ]),
    rowXml(14, [
      str('On order', S.label),
      num(options.rows.filter((r) => r.stock_status !== 'in_stock').length, S.integer),
    ]),
    rowXml(16, [
      str(
        'Final selling price = supplier cost x (1 + import VAT) x (1 + markup) x (1 + sales VAT),'
          + ' rounded to the cent at each step.',
        S.subtitle,
      ),
    ]),
  ];

  const sheet2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>
  <cols><col min="1" max="1" width="22" customWidth="1"/><col min="2" max="2" width="60" customWidth="1"/></cols>
  <sheetData>${refRows.join('')}</sheetData>
  <pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
</worksheet>`;

  const entries: ZipEntry[] = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Costing" sheetId="1" r:id="rId1"/>
    <sheet name="Rates" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { name: 'xl/styles.xml', data: styles },
    { name: 'xl/worksheets/sheet1.xml', data: sheet1 },
    { name: 'xl/worksheets/sheet2.xml', data: sheet2 },
  ];

  return writeZip(entries, XLSX_MIME);
}
