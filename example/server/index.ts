/**
 * phantom-ows-payments — Blog Paywall Server
 *
 * Fetches articles from @rkmonarch's Medium RSS feed and gates full
 * content behind x402 payments (native SOL on devnet).
 *
 * Routes:
 *   GET /api/articles       — free article list (title, summary, metadata)
 *   GET /api/articles/:id   — full content, requires x402 SOL payment
 *
 * Run: npx ts-node index.ts
 */

import express from 'express';
import cors from 'cors';
import Parser from 'rss-parser';
import { Connection, PublicKey } from '@solana/web3.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3001;
// Treasury wallet — receives payments on mainnet
const TREASURY_WALLET = process.env.TREASURY_WALLET ?? '3YKGasCtfeMHNR5CrFB4Y5sL6b5ukvzSoTpcUGpFJs36';
const ARTICLE_PRICE_LAMPORTS = 100_000; // 0.0001 SOL
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const RSS_URL = 'https://medium.com/feed/@rkmonarch';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface RssItem {
  title?: string;
  pubDate?: string;
  link?: string;
  guid?: string;
  categories?: string[];
  contentEncoded?: string;
  thumbnail?: { $?: { url?: string } } | string;
}

// ─── RSS Cache ────────────────────────────────────────────────────────────────

const rssParser = new Parser<Record<string, unknown>, RssItem>({
  customFields: {
    item: [
      ['content:encoded', 'contentEncoded'],
      ['media:thumbnail', 'thumbnail', { keepArray: false }],
    ],
  },
});

let articlesCache: ArticleFull[] = [];
let cacheExpiry = 0;

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

function getThumbnail(item: RssItem): string | undefined {
  if (!item.thumbnail) return undefined;
  if (typeof item.thumbnail === 'string') return item.thumbnail;
  return item.thumbnail?.$?.url;
}

async function fetchArticles(): Promise<ArticleFull[]> {
  if (articlesCache.length > 0 && Date.now() < cacheExpiry) {
    return articlesCache;
  }

  console.log('[rss] Fetching', RSS_URL);
  const feed = await rssParser.parseURL(RSS_URL);

  articlesCache = (feed.items ?? []).map((item, idx) => {
    const rawContent = item.contentEncoded ?? '';
    const plainText = stripHtml(rawContent);
    const title = item.title ?? `Article ${idx + 1}`;

    return {
      id: slugify(item.guid ?? title) || String(idx),
      title,
      pubDate: item.pubDate ?? '',
      categories: item.categories ?? [],
      thumbnail: getThumbnail(item),
      summary: plainText.slice(0, 220) + (plainText.length > 220 ? '…' : ''),
      link: item.link ?? '',
      content: rawContent,
    };
  });

  cacheExpiry = Date.now() + CACHE_TTL_MS;
  console.log(`[rss] Cached ${articlesCache.length} articles`);
  return articlesCache;
}

// ─── x402 Helpers ─────────────────────────────────────────────────────────────

function buildChallenge(articleId: string, resourcePath: string): object {
  return {
    x402Version: 2,
    resource: {
      url: `http://localhost:${PORT}${resourcePath}`,
      description: 'Full article content from @rkmonarch',
      mimeType: 'application/json',
    },
    accepts: [
      {
        scheme: 'exact',
        network: 'solana:devnet',
        amount: String(ARTICLE_PRICE_LAMPORTS),
        asset: 'SOL',
        payTo: TREASURY_WALLET,
        maxTimeoutSeconds: 120,
        memo: `article:${articleId}`,
        // No extra.transaction — client builds the tx directly
      },
    ],
    extensions: {},
  };
}

interface VerifyResult {
  ok: boolean;
  txHash?: string;
  reason?: string;
}

async function verifyPayment(headerValue: string): Promise<VerifyResult> {
  let parsed: {
    payload?: string;
    txHash?: string;
    resource?: { payTo?: string; amount?: string };
    payTo?: string;
    amount?: string;
  };

  try {
    const jsonStr = Buffer.from(headerValue, 'base64').toString('utf8');
    parsed = JSON.parse(jsonStr);
  } catch {
    return { ok: false, reason: 'Invalid PAYMENT-SIGNATURE encoding' };
  }

  // Support both { payload: txHash, resource: { payTo, amount } }
  // and flat { txHash, payTo, amount } shapes
  const txHash = parsed.payload ?? parsed.txHash;
  const payTo = parsed.resource?.payTo ?? parsed.payTo;
  const amount = parsed.resource?.amount ?? parsed.amount;

  if (!txHash) return { ok: false, reason: 'Missing transaction signature' };

  // Sanity-check destination and amount before hitting the RPC
  if (payTo && payTo !== TREASURY_WALLET) {
    return { ok: false, reason: `Wrong destination: expected ${TREASURY_WALLET}, got ${payTo}` };
  }
  if (amount && parseInt(amount, 10) < ARTICLE_PRICE_LAMPORTS) {
    return { ok: false, reason: `Insufficient payment: need ${ARTICLE_PRICE_LAMPORTS} lamports` };
  }

  // Verify on-chain
  try {
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const tx = await connection.getTransaction(txHash, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { ok: false, reason: 'Transaction not found on devnet — it may still be confirming' };
    }

    if (tx.meta?.err !== null) {
      return { ok: false, reason: 'Transaction failed on-chain' };
    }

    // Verify the treasury wallet received the correct amount
    const accountKeys = tx.transaction.message.staticAccountKeys ??
      (tx.transaction.message as unknown as { accountKeys: PublicKey[] }).accountKeys ?? [];

    const destIndex = accountKeys.findIndex(
      (k: PublicKey) => k.toBase58() === TREASURY_WALLET,
    );

    if (destIndex === -1) {
      return { ok: false, reason: 'Treasury wallet not found in transaction accounts' };
    }

    const preBalance = tx.meta.preBalances[destIndex] ?? 0;
    const postBalance = tx.meta.postBalances[destIndex] ?? 0;
    const received = postBalance - preBalance;

    if (received < ARTICLE_PRICE_LAMPORTS) {
      return {
        ok: false,
        reason: `Insufficient payment: received ${received} lamports, need ${ARTICLE_PRICE_LAMPORTS}`,
      };
    }

    console.log(`[verify] ✓ tx ${txHash.slice(0, 12)}... received ${received} lamports`);
    return { ok: true, txHash };
  } catch (err) {
    console.error('[verify] RPC error:', err);
    return { ok: false, reason: 'Solana RPC error — try again' };
  }
}

// ─── Express App ──────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// Free: article list
app.get('/api/articles', async (_req, res) => {
  try {
    const articles = await fetchArticles();
    const summaries: ArticleSummary[] = articles.map(
      ({ id, title, pubDate, categories, thumbnail, summary, link }) => ({
        id, title, pubDate, categories, thumbnail, summary, link,
      }),
    );
    res.json({ articles: summaries });
  } catch (err) {
    console.error('[articles]', err);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// Gated: full article content
app.get('/api/articles/:id', async (req, res) => {
  const paymentSig = req.headers['payment-signature'] as string | undefined;

  // No payment header — issue 402 challenge
  if (!paymentSig) {
    const challenge = buildChallenge(req.params.id, req.path);
    res
      .status(402)
      .set('PAYMENT-REQUIRED', Buffer.from(JSON.stringify(challenge)).toString('base64'))
      .json({
        error: 'Payment required',
        price: `${ARTICLE_PRICE_LAMPORTS} lamports (0.0001 SOL on mainnet)`,
      });
    return;
  }

  // Verify payment on-chain
  const result = await verifyPayment(paymentSig);
  if (!result.ok) {
    res.status(402).json({ error: result.reason });
    return;
  }

  // Serve full article
  const articles = await fetchArticles();
  const article = articles.find((a) => a.id === req.params.id);
  if (!article) {
    res.status(404).json({ error: 'Article not found' });
    return;
  }

  res
    .set(
      'PAYMENT-RESPONSE',
      Buffer.from(
        JSON.stringify({ success: true, txHash: result.txHash, network: 'solana:devnet' }),
      ).toString('base64'),
    )
    .json(article);
});

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`\n👻 phantom-ows blog server running at http://localhost:${PORT}`);
  console.log(`   Treasury: ${TREASURY_WALLET}`);
  console.log(`   Price:    ${ARTICLE_PRICE_LAMPORTS / 1e9} SOL per article`);
  console.log(`   Network:  devnet\n`);
  // Pre-warm the RSS cache
  fetchArticles().catch(console.error);
});
