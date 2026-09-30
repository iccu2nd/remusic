# 🎵 ReMusic

Modern YouTube Music Web Player with **Glassmorphism UI**, **Synced Lyrics**, and **Bottom Navigation**.

## Features

- 🔍 **Search** lagu & artis (real-time suggestions)
- 🏠 **Recommended / Trending** music
- ▶️ **Full player** dengan mini player + expandable sheet
- 📝 **Synced Lyrics** (lirik tersinkron mengikuti suara) dari LRCLIB
- 📋 **Queue / Antrian** otomatis dari related tracks
- 🔀 Shuffle & Repeat
- 📱 **Bottom Navigation** (Home • Cari • Lirik • Antrian)
- ✨ **Glassmorphism UI** modern & responsive
- 🎨 Ambient background

## Tech Stack

- Frontend: Vanilla JS + CSS Glassmorphism
- Backend: Express (Node.js)
- Search: `youtube-sr`
- Lyrics: [LRCLIB](https://lrclib.net) (free, no API key)
- Player: YouTube IFrame API

## Local Development

```bash
npm install
npm start
```

Buka http://localhost:3000

## Deploy ke Vercel

### Cara 1: Via Vercel CLI (Recommended)

```bash
npm i -g vercel
cd remusic
vercel
```

Ikuti prompt, pilih project name **remusic**.

### Cara 2: Via GitHub

1. Buat repo baru di GitHub
2. Push folder ini
3. Import project di [vercel.com](https://vercel.com)
4. Framework Preset: **Other**
5. Deploy!

### Cara 3: Drag & Drop

1. Zip folder `remusic`
2. Buka [vercel.com/new](https://vercel.com/new)
3. Drag zip ke browser

## Struktur

```
remusic/
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── server.js
├── package.json
├── vercel.json
└── README.md
```

## Catatan

- Playback menggunakan YouTube IFrame (resmi & stabil)
- Tidak memerlukan API key Google
- Lyrics gratis dari LRCLIB
- Optimized for mobile (max-width 480px centered)

---

Made with 💜 for music lovers
