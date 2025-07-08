const firebaseConfig = {
  apiKey: "AIzaSyCGWl_EXifTTEugTD3RhjHnTB01iqBrxKU",
  authDomain: "iupaers-8e7d4.firebaseapp.com",
  databaseURL: "https://iupaers-8e7d4-default-rtdb.firebaseio.com",
  projectId: "iupaers-8e7d4",
  storageBucket: "iupaers-8e7d4.firebasestorage.app",
  messagingSenderId: "816440688463",
  appId: "1:816440688463:web:6303dd1a75191367928f3a"
};
firebase.initializeApp(firebaseConfig);
let playerName = "";
let playerId = "";
let isMyTurn = false;
let players = {};
let pile = [];
let challengeState = null;
let slapRules = {
  doubles: true,
  topbottom: true,
  kingqueen: true,
  sandwich: true,
  sum10: true,
  run4: true
};

// === UI Setup ===
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('#slapRules input').forEach(input => {
    input.addEventListener("change", () => {
      slapRules[input.id.replace("rule", "").toLowerCase()] = input.checked;
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") attemptSlap();
    else if (isMyTurn && /^[A-Z]$/.test(e.key.toUpperCase())) placeCard();
  });
});

// === Game Join ===
function joinGame() {
  playerName = document.getElementById("playerName").value.trim();
  if (!playerName) return;

  const playerRef = db.ref("players").push();
  playerId = playerRef.key;
  playerRef.set({ name: playerName, cards: [], online: true });

  playerRef.onDisconnect().remove();

  db.ref("players").once("value").then(snap => {
    const currentPlayers = snap.val() || {};
    if (Object.keys(currentPlayers).length >= 2) {
      startGame(Object.keys(currentPlayers));
    }
  });

  db.ref("players").on("value", snap => {
    players = snap.val() || {};
    updatePlayerUI();
  });

  db.ref("turn").on("value", snap => {
    const currentTurn = snap.val();
    isMyTurn = currentTurn === playerId;
    document.getElementById("turnIndicator").innerText =
      isMyTurn ? "Your Turn" : `${players?.[currentTurn]?.name || ""}'s Turn`;
  });

  db.ref("pile").on("value", snap => {
    pile = snap.val() || [];
    updatePileUI();
  });

  document.getElementById("lobby").style.display = "none";
  document.getElementById("game").style.display = "block";
}

// === Start Game ===
function startGame(playerIds) {
  const suits = ["hearts", "diamonds", "clubs", "spades"];
  const ranks = ["2","3","4","5","6","7","8","9","10","jack","queen","king","ace"];
  let deck = [];

  suits.forEach(suit => {
    ranks.forEach(rank => {
      deck.push(`${rank}_of_${suit}`);
    });
  });

  // Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  // Deal
  const hands = {};
  playerIds.forEach(id => hands[id] = []);
  deck.forEach((card, i) => {
    const id = playerIds[i % playerIds.length];
    hands[id].push(card);
  });

  playerIds.forEach(id => {
    db.ref(`players/${id}/cards`).set(hands[id]);
  });

  db.ref("pile").set([]);
  db.ref("turn").set(playerIds[0]);
}

// === UI Updates ===
function updatePlayerUI() {
  const playersDiv = document.getElementById("players");
  playersDiv.innerHTML = "";

  Object.entries(players).forEach(([id, data]) => {
    const div = document.createElement("div");
    div.className = "player";
    div.innerHTML = `<strong>${data.name}</strong><div class="cards">Cards: ${data.cards.length}</div>`;
    playersDiv.appendChild(div);
  });
}

function updatePileUI() {
  const pileDiv = document.getElementById("pile");
  pileDiv.innerHTML = "";
  pile.forEach((card, i) => {
    const img = document.createElement("img");
    img.src = `cards/${card}.png`;
    img.className = "card";
    img.style.zIndex = i;
    img.style.left = `calc(50% + ${i * 5}px)`;
    pileDiv.appendChild(img);
  });
}

// === Game Actions ===
function placeCard() {
  if (!isMyTurn) return burnCard();

  const myCards = players[playerId].cards || [];
  if (myCards.length === 0) return;

  const card = myCards.shift();
  const rank = card.split("_")[0];
  pile.push(card);

  db.ref(`players/${playerId}/cards`).set(myCards);
  db.ref("pile").set(pile);

  if (["jack", "queen", "king", "ace"].includes(rank)) {
    challengeState = {
      challengerId: playerId,
      remainingChances: faceCardChances(rank),
    };
    passTurn();
  } else if (challengeState) {
    if (["jack", "queen", "king", "ace"].includes(rank)) {
      challengeState = {
        challengerId: playerId,
        remainingChances: faceCardChances(rank),
      };
      passTurn();
    } else {
      challengeState.remainingChances--;
      if (challengeState.remainingChances === 0) {
        const winnerId = challengeState.challengerId;
        const newCards = [...players[winnerId].cards, ...pile];
        db.ref(`players/${winnerId}/cards`).set(newCards);
        db.ref("pile").set([]);
        db.ref("turn").set(winnerId);
        challengeState = null;
      } else {
        passTurn();
      }
    }
  } else {
    passTurn();
  }
}

function faceCardChances(rank) {
  return { jack: 1, queen: 2, king: 3, ace: 4 }[rank];
}

function attemptSlap() {
  if (isValidSlap()) {
    alert(`${playerName} slapped correctly and won the pile!`);
    const newCards = [...players[playerId].cards, ...pile];
    db.ref(`players/${playerId}/cards`).set(newCards);
    db.ref("pile").set([]);
    challengeState = null;
    db.ref("turn").set(playerId);
  } else {
    burnCard();
  }
}

function burnCard() {
  const myCards = players[playerId].cards || [];
  if (myCards.length === 0) return;

  const burn = myCards.shift();
  pile.unshift(burn);
  db.ref(`players/${playerId}/cards`).set(myCards);
  db.ref("pile").set(pile);
}

function passTurn() {
  const ids = Object.keys(players);
  let nextIndex = (ids.indexOf(playerId) + 1) % ids.length;
  db.ref("turn").set(ids[nextIndex]);
}

// === Slap Logic ===
function isValidSlap() {
  const len = pile.length;
  if (len < 2) return false;

  const top = pile[len - 1].split("_")[0];
  const second = pile[len - 2].split("_")[0];
  const first = pile[0].split("_")[0];

  if (slapRules.doubles && top === second) return true;
  if (slapRules.topbottom && top === first) return true;
  if (slapRules.kingqueen && (
      (top === "king" && second === "queen") || (top === "queen" && second === "king"))
  ) return true;
  if (slapRules.sandwich && len >= 3 && top === pile[len - 3].split("_")[0]) return true;
  if (slapRules.sum10 && parseInt(top) + parseInt(second) === 10) return true;
  if (slapRules.run4 && len >= 4) {
    const vals = pile.slice(-4).map(c => cardValue(c.split("_")[0])).sort((a,b)=>a-b);
    if (vals[3] - vals[0] === 3 && new Set(vals).size === 4) return true;
  }

  return false;
}

function cardValue(rank) {
  const map = { jack: 11, queen: 12, king: 13, ace: 14 };
  return map[rank] || parseInt(rank);
}
