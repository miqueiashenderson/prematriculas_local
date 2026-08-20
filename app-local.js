import { status_planeje, TOTAL_HORAS_EXIGIDO, ESTE_PERIODO, PROX_PERIODO, get_alocacao } from './cgcc-dados.js';
import './plano-matriculas.js';
import './grade.js';

get_alocacao();

let $body = document.body;
let $main = document.querySelector("main");
let $nome = document.querySelector("#nome");
let $matricula = document.querySelector("#matricula");
let $immediate_loading = document.querySelector("#immediate-loading");

function hide_loading() {
    if ($immediate_loading) {
        $immediate_loading.classList.add('hidden');
    }
}

document.querySelector("#logout-button").addEventListener("click", () => {
    alert("Modo local: sem logout");
});

function setup_help() {
    const help_template = document.getElementById("help-template");
    if (help_template) {
        $body.appendChild(help_template.content.cloneNode(true));
        let $help = document.getElementById("help-overlay");
        if ($help && !localStorage.getItem("help-lido")) {
            $help.classList.toggle("visible");
        }
    }
    document.addEventListener("keydown", function(event) {
        if (event.key === "h") {
            let $help = document.getElementById("help-overlay");
            if ($help) {
                $help.classList.toggle("visible");
                localStorage.setItem("help-lido", "true");
            }
        }
    });
}

function make_mock_historico() {
    return {
        nome: "Aluno(a) Teste (Modo Local)",
        matricula_do_estudante: "0000000",
        codigo_do_curriculo: 2023,
        situacao: "ATIVO",
        _migrou: false,
        historico_de_matriculas: []
    };
}

function make_mock_plano() {
    return { plano: [], eh_vazio: false };
}

async function render_main_view() {
    let historico = make_mock_historico();
    let matricula = historico.matricula_do_estudante;

    $nome.innerText = historico.nome;
    $matricula.innerText = historico.matricula_do_estudante;
    $main.innerHTML = `
        <div id="migrou" style="display:none"></div>
        <tabs-container></tabs-container>
        <cgcc-grade ano="${historico.codigo_do_curriculo}"></cgcc-grade>
        <cgcc-plano-matriculas></cgcc-plano-matriculas>
    `;

    let $tabs = $main.querySelector("tabs-container");
    let $grade = $main.querySelector("cgcc-grade");
    window.g = $grade;

    let $plano_matriculas = $main.querySelector("cgcc-plano-matriculas");
    window.p = $plano_matriculas;

    let plano_object = make_mock_plano();

    $grade.historico = historico;
    $grade.plano = plano_object.plano;
    await $grade.promise_historico;
    window.saved_plano_object = JSON.parse(JSON.stringify(plano_object));
    $plano_matriculas.plano_object = plano_object;

    $grade.addEventListener("status-change", (ev) => {
        let plano_filtrado = $grade.plano.filter(d => d.status === "PLANEJADA");
        $plano_matriculas.plano_object = {
            eh_vazio: false,
            matricula: matricula,
            plano: plano_filtrado
        }
    });

    let ativa_periodo = function ($clicked_tab) {
        let previous_periodo = $grade.periodo;
        $grade.periodo = $clicked_tab.periodo;

        if ($grade.periodo !== previous_periodo) {
            Array.from($tabs.children).forEach($tab => {
                if ($tab.periodo == $clicked_tab.periodo) {
                    $tab.classList.add("active-tab");
                } else {
                    $tab.classList.remove("active-tab");
                }
            });
        }
    };

    let periodos = [
        "2023.1", "2023.2",
        "2024.1", "2024.2",
        "2025.1", "2025.2",
        ESTE_PERIODO, PROX_PERIODO
    ];

    periodos.forEach(periodo => {
        let $tab = document.createElement("tab-button");
        $tab.innerHTML = periodo;
        $tab.periodo = periodo;
        if (periodo == ESTE_PERIODO) {
            $tab.classList.add("active-tab");
        }
        $tabs.appendChild($tab);
        $tab.addEventListener("click", (ev) => {
            ativa_periodo(ev.target);
        });
    });

    hide_loading();
}

setup_help();
render_main_view();
