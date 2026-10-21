import { formatarMoeda, paraNumero } from "./util.js";
import { escaparHtml } from "./texto.js";
import { confirmarComTelinha, mostrarToastComAcao } from "./avisos.js";
import { excluirOutraParte } from "./divisao.js";
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection, addDoc, deleteDoc, doc, query, where, orderBy, onSnapshot, getDocs, Timestamp, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { montarLancamentosDeCartao } from "./cartaoNoExtrato.js";
import { corDaCategoria, registrarCategorias } from "./cores.js";


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

    const extratoVazio = document.getElementById("extrato-vazio");
    const filtroTexto = document.getElementById("filtro-texto");
    const botaoLimparBusca = document.getElementById("limpar-busca");
    const rotuloMes = document.getElementById("rotulo-mes");
    const botaoMesAnterior = document.getElementById("mes-anterior");
    const botaoMesSeguinte = document.getElementById("mes-seguinte");
    const resumoBusca = document.getElementById("resumo-busca");
    const resumoTexto = document.getElementById("resumo-texto");
    const botaoLimparFiltros = document.getElementById("limpar-filtros");

    let uidAtual = null;
    let todosOsLancamentos = []; // guarda tudo que veio do Firestore, sem filtro
    let docsComprasCartao = []; // compras no crédito (pendências com noCartao = true)
    let nomesCartoes = {}; // { cartaoId: "Nubank" }
    let categoriasForaDosTotais = new Set(); // categorias de repasse/acerto: não entram no resumo
    let mesFiltrado = ""; // "AAAA-MM" ou "" (todos os meses)

    // Se a pessoa chegou aqui pelo link "Ver extrato completo" da tela inicial,
    // a URL já vem com ?mes=2026-08 — pré-preenche o filtro de mês com isso.
    // Se veio de um clique no gráfico da tela inicial, também vem ?categoria=X
    const parametros = new URLSearchParams(window.location.search);
    const mesDaUrl = parametros.get("mes");
    if (mesDaUrl && /^\d{4}-\d{2}$/.test(mesDaUrl)) mesFiltrado = mesDaUrl;

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
        escutarComprasDoCartao();
        escutarCategoriasDeRepasse();
    });

    // Categorias de repasse/acerto ficam fora do resumo (igual à tela inicial)
    function escutarCategoriasDeRepasse() {
        onSnapshot(collection(db, "usuarios", uidAtual, "categorias"), (snapshot) => {
            categoriasForaDosTotais = new Set(
                snapshot.docs.filter((d) => d.data().foraDosTotais).map((d) => d.data().nome)
            );
            aplicarFiltrosERenderizar();
        }, () => { /* sem isso, o resumo só inclui os repasses */ });
    }

    // Compras no cartão de crédito também aparecem aqui, na lista — só pra
    // mostrar (ver cartaoNoExtrato.js): não mexem em saldo, que só desce
    // quando a fatura é paga.
    async function escutarComprasDoCartao() {
        try {
            const cartoes = await getDocs(collection(db, "usuarios", uidAtual, "cartoes"));
            cartoes.forEach((documento) => { nomesCartoes[documento.id] = documento.data().nome; });
        } catch (erro) { /* sem o nome do cartão, só não mostra qual foi */ }

        const consulta = query(collection(db, "usuarios", uidAtual, "pendencias"), where("noCartao", "==", true));
        onSnapshot(consulta, (snapshot) => {
            docsComprasCartao = snapshot.docs;
            aplicarFiltrosERenderizar();
        });
    }

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
    // Filtro por forma de pagamento (chips)
    let formaPagamentoFiltrada = "";
    const chipsFormaPagamento = document.querySelectorAll(".chip-forma");
    chipsFormaPagamento.forEach((chip) => {
        chip.addEventListener("click", () => {
            formaPagamentoFiltrada = chip.dataset.forma;
            chipsFormaPagamento.forEach((outro) => outro.classList.toggle("ativo", outro === chip));
            aplicarFiltrosERenderizar();
        });
    });

    filtroTexto.addEventListener("input", aplicarFiltrosERenderizar);

    botaoLimparBusca.addEventListener("click", () => {
        filtroTexto.value = "";
        filtroTexto.focus();
        aplicarFiltrosERenderizar();
    });

    // --- Mês com setas ---
    const NOMES_MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

    function mesDeHoje() {
        const hoje = new Date();
        return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
    }

    function somarMeses(mesTexto, quantidade) {
        const [ano, mes] = mesTexto.split("-").map(Number);
        const nova = new Date(ano, mes - 1 + quantidade, 1);
        return `${nova.getFullYear()}-${String(nova.getMonth() + 1).padStart(2, "0")}`;
    }

    function desenharRotuloMes() {
        if (!mesFiltrado) {
            rotuloMes.textContent = "Todos os meses";
            rotuloMes.setAttribute("aria-label", "Todos os meses. Toque para ver só o mês atual");
            return;
        }
        const [ano, mes] = mesFiltrado.split("-").map(Number);
        const nomeMes = NOMES_MESES_LONGOS[mes - 1];
        rotuloMes.textContent = `${nomeMes.charAt(0).toUpperCase()}${nomeMes.slice(1)} de ${ano}`;
        rotuloMes.setAttribute("aria-label", "Ver todos os meses");
    }

    botaoMesAnterior.addEventListener("click", () => {
        mesFiltrado = somarMeses(mesFiltrado || mesDeHoje(), mesFiltrado ? -1 : 0);
        aplicarFiltrosERenderizar();
    });
    botaoMesSeguinte.addEventListener("click", () => {
        mesFiltrado = somarMeses(mesFiltrado || mesDeHoje(), mesFiltrado ? 1 : 0);
        aplicarFiltrosERenderizar();
    });
    rotuloMes.addEventListener("click", () => {
        mesFiltrado = mesFiltrado ? "" : mesDeHoje();
        aplicarFiltrosERenderizar();
    });

    botaoLimparFiltros.addEventListener("click", () => {
        filtroTexto.value = "";
        mesFiltrado = "";
        formaPagamentoFiltrada = "";
        chipsFormaPagamento.forEach((chip) => chip.classList.toggle("ativo", chip.dataset.forma === ""));
        aplicarFiltrosERenderizar();
    });

    function desenharResumo(documentos) {
        const filtrosAtivos = !!(filtroTexto.value.trim() || mesFiltrado || formaPagamentoFiltrada);
        botaoLimparFiltros.hidden = !filtrosAtivos;
        botaoLimparBusca.hidden = !filtroTexto.value;
        resumoBusca.hidden = documentos.length === 0 && !filtrosAtivos;

        let ganhos = 0;
        let gastos = 0;
        documentos.forEach((documento) => {
            const dados = documento.data();
            if (dados.tipo === "transferencia") return;
            if (dados.categoria === "Guardar Dinheiro" || dados.categoria === "Retirada da Reserva") return;
            if (categoriasForaDosTotais.has(dados.categoria)) return;
            if (dados.tipo === "ganho") ganhos += dados.valor;
            else if (dados.tipo === "gasto") gastos += dados.valor;
        });
        const quantidade = documentos.length;
        resumoTexto.textContent = quantidade === 0
            ? "Nada encontrado"
            : `${quantidade} ${quantidade === 1 ? "lançamento" : "lançamentos"} · Ganhos ${formatarMoeda(ganhos)} · Gastos ${formatarMoeda(gastos)}`;
    }

    function aplicarFiltrosERenderizar() {
        // A "Retirada" (valor negativo em "Guardar Dinheiro") é só um registro
        // interno de controle do cofrinho — não aparece pra pessoa em lugar
        // nenhum das listas normais, só a "Retirada da Reserva" (verde) aparece
        const dataParaOrdenar = (documento) => {
            const dados = documento.data();
            return (dados.criadoEm && dados.criadoEm.toDate ? dados.criadoEm.toDate() : dados.data.toDate()).getTime();
        };
        const comprasDoCartao = montarLancamentosDeCartao(docsComprasCartao, nomesCartoes);
        // Dá cor diferente a cada categoria que existe (igual às outras telas)
        registrarCategorias([...todosOsLancamentos, ...comprasDoCartao].map((d) => d.data().categoria));
        const todosJuntos = [...todosOsLancamentos, ...comprasDoCartao].sort((a, b) => dataParaOrdenar(b) - dataParaOrdenar(a));

        let filtrados = todosJuntos.filter(
            (documento) => !(documento.data().categoria === "Guardar Dinheiro" && documento.data().valor < 0)
        );

        if (formaPagamentoFiltrada === "transferencia") {
            filtrados = filtrados.filter((documento) => documento.data().tipo === "transferencia");
        } else if (formaPagamentoFiltrada) {
            filtrados = filtrados.filter((documento) => documento.data().formaPagamento === formaPagamentoFiltrada);
        }

        if (mesFiltrado) {
            filtrados = filtrados.filter((documento) => {
                const dados = documento.data();
                // Usa "mesReferencia" quando existe (é o que decide em qual
                // mês o lançamento conta, separado da data exibida nele).
                // Lançamentos antigos, de antes dessa mudança, ainda não têm
                // esse campo — pra esses, cai de volta pra olhar a data mesmo
                const mesDoLancamento = dados.mesReferencia
                    || `${dados.data.toDate().getFullYear()}-${String(dados.data.toDate().getMonth() + 1).padStart(2, "0")}`;
                return mesDoLancamento === mesFiltrado;
            });
        }

        // Uma só barra: acha por nome, categoria, banco... e, se o que foi
        // digitado parece um valor (ex: 50 ou 50,90), também por valor exato
        const textoBuscado = removerAcentos(filtroTexto.value.trim().toLowerCase());
        if (textoBuscado) {
            const pareceValor = /^(r\$\s*)?\d+([.,]\d{1,2})?$/.test(textoBuscado);
            const valorBuscado = pareceValor ? paraNumero(textoBuscado.replace(/^r\$\s*/, "")) : NaN;
            filtrados = filtrados.filter((documento) => {
                const dados = documento.data();
                const campos = removerAcentos([dados.descricao, dados.categoria, dados.meta, dados.banco, dados.bancoOrigem].filter(Boolean).join(" ").toLowerCase());
                if (campos.includes(textoBuscado)) return true;
                return !isNaN(valorBuscado) && Math.round(dados.valor * 100) === Math.round(valorBuscado * 100);
            });
        }

        desenharRotuloMes();
        desenharResumo(filtrados);
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
            const ehTransferencia = dados.tipo === "transferencia";
            const sinal = ehTransferencia ? "⇄" : (dados.tipo === "ganho" ? "+" : "-");

            const item = document.createElement("li");
            item.className = `item-lancamento tipo-${dados.tipo}${dados.categoria === "Guardar Dinheiro" ? " tipo-cofre" : ""}`;
            item._dadosOriginais = dados;
            item._idDoc = documento.id;
            const editavel = !ehTransferencia && !dados.ehItemCartao && dados.categoria !== "Guardar Dinheiro" && dados.categoria !== "Retirada da Reserva";
            if (editavel) item.style.cursor = "pointer";
            if (dados.tipo === "gasto") {
                item.style.setProperty("--cor-categoria-item", corDaCategoria(dados.categoria));
            }

            const ehCofrinho = dados.categoria === "Guardar Dinheiro";
            const tituloGrande = ehCofrinho
                ? (dados.meta || "Guardado")
                : (ehTransferencia ? (dados.descricao || "Transferência") : (dados.descricao || dados.categoria));
            const textoMetaItem = ehTransferencia
                ? `${dados.bancoOrigem || "?"} → ${dados.banco || "?"}`
                : dados.categoria;

            // Forma de pagamento e banco — só pros lançamentos normais
            // (Gasto/Extra), o cofrinho já mostra o banco dele de outro
            // jeito, não precisa duplicar aqui
            const nomesFormaPagamento = { dinheiro: "Dinheiro", pix: "PIX", debito: "Débito", credito: "Crédito" };
            let textoFormaPagamento = "";
            if (!ehCofrinho && !ehTransferencia) {
                if (dados.formaPagamento) {
                    textoFormaPagamento += ` · ${nomesFormaPagamento[dados.formaPagamento] || dados.formaPagamento}`;
                }
                if (dados.banco) {
                    textoFormaPagamento += ` · ${escaparHtml(dados.banco)}`;
                }
            }

            item.innerHTML = `
                <span class="ponto-categoria"></span>
                <div class="info-lancamento">
                    <div class="descricao-lancamento">${escaparHtml(tituloGrande)}</div>
                    <div class="meta-lancamento">${escaparHtml(textoMetaItem)} · ${dataFormatada} às ${horaFormatada}${textoFormaPagamento}</div>
                </div>
                <span class="valor-lancamento">${sinal} ${formatarMoeda(dados.valor)}</span>
                <button class="botao-excluir" data-id="${documento.id}" data-categoria="${escaparHtml(dados.categoria)}" data-item-cartao="${dados.ehItemCartao ? "1" : ""}" aria-label="Excluir lançamento">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/>
                    </svg>
                </button>
            `;
            listaExtrato.appendChild(item);
        });
    }



    listaExtrato.addEventListener("click", async (evento) => {
        const botao = evento.target.closest(".botao-excluir");
        if (!botao) {
            // Toque no item (fora da lixeira): abre a edição na tela inicial
            const itemTocado = evento.target.closest(".item-lancamento");
            if (!itemTocado || !itemTocado._dadosOriginais) return;
            const d = itemTocado._dadosOriginais;
            if (d.tipo === "transferencia") {
                await confirmarComTelinha("Transferência não pode ser editada. Para corrigir, exclua e faça de novo.", "Transferência");
                return;
            }
            if (d.ehItemCartao) {
                await confirmarComTelinha("Essa é uma compra no cartão de crédito. Para editar, vai em Bancos e Cartões.", "Compra no cartão");
                return;
            }
            if (d.categoria === "Guardar Dinheiro" || d.categoria === "Retirada da Reserva") {
                await confirmarComTelinha("Esse lançamento faz parte do Saldo Guardado. Para ajustar, vai na aba Guardado.", "Saldo Guardado");
                return;
            }
            window.location.href = `dashboard.html?editar=${encodeURIComponent(itemTocado._idDoc)}`;
            return;
        }

        // Compra no cartão de crédito: quem gerencia (e exclui) é a tela
        // Bancos e Cartões — aqui é só consulta
        if (botao.dataset.itemCartao === "1") {
            await confirmarComTelinha("Essa é uma compra no cartão de crédito. Pra excluir ou ajustar, vai em Bancos e Cartões.", "Compra no cartão");
            return;
        }

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
        if (dadosParaDesfazer && dadosParaDesfazer.divisaoId) {
            const apagouOutra = await excluirOutraParte(uidAtual, "lancamentos", dadosParaDesfazer.divisaoId, botao.dataset.id, confirmarComTelinha);
            if (apagouOutra) return;
        }

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



});
