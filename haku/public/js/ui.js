// Shared UI: navigation, header/footer, product cards, cart drawer
import { $, $$, esc, inr, I, LOGO_MARK, stars, cart, wish, api, getConfig, toast, bus } from './core.js';

export function navigate(url, { replace = false } = {}) {
  if (replace) history.replaceState({}, '', url); else history.pushState({}, '', url);
  window.dispatchEvent(new Event('haku:route'));
}

// ---------------- Header / footer ----------------
export async function mountChrome() {
  const cfg = await getConfig();
  $('#header-root').innerHTML = `
  <div class="ticker" aria-hidden="true"><div class="ticker-track">${Array(12).fill(`<span>Free shipping above ${inr(cfg.freeShippingAbove)}</span><span>7-day easy returns</span><span>Cash on delivery available</span>`).join('')}</div></div>
  <header class="site-header" id="site-header">
    <div class="wrap header-row">
      <button class="iconbtn hamburger" data-action="menu" aria-label="Open menu" aria-expanded="false" aria-controls="m-nav">${I.menu}</button>
      <a class="logo" href="/" data-link aria-label="HAKU home"><span class="logo-mark">${LOGO_MARK}</span>HAKU</a>
      <nav class="nav" aria-label="Main">
        <a href="/" data-link data-nav="/">Home</a><a href="/shop" data-link data-nav="/shop">Shop</a>
        <a href="/#categories" data-link data-nav="categories">Categories</a><a href="/track" data-link data-nav="/track">Track Order</a><a href="/contact" data-link data-nav="/contact">Contact Us</a>
      </nav>
      <div class="header-actions">
        <button class="iconbtn" data-action="search-open" aria-label="Search products">${I.search}</button>
        <a class="iconbtn" href="/wishlist" data-link aria-label="Wishlist">${I.heart}<span class="badge-count" id="wish-count"></span></a>
        <button class="iconbtn" data-action="cart-open" aria-label="Open cart" id="cart-btn">${I.bag}<span class="badge-count" id="cart-count"></span></button>
      </div>
    </div>
    <form class="searchbar" id="searchbar" role="search" aria-label="Search products">
      <input type="search" id="search-input" placeholder="Search hoodies, sneakers, headphones…" aria-label="Search products" autocomplete="off">
      <button class="btn sm" type="submit">Search</button>
      <button class="iconbtn" type="button" data-action="search-close" aria-label="Close search">${I.close}</button>
    </form>
  </header>
  <nav class="m-nav" id="m-nav" aria-label="Mobile">
    <div class="m-top"><a class="logo" href="/" data-link><span class="logo-mark">${LOGO_MARK}</span>HAKU</a><button class="iconbtn" data-action="menu-close" aria-label="Close menu">${I.close}</button></div>
    <a href="/" data-link>Home</a><a href="/shop" data-link>Shop</a><a href="/#categories" data-link>Categories</a><a href="/wishlist" data-link>Wishlist</a><a href="/track" data-link>Track Order</a><a href="/contact" data-link>Contact Us</a>
  </nav>`;

  const cats = cfg.categories.map((c) => `<li><a href="/shop?category=${encodeURIComponent(c.name)}" data-link>${esc(c.name)}</a></li>`).join('');
  const s = cfg.shop;
  const social = [['Instagram', 'IG', s.instagram], ['Facebook', 'FB', s.facebook], ['X', 'X', s.x]].filter((x) => x[2]);
  $('#footer-root').innerHTML = `
  <footer class="site-footer"><div class="wrap">
    <div class="foot-grid">
      <div><a class="logo" href="/" data-link><span class="logo-mark">${LOGO_MARK}</span>HAKU</a>
        <p style="margin-top:14px;max-width:34ch;font-size:.92rem">Quality everyday products at honest prices, delivered to your door. Made for people who like things simple.</p>
        ${social.length ? `<div class="social">${social.map(([n, t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" aria-label="${n}">${t}</a>`).join('')}</div>` : ''}</div>
      <div><h4>Shop</h4><ul><li><a href="/shop" data-link>All products</a></li>${cats}</ul></div>
      <div><h4>Support</h4><ul><li><a href="/track" data-link>Track order</a></li><li><a href="/contact" data-link>Contact us</a></li><li><a href="/policy/shipping" data-link>Shipping policy</a></li><li><a href="/policy/returns" data-link>Returns &amp; refunds</a></li><li><a href="/policy/privacy" data-link>Privacy policy</a></li><li><a href="/policy/terms" data-link>Terms &amp; conditions</a></li></ul></div>
      <div><h4>Contact</h4><ul><li><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></li>${s.phone ? `<li>${esc(s.phone)}</li>` : ''}${s.address ? `<li>${esc(s.address)}</li>` : ''}</ul></div>
    </div>
    <div class="foot-bottom"><span>© ${new Date().getFullYear()} HAKU. All rights reserved.</span><span>Prices in INR. Cash on delivery available.</span></div>
  </div></footer>`;

  if (s.whatsapp) {
    const wa = $('#wa'); wa.href = `https://wa.me/${s.whatsapp}?text=${encodeURIComponent('Hi HAKU, I need help with…')}`; wa.innerHTML = I.wa; wa.hidden = false;
  }
  updateBadges();
  const onScroll = () => $('#site-header').classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
}

export function markNav(path) {
  $$('.nav a').forEach((a) => {
    const k = a.dataset.nav;
    a.classList.toggle('active', k === path || (k === '/shop' && path.startsWith('/product')));
  });
}

let lastCount = null;
export function updateBadges() {
  const c = cart.count(), w = wish.ids.length;
  const cc = $('#cart-count'), wc = $('#wish-count');
  if (cc) { cc.textContent = c ? String(c) : ''; if (lastCount !== null && c !== lastCount) { cc.classList.remove('bump'); void cc.offsetWidth; cc.classList.add('bump'); } }
  if (wc) wc.textContent = w ? String(w) : '';
  lastCount = c;
}

// Overlay, menu, search, drawer
let overlayCount = 0;
function showOverlay() { const o = $('#overlay'); o.hidden = false; requestAnimationFrame(() => o.classList.add('show')); document.body.classList.add('lock'); overlayCount++; }
function hideOverlay() { overlayCount = Math.max(0, overlayCount - 1); if (overlayCount) return; const o = $('#overlay'); o.classList.remove('show'); document.body.classList.remove('lock'); setTimeout(() => { if (!overlayCount) o.hidden = true; }, 300); }
let lastFocus = null;
export function openMenu() { $('#m-nav').classList.add('open'); $('.hamburger').setAttribute('aria-expanded', 'true'); showOverlay(); $('#m-nav a')?.focus(); }
export function closeMenu() { const m = $('#m-nav'); if (!m.classList.contains('open')) return; m.classList.remove('open'); $('.hamburger').setAttribute('aria-expanded', 'false'); hideOverlay(); }
export function openSearch() { $('#searchbar').classList.add('open'); setTimeout(() => $('#search-input').focus(), 60); }
export function closeSearch() { $('#searchbar').classList.remove('open'); }
export async function openCart() {
  lastFocus = document.activeElement;
  const d = $('#drawer'); d.classList.add('open'); d.setAttribute('aria-hidden', 'false'); showOverlay();
  await renderDrawer(); $('#drawer button')?.focus();
}
export function closeCart() {
  const d = $('#drawer'); if (!d.classList.contains('open')) return;
  d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); hideOverlay(); lastFocus?.focus?.();
}
export function closeAllPanels() { closeMenu(); closeCart(); closeSearch(); }
export const drawerOpen = () => $('#drawer').classList.contains('open');

// ---------------- Product card ----------------
export function productCard(p) {
  const hasVariants = p.sizes.length || p.colors.length;
  const badge = p.badge ? `<span class="tag lime">${esc(p.badge)}</span>` : '';
  const off = p.discountPct ? `<span class="tag off">-${p.discountPct}%</span>` : '';
  const stock = !p.inStock ? '<span class="stock out">Out of stock</span>' : p.lowStock ? `<span class="stock low">Only ${p.stock} left</span>` : '<span class="stock in">In stock</span>';
  const rating = p.reviewCount ? `<div class="rating">${stars(p.rating)}<span>${p.rating} (${p.reviewCount})</span>${p.ratingIsSample ? '<span class="sample-note" title="Placeholder rating for the demo catalogue">sample</span>' : ''}</div>` : '<div class="rating"><span>No reviews yet</span></div>';
  return `<article class="pcard reveal">
    <a class="pimg" href="/product/${esc(p.slug)}" data-link aria-label="View ${esc(p.name)}">
      <img src="${esc(p.images[0] || '')}" alt="${esc(p.name)}" width="400" height="400" loading="lazy" decoding="async">
      <div class="pbadges">${off}${badge}</div>${!p.inStock ? '<div class="soldout-ov">Sold out</div>' : ''}
    </a>
    <button class="wish ${wish.has(p.id) ? 'on' : ''}" data-action="wish" data-id="${p.id}" aria-label="${wish.has(p.id) ? 'Remove from' : 'Add to'} wishlist" aria-pressed="${wish.has(p.id)}">${I.heart}</button>
    <div class="pbody">
      <span class="pcat">${esc(p.category)}</span>
      <h3 class="pname"><a href="/product/${esc(p.slug)}" data-link>${esc(p.name)}</a></h3>
      <p class="pdesc">${esc(p.shortDesc)}</p>
      ${rating}
      <div class="price"><b>${inr(p.price)}</b>${p.discountPct ? `<s>${inr(p.originalPrice)}</s><span class="pct">${p.discountPct}% off</span>` : ''}</div>
      ${stock}
      <div class="pactions">
        <a class="btn ghost sm view" href="/product/${esc(p.slug)}" data-link>View Details</a>
        <button class="btn sm" data-action="add" data-id="${p.id}" data-variants="${hasVariants ? 1 : 0}" data-slug="${esc(p.slug)}" ${!p.inStock ? 'disabled' : ''}>Add to Cart</button>
        <button class="btn lime sm" data-action="buy" data-id="${p.id}" data-variants="${hasVariants ? 1 : 0}" data-slug="${esc(p.slug)}" ${!p.inStock ? 'disabled' : ''}>Buy Now</button>
      </div>
    </div></article>`;
}

// ---------------- Cart detail + views ----------------
export async function cartDetail() {
  if (!cart.items.length) return { lines: [], empty: true, itemCount: 0 };
  const ids = [...new Set(cart.items.map((i) => i.productId))];
  const { products } = await api(`/products?ids=${ids.join(',')}`);
  const map = new Map(products.map((p) => [p.id, p]));
  const lines = cart.items.map((item) => {
    const p = map.get(item.productId);
    let problem = '';
    if (!p) problem = 'No longer available';
    else if (!p.inStock) problem = 'Out of stock';
    else if (item.qty > p.stock) problem = `Only ${p.stock} left in stock`;
    else if (p.sizes.length && !p.sizes.includes(item.size)) problem = 'Choose a size on the product page';
    else if (p.colors.length && !p.colors.includes(item.color)) problem = 'Choose a colour on the product page';
    return { item, key: cart.key(item), p, problem, max: p ? Math.max(1, Math.min(20, p.stock)) : 1 };
  });
  const ok = lines.filter((l) => !l.problem);
  const blocked = lines.some((l) => l.problem);
  let quote = null, couponError = '';
  if (ok.length && !blocked) {
    try { quote = (await api('/quote', { method: 'POST', body: { items: ok.map((l) => l.item), coupon: cart.coupon } })).quote; }
    catch (e) {
      if (cart.coupon && (e.fields?.coupon || /coupon/i.test(e.message))) { couponError = e.message; cart.setCoupon(''); try { quote = (await api('/quote', { method: 'POST', body: { items: ok.map((l) => l.item) } })).quote; } catch { /* fall through */ } }
    }
  }
  if (!quote) { // local estimate (checkout is blocked in this state)
    const cfg = await getConfig();
    const subtotal = ok.reduce((s, l) => s + l.p.price * l.item.qty, 0);
    const mrp = ok.reduce((s, l) => s + l.p.originalPrice * l.item.qty, 0);
    quote = { subtotal, mrpTotal: mrp, saved: mrp - subtotal, discount: 0, coupon: '', shipping: subtotal >= cfg.freeShippingAbove || !subtotal ? 0 : cfg.shippingFlat, total: 0, freeShippingAbove: cfg.freeShippingAbove };
    quote.total = quote.subtotal + quote.shipping;
  }
  return { lines, blocked, quote, couponError, itemCount: cart.count() };
}

export function cartBodyHtml(d, { page = false } = {}) {
  if (d.empty || !d.lines.length) {
    return { body: `<div class="empty"><svg viewBox="0 0 120 120" fill="none" aria-hidden="true"><circle cx="60" cy="60" r="56" fill="#e9eddc"/><path d="M34 44h52l-5 40H39z" fill="#c6f432" stroke="#0b0b0b" stroke-width="3" stroke-linejoin="round"/><path d="M48 44a12 12 0 0 1 24 0" stroke="#0b0b0b" stroke-width="3" stroke-linecap="round"/><circle cx="52" cy="62" r="2.5" fill="#0b0b0b"/><circle cx="68" cy="62" r="2.5" fill="#0b0b0b"/><path d="M53 72q7 5 14 0" stroke="#0b0b0b" stroke-width="3" stroke-linecap="round"/></svg><h3>Your cart is empty</h3><p>Looks like you haven't added anything yet. Find something you love!</p><button class="btn lime" data-action="continue">Continue Shopping</button></div>`, foot: '' };
  }
  const q = d.quote;
  const remaining = Math.max(0, q.freeShippingAbove - (q.subtotal - q.discount));
  const pct = Math.min(100, Math.round(((q.subtotal - q.discount) / q.freeShippingAbove) * 100));
  const lines = d.lines.map(({ item, key, p, problem, max }) => `
    <div class="line" data-key="${esc(key)}">
      <img src="${esc(p?.images[0] || '/ph/bag/888888/1.svg')}" alt="${esc(p?.name || 'Unavailable product')}" width="78" height="78" loading="lazy">
      <div><div class="ln-name">${p ? `<a href="/product/${esc(p.slug)}" data-link>${esc(p.name)}</a>` : 'Unavailable product'}</div>
        <div class="ln-var">${esc([item.size && `Size ${item.size}`, item.color].filter(Boolean).join(' / ')) || '&nbsp;'}</div>
        ${problem ? `<div class="ln-warn" role="alert">${esc(problem)}</div>` : ''}
        <div class="ln-row">
          <div class="qty" role="group" aria-label="Quantity">
            <button data-action="dec" data-key="${esc(key)}" aria-label="Decrease quantity" ${item.qty <= 1 ? 'disabled' : ''}>−</button><span aria-live="polite">${item.qty}</span>
            <button data-action="inc" data-key="${esc(key)}" aria-label="Increase quantity" ${p && item.qty >= max ? 'disabled' : ''}>+</button></div>
          <b>${p ? inr(p.price * item.qty) : ''}</b></div></div>
      <button class="rm" data-action="remove" data-key="${esc(key)}" aria-label="Remove ${esc(p?.name || 'item')} from cart">${I.trash}</button>
    </div>`).join('');
  const body = `${lines}`;
  const foot = `
    ${q.freeShippingAbove ? `<div><div class="ship-bar" aria-hidden="true"><i style="width:${pct}%"></i></div><p style="font-size:.8rem;margin-top:6px;color:var(--ink-2)">${remaining > 0 ? `Add <b>${inr(remaining)}</b> more for free shipping` : '<b>You get free shipping!</b>'}</p></div>` : ''}
    <form class="coupon-row" data-form="coupon"><input class="input" name="code" placeholder="Coupon code" value="${esc(q.coupon || '')}" aria-label="Coupon code" maxlength="30" ${q.coupon ? 'readonly' : ''}>
      ${q.coupon ? '<button class="btn ghost sm" type="button" data-action="coupon-remove">Remove</button>' : '<button class="btn ghost sm" type="submit">Apply</button>'}</form>
    ${d.couponError ? `<p class="errmsg" style="color:var(--danger);font-size:.8rem" role="alert">${esc(d.couponError)}</p>` : ''}
    <div class="sum">
      <div><span>Subtotal (${d.itemCount} item${d.itemCount === 1 ? '' : 's'})</span><span>${inr(q.subtotal)}</span></div>
      ${q.saved > 0 ? `<div class="save"><span>You save on MRP</span><span>-${inr(q.saved)}</span></div>` : ''}
      ${q.discount ? `<div class="save"><span>Coupon ${esc(q.coupon)}</span><span>-${inr(q.discount)}</span></div>` : ''}
      <div><span>Delivery</span><span>${q.shipping ? inr(q.shipping) : 'Free'}</span></div>
      <div class="tot"><span>Total</span><span>${inr(q.total)}</span></div></div>
    ${d.blocked ? '<p class="note err" role="alert">Fix the items marked above to continue.</p>' : ''}
    <button class="btn lime block" data-action="checkout" ${d.blocked ? 'disabled' : ''}>Proceed to Checkout</button>
    ${page ? '' : '<button class="btn ghost block" data-action="continue">Continue Shopping</button>'}`;
  return { body, foot };
}

export async function renderDrawer() {
  const d = $('#drawer');
  d.innerHTML = `<div class="drawer-head"><h2>Your Cart</h2><button class="iconbtn" data-action="cart-close" aria-label="Close cart">${I.close}</button></div><div class="drawer-body"><div class="skeleton" style="min-height:90px"></div></div>`;
  try {
    const det = await cartDetail();
    const { body, foot } = cartBodyHtml(det);
    d.innerHTML = `<div class="drawer-head"><h2>Your Cart${det.itemCount ? ` (${det.itemCount})` : ''}</h2><button class="iconbtn" data-action="cart-close" aria-label="Close cart">${I.close}</button></div><div class="drawer-body">${body}</div>${foot ? `<div class="drawer-foot">${foot}</div>` : ''}`;
  } catch (e) {
    d.innerHTML = `<div class="drawer-head"><h2>Your Cart</h2><button class="iconbtn" data-action="cart-close" aria-label="Close cart">${I.close}</button></div><div class="drawer-body"><div class="note err">${esc(e.message)}</div><button class="btn" data-action="cart-open">Retry</button></div>`;
  }
}

bus.addEventListener('cart', updateBadges);
bus.addEventListener('wish', updateBadges);
