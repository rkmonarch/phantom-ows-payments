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
  signEvmPayment,
  parseSettlementResponse,
  computeTodaySpend,
  isSvmNetwork,
  logToVault,
} from '../utils/owsCompliance';
import type {
  X402PaymentRequired,
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
      const todaySpend = computeTodaySpend([]); // pass real history via closure if needed
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
      let payload;
      try {
        if (isSvmNetwork(accept.network)) {
          payload = await signSvmPayment(
            accept,
            (tx) => solana.signTransaction(tx as Parameters<typeof solana.signTransaction>[0]),
            resourceUrl,
          );
        } else {
          payload = await signEvmPayment(accept, resourceUrl);
        }
      } catch (err) {
        const failedRecord: PaymentRecord = { ...pendingRecord, status: 'failed' };
        addRecord(failedRecord);
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
    [wallet, policy, addRecord, config, solana],
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

        // 402 received — pay and retry
        const payment = await payChallenge(challenge, url, payOpts);

        // Re-fetch the resource after payment
        const { response: paidResponse } = await fetchWithX402(url, {
          ...fetchInit,
          headers: {
            ...(fetchInit?.headers ?? {}),
            'PAYMENT-SIGNATURE': encodePaymentSignature(payment),
          },
        });

        return { response: paidResponse, payment };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setLastError(error);
        throw error;
      } finally {
        setIsPaying(false);
      }
    },
    [payChallenge],
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
