import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs,
    query, where, onSnapshot, Timestamp, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { iniciarModoPrivacidade } from "./privacidade.js";

document.addEventListener("DOMContentLoaded", function () {

    iniciarModoPrivacidade();

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

    const totalGuardadoEl = document.getElementById("total-guardado");
    const listaGuardado = document.getElementById("lista-guardado");
    const guardadoVazio = document.getElementById("guardado-vazio");

    const listaMetas = document.getElementById("lista-metas");
    const metasVazio = document.getElementById("metas-vazio");
    const botaoAbrirNovaMeta = document.getElementById("botao-abrir-nova-meta");

    const fundoModalMeta = document.getElementById("fundo-modal-meta");
    const tituloModalMeta = document.getElementById("titulo-modal-meta");
    const botaoFecharMeta = document.getElementById("botao-fechar-meta");
    const campoNomeMeta = document.getElementById("campo-nome-meta");
    const campoValorMeta = document.getElementById("campo-valor-meta");
    const mensagemAvisoMeta = document.getElementById("mensagem-aviso-meta");
    const botaoSalvarMeta = document.getElementById("botao-salvar-meta");
    const spinnerMeta = botaoSalvarMeta.querySelector(".spinner-botao");
    const botaoRemoverMeta = document.getElementById("botao-remover-meta");

    const botaoAbrirRetirada = document.getElementById("botao-abrir-retirada");
    const botaoFecharRetirada = document.getElementById("botao-fechar-retirada");
    const fundoModalRetirada = document.getElementById("fundo-modal-retirada");
    const tituloModalRetirada = document.getElementById("titulo-modal-retirada");
    const textoDisponivelRetirada = document.getElementById("texto-disponivel-retirada");
    const campoValorRetirada = document.getElementById("campo-valor-retirada");
    const campoMetaRetiradaWrapper = document.getElementById("campo-meta-retirada-wrapper");
    const campoMetaRetirada = document.getElementById("campo-meta-retirada");
    const campoBancoRetiradaWrapper = document.getElementById("campo-banco-retirada-wrapper");
    const campoBancoRetirada = document.getElementById("campo-banco-retirada");
    const campoBancoDestinoRetiradaWrapper = document.getElementById("campo-banco-destino-retirada-wrapper");
    const campoBancoDestinoRetirada = document.getElementById("campo-banco-destino-retirada");
    const mensagemAvisoRetirada = document.getElementById("mensagem-aviso-retirada");
    const botaoConfirmarRetirada = document.getElementById("botao-confirmar-retirada");
    const spinnerRetirada = botaoConfirmarRetirada.querySelector(".spinner-botao");
    const botaoRemoverRetirada = document.getElementById("botao-remover-retirada");

    // Quando não-nulo, o modal de retirada está em modo EDIÇÃO de uma
    // retirada já existente — guarda os ids dos dois lançamentos irmãos
    // (o que tira do guardado e o que devolve pro saldo) e o valor
    // original dela (precisa pra validar o novo valor digitado, já que
    // enquanto edita, o valor antigo ainda está descontado do total)
    let retiradaEmEdicao = null; // { idGasto, idGanho, valorOriginal }

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

    // Formata pro padrão "AAAA-MM" — mesmo campo usado nos lançamentos pra
    // decidir em qual mês eles contam (separado da data exibida neles).
    // Aqui em Saldo Guardado não existe navegação por mês, então sempre
    // usa o mês real de hoje.
    function mesReferenciaString(data) {
        return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
    }
    let totalAtual = 0;
    let todosOsDepositos = []; // todos os lançamentos de "Guardar Dinheiro" (pra somar por meta)
    let metaEmEdicaoId = null;

    aplicarMascaraValor(campoValorMeta);
    aplicarMascaraValor(campoValorRetirada);

    onAuthStateChanged(auth, (usuario) => {
        if (!usuario) {
            window.location.href = "index.html";
            return;
        }
        uidAtual = usuario.uid;
        escutarGuardado();
        escutarMetas();
        escutarBancos();
    });

    // ==========================================================================
    // HISTÓRICO E TOTAL GERAL (igual antes)
    // ==========================================================================
    function escutarGuardado() {
        const referencia = collection(db, "usuarios", uidAtual, "lancamentos");
        // Sem orderBy aqui de propósito: um "where" sozinho não precisa de
        // índice composto no Firestore. Ordenamos do lado do app mesmo.
        const consulta = query(referencia, where("categoria", "==", "Guardar Dinheiro"));

        onSnapshot(consulta, (snapshot) => {
            let total = 0;
            listaGuardado.innerHTML = "";
            guardadoVazio.hidden = snapshot.docs.length > 0;

            const documentosOrdenados = [...snapshot.docs].sort(
                (a, b) => b.data().data.toDate() - a.data().data.toDate()
            );

            documentosOrdenados.forEach((documento) => {
                const dados = documento.data();
                total += dados.valor;

                const dataObj = dados.data.toDate();
                const dataFormatada = dataObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
                const ehRetirada = dados.valor < 0;
                const sinal = ehRetirada ? "−" : "+";

                const tituloGrande = dados.descricao || dados.meta || (ehRetirada ? "Retirada" : "Guardado");
                const textoBanco = dados.banco ? ` · ${dados.banco}` : "";

                // Só dá pra editar retiradas feitas depois dessa atualização —
                // elas guardam o id do lançamento irmão (lancamentoParId).
                // Retiradas mais antigas, sem esse vínculo, continuam só
                // com a opção de excluir (não dá pra "adivinhar" com certeza
                // qual outro lançamento pertence a ela)
                const podeEditar = ehRetirada && !!dados.lancamentoParId;
                const botaoEditarHtml = podeEditar
                    ? `<button type="button" class="botao-editar-item" aria-label="Editar">
                           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                               <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                           </svg>
                       </button>`
                    : "";

                const item = document.createElement("li");
                item.className = "item-lancamento tipo-cofre";
                item.innerHTML = `
                    <span class="ponto-categoria"></span>
                    <div class="info-lancamento">
                        <div class="descricao-lancamento">${tituloGrande}</div>
                        <div class="meta-lancamento">Guardar Dinheiro${textoBanco} · ${dataFormatada}</div>
                    </div>
                    <span class="valor-lancamento">${sinal} ${formatarMoeda(Math.abs(dados.valor))}</span>
                    ${botaoEditarHtml}
                    <button class="botao-excluir" data-id="${documento.id}" data-par-id="${dados.lancamentoParId || ""}" data-eh-retirada="${ehRetirada}" aria-label="Excluir">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/>
                        </svg>
                    </button>
                `;
                if (podeEditar) {
                    item.querySelector(".botao-editar-item").addEventListener("click", async () => {
                        const docGanho = await getDoc(doc(db, "usuarios", uidAtual, "lancamentos", dados.lancamentoParId));
                        const dadosGanho = docGanho.exists() ? docGanho.data() : {};
                        abrirModalRetirada({
                            idGasto: documento.id,
                            idGanho: dados.lancamentoParId,
                            valor: Math.abs(dados.valor),
                            banco: dados.banco || "",
                            bancoDestino: dadosGanho.banco || "",
                            meta: dados.meta || ""
                        });
                    });
                }
                listaGuardado.appendChild(item);
            });

            totalAtual = total;
            totalGuardadoEl.textContent = formatarMoeda(total);

            todosOsDepositos = documentosOrdenados;
            renderizarMetas(); // os totais por meta dependem dos depósitos também
        });
    }

    listaGuardado.addEventListener("click", async (evento) => {
        const botao = evento.target.closest(".botao-excluir");
        if (!botao) return;

        const ehRetirada = botao.dataset.ehRetirada === "true";
        const parId = botao.dataset.parId || null;

        // Retirada com par conhecido: apaga os dois lançamentos juntos
        // (o que saiu do guardado e o que voltou pro saldo), numa
        // transação só — nunca mais fica um dos dois sozinho por aí
        if (ehRetirada && parId) {
            const confirmou = await confirmarComTelinha(
                "Tem certeza de que deseja excluir essa retirada? O lançamento que devolveu esse valor pro seu saldo também será removido junto."
            );
            if (!confirmou) return;

            const lote = writeBatch(db);
            lote.delete(doc(db, "usuarios", uidAtual, "lancamentos", botao.dataset.id));
            lote.delete(doc(db, "usuarios", uidAtual, "lancamentos", parId));
            await lote.commit();
            return;
        }

        // Retirada antiga, de antes dessa atualização — não tem o vínculo
        // salvo, então não dá pra saber com certeza qual outro lançamento
        // é o par dela. Avisa isso claramente em vez de tentar adivinhar.
        if (ehRetirada && !parId) {
            const confirmou = await confirmarComTelinha(
                "Essa retirada é de antes dessa atualização e não tem um vínculo salvo com o lançamento que devolveu o valor pro seu saldo. Excluir aqui remove só este registro do total guardado — se precisar, ajuste o saldo manualmente no Extrato. Quer continuar?"
            );
            if (!confirmou) return;

            await deleteDoc(doc(db, "usuarios", uidAtual, "lancamentos", botao.dataset.id));
            return;
        }

        const confirmou = await confirmarComTelinha("Tem certeza de que deseja excluir este registro?");
        if (!confirmou) return;

        await deleteDoc(doc(db, "usuarios", uidAtual, "lancamentos", botao.dataset.id));
    });

    // ==========================================================================
    // METAS — uma barra de progresso por meta
    // ==========================================================================
    let listaDeMetas = []; // [{id, nome, valor}]

    function escutarMetas() {
        const referencia = collection(db, "usuarios", uidAtual, "metas");
        onSnapshot(referencia, (snapshot) => {
            listaDeMetas = snapshot.docs.map((documento) => ({ id: documento.id, ...documento.data() }));
            renderizarMetas();
        });
    }

    function totalGuardadoNaMeta(nomeDaMeta) {
        // Mesma correção do banco: soma depósitos E retiradas marcadas com
        // essa meta, senão o total nunca diminuía ao retirar
        return todosOsDepositos
            .filter((documento) => documento.data().meta === nomeDaMeta)
            .reduce((soma, documento) => soma + documento.data().valor, 0);
    }

    function renderizarMetas() {
        listaMetas.innerHTML = "";
        metasVazio.hidden = listaDeMetas.length > 0;

        listaDeMetas.forEach((meta) => {
            const totalNaMeta = totalGuardadoNaMeta(meta.nome);
            const temValorAlvo = meta.valor && meta.valor > 0;

            let barraHtml = "";
            if (temValorAlvo) {
                const percentual = Math.min(100, (totalNaMeta / meta.valor) * 100);
                const classeCor = percentual >= 100 ? "estourou" : "";
                barraHtml = `
                    <div class="barra-orcamento-wrapper" style="margin-top: 8px;">
                        <div class="barra-orcamento-preenchida ${classeCor}" style="width: ${percentual}%"></div>
                    </div>
                    <div class="texto-barra-orcamento">${formatarMoeda(totalNaMeta)} de ${formatarMoeda(meta.valor)} (${Math.round(percentual)}%)</div>
                `;
            } else {
                barraHtml = `<div class="texto-barra-orcamento">${formatarMoeda(totalNaMeta)} guardado até agora</div>`;
            }

            const item = document.createElement("li");
            item.className = "item-conta";
            item.style.flexDirection = "column";
            item.style.alignItems = "stretch";
            item.innerHTML = `
                <div style="display:flex; align-items:center; justify-content: space-between; width: 100%;">
                    <span class="nome-conta">${meta.nome}</span>
                    <button type="button" class="link-editar-meta" data-id="${meta.id}">Editar</button>
                </div>
                ${barraHtml}
            `;
            item.querySelector(".link-editar-meta").addEventListener("click", () => abrirModalMeta(meta));
            listaMetas.appendChild(item);
        });
    }

    function abrirModalMeta(meta) {
        metaEmEdicaoId = meta ? meta.id : null;
        tituloModalMeta.textContent = meta ? "Editar meta" : "Nova meta";
        campoNomeMeta.value = meta ? meta.nome : "";
        campoValorMeta.value = meta && meta.valor ? meta.valor.toFixed(2).replace(".", ",") : "";
        botaoRemoverMeta.hidden = !meta;
        mensagemAvisoMeta.classList.remove("visivel");
        fundoModalMeta.classList.add("aberto");
    }

    function fecharModalMeta() {
        fundoModalMeta.classList.remove("aberto");
    }

    botaoAbrirNovaMeta.addEventListener("click", () => abrirModalMeta(null));
    botaoFecharMeta.addEventListener("click", fecharModalMeta);
    fundoModalMeta.addEventListener("click", (evento) => {
        if (evento.target === fundoModalMeta) fecharModalMeta();
    });

    botaoSalvarMeta.addEventListener("click", async () => {
        const nome = campoNomeMeta.value.trim();
        const valor = paraNumero(campoValorMeta.value);
        mensagemAvisoMeta.classList.remove("visivel");

        if (!nome) {
            mensagemAvisoMeta.textContent = "Digita um nome pra meta.";
            mensagemAvisoMeta.classList.add("visivel");
            return;
        }

        botaoSalvarMeta.disabled = true;
        spinnerMeta.hidden = false;

        const dadosMeta = { nome, valor: (!valor || valor <= 0) ? null : valor };

        if (metaEmEdicaoId) {
            await updateDoc(doc(db, "usuarios", uidAtual, "metas", metaEmEdicaoId), dadosMeta);
        } else {
            await addDoc(collection(db, "usuarios", uidAtual, "metas"), dadosMeta);
        }

        botaoSalvarMeta.disabled = false;
        spinnerMeta.hidden = true;
        fecharModalMeta();
    });

    botaoRemoverMeta.addEventListener("click", async () => {
        if (!metaEmEdicaoId) return;
        const confirmou = await confirmarComTelinha("Tem certeza de que deseja remover essa meta? O histórico de depósitos continua salvo normalmente.");
        if (!confirmou) return;

        await deleteDoc(doc(db, "usuarios", uidAtual, "metas", metaEmEdicaoId));
        fecharModalMeta();
    });

    // ==========================================================================
    // BANCOS — a gestão (criar/editar/remover) mudou de lugar, agora mora
    // na tela "Bancos e Cartões". Aqui só carregamos a lista, pra continuar
    // populando o seletor "de qual banco" na hora de Retirar.
    // ==========================================================================
    let listaDeBancos = []; // [{id, nome}]

    function escutarBancos() {
        const referencia = collection(db, "usuarios", uidAtual, "bancos");
        onSnapshot(referencia, (snapshot) => {
            listaDeBancos = snapshot.docs.map((documento) => ({ id: documento.id, ...documento.data() }));
        });
    }

    // ==========================================================================
    // RETIRAR DINHEIRO — cria 2 registros: um reduzindo o guardado (valor
    // negativo na categoria "Guardar Dinheiro") e outro injetando o mesmo
    // valor de volta no saldo principal (Extra, categoria "Retirada da Reserva")
    // ==========================================================================
    function abrirModalRetirada(retirada = null) {
        retiradaEmEdicao = retirada
            ? { idGasto: retirada.idGasto, idGanho: retirada.idGanho, valorOriginal: retirada.valor }
            : null;

        tituloModalRetirada.textContent = retirada ? "Editar retirada" : "Retirar dinheiro guardado";
        botaoConfirmarRetirada.querySelector(".texto-botao").textContent = retirada ? "Salvar alterações" : "Confirmar retirada";
        botaoRemoverRetirada.hidden = !retirada;

        campoValorRetirada.value = retirada ? retirada.valor.toFixed(2).replace(".", ",") : "";
        mensagemAvisoRetirada.classList.remove("visivel");

        // Ao editar, o valor dessa retirada ainda está descontado do total —
        // soma ele de volta só pra mostrar/validar quanto ficaria
        // "disponível" se essa retirada não existisse
        const totalDisponivel = retirada ? totalAtual + retirada.valor : totalAtual;
        textoDisponivelRetirada.textContent = `Você tem ${formatarMoeda(totalDisponivel)} guardado.`;

        // Só mostra a pergunta "de qual meta" se a pessoa já tiver alguma
        // meta cadastrada — senão não faz sentido perguntar
        if (listaDeMetas.length > 0) {
            campoMetaRetiradaWrapper.hidden = false;
            campoMetaRetirada.innerHTML = "";

            const opcaoNaoEspecificarMeta = document.createElement("option");
            opcaoNaoEspecificarMeta.value = "";
            opcaoNaoEspecificarMeta.textContent = "Não especificar";
            campoMetaRetirada.appendChild(opcaoNaoEspecificarMeta);

            listaDeMetas.forEach((meta) => {
                const opcao = document.createElement("option");
                opcao.value = meta.nome;
                opcao.textContent = meta.nome;
                campoMetaRetirada.appendChild(opcao);
            });

            campoMetaRetirada.value = retirada ? (retirada.meta || "") : "";
        } else {
            campoMetaRetiradaWrapper.hidden = true;
        }

        // Só mostra a pergunta "de qual banco" se a pessoa já tiver algum
        // banco cadastrado — senão não faz sentido perguntar
        if (listaDeBancos.length > 0) {
            campoBancoRetiradaWrapper.hidden = false;
            campoBancoRetirada.innerHTML = "";

            const opcaoNaoEspecificar = document.createElement("option");
            opcaoNaoEspecificar.value = "";
            opcaoNaoEspecificar.textContent = "Não especificar";
            campoBancoRetirada.appendChild(opcaoNaoEspecificar);

            listaDeBancos.forEach((banco) => {
                const opcao = document.createElement("option");
                opcao.value = banco.nome;
                opcao.textContent = banco.nome;
                campoBancoRetirada.appendChild(opcao);
            });

            campoBancoRetirada.value = retirada ? (retirada.banco || "") : "";

            // Mesma lista, pro campo de destino — a retirada volta pra
            // algum banco (normalmente o principal, onde você vai gastar)
            campoBancoDestinoRetiradaWrapper.hidden = false;
            campoBancoDestinoRetirada.innerHTML = "";

            const opcaoNaoEspecificarDestino = document.createElement("option");
            opcaoNaoEspecificarDestino.value = "";
            opcaoNaoEspecificarDestino.textContent = "Não especificar";
            campoBancoDestinoRetirada.appendChild(opcaoNaoEspecificarDestino);

            listaDeBancos.forEach((banco) => {
                const opcao = document.createElement("option");
                opcao.value = banco.nome;
                opcao.textContent = banco.nome;
                campoBancoDestinoRetirada.appendChild(opcao);
            });

            campoBancoDestinoRetirada.value = retirada ? (retirada.bancoDestino || "") : "";
        } else {
            campoBancoRetiradaWrapper.hidden = true;
            campoBancoRetirada.innerHTML = "";
            campoBancoDestinoRetiradaWrapper.hidden = true;
            campoBancoDestinoRetirada.innerHTML = "";
        }

        fundoModalRetirada.classList.add("aberto");
    }

    function fecharModalRetirada() {
        fundoModalRetirada.classList.remove("aberto");
        retiradaEmEdicao = null;
    }

    botaoAbrirRetirada.addEventListener("click", () => abrirModalRetirada(null));
    botaoFecharRetirada.addEventListener("click", fecharModalRetirada);
    fundoModalRetirada.addEventListener("click", (evento) => {
        if (evento.target === fundoModalRetirada) fecharModalRetirada();
    });

    botaoRemoverRetirada.addEventListener("click", async () => {
        if (!retiradaEmEdicao) return;
        const confirmou = await confirmarComTelinha(
            "Tem certeza de que deseja excluir essa retirada? O lançamento que devolveu esse valor pro seu saldo também será removido junto."
        );
        if (!confirmou) return;

        const lote = writeBatch(db);
        lote.delete(doc(db, "usuarios", uidAtual, "lancamentos", retiradaEmEdicao.idGasto));
        lote.delete(doc(db, "usuarios", uidAtual, "lancamentos", retiradaEmEdicao.idGanho));
        await lote.commit();

        fecharModalRetirada();
    });

    botaoConfirmarRetirada.addEventListener("click", async () => {
        const valor = paraNumero(campoValorRetirada.value);
        mensagemAvisoRetirada.classList.remove("visivel");

        if (!valor || valor <= 0) {
            mensagemAvisoRetirada.textContent = "Digita um valor maior que zero.";
            mensagemAvisoRetirada.classList.add("visivel");
            return;
        }

        // Compara em CENTAVOS (números inteiros), não em reais com decimais —
        // números decimais em JavaScript podem ter erros de arredondamento
        // minúsculos (tipo 5.359999999999999 em vez de 5.36 exato), o que
        // fazia essa comparação falhar por uma fração invisível de centavo
        const valorEmCentavos = Math.round(valor * 100);

        // Editando: o valor original dessa retirada ainda está descontado
        // do total atual — soma ele de volta antes de validar, senão o
        // próprio valor que você já tinha retirado contaria contra você
        const totalDisponivel = retiradaEmEdicao ? totalAtual + retiradaEmEdicao.valorOriginal : totalAtual;
        const totalEmCentavos = Math.round(totalDisponivel * 100);

        if (valorEmCentavos > totalEmCentavos) {
            mensagemAvisoRetirada.textContent = "Esse valor é maior do que você tem guardado.";
            mensagemAvisoRetirada.classList.add("visivel");
            return;
        }

        botaoConfirmarRetirada.disabled = true;
        spinnerRetirada.hidden = false;

        const bancoEscolhidoRetirada = campoBancoRetirada.value || null;
        const bancoDestinoEscolhidoRetirada = campoBancoDestinoRetirada.value || null;
        const metaEscolhidaRetirada = campoMetaRetirada.value || null;

        if (retiradaEmEdicao) {
            // Edição: atualiza os dois lançamentos já existentes no lugar —
            // não mexe na data original nem cria registro novo
            const lote = writeBatch(db);
            lote.update(doc(db, "usuarios", uidAtual, "lancamentos", retiradaEmEdicao.idGasto), {
                valor: -valor,
                banco: bancoEscolhidoRetirada,
                meta: metaEscolhidaRetirada
            });
            lote.update(doc(db, "usuarios", uidAtual, "lancamentos", retiradaEmEdicao.idGanho), {
                valor: valor,
                banco: bancoDestinoEscolhidoRetirada
            });
            await lote.commit();
        } else {
            // Gera os dois ids ANTES de escrever, pra guardar a referência
            // cruzada entre eles (cada lançamento sabe o id do seu par) —
            // assim dá pra editar ou excluir os dois juntos depois, sem
            // nunca mais precisar adivinhar qual pertence a qual retirada
            const refGasto = doc(collection(db, "usuarios", uidAtual, "lancamentos"));
            const refGanho = doc(collection(db, "usuarios", uidAtual, "lancamentos"));
            const agoraGasto = new Date();
            const agoraGanho = new Date();

            const lote = writeBatch(db);

            // 1) Reduz o total guardado (valor negativo, mesma categoria) —
            // marca o banco/meta escolhidos, senão os totais nunca diminuíam
            // na retirada (ficavam só somando os depósitos, sem descontar).
            // Esse "banco" aqui é de onde o dinheiro estava guardado — o
            // saldo real dele desce, exatamente como uma transferência de verdade.
            lote.set(refGasto, {
                tipo: "gasto",
                valor: -valor,
                categoria: "Guardar Dinheiro",
                descricao: "Retirada",
                banco: bancoEscolhidoRetirada,
                meta: metaEscolhidaRetirada,
                data: Timestamp.fromDate(agoraGasto),
                mesReferencia: mesReferenciaString(agoraGasto),
                criadoEm: serverTimestamp(),
                lancamentoParId: refGanho.id
            });

            // 2) Injeta o valor de volta no saldo principal — o banco aqui é
            // pra ONDE o dinheiro volta — o saldo real dele sobe, fechando a
            // transferência (o que desceu de um lado, sobe do outro).
            lote.set(refGanho, {
                tipo: "ganho",
                valor: valor,
                categoria: "Retirada da Reserva",
                descricao: "",
                banco: bancoDestinoEscolhidoRetirada,
                data: Timestamp.fromDate(agoraGanho),
                mesReferencia: mesReferenciaString(agoraGanho),
                criadoEm: serverTimestamp(),
                lancamentoParId: refGasto.id
            });

            await lote.commit();
        }

        botaoConfirmarRetirada.disabled = false;
        spinnerRetirada.hidden = true;
        fecharModalRetirada();
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
