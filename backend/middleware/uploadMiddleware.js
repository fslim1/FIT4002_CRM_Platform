const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directories exist
const uploadDir = path.join(__dirname, '../uploads');
const documentDir = path.join(__dirname, '../uploads/documents');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(documentDir)) {
  fs.mkdirSync(documentDir, { recursive: true });
}

// Storage for logos
const logoStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`);
  }
});

// Storage for documents
const documentStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, documentDir);
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`);
  }
});

// Check logo type
function checkLogoType(file, cb) {
  if (file.mimetype.startsWith('image/')) {
    return cb(null, true);
  }
  return cb(new Error('Error: Images Only!'));
}

// Check document type
function checkDocumentType(file, cb) {
  // Allow PDF, image, DOC, DOCX, TXT, CSV
  const filetypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|txt|csv/;
  const mimetypes = /jpeg|jpg|png|gif|webp|pdf|msword|wordprocessingml|text\/plain|text\/csv/;

    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = mimetypes.test(file.mimetype.toLowerCase());

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Error: Invalid file type! Allowed types: PDF, Image, DOC, DOCX, TXT, CSV.'));
  }
}

// Init logo upload (5MB)
const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 5000000 },
  fileFilter: function (req, file, cb) {
    checkLogoType(file, cb);
  }
});

// Init document upload (10MB)
const uploadDocument = multer({
  storage: documentStorage,
  limits: { fileSize: 10000000 },
  fileFilter: function (req, file, cb) {
    checkDocumentType(file, cb);
  }
});

module.exports = {
  uploadLogo,
  uploadDocument
};
