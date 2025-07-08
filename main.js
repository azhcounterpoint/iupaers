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

const roomRef = db.ref(`rooms/ers-room-1`);
const playerId = `player_${Math.random().toString(36).substr(2,5)}`;

let myHand = [], pile = [], isMyTurn = false;
let rules = { doubles:true, topbottom:true, kq:true, sandwich:true, sum10:true, run4:true };

let challenge=null, chances=0, challenger=null;

// Presence cleanup
db.ref(".info/connected").on("value",snap=>{
  if(snap.val()){
    roomRef.child(`players/${playerId}`).onDisconnect().remove();
    roomRef.child(`hands/${playerId}`).onDisconnect().remove();
    roomRef.child("playerList").onDisconnect().transaction(list=>
      list?.filter(id=>id!==playerId));
  }
});

// Start or join game
roomRef.once('value').then(snap=>{
  const data=snap.val();
  if(!data || !data.players) initGame();
  else joinGame(data);
});
function initGame(){
  const deck=shuffle(createDeck());
  roomRef.set({
    players:{[playerId]:true},
    playerList:[playerId],
    hands:{[playerId]:deck},
    pile:[], turnIndex:0,
    rules
  });
  setup();
}
function joinGame(data){
  const pl=data.playerList||[];
  if(pl.includes(playerId)) return setup();
  if(pl.length>=8) return alert("Room full");
  roomRef.update({
    [`players/${playerId}`]:true,
    playerList:[...pl,playerId]
  }).then(()=>redistribute([...pl,playerId]).then(setup));
}
function redistribute(list){
  return new Promise(r=>{
    const deck=shuffle(createDeck()), chunk=Math.floor(deck.length/list.length);
    const hands=list.reduce((h,id,i)=>(h[id]=deck.slice(i*chunk,(i+1)*chunk),h),{});
    roomRef.child("hands").set(hands,r);
  });
}

// Setup UI and listeners
function setup(){
  roomRef.child(`hands/${playerId}`).on('value',snap=>myHand=snap.val()||[]);
  roomRef.child('pile').on('value',snap=>{pile=snap.val()||[]; updatePile();});
  roomRef.on('value',snap=>{
    const d=snap.val()||{}, pl=d.playerList||[], ti=d.turnIndex||0;
    isMyTurn=pl[ti]===playerId;
    Object.assign(rules,d.rules);
    displayPlayers(pl);
  });

  document.addEventListener('keydown',e=>{
    if(e.key==='a') playCard();
    if(e.code==='Space'){e.preventDefault(); slap();}
  });
  document.getElementById('playCardBtn').onclick=playCard;
  document.getElementById('slapBtn').onclick=slap;
  document.getElementById('restartBtn').onclick=()=>window.location.reload();

  ['doubles','topbottom','kq','sandwich','sum10','run4'].forEach(r=>{
    document.getElementById(`rule-${r}`).onchange=e=>{
      rules[r]=e.target.checked;
      roomRef.child('rules').set(rules);
    };
  });
}

// Show player list
function displayPlayers(list){
  const el=document.getElementById('player-list');
  el.innerHTML = list.map(id=>`<div class="plr">${id===playerId?"You":id}</div>`).join('');
}

// Game actions
function playCard(){
  if(!isMyTurn||!myHand.length) return;
  const card=myHand.shift();
  roomRef.child('pile').transaction(p=>(p||[]).concat(card));
  roomRef.child(`hands/${playerId}`).set(myHand)
    .then(()=>roomRef.child('hands').once('value').then(s=>checkWin(s.val())));
  flipCard();
  advance(card);
}

function flipCard(){
  const img=document.getElementById('pile-card');
  img.classList.add('flip');
  setTimeout(()=>img.classList.remove('flip'),300);
}

// Slap logic
function slap(){
  roomRef.child('pile').once('value').then(snap=>{
    const p=snap.val()||[];
    if(checkSlap(p)){
      roomRef.child(`hands/${playerId}`).once('value').then(h=>{
        const nh=(h.val()||[]).concat(p);
        roomRef.child(`hands/${playerId}`).set(nh)
          .then(()=>roomRef.child('hands').once('value').then(s=>checkWin(s.val())));
        roomRef.child('pile').set([]);
      });
    } else {
      const burn=myHand.shift();
      roomRef.child

