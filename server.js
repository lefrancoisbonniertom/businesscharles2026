const express = require("express");
const path = require("path");
const crypto = require("crypto");
const dotenv = require("dotenv");
const cors = require("cors");
const Stripe = require("stripe");

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || "";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || BASE_URL || "";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const PRINTFUL_STORE_ID = process.env.PRINTFUL_STORE_ID || "";

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const app = express();
const handledCheckoutSessions = new Set();

const SKU_BY_PRODUCT = {
  tshirt: "PF-TSHIRT-SPORT",
  jogging: "PF-JOGGING-SPORT",
  pull: "PF-PULL-SPORT",
  bouteille: "PF-BOUTEILLE-INOX",
};

function parseVariantMap(rawValue) {
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    console.warn("Invalid PRINTFUL_VARIANT_MAP JSON. Falling back to SKU mapping.");
    return {};
  }
}

const PRINTFUL_VARIANT_MAP = parseVariantMap(process.env.PRINTFUL_VARIANT_MAP || "");

function normalizeKeyPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function resolvePrintfulVariant(item) {
  const productId = normalizeKeyPart(item.productId);
  const color = normalizeKeyPart(item.color || "");
  const size = normalizeKeyPart(item.size || "");
  const sizeAliases = Array.from(
    new Set([
      size,
      size === "xxl" ? "2xl" : "",
      size === "2xl" ? "xxl" : "",
      size === "xxxl" ? "3xl" : "",
      size === "3xl" ? "xxxl" : "",
    ].filter(Boolean))
  );

  const keysToTry = [];
  for (const candidateSize of sizeAliases.length ? sizeAliases : [size]) {
    keysToTry.push(`${productId}:${color}:${candidateSize}`);
    keysToTry.push(`${productId}:${candidateSize}`);
  }
  keysToTry.push(productId);

  for (const key of keysToTry) {
    const value = PRINTFUL_VARIANT_MAP[key];
    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (Number.isFinite(Number(value))) {
      return { syncVariantId: Number(value) };
    }

    return { sku: String(value) };
  }

  return { sku: SKU_BY_PRODUCT[item.productId] || item.productId };
}

function getRequestBaseUrl(req) {
  if (BASE_URL) {
    return BASE_URL;
  }

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  const protocol = forwardedProto || req.protocol || "http";

  const forwardedHost = String(req.headers["x-forwarded-host"] || "")
    .split(",")[0]
    .trim();
  const host = forwardedHost || req.get("host");

  return `${protocol}://${host}`;
}

function buildCorsOptions() {
  const allowedOrigins = String(FRONTEND_ORIGIN)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!allowedOrigins.length) {
    return { origin: true };
  }

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin not allowed by CORS"));
    },
  };
}

const corsOptions = buildCorsOptions();

async function postJson(url, headers, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  if (!text) {
    return {};
  }

  return JSON.parse(text);
}

async function submitPrintfulOrder(order) {
  const token = process.env.PRINTFUL_API_KEY;
  if (!token) {
    console.log("[dry-run] Printful order", JSON.stringify(order, null, 2));
    return;
  }

  const payload = {
    external_id: order.orderRef,
    confirm: true,
    ...(PRINTFUL_STORE_ID ? { store_id: Number(PRINTFUL_STORE_ID) || PRINTFUL_STORE_ID } : {}),
    recipient: {
      name: order.customerName || "Client Boutique",
      email: order.customerEmail || undefined,
      phone: order.customerPhone || undefined,
      address1: order.shipping?.line1,
      address2: order.shipping?.line2 || undefined,
      city: order.shipping?.city,
      state_code: order.shipping?.state,
      country_code: order.shipping?.country,
      zip: order.shipping?.postalCode,
    },
    items: order.items.map((item) => ({
      external_id: `${order.orderRef}-${item.productId}-${item.size}-${item.color || "std"}`,
      name: item.name,
      quantity: item.quantity,
      retail_price: item.unitPrice.toFixed(2),
      ...(item.syncVariantId ? { sync_variant_id: item.syncVariantId } : { sku: item.sku }),
      files: [],
      options: [
        { id: "Size", value: item.size },
        ...(item.color ? [{ id: "Color", value: item.color }] : []),
      ],
    })),
  };

  console.log(
    "Submitting Printful order",
    JSON.stringify(
      {
        orderRef: order.orderRef,
        storeId: PRINTFUL_STORE_ID || null,
        itemCount: order.items.length,
      },
      null,
      2
    )
  );

  await postJson("https://api.printful.com/orders", { Authorization: `Bearer ${token}` }, payload);
}

async function fulfillOrder(order) {
  const items = order.items.map((item) => ({
    ...item,
    ...resolvePrintfulVariant(item),
  }));
  await submitPrintfulOrder({
    ...order,
    items,
  });
}

async function buildOrderFromStripeSession(sessionId, fallbackOrderRef) {
  if (!stripe) {
    throw new Error("Stripe is not configured yet.");
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const items = await getOrderItemsFromSession(sessionId);

  if (!items.length) {
    throw new Error("No checkout line items found for fulfilled session.");
  }

  const shippingAddress = session.shipping_details?.address || session.customer_details?.address;
  return {
    orderRef: session.metadata?.orderRef || fallbackOrderRef || `ord_${session.id}`,
    items,
    customerEmail: session.customer_details?.email,
    customerName: session.shipping_details?.name || session.customer_details?.name,
    customerPhone: session.customer_details?.phone,
    shipping: {
      line1: shippingAddress?.line1,
      line2: shippingAddress?.line2,
      city: shippingAddress?.city,
      state: shippingAddress?.state,
      country: shippingAddress?.country,
      postalCode: shippingAddress?.postal_code,
    },
  };
}

async function processFulfillmentForSession(sessionId, orderRef) {
  if (handledCheckoutSessions.has(sessionId)) {
    console.log("Skipping already handled checkout session", sessionId);
    return;
  }

  const order = await buildOrderFromStripeSession(sessionId, orderRef);
  console.log(
    "Fulfilling order from Stripe session",
    JSON.stringify(
      {
        sessionId,
        orderRef: order.orderRef,
        itemCount: order.items.length,
      },
      null,
      2
    )
  );
  await fulfillOrder(order);
  handledCheckoutSessions.add(sessionId);
}

async function getOrderItemsFromSession(sessionId) {
  if (!stripe) {
    return [];
  }

  const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
    limit: 100,
    expand: ["data.price.product"],
  });

  return lineItems.data.map((line) => {
    const quantity = Math.max(1, Number(line.quantity || 1));
    const productData = line.price?.product;
    const productMetadata =
      productData && typeof productData !== "string" ? productData.metadata || {} : {};

    const unitAmountCents =
      typeof line.price?.unit_amount === "number"
        ? line.price.unit_amount
        : Math.round(Number(line.amount_total || 0) / quantity);

    return {
      productId: String(productMetadata.productId || ""),
      name: String(line.description || "Produit"),
      quantity,
      unitPrice: Number(unitAmountCents) / 100,
      size: String(productMetadata.size || "M"),
      color: String(productMetadata.color || ""),
    };
  });
}

app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    if (!stripe || !STRIPE_WEBHOOK_SECRET) {
      return res.status(200).send("Webhook ignored (Stripe not configured)");
    }

    let event;
    try {
      const signature = req.headers["stripe-signature"];
      event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);
    } catch (error) {
      return res.status(400).send(`Webhook signature error: ${error.message}`);
    }

    const supportedEvent =
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded";

    if (supportedEvent) {
      const session = event.data.object;
      const orderRef = session.metadata?.orderRef || `ord_${session.id}`;
      const paymentIsDone =
        event.type === "checkout.session.async_payment_succeeded" ||
        session.payment_status === "paid";

      if (!paymentIsDone) {
        return res.status(200).json({ received: true, skipped: true });
      }

      try {
        await processFulfillmentForSession(session.id, orderRef);
      } catch (error) {
        console.error("Fulfillment error:", error?.stack || error?.message || error);
      }
    }

    return res.status(200).json({ received: true });
  }
);

app.use(express.json());
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.static(path.resolve(__dirname)));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    stripeReady: Boolean(stripe),
    printfulReady: Boolean(process.env.PRINTFUL_API_KEY),
  });
});

app.post("/api/checkout", async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: "Stripe is not configured yet." });
  }

  const { items = [], customerEmail = "" } = req.body || {};
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: "Panier vide." });
  }

  const normalizedItems = items.map((item) => ({
    productId: String(item.productId || ""),
    name: String(item.name || "Produit"),
    quantity: Math.max(1, Number(item.quantity || 1)),
    unitPrice: Math.max(0, Number(item.unitPrice || 0)),
    size: String(item.size || "M"),
    color: item.color ? String(item.color) : "",
  }));

  if (normalizedItems.some((item) => !item.productId || !item.unitPrice)) {
    return res.status(400).json({ error: "Article invalide dans le panier." });
  }

  const siteBaseUrl = getRequestBaseUrl(req);

  const orderRef = `ord_${crypto.randomUUID()}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: customerEmail || undefined,
      line_items: normalizedItems.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: "eur",
          unit_amount: Math.round(item.unitPrice * 100),
          product_data: {
            name: item.name,
            description: `Taille: ${item.size}${item.color ? ` | Couleur: ${item.color}` : ""}`,
            metadata: {
              productId: item.productId,
              size: item.size,
              color: item.color || "",
            },
          },
        },
      })),
      shipping_address_collection: {
        allowed_countries: ["FR", "BE", "CH", "LU", "DE", "IT", "ES", "PT", "NL"],
      },
      success_url: `${siteBaseUrl}?checkout=success`,
      cancel_url: `${siteBaseUrl}?checkout=cancel`,
      metadata: {
        orderRef,
      },
    });

    return res.json({
      checkoutUrl: session.url,
      orderRef,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Erreur checkout" });
  }
});

app.listen(PORT, () => {
  console.log(`Server ready on ${BASE_URL || `http://localhost:${PORT}`}`);
});
