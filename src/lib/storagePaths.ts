/**
 * A storage path for a document that goes out to a customer.
 *
 * The folder is public — the shop shares invoices and job cards as plain
 * links over WhatsApp — so the path is the only thing keeping one customer
 * out of another customer's paperwork. It therefore cannot be derived from
 * the document number. Invoices were stored as `invoices/INV12160.pdf` with
 * the numbers running consecutively, which is an invitation to count.
 *
 * The readable name is kept as the last segment so a customer who saves the
 * file still gets "Invoice INV12160.pdf" rather than a uuid.
 */
export function sharedDocumentPath(folder: string, fileName: string): string {
  return `${folder}/${crypto.randomUUID()}/${fileName}`;
}
