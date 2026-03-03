export function uploadsEnabled() {
  return process.env.UPLOADS_ENABLED !== "false";
}
