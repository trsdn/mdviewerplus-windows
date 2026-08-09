// Footnote presentation for `marked-footnote` output.
//
// The extension produces the markup; this module only adds the accessible
// labelling and stable ordering that the sanitizer allows.

export function decorateFootnotes(root) {
  const document = root.ownerDocument || globalThis.document;
  const section = root.querySelector('section[data-footnotes], section.footnotes');
  if (!section) return 0;

  section.classList.add('footnotes');
  section.setAttribute('role', 'doc-endnotes');

  let heading = section.querySelector('h2, h3, h4, h5, h6');
  if (!heading) {
    heading = document.createElement('h2');
    heading.className = 'footnotes__title';
    heading.textContent = 'Footnotes';
    section.insertBefore(heading, section.firstChild);
  }
  if (!heading.id) heading.id = 'footnote-label';
  section.setAttribute('aria-labelledby', heading.id);

  for (const reference of root.querySelectorAll('a[data-footnote-ref]')) {
    reference.classList.add('footnote-ref');
    if (!reference.hasAttribute('aria-label')) {
      reference.setAttribute('aria-label', `Footnote ${(reference.textContent || '').trim()}`);
    }
  }

  for (const backReference of section.querySelectorAll('a[data-footnote-backref]')) {
    backReference.classList.add('footnote-backref');
    backReference.setAttribute('aria-label', 'Back to content');
  }

  return section.querySelectorAll('li').length;
}
