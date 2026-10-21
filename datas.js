// ==========================================================================
// DATAS — funções puras de data usadas nos formulários e no cartão.
// ==========================================================================
import { mesReferenciaString } from "./util.js";

// Formata pro padrão AAAA-MM-DD que o input[type=date] espera, usando o
// horário LOCAL do aparelho (evita o bug clássico de virar o dia errado
// perto da meia-noite, que aconteceria usando toISOString diretamente
// em fusos negativos como o do Brasil)
export function formatarDataParaCampo(data) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, "0");
    const dia = String(data.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
}

// Data escolhida no campo + o horário de agora (mantém a ordem real em que
// você lançou, mesmo escolhendo um dia diferente de hoje)
export function construirDataComHorarioReal(dataDoCampo) {
    const agora = new Date();
    const [ano, mes, dia] = dataDoCampo.split("-").map(Number);
    return new Date(ano, mes - 1, dia, agora.getHours(), agora.getMinutes(), agora.getSeconds(), agora.getMilliseconds());
}

// Em qual fatura (mês) cai uma compra feita HOJE, dado o dia de fechamento
// do cartão: antes do fechamento, entra na fatura que ainda vai fechar esse
// mês; no dia do fechamento (inclusive) ou depois, pula pra do mês seguinte
// (igual ao Nubank: no dia do fechamento é o "melhor dia pra compras")
export function calcularMesReferenciaFatura(hoje, diaFechamento) {
    if (hoje.getDate() < diaFechamento) {
        return mesReferenciaString(hoje);
    }
    const proximoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
    return mesReferenciaString(proximoMes);
}
