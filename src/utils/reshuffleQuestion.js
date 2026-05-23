import { shuffleQuestionOptions } from './shuffleQuestionOptions'

export function reshuffleQuestion(question) {
  if (!question || typeof question !== 'object') return question

  const shuffled = shuffleQuestionOptions({
    correctAnswer: question.correctAnswer,
    options: question.options,
  })

  return {
    ...question,
    correctAnswer: shuffled.correctAnswer,
    options: shuffled.options,
  }
}
