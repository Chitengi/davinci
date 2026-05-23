import { useState, useEffect, useCallback } from 'react'

/**
 * useSpeech — wrapper around the Web Speech API SpeechSynthesis.
 *
 * Returns { speaking, speak, stop, supported }
 *  speaking  — true while the browser is speaking
 *  speak(text) — read the given text aloud
 *  stop()   — cancel current speech
 *  supported — false when the browser lacks SpeechSynthesis
 */
export function useSpeech() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [speaking, setSpeaking] = useState(false)

  const normalizeSpeechText = useCallback((value) => {
    // Convert spaced thousand groups to comma format for more natural speech.
    // Example: "731 479 + 145 832" -> "731,479 + 145,832"
    let text = String(value).replace(/_+/g, 'blank')
    let next = text.replace(/(?<!\d)(\d{1,3}) (\d{3})(?!\d)/g, '$1,$2')

    while (next !== text) {
      text = next
      next = text.replace(/(?<!\d)(\d{1,3}) (\d{3})(?!\d)/g, '$1,$2')
    }

    return text
  }, [])

  // Keep state in sync if speech ends naturally
  useEffect(() => {
    if (!supported) return undefined
    const synth = window.speechSynthesis

    const onEnd = () => setSpeaking(false)
    synth.addEventListener('voiceschanged', () => {}) // triggers voice load on some browsers

    return () => {
      synth.cancel()
      setSpeaking(false)
    }
  }, [supported])

  const stop = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [supported])

  const speak = useCallback(
    (rawText) => {
      if (!supported) return
      const text = normalizeSpeechText(rawText)
      const synth = window.speechSynthesis

      // If already speaking, stop first (toggle behaviour)
      if (synth.speaking) {
        synth.cancel()
        setSpeaking(false)
        return
      }

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'en-GB'
      utterance.rate = 0.92
      utterance.pitch = 1.0

      utterance.onstart = () => setSpeaking(true)
      utterance.onend = () => setSpeaking(false)
      utterance.onerror = () => setSpeaking(false)

      synth.speak(utterance)
    },
    [normalizeSpeechText, supported],
  )

  return { speaking, speak, stop, supported }
}
