// Prism must never highlight the document on its own: automatic highlighting
// assigns innerHTML outside the sanitizer. This flag is read by prism-core
// while it initialises, so it has to be set before the core module loads.
globalThis.Prism = globalThis.Prism || {};
globalThis.Prism.manual = true;
