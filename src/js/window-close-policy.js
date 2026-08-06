export async function closeAfterApproval(closeWindow, setApproved) {
  setApproved(true);
  try {
    await closeWindow();
  } catch (error) {
    setApproved(false);
    throw error;
  }
}
