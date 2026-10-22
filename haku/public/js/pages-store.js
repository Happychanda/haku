// Storefront pages: home, shop, product, wishlist, contact, policies, 404
import { $, $$, esc, inr, dt, I, stars, cart, wish, recent, api, getConfig, toast, withLoading, debounce } from './core.js';
import { productCard, navigate } from './ui.js';

const main = () => $('#main');
export const DELIVERY = '3–7 business days';
export const RETURN_DAYS = 7;

const skeletonGrid = (n = 8) => `<div class="grid">${Array.from({ length: n }, () => '<div class="skeleton"></div>').join('')}</div>`;
const errorBlock = (msg, retry = true) => `<div class="empty"><h3>Something went wrong</h3><p>${esc(msg)}</p>${retry ? '<button class="btn" data-action="reload">Try again</button>' : ''}</div>`;
const grid = (items) => `<div class="grid">${items.map(productCard).join('')}</div>`;
function section(id, eyebrow, title, items, link) {
  if (!items.length) return '';
  return `<section id="${id}"><div class="wrap"><div class="sec-head reveal"><div><div class="eyebrow">${esc(eyebrow)}</div><h2>${esc(title)}</h2></div>${link ? `<a class="link-arrow" href="${link}" data-link>View all</a>` : ''}</div>${grid(items)}</div></section>`;
}

// ---------------- Home ----------------
export async function home(ctx) {
  main().innerHTML = `<div class="wrap" style="padding-top:30px">${skeletonGrid(4)}</div>`;
  let products, cfg, latest;
  try {
    [products, cfg, latest] = await Promise.all([api('/products').then((r) => r.products), getConfig(), api('/reviews/latest').then((r) => r.reviews).catch(() => [])]);
  } catch (e) { main().innerHTML = errorBlock(e.message); return; }
  const by = (fn) => [...products].sort(fn);
  const best = by((a, b) => b.sold - a.sold);
  const heroP = best.find((p) => p.inStock) || best[0];
  const featured = by((a, b) => (b.rating * Math.log(b.sold + 2)) - (a.rating * Math.log(a.sold + 2))).slice(0, 8);
  const newest = by((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 8);
  const trending = products.filter((p) => p.badge === 'Trending').slice(0, 8);
  const deals = by((a, b) => b.discountPct - a.discountPct).filter((p) => p.discountPct).slice(0, 4);
  const catCards = cfg.categories.map((c) => {
    const p = products.find((x) => x.category === c.name);
    return `<a class="cat reveal" href="/shop?category=${encodeURIComponent(c.name)}" data-link><img src="${esc(p?.images[1] || p?.images[0] || '')}" alt="" width="300" height="300" loading="lazy"><span>${esc(c.name)} <i>${c.count}</i></span></a>`;
  }).join('');
  const promo = cfg.promotion;

  main().innerHTML = `
  <section class="hero"><div class="wrap">
    <h1 class="hero-enter" style="animation:none"><span style="display:block;animation:rise .8s var(--ease) both">Discover</span><span style="display:block;animation:rise .8s .08s var(--ease) both">Something <em>Special</em></span><span style="display:block;animation:rise .8s .16s var(--ease) both">at HAKU</span></h1>
    <div class="hero-grid">
      <div class="hero-text hero-enter">
        <p>Quality you can feel, prices that make sense, and a shopping experience that's quick and simple. From everyday fashion to smart gadgets, find it at HAKU.</p>
        <div class="hero-cta"><a class="btn lime" href="/shop" data-link>Shop Now</a><a class="btn ghost" href="#featured" data-action="scroll" data-target="featured">Explore Products</a></div>
        <ul style="list-style:none;padding:0;margin:0;display:grid;gap:8px;font-size:.9rem;font-weight:600"><li>${I.truck.replace('<svg', '<svg style="width:18px;height:18px;display:inline;vertical-align:-3px;margin-right:8px"')}Free shipping above ${inr(cfg.freeShippingAbove)}</li><li>${I.refresh.replace('<svg', '<svg style="width:18px;height:18px;display:inline;vertical-align:-3px;margin-right:8px"')}${RETURN_DAYS}-day easy returns</li><li>${I.cash.replace('<svg', '<svg style="width:18px;height:18px;display:inline;vertical-align:-3px;margin-right:8px"')}Pay on delivery</li></ul>
      </div>
      <a class="hero-main hero-enter" href="/product/${esc(heroP.slug)}" data-link aria-label="View ${esc(heroP.name)}">
        <div class="tile"><img src="${esc(heroP.images[1] || heroP.images[0])}" alt="${esc(heroP.name)}" width="800" height="800" fetchpriority="high"></div>
        <div class="rot-badge" aria-hidden="true"><svg viewBox="0 0 100 100"><defs><path id="c" d="M50 50m-37 0a37 37 0 1 1 74 0a37 37 0 1 1-74 0"/></defs><circle cx="50" cy="50" r="48" fill="#0b0b0b"/><text font-size="10.5" font-weight="800" fill="#c6f432" font-family="Archivo,Arial"><textPath href="#c" textLength="228" lengthAdjust="spacing">SHOP THE COLLECTION • HAKU • </textPath></text><path d="M42 38l22 12-22 12z" fill="#c6f432"/></svg></div>
        <div class="hero-chip"><small>${heroP.badge ? esc(heroP.badge) : 'Top pick'}</small><b>${esc(heroP.name)}</b><span><s>${inr(heroP.originalPrice)}</s><b>${inr(heroP.price)}</b></span></div>
      </a>
    </div>
  </div></section>

  <section id="categories" style="padding-top:20px"><div class="wrap"><div class="sec-head reveal"><div><div class="eyebrow">Browse</div><h2>Shop by Category</h2></div></div><div class="cats">${catCards}</div></div></section>
  ${section('featured', 'Hand-picked', 'Featured Products', featured, '/shop')}
  ${section('best', 'Customer favourites', 'Best Sellers', best.slice(0, 8), '/shop?sort=popular')}
  ${section('new', 'Just landed', 'New Arrivals', newest, '/shop?sort=newest')}
  ${section('trending', 'Hot right now', 'Trending Products', trending, '/shop')}

  <section id="offers"><div class="wrap"><div class="offer reveal">
    <div style="display:grid;gap:16px">
      <div class="eyebrow" style="color:#d6d6cf">Special offers</div>
      <h2>${promo ? esc(promo.title).replace(/(\S+)$/, '<em>$1</em>') : 'Save more <em>at HAKU</em>'}</h2>
      <p>${promo ? esc(promo.subtitle) : 'Use a coupon at checkout for extra savings on your order.'}</p>
      ${promo ? `<div class="countdown" id="cd" data-end="${esc(promo.endsAt)}" role="timer" aria-label="Time left in sale"><div><b data-u="d">00</b><small>Days</small></div><div><b data-u="h">00</b><small>Hours</small></div><div><b data-u="m">00</b><small>Mins</small></div><div><b data-u="s">00</b><small>Secs</small></div></div>` : ''}
      ${cfg.coupons.length ? `<div class="coupons">${cfg.coupons.map((c) => `<div class="coupon"><b>${esc(c.code)}</b><small>${c.type === 'percent' ? `${c.value}% off` : `${inr(c.value)} off`}${c.minSubtotal ? ` on orders above ${inr(c.minSubtotal)}` : ''}</small></div>`).join('')}</div>` : ''}
      <div><a class="btn lime" href="/shop?discount=1" data-link>Shop Discounted</a></div>
    </div>
    <div class="grid" style="grid-template-columns:repeat(2,1fr)">${deals.slice(0, 2).map(productCard).join('')}</div>
  </div></div></section>

  <section><div class="wrap"><div class="sec-head reveal"><div><div class="eyebrow">Reviews</div><h2>What Customers Say</h2></div></div>
    ${latest.length ? `<div class="reviews">${latest.map((r) => `<figure class="review reveal" style="margin:0">${stars(r.rating)}<q>${esc(r.comment)}</q><figcaption class="who"><b>${esc(r.name)}</b> on <a href="/product/${esc(r.slug)}" data-link><u>${esc(r.product)}</u></a></figcaption></figure>`).join('')}</div>`
      : `<div class="empty-card reveal"><h3 style="font-size:1.4rem">Be the first to review</h3><p style="color:var(--muted);max-width:46ch">Bought something from HAKU? Open the product and share your experience. Reviews appear here once approved.</p><a class="btn" href="/shop" data-link>Browse products</a></div>`}
  </div></section>

  <section><div class="wrap"><div class="sec-head reveal"><div><div class="eyebrow">Why us</div><h2>Why Choose HAKU</h2></div></div>
    <div class="why">
      <div class="reveal"><span class="ico">${I.shield}</span><h3>Quality checked</h3><p>Every product is inspected before it leaves our shelf.</p></div>
      <div class="reveal"><span class="ico">${I.truck}</span><h3>Fast delivery</h3><p>Delivered in ${DELIVERY}, free above ${inr(cfg.freeShippingAbove)}.</p></div>
      <div class="reveal"><span class="ico">${I.refresh}</span><h3>Easy returns</h3><p>${RETURN_DAYS}-day returns on eligible items. No awkward questions.</p></div>
      <div class="reveal"><span class="ico">${I.cash}</span><h3>Pay on delivery</h3><p>Cash on Delivery available on every order.</p></div>
    </div></div></section>

  <section><div class="wrap"><div class="news reveal"><div><div class="eyebrow">Newsletter</div><h2 style="margin-top:8px">Get offers first</h2></div><p style="max-width:50ch">New arrivals and exclusive discounts, straight to your inbox. No spam, unsubscribe anytime.</p>
    <form id="news-form" novalidate><label class="sr" for="news-email">Email address</label><input id="news-email" name="email" type="email" placeholder="you@example.com" autocomplete="email" required><button class="btn" type="submit">Subscribe</button></form><div class="msg" id="news-msg" role="status"></div></div></div></section>`;

  $('#news-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'), msg = $('#news-msg');
    await withLoading(btn, async () => {
      try { const r = await api('/newsletter', { method: 'POST', body: { email: e.target.email.value } }); msg.textContent = r.already ? "You're already subscribed. Thanks!" : "You're in! Watch your inbox for offers."; e.target.reset(); }
      catch (err) { msg.textContent = err.message; }
    });
  });
  const cd = $('#cd');
  if (cd) {
    const end = new Date(cd.dataset.end.replace(' ', 'T') + 'Z').getTime();
    const tick = () => {
      let s = Math.max(0, Math.floor((end - Date.now()) / 1000));
      const v = { d: Math.floor(s / 86400), h: Math.floor(s % 86400 / 3600), m: Math.floor(s % 3600 / 60), s: s % 60 };
      for (const k in v) cd.querySelector(`[data-u=${k}]`).textContent = String(v[k]).padStart(2, '0');
    };
    tick(); const t = setInterval(tick, 1000); ctx.cleanup(() => clearInterval(t));
  }
}

// ---------------- Shop ----------------
export async function shop(ctx) {
  const cfg = await getConfig();
  const params = () => new URLSearchParams(location.search);
  main().innerHTML = `<div class="page"><div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/" data-link>Home</a> / <span>Shop</span></nav>
    <h1 class="page-title" id="shop-title">Shop</h1>
    <div class="shop-layout">
      <aside class="filters" id="filters" aria-label="Product filters">
        <div class="field"><label for="f-q">Search</label><input class="input" id="f-q" type="search" placeholder="Name or keyword" autocomplete="off"></div>
        <div><h3>Category</h3><div class="chips" id="f-cats"></div></div>
        <div><h3>Price (₹)</h3><div class="row2"><input class="input" id="f-min" type="number" inputmode="numeric" min="0" placeholder="Min" aria-label="Minimum price"><input class="input" id="f-max" type="number" inputmode="numeric" min="0" placeholder="Max" aria-label="Maximum price"></div></div>
        <div class="field"><label for="f-rating">Rating</label><select class="input" id="f-rating"><option value="">All ratings</option><option value="4">4★ and up</option><option value="3">3★ and up</option></select></div>
        <label style="display:flex;gap:10px;align-items:center;font-weight:600"><input type="checkbox" id="f-disc" style="width:20px;height:20px;accent-color:#0b0b0b"> Discounted items only</label>
        <button class="btn ghost" id="f-clear" type="button">Clear filters</button>
      </aside>
      <div>
        <div class="toolbar"><button class="btn ghost sm filter-toggle" id="f-toggle" aria-expanded="false" aria-controls="filters">${I.filter} Filters</button><span class="count" id="count" role="status" aria-live="polite"></span>
          <div class="field" style="min-width:190px"><label class="sr" for="f-sort">Sort by</label><select class="input" id="f-sort"><option value="">Featured</option><option value="popular">Most popular</option><option value="newest">Newest arrivals</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="discount">Biggest discount</option></select></div></div>
        <div id="results"></div>
      </div></div></div></div>`;
  const state = () => ({ q: $('#f-q').value.trim(), category: $('#f-cats .on')?.dataset.cat || '', min: $('#f-min').value, max: $('#f-max').value, rating: $('#f-rating').value, discount: $('#f-disc').checked ? '1' : '', sort: $('#f-sort').value });
  $('#f-cats').innerHTML = `<button class="chip" data-cat="">All</button>` + cfg.categories.map((c) => `<button class="chip" data-cat="${esc(c.name)}">${esc(c.name)}</button>`).join('');
  const p0 = params();
  $('#f-q').value = p0.get('q') || ''; $('#f-min').value = p0.get('min') || ''; $('#f-max').value = p0.get('max') || '';
  $('#f-rating').value = p0.get('rating') || ''; $('#f-disc').checked = p0.get('discount') === '1'; $('#f-sort').value = p0.get('sort') || '';
  const setCat = (c) => $$('#f-cats .chip').forEach((b) => b.classList.toggle('on', b.dataset.cat === c));
  setCat(p0.get('category') || '');
  let seq = 0;
  async function load(push = true) {
    const s = state(); const qs = new URLSearchParams(); for (const k in s) if (s[k]) qs.set(k, s[k]);
    if (push) history.replaceState({}, '', '/shop' + (qs.toString() ? '?' + qs : ''));
    $('#shop-title').textContent = s.category || (s.q ? `Results for “${s.q}”` : 'Shop');
    const my = ++seq; $('#results').innerHTML = skeletonGrid(6);
    try {
      const { products } = await api('/products?' + qs);
      if (my !== seq) return;
      $('#count').textContent = `${products.length} product${products.length === 1 ? '' : 's'}`;
      $('#results').innerHTML = products.length ? grid(products) : `<div class="empty"><svg viewBox="0 0 120 120" fill="none" aria-hidden="true"><circle cx="60" cy="60" r="56" fill="#e9eddc"/><circle cx="54" cy="54" r="20" stroke="#0b0b0b" stroke-width="4"/><path d="m69 69 18 18" stroke="#0b0b0b" stroke-width="5" stroke-linecap="round"/><path d="M46 54h16" stroke="#0b0b0b" stroke-width="4" stroke-linecap="round"/></svg><h3>No products found</h3><p>We couldn't find anything matching those filters. Try removing a filter or searching for something else.</p><button class="btn lime" id="nores-clear">Clear filters</button></div>`;
      $('#nores-clear')?.addEventListener('click', clear);
      revealObserve();
    } catch (e) { if (my === seq) $('#results').innerHTML = errorBlock(e.message); }
  }
  function clear() { $('#f-q').value = ''; $('#f-min').value = ''; $('#f-max').value = ''; $('#f-rating').value = ''; $('#f-disc').checked = false; $('#f-sort').value = ''; setCat(''); load(); }
  const dl = debounce(load, 350);
  $('#f-q').addEventListener('input', dl); $('#f-min').addEventListener('input', dl); $('#f-max').addEventListener('input', dl);
  for (const id of ['#f-rating', '#f-disc', '#f-sort']) $(id).addEventListener('change', () => load());
  $('#f-cats').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; setCat(b.dataset.cat); load(); });
  $('#f-clear').addEventListener('click', clear);
  $('#f-toggle').addEventListener('click', (e) => { const o = $('#filters').classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', o); });
  load(false);
}

// ---------------- Product ----------------
export async function product(ctx, slug) {
  main().innerHTML = `<div class="page"><div class="wrap"><div class="pd"><div class="skeleton" style="aspect-ratio:1"></div><div class="skeleton"></div></div></div></div>`;
  let p;
  try { p = (await api('/products/' + encodeURIComponent(slug))).product; }
  catch (e) {
    if (e.status === 404) return notFound('That product is no longer available.');
    main().innerHTML = `<div class="page"><div class="wrap">${errorBlock(e.message)}</div></div>`; return;
  }
  const cfg = await getConfig();
  document.title = `${p.name} | HAKU`;
  recent.push(p.id);
  const imgs = p.images.length ? p.images : ['/ph/bag/888888/1.svg'];
  const maxQty = Math.max(1, Math.min(20, p.stock));
  const sel = { size: '', color: '', qty: 1, img: 0 };
  const recentIds = recent.ids.filter((id) => id !== p.id);
  const recents = recentIds.length ? (await api('/products?ids=' + recentIds.join(',')).then((r) => r.products).catch(() => [])) : [];
  const stockHtml = !p.inStock ? '<span class="stock out">Out of stock</span>' : p.lowStock ? `<span class="stock low">Hurry, only ${p.stock} left</span>` : '<span class="stock in">In stock</span>';
  main().innerHTML = `<div class="page"><div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/" data-link>Home</a> / <a href="/shop" data-link>Shop</a> / <a href="/shop?category=${encodeURIComponent(p.category)}" data-link>${esc(p.category)}</a> / <span>${esc(p.name)}</span></nav>
    <div class="pd">
      <div class="gallery"><div class="g-main" id="g-main"><img id="g-img" src="${esc(imgs[0])}" alt="${esc(p.name)}" width="800" height="800" fetchpriority="high"><div class="pbadges" style="top:12px;left:12px">${p.discountPct ? `<span class="tag off">-${p.discountPct}%</span>` : ''}${p.badge ? `<span class="tag lime">${esc(p.badge)}</span>` : ''}</div></div>
        ${imgs.length > 1 ? `<div class="thumbs" role="group" aria-label="Product images">${imgs.map((u, i) => `<button class="${i === 0 ? 'on' : ''}" data-i="${i}" aria-label="Show image ${i + 1}"><img src="${esc(u)}" alt="" width="120" height="120" loading="lazy"></button>`).join('')}</div>` : ''}</div>
      <div class="pd-info">
        <span class="pcat">${esc(p.category)}</span>
        <h1>${esc(p.name)}</h1>
        <div class="rating">${p.reviewCount ? `${stars(p.rating)}<span>${p.rating} · ${p.reviewCount} review${p.reviewCount === 1 ? '' : 's'}</span>${p.ratingIsSample ? '<span class="sample-note" title="Placeholder rating for the demo catalogue">sample rating</span>' : ''}` : '<span>No reviews yet</span>'}</div>
        <div class="pd-price"><b>${inr(p.price)}</b>${p.discountPct ? `<s>${inr(p.originalPrice)}</s><span class="pct tag lime">${p.discountPct}% off</span>` : ''}</div>
        <p style="color:var(--ink-2)">${esc(p.description || p.shortDesc)}</p>
        <div>${stockHtml}</div>
        <div class="opts">
          ${p.sizes.length ? `<div><div class="lbl" id="l-size" style="margin-bottom:8px">Size <span id="size-err" style="color:var(--danger);font-weight:600"></span></div><div class="opt-row" role="radiogroup" aria-labelledby="l-size">${p.sizes.map((s) => `<button class="opt" role="radio" aria-checked="false" data-size="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>` : ''}
          ${p.colors.length ? `<div><div class="lbl" id="l-color" style="margin-bottom:8px">Colour <span id="color-err" style="color:var(--danger);font-weight:600"></span></div><div class="opt-row" role="radiogroup" aria-labelledby="l-color">${p.colors.map((s) => `<button class="opt" role="radio" aria-checked="false" data-color="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>` : ''}
        </div>
        <div class="buy-row">
          <div class="qty" role="group" aria-label="Quantity"><button id="q-dec" aria-label="Decrease quantity" disabled>−</button><span id="q-val" aria-live="polite">1</span><button id="q-inc" aria-label="Increase quantity" ${maxQty <= 1 ? 'disabled' : ''}>+</button></div>
          <button class="btn" id="pd-add" ${!p.inStock ? 'disabled' : ''}>${p.inStock ? 'Add to Cart' : 'Out of stock'}</button>
          <button class="btn lime" id="pd-buy" ${!p.inStock ? 'disabled' : ''}>Buy Now</button>
        </div>
        <button class="btn ghost sm" data-action="wish" data-id="${p.id}" id="pd-wish" aria-pressed="${wish.has(p.id)}">${I.heart.replace('<svg', '<svg style="width:18px;height:18px"')} <span>${wish.has(p.id) ? 'Saved to wishlist' : 'Save to wishlist'}</span></button>
        <div class="info-boxes">
          <div class="info-box">${I.truck}<div><b>Delivery</b><span>Usually delivered in ${DELIVERY}. ${cfg.freeShippingAbove ? `Free delivery above ${inr(cfg.freeShippingAbove)}, otherwise ${inr(cfg.shippingFlat)}.` : ''}</span></div></div>
          <div class="info-box">${I.refresh}<div><b>Returns &amp; refunds</b><span>${RETURN_DAYS}-day returns on unused items in original packaging. <a href="/policy/returns" data-link><u>Read the policy</u></a></span></div></div>
          <div class="info-box">${I.cash}<div><b>Cash on Delivery</b><span>Pay when your order arrives.</span></div></div>
        </div>
      </div>
    </div>
    <section style="padding:40px 0 10px"><div class="sec-head"><h2 style="font-size:1.8rem">Customer Reviews</h2></div>
      <div class="tabs-body">
        ${p.reviews.length ? p.reviews.map((r) => `<div class="rev-item">${stars(r.rating)}<p>${esc(r.comment)}</p><small style="color:var(--muted)">${esc(r.name)} · ${dt(r.created_at, false)}</small></div>`).join('') : '<p style="color:var(--muted)">No customer reviews yet. Be the first to share your experience.</p>'}
        <details class="panel"><summary style="font-weight:800;cursor:pointer;min-height:28px">Write a review</summary>
          <form id="rev-form" class="admin-form" style="margin-top:14px" novalidate>
            <div class="field"><span class="lbl" id="rl">Your rating</span><div class="star-input" role="radiogroup" aria-labelledby="rl">${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="false" data-r="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">${I.star}</button>`).join('')}</div><span class="errmsg" data-err="rating"></span></div>
            <div class="field"><label for="rv-name">Your name</label><input class="input" id="rv-name" name="name" maxlength="60" autocomplete="name"><span class="errmsg" data-err="name"></span></div>
            <div class="field"><label for="rv-c">Your review</label><textarea class="input" id="rv-c" name="comment" maxlength="600"></textarea><span class="errmsg" data-err="comment"></span></div>
            <button class="btn" type="submit">Submit review</button><div id="rev-msg" role="status"></div></form></details>
      </div></section>
    ${p.related.length ? `<section style="padding:30px 0 10px"><div class="sec-head"><h2 style="font-size:1.8rem">Related Products</h2></div>${grid(p.related)}</section>` : ''}
    ${recents.length ? `<section style="padding:30px 0 10px"><div class="sec-head"><h2 style="font-size:1.8rem">Recently Viewed</h2></div>${grid(recents.slice(0, 4))}</section>` : ''}
  </div></div>`;

  // gallery
  const gm = $('#g-main'), gi = $('#g-img');
  $$('.thumbs button').forEach((b) => b.addEventListener('click', () => { sel.img = +b.dataset.i; gi.src = imgs[sel.img]; $$('.thumbs button').forEach((x) => x.classList.toggle('on', x === b)); }));
  gm.addEventListener('click', () => gm.classList.toggle('zoom'));
  gm.addEventListener('mousemove', (e) => { if (!gm.classList.contains('zoom')) return; const r = gm.getBoundingClientRect(); gm.style.setProperty('--zx', `${((e.clientX - r.left) / r.width) * 100}%`); gm.style.setProperty('--zy', `${((e.clientY - r.top) / r.height) * 100}%`); });
  gm.addEventListener('mouseleave', () => gm.classList.remove('zoom'));
  // options
  $$('.opt').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.size !== undefined ? 'size' : 'color'; sel[k] = b.dataset[k];
    $$(`.opt[data-${k}]`).forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
    const err = $(`#${k}-err`); if (err) err.textContent = '';
  }));
  // quantity
  const setQ = (n) => { sel.qty = Math.max(1, Math.min(maxQty, n)); $('#q-val').textContent = sel.qty; $('#q-dec').disabled = sel.qty <= 1; $('#q-inc').disabled = sel.qty >= maxQty; };
  $('#q-dec').addEventListener('click', () => setQ(sel.qty - 1)); $('#q-inc').addEventListener('click', () => { if (sel.qty >= maxQty) toast(`Only ${maxQty} available`, 'err'); setQ(sel.qty + 1); });
  const valid = () => {
    let ok = true;
    if (p.sizes.length && !sel.size) { $('#size-err').textContent = '· please choose a size'; ok = false; }
    if (p.colors.length && !sel.color) { $('#color-err').textContent = '· please choose a colour'; ok = false; }
    if (!ok) { toast('Please choose your options first', 'err'); $('.opts').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    return ok;
  };
  $('#pd-add').addEventListener('click', () => { if (!valid()) return; const inCart = cart.items.filter((i) => i.productId === p.id).reduce((s, i) => s + i.qty, 0); if (inCart + sel.qty > p.stock) { toast(`Only ${p.stock} in stock (you have ${inCart} in your cart)`, 'err'); return; } cart.add(p.id, sel.qty, sel.size, sel.color, p.stock); toast(`${p.name} added to cart`); });
  $('#pd-buy').addEventListener('click', () => { if (!valid()) return; cart.items = cart.items.filter((i) => !(i.productId === p.id && i.size === sel.size && i.color === sel.color)); cart.add(p.id, sel.qty, sel.size, sel.color, p.stock); navigate('/checkout'); });
  // review form
  let rating = 0;
  $$('.star-input button').forEach((b) => b.addEventListener('click', () => { rating = +b.dataset.r; $$('.star-input button').forEach((x) => { x.classList.toggle('on', +x.dataset.r <= rating); x.setAttribute('aria-checked', +x.dataset.r === rating); }); }));
  $('#rev-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; $$('[data-err]', f).forEach((x) => (x.textContent = ''));
    await withLoading(f.querySelector('button[type=submit]'), async () => {
      try { const r = await api(`/products/${p.id}/reviews`, { method: 'POST', body: { name: f.name.value, rating, comment: f.comment.value } }); $('#rev-msg').innerHTML = `<div class="note ok">${esc(r.message)}</div>`; f.reset(); rating = 0; $$('.star-input button').forEach((x) => x.classList.remove('on')); }
      catch (err) { for (const k in (err.fields || {})) { const el = f.querySelector(`[data-err=${k}]`); if (el) el.textContent = err.fields[k]; } if (!err.fields) $('#rev-msg').innerHTML = `<div class="note err">${esc(err.message)}</div>`; }
    });
  });
  revealObserve();
}

// ---------------- Wishlist ----------------
export async function wishlist() {
  main().innerHTML = `<div class="page"><div class="wrap"><h1 class="page-title">Wishlist</h1><div id="wl">${skeletonGrid(4)}</div></div></div>`;
  if (!wish.ids.length) { $('#wl').innerHTML = `<div class="empty"><svg viewBox="0 0 120 120" fill="none" aria-hidden="true"><circle cx="60" cy="60" r="56" fill="#e9eddc"/><path d="M60 88S34 72 34 52a14 14 0 0 1 26-7 14 14 0 0 1 26 7c0 20-26 36-26 36z" fill="#c6f432" stroke="#0b0b0b" stroke-width="3" stroke-linejoin="round"/></svg><h3>Your wishlist is empty</h3><p>Tap the heart on any product to save it for later.</p><a class="btn lime" href="/shop" data-link>Explore products</a></div>`; return; }
  try {
    const { products } = await api('/products?ids=' + wish.ids.join(','));
    $('#wl').innerHTML = products.length ? grid(products) : '<div class="empty"><h3>Nothing here</h3><p>The products on your wishlist are no longer available.</p><a class="btn lime" href="/shop" data-link>Browse shop</a></div>';
    revealObserve();
  } catch (e) { $('#wl').innerHTML = errorBlock(e.message); }
}

// ---------------- Contact ----------------
const FAQ = [
  ['How long does delivery take?', `Most orders arrive in ${DELIVERY} depending on your location. You can follow progress anytime on the Track Order page.`],
  ['Can I pay on delivery?', 'Yes. Cash on Delivery is available on every order. Online payments are not enabled yet.'],
  ['How do returns work?', `You can return unused items in their original packaging within ${RETURN_DAYS} days of delivery. Contact us with your order ID and we will arrange the return.`],
  ['Can I cancel my order?', 'Yes, until it has shipped. Open Track Order, enter your order details, and send a cancellation request. You can also contact us directly.'],
  ['I did not get an order update. What do I do?', 'Check the Track Order page with your order ID and the email or phone you used at checkout. If something looks wrong, send us a message below.'],
];
export async function contact() {
  const cfg = await getConfig(); const s = cfg.shop;
  main().innerHTML = `<div class="page"><div class="wrap"><nav class="crumbs"><a href="/" data-link>Home</a> / <span>Contact</span></nav><h1 class="page-title">Contact Us</h1>
    <p style="color:var(--ink-2);max-width:56ch;margin-bottom:22px">Questions about an order, a product, or anything else? Send us a message and we'll get back to you, usually within one working day.</p>
    <div class="contact-grid">
      <div class="panel"><div class="contact-list">
        <div>${I.mail}<div><b>Email</b><small><a href="mailto:${esc(s.email)}"><u>${esc(s.email)}</u></a></small></div></div>
        ${s.phone ? `<div>${I.phone}<div><b>Phone</b><small><a href="tel:${esc(s.phone.replace(/[^+\d]/g, ''))}">${esc(s.phone)}</a></small></div></div>` : ''}
        ${s.address ? `<div>${I.pin}<div><b>Address</b><small>${esc(s.address)}</small></div></div>` : ''}
        ${s.whatsapp ? `<div>${I.wa}<div><b>WhatsApp</b><small><a href="https://wa.me/${esc(s.whatsapp)}" target="_blank" rel="noopener"><u>Chat with us</u></a></small></div></div>` : ''}
        <div>${I.box}<div><b>Order help</b><small>Use <a href="/track" data-link><u>Track Order</u></a> for live status.</small></div></div></div></div>
      <form class="panel admin-form" id="contact-form" novalidate>
        <div class="row2"><div class="field"><label for="c-name">Name *</label><input class="input" id="c-name" name="name" autocomplete="name" maxlength="80"><span class="errmsg" data-err="name"></span></div><div class="field"><label for="c-email">Email *</label><input class="input" id="c-email" name="email" type="email" autocomplete="email" maxlength="120"><span class="errmsg" data-err="email"></span></div></div>
        <div class="row2"><div class="field"><label for="c-phone">Phone (optional)</label><input class="input" id="c-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="20"><span class="errmsg" data-err="phone"></span></div><div class="field"><label for="c-subj">Subject *</label><input class="input" id="c-subj" name="subject" maxlength="120"><span class="errmsg" data-err="subject"></span></div></div>
        <div class="field"><label for="c-msg">Message *</label><textarea class="input" id="c-msg" name="message" maxlength="2000"></textarea><span class="errmsg" data-err="message"></span></div>
        <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">
        <button class="btn lime" type="submit">Send message</button><div id="c-msg-out" role="status"></div></form>
    </div>
    <section class="faq" style="padding-top:44px"><h2 class="page-title" style="font-size:2rem">FAQ</h2>${FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section></div></div>`;
  $('#contact-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; $$('[data-err]', f).forEach((x) => { x.textContent = ''; x.closest('.field')?.classList.remove('err'); }); $('#c-msg-out').innerHTML = '';
    await withLoading(f.querySelector('button[type=submit]'), async () => {
      try {
        const r = await api('/contact', { method: 'POST', body: Object.fromEntries(new FormData(f)) });
        $('#c-msg-out').innerHTML = r.emailSent ? '<div class="note ok">Thanks! Your message has been sent. We will reply soon.</div>' : `<div class="note warn">Your message was saved, but we could not email it to the team right now. Please also reach us at ${esc(s.email)}.</div>`;
        f.reset();
      } catch (err) {
        for (const k in (err.fields || {})) { const el = f.querySelector(`[data-err=${k}]`); if (el) { el.textContent = err.fields[k]; el.closest('.field').classList.add('err'); } }
        $('#c-msg-out').innerHTML = `<div class="note err" role="alert">${esc(err.message)}</div>`;
      }
    });
  });
}

// ---------------- Policies ----------------
export async function policy(name) {
  const cfg = await getConfig(); const s = cfg.shop;
  const P = {
    shipping: ['Shipping Policy', [
      ['Delivery time', `Orders are delivered in ${DELIVERY} across India, depending on location.`],
      ['Shipping charges', `Delivery is free on orders above ${inr(cfg.freeShippingAbove)}. Below that, a flat charge of ${inr(cfg.shippingFlat)} applies. The exact amount is shown at checkout before you place the order.`],
      ['Tracking', 'You can follow your order any time on the Track Order page using your order ID and the email or phone number from checkout.'],
      ['Delays', 'Weather, festivals and courier issues can occasionally cause delays. If your order is late, contact us and we will help.']]],
    returns: ['Return & Refund Policy', [
      ['Returns', `You can return eligible items within ${RETURN_DAYS} days of delivery if they are unused, unwashed and in original packaging with tags.`],
      ['How to return', `Email ${s.email} with your order ID and the reason. We will confirm and arrange the pickup or tell you where to send the item.`],
      ['Refunds', 'Once we receive and inspect the item, we refund the amount you paid. For Cash on Delivery orders we will arrange the refund to your bank or UPI account.'],
      ['Non-returnable items', 'Items damaged by misuse, and products marked as non-returnable on their page, cannot be returned.']]],
    privacy: ['Privacy Policy', [
      ['What we collect', 'When you order we collect your name, email, phone number and delivery address so we can deliver and support your order. If you subscribe to the newsletter we store your email.'],
      ['How we use it', 'We use your details only to process and deliver orders, answer your questions, and (if you subscribed) send offers. We do not sell your personal data.'],
      ['Storage and security', 'Your order information is stored on our server and is only visible to authorised shop staff. Order tracking requires both your order ID and the email or phone you used at checkout.'],
      ['Your choices', `You can ask us to correct or delete your data, or unsubscribe from the newsletter, by emailing ${s.email}.`]]],
    terms: ['Terms & Conditions', [
      ['Orders', 'An order is accepted when you receive an order ID after checkout. We may cancel an order if an item is out of stock or an address cannot be served, and will let you know.'],
      ['Prices', 'Prices are in Indian Rupees and are calculated by our server at checkout. We make every effort to keep prices correct; if we find an error we will contact you before processing the order.'],
      ['Payment', 'Cash on Delivery is currently the only payment method. Payment is collected when the order is delivered.'],
      ['Contact', `Questions about these terms? Write to ${s.email}.`]]],
  };
  const d = P[name];
  if (!d) return notFound();
  document.title = `${d[0]} | HAKU`;
  main().innerHTML = `<div class="page"><div class="wrap"><nav class="crumbs"><a href="/" data-link>Home</a> / <span>${esc(d[0])}</span></nav><h1 class="page-title">${esc(d[0])}</h1><div class="prose">${d[1].map(([h, t]) => `<h2>${esc(h)}</h2><p>${esc(t)}</p>`).join('')}<p style="color:var(--muted);font-size:.85rem">Last updated ${new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}.</p></div></div></div>`;
}

export function notFound(msg = "The page you're looking for doesn't exist or has moved.") {
  document.title = 'Page not found | HAKU';
  main().innerHTML = `<div class="page"><div class="wrap"><div class="empty"><div class="page-title" style="font-size:clamp(5rem,24vw,12rem);margin:0">404</div><h3>Nothing here</h3><p>${esc(msg)}</p><div class="hero-cta"><a class="btn lime" href="/" data-link>Back to home</a><a class="btn ghost" href="/shop" data-link>Browse shop</a></div></div></div></div>`;
}

// ---------------- Scroll reveal ----------------
let io;
export function revealObserve() {
  const els = $$('.reveal:not(.in)');
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) { els.forEach((e) => e.classList.add('in')); return; }
  io ||= new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  els.forEach((e) => io.observe(e));
}
