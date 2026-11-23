import { useState } from 'react'
import { Button } from '../common/Button'

const fieldClass = 'w-full rounded-lg border border-tafera-border bg-tafera-card px-4 py-2 text-tafera-text placeholder:text-tafera-text-muted focus:border-tafera-primary focus:outline-none focus:ring-2 focus:ring-tafera-primary'

export default function TripForm({
  initialValues = {},
  tripType = 'personal',
  submitLabel = 'Create trip',
  busyLabel = 'Saving...',
  busy = false,
  onSubmit,
  onCancel,
}) {
  const [values, setValues] = useState({
    title: initialValues.title || '',
    description: initialValues.description || '',
    startDate: initialValues.startDate || '',
    endDate: initialValues.endDate || '',
    maxParticipants: initialValues.maxParticipants ?? '',
    status: initialValues.status || (tripType === 'group' ? 'published' : 'draft'),
  })

  const update = (field) => (event) =>
    setValues((current) => ({ ...current, [field]: event.target.value }))

  const submit = (event) => {
    event.preventDefault()
    onSubmit({
      ...values,
      description: values.description.trim() || null,
      tripType,
      maxParticipants: values.maxParticipants === '' ? null : Number(values.maxParticipants),
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="trip-title" className="mb-1 block text-sm font-medium text-tafera-text">Trip title</label>
        <input id="trip-title" className={fieldClass} value={values.title} onChange={update('title')} maxLength="150" required />
      </div>
      <div>
        <label htmlFor="trip-description" className="mb-1 block text-sm font-medium text-tafera-text">Description</label>
        <textarea id="trip-description" className={fieldClass} rows="3" value={values.description} onChange={update('description')} maxLength="2000" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="trip-start" className="mb-1 block text-sm font-medium text-tafera-text">Start date</label>
          <input id="trip-start" className={fieldClass} type="date" value={values.startDate} onChange={update('startDate')} required />
        </div>
        <div>
          <label htmlFor="trip-end" className="mb-1 block text-sm font-medium text-tafera-text">End date</label>
          <input id="trip-end" className={fieldClass} type="date" value={values.endDate} onChange={update('endDate')} min={values.startDate || undefined} required />
        </div>
      </div>
      {tripType === 'group' && (
        <div>
          <label htmlFor="trip-capacity" className="mb-1 block text-sm font-medium text-tafera-text">Maximum participants</label>
          <input id="trip-capacity" className={fieldClass} type="number" min="1" max="1000" value={values.maxParticipants} onChange={update('maxParticipants')} placeholder="Leave blank for unlimited" />
          <p className="mt-1 text-xs text-tafera-text-muted">The organizer is not counted as a participant.</p>
        </div>
      )}
      <div>
        <label htmlFor="trip-status" className="mb-1 block text-sm font-medium text-tafera-text">Status</label>
        <select id="trip-status" className={fieldClass} value={values.status} onChange={update('status')}>
          <option value="draft" className="bg-tafera-card text-tafera-text">Draft</option>
          <option value="published" className="bg-tafera-card text-tafera-text">Published</option>
          <option value="completed" className="bg-tafera-card text-tafera-text">Completed</option>
          <option value="cancelled" className="bg-tafera-card text-tafera-text">Cancelled</option>
        </select>
        {tripType === 'group' && <p className="mt-1 text-xs text-tafera-text-muted">Only published group trips can be joined.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>{busy ? busyLabel : submitLabel}</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  )
}
