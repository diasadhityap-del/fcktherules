/* Membuat halaman pratinjau per produk, supaya link produk (misal https://fucktherules.my.id/sweet-chaos)
   tampil sebagai kartu produk (gambar, judul, harga, deskripsi) di WhatsApp, Instagram, Telegram, dan sejenisnya.
   Penyebabnya: pembaca pratinjau tidak menjalankan JavaScript, jadi mereka hanya membaca tag <meta> di HTML.
   Skrip ini membaca koleksi "produk" dan "aksesoris" (publik) lalu menulis /<slug>/index.html dari index.html
   dengan tag <meta> khusus produk tersebut. Pengunjung tetap mendapat toko yang sama (SPA membaca alamatnya).
   Dijalankan otomatis oleh .github/workflows/pratinjau-produk.yml. */
import fs from 'node:fs';
import path from 'node:path';

const PROJECT = 'fvcktherules-store';
const API_KEY = 'AIzaSyCVL_C4opQiKC6fNG_Rw4l-519rQZICH58';   // kunci web publik (sama dengan firebase.js), bukan rahasia
const SITE = 'https://fucktherules.my.id';
const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, '.pratinjau-produk.json');
const RESERVED = new Set(['', 'preorder', 'katalog', 'arsip', 'galeri', 'tentang', 'pantau', 'resi', 'pelunasan', 'keranjang', 'admin', 'journal', 'berita', 'diskusi', 'tools', 'assets']);

/* sama persis dengan slugify() di script.js, agar alamatnya cocok dengan yang dibaca situs */
const slugify = t => String(t).toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').trim();
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const DESKRIPSI = 'Fuck the Rules';
/* gambar Cloudinary dikecilkan jadi JPG 1200x630 (WhatsApp menolak gambar besar dan jatuh ke ikon situs) */
const kecil = u => /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(u) && !/\/upload\/[^/]*(w_|c_pad)/.test(u)
  ? u.replace('/image/upload/', '/image/upload/c_pad,b_white,w_1200,h_630,f_jpg,q_auto:eco/').replace(/\.(png|webp|gif)(\?.*)?$/i, '.jpg') : u;
const rupiah = v => 'Rp' + Number(String(v).replace(/\D/g, '') || 0).toLocaleString('id-ID');

/* ---- baca Firestore lewat REST ---- */
function nilai(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(nilai);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, nilai(x)]));
  return null;
}
async function baca(koleksi) {
  const hasil = []; let token = '';
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${koleksi}?pageSize=300&key=${API_KEY}${token ? '&pageToken=' + encodeURIComponent(token) : ''}`;
    const r = await fetch(url, { headers: { Referer: SITE + '/', Origin: SITE } });
    if (!r.ok) throw new Error(`${koleksi}: HTTP ${r.status}` + (r.status === 403 ? ' (kunci API dibatasi? tambahkan fucktherules.my.id dan *.github.io pada pembatasan referrer, atau hapus pembatasan)' : ''));
    const j = await r.json();
    for (const d of j.documents || []) hasil.push({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, nilai(x)])) });
    token = j.nextPageToken || '';
  } while (token);
  return hasil;
}

/* ---- isi pratinjau ---- */
function setMeta(html, attr, nama, isi) {
  const re = new RegExp(`(<meta\\s+${attr}="${nama.replace(/[:.]/g, '\\$&')}"\\s+content=")[^"]*(")`);
  return re.test(html) ? html.replace(re, `$1${esc(isi)}$2`) : html.replace('</head>', `<meta ${attr}="${nama}" content="${esc(isi)}">\n</head>`);
}
function bangun(templat, p, slug) {
  const url = `${SITE}/${slug}`, judulTab = `${p.nama} | FvcktheRules`;
  const gambar = /^https:\/\//.test(p.thumbnail || '') ? kecil(p.thumbnail) : `${SITE}/og-default.jpg`;
  let h = templat.replace('src="ftr-track.js"', 'src="/ftr-track.js"');   // alamat relatif akan rusak di /<slug>/
  h = h.replace(/<title>[^<]*<\/title>/, `<title>${esc(judulTab)}</title>`);
  h = h.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${esc(url)}$2`);
  /* kartu pratinjau: judul = nama produk, deskripsi = "Fuck the Rules" (sama di IG, WA, Telegram, dll). Deskripsi lama dibuang lalu ditulis ulang. */
  h = h.replace(/\s*<meta\s+(?:property="og:description"|name="twitter:description"|name="description")[^>]*>/g, '');
  for (const [attr, nama, isi] of [
    ['property', 'og:title', p.nama], ['property', 'og:image', gambar], ['property', 'og:image:alt', p.nama],
    ['property', 'og:url', url], ['property', 'og:type', 'product'],
    ['property', 'og:description', DESKRIPSI], ['name', 'description', DESKRIPSI],
    ['name', 'twitter:title', p.nama], ['name', 'twitter:description', DESKRIPSI], ['name', 'twitter:image', gambar]
  ]) h = setMeta(h, attr, nama, isi);
  h = h.replace(/<meta property="og:image:(width|height)"[^>]*>\s*/g, '');     // ukuran gambar default tidak berlaku untuk gambar produk
  if (gambar !== `${SITE}/og-default.jpg`) h = h.replace('</head>', `<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n</head>`);
  h = h.replace('</head>', `<meta property="product:price:amount" content="${esc(String(p.harga || '').replace(/\D/g, ''))}">\n<meta property="product:price:currency" content="IDR">\n</head>`);
  return h;
}

async function main() {
  const templat = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const fixture = process.env.PRATINJAU_FIXTURE;
  const semua = fixture ? JSON.parse(fs.readFileSync(fixture, 'utf8')) : [...await baca('produk'), ...await baca('aksesoris')];
  const lama = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : [];
  const dibuat = [], dilewati = [];

  for (const p of semua) {
    const slug = p.nama ? slugify(p.nama) : '';
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || RESERVED.has(slug)) { dilewati.push(`${p.nama || p.id}: nama tidak aman dijadikan alamat`); continue; }
    if (dibuat.includes(slug)) { dilewati.push(`${p.nama}: alamat kembar`); continue; }
    const dir = path.join(ROOT, slug), file = path.join(dir, 'index.html');
    if (fs.existsSync(dir) && !lama.includes(slug)) { dilewati.push(`${p.nama}: /${slug} sudah dipakai file lain`); continue; }
    const isi = bangun(templat, p, slug);
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== isi) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, isi); }
    dibuat.push(slug);
  }
  for (const slug of lama) {          // produk yang sudah dihapus: bersihkan halamannya
    if (dibuat.includes(slug) || !/^[a-z0-9-]+$/.test(slug)) continue;
    const dir = path.join(ROOT, slug);
    if (fs.existsSync(dir) && fs.readdirSync(dir).join() === 'index.html') fs.rmSync(dir, { recursive: true });
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(dibuat.sort(), null, 2) + '\n');
  console.log(`Halaman pratinjau: ${dibuat.length} produk.` + (dilewati.length ? `\nDilewati:\n- ${dilewati.join('\n- ')}` : ''));
}
main().catch(e => { console.error('Gagal:', e.message); process.exit(1); });
