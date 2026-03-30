import { usePhantomOws } from '../PhantomOwsProvider';
import { computeTodaySpend } from '../utils/owsCompliance';
import type { OwsPolicy } from '../types';

export interface UsePolicyReturn {
  policy: OwsPolicy;
  todaySpendUsd: number;
  remainingDailyUsd: number;
  isPaused: boolean;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  setDailyLimit: (usd: number) => Promise<void>;
  setPerTransactionLimit: (usd: number) => Promise<void>;
  setRequireBiometrics: (require: boolean) => Promise<void>;
  setAutoApproveBelow: (usd: number) => Promise<void>;
  addAllowedChain: (chain: string) => Promise<void>;
  removeAllowedChain: (chain: string) => Promise<void>;
  addAllowedAsset: (asset: string) => Promise<void>;
  removeAllowedAsset: (asset: string) => Promise<void>;
  addAllowedDestination: (address: string) => Promise<void>;
  removeAllowedDestination: (address: string) => Promise<void>;
  updatePolicy: (patch: Partial<OwsPolicy>) => Promise<void>;
}

/**
 * Hook for reading and updating the active OWS spending policy.
 *
 * @example
 * const { policy, remainingDailyUsd, pause } = usePolicy();
 */
export function usePolicy(): UsePolicyReturn {
  const { policy, updatePolicy, history } = usePhantomOws();

  const todaySpendUsd = computeTodaySpend(history);
  const remainingDailyUsd = Math.max(0, policy.dailyLimitUsd - todaySpendUsd);

  return {
    policy,
    todaySpendUsd,
    remainingDailyUsd,
    isPaused: policy.paused,

    pause: () => updatePolicy({ paused: true }),
    resume: () => updatePolicy({ paused: false }),
    setDailyLimit: (usd) => updatePolicy({ dailyLimitUsd: usd }),
    setPerTransactionLimit: (usd) => updatePolicy({ perTransactionLimitUsd: usd }),
    setRequireBiometrics: (require) => updatePolicy({ requireBiometrics: require }),
    setAutoApproveBelow: (usd) => updatePolicy({ autoApproveBelow: usd }),

    addAllowedChain: (chain) =>
      updatePolicy({ allowedChains: [...policy.allowedChains, chain] }),
    removeAllowedChain: (chain) =>
      updatePolicy({ allowedChains: policy.allowedChains.filter((c) => c !== chain) }),

    addAllowedAsset: (asset) =>
      updatePolicy({ allowedAssets: [...(policy.allowedAssets ?? []), asset] }),
    removeAllowedAsset: (asset) =>
      updatePolicy({ allowedAssets: (policy.allowedAssets ?? []).filter((a) => a !== asset) }),

    addAllowedDestination: (address) =>
      updatePolicy({ allowedDestinations: [...(policy.allowedDestinations ?? []), address] }),
    removeAllowedDestination: (address) =>
      updatePolicy({
        allowedDestinations: (policy.allowedDestinations ?? []).filter((a) => a !== address),
      }),

    updatePolicy,
  };
}
