import { CSVMatrix } from 'https://cdn.jsdelivr.net/npm/csvmatrix@0.1.3/csvmatrix.js';

export async function fetch_grade(curriculo) {
    const url = `data/grade${curriculo}.csv`;
    let response;
    try {
        response = await fetch(url);
        if (!response.ok) {
            return null;
        }
    } catch (err) {
        console.error('Error:', err);
        alert("ERRO FATAL: grade curricular não disponível");
        return;
    }

    let text = await response.text();
    let rows = text.split('\n').map(line => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (const ch of line) {
            if (ch === '"') { inQuotes = !inQuotes; }
            else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
            else { current += ch; }
        }
        result.push(current);
        return result;
    });
    const ordemIdx = rows[0].indexOf('ordem');
    const sortedRows = rows.slice(1).sort(
        (a, b) => parseInt(a[ordemIdx], 10) - parseInt(b[ordemIdx], 10)
    );
    const raw_csv = [rows[0], ...sortedRows].map(row => row.join(',')).join('\n').trim();
    let grade = new CSVMatrix(raw_csv, {
        header: true,
        delim: ',',
        keys: [0],
    });
    return grade;
}
