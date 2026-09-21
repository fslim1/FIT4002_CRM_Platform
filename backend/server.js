const mongoose = require('mongoose')
const dotenv = require('dotenv')

dotenv.config()

// The Express app is built in app.js so it can be imported by tests without
// binding a port. This file is the process entry point: it owns the database
// connection and the listener.
const app = require('./app')

if (process.env.MONGO_URI) {
    mongoose
        .connect(process.env.MONGO_URI)
        .then(() => console.log('MongoDB connected successfully'))
        .catch((err) => console.log('MongoDB connection error:', err))
} else {
    console.warn('MONGO_URI not set; database features are disabled')
}

const PORT = process.env.PORT || 5001
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
