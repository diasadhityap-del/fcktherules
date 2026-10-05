import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc,
  query, orderBy, onSnapshot, setDoc, where, getDoc, deleteField, arrayUnion
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
// Kode untuk customer: PREFIX-XXXXX (acak, tidak menunjukkan ID dokumen)
export function buatKodePelunasan(prefix) { return (bersihkanPrefix(prefix) || 'FVCK') + '-' + randStr(5); }
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
    await adminSyncPay(kode, 'dp', sisa);
    return { sisa, total };
}
export async function adminTandaiLunas(orderId, kode) {
    if (kode) { try { await updateDoc(doc(adminDb, "pelunasan", kode), { status: 'lunas' }); } catch (e) { console.error(e); } }
    await updateDoc(doc(adminDb, "orders", orderId), { status: 'lunas', sisaBayar: 0 });
    await adminSyncPay(kode, 'lunas', 0);
    return true;
}

/* ============== ORDER ============== */
export async function saveOrder(orderData) {
    try {
        // ID admin yang mudah dibaca (mirip slug artikel) + kode pelunasan untuk customer (beda dari ID dokumen)
        if (!orderData.orderNo) orderData.orderNo = buatOrderNo(namaProdukUtama(orderData));
        // ID pesanan (kodePelunasan) dibuat untuk semua order Pre Order, plus order DP biasa
        if ((orderData.dpEligible || orderData.isPO) && !orderData.kodePelunasan) orderData.kodePelunasan = buatKodePelunasan(orderData.kodePrefix);
        const docRef = await addDoc(collection(db, "orders"), {
            ...orderData,
            status: "pending",
            createdAt: new Date().toISOString()
        });
        // Order Pre Order: buat dokumen pelacakan (gagal di sini tidak membatalkan order)
        if (orderData.isPO && orderData.kodePelunasan) {
            try { await buatLacak(docRef.id, orderData); } catch (e) { console.error("Gagal buat pelacakan:", e); }
        }
        return docRef.id;
    } catch (err) { console.error("Gagal simpan order:", err); return null; }
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
async function buatLacak(orderId, o) {
    const kode = o.kodePelunasan;
    await setDoc(doc(db, "lacak", kode), {
        kode, orderId, orderNo: o.orderNo || '',
        nama: maskNama(o.nama),
        produk: o.produkText || namaProdukUtama(o),
        poIds: o.poIds || [], poNames: o.poNames || [],
        pay: 'pending', payAt: null, sisa: null,
        createdAt: new Date().toISOString()
    });
    const keys = [];
    if (o.wa) keys.push('hp:' + normHP(o.wa));
    if (o.email) keys.push('em:' + normEmail(o.email));
    for (const k of keys) {
        try {
            const ref = doc(db, "lacakIdx", await sha256Hex(k));
            const ex = await getDoc(ref);
            if (ex.exists()) await updateDoc(ref, { kodes: arrayUnion(kode) });
            else await setDoc(ref, { kodes: [kode] });
        } catch (e) { console.error("Gagal indeks lacak:", e); }
    }
}
// Customer: cari lewat ID, no HP, dan/atau email. Order yang artikel PO-nya sudah "selesai" tidak ditemukan.
export async function cariLacak({ kode, hp, email }) {
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
    kodes = [...new Set(kodes)].filter(Boolean).slice(0, 30);
    const out = [];
    for (const k of kodes) {
        const s = await getDoc(doc(db, "lacak", k));
        if (!s.exists()) continue;
        const d = s.data();
        const po = {};
        for (const id of (d.poIds || [])) {
            const p = await getDoc(doc(db, "poTrack", id));
            po[id] = p.exists() ? p.data() : { events: {}, closed: false };
        }
        const ids = d.poIds || [];
        if (ids.length && ids.every(id => po[id].closed)) continue;   // artikel PO sudah diselesaikan admin
        out.push({ ...d, po });
    }
    return out;
}
// Admin: sinkron langkah "Pelunasan" otomatis dari status order
export async function adminSyncPay(kode, status, sisa) {
    if (!kode) return;
    const pay = status === 'lunas' ? 'lunas' : status === 'dp' ? 'dp' : status === 'rejected' ? 'ditolak' : 'pending';
    try {
        await updateDoc(doc(adminDb, "lacak", kode), {
            pay,
            payAt: (pay === 'lunas' || pay === 'dp') ? new Date().toISOString() : null,
            sisa: pay === 'dp' ? Number(sisa || 0) : 0
        });
    } catch (e) { console.warn("Lacak tidak ada / gagal sync:", kode, e.code || e.message); }
}
export async function adminHapusLacak(kode) {
    if (!kode) return;
    try { await deleteDoc(doc(adminDb, "lacak", kode)); } catch (e) { console.warn(e); }
}
export function listenPoTrack(cb) {
    return onSnapshot(collection(adminDb, "poTrack"), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export async function adminSetPoStep(produkId, nama, key, atISO, note) {
    await setDoc(doc(adminDb, "poTrack", produkId), { nama, events: { [key]: { at: atISO, note: note || '' } } }, { merge: true });
}
export async function adminHapusPoStep(produkId, key) {
    await updateDoc(doc(adminDb, "poTrack", produkId), { ['events.' + key]: deleteField() });
}
export async function adminTutupPo(produkId, nama, closed) {
    await setDoc(doc(adminDb, "poTrack", produkId), { nama, closed: !!closed, closedAt: closed ? new Date().toISOString() : null }, { merge: true });
}
