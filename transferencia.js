// ==========================================================================
// TRANSFERIR ENTRE BANCOS — um único lançamento (tipo "transferencia"):
// sai do banco de origem e entra no de destino. Não conta como ganho, gasto
// nem entra no gráfico.
// ==========================================================================
import { db } from "./firebase-config.js";
import {
    collection, addDoc, doc, getDoc, Timestamp, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { formatarMoeda, paraNumero, aplicarMascaraValor, mesReferenciaString } from "./util.js";
import { formatarDataParaCampo, construirDataComHorarioReal } from "./datas.js";
import { mostrarToast } from "./avisos.js";

// A tela inicial entrega o que esse módulo precisa saber dela:
//   uid()                  → id do usuário logado
//   bancos()               → lista [{nome, id}] dos bancos cadastrados
//   mes()                  → mês que está sendo visto na tela
//   saldoDoBanco(nome, si) → saldo real do banco hoje
// Devolve { abrir } para a tela inicial abrir o modal.
export function iniciarTransferencia({ uid, bancos, mes, saldoDoBanco }) {
    const fundoModal = document.getElementById("fundo-modal-transferir");
    const formulario = document.getElementById("formulario-transferir");
    const campoValor = document.getElementById("campo-valor-transferir");
    const campoOrigem = document.getElementById("campo-origem-transferir");
    const campoDestino = document.getElementById("campo-destino-transferir");
    const campoDescricao = document.getElementById("campo-descricao-transferir");
    const campoData = document.getElementById("campo-data-transferir");
    const aviso = document.getElementById("mensagem-aviso-transferir");
    const botaoSalvar = document.getElementById("botao-salvar-transferir");
    const dicaSaldoOrigem = document.getElementById("dica-saldo-origem-transferir");
    aplicarMascaraValor(campoValor);

    function mostrarAviso(texto) {
        aviso.textContent = texto;
        aviso.classList.toggle("visivel", !!texto);
    }

    async function saldoAtualDe(nomeBanco) {
        const banco = bancos().find((b) => b.nome === nomeBanco);
        if (!banco) return 0;
        const snap = await getDoc(doc(db, "usuarios", uid(), "bancos", banco.id));
        const saldoInicial = snap.exists() ? (snap.data().saldoInicial || 0) : 0;
        return saldoDoBanco(nomeBanco, saldoInicial);
    }

    async function mostrarSaldoDaOrigem() {
        dicaSaldoOrigem.textContent = "";
        const nome = campoOrigem.value;
        if (!bancos().find((b) => b.nome === nome)) return;
        try {
            const saldo = await saldoAtualDe(nome);
            if (campoOrigem.value === nome) dicaSaldoOrigem.textContent = `Saldo agora: ${formatarMoeda(saldo)}`;
        } catch (erro) { /* só não mostra o saldo */ }
    }

    function abrir() {
        mostrarAviso("");
        if (bancos().length < 2) {
            mostrarToast("Cadastre pelo menos 2 bancos em Bancos e Cartões para transferir.", 3600);
            return;
        }
        formulario.reset();
        [campoOrigem, campoDestino].forEach((select) => {
            select.innerHTML = "";
            bancos().forEach((banco) => {
                const opcao = document.createElement("option");
                opcao.value = banco.nome;
                opcao.textContent = banco.nome;
                select.appendChild(opcao);
            });
        });
        campoDestino.selectedIndex = 1;
        campoData.value = formatarDataParaCampo(new Date());
        fundoModal.classList.add("aberto");
        mostrarSaldoDaOrigem();
        campoValor.focus();
    }

    function fechar() {
        fundoModal.classList.remove("aberto");
    }

    campoOrigem.addEventListener("change", mostrarSaldoDaOrigem);
    document.getElementById("botao-fechar-transferir").addEventListener("click", fechar);
    fundoModal.addEventListener("click", (evento) => {
        if (evento.target === fundoModal) fechar();
    });

    formulario.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        mostrarAviso("");
        const valor = paraNumero(campoValor.value);
        const origem = campoOrigem.value;
        const destino = campoDestino.value;
        if (!valor || valor <= 0) { mostrarAviso("Digita um valor maior que zero."); return; }
        if (!origem || !destino) { mostrarAviso("Escolhe os dois bancos."); return; }
        if (origem === destino) { mostrarAviso("O banco de origem e o de destino precisam ser diferentes."); return; }

        botaoSalvar.disabled = true;
        try {
            const saldoOrigem = await saldoAtualDe(origem);
            if (Math.round(valor * 100) > Math.round(saldoOrigem * 100)) {
                mostrarAviso(`O ${origem} só tem ${formatarMoeda(saldoOrigem)}. Não dá para transferir mais do que isso.`);
                return;
            }
            await addDoc(collection(db, "usuarios", uid(), "lancamentos"), {
                tipo: "transferencia",
                valor,
                categoria: "Transferência",
                descricao: campoDescricao.value.trim(),
                banco: destino,
                bancoOrigem: origem,
                data: Timestamp.fromDate(construirDataComHorarioReal(campoData.value)),
                mesReferencia: mesReferenciaString(mes()),
                criadoEm: serverTimestamp()
            });
            fechar();
            mostrarToast(`Transferido ✓ ${origem} → ${destino}`);
        } catch (erro) {
            mostrarAviso("Não deu pra salvar agora. Confere sua internet e tenta de novo.");
        } finally {
            botaoSalvar.disabled = false;
        }
    });

    return { abrir };
}
