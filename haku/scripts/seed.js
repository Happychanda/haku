'use strict';
// node scripts/seed.js          -> seeds sample products only if the catalogue is empty
// node scripts/seed.js --force  -> wipes products and re-seeds (orders are never touched)
const { seedIfEmpty } = require('../lib/seed');
const n = seedIfEmpty({ force: process.argv.includes('--force') });
console.log(n ? `Seeded ${n} sample products and the WELCOME10 / FLAT150 coupons.` : 'Catalogue already has products. Use --force to re-seed.');
