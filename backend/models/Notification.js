const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer",
            default: null
        },

        title: {
            type: String,
            required: true
        },

        message: {
            type: String,
            required: true
        },

        type: {
            type: String,
            enum: ["task", "reminder", "overdue", "activity", "email"],
            default: "activity"
        },

        source: {
            type: String,
            enum: ["gmail", "system"],
            default: "system"
        },

        senderEmail: {
            type: String,
            default: null
        },

        subject: {
            type: String,
            default: null
        },

        messageId: {
            type: String,
            default: null,
            index: true,
            sparse: true
        },

        read: {
            type: Boolean,
            default: false
        },

        relatedTask: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Task"
        }
    },
    {timestamps: true}
);

module.exports = mongoose.model(
    "Notification",
    notificationSchema
);