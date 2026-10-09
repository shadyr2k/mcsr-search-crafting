import './SegmentedControl.css'

interface SegmentedControlProps<T extends string> {
  label: string
  value: T
  options: readonly { value: T; label: string; disabled?: boolean }[]
  onChange: (value: T) => void
}

export function SegmentedControl<T extends string>({ label, value, options, onChange }: SegmentedControlProps<T>) {
  return <div className="segmented-control" role="group" aria-label={label}>
    {options.map((option) => <button
      key={option.value}
      type="button"
      aria-pressed={value === option.value}
      disabled={option.disabled}
      onClick={() => onChange(option.value)}
    >{option.label}</button>)}
  </div>
}
