// Game engine — runs in the host player's browser
// Manages all game state and validates actions

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];

function cardValue(card) {
  if (card.rank === 'K' && (card.suit === 'hearts' || card.suit === 'diamonds')) return 0;
  if (card.rank === 'A') return 1;
  if (card.rank === 'J') return 11;
  if (card.rank === 'Q') return 12;
  if (card.rank === 'K') return 13;
  return parseInt(card.rank);
}

function cardPower(card) {
  if (card.rank === '7' || card.rank === '8') return 'peek';
  if (card.rank === '9' || card.rank === '10') return 'spy';
  if (card.rank === 'J' || card.rank === 'Q') return 'swap';
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
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
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
  }

  addPlayer(id, name) {
    if (this.state !== 'lobby') return { error: 'Game already in progress' };
    if (this.players.length >= 4) return { error: 'Room is full (max 4)' };
    if (this.players.find(p => p.name.toLowerCase() === name.toLowerCase())) {
      return { error: 'Name already taken' };
    }
    this.players.push({
      id, name, cards: [], knownCards: new Set(), score: 0, isBot: false
    });
    return { ok: true };
  }

  addBot(name) {
    if (this.state !== 'lobby') return { error: 'Game already in progress' };
    if (this.players.length >= 4) return { error: 'Room is full (max 4)' };
    if (this.players.find(p => p.name.toLowerCase() === name.toLowerCase())) {
      return { error: 'Name already taken' };
    }
    const botId = 'bot-' + Math.random().toString(36).substr(2, 9);
    this.players.push({
      id: botId, name, cards: [], knownCards: new Set(), score: 0, isBot: true
    });
    return { ok: true, botId };
  }

  removePlayer(id) {
    this.players = this.players.filter(p => p.id !== id);
  }

  getPlayerIndex(id) {
    return this.players.findIndex(p => p.id === id);
  }

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
      for (let i = 0; i < 4; i++) {
        player.cards.push(this.deck.pop());
      }
    }

    this.discardPile.push(this.deck.pop());
    return { ok: true };
  }

  // Returns personalized game state for a specific player
  getStateForPlayer(playerId) {
    const playerIndex = this.getPlayerIndex(playerId);

    return {
      state: this.state,
      round: this.round,
      currentPlayerIndex: this.currentPlayerIndex,
      myIndex: playerIndex,
      turnPhase: this.turnPhase,
      caboCallerIndex: this.caboCallerIndex,
      discardTop: this.discardPile.length > 0
        ? this.discardPile[this.discardPile.length - 1]
        : null,
      deckCount: this.deck.length,
      drawnCard: this.currentPlayerIndex === playerIndex ? this.drawnCard : null,
      powerState: this.currentPlayerIndex === playerIndex ? this.powerState : null,
      peeksLeft: this.state === 'peeking' ? (2 - (this.peeksDone[playerId] || 0)) : 0,
      roundScores: this.roundScores,
      players: this.players.map((p, i) => ({
        name: p.name,
        cardCount: p.cards.length,
        score: p.score,
        isBot: p.isBot,
        isMe: i === playerIndex,
        cards: p.cards.map((card, j) => {
          if (this.state === 'reveal') {
            return { ...card, faceUp: true, value: cardValue(card) };
          }
          if (i === playerIndex && this.players[playerIndex].knownCards.has(j)) {
            return { ...card, faceUp: true };
          }
          return { faceUp: false };
        })
      }))
    };
  }

  // ===== Actions =====
  // Each returns: { events: [...] } where events are sent to specific players
  // Events: { target: 'all'|playerId, type: string, data: any }

  peekCard(playerId, cardIndex) {
    if (this.state !== 'peeking') return null;
    const peeksDone = this.peeksDone[playerId] || 0;
    if (peeksDone >= 2) return null;

    const player = this.players.find(p => p.id === playerId);
    if (!player) return null;
    if (cardIndex < 0 || cardIndex >= player.cards.length) return null;
    if (player.knownCards.has(cardIndex)) return null;

    player.knownCards.add(cardIndex);
    this.peeksDone[playerId] = peeksDone + 1;

    const allDone = this.players.every(p => (this.peeksDone[p.id] || 0) >= 2);
    if (allDone) {
      this.state = 'playing';
      this.turnPhase = 'start';
    }

    return { broadcast: true };
  }

  drawDeck(playerId) {
    if (this.state !== 'playing') return null;
    const playerIndex = this.getPlayerIndex(playerId);
    if (playerIndex !== this.currentPlayerIndex) return null;
    if (this.turnPhase !== 'start') return null;
    if (this.deck.length === 0) return null;

    this.drawnCard = this.deck.pop();
    this.turnPhase = 'drawn';
    return { broadcast: true };
  }

  drawDiscard(playerId) {
    if (this.state !== 'playing') return null;
    const playerIndex = this.getPlayerIndex(playerId);
    if (playerIndex !== this.currentPlayerIndex) return null;
    if (this.turnPhase !== 'start') return null;
    if (this.discardPile.length === 0) return null;

    this.drawnCard = this.discardPile.pop();
    this.turnPhase = 'discard_swap';
    return { broadcast: true };
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
    if (playerIndex !== this.currentPlayerIndex) return null;
    if (this.turnPhase !== 'drawn') return null;

    const power = cardPower(this.drawnCard);
    this.discardPile.push(this.drawnCard);
    this.drawnCard = null;

    if (power) {
      this.turnPhase = 'power';
      this.powerState = {
        type: power,
        step: power === 'swap' ? 'select_own' : 'select_target',
        selectedCard: null
      };
    } else {
      this._nextTurn();
    }

    return { broadcast: true };
  }

  usePower(playerId, targetPlayerIndex, targetCardIndex) {
    if (this.state !== 'playing') return null;
    const playerIndex = this.getPlayerIndex(playerId);
    if (playerIndex !== this.currentPlayerIndex) return null;
    if (this.turnPhase !== 'power' || !this.powerState) return null;

    const player = this.players[playerIndex];
    const power = this.powerState;
    const events = [];

    if (power.type === 'peek') {
      if (targetPlayerIndex !== playerIndex) return null;
      if (targetCardIndex < 0 || targetCardIndex >= player.cards.length) return null;

      player.knownCards.add(targetCardIndex);
      events.push({
        target: playerId,
        type: 'peek-result',
        data: { cardIndex: targetCardIndex, card: player.cards[targetCardIndex] }
      });
      this._nextTurn();

    } else if (power.type === 'spy') {
      if (targetPlayerIndex === playerIndex) return null;
      const target = this.players[targetPlayerIndex];
      if (!target) return null;
      if (targetCardIndex < 0 || targetCardIndex >= target.cards.length) return null;

      events.push({
        target: playerId,
        type: 'spy-result',
        data: {
          playerIndex: targetPlayerIndex,
          cardIndex: targetCardIndex,
          card: target.cards[targetCardIndex]
        }
      });
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
        if (!target) return null;
        if (targetCardIndex < 0 || targetCardIndex >= target.cards.length) return null;

        const ownCardIndex = power.selectedCard;
        const temp = player.cards[ownCardIndex];
        player.cards[ownCardIndex] = target.cards[targetCardIndex];
        target.cards[targetCardIndex] = temp;

        player.knownCards.delete(ownCardIndex);
        target.knownCards.delete(targetCardIndex);

        events.push({
          target: target.id,
          type: 'card-swapped',
          data: { cardIndex: targetCardIndex }
        });
        this._nextTurn();
      }
    }

    return { broadcast: true, events };
  }

  skipPower(playerId) {
    if (this.state !== 'playing') return null;
    const playerIndex = this.getPlayerIndex(playerId);
    if (playerIndex !== this.currentPlayerIndex) return null;
    if (this.turnPhase !== 'power') return null;

    this._nextTurn();
    return { broadcast: true };
  }

  callCabo(playerId) {
    if (this.state !== 'playing') return null;
    const playerIndex = this.getPlayerIndex(playerId);
    if (playerIndex !== this.currentPlayerIndex) return null;
    if (this.turnPhase !== 'start') return null;
    if (this.caboCallerIndex !== null) return null;

    this.caboCallerIndex = playerIndex;
    this.caboPassed = 0;

    const events = [{
      target: 'all',
      type: 'cabo-called',
      data: { playerName: this.players[playerIndex].name, playerIndex }
    }];

    this._nextTurn();
    return { broadcast: true, events };
  }

  playAgain() {
    if (this.state !== 'reveal') return null;
    this.round++;
    return this.startRound();
  }

  backToLobby() {
    if (this.state !== 'reveal') return null;
    this.state = 'lobby';
    this.players.forEach(p => { p.score = 0; });
    this.round = 1;
    return { broadcast: true };
  }

  // ===== Internal =====
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
    const roundScores = this.players.map(p =>
      p.cards.reduce((sum, card) => sum + cardValue(card), 0)
    );

    const lowestScore = Math.min(...roundScores);

    if (this.caboCallerIndex !== null) {
      if (roundScores[this.caboCallerIndex] > lowestScore) {
        roundScores[this.caboCallerIndex] += 10;
      }
    }

    this.roundScores = roundScores;
    this.players.forEach((p, i) => {
      p.score += roundScores[i];
    });
  }
}
