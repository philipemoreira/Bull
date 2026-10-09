// ==========================================================================
// FUNÇÕES COMPARTILHADAS — antes cada tela tinha a sua cópia. Agora existe
// uma só: se precisar corrigir algo aqui, corrige em todas as telas juntas.
// ==========================================================================

// R$ 1.234,56 (e nunca "-R$ 0,00")
export function formatarMoeda(valor) {
    const valorCorrigido = valor === 0 ? 0 : valor;
    return valorCorrigido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Converte texto digitado ("1.234,56") em número
export function paraNumero(texto) {
    return parseFloat(String(texto).replace(/\./g, "").replace(",", "."));
}

// Formata pro padrão "AAAA-MM" — o mês que um lançamento/fatura conta
export function mesReferenciaString(data) {
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

// Máscara "tipo caixa eletrônico": os dígitos entram da direita pra esquerda
export function aplicarMascaraValor(input) {
    function reformatar() {
        const digitos = input.value.replace(/\D/g, "");
        if (digitos === "") {
            input.value = "";
            return;
        }
        const centavos = parseInt(digitos, 10);
        const reais = Math.floor(centavos / 100);
        const centavosRestantes = centavos % 100;
        input.value = `${reais},${String(centavosRestantes).padStart(2, "0")}`;
    }
    input.addEventListener("input", () => {
        reformatar();
        input.setSelectionRange(input.value.length, input.value.length);
    });
    input.addEventListener("focus", () => {
        setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
    });
}

// ---- FATURA DO CARTÃO: fechamento ----------------------------------------
// Data em que a fatura do mês "AAAA-MM" fecha (respeita meses curtos)
export function dataDeFechamento(mesReferencia, diaFechamento) {
    const [ano, mes] = mesReferencia.split("-").map(Number);
    const ultimoDiaDoMes = new Date(ano, mes, 0).getDate();
    const diaFinal = Math.min(diaFechamento, ultimoDiaDoMes);
    return new Date(ano, mes - 1, diaFinal);
}

// A fatura já fechou? (hoje >= dia de fechamento)
export function faturaJaFechou(mesReferencia, diaFechamento) {
    const hoje = new Date();
    const hojeSoData = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    return hojeSoData >= dataDeFechamento(mesReferencia, diaFechamento);
}
