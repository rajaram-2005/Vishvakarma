// §17 — Universal Output Validation with repair/validate loop.

export type ValidationFormat =
  | 'json'
  | 'schema'
  | 'markdown'
  | 'code'
  | 'sql'
  | 'csv'
  | 'image'
  | 'audio'
  | 'video'
  | 'document';

export interface ValidationResult {
  valid: boolean;
  format: ValidationFormat;
  errors: string[];
  repaired?: string;
}

/** Best-effort JSON repair: strip trailing commas, comments, wrap bare values. */
export function repairJson(content: string): string {
  let s = content.trim();
  // Remove // and /* */ comments.
  s = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  // Strip trailing commas before } or ].
  s = s.replace(/,(\s*[}\]])/g, '$1');
  // Wrap if not an object/array.
  const trimmed = s.trim();
  if (trimmed && !/^[\[{]/.test(trimmed) && /[:=]/.test(trimmed)) {
    s = `{${s}}`;
  }
  return s;
}

/** Validate (and optionally repair) an output against a required format. */
export function validateOutput(
  format: ValidationFormat,
  content: string,
  schema?: { required?: string[]; type?: 'object' | 'array' },
): ValidationResult {
  const errors: string[] = [];
  let repaired: string | undefined;

  switch (format) {
    case 'json':
    case 'schema': {
      let candidate = content;
      try {
        JSON.parse(candidate);
      } catch {
        repaired = repairJson(candidate);
        try {
          JSON.parse(repaired);
        } catch (e) {
          errors.push(`invalid json: ${(e as Error).message}`);
        }
      }
      if (schema?.required && (format === 'schema' || true)) {
        try {
          const obj = JSON.parse(repaired ?? content);
          const target = Array.isArray(obj) ? obj[0] : obj;
          if (target && typeof target === 'object') {
            for (const k of schema.required ?? []) {
              if (!(k in target)) errors.push(`missing required field: ${k}`);
            }
          }
        } catch {
          /* already reported */
        }
      }
      break;
    }
    case 'markdown':
      if (!/(^|\n)#{1,6}\s|^- |\d+\.\s/.test(content)) {
        errors.push('markdown has no headings or list structure');
      }
      break;
    case 'code': {
      const opens = (content.match(/[{([]/g) ?? []).length;
      const closes = (content.match(/[})\]]/g) ?? []).length;
      if (opens !== closes) errors.push('unbalanced brackets in code');
      break;
    }
    case 'sql': {
      const m = /^\s*(select|insert|update|delete|create|with|alter|drop)\b/i.test(content);
      if (!m) errors.push('does not look like a SQL statement');
      break;
    }
    case 'csv': {
      const lines = content.trim().split(/\r?\n/);
      const cols = lines[0]?.split(',').length ?? 0;
      if (lines.length < 2 || cols < 1) errors.push('csv needs a header and at least one row');
      for (const ln of lines) {
        if ((ln.split(',').length) !== cols) {
          errors.push('ragged csv rows');
          break;
        }
      }
      break;
    }
    case 'image':
    case 'audio':
    case 'video':
    case 'document':
      // Binary/media outputs: we can only verify non-empty + a type tag.
      if (!content || !content.trim()) errors.push(`${format} output is empty`);
      break;
  }

  return { valid: errors.length === 0, format, errors, repaired };
}

/**
 * §17 loop: validate; if invalid and repairable, repair and re-validate once.
 */
export function validateOrRepair(
  format: ValidationFormat,
  content: string,
  schema?: { required?: string[] },
): ValidationResult {
  const first = validateOutput(format, content, schema);
  if (first.valid) return first;
  if (first.repaired) {
    const second = validateOutput(format, first.repaired, schema);
    if (second.valid) return { ...second, repaired: first.repaired };
  }
  return first;
}
