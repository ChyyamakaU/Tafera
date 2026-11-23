import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/common/Button'
import ProfileActivitySections from '../components/profile/ProfileActivitySections'
import FollowConnectionsModal from '../components/profile/FollowConnectionsModal'
import {
  getPublicProfile,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
} from '../services/users'
import { getErrorMessage } from '../services/errors'

const isAlreadyFollowingError = (err) =>
  err?.code === 'FOLLOW_EXISTS' ||
  err?.status === 409 ||
  /already follow/i.test(err?.message || '')

const isNotFollowingError = (err) =>
  err?.code === 'FOLLOW_NOT_FOUND' || err?.status === 404

export default function PublicProfile() {
  const { userId } = useParams()
  const { user, isAuthenticated } = useAuth()

  const [profile, setProfile] = useState(null)
  const [followers, setFollowers] = useState([])
  const [following, setFollowing] = useState([])
  const [followersTotal, setFollowersTotal] = useState(0)
  const [followingTotal, setFollowingTotal] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [followNotice, setFollowNotice] = useState(null)
  const [followLoading, setFollowLoading] = useState(false)
  const [connectionsModal, setConnectionsModal] = useState({ open: false, type: 'followers' })
  const loadVersionRef = useRef(0)

  const isOwner = isAuthenticated && user && user.id === userId

  const loadProfile = useCallback(async ({ showLoading = true } = {}) => {
    if (!userId) return
    loadVersionRef.current += 1
    const version = loadVersionRef.current
    if (showLoading) {
      setLoading(true)
      setLoadError(null)
    }
    try {
      const [profileData, followersData, followingData] = await Promise.all([
        getPublicProfile(userId),
        getFollowers(userId, { page: 1, limit: 10 }),
        getFollowing(userId, { page: 1, limit: 10 }),
      ])
      if (loadVersionRef.current !== version) return
      const followerRows = followersData?.followers || []
      const followingRows = followingData?.following || []
      setProfile(profileData)
      setFollowers(followerRows)
      setFollowing(followingRows)
      setFollowersTotal(followersData?.pagination?.total ?? followerRows.length)
      setFollowingTotal(followingData?.pagination?.total ?? followingRows.length)
      if (showLoading && user?.id && followerRows.some((row) => row.user?.id === user.id)) {
        setIsFollowing(true)
      }
    } catch (err) {
      if (loadVersionRef.current !== version) return
      if (showLoading) {
        setLoadError(err.message || 'Failed to load profile.')
      }
    } finally {
      if (loadVersionRef.current === version) setLoading(false)
    }
  }, [userId, user?.id])

  // Reset per-profile follow state only when navigating to a different user profile.
  useEffect(() => {
    if (!userId) return
    setIsFollowing(false)
    setFollowNotice(null)
    setConnectionsModal({ open: false, type: 'followers' })
    loadProfile({ showLoading: true })
  }, [userId, loadProfile])

  useEffect(() => {
    if (!isAuthenticated || isOwner) {
      setIsFollowing(false)
    }
  }, [isAuthenticated, isOwner])

  const handleFollow = async () => {
    if (!isAuthenticated || isOwner || followLoading) return
    setFollowLoading(true)
    setFollowNotice(null)
    try {
      if (!isFollowing) {
        await followUser(userId)
        setIsFollowing(true)
        setFollowersTotal((count) => count + 1)
        setFollowNotice({
          type: 'success',
          message: `You're now following ${profile?.fullName || 'this traveller'}.`,
        })
      } else {
        await unfollowUser(userId)
        setIsFollowing(false)
        setFollowersTotal((count) => Math.max(0, count - 1))
        setFollowNotice({
          type: 'info',
          message: `You unfollowed ${profile?.fullName || 'this traveller'}.`,
        })
      }
      // Refresh counts silently without resetting the button state or unmounting content.
      loadProfile({ showLoading: false })
    } catch (err) {
      if (!isFollowing && isAlreadyFollowingError(err)) {
        // Keep the user on this profile, sync button state to Following, and show inline feedback.
        setIsFollowing(true)
        setFollowNotice({
          type: 'info',
          message: "You're already following this traveller.",
        })
        loadProfile({ showLoading: false })
      } else if (isFollowing && isNotFollowingError(err)) {
        setIsFollowing(false)
        setFollowNotice({
          type: 'info',
          message: "You're not following this traveller.",
        })
        loadProfile({ showLoading: false })
      } else {
        setFollowNotice({
          type: 'error',
          message: err?.message || getErrorMessage(err) || 'Failed to update follow status.',
        })
      }
    } finally {
      setFollowLoading(false)
    }
  }

  const openConnections = (type) => setConnectionsModal({ open: true, type })

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

  if (loadError || !profile) {
    return (
      <div className="app-container py-24 text-center">
        {loadError && (
          <p className="text-sm text-red-500">{loadError}</p>
        )}
        {!loadError && (
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
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => openConnections('followers')}
              className="flex min-w-[5.25rem] flex-col items-center rounded-lg border border-tafera-border bg-tafera-card px-3.5 py-2 text-center transition-colors hover:border-tafera-primary"
            >
              <span className="text-sm font-bold text-tafera-text">{followersTotal}</span>
              <span className="text-xs font-medium text-tafera-text-muted">Followers</span>
            </button>
            <button
              type="button"
              onClick={() => openConnections('following')}
              className="flex min-w-[5.25rem] flex-col items-center rounded-lg border border-tafera-border bg-tafera-card px-3.5 py-2 text-center transition-colors hover:border-tafera-primary"
            >
              <span className="text-sm font-bold text-tafera-text">{followingTotal}</span>
              <span className="text-xs font-medium text-tafera-text-muted">Following</span>
            </button>
            {!isOwner && isAuthenticated && (
              <Button
                onClick={handleFollow}
                disabled={followLoading}
                variant={isFollowing ? 'outline' : 'primary'}
                aria-pressed={isFollowing}
              >
                {followLoading
                  ? isFollowing
                    ? 'Unfollowing...'
                    : 'Following...'
                  : isFollowing
                    ? 'Following'
                    : 'Follow'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {followNotice && (
        <div
          role={followNotice.type === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={`mb-6 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm text-tafera-text ${
            followNotice.type === 'error'
              ? 'border-red-500/30 bg-red-500/10'
              : 'border-tafera-border bg-tafera-card shadow-soft'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {followNotice.type !== 'error' && (
              <span
                aria-hidden="true"
                className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-tafera-accent"
              />
            )}
            <span>{followNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFollowNotice(null)}
            className="rounded-md px-2 py-1 text-xs font-medium text-tafera-text-muted transition-colors hover:bg-tafera-surface hover:text-tafera-text"
            aria-label="Dismiss notification"
          >
            Dismiss
          </button>
        </div>
      )}

      <ProfileActivitySections
        userId={profile.id || userId}
        isOwnProfile={Boolean(isOwner)}
        profileName={profile.fullName || 'This traveller'}
      />

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-tafera-border bg-tafera-surface p-6 shadow-soft">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="font-heading font-bold text-lg text-tafera-text">
              Followers ({followersTotal})
            </h2>
            {followersTotal > 0 && (
              <button
                type="button"
                onClick={() => openConnections('followers')}
                className="text-xs font-semibold text-tafera-primary hover:underline"
              >
                View all
              </button>
            )}
          </div>
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

        <div className="rounded-lg border border-tafera-border bg-tafera-surface p-6 shadow-soft">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="font-heading font-bold text-lg text-tafera-text">
              Following ({followingTotal})
            </h2>
            {followingTotal > 0 && (
              <button
                type="button"
                onClick={() => openConnections('following')}
                className="text-xs font-semibold text-tafera-primary hover:underline"
              >
                View all
              </button>
            )}
          </div>
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
      </div>

      <FollowConnectionsModal
        isOpen={connectionsModal.open}
        type={connectionsModal.type}
        userId={profile.id || userId}
        profileName={profile.fullName || 'Traveller'}
        canUnfollow={Boolean(isOwner)}
        onClose={() => setConnectionsModal((current) => ({ ...current, open: false }))}
        onTypeChange={(nextType) => setConnectionsModal({ open: true, type: nextType })}
        onFollowingChanged={(delta) => {
          setFollowingTotal((count) => Math.max(0, count + delta))
          loadProfile({ showLoading: false })
        }}
      />

      <div className="mt-10 flex justify-end">
        <Link asChild to="/">
          <Button variant="ghost">Back to home</Button>
        </Link>
      </div>
    </div>
  )
}
