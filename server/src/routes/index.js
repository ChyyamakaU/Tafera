const router = require('express').Router()

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'tafera-api' })
})

module.exports = router
