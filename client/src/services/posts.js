import { request } from './api'

export async function fetchPublicPosts(limit = 6) {
  const { data } = await request(`/api/posts?limit=${limit}`)
  return data.posts || []
}
