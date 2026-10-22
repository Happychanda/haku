// App bootstrap: routing + global event delegation
import { $, $$, cart, wish, api, toast, bus, getConfig, esc } from './core.js';
import { mountChrome, markNav, navigate, openMenu, closeMenu, openSearch, closeSearch, openCart, closeCart, closeAllPanels, renderDrawer, drawerOpen, updateBadges } from './ui.js';
import { home, shop, product, wishlist, contact, policy, notFound, revealObserve } from './pages-store.js';
import { cartPage, renderCartPage, checkout, confirmation, track } from './pages-order.js';
import { admin } from './admin.js';

let cleanups = [];
const ctx = { cleanup: (fn) => cleanups.push(fn) };
let renderSeq = 0;

async function route() {
  cleanups.forEach((f) => { try { f(); } catch { /* ignore */ } }); cleanups = [];
  closeAllPanels();
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const my = ++renderSeq;
  document.title = 'HAKU – Discover Something Special';
  markNav(path);
  let m;
  try {
    if (path === '/') await home(ctx);
    else if (path === '/shop') await shop(ctx);
    else if ((m = path.match(/^\/product\/([^/]+)$/))) await product(ctx, decodeURIComponent(m[1]));
    else if (path === '/cart') await cartPage();
    else if (path === '/checkout') await checkout();
    else if ((m = path.match(/^\/order\/([A-Za-z0-9-]+)$/))) await confirmation(m[1]);
    else if (path === '/track') await track();
    else if (path === '/contact') await contact();
    else if (path === '/wishlist') await wishlist();
    else if ((m = path.match(/^\/policy\/([a-z-]+)$/))) await policy(m[1]);
    else if (path === '/admin') await admin();
    else notFound();
  } catch (e) {
    console.error(e);
    if (my === renderSeq) $('#main').innerHTML = `<div class="page"><div class="wrap"><div class="empty"><h3>Something went wrong</h3><p>${esc(e.message || 'Please try again.')}</p><button class="btn" data-action="reload">Try again</button></div></div></div>`;
  }
  if (my !== renderSeq) return;
  revealObserve();
  const hash = location.hash.slice(1);
  if (hash) { setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' }), 60); }
  else if (!history.state?.keepScroll) window.scrollTo({ top: 0, behavior: 'instant' });
}

// ----- link interception (client-side navigation) -----
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (a && !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
    const u = new URL(a.href, location.href);
    if (u.origin === location.origin) { e.preventDefault(); if (u.pathname + u.search + u.hash !== location.pathname + location.search + location.hash) navigate(u.pathname + u.search + u.hash); else if (!u.hash) window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }
});
window.addEventListener('popstate', route);
window.addEventListener('haku:route', route);

// ----- actions -----
async function fetchProduct(id) { return (await api('/products/' + id)).product; }
async function afterCartChange() {
  if (drawerOpen()) await renderDrawer();
  if ($('#cart-page')) await renderCartPage();
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) { if (e.target.id === 'overlay') closeAllPanels(); return; }
  const a = el.dataset.action;
  switch (a) {
    case 'menu': openMenu(); break;
    case 'menu-close': closeMenu(); break;
    case 'search-open': openSearch(); break;
    case 'search-close': closeSearch(); break;
    case 'cart-open': await openCart(); break;
    case 'cart-close': closeCart(); break;
    case 'reload': route(); break;
    case 'continue': closeCart(); navigate('/shop'); break;
    case 'scroll': e.preventDefault(); document.getElementById(el.dataset.target)?.scrollIntoView({ behavior: 'smooth' }); break;
    case 'checkout': closeCart(); navigate('/checkout'); break;
    case 'wish': {
      e.preventDefault(); const id = +el.dataset.id; const on = wish.toggle(id);
      $$(`[data-action=wish][data-id="${id}"]`).forEach((b) => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); if (b.id === 'pd-wish') b.querySelector('span').textContent = on ? 'Saved to wishlist' : 'Save to wishlist'; else b.setAttribute('aria-label', on ? 'Remove from wishlist' : 'Add to wishlist'); });
      toast(on ? 'Saved to wishlist' : 'Removed from wishlist');
      if (location.pathname === '/wishlist' && !on) wishlist();
      break;
    }
    case 'add': case 'buy': {
      const id = +el.dataset.id;
      if (el.dataset.variants === '1') { toast('Choose your size or colour first'); navigate('/product/' + el.dataset.slug); break; }
      try {
        const p = await fetchProduct(id);
        if (!p.inStock) { toast('Sorry, that item is out of stock', 'err'); break; }
        const have = cart.items.filter((i) => i.productId === id).reduce((s, i) => s + i.qty, 0);
        if (a === 'buy') { cart.items = cart.items.filter((i) => i.productId !== id); cart.add(id, 1, '', '', p.stock); navigate('/checkout'); break; }
        if (have >= p.stock) { toast(`Only ${p.stock} in stock and you already have them in your cart`, 'err'); break; }
        cart.add(id, 1, '', '', p.stock); toast(`${p.name} added to cart`);
      } catch (err) { toast(err.message, 'err'); }
      break;
    }
    case 'inc': case 'dec': {
      const item = cart.items.find((i) => cart.key(i) === el.dataset.key); if (!item) break;
      cart.setQty(el.dataset.key, item.qty + (a === 'inc' ? 1 : -1)); await afterCartChange(); break;
    }
    case 'remove': {
      const key = el.dataset.key; const line = el.closest('.line'); const it = cart.items.find((i) => cart.key(i) === key);
      line?.classList.add('gone'); await new Promise((r) => setTimeout(r, 260));
      cart.remove(key); toast('Item removed from cart'); await afterCartChange(); void it; break;
    }
    case 'coupon-remove': cart.setCoupon(''); await afterCartChange(); break;
  }
});

document.addEventListener('submit', async (e) => {
  if (e.target.id === 'searchbar') {
    e.preventDefault(); const q = $('#search-input').value.trim(); closeSearch(); if (q) navigate('/shop?q=' + encodeURIComponent(q)); $('#search-input').value = '';
  }
  if (e.target.dataset.form === 'coupon') {
    e.preventDefault(); const code = e.target.code.value.trim().toUpperCase(); if (!code) return;
    cart.setCoupon(code); await afterCartChange();
    const bad = $('[role=alert].errmsg'); if (!bad) toast(`Coupon ${code} applied`);
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllPanels(); });

// storage sync across tabs
window.addEventListener('storage', (ev) => { if (ev.key === 'haku.cart') { try { cart.items = JSON.parse(ev.newValue) || []; } catch { cart.items = []; } updateBadges(); } });

(async function boot() {
  try { await mountChrome(); } catch (e) { $('#main').innerHTML = `<div class="page"><div class="wrap"><div class="empty"><h3>We can't reach the shop right now</h3><p>${esc(e.message)}</p><button class="btn" onclick="location.reload()">Reload</button></div></div></div>`; return; }
  route();
})();
