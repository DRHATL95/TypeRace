import pool from './db/pool';
import { TextPassage, Difficulty, PassageCategory, RoomMode } from './types';

// ── Public API ────────────────────────────────────────────

export async function getPassages(difficulty?: Difficulty, category?: PassageCategory): Promise<TextPassage[]> {
  const conditions: string[] = [];
  const params: (string | null)[] = [];

  if (difficulty) {
    params.push(difficulty);
    conditions.push(`difficulty = $${params.length}`);
  }
  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query<TextPassage>(
    `SELECT id, title, text, difficulty, category FROM passages ${where} ORDER BY title`,
    params
  );
  return rows;
}

export async function getRandomPassage(
  difficulty?: Difficulty,
  category?: PassageCategory,
  excludeIds?: string[],
): Promise<TextPassage | null> {
  const conditions: string[] = [];
  const params: (string | string[] | null)[] = [];

  if (difficulty) {
    params.push(difficulty);
    conditions.push(`difficulty = $${params.length}`);
  }
  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }
  if (excludeIds && excludeIds.length > 0) {
    params.push(excludeIds);
    conditions.push(`id <> ALL($${params.length}::text[])`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT id, title, text, difficulty, category FROM passages ${where} ORDER BY RANDOM() LIMIT 1`;
  const { rows } = await pool.query<TextPassage>(sql, params);
  if (rows[0]) return rows[0];

  // Pool exhausted with exclusions — retry without them so we never return null
  // to a caller that has valid difficulty/category filters.
  if (excludeIds && excludeIds.length > 0) {
    return getRandomPassage(difficulty, category);
  }
  return null;
}

export async function insertPassage(passage: TextPassage): Promise<void> {
  await pool.query(
    `INSERT INTO passages (id, title, text, difficulty, category)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [passage.id, passage.title, passage.text, passage.difficulty, passage.category]
  );
}

export async function getPassageCount(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>('SELECT COUNT(*) as count FROM passages');
  return parseInt(rows[0].count, 10);
}

export interface LeaderboardEntry {
  player_name: string;
  wpm: number;
  accuracy: number;
  fire_streak: number;
}

export async function insertRaceResult(result: {
  player_name: string;
  wpm: number;
  accuracy: number;
  fire_streak: number;
  difficulty: Difficulty;
  category: PassageCategory;
  user_id?: string | null;
}): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO race_results (player_name, wpm, accuracy, fire_streak, difficulty, category, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [result.player_name, result.wpm, result.accuracy, result.fire_streak, result.difficulty, result.category, result.user_id || null]
  );
  return rows[0].id;
}

export async function getTodayLeaderboard(): Promise<{ topWpm: LeaderboardEntry[]; topStreak: LeaderboardEntry[] }> {
  const [wpmResult, streakResult] = await Promise.all([
    pool.query<LeaderboardEntry>(
      `SELECT player_name, wpm, accuracy, fire_streak
       FROM race_results
       WHERE created_at::date = CURRENT_DATE
       ORDER BY wpm DESC
       LIMIT 5`
    ),
    pool.query<LeaderboardEntry>(
      `SELECT player_name, wpm, accuracy, fire_streak
       FROM race_results
       WHERE created_at::date = CURRENT_DATE
       ORDER BY fire_streak DESC
       LIMIT 5`
    ),
  ]);
  return { topWpm: wpmResult.rows, topStreak: streakResult.rows };
}

// ── Shares ───────────────────────────────────────────────

export interface ShareData {
  id: string;
  wpm: number;
  accuracy: number;
  fire_streak: number;
  difficulty: string;
  category: string;
  rank_label: string | null;
  player_name: string | null;
  created_at: string;
}

export async function createShare(share: {
  id: string;
  user_id?: string | null;
  wpm: number;
  accuracy: number;
  fire_streak: number;
  difficulty: Difficulty;
  category: PassageCategory;
  rank_label: string;
  player_name?: string | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO shares (id, user_id, wpm, accuracy, fire_streak, difficulty, category, rank_label, player_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [share.id, share.user_id || null, share.wpm, share.accuracy, share.fire_streak, share.difficulty, share.category, share.rank_label, share.player_name || null]
  );
}

export async function getShare(id: string): Promise<ShareData | null> {
  const { rows } = await pool.query<ShareData>(
    `SELECT id, wpm, accuracy, fire_streak, difficulty, category, rank_label, player_name, created_at FROM shares WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

// ── Monthly Leaderboard ─────────────────────────────────

export interface MonthlyLeaderboardEntry {
  player_name: string;
  wpm: number;
  accuracy: number;
  fire_streak: number;
  race_count: number;
}

export async function getMonthlyLeaderboard(): Promise<MonthlyLeaderboardEntry[]> {
  const { rows } = await pool.query<MonthlyLeaderboardEntry>(`
    SELECT DISTINCT ON (COALESCE(user_id, player_name))
      player_name,
      wpm,
      accuracy,
      fire_streak,
      (SELECT COUNT(*)::int FROM race_results r2
         WHERE r2.created_at >= date_trunc('month', CURRENT_DATE)
           AND COALESCE(r2.user_id, r2.player_name) = COALESCE(race_results.user_id, race_results.player_name)
      ) AS race_count
    FROM race_results
    WHERE created_at >= date_trunc('month', CURRENT_DATE)
    ORDER BY COALESCE(user_id, player_name), wpm DESC
  `);

  // Sort by wpm descending and limit to 100
  rows.sort((a, b) => b.wpm - a.wpm);
  return rows.slice(0, 100);
}

// ── Multiplayer Results ──────────────────────────────────

export async function insertMultiplayerResult(result: {
  match_id: string;
  room_code: string;
  mode: RoomMode;
  user_id: string | null;
  player_name: string;
  wpm: number;
  accuracy: number;
  fire_streak: number;
  rank: number;
  difficulty: Difficulty;
  category: PassageCategory;
}): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO multiplayer_results
       (match_id, room_code, mode, user_id, player_name, wpm, accuracy, fire_streak, rank, difficulty, category)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [result.match_id, result.room_code, result.mode, result.user_id, result.player_name,
     result.wpm, result.accuracy, result.fire_streak, result.rank, result.difficulty, result.category]
  );
  return rows[0].id;
}

// ── Seed ──────────────────────────────────────────────────

const SEED_PASSAGES: TextPassage[] = [
  // ═══ SENTENCES: Easy ═══
  { id: 's-e-1', title: 'The Quick Brown Fox', text: 'The quick brown fox jumps over the lazy dog. This sentence contains every letter of the alphabet and is perfect for testing typing speed.', difficulty: 'easy', category: 'sentences' },
  { id: 's-e-2', title: 'Programming Wisdom', text: "Code is like humor. When you have to explain it, it's bad. The best code is self-documenting and reads like a story.", difficulty: 'easy', category: 'sentences' },
  { id: 's-e-3', title: 'Creative Expression', text: 'Art transcends language barriers and cultural differences, speaking directly to the human soul through colors, shapes, and emotions that words cannot capture.', difficulty: 'easy', category: 'sentences' },
  { id: 's-e-4', title: 'Morning Coffee', text: 'There is something deeply comforting about the first cup of coffee in the morning, when the world is still quiet and full of possibility.', difficulty: 'easy', category: 'sentences' },
  { id: 's-e-5', title: 'A Walk Outside', text: 'A short walk in the fresh air can clear your head faster than any other remedy. The sun on your face reminds you that the world is bigger than your worries.', difficulty: 'easy', category: 'sentences' },
  { id: 's-e-6', title: 'Simple Joys', text: 'The smell of fresh bread, the sound of rain on a window, a familiar song on the radio. These small things are what a good life is really made of.', difficulty: 'easy', category: 'sentences' },
  { id: 's-e-7', title: 'Books Are Doors', text: 'A book is a door you can open on any rainy afternoon. Behind it waits a world, a voice, or a stranger who will feel like an old friend by the last page.', difficulty: 'easy', category: 'sentences' },
  { id: 's-e-8', title: 'Weekend Plans', text: 'Saturday mornings are for pancakes and slow coffee. The rest of the day can sort itself out later, once the sun has had time to finish climbing the sky.', difficulty: 'easy', category: 'sentences' },
  { id: 's-e-9', title: 'Dogs Know', text: 'Dogs know exactly when you need them. They rest their head on your knee without being asked and remind you that the day is not as heavy as it felt.', difficulty: 'easy', category: 'sentences' },
  { id: 's-e-10', title: 'Kind Words', text: 'A kind word costs nothing but can change the shape of a stranger\'s whole afternoon. Say the nice thing. You rarely regret it and they rarely forget it.', difficulty: 'easy', category: 'sentences' },
  { id: 's-e-11', title: 'Learn Something', text: 'Try to learn one small thing every day. Over a year it becomes hundreds of things, and over a lifetime it becomes the person you are proud to have become.', difficulty: 'easy', category: 'sentences' },
  { id: 's-e-12', title: 'Night Sky', text: 'On a clear night, far from the city lights, the sky reveals more stars than you could count in a hundred lifetimes. It is humbling in the best possible way.', difficulty: 'easy', category: 'sentences' },

  // ═══ SENTENCES: Medium ═══
  { id: 's-m-1', title: "Nature's Beauty", text: 'The morning sun painted the sky in brilliant shades of orange and pink, casting long shadows across the dew-covered meadow where wildflowers danced in the gentle breeze.', difficulty: 'medium', category: 'sentences' },
  { id: 's-m-2', title: 'Technology Revolution', text: 'Artificial intelligence and machine learning are transforming industries at an unprecedented pace, creating both opportunities and challenges for society as we navigate this digital transformation.', difficulty: 'medium', category: 'sentences' },
  { id: 's-m-3', title: 'Space Exploration', text: "Humanity's quest to explore the cosmos represents our most ambitious undertaking, pushing the boundaries of technology and human endurance in pursuit of knowledge beyond our atmosphere.", difficulty: 'medium', category: 'sentences' },
  { id: 's-m-4', title: 'Environmental Stewardship', text: "Climate change represents humanity's greatest challenge, requiring unprecedented global cooperation and innovation to preserve our planet for future generations who will inherit what we leave behind.", difficulty: 'medium', category: 'sentences' },
  { id: 's-m-5', title: 'Urban Rhythms', text: 'Every city has a rhythm of its own, written in the timing of its traffic lights, the cadence of its commuters, and the quiet minute just before the morning rush arrives in full force.', difficulty: 'medium', category: 'sentences' },
  { id: 's-m-6', title: 'The Library', text: 'A good library is a quiet argument against cynicism. It insists that knowledge has always been worth preserving and that curiosity is one of the few things no technology has ever managed to replace.', difficulty: 'medium', category: 'sentences' },
  { id: 's-m-7', title: 'Deep Work', text: 'The ability to focus without distraction on a single difficult task for long stretches of time is becoming rare, and because it is rare, it is also becoming one of the most valuable skills you can develop.', difficulty: 'medium', category: 'sentences' },
  { id: 's-m-8', title: 'Craftsmanship', text: 'True craftsmanship is the quiet discipline of caring about details that most people will never notice, because you know they add up to something that everyone can feel, even if they cannot name it.', difficulty: 'medium', category: 'sentences' },
  { id: 's-m-9', title: 'Everyday Science', text: 'The soap in your kitchen, the microwave on the counter, and the satellite in the sky all exist because generations of curious people refused to accept the world exactly as they found it.', difficulty: 'medium', category: 'sentences' },
  { id: 's-m-10', title: 'Listening Well', text: 'Listening well is harder than it sounds, because most of us are busy rehearsing our reply while the other person is still speaking. The first step is to notice when you are doing it and choose to stop.', difficulty: 'medium', category: 'sentences' },
  { id: 's-m-11', title: 'Stormy Night', text: 'The storm arrived without warning, sheets of rain hammering the rooftops while distant thunder rolled across the valley like a patient giant searching for somewhere quiet to finally lie down.', difficulty: 'medium', category: 'sentences' },
  { id: 's-m-12', title: 'The Long Run', text: 'In the long run, consistency tends to beat intensity. The person who writes one page a day for a year finishes a book, while the person waiting for inspiration finishes nothing at all.', difficulty: 'medium', category: 'sentences' },

  // ═══ SENTENCES: Hard ═══
  { id: 's-h-1', title: 'Philosophical Musings', text: 'The unexamined life is not worth living, but the over-examined life is not worth living either. Balance is the key to wisdom and contentment in our complex modern world of competing priorities.', difficulty: 'hard', category: 'sentences' },
  { id: 's-h-2', title: 'Scientific Discovery', text: 'Quantum mechanics reveals the fundamental uncertainty principle that governs the behavior of subatomic particles, challenging our classical understanding of deterministic reality and causation.', difficulty: 'hard', category: 'sentences' },
  { id: 's-h-3', title: 'Economic Principles', text: 'Supply and demand dynamics govern market behavior, but human psychology and irrational exuberance often create speculative bubbles and devastating crashes that defy rational economic models and theoretical predictions.', difficulty: 'hard', category: 'sentences' },
  { id: 's-h-4', title: 'Neuroscience Frontier', text: 'The human brain contains approximately eighty-six billion neurons, each forming thousands of synaptic connections that collectively produce consciousness, memory, and the subjective experience of being alive.', difficulty: 'hard', category: 'sentences' },
  { id: 's-h-5', title: 'Historical Perspective', text: 'History rarely repeats itself verbatim, but it rhymes with unsettling regularity, and those who study it carefully learn to recognize the cadence of familiar mistakes long before the drums grow loud enough for everyone else to hear.', difficulty: 'hard', category: 'sentences' },
  { id: 's-h-6', title: 'Cryptographic Foundations', text: 'Modern cryptography rests upon mathematical problems believed to be computationally intractable, transforming confidentiality and authenticity from matters of physical secrecy into provable properties derived from the arithmetic of enormous prime numbers.', difficulty: 'hard', category: 'sentences' },
  { id: 's-h-7', title: 'Literary Craft', text: 'Great literature distinguishes itself not by elaborate vocabulary but by the precision with which ordinary words are arranged, each sentence earning its place through rhythm, implication, and the careful refusal of anything unnecessary.', difficulty: 'hard', category: 'sentences' },
  { id: 's-h-8', title: 'Distributed Systems', text: 'In a sufficiently large distributed system, failures are not occasional interruptions but a permanent background condition, and the engineer\'s task becomes the patient construction of correctness out of components that are quietly and constantly misbehaving.', difficulty: 'hard', category: 'sentences' },
  { id: 's-h-9', title: 'Evolutionary Tangents', text: 'Evolution is neither progressive nor purposeful; it is a blind, opportunistic process that retains whatever happens to work long enough to reproduce, producing designs of breathtaking ingenuity alongside compromises of almost comic absurdity.', difficulty: 'hard', category: 'sentences' },
  { id: 's-h-10', title: 'Legal Language', text: 'Legal writing, at its best, is a kind of exacting poetry in which every clause is calibrated to foreclose ambiguity, and at its worst, an opaque thicket in which meaning is smothered beneath archaic formulas that exist primarily to justify their own continued existence.', difficulty: 'hard', category: 'sentences' },
  { id: 's-h-11', title: 'Cognitive Bias', text: 'The mind is not a neutral instrument for weighing evidence; it is a narrative engine predisposed to confirm what it already believes, and the first discipline of rigorous thought is learning to treat your own intuitions as hypotheses rather than conclusions.', difficulty: 'hard', category: 'sentences' },
  { id: 's-h-12', title: 'Thermodynamic Arrow', text: 'The second law of thermodynamics gives time its direction: entropy in a closed system tends to increase, and from this single statistical tendency emerges everything we mean by the past, the future, and the irreversibility of ordinary experience.', difficulty: 'hard', category: 'sentences' },

  // ═══ POP CULTURE: Easy ═══
  { id: 'p-e-1', title: 'Wise Words from a Galaxy Far Away', text: 'Do or do not, there is no try. The force will be with you, always. This is the way.', difficulty: 'easy', category: 'pop-culture' },
  { id: 'p-e-2', title: 'Superhero Wisdom', text: 'With great power comes great responsibility. I can do this all day. I am inevitable. And I am Iron Man.', difficulty: 'easy', category: 'pop-culture' },
  { id: 'p-e-3', title: 'Animated Classics', text: 'To infinity and beyond. Just keep swimming. Hakuna matata, it means no worries for the rest of your days.', difficulty: 'easy', category: 'pop-culture' },
  { id: 'p-e-4', title: 'Wizard School', text: 'It does not do to dwell on dreams and forget to live. Happiness can be found even in the darkest of times.', difficulty: 'easy', category: 'pop-culture' },
  { id: 'p-e-5', title: 'Pixar Moments', text: 'You are my favorite deputy. Some people are worth melting for. Adventure is out there. Ohana means family, and family means nobody gets left behind.', difficulty: 'easy', category: 'pop-culture' },
  { id: 'p-e-6', title: 'Cartoon Theme Songs', text: 'Teenage mutant ninja turtles, heroes in a half shell. Gotta catch them all. Captain Planet, he is our hero. Scooby Dooby Doo, where are you?', difficulty: 'easy', category: 'pop-culture' },
  { id: 'p-e-7', title: 'Classic Comedy', text: 'I came here to chew bubblegum and kick butt, and I am all out of bubblegum. I love it when a plan comes together. You talking to me?', difficulty: 'easy', category: 'pop-culture' },
  { id: 'p-e-8', title: 'Sports Movies', text: 'Show me the money. There is no crying in baseball. Clear eyes, full hearts, can not lose. Just go out there and have fun. Win one for the gipper.', difficulty: 'easy', category: 'pop-culture' },
  { id: 'p-e-9', title: 'Musical Numbers', text: 'Let it go, let it go, can not hold it back anymore. A whole new world, a new fantastic point of view. The hills are alive with the sound of music.', difficulty: 'easy', category: 'pop-culture' },
  { id: 'p-e-10', title: 'Rom Com Favorites', text: 'I am just a girl, standing in front of a boy, asking him to love her. You had me at hello. Life is like a box of chocolates, you never know what you are gonna get.', difficulty: 'easy', category: 'pop-culture' },

  // ═══ POP CULTURE: Medium ═══
  { id: 'p-m-1', title: 'The One with the Quotes', text: "We were on a break! How you doin? Could this be any more difficult? Pivot! They don't know that we know they know we know.", difficulty: 'medium', category: 'pop-culture' },
  { id: 'p-m-2', title: 'Fantasy Saga', text: 'One does not simply walk into Mordor. Not all those who wander are lost. Even the smallest person can change the course of the future if they are brave enough.', difficulty: 'medium', category: 'pop-culture' },
  { id: 'p-m-3', title: 'Gaming Legends', text: 'The cake is a lie. War never changes. Would you kindly pick up that shortwave radio? A man chooses, a slave obeys. It is dangerous to go alone.', difficulty: 'medium', category: 'pop-culture' },
  { id: 'p-m-4', title: 'Space Opera', text: 'Space, the final frontier. These are the voyages of the starship Enterprise. Its continuing mission to explore strange new worlds and to boldly go where no one has gone before.', difficulty: 'medium', category: 'pop-culture' },
  { id: 'p-m-5', title: 'Office Wisdom', text: "Would I rather be feared or loved? Easy. Both. I want people to be afraid of how much they love me. That's what she said.", difficulty: 'medium', category: 'pop-culture' },
  { id: 'p-m-6', title: 'Breaking Chemistry', text: 'I am not in danger. I am the danger. A guy opens his door and gets shot, and you think that of me? No. I am the one who knocks. Say my name. You are goddamn right.', difficulty: 'medium', category: 'pop-culture' },
  { id: 'p-m-7', title: 'The Bard of Avon', text: 'All the world is a stage, and all the men and women merely players. They have their exits and their entrances, and one man in his time plays many parts.', difficulty: 'medium', category: 'pop-culture' },
  { id: 'p-m-8', title: 'Tarantino Monologues', text: 'Say what again. I dare you. I double dare you. Say what one more time. Do you know what they call a quarter pounder with cheese in Paris? They call it a royale with cheese.', difficulty: 'medium', category: 'pop-culture' },
  { id: 'p-m-9', title: 'Marvel Cinematic', text: 'I am Groot. I have been falling for thirty minutes. On your left. Mr Stark, I do not feel so good. I love you three thousand. Part of the journey is the end.', difficulty: 'medium', category: 'pop-culture' },
  { id: 'p-m-10', title: 'Seinfeld Bits', text: 'These pretzels are making me thirsty. No soup for you. Yada yada yada. Not that there is anything wrong with that. Serenity now. Hello, Newman. Festivus for the rest of us.', difficulty: 'medium', category: 'pop-culture' },
  { id: 'p-m-11', title: 'Sitcom Catchphrases', text: 'Bazinga! Legen, wait for it, dary. How you doin? I have made a huge mistake. Did I do that? Watch out now. Yabba dabba doo. Ay caramba. Cowabunga, dude.', difficulty: 'medium', category: 'pop-culture' },
  { id: 'p-m-12', title: 'Video Game Heroes', text: 'Snake? Snake?! Snaaake! The right man in the wrong place can make all the difference in the world. Finish him. Hadouken. Wake me up when you need me. Press F to pay respects.', difficulty: 'medium', category: 'pop-culture' },

  // ═══ POP CULTURE: Hard ═══
  { id: 'p-h-1', title: 'Dystopian Fiction', text: "It was a bright cold day in April and the clocks were striking thirteen. Big Brother is watching you. War is peace. Freedom is slavery. Ignorance is strength. Who controls the past controls the future.", difficulty: 'hard', category: 'pop-culture' },
  { id: 'p-h-2', title: 'Cyberpunk Dreams', text: "The sky above the port was the color of television, tuned to a dead channel. The future is already here, it is just not evenly distributed. We are all just prisoners here of our own device.", difficulty: 'hard', category: 'pop-culture' },
  { id: 'p-h-3', title: 'Interstellar Journeys', text: "Do not go gentle into that good night. Rage, rage against the dying of the light. Love is the one thing we are capable of perceiving that transcends dimensions of time and space.", difficulty: 'hard', category: 'pop-culture' },
  { id: 'p-h-4', title: 'Anime Classics', text: "A lesson without pain is meaningless. For you cannot gain something without sacrificing something else in return. But once you have overcome that pain and made it your own, you will gain an irreplaceable fullness of heart.", difficulty: 'hard', category: 'pop-culture' },
  { id: 'p-h-5', title: 'Noir Detective', text: 'Down these mean streets a man must go who is not himself mean, who is neither tarnished nor afraid. He is the hero; he is everything. He must be a complete man and a common man and yet an unusual man.', difficulty: 'hard', category: 'pop-culture' },
  { id: 'p-h-6', title: 'Shakespearean Soliloquy', text: 'To be, or not to be, that is the question. Whether tis nobler in the mind to suffer the slings and arrows of outrageous fortune, or to take arms against a sea of troubles, and by opposing end them.', difficulty: 'hard', category: 'pop-culture' },
  { id: 'p-h-7', title: 'Westworld Riddle', text: 'These violent delights have violent ends. Have you ever questioned the nature of your reality? The maze is not meant for you. Consciousness is not a journey upward, but inward. Not a pyramid, but a maze.', difficulty: 'hard', category: 'pop-culture' },
  { id: 'p-h-8', title: 'Christopher Nolan Monologue', text: 'You either die a hero, or you live long enough to see yourself become the villain. Why do we fall? So we can learn to pick ourselves up. It is not who I am underneath, but what I do that defines me.', difficulty: 'hard', category: 'pop-culture' },
  { id: 'p-h-9', title: 'Aaron Sorkin Rant', text: 'You want answers? I think I am entitled. You want answers? I want the truth! You cannot handle the truth! Son, we live in a world that has walls, and those walls have to be guarded by men with guns.', difficulty: 'hard', category: 'pop-culture' },
  { id: 'p-h-10', title: 'Breaking the Fourth Wall', text: 'Perhaps the scariest thing of all is that eventually, this life we are leading, the one we are improvising day by day, will quietly become the story other people tell about us after we are gone.', difficulty: 'hard', category: 'pop-culture' },
];

// ── Procedural random-words generator ────────────────────
// Produces deterministic passages from a word pool using a seeded PRNG.
// Stable ids (rwg-<difficulty>-<seed>) mean re-running never creates dupes.

const RANDOM_WORDS_EASY = [
  'able','acid','aged','also','area','army','away','baby','back','ball','band','bank','base','bath','bear','beat','been','beer','bell','belt','best','bill','bird','blow','blue','boat','body','bomb','bone','book','boom','born','boss','both','bowl','bulk','burn','bush','busy','call','calm','came','camp','card','care','case','cash','cast','cell','chat','chip','city','club','coal','coat','code','cold','come','cook','cool','cope','copy','core','cost','crew','crop','dark','data','date','dawn','days','dead','deal','dean','dear','debt','deep','deny','desk','dial','dice','diet','disc','disk','does','dome','done','door','dose','down','draw','drew','drop','drug','dual','duke','dust','duty','each','earn','ease','east','easy','edge','else','even','ever','evil','exit','face','fact','fade','fail','fair','fall','farm','fast','fate','fear','feed','feel','fell','felt','file','fill','film','find','fine','fire','firm','fish','five','flag','flat','flew','flip','flow','food','foot','ford','fork','form','fort','four','free','from','fuel','full','fund','gain','game','gate','gave','gear','gene','gift','girl','give','glad','goal','goes','gold','golf','gone','good','gray','grew','grey','grid','grip','grow','gulf','guys','hair','half','hall','hand','hang','hard','harm','hate','have','head','hear','heat','held','hell','help','here','hero','high','hill','hire','hold','hole','holy','home','hope','host','hour','huge','hung','hunt','hurt','idea','inch','into','iron','item','jack','jade','jail','jazz','join','jump','jury','just','keen','keep','kept','kick','kill','kind','king','knee','knew','know','lack','lady','laid','lake','land','lane','last','late','lazy','lead','leaf','lean','left','less','life','lift','like','line','link','lion','list','live','load','loan','lock','logo','long','look','lord','lose','loss','lost','lots','loud','love','luck','made','mail','main','make','male','mall','many','mark','mask','mass','mate','math','meal','mean','meat','meet','melt','memo','menu','mere','mess','mice','mile','milk','mill','mind','mine','miss','mode','more','most','move','much','must','name','near','neck','need','news','next','nice','nine','none','noon','nose','note','noun','null','oath','obey','odds','offs','okay','once','only','onto','open','oral','oven','over','pace','pack','page','paid','pain','pair','palm','park','part','pass','past','path','peak','pick','pile','pill','pine','pink','pint','pipe','plan','play','plot','plug','plus','poem','poll','pond','pony','pool','poor','port','pose','post','pour','pray','prey','pull','pump','pure','push','quit','race','rail','rain','rank','rare','rate','read','real','rear','rely','rent','rest','rice','rich','ride','ring','rise','risk','road','rock','role','roll','roof','room','root','rope','rose','rule','rush','safe','said','sail','sake','sale','salt','same','sand','save','scan','seal','seat','seed','seek','seem','seen','self','sell','send','sent','ship','shoe','shop','shot','show','sick','side','sign','silk','site','size','skin','slow','snap','snow','soap','soft','soil','sold','sole','some','song','soon','sore','sort','soul','soup','sour','span','spin','spot','stay','stem','step','stop','such','suit','sure','swim','tail','take','tale','talk','tall','tank','tape','task','taxi','team','tech','tell','tend','tent','term','test','text','than','that','them','then','they','thin','this','thud','thus','tide','tied','tier','ties','till','time','tiny','toll','tone','tool','torn','tour','town','trap','tree','trek','trim','trio','trip','true','tube','tuna','tune','turf','turn','twin','type','ugly','unit','upon','urge','used','user','vary','vast','verb','very','vest','vice','view','vine','vita','void','vote','wage','wait','wake','walk','wall','want','ward','warm','warn','wash','wave','ways','weak','wear','week','well','went','were','west','what','when','whip','whom','whose','wide','wife','wild','will','wind','wine','wing','wipe','wire','wise','wish','with','woke','wolf','wood','wool','word','wore','work','worn','wrap','yard','year','yoga','your','zero','zone',
];

const RANDOM_WORDS_MEDIUM = [
  'absence','academy','account','achieve','acquire','actress','address','advance','adverse','airline','airport','analyst','ancient','anxiety','anxious','applied','approve','archive','arrange','article','attempt','auction','auditor','average','backbone','baggage','balance','balloon','bandage','bargain','battery','bearing','believe','benefit','beneath','between','beyond','bicycle','billion','biology','breathe','brother','buffalo','building','business','cabinet','calcium','campaign','capital','caption','capture','carbohydrate','careful','ceiling','century','ceramic','certain','chamber','channel','chapter','charity','cheaper','checked','chemist','chicken','chimney','circuit','classic','climate','clothes','collect','college','combine','comfort','command','comment','company','compare','compete','complex','compose','concept','concern','concert','conduct','confess','confirm','conflict','connect','consent','consult','contact','contain','content','contest','context','control','convert','convince','correct','cottage','counsel','counter','country','courage','creator','crystal','culture','curious','current','cyclone','dancing','decline','deliver','density','deposit','descend','describe','despite','develop','devoted','diamond','digital','dilemma','diploma','discuss','disease','display','distant','dolphin','dynasty','earnest','economy','edition','electric','elegant','elusive','empathy','empower','enclose','enforce','engaged','enhance','enlarge','enlist','enquire','entitle','epithet','episode','equally','eternal','evenly','evident','examine','example','excused','execute','exhaust','exhibit','expand','experiment','explain','explore','express','extreme','faction','factory','failure','fantasy','fashion','feather','feature','federal','feeling','felony','female','fiction','figured','finance','finding','finely','fingers','finish','firmly','fitness','flavor','flight','flourish','forbear','foreign','foresee','forever','forgive','formats','formula','fortune','forward','frankly','freedom','freezer','freight','frequent','fulfill','furnace','further','gallant','gallery','gasoline','gateway','general','generic','genuine','gesture','getting','glacier','gradual','grammar','grapple','gravity','greater','ground','growing','guardian','habitat','handful','harmony','harvest','heading','hearing','heather','heavily','helpful','herself','highway','himself','history','hopeful','horizon','however','illegal','illness','imagine','impulse','include','income','inflate','initial','insight','install','instance','instead','intense','interim','invoice','involve','jealous','jewelry','journey','justice','karate','keyword','kingdom','kitchen','knowing','ladders','landing','largely','largest','lasting','laundry','lawsuit','leather','lecture','leisure','library','license','lifeline','limited','linking','listing','loaded','locally','logical','longest','loudly','loyalty','machine','magical','manager','manikin','mansion','maximum','meaning','measure','medical','melody','member','message','midnight','milestone','mineral','minimum','mirror','misused','mixture','mobility','monarch','monitor','monthly','morning','mortgage','mystery','natural','neglect','network','nuclear','numeric','nursery','obscure','observe','obstacle','obtain','offense','offspring','operate','opinion','opposite','optical','organic','orienting','outcome','outdoor','outline','outside','overall','overlap','oversee','package','painter','painting','palette','parade','parking','partial','partner','passage','passive','pathway','patient','pattern','payment','penalty','pending','percent','perfect','perform','perhaps','period','permit','person','picnic','picture','pioneer','plaster','plastic','playful','pleased','plumber','pointer','portion','portray','potato','potency','poverty','practice','precise','predict','prefer','prepare','present','prevent','primary','printer','privacy','problem','process','produce','product','profile','progress','project','promise','promote','prophet','prosper','protect','protest','provide','proxies','publish','purpose','qualify','quality','quarter','quickly','ratings','reality','realize','rebuild','receipt','receive','recover','recruit','reduce','reflect','refresh','refugee','regular','related','release','relieve','remain','remark','remedy','removed','replace','request','require','rescue','reserve','respect','respond','restore','retail','return','reveal','revenue','reverse','review','reward','rhythmic','royalty','running','safety','sailing','satisfy','science','section','segment','seizure','senator','separate','serious','service','several','shaping','shelter','shipping','shortage','silence','similar','sincere','sitting','sizable','skillful','sleeper','smaller','smoothly','society','soldier','solemn','someone','somewhere','special','species','speech','sponsor','standard','station','steady','sticker','storage','stormy','strange','stranger','strategy','stretch','student','studio','stylish','subject','success','suggest','summary','summer','support','suppose','supreme','surface','surgery','surplus','surveyed','survive','sustain','swinging','symbol','systems','tableau','tactics','tangent','teacher','telecom','tempera','textile','theater','therapy','theory','thesis','thinker','thorough','thought','thunder','tightly','tolerant','tornado','towards','traffic','trailer','trained','trainer','transmit','transport','trapped','travels','trouble','triumph','trophy','tropics','trouble','tryouts','turbine','typical','unable','unified','unique','unknown','unlock','unusual','update','upgrade','uplift','upright','upward','urgent','utility','vacant','vaguely','valiant','valley','valued','vampire','variant','variety','various','vector','vehicle','velocity','verbal','verdict','veteran','victory','village','violent','virtue','visible','vision','visual','vitamin','vivid','volcano','voltage','voucher','voyage','warning','warrant','website','wedding','weekend','weekly','welcome','welfare','western','whether','whistle','whisper','wholly','willing','winning','winter','wisdom','without','witness','wonder','working','worldly','worried','worship','writing','written','yearly','yonder','zealot','zephyr','zombie',
];

const RANDOM_WORDS_HARD = [
  'abandon','aberrant','abrasive','abundant','accredited','acquaintance','acquisition','admonish','aesthetic','affluent','aggregate','algorithm','ambiguous','ambivalent','amplitude','anachronism','analogous','anarchy','anchored','anecdote','annotation','antecedent','anthology','antibiotic','apocryphal','apotheosis','appendix','apprehend','arbitrage','arbitrary','archaeology','architect','archive','ardently','aristocrat','articulate','asphalt','assassin','astronaut','asymmetric','asymptotic','atmosphere','audacity','austerity','authentic','autonomous','avalanche','axiomatic','bacterial','balustrade','bandwidth','bankruptcy','barbaric','barometer','barricade','beguiling','belligerent','benevolent','bewildered','biologist','blueprint','boisterous','boulevard','boundaries','bourgeois','brazenly','breakthrough','bureaucracy','cacophony','calamitous','calibrate','calligraphy','candidate','capricious','cardiology','carnivorous','cartography','cascading','catalyst','categorical','catharsis','celestial','centennial','centrifuge','cephalopod','chameleon','championship','characters','charismatic','chemistry','chlorophyll','choreograph','chronicle','circumspect','circumvent','clandestine','claustrophobic','cognition','coincidence','collaborate','collateral','collective','colloquial','colonnade','combustion','commence','commentary','commercial','commission','commotion','communicate','community','compendium','complexity','compliance','composite','comprehend','compromise','conceivable','conclusion','concurrent','condensed','conference','confession','confidence','configured','conglomerate','conjecture','consciousness','consecrate','consecutive','consequence','conservative','considered','consolidate','conspicuous','constellation','constituent','constitutional','construct','consultant','consumption','contagious','contamination','contemplate','contemporary','contingent','continuous','contraband','contractor','contradict','controversial','convalescent','convergence','conversation','conversion','convince','coordinate','copyrighted','corollary','corporate','correlation','correspond','corruption','cosmopolitan','cosmogony','counselor','counterintuitive','courageous','credentials','crescendo','criticism','crucifixion','cultivated','curriculum','cylindrical','dangerously','decipher','declaration','decorative','dedication','deference','definitive','delegation','deliberate','delineate','demeanor','demographic','demonstrate','denomination','denouement','dependent','depiction','deprecated','derivative','descendant','description','despondent','destination','determined','detrimental','developing','diagnostic','dialectic','diligent','diminutive','diplomatic','discernment','disclosure','discomfort','discourse','discovered','discrepancy','discretionary','disengaged','disparate','dispatches','displayed','dispensary','dissonance','distillate','distinction','distinguish','distributed','divergent','dormitory','doubleheader','downtrodden','dramatic','duplicitous','dyslexia','earthquake','eccentric','ecosystem','ecstatic','educated','efficient','eggshell','eigenvalue','elaborate','electoral','elegance','elementary','elevation','eliminate','eloquent','elucidate','embarked','embassy','embezzle','embryonic','emergency','emphasis','empirical','employee','enamored','enclosure','encounter','encourage','endeavor','endorsed','energetic','enforcement','engineer','enhanced','enigmatic','enlightened','enormous','enterprise','entertained','enthusiast','entomology','entourage','entrepreneur','enumerate','environment','epidemic','epidermis','epilogue','equalizer','equipment','equivalent','eradicate','ergonomic','erroneous','erudition','escalator','esoteric','establish','esteemed','estimates','evaluate','eventual','exaggerate','examined','exceptional','exchange','exclamation','exclusion','executive','exemplary','exhibition','expedient','expensive','experience','experiment','expertise','explanation','exponential','exposition','exquisite','extenuate','extraneous','extravagant','extraordinary','fabricate','facilitate','facsimile','familiar','fantasize','fascinating','federation','feedback','felicitous','feminine','ferocious','fiduciary','filigree','financial','fireworks','fixation','flagship','flamboyant','flammable','fleeting','florescent','foresight','forestall','forgettable','formidable','formulate','fortitude','fortuitous','foundation','framework','franchise','freelance','frequency','frontier','fulcrum','fundamental','furnishings','fusillade','gastronomy','genealogy','generation','geographic','geologist','geometric','geriatric','germinate','gigantic','glamorous','glimmering','gluttonous','gorgeous','gossamer','governance','grandiose','graphical','gratuitous','gravitate','guarantee','guardian','guerrilla','gymnasium','habitable','hackneyed','hallmark','handiwork','happiness','harbinger','harmonious','harvesting','hazardous','headline','headquarters','heartfelt','heirloom','heliotrope','hemisphere','hereditary','heroically','hesitant','heterogeneous','hexagonal','hibernate','hierarchy','hieroglyph','hilarious','hindrance','histrionic','holistically','homogeneous','honorable','horizontal','hospital','hostility','household','hummingbird','hurricane','hyperbolic','hypnotist','hypothesis','hysterical','identical','identify','idiomatic','idiosyncrasy','illuminate','illustrate','imaginary','imbalance','immaculate','immediate','immigrant','immobilize','immortal','impeccable','imperative','impervious','implement','implication','imprecise','impressive','imprudent','inaccurate','inaugural','incendiary','incessant','incidental','incisive','inclement','inclusive','incompatible','incongruous','inconsistency','indebted','indefinite','independent','indicator','individual','indomitable','induction','indulgent','ineffable','inevitable','inexplicable','infallible','infamous','infernal','infinity','inflection','ingenious','inglorious','inherited','initiated','innovation','inquiring','insidious','insightful','insolvent','instability','installation','instantaneous','institution','instructed','instrument','insulation','insurance','integrate','intellect','intensity','intention','interactive','interchange','interconnect','interlude','intermediary','intermediate','intermittent','internal','international','interpret','interrogate','intervene','intricate','intrigued','introspect','intuition','invariant','invention','inventory','invincible','irreverent','irritable','isolation','itinerant','jubilation','judgement','jurisdiction','juxtapose','kaleidoscope','keepsake','keystroke','kilometer','kindergarten','kingmaker','knowledgeable','laboratory','labyrinth','lackluster','laminated','landmark','landscape','laudable','laureate','lavishly','leadership','legendary','legislation','legitimate','leisurely','leviathan','liability','liberation','librarian','lieutenant','lifetime','lighthouse','likelihood','limitation','lineament','linguistic','literature','loquacious','luminescent','luminous','luxurious','machinery','magnanimous','magnetic','magnificent','magnolia','maintenance','malleable','mandatory','manifesto','manipulate','manuscript','marathon','marginal','marvelous','materialist','mathematics','matriarch','mausoleum','mediate','medicinal','mediocre','meditation','melancholy','membership','memorable','mercenary','mercurial','metabolism','metacarpal','metamorphic','meteorology','methodology','meticulous','metropolis','microphone','microscope','miraculous','miscellaneous','misfortune','mnemonic','modulation','monastery','monopoly','monstrous','monumental','motivated','mountaineer','movement','mulligan','multifaceted','multiplied','municipal','negotiation','nevertheless','nominal','nomination','notable','notorious','nourishing','novelette','novelty','nuisance','numerical','objective','obliterate','oblivion','obnoxious','obsolete','obstruction','obtainable','occupation','occurrence','octopus','offensive','offering','omnipotent','omniscient','onomatopoeia','operational','opinionated','opportunity','opposition','oppressive','optimistic','orchestrate','ordinary','organism','oriental','originated','ornament','ornithology','orthopedic','oscillate','ostentatious','outlandish','outperform','outrageous','overlooked','overture','overwhelmed','pacifist','pageantry','paleontology','palindrome','palpable','panacea','pandemonium','paradigm','paradoxical','parallelism','parameters','paranormal','paraphrase','paraphernalia','partisanship','passionate','pathetic','patriotic','peacefully','pedestrian','peninsula','perceptive','perennial','perfection','perilous','perimeter','perpetual','perseverance','personalized','perspective','persuasive','pertinent','pervasive','pessimistic','petroleum','philosopher','photograph','pianissimo','pictorial','pinpoint','pioneer','plaintive','planetarium','platinum','plausible','pneumatic','poignant','politically','pollinate','polymathic','ponderous','popularity','porcelain','portfolio','portraiture','possession','postulate','potential','practitioner','pragmatic','precedence','precocious','predecessor','predicament','predisposed','prefabricated','preference','preliminary','premiere','prerequisite','preservation','prestigious','prevalent','primitive','principle','probability','procession','proclaim','procurement','productive','profession','proficient','profitable','prognosis','projection','proletariat','prolific','prominent','promotion','prophecy','proportional','prosaic','prospective','protagonist','protocol','prototype','providential','provincial','proxy','publication','punctual','purchase','qualification','quarantine','quarterly','quaternary','questionnaire','quintessential','quixotic','radical','raincoat','rambunctious','ratification','reciprocal','recognize','recommend','reconcile','recuperate','redeemable','redirection','reference','regenerate','register','regularly','regulation','rehabilitate','reinforce','reiterate','relationship','relinquish','reluctant','remarkable','reminisce','remuneration','renaissance','renegotiate','renounce','reparation','repertoire','repetition','replication','representative','repudiate','reputation','resilient','resolution','resonance','resourceful','respiration','restaurant','retrograde','retrospective','revelation','reverberation','revolutionary','rhetoric','rhinoceros','righteous','rudimentary','sacramental','safeguarding','salutation','sanctuary','saturation','scholarship','scintillate','scrumptious','scrupulous','sculpture','seasonality','secondary','secretariat','sedimentary','selection','semantically','sensational','sentimental','separation','serendipity','significant','simultaneous','situational','skeptical','slipstream','somnambulist','sophisticated','sovereignty','specialize','spectacular','speculative','spontaneous','standardize','statistically','stereotype','strategically','strenuous','subconscious','subsequently','substantial','subterranean','successive','sufficient','superiority','superlative','supernatural','suppression','surgical','surmountable','surveillance','susceptible','suspicious','sustainable','symbolism','symmetrical','symposium','synchronize','syndicate','synergistic','synthesize','systematic','tabulation','tangential','tapestries','technicolor','technology','telegraph','temperament','temperate','temporal','tenacious','tenderness','terminology','terraforming','terrestrial','territorial','testimony','theoretical','therapeutic','thermodynamics','thesaurus','threshold','thrilling','tolerance','topography','torturous','tournament','tradition','trajectory','tranquil','transaction','transcend','transcribe','transfigure','transform','transient','transition','translate','translucent','transparent','transplant','transportation','transverse','treacherous','tremendous','trenchant','triangular','tributary','trigonometry','trigonometric','triumphant','tropical','troubadour','troublesome','turbulent','typography','ubiquity','ultimatum','ultimately','unabridged','unanimous','unconquered','underestimate','undertaking','undesirable','undisputed','undisturbed','unequivocal','unfortunate','ungovernable','unification','uniformity','unilateral','unintelligible','universal','unmistakable','unnecessary','unobtrusive','unparalleled','unprecedented','unpredictable','unquenchable','unrealistic','unreliable','unresolved','unrestrained','upheaval','urbanization','utilitarian','utopian','vaccination','vacillate','vacuum','validation','vanilla','variegated','vegetation','vehement','vehicular','vengeance','ventilation','venture','verifiable','vernacular','versatile','vertebrae','vestibule','vexatious','vicarious','vigilance','vindicate','virtuoso','viscosity','visibility','visionary','vocabulary','vocational','volatility','volcano','voluntary','voluptuous','voracious','vulnerable','wanderer','warehouse','warranty','watercolor','watershed','waveform','wavelength','weaponry','welcoming','whirligig','whirlpool','whirlwind','wholesome','widespread','wilderness','windshield','withdrawal','workmanship','wrestling','xenophobic','xylophone','yesterday','yielding','zealously','zigzagged','zoology',
];

const WORDS_PER_PASSAGE: Record<Difficulty, number> = {
  easy: 30,
  medium: 28,
  hard: 24,
};

/** Mulberry32 — tiny deterministic PRNG. Same seed → same sequence. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates 30 random-words passages per difficulty (90 total) using stable
 * seed-based ids. Re-running produces the same passages, so ON CONFLICT
 * DO NOTHING makes the generator idempotent even if the pool is edited.
 */
function generateRandomWordsPassages(): TextPassage[] {
  const pools: Record<Difficulty, string[]> = {
    easy: RANDOM_WORDS_EASY,
    medium: RANDOM_WORDS_MEDIUM,
    hard: RANDOM_WORDS_HARD,
  };
  const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];
  const passages: TextPassage[] = [];

  for (const difficulty of difficulties) {
    const pool = pools[difficulty];
    const count = WORDS_PER_PASSAGE[difficulty];
    for (let seed = 1; seed <= 30; seed++) {
      const rng = mulberry32(seed * 2654435761 + difficulty.charCodeAt(0));
      // Draw `count` words with no immediate repeats.
      const words: string[] = [];
      let lastIdx = -1;
      for (let i = 0; i < count; i++) {
        let idx = Math.floor(rng() * pool.length);
        if (idx === lastIdx) idx = (idx + 1) % pool.length;
        words.push(pool[idx]);
        lastIdx = idx;
      }
      passages.push({
        id: `rwg-${difficulty[0]}-${seed.toString().padStart(2, '0')}`,
        title: `Random Mix ${seed}`,
        text: words.join(' '),
        difficulty,
        category: 'random-words',
      });
    }
  }

  return passages;
}

/**
 * Idempotent seed: inserts every passage in SEED_PASSAGES + the procedurally
 * generated random-words set. `ON CONFLICT (id) DO NOTHING` means existing
 * rows are untouched, so adding new entries to the arrays just works on next
 * restart. Removing entries from the arrays does NOT delete them from the DB.
 */
export async function seedIfEmpty(): Promise<void> {
  const before = await getPassageCount();
  const all = [...SEED_PASSAGES, ...generateRandomWordsPassages()];
  for (const p of all) {
    await insertPassage(p);
  }
  const after = await getPassageCount();
  const added = after - before;
  if (added > 0) {
    console.log(`Seeded ${added} new passages (total: ${after})`);
  } else {
    console.log(`Passage pool verified: ${after} passages`);
  }
}
