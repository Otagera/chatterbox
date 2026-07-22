/**
 * Escapes a value for safe interpolation into HTML text or double-quoted
 * attribute contexts. Any non-string input is coerced to string first so that
 * ids, numbers, dates, etc. are handled uniformly.
 *
 * This is the last line of defence against stored/reflected XSS wherever the
 * view layer builds HTML by string concatenation rather than via Pug (which
 * auto-escapes). Every interpolation of user- or ingestion-controlled data
 * must pass through here.
 */
export const escapeHtml = (value: unknown): string => {
	if (value === null || value === undefined) {
		return "";
	}
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
};
