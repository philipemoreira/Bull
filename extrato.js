import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection, addDoc, deleteDoc, doc, query, orderBy, onSnapshot, Timestamp, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Mesma paleta e mesmo cálculo de cor por categoria do Dashboard — repetido
// aqui (não dá pra importar entre esses arquivos soltos) pra categoria
// aparecer com a MESMA cor em toda tela, sempre.
const PALETA_CATEGORIAS = [
    "#3987E5", "#D95926", "#199E70", "#C98500", "#9085E9",
    "#D55181", "#E66767", "#5EEAD4", "#F5D76E", "#34D399"
];
function corDaCategoria(nomeCategoria) {
    if (nomeCategoria === "Guardado") return "#60A5FA";
    let hash = 0;
    for (let i = 0; i < nomeCategoria.length; i++) {
        hash = (hash * 31 + nomeCategoria.charCodeAt(i)) >>> 0;
    }
    return PALETA_CATEGORIAS[hash % PALETA_CATEGORIAS.length];
}

document.addEventListener("DOMContentLoaded", function () {

    // ==========================================================================
    // TEMA CLARO / ESCURO — só troca a aparência, nada de dados. A escolha
    // fica salva no aparelho (localStorage), a mesma usada em todas as telas.
    // ==========================================================================
    const botaoTema = document.getElementById("botao-tema");
    const CHAVE_TEMA = "bull_tema";
    const metaCorTema = document.querySelector('meta[name="theme-color"]');

    function atualizarMetaCorTema() {
        if (!metaCorTema) return;
        const estaClaro = document.documentElement.getAttribute("data-tema") === "claro";
        metaCorTema.setAttribute("content", estaClaro ? "#FAF9F5" : "#0A0A0A");
    }
    atualizarMetaCorTema();

    if (botaoTema) {
        botaoTema.addEventListener("click", () => {
            const estaClaro = document.documentElement.getAttribute("data-tema") === "claro";
            if (estaClaro) {
                document.documentElement.removeAttribute("data-tema");
                localStorage.setItem(CHAVE_TEMA, "escuro");
            } else {
                document.documentElement.setAttribute("data-tema", "claro");
                localStorage.setItem(CHAVE_TEMA, "claro");
            }
            atualizarMetaCorTema();
        });
    }

    const listaExtrato = document.getElementById("lista-extrato");
    const toast = document.getElementById("toast");
    const toastMensagem = document.getElementById("toast-mensagem");
    const toastBotaoAcao = document.getElementById("toast-botao-acao");

    const fundoModalConfirmar = document.getElementById("fundo-modal-confirmar");
    const tituloModalConfirmar = document.getElementById("titulo-modal-confirmar");
    const textoModalConfirmar = document.getElementById("texto-modal-confirmar");
    const botaoConfirmarAcao = document.getElementById("botao-confirmar-acao");
    const botaoCancelarAcao = document.getElementById("botao-cancelar-acao");
    const botaoFecharConfirmar = document.getElementById("botao-fechar-confirmar");

    // Substitui o confirm() feio do navegador por uma telinha nas cores do app
    function confirmarComTelinha(mensagem, titulo = "Confirmar") {
        return new Promise((resolve) => {
            tituloModalConfirmar.textContent = titulo;
            textoModalConfirmar.textContent = mensagem;
            fundoModalConfirmar.classList.add("aberto");

            function limpar() {
                fundoModalConfirmar.classList.remove("aberto");
                botaoConfirmarAcao.removeEventListener("click", aoConfirmar);
                botaoCancelarAcao.removeEventListener("click", aoCancelar);
                botaoFecharConfirmar.removeEventListener("click", aoCancelar);
            }
            function aoConfirmar() { limpar(); resolve(true); }
            function aoCancelar() { limpar(); resolve(false); }

            botaoConfirmarAcao.addEventListener("click", aoConfirmar);
            botaoCancelarAcao.addEventListener("click", aoCancelar);
            botaoFecharConfirmar.addEventListener("click", aoCancelar);
        });
    }
    const extratoVazio = document.getElementById("extrato-vazio");
    const filtroMes = document.getElementById("filtro-mes");
    const filtroValor = document.getElementById("filtro-valor");
    const filtroTexto = document.getElementById("filtro-texto");
    const limparFiltroMes = document.getElementById("limpar-filtro-mes");

    let uidAtual = null;
    let todosOsLancamentos = []; // guarda tudo que veio do Firestore, sem filtro

    // Se a pessoa chegou aqui pelo link "Ver extrato completo" da tela inicial,
    // a URL já vem com ?mes=2026-08 — pré-preenche o filtro de mês com isso.
    // Se veio de um clique no gráfico da tela inicial, também vem ?categoria=X
    const parametros = new URLSearchParams(window.location.search);
    const mesDaUrl = parametros.get("mes");
    if (mesDaUrl) filtroMes.value = mesDaUrl;

    const categoriaDaUrl = parametros.get("categoria");
    if (categoriaDaUrl) filtroTexto.value = categoriaDaUrl;

    // Remove acentos, pra "salario" encontrar "Salário" e vice-versa
    function removerAcentos(texto) {
        return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    onAuthStateChanged(auth, (usuario) => {
        if (!usuario) {
            window.location.href = "index.html";
            return;
        }
        uidAtual = usuario.uid;
        escutarTodosOsLancamentos();
    });

    function escutarTodosOsLancamentos() {
        const referencia = collection(db, "usuarios", uidAtual, "lancamentos");
        const consulta = query(referencia, orderBy("criadoEm", "desc"));

        onSnapshot(consulta, (snapshot) => {
            todosOsLancamentos = snapshot.docs;
            aplicarFiltrosERenderizar();
        });
    }

    // ==========================================================================
    // FILTROS — por mês (input type=month) e por valor (busca numérica)
    // ==========================================================================
    filtroMes.addEventListener("change", aplicarFiltrosERenderizar);
    filtroValor.addEventListener("input", aplicarFiltrosERenderizar);
    filtroTexto.addEventListener("input", aplicarFiltrosERenderizar);

    limparFiltroMes.addEventListener("click", () => {
        filtroMes.value = "";
        aplicarFiltrosERenderizar();
    });

    function aplicarFiltrosERenderizar() {
        // A "Retirada" (valor negativo em "Guardar Dinheiro") é só um registro
        // interno de controle do cofrinho — não aparece pra pessoa em lugar
        // nenhum das listas normais, só a "Retirada da Reserva" (verde) aparece
        let filtrados = todosOsLancamentos.filter(
            (documento) => !(documento.data().categoria === "Guardar Dinheiro" && documento.data().valor < 0)
        );

        if (filtroMes.value) {
            filtrados = filtrados.filter((documento) => {
                const dados = documento.data();
                // Usa "mesReferencia" quando existe (é o que decide em qual
                // mês o lançamento conta, separado da data exibida nele).
                // Lançamentos antigos, de antes dessa mudança, ainda não têm
                // esse campo — pra esses, cai de volta pra olhar a data mesmo
                const mesDoLancamento = dados.mesReferencia
                    || `${dados.data.toDate().getFullYear()}-${String(dados.data.toDate().getMonth() + 1).padStart(2, "0")}`;
                return mesDoLancamento === filtroMes.value;
            });
        }

        if (filtroValor.value) {
            const valorBuscado = paraNumero(filtroValor.value);
            if (!isNaN(valorBuscado)) {
                filtrados = filtrados.filter((documento) => {
                    const valorLancamento = documento.data().valor;
                    // Compara arredondado a 2 casas, pra bater com o que a pessoa digitou
                    return Math.round(valorLancamento * 100) === Math.round(valorBuscado * 100);
                });
            }
        }

        const textoBuscado = removerAcentos(filtroTexto.value.trim().toLowerCase());
        if (textoBuscado) {
            filtrados = filtrados.filter((documento) => {
                const dados = documento.data();
                const campos = removerAcentos([dados.descricao, dados.categoria, dados.meta].filter(Boolean).join(" ").toLowerCase());
                return campos.includes(textoBuscado);
            });
        }

        renderizarLista(filtrados);
    }

    // ==========================================================================
    // RENDERIZAÇÃO
    // ==========================================================================
    function renderizarLista(documentos) {
        listaExtrato.innerHTML = "";
        extratoVazio.hidden = documentos.length > 0;

        documentos.forEach((documento) => {
            const dados = documento.data();
            const dataObj = dados.data.toDate();
            const dataFormatada = dataObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
            const horaFormatada = dataObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
            const sinal = dados.tipo === "ganho" ? "+" : "-";

            const item = document.createElement("li");
            item.className = `item-lancamento tipo-${dados.tipo}${dados.categoria === "Guardar Dinheiro" ? " tipo-cofre" : ""}`;
            item._dadosOriginais = dados;
            if (dados.tipo === "gasto") {
                item.style.setProperty("--cor-categoria-item", corDaCategoria(dados.categoria));
            }

            const ehCofrinho = dados.categoria === "Guardar Dinheiro";
            const tituloGrande = ehCofrinho
                ? (dados.meta || "Guardado")
                : (dados.descricao || dados.categoria);

            // Forma de pagamento e banco — só pros lançamentos normais
            // (Gasto/Extra), o cofrinho já mostra o banco dele de outro
            // jeito, não precisa duplicar aqui
            const nomesFormaPagamento = { dinheiro: "Dinheiro", pix: "PIX", debito: "Débito", credito: "Crédito" };
            let textoFormaPagamento = "";
            if (!ehCofrinho) {
                if (dados.formaPagamento) {
                    textoFormaPagamento += ` · ${nomesFormaPagamento[dados.formaPagamento] || dados.formaPagamento}`;
                }
                if (dados.banco) {
                    textoFormaPagamento += ` · ${dados.banco}`;
                }
            }

            item.innerHTML = `
                <span class="ponto-categoria"></span>
                <div class="info-lancamento">
                    <div class="descricao-lancamento">${tituloGrande}</div>
                    <div class="meta-lancamento">${dados.categoria} · ${dataFormatada} às ${horaFormatada}${textoFormaPagamento}</div>
                </div>
                <span class="valor-lancamento">${sinal} ${formatarMoeda(dados.valor)}</span>
                <button class="botao-excluir" data-id="${documento.id}" data-categoria="${dados.categoria}" aria-label="Excluir lançamento">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/>
                    </svg>
                </button>
            `;
            listaExtrato.appendChild(item);
        });
    }

    let timeoutToast = null;

    function mostrarToastComAcao(mensagem, textoBotao, aoClicar, duracaoMs = 5000) {
        if (timeoutToast) clearTimeout(timeoutToast);
        toastMensagem.textContent = mensagem;
        toastBotaoAcao.textContent = textoBotao;
        toastBotaoAcao.hidden = false;
        toastBotaoAcao.onclick = () => {
            clearTimeout(timeoutToast);
            toast.hidden = true;
            aoClicar();
        };
        toast.hidden = false;
        timeoutToast = setTimeout(() => { toast.hidden = true; }, duracaoMs);
    }

    listaExtrato.addEventListener("click", async (evento) => {
        const botao = evento.target.closest(".botao-excluir");
        if (!botao) return;

        // Itens do cofrinho ("Guardar Dinheiro") e o lançamento irmão que
        // devolve o valor pro saldo ("Retirada da Reserva") só podem ser
        // excluídos pela tela "Saldo Guardado" — excluir só um dos dois
        // por aqui desbalancearia o total guardado ou o saldo principal
        if (botao.dataset.categoria === "Guardar Dinheiro" || botao.dataset.categoria === "Retirada da Reserva") {
            window.alert("Esse lançamento faz parte do seu Saldo Guardado. Pra excluir ou ajustar, vai em Saldo Guardado no menu lateral.");
            return;
        }

        const confirmou = await confirmarComTelinha("Tem certeza de que deseja excluir este lançamento?");
        if (!confirmou) return;

        const itemPai = botao.closest(".item-lancamento");
        const dadosParaDesfazer = itemPai && itemPai._dadosOriginais ? { ...itemPai._dadosOriginais } : null;

        await deleteDoc(doc(db, "usuarios", uidAtual, "lancamentos", botao.dataset.id));

        if (dadosParaDesfazer) {
            mostrarToastComAcao("Lançamento excluído.", "Desfazer", async () => {
                await addDoc(collection(db, "usuarios", uidAtual, "lancamentos"), {
                    tipo: dadosParaDesfazer.tipo,
                    valor: dadosParaDesfazer.valor,
                    categoria: dadosParaDesfazer.categoria,
                    descricao: dadosParaDesfazer.descricao || "",
                    data: dadosParaDesfazer.data,
                    criadoEm: serverTimestamp()
                });
            });
        }
    });

    // Converte texto digitado em número, aceitando vírgula ou ponto como
    // separador decimal (os campos de valor viraram type="text" pra isso)
    function paraNumero(texto) {
        return parseFloat(String(texto).replace(/\./g, "").replace(",", "."));
    }

    function formatarMoeda(valor) {
        // Corrige o "zero negativo" do JavaScript — quando uma conta bate
        // exatamente em zero (tipo saldo - gastos - lembretes = 0), o
        // resultado às vezes vem como -0 tecnicamente, e sem isso aqui
        // apareceria "-R$ 0,00" na tela, o que é enganoso (não é negativo de verdade)
        const valorCorrigido = valor === 0 ? 0 : valor;
        return valorCorrigido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

});
