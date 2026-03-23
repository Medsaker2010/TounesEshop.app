'use strict';

require('dotenv').config();
const express = require('express');
const path = require('path');
const axios = require('axios');
const Stripe = require('stripe');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

// ---------------------------------------------------------------------------
// In-memory session store (replace with a real database in production)
// Key: Stripe checkout session_id  →  Value: { code, expire, username, password, m3u, email }
// ---------------------------------------------------------------------------
const sessionStore = {};

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Stripe webhook  – must be registered BEFORE express.json() middleware
// ---------------------------------------------------------------------------
app.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET || 'whsec_placeholder'
      );
    } catch (err) {
      console.error('Webhook signature error:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.customer_details?.email || 'unknown';

      // Generate 24h test access (may be overwritten once provider API responds)
      const localCode = 'TEST-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const expire = new Date(Date.now() + 24 * 60 * 60 * 1000);

      sessionStore[session.id] = {
        email,
        code: localCode,
        expire: expire.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
      };

      console.log(`[Webhook] Payment confirmed for ${email} – session ${session.id}`);

      // Asynchronously call the provider API to provision a real test line
      provisionTestAccess(session.id, email).catch(err =>
        console.error('[Provider API] Async error:', err.message)
      );
    }

    res.status(200).end();
  }
);

// ---------------------------------------------------------------------------
// JSON middleware (after raw webhook)
// ---------------------------------------------------------------------------
app.use(express.json());

// ---------------------------------------------------------------------------
// POST /api/create-checkout-session
// ---------------------------------------------------------------------------
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const appUrl = process.env.APP_URL || 'http://localhost:4242';
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Accès VIP Empire YourTvSat – 1 an',
              description: 'Accès complet + bonus test 24h offert dès activation',
            },
            unit_amount: 555, // 5,55 € in centimes
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${appUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/cancel.html`,
    });
    res.json({ id: session.id, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
  } catch (err) {
    console.error('[Checkout] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/session-access?session_id=cs_xxx
// ---------------------------------------------------------------------------
app.get('/api/session-access', (req, res) => {
  const { session_id } = req.query;
  if (!session_id || !sessionStore[session_id]) {
    return res.status(404).json({ error: 'Session introuvable ou en cours de traitement.' });
  }
  const { code, expire, username, password, m3u } = sessionStore[session_id];
  res.json({ code, expire, username, password, m3u });
});

// ---------------------------------------------------------------------------
// Provider API integration
// Calls the reseller panel (Xtream-Codes compatible) to generate a real line.
// Replace PROVIDER_API_URL and PROVIDER_API_KEY with real values in .env
// ---------------------------------------------------------------------------
async function provisionTestAccess(stripeSessionId, email) {
  const apiUrl = process.env.PROVIDER_API_URL;
  const apiKey = process.env.PROVIDER_API_KEY;

  if (!apiUrl || apiUrl === 'https://your-provider-panel.com/api.php') {
    console.log('[Provider API] No real provider configured – using local test code.');
    return;
  }

  const username = 'vip' + Math.random().toString(36).substring(2, 8);
  const password = Math.random().toString(36).substring(2, 12);

  try {
    const { data } = await axios.get(apiUrl, {
      params: {
        action: 'create_line',
        type: 'test',
        days: 1,
        username,
        password,
        api_key: apiKey,
      },
      timeout: 15000,
    });

    if (data && (data.result === 'success' || data.status === 'ok' || data.username)) {
      const expire = new Date(Date.now() + 24 * 60 * 60 * 1000);
      sessionStore[stripeSessionId] = {
        ...sessionStore[stripeSessionId],
        code: `${username} / ${password}`,
        username: data.username || username,
        password: data.password || password,
        m3u: data.m3u_url || null,
        expire: expire.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
      };
      console.log(`[Provider API] Real test line created for ${email}: ${username}`);
    } else {
      console.warn('[Provider API] Unexpected response:', JSON.stringify(data));
    }
  } catch (err) {
    console.error('[Provider API] Request failed:', err.message);
    // Keep the locally-generated fallback code already stored
  }
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`Empire YourTvSat server running on port ${PORT}`));
