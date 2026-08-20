export function _assert(cond, msg) {
    msg = `ERRO FATAL: ${msg}`;
    if (Boolean(cond)) {
        return;
    }
    throw new Error(msg);
}

export function planos_iguais(ob1, ob2) {
    if (ob1.eh_vazio != ob2.eh_vazio) return false;
    let [p1, p2] = [ob1.plano, ob2.plano];
    if (p1.length !== p2.length) return false;
    
    function objectToSortedString(obj) {
        return JSON.stringify(Object.keys(obj).sort().reduce((acc, key) => {
            acc[key] = obj[key];
            return acc;
        }, {}));
    }
    
    const set1 = new Set(p1.map(objectToSortedString));
    const set2 = new Set(p2.map(objectToSortedString));
    
    if (set1.size !== set2.size) return false;
    
    for (let item of set1) {
        if (!set2.has(item)) return false;
    }
    
    return true;
}
