/**
 * CSV Parser & Generator Service
 * Robust RFC-4180 compliant CSV parser and generator with formula injection protection
 */

export interface ParsedCsvRow {
  rowNumber: number;
  data: Record<string, string>;
  raw: string;
}

/**
 * Sanitizes values against CSV Formula Injection (DDE injection).
 * If a field begins with =, +, -, @, \t, or \r, prepend a single quote (') so spreadsheets treat it as plain text.
 */
export function sanitizeCsvFormula(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value);

  // If first character is sensitive trigger character, prepend '
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  return str;
}

/**
 * Formats a value as a CSV cell, quoting if it contains commas, newlines, quotes, or starts with a quote.
 */
export function formatCsvCell(value: unknown): string {
  const sanitized = sanitizeCsvFormula(value);
  if (sanitized.includes('"') || sanitized.includes(',') || sanitized.includes('\n') || sanitized.includes('\r')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

/**
 * Converts a list of column headers and rows into a CSV string.
 */
export function generateCsvString(headers: string[], rows: Record<string, unknown>[]): string {
  const headerLine = headers.map((h) => formatCsvCell(h)).join(',');
  const rowLines = rows.map((row) => {
    return headers.map((h) => formatCsvCell(row[h] ?? '')).join(',');
  });

  return [headerLine, ...rowLines].join('\r\n');
}

/**
 * Parses a raw CSV string into normalized key-value rows.
 * Handles quoted cells with internal commas, quotes, and newlines.
 */
export function parseCsv(csvText: string): { headers: string[]; rows: ParsedCsvRow[]; parseErrors: string[] } {
  const parseErrors: string[] = [];
  if (!csvText || typeof csvText !== 'string') {
    return { headers: [], rows: [], parseErrors: ['CSV content is empty'] };
  }

  // Strip BOM if present
  let cleanText = csvText.replace(/^\uFEFF/, '');

  // Parse into tokens/records
  const records: string[][] = [];
  let currentRecord: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  const len = cleanText.length;

  while (i < len) {
    const char = cleanText[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && cleanText[i + 1] === '"') {
          // Escaped quote
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRecord.push(currentField);
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (i + 1 < len && cleanText[i + 1] === '\n') {
          i++;
        }
        currentRecord.push(currentField);
        currentField = '';
        records.push(currentRecord);
        currentRecord = [];
        i++;
        continue;
      } else if (char === '\n') {
        currentRecord.push(currentField);
        currentField = '';
        records.push(currentRecord);
        currentRecord = [];
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Push remainder
  if (currentField.length > 0 || currentRecord.length > 0) {
    currentRecord.push(currentField);
    records.push(currentRecord);
  }

  // Filter out completely empty records
  const validRecords = records.filter((r) => r.some((field) => field.trim().length > 0));

  if (validRecords.length === 0) {
    return { headers: [], rows: [], parseErrors: ['No data found in CSV file.'] };
  }

  // Extract and normalize headers
  const rawHeaders = validRecords[0];
  const headers = rawHeaders.map((h) => h.trim().toLowerCase().replace(/^['"]|['"]$/g, ''));

  // Build rows (row index 1 is header, data rows start at row 2)
  const rows: ParsedCsvRow[] = [];
  for (let rIdx = 1; rIdx < validRecords.length; rIdx++) {
    const rowValues = validRecords[rIdx];
    const rowNumber = rIdx + 1; // 1-indexed line number in spreadsheet
    const rowData: Record<string, string> = {};

    headers.forEach((header, colIdx) => {
      rowData[header] = (rowValues[colIdx] ?? '').trim();
    });

    rows.push({
      rowNumber,
      data: rowData,
      raw: rowValues.join(','),
    });
  }

  return { headers, rows, parseErrors };
}

/**
 * Normalizes email address (lowercase, trim)
 */
export function normalizeEmail(email?: string): string {
  if (!email) return '';
  return email.trim().toLowerCase();
}

/**
 * Normalizes phone numbers (removes spaces, dashes, brackets)
 */
export function normalizePhone(phone?: string): string {
  if (!phone) return '';
  return phone.replace(/[\s\-\(\)\.]/g, '').trim();
}

/**
 * Normalizes status values ('active', 'inactive', 'disabled')
 */
export function normalizeStatus(status?: string, defaultStatus = 'active'): 'active' | 'inactive' | 'disabled' {
  if (!status) return defaultStatus as any;
  const s = status.trim().toLowerCase();
  if (s === 'active') return 'active';
  if (s === 'inactive') return 'inactive';
  if (s === 'disabled') return 'disabled';
  return defaultStatus as any;
}
