const supportLinks = [
  'https://trsdn.github.io/mdviewerplus-windows/',
  'https://github.com/trsdn/mdviewerplus-windows',
  'https://github.com/trsdn/mdviewerplus-windows/issues/new',
];

function showDialog(id) {
  const dialog = document.getElementById(id);
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('h1')?.focus();
}

export function initSupportDialogs({ edition, version, openExternalUrl }) {
  for (const id of ['help-edition', 'about-edition']) {
    document.getElementById(id).textContent = edition;
  }
  for (const id of ['help-version', 'about-version']) {
    document.getElementById(id).textContent = version;
  }

  for (const anchor of document.querySelectorAll('[data-support-link]')) {
    if (!supportLinks.includes(anchor.href)) continue;
    anchor.addEventListener('click', (event) => {
      event.preventDefault();
      void openExternalUrl(anchor.href);
    });
  }
}

export function openHelp() {
  showDialog('help-dialog');
}

export function openAbout() {
  showDialog('about-dialog');
}
