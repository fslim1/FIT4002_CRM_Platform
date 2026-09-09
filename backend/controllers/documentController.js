const Document = require("../models/Document");
const fs = require("fs");
const path = require("path");

const getDocuments = async (req, res) => {
  try {
    const documents = await Document.find({ entityId: req.params.entityId })
        .sort({createdAt: -1});

    res.json(documents);
  } catch (err) {
    console.error("Get documents error:", err);
    res.status(500).json({ status: "error", message: "Failed to load documents" });
  }
};

const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: "error", message: "No file uploaded" });
    }

    const document = await Document.create({
      entityId: req.body.entityId,
      originalName: req.file.originalname,
      fileName: req.file.filename,
      filePath: `uploads/documents/${req.file.filename}`,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: req.body.uploadedBy || "Hiba Zaman",
    });

    res.json({ status: "success", data: document });
  } catch (err) {
    console.error("Upload document error:", err);
    res.status(500).json({ status: "error", message: "Failed to upload document" });
  }
};

const deleteDocument = async (req, res) => {
  try {
    const document = await Document.findByIdAndDelete(req.params.id);

    if (!document) {
      return res.status(404).json({ status: "error", message: "Document not found" });
    }

    if (fs.existsSync(document.filePath)) {
      fs.unlinkSync(document.filePath);
    }

    res.json({ status: "success", data: document });
  } catch (err) {
    console.error("Delete document error:", err);
    res.status(500).json({ status: "error", message: "Failed to delete document" });
  }
};

const downloadDocument = async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({
        status: "fail",
        message: "Document not found",
      });
    }

    // let storedPath = document.filePath.replace(/\\/g, "/");

    // Remove Docker/internal prefixes if they exist
    // storedPath = storedPath.replace(/^\/app\//, "");
    // storedPath = storedPath.replace(/^app\//, "");
    // storedPath = storedPath.replace(/^\//, "");

    // const fullPath = path.join(process.cwd(), storedPath);

    const filePath = path.join(__dirname, "..", document.filePath);

    return res.download(filePath, document.originalName);
  } catch (err) {
    console.error("Download document error:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to download document",
    });
  }
};

module.exports = { getDocuments, uploadDocument, deleteDocument , downloadDocument};