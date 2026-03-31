import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Clipboard,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ConnectButton, usePhantomOwsWallet } from 'phantom-ows-payments';

const SOLANA_RPC = process.env.EXPO_PUBLIC_RPC ?? 'https://api.mainnet-beta.solana.com';

export function HomeScreen() {
  const { isConnected, solanaAddress } = usePhantomOwsWallet();

  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [copied, setCopied] = useState(false);

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
      setSolBalance(result.value / 1e9);
    } catch {
      setSolBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }, [solanaAddress]);

  useEffect(() => {
    if (isConnected && solanaAddress) {
      fetchBalance();
    } else {
      setSolBalance(null);
    }
  }, [isConnected, solanaAddress, fetchBalance]);

  const handleCopy = () => {
    if (!solanaAddress) return;
    Clipboard.setString(solanaAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Wallet</Text>
        <Text style={styles.headerSubtitle}>Powered by Phantom · OWS</Text>
      </View>

      {/* Connect */}
      {!isConnected && (
        <View style={styles.connectCard}>
          <View style={styles.ghostIcon}>
            <Text style={styles.ghostEmoji}>👻</Text>
          </View>
          <Text style={styles.connectTitle}>Connect your wallet</Text>
          <Text style={styles.connectSubtitle}>
            Sign in with Google or Apple — no seed phrase needed
          </Text>
          <ConnectButton
            showBothProviders
            onConnected={(addr) => console.log('Connected:', addr)}
          />
        </View>
      )}

      {/* Balance card */}
      {isConnected && (
        <>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>SOL Balance</Text>
            {balanceLoading ? (
              <ActivityIndicator color="#7C3AED" style={{ marginVertical: 8 }} />
            ) : (
              <Text style={styles.balanceAmount}>
                {solBalance !== null ? solBalance.toFixed(4) : '—'}
                <Text style={styles.balanceUnit}> SOL</Text>
              </Text>
            )}
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={fetchBalance}
              disabled={balanceLoading}
            >
              <Text style={styles.refreshText}>↻  Refresh</Text>
            </TouchableOpacity>
          </View>

          {/* Address */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Solana Address</Text>
            <View style={styles.addressRow}>
              <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
                {solanaAddress}
              </Text>
              <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
                <Text style={[styles.copyText, copied && styles.copyTextDone]}>
                  {copied ? 'Copied!' : 'Copy'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* OWS badge */}
          <View style={styles.owsBadge}>
            <Text style={styles.owsBadgeText}>
              ✦  Open Wallet Standard — autonomous x402 payments
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  header: {
    gap: 2,
    paddingBottom: 4,
  },
  headerTitle: {
    color: '#1E1B4B',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    color: '#7C6FAF',
    fontSize: 13,
  },
  connectCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#EDE9FE',
  },
  ghostIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  ghostEmoji: {
    fontSize: 32,
  },
  connectTitle: {
    color: '#1E1B4B',
    fontSize: 18,
    fontWeight: '700',
  },
  connectSubtitle: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  balanceCard: {
    backgroundColor: '#7C3AED',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 6,
  },
  balanceLabel: {
    color: '#DDD6FE',
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '700',
    letterSpacing: -1,
    marginVertical: 4,
  },
  balanceUnit: {
    fontSize: 22,
    fontWeight: '500',
    color: '#C4B5FD',
  },
  refreshButton: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  refreshText: {
    color: '#EDE9FE',
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 8,
    shadowColor: '#1E1B4B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3F0FF',
  },
  cardLabel: {
    color: '#7C6FAF',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addressText: {
    color: '#1E1B4B',
    fontFamily: 'monospace',
    fontSize: 13,
    flex: 1,
  },
  copyButton: {
    backgroundColor: '#EDE9FE',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  copyText: {
    color: '#7C3AED',
    fontSize: 12,
    fontWeight: '700',
  },
  copyTextDone: {
    color: '#059669',
  },
  owsBadge: {
    backgroundColor: '#F5F3FF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#EDE9FE',
  },
  owsBadgeText: {
    color: '#7C3AED',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});
