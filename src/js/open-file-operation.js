export async function performOpenFile({
  confirmReplacement,
  getDocumentRevision,
  readTarget,
  applyTarget,
}) {
  while (await confirmReplacement()) {
    const confirmedRevision = getDocumentRevision();
    const target = await readTarget();

    // Editing may continue while disk I/O is pending. Re-confirm and re-read so
    // neither newer edits nor target changes during that confirmation are lost.
    if (getDocumentRevision() !== confirmedRevision) continue;

    applyTarget(target);
    return true;
  }

  return false;
}
