import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface BankDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branchCode: string;
}

const KEYS = ['bank_name', 'bank_account_name', 'bank_account_number', 'bank_branch_code'];

/**
 * The shop's banking details for EFT payments, read from settings so a changed
 * account shows without a deploy. Row security exposes only these four keys
 * to customers. Resolves to null when the account number is not set.
 */
export function useBankDetails() {
  return useQuery({
    queryKey: ['settings', 'bank-details'],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<BankDetails | null> => {
      const { data, error } = await supabase.from('settings').select('key, value').in('key', KEYS);
      if (error) throw error;
      // settings.value is jsonb, so a plain string can arrive wrapped in quotes.
      const read = (key: string) => {
        const raw = (data ?? []).find((row) => row.key === key)?.value;
        if (raw === null || raw === undefined) return '';
        return String(typeof raw === 'string' ? raw : JSON.stringify(raw)).replace(/^"|"$/g, '');
      };
      const details = {
        bankName: read('bank_name'),
        accountName: read('bank_account_name'),
        accountNumber: read('bank_account_number'),
        branchCode: read('bank_branch_code'),
      };
      return details.accountNumber ? details : null;
    },
  });
}
