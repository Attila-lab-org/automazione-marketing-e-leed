function decodeEntities(value: string): string {
  return value
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

export function emailHtmlToText(html: string): string {
  const withImageLabels = html.replace(
    /<img\b[^>]*\balt=(["'])(.*?)\1[^>]*>/gi,
    (_match, _quote: string, alt: string) => alt,
  );
  const withLinks = withImageLabels.replace(
    /<a\b[^>]*\bhref=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, _quote: string, href: string, inner: string) => {
      const label = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return label && label !== href ? `${label}: ${href}` : href;
    },
  );

  return decodeEntities(
    withLinks
      .replace(/<(br|\/p|\/div|\/tr|\/table|\/h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}
