const notFound = (req, res, next) => {
  const error = new Error(`Route not found: ${req.method} ${req.path}`)
  error.status = 404
  error.code = 'NOT_FOUND'
  error.expose = true

  next(error)
}

module.exports = notFound
