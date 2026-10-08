import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, query, where, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    const campoEscolherCartao = document.getElementById("campo-escolher-cartao");
    const semCartoesVazio = document.getElementById("sem-cartoes-vazio");
    const listaHistoricoFaturas = document.getElementById("lista-historico-faturas");
    const historicoVazio = document.getElementById("historico-vazio");

    let uidAtual = null;
    let pararDeEscutarHistorico = null;

    const nomesFormaPagamento = { dinheiro: "Dinheiro", pix: "PIX", debito: "Débito" };

    function formatarMoeda(valor) {
        const valorCorrigido = valor === 0 ? 0 : valor;
        return valorCorrigido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

    onAuthStateChanged(auth, async (usuario) => {
        if (!usuario) {
            window.location.href = "index.html";
            return;
        }
        uidAtual = usuario.uid;

        const referenciaCartoes = collection(db, "usuarios", uidAtual, "cartoes");
        const resultadoCartoes = await getDocs(referenciaCartoes);

        if (resultadoCartoes.empty) {
            campoEscolherCartao.hidden = true;
            semCartoesVazio.hidden = false;
            return;
        }

        campoEscolherCartao.innerHTML = "";
        resultadoCartoes.forEach((documento) => {
            const opcao = document.createElement("option");
            opcao.value = documento.id;
            opcao.textContent = documento.data().nome;
            campoEscolherCartao.appendChild(opcao);
        });

        escutarHistoricoDoCartao(campoEscolherCartao.value);

        campoEscolherCartao.addEventListener("change", () => {
            escutarHistoricoDoCartao(campoEscolherCartao.value);
        });
    });

    function escaparHtml(texto) {
        return String(texto).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // Faturas pagas ANTES de o app guardar a "foto" dos itens: acha os itens
    // pelas pendências marcadas como pagas na mesma hora do pagamento
    async function itensPorProximidadeDoPagamento(cartaoId, dataPagamento) {
        try {
            const resultado = await getDocs(query(collection(db, "usuarios", uidAtual, "pendencias"), where("cartaoId", "==", cartaoId)));
            const alvo = dataPagamento.getTime();
            return resultado.docs
                .map((d) => d.data())
                .filter((d) => d.pago && d.pagoEm && Math.abs(d.pagoEm.toMillis() - alvo) < 3 * 60 * 1000)
                .map((d) => ({
                    descricao: d.descricao || "", valor: d.valor || 0, origem: d.origem || "avulsa",
                    numeroParcela: d.numeroParcela ?? null, totalParcelas: d.totalParcelas ?? null, mesReferencia: d.mesReferencia || null
                }));
        } catch (erro) {
            return [];
        }
    }

    function htmlDosItens(itens) {
        if (!itens.length) return `<li class="cc-item"><div class="cc-item-nome" style="color:var(--text-muted);font-weight:500;">Os itens dessa fatura não foram guardados.</div></li>`;
        return itens.map((i) => {
            const etiqueta = i.origem === "parcelado" && i.numeroParcela
                ? `<span class="badge-parcela">Parcela ${i.numeroParcela}/${i.totalParcelas}</span>`
                : (i.origem === "fixo" ? `<span class="badge-parcela">Fixo</span>` : "");
            return `<li class="cc-item"><div class="cc-item-nome">${escaparHtml(i.descricao)}${etiqueta}</div><span class="cc-item-valor">${formatarMoeda(i.valor)}</span></li>`;
        }).join("");
    }

    function escutarHistoricoDoCartao(cartaoId) {
        if (pararDeEscutarHistorico) pararDeEscutarHistorico();

        const referencia = collection(db, "usuarios", uidAtual, "faturasPagas");
        const consulta = query(referencia, where("cartaoId", "==", cartaoId));

        pararDeEscutarHistorico = onSnapshot(consulta, (snapshot) => {
            listaHistoricoFaturas.innerHTML = "";
            historicoVazio.hidden = snapshot.docs.length > 0;

            // Ordena no JS (mais recente primeiro) em vez de pedir pro
            // Firestore — evitando precisar de um índice composto só pra
            // combinar "onde cartaoId=X" com "ordenado por data"
            const documentosOrdenados = [...snapshot.docs].sort(
                (a, b) => b.data().dataPagamento.toMillis() - a.data().dataPagamento.toMillis()
            );

            documentosOrdenados.forEach((documento) => {
                const dados = documento.data();
                const dataPagamento = dados.dataPagamento.toDate();
                const dataFormatada = dataPagamento.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
                const textoForma = nomesFormaPagamento[dados.formaPagamento] || dados.formaPagamento;
                const textoBanco = dados.banco ? ` · ${dados.banco}` : "";

                const item = document.createElement("li");
                item.className = "item-lancamento tipo-gasto";
                item.style.cssText = "flex-wrap:wrap;cursor:pointer;";
                item.innerHTML = `
                    <div>
                        <div class="descricao-lancamento">Fatura paga — ${escaparHtml(dados.cartaoNome)}</div>
                        <div class="meta-lancamento">${dataFormatada} · ${textoForma}${textoBanco} · ${dados.quantidadeItens || 0} ${dados.quantidadeItens === 1 ? "item" : "itens"} · toque pra ver</div>
                    </div>
                    <span class="valor-lancamento">${formatarMoeda(dados.valor)}</span>
                    <ul class="cc-lista" hidden style="width:100%;flex-basis:100%;"></ul>
                `;
                const listaItens = item.querySelector(".cc-lista");
                let carregado = false;
                item.addEventListener("click", async () => {
                    if (!listaItens.hidden) { listaItens.hidden = true; return; }
                    if (!carregado) {
                        const itens = Array.isArray(dados.itens) ? dados.itens : await itensPorProximidadeDoPagamento(cartaoId, dataPagamento);
                        listaItens.innerHTML = htmlDosItens(itens);
                        carregado = true;
                    }
                    listaItens.hidden = false;
                });
                listaHistoricoFaturas.appendChild(item);
            });
        });
    }

});
