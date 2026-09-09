const mongoose = require('mongoose')
const dotenv = require('dotenv')
const Stage = require('../models/Stage')

dotenv.config()

const stages = [
  { name: 'Qualified', order: 1, color: '#A4A4A4' },
  { name: 'Contact Made', order: 2, color: '#F5C518' },
  { name: 'Demo Scheduled', order: 3, color: '#4DC9C9' },
  { name: 'Proposal Made', order: 4, color: '#F5A623' },
  { name: 'Negotiation', order: 5, color: '#C0392B' },
  { name: 'Won', order: 6, color: '#27AE60' },
  { name: 'Lost', order: 7, color: '#E74C3C' },
]

const seedStages = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log('MongoDB connected')

    await Stage.deleteMany({})
    await Stage.insertMany(stages)

    console.log('Stages populated successfully')
    process.exit()
  } catch (error) {
    console.error('Seeding failed:', error)
    process.exit(1)
  }
}

seedStages()