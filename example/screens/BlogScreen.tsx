/**
 * BlogScreen — Medium article paywall demo
 *
 * Lists @rkmonarch's articles for free, then gates the full content behind
 * an x402 SOL payment (0.0001 SOL on mainnet). Payment is handled autonomously
 * via Phantom's HSM + OWS policy engine — the user just taps "Read Article".
 *
 * Requires the example server running at SERVER_URL below.
 * Start it with: cd example/server && npm install && npm run dev
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { usePayWithPhantomOws, usePhantomOwsWallet } from 'phantom-ows-payments';

// Update this to your machine's LAN IP when testing on a real device
// For simulator: localhost works fine
const SERVER_URL = 'http://localhost:3001';
const ARTICLE_PRICE_SOL = 0.0001;

interface ArticleSummary {
  id: string;
  title: string;
  pubDate: string;
  categories: string[];
  thumbnail?: string;
  summary: string;
  link: string;
}

interface ArticleFull extends ArticleSummary {
  content: string;
}

export function BlogScreen() {
  const { isConnected } = usePhantomOwsWallet();
  const { payAndFetch, isPaying } = usePayWithPhantomOws();

  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [openArticle, setOpenArticle] = useState<ArticleFull | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  // Load article list on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    fetch(`${SERVER_URL}/api/articles`)
      .then((r) => r.json())
      .then((data: { articles?: ArticleSummary[]; error?: string }) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setArticles(data.articles ?? []);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setFetchError(err.message ?? 'Failed to load articles');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleReadArticle = useCallback(
    async (article: ArticleSummary) => {
      if (!isConnected) {
        Alert.alert('Wallet required', 'Connect your wallet first (Wallet tab)');
        return;
      }

      setPayingId(article.id);
      try {
        const { response, payment } = await payAndFetch(
          `${SERVER_URL}/api/articles/${article.id}`,
          { amountUsd: ARTICLE_PRICE_SOL },
        );

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
          throw new Error(err.error ?? `HTTP ${response.status}`);
        }

        const full = await response.json() as ArticleFull;
        setOpenArticle(full);

        if (payment.txHash) {
          console.log('[blog] Paid via tx:', payment.txHash.slice(0, 12) + '...');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        Alert.alert('Payment failed', msg);
      } finally {
        setPayingId(null);
      }
    },
    [isConnected, payAndFetch],
  );

  // ── Article reader view ───────────────────────────────────────────────────────
  if (openArticle) {
    return (
      <View style={styles.readerContainer}>
        <TouchableOpacity style={styles.backButton} onPress={() => setOpenArticle(null)}>
          <Text style={styles.backButtonText}>← Back to articles</Text>
        </TouchableOpacity>

        <Text style={styles.readerTitle}>{openArticle.title}</Text>
        <Text style={styles.readerMeta}>{formatDate(openArticle.pubDate)}</Text>

        {openArticle.thumbnail ? (
          <Image
            source={{ uri: openArticle.thumbnail }}
            style={styles.readerThumbnail}
            resizeMode="cover"
          />
        ) : null}

        {/* Strip HTML tags for plain-text rendering */}
        <Text style={styles.readerBody}>
          {stripHtml(openArticle.content)}
        </Text>
      </View>
    );
  }

  // ── Article list view ─────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Blog</Text>
      <Text style={[styles.subtitle, { fontSize: 12, color: '#7C3AED', fontWeight: '600' }]}>@rkmonarch</Text>
      <Text style={styles.subtitle}>
        Full articles are gated behind x402 · 0.0001 SOL on devnet
      </Text>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color="#7C3AED" size="large" />
          <Text style={styles.loadingText}>Fetching articles…</Text>
        </View>
      )}

      {fetchError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{fetchError}</Text>
          <Text style={styles.errorHint}>
            Is the server running?{'\n'}
            cd example/server && npm run dev
          </Text>
        </View>
      )}

      {!loading && !fetchError && articles.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No articles found in the RSS feed.</Text>
        </View>
      )}

      {articles.map((article) => (
        <View key={article.id} style={styles.card}>
          {article.thumbnail ? (
            <Image
              source={{ uri: article.thumbnail }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
          ) : null}

          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {article.title}
            </Text>
            <Text style={styles.cardMeta}>{formatDate(article.pubDate)}</Text>

            {article.categories.length > 0 && (
              <View style={styles.tags}>
                {article.categories.slice(0, 3).map((cat) => (
                  <View key={cat} style={styles.tag}>
                    <Text style={styles.tagText}>{cat}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.summary} numberOfLines={3}>
              {article.summary}
            </Text>

            <TouchableOpacity
              style={[styles.readButton, (isPaying && payingId === article.id) && styles.readButtonBusy]}
              onPress={() => handleReadArticle(article)}
              disabled={isPaying && payingId === article.id}
            >
              {isPaying && payingId === article.id ? (
                <View style={styles.readButtonRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.readButtonText}>Paying 0.0001 SOL…</Text>
                </View>
              ) : (
                <Text style={styles.readButtonText}>Read · 0.0001 SOL</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatDate(raw: string): string {
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return raw;
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { gap: 16 },
  title: { color: '#1E1B4B', fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { color: '#7C6FAF', fontSize: 13, lineHeight: 18 },

  center: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  loadingText: { color: '#9CA3AF', fontSize: 14 },
  emptyText: { color: '#9CA3AF', fontSize: 15, textAlign: 'center' },

  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: { color: '#DC2626', fontSize: 14, fontWeight: '600' },
  errorHint: { color: '#DC2626', fontSize: 12, opacity: 0.7, fontFamily: 'monospace' },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#1E1B4B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3F0FF',
  },
  thumbnail: {
    width: '100%',
    height: 160,
  },
  cardBody: { padding: 16, gap: 8 },
  cardTitle: { color: '#1E1B4B', fontSize: 16, fontWeight: '700', lineHeight: 22 },
  cardMeta: { color: '#9CA3AF', fontSize: 12 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    backgroundColor: '#EDE9FE',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: { color: '#7C3AED', fontSize: 11, fontWeight: '600' },
  summary: { color: '#6B7280', fontSize: 13, lineHeight: 19 },

  readButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  readButtonBusy: { backgroundColor: '#6D28D9' },
  readButtonRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  readButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  // Reader
  readerContainer: { gap: 16 },
  backButton: { alignSelf: 'flex-start' },
  backButtonText: { color: '#7C3AED', fontSize: 15, fontWeight: '600' },
  readerTitle: { color: '#1E1B4B', fontSize: 20, fontWeight: '700', lineHeight: 28 },
  readerMeta: { color: '#9CA3AF', fontSize: 13 },
  readerThumbnail: { width: '100%', height: 200, borderRadius: 12 },
  readerBody: { color: '#374151', fontSize: 15, lineHeight: 26 },
});
