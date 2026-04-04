import { TextPassage, Difficulty } from './types';

const textPassages: TextPassage[] = [
  { id: '1', title: 'The Quick Brown Fox', text: 'The quick brown fox jumps over the lazy dog. This sentence contains every letter of the alphabet and is perfect for testing typing speed.', difficulty: 'easy', category: 'Classic' },
  { id: '2', title: 'Programming Wisdom', text: "Code is like humor. When you have to explain it, it's bad. The best code is self-documenting and reads like a story.", difficulty: 'easy', category: 'Programming' },
  { id: '3', title: "Nature's Beauty", text: 'The morning sun painted the sky in brilliant shades of orange and pink, casting long shadows across the dew-covered meadow where wildflowers danced in the gentle breeze.', difficulty: 'medium', category: 'Nature' },
  { id: '4', title: 'Technology Revolution', text: 'Artificial intelligence and machine learning are transforming industries at an unprecedented pace, creating both opportunities and challenges for society as we navigate this digital transformation.', difficulty: 'medium', category: 'Technology' },
  { id: '5', title: 'Philosophical Musings', text: 'The unexamined life is not worth living, but the over-examined life is not worth living either. Balance is the key to wisdom and contentment in our complex modern world.', difficulty: 'hard', category: 'Philosophy' },
  { id: '6', title: 'Scientific Discovery', text: 'Quantum mechanics reveals the fundamental uncertainty principle that governs the behavior of particles at the subatomic level, challenging our classical understanding of reality.', difficulty: 'hard', category: 'Science' },
  { id: '7', title: 'Space Exploration', text: "Humanity's quest to explore the cosmos represents our most ambitious undertaking, pushing the boundaries of technology and human endurance in pursuit of knowledge.", difficulty: 'medium', category: 'Space' },
  { id: '8', title: 'Creative Expression', text: 'Art transcends language barriers and cultural differences, speaking directly to the human soul through colors, shapes, and emotions that words cannot capture.', difficulty: 'easy', category: 'Arts' },
  { id: '9', title: 'Economic Principles', text: 'Supply and demand dynamics govern market behavior, but human psychology and irrational exuberance often create bubbles and crashes that defy rational economic models.', difficulty: 'hard', category: 'Economics' },
  { id: '10', title: 'Environmental Stewardship', text: "Climate change represents humanity's greatest challenge, requiring unprecedented global cooperation and innovation to preserve our planet for future generations.", difficulty: 'medium', category: 'Environment' },
];

export function getRandomPassage(difficulty?: Difficulty): TextPassage {
  const pool = difficulty ? textPassages.filter(p => p.difficulty === difficulty) : textPassages;
  return pool[Math.floor(Math.random() * pool.length)];
}
