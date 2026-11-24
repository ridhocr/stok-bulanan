# StokBulanan

StokBulanan membantu rumah tangga mencatat pembelian, menilai sisa pada akhir siklus, dan menyiapkan daftar belanja periode berikutnya. Spesifikasi tersedia di [PRD](./PRD_StokBulanan_v1.md) dan [SDD](./SDD_StokBulanan_v1.md).

## Jalankan secara lokal

Gunakan Node.js 22.12 atau lebih baru. Node.js 24 dipakai di CI.

```powershell
npm ci
npm run dev
```

Buka [localhost:3000](http://127.0.0.1:3000). Pilih **Coba dengan data contoh** untuk menjelajahi review dan histori yang sudah terisi, atau **Mulai dari kosong** untuk membuat siklus pertama. Mode demo memakai PostgreSQL lokal melalui PGlite. Data dan kunci sesi demo tersimpan di `.data/`. Akun demo terkait cookie browser. Keluar akan mengakhiri akses browser ke akun demo tersebut.

Untuk menjalankan hasil build lokal, pakai `npm run build` lalu `npm start`.

## Alur belanja

1. Tambahkan produk, satuan dasar, dan isi kemasan di **Produk**. Kategori dan jumlah awal dapat diisi sesuai kebutuhan.
2. Buat dan aktifkan periode di **Siklus belanja**. Isi stok awal yang diketahui dan catat pembelian aktual. Data stok awal yang kosong ditandai sebagai belum dikonfirmasi.
3. Di **Review stok**, pilih Kurang, Pas, Cukup, atau Berlebih. Isi tanggal habis atau sisa aktual sesuai pilihan. Tutup siklus saat siap, termasuk jika review masih parsial.
4. Buat siklus berikutnya, buka **Rekomendasi**, sesuaikan jumlah, lalu buat daftar. Di mal, buka **Mode belanja** untuk mencari barang per kategori, mencentang, mengubah jumlah, dan mengisi harga. Finalisasi menyimpan barang yang dicentang sebagai pembelian. Siklus draf diaktifkan saat finalisasi jika periode memenuhi syarat.
5. Buka detail produk untuk melihat histori dan melakukan koreksi. Saran tersimpan mengikuti snapshot daftar. Gunakan **Regenerasi daftar** secara eksplisit untuk menerapkan perhitungan terbaru sebelum finalisasi.

Stok akhir dibawa otomatis ke siklus yang mulai tepat sehari setelah tanggal akhir periode sebelumnya, jika periode itu sudah ditutup dan hitungan akhirnya bisa dipakai. Stok yang tidak diketahui memakai baseline pembelian terakhir atau jumlah awal produk. Jika keduanya kosong, pengguna mengisi rencana secara manual.

## Mode belanja di ponsel

- **Perlu dibeli** menampilkan rencana yang belum dicentang. **Di keranjang** memudahkan mengecek barang yang sudah masuk. Pilih **Semua** untuk melihat barang dengan rencana nol dan menambah jumlahnya.
- Tombol + dan − mengubah jumlah aktual sesuai kelipatan kemasan. Jika jumlah berubah, masukkan kembali harga total agar sesuai dengan jumlah baru.
- **Atur anggaran** menyimpan batas per daftar. Ringkasan keranjang memakai harga aktual yang diisi, atau perkiraan dari harga terakhir bila tersedia. Barang tanpa harga ditandai dan belum dihitung ke total.

## Jalankan di server sendiri

Aplikasi memakai React, Node.js, PostgreSQL, dan Resend. Demo lokal memakai PGlite dengan skema dan RLS yang sama.

1. Buat database untuk aplikasi pada PostgreSQL yang sudah tersedia. Salin [.env.example](./.env.example) ke `.env` atau atur variabel pada host. Isi `DATABASE_URL`, `APP_ORIGIN` (misalnya `https://stok.example.com`), `RESEND_API_KEY`, dan `EMAIL_FROM` (misalnya `"StokBulanan <login@example.com>"`).
2. Gunakan alamat pengirim pada domain yang sudah diverifikasi di Resend dan API key dengan izin kirim. Opsional, isi `AUTH_ALLOWED_EMAILS` dengan email yang diizinkan, dipisahkan koma. Jika kosong, siapa pun yang dapat memverifikasi email bisa membuat akun dengan data terpisah. [Kirim email lewat Resend](https://resend.com/docs/api-reference/emails/send-email)
3. Jalankan `npm ci` dan `npm run migrate`. Gunakan `MIGRATION_DATABASE_URL` bila akun migrasi terpisah. Migrasi membutuhkan hak membuat skema dan role. Migrasi mengenali instalasi sebelumnya dan menambahkan skema autentikasi serta kolom anggaran. Tabel data belanja tetap memakai RLS pada skema `stock`.
4. Jika akun runtime terpisah, beri akun tersebut hak koneksi ke database dan keanggotaan di `stokbulanan_app` serta `stokbulanan_auth`. Contoh SQL di bawah memakai nama akun runtime `stokbulanan_runtime`.

   ```sql
   GRANT stokbulanan_app, stokbulanan_auth TO stokbulanan_runtime;
   ```

5. Jalankan `npm run build` lalu `npm start` dengan `NODE_ENV=production`. Untuk reverse proxy pada server yang sama, bind Node ke `127.0.0.1:3000` dan tangani HTTPS di proxy. Aktifkan `TRUST_PROXY=true` hanya jika proxy menimpa `X-Real-IP` dengan IP klien. Hapus akses runtime ke URL migrasi jika role dipisah.

Koneksi PostgreSQL memverifikasi TLS secara default. Gunakan `DATABASE_CA` untuk CA internal dalam bentuk PEM, dengan `\n` untuk baris baru. Jika Node dan PostgreSQL berkomunikasi lewat koneksi lokal atau jaringan privat yang memang tanpa TLS, atur `DATABASE_SSL=disable`.

Tautan masuk berlaku 15 menit dan pengguna menekan konfirmasi pada halaman masuk. PostgreSQL menyimpan hash token dan sesi. Tombol **Keluar** mencabut sesi.

## Verifikasi

```powershell
npm test
npm run build
```

Tes mencakup contoh hitungan rekomendasi, presisi kemasan, alur belanja dua siklus, anggaran, isolasi akun, rollback, serta finalisasi bersamaan. Tes login memakai respons Resend yang disimulasikan dan menguji kedaluwarsa, penggunaan sekali, dan pencabutan sesi di PostgreSQL. API berada di `/api/v1` dan memakai sesi cookie.
