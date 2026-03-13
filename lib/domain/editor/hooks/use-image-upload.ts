/**
 * Image Upload Hook
 *
 * Uploads an image file as REFERENCED content via the simple upload API.
 * Returns the contentId and a proxied download URL for use as the image src.
 *
 * Sprint 37: Images in TipTap + Referenced Content Lifecycle
 */

export interface ImageUploadResult {
  contentId: string;
  downloadUrl: string;
}

/**
 * Upload an image file as referenced content.
 *
 * @param file - The image File to upload
 * @param parentId - Parent folder ID (same folder as the note containing the image)
 * @returns contentId and proxied download URL
 */
export async function uploadImage(
  file: File,
  parentId: string | null
): Promise<ImageUploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("role", "referenced");
  if (parentId) {
    formData.append("parentId", parentId);
  }

  const response = await fetch("/api/content/content/upload/simple", {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      error?.error?.message || `Upload failed with status ${response.status}`
    );
  }

  const result = await response.json();

  if (!result.success || !result.data?.contentId) {
    throw new Error(result.error?.message || "Upload returned no contentId");
  }

  const contentId = result.data.contentId;
  // Use the streaming download proxy — avoids CORS issues and presigned URL expiry
  const downloadUrl = `/api/content/content/${contentId}/download?stream=true`;

  return { contentId, downloadUrl };
}
