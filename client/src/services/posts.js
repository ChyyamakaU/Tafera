import { request } from './api'
import { fetchCsrfToken } from './auth'

export async function fetchPublicPosts(limit = 6) {
  const { data } = await request(`/api/posts?limit=${limit}`)
  return data.posts || []
}

export async function fetchFollowingPosts({ page = 1, limit = 20 } = {}) {
  const { data } = await request(
    `/api/posts/following?page=${page}&limit=${limit}`,
  )
  return { posts: data.posts || [], pagination: data.pagination }
}

export async function fetchPost(postId) {
  const { data } = await request(`/api/posts/${postId}`)
  return data.post
}

export async function createPost({ content, destinationId = null }) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request('/api/posts', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ content, destinationId }),
  })
  return data.post
}

export async function updatePost(postId, { content }) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(`/api/posts/${postId}`, {
    method: 'PATCH',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ content }),
  })
  return data.post
}

export async function deletePost(postId) {
  const csrfToken = await fetchCsrfToken()
  await request(`/api/posts/${postId}`, {
    method: 'DELETE',
    headers: { 'X-CSRF-Token': csrfToken },
  })
}

export async function fetchPostComments(postId, { page = 1, limit = 50 } = {}) {
  const { data } = await request(
    `/api/posts/${postId}/comments?page=${page}&limit=${limit}`,
  )
  return { comments: data.comments || [], pagination: data.pagination }
}

export async function createPostComment(postId, content) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(`/api/posts/${postId}/comments`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ content }),
  })
  return data.comment
}

export async function updatePostComment(postId, commentId, content) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(
    `/api/posts/${postId}/comments/${commentId}`,
    {
      method: 'PATCH',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ content }),
    },
  )
  return data.comment
}

export async function deletePostComment(postId, commentId) {
  const csrfToken = await fetchCsrfToken()
  await request(`/api/posts/${postId}/comments/${commentId}`, {
    method: 'DELETE',
    headers: { 'X-CSRF-Token': csrfToken },
  })
}
