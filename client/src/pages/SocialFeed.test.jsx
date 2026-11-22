import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext'
import SocialFeed from './SocialFeed'
import {
  createPost,
  createPostComment,
  deletePost,
  deletePostComment,
  fetchFollowingPosts,
  fetchPost,
  fetchPostComments,
  updatePost,
  updatePostComment,
} from '../services/posts'

vi.mock('../services/posts', () => ({
  createPost: vi.fn(),
  createPostComment: vi.fn(),
  deletePost: vi.fn(),
  deletePostComment: vi.fn(),
  fetchFollowingPosts: vi.fn(),
  fetchPost: vi.fn(),
  fetchPostComments: vi.fn(),
  updatePost: vi.fn(),
  updatePostComment: vi.fn(),
}))

const user = { id: 'current-user', fullName: 'Current User', role: 'user' }
const post = {
  id: 'post-1',
  content: 'A trip to Kyoto',
  author: { id: 'author-1', fullName: 'Travel Friend', profileImage: null },
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

beforeEach(() => {
  vi.resetAllMocks()
  fetchFollowingPosts.mockResolvedValue({ posts: [post], pagination })
  fetchPost.mockResolvedValue(post)
  fetchPostComments.mockResolvedValue({ comments: [comment], pagination })
  window.confirm = vi.fn(() => true)
})

describe('SocialFeed', () => {
  it('loads the authenticated following feed and shows author and timestamp', async () => {
    renderFeed({ user, isAuthenticated: true, isEmailVerified: true })
    expect(await screen.findByText('A trip to Kyoto')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Travel Friend' })).toHaveAttribute('href', '/users/author-1')
    expect(screen.getByText(/Nov 20, 2026/)).toBeInTheDocument()
    expect(fetchFollowingPosts).toHaveBeenCalledWith({ page: 1 })
  })

  it('shows an empty state and an error state', async () => {
    fetchFollowingPosts.mockResolvedValueOnce({ posts: [], pagination: { ...pagination, total: 0 } })
    renderFeed({ user, isAuthenticated: true })
    expect(await screen.findByText('Your feed is quiet')).toBeInTheDocument()

    fetchFollowingPosts.mockRejectedValueOnce(Object.assign(new Error('feed unavailable'), { code: 'SERVICE_UNAVAILABLE', status: 503 }))
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
    fetchFollowingPosts.mockResolvedValue({ posts: [ownPost], pagination })
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
})
