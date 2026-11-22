import JSZip from 'jszip'

export type SpreadsheetSheet = { name: string; rows: string[][] }
const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

function columnIndex(reference = '') {
  const letters = reference.match(/[A-Z]+/i)?.[0]?.toUpperCase() ?? 'A'
  return [...letters].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1
}
function columnName(index: number) {
  let number = index + 1
  let value = ''
  while (number) {
    const remainder = (number - 1) % 26
    value = String.fromCharCode(65 + remainder) + value
    number = Math.floor((number - 1) / 26)
  }
  return value
}

function csvRows(source: string) {
  const rows: string[][] = [[]]
  let value = ''
  let quoted = false
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (char === '"' && quoted && source[index + 1] === '"') {
      value += '"'
      index++
    } else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) {
      rows.at(-1)!.push(value)
      value = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index++
      rows.at(-1)!.push(value)
      value = ''
      rows.push([])
    } else value += char
  }
  rows.at(-1)!.push(value)
  return rows.filter((row) => row.some((cell) => cell.length))
}

function nodeText(node: Element | null) {
  return node?.textContent?.replaceAll(/\r?\n/g, '') ?? ''
}

async function readXlsx(file: Blob) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('text')
  const shared = sharedXml
    ? Array.from(
        new DOMParser()
          .parseFromString(sharedXml, 'application/xml')
          .getElementsByTagNameNS(ns, 'si'),
        (item) => item.textContent ?? '',
      )
    : []
  const workbookXml = await zip.file('xl/workbook.xml')?.async('text')
  const names = workbookXml
    ? Array.from(
        new DOMParser()
          .parseFromString(workbookXml, 'application/xml')
          .getElementsByTagNameNS(ns, 'sheet'),
        (sheet) => sheet.getAttribute('name') ?? 'Sheet',
      )
    : []
  const files = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
  const sheets: SpreadsheetSheet[] = []
  for (const [sheetIndex, path] of files.entries()) {
    const xml = await zip.file(path)!.async('text')
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    if (document.querySelector('parsererror')) throw Error('This XLSX worksheet could not be read.')
    const rows: string[][] = []
    for (const row of Array.from(document.getElementsByTagNameNS(ns, 'row'))) {
      const number = Math.max(0, Number(row.getAttribute('r') ?? rows.length + 1) - 1)
      const output = rows[number] ?? []
      for (const cell of Array.from(row.getElementsByTagNameNS(ns, 'c'))) {
        const index = columnIndex(cell.getAttribute('r') ?? 'A1')
        const kind = cell.getAttribute('t')
        const raw = nodeText(cell.getElementsByTagNameNS(ns, 'v')[0] ?? null)
        output[index] =
          kind === 's'
            ? shared[Number(raw)] ?? ''
            : kind === 'inlineStr'
              ? nodeText(cell.getElementsByTagNameNS(ns, 't')[0] ?? null)
              : raw
      }
      rows[number] = output
    }
    sheets.push({ name: names[sheetIndex] ?? `Sheet ${sheetIndex + 1}`, rows })
  }
  return sheets.filter((sheet) => sheet.rows.some((row) => row.some(Boolean)))
}

export async function readSpreadsheet(file: File): Promise<SpreadsheetSheet[]> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'csv') return [{ name: 'CSV', rows: csvRows(await file.text()) }]
  if (ext !== 'xlsx') throw Error('This local spreadsheet converter supports .xlsx and .csv. Convert legacy .xls files to .xlsx first.')
  const sheets = await readXlsx(file)
  if (!sheets.length) throw Error('No readable spreadsheet rows were found.')
  return sheets
}

export async function makeXlsx(sheets: SpreadsheetSheet[]) {
  const zip = new JSZip()
  const valid = sheets.filter((sheet) => sheet.rows.length)
  if (!valid.length) throw Error('Add at least one worksheet row.')
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${valid.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  )
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${valid.map((sheet, index) => `<sheet name="${escapeXml(sheet.name.slice(0, 31) || `Sheet ${index + 1}`)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`,
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${valid.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`,
  )
  valid.forEach((sheet, sheetIndex) => {
    const body = sheet.rows
      .map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, index) => `<c r="${columnName(index)}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value ?? ''))}</t></is></c>`).join('')}</row>`)
      .join('')
    zip.file(
      `xl/worksheets/sheet${sheetIndex + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}"><sheetData>${body}</sheetData></worksheet>`,
    )
  })
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
