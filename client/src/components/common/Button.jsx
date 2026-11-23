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
    'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-tafera-accent'

  const variants = {
    primary:
      'bg-tafera-primary text-tafera-on-primary font-semibold hover:opacity-90',
    accent:
      'bg-tafera-accent text-tafera-on-accent font-semibold hover:bg-tafera-accent/90',
    secondary:
      'border border-tafera-border bg-tafera-surface text-tafera-text hover:bg-tafera-card hover:text-tafera-primary',
    outline:
      'border border-tafera-border bg-tafera-card text-tafera-text hover:bg-tafera-surface hover:border-tafera-primary/60 hover:text-tafera-primary',
    ghost:
      'bg-transparent text-tafera-text hover:bg-tafera-surface hover:text-tafera-primary',
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
