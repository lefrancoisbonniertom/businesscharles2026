# Charles Performance - Option 2 (API Stripe + Printful)

## 1) Installation

```bash
npm install
cp .env.example .env
```

Renseigne ensuite tes cles dans `.env`.

## 2) Variables d'environnement

- `PORT` : port local (ex: `3000`)
- `BASE_URL` : optionnel. URL publique du site (ex: `https://ton-domaine.com`)
- `STRIPE_SECRET_KEY` : cle secrete Stripe
- `STRIPE_WEBHOOK_SECRET` : secret du webhook Stripe
- `PRINTFUL_API_KEY` : token API Printful
- `PRINTFUL_STORE_ID` : ID du store Printful (recommande pour stores Shopify)
- `PRINTFUL_VARIANT_MAP` : mapping JSON entre tes produits et les variants Printful

Exemple de `PRINTFUL_VARIANT_MAP`:

```json
{
	"tshirt:noir:m": 4012,
	"tshirt:blanc:m": 4013,
	"jogging:m": 5120,
	"pull": 6200,
	"bouteille": "PF-BOUTEILLE-INOX"
}
```

Regles de resolution (dans l'ordre):

- `produit:couleur:taille`
- `produit:taille`
- `produit`

Tu peux mettre soit un `sync_variant_id` (nombre), soit un `sku` (texte).

Tu peux aussi generer automatiquement une base de mapping avec:

```bash
npm run printful:map
```

Le script utilise `PRINTFUL_STORE_ID` si renseigne, sinon il tente de trouver automatiquement le bon store.

## 3) Lancer le serveur

```bash
npm run dev
```

Le serveur sert aussi le frontend (`index.html`) directement.

Si ton frontend est heberge separement (site statique) et ton backend sur un autre domaine:

- Edite `api-config.js`
- Renseigne `window.SHOP_API_BASE_URL = "https://ton-backend.com"`
- Sur le backend, configure `FRONTEND_ORIGIN=https://ton-frontend.com`

## 4) Webhook Stripe

En local, utilise Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Puis copie le `whsec_...` retourne dans `.env`.

En production dans Stripe Dashboard:

- URL endpoint webhook: `https://ton-domaine.com/api/webhooks/stripe`
- Evenements a activer:
	- `checkout.session.completed`
	- `checkout.session.async_payment_succeeded`

## 5) Flux de commande

1. Le frontend envoie le panier a `POST /api/checkout`.
2. Le backend cree une session Stripe Checkout.
3. Stripe redirige le client vers le paiement.
4. Au succes de paiement, le webhook appelle le fulfillment (avec protection anti-doublon).
5. Les lignes de commande sont routees vers Printful avec `sync_variant_id`/`sku`.

## 6) Important avant production

- Le frontend doit etre servi par ce serveur Node (ou un reverse proxy) pour que `/api/checkout` et `/api/webhooks/stripe` existent en ligne.
- Verifie les payloads API Printful selon ton compte exact.
- Active la signature webhook Stripe en production.
- Pour eviter tout doublon apres redemarrage serveur, ajoute une persistence (base de donnees) pour les sessions deja traitees.

## 7) Mise en ligne rapide (ce soir)

1. Deploie le backend `server.js` sur un hebergeur Node (Render/Railway/Fly.io).
2. Renseigne les variables backend:
	- `BASE_URL=https://spinorshop.fr`
	- `FRONTEND_ORIGIN=https://spinorshop.fr`
	- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
	- `PRINTFUL_API_KEY`, `PRINTFUL_STORE_ID`, `PRINTFUL_VARIANT_MAP`
3. Dans Stripe Dashboard, webhook vers `https://ton-backend.com/api/webhooks/stripe`.
4. Evenements Stripe:
	- `checkout.session.completed`
	- `checkout.session.async_payment_succeeded`
5. Si frontend et backend sont sur 2 domaines differents:
	- Mets `window.SHOP_API_BASE_URL = "https://ton-backend.com"` dans `api-config.js`.
6. Test final:
	- `https://ton-backend.com/api/health` doit repondre JSON
	- clic "Passer la commande" doit ouvrir une URL `checkout.stripe.com`.
