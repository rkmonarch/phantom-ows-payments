import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { usePolicy, TransactionHistory, usePhantomOwsWallet } from 'phantom-ows-payments';

export function SettingsScreen() {
  const { policy, todaySpendUsd, remainingDailyUsd, pause, resume } = usePolicy();
  const { isConnected, disconnect } = usePhantomOwsWallet();
  const [activeSection, setActiveSection] = useState<'policy' | 'history' | null>(null);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
        <Text style={styles.headerSubtitle}>Manage your wallet & payments</Text>
      </View>

      {/* Spending Policy */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Spending Policy</Text>

        {/* Status toggle */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardRowLeft}>
              <Text style={styles.cardRowTitle}>Payments</Text>
              <Text style={styles.cardRowSub}>
                {policy.paused ? 'All payments are paused' : 'Payments are active'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.toggle, policy.paused ? styles.toggleOff : styles.toggleOn]}
              onPress={() => {
                if (policy.paused) {
                  resume();
                } else {
                  Alert.alert('Pause payments?', 'All x402 payments will be blocked.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Pause', style: 'destructive', onPress: pause },
                  ]);
                }
              }}
            >
              <Text style={styles.toggleText}>{policy.paused ? 'Paused' : 'Active'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Limits */}
        <View style={styles.card}>
          <PolicyRow label="Daily limit" value={`$${policy.dailyLimitUsd}`} />
          <View style={styles.divider} />
          <PolicyRow label="Per-transaction limit" value={`$${policy.perTransactionLimitUsd ?? '—'}`} />
          <View style={styles.divider} />
          <PolicyRow label="Auto-approve below" value={`$${policy.autoApproveBelow ?? 0}`} />
          <View style={styles.divider} />
          <PolicyRow
            label="Biometrics"
            value={policy.requireBiometrics ? 'Required' : 'Optional'}
          />
          <View style={styles.divider} />
          <PolicyRow label="Allowed networks" value={policy.allowedChains.join(', ')} />
        </View>

        {/* Spend tracker */}
        <View style={styles.spendCard}>
          <View style={styles.spendRow}>
            <View style={styles.spendItem}>
              <Text style={styles.spendValue}>${todaySpendUsd.toFixed(2)}</Text>
              <Text style={styles.spendLabel}>Spent today</Text>
            </View>
            <View style={styles.spendDivider} />
            <View style={styles.spendItem}>
              <Text style={[styles.spendValue, styles.spendRemaining]}>
                ${remainingDailyUsd.toFixed(2)}
              </Text>
              <Text style={styles.spendLabel}>Remaining</Text>
            </View>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(100, (todaySpendUsd / policy.dailyLimitUsd) * 100)}%` as `${number}%`,
                },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Transaction History */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Transaction History</Text>
        <View style={styles.historyCard}>
          <TransactionHistory
            emptyMessage="No transactions yet — pay for an article in the Blog tab!"
          />
        </View>
      </View>

      {/* Logout */}
      {isConnected && (
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() =>
            Alert.alert('Disconnect wallet?', 'You will need to reconnect to make payments.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Disconnect', style: 'destructive', onPress: disconnect },
            ])
          }
        >
          <Text style={styles.logoutText}>Disconnect Wallet</Text>
        </TouchableOpacity>
      )}

      {/* App info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoText}>phantom-ows-payments</Text>
        <Text style={styles.infoSub}>Open Wallet Standard · x402 Protocol</Text>
      </View>
    </View>
  );
}

function PolicyRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.policyRow}>
      <Text style={styles.policyLabel}>{label}</Text>
      <Text style={styles.policyValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 20,
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
  section: {
    gap: 10,
  },
  sectionLabel: {
    color: '#7C6FAF',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 4,
    shadowColor: '#1E1B4B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3F0FF',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  cardRowLeft: {
    gap: 2,
    flex: 1,
  },
  cardRowTitle: {
    color: '#1E1B4B',
    fontSize: 15,
    fontWeight: '600',
  },
  cardRowSub: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  toggle: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  toggleOn: {
    backgroundColor: '#D1FAE5',
  },
  toggleOff: {
    backgroundColor: '#FEE2E2',
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E1B4B',
  },
  policyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
  },
  policyLabel: {
    color: '#6B7280',
    fontSize: 14,
  },
  policyValue: {
    color: '#1E1B4B',
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F0FF',
  },
  spendCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: '#1E1B4B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3F0FF',
  },
  spendRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spendItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  spendDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#EDE9FE',
  },
  spendValue: {
    color: '#1E1B4B',
    fontSize: 22,
    fontWeight: '700',
  },
  spendRemaining: {
    color: '#059669',
  },
  spendLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '500',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#EDE9FE',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#7C3AED',
    borderRadius: 2,
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#1E1B4B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3F0FF',
  },
  logoutButton: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  logoutText: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '700',
  },
  infoCard: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: 8,
  },
  infoText: {
    color: '#C4B5FD',
    fontSize: 12,
    fontWeight: '600',
  },
  infoSub: {
    color: '#DDD6FE',
    fontSize: 11,
  },
});
