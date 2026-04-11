// ===== Cabo an der Riss — Client =====
// Uses PeerJS (WebRTC) for peer-to-peer multiplayer.

const PEER_PREFIX = 'cabo-an-der-riss-';

let peer = null;
let isHost = false;
let game = null;
let hostConn = null;
let guestConns = {};
let playerPeerMap = {};
let myPlayerId = null;
let myName = '';
let roomCode = '';
let gameState = null;
let peekTimeout = null;
let botIds = [];
let botMemory = {};
let slamMode = false;
let slamSelection = [];
const BOT_NAMES = ['Biber', 'Storch', 'Sch\u00fctze', 'Riss'];
const BOT_DELAY = 1200;

const $ = (id) => document.getElementById(id);

// ===== Translations =====
const TRANSLATIONS = {
  de: {
    tagline: 'Ein Kartenspiel aus Biberach',
    namePlaceholder: 'Dein Name',
    createRoom: 'Raum erstellen',
    or: 'oder',
    roomCodePlaceholder: 'Raum-Code',
    join: 'Beitreten',
    shareCode: 'Teile den Code mit deinen Mitspielern',
    addBot: 'Bot hinzuf\u00fcgen',
    startGame: 'Spiel starten',
    waitingHost: 'Warte auf den Gastgeber...',
    waitingPlayers: 'Warte auf Mitspieler oder f\u00fcge Bots hinzu...',
    hostBadge: 'Gastgeber',
    enterName: 'Bitte Namen eingeben',
    enterCode: 'Bitte Raum-Code eingeben',
    noBotsLeft: 'Keine Bot-Namen mehr frei',
    connError: 'Verbindungsfehler. Bitte erneut versuchen.',
    roomNotFound: 'Raum nicht gefunden',
    connLost: 'Verbindung zum Gastgeber verloren',
    scoresTitle: 'Punkte',
    roundHistory: 'Runde',
    totalCol: '\u03a3',
    deckLabel: 'Stapel',
    discardLabel: 'Ablage',
    emptyPile: 'Leer',
    rulesTitle: 'Spielregeln',
    room: (c) => `Raum: ${c}`,
    roundN: (n) => `Runde ${n}`,
    drawn: 'Gezogen:',
    fromDiscard: 'Von Ablage:',
    peekN: (n) => `Sieh dir ${n} deiner Karten an`,
    waitOthers: 'Warte auf andere Spieler\u2026',
    turnOf: (name) => `${name} ist am Zug`,
    lastRound: ' (letzte Runde!)',
    yourTurn: 'Du bist dran',
    lastRoundBang: ' \u2014 Letzte Runde!',
    selectSlam: (n) => `W\u00e4hle Karten zum Ablegen (${n} gew\u00e4hlt)`,
    slam: 'Slammen',
    doSlam: 'Ablegen!',
    cancelSlam: 'Abbrechen',
    drawDeck: 'Ziehen',
    drawDiscard: 'Ablage nehmen',
    discardCard: 'Ablegen',
    swapOrDiscard: 'Tauschen oder ablegen?',
    whichCard: 'Welche Karte ersetzen?',
    peekMsg: 'PEEK \u2014 Tippe auf eine deiner Karten',
    spyMsg: 'SPY \u2014 Tippe auf eine Karte eines Mitspielers',
    swapOwnMsg: 'SWAP \u2014 Tippe auf eine deiner Karten',
    swapOppMsg: 'SWAP \u2014 Tippe auf eine Karte eines Mitspielers',
    kingPeekMsg: 'KING \u2014 Sieh dir eine eigene Karte an',
    kingSpyMsg: 'KING \u2014 Sieh dir eine Karte eines Mitspielers an',
    kingSwapMsg: 'KING \u2014 Karten tauschen?',
    doSwap: 'Tauschen',
    keepCard: 'Behalten',
    skipPower: 'Verzichten',
    roundOver: 'Runde vorbei!',
    gameOverTitle: 'Spiel vorbei!',
    gameWinner: (name) => `\u{1F3C6} ${name} gewinnt!`,
    penalty: '+10 Strafe (Cabo verfehlt)',
    roundPoints: (n) => `Runde: +${n}`,
    totalPoints: (n) => `Gesamt: ${n}`,
    nextRound: 'N\u00e4chste Runde',
    backLobby: 'Zur\u00fcck zur Lobby',
    waitHost: 'Warte auf den Gastgeber\u2026',
    cardSwapped: (n) => `Karte ${n} wurde getauscht!`,
    slamSuccess: (name, n) => `${name} hat ${n} Karte(n) abgelegt!`,
    slamFail: (name) => `${name}: Karte passt nicht! Strafkarte.`,
    disconnected: (name) => `${name} hat das Spiel verlassen`,
    bubbleDraw: 'zieht vom Stapel',
    bubbleDrawDiscard: 'nimmt Ablage',
    bubbleDiscard: 'ablegen',
    bubbleDiscardPower: (p) => `ablegen → ${p}!`,
    bubbleSwapDrawn: (n) => `tauscht Pos. ${n}`,
    bubbleSkip: 'überspringt',
    bubblePeek: 'schaut eigene Karte',
    bubbleSpy: (target) => `spioniert ${target}`,
    bubbleSwap: (target) => `tauscht mit ${target}`,
    bubbleSlamOk: (n) => `${n} abgelegt!`,
    bubbleSlamFail: 'Falsche Karte!',
    yourCardN: (n) => `Deine Karte ${n}`,
    theirCardN: (name, n) => `${name}s Karte ${n}`,
    rulesBody: `
      <h3>Ziel</h3>
      <p>Habe die niedrigste Summe an Kartenwerten. Ein Spiel endet, sobald ein Spieler <strong>100 Punkte</strong> erreicht. Gewinner ist, wer dann die wenigsten Punkte hat.</p>
      <h3>Kartenwerte</h3>
      <p>Karten haben Werte von <strong>0 bis 13</strong> (56 Karten, je 4&times; jeder Wert).</p>
      <h3>Spielablauf</h3>
      <p>Zu Beginn siehst du 2 deiner 4 Karten. Dann reihum:</p>
      <ul>
        <li><strong>Ziehen:</strong> Nimm vom Stapel oder der Ablage</li>
        <li><strong>Tauschen:</strong> Ersetze eine deiner Karten</li>
        <li><strong>Ablegen:</strong> Wirf die gezogene Karte ab (Spezialfunktion m&ouml;glich)</li>
      </ul>
      <h3>Slammen</h3>
      <p>Vor dem Ziehen kannst du 2&ndash;4 eigene Karten mit <strong>demselben Wert</strong> gleichzeitig ablegen. Sind alle gleich, werden sie durch eine verdeckte Karte ersetzt. Falsch? Strafkarte.</p>
      <h3>Spezialkarten</h3>
      <ul>
        <li><strong>7, 8 &mdash; PEEK:</strong> Sieh dir eine eigene Karte an</li>
        <li><strong>9, 10 &mdash; SPY:</strong> Sieh dir eine Karte eines Mitspielers an</li>
        <li><strong>11, 12 &mdash; SWAP:</strong> Tausche blind eine Karte mit einem Mitspieler</li>
        <li><strong>13:</strong> Hoher Wert, keine Spezialfunktion</li>
      </ul>
      <h3>Cabo rufen</h3>
      <p>Glaube, die niedrigste Summe zu haben? Ruf <strong>CABO</strong>. Jeder andere hat noch einen Zug. Liegst du falsch: +10 Strafpunkte!</p>
    `,
  },
  en: {
    tagline: 'A card game from Biberach',
    namePlaceholder: 'Your Name',
    createRoom: 'Create Room',
    or: 'or',
    roomCodePlaceholder: 'Room Code',
    join: 'Join',
    shareCode: 'Share the code with your friends',
    addBot: 'Add Bot',
    startGame: 'Start Game',
    waitingHost: 'Waiting for host...',
    waitingPlayers: 'Waiting for players or add bots...',
    hostBadge: 'Host',
    enterName: 'Please enter a name',
    enterCode: 'Please enter a room code',
    noBotsLeft: 'No more bot names available',
    connError: 'Connection error. Please try again.',
    roomNotFound: 'Room not found',
    connLost: 'Lost connection to host',
    scoresTitle: 'Scores',
    roundHistory: 'Round',
    totalCol: '\u03a3',
    deckLabel: 'Deck',
    discardLabel: 'Discard',
    emptyPile: 'Empty',
    rulesTitle: 'Rules',
    room: (c) => `Room: ${c}`,
    roundN: (n) => `Round ${n}`,
    drawn: 'Drawn:',
    fromDiscard: 'From discard:',
    peekN: (n) => `Look at ${n} of your cards`,
    waitOthers: 'Waiting for other players\u2026',
    turnOf: (name) => `${name}'s turn`,
    lastRound: ' (last round!)',
    yourTurn: 'Your turn',
    lastRoundBang: ' \u2014 Last round!',
    selectSlam: (n) => `Select cards to slam (${n} selected)`,
    slam: 'Slam',
    doSlam: 'Slam!',
    cancelSlam: 'Cancel',
    drawDeck: 'Draw',
    drawDiscard: 'Take from discard',
    discardCard: 'Discard',
    swapOrDiscard: 'Swap or discard?',
    whichCard: 'Which card to replace?',
    peekMsg: 'PEEK \u2014 Tap one of your cards',
    spyMsg: 'SPY \u2014 Tap an opponent\'s card',
    swapOwnMsg: 'SWAP \u2014 Tap one of your cards',
    swapOppMsg: 'SWAP \u2014 Tap an opponent\'s card',
    kingPeekMsg: 'KING \u2014 Look at one of your own cards',
    kingSpyMsg: 'KING \u2014 Look at an opponent\'s card',
    kingSwapMsg: 'KING \u2014 Swap the cards?',
    doSwap: 'Swap',
    keepCard: 'Keep',
    skipPower: 'Skip',
    roundOver: 'Round over!',
    gameOverTitle: 'Game over!',
    gameWinner: (name) => `\u{1F3C6} ${name} wins!`,
    penalty: '+10 penalty (Cabo missed)',
    roundPoints: (n) => `Round: +${n}`,
    totalPoints: (n) => `Total: ${n}`,
    nextRound: 'Next Round',
    backLobby: 'Back to Lobby',
    waitHost: 'Waiting for host\u2026',
    cardSwapped: (n) => `Card ${n} was swapped!`,
    slamSuccess: (name, n) => `${name} slammed ${n} card(s)!`,
    slamFail: (name) => `${name}: Wrong card! Penalty drawn.`,
    disconnected: (name) => `${name} left the game`,
    bubbleDraw: 'draws from deck',
    bubbleDrawDiscard: 'takes discard',
    bubbleDiscard: 'discards',
    bubbleDiscardPower: (p) => `discard → ${p}!`,
    bubbleSwapDrawn: (n) => `swaps pos. ${n}`,
    bubbleSkip: 'skips power',
    bubblePeek: 'peeks own card',
    bubbleSpy: (target) => `spied ${target}`,
    bubbleSwap: (target) => `swapped with ${target}`,
    bubbleSlamOk: (n) => `slammed ${n}!`,
    bubbleSlamFail: 'wrong card!',
    yourCardN: (n) => `Your card ${n}`,
    theirCardN: (name, n) => `${name}'s card ${n}`,
    rulesBody: `
      <h3>Goal</h3>
      <p>Have the lowest sum of card values. A game ends when any player reaches <strong>100 points</strong>. The player with the fewest points wins.</p>
      <h3>Card Values</h3>
      <p>Cards have values from <strong>0 to 13</strong> (56 cards, 4 of each value).</p>
      <h3>Turn Structure</h3>
      <p>At the start you peek at 2 of your 4 cards. Then each turn:</p>
      <ul>
        <li><strong>Draw:</strong> Take from the deck or discard pile</li>
        <li><strong>Swap:</strong> Replace one of your cards with the drawn card</li>
        <li><strong>Discard:</strong> Discard the drawn card (may trigger a power)</li>
      </ul>
      <h3>Slamming</h3>
      <p>Before drawing, you can slam 2&ndash;4 of your own cards that all have the <strong>same value</strong>. If they all match, they are replaced by one face-down card. Wrong? Draw a penalty card.</p>
      <h3>Power Cards</h3>
      <ul>
        <li><strong>7, 8 &mdash; PEEK:</strong> Look at one of your own cards</li>
        <li><strong>9, 10 &mdash; SPY:</strong> Look at an opponent's card</li>
        <li><strong>11, 12 &mdash; SWAP:</strong> Blindly swap a card with an opponent</li>
        <li><strong>13:</strong> High value, no special ability</li>
      </ul>
      <h3>Calling Cabo</h3>
      <p>Think you have the lowest total? Call <strong>CABO</strong>. Everyone else gets one more turn. Wrong call: +10 penalty!</p>
    `,
  }
};

let lang = localStorage.getItem('cabo-lang') || 'de';

function t(key, ...args) {
  const val = TRANSLATIONS[lang][key];
  if (typeof val === 'function') return val(...args);
  return val !== undefined ? val : key;
}

function applyLanguage() {
  // Update both lang toggles
  const other = lang === 'de' ? 'en' : 'de';
  const hdr = $('lang-toggle');
  if (hdr) hdr.textContent = lang.toUpperCase();
  const lby = $('lang-toggle-lobby');
  if (lby) lby.textContent = `${lang.toUpperCase()} / ${other.toUpperCase()}`;

  // Update all data-i18n elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });

  // Update placeholder attributes
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });

  // Update rules body
  const rulesBody = $('rules-body');
  if (rulesBody) rulesBody.innerHTML = t('rulesBody');

  // Re-render game if active
  if (gameState) renderGame();
}

function toggleLanguage() {
  lang = lang === 'de' ? 'en' : 'de';
  localStorage.setItem('cabo-lang', lang);
  applyLanguage();
}

// ===== Utilities =====
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generatePlayerId() {
  return 'p-' + Math.random().toString(36).substr(2, 9);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

let toastTimer = null;
function showToast(msg) {
  const toast = $('error-toast');
  toast.textContent = msg;
  toast.style.display = 'block';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

// ===== Card HTML Builders =====
function powerClass(value) {
  if (value === 7 || value === 8)   return 'power-peek';
  if (value === 9 || value === 10)  return 'power-spy';
  if (value === 11 || value === 12) return 'power-swap';
  return 'power-none';
}

function powerLabel(value) {
  if (value === 7 || value === 8)   return 'PEEK';
  if (value === 9 || value === 10)  return 'SPY';
  if (value === 11 || value === 12) return 'SWAP';
  return '';
}

function buildCardFace(card, extraClass) {
  const v = card.value;
  const cls = powerClass(v);
  const label = powerLabel(v);
  const extra = extraClass || '';
  if (label) {
    return `<div class="card card-face ${cls} ${extra}">
      <span class="card-corner">${v}</span>
      <span class="card-name">${label}</span>
    </div>`;
  }
  return `<div class="card card-face ${cls} ${extra}">
    <span class="card-num">${v}</span>
  </div>`;
}

function buildCardBack(extraClass) {
  return `<div class="card card-back ${extraClass || ''}">
    <div class="card-back-design"><div class="card-back-border"><div class="card-back-pattern">\u{1F9AB}</div></div></div>
  </div>`;
}

// ===== Network: Send action to host =====
function sendAction(action, data) {
  if (isHost) handleActionOnHost(myPlayerId, action, data || {});
  else if (hostConn && hostConn.open) hostConn.send({ type: 'action', action, data: data || {} });
}

// ===== Host: Process action and broadcast =====
function handleActionOnHost(playerId, action, data) {
  if (!game) return;
  let result = null;

  switch (action) {
    case 'peek-card':             result = game.peekCard(playerId, data.cardIndex); break;
    case 'draw-deck':             result = game.drawDeck(playerId); break;
    case 'draw-discard':          result = game.drawDiscard(playerId); break;
    case 'swap-card':             result = game.swapCard(playerId, data.cardIndex); break;
    case 'discard-drawn':         result = game.discardDrawn(playerId); break;
    case 'use-power':             result = game.usePower(playerId, data.targetPlayerIndex, data.targetCardIndex); break;
    case 'skip-power':            result = game.skipPower(playerId); break;
    case 'slam-cards':            result = game.slamCards(playerId, data.cardIndices); break;
    case 'call-cabo':             result = game.callCabo(playerId); break;
    case 'play-again':            result = game.playAgain(); break;
    case 'back-to-lobby':         result = game.backToLobby(); break;
  }

  if (!result) return;

  if (result.events) {
    for (const evt of result.events) {
      if (evt.target === 'all') broadcastEvent(evt.type, evt.data);
      else sendEventToPlayer(evt.target, evt.type, evt.data);
    }
  }

  if (result.broadcast || result.ok) broadcastGameState();
}

function broadcastGameState() {
  if (!game) return;
  for (const player of game.players) {
    const state = game.getStateForPlayer(player.id);
    state.roomCode = roomCode;
    state.isHost = player.id === myPlayerId;

    if (player.id === myPlayerId) {
      gameState = state;
      renderFromState();
    } else {
      const entry = Object.entries(playerPeerMap).find(([, pid]) => pid === player.id);
      if (entry) {
        const conn = guestConns[entry[0]];
        if (conn && conn.open) conn.send({ type: 'game-state', state });
      }
    }
  }
}

function broadcastEvent(evtType, data) {
  handleEvent(evtType, data);
  for (const peerId of Object.keys(guestConns)) {
    const conn = guestConns[peerId];
    if (conn && conn.open) conn.send({ type: 'event', evtType, data });
  }
}

function sendEventToPlayer(playerId, evtType, data) {
  if (playerId === myPlayerId) { handleEvent(evtType, data); return; }
  const entry = Object.entries(playerPeerMap).find(([, pid]) => pid === playerId);
  if (entry) {
    const conn = guestConns[entry[0]];
    if (conn && conn.open) conn.send({ type: 'event', evtType, data });
  }
}

// ===== Host: Guest connection handling =====
function onGuestConnected(conn) {
  conn.on('open', () => {
    conn.on('data', (msg) => {
      if (msg.type === 'join') {
        const guestPlayerId = generatePlayerId();
        const result = game.addPlayer(guestPlayerId, msg.name);
        if (result.error) { conn.send({ type: 'error', message: result.error }); return; }
        guestConns[conn.peer] = conn;
        playerPeerMap[conn.peer] = guestPlayerId;
        conn.send({ type: 'joined', playerId: guestPlayerId, roomCode });
        broadcastGameState();
      } else if (msg.type === 'action') {
        const playerId = playerPeerMap[conn.peer];
        if (playerId) handleActionOnHost(playerId, msg.action, msg.data || {});
      }
    });

    conn.on('close', () => {
      const playerId = playerPeerMap[conn.peer];
      if (playerId && game) {
        const player = game.players.find(p => p.id === playerId);
        const playerName = player ? player.name : 'A player';
        if (game.state !== 'lobby') {
          game.state = 'lobby';
          game.players.forEach(p => { p.score = 0; });
          game.round = 1;
          game.removePlayer(playerId);
          broadcastEvent('player-disconnected', { name: playerName });
          broadcastGameState();
        } else {
          game.removePlayer(playerId);
          broadcastGameState();
        }
      }
      delete guestConns[conn.peer];
      delete playerPeerMap[conn.peer];
    });
  });
}

// ===== Events =====
function handleEvent(evtType, data) {
  switch (evtType) {
    case 'cabo-called':
      showBubble(data.playerIndex, 'CABO!');
      showCaboBanner();
      break;
    case 'peek-result':
      showPeekOverlay(data.card, t('yourCardN', data.cardIndex + 1));
      break;
    case 'spy-result':
      if (gameState) showPeekOverlay(data.card, t('theirCardN', gameState.players[data.playerIndex].name, data.cardIndex + 1));
      break;
    case 'card-swapped':
      showToast(t('cardSwapped', data.cardIndex + 1));
      break;
    case 'draw-occurred':
      showBubble(data.actorIndex, data.source === 'deck' ? t('bubbleDraw') : t('bubbleDrawDiscard'));
      break;
    case 'peek-occurred':
      showBubble(data.actorIndex, t('bubblePeek'));
      break;
    case 'spy-occurred':
      showBubble(data.actorIndex, t('bubbleSpy', data.targetName));
      break;
    case 'swap-occurred':
      animateSwap(data.actorIndex, data.actorCard, data.targetIndex, data.targetCard);
      showBubble(data.actorIndex, t('bubbleSwap', data.targetName));
      break;
    case 'swap-drawn':
      showBubble(data.actorIndex, t('bubbleSwapDrawn', data.pos));
      break;
    case 'discard-drawn':
      showBubble(data.actorIndex, data.power ? t('bubbleDiscardPower', data.power.toUpperCase()) : t('bubbleDiscard'));
      break;
    case 'skip-power':
      showBubble(data.actorIndex, t('bubbleSkip'));
      break;
    case 'slam-success':
      showBubble(data.playerIndex, t('bubbleSlamOk', data.count));
      showToast(t('slamSuccess', data.playerName, data.count));
      if (data.cards && data.cards.length) showSlamOverlay(data.cards, true);
      break;
    case 'slam-fail':
      showBubble(data.playerIndex, t('bubbleSlamFail'));
      showToast(t('slamFail', data.playerName));
      if (data.cards && data.cards.length) showSlamOverlay(data.cards, false);
      break;
    case 'player-disconnected':
      showToast(t('disconnected', data.name));
      break;
  }
}

function showCaboBanner() {
  const banner = $('cabo-banner');
  banner.style.display = 'block';
  banner.style.animation = 'none';
  banner.offsetHeight;
  banner.style.animation = '';
  setTimeout(() => { banner.style.display = 'none'; }, 2200);
}

function showPeekOverlay(card, label) {
  const revealEl = $('deck-reveal');
  const v = card.value;
  const lbl = powerLabel(v);
  revealEl.className = `card card-face ${powerClass(v)}`;
  revealEl.innerHTML = lbl
    ? `<span class="card-corner">${v}</span><span class="card-name">${lbl}</span>`
    : `<span class="card-num">${v}</span>`;
  revealEl.style.display = 'block';
  revealEl.title = label;
  if (peekTimeout) clearTimeout(peekTimeout);
  peekTimeout = setTimeout(() => { peekTimeout = null; revealEl.style.display = 'none'; }, 3000);
}

// ===== Swap Animation =====
function getCardElement(playerIndex, cardIndex) {
  if (!gameState) return null;
  if (playerIndex === gameState.myIndex) {
    return document.querySelectorAll('#my-cards .card')[cardIndex] || null;
  }
  const seat = document.querySelector(`#game-table .seat[data-player-index="${playerIndex}"]`);
  if (!seat) return null;
  return seat.querySelectorAll('.seat-cards .card')[cardIndex] || null;
}

function animateSwap(actorIndex, actorCardPos, targetIndex, targetCardPos) {
  const elA = getCardElement(actorIndex, actorCardPos - 1);
  const elB = getCardElement(targetIndex, targetCardPos - 1);
  if (!elA || !elB) return;

  const rA = elA.getBoundingClientRect();
  const rB = elB.getBoundingClientRect();

  function makeGhost(rect) {
    const g = document.createElement('div');
    g.className = 'card card-back swap-ghost';
    g.style.cssText = [
      `position:fixed`,
      `left:${rect.left}px`,
      `top:${rect.top}px`,
      `width:${rect.width}px`,
      `height:${rect.height}px`,
      `z-index:200`,
      `pointer-events:none`,
      `margin:0`,
    ].join(';');
    g.innerHTML = '<div class="card-back-design"><div class="card-back-border"></div></div>';
    document.body.appendChild(g);
    return g;
  }

  const ghostA = makeGhost(rA);
  const ghostB = makeGhost(rB);

  // Two rAFs: first ensures elements are painted, second kicks off transition
  requestAnimationFrame(() => requestAnimationFrame(() => {
    ghostA.style.transition = 'transform 0.35s ease, opacity 0.1s ease 0.32s';
    ghostB.style.transition = 'transform 0.35s ease, opacity 0.1s ease 0.32s';
    ghostA.style.transform = `translate(${rB.left - rA.left}px, ${rB.top - rA.top}px)`;
    ghostB.style.transform = `translate(${rA.left - rB.left}px, ${rA.top - rB.top}px)`;
    ghostA.style.opacity = '0';
    ghostB.style.opacity = '0';
  }));

  setTimeout(() => { ghostA.remove(); ghostB.remove(); }, 480);
}

function showSlamOverlay(cards, success) {
  const overlay = $('slam-overlay');
  const title = $('slam-result-title');
  const cardsEl = $('slam-result-cards');
  title.textContent = success ? 'SLAM!' : 'MISS!';
  title.style.color = success ? 'var(--gold)' : 'var(--red-l)';
  cardsEl.innerHTML = cards.map(c => buildCardFace(c, 'card-small')).join('');
  overlay.style.display = 'flex';
  setTimeout(() => { overlay.style.display = 'none'; }, 1800);
}

function showBubble(playerIndex, text) {
  if (playerIndex == null || !gameState) return;
  let bubbleEl = null;
  if (playerIndex === gameState.myIndex) {
    bubbleEl = document.querySelector('#my-area .bubble');
  } else {
    const seat = document.querySelector(`#game-table .seat[data-player-index="${playerIndex}"]`);
    if (seat) bubbleEl = seat.querySelector('.bubble');
  }
  if (!bubbleEl) return;
  bubbleEl.textContent = text;
  bubbleEl.style.display = 'block';
  bubbleEl.style.animation = 'none';
  void bubbleEl.offsetHeight; // reflow to restart animation
  bubbleEl.style.animation = '';
  clearTimeout(bubbleEl._hideTimer);
  bubbleEl._hideTimer = setTimeout(() => { bubbleEl.style.display = 'none'; }, 3600);
}

// ===== Lobby UI Events =====
$('create-btn').addEventListener('click', () => {
  myName = $('player-name').value.trim();
  if (!myName) return showToast(t('enterName'));
  createRoom();
});

$('join-btn').addEventListener('click', () => {
  myName = $('player-name').value.trim();
  const code = $('room-code-input').value.trim().toUpperCase();
  if (!myName) return showToast(t('enterName'));
  if (!code) return showToast(t('enterCode'));
  joinRoom(code);
});

$('start-btn').addEventListener('click', () => {
  if (!isHost || !game) return;
  const result = game.startRound();
  if (result.error) return showToast(result.error);
  initBotMemory();
  broadcastGameState();
  scheduleBotTurn();
});

$('add-bot-btn').addEventListener('click', () => {
  if (!isHost || !game) return;
  const available = BOT_NAMES.filter(n => !game.players.find(p => p.name === n));
  if (available.length === 0) return showToast(t('noBotsLeft'));
  const result = game.addBot(available[0]);
  if (result.error) return showToast(result.error);
  botIds.push(result.botId);
  broadcastGameState();
});

$('player-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('create-btn').click(); });
$('room-code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('join-btn').click(); });
$('room-code-input').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });

$('rules-btn').addEventListener('click', () => { $('rules-overlay').style.display = 'flex'; });
$('rules-close').addEventListener('click', () => { $('rules-overlay').style.display = 'none'; });
$('rules-overlay').addEventListener('click', (e) => {
  if (e.target === $('rules-overlay')) $('rules-overlay').style.display = 'none';
});

$('scores-toggle').addEventListener('click', () => {
  const panel = $('scores-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});

$('lang-toggle').addEventListener('click', toggleLanguage);
$('lang-toggle-lobby').addEventListener('click', toggleLanguage);

// ===== Create Room (Host) =====
function createRoom() {
  roomCode = generateRoomCode();
  isHost = true;
  myPlayerId = generatePlayerId();
  game = new CaboGame();
  game.addPlayer(myPlayerId, myName);

  peer = new Peer(PEER_PREFIX + roomCode, {
    debug: 0,
    config: { iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]}
  });

  peer.on('open', () => {
    $('join-create').style.display = 'none';
    $('waiting-room').style.display = 'block';
    $('room-code-display').textContent = roomCode;
    broadcastGameState();
  });

  peer.on('connection', onGuestConnected);

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') { roomCode = generateRoomCode(); peer.destroy(); createRoom(); }
    else { console.error('PeerJS error:', err); showToast(t('connError')); }
  });
}

// ===== Join Room (Guest) =====
function joinRoom(code) {
  roomCode = code;
  isHost = false;

  peer = new Peer(undefined, {
    debug: 0,
    config: { iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]}
  });

  peer.on('open', () => {
    hostConn = peer.connect(PEER_PREFIX + code, { reliable: true });
    hostConn.on('open', () => { hostConn.send({ type: 'join', name: myName }); });
    hostConn.on('data', (msg) => {
      if (msg.type === 'joined') {
        myPlayerId = msg.playerId;
        roomCode = msg.roomCode;
        $('join-create').style.display = 'none';
        $('waiting-room').style.display = 'block';
        $('room-code-display').textContent = roomCode;
      } else if (msg.type === 'game-state') {
        msg.state.roomCode = roomCode;
        msg.state.isHost = false;
        gameState = msg.state;
        renderFromState();
      } else if (msg.type === 'event') {
        handleEvent(msg.evtType, msg.data);
      } else if (msg.type === 'error') {
        showToast(msg.message);
      }
    });
    hostConn.on('close', () => {
      showToast(t('connLost'));
      showScreen('lobby-screen');
      $('join-create').style.display = 'block';
      $('waiting-room').style.display = 'none';
    });
    hostConn.on('error', () => { showToast(t('connError')); });
  });

  peer.on('error', (err) => {
    if (err.type === 'peer-unavailable') showToast(t('roomNotFound'));
    else { console.error('PeerJS error:', err); showToast(t('connError')); }
  });
}

// ===== Render from State =====
function renderFromState() {
  if (!gameState) return;
  if (gameState.turnPhase !== 'start') { slamMode = false; slamSelection = []; }
  if (gameState.state === 'lobby') { showScreen('lobby-screen'); renderLobby(); }
  else { showScreen('game-screen'); renderGame(); }
}

// ===== Render Lobby =====
function renderLobby() {
  if (!gameState) return;
  $('join-create').style.display = 'none';
  $('waiting-room').style.display = 'block';
  $('room-code-display').textContent = roomCode;

  const list = $('player-list');
  list.innerHTML = gameState.players.map((p, i) => {
    const hostBadge = i === 0 ? `<span class="host-badge">${t('hostBadge')}</span>` : '';
    const botBadge = p.isBot ? '<span class="host-badge">Bot</span>' : '';
    const meTag = p.isMe ? ' (Du)' : '';
    return `<li><span>${p.name}${meTag}</span>${botBadge}${hostBadge}</li>`;
  }).join('');

  if (isHost) {
    $('lobby-actions').style.display = 'flex';
    $('lobby-actions').style.gap = '0.5rem';
    $('lobby-actions').style.justifyContent = 'center';
    $('start-btn').style.display = gameState.players.length >= 2 ? 'block' : 'none';
    $('add-bot-btn').style.display = gameState.players.length < 4 ? 'block' : 'none';
    $('waiting-msg').style.display = gameState.players.length < 2 ? 'block' : 'none';
    $('waiting-msg').textContent = t('waitingPlayers');
  } else {
    $('lobby-actions').style.display = 'none';
    $('waiting-msg').textContent = t('waitingHost');
    $('waiting-msg').style.display = 'block';
  }
}

// ===== Render Game =====
function renderGame() {
  if (!gameState) return;
  renderHeader();
  renderOpponents();
  renderTableCenter();
  renderDrawnCard();
  renderMyCards();
  renderActiveSeat();
  renderStatus();
  renderReveal();
}

function renderHeader() {
  $('room-info').textContent = t('room', gameState.roomCode);
  $('round-info').textContent = t('roundN', gameState.round);

  // Score history table
  const history = gameState.scoreHistory || [];
  const players = gameState.players;
  const numRounds = history.length;

  let tableHTML = `<table class="score-table"><thead><tr>
    <th></th>
    ${history.map((_, i) => `<th>${t('roundHistory')} ${i + 1}</th>`).join('')}
    <th class="col-total">${t('totalCol')}</th>
  </tr></thead><tbody>`;

  tableHTML += players.map(p => {
    const total = p.score;
    const over = total >= 100 ? ' over-100' : '';
    const meClass = p.isMe ? ' me' : '';
    return `<tr class="${meClass}">
      <td>${p.name}</td>
      ${history.map((round, i) => `<td>${round[players.indexOf(p)]}</td>`).join('')}
      <td class="col-total${over}">${total}</td>
    </tr>`;
  }).join('');

  tableHTML += '</tbody></table>';
  $('scores-list').innerHTML = tableHTML;
}

// ===== Render Opponents =====
function getSeatPositionClass(seatIndex, totalOpponents) {
  if (totalOpponents === 1) return 'seat-pos-top';
  if (totalOpponents === 2) return seatIndex === 0 ? 'seat-pos-left' : 'seat-pos-right';
  // 3 opponents: left, top, right
  if (seatIndex === 0) return 'seat-pos-left';
  if (seatIndex === 1) return 'seat-pos-top';
  return 'seat-pos-right';
}

function renderOpponents() {
  const table = $('game-table');
  // Remove previously injected seats
  table.querySelectorAll('.seat').forEach(el => el.remove());

  const opponents = gameState.players.filter(p => !p.isMe);

  opponents.forEach((p, seatIndex) => {
    const pIndex = gameState.players.indexOf(p);
    const isActive = pIndex === gameState.currentPlayerIndex && gameState.state === 'playing';
    const isCabo = pIndex === gameState.caboCallerIndex;
    const caboTag = isCabo ? '<span class="cabo-tag">CABO</span>' : '';
    const botTag = p.isBot ? ' \u{1F9AB}' : '';
    const posClass = getSeatPositionClass(seatIndex, opponents.length);

    const cards = p.cards.map((card, j) => {
      const extra = getOpponentCardExtra(pIndex, j);
      return card.faceUp ? buildCardFace(card, 'card-small' + extra) : buildCardBack('card-small' + extra);
    }).join('');

    const seatEl = document.createElement('div');
    seatEl.className = `seat ${posClass}${isActive ? ' active-seat' : ''}`;
    seatEl.dataset.playerIndex = pIndex;
    seatEl.innerHTML = `
      <div class="seat-name ${isActive ? 'active-turn' : ''}">${p.name}${botTag}${caboTag}</div>
      <div class="seat-cards">${cards}</div>
      <div class="bubble" style="display:none"></div>
    `;

    seatEl.querySelectorAll('.card[data-player-index]').forEach(el => {
      el.addEventListener('click', () => {
        onOpponentCardClick(parseInt(el.dataset.playerIndex), parseInt(el.dataset.cardIndex));
      });
    });

    table.appendChild(seatEl);
  });
}

function getOpponentCardExtra(playerIndex, cardIndex) {
  if (!gameState.powerState || gameState.state !== 'playing') return '';
  const power = gameState.powerState;
  const attrs = ` clickable card-highlight" data-player-index="${playerIndex}" data-card-index="${cardIndex}`;
  if (power.type === 'spy' && power.step === 'select_target') return attrs;
  if (power.type === 'swap' && power.step === 'select_opponent') return attrs;
  return '';
}

function renderTableCenter() {
  const deckEl = $('deck');
  $('deck-count').textContent = gameState.deckCount;

  const isMyTurn = gameState.myIndex === gameState.currentPlayerIndex;
  const canDraw = isMyTurn && gameState.turnPhase === 'start' && gameState.state === 'playing';

  deckEl.classList.toggle('clickable', canDraw);
  deckEl.classList.toggle('card-highlight', canDraw);
  deckEl.onclick = canDraw ? () => sendAction('draw-deck') : null;

  const discardEl = $('discard');
  if (gameState.discardTop) {
    const card = gameState.discardTop;
    const lbl = powerLabel(card.value);
    discardEl.className = `card card-face ${powerClass(card.value)}`;
    if (lbl) {
      discardEl.innerHTML = `<span class="card-corner">${card.value}</span><span class="card-name">${lbl}</span>`;
    } else {
      discardEl.innerHTML = `<span class="card-num">${card.value}</span>`;
    }
    discardEl.classList.toggle('clickable', canDraw);
    discardEl.classList.toggle('card-highlight', canDraw);
    discardEl.onclick = canDraw ? () => sendAction('draw-discard') : null;
  } else {
    discardEl.className = 'card empty-pile';
    discardEl.innerHTML = `<span class="empty-label">${t('emptyPile')}</span>`;
    discardEl.onclick = null;
  }
}

function renderDrawnCard() {
  const revealEl = $('deck-reveal');

  // A peek/spy result is being shown — don't touch deck-reveal
  if (peekTimeout) return;

  const isMyTurn = gameState.myIndex === gameState.currentPlayerIndex;

  if (!gameState.drawnCard || !isMyTurn ||
      (gameState.turnPhase !== 'drawn' && gameState.turnPhase !== 'discard_swap')) {
    revealEl.style.display = 'none';
    return;
  }

  const card = gameState.drawnCard;
  const lbl = powerLabel(card.value);
  revealEl.className = `card card-face ${powerClass(card.value)}`;
  revealEl.innerHTML = lbl
    ? `<span class="card-corner">${card.value}</span><span class="card-name">${lbl}</span>`
    : `<span class="card-num">${card.value}</span>`;
  revealEl.style.display = 'block';
}

function renderMyCards() {
  const me = gameState.players.find(p => p.isMe);
  if (!me) return;

  const isCabo = gameState.players.indexOf(me) === gameState.caboCallerIndex;
  $('my-name-tag').innerHTML = me.name + (isCabo ? ' <span style="color:#a94e4e">CABO</span>' : '');

  const container = $('my-cards');
  container.innerHTML = me.cards.map((card, i) => {
    const canClick = getMyCardClickable(i);
    const highlight = canClick ? ' card-highlight' : '';
    const selected = isMyCardSelected(i) ? ' card-selected' : '';
    const clickCls = canClick ? ' clickable' : '';

    if (card.faceUp) {
      const lbl = powerLabel(card.value);
      const inner = lbl
        ? `<span class="card-corner">${card.value}</span><span class="card-name">${lbl}</span>`
        : `<span class="card-num">${card.value}</span>`;
      return `<div class="card card-face ${powerClass(card.value)}${highlight}${selected}${clickCls}" data-index="${i}">${inner}</div>`;
    }
    return `<div class="card card-back${highlight}${selected}${clickCls}" data-index="${i}">
      <div class="card-back-design"><div class="card-back-border"><div class="card-back-pattern">\u{1F9AB}</div></div></div>
    </div>`;
  }).join('');

  container.querySelectorAll('.clickable').forEach(el => {
    el.addEventListener('click', () => onMyCardClick(parseInt(el.dataset.index)));
  });
}

function renderActiveSeat() {
  const myArea = $('my-area');
  if (!myArea) return;
  myArea.classList.toggle('active-turn',
    gameState.myIndex === gameState.currentPlayerIndex && gameState.state === 'playing');
}

function getMyCardClickable(cardIndex) {
  if (!gameState) return false;
  const isMyTurn = gameState.myIndex === gameState.currentPlayerIndex;

  if (gameState.state === 'peeking') {
    const me = gameState.players.find(p => p.isMe);
    return gameState.peeksLeft > 0 && !me.cards[cardIndex].faceUp;
  }
  if (!isMyTurn) return false;
  if (slamMode) return true;
  if (gameState.turnPhase === 'drawn' || gameState.turnPhase === 'discard_swap') return true;
  if (gameState.powerState && gameState.powerState.type === 'peek') return true;
  if (gameState.powerState && gameState.powerState.type === 'swap' && gameState.powerState.step === 'select_own') return true;
  return false;
}

function isMyCardSelected(cardIndex) {
  if (slamMode) return slamSelection.includes(cardIndex);
  if (!gameState || !gameState.powerState) return false;
  return gameState.powerState.type === 'swap' &&
    gameState.powerState.step === 'select_opponent' &&
    gameState.powerState.selectedCard === cardIndex;
}

function onMyCardClick(cardIndex) {
  if (!gameState) return;

  if (gameState.state === 'peeking') { sendAction('peek-card', { cardIndex }); return; }
  if (slamMode) {
    const idx = slamSelection.indexOf(cardIndex);
    if (idx >= 0) slamSelection.splice(idx, 1);
    else slamSelection.push(cardIndex);
    renderMyCards(); renderStatus();
    return;
  }
  if (gameState.turnPhase === 'drawn' || gameState.turnPhase === 'discard_swap') {
    $('deck-reveal').style.display = 'none';
    sendAction('swap-card', { cardIndex });
    return;
  }
  if (gameState.powerState && gameState.powerState.type === 'peek') { sendAction('use-power', { targetPlayerIndex: gameState.myIndex, targetCardIndex: cardIndex }); return; }
  if (gameState.powerState && gameState.powerState.type === 'swap' && gameState.powerState.step === 'select_own') { sendAction('use-power', { targetPlayerIndex: gameState.myIndex, targetCardIndex: cardIndex }); return; }
}

function onOpponentCardClick(playerIndex, cardIndex) {
  if (!gameState || !gameState.powerState) return;
  const power = gameState.powerState;
  if (power.type === 'spy' || (power.type === 'swap' && power.step === 'select_opponent')) {
    sendAction('use-power', { targetPlayerIndex: playerIndex, targetCardIndex: cardIndex });
  }
}

function renderStatus() {
  const msg = $('status-message');
  const btns = $('action-buttons');
  const isMyTurn = gameState.myIndex === gameState.currentPlayerIndex;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  btns.innerHTML = '';

  if (gameState.state === 'peeking') {
    msg.textContent = gameState.peeksLeft > 0 ? t('peekN', gameState.peeksLeft) : t('waitOthers');
    return;
  }
  if (gameState.state === 'reveal') { msg.textContent = ''; return; }

  if (!isMyTurn) {
    msg.textContent = t('turnOf', currentPlayer.name) + (gameState.caboCallerIndex !== null ? t('lastRound') : '');
    return;
  }

  if (gameState.turnPhase === 'start') {
    if (slamMode) {
      msg.textContent = t('selectSlam', slamSelection.length);
      btns.innerHTML = `
        <button class="btn btn-primary btn-small" id="btn-slam-confirm" ${slamSelection.length < 2 ? 'disabled' : ''}>${t('doSlam')}</button>
        <button class="btn btn-secondary btn-small" id="btn-slam-cancel">${t('cancelSlam')}</button>
      `;
      $('btn-slam-confirm').addEventListener('click', () => {
        if (slamSelection.length > 0) { sendAction('slam-cards', { cardIndices: [...slamSelection] }); slamMode = false; slamSelection = []; }
      });
      $('btn-slam-cancel').addEventListener('click', () => { slamMode = false; slamSelection = []; renderMyCards(); renderStatus(); });
      return;
    }

    msg.textContent = t('yourTurn') + (gameState.caboCallerIndex !== null ? t('lastRoundBang') : '');
    // Build all start-phase buttons in one innerHTML write — += destroys previous listeners
    const startBtns = [];
    startBtns.push({ id: 'btn-slam', cls: 'btn-secondary', text: t('slam'),
      fn: () => { slamMode = true; slamSelection = []; renderMyCards(); renderStatus(); } });
    if (gameState.caboCallerIndex === null) {
      startBtns.push({ id: 'btn-cabo', cls: 'btn-danger', text: 'CABO!',
        fn: () => sendAction('call-cabo') });
    }
    startBtns.push({ id: 'btn-draw-deck', cls: 'btn-primary', text: t('drawDeck'),
      fn: () => sendAction('draw-deck') });
    if (gameState.discardTop) {
      startBtns.push({ id: 'btn-draw-discard', cls: 'btn-secondary', text: t('drawDiscard'),
        fn: () => sendAction('draw-discard') });
    }
    btns.innerHTML = startBtns.map(b =>
      `<button class="btn ${b.cls} btn-small" id="${b.id}">${b.text}</button>`
    ).join('');
    startBtns.forEach(b => $(b.id).addEventListener('click', b.fn));

  } else if (gameState.turnPhase === 'drawn') {
    msg.textContent = t('swapOrDiscard');
    btns.innerHTML = `<button class="btn btn-secondary btn-small" id="btn-discard">${t('discardCard')}</button>`;
    $('btn-discard').addEventListener('click', () => {
      $('deck-reveal').style.display = 'none';
      sendAction('discard-drawn');
    });

  } else if (gameState.turnPhase === 'discard_swap') {
    msg.textContent = t('whichCard');

  } else if (gameState.turnPhase === 'power') {
    const power = gameState.powerState;
    if (power.type === 'peek') msg.textContent = t('peekMsg');
    else if (power.type === 'spy') msg.textContent = t('spyMsg');
    else if (power.type === 'swap') msg.textContent = power.step === 'select_own' ? t('swapOwnMsg') : t('swapOppMsg');
    btns.innerHTML = `<button class="btn btn-secondary btn-small" id="btn-skip-power">${t('skipPower')}</button>`;
    $('btn-skip-power').addEventListener('click', () => sendAction('skip-power'));
  }
}

// ===== Reveal + Game Over =====
function renderReveal() {
  const overlay = $('reveal-overlay');
  if (gameState.state !== 'reveal') { overlay.style.display = 'none'; return; }
  overlay.style.display = 'flex';

  const roundScores = gameState.roundScores || [];
  const isGameOver = gameState.gameOver;
  const actualLowest = Math.min(...gameState.players.map(p => p.score));

  // Title
  $('reveal-title').textContent = isGameOver ? t('gameOverTitle') : t('roundOver');

  // Winner banner for game over
  let bannerHtml = '';
  if (isGameOver) {
    const winner = gameState.players.reduce((best, p) => p.score < best.score ? p : best);
    bannerHtml = `<div class="reveal-winner-banner">${t('gameWinner', winner.name)}</div>`;
  }

  // Per-player cards
  const playersHtml = gameState.players.map((p, i) => {
    const isCaller = i === gameState.caboCallerIndex;
    const roundScore = roundScores[i] ?? 0;
    const rawHandScore = p.cards.reduce((sum, c) => sum + (c.value || 0), 0);
    const penalty = isCaller && roundScore > rawHandScore ? 10 : 0;
    const isOverall = p.score === actualLowest;
    const nameClass = isOverall ? 'winner' : (isCaller ? 'cabo-caller' : '');
    const cards = p.cards.map(c => buildCardFace(c, 'card-small')).join('');
    const penaltyHtml = penalty > 0 ? `<div class="reveal-penalty">${t('penalty')}</div>` : '';

    return `<div class="reveal-player">
      <div class="reveal-player-header">
        <span class="reveal-player-name ${nameClass}">${p.name}${isOverall && isGameOver ? ' \u{1F3C6}' : ''} ${isCaller ? '(Cabo)' : ''}</span>
        <span class="reveal-player-score">${t('roundPoints', roundScore)}</span>
      </div>
      <div class="reveal-cards">${cards}</div>
      ${penaltyHtml}
      <div class="reveal-total-score${p.score >= 100 ? ' over-100' : ''}">${t('totalPoints', p.score)}</div>
    </div>`;
  }).join('');

  $('reveal-results').innerHTML = bannerHtml + playersHtml;

  const revealBtns = $('reveal-buttons');
  if (isHost) {
    if (isGameOver) {
      revealBtns.innerHTML = `<button class="btn btn-primary btn-small" id="btn-back-lobby">${t('backLobby')}</button>`;
      $('btn-back-lobby').addEventListener('click', () => sendAction('back-to-lobby'));
    } else {
      revealBtns.innerHTML = `
        <button class="btn btn-primary btn-small" id="btn-next-round">${t('nextRound')}</button>
        <button class="btn btn-secondary btn-small" id="btn-back-lobby">${t('backLobby')}</button>
      `;
      $('btn-next-round').addEventListener('click', () => sendAction('play-again'));
      $('btn-back-lobby').addEventListener('click', () => sendAction('back-to-lobby'));
    }
  } else {
    revealBtns.innerHTML = `<p style="color:var(--text-dim);font-size:0.85rem">${t('waitHost')}</p>`;
  }
}

// ===== Bot AI =====
function initBotMemory() {
  botMemory = {};
  for (const botId of botIds) botMemory[botId] = { ownCards: {}, opponentCards: {} };
}

function scheduleBotTurn() {
  if (!isHost || !game) return;
  if (game.state === 'peeking') {
    for (const botId of botIds) {
      const done = game.peeksDone[botId] || 0;
      if (done < 2) setTimeout(() => botPeek(botId), BOT_DELAY * (done + 1));
    }
    return;
  }
  if (game.state === 'playing') {
    const cur = game.players[game.currentPlayerIndex];
    if (cur && botIds.includes(cur.id)) setTimeout(() => botPlayTurn(cur.id), BOT_DELAY);
  }
}

function botPeek(botId) {
  if (!game || game.state !== 'peeking') return;
  const player = game.players.find(p => p.id === botId);
  if (!player) return;
  for (let i = 0; i < 4; i++) {
    if (!player.knownCards.has(i)) {
      const result = game.peekCard(botId, i);
      if (result) {
        if (botMemory[botId]) botMemory[botId].ownCards[i] = { ...player.cards[i] };
        broadcastGameState(); scheduleBotTurn(); return;
      }
    }
  }
}

function botPlayTurn(botId) {
  if (!game || game.state !== 'playing') return;
  const playerIndex = game.getPlayerIndex(botId);
  if (playerIndex !== game.currentPlayerIndex) return;

  const player = game.players[playerIndex];
  const mem = botMemory[botId] || { ownCards: {}, opponentCards: {} };
  for (const idx of player.knownCards) mem.ownCards[idx] = { ...player.cards[idx] };

  if (game.turnPhase === 'start') {
    let knownTotal = 0, unknownCount = 0;
    for (let i = 0; i < player.cards.length; i++) {
      if (mem.ownCards[i]) knownTotal += cardValue(mem.ownCards[i]);
      else unknownCount++;
    }
    if (unknownCount === 0 && knownTotal <= 6 && game.caboCallerIndex === null) {
      handleActionOnHost(botId, 'call-cabo', {}); return;
    }
    handleActionOnHost(botId, 'draw-deck', {});
    setTimeout(() => botDecideDrawn(botId), BOT_DELAY);
    return;
  }
  if (game.turnPhase === 'power') setTimeout(() => botUsePower(botId), BOT_DELAY);
}

function botDecideDrawn(botId) {
  if (!game || game.state !== 'playing') return;
  const playerIndex = game.getPlayerIndex(botId);
  if (playerIndex !== game.currentPlayerIndex || game.turnPhase !== 'drawn') return;

  const player = game.players[playerIndex];
  const mem = botMemory[botId] || { ownCards: {}, opponentCards: {} };
  const drawnValue = cardValue(game.drawnCard);

  let worstIdx = -1, worstVal = -1;
  for (let i = 0; i < player.cards.length; i++) {
    if (mem.ownCards[i]) { const v = cardValue(mem.ownCards[i]); if (v > worstVal) { worstVal = v; worstIdx = i; } }
  }
  let unknownIdx = -1;
  for (let i = 0; i < player.cards.length; i++) { if (!mem.ownCards[i]) { unknownIdx = i; break; } }

  if (worstIdx >= 0 && drawnValue < worstVal) { mem.ownCards[worstIdx] = { ...game.drawnCard }; handleActionOnHost(botId, 'swap-card', { cardIndex: worstIdx }); return; }
  if (unknownIdx >= 0 && drawnValue <= 4) { mem.ownCards[unknownIdx] = { ...game.drawnCard }; handleActionOnHost(botId, 'swap-card', { cardIndex: unknownIdx }); return; }
  handleActionOnHost(botId, 'discard-drawn', {});
}

function botUsePower(botId) {
  if (!game || game.state !== 'playing') return;
  const playerIndex = game.getPlayerIndex(botId);
  if (playerIndex !== game.currentPlayerIndex || game.turnPhase !== 'power' || !game.powerState) return;

  const player = game.players[playerIndex];
  const mem = botMemory[botId] || { ownCards: {}, opponentCards: {} };
  const power = game.powerState;

  if (power.type === 'peek') {
    for (let i = 0; i < player.cards.length; i++) {
      if (!mem.ownCards[i]) { handleActionOnHost(botId, 'use-power', { targetPlayerIndex: playerIndex, targetCardIndex: i }); mem.ownCards[i] = { ...player.cards[i] }; return; }
    }
    handleActionOnHost(botId, 'skip-power', {});

  } else if (power.type === 'spy') {
    const opponents = game.players.filter((_, i) => i !== playerIndex);
    if (opponents.length > 0) {
      const opp = opponents[Math.floor(Math.random() * opponents.length)];
      const oppIdx = game.getPlayerIndex(opp.id);
      const cardIdx = Math.floor(Math.random() * opp.cards.length);
      mem.opponentCards[`${oppIdx}_${cardIdx}`] = { ...opp.cards[cardIdx] };
      handleActionOnHost(botId, 'use-power', { targetPlayerIndex: oppIdx, targetCardIndex: cardIdx }); return;
    }
    handleActionOnHost(botId, 'skip-power', {});

  } else if (power.type === 'swap') {
    if (power.step === 'select_own') {
      let worstIdx = 0, worstVal = -2;
      for (let i = 0; i < player.cards.length; i++) {
        if (mem.ownCards[i]) { const v = cardValue(mem.ownCards[i]); if (v > worstVal) { worstVal = v; worstIdx = i; } }
      }
      if (worstVal <= 3) { handleActionOnHost(botId, 'skip-power', {}); return; }
      handleActionOnHost(botId, 'use-power', { targetPlayerIndex: playerIndex, targetCardIndex: worstIdx });
      setTimeout(() => botUsePower(botId), BOT_DELAY);
    } else if (power.step === 'select_opponent') {
      const opponents = game.players.filter((_, i) => i !== playerIndex);
      if (opponents.length > 0) {
        const opp = opponents[Math.floor(Math.random() * opponents.length)];
        const oppIdx = game.getPlayerIndex(opp.id);
        const cardIdx = Math.floor(Math.random() * opp.cards.length);
        delete mem.ownCards[power.selectedCard];
        handleActionOnHost(botId, 'use-power', { targetPlayerIndex: oppIdx, targetCardIndex: cardIdx }); return;
      }
      handleActionOnHost(botId, 'skip-power', {});
    }

  } else if (power.type === 'peek_spy_swap') {
    if (power.step === 'peek_own') {
      let targetIdx = 0;
      for (let i = 0; i < player.cards.length; i++) { if (!mem.ownCards[i]) { targetIdx = i; break; } }
      mem.ownCards[targetIdx] = { ...player.cards[targetIdx] };
      handleActionOnHost(botId, 'use-power', { targetPlayerIndex: playerIndex, targetCardIndex: targetIdx });
      setTimeout(() => botUsePower(botId), BOT_DELAY);
    } else if (power.step === 'spy_opponent') {
      const opponents = game.players.filter((_, i) => i !== playerIndex);
      if (opponents.length > 0) {
        const opp = opponents[Math.floor(Math.random() * opponents.length)];
        const oppIdx = game.getPlayerIndex(opp.id);
        const cardIdx = Math.floor(Math.random() * opp.cards.length);
        mem.opponentCards[`${oppIdx}_${cardIdx}`] = { ...opp.cards[cardIdx] };
        handleActionOnHost(botId, 'use-power', { targetPlayerIndex: oppIdx, targetCardIndex: cardIdx });
        setTimeout(() => botUsePower(botId), BOT_DELAY);
      } else { handleActionOnHost(botId, 'skip-power', {}); }
    } else if (power.step === 'decide_swap') {
      const ownVal = cardValue(player.cards[power.ownCardIndex]);
      const oppVal = cardValue(game.players[power.oppPlayerIndex].cards[power.oppCardIndex]);
      if (ownVal > oppVal) { delete mem.ownCards[power.ownCardIndex]; handleActionOnHost(botId, 'confirm-peek-spy-swap', {}); }
      else { handleActionOnHost(botId, 'skip-power', {}); }
    }
  }
}

// Hook broadcastGameState to trigger bot turns
const _origBroadcastGameState = broadcastGameState;
broadcastGameState = function() {
  _origBroadcastGameState();
  if (isHost && game) setTimeout(() => scheduleBotTurn(), 100);
};

// ===== Init =====
applyLanguage();
