let player = null;
let currentTrack = null;
let queue = [];
let currentIndex = -1;
let syncedLyrics = [];
let isPlaying = false;
let progressTimer = null;
let shuffle = false;
let repeat = false;
let isModalOpen = false;

function onYouTubeIframeAPIReady() {
  player = new YT.Player('ytPlayer', {
    height: '0', width: '0',
    playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, iv_load_policy: 3, playsinline: 1 },
    events: {
      onReady: () => {},
      onStateChange: onPlayerStateChange,
      onError: () => playNext()
    }
  });
}

function onPlayerStateChange(e) {
  if (e.data === YT.PlayerState.PLAYING) {
    isPlaying = true; updatePlayBtns(); startProgress();
  } else if (e.data === YT.PlayerState.PAUSED) {
    isPlaying = false; updatePlayBtns(); stopProgress();
  } else if (e.data === YT.PlayerState.ENDED) {
    isPlaying = false; updatePlayBtns(); stopProgress();
    if (repeat === 'one') { player.seekTo(0); player.playVideo(); }
    else playNext();
  }
}

function updatePlayBtns() {
  const icon = isPlaying ? 'fa-pause' : 'fa-play';
  document.querySelector('#playPauseBtn i').className = 'fa-solid ' + icon;
  document.querySelector('#miniPlayBtn i').className = 'fa-solid ' + icon;
}

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// Nav
$$('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

function switchView(view) {
  $$('.nav-item').forEach(b => b.classList.remove('active'));
  $$('.view').forEach(v => v.classList.remove('active'));
  const nb = $(`.nav-item[data-view="${view}"]`);
  if (nb) nb.classList.add('active');
  const ve = $(`#${view}View`);
  if (ve) ve.classList.add('active');
  if (isModalOpen) closeModal();
}

// Search
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
  searchInput.focus();
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
  $('#searchResults').innerHTML = skel(6);
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    renderGrid(data.results || [], $('#searchResults'));
  } catch {
    $('#searchResults').innerHTML = '<div class="empty">Gagal mencari</div>';
  }
}

async function loadRecommended() {
  $('#recommendedGrid').innerHTML = skel(6);
  try {
    const res = await fetch('/api/recommended');
    const data = await res.json();
    renderGrid(data.results || [], $('#recommendedGrid'));
  } catch {
    $('#recommendedGrid').innerHTML = '<div class="empty">Gagal memuat</div>';
  }
}

$('#refreshBtn').addEventListener('click', loadRecommended);

function skel(n) {
  return Array(n).fill('<div class="skeleton"></div>').join('');
}

function renderGrid(items, container) {
  if (!items.length) {
    container.innerHTML = '<div class="empty">Tidak ada hasil</div>';
    return;
  }
  container.innerHTML = items.map(item => `
    <div class="card" data-id="${item.id}" data-title="${esc(item.title)}" data-artist="${esc(item.artist)}" data-thumb="${item.thumbnail}" data-dur="${item.durationSec || 0}">
      <img src="${item.thumbnail}" alt="" loading="lazy" onerror="this.src='https://i.ytimg.com/vi/${item.id}/hqdefault.jpg'" />
      ${item.duration ? `<span class="dur">${item.duration}</span>` : ''}
      <div class="title">${esc(item.title)}</div>
      <div class="artist">${esc(item.artist)}</div>
    </div>
  `).join('');

  container.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => {
      playTrack({
        id: card.dataset.id,
        title: card.dataset.title,
        artist: card.dataset.artist,
        thumbnail: card.dataset.thumb,
        durationSec: Number(card.dataset.dur) || 0
      });
    });
  });
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function playTrack(track, fromQueue) {
  currentTrack = track;
  updateNowPlaying(track);

  if (player && player.loadVideoById) {
    player.loadVideoById(track.id);
    setTimeout(() => { try { player.playVideo(); } catch {} }, 200);
  }

  loadLyrics(track.title, track.artist, track.durationSec);
  if (!fromQueue) loadRelated(track.id);
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
  } catch {
    queue = [];
    renderQueue();
  }
}

function renderQueue() {
  $('#queueCount').textContent = queue.length;
  if (!queue.length) {
    $('#queueList').innerHTML = '<div class="empty">Antrian kosong</div>';
    return;
  }
  $('#queueList').innerHTML = queue.map((item, i) => `
    <div class="queue-item ${currentTrack && currentTrack.id === item.id ? 'active' : ''}" data-i="${i}">
      <span class="q-num">${i + 1}</span>
      <img src="${item.thumbnail}" alt="" />
      <div class="q-info">
        <div class="q-title">${esc(item.title)}</div>
        <div class="q-artist">${esc(item.artist)}</div>
      </div>
    </div>
  `).join('');

  $$('#queueList .queue-item').forEach(el => {
    el.addEventListener('click', () => {
      currentIndex = Number(el.dataset.i);
      playTrack(queue[currentIndex], true);
    });
  });
}

async function loadLyrics(title, artist, dur) {
  $('#lyricsContainer').innerHTML = '<div class="empty">Memuat lirik...</div>';
  syncedLyrics = [];
  try {
    let url = `/api/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist || '')}`;
    if (dur > 10) url += `&duration=${Math.round(dur)}`;
    const res = await fetch(url);
    if (!res.ok) throw 0;
    const data = await res.json();
    if (data.instrumental) {
      $('#lyricsContainer').innerHTML = '<div class="empty">Instrumen (tanpa lirik)</div>';
      return;
    }
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
    const t = parseInt(m[1]) * 60 + parseInt(m[2]) + (m[3] ? parseInt(m[3].padEnd(3, '0')) / 1000 : 0);
    const text = (m[4] || '').trim();
    if (text) lines.push({ time: t, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

function startProgress() {
  stopProgress();
  progressTimer = setInterval(() => {
    if (!player || typeof player.getCurrentTime !== 'function') return;
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
  }, 250);
}

function stopProgress() {
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
}

function syncLyrics(t) {
  if (!syncedLyrics.length) return;
  let active = -1;
  for (let i = 0; i < syncedLyrics.length; i++) {
    if (t >= syncedLyrics[i].time) active = i; else break;
  }
  const lines = $('#lyricsContainer').querySelectorAll('.lyrics-line');
  lines.forEach((el, i) => {
    if (i === active) {
      if (!el.classList.contains('active')) {
        el.classList.add('active');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else el.classList.remove('active');
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
  const dur = player.getDuration() || 0;
  player.seekTo((e.target.value / 1000) * dur, true);
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

// Modal
$('#miniPlayer').addEventListener('click', e => {
  if (e.target.closest('#miniPlayBtn')) return;
  openModal();
});

$('#modalBackdrop').addEventListener('click', closeModal);
$('.modal-handle').addEventListener('click', closeModal);

function openModal() {
  $('#playerModal').classList.add('open');
  isModalOpen = true;
}

function closeModal() {
  $('#playerModal').classList.remove('open');
  isModalOpen = false;
}

let touchY = 0;
$('.modal-sheet').addEventListener('touchstart', e => { touchY = e.touches[0].clientY; }, { passive: true });
$('.modal-sheet').addEventListener('touchend', e => {
  if (e.changedTouches[0].clientY - touchY > 80) closeModal();
}, { passive: true });

$('#lyricsBtn').addEventListener('click', () => { closeModal(); switchView('lyrics'); });
$('#queueBtn').addEventListener('click', () => { closeModal(); switchView('queue'); });

loadRecommended();
