import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Clipboard, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ConnectButton, usePhantomOwsWallet, usePolicy } from 'phantom-ows-payments';

const SOLANA_RPC = 'https://api.devnet.solana.com';

export function WalletScreen() {
  const { isConnected, solanaAddress, evmAddress } = usePhantomOwsWallet();
  const { policy, todaySpendUsd, remainingDailyUsd, pause, resume } = usePolicy();

  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!solanaAddress) return;
    setBalanceLoading(true);
    try {
      const res = await fetch(SOLANA_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getBalance',
          params: [solanaAddress, { commitment: 'confirmed' }],
        }),
      });
      const { result } = await res.json() as { result: { value: number } };
      setSolBalance(result.value / 1e9); // lamports → SOL
    } catch {
      setSolBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }, [solanaAddress]);

  // Fetch on connect and whenever address changes
  useEffect(() => {
    if (isConnected && solanaAddress) {
      fetchBalance();
    } else {
      setSolBalance(null);
    }
  }, [isConnected, solanaAddress, fetchBalance]);

  return (
    <View style={styles.container}>
      {/* Connect */}
      <View style={styles.section}>
        <Text style={styles.title}>Embedded Wallet</Text>
        <Text style={styles.subtitle}>
          Phantom social login — no seed phrase required
        </Text>
        <ConnectButton
          showBothProviders
          onConnected={(addr) => console.log('Connected:', addr)}
        />
      </View>

      {/* Wallet Info */}
      {isConnected && (
        <>
          {/* Balance */}
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Devnet Balance</Text>
            {balanceLoading ? (
              <ActivityIndicator color="#A78BFA" />
            ) : (
              <Text style={styles.balanceAmount}>
                {solBalance !== null ? `${solBalance.toFixed(4)} SOL` : '—'}
              </Text>
            )}
            <TouchableOpacity onPress={fetchBalance} disabled={balanceLoading}>
              <Text style={styles.refreshText}>↻ Refresh</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Addresses</Text>
            <AddressRow label="Solana" address={solanaAddress} />
            {evmAddress && <AddressRow label="EVM" address={evmAddress} />}
          </View>

          {/* Policy */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Spending Policy</Text>
              <Text
                style={[styles.badge, { backgroundColor: policy.paused ? '#EF444422' : '#22C55E22' }]}
                onPress={() => (policy.paused ? resume() : pause())}
              >
                <Text style={{ color: policy.paused ? '#EF4444' : '#22C55E' }}>
                  {policy.paused ? 'Paused' : 'Active'}
                </Text>
              </Text>
            </View>

            <PolicyRow label="Daily limit" value={`$${policy.dailyLimitUsd}`} />
            <PolicyRow label="Per-tx limit" value={`$${policy.perTransactionLimitUsd ?? '—'}`} />
            <PolicyRow label="Today's spend" value={`$${todaySpendUsd.toFixed(2)}`} />
            <PolicyRow label="Remaining" value={`$${remainingDailyUsd.toFixed(2)}`} highlight />
            <PolicyRow
              label="Biometrics"
              value={policy.requireBiometrics ? 'Required' : 'Optional'}
            />
            <PolicyRow
              label="Auto-approve below"
              value={`$${policy.autoApproveBelow ?? 0}`}
            />
            <PolicyRow label="Allowed networks" value={policy.allowedChains.join(', ')} />
          </View>
        </>
      )}
    </View>
  );
}

function AddressRow({ label, address }: { label: string; address?: string }) {
  const [copied, setCopied] = useState(false);
  if (!address) return null;

  const handleCopy = () => {
    Clipboard.setString(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.mono} numberOfLines={1} ellipsizeMode="middle">
        {address}
      </Text>
      <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
        <Text style={[styles.copyText, copied && styles.copyTextDone]}>
          {copied ? 'Copied!' : 'Copy'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function PolicyRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight && styles.highlight]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 20,
  },
  section: {
    gap: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: '#888',
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  rowLabel: {
    color: '#888',
    fontSize: 14,
    flexShrink: 0,
  },
  rowValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'right',
    flex: 1,
  },
  highlight: {
    color: '#22C55E',
  },
  mono: {
    color: '#FFFFFF',
    fontFamily: 'monospace',
    fontSize: 12,
    flex: 1,
    textAlign: 'right',
  },
  copyButton: {
    backgroundColor: '#2A2A3E',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexShrink: 0,
  },
  copyText: {
    color: '#A78BFA',
    fontSize: 12,
    fontWeight: '600',
  },
  copyTextDone: {
    color: '#22C55E',
  },
  balanceCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 6,
  },
  balanceLabel: {
    color: '#888',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  refreshText: {
    color: '#7C3AED',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
});
