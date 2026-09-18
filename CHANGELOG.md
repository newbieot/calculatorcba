# Changelog

## 2.2.0 — 2026-09-18

- Menghubungkan alur **Cek Perhitungan CBA** langsung ke **Buat Excel CBA** saat pengguna merasa hasil perhitungan sudah cocok.
- Menambahkan card integrasi interaktif pada panel hasil kalkulasi untuk beralih langsung ke alur dokumen Excel tanpa input ulang.
- Menambahkan tombol aksi adaptif "Ke Excel CBA" / "Unduh Excel" pada action bar hasil analisis.
- Mengonversi otomatis output Reverse Budget (batas net vendor) menjadi nilai net vendor maju saat beralih ke Buat Excel CBA sehingga penawaran customer tetap konsisten.
- Menambahkan banner ringkasan data biaya & asumsi terintegrasi pada formulir dokumen Excel beserta tautan cepat untuk mengubah nilai biaya.

## 2.1.1 — 2026-09-18

- Menghapus bagian Informasi Analisis / Identitas Skenario.
- Menghapus fungsi simpan, muat, hapus, dan perbandingan skenario tersimpan.
- Memindahkan Nama Proyek yang dibutuhkan workbook ke formulir khusus **Buat Excel CBA**.
- Menyederhanakan navigasi menjadi tiga langkah untuk cek perhitungan dan empat langkah untuk ekspor Excel.

## 2.1.0 — 2026-09-18

- Menambahkan pilihan alur **Cek Perhitungan CBA** dan **Buat Excel CBA**.
- Menambahkan formulir data proyek untuk pembuatan workbook langsung di browser.
- Menghasilkan workbook berisi `CBA2`, `Rekap CBA 1`, `RBL`, `RBL 2`, dan `SOW Shadow` tanpa sheet Packing List.
- Mengisi formula, rincian biaya, rute, PIC, dan ruang lingkup kerja dari input pengguna.
- Menjadikan **CV Emy Rizky Jaya** sebagai vendor bawaan dengan NIB dan NPWP otomatis.
- Menambahkan opsi vendor lain dengan nama, NIB, dan NPWP yang dapat diisi manual.

## 2.0.0 — 2026-07-28

- Redesign total UI menjadi workspace pricing dua kolom yang responsif.
- Mempertahankan dua mode formula lama: Hitung Penawaran dan Reverse Budget.
- Mempertahankan seluruh input lama: wilayah, margin, custom margin, PKP, vendor, SDM, gudang, dan operasional.
- Menghapus dependensi runtime Tailwind CDN, Google Fonts, dan Lucide CDN.
- Menambahkan kalkulasi realtime setelah nilai utama tersedia.
- Mengganti browser alert dengan validasi inline dan toast.
- Menambahkan project name, analyst, dan notes sebagai field opsional.
- Menambahkan breakdown transparan, formula aktif, grafik native, dan sensitivitas margin.
- Menambahkan save/load/compare scenario berbasis localStorage dengan versioning.
- Menambahkan copy summary, ekspor JSON, print A4, empty state, dan error state.
- Menambahkan SEO metadata, structured data, manifest, robots.txt, sitemap.xml, halaman 404, dan security headers.
- Menyamakan footer dengan referensi `lacakresipos-main.zip`.
- Menambahkan dokumentasi audit dan regression test.
