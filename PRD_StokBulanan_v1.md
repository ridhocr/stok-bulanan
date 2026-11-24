# PRODUCT REQUIREMENTS DOCUMENT (PRD)
## StokBulanan — Asisten Belanja dan Stok Rumah Tangga

**Versi:** 1.0 (draft untuk implementasi MVP)  
**Tanggal:** 23 November 2026  
**Platform:** Web responsif, mobile-first  
**Target:** Pengguna pribadi/rumah tangga yang rutin belanja stok tiap 28–31 hari  
**Status:** Usulan produk; asumsi perlu divalidasi saat uji pengguna

---

## 1. Ringkasan eksekutif

StokBulanan adalah aplikasi web yang membantu pengguna mengingat barang apa saja yang biasa dibeli, jumlah pembelian bulan lalu, apakah jumlah itu **kurang, pas, cukup, atau berlebih**, serta berapa jumlah yang disarankan untuk siklus berikutnya. Aplikasi dirancang agar **tidak memaksa pengguna mencatat pemakaian setiap hari**: cukup catat belanja dan lakukan evaluasi singkat menjelang belanja berikutnya.

**Value proposition:** “Buka aplikasi saat mau belanja, lihat daftar stok rutin beserta jumlah rekomendasi dan alasannya, lalu centang ketika barang masuk keranjang.”

## 2. Masalah pengguna

- Daftar produk bulanan tersebar di ingatan, catatan, atau riwayat transaksi.
- Sulit mengingat apakah pembelian periode lalu tahan satu bulan.
- Jumlah yang dibeli sering berulang tanpa mempertimbangkan sisa atau kekurangan.
- Pengguna tidak ingin sistem inventori yang rumit atau harus diisi harian.
- Pada hari belanja, keputusan perlu cepat, jelas, dan bisa dilakukan via ponsel.

## 3. Tujuan, non-tujuan, dan ukuran sukses

### 3.1 Tujuan produk

1. Menyediakan daftar belanja rutin dalam satu tempat, lengkap dengan histori pembelian per produk.
2. Mencatat hasil evaluasi per produk per siklus: kurang, pas, cukup, atau berlebih.
3. Menghasilkan rekomendasi pembelian siklus berikutnya yang dapat ditinjau dan diubah.
4. Menunjukkan dasar rekomendasi: pemakaian yang diamati, stok tersisa, lama siklus, dan kemasan.
5. Memungkinkan pengguna membuat dan menyelesaikan daftar belanja tanpa input harian.

### 3.2 Di luar ruang lingkup MVP

- Integrasi kasir, marketplace, e-commerce, dan sinkronisasi struk otomatis.
- Barcode scanner, OCR struk, dan AI pengenalan produk.
- Prediksi berbasis machine learning, harga real-time, dan optimasi promo.
- Multi-akun rumah tangga dengan izin per anggota.
- Mode offline penuh dan push notification; disiapkan sebagai fase lanjut.

### 3.3 Metrik sukses awal (hipotesis, bukan data aktual)

| Metrik | Target uji MVP | Cara ukur |
|---|---|---|
| Penyelesaian evaluasi siklus | ≥70% dari siklus yang ditutup | Event `cycle_review_completed` |
| Adopsi rekomendasi | ≥60% item menerima saran tanpa edit | Selisih saran vs jumlah final |
| Waktu menyiapkan daftar bulanan | ≤10 menit untuk 30 produk | Usability test |
| Retensi setelah dua siklus | ≥50% pengguna uji kembali aktif | Cohort 60 hari |
| Kepercayaan rekomendasi | ≥4/5 pada survei uji | Feedback in-app |

## 4. Persona dan skenario

**Persona utama:** Pengelola belanja rumah, membeli sekitar 20–80 jenis produk tiap 1 bulan, mengutamakan kemudahan, dan ingin mengurangi lupa beli/kebanyakan stok.

**Skenario:** Pada 1 November pengguna membeli 2 sabun. Sabun habis pada hari ke-20 dari siklus 30 hari. Saat review, pengguna pilih **Kurang** dan isi tanggal habis. Aplikasi memperkirakan kebutuhan 30 hari = 3 sabun, bukan 2, lalu memasukkannya ke daftar berikutnya. Untuk deterjen, pengguna beli 4 pouch dan masih tersisa 1; kebutuhan teramati 3 pouch, sehingga saran pembelian berikutnya 2 pouch (dengan asumsi stok tersisa tetap 1 dan periode 30 hari).

## 5. Prinsip pengalaman pengguna

- **Minimal input:** tambah produk sekali; selanjutnya gunakan histori.
- **Review bulanan lebih penting daripada tracking harian:** evaluasi cepat dengan tombol status.
- **Transparan:** tampilkan “Kenapa disarankan 3 pcs?”; jangan klaim presisi saat data tidak cukup.
- **Dapat dikoreksi:** jumlah rekomendasi selalu dapat diubah manual.
- **Jumlah dan satuan jelas:** beli 1 pack isi 6 berbeda dari 1 pcs.
- **Bisa dipakai sambil belanja:** daftar ringkas dengan checkbox, pencarian, kategori, dan total perkiraan.

## 6. Ruang lingkup fungsional dan prioritas

| ID | Fitur | Prioritas | Deskripsi |
|---|---|---|---|
| F-01 | Akun pengguna | P0 | Masuk dengan email magic link; data pribadi terpisah per akun |
| F-02 | Katalog produk | P0 | Tambah/edit/arsip produk, kategori, satuan dasar, ukuran kemasan |
| F-03 | Siklus belanja | P0 | Tentukan tanggal mulai/akhir; panjang periode fleksibel (contoh 30 hari) |
| F-04 | Catat pembelian | P0 | Catat jumlah kemasan, harga opsional, tanggal belanja; tersimpan di histori |
| F-05 | Evaluasi akhir siklus | P0 | Status Kurang/Pas/Cukup/Berlebih, sisa aktual, tanggal habis bila ada |
| F-06 | Rekomendasi jumlah | P0 | Hitung dari histori relevan, sisa tercatat, periode berikutnya, pembulatan kemasan |
| F-07 | Daftar belanja | P0 | Generate dari rekomendasi; edit jumlah; centang; simpan hasil pembelian |
| F-08 | Riwayat per produk | P0 | Tabel pembelian, review, perubahan jumlah, dan alasan rekomendasi |
| F-09 | Dashboard | P0 | Siklus berjalan/berikutnya, produk sering kurang, daftar siap belanja |
| F-10 | Pencarian/filter | P0 | Cari produk, filter kategori/status, urutkan nama atau prioritas |
| F-11 | Budget dan total estimasi | P1 | Harga terakhir, estimasi total, aktual belanja |
| F-12 | Pengingat dan ekspor | P1 | Email/pengingat, CSV/Excel, backup data mandiri |
| F-13 | Stok harian dan belanja susulan | P1 | Pencatatan penggunaan/penyesuaian jika dibutuhkan pengguna |
| F-14 | Multi-pengguna rumah tangga | P2 | Berbagi katalog dan daftar dengan anggota rumah |

## 7. Definisi status evaluasi

| Status | Aturan praktis untuk pengguna | Data minimum | Efek pada rekomendasi |
|---|---|---|---|
| **Kurang** | Produk habis sebelum tanggal akhir siklus | Tanggal habis disarankan; bisa kosong | Naikkan prediksi sesuai laju pemakaian jika tanggal diketahui; fallback dengan tanda ketidakpastian |
| **Pas** | Produk habis tepat atau sangat dekat akhir siklus | Sisa = 0 | Estimasi pemakaian sama dengan stok yang tersedia selama siklus |
| **Cukup** | Produk tidak habis dan sisa dianggap wajar | Sisa aktual (angka) | Kurangi pembelian dengan memperhitungkan sisa |
| **Berlebih** | Sisa terlalu banyak / menumpuk | Sisa aktual (angka) | Turunkan pembelian atau rekomendasikan tidak membeli |
| **Belum dinilai** | Tidak ada review | Tidak ada | Gunakan histori valid terakhir; tandai keyakinan lebih rendah |

Catatan: Status adalah **penilaian pengguna**, bukan turunan otomatis yang kaku dari jumlah sisa. Aplikasi menyarankan status berdasarkan data, tetapi pengguna dapat mengubahnya. Untuk **Cukup** dan **Berlebih**, sisa angka diwajibkan agar saran bisa dipercaya. Nilai nol untuk **Pas**; untuk **Kurang** tanggal habis opsional tetapi dianjurkan.

## 8. Alur utama pengguna

### 8.1 Onboarding pertama kali

1. Login, pilih nama daftar rumah (opsional), tentukan durasi siklus default 30 hari.
2. Tambah produk (contoh: beras, sabun, deterjen) dengan kategori, satuan dasar, dan isi kemasan.
3. Input jumlah yang dibeli untuk siklus pertama; jika ada stok awal, isi jumlahnya.
4. Aplikasi menyimpan baseline. Rekomendasi awal bersifat **manual / berdasarkan pembelian pertama**, bukan mengaku prediksi akurat.

### 8.2 Menjelang akhir siklus

1. Aplikasi menampilkan daftar produk yang perlu direview.
2. Pengguna pilih status pada setiap baris, lalu isi sisa atau tanggal habis bila relevan.
3. Sistem menampilkan ringkasan: 5 kurang, 12 pas, 8 cukup, 3 berlebih (contoh).
4. Pengguna menutup siklus. Data disimpan sebagai snapshot dan dapat diperbaiki melalui alur koreksi.

### 8.3 Mempersiapkan belanja bulan depan

1. Buat siklus berikutnya (tanggal mulai, tanggal akhir).
2. Generate daftar dari rekomendasi seluruh produk rutin.
3. Lihat jumlah saran dan alasan, misalnya “2 pcs habis di hari ke-20; estimasi 3 pcs untuk 30 hari”.
4. Ubah kuantitas atau hapus item bila tidak dibutuhkan; simpan daftar.
5. Saat belanja, centang item dan catat kuantitas aktual/harga jika berbeda.
6. Finalisasi belanja; pembelian menjadi histori dan basis review siklus selanjutnya.

## 9. Aturan bisnis inti

**BR-01. Periode** — siklus ditetapkan dengan `start_date` dan `end_date` inklusif; target hari = `end_date - start_date + 1` dalam tanggal lokal pengguna. Sistem melarang siklus periode aktif saling tumpang tindih.

**BR-02. Satuan** — setiap produk punya satuan dasar (misalnya pcs, gram, ml) dan ukuran kemasan. Pembelian disimpan sebagai `jumlah kemasan × isi kemasan` dalam satuan dasar. Untuk MVP, 1 produk mempunyai 1 konfigurasi kemasan pembelian; perubahan kemasan tidak mengubah histori lama.

**BR-03. Sisa akhir** — `stok_tersisa` hasil hitung fisik pada akhir siklus. Jika pengguna tidak melakukan hitung, sistem tidak menampilkan stok terkini sebagai angka yang pasti.

**BR-04. Pemakaian teramati** — untuk data lengkap, `pakai = stok_awal + seluruh_pembelian_valid - stok_akhir - penyesuaian_non-pakai`. Nilai negatif tidak diperbolehkan sebagai pemakaian valid; tandai perlu koreksi.

**BR-05. Kecepatan pemakaian** — bila stok habis sebelum akhir siklus, gunakan hari sampai tanggal habis, bukan seluruh panjang siklus. Bila tak ada tanggal habis, jangan mengklaim mengetahui laju pemakaian.

**BR-06. Rekomendasi** — target stok = `ceil(laju_pakai_per_hari × (hari_siklus_berikut + hari_cadangan))`; jumlah beli = `max(0, target_stok − stok_tersisa_terverifikasi)`, lalu bulatkan ke kelipatan ukuran kemasan. Default hari cadangan = 0, dapat diubah pada pengaturan.

**BR-07. Basis historis** — gunakan maksimal 3 siklus terakhir dengan data memadai; rata-rata tertimbang menurut hari teramati. Jika data tak lengkap, gunakan pembelian terakhir yang diketahui sebagai *baseline*, lalu minta konfirmasi pengguna.

**BR-08. Ketidakpastian** — tampilkan `Tinggi / Sedang / Rendah` beserta alasan; misalnya status Kurang tanpa tanggal habis = Rendah. Jangan hitung saran nol hanya karena data kosong.

**BR-09. Override** — pengguna dapat mengubah hasil rekomendasi. Pembelian aktual, bukan rekomendasi lama, yang masuk histori.

**BR-10. Koreksi** — review/pembelian dapat dikoreksi selama data terkait dapat dihitung ulang; simpan metadata waktu perubahan. Saran lama dalam daftar belanja yang sudah dibuat tidak berubah diam-diam.

## 10. Kebutuhan per layar

| Layar | Informasi utama | Tindakan utama |
|---|---|---|
| Dashboard | Siklus saat ini, progres review, barang berpotensi kurang, belanja berikut | Mulai review, buat daftar |
| Produk | Nama, kategori, unit, histori singkat, status siklus terakhir | Tambah/edit/arsip, cari |
| Detail produk | Timeline pembelian dan penilaian, stok terakhir tercatat | Ubah data, lihat alasan saran |
| Review siklus | Kartu produk, tombol empat status, input sisa/tanggal habis | Simpan per item, selesai review |
| Rekomendasi | Saran beli, satuan/pack, keyakinan, alasan | Setujui atau ubah |
| Daftar belanja | Checklist, jumlah direncanakan, jumlah aktual, harga opsional | Centang, finalisasi belanja |
| Pengaturan | Durasi default, hari cadangan, pengelolaan akun | Ubah preferensi |

## 11. User stories dan acceptance criteria

**US-01 — Katalog.** Sebagai pengguna, saya ingin memasukkan nama produk, kategori, dan isi kemasan sekali saja. **Diterima bila:** produk tersimpan, unit dan ukuran kemasan >0, dan produk yang diarsip tidak otomatis muncul di daftar baru.

**US-02 — Histori.** Saya ingin melihat “bulan lalu beli berapa”. **Diterima bila:** halaman detail menampilkan tanggal, jumlah kemasan, ekuivalen satuan dasar, dan harga jika ada.

**US-03 — Review.** Saya ingin menilai apakah jumlahnya kurang/pas/cukup/berlebih. **Diterima bila:** empat status ada; status Kurang menawarkan tanggal habis; Cukup/Berlebih memerlukan sisa; review tersimpan per produk & siklus.

**US-04 — Saran jumlah.** Saya ingin tahu berapa harus beli bulan depan. **Diterima bila:** saran menunjukkan angka, pembulatan pack, stok tersisa yang dipakai, dan alasan; bila data tak lengkap muncul label “perkiraan”.

**US-05 — Daftar belanja.** Saya ingin belanja tanpa lupa barang. **Diterima bila:** daftar bisa dibuat dari katalog, jumlah bisa diubah, item bisa dicentang, dan pembelian aktual masuk histori setelah finalisasi.

**US-06 — Koreksi.** Saya ingin memperbaiki salah input. **Diterima bila:** perubahan tersimpan, sistem hitung ulang untuk saran berikutnya, dan item pada daftar yang sudah dibuat tetap stabil sampai pengguna regenerasi/ubah sendiri.

**US-07 — Isolasi akun.** Saya ingin data rumah saya tidak terlihat akun lain. **Diterima bila:** setiap akses API ke ID milik orang lain ditolak, termasuk melalui URL langsung.

## 12. Kasus tepi dan validasi

- Produk baru / belum ada review: sarankan jumlah awal berdasarkan input pengguna, beri label baseline.
- Produk tidak dibeli pada suatu siklus: tetap boleh direview jika masih ada stok lama.
- Produk habis sebelum akhir siklus tetapi tanggal lupa: tampilkan rekomendasi heuristik yang bisa diedit dan keyakinan rendah; jangan dianggap fakta.
- Sisa lebih besar dari stok tercatat: tolak atau minta koreksi pembelian/stok awal.
- Perubahan ukuran pack: histori lama disimpan pada ukuran saat transaksi; pembelian baru pakai ukuran aktif.
- Satuan pecahan: boleh untuk gram/ml; untuk pcs/pack, jumlah kemasan harus bilangan bulat sesuai konfigurasi.
- Periode 28/29/30/31 hari: rekomendasi gunakan jumlah hari aktual, tidak mengasumsikan selalu 30.
- Item dengan saran 0: tampilkan sebagai “tidak perlu beli”, tidak otomatis hilang dari katalog.
- Produk tidak dipakai lagi: arsip, histori dipertahankan.
- Duplikasi finalisasi belanja akibat klik ulang: hanya menghasilkan satu set transaksi pembelian.

## 13. Kebutuhan nonfungsional

- **Mobile-first:** fungsi inti nyaman digunakan pada lebar 360 px, layar sentuh, dan koneksi seluler biasa.
- **Performa:** target p95 respons API baca <500 ms (di luar latency jaringan); interaksi daftar 50 item tetap lancar.
- **Ketersediaan:** target layanan MVP 99,5% per bulan, mengikuti batas platform hosting.
- **Keamanan:** HTTPS, autentikasi, otorisasi per akun pada database/API, validasi input, perlindungan CSRF sesuai model sesi.
- **Privasi:** data tidak dijual; hanya data yang diperlukan, ekspor dan hapus akun tersedia pada roadmap sebelum rilis publik luas.
- **Aksesibilitas:** label form, navigasi keyboard, kontras teks, dan status tidak hanya dibedakan warna.
- **Bahasa & mata uang:** Bahasa Indonesia, zona waktu Asia/Jakarta default yang bisa diubah, mata uang IDR untuk MVP.

## 14. Rencana rilis

| Fase | Hasil yang dapat diuji | Kriteria lanjut |
|---|---|---|
| Sprint 1 — fondasi | Login, katalog produk, setting siklus, input pembelian | 20–50 barang dapat diinput tanpa hambatan |
| Sprint 2 — review | Review empat status, stok awal/akhir, histori produk | Review 30 produk selesai dalam ≤10 menit |
| Sprint 3 — rekomendasi | Perhitungan, penjelasan, keyakinan, daftar belanja | Seluruh contoh uji dan edge case lulus |
| Sprint 4 — polishing | Checklist belanja, koreksi, keamanan, mobile QA | Uji end-to-end dua siklus berhasil |
| Setelah MVP | Budget, pengingat, impor/ekspor, belanja susulan | Berdasarkan umpan balik pengguna |

## 15. Keputusan dan pertanyaan terbuka

**Keputusan kerja untuk MVP:** penggunaan pribadi satu akun; durasi periode fleksibel; kemasan tunggal per produk pada satu waktu; data review akhir siklus sebagai sumber utama; rekomendasi transparan dan bisa dioverride.

**Perlu divalidasi saat pengembangan:** apakah pengguna lebih suka menilai status saja tanpa input sisa; apakah harga harus wajib; apakah “Cukup” dan “Berlebih” perlu ambang yang disesuaikan; berapa jumlah produk rata-rata; apakah ada belanja mingguan/susulan yang sering terjadi. Semua keputusan di atas bisa diubah tanpa mengganti tujuan utama produk.

---

**Dokumen pendamping:** `SDD_StokBulanan_v1.md` — arsitektur, desain data, API, algoritma, dan strategi pengujian.
