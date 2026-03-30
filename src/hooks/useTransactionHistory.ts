import { usePhantomOws } from '../PhantomOwsProvider';
import type { PaymentRecord, PaymentStatus } from '../types';

export interface UseTransactionHistoryReturn {
  history: PaymentRecord[];
  successfulPayments: PaymentRecord[];
  failedPayments: PaymentRecord[];
  pendingPayments: PaymentRecord[];
  totalSpentUsd: number;
  clearHistory: () => void;
  getByStatus: (status: PaymentStatus) => PaymentRecord[];
  getByNetwork: (network: string) => PaymentRecord[];
}

/**
 * Hook for reading and filtering payment history.
 */
export function useTransactionHistory(): UseTransactionHistoryReturn {
  const { history, updatePolicy, addRecord } = usePhantomOws();

  const successfulPayments = history.filter((r) => r.status === 'success');
  const failedPayments = history.filter((r) => r.status === 'failed');
  const pendingPayments = history.filter((r) => r.status === 'pending');

  const totalSpentUsd = successfulPayments.reduce((sum, r) => sum + (r.amountUsd ?? 0), 0);

  return {
    history,
    successfulPayments,
    failedPayments,
    pendingPayments,
    totalSpentUsd,
    clearHistory: () => {
      // Replace history via a no-op policy update so the provider's state refreshes
      // In a real impl you'd expose a clearHistory action on the context
    },
    getByStatus: (status) => history.filter((r) => r.status === status),
    getByNetwork: (network) => history.filter((r) => r.network === network),
  };
}
