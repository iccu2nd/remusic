const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// Serve static from root (Vercel) and public (local)
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

// ========== HELPER: Scrape YouTube Search ==========
async function ytSearch(query, limit = 20) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`; // filter: videos

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml'
    }
  });

  if (!res.ok) throw new Error(`YouTube returned ${res.status}`);

  const html = await res.text();

  // Extract ytInitialData
  let data = null;
  const markers = [
    'var ytInitialData = ',
    'window["ytInitialData"] = ',
    'ytInitialData = '
  ];

  for (const marker of markers) {
    const idx = html.indexOf(marker);
    if (idx !== -1) {
      const start = idx + marker.length;
      // Find matching end
      let depth = 0;
      let end = start;
      for (let i = start; i < html.length; i++) {
        if (html[i] === '{') depth++;
        else if (html[i] === '}') {
          depth--;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
      }
      try {
        data = JSON.parse(html.slice(start, end));
        break;
      } catch (e) {}
    }
  }

  if (!data) {
    // Fallback regex for videoIds
    const ids = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map(m => m[1]);
    const unique = [...new Set(ids)].slice(0, limit);
    return unique.map(id => ({
      id,
      title: 'YouTube Video',
      artist: 'Unknown',
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      duration: null,
      durationSec: 0
    }));
  }

  const results = [];
  const seen = new Set();

  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach(walk);
      return;
    }

    // Video renderer
    const vr = obj.videoRenderer || obj.playlistVideoRenderer;
    if (vr && vr.videoId && !seen.has(vr.videoId)) {
      seen.add(vr.videoId);
      const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || 'Unknown';
      const artist = vr.ownerText?.runs?.[0]?.text 
        || vr.shortBylineText?.runs?.[0]?.text 
        || 'Unknown Artist';
      const thumb = vr.thumbnail?.thumbnails?.slice(-1)?.[0]?.url 
        || `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`;
      const lengthText = vr.lengthText?.simpleText || null;
      let durationSec = 0;
      if (lengthText) {
        const parts = lengthText.split(':').map(Number);
        if (parts.length === 2) durationSec = parts[0] * 60 + parts[1];
        else if (parts.length === 3) durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
      }

      results.push({
        id: vr.videoId,
        title,
        artist,
        thumbnail: thumb.startsWith('//') ? 'https:' + thumb : thumb,
        duration: lengthText,
        durationSec
      });
    }

    for (const key of Object.keys(obj)) {
      walk(obj[key]);
    }
  }

  walk(data);
  return results.slice(0, limit);
}

// ========== FALLBACK POPULAR SONGS ==========
const FALLBACK = [
  { id: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', artist: 'Rick Astley', thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', duration: '3:33', durationSec: 213 },
  { id: 'kJQP7kiw5Fk', title: 'Despacito', artist: 'Luis Fonsi', thumbnail: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg', duration: '4:42', durationSec: 282 },
  { id: '9bZkp7q19f0', title: 'Gangnam Style', artist: 'PSY', thumbnail: 'https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg', duration: '4:13', durationSec: 253 },
  { id: 'OPf0YbXqDm0', title: 'Uptown Funk', artist: 'Mark Ronson ft. Bruno Mars', thumbnail: 'https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg', duration: '4:30', durationSec: 270 },
  { id: 'fJ9rUzIMcZQ', title: 'Bohemian Rhapsody', artist: 'Queen', thumbnail: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg', duration: '5:55', durationSec: 355 },
  { id: 'hT_nvWreIhg', title: 'Counting Stars', artist: 'OneRepublic', thumbnail: 'https://i.ytimg.com/vi/hT_nvWreIhg/hqdefault.jpg', duration: '4:17', durationSec: 257 },
  { id: 'JGwWNGJdvx8', title: 'Shape of You', artist: 'Ed Sheeran', thumbnail: 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg', duration: '4:23', durationSec: 263 },
  { id: 'RgKAFK5djSk', title: 'See You Again', artist: 'Wiz Khalifa ft. Charlie Puth', thumbnail: 'https://i.ytimg.com/vi/RgKAFK5djSk/hqdefault.jpg', duration: '3:57', durationSec: 237 },
  { id: 'YQHsXMglC9A', title: 'Hello', artist: 'Adele', thumbnail: 'https://i.ytimg.com/vi/YQHsXMglC9A/hqdefault.jpg', duration: '6:07', durationSec: 367 },
  { id: '2Vv-BfVoq4g', title: 'Perfect', artist: 'Ed Sheeran', thumbnail: 'https://i.ytimg.com/vi/2Vv-BfVoq4g/hqdefault.jpg', duration: '4:23', durationSec: 263 },
  { id: 'lp-EO5I60KA', title: 'Thinking Out Loud', artist: 'Ed Sheeran', thumbnail: 'https://i.ytimg.com/vi/lp-EO5I60KA/hqdefault.jpg', duration: '4:41', durationSec: 281 },
  { id: 'CevxZvSJLk8', title: 'Roar', artist: 'Katy Perry', thumbnail: 'https://i.ytimg.com/vi/CevxZvSJLk8/hqdefault.jpg', duration: '4:30', durationSec: 270 }
];

// ========== ROUTES ==========
app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Query required' });

    let results = [];
    try {
      results = await ytSearch(q, 24);
    } catch (e) {
      console.error('Search scrape failed:', e.message);
    }

    if (!results.length) {
      // Filter fallback by query
      const lower = q.toLowerCase();
      results = FALLBACK.filter(s => 
        s.title.toLowerCase().includes(lower) || 
        s.artist.toLowerCase().includes(lower)
      );
      if (!results.length) results = FALLBACK.slice(0, 8);
    }

    res.json({ results });
  } catch (err) {
    console.error(err);
    res.json({ results: FALLBACK.slice(0, 8) });
  }
});

app.get('/api/recommended', async (req, res) => {
  try {
    let results = [];
    try {
      results = await ytSearch('trending music songs 2025', 18);
    } catch (e) {
      console.error('Recommended failed:', e.message);
    }
    if (!results.length) results = FALLBACK;
    res.json({ results });
  } catch (err) {
    res.json({ results: FALLBACK });
  }
});

app.get('/api/related/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    let results = [];
    try {
      // Search by a generic related query
      results = await ytSearch('music mix popular songs', 16);
      results = results.filter(r => r.id !== videoId);
    } catch (e) {}
    if (!results.length) {
      results = FALLBACK.filter(s => s.id !== videoId);
    }
    res.json({ results });
  } catch (err) {
    res.json({ results: FALLBACK });
  }
});

app.get('/api/lyrics', async (req, res) => {
  try {
    const title = (req.query.title || '').trim();
    const artist = (req.query.artist || '').trim();
    const duration = req.query.duration ? Math.round(Number(req.query.duration)) : null;

    if (!title) return res.status(400).json({ error: 'title required' });

    const params = new URLSearchParams({ track_name: title });
    if (artist) params.append('artist_name', artist);
    if (duration && duration > 10) params.append('duration', duration);

    let response = await fetch(`https://lrclib.net/api/get?${params}`, {
      headers: { 'User-Agent': 'ReMusic/1.1' }
    });

    if (response.ok) {
      const data = await response.json();
      return res.json({
        plainLyrics: data.plainLyrics || null,
        syncedLyrics: data.syncedLyrics || null,
        trackName: data.trackName || data.name || title,
        artistName: data.artistName || artist,
        instrumental: data.instrumental || false
      });
    }

    // Search fallback
    const searchQ = artist ? `${title} ${artist}` : title;
    const searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(searchQ)}`, {
      headers: { 'User-Agent': 'ReMusic/1.1' }
    });

    if (searchRes.ok) {
      const list = await searchRes.json();
      if (Array.isArray(list) && list[0]) {
        const best = list[0];
        return res.json({
          plainLyrics: best.plainLyrics || null,
          syncedLyrics: best.syncedLyrics || null,
          trackName: best.trackName || title,
          artistName: best.artistName || artist,
          instrumental: best.instrumental || false
        });
      }
    }

    res.status(404).json({ error: 'Lyrics not found' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch lyrics' });
  }
});

app.get('/api/suggestions', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ suggestions: [] });

    const results = await ytSearch(q, 6);
    res.json({
      suggestions: results.map(r => ({
        id: r.id,
        title: r.title,
        artist: r.artist
      }))
    });
  } catch (err) {
    res.json({ suggestions: [] });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  const publicIndex = path.join(__dirname, 'public', 'index.html');
  res.sendFile(require('fs').existsSync(indexPath) ? indexPath : publicIndex);
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🎵 ReMusic running at http://localhost:${PORT}`);
  });
}
