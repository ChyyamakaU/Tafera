import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext'
import TravelNavigation from '../components/social/TravelNavigation'
import Notifications from './Notifications'
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notifications'

vi.mock('../services/notifications', () => ({
  fetchNotifications: vi.fn(),
  fetchUnreadCount: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}))

const verifiedAuth = {
  user: { id: 'user-1', fullName: 'Current User', emailVerified: true },
  isAuthenticated: true,
  isEmailVerified: true,
  isLoading: false,
}

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

const unreadFollowNotification = {
  id: 'notification-1',
  message: 'Maya started following you.',
  type: 'new_follower',
  referenceType: 'user',
  referenceId: 'user-2',
  isRead: false,
  createdAt: '2026-11-20T12:00:00.000Z',
  actor: { id: 'user-2' },
}

const unreadPostNotification = {
  id: 'notification-2',
  message: 'Tunde commented on your post.',
  type: 'post_comment',
  referenceType: 'post',
  referenceId: 'post-42',
  isRead: false,
  createdAt: '2026-11-20T13:00:00.000Z',
  actor: { id: 'user-3' },
}

const readNotification = {
  id: 'notification-3',
  message: 'Ada started following you.',
  type: 'new_follower',
  referenceType: 'user',
  referenceId: 'user-4',
  isRead: true,
  createdAt: '2026-11-19T09:00:00.000Z',
  actor: { id: 'user-4' },
}

describe('Notifications page', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    fetchNotifications.mockResolvedValue({ notifications: [unreadFollowNotification] })
    fetchUnreadCount.mockResolvedValue(1)
    markNotificationRead.mockResolvedValue({ id: 'notification-1', isRead: true })
    markAllNotificationsRead.mockResolvedValue(1)
  })

  it('lists existing notifications without a separate Mark as Read button and marks unread notifications read when opened', async () => {
    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <Notifications />
        <LocationDisplay />
      </MemoryRouter>,
    )

    const link = await screen.findByRole('link', { name: 'Maya started following you.' })
    expect(link).toHaveAttribute('href', '/users/user-2')
    expect(screen.queryByRole('button', { name: /mark (as )?read/i })).not.toBeInTheDocument()

    fireEvent.click(link)

    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('notification-1'))
    expect(markNotificationRead).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('button', { name: 'Mark all as read' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Maya started following you.' })).toHaveAttribute('href', '/users/user-2')
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/users/user-2'))
  })

  it('updates the sidebar unread count immediately after an unread notification is marked as read', async () => {
    let serverUnreadCount = 2
    fetchNotifications.mockResolvedValue({
      notifications: [unreadFollowNotification, unreadPostNotification],
    })
    fetchUnreadCount.mockImplementation(async () => serverUnreadCount)
    markNotificationRead.mockImplementation(async (id) => {
      serverUnreadCount = Math.max(0, serverUnreadCount - 1)
      return { id, isRead: true }
    })

    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <AuthContext.Provider value={verifiedAuth}>
          <TravelNavigation />
          <Notifications />
        </AuthContext.Provider>
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText('2 unread notifications')).toBeInTheDocument()
    const firstLink = await screen.findByRole('link', { name: 'Maya started following you.' })

    fireEvent.click(firstLink)

    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('notification-1'))
    expect(await screen.findByLabelText('1 unread notifications')).toBeInTheDocument()

    const secondLink = screen.getByRole('link', { name: 'Tunde commented on your post.' })
    expect(secondLink).toHaveAttribute('href', '/social?post=post-42')
    fireEvent.click(secondLink)

    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('notification-2'))
    await waitFor(() => {
      expect(screen.queryByLabelText(/unread notifications/)).not.toBeInTheDocument()
    })
  })

  it('completes mark-as-read before navigating to the social feed sidebar', async () => {
    let serverUnreadCount = 2
    let resolveMarkRead
    fetchNotifications.mockResolvedValue({
      notifications: [unreadPostNotification, unreadFollowNotification],
    })
    fetchUnreadCount.mockImplementation(async () => serverUnreadCount)
    markNotificationRead.mockImplementation(
      (id) =>
        new Promise((resolve) => {
          resolveMarkRead = () => {
            serverUnreadCount = 1
            resolve({ id, isRead: true })
          }
        }),
    )

    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <AuthContext.Provider value={verifiedAuth}>
          <Routes>
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/social" element={<TravelNavigation />} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    )

    const postLink = await screen.findByRole('link', { name: 'Tunde commented on your post.' })
    fireEvent.click(postLink)

    expect(markNotificationRead).toHaveBeenCalledWith('notification-2')
    expect(fetchUnreadCount).not.toHaveBeenCalled()

    resolveMarkRead()

    expect(await screen.findByLabelText('1 unread notifications')).toBeInTheDocument()
    expect(fetchUnreadCount).toHaveBeenCalledTimes(1)
  })

  it('does not send a mark-as-read request for already-read notifications or duplicate rapid clicks', async () => {
    let resolveMarkRead
    fetchNotifications.mockResolvedValue({
      notifications: [readNotification, unreadFollowNotification],
    })
    markNotificationRead.mockImplementation(
      (id) =>
        new Promise((resolve) => {
          resolveMarkRead = () => resolve({ id, isRead: true })
        }),
    )

    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <Notifications />
        <LocationDisplay />
      </MemoryRouter>,
    )

    const alreadyReadLink = await screen.findByRole('link', { name: 'Ada started following you.' })
    fireEvent.click(alreadyReadLink)
    expect(markNotificationRead).not.toHaveBeenCalled()
    expect(screen.getByTestId('location')).toHaveTextContent('/users/user-4')

    const unreadLink = screen.getByRole('link', { name: 'Maya started following you.' })
    fireEvent.click(unreadLink)
    fireEvent.click(unreadLink)
    expect(markNotificationRead).toHaveBeenCalledTimes(1)
    expect(markNotificationRead).toHaveBeenCalledWith('notification-1')

    resolveMarkRead()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDisabled())

    fireEvent.click(screen.getByRole('link', { name: 'Maya started following you.' }))
    expect(markNotificationRead).toHaveBeenCalledTimes(1)
  })

  it('does not decrement the sidebar unread count when mark-as-read fails', async () => {
    fetchUnreadCount.mockResolvedValue(2)
    markNotificationRead.mockRejectedValueOnce(new Error('Could not update notification.'))

    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <AuthContext.Provider value={verifiedAuth}>
          <TravelNavigation />
          <Notifications />
        </AuthContext.Provider>
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText('2 unread notifications')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('link', { name: 'Maya started following you.' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update notification.')
    expect(screen.getByLabelText('2 unread notifications')).toBeInTheDocument()
  })

  it('marks all notifications read using the existing bulk endpoint and clears the sidebar count', async () => {
    let serverUnreadCount = 1
    fetchUnreadCount.mockImplementation(async () => serverUnreadCount)
    markAllNotificationsRead.mockImplementation(async () => {
      serverUnreadCount = 0
      return 1
    })

    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <AuthContext.Provider value={verifiedAuth}>
          <TravelNavigation />
          <Notifications />
        </AuthContext.Provider>
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText('1 unread notifications')).toBeInTheDocument()
    await screen.findByText('Maya started following you.')
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }))

    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDisabled()
    await waitFor(() => {
      expect(screen.queryByLabelText(/unread notifications/)).not.toBeInTheDocument()
    })
  })
})
