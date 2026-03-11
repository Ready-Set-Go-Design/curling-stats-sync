import { CsvRow } from './types';

function normalizeLineEndings(input: string): string {
    return input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function parseCsv(input: string): CsvRow[] {
    const text = normalizeLineEndings(input).trim();

    if (!text) {
        return [];
    }

    const rows: string[][] = [];
    let current = '';
    let row: string[] = [];
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const next = text[index + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                current += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            row.push(current);
            current = '';
            continue;
        }

        if (char === '\n' && !inQuotes) {
            row.push(current);
            rows.push(row);
            row = [];
            current = '';
            continue;
        }

        current += char;
    }

    row.push(current);
    rows.push(row);

    const [headerRow, ...dataRows] = rows;
    const headers = headerRow.map((header) => header.trim());

    return dataRows
        .filter((dataRow) => dataRow.some((cell) => cell.trim() !== ''))
        .map((dataRow) => {
            const mapped: CsvRow = {};

            headers.forEach((header, headerIndex) => {
                mapped[header] = (dataRow[headerIndex] ?? '').trim();
            });

            return mapped;
        });
}
