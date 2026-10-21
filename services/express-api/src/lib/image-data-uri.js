/** Image data uri module for the Relay Express API. */

const MAX_IMAGE_BYTES = 7 * 1024 * 1024;

export function validateImageDataUri(value, maxBytes = MAX_IMAGE_BYTES) {
  if (typeof value !== "string") return "invalid";

  const match =
    /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+\/]+={0,2})$/i.exec(
      value
    );

  if (!match) return "invalid";

  const base64 = match[2];

  if (base64.length === 0 || base64.length % 4 !== 0) {
    return "invalid";
  }

  const decoded = Buffer.from(base64, "base64");

  if (decoded.length === 0 || decoded.toString("base64") !== base64) {
    return "invalid";
  }

  if (decoded.length > maxBytes) return "too_large";

  return null;
}
