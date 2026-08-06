import { supabase } from "./supabase.mjs";

const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "my-personal-blog";

export async function uploadImageFile(file, folder = "posts") {
  if (!file) {
    throw new Error("Image file is required");
  }

  const safeName = file.originalname.replace(/\s+/g, "_");
  const filePath = `${folder}/${Date.now()}_${safeName}`;

  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) {
    throw error;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucketName).getPublicUrl(data.path);

  return publicUrl;
}
