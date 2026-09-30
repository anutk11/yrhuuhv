import { supabase } from "@/integrations/supabase/client";

export const PRIVATE_BANK_MEDIA_BUCKET = "question-private-media";
export const PUBLIC_GAME_MEDIA_BUCKET = "question-media";

export function fileExtension(path: string): string {
  const match = path.match(/\.([A-Za-z0-9]+)(?:\?.*)?$/);
  return match ? "." + match[1] : "";
}

export async function signPrivateBankMedia(path: string, expiresIn = 3600): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(PRIVATE_BANK_MEDIA_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) {
    console.error("signPrivateBankMedia error", error);
    return null;
  }
  return data?.signedUrl ?? null;
}

export async function copyPrivateBankMedia(
  sourcePath: string,
  targetBucket: string,
  targetPath: string,
): Promise<string | null> {
  const { data: file, error: downloadError } = await supabase.storage
    .from(PRIVATE_BANK_MEDIA_BUCKET)
    .download(sourcePath);

  if (downloadError || !file) {
    console.error("copyPrivateBankMedia download error", downloadError);
    return null;
  }

  const { error: uploadError } = await supabase.storage
    .from(targetBucket)
    .upload(targetPath, file, { upsert: false });

  if (uploadError) {
    console.error("copyPrivateBankMedia upload error", uploadError);
    return null;
  }

  if (targetBucket === PUBLIC_GAME_MEDIA_BUCKET) {
    return supabase.storage.from(targetBucket).getPublicUrl(targetPath).data.publicUrl;
  }

  return targetPath;
}
