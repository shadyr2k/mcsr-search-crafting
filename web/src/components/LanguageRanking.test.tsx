import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import { LanguageRanking } from './LanguageRanking'

afterEach(cleanup)

describe('LanguageRanking', () => {
  test('is blank without enabled nonempty rows and otherwise shows English combined score', () => {
    const view = render(<LanguageRanking aggregate={{ status: 'blank' }} />)
    expect(screen.queryByText('English')).toBeNull()
    view.rerender(<LanguageRanking aggregate={{ status: 'ready', score: 7.5 }} />)
    expect(screen.getByText('English')).toBeTruthy()
    expect(screen.getByText('7.5').classList.contains('metric')).toBe(true)
  })
})
