const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
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
            enum: ["task", "reminder", "overdue", "activity"],
            default: "task"
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