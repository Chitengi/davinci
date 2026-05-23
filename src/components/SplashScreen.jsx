import './SplashScreen.css'

export default function SplashScreen({ onContinue }) {
  const splashSrc = `${import.meta.env.BASE_URL}diagrams/gradesev_splash1.png`
  const logoSrc = `${import.meta.env.BASE_URL}logo.png`

  return (
    <div className="splash" role="dialog" aria-label="App splash screen">
      <div className="splash-logo-container">
        <img
          className="splash-logo"
          src={logoSrc}
          alt="App logo"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      </div>
      <div className="splash-image-wrap">
        <img
          className="splash-image"
          src={splashSrc}
          alt="Upper Primary Quiz splash"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      </div>

      <div className="splash-footer">
        <p className="splash-title">Upper Primary Revision App</p>
        <button className="splash-skip" onClick={onContinue}>
          Skip
        </button>
      </div>
    </div>
  )
}
