// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAV0ZgEYMupAu9b8xZRuNV00HUouElztrw",
  authDomain: "iupaers.firebaseapp.com",
  databaseURL: "https://iupaers-default-rtdb.firebaseio.com",
  projectId: "iupaers",
  storageBucket: "iupaers.firebasestorage.app",
  messagingSenderId: "988099496172",
  appId: "1:988099496172:web:2a8a39ebe6c7d2ac257dc9"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const roomRef = db.ref(`rooms/ers-game-1`);
const playerId = `player_${Math.random().toString(36).substr(2,5)}`;

let myHand = [], pile = [], isMyTurn = false;
let rules = { doubles:true, topbottom:true, kq:true, sandwich:true, sum10:true, run4:true };
let challenge = null, chances = 0, challenger = null;

// 🧼 Presence Cleanup
db.ref(".info/connected").on("value", snap => {
  if (snap.val()) {
    roomRef.child(`players/${playerId}`).onDisconnect().remove();
    roomRef.child(`hands/${playerId}`).onDisconnect().remove();
    roomRef.child(`presence/${playerId}`).onDisconnect().remove(); // optional presence node
  }
});

// ⚙️ Initialize or Join Game
roomRef.once('value').then(snap => {
  const data = snap.val();
  if (!data || !data.players) initGame();
  else joinGame(data);
});

function initGame() {
  const deck = shuffle(createDeck());
  roomRef.set({
    players: { [playerId]: true },
    playerList: [playerId],
    hands: { [playerId]: deck },
    pile: [],
    turnIndex: 0,
    rules
  });
  setup();
}

function joinGame(data) {
  const pl = data.playerList || [];
  if (pl.includes(playerId)) return setup();
  if (pl.length >= 8) return alert("Room full (8 players max)");
  roomRef.update({
    [`players/${playerId}`]: true,
    playerList: [...pl, playerId]
  }).then(() => redistribute([...pl, playerId]).then(setup));
}

function redistribute(list) {
  return new Promise(res => {
    const deck = shuffle(createDeck());
    const each = Math.floor(deck.length / list.length);
    const hands = {};
    list.forEach((id, i) => (hands[id] = deck.slice(i * each, (i + 1) * each)));
    roomRef.child("hands").set(hands, res);
  });
}

// 🧩 Setup UI, listeners
function setup() {
  roomRef.child(`hands/${playerId}`).on('value', s => myHand = s.val() || []);
  roomRef.child('pile').on('value', s => { pile = s.val() || []; updatePile(); });
  roomRef.on('value', s => {
    const d = s.val() || {}, list = d.playerList || [], ti = d.turnIndex || 0;
    isMyTurn = list[ti] === playerId;
    Object.assign(rules, d.rules || rules);
    displayPlayers(list);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'a') playCard();
    if (e.code === 'Space') { e.preventDefault(); slap(); }
  });

  document.getElementById('playCardBtn').onclick = playCard;
  document.getElementById('slapBtn').onclick = slap;
  document.getElementById('restartBtn').onclick = restartGame;

  ['doubles','topbottom','kq','sandwich','sum10','run4'].forEach(r => {
    document.getElementById(`rule-${r}`).onchange = e => {
      rules[r] = e.target.checked;
      roomRef.child('rules').set(rules);
    };
  });
}

// 👥 Show player list
function displayPlayers(list) {
  const el = document.getElementById('player-list');
  el.innerHTML = list
    .map(id => `<div class="plr">${id === playerId ? 'You' : id}</div>`)
    .join('');
}

// 🎴 Play a card
function playCard() {
  if (!isMyTurn || !myHand.length) return;
  const card = myHand.shift();
  roomRef.child('pile').transaction(p => (p || []).concat(card));
  roomRef.child(`hands/${playerId}`).set(myHand)
    .then(() => roomRef.child('hands').once('value').then(s => checkWin(s.val())));
  flipCard();
  advanceTurn(card);
}

// 🔄 Animate flip
function flipCard() {
  const img = document.getElementById('pile-card');
  img.classList.add('flip');
  setTimeout(() => img.classList.remove('flip'), 300);
}

// 👊 Slap logic
function slap() {
  roomRef.child('pile').once('value').then(s => {
    const p = s.val() || [];
    if (checkSlap(p)) {
      roomRef.child(`hands/${playerId}`).once('value').then(h => {
        const nh = (h.val() || []).concat(p);
        roomRef.child(`hands/${playerId}`).set(nh)
          .then(() => roomRef.child('hands').once('value').then(s2 => checkWin(s2.val())));
        roomRef.child('pile').set([]);
      });
    } else {
      const burn = myHand.shift();
      roomRef.child('pile').transaction(p => {
        p = p || [];
        if (burn) p.unshift(burn);
        return p;
      });
      roomRef.child(`hands/${playerId}`).set(myHand);
    }
  });
}

// 🔁 Turn logic with face-card handling
function advanceTurn(lastCard) {
  roomRef.once('value').then(s => {
    const d = s.val() || {}, list = d.playerList || [], hands = d.hands || {}, pls = d.players || {};
    let ti = d.turnIndex || 0;

    const rank = lastCard?.split('_')[0];
    if (['jack', 'queen', 'king', 'ace'].includes(rank)) {
      challenge = rank;
      chances = { jack:1, queen:2, king:3, ace:4 }[rank];
      challenger = list[ti];
    } else if (challenge) {
      if (['jack', 'queen', 'king', 'ace'].includes(rank)) {
        challenge = rank;
        chances = { jack:1, queen:2, king:3, ace:4 }[rank];
        challenger = list[ti];
      } else {
        chances--;
        if (chances <= 0) {
          // Challenger wins pile
          const pileCards = d.pile || [];
          roomRef.child(`hands/${challenger}`).once('value').then(h => {
            const newH = (h.val() || []).concat(pileCards);
            roomRef.child(`hands/${challenger}`).set(newH);
            roomRef.child('pile').set([]);
            challenge = null; chances = 0;
            roomRef.child('hands').once('value').then(s2 => checkWin(s2.val()));
          });
        }
      }
    }

    if (!challenge) {
      let next = ti, attempts = 0;
      do {
        next = (next + 1) % list.length;
        const pid = list[next];
        if (pls[pid] && (hands[pid] || []).length) break;
        attempts++;
      } while (attempts < list.length);
      roomRef.child('turnIndex').set(next);
    } else {
      roomRef.child('turnIndex').set(ti);
    }
  });
}

// ✅ Slap rule checks
function checkSlap(p) {
  const len = p.length;
  if (len < 2) return false;
  const top = p[len-1].split('_')[0], sec = p[len-2].split('_')[0];
  if (rules.doubles && top === sec) return true;
  if (rules.topbottom && p[0].split('_')[0] === top) return true;
  if (rules.kq && ((top==='king'&&sec==='queen')||(top==='queen'&&sec==='king'))) return true;
  if (rules.sandwich && len >= 3 && p[len-3].split('_')[0] === top) return true;
  if (rules.sum10 && !isNaN(top) && !isNaN(sec) && Number(top) + Number(sec) === 10) return true;
  if (rules.run4 && len >= 4) {
    const nums = p.slice(-4)
      .map(c => ({ 'jack':11, 'queen':12, 'king':13, 'ace':14 }[c.split('_')[0]] ?? +c.split('_')[0]))
      .sort((a,b) => a-b);
    return nums[0] + 1 === nums[1] && nums[1] + 1 === nums[2] && nums[2] + 1 === nums[3];
  }
  return false;
}

// 🏆 Win logic
function checkWin(hands) {
  const alive = Object.entries(hands).filter(([_,h]) => h.length);
  if (alive.length === 1 && alive[0][0] === playerId) {
    document.getElementById('win-screen').style.display = 'flex';
  }
}

// 🔁 Restart game
function restartGame() {
  roomRef.once('value').then(s => {
    const data = s.val(), players = data.playerList || [];
    const deck = shuffle(createDeck()), each = Math.floor(deck.length / players.length);
    const hands = {};
    players.forEach((id, i) => hands[id] = deck.slice(i * each, (i + 1) * each));
    roomRef.update({ hands, pile: [], turnIndex: 0 });
    document.getElementById('win-screen').style.display = 'none';
    challenge = null; chances = 0; challenger = null;
  });
}

// 🔧 Helpers
function updatePile() {
  const img = document.getElementById('pile-card');
  img.src = pile.length ? `cards/${pile[pile.length-1]}.png` : `cards/back_of_card.png`;
}
function createDeck() {
  return ['hearts','diamonds','clubs','spades'].flatMap(s =>
    ['2','3','4','5','6','7','8','9','10','jack','queen','king','ace']
      .map(r => `${r}_of_${s}`)
  );
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
