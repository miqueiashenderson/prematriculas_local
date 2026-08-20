import { CSVMatrix } from 'https://cdn.jsdelivr.net/npm/csvmatrix@0.1.3/csvmatrix.js';

export async function fetch_alocacao(periodo) {
    const url = `data/alocacao-${periodo}.csv`;
    let response;
    try {
        response = await fetch(url);
        if (!response.ok) {
            return null;
        }
    } catch (err) {
      console.error('Error:', err);
      return null;
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
    if (rows.length === 0) return null;
    let data = { values: rows };
    const raw_csv = data.values.map(row => row.join(',')).join('\n');
    let alocacao = new CSVMatrix(raw_csv, {
        header: true,
        delim: ',',
    });

    let defaults = (row) => {
        let codigo = row.codigo || row.código || "—";
        let sigla = row.sigla || "—";
        let prof = row.prof || row.professor || "—";
        let local = row.local || row.sala || "—";
        let periodo = row.periodo || row.período || "E";
        let aulas = row.aulas || "X18";
        let nturma = row.nturma || row.turma || "—";
        return [codigo, sigla, prof, local, periodo, aulas, nturma];
    };

    const fixed_headers = ["codigo", "sigla", "prof", "local", "periodo", "aulas", "nturma"];
    const csv = [fixed_headers, ...alocacao.array.map(defaults)].map(row => row.join(',')).join('\n');
    let alocacao_final = new CSVMatrix(csv, {
        header: true,
        delim: ',',
        keys: [0, 6],
    });
    return alocacao_final;
}
