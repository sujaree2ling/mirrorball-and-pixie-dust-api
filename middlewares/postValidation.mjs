const postFields = [
  { key: "title", type: "string", label: "Title" },
  { key: "category", type: "string", label: "Category" },
  { key: "description", type: "string", label: "Description" },
  { key: "content", type: "string", label: "Content" },
  { key: "status", type: "string", label: "Status" },
];

function hasUploadedImage(req) {
  return Boolean(req.files?.imageFile?.[0]);
}

function getPostValidationError(req) {
  const body = req.body || {};

  for (const field of postFields) {
    const value = body[field.key];

    if (value === undefined || value === null || value === "") {
      return `${field.label} is required`;
    }

    if (typeof value !== field.type) {
      return `${field.label} must be a ${field.type}`;
    }
  }

  if (!["draft", "published"].includes(body.status)) {
    return "Status must be draft or published";
  }

  const image = body.image;
  const hasImage =
    hasUploadedImage(req) ||
    (typeof image === "string" && image.trim() !== "");

  if (!hasImage) {
    return "Image is required";
  }

  return null;
}

export function validatePostData(req, res, next) {
  const errorMessage = getPostValidationError(req);

  if (errorMessage) {
    return res.status(400).json({ message: errorMessage });
  }

  next();
}
