const postFields = [
  { key: "title", type: "string", label: "Title" },
  { key: "image", type: "string", label: "Image" },
  { key: "category_id", type: "number", label: "Category_id" },
  { key: "description", type: "string", label: "Description" },
  { key: "content", type: "string", label: "Content" },
  { key: "status_id", type: "number", label: "Status_id" },
];

function getPostValidationError(body = {}) {
  for (const field of postFields) {
    const value = body[field.key];

    if (value === undefined || value === null || value === "") {
      return `${field.label} is required`;
    }

    if (typeof value !== field.type) {
      return `${field.label} must be a ${field.type}`;
    }
  }

  return null;
}

export function validatePostData(req, res, next) {
  const errorMessage = getPostValidationError(req.body);

  if (errorMessage) {
    return res.status(400).json({ message: errorMessage });
  }

  next();
}
