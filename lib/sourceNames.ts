function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalizes source names for display.
 *
 * We sometimes import sources where the category is redundantly embedded in the
 * name, e.g. `Olshansk: Claude` with category `Olshansk`. This helper removes
 * those prefixes/suffixes so lists and scan headers stay clean and stable.
 */
export function normalizeSourceName(name: string, category?: string): string {
  const raw = (name ?? "").trim();
  if (!raw) return raw;

  let out = raw;
  const cat = (category ?? "").trim();

  // Strip a trailing "(Category)" when it's redundant.
  if (cat) {
    out = out.replace(new RegExp(`\\s*\\(${escapeRegExp(cat)}\\)\\s*$`, "i"), "").trim();
  }

  // Strip "<Category>: " prefix when it matches the category field.
  const m = out.match(/^([^:]{2,80}):\s*(.+)$/);
  if (m) {
    const prefix = m[1].trim();
    const rest = m[2].trim();
    if (cat && prefix.toLowerCase() === cat.toLowerCase()) {
      out = rest;
    }
    // Also handle "<X>: Y (X)" style.
    out = out.replace(new RegExp(`\\s*\\(${escapeRegExp(prefix)}\\)\\s*$`, "i"), "").trim();
  }

  return out || raw;
}

