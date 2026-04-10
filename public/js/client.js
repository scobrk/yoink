// ===== Cabo an der Riss — Client =====
// Uses PeerJS (WebRTC) for peer-to-peer multiplayer.
// The room creator ("host") runs the CaboGame engine in their browser.
// Other players connect to the host and send actions / receive state.

const PEER_PREFIX = 'cabo-an-der-riss-';
const SUIT_SYMBOLS = { hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660' };

let peer = null;          // PeerJS Peer instance
let isHost = false;       // Whether this browser is the host
let game = null;          // CaboGame instance (host only)
let hostConn = null;      // DataConnection to host (non-host only)
let guestConns = {};      // { peerId: DataConnection } (host only)
let playerPeerMap = {};   // { peerId: gamePlayerId } (host only)
let myPlayerId = null;    // Our unique player ID in the game
let myName = '';
let roomCode = '';
let gameState = null;
let peekTimeout = null;
let botIds = [];          // IDs of bot players (host only)
let botMemory = {};       // { botId: { ownCards: {idx: card}, opponentCards: {playerIdx_cardIdx: card} } }
const BOT_NAMES = ['Biber', 'Storch', 'Sch\u00fctze', 'Riss'];
const BOT_DELAY = 1200;

const $ = (id) => document.getElementById(id);

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

// ===== Screen Management =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

// ===== Toast =====
let toastTimer = null;
function showToast(msg) {
  const toast = $('error-toast');
  toast.textContent = msg;
  toast.style.display = 'block';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

// ===== Card HTML Builders =====
function suitColor(suit) {
  return (suit === 'hearts' || suit === 'diamonds') ? 'suit-red' : 'suit-black';
}

function buildCardFace(card, extraClass) {
  const sym = SUIT_SYMBOLS[card.suit];
  const valBadge = card.value !== undefined
    ? `<span class="card-value-badge">${card.value}</span>` : '';
  return `<div class="card card-face ${suitColor(card.suit)} ${extraClass || ''}">
    <span class="card-rank">${card.rank}</span>
    <span class="card-suit-small">${sym}</span>
    <span class="card-center-suit">${sym}</span>
    <span class="card-bottom">${card.rank}</span>
    ${valBadge}
  </div>`;
}

function buildCardBack(extraClass) {
  return `<div class="card card-back ${extraClass || ''}">
    <div class="card-back-design">
      <div class="card-back-border">
        <div class="card-back-pattern">\u{1F9AB}</div>
      </div>
    </div>
  </div>`;
}

// ===== Network: Send action to host =====
function sendAction(action, data) {
  const msg = { type: 'action', action, data: data || {} };
  if (isHost) {
    handleActionOnHost(myPlayerId, action, data || {});
  } else if (hostConn && hostConn.open) {
    hostConn.send(msg);
  }
}

// ===== Host: Process an action and broadcast =====
function handleActionOnHost(playerId, action, data) {
  if (!game) return;
  let result = null;

  switch (action) {
    case 'peek-card':
      result = game.peekCard(playerId, data.cardIndex);
      break;
    case 'draw-deck':
      result = game.drawDeck(playerId);
      break;
    case 'draw-discard':
      result = game.drawDiscard(playerId);
      break;
    case 'swap-card':
      result = game.swapCard(playerId, data.cardIndex);
      break;
    case 'discard-drawn':
      result = game.discardDrawn(playerId);
      break;
    case 'use-power':
      result = game.usePower(playerId, data.targetPlayerIndex, data.targetCardIndex);
      break;
    case 'skip-power':
      result = game.skipPower(playerId);
      break;
    case 'call-cabo':
      result = game.callCabo(playerId);
      break;
    case 'play-again':
      result = game.playAgain();
      break;
    case 'back-to-lobby':
      result = game.backToLobby();
      break;
  }

  if (!result) return;

  // Send targeted events
  if (result.events) {
    for (const evt of result.events) {
      if (evt.target === 'all') {
        broadcastEvent(evt.type, evt.data);
      } else {
        sendEventToPlayer(evt.target, evt.type, evt.data);
      }
    }
  }

  // Broadcast updated state to all players
  if (result.broadcast || result.ok) {
    broadcastGameState();
  }
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
      const peerIdEntry = Object.entries(playerPeerMap).find(([, pid]) => pid === player.id);
      if (peerIdEntry) {
        const conn = guestConns[peerIdEntry[0]];
        if (conn && conn.open) {
          conn.send({ type: 'game-state', state });
        }
      }
    }
  }
}

function broadcastEvent(evtType, data) {
  // Send to self
  handleEvent(evtType, data);
  // Send to all guests
  for (const peerId of Object.keys(guestConns)) {
    const conn = guestConns[peerId];
    if (conn && conn.open) {
      conn.send({ type: 'event', evtType, data });
    }
  }
}

function sendEventToPlayer(playerId, evtType, data) {
  if (playerId === myPlayerId) {
    handleEvent(evtType, data);
    return;
  }
  const peerIdEntry = Object.entries(playerPeerMap).find(([, pid]) => pid === playerId);
  if (peerIdEntry) {
    const conn = guestConns[peerIdEntry[0]];
    if (conn && conn.open) {
      conn.send({ type: 'event', evtType, data });
    }
  }
}

// ===== Host: Handle incoming guest connection =====
function onGuestConnected(conn) {
  conn.on('open', () => {
    conn.on('data', (msg) => {
      if (msg.type === 'join') {
        const guestPlayerId = generatePlayerId();
        const result = game.addPlayer(guestPlayerId, msg.name);
        if (result.error) {
          conn.send({ type: 'error', message: result.error });
          return;
        }
        guestConns[conn.peer] = conn;
        playerPeerMap[conn.peer] = guestPlayerId;
        conn.send({ type: 'joined', playerId: guestPlayerId, roomCode });
        broadcastGameState();
      } else if (msg.type === 'action') {
        const playerId = playerPeerMap[conn.peer];
        if (playerId) {
          handleActionOnHost(playerId, msg.action, msg.data || {});
        }
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

// ===== Event Handlers =====
function handleEvent(evtType, data) {
  switch (evtType) {
    case 'cabo-called':
      showCaboBanner();
      break;
    case 'peek-result':
      showPeekOverlay(data.card, `Deine Karte ${data.cardIndex + 1}`);
      break;
    case 'spy-result':
      if (gameState) {
        const name = gameState.players[data.playerIndex].name;
        showPeekOverlay(data.card, `${name}s Karte ${data.cardIndex + 1}`);
      }
      break;
    case 'card-swapped':
      showToast(`Karte ${data.cardIndex + 1} wurde getauscht!`);
      break;
    case 'player-disconnected':
      showToast(`${data.name} hat das Spiel verlassen`);
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
  const overlay = $('peek-overlay');
  const peekCard = $('peek-card');
  peekCard.className = `card card-large card-face ${suitColor(card.suit)}`;
  peekCard.innerHTML = `
    <span class="card-rank">${card.rank}</span>
    <span class="card-suit-small">${SUIT_SYMBOLS[card.suit]}</span>
    <span class="card-center-suit">${SUIT_SYMBOLS[card.suit]}</span>
    <span class="card-bottom">${card.rank}</span>
  `;
  $('peek-label').textContent = label;
  overlay.style.display = 'flex';

  if (peekTimeout) clearTimeout(peekTimeout);
  peekTimeout = setTimeout(() => { overlay.style.display = 'none'; }, 3000);
  overlay.onclick = () => {
    overlay.style.display = 'none';
    if (peekTimeout) clearTimeout(peekTimeout);
  };
}

// ===== Lobby UI Events =====
$('create-btn').addEventListener('click', () => {
  myName = $('player-name').value.trim();
  if (!myName) return showToast('Bitte Namen eingeben');
  createRoom();
});

$('join-btn').addEventListener('click', () => {
  myName = $('player-name').value.trim();
  const code = $('room-code-input').value.trim().toUpperCase();
  if (!myName) return showToast('Bitte Namen eingeben');
  if (!code) return showToast('Bitte Raum-Code eingeben');
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
  if (available.length === 0) return showToast('Keine Bot-Namen mehr frei');
  const name = available[0];
  const result = game.addBot(name);
  if (result.error) return showToast(result.error);
  botIds.push(result.botId);
  broadcastGameState();
});

$('player-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('create-btn').click();
});
$('room-code-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('join-btn').click();
});
$('room-code-input').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase();
});

// Rules
$('rules-btn').addEventListener('click', () => {
  $('rules-overlay').style.display = 'flex';
});
$('rules-close').addEventListener('click', () => {
  $('rules-overlay').style.display = 'none';
});
$('rules-overlay').addEventListener('click', (e) => {
  if (e.target === $('rules-overlay')) $('rules-overlay').style.display = 'none';
});

// Scores toggle
$('scores-toggle').addEventListener('click', () => {
  const panel = $('scores-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});

// ===== Create Room (Host) =====
function createRoom() {
  roomCode = generateRoomCode();
  isHost = true;
  myPlayerId = generatePlayerId();

  game = new CaboGame();
  game.addPlayer(myPlayerId, myName);

  peer = new Peer(PEER_PREFIX + roomCode, {
    debug: 0,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }
  });

  peer.on('open', () => {
    $('join-create').style.display = 'none';
    $('waiting-room').style.display = 'block';
    $('room-code-display').textContent = roomCode;
    broadcastGameState();
  });

  peer.on('connection', onGuestConnected);

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      roomCode = generateRoomCode();
      peer.destroy();
      createRoom();
    } else {
      console.error('PeerJS error:', err);
      showToast('Verbindungsfehler. Bitte erneut versuchen.');
    }
  });
}

// ===== Join Room (Guest) =====
function joinRoom(code) {
  roomCode = code;
  isHost = false;

  peer = new Peer(undefined, {
    debug: 0,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }
  });

  peer.on('open', () => {
    hostConn = peer.connect(PEER_PREFIX + code, { reliable: true });

    hostConn.on('open', () => {
      hostConn.send({ type: 'join', name: myName });
    });

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
      showToast('Verbindung zum Gastgeber verloren');
      showScreen('lobby-screen');
      $('join-create').style.display = 'block';
      $('waiting-room').style.display = 'none';
    });

    hostConn.on('error', () => {
      showToast('Verbindungsfehler');
    });
  });

  peer.on('error', (err) => {
    if (err.type === 'peer-unavailable') {
      showToast('Raum nicht gefunden');
    } else {
      console.error('PeerJS error:', err);
      showToast('Verbindungsfehler');
    }
  });
}

// ===== Render from State =====
function renderFromState() {
  if (!gameState) return;

  if (gameState.state === 'lobby') {
    showScreen('lobby-screen');
    renderLobby();
  } else {
    showScreen('game-screen');
    renderGame();
  }
}

// ===== Render Lobby =====
function renderLobby() {
  if (!gameState) return;
  $('join-create').style.display = 'none';
  $('waiting-room').style.display = 'block';
  $('room-code-display').textContent = roomCode;

  const list = $('player-list');
  list.innerHTML = gameState.players.map((p, i) => {
    const hostBadge = i === 0 ? '<span class="host-badge">Gastgeber</span>' : '';
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
    $('waiting-msg').textContent = 'Warte auf Mitspieler oder f\u00fcge Bots hinzu...';
  } else {
    $('lobby-actions').style.display = 'none';
    $('waiting-msg').textContent = 'Warte auf den Gastgeber...';
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
  renderStatus();
  renderReveal();
}

function renderHeader() {
  $('room-info').textContent = `Raum: ${gameState.roomCode}`;
  $('round-info').textContent = `Runde ${gameState.round}`;

  $('scores-list').innerHTML = gameState.players.map(p =>
    `<div class="score-row ${p.isMe ? 'me' : ''}"><span>${p.name}</span><span>${p.score}</span></div>`
  ).join('');
}

function renderOpponents() {
  const area = $('opponents-area');
  const opponents = gameState.players.filter(p => !p.isMe);

  area.innerHTML = opponents.map(p => {
    const pIndex = gameState.players.indexOf(p);
    const isActive = pIndex === gameState.currentPlayerIndex && gameState.state === 'playing';
    const isCabo = pIndex === gameState.caboCallerIndex;
    const caboTag = isCabo ? '<span class="cabo-tag">CABO</span>' : '';

    const cards = p.cards.map((card, j) => {
      const extra = getOpponentCardExtra(pIndex, j);
      if (card.faceUp) {
        return buildCardFace(card, 'card-small' + extra);
      }
      return buildCardBack('card-small' + extra);
    }).join('');

    const botTag = p.isBot ? ' \u{1F9AB}' : '';

    return `<div class="opponent-row">
      <div class="opponent-name ${isActive ? 'active-turn' : ''}">${p.name}${botTag} ${caboTag}</div>
      <div class="opponent-cards">${cards}</div>
    </div>`;
  }).join('');

  // Attach click handlers for clickable opponent cards
  area.querySelectorAll('.card[data-player-index]').forEach(el => {
    el.addEventListener('click', () => {
      const pIdx = parseInt(el.dataset.playerIndex);
      const cIdx = parseInt(el.dataset.cardIndex);
      onOpponentCardClick(pIdx, cIdx);
    });
  });
}

function getOpponentCardExtra(playerIndex, cardIndex) {
  if (!gameState.powerState || gameState.state !== 'playing') return '';
  const power = gameState.powerState;

  if (power.type === 'spy' && power.step === 'select_target') {
    return ` clickable card-highlight" data-player-index="${playerIndex}" data-card-index="${cardIndex}`;
  }
  if (power.type === 'swap' && power.step === 'select_opponent') {
    return ` clickable card-highlight" data-player-index="${playerIndex}" data-card-index="${cardIndex}`;
  }
  return '';
}

function renderTableCenter() {
  const deckEl = $('deck');
  $('deck-count').textContent = gameState.deckCount;

  const isMyTurn = gameState.myIndex === gameState.currentPlayerIndex;
  const canDraw = isMyTurn && gameState.turnPhase === 'start' && gameState.state === 'playing';

  if (canDraw) {
    deckEl.classList.add('clickable', 'card-highlight');
    deckEl.onclick = () => sendAction('draw-deck');
  } else {
    deckEl.classList.remove('clickable', 'card-highlight');
    deckEl.onclick = null;
  }

  const discardEl = $('discard');
  if (gameState.discardTop) {
    const card = gameState.discardTop;
    discardEl.className = `card card-face ${suitColor(card.suit)}`;
    discardEl.innerHTML = `
      <span class="card-rank">${card.rank}</span>
      <span class="card-suit-small">${SUIT_SYMBOLS[card.suit]}</span>
      <span class="card-center-suit">${SUIT_SYMBOLS[card.suit]}</span>
      <span class="card-bottom">${card.rank}</span>
    `;
    if (canDraw) {
      discardEl.classList.add('clickable', 'card-highlight');
      discardEl.onclick = () => sendAction('draw-discard');
    } else {
      discardEl.classList.remove('clickable', 'card-highlight');
      discardEl.onclick = null;
    }
  } else {
    discardEl.className = 'card empty-pile';
    discardEl.innerHTML = '<span class="empty-label">Leer</span>';
    discardEl.onclick = null;
  }
}

function renderDrawnCard() {
  const area = $('drawn-card-area');
  if (gameState.drawnCard && (gameState.turnPhase === 'drawn' || gameState.turnPhase === 'discard_swap')) {
    area.style.display = 'flex';
    const card = gameState.drawnCard;
    const el = $('drawn-card');
    el.className = `card card-face ${suitColor(card.suit)}`;
    el.innerHTML = `
      <span class="card-rank">${card.rank}</span>
      <span class="card-suit-small">${SUIT_SYMBOLS[card.suit]}</span>
      <span class="card-center-suit">${SUIT_SYMBOLS[card.suit]}</span>
      <span class="card-bottom">${card.rank}</span>
    `;
    $('drawn-label').textContent = gameState.turnPhase === 'discard_swap'
      ? 'Von Ablage genommen:' : 'Gezogene Karte:';
  } else {
    area.style.display = 'none';
  }
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
      return `<div class="card card-face ${suitColor(card.suit)}${highlight}${selected}${clickCls}" data-index="${i}">
        <span class="card-rank">${card.rank}</span>
        <span class="card-suit-small">${SUIT_SYMBOLS[card.suit]}</span>
        <span class="card-center-suit">${SUIT_SYMBOLS[card.suit]}</span>
        <span class="card-bottom">${card.rank}</span>
      </div>`;
    }
    return `<div class="card card-back${highlight}${selected}${clickCls}" data-index="${i}">
      <div class="card-back-design"><div class="card-back-border"><div class="card-back-pattern">\u{1F9AB}</div></div></div>
    </div>`;
  }).join('');

  container.querySelectorAll('.clickable').forEach(el => {
    el.addEventListener('click', () => onMyCardClick(parseInt(el.dataset.index)));
  });
}

function getMyCardClickable(cardIndex) {
  if (!gameState) return false;
  const isMyTurn = gameState.myIndex === gameState.currentPlayerIndex;

  if (gameState.state === 'peeking') {
    const me = gameState.players.find(p => p.isMe);
    return gameState.peeksLeft > 0 && !me.cards[cardIndex].faceUp;
  }

  if (!isMyTurn) return false;
  if (gameState.turnPhase === 'drawn' || gameState.turnPhase === 'discard_swap') return true;
  if (gameState.powerState && gameState.powerState.type === 'peek') return true;
  if (gameState.powerState && gameState.powerState.type === 'swap' && gameState.powerState.step === 'select_own') return true;
  return false;
}

function isMyCardSelected(cardIndex) {
  if (!gameState || !gameState.powerState) return false;
  return gameState.powerState.type === 'swap' &&
    gameState.powerState.step === 'select_opponent' &&
    gameState.powerState.selectedCard === cardIndex;
}

function onMyCardClick(cardIndex) {
  if (!gameState) return;

  if (gameState.state === 'peeking') {
    sendAction('peek-card', { cardIndex });
    return;
  }
  if (gameState.turnPhase === 'drawn' || gameState.turnPhase === 'discard_swap') {
    sendAction('swap-card', { cardIndex });
    return;
  }
  if (gameState.powerState && gameState.powerState.type === 'peek') {
    sendAction('use-power', { targetPlayerIndex: gameState.myIndex, targetCardIndex: cardIndex });
    return;
  }
  if (gameState.powerState && gameState.powerState.type === 'swap' && gameState.powerState.step === 'select_own') {
    sendAction('use-power', { targetPlayerIndex: gameState.myIndex, targetCardIndex: cardIndex });
    return;
  }
}

function onOpponentCardClick(playerIndex, cardIndex) {
  if (!gameState || !gameState.powerState) return;

  if (gameState.powerState.type === 'spy') {
    sendAction('use-power', { targetPlayerIndex: playerIndex, targetCardIndex: cardIndex });
    return;
  }
  if (gameState.powerState.type === 'swap' && gameState.powerState.step === 'select_opponent') {
    sendAction('use-power', { targetPlayerIndex: playerIndex, targetCardIndex: cardIndex });
    return;
  }
}

function renderStatus() {
  const msg = $('status-message');
  const btns = $('action-buttons');
  const isMyTurn = gameState.myIndex === gameState.currentPlayerIndex;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  btns.innerHTML = '';

  if (gameState.state === 'peeking') {
    msg.textContent = gameState.peeksLeft > 0
      ? `Sieh dir ${gameState.peeksLeft} deiner Karten an`
      : 'Warte auf andere Spieler...';
    return;
  }

  if (gameState.state === 'reveal') {
    msg.textContent = '';
    return;
  }

  if (!isMyTurn) {
    const caboNote = gameState.caboCallerIndex !== null ? ' (letzte Runde!)' : '';
    msg.textContent = `${currentPlayer.name} ist am Zug${caboNote}`;
    return;
  }

  if (gameState.turnPhase === 'start') {
    const caboNote = gameState.caboCallerIndex !== null ? ' \u2014 Letzte Runde!' : '';
    msg.textContent = `Du bist dran${caboNote}`;
    if (gameState.caboCallerIndex === null) {
      btns.innerHTML += '<button class="btn btn-danger btn-small" id="btn-cabo">CABO!</button>';
      $('btn-cabo').addEventListener('click', () => sendAction('call-cabo'));
    }
  } else if (gameState.turnPhase === 'drawn') {
    msg.textContent = 'Tausche mit einer Karte oder lege ab';
    btns.innerHTML = '<button class="btn btn-secondary btn-small" id="btn-discard">Ablegen</button>';
    $('btn-discard').addEventListener('click', () => sendAction('discard-drawn'));
  } else if (gameState.turnPhase === 'discard_swap') {
    msg.textContent = 'Welche Karte willst du ersetzen?';
  } else if (gameState.turnPhase === 'power') {
    const power = gameState.powerState;
    if (power.type === 'peek') {
      msg.textContent = 'BLICK: Tippe auf eine deiner Karten';
    } else if (power.type === 'spy') {
      msg.textContent = 'SPION: Tippe auf eine Karte eines Mitspielers';
    } else if (power.type === 'swap') {
      msg.textContent = power.step === 'select_own'
        ? 'TAUSCH: Tippe auf eine deiner Karten'
        : 'TAUSCH: Tippe auf eine Karte eines Mitspielers';
    }
    btns.innerHTML = '<button class="btn btn-secondary btn-small" id="btn-skip-power">Verzichten</button>';
    $('btn-skip-power').addEventListener('click', () => sendAction('skip-power'));
  }
}

function renderReveal() {
  const overlay = $('reveal-overlay');
  if (gameState.state !== 'reveal') {
    overlay.style.display = 'none';
    return;
  }

  overlay.style.display = 'flex';
  const roundScores = gameState.roundScores || [];
  const actualLowest = Math.min(...roundScores);

  $('reveal-results').innerHTML = gameState.players.map((p, i) => {
    const isWinner = roundScores[i] === actualLowest;
    const isCaller = i === gameState.caboCallerIndex;
    const rawScore = p.cards.reduce((sum, c) => sum + (c.value || 0), 0);
    const penalty = isCaller && roundScores[i] > rawScore ? 10 : 0;
    const nameClass = isWinner ? 'winner' : (isCaller ? 'cabo-caller' : '');
    const cards = p.cards.map(c => buildCardFace(c, 'card-small')).join('');
    const penaltyHtml = penalty > 0 ? '<div class="reveal-penalty">+10 Strafe (Cabo verfehlt)</div>' : '';

    return `<div class="reveal-player">
      <div class="reveal-player-header">
        <span class="reveal-player-name ${nameClass}">${p.name} ${isWinner ? '\u{1F3C6}' : ''} ${isCaller ? '(Cabo)' : ''}</span>
        <span class="reveal-player-score">${roundScores[i]}</span>
      </div>
      <div class="reveal-cards">${cards}</div>
      ${penaltyHtml}
      <div class="reveal-total-score">Gesamt: ${p.score}</div>
    </div>`;
  }).join('');

  const revealBtns = $('reveal-buttons');
  if (isHost) {
    revealBtns.innerHTML = `
      <button class="btn btn-primary btn-small" id="btn-next-round">N\u00e4chste Runde</button>
      <button class="btn btn-secondary btn-small" id="btn-back-lobby">Zur\u00fcck zur Lobby</button>
    `;
    $('btn-next-round').addEventListener('click', () => sendAction('play-again'));
    $('btn-back-lobby').addEventListener('click', () => sendAction('back-to-lobby'));
  } else {
    revealBtns.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem">Warte auf den Gastgeber...</p>';
  }
}

// ===== Bot AI =====
function initBotMemory() {
  botMemory = {};
  for (const botId of botIds) {
    botMemory[botId] = { ownCards: {}, opponentCards: {} };
  }
}

function scheduleBotTurn() {
  if (!isHost || !game) return;

  // Handle bot peeks
  if (game.state === 'peeking') {
    for (const botId of botIds) {
      const done = game.peeksDone[botId] || 0;
      if (done < 2) {
        setTimeout(() => {
          botPeek(botId);
        }, BOT_DELAY * (done + 1));
      }
    }
    return;
  }

  // Handle bot turn during play
  if (game.state === 'playing') {
    const currentPlayer = game.players[game.currentPlayerIndex];
    if (currentPlayer && botIds.includes(currentPlayer.id)) {
      setTimeout(() => botPlayTurn(currentPlayer.id), BOT_DELAY);
    }
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
        // Remember the card
        if (botMemory[botId]) {
          botMemory[botId].ownCards[i] = { ...player.cards[i] };
        }
        broadcastGameState();
        scheduleBotTurn();
        return;
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

  // Refresh memory of known cards
  for (const idx of player.knownCards) {
    mem.ownCards[idx] = { ...player.cards[idx] };
  }

  if (game.turnPhase === 'start') {
    // Consider calling Cabo
    const knownValues = {};
    let knownTotal = 0;
    let unknownCount = 0;
    for (let i = 0; i < player.cards.length; i++) {
      if (mem.ownCards[i]) {
        const v = cardValue(mem.ownCards[i]);
        knownValues[i] = v;
        knownTotal += v;
      } else {
        unknownCount++;
      }
    }

    if (unknownCount === 0 && knownTotal <= 6 && game.caboCallerIndex === null) {
      handleActionOnHost(botId, 'call-cabo', {});
      return;
    }

    // Draw from deck
    handleActionOnHost(botId, 'draw-deck', {});
    setTimeout(() => botDecideDrawn(botId), BOT_DELAY);
    return;
  }

  if (game.turnPhase === 'power') {
    setTimeout(() => botUsePower(botId), BOT_DELAY);
    return;
  }
}

function botDecideDrawn(botId) {
  if (!game || game.state !== 'playing') return;
  const playerIndex = game.getPlayerIndex(botId);
  if (playerIndex !== game.currentPlayerIndex) return;
  if (game.turnPhase !== 'drawn') return;

  const player = game.players[playerIndex];
  const mem = botMemory[botId] || { ownCards: {}, opponentCards: {} };
  const drawnValue = cardValue(game.drawnCard);

  // Find worst known card to potentially swap
  let worstIdx = -1;
  let worstVal = -1;
  for (let i = 0; i < player.cards.length; i++) {
    if (mem.ownCards[i]) {
      const v = cardValue(mem.ownCards[i]);
      if (v > worstVal) {
        worstVal = v;
        worstIdx = i;
      }
    }
  }

  // Find any unknown card slot
  let unknownIdx = -1;
  for (let i = 0; i < player.cards.length; i++) {
    if (!mem.ownCards[i]) { unknownIdx = i; break; }
  }

  // Swap if drawn card is better than worst known card
  if (worstIdx >= 0 && drawnValue < worstVal) {
    mem.ownCards[worstIdx] = { ...game.drawnCard };
    handleActionOnHost(botId, 'swap-card', { cardIndex: worstIdx });
    return;
  }

  // Swap with unknown slot if drawn card is decent (<=4)
  if (unknownIdx >= 0 && drawnValue <= 4) {
    mem.ownCards[unknownIdx] = { ...game.drawnCard };
    handleActionOnHost(botId, 'swap-card', { cardIndex: unknownIdx });
    return;
  }

  // Discard the drawn card
  handleActionOnHost(botId, 'discard-drawn', {});
}

function botUsePower(botId) {
  if (!game || game.state !== 'playing') return;
  const playerIndex = game.getPlayerIndex(botId);
  if (playerIndex !== game.currentPlayerIndex) return;
  if (game.turnPhase !== 'power' || !game.powerState) return;

  const player = game.players[playerIndex];
  const mem = botMemory[botId] || { ownCards: {}, opponentCards: {} };
  const power = game.powerState;

  if (power.type === 'peek') {
    // Peek at an unknown own card
    for (let i = 0; i < player.cards.length; i++) {
      if (!mem.ownCards[i]) {
        handleActionOnHost(botId, 'use-power', { targetPlayerIndex: playerIndex, targetCardIndex: i });
        mem.ownCards[i] = { ...player.cards[i] };
        return;
      }
    }
    handleActionOnHost(botId, 'skip-power', {});

  } else if (power.type === 'spy') {
    // Spy on a random opponent card
    const opponents = game.players.filter((p, i) => i !== playerIndex);
    if (opponents.length > 0) {
      const opp = opponents[Math.floor(Math.random() * opponents.length)];
      const oppIdx = game.getPlayerIndex(opp.id);
      const cardIdx = Math.floor(Math.random() * opp.cards.length);
      mem.opponentCards[`${oppIdx}_${cardIdx}`] = { ...opp.cards[cardIdx] };
      handleActionOnHost(botId, 'use-power', { targetPlayerIndex: oppIdx, targetCardIndex: cardIdx });
      return;
    }
    handleActionOnHost(botId, 'skip-power', {});

  } else if (power.type === 'swap') {
    if (power.step === 'select_own') {
      // Pick our worst known card, or an unknown card
      let worstIdx = 0;
      let worstVal = -1;
      for (let i = 0; i < player.cards.length; i++) {
        if (mem.ownCards[i]) {
          const v = cardValue(mem.ownCards[i]);
          if (v > worstVal) { worstVal = v; worstIdx = i; }
        }
      }
      if (worstVal <= 3) {
        handleActionOnHost(botId, 'skip-power', {});
        return;
      }
      handleActionOnHost(botId, 'use-power', { targetPlayerIndex: playerIndex, targetCardIndex: worstIdx });
      setTimeout(() => botUsePower(botId), BOT_DELAY);
    } else if (power.step === 'select_opponent') {
      // Pick a random opponent card (prefer one we spied as low)
      const opponents = game.players.filter((p, i) => i !== playerIndex);
      if (opponents.length > 0) {
        const opp = opponents[Math.floor(Math.random() * opponents.length)];
        const oppIdx = game.getPlayerIndex(opp.id);
        const cardIdx = Math.floor(Math.random() * opp.cards.length);
        // Lose memory of our swapped card
        delete mem.ownCards[power.selectedCard];
        handleActionOnHost(botId, 'use-power', { targetPlayerIndex: oppIdx, targetCardIndex: cardIdx });
        return;
      }
      handleActionOnHost(botId, 'skip-power', {});
    }
  }
}

// Hook into broadcastGameState to trigger bot turns
const _origBroadcastGameState = broadcastGameState;
broadcastGameState = function() {
  _origBroadcastGameState();
  if (isHost && game) {
    setTimeout(() => scheduleBotTurn(), 100);
  }
};
