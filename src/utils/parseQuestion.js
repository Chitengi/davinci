const SEPARATOR = 'zxtrvy'

/**
 * Parses a Question string of the format:
 *   "[correctAnswerLetter]zxtrvy[questionText]"
 *
 * Returns { correctAnswer, questionText, diagramCode }
 * where diagramCode is optionally embedded at the END of questionText
 * using the pattern [[IMG:some_diagram_code]].
 */
export const parseQuestion = (questionString) => {
  if (!questionString || typeof questionString !== 'string') {
    return { correctAnswer: '', questionText: '', diagramCode: null }
  }

  const sepIndex = questionString.indexOf(SEPARATOR)
  if (sepIndex === -1) {
    return { correctAnswer: '', questionText: questionString.trim(), diagramCode: null }
  }

  const correctAnswer = questionString.slice(0, sepIndex).trim().toLowerCase()
  let questionText = questionString.slice(sepIndex + SEPARATOR.length).trim()

  // Extract optional diagram code: [[IMG:code]]
  let diagramCode = null
  const diagramMatch = questionText.match(/\[\[IMG:([^\]]+)\]\]/)
  if (diagramMatch) {
    diagramCode = diagramMatch[1]
    questionText = questionText.replace(diagramMatch[0], '').trim()
  }

  return { correctAnswer, questionText, diagramCode }
}

/**
 * Extracts all questions from a subject JSON into a flat array.
 * Each entry: { id, subtopic, questionCode, correctAnswer, questionText, diagramCode, options }
 */
export const flattenSubjectQuestions = (subjectData) => {
  const questions = []
  if (!subjectData || typeof subjectData !== 'object') return questions

  // Top-level key is the subject name (e.g. "_MATHEMATICS")
  const subjectKey = Object.keys(subjectData)[0]
  if (!subjectKey) return questions

  const subtopics = subjectData[subjectKey]
  if (!subtopics || typeof subtopics !== 'object') return questions

  Object.entries(subtopics).forEach(([subtopicKey, subtopicQuestions]) => {
    if (!subtopicQuestions || typeof subtopicQuestions !== 'object') return

    Object.entries(subtopicQuestions).forEach(([questionCode, questionData]) => {
      if (!questionData || typeof questionData !== 'object') return
      const { correctAnswer, questionText, diagramCode } = parseQuestion(questionData.Question || '')
      const rawDiagramCode = String(questionData.diagram || '').trim()

      questions.push({
        id: `${subtopicKey}__${questionCode}`,
        subtopic: subtopicKey,
        questionCode,
        correctAnswer,
        questionText,
        diagramCode: diagramCode || rawDiagramCode || null,
        options: {
          a: questionData.a || '',
          b: questionData.b || '',
          c: questionData.c || '',
          d: questionData.d || '',
          ...(questionData.e ? { e: questionData.e } : {}),
        },
      })
    })
  })

  return questions
}

/**
 * Returns subtopics grouped: [{ key, label, questions }]
 */
export const getSubtopics = (subjectData) => {
  if (!subjectData || typeof subjectData !== 'object') return []
  const subjectKey = Object.keys(subjectData)[0]
  if (!subjectKey) return []

  const subtopics = subjectData[subjectKey]
  if (!subtopics || typeof subtopics !== 'object') return []

  return Object.entries(subtopics).map(([key, questionsObj]) => {
    const label = key.replace(/_/g, ' ').replace(/-/g, ' › ')
    const questions = []

    Object.entries(questionsObj || {}).forEach(([questionCode, questionData]) => {
      if (!questionData || typeof questionData !== 'object') return
      const { correctAnswer, questionText, diagramCode } = parseQuestion(questionData.Question || '')
      const rawDiagramCode = String(questionData.diagram || '').trim()
      questions.push({
        id: `${key}__${questionCode}`,
        subtopic: key,
        questionCode,
        correctAnswer,
        questionText,
        diagramCode: diagramCode || rawDiagramCode || null,
        options: {
          a: questionData.a || '',
          b: questionData.b || '',
          c: questionData.c || '',
          d: questionData.d || '',
          ...(questionData.e ? { e: questionData.e } : {}),
        },
      })
    })

    return { key, label, questions }
  })
}
