const { MAX_LICENSE_FILE_BYTES } = require("./config");

class UploadError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

// Sniffs the real format from the leading bytes, ignoring the client-supplied
// filename/extension entirely. Only the three formats pdf.js can embed.
function detectFormat(buffer) {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return "png";
  return null;
}

// Returns { buffer, format, safeFileName } or throws UploadError.
function validateLicenseFile(fileName, base64) {
  if (typeof base64 !== "string" || !base64) throw new UploadError("License file is required.");
  // Base64 expands ~4/3; bail before decoding anything absurdly large.
  if (base64.length > Math.ceil(MAX_LICENSE_FILE_BYTES * 4 / 3) + 4) {
    throw new UploadError(`License file exceeds the ${MAX_LICENSE_FILE_BYTES / 1024 / 1024}MB limit.`);
  }
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) throw new UploadError("License file is empty or not valid base64.");
  if (buffer.length > MAX_LICENSE_FILE_BYTES) {
    throw new UploadError(`License file exceeds the ${MAX_LICENSE_FILE_BYTES / 1024 / 1024}MB limit.`);
  }
  const format = detectFormat(buffer);
  if (!format) throw new UploadError("License file must be a PDF, JPG, or PNG.");

  // Rebuild the name from the sniffed format so the stored file's extension
  // always matches its real content (pdf.js branches on the extension).
  const base = String(fileName || "license").replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9\-_ ]/g, "_").slice(0, 80) || "license";
  return { buffer, format, safeFileName: `${base}.${format}` };
}

module.exports = { UploadError, validateLicenseFile };
