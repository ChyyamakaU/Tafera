import { Link } from 'react-router-dom'

const CARDS = [
  {
    title: 'Plan by Budget',
    description: 'Find destinations that suit the way you want to spend.',
    cta: 'Explore destinations',
    to: '/destinations',
    imageUrl: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    imageAlt: 'Budget-friendly travel destination',
  },
  {
    title: 'Plan by Season',
    description: 'Discover places worth visiting throughout the year.',
    cta: 'Explore destinations',
    to: '/destinations',
    imageUrl: 'https://images.unsplash.com/photo-1448375240586-882707db788b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    imageAlt: 'Seasonal travel destination',
  },
  {
    title: 'Plan by Trip Type',
    description: 'Find inspiration for solo adventures, weekends and group getaways.',
    cta: 'Explore trips',
    to: '/trips',
    imageUrl: 'https://images.unsplash.com/photo-1529273776301-760721dd3725?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    imageAlt: 'Group travel adventure',
  },
]

export default function DiscoveryFilters() {
  return (
    <section className="py-16 bg-tafera-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl mb-4">
            Plan by What Matters
          </h2>
          <p className="text-lg text-tafera-text-muted max-w-xl mx-auto">
            Choose how you want to explore — by budget, season or the kind of
            trip you have in mind.
          </p>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {CARDS.map((card) => (
            <li key={card.title}>
              <Link to={card.to} className="block">
                <div
                  className="aspect-square overflow-hidden rounded-md border border-tafera-border bg-tafera-surface group relative"
                >
                  <div className="absolute inset-0">
                    <img
                      src={card.imageUrl}
                      alt={card.imageAlt}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                      onError={(e) => {
                        e.target.style.opacity = '0'
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                  </div>
                  <div className="absolute inset-0 p-6 flex flex-col justify-between">
                    <div>
                      <h3
                        className="font-heading font-bold text-white text-lg sm:text-xl mb-1"
                      >
                        {card.title}
                      </h3>
                      <p className="text-white/90 font-body text-sm leading-relaxed">
                        {card.description}
                      </p>
                    </div>
                    <div>
                      <span
                        className="inline-flex items-center gap-1 text-sm font-nav font-medium text-white"
                      >
                        {card.cta}
                        <svg
                          className="w-4 h-4 text-white"
                          viewBox="0 0 24 24"
                          strokeWidth="1.5"
                          stroke="currentColor"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 12h14"
                          />
                        </svg>
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
