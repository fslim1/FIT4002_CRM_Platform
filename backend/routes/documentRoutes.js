const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const {
  getDocuments,
  uploadDocument,
  deleteDocument,
  downloadDocument,
} = require("../controllers/documentController");

const router = express.Router();

const uploadDir = path.join(__dirname, "../uploads/documents");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

router.get("/:entityId", getDocuments);
router.post("/upload", upload.single("file"), uploadDocument);
router.delete("/:id", deleteDocument);
router.get("/:id/download", downloadDocument);

module.exports = router;