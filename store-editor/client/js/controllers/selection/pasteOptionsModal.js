/**
 * Modal: keep modulars/flex_items when pasting a shelf group?
 * @returns {Promise<boolean|null>} true = keep, false = layout only, null = cancel
 */
export function askPasteKeepItems(count) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('popupOverlay');
    const modal = document.getElementById('pasteOptionsModal');
    const message = document.getElementById('pasteOptionsMessage');
    const yesBtn = document.getElementById('pasteKeepItemsYes');
    const noBtn = document.getElementById('pasteKeepItemsNo');
    const cancelBtn = document.getElementById('pasteKeepItemsCancel');

    if (!overlay || !modal || !yesBtn || !noBtn || !cancelBtn) {
      resolve(false);
      return;
    }

    const n = Number(count) || 0;
    message.textContent =
      n === 1
        ? 'Keep modulars and flexed items on the pasted shelf?'
        : `Keep modulars and flexed items on ${n} pasted shelves?`;

    const close = (value) => {
      overlay.style.display = 'none';
      modal.style.display = 'none';
      yesBtn.onclick = null;
      noBtn.onclick = null;
      cancelBtn.onclick = null;
      resolve(value);
    };

    yesBtn.onclick = () => close(true);
    noBtn.onclick = () => close(false);
    cancelBtn.onclick = () => close(null);

    overlay.style.display = 'block';
    modal.style.display = 'block';
  });
}
