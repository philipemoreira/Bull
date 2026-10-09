// ==========================================================================
// SALDO REAL DE UM BANCO — a conta existia copiada em 5 lugares; agora é
// uma só. "lancamentos" pode ser o resultado de uma busca do Firestore ou
// uma lista de documentos.
//
// saldo = saldo inicial
//       + ganhos (que não são do cofrinho) no banco
//       − gastos em PIX/Débito no banco (exceto a "Fatura do Cartão", abaixo)
//       − faturas de cartão pagas por esse banco
//       ± Guardar/Retirar (transferência: o campo "banco" já leva o sinal)
//       − o que saiu desse banco pra ser guardado em outro (bancoOrigem)
// Lançamentos marcados "ajuste" (Ajuste do guardado) NÃO mexem no saldo:
// o gasto original já tinha descontado o dinheiro do banco.
// ==========================================================================
export function calcularSaldoBanco(nomeBanco, saldoInicial, lancamentos) {
    let total = saldoInicial || 0;
    lancamentos.forEach((item) => {
        const dados = typeof item.data === "function" ? item.data() : item;
        const ehCategoriaEspecial = dados.categoria === "Guardar Dinheiro" || dados.categoria === "Retirada da Reserva";

        if (dados.tipo === "ganho" && !ehCategoriaEspecial && dados.banco === nomeBanco) {
            total += dados.valor;
        }
        if (dados.tipo === "gasto" && !ehCategoriaEspecial && dados.categoria !== "Fatura do Cartão" && (dados.formaPagamento === "pix" || dados.formaPagamento === "debito") && dados.banco === nomeBanco) {
            total -= dados.valor;
        }
        if (dados.categoria === "Fatura do Cartão" && dados.banco === nomeBanco) {
            total -= dados.valor;
        }
        if (ehCategoriaEspecial && !dados.ajuste && dados.banco === nomeBanco) {
            total += dados.valor;
        }
        if (dados.categoria === "Guardar Dinheiro" && dados.valor > 0 && dados.bancoOrigem === nomeBanco) {
            total -= dados.valor;
        }
    });
    return total;
}
