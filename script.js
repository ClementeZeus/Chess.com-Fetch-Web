// set your chess.com username here
const USERNAME = 'llshelly_scottll';

// icon paths per stat type, no emojis
const ICONS = {
  chess_daily: '<path d="M7 3v2M17 3v2M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  chess_rapid: '<path d="M12 4a8 8 0 100 16 8 8 0 000-16z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 8v4l3 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  chess_blitz: '<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor"/>',
  chess_bullet: '<path d="M4 12h12l4 0-4-4v8l4-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  tactics: '<path d="M9 3a2 2 0 014 0 2 2 0 002 2h1a2 2 0 012 2v1a2 2 0 002 2v4a2 2 0 01-2 2h-1a2 2 0 00-2 2 2 2 0 01-4 0 2 2 0 00-2-2H9a2 2 0 01-2-2v-1a2 2 0 00-2 2 2 2 0 002-2V7a2 2 0 012-2h1a2 2 0 002-2z" stroke="currentColor" stroke-width="1.3" fill="none"/>',
  puzzle_rush: '<path d="M12 3a9 9 0 100 18 9 9 0 000-18z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 8a4 4 0 100 8 4 4 0 000-8z" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>'
};

const RESULT_ICONS = {
  win: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 12l2.5 2.5L16 9" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  loss: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  draw: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 11h8M8 13h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
};

const LABELS = {
  chess_daily: 'Daily',
  chess_rapid: 'Rapid',
  chess_blitz: 'Blitz',
  chess_bullet: 'Bullet',
  tactics: 'Tactics',
  puzzle_rush: 'Puzzle Rush'
};

const REASON_LABELS = {
  win: 'Win',
  checkmated: 'Checkmate',
  resigned: 'Resignation',
  timeout: 'Timeout',
  abandoned: 'Abandoned',
  agreed: 'Draw agreed',
  repetition: 'Repetition',
  stalemate: 'Stalemate',
  insufficient: 'Insufficient material',
  '50move': '50-move rule',
  timevsinsufficient: 'Timeout vs insufficient'
};

const DRAW_RESULTS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

const errorBox = document.getElementById('error');
const profileBox = document.getElementById('profile');
const avatarImg = document.getElementById('avatar');
const displayNameEl = document.getElementById('display-name');
const handleEl = document.getElementById('handle');
const joinedEl = document.getElementById('joined');
const peakRatingEl = document.getElementById('peak-rating');
const totalGamesEl = document.getElementById('total-games');
const challengeLink = document.getElementById('challenge-link');
const statsBox = document.getElementById('stats');
const cardTemplate = document.getElementById('stat-card');
const performanceBox = document.getElementById('performance');
const whiteBar = document.getElementById('white-bar');
const whitePctEl = document.getElementById('white-pct');
const blackBar = document.getElementById('black-bar');
const blackPctEl = document.getElementById('black-pct');
const streakEl = document.getElementById('streak');
const avgMovesEl = document.getElementById('avg-moves');
const opponentsBox = document.getElementById('opponents');
const opponentRowTemplate = document.getElementById('opponent-row');
const openingsBox = document.getElementById('openings');
const openingRowTemplate = document.getElementById('opening-row');
const gamesBox = document.getElementById('games');
const gameRowTemplate = document.getElementById('game-row');

let board = null;
let gameStack = [];
let moveNotationList = [];
let currentMoveIndex = 0;
let autoPlayInterval = null;
let activeAnalysis = null;
let evalSeries = [];

// quick, partial-depth estimates behind the "xx% acc" badges in the games list
const listAccuracyCache = new Map();
// full-game, fixed-depth analysis (evals + accuracy) behind the review modal
const fullAnalysisCache = new Map();

const LIST_ACCURACY_DEPTH = 10;
const LIST_ACCURACY_PLY_CAP = 24;
const MODAL_ANALYSIS_DEPTH = 18;

// Point this at your deployed analysis backend (see chess-analysis-backend/)
// to get real Stockfish at this depth in seconds instead of the in-browser
// JS engine taking minutes. Leave it '' to always use the in-browser engine.
const ANALYSIS_API_BASE = '';
const EVAL_GRAPH_WIDTH = 300;
const EVAL_GRAPH_HEIGHT = 70;

// Same constant Lichess uses to turn a centipawn score into a win probability.
const WIN_PCT_K = 0.00368208;

// Centipawns (white's perspective) -> white's win probability, 0-100.
// Going from +5.00 to +4.00 barely moves this number (still ~100% either
// way); going from +0.50 to -0.50 swings it hard, same as a real game.
function cpToWhiteWinPercent(cp) {
  return 100 / (1 + Math.exp(-WIN_PCT_K * cp));
}

// How much win% a player gave up on one move -> a 0-100 accuracy score.
// Exponential decay: small slips barely dent the score, a real blunder
// craters it. Matches the curve chess.com's own accuracy score follows.
function accuracyFromWinPercentLoss(loss) {
  const acc = 103.1668 * Math.exp(-0.04354 * loss) - 3.1669;
  return Math.max(0, Math.min(100, acc));
}

function formatEval(cp) {
  if (Math.abs(cp) >= 9000) {
    const mateIn = Math.max(1, Math.round((10000 - Math.abs(cp)) / 100));
    return (cp > 0 ? 'M' : '-M') + mateIn;
  }
  const pawns = cp / 100;
  return (pawns >= 0 ? '+' : '') + pawns.toFixed(1);
}

function createEngineWorker() {
  const workerCode = `
    importScripts('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');
    var engine = typeof Stockfish === 'function' ? Stockfish() : null;
    if (engine) {
      engine.onmessage = function(event) { postMessage(event.data || event); };
      onmessage = function(e) { engine.postMessage(e.data); };
    }
  `;
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  return new Worker(URL.createObjectURL(blob));
}

// Runs a FIXED-DEPTH search on every fen in order. Each position waits for
// its own "bestmove" before the next one is sent, so the score banked for
// a position is always the engine's final depth-N verdict — never a
// shallow mid-search guess grabbed off an early iterative-deepening line.
function runEngineAnalysis(fens, depth, { onProgress, onComplete, perMoveTimeoutMs = 25000 } = {}) {
  if (!window.Worker) {
    onComplete(fens.map(() => 0));
    return { cancel() {} };
  }

  const worker = createEngineWorker();
  const evals = [];
  let idx = 0;
  let lastScore = 0;
  let cancelled = false;
  let watchdog = null;

  function parseScore(line) {
    let cp = 0;
    const cpMatch = line.match(/score cp (-?\d+)/);
    const mateMatch = line.match(/score mate (-?\d+)/);
    if (cpMatch) cp = parseInt(cpMatch[1], 10);
    else if (mateMatch) {
      const m = parseInt(mateMatch[1], 10);
      cp = m > 0 ? 10000 - m * 100 : -10000 - m * 100;
    }
    // UCI scores are relative to the side to move; normalize to white's view.
    if (fens[idx] && fens[idx].includes(' b ')) cp = -cp;
    return cp;
  }

  function advance() {
    evals.push(lastScore);
    idx++;
    if (onProgress) onProgress(idx, fens.length, evals[idx - 1]);
    if (idx < fens.length) searchNext();
    else finish();
  }

  function searchNext() {
    if (cancelled) return;
    clearTimeout(watchdog);
    // Safety valve: a single ugly tactical position shouldn't stall the
    // whole game review. Bank the best score seen so far and move on.
    watchdog = setTimeout(advance, perMoveTimeoutMs);
    worker.postMessage('position fen ' + fens[idx]);
    worker.postMessage('go depth ' + depth);
  }

  function finish() {
    clearTimeout(watchdog);
    if (!cancelled && onComplete) onComplete(evals);
    worker.terminate();
  }

  worker.onmessage = function (e) {
    if (cancelled) return;
    const line = typeof e.data === 'string' ? e.data : '';
    if (line.includes('score cp') || line.includes('score mate')) {
      lastScore = parseScore(line);
    } else if (line.indexOf('bestmove') === 0) {
      clearTimeout(watchdog);
      advance();
    }
  };

  worker.onerror = function () {
    clearTimeout(watchdog);
    if (!cancelled && onComplete) onComplete(evals.length ? evals : fens.map(() => 0));
    worker.terminate();
  };

  worker.postMessage('uci');
  searchNext();

  return {
    cancel() {
      cancelled = true;
      clearTimeout(watchdog);
      worker.terminate();
    }
  };
}

// Tries the real-Stockfish backend first (fast, true fixed-depth 18-20);
// falls back to the in-browser engine if the backend isn't configured,
// unreachable, or errors out mid-job — the app keeps working either way.
function analyzeGame(fens, depth, callbacks) {
  if (!ANALYSIS_API_BASE) {
    return runEngineAnalysis(fens, depth, callbacks);
  }
  return runRemoteAnalysis(fens, depth, callbacks);
}

function runRemoteAnalysis(fens, depth, { onProgress, onComplete } = {}) {
  let cancelled = false;
  let jobId = null;
  let pollTimer = null;
  let fellBack = false;

  function fallBackToLocal() {
    if (cancelled || fellBack) return;
    fellBack = true;
    clearTimeout(pollTimer);
    const local = runEngineAnalysis(fens, depth, { onProgress, onComplete });
    handle.cancel = local.cancel;
  }

  function poll() {
    if (cancelled || fellBack) return;
    fetch(`${ANALYSIS_API_BASE}/analyze/${jobId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || fellBack) return;
        if (data.status === 'running') {
          if (onProgress && data.done > 0) onProgress(data.done, data.total, data.evals[data.evals.length - 1]);
          pollTimer = setTimeout(poll, 700);
        } else if (data.status === 'complete') {
          if (onComplete) onComplete(data.evals);
        } else {
          fallBackToLocal();
        }
      })
      .catch(fallBackToLocal);
  }

  const handle = {
    cancel() {
      cancelled = true;
      clearTimeout(pollTimer);
      if (jobId) {
        fetch(`${ANALYSIS_API_BASE}/analyze/${jobId}`, { method: 'DELETE' }).catch(() => {});
      }
    }
  };

  fetch(`${ANALYSIS_API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fens, depth })
  })
    .then((r) => r.json())
    .then((data) => {
      if (cancelled) return;
      jobId = data.job_id;
      poll();
    })
    .catch(fallBackToLocal);

  return handle;
}

init();

async function init() {
  const username = USERNAME.toLowerCase();
  try {
    const [profile, stats, games] = await Promise.all([
      fetchJson(`https://api.chess.com/pub/player/${username}`),
      fetchJson(`https://api.chess.com/pub/player/${username}/stats`),
      fetchRecentGames(username).catch(() => [])
    ]);

    renderProfile(profile, stats);
    renderStats(stats, games, username);

    if (games.length) {
      renderPerformance(games, username);
      renderOpponents(games, username);
      renderOpenings(games, username);
      renderGames(games, username);
    }
  } catch (err) {
    showError(err.message);
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (res.status === 404) throw new Error('No player found with that username.');
  if (!res.ok) throw new Error('Chess.com API request failed.');
  return res.json();
}

async function fetchRecentGames(username) {
  const archives = await fetchJson(`https://api.chess.com/pub/player/${username}/games/archives`);
  const urls = (archives.archives || []).slice(-2);
  const months = await Promise.all(urls.map((u) => fetchJson(u).catch(() => ({ games: [] }))));
  const games = months.flatMap((m) => m.games || []);
  games.sort((a, b) => a.end_time - b.end_time);
  return games;
}

function classify(result) {
  if (result === 'win') return 'win';
  if (DRAW_RESULTS.has(result)) return 'draw';
  return 'loss';
}

function side(game, username) {
  return game.white.username.toLowerCase() === username ? 'white' : 'black';
}

function formatDate(unixSeconds) {
  if (!unixSeconds) return '';
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

function tierClass(rating) {
  if (rating >= 2000) return 'tier-purple';
  if (rating >= 1600) return 'tier-gold';
  return '';
}

function parseMoveCount(pgn) {
  if (!pgn) return 0;
  const matches = [...pgn.matchAll(/(\d+)\.(?!\.\.)/g)];
  if (!matches.length) return 0;
  return Number(matches[matches.length - 1][1]);
}

function parseOpening(pgn) {
  if (!pgn) return null;
  const match = /\[ECOUrl "([^"]+)"\]/.exec(pgn);
  if (!match) return null;
  const slug = match[1].split('/').pop();
  const name = slug.split('-').filter((t) => !/^\d/.test(t)).join(' ');
  return name || null;
}

function renderProfile(profile, stats) {
  avatarImg.src = profile.avatar || '';
  displayNameEl.textContent = profile.name || profile.username;
  handleEl.textContent = '@' + profile.username;
  joinedEl.textContent = 'Joined ' + formatDate(profile.joined);

  const formatKeys = ['chess_bullet', 'chess_blitz', 'chess_rapid', 'chess_daily'];
  let peak = 0;
  let totalGames = 0;
  for (const key of formatKeys) {
    const entry = stats[key];
    if (!entry) continue;
    if (entry.best && entry.best.rating > peak) peak = entry.best.rating;
    if (entry.record) totalGames += (entry.record.win || 0) + (entry.record.loss || 0) + (entry.record.draw || 0);
  }

  peakRatingEl.textContent = peak ? `Peak ${peak}` : '';
  totalGamesEl.textContent = totalGames ? `${totalGames} games` : '';
  challengeLink.href = `https://www.chess.com/play/online/new?opponent=${profile.username}`;
  profileBox.hidden = false;
}

function renderStats(stats, games, username) {
  const order = ['chess_rapid', 'chess_blitz', 'chess_bullet', 'chess_daily', 'tactics', 'puzzle_rush'];

  for (const key of order) {
    const entry = stats[key];
    if (!entry) continue;

    const node = cardTemplate.content.cloneNode(true);
    node.querySelector('.icon').innerHTML = ICONS[key];
    node.querySelector('.card-title').textContent = LABELS[key];

    if (key === 'tactics' || key === 'puzzle_rush') {
      renderSimpleBest(node, entry, key);
    } else {
      renderTimeControl(node, entry, key, games, username);
    }

    statsBox.appendChild(node);
  }

  if (!statsBox.children.length) {
    showError('This player has no public stats yet.');
  }
}

function renderTimeControl(node, entry, key, games, username) {
  const rating = entry.last ? entry.last.rating : 0;
  node.querySelector('.rating').textContent = rating || '-';
  node.querySelector('.card').classList.add(...[tierClass(rating)].filter(Boolean));
  node.querySelector('.best-value').textContent = entry.best ? entry.best.rating : '-';

  const record = entry.record || {};
  const win = record.win || 0;
  const loss = record.loss || 0;
  const draw = record.draw || 0;
  const total = win + loss + draw || 1;

  node.querySelector('.record').innerHTML = `
    <span class="win">${win}W</span>
    <span class="loss">${loss}L</span>
    <span class="draw">${draw}D</span>
  `;
  node.querySelector('.seg.win').style.width = (win / total * 100) + '%';
  node.querySelector('.seg.draw').style.width = (draw / total * 100) + '%';
  node.querySelector('.seg.loss').style.width = (loss / total * 100) + '%';
  node.querySelector('.win-pct').textContent = `${Math.round(win / total * 100)}% win rate`;

  const timeClass = key.replace('chess_', '');
  const points = buildSparklinePoints(games, username, timeClass);
  renderSparkline(node.querySelector('.sparkline'), points);
}

function renderSimpleBest(node, entry, key) {
  const best = key === 'tactics' ? entry.highest : entry.best;
  const rating = best ? (best.rating ?? best.score ?? 0) : 0;
  node.querySelector('.rating').textContent = rating || '-';
  node.querySelector('.card').classList.add(...[tierClass(rating)].filter(Boolean));
  node.querySelector('.best').remove();
  node.querySelector('.win-pct').remove();
  node.querySelector('.record').remove();
  node.querySelector('.record-bar').remove();
  node.querySelector('.sparkline').remove();
}

function buildSparklinePoints(games, username, timeClass) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return games
    .filter((g) => g.time_class === timeClass && g.end_time * 1000 >= cutoff)
    .map((g) => {
      const s = side(g, username);
      return { t: g.end_time * 1000, rating: g[s].rating };
    })
    .sort((a, b) => a.t - b.t);
}

function renderSparkline(svg, points) {
  if (points.length < 2) {
    svg.style.display = 'none';
    return;
  }

  const ratings = points.map((p) => p.rating);
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const range = max - min || 1;
  const step = 100 / (points.length - 1);

  const coords = points
    .map((p, i) => `${i * step},${24 - ((p.rating - min) / range) * 24}`)
    .join(' ');

  svg.innerHTML = `<polyline points="${coords}" fill="none" stroke="currentColor" stroke-width="2"/>`;
}

function renderPerformance(games, username) {
  let whiteWin = 0, whiteTotal = 0, blackWin = 0, blackTotal = 0;
  let totalMovesSum = 0;
  let mateCount = 0, resignCount = 0, timeoutCount = 0, drawCount = 0;

  for (const g of games) {
    const s = side(g, username);
    const result = classify(g[s].result);
    const userResult = g[s].result;
    
    totalMovesSum += parseMoveCount(g.pgn);

    if (s === 'white') {
      whiteTotal++;
      if (result === 'win') whiteWin++;
    } else {
      blackTotal++;
      if (result === 'win') blackWin++;
    }

    if (userResult === 'checkmated' || (userResult === 'win' && g[s === 'white' ? 'black' : 'white'].result === 'checkmated')) mateCount++;
    else if (userResult === 'resigned' || (userResult === 'win' && g[s === 'white' ? 'black' : 'white'].result === 'resigned')) resignCount++;
    else if (userResult === 'timeout' || (userResult === 'win' && g[s === 'white' ? 'black' : 'white'].result === 'timeout')) timeoutCount++;
    else if (DRAW_RESULTS.has(userResult)) drawCount++;
  }

  const whitePct = whiteTotal ? Math.round(whiteWin / whiteTotal * 100) : 0;
  const blackPct = blackTotal ? Math.round(blackWin / blackTotal * 100) : 0;

  whiteBar.style.width = whitePct + '%';
  blackBar.style.width = blackPct + '%';
  whitePctEl.textContent = whitePct + '%';
  blackPctEl.textContent = blackPct + '%';

  const totalTerm = mateCount + resignCount + timeoutCount + drawCount || 1;
  document.getElementById('term-mate').style.width = (mateCount / totalTerm * 100) + '%';
  document.getElementById('term-resign').style.width = (resignCount / totalTerm * 100) + '%';
  document.getElementById('term-timeout').style.width = (timeoutCount / totalTerm * 100) + '%';
  document.getElementById('term-draw').style.width = (drawCount / totalTerm * 100) + '%';

  avgMovesEl.textContent = `Avg. game length: ${Math.round(totalMovesSum / games.length)} moves`;

  const recent = [...games].reverse();
  let streakType = null;
  let streakCount = 0;

  for (const g of recent) {
    const s = side(g, username);
    const result = classify(g[s].result);
    if (result === 'draw') break;
    if (streakType === null) {
      streakType = result;
      streakCount = 1;
    } else if (result === streakType) {
      streakCount++;
    } else {
      break;
    }
  }

  streakEl.textContent = streakCount
    ? `Current streak: ${streakCount}${streakType === 'win' ? 'W' : 'L'}`
    : 'No active streak';

  performanceBox.hidden = false;
}

function renderOpponents(games, username) {
  const map = new Map();

  for (const g of games) {
    const s = side(g, username);
    const opp = s === 'white' ? g.black.username : g.white.username;
    const result = classify(g[s].result);

    const entry = map.get(opp) || { games: 0, win: 0, loss: 0, draw: 0 };
    entry.games++;
    if (result === 'win') entry.win++;
    else if (result === 'loss') entry.loss++;
    else entry.draw++;
    map.set(opp, entry);
  }

  const frequent = [...map.entries()].filter(([_, d]) => d.games > 1).sort((a, b) => b[1].games - a[1].games).slice(0, 3);
  if (!frequent.length) return;

  opponentsBox.innerHTML = '<h2 class="section-title">Top Head-to-Head Opponents</h2>';
  for (const [name, data] of frequent) {
    const node = opponentRowTemplate.content.cloneNode(true);
    node.querySelector('.opp-name').textContent = name;
    node.querySelector('.opp-h2h').textContent = `${data.win}W - ${data.loss}L - ${data.draw}D (${data.games} games)`;
    opponentsBox.appendChild(node);
  }
}

function renderOpenings(games, username) {
  const map = new Map();

  for (const g of games) {
    const name = parseOpening(g.pgn);
    if (!name) continue;
    const s = side(g, username);
    const result = classify(g[s].result);
    const entry = map.get(name) || { games: 0, wins: 0 };
    entry.games++;
    if (result === 'win') entry.wins++;
    map.set(name, entry);
  }

  const top = [...map.entries()].sort((a, b) => b[1].games - a[1].games).slice(0, 3);
  if (!top.length) return;

  openingsBox.innerHTML = '<h2 class="section-title">Top openings (recent games)</h2>';
  for (const [name, data] of top) {
    const node = openingRowTemplate.content.cloneNode(true);
    node.querySelector('.opening-name').textContent = name;
    const pct = Math.round(data.wins / data.games * 100);
    node.querySelector('.opening-winrate').textContent = `${pct}% win (${data.games})`;
    openingsBox.appendChild(node);
  }
}

function renderGames(games, username) {
  const recent = [...games].reverse().slice(0, 10);
  if (!recent.length) return;

  gamesBox.innerHTML = '<h2 class="section-title">Recent games</h2>';

  for (const g of recent) {
    const s = side(g, username);
    const opp = s === 'white' ? g.black : g.white;
    const userResult = g[s].result;
    const resultClass = classify(userResult);

    const node = gameRowTemplate.content.cloneNode(true);
    const rowEl = node.querySelector('.game-row');

    rowEl.addEventListener('click', () => {
      openGameModal(g, username);
    });

    const icon = node.querySelector('.result-icon');
    icon.innerHTML = RESULT_ICONS[resultClass];
    icon.classList.add('result-' + resultClass);

    node.querySelector('.opponent').textContent = opp.username;
    node.querySelector('.opp-rating').textContent = opp.rating;
    node.querySelector('.format').textContent = g.time_class;
    
    const accEl = node.querySelector('.accuracy');
    if (accEl) {
      if (g.accuracies && g.accuracies[s] !== undefined) {
        accEl.textContent = `${Math.round(g.accuracies[s])}% acc`;
      } else if (listAccuracyCache.has(g.url)) {
        const cachedAcc = listAccuracyCache.get(g.url);
        accEl.textContent = `${cachedAcc[s]}% acc`;
      } else {
        accEl.textContent = 'calc acc...';
        backgroundCalculateListAccuracy(g, s, accEl);
      }
    }

    const reasonText = REASON_LABELS[userResult] || userResult;
    node.querySelector('.result-reason').textContent = reasonText;
    node.querySelector('.moves').textContent = parseMoveCount(g.pgn) + ' moves';

    gamesBox.appendChild(node);
  }
}

function backgroundCalculateListAccuracy(game, playerSide, badgeEl) {
  const chess = new Chess();
  try {
    chess.load_pgn(game.pgn);
    const history = chess.history();
    chess.reset();
    const fens = [chess.fen()];
    for (const m of history) {
      chess.move(m);
      fens.push(chess.fen());
    }

    // A quick, partial-depth read for the list badge — just enough plies
    // and depth to be responsive with ten of these running at once. The
    // modal's full review (opened per-game, on request) goes to full
    // depth across the whole game instead.
    const trimmed = fens.slice(0, LIST_ACCURACY_PLY_CAP + 1);

    analyzeGame(trimmed, LIST_ACCURACY_DEPTH, {
      onComplete: (evals) => {
        if (!evals.length) {
          if (badgeEl) badgeEl.textContent = 'N/A';
          return;
        }
        const accs = computeAccuraciesFromEvals(evals);
        listAccuracyCache.set(game.url, accs);
        if (badgeEl) badgeEl.textContent = `${accs[playerSide]}% acc`;
      }
    });
  } catch (e) {
    if (badgeEl) badgeEl.textContent = 'N/A';
  }
}

// evals[0] is the start position; evals[i] is the position after ply i
// (white's move when i is odd, black's when i is even). For each ply we
// measure the win% the MOVER gave up on their own move — not just the
// raw white-perspective swing — so a good black move is never mistaken
// for a black blunder and vice versa.
function computeAccuraciesFromEvals(evals) {
  const winSeries = evals.map(cpToWhiteWinPercent);
  let whiteSum = 0, whiteCount = 0;
  let blackSum = 0, blackCount = 0;

  for (let i = 1; i < winSeries.length; i++) {
    const before = winSeries[i - 1];
    const after = winSeries[i];
    const whiteMoved = i % 2 === 1;
    const loss = whiteMoved ? Math.max(0, before - after) : Math.max(0, after - before);
    const accuracy = accuracyFromWinPercentLoss(loss);

    if (whiteMoved) {
      whiteSum += accuracy;
      whiteCount++;
    } else {
      blackSum += accuracy;
      blackCount++;
    }
  }

  return {
    white: whiteCount > 0 ? Math.round(whiteSum / whiteCount) : 85,
    black: blackCount > 0 ? Math.round(blackSum / blackCount) : 85
  };
}

async function openGameModal(game, username) {
  stopAutoPlay();
  if (activeAnalysis) {
    activeAnalysis.cancel();
    activeAnalysis = null;
  }

  const modal = document.getElementById('game-modal');
  modal.hidden = false;

  const progressEl = document.getElementById('eval-progress');
  const summaryEl = document.getElementById('eval-summary');

  evalSeries = [];
  renderEvalGraph([]);
  if (summaryEl) summaryEl.textContent = '';
  if (progressEl) progressEl.textContent = `warming up the engine (depth ${MODAL_ANALYSIS_DEPTH})…`;

  const chess = new Chess();
  chess.load_pgn(game.pgn);
  moveNotationList = chess.history();
  
  chess.reset();
  const positions = [chess.fen()];
  for (const move of moveNotationList) {
    chess.move(move);
    positions.push(chess.fen());
  }
  gameStack = positions;
  currentMoveIndex = positions.length - 1;

  renderPgnTranscript();

  const userSide = side(game, username);

  const boardConfig = {
    position: gameStack[currentMoveIndex],
    orientation: userSide,
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
  };

  if (!board) {
    board = Chessboard('board', boardConfig);
  } else {
    board.orientation(userSide);
    board.position(gameStack[currentMoveIndex]);
  }

  setTimeout(() => {
    board.resize();
  }, 10);

  document.getElementById('modal-title').textContent = `${game.white.username} vs ${game.black.username}`;
  updateMoveHighlight();

  function showAccuracySummary(accs) {
    if (summaryEl) summaryEl.textContent = `White ${accs.white}% · Black ${accs.black}% accuracy`;
  }

  const officialAccuracy = game.accuracies && game.accuracies.white !== undefined
    ? { white: Math.round(game.accuracies.white), black: Math.round(game.accuracies.black) }
    : null;

  const cached = fullAnalysisCache.get(game.url);
  if (cached) {
    evalSeries = cached.evals;
    renderEvalGraph(evalSeries);
    updateEvalMarker(currentMoveIndex);
    if (progressEl) progressEl.textContent = `depth ${MODAL_ANALYSIS_DEPTH} · ${evalSeries.length - 1} moves`;
    showAccuracySummary(officialAccuracy || cached.accuracy);
    return;
  }

  const runningEvals = [];
  activeAnalysis = analyzeGame(gameStack, MODAL_ANALYSIS_DEPTH, {
    onProgress: (done, total, latestCp) => {
      runningEvals[done - 1] = latestCp;
      evalSeries = runningEvals.slice(0, done);
      renderEvalGraph(evalSeries);
      updateEvalMarker(Math.min(currentMoveIndex, done - 1));
      if (progressEl) {
        progressEl.textContent = `depth ${MODAL_ANALYSIS_DEPTH} · analyzing move ${done}/${total - 1}…`;
      }
    },
    onComplete: (evals) => {
      evalSeries = evals;
      const accuracy = computeAccuraciesFromEvals(evals);
      fullAnalysisCache.set(game.url, { evals, accuracy });
      renderEvalGraph(evalSeries);
      updateEvalMarker(currentMoveIndex);
      if (progressEl) progressEl.textContent = `depth ${MODAL_ANALYSIS_DEPTH} · analysis complete`;
      showAccuracySummary(officialAccuracy || accuracy);
      activeAnalysis = null;
    }
  });
}

// Draws the evaluation swing as a two-tone area chart: the cream region is
// white's share of the position (by win%), the dark region is black's —
// the boundary between them is the line that climbs and dives every move.
function renderEvalGraph(evals) {
  const svg = document.getElementById('eval-svg');
  if (!svg) return;

  if (!evals.length) {
    svg.innerHTML = `<line x1="0" y1="${EVAL_GRAPH_HEIGHT / 2}" x2="${EVAL_GRAPH_WIDTH}" y2="${EVAL_GRAPH_HEIGHT / 2}" class="eval-mid"/>`;
    return;
  }

  const n = evals.length;
  const step = n > 1 ? EVAL_GRAPH_WIDTH / (n - 1) : EVAL_GRAPH_WIDTH;
  const points = evals.map((cp, i) => {
    const whiteWinPct = cpToWhiteWinPercent(cp);
    const y = EVAL_GRAPH_HEIGHT - (whiteWinPct / 100) * EVAL_GRAPH_HEIGHT;
    return [i * step, y];
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const whiteArea = `${linePath} L${EVAL_GRAPH_WIDTH},${EVAL_GRAPH_HEIGHT} L0,${EVAL_GRAPH_HEIGHT} Z`;
  const blackArea = `${linePath} L${EVAL_GRAPH_WIDTH},0 L0,0 Z`;

  svg.innerHTML = `
    <path d="${blackArea}" class="eval-area-black"/>
    <path d="${whiteArea}" class="eval-area-white"/>
    <line x1="0" y1="${EVAL_GRAPH_HEIGHT / 2}" x2="${EVAL_GRAPH_WIDTH}" y2="${EVAL_GRAPH_HEIGHT / 2}" class="eval-mid"/>
    <path d="${linePath}" class="eval-line"/>
    <line id="eval-marker" x1="0" y1="0" x2="0" y2="${EVAL_GRAPH_HEIGHT}" class="eval-marker"/>
  `;
}

function updateEvalMarker(moveIndex) {
  const marker = document.getElementById('eval-marker');
  const readoutEl = document.getElementById('eval-readout');
  if (!marker || !evalSeries.length) return;

  const n = evalSeries.length;
  const clamped = Math.max(0, Math.min(moveIndex, n - 1));
  const step = n > 1 ? EVAL_GRAPH_WIDTH / (n - 1) : EVAL_GRAPH_WIDTH;
  const x = clamped * step;
  marker.setAttribute('x1', x.toFixed(1));
  marker.setAttribute('x2', x.toFixed(1));

  if (readoutEl) readoutEl.textContent = formatEval(evalSeries[clamped]);
}

function renderPgnTranscript() {
  const pgnBox = document.getElementById('pgn-moves');
  pgnBox.innerHTML = '';
  
  for (let i = 0; i < moveNotationList.length; i++) {
    const span = document.createElement('span');
    span.className = 'move-chip';
    const moveNum = Math.floor(i / 2) + 1;
    const prefix = i % 2 === 0 ? `${moveNum}. ` : '';
    span.textContent = `${prefix}${moveNotationList[i]}`;
    span.addEventListener('click', () => {
      jumpToMove(i + 1);
    });
    pgnBox.appendChild(span);
  }
}

function updateMoveHighlight() {
  const chips = document.querySelectorAll('.move-chip');
  chips.forEach((c, idx) => {
    c.classList.toggle('active', idx === currentMoveIndex - 1);
  });
  if (chips[currentMoveIndex - 1]) {
    chips[currentMoveIndex - 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function jumpToMove(index) {
  currentMoveIndex = index;
  board.position(gameStack[currentMoveIndex]);
  updateMoveHighlight();
  updateEvalMarker(currentMoveIndex);
}

function stopAutoPlay() {
  if (autoPlayInterval) {
    clearInterval(autoPlayInterval);
    autoPlayInterval = null;
    document.getElementById('play-move').innerHTML = '&#9658;';
  }
}

document.getElementById('modal-close').addEventListener('click', () => {
  stopAutoPlay();
  if (activeAnalysis) {
    activeAnalysis.cancel();
    activeAnalysis = null;
  }
  document.getElementById('game-modal').hidden = true;
});

document.getElementById('first-move').addEventListener('click', () => {
  stopAutoPlay();
  jumpToMove(0);
});

document.getElementById('prev-move').addEventListener('click', () => {
  stopAutoPlay();
  if (currentMoveIndex > 0) jumpToMove(currentMoveIndex - 1);
});

document.getElementById('next-move').addEventListener('click', () => {
  stopAutoPlay();
  if (currentMoveIndex < gameStack.length - 1) jumpToMove(currentMoveIndex + 1);
});

document.getElementById('last-move').addEventListener('click', () => {
  stopAutoPlay();
  jumpToMove(gameStack.length - 1);
});

document.getElementById('play-move').addEventListener('click', () => {
  if (autoPlayInterval) {
    stopAutoPlay();
  } else {
    document.getElementById('play-move').innerHTML = '&#10074;&#10074;';
    autoPlayInterval = setInterval(() => {
      if (currentMoveIndex < gameStack.length - 1) {
        jumpToMove(currentMoveIndex + 1);
      } else {
        stopAutoPlay();
      }
    }, 800);
  }
});

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}
