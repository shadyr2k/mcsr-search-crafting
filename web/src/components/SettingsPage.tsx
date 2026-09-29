import { useEffect, useState, type CSSProperties } from 'react'

import type { AppSettings } from '../persistence/storage'

import './SettingsPage.css'

interface SettingsPageProps {
  settings: AppSettings
  catifyAvailable?: boolean
  onSave(settings: AppSettings): void
  onResetCalculationCache(): void
  calculationCacheResetting?: boolean
  calculationCacheWasReset?: boolean
}

interface NumberSetting {
  key: keyof AppSettings['scoring']
  label: string
  description: string
}

type ScoringKey = keyof AppSettings['scoring']

const scoringKeys: readonly ScoringKey[] = [
  'freeInitialCharacters',
  'additionalCharacterPenalty',
  'backspacePenalty',
  'shiftHomePenalty',
  'junkExistingPenalty',
  'junkItemPenalty',
]

function numberInputsFor(scoring: AppSettings['scoring']): Record<ScoringKey, string> {
  return Object.fromEntries(scoringKeys.map((key) => [key, String(scoring[key])])) as Record<ScoringKey, string>
}

const searchSettings: readonly NumberSetting[] = [
  {
    key: 'freeInitialCharacters',
    label: 'free initial characters',
    description: 'How many characters in the first search add no score before the additional character penalty begins.',
  },
  {
    key: 'additionalCharacterPenalty',
    label: 'additional character penalty',
    description: 'Score penalty for each additional character.',
  },
  {
    key: 'backspacePenalty',
    label: 'backspace penalty',
    description: 'Score penalty for each backspace used when moving to the next search.',
  },
  {
    key: 'shiftHomePenalty',
    label: 'shift home penalty',
    description: 'Score penalty for each Shift+Home used to replace a search.',
  },
  {
    key: 'junkExistingPenalty',
    label: 'junk existing penalty',
    description: 'Score penalty for having junk in the result at all.',
  },
  {
    key: 'junkItemPenalty',
    label: 'junk item penalty',
    description: 'Score penalty for each junk item in the result.',
  },
]

export function SettingsPage({
  settings,
  catifyAvailable,
  onSave,
  onResetCalculationCache,
  calculationCacheResetting = false,
  calculationCacheWasReset = false,
}: SettingsPageProps) {
  const [draft, setDraft] = useState(settings)
  const [numberInputs, setNumberInputs] = useState(() => numberInputsFor(settings.scoring))
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setDraft((current) => current.scoring === settings.scoring ? current : { ...current, scoring: settings.scoring })
    setNumberInputs(numberInputsFor(settings.scoring))
  }, [settings.scoring])

  useEffect(() => {
    setDraft((current) => current.catifyItems === settings.catifyItems ? current : { ...current, catifyItems: settings.catifyItems })
  }, [settings.catifyItems])

  useEffect(() => {
    setDraft((current) => current.itemIdSearch === settings.itemIdSearch ? current : { ...current, itemIdSearch: settings.itemIdSearch })
  }, [settings.itemIdSearch])

  useEffect(() => {
    setDraft((current) => current.hideNumberCraftsByDefault === settings.hideNumberCraftsByDefault ? current : { ...current, hideNumberCraftsByDefault: settings.hideNumberCraftsByDefault })
  }, [settings.hideNumberCraftsByDefault])

  useEffect(() => {
    setDraft((current) => current.removeAnimations === settings.removeAnimations ? current : { ...current, removeAnimations: settings.removeAnimations })
  }, [settings.removeAnimations])

  useEffect(() => {
    setDraft((current) => current.compactLayout === settings.compactLayout ? current : { ...current, compactLayout: settings.compactLayout })
  }, [settings.compactLayout])

  function maximumFor(setting: NumberSetting) {
    return setting.key === 'freeInitialCharacters' ? 5 : 9999
  }

  function acceptsNumberInput(setting: NumberSetting, value: string) {
    return setting.key === 'freeInitialCharacters'
      ? /^\d{0,2}$/.test(value)
      : /^\d{0,5}(?:\.\d{0,2})?$/.test(value)
  }

  function normalizedNumber(setting: NumberSetting, value: string) {
    const parsed = Number(value)
    const numericValue = Number.isFinite(parsed) ? parsed : 0
    return Math.min(maximumFor(setting), Math.max(0, Number(numericValue.toFixed(2))))
  }

  function setNumber(setting: NumberSetting, value: string) {
    if (!acceptsNumberInput(setting, value)) return
    const numericValue = normalizedNumber(setting, value)
    setSaved(false)
    const keepTypedValue = value === '' || value === '.' || value.endsWith('.') || numericValue === Number(value)
    setNumberInputs((current) => ({ ...current, [setting.key]: keepTypedValue ? value : String(numericValue) }))
    setDraft((current) => ({
      ...current,
      scoring: { ...current.scoring, [setting.key]: numericValue },
    }))
  }

  function nudgeNumber(setting: NumberSetting, direction: -1 | 1) {
    const current = draft.scoring[setting.key]
    const next = Math.min(maximumFor(setting), Math.max(0, Number((current + direction).toFixed(2))))
    setNumber(setting, String(next))
  }

  function finalizeNumberInput(setting: NumberSetting) {
    const value = String(normalizedNumber(setting, numberInputs[setting.key]))
    setNumberInputs((current) => ({ ...current, [setting.key]: value }))
  }

  function renderNumberSettings(numberSettings: readonly NumberSetting[]) {
    return <div className="settings-page__numbers">
      {numberSettings.map((setting) => {
        const disabled = setting.key === 'additionalCharacterPenalty' && draft.scoring.freeInitialCharacters >= 5
        return <label key={setting.key} title={setting.description}>
          <span>{setting.label}</span>
          <span className="settings-page__number-control">
            <button
              type="button"
              aria-label={`Decrease ${setting.label}`}
              disabled={disabled || draft.scoring[setting.key] <= 0}
              onClick={() => nudgeNumber(setting, -1)}
            >↓</button>
            <input
              className="settings-page__number-input"
              type="text"
              inputMode={setting.key === 'freeInitialCharacters' ? 'numeric' : 'decimal'}
              value={numberInputs[setting.key]}
              disabled={disabled}
              aria-label={setting.label}
              aria-describedby={`${setting.key}-description`}
              onBlur={() => finalizeNumberInput(setting)}
              onChange={(event) => setNumber(setting, event.target.value)}
              style={{ width: `${Math.min(4, Math.max(2, numberInputs[setting.key].length))}ch` } as CSSProperties}
            />
            <button
              type="button"
              aria-label={`Increase ${setting.label}`}
              disabled={disabled || draft.scoring[setting.key] >= maximumFor(setting)}
              onClick={() => nudgeNumber(setting, 1)}
            >↑</button>
          </span>
          <small id={`${setting.key}-description`}>{setting.description}</small>
        </label>
      })}
    </div>
  }

  function save() {
    onSave(draft)
    setSaved(true)
  }

  return <section className="settings-page" aria-labelledby="settings-heading">
    <header>
      <h2 id="settings-heading">site settings</h2>
    </header>
    <form onSubmit={(event) => { event.preventDefault(); save() }}>
      <fieldset>
        <legend>search settings</legend>
        {renderNumberSettings(searchSettings)}
        <div className="settings-page__toggle" title="Allows : to match Minecraft’s English item IDs while still matching the selected language’s name and searchable tooltip text.">
          <button
            type="button"
            role="switch"
            className="settings-page__switch"
            aria-label="item ID search"
            aria-checked={draft.itemIdSearch}
            onClick={() => {
              setSaved(false)
              setDraft((current) => ({ ...current, itemIdSearch: !current.itemIdSearch }))
            }}
          />
          <span>item ID search</span>
          <small>Allows : to match Minecraft’s English item IDs while still matching the selected language’s name and searchable tooltip text.</small>
        </div>
        <div className="settings-page__toggle" title="Start craft results with number searches hidden.">
          <button
            type="button"
            role="switch"
            className="settings-page__switch"
            aria-label="hide craft numbers by default"
            aria-checked={draft.hideNumberCraftsByDefault}
            onClick={() => {
              setSaved(false)
              setDraft((current) => ({ ...current, hideNumberCraftsByDefault: !current.hideNumberCraftsByDefault }))
            }}
          />
          <span>hide craft numbers by default</span>
          <small>Starts craft results with searches containing numbers hidden. You can still show them in any item set.</small>
        </div>
      </fieldset>
      <fieldset>
        <legend>site settings</legend>
        <div className="settings-page__toggle" title="Show every site state immediately.">
          <button
            type="button"
            role="switch"
            className="settings-page__switch"
            aria-label="remove animations"
            aria-checked={draft.removeAnimations}
            onClick={() => {
              setSaved(false)
              setDraft((current) => ({ ...current, removeAnimations: !current.removeAnimations }))
            }}
          />
          <span>remove animations</span>
          <small>Removes page, panel, disclosure, and icon animations throughout the site.</small>
        </div>
        <div className="settings-page__toggle" title="Use smaller type, spacing, and controls in the main craft workspace.">
          <button
            type="button"
            role="switch"
            className="settings-page__switch"
            aria-label="compact layout"
            aria-checked={draft.compactLayout}
            onClick={() => {
              setSaved(false)
              setDraft((current) => ({ ...current, compactLayout: !current.compactLayout }))
            }}
          />
          <span>compact layout</span>
          <small>Uses smaller type, rows, icons, and controls in the main craft workspace. It also shows Shift+Home and Backspace as text keycaps there.</small>
        </div>
        <div className="settings-page__cache">
          <div>
            <span>reset calculation cache</span>
            <small>Clears saved optimal language scores and craft results, then rebuilds them from the current item sets and scoring rules. Your item sets, craft-sheet choices, and site settings stay saved.</small>
          </div>
          <button type="button" onClick={onResetCalculationCache} disabled={calculationCacheResetting}>
            {calculationCacheResetting ? 'resetting cache…' : 'reset calculation cache'}
          </button>
          {calculationCacheResetting && <p role="status">clearing saved results…</p>}
          {!calculationCacheResetting && calculationCacheWasReset && <p role="status">calculation cache reset; fresh crafts are calculating</p>}
        </div>
      </fieldset>
      {catifyAvailable !== undefined && <fieldset className="settings-page__catify">
        <legend>item textures</legend>
        <div className="settings-page__toggle" title="Use Fat Cat v2 textures for available items; every other icon stays unchanged.">
          <button
            type="button"
            role="switch"
            className="settings-page__switch"
            aria-label="catify items"
            aria-checked={draft.catifyItems}
            disabled={!catifyAvailable}
            onClick={() => {
              setSaved(false)
              setDraft((current) => ({ ...current, catifyItems: !current.catifyItems }))
            }}
          />
          <span>catify items</span>
        </div>
        <small>{catifyAvailable
          ? 'Use Fat Cat v2 textures where the pack provides an item image. Missing images keep the default texture.'
          : 'Catify items is available while item textures are loading.'}</small>
      </fieldset>}
      <div className="settings-page__save">
        {saved && <p role="status">settings saved</p>}
        <button type="submit">save settings</button>
      </div>
    </form>
  </section>
}
