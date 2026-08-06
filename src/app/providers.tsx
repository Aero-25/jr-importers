import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/auth/AuthProvider';
import { ToastProvider } from '@/ui';

/**
 * Shared client for both entries.
 *
 * Retail data changes under you constantly — another till sells the last unit
 * while you are looking at it — so `staleTime` is short and refetch-on-focus
 * is on. RLS failures are not worth retrying; they will fail identically.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          const message = error instanceof Error ? error.message : '';
          if (/row-level security|permission denied|JWT/i.test(message)) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: 0 },
    },
  });
}

const queryClient = createQueryClient();

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export { queryClient };
