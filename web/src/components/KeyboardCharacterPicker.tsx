import { useEffect, useState } from 'react'
import { loadLocalizedGeneratedData } from '../data/schema'
import type { GeneratedData, LanguageMetadata } from '../domain/types'
import { LanguageDropdown } from './LanguageSelector'

export function latinSpecialCharacters(texts: Iterable<string>): string[] {
  const characters = new Set<string>()
  for (const text of texts) {
    for (const character of text.toLowerCase().normalize('NFC')) {
      if (character.codePointAt(0)! > 127 && /\p{Script=Latin}/u.test(character)) characters.add(character)
    }
  }
  return [...characters].sort()
}

export function KeyboardCharacterPicker({ languages, baseData, dataBaseUrl }: { languages: readonly LanguageMetadata[]; baseData?: GeneratedData; dataBaseUrl?: string }) {
  const [locale, setLocale] = useState('en_us')
  const [characters, setCharacters] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [retry, setRetry] = useState(0)
  const language = languages.find((candidate) => candidate.locale === locale)

  useEffect(() => {
    let cancelled = false
    setCharacters([])
    setError('')
    setCopied('')
    if (language?.script !== 'latin' || !baseData) { setLoading(false); return }
    setLoading(true)
    void loadLocalizedGeneratedData(locale, baseData, dataBaseUrl).then((data) => {
      if (cancelled) return
      const texts = [...data.items.values()].flatMap((item) => [item.name, ...item.searchLines.map((line) => line.text)])
      texts.push(...[...data.inventoryItems.values()].map((item) => item.name), language.name, language.region)
      setCharacters(latinSpecialCharacters(texts))
    }).catch(() => { if (!cancelled) setError('Could not load characters for this language.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [baseData, dataBaseUrl, language, locale, retry])

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(`copied ${text}`) }
    catch { setCopied('Select the characters in the row and copy them manually.') }
  }

  return <div className="keyboard-characters">
    <label>special characters</label>
    <LanguageDropdown languages={languages} selectedLocale={locale} label="Keyboard character language" onSelect={setLocale} />
    <p>This picker is separate from craft calculations. Latin characters come from this language’s Minecraft item names and searchable text.</p>
    {language?.script !== 'latin' ? <p>For non-Latin languages, use your keyboard or another character source.</p>
      : loading ? <p role="status">loading characters…</p>
        : error ? <p role="alert">{error} <button type="button" onClick={() => setRetry((value) => value + 1)}>retry</button></p>
          : characters.length > 0 ? <>
            <div className="keyboard-characters__row"><input aria-label="Copyable special characters" readOnly value={characters.join(' ')} onFocus={(event) => event.target.select()} /><button type="button" onClick={() => void copy(characters.join(' '))}>copy row</button></div>
            <div className="keyboard-characters__keys">{characters.map((character) => <button type="button" key={character} aria-label={`Copy ${character}`} onClick={() => void copy(character)}>{character}</button>)}</div>
            <p>Tap a character to copy it, then paste it into a selected key’s input.</p>
          </> : <p>No special Latin characters found in this language’s item text.</p>}
    {copied && <p role="status">{copied}</p>}
  </div>
}
