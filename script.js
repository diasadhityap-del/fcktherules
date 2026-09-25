import {
    listenProduk, listenGaleri, listenBanners, listenBannerText,
    auth, customerSignUp, customerSignIn, customerSignOut, customerSignInGoogle, onAuthStateChanged,
    getCustomerProfile, updateCustomerProfile, getCustomerOrders
} from './firebase.js';

let cartItems = [];
const URL_GAS_BITESHIP = "https://script.google.com/macros/s/AKfycbyDTEPvP5yndja35U02nkC4lsYRy3vQqVe2s4NTx-MxBE8MCSB9co2ztG5ZDMtJzuAO/exec";
let ongkirSaatIni = 0;

// ===== CUSTOMER AUTH STATE =====
let currentCustomer = null;
let authMode = 'signin'; // 'signin' | 'signup'

const PAGE_SLUGS = {
    home: '/',
    preorder: '/preorder',
    katalog: '/katalog',
    arsip: '/arsip',
    galeri: '/galeri',
    tentang: '/tentang'
};

const SLUG_TO_PAGE = {
    '': 'home',
    'preorder': 'preorder',
    'katalog': 'katalog',
    'arsip': 'arsip',
    'galeri': 'galeri',
    'tentang': 'tentang'
};

const PRODUCT_PAGES = ['detail', 'form', 'summary'];
const CART_PAGES = ['cartPage', 'cartForm', 'cartSummary'];
const ORDER_PAGES = [...PRODUCT_PAGES, ...CART_PAGES];

const CART_SLUGS = {
    cartPage: '/keranjang',
    cartForm: '/keranjang/form',
    cartSummary: '/keranjang/summary'
};

function updateMeta(title, description) {
    document.title = title;
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) descMeta.content = description;

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = title;

    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.content = description;
}

const META = {
    home: { title: 'FvcktheRules | Make a Stand with Pride', desc: 'Soccer culture, street attitude.' },
    katalog: { title: 'Katalog | FvcktheRules', desc: 'Koleksi lengkap FvcktheRules Store.' },
    preorder: { title: 'Pre Order | FvcktheRules', desc: 'Pre order produk terbaru FvcktheRules.' },
    arsip: { title: 'Arsip | FvcktheRules', desc: 'Koleksi arsip FvcktheRules Store.' },
    galeri: { title: 'Galeri | FvcktheRules', desc: 'Galeri foto FvcktheRules Store.' },
    tentang: { title: 'Tentang Kami | FvcktheRules', desc: 'FvcktheRules, built for those who carry football into everyday life.' }
};

function slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').trim();
}

function formatRupiah(value) {
    return 'Rp' + Number(String(value).replace(/\D/g, '')).toLocaleString('id-ID');
}

function hargaAngka(value) {
    return Number(String(value).replace(/\D/g, ''));
}

function totalKeranjang() {
    return cartItems.reduce((sum, i) => sum + hargaAngka(i.prod.price), 0);
}

let galleryImages = [];
let products = [];
let cart = { prod: null, size: '', color: '' };
let lastPage = 'home';
let routed = false;

// ── CART FUNCTIONS ──────────────────────────────────────────
let addToCartLock = false;
function addToCart() {
    if (addToCartLock) return; // cegah double-tap memicu berkali-kali
    if (!cart.prod) return triggerAlert("PRODUK TIDAK DITEMUKAN!");
    if (!cart.color) return triggerAlert("PILIH WARNA DULU!");
    if (!cart.size) return triggerAlert("PILIH UKURAN DULU!");

    addToCartLock = true;
    setTimeout(() => { addToCartLock = false; }, 800);

    cartItems.push({
        id: Date.now(),
        prod: cart.prod,
        size: cart.size,
        color: cart.color
    });

    vibrate([30, 30, 30]);
    updateCartBadge();
    showCartToast();
}

function openCart() {
    vibrate(30);
    renderCartPage();
    showPage('cartPage');
}

function updateCartBadge() {
    const badge = document.getElementById('cartBadge');
    if (!badge) return;
    badge.innerText = cartItems.length;
    badge.style.display = cartItems.length > 0 ? 'flex' : 'none';
    const btn = document.getElementById('floatingCartBtn');
    if (btn) btn.style.display = cartItems.length > 0 ? 'flex' : 'none';
}

let cartToastTimer = null;
const CART_TOAST_DEFAULT = '<i class="fas fa-check" style="margin-right:6px;"></i> Ditambahkan ke keranjang!';

function showCartToast(msg) {
    const toast = document.getElementById('cartToast');
    if (!toast) return;

    // Batalkan timer sebelumnya biar tidak tumpang tindih / tersangkut kebuka terus
    if (cartToastTimer) {
        clearTimeout(cartToastTimer);
        cartToastTimer = null;
    }

    toast.innerHTML = msg
        ? `<i class="fas fa-check" style="margin-right:6px;"></i> ${msg}`
        : CART_TOAST_DEFAULT;

    toast.classList.add('show');
    cartToastTimer = setTimeout(() => {
        toast.classList.remove('show');
        cartToastTimer = null;
        // Kembalikan ke pesan default setelah hilang, supaya add-to-cart berikutnya benar
        toast.innerHTML = CART_TOAST_DEFAULT;
    }, 2000);
}

function removeCartItem(id) {
    vibrate(20);
    cartItems = cartItems.filter(i => i.id !== id);
    updateCartBadge();
    renderCartPage();

    if (cartItems.length === 0) {
        const floatingBtn = document.getElementById('floatingCartBtn');
        if (floatingBtn) floatingBtn.style.display = 'none';

        const cPage = document.getElementById('cartPage');
        if (cPage && cPage.classList.contains('active')) {
            showPage(lastPage || 'home');
        }
    }
}

function renderCartPage() {
    const container = document.getElementById('cartList');
    if (!container) return;

    if (cartItems.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:60px 20px; color:#444;">
                <i class="fas fa-shopping-bag" style="font-size:48px; margin-bottom:20px; display:block;"></i>
                <p style="font-weight:700; font-size:14px; letter-spacing:1px;">KERANJANG KOSONG</p>
                <p style="font-size:12px; margin-top:8px; color:#333;">Tambahkan produk dulu yuk!</p>
            </div>`;
        const chkBtn = document.getElementById('cartCheckoutBtn');
        if (chkBtn) chkBtn.style.display = 'none';
        const tEl0 = document.getElementById('cartTotal');
        if (tEl0) tEl0.innerText = 'Rp0';
        return;
    }

    const total = totalKeranjang();

    container.innerHTML = cartItems.map(item => `
        <div style="background:#ffffff; border:1px solid #eaeaea; border-radius:15px; padding:16px; margin-bottom:12px; display:flex; gap:14px; align-items:center;">
            <img src="${item.prod.thumbnail}" style="width:70px; height:70px; object-fit:cover; border-radius:10px; flex-shrink:0;">
            <div style="flex:1; min-width:0;">
                <p style="font-weight:700; font-size:13px; margin:0 0 4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#000;">${item.prod.name}</p>
                <p style="font-size:11px; color:#888; margin:0 0 6px;">${item.color} | ${item.size}</p>
                <p style="font-size:13px; color:#000000; font-weight:700; margin:0;">${formatRupiah(item.prod.price)}</p>
            </div>
            <button onclick="removeCartItem(${item.id})" style="background:#f9f9f9; border:1px solid #eaeaea; color:#000000; border-radius:8px; width:32px; height:32px; cursor:pointer; font-size:14px; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `).join('');

    const tEl = document.getElementById('cartTotal');
    if (tEl) tEl.innerText = formatRupiah(total);

    const chkBtn = document.getElementById('cartCheckoutBtn');
    if (chkBtn) chkBtn.style.display = 'block';
}

function goToCartCheckout() {
    vibrate(40);
    showPage('cartForm');
    autofillCheckoutFromProfile('cart');
}

function validateCartForm() {
    vibrate(40);
    const n = document.getElementById('cartInName').value;
    const p = document.getElementById('cartInPhone').value;

    const alamatDetail = document.getElementById('cartInAddress').value;
    const prov = document.getElementById('cartInProvinsi').value;
    const kota = document.getElementById('cartInKota').value;
    const kec = document.getElementById('cartInKecamatan').value;
    const kel = document.getElementById('cartInKelurahan').value;
    const kodePos = document.getElementById('cartInKodePos').value;

    const a = `${alamatDetail}, ${kel}, Kec. ${kec}, ${kota}, ${prov} ${kodePos}`;

    if (!n || !p || !alamatDetail || !prov || !kel) return triggerAlert("LENGKAPI DATA!");

    const adaProdukTanpaDP = cartItems.some(item => item.prod.dpAllowed === 'no');
    const cartDpNote = document.getElementById('cartDpNoteArea');

    if (adaProdukTanpaDP) {
        if (cartDpNote) cartDpNote.style.display = 'none';
    } else {
        if (cartDpNote) {
            cartDpNote.style.display = 'block';
            cartDpNote.innerHTML = '<p style="font-size:13px; color:#000; font-weight:700; margin:0; text-align:center; padding:15px; border:1px solid #eaeaea; border-radius:12px; background:#f9f9f9;"><i class="fas fa-info-circle" style="margin-right:5px;"></i> Pembayaran dapat dilakukan secara Full (Lunas) atau DP minimal Rp70.000.</p>';
        }
    }

    const itemsHTML = cartItems.map(item => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid #eaeaea;">
            <div>
                <p style="font-size:13px; font-weight:700; margin:0 0 3px; color:#000;">${item.prod.name}</p>
                <p style="font-size:11px; color:#888; margin:0;">${item.color} | ${item.size}</p>
            </div>
            <p style="font-size:13px; color:#000000; font-weight:700; margin:0; flex-shrink:0; margin-left:10px;">${formatRupiah(item.prod.price)}</p>
        </div>
    `).join('');

    const total = totalKeranjang();

    const sumItems = document.getElementById('cartSumItems');
    if (sumItems) sumItems.innerHTML = itemsHTML;

    const idAreaCart = document.getElementById('cartInAreaId');
    if (!idAreaCart || !idAreaCart.value || ongkirSaatIni === 0) return triggerAlert("TUNGGU ONGKIR MUNCUL DULU!");

    const sumOngkirCart = document.getElementById('cartSumOngkir');
    if (sumOngkirCart) sumOngkirCart.innerText = formatRupiah(ongkirSaatIni);

    const sumTotal = document.getElementById('cartSumTotal');
    if (sumTotal) sumTotal.innerText = formatRupiah(total + ongkirSaatIni);

    const sumCust = document.getElementById('cartSumCust');
    if (sumCust) sumCust.innerHTML = `<strong>${n}</strong><br>${p}<br>${a}`;

    showPage('cartSummary');
}

let currentCheckoutType = '';

function confirmCheckout(type) {
    vibrate(30);
    if (type === 'single') {
        const inputB = document.getElementById('inputBukti');
        if (!inputB || !inputB.files[0]) return triggerAlert("UPLOAD BUKTI BAYAR DULU!");
        if (!uploadedBuktiURL) return triggerAlert("TUNGGU UPLOAD SELESAI!");
    } else {
        const inputB = document.getElementById('cartInputBukti');
        if (!inputB || !inputB.files[0]) return triggerAlert("UPLOAD BUKTI BAYAR DULU!");
        if (!uploadedCartBuktiURL) return triggerAlert("TUNGGU UPLOAD SELESAI!");
    }

    currentCheckoutType = type;
    const m = document.getElementById('confirmModal');
    if (m) m.style.display = 'flex';
}

function closeConfirm() {
    vibrate(20);
    const m = document.getElementById('confirmModal');
    if (m) m.style.display = 'none';
}

async function executeCheckout() {
    vibrate(40);
    closeConfirm();

    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyoVdbvq1JvCtzWFbJaZUdTO2I30DXn4N0p_XOidk98cPnj8m22j2Aa0q6k90KH4sOhUw/exec';
    const loader = document.getElementById('loader');
    if (loader) loader.classList.remove('hide');

    try {
        const { saveOrder } = await import('./firebase.js');

        if (currentCheckoutType === 'single') {
            const n = document.getElementById('inName').value;
            const p = document.getElementById('inPhone').value;
            const email = document.getElementById('inEmail')?.value?.trim() || (currentCustomer?.email || '');

            const alamatDetail = document.getElementById('inAddress').value;
            const prov = document.getElementById('inProvinsi').value;
            const kota = document.getElementById('inKota').value;
            const kec = document.getElementById('inKecamatan').value;
            const kel = document.getElementById('inKelurahan').value;
            const kodePos = document.getElementById('inKodePos').value;
            const a = `${alamatDetail}, ${kel}, Kec. ${kec}, ${kota}, ${prov} ${kodePos}`;

            const buktiURL = uploadedBuktiURL;
            const hargaProduk = hargaAngka(cart.prod.price);

            const totalAkhir = hargaProduk + ongkirSaatIni - nilaiDiskon;

            const orderData = {
                nama: n, wa: p, email: email, alamat: a,
                customerUid: currentCustomer?.uid || null,
                produk: cart.prod.name, warna: cart.color, size: cart.size,
                hargaKaos: hargaProduk,
                ongkir: ongkirSaatIni,
                voucherKode: appliedVoucher ? appliedVoucher.kode : "",
                voucherDeskripsi: appliedVoucher ? appliedVoucher.deskripsi : "",
                totalAkhir: totalAkhir,
                tipeBayar: 'Cek Bukti Bayar',
                dp: '', buktiURL: buktiURL
            };

            const orderId = await saveOrder(orderData);
            if (!orderId) throw new Error('saveOrder gagal');

            if (appliedVoucher) {
                try {
                    const { updateVoucherKuota } = await import('./firebase.js');
                    if (updateVoucherKuota) await updateVoucherKuota(appliedVoucher.id, appliedVoucher.kuota - 1);
                } catch (e) { console.error(e); }
                removeVoucher('single');
            }

            fetch(SCRIPT_URL, {
                method: "POST", mode: "no-cors", cache: "no-cache",
                headers: { "Content-Type": "text/plain" }, body: JSON.stringify(orderData)
            }).catch(err => console.error(err));

            hapusBukti('inputBukti', 'fileChip', 'previewImg', 'labelBukti');
            document.getElementById('inName').value = '';
            document.getElementById('inPhone').value = '';
            document.getElementById('inAddress').value = '';
            cart = { prod: null, size: '', color: '' };

        } else if (currentCheckoutType === 'cart') {
            const n = document.getElementById('cartInName').value;
            const p = document.getElementById('cartInPhone').value;
            const email = document.getElementById('cartInEmail')?.value?.trim() || (currentCustomer?.email || '');

            const alamatDetail = document.getElementById('cartInAddress').value;
            const prov = document.getElementById('cartInProvinsi').value;
            const kota = document.getElementById('cartInKota').value;
            const kec = document.getElementById('cartInKecamatan').value;
            const kel = document.getElementById('cartInKelurahan').value;
            const kodePos = document.getElementById('cartInKodePos').value;
            const a = `${alamatDetail}, ${kel}, Kec. ${kec}, ${kota}, ${prov} ${kodePos}`;

            const buktiURL = uploadedCartBuktiURL;
            const totalProduk = totalKeranjang();

            const totalAkhir = totalProduk + ongkirSaatIni - nilaiDiskon;

            const orderData = {
                nama: n, wa: p, email: email, alamat: a,
                customerUid: currentCustomer?.uid || null,
                produk: cartItems.map(i => ({ nama: i.prod.name, warna: i.color, size: i.size, harga: i.prod.price })),
                produkText: cartItems.map(i => `${i.prod.name} (${i.color}|${i.size})`).join(', '),
                hargaKaos: totalProduk,
                ongkir: ongkirSaatIni,
                voucherKode: appliedVoucher ? appliedVoucher.kode : "",
                voucherDeskripsi: appliedVoucher ? appliedVoucher.deskripsi : "",
                totalAkhir: totalAkhir,
                tipeBayar: 'Cek Bukti Bayar',
                dp: '', buktiURL: buktiURL
            };

            const orderId = await saveOrder(orderData);
            if (!orderId) throw new Error('saveOrder gagal');

            if (appliedVoucher) {
                try {
                    const { updateVoucherKuota } = await import('./firebase.js');
                    if (updateVoucherKuota) await updateVoucherKuota(appliedVoucher.id, appliedVoucher.kuota - 1);
                } catch (e) { console.error(e); }
                removeVoucher('cart');
            }

            fetch(SCRIPT_URL, {
                method: "POST", mode: "no-cors", cache: "no-cache",
                headers: { "Content-Type": "text/plain" }, body: JSON.stringify(orderData)
            }).catch(err => console.error(err));

            cartItems = [];
            updateCartBadge();
            hapusBukti('cartInputBukti', 'cartFileChip', 'cartPreviewImg', 'cartLabelBukti');
            document.getElementById('cartInName').value = '';
            document.getElementById('cartInPhone').value = '';
            document.getElementById('cartInAddress').value = '';
        }

        showPage('home');
        setTimeout(() => {
            triggerAlert("PESANAN BERHASIL DITERIMA!");
        }, 500);

    } catch (err) {
        console.error(err);
        triggerAlert("GAGAL MENYIMPAN! COBA LAGI.");
    } finally {
        if (loader) loader.classList.add('hide');
    }
}

let uploadedCartBuktiURL = null;
async function previewCartBukti(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
        const previewImg = document.getElementById('cartPreviewImg');
        const fileChip = document.getElementById('cartFileChip');
        const fileName = document.getElementById('cartFileName');

        if (previewImg) previewImg.src = e.target.result;
        if (fileName) fileName.innerText = file.name;
        if (fileChip) {
            fileChip.style.display = 'flex';
            fileChip.style.opacity = '0.5';
        }
    };
    reader.readAsDataURL(file);

    const label = document.getElementById('cartLabelBukti');
    if (label) label.innerText = ' Mengupload...';

    const { uploadGambar } = await import('./firebase.js');
    uploadedCartBuktiURL = await uploadGambar(file, 'bukti');

    const fileChip = document.getElementById('cartFileChip');
    if (uploadedCartBuktiURL) {
        if (fileChip) fileChip.style.opacity = '1';
        if (label) label.innerText = ' ✓ Upload berhasil!';
    } else {
        if (fileChip) fileChip.style.display = 'none';
        if (label) label.innerText = ' ✗ Gagal upload, coba lagi';
        uploadedCartBuktiURL = null;
    }
}

let uploadedBuktiURL = null;
async function previewBukti(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
        const previewImg = document.getElementById('previewImg');
        const fileChip = document.getElementById('fileChip');
        const fileName = document.getElementById('fileName');

        if (previewImg) previewImg.src = e.target.result;
        if (fileName) fileName.innerText = file.name;
        if (fileChip) {
            fileChip.style.display = 'flex';
            fileChip.style.opacity = '0.5';
        }
    };
    reader.readAsDataURL(file);

    const label = document.getElementById('labelBukti');
    if (label) label.innerText = ' Mengupload...';

    const { uploadGambar } = await import('./firebase.js');
    uploadedBuktiURL = await uploadGambar(file, 'bukti');

    const fileChip = document.getElementById('fileChip');
    if (uploadedBuktiURL) {
        if (fileChip) fileChip.style.opacity = '1';
        if (label) label.innerText = '✓ Upload berhasil!';
    } else {
        if (fileChip) fileChip.style.display = 'none';
        if (label) label.innerText = '✗ Gagal upload, coba lagi';
        uploadedBuktiURL = null;
    }
}

function hapusBukti(inputId, chipId, imgId, labelId) {
    vibrate(20);
    const inp = document.getElementById(inputId);
    if (inp) inp.value = '';
    const chip = document.getElementById(chipId);
    if (chip) chip.style.display = 'none';
    const img = document.getElementById(imgId);
    if (img) img.src = '';
    const lbl = document.getElementById(labelId);
    if (lbl) lbl.innerText = 'Tap untuk upload foto bukti';

    if (inputId === 'inputBukti') {
        uploadedBuktiURL = null;
    } else {
        uploadedCartBuktiURL = null;
    }
}

// ── ROUTING AWAL ───────────────────────────────────────────
function handleInitialRoute() {
    if (routed) return;
    routed = true;

    const path = window.location.pathname.replace(/^\//, '').replace(/\/$/, '').toLowerCase();

    if (path === '' || SLUG_TO_PAGE[path] !== undefined) {
        const targetPage = SLUG_TO_PAGE[path] || 'home';
        if (targetPage !== 'home') showPage(targetPage);
        return;
    }

    const orderMatch = path.match(/^([^\/]+)$/)
        || path.match(/^([^\/]+)\/detail$/)
        || path.match(/^([^\/]+)\/form$/)
        || path.match(/^([^\/]+)\/summary$/);

    if (orderMatch) {
        const productSlug = orderMatch[1];
        let pageId = 'detail';
        if (path.endsWith('/form')) pageId = 'form';
        if (path.endsWith('/summary')) pageId = 'summary';

        const found = products.find(p => slugify(p.name) === productSlug);

        if (found) {
            cart = { prod: found, size: '', color: found.colors.length === 1 ? found.colors[0] : '' };
            goDetailSilent(found);
            showPageSilent('detail');
            if (!document.referrer.includes(window.location.hostname)) {
                history.replaceState({ page: 'home' }, '', '/');
                history.pushState({ page: 'detail', product: productSlug }, '', `/${productSlug}`);
            }
            return;
        }
    }

    history.replaceState({ page: 'home' }, '', '/');
    showPage('home');
}

window.onload = async () => {
    try {
        history.replaceState({ page: 'home' }, '', window.location.pathname);
        initProvinsiDropdown();

        listenBannerText((data) => {
            const barAtas = document.getElementById('barAtas');
            const barBawah = document.getElementById('barBawah');

            if (barAtas) {
                if (data.topText && data.topText.trim() !== "") {
                    barAtas.innerText = data.topText;
                    barAtas.style.display = 'block';
                } else {
                    barAtas.style.display = 'none';
                }
            }

            if (barBawah) {
                if (data.bottomText && data.bottomText.trim() !== "") {
                    barBawah.innerText = data.bottomText;
                    barBawah.style.display = 'block';
                } else {
                    barBawah.style.display = 'none';
                }
            }
        });

        listenBanners((firestoreBanners) => {
            renderBannerSlider(firestoreBanners);
        });

        listenProduk((firestoreProducts) => {
            products = firestoreProducts.map(p => ({
                id: p.id,
                name: p.nama,
                price: p.harga,
                badge: p.badge?.toLowerCase() || '',
                status: p.status || '',
                colors: p.warna ? p.warna.split('/').map(c => c.trim()) : [],
                stock: p.stok ? p.stok.split('/').map(s => s.trim()) : [],
                thumbnail: p.thumbnail || '',
                details: p.details || [],
                specs: p.specs || '',
                showcase: p.showcase || 'no',
                dpAllowed: p.dpAllowed || 'yes',
                order: p.order || 0
            }));

            products.sort((a, b) => (b.order || 0) - (a.order || 0));
            renderAllSections();
            handleInitialRoute();
        });

        listenGaleri((firestoreGaleri) => {
            galleryImages = firestoreGaleri.map(g => g.url);
            renderGallery();
        });
    } catch (error) {
        console.error("Initialization Error:", error);
    } finally {
        setTimeout(() => {
            const loader = document.getElementById('loader');
            if (loader) loader.classList.add('hide');
        }, 1000);
    }

    window.addEventListener('popstate', (e) => {
        const page = e.state?.page || 'home';
        const menuBtn = document.querySelector('.menu-btn');

        const invalidProduct = PRODUCT_PAGES.includes(page) && !cart.prod;
        const invalidCart = CART_PAGES.includes(page) && cartItems.length === 0;

        if (invalidProduct || invalidCart) {
            history.replaceState({ page: 'home' }, '', '/');
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            const pHome = document.getElementById('home');
            if (pHome) pHome.classList.add('active');
            if (menuBtn) menuBtn.style.display = 'flex';
            return;
        }

        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const target = document.getElementById(page);
        if (target) {
            target.classList.add('active');
            target.scrollTop = 0;
        }

        if (ORDER_PAGES.includes(page)) {
            if (menuBtn) menuBtn.style.display = 'none';
        } else {
            if (menuBtn) menuBtn.style.display = 'flex';
            lastPage = page;
        }
    });
};

function renderAllSections() {
    renderList(products.filter(p => p.showcase === 'yes'), 'list-home');
    renderList(products.filter(p => p.badge === 'pre'), 'list-preorder');
    renderList(products.filter(p => p.badge === 'ready'), 'list-katalog');
    renderList(products.filter(p => p.badge === 'sold'), 'list-arsip');
    injectFooters();
}

function renderList(items, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    items.forEach(p => {
        const isSold = p.badge === 'sold';
        container.innerHTML += `
            <div class="card ${isSold ? 'sold-out-display' : ''}">
                <div class="badge ${p.badge}">${p.status}</div>
                <img src="${p.thumbnail}">
                <div style="padding:25px">
                    <h3>${p.name}</h3>
                    <p style="opacity:0.5; font-weight:600;">${isSold ? 'OUT OF STOCK' : formatRupiah(p.price)}</p>
                    <button onclick="sessionStorage.setItem('lastPage', document.querySelector('.page.active') ? document.querySelector('.page.active').id : 'home'); vibrate(40); goDetail('${p.id}');" ${isSold ? 'disabled' : ''}>
                        ${isSold ? 'SOLD' : 'SELECT'}
                    </button>
                </div>
            </div>`;
    });
}

function renderGallery() {
    const container = document.getElementById('gallery-container');
    if (!container) return;
    container.innerHTML = '';
    galleryImages.forEach(img => {
        container.innerHTML += `<img src="${img}" loading="lazy" onclick="vibrate(20); openImage('${img}')">`;
    });
}

function openImage(src) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImg');
    if (modalImg) modalImg.src = src;
    if (modal) modal.style.display = 'flex';
    vibrate(20);
}

function closeImage() {
    const modal = document.getElementById('imageModal');
    if (modal) modal.style.display = 'none';
}

function injectFooters() {
    const footerHTML = `
        <footer>
            <div class="footer-logo" style="margin-bottom: -40px;">
                <img src="https://res.cloudinary.com/dfbxrouwf/image/upload/v1788256148/Tak_berjudul26_20260901160311_g4gy1e.png" alt="Logo" style="width: 270px; max-width: 100%; height: auto; display: block; margin: 0 auto;">
            </div>
            <div class="footer-slogan" style="margin-top: 5px;">BORN TO DISOBEY</div>
            <div class="footer-socials">
                <a href="https://www.instagram.com/fucktherules.exe?igsi=cDYyZDRnenR3MTY0" target="_blank" onclick="vibrate(30)"><i class="fab fa-instagram"></i></a>
                <a href="https://wa.me/6285725706337" target="_blank" onclick="vibrate(30)"><i class="fab fa-whatsapp"></i></a>
                <a href="https://shopee.co.id/fvcktherules__" target="_blank" onclick="vibrate(30)"><i class="fas fa-shopping-bag"></i></a>
            </div>
            <div class="footer-contact-title">KONTAK KAMI :</div>
            <div class="footer-contact-info">
                Saluran WhatsApp : <a href="https://whatsapp.com/channel/0029VbD2hZqEKyZQXCFpkD2p" target="_blank"><i class="fab fa-whatsapp"></i> Klik Disini</a><br>
                WhatsApp : <a href="https://wa.me/6285725706337">085725706337</a><br>
                Email : <a href="mailto:fucktherules34@gmail.com">fucktherules34@gmail.com</a>
            </div>
            <p class="copyright">© 2026 FVCKTHERULES. All rights reserved.</p>
        </footer>`;

    ['home', 'pre', 'kat', 'ars', 'about', 'galeri'].forEach(id => {
        const el = document.getElementById(`footer-${id}`);
        if (el) el.innerHTML = footerHTML;
    });
}

function toggleSidebar() {
    vibrate(20);
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('show');
}

function navTo(pageId) {
    toggleSidebar();
    showPage(pageId);
}

function showPage(id) {
    if (META[id]) updateMeta(META[id].title, META[id].desc);
    const menuBtn = document.querySelector('.menu-btn');
    const mainMenus = ['home', 'preorder', 'katalog', 'arsip', 'galeri', 'tentang'];

    if (PRODUCT_PAGES.includes(id) && !cart.prod) {
        history.pushState({ page: 'home' }, '', '/');
        id = 'home';
    } else if (CART_PAGES.includes(id) && cartItems.length === 0) {
        history.pushState({ page: 'home' }, '', '/');
        id = 'home';
    }

    if (mainMenus.includes(id)) {
        lastPage = id;
        const slug = PAGE_SLUGS[id] || '/';
        history.pushState({ page: id }, '', slug);
    }

    if (PRODUCT_PAGES.includes(id) && cart.prod) {
        const productSlug = slugify(cart.prod.name);
        let url = `/${productSlug}`;
        if (id === 'form') url = `/${productSlug}/form`;
        if (id === 'summary') url = `/${productSlug}/summary`;
        history.pushState({ page: id, product: productSlug }, '', url);
    }

    if (CART_PAGES.includes(id)) {
        history.pushState({ page: id }, '', CART_SLUGS[id]);
    }

    if (menuBtn) menuBtn.style.display = ORDER_PAGES.includes(id) ? 'none' : 'flex';

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) {
        target.classList.add('active');
        target.scrollTop = 0;
    }
}

function navBack() {
    vibrate(30);
    if (window.history.length > 1) {
        history.back();
        return;
    }
    showPage(lastPage || 'home');
}

function renderDetailContent(p, selectedColor) {
    const elName = document.getElementById('detName');
    if (elName) elName.innerText = p.name;

    const elPrice = document.getElementById('detPrice');
    if (elPrice) elPrice.innerText = formatRupiah(p.price);

    const slider = document.getElementById('detImgs');
    if (slider) {
        if (p.details && p.details.length > 0) {
            slider.innerHTML = p.details.map(i => `<img src="${i}">`).join('');
        } else {
            slider.innerHTML = `<img src="${p.thumbnail}">`;
        }
        slider.scrollLeft = 0;
    }

    // Tampilkan Product Specifications langsung di halaman (tanpa modal)
    const specEl = document.getElementById('detSpecsContent');
    if (specEl) {
        specEl.innerHTML = p.specs
            ? p.specs.replace(/\\n/g, '<br>').replace(/\n/g, '<br>')
            : "Spesifikasi belum tersedia.";
    }

    let cHTML = `<div class="section-label">PILIH WARNA</div><div class="option-box">`;
    p.colors.forEach(c => {
        cHTML += `<div class="${selectedColor === c ? 'active' : ''}" onclick="selOpt('color','${c}',this)">${c}</div>`;
    });
    const colArea = document.getElementById('colorArea');
    if (colArea) colArea.innerHTML = cHTML + `</div>`;

    let sHTML = `<div class="section-label">PILIH UKURAN</div><div class="option-box">`;
    ["S", "M", "L", "XL", "XXL", "XXXL"].forEach(s => {
        const isAvail = p.stock.includes(s);
        sHTML += `<div class="${isAvail ? '' : 'disabled'}" onclick="${isAvail ? `selOpt('size','${s}',this)` : ''}">${s}</div>`;
    });
    const szArea = document.getElementById('sizeArea');
    if (szArea) szArea.innerHTML = sHTML + `</div>`;
}

function goDetail(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;

    if (document.getElementById('sidebar')?.classList.contains('open')) {
        toggleSidebar();
    }

    cart = { prod: p, size: '', color: p.colors.length === 1 ? p.colors[0] : '' };
    renderDetailContent(p, cart.color);
    showPage('detail');
}

function goDetailSilent(p) {
    renderDetailContent(p, p.colors.length === 1 ? p.colors[0] : '');
}

function selOpt(type, val, el) {
    vibrate(20);
    cart[type] = val;
    el.parentElement.querySelectorAll('div').forEach(d => d.classList.remove('active'));
    el.classList.add('active');
}

function triggerAlert(msg) {
    vibrate([50, 50, 50]);
    const toast = document.getElementById('toast');
    if (toast) {
        toast.innerText = msg;
        toast.classList.add('show', 'shake');
        setTimeout(() => toast.classList.remove('shake'), 400);
        setTimeout(() => toast.classList.remove('show'), 2500);
    }
}

function validateDetail() {
    if (!cart.color && !cart.size) return triggerAlert("PILIH WARNA & UKURAN!");
    if (!cart.color) return triggerAlert("PILIH WARNA!");
    if (!cart.size) return triggerAlert("PILIH UKURAN!");
    vibrate(40);
    showPage('form');
    autofillCheckoutFromProfile('single');
}

function validateForm() {
    vibrate(40);
    const n = document.getElementById('inName').value;
    const p = document.getElementById('inPhone').value;

    const alamatDetail = document.getElementById('inAddress').value;
    const prov = document.getElementById('inProvinsi').value;
    const kota = document.getElementById('inKota').value;
    const kec = document.getElementById('inKecamatan').value;
    const kel = document.getElementById('inKelurahan').value;
    const kodePos = document.getElementById('inKodePos').value;

    const a = `${alamatDetail}, ${kel}, Kec. ${kec}, ${kota}, ${prov} ${kodePos}`;

    if (!n || !p || !alamatDetail || !prov || !kel) return triggerAlert("LENGKAPI DATA!");

    const sumP = document.getElementById('sumProd');
    if (sumP) sumP.innerText = cart.prod.name;

    const sumV = document.getElementById('sumVar');
    if (sumV) sumV.innerText = `${cart.color} | ${cart.size}`;

    const idArea = document.getElementById('inAreaId');
    if (!idArea || !idArea.value || ongkirSaatIni === 0) return triggerAlert("TUNGGU ONGKIR MUNCUL DULU!");

    const hargaProduk = hargaAngka(cart.prod.price);
    const sumPr = document.getElementById('sumPrice');
    if (sumPr) sumPr.innerText = formatRupiah(hargaProduk);

    const sumOng = document.getElementById('sumOngkir');
    if (sumOng) sumOng.innerText = formatRupiah(ongkirSaatIni);

    const sumTot = document.getElementById('sumTotal');
    if (sumTot) sumTot.innerText = formatRupiah(hargaProduk + ongkirSaatIni);

    const sumC = document.getElementById('sumCust');
    if (sumC) sumC.innerHTML = `<strong>${n}</strong><br>${p}<br>${a}`;

    const dpNote = document.getElementById('dpNoteArea');
    if (cart.prod.dpAllowed === 'no') {
        if (dpNote) dpNote.style.display = 'none';
    } else {
        if (dpNote) {
            dpNote.style.display = 'block';
            dpNote.innerHTML = '<p style="font-size:13px; color:#000; font-weight:700; margin:0; text-align:center; padding:15px; border:1px solid #eaeaea; border-radius:12px; background:#f9f9f9;"><i class="fas fa-info-circle" style="margin-right:5px;"></i> Pembayaran dapat dilakukan secara Full (Lunas) atau DP minimal Rp70.000.</p>';
        }
    }

    showPage('summary');
}

function openSize() { const m = document.getElementById('sizeModal'); if (m) m.style.display = 'flex'; }
function closeSize() { const m = document.getElementById('sizeModal'); if (m) m.style.display = 'none'; }
function openQRIS() { vibrate(30); const m = document.getElementById('qrisModal'); if (m) m.style.display = 'flex'; }
function closeQRIS() { const m = document.getElementById('qrisModal'); if (m) m.style.display = 'none'; }

function showPageSilent(id) {
    const menuBtn = document.querySelector('.menu-btn');
    if (ORDER_PAGES.includes(id) && menuBtn) menuBtn.style.display = 'none';
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
}

function vibrate(ms) { if (navigator.vibrate) navigator.vibrate(ms); }

// ── ISI OTOMATIS ALAMAT DARI PROFIL (dropdown bertingkat) ──
async function cascadeSelectAddress(mode, data) {
    if (!data || !data.provinsi) return;
    const p = addrPrefix(mode);
    const provSel = document.getElementById(p + 'Provinsi');
    if (!provSel) return;

    // tunggu daftar provinsi selesai dimuat (maks ~3 detik)
    for (let i = 0; i < 20 && provSel.options.length <= 1; i++) {
        await new Promise(r => setTimeout(r, 150));
    }
    if (provSel.options.length <= 1) return;

    provSel.value = data.provinsi;
    if (provSel.value !== data.provinsi) return;
    await onProvinsiChange(mode);

    const kotaSel = document.getElementById(p + 'Kota');
    if (kotaSel && data.kota) {
        kotaSel.value = data.kota;
        if (kotaSel.value === data.kota) await onKotaChange(mode);
    }

    const kecSel = document.getElementById(p + 'Kecamatan');
    if (kecSel && data.kecamatan) {
        kecSel.value = data.kecamatan;
        if (kecSel.value === data.kecamatan) await onKecamatanChange(mode);
    }

    const kelSel = document.getElementById(p + 'Kelurahan');
    if (kelSel && data.kelurahan) {
        kelSel.value = data.kelurahan;
        if (kelSel.value === data.kelurahan) await onKelurahanChange(mode);
    }
}

async function autofillCheckoutFromProfile(mode) {
    if (!currentCustomer) return;
    const p = addrPrefix(mode);

    try {
        const profile = await getCustomerProfile(currentCustomer.uid);
        if (!profile) return;

        const nameEl = document.getElementById(p + 'Name');
        const phoneEl = document.getElementById(p + 'Phone');
        const addrEl = document.getElementById(p + 'Address');

        if (nameEl && !nameEl.value && profile.nama) nameEl.value = profile.nama;
        if (phoneEl && !phoneEl.value && profile.noHp) phoneEl.value = profile.noHp;
        if (addrEl && !addrEl.value && profile.alamat) addrEl.value = profile.alamat;

        const provSel = document.getElementById(p + 'Provinsi');
        if (provSel && !provSel.value) {
            await cascadeSelectAddress(mode, profile);
        }
    } catch (e) {
        console.error('Gagal autofill dari profil:', e);
    }
}

// ══════════════════════════════════════════════════════════════
// SISTEM DROPDOWN WILAYAH
// ══════════════════════════════════════════════════════════════
const WILAYAH_API = "https://www.emsifa.com/api-wilayah-indonesia/v2";
const WILAYAH_ACRONYMS = ['DKI', 'DIY', 'NAD', 'NTB', 'NTT'];

function titleCaseWilayah(str) {
    if (!str) return str;
    return str
        .toLowerCase()
        .split(' ')
        .map(word => {
            const upper = word.toUpperCase();
            if (WILAYAH_ACRONYMS.includes(upper)) return upper;
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
}

async function fetchWilayah(path) {
    try {
        const res = await fetch(`${WILAYAH_API}${path}`);
        if (!res.ok) throw new Error('Response tidak ok');
        const json = await res.json();
        return json.data || json;
    } catch (e) {
        await new Promise(r => setTimeout(r, 800));
        const res2 = await fetch(`${WILAYAH_API}${path}`);
        if (!res2.ok) throw new Error('Gagal setelah retry');
        const json2 = await res2.json();
        return json2.data || json2;
    }
}

async function initProvinsiDropdown() {
    const p1 = document.getElementById('inProvinsi');
    const p2 = document.getElementById('cartInProvinsi');
    const p3 = document.getElementById('profProvinsi');
    try {
        const data = await fetchWilayah('/provinces.json');
        const opts = (data || []).map(p => `<option value="${titleCaseWilayah(p.name)}" data-code="${p.id}">${titleCaseWilayah(p.name)}</option>`).join('');
        const html = `<option value="">Pilih Provinsi...</option>${opts}`;
        if (p1) p1.innerHTML = html;
        if (p2) p2.innerHTML = html;
        if (p3) p3.innerHTML = html;
    } catch (e) {
        console.error('Gagal memuat provinsi:', e);
        const errHtml = '<option value="">Gagal memuat, cek koneksi</option>';
        if (p1) p1.innerHTML = errHtml;
        if (p2) p2.innerHTML = errHtml;
        if (p3) p3.innerHTML = errHtml;
        triggerAlert("GAGAL MUAT PROVINSI, COBA LAGI!");
    }
}

// mode: 'single' | 'cart' | 'profile' (boolean true/false tetap didukung utk kompatibilitas)
function normalizeMode(m) {
    if (m === true) return 'cart';
    if (m === false) return 'single';
    return m;
}
function addrPrefix(mode) {
    if (mode === 'cart') return 'cartIn';
    if (mode === 'profile') return 'prof';
    return 'in';
}

function resetOngkirArea(modeInput) {
    const mode = normalizeMode(modeInput);
    const p = addrPrefix(mode);
    const areaId = document.getElementById(p + 'AreaId');
    const kodePos = document.getElementById(p + 'KodePos');
    const textId = document.getElementById(mode === 'cart' ? 'cartTampilOngkir' : 'tampilOngkir');
    if (areaId) areaId.value = '';
    if (kodePos) kodePos.value = '';
    if (mode !== 'profile') {
        if (textId) textId.innerText = 'Tunggu Ongkir Muncul...';
        ongkirSaatIni = 0;
        removeVoucher(mode === 'cart' ? 'cart' : 'single');
    }
}

async function onProvinsiChange(modeInput) {
    const mode = normalizeMode(modeInput);
    const p = addrPrefix(mode);

    const provSel = document.getElementById(p + 'Provinsi');
    const kotaSel = document.getElementById(p + 'Kota');
    const kecSel = document.getElementById(p + 'Kecamatan');

    kecSel.innerHTML = '<option value="">Pilih Kecamatan...</option>';
    kecSel.disabled = true;
    const kelSelReset = document.getElementById(p + 'Kelurahan');
    if (kelSelReset) {
        kelSelReset.innerHTML = '<option value="">Pilih Kelurahan...</option>';
        kelSelReset.disabled = true;
    }
    resetOngkirArea(mode);

    const code = provSel.options[provSel.selectedIndex]?.dataset.code;
    if (!code) {
        kotaSel.innerHTML = '<option value="">Pilih Kota/Kab...</option>';
        kotaSel.disabled = true;
        return;
    }

    kotaSel.innerHTML = '<option value="">Memuat...</option>';
    kotaSel.disabled = true;

    try {
        const data = await fetchWilayah(`/regencies/${code}.json`);
        kotaSel.innerHTML = '<option value="">Pilih Kota/Kab...</option>' +
            (data || []).map(k => `<option value="${titleCaseWilayah(k.name)}" data-code="${k.id}">${titleCaseWilayah(k.name)}</option>`).join('');
        kotaSel.disabled = false;
    } catch (e) {
        kotaSel.innerHTML = '<option value="">Gagal memuat, coba lagi</option>';
    }
}

async function onKotaChange(modeInput) {
    const mode = normalizeMode(modeInput);
    const p = addrPrefix(mode);

    const kotaSel = document.getElementById(p + 'Kota');
    const kecSel = document.getElementById(p + 'Kecamatan');

    resetOngkirArea(mode);

    const code = kotaSel.options[kotaSel.selectedIndex]?.dataset.code;
    if (!code) {
        kecSel.innerHTML = '<option value="">Pilih Kecamatan...</option>';
        kecSel.disabled = true;
        return;
    }

    kecSel.innerHTML = '<option value="">Memuat...</option>';
    kecSel.disabled = true;

    try {
        const data = await fetchWilayah(`/districts/${code}.json`);
        kecSel.innerHTML = '<option value="">Pilih Kecamatan...</option>' +
            (data || []).map(d => `<option value="${titleCaseWilayah(d.name)}" data-code="${d.id}">${titleCaseWilayah(d.name)}</option>`).join('');
        kecSel.disabled = false;
    } catch (e) {
        kecSel.innerHTML = '<option value="">Gagal memuat, coba lagi</option>';
    }

    const kelSel = document.getElementById(p + 'Kelurahan');
    if (kelSel) {
        kelSel.innerHTML = '<option value="">Pilih Kelurahan...</option>';
        kelSel.disabled = true;
    }
}

async function onKecamatanChange(modeInput) {
    const mode = normalizeMode(modeInput);
    const p = addrPrefix(mode);

    const kecSel = document.getElementById(p + 'Kecamatan');
    const kelSel = document.getElementById(p + 'Kelurahan');
    const kodePos = document.getElementById(p + 'KodePos');

    resetOngkirArea(mode);
    if (kodePos) kodePos.value = '';

    const code = kecSel.options[kecSel.selectedIndex]?.dataset.code;
    if (!code) {
        kelSel.innerHTML = '<option value="">Pilih Kelurahan...</option>';
        kelSel.disabled = true;
        return;
    }

    kelSel.innerHTML = '<option value="">Memuat...</option>';
    kelSel.disabled = true;

    try {
        const data = await fetchWilayah(`/villages/${code}.json`);
        kelSel.innerHTML = '<option value="">Pilih Kelurahan...</option>' +
            (data || []).map(v => {
                const postal = v.postal_code || v.postalCode || v.kodepos || '';
                return `<option value="${titleCaseWilayah(v.name)}" data-postal="${postal}">${titleCaseWilayah(v.name)}</option>`;
            }).join('');
        kelSel.disabled = false;
    } catch (e) {
        kelSel.innerHTML = '<option value="">Gagal memuat, coba lagi</option>';
    }
}

async function cariAreaBiteship(keyword) {
    try {
        const res = await fetch(`${URL_GAS_BITESHIP}?endpoint=search&input=${encodeURIComponent(keyword)}`);
        const data = await res.json();
        return data.areas || [];
    } catch (e) {
        return [];
    }
}

async function onKelurahanChange(modeInput) {
    const mode = normalizeMode(modeInput);
    const p = addrPrefix(mode);

    const kelSel = document.getElementById(p + 'Kelurahan');
    const kecSel = document.getElementById(p + 'Kecamatan');
    const kodePos = document.getElementById(p + 'KodePos');

    if (!kelSel.value) {
        resetOngkirArea(mode);
        if (kodePos) kodePos.value = '';
        return;
    }

    const postalFromData = kelSel.options[kelSel.selectedIndex]?.dataset.postal || '';

    // Mode PROFILE: cukup isi kode pos dari data wilayah, tanpa hitung ongkir/area pengiriman
    if (mode === 'profile') {
        if (kodePos) kodePos.value = postalFromData;
        return;
    }

    const areaId = document.getElementById(p + 'AreaId');
    const textId = mode === 'cart' ? 'cartTampilOngkir' : 'tampilOngkir';

    document.getElementById(textId).innerText = "Mencari area pengiriman...";
    areaId.value = '';
    ongkirSaatIni = 0;

    try {
        let areas = postalFromData ? await cariAreaBiteship(postalFromData) : [];
        if (!areas.length) areas = await cariAreaBiteship(`${kelSel.value} ${kecSel.value}`);
        if (!areas.length) areas = await cariAreaBiteship(kelSel.value);

        if (!areas.length) {
            document.getElementById(textId).innerText = "Pengiriman ke area ini belum tersedia.";
            return;
        }

        const kel = kelSel.value.toUpperCase();
        const kec = kecSel.value.toUpperCase();
        const has = (a, s) => (a.label || '').toUpperCase().includes(s);

        const match = areas.find(a => has(a, kel) && has(a, kec)) || areas.find(a => has(a, kel)) || areas[0];

        areaId.value = match.id;
        if (kodePos && !kodePos.value) kodePos.value = match.zip || postalFromData;

        hitungOngkirBiteship(match.id, mode === 'cart');
    } catch (e) {
        document.getElementById(textId).innerText = "Gagal memproses area pengiriman.";
    }
}

async function hitungOngkirBiteship(destId, isCart) {
    const berat = isCart ? (cartItems.length * 250) : 250;
    const textId = isCart ? 'cartTampilOngkir' : 'tampilOngkir';

    document.getElementById(textId).innerText = "Menghitung ongkir...";

    try {
        const res = await fetch(`${URL_GAS_BITESHIP}?endpoint=rates&dest=${destId}&weight=${berat}`);
        const data = await res.json();

        if (data.pricing && data.pricing.length > 0) {
            ongkirSaatIni = data.pricing[0].price;
            document.getElementById(textId).innerText = `Ongkos Kirim (J&T): ${formatRupiah(ongkirSaatIni)}`;
        } else {
            document.getElementById(textId).innerText = "Tidak tersedia. " + (data.debug_message || data.error || "");
            ongkirSaatIni = 0;
        }
    } catch (e) {
        document.getElementById(textId).innerText = "Gagal memuat ongkir.";
        ongkirSaatIni = 0;
    }
}

// ── BANNER LOGIC ──────────────────────────────────────────
function renderBannerSlider(banners) {
    const track = document.getElementById('bannerTrack');
    const dots = document.getElementById('bannerDots');
    const sliderContainer = document.querySelector('.banner-slider');
    if (!track || !dots || !sliderContainer) return;

    if (banners.length === 0) {
        sliderContainer.style.display = 'none';
        return;
    }
    sliderContainer.style.display = 'block';

    track.innerHTML = banners.map(b => `
        <div class="banner-slide">
            <img src="${b.image}">
            <div class="banner-content">
                ${b.title ? `<h3>${b.title}</h3>` : ''}
                ${b.subtitle ? `<p>${b.subtitle}</p>` : ''}
                ${b.link ? `<a onclick="navTo('${b.link}')" style="cursor:pointer;">READ MORE</a>` : ''}
            </div>
        </div>
    `).join('');

    dots.innerHTML = banners.map((b, i) => `
        <span class="dot ${i === 0 ? 'active' : ''}" onclick="goToSlide(${i})"></span>
    `).join('');
}

function goToSlide(index) {
    const track = document.getElementById('bannerTrack');
    if (track) track.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', () => {
    const track = document.getElementById('bannerTrack');
    if (track) {
        track.addEventListener('scroll', () => {
            const dots = document.querySelectorAll('#bannerDots .dot');
            if (dots.length > 0) {
                const index = Math.round(track.scrollLeft / track.clientWidth);
                dots.forEach(d => d.classList.remove('active'));
                if (dots[index]) dots[index].classList.add('active');
            }
        });
    }
});

// ── VOUCHER LOGIC ──────────────────────────────────────────
let appliedVoucher = null;
let nilaiDiskon = 0;

function hitungTotalProduk(type) {
    if (type === 'single') return cart.prod ? hargaAngka(cart.prod.price) : 0;
    return totalKeranjang();
}

window.openVoucherModal = (type) => {
    vibrate(20);
    document.getElementById('modalVoucherType').value = type;
    document.getElementById('modalInVoucher').value = '';
    document.getElementById('modalVoucherMsg').innerText = '';
    document.getElementById('voucherModal').style.display = 'flex';
};

window.closeVoucherModal = () => {
    document.getElementById('voucherModal').style.display = 'none';
};

window.removeVoucher = (type) => {
    vibrate(20);
    appliedVoucher = null;
    nilaiDiskon = 0;

    const activeEl = document.getElementById('activeVoucher_' + type);
    const btnOpenEl = document.getElementById('btnOpenVoucher_' + type);
    const diskonArea = document.getElementById(type === 'single' ? 'sumDiskonArea' : 'cartSumDiskonArea');
    const ongkirEl = document.getElementById(type === 'single' ? 'sumOngkir' : 'cartSumOngkir');
    const totalEl = document.getElementById(type === 'single' ? 'sumTotal' : 'cartSumTotal');

    if (activeEl) activeEl.style.display = 'none';
    if (btnOpenEl) btnOpenEl.style.display = 'flex';
    if (diskonArea) diskonArea.style.display = 'none';
    if (ongkirEl) ongkirEl.innerText = formatRupiah(ongkirSaatIni);

    const totalProduk = hitungTotalProduk(type);
    if (totalEl) totalEl.innerText = formatRupiah(totalProduk + ongkirSaatIni);
};

window.applyVoucherModal = async () => {
    const type = document.getElementById('modalVoucherType').value;
    const inEl = document.getElementById('modalInVoucher');
    const msgEl = document.getElementById('modalVoucherMsg');

    const diskonArea = document.getElementById(type === 'single' ? 'sumDiskonArea' : 'cartSumDiskonArea');
    const diskonValEl = document.getElementById(type === 'single' ? 'sumDiskon' : 'cartSumDiskon');
    const totalEl = document.getElementById(type === 'single' ? 'sumTotal' : 'cartSumTotal');
    const ongkirEl = document.getElementById(type === 'single' ? 'sumOngkir' : 'cartSumOngkir');

    const totalProduk = hitungTotalProduk(type);

    const kode = inEl.value.trim().toUpperCase();
    if (!kode) {
        msgEl.style.color = '#ff3b3b'; msgEl.innerText = "Masukkan kode promo terlebih dahulu!";
        return;
    }

    msgEl.style.color = '#555'; msgEl.innerText = "Mengecek voucher...";

    try {
        const { getVoucherByKode } = await import('./firebase.js');
        const v = await getVoucherByKode(kode);

        if (!v) {
            msgEl.style.color = '#ff3b3b'; msgEl.innerText = "Kode voucher tidak ditemukan / salah!";
            return;
        }
        if (Number(v.kuota) <= 0) {
            msgEl.style.color = '#ff3b3b'; msgEl.innerText = "Yahh.. Kuota voucher ini sudah habis :(";
            return;
        }

        appliedVoucher = v;
        if (v.tipe === 'nominal') {
            nilaiDiskon = Number(v.nilai);
            appliedVoucher.deskripsi = `Diskon Belanja Rp${nilaiDiskon.toLocaleString('id-ID')}`;
        } else if (v.tipe === 'persen') {
            nilaiDiskon = (totalProduk * Number(v.nilai)) / 100;
            appliedVoucher.deskripsi = `Diskon Belanja ${v.nilai}%`;
        } else if (v.tipe === 'free_ongkir') {
            nilaiDiskon = ongkirSaatIni;
            appliedVoucher.deskripsi = `Gratis Ongkos Kirim`;
        }

        const totalSemua = totalProduk + ongkirSaatIni;
        if (nilaiDiskon > totalSemua) nilaiDiskon = totalSemua;

        vibrate(30);

        if (v.tipe === 'free_ongkir') {
            ongkirEl.innerText = "Rp0 (Gratis Ongkir)";
            diskonArea.style.display = 'none';
            totalEl.innerText = formatRupiah(totalSemua - ongkirSaatIni);
        } else {
            ongkirEl.innerText = formatRupiah(ongkirSaatIni);
            diskonArea.style.display = 'flex';
            diskonValEl.innerText = "- " + formatRupiah(nilaiDiskon);
            totalEl.innerText = formatRupiah(totalSemua - nilaiDiskon);
        }

        closeVoucherModal();
        document.getElementById('activeVoucher_' + type).style.display = 'flex';
        document.getElementById('lblVoucherKode_' + type).innerText = appliedVoucher.kode;
        document.getElementById('lblVoucherDesc_' + type).innerText = appliedVoucher.deskripsi;
        document.getElementById('btnOpenVoucher_' + type).style.display = 'none';

        showCartToast("Voucher Berhasil Dipakai!");

    } catch (e) {
        console.error(e);
        msgEl.style.color = '#ff3b3b'; msgEl.innerText = "Terjadi masalah saat mengecek voucher.";
    }
};

// ══════════════════════════════════════════════════════════════
// CUSTOMER AUTH (SIGN IN / SIGN UP)
// ══════════════════════════════════════════════════════════════
onAuthStateChanged(auth, (user) => {
    currentCustomer = user;
    updateBottomNavAuth();
    autoFillEmailFields();
});

function updateBottomNavAuth() {
    const signInItem = document.getElementById('navSignInItem');
    const profileItem = document.getElementById('navProfileItem');
    const logoutItem = document.getElementById('navLogoutItem');
    if (!signInItem || !profileItem || !logoutItem) return;

    if (currentCustomer) {
        signInItem.style.display = 'none';
        profileItem.style.display = '';
        logoutItem.style.display = '';
    } else {
        signInItem.style.display = '';
        profileItem.style.display = 'none';
        logoutItem.style.display = 'none';
    }
}

function autoFillEmailFields() {
    const inEmail = document.getElementById('inEmail');
    const cartInEmail = document.getElementById('cartInEmail');
    const noteSingle = document.getElementById('emailNote');
    const noteCart = document.getElementById('cartEmailNote');

    if (currentCustomer) {
        [inEmail, cartInEmail].forEach(el => {
            if (!el) return;
            el.value = currentCustomer.email;
            el.readOnly = true;
            el.style.background = '#f5f5f5';
            el.style.color = '#555';
            el.style.cursor = 'not-allowed';
        });
        [noteSingle, noteCart].forEach(n => {
            if (n) { n.innerText = '(terisi otomatis)'; n.style.color = '#00a844'; }
        });
    } else {
        [inEmail, cartInEmail].forEach(el => {
            if (!el) return;
            el.readOnly = false;
            el.style.background = '';
            el.style.color = '';
            el.style.cursor = '';
        });
        [noteSingle, noteCart].forEach(n => {
            if (n) { n.innerText = '(opsional)'; n.style.color = '#999'; }
        });
    }
}

function closeSidebarIfOpen() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar?.classList.contains('open')) {
        sidebar.classList.remove('open');
        overlay?.classList.remove('show');
    }
}

window.handleLogout = () => {
    vibrate(20);
    closeSidebarIfOpen();

    if (!currentCustomer) return;

    if (confirm('Yakin ingin log out dari akun ' + currentCustomer.email + '?')) {
        const profileModal = document.getElementById('profileModal');
        if (profileModal) profileModal.style.display = 'none';
        customerSignOut().then(() => {
            triggerAlert('BERHASIL LOG OUT');
        });
    }
};

function openAuthModal() {
    closeSidebarIfOpen();
    authMode = 'signin';
    document.getElementById('authEmail').value = '';
    document.getElementById('authPassword').value = '';
    document.getElementById('authMsg').innerText = '';
    updateAuthModalUI();
    document.getElementById('authModal').style.display = 'flex';
    vibrate(20);
}
window.openAuthModal = openAuthModal;

window.closeAuthModal = () => {
    document.getElementById('authModal').style.display = 'none';
};

window.signInWithGoogle = async () => {
    vibrate(20);
    const msg = document.getElementById('authMsg');
    try {
        await customerSignInGoogle();
        if (msg) { msg.style.color = '#00a844'; msg.innerText = 'Berhasil masuk!'; }
        setTimeout(() => {
            closeAuthModal();
            triggerAlert('SELAMAT DATANG!');
        }, 600);
    } catch (err) {
        console.error('Google sign-in gagal:', err);
        if (msg) {
            msg.style.color = '#ff3b3b';
            msg.innerText = err.code === 'auth/popup-closed-by-user'
                ? 'Login dibatalkan.'
                : 'Gagal masuk dengan Google. Coba lagi.';
        }
    }
};

window.toggleAuthMode = () => {
    authMode = authMode === 'signin' ? 'signup' : 'signin';
    document.getElementById('authMsg').innerText = '';
    updateAuthModalUI();
};

function updateAuthModalUI() {
    const title = document.getElementById('authModalTitle');
    const desc = document.getElementById('authModalDesc');
    const btn = document.getElementById('authSubmitBtn');
    const toggleText = document.getElementById('authToggleText');
    const toggleBtn = document.getElementById('authToggleBtn');
    if (authMode === 'signin') {
        title.innerText = 'SIGN IN';
        desc.innerText = 'Masuk untuk auto-fill email saat checkout.';
        btn.innerText = 'SIGN IN';
        toggleText.innerText = 'Belum punya akun?';
        toggleBtn.innerText = 'Daftar';
    } else {
        title.innerText = 'SIGN UP';
        desc.innerText = 'Buat akun agar email otomatis terisi saat checkout.';
        btn.innerText = 'DAFTAR';
        toggleText.innerText = 'Sudah punya akun?';
        toggleBtn.innerText = 'Masuk';
    }
}

window.submitAuth = async () => {
    const email = document.getElementById('authEmail').value.trim();
    const pass = document.getElementById('authPassword').value;
    const msg = document.getElementById('authMsg');
    const btn = document.getElementById('authSubmitBtn');

    msg.style.color = '#ff3b3b';
    if (!email || !email.includes('@')) { msg.innerText = 'Email tidak valid.'; return; }
    if (!pass || pass.length < 6) { msg.innerText = 'Password minimal 6 karakter.'; return; }

    btn.disabled = true;
    btn.innerText = 'Memproses...';
    msg.style.color = '#555'; msg.innerText = 'Mohon tunggu...';

    try {
        if (authMode === 'signin') {
            await customerSignIn(email, pass);
        } else {
            await customerSignUp(email, pass);
        }
        msg.style.color = '#00a844';
        msg.innerText = authMode === 'signin' ? 'Berhasil masuk!' : 'Akun berhasil dibuat!';
        setTimeout(() => {
            closeAuthModal();
            triggerAlert(authMode === 'signin' ? 'SELAMAT DATANG!' : 'AKUN DIBUAT!');
        }, 500);
    } catch (err) {
        console.error(err);
        const code = err.code || '';
        if (code.includes('invalid-credential') || code.includes('wrong-password')) msg.innerText = 'Email atau password salah.';
        else if (code.includes('user-not-found')) msg.innerText = 'Akun tidak ditemukan. Silakan daftar dulu.';
        else if (code.includes('email-already-in-use')) msg.innerText = 'Email sudah terdaftar. Silakan sign in.';
        else if (code.includes('weak-password')) msg.innerText = 'Password terlalu lemah.';
        else if (code.includes('invalid-email')) msg.innerText = 'Format email salah.';
        else msg.innerText = 'Gagal: ' + (err.message || 'coba lagi');
    } finally {
        btn.disabled = false;
        updateAuthModalUI();
    }
};

// ══════════════════════════════════════════════════════════════
// CUSTOMER PROFILE (DATA PRIBADI + RIWAYAT PESANAN)
// ══════════════════════════════════════════════════════════════
async function openProfileModal() {
    if (!currentCustomer) { openAuthModal(); return; }

    closeSidebarIfOpen();
    vibrate(20);

    const emailEl = document.getElementById('profEmail');
    const namaEl = document.getElementById('profNama');
    const noHpEl = document.getElementById('profNoHp');
    const alamatEl = document.getElementById('profAlamat');
    const kodePosEl = document.getElementById('profKodePos');
    const msgEl = document.getElementById('profMsg');
    const orderListEl = document.getElementById('profileOrderList');

    emailEl.value = currentCustomer.email || '';
    namaEl.value = '';
    noHpEl.value = '';
    alamatEl.value = '';
    if (kodePosEl) kodePosEl.value = '';
    msgEl.innerText = '';
    orderListEl.innerHTML = '<p style="font-size:11px; color:#999; text-align:center;">Memuat riwayat pesanan...</p>';

    // reset dropdown wilayah profil
    ['profProvinsi', 'profKota', 'profKecamatan', 'profKelurahan'].forEach((id, i) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (i === 0) { el.value = ''; return; }
        el.innerHTML = `<option value="">Pilih ${['', 'Kota/Kab', 'Kecamatan', 'Kelurahan'][i]}...</option>`;
        el.disabled = true;
    });

    document.getElementById('profileModal').style.display = 'flex';

    try {
        const profile = await getCustomerProfile(currentCustomer.uid);
        if (profile) {
            namaEl.value = profile.nama || '';
            noHpEl.value = profile.noHp || '';
            alamatEl.value = profile.alamat || '';
            if (profile.provinsi) await cascadeSelectAddress('profile', profile);
        }
    } catch (e) { console.error(e); }

    renderProfileOrders();
}

async function renderProfileOrders() {
    const orderListEl = document.getElementById('profileOrderList');
    if (!currentCustomer || !orderListEl) return;

    try {
        const orders = await getCustomerOrders(currentCustomer.uid);

        if (!orders.length) {
            orderListEl.innerHTML = '<p style="font-size:11px; color:#999; text-align:center;">Belum ada pesanan.</p>';
            return;
        }

        const statusLabel = { pending: 'DIPROSES', diproses: 'DIPROSES', dikirim: 'DIKIRIM', selesai: 'SELESAI', batal: 'DIBATALKAN' };
        const statusColor = { pending: '#ff9800', diproses: '#ff9800', dikirim: '#2196f3', selesai: '#00a844', batal: '#ff3b3b' };

        orderListEl.innerHTML = orders.map(o => {
            const status = (o.status || 'pending').toLowerCase();
            const label = statusLabel[status] || status.toUpperCase();
            const color = statusColor[status] || '#555';
            const produkText = o.produkText || o.produk || '-';
            const tanggal = o.createdAt ? new Date(o.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
            const total = typeof o.totalAkhir === 'number' ? 'Rp' + o.totalAkhir.toLocaleString('id-ID') : '-';

            return `
                <div style="border:1px solid #eaeaea; border-radius:12px; padding:14px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:6px;">
                        <span style="font-size:11px; font-weight:700; letter-spacing:0.5px;">${tanggal}</span>
                        <span style="font-size:10px; font-weight:700; color:${color}; border:1px solid ${color}; border-radius:6px; padding:2px 8px; white-space:nowrap;">${label}</span>
                    </div>
                    <p style="font-size:12px; color:#333; margin:0 0 6px; line-height:1.5;">${produkText}</p>
                    <p style="font-size:12px; font-weight:700; margin:0;">${total}</p>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error(e);
        orderListEl.innerHTML = '<p style="font-size:11px; color:#ff3b3b; text-align:center;">Gagal memuat riwayat pesanan.</p>';
    }
}

function closeProfileModal() {
    document.getElementById('profileModal').style.display = 'none';
}

async function saveProfile() {
    if (!currentCustomer) return;
    vibrate(20);

    const namaEl = document.getElementById('profNama');
    const noHpEl = document.getElementById('profNoHp');
    const alamatEl = document.getElementById('profAlamat');
    const provEl = document.getElementById('profProvinsi');
    const kotaEl = document.getElementById('profKota');
    const kecEl = document.getElementById('profKecamatan');
    const kelEl = document.getElementById('profKelurahan');
    const kodePosEl = document.getElementById('profKodePos');
    const msgEl = document.getElementById('profMsg');
    const btn = document.getElementById('profSaveBtn');

    if (!namaEl.value.trim() || !noHpEl.value.trim() || !alamatEl.value.trim() || !provEl.value || !kotaEl.value || !kecEl.value || !kelEl.value) {
        msgEl.style.color = '#ff3b3b';
        msgEl.innerText = 'Lengkapi semua data (nama, no. HP, alamat, provinsi, kota, kecamatan, kelurahan).';
        return;
    }

    btn.disabled = true;
    btn.innerText = 'MENYIMPAN...';
    msgEl.style.color = '#555'; msgEl.innerText = 'Mohon tunggu...';

    const ok = await updateCustomerProfile(currentCustomer.uid, {
        nama: namaEl.value.trim(),
        noHp: noHpEl.value.trim(),
        alamat: alamatEl.value.trim(),
        provinsi: provEl.value,
        kota: kotaEl.value,
        kecamatan: kecEl.value,
        kelurahan: kelEl.value,
        kodePos: kodePosEl ? kodePosEl.value : ''
    });

    btn.disabled = false;
    btn.innerText = 'SIMPAN PROFIL';

    if (ok) {
        msgEl.style.color = '#00a844';
        msgEl.innerText = 'Profil berhasil disimpan!';
    } else {
        msgEl.style.color = '#ff3b3b';
        msgEl.innerText = 'Gagal menyimpan profil. Coba lagi.';
    }
}

// ── EXPORT KE WINDOW ────────────────────────────────────────
window.toggleSidebar = toggleSidebar;
window.navTo = navTo;
window.showPage = showPage;
window.goDetail = goDetail;
window.selOpt = selOpt;
window.validateDetail = validateDetail;
window.validateForm = validateForm;
window.openSize = openSize;
window.closeSize = closeSize;
window.openQRIS = openQRIS;
window.closeQRIS = closeQRIS;
window.previewBukti = previewBukti;
window.openImage = openImage;
window.closeImage = closeImage;
window.vibrate = vibrate;
window.navBack = navBack;
window.addToCart = addToCart;
window.removeCartItem = removeCartItem;
window.goToCartCheckout = goToCartCheckout;
window.validateCartForm = validateCartForm;
window.previewCartBukti = previewCartBukti;
window.openCart = openCart;
window.goToSlide = goToSlide;
window.hapusBukti = hapusBukti;
window.confirmCheckout = confirmCheckout;
window.closeConfirm = closeConfirm;
window.executeCheckout = executeCheckout;
window.onProvinsiChange = onProvinsiChange;
window.onKotaChange = onKotaChange;
window.onKecamatanChange = onKecamatanChange;
window.onKelurahanChange = onKelurahanChange;
window.closeAuthModal = closeAuthModal;
window.toggleAuthMode = toggleAuthMode;
window.submitAuth = submitAuth;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.saveProfile = saveProfile;