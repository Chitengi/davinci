const OPTION_LETTERS = ['a', 'b', 'c', 'd']

function shuffleArray(items) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

export function shuffleQuestionOptions({ correctAnswer, options }) {
  const safeOptions = options && typeof options === 'object' ? options : {}
  const active = OPTION_LETTERS
    .filter((letter) => String(safeOptions[letter] ?? '').trim() !== '')
    .map((letter) => ({
      letter,
      text: safeOptions[letter],
      isCorrect: letter === String(correctAnswer || '').toLowerCase(),
    }))

  if (active.length <= 1) {
    return {
      correctAnswer: String(correctAnswer || '').toLowerCase(),
      options: { ...safeOptions },
    }
  }

  const shuffled = shuffleArray(active)
  const remappedOptions = {}
  let remappedCorrect = ''

  OPTION_LETTERS.forEach((letter) => {
    remappedOptions[letter] = ''
  })

  shuffled.forEach((entry, index) => {
    const newLetter = OPTION_LETTERS[index]
    remappedOptions[newLetter] = entry.text
    if (entry.isCorrect) remappedCorrect = newLetter
  })

  if (String(safeOptions.e ?? '').trim() !== '') {
    remappedOptions.e = safeOptions.e
  }

  return {
    correctAnswer: remappedCorrect || String(correctAnswer || '').toLowerCase(),
    options: remappedOptions,
  }
}
