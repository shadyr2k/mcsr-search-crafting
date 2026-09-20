import { useEffect, useState } from 'react'

import type { AppSettings } from '../persistence/storage'

import './SettingsPage.css'

interface SettingsPageProps {
  settings: AppSettings
  catifyAvailable: boolean
  onSave(settings: AppSettings): void
}

interface NumberSetting {
  key: keyof AppSettings['scoring']
  label: string
  description: string
  step?: string
}

const searchSettings: readonly NumberSetting[] = [
  {
    key: 'freeInitialCharacters',
    label: 'free initial characters',
    description: 'How many characters in the first search add no score before the additional character penalty begins.',
    step: '1',
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
]

const junkSettings: readonly NumberSetting[] = [
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

export function SettingsPage({ settings, catifyAvailable, onSave }: SettingsPageProps) {
  const [draft, setDraft] = useState(settings)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setDraft((current) => current.scoring === settings.scoring ? current : { ...current, scoring: settings.scoring })
  }, [settings.scoring])

  useEffect(() => {
    setDraft((current) => current.catifyItems === settings.catifyItems ? current : { ...current, catifyItems: settings.catifyItems })
  }, [settings.catifyItems])

  useEffect(() => {
    setDraft((current) => current.itemIdSearch === settings.itemIdSearch ? current : { ...current, itemIdSearch: settings.itemIdSearch })
  }, [settings.itemIdSearch])

  function setNumber(key: keyof AppSettings['scoring'], value: string) {
    const numericValue = Number(value)
    setSaved(false)
    setDraft((current) => ({
      ...current,
      scoring: { ...current.scoring, [key]: Number.isFinite(numericValue) ? numericValue : 0 },
    }))
  }

  function renderNumberSettings(numberSettings: readonly NumberSetting[]) {
    return <div className="settings-page__numbers">
      {numberSettings.map((setting) => {
        const disabled = setting.key === 'additionalCharacterPenalty' && draft.scoring.freeInitialCharacters >= 5
        return <label key={setting.key} title={setting.description}>
          <span>{setting.label}</span>
          <input
            type="number"
            min="0"
            max={setting.key === 'freeInitialCharacters' ? '5' : undefined}
            step={setting.step ?? 'any'}
            value={draft.scoring[setting.key]}
            disabled={disabled}
            aria-describedby={`${setting.key}-description`}
            onChange={(event) => setNumber(setting.key, event.target.value)}
          />
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
      <h2 id="settings-heading">scoring settings</h2>
      <p>A language’s score estimates the effort needed to find every enabled item set in its recipe book. Lower scores are better.</p>
    </header>
    <form onSubmit={(event) => { event.preventDefault(); save() }}>
      <fieldset>
        <legend>search settings</legend>
        {renderNumberSettings(searchSettings)}
        <div className="settings-page__toggle" title="Allow colon-prefixed searches to match an item's resource ID, such as :on_sw for iron_sword, as well as its searchable tooltip text.">
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
          <small>Allow colon-prefixed shortcuts from Minecraft item IDs and searchable tooltip text, such as :on_sw for iron_sword.</small>
        </div>
      </fieldset>
      <fieldset>
        <legend>junk settings</legend>
        {renderNumberSettings(junkSettings)}
      </fieldset>
      <fieldset className="settings-page__catify">
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
      </fieldset>
      <div className="settings-page__save">
        {saved && <p role="status">settings saved</p>}
        <button type="submit">save settings</button>
      </div>
    </form>
  </section>
}
