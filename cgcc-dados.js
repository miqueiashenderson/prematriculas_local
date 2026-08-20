import { fetch_alocacao } from './planilha-alocacao.js';

export const ESTE_PERIODO = "2026.1";
export const PROX_PERIODO = "2026.2";

let _alocacao_promise = null;
let _alocacao = null;

export async function get_alocacao() {
    if (_alocacao === null) {
        if (_alocacao_promise === null) {
            _alocacao_promise = fetch_alocacao(PROX_PERIODO);
        }
        _alocacao = await _alocacao_promise;
        window.a = _alocacao;
    }
    return _alocacao;
}

export function get_oferta() {
    if (!_alocacao) return new Set();
    return new Set(_alocacao.array.map(d => d.codigo));
}

const COMPLEMENTARES = new Set([
   '1411318', '1411382', '1411384',
]);

export function esta_na_oferta(codigo) {
    const oferta = get_oferta();
    return COMPLEMENTARES.has(codigo) || oferta.has(codigo);
}

export function esta_na_sondagem(codigo) {
    return false;
}

const DISPENSAS = {};

const MIGRADOS = [];

export function migrou_de_grade(matricula) {
    return MIGRADOS.includes(matricula);
}

export function dispensas(matricula) {
    let disps = [];
    (DISPENSAS[matricula] || []).forEach(codigo => {
        disps.push({
            matricula_do_estudante: matricula,
            codigo_da_disciplina: codigo,
            nome_da_disciplina: "_DISPENSADA",
            periodo: ESTE_PERIODO,
            status: 'Aprovado',
        });
    });
    return disps;
}

export const Status = Object.freeze({
  PENDENTE: 'PENDENTE',
  PLANEJADA: 'PLANEJADA',
  EM_CURSO: 'EM_CURSO',
  APROVADO: 'APROVADO',
});

export function status_planeje(status_sigaa) {
    let s = Status.PENDENTE;
    if (status_sigaa === "Em Curso") s = Status.EM_CURSO;
    else if (status_sigaa === "Aprovado") s = Status.APROVADO;
    else if (status_sigaa === "Aprovado Por Nota") s = Status.APROVADO;
    else if (status_sigaa === "Transferido") s = Status.APROVADO;
    else if (status_sigaa === "Excluida") s = Status.PENDENTE;
    else if (status_sigaa === "Dispensado") s = Status.APROVADO;
    return s;
}

export function tipo_planeje(tipo_bd) {
    if (tipo_bd === "obr") return "OBRIGATORIA";
    else if (tipo_bd === "opt") return "OPTATIVA";
    else if (tipo_bd === "opE") return "OPTATIVA_ESPECIFICA";
    else if (tipo_bd === "opG") return "OPTATIVA_GERAL";
    else if (tipo_bd === "---") return "EQUIVALENTE";
    else if (tipo_bd === "cmp") return "COMPLEMENTAR";
    console.log(`ERRO: tipo de registro inválido: ${tipo_bd}`);
    return;
}

export const statusValues = Object.values(Status);

export const TOTAL_HORAS_EXIGIDO = 3270

export const COL_CODIGO = 0;
export const COL_PERIODO = 1;
export const COL_TIPO = 2;
export const COL_NOME = 3;
export const COL_CREDITOS = 4;
export const COL_HORAS = 5;
export const COL_PRE_REQUISITOS = 6;
export const COL_CORREQUISITOS = 7;

export const TIPOS_OPT = ["OPTATIVA", "OPTATIVA_GERAL", "OPTATIVA_ESPECIFICA"];

export let eh_optativa = disc => TIPOS_OPT.includes(disc.tipo);

export let equivalente = arg => {
    let codigo = arg.codigo || arg;
    return EQUIVALENCIAS[String(codigo)];
}

export const EQUIVALENCIAS = {
  "1109103": "1109126",
  "1109053": "1109131",
  "1411328": "1411244",
  "1411305": "1411172",
  "1411306": "1411179",
  "1411182": "1411379",
  "1305218": "1411383",
  "1302123": "1411366",
  "1411326": "1411377",
  "1411329": "1411367",
  "1411335": "1411378",
  "1301123": "1411367",
  "1411351": "1411364",
  "1411356": "1411365",
  "1411350": "1411368",
  "1411357": "1411369",
  "1411362": "1411370",
  "1411363": "1411371",
  "1411359": "1411373",
  "1411352": "1411374",
  "1411358": "1411375",
  "1411360": "1411377",
  "1411361": "1411380",
  "1411355": "1411381",
  "1411302": "1411376",
  "1411344": "1411374",
  "1411209": "1411372"
};

export const EQUIV = {
    2017: {
      "1109103": "1109126",
      "1109053": "1109131",
      "1411328": "1411244",
      "1411172": "1411305",
      "1411179": "1411306",
      "1411383": "1305218",
    },
    2023: {
      "1411305": "1411172",
      "1411306": "1411179",
      "1411182": "1411379",
      "1305218": "1411383",
      "1302123": "1411366",
      "1411326": "1411377",
      "1411329": "1411367",
      "1411335": "1411378",
      "1301123": "1411367",
      "1411351": "1411364",
      "1411356": "1411365",
      "1411350": "1411368",
      "1411357": "1411369",
      "1411362": "1411370",
      "1411363": "1411371",
      "1411359": "1411373",
      "1411352": "1411374",
      "1411358": "1411375",
      "1411360": "1411377",
      "1411361": "1411380",
      "1411355": "1411381",
      "1411302": "1411376",
      "1411344": "1411374",
      "1411209": "1411372"
    }
};

export let REV_EQUIVALENCIAS = Object.fromEntries(
    Object.entries(EQUIVALENCIAS).map(([k, v]) => [v, k] )
);

export let REV_EQUIV = {
    2017: Object.fromEntries(Object.entries(EQUIV[2017]).map(([k, v]) => [v, k])),
    2023: Object.fromEntries(Object.entries(EQUIV[2023]).map(([k, v]) => [v, k])),
}
