import { TOTAL_HORAS_EXIGIDO, Status, ESTE_PERIODO, PROX_PERIODO, get_alocacao } from './cgcc-dados.js';
import { post_plano } from './api.js';
import { planos_iguais } from './utils.js';
import { turma_store, turmas_da_disciplina, turma_label, seleciona_turma, horario_de } from './turma-store.js';

function td(texto) {
    let $td = document.createElement("td");
    $td.innerText = texto;
    return $td;
}

function screen_status(from_status, to_status) {
    const messages = {
        APROVADO: `Aprovado em ${ESTE_PERIODO}`,
        EM_CURSO: `Em curso em ${ESTE_PERIODO}`,
        EM_CURSO_to_PENDENTE: `Não fui aprovado em ${ESTE_PERIODO}. NÃO QUERO MATRICULAR em ${PROX_PERIODO}`,
        EM_CURSO_to_PLANEJADA: `Não fui aprovado em ${ESTE_PERIODO}. QUERO MATRICULAR em ${PROX_PERIODO}`,
        PENDENTE_to_PLANEJADA: `QUERO MATRICULAR em ${PROX_PERIODO}`
    };
    let msg = messages[to_status] ?? messages[`${from_status}_to_${to_status}`] ?? to_status;
    return msg;
}

function lista_problemas($grade) {
    let problemas = [];
    let em_curso = $grade.num_em_curso;
    if (em_curso) {
        problemas.push(`ainda há ${em_curso} disciplinas sem definição em ${ESTE_PERIODO}`);
    }
    let num_creditos_planejados = $grade.creditos_planejados;
    if (num_creditos_planejados < 16 && $grade.horas_planejadas < TOTAL_HORAS_EXIGIDO) {
        problemas.push("plano de matrícula ABAIXO do mínimo obrigatório (16 créditos)");
    }
    if (num_creditos_planejados > 24) {
        problemas.push("plano de matrícula ACIMA do máximo permitido (24 créditos)");
    }
    return problemas;
}

class PlanoMatriculasElement extends HTMLElement {
    constructor() { super(); }

    connectedCallback() {
        this.innerHTML = `
            <h2>Plano de matrícula para ${PROX_PERIODO}</h2>
            <ul id="problemas"></ul>
            <table id="plano-discs">
                <thead>
                <tr>
                    <td>Código</td>
                    <td>Turma</td>
                    <td>Disciplina</td>
                    <td>Status planejado</td>
                </tr>
                </thead>
                <tbody></tbody>
            </table>
            <div class="rodape">
                <div id="somas">
                    <span id="horas-integralizadas"></span> 
                    <span id="horas-planejadas"></span>
                    <span id="creditos-a-matricular"></span>
                    <span id="creditos-faltantes"></span>
                </div>
                <div id="buttons">
                    <span>
                        <label for="plano-vazio">Não vou matricular disciplinas em ${PROX_PERIODO}</label>
                        <input type="checkbox" id="plano-vazio" name="plano-vazio" value="checked">
                    </span>
                    &nbsp;&nbsp;
                    <button id="save-plano" disabled>Salvar plano</button>
                </div>
            </div>
        `;
        this.$horas_integralizadas = this.querySelector("#horas-integralizadas");
        this.$horas_planejadas = this.querySelector("#horas-planejadas");
        this.$creditos_faltantes = this.querySelector("#creditos-faltantes");
        this.$creditos_a_matricular = this.querySelector("#creditos-a-matricular");
        this.$plano_discs = this.querySelector("#plano-discs");
        this.$plano_discs_body = this.$plano_discs.querySelector("tbody");
        this.$problemas = this.querySelector("#problemas");
        this.$plano_vazio = this.querySelector("#plano-vazio");
        this.$save_button = this.querySelector("#save-plano");
        this.$somas = this.querySelector("#somas");
        this.$grade = document.querySelector("cgcc-grade");

        this.$plano_vazio.addEventListener("change", (ev) => {
            let planejadas = this.plano_object.plano.filter(it => it.status == "PLANEJADA");
            if (this.$plano_vazio.checked && planejadas.length > 0) {
                let confirma = confirm("Ignorar o plano de matrículas atual?");
                if (!confirma) {
                    this.$plano_vazio.checked = false;
                    this.$plano_vazio.motivo = null;
                    return;
                }
            }
            if (this.$plano_vazio.checked) {
                this.$plano_vazio.motivo = prompt("Por qual motivo?")
            } else {
                this.$plano_vazio.motivo = null;
            }
            this.update();
        });

        this.$save_button.addEventListener("click", async () => {
            alert("Modo local: plano não é salvo (sem backend).");
        });
    }

    update() {
        function update_extras(that, problemas) {
            let $grade = that.$grade;
            let horas_integralizadas = $grade.horas_integralizadas;
            let horas_planejadas = $grade.horas_planejadas;
            let creditos_faltantes = ((TOTAL_HORAS_EXIGIDO - horas_planejadas) / 15).toFixed(0);
            let percentagem = (100 * (horas_planejadas / TOTAL_HORAS_EXIGIDO)).toFixed(1);
            let creditos_a_matricular = $grade.creditos_planejados;

            that.querySelector("#horas-planejadas").innerHTML = `&nbsp;&nbsp;●&nbsp;&nbsp; ${horas_planejadas} horas planejadas (${percentagem}% do curso)`;
            that.querySelector("#horas-integralizadas").innerText = `${$grade.horas_integralizadas} horas integralizadas`
            that.querySelector("#creditos-a-matricular").innerHTML = `&nbsp;&nbsp;●&nbsp;&nbsp; ${creditos_a_matricular} créditos planejados`;
            that.querySelector("#creditos-faltantes").innerHTML = `&nbsp;&nbsp;●&nbsp;&nbsp; faltam ${creditos_faltantes} créditos`;

            let os_planos_sao_iguais = planos_iguais(that.plano_object, window.saved_plano_object);
            let ha_problemas = problemas.length > 0;
            that.$save_button.disabled = os_planos_sao_iguais || ha_problemas;
        }

        this.$plano_discs.innerHTML = `
                <thead>
                <tr>
                    <td>Código</td>
                    <td>Turma</td>
                    <td>Disciplina</td>
                    <td>Status planejado</td>
                </tr>
                </thead>
                <tbody></tbody>`;
        this.$plano_discs_body = this.$plano_discs.querySelector("tbody");

        if (this.$plano_vazio.checked) {
            let $row = document.createElement("tr");
            $row.innerHTML = `<td id="plano-vazio" colspan="4">Sem plano de matrícula para ${PROX_PERIODO}. Motivo: <i>${this.$plano_vazio.motivo}</i></td>`;
            this.$plano_discs_body.append($row);
            this.$problemas.style.display = "none";
            this.$grade.style.display = "none";
            this.$somas.style.visibility = "hidden";
            update_extras(this, []);
            return;
        } else {
            this.$problemas.style.display = "";
            this.$grade.style.display = "";
            this.$somas.style.visibility = "visible";
        }

        this.plano_object.plano.sort((d1, d2) => d1.status.localeCompare(d2.status));
        this.plano_object.plano.forEach(item => {
            if (item.status == "PENDENTE") return;
            let $row = document.createElement("tr");
            $row.classList.add(item.status);
            let $disc = this.$grade.disc_element(item.codigo);
            if (!$disc) return;
            let saved_status = $disc.model.saved_status || 'PENDENTE';
            let $td_turma;
            if (item.status == Status.PLANEJADA) {
                $td_turma = document.createElement("td");
                $td_turma.className = "turma-cell";
            } else {
                $td_turma = document.createElement("td");
                $td_turma.innerText = "—";
            }
            $row.append(td(item.codigo));
            $row.append($td_turma);
            $row.append(td(item.nome));
            $row.append(td(screen_status(saved_status, item.status)));
            this.$plano_discs_body.append($row);

            if (item.status == Status.PLANEJADA) {
                this.monta_select_turma($td_turma, item.codigo);
            }
        });

        this.$problemas.innerHTML = "";
        let problemas = lista_problemas(this.$grade);
        problemas.forEach((problema, i) => {
            let $li = document.createElement("li");
            $li.innerText = `erro ${i + 1}: ${problema}`;
            this.$problemas.appendChild($li);
        });
        update_extras(this, problemas);
    }

    monta_select_turma($td, codigo) {
        (async () => {
            const turmas = await turmas_da_disciplina(codigo);
            const $select = document.createElement("select");
            $select.className = "turma-select";
            $select.append(new Option("— qualquer turma —", ""));
            turmas.forEach(t => {
                $select.append(new Option(turma_label(t), t.nturma));
            });
            const antiga = turma_store.get(codigo);
            if (antiga) { $select.value = antiga.nturma; }
            $select.addEventListener("change", () => {
                const chosen = turmas.find(t => t.nturma === $select.value) || null;
                seleciona_turma(codigo, chosen);
                this.$save_button.disabled = false;
            });
            $td.append($select);
        })();
    }

    set plano_object(plano_object) {
        this._plano_object = plano_object;
        (plano_object.plano || []).forEach(item => {
            if (item.codigo && item.turma) {
                turma_store.set(item.codigo, item.turma);
            }
        });
        if (this._plano_object?.eh_vazio) {
            this.$plano_vazio.checked = true;
            this.$plano_vazio.motivo = this._plano_object.motivo;
        }
        this.update();
    }

    get plano_object() {
        this._plano_object.eh_vazio = this.eh_vazio;
        this._plano_object.motivo = this.$plano_vazio.motivo;
        this._plano_object.plano.forEach(item => {
            if (item.status == Status.PLANEJADA) {
                const t = turma_store.get(item.codigo);
                if (t) { item.turma = horario_de(t); }
            }
        });
        return this._plano_object;
    }

    get eh_vazio() {
        return this.$plano_vazio.checked;
    }
}

customElements.define('cgcc-plano-matriculas', PlanoMatriculasElement);
