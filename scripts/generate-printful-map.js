const dotenv = require("dotenv");

dotenv.config();

const API_BASE = "https://api.printful.com";
const TOKEN = process.env.PRINTFUL_API_KEY || "";
const STORE_ID_FROM_ENV = Number(process.env.PRINTFUL_STORE_ID || 0);

function normalize(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactKeyPart(input) {
  return normalize(input).replace(/\s+/g, "");
}

function guessProductId(productText) {
  const text = normalize(productText);

  if (/(t\s*shirt|tee|maillot)/.test(text)) {
    return "tshirt";
  }
  if (/jogg|sweat\s*pants|pants|pantalon/.test(text)) {
    return "jogging";
  }
  if (/(pull|hoodie|sweatshirt|crewneck)/.test(text)) {
    return "pull";
  }
  if (/(bouteille|gourde|bottle|stainless)/.test(text)) {
    return "bouteille";
  }

  return "";
}

function normalizeColor(input) {
  const text = normalize(input);
  if (!text) {
    return "";
  }
  if (text.includes("black") || text.includes("noir")) {
    return "noir";
  }
  if (text.includes("white") || text.includes("blanc")) {
    return "blanc";
  }
  if (text.includes("blue") || text.includes("bleu") || text.includes("navy")) {
    return "bleu";
  }
  return compactKeyPart(text);
}

function normalizeSize(input) {
  const text = normalize(input);
  if (!text) {
    return "";
  }

  const standardPattern = /(?:^|\b)(xs|s|m|l|xl|xxl|xxxl|2xl|3xl)(?:\b|$)/i;
  const standardMatch = text.match(standardPattern);
  if (standardMatch) {
    const value = String(standardMatch[1] || "").toLowerCase();
    if (value === "2xl") {
      return "xxl";
    }
    if (value === "3xl") {
      return "xxxl";
    }
    return value;
  }

  const collapsed = compactKeyPart(text).toUpperCase();
  return collapsed.toLowerCase();
}

async function getJson(pathWithQuery) {
  const response = await fetch(`${API_BASE}${pathWithQuery}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
    },
  });

  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }

  if (!response.ok) {
    throw new Error(`Printful ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function getStores() {
  const payload = await getJson("/stores");
  return Array.isArray(payload.result) ? payload.result : [];
}

async function getAllStoreProducts(storeId) {
  const all = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const payload = await getJson(
      `/sync/products?store_id=${storeId}&offset=${offset}&limit=${limit}`
    );
    const result = Array.isArray(payload.result) ? payload.result : [];
    all.push(...result);

    const paging = payload.paging || {};
    const fetched = result.length;
    const total = Number.isFinite(Number(paging.total)) ? Number(paging.total) : all.length;

    if (!fetched || all.length >= total) {
      break;
    }

    offset += fetched;
  }

  return all;
}

async function getSyncProduct(storeId, syncProductId) {
  const payload = await getJson(`/sync/products/${syncProductId}?store_id=${storeId}`);
  return payload.result || {};
}

function variantIdOf(variant) {
  if (Number.isFinite(Number(variant.sync_variant_id))) {
    return Number(variant.sync_variant_id);
  }
  if (Number.isFinite(Number(variant.id))) {
    return Number(variant.id);
  }
  return null;
}

function collectVariantCandidates(product) {
  const variants = [];

  if (Array.isArray(product.sync_variants) && product.sync_variants.length) {
    variants.push(...product.sync_variants);
  }
  if (Array.isArray(product.variants) && product.variants.length) {
    variants.push(...product.variants);
  }

  return variants;
}

function pickStoreId(stores) {
  if (STORE_ID_FROM_ENV) {
    return STORE_ID_FROM_ENV;
  }

  const preferred = stores.find((store) => /spinor/i.test(String(store.name || "")));
  if (preferred) {
    return Number(preferred.id);
  }

  const firstNonManual = stores.find((store) => String(store.type || "") !== "native");
  if (firstNonManual) {
    return Number(firstNonManual.id);
  }

  const first = stores[0];
  return first ? Number(first.id) : 0;
}

function buildMap(products) {
  const map = {};
  const unmatched = [];

  for (const product of products) {
    const productName = String(product.name || product.sync_product?.name || "");
    const productId = guessProductId(productName);
    const variants = collectVariantCandidates(product);

    if (!productId || !variants.length) {
      unmatched.push({ productName, reason: !productId ? "unknown product type" : "no variants" });
      continue;
    }

    for (const variant of variants) {
      const id = variantIdOf(variant);
      if (!id) {
        continue;
      }

      const variantName = String(variant.name || "");
      const color = normalizeColor(variant.color || variant.color_name || variantName);
      const size = normalizeSize(variant.size || variant.size_name || variantName);

      if (color && size) {
        map[`${productId}:${color}:${size}`] = id;
      }
      if (size) {
        map[`${productId}:${size}`] = id;
      }
      if (!map[productId]) {
        map[productId] = id;
      }
    }
  }

  return { map, unmatched };
}

async function main() {
  if (!TOKEN) {
    throw new Error("PRINTFUL_API_KEY is missing in .env");
  }

  const stores = await getStores();
  if (!stores.length) {
    throw new Error("No Printful stores available for this token.");
  }

  const storeId = pickStoreId(stores);
  if (!storeId) {
    throw new Error("Unable to resolve PRINTFUL_STORE_ID.");
  }

  const productsLight = await getAllStoreProducts(storeId);
  const products = [];
  for (const product of productsLight) {
    const details = await getSyncProduct(storeId, product.id);
    products.push({
      ...product,
      ...details,
    });
  }

  const { map, unmatched } = buildMap(products);

  console.log(`\nResolved PRINTFUL_STORE_ID=${storeId}`);
  console.log("\nPRINTFUL_VARIANT_MAP=");
  console.log(JSON.stringify(map));

  if (unmatched.length) {
    console.log("\nProducts to review manually:");
    for (const item of unmatched) {
      console.log(`- ${item.productName || "(no name)"}: ${item.reason}`);
    }
  }

  console.log("\nTip: copy only the JSON value into .env after PRINTFUL_VARIANT_MAP=");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
