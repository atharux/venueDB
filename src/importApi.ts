// Browser-side spreadsheet parser.
//
// Works identically in `npm run dev` and on Cloudflare Pages — no backend,
// no Python, no /api/parse-sheet call. Uses `read-excel-file` (~150 KB,
// loaded lazily on first import) for .xlsx, and the existing
// `parseSpreadsheetText` for CSV/TSV/semicolon.
//
// Downstream API (`parseSpreadsheetRows(matrix, fileName)`) is unchanged,
// so every caller keeps working without edits.

import readXlsxFile from 'read-excel-file'
import { parseSpreadsheetRows, parseSpreadsheetText, type ImportedLeadRow } from './importCsv'

export async function parseUploadedSpreadsheet(file: File): Promise<ImportedLeadRow[]> {
  const lowerName = file.name.toLowerCase()

  // Legacy .xls (BIFF) — read-excel-file does not support it. Give the user
  // a clear, actionable error instead of failing silently.
  if (lowerName.endsWith('.xls')) {
    throw new Error(
      'Old .xls format is not supported. Re-save the file as .xlsx or export it as .csv.',
    )
  }

  if (lowerName.endsWith('.xlsx')) {
    const rows = await readXlsxFile(file)
    const matrix = rows.map(row => row.map(cellToString))
    return parseSpreadsheetRows(matrix, file.name)
  }

  // .csv, .tsv, .txt, anything else text-shaped — handled by the existing
  // delimiter-detecting parser. No new dep, no network call.
  const text = await file.text()
  return parseSpreadsheetText(text, file.name)
}

/**
 * Coerce a single spreadsheet cell to a string for the downstream pipeline.
 * read-excel-file yields `string | number | boolean | Date | null` per cell.
 */
function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return ''
  if (typeof cell === 'string') return cell
  if (typeof cell === 'number' || typeof cell === 'boolean') return String(cell)
  if (cell instanceof Date) return cell.toISOString()
  return String(cell)
}
