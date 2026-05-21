export interface ImagePlaceholder {
  raw: string;
  filename: string;
  format: 'standard' | 'obsidian';
}

// Scans markdown content for relative/local image paths (supporting standard & Obsidian formats)
export function scanForLocalImages(markdown: string): ImagePlaceholder[] {
  const placeholders: ImagePlaceholder[] = [];

  // 1. Standard markdown images: ![alt](url)
  // Exclude remote/data URLs
  const standardRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = standardRegex.exec(markdown)) !== null) {
    const raw = match[0];
    const path = match[2].trim();
    if (!path.startsWith('http://') && !path.startsWith('https://') && !path.startsWith('data:')) {
      const filename = path.split('/').pop() || path;
      placeholders.push({
        raw,
        filename,
        format: 'standard',
      });
    }
  }

  // 2. Obsidian style images: ![[path]] or ![[path|alt]]
  // Exclude remote/data URLs
  const obsidianRegex = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  while ((match = obsidianRegex.exec(markdown)) !== null) {
    const raw = match[0];
    const path = match[1].trim();
    if (!path.startsWith('http://') && !path.startsWith('https://') && !path.startsWith('data:')) {
      const filename = path.split('/').pop() || path;
      placeholders.push({
        raw,
        filename,
        format: 'obsidian',
      });
    }
  }

  // Deduplicate by filename
  const unique: ImagePlaceholder[] = [];
  const seen = new Set<string>();
  for (const p of placeholders) {
    if (!seen.has(p.filename)) {
      seen.add(p.filename);
      unique.push(p);
    }
  }

  return unique;
}

// Programmatically rewrites markdown image placeholders to point to public storage URLs
export function rewriteMarkdownImages(
  markdown: string,
  imageUrls: Record<string, string>
): string {
  let rewritten = markdown;

  // Standard Markdown replacement
  const standardRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  rewritten = rewritten.replace(standardRegex, (match, alt, path) => {
    const filename = path.trim().split('/').pop() || path.trim();
    if (imageUrls[filename]) {
      return `![${alt}](${imageUrls[filename]})`;
    }
    return match;
  });

  // Obsidian Markdown replacement -> Converts to standard markdown format so react-markdown renders perfectly
  const obsidianRegex = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  rewritten = rewritten.replace(obsidianRegex, (match, path, alt) => {
    const filename = path.trim().split('/').pop() || path.trim();
    if (imageUrls[filename]) {
      const altText = alt ? alt.trim() : '';
      return `![${altText || filename}](${imageUrls[filename]})`;
    }
    return match;
  });

  return rewritten;
}
