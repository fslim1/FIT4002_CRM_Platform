const mongoose = require('mongoose');

const InteractionSchema = new mongoose.Schema({
  entityId: { type: String, required: true }, // e.g., 'john-smith-123'
  type: { type: String, required: true },     // 'Email', 'Call', 'Task', 'Note'
  desc: { type: String, required: true },     // The message body text
  author: { type: String, default: 'You' },   // Who logged it
  time: { type: String, required: true }      // Timestamp display string
}, { timestamps: true });

module.exports = mongoose.model('Interaction', InteractionSchema);