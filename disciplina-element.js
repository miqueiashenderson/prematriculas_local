import { Status, statusValues, esta_na_oferta } from './cgcc-dados.js';
import { ESTE_PERIODO, PROX_PERIODO } from './cgcc-dados.js';
import { _assert } from './utils.js';

const CICLO_STATUS = {
    'PERIODO_PASSADO': [Status.APROVADO],
    'PERIODO_CORRENTE': [Status.EM_CURSO, Status.APROVADO, Status.PENDENTE],
    'PERIODO_FUTURO': [Status.PENDENTE, Status.PLANEJADA]
};

class DisciplinaGradeElement extends HTMLElement {

    constructor() {
        super();
        this.codigo = '';
        this.nome = '';
        this.model = {
            codigo: '',
            nome: '',
            obs: '',
            periodo: '',
            tipo: '',
            status: Status.PENDENTE,
            equivalente: false,
            classes: [],
        };
        this.pre = new Set();
        this.pos = new Set();
        this.$corrs = new Set();
        this.$grade = null;
    }

    connectedCallback() {
        _assert(this.model, "DisciplinaGradeElement conectado ao DOM sem model");
        this.$grade = this.closest("cgcc-grade");
        if (this.$grade === null) {
            throw new Error("DisciplinaGradeElement não descende de um GradeElement ");
            return;
        }
        this.innerHTML = `
            <style>
                cgcc-grade-disc {
                    padding: 0.8em;
                    border: 2px solid var(--cor-PENDENTE);
                    border-radius: 5px;
                    font-size: 8pt;
                    line-clamp: 2;
                    text-overflow: ellipsis;
                    color: lightgray;
                    user-select: none;
                }
                cgcc-grade-disc p { margin: 0; overflow: hidden; }
                cgcc-grade-disc.PENDENTE { background: white; border-color: var(--cor-PENDENTE); color: lightgray; }
                cgcc-grade-disc.PLANEJADA { background: var(--cor-PLANEJADA); border-color: black; color: black; }
                .MATRICULADA { position: relative; }
                .MATRICULADA::after { content: "*"; position: absolute; top: 0; right: 0; font-size: 14px; color: red; background-color: transparent; padding: 2px 4px; border-radius: 3px; z-index: 10; }
                cgcc-grade-disc.EM_CURSO { background: var(--cor-EM_CURSO); border-color: black; color: black; }
                cgcc-grade-disc.APROVADO { background: var(--cor-APROVADO); border-color: white; color: white; }
                cgcc-grade-disc.APROVADO.OPT_GERAL, cgcc-grade-disc.APROVADO.OPT_ESPECIFICA { background: #98AFC7; }
                cgcc-grade-disc:hover { transform: scale(1.12); z-index: 100; border: 2px black solid; color: black; box-shadow: 0px 0px 5px 0px rgba(0,0,0,0.75); }
                cgcc-grade-disc.pre, cgcc-grade-disc.pos { transform: scale(1.06); border: 3px darkred solid; filter: brightness(110%); color: black; }
                cgcc-grade-disc.pos { transform: scale(1.06); filter: brightness(110%); color: black; border: 3px darkgreen solid; }
                cgcc-grade-disc { display: grid; grid-template-rows: 1fr auto; }
                disc-rodape { display: flex; justify-content: space-between; font-size: 85%; filter: brightness(110%); }
                .APROVADO.OPTATIVA, .APROVADO.OPTATIVA_GERAL { background-color: #a0b0c0 !important; }
                .APROVADO.OPTATIVA_ESPECIFICA { background-color: #a0c0a0 !important; }
                cgcc-grade-disc.dis-PLANEJADA { background: color-mix(in srgb, var(--cor-PLANEJADA), white 60%); border-color: black; color: black; }
                cgcc-grade-disc.EQUIVALENTE { border: 2px dashed black; }
                cgcc-grade-disc.PENDENTE.dis-NA_OFERTA, cgcc-grade-disc.PENDENTE.NA_OFERTA { border-color: #444; }
            </style>
            <cgcc-grade-disc-nome>${this.nome}</cgcc-grade-disc-nome>
            <disc-rodape></disc-rodape>
        `;

        this.$nome = this.querySelector("cgcc-grade-disc-nome");
        this.$rodape = this.querySelector("disc-rodape");

        this.update_model({ codigo: this.codigo, nome: this.nome });

        this.model.saved_status = this.model.saved_status || this.model.status;
        if (this.model.saved_status === Status.EM_CURSO) {
            this.model.classes.push("A_CONFIRMAR");
        }
        if (this.model.eh_equivalente) {
            this.model.classes.push("EQUIVALENTE");
        }

        this.update();

        this._clickTimeout = null;
        this.addEventListener("status-change", (ev) => {
            let new_status = ev.detail.new_status;
            let old_status = ev.detail.old_status;
            this.classList.add(new_status);
            this.classList.remove(old_status);
            this.model.status = new_status;
        });
        this.addEventListener("click", () => {
            if (this._clickTimeout) {
                clearTimeout(this._clickTimeout);
                this._clickTimeout = null;
            }
            this._clickTimeout = setTimeout(() => {
                if (this.model.disabled) {
                    alert(this.model.obs || "Disciplina não disponível para planejamento.");
                    return;
                }
                this.toggle_status();
                this.update();
            }, 200);
        });

        this.addEventListener("mouseover", () => {
            this.pre?.forEach($e => { $e.classList.add("pre"); });
            this.pos?.forEach($e => { $e.classList.add("pos"); });
        });

        this.addEventListener("mouseleave", () => {
            this.pre?.forEach($e => { $e.classList.remove("pre"); });
            this.pos?.forEach($e => { $e.classList.remove("pos"); });
        });
    }

    update_model(data) {
        Object.assign(this.model, data);
    }

    update() {
        if (["OPTATIVA", "OPTATIVA_GERAL", "OPTATIVA_ESPECIFICA"].includes(this.model.tipo)) {
            this.$nome.innerHTML = `${this.model.nome}`;
            if (this.model.nome != this.nome) {
                this.$nome.innerHTML += `<br>(${this.nome})`;
            }
        } else {
            this.$nome.innerText = `${this.model.nome}`;
        }
        this.classList.add(this.model.status);
        if (this.model.tipo) {
            this.classList.add(this.model.tipo);
        }
        if (this.model.saved_status == "EM_CURSO") {
            this.classList.add("A_CONFIRMAR");
            this.classList.add("MATRICULADA");
        }
        if (this.model.status == "PLANEJADA") {
            this.model.periodo = this.model.periodo || PROX_PERIODO;
        }
        this.$rodape.innerHTML = `<div>${this.model.horas}</div><div>${this.model.periodo}</div>`;
        if (this.model.eh_equivalente) {
            this.classList.add("EQUIVALENTE");
        }
        if (esta_na_oferta && esta_na_oferta(this.model.codigo)) {
            this.classList.add("NA_OFERTA");
        }
        if (this.model.trilhas) {
            this.model.trilhas.forEach(trilha => {
                this.classList.add(`trilha-${trilha}`);
            });
        }
    }

    eh_slot_optativa() {
        return this.codigo.startsWith("0000");
    }

    set_status(new_status) {
        let old_status = this.model.status;
        this.model.status = new_status;
        const status_change = new CustomEvent("status-change", {
            bubbles: true,
            detail: {
                codigo: this.model.codigo,
                nome: this.model.nome,
                new_status: new_status,
                old_status: old_status,
            }
        });
        this.dispatchEvent(status_change);
    }

    toggle_status() {
        if (this.model.codigo.startsWith('0000')) {
            alert("Para planejar optativas, escolha no quadro de optativas abaixo.");
            return;
        }

        const ciclo = [Status.PENDENTE, Status.APROVADO, Status.PLANEJADA];
        let idx = ciclo.indexOf(this.model.status);
        if (idx < 0) idx = 0;
        let new_status = ciclo[(idx + 1) % ciclo.length];

        this.set_status(new_status);
    }

    has_changed() {
        return this.model.saved_status != this.model.status;
    }

}

customElements.define('cgcc-grade-disc', DisciplinaGradeElement);
