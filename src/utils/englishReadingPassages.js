import englishReadingsData from '../data/english_readings.json'

const ENGLISH_READINGS_KEY = '_G5-G7_ENGLISH_READINGS'

const getReadingText = (passageObj) => {
  if (!passageObj || typeof passageObj !== 'object') return ''

  const direct = passageObj['reading-1'] || passageObj['Reading-1']
  if (typeof direct === 'string') return direct

  const readingEntry = Object.entries(passageObj).find(([key, value]) => (
    typeof value === 'string' && key.toLowerCase() === 'reading-1'
  ))

  return readingEntry ? readingEntry[1] : ''
}

const buildPassageMap = () => {
  const container = englishReadingsData?.[ENGLISH_READINGS_KEY]
  if (!container || typeof container !== 'object') return {}

  const map = {}

  Object.entries(container).forEach(([key, value]) => {
    if (!value || typeof value !== 'object') return
    const match = key.match(/^Passage_(\d+)$/i)
    if (!match) return

    const passageNumber = Number(match[1])
    const title = String(value.Title || '').trim()
    const text = String(getReadingText(value) || '').trim()

    map[passageNumber] = {
      passageNumber,
      title,
      text,
      sourceKey: key,
    }
  })

  return map
}

const PASSAGES_BY_NUMBER = buildPassageMap()

export const getPassageNumberFromQuestionCode = (questionCode) => {
  const code = String(questionCode || '')
  const match = code.match(/P(\d+)-Q\d+/i)
  return match ? Number(match[1]) : null
}

export const getEnglishReadingPassageByQuestionCode = (questionCode) => {
  const passageNumber = getPassageNumberFromQuestionCode(questionCode)
  if (!passageNumber) return null

  const passage = PASSAGES_BY_NUMBER[passageNumber]
  if (!passage || !passage.text) return null

  return passage
}
