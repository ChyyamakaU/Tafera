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

export async function fetchSavedPosts({ page = 1, limit = 20 } = {}) {
  const { data } = await request(
    `/api/posts/saved?page=${page}&limit=${limit}`,
  )
  return { posts: data.posts || [], pagination: data.pagination }
}

export async function likePost(postId) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(`/api/posts/${encodeURIComponent(postId)}/like`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
  })
  return data
}

export async function unlikePost(postId) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(`/api/posts/${encodeURIComponent(postId)}/like`, {
    method: 'DELETE',
    headers: { 'X-CSRF-Token': csrfToken },
  })
  return data
}

export async function savePost(postId) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(`/api/posts/${encodeURIComponent(postId)}/save`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
  })
  return data
}

export async function unsavePost(postId) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(`/api/posts/${encodeURIComponent(postId)}/save`, {
    method: 'DELETE',
    headers: { 'X-CSRF-Token': csrfToken },
  })
  return data
}

export async function fetchUserPosts(userId, { page = 1, limit = 20 } = {}) {
  const { data } = await request(
    `/api/users/${userId}/posts?page=${page}&limit=${limit}`,
  )
  return { posts: data.posts || [], pagination: data.pagination }
}

export async function fetchPersonalizedPosts(userId, { page = 1, limit = 20 } = {}) {
  const [following, own] = await Promise.all([
    fetchFollowingPosts({ page, limit }),
    fetchUserPosts(userId, { page, limit }),
  ])
  const byId = new Map()
  for (const post of [...following.posts, ...own.posts]) byId.set(post.id, post)
  const posts = [...byId.values()].sort((a, b) => {
    const dateDifference = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    return dateDifference || String(b.id).localeCompare(String(a.id))
  })
  return {
    posts,
    pagination: {
      page,
      limit,
      hasNextPage:
        Boolean(following.pagination?.hasNextPage) ||
        Boolean(own.pagination?.hasNextPage),
    },
  }
}

export async function fetchPost(postId) {
  const { data } = await request(`/api/posts/${postId}`)
  return data.post
}

export async function uploadPostImage(postId, file, altText = '') {
  const csrfToken = await fetchCsrfToken()
  const body = new FormData()
  body.append('image', file)
  if (altText) body.append('altText', altText)
  const { data } = await request(`/api/posts/${postId}/images`, {
    method: 'POST', headers: { 'X-CSRF-Token': csrfToken }, body,
  })
  return data.image
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
