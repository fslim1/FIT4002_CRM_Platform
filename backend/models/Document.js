const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
    {
        entityId: {type: String, required: true},
        originalName: {type: String, required: true},
        fileName: {type: String, required: true},
        filePath: {type: String, required: true},
        fileSize: {type: Number, required: true},
        mimeType: {type: String, required: true},
        uploadedBy: {type: String, default: "Hiba Zaman"},
    },
    {timestamps: true}
);

module.exports = mongoose.model("Document", documentSchema);