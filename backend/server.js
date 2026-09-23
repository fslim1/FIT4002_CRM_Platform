const mongoose = require('mongoose')
const dotenv = require('dotenv')

dotenv.config()

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
