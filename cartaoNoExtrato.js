// ==========================================================================
// COMPRAS NO CARTÃO DE CRÉDITO → LINHAS DO EXTRATO E DO GRÁFICO
//
// Uma compra no crédito é guardada como "pendência" (noCartao = true), presa
// ao ciclo da FATURA — só vira lançamento de verdade (um "Fatura do Cartão"
// único) quando a fatura é paga. Por isso ela não aparecia no Extrato nem no
// gráfico por categoria.
//
// Aqui a gente transforma essas pendências em "lançamentos de exibição":
// só pra MOSTRAR (Extrato + gráfico), sem mexer em saldo nenhum. O saldo
// do banco continua só descendo quando a fatura é paga.
//
// Em qual mês cada compra conta? No mês em que ela foi FEITA (não no mês da
// fatura). Parcelado e Fixo: a 1ª parcela conta no mês da compra, a 2ª no
// mês seguinte, e assim por diante. Meses que ainda não chegaram ficam de
// fora (é só "agendado", ainda não é gasto de verdade).
// ==========================================================================

export function mesEmTexto(data) {
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

function mesParaIndice(mesTexto) {
    const [ano, mes] = mesTexto.split("-").map(Number);
    return ano * 12 + (mes - 1);
}

// Soma meses mantendo o dia (ou o último dia do mês, se o mês não tiver esse dia)
function somarMeses(data, quantidade) {
    const alvo = new Date(data.getFullYear(), data.getMonth() + quantidade, 1,
        data.getHours(), data.getMinutes(), data.getSeconds(), data.getMilliseconds());
    const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
    alvo.setDate(Math.min(data.getDate(), ultimoDia));
    return alvo;
}

// documentosPendenciasCartao: docs de "pendencias" com noCartao == true
// nomesCartoes: { cartaoId: "Nubank" }
export function montarLancamentosDeCartao(documentosPendenciasCartao, nomesCartoes = {}, mesLimite = mesEmTexto(new Date())) {
    const grupos = {};
    documentosPendenciasCartao.forEach((documento) => {
        const dados = documento.data();
        if (!dados.mesReferencia) return;
        const chave = dados.grupoId || documento.id;
        if (!grupos[chave]) grupos[chave] = [];
        grupos[chave].push(documento);
    });

    const resultado = [];

    Object.values(grupos).forEach((itens) => {
        let menorMesIndice = Infinity;
        let menorCriadoEm = null;
        itens.forEach((documento) => {
            const dados = documento.data();
            menorMesIndice = Math.min(menorMesIndice, mesParaIndice(dados.mesReferencia));
            const criadoEm = dados.criadoEm && dados.criadoEm.toDate ? dados.criadoEm.toDate() : null;
            if (criadoEm && (!menorCriadoEm || criadoEm < menorCriadoEm)) menorCriadoEm = criadoEm;
        });

        // Se a data da compra ainda não chegou do servidor, usa o mês da fatura
        const dataDaCompra = menorCriadoEm
            || new Date(Math.floor(menorMesIndice / 12), menorMesIndice % 12, 1, 12, 0, 0);

        itens.forEach((documento) => {
            const dados = documento.data();
            const deslocamento = mesParaIndice(dados.mesReferencia) - menorMesIndice;
            const dataDoItem = somarMeses(dataDaCompra, deslocamento);
            const mesDoItem = mesEmTexto(dataDoItem);

            if (mesDoItem > mesLimite) return; // ainda não chegou

            const rotuloParcela = dados.totalParcelas ? ` (${dados.numeroParcela}/${dados.totalParcelas})` : "";
            const dadosExibicao = {
                tipo: "gasto",
                valor: dados.valor,
                categoria: dados.categoria,
                descricao: `${dados.descricao || dados.categoria}${rotuloParcela}`,
                data: { toDate: () => dataDoItem },
                criadoEm: { toDate: () => dataDoItem },
                mesReferencia: mesDoItem,
                formaPagamento: "credito",
                banco: nomesCartoes[dados.cartaoId] || "",
                ehItemCartao: true
            };

            resultado.push({ id: documento.id, data: () => dadosExibicao });
        });
    });

    return resultado;
}
