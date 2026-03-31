import { useCallback, useState } from 'react';
import { useSolana } from '@phantom/react-native-sdk';
import { usePhantomOws } from '../PhantomOwsProvider';
import {
  fetchWithX402,
  retryWithPayment,
  selectPaymentOption,
  encodePaymentSignature,
} from '../utils/parseMppChallenge';
import {
  checkPolicy,
  signSvmPayment,
  buildAndSignSvmTransfer,
  buildAndSignSvmTransferLocal,
  getOrCreateDevnetKeypair,
  signEvmPayment,
  parseSettlementResponse,
  computeTodaySpend,
  isSvmNetwork,
  logToVault,
} from '../utils/owsCompliance';
import type {
  X402PaymentRequired,
  X402PaymentAccept,
  X402PaymentPayload,
  PaymentOptions,
  PaymentResult,
  PaymentRecord,
} from '../types';

export interface UsePayWithPhantomOwsReturn {
  /** Fetch a URL, handle 402, pay, and return the final response + payment result. */
  payAndFetch: (
    url: string,
    opts?: PaymentOptions & { fetchInit?: RequestInit },
  ) => Promise<{ response: Response; payment: PaymentResult }>;

  /** Pay an already-parsed x402 challenge directly. */
  payChallenge: (
    challenge: X402PaymentRequired,
    resourceUrl: string,
    opts?: PaymentOptions,
  ) => Promise<PaymentResult>;

  isPaying: boolean;
  lastError: Error | null;
}

/**
 * The core payment hook. Handles the full x402/MPP payment flow:
 * fetch → 402 → parse challenge → policy check → optional biometrics →
 * sign with Phantom → retry request → record result.
 *
 * @example
 * const { payAndFetch } = usePayWithPhantomOws();
 * const { response } = await payAndFetch('https://api.example.com/premium-data');
 * const data = await response.json();
 */
export function usePayWithPhantomOws(): UsePayWithPhantomOwsReturn {
  const { wallet, policy, addRecord, config } = usePhantomOws();
  const { solana } = useSolana();

  const [isPaying, setIsPaying] = useState(false);
  const [lastError, setLastError] = useState<Error | null>(null);

  /**
   * Sign an x402 accept option using the appropriate Phantom method.
   * Branches on whether the server provided a partial transaction (extra.transaction)
   * or expects a client-built SOL transfer.
   */
  const signAccept = useCallback(
    async (accept: X402PaymentAccept, resourceUrl: string): Promise<X402PaymentPayload> => {
      if (isSvmNetwork(accept.network)) {
        const isDevnet = accept.network.includes('devnet');
        const rpcUrl = config.solanaRpcUrl ?? 'https://api.devnet.solana.com';

        if (isDevnet) {
          // Phantom's embedded KMS is mainnet-only — it has no devnet USD price feed
          // so the spending extension always fails on devnet (HTTP 500 from KMS).
          // signTransaction is also unsupported for embedded wallets per Phantom docs.
          // Solution: sign locally with a persisted Keypair and broadcast directly.
          const keypair = await getOrCreateDevnetKeypair();
          console.log('[ows] devnet local signer:', keypair.publicKey.toBase58());
          return buildAndSignSvmTransferLocal(accept, keypair, rpcUrl, resourceUrl);
        }

        console.log('[ows] switchNetwork → mainnet');
        await (solana as unknown as { switchNetwork: (n: string) => Promise<void> }).switchNetwork('mainnet');

        // Bypass Phantom's /prepare simulation endpoint via axios interceptor.
        // For devnet we also use signTransaction (not signAndSendTransaction) so that
        // the KMS request omits simulationConfig — which prevents the "Solana USD spend
        // extension" from running its own simulation quorum (fails on devnet, no USD feed).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const phantomClient = (solana as any)?.provider?.client;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const axiosInstance = phantomClient?.axiosInstance;
        let axiosRequestInterceptorId: number | undefined;
        let axiosResponseInterceptorId: number | undefined;

        if (axiosInstance) {
          axiosRequestInterceptorId = axiosInstance.interceptors.request.use(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (reqConfig: any) => {
              if (typeof reqConfig.url === 'string' && reqConfig.url.endsWith('/prepare')) {
                console.log('[ows] intercepting /prepare — returning tx unchanged');
                reqConfig.adapter = () => {
                  const txData = typeof reqConfig.data === 'string'
                    ? JSON.parse(reqConfig.data)
                    : reqConfig.data;
                  return Promise.resolve({
                    data: { transaction: txData?.transaction ?? '' },
                    status: 200, statusText: 'OK', headers: {}, config: reqConfig,
                  });
                };
              }
              return reqConfig;
            },
          );
          axiosResponseInterceptorId = axiosInstance.interceptors.response.use(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (response: any) => response,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (error: any) => {
              const url = error.config?.url ?? 'unknown';
              const status = error.response?.status;
              const body = JSON.stringify(error.response?.data);
              console.error(`[ows] Phantom API error: ${url} → HTTP ${status}: ${body}`);
              return Promise.reject(error);
            },
          );
        }

        const signerAddress = (solana as typeof solana & { publicKey?: string | null }).publicKey ?? wallet.solanaAddress;
        if (!signerAddress) throw new Error('Solana signer address not available — wallet not connected');

        const hasPartialTx = !!(accept.extra as Record<string, unknown> | undefined)?.['transaction'];
        let result: X402PaymentPayload;
        try {
          if (hasPartialTx) {
            result = await signSvmPayment(
              accept,
              (tx) => solana.signTransaction(tx as Parameters<typeof solana.signTransaction>[0]),
              resourceUrl,
            );
          } else {
            const signAndSend = async (tx: unknown): Promise<{ signature: string }> => {
              const { signature } = await solana.signAndSendTransaction(
                tx as Parameters<typeof solana.signAndSendTransaction>[0],
              );
              return { signature };
            };
            result = await buildAndSignSvmTransfer(accept, signerAddress, signAndSend, rpcUrl, resourceUrl);
          }
        } finally {
          if (axiosInstance && axiosRequestInterceptorId !== undefined) {
            axiosInstance.interceptors.request.eject(axiosRequestInterceptorId);
          }
          if (axiosInstance && axiosResponseInterceptorId !== undefined) {
            axiosInstance.interceptors.response.eject(axiosResponseInterceptorId);
          }
        }
        return result;
      } else {
        return signEvmPayment(accept, resourceUrl);
      }
    },
    [wallet.solanaAddress, config.solanaRpcUrl, solana],
  );

  const payChallenge = useCallback(
    async (
      challenge: X402PaymentRequired,
      resourceUrl: string,
      opts: PaymentOptions = {},
    ): Promise<PaymentResult> => {
      if (!wallet.isConnected) {
        throw new Error('Wallet not connected. Call connect() first.');
      }

      // 1. Select best payment option
      const accept = selectPaymentOption(challenge, opts.preferredNetwork);

      // 2. Policy check
      const todaySpend = computeTodaySpend([]);
      const policyResult = checkPolicy(policy, accept, {
        amountUsd: opts.amountUsd,
        todaySpend,
      });

      if (!policyResult.allowed) {
        throw new Error(`Payment blocked by policy: ${policyResult.reason}`);
      }

      // 3. Biometric / approval gate
      if (policyResult.requiresApproval && !opts.skipApproval) {
        const approved = await requestBiometricApproval();
        if (!approved) {
          throw new Error('Payment rejected by user');
        }
      }

      // 4. Build pending record
      const pendingRecord: PaymentRecord = {
        id: generateId(),
        timestamp: Date.now(),
        amount: accept.amount,
        amountUsd: opts.amountUsd,
        asset: accept.asset,
        destination: accept.payTo,
        network: accept.network,
        status: 'pending',
        memo: accept.memo,
        resourceUrl,
      };
      addRecord(pendingRecord);

      // 5. Sign
      let payload: X402PaymentPayload;
      try {
        payload = await signAccept(accept, resourceUrl);
      } catch (err) {
        addRecord({ ...pendingRecord, status: 'failed' });
        throw err;
      }

      const signatureHeader = encodePaymentSignature(payload);

      // 6. Retry the request with payment signature
      const paidResponse = await retryWithPayment(resourceUrl, signatureHeader);
      const settlement = parseSettlementResponse(paidResponse.headers);

      const finalStatus: PaymentRecord['status'] = settlement.success ? 'success' : 'failed';
      const successRecord: PaymentRecord = {
        ...pendingRecord,
        status: finalStatus,
        txHash: settlement.txHash,
      };
      addRecord(successRecord);

      // 7. Optionally audit log to vault
      if (config.vaultUrl && wallet.solanaAddress) {
        logToVault(config.vaultUrl, successRecord, wallet.solanaAddress);
      }

      return {
        success: settlement.success,
        txHash: settlement.txHash,
        network: accept.network,
        record: successRecord,
      };
    },
    [wallet, policy, addRecord, config, signAccept],
  );

  const payAndFetch = useCallback(
    async (
      url: string,
      opts: PaymentOptions & { fetchInit?: RequestInit } = {},
    ): Promise<{ response: Response; payment: PaymentResult }> => {
      setIsPaying(true);
      setLastError(null);

      try {
        const { fetchInit, ...payOpts } = opts;

        // First attempt — might succeed without payment
        const { response, challenge } = await fetchWithX402(url, fetchInit);

        if (!challenge) {
          // No payment needed — return response as-is with a synthetic result
          const record: PaymentRecord = {
            id: generateId(),
            timestamp: Date.now(),
            amount: '0',
            asset: '',
            destination: '',
            network: '',
            status: 'success',
            resourceUrl: url,
          };
          return { response, payment: { success: true, network: '', record } };
        }

        // 402 received — select option, check policy, sign, and retry
        const accept = selectPaymentOption(challenge, payOpts.preferredNetwork);

        const todaySpend = computeTodaySpend([]);
        const policyResult = checkPolicy(policy, accept, {
          amountUsd: payOpts.amountUsd,
          todaySpend,
        });
        if (!policyResult.allowed) {
          throw new Error(`Payment blocked by policy: ${policyResult.reason}`);
        }

        if (policyResult.requiresApproval && !payOpts.skipApproval) {
          const approved = await requestBiometricApproval();
          if (!approved) throw new Error('Payment rejected by user');
        }

        const pendingRecord: PaymentRecord = {
          id: generateId(),
          timestamp: Date.now(),
          amount: accept.amount,
          amountUsd: payOpts.amountUsd,
          asset: accept.asset,
          destination: accept.payTo,
          network: accept.network,
          status: 'pending',
          memo: accept.memo,
          resourceUrl: url,
        };
        addRecord(pendingRecord);

        let payload: X402PaymentPayload;
        try {
          payload = await signAccept(accept, url);
        } catch (err) {
          addRecord({ ...pendingRecord, status: 'failed' });
          throw err;
        }

        // Retry the original request with the payment signature header
        const signatureHeader = encodePaymentSignature(payload);
        const paidResponse = await retryWithPayment(url, signatureHeader);
        const settlement = parseSettlementResponse(paidResponse.headers);

        const finalStatus: PaymentRecord['status'] = settlement.success ? 'success' : 'failed';
        const successRecord: PaymentRecord = {
          ...pendingRecord,
          status: finalStatus,
          txHash: settlement.txHash,
        };
        addRecord(successRecord);

        if (config.vaultUrl && wallet.solanaAddress) {
          logToVault(config.vaultUrl, successRecord, wallet.solanaAddress);
        }

        return {
          response: paidResponse,
          payment: {
            success: settlement.success,
            txHash: settlement.txHash,
            network: accept.network,
            record: successRecord,
          },
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setLastError(error);
        throw error;
      } finally {
        setIsPaying(false);
      }
    },
    [wallet, policy, addRecord, config, signAccept],
  );

  return { payAndFetch, payChallenge, isPaying, lastError };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Attempt biometric authentication via expo-local-authentication.
 * Falls back to true if the module is not installed (dev environments).
 */
async function requestBiometricApproval(): Promise<boolean> {
  try {
    // Dynamic import keeps expo-local-authentication optional
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const LocalAuthentication: any = await import('expo-local-authentication');
    const hasHardware: boolean = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return true;

    const isEnrolled: boolean = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return true;

    const result: { success: boolean } = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirm payment',
      fallbackLabel: 'Use passcode',
      cancelLabel: 'Cancel',
    });
    return result.success;
  } catch {
    // expo-local-authentication not installed — skip biometric gate
    return true;
  }
}
