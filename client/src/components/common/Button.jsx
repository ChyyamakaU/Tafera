export default function Button({
  children,
  type = 'button',
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  ...props
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-tafera-primary'

  const variants = {
    primary:
      'bg-tafera-primary text-white hover:bg-tafera-primary/90',
    accent:
      'bg-tafera-accent text-white hover:bg-tafera-accent/90',
    outline:
      'border border-tafera-border bg-tafera-bg text-tafera-text hover:bg-tafera-surface hover:text-tafera-primary',
    ghost:
      'bg-transparent text-tafera-text-muted hover:bg-tafera-surface hover:text-tafera-text',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-3 text-base',
  }

  return (
    <button
      type={type}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export { Button }
