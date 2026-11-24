import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchDestinations } from '../../services/destinations'

const CAROUSEL_FETCH_LIMIT = 50
const DRAG_THRESHOLD_PX = 6

const extractBackedCategories = (destination) => {
  const values = []
  if (typeof destination?.category === 'string' && destination.category.trim()) {
    values.push(destination.category.trim())
  }
  if (Array.isArray(destination?.tags)) {
    for (const tag of destination.tags) {
      if (typeof tag === 'string' && tag.trim()) {
        values.push(tag.trim())
      }
    }
  }
  return values
}

function CarouselSkeleton() {
  return (
    <div
      className="flex gap-5 overflow-hidden"
      aria-label="Loading destinations"
      aria-busy="true"
    >
      {[1, 2, 3, 4].map((item) => (
        <div
          key={item}
          className="w-[min(82vw,270px)] shrink-0 sm:w-[300px] lg:w-[320px]"
        >
          <div className="aspect-[4/3] animate-pulse rounded-xl border border-tafera-border bg-tafera-surface" />
          <div className="mt-3 h-5 w-2/3 animate-pulse rounded bg-tafera-surface" />
          <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-tafera-surface" />
        </div>
      ))}
    </div>
  )
}

export default function DestinationDiscoveryCarousel() {
  const [destinations, setDestinations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeCategory, setActiveCategory] = useState('all')
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const trackRef = useRef(null)
  const dragStateRef = useRef({ active: false, startX: 0, startScrollLeft: 0, moved: false })

  const loadDestinations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchDestinations({ page: 1, limit: CAROUSEL_FETCH_LIMIT })
      setDestinations(result?.destinations || [])
    } catch (err) {
      setError(err.message || 'Destinations could not be loaded right now.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDestinations()
  }, [loadDestinations])

  // Derive category pills strictly from real category/tags fields on destination
  // records. If the schema provides none, omit the filter bar completely.
  const backedCategories = useMemo(() => {
    const seen = new Map()
    for (const destination of destinations) {
      for (const label of extractBackedCategories(destination)) {
        const key = label.toLowerCase()
        if (!seen.has(key)) {
          seen.set(key, { id: key, label })
        }
      }
    }
    return [...seen.values()]
  }, [destinations])

  const hasCategoryFilterBar = backedCategories.length > 0

  useEffect(() => {
    if (
      activeCategory !== 'all' &&
      !backedCategories.some((category) => category.id === activeCategory)
    ) {
      setActiveCategory('all')
    }
  }, [backedCategories, activeCategory])

  const filteredDestinations = useMemo(() => {
    if (!hasCategoryFilterBar || activeCategory === 'all') return destinations
    return destinations.filter((destination) =>
      extractBackedCategories(destination).some(
        (label) => label.toLowerCase() === activeCategory,
      ),
    )
  }, [destinations, hasCategoryFilterBar, activeCategory])

  const updateScrollState = useCallback(() => {
    const node = trackRef.current
    if (!node) return
    setCanScrollLeft(node.scrollLeft > 4)
    setCanScrollRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 4)
  }, [])

  useEffect(() => {
    const node = trackRef.current
    if (node) {
      node.scrollLeft = 0
    }
    updateScrollState()
  }, [filteredDestinations, updateScrollState])

  useEffect(() => {
    window.addEventListener('resize', updateScrollState)
    return () => window.removeEventListener('resize', updateScrollState)
  }, [updateScrollState])

  const scrollCarousel = (direction) => {
    const node = trackRef.current
    if (!node) return
    const distance = Math.max(280, Math.round(node.clientWidth * 0.78))
    if (typeof node.scrollBy === 'function') {
      node.scrollBy({ left: direction * distance, behavior: 'smooth' })
    } else {
      node.scrollLeft += direction * distance
    }
  }

  const handleTrackKeyDown = (event) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      scrollCarousel(1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      scrollCarousel(-1)
    }
  }

  const handleMouseDown = (event) => {
    if (event.button !== 0) return
    const node = trackRef.current
    if (!node) return
    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      startScrollLeft: node.scrollLeft,
      moved: false,
    }
  }

  const handleMouseMove = (event) => {
    const state = dragStateRef.current
    const node = trackRef.current
    if (!state.active || !node) return
    const delta = event.clientX - state.startX
    if (!state.moved && Math.abs(delta) > DRAG_THRESHOLD_PX) {
      state.moved = true
      setIsDragging(true)
    }
    if (state.moved) {
      node.scrollLeft = state.startScrollLeft - delta
      updateScrollState()
    }
  }

  const endDrag = () => {
    if (!dragStateRef.current.active) return
    dragStateRef.current.active = false
    setIsDragging(false)
    // Reset moved flag after click phase so dragged links don't trigger accidental navigation.
    setTimeout(() => {
      dragStateRef.current.moved = false
    }, 0)
  }

  const handleTrackClickCapture = (event) => {
    if (dragStateRef.current.moved) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  return (
    <section
      className="bg-tafera-bg py-14 sm:py-20 transition-colors"
      aria-labelledby="discover-home-heading"
    >
      <div className="app-container">
        {/* Section 1: So Much to See. Right Here at Home. */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-tafera-primary">
              Explore destinations
            </p>
            <h2
              id="discover-home-heading"
              className="mt-2 font-heading text-2xl font-bold tracking-tight text-tafera-text sm:text-3xl lg:text-4xl"
            >
              So much to see. Right here at home.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-tafera-text-muted sm:text-lg">
              Hidden gems, iconic landmarks and unforgettable escapes. Find
              somewhere worth adding to your list.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start lg:self-end">
            <button
              type="button"
              onClick={() => scrollCarousel(-1)}
              disabled={loading || (!canScrollLeft && filteredDestinations.length <= 1)}
              aria-label="Scroll destinations left"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-tafera-border bg-tafera-card text-tafera-text transition-colors hover:border-tafera-accent hover:text-tafera-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => scrollCarousel(1)}
              disabled={loading || (!canScrollRight && filteredDestinations.length <= 1)}
              aria-label="Scroll destinations right"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-tafera-border bg-tafera-card text-tafera-text transition-colors hover:border-tafera-accent hover:text-tafera-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <Link
              to="/destinations"
              className="ml-2 text-sm font-semibold text-tafera-primary hover:underline"
            >
              View all →
            </Link>
          </div>
        </div>

        {/* Render category filters only when destination records carry backed category/tags fields */}
        {hasCategoryFilterBar && (
          <div
            role="group"
            aria-label="Filter destinations by category"
            className="mt-7 flex flex-wrap gap-2"
          >
            {[{ id: 'all', label: 'All Places' }, ...backedCategories].map((category) => {
              const isActive = category.id === activeCategory
              return (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActiveCategory(category.id)}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold transition-colors sm:text-sm ${
                    isActive
                      ? 'border-tafera-accent bg-tafera-accent text-tafera-on-accent'
                      : 'border-tafera-border bg-tafera-card text-tafera-text hover:border-tafera-accent hover:text-tafera-primary'
                  }`}
                >
                  {category.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Section 2: Destinations Horizontal Carousel */}
        <div className="mt-8">
          {loading ? (
            <CarouselSkeleton />
          ) : error ? (
            <div
              role="alert"
              className="rounded-xl border border-tafera-border bg-tafera-surface px-6 py-12 text-center"
            >
              <p className="text-sm text-tafera-text-muted">{error}</p>
              <button
                type="button"
                onClick={loadDestinations}
                className="mt-4 inline-flex items-center rounded-md border border-tafera-border bg-tafera-card px-4 py-2 text-sm font-semibold text-tafera-text transition-colors hover:bg-tafera-surface hover:text-tafera-primary"
              >
                Try again
              </button>
            </div>
          ) : filteredDestinations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-tafera-border bg-tafera-surface px-6 py-12 text-center">
              <p className="text-sm font-medium text-tafera-text">
                No destinations are available right now.
              </p>
              <Link
                to="/destinations"
                className="mt-3 inline-block text-sm font-semibold text-tafera-primary hover:underline"
              >
                Browse all destinations →
              </Link>
            </div>
          ) : (
            <div
              ref={trackRef}
              tabIndex={0}
              role="region"
              aria-label="Destinations carousel"
              onScroll={updateScrollState}
              onKeyDown={handleTrackKeyDown}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={endDrag}
              onMouseLeave={endDrag}
              onClickCapture={handleTrackClickCapture}
              className={`no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-tafera-accent rounded-xl ${
                isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'
              }`}
            >
              {filteredDestinations.map((destination) => (
                <article
                  key={destination.id}
                  className="group w-[min(82vw,270px)] shrink-0 snap-start overflow-hidden rounded-xl border border-tafera-border bg-tafera-card shadow-soft transition-all hover:border-tafera-accent hover:shadow-card sm:w-[300px] lg:w-[320px]"
                >
                  <Link
                    to={`/destinations/${destination.slug}`}
                    draggable={false}
                    className="block h-full"
                  >
                    <div className="aspect-[4/3] overflow-hidden bg-tafera-surface">
                      {destination.coverImage?.imageUrl ? (
                        <img
                          src={destination.coverImage.imageUrl}
                          alt={destination.coverImage.altText || destination.name}
                          draggable={false}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.src = '/Tafera logo.svg'
                            event.currentTarget.alt = 'Image unavailable'
                          }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm text-tafera-text-muted">
                          No image
                        </div>
                      )}
                    </div>
                    <div className="p-4 sm:p-5">
                      <p className="text-xs font-medium uppercase tracking-wide text-tafera-text-muted">
                        {destination.state
                          ? `${destination.state}, ${destination.country}`
                          : destination.country}
                      </p>
                      <h3 className="mt-1 font-heading text-lg font-bold text-tafera-text transition-colors group-hover:text-tafera-primary">
                        {destination.name}
                      </h3>
                      {destination.description && (
                        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-tafera-text-muted">
                          {destination.description}
                        </p>
                      )}
                    </div>
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
