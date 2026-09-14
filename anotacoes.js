import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, getDocs, getDoc, setDoc, writeBatch,
    query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const NOMES_MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

document.addEventListener("DOMContentLoaded", function () {

    const rotuloMes = document.getElementById("rotulo-mes");
    const mesAnteriorBtn = document.getElementById("mes-anterior");
    const mesProximoBtn = document.getElementById("mes-proximo");
    const anoAnteriorBtn = document.getElementById("ano-anterior");
    const anoProximoBtn = document.getElementById("ano-proximo");

    const saldoComLembretesEl = document.getElementById("saldo-com-lembretes");

    const listaAnotacoes = document.getElementById("lista-anotacoes");
    const anotacoesVazio = document.getElementById("anotacoes-vazio");

    const botaoAlternarSelecao = document.getElementById("botao-alternar-selecao");
    const botaoExcluirSelecionados = document.getElementById("botao-excluir-selecionados");

    const botaoAbrirNovaAnotacao = document.getElementById("botao-abrir-nova-anotacao");
    const botaoFecharAnotacao = document.getElementById("botao-fechar-anotacao");
    const fundoModalAnotacao = document.getElementById("fundo-modal-anotacao");
    const tituloModalAnotacao = document.getElementById("titulo-modal-anotacao");
    const campoNomeConta = document.getElementById("campo-nome-conta");
    const campoValorConta = document.getElementById("campo-valor-conta");
    const campoDiaVencimentoWrapper = document.getElementById("campo-dia-vencimento-wrapper");
    const campoDiaVencimento = document.getElementById("campo-dia-vencimento");
    const campoSemVencimento = document.getElementById("campo-sem-vencimento");
    const mensagemAvisoAnotacao = document.getElementById("mensagem-aviso-anotacao");
    const botaoSalvarAnotacao = document.getElementById("botao-salvar-anotacao");
    const textoBotaoSalvarAnotacao = botaoSalvarAnotacao.querySelector(".texto-botao");
    const spinnerAnotacao = botaoSalvarAnotacao.querySelector(".spinner-botao");

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

    let uidAtual = null;
    let mesSelecionado = new Date();

    // Formata pro padrão "AAAA-MM" — mesmo campo usado nos lançamentos pra
    // decidir em qual mês eles contam (separado da data exibida neles)
    function mesReferenciaString(data) {
        return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
    }
    let modoSelecao = false;
    let idEmEdicao = null; // null = criando novo | string = editando esse lembrete
    let ultimoTotalAnotacoes = 0; // usado pra recalcular o saldo quando o saldo real mudar

    aplicarMascaraValor(campoValorConta);

    onAuthStateChanged(auth, async (usuario) => {
        if (!usuario) {
            window.location.href = "index.html";
            return;
        }
        uidAtual = usuario.uid;

        const perfilSnapshot = await getDoc(doc(db, "usuarios", uidAtual));
        const jaMigrou = perfilSnapshot.exists() && perfilSnapshot.data().migracaoMesReferenciaConcluida;
        if (!jaMigrou) await migrarLancamentosAntigos();

        atualizarRotuloMes();
        escutarAnotacoesDoMes();
        escutarSaldoRealDoMes();
    });

    // Mesma correção automática que roda no dashboard — garante que essa
    // página funcione certinho mesmo se for a primeira que a pessoa abrir
    // depois de logar (sem passar pela tela inicial antes)
    async function migrarLancamentosAntigos() {
        const referencia = collection(db, "usuarios", uidAtual, "lancamentos");
        const todosOsLancamentos = await getDocs(referencia);

        const semMesReferencia = todosOsLancamentos.docs.filter((documento) => !documento.data().mesReferencia);

        if (semMesReferencia.length > 0) {
            for (let inicio = 0; inicio < semMesReferencia.length; inicio += 450) {
                const pedaco = semMesReferencia.slice(inicio, inicio + 450);
                const lote = writeBatch(db);
                pedaco.forEach((documento) => {
                    const dataDoLancamento = documento.data().data.toDate();
                    lote.update(documento.ref, { mesReferencia: mesReferenciaString(dataDoLancamento) });
                });
                await lote.commit();
            }
        }

        await setDoc(doc(db, "usuarios", uidAtual), { migracaoMesReferenciaConcluida: true }, { merge: true });
    }

    // ==========================================================================
    // NAVEGAÇÃO ENTRE MESES
    // ==========================================================================
    function atualizarRotuloMes() {
        rotuloMes.textContent = `${NOMES_MESES[mesSelecionado.getMonth()]} ${mesSelecionado.getFullYear()}`;
    }

    function mudarPeriodo(mesesParaSomar) {
        mesSelecionado = new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth() + mesesParaSomar, 1);
        atualizarRotuloMes();
        sairDoModoSelecao();
        escutarAnotacoesDoMes();
        escutarSaldoRealDoMes();
    }

    mesAnteriorBtn.addEventListener("click", () => mudarPeriodo(-1));
    mesProximoBtn.addEventListener("click", () => mudarPeriodo(1));
    anoAnteriorBtn.addEventListener("click", () => mudarPeriodo(-12));
    anoProximoBtn.addEventListener("click", () => mudarPeriodo(12));

    function chaveDoMesSelecionado() {
        return `${mesSelecionado.getFullYear()}-${String(mesSelecionado.getMonth() + 1).padStart(2, "0")}`;
    }

    // ==========================================================================
    // SALDO REAL DO MÊS (mesma conta da tela inicial: ganhos - gastos,
    // ignorando "Guardar Dinheiro" nos depósitos que ainda não afetam saldo
    // real da mesma forma que o dashboard já faz)
    // ==========================================================================
    let pararDeEscutarSaldoReal = null;
    let saldoRealAtual = 0;

    function escutarSaldoRealDoMes() {
        if (pararDeEscutarSaldoReal) pararDeEscutarSaldoReal();

        const mesReferenciaAtual = mesReferenciaString(mesSelecionado);

        const referencia = collection(db, "usuarios", uidAtual, "lancamentos");
        const consulta = query(referencia, where("mesReferencia", "==", mesReferenciaAtual));

        pararDeEscutarSaldoReal = onSnapshot(consulta, (snapshot) => {
            let totalGanhos = 0;
            let totalGastos = 0;

            snapshot.forEach((documento) => {
                const dados = documento.data();
                if (dados.categoria === "Guardar Dinheiro") {
                    if (dados.valor > 0) totalGastos += dados.valor;
                    return;
                }
                if (dados.tipo === "ganho") totalGanhos += dados.valor;
                else totalGastos += dados.valor;
            });

            saldoRealAtual = totalGanhos - totalGastos;
            atualizarSaldoExibido();
        });
    }

    function atualizarSaldoExibido() {
        const saldoFinal = saldoRealAtual - ultimoTotalAnotacoes;
        saldoComLembretesEl.textContent = formatarMoeda(saldoFinal);
    }

    // ==========================================================================
    // LEMBRETES DO MÊS SELECIONADO
    // ==========================================================================
    let pararDeEscutarAnotacoes = null;

    function escutarAnotacoesDoMes() {
        if (pararDeEscutarAnotacoes) pararDeEscutarAnotacoes();

        const referencia = collection(db, "usuarios", uidAtual, "anotacoes");
        const consulta = query(referencia, where("mesReferencia", "==", chaveDoMesSelecionado()));

        pararDeEscutarAnotacoes = onSnapshot(consulta, (snapshot) => {
            const documentosOrdenados = [...snapshot.docs].sort(
                (a, b) => (a.data().diaVencimento ?? 999) - (b.data().diaVencimento ?? 999)
            );

            ultimoTotalAnotacoes = documentosOrdenados.reduce((soma, documento) => soma + (documento.data().valor || 0), 0);
            atualizarSaldoExibido();

            renderizarAnotacoes(documentosOrdenados);
        });
    }

    function renderizarAnotacoes(documentos) {
        listaAnotacoes.innerHTML = "";
        anotacoesVazio.hidden = documentos.length > 0;

        documentos.forEach((documento) => {
            const dados = documento.data();
            const estaPaga = dados.pago === true;

            let dataCriacaoTexto = "";
            if (dados.criadoEm) {
                const dataCriacao = dados.criadoEm.toDate();
                const dataFormatada = dataCriacao.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
                const horaFormatada = dataCriacao.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
                dataCriacaoTexto = ` · Anotado em ${dataFormatada} às ${horaFormatada}`;
            }

            const temVencimento = dados.diaVencimento !== null && dados.diaVencimento !== undefined;
            const textoVencimento = temVencimento ? `Vence dia ${dados.diaVencimento}` : "Sem vencimento definido";

            const item = document.createElement("li");
            item.className = "item-conta";
            item.dataset.id = documento.id;
            item._dadosOriginais = dados;
            item.innerHTML = `
                ${modoSelecao ? `<input type="checkbox" class="checkbox-selecao" data-id="${documento.id}">` : ""}
                <div class="info-conta">
                    <div class="nome-conta">${dados.nome}</div>
                    <div class="meta-conta">${textoVencimento}${dataCriacaoTexto}</div>
                </div>
                <span class="valor-conta">${formatarMoeda(dados.valor || 0)}</span>
                <div class="status-conta">
                    <button class="botao-marcar-pago ${estaPaga ? "pago" : ""}" data-id="${documento.id}" data-pago="${estaPaga}">
                        ${estaPaga ? "✓ Paga" : "Marcar como paga"}
                    </button>
                    <button class="botao-excluir-conta" data-id="${documento.id}" aria-label="Excluir lembrete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/>
                        </svg>
                    </button>
                </div>
            `;
            listaAnotacoes.appendChild(item);
        });
    }

    // ==========================================================================
    // MODO SELEÇÃO MÚLTIPLA
    // ==========================================================================
    function entrarNoModoSelecao() {
        modoSelecao = true;
        botaoAlternarSelecao.textContent = "Cancelar";
        botaoExcluirSelecionados.hidden = false;
        escutarAnotacoesDoMes(); // re-renderiza já com os checkboxes
    }

    function sairDoModoSelecao() {
        modoSelecao = false;
        botaoAlternarSelecao.textContent = "Selecionar";
        botaoExcluirSelecionados.hidden = true;
    }

    botaoAlternarSelecao.addEventListener("click", () => {
        if (modoSelecao) {
            sairDoModoSelecao();
            escutarAnotacoesDoMes();
        } else {
            entrarNoModoSelecao();
        }
    });

    botaoExcluirSelecionados.addEventListener("click", async () => {
        const marcados = [...listaAnotacoes.querySelectorAll(".checkbox-selecao:checked")];
        if (marcados.length === 0) {
            window.alert("Marca pelo menos um lembrete pra excluir.");
            return;
        }

        const confirmou = await confirmarComTelinha(`Tem certeza de que deseja excluir ${marcados.length} lembrete(s)?`);
        if (!confirmou) return;

        for (const checkbox of marcados) {
            await deleteDoc(doc(db, "usuarios", uidAtual, "anotacoes", checkbox.dataset.id));
        }

        sairDoModoSelecao();
    });

    // ==========================================================================
    // MARCAR COMO PAGA / EXCLUIR (individual, fora do modo seleção)
    // ==========================================================================
    listaAnotacoes.addEventListener("click", async (evento) => {
        if (modoSelecao) return; // no modo seleção, o clique é só no checkbox

        const botaoPago = evento.target.closest(".botao-marcar-pago");
        if (botaoPago) {
            const estavaPago = botaoPago.dataset.pago === "true";
            await updateDoc(doc(db, "usuarios", uidAtual, "anotacoes", botaoPago.dataset.id), {
                pago: !estavaPago
            });
            return;
        }

        const botaoExcluir = evento.target.closest(".botao-excluir-conta");
        if (botaoExcluir) {
            const confirmou = await confirmarComTelinha("Tem certeza de que deseja excluir esse lembrete?");
            if (!confirmou) return;
            await deleteDoc(doc(db, "usuarios", uidAtual, "anotacoes", botaoExcluir.dataset.id));
            return;
        }

        // Clique em qualquer outro ponto do item (fora dos botões) abre a edição
        const item = evento.target.closest(".item-conta");
        if (item && item._dadosOriginais) {
            abrirModalEdicao(item.dataset.id, item._dadosOriginais);
        }
    });

    // ==========================================================================
    // NOVO LEMBRETE / EDITAR LEMBRETE (mesmo modal, muda o comportamento)
    // ==========================================================================
    function alternarCampoVencimento() {
        const semVencimento = campoSemVencimento.checked;
        campoDiaVencimentoWrapper.hidden = semVencimento;
        if (semVencimento) campoDiaVencimento.value = "";
    }

    campoSemVencimento.addEventListener("change", alternarCampoVencimento);

    function abrirModalAnotacao() {
        idEmEdicao = null;
        tituloModalAnotacao.textContent = "Novo lembrete";
        textoBotaoSalvarAnotacao.textContent = "Salvar lembrete";
        campoNomeConta.value = "";
        campoValorConta.value = "";
        campoDiaVencimento.value = "";
        campoSemVencimento.checked = false;
        alternarCampoVencimento();
        mensagemAvisoAnotacao.classList.remove("visivel");
        fundoModalAnotacao.classList.add("aberto");
    }

    function abrirModalEdicao(id, dados) {
        idEmEdicao = id;
        tituloModalAnotacao.textContent = "Editar lembrete";
        textoBotaoSalvarAnotacao.textContent = "Salvar alterações";
        campoNomeConta.value = dados.nome;
        campoValorConta.value = dados.valor.toFixed(2).replace(".", ",");

        const temVencimento = dados.diaVencimento !== null && dados.diaVencimento !== undefined;
        campoDiaVencimento.value = temVencimento ? dados.diaVencimento : "";
        campoSemVencimento.checked = !temVencimento;
        alternarCampoVencimento();

        mensagemAvisoAnotacao.classList.remove("visivel");
        fundoModalAnotacao.classList.add("aberto");
    }

    function fecharModalAnotacao() {
        fundoModalAnotacao.classList.remove("aberto");
    }

    botaoAbrirNovaAnotacao.addEventListener("click", abrirModalAnotacao);
    botaoFecharAnotacao.addEventListener("click", fecharModalAnotacao);
    fundoModalAnotacao.addEventListener("click", (evento) => {
        if (evento.target === fundoModalAnotacao) fecharModalAnotacao();
    });

    botaoSalvarAnotacao.addEventListener("click", async () => {
        const nome = campoNomeConta.value.trim();
        const valor = paraNumero(campoValorConta.value);
        const temVencimento = !campoSemVencimento.checked;
        const dia = temVencimento ? parseInt(campoDiaVencimento.value, 10) : null;
        mensagemAvisoAnotacao.classList.remove("visivel");

        if (!nome) {
            mensagemAvisoAnotacao.textContent = "Digita o nome do lembrete.";
            mensagemAvisoAnotacao.classList.add("visivel");
            return;
        }
        if (!valor || valor <= 0) {
            mensagemAvisoAnotacao.textContent = "Digita um valor maior que zero.";
            mensagemAvisoAnotacao.classList.add("visivel");
            return;
        }
        if (temVencimento && (!dia || dia < 1 || dia > 31)) {
            mensagemAvisoAnotacao.textContent = "Digita um dia válido (entre 1 e 31), ou marca \"Não tem vencimento definido\".";
            mensagemAvisoAnotacao.classList.add("visivel");
            return;
        }

        botaoSalvarAnotacao.disabled = true;
        spinnerAnotacao.hidden = false;

        if (idEmEdicao) {
            // Editando um lembrete já existente — só atualiza os campos,
            // sem mexer no mês, no "pago" ou na data de criação
            await updateDoc(doc(db, "usuarios", uidAtual, "anotacoes", idEmEdicao), {
                nome,
                valor,
                diaVencimento: dia
            });
        } else {
            // O lembrete fica salvo no mês que está sendo visto no momento —
            // assim dá pra criar lembretes futuros navegando pra frente antes de salvar
            await addDoc(collection(db, "usuarios", uidAtual, "anotacoes"), {
                nome,
                valor,
                diaVencimento: dia,
                mesReferencia: chaveDoMesSelecionado(),
                pago: false,
                criadoEm: serverTimestamp()
            });
        }

        botaoSalvarAnotacao.disabled = false;
        spinnerAnotacao.hidden = true;
        fecharModalAnotacao();
    });

    // Converte texto digitado em número — remove pontos (separador de
    // milhar) antes de trocar a vírgula por ponto decimal
    function paraNumero(texto) {
        return parseFloat(String(texto).replace(/\./g, "").replace(",", "."));
    }

    // Aplica a máscara "tipo caixa eletrônico": os dígitos digitados
    // entram sempre da direita pra esquerda (representando centavos), sem
    // precisar digitar vírgula
    function aplicarMascaraValor(input) {
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

    function formatarMoeda(valor) {
        // Corrige o "zero negativo" do JavaScript — quando uma conta bate
        // exatamente em zero (tipo saldo - gastos - lembretes = 0), o
        // resultado às vezes vem como -0 tecnicamente, e sem isso aqui
        // apareceria "-R$ 0,00" na tela, o que é enganoso (não é negativo de verdade)
        const valorCorrigido = valor === 0 ? 0 : valor;
        return valorCorrigido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

});
