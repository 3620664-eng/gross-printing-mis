export async function exportRowsToExcel<T extends Record<string, unknown>>(
  filename: string,
  sheetName: string,
  rows: T[]
) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const sheetData = [
    keys.map((key) => ({ value: key, type: String, fontWeight: "bold" as const })),
    ...rows.map((row) =>
      keys.map((key) => {
        const value = row[key];
        if (value === null || value === undefined) return null;
        if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
        return JSON.stringify(value);
      })
    )
  ];
  await writeXlsxFile(sheetData, {
    sheet: sheetName,
    columns: keys.map(() => ({ width: 22 }))
  }).toFile(filename);
}

export async function importRowsFromExcel<T extends Record<string, unknown>>(file: File) {
  const { readSheet } = await import("read-excel-file/browser");
  const rows = await readSheet(file);
  const [headerRow, ...bodyRows] = rows;
  if (!headerRow) return [];
  const headers = headerRow.map((cell, index) => String(cell || `Column ${index + 1}`));
  return bodyRows.map((row) => {
    return headers.reduce<Record<string, unknown>>((record, header, index) => {
      record[header] = row[index] ?? "";
      return record;
    }, {}) as T;
  });
}
