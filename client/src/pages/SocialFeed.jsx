import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/common/Button'
import { useAuth } from '../contexts/AuthContext'
import {
  createPost,
  createPostComment,
  deletePost,
  deletePostComment,
  fetchPersonalizedPosts,
  fetchPublicPosts,
  fetchPost,
  fetchPostComments,
  updatePost,
  updatePostComment,
  uploadPostImage,
} from '../services/posts'
import { getErrorMessage } from '../services/errors'
import { fetchFeaturedDestinations } from '../services/destinations'
import { fetchPublicTrips, fetchMyTrips } from '../services/trips'

const inputClass =
  'w-full rounded-lg border border-tafera-border bg-white px-4 py-2 text-tafera-text focus:border-tafera-primary focus:outline-none focus:ring-2 focus:ring-tafera-primary'

const formatDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
}

function Author({ author }) {
  return (
    <Link
      to={`/users/${author.id}`}
      className="font-semibold text-tafera-text hover:text-tafera-primary hover:underline"
    >
      {author.fullName}
    </Link>
  )
}

function PostCard({ post, user, canWrite, onPostUpdated, onPostDeleted }) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState(post)
  const [comments, setComments] = useState([])
  const [commentPagination, setCommentPagination] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [commentLoading, setCommentLoading] = useState(false)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(post.content)
  const [commentText, setCommentText] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editingCommentText, setEditingCommentText] = useState('')
  const isOwner = user?.id === post.author?.id

  const loadComments = useCallback(async (page = 1) => {
    setCommentLoading(true)
    setError(null)
    try {
      const result = await fetchPostComments(post.id, { page })
      setComments((current) =>
        page === 1 ? result.comments : [...current, ...result.comments],
      )
      setCommentPagination(result.pagination)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setCommentLoading(false)
    }
  }, [post.id])

  const toggleDetails = async () => {
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    setDetailLoading(true)
    setError(null)
    try {
      const latest = await fetchPost(post.id)
      setDetail(latest)
      setEditText(latest.content)
      const result = await fetchPostComments(post.id)
      setComments(result.comments)
      setCommentPagination(result.pagination)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setDetailLoading(false)
    }
  }

  const savePost = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const updated = await updatePost(post.id, { content: editText.trim() })
      setDetail(updated)
      onPostUpdated(updated)
      setEditing(false)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const removePost = async () => {
    if (!window.confirm('Delete this post? This also deletes its comments.')) return
    setSaving(true)
    setError(null)
    try {
      await deletePost(post.id)
      onPostDeleted(post.id)
    } catch (err) {
      setError(getErrorMessage(err))
      setSaving(false)
    }
  }

  const submitComment = async (event) => {
    event.preventDefault()
    if (!commentText.trim()) return
    setSaving(true)
    setError(null)
    try {
      const comment = await createPostComment(post.id, commentText.trim())
      setComments((current) => [...current, comment])
      setCommentText('')
      setCommentPagination((current) => current && {
        ...current,
        total: current.total + 1,
      })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const saveComment = async (event, commentId) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const updated = await updatePostComment(
        post.id,
        commentId,
        editingCommentText.trim(),
      )
      setComments((current) => current.map((comment) =>
        comment.id === commentId ? updated : comment,
      ))
      setEditingCommentId(null)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const removeComment = async (commentId) => {
    if (!window.confirm('Delete this comment?')) return
    setSaving(true)
    setError(null)
    try {
      await deletePostComment(post.id, commentId)
      setComments((current) => current.filter((comment) => comment.id !== commentId))
      setCommentPagination((current) => current && ({
        ...current,
        total: Math.max(0, current.total - 1),
      }))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="rounded-lg border border-tafera-border bg-tafera-surface p-5 shadow-soft sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {post.author?.profileImage ? (
            <img
              src={post.author.profileImage}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tafera-bg font-semibold text-tafera-primary">
              {post.author?.fullName?.slice(0, 1) || '?'}
            </span>
          )}
          <div className="min-w-0">
            <Author author={post.author} />
            <p className="text-xs text-tafera-text-muted">
              <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
              {post.updatedAt !== post.createdAt && ' · edited'}
            </p>
          </div>
        </div>
        {isOwner && canWrite && (
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" size="sm" disabled={saving} onClick={() => {
              setEditText(detail.content)
              setEditing((current) => !current)
            }}>
              {editing ? 'Cancel' : 'Edit'}
            </Button>
            <Button variant="ghost" size="sm" disabled={saving} onClick={removePost}>
              Delete
            </Button>
          </div>
        )}
      </header>

      {editing ? (
        <form className="mt-4 space-y-3" onSubmit={savePost}>
          <label className="sr-only" htmlFor={`edit-post-${post.id}`}>Edit post</label>
          <textarea id={`edit-post-${post.id}`} className={inputClass} rows="4" maxLength="5000" required value={editText} onChange={(event) => setEditText(event.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" disabled={saving || !editText.trim()}>{saving ? 'Saving...' : 'Save changes'}</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <p className="mt-4 whitespace-pre-wrap break-words text-tafera-text">{detail.content}</p>
      )}

      {!editing && detail.images?.length > 0 && <div className="mt-4 grid grid-cols-2 gap-2">{detail.images.map((image) => <img key={image.id} src={image.imageUrl} alt={image.altText || 'Travel photo shared with this post'} className="max-h-96 w-full rounded-md object-cover" loading="lazy" />)}</div>}

      {detail.destination && (
        <Link to={`/destinations/${detail.destination.slug}`} className="mt-3 inline-block text-sm font-medium text-tafera-primary hover:underline">
          {detail.destination.name}
        </Link>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-tafera-border pt-3 text-sm">
        <span className="text-tafera-text-muted">
          {expanded ? `${commentPagination?.total ?? comments.length} comments` : 'Comments'}
        </span>
        <Button variant="ghost" size="sm" onClick={toggleDetails}>
          {expanded ? 'Hide details' : 'View post and comments'}
        </Button>
      </div>

      {expanded && (
        <section className="mt-4 border-t border-tafera-border pt-4" aria-label={`Details and comments for ${post.author?.fullName}'s post`}>
          {detailLoading && <p className="text-sm text-tafera-text-muted">Loading post and comments...</p>}
          {error && <div role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {!detailLoading && (
            <>
              <h3 className="mb-3 font-semibold text-tafera-text">Comments ({commentPagination?.total ?? comments.length})</h3>
              {comments.length === 0 ? (
                <p className="mb-4 text-sm text-tafera-text-muted">No comments yet.</p>
              ) : (
                <ul className="space-y-3">
                  {comments.map((comment) => (
                    <li key={comment.id} className="rounded-md bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Author author={comment.author} />
                          <time className="ml-2 text-xs text-tafera-text-muted" dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time>
                        </div>
                        {user?.id === comment.author?.id && canWrite && !editingCommentId && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => { setEditingCommentId(comment.id); setEditingCommentText(comment.content) }}>Edit</Button>
                            <Button size="sm" variant="ghost" disabled={saving} onClick={() => removeComment(comment.id)}>Delete</Button>
                          </div>
                        )}
                      </div>
                      {editingCommentId === comment.id ? (
                        <form className="mt-2 space-y-2" onSubmit={(event) => saveComment(event, comment.id)}>
                          <label className="sr-only" htmlFor={`edit-comment-${comment.id}`}>Edit comment</label>
                          <textarea id={`edit-comment-${comment.id}`} className={inputClass} rows="2" maxLength="1000" required value={editingCommentText} onChange={(event) => setEditingCommentText(event.target.value)} />
                          <div className="flex gap-2">
                            <Button type="submit" size="sm" disabled={saving || !editingCommentText.trim()}>Save</Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                          </div>
                        </form>
                      ) : (
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-tafera-text">{comment.content}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {commentPagination?.hasNextPage && (
                <Button className="mt-3" size="sm" variant="outline" disabled={commentLoading} onClick={() => loadComments(commentPagination.page + 1)}>
                  {commentLoading ? 'Loading...' : 'Load more comments'}
                </Button>
              )}
              {canWrite ? (
                <form className="mt-4 space-y-2" onSubmit={submitComment}>
                  <label className="sr-only" htmlFor={`new-comment-${post.id}`}>Write a comment</label>
                  <textarea id={`new-comment-${post.id}`} className={inputClass} rows="2" maxLength="1000" placeholder="Write a comment..." value={commentText} onChange={(event) => setCommentText(event.target.value)} required />
                  <Button type="submit" size="sm" disabled={saving || !commentText.trim()}>{saving ? 'Posting...' : 'Comment'}</Button>
                </form>
              ) : (
                <p className="mt-4 text-sm text-tafera-text-muted">Verify your email to join the conversation.</p>
              )}
            </>
          )}
        </section>
      )}
    </article>
  )
}

export default function SocialFeed() {
  const { user, isAuthenticated, isEmailVerified, isLoading: authLoading } = useAuth()
  const [posts, setPosts] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [content, setContent] = useState('')
  const [postPhoto, setPostPhoto] = useState(null)
  const postPhotoPreview = useMemo(() => postPhoto ? URL.createObjectURL(postPhoto) : null, [postPhoto])
  const [posting, setPosting] = useState(false)
  const [discovery, setDiscovery] = useState({ destinations: [], groups: [], stories: [], trips: [] })
  const canWrite = isAuthenticated && isEmailVerified

  useEffect(() => () => {
    if (postPhotoPreview) URL.revokeObjectURL(postPhotoPreview)
  }, [postPhotoPreview])

  useEffect(() => {
    if (!isAuthenticated) {
      setDiscovery({ destinations: [], groups: [], stories: [], trips: [] })
      return
    }
    let active = true
    Promise.allSettled([
      fetchFeaturedDestinations(3),
      fetchPublicTrips({ page: 1, limit: 6 }),
      fetchPublicPosts(8),
      fetchMyTrips({ page: 1, limit: 3 }),
    ]).then(([destinationsResult, groupsResult, storiesResult, tripsResult]) => {
      if (!active) return
      setDiscovery({
        destinations: destinationsResult.status === 'fulfilled' ? destinationsResult.value : [],
        groups: groupsResult.status === 'fulfilled'
          ? (groupsResult.value.trips || []).filter((trip) => trip.tripType === 'group').slice(0, 3)
          : [],
        stories: storiesResult.status === 'fulfilled' ? storiesResult.value : [],
        trips: tripsResult.status === 'fulfilled'
          ? (tripsResult.value.trips || []).filter((trip) => trip.tripType === 'personal').slice(0, 3)
          : [],
      })
    })
    return () => { active = false }
  }, [isAuthenticated])

  const loadFeed = useCallback(async (requestedPage = 1, append = false) => {
    if (!isAuthenticated) {
      setPosts([])
      setPagination(null)
      setLoading(false)
      return
    }
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(null)
    try {
      const result = await fetchPersonalizedPosts(user.id, { page: requestedPage })
      setPosts((current) => {
        if (!append) return result.posts
        const byId = new Map(current.map((post) => [post.id, post]))
        for (const post of result.posts) byId.set(post.id, post)
        return [...byId.values()].sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
      })
      setPagination(result.pagination)
      setPage(requestedPage)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [isAuthenticated, user?.id])

  useEffect(() => {
    if (!authLoading) loadFeed()
  }, [authLoading, loadFeed])

  const submitPost = async (event) => {
    event.preventDefault()
    if (!content.trim()) return
    setPosting(true)
    setError(null)
    try {
      let post = await createPost({ content: content.trim() })
      setPosts((current) => [post, ...current.filter((item) => item.id !== post.id)])
      if (postPhoto) {
        try {
          await uploadPostImage(post.id, postPhoto)
          post = await fetchPost(post.id)
        } catch (photoError) {
          setError(`Your post was published, but its photo could not be uploaded: ${getErrorMessage(photoError)}`)
        }
      }
      // The following feed excludes authors the user does not follow (including
      // potentially the current user); show the successful post immediately.
      setPosts((current) => [post, ...current.filter((item) => item.id !== post.id)])
      setContent('')
      setPostPhoto(null)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setPosting(false)
    }
  }

  const updateInFeed = (updated) => {
    setPosts((current) => current.map((post) => post.id === updated.id ? updated : post))
  }

  if (authLoading) {
    return <div className="app-container py-10 text-center text-tafera-text-muted sm:py-16">Checking your session...</div>
  }

  return (
    <div className={`app-container grid grid-cols-1 gap-5 py-2 sm:py-4 lg:gap-6 ${isAuthenticated ? 'lg:grid-cols-[minmax(190px,0.8fr)_minmax(0,2fr)_minmax(220px,0.95fr)]' : ''}`}>
      {isAuthenticated && <aside className="order-2 space-y-4 lg:order-none lg:col-start-1 lg:row-start-1" aria-label="Your travel shortcuts">
        <section className="rounded-lg border border-tafera-border bg-tafera-surface p-4 sm:p-5">
          <div className="flex items-center gap-3">
            {user?.profileImage ? <img className="h-12 w-12 rounded-full object-cover" src={user.profileImage} alt="" /> : <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-tafera-bg text-lg font-semibold text-tafera-primary">{user?.fullName?.slice(0, 1) || 'T'}</span>}
            <div className="min-w-0"><h2 className="truncate font-heading font-bold text-tafera-text">{user?.fullName || 'Your profile'}</h2><Link to="/profile" className="text-sm font-medium text-tafera-primary hover:underline">View profile</Link></div>
          </div>
          {user?.bio && <p className="mt-3 line-clamp-3 text-sm text-tafera-text-muted">{user.bio}</p>}
          {!isEmailVerified && <p className="mt-3 text-xs text-tafera-text-muted"><Link to="/verify-email" className="text-tafera-primary hover:underline">Verify your email</Link> to post and join conversations.</p>}
        </section>
        <section className="rounded-lg border border-tafera-border bg-tafera-surface p-4 sm:p-5">
          <h2 className="mb-3 font-heading font-bold text-tafera-text">Your travel</h2>
          <nav aria-label="Travel shortcuts" className="space-y-1">
            <Link to="/trips" className="block rounded-md px-3 py-2 text-sm font-medium text-tafera-text hover:bg-white hover:text-tafera-primary">My trips{discovery.trips.length > 0 ? ` · ${discovery.trips.length}` : ''}</Link>
            <Link to="/scrapbooks" className="block rounded-md px-3 py-2 text-sm font-medium text-tafera-text hover:bg-white hover:text-tafera-primary">Scrapbooks</Link>
            <Link to="/destinations" className="block rounded-md px-3 py-2 text-sm font-medium text-tafera-text hover:bg-white hover:text-tafera-primary">Explore destinations</Link>
            <Link to="/group-travel" className="block rounded-md px-3 py-2 text-sm font-medium text-tafera-text hover:bg-white hover:text-tafera-primary">Group trips</Link>
          </nav>
        </section>
      </aside>}
      <div className="order-1 min-w-0 lg:order-none lg:col-start-2 lg:row-start-1">
      <header className="mb-5 sm:mb-7">
        <h1 className="font-heading text-xl font-bold text-tafera-text sm:text-2xl">Social Feed</h1>
        <p className="mt-1 text-sm text-tafera-text-muted sm:mt-2 sm:text-base">Share your journeys, meet travellers, and follow their stories.</p>
      </header>

      {!isAuthenticated && (
        <div className="mb-6 rounded-lg border border-tafera-border bg-tafera-surface p-5">
          <p className="text-tafera-text">Sign in to see posts from people you follow.</p>
          <Link to="/login" className="mt-3 inline-block"><Button>Sign in</Button></Link>
        </div>
      )}

      {canWrite ? (
        <form onSubmit={submitPost} className="mb-5 rounded-lg border border-tafera-border bg-tafera-surface p-4 shadow-soft sm:mb-6 sm:p-6">
          <label htmlFor="new-post" className="mb-2 block font-semibold text-tafera-text">Share a travel update</label>
          <textarea id="new-post" className={inputClass} rows="3" maxLength="5000" placeholder="What are you exploring?" value={content} onChange={(event) => setContent(event.target.value)} required />
          <label className="mt-3 block text-sm text-tafera-text-muted">Attach one travel photo (JPEG, PNG or WebP, up to 5 MB)<input className={`${inputClass} mt-1`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
              setError('Choose a JPEG, PNG or WebP image no larger than 5 MB.')
              event.target.value = ''
              return
            }
            setPostPhoto(file)
            setError(null)
          }} /></label>
          {postPhotoPreview && <div className="mt-3 flex items-center gap-3"><img src={postPhotoPreview} alt="Selected post photo preview" className="h-20 w-20 rounded-md object-cover" /><button type="button" className="text-sm text-tafera-primary underline" onClick={() => setPostPhoto(null)}>Remove photo</button></div>}
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-tafera-text-muted">Up to 5,000 characters</span>
            <Button type="submit" disabled={posting || !content.trim()}>{posting ? 'Publishing...' : 'Publish post'}</Button>
          </div>
        </form>
      ) : isAuthenticated ? (
        <div className="mb-6 rounded-lg border border-tafera-border bg-tafera-surface p-5 text-sm text-tafera-text-muted">
          Verify your email to create posts and comments.{' '}
          <Link to="/verify-email" className="font-medium text-tafera-primary hover:underline">Verify email</Link>
        </div>
      ) : null}

      {error && (
        <div role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p>{error}</p>
          {isAuthenticated && !loading && posts.length === 0 && (
            <Button className="mt-3" size="sm" variant="outline" onClick={() => loadFeed()}>
              Try again
            </Button>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-3 sm:space-y-4" aria-label="Loading feed">
          {[1, 2, 3].map((item) => <div key={item} className="h-36 animate-pulse rounded-lg border border-tafera-border bg-tafera-surface" />)}
        </div>
      ) : posts.length === 0 && !error ? (
        isAuthenticated && <div className="rounded-lg border border-tafera-border bg-tafera-surface px-4 py-8 text-center sm:px-6 sm:py-12">
          <h2 className="font-heading text-lg font-bold text-tafera-text">Your feed is quiet</h2>
          <p className="mt-2 text-sm text-tafera-text-muted">Follow travellers to see their travel updates here.</p>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              user={user}
              canWrite={canWrite}
              onPostUpdated={updateInFeed}
              onPostDeleted={(id) => setPosts((current) => current.filter((item) => item.id !== id))}
            />
          ))}
          {pagination?.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="outline" disabled={loadingMore} onClick={() => loadFeed(page + 1, true)}>
                {loadingMore ? 'Loading...' : 'Load more posts'}
              </Button>
            </div>
          )}
        </div>
      )}
      </div>
      {isAuthenticated && <aside className="order-3 space-y-4 lg:order-none lg:col-start-3 lg:row-start-1" aria-label="Discover travel community">
        <section className="rounded-lg border border-tafera-border bg-tafera-surface p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-heading font-bold text-tafera-text">Travellers to discover</h2><Link to="/social" className="text-xs font-medium text-tafera-primary hover:underline">Stories</Link></div>
          {(() => {
            const seen = new Set([user?.id])
            const people = discovery.stories.filter((post) => {
              const author = post.author
              if (!author?.id || seen.has(author.id)) return false
              seen.add(author.id)
              return true
            }).slice(0, 4)
            return people.length ? <ul className="space-y-3">{people.map((post) => <li key={post.author.id} className="flex min-w-0 items-center gap-3"><Link to={`/users/${post.author.id}`} className="flex min-w-0 items-center gap-2 hover:underline"><span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tafera-bg font-semibold text-tafera-primary">{post.author.profileImage ? <img className="h-full w-full object-cover" src={post.author.profileImage} alt="" /> : post.author.fullName?.slice(0, 1) || '?'}</span><span className="truncate text-sm font-medium text-tafera-text">{post.author.fullName}</span></Link></li>)}</ul> : <p className="text-sm text-tafera-text-muted">Traveller profiles will appear here as public community stories become available.</p>
          })()}
          <p className="mt-3 text-xs text-tafera-text-muted">Open a profile to learn more and follow their journeys.</p>
        </section>
        <section className="rounded-lg border border-tafera-border bg-tafera-surface p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-heading font-bold text-tafera-text">Popular destinations</h2><Link to="/destinations" className="text-xs font-medium text-tafera-primary hover:underline">Explore</Link></div>
          {discovery.destinations.length ? <ul className="space-y-3">{discovery.destinations.map((destination) => <li key={destination.id}><Link to={`/destinations/${destination.slug}`} className="group flex items-center gap-3">{destination.coverImage?.imageUrl ? <img className="h-12 w-14 shrink-0 rounded-md object-cover" src={destination.coverImage.imageUrl} alt={destination.coverImage.altText || ''} loading="lazy" /> : <span aria-hidden="true" className="h-12 w-14 shrink-0 rounded-md bg-white" />}<span className="min-w-0"><span className="block truncate text-sm font-semibold text-tafera-text group-hover:text-tafera-primary">{destination.name}</span><span className="block truncate text-xs text-tafera-text-muted">{destination.location || destination.country}</span></span></Link></li>)}</ul> : <p className="text-sm text-tafera-text-muted">No featured destinations are available right now.</p>}
        </section>
        <section className="rounded-lg border border-tafera-border bg-tafera-surface p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-heading font-bold text-tafera-text">Group trips</h2><Link to="/group-travel" className="text-xs font-medium text-tafera-primary hover:underline">See all</Link></div>
          {discovery.groups.length ? <ul className="space-y-3">{discovery.groups.map((trip) => <li key={trip.id}><Link to={`/trips/${trip.id}`} className="block rounded-md bg-white p-3 hover:ring-1 hover:ring-tafera-primary"><span className="block truncate text-sm font-semibold text-tafera-text">{trip.title}</span><span className="mt-1 block text-xs text-tafera-text-muted">{trip.startDate} – {trip.endDate}</span></Link></li>)}</ul> : <p className="text-sm text-tafera-text-muted">No published group trips to discover yet.</p>}
        </section>
      </aside>}
    </div>
  )
}
