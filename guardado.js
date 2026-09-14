import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection, addDoc, updateDoc, deleteDoc, doc, getDocs,
    query, where, onSnapshot, Timestamp, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

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

                const item = document.createElement("li");
                item.className = "item-lancamento tipo-cofre";
                item.innerHTML = `
                    <span class="ponto-categoria"></span>
                    <div class="info-lancamento">
                        <div class="descricao-lancamento">${tituloGrande}</div>
                        <div class="meta-lancamento">Guardar Dinheiro${textoBanco} · ${dataFormatada}</div>
                    </div>
                    <span class="valor-lancamento">${sinal} ${formatarMoeda(Math.abs(dados.valor))}</span>
                    <button class="botao-excluir" data-id="${documento.id}" aria-label="Excluir">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/>
                        </svg>
                    </button>
                `;
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
    function abrirModalRetirada() {
        campoValorRetirada.value = "";
        mensagemAvisoRetirada.classList.remove("visivel");
        textoDisponivelRetirada.textContent = `Você tem ${formatarMoeda(totalAtual)} guardado.`;

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
    }

    botaoAbrirRetirada.addEventListener("click", abrirModalRetirada);
    botaoFecharRetirada.addEventListener("click", fecharModalRetirada);
    fundoModalRetirada.addEventListener("click", (evento) => {
        if (evento.target === fundoModalRetirada) fecharModalRetirada();
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
        const totalEmCentavos = Math.round(totalAtual * 100);

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
        const agora = new Date();

        // 1) Reduz o total guardado (valor negativo, mesma categoria) — marca
        // o banco/meta escolhidos, senão os totais nunca diminuíam na
        // retirada (ficavam só somando os depósitos, sem nunca descontar).
        // Esse "banco" aqui é de onde o dinheiro estava guardado — o saldo
        // real dele desce, exatamente como uma transferência de verdade.
        await addDoc(collection(db, "usuarios", uidAtual, "lancamentos"), {
            tipo: "gasto",
            valor: -valor,
            categoria: "Guardar Dinheiro",
            descricao: "Retirada",
            banco: bancoEscolhidoRetirada,
            meta: metaEscolhidaRetirada,
            data: Timestamp.fromDate(agora),
            mesReferencia: mesReferenciaString(agora),
            criadoEm: serverTimestamp()
        });

        // 2) Injeta o valor de volta no saldo principal (horário capturado de
        // novo aqui, pra nunca nascer com o mesmo timestamp exato do registro
        // acima — evita ambiguidade na ordenação por data). O banco aqui é
        // pra ONDE o dinheiro volta — o saldo real dele sobe, fechando a
        // transferência (o que desceu de um lado, sobe do outro).
        await addDoc(collection(db, "usuarios", uidAtual, "lancamentos"), {
            tipo: "ganho",
            valor: valor,
            categoria: "Retirada da Reserva",
            descricao: "",
            banco: bancoDestinoEscolhidoRetirada,
            data: Timestamp.fromDate(new Date()),
            mesReferencia: mesReferenciaString(new Date()),
            criadoEm: serverTimestamp()
        });

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
