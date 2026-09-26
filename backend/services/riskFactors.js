const Task = require('../models/Task')
const Customer = require('../models/Customer')
const { getVisibleCustomerFilter } = require('../middleware/teamScope')

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const getDaysInStage = (deal) => {
  if (!deal.stageEnteredDate) return 0
  const ms = Date.now() - new Date(deal.stageEnteredDate).getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

// H4: days since the most recent logged interaction on the deal's customer.
// Scoped via getVisibleCustomerFilter (same mechanism dealRoutes.js uses to
// validate a customer on deal creation) rather than matching on
// Customer.company — that field describes the customer's own employer, not
// the requester's CRM tenant, and must never be used for scoping.
const getDaysSinceActivity = async (deal, user) => {
  if (!deal.customer) return {days: null, neverContacted: true}

  const customerScope = await getVisibleCustomerFilter(user)
  const customer = await Customer.findOne({
    $and: [
      { fullName: {$regex: `^${escapeRegex(deal.customer)}$`, $options: 'i'} },
      customerScope,
    ],
  }).select('interactions')

  if (!customer || !customer.interactions || customer.interactions.length === 0) {
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

const getOverdueTaskCount = async (dealId) => {
  return Task.countDocuments({
    deal: dealId,
    dueDate: {$lt: new Date()},
    status: {$ne: 'completed'},
  })
}

module.exports = {getDaysInStage, getDaysSinceActivity, getOverdueTaskCount}