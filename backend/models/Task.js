const mongoose = require('mongoose')
 
const taskSchema = new mongoose.Schema({
 
  title: {
    type: String,
    required: true
  },
 
  company: {
    type: String,
    default: ''
  },
 
  priority: {
    type: String,
    enum: ['High', 'Medium', 'Low'],
    default: 'Medium'
  },
 
  status: {
    type: String,
    enum: ['todo', 'inprogress', 'completed'],
    default: 'todo'
  },
 
  dueDate: {
    type: Date
  },
 
    assignedTo: [
    {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
    ],
 
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
 
    description: {
    type: String,
    default: ''
  },
 
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
 
  deal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Deal'
  },
 
 
    collaborative: {
        type: Boolean,
        default: false
    },
 
    // Timestamp of the last time this task was successfully pushed to UAP.
    // null means it has never synced (new task, or every sync attempt has failed).
    // Used by the daily sweep job to find tasks that need to be resent.
    lastSyncedAt: {
        type: Date,
        default: null
    }
 
 
}, { timestamps: true })
 
module.exports = mongoose.model('Task', taskSchema)