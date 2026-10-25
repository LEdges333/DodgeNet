// Arrow Up / Arrow Down move the focus between the fields of a form
// (and to the submit button after the last field). Use it as onKeyDown of a <form>.
//
//  <form onKeyDown={handleFormArrowNav}> ... </form>
//
// Left / Right and Enter keep their normal behaviour.
export function handleFormArrowNav(e) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

  const fields = Array.from(
    e.currentTarget.querySelectorAll('input:not([disabled]), button[type="submit"]:not([disabled])')
  );
  const index = fields.indexOf(e.target);
  if (index === -1) return;

  const next = fields[index + (e.key === 'ArrowDown' ? 1 : -1)];
  if (next) {
    e.preventDefault(); // otherwise the cursor jumps to the start/end of the text
    next.focus();
  }
}
