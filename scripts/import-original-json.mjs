import fs from 'node:fs'
import path from 'node:path'

const sourcePath = 'd:/MyUpperPrimaryQuizzes/app/src/main/assets/grade_seven_original.json'
const targetRoot = 'd:/Alum/REACT/my-upper-primary-school-app/src/data'

const subjectMap = {
  '_G5-G7_MATHEMATICS': { outFile: 'mathematics.json', outKey: '_MATHEMATICS' },
  '_G5-G7_INTEGRATED_SCIENCE': { outFile: 'integratedScience.json', outKey: '_INTEGRATED_SCIENCE' },
  '_G5-G7_SOCIAL_STUDIES': { outFile: 'socialStudies.json', outKey: '_SOCIAL_STUDIES' },
  '_G5-G7_ENGLISH_LANGUAGE': { outFile: 'english.json', outKey: '_ENGLISH' },
  '_G5-G7_SPECIAL_PAPER_1': { outFile: 'specialPaper1.json', outKey: '_SPECIAL_PAPER_1' },
}

const raw = fs.readFileSync(sourcePath, 'utf8')
const source = JSON.parse(raw)

const isQuestionRow = (value) => {
  if (!value || typeof value !== 'object') return false
  return ['Question', 'a', 'b', 'c', 'd'].every((k) => Object.prototype.hasOwnProperty.call(value, k))
}

const normalizeQuestionRow = (row, fallbackCode) => {
  const next = {
    Question: String(row.Question || ''),
    a: String(row.a || ''),
    b: String(row.b || ''),
    c: String(row.c || ''),
    d: String(row.d || ''),
  }

  if (row.e !== undefined && row.e !== null && String(row.e).trim()) {
    next.e = String(row.e)
  }

  if (row.diagram !== undefined && row.diagram !== null && String(row.diagram).trim()) {
    next.diagram = String(row.diagram).trim()
  }

  if (!next.Question.trim()) {
    next.Question = `azxtrvy Missing question text for ${fallbackCode}`
  }

  return next
}

const transformSubject = (sourceSubject) => {
  const transformed = {}

  for (const [subtopicKey, subtopicValue] of Object.entries(sourceSubject || {})) {
    if (!subtopicValue || typeof subtopicValue !== 'object') continue

    const bucket = {}

    for (const [entryKey, entryValue] of Object.entries(subtopicValue)) {
      if (isQuestionRow(entryValue)) {
        bucket[entryKey] = normalizeQuestionRow(entryValue, entryKey)
        continue
      }

      // Passage-style blocks in English: Passage_X contains P1-Q1 ... P1-Q10 rows.
      if (entryValue && typeof entryValue === 'object') {
        for (const [nestedKey, nestedVal] of Object.entries(entryValue)) {
          if (!isQuestionRow(nestedVal)) continue

          const composedCode = `${entryKey}-${nestedKey}`
          bucket[composedCode] = normalizeQuestionRow(nestedVal, composedCode)
        }
      }
    }

    if (Object.keys(bucket).length > 0) {
      transformed[subtopicKey] = bucket
    }
  }

  return transformed
}

const written = []
for (const [sourceKey, cfg] of Object.entries(subjectMap)) {
  const sourceSubject = source[sourceKey]
  if (!sourceSubject || typeof sourceSubject !== 'object') continue

  const transformed = transformSubject(sourceSubject)
  const wrapped = { [cfg.outKey]: transformed }
  const outPath = path.join(targetRoot, cfg.outFile)
  fs.writeFileSync(outPath, `${JSON.stringify(wrapped, null, 2)}\n`, 'utf8')
  written.push({ sourceKey, outPath, subtopics: Object.keys(transformed).length })
}

console.log('Imported subjects:')
for (const row of written) {
  console.log(`- ${row.sourceKey} -> ${row.outPath} (${row.subtopics} subtopics)`) 
}
