import { _assert } from './utils.js';

export async function post_plano(plano_object) {
    console.log("Modo local: plano não salvo (sem backend)");
    return { ok: true };
}

export async function fetch_plano(matricula) {
    console.log("Modo local:返回 plano vazio");
    return { plano: [], eh_vazio: false };
}
