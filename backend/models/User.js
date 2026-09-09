const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const ROLES = ['Admin', 'Supervisor', 'User']

const userSchema = new mongoose.Schema(
    {
        fullName: {
            type: String,
            required: [true, 'Full name is required'],
            trim: true,
            maxlength: 120,
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email'],
        },
        password: {
            type: String,
            required: function () {
                return this.authProvider === 'local'
            },
            minlength: 8,
            select: false,
        },
        companyName: {
            type: String,
            required: [true, 'Company name is required'],
            trim: true,
            maxlength: 120,
        },
        role: {
            type: String,
            enum: ROLES,
            default: 'User',
        },
        // Primary team the user belongs to. Users belong to at most one team.
        team: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Team',
            default: null,
        },
        // Individual overrides for restricted features. Only Admins hold these
        // by default, and they implicitly hold all of them.
        permissions: {
            deleteCustomers: {type: Boolean, default: false},
            deleteRecords: {type: Boolean, default: false},
            viewAllData: {type: Boolean, default: false},
        },
        authProvider: {
            type: String,
            enum: ['local', 'google'],
            default: 'local',
        },
        googleId: {
            type: String,
            index: true,
            sparse: true,
        },
        gmailAccessToken: {
            type: String,
            default: null,
        },
        isGmailLinked: {
            type: Boolean,
            default: false,
        },
    },
    {timestamps: true}
)

userSchema.pre('save', async function () {
    if (!this.isModified('password') || !this.password) return
    const salt = await bcrypt.genSalt(12)
    this.password = await bcrypt.hash(this.password, salt)
})

userSchema.methods.comparePassword = function (candidate) {
    if (!this.password) return false
    return bcrypt.compare(candidate, this.password)
}

userSchema.methods.toSafeJSON = function () {
    // team may be a raw ObjectId or a populated Team document
    const team =
        this.team && this.team.name
            ? {id: this.team._id, name: this.team.name}
            : this.team || null

    return {
        id: this._id,
        fullName: this.fullName,
        email: this.email,
        companyName: this.companyName,
        role: this.role,
        team,
        permissions: {
            deleteCustomers: Boolean(this.permissions?.deleteCustomers),
            deleteRecords: Boolean(this.permissions?.deleteRecords),
            viewAllData: Boolean(this.permissions?.viewAllData),
        },
        authProvider: this.authProvider,
        createdAt: this.createdAt,
        isGmailLinked: this.isGmailLinked,
        gmailAccessToken: this.gmailAccessToken,
    }
}

const User = mongoose.model('User', userSchema)

module.exports = User
module.exports.ROLES = ROLES
