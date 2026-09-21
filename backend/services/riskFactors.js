const Task = require('../models/Task')
const Customer = require('../models/Customer')

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// H3: how many whole days the deal has been in its current stage.
// Pure calculation, no DB call — mirrors the Deal model's `daysInStage`
// virtual, exposed here too so the /risk-factors endpoint doesn't need to
// re-fetch or duplicate the virtual's logic.
const getDaysInStage = (deal) => {
  if (!deal.stageEnteredDate) return 0
  const ms = Date.now() - new Date(deal.stageEnteredDate).getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

// H4: days since the most recent logged interaction on the deal's customer.
// Customer.interactions[].date is the real field (see models/Customer.js),
// defaulting to Date.now on creation, so every interaction has one.
const getDaysSinceActivity = async (deal) => {
  if (!deal.customer) return {days: null, neverContacted: true}

  const customer = await Customer.findOne({
    fullName: {$regex: `^${escapeRegex(deal.customer)}$`, $options: 'i'},
  }).select('interactions')

  if (!customer || !customer.interactions || customer.interactions.length === 0) {
    // AC: no interaction ever logged -> treated as maximum risk, not an error.
    return {days: null, neverContacted: true}
  }

  const dates = customer.interactions
    .map((interaction) => interaction.date)
    .filter(Boolean)
    .map((d) => new Date(d).getTime())

  if (dates.length === 0) {
    return {days: null, neverContacted: true}
  }

  const mostRecent = Math.max(...dates)
  const days = Math.max(0, Math.floor((Date.now() - mostRecent) / (1000 * 60 * 60 * 24)))
  return {days, neverContacted: false}
}

// H5: overdue tasks linked directly to this deal.
const getOverdueTaskCount = async (dealId) => {
  return Task.countDocuments({
    deal: dealId,
    dueDate: {$lt: new Date()},
    status: {$ne: 'completed'},
  })
}

module.exports = {getDaysInStage, getDaysSinceActivity, getOverdueTaskCount}