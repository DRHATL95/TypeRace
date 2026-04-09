import pool from './db/pool';
import { TextPassage, Difficulty, PassageCategory } from './types';

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

export async function getRandomPassage(difficulty?: Difficulty, category?: PassageCategory): Promise<TextPassage | null> {
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
    `SELECT id, title, text, difficulty, category FROM passages ${where} ORDER BY RANDOM() LIMIT 1`,
    params
  );
  return rows[0] || null;
}

export async function insertPassage(passage: TextPassage): Promise<void> {
  await pool.query(
    `INSERT INTO passages (id, title, text, difficulty, category) VALUES ($1, $2, $3, $4, $5)`,
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
}): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO race_results (player_name, wpm, accuracy, fire_streak, difficulty, category)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [result.player_name, result.wpm, result.accuracy, result.fire_streak, result.difficulty, result.category]
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

// ── Seed ──────────────────────────────────────────────────

const SEED_PASSAGES: TextPassage[] = [
  // SENTENCES: Easy
  { id: 's-e-1', title: 'The Quick Brown Fox', text: 'The quick brown fox jumps over the lazy dog. This sentence contains every letter of the alphabet and is perfect for testing typing speed.', difficulty: 'easy', category: 'sentences' },
  { id: 's-e-2', title: 'Programming Wisdom', text: "Code is like humor. When you have to explain it, it's bad. The best code is self-documenting and reads like a story.", difficulty: 'easy', category: 'sentences' },
  { id: 's-e-3', title: 'Creative Expression', text: 'Art transcends language barriers and cultural differences, speaking directly to the human soul through colors, shapes, and emotions that words cannot capture.', difficulty: 'easy', category: 'sentences' },
  { id: 's-e-4', title: 'Morning Coffee', text: 'There is something deeply comforting about the first cup of coffee in the morning, when the world is still quiet and full of possibility.', difficulty: 'easy', category: 'sentences' },

  // SENTENCES: Medium
  { id: 's-m-1', title: "Nature's Beauty", text: 'The morning sun painted the sky in brilliant shades of orange and pink, casting long shadows across the dew-covered meadow where wildflowers danced in the gentle breeze.', difficulty: 'medium', category: 'sentences' },
  { id: 's-m-2', title: 'Technology Revolution', text: 'Artificial intelligence and machine learning are transforming industries at an unprecedented pace, creating both opportunities and challenges for society as we navigate this digital transformation.', difficulty: 'medium', category: 'sentences' },
  { id: 's-m-3', title: 'Space Exploration', text: "Humanity's quest to explore the cosmos represents our most ambitious undertaking, pushing the boundaries of technology and human endurance in pursuit of knowledge beyond our atmosphere.", difficulty: 'medium', category: 'sentences' },
  { id: 's-m-4', title: 'Environmental Stewardship', text: "Climate change represents humanity's greatest challenge, requiring unprecedented global cooperation and innovation to preserve our planet for future generations who will inherit what we leave behind.", difficulty: 'medium', category: 'sentences' },

  // SENTENCES: Hard
  { id: 's-h-1', title: 'Philosophical Musings', text: 'The unexamined life is not worth living, but the over-examined life is not worth living either. Balance is the key to wisdom and contentment in our complex modern world of competing priorities.', difficulty: 'hard', category: 'sentences' },
  { id: 's-h-2', title: 'Scientific Discovery', text: 'Quantum mechanics reveals the fundamental uncertainty principle that governs the behavior of subatomic particles, challenging our classical understanding of deterministic reality and causation.', difficulty: 'hard', category: 'sentences' },
  { id: 's-h-3', title: 'Economic Principles', text: 'Supply and demand dynamics govern market behavior, but human psychology and irrational exuberance often create speculative bubbles and devastating crashes that defy rational economic models and theoretical predictions.', difficulty: 'hard', category: 'sentences' },
  { id: 's-h-4', title: 'Neuroscience Frontier', text: 'The human brain contains approximately eighty-six billion neurons, each forming thousands of synaptic connections that collectively produce consciousness, memory, and the subjective experience of being alive.', difficulty: 'hard', category: 'sentences' },

  // POP CULTURE: Easy
  { id: 'p-e-1', title: 'Wise Words from a Galaxy Far Away', text: 'Do or do not, there is no try. The force will be with you, always. This is the way.', difficulty: 'easy', category: 'pop-culture' },
  { id: 'p-e-2', title: 'Superhero Wisdom', text: 'With great power comes great responsibility. I can do this all day. I am inevitable. And I am Iron Man.', difficulty: 'easy', category: 'pop-culture' },
  { id: 'p-e-3', title: 'Animated Classics', text: 'To infinity and beyond. Just keep swimming. Hakuna matata, it means no worries for the rest of your days.', difficulty: 'easy', category: 'pop-culture' },
  { id: 'p-e-4', title: 'Wizard School', text: 'It does not do to dwell on dreams and forget to live. Happiness can be found even in the darkest of times.', difficulty: 'easy', category: 'pop-culture' },

  // POP CULTURE: Medium
  { id: 'p-m-1', title: 'The One with the Quotes', text: "We were on a break! How you doin? Could this be any more difficult? Pivot! They don't know that we know they know we know.", difficulty: 'medium', category: 'pop-culture' },
  { id: 'p-m-2', title: 'Fantasy Saga', text: 'One does not simply walk into Mordor. Not all those who wander are lost. Even the smallest person can change the course of the future if they are brave enough.', difficulty: 'medium', category: 'pop-culture' },
  { id: 'p-m-3', title: 'Gaming Legends', text: 'The cake is a lie. War never changes. Would you kindly pick up that shortwave radio? A man chooses, a slave obeys. Its dangerous to go alone.', difficulty: 'medium', category: 'pop-culture' },
  { id: 'p-m-4', title: 'Space Opera', text: 'Space, the final frontier. These are the voyages of the starship Enterprise. Its continuing mission to explore strange new worlds and to boldly go where no one has gone before.', difficulty: 'medium', category: 'pop-culture' },
  { id: 'p-m-5', title: 'Office Wisdom', text: "Would I rather be feared or loved? Easy. Both. I want people to be afraid of how much they love me. That's what she said.", difficulty: 'medium', category: 'pop-culture' },

  // POP CULTURE: Hard
  { id: 'p-h-1', title: 'Dystopian Fiction', text: "It was a bright cold day in April and the clocks were striking thirteen. Big Brother is watching you. War is peace. Freedom is slavery. Ignorance is strength. Who controls the past controls the future.", difficulty: 'hard', category: 'pop-culture' },
  { id: 'p-h-2', title: 'Cyberpunk Dreams', text: "The sky above the port was the color of television, tuned to a dead channel. The future is already here, it is just not evenly distributed. We are all just prisoners here of our own device.", difficulty: 'hard', category: 'pop-culture' },
  { id: 'p-h-3', title: 'Interstellar Journeys', text: "Do not go gentle into that good night. Rage, rage against the dying of the light. Love is the one thing we are capable of perceiving that transcends dimensions of time and space.", difficulty: 'hard', category: 'pop-culture' },
  { id: 'p-h-4', title: 'Anime Classics', text: "A lesson without pain is meaningless. For you cannot gain something without sacrificing something else in return. But once you have overcome that pain and made it your own, you will gain an irreplaceable fullness of heart.", difficulty: 'hard', category: 'pop-culture' },

  // RANDOM WORDS: Easy
  { id: 'r-e-1', title: 'Simple Mix', text: 'apple green table fast river cloud open mind just road water light step dark room hand book time door plan fire', difficulty: 'easy', category: 'random-words' },
  { id: 'r-e-2', title: 'Common Words', text: 'home work play game tree blue fish walk talk read jump ball star moon rain snow hill bird song leaf wave', difficulty: 'easy', category: 'random-words' },
  { id: 'r-e-3', title: 'Short Burst', text: 'cat dog sun hat box run sit cup pen map key bed car bus fox egg jam owl rug zip fan net pod', difficulty: 'easy', category: 'random-words' },

  // RANDOM WORDS: Medium
  { id: 'r-m-1', title: 'Mixed Length', text: 'bridge capture wonder motion silent frozen garden crystal market thunder hollow ancient surface beneath signal rhythm border machine puzzle harvest anchor phantom', difficulty: 'medium', category: 'random-words' },
  { id: 'r-m-2', title: 'Action Words', text: 'scramble whisper navigate embrace collapse stumble discover flourish abandon generate transform celebrate accelerate illuminate penetrate demonstrate investigate concentrate', difficulty: 'medium', category: 'random-words' },
  { id: 'r-m-3', title: 'Nature Mix', text: 'canyon glacier meadow volcano eclipse current fossil terrain horizon cascade mineral summit plateau climate erosion delta tremor altitude formation spectrum', difficulty: 'medium', category: 'random-words' },
  { id: 'r-m-4', title: 'Tech Scatter', text: 'quantum render buffer deploy socket thread kernel module config cache proxy digest schema binary vector matrix token cipher filter beacon queue', difficulty: 'medium', category: 'random-words' },

  // RANDOM WORDS: Hard
  { id: 'r-h-1', title: 'Complex Vocabulary', text: 'ephemeral juxtaposition ubiquitous paradigm serendipity eloquence infrastructure dichotomy quintessential phenomenon amalgamation prestidigitation circumnavigate anthropomorphic', difficulty: 'hard', category: 'random-words' },
  { id: 'r-h-2', title: 'Scientific Terms', text: 'mitochondria photosynthesis electromagnetic thermodynamics neuroplasticity cryptocurrency bioluminescence superconductor nanotechnology cybersecurity algorithm synchronization extraterrestrial', difficulty: 'hard', category: 'random-words' },
  { id: 'r-h-3', title: 'Keyboard Breaker', text: 'onomatopoeia bureaucracy surveillance reconnaissance Mediterranean pharmaceutical antidisestablishmentarianism czechoslovakia xylophone acquaintance mnemonic hemorrhage psychoanalysis', difficulty: 'hard', category: 'random-words' },
  { id: 'r-h-4', title: 'Symbol Heavy', text: 'zero-day man-in-the-middle back-to-back state-of-the-art self-sufficient well-known high-quality up-to-date over-the-counter first-class mother-in-law cross-platform', difficulty: 'hard', category: 'random-words' },
];

export async function seedIfEmpty(): Promise<void> {
  const count = await getPassageCount();
  if (count === 0) {
    for (const p of SEED_PASSAGES) {
      await insertPassage(p);
    }
    console.log(`Seeded database with ${SEED_PASSAGES.length} passages`);
  } else {
    console.log(`Database has ${count} passages`);
  }
}
