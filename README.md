# 📡 FDI OPERATOR CHAT // TACTICAL SECURE TERMINAL

Aplikasi chat taktis bergaya retro CRT OS yang terinspirasi dari game investigasi **The Operator** (Bureau 81). Dilengkapi dengan sintesis suara ketik mekanik autentik, sistem jendela komunikasi 5 jam berbasis kode akses privat, enkripsi at-rest, serta rangkaian modul operator eksklusif untuk **Admin Level S (The Only One Admin)**.

---

## ⚡ Fitur Utama

- **🖥️ Estetika Retro CRT FDI OS:** Antarmuka terminal hijau fosfor & amber dengan efek scanline, vignette, dan layout modular ala sistem operasi tahun 90-an.
- **🔊 Sintesis Suara Keyboard Mekanik Autentik (Web Audio API):** Suara ketik switch taktis yang disintesis secara dinamis di browser pada setiap ketukan tombol (tanpa file audio eksternal), termasuk suara *ding* carriage-return pada tombol Enter dan teletype saat pesan masuk.
- **⏳ Jendela Komunikasi 5 Jam:** Setiap agen memiliki **12-Karakter Private Access Code** unik (`XXXX-XXXX-XXXX`). Memasukkan kode agen lain membuka komunikasi bilateral terenkripsi selama tepat **5 jam** dengan countdown timer real-time. Setelah waktu habis, obrolan terkunci otomatis sampai kode dimasukkan ulang.
- **🛡️ Akses Eksklusif Admin Level S (Evan Tanner Operator Suite):**
  - **TERM (Operator Terminal):** Konsol baris perintah untuk mengontrol server (`users`, `kick`, `ban`, `revoke`, `broadcast`, `feed`, `read`, `analyze`, dll).
  - **DATA (Subject Database):** Dossier seluruh subjek dengan filter pencarian dan tombol manajemen instan.
  - **TAP (Signal Intercept / Wiretap):** Monitor penyadapan langsung seluruh percakapan yang terjadi di jaringan.
  - **FILE (File Forensic Analyzer):** Analisis forensik file (Shannon entropy, deteksi signature magic byte, MIME mismatch check, ekstraksi string ASCII, dan raw hex disassembly).
  - **AUDIO (Audio Spectrum Analyzer):** Visualisasi gelombang suara (*oscilloscope*) pada canvas untuk voice note taktis.
  - **CRYPT (Decryption Matrix):** Visualisasi pemecah cipher kriptografi matriks heksadesimal.
  - **RADAR (Monitor Telemetry):** Telemetri jaringan real-time dan log audit keamanan sistem.
- **🔒 Keamanan:**
  - Password di-hash menggunakan **bcrypt** (12 rounds).
  - Pesan & file dienkripsi di disk menggunakan **AES-256-GCM**.
  - Sesi login aman dengan cookie JWT `httpOnly` dan proteksi pencabutan instan (*token version bump*).
  - Rate limiting & proteksi header Helmet.
  - Notice resmi agensi pemerintah di layar registrasi:
    `NOTICE: Komunikasi pada terminal ini dapat diawasi oleh administrator sistem.`

---

## 🚀 Cara Menjalankan Secara Lokal

### Prasyarat
- Node.js versi 22.13.0 atau lebih baru (menggunakan modul bawaan `node:sqlite`).

### Langkah-langkah
```bash
# 1. Clone repositori
git clone https://github.com/USERNAME/operator-chat.git
cd operator-chat

# 2. Install dependencies
npm install

# 3. Jalankan server
node server.js
```

Buka browser di:
```text
http://localhost:3000
```

> **Catatan Akun Admin:** Saat server pertama kali berjalan, server akan secara otomatis membuat akun Admin Level S `TANNER` dan mencetak passwordnya di konsol/terminal. Simpan kredensial tersebut untuk login sebagai operator utama.

---

## 🌐 Cara Deploy ke Internet (Agar Bisa Digunakan Publik)

> **PENTING TENTANG GITHUB:**  
> **GitHub Pages** hanya mendukung situs statis (HTML/CSS/JS murni) dan **TIDAK BISA** menjalankan backend server Node.js, WebSocket, maupun database SQLite.  
> Agar website ini tetap bisa diakses dan digunakan online secara gratis oleh teman/publik setelah di-push ke GitHub, gunakan platform cloud gratis berikut:

### Opsi 1: Render.com (Direkomendasikan - Gratis & Otomatis)
1. Push repositori ini ke akun GitHub Anda.
2. Buka [render.com](https://render.com) dan login dengan akun GitHub Anda.
3. Klik **New +** -> **Web Service**.
4. Pilih repositori `operator-chat` Anda di GitHub.
5. Konfigurasi otomatis terdeteksi dari file `render.yaml`:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
6. (Opsional) Di bagian **Environment Variables**, tambahkan:
   - `ADMIN_USERNAME`: `TANNER`
   - `ADMIN_PASSWORD`: *(isi password rahasia Anda sendiri)*
   - `ACCESS_WINDOW_HOURS`: `5`
7. Klik **Deploy Web Service**.
8. Anda akan mendapatkan URL publik gratis (contoh: `https://operator-chat.onrender.com`) yang bisa dibuka langsung oleh siapapun di internet!

---

### Opsi 2: Railway.app
1. Buka [railway.app](https://railway.app) dan login dengan GitHub.
2. Klik **New Project** -> **Deploy from GitHub repo**.
3. Pilih repositori `operator-chat`.
4. Railway akan otomatis mendeteksi Node.js / Dockerfile dan menjalankan server.

---

### Opsi 3: Menggunakan Docker
Jika Anda memiliki VPS atau server sendiri:
```bash
docker build -t operator-chat .
docker run -d -p 3000:3000 --name operator-chat-instance operator-chat
```

---

## 📜 Perintah Terminal Operator (Level S)

| Perintah | Keterangan |
| :--- | :--- |
| `help` | Menampilkan daftar seluruh perintah |
| `stats` | Menampilkan ringkasan statistik sistem & lalu lintas data |
| `users` | Menampilkan seluruh subjek terdaftar beserta status & kodenya |
| `online` | Menampilkan daftar koneksi terminal aktif |
| `whois <user>` | Profil lengkap subjek dan daftar jendela aksesnya |
| `grants [user]` | Memeriksa status & sisa waktu jendela 5 jam |
| `convos` | Menampilkan seluruh pasangan percakapan yang tercatat |
| `read <userA> <userB>` | Membaca transkrip obrolan antara dua subjek |
| `feed [n]` | Menampilkan n transmisi terbaru di seluruh jaringan |
| `search <kata>` | Mencari kata kunci pada semua pesan & file |
| `files` | Menampilkan seluruh file bukti yang tersimpan di vault |
| `analyze <fileId>` | Membuka modul File Forensic Analyzer untuk file tertentu |
| `logs [n]` | Menampilkan log audit keamanan sistem |
| `kick <user>` | Memutus koneksi aktif dan mencabut sesi login |
| `ban <user>` / `unban` | Memblokir subjek dan menutup semua jendela aksesnya |
| `revoke <user>` | Mencabut seluruh jendela komunikasi 5 jam milik subjek |
| `regen <user>` | Membuat ulang kode akses pribadi subjek |
| `broadcast <pesan>` | Mengirimkan transmisi darurat ke seluruh terminal online |
| `clear` | Membersihkan layar terminal |

---

## 🛠️ Konfigurasi Environment Variables

File `.env` dapat dibuat untuk mengatur konfigurasi:
```env
PORT=3000
NODE_ENV=production
ADMIN_USERNAME=TANNER
ADMIN_PASSWORD=your_secure_password_here
ACCESS_WINDOW_HOURS=5
MAX_FILE_MB=15
```

---

## ⚖️ Lisensi
Proyek ini dibuat untuk tujuan edukasi dan simulasi investigasi naratif. Desain dan tema terinspirasi dari game *The Operator* oleh Bureau 81.
