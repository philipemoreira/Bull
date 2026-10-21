// Valores fixos usados em mais de uma parte da tela inicial
export const CATEGORIAS_PADRAO = {
    gasto: ["Outros"],
    ganho: ["Outros"]
};

export const NOMES_MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

// Mostramos só os últimos N lançamentos na tela inicial — o resto fica no Extrato Completo
export const LIMITE_ITENS_LISTA_INICIAL = 4;

// Navegação do calendário: do início do ano atual até dezembro de 2028 —
// dá espaço suficiente pra parcelamentos longos (até 48x) não ficarem sem
// mês pra "morar"
export const LIMITE_NAVEGACAO_SUPERIOR = new Date(2030, 11, 1);
export const LIMITE_NAVEGACAO_INFERIOR = new Date(new Date().getFullYear(), 0, 1);
