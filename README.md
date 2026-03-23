# 🛰️ EmpireYourTvSat VIP Platform

Plateforme de gestion d'accès streaming VIP avec paiement Stripe automatisé, génération d'accès test 24h via API fournisseur, QR code, lien M3U et interface de diagnostic.

---

## 📦 Stack technique

- **Node.js / Express** (backend)
- **Stripe** (paiement sécurisé – mode test & production)
- **Axios** (appels API fournisseur NEXON)
- **QRCode** (génération QR code backend)
- **HTML/CSS/JS vanilla** (frontend)

---

## 🚀 Installation rapide

```bash
# 1. Cloner le repo
git clone https://github.com/Medsaker2010/TounesEshop.app.git
cd TounesEshop.app

# 2. Installer les dépendances
npm install

# 3. Créer le fichier .env à partir du template
cp .env.example .env
# → Éditez .env avec vos vraies clés

# 4. Démarrer le serveur
npm start
# → http://localhost:4242
```

---

## ⚙️ Variables d'environnement

Copiez `.env.example` en `.env` et remplissez :

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Clé secrète Stripe (sk_test_... ou sk_live_...) |
| `STRIPE_PUBLISHABLE_KEY` | Clé publique Stripe (pk_test_... ou pk_live_...) |
| `STRIPE_WEBHOOK_SECRET` | Signature webhook Stripe (whsec_...) |
| `PORT` | Port du serveur (défaut : 4242) |
| `BASE_URL` | URL publique du serveur (ex: https://votre-domaine.com) |
| `ADMIN_EMAIL` | Email admin avec bypass illimité |
| `API_KEY_STRONG8K` | Clé API serveur STRONG 8K |
| `API_KEY_NEO4K` | Clé API serveur NEO 4K PRO |
| `API_KEY_NEXON4K` | Clé API serveur NEXON 4K |
| `API_KEY_FUEGOTV` | Clé API serveur FUEGO TV |
| `API_KEY_EAGLE4K` | Clé API serveur EAGLE 4K |
| `API_KEY_DINOVIP` | Clé API serveur DINO VIP |

> **⚠️ Le fichier `.env` ne doit JAMAIS être commité dans git.**

---

## 📡 Structure des fichiers

```
.
├── server.js           # Serveur Express principal
├── package.json        # Dépendances Node.js
├── .env.example        # Template variables d'environnement
├── .gitignore          # Exclut .env et node_modules
├── README.md           # Ce fichier
└── public/
    ├── index.html      # Landing page animée
    ├── success.html    # Page succès (QR code, M3U, identifiants)
    ├── cancel.html     # Page annulation paiement
    └── assets/         # Visuels (logos, images)
```

---

## 🔌 API Endpoints

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/config` | Retourne la clé publique Stripe |
| POST | `/api/create-checkout-session` | Crée une session Stripe Checkout |
| POST | `/webhook` | Webhook Stripe (signature vérifiée) |
| GET | `/api/session-access?session_id=...` | Récupère l'accès généré après paiement |
| POST | `/api/admin/access` | Génère un accès sans paiement (admin uniquement) |
| GET | `/api/diagnostic` | Ping et status de tous les serveurs |
| GET | `/api/arsenal` | Liste des serveurs disponibles |

---

## 💳 Flux de paiement

1. L'utilisateur entre son email et choisit un serveur sur la landing page
2. Le backend crée une session Stripe Checkout
3. Stripe redirige vers la page de paiement sécurisée
4. Après paiement, Stripe envoie un webhook POST `/webhook`
5. Le backend appelle l'API fournisseur et génère l'accès test 24h
6. L'utilisateur est redirigé vers `/success?session_id=...`
7. La page success affiche QR code, identifiants et lien M3U

---

## 🔒 Sécurité

- Toutes les clés API sont **exclusivement côté backend** (variables d'environnement)
- Le webhook Stripe est vérifié par signature (`STRIPE_WEBHOOK_SECRET`)
- Le fichier `.env` est ignoré par git (`.gitignore`)
- Le bypass admin est vérifié **côté serveur** uniquement

---

## 🧑‍💼 Bypass Admin

L'email configuré dans `ADMIN_EMAIL` bénéficie d'un accès illimité sans paiement.  
Il suffit d'entrer cet email sur la page d'accueil pour obtenir un accès immédiat.

---

## 📊 Diagnostic & Arsenal

- **GET /api/arsenal** : liste les serveurs disponibles (sans clés API)
- **GET /api/diagnostic** : effectue un ping HEAD sur chaque serveur et indique :
  - `OPTIMAL` (< 200ms)
  - `STABLE` (< 600ms)
  - `LENT` (> 600ms)
  - `OFFLINE` (timeout)

---

## 🛰️ API Fournisseur

Structure de l'appel API fournisseur (NEXON API v2) :

```
GET http://api-connect.icu/api/dev_api.php
  ?action=user
  &type=create
  &package_id=[ID]
  &api_key=[CLE_SERVEUR]
```

| Package ID | Durée |
|---|---|
| `1` | Test 24h |
| `10` | 1 mois |
| `15` | 3 mois |
| `20` | 6 mois |
| `30` | 12 mois |

---

## 🛠️ Configuration Stripe Webhook (local)

Pour tester en local avec Stripe CLI :

```bash
stripe listen --forward-to localhost:4242/webhook
```

Copiez le `whsec_...` affiché dans votre `.env` comme `STRIPE_WEBHOOK_SECRET`.

---

## 📬 Contact

Propriétaire : **H.A. ROUIS** – `H.a.rouis17@gmail.com`
