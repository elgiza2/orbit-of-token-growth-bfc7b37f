/** @doc Turns a picked photo into a small square JPEG data URL (profile photos are stored inline on the profile). */
export async function toAvatar(file: File, size = 256): Promise<string> {
  const img = await createImageBitmap(file);
  const c = document.createElement("canvas"); c.width = c.height = size;
  const k = Math.max(size / img.width, size / img.height), w = img.width * k, h = img.height * k;
  const context = c.getContext("2d");
  if (!context) throw new Error("Couldn't prepare your photo.");
  context.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  img.close();
  return c.toDataURL("image/jpeg", 0.85);
}
