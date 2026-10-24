/* ============================================================================
   FvcktheRules — API Pembayaran (Midtrans Snap) di Cloudflare Workers
   ----------------------------------------------------------------------------
   Endpoint:
     GET  /config   -> client key + mode (dipakai browser untuk memuat Snap.js)
     POST /snap     -> {kode, tahap:'F'|'P'}  buat transaksi Snap, balas token
                       F = pembayaran awal (lunas / DP), P = pelunasan sisa DP
     POST /sync     -> {kode, tahap}  tanya status ke Midtrans lalu update order
     POST /notify   -> webhook dari Midtrans (diverifikasi signature + dicek ulang ke API Midtrans)

   Secret (dari GitHub Secrets, TIDAK ada di kode):
     MIDTRANS_SERVER_KEY, MIDTRANS_CLIENT_KEY, FIREBASE_SERVICE_ACCOUNT
   ========================================================================== */

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

/* ---------- Midtrans ---------- */
const isProd = env => !String(env.MIDTRANS_SERVER_KEY || '').startsWith('SB-');   // key sandbox diawali "SB-"
const apiBase = env => isProd(env) ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
const snapBase = env => isProd(env) ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';
const midAuth = env => 'Basic ' + btoa(env.MIDTRANS_SERVER_KEY + ':');

async function midtransStatus(env, orderId) {
  const r = await fetch(`${apiBase(env)}/v2/${encodeURIComponent(orderId)}/status`, { headers: { Authorization: midAuth(env), Accept: 'application/json' } });
  const d = await r.json().catch(() => ({}));
  if (String(d.status_code) === '404') return null;            // belum ada transaksi (token dibuat tapi belum dipilih metode)
  if (!d.transaction_status) throw new HttpError(502, 'Midtrans: ' + (d.status_message || r.status));
  return d;
}

async function sha512hex(s) {
  const b = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

/* ---------- Firestore REST (service account, melewati security rules) ---------- */
let _tok = { v: '', exp: 0 };
const b64u = buf => {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (const c of b) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64uStr = s => b64u(new TextEncoder().encode(s));

async function googleToken(env) {
  if (_tok.v && _tok.exp > Date.now() + 60000) return _tok.v;
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const head = b64uStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64uStr(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const pem = String(sa.private_key).replace(/\\n/g, '\n').replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head + '.' + claim));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + b64u(sig) })
  });
  const d = await r.json();
  if (!r.ok) throw new Error('Auth Google gagal: ' + (d.error_description || d.error));
  _tok = { v: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return _tok.v;
}

const fsBase = env => `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const fsName = (env, path) => `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`;

function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}
function dec(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) return decFields(v.mapValue.fields || {});
  return null;
}
const decFields = f => Object.fromEntries(Object.entries(f).map(([k, x]) => [k, dec(x)]));
const toDoc = d => ({ id: d.name.split('/').pop(), updateTime: d.updateTime, data: decFields(d.fields || {}) });

async function fsFetch(env, method, url, body) {
  const res = await fetch(url, {
    method, headers: { Authorization: 'Bearer ' + await googleToken(env), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 404 && method === 'GET') return null;
  const text = await res.text();
  let data = {}; try { data = JSON.parse(text); } catch { /* biarkan */ }
  if (!res.ok) { const e = new Error('Firestore ' + res.status + ': ' + text.slice(0, 300)); e.status = res.status; e.fsStatus = data && data.error && data.error.status; throw e; }
  return data;
}
const getDocRaw = async (env, path) => { const d = await fsFetch(env, 'GET', `${fsBase(env)}/${path}`); return d ? toDoc(d) : null; };
async function listDocs(env, col) {
  const out = []; let tok = '';
  do {
    const d = await fsFetch(env, 'GET', `${fsBase(env)}/${col}?pageSize=300${tok ? '&pageToken=' + encodeURIComponent(tok) : ''}`);
    ((d && d.documents) || []).forEach(x => out.push(toDoc(x)));
    tok = (d && d.nextPageToken) || '';
  } while (tok);
  return out;
}
async function queryEq(env, col, field, val) {
  const r = await fsFetch(env, 'POST', `${fsBase(env)}:runQuery`, {
    structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: val } } }, limit: 1 }
  });
  const hit = (r || []).find(x => x.document);
  return hit ? toDoc(hit.document) : null;
}
// Bentuk 1 operasi tulis. opts: updateTime | mustExist | mustNotExist | append{field:val} | increment{field:n} | serverTime[field]
function wUpdate(env, path, fields, opts = {}) {
  const w = {
    update: { name: fsName(env, path), fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, enc(v)])) },
    updateMask: { fieldPaths: Object.keys(fields) }
  };
  if (opts.updateTime) w.currentDocument = { updateTime: opts.updateTime };
  else if (opts.mustExist) w.currentDocument = { exists: true };
  else if (opts.mustNotExist) w.currentDocument = { exists: false };
  const tr = [];
  Object.entries(opts.append || {}).forEach(([k, v]) => tr.push({ fieldPath: k, appendMissingElements: { values: [enc(v)] } }));
  Object.entries(opts.increment || {}).forEach(([k, n]) => tr.push({ fieldPath: k, increment: { integerValue: String(n) } }));
  (opts.serverTime || []).forEach(k => tr.push({ fieldPath: k, setToServerValue: 'REQUEST_TIME' }));
  if (tr.length) w.updateTransforms = tr;
  return w;
}
const commit = (env, writes) => fsFetch(env, 'POST', `${fsBase(env)}:commit`, { writes });

/* ---------- Aturan DP (sama persis dengan di browser) ---------- */
// Persen -> dibulatkan ke kelipatan Rp5.000 terdekat (tepat di tengah dibulatkan ke atas: 87.500 -> 90.000, 86.000 -> 85.000)
function hitungMinDP(total, s) {
  const val = Number(s && s.dpValue) || 0;
  if (s && s.dpMode === 'percent') return Math.max(5000, Math.floor((total * val / 100 + 2500) / 5000) * 5000);
  return Math.max(1, Math.round(val));
}
// Minimal DP per produk (rumus sama dengan minDPType di script.js). items: [{ harga, dpMode, dpValue }]
const dpMilikSendiri = i => !!(i && (i.dpMode === 'percent' || i.dpMode === 'nominal') && Number(i.dpValue) > 0);
function hitungMinDPItems(items, total, s) {
  const own = items.filter(dpMilikSendiri), def = items.filter(i => !dpMilikSendiri(i));
  if (!own.length) return hitungMinDP(total, s);
  let min = own.reduce((a, i) => a + hitungMinDP(i.harga, { dpMode: i.dpMode, dpValue: i.dpValue }), 0);
  if (def.length) min += hitungMinDP(def.reduce((a, i) => a + i.harga, 0), s);
  return min;
}
async function ambilSetting(env) {
  const d = await getDocRaw(env, 'settings/payment');
  return Object.assign({ dpMode: 'nominal', dpValue: 70000 }, d ? d.data : {});
}

/* ---------- Validasi harga (total order dibuat di browser, jadi dicek ulang di server) ---------- */
async function hargaResmi(env) {
  const out = {};
  for (const col of ['produk', 'aksesoris']) {
    (await listDocs(env, col)).forEach(({ data: p }) => {
      if (!p.nama) return;
      const add = {};
      (Array.isArray(p.tambahan) ? p.tambahan : []).forEach(a => { if (a && a.nama) add[String(a.nama)] = Number(a.harga) || 0; });
      out[p.nama] = { harga: Number(String(p.harga || '').replace(/\D/g, '')) || 0, add, dpAllowed: p.dpAllowed || 'yes', dpMode: p.dpMode || '', dpValue: Number(p.dpValue) || 0 };
    });
  }
  return out;
}
async function validasiHarga(env, o) {
  const kat = await hargaResmi(env);
  const items = Array.isArray(o.produk) ? o.produk : [{ nama: o.produk, tambahan: o.tambahan }];
  let minKaos = 0, dpOk = true;
  const dpItems = [];
  for (const it of items) {
    const p = kat[it.nama];
    if (!p) throw new HttpError(400, `Produk "${it.nama}" sudah tidak tersedia. Silakan pesan ulang.`);
    const awalKaos = minKaos;
    minKaos += p.harga;
    String(it.tambahan || '').split(',').map(s => s.trim()).filter(Boolean).forEach(n => { if (p.add[n] !== undefined) minKaos += p.add[n]; });
    if (p.dpAllowed === 'no') dpOk = false;
    dpItems.push({ harga: minKaos - awalKaos, dpMode: p.dpMode, dpValue: p.dpValue });
  }
  const kaos = Number(o.hargaKaos), ongkir = Number(o.ongkir), total = Math.round(Number(o.totalAkhir));
  if (![kaos, ongkir, total].every(Number.isFinite) || ongkir < 0 || total <= 0) throw new HttpError(400, 'Data harga pesanan tidak valid.');
  if (kaos < minKaos) throw new HttpError(400, 'Harga pesanan tidak sesuai dengan harga produk.');
  const diskon = kaos + ongkir - total;
  let maxDiskon = 0;
  if (o.voucherKode) {
    const v = await queryEq(env, 'vouchers', 'kode', String(o.voucherKode).toUpperCase());
    if (v) {
      const n = Number(v.data.nilai) || 0, t = v.data.tipe;
      maxDiskon = t === 'nominal' ? Math.min(n, kaos + ongkir) : t === 'persen' ? Math.ceil(kaos * n / 100) + 1 : t === 'free_ongkir' ? ongkir : 0;
    }
  }
  if (diskon < -1 || diskon > maxDiskon) throw new HttpError(400, 'Diskon pesanan tidak valid.');
  return { total, dpOk, dpItems };
}

/* ---------- Helper data ---------- */
const bersihKode = k => String(k || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
const maskNama = n => { const w = String(n || '').trim().split(/\s+/)[0] || ''; return w.length > 2 ? w.slice(0, 2) + '*'.repeat(Math.min(w.length - 2, 4)) : w; };
const produkText = o => o.produkText || (Array.isArray(o.produk) ? o.produk.map(p => p.nama).join(', ') : (o.produk || ''));
function randId(n) {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return Array.from(a, x => 'abcdefghjkmnpqrstuvwxyz23456789'[x % 31]).join('');
}

/* ---------- POST /snap ---------- */
async function buatSnap(env, kode, tahap) {
  const oDoc = await queryEq(env, 'orders', 'kodePelunasan', kode);
  if (!oDoc) throw new HttpError(404, 'Pesanan tidak ditemukan.');
  const o = oDoc.data;
  let amount, mode, label;

  if (tahap === 'F') {
    if (o.status !== 'pending') throw new HttpError(409, 'Pesanan ini sudah dibayar atau sudah tidak aktif.');
    if (o.buktiURL) throw new HttpError(409, 'Pesanan ini memakai pembayaran manual (bukti transfer). Hubungi admin.');
    const { total, dpOk, dpItems } = await validasiHarga(env, o);
    mode = o.payMode === 'dp' ? 'dp' : 'lunas';
    if (mode === 'dp') {
      const min = hitungMinDPItems(dpItems, total, await ambilSetting(env));
      amount = Math.round(Number(o.payAmount));
      if (!dpOk || !(min < total)) throw new HttpError(400, 'Pesanan ini tidak bisa DP. Pilih lunas.');
      if (!Number.isInteger(amount) || amount < min || amount >= total) throw new HttpError(400, `Nominal DP minimal Rp${min.toLocaleString('id-ID')} dan kurang dari total.`);
      label = 'DP ' + kode;
    } else { amount = total; label = 'Lunas ' + kode; }
  } else {
    if (o.status !== 'dp') throw new HttpError(409, 'Pesanan ini tidak punya sisa pelunasan.');
    amount = Math.round(Number(o.sisaBayar));
    if (!(amount > 0)) throw new HttpError(409, 'Sisa pelunasan tidak valid.');
    mode = 'pelunasan'; label = 'Pelunasan ' + kode;
  }

  // Pakai ulang token yang masih berlaku (mencegah dua transaksi hidup untuk satu tagihan)
  const key = 'snap_' + tahap, prev = o[key];
  if (prev && prev.token && prev.amount === amount && Date.parse(prev.expireAt) > Date.now() + 120000) {
    return { token: prev.token, orderId: prev.orderId, amount, mode };
  }

  const menit = Number(env.PAYMENT_EXPIRY_MINUTES) || 180;
  const orderId = `${kode}_${tahap}${randId(5)}`;
  const body = {
    transaction_details: { order_id: orderId, gross_amount: amount },
    item_details: [{ id: kode, price: amount, quantity: 1, name: label.slice(0, 50) }],
    customer_details: { first_name: String(o.nama || 'Customer').slice(0, 60), phone: String(o.wa || '').slice(0, 20), ...(o.email ? { email: o.email } : {}) },
    expiry: { unit: 'minutes', duration: menit },
    custom_field1: kode, custom_field2: tahap
  };
  const res = await fetch(`${snapBase(env)}/snap/v1/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: midAuth(env) }, body: JSON.stringify(body)
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.token) throw new HttpError(502, 'Midtrans: ' + ((d.error_messages || []).join(', ') || res.status));

  await commit(env, [wUpdate(env, `orders/${oDoc.id}`, { [key]: { orderId, token: d.token, amount, mode, expireAt: new Date(Date.now() + menit * 60000).toISOString() } })]);
  return { token: d.token, orderId, amount, mode };
}

/* ---------- Proses hasil transaksi -> update order (idempotent, aman dipanggil berulang) ---------- */
async function prosesTransaksi(env, midOrderId, st) {
  const m = /^(.+)_([FP])([A-Za-z0-9]+)$/.exec(midOrderId);
  if (!m) return { abaikan: true };
  const kode = m[1], tahap = m[2];
  const ts = st.transaction_status, fraud = st.fraud_status;
  const dibayar = ts === 'settlement' || (ts === 'capture' && (!fraud || fraud === 'accept'));
  const gagal = ['deny', 'cancel', 'expire', 'failure'].includes(ts);
  const amt = Math.round(Number(st.gross_amount) || 0);
  const logE = { id: midOrderId, ts, amt, type: st.payment_type || '' };

  for (let i = 0; i < 4; i++) {
    const oDoc = await queryEq(env, 'orders', 'kodePelunasan', kode);
    if (!oDoc) return { abaikan: true };
    const o = oDoc.data, snap = o['snap_' + tahap] || {};
    const iso = new Date().toISOString();
    const total = Math.round(Number(o.totalAkhir || o.hargaKaos || 0));
    const lacak = await getDocRaw(env, `lacak/${kode}`);
    const writes = []; let status = o.status, tulisTimeline = false;
    const orderOpts = extra => ({ updateTime: oDoc.updateTime, append: { payLog: logE }, ...extra });

    if (dibayar) {
      if (snap.amount !== amt) {
        writes.push(wUpdate(env, `orders/${oDoc.id}`, { payAnomali: 'jumlah_tidak_cocok' }, orderOpts()));
      } else if (tahap === 'F' && (o.status === 'pending' || o.status === 'rejected')) {
        const mode = snap.mode === 'dp' ? 'dp' : 'lunas';
        const upd = mode === 'dp' ? { status: 'dp', dpNominal: amt, sisaBayar: total - amt } : { status: 'lunas', sisaBayar: 0 };
        Object.assign(upd, { paidAt: iso, payVia: 'midtrans', payMethod: st.payment_type || '' });
        if (o.status === 'rejected' && o.stokDikembalikan && Array.isArray(o.stokItems)) {   // sempat ditolak lalu ternyata dibayar: potong stok lagi
          for (const it of o.stokItems) {
            const s = await getDocRaw(env, `stok/${it.id}`);
            if (s) writes.push(wUpdate(env, `stok/${it.id}`, { qty: Math.max(0, (Number(s.data.qty) || 0) - it.n) }, { mustExist: true }));
          }
          upd.stokDikembalikan = false;
        }
        writes.push(wUpdate(env, `orders/${oDoc.id}`, upd, orderOpts()));
        if (mode === 'dp') writes.push(wUpdate(env, `pelunasan/${kode}`, { kode, orderId: oDoc.id, orderNo: o.orderNo || '', nama: maskNama(o.nama), produk: produkText(o), totalAkhir: total, dpNominal: amt, sisa: total - amt, status: 'dp', createdAt: iso }));
        if (lacak) writes.push(wUpdate(env, `lacak/${kode}`, mode === 'dp' ? { pay: 'dp', payAt: iso, sisa: total - amt, dpNominal: amt } : { pay: 'lunas', payAt: iso, sisa: 0, dpNominal: null }));
        status = upd.status;
      } else if (tahap === 'P' && o.status === 'dp') {
        writes.push(wUpdate(env, `orders/${oDoc.id}`, { status: 'lunas', sisaBayar: 0, paidLunasAt: iso, payMethodLunas: st.payment_type || '' }, orderOpts()));
        if (await getDocRaw(env, `pelunasan/${kode}`)) writes.push(wUpdate(env, `pelunasan/${kode}`, { status: 'lunas', paidAt: iso }, { mustExist: true }));
        if (lacak) writes.push(wUpdate(env, `lacak/${kode}`, { pay: 'lunas', payAt: iso, sisa: 0 }));
        tulisTimeline = !!o.isPO;
        status = 'lunas';
      } else {
        // Sudah tercatat / dobel bayar: hanya dicatat di payLog supaya admin bisa cek & refund manual bila perlu
        writes.push(wUpdate(env, `orders/${oDoc.id}`, { payAnomali: 'bayar_dobel_atau_telat' }, orderOpts()));
      }
    } else if (gagal && tahap === 'F' && o.status === 'pending' && snap.orderId === midOrderId) {
      const upd = { status: 'rejected', rejectReason: 'midtrans_' + ts };
      if (Array.isArray(o.stokItems) && o.stokItems.length && !o.stokDikembalikan) {
        for (const it of o.stokItems) if (await getDocRaw(env, `stok/${it.id}`)) writes.push(wUpdate(env, `stok/${it.id}`, {}, { mustExist: true, increment: { qty: it.n } }));
        upd.stokDikembalikan = true;
      }
      writes.push(wUpdate(env, `orders/${oDoc.id}`, upd, orderOpts()));
      if (lacak) writes.push(wUpdate(env, `lacak/${kode}`, { pay: 'ditolak', payAt: null, sisa: 0, dpNominal: null }));
      status = 'rejected';
    } else if (['refund', 'partial_refund', 'chargeback'].includes(ts)) {
      writes.push(wUpdate(env, `orders/${oDoc.id}`, { payAnomali: ts }, orderOpts()));
    }

    if (!writes.length) return { status, trx: ts };
    try { await commit(env, writes); }
    catch (e) {
      if (e.status === 409 || e.fsStatus === 'ABORTED' || e.fsStatus === 'FAILED_PRECONDITION') continue;   // order berubah di tengah jalan -> baca ulang
      throw e;
    }
    if (tulisTimeline) {
      try {   // id dokumen tetap + mustNotExist => timeline "Pelunasan" hanya terbuat sekali
        await commit(env, [wUpdate(env, `lacak/${kode}/timeline/pelunasan`, { kode, orderId: oDoc.id, text: 'Pelunasan', type: 'automatic', kind: 'pelunasan' }, { mustNotExist: true, serverTime: ['createdAt'] })]);
      } catch { /* sudah ada */ }
    }
    return { status, trx: ts };
  }
  throw new HttpError(503, 'Order sedang diproses, coba lagi.');
}

/* ---------- Router ---------- */
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const cors = origin && allowed.includes(origin)
      ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' } : {};
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname === '/notify' && req.method === 'POST') {          // dari Midtrans (tanpa Origin)
        const b = await req.json();
        const sig = await sha512hex(String(b.order_id) + String(b.status_code) + String(b.gross_amount) + env.MIDTRANS_SERVER_KEY);
        if (sig !== b.signature_key) return json({ error: 'signature tidak valid' }, 403);
        const st = await midtransStatus(env, b.order_id);                   // sumber kebenaran = API Midtrans, bukan isi webhook
        if (st) await prosesTransaksi(env, b.order_id, st);
        return json({ ok: true });
      }

      if (origin && !cors['Access-Control-Allow-Origin']) return json({ error: 'Origin tidak diizinkan' }, 403);

      if (url.pathname === '/config' && req.method === 'GET') {
        return json({ clientKey: env.MIDTRANS_CLIENT_KEY, production: isProd(env), snapJs: snapBase(env) + '/snap/snap.js' }, 200, cors);
      }

      if ((url.pathname === '/snap' || url.pathname === '/sync') && req.method === 'POST') {
        const b = await req.json().catch(() => ({}));
        const kode = bersihKode(b.kode), tahap = b.tahap === 'P' ? 'P' : 'F';
        if (!kode) throw new HttpError(400, 'Kode pesanan kosong.');
        if (url.pathname === '/snap') return json(await buatSnap(env, kode, tahap), 200, cors);

        const oDoc = await queryEq(env, 'orders', 'kodePelunasan', kode);
        if (!oDoc) throw new HttpError(404, 'Pesanan tidak ditemukan.');
        const snap = oDoc.data['snap_' + tahap];
        if (!snap || !snap.orderId) return json({ status: oDoc.data.status, trx: null }, 200, cors);
        const st = await midtransStatus(env, snap.orderId);
        if (!st) return json({ status: oDoc.data.status, trx: null }, 200, cors);
        const r = await prosesTransaksi(env, snap.orderId, st);
        return json({ status: r.status || oDoc.data.status, trx: st.transaction_status }, 200, cors);
      }

      return json({ error: 'Not found' }, 404, cors);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status >= 500) console.error(e && e.stack || e);
      return json({ error: status >= 500 && !(e instanceof HttpError) ? 'Terjadi kesalahan di server.' : e.message }, status, cors);
    }
  }
};
