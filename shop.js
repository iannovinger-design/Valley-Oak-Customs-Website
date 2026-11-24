const categoryLabels = { metal: "Metal", wood: "Wood", acrylic: "Acrylic" };
const categoryOrder = Object.keys(categoryLabels);

export function filterAndSortProducts(products, filter = "all", sort = "default") {
  const filtered = products.filter(product => filter === "all" || product.material === filter);
  const compare = sort === "price-asc" ? (a, b) => a.price - b.price
    : sort === "price-desc" ? (a, b) => b.price - a.price
      : sort === "name-asc" ? (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        : (a, b) => a.index - b.index;
  return filtered.toSorted((a, b) => compare(a, b) || a.index - b.index);
}

export function supportedMaterialFilters(products) {
  const present = new Set(products.map(product => product.material).filter(material => categoryLabels[material]));
  return categoryOrder.filter(category => present.has(category));
}

function initializeShop() {
  const grid = document.querySelector("[data-shop-grid]");
  if (!grid) return;
  const controls = document.querySelector("[data-shop-controls]");
  const filters = document.querySelector("[data-shop-filters]");
  const sort = document.querySelector("[data-shop-sort]");
  const more = document.querySelector("[data-shop-more]");
  const count = document.querySelector("[data-shop-count]");
  const empty = document.querySelector("[data-shop-empty]");
  const reset = document.querySelector("[data-shop-reset]");
  const products = [...grid.querySelectorAll("[data-shop-card]")].map((element, index) => ({
    element, index, material: element.dataset.shopMaterial || "", name: element.dataset.shopName || "",
    price: Number.parseFloat(element.dataset.shopPrice),
  }));
  const pageSize = 12;
  let activeFilter = "all";
  let visible = pageSize;

  const addFilterButton = (value, label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "shop-filter-button";
    button.dataset.shopFilter = value;
    button.setAttribute("aria-pressed", String(value === activeFilter));
    button.textContent = label;
    filters.append(button);
  };
  addFilterButton("all", "All Products");
  for (const category of supportedMaterialFilters(products)) addFilterButton(category, categoryLabels[category]);
  controls.hidden = false;

  function update({ focusFirstNew = false } = {}) {
    const matching = filterAndSortProducts(products, activeFilter, sort.value);
    const matchingElements = new Set(matching.map(product => product.element));
    const firstNew = focusFirstNew ? matching[visible - pageSize] : null;
    for (const product of [...matching, ...products.filter(product => !matchingElements.has(product.element))]) grid.append(product.element);
    matching.forEach((product, index) => { product.element.hidden = index >= visible; });
    products.filter(product => !matchingElements.has(product.element)).forEach(product => { product.element.hidden = true; });
    const shown = Math.min(visible, matching.length);
    more.hidden = shown >= matching.length;
    empty.hidden = matching.length !== 0;
    const label = activeFilter === "all" ? "products" : `${categoryLabels[activeFilter]} products`;
    count.textContent = matching.length > pageSize ? `Showing ${shown} of ${matching.length} ${label}` : `${matching.length} ${label}`;
    if (focusFirstNew) firstNew?.element.querySelector("a")?.focus();
  }

  filters.addEventListener("click", event => {
    const button = event.target.closest("[data-shop-filter]");
    if (!button) return;
    activeFilter = button.dataset.shopFilter;
    visible = pageSize;
    for (const item of filters.querySelectorAll("[data-shop-filter]")) item.setAttribute("aria-pressed", String(item === button));
    update();
  });
  sort.addEventListener("change", () => { visible = pageSize; update(); });
  more.addEventListener("click", () => { visible += pageSize; update({ focusFirstNew: true }); });
  reset.addEventListener("click", () => {
    activeFilter = "all";
    sort.value = "default";
    visible = pageSize;
    for (const item of filters.querySelectorAll("[data-shop-filter]")) item.setAttribute("aria-pressed", String(item.dataset.shopFilter === "all"));
    update();
    filters.querySelector('[data-shop-filter="all"]')?.focus();
  });
  update();
}

if (typeof document !== "undefined") initializeShop();
