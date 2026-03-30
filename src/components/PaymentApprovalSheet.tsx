import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { X402PaymentAccept } from '../types';

export interface PaymentApprovalSheetProps {
  visible: boolean;
  accept: X402PaymentAccept | null;
  resourceUrl?: string;
  amountUsd?: number;
  onApprove: () => void;
  onReject: () => void;
}

/**
 * Bottom sheet that displays payment details and asks for user confirmation.
 * Works alongside biometric auth — call this before triggering the biometric
 * prompt so the user sees context for what they're approving.
 *
 * @example
 * <PaymentApprovalSheet
 *   visible={showSheet}
 *   accept={pendingChallenge}
 *   amountUsd={1.50}
 *   onApprove={handleApprove}
 *   onReject={handleReject}
 * />
 */
export function PaymentApprovalSheet({
  visible,
  accept,
  resourceUrl,
  amountUsd,
  onApprove,
  onReject,
}: PaymentApprovalSheetProps) {
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 150,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  if (!accept) return null;

  const network = accept.network.startsWith('solana') ? 'Solana' : 'Ethereum';
  const formattedAmount = formatTokenAmount(accept.amount, accept.asset);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onReject}>
      <Pressable style={styles.backdrop} onPress={onReject}>
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
        >
          <Pressable>
            {/* Handle */}
            <View style={styles.handle} />

            {/* Header */}
            <Text style={styles.title}>Confirm Payment</Text>
            <Text style={styles.subtitle}>Review the details below before approving</Text>

            {/* Amount */}
            <View style={styles.amountCard}>
              {amountUsd !== undefined ? (
                <>
                  <Text style={styles.amountUsd}>${amountUsd.toFixed(2)}</Text>
                  <Text style={styles.amountToken}>{formattedAmount}</Text>
                </>
              ) : (
                <Text style={styles.amountUsd}>{formattedAmount}</Text>
              )}
            </View>

            {/* Details */}
            <View style={styles.details}>
              <DetailRow label="Network" value={network} />
              <DetailRow
                label="To"
                value={truncateAddress(accept.payTo)}
                mono
              />
              {resourceUrl && (
                <DetailRow label="Resource" value={truncateDomain(resourceUrl)} />
              )}
              {accept.memo && <DetailRow label="Memo" value={accept.memo} />}
            </View>

            {/* Buttons */}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.rejectButton} onPress={onReject}>
                <Text style={styles.rejectText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.approveButton} onPress={onApprove}>
                <Text style={styles.approveText}>Approve</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.warning}>
              You will be asked to confirm with Face ID or your passcode
            </Text>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, mono && styles.mono]}>{value}</Text>
    </View>
  );
}

function truncateAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function truncateDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatTokenAmount(amount: string, asset: string): string {
  const shortAsset = asset.length > 8 ? `${asset.slice(0, 4)}...` : asset;
  // Assume 6 decimals for USDC-like tokens — real apps should pass decimals explicitly
  const formatted = (parseInt(amount, 10) / 1_000_000).toFixed(2);
  return `${formatted} (${shortAsset})`;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#444',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  amountCard: {
    backgroundColor: '#0D0D1A',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#7C3AED33',
  },
  amountUsd: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '700',
  },
  amountToken: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  details: {
    backgroundColor: '#0D0D1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    color: '#888',
    fontSize: 14,
  },
  detailValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    maxWidth: '60%',
    textAlign: 'right',
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  rejectButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#2A2A3E',
    alignItems: 'center',
  },
  rejectText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
  approveButton: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
  },
  approveText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  warning: {
    color: '#555',
    fontSize: 12,
    textAlign: 'center',
  },
});
