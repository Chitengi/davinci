import mathematicsData from '../data/mathematics.json'
import integratedScienceData from '../data/integratedScience.json'
import socialStudiesData from '../data/socialStudies.json'
import homeEconomicsData from '../data/homeEconomics.json'
import musicData from '../data/music.json'
import basicIctData from '../data/basicIct.json'
import englishData from '../data/english.json'
import englishReadingsData from '../data/english_readings.json'
import specialPaper1Data from '../data/specialPaper1.json'
import specialPaper2Data from '../data/specialPaper2.json'

const buildEnglishReadingComprehension = () => {
  const source = englishReadingsData?._G5_G7_ENGLISH_READINGS || englishReadingsData?.['_G5-G7_ENGLISH_READINGS']
  if (!source || typeof source !== 'object') return null

  const readingQuestions = {}

  Object.entries(source).forEach(([passageKey, passageBlock]) => {
    if (!passageBlock || typeof passageBlock !== 'object') return

    Object.entries(passageBlock).forEach(([questionCode, questionData]) => {
      if (!/^P\d+-Q\d+$/i.test(String(questionCode || ''))) return
      if (!questionData || typeof questionData !== 'object') return

      // Keep a stable unique key while preserving the embedded Pn-Qn code for passage mapping.
      readingQuestions[`${passageKey}-${questionCode}`] = questionData
    })
  })

  return Object.keys(readingQuestions).length > 0 ? readingQuestions : null
}

const buildEnglishSubjectData = () => {
  const subjectKey = Object.keys(englishData || {})[0]
  if (!subjectKey) return englishData

  const englishRoot = englishData[subjectKey] || {}
  const readingComprehension = buildEnglishReadingComprehension()

  if (!readingComprehension) return englishData

  return {
    ...englishData,
    [subjectKey]: {
      ...englishRoot,
      Reading_Comprehension: readingComprehension,
    },
  }
}

const englishSubjectData = buildEnglishSubjectData()

export const SUBJECTS = [
  {
    id: 'mathematics',
    label: 'Mathematics',
    emoji: '🔢',
    color: '#1565C0',
    bgColor: '#E3F2FD',
    data: mathematicsData,
  },
  {
    id: 'integrated_science',
    label: 'Integrated Science',
    emoji: '🔬',
    color: '#2E7D32',
    bgColor: '#E8F5E9',
    data: integratedScienceData,
  },
  {
    id: 'social_studies',
    label: 'Social Studies',
    emoji: '🌍',
    color: '#E65100',
    bgColor: '#FFF3E0',
    data: socialStudiesData,
  },
  {
    id: 'home_economics',
    label: 'Home Economics',
    emoji: '🏠',
    color: '#AD1457',
    bgColor: '#FCE4EC',
    data: homeEconomicsData,
  },
  {
    id: 'music',
    label: 'Music',
    emoji: '🎵',
    color: '#6A1B9A',
    bgColor: '#F3E5F5',
    data: musicData,
  },
  {
    id: 'basic_ict',
    label: 'Basic ICT',
    emoji: '💻',
    color: '#00695C',
    bgColor: '#E0F2F1',
    data: basicIctData,
  },
  {
    id: 'english',
    label: 'English',
    emoji: '📖',
    color: '#F57F17',
    bgColor: '#FFFDE7',
    data: englishSubjectData,
  },
  {
    id: 'special_paper_1',
    label: 'Special Paper 1',
    emoji: '⭐',
    color: '#37474F',
    bgColor: '#ECEFF1',
    data: specialPaper1Data,
  },
  {
    id: 'special_paper_2',
    label: 'Special Paper 2',
    emoji: '🌟',
    color: '#BF360C',
    bgColor: '#FBE9E7',
    data: specialPaper2Data,
  },
]

export const getSubjectById = (id) => SUBJECTS.find((s) => s.id === id) || null
