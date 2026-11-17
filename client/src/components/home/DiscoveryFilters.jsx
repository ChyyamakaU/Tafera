const FILTERS = [
  {
    category: 'Budget',
    options: [
      { label: 'Budget-friendly', href: '/destinations' },
      { label: 'Moderate', href: '/destinations' },
      { label: 'Premium', href: '/destinations' },
    ],
  },
  {
    category: 'Trip type',
    options: [
      { label: 'Solo-friendly', href: '/trips' },
      { label: 'Weekend trips', href: '/trips' },
      { label: 'Group trips', href: '/trips' },
      { label: 'Adventure', href: '/trips' },
    ],
  },
  {
    category: 'Season',
    options: [
      { label: 'Spring', href: '/destinations' },
      { label: 'Summer', href: '/destinations' },
      { label: 'Autumn', href: '/destinations' },
      { label: 'Winter', href: '/destinations' },
    ],
  },
]

export default function DiscoveryFilters() {
  return (
    <section className="py-16 bg-tafera-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl text-center mb-4">
          Plan by what matters
        </h2>
        <p className="text-tafera-text-muted text-center mb-12 max-w-xl mx-auto">
          Explore destinations and trips by budget, trip type and season.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-12">
          {FILTERS.map((category) => (
            <div key={category.category}>
              <h3 className="text-sm font-heading font-bold text-tafera-text uppercase tracking-wider mb-4">
                {category.category}
              </h3>
              <ul className="space-y-3">
                {category.options.map((option) => (
                  <li key={option.label}>
                    <a
                      href={option.href}
                      className="text-sm text-tafera-text-muted transition-colors hover:text-tafera-accent"
                    >
                      {option.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-8 text-xs text-tafera-text-muted text-center max-w-xl mx-auto leading-relaxed">
          Destination and trip filtering by budget, trip type and season is
          coming soon. Links currently open the main discovery pages.
        </p>
      </div>
    </section>
  )
}
