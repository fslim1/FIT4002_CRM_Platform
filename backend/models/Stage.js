const mongoose = require('mongoose')

const stageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    enum: ['Qualified', 'Contact Made', 'Demo Scheduled', 'Proposal Made', 'Negotiation', 'Won', 'Lost']
  },
  order: {
    type: Number,
    required: true
  },
  color: {
    type: String
  }
}, { timestamps: true })

module.exports = mongoose.model('Stage', stageSchema)