'use strict';
// Sample catalogue. Every price, rating and review count here is SAMPLE data for the demo shop:
// ratings are flagged as samples in the UI, and the shop owner replaces products from /admin.
const { db, tx } = require('./db');
const { slugify } = require('./util');

const SIZES_CLOTH = ['S', 'M', 'L', 'XL'];
const SIZES_SHOE = ['6', '7', '8', '9', '10'];
// [name, short, long, category, mrp, price, icon, hex, sizes, colors, stock, badge, sampleRating, sampleCount, sold]
const P = [
  ['Street Core Hoodie', 'Heavyweight fleece, relaxed fit', 'A 380 GSM brushed-fleece hoodie with a roomy hood, kangaroo pocket and ribbed cuffs. Pre-washed so it keeps its shape.', 'Fashion', 2999, 1799, 'hoodie', 'e63946', SIZES_CLOTH, [], 24, 'Best Seller', 4.6, 128, 310],
  ['Lime Pulse Hoodie', 'Statement colour, soft inside', 'Our signature lime hoodie in a soft cotton-blend fleece. Dropped shoulders and a boxy cut for an easy everyday look.', 'Fashion', 3299, 1999, 'hoodie', '9ad40f', SIZES_CLOTH, [], 15, 'New', 4.4, 41, 88],
  ['Essential Black Tee', '100% combed cotton, everyday basic', 'A 220 GSM combed-cotton tee with a clean neckline and a slightly oversized fit. Wash-resistant print.', 'Fashion', 999, 599, 'tee', '151515', SIZES_CLOTH, [], 60, 'Popular', 4.5, 212, 540],
  ['Cloud White Tee', 'Soft, breathable, true white', 'Breathable cotton tee in crisp white. Holds colour wash after wash.', 'Fashion', 899, 549, 'tee', 'f2f2f2', SIZES_CLOTH, [], 48, '', 4.3, 76, 190],
  ['Graphic Drop Tee', 'Limited graphic print', 'Oversized tee with a bold front graphic in a limited run.', 'Fashion', 1299, 899, 'tee', '6c63ff', SIZES_CLOTH, [], 0, '', 4.1, 19, 70],
  ['Runner Pro Sneakers', 'Cushioned all-day comfort', 'Lightweight knit upper, responsive midsole and a grippy rubber outsole. Built for daily wear and light runs.', 'Footwear', 4999, 3299, 'sneaker', '2b2d42', SIZES_SHOE, [], 18, 'Best Seller', 4.7, 164, 260],
  ['Neon Edge Sneakers', 'Bold colour, easy style', 'Chunky-sole sneakers with lime accents and a padded collar.', 'Footwear', 5499, 3799, 'sneaker', 'c6f432', SIZES_SHOE, [], 9, 'New', 4.4, 33, 64],
  ['Trail Walk Shoes', 'Durable grip, light weight', 'Water-resistant upper with a deep-lug outsole for rough roads and light trails.', 'Footwear', 3999, 2599, 'sneaker', '7a5c3d', SIZES_SHOE, [], 22, '', 4.2, 58, 120],
  ['Urban Sling Bag', 'Compact, water-resistant', 'A slim cross-body sling with a hidden zip pocket and adjustable strap. Fits phone, wallet and earbuds.', 'Bags', 1499, 899, 'bag', '1f1f1f', [], [], 35, 'Popular', 4.5, 97, 230],
  ['Daily Commute Backpack', '22L, padded laptop sleeve', 'Fits a 15" laptop. Water-resistant fabric, breathable back panel and a hidden anti-theft pocket.', 'Bags', 2999, 1899, 'backpack', '3a86ff', [], ['Blue', 'Black', 'Grey'], 27, 'Best Seller', 4.6, 142, 280],
  ['Weekender Tote', 'Roomy canvas carry-all', 'Heavy canvas tote with reinforced handles and an inner zip pocket.', 'Bags', 1799, 1199, 'bag', 'd4a373', [], [], 14, '', 4.2, 44, 90],
  ['Minimal Analog Watch', 'Slim case, 3-year warranty', 'A slim 40 mm stainless steel case, scratch-resistant glass and a soft strap. Water resistant to 30 m.', 'Accessories', 3499, 1999, 'watch', '8d99ae', [], ['Silver', 'Black'], 20, 'Popular', 4.4, 88, 175],
  ['Aviator Sunglasses', 'UV400 polarized lenses', 'Lightweight metal frame with polarized UV400 lenses and a protective case.', 'Accessories', 1999, 999, 'sunglasses', '222222', [], [], 40, '', 4.3, 61, 140],
  ['Everyday Cap', 'Adjustable, washed cotton', 'Six-panel washed-cotton cap with an adjustable strap and embroidered logo.', 'Accessories', 699, 449, 'cap', '9ad40f', [], ['Lime', 'Black', 'White'], 55, 'New', 4.1, 27, 60],
  ['Sport Dad Cap', 'Breathable, quick-dry', 'Quick-dry fabric cap with a curved brim. Great for runs and travel.', 'Accessories', 599, 399, 'cap', '1d3557', [], [], 3, '', 4.0, 15, 40],
  ['AirBeat Wireless Headphones', '30-hour battery, deep bass', 'Over-ear Bluetooth 5.3 headphones with soft cushions, dual-device pairing and a built-in mic.', 'Electronics', 4999, 2799, 'headphones', '111111', [], ['Black', 'White'], 30, 'Best Seller', 4.5, 301, 420],
  ['Pocket Boom Speaker', 'Loud, portable, splash-proof', 'A pocketable Bluetooth speaker with 12-hour playtime and an IPX5 splash-proof shell.', 'Electronics', 2499, 1499, 'speaker', '2b9348', [], ['Green', 'Black'], 16, 'Trending', 4.4, 119, 215],
  ['ChargeUp Mini Earbuds', 'Compact case, clear calls', 'True wireless earbuds with a pocket-size charging case and clear call quality.', 'Electronics', 2999, 1599, 'headphones', 'e5e5e5', [], [], 26, 'Popular', 4.2, 93, 205],
  ['Steel Bottle 750ml', 'Keeps drinks cold 24h', 'Double-wall vacuum insulated stainless steel bottle. Leak-proof lid, fits car cup holders.', 'Home', 999, 649, 'bottle', '9ad40f', [], ['Lime', 'Black', 'Steel'], 70, 'Popular', 4.6, 180, 390],
  ['Ceramic Morning Mug', 'Matte glaze, 350ml', 'Hand-finished matte ceramic mug, microwave and dishwasher safe.', 'Home', 549, 349, 'mug', '1d1d1d', [], [], 80, '', 4.3, 52, 150],
  ['Glow Desk Lamp', 'Warm light, touch dimmer', 'Compact LED desk lamp with three brightness levels and a USB charging port.', 'Home', 1999, 1299, 'lamp', 'f4a261', [], [], 12, 'New', 4.2, 37, 55],
  ['Dusk Wireless Speaker', 'Room-filling 360° sound', 'A larger 20 W speaker with warm bass, 16-hour battery and USB-C charging.', 'Electronics', 3999, 2299, 'speaker', '5e60ce', [], [], 11, 'Trending', 4.5, 70, 110],
  ['Slate Zip Hoodie', 'Lightweight full-zip layer', 'A mid-weight full-zip hoodie that works indoors and out.', 'Fashion', 2499, 1599, 'hoodie', '4a5568', SIZES_CLOTH, [], 19, 'Trending', 4.3, 49, 135],
  ['Travel Duffel', '35L, expandable', 'Durable duffel with a shoe compartment, shoulder strap and expandable main pocket.', 'Bags', 2799, 1799, 'backpack', 'e76f51', [], [], 8, 'Trending', 4.4, 63, 98],
];


function seedIfEmpty({ force = false } = {}) {
  const n = db.prepare('SELECT COUNT(*) c FROM products').get().c;
  if (n > 0 && !force) return 0;
  tx(() => {
    if (force) db.exec('DELETE FROM products');
    const ins = db.prepare(`INSERT INTO products (slug,name,short_desc,description,category,original_price,price,images,sizes,colors,stock,badge,rating_seed,rating_seed_count,sold,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now', ?))`);
    P.forEach((p, i) => {
      const [name, short, long, cat, mrp, price, icon, hex, sizes, colors, stock, badge, rating, rcount, sold] = p;
      const images = [1, 2, 3].map((v) => `/ph/${icon}/${hex}/${v}.svg`);
      ins.run(slugify(name), name, short, long, cat, mrp, price, JSON.stringify(images), JSON.stringify(sizes), JSON.stringify(colors), stock, badge, rating, rcount, sold, `-${i} hours`);
    });
    const hasCoupons = db.prepare('SELECT COUNT(*) c FROM coupons').get().c;
    if (!hasCoupons) {
      const c = db.prepare('INSERT INTO coupons (code,type,value,min_subtotal) VALUES (?,?,?,?)');
      c.run('WELCOME10', 'percent', 10, 499);
      c.run('FLAT150', 'flat', 150, 1499);
    }
  });
  return P.length;
}
module.exports = { seedIfEmpty };
