import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../../contexts/AuthContext'
import { ThemeProvider } from '../../contexts/ThemeContext'
import AdminLayout from '../../components/admin/AdminLayout'
import AdminOverview from './AdminOverview'
import AdminUsers from './AdminUsers'
import AdminDestinations from './AdminDestinations'
import AdminModeration from './AdminModeration'
import AdminTrips from './AdminTrips'
import * as adminApi from '../../services/admin'

vi.mock('../../services/admin', () => ({
  fetchAdminOverview: vi.fn(),
  fetchAdminUsers: vi.fn(),
  fetchAdminUserDetail: vi.fn(),
  updateAdminUserStatus: vi.fn(),
  updateAdminUserRole: vi.fn(),
  fetchAdminDestinations: vi.fn(),
  createAdminDestination: vi.fn(),
  updateAdminDestination: vi.fn(),
  deleteAdminDestination: vi.fn(),
  fetchAdminDestinationPhotos: vi.fn(),
  uploadAdminDestinationPhoto: vi.fn(),
  setDestinationCoverImage: vi.fn(),
  deleteAdminDestinationPhoto: vi.fn(),
  fetchAdminReports: vi.fn(),
  moderateAdminReport: vi.fn(),
  fetchAdminGroupTrips: vi.fn(),
  fetchAdminGroupTripDetail: vi.fn(),
  updateAdminGroupTripStatus: vi.fn(),
  deleteAdminGroupTrip: vi.fn(),
}))

const adminUser = {
  id: 'admin-1',
  fullName: 'Chief Admin',
  email: 'admin@tafera.test',
  role: 'admin',
  emailVerified: true,
}

const renderAdminRoute = (initialPath = '/admin') =>
  render(
    <ThemeProvider>
      <AuthContext.Provider
        value={{
          user: adminUser,
          isAuthenticated: true,
          isEmailVerified: true,
          isLoading: false,
          logout: vi.fn(),
        }}
      >
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminOverview />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="destinations" element={<AdminDestinations />} />
              <Route path="moderation" element={<AdminModeration />} />
              <Route path="trips" element={<AdminTrips />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </ThemeProvider>,
  )

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('Tafera Admin Dashboard', () => {
  it('renders AdminLayout sidebar and live overview metrics + recent audit feed', async () => {
    vi.mocked(adminApi.fetchAdminOverview).mockResolvedValue({
      metrics: {
        totalUsers: 42,
        verifiedUsers: 38,
        suspendedUsers: 1,
        totalDestinations: 15,
        publishedDestinations: 12,
        draftDestinations: 3,
        activeGroupTrips: 7,
        totalGroupTrips: 10,
        totalPosts: 120,
        pendingReports: 4,
        totalReports: 9,
      },
      recentActivity: [
        {
          id: 'log-1',
          action: 'user.suspend',
          targetType: 'user',
          reason: 'Spam behavior',
          admin: { fullName: 'Chief Admin' },
          timestamp: '2026-11-23T12:00:00.000Z',
        },
      ],
    })

    renderAdminRoute('/admin')

    expect(await screen.findByRole('heading', { name: 'Platform Summary' })).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('38')).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getByText(/Suspended user account/)).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Admin navigation' })).toBeInTheDocument()
  })

  it('prevents self-suspension/demotion in AdminUsers and allows suspending other users', async () => {
    const otherUser = {
      id: 'user-2',
      fullName: 'Ada Traveller',
      email: 'ada@example.com',
      role: 'user',
      status: 'active',
      emailVerified: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    }

    vi.mocked(adminApi.fetchAdminUsers).mockResolvedValue({
      users: [
        { ...adminUser, status: 'active', createdAt: '2026-01-01T00:00:00.000Z' },
        otherUser,
      ],
      pagination: { page: 1, totalPages: 1, total: 2 },
    })
    vi.mocked(adminApi.fetchAdminUserDetail).mockImplementation(async (id) =>
      id === 'admin-1'
        ? { ...adminUser, status: 'active', activity: { postsCount: 2, commentsCount: 1, tripsCount: 0, reportsAgainstCount: 0 } }
        : { ...otherUser, activity: { postsCount: 5, commentsCount: 3, tripsCount: 1, reportsAgainstCount: 2 } },
    )
    vi.mocked(adminApi.updateAdminUserStatus).mockResolvedValue({
      ...otherUser,
      status: 'suspended',
    })

    renderAdminRoute('/admin/users')

    expect(await screen.findByText('Ada Traveller')).toBeInTheDocument()

    // Open self modal -> suspend/demote buttons are not shown
    const manageButtons = screen.getAllByRole('button', { name: 'Manage' })
    fireEvent.click(manageButtons[0])
    const selfDialog = await screen.findByRole('dialog')
    expect(within(selfDialog).getByText(/Self-suspension and self-demotion are blocked/i)).toBeInTheDocument()
    expect(within(selfDialog).queryByRole('button', { name: 'Suspend account' })).not.toBeInTheDocument()
    fireEvent.click(within(selfDialog).getByRole('button', { name: 'Close' }))

    // Open other user modal -> suspend with reason
    fireEvent.click(manageButtons[1])
    const userDialog = await screen.findByRole('dialog')
    fireEvent.change(within(userDialog).getByLabelText(/Audit reason/i), {
      target: { value: 'Violation of community guidelines' },
    })
    fireEvent.click(within(userDialog).getByRole('button', { name: 'Suspend account' }))

    await waitFor(() =>
      expect(adminApi.updateAdminUserStatus).toHaveBeenCalledWith('user-2', {
        status: 'suspended',
        reason: 'Violation of community guidelines',
      }),
    )
  })

  it('publishes/unpublishes destinations and resolves moderation reports + cancels group trips', async () => {
    vi.mocked(adminApi.fetchAdminDestinations).mockResolvedValue({
      destinations: [
        {
          id: 'dest-1',
          name: 'Obudu Plateau',
          country: 'Nigeria',
          state: 'Cross River',
          status: 'published',
          featured: true,
          imageCount: 2,
          images: [],
        },
      ],
      pagination: { page: 1, totalPages: 1, total: 1 },
    })
    vi.mocked(adminApi.updateAdminDestination).mockResolvedValue({
      id: 'dest-1',
      name: 'Obudu Plateau',
      country: 'Nigeria',
      state: 'Cross River',
      status: 'draft',
      featured: true,
      imageCount: 2,
      images: [],
    })

    renderAdminRoute('/admin/destinations')
    expect(await screen.findByText('Obudu Plateau')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }))
    await waitFor(() =>
      expect(adminApi.updateAdminDestination).toHaveBeenCalledWith('dest-1', { status: 'draft' }),
    )
    cleanup()

    vi.mocked(adminApi.fetchAdminReports).mockResolvedValue({
      reports: [
        {
          id: 'rep-1',
          targetType: 'post',
          targetId: 'post-1',
          reason: 'spam',
          status: 'pending',
          reporter: { fullName: 'Tunde' },
          targetSummary: { exists: true, label: 'Buy cheap crypto', ownerId: 'user-2' },
          createdAt: '2026-11-23T10:00:00.000Z',
        },
      ],
      pagination: { page: 1, totalPages: 1, total: 1 },
    })
    vi.mocked(adminApi.moderateAdminReport).mockResolvedValue({
      id: 'rep-1',
      status: 'resolved',
      resolutionNote: 'Removed spam',
    })

    renderAdminRoute('/admin/moderation')
    expect(await screen.findByText('Buy cheap crypto')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Review & act/i }))
    const modDialog = await screen.findByRole('dialog')
    fireEvent.change(within(modDialog).getByLabelText(/Resolution note/i), {
      target: { value: 'Removed spam' },
    })
    fireEvent.click(within(modDialog).getByRole('button', { name: /Remove content & resolve/i }))
    await waitFor(() =>
      expect(adminApi.moderateAdminReport).toHaveBeenCalledWith('rep-1', {
        status: 'resolved',
        action: 'remove_content',
        resolutionNote: 'Removed spam',
      }),
    )
    cleanup()

    vi.mocked(adminApi.fetchAdminGroupTrips).mockResolvedValue({
      trips: [
        {
          id: 'trip-1',
          title: 'Lagos Coastal Tour',
          startDate: '2026-12-10',
          endDate: '2026-12-12',
          status: 'published',
          creator: { fullName: 'Ada Traveller', email: 'ada@example.com' },
          participantCount: 4,
          pendingParticipantCount: 1,
          openReportsCount: 1,
        },
      ],
      pagination: { page: 1, totalPages: 1, total: 1 },
    })
    vi.mocked(adminApi.fetchAdminGroupTripDetail).mockResolvedValue({
      id: 'trip-1',
      title: 'Lagos Coastal Tour',
      startDate: '2026-12-10',
      endDate: '2026-12-12',
      status: 'published',
      creator: { fullName: 'Ada Traveller', email: 'ada@example.com', status: 'active' },
      participants: [{ id: 'tp-1', status: 'approved', user: { fullName: 'Sade', email: 'sade@example.com' } }],
      reports: [],
    })
    vi.mocked(adminApi.updateAdminGroupTripStatus).mockResolvedValue({
      id: 'trip-1',
      status: 'cancelled',
    })

    renderAdminRoute('/admin/trips')
    expect(await screen.findByText('Lagos Coastal Tour')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Inspect' }))
    const tripDialog = await screen.findByRole('dialog')
    expect(await within(tripDialog).findByText('Sade')).toBeInTheDocument()
    fireEvent.click(within(tripDialog).getByRole('button', { name: 'Cancel trip' }))
    await waitFor(() =>
      expect(adminApi.updateAdminGroupTripStatus).toHaveBeenCalledWith('trip-1', {
        status: 'cancelled',
        reason: null,
      }),
    )
  })
})
