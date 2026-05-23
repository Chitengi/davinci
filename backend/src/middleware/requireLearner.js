const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const requireLearner = (req, res, next) => {
  const learnerExternalId = req.header('x-learner-id')

  if (!learnerExternalId || !UUID_REGEX.test(learnerExternalId)) {
    return res.status(400).json({
      error: 'Missing or invalid x-learner-id header (UUID required).',
    })
  }

  req.learnerExternalId = learnerExternalId
  return next()
}
