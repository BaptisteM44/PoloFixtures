export function toYoutubeEmbed(url?: string | null) {
  if (!url) return null;
  const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
  if (!match) return null;
  return `https://www.youtube.com/embed/${match[1]}`;
}
