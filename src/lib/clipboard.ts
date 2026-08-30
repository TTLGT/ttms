'use client';

/**
 * Copying text to the clipboard, on the desks this app actually runs on.
 *
 * `navigator.clipboard` only exists in a secure context — https, or localhost.
 * Staff reach TTMS over plain http on the office network, where it is simply
 * undefined, so there are two fallbacks: the old execCommand path, and failing
 * that, handing the text back for the caller to show in a selectable box. A
 * copy button that silently did nothing on half the desks would be worse than
 * no button at all.
 *
 * Extracted from CopyLinkButton once a second thing needed to copy — a link to
 * one message. Two copies of this would have meant one of them keeping the
 * fallbacks and the other quietly not.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission refused, or a non-secure context that still exposed the
      // object. Fall through rather than reporting success.
    }
  }
  return legacyCopy(text);
}

/** Pre-clipboard-API copy. Returns whether it actually worked. */
function legacyCopy(text: string): boolean {
  try {
    const el = document.createElement('textarea');
    el.value = text;
    // Kept on screen but out of view: a display:none element cannot be
    // selected, which is the usual reason this trick fails.
    el.style.position = 'fixed';
    el.style.top = '-1000px';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
