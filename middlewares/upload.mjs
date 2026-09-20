import multer from "multer";

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error("Please upload a valid image file (JPEG, PNG, GIF, WebP).")
      );
    }

    cb(null, true);
  },
});

const uploadFields = multerUpload.fields([{ name: "imageFile", maxCount: 1 }]);

export function imageFileUpload(req, res, next) {
  uploadFields(req, res, (error) => {
    if (error) {
      return res.status(400).json({ message: error.message });
    }
    next();
  });
}
