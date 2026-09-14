import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs,
    query, where, onSnapshot, Timestamp, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    const listaBancosReais = document.getElementById("lista-bancos-reais");
    const bancosReaisVazio = document.getElementById("bancos-reais-vazio");
    const botaoAbrirNovoBancoReal = document.getElementById("botao-abrir-novo-banco-real");

    const fundoModalBancoReal = document.getElementById("fundo-modal-banco-real");
    const tituloModalBancoReal = document.getElementById("titulo-modal-banco-real");
    const botaoFecharBancoReal = document.getElementById("botao-fechar-banco-real");
    const campoNomeBancoReal = document.getElementById("campo-nome-banco-real");
    const campoSaldoInicialBanco = document.getElementById("campo-saldo-inicial-banco");
    const textoSaldoAtualBanco = document.getElementById("texto-saldo-atual-banco");
    const campoCorrigirSaldoWrapper = document.getElementById("campo-corrigir-saldo-wrapper");
    const campoCorrigirSaldoBanco = document.getElementById("campo-corrigir-saldo-banco");
    const textoIndicadorPrincipal = document.getElementById("texto-indicador-principal");
    const mensagemAvisoBancoReal = document.getElementById("mensagem-aviso-banco-real");
    const botaoSalvarBancoReal = document.getElementById("botao-salvar-banco-real");
    const botaoRemoverBancoReal = document.getElementById("botao-remover-banco-real");

    const listaFaturasCartoes = document.getElementById("lista-faturas-cartoes");
    const cartoesVazio = document.getElementById("cartoes-vazio");
    const botaoAbrirNovoCartao = document.getElementById("botao-abrir-novo-cartao");

    const fundoModalCartao = document.getElementById("fundo-modal-cartao");
    const tituloModalCartao = document.getElementById("titulo-modal-cartao");
    const botaoFecharCartao = document.getElementById("botao-fechar-cartao");
    const campoNomeCartao = document.getElementById("campo-nome-cartao");
    const campoFechamentoCartao = document.getElementById("campo-fechamento-cartao");
    const campoVencimentoCartao = document.getElementById("campo-vencimento-cartao");
    const campoLimiteCartao = document.getElementById("campo-limite-cartao");
    const mensagemAvisoCartao = document.getElementById("mensagem-aviso-cartao");
    const botaoSalvarCartao = document.getElementById("botao-salvar-cartao");
    const botaoRemoverCartao = document.getElementById("botao-remover-cartao");

    const listaItensCartao = document.getElementById("lista-itens-cartao");
    const itensCartaoVazio = document.getElementById("itens-cartao-vazio");

    const fundoModalPagarFatura = document.getElementById("fundo-modal-pagar-fatura");
    const botaoFecharPagarFatura = document.getElementById("botao-fechar-pagar-fatura");
    const textoPagarFaturaValor = document.getElementById("texto-pagar-fatura-valor");
    const campoFormaPagarFatura = document.getElementById("campo-forma-pagar-fatura");
    const campoBancoPagarFaturaWrapper = document.getElementById("campo-banco-pagar-fatura-wrapper");
    const campoBancoPagarFatura = document.getElementById("campo-banco-pagar-fatura");
    const mensagemAvisoPagarFatura = document.getElementById("mensagem-aviso-pagar-fatura");
    const botaoConfirmarPagarFatura = document.getElementById("botao-confirmar-pagar-fatura");

    const fundoModalConfirmar = document.getElementById("fundo-modal-confirmar");
    const tituloModalConfirmar = document.getElementById("titulo-modal-confirmar");
    const textoModalConfirmar = document.getElementById("texto-modal-confirmar");
    const botaoConfirmarAcao = document.getElementById("botao-confirmar-acao");
    const botaoCancelarAcao = document.getElementById("botao-cancelar-acao");
    const botaoFecharConfirmar = document.getElementById("botao-fechar-confirmar");

    const toast = document.getElementById("toast");
    const toastMensagem = document.getElementById("toast-mensagem");
    const toastBotaoAcao = document.getElementById("toast-botao-acao");

    let uidAtual = null;
    let listaDeCartoes = []; // [{id, nome, diaVencimento}]
    let listaDeBancosReais = []; // [{id, nome, saldoInicial, principal}]
    let todosOsLancamentos = []; // usado pra calcular o saldo real de cada banco
    let itensDeTodasAsFaturas = []; // itens cuja fatura já FECHOU (pronta pra pagar ou já paga)
    let itensDoProximoMes = []; // itens cuja fatura ainda está ACUMULANDO (não fechou)
    let todosOsItensDoCartaoBruto = []; // snapshot bruto, antes de categorizar — guardado pra poder recategorizar sem nova busca
    let cartaoEmEdicaoId = null;
    let pagamentoFaturaPendente = null; // { itensNaoPagos, totalFatura, cartaoId, textoFatura }
    const cartoesComDetalheAberto = new Set(); // quais cartões estão com "ver itens da fatura aberta" expandido
    let bancoRealEmEdicaoId = null;

    // ==========================================================================
    // TELINHA DE CONFIRMAÇÃO — substitui o confirm() feio do navegador
    // ==========================================================================
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

    let timeoutToast = null;
    function mostrarToast(mensagem, duracaoMs = 2200) {
        if (timeoutToast) clearTimeout(timeoutToast);
        toastMensagem.textContent = mensagem;
        toastBotaoAcao.hidden = true;
        toast.hidden = false;
        timeoutToast = setTimeout(() => { toast.hidden = true; }, duracaoMs);
    }

    function mesReferenciaString(data) {
        return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
    }

    // A data em que uma fatura específica (identificada pelo mês que ela
    // fecha) efetivamente fecha — usa o menor dia entre o dia de
    // fechamento do cartão e o último dia real daquele mês (fevereiro
    // não tem dia 30, por exemplo)
    function dataDeFechamento(mesReferencia, diaFechamento) {
        const [ano, mes] = mesReferencia.split("-").map(Number);
        const ultimoDiaDoMes = new Date(ano, mes, 0).getDate();
        const diaFinal = Math.min(diaFechamento, ultimoDiaDoMes);
        return new Date(ano, mes - 1, diaFinal);
    }

    // A data de vencimento de uma fatura específica — se o dia de
    // vencimento for MENOR que o de fechamento, o vencimento cai no mês
    // seguinte ao fechamento (é assim que cartão de verdade funciona:
    // fecha dia 20, vence dia 5 do mês que vem, por exemplo)
    function dataDeVencimento(mesReferenciaFechamento, diaFechamento, diaVencimento) {
        const dataFech = dataDeFechamento(mesReferenciaFechamento, diaFechamento);
        let ano = dataFech.getFullYear();
        let mes = dataFech.getMonth();
        if (diaVencimento < diaFechamento) {
            mes += 1;
        }
        const ultimoDiaDoMes = new Date(ano, mes + 1, 0).getDate();
        const diaFinal = Math.min(diaVencimento, ultimoDiaDoMes);
        return new Date(ano, mes, diaFinal);
    }

    function formatarDiaEMes(data) {
        return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
    }

    // Uma fatura é considerada "fechada" (pronta pra pagar) a partir do
    // PRÓPRIO dia de fechamento (inclusive) — porque uma compra feita
    // nesse mesmo dia já vai pra fatura seguinte, então esse dia marca o
    // corte: a fatura anterior já está travada
    function faturaJaFechou(mesReferencia, diaFechamento) {
        const hoje = new Date();
        const hojeSoData = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
        return hojeSoData >= dataDeFechamento(mesReferencia, diaFechamento);
    }

    // Calcula em qual fatura (mês) uma compra feita HOJE deveria cair,
    // dado o dia de fechamento do cartão escolhido: antes do fechamento,
    // entra na fatura que ainda vai fechar esse mês; no dia do fechamento
    // (inclusive) ou depois, já pula pra fatura do mês seguinte
    function calcularMesReferenciaFatura(hoje, diaFechamento) {
        if (hoje.getDate() < diaFechamento) {
            return mesReferenciaString(hoje);
        }
        const proximoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
        return mesReferenciaString(proximoMes);
    }

    function formatarMoeda(valor) {
        const valorCorrigido = valor === 0 ? 0 : valor;
        return valorCorrigido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

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

    // ==========================================================================
    // LOGIN E CARREGAMENTO INICIAL
    // ==========================================================================
    aplicarMascaraValor(campoSaldoInicialBanco);
    aplicarMascaraValor(campoCorrigirSaldoBanco);
    aplicarMascaraValor(campoLimiteCartao);

    onAuthStateChanged(auth, async (usuario) => {
        if (!usuario) {
            window.location.href = "index.html";
            return;
        }
        uidAtual = usuario.uid;

        escutarCartoes();
        escutarTodosOsItensDoCartao();
        escutarBancosReais();
        escutarTodosOsLancamentos();
    });

    // ==========================================================================
    // CARTÕES — criar, editar, remover
    // ==========================================================================
    function escutarCartoes() {
        const referencia = collection(db, "usuarios", uidAtual, "cartoes");
        onSnapshot(referencia, (snapshot) => {
            listaDeCartoes = snapshot.docs.map((documento) => ({ id: documento.id, ...documento.data() }));
            recategorizarERenderizarItens();
            renderizarFaturas();
        });
    }

    function abrirModalCartao(cartao) {
        cartaoEmEdicaoId = cartao ? cartao.id : null;
        tituloModalCartao.textContent = cartao ? "Editar cartão" : "Novo cartão";
        campoNomeCartao.value = cartao ? cartao.nome : "";
        campoFechamentoCartao.value = cartao ? (cartao.diaFechamento || "") : "";
        campoVencimentoCartao.value = cartao ? (cartao.diaVencimento || "") : "";
        campoLimiteCartao.value = cartao && cartao.limite ? cartao.limite.toFixed(2).replace(".", ",") : "";
        botaoRemoverCartao.hidden = !cartao;
        mensagemAvisoCartao.classList.remove("visivel");
        fundoModalCartao.classList.add("aberto");
    }

    botaoAbrirNovoCartao.addEventListener("click", () => abrirModalCartao(null));
    botaoFecharCartao.addEventListener("click", () => fundoModalCartao.classList.remove("aberto"));
    fundoModalCartao.addEventListener("click", (evento) => {
        if (evento.target === fundoModalCartao) fundoModalCartao.classList.remove("aberto");
    });

    botaoSalvarCartao.addEventListener("click", async () => {
        const nome = campoNomeCartao.value.trim();
        const diaFechamento = parseInt(campoFechamentoCartao.value, 10) || null;
        const diaVencimento = parseInt(campoVencimentoCartao.value, 10) || null;
        const limite = paraNumero(campoLimiteCartao.value) || null;
        mensagemAvisoCartao.classList.remove("visivel");

        if (!nome) {
            mensagemAvisoCartao.textContent = "Digita um nome pro cartão.";
            mensagemAvisoCartao.classList.add("visivel");
            return;
        }
        if (!diaFechamento) {
            mensagemAvisoCartao.textContent = "Digita o dia de fechamento — precisamos dele pra saber em qual fatura cada compra cai.";
            mensagemAvisoCartao.classList.add("visivel");
            return;
        }

        const spinner = botaoSalvarCartao.querySelector(".spinner-botao");
        botaoSalvarCartao.disabled = true;
        spinner.hidden = false;

        if (cartaoEmEdicaoId) {
            await updateDoc(doc(db, "usuarios", uidAtual, "cartoes", cartaoEmEdicaoId), { nome, diaFechamento, diaVencimento, limite });
        } else {
            await addDoc(collection(db, "usuarios", uidAtual, "cartoes"), { nome, diaFechamento, diaVencimento, limite });
        }

        botaoSalvarCartao.disabled = false;
        spinner.hidden = true;
        fundoModalCartao.classList.remove("aberto");
        mostrarToast("Cartão salvo ✓");
    });

    botaoRemoverCartao.addEventListener("click", async () => {
        if (!cartaoEmEdicaoId) return;
        const confirmou = await confirmarComTelinha(
            "Tem certeza de que deseja remover esse cartão? Os itens que já entraram em faturas continuam salvos no histórico.",
            "Remover cartão"
        );
        if (!confirmou) return;

        await deleteDoc(doc(db, "usuarios", uidAtual, "cartoes", cartaoEmEdicaoId));
        fundoModalCartao.classList.remove("aberto");
        mostrarToast("Cartão removido");
    });

    // ==========================================================================
    // ITENS DE TODAS AS FATURAS — busca TODOS os itens no cartão, de
    // qualquer mês (não trava mais em "só 2 meses fixos"), e separa em 3
    // grupos: atrasados (mês já passou, ainda não pago), agora (mês real
    // de hoje), e futuros (qualquer mês adiante, não só o seguinte) —
    // assim uma fatura esquecida nunca mais "some" da tela sozinha
    // ==========================================================================
    function escutarTodosOsItensDoCartao() {
        const referencia = collection(db, "usuarios", uidAtual, "pendencias");
        const consulta = query(referencia, where("noCartao", "==", true));

        onSnapshot(consulta, (snapshot) => {
            todosOsItensDoCartaoBruto = snapshot.docs;
            recategorizarERenderizarItens();
            renderizarFaturas();
        });
    }

    // Separa os itens em "fechados" (a fatura deles já passou do dia de
    // fechamento do cartão — pronta pra pagar ou já paga) e "acumulando"
    // (ainda não fechou). Fica numa função própria porque precisa rodar
    // de novo tanto quando os itens mudam quanto quando o dia de
    // fechamento de um cartão é editado depois
    function recategorizarERenderizarItens() {
        itensDeTodasAsFaturas = todosOsItensDoCartaoBruto.filter((documento) => {
            const cartao = listaDeCartoes.find((c) => c.id === documento.data().cartaoId);
            const diaFechamento = (cartao && cartao.diaFechamento) || 1;
            return faturaJaFechou(documento.data().mesReferencia, diaFechamento);
        });
        itensDoProximoMes = todosOsItensDoCartaoBruto.filter((documento) => {
            const cartao = listaDeCartoes.find((c) => c.id === documento.data().cartaoId);
            const diaFechamento = (cartao && cartao.diaFechamento) || 1;
            return !faturaJaFechou(documento.data().mesReferencia, diaFechamento);
        });

        // Só a fatura FECHADA aparece na lista — o que ainda está
        // acumulando (itensDoProximoMes) continua guardado em memória, só
        // pro cálculo do "Você já gastou" no card, sem lista própria
        renderizarListaDeItens(itensDeTodasAsFaturas, listaItensCartao, itensCartaoVazio);
    }

    function nomeDoCartao(cartaoId) {
        const cartao = listaDeCartoes.find((c) => c.id === cartaoId);
        return cartao ? cartao.nome : "Cartão removido";
    }

    const NOMES_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    function formatarMesReferencia(mesReferencia) {
        const [ano, mes] = mesReferencia.split("-");
        return `${NOMES_MESES[parseInt(mes, 10) - 1]}/${ano}`;
    }

    // Desenha a lista de itens agrupada por tipo (Fixos / Parcelados /
    // Compras únicas), cada grupo ordenado cronologicamente por mês — sem
    // isso, um item de um mês distante podia aparecer antes de um mais
    // perto, dando a impressão errada de "pulo" no tempo
    function renderizarListaDeItens(itens, containerAlvo, elementoVazio) {
        containerAlvo.innerHTML = "";
        if (elementoVazio) elementoVazio.hidden = itens.length > 0;

        const itensOrdenados = [...itens].sort((a, b) => a.data().mesReferencia.localeCompare(b.data().mesReferencia));

        const grupos = { fixo: [], parcelado: [], avulsa: [] };
        itensOrdenados.forEach((documento) => {
            const origem = documento.data().origem || "avulsa";
            (grupos[origem] || grupos.avulsa).push(documento);
        });

        const nomesGrupos = { fixo: "Fixos", parcelado: "Parcelados", avulsa: "Compras únicas" };

        Object.keys(nomesGrupos).forEach((chaveGrupo) => {
            const itensDoGrupo = grupos[chaveGrupo];
            if (itensDoGrupo.length === 0) return;

            const secao = document.createElement("div");
            secao.style.marginBottom = "18px";

            const cabecalho = document.createElement("h4");
            cabecalho.style.cssText = "font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin: 0 0 8px 4px;";
            cabecalho.textContent = nomesGrupos[chaveGrupo];
            secao.appendChild(cabecalho);

            const lista = document.createElement("ul");
            lista.className = "lista-contas";

            itensDoGrupo.forEach((documento) => {
                const dados = documento.data();
                const badgeParcela = dados.origem === "parcelado"
                    ? `<span class="badge-parcela">Parcela ${dados.numeroParcela}/${dados.totalParcelas}</span>`
                    : "";
                const badgeCartaoHtml = `<span class="badge-cartao">${nomeDoCartao(dados.cartaoId)}</span>`;

                const item = document.createElement("li");
                item.className = "item-conta";
                item.innerHTML = `
                    <div class="info-conta">
                        <div class="nome-conta">${dados.descricao}${badgeParcela}${badgeCartaoHtml}</div>
                        <div class="meta-conta">${dados.pago ? "Já paga" : `Fatura de ${formatarMesReferencia(dados.mesReferencia)}`}</div>
                    </div>
                    <span class="valor-conta" style="color: ${dados.pago ? "var(--sucesso)" : "#F5D76E"};">${formatarMoeda(dados.valor)}</span>
                    <button class="botao-excluir-conta" data-id="${documento.id}" aria-label="Excluir item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/>
                        </svg>
                    </button>
                `;
                lista.appendChild(item);
            });

            secao.appendChild(lista);
            containerAlvo.appendChild(secao);
        });
    }

    // O mesmo comportamento de excluir vale pras duas listas — por isso o
    // handler fica numa função nomeada, registrada nas duas
    async function handlerCliqueListaItens(evento) {
        const botao = evento.target.closest(".botao-excluir-conta");
        if (!botao) return;

        const referenciaItem = doc(db, "usuarios", uidAtual, "pendencias", botao.dataset.id);
        const snapshotItem = await getDoc(referenciaItem);
        if (!snapshotItem.exists()) return;
        const dadosItem = snapshotItem.data();

        let excluirTodas = false;
        if (dadosItem.grupoId) {
            const tipoGrupo = dadosItem.origem === "parcelado" ? "parcelamento" : "recorrência fixa";
            excluirTodas = await confirmarComTelinha(
                `Esse item faz parte de um(a) ${tipoGrupo}. Confirma pra excluir também as próximas ocorrências (ainda não pagas), ou cancela pra excluir só esse mês.`,
                "Excluir todas as próximas?"
            );
        }

        const confirmouExcluir = await confirmarComTelinha("Tem certeza de que deseja excluir?", "Confirmar exclusão");
        if (!confirmouExcluir) return;

        if (excluirTodas) {
            const referenciaPendencias = collection(db, "usuarios", uidAtual, "pendencias");
            const consultaGrupo = query(referenciaPendencias, where("grupoId", "==", dadosItem.grupoId), where("pago", "==", false));
            const pendenciasDoGrupo = await getDocs(consultaGrupo);
            for (const documento of pendenciasDoGrupo.docs) {
                await deleteDoc(documento.ref);
            }
        } else {
            if (dadosItem.lancamentoId) {
                await deleteDoc(doc(db, "usuarios", uidAtual, "lancamentos", dadosItem.lancamentoId)).catch(() => {});
            }
            await deleteDoc(referenciaItem);
        }

        mostrarToast("Item excluído ✓");
    }

    listaItensCartao.addEventListener("click", handlerCliqueListaItens);

    // ==========================================================================
    // FATURAS — uma por cartão cadastrado
    // ==========================================================================
    function abrirModalPagarFatura(itensNaoPagos, totalFatura, cartaoId, textoFatura) {
        pagamentoFaturaPendente = { itensNaoPagos, totalFatura, cartaoId, textoFatura };
        textoPagarFaturaValor.textContent = `Pagamento ${textoFatura} do ${nomeDoCartao(cartaoId)}, no valor de ${formatarMoeda(totalFatura)}.`;

        campoFormaPagarFatura.value = "";
        campoBancoPagarFaturaWrapper.hidden = true;
        campoBancoPagarFatura.required = false;

        mensagemAvisoPagarFatura.classList.remove("visivel");
        fundoModalPagarFatura.classList.add("aberto");
    }

    campoFormaPagarFatura.addEventListener("change", () => {
        if (campoFormaPagarFatura.value === "pix" || campoFormaPagarFatura.value === "debito") {
            campoBancoPagarFatura.innerHTML = "";
            if (listaDeBancosReais.length === 0) {
                const opcaoVazia = document.createElement("option");
                opcaoVazia.value = "";
                opcaoVazia.disabled = true;
                opcaoVazia.selected = true;
                opcaoVazia.textContent = "Cria um banco primeiro, ali em cima";
                campoBancoPagarFatura.appendChild(opcaoVazia);
            } else {
                const opcaoPlaceholder = document.createElement("option");
                opcaoPlaceholder.value = "";
                opcaoPlaceholder.disabled = true;
                opcaoPlaceholder.selected = true;
                opcaoPlaceholder.textContent = "Selecione...";
                campoBancoPagarFatura.appendChild(opcaoPlaceholder);

                listaDeBancosReais.forEach((banco) => {
                    const opcao = document.createElement("option");
                    opcao.value = banco.nome;
                    opcao.textContent = banco.nome;
                    campoBancoPagarFatura.appendChild(opcao);
                });
            }
            campoBancoPagarFaturaWrapper.hidden = false;
            campoBancoPagarFatura.required = true;
        } else {
            campoBancoPagarFaturaWrapper.hidden = true;
            campoBancoPagarFatura.required = false;
        }
    });

    botaoFecharPagarFatura.addEventListener("click", () => {
        fundoModalPagarFatura.classList.remove("aberto");
    });
    fundoModalPagarFatura.addEventListener("click", (evento) => {
        if (evento.target === fundoModalPagarFatura) fundoModalPagarFatura.classList.remove("aberto");
    });

    botaoConfirmarPagarFatura.addEventListener("click", async () => {
        const formaEscolhida = campoFormaPagarFatura.value;
        mensagemAvisoPagarFatura.classList.remove("visivel");

        if (!formaEscolhida) {
            mensagemAvisoPagarFatura.textContent = "Escolhe a forma de pagamento.";
            mensagemAvisoPagarFatura.classList.add("visivel");
            return;
        }
        const bancoEscolhido = (formaEscolhida === "pix" || formaEscolhida === "debito") ? campoBancoPagarFatura.value : null;
        if ((formaEscolhida === "pix" || formaEscolhida === "debito") && !bancoEscolhido) {
            mensagemAvisoPagarFatura.textContent = "Escolhe de qual banco sai o pagamento.";
            mensagemAvisoPagarFatura.classList.add("visivel");
            return;
        }

        const { itensNaoPagos, totalFatura, cartaoId } = pagamentoFaturaPendente;
        const spinner = botaoConfirmarPagarFatura.querySelector(".spinner-botao");
        botaoConfirmarPagarFatura.disabled = true;
        spinner.hidden = false;

        const agora = new Date();
        const nomeCartaoPago = nomeDoCartao(cartaoId);

        const dadosLancamento = {
            tipo: "gasto",
            valor: totalFatura,
            categoria: "Fatura do Cartão",
            descricao: `Fatura — ${nomeCartaoPago}`,
            formaPagamento: formaEscolhida,
            data: Timestamp.fromDate(agora),
            mesReferencia: mesReferenciaString(agora),
            criadoEm: serverTimestamp()
        };
        if (bancoEscolhido) dadosLancamento.banco = bancoEscolhido;

        const novoLancamento = await addDoc(collection(db, "usuarios", uidAtual, "lancamentos"), dadosLancamento);

        const lote = writeBatch(db);
        itensNaoPagos.forEach((documento) => {
            lote.update(doc(db, "usuarios", uidAtual, "pendencias", documento.id), {
                pago: true,
                lancamentoId: novoLancamento.id,
                pagoEm: serverTimestamp()
            });
        });
        await lote.commit();

        // Registra no histórico de faturas pagas — fica guardado mesmo se
        // a pessoa desmarcar depois (o desmarcar não apaga daqui, é um
        // histórico permanente de quando cada fatura foi de fato paga)
        await addDoc(collection(db, "usuarios", uidAtual, "faturasPagas"), {
            cartaoId,
            cartaoNome: nomeCartaoPago,
            valor: totalFatura,
            formaPagamento: formaEscolhida,
            banco: bancoEscolhido,
            quantidadeItens: itensNaoPagos.length,
            dataPagamento: Timestamp.fromDate(agora),
            criadoEm: serverTimestamp()
        });

        botaoConfirmarPagarFatura.disabled = false;
        spinner.hidden = true;
        fundoModalPagarFatura.classList.remove("aberto");
        mostrarToast("Fatura paga ✓");
    });

    // Junta tudo (calcula uma vez só) sobre o estado atual de um cartão:
    // o que já fechou e ainda não foi pago (pronto pra cobrar), o que
    // ainda está acumulando (fatura em formação), e os totais de cada um
    function calcularEstadoCartao(cartao) {
        const diaFechamento = cartao.diaFechamento || 1;
        const todosOsItens = [...itensDeTodasAsFaturas, ...itensDoProximoMes]
            .filter((documento) => documento.data().cartaoId === cartao.id);

        const itensFechados = todosOsItens.filter((documento) => faturaJaFechou(documento.data().mesReferencia, diaFechamento));
        const itensNaoFechados = todosOsItens.filter((documento) => !faturaJaFechou(documento.data().mesReferencia, diaFechamento));

        // Entre os que ainda não fecharam, acha o mês mais PRÓXIMO — a
        // fatura que está se formando de verdade agora. Um Gasto Fixo ou
        // Parcelado já pré-cria várias ocorrências futuras de uma vez (até
        // 12 meses à frente) — os itens de meses MAIS distantes que esse
        // são só "agendados", ainda não contam como gasto de verdade
        let proximoMesReferencia = null;
        itensNaoFechados.forEach((documento) => {
            const mesRef = documento.data().mesReferencia;
            if (!proximoMesReferencia || mesRef < proximoMesReferencia) proximoMesReferencia = mesRef;
        });
        const itensAcumulandoAgora = itensNaoFechados.filter((documento) => documento.data().mesReferencia === proximoMesReferencia);

        const itensFechadosNaoPagos = itensFechados.filter((documento) => !documento.data().pago);
        const itensFechadosPagos = itensFechados.filter((documento) => documento.data().pago);
        const totalFechadoNaoPago = itensFechadosNaoPagos.reduce((soma, documento) => soma + documento.data().valor, 0);
        const totalFechadoPago = itensFechadosPagos.reduce((soma, documento) => soma + documento.data().valor, 0);
        const totalAcumulandoAgora = itensAcumulandoAgora.reduce((soma, documento) => soma + documento.data().valor, 0);

        // Pra saber a data de fechamento/vencimento a mostrar: se tem
        // fatura fechada esperando pagamento, mostra a dela (é a mais
        // urgente); senão, mostra a da próxima que vai fechar
        const mesReferenciaParaExibir = itensFechadosNaoPagos.length > 0
            ? itensFechadosNaoPagos[0].data().mesReferencia
            : proximoMesReferencia;

        return {
            itensFechadosNaoPagos,
            itensFechadosPagos,
            itensAcumulandoAgora,
            totalFechadoNaoPago,
            totalFechadoPago,
            mesReferenciaParaExibir,
            // "Você já gastou" = tudo fechado ainda não pago + só a fatura
            // que está formando agora (não os meses agendados lá na frente)
            totalGastoGeral: totalFechadoNaoPago + totalAcumulandoAgora
        };
    }

    function renderizarFaturas() {
        listaFaturasCartoes.innerHTML = "";
        cartoesVazio.hidden = listaDeCartoes.length > 0;

        listaDeCartoes.forEach((cartao) => {
            const estado = calcularEstadoCartao(cartao);
            const diaFechamento = cartao.diaFechamento || 1;
            const diaVencimento = cartao.diaVencimento || diaFechamento;

            let textoDatas = "Sem dia de fechamento definido";
            if (estado.mesReferenciaParaExibir) {
                const dataFech = dataDeFechamento(estado.mesReferenciaParaExibir, diaFechamento);
                const dataVenc = dataDeVencimento(estado.mesReferenciaParaExibir, diaFechamento, diaVencimento);
                textoDatas = `Fechamento: ${formatarDiaEMes(dataFech)} · Vencimento: ${formatarDiaEMes(dataVenc)}`;
            }

            let blocoPagarHtml = "";
            if (estado.totalFechadoNaoPago > 0) {
                blocoPagarHtml = `
                    <div style="margin-top: 14px; padding: 10px; background: rgba(245, 215, 110, 0.1); border-radius: 8px;">
                        <span class="fatura-cartao-vencimento" style="display:block; margin-bottom:4px;">Fatura fechada — pronta pra pagar</span>
                        <span class="fatura-cartao-valor" style="font-size: 18px;">${formatarMoeda(estado.totalFechadoNaoPago)}</span>
                        <button type="button" class="botao-retirar" data-acao="marcar" data-cartao="${cartao.id}">Marcar como pago</button>
                    </div>
                `;
            } else if (estado.itensFechadosPagos.length > 0) {
                blocoPagarHtml = `
                    <div style="margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--borda);">
                        <span class="fatura-cartao-vencimento" style="display:block; margin-bottom:4px;">✓ Fatura fechada, paga — ${formatarMoeda(estado.totalFechadoPago)}</span>
                        <button type="button" class="link-botao-simples" data-acao="desmarcar" data-cartao="${cartao.id}">Desmarcar</button>
                    </div>
                `;
            }

            const limiteDisponivel = (cartao.limite || 0) - estado.totalGastoGeral;
            const estaAberto = cartoesComDetalheAberto.has(cartao.id);

            let blocoVerItensHtml = "";
            if (estado.itensAcumulandoAgora.length > 0) {
                const linhasItens = estado.itensAcumulandoAgora.map((documento) => {
                    const dados = documento.data();
                    return `
                        <li class="item-conta" style="padding: 8px 0;">
                            <div class="info-conta">
                                <div class="nome-conta" style="font-size: 13px;">${dados.descricao}</div>
                            </div>
                            <span class="valor-conta" style="font-size: 13px;">${formatarMoeda(dados.valor)}</span>
                            <button class="botao-excluir-conta" data-id="${documento.id}" aria-label="Excluir item">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/>
                                </svg>
                            </button>
                        </li>
                    `;
                }).join("");

                blocoVerItensHtml = `
                    <button type="button" class="link-botao-simples" data-acao="toggle-detalhe" data-cartao="${cartao.id}" style="display:block; margin-top: 6px;">
                        ${estaAberto ? "Esconder itens dessa fatura ▲" : "Ver itens dessa fatura ▼"}
                    </button>
                    <ul class="lista-contas" style="margin-top: 6px;" ${estaAberto ? "" : "hidden"}>
                        ${linhasItens}
                    </ul>
                `;
            }

            const item = document.createElement("div");
            item.className = "fatura-cartao-item";
            item.innerHTML = `
                <div class="fatura-cartao-cabecalho">
                    <span class="fatura-cartao-nome">${cartao.nome}</span>
                    <button type="button" class="link-botao-simples" data-acao="editar" data-cartao="${cartao.id}">Editar</button>
                </div>
                <span class="fatura-cartao-valor">${formatarMoeda(limiteDisponivel)}</span>
                <span class="fatura-cartao-vencimento">${textoDatas}</span>
                <span class="fatura-cartao-vencimento" style="display:block; margin-top:2px;">Você já gastou ${formatarMoeda(estado.totalGastoGeral)} do cartão</span>
                ${blocoVerItensHtml}
                ${blocoPagarHtml}
            `;
            listaFaturasCartoes.appendChild(item);
        });
    }

    listaFaturasCartoes.addEventListener("click", async (evento) => {
        // O botão de excluir item (dentro do "ver itens dessa fatura") usa
        // o mesmo padrão da lista de fatura fechada — reaproveita o
        // handler já existente, em vez de duplicar a lógica de excluir
        const botaoExcluirItem = evento.target.closest(".botao-excluir-conta");
        if (botaoExcluirItem) {
            await handlerCliqueListaItens(evento);
            return;
        }

        const botao = evento.target.closest("[data-acao]");
        if (!botao) return;

        const cartaoId = botao.dataset.cartao;
        const acao = botao.dataset.acao;

        if (acao === "toggle-detalhe") {
            if (cartoesComDetalheAberto.has(cartaoId)) {
                cartoesComDetalheAberto.delete(cartaoId);
            } else {
                cartoesComDetalheAberto.add(cartaoId);
            }
            renderizarFaturas();
            return;
        }

        if (acao === "editar") {
            const cartao = listaDeCartoes.find((c) => c.id === cartaoId);
            abrirModalCartao(cartao);
            return;
        }

        const cartao = listaDeCartoes.find((c) => c.id === cartaoId);
        if (!cartao) return;
        const estado = calcularEstadoCartao(cartao);

        if (acao === "marcar") {
            if (estado.itensFechadosNaoPagos.length === 0) return;
            abrirModalPagarFatura(estado.itensFechadosNaoPagos, estado.totalFechadoNaoPago, cartaoId, "da fatura fechada");
            return;
        }

        if (acao === "desmarcar") {
            const itensPagos = estado.itensFechadosPagos;
            if (itensPagos.length === 0) return;

            const confirmou = await confirmarComTelinha(
                "Tem certeza de que deseja desmarcar o pagamento dessa fatura? O valor volta pro seu saldo.",
                "Desmarcar fatura"
            );
            if (!confirmou) return;

            const idsLancamentosUnicos = [...new Set(itensPagos.map((documento) => documento.data().lancamentoId).filter(Boolean))];
            for (const idLancamento of idsLancamentosUnicos) {
                await deleteDoc(doc(db, "usuarios", uidAtual, "lancamentos", idLancamento)).catch(() => {});
            }

            const lote = writeBatch(db);
            itensPagos.forEach((documento) => {
                lote.update(doc(db, "usuarios", uidAtual, "pendencias", documento.id), {
                    pago: false,
                    lancamentoId: null,
                    pagoEm: null
                });
            });
            await lote.commit();
            mostrarToast("Fatura desmarcada");
        }
    });

    // ==========================================================================
    // BANCOS — saldo real de cada um (não é mais só "o que guardei", é o
    // saldo de verdade: soma ganhos que chegaram ali, desconta gastos em
    // Débito/PIX, e mais adiante vai somar/descontar as transferências do
    // Guardar/Retirar também)
    // ==========================================================================
    function escutarBancosReais() {
        const referencia = collection(db, "usuarios", uidAtual, "bancos");
        onSnapshot(referencia, (snapshot) => {
            listaDeBancosReais = snapshot.docs.map((documento) => ({ id: documento.id, ...documento.data() }));
            renderizarBancosReais();
        });
    }

    // Busca TODOS os lançamentos, sem filtro de mês — o saldo do banco é
    // acumulado desde sempre, ele não reseta todo mês como o Saldo do Mês
    function escutarTodosOsLancamentos() {
        const referencia = collection(db, "usuarios", uidAtual, "lancamentos");
        onSnapshot(referencia, (snapshot) => {
            todosOsLancamentos = snapshot.docs;
            renderizarBancosReais();
        });
    }

    function calcularSaldoBanco(nomeBanco, saldoInicial) {
        let total = saldoInicial || 0;
        todosOsLancamentos.forEach((documento) => {
            const dados = documento.data();
            // "Guardar Dinheiro" e "Retirada da Reserva" NUNCA entram como
            // ganho/gasto normal aqui — são tratados como transferência,
            // pela lógica logo abaixo. Sem essa exclusão, todo depósito no
            // cofrinho seria contado por engano como se fosse renda de
            // verdade, inflando o saldo do banco.
            const ehCategoriaEspecial = dados.categoria === "Guardar Dinheiro" || dados.categoria === "Retirada da Reserva";

            if (dados.tipo === "ganho" && !ehCategoriaEspecial && dados.banco === nomeBanco) {
                total += dados.valor;
            }
            if (dados.tipo === "gasto" && !ehCategoriaEspecial && (dados.formaPagamento === "pix" || dados.formaPagamento === "debito") && dados.banco === nomeBanco) {
                total -= dados.valor;
            }
            // Pagamento de fatura do cartão — não é PIX nem Débito
            // (é um tipo de pagamento próprio), mas também sai de um banco
            // de verdade, então desconta igual
            if (dados.categoria === "Fatura do Cartão" && dados.banco === nomeBanco) {
                total -= dados.valor;
            }

            // Guardar/Retirar viram TRANSFERÊNCIA entre bancos. O campo
            // "banco" de cada lançamento já carrega o sinal certo através
            // do próprio valor: depósito (valor positivo, banco=destino)
            // soma no destino; a 1ª perna da retirada (valor negativo,
            // banco=de-onde-saiu) já desconta sozinha, só de somar; a 2ª
            // perna "Retirada da Reserva" (valor positivo, banco=pra-onde-
            // -voltou) soma no destino — as 4 pontas fecham a conta certa.
            if (ehCategoriaEspecial && dados.banco === nomeBanco) {
                total += dados.valor;
            }
            // Só o DEPÓSITO (valor positivo) tem "bancoOrigem" — de onde
            // saiu o dinheiro pra ser guardado ali. Precisa descontar do
            // lado de origem também, senão o dinheiro "nasceria do nada".
            if (dados.categoria === "Guardar Dinheiro" && dados.valor > 0 && dados.bancoOrigem === nomeBanco) {
                total -= dados.valor;
            }
        });
        return total;
    }

    function renderizarBancosReais() {
        listaBancosReais.innerHTML = "";
        bancosReaisVazio.hidden = listaDeBancosReais.length > 0;

        listaDeBancosReais.forEach((banco) => {
            const saldo = calcularSaldoBanco(banco.nome, banco.saldoInicial);
            const selo = banco.principal ? ` <span class="badge-cartao">Principal</span>` : "";

            const item = document.createElement("div");
            item.className = "fatura-cartao-item";
            item.innerHTML = `
                <div class="fatura-cartao-cabecalho">
                    <span class="fatura-cartao-nome">${banco.nome}${selo}</span>
                    <button type="button" class="link-botao-simples" data-banco="${banco.id}">Editar</button>
                </div>
                <span class="fatura-cartao-valor">${formatarMoeda(saldo)}</span>
            `;
            listaBancosReais.appendChild(item);
        });
    }

    listaBancosReais.addEventListener("click", (evento) => {
        const botao = evento.target.closest("[data-banco]");
        if (!botao) return;
        const banco = listaDeBancosReais.find((b) => b.id === botao.dataset.banco);
        abrirModalBancoReal(banco);
    });

    function abrirModalBancoReal(banco) {
        bancoRealEmEdicaoId = banco ? banco.id : null;
        tituloModalBancoReal.textContent = banco ? "Editar banco" : "Novo banco";
        campoNomeBancoReal.value = banco ? banco.nome : "";
        campoSaldoInicialBanco.value = banco && banco.saldoInicial ? banco.saldoInicial.toFixed(2).replace(".", ",") : "";
        campoCorrigirSaldoBanco.value = "";
        botaoRemoverBancoReal.hidden = !banco;
        mensagemAvisoBancoReal.classList.remove("visivel");

        // "Principal" não é mais editável aqui — só um indicador. Trocar de
        // banco principal é uma decisão importante (afeta o Saldo do Mês),
        // por isso mora escondida em Configurações, não num campo fácil
        if (banco && banco.principal) {
            textoIndicadorPrincipal.textContent = "⭐ Esse é o seu banco principal hoje. Pra trocar, vai em Configurações.";
            textoIndicadorPrincipal.hidden = false;
        } else if (banco) {
            textoIndicadorPrincipal.textContent = "Esse banco não é o principal. Pra mudar isso, vai em Configurações.";
            textoIndicadorPrincipal.hidden = false;
        } else {
            textoIndicadorPrincipal.hidden = true;
        }

        // O ajuste rápido só faz sentido editando um banco que já existe —
        // pra um banco novo, "saldo inicial" já é o próprio ponto de partida
        if (banco) {
            const saldoAtual = calcularSaldoBanco(banco.nome, banco.saldoInicial);
            textoSaldoAtualBanco.textContent = `Saldo atual calculado: ${formatarMoeda(saldoAtual)}`;
            textoSaldoAtualBanco.hidden = false;
            campoCorrigirSaldoWrapper.hidden = false;
        } else {
            textoSaldoAtualBanco.hidden = true;
            campoCorrigirSaldoWrapper.hidden = true;
        }

        fundoModalBancoReal.classList.add("aberto");
    }

    botaoAbrirNovoBancoReal.addEventListener("click", () => abrirModalBancoReal(null));
    botaoFecharBancoReal.addEventListener("click", () => fundoModalBancoReal.classList.remove("aberto"));
    fundoModalBancoReal.addEventListener("click", (evento) => {
        if (evento.target === fundoModalBancoReal) fundoModalBancoReal.classList.remove("aberto");
    });

    // Se o nome do banco mudar, todo o histórico antigo (que guarda o
    // NOME, não um ID) precisa ser atualizado também — senão o cálculo do
    // saldo "esquece" tudo que aconteceu antes da renomeação, silenciosamente
    async function propagarRenomeacaoBanco(nomeAntigo, nomeNovo) {
        if (nomeAntigo === nomeNovo) return;

        const referenciaLancamentos = collection(db, "usuarios", uidAtual, "lancamentos");

        // Onde esse banco era o "banco" (destino de ganho/guardar, ou de
        // onde saiu um gasto em débito/PIX)
        const consultaBanco = query(referenciaLancamentos, where("banco", "==", nomeAntigo));
        const resultadoBanco = await getDocs(consultaBanco);
        for (let i = 0; i < resultadoBanco.docs.length; i += 450) {
            const pedaco = resultadoBanco.docs.slice(i, i + 450);
            const lote = writeBatch(db);
            pedaco.forEach((documento) => {
                lote.update(documento.ref, { banco: nomeNovo });
            });
            await lote.commit();
        }

        // Onde esse banco era a ORIGEM de uma transferência do Guardar
        const consultaOrigem = query(referenciaLancamentos, where("bancoOrigem", "==", nomeAntigo));
        const resultadoOrigem = await getDocs(consultaOrigem);
        for (let i = 0; i < resultadoOrigem.docs.length; i += 450) {
            const pedaco = resultadoOrigem.docs.slice(i, i + 450);
            const lote = writeBatch(db);
            pedaco.forEach((documento) => {
                lote.update(documento.ref, { bancoOrigem: nomeNovo });
            });
            await lote.commit();
        }
    }

    botaoSalvarBancoReal.addEventListener("click", async () => {
        const nome = campoNomeBancoReal.value.trim();
        let saldoInicial = paraNumero(campoSaldoInicialBanco.value) || 0;
        mensagemAvisoBancoReal.classList.remove("visivel");

        if (!nome) {
            mensagemAvisoBancoReal.textContent = "Digita um nome pro banco.";
            mensagemAvisoBancoReal.classList.add("visivel");
            return;
        }

        // Se preencheu "Corrigir saldo atual pra", calcula sozinho o novo
        // saldo inicial necessário pra chegar nesse valor — sem a pessoa
        // ter que fazer a conta de cabeça
        const bancoAtual = bancoRealEmEdicaoId ? listaDeBancosReais.find((b) => b.id === bancoRealEmEdicaoId) : null;
        if (bancoAtual && campoCorrigirSaldoBanco.value.trim()) {
            const valorCorrigido = paraNumero(campoCorrigirSaldoBanco.value);
            const saldoAtualCalculado = calcularSaldoBanco(bancoAtual.nome, bancoAtual.saldoInicial || 0);
            const diferenca = saldoAtualCalculado - (bancoAtual.saldoInicial || 0); // soma de tudo que já entrou/saiu
            saldoInicial = valorCorrigido - diferenca;
        }

        const spinner = botaoSalvarBancoReal.querySelector(".spinner-botao");
        botaoSalvarBancoReal.disabled = true;
        spinner.hidden = false;

        // Propaga a renomeação ANTES de salvar o banco em si — assim, se
        // algo falhar no meio do caminho, tentar salvar de novo não vai
        // duplicar nem confundir nada (itens já migrados simplesmente não
        // aparecem de novo na busca por "nome antigo")
        if (bancoAtual && bancoAtual.nome !== nome) {
            await propagarRenomeacaoBanco(bancoAtual.nome, nome);
        }

        // "principal" NÃO é tocado aqui — fica exatamente como já estava
        // (isso agora só muda em Configurações, de propósito, pra não ser
        // fácil de alterar sem querer)
        if (bancoRealEmEdicaoId) {
            await updateDoc(doc(db, "usuarios", uidAtual, "bancos", bancoRealEmEdicaoId), { nome, saldoInicial });
        } else {
            await addDoc(collection(db, "usuarios", uidAtual, "bancos"), { nome, saldoInicial, principal: false });
        }

        botaoSalvarBancoReal.disabled = false;
        spinner.hidden = true;
        fundoModalBancoReal.classList.remove("aberto");
        mostrarToast("Banco salvo ✓");
    });

    botaoRemoverBancoReal.addEventListener("click", async () => {
        if (!bancoRealEmEdicaoId) return;
        const confirmou = await confirmarComTelinha(
            "Tem certeza de que deseja remover esse banco? O histórico de lançamentos continua salvo normalmente.",
            "Remover banco"
        );
        if (!confirmou) return;

        await deleteDoc(doc(db, "usuarios", uidAtual, "bancos", bancoRealEmEdicaoId));
        fundoModalBancoReal.classList.remove("aberto");
        mostrarToast("Banco removido");
    });

});
