import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc,
  query, orderBy, onSnapshot, setDoc, where, getDoc, deleteField, arrayUnion,
  runTransaction, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, onAuthStateChanged,
  GoogleAuthProvider, signInWithPopup, signInWithCredential, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCVL_C4opQiKC6fNG_Rw4l-519rQZICH58",
    authDomain: "fvcktherules-store.firebaseapp.com",
    projectId: "fvcktherules-store",
    storageBucket: "fvcktherules-store.firebasestorage.app",
    messagingSenderId: "382347904485",
    appId: "1:382347904485:web:6715a7b395d44ad07a5b0c"
};

// ── MAIN APP (Customer)
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// ── SECONDARY APP (Admin) — auth terpisah, tidak akan tabrakan
const ADMIN_APP_NAME = 'fvckAdminApp';
let adminApp;
const existingAdminApp = getApps().find(a => a.name === ADMIN_APP_NAME);
adminApp = existingAdminApp ? getApp(ADMIN_APP_NAME) : initializeApp(firebaseConfig, ADMIN_APP_NAME);
export const adminAuth = getAuth(adminApp);
// Firestore instance khusus admin, harus dari adminApp juga -- kalau pakai `db` (dari app utama),
// request Firestore-nya tidak akan membawa sesi login adminAuth sama sekali (request.auth = null
// di security rules), walaupun sudah login sebagai admin. Makanya semua fungsi admin di bawah ini
// (order, customer, produk, galeri, banner, voucher) pakai adminDb, bukan db.
export const adminDb = getFirestore(adminApp);

// ── JOURNAL APP (project Firebase jurnal: fvck-journal) — hanya untuk konten Berita & Diskusi.
// Akun tetap akun toko (auth di atas). Rules Firestore jurnal tidak bisa membaca login project lain,
// jadi tiap login/daftar juga masuk ke "akun bayangan" di project jurnal (email + password sama).
// >>> TEMPEL config web app project fvck-journal (Firebase Console > Project settings > Your apps):
const journalConfig = {
    apiKey: "AIzaSyAsbMEwu-h28PsRO-h3tDbHqTp6Wgj44oI",
    authDomain: "fvck-journal.firebaseapp.com",
    projectId: "fvck-journal",
    storageBucket: "fvck-journal.firebasestorage.app",
    messagingSenderId: "681112457847",
    appId: "1:681112457847:web:3365af3274eb6d03c8ac72"
};
export const journalConfigured = !String(journalConfig.apiKey).startsWith("PASTE");
const JOURNAL_APP_NAME = 'fvckJournalApp';
const journalApp = getApps().find(a => a.name === JOURNAL_APP_NAME) || initializeApp(journalConfig, JOURNAL_APP_NAME);
export const journalDb = getFirestore(journalApp);
export const journalAuth = getAuth(journalApp);

// Masuk (atau buat otomatis) akun bayangan di project jurnal. Tidak pernah melempar error.
// Mengembalikan { ok, reason }. reason "mismatch" = akun bayangan ada tapi password beda.
export async function journalShadowSignIn(email, password) {
    if (!journalConfigured) return { ok: false, reason: 'not-configured' };
    try { await signInWithEmailAndPassword(journalAuth, email, password); return { ok: true }; }
    catch (e) {
        if (!['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(e.code)) return { ok: false, reason: e.code };
    }
    try { await createUserWithEmailAndPassword(journalAuth, email, password); return { ok: true }; }
    catch (e) {
        if (e.code === 'auth/email-already-in-use') {
            try { await sendPasswordResetEmail(journalAuth, email); } catch {}
            return { ok: false, reason: 'mismatch' };
        }
        return { ok: false, reason: e.code };
    }
}

// Cloudinary config
export const CLOUDINARY_BUKTI_CLOUD  = "dfbxrouwf";
export const CLOUDINARY_BUKTI_PRESET = "underline-bukti";
export const CLOUDINARY_PRODUK_CLOUD = "dfbxrouwf";
export const CLOUDINARY_PRODUK_PRESET= "underline-produk";
export const CLOUDINARY_GALERI_CLOUD = "dfbxrouwf";
export const CLOUDINARY_GALERI_PRESET= "underline-galeri";

/* ============== CUSTOMER AUTH ============== */
export async function customerSignUp(email, password) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "customers", cred.user.uid), {
        uid: cred.user.uid,
        email: email,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
    }, { merge: true });
    journalShadowSignIn(email, password).catch(() => {});   // sambungkan ke akun Journal (tidak menghalangi login toko)
    return cred.user;
}

export async function customerSignIn(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "customers", cred.user.uid), {
        uid: cred.user.uid,
        email: email,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
    }, { merge: true });
    await journalShadowSignIn(email, password);   // sambungkan ke akun Journal (tidak pernah gagal keras)
    return cred.user;
}

export async function customerSignOut() {
    try { await signOut(journalAuth); } catch {}
    await signOut(auth);
}

export async function customerSignInGoogle() {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    await setDoc(doc(db, "customers", cred.user.uid), {
        uid: cred.user.uid,
        email: cred.user.email,
        nama: cred.user.displayName || "",
        provider: "google",
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
    }, { merge: true });
    try {   // coba sambungkan ke akun Journal; kalau tidak bisa, balasan Journal minta password sekali
        const gc = GoogleAuthProvider.credentialFromResult(cred);
        if (journalConfigured && gc) await signInWithCredential(journalAuth, gc);
    } catch (e) { console.warn('Journal (Google) belum tersambung:', e.code || e); }
    return cred.user;
}

export async function getCustomerProfile(uid) {
    try {
        const snap = await getDoc(doc(db, "customers", uid));
        return snap.exists() ? snap.data() : null;
    } catch (err) { console.error("Gagal ambil profil:", err); return null; }
}

export async function updateCustomerProfile(uid, data) {
    try {
        await setDoc(doc(db, "customers", uid), data, { merge: true });
        return true;
    } catch (err) { console.error("Gagal simpan profil:", err); return false; }
}

export async function getCustomerOrders(uid) {
    try {
        const q = query(collection(db, "orders"), where("customerUid", "==", uid));
        const snap = await getDocs(q);
        const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return orders;
    } catch (err) { console.error("Gagal ambil riwayat pesanan:", err); return []; }
}

export function listenCustomers(callback, onError) {
    const q = query(collection(adminDb, "customers"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
        console.error("Gagal ambil data customer:", err);
        if (onError) onError(err);
    });
}

export async function deleteCustomer(id) {
    await deleteDoc(doc(adminDb, "customers", id));
}

/* ============== ADMIN AUTH (pakai adminAuth) ============== */
export async function loginAdmin(email, password) {
    try {
        await signInWithEmailAndPassword(adminAuth, email, password);
        return true;
    } catch (err) {
        console.error("Login admin gagal:", err);
        return false;
    }
}

export async function logoutAdmin() {
    await signOut(adminAuth);
}

/* ============== KODE & ID (ORDER / PELUNASAN) ============== */
const KODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // tanpa I, O, 0, 1 supaya tidak membingungkan
function randStr(n, chars = KODE_CHARS) {
    const a = new Uint32Array(n);
    crypto.getRandomValues(a);
    return Array.from(a, x => chars[x % chars.length]).join('');
}
export function bersihkanPrefix(p) { return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); }
// ID PEMESANAN (identitas utama order, permanen): PREFIX-XXXXXX. Disimpan di field `kodePelunasan`
// (nama field lama dipertahankan supaya pelunasan/lacak/riwayat existing tidak putus).
// Order lama dengan 5 karakter acak tetap valid dan tidak diubah.
export function buatKodePelunasan(prefix) { return (bersihkanPrefix(prefix) || 'FVCK') + '-' + randStr(6); }
function namaProdukUtama(o) {
    if (Array.isArray(o.produk)) return (o.produk[0] && o.produk[0].nama) || '';
    return o.produk || o.produkText || '';
}
// ID untuk admin: NAMA-PRODUK-DDMM-XXX, contoh ELEMEN-JERSEY-0510-K7F
export function buatOrderNo(namaProduk) {
    const slug = String(namaProduk || 'ORDER').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 16).replace(/-+$/, '') || 'ORDER';
    const d = new Date();
    const ddmm = String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0');
    return `${slug}-${ddmm}-${randStr(3)}`;
}
function maskEmail(e) {
    const [u, d] = String(e || '').trim().split('@');
    if (!u || !d) return '';
    return u.slice(0, 2) + '***@' + d;
}
function maskHP(h) {
    const d = String(h || '').replace(/\D/g, '');
    return d.length > 6 ? d.slice(0, 4) + '****' + d.slice(-3) : (d ? '****' : '');
}
function maskNama(n) {
    const w = String(n || '').trim().split(/\s+/)[0] || '';
    return w.length > 2 ? w.slice(0, 2) + '*'.repeat(Math.min(w.length - 2, 4)) : w;
}

/* ============== PELUNASAN ============== */
// Customer: ambil data pelunasan dari kode (doc ID = kode; hanya bisa 'get' kalau tahu kodenya persis)
export async function getPelunasan(kode) {
    const snap = await getDoc(doc(db, "pelunasan", kode));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
export async function kirimBuktiPelunasan(kode, url) {
    await updateDoc(doc(db, "pelunasan", kode), {
        buktiPelunasanURL: url,
        buktiPelunasanAt: new Date().toISOString(),
        status: 'menunggu_verifikasi'
    });
    return true;
}
// Admin
export function listenPelunasan(cb) {
    return onSnapshot(collection(adminDb, "pelunasan"), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export async function adminSimpanDP(o, dpNominal, kode, orderNo) {
    const total = Number(o.totalAkhir || o.hargaKaos || 0);
    const sisa = total - dpNominal;
    const produkText = o.produkText || (Array.isArray(o.produk) ? o.produk.map(p => p.nama).join(', ') : (o.produk || ''));
    const ref = doc(adminDb, "pelunasan", kode);
    const base = { kode, orderId: o.id, orderNo, nama: maskNama(o.nama), produk: produkText, totalAkhir: total, dpNominal, sisa };
    const ex = await getDoc(ref);
    if (ex.exists()) await updateDoc(ref, base);
    else await setDoc(ref, { ...base, status: 'dp', createdAt: new Date().toISOString() });
    await updateDoc(doc(adminDb, "orders", o.id), { status: 'dp', dpNominal, sisaBayar: sisa, kodePelunasan: kode, orderNo });
    await adminSyncPay(kode, 'dp', sisa, dpNominal);
    return { sisa, total };
}

// PELUNASAN (DP -> Lunas). Dipanggil saat admin memverifikasi bukti pelunasan (satu-satunya "verifikasi payment"
// yang ada di sistem ini: pembayaran manual transfer/QRIS, tidak ada gateway/webhook).
// Transaksi + ID dokumen timeline tetap ('pelunasan') => idempotent: dipanggil berkali-kali (klik ganda, 2 tab admin)
// tetap hanya membuat SATU event "Pelunasan". Waktu = waktu server.
export async function adminLunaskan(orderId) {
    const oRef = doc(adminDb, "orders", orderId);
    return await runTransaction(adminDb, async (tx) => {
        const oSnap = await tx.get(oRef);
        if (!oSnap.exists()) throw new Error('Order tidak ditemukan');
        const o = oSnap.data();
        const kode = o.kodePelunasan || '';
        const pRef = kode ? doc(adminDb, "pelunasan", kode) : null;
        const lRef = kode ? doc(adminDb, "lacak", kode) : null;
        const tRef = kode ? doc(adminDb, "lacak", kode, "timeline", "pelunasan") : null;
        const pSnap = pRef ? await tx.get(pRef) : null;
        const lSnap = lRef ? await tx.get(lRef) : null;
        const tSnap = tRef ? await tx.get(tRef) : null;

        if (o.status === 'lunas') return { changed: false, event: !!(tSnap && tSnap.exists()) };

        const wasDP = o.status === 'dp';
        tx.update(oRef, { status: 'lunas', sisaBayar: 0 });
        if (pSnap && pSnap.exists()) tx.update(pRef, { status: 'lunas' });
        if (lSnap && lSnap.exists()) tx.update(lRef, { pay: 'lunas', payAt: new Date().toISOString(), sisa: 0 });
        let event = !!(tSnap && tSnap.exists());
        if (wasDP && o.isPO && kode && !event) {
            tx.set(tRef, { kode, orderId, text: 'Pelunasan', type: 'automatic', kind: 'pelunasan', createdAt: serverTimestamp() });
            event = true;
        }
        return { changed: true, event, wasDP };
    });
}
// Status selain DP/Lunas (pending, ditolak): update order + sinkron ke data pelacakan
export async function adminSetStatus(o, status) {
    await updateDoc(doc(adminDb, "orders", o.id), { status });
    await adminSyncPay(o.kodePelunasan, status, o.sisaBayar, o.dpNominal);
    return true;
}

/* ============== ORDER ============== */
export async function saveOrder(orderData) {
    try {
        if (!orderData.orderNo) orderData.orderNo = buatOrderNo(namaProdukUtama(orderData));

        // ID Pemesanan: dibuat di sini (saat order dibuat), prefix dari artikel, dipastikan belum dipakai (lacak/{kode}),
        // lalu disimpan permanen di dokumen order. Tidak pernah dibuat/diubah di tampilan.
        let kode = null;
        for (let i = 0; i < 10 && !kode; i++) {
            const c = buatKodePelunasan(orderData.kodePrefix);
            const ex = await getDoc(doc(db, "lacak", c));
            if (!ex.exists()) kode = c;
        }
        if (!kode) throw new Error('Gagal membuat ID pemesanan unik');
        orderData.kodePelunasan = kode;

        const ref = doc(collection(db, "orders"));
        await setDoc(ref, { ...orderData, status: "pending", createdAt: new Date().toISOString() });

        // Dokumen pelacakan + event "Pesanan dibuat" (gagal di sini tidak membatalkan order; admin bisa "Sinkronkan")
        try { await buatLacak(ref.id, orderData); } catch (e) { console.error("Gagal buat pelacakan:", e); }
        return ref.id;
    } catch (err) {
        console.error("Gagal simpan order:", err);
        return null;
    }
}

export async function uploadGambar(file, tipe = "bukti") {
    const config = {
        bukti:  { cloud: CLOUDINARY_BUKTI_CLOUD,  preset: CLOUDINARY_BUKTI_PRESET },
        produk: { cloud: CLOUDINARY_PRODUK_CLOUD, preset: CLOUDINARY_PRODUK_PRESET },
        galeri: { cloud: CLOUDINARY_GALERI_CLOUD, preset: CLOUDINARY_GALERI_PRESET }
    };
    const { cloud, preset } = config[tipe];
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", preset);
    try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body: formData });
        const data = await res.json();
        return data.secure_url;
    } catch (err) { console.error("Gagal upload:", err); return null; }
}

export async function getOrders() {
    try {
        const q = query(collection(adminDb, "orders"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
        console.error("Gagal ambil order:", err);
        if (typeof window !== 'undefined' && window.showToast) {
            window.showToast('GAGAL AMBIL ORDER: ' + (err.code || err.message || 'unknown'), true);
        }
        return [];
    }
}

export async function updateOrderStatus(orderId, status) {
    try { await updateDoc(doc(adminDb, "orders", orderId), { status }); return true; }
    catch (err) { return false; }
}

/* ============== PRODUK ============== */
export async function saveProduk(data) {
    await addDoc(collection(adminDb, "produk"), { ...data, createdAt: new Date().toISOString() });
    return true;
}
export async function getProduk() {
    const q = query(collection(db, "produk"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function updateProduk(id, data) { await updateDoc(doc(adminDb, "produk", id), data); return true; }
export async function deleteProduk(id) { await deleteDoc(doc(adminDb, "produk", id)); return true; }
export function listenProduk(cb) {
    const q = query(collection(db, "produk"), orderBy("order", "desc"));
    return onSnapshot(q, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
}

/* ============== GALERI ============== */
export async function saveGaleri(url) {
    await addDoc(collection(adminDb, "galeri"), { url, order: Date.now(), createdAt: new Date().toISOString() });
    return true;
}
export async function getGaleri() {
    const q = query(collection(db, "galeri"), orderBy("order", "asc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function deleteGaleri(id) { await deleteDoc(doc(adminDb, "galeri", id)); return true; }
export async function updateGaleri(id, data) { await updateDoc(doc(adminDb, "galeri", id), data); return true; }
export function listenGaleri(cb) {
    const q = query(collection(db, "galeri"), orderBy("order", "asc"));
    return onSnapshot(q, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
}

/* ============== BANNER ============== */
export async function saveBanner(data) { await addDoc(collection(adminDb, "banners"), { ...data, createdAt: new Date().toISOString() }); return true; }
export async function updateBanner(id, data) { await updateDoc(doc(adminDb, "banners", id), data); return true; }
export async function deleteBanner(id) { await deleteDoc(doc(adminDb, "banners", id)); return true; }
export function listenBanners(cb) {
    const q = query(collection(db, "banners"), orderBy("order", "asc"));
    return onSnapshot(q, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export function listenBannerText(cb) {
    onSnapshot(doc(db, "settings", "bannerText"), (d) => {
        cb(d.exists() ? d.data() : { topText: "", bottomText: "" });
    });
}
export async function saveBannerText(data) { await setDoc(doc(adminDb, "settings", "bannerText"), data); }

/* ============== VOUCHER ============== */
export async function saveVoucher(data) { await addDoc(collection(adminDb, "vouchers"), { ...data, createdAt: new Date().toISOString() }); return true; }
export async function deleteVoucher(id) { await deleteDoc(doc(adminDb, "vouchers", id)); return true; }
export function listenVouchers(cb) {
    const q = query(collection(db, "vouchers"), orderBy("createdAt", "desc"));
    return onSnapshot(q, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export async function getVoucherByKode(kode) {
    const q = query(collection(db, "vouchers"), where("kode", "==", kode.toUpperCase()));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
}
export async function updateVoucherKuota(id, kuotaBaru) {
    try { await updateDoc(doc(db, "vouchers", id), { kuota: kuotaBaru }); } catch(e){}
}

export { onAuthStateChanged };

/* ============== PANTAU PESANAN (PRE ORDER) ============== */
// lacak/{kode}     : 1 dokumen per order PO (doc ID = ID pesanan). Dibaca publik per-ID saja.
// lacakIdx/{hash}  : indeks pencarian via no HP / email (di-hash SHA-256, isinya hanya daftar ID)
// poTrack/{produk} : status per ARTIKEL PO (masuk vendor / jadi / dikirim) + flag selesai. Diisi admin.
function normHP(v) {
    let d = String(v || '').replace(/\D/g, '');
    if (d.startsWith('0')) d = '62' + d.slice(1);
    else if (d.startsWith('8')) d = '62' + d;
    return d;
}
function normEmail(v) { return String(v || '').trim().toLowerCase(); }
async function sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}
// Order dianggap Pre Order bila artikelnya (sekarang) berbadge PRE ORDER, atau order itu memang tercatat PO.
// Dipakai untuk order lama yang belum punya penanda isPO / poIds.
export function turunanPO(o, produkList = []) {
    // Order baru sudah mencatat isPO sendiri saat checkout (sesuai badge produk SAAT ITU). Itu yang dipegang,
    // supaya order Ready Stock setelah PO selesai tidak berubah jadi Pre Order dan tidak membawa keterangan lama (vendor, sablon, dll).
    // Penurunan dari produk hanya untuk order lama yang belum punya penanda isPO.
    if (typeof o.isPO === 'boolean') {
        return { isPO: o.isPO, poIds: o.isPO ? [...(o.poIds || [])] : [], poNames: o.isPO ? [...(o.poNames || [])] : [] };
    }
    const names = Array.isArray(o.produk) ? o.produk.map(p => p.nama) : [o.produk];
    const ids = [...(o.poIds || [])], poNames = [...(o.poNames || [])];
    produkList.filter(p => (p.badge === 'pre' || p.poClosed) && names.includes(p.nama)).forEach(p => {
        if (!ids.includes(p.id)) ids.push(p.id);
        if (!poNames.includes(p.nama)) poNames.push(p.nama);
    });
    return { isPO: ids.length > 0 || o.isPO === true, poIds: ids, poNames };
}
function itemsDariOrder(o) {
    return Array.isArray(o.produk)
        ? o.produk.map(p => ({ nama: p.nama || '', warna: p.warna || '', size: p.size || '' }))
        : [{ nama: o.produk || '', warna: o.warna || '', size: o.size || '' }];
}
function totalDariOrder(o) { return Number(o.totalAkhir || o.hargaKaos || 0); }
const payDariStatus = st => st === 'lunas' ? 'lunas' : st === 'dp' ? 'dp' : st === 'rejected' ? 'ditolak' : 'pending';

// Indeks pencarian no HP / email (hash). Hanya untuk order Pre Order.
async function indeksLacak(dbx, o, kode) {
    const keys = [];
    if (o.wa) keys.push('hp:' + normHP(o.wa));
    if (o.email) keys.push('em:' + normEmail(o.email));
    for (const k of keys) {
        try {
            const ref = doc(dbx, "lacakIdx", await sha256Hex(k));
            const ex = await getDoc(ref);
            if (!ex.exists()) await setDoc(ref, { kodes: [kode] });
            else if (!(ex.data().kodes || []).includes(kode)) await updateDoc(ref, { kodes: arrayUnion(kode) });
        } catch (e) { console.error("Gagal indeks lacak:", e); }
    }
}
// lacak/{kode}: 1 dokumen per order (semua order; ID tidak boleh kembar). Detail publik = data tersamar (nama/email/HP dimask).
// lacak/{kode}/timeline/{id}: timeline order (hanya order Pre Order).
async function buatLacak(orderId, o) {
    const kode = o.kodePelunasan;
    await setDoc(doc(db, "lacak", kode), {
        kode, orderId, orderNo: o.orderNo || '', isPO: !!o.isPO,
        nama: maskNama(o.nama), email: maskEmail(o.email), hp: maskHP(o.wa),
        produk: o.produkText || namaProdukUtama(o), items: itemsDariOrder(o),
        poIds: o.poIds || [], poNames: o.poNames || [],
        total: totalDariOrder(o), dpNominal: null, sisa: null,
        pay: 'pending', payAt: null,
        createdAt: new Date().toISOString()
    });
    // Index email/HP untuk semua order (dipakai Pantau & Pelunasan)
    await indeksLacak(db, o, kode);
    if (!o.isPO) return;   // Ready Stock: tanpa tracking/timeline Pre Order
    await setDoc(doc(db, "lacak", kode, "timeline", "created"), {
        kode, orderId, text: 'Pesanan dibuat', type: 'automatic', kind: 'created', createdAt: serverTimestamp()
    });
}

export function tsMillis(v) {
    if (!v) return 0;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    const t = new Date(v).getTime();
    return isNaN(t) ? 0 : t;
}
function urutTimeline(list) {
    return list.sort((a, b) => (tsMillis(a.createdAt) - tsMillis(b.createdAt)) || (a.kind === 'created' ? -1 : b.kind === 'created' ? 1 : 0) || String(a.id).localeCompare(String(b.id)));
}

// Customer: cari lewat ID / no HP / email. Hasil terbaru -> terlama. Pre Order maupun Ready Stock. Order lama tetap bisa dilacak
// walaupun artikel PO-nya sudah diselesaikan.
async function kumpulKode({ kode, hp, email }) {
    let kodes = [];
    if (kode) kodes.push(String(kode).toUpperCase().replace(/[^A-Z0-9-]/g, ''));
    if (hp) {
        const s = await getDoc(doc(db, "lacakIdx", await sha256Hex('hp:' + normHP(hp))));
        if (s.exists()) kodes.push(...(s.data().kodes || []));
    }
    if (email) {
        const s = await getDoc(doc(db, "lacakIdx", await sha256Hex('em:' + normEmail(email))));
        if (s.exists()) kodes.push(...(s.data().kodes || []));
    }
    return [...new Set(kodes)].filter(Boolean).slice(0, 50);
}
export async function cariLacak(q) {
    const out = [];
    for (const k of await kumpulKode(q)) {
        const s = await getDoc(doc(db, "lacak", k));
        if (!s.exists()) continue;
        const d = s.data();
        out.push({ id: s.id, ...d });
    }
    out.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
    return out;
}
// Customer (halaman Cek Resi): pencarian sama dengan Pantau (ID / email / HP), tapi untuk SEMUA order (Pre Order & Ready Stock).
export async function cariResi(q) {
    const out = [];
    for (const k of await kumpulKode(q)) {
        const s = await getDoc(doc(db, "lacak", k));
        if (!s.exists()) continue;
        out.push({ id: s.id, ...s.data() });
    }
    out.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
    return out;
}
// Customer (halaman Pelunasan): pencarian sama persis dengan Pantau (ID / email / HP), hasil terbaru -> terlama.
// Hanya order yang sudah punya data pelunasan (admin sudah konfirmasi DP). Berlaku untuk Pre Order maupun Ready Stock DP.
export async function cariPelunasan(q) {
    const out = [];
    for (const k of await kumpulKode(q)) {
        const p = await getDoc(doc(db, "pelunasan", k));
        if (!p.exists()) continue;
        const l = await getDoc(doc(db, "lacak", k));
        out.push({ id: p.id, ...p.data(), _urut: l.exists() ? tsMillis(l.data().createdAt) : tsMillis(p.data().createdAt) });
    }
    out.sort((a, b) => b._urut - a._urut);
    return out;
}
export async function getTimeline(kode) {
    const s = await getDocs(collection(db, "lacak", kode, "timeline"));
    return urutTimeline(s.docs.map(d => ({ id: d.id, ...d.data() })));
}

/* ----- Admin: timeline per order ----- */
export function listenTimeline(kode, cb, onErr) {
    return onSnapshot(collection(adminDb, "lacak", kode, "timeline"),
        s => cb(urutTimeline(s.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })))),
        e => { console.error(e); if (onErr) onErr(e); });
}
// Update manual: waktu SELALU waktu server (admin tidak bisa mengetik tanggal/jam).
export async function adminTambahUpdate(o, text) {
    const t = String(text || '').trim().slice(0, 500);
    if (!t) throw new Error('Isi update kosong');
    if (!o.kodePelunasan) throw new Error('Order belum punya ID');
    const lk = await getDoc(doc(adminDb, "lacak", o.kodePelunasan));
    if (!lk.exists()) throw new Error('Pelacakan order belum disinkronkan (tekan SINKRONKAN)');
    await addDoc(collection(adminDb, "lacak", o.kodePelunasan, "timeline"), {
        kode: o.kodePelunasan, orderId: o.id, text: t, type: 'manual', kind: 'manual', createdAt: serverTimestamp()
    });
}
// Admin: unggah / ubah / hapus RESI per order (satu per satu).
// Disimpan di orders/{id} (untuk admin) dan lacak/{kode} (dibaca pelanggan di Cek Resi & Pantau).
// Timeline "Paket diserahkan ke pihak pengirim" dibuat sekali (id 'resi', waktu server); resi dihapus => event ikut dihapus.
export async function adminSimpanResi(o, resiRaw) {
    const resi = String(resiRaw || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const kode = o.kodePelunasan;
    if (!kode) throw new Error('Order belum punya ID');
    const lkRef = doc(adminDb, "lacak", kode);
    const lk = await getDoc(lkRef);
    if (!lk.exists()) throw new Error('Pelacakan order belum disinkronkan (tekan SINKRONKAN)');
    const tRef = doc(adminDb, "lacak", kode, "timeline", "resi");
    if (!resi) {
        await updateDoc(doc(adminDb, "orders", o.id), { resi: '', resiAt: null });
        await updateDoc(lkRef, { resi: '', resiAt: null });
        try { await deleteDoc(tRef); } catch (e) { console.error(e); }
        return { resi: '' };
    }
    const resiAt = new Date().toISOString();
    await updateDoc(doc(adminDb, "orders", o.id), { resi, resiAt });
    await updateDoc(lkRef, { resi, resiAt });
    const ex = await getDoc(tRef);
    if (!ex.exists()) {
        await setDoc(tRef, { kode, orderId: o.id, text: 'Paket diserahkan ke pihak pengirim', type: 'manual', kind: 'resi', createdAt: serverTimestamp() });
    }
    return { resi, resiAt };
}
// Hanya update manual yang bisa dihapus (rules juga menolak event otomatis). Hanya menyentuh 1 dokumen timeline.
export async function adminHapusUpdate(kode, eventId) {
    await deleteDoc(doc(adminDb, "lacak", kode, "timeline", eventId));
}

// Admin: sinkron status bayar ke data pelacakan
export async function adminSyncPay(kode, status, sisa, dpNominal) {
    if (!kode) return;
    const pay = payDariStatus(status);
    try {
        await updateDoc(doc(adminDb, "lacak", kode), {
            pay,
            payAt: (pay === 'lunas' || pay === 'dp') ? new Date().toISOString() : null,
            sisa: pay === 'dp' ? Number(sisa || 0) : 0,
            dpNominal: dpNominal ? Number(dpNominal) : null
        });
    } catch (e) { console.warn("Lacak tidak ada / gagal sync:", kode, e.code || e.message); }
}
export async function adminHapusLacak(kode) {
    if (!kode) return;
    try {
        const tl = await getDocs(collection(adminDb, "lacak", kode, "timeline"));
        for (const d of tl.docs) await deleteDoc(d.ref);
        await deleteDoc(doc(adminDb, "lacak", kode));
    } catch (e) { console.warn(e); }
}

/* ----- Update per ARTIKEL Pre Order -----
   poUpdates/{produkId}/items/{id}: ditulis sekali oleh admin, otomatis tampil di timeline SEMUA order artikel tsb
   (hanya order yang dibuat sebelum update itu). Waktu = waktu server. Baca publik, tulis admin. */
function urutItems(list) { return list.sort((a, b) => (tsMillis(a.createdAt) - tsMillis(b.createdAt)) || String(a.id).localeCompare(String(b.id))); }
export function listenPoUpdates(pid, cb) {
    return onSnapshot(collection(adminDb, "poUpdates", pid, "items"),
        s => cb(urutItems(s.docs.map(d => ({ id: d.id, pid, ...d.data({ serverTimestamps: 'estimate' }) })))),
        e => console.error(e));
}
export async function adminTambahUpdatePo(pid, text) {
    const t = String(text || '').trim().slice(0, 500);
    if (!t) throw new Error('Isi update kosong');
    await addDoc(collection(adminDb, "poUpdates", pid, "items"), { pid, text: t, type: 'manual', kind: 'manual', createdAt: serverTimestamp() });
}
export async function adminHapusUpdatePo(pid, id) {
    await deleteDoc(doc(adminDb, "poUpdates", pid, "items", id));
}
export async function getPoUpdates(pids) {
    const out = [];
    for (const pid of (pids || []).slice(0, 10)) {
        try {
            const s = await getDocs(collection(db, "poUpdates", pid, "items"));
            s.docs.forEach(d => out.push({ id: d.id, pid, ...d.data() }));
        } catch (e) { console.error(e); }
    }
    return urutItems(out);
}
/* ----- Admin: "Selesaikan Artikel Pre Order" -----
   HANYA keterangan: menandai produk poClosed dan menambah update "Pre Order selesai" di timeline semua order artikel itu.
   Tidak memblokir pembelian di katalog (itu diatur lewat badge SOLD OUT). Order/payment/timeline lama tidak disentuh. */
export async function adminTutupPo(produkId, nama, closed) {
    await updateDoc(doc(adminDb, "produk", produkId), { poClosed: !!closed, poClosedAt: closed ? new Date().toISOString() : null });
    const ref = doc(adminDb, "poUpdates", produkId, "items", "closed");
    if (closed) {
        if (!(await getDoc(ref)).exists()) await setDoc(ref, { pid: produkId, text: 'Pre Order selesai', type: 'automatic', kind: 'closed', createdAt: serverTimestamp() });
    } else {
        await deleteDoc(ref);
    }
}
// Salin langkah lama per-artikel (poTrack: vendor/jadi/kirim) jadi update per artikel. Idempotent (ID tetap).
export async function adminBackfillPoUpdates(poTrackMap) {
    let n = 0;
    for (const pid of Object.keys(poTrackMap || {})) {
        const ev = (poTrackMap[pid] && poTrackMap[pid].events) || {};
        for (const key of Object.keys(LEGACY_LABEL)) {
            if (!ev[key] || !ev[key].at) continue;
            const at = new Date(ev[key].at); if (isNaN(at)) continue;
            const ref = doc(adminDb, "poUpdates", pid, "items", "legacy-" + key);
            if ((await getDoc(ref)).exists()) continue;
            const label = LEGACY_LABEL[key] + (key === 'kirim' && ev[key].note ? ' — ' + ev[key].note : '');
            await setDoc(ref, { pid, text: label, type: 'manual', kind: 'legacy', createdAt: Timestamp.fromDate(at) });
            n++;
        }
    }
    return n;
}
export function listenPoTrack(cb) {
    return onSnapshot(collection(adminDb, "poTrack"), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
}

/* ----- Admin: backfill / sinkron order lama (aman diulang) -----
   - beri ID bila belum punya (prefix dari artikel, fallback FVCK) -- ID yang sudah ada TIDAK diubah
   - buat/lengkapi lacak/{kode}
   - Pre Order: buat event "Pesanan dibuat" (waktu order asli), "Pelunasan" bila sudah lunas setelah DP,
     dan salin langkah lama per-artikel (vendor/jadi/kirim) jadi update manual di timeline order tsb.
   Tidak membuat order baru, tidak menghapus apa pun. Semua dokumen memakai ID tetap => tidak pernah dobel. */
// Admin: isi/ubah harga order (untuk order lama yang belum punya harga kaos / ongkir).
// total = harga kaos + ongkir - diskon. Bila status DP: sisa dihitung ulang (total - DP) dan halaman Pelunasan ikut. Data pelacakan ikut diperbarui.
export async function adminEditHarga(o, hargaKaos, ongkir, diskon) {
    const total = Number(hargaKaos) + Number(ongkir) - Number(diskon);
    if (!(total > 0)) throw new Error('Total harus lebih dari 0');
    const isDP = o.status === 'dp';
    const dpN = Number(o.dpNominal || 0);
    const sisa = isDP ? total - dpN : null;
    if (isDP && sisa <= 0) throw new Error('Total harus lebih besar dari DP (' + dpN + ')');
    const upd = { hargaKaos: Number(hargaKaos), ongkir: Number(ongkir), diskon: Number(diskon), totalAkhir: total };
    if (isDP) upd.sisaBayar = sisa;
    await updateDoc(doc(adminDb, "orders", o.id), upd);
    const kode = o.kodePelunasan;
    if (kode) {
        try {
            const pRef = doc(adminDb, "pelunasan", kode);
            if ((await getDoc(pRef)).exists() && isDP) await updateDoc(pRef, { totalAkhir: total, sisa });
        } catch (e) { console.error('pelunasan', e); }
        try {
            const lRef = doc(adminDb, "lacak", kode);
            if ((await getDoc(lRef)).exists()) await updateDoc(lRef, isDP ? { total, sisa } : { total });
        } catch (e) { console.error('lacak', e); }
    }
    return { total, sisa };
}
// Admin: daftar ID order yang sudah punya dokumen pelacakan (lacak/{kode}). Dipakai untuk menemukan order yang belum bisa dicek pelanggan.
export async function adminKodeLacakAda() {
    const s = await getDocs(collection(adminDb, "lacak"));
    return new Set(s.docs.map(d => d.id));
}
const LEGACY_LABEL = { vendor: 'Kaos masuk vendor', jadi: 'Kaos sudah jadi', kirim: 'Kaos dikirim' };
export async function adminBackfillOrder(o, ctx = {}) {
    const produkList = ctx.produkList || [];
    const poTrackMap = ctx.poTrackMap || {};
    const r = { idBaru: false, lacakBaru: false, events: 0 };
    let kode = o.kodePelunasan;
    if (!kode) {
        let prefix = o.kodePrefix || '';
        if (!prefix) {
            const namaList = Array.isArray(o.produk) ? o.produk.map(p => p.nama) : [o.produk];
            const p = produkList.find(x => namaList.includes(x.nama) && x.kodePrefix);
            if (p) prefix = p.kodePrefix;
        }
        for (let i = 0; i < 10 && !kode; i++) {
            const c = buatKodePelunasan(prefix);
            if (!(await getDoc(doc(adminDb, "lacak", c))).exists()) kode = c;
        }
        if (!kode) throw new Error('Gagal membuat ID unik');
        await updateDoc(doc(adminDb, "orders", o.id), { kodePelunasan: kode });
        o = { ...o, kodePelunasan: kode };
        r.idBaru = true;
    }
    const tp = turunanPO(o, produkList);
    if (o.isPO !== tp.isPO || (o.poIds || []).length !== tp.poIds.length) {
        await updateDoc(doc(adminDb, "orders", o.id), { isPO: tp.isPO, poIds: tp.poIds, poNames: tp.poNames });
        o = { ...o, isPO: tp.isPO, poIds: tp.poIds, poNames: tp.poNames };
    }
    const lRef = doc(adminDb, "lacak", kode);
    const lSnap = await getDoc(lRef);
    const isPO = tp.isPO;
    const pay = payDariStatus(o.status);
    const dpN = Number(o.dpNominal || 0);
    const data = {
        kode, orderId: o.id, orderNo: o.orderNo || '', isPO,
        nama: maskNama(o.nama), email: maskEmail(o.email), hp: maskHP(o.wa),
        produk: o.produkText || namaProdukUtama(o), items: itemsDariOrder(o),
        poIds: o.poIds || [], poNames: o.poNames || [],
        total: totalDariOrder(o), dpNominal: dpN || null,
        sisa: pay === 'dp' ? Number(o.sisaBayar || 0) : 0, pay
    };
    if (!lSnap.exists()) {
        await setDoc(lRef, { ...data, payAt: (pay === 'lunas' || pay === 'dp') ? (o.createdAt || null) : null, createdAt: o.createdAt || new Date().toISOString() });
        r.lacakBaru = true;
    } else {
        await setDoc(lRef, data, { merge: true });
    }
    await indeksLacak(adminDb, o, kode);   // idempotent
    if (!isPO) return r;

    const tl = collection(adminDb, "lacak", kode, "timeline");
    const bikin = async (id, payload) => {
        const ref = doc(tl, id);
        if ((await getDoc(ref)).exists()) return;
        await setDoc(ref, { kode, orderId: o.id, ...payload });
        r.events++;
    };
    await bikin('created', { text: 'Pesanan dibuat', type: 'automatic', kind: 'created', createdAt: Timestamp.fromDate(new Date(o.createdAt || Date.now())) });
    if (o.status === 'lunas' && dpN > 0) {
        const t = (lSnap.exists() && lSnap.data().payAt) ? new Date(lSnap.data().payAt) : new Date();
        await bikin('pelunasan', { text: 'Pelunasan', type: 'automatic', kind: 'pelunasan', createdAt: Timestamp.fromDate(isNaN(t) ? new Date() : t) });
    }
    return r;
}

/* ----- Shim kompatibilitas: admin.js lama yang masih tersimpan di cache browser tetap bisa tersambung (tidak mati total).
   Fungsi lama ini sudah digantikan; bila terpanggil, minta muat ulang. ----- */
const _usang = () => { throw new Error('Versi halaman lama (cache). Muat ulang halaman admin (tarik ke bawah / hapus cache).'); };
export async function adminTandaiLunas(orderId) { return adminLunaskan(orderId); }
export async function adminSetPoStep() { _usang(); }
export async function adminHapusPoStep() { _usang(); }
