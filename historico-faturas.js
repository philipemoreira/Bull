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
                const dataFormatada = dados.dataPagamento.toDate().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
                const textoForma = nomesFormaPagamento[dados.formaPagamento] || dados.formaPagamento;
                const textoBanco = dados.banco ? ` · ${dados.banco}` : "";

                const item = document.createElement("li");
                item.className = "item-lancamento tipo-gasto";
                item.innerHTML = `
                    <div>
                        <div class="descricao-lancamento">Fatura paga — ${dados.cartaoNome}</div>
                        <div class="meta-lancamento">${dataFormatada} · ${textoForma}${textoBanco} · ${dados.quantidadeItens || 0} ${dados.quantidadeItens === 1 ? "item" : "itens"}</div>
                    </div>
                    <span class="valor-lancamento">${formatarMoeda(dados.valor)}</span>
                `;
                listaHistoricoFaturas.appendChild(item);
            });
        });
    }

});
