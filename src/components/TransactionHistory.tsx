import React from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTransactionHistory } from '../hooks/useTransactionHistory';
import type { PaymentRecord, PaymentStatus } from '../types';

export interface TransactionHistoryProps {
  filter?: PaymentStatus;
  maxItems?: number;
  onPressRecord?: (record: PaymentRecord) => void;
  style?: StyleProp<ViewStyle>;
  emptyMessage?: string;
}

/**
 * Renders a scrollable list of past payments from the OWS history store.
 *
 * @example
 * <TransactionHistory filter="success" maxItems={10} />
 */
export function TransactionHistory({
  filter,
  maxItems,
  onPressRecord,
  style,
  emptyMessage = 'No transactions yet',
}: TransactionHistoryProps) {
  const { history } = useTransactionHistory();

  let data = filter ? history.filter((r) => r.status === filter) : history;
  if (maxItems) data = data.slice(0, maxItems);

  return (
    <View style={[styles.container, style]}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TransactionRow record={item} onPress={onPressRecord} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{emptyMessage}</Text>
          </View>
        }
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

function TransactionRow({
  record,
  onPress,
}: {
  record: PaymentRecord;
  onPress?: (record: PaymentRecord) => void;
}) {
  const statusColor = STATUS_COLORS[record.status];
  const network = record.network.startsWith('solana') ? 'SOL' : record.network.startsWith('eip155') ? 'ETH' : record.network;
  const date = new Date(record.timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress?.(record)}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      {/* Status indicator */}
      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />

      {/* Main info */}
      <View style={styles.info}>
        <Text style={styles.destination} numberOfLines={1}>
          {record.resourceUrl
            ? truncateDomain(record.resourceUrl)
            : truncateAddress(record.destination)}
        </Text>
        <Text style={styles.date}>{date}</Text>
      </View>

      {/* Amount */}
      <View style={styles.amountCol}>
        {record.amountUsd !== undefined ? (
          <Text style={styles.amountUsd}>-${record.amountUsd.toFixed(2)}</Text>
        ) : null}
        <Text style={styles.network}>{network}</Text>
      </View>
    </TouchableOpacity>
  );
}

const STATUS_COLORS: Record<PaymentStatus, string> = {
  success: '#22C55E',
  failed: '#EF4444',
  pending: '#F59E0B',
};

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function truncateDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    overflow: 'hidden',
  },
  empty: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#555',
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  destination: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  date: {
    color: '#666',
    fontSize: 12,
  },
  amountCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  amountUsd: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  network: {
    color: '#666',
    fontSize: 11,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2A2A3E',
    marginHorizontal: 16,
  },
});
