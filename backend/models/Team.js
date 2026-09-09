const mongoose = require('mongoose')

const teamSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Team name is required'],
            trim: true,
            maxlength: 80,
        },
        // Company the team belongs to (matched case-insensitively). Team names
        // are unique within a company (enforced in the routes); legacy teams
        // without a company stay visible to every admin.
        company: {
            type: String,
            trim: true,
            maxlength: 120,
            default: null,
            index: true,
        },
        supervisor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        // When enabled, members of this team can see each other's customers
        sharingEnabled: {
            type: Boolean,
            default: false,
        },
    },
    {timestamps: true}
)

module.exports = mongoose.model('Team', teamSchema)
