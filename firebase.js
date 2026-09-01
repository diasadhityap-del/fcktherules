import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCVL_C4opQiKC6fNG_Rw4l-519rQZICH58",
    authDomain: "fvcktherules-store.firebaseapp.com",
    projectId: "fvcktherules-store",
    storageBucket: "fvcktherules-store.firebasestorage.app",
    messagingSenderId: "382347904485",
    appId: "1:382347904485:web:6715a7b395d44ad07a5b0c"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Cloudinary config
// Cloudinary Config
export const CLOUDINARY_BUKTI_CLOUD = "dfbxrouwf";
export const CLOUDINARY_BUKTI_PRESET = "underline-bukti";

export const CLOUDINARY_PRODUK_CLOUD = "dfbxrouwf";
export const CLOUDINARY_PRODUK_PRESET = "underline-produk";

export const CLOUDINARY_GALERI_CLOUD = "dfbxrouwf";
export const CLOUDINARY_GALERI_PRESET = "underline-galeri";

// Simpan order ke Firestore
export async function saveOrder(orderData) {
    try {
        const docRef = await addDoc(collection(db, "orders"), {
            ...orderData,
            status: "pending",
            createdAt: new Date().toISOString()
        });
        return docRef.id;
    } catch (err) {
        console.error("Gagal simpan order:", err);
        return null;
    }
}

// Upload bukti ke Cloudinary
export async function uploadGambar(file, tipe = "bukti") {
    const config = {
        bukti: { cloud: CLOUDINARY_BUKTI_CLOUD, preset: CLOUDINARY_BUKTI_PRESET },
        produk: { cloud: CLOUDINARY_PRODUK_CLOUD, preset: CLOUDINARY_PRODUK_PRESET },
        galeri: { cloud: CLOUDINARY_GALERI_CLOUD, preset: CLOUDINARY_GALERI_PRESET }
    };
    const { cloud, preset } = config[tipe];
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", preset);
    try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
            method: "POST", body: formData
        });
        const data = await res.json();
        return data.secure_url;
    } catch (err) { console.error("Gagal upload:", err); return null; }
}

// Ambil semua order (untuk admin)
export async function getOrders() {
    try {

        const q = query(
            collection(db, "orders"),
            orderBy("createdAt", "desc")
        );

        const snapshot = await getDocs(q);

        return snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
        }));

    } catch (err) {

        console.error("Gagal ambil order:", err);

        return [];
    }
}

// Update status order
export async function updateOrderStatus(orderId, status) {
    try {
        await updateDoc(doc(db, "orders", orderId), { status });
        return true;
    } catch (err) {
        console.error("Gagal update status:", err);
        return false;
    }
}

// ===== PRODUK =====
export async function saveProduk(data) {
    try {
        await addDoc(collection(db, "produk"), { ...data, createdAt: new Date().toISOString() });
        return true;
    } catch (err) { console.error("Gagal simpan produk:", err); return false; }
}

export async function getProduk() {
    try {
        const q = query(collection(db, "produk"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) { console.error("Gagal ambil produk:", err); return []; }
}

export async function updateProduk(id, data) {
    try {
        await updateDoc(doc(db, "produk", id), data);
        return true;
    } catch (err) { console.error("Gagal update produk:", err); return false; }
}

export async function deleteProduk(id) {
    try {
        await deleteDoc(doc(db, "produk", id));
        return true;
    } catch (err) { console.error("Gagal hapus produk:", err); return false; }
}

// ===== GALERI =====
export async function saveGaleri(url) {
    try {
        await addDoc(collection(db, "galeri"), {
            url,
            order: Date.now(),
            createdAt: new Date().toISOString()
        });

        return true;

    } catch (err) {

        console.error("Gagal simpan galeri:", err);

        return false;
    }
}

export async function getGaleri() {
    try {
        const q = query(collection(db, "galeri"), orderBy("order", "asc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) { console.error("Gagal ambil galeri:", err); return []; }
}

export async function deleteGaleri(id) {
    try {
        await deleteDoc(doc(db, "galeri", id));
        return true;
    } catch (err) { console.error("Gagal hapus galeri:", err); return false; }
}

export async function updateGaleri(id, data) {

    try {

        await updateDoc(doc(db, "galeri", id), data);

        return true;

    } catch (err) {

        console.error("Gagal update galeri:", err);

        return false;
    }
}

export function listenProduk(callback) {

    const q = query(
        collection(db, "produk"),
        orderBy("order", "desc")
    );

    return onSnapshot(q, (snapshot) => {

        const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        callback(data);
    });
}

export function listenGaleri(callback) {

    const q = query(
        collection(db, "galeri"),
        orderBy("order", "asc")
    );

    return onSnapshot(q, (snapshot) => {

        const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        callback(data);
    });
}

// Login admin
export async function loginAdmin(email, password) {
    try {
        await signInWithEmailAndPassword(auth, email, password);
        return true;
    } catch (err) {
        console.error("Login gagal:", err);
        return false;
    }
}

// Logout admin
export async function logoutAdmin() {
    await signOut(auth);
}
