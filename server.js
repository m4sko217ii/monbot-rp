const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || 'TON_PAYPAL_CLIENT_ID';
const PAYPAL_SECRET    = process.env.PAYPAL_SECRET    || 'TON_PAYPAL_SECRET';
const PAYPAL_BASE      = 'https://api-m.sandbox.paypal.com'; // Remplace par https://api-m.paypal.com en prod
const ADMIN_KEY        = process.env.ADMIN_KEY        || 'mon_super_secret_admin';
const PORT             = process.env.PORT             || 3000;

const PRICE_PER_MONTH  = 10.00; // €

// ─── BASE DE DONNÉES ──────────────────────────────────────────────────────────
const SUB_FILE = './subscriptions.json';

function loadSubs() {
  if (!fs.existsSync(SUB_FILE)) fs.writeFileSync(SUB_FILE, JSON.stringify({ subscriptions: [], revenue: 0 }));
  return JSON.parse(fs.readFileSync(SUB_FILE));
}
function saveSubs(data) {
  fs.writeFileSync(SUB_FILE, JSON.stringify(data, null, 2));
}

// ─── PAYPAL TOKEN ─────────────────────────────────────────────────────────────
async function getPayPalToken() {
  const res = await axios.post(`${PAYPAL_BASE}/v1/oauth2/token`,
    'grant_type=client_credentials',
    {
      auth: { username: PAYPAL_CLIENT_ID, password: PAYPAL_SECRET },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }
  );
  return res.data.access_token;
}

// ─── ROUTES API ───────────────────────────────────────────────────────────────

// Créer une commande PayPal
app.post('/api/create-order', async (req, res) => {
  const { discordId, discordName, months } = req.body;
  if (!discordId || !months || months < 1 || months > 12) {
    return res.status(400).json({ error: 'Paramètres invalides' });
  }

  try {
    const token = await getPayPalToken();
    const total = (PRICE_PER_MONTH * months).toFixed(2);

    const order = await axios.post(`${PAYPAL_BASE}/v2/checkout/orders`, {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: 'EUR', value: total },
        description: `Abonnement Bot GTA RP — ${months} mois (${discordName})`,
        custom_id: JSON.stringify({ discordId, discordName, months })
      }],
      application_context: {
        return_url: `${process.env.SITE_URL || 'http://localhost:3000'}/success`,
        cancel_url: `${process.env.SITE_URL || 'http://localhost:3000'}/cancel`
      }
    }, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });

    res.json({ orderId: order.data.id, approvalUrl: order.data.links.find(l => l.rel === 'approve').href });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Erreur PayPal' });
  }
});

// Capturer le paiement après approbation
app.post('/api/capture-order', async (req, res) => {
  const { orderId } = req.body;
  try {
    const token = await getPayPalToken();
    const capture = await axios.post(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {}, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });

    const unit = capture.data.purchase_units[0];
    const { discordId, discordName, months } = JSON.parse(unit.custom_id);
    const paid = parseFloat(unit.payments.captures[0].amount.value);

    const db = loadSubs();
    const existing = db.subscriptions.find(s => s.discordId === discordId);
    const now = new Date();

    if (existing) {
      const base = new Date(existing.expiresAt) > now ? new Date(existing.expiresAt) : now;
      base.setMonth(base.getMonth() + parseInt(months));
      existing.expiresAt = base.toISOString();
      existing.totalMonths = (existing.totalMonths || 0) + parseInt(months);
      existing.lastPayment = now.toISOString();
    } else {
      const exp = new Date(now);
      exp.setMonth(exp.getMonth() + parseInt(months));
      db.subscriptions.push({
        discordId,
        discordName,
        subscribedAt: now.toISOString(),
        expiresAt: exp.toISOString(),
        totalMonths: parseInt(months),
        lastPayment: now.toISOString(),
        active: true
      });
    }

    db.revenue = (db.revenue || 0) + paid;
    saveSubs(db);

    res.json({ success: true, discordId, months, expiresAt: existing?.expiresAt });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Erreur capture PayPal' });
  }
});

// Vérifier l'accès d'un utilisateur (appelé par le bot Discord)
app.get('/api/check/:discordId', (req, res) => {
  const db = loadSubs();
  const sub = db.subscriptions.find(s => s.discordId === req.params.discordId);
  if (!sub) return res.json({ access: false, reason: 'Aucun abonnement trouvé' });
  const now = new Date();
  const exp = new Date(sub.expiresAt);
  if (exp < now) return res.json({ access: false, reason: 'Abonnement expiré', expiredAt: sub.expiresAt });
  const daysLeft = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
  res.json({ access: true, daysLeft, expiresAt: sub.expiresAt, discordName: sub.discordName });
});

// Dashboard admin — stats
app.get('/api/admin/stats', (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(403).json({ error: 'Non autorisé' });
  const db = loadSubs();
  const now = new Date();
  const active = db.subscriptions.filter(s => new Date(s.expiresAt) > now);
  const expired = db.subscriptions.filter(s => new Date(s.expiresAt) <= now);
  res.json({
    totalSubscribers: db.subscriptions.length,
    activeSubscribers: active.length,
    expiredSubscribers: expired.length,
    totalRevenue: db.revenue || 0,
    subscriptions: db.subscriptions.map(s => ({
      ...s,
      active: new Date(s.expiresAt) > now,
      daysLeft: Math.max(0, Math.ceil((new Date(s.expiresAt) - now) / (1000 * 60 * 60 * 24)))
    }))
  });
});

// Admin — révoquer un abonnement
app.post('/api/admin/revoke', (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(403).json({ error: 'Non autorisé' });
  const { discordId } = req.body;
  const db = loadSubs();
  const idx = db.subscriptions.findIndex(s => s.discordId === discordId);
  if (idx === -1) return res.status(404).json({ error: 'Abonné introuvable' });
  db.subscriptions[idx].expiresAt = new Date(0).toISOString();
  saveSubs(db);
  res.json({ success: true });
});

// Admin — ajouter manuellement un abonnement
app.post('/api/admin/add', (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(403).json({ error: 'Non autorisé' });
  const { discordId, discordName, months } = req.body;
  const db = loadSubs();
  const now = new Date();
  const existing = db.subscriptions.find(s => s.discordId === discordId);
  if (existing) {
    const base = new Date(existing.expiresAt) > now ? new Date(existing.expiresAt) : now;
    base.setMonth(base.getMonth() + parseInt(months));
    existing.expiresAt = base.toISOString();
    existing.totalMonths = (existing.totalMonths || 0) + parseInt(months);
  } else {
    const exp = new Date(now);
    exp.setMonth(exp.getMonth() + parseInt(months));
    db.subscriptions.push({ discordId, discordName, subscribedAt: now.toISOString(), expiresAt: exp.toISOString(), totalMonths: parseInt(months), lastPayment: now.toISOString() });
  }
  saveSubs(db);
  res.json({ success: true });
});

// Pages
app.get('/success', (req, res) => res.sendFile(path.join(__dirname, 'public', 'success.html')));
app.get('/cancel',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'cancel.html')));
app.get('/admin',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*',        (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`✅ Serveur lancé sur http://localhost:${PORT}`));
