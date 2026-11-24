import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { canonicalize } from '../address/address';

const DANGEROUS_STYLE =
  /url\(|image-set\(|@import|expression\(|javascript:|\\/i;

// DOMPurify drops unknown schemes, including web:, before afterSanitizeAttributes.
const ALLOWED_URI_REGEXP =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|web):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i;

const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'a',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'em',
  'strong',
  'b',
  'i',
  'u',
  'br',
  'hr',
  'span',
  'div',
  'section',
  'article',
  'header',
  'footer',
  'nav',
  'main',
  'aside',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'figure',
  'figcaption',
  'small',
  'sub',
  'sup',
  'dl',
  'dt',
  'dd',
  'mark',
  'style',
];

const ALLOWED_ATTR = ['class', 'id', 'style', 'href', 'title', 'lang'];

const BLOCK_TAGS = [
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'ul',
  'ol',
  'br',
  'hr',
  'tr',
  'td',
  'th',
  'table',
  'blockquote',
  'pre',
  'section',
  'article',
  'header',
  'footer',
  'nav',
  'main',
  'aside',
  'figure',
  'figcaption',
  'dt',
  'dd',
  'dl',
].join(',');

const SHEET =
  'body{font-family:Georgia,serif;max-width:42rem;margin:auto;padding:1.5rem;line-height:1.6}';

const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'";

const window = new JSDOM('').window;
const purify = DOMPurify(window);

function dangerousStyle(value: string): boolean {
  return DANGEROUS_STYLE.test(value);
}

purify.addHook('afterSanitizeAttributes', (node) => {
  const style = node.getAttribute('style');
  if (style !== null && dangerousStyle(style)) {
    node.removeAttribute('style');
  }
  if (node.nodeName === 'STYLE' && dangerousStyle(node.textContent ?? '')) {
    node.remove();
    return;
  }
  if (node.nodeName !== 'A' || !node.hasAttribute('href')) {
    return;
  }
  const raw = node.getAttribute('href') ?? '';
  const canonical = canonicalize(raw);
  const dataAddr = canonical.ok
    ? canonical.address
    : raw.trim().slice(0, 200);
  node.setAttribute('data-addr', dataAddr);
  node.setAttribute('href', '#');
});

export function sanitizeHtml(input: string): string {
  return purify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORCE_BODY: true,
    ALLOWED_URI_REGEXP,
  });
}

export function extractText(sanitizedHtml: string): string {
  const { document } = new JSDOM(
    `<!DOCTYPE html><body>${sanitizedHtml}</body>`,
  ).window;
  for (const style of document.querySelectorAll('style')) {
    style.remove();
  }
  for (const block of document.querySelectorAll(BLOCK_TAGS)) {
    const parent = block.parentNode;
    if (parent === null) {
      continue;
    }
    parent.insertBefore(document.createTextNode(' '), block);
    parent.insertBefore(document.createTextNode(' '), block.nextSibling);
  }
  return (document.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function wrapDocument(sanitizedHtml: string): string {
  return (
    '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head>' +
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">` +
    '<meta charset="utf-8">' +
    `<style>${SHEET}</style>` +
    '</head>' +
    `<body>${sanitizedHtml}</body>` +
    '</html>'
  );
}
