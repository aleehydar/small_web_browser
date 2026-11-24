import { extractText, sanitizeHtml, wrapDocument } from './sanitize';

const blocked = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="JaVa&#x09;script:alert(1)">x</a>',
  '<a href="data:text/html,<script>alert(1)</script>">x</a>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<meta http-equiv="refresh" content="0;url=http://evil">',
  '<base href="http://evil">',
  '<form action="http://evil"><input name="q"></form>',
  '<object data="http://evil"></object>',
  '<embed src="http://evil">',
  '<style>@import url(//evil)</style>',
  '<style>p{background:u\\72l(http://evil)}</style>',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
  '<ScRiPt>alert(1)</ScRiPt>',
  '<script/x>alert(1)</script>',
  '<p style="background:image-set(\'http://evil\' 1x)">x</p>',
];

function expectBlocked(output: string): void {
  expect(output).not.toMatch(/<script/i);
  expect(output).not.toMatch(/\son\w+\s*=/i);
  expect(output).not.toMatch(/javascript:/i);
  expect(output).not.toMatch(/<iframe/i);
  expect(output).not.toMatch(/<object/i);
  expect(output).not.toMatch(/<embed/i);
  expect(output).not.toMatch(/<form/i);
  expect(output).not.toMatch(/<input/i);
  expect(output).not.toMatch(/<meta/i);
  expect(output).not.toMatch(/<base\b/i);
  expect(output).not.toMatch(/<link/i);
  expect(output).not.toMatch(/<svg/i);
  expect(output).not.toMatch(/<math/i);
  expect(output).not.toMatch(/<img/i);
  expect(output).not.toMatch(/href\s*=\s*["'](?!#["'])/i);
}

describe('sanitizeHtml', () => {
  it.each(blocked)('blocks %s', (input) => {
    const output = sanitizeHtml(input);
    expectBlocked(output);
    expect(output.toLowerCase()).not.toContain('url(');
    expect(output.toLowerCase()).not.toContain('@import');
    expect(output).not.toContain('\\');
  });

  it('keeps headings, paragraphs, lists, inline color, and plain style', () => {
    const output = sanitizeHtml(
      '<h1>Title</h1><h2>Sub</h2><p style="color:red">Hello</p><ul><li>One</li></ul><ol><li>Two</li></ol><style>p { color: blue }</style>',
    );
    expect(output).toContain('<h1>Title</h1>');
    expect(output).toContain('<h2>Sub</h2>');
    expect(output).toContain('<p style="color:red">Hello</p>');
    expect(output).toContain('<ul><li>One</li></ul>');
    expect(output).toContain('<ol><li>Two</li></ol>');
    expect(output).toMatch(/<style>p \{ color: blue \}<\/style>/);
  });

  it('keeps a style element that is the first thing in the input', () => {
    const output = sanitizeHtml('<style>p{color:blue}</style><p>Hi</p>');
    expect(output.startsWith('<style>')).toBe(true);
    expect(output).toContain('<p>Hi</p>');
  });

  it('rewrites links to data-addr and a dead href', () => {
    expect(sanitizeHtml('<a href="chickenpot.zz">c</a>')).toContain(
      'data-addr="chickenpot.zz"',
    );
    expect(sanitizeHtml('<a href="chickenpot.zz">c</a>')).toContain('href="#"');
    expect(sanitizeHtml('<a href="chickenpot.zz">c</a>')).not.toContain(
      'href="chickenpot.zz"',
    );

    const external = sanitizeHtml('<a href="http://example.com">e</a>');
    expect(external).toContain('data-addr="http://example.com"');
    expect(external).toContain('href="#"');
    expect(external).not.toContain('href="http://example.com"');

    const prefixed = sanitizeHtml('<a href="WEB://Tide.zz/">t</a>');
    expect(prefixed).toContain('data-addr="tide.zz"');
    expect(prefixed).toContain('href="#"');
  });

  it('keeps an anchor whose href DOMPurify dropped, with no href and no data-addr', () => {
    const output = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(output).toBe('<a>x</a>');
  });

  it('removes a style attribute that contains a backslash and keeps one that does not', () => {
    const output = sanitizeHtml(
      '<p style="color:\\red">bad</p><p style="color:blue">ok</p>',
    );
    expect(output).toBe(
      '<p>bad</p><p style="color:blue">ok</p>',
    );
  });
});

describe('extractText', () => {
  it('drops style content and collapses whitespace', () => {
    const html = sanitizeHtml(
      '<style>p { color: red }</style>\n<p>tide   pool</p>',
    );
    expect(extractText(html)).toBe('tide pool');
  });

  it('separates adjacent block elements', () => {
    expect(extractText('<h1>Tides</h1><p>Rising</p>')).toBe('Tides Rising');
  });

  it('does not insert spaces around inline elements', () => {
    expect(extractText('<p>un<em>der</em>line</p>')).toBe('underline');
  });

  it('separates list items', () => {
    expect(extractText('<ul><li>a</li><li>b</li></ul>')).toBe('a b');
  });
});

describe('wrapDocument', () => {
  it('puts our CSP meta first and drops an author meta', () => {
    const doc = wrapDocument(
      sanitizeHtml(
        '<meta http-equiv="refresh" content="0;url=http://evil.example"><p>Hi</p>',
      ),
    );
    const head = doc.slice(doc.indexOf('<head>'), doc.indexOf('</head>'));
    expect(doc.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(doc).toContain('<html lang="en">');
    expect(head.startsWith(
      '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src \'none\'; base-uri \'none\'; form-action \'none\'">',
    )).toBe(true);
    expect(head.indexOf('charset')).toBeGreaterThan(
      head.indexOf('Content-Security-Policy'),
    );
    expect(head.indexOf('max-width:42rem')).toBeGreaterThan(
      head.indexOf('charset'),
    );
    expect(head).toContain('font-family:Georgia,serif');
    expect(head).toContain('margin:auto');
    expect(head).toContain('padding:1.5rem');
    expect(head).toContain('line-height:1.6');
    expect(doc).toContain('<p>Hi</p>');
    expect(doc).not.toContain('refresh');
    expect(doc).not.toContain('evil.example');
  });
});
