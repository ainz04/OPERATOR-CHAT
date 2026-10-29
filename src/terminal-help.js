'use strict';
module.exports = `
 FDI OPERATOR TERMINAL :: LEVEL S COMMANDS
 -----------------------------------------
 help                     daftar perintah
 stats                    statistik sistem
 users                    semua subjek di database
 online                   koneksi aktif
 whois <user>             profil lengkap subjek
 grants [user]            jendela akses 5 jam (aktif/expired)
 convos                   semua percakapan yang tercatat
 read <userA> <userB> [n] baca percakapan antara dua subjek
 feed [n]                 n pesan terakhir di seluruh jaringan
 search <kata>            cari kata di semua pesan & nama file
 files                    semua file yang pernah dikirim
 analyze <fileId>         buka FILE ANALYZER untuk file
 logs [n]                 audit log
 kick <user>              putuskan semua koneksi + cabut sesi login
 ban <user> / unban <user>
 revoke <user>            tutup semua jendela akses 5 jam
 regen <user>             ganti access code subjek
 purge <user> --confirm   hapus subjek + seluruh datanya
 broadcast <pesan>        kirim pengumuman ke semua terminal
 clear                    bersihkan layar
`;
