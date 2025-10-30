const fs = require('fs')
const path = require('path')

const INPUT_FILE = path.resolve(__dirname, '..', 'data.json')
const OUTPUT_DIR = path.resolve(__dirname, '..', 'data', 'csv')
const MISC_GROUP = 'GENERAL'

function loadRows(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const parsed = JSON.parse(raw)
  if (!parsed || !Array.isArray(parsed.rows)) {
    throw new Error('Unexpected input format: "rows" array missing')
  }
  return parsed.rows
}

function createEmptyGroup(name) {
  return {
    name,
    columns: [],
    columnSet: new Set(),
    rows: new Map(),
    columnLabels: new Map(),
  }
}

function registerColumn(group, key, label) {
  let finalKey = key
  let counter = 2
  while (group.columnSet.has(finalKey)) {
    finalKey = `${key}_${counter++}`
  }
  if (!group.columnSet.has(finalKey)) {
    group.columnSet.add(finalKey)
    group.columns.push(finalKey)
    if (label) group.columnLabels.set(finalKey, label)
  }
  return finalKey
}

function slugifyHeader(header) {
  if (!header || typeof header !== 'string') return 'COLUMN'
  const normalized = header
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized ? normalized.toUpperCase() : 'COLUMN'
}

function formatValue(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function getGroups(rows) {
  const groups = new Map()

  const getGroup = (name) => {
    if (!groups.has(name)) {
      groups.set(name, createEmptyGroup(name))
    }
    return groups.get(name)
  }

  rows.forEach((row, rowIndex) => {
    const id = rowIndex + 1
    const cells = Object.values(row || {})
    cells.forEach((cell) => {
      if (!cell || typeof cell !== 'object') return
      const headerRaw = cell.header ? String(cell.header).trim() : ''
      const valueRaw = formatValue(cell.value)

      const prefixMatch = headerRaw.match(/^([A-Za-z]+)(\d+)/)
      if (prefixMatch) {
        const prefix = prefixMatch[1].toUpperCase()
        const code = (prefixMatch[1] + prefixMatch[2]).toUpperCase()
        const group = getGroup(prefix)
        const columnKey = registerColumn(group, code, headerRaw)
        const rowEntry = group.rows.get(id) || { id }
        rowEntry[columnKey] = valueRaw
        group.rows.set(id, rowEntry)
        return
      }

      const miscGroup = getGroup(MISC_GROUP)
      const miscKey = registerColumn(miscGroup, slugifyHeader(headerRaw), headerRaw)
      const miscRowEntry = miscGroup.rows.get(id) || { id }
      miscRowEntry[miscKey] = valueRaw
      miscGroup.rows.set(id, miscRowEntry)
    })
  })

  return groups
}

function ensureRows(groups, totalRows) {
  groups.forEach((group) => {
    for (let id = 1; id <= totalRows; id += 1) {
      if (!group.rows.has(id)) {
        group.rows.set(id, { id })
      }
    }
  })
}

function sortColumns(group) {
  const codePattern = /^([A-Za-z]+)(\d+)$/
  if (group.name === MISC_GROUP) return group.columns
  return group.columns.slice().sort((a, b) => {
    const matchA = a.match(codePattern)
    const matchB = b.match(codePattern)
    if (matchA && matchB) {
      if (matchA[1] === matchB[1]) {
        return Number(matchA[2]) - Number(matchB[2])
      }
      return matchA[1].localeCompare(matchB[1])
    }
    return a.localeCompare(b)
  })
}

function toCsv(group, totalRows) {
  const orderedColumns = ['id', ...sortColumns(group)]
  const lines = []
  const headerLine = orderedColumns
    .map((key) => key.replace(/"/g, '""'))
    .map((key) => `"${key}"`)
    .join(',')
  lines.push(headerLine)

  for (let id = 1; id <= totalRows; id += 1) {
    const row = group.rows.get(id) || { id }
    const values = orderedColumns.map((column) => {
      const raw = column === 'id' ? String(id) : row[column] || ''
      const escaped = String(raw).replace(/"/g, '""')
      return `"${escaped}"`
    })
    lines.push(values.join(','))
  }

  return lines.join('\n')
}

function writeCsvFiles(groups, totalRows, outDir) {
  fs.mkdirSync(outDir, { recursive: true })
  groups.forEach((group, name) => {
    const csv = toCsv(group, totalRows)
    const fileName = `${name.toLowerCase()}.csv`
    const filePath = path.join(outDir, fileName)
    fs.writeFileSync(filePath, csv, 'utf8')
  })
}

function writeColumnMetadata(groups, outDir) {
  const meta = {}
  groups.forEach((group, name) => {
    const details = {}
    group.columns.forEach((columnKey) => {
      if (group.columnLabels.has(columnKey)) {
        details[columnKey] = group.columnLabels.get(columnKey)
      }
    })
    meta[name] = details
  })

  const metaPath = path.join(outDir, '_column_labels.json')
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
}

function main() {
  const rows = loadRows(INPUT_FILE)
  const groups = getGroups(rows)
  ensureRows(groups, rows.length)
  writeCsvFiles(groups, rows.length, OUTPUT_DIR)
  writeColumnMetadata(groups, OUTPUT_DIR)
  console.log(`Exported ${groups.size} CSV files to ${OUTPUT_DIR}`)
}

if (require.main === module) {
  try {
    main()
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}
