import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../components/common/Button'
import { useAuth } from '../../contexts/AuthContext'
import {
  fetchAdminUserDetail,
  fetchAdminUsers,
  updateAdminUserRole,
  updateAdminUserStatus,
} from '../../services/admin'
import { getErrorMessage } from '../../services/errors'

const inputClass =
  'w-full rounded-lg border border-tafera-border bg-tafera-card px-3 py-2 text-sm text-tafera-text placeholder:text-tafera-text-muted focus:border-tafera-primary focus:outline-none focus:ring-2 focus:ring-tafera-primary'

const formatDate = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString()
}

export default function AdminUsers() {
  const { user: currentAdmin } = useAuth()
  const [users, setUsers] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [filters, setFilters] = useState({ search: '', role: '', status: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const [selectedUser, setSelectedUser] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionReason, setActionReason] = useState('')
  const [busyId, setBusyId] = useState(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchAdminUsers({
        page,
        limit: 15,
        search: filters.search,
        role: filters.role,
        status: filters.status,
      })
      setUsers(result.users || [])
      setPagination(result.pagination || null)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [page, filters])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const openDetail = async (userRow) => {
    setSelectedUser(userRow)
    setActionReason('')
    setDetailLoading(true)
    try {
      const full = await fetchAdminUserDetail(userRow.id)
      setSelectedUser(full)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setDetailLoading(false)
    }
  }

  const handleStatusToggle = async (targetUser, nextStatus) => {
    setBusyId(targetUser.id)
    setError(null)
    setNotice(null)
    try {
      const updated = await updateAdminUserStatus(targetUser.id, {
        status: nextStatus,
        reason: actionReason.trim() || null,
      })
      setUsers((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      )
      setSelectedUser((current) =>
        current?.id === updated.id ? { ...current, ...updated } : current,
      )
      setActionReason('')
      setNotice(
        nextStatus === 'suspended'
          ? `Suspended ${updated.fullName}.`
          : `Restored ${updated.fullName}.`,
      )
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const handleRoleChange = async (targetUser, nextRole) => {
    setBusyId(targetUser.id)
    setError(null)
    setNotice(null)
    try {
      const updated = await updateAdminUserRole(targetUser.id, {
        role: nextRole,
        reason: actionReason.trim() || null,
      })
      setUsers((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      )
      setSelectedUser((current) =>
        current?.id === updated.id ? { ...current, ...updated } : current,
      )
      setActionReason('')
      setNotice(`Updated ${updated.fullName} role to ${updated.role}.`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const handleSearchSubmit = (event) => {
    event.preventDefault()
    setPage(1)
    setFilters((current) => ({ ...current, search: searchInput.trim() }))
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-tafera-primary">
          User management
        </p>
        <h1 className="mt-1 font-heading text-2xl font-bold text-tafera-text sm:text-3xl">
          Registered Users
        </h1>
        <p className="mt-1 text-sm text-tafera-text-muted">
          Search accounts, inspect activity, manage roles, and suspend or restore access.
        </p>
      </header>

      <form
        onSubmit={handleSearchSubmit}
        className="grid grid-cols-1 gap-3 rounded-xl border border-tafera-border bg-tafera-surface p-4 sm:grid-cols-[1.5fr_0.7fr_0.7fr_auto] sm:items-end"
      >
        <label className="text-xs font-semibold text-tafera-text">
          Search users
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Name, email, or @username"
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-xs font-semibold text-tafera-text">
          Role
          <select
            aria-label="Filter by role"
            value={filters.role}
            onChange={(event) => {
              setPage(1)
              setFilters((current) => ({ ...current, role: event.target.value }))
            }}
            className={`${inputClass} mt-1`}
          >
            <option value="" className="bg-tafera-card text-tafera-text">All roles</option>
            <option value="user" className="bg-tafera-card text-tafera-text">User</option>
            <option value="admin" className="bg-tafera-card text-tafera-text">Admin</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-tafera-text">
          Status
          <select
            aria-label="Filter by status"
            value={filters.status}
            onChange={(event) => {
              setPage(1)
              setFilters((current) => ({ ...current, status: event.target.value }))
            }}
            className={`${inputClass} mt-1`}
          >
            <option value="" className="bg-tafera-card text-tafera-text">All statuses</option>
            <option value="active" className="bg-tafera-card text-tafera-text">Active</option>
            <option value="suspended" className="bg-tafera-card text-tafera-text">Suspended</option>
          </select>
        </label>
        <Button type="submit" size="md">
          Search
        </Button>
      </form>

      {error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-tafera-text">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-lg border border-tafera-primary/30 bg-tafera-card p-3.5 text-sm text-tafera-text">
          {notice}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-tafera-border bg-tafera-card shadow-soft">
        {loading ? (
          <div className="space-y-2 p-5" aria-label="Loading users">
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="h-12 animate-pulse rounded bg-tafera-surface" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-tafera-text-muted">
            No user accounts match the current filters.
          </p>
        ) : (
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-tafera-border bg-tafera-surface text-xs uppercase tracking-wider text-tafera-text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Email status</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tafera-border">
              {users.map((row) => {
                const isSelf = currentAdmin?.id === row.id
                return (
                  <tr key={row.id} className="hover:bg-tafera-surface/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-tafera-text">
                        {row.fullName}
                        {isSelf && (
                          <span className="ml-2 rounded-full bg-tafera-lime px-2 py-0.5 text-[10px] font-bold text-tafera-ink">
                            You
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-tafera-text-muted">
                        {row.email}
                        {row.username ? ` · @${row.username}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 font-semibold ${
                          row.emailVerified
                            ? 'bg-tafera-accent text-tafera-on-accent'
                            : 'border border-tafera-border bg-tafera-surface text-tafera-text-muted'
                        }`}
                      >
                        {row.emailVerified ? 'Verified' : 'Unverified'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold capitalize text-tafera-text">
                      {row.role}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 font-semibold capitalize ${
                          row.status === 'suspended'
                            ? 'border border-red-500/40 bg-red-500/15 text-tafera-text'
                            : 'border border-tafera-border bg-tafera-surface text-tafera-text'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-tafera-text-muted">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openDetail(row)}
                      >
                        Manage
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!pagination.hasPreviousPage}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-tafera-text-muted">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} users)
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!pagination.hasNextPage}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* User Detail & Management Modal */}
      {selectedUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setSelectedUser(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-user-modal-title"
        >
          <div
            className="w-full max-w-lg rounded-xl border border-tafera-border bg-tafera-card p-6 shadow-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-tafera-border pb-4">
              <div>
                <h2 id="admin-user-modal-title" className="font-heading text-lg font-bold text-tafera-text">
                  {selectedUser.fullName}
                </h2>
                <p className="text-xs text-tafera-text-muted">
                  {selectedUser.email}
                  {selectedUser.username ? ` · @${selectedUser.username}` : ''}
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => setSelectedUser(null)}>
                Close
              </Button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div className="rounded-lg border border-tafera-border bg-tafera-surface p-3">
                  <p className="text-tafera-text-muted">Role</p>
                  <p className="mt-1 font-bold capitalize text-tafera-text">{selectedUser.role}</p>
                </div>
                <div className="rounded-lg border border-tafera-border bg-tafera-surface p-3">
                  <p className="text-tafera-text-muted">Status</p>
                  <p className="mt-1 font-bold capitalize text-tafera-text">{selectedUser.status}</p>
                </div>
                <div className="rounded-lg border border-tafera-border bg-tafera-surface p-3">
                  <p className="text-tafera-text-muted">Email</p>
                  <p className="mt-1 font-bold text-tafera-text">
                    {selectedUser.emailVerified ? 'Verified' : 'Unverified'}
                  </p>
                </div>
                <div className="rounded-lg border border-tafera-border bg-tafera-surface p-3">
                  <p className="text-tafera-text-muted">Joined</p>
                  <p className="mt-1 font-bold text-tafera-text">{formatDate(selectedUser.createdAt)}</p>
                </div>
              </div>

              {detailLoading ? (
                <div className="h-14 animate-pulse rounded-lg bg-tafera-surface" />
              ) : selectedUser.activity ? (
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-tafera-border bg-tafera-surface p-3 text-xs sm:grid-cols-4">
                  <span>Posts: <strong>{selectedUser.activity.postsCount}</strong></span>
                  <span>Comments: <strong>{selectedUser.activity.commentsCount}</strong></span>
                  <span>Trips: <strong>{selectedUser.activity.tripsCount}</strong></span>
                  <span>Reports: <strong>{selectedUser.activity.reportsAgainstCount}</strong></span>
                </div>
              ) : null}

              <label className="block text-xs font-semibold text-tafera-text">
                Audit reason (optional)
                <input
                  type="text"
                  maxLength="500"
                  value={actionReason}
                  onChange={(event) => setActionReason(event.target.value)}
                  placeholder="Document reason for suspension, restoration, or role change"
                  className={`${inputClass} mt-1`}
                />
              </label>

              {currentAdmin?.id === selectedUser.id ? (
                <p className="rounded-lg border border-tafera-border bg-tafera-surface p-3 text-xs text-tafera-text-muted">
                  You are viewing your own administrator account. Self-suspension and self-demotion are blocked for safety.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 pt-2">
                  {selectedUser.status === 'active' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === selectedUser.id}
                      onClick={() => handleStatusToggle(selectedUser, 'suspended')}
                    >
                      Suspend account
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="accent"
                      disabled={busyId === selectedUser.id}
                      onClick={() => handleStatusToggle(selectedUser, 'active')}
                    >
                      Restore account
                    </Button>
                  )}

                  {selectedUser.role === 'user' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === selectedUser.id}
                      onClick={() => handleRoleChange(selectedUser, 'admin')}
                    >
                      Promote to Admin
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === selectedUser.id}
                      onClick={() => handleRoleChange(selectedUser, 'user')}
                    >
                      Demote to User
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
