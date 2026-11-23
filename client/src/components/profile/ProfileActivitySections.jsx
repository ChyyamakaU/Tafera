import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../common/Button'
import { useAuth } from '../../contexts/AuthContext'
import { fetchUserComments, fetchUserMedia } from '../../services/users'
import {
  deletePost,
  deletePostComment,
  fetchUserPosts,
  likePost,
  savePost,
  unlikePost,
  unsavePost,
  updatePost,
  updatePostComment,
} from '../../services/posts'
import { getErrorMessage } from '../../services/errors'

const FILTER_TABS = ['All', 'Posts', 'Media', 'Comments']
const PAGE_LIMIT = 20
const OVERVIEW_LIMITS = {
  Posts: 4,
  Media: 8,
  Comments: 5,
}

const inputClass =
  'w-full rounded-lg border border-tafera-border bg-tafera-card px-3 py-2 text-sm text-tafera-text placeholder:text-tafera-text-muted focus:border-tafera-primary focus:outline-none focus:ring-2 focus:ring-tafera-primary'

const createEmptySection = () => ({
  items: [],
  pagination: null,
  loading: true,
  loadingMore: false,
  error: null,
})

function formatShortDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString()
}

function HeartIcon({ filled }) {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
      />
    </svg>
  )
}

function BookmarkIcon({ filled }) {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
      />
    </svg>
  )
}

function SectionSkeleton({ variant }) {
  if (variant === 'Media') {
    return (
      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        aria-label="Loading media"
      >
        {[1, 2, 3, 4].map((item) => (
          <div
            key={item}
            className="overflow-hidden rounded-lg border border-tafera-border bg-tafera-card"
          >
            <div className="aspect-square animate-pulse bg-tafera-surface" />
            <div className="p-2.5">
              <div className="h-3 w-3/4 animate-pulse rounded bg-tafera-surface" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'Comments') {
    return (
      <div className="space-y-3" aria-label="Loading comments">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="rounded-lg border border-tafera-border bg-tafera-card p-4"
          >
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-tafera-surface" />
            <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-tafera-surface" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-label="Loading posts">
      {[1, 2].map((item) => (
        <div
          key={item}
          className="rounded-lg border border-tafera-border bg-tafera-card p-4"
        >
          <div className="h-4 w-5/6 animate-pulse rounded bg-tafera-surface" />
          <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-tafera-surface" />
          <div className="mt-4 h-3 w-1/3 animate-pulse rounded bg-tafera-surface" />
        </div>
      ))}
    </div>
  )
}

export default function ProfileActivitySections({
  userId,
  isOwnProfile = false,
  profileName = 'This traveller',
}) {
  const { isAuthenticated, isEmailVerified } = useAuth()
  const canInteract = isAuthenticated && isEmailVerified

  const [activeFilter, setActiveFilter] = useState('All')
  const [sections, setSections] = useState({
    Posts: createEmptySection(),
    Media: createEmptySection(),
    Comments: createEmptySection(),
  })

  // Inline editing & interaction state
  const [editingPostId, setEditingPostId] = useState(null)
  const [editingPostContent, setEditingPostContent] = useState('')
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editingCommentContent, setEditingCommentContent] = useState('')
  const [busyActionKey, setBusyActionKey] = useState(null)
  const [actionErrors, setActionErrors] = useState({})
  const [lightboxMedia, setLightboxMedia] = useState(null)

  // Track the latest userId request cycle to prevent stale responses from
  // overwriting state when switching rapidly between user profiles.
  const requestVersionRef = useRef(0)

  const loadSection = useCallback(
    async (sectionKey, targetUserId, { page = 1, append = false, version } = {}) => {
      if (!targetUserId) return
      const activeVersion = version ?? requestVersionRef.current

      setSections((current) => ({
        ...current,
        [sectionKey]: {
          ...current[sectionKey],
          loading: !append,
          loadingMore: append,
          error: null,
        },
      }))

      try {
        const result =
          sectionKey === 'Posts'
            ? await fetchUserPosts(targetUserId, { page, limit: PAGE_LIMIT })
            : sectionKey === 'Media'
              ? await fetchUserMedia(targetUserId, { page, limit: PAGE_LIMIT })
              : await fetchUserComments(targetUserId, { page, limit: PAGE_LIMIT })

        if (requestVersionRef.current !== activeVersion) return

        const incoming =
          sectionKey === 'Posts'
            ? result?.posts || []
            : sectionKey === 'Media'
              ? result?.media || []
              : result?.comments || []

        setSections((current) => {
          const existing = current[sectionKey].items
          const merged = append
            ? [
                ...existing,
                ...incoming.filter((item) => !existing.some((prev) => prev.id === item.id)),
              ]
            : incoming

          return {
            ...current,
            [sectionKey]: {
              items: merged,
              pagination: result?.pagination || null,
              loading: false,
              loadingMore: false,
              error: null,
            },
          }
        })
      } catch (err) {
        if (requestVersionRef.current !== activeVersion) return
        setSections((current) => ({
          ...current,
          [sectionKey]: {
            ...current[sectionKey],
            loading: false,
            loadingMore: false,
            error: getErrorMessage(err),
          },
        }))
      }
    },
    [],
  )

  useEffect(() => {
    if (!userId) return
    requestVersionRef.current += 1
    const version = requestVersionRef.current

    setActiveFilter('All')
    setEditingPostId(null)
    setEditingCommentId(null)
    setActionErrors({})
    setLightboxMedia(null)
    setSections({
      Posts: createEmptySection(),
      Media: createEmptySection(),
      Comments: createEmptySection(),
    })

    // Fire all three requests independently so each section resolves and renders
    // as soon as its own response arrives, and an error in one never blocks the others.
    loadSection('Posts', userId, { page: 1, append: false, version })
    loadSection('Media', userId, { page: 1, append: false, version })
    loadSection('Comments', userId, { page: 1, append: false, version })
  }, [userId, loadSection])

  useEffect(() => {
    if (!lightboxMedia) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setLightboxMedia(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightboxMedia])

  const handleToggleLike = async (post) => {
    if (!canInteract || busyActionKey === `like-${post.id}`) return
    const wasLiked = Boolean(post.isLiked)
    const prevCount = Number(post.likeCount || 0)
    const nextLiked = !wasLiked
    const nextCount = Math.max(0, prevCount + (nextLiked ? 1 : -1))

    setBusyActionKey(`like-${post.id}`)
    setActionErrors((current) => ({ ...current, [`post-${post.id}`]: null }))
    setSections((current) => ({
      ...current,
      Posts: {
        ...current.Posts,
        items: current.Posts.items.map((item) =>
          item.id === post.id ? { ...item, isLiked: nextLiked, likeCount: nextCount } : item,
        ),
      },
    }))

    try {
      const response = nextLiked ? await likePost(post.id) : await unlikePost(post.id)
      setSections((current) => ({
        ...current,
        Posts: {
          ...current.Posts,
          items: current.Posts.items.map((item) =>
            item.id === post.id
              ? {
                  ...item,
                  isLiked: typeof response?.liked === 'boolean' ? response.liked : nextLiked,
                  likeCount:
                    typeof response?.likeCount === 'number' ? response.likeCount : nextCount,
                }
              : item,
          ),
        },
      }))
    } catch (err) {
      setSections((current) => ({
        ...current,
        Posts: {
          ...current.Posts,
          items: current.Posts.items.map((item) =>
            item.id === post.id ? { ...item, isLiked: wasLiked, likeCount: prevCount } : item,
          ),
        },
      }))
      setActionErrors((current) => ({
        ...current,
        [`post-${post.id}`]: getErrorMessage(err),
      }))
    } finally {
      setBusyActionKey(null)
    }
  }

  const handleToggleSave = async (post) => {
    if (!canInteract || busyActionKey === `save-${post.id}`) return
    const wasSaved = Boolean(post.isSaved)
    const nextSaved = !wasSaved

    setBusyActionKey(`save-${post.id}`)
    setActionErrors((current) => ({ ...current, [`post-${post.id}`]: null }))
    setSections((current) => ({
      ...current,
      Posts: {
        ...current.Posts,
        items: current.Posts.items.map((item) =>
          item.id === post.id ? { ...item, isSaved: nextSaved } : item,
        ),
      },
    }))

    try {
      const response = nextSaved ? await savePost(post.id) : await unsavePost(post.id)
      setSections((current) => ({
        ...current,
        Posts: {
          ...current.Posts,
          items: current.Posts.items.map((item) =>
            item.id === post.id
              ? {
                  ...item,
                  isSaved: typeof response?.saved === 'boolean' ? response.saved : nextSaved,
                }
              : item,
          ),
        },
      }))
    } catch (err) {
      setSections((current) => ({
        ...current,
        Posts: {
          ...current.Posts,
          items: current.Posts.items.map((item) =>
            item.id === post.id ? { ...item, isSaved: wasSaved } : item,
          ),
        },
      }))
      setActionErrors((current) => ({
        ...current,
        [`post-${post.id}`]: getErrorMessage(err),
      }))
    } finally {
      setBusyActionKey(null)
    }
  }

  const handleSavePostEdit = async (event, post) => {
    event.preventDefault()
    const trimmed = editingPostContent.trim()
    if (!trimmed) return
    setBusyActionKey(`edit-post-${post.id}`)
    setActionErrors((current) => ({ ...current, [`post-${post.id}`]: null }))
    try {
      const updated = await updatePost(post.id, { content: trimmed })
      setSections((current) => ({
        ...current,
        Posts: {
          ...current.Posts,
          items: current.Posts.items.map((item) =>
            item.id === post.id ? { ...item, ...updated, content: updated?.content || trimmed } : item,
          ),
        },
      }))
      setEditingPostId(null)
    } catch (err) {
      setActionErrors((current) => ({
        ...current,
        [`post-${post.id}`]: getErrorMessage(err),
      }))
    } finally {
      setBusyActionKey(null)
    }
  }

  const handleDeletePost = async (post) => {
    if (!window.confirm('Delete this post?')) return
    setBusyActionKey(`delete-post-${post.id}`)
    setActionErrors((current) => ({ ...current, [`post-${post.id}`]: null }))
    try {
      await deletePost(post.id)
      setSections((current) => ({
        ...current,
        Posts: {
          ...current.Posts,
          items: current.Posts.items.filter((item) => item.id !== post.id),
        },
        Media: {
          ...current.Media,
          items: current.Media.items.filter((item) => item.post?.id !== post.id),
        },
      }))
    } catch (err) {
      setActionErrors((current) => ({
        ...current,
        [`post-${post.id}`]: getErrorMessage(err),
      }))
    } finally {
      setBusyActionKey(null)
    }
  }

  const handleSaveCommentEdit = async (event, comment) => {
    event.preventDefault()
    const trimmed = editingCommentContent.trim()
    const postId = comment.post?.id || comment.postId
    if (!trimmed || !postId) return
    setBusyActionKey(`edit-comment-${comment.id}`)
    setActionErrors((current) => ({ ...current, [`comment-${comment.id}`]: null }))
    try {
      const updated = await updatePostComment(postId, comment.id, trimmed)
      setSections((current) => ({
        ...current,
        Comments: {
          ...current.Comments,
          items: current.Comments.items.map((item) =>
            item.id === comment.id
              ? { ...item, ...updated, content: updated?.content || trimmed }
              : item,
          ),
        },
      }))
      setEditingCommentId(null)
    } catch (err) {
      setActionErrors((current) => ({
        ...current,
        [`comment-${comment.id}`]: getErrorMessage(err),
      }))
    } finally {
      setBusyActionKey(null)
    }
  }

  const handleDeleteComment = async (comment) => {
    const postId = comment.post?.id || comment.postId
    if (!postId || !window.confirm('Delete this comment?')) return
    setBusyActionKey(`delete-comment-${comment.id}`)
    setActionErrors((current) => ({ ...current, [`comment-${comment.id}`]: null }))
    try {
      await deletePostComment(postId, comment.id)
      setSections((current) => ({
        ...current,
        Comments: {
          ...current.Comments,
          items: current.Comments.items.filter((item) => item.id !== comment.id),
        },
      }))
    } catch (err) {
      setActionErrors((current) => ({
        ...current,
        [`comment-${comment.id}`]: getErrorMessage(err),
      }))
    } finally {
      setBusyActionKey(null)
    }
  }

  const getSectionCount = (key) => {
    const section = sections[key]
    if (section.loading) return null
    return section.pagination?.total ?? section.items.length
  }

  const showPosts = activeFilter === 'All' || activeFilter === 'Posts'
  const showMedia = activeFilter === 'All' || activeFilter === 'Media'
  const showComments = activeFilter === 'All' || activeFilter === 'Comments'

  const renderSectionHeader = (sectionKey, title, subtitle) => {
    const section = sections[sectionKey]
    const count = getSectionCount(sectionKey)
    const previewLimit = OVERVIEW_LIMITS[sectionKey]
    const hasMoreInOverview =
      activeFilter === 'All' &&
      !section.loading &&
      !section.error &&
      (section.items.length > previewLimit || Boolean(section.pagination?.hasNextPage))

    return (
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-lg font-bold text-tafera-text sm:text-xl">
              {title}
            </h2>
            {typeof count === 'number' && (
              <span className="inline-flex items-center rounded-full border border-tafera-border bg-tafera-card px-2.5 py-0.5 text-xs font-semibold text-tafera-text-muted">
                {count}
              </span>
            )}
          </div>
          {subtitle && <p className="mt-0.5 text-xs text-tafera-text-muted">{subtitle}</p>}
        </div>
        {hasMoreInOverview && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setActiveFilter(sectionKey)}
          >
            View all {title.toLowerCase()}
          </Button>
        )}
      </div>
    )
  }

  const renderSectionError = (sectionKey) => (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-tafera-text"
    >
      <span>{sections[sectionKey].error}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => loadSection(sectionKey, userId, { page: 1, append: false })}
      >
        Retry
      </Button>
    </div>
  )

  const renderLoadMore = (sectionKey, label) => {
    const section = sections[sectionKey]
    if (activeFilter !== sectionKey || !section.pagination?.hasNextPage) return null
    const nextPage = (section.pagination?.page || 1) + 1
    return (
      <div className="mt-5 flex justify-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={section.loadingMore}
          onClick={() => loadSection(sectionKey, userId, { page: nextPage, append: true })}
        >
          {section.loadingMore ? 'Loading…' : label}
        </Button>
      </div>
    )
  }

  const visiblePosts =
    activeFilter === 'All'
      ? sections.Posts.items.slice(0, OVERVIEW_LIMITS.Posts)
      : sections.Posts.items

  const visibleMedia =
    activeFilter === 'All'
      ? sections.Media.items.slice(0, OVERVIEW_LIMITS.Media)
      : sections.Media.items

  const visibleComments =
    activeFilter === 'All'
      ? sections.Comments.items.slice(0, OVERVIEW_LIMITS.Comments)
      : sections.Comments.items

  return (
    <section className="mt-7 sm:mt-10" aria-label="Profile content">
      <div
        role="tablist"
        aria-label="Traveller content"
        className="flex overflow-x-auto border-b border-tafera-border"
      >
        {FILTER_TABS.map((tab) => {
          const count = tab === 'All' ? null : getSectionCount(tab)
          const selected = activeFilter === tab
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`profile-tab-${tab.toLowerCase()}`}
              aria-label={tab}
              aria-selected={selected}
              aria-controls="profile-tab-panel"
              onClick={() => setActiveFilter(tab)}
              className={`inline-flex min-w-[5.5rem] items-center justify-center gap-1.5 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                selected
                  ? 'border-tafera-primary text-tafera-primary'
                  : 'border-transparent text-tafera-text-muted hover:text-tafera-text'
              }`}
            >
              <span>{tab}</span>
              {typeof count === 'number' && (
                <span
                  aria-hidden="true"
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                    selected
                      ? 'bg-tafera-accent text-tafera-on-accent'
                      : 'bg-tafera-surface text-tafera-text-muted'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id="profile-tab-panel"
        aria-labelledby={`profile-tab-${activeFilter.toLowerCase()}`}
        className="space-y-8 py-6"
      >
        {showPosts && (
          <section aria-label="Posts" className="rounded-xl border border-tafera-border bg-tafera-surface p-4 sm:p-6">
            {renderSectionHeader('Posts', 'Posts', 'Travel notes and stories shared with the community.')}
            {sections.Posts.loading ? (
              <SectionSkeleton variant="Posts" />
            ) : sections.Posts.error ? (
              renderSectionError('Posts')
            ) : visiblePosts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-tafera-border bg-tafera-card px-4 py-8 text-center text-sm text-tafera-text-muted">
                {isOwnProfile
                  ? 'You haven’t shared any posts yet.'
                  : `${profileName} hasn’t shared any posts yet.`}
              </p>
            ) : (
              <>
                <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {visiblePosts.map((post) => {
                    const isEditing = editingPostId === post.id
                    const postError = actionErrors[`post-${post.id}`]
                    const likeCount = Number(post.likeCount || 0)
                    const isLiked = Boolean(post.isLiked)
                    const isSaved = Boolean(post.isSaved)

                    return (
                      <li
                        key={post.id}
                        className="flex flex-col rounded-lg border border-tafera-border bg-tafera-card p-4 shadow-soft"
                      >
                        {isEditing ? (
                          <form
                            onSubmit={(event) => handleSavePostEdit(event, post)}
                            className="space-y-2.5"
                          >
                            <label className="sr-only" htmlFor={`edit-profile-post-${post.id}`}>
                              Edit post
                            </label>
                            <textarea
                              id={`edit-profile-post-${post.id}`}
                              className={inputClass}
                              rows="3"
                              maxLength="2000"
                              required
                              value={editingPostContent}
                              onChange={(event) => setEditingPostContent(event.target.value)}
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="submit"
                                size="sm"
                                disabled={
                                  busyActionKey === `edit-post-${post.id}` ||
                                  !editingPostContent.trim()
                                }
                              >
                                {busyActionKey === `edit-post-${post.id}` ? 'Saving…' : 'Save'}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingPostId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-tafera-text">
                            {post.content}
                          </p>
                        )}

                        {post.images?.length > 0 && (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {post.images.map((image) => (
                              <button
                                key={image.id}
                                type="button"
                                onClick={() =>
                                  setLightboxMedia({
                                    imageUrl: image.imageUrl,
                                    altText: image.altText || 'Shared travel photo',
                                    post: { id: post.id, content: post.content },
                                  })
                                }
                                className="group block overflow-hidden rounded-md border border-tafera-border bg-tafera-bg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-tafera-primary"
                                aria-label={`Open photo: ${image.altText || 'Shared travel photo'}`}
                              >
                                <img
                                  src={image.imageUrl}
                                  alt={image.altText || ''}
                                  className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                  loading="lazy"
                                />
                              </button>
                            ))}
                          </div>
                        )}

                        {post.destination?.slug && (
                          <div className="mt-3">
                            <Link
                              to={`/destinations/${post.destination.slug}`}
                              className="inline-flex items-center rounded-full border border-tafera-border bg-tafera-surface px-2.5 py-0.5 text-xs font-medium text-tafera-primary hover:border-tafera-primary"
                            >
                              {post.destination.name}
                            </Link>
                          </div>
                        )}

                        {postError && (
                          <p
                            role="alert"
                            className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-tafera-text"
                          >
                            {postError}
                          </p>
                        )}

                        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-tafera-border pt-3 text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleLike(post)}
                              disabled={!canInteract || busyActionKey === `like-${post.id}`}
                              aria-pressed={canInteract ? isLiked : undefined}
                              aria-label={
                                canInteract
                                  ? isLiked
                                    ? 'Unlike post'
                                    : 'Like post'
                                  : 'Sign in with a verified email to like posts'
                              }
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                isLiked
                                  ? 'border-tafera-primary bg-tafera-bg text-tafera-primary'
                                  : 'border-tafera-border bg-tafera-bg text-tafera-text hover:text-tafera-primary'
                              }`}
                            >
                              <HeartIcon filled={isLiked} />
                              <span>{likeCount}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleSave(post)}
                              disabled={!canInteract || busyActionKey === `save-${post.id}`}
                              aria-pressed={canInteract ? isSaved : undefined}
                              aria-label={
                                canInteract
                                  ? isSaved
                                    ? 'Remove saved post'
                                    : 'Save post'
                                  : 'Sign in with a verified email to save posts'
                              }
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                isSaved
                                  ? 'border-tafera-primary bg-tafera-bg text-tafera-primary'
                                  : 'border-tafera-border bg-tafera-bg text-tafera-text hover:text-tafera-primary'
                              }`}
                            >
                              <BookmarkIcon filled={isSaved} />
                              <span>{isSaved ? 'Saved' : 'Save'}</span>
                            </button>

                            <Link
                              to={`/social?post=${encodeURIComponent(post.id)}`}
                              className="ml-1 font-medium text-tafera-primary hover:underline"
                            >
                              View post
                            </Link>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-tafera-text-muted">
                              {formatShortDate(post.createdAt)}
                            </span>
                            {isOwnProfile && canInteract && !isEditing && (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingPostId(post.id)
                                    setEditingPostContent(post.content || '')
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={busyActionKey === `delete-post-${post.id}`}
                                  onClick={() => handleDeletePost(post)}
                                >
                                  Delete
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                {renderLoadMore('Posts', 'Load more posts')}
              </>
            )}
          </section>
        )}

        {showMedia && (
          <section aria-label="Media" className="rounded-xl border border-tafera-border bg-tafera-surface p-4 sm:p-6">
            {renderSectionHeader('Media', 'Media', 'Photos shared across travel posts.')}
            {sections.Media.loading ? (
              <SectionSkeleton variant="Media" />
            ) : sections.Media.error ? (
              renderSectionError('Media')
            ) : visibleMedia.length === 0 ? (
              <p className="rounded-lg border border-dashed border-tafera-border bg-tafera-card px-4 py-8 text-center text-sm text-tafera-text-muted">
                {isOwnProfile
                  ? 'Photos shared with posts will appear here. Add a photo when publishing a post in the Social Feed.'
                  : `${profileName} hasn’t shared any photos yet.`}
              </p>
            ) : (
              <>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {visibleMedia.map((media) => (
                    <li
                      key={media.id}
                      className="overflow-hidden rounded-lg border border-tafera-border bg-tafera-card shadow-soft"
                    >
                      <button
                        type="button"
                        onClick={() => setLightboxMedia(media)}
                        className="group block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-tafera-primary"
                        aria-label={`View media: ${media.altText || media.post?.content || 'Shared travel photo'}`}
                      >
                        <div className="aspect-square w-full overflow-hidden bg-tafera-bg">
                          <img
                            src={media.imageUrl}
                            alt={media.altText || 'Shared travel photo'}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        </div>
                        {media.post?.content && (
                          <p className="line-clamp-2 p-2.5 text-xs text-tafera-text-muted">
                            {media.post.content}
                          </p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                {renderLoadMore('Media', 'Load more media')}
              </>
            )}
          </section>
        )}

        {showComments && (
          <section aria-label="Comments" className="rounded-xl border border-tafera-border bg-tafera-surface p-4 sm:p-6">
            {renderSectionHeader('Comments', 'Comments', 'Recent replies and conversations on Tafera.')}
            {sections.Comments.loading ? (
              <SectionSkeleton variant="Comments" />
            ) : sections.Comments.error ? (
              renderSectionError('Comments')
            ) : visibleComments.length === 0 ? (
              <p className="rounded-lg border border-dashed border-tafera-border bg-tafera-card px-4 py-8 text-center text-sm text-tafera-text-muted">
                {isOwnProfile
                  ? 'You haven’t commented on any posts yet.'
                  : `${profileName} hasn’t commented on any posts yet.`}
              </p>
            ) : (
              <>
                <ul className="space-y-3">
                  {visibleComments.map((comment) => {
                    const isEditing = editingCommentId === comment.id
                    const commentError = actionErrors[`comment-${comment.id}`]
                    const parentPostId = comment.post?.id || comment.postId

                    return (
                      <li
                        key={comment.id}
                        className="rounded-lg border border-tafera-border bg-tafera-card p-4 shadow-soft"
                      >
                        {isEditing ? (
                          <form
                            onSubmit={(event) => handleSaveCommentEdit(event, comment)}
                            className="space-y-2.5"
                          >
                            <label className="sr-only" htmlFor={`edit-profile-comment-${comment.id}`}>
                              Edit comment
                            </label>
                            <textarea
                              id={`edit-profile-comment-${comment.id}`}
                              className={inputClass}
                              rows="2"
                              maxLength="1000"
                              required
                              value={editingCommentContent}
                              onChange={(event) => setEditingCommentContent(event.target.value)}
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="submit"
                                size="sm"
                                disabled={
                                  busyActionKey === `edit-comment-${comment.id}` ||
                                  !editingCommentContent.trim()
                                }
                              >
                                {busyActionKey === `edit-comment-${comment.id}` ? 'Saving…' : 'Save'}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingCommentId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-tafera-text">
                            {comment.content}
                          </p>
                        )}

                        {commentError && (
                          <p
                            role="alert"
                            className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-tafera-text"
                          >
                            {commentError}
                          </p>
                        )}

                        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-tafera-text-muted">
                          <p className="min-w-0 truncate">
                            On:{' '}
                            {parentPostId ? (
                              <Link
                                to={`/social?post=${encodeURIComponent(parentPostId)}`}
                                className="font-medium text-tafera-primary hover:underline"
                              >
                                “{comment.post?.content || 'View post'}”
                              </Link>
                            ) : (
                              <span>“{comment.post?.content || 'Post'}”</span>
                            )}
                            {comment.createdAt ? ` · ${formatShortDate(comment.createdAt)}` : ''}
                          </p>

                          {isOwnProfile && canInteract && parentPostId && !isEditing && (
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingCommentId(comment.id)
                                  setEditingCommentContent(comment.content || '')
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={busyActionKey === `delete-comment-${comment.id}`}
                                onClick={() => handleDeleteComment(comment)}
                              >
                                Delete
                              </Button>
                            </div>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
                {renderLoadMore('Comments', 'Load more comments')}
              </>
            )}
          </section>
        )}
      </div>

      {lightboxMedia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightboxMedia(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Media preview"
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-tafera-border bg-tafera-card shadow-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-tafera-border px-4 py-3">
              <p className="truncate text-sm font-semibold text-tafera-text">
                {lightboxMedia.altText || 'Shared travel photo'}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setLightboxMedia(null)}
              >
                Close
              </Button>
            </div>
            <div className="flex items-center justify-center bg-tafera-bg p-3">
              <img
                src={lightboxMedia.imageUrl}
                alt={lightboxMedia.altText || 'Shared travel photo'}
                className="max-h-[65vh] w-auto max-w-full rounded-md object-contain"
              />
            </div>
            {lightboxMedia.post && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-tafera-border px-4 py-3 text-sm">
                <p className="min-w-0 flex-1 line-clamp-2 text-tafera-text-muted">
                  {lightboxMedia.post.content}
                </p>
                {lightboxMedia.post.id && (
                  <Link
                    to={`/social?post=${encodeURIComponent(lightboxMedia.post.id)}`}
                    onClick={() => setLightboxMedia(null)}
                    className="shrink-0 font-semibold text-tafera-primary hover:underline"
                  >
                    Open post →
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
