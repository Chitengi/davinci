import { useNavigate } from 'react-router-dom'
import './Home.css'

const MODES = [
  {
    id: 'test-paper',
    label: 'Pick a Test Paper',
    emoji: '📝',
    description: 'Choose a subject and topic, then take a full paper.',
    color: '#1565C0',
    bg: '#E3F2FD',
    needsSubject: true,
  },
  {
    id: 'quiz',
    label: 'Select 10 Q&A Quiz',
    emoji: '🎯',
    description: 'Pick your subject and choose exactly which questions to practise.',
    color: '#2E7D32',
    bg: '#E8F5E9',
    needsSubject: true,
  },
  {
    id: 'random',
    label: '10 Random Q&A',
    emoji: '🎲',
    description: 'Answer 10 randomly selected questions from all subjects.',
    color: '#6A1B9A',
    bg: '#F3E5F5',
    needsSubject: false,
  },
  {
    id: 'flashcards',
    label: 'Flashcards',
    emoji: '🃏',
    description: 'Flip cards to study questions and answers at your own pace.',
    color: '#AD1457',
    bg: '#FCE4EC',
    needsSubject: true,
  },
  {
    id: 'paywall',
    label: 'Subscription & Premium',
    emoji: '🔓',
    description: 'View plans, activate premium, or manage your access.',
    color: '#0D47A1',
    bg: '#E3F2FD',
    needsSubject: false,
  },
  {
    id: 'performance',
    label: 'My Performance',
    emoji: '📊',
    description: 'See your quiz history and track your progress over time.',
    color: '#E65100',
    bg: '#FFF3E0',
    needsSubject: false,
  },
  {
    id: 'admin',
    label: 'Admin Console',
    emoji: '🛠️',
    description: 'Send learner alerts and adjust subscription plan fees.',
    color: '#37474F',
    bg: '#ECEFF1',
    needsSubject: false,
  },
]

export default function Home() {
  const navigate = useNavigate()
  const logoSrc = `${import.meta.env.BASE_URL}diagrams/bullet.png`

  const handleModeClick = (mode) => {
    if (mode.id === 'performance') {
      navigate('/performance')
    } else if (mode.id === 'admin') {
      navigate('/admin')
    } else if (mode.id === 'paywall') {
      navigate('/paywall')
    } else if (mode.id === 'random') {
      navigate('/random')
    } else {
      navigate(`/subject-picker/${mode.id}`)
    }
  }

  return (
    <div className="home">
      <header className="home-header">
        <img className="home-logo-img" src={logoSrc} alt="App logo" />
        <h1 className="home-title">UPPER PRIMARY SCHOOL</h1>
        <p className="home-subtitle">Revision & Practice App</p>
      </header>

      <main className="home-modes">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            className="home-mode-card"
            style={{ '--mode-color': mode.color, '--mode-bg': mode.bg }}
            onClick={() => handleModeClick(mode)}
            aria-label={mode.label}
          >
            <span className="home-mode-emoji">{mode.emoji}</span>
            <div className="home-mode-info">
              <span className="home-mode-label">{mode.label}</span>
              <span className="home-mode-desc">{mode.description}</span>
            </div>
            <span className="home-mode-arrow">›</span>
          </button>
        ))}
      </main>

      <footer className="home-footer">
        <p>Study hard, aim high! 🌟</p>
      </footer>
    </div>
  )
}
