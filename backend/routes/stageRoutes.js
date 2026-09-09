const express = require('express')
const router = express.Router()
const Stage = require('../models/Stage')

router.get('/', async (req, res) => {
  try {
    const stages = await Stage.find().sort({ order: 1 })
    res.json(stages)
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch stages' })
  }
})

module.exports = router