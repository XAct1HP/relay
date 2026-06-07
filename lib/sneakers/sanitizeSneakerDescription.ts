export function sanitizeSneakerDescription(input?: string | null): string | null {
  if (!input) {
    return null;
  }

  const withoutLinks = input.replace(/<a\b[^>]*>(.*?)<\/a>/gi, "$1");
  const withLineBreaks = withoutLinks.replace(/<br\s*\/?>/gi, "\n");
  const withoutTags = withLineBreaks.replace(/<[^>]+>/g, " ");
  const normalizedWhitespace = withoutTags
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  const paragraphs = normalizedWhitespace
    .split(/\n{2,}/)
    .map((paragraph) => sanitizeDescriptionParagraph(paragraph))
    .filter(Boolean);

  return paragraphs.join("\n\n").trim() || null;
}

function sanitizeDescriptionParagraph(paragraph: string): string | null {
  const sentences = paragraph.match(/[^.!?]+[.!?]?/g) ?? [paragraph];
  const cleaned = sentences
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !shouldRemoveDescriptionSentence(sentence))
    .map((sentence) => stripDescriptionPromoPhrases(sentence))
    .map((sentence) => sentence.replace(/\s{2,}/g, " ").trim())
    .filter(Boolean);

  return cleaned.join(" ").trim() || null;
}

function shouldRemoveDescriptionSentence(sentence: string): boolean {
  return /\bclick here\b/i.test(sentence) || /\btap here\b/i.test(sentence) || /\blearn more\b/i.test(sentence);
}

function stripDescriptionPromoPhrases(sentence: string): string {
  return sentence
    .replace(/\bavailable on stockx\b/gi, "")
    .replace(/\bexclusively on stockx\b/gi, "")
    .replace(/\bvia stockx\b/gi, "")
    .replace(/\bon stockx\b/gi, "")
    .replace(/\bfrom stockx\b/gi, "")
    .replace(/\bstockx\b/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}
