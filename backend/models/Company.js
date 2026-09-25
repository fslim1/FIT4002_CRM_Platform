const mongoose = require('mongoose')

const companySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Company name is required'],
            trim: true,
            maxlength: 120,
        },
    },
    {timestamps: true}
)

module.exports = mongoose.model('Company', companySchema)
