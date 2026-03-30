import { usePhantomOws } from '../PhantomOwsProvider';
import type { PhantomOwsWalletState, PhantomOwsAccount } from '../types';

export interface UsePhantomOwsWalletReturn extends PhantomOwsWalletState {
  connect: (provider: 'google' | 'apple') => Promise<void>;
  disconnect: () => void;
  primaryAccount: PhantomOwsAccount | null;
}

/**
 * Convenient hook for wallet connection state and auth actions.
 *
 * @example
 * const { isConnected, solanaAddress, connect, disconnect } = usePhantomOwsWallet();
 */
export function usePhantomOwsWallet(): UsePhantomOwsWalletReturn {
  const { wallet, connect, disconnect } = usePhantomOws();

  const primaryAccount =
    wallet.accounts.find((a) => a.chain === 'solana') ??
    wallet.accounts[0] ??
    null;

  return {
    ...wallet,
    connect,
    disconnect,
    primaryAccount,
  };
}
