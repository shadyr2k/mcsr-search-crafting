import { ArrowSprite } from './ArrowSprite'
import './ResultsHeader.css'

interface ResultsHeaderProps {
  languageName: string
  nativeLanguageName?: string
  onOpenSheet: () => void
  onCompare: () => void
}

export function ResultsHeader({ languageName, nativeLanguageName, onOpenSheet, onCompare }: ResultsHeaderProps) {
  return <header className="results-header" dir="ltr">
    <div className="results-header__top">
      <h2 className="results-header__title">{languageName}{nativeLanguageName && <> — <bdi>{nativeLanguageName}</bdi></>}</h2>
      <div className="results-header__actions">
        <button type="button" className="results-header__action page-navigation" onClick={onOpenSheet}>
          <span>crafting sheet</span><span aria-hidden="true"><ArrowSprite direction="right" compact /></span>
        </button>
        <button type="button" className="results-header__action page-navigation" onClick={onCompare}>
          <span>compare languages</span><span aria-hidden="true"><ArrowSprite direction="right" compact /></span>
        </button>
      </div>
    </div>
    <p className="results-header__label">Results</p>
  </header>
}
