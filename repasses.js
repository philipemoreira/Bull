// ==========================================================================
// DETALHE DOS REPASSES — ao tocar na linha "Repasses" da tela inicial,
// lista o que está somando ali (entrou − saiu).
// ==========================================================================
import { formatarMoeda } from "./util.js";
import { escaparHtml } from "./texto.js";

// documentosDoMes()   → lançamentos do mês que está na tela
// ehForaDosTotais(n)  → true se a categoria n é de "Repasse ou acerto"
export function iniciarDetalheRepasses({ documentosDoMes, ehForaDosTotais }) {
    const fundo = document.getElementById("fundo-modal-detalhe-repasses");
    const lista = document.getElementById("lista-detalhe-repasses");
    const resumo = document.getElementById("resumo-detalhe-repasses");

    function abrir() {
        const itens = (documentosDoMes() || [])
            .map((d) => d.data())
            .filter((d) => ehForaDosTotais(d.categoria));
        lista.innerHTML = "";
        let total = 0;
        itens.forEach((d) => {
            const entrada = d.tipo === "ganho";
            total += entrada ? d.valor : -d.valor;
            const linha = document.createElement("div");
            linha.style.cssText = "display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--borda)";
            linha.innerHTML = `<span>${escaparHtml(d.categoria)}${d.descricao ? " · " + escaparHtml(d.descricao) : ""}<br><small>${entrada ? "Entrou" : "Saiu"}</small></span><strong>${entrada ? "+" : "−"} ${formatarMoeda(d.valor)}</strong>`;
            lista.appendChild(linha);
        });
        resumo.textContent = itens.length === 0
            ? "Nenhum lançamento de repasse neste mês."
            : `Entrou − saiu = ${formatarMoeda(total)}. Se um item aqui não era de repasse, a categoria dele está marcada como "Repasse ou acerto".`;
        fundo.classList.add("aberto");
    }

    document.getElementById("item-repasses").addEventListener("click", abrir);
    document.getElementById("botao-fechar-detalhe-repasses").addEventListener("click", () => fundo.classList.remove("aberto"));
    fundo.addEventListener("click", (e) => { if (e.target === fundo) fundo.classList.remove("aberto"); });
}
