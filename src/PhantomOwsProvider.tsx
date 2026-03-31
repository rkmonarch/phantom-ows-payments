import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  PhantomProvider,
  useConnect,
  useDisconnect,
  useAccounts,
  useSolana,
  type WalletAddress,
} from '@phantom/react-native-sdk';
import { AddressType } from '@phantom/client';
import type {
  PhantomOwsConfig,
  PhantomOwsContextValue,
  PhantomOwsWalletState,
  OwsPolicy,
  PaymentRecord,
} from './types';

// ─── Default Policy ───────────────────────────────────────────────────────────

const DEFAULT_POLICY: OwsPolicy = {
  id: 'default',
  name: 'Default Policy',
  dailyLimitUsd: 100,
  perTransactionLimitUsd: 25,
  allowedChains: ['solana:mainnet', 'solana:devnet'],
  paused: false,
  requireBiometrics: true,
  autoApproveBelow: 1,
};

// ─── Context ──────────────────────────────────────────────────────────────────

export const PhantomOwsContext = createContext<PhantomOwsContextValue | null>(null);

// ─── Inner provider (has access to Phantom hooks) ─────────────────────────────

function PhantomOwsInner({
  children,
  config,
}: {
  children: ReactNode;
  config: PhantomOwsConfig;
}) {
  const { connect: phantomConnect } = useConnect();
  const { disconnect: phantomDisconnect } = useDisconnect();
  const accountsResult = useAccounts();
  const { solana } = useSolana();

  const [wallet, setWallet] = useState<PhantomOwsWalletState>({
    isConnected: false,
    isLoading: false,
    accounts: [],
  });

  const [policy, setPolicy] = useState<OwsPolicy>({
    ...DEFAULT_POLICY,
    ...config.defaultPolicy,
  });

  const [history, setHistory] = useState<PaymentRecord[]>([]);

  const switchConfiguredNetwork = useCallback(async () => {
    if (!config.cluster || !(accountsResult.isConnected ?? false)) return;

    const targetNetwork = config.cluster === 'mainnet-beta' ? 'mainnet' : config.cluster;
    const switchNetwork = (solana as unknown as { switchNetwork?: (network: string) => Promise<void> }).switchNetwork;
    if (typeof switchNetwork !== 'function') return;

    try {
      await switchNetwork(targetNetwork);
    } catch (error) {
      console.warn('[ows] failed to switch Phantom network:', error);
    }
  }, [accountsResult.isConnected, config.cluster, solana]);

  // Sync Phantom accounts into our wallet state
  useEffect(() => {
    const addresses: WalletAddress[] = accountsResult.addresses ?? [];
    const isConnected = accountsResult.isConnected ?? false;

    if (!isConnected || addresses.length === 0) {
      setWallet((prev) => ({ ...prev, isConnected: false, accounts: [] }));
      return;
    }

    const mapped = addresses.map((a: WalletAddress) => {
      const chain: 'solana' | 'ethereum' = a.addressType === AddressType.ethereum
        ? 'ethereum'
        : 'solana';
      return { address: a.address, chain };
    });

    const solanaAccount = mapped.find((a) => a.chain === 'solana');
    const evmAccount = mapped.find((a) => a.chain === 'ethereum');

    setWallet({
      isConnected: true,
      isLoading: false,
      accounts: mapped,
      solanaAddress: solanaAccount?.address,
      evmAddress: evmAccount?.address,
    });
  }, [accountsResult.addresses, accountsResult.isConnected]);

  useEffect(() => {
    switchConfiguredNetwork();
  }, [switchConfiguredNetwork]);

  const connect = useCallback(
    async (provider: 'google' | 'apple') => {
      setWallet((prev) => ({ ...prev, isLoading: true }));
      try {
        await phantomConnect({ provider });
        await switchConfiguredNetwork();
      } finally {
        setWallet((prev) => ({ ...prev, isLoading: false }));
      }
    },
    [phantomConnect, switchConfiguredNetwork],
  );

  const disconnect = useCallback(() => {
    phantomDisconnect();
    setWallet({ isConnected: false, isLoading: false, accounts: [] });
  }, [phantomDisconnect]);

  const updatePolicy = useCallback(async (patch: Partial<OwsPolicy>) => {
    setPolicy((prev) => ({ ...prev, ...patch }));
  }, []);

  const addRecord = useCallback((record: PaymentRecord) => {
    setHistory((prev) => [record, ...prev]);
  }, []);

  const value: PhantomOwsContextValue = {
    wallet,
    connect,
    disconnect,
    policy,
    updatePolicy,
    history,
    addRecord,
    config,
  };

  return (
    <PhantomOwsContext.Provider value={value}>
      {children}
    </PhantomOwsContext.Provider>
  );
}

// ─── Public Provider ──────────────────────────────────────────────────────────

export function PhantomOwsProvider({
  children,
  config,
}: {
  children: ReactNode;
  config: PhantomOwsConfig;
}) {
  const sdkConfig = {
    appId: config.appId,
    providers: ['google' as const, 'apple' as const],
    scheme: config.scheme,
    addressTypes: [AddressType.solana, AddressType.ethereum],
  };

  return (
    <PhantomProvider config={sdkConfig}>
      <PhantomOwsInner config={config}>{children}</PhantomOwsInner>
    </PhantomProvider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePhantomOws(): PhantomOwsContextValue {
  const ctx = useContext(PhantomOwsContext);
  if (!ctx) {
    throw new Error('usePhantomOws must be used inside <PhantomOwsProvider>');
  }
  return ctx;
}
