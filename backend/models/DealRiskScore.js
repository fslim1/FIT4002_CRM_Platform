const mongoose = require('mongoose')

const dealRiskScoreSchema = new mongoose.Schema({
  dealId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Deal',
    required: true,
    index: true,
  },
  riskLevel: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    required: true,
  },
  score: {
    type: Number,
    default: 0,
  },
  reason: {
    type: String,
    default: '',
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, { collection: 'dealriskscores' })

module.exports = mongoose.model('DealRiskScore', dealRiskScoreSchema)
