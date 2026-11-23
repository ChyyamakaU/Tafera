import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext'
import SocialFeed from './SocialFeed'
import {
  createPost,
  createPostComment,
  deletePost,
  deletePostComment,
  deletePostImage,
  fetchPersonalizedPosts,
  fetchPublicPosts,
  fetchPost,
  fetchPostComments,
  fetchSavedPosts,
  likePost,
  savePost,
  unlikePost,
  unsavePost,
  updatePost,
  updatePostComment,
  updatePostImage,
  uploadPostImage,
} from '../services/posts'

vi.mock('../services/posts', () => ({
  createPost: vi.fn(),
  createPostComment: vi.fn(),
  deletePost: vi.fn(),
  deletePostComment: vi.fn(),
  deletePostImage: vi.fn(),
  fetchPersonalizedPosts: vi.fn(),
  fetchPublicPosts: vi.fn(),
  fetchPost: vi.fn(),
  fetchPostComments: vi.fn(),
  fetchSavedPosts: vi.fn(),
  likePost: vi.fn(),
  savePost: vi.fn(),
  unlikePost: vi.fn(),
  unsavePost: vi.fn(),
  updatePost: vi.fn(),
  updatePostComment: vi.fn(),
  updatePostImage: vi.fn(),
  uploadPostImage: vi.fn(),
}))

vi.mock('../services/destinations', () => ({ fetchFeaturedDestinations: vi.fn() }))
vi.mock('../services/trips', () => ({ fetchPublicTrips: vi.fn() }))
vi.mock('../services/notifications', () => ({ fetchUnreadCount: vi.fn() }))
import { fetchFeaturedDestinations } from '../services/destinations'
import { fetchPublicTrips } from '../services/trips'
import { fetchUnreadCount } from '../services/notifications'

const user = { id: 'current-user', fullName: 'Current User', role: 'user' }
const post = {
  id: 'post-1',
  content: 'A trip to Kyoto',
  author: { id: 'author-1', fullName: 'Travel Friend', profileImage: null },
  likeCount: 2,
  isLiked: false,
  isSaved: false,
  createdAt: '2026-11-20T12:00:00.000Z',
  updatedAt: '2026-11-20T12:00:00.000Z',
  destination: null,
}
const comment = {
  id: 'comment-1',
  content: 'Wonderful place!',
  author: { id: 'current-user', fullName: 'Current User' },
  createdAt: '2026-11-20T13:00:00.000Z',
  updatedAt: '2026-11-20T13:00:00.000Z',
}
const pagination = { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false }

const renderFeed = (auth = {}) => render(
  <MemoryRouter>
    <AuthContext.Provider value={{
      user: null,
      isAuthenticated: false,
      isEmailVerified: false,
      isLoading: false,
      ...auth,
    }}>
      <SocialFeed />
    </AuthContext.Provider>
  </MemoryRouter>,
)

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.resetAllMocks()
  fetchPersonalizedPosts.mockResolvedValue({ posts: [post], pagination })
  fetchSavedPosts.mockResolvedValue({ posts: [], pagination: { ...pagination, total: 0 } })
  fetchPost.mockResolvedValue(post)
  fetchPostComments.mockResolvedValue({ comments: [comment], pagination })
  fetchPublicPosts.mockResolvedValue([post])
  fetchFeaturedDestinations.mockResolvedValue([])
  fetchPublicTrips.mockResolvedValue({ trips: [] })
  fetchUnreadCount.mockResolvedValue(0)
  likePost.mockResolvedValue({ postId: post.id, liked: true, likeCount: 3 })
  unlikePost.mockResolvedValue({ postId: post.id, liked: false, likeCount: 2 })
  savePost.mockResolvedValue({ postId: post.id, saved: true })
  unsavePost.mockResolvedValue({ postId: post.id, saved: false })
  window.confirm = vi.fn(() => true)
})

describe('SocialFeed', () => {
  it('keeps the shared outer gutter and responsive three-column authenticated layout', () => {
    const { container } = renderFeed({ user, isAuthenticated: true, isEmailVerified: true })
    const feed = container.querySelector('.app-container.grid')
    expect(feed).toBeInTheDocument()
    expect(feed.className).toContain('lg:grid-cols-[minmax(190px,0.8fr)_minmax(0,2fr)_minmax(220px,0.95fr)]')
  })

  it('loads the authenticated following feed and shows author and timestamp', async () => {
    renderFeed({ user, isAuthenticated: true, isEmailVerified: true })
    expect(await screen.findByText('A trip to Kyoto')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Travel Friend' })[0]).toHaveAttribute('href', '/users/author-1')
    expect(screen.getByText(/Nov 20, 2026/)).toBeInTheDocument()
    expect(fetchPersonalizedPosts).toHaveBeenCalledWith(user.id, { page: 1 })
  })

  it('shows real featured destinations and the left-column travel navigation', async () => {
    fetchFeaturedDestinations.mockResolvedValueOnce([{ id: 'destination-1', name: 'Lagos', slug: 'lagos', country: 'Nigeria' }])
    fetchPublicTrips.mockResolvedValueOnce({ trips: [{ id: 'group-1', tripType: 'group', title: 'Explore Lagos', startDate: '2027-04-01', endDate: '2027-04-05' }] })
    renderFeed({ user, isAuthenticated: true, isEmailVerified: true })
    await waitFor(() => expect(document.querySelector('a[href="/destinations/lagos"]')).toBeInTheDocument())
    expect(document.querySelector('a[href="/destinations/lagos"]')).toHaveTextContent('Lagos')
    expect(screen.getByRole('link', { name: /Explore Lagos/ })).toHaveAttribute('href', '/trips/group-1')

    const travels = screen.getByRole('button', { name: 'My Travels' })
    expect(travels).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(travels)

    expect(screen.getByRole('link', { name: 'My Trips' })).toHaveAttribute('href', '/trips')
    expect(screen.getByRole('link', { name: 'Scrapbooks' })).toHaveAttribute('href', '/scrapbooks')
    expect(screen.getByRole('link', { name: 'My Destinations' })).toHaveAttribute('href', '/my-destinations')
    expect(screen.getByRole('link', { name: 'My Group Trips' })).toHaveAttribute('href', '/group-travel')
  })

  it('keeps Notifications visible below My Travels with its unread count', async () => {
    fetchUnreadCount.mockResolvedValue(3)
    renderFeed({ user, isAuthenticated: true, isEmailVerified: true })

    expect(await screen.findByLabelText('3 unread notifications')).toBeInTheDocument()
    const navigation = screen.getByRole('navigation', { name: 'Travel shortcuts' })
    expect(navigation.textContent.indexOf('My Travels')).toBeLessThan(
      navigation.textContent.indexOf('Notifications'),
    )
    expect(screen.getByRole('link', { name: /Notifications/ })).toHaveAttribute('href', '/notifications')
    expect(screen.queryByRole('link', { name: 'My Destinations' })).not.toBeInTheDocument()
  })

  it('shows an empty state and an error state', async () => {
    fetchPersonalizedPosts.mockResolvedValueOnce({ posts: [], pagination: { ...pagination, total: 0 } })
    renderFeed({ user, isAuthenticated: true })
    expect(await screen.findByText('Your feed is quiet')).toBeInTheDocument()

    fetchPersonalizedPosts.mockRejectedValueOnce(Object.assign(new Error('feed unavailable'), { code: 'SERVICE_UNAVAILABLE', status: 503 }))
    renderFeed({ user, isAuthenticated: true })
    expect(await screen.findByRole('alert')).toHaveTextContent(/server is temporarily unavailable/i)
  })

  it('creates a post and immediately adds it to the feed', async () => {
    const created = { ...post, id: 'post-new', content: 'Just landed in Tokyo' }
    createPost.mockResolvedValue(created)
    renderFeed({ user, isAuthenticated: true, isEmailVerified: true })
    fireEvent.change(screen.getByLabelText('Share a travel update'), { target: { value: created.content } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish post' }))
    expect(await screen.findByText(created.content)).toBeInTheDocument()
    expect(createPost).toHaveBeenCalledWith({ content: created.content })
  })

  it('loads post details and comments, then creates a comment', async () => {
    const createdComment = { ...comment, id: 'comment-new', content: 'Adding a tip' }
    createPostComment.mockResolvedValue(createdComment)
    renderFeed({ user, isAuthenticated: true, isEmailVerified: true })
    fireEvent.click(await screen.findByRole('button', { name: 'View post and comments' }))
    expect(await screen.findByText('Wonderful place!')).toBeInTheDocument()
    expect(fetchPost).toHaveBeenCalledWith(post.id)
    expect(fetchPostComments).toHaveBeenCalledWith(post.id)
    fireEvent.change(screen.getByLabelText('Write a comment'), { target: { value: createdComment.content } })
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }))
    expect(await screen.findByText(createdComment.content)).toBeInTheDocument()
  })

  it('allows an owner to edit/delete their post and comment', async () => {
    const ownPost = { ...post, author: user }
    fetchPersonalizedPosts.mockResolvedValue({ posts: [ownPost], pagination })
    updatePost.mockResolvedValue({ ...ownPost, content: 'Edited post' })
    updatePostComment.mockResolvedValue({ ...comment, content: 'Edited comment' })
    renderFeed({ user, isAuthenticated: true, isEmailVerified: true })
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Edit post'), { target: { value: 'Edited post' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(updatePost).toHaveBeenCalledWith(ownPost.id, { content: 'Edited post' }))
    expect(await screen.findByText('Edited post')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'View post and comments' }))
    expect(await screen.findByText('Wonderful place!')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit', exact: true })[1])
    fireEvent.change(screen.getByLabelText('Edit comment'), { target: { value: 'Edited comment' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updatePostComment).toHaveBeenCalledWith(post.id, comment.id, 'Edited comment'))
    expect(await screen.findByText('Edited comment')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete', exact: true })[1])
    await waitFor(() => expect(deletePostComment).toHaveBeenCalledWith(post.id, comment.id))
    fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }))
    await waitFor(() => expect(deletePost).toHaveBeenCalledWith(ownPost.id))
  })

  it('does not offer owner controls to other users', async () => {
    renderFeed({ user, isAuthenticated: true, isEmailVerified: true })
    await screen.findByText('A trip to Kyoto')
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('optimistically toggles likes and reconciles with server counts', async () => {
    let resolveLike
    likePost.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveLike = () => resolve({ postId: post.id, liked: true, likeCount: 4 })
      }),
    )

    renderFeed({ user, isAuthenticated: true, isEmailVerified: true })
    await screen.findByText('A trip to Kyoto')

    const likeButton = screen.getByRole('button', { name: 'Like post' })
    expect(likeButton).toHaveTextContent('2')
    expect(likeButton).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(likeButton)

    // Optimistic update appears immediately before API resolves
    const optimisticButton = screen.getByRole('button', { name: 'Unlike post' })
    expect(optimisticButton).toHaveTextContent('3')
    expect(optimisticButton).toHaveAttribute('aria-pressed', 'true')
    expect(likePost).toHaveBeenCalledWith(post.id)

    resolveLike()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Unlike post' })).toHaveTextContent('4'))

    fireEvent.click(screen.getByRole('button', { name: 'Unlike post' }))
    await waitFor(() => expect(unlikePost).toHaveBeenCalledWith(post.id))
    expect(await screen.findByRole('button', { name: 'Like post' })).toHaveTextContent('2')
  })

  it('rolls back optimistic like and save updates when mutations fail', async () => {
    likePost.mockRejectedValueOnce(Object.assign(new Error('like failed'), { status: 500 }))
    savePost.mockRejectedValueOnce(Object.assign(new Error('save failed'), { status: 500 }))

    renderFeed({ user, isAuthenticated: true, isEmailVerified: true })
    await screen.findByText('A trip to Kyoto')

    fireEvent.click(screen.getByRole('button', { name: 'Like post' }))
    expect(screen.getByRole('button', { name: 'Unlike post' })).toHaveTextContent('3')

    await waitFor(() => expect(screen.getByRole('button', { name: 'Like post' })).toHaveTextContent('2'))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save post' }))
    expect(screen.getByRole('button', { name: 'Remove saved post' })).toHaveTextContent('Saved')

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save post' })).toHaveTextContent('Save'))
  })

  it('switches to Saved posts, supports pagination, and rolls back failed unsave removals', async () => {
    const savedOne = { ...post, id: 'saved-1', content: 'Bookmarked Sahara dunes', isSaved: true, likeCount: 5, isLiked: true }
    const savedTwo = { ...post, id: 'saved-2', content: 'Bookmarked Jos plateau', isSaved: true, likeCount: 1, isLiked: false }
    fetchSavedPosts
      .mockResolvedValueOnce({ posts: [savedOne], pagination: { page: 1, limit: 20, total: 2, totalPages: 2, hasNextPage: true } })
      .mockResolvedValueOnce({ posts: [savedTwo], pagination: { page: 2, limit: 20, total: 2, totalPages: 2, hasNextPage: false } })

    renderFeed({ user, isAuthenticated: true, isEmailVerified: true })
    await screen.findByText('A trip to Kyoto')

    fireEvent.click(screen.getByRole('tab', { name: 'Saved' }))
    expect(await screen.findByText('Bookmarked Sahara dunes')).toBeInTheDocument()
    expect(fetchSavedPosts).toHaveBeenCalledWith({ page: 1, limit: 20 })

    fireEvent.click(screen.getByRole('button', { name: 'Load more saved posts' }))
    expect(await screen.findByText('Bookmarked Jos plateau')).toBeInTheDocument()
    expect(fetchSavedPosts).toHaveBeenCalledWith({ page: 2, limit: 20 })

    unsavePost.mockRejectedValueOnce(new Error('Network error'))
    const removeButtons = screen.getAllByRole('button', { name: 'Remove saved post' })
    fireEvent.click(removeButtons[0])

    // Optimistically removed immediately
    expect(screen.queryByText('Bookmarked Sahara dunes')).not.toBeInTheDocument()

    // Rolled back when API rejects
    expect(await screen.findByText('Bookmarked Sahara dunes')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('gates like, save, and Saved tab controls for unverified users', async () => {
    renderFeed({ user, isAuthenticated: true, isEmailVerified: false })
    await screen.findByText('A trip to Kyoto')

    expect(screen.queryByRole('tab', { name: 'Saved' })).not.toBeInTheDocument()
    const likeButton = screen.getByRole('button', { name: 'Verify your email to like posts' })
    const saveButton = screen.getByRole('button', { name: 'Verify your email to save posts' })
    expect(likeButton).toBeDisabled()
    expect(saveButton).toBeDisabled()

    fireEvent.click(likeButton)
    fireEvent.click(saveButton)
    expect(likePost).not.toHaveBeenCalled()
    expect(savePost).not.toHaveBeenCalled()
  })

  it('supports multi-photo uploads with alt text on create and enforces the 10-photo limit', async () => {
    const fileOne = new File(['img-1'], 'one.jpg', { type: 'image/jpeg' })
    const fileTwo = new File(['img-2'], 'two.png', { type: 'image/png' })
    const created = { ...post, id: 'post-multi', content: 'Multi-photo journey', images: [] }
    const createdWithImages = {
      ...created,
      images: [
        { id: 'img-1', imageUrl: 'https://example.com/1.jpg', altText: 'Morning skyline', displayOrder: 0 },
        { id: 'img-2', imageUrl: 'https://example.com/2.png', altText: 'Coastal path', displayOrder: 1 },
      ],
    }
    createPost.mockResolvedValue(created)
    uploadPostImage.mockResolvedValue({ id: 'img-1' })
    fetchPost.mockResolvedValue(createdWithImages)

    renderFeed({ user, isAuthenticated: true, isEmailVerified: true })
    await screen.findByText('A trip to Kyoto')

    const fileInput = screen.getByLabelText(/Attach travel photos/)

    // Exceeding 10 photos shows validation message
    const elevenFiles = Array.from({ length: 11 }, (_, idx) => new File(['x'], `p${idx}.jpg`, { type: 'image/jpeg' }))
    fireEvent.change(fileInput, { target: { files: elevenFiles } })
    expect(await screen.findByRole('alert')).toHaveTextContent('You can attach at most 10 photos to a post.')

    // Valid multi-photo selection with alt text
    fireEvent.change(fileInput, { target: { files: [fileOne, fileTwo] } })
    expect(screen.getByText('2/10 photos selected')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Alt text for selected photo 1'), { target: { value: 'Morning skyline' } })
    fireEvent.change(screen.getByLabelText('Alt text for selected photo 2'), { target: { value: 'Coastal path' } })
    fireEvent.change(screen.getByLabelText('Share a travel update'), { target: { value: 'Multi-photo journey' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish post' }))

    await waitFor(() => expect(uploadPostImage).toHaveBeenCalledTimes(2))
    expect(uploadPostImage).toHaveBeenNthCalledWith(1, 'post-multi', fileOne, 'Morning skyline')
    expect(uploadPostImage).toHaveBeenNthCalledWith(2, 'post-multi', fileTwo, 'Coastal path')
    expect(await screen.findByAltText('Morning skyline')).toBeInTheDocument()
  })

  it('allows editing alt text, removing existing photos, and adding new photos when editing a post', async () => {
    const existingImages = [
      { id: 'img-a', imageUrl: 'https://example.com/a.jpg', altText: 'Old caption', displayOrder: 0 },
      { id: 'img-b', imageUrl: 'https://example.com/b.jpg', altText: 'Delete me', displayOrder: 1 },
    ]
    const ownPost = { ...post, author: user, images: existingImages }
    fetchPersonalizedPosts.mockResolvedValue({ posts: [ownPost], pagination })
    deletePostImage.mockResolvedValue(undefined)
    updatePost.mockResolvedValue({ ...ownPost, content: 'Updated journey', images: [existingImages[0]] })
    updatePostImage.mockResolvedValue({ ...existingImages[0], altText: 'New caption' })
    const addedFile = new File(['img-c'], 'c.webp', { type: 'image/webp' })
    uploadPostImage.mockResolvedValue({ id: 'img-c', imageUrl: 'https://example.com/c.webp', altText: 'Fresh shot', displayOrder: 1 })

    renderFeed({ user, isAuthenticated: true, isEmailVerified: true })
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    // Remove second existing image
    const removeButtons = screen.getAllByRole('button', { name: 'Remove photo' })
    fireEvent.click(removeButtons[1])
    await waitFor(() => expect(deletePostImage).toHaveBeenCalledWith(ownPost.id, 'img-b'))

    // Update alt text of remaining image and queue a new photo
    fireEvent.change(screen.getByLabelText('Alt text for photo 1'), { target: { value: 'New caption' } })
    fireEvent.change(screen.getByLabelText('Add photos to post'), { target: { files: [addedFile] } })
    fireEvent.change(screen.getByLabelText('Alt text for new photo 1'), { target: { value: 'Fresh shot' } })
    fireEvent.change(screen.getByLabelText('Edit post'), { target: { value: 'Updated journey' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(updatePostImage).toHaveBeenCalledWith(ownPost.id, 'img-a', { altText: 'New caption' }))
    expect(uploadPostImage).toHaveBeenCalledWith(ownPost.id, addedFile, 'Fresh shot')
    expect(await screen.findByAltText('New caption')).toBeInTheDocument()
    expect(screen.getByAltText('Fresh shot')).toBeInTheDocument()
  })
})
