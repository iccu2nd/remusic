/* ========== ReMusic App ========== */
let player = null;
let currentTrack = null;
let queue = [];
let currentIndex = -1;
let syncedLyrics = [];
let isPlaying = false;
let progressTimer = null;
let shuffle = false;
let repeat = false; // false | 'one' | 'all'
let isSheetOpen = false;

// ========== YOUTUBE IFRAME ==========
function onYouTubeIframeAPIReady() {
  player = new YT.Player('ytPlayer', {
    height: '0',
    width: '0',
    playerVars: {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      fs: 0,
      modestbranding: 1,
      rel: 0,
      iv_load_policy: 3,
      playsinline: 1
    },
    events: {
      onReady: () => console.log('ReMusic player ready'),
      onStateChange: onPlayerStateChange,
      onError: (e) => {
        console.warn('YT Error', e.data);
        playNext();
      }
    }
  });
}

function onPlayerStateChange(e) {
  const state = e.data;
  if (state === YT.PlayerState.PLAYING) {
    isPlaying = true;
    updatePlayButtons();
    startProgress();
  } else if (state === YT.PlayerState.PAUSED) {
    isPlaying = false;
    updatePlayButtons();
    stopProgress();
  } else if (state === YT.PlayerState.ENDED) {
    isPlaying = false;
    updatePlayButtons();
    stopProgress();
    if (repeat === 'one') {
      player.seekTo(0);
      player.playVideo();
    } else {
      playNext();
    }
  }
}

function updatePlayButtons() {
  const icon = isPlaying ? '⏸' : '▶';
  document.getElementById('playPauseBtn').textContent = icon;
  document.getElementById('miniPlayBtn').textContent = icon;
}

// ========== DOM ==========
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const searchInput = $('#searchInput');
const suggestionsEl = $('#suggestions');
const recommendedGrid = $('#recommendedGrid');
const searchResults = $('#searchResults');
const lyricsContainer = $('#lyricsContainer');
const queueList = $('#queueList');
const miniPlayer = $('#miniPlayer');
const playerSheet = $('#playerSheet');

// ========== NAVIGATION ==========
$$('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    switchView(view);
  });
});

function switchView(view) {
  $$('.nav-item').forEach(b => b.classList.remove('active'));
  $$('.view').forEach(v => v.classList.remove('active'));
  
  const navBtn = $(`.nav-item[data-view="${view}"]`);
  if (navBtn) navBtn.classList.add('active');
  
  const viewEl = $(`#${view}View`);
  if (viewEl) viewEl.classList.add('active');

  // Close sheet if open
  if (isSheetOpen) closeSheet();
}

// ========== SEARCH ==========
let searchTimeout = null;

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  $('#clearSearch').style.display = q ? 'block' : 'none';

  clearTimeout(searchTimeout);
  if (q.length < 2) {
    suggestionsEl.classList.remove('show');
    return;
  }

  searchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`/api/suggestions?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      const list = data.suggestions || [];
      if (list.length === 0) {
        suggestionsEl.classList.remove('show');
        return;
      }
      suggestionsEl.innerHTML = list.map(s => `
        <div class="suggestion-item" data-q="${escapeHtml(s.title)}">
          <span class="s-title">${escapeHtml(s.title)}</span>
          <span class="s-artist">${escapeHtml(s.artist)}</span>
        </div>
      `).join('');
      suggestionsEl.classList.add('show');

      suggestionsEl.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
          searchInput.value = item.dataset.q;
          suggestionsEl.classList.remove('show');
          doSearch();
        });
      });
    } catch (e) {
      suggestionsEl.classList.remove('show');
    }
  }, 300);
});

$('#clearSearch').addEventListener('click', () => {
  searchInput.value = '';
  $('#clearSearch').style.display = 'none';
  suggestionsEl.classList.remove('show');
  searchInput.focus();
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    suggestionsEl.classList.remove('show');
    doSearch();
  }
});

document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap')) {
    suggestionsEl.classList.remove('show');
  }
});

async function doSearch() {
  const q = searchInput.value.trim();
  if (!q) return;

  switchView('search');
  searchResults.innerHTML = createSkeletons(6);

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    renderGrid(data.results || [], searchResults);
  } catch (err) {
    searchResults.innerHTML = `<div class="empty-state"><div class="emoji">😢</div>Gagal mencari. Coba lagi.</div>`;
  }
}

// ========== RECOMMENDED ==========
async function loadRecommended() {
  recommendedGrid.innerHTML = createSkeletons(6);
  try {
    const res = await fetch('/api/recommended');
    const data = await res.json();
    renderGrid(data.results || [], recommendedGrid);
  } catch (err) {
    recommendedGrid.innerHTML = `<div class="empty-state"><div class="emoji">😢</div>Gagal memuat rekomendasi</div>`;
  }
}

$('#refreshBtn').addEventListener('click', () => {
  loadRecommended();
});

function createSkeletons(n) {
  return Array(n).fill(0).map(() => `
    <div class="card skeleton" style="height:220px"></div>
  `).join('');
}

function renderGrid(items, container) {
  if (!items.length) {
    container.innerHTML = `<div class="empty-state"><div class="emoji">🔍</div>Tidak ada hasil</div>`;
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="card" 
         data-id="${item.id}" 
         data-title="${escapeHtml(item.title)}" 
         data-artist="${escapeHtml(item.artist)}" 
         data-thumb="${item.thumbnail}"
         data-duration="${item.durationSec || 0}">
      <img src="${item.thumbnail}" alt="" loading="lazy" onerror="this.src='https://i.ytimg.com/vi/${item.id}/hqdefault.jpg'" />
      ${item.duration ? `<span class="duration">${item.duration}</span>` : ''}
      <div class="title">${escapeHtml(item.title)}</div>
      <div class="artist">${escapeHtml(item.artist)}</div>
    </div>
  `).join('');

  container.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => {
      playTrack({
        id: card.dataset.id,
        title: card.dataset.title,
        artist: card.dataset.artist,
        thumbnail: card.dataset.thumb,
        durationSec: Number(card.dataset.duration) || 0
      });
    });
  });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// ========== PLAY ==========
function playTrack(track, fromQueue = false) {
  currentTrack = track;

  // Update UI
  updateNowPlaying(track);

  // Load video
  if (player && player.loadVideoById) {
    player.loadVideoById(track.id);
    setTimeout(() => {
      try { player.playVideo(); } catch(e) {}
    }, 300);
  }

  // Lyrics
  loadLyrics(track.title, track.artist, track.durationSec);

  // Related → queue
  if (!fromQueue) {
    loadRelated(track.id);
  }

  // Ambient color
  updateAmbient(track.thumbnail);
}

function updateNowPlaying(track) {
  // Mini
  $('#miniThumb').src = track.thumbnail || '';
  $('#miniTitle').textContent = track.title || '—';
  $('#miniArtist').textContent = track.artist || '—';
  miniPlayer.classList.remove('hidden');

  // Full
  $('#fullThumb').src = track.thumbnail || '';
  $('#fullTitle').textContent = track.title || '—';
  $('#fullArtist').textContent = track.artist || '—';

  // Lyrics header
  $('#lyricsThumb').src = track.thumbnail || '';
  $('#lyricsTitle').textContent = track.title || '—';
  $('#lyricsArtist').textContent = track.artist || '—';
}

async function loadRelated(videoId) {
  try {
    const res = await fetch(`/api/related/${videoId}`);
    const data = await res.json();
    queue = data.results || [];
    // Put current at front conceptually
    currentIndex = -1;
    renderQueue();
  } catch (e) {
    queue = [];
    renderQueue();
  }
}

function renderQueue() {
  $('#queueCount').textContent = queue.length;
  if (!queue.length) {
    queueList.innerHTML = `<div class="empty-state"><div class="emoji">📋</div>Antrian kosong<br><small>Putar lagu untuk mengisi antrian</small></div>`;
    return;
  }

  queueList.innerHTML = queue.map((item, i) => `
    <div class="queue-item ${currentTrack && currentTrack.id === item.id ? 'active' : ''}" data-index="${i}">
      <span class="q-num">${i + 1}</span>
      <img src="${item.thumbnail}" alt="" />
      <div class="q-info">
        <div class="q-title">${escapeHtml(item.title)}</div>
        <div class="q-artist">${escapeHtml(item.artist)}</div>
      </div>
    </div>
  `).join('');

  queueList.querySelectorAll('.queue-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = Number(el.dataset.index);
      currentIndex = idx;
      playTrack(queue[idx], true);
    });
  });
}

// ========== LYRICS ==========
async function loadLyrics(title, artist, durationSec) {
  lyricsContainer.innerHTML = `<div class="lyrics-placeholder">Memuat lirik...</div>`;
  syncedLyrics = [];

  try {
    let url = `/api/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist || '')}`;
    if (durationSec > 10) url += `&duration=${Math.round(durationSec)}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('not found');

    const data = await res.json();

    if (data.instrumental) {
      lyricsContainer.innerHTML = `<div class="lyrics-placeholder">🎵 Instrumen (tanpa lirik)</div>`;
      return;
    }

    if (data.syncedLyrics) {
      syncedLyrics = parseLRC(data.syncedLyrics);
      if (syncedLyrics.length) {
        lyricsContainer.innerHTML = syncedLyrics.map((line, i) =>
          `<div class="lyrics-line" data-i="${i}">${escapeHtml(line.text)}</div>`
        ).join('');
        return;
      }
    }

    if (data.plainLyrics) {
      lyricsContainer.innerHTML = data.plainLyrics
        .split('\n')
        .filter(l => l.trim())
        .map(l => `<div class="lyrics-line">${escapeHtml(l)}</div>`)
        .join('');
      return;
    }

    lyricsContainer.innerHTML = `<div class="lyrics-placeholder">Lirik tidak ditemukan 😔</div>`;
  } catch (err) {
    lyricsContainer.innerHTML = `<div class="lyrics-placeholder">Lirik tidak ditemukan 😔</div>`;
  }
}

function parseLRC(lrc) {
  const lines = [];
  const re = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/g;
  let m;
  while ((m = re.exec(lrc)) !== null) {
    const min = parseInt(m[1], 10);
    const sec = parseInt(m[2], 10);
    const ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
    const time = min * 60 + sec + ms / 1000;
    const text = (m[4] || '').trim();
    if (text) lines.push({ time, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

// ========== PROGRESS + LYRICS SYNC ==========
function startProgress() {
  stopProgress();
  progressTimer = setInterval(() => {
    if (!player || typeof player.getCurrentTime !== 'function') return;
    try {
      const current = player.getCurrentTime() || 0;
      const duration = player.getDuration() || 0;
      if (duration > 0) {
        $('#progressBar').value = Math.floor((current / duration) * 1000);
        $('#currentTime').textContent = formatTime(current);
        $('#duration').textContent = formatTime(duration);
      }
      syncLyrics(current);
    } catch (e) {}
  }, 200);
}

function stopProgress() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

function syncLyrics(currentTime) {
  if (!syncedLyrics.length) return;
  let active = -1;
  for (let i = 0; i < syncedLyrics.length; i++) {
    if (currentTime >= syncedLyrics[i].time) active = i;
    else break;
  }
  const lines = lyricsContainer.querySelectorAll('.lyrics-line');
  lines.forEach((el, i) => {
    const isActive = i === active;
    if (isActive && !el.classList.contains('active')) {
      el.classList.add('active');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (!isActive) {
      el.classList.remove('active');
    }
  });
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ========== CONTROLS ==========
$('#playPauseBtn').addEventListener('click', togglePlay);
$('#miniPlayBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  togglePlay();
});

function togglePlay() {
  if (!player || !currentTrack) return;
  if (isPlaying) player.pauseVideo();
  else player.playVideo();
}

$('#progressBar').addEventListener('input', (e) => {
  if (!player) return;
  const duration = player.getDuration() || 0;
  const t = (e.target.value / 1000) * duration;
  player.seekTo(t, true);
});

$('#nextBtn').addEventListener('click', playNext);
$('#prevBtn').addEventListener('click', () => {
  if (!player) return;
  const t = player.getCurrentTime() || 0;
  if (t > 3) {
    player.seekTo(0);
  } else if (currentIndex > 0) {
    currentIndex--;
    playTrack(queue[currentIndex], true);
  } else {
    player.seekTo(0);
  }
});

function playNext() {
  if (!queue.length) return;
  if (shuffle) {
    currentIndex = Math.floor(Math.random() * queue.length);
  } else {
    currentIndex = (currentIndex + 1) % queue.length;
  }
  playTrack(queue[currentIndex], true);
}

$('#shuffleBtn').addEventListener('click', () => {
  shuffle = !shuffle;
  $('#shuffleBtn').classList.toggle('active', shuffle);
});

$('#repeatBtn').addEventListener('click', () => {
  if (!repeat) {
    repeat = 'all';
    $('#repeatBtn').classList.add('active');
    $('#repeatBtn').textContent = '⟳';
  } else if (repeat === 'all') {
    repeat = 'one';
    $('#repeatBtn').textContent = '①';
  } else {
    repeat = false;
    $('#repeatBtn').classList.remove('active');
    $('#repeatBtn').textContent = '⟳';
  }
});

// ========== PLAYER SHEET ==========
miniPlayer.addEventListener('click', (e) => {
  if (e.target.closest('#miniPlayBtn')) return;
  openSheet();
});

$('.sheet-handle').addEventListener('click', closeSheet);

function openSheet() {
  playerSheet.classList.add('open');
  isSheetOpen = true;
  miniPlayer.classList.add('hidden');
}

function closeSheet() {
  playerSheet.classList.remove('open');
  isSheetOpen = false;
  if (currentTrack) miniPlayer.classList.remove('hidden');
}

// Swipe down to close
let touchStartY = 0;
playerSheet.addEventListener('touchstart', e => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });

playerSheet.addEventListener('touchend', e => {
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (dy > 80) closeSheet();
}, { passive: true });

// Extra buttons
$('#lyricsBtn').addEventListener('click', () => {
  closeSheet();
  switchView('lyrics');
});

$('#queueBtn').addEventListener('click', () => {
  closeSheet();
  switchView('queue');
});

// ========== AMBIENT ==========
function updateAmbient(thumbUrl) {
  const ambient = $('#ambient');
  if (!thumbUrl) return;
  // Simple purple-ish ambient (real color extraction needs canvas CORS)
  ambient.style.background = `
    radial-gradient(circle at 30% 20%, rgba(167, 139, 250, 0.25), transparent 50%),
    radial-gradient(circle at 70% 80%, rgba(139, 92, 246, 0.15), transparent 50%)
  `;
}

// ========== INIT ==========
loadRecommended();

// Hide mini player initially
miniPlayer.classList.add('hidden');
