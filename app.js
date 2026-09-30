let player = null, currentTrack = null, queue = [], currentIndex = -1;
let syncedLyrics = [], isPlaying = false, progressTimer = null, rafId = null;
let shuffle = false, repeat = false, isModalOpen = false;
let lyricsOffset = 0, lastActiveLyric = -1;

function onYouTubeIframeAPIReady() {
  player = new YT.Player('ytPlayer', {
    height: '0', width: '0',
    playerVars: {
      autoplay: 0, controls: 0, disablekb: 1, fs: 0,
      modestbranding: 1, rel: 0, iv_load_policy: 3, playsinline: 1,
      origin: location.origin
    },
    events: {
      onStateChange: onState,
      onError: () => playNext()
    }
  });
}

function onState(e) {
  if (e.data === YT.PlayerState.PLAYING) {
    isPlaying = true; updatePlayBtns(); startProgress(); updateMediaSession();
  } else if (e.data === YT.PlayerState.PAUSED) {
    isPlaying = false; updatePlayBtns(); stopProgress();
  } else if (e.data === YT.PlayerState.ENDED) {
    isPlaying = false; updatePlayBtns(); stopProgress();
    if (repeat === 'one') { player.seekTo(0); player.playVideo(); }
    else playNext();
  }
}

function updatePlayBtns() {
  const ic = isPlaying ? 'fa-pause' : 'fa-play';
  const a = document.querySelector('#playPauseBtn i');
  const b = document.querySelector('#miniPlayBtn i');
  if (a) a.className = 'fa-solid ' + ic;
  if (b) b.className = 'fa-solid ' + ic;
}

// Media Session — lock screen / notification controls + background feel
function updateMediaSession() {
  if (!('mediaSession' in navigator) || !currentTrack) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title || 'ReMusic',
      artist: currentTrack.artist || '',
      album: 'ReMusic',
      artwork: [
        { src: currentTrack.thumbnail || '', sizes: '300x300', type: 'image/jpeg' },
        { src: currentTrack.thumbnail || '', sizes: '512x512', type: 'image/jpeg' }
      ]
    });
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    navigator.mediaSession.setActionHandler('play', () => { if (player) player.playVideo(); });
    navigator.mediaSession.setActionHandler('pause', () => { if (player) player.pauseVideo(); });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      if (player && (player.getCurrentTime() || 0) > 3) player.seekTo(0);
      else if (currentIndex > 0) { currentIndex--; playTrack(queue[currentIndex], true); }
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
    navigator.mediaSession.setActionHandler('seekto', (d) => {
      if (d.seekTime != null && player) player.seekTo(d.seekTime, true);
    });
  } catch {}
}

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

(function () {
  const h = new Date().getHours();
  const g = $('#greeting');
  if (g) g.textContent = h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam';
})();

$$('.nav-item').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));

function switchView(view) {
  $$('.nav-item').forEach(b => b.classList.remove('active'));
  $$('.view').forEach(v => v.classList.remove('active'));
  const nb = $(`.nav-item[data-view="${view}"]`);
  if (nb) nb.classList.add('active');
  const ve = $(`#${view}View`);
  if (ve) ve.classList.add('active');
  if (isModalOpen) closeModal();
}

$$('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    $$('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    loadHome(chip.dataset.q);
  });
});

let searchTO = null;
const searchInput = $('#searchInput');

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  $('#clearSearch').hidden = !q;
  clearTimeout(searchTO);
  if (q.length < 2) { $('#suggestions').classList.remove('show'); return; }
  searchTO = setTimeout(async () => {
    try {
      const res = await fetch(`/api/suggestions?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      const list = data.suggestions || [];
      if (!list.length) { $('#suggestions').classList.remove('show'); return; }
      $('#suggestions').innerHTML = list.map(s =>
        `<div class="suggestion-item" data-q="${esc(s.title)}"><span>${esc(s.title)}</span><small>${esc(s.artist)}</small></div>`
      ).join('');
      $('#suggestions').classList.add('show');
      $$('#suggestions .suggestion-item').forEach(el => {
        el.addEventListener('click', () => {
          searchInput.value = el.dataset.q;
          $('#suggestions').classList.remove('show');
          doSearch();
        });
      });
    } catch { $('#suggestions').classList.remove('show'); }
  }, 280);
});

$('#clearSearch').addEventListener('click', () => {
  searchInput.value = '';
  $('#clearSearch').hidden = true;
  $('#suggestions').classList.remove('show');
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { $('#suggestions').classList.remove('show'); doSearch(); }
});

document.addEventListener('click', e => {
  if (!e.target.closest('.header')) $('#suggestions').classList.remove('show');
});

async function doSearch() {
  const q = searchInput.value.trim();
  if (!q) return;
  switchView('search');
  $('#searchResults').innerHTML = '<div class="empty">Mencari...</div>';
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    renderList(data.results || [], $('#searchResults'));
  } catch {
    $('#searchResults').innerHTML = '<div class="empty">Gagal mencari</div>';
  }
}

async function loadHome(query) {
  const q = query || 'trending music';
  const sk = Array(5).fill('<div class="skel"></div>').join('');
  $('#quickPicks').innerHTML = sk;
  $('#trendingRow').innerHTML = sk;
  $('#popularRow').innerHTML = sk;
  try {
    const [r1, r2, r3] = await Promise.all([
      fetch(`/api/search?q=${encodeURIComponent(q)}`).then(r => r.json()),
      fetch(`/api/search?q=${encodeURIComponent(q + ' hits')}`).then(r => r.json()),
      fetch('/api/recommended').then(r => r.json())
    ]);
    renderHScroll(r1.results || [], $('#quickPicks'));
    renderHScroll(r2.results || [], $('#trendingRow'));
    renderHScroll(r3.results || [], $('#popularRow'));
  } catch {
    ['quickPicks', 'trendingRow', 'popularRow'].forEach(id => {
      $('#' + id).innerHTML = '<div class="empty">Gagal memuat</div>';
    });
  }
}

$('#refreshBtn').addEventListener('click', () => {
  const a = $('.chip.active');
  loadHome(a ? a.dataset.q : 'trending music');
});

function renderHScroll(items, container) {
  if (!items.length) { container.innerHTML = '<div class="empty">Kosong</div>'; return; }
  container.innerHTML = items.slice(0, 12).map(item => `
    <div class="h-card" data-id="${item.id}" data-title="${esc(item.title)}" data-artist="${esc(item.artist)}" data-thumb="${item.thumbnail}" data-dur="${item.durationSec || 0}">
      <img src="${item.thumbnail}" alt="" loading="lazy" onerror="this.src='https://i.ytimg.com/vi/${item.id}/hqdefault.jpg'" />
      <div class="title">${esc(item.title)}</div>
      <div class="artist">${esc(item.artist)}</div>
    </div>
  `).join('');
  container.querySelectorAll('.h-card').forEach(card => {
    card.addEventListener('click', () => playTrack({
      id: card.dataset.id, title: card.dataset.title, artist: card.dataset.artist,
      thumbnail: card.dataset.thumb, durationSec: Number(card.dataset.dur) || 0
    }));
  });
}

function renderList(items, container) {
  if (!items.length) { container.innerHTML = '<div class="empty">Tidak ada hasil</div>'; return; }
  container.innerHTML = items.map((item, i) => `
    <div class="v-item" data-id="${item.id}" data-title="${esc(item.title)}" data-artist="${esc(item.artist)}" data-thumb="${item.thumbnail}" data-dur="${item.durationSec || 0}">
      <span class="num">${i + 1}</span>
      <img src="${item.thumbnail}" alt="" loading="lazy" />
      <div class="info"><div class="title">${esc(item.title)}</div><div class="artist">${esc(item.artist)}</div></div>
    </div>
  `).join('');
  container.querySelectorAll('.v-item').forEach(el => {
    el.addEventListener('click', () => playTrack({
      id: el.dataset.id, title: el.dataset.title, artist: el.dataset.artist,
      thumbnail: el.dataset.thumb, durationSec: Number(el.dataset.dur) || 0
    }));
  });
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function playTrack(track, fromQueue) {
  currentTrack = track;
  lastActiveLyric = -1;
  updateNowPlaying(track);
  if (player && player.loadVideoById) {
    player.loadVideoById(track.id);
    setTimeout(() => { try { player.playVideo(); } catch {} }, 180);
  }
  loadLyrics(track);
  if (!fromQueue) loadRelated(track.id);
  updateMediaSession();
}

function updateNowPlaying(track) {
  $('#miniThumb').src = track.thumbnail || '';
  $('#miniTitle').textContent = track.title || '—';
  $('#miniArtist').textContent = track.artist || '—';
  $('#miniPlayer').hidden = false;
  $('#fullThumb').src = track.thumbnail || '';
  $('#fullTitle').textContent = track.title || '—';
  $('#fullArtist').textContent = track.artist || '—';
  $('#lyricsThumb').src = track.thumbnail || '';
  $('#lyricsTitle').textContent = track.title || '—';
  $('#lyricsArtist').textContent = track.artist || '—';
}

async function loadRelated(videoId) {
  try {
    const res = await fetch(`/api/related/${videoId}`);
    const data = await res.json();
    queue = data.results || [];
    currentIndex = -1;
    renderQueue();
  } catch { queue = []; renderQueue(); }
}

function renderQueue() {
  $('#queueCount').textContent = queue.length;
  if (!queue.length) { $('#queueList').innerHTML = '<div class="empty">Antrian kosong</div>'; return; }
  $('#queueList').innerHTML = queue.map((item, i) => `
    <div class="v-item ${currentTrack && currentTrack.id === item.id ? 'active' : ''}" data-i="${i}">
      <span class="num">${i + 1}</span>
      <img src="${item.thumbnail}" alt="" />
      <div class="info"><div class="title">${esc(item.title)}</div><div class="artist">${esc(item.artist)}</div></div>
    </div>
  `).join('');
  $$('#queueList .v-item').forEach(el => {
    el.addEventListener('click', () => {
      currentIndex = Number(el.dataset.i);
      playTrack(queue[currentIndex], true);
    });
  });
}

async function loadLyrics(track) {
  $('#lyricsContainer').innerHTML = '<div class="empty">Memuat lirik...</div>';
  syncedLyrics = [];
  lastActiveLyric = -1;
  lyricsOffset = -0.12;
  try {
    let url = `/api/lyrics?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist || '')}&videoId=${encodeURIComponent(track.id)}`;
    if (track.durationSec > 10) url += `&duration=${Math.round(track.durationSec)}`;
    const res = await fetch(url);
    if (!res.ok) throw 0;
    const data = await res.json();

    // YouTube captions are timed to THIS video — prefer zero offset
    if (data.source === 'youtube') lyricsOffset = 0;
    else lyricsOffset = -0.12;

    if (data.syncedLyrics) {
      syncedLyrics = parseLRC(data.syncedLyrics);
      if (syncedLyrics.length) {
        $('#lyricsContainer').innerHTML = syncedLyrics.map((l, i) =>
          `<div class="lyrics-line" data-i="${i}">${esc(l.text)}</div>`
        ).join('');
        return;
      }
    }
    if (data.plainLyrics) {
      $('#lyricsContainer').innerHTML = data.plainLyrics.split('\n').filter(l => l.trim())
        .map(l => `<div class="lyrics-line">${esc(l)}</div>`).join('');
      return;
    }
    $('#lyricsContainer').innerHTML = '<div class="empty">Lirik tidak ditemukan</div>';
  } catch {
    $('#lyricsContainer').innerHTML = '<div class="empty">Lirik tidak ditemukan</div>';
  }
}

function parseLRC(lrc) {
  const lines = [];
  const re = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/g;
  let m;
  while ((m = re.exec(lrc)) !== null) {
    const ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) / 1000 : 0;
    const t = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + ms;
    const text = (m[4] || '').trim();
    if (text) lines.push({ time: t, text });
  }
  lines.sort((a, b) => a.time - b.time);
  const out = [];
  for (const line of lines) {
    if (out.length && Math.abs(out[out.length - 1].time - line.time) < 0.04) {
      out[out.length - 1].text += ' ' + line.text;
    } else out.push(line);
  }
  return out;
}

function startProgress() {
  stopProgress();
  const tick = () => {
    if (!player || typeof player.getCurrentTime !== 'function') {
      if (isPlaying) rafId = requestAnimationFrame(tick);
      return;
    }
    try {
      const cur = player.getCurrentTime() || 0;
      const dur = player.getDuration() || 0;
      if (dur > 0) {
        $('#progressBar').value = Math.floor((cur / dur) * 1000);
        $('#currentTime').textContent = fmt(cur);
        $('#duration').textContent = fmt(dur);
        if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
          try {
            navigator.mediaSession.setPositionState({ duration: dur, position: Math.min(cur, dur), playbackRate: 1 });
          } catch {}
        }
      }
      syncLyrics(cur);
    } catch {}
    if (isPlaying) rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
  progressTimer = setInterval(() => {
    if (!isPlaying || !player) return;
    try {
      const cur = player.getCurrentTime() || 0;
      const dur = player.getDuration() || 0;
      if (dur > 0) {
        $('#progressBar').value = Math.floor((cur / dur) * 1000);
        $('#currentTime').textContent = fmt(cur);
        $('#duration').textContent = fmt(dur);
      }
      syncLyrics(cur);
    } catch {}
  }, 100);
}

function stopProgress() {
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}

function syncLyrics(t) {
  if (!syncedLyrics.length) return;
  const time = t + lyricsOffset;
  let lo = 0, hi = syncedLyrics.length - 1, active = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (syncedLyrics[mid].time <= time) { active = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  // Switch slightly early toward next line for vocal onset
  if (active >= 0 && active < syncedLyrics.length - 1) {
    const gap = syncedLyrics[active + 1].time - time;
    if (gap > 0 && gap < 0.1) active = active + 1;
  }
  if (active === lastActiveLyric) return;
  lastActiveLyric = active;

  const lines = $('#lyricsContainer').querySelectorAll('.lyrics-line');
  lines.forEach((el, i) => {
    el.classList.toggle('active', i === active);
    el.classList.toggle('passed', i < active);
    if (i === active) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function fmt(s) {
  if (!s || isNaN(s)) return '0:00';
  return Math.floor(s / 60) + ':' + Math.floor(s % 60).toString().padStart(2, '0');
}

function togglePlay() {
  if (!player || !currentTrack) return;
  if (isPlaying) player.pauseVideo(); else player.playVideo();
}

$('#playPauseBtn').addEventListener('click', togglePlay);
$('#miniPlayBtn').addEventListener('click', e => { e.stopPropagation(); togglePlay(); });
$('#progressBar').addEventListener('input', e => {
  if (!player) return;
  const t = ((e.target.value / 1000) * (player.getDuration() || 0));
  player.seekTo(t, true);
  lastActiveLyric = -1;
  syncLyrics(t);
});
$('#nextBtn').addEventListener('click', playNext);
$('#prevBtn').addEventListener('click', () => {
  if (!player) return;
  if ((player.getCurrentTime() || 0) > 3) player.seekTo(0);
  else if (currentIndex > 0) { currentIndex--; playTrack(queue[currentIndex], true); }
  else player.seekTo(0);
});

function playNext() {
  if (!queue.length) return;
  currentIndex = shuffle ? Math.floor(Math.random() * queue.length) : (currentIndex + 1) % queue.length;
  playTrack(queue[currentIndex], true);
}

$('#shuffleBtn').addEventListener('click', () => {
  shuffle = !shuffle;
  $('#shuffleBtn').classList.toggle('active', shuffle);
});
$('#repeatBtn').addEventListener('click', () => {
  if (!repeat) { repeat = 'all'; $('#repeatBtn').classList.add('active'); }
  else if (repeat === 'all') { repeat = 'one'; }
  else { repeat = false; $('#repeatBtn').classList.remove('active'); }
});

$('#miniPlayer').addEventListener('click', e => {
  if (e.target.closest('#miniPlayBtn')) return;
  openModal();
});
$('#modalBackdrop').addEventListener('click', closeModal);
$('.modal-handle').addEventListener('click', closeModal);
function openModal() { $('#playerModal').classList.add('open'); isModalOpen = true; }
function closeModal() { $('#playerModal').classList.remove('open'); isModalOpen = false; }

let touchY = 0;
$('.modal-sheet').addEventListener('touchstart', e => { touchY = e.touches[0].clientY; }, { passive: true });
$('.modal-sheet').addEventListener('touchend', e => {
  if (e.changedTouches[0].clientY - touchY > 80) closeModal();
}, { passive: true });

$('#lyricsBtn').addEventListener('click', () => { closeModal(); switchView('lyrics'); });
$('#queueBtn').addEventListener('click', () => { closeModal(); switchView('queue'); });

// Keep playing when page is hidden (background tab)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && isPlaying && player) {
    try { player.playVideo(); } catch {}
  }
});

loadHome('trending music');

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
