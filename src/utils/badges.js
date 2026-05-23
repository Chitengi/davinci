/**
 * Badge definitions and computation logic.
 * Each badge has a check(history) function that returns true when earned.
 * history is the array of session result objects from localStorage.
 */

export const BADGE_DEFINITIONS = [
  {
    id: 'first_steps',
    icon: '🎉',
    name: 'First Steps',
    description: 'Complete your first quiz',
    check: (h) => h.length >= 1,
  },
  {
    id: 'ace',
    icon: '🎯',
    name: 'Ace',
    description: 'Score 80% or more on any quiz',
    check: (h) => h.some((r) => r.total > 0 && r.score / r.total >= 0.8),
  },
  {
    id: 'perfectionist',
    icon: '💯',
    name: 'Perfectionist',
    description: 'Score 100% on any quiz',
    check: (h) => h.some((r) => r.total > 0 && r.score === r.total),
  },
  {
    id: 'hat_trick',
    icon: '🎩',
    name: 'Hat-Trick',
    description: 'Score 80% or more three times',
    check: (h) => h.filter((r) => r.total > 0 && r.score / r.total >= 0.8).length >= 3,
  },
  {
    id: 'bookworm',
    icon: '📚',
    name: 'Bookworm',
    description: 'Complete 10 sessions',
    check: (h) => h.length >= 10,
  },
  {
    id: 'superstar',
    icon: '🌟',
    name: 'Superstar',
    description: 'Complete 25 sessions',
    check: (h) => h.length >= 25,
  },
  {
    id: 'centurion',
    icon: '🏅',
    name: 'Centurion',
    description: 'Answer 100 questions correctly in total',
    check: (h) => h.reduce((sum, r) => sum + (r.score || 0), 0) >= 100,
  },
  {
    id: 'maths_whiz',
    icon: '🔢',
    name: 'Maths Whiz',
    description: 'Score 80%+ in Mathematics',
    check: (h) =>
      h.some((r) => r.subject === 'Mathematics' && r.total > 0 && r.score / r.total >= 0.8),
  },
  {
    id: 'science_star',
    icon: '🔬',
    name: 'Science Star',
    description: 'Score 80%+ in Integrated Science',
    check: (h) =>
      h.some(
        (r) => r.subject === 'Integrated Science' && r.total > 0 && r.score / r.total >= 0.8,
      ),
  },
  {
    id: 'word_master',
    icon: '📖',
    name: 'Word Master',
    description: 'Score 80%+ in English',
    check: (h) =>
      h.some((r) => r.subject === 'English' && r.total > 0 && r.score / r.total >= 0.8),
  },
  {
    id: 'explorer',
    icon: '🌍',
    name: 'Explorer',
    description: 'Score 80%+ in Social Studies',
    check: (h) =>
      h.some((r) => r.subject === 'Social Studies' && r.total > 0 && r.score / r.total >= 0.8),
  },
  {
    id: 'champion',
    icon: '🏆',
    name: 'Champion',
    description: 'Score 100% on a Test Paper',
    check: (h) =>
      h.some((r) => r.mode === 'Test Paper' && r.total > 0 && r.score === r.total),
  },
]

/**
 * Returns a Set of badge ids earned given the full history array.
 */
export function computeEarnedBadgeIds(history) {
  const earned = new Set()
  for (const badge of BADGE_DEFINITIONS) {
    if (badge.check(history)) earned.add(badge.id)
  }
  return earned
}
