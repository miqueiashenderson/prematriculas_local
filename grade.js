import { CSVMatrix } from 'https://cdn.jsdelivr.net/npm/csvmatrix@0.1.3/csvmatrix.js';

import { Status, eh_optativa, EQUIV, REV_EQUIV, equivalente, tipo_planeje, COL_TIPO, TOTAL_HORAS_EXIGIDO, esta_na_oferta, esta_na_sondagem, COL_CODIGO, COL_NOME, COL_PRE_REQUISITOS, ESTE_PERIODO, PROX_PERIODO } from './cgcc-dados.js';
import { _assert } from './utils.js';
import { fetch_grade } from './planilha-grade.js';
import './disciplina-element.js';

const DEBUG = localStorage.getItem('DEBUG') == 'true';

class GradeElement extends HTMLElement {
    constructor() {
        super();
        this.ano = this.getAttribute("ano");
        this.promise_grade = this.fetch_grade();

        let grade = this;
        this.outras = [];

        this.promise_historico = new Promise(async (resolve) => {
            grade.promise_grade.then(() => {
                (async function check_for_historico() {
                    if (!grade._historico || !grade.grade || !grade.grade.array) {
                        setTimeout(check_for_historico, 100);
                        return;
                    }
                    await grade.renderiza_opcionais();
                    await grade.renderiza_historico();
                    grade.atualiza_status_opcionais();
                    grade.sincroniza_slots_optativas();
                    grade.filtra_opcionais();
                    resolve();
                }());
            });
        });

        this.promise_plano = new Promise((resolve) => {
            grade.promise_historico.then(() => {
                (function check_for_plano() {
                    if (!grade._plano) {
                        setTimeout(check_for_plano, 100);
                        return;
                    }
                    grade.renderiza_plano();
                    grade.atualiza_na_oferta_grade_principal();
                    grade._periodo = ESTE_PERIODO;
                    grade.update();
                    resolve();
                }());
            });
        });
    }

    async connectedCallback() {
        this.innerHTML = `<p>...</p>`;
        this.grade = await this.promise_grade;
        if (this.grade == null) {
            alert(`A grade 2017 não estará mais ativa a partir de 2026.1. Se você não precisa cursar nenhuma disciplina no próximo período, você não precisa fazer a pré-matrícula (lembre que TCC e as Atividades Complementares NÃO SÃO disciplinas). Mas, se você precisa cursar alguma disciplina, precisará pedir a migração para a grade nova. Para isso, use o formulário disponibilizado.`);
            return;
        }
        this.innerHTML = `
            <style>
                :root {
                  --cor-PENDENTE: #F0F0F0;
                  --cor-PLANEJADA: #B0E0E6;
                  --cor-EM_CURSO: #FFFACD;
                  --cor-APROVADO: #c0c0c0;
                }

                cgcc-grade-container {
                    box-sizing: border-box;
                    display: grid;
                    grid-template-columns: repeat(9, minmax(8em, 1fr));
                    grid-template-rows: repeat(6, minmax(60px, 1fr));
                    grid-gap: 1em;
                    padding: 1em;
                }

                cgcc-opcionais-container {
                    box-sizing: border-box;
                    display: grid;
                    grid-template-columns: repeat(9, minmax(8em, 1fr));
                    grid-auto-rows: minmax(60px, 1fr);
                    grid-gap: 1em;
                    padding: 1em;
                }

                cgcc-grade-disc.NA_OFERTA, cgcc-grade-disc.dis-NA_OFERTA {
                    border: 1px solid #444;
                }
            </style>

            <!-- h3>Obrigatórias</h3 -->
            <cgcc-grade-container></cgcc-grade-container>

            <!-- h3>Optativas</h3 -->

            <fieldset>
              <legend>Optativas</legend>

              <div style="float: left;">
                  <label>
                    <input type="radio" name="mostrar" value="pra-voce" checked>
                    Habilitadas pra você
                  </label>

                  <label>
                    <input type="radio" name="mostrar" value="todas">
                    Todas
                  </label>
              </div>

              <!-- div style="float: left;">
                  <label>
                    <input type="checkbox" name="trilha" value="todas" checked>
                    todas
                  </label>

                  <label>
                    <input type="checkbox" name="trilha" value="es">
                    es
                  </label>

                  <label>
                    <input type="checkbox" name="trilha" value="infra">
                    infra
                  </label>

                  <label>
                    <input type="checkbox" name="trilha" value="gestao">
                    gestão
                  </label>

                  <label>
                    <input type="checkbox" name="trilha" value="ia">
                    ia
                  </label>

                  <label>
                    <input type="checkbox" name="trilha" value="pos">
                    pós
                  </label>
              </div -->
            </fieldset>
            <cgcc-opcionais-container></cgcc-opcionais-container>
        `;
        this.$container = this.querySelector("cgcc-grade-container");
        this.$opcionais = this.querySelector("cgcc-opcionais-container");
        this.querySelectorAll('input[name="mostrar"]').forEach(radio => {
            radio.addEventListener('change', () => this.filtra_opcionais());
        });

        const trilhaCheckboxes = () => [...this.querySelectorAll('input[name="trilha"]')];

        trilhaCheckboxes().forEach(checkbox => {
            checkbox.addEventListener('change', (ev) => {
                if (ev.target.value === "todas" && ev.target.checked) {
                    trilhaCheckboxes()
                        .filter(cb => cb.value !== "todas")
                        .forEach(cb => cb.checked = false);
                } else if (ev.target.value !== "todas" && ev.target.checked) {
                    this.querySelector('input[name="trilha"][value="todas"]').checked = false;
                }

                const checked = trilhaCheckboxes().filter(cb => cb.checked);
                if (checked.length === 0) {
                    this.querySelector('input[name="trilha"][value="todas"]').checked = true;
                }

                this.filtra_opcionais();
            });
        });
        this.addEventListener("status-change", (ev) => {
            console.debug("verificando...");
            if (this.opts_disponiveis < 1 && this.horas_planejadas < TOTAL_HORAS_EXIGIDO) {
                console.debug("OPA! Precisa de mais uma optativa");
            }
            this.atualiza_status_opcionais();
            this.sincroniza_slots_optativas();
            this.filtra_opcionais();
        });
        this.update();
    }

    async update() {
        let _next = {};
        function next_row(periodo) {
            if (! _next[periodo]) {
                _next[periodo] = 0;
            }
            _next[periodo] += 1;
            return _next[periodo];
        }

        let discs_a_renderizar = this.grade.array.filter(disc => {
            // não renderizar optativas ou sem período (válido pra 2017 e 2023)
            // TODO: é pra ser OR ou AND abaixo?
            if (eh_optativa(disc) && disc.periodo == "-") { return false; }

            // não renderiza alternativas às obrigatórias (p/ transições de grade)
            // TODO: é pra ser OR ou AND abaixo?
            if (disc.tipo ===  "EQUIVALENTE" && disc.periodo == "-") { return false; }

            // qualquer outra deve ser renderizada
            return true;
        });
        
        this.renderizadas = {};
        discs_a_renderizar.forEach((disc, i) => {
            let $disc_existente = this.$container.querySelector(`#d${disc.codigo}`);
            if ($disc_existente) {
                return;
            }
            let $disc = document.createElement("cgcc-grade-disc");
            $disc.nome = disc.disciplina;
            $disc.codigo = disc.codigo;
            $disc.model.horas = disc.horas;
            $disc.model.creditos = disc.creditos;
            $disc.model.tipo = disc.tipo;
            $disc.id = `d${$disc.codigo}`;
            $disc.model.trilhas = new Set((disc.trilhas || "").split(" ").filter(e => e));
            $disc.style.gridColumn = disc.periodo;
            $disc.style.gridRow = next_row(disc.periodo);
            $disc.reqs = (disc.reqs || "").replace(":", " ").split(" ").filter(e => e);
            $disc.corr = (disc.corr || "").replace(":", " ").split(" ").filter(e => e);
            this.$container.appendChild($disc);
            this.renderizadas[$disc.codigo] = $disc;

            $disc.update();
        });

        let obrigatorias = Array.from(this.$container.children);

        // conecta pré e pós requisitos
        obrigatorias.forEach($disc => {
            $disc.reqs?.forEach(codigo => {
                let $pre = this.$container.querySelector(`#d${codigo}`);
                if (!$pre) return;
                $disc.pre.add($pre);
                $pre.pos.add($disc);
            });
        });

        // conecta correquisitos
        obrigatorias.forEach($disc => {
            $disc.corr?.forEach(codigo => {
                //console.log("====", $disc.nome, $disc.codigo);
                //console.log($disc.corr)
                $disc.corr.forEach(cod_corr => {
                    let $cor = this.$container.querySelector(`#d${cod_corr}`);
                    if (!$cor) {
                        console.warn(`correquisito não encontrado: ${cod_corr}`);
                        return;
                    }
                    $disc.$corrs.add($cor);
                    //console.log($cor.codigo, $cor.nome);
                });
                //console.log("----")
            });
        });

        // esconde status inválidos para this.periodo
        console.log("EXPERIMENTAL!");

        if (this.periodo == PROX_PERIODO) {
            Array.from(this.querySelectorAll('.dis-NA_OFERTA')).forEach($disc => {
                $disc.classList.replace('dis-NA_OFERTA', 'NA_OFERTA');
            });
        } else {
            Array.from(this.querySelectorAll('.NA_OFERTA')).forEach($disc => {
                $disc.classList.replace('NA_OFERTA', 'dis-NA_OFERTA');
            });
        }

        Array.from(this.querySelectorAll('.APROVADO, .EM_CURSO, .MATRICULADA, .PLANEJADA')).forEach($disc => {
            if ($disc.model.periodo > this.periodo) {
                // a disciplina é POSTERIOR ao período selecionado
                $disc.classList.replace('APROVADO', 'dis-APROVADO');
                $disc.classList.replace('EM_CURSO', 'dis-EM_CURSO');
                $disc.classList.replace('MATRICULADA', 'dis-MATRICULADA');
                $disc.classList.replace('PLANEJADA', 'dis-PLANEJADA');
            }
        })
        Array.from(this.querySelectorAll('.dis-APROVADO, .dis-EM_CURSO, .dis-MATRICULADA, .dis-PLANEJADA')).forEach($disc => {
            // a disciplina é ANTERIOR ou do próprio período selecionado
            if ($disc.model.periodo <= this.periodo) {
                $disc.classList.replace('dis-APROVADO', 'APROVADO')
                $disc.classList.replace('dis-EM_CURSO', 'EM_CURSO')
                $disc.classList.replace('dis-MATRICULADA', 'MATRICULADA')
                $disc.classList.replace('dis-PLANEJADA', 'PLANEJADA')
            }
        })

        this.filtra_opcionais();
    }

    renderiza_opcionais() {
        const todas_optativas = this.grade.array.filter(
            disc => eh_optativa(disc) && !disc.codigo.startsWith("0000") && disc.tipo !== "EQUIVALENTE"
        );

        todas_optativas.forEach((disc, index) => {
            let $disc = document.createElement("cgcc-grade-disc");
            $disc.nome = disc.disciplina;
            $disc.codigo = disc.codigo;
            $disc.model.horas = disc.horas;
            $disc.model.creditos = disc.creditos;
            $disc.model.tipo = disc.tipo;
            $disc.id = `opt${$disc.codigo}`;
            $disc.model.trilhas = new Set((disc.trilhas || "").split(" ").filter(e => e));

            $disc.reqs = (disc.reqs || "").replace(":", " ").split(" ").filter(e => e);
            $disc.corr = (disc.corr || "").replace(":", " ").split(" ").filter(e => e);

            if (esta_na_oferta(disc.codigo)) {
                $disc.model.periodo = PROX_PERIODO;
                $disc.classList.add("NA_OFERTA");
            }

            this.$opcionais.appendChild($disc);
            $disc.update();
        });

        const disciplinas_opcionais = Array.from(this.$opcionais.children);

        disciplinas_opcionais.forEach($disc => {
            $disc.reqs?.forEach(codigo => {
                let $pre = this.$container.querySelector(`#d${codigo}`);
                if (!$pre) return;
                $disc.pre.add($pre);
                $pre.pos.add($disc);
            });
        });
    }

    filtra_opcionais() {
        const opt_mostrar = document.querySelector('input[name="mostrar"]:checked').value;
        if (opt_mostrar === 'todas') {
            // exibir todas
            Array.from(this.$opcionais.querySelectorAll('cgcc-grade-disc'))
            .forEach($disc => { $disc.style.display = ""; });
            return;
        }

        if (this.periodo <= ESTE_PERIODO) {
            // período escolhido é anterior ao atual
            Array.from(this.$opcionais.querySelectorAll('cgcc-grade-disc')).forEach($disc => {
                if ($disc.classList.contains("EQUIVALENTE") || 
                    $disc.classList.contains("dis-APROVADO") ||
                    $disc.classList.contains("APROVADO")) {
                    // mostra disciplinas aprovadas (de qualquer período)
                    $disc.style.display = "";
                    return;
                }
                if ($disc.model.disabled) {
                    // não mostra disciplinas disabled (sem pré-requisitos)
                    $disc.style.display = "none";
                } else if ($disc.model.periodo && $disc.model.periodo <= this.periodo) {
                    // mostra disiplinas de períodos do período escolhido e anteriores
                    $disc.style.display = "";
                } else if ($disc.classList.contains("dis-APROVADO")) {
                    // mostra disciplinas aprovadas (de qualquer período)
                    $disc.style.display = "";
                } else if ($disc.classList.contains("dis-PLANEJADA")) {
                    // mostra disciplinas planejadas (de qualquer período)
                    $disc.style.display = "";
                } else if ($disc.classList.contains("PLANEJADA")) {
                    // mostra disciplinas planejadas (de qualquer período)
                    $disc.style.display = "";
                } else {
                    $disc.style.display = "none";
                }
            });
        }

        else if (this.periodo > ESTE_PERIODO) {
            Array.from(this.$opcionais.querySelectorAll('cgcc-grade-disc')).forEach($disc => {
                if ($disc.classList.contains("EQUIVALENTE") || 
                    $disc.classList.contains("dis-APROVADO") ||
                    $disc.classList.contains("APROVADO")) {
                    // mostra disciplinas aprovadas (de qualquer período)
                    $disc.style.display = "";
                    return;
                }
                if ($disc.model.disabled) {
                    $disc.style.display = "none";
                } else if ($disc.model.periodo && $disc.model.periodo <= this.periodo) {
                    $disc.style.display = "";
                } else if ($disc.classList.contains("NA_OFERTA")) {
                    $disc.style.display = "";
                } else {
                    $disc.style.display = "none";
                }
            });
        }

    }

    atualiza_status_opcionais() {
        //console.log("DEBUG atualiza_status_opcionais: START");
        const curriculo = this.historico?.codigo_do_curriculo;

        const cods_pre_requisitos = (opt_codigo) => {
            let disc = this.grade[opt_codigo];
            if (!disc || !disc.reqs) return [];
            return disc.reqs.trim().split(" ");
        };

        const concluiu = cod => {
            if (!cod) return false;
            const cods = cod.split(':');
            const concluiuUm = c =>
                this.cods_concluidas.includes(c) ||
                this.cods_concluidas.includes(REV_EQUIV[curriculo]?.[c]);
            return cods.some(concluiuUm);
        };

        Array.from(this.$opcionais.children).forEach($disc => {
            const codigo = $disc.model.codigo;

            if (this.cods_aprovadas.includes(codigo)) {
                $disc.model.status = Status.APROVADO;
                //$disc.model.saved_status = Status.APROVADO;
            } else if (this.cods_em_curso.includes(codigo)) {
                $disc.model.status = Status.EM_CURSO;
                //$disc.model.saved_status = Status.EM_CURSO;
            } else if (this.cods_planejadas.includes(codigo)) {
                $disc.model.status = Status.PLANEJADA;
                //$disc.model.saved_status = Status.PLANEJADA;
            } else {
                $disc.model.status = Status.PENDENTE;
                //$disc.model.saved_status = Status.PENDENTE;
            }

            const preqs = cods_pre_requisitos(codigo);
            const pre_reqs_ok = preqs.length === 0 || preqs.every(pre => concluiu(pre) || concluiu(REV_EQUIV[curriculo]?.[pre]));
            const na_oferta = esta_na_oferta(codigo);

            if (this.cods_em_curso.includes(codigo)) {
                $disc.model.disabled = false;
            } else {
                $disc.model.disabled = !pre_reqs_ok || !na_oferta;
            }

            if (!na_oferta && !this.cods_concluidas.includes(codigo)) {
                $disc.model.obs = "A disciplina não está na oferta";
            } else if (!pre_reqs_ok && !this.cods_concluidas.includes(codigo)) {
                $disc.model.obs = "Você não tem os pré-requisitos necessários";
            }

            $disc.update();

        });
    }

    get opts_disponiveis() {
        return Array.from(this.$container.children)
               .filter($disc => $disc.codigo.startsWith("0000") && $disc.model.status == "PENDENTE")
               .length;
    }

    sincroniza_slots_optativas() {
        if (!this.$container || !this.$opcionais) {
            return;
        }

        // total de horas das optativas aprovadas (conta também o clique EM_CURSO -> APROVADO)
        const total_horas = Array.from(this.$opcionais.children)
            .filter($d => $d.model.status == Status.APROVADO)
            .map($d => Number($d.model.horas))
            .reduce((a, b) => a + b, 0);

        const slots = Array.from(this.$container.querySelectorAll('[id^="d0000"]'))
            .sort((a, b) => Number(a.model.periodo) - Number(b.model.periodo));

        const slots_cheios = Math.floor(total_horas / 60);
        const resto = total_horas % 60;

        const horas_padrao = $slot => Number(this.grade[$slot.model.codigo]?.horas) || 60;

        slots.forEach(($slot, i) => {
            if (!$slot.model.codigo.startsWith("0000")) {
                return;
            }

            $slot.classList.remove("APROVADO", "EM_CURSO", "PLANEJADA", "PENDENTE");

            if (i < slots_cheios) {
                // slot de 60h integralizado
                $slot.model.status = Status.APROVADO;
                $slot.model.horas = horas_padrao($slot);
            } else if (i == slots_cheios && resto > 0) {
                // optativa parcial (ex.: 30h) -> marca como aprovada exibindo as horas pagas
                $slot.model.status = Status.APROVADO;
                $slot.model.horas = resto;
            } else {
                $slot.model.status = Status.PENDENTE;
                $slot.model.horas = horas_padrao($slot);
            }

            $slot.update();
        });
    }

    atualiza_na_oferta_grade_principal() {
        Array.from(this.$container.children).forEach($disc => {
            const codigo = $disc.model.codigo;
            if (esta_na_oferta(codigo)) {
                $disc.classList.add("NA_OFERTA");
            }
        });
    }

    get horas_integralizadas() {
        let horas_na_grade = Array.from(this.$container.children)
                                  .filter($disc => !$disc.model.codigo.startsWith("0000") &&
                                                   ["APROVADO"].includes($disc.model.status))
                                  .map($d => Number($d.model.horas))
                                  .reduce((a, b) => a + b, 0);

        let horas_em_outras = this.outras
                                  .map(o => Number(o.horas))
                                  .reduce((a,b) => a + b, 0);

        let horas_em_opcionais = 0;
        if (this.$opcionais) {
            horas_em_opcionais = Array.from(this.$opcionais.children)
                    .filter($disc => ["APROVADO"].includes($disc.model.status))
                    .map($d => Number($d.model.horas))
                    .reduce((a, b) => a + b, 0);
        }

        return horas_na_grade + horas_em_outras + horas_em_opcionais;
    }

    get horas_planejadas() {
        let horas_na_grade = Array.from(this.$container.children)
                    .filter($disc => !$disc.model.codigo.startsWith("0000") &&
                                     ["EM_CURSO", "PLANEJADA"].includes($disc.model.status))
                    .map($d => Number($d.model.horas))
                    .reduce((a, b) => a + b, 0);

        let horas_em_opcionais = 0;
        if (this.$opcionais) {
            horas_em_opcionais = Array.from(this.$opcionais.children)
                    .filter($disc => ["PLANEJADA"].includes($disc.model.status))
                    .map($d => Number($d.model.horas))
                    .reduce((a, b) => a + b, 0);
        }

        return this.horas_integralizadas + horas_na_grade + horas_em_opcionais;
    }

    element_pra_disc(codigo) {
        //console.log("DEBUG element_pra_disc: looking for", codigo);
        // assume que é código de disciplinas efetiva (não uma EQUIVALENTE)
        // pode ser OBRIGATÓRIA, COMPLEMENTAR ou OPTATIVA

        // primeiro, confirmar que está na grade curricular
        let disc = this.grade[codigo];
        //console.log("DEBUG element_pra_disc: found disc in grade:", disc);
        _assert(disc, `código não encontrado na grade ${this.ano_curriculao}`);
        _assert(disc.tipo !== 'EQUIVALENTE', `código ${codigo} é uma disciplina equivalente (a função requer código de disciplina efetiva como argumento)`);

        // se disc (ou equivalente) for OBRIGATÓRIA ou COMPLEMENTAR
        if (disc.tipo == "OBRIGATORIA" || disc.tipo == "COMPLEMENTAR") {
            let discs_codigo = Array.from(this.querySelectorAll(`#d${codigo}`));
            //console.log("DEBUG element_pra_disc: OBRIGATORIA/COMPLEMENTAR, found in DOM:", discs_codigo.length);
            _assert(discs_codigo.length > 0, `nenhum elemento para código ${codigo} foi encontrado no DOM`);
            _assert(discs_codigo.length < 2, `múltiplos elementos para código ${codigo} foram encontrados no DOM`);
            return discs_codigo[0];
        }

        // aqui podemos assumir que disc (ou equivalente) é OPTATIVA
        _assert(eh_optativa(disc), `tipo inválido detectado para código ${disc.codigo} na grade`);

        // primeiro, tenta encontrar no container de optativas ($opcionais)
        if (this.$opcionais) {
            let $opt = this.$opcionais.querySelector(`#opt${codigo}`);
            if ($opt) {
                return $opt;
            }
        }

        // se não encontrou em $opcionais, tenta nos slots de optativas em $container
        let slots_optativas = Array.from(this.querySelectorAll('[id^="d0000"]'))
                                   .filter($d => $d.model.tipo == disc.tipo);

        // se a disciplina já estiver alocada em algum slot, retorna-a
        let $disc = slots_optativas.find($d => $d.model.codigo == codigo);
        if ($disc)
            return $disc;

        // se houver uma equivalente, retorna-a
        //let cod_equivalente = rev_equivalente(codigo);
        let curriculo = this.historico.codigo_do_curriculo;
        let cod_equivalente = REV_EQUIV[curriculo][codigo];
        $disc = slots_optativas.find($d => $d.model.codigo == cod_equivalente);
        if ($disc)
            return $disc;

        // busca um slot já ocupado pela disc ou a equivalente
        $disc = slots_optativas.find($d => $d.model.codigo == disc.codigo);

        return ($disc && $disc.length) ? $disc : slots_optativas.find($d => $d.model.codigo.startsWith("0000"));
    }

    async renderiza_historico() {
        await this.promise_grade;
        
        //console.log("DEBUG renderiza_historico: historico:", this.historico);
        //console.log("DEBUG renderiza_historico: historico_de_matriculas:", this.historico?.historico_de_matriculas);
        
        let codigos_optativas = cod_generator();

        // PROCESSA CASO ESPECIAL: Antiga disciplina GRAFOS de 2 créditos
        if (this.historico.historico_de_matriculas.find(d => d.codigo === '1411170')) {
            // o aluno pagou GRAFOS de 2 créditos!
            let aplic_grafos = this.historico.historico_de_matriculas.find(d => d.codigo === '1411353');
            if (aplic_grafos) {
                // o aluno pagou APLICAÇÕES de GRAFOS pra ter mais 2 créditos
                ['1411353', '1411170'].forEach(cod => {
                    let index = this.historico.historico_de_matriculas.findIndex(d => d.codigo === cod);
                    this.historico.historico_de_matriculas.splice(index, 1);
                });
                // adiciona um registro de matrícula fake de grafos de 4 créditos
                let $disc = this.element_pra_disc(1411304);
                $disc.model.eh_equivalente = true;
                $disc.model.status = 'APROVADO';
                $disc.model.saved_status = 'APROVADO';
                $disc.model.tipo = 'OBRIGATORIA';
                $disc.model.creditos = 4;
                $disc.model.horas = 60;
                $disc.model.periodo = aplic_grafos.periodo;
                $disc.update();
            } else {
                // o aluno não pagou APLICAÇÕES de GRAFOS... 
                // TODO: o que fazer? remover GRAFOS de 2?
                console.debug("o aluno pagou grafos de 2 créditos, mas não pagou aplicações")
            }
        }
        this.historico.historico_de_matriculas.forEach((reg_matricula) => {
            //if (this.grade[reg_matricula.codigo].tipo == "OPTATIVA") return;
            // só disciplinas APROVADAS ou EM_CURSO devem ser renderizadas
            if (!["APROVADO", "EM_CURSO"].includes(reg_matricula.status)) {
                return;
            }

            //console.log("DEBUG renderiza_historico: processing", reg_matricula.codigo, "status:", reg_matricula.status);

            // TODO: não deveria ser um _assert e um ERRO FATAL
            if (!this.grade[reg_matricula.codigo]) {
                // a grade não tem a disciplina nem como obrigatória, nem como optativa, nem como complementar, nem como EQUIVALENTE!
                console.warn(`WARNING: grade não tem a disciplina ${reg_matricula.codigo}: ${reg_matricula.disciplina} que consta no registro de matrículas do estudante`);
                return;
            }

            // TODO: não deveria ser um _assert e um ERRO FATAL
            if (!this.grade[reg_matricula.codigo]) {
                    console.warn(`WARNING: grade não tem a disciplina ${reg_matricula.codigo}: ${reg_matricula.disciplina} que consta no registro de matrículas do estudante`);
                    return;
                }

                // identifica a disc da grade a ser considerada 
                let disc = this.grade[reg_matricula.codigo];
                
                // se é EQUIVALENTE, identifica a equivalente na grade
                if (disc.tipo === 'EQUIVALENTE') {
                    //let cod_equivalente = equivalente(disc.codigo);
                    let curriculo = this.historico.codigo_do_curriculo;
                    let cod_equivalente = EQUIV[curriculo][disc.codigo];
                    //_assert(cod_equivalente === cod_equivalente2, "OPS! Equivalentes inconsistentes.");
                    disc = this.grade[cod_equivalente];

                }

                let $disc = this.element_pra_disc(disc.codigo);
                //console.log("DEBUG: element_pra_disc returned:", $disc, "for codigo:", disc.codigo);
                if (!$disc) {
                    // TODO: adicionar disciplina à lista de outras 
                    this.outras.push(disc);
                    console.debug("WARNING: disciplina sem element no DOM (OPTATIVA ou EXTRA?): ", reg_matricula);
                    console.error("Entendo que a função element_pra_disc devia achar slots de optativas!!!");
                    return;
                }

                if ($disc.model.status != 'PENDENTE') {
                    // o slot já era ocupado por outro registro de matrícula equivalente
                    // possível bug no SIGAA ou no EURECA; entendo que os dados deviam ter sido ajustados
                    // aqui vou manter o registro de período mais antigo
                    if (Number(reg_matricula.periodo) > Number($disc.model.periodo)) {
                        console.debug("WARNING: disciplina JÁ OCUPADA no DOM (mantendo a existente!): ", reg_matricula);
                        return;
                    } else {
                        console.debug("WARNING: disciplina JÁ OCUPADA no DOM (atualizando!): ", reg_matricula);
                    }
                } 

                // achamos o slot da disciplina cursada ($disc)
                $disc.model.codigo = reg_matricula.codigo; 

                // TODO: remover quando SIGAA incluir as dispensadas
                if (reg_matricula.disciplina == "_DISPENSADA") {
                    if ($disc.model.nome.startsWith("Opt")) {
                        //$disc.model.nome = `DISPENSADA (${$disc.model.codigo})`;
                        $disc.model.nome = `${this.grade[$disc.model.codigo].disciplina}`;
                    } else {
                        //$disc.model.nome = $disc.nome;
                    }
                } else {
                    $disc.model.nome = reg_matricula.disciplina; 
                }
                // TODO: fim do todo (tem outro do SIGAA: buscar em app.js)

                $disc.model.eh_equivalente = this.grade[reg_matricula.codigo].tipo === 'EQUIVALENTE';
                $disc.model.status = reg_matricula.status; 
                $disc.model.saved_status = reg_matricula.status; 
                $disc.model.tipo = disc.tipo;
                $disc.model.creditos = Number(disc.creditos);
                $disc.model.horas = Number(disc.horas);
                $disc.model.periodo = reg_matricula.periodo;
                $disc.update();
            });

            if (this.outras.length) {
                console.debug("WARNING: disciplinas não encontradas em $container ou $opcionais:", this.outras);
            }
        }

        get historico() {
            return this._historico;
        }

        set historico(novo_historico) {
            this._historico = novo_historico;
        }

        set periodo(novo_periodo) {
            if (novo_periodo == PROX_PERIODO) {
                const seen = new Set();
                const em_curso = [
                    ...Array.from(this.$container.children),
                    ...Array.from(this.$opcionais.children)
                ]
                    .filter($d => {
                        if ($d.model.periodo != ESTE_PERIODO || $d.model.status != Status.EM_CURSO) return false;
                        if (seen.has($d.model.codigo)) return false;
                        seen.add($d.model.codigo);
                        return true;
                    });
                if (em_curso.length > 0) {
                    const nomes = em_curso.map($d => $d.model.nome).join(", ");
                    alert(`Antes de planejar ${PROX_PERIODO}, você deve informar se irá concluir com sucesso ou não todas as disciplinas matriculadas em ${ESTE_PERIODO}: ${nomes}. Deixe em cinza aquelas em que vai conseguir passar e em branco aquelas em que não vai.`);
                    return;
                }
            }
            this._periodo = novo_periodo;
            this.atualiza_status_opcionais();
            this.sincroniza_slots_optativas();
            this.filtra_opcionais();
            this.update();
            if (novo_periodo == PROX_PERIODO && !this.old_plano.filter(e => e.status == 'PLANEJADA').length) {
                setTimeout(() => {
                    alert(`Indique quais disciplinas você quer matricular em ${PROX_PERIODO} e pras quais solicita vagas. Deixe em AZUL as disciplinas planejadas.`);
                }, 0);
            }
        }

        get periodo() {
            return this._periodo || ESTE_PERIODO;
        }

        get num_em_curso() {
            return Array.from(this.$container.children)
                        .filter($d => $d.model.status == "EM_CURSO")
                        .length;
        }

        get cods_em_curso() {
            if (!this.$container) {
                return [];
            }
            let cods = Array.from(this.$container.children)
                            .filter($d => $d.model.status == "EM_CURSO")
                            .map($d => $d.model.codigo);

            if (this.$opcionais) {
                let opt_cods = Array.from(this.$opcionais.children)
                        .filter($d => $d.model.status == "EM_CURSO")
                        .map($d => $d.model.codigo);
                cods = cods.concat(opt_cods);
            }

            return cods;
        }

        get cods_aprovadas() {
            if (!this.$container) {
                return [];
            }
            let cods = Array.from(this.$container.children)
                            .filter($d => $d.model.status == "APROVADO")
                            .map($d => $d.model.codigo);

            if (this.$opcionais) {
                let opt_cods = Array.from(this.$opcionais.children)
                        .filter($d => $d.model.status == "APROVADO")
                        .map($d => $d.model.codigo);
                cods = cods.concat(opt_cods);
            }

            return cods;
        }

        get cods_concluidas() {
            if (!this.$container) {
                return [];
            }
            //console.log("DEBUG cods_concluidas: $container children:", Array.from(this.$container.children).map($d => ({codigo: $d.model.codigo, status: $d.model.status})));
            let cods = Array.from(this.$container.children)
                            .filter($d => $d.model.status == "APROVADO" || $d.model.status == "EM_CURSO")
                            .map($d => $d.model.codigo);

            if (this.$opcionais) {
                let opt_cods = Array.from(this.$opcionais.children)
                        .filter($d => $d.model.status == "APROVADO" || $d.model.status == "EM_CURSO")
                        .map($d => $d.model.codigo);
                cods = cods.concat(opt_cods);
            }

            return cods;
        }

        get cods_planejadas() {
            if (!this.$container) {
                return [];
            }
            let cods = Array.from(this.$container.children)
                            .filter($d => $d.model.status == "PLANEJADA")
                            .map($d => $d.model.codigo);

            if (this.$opcionais) {
                let opt_cods = Array.from(this.$opcionais.children)
                        .filter($d => $d.model.status == "PLANEJADA")
                        .map($d => $d.model.codigo);
                cods = cods.concat(opt_cods);
            }

            return cods;
        }

        get planejadas() {
            if (!this.$container) {
                return [];
            }
            let planejadas = Array.from(this.$container.children).filter($d => $d.model.status == "PLANEJADA");

            if (this.$opcionais) {
                let opt_planejadas = Array.from(this.$opcionais.children).filter($d => $d.model.status == "PLANEJADA");
                planejadas = planejadas.concat(opt_planejadas);
            }

            return planejadas;
        }

        get creditos_planejados() {
          try {
            return this.planejadas
                       .filter($d => $d.model.tipo != "COMPLEMENTAR" || $d.model.codigo == "1411317")
                       .map($d => Number(this.grade[$d.model.codigo].creditos))
                       .reduce((a,b) => a + b, 0);
                       //.map($d => Number($d.model.creditos))
          } catch (e) {
            console.log(e);
          }
        }

        get codigos_planejadas() {
            return this.planejadas.map($d => $d.model.codigo);
        }

        get plano() {
            if (!this.$container) {
                return [];
            }
            let disciplinas = Array.from(this.querySelectorAll('cgcc-grade-disc'))
            // $disc.model.saved_status != $disc.model.status;
            let plano = disciplinas
                    .filter($disc => !$disc.model.codigo.startsWith("0000") &&
                                     ($disc.has_changed() ||
                                     $disc.classList.contains('PLANEJADA') ||
                                     $disc.classList.contains('dis-PLANEJADA') ||
                                     $disc.classList.contains('MATRICULADA') ||
                                     $disc.classList.contains('dis-MATRICULADA')))
                    .map($disc => {
                        return {
                            codigo_slot: $disc.codigo,
                            codigo: $disc.model.codigo,
                            nome: $disc.model.nome,
                            status: $disc.model.status,
                            periodo: this.periodo,
                        }
                    });
            plano.sort((d1, d2) => d1.status.localeCompare(d2.status));
            return plano;

        }
        get old_plano() {
            if (!this.$container) {
                return [];
            }
            let disciplinas = Array.from(this.$container.children);
            // $disc.model.saved_status != $disc.model.status;
            let plano = disciplinas
                    .filter($disc => $disc.has_changed() ||
                                     ['PLANEJADA', 'dis-PLANEJADA'].includes($disc.model.status) ||
                                     ['MATRICULADA', 'dis-MATRICULADA'].includes($disc.model.status))
                    .map($disc => {
                        return {
                            codigo_slot: $disc.codigo,
                            codigo: $disc.model.codigo,
                            nome: $disc.model.nome,
                            status: $disc.model.status,
                            periodo: this.periodo,
                        }
                    });

            if (this.$opcionais) {
                let optativas = Array.from(this.$opcionais.children);
                
                let optativas_para_numerar = optativas
                        .filter($disc => ['APROVADO', 'dis-APROVADO'].includes($disc.model.status))
                        .filter($disc => ['PLANEJADA', 'dis-PLANEJADA'].includes($disc.model.status));
                
                optativas_para_numerar.sort((a, b) => {
                    const statusOrder = { 'APROVADO': 0, 'PLANEJADA': 1 , 'dis-APROVADO': 0, 'dis-PLANEJADA': 1};
                    return statusOrder[a.model.status] - statusOrder[b.model.status];
                });

                let codigos_optativas = cod_generator();
                let optativas_plano = optativas_para_numerar
                                      .filter($disc => ['EM_CURSO', 'dis-EM_CURSO'].includes($disc.model.saved_status   ||
                                                       ['PLANEJADA', 'dis-PLANEJADA'].includes($disc.model.saved_status)))
                                      .map($disc => {
                                                return {
                                                    codigo_slot: String(codigos_optativas.next().value),
                                                    codigo: $disc.model.codigo,
                                                    nome: $disc.model.nome,
                                                    status: $disc.model.status,
                                                    periodo: this.periodo,
                                                }
                                      });
        }

        return plano;
    }

    set plano(novo_plano) {
        this._plano = novo_plano;
    }

    disc_element(codigo) {
        let $disc = this.querySelector(`#d${codigo}`) || this.querySelector(`#opt${codigo}`);
        if (!$disc) {
            let cod_equiv = EQUIV["2023"][codigo];
            $disc = this.querySelector(`#d${cod_equiv}`) || this.querySelector(`#opt${cod_equiv}`);
        }
        return $disc;
    }

    renderiza_plano() {
        Array.from(g.$container.children).forEach($d => {
            $d.model.status = $d.model.saved_status;
            $d.update();
        })
        if (this.$opcionais) {
            Array.from(this.$opcionais.children).forEach($d => {
                $d.model.status = $d.model.saved_status;
                $d.update();
            });
        }
        this._plano.forEach(dp => {
            let $disc = this.disc_element(dp.codigo);

            if (!$disc) {
                console.debug(`IGNORANDO item de plano: ${dp.codigo} ${dp.nome} (${dp.status})`);
                console.debug(`... Disciplina não renderizada: ${dp.codigo}`);
                return;
            }
            if ($disc.model.saved_status == Status.APROVADO) {
                return;
            }

            $disc.model.codigo = dp.codigo;
            $disc.model.nome = dp.nome;
            $disc.model.obs = ` (${$disc.nome})`;
            if (!$disc.model.saved_status || $disc.model.saved_status === Status.PENDENTE) {
                // TODO: o saved_status não deveria ser alterado!
                // a linha comentada abaixo me parece que seria o correto
                //$disc.model.saved_status = 'PENDENTE';
                $disc.model.saved_status = dp.status;
            }
            $disc.set_status(dp.status);
            $disc.update();
        });
    }

    async fetch_grade() {
        if (this.grade) return;

        let csv_matrix = await fetch_grade(this.ano);
        if (csv_matrix == null) {
            return null;            
        }
        csv_matrix.array.forEach(line => {
            line[COL_TIPO] = tipo_planeje(line.tipo);

            Object.defineProperty(line, "tipo", {
              value: line[COL_TIPO],
              writable: true, 
              configurable: true
            });
        });
        return csv_matrix;
    }
}

function* cod_generator() {
    let n = 1;
    while (1) {
        yield String(n).padStart(7, '0');
        n += 1;
    }
}

customElements.define('cgcc-grade', GradeElement);
