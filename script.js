const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

const products = [
  {
    id: "tshirt",
    name: "Tshirt Performance",
    category: "tshirt",
    basePrice: 25,
    sportUse: "Padel match et entrainement intensif",
    sizes: SIZE_OPTIONS,
    colors: {
      noir: {
        face: "IMG/Tshirt/thsirtavant.jpg",
        dos: "IMG/Tshirt/tshirtarriere.png",
        gauche: "IMG/Tshirt/tshirtgauche.png",
        droite: "IMG/Tshirt/tshirtdroite.png",
      },
      blanc: {
        face: "IMG/Tshirt/tshirtavantblanc.png",
        dos: "IMG/Tshirt/tshirtarriereblanc.png",
        gauche: "IMG/Tshirt/tshirtgaucheblanc.png",
        droite: "IMG/Tshirt/tshirtdroiteblanc.png",
      },
      bleu: {
        face: "IMG/Tshirt/tshirtavantbleu.png",
        dos: "IMG/Tshirt/tshirtarrierebleu.png",
        gauche: "IMG/Tshirt/tshirtgauchebleu.png",
        droite: "IMG/Tshirt/tshirtdroitebleu.png",
      },
    },
    defaultColor: "noir",
    views: ["face", "dos", "gauche", "droite"],
    defaultView: "face",
    defaultSize: "M",
    description:
      "Obtenez une version ecologique d'un classique bien-aime avec ce t-shirt unisexe fabrique a partir de materiaux 100 % recycles. Son tissu leger et sa coupe eprouvee font de ce t-shirt un indispensable pour les journees chaudes.",
    highlights: [
      "65 % polyester recycle, 35 % coton Airlume peigne et file a l'anneau",
      "Taille unisexe, coupe reguliere",
      "Construction a coutures laterales",
      "Contenu recycle certifie GRS",
    ],
  },
  {
    id: "jogging",
    name: "Jogging Active Court",
    category: "jogging",
    basePrice: 35,
    sportUse: "Padel training, echauffement, recuperation",
    sizes: SIZE_OPTIONS,
    images: {
      face: "IMG/Jogging/jogging.png",
      taille: "IMG/Jogging/taillejogging.png.webp",
    },
    views: ["face", "taille"],
    defaultView: "face",
    defaultSize: "M",
    description:
      "Pantalon de jogging confortable et polyvalent, parfait pour vos seances de sport ou vos moments de detente. Coupe ajustee avec taille elastiquee et cordon de serrage pour un maintien optimal. Tissu doux et respirant qui epouse vos mouvements sans restriction.",
  },
  {
    id: "pull",
    name: "Pull Warm Up Club",
    category: "pull",
    basePrice: 45,
    sportUse: "Padel avant/après match et déplacements club",
    sizes: SIZE_OPTIONS,
    images: {
      face: "IMG/Pull/Pull.png",
      taille: "IMG/Pull/Pulltaille.png",
    },
    views: ["face", "taille"],
    defaultView: "face",
    defaultSize: "M",
    description:
      "Sweat confortable et polyvalent, parfait pour vos seances de sport ou vos moments de detente. Coupe moderne et épurée, ideale pour un style casual au quotidien. Matiere douce et respirante qui accompagne votre silhouette sans contrainte.",
  },
  {
    id: "bouteille",
    name: "Gourde Acier Inox",
    category: "bouteille",
    basePrice: 20,
    sportUse: "Hydratation pendant match et entrainement",
    sizes: ["17 oz"],
    images: {
      face: "IMG/Gourde/bouteille.png",
    },
    views: ["face"],
    defaultView: "face",
    defaultSize: "17 oz",
    description:
      "Bouteille d'eau en acier inoxydable concue pour garder vos boissons a la bonne temperature. Format pratique a emporter sur le court, en salle et en deplacement.",
  },
];

const COLOR_SWATCH = {
  noir: "#101214",
  blanc: "#f2f2f2",
  bleu: "#325f9e",
};

const VIEW_LABEL = {
  face: "Devant",
  dos: "Derriere",
  gauche: "Cote gauche",
  droite: "Cote droit",
  taille: "Guide taille",
};

const selectedState = {
  colorByProduct: {},
  sizeByProduct: {},
  viewByProduct: {},
};

const cart = [];

const productsGrid = document.getElementById("products-grid");
const categoryFilter = document.getElementById("category-filter");
const cartButton = document.getElementById("cart-button");
const cartCount = document.getElementById("cart-count");
const cartPanel = document.getElementById("cart-panel");
const closeCartButton = document.getElementById("close-cart");
const cartBackdrop = document.getElementById("cart-backdrop");
const cartItems = document.getElementById("cart-items");
const cartTotal = document.getElementById("cart-total");
const checkoutButton = document.querySelector(".checkout-button");
let cartCloseTimer = null;

function apiUrl(pathname) {
  const configuredBase = String(window.SHOP_API_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  return configuredBase ? `${configuredBase}${pathname}` : pathname;
}

function money(value) {
  return `${value.toFixed(2).replace(".", ",")} EUR`;
}

function currentColor(product) {
  return selectedState.colorByProduct[product.id] || product.defaultColor;
}

function currentView(product) {
  return selectedState.viewByProduct[product.id] || product.defaultView || "face";
}

function currentSize(product) {
  return selectedState.sizeByProduct[product.id] || product.defaultSize || "M";
}

function getProductImage(product) {
  const view = currentView(product);
  return getProductViewImage(product, view);
}

function getProductViewImage(product, view) {
  if (product.colors) {
    const color = currentColor(product);
    const byView = product.colors[color] || product.colors[product.defaultColor];
    return byView[view] || byView[product.defaultView] || byView.face;
  }

  if (product.images) {
    const view = currentView(product);
    return product.images[view] || product.images[product.defaultView] || product.images.face;
  }

  return "";
}

function productCard(product) {
  const color = currentColor(product);
  const view = currentView(product);
  const size = currentSize(product);
  const viewIndex = product.views ? Math.max(product.views.indexOf(view), 0) : 0;

  const mediaSlides = product.views?.length
    ? product.views
        .map((viewKey) => {
          const imageSrc = getProductViewImage(product, viewKey);
          return `<figure class="media-slide" aria-hidden="${viewKey === view ? "false" : "true"}">
            <img src="${imageSrc}" alt="${product.name} ${VIEW_LABEL[viewKey] || viewKey}" loading="lazy" />
          </figure>`;
        })
        .join("")
    : `<figure class="media-slide"><img src="${getProductImage(product)}" alt="${product.name}" loading="lazy" /></figure>`;

  const mediaControls = product.views?.length
    ? `<div class="media-carousel-controls">${product.views
        .map((viewKey) => {
          const active = viewKey === view ? "active" : "";
          return `<button type="button" class="media-dot ${active}" data-carousel-view="${viewKey}" data-view-product="${product.id}" title="${
            VIEW_LABEL[viewKey] || viewKey
          }"></button>`;
        })
        .join("")}</div>`
    : "";

  const swatches = product.colors
    ? `<div class="swatches">${Object.keys(product.colors)
        .map((colorKey) => {
          const active = colorKey === color ? "active" : "";
          return `<button type="button" class="swatch ${active}" style="background:${
            COLOR_SWATCH[colorKey]
          };" data-color="${colorKey}" data-product="${product.id}" title="${colorKey}"></button>`;
        })
        .join("")}</div>`
    : "";

  const views = product.views
    ? `<div class="view-row">${product.views
        .map((viewKey) => {
          const active = viewKey === view ? "active" : "";
          return `<button type="button" class="view-button ${active}" data-view="${viewKey}" data-view-product="${
            product.id
          }">${VIEW_LABEL[viewKey] || viewKey}</button>`;
        })
        .join("")}</div>`
    : "";

  const sizes = product.sizes
    ? `<div class="size-row">
        <label for="size-${product.id}">Taille</label>
        <select id="size-${product.id}" class="size-select" data-size-product="${product.id}">
          ${product.sizes
            .map((value) => `<option value="${value}" ${value === size ? "selected" : ""}>${value}</option>`)
            .join("")}
        </select>
      </div>`
    : "";

  const highlights = product.highlights?.length
    ? `<ul class="product-highlights">${product.highlights.map((line) => `<li>${line}</li>`).join("")}</ul>`
    : "";

  return `<article class="product-card">
      <div class="product-media">
        <div class="product-media-track" style="--slide-index:${viewIndex}">
          ${mediaSlides}
        </div>
        ${mediaControls}
      </div>
      <div class="product-content">
        <div class="product-head">
          <h3>${product.name}</h3>
          <span class="price">${money(product.basePrice)}</span>
        </div>
        <p class="product-category">${product.category.toUpperCase()}</p>
        <p class="product-meta">${product.sportUse}</p>
        ${swatches}
        ${views}
        ${sizes}
        <p class="product-description">${product.description}</p>
        ${highlights}
        <button type="button" class="add-button" data-add-product="${product.id}">Ajouter au panier</button>
      </div>
    </article>`;
}

function renderProducts() {
  const category = categoryFilter.value;
  const filtered =
    category === "all" ? products : products.filter((product) => product.category === category);
  productsGrid.innerHTML = filtered.map(productCard).join("");
}

function renderCart() {
  cartCount.textContent = String(cart.length);

  if (!cart.length) {
    cartItems.innerHTML = `<div class="cart-empty">
      <p>Ton panier est vide.</p>
      <span>Ajoute des pieces performance pour commencer.</span>
    </div>`;
    cartTotal.textContent = money(0);
    return;
  }

  cartItems.innerHTML = cart
    .map(
      (item, index) => `<div class="cart-item">
      <img class="cart-item-thumb" src="${item.image}" alt="${item.name}" loading="lazy" />
      <div class="cart-item-main">
        <p class="cart-item-title">${item.name}</p>
        <p class="cart-item-variant">${item.variant}</p>
        <div class="cart-qty">
          <button type="button" class="qty-button" data-qty-action="decrease" data-qty-index="${index}">-</button>
          <span>${item.quantity}</span>
          <button type="button" class="qty-button" data-qty-action="increase" data-qty-index="${index}">+</button>
        </div>
      </div>
      <div class="cart-item-side">
        <p>${money(item.price * item.quantity)}</p>
        <button type="button" class="remove-item" data-remove-index="${index}">x</button>
      </div>
    </div>`
    )
    .join("");

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  cartTotal.textContent = money(total);
}

function openCart() {
  if (cartCloseTimer) {
    clearTimeout(cartCloseTimer);
    cartCloseTimer = null;
  }

  cartPanel.classList.remove("closing");
  cartPanel.classList.add("open");
  cartPanel.setAttribute("aria-hidden", "false");
  cartBackdrop.hidden = false;
}

function closeCart() {
  cartPanel.classList.remove("open");
  cartPanel.classList.add("closing");
  cartPanel.setAttribute("aria-hidden", "true");

  cartCloseTimer = setTimeout(() => {
    cartPanel.classList.remove("closing");
    cartBackdrop.hidden = true;
  }, 320);
}

productsGrid.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const swatch = target.closest("[data-color]");
  if (swatch) {
    const productId = swatch.getAttribute("data-product");
    const color = swatch.getAttribute("data-color");
    if (productId && color) {
      selectedState.colorByProduct[productId] = color;
      renderProducts();
    }
    return;
  }

  const view = target.closest("[data-view]");
  if (view) {
    const productId = view.getAttribute("data-view-product");
    const viewValue = view.getAttribute("data-view");
    if (productId && viewValue) {
      selectedState.viewByProduct[productId] = viewValue;
      renderProducts();
    }
    return;
  }

  const carouselView = target.closest("[data-carousel-view]");
  if (carouselView) {
    const productId = carouselView.getAttribute("data-view-product");
    const viewValue = carouselView.getAttribute("data-carousel-view");
    if (productId && viewValue) {
      selectedState.viewByProduct[productId] = viewValue;
      renderProducts();
    }
    return;
  }

  const add = target.closest("[data-add-product]");
  if (add) {
    const productId = add.getAttribute("data-add-product");
    const product = products.find((item) => item.id === productId);
    if (!product) {
      return;
    }

    const size = currentSize(product);
    const color = product.colors ? currentColor(product) : null;
    const variant = color ? `Couleur: ${color} | Taille: ${size}` : `Taille: ${size}`;

    const existing = cart.find(
      (item) => item.productId === product.id && item.size === size && (item.color || "") === (color || "")
    );

    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({
        productId: product.id,
        name: product.name,
        variant,
        image: getProductImage(product),
        size,
        color,
        price: product.basePrice,
        quantity: 1,
      });
    }

    renderCart();
    openCart();
  }
});

productsGrid.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) {
    return;
  }

  if (!target.hasAttribute("data-size-product")) {
    return;
  }

  const productId = target.getAttribute("data-size-product");
  if (productId) {
    selectedState.sizeByProduct[productId] = target.value;
  }
});

cartItems.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const remove = target.closest("[data-remove-index]");
  if (remove) {
    const index = Number(remove.getAttribute("data-remove-index"));
    if (Number.isInteger(index)) {
      cart.splice(index, 1);
      renderCart();
    }
    return;
  }

  const qtyButton = target.closest("[data-qty-action]");
  if (!qtyButton) {
    return;
  }

  const index = Number(qtyButton.getAttribute("data-qty-index"));
  const action = qtyButton.getAttribute("data-qty-action");
  if (Number.isInteger(index) && cart[index]) {
    if (action === "increase") {
      cart[index].quantity += 1;
    }

    if (action === "decrease") {
      cart[index].quantity -= 1;
      if (cart[index].quantity <= 0) {
        cart.splice(index, 1);
      }
    }

    renderCart();
  }
});

cartButton.addEventListener("click", openCart);
closeCartButton.addEventListener("click", closeCart);
cartBackdrop.addEventListener("click", closeCart);
categoryFilter.addEventListener("change", renderProducts);

checkoutButton?.addEventListener("click", async () => {
  if (!cart.length) {
    alert("Ton panier est vide.");
    return;
  }

  checkoutButton.disabled = true;
  const previousLabel = checkoutButton.textContent;
  checkoutButton.textContent = "Redirection...";

  try {
    const checkoutEndpoint = apiUrl("/api/checkout");
    const response = await fetch(checkoutEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: cart.map((item) => ({
          productId: item.productId,
          name: item.name,
          unitPrice: item.price,
          quantity: item.quantity,
          size: item.size,
          color: item.color || "",
        })),
      }),
    });

    const contentType = response.headers.get("content-type") || "";
    const rawBody = await response.text();

    let payload = {};
    if (contentType.includes("application/json") && rawBody) {
      try {
        payload = JSON.parse(rawBody);
      } catch {
        payload = {};
      }
    }

    if (!response.ok) {
      if (!contentType.includes("application/json")) {
        throw new Error(
          `API checkout introuvable (${checkoutEndpoint}). Verifie le deploiement backend et l'URL API.`
        );
      }
      throw new Error(payload.error || "Impossible de lancer le checkout.");
    }

    const checkoutUrl = String(payload.checkoutUrl || "").trim();
    if (!checkoutUrl) {
      throw new Error("URL Stripe manquante dans la reponse checkout.");
    }

    try {
      new URL(checkoutUrl);
    } catch {
      throw new Error("URL Stripe invalide recue depuis le serveur.");
    }

    window.location.href = checkoutUrl;
  } catch (error) {
    alert(error.message || "Erreur de checkout.");
  } finally {
    checkoutButton.disabled = false;
    checkoutButton.textContent = previousLabel;
  }
});

renderProducts();
renderCart();
