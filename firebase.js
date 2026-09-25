import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc,
  query, orderBy, onSnapshot, setDoc, where, getDoc
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, onAuthStateChanged,
  GoogleAuthProvider, signInWithPopup
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
    return cred.user;
}

export async function customerSignOut() {
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

/* ============== ORDER ============== */
export async function saveOrder(orderData) {
    try {
        const docRef = await addDoc(collection(db, "orders"), {
            ...orderData,
            status: "pending",
            createdAt: new Date().toISOString()
        });
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