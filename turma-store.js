import { get_alocacao } from './cgcc-dados.js';

export const turma_store = new Map();

export async function turmas_da_disciplina(codigo) {
    const alocacao = await get_alocacao();
    if (!alocacao) return [];
    return alocacao.array.filter(row => row.codigo === codigo);
}

export function turma_label(t) {
    const partes = [t.nturma, t.prof, t.local, t.aulas].filter(x => x && x !== "—");
    return partes.join(" · ");
}

export function seleciona_turma(codigo, turma) {
    if (turma) {
        turma_store.set(codigo, turma);
    } else {
        turma_store.delete(codigo);
    }
}

export const horario_de = t => ({
    nturma: t?.nturma,
    prof: t?.prof,
    local: t?.local,
    aulas: t?.aulas,
    periodo: t?.periodo,
});
