const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

// ========== YouTube Search Scraper ==========
async function ytSearch(query, limit = 20) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html'
    }
  });
  if (!res.ok) throw new Error('YT ' + res.status);
  const html = await res.text();

  let data = null;
  for (const marker of ['var ytInitialData = ', 'ytInitialData = ']) {
    const idx = html.indexOf(marker);
    if (idx === -1) continue;
    const start = idx + marker.length;
    let depth = 0, end = start;
    for (let i = start; i < html.length; i++) {
      if (html[i] === '{') depth++;
      else if (html[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    try { data = JSON.parse(html.slice(start, end)); break; } catch {}
  }

  const results = [];
  const seen = new Set();
  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    const vr = obj.videoRenderer;
    if (vr && vr.videoId && !seen.has(vr.videoId)) {
      seen.add(vr.videoId);
      const title = vr.title?.runs?.[0]?.text || 'Unknown';
      const artist = vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || 'Unknown';
      let thumb = vr.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`;
      if (thumb.startsWith('//')) thumb = 'https:' + thumb;
      const lengthText = vr.lengthText?.simpleText || null;
      let durationSec = 0;
      if (lengthText) {
        const p = lengthText.split(':').map(Number);
        if (p.length === 2) durationSec = p[0] * 60 + p[1];
        else if (p.length === 3) durationSec = p[0] * 3600 + p[1] * 60 + p[2];
      }
      results.push({ id: vr.videoId, title, artist, thumbnail: thumb, duration: lengthText, durationSec });
    }
    for (const k of Object.keys(obj)) walk(obj[k]);
  }
  if (data) walk(data);
  if (!results.length) {
    const ids = [...new Set([...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map(m => m[1]))].slice(0, limit);
    return ids.map(id => ({ id, title: 'Video', artist: 'Unknown', thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, duration: null, durationSec: 0 }));
  }
  return results.slice(0, limit);
}

const FALLBACK = [
  { id: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', artist: 'Rick Astley', thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', duration: '3:33', durationSec: 213 },
  { id: 'kJQP7kiw5Fk', title: 'Despacito', artist: 'Luis Fonsi', thumbnail: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg', duration: '4:42', durationSec: 282 },
  { id: 'JGwWNGJdvx8', title: 'Shape of You', artist: 'Ed Sheeran', thumbnail: 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg', duration: '4:23', durationSec: 263 },
  { id: 'fJ9rUzIMcZQ', title: 'Bohemian Rhapsody', artist: 'Queen', thumbnail: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg', duration: '5:55', durationSec: 355 },
  { id: 'OPf0YbXqDm0', title: 'Uptown Funk', artist: 'Mark Ronson', thumbnail: 'https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg', duration: '4:30', durationSec: 270 },
  { id: '9bZkp7q19f0', title: 'Gangnam Style', artist: 'PSY', thumbnail: 'https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg', duration: '4:13', durationSec: 253 },
  { id: 'YQHsXMglC9A', title: 'Hello', artist: 'Adele', thumbnail: 'https://i.ytimg.com/vi/YQHsXMglC9A/hqdefault.jpg', duration: '6:07', durationSec: 367 },
  { id: '2Vv-BfVoq4g', title: 'Perfect', artist: 'Ed Sheeran', thumbnail: 'https://i.ytimg.com/vi/2Vv-BfVoq4g/hqdefault.jpg', duration: '4:23', durationSec: 263 }
];

app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Query required' });
    let results = [];
    try { results = await ytSearch(q, 24); } catch (e) { console.error(e.message); }
    if (!results.length) {
      const lower = q.toLowerCase();
      results = FALLBACK.filter(s => s.title.toLowerCase().includes(lower) || s.artist.toLowerCase().includes(lower));
      if (!results.length) results = FALLBACK.slice(0, 8);
    }
    res.json({ results });
  } catch { res.json({ results: FALLBACK.slice(0, 8) }); }
});

app.get('/api/recommended', async (req, res) => {
  try {
    let results = [];
    try { results = await ytSearch('trending music songs', 18); } catch {}
    res.json({ results: results.length ? results : FALLBACK });
  } catch { res.json({ results: FALLBACK }); }
});

app.get('/api/related/:videoId', async (req, res) => {
  try {
    let results = [];
    try {
      results = await ytSearch('popular music mix 2025', 16);
      results = results.filter(r => r.id !== req.params.videoId);
    } catch {}
    res.json({ results: results.length ? results : FALLBACK.filter(s => s.id !== req.params.videoId) });
  } catch { res.json({ results: FALLBACK }); }
});

app.get('/api/suggestions', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ suggestions: [] });
    const results = await ytSearch(q, 6);
    res.json({ suggestions: results.map(r => ({ id: r.id, title: r.title, artist: r.artist })) });
  } catch { res.json({ suggestions: [] }); }
});

// ========== LYRICS: LRCLIB + YouTube timed captions ==========
async function fetchYtCaptions(videoId) {
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(watchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Find captionTracks in player response
    const m = html.match(/"captionTracks":(\[.*?\])/);
    if (!m) return null;
    let tracks;
    try { tracks = JSON.parse(m[1]); } catch { return null; }
    if (!Array.isArray(tracks) || !tracks.length) return null;

    // Prefer non-auto, then any
    const track = tracks.find(t => t.kind !== 'asr') || tracks[0];
    if (!track?.baseUrl) return null;

    const capRes = await fetch(track.baseUrl + '&fmt=json3', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!capRes.ok) return null;
    const capData = await capRes.json();
    if (!capData.events) return null;

    const lines = [];
    for (const ev of capData.events) {
      if (!ev.segs || ev.tStartMs == null) continue;
      const text = ev.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ').trim();
      if (!text || text === '\n') continue;
      lines.push({ time: ev.tStartMs / 1000, text });
    }
    if (lines.length < 3) return null;
    return lines;
  } catch (e) {
    console.error('YT captions:', e.message);
    return null;
  }
}

function linesToLRC(lines) {
  return lines.map(l => {
    const m = Math.floor(l.time / 60);
    const s = Math.floor(l.time % 60);
    const ms = Math.floor((l.time % 1) * 100);
    return `[${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(2,'0')}] ${l.text}`;
  }).join('\n');
}

app.get('/api/lyrics', async (req, res) => {
  try {
    const title = (req.query.title || '').trim();
    const artist = (req.query.artist || '').trim();
    const duration = req.query.duration ? Math.round(Number(req.query.duration)) : null;
    const videoId = (req.query.videoId || '').trim();

    if (!title && !videoId) return res.status(400).json({ error: 'title required' });

    const headers = { 'User-Agent': 'ReMusic/2.0' };
    let best = null;

    // 1) LRCLIB exact
    if (title) {
      const params = new URLSearchParams({ track_name: title });
      if (artist) params.append('artist_name', artist);
      if (duration && duration > 10) params.append('duration', duration);
      try {
        const r = await fetch(`https://lrclib.net/api/get?${params}`, { headers });
        if (r.ok) {
          const d = await r.json();
          if (d.syncedLyrics) best = { syncedLyrics: d.syncedLyrics, plainLyrics: d.plainLyrics, source: 'lrclib', trackName: d.trackName || title, artistName: d.artistName || artist };
        }
      } catch {}
    }

    // 2) LRCLIB search best match
    if (!best && title) {
      try {
        const searchQ = artist ? `${title} ${artist}` : title;
        const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(searchQ)}`, { headers });
        if (r.ok) {
          const list = await r.json();
          if (Array.isArray(list) && list.length) {
            let pick = null, score = -1;
            for (const item of list) {
              if (item.instrumental) continue;
              let s = 0;
              if (item.syncedLyrics) s += 100;
              if (item.plainLyrics) s += 10;
              if (duration && item.duration) s += Math.max(0, 50 - Math.abs(item.duration - duration));
              if (s > score) { score = s; pick = item; }
            }
            if (pick && pick.syncedLyrics) {
              best = { syncedLyrics: pick.syncedLyrics, plainLyrics: pick.plainLyrics, source: 'lrclib', trackName: pick.trackName || title, artistName: pick.artistName || artist };
            } else if (pick) {
              best = { syncedLyrics: null, plainLyrics: pick.plainLyrics, source: 'lrclib', trackName: pick.trackName || title, artistName: pick.artistName || artist };
            }
          }
        }
      } catch {}
    }

    // 3) YouTube timed captions (matches THIS video's audio timing)
    if (videoId) {
      const ytLines = await fetchYtCaptions(videoId);
      if (ytLines && ytLines.length >= 3) {
        // Prefer YT captions for timing accuracy with the actual audio
        const lrc = linesToLRC(ytLines);
        return res.json({
          syncedLyrics: lrc,
          plainLyrics: ytLines.map(l => l.text).join('\n'),
          source: 'youtube',
          trackName: title,
          artistName: artist,
          instrumental: false
        });
      }
    }

    if (best) return res.json({ ...best, instrumental: false });
    res.status(404).json({ error: 'Lyrics not found' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('*', (req, res) => {
  const a = path.join(__dirname, 'index.html');
  const b = path.join(__dirname, 'public', 'index.html');
  res.sendFile(fs.existsSync(a) ? a : b);
});

module.exports = app;
if (require.main === module) {
  app.listen(PORT, () => console.log('ReMusic http://localhost:' + PORT));
}
