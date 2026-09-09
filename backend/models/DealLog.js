const mongoose = require('mongoose')

const dealLogSchema = new mongoose.Schema({
  dealName: { type: String, required: true },
  fromStage: { type: String },
  toStage: { type: String, required: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  changedAt: { type: Date, default: Date.now }
})

module.exports = mongoose.model('DealLog', dealLogSchema)