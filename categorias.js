// ==========================================================================
// Categorias, bancos e edição de categoria
// (separado de dashboard.js; recebe da tela inicial só o que precisa, em "ctx")
// ==========================================================================
import { calcularSaldoBanco } from "./saldoBanco.js";
import { formatarMoeda, paraNumero } from "./util.js";
import { escaparHtml } from "./texto.js";
import { iniciarDetalheRepasses } from "./repasses.js";
import { confirmarComTelinha, mostrarToast } from "./avisos.js";
import { db } from "./firebase-config.js";
import { collection, updateDoc, setDoc, deleteDoc, doc, getDoc, getDocs, query, where, onSnapshot, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { registrarCategorias } from "./cores.js";
import { CATEGORIAS_PADRAO } from "./constantes.js";

export function iniciarCategoriasEBancos(ctx) {
    // ==========================================================================
    // 6. CATEGORIAS
    // ==========================================================================
    async function carregarCategoriasCustomizadas() {
        const referencia = collection(db, "usuarios", ctx.uidAtual, "categorias");
        const resultado = await getDocs(referencia);

        // Guarda {nome, id} de cada categoria customizada — o id é o que
        // permite excluir depois lá no Firestore
        ctx.categoriasCustomizadas = { gasto: [], ganho: [] };
        resultado.forEach((documento) => {
            const dados = documento.data();
            if (dados.tipo === "gasto" || dados.tipo === "ganho") {
                ctx.categoriasCustomizadas[dados.tipo].push({ nome: dados.nome, id: documento.id, foraDosTotais: !!dados.foraDosTotais });
            }
        });
        // Dá uma cor diferente pra cada categoria sua
        registrarCategorias(ctx.categoriasCustomizadas.gasto.map((c) => c.nome));
        refazerTotaisEGrafico();
    }

    // Categorias marcadas como "repasse/acerto": o dinheiro entra no saldo do
    // banco normalmente, mas não conta em Ganhos, Gastos nem no gráfico
    function ehForaDosTotais(nomeCategoria) {
        return [...ctx.categoriasCustomizadas.gasto, ...ctx.categoriasCustomizadas.ganho]
            .some((c) => c.nome === nomeCategoria && c.foraDosTotais);
    }

    // Toque na linha "Repasses": a lógica vive em repasses.js
    iniciarDetalheRepasses({
        documentosDoMes: () => ctx.ultimosDocumentosDoMes,
        ehForaDosTotais: (nome) => ehForaDosTotais(nome)
    });

    function refazerTotaisEGrafico() {
        if (!ctx.ultimosDocumentosDoMes) return;
        // Mesmo sem lançamentos no mês, o gráfico ainda mostra compras do cartão
        if (ctx.ultimosDocumentosDoMes.length > 0) ctx.calcularTotais(ctx.ultimosDocumentosDoMes);
        ctx.renderizarGrafico(ctx.ultimosDocumentosDoMes);
    }

    async function carregarOrcamentos() {
        const referencia = collection(db, "usuarios", ctx.uidAtual, "orcamentos");
        const resultado = await getDocs(referencia);

        ctx.mapaOrcamentos = {};
        resultado.forEach((documento) => {
            ctx.mapaOrcamentos[documento.id] = documento.data().limite;
        });
    }

    async function carregarMetas() {
        const referencia = collection(db, "usuarios", ctx.uidAtual, "metas");
        const resultado = await getDocs(referencia);

        ctx.metasCustomizadas = [];
        resultado.forEach((documento) => {
            ctx.metasCustomizadas.push({ nome: documento.data().nome, id: documento.id });
        });
    }

    async function carregarBancos() {
        const referencia = collection(db, "usuarios", ctx.uidAtual, "bancos");
        const resultado = await getDocs(referencia);

        ctx.bancosCustomizados = [];
        resultado.forEach((documento) => {
            ctx.bancosCustomizados.push({ nome: documento.data().nome, id: documento.id });
        });
    }

    // Soma o saldo real de TODOS os bancos, pro card-resumo da tela inicial.
    // Busca uma vez só (não fica ouvindo em tempo real) — é só um resumo,
    // não precisa atualizar sozinho a cada segundo, e evita pesar a tela
    // mais visitada do app com uma busca grande toda hora.
    // Busca o saldo real de UM banco específico, na hora — usada pra
    // validar antes de uma transferência (Guardar), garantindo que o
    // banco de origem realmente tem o valor que está saindo dele
    async function calcularSaldoBancoAgora(nomeBanco, saldoInicial) {
        const referenciaLancamentos = collection(db, "usuarios", ctx.uidAtual, "lancamentos");
        const snapshotLancamentos = await getDocs(referenciaLancamentos);

        const total = calcularSaldoBanco(nomeBanco, saldoInicial, snapshotLancamentos);
        return total;
    }

    async function atualizarResumoBancos() {
        const referenciaBancos = collection(db, "usuarios", ctx.uidAtual, "bancos");
        const snapshotBancos = await getDocs(referenciaBancos);

        if (snapshotBancos.empty) {
            ctx.linkResumoBancos.hidden = true;
            if (ctx.listaBancosCards) ctx.listaBancosCards.innerHTML = "";
            ctx.atualizarVisibilidadeSecaoBancosCartoes();
            return;
        }

        const referenciaLancamentos = collection(db, "usuarios", ctx.uidAtual, "lancamentos");
        const snapshotLancamentos = await getDocs(referenciaLancamentos);

        let totalGeral = 0;
        const bancosComSaldo = [];
        snapshotBancos.forEach((bancoDoc) => {
            const banco = bancoDoc.data();
            const saldoBanco = calcularSaldoBanco(banco.nome, banco.saldoInicial, snapshotLancamentos);

            totalGeral += saldoBanco;
            bancosComSaldo.push({ nome: banco.nome, saldo: saldoBanco });
        });

        // Cartõezinhos individuais por banco, um do lado do outro, roláveis —
        // só faz sentido mostrar quando tem mais de um banco cadastrado
        if (ctx.listaBancosCards) {
            ctx.listaBancosCards.innerHTML = "";
            if (bancosComSaldo.length > 1) {
                bancosComSaldo.forEach((banco) => {
                    const card = document.createElement("a");
                    card.href = "cartao.html";
                    card.className = "cartao-banco-preview";
                    card.innerHTML = `
                        <span class="nome-banco-preview">${escaparHtml(banco.nome)}</span>
                        <span class="saldo-banco-preview">${formatarMoeda(banco.saldo)}</span>
                    `;
                    ctx.listaBancosCards.appendChild(card);
                });
            }
        }

        ctx.linkResumoBancos.hidden = false;
        ctx.valorTotalBancos.textContent = formatarMoeda(totalGeral);
        ctx.atualizarVisibilidadeSecaoBancosCartoes();
    }

    // ==========================================================================
    // SALDO DO MÊS = BANCO PRINCIPAL — quando existe um banco marcado como
    // principal, o número do "Saldo do Mês" PARA de ser ganhos-gastos do
    // mês, e passa a mostrar o saldo real desse banco, sempre — não importa
    // pra qual mês a pessoa estiver navegando na tela. Reativo (onSnapshot),
    // então atualiza sozinho a cada novo lançamento, sem precisar recarregar.
    // ==========================================================================
    function escutarSaldoBancoPrincipal() {
        const referenciaBancos = collection(db, "usuarios", ctx.uidAtual, "bancos");
        const consultaPrincipal = query(referenciaBancos, where("principal", "==", true));

        onSnapshot(consultaPrincipal, (snapshotBancos) => {
            // Para o "ouvinte" interno antigo (se tinha) antes de criar um
            // novo — evita dois rodando ao mesmo tempo, ou um vazando
            if (ctx.pararDeEscutarSaldoBancoPrincipal) {
                ctx.pararDeEscutarSaldoBancoPrincipal();
                ctx.pararDeEscutarSaldoBancoPrincipal = null;
            }

            if (snapshotBancos.empty) {
                ctx.bancoPrincipalResolvido = true;
                ctx.saldoBancoPrincipalAtual = null;
                ctx.nomeBancoPrincipalAtual = null;
                ctx.atualizarNumeroGrandeDoSaldo();
                return;
            }

            const bancoPrincipal = { id: snapshotBancos.docs[0].id, ...snapshotBancos.docs[0].data() };
            ctx.nomeBancoPrincipalAtual = bancoPrincipal.nome;

            const referenciaLancamentos = collection(db, "usuarios", ctx.uidAtual, "lancamentos");
            // Um snapshot "do cache" pode vir incompleto na abertura do app
            // (mostraria um saldo errado por alguns segundos). Espera o do
            // servidor; se ele não vier em 4s (sem internet), usa o do cache.
            let chegouDoServidor = false;
            let temporizadorCache = null;
            ctx.pararDeEscutarSaldoBancoPrincipal = onSnapshot(referenciaLancamentos, { includeMetadataChanges: true }, (snapshotLancamentos) => {
                const total = calcularSaldoBanco(bancoPrincipal.nome, bancoPrincipal.saldoInicial, snapshotLancamentos);

                const aplicar = () => {
                    ctx.saldoBancoPrincipalAtual = total;
                    ctx.bancoPrincipalResolvido = true;
                    ctx.atualizarNumeroGrandeDoSaldo();
                };
                clearTimeout(temporizadorCache);
                if (snapshotLancamentos.metadata.fromCache && !chegouDoServidor) {
                    temporizadorCache = setTimeout(aplicar, 4000);
                } else {
                    chegouDoServidor = true;
                    aplicar();
                }
            });
        }, (erro) => {
            console.error("Bull: erro ao escutar o banco principal —", erro);
            ctx.bancoPrincipalResolvido = true;
            ctx.atualizarNumeroGrandeDoSaldo();
        });
    }

    async function carregarCartoes() {
        const referencia = collection(db, "usuarios", ctx.uidAtual, "cartoes");
        const resultado = await getDocs(referencia);

        ctx.cartoesCustomizados = [];
        resultado.forEach((documento) => {
            ctx.cartoesCustomizados.push({ nome: documento.data().nome, diaVencimento: documento.data().diaVencimento, diaFechamento: documento.data().diaFechamento, id: documento.id });
        });
    }

    function popularSelectBancoPagamento() {
        ctx.campoBancoPagamento.innerHTML = "";

        if (ctx.bancosCustomizados.length === 0) {
            const opcaoVazia = document.createElement("option");
            opcaoVazia.value = "";
            opcaoVazia.disabled = true;
            opcaoVazia.selected = true;
            opcaoVazia.textContent = "Cria um banco primeiro (menu → Bancos e Cartões)";
            ctx.campoBancoPagamento.appendChild(opcaoVazia);
            return;
        }

        const opcaoPlaceholder = document.createElement("option");
        opcaoPlaceholder.value = "";
        opcaoPlaceholder.disabled = true;
        opcaoPlaceholder.selected = true;
        opcaoPlaceholder.textContent = "Selecione...";
        ctx.campoBancoPagamento.appendChild(opcaoPlaceholder);

        ctx.bancosCustomizados.forEach((banco) => {
            const opcao = document.createElement("option");
            opcao.value = banco.nome;
            opcao.textContent = banco.nome;
            ctx.campoBancoPagamento.appendChild(opcao);
        });
    }

    function popularSelectCartaoPagamento() {
        ctx.campoCartaoPagamento.innerHTML = "";

        if (ctx.cartoesCustomizados.length === 0) {
            const opcaoVazia = document.createElement("option");
            opcaoVazia.value = "";
            opcaoVazia.disabled = true;
            opcaoVazia.selected = true;
            opcaoVazia.textContent = "Cria um cartão primeiro (menu → Bancos e Cartões)";
            ctx.campoCartaoPagamento.appendChild(opcaoVazia);
            return;
        }

        const opcaoPlaceholder = document.createElement("option");
        opcaoPlaceholder.value = "";
        opcaoPlaceholder.disabled = true;
        opcaoPlaceholder.selected = true;
        opcaoPlaceholder.textContent = "Selecione...";
        ctx.campoCartaoPagamento.appendChild(opcaoPlaceholder);

        ctx.cartoesCustomizados.forEach((cartao) => {
            const opcao = document.createElement("option");
            opcao.value = cartao.id;
            opcao.textContent = cartao.nome;
            ctx.campoCartaoPagamento.appendChild(opcao);
        });
    }

    function popularSelectCategorias(categoriaAtual) {
        ctx.campoCategoria.innerHTML = "";

        // Categorias fixas (Outros, etc.) — nunca têm lixeira
        CATEGORIAS_PADRAO[ctx.tipoSelecionado].forEach((nomeCategoria) => {
            const opcao = document.createElement("option");
            opcao.value = nomeCategoria;
            opcao.textContent = nomeCategoria;
            ctx.campoCategoria.appendChild(opcao);
        });

        // Categorias criadas pela pessoa — essas sim podem ser excluídas
        ctx.categoriasCustomizadas[ctx.tipoSelecionado].forEach((categoria) => {
            const opcao = document.createElement("option");
            opcao.value = categoria.nome;
            opcao.textContent = categoria.nome;
            opcao.dataset.customizada = "true";
            opcao.dataset.categoriaId = categoria.id;
            ctx.campoCategoria.appendChild(opcao);
        });

        // Se a categoria do item sendo editado não estiver em nenhuma lista
        // (ex: já foi excluída depois), adiciona ela também, senão o select
        // perde o valor e some silenciosamente
        const todasAsOpcoes = [...ctx.campoCategoria.options].map((opcao) => opcao.value);
        if (categoriaAtual && !todasAsOpcoes.includes(categoriaAtual)) {
            const opcao = document.createElement("option");
            opcao.value = categoriaAtual;
            opcao.textContent = categoriaAtual;
            ctx.campoCategoria.appendChild(opcao);
        }

        const opcaoNova = document.createElement("option");
        opcaoNova.value = "__nova__";
        opcaoNova.textContent = "+ Nova categoria";
        ctx.campoCategoria.appendChild(opcaoNova);

        if (categoriaAtual) ctx.campoCategoria.value = categoriaAtual;
        atualizarBotaoExcluirCategoria();
    }

    // Reaproveita o mesmo select da categoria, só que com as metas de
    // "Guardar" no lugar — não tem categorias "fixas" aqui, só as criadas
    function popularSelectMetas() {
        ctx.campoCategoria.innerHTML = "";

        const opcaoSemMeta = document.createElement("option");
        opcaoSemMeta.value = "__sem_meta__";
        opcaoSemMeta.textContent = "Sem meta específica";
        ctx.campoCategoria.appendChild(opcaoSemMeta);

        ctx.metasCustomizadas.forEach((meta) => {
            const opcao = document.createElement("option");
            opcao.value = meta.nome;
            opcao.textContent = meta.nome;
            ctx.campoCategoria.appendChild(opcao);
        });

        const opcaoNova = document.createElement("option");
        opcaoNova.value = "__nova__";
        opcaoNova.textContent = "+ Nova meta";
        ctx.campoCategoria.appendChild(opcaoNova);
    }

    // O banco tem um select PRÓPRIO (não reaproveita o de categoria/meta),
    // porque no modo Guardar os dois campos aparecem juntos na tela
    // Popula um select de banco (usada tanto pro "De qual banco sai" quanto
    // pro "Para qual banco vai") — bancos agora só se criam na tela "Bancos
    // e Cartões" (onde já entram com saldo inicial certo), por isso não tem
    // mais opção de "+ Novo banco" direto aqui
    function popularSelectBancoGenerico(selectAlvo) {
        selectAlvo.innerHTML = "";

        const opcaoSemBanco = document.createElement("option");
        opcaoSemBanco.value = "__sem_banco__";
        opcaoSemBanco.textContent = "Sem banco específico";
        selectAlvo.appendChild(opcaoSemBanco);

        ctx.bancosCustomizados.forEach((banco) => {
            const opcao = document.createElement("option");
            opcao.value = banco.nome;
            opcao.textContent = banco.nome;
            selectAlvo.appendChild(opcao);
        });
    }

    // Mostra a lixeira e o lápis só quando a categoria selecionada no momento
    // for uma que a própria pessoa criou (nunca nas fixas, tipo "Outros")
    function atualizarBotaoExcluirCategoria() {
        const opcaoSelecionada = ctx.campoCategoria.options[ctx.campoCategoria.selectedIndex];
        const ehCustomizada = opcaoSelecionada && opcaoSelecionada.dataset.customizada === "true";
        ctx.botaoExcluirCategoria.hidden = !ehCustomizada;
        ctx.botaoEditarCategoria.hidden = !ehCustomizada;
    }

    ctx.campoCategoria.addEventListener("change", () => {
        const criandoNova = ctx.campoCategoria.value === "__nova__";
        ctx.campoNovaCategoriaWrapper.hidden = !criandoNova;
        ctx.campoNovaCategoria.required = criandoNova;
        ctx.linhaRepasseNovaCategoria.hidden = !criandoNova || ctx.modoGuardar;
        if (!criandoNova) ctx.campoRepasseNovaCategoria.checked = false;
        // Vencimento da categoria só aparece aqui quando Fixo/Parcelado NÃO
        // estão marcados — se estiverem, o vencimento já é perguntado uma
        // vez só ali embaixo (nos checkboxes), pra não duplicar a pergunta
        const jaPerguntaVencimentoAliBaixo = ctx.campoFixo.checked || ctx.campoParcelado.checked;
        ctx.campoVencimentoNovaCategoriaWrapper.hidden = !criandoNova || ctx.tipoSelecionado !== "gasto" || jaPerguntaVencimentoAliBaixo;
        atualizarBotaoExcluirCategoria();
    });

    ctx.botaoExcluirCategoria.addEventListener("click", async () => {
        const opcaoSelecionada = ctx.campoCategoria.options[ctx.campoCategoria.selectedIndex];
        if (!opcaoSelecionada || opcaoSelecionada.dataset.customizada !== "true") return;

        const confirmou = await confirmarComTelinha(`Tem certeza de que deseja excluir a categoria "${opcaoSelecionada.value}"? Lançamentos antigos que usam ela continuam salvos normalmente no extrato.`);
        if (!confirmou) return;

        const categoriaId = opcaoSelecionada.dataset.categoriaId;
        await deleteDoc(doc(db, "usuarios", ctx.uidAtual, "categorias", categoriaId));

        ctx.categoriasCustomizadas[ctx.tipoSelecionado] = ctx.categoriasCustomizadas[ctx.tipoSelecionado].filter((c) => c.id !== categoriaId);
        popularSelectCategorias();
        ctx.campoCategoria.value = "Outros";
        atualizarBotaoExcluirCategoria();
    });

    // ==========================================================================
    // EDITAR CATEGORIA — nome e limite mensal, no mesmo lugar em que a
    // categoria é usada (lápis ao lado do select, dentro do formulário)
    // ==========================================================================
    let categoriaEmEdicaoId = null;
    let categoriaEmEdicaoNomeAntigo = null;

    ctx.botaoEditarCategoria.addEventListener("click", async () => {
        const opcaoSelecionada = ctx.campoCategoria.options[ctx.campoCategoria.selectedIndex];
        if (!opcaoSelecionada || opcaoSelecionada.dataset.customizada !== "true") return;

        categoriaEmEdicaoId = opcaoSelecionada.dataset.categoriaId;
        categoriaEmEdicaoNomeAntigo = opcaoSelecionada.value;

        ctx.campoNovoNomeCategoria.value = categoriaEmEdicaoNomeAntigo;
        const categoriaAtualLocal = ctx.categoriasCustomizadas[ctx.tipoSelecionado].find((c) => c.id === categoriaEmEdicaoId);
        ctx.campoRepasseCategoria.checked = !!(categoriaAtualLocal && categoriaAtualLocal.foraDosTotais);
        const limiteExistente = ctx.mapaOrcamentos[categoriaEmEdicaoNomeAntigo];
        ctx.campoLimiteCategoria.value = limiteExistente ? limiteExistente.toFixed(2).replace(".", ",") : "";
        ctx.mensagemAvisoEditarCategoria.classList.remove("visivel");

        // "Limite mensal" e "Vencimento" só fazem sentido pra categorias de
        // Gasto (não existe "limite"/"vencimento" pra Ganho/Extra)
        const ehGasto = ctx.tipoSelecionado === "gasto";
        ctx.campoLimiteCategoriaWrapper.hidden = !ehGasto;
        ctx.campoVencimentoCategoriaWrapper.hidden = !ehGasto;

        if (ehGasto) {
            // Busca o vencimento atual guardado na própria categoria
            const snapshotCategoria = await getDoc(doc(db, "usuarios", ctx.uidAtual, "categorias", categoriaEmEdicaoId));
            const vencimentoAtual = snapshotCategoria.exists() ? snapshotCategoria.data().diaVencimento : null;
            ctx.campoVencimentoCategoria.value = vencimentoAtual || "";
            ctx.textoAvisoVencimento.hidden = false;
        }

        // Opções de "mesclar com": todas as outras categorias do mesmo tipo
        const campoMesclar = document.getElementById("campo-mesclar-categoria");
        const outras = [...new Set([
            ...CATEGORIAS_PADRAO[ctx.tipoSelecionado],
            ...ctx.categoriasCustomizadas[ctx.tipoSelecionado].map((c) => c.nome)
        ])].filter((nome) => nome !== categoriaEmEdicaoNomeAntigo)
            .sort((a, b) => a.localeCompare(b, "pt-BR"));
        campoMesclar.innerHTML = "";
        const escolha = document.createElement("option");
        escolha.value = "";
        escolha.textContent = "Escolher categoria que vai ficar...";
        campoMesclar.appendChild(escolha);
        outras.forEach((nome) => {
            const opcao = document.createElement("option");
            opcao.value = nome;
            opcao.textContent = nome;
            campoMesclar.appendChild(opcao);
        });
        document.getElementById("campo-mesclar-categoria-wrapper").hidden = outras.length === 0;
        document.getElementById("botao-mesclar-categoria").style.display = "none";
        campoMesclar.onchange = () => {
            document.getElementById("botao-mesclar-categoria").style.display = campoMesclar.value ? "" : "none";
        };

        ctx.fundoModalEditarCategoria.classList.add("aberto");
    });

    // Mescla a categoria em edição (que some) na escolhida (que fica)
    document.getElementById("botao-mesclar-categoria").addEventListener("click", async () => {
        const destino = document.getElementById("campo-mesclar-categoria").value;
        const origem = categoriaEmEdicaoNomeAntigo;
        const idOrigem = categoriaEmEdicaoId;
        const tipoMescla = ctx.tipoSelecionado;
        ctx.mensagemAvisoEditarCategoria.classList.remove("visivel");
        if (!destino) {
            ctx.mensagemAvisoEditarCategoria.textContent = "Escolhe a categoria que vai ficar.";
            ctx.mensagemAvisoEditarCategoria.classList.add("visivel");
            return;
        }

        const botaoMesclar = document.getElementById("botao-mesclar-categoria");
        const spinnerMesclar = botaoMesclar.querySelector(".spinner-botao");
        botaoMesclar.disabled = true;
        try {
            const lancamentos = await getDocs(query(collection(db, "usuarios", ctx.uidAtual, "lancamentos"), where("categoria", "==", origem)));
            const pendencias = await getDocs(query(collection(db, "usuarios", ctx.uidAtual, "pendencias"), where("categoria", "==", origem)));
            const total = lancamentos.size + pendencias.size;

            fecharModalEditarCategoria();
            const confirmou = await confirmarComTelinha(
                `Vou passar ${total} ${total === 1 ? "item" : "itens"} de "${origem}" para "${destino}" e apagar a categoria "${origem}". Não dá para desfazer. Confirma?`,
                "Mesclar categorias"
            );
            if (!confirmou) return;

            spinnerMesclar.hidden = false;
            const alvos = [...lancamentos.docs, ...pendencias.docs];
            for (let i = 0; i < alvos.length; i += 400) {
                const lote = writeBatch(db);
                alvos.slice(i, i + 400).forEach((d) => lote.update(d.ref, { categoria: destino }));
                await lote.commit();
            }

            // Limite mensal: se as duas tinham, soma; se só a que sumiu tinha, passa pra que fica
            if (tipoMescla === "gasto") {
                const limiteOrigem = ctx.mapaOrcamentos[origem] || 0;
                const limiteDestino = ctx.mapaOrcamentos[destino] || 0;
                if (limiteOrigem > 0) {
                    const soma = Math.round((limiteOrigem + limiteDestino) * 100) / 100;
                    await setDoc(doc(db, "usuarios", ctx.uidAtual, "orcamentos", destino), { categoria: destino, limite: soma });
                    ctx.mapaOrcamentos[destino] = soma;
                }
                await deleteDoc(doc(db, "usuarios", ctx.uidAtual, "orcamentos", origem)).catch(() => {});
                delete ctx.mapaOrcamentos[origem];
            }

            await deleteDoc(doc(db, "usuarios", ctx.uidAtual, "categorias", idOrigem));
            ctx.categoriasCustomizadas[tipoMescla] = ctx.categoriasCustomizadas[tipoMescla].filter((c) => c.id !== idOrigem);
            popularSelectCategorias();
            ctx.campoCategoria.value = destino;
            atualizarBotaoExcluirCategoria();
            mostrarToast(`"${origem}" mesclada em "${destino}" ✓`);
        } catch (erro) {
            console.error(erro);
            mostrarToast("Não deu pra mesclar agora. Tenta de novo.");
        } finally {
            botaoMesclar.disabled = false;
            spinnerMesclar.hidden = true;
        }
    });

    function fecharModalEditarCategoria() {
        ctx.fundoModalEditarCategoria.classList.remove("aberto");
    }

    ctx.botaoFecharEditarCategoria.addEventListener("click", fecharModalEditarCategoria);
    ctx.fundoModalEditarCategoria.addEventListener("click", (evento) => {
        if (evento.target === ctx.fundoModalEditarCategoria) fecharModalEditarCategoria();
    });

    ctx.botaoSalvarEditarCategoria.addEventListener("click", async () => {
        const novoNome = ctx.campoNovoNomeCategoria.value.trim();
        const novoLimite = paraNumero(ctx.campoLimiteCategoria.value);
        ctx.mensagemAvisoEditarCategoria.classList.remove("visivel");

        if (!novoNome) {
            ctx.mensagemAvisoEditarCategoria.textContent = "Digita um nome pra categoria.";
            ctx.mensagemAvisoEditarCategoria.classList.add("visivel");
            return;
        }

        ctx.botaoSalvarEditarCategoria.disabled = true;
        ctx.spinnerEditarCategoria.hidden = false;

        try {
            const nomeMudou = novoNome !== categoriaEmEdicaoNomeAntigo;

            if (nomeMudou) {
                // 1) Atualiza o nome no documento da própria categoria
                await updateDoc(doc(db, "usuarios", ctx.uidAtual, "categorias", categoriaEmEdicaoId), {
                    nome: novoNome
                });

                // 2) Atualiza TODOS os lançamentos antigos que usavam o nome
                // velho, pra manter o histórico consistente (decisão já
                // combinada: atualizar tudo, não deixar "misturado")
                const referenciaLancamentos = collection(db, "usuarios", ctx.uidAtual, "lancamentos");
                const consultaAntigos = query(referenciaLancamentos, where("categoria", "==", categoriaEmEdicaoNomeAntigo));
                const lancamentosAntigos = await getDocs(consultaAntigos);

                if (!lancamentosAntigos.empty) {
                    const lote = writeBatch(db);
                    lancamentosAntigos.forEach((documento) => {
                        lote.update(documento.ref, { categoria: novoNome });
                    });
                    await lote.commit();
                }

                // 2b) Faz o mesmo nas pendências (gasto fixo/parcelado) que
                // usavam o nome velho — senão elas continuam mostrando a
                // categoria antiga em "Pagamentos Pendentes", mesmo depois
                // de renomear
                const referenciaPendencias = collection(db, "usuarios", ctx.uidAtual, "pendencias");
                const consultaPendenciasAntigas = query(referenciaPendencias, where("categoria", "==", categoriaEmEdicaoNomeAntigo));
                const pendenciasAntigas = await getDocs(consultaPendenciasAntigas);

                if (!pendenciasAntigas.empty) {
                    const loteAntigo = writeBatch(db);
                    pendenciasAntigas.forEach((documento) => {
                        loteAntigo.update(documento.ref, { categoria: novoNome });
                    });
                    await loteAntigo.commit();
                }

                // 3) "Move" o orçamento configurado (só existe pro lado Gasto —
                // Firestore não deixa renomear o ID de um documento, então
                // apaga o antigo e cria um novo com o nome atualizado)
                if (ctx.tipoSelecionado === "gasto" && ctx.mapaOrcamentos[categoriaEmEdicaoNomeAntigo] !== undefined) {
                    await deleteDoc(doc(db, "usuarios", ctx.uidAtual, "orcamentos", categoriaEmEdicaoNomeAntigo)).catch(() => {});
                    delete ctx.mapaOrcamentos[categoriaEmEdicaoNomeAntigo];
                }
            }

            // Salva (ou remove) o limite mensal, só faz sentido pro lado Gasto
            if (ctx.tipoSelecionado === "gasto") {
                const referenciaOrcamento = doc(db, "usuarios", ctx.uidAtual, "orcamentos", novoNome);
                if (!novoLimite || novoLimite <= 0) {
                    await deleteDoc(referenciaOrcamento).catch(() => {});
                    delete ctx.mapaOrcamentos[novoNome];
                } else {
                    await setDoc(referenciaOrcamento, { categoria: novoNome, limite: novoLimite });
                    ctx.mapaOrcamentos[novoNome] = novoLimite;
                }

                // Salva o vencimento na própria categoria, e propaga pra todas
                // as pendências AINDA NÃO PAGAS dessa categoria — assim, se
                // você errou o dia na hora de criar, não precisa apagar e
                // recriar o gasto fixo/parcelamento inteiro, só corrigir aqui
                const novoVencimento = parseInt(ctx.campoVencimentoCategoria.value, 10) || null;
                await updateDoc(doc(db, "usuarios", ctx.uidAtual, "categorias", categoriaEmEdicaoId), {
                    diaVencimento: novoVencimento
                });

                if (novoVencimento) {
                    const referenciaPendenciasVencimento = collection(db, "usuarios", ctx.uidAtual, "pendencias");
                    const consultaPendenciasVencimento = query(
                        referenciaPendenciasVencimento,
                        where("categoria", "==", novoNome),
                        where("pago", "==", false)
                    );
                    const pendenciasParaAtualizar = await getDocs(consultaPendenciasVencimento);

                    // Itens "no cartão" NÃO entram aqui — o vencimento deles
                    // vem sempre do próprio cartão escolhido, nunca da
                    // categoria. Sem esse filtro, editar o vencimento de uma
                    // categoria comum ia bagunçar compras no crédito que só
                    // por acaso compartilham a mesma categoria.
                    const pendenciasComunsParaAtualizar = pendenciasParaAtualizar.docs.filter(
                        (documento) => !documento.data().noCartao
                    );

                    if (pendenciasComunsParaAtualizar.length > 0) {
                        const loteVencimento = writeBatch(db);
                        pendenciasComunsParaAtualizar.forEach((documento) => {
                            loteVencimento.update(documento.ref, { diaDoMes: novoVencimento });
                        });
                        await loteVencimento.commit();
                    }
                }
            }

            // Atualiza o estado local, sem precisar recarregar a página inteira
            await updateDoc(doc(db, "usuarios", ctx.uidAtual, "categorias", categoriaEmEdicaoId), {
                foraDosTotais: !!ctx.campoRepasseCategoria.checked
            });

            const categoriaLocal = ctx.categoriasCustomizadas[ctx.tipoSelecionado].find((c) => c.id === categoriaEmEdicaoId);
            if (categoriaLocal) {
                categoriaLocal.nome = novoNome;
                categoriaLocal.foraDosTotais = !!ctx.campoRepasseCategoria.checked;
            }
            refazerTotaisEGrafico();

            popularSelectCategorias();
            ctx.campoCategoria.value = novoNome;
            atualizarBotaoExcluirCategoria();

            fecharModalEditarCategoria();

        } catch (erro) {
            ctx.mensagemAvisoEditarCategoria.textContent = "Não deu pra salvar agora. Confere sua internet e tenta de novo.";
            ctx.mensagemAvisoEditarCategoria.classList.add("visivel");
        } finally {
            ctx.botaoSalvarEditarCategoria.disabled = false;
            ctx.spinnerEditarCategoria.hidden = true;
        }
    });


    return { carregarCategoriasCustomizadas, ehForaDosTotais, carregarOrcamentos, carregarMetas, carregarBancos, calcularSaldoBancoAgora, atualizarResumoBancos, escutarSaldoBancoPrincipal, carregarCartoes, popularSelectBancoPagamento, popularSelectCartaoPagamento, popularSelectCategorias, popularSelectMetas, popularSelectBancoGenerico };
}
