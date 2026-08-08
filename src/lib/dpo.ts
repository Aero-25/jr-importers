/**
 * DPO card payments, through the site's own Worker endpoints.
 *
 * The Worker (`/api/dpo-create-token`, `/api/dpo-verify-token`) wraps DPO's
 * XML API; this module wraps the Worker for the storefront. The company token
 * and service type mirror the legacy pages — they are publishable identifiers,
 * not secrets: DPO authorises the merchant by them, money only ever moves
 * toward the merchant account.
 */

const COMPANY_TOKEN = '8D3DA73D-9D7F-4E09-96D4-3D44E7A83EA3';
const SERVICE_TYPE = '3854';
const CURRENCY = 'NAD';

export interface DpoToken {
  transToken: string;
  transRef: string;
}

export async function createDpoPayment(options: {
  amount: number;
  reference: string;
  description: string;
  redirectUrl: string;
  customerEmail?: string;
  customerFirstName?: string;
  customerPhone?: string;
}): Promise<DpoToken> {
  const response = await fetch('/api/dpo-create-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      companyToken: COMPANY_TOKEN,
      amount: options.amount.toFixed(2),
      currency: CURRENCY,
      companyRef: options.reference,
      redirectURL: options.redirectUrl,
      backURL: options.redirectUrl,
      customerEmail: options.customerEmail ?? '',
      customerFirstName: options.customerFirstName ?? '',
      customerPhone: options.customerPhone ?? '',
      customerCountry: 'NA',
      services: [
        {
          type: SERVICE_TYPE,
          description: options.description.slice(0, 180),
          date: new Date().toISOString().slice(0, 10),
        },
      ],
    }),
  });

  const data = (await response.json()) as {
    result?: string;
    resultExplanation?: string;
    transToken?: string;
    transRef?: string;
    error?: string;
  };

  if (!response.ok || data.error) {
    throw new Error(data.error ?? 'The payment service did not respond.');
  }
  if (data.result !== '000' || !data.transToken) {
    throw new Error(data.resultExplanation ?? 'The payment could not be started.');
  }
  return { transToken: data.transToken, transRef: data.transRef ?? options.reference };
}

/** Where the customer goes to actually pay. */
export function dpoPayUrl(transToken: string): string {
  return `https://secure.3gdirectpay.com/payv2.php?ID=${encodeURIComponent(transToken)}`;
}

export interface DpoVerification {
  paid: boolean;
  explanation: string;
  amount: number;
}

/** `Result: 000` from verifyToken means the money is authorised. */
export async function verifyDpoPayment(transactionToken: string): Promise<DpoVerification> {
  const response = await fetch('/api/dpo-verify-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ companyToken: COMPANY_TOKEN, transactionToken }),
  });

  const data = (await response.json()) as {
    result?: string;
    resultExplanation?: string;
    transactionAmount?: string;
    error?: string;
  };

  if (!response.ok || data.error) {
    throw new Error(data.error ?? 'The payment could not be checked.');
  }

  return {
    paid: data.result === '000',
    explanation: data.resultExplanation ?? '',
    amount: Number(data.transactionAmount ?? 0) || 0,
  };
}
