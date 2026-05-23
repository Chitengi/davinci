import { useNavigate, useParams } from 'react-router-dom'
import { SUBJECTS } from '../utils/subjects'
import './SubjectPicker.css'

const MODE_LABELS = {
  'test-paper': 'Pick a Test Paper',
  quiz: 'Select 10 Q&A Quiz',
  flashcards: 'Flashcards',
}

export default function SubjectPicker() {
  const { mode } = useParams()
  const navigate = useNavigate()
  const label = MODE_LABELS[mode] || mode

  const handleSubject = (subject) => {
    navigate(`/${mode}/${subject.id}`)
  }

  return (
    <div className="subject-picker">
      <header className="picker-header">
        <button className="picker-back" onClick={() => navigate('/')}>← Back</button>
        <h2 className="picker-title">{label}</h2>
        <p className="picker-subtitle">Choose a subject</p>
      </header>

      <div className="picker-grid">
        {SUBJECTS.map((subject) => (
          <button
            key={subject.id}
            className="picker-card"
            style={{ '--subj-color': subject.color, '--subj-bg': subject.bgColor }}
            onClick={() => handleSubject(subject)}
          >
            <span className="picker-card-emoji">{subject.emoji}</span>
            <span className="picker-card-label">{subject.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
