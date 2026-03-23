'use strict';

require('dotenv').config();

const express = require('express');
const axios = require('axios');
const QRCode = require('qrcode');
const path = require('path');

// ──────────────────────────────────────────────────────────────
// Stripe initialisation (clé secrète uniquement en backend)
// ──────────────────────────────────────────────────────────────
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 4242;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();

// ──────────────────────────────────────────────────────────────
// Configuration des serveurs fournisseurs
// ──────────────────────────────────────────────────────────────
const SERVERS = {
  STRONG8K: {
    label: 'STRONG 8K / AMIGO 8K',
    host: 'my8k.me',
    apiKey: process.env.API_KEY_STRONG8K,
    m3uPort: 8080,
    color: '#FFD700',
  },
  NEO4K: {
    label: 'NEO 4K PRO',
    host: 'neo4kpro.me',
    apiKey: process.env.API_KEY_NEO4K,
    m3uPort: 8080,
    color: '#00BFFF',
  },
  NEXON4K: {
    label: 'NEXON 4K',
    host: 'api-connect.icu',
    apiKey: process.env.API_KEY_NEXON4K,
    m3uPort: 8080,
    color: '#C0C0C0',
  },
  FUEGOTV: {
    label: 'FUEGO TV',
    host: 'fuego-panel.net',
    apiKey: process.env.API_KEY_FUEGOTV,
    m3uPort: 8080,
    color: '#FF4500',
  },
  EAGLE4K: {
    label: 'EAGLE 4K',
    host: 'eagle-vod.me',
    apiKey: process.env.API_KEY_EAGLE4K,
    m3uPort: 8080,
    color: '#9370DB',
  },
  DINOVIP: {
    label: 'DINO VIP',
    host: 'tvpluspanel.net',
    apiKey: process.env.API_KEY_DINOVIP,
    m3uPort: 8080,
    color: '#32CD32',
  },
};

// Package IDs
const PACKAGE_IDS = {
  TEST_24H: '1',
  SUB_1M: '10',
  SUB_3M: '15',
  SUB_6M: '20',
  SUB_12M: '30',
};

// ──────────────────────────────────────────────────────────────
// Stockage en mémoire (remplacer par une BDD en production)
// ──────────────────────────────────────────────────────────────
const sessions = {}; // stripe session_id → access info

// ──────────────────────────────────────────────────────────────
// Middleware – le webhook Stripe doit recevoir le raw body
// ──────────────────────────────────────────────────────────────
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

/**
 * Génère un identifiant aléatoire alphanumérique
 */
function randomId(len = 8) {
  return Math.random().toString(36).substring(2, 2 + len).toUpperCase();
}

/**
 * Appelle l'API fournisseur NEXON pour créer une ligne
 * @param {string} serverKey  Clé de SERVERS (ex: 'STRONG8K')
 * @param {string} packageId  ID du package (ex: '1' pour test 24h)
 */
async function createProviderLine(serverKey, packageId) {
  const server = SERVERS[serverKey];
  if (!server) throw new Error(`Serveur inconnu : ${serverKey}`);

  const apiUrl = `http://api-connect.icu/api/dev_api.php`;
  const params = {
    action: 'user',
    type: 'create',
    package_id: packageId,
    api_key: server.apiKey,
  };

  const response = await axios.get(apiUrl, { params, timeout: 15000 });
  const data = response.data;

  // Robustesse : certains panels renvoient du JSON, d'autres text/plain
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;

  if (!parsed || parsed.status === 'error') {
    throw new Error(parsed?.msg || 'Réponse API invalide');
  }

  const username = parsed.username || parsed.user || randomId();
  const password = parsed.password || parsed.pass || randomId();
  const m3uUrl = `http://${server.host}:${server.m3uPort}/get.php?user=${encodeURIComponent(username)}&pass=${encodeURIComponent(password)}&type=m3u_plus`;

  return { username, password, m3uUrl, serverKey, serverLabel: server.label };
}

/**
 * Génère un QR code en base64 pour une URL donnée
 */
async function generateQRCode(url) {
  return QRCode.toDataURL(url, {
    color: { dark: '#FFD700', light: '#111111' },
    width: 256,
  });
}

/**
 * Crée un accès (test 24h ou abonnement), génère le QR code et renvoie l'objet complet
 */
async function provisionAccess(serverKey, packageId) {
  const line = await createProviderLine(serverKey, packageId);
  const qrCode = await generateQRCode(line.m3uUrl);

  const isTest = packageId === PACKAGE_IDS.TEST_24H;
  const expireMs = isTest ? Date.now() + 24 * 60 * 60 * 1000 : null;
  const tz = process.env.TZ || 'Africa/Tunis';
  const expireLabel = expireMs
    ? new Date(expireMs).toLocaleString('fr-FR', { timeZone: tz }) + ` (${tz})`
    : 'Selon durée d\'abonnement';

  return {
    ...line,
    qrCode,
    m3uUrl: line.m3uUrl,
    expireMs,
    expireLabel,
    packageId,
    createdAt: new Date().toISOString(),
  };
}

// ──────────────────────────────────────────────────────────────
// API : Config publique (clé Stripe publique uniquement)
// ──────────────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

// ──────────────────────────────────────────────────────────────
// API : Création session Stripe Checkout
// ──────────────────────────────────────────────────────────────
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { email, server = 'STRONG8K' } = req.body || {};

    // Bypass admin : pas de paiement requis
    if (email && email.toLowerCase() === ADMIN_EMAIL) {
      const access = await provisionAccess(server, PACKAGE_IDS.TEST_24H);
      return res.json({ adminBypass: true, access });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email || undefined,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Accès VIP EmpireYourTvSat – Test 24h inclus',
              description: 'Abonnement annuel 5,55 € – Accès test 24h offert immédiatement',
              images: [],
            },
            unit_amount: 555,
            recurring: { interval: 'year' },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      metadata: { server },
      success_url: `${BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/cancel`,
    });

    res.json({ sessionId: session.id });
  } catch (err) {
    console.error('[create-checkout-session]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// API : Webhook Stripe (signature vérifiée)
// ──────────────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[webhook] Signature invalide:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const serverKey = session.metadata?.server || 'STRONG8K';

    try {
      const access = await provisionAccess(serverKey, PACKAGE_IDS.TEST_24H);
      // Stocker pour la page success
      sessions[session.id] = {
        email: session.customer_details?.email || '',
        ...access,
      };
      console.log(`[webhook] Accès créé pour session ${session.id} | user: ${access.username}`);
    } catch (err) {
      console.error(`[webhook] Erreur création accès pour session ${session.id}:`, err.message);
      // Stocker l'erreur pour informer l'utilisateur
      sessions[session.id] = { error: err.message };
    }
  }

  res.status(200).end();
});

// ──────────────────────────────────────────────────────────────
// API : Récupérer les infos d'accès après paiement
// ──────────────────────────────────────────────────────────────
app.get('/api/session-access', async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id manquant' });

  // Attente jusqu'à 10s si le webhook n'a pas encore été reçu
  let waited = 0;
  while (!sessions[session_id] && waited < 10000) {
    await new Promise((r) => setTimeout(r, 500));
    waited += 500;
  }

  if (!sessions[session_id]) {
    return res.status(404).json({ error: 'Session introuvable ou en cours de traitement' });
  }

  const data = sessions[session_id];
  if (data.error) return res.status(500).json({ error: data.error });

  // Ne jamais renvoyer la clé API au front
  const { qrCode, m3uUrl, username, password, expireLabel, serverLabel, createdAt, email } = data;
  res.json({ qrCode, m3uUrl, username, password, expireLabel, serverLabel, createdAt, email });
});

// ──────────────────────────────────────────────────────────────
// API : Admin bypass – génération accès sans paiement
// ──────────────────────────────────────────────────────────────
app.post('/api/admin/access', async (req, res) => {
  const { email, server = 'STRONG8K', packageId = PACKAGE_IDS.TEST_24H } = req.body || {};

  if (!email || email.toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Accès refusé' });
  }

  try {
    const access = await provisionAccess(server, packageId);
    const { qrCode, m3uUrl, username, password, expireLabel, serverLabel } = access;
    res.json({ status: 'PAID_MEMBER', accessLevel: 'UNLIMITED', qrCode, m3uUrl, username, password, expireLabel, serverLabel });
  } catch (err) {
    console.error('[admin/access]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// API : Diagnostic – ping et status des serveurs
// ──────────────────────────────────────────────────────────────
app.get('/api/diagnostic', async (req, res) => {
  const results = await Promise.all(
    Object.entries(SERVERS).map(async ([key, srv]) => {
      const start = Date.now();
      let status = 'OFFLINE';
      let latency = null;
    // Diagnostic : essayer HTTPS d'abord, puis HTTP
    const pingUrls = [`https://${srv.host}`, `http://${srv.host}`];
    for (const url of pingUrls) {
      try {
        await axios.head(url, { timeout: 5000 });
        latency = Date.now() - start;
        status = latency < 200 ? 'OPTIMAL' : latency < 600 ? 'STABLE' : 'LENT';
        break;
      } catch {
        latency = Date.now() - start;
        if (latency < 3000) status = 'STABLE'; // Peut bloquer HEAD mais être actif
      }
    }
      return { key, label: srv.label, host: srv.host, status, latency, color: srv.color };
    })
  );
  res.json({ servers: results, checkedAt: new Date().toISOString() });
});

// ──────────────────────────────────────────────────────────────
// API : Arsenal membre – infos serveurs (sans clés API)
// ──────────────────────────────────────────────────────────────
app.get('/api/arsenal', (req, res) => {
  const arsenal = Object.entries(SERVERS).map(([key, srv]) => ({
    key,
    label: srv.label,
    host: srv.host,
    color: srv.color,
  }));
  res.json({ servers: arsenal });
});

// ──────────────────────────────────────────────────────────────
// Démarrage
// ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 EmpireYourTvSat VIP – Serveur démarré sur ${BASE_URL}`);
  console.log(`   Mode Stripe : ${process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? '🟢 PRODUCTION' : '🟡 TEST'}`);
  console.log(`   Admin bypass : ${ADMIN_EMAIL || '(non configuré)'}\n`);
});
