# Albion Crafting Web

> Web UI pribadi untuk **Multi-Item Crafting Planner** di Albion Market Lab. Status: **perencanaan — implementasi belum dimulai**.

Tujuan: dari satu daftar target crafting, pengguna langsung tahu **bahan yang harus dibeli, berapa jumlahnya, di kota mana memasang buy order, dan estimasi modalnya**.

## Pengalaman pengguna (MVP)
1. Cari dan pilih equipment dari [catalog](https://github.com/albion-market-lab/albion-item-catalog) (item, tier/enchantment bila tersedia).
2. Isi quantity lalu **Tambah Item**; satu plan dapat berisi banyak item dengan tier dan jumlah berbeda.
3. Edit atau hapus target tanpa mengulang plan dari awal.
4. Tekan **Hitung** untuk menjalankan [calculator](https://github.com/albion-market-lab/albion-crafting-calculator).
5. Lihat tiga hasil utama:
   - **Shopping List** — agregasi material, jumlah, usulan kota BO, harga penawaran, dan modal.
   - **Refining Plan** — urutan kebutuhan material/refining per tier.
   - **Crafting Output** — daftar equipment dan total unit yang direncanakan untuk Black Market.

Contoh target (nama bersifat ilustratif, pemilihan sebenarnya menggunakan item ID yang valid): cloth armor T6 × 100 + plate shoes T5 × 20.

## Harga dan status ketersediaan
Web hanya **membaca** snapshot harga dari Google Sheets melalui endpoint read-only [market receiver](https://github.com/albion-market-lab/albion-market-receiver) atau adapter baca yang aman. Tidak ada harga dari sumber komunitas.

Untuk tiap harga tampilkan:
- **Segar**: masih berada dalam rentang batas usia yang dipilih.
- **Lama**: memiliki harga, tetapi timestamp sudah melewati batas. **Tetap tampilkan** harga + usia observasi.
- **Kosong**: item/kota/sisi BUY/SELL belum pernah discan; tampilkan `—` / *Belum ada data*, bukan 0.

Default umur data (misalnya 6 jam) adalah **konfigurasi**, bukan klaim real-time. Jika input harga belum lengkap, tandai estimasi modal **tidak lengkap** dan jelaskan bagian yang hilang.

## Pembagian tanggung jawab
- **Catalog** menyediakan item dan resep; web tidak menyimpan resep hardcoded.
- **Calculator** memproses seluruh perhitungan; komponen UI tidak menulis ulang algoritmanya.
- **Receiver / Sheet** menyediakan snapshot harga dan timestamp; web tidak memegang kredensial tulis.
- Seluruh tindakan dalam game (**buy order, refining, crafting, caravan, Black Market sell order**) tetap **manual**.

## Pilihan teknis awal
- Frontend statis, misalnya **React + TypeScript + Vite**.
- Hosting free tier, misalnya **Cloudflare Pages**.
- Cache harga seperlunya; tombol refresh data hanya membaca snapshot pribadi, **bukan** mengambil data komunitas.
- Penyimpanan drafting plan di browser dapat ditambahkan tanpa database pengguna pada MVP.

## Selesai jika
- Satu plan menampung item berbeda sekaligus dan bisa diedit.
- Hasil shopping list menggabungkan material lintas target dan dikelompokkan per kota.
- Refining plan dan craft output konsisten dengan calculator.
- Harga lama/kosong diberi status jelas serta estimasi parsial tidak menyesatkan.
- Website dapat berjalan tanpa VPS dan tanpa akses tulis ke Google Sheets.

## Sumber data awal yang sudah ada (28 Oktober 2026)

Google Sheets proyek telah diinisialisasi dengan tab `Items`, `Craft Recipes`, `Refining Recipes`, dan `Market Prices` (plus `README`). Data item dan resep sudah terisi; **harga masih kosong**.

Untuk UI:
- Ambil `item_id` + `display_name_en` dari catalog. `name_status=name_missing` berarti nama tampilan belum tersedia, jadi boleh fallback ke ID dengan label jelas.
- Filter item yang punya `has_crafting_recipe=true`, namun jangan menjanjikan semua item Albion sudah didukung.
- Ketika kalkulasi menggunakan resep dengan bahan khusus atau belum tersedia, tampilkan warning yang diberikan calculator.
- Harga **kosong** → `Belum ada data`; harga **lama** → tampilkan nominal + usia observasi. Jangan menampilkan estimasi modal lengkap bila sebagian harga kosong.
- Website wajib memakai endpoint **read-only** untuk mengakses snapshot harga, tanpa mengekspos akses tulis ke Google Sheets.

**Sumber harga tetap private-only:** tidak mengambil harga dari API komunitas dan tidak mengunggah hasil scan pribadi ke komunitas. Sheet harga masih kosong hingga receiver diimplementasikan.

## Ekosistem repositori

| Repositori | Tanggung jawab |
| --- | --- |
| [albion-item-catalog](https://github.com/albion-market-lab/albion-item-catalog) | Master data item dan resep crafting/refining |
| [albion-market-receiver](https://github.com/albion-market-lab/albion-market-receiver) | Menerima scan market pribadi dan menyimpan harga ke Google Sheets |
| [albion-crafting-calculator](https://github.com/albion-market-lab/albion-crafting-calculator) | Menghitung kebutuhan bahan, estimasi modal, dan rekomendasi kota BO |
| [albion-crafting-web](https://github.com/albion-market-lab/albion-crafting-web) | Antarmuka untuk merencanakan banyak target crafting |

**Alur:** Albion Online → collector lokal → receiver → Google Sheets → web UI + calculator. Katalog resep berasal dari data game, **bukan** dari Google Sheets.

## Di luar scope MVP
Login multi-user, pembayaran, otomatisasi order di game, AI recommendation, dan optimasi profit BM otomatis.
