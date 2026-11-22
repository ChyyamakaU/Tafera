import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPublicPosts } from '../../services/posts'

export default function TravellerStories() {
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    fetchPublicPosts(20)
      .then((posts) => {
        if (!active) return
        // This public showcase is intentionally not the interactive feed: only
        // traveller posts tied to a real destination are eligible for a spotlight.
        setStories(posts.filter((post) => post.destination).slice(0, 3))
      })
      .catch((err) => {
        if (active) setError(err.message || 'Traveller stories are unavailable right now.')
      })
      .finally(() => {
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

        {loading ? <div className="grid grid-cols-1 gap-4 md:grid-cols-3" aria-label="Loading traveller stories">{[1, 2, 3].map((i) => <div key={i} className="h-64 animate-pulse rounded-xl border border-tafera-border bg-white" />)}</div> : error || stories.length === 0 ? (
          <div className="rounded-xl border border-tafera-border bg-white px-5 py-10 text-center text-sm text-tafera-text-muted">{error || 'Destination-linked traveller stories will be featured here as they are shared.'}</div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-3 sm:gap-6">
            {stories.map((story) => (
              <li key={story.id} className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-tafera-border bg-white shadow-soft transition-shadow hover:shadow-card">
                <Link to={`/destinations/${story.destination.slug}`} className="relative block aspect-[16/10] overflow-hidden bg-tafera-bg" aria-label={`Explore ${story.destination.name}`}>
                  {story.destination.coverImage?.imageUrl ? <img src={story.destination.coverImage.imageUrl} alt={story.destination.coverImage.altText || story.destination.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" /> : <div className="flex h-full items-center justify-center text-sm text-tafera-text-muted">{story.destination.name}</div>}
                  <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-tafera-primary">Traveller spotlight</span>
                </Link>
                <div className="flex flex-1 flex-col p-4 sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-tafera-text-muted">{story.destination.location || story.destination.country}</p>
                  <h3 className="mt-1 font-heading text-lg font-bold text-tafera-text sm:text-xl">A traveller’s moment in {story.destination.name}</h3>
                  <blockquote className="mt-3 flex-1 border-l-2 border-tafera-accent pl-3 text-sm leading-relaxed text-tafera-text-muted line-clamp-4">“{story.content}”</blockquote>
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-tafera-border pt-3">
                    <Link to={`/users/${story.author.id}`} className="truncate text-sm font-semibold text-tafera-text hover:text-tafera-primary hover:underline">{story.author.fullName}</Link>
                    <Link to={`/destinations/${story.destination.slug}`} className="shrink-0 text-xs font-semibold text-tafera-primary hover:underline">Explore place →</Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
