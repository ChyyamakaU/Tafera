import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPublicPosts } from '../../services/posts'
import { fetchFeaturedStories } from '../../services/stories'

const normalizeFallbackPost = (post) => ({
  id: post.id,
  title: `A traveller’s moment in ${post.destination.name}`,
  excerpt: post.content,
  badgeLabel: 'Traveller spotlight',
  authorName: post.author?.fullName || 'Tafera traveller',
  author: post.author || null,
  destination: post.destination,
  coverImageUrl: null,
  coverImageAlt: null,
})

function StoriesSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-3 sm:gap-6"
      aria-label="Loading traveller stories"
      aria-busy="true"
    >
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="overflow-hidden rounded-xl border border-tafera-border bg-tafera-bg shadow-soft"
        >
          <div className="aspect-[16/10] animate-pulse bg-tafera-border/50" />
          <div className="space-y-3 p-5">
            <div className="h-3 w-24 animate-pulse rounded bg-tafera-border/60" />
            <div className="h-5 w-4/5 animate-pulse rounded bg-tafera-border/70" />
            <div className="space-y-2 pt-1">
              <div className="h-3.5 w-full animate-pulse rounded bg-tafera-border/50" />
              <div className="h-3.5 w-5/6 animate-pulse rounded bg-tafera-border/50" />
            </div>
            <div className="flex items-center justify-between border-t border-tafera-border pt-3">
              <div className="h-3.5 w-24 animate-pulse rounded bg-tafera-border/60" />
              <div className="h-3.5 w-20 animate-pulse rounded bg-tafera-border/60" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function TravellerStories() {
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true

    const loadStories = async () => {
      setLoading(true)
      setError(null)
      try {
        const curated = await fetchFeaturedStories(3)
        if (!active) return
        if (Array.isArray(curated) && curated.length > 0) {
          setStories(curated.slice(0, 3))
          return
        }
      } catch {
        // Fall back cleanly to destination-linked public posts if curated
        // stories are temporarily unavailable.
      }

      try {
        const posts = await fetchPublicPosts(20)
        if (!active) return
        // When no manually curated stories are featured yet, highlight
        // destination-linked community posts automatically.
        setStories(
          (posts || [])
            .filter((post) => post.destination)
            .slice(0, 3)
            .map(normalizeFallbackPost),
        )
      } catch (err) {
        if (active) setError(err.message || 'Traveller stories are unavailable right now.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadStories().finally(() => {
      if (active) setLoading(false)
    })

    return () => { active = false }
  }, [])

  return (
    <section className="bg-tafera-surface px-4 py-10 sm:px-6 sm:py-16 lg:px-15" aria-labelledby="traveller-stories-title">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-7 max-w-2xl text-center sm:mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-tafera-primary">Field notes</p>
          <h2 id="traveller-stories-title" className="mt-2 font-heading text-2xl font-bold text-tafera-text sm:text-4xl">Stories from travellers</h2>
          <p className="mt-2 text-sm text-tafera-text-muted sm:mt-3 sm:text-base">First-hand moments, connected to the places that inspired them.</p>
        </div>

        {loading ? (
          <StoriesSkeleton />
        ) : error || stories.length === 0 ? (
          <div className="rounded-xl border border-dashed border-tafera-border bg-tafera-bg px-5 py-10 text-center text-sm text-tafera-text-muted">
            {error || 'Destination-linked traveller stories will be featured here as they are shared.'}
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-3 sm:gap-6">
            {stories.map((story) => {
              const coverUrl = story.coverImageUrl || story.destination?.coverImage?.imageUrl || null
              const coverAlt =
                story.coverImageAlt ||
                story.destination?.coverImage?.altText ||
                story.destination?.name ||
                story.title
              const destinationHref = story.destination?.slug
                ? `/destinations/${story.destination.slug}`
                : '/destinations'
              const destinationLabel = story.destination?.name
                ? `Explore ${story.destination.name}`
                : 'Explore destinations'
              const locationLabel =
                story.destination?.location ||
                story.destination?.country ||
                'Tafera community'

              return (
                <li
                  key={story.id}
                  className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-tafera-border bg-tafera-bg shadow-soft transition-shadow hover:shadow-card"
                >
                  <Link
                    to={destinationHref}
                    className="relative block aspect-[16/10] overflow-hidden bg-tafera-surface"
                    aria-label={destinationLabel}
                  >
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt={coverAlt}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-tafera-text-muted">
                        {story.destination?.name || 'Tafera story'}
                      </div>
                    )}
                    <span className="absolute left-3 top-3 rounded-full border border-tafera-border bg-tafera-bg/95 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-tafera-primary">
                      {story.badgeLabel || 'Traveller spotlight'}
                    </span>
                  </Link>
                  <div className="flex flex-1 flex-col p-4 sm:p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-tafera-text-muted">
                      {locationLabel}
                    </p>
                    <h3 className="mt-1 font-heading text-lg font-bold text-tafera-text sm:text-xl">
                      {story.title}
                    </h3>
                    <blockquote className="mt-3 flex-1 border-l-2 border-tafera-accent pl-3 text-sm leading-relaxed text-tafera-text-muted line-clamp-4">
                      “{story.excerpt}”
                    </blockquote>
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-tafera-border pt-3">
                      {story.author?.id ? (
                        <Link
                          to={`/users/${story.author.id}`}
                          className="truncate text-sm font-semibold text-tafera-text hover:text-tafera-primary hover:underline"
                        >
                          {story.authorName || story.author.fullName}
                        </Link>
                      ) : (
                        <span className="truncate text-sm font-semibold text-tafera-text">
                          {story.authorName || 'Tafera traveller'}
                        </span>
                      )}
                      <Link
                        to={destinationHref}
                        className="shrink-0 text-xs font-semibold text-tafera-primary hover:underline"
                      >
                        {story.destination?.slug ? 'Explore place →' : 'Explore →'}
                      </Link>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
