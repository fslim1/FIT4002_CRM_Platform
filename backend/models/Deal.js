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
  priority: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
  probability: { type: Number, default: 20 },
  daysAgo: { type: Number, default: 0 },
  assignee: { type: String, default: '' },
  customer: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  statusLogs: [statusLogSchema]
}, { timestamps: true })

module.exports = mongoose.model('Deal', dealSchema)