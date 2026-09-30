const express = require('express');
const cors = require('cors');
const path = require('path');
const YouTube = require('youtube-sr').default;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========== SEARCH ==========
app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Query required' });

    const results = await YouTube.search(q, { 
      limit: 24, 
      type: 'video',
      safeSearch: false
    });

    const mapped = results.map(v => ({
      id: v.id,
      title: v.title || 'Unknown',
      artist: v.channel?.name || 'Unknown Artist',
      thumbnail: v.thumbnail?.displayThumbnailURL('maxresdefault') 
        || v.thumbnail?.url 
        || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      duration: v.durationFormatted || null,
      durationSec: v.duration || 0,
      views: v.views || 0
    }));

    res.json({ results: mapped });
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

// ========== RECOMMENDED / TRENDING ==========
app.get('/api/recommended', async (req, res) => {
  try {
    const queries = [
      'trending music 2025',
      'viral songs',
      'best music playlist'
    ];
    const q = queries[Math.floor(Math.random() * queries.length)];
    
    const results = await YouTube.search(q, { 
      limit: 18, 
      type: 'video' 
    });

    const mapped = results.map(v => ({
      id: v.id,
      title: v.title || 'Unknown',
      artist: v.channel?.name || 'Unknown Artist',
      thumbnail: v.thumbnail?.displayThumbnailURL('maxresdefault') 
        || v.thumbnail?.url 
        || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      duration: v.durationFormatted || null,
      durationSec: v.duration || 0
    }));

    res.json({ results: mapped });
  } catch (err) {
    console.error('Recommended error:', err.message);
    res.status(500).json({ error: 'Failed to load recommendations' });
  }
});

// ========== RELATED / UP NEXT ==========
app.get('/api/related/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    let results = [];

    try {
      const video = await YouTube.getVideo(videoId);
      if (video && video.title) {
        const related = await YouTube.search(video.title + ' ' + (video.channel?.name || ''), {
          limit: 16,
          type: 'video'
        });
        results = related
          .filter(v => v.id !== videoId)
          .map(v => ({
            id: v.id,
            title: v.title || 'Unknown',
            artist: v.channel?.name || 'Unknown Artist',
            thumbnail: v.thumbnail?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
            duration: v.durationFormatted || null
          }));
      }
    } catch (e) {
      // fallback
    }

    if (results.length === 0) {
      const fallback = await YouTube.search('music mix', { limit: 12, type: 'video' });
      results = fallback.map(v => ({
        id: v.id,
        title: v.title,
        artist: v.channel?.name || 'Unknown',
        thumbnail: v.thumbnail?.url,
        duration: v.durationFormatted
      }));
    }

    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== LYRICS (Synced from LRCLIB) ==========
app.get('/api/lyrics', async (req, res) => {
  try {
    const title = (req.query.title || '').trim();
    const artist = (req.query.artist || '').trim();
    const duration = req.query.duration ? Math.round(Number(req.query.duration)) : null;

    if (!title) return res.status(400).json({ error: 'title required' });

    // 1. Try exact match
    const params = new URLSearchParams({ track_name: title });
    if (artist) params.append('artist_name', artist);
    if (duration && duration > 10) params.append('duration', duration);

    let response = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: { 'User-Agent': 'ReMusic/1.0 (https://remusic.vercel.app)' }
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

    // 2. Fallback to search
    const searchQ = artist ? `${title} ${artist}` : title;
    const searchRes = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(searchQ)}`,
      { headers: { 'User-Agent': 'ReMusic/1.0' } }
    );

    if (searchRes.ok) {
      const list = await searchRes.json();
      if (Array.isArray(list) && list.length > 0) {
        const best = list[0];
        return res.json({
          plainLyrics: best.plainLyrics || null,
          syncedLyrics: best.syncedLyrics || null,
          trackName: best.trackName || best.name || title,
          artistName: best.artistName || artist,
          instrumental: best.instrumental || false
        });
      }
    }

    res.status(404).json({ error: 'Lyrics not found' });
  } catch (err) {
    console.error('Lyrics error:', err.message);
    res.status(500).json({ error: 'Failed to fetch lyrics', message: err.message });
  }
});

// ========== SUGGESTIONS ==========
app.get('/api/suggestions', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.json({ suggestions: [] });

    const results = await YouTube.search(q, { limit: 8, type: 'video' });
    const suggestions = results.map(v => ({
      id: v.id,
      title: v.title,
      artist: v.channel?.name || ''
    }));
    res.json({ suggestions });
  } catch (err) {
    res.json({ suggestions: [] });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// For Vercel
module.exports = app;

// Local
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🎵 ReMusic running at http://localhost:${PORT}`);
  });
}
