import { useState } from 'react'

// A password input with a built-in show/hide visibility toggle. The toggle
// switches the input between `password` and `text` without clearing or
// changing the entered value. Uses inline SVG icons so no icon library is
// required, matching the existing icon style used across the application.
export default function PasswordInput({
  id,
  value,
  onChange,
  required = false,
  autoComplete = 'current-password',
  placeholder = '••••••••',
  label = 'Password',
  disabled = false,
  className = '',
  'aria-describedby': ariaDescribedby,
  'aria-invalid': ariaInvalid,
  ...inputProps
}) {
  const [visible, setVisible] = useState(false)

  const toggleVisibility = () => {
    setVisible((prev) => !prev)
  }

  const inputClassName = `w-full px-4 py-2 rounded-lg border border-tafera-border bg-tafera-card text-tafera-text placeholder:text-tafera-text-muted focus:ring-2 focus:ring-tafera-primary focus:border-tafera-primary outline-none transition-colors pr-12 ${className}`

  return (
    <div className="w-full">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-tafera-text mb-1"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required={required}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={inputClassName}
          placeholder={placeholder}
          aria-describedby={ariaDescribedby}
          aria-invalid={ariaInvalid}
          {...inputProps}
        />
        <button
          type="button"
          onClick={toggleVisibility}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-tafera-text-muted hover:text-tafera-text focus:outline-none focus:ring-2 focus:ring-tafera-primary focus:ring-offset-2 transition-colors"
        >
        {visible ? (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7h.565c.455 2.868 2.692 5.206 5.478 6.075zM19.425 5.175c.724-1.132 1.086-2.47 1.086-3.875a5.63 5.63 0 00-1.086-3.875h-.565c-1.275 2.207-3.282 4.013-5.478 4.72zm-4.875 13.875a5.63 5.63 0 01-5.478-4.72h-.565c-.455 2.868-2.692 5.206-5.478 6.075A10.05 10.05 0 0012 19c4.478 0 8.268-2.943 9.543-7zM15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        ) : (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.482 7.225 7.164 5 12 5c4.837 0 8.518 2.225 9.542 5.021.13.366.428.63.816.816.284.695.394 1.485.394 2.273 0 .788-.11 1.578-.394 2.273-.388.186-.686.45-.816.816-1.024 2.796-4.705 5.021-9.542 5.021-4.837 0-8.518-2.225-9.542-5.021-.13-.366-.428-.63-.816-.816-.284-.695-.394-1.485-.394-2.273 0-.788.11-1.578.394-2.273.388-.186.686-.45.816-.816z"
            />
          </svg>
        )}
        </button>
      </div>
    </div>
  )
}

export { PasswordInput }
