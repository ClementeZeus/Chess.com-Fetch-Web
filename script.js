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
let engineWorker = null;

const calculatedAccuraciesCache = new Map();

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
      } else if (calculatedAccuraciesCache.has(g.url)) {
        const cachedAcc = calculatedAccuraciesCache.get(g.url);
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

// Every visible game row that needs a calculated badge used to spin up its
// own Stockfish Worker immediately, so up to ~10 engines ended up running
// at once, all fighting each other for the same CPU cores - that's most of
// why this felt so slow. Queue the work instead and only let a couple of
// engines run at a time; the rest wait their turn.
const LIST_WORKER_POOL_SIZE = 2;
const listAccuracyQueue = [];
let activeListWorkers = 0;

function backgroundCalculateListAccuracy(game, playerSide, badgeEl) {
  listAccuracyQueue.push({ game, playerSide, badgeEl });
  pumpListAccuracyQueue();
}

function pumpListAccuracyQueue() {
  while (activeListWorkers < LIST_WORKER_POOL_SIZE && listAccuracyQueue.length) {
    const task = listAccuracyQueue.shift();
    activeListWorkers++;
    runListAccuracyTask(task);
  }
}

function runListAccuracyTask({ game, playerSide, badgeEl }) {
  const finishTask = () => {
    activeListWorkers--;
    pumpListAccuracyQueue();
  };

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

    runQuickStockfishForList(fens, game.url, (accuracies) => {
      if (accuracies && badgeEl) {
        badgeEl.textContent = `${accuracies[playerSide]}% acc`;
      } else if (badgeEl) {
        badgeEl.textContent = 'N/A';
      }
      finishTask();
    });
  } catch (e) {
    if (badgeEl) badgeEl.textContent = 'N/A';
    finishTask();
  }
}

function runQuickStockfishForList(fens, gameId, callback) {
  if (!window.Worker) {
    callback(null);
    return;
  }
  const workerCode = `
    importScripts('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');
    var engine = typeof Stockfish === 'function' ? Stockfish() : null;
    if (engine) {
      engine.onmessage = function(event) { postMessage(event.data || event); };
      onmessage = function(e) { engine.postMessage(e.data); };
    }
  `;
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  const worker = new Worker(URL.createObjectURL(blob));
  
  // Capping depth alone isn't enough - a gnarly middlegame position can
  // still take the engine a long time to finish deepening to it. Cap the
  // time per move too, so total calc time stays predictable regardless of
  // how sharp any one position is.
  const QUICK_DEPTH = 6;
  const QUICK_MOVETIME_MS = 150;
  const evals = [];
  let idx = 0;
  let lastCp = 0;
  let settled = false;

  const timeoutId = setTimeout(() => {
    if (!settled) {
      settled = true;
      worker.terminate();
      callback({ white: 85, black: 85 });
    }
  }, 25000);

  worker.onmessage = function(e) {
    if (settled) return;
    const line = typeof e.data === 'string' ? e.data : '';
    if (line.includes('score cp') || line.includes('score mate')) {
      // Iterative deepening emits an "info ... score ..." line at every
      // depth on the way to the target depth - keep only the latest one
      // and act on it when "bestmove" arrives, otherwise we'd jump on the
      // very first (depth-1, near-random) line instead of the full-depth
      // search result.
      let cp = 0;
      const cpMatch = line.match(/score cp (-?\d+)/);
      const mateMatch = line.match(/score mate (-?\d+)/);
      if (cpMatch) cp = parseInt(cpMatch[1], 10);
      else if (mateMatch) {
        const m = parseInt(mateMatch[1], 10);
        cp = m > 0 ? 10000 - m * 100 : -10000 - m * 100;
      }
      lastCp = cp;
      return;
    }

    if (line.indexOf('bestmove') !== 0) return;

    let cp = lastCp;
    if (fens[idx] && fens[idx].includes(' b ')) cp = -cp;

    evals.push(cp);
    idx++;
    lastCp = 0;

    if (idx < fens.length) {
      worker.postMessage('position fen ' + fens[idx]);
      worker.postMessage('go depth ' + QUICK_DEPTH);
    } else {
      settled = true;
      clearTimeout(timeoutId);
      const accs = computeAccuraciesFromEvals(evals);
      calculatedAccuraciesCache.set(gameId, accs);
      worker.terminate();
      callback(accs);
    }
  };

  worker.onerror = function() {
    if (!settled) {
      settled = true;
      clearTimeout(timeoutId);
      worker.terminate();
      callback(null);
    }
  };

  worker.postMessage('uci');
  worker.postMessage('position fen ' + fens[0]);
  worker.postMessage('go depth ' + QUICK_DEPTH);
}

// Win probability (0-100) from White's perspective, given a centipawn
// score that is also from White's perspective. Same curve chess.com/lichess
// use to turn an engine eval into a "chance of winning" number.
function winProbabilityFromCp(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

// Chess.com's published per-move accuracy curve: a move that doesn't move
// the needle at all scores ~100, and accuracy falls off exponentially as
// the win-probability swing against the mover grows.
function moveAccuracyFromWinPercentDrop(winPercentBefore, winPercentAfter) {
  const drop = Math.max(0, winPercentBefore - winPercentAfter);
  const accuracy = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669;
  return Math.min(100, Math.max(0, accuracy));
}

function harmonicMean(values) {
  const sum = values.reduce((acc, v) => acc + 1 / Math.max(v, 0.01), 0);
  return values.length / sum;
}

// Chess.com blends the arithmetic mean of per-move accuracies with their
// harmonic mean, so a handful of bad moves pull the overall score down more
// than a plain average would - a single 0% blunder in an otherwise clean
// game should read as noticeably worse than "average it away".
function overallAccuracy(moveAccuracies) {
  if (!moveAccuracies.length) return 85;
  const mean = moveAccuracies.reduce((a, b) => a + b, 0) / moveAccuracies.length;
  const hMean = harmonicMean(moveAccuracies);
  return Math.round((mean + hMean) / 2);
}

function computeAccuraciesFromEvals(cpList) {
  const whiteMoveAccuracies = [];
  const blackMoveAccuracies = [];

  for (let i = 1; i < cpList.length; i++) {
    const isWhiteMove = i % 2 === 1;

    // cpList is always from White's perspective. White's win% rising is
    // Black's win% falling and vice versa, so to score a move fairly we
    // need the win probability from the perspective of whoever just moved,
    // not White's raw number - otherwise a great move by Black (which
    // *lowers* White's win%) gets scored as if it were a blunder.
    const whiteWinBefore = winProbabilityFromCp(cpList[i - 1]);
    const whiteWinAfter = winProbabilityFromCp(cpList[i]);
    const moverWinBefore = isWhiteMove ? whiteWinBefore : 100 - whiteWinBefore;
    const moverWinAfter = isWhiteMove ? whiteWinAfter : 100 - whiteWinAfter;

    const accuracy = moveAccuracyFromWinPercentDrop(moverWinBefore, moverWinAfter);

    if (isWhiteMove) whiteMoveAccuracies.push(accuracy);
    else blackMoveAccuracies.push(accuracy);
  }

  return {
    white: overallAccuracy(whiteMoveAccuracies),
    black: overallAccuracy(blackMoveAccuracies)
  };
}

async function openGameModal(game, username) {
  stopAutoPlay();
  const modal = document.getElementById('game-modal');
  modal.hidden = false;

  const accuracyBox = document.getElementById('modal-accuracy');
  if (accuracyBox) accuracyBox.hidden = false;
  
  const wVal = document.getElementById('acc-white-val');
  const bVal = document.getElementById('acc-black-val');
  const wFill = document.getElementById('acc-white-fill');
  const bFill = document.getElementById('acc-black-fill');

  if (wVal) wVal.textContent = 'Calc...';
  if (bVal) bVal.textContent = 'Calc...';
  if (wFill) wFill.style.width = '0%';
  if (bFill) bFill.style.width = '0%';

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

  function displayModalAccuracies(res) {
    if (wVal) wVal.textContent = `${res.white}%`;
    if (bVal) bVal.textContent = `${res.black}%`;
    if (wFill) wFill.style.width = `${res.white}%`;
    if (bFill) bFill.style.width = `${res.black}%`;
  }

  if (game.accuracies && game.accuracies.white !== undefined) {
    displayModalAccuracies({
      white: Math.round(game.accuracies.white),
      black: Math.round(game.accuracies.black)
    });
  } else if (calculatedAccuraciesCache.has(game.url)) {
    displayModalAccuracies(calculatedAccuraciesCache.get(game.url));
  } else {
    runLocalStockfishAnalysis(gameStack, game.url, displayModalAccuracies);
  }
}

function runLocalStockfishAnalysis(fens, gameUrl, onComplete) {
  if (!window.Worker) {
    onComplete({ white: 85, black: 85 });
    return;
  }
  if (engineWorker) engineWorker.terminate();

  const workerCode = `
    importScripts('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');
    var engine = typeof Stockfish === 'function' ? Stockfish() : null;
    if (engine) {
      engine.onmessage = function(event) { postMessage(event.data || event); };
      onmessage = function(e) { engine.postMessage(e.data); };
    }
  `;

  const blob = new Blob([workerCode], { type: 'application/javascript' });
  engineWorker = new Worker(URL.createObjectURL(blob));

  const MODAL_DEPTH = 10;
  const MODAL_MOVETIME_MS = 400;
  const evals = [];
  let currentFenIndex = 0;
  let lastCp = 0;
  let settled = false;

  const timeoutId = setTimeout(() => {
    if (!settled) {
      settled = true;
      if (engineWorker) {
        engineWorker.terminate();
        engineWorker = null;
      }
      onComplete({ white: 85, black: 85 });
    }
  }, 45000);

  engineWorker.onmessage = function(e) {
    if (settled) return;
    const line = typeof e.data === 'string' ? e.data : '';
    if (line.includes('score cp') || line.includes('score mate')) {
      // Keep only the most recent "info ... score ..." line; iterative
      // deepening reports one per depth on the way to MODAL_DEPTH, and the
      // real result is whichever one was current right before "bestmove".
      let cp = 0;
      const cpMatch = line.match(/score cp (-?\d+)/);
      const mateMatch = line.match(/score mate (-?\d+)/);

      if (cpMatch) cp = parseInt(cpMatch[1], 10);
      else if (mateMatch) {
        const m = parseInt(mateMatch[1], 10);
        cp = m > 0 ? 10000 - m * 100 : -10000 - m * 100;
      }

      lastCp = cp;
      return;
    }

    if (line.indexOf('bestmove') !== 0) return;

    let cp = lastCp;
    if (fens[currentFenIndex] && fens[currentFenIndex].includes(' b ')) {
      cp = -cp;
    }

    evals.push(cp);
    currentFenIndex++;
    lastCp = 0;

    if (currentFenIndex < fens.length) {
      engineWorker.postMessage('position fen ' + fens[currentFenIndex]);
      engineWorker.postMessage('go depth ' + MODAL_DEPTH);
    } else {
      settled = true;
      clearTimeout(timeoutId);
      const results = computeAccuraciesFromEvals(evals);
      if (gameUrl) calculatedAccuraciesCache.set(gameUrl, results);

      onComplete(results);

      engineWorker.terminate();
      engineWorker = null;
    }
  };

  engineWorker.onerror = function() {
    if (!settled) {
      settled = true;
      clearTimeout(timeoutId);
      if (engineWorker) {
        engineWorker.terminate();
        engineWorker = null;
      }
      onComplete({ white: 85, black: 85 });
    }
  };

  engineWorker.postMessage('uci');
  engineWorker.postMessage('position fen ' + fens[0]);
  engineWorker.postMessage('go depth ' + MODAL_DEPTH);
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
}

function stopAutoPlay() {
  if (autoPlayInterval) {
    clearInterval(autoPlayInterval);
    autoPlayInterval = null;
    document.getElementById('play-move').innerHTML = '&#9658;';
  }
}

window.addEventListener('resize', () => {
  const modal = document.getElementById('game-modal');
  if (board && modal && !modal.hidden) board.resize();
});

document.getElementById('modal-close').addEventListener('click', () => {
  stopAutoPlay();
  if (engineWorker) {
    engineWorker.terminate();
    engineWorker = null;
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
