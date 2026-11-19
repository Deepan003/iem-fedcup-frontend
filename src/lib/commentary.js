/**
 * Announcer script for the auction voice.
 * Many variations per moment; `line()` never repeats a recent line for the same moment.
 * Vars: a = amount with unit ("2.5 crore"), n = bare number ("2.5"), t = team, t2 = rival team,
 * p = player, base = base price, bits = position/tier intro, title = event title, bids = bid count, x = "double"…
 */
const L = {
  welcome: [
    (v) => `Welcome to the ${v.title}! Let's get started.`,
    (v) => `Good evening, and welcome to the ${v.title}! Let the bidding begin!`,
    (v) => `Welcome, everyone, to the ${v.title}! It's auction time!`,
    (v) => `Ladies and gentlemen, the ${v.title} is now live!`,
    (v) => `Captains, get ready. The ${v.title} starts now!`,
    (v) => `It's here! Welcome to the ${v.title}. Purses are full, and the players are waiting!`,
    (v) => `Lights on, paddles up! Welcome to the ${v.title}!`,
  ],
  next: [
    (v) => `Next up: ${v.p}. ${v.bits}Base price, ${v.base}.`,
    (v) => `Coming to the block: ${v.p}. ${v.bits}Starting at ${v.base}.`,
    (v) => `Here's our next player, ${v.p}. ${v.bits}Base price, ${v.base}.`,
    (v) => `On the block now, ${v.p}! ${v.bits}We start at ${v.base}.`,
    (v) => `Let's welcome ${v.p}. ${v.bits}Bidding starts at ${v.base}.`,
    (v) => `Next name in the hat: ${v.p}. ${v.bits}Base, ${v.base}.`,
    (v) => `Up next, it's ${v.p}! ${v.bits}Opening price, ${v.base}.`,
    (v) => `And now, ${v.p}. ${v.bits}${v.base} to start.`,
  ],
  flavor: {
    gk: ['A safe pair of hands. ', 'Every team needs a wall. ', 'Shot-stopper alert. ', 'Who needs a keeper? '],
    def: ['Solid at the back. ', 'A rock in defence. ', 'Nobody gets past easily. ', 'Defence wins titles. '],
    mid: ['The engine of the team. ', 'Runs the show in midfield. ', 'Vision and passing. ', 'Midfield control right here. '],
    fwd: ['Goals, goals, goals. ', 'A real finisher. ', 'Danger in the box. ', 'Looking for a striker? '],
  },
  open: [
    () => 'Bidding is open!',
    () => 'The floor is open. Who wants this player?',
    () => "Bidding is open. Let's see those paddles!",
    () => 'Over to the captains. Bidding is open!',
    () => 'Clock is running. Make your move!',
    () => "We're live! Who's going first?",
    () => 'Paddles ready… bidding is open!',
    () => 'Go! Bidding is open!',
    () => "Captains, it's your call. Bidding open!",
  ],
  firstBid: [
    (v) => `We have an opening bid! ${v.t}, ${v.a}.`,
    (v) => `${v.t} get us started at ${v.a}!`,
    (v) => `First paddle up, ${v.t}! ${v.a}.`,
    (v) => `${v.t} open the bidding. ${v.a}.`,
    (v) => `And we're away! ${v.a} from ${v.t}.`,
    (v) => `${v.t} want this one. ${v.a} to start.`,
  ],
  // quick-fire calls while bids land seconds apart: short, so the voice keeps up with the room
  rapid: [
    (v) => `${v.n}!`, (v) => `${v.n}!`, (v) => `${v.n}, ${v.t}!`, (v) => `${v.t}, ${v.n}!`,
    (v) => `${v.n} now!`, (v) => `${v.n}… ${v.t}!`, (v) => `${v.n}, back to ${v.t}!`, (v) => `Now ${v.n}!`,
  ],
  bid: [
    (v) => `${v.a}, ${v.t}.`, (v) => `${v.t}, ${v.a}.`, (v) => `${v.a} from ${v.t}.`,
    (v) => `${v.t} bid ${v.a}.`, (v) => `${v.a} with ${v.t}.`, (v) => `${v.t} come in at ${v.a}.`,
    (v) => `I have ${v.a}, ${v.t}.`, (v) => `${v.a}. ${v.t} lead.`, (v) => `${v.t} raise it, ${v.a}.`,
    (v) => `${v.a} is the bid, ${v.t}.`,
  ],
  bidHot: [
    (v) => `${v.t} go to ${v.a}!`, (v) => `${v.a} now, ${v.t}!`, (v) => `${v.a}, ${v.t}! It's heating up!`,
    (v) => `${v.t} won't back down! ${v.a}!`, (v) => `Up it goes! ${v.a}, ${v.t}!`, (v) => `${v.a}! ${v.t} mean business!`,
    (v) => `${v.t} push it to ${v.a}!`, (v) => `${v.a} on the board, ${v.t}!`, (v) => `Who blinks first? ${v.a}, ${v.t}!`,
    (v) => `${v.t}, ${v.a}. The pressure's on!`, (v) => `Now ${v.a}! ${v.t} in front!`,
  ],
  bidHuge: [
    (v) => `${v.a}! ${v.t}!`, (v) => `${v.a} from ${v.t}! This is getting serious!`, (v) => `Wow! ${v.a}, ${v.t}!`,
    (v) => `Incredible! ${v.t} go to ${v.a}!`, (v) => `${v.a}! The crowd can't believe it!`, (v) => `${v.t} are all in! ${v.a}!`,
    (v) => `Big money! ${v.a}, ${v.t}!`, (v) => `${v.a}! Where will this end?`, (v) => `Unreal! ${v.a} from ${v.t}!`,
    (v) => `${v.t} breaking the bank! ${v.a}!`, (v) => `Sky high! ${v.a}, ${v.t}!`, (v) => `${v.a}! What a battle!`,
  ],
  newTeam: [
    (v) => `And here come ${v.t}! ${v.a}!`, (v) => `${v.t} join the party! ${v.a}.`, (v) => `A new challenger! ${v.t}, ${v.a}!`,
    (v) => `Look who's in! ${v.t} at ${v.a}.`, (v) => `${v.t} enter the race! ${v.a}.`, (v) => `${v.t} want a piece of this! ${v.a}!`,
  ],
  jump: [
    (v) => `Whoa! A big jump! ${v.t}, ${v.a}!`, (v) => `${v.t} jump straight to ${v.a}!`, (v) => `Statement bid! ${v.a} from ${v.t}!`,
    (v) => `No messing about! ${v.t} go ${v.a}!`, (v) => `${v.t} skip ahead to ${v.a}!`, (v) => `That's a power move! ${v.a}, ${v.t}!`,
  ],
  war: [
    (v) => `It's ${v.t} versus ${v.t2}! ${v.a}!`, (v) => `Back and forth! ${v.a}, ${v.t}!`, (v) => `${v.t} and ${v.t2} going toe to toe! ${v.a}!`,
    (v) => `A two-horse race! ${v.t} at ${v.a}!`, (v) => `${v.t2} raised, ${v.t} hit back! ${v.a}!`, (v) => `Neither side giving in! ${v.a}, ${v.t}!`,
    (v) => `What a duel! ${v.a}, ${v.t}!`, (v) => `${v.t} answer ${v.t2}! ${v.a}!`,
  ],
  milestone: [
    (v) => `${v.a}, ${v.t}! That's ${v.x} the base price!`, (v) => `${v.x} the base! ${v.a}, ${v.t}!`,
    (v) => `We've gone ${v.x} the starting price! ${v.a}, ${v.t}!`, (v) => `${v.a}! ${v.x} the base, and still going!`,
    (v) => `${v.t} take it to ${v.a}. That's ${v.x} the base!`,
  ],
  closed: [
    () => 'Bidding is closed.', () => 'And bidding is closed.', () => 'Time is up!', () => "That's time!",
    () => 'Clock stops. Bidding closed.', () => 'No more bids. Closed!',
  ],
  goingOnce: [
    () => 'Going once…', () => 'Going once…', () => 'Any more? Going once…', () => 'Fair warning… going once…', () => 'Last call… going once…',
  ],
  goingTwice: [
    () => 'Going twice…', () => 'Last chance… going twice…', () => 'Going twice…', () => 'Anyone? Going twice…', () => 'Final chance… going twice…',
  ],
  sold: [
    (v) => `Sold! ${v.p}, to ${v.t}, for ${v.a}!`, (v) => `And it's sold! ${v.p} goes to ${v.t} for ${v.a}!`,
    (v) => `Hammer down! ${v.p} joins ${v.t} for ${v.a}!`, (v) => `Sold, to ${v.t}! ${v.p}, for ${v.a}.`,
    (v) => `${v.p} is a ${v.t} player! ${v.a}!`, (v) => `Done deal! ${v.t} sign ${v.p} for ${v.a}.`,
    (v) => `Sold for ${v.a}! Welcome to ${v.t}, ${v.p}!`, (v) => `That's a sale! ${v.p}, ${v.t}, ${v.a}.`,
    (v) => `Sold! ${v.t} get their player. ${v.p}, ${v.a}.`,
  ],
  soldBig: [
    (v) => `Sold! What a signing! ${v.p} to ${v.t} for ${v.a}!`, (v) => `Hammer down! ${v.t} land ${v.p} for a massive ${v.a}!`,
    (v) => `Sold! ${v.t} pay big, ${v.a}, for ${v.p}!`, (v) => `Blockbuster! ${v.p} goes to ${v.t} for ${v.a}!`,
    (v) => `What a moment! ${v.p}, sold to ${v.t}, for ${v.a}!`, (v) => `Sold! ${v.a}! ${v.t} get their superstar, ${v.p}!`,
    (v) => `The hammer falls at ${v.a}! ${v.p} is going to ${v.t}!`,
  ],
  soldWar: [
    (v) => `After ${v.bids} bids, it's over! ${v.p} to ${v.t} for ${v.a}!`, (v) => `What a battle! ${v.bids} bids, and ${v.t} win it! ${v.p}, ${v.a}!`,
    (v) => `${v.t} win the war! ${v.p}, sold for ${v.a}!`,
  ],
  soldBase: [
    (v) => `Sold at the base price! ${v.p} to ${v.t}, ${v.a}. That's a bargain!`, (v) => `A steal! ${v.t} get ${v.p} for just ${v.a}!`,
    (v) => `Sold! ${v.p} to ${v.t} at ${v.a}. Smart buy!`, (v) => `No competition! ${v.t} take ${v.p} for ${v.a}.`,
  ],
  record: [
    () => "That's a new auction record!", () => 'History made! A brand new auction record!', () => 'Unbelievable! A new record!',
    () => 'Record broken! Nobody has gone higher!', () => 'The most expensive player of the auction!', () => 'A new record! Remember this moment!',
  ],
  unsold: [
    (v) => `No takers. ${v.p} goes unsold.`, (v) => `${v.p} goes unsold, for now.`, (v) => `Nothing doing. ${v.p} is unsold.`,
    (v) => `No bids for ${v.p}. Unsold.`, (v) => `Silence in the room. ${v.p} is unsold.`, (v) => `Unsold. ${v.p} may be back in a later round.`,
    (v) => `The captains pass on ${v.p}. Unsold.`,
  ],
  paused: [
    () => "We'll take a short break.", () => 'The auction is paused.', () => 'Quick pause, folks. Stay with us.',
    () => "Let's take a breather. We'll be right back.", () => "Time out! Don't go anywhere.", () => 'A short break. Captains, check those purses!',
  ],
  resumed: [
    () => "And we're back!", () => "We're back. Let's carry on!", () => "Break's over! Back to the bidding!",
    () => 'Welcome back! Where were we?', () => "Right, let's go again!",
  ],
  soundCheck: [
    () => 'Sound check! Can everyone hear me? One, two, three!',
    () => 'Testing, testing! If you can hear this, the studio sound is working!',
    () => "Sound check! Good evening, everyone. We're ready when you are!",
  ],
  end: [
    () => 'And that is full time on the auction! Thank you all for watching!', () => "That's a wrap! Thank you, everyone, for an amazing auction!",
    () => 'The auction is complete! The squads are set. See you on the pitch!', () => "That's the final hammer! What a night. Thank you all!",
  ],
};

const recent = new Map();

/** A random line for a moment, avoiding the ones used most recently. */
export function line(key, vars = {}) {
  const list = L[key];
  if (!list?.length) return '';
  const used = recent.get(key) || [];
  let pool = list.map((_, i) => i).filter((i) => !used.includes(i));
  if (!pool.length) pool = list.map((_, i) => i);
  const i = pool[Math.floor(Math.random() * pool.length)];
  recent.set(key, [...used, i].slice(-Math.max(1, Math.min(list.length - 2, 6))));
  return list[i](vars);
}

/** A short flavour phrase for a position ("A rock in defence. "), or '' (not every time, so it stays fresh). */
export function flavor(position) {
  const p = String(position || '').toLowerCase();
  const k = /goal|keeper|gk/.test(p) ? 'gk' : /def|back/.test(p) ? 'def' : /mid/.test(p) ? 'mid' : /for|strik|wing|att|fwd/.test(p) ? 'fwd' : null;
  if (!k || Math.random() < 0.4) return '';
  const arr = L.flavor[k];
  return arr[Math.floor(Math.random() * arr.length)];
}

const MULT_WORD = { 2: 'double', 3: 'triple', 4: 'four times', 5: 'five times', 10: 'ten times' };
/** "double" / "triple" / … when going from prevMult to nowMult (multiples of base) crosses a milestone. */
export function milestoneWord(prevMult, nowMult) {
  const hit = [10, 5, 4, 3, 2].find((m) => prevMult < m && nowMult >= m);
  return hit ? MULT_WORD[hit] : null;
}
