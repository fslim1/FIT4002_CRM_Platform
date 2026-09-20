const mongoose = require('mongoose')

const statusLogSchema = new mongoose.Schema({
  fromStage: { type: String },
  toStage: { type: String, required: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  changedAt: { type: Date, default: Date.now }
}, { _id: false })

const dealSchema = new mongoose.Schema({
  name: { type: String, required: true },
  company: { type: String, required: true },
  price: { type: String, required: true },
  stage: {
    type: String,
    enum: ['Qualified', 'Contact Made', 'Demo Scheduled', 'Proposal Made', 'Negotiation', 'Won', 'Lost'],
    default: 'Qualified'
  },
  // H3: the moment the deal entered its current stage. Updated every time
  // `stage` changes (see dealRoutes.js), so daysInStage is always accurate
  // without needing a background job to keep it in sync.
  stageEnteredDate: { type: Date, default: Date.now },
  priority: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
  probability: { type: Number, default: 20 },
  daysAgo: { type: Number, default: 0 },
  assignee: { type: String, default: '' },
  customer: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  statusLogs: [statusLogSchema]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})

// H3: computed on every access, never stored — so it can never go stale.
dealSchema.virtual('daysInStage').get(function () {
  if (!this.stageEnteredDate) return 0
  const ms = Date.now() - new Date(this.stageEnteredDate).getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
})

module.exports = mongoose.model('Deal', dealSchema)