import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPublicPosts } from '../../services/posts'

export default function TravellerStories() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchPublicPosts(6)
      .then((data) => {
        setPosts(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <section className="px-0 md:px-15 py-16">
        <div className="px-[15px]">
          <h2 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl text-center mb-16">
            Stories from travellers
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="aspect-video rounded-md border border-tafera-border bg-tafera-surface animate-pulse" />
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (error || posts.length === 0) {
    return (
      <section className="px-0 md:px-15 py-16">
        <div className="px-[15px]">
          <h2 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl text-center mb-16">
            Stories from travellers
          </h2>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-tafera-text-muted">
              {error || "There are no traveller stories to share right now."}
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="px-0 md:px-15 py-16">
      <div className="px-[15px]">
        <h2 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl text-center mb-16">
          Stories from travellers
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post) => (
            <li key={post.id} className="group">
              <div className="flex flex-col gap-4">
                {post.destination && post.destination.coverImage ? (
                  <div className="aspect-video overflow-hidden rounded-md border border-tafera-border bg-tafera-surface group-hover:border-tafera-accent transition-colors">
                    <img
                      src={post.destination.coverImage.imageUrl}
                      alt={post.destination.coverImage.altText || 'Travel story'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className="aspect-video overflow-hidden rounded-md border border-tafera-border bg-tafera-surface">
                    <span className="text-tafera-text-muted text-sm">
                      No image
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-xs font-semibold text-tafera-text font-nav truncate block">
                    {post.author.fullName}
                  </span>
                  <p className="text-sm text-tafera-text-muted line-clamp-2 leading-relaxed">
                    {post.content}
                  </p>
                  {post.destination && (
                    <Link
                      to={`/destinations/${post.destination.slug}`}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-tafera-primary hover:underline"
                    >
                      Explore {post.destination.name} →
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
