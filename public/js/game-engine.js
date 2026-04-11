// Game engine — runs in the host player's browser
// Deck: 56 cards, values 0–13 (4 of each)
// Powers: 7/8 = PEEK, 9/10 = SPY, 11/12 = SWAP. 13 is just high value.

function cardValue(card) {
  return card.value;
}

function cardPower(card) {
  const v = card.value;
  if (v === 7 || v === 8)   return 'peek';
  if (v === 9 || v === 10)  return 'spy';
  if (v === 11 || v === 12) return 'swap';
  return null;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function createDeck() {
  const deck = [];
  for (let v = 0; v <= 13; v++) {
    for (let s = 0; s < 4; s++) deck.push({ value: v });
  }
  return deck; // 56 cards
}

class CaboGame {
  constructor() {
    this.players = [];
    this.deck = [];
    this.discardPile = [];
    this.currentPlayerIndex = 0;
    this.state = 'lobby';
    this.caboCallerIndex = null;
    this.caboPassed = 0;
    this.drawnCard = null;
    this.turnPhase = 'start';
    this.powerState = null;
    this.peeksDone = {};
    this.round = 1;
    this.roundScores = [];
    this.scoreHistory = [];
    this.gameOver = false;
  }

  addPlayer(id, name) {
    if (this.state !== 'lobby') return { error: 'Game already in progress' };
    if (this.players.length >= 4) return { error: 'Room is full (max 4)' };
    if (this.players.find(p => p.name.toLowerCase() === name.toLowerCase()))
      return { error: 'Name already taken' };
    this.players.push({ id, name, cards: [], knownCards: new Set(), score: 0, isBot: false });
    return { ok: true };
  }

  addBot(name) {
    if (this.state !== 'lobby') return { error: 'Game already in progress' };
    if (this.players.length >= 4) return { error: 'Room is full (max 4)' };
    if (this.players.find(p => p.name.toLowerCase() === name.toLowerCase()))
      return { error: 'Name already taken' };
    const botId = 'bot-' + Math.random().toString(36).substr(2, 9);
    this.players.push({ id: botId, name, cards: [], knownCards: new Set(), score: 0, isBot: true });
    return { ok: true, botId };
  }

  removePlayer(id) { this.players = this.players.filter(p => p.id !== id); }
  getPlayerIndex(id) { return this.players.findIndex(p => p.id === id); }

  startRound() {
    if (this.players.length < 2) return { error: 'Need at least 2 players' };
    this.deck = shuffle(createDeck());
    this.discardPile = [];
    this.currentPlayerIndex = (this.round - 1) % this.players.length;
    this.state = 'peeking';
    this.caboCallerIndex = null;
    this.caboPassed = 0;
    this.drawnCard = null;
    this.turnPhase = 'start';
    this.powerState = null;
    this.peeksDone = {};
    this.roundScores = [];
    for (const player of this.players) {
      player.cards = [];
      player.knownCards = new Set();
      for (let i = 0; i < 4; i++) player.cards.push(this.deck.pop());
    }
    this.discardPile.push(this.deck.pop());
    return { ok: true };
  }

  getStateForPlayer(playerId) {
    const playerIndex = this.getPlayerIndex(playerId);
    return {
      state: this.state,
      round: this.round,
      currentPlayerIndex: this.currentPlayerIndex,
      myIndex: playerIndex,
      turnPhase: this.turnPhase,
      caboCallerIndex: this.caboCallerIndex,
      discardTop: this.discardPile.length > 0 ? this.discardPile[this.discardPile.length - 1] : null,
      deckCount: this.deck.length,
      drawnCard: this.currentPlayerIndex === playerIndex ? this.drawnCard : null,
      powerState: this.currentPlayerIndex === playerIndex ? this.powerState : null,
      peeksLeft: this.state === 'peeking' ? (2 - (this.peeksDone[playerId] || 0)) : 0,
      roundScores: this.roundScores,
      scoreHistory: this.scoreHistory,
      gameOver: this.gameOver,
      players: this.players.map((p, i) => ({
        name: p.name,
        cardCount: p.cards.length,
        score: p.score,
        isBot: p.isBot,
        isMe: i === playerIndex,
        cards: p.cards.map(card => this.state === 'reveal'
          ? { ...card, faceUp: true }
          : { faceUp: false }
        )
      }))
    };
  }

  // ===== Actions =====

  peekCard(playerId, cardIndex) {
    if (this.state !== 'peeking') return null;
    const peeksDone = this.peeksDone[playerId] || 0;
    if (peeksDone >= 2) return null;
    const player = this.players.find(p => p.id === playerId);
    if (!player || cardIndex < 0 || cardIndex >= player.cards.length) return null;
    if (player.knownCards.has(cardIndex)) return null;
    player.knownCards.add(cardIndex);
    this.peeksDone[playerId] = peeksDone + 1;
    const events = [{ target: playerId, type: 'peek-result', data: { cardIndex, card: player.cards[cardIndex] } }];
    if (this.players.every(p => (this.peeksDone[p.id] || 0) >= 2)) {
      this.state = 'playing';
      this.turnPhase = 'start';
    }
    return { broadcast: true, events };
  }

  drawDeck(playerId) {
    if (this.state !== 'playing') return null;
    const playerIndex = this.getPlayerIndex(playerId);
    if (playerIndex !== this.currentPlayerIndex || this.turnPhase !== 'start') return null;
    if (this.deck.length === 0) return null;
    this.drawnCard = this.deck.pop();
    this.turnPhase = 'drawn';
    const events = [{ target: 'all', type: 'draw-occurred', data: { actorIndex: playerIndex, actorName: this.players[playerIndex].name, source: 'deck' } }];
    return { broadcast: true, events };
  }

  drawDiscard(playerId) {
    if (this.state !== 'playing') return null;
    const playerIndex = this.getPlayerIndex(playerId);
    if (playerIndex !== this.currentPlayerIndex || this.turnPhase !== 'start') return null;
    if (this.discardPile.length === 0) return null;
    this.drawnCard = this.discardPile.pop();
    this.turnPhase = 'discard_swap';
    const events = [{ target: 'all', type: 'draw-occurred', data: { actorIndex: playerIndex, actorName: this.players[playerIndex].name, source: 'discard' } }];
    return { broadcast: true, events };
  }

  swapCard(playerId, cardIndex) {
    if (this.state !== 'playing') return null;
    const playerIndex = this.getPlayerIndex(playerId);
    if (playerIndex !== this.currentPlayerIndex) return null;
    if (this.turnPhase !== 'drawn' && this.turnPhase !== 'discard_swap') return null;
    const player = this.players[playerIndex];
    if (cardIndex < 0 || cardIndex >= player.cards.length) return null;
    const oldCard = player.cards[cardIndex];
    player.cards[cardIndex] = this.drawnCard;
    this.discardPile.push(oldCard);
    player.knownCards.add(cardIndex);
    this._nextTurn();
    return { broadcast: true };
  }

  discardDrawn(playerId) {
    if (this.state !== 'playing') return null;
    const playerIndex = this.getPlayerIndex(playerId);
    if (playerIndex !== this.currentPlayerIndex || this.turnPhase !== 'drawn') return null;
    const power = cardPower(this.drawnCard);
    this.discardPile.push(this.drawnCard);
    this.drawnCard = null;
    if (power) {
      this.turnPhase = 'power';
      if (power === 'peek')  this.powerState = { type: 'peek', step: 'select_target' };
      if (power === 'spy')   this.powerState = { type: 'spy', step: 'select_target' };
      if (power === 'swap')  this.powerState = { type: 'swap', step: 'select_own', selectedCard: null };
    } else {
      this._nextTurn();
    }
    return { broadcast: true };
  }

  usePower(playerId, targetPlayerIndex, targetCardIndex) {
    if (this.state !== 'playing') return null;
    const playerIndex = this.getPlayerIndex(playerId);
    if (playerIndex !== this.currentPlayerIndex || this.turnPhase !== 'power' || !this.powerState) return null;
    const player = this.players[playerIndex];
    const power = this.powerState;
    const events = [];

    if (power.type === 'peek') {
      if (targetPlayerIndex !== playerIndex) return null;
      if (targetCardIndex < 0 || targetCardIndex >= player.cards.length) return null;
      player.knownCards.add(targetCardIndex);
      events.push({ target: playerId, type: 'peek-result', data: { cardIndex: targetCardIndex, card: player.cards[targetCardIndex] } });
      events.push({ target: 'all', type: 'peek-occurred', data: { actorIndex: playerIndex, actorName: player.name } });
      this._nextTurn();

    } else if (power.type === 'spy') {
      if (targetPlayerIndex === playerIndex) return null;
      const target = this.players[targetPlayerIndex];
      if (!target || targetCardIndex < 0 || targetCardIndex >= target.cards.length) return null;
      events.push({ target: playerId, type: 'spy-result', data: { playerIndex: targetPlayerIndex, cardIndex: targetCardIndex, card: target.cards[targetCardIndex] } });
      events.push({ target: 'all', type: 'spy-occurred', data: { actorIndex: playerIndex, actorName: player.name, targetIndex: targetPlayerIndex, targetName: target.name } });
      this._nextTurn();

    } else if (power.type === 'swap') {
      if (power.step === 'select_own') {
        if (targetPlayerIndex !== playerIndex) return null;
        if (targetCardIndex < 0 || targetCardIndex >= player.cards.length) return null;
        this.powerState.selectedCard = targetCardIndex;
        this.powerState.step = 'select_opponent';

      } else if (power.step === 'select_opponent') {
        if (targetPlayerIndex === playerIndex) return null;
        const target = this.players[targetPlayerIndex];
        if (!target || targetCardIndex < 0 || targetCardIndex >= target.cards.length) return null;
        const ownCardIndex = power.selectedCard;
        const temp = player.cards[ownCardIndex];
        player.cards[ownCardIndex] = target.cards[targetCardIndex];
        target.cards[targetCardIndex] = temp;
        player.knownCards.delete(ownCardIndex);
        target.knownCards.delete(targetCardIndex);
        events.push({ target: target.id, type: 'card-swapped', data: { cardIndex: targetCardIndex } });
        events.push({
          target: 'all', type: 'swap-occurred',
          data: { actorIndex: playerIndex, actorName: player.name, actorCard: ownCardIndex + 1, targetIndex: targetPlayerIndex, targetName: target.name, targetCard: targetCardIndex + 1 }
        });
        this._nextTurn();
      }
    }

    return { broadcast: true, events };
  }

  skipPower(playerId) {
    if (this.state !== 'playing') return null;
    const playerIndex = this.getPlayerIndex(playerId);
    if (playerIndex !== this.currentPlayerIndex || this.turnPhase !== 'power') return null;
    this._nextTurn();
    return { broadcast: true };
  }

  slamCards(playerId, cardIndices) {
    if (this.state !== 'playing') return null;
    const playerIndex = this.getPlayerIndex(playerId);
    if (playerIndex !== this.currentPlayerIndex || this.turnPhase !== 'start') return null;
    if (!cardIndices || cardIndices.length === 0 || this.discardPile.length === 0) return null;
    const player = this.players[playerIndex];
    const discardTopValue = cardValue(this.discardPile[this.discardPile.length - 1]);
    const sorted = [...new Set(cardIndices)].sort((a, b) => b - a);
    for (const idx of sorted) { if (idx < 0 || idx >= player.cards.length) return null; }
    const allMatch = sorted.every(idx => cardValue(player.cards[idx]) === discardTopValue);
    const events = [];

    if (allMatch) {
      for (const idx of sorted) { const r = player.cards.splice(idx, 1)[0]; this.discardPile.push(r); }
      const newKnown = new Set();
      for (const k of player.knownCards) {
        let adj = k;
        for (const idx of sorted) { if (k > idx) adj--; else if (k === idx) { adj = -1; break; } }
        if (adj >= 0) newKnown.add(adj);
      }
      player.knownCards = newKnown;
      events.push({ target: 'all', type: 'slam-success', data: { playerIndex, playerName: player.name, count: sorted.length } });
      if (player.cards.length === 0 && this.caboCallerIndex === null) {
        this.caboCallerIndex = playerIndex;
        this.caboPassed = -1;
        events.push({ target: 'all', type: 'cabo-called', data: { playerName: player.name, playerIndex } });
      }
      this._nextTurn();
    } else {
      events.push({ target: 'all', type: 'slam-fail', data: { playerIndex, playerName: player.name } });
      if (this.deck.length > 0) player.cards.push(this.deck.pop());
    }
    return { broadcast: true, events };
  }

  callCabo(playerId) {
    if (this.state !== 'playing') return null;
    const playerIndex = this.getPlayerIndex(playerId);
    if (playerIndex !== this.currentPlayerIndex || this.turnPhase !== 'start') return null;
    if (this.caboCallerIndex !== null) return null;
    this.caboCallerIndex = playerIndex;
    this.caboPassed = -1;
    const events = [{ target: 'all', type: 'cabo-called', data: { playerName: this.players[playerIndex].name, playerIndex } }];
    this._nextTurn();
    return { broadcast: true, events };
  }

  playAgain() {
    if (this.state !== 'reveal' || this.gameOver) return null;
    this.round++;
    return this.startRound();
  }

  backToLobby() {
    if (this.state !== 'reveal') return null;
    this.state = 'lobby';
    this.players.forEach(p => { p.score = 0; });
    this.round = 1;
    this.scoreHistory = [];
    this.gameOver = false;
    return { broadcast: true };
  }

  _nextTurn() {
    this.drawnCard = null;
    this.turnPhase = 'start';
    this.powerState = null;
    if (this.caboCallerIndex !== null) {
      this.caboPassed++;
      if (this.caboPassed >= this.players.length - 1) {
        this.state = 'reveal';
        this._calculateScores();
        return;
      }
    }
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    if (this.caboCallerIndex !== null && this.currentPlayerIndex === this.caboCallerIndex) {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    }
  }

  _calculateScores() {
    const roundScores = this.players.map(p => p.cards.reduce((s, c) => s + cardValue(c), 0));
    const lowestScore = Math.min(...roundScores);
    if (this.caboCallerIndex !== null && roundScores[this.caboCallerIndex] > lowestScore)
      roundScores[this.caboCallerIndex] += 10;
    this.roundScores = roundScores;
    this.scoreHistory.push([...roundScores]);
    this.players.forEach((p, i) => { p.score += roundScores[i]; });
    this.gameOver = this.players.some(p => p.score >= 100);
  }
}
