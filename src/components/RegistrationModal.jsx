import { useState } from 'react'
import { subscriptionApi } from '../utils/subscriptionApi'
import './RegistrationModal.css'

const STEPS = {
  WELCOME: 'welcome',
  CHILD: 'child',
  GUARDIAN: 'guardian',
  PIN: 'pin',
  DONE: 'done',
}

export default function RegistrationModal({ onComplete, onGoToPaywall, previewMode = false }) {
  const [step, setStep] = useState(STEPS.WELCOME)
  const [displayName, setDisplayName] = useState('')
  const [grade, setGrade] = useState('')
  const [guardianPhone, setGuardianPhone] = useState('')
  const [pin, setPin] = useState(['', '', '', ''])
  const [pinConfirm, setPinConfirm] = useState(['', '', '', ''])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function handlePinInput(index, value, pinState, setPinState, nextFocusId) {
    if (!/^\d?$/.test(value)) return
    const updated = [...pinState]
    updated[index] = value
    setPinState(updated)
    if (value && index < 3) {
      document.getElementById(`${nextFocusId}-${index + 1}`)?.focus()
    }
  }

  function handlePinBackspace(index, e, pinState, setPinState, nextFocusId) {
    if (e.key === 'Backspace' && !pinState[index] && index > 0) {
      document.getElementById(`${nextFocusId}-${index - 1}`)?.focus()
    }
  }

  async function handleSubmit() {
    setError('')
    const pinStr = pin.join('')
    const confirmStr = pinConfirm.join('')

    if (!displayName.trim() || displayName.trim().length < 2) {
      return setError('Please enter a name (at least 2 characters).')
    }
    if (!grade) {
      return setError('Please select your grade.')
    }
    if (pinStr.length !== 4) {
      return setError('Please enter a 4-digit PIN.')
    }
    if (pinStr !== confirmStr) {
      return setError('PINs do not match. Please try again.')
    }

    if (previewMode) {
      setStep(STEPS.DONE)
      return
    }

    setSaving(true)
    try {
      await subscriptionApi.updateLearnerProfile({
        displayName: displayName.trim(),
        grade: Number(grade),
        pin: pinStr,
        guardianPhone: guardianPhone.trim() || undefined,
      })
      setStep(STEPS.DONE)
    } catch (err) {
      setError(err.message || 'Could not save profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="reg-overlay" role="dialog" aria-modal="true" aria-label="Registration">
      <div className="reg-modal">

        {/* ── Welcome ── */}
        {step === STEPS.WELCOME && (
          <div className="reg-step">
            <div className="reg-icon">👋</div>
            <h2 className="reg-title">Welcome!</h2>
            <p className="reg-desc">
              Let's set up your learner profile. This only takes a minute and
              makes sure your progress is always saved.
            </p>
            <p className="reg-desc small">
              A parent or guardian can also fill this in for you.
            </p>
            <button className="reg-btn primary" onClick={onGoToPaywall || onComplete}>
              Get Started
            </button>
            <button className="reg-btn ghost" onClick={() => setStep(STEPS.CHILD)}>
              Set Up Profile First
            </button>
          </div>
        )}

        {/* ── Child info ── */}
        {step === STEPS.CHILD && (
          <div className="reg-step">
            <div className="reg-icon">🎒</div>
            <h2 className="reg-title">About the Learner</h2>

            <label className="reg-label" htmlFor="reg-name">
              What shall we call you?
            </label>
            <input
              id="reg-name"
              className="reg-input"
              type="text"
              placeholder="e.g. Chanda or Mwape"
              maxLength={30}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="off"
            />

            <label className="reg-label">Which grade are you in?</label>
            <div className="reg-grade-row">
              {[5, 6, 7].map((g) => (
                <button
                  key={g}
                  className={`reg-grade-btn ${grade === String(g) ? 'selected' : ''}`}
                  onClick={() => setGrade(String(g))}
                  type="button"
                >
                  Grade {g}
                </button>
              ))}
            </div>

            {error && <p className="reg-error">{error}</p>}

            <div className="reg-nav">
              <button className="reg-btn ghost" onClick={() => { setError(''); setStep(STEPS.WELCOME) }}>
                Back
              </button>
              <button
                className="reg-btn primary"
                onClick={() => {
                  if (!displayName.trim() || displayName.trim().length < 2) {
                    return setError('Please enter a name (at least 2 characters).')
                  }
                  if (!grade) return setError('Please select your grade.')
                  setError('')
                  setStep(STEPS.GUARDIAN)
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* ── Guardian phone (optional) ── */}
        {step === STEPS.GUARDIAN && (
          <div className="reg-step">
            <div className="reg-icon">📱</div>
            <h2 className="reg-title">Guardian's Phone</h2>
            <p className="reg-desc">
              Optional — if you add a parent or guardian's phone number, they
              can help recover your account if you forget your PIN or change
              device.
            </p>

            <label className="reg-label" htmlFor="reg-phone">
              Phone number (optional)
            </label>
            <input
              id="reg-phone"
              className="reg-input"
              type="tel"
              placeholder="e.g. 0971 234 567"
              maxLength={20}
              value={guardianPhone}
              onChange={(e) => setGuardianPhone(e.target.value)}
              autoComplete="tel"
            />

            {error && <p className="reg-error">{error}</p>}

            <div className="reg-nav">
              <button className="reg-btn ghost" onClick={() => { setError(''); setStep(STEPS.CHILD) }}>
                Back
              </button>
              <button
                className="reg-btn primary"
                onClick={() => {
                  setError('')
                  setStep(STEPS.PIN)
                }}
              >
                {guardianPhone.trim() ? 'Next' : 'Skip'}
              </button>
            </div>
          </div>
        )}

        {/* ── PIN ── */}
        {step === STEPS.PIN && (
          <div className="reg-step">
            <div className="reg-icon">🔒</div>
            <h2 className="reg-title">Create a PIN</h2>
            <p className="reg-desc">
              Choose a 4-digit PIN you'll remember. You'll use it to keep your
              progress safe.
            </p>

            <label className="reg-label">Your PIN</label>
            <div className="reg-pin-row">
              {pin.map((digit, i) => (
                <input
                  key={i}
                  id={`pin-${i}`}
                  className="reg-pin-input"
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handlePinInput(i, e.target.value, pin, setPin, 'pin')}
                  onKeyDown={(e) => handlePinBackspace(i, e, pin, setPin, 'pin')}
                  autoComplete="off"
                />
              ))}
            </div>

            <label className="reg-label">Confirm PIN</label>
            <div className="reg-pin-row">
              {pinConfirm.map((digit, i) => (
                <input
                  key={i}
                  id={`pinc-${i}`}
                  className="reg-pin-input"
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handlePinInput(i, e.target.value, pinConfirm, setPinConfirm, 'pinc')}
                  onKeyDown={(e) => handlePinBackspace(i, e, pinConfirm, setPinConfirm, 'pinc')}
                  autoComplete="off"
                />
              ))}
            </div>

            {error && <p className="reg-error">{error}</p>}

            <div className="reg-nav">
              <button className="reg-btn ghost" disabled={saving} onClick={() => { setError(''); setStep(STEPS.GUARDIAN) }}>
                Back
              </button>
              <button className="reg-btn primary" disabled={saving} onClick={handleSubmit}>
                {saving ? 'Saving…' : 'Create Profile'}
              </button>
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {step === STEPS.DONE && (
          <div className="reg-step">
            <div className="reg-icon">🎉</div>
            <h2 className="reg-title">You're all set, {displayName}!</h2>
            <p className="reg-desc">
              Your profile has been saved. Your Grade {grade} revision journey
              starts now. Good luck!
            </p>
            <button className="reg-btn primary" onClick={onGoToPaywall || onComplete}>
              Continue to Free Trial
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
