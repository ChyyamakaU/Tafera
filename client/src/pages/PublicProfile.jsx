import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/common/Button'
import {
  getPublicProfile,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
} from '../services/users'

export default function PublicProfile() {
  const { userId } = useParams()
  const { user, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [followers, setFollowers] = useState([])
  const [following, setFollowing] = useState([])
  const [isFollowing, setIsFollowing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [followLoading, setFollowLoading] = useState(false)

  const isOwner = isAuthenticated && user && user.id === userId

  const loadProfile = async () => {
    try {
      setError(null)
      const [profileData, followersData, followingData] = await Promise.all([
        getPublicProfile(userId),
        getFollowers(userId, { page: 1, limit: 10 }),
        getFollowing(userId, { page: 1, limit: 10 }),
      ])
      setProfile(profileData)
      setFollowers(followersData.followers || [])
      setFollowing(followingData.following || [])
    } catch (err) {
      setError(err.message || 'Failed to load profile.')
    } finally {
      setLoading(false)
    }
  }

  // A public profile can be viewed by anyone, but the follow state and action
  // are only relevant to an authenticated viewer looking at someone else.
  useEffect(() => {
    if (!userId) return
    loadProfile()
  }, [userId])

  useEffect(() => {
    if (!isAuthenticated || isOwner || !profile) {
      setIsFollowing(null)
      return
    }
    // The public profile does not expose whether the viewer follows the user,
    // so start in an "unknown" state; the button toggles optimistically and
    // the follow/unfollow endpoints are the source of truth.
    setIsFollowing(null)
  }, [isAuthenticated, isOwner, profile])

  const handleFollow = async () => {
    if (!isAuthenticated || isOwner || followLoading) return
    setFollowLoading(true)
    setError(null)
    try {
      if (isFollowing === false || isFollowing === null) {
        await followUser(userId)
        setIsFollowing(true)
      } else {
        await unfollowUser(userId)
        setIsFollowing(false)
      }
      // Refresh counts so the displayed totals stay accurate.
      loadProfile()
    } catch (err) {
      setError(err.message || 'Failed to update follow status.')
    } finally {
      setFollowLoading(false)
    }
  }

  const viewFollowers = () => navigate(`/users/${userId}/followers`)
  const viewFollowing = () => navigate(`/users/${userId}/following`)

  if (loading) {
    return (
      <div className="app-container py-24">
        <div className="text-center">
          <div className="h-8 w-32 rounded-md border border-tafera-border bg-tafera-surface animate-pulse mx-auto" />
          <h2 className="mt-4 text-lg font-heading font-bold text-tafera-text">
            Loading profile...
          </h2>
          <p className="mt-2 text-tafera-text-muted">
            Please wait while we load the profile.
          </p>
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="app-container py-24 text-center">
        {error && (
          <p className="text-sm text-red-700">{error}</p>
        )}
        {!error && (
          <p className="text-tafera-text-muted">This profile could not be found.</p>
        )}
        <div className="mt-8 flex justify-center">
          <Link asChild to="/">
            <Button variant="ghost">Back to home</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
<div className="app-container py-8">
      <div className="mb-8">
        <Link
          to="/"
          className="inline-block text-sm text-tafera-accent hover:underline font-medium mb-2"
        >
          ← Back to home
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            {profile.profileImage && (
              <img
                src={profile.profileImage}
                alt={`${profile.fullName}'s profile picture`}
                className="w-24 h-24 rounded-full border border-tafera-border object-cover mb-4"
              />
            )}
            <h1 className="text-2xl font-heading font-bold text-tafera-text sm:text-3xl">
              {profile.fullName}
            </h1>
            {profile.username && <p className="mt-1 text-sm text-tafera-text-muted">@{profile.username}</p>}
            {(profile.city || profile.state) && <p className="mt-1 text-sm text-tafera-text-muted">{[profile.city, profile.state, 'Nigeria'].filter(Boolean).join(', ')}</p>}
            {profile.bio && (
              <p className="mt-2 text-tafera-text-muted leading-relaxed">
                {profile.bio}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {[
                ['websiteUrl', 'Website'],
                ['instagramUrl', 'Instagram'],
                ['tiktokUrl', 'TikTok'],
                ['youtubeUrl', 'YouTube'],
              ].filter(([field]) => profile[field]).map(([field, label]) => (
                <a key={field} href={profile[field]} target="_blank" rel="noreferrer" className="font-medium text-tafera-primary hover:underline">{label}</a>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center hidden sm:block">
              <p className="text-sm font-semibold text-tafera-text">
                {followers.length}
              </p>
              <p
                onClick={viewFollowers}
                className="mt-1 text-xs text-tafera-primary hover:underline cursor-pointer"
              >
                Followers
              </p>
            </div>
            <div className="text-center hidden sm:block">
              <p className="text-sm font-semibold text-tafera-text">
                {following.length}
              </p>
              <p
                onClick={viewFollowing}
                className="mt-1 text-xs text-tafera-primary hover:underline cursor-pointer"
              >
                Following
              </p>
            </div>
            {!isOwner && isAuthenticated && (
              <Button
                onClick={handleFollow}
                disabled={followLoading}
                variant={isFollowing ? 'outline' : 'primary'}
              >
                {followLoading ? (isFollowing ? 'Unfollowing...' : 'Following...') : isFollowing ? 'Unfollow' : 'Follow'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-tafera-text text-sm">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-tafera-border bg-tafera-surface p-6 shadow-soft">
        <h2 className="font-heading font-bold text-lg text-tafera-text mb-4">
          Followers ({followers.length})
        </h2>
        {followers.length > 0 ? (
          <ul className="space-y-3">
            {followers.map((follow) => (
              <li key={follow.user.id} className="flex items-center gap-4">
                {follow.user.profileImage && (
                  <img
                    src={follow.user.profileImage}
                    alt={`${follow.user.fullName}'s profile picture`}
                    className="w-10 h-10 rounded-full border border-tafera-border object-cover"
                  />
                )}
                <div>
                  <Link
                    to={`/users/${follow.user.id}`}
                    className="font-medium text-tafera-text hover:text-tafera-accent"
                  >
                    {follow.user.fullName}
                  </Link>
                  <p className="text-xs text-tafera-text-muted">
                    followed {new Date(follow.followedAt).toLocaleDateString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-tafera-text-muted">
            No followers yet.
          </p>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-tafera-border bg-tafera-surface p-6 shadow-soft">
        <h2 className="font-heading font-bold text-lg text-tafera-text mb-4">
          Following ({following.length})
        </h2>
        {following.length > 0 ? (
          <ul className="space-y-3">
            {following.map((follow) => (
              <li key={follow.user.id} className="flex items-center gap-4">
                {follow.user.profileImage && (
                  <img
                    src={follow.user.profileImage}
                    alt={`${follow.user.fullName}'s profile picture`}
                    className="w-10 h-10 rounded-full border border-tafera-border object-cover"
                  />
                )}
                <div>
                  <Link
                    to={`/users/${follow.user.id}`}
                    className="font-medium text-tafera-text hover:text-tafera-accent"
                  >
                    {follow.user.fullName}
                  </Link>
                  <p className="text-xs text-tafera-text-muted">
                    followed {new Date(follow.followedAt).toLocaleDateString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-tafera-text-muted">
            Not following anyone yet.
          </p>
        )}
      </div>

      <div className="mt-10 flex justify-end">
        <Link asChild to="/">
          <Button variant="ghost">Back to home</Button>
        </Link>
      </div>
    </div>
  )
}
