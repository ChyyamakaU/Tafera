import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/common/Button'
import { getFollowers, getFollowing } from '../services/users'

const LIST_CONFIG = {
  followers: {
    label: 'Followers',
    service: getFollowers,
    empty: 'No followers yet.',
  },
  following: {
    label: 'Following',
    service: getFollowing,
    empty: 'Not following anyone yet.',
  },
}

export default function FollowList() {
  const { userId, type } = useParams()
  const navigate = useNavigate()
  const config = LIST_CONFIG[type]

  const [items, setItems] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadList = async (page = 1) => {
    try {
      setError(null)
      const data = await config.service(userId, { page, limit: 20 })
      setItems(data.followers || data.following || [])
      setPagination(data.pagination || null)
    } catch (err) {
      setError(err.message || 'Failed to load the list.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!userId || !config) return
    loadList()
  }, [userId, config])

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-24 text-center">
        <div className="h-8 w-32 rounded-md border border-tafera-border bg-tafera-surface animate-pulse mx-auto" />
        <h2 className="mt-4 text-lg font-heading font-bold text-tafera-text">
          Loading {config.label.toLowerCase()}...
        </h2>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-24 text-center">
        <p className="text-sm text-red-700">{error}</p>
        <div className="mt-8 flex justify-center">
          <Link asChild to={`/users/${userId}`}>
            <Button variant="ghost">Back to profile</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-2">
        <Link
          to={`/users/${userId}`}
          className="text-sm text-tafera-accent hover:underline font-medium"
        >
          ← Back to profile
        </Link>
        <h1 className="ml-2 text-2xl font-heading font-bold text-tafera-text">
          {config.label}
        </h1>
      </div>

      {items.length > 0 ? (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.user.id} className="flex items-center gap-4 border-b border-tafera-border pb-4 last:border-b-0 last:pb-0">
              {item.user.profileImage && (
                <img
                  src={item.user.profileImage}
                  alt={`${item.user.fullName}'s profile picture`}
                  className="w-10 h-10 rounded-full border border-tafera-border object-cover"
                />
              )}
              <div>
                <Link
                  to={`/users/${item.user.id}`}
                  className="font-medium text-tafera-text hover:text-tafera-accent"
                >
                  {item.user.fullName}
                </Link>
                <p className="text-xs text-tafera-text-muted">
                  followed{' '}
                  {item.followedAt
                    ? new Date(item.followedAt).toLocaleDateString()
                    : 'on their profile'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-tafera-text-muted">{config.empty}</p>
      )}

      <div className="mt-8 flex justify-end">
        <Link
          asChild
          to={`/users/${userId}`}
        >
          <Button variant="ghost">Back to profile</Button>
        </Link>
      </div>
    </div>
  )
}
