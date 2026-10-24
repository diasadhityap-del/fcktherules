# Setup Midtrans (sekali saja)

## Key yang dipakai
| Dari dashboard Midtrans | Dipakai? | Disimpan di |
|---|---|---|
| **Server Key** | Ya, RAHASIA (buat transaksi + cek status) | GitHub Secret `MIDTRANS_SERVER_KEY` |
| **Client Key** | Ya (memuat popup bayar Snap; sifatnya publik) | GitHub Secret `MIDTRANS_CLIENT_KEY` |
| Merchant ID | Tidak perlu di kode | - |

Server Key tidak pernah masuk ke website/repo. Website hanya bicara ke API pembayaran (`payment-worker`) yang memegang key itu.

> Kenapa tidak langsung "GitHub Secret ke website"? GitHub Pages hanya file statis, secret GitHub cuma bisa dibaca oleh GitHub Actions.
> Jadi Actions men-deploy API kecil di Cloudflare Workers (gratis) dan menanam secret ke sana.

## Langkah
1. **Cloudflare** (gratis): daftar di cloudflare.com, buat API Token (template *Edit Cloudflare Workers*).
2. **GitHub** repo > Settings > Secrets and variables > Actions, buat 3 secret saja:
   `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `CLOUDFLARE_API_TOKEN`.
3. Push ke `main`. Workflow **Deploy API Pembayaran** jalan otomatis (atau Actions > Run workflow). Salin URL Worker-nya, contoh `https://fvck-pay.xxxx.workers.dev`.
4. **Kunci akses Firestore (sekali, bukan lewat GitHub):** Firebase Console > Project settings > Service accounts > *Generate new private key*. Lalu Cloudflare dashboard > Workers > `fvck-pay` > Settings > Variables and Secrets > tambah secret `FIREBASE_SERVICE_ACCOUNT`, isi dengan seluruh isi file JSON. Deploy ulang dari GitHub tidak menghapusnya.
5. Isi URL Worker di `payment-config.js` (`PAYMENT_API`), push lagi.
6. **Dashboard Midtrans** > Settings > Configuration > *Payment Notification URL* = `https://fvck-pay.xxxx.workers.dev/notify`. Aktifkan metode bayar yang diinginkan.
7. Admin panel > tab Order > tombol **Minimal DP**.

## Tes dulu pakai Sandbox
Pakai key Sandbox (diawali `SB-Mid-...`, dari dashboard.sandbox.midtrans.com) di GitHub Secrets. API otomatis memakai mode sandbox kalau Server Key diawali `SB-`. Kalau sudah lancar, ganti dua secret Midtrans ke key Production lalu jalankan ulang workflow.

## Perilaku
- Bayar **lunas**: order langsung `LUNAS`. Bayar **DP**: order `DP` + data pelunasan terbuat otomatis, sisa dibayar di menu Pelunasan (juga lewat Midtrans).
- Minimal DP persen dibulatkan ke kelipatan Rp5.000 terdekat (87.500 jadi 90.000, 86.000 jadi 85.000).
- Produk "tanpa DP" (di keranjang cukup satu) = hanya lunas, pilihan LUNAS/DP tidak tampil.
- Tidak dibayar sampai batas waktu (`PAYMENT_EXPIRY_MINUTES`, default 180 menit): order otomatis `DITOLAK` dan stok kembali.
- Pembayaran dobel / telat / refund ditandai di kartu order admin ("Cek dashboard Midtrans").
- Order lama yang pakai bukti transfer manual tetap bisa diverifikasi admin seperti biasa.

## Batasan yang perlu diketahui
- Ongkir tidak bisa diverifikasi server (datang dari Biteship lewat Apps Script). Harga produk, add-on, dan diskon voucher dicek ulang di server.
- Akun Midtrans Production harus sudah aktif/disetujui, dan website `fucktherules.my.id` terdaftar di data bisnis Midtrans.
- `qris.jpg` sudah tidak dipakai, boleh dihapus dari repo.
