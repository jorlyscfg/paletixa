import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type' | 'value'> & {
  value: string
  onChange: (value: string) => void
  label: string
  containerClassName?: string
}

export function SearchInput({ value, onChange, label, containerClassName = '', className = '', id, maxLength = 200, ...inputProps }: SearchInputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return <div className={`relative ${containerClassName}`}>
    <label htmlFor={inputId} className="sr-only">{label}</label>
    <input {...inputProps} id={inputId} type="text" role="searchbox" maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} className={`ops-control ops-focus min-h-11 w-full pl-10 ${className}`} />
    <IconSearch />
  </div>
}

function IconSearch() {
  return <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
}
