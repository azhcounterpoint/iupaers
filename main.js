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
const db = firebase.database();
let playerName, playerId;
const roomRef = db.ref("rooms/ers-game-1");

let myHand = [], pile = [], isMyTurn = false;
let rules = { doubles:true, topbottom:true, kq:true, sandwich:true, sum10:true, run4:true };
let challenge = null, chances = 0, challenger = null;
let stats = { playTimes: [], slapTimes: [] };

// 1️⃣ Name Selection
document.getElementById("enterBtn").onclick = () => {
  const name = document.getElementById("nameInput").value.trim();
  if (!name) return;
  playerName = name;
  playerId = `p_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  document.getElementById("name-entry").style.display = "none";
  document.getElementById("game-ui").style.display = "block";
  startGame();
};

// Start or join existing game
function startGame() {
  db.ref(".info/connected").on("value", snap => {
    if (snap.val()) {
      roomRef.child(`players/${playerId}`).onDisconnect().remove();
      roomRef.child(`hands/${playerId}`).onDisconnect().remove();
    }
  });
  roomRef.once("value").then(snap => {
    const data = snap.val();
    if (!data || !data.players) initGame();
    else joinGame(data);
  });
}

// Initialize game
function initGame() {
  const deck = shuffle(createDeck());
  roomRef.set({
    players: { [playerId]: playerName },
    playerList: [playerId],
    hands: { [playerId]: deck },
    pile: [],
    turnIndex: 0,
    rules
  });
  setupListeners();
}

// Join an existing game
function joinGame(data) {
  const pl = data.playerList || [];
  if (pl.includes(playerId)) return setupListeners();
  if (pl.length >= 8) return alert("Room Full");
  roomRef.update({
    players: { [playerId]: playerName },
    playerList: [...pl, playerId]
  }).then(() => redistributeCards([...pl, playerId]).then(setupListeners));
}

// Deal cards evenly
function redistributeCards(people) {
  return new Promise(resolve => {
    const deck = shuffle(createDeck());
    const chunk = Math.floor(deck.length / people.length);
    const hands = {};
    people.forEach((id, i) => {
      hands[id] = deck.slice(i * chunk, (i + 1) * chunk);
    });
    roomRef.child("hands").set(hands, resolve);
  });
}

// Setup realtime listeners and UI
function setupListeners() {
  roomRef.child(`hands/${playerId}`).on("value", snap => {
    myHand = snap.val() || [];
  });
  roomRef.child("pile").on("value", snap => {
    pile = snap.val() || [];
    renderPile();
  });
  roomRef.on("value", snap => {
    const d = snap.val() || {};
    const pl = d.playerList || [];
    const idx = d.turnIndex || 0;
    isMyTurn = pl[idx] === playerId;
    rules = d.rules || rules;
    updateControls();
    displayPlayers(pl, d);
  });

  document.addEventListener("keydown", e => {
    if (e.key === "a") playCard();
    if (e.code === "Space") slap();
  });
  document
    .getElementById("playCardBtn")
    .addEventListener("click", playCard);
  document.getElementById("slapBtn").addEventListener("click", slap);
  document.getElementById("restartBtn").onclick = restartGame;
}

// Update buttons based on turn
function updateControls() {
  document.getElementById("playCardBtn").disabled = !isMyTurn || myHand.length === 0;
}

// Show each player's card count and reaction times
function displayPlayers(list, data) {
  const el = document.getElementById("player-table");
  el.innerHTML = "";
  list.forEach(id => {
    const name = data.players?.[id] || id;
    const count = (data.hands?.[id] || []).length;
    const row = document.createElement("div");
    row.className = "player-row";
    if (id === playerId) row.classList.add("you");
    if (id === list[data.turnIndex]) row.classList.add("active");
    row.innerHTML = `
      <div class="title">${name}</div>
      <div class="count">Cards: ${count}</div>
      <div class="reaction">Play avg: ${calcAvg(stats.playTimes)}ms</div>
      <div class="reaction">Slap avg: ${calcAvg(stats.slapTimes)}ms</div>
    `;
    el.appendChild(row);
  });
}

// Render pile fanned out
function renderPile() {
  const container = document.getElementById("pileArea");
  container.innerHTML = "";
  const offset = 15;
  pile.forEach((card, i) => {
    const img = document.createElement("img");
    img.src = `cards/${card}.png`;
    img.className = "card-img";
    img.style.zIndex = i;
    img.style.transform = `rotate(${(i - pile.length / 2) * 2}deg) translateX(${(i - pile.length / 2) * 4}px)`;
    container.appendChild(img);
  });
}

// Play a card
function playCard() {
  if (!isMyTurn) return;
  const t0 = performance.now();
  const card = myHand.shift();
  roomRef.child("pile").transaction(p => (p || []).concat(card));
  roomRef.child(`hands/${playerId}`).set(myHand);
  recordReaction(stats.playTimes, performance.now() - t0);
  advanceTurn(card);
  flipAndCheckWin();
}

// Slap the pile
function slap() {
  const t0 = performance.now();
  if (!checkSlap(pile)) return; // removing turn restriction on slap
  const p = [...pile];
  roomRef.child(`hands/${playerId}`).transaction(h => (h || []).concat(p));
  roomRef.child("pile").remove();
  recordReaction(stats.slapTimes, performance.now() - t0);
}

// Advance turn with face-card logic
function advanceTurn(card) {
  const rank = card?.split("_")[0];
  roomRef.once("value").then(snap => {
    const d = snap.val() || {};
    const pl = d.playerList || [];
    let ti = d.turnIndex || 0;

    if (["jack", "queen", "king", "ace"].includes(rank)) {
      challenge = rank;
      chances = { jack:1, queen:2, king:3, ace:4 }[rank];
      challenger = pl[ti];
    } else if (challenge) {
      if (["jack", "queen", "king", "ace"].includes(rank)) {
        challenge = rank;
        chances = { jack:1, queen:2, king:3, ace:4 }[rank];
        challenger = pl[ti];
      } else {
        chances--;
        if (chances < 1) {
          const winner = challenger;
          const pileCards = d.pile || [];
          roomRef.child(`hands/${winner}`).transaction(h => (h || []).concat(pileCards));
          roomRef.child("pile").remove();
          challenge = null;
        }
      }
      return;
    }

    // normal turn rotation
    let next = ti, count = 0;
    do {
      next = (next + 1) % pl.length;
      const pid = pl[next];
      if ((d.hands?.[pid] || []).length > 0) break;
      count++;
    } while (count < pl.length);

    roomRef.child("turnIndex").set(next);
  });
}

// Flip animation and win check
function flipAndCheckWin() {
  const img = document.getElementById("pileArea").lastChild;
  if (img) {
    img.classList.add("flip");
    setTimeout(() => img.classList.remove("flip"), 300);
  }
  checkWin();
}

// Win detection
function checkWin() {
  roomRef.child("hands").once("value").then(s => {
    const h = s.val() || {};
    const alive = Object.entries(h).filter(([_, arr]) => arr.length);
    if (alive.length === 1 && alive[0][0] === playerId) {
      document.getElementById("win-screen").style.display = "flex";
    }
  });
}

// Restart game logic
function restartGame() {
  roomRef.once("value").then(s => {
    const data = s.val();
    const pl = data.playerList || [];
    const deck = shuffle(createDeck());
    const each = Math.floor(deck.length / pl.length);
    const hands = {};
    pl.forEach((id,i) => hands[id] = deck.slice(i * each, (i + 1) * each));
    roomRef.update({ hands, pile: [], turnIndex:0 });
    document.getElementById("win-screen").style.display = "none";
    challenge = null;
  });
}

// Slap rule checks
function checkSlap(p) {
  const len = p.length;
  if (len < 2) return false;

  const t = p[len-1].split("_")[0], s = p[len-2].split("_")[0];
  if (rules.doubles && t === s) return true;
  if (rules.topbottom && p[0].split("_")[0] === t) return true;
  if (rules.kq && ((t==="king"&&s==="queen")||(t==="queen"&&s==="king"))) return true;
  if (rules.sandwich && len >= 3 && p[len-3].split("_")[0] === t) return true;
  if (rules.sum10 && +t + +s === 10) return true;
  if (rules.run4 && len >= 4) {
    const nums = p.slice(-4).map(c => {
      const r = c.split("_")[0];
      if (r==="jack") return 11;
      if (r==="queen") return 12;
      if (r==="king") return 13;
      if (r==="ace") return 14;
      return +r;
    }).sort((a,b) => a - b);
    return nums[0]+1===nums[1] && nums[1]+1===nums[2] && nums[2]+1===nums[3];
  }
  return false;
}

// Utility functions
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function createDeck() {
  const suits = ["hearts","diamonds","clubs","spades"];
  const ranks = ["2","3","4","5","6","7","8","9","10","jack","queen","king","ace"];
  return [].concat(...suits.map(s => ranks.map(r => `${r}_of_${s}`)));
}
function recordReaction(arr, ms) {
  arr.push(ms);
  if (arr.length > 20) arr.shift();
}
function calcAvg(arr) {
  if (!arr.length) return "-";
  return Math.round(arr.reduce((a,b)=>a+b)/arr.length);
}
