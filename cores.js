// ==========================================================================
// CORES DAS CATEGORIAS — cada categoria recebe uma cor DIFERENTE das outras
// (nada de duas fatias parecidas no gráfico) e a mesma cor aparece em todas
// as telas. A escolha fica guardada no aparelho, então não muda de um dia pro
// outro. Cores novas são dadas só pra categorias novas, na ordem da paleta.
// ==========================================================================
const CHAVE = "bull_cores_categorias_v1";

// Variedade de verdade: azul, laranja, verde, amarelo, roxo, rosa, vermelho,
// ciano, lima, magenta, turquesa, cinza-azulado, marrom e índigo (+ versões
// mais escuras e mais claras, totalizando 24)
const PALETA = [
    "#3B82F6", "#F97316", "#22C55E", "#EAB308", "#8B5CF6",
    "#EC4899", "#EF4444", "#06B6D4", "#84CC16", "#D946EF",
    "#14B8A6", "#94A3B8", "#B45309", "#6366F1",
    // Tons mais escuros e mais claros, pra quando as categorias forem muitas
    "#1D4ED8", "#BE123C", "#15803D", "#C2410C", "#7E22CE",
    "#FDE047", "#F9A8D4", "#67E8F9", "#A5B4FC", "#78716C"
];

let mapa = {};
try { mapa = JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch (erro) { mapa = {}; }

function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(mapa)); } catch (erro) { /* sem localStorage: segue só na memória */ }
}

function atribuir(nomes) {
    const usados = new Set(Object.values(mapa));
    let mudou = false;
    nomes.forEach((nome) => {
        if (!nome || nome in mapa) return;
        let indice = PALETA.findIndex((_, i) => !usados.has(i));
        if (indice === -1) indice = Object.keys(mapa).length % PALETA.length; // acabou a paleta: repete
        mapa[nome] = indice;
        usados.add(indice);
        mudou = true;
    });
    if (mudou) salvar();
}

// Dá cor às categorias que ainda não têm (em ordem alfabética, pra ficar igual em todo aparelho)
export function registrarCategorias(nomes) {
    atribuir([...new Set(nomes)].filter((n) => n && n !== "Guardado").sort((a, b) => a.localeCompare(b, "pt-BR")));
}

export function corDaCategoria(nome) {
    if (nome === "Guardado") return "#38BDF8"; // cofrinho: azul-claro próprio
    if (!(nome in mapa)) atribuir([nome]);
    return PALETA[mapa[nome] % PALETA.length];
}
