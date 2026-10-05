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
let mastProfileName = ''; // nama profil untuk tombol akun di masthead

const PAGE_SLUGS = {
    home: '/',
    preorder: '/preorder',
    katalog: '/katalog',
    arsip: '/arsip',
    galeri: '/galeri',
    tentang: '/tentang',
    berita: '/berita',
    diskusi: '/diskusi',
    pantau: '/pantau',
    pelunasan: '/pelunasan'
};

const SLUG_TO_PAGE = {
    '': 'home',
    'preorder': 'preorder',
    'katalog': 'katalog',
    'arsip': 'arsip',
    'galeri': 'galeri',
    'tentang': 'tentang',
    'berita': 'berita',
    'diskusi': 'diskusi',
    'pantau': 'pantau',
    'pelunasan': 'pelunasan'
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
    home: { title: 'FvcktheRules | Soccer Culture. Street Attitude. Born to Disobey.', desc: 'FvcktheRules is a football culture ecosystem: clothing, news, culture, opinion, journal, zine, e-book, and discussion. Soccer culture. Street attitude. Born to Disobey.' },
    katalog: { title: 'Katalog | FvcktheRules', desc: 'Koleksi lengkap FvcktheRules Store.' },
    preorder: { title: 'Pre Order | FvcktheRules', desc: 'Pre order produk terbaru FvcktheRules.' },
    arsip: { title: 'Arsip | FvcktheRules', desc: 'Koleksi arsip FvcktheRules Store.' },
    galeri: { title: 'Galeri | FvcktheRules', desc: 'Galeri foto FvcktheRules Store.' },
    tentang: { title: 'Tentang Kami | FvcktheRules', desc: 'FvcktheRules: soccer culture, street attitude, born to disobey. Clothing label, media platform, publishing space, and community built around football culture.' },
    berita: { title: 'Berita | FvcktheRules Journal', desc: 'Berita football, Indonesia, dan budaya jalanan dari FvcktheRules.' },
    pantau: { title: 'Pantau Pesanan | FvcktheRules', desc: 'Lacak status pesanan Pre Order kamu: masuk vendor, pelunasan, selesai, hingga dikirim.' },
    pelunasan: { title: 'Pelunasan | FvcktheRules', desc: 'Lunasi sisa pembayaran pesananmu dengan kode pelunasan.' },
    diskusi: { title: 'Diskusi | FvcktheRules Journal', desc: 'Diskusi komunitas FvcktheRules: post tim, reaksi, dan balasan.' }
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
const CART_TOAST_DEFAULT = '<i class="fas fa-check"></i> Ditambahkan ke keranjang!';

function showCartToast(msg) {
    const toast = document.getElementById('cartToast');
    if (!toast) return;

    // Batalkan timer sebelumnya biar tidak tumpang tindih / tersangkut kebuka terus
    if (cartToastTimer) {
        clearTimeout(cartToastTimer);
        cartToastTimer = null;
    }

    toast.innerHTML = msg
        ? `<i class="fas fa-check"></i> ${msg}`
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
            <div class="cart-empty">
                <i class="fas fa-shopping-bag"></i>
                <p class="t">Keranjang kosong</p>
                <p class="s">Tambahkan produk dulu yuk!</p>
            </div>`;
        const chkBtn = document.getElementById('cartCheckoutBtn');
        if (chkBtn) chkBtn.style.display = 'none';
        const tEl0 = document.getElementById('cartTotal');
        if (tEl0) tEl0.innerText = 'Rp0';
        return;
    }

    const total = totalKeranjang();

    container.innerHTML = cartItems.map(item => `
        <div class="cart-item">
            <img src="${item.prod.thumbnail}" alt="">
            <div class="ci">
                <p class="ci-name">${item.prod.name}</p>
                <p class="ci-var">${item.color} | ${item.size}</p>
                <p class="ci-price">${formatRupiah(item.prod.price)}</p>
            </div>
            <button type="button" class="ci-del" onclick="removeCartItem(${item.id})" aria-label="Hapus">
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
            cartDpNote.innerHTML = '<p class="info-note"><i class="fas fa-info-circle"></i> Pembayaran dapat dilakukan secara Full (Lunas) atau DP minimal Rp70.000.</p>';
        }
    }

    const itemsHTML = cartItems.map(item => `
        <div class="sum-item">
            <div>
                <p class="n">${item.prod.name}</p>
                <p class="v">${item.color} | ${item.size}</p>
            </div>
            <p class="pr">${formatRupiah(item.prod.price)}</p>
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

    let kodeBaru = null;
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
                dp: '', buktiURL: buktiURL,
                dpEligible: cart.prod.dpAllowed !== 'no',
                kodePrefix: cart.prod.kodePrefix || '',
                isPO: cart.prod.badge === 'pre',
                poIds: cart.prod.badge === 'pre' ? [cart.prod.id] : [],
                poNames: cart.prod.badge === 'pre' ? [cart.prod.name] : []
            };

            const orderId = await saveOrder(orderData);
            if (!orderId) throw new Error('saveOrder gagal');
            kodeBaru = orderData.kodePelunasan || null;

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
                dp: '', buktiURL: buktiURL,
                dpEligible: cartItems.some(i => i.prod.dpAllowed !== 'no'),
                kodePrefix: (cartItems.find(i => i.prod.kodePrefix) || { prod: {} }).prod.kodePrefix || '',
                isPO: cartItems.some(i => i.prod.badge === 'pre'),
                poIds: [...new Set(cartItems.filter(i => i.prod.badge === 'pre').map(i => i.prod.id))],
                poNames: [...new Set(cartItems.filter(i => i.prod.badge === 'pre').map(i => i.prod.name))]
            };

            const orderId = await saveOrder(orderData);
            if (!orderId) throw new Error('saveOrder gagal');
            kodeBaru = orderData.kodePelunasan || null;

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
            if (kodeBaru) setTimeout(() => tampilKodePelunasan(kodeBaru), 900);
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

        // Berita & diskusi Journal (gagal pun tidak boleh mengganggu toko)
        import('./journal.js').then(m => m.initJournal()).catch(err => console.warn('Journal tidak dimuat:', err));

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
                kodePrefix: p.kodePrefix || '',
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
        const menuBtn = document.getElementById('mast');

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
        onPageChanged(page);
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
                <div class="card-media">
                    <div class="badge ${p.badge}">${p.status}</div>
                    <img src="${p.thumbnail}" alt="${String(p.name).replace(/"/g, '&quot;')}" loading="lazy">
                </div>
                <div class="card-body">
                    <h3>${p.name}</h3>
                    <p class="price">${isSold ? 'OUT OF STOCK' : formatRupiah(p.price)}</p>
                    <button type="button" onclick="sessionStorage.setItem('lastPage', document.querySelector('.page.active') ? document.querySelector('.page.active').id : 'home'); vibrate(40); goDetail('${p.id}');" ${isSold ? 'disabled' : ''}>
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
        container.innerHTML += `<img src="${img}" alt="Galeri FvcktheRules" loading="lazy" decoding="async" onclick="vibrate(20); openImage('${img}')">`;
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
        <footer class="foot">
            <div class="wrap foot-in">
                <div class="foot-brand">
                    <img src="https://res.cloudinary.com/dfbxrouwf/image/upload/v1788256148/Tak_berjudul26_20260901160311_g4gy1e.png" alt="FvcktheRules" class="foot-logo">
                    <div class="footer-slogan">BORN TO DISOBEY</div>
                    <div class="footer-socials">
                        <a href="https://www.instagram.com/fucktherules.exe?igsi=cDYyZDRnenR3MTY0" target="_blank" onclick="vibrate(30)"><i class="fab fa-instagram"></i></a>
                        <a href="https://wa.me/6285725706337" target="_blank" onclick="vibrate(30)"><i class="fab fa-whatsapp"></i></a>
                        <a href="https://shopee.co.id/fvcktherules__" target="_blank" onclick="vibrate(30)"><i class="fas fa-shopping-bag"></i></a>
                    </div>
                    <div class="footer-contact-title">KONTAK KAMI :</div>
                    <div class="footer-contact-info">
                        Saluran WhatsApp : <a href="https://whatsapp.com/channel/0029VbD2hZqEKyZQXCFpkD2p" target="_blank"><i class="fab fa-whatsapp"></i> Klik Disini</a><br>
                        WhatsApp : <a href="https://wa.me/6285725706337">085725706337</a><br>
                        Email : <a href="mailto:fvcktherules3404@gmail.com">fvcktherules3404@gmail.com</a>
                    </div>
                </div>
                <div class="foot-cols">
                    <nav aria-label="Store">
                        <b>STORE</b>
                        <a href="/" onclick="return navLink(event,'home')">Beranda</a>
                        <a href="/preorder" onclick="return navLink(event,'preorder')">Pre Order</a>
                        <a href="/katalog" onclick="return navLink(event,'katalog')">Katalog</a>
                        <a href="/arsip" onclick="return navLink(event,'arsip')">Arsip</a>
                        <a href="/galeri" onclick="return navLink(event,'galeri')">Galeri</a>
                        <a href="/tentang" onclick="return navLink(event,'tentang')">Tentang</a>
                    </nav>
                    <nav aria-label="Journal">
                        <b>JOURNAL</b>
                        <a href="/berita" onclick="return navLink(event,'berita')">Berita</a>
                        <a href="/diskusi" onclick="return navLink(event,'diskusi')">Diskusi</a>
                        <a href="https://jurnal-fucktherules.my.id/">Situs Journal ↗</a>
                    </nav>
                </div>
            </div>
            <p class="copyright">© 2026 FVCKTHERULES. All rights reserved.</p>
        </footer>`;

    ['home', 'pre', 'kat', 'ars', 'about', 'galeri', 'berita', 'diskusi'].forEach(id => {
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
    const menuBtn = document.getElementById('mast');
    const mainMenus = ['home', 'preorder', 'katalog', 'arsip', 'galeri', 'tentang', 'berita', 'diskusi', 'pantau', 'pelunasan'];

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
    onPageChanged(id);
}

// Tandai menu aktif (masthead + drawer) dan kabari modul Journal
function onPageChanged(id) {
    document.querySelectorAll('[data-nav]').forEach(a => {
        if (a.dataset.nav === id) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
    });
    if (window.journalPageShown) window.journalPageShown(id);
}

// Link menu berupa <a href> asli (bisa dibuka di tab baru), tapi klik biasa tetap SPA
window.navLink = (e, id, fromDrawer) => {
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) return true;
    if (e) e.preventDefault();
    if (fromDrawer) navTo(id); else showPage(id);
    return false;
};

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
            dpNote.innerHTML = '<p class="info-note"><i class="fas fa-info-circle"></i> Pembayaran dapat dilakukan secara Full (Lunas) atau DP minimal Rp70.000.</p>';
        }
    }

    showPage('summary');
}

function openSize() { const m = document.getElementById('sizeModal'); if (m) m.style.display = 'flex'; }
function closeSize() { const m = document.getElementById('sizeModal'); if (m) m.style.display = 'none'; }
function openQRIS() { vibrate(30); const m = document.getElementById('qrisModal'); if (m) m.style.display = 'flex'; }
function closeQRIS() { const m = document.getElementById('qrisModal'); if (m) m.style.display = 'none'; }

function showPageSilent(id) {
    const menuBtn = document.getElementById('mast');
    if (ORDER_PAGES.includes(id) && menuBtn) menuBtn.style.display = 'none';
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
    onPageChanged(id);
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

const _wilCache = {};
async function fetchWilayah(path) {
    if (_wilCache[path]) return _wilCache[path];
    try { const s = sessionStorage.getItem('wil:' + path); if (s) return (_wilCache[path] = JSON.parse(s)); } catch (e) {}
    const data = await _fetchWilayahRaw(path);
    _wilCache[path] = data;
    try { sessionStorage.setItem('wil:' + path, JSON.stringify(data)); } catch (e) {}
    return data;
}

async function _fetchWilayahRaw(path) {
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
    warmBiteship();
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

const _areaCache = {};
let _gasWarm = false;
function warmBiteship() {
    if (_gasWarm) return;
    _gasWarm = true;
    cariAreaBiteship('10110').catch(() => {});
}

async function cariAreaBiteship(keyword) {
    const key = String(keyword || '').trim().toLowerCase();
    if (!key) return [];
    if (_areaCache[key]) return _areaCache[key];
    for (let attempt = 0; attempt < 2; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 20000);
        try {
            const res = await fetch(`${URL_GAS_BITESHIP}?endpoint=search&input=${encodeURIComponent(keyword)}`, { signal: ctrl.signal });
            const data = await res.json();
            clearTimeout(timer);
            const areas = data.areas || [];
            _areaCache[key] = areas;
            return areas;
        } catch (e) {
            clearTimeout(timer);
        }
    }
    return [];
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

    if (kodePos && postalFromData) kodePos.value = postalFromData;
    document.getElementById(textId).innerText = "Mencari area pengiriman...";
    areaId.value = '';
    ongkirSaatIni = 0;

    const token = (window._areaToken = (window._areaToken || 0) + 1);
    const slowHint = setTimeout(() => {
        if (token === window._areaToken && !areaId.value) document.getElementById(textId).innerText = "Server sedang lambat, mohon tunggu sebentar...";
    }, 6000);

    try {
        const [byPostal, byName, byKel] = await Promise.all([
            postalFromData ? cariAreaBiteship(postalFromData) : Promise.resolve([]),
            cariAreaBiteship(`${kelSel.value} ${kecSel.value}`),
            cariAreaBiteship(kelSel.value)
        ]);
        clearTimeout(slowHint);
        if (token !== window._areaToken) return;
        const areas = byPostal.length ? byPostal : (byName.length ? byName : byKel);

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
        window._rateCache = window._rateCache || {};
        const rk = destId + '|' + berat;
        let data = window._rateCache[rk];
        if (!data) {
            const res = await fetch(`${URL_GAS_BITESHIP}?endpoint=rates&dest=${destId}&weight=${berat}`);
            data = await res.json();
            if (data && data.pricing && data.pricing.length) window._rateCache[rk] = data;
        }

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
                ${b.link ? `<a onclick="navTo('${b.link}')">READ MORE</a>` : ''}
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
        msgEl.style.color = '#b3261e'; msgEl.innerText = "Masukkan kode promo terlebih dahulu!";
        return;
    }

    msgEl.style.color = '#555'; msgEl.innerText = "Mengecek voucher...";

    try {
        const { getVoucherByKode } = await import('./firebase.js');
        const v = await getVoucherByKode(kode);

        if (!v) {
            msgEl.style.color = '#b3261e'; msgEl.innerText = "Kode voucher tidak ditemukan / salah!";
            return;
        }
        if (Number(v.kuota) <= 0) {
            msgEl.style.color = '#b3261e'; msgEl.innerText = "Yahh.. Kuota voucher ini sudah habis :(";
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
        msgEl.style.color = '#b3261e'; msgEl.innerText = "Terjadi masalah saat mengecek voucher.";
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
    updateMastAuth();
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

// Tombol akun di masthead: "SIGN IN" atau nama depan (nama profil toko kalau ada)
function updateMastAuth() {
    const btn = document.getElementById('mastAuthBtn');
    if (!btn) return;
    if (!currentCustomer) { btn.textContent = 'SIGN IN'; mastProfileName = ''; return; }
    const base = (mastProfileName || currentCustomer.displayName || (currentCustomer.email || 'AKUN').split('@')[0]).trim();
    btn.textContent = base.split(/\s+/)[0];
    if (!mastProfileName) {
        const uid = currentCustomer.uid;
        getCustomerProfile(uid).then(p => {
            if (currentCustomer && currentCustomer.uid === uid && p && p.nama) { mastProfileName = p.nama; updateMastAuth(); }
        });
    }
}
window.mastAuthClick = () => { vibrate(20); if (currentCustomer) openProfileModal(); else openAuthModal(); };

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
            if (n) { n.innerText = '(terisi otomatis)'; n.style.color = '#000000'; }
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
        if (msg) { msg.style.color = '#000000'; msg.innerText = 'Berhasil masuk!'; }
        setTimeout(() => {
            closeAuthModal();
            triggerAlert('SELAMAT DATANG!');
        }, 600);
    } catch (err) {
        console.error('Google sign-in gagal:', err);
        if (msg) {
            msg.style.color = '#b3261e';
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

    msg.style.color = '#b3261e';
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
        msg.style.color = '#000000';
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
    orderListEl.innerHTML = '<p class="none">Memuat riwayat pesanan...</p>';

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
            orderListEl.innerHTML = '<p class="none">Belum ada pesanan.</p>';
            return;
        }

        const statusLabel = { pending: 'DIPROSES', diproses: 'DIPROSES', dikirim: 'DIKIRIM', selesai: 'SELESAI', batal: 'DIBATALKAN', dp: 'DP', lunas: 'LUNAS' };

        orderListEl.innerHTML = orders.map(o => {
            const status = (o.status || 'pending').toLowerCase();
            const label = statusLabel[status] || status.toUpperCase();
            const produkText = o.produkText || o.produk || '-';
            const tanggal = o.createdAt ? new Date(o.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
            const total = typeof o.totalAkhir === 'number' ? 'Rp' + o.totalAkhir.toLocaleString('id-ID') : '-';

            return `
                <div class="order-item">
                    <div class="order-head">
                        <span class="d">${tanggal}</span>
                        <span class="order-status st-${status}">${label}</span>
                    </div>
                    <p class="p">${produkText}</p>
                    <p class="t">${total}</p>
                    ${o.kodePelunasan ? `<p class="p">ID Pesanan: <b style="user-select:all">${escH(o.kodePelunasan)}</b></p>` : ''}
                    ${o.kodePelunasan && o.isPO ? `<p class="p"><a href="#" onclick="lacakDariRiwayat('${escH(o.kodePelunasan)}');return false" style="text-decoration:underline">Pantau pesanan →</a></p>` : ''}
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error(e);
        orderListEl.innerHTML = '<p class="none bad">Gagal memuat riwayat pesanan.</p>';
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
        msgEl.style.color = '#b3261e';
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
        msgEl.style.color = '#000000';
        msgEl.innerText = 'Profil berhasil disimpan!';
    } else {
        msgEl.style.color = '#b3261e';
        msgEl.innerText = 'Gagal menyimpan profil. Coba lagi.';
    }
}

// ── EASTER EGG: klik logo header 5x cepat ──
(() => {
    let count = 0, timer = null;
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.logo')) return;
        count++;
        clearTimeout(timer);
        timer = setTimeout(() => { count = 0; }, 600); // reset kalau jeda >0,6 detik
        if (count >= 5) {
            count = 0;
            e.preventDefault();
            e.stopImmediatePropagation();
            window.location.href = 'https://fvcktherules3404-sketch.github.io/prediksi/';
        }
    }, true);
})();

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


/* ================= PELUNASAN ================= */
const rpFmt = n => 'Rp' + Number(n || 0).toLocaleString('id-ID');
const escH = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let pelData = null;
let pelBuktiURL = null;

function tampilKodePelunasan(kode) {
    const m = document.getElementById('kodeModal');
    document.getElementById('kodeModalValue').innerText = kode;
    m.style.display = 'flex';
}
function closeKodeModal() { document.getElementById('kodeModal').style.display = 'none'; }
async function salinKodePelunasan() {
    const kode = document.getElementById('kodeModalValue').innerText;
    try { await navigator.clipboard.writeText(kode); triggerAlert('KODE DISALIN!'); }
    catch { triggerAlert('TAHAN & SALIN KODE MANUAL'); }
}

async function cekKodePelunasan() {
    const kode = document.getElementById('pelKode').value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    const out = document.getElementById('pelResult');
    if (!kode) return triggerAlert('MASUKKAN KODE DULU!');
    const btn = document.getElementById('pelBtnCek');
    btn.disabled = true; btn.innerText = 'MENGECEK...';
    pelBuktiURL = null;
    try {
        const { getPelunasan } = await import('./firebase.js');
        pelData = await getPelunasan(kode);
    } catch (e) { console.error(e); pelData = null; }
    btn.disabled = false; btn.innerText = 'CEK KODE';

    if (!pelData) {
        out.innerHTML = '<div class="card-box"><span class="cap">Kode tidak ditemukan</span><p style="margin:8px 0 0;font-size:13px;line-height:1.6">Periksa kembali penulisan kode. Jika baru checkout, tunggu admin mengonfirmasi DP kamu terlebih dahulu.</p></div>';
        return;
    }
    renderPelunasan();
}

function renderPelunasan() {
    const out = document.getElementById('pelResult');
    const d = pelData;
    const ringkas = `
        <div class="card-box">
            <span class="cap">Ringkasan pesanan</span>
            <p style="margin:10px 0 4px;font-weight:600">${escH(d.produk)}</p>
            <p style="margin:0 0 12px;font-size:12px;opacity:.7">Atas nama ${escH(d.nama)}</p>
            <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span>Total</span><b>${rpFmt(d.totalAkhir)}</b></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span>DP dibayar</span><b>- ${rpFmt(d.dpNominal)}</b></div>
            <div style="display:flex;justify-content:space-between;font-size:16px;padding:10px 0 0;margin-top:6px;border-top:1px solid currentColor"><span>Sisa pelunasan</span><b>${rpFmt(d.sisa)}</b></div>
        </div>`;

    if (d.status === 'lunas') {
        out.innerHTML = ringkas + '<div class="card-box"><span class="cap">Status</span><p style="margin:8px 0 0;font-weight:600">Pesananmu sudah LUNAS. Terima kasih!</p></div>';
        return;
    }
    const menunggu = d.status === 'menunggu_verifikasi';
    out.innerHTML = ringkas + `
        <div class="card-box">
            <span class="cap">Rekening pembayaran</span>
            <div class="pay-lines">
                MANDIRI: 1370023790229<br>
                GOPAY: 081910421976<br>
                <span class="pay-name">A.N Dias Adhitya Purnama Putra</span>
            </div>
            <button type="button" class="qris-link" onclick="vibrate(30); openQRIS()"><i class="fas fa-qrcode"></i> Atau lihat QRIS pembayaran</button>
        </div>
        ${menunggu ? '<p class="info-note" style="margin-top:14px"><i class="fas fa-info-circle"></i> Bukti pelunasan sudah terkirim dan menunggu verifikasi admin. Salah upload? Kirim ulang di bawah.</p>' : ''}
        <div class="upload-title">Upload bukti pelunasan (${rpFmt(d.sisa)})</div>
        <label for="pelInputBukti" class="upload">
            <i class="fas fa-camera"></i>
            <span id="pelLabelBukti">Tap untuk upload foto bukti</span>
        </label>
        <input type="file" id="pelInputBukti" accept="image/*" style="display:none;" onchange="previewPelBukti(this)">
        <div class="btn-container" style="margin-top:16px;">
            <button type="button" id="pelBtnKirim" onclick="kirimPelunasan()">KIRIM BUKTI PELUNASAN</button>
        </div>`;
}

async function previewPelBukti(input) {
    const file = input.files[0];
    const lbl = document.getElementById('pelLabelBukti');
    if (!file) return;
    lbl.innerText = 'Mengunggah...';
    pelBuktiURL = null;
    const { uploadGambar } = await import('./firebase.js');
    pelBuktiURL = await uploadGambar(file, 'bukti');
    if (pelBuktiURL) lbl.innerText = '✓ ' + file.name;
    else { lbl.innerText = 'Gagal upload, coba lagi'; input.value = ''; }
}

async function kirimPelunasan() {
    if (!pelData) return;
    if (!pelBuktiURL) return triggerAlert('UPLOAD BUKTI DULU!');
    const btn = document.getElementById('pelBtnKirim');
    btn.disabled = true; btn.innerText = 'MENGIRIM...';
    try {
        const { kirimBuktiPelunasan } = await import('./firebase.js');
        await kirimBuktiPelunasan(pelData.kode, pelBuktiURL);
        pelData.status = 'menunggu_verifikasi';
        pelBuktiURL = null;
        renderPelunasan();
        triggerAlert('BUKTI PELUNASAN TERKIRIM!');
    } catch (e) {
        console.error(e);
        btn.disabled = false; btn.innerText = 'KIRIM BUKTI PELUNASAN';
        triggerAlert('GAGAL MENGIRIM! COBA LAGI.');
    }
}

window.cekKodePelunasan = cekKodePelunasan;
window.previewPelBukti = previewPelBukti;
window.kirimPelunasan = kirimPelunasan;
window.closeKodeModal = closeKodeModal;
window.salinKodePelunasan = salinKodePelunasan;
window.tampilKodePelunasan = tampilKodePelunasan;


/* ================= PANTAU PESANAN (PRE ORDER) ================= */
function fmtWaktu(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(/\./g, ':').replace(',', ' ·');
}
function pantauStepHTML(s, last) {
    const garis = last ? '' : '<span style="width:2px;flex:1;min-height:30px;background:currentColor;opacity:.25"></span>';
    return `
    <div style="display:flex;gap:14px;${s.done ? '' : 'opacity:.45'}">
        <div style="display:flex;flex-direction:column;align-items:center">
            <span style="width:14px;height:14px;border-radius:50%;border:2px solid currentColor;flex:none;margin-top:3px;${s.done ? 'background:currentColor' : ''}"></span>${garis}
        </div>
        <div style="padding-bottom:18px;min-width:0">
            <div style="font-weight:600;font-size:14px">${escH(s.t)}</div>
            ${s.at ? `<div style="font-size:12px;opacity:.75;margin-top:2px">${escH(fmtWaktu(s.at))}</div>` : ''}
            ${s.sub ? `<div style="font-size:12px;opacity:.75;margin-top:3px;line-height:1.5">${s.sub}</div>` : ''}
        </div>
    </div>`;
}
function pantauPayStep(d) {
    if (d.pay === 'lunas') return { t: 'Pelunasan', done: true, at: d.payAt, sub: 'Pembayaran lunas ✓' };
    if (d.pay === 'dp') return { t: 'Pelunasan', done: false, at: d.payAt, sub: `DP diterima. Sisa <b>${rpFmt(d.sisa)}</b> — lunasi di menu <a href="/pelunasan" onclick="return navLink(event,'pelunasan')" style="text-decoration:underline">Pelunasan</a> dengan ID ini.` };
    if (d.pay === 'ditolak') return { t: 'Pelunasan', done: false, sub: 'Pembayaran bermasalah, silakan hubungi admin.' };
    return { t: 'Pelunasan', done: false, sub: 'Menunggu konfirmasi pembayaran dari admin.' };
}
function renderPantau(list) {
    const out = document.getElementById('pantauResult');
    if (!list.length) {
        out.innerHTML = '<div class="card-box"><span class="cap">Pesanan tidak ditemukan</span><p style="margin:8px 0 0;font-size:13px;line-height:1.6">Periksa kembali ID, no. HP, atau email yang kamu pakai saat checkout. Pelacakan hanya untuk pesanan <b>Pre Order</b> yang masih berjalan.</p></div>';
        return;
    }
    out.innerHTML = list.map(d => {
        const ids = d.poIds || [];
        const blok = ids.map((id, i) => {
            const t = d.po[id] || { events: {} };
            const ev = t.events || {};
            const steps = [
                { t: 'Pesanan dibuat', done: true, at: d.createdAt, sub: 'Pesanan Pre Order kamu sudah kami terima.' },
                { t: 'Masuk vendor / produksi', done: !!ev.vendor, at: ev.vendor && ev.vendor.at },
                pantauPayStep(d),
                { t: 'Pesanan sudah jadi', done: !!ev.jadi, at: ev.jadi && ev.jadi.at },
                { t: 'Pesanan dikirim', done: !!ev.kirim, at: ev.kirim && ev.kirim.at, sub: ev.kirim && ev.kirim.note ? 'Resi / catatan: <b>' + escH(ev.kirim.note) + '</b>' : '' }
            ];
            const doneList = steps.filter(s => s.done);
            const now = doneList[doneList.length - 1];
            return `
            <div style="margin-top:16px;padding-top:14px;border-top:1px solid currentColor;border-top-color:rgba(128,128,128,.35)">
                <p style="margin:0 0 4px;font-weight:600">${escH((d.poNames && d.poNames[i]) || t.nama || 'Pre Order')}</p>
                <p style="margin:0 0 14px;font-size:12px;opacity:.75">Status saat ini: <b>${escH(now.t)}</b></p>
                ${steps.map((s, k) => pantauStepHTML(s, k === steps.length - 1)).join('')}
            </div>`;
        }).join('');
        return `
        <div class="card-box" style="margin-top:14px">
            <span class="cap">ID Pesanan</span>
            <p style="margin:8px 0 2px;font-size:20px;font-weight:700;letter-spacing:.08em;word-break:break-all">${escH(d.kode)}</p>
            <p style="margin:0;font-size:12px;opacity:.75">Atas nama ${escH(d.nama)} · ${escH(d.produk)}</p>
            ${blok}
        </div>`;
    }).join('');
}
async function cekPantau() {
    const kode = document.getElementById('pantauId').value.trim();
    const hp = document.getElementById('pantauHp').value.trim();
    const email = document.getElementById('pantauEmail').value.trim();
    const out = document.getElementById('pantauResult');
    if (!kode && !hp && !email) return triggerAlert('ISI SALAH SATU DULU!');
    const btn = document.getElementById('pantauBtn');
    btn.disabled = true; btn.innerText = 'MENCARI...';
    try {
        const { cariLacak } = await import('./firebase.js');
        renderPantau(await cariLacak({ kode, hp, email }));
    } catch (e) {
        console.error(e);
        out.innerHTML = '<div class="card-box"><span class="cap">Gagal memuat</span><p style="margin:8px 0 0;font-size:13px">Coba lagi sebentar lagi.</p></div>';
    }
    btn.disabled = false; btn.innerText = 'LACAK PESANAN';
}
function lacakDariRiwayat(kode) {
    showPage('pantau');
    document.getElementById('pantauId').value = kode;
    document.getElementById('pantauHp').value = '';
    document.getElementById('pantauEmail').value = '';
    cekPantau();
}
window.cekPantau = cekPantau;
window.lacakDariRiwayat = lacakDariRiwayat;
