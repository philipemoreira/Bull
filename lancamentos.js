// ==========================================================================
// Lançamentos do mês: lista, totais, gráfico, salário e guardado
// (separado de dashboard.js; recebe da tela inicial só o que precisa, em "ctx")
// ==========================================================================
import { formatarMoeda, paraNumero, mesReferenciaString } from "./util.js";
import { escaparHtml } from "./texto.js";
import { excluirOutraParte } from "./divisao.js";
import { confirmarComTelinha, mostrarToast, mostrarToastComAcao } from "./avisos.js";
import { db } from "./firebase-config.js";
import { collection, addDoc, deleteDoc, doc, getDoc, getDocs, query, where, onSnapshot, Timestamp, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { montarLancamentosDeCartao } from "./cartaoNoExtrato.js";
import { corDaCategoria, registrarCategorias } from "./cores.js";
import { LIMITE_ITENS_LISTA_INICIAL } from "./constantes.js";

export function iniciarLancamentos(ctx) {
    // ==========================================================================
    // COMPARAÇÃO COM O MÊS ANTERIOR
    // ==========================================================================
    const comparacaoMesAnteriorEl = document.getElementById("comparacao-mes-anterior");
    let gastosMesAnterior = null;
    let totalGastosAtual = 0;

    async function buscarGastosMesAnterior() {
        const anoAnterior = ctx.mesSelecionado.getMonth() === 0 ? ctx.mesSelecionado.getFullYear() - 1 : ctx.mesSelecionado.getFullYear();
        const mesAnteriorIndice = ctx.mesSelecionado.getMonth() === 0 ? 11 : ctx.mesSelecionado.getMonth() - 1;
        const mesReferenciaAnterior = mesReferenciaString(new Date(anoAnterior, mesAnteriorIndice, 1));

        const referencia = collection(db, "usuarios", ctx.uidAtual, "lancamentos");
        const consulta = query(referencia, where("mesReferencia", "==", mesReferenciaAnterior));

        const resultado = await getDocs(consulta);
        let total = 0;
        resultado.forEach((documento) => {
            const dados = documento.data();
            if (dados.categoria === "Guardar Dinheiro") {
                if (dados.valor > 0) total += dados.valor;
                return;
            }
            if (ctx.ehForaDosTotais(dados.categoria)) return;
            if (dados.tipo === "gasto") total += dados.valor;
        });

        gastosMesAnterior = total;
        atualizarComparacaoMesAnterior();
    }

    // Recalcula toda vez que os totais do mês atual mudam (chamada lá de
    // dentro de calcularTotais), pra manter a comparação sempre correta
    function atualizarComparacaoMesAnterior() {
        if (gastosMesAnterior === null || gastosMesAnterior <= 0 || totalGastosAtual <= 0) {
            comparacaoMesAnteriorEl.hidden = true;
            return;
        }

        const diferencaPercentual = ((totalGastosAtual - gastosMesAnterior) / gastosMesAnterior) * 100;
        const arredondado = Math.round(Math.abs(diferencaPercentual));

        if (arredondado === 0) {
            comparacaoMesAnteriorEl.hidden = true;
            return;
        }

        const gastouMais = diferencaPercentual > 0;
        comparacaoMesAnteriorEl.hidden = false;
        comparacaoMesAnteriorEl.classList.toggle("gastou-mais", gastouMais);
        comparacaoMesAnteriorEl.classList.toggle("gastou-menos", !gastouMais);
        comparacaoMesAnteriorEl.innerHTML = `<span class="seta-comparacao">${gastouMais ? "▲" : "▼"}</span> Você gastou ${arredondado}% ${gastouMais ? "a mais" : "a menos"} que no mês anterior`;
    }

    // ==========================================================================
    // 10. ESCUTAR OS LANÇAMENTOS DO MÊS SELECIONADO, EM TEMPO REAL
    // ==========================================================================
    function escutarLancamentosDoMes(tentativa = 0) {
        if (ctx.pararDeEscutar) ctx.pararDeEscutar();

        const mesReferenciaAtual = mesReferenciaString(ctx.mesSelecionado);

        const referencia = collection(db, "usuarios", ctx.uidAtual, "lancamentos");
        // Filtra por "mesReferencia" (o mês que a pessoa estava navegando na
        // hora de criar), não pela data exata — são coisas separadas de
        // propósito. Sem orderBy aqui (evitaria precisar de índice composto,
        // já que ordenar por "data" enquanto filtra por "mesReferencia" são
        // campos diferentes) — ordena do lado do app mesmo, é rapidinho.
        const consulta = query(referencia, where("mesReferencia", "==", mesReferenciaAtual));

        ctx.pararDeEscutar = onSnapshot(consulta, { includeMetadataChanges: true }, (snapshot) => {
            // Ordena pela ORDEM REAL que a pessoa lançou (criadoEm), não pela
            // data escolhida — assim "Lançamentos recentes" mostra de verdade
            // os últimos 4 que você acabou de criar, consistente com o extrato
            const documentosOrdenados = [...snapshot.docs].sort(
                (a, b) => {
                    // Reserva: logo depois de criar um lançamento, o criadoEm
                    // pode ficar momentaneamente vazio até o servidor
                    // confirmar — nesse instante raro, cai de volta pra "data"
                    const dataA = a.data().criadoEm?.toDate() || a.data().data.toDate();
                    const dataB = b.data().criadoEm?.toDate() || b.data().data.toDate();
                    return dataB - dataA;
                }
            );
            ctx.ultimosDocumentosDoMes = documentosOrdenados;
            renderizarLista(documentosOrdenados);
            calcularTotais(documentosOrdenados);
            renderizarGrafico(documentosOrdenados);
            // Só conta como "chegou" quando veio do servidor — o do cache
            // pode estar incompleto na abertura do app
            if (!snapshot.metadata.fromCache) ctx.primeiroSnapshotDoMesChegou = true;
        }, (erro) => {
            console.error("Bull: erro ao escutar os lançamentos do mês —", erro);
        });

        // Rede de segurança: se nada chegou em 6s (rede instável na abertura),
        // liga a escuta de novo uma vez
        ctx.primeiroSnapshotDoMesChegou = false;
        const mesDaEscuta = mesReferenciaAtual;
        setTimeout(() => {
            if (!ctx.primeiroSnapshotDoMesChegou && tentativa < 3 && mesDaEscuta === mesReferenciaString(ctx.mesSelecionado)) {
                escutarLancamentosDoMes(tentativa + 1);
            }
        }, 4000);
    }

    // ==========================================================================
    // BANNER DE SALÁRIO — consulta própria, olhando pro mês corrente de
    // verdade, independente de qual mês está sendo exibido na tela
    // ==========================================================================
    function escutarSalarioDoMes() {
        if (ctx.pararDeEscutarSalario) ctx.pararDeEscutarSalario();

        // Só um filtro aqui de propósito (categoria) — evita precisar de
        // índice composto no Firestore, igual já resolvemos no Saldo Guardado.
        // O "é desse mês?" é conferido do lado do app, depois que os dados chegam.
        const referencia = collection(db, "usuarios", ctx.uidAtual, "lancamentos");
        const consulta = query(referencia, where("categoria", "==", "Salário"));

        ctx.pararDeEscutarSalario = onSnapshot(consulta, (snapshot) => {
            const hoje = new Date();
            const jaTemSalarioEsteMes = snapshot.docs.some((documento) => {
                const dataDoDocumento = documento.data().data.toDate();
                return dataDoDocumento.getFullYear() === hoje.getFullYear()
                    && dataDoDocumento.getMonth() === hoje.getMonth();
            });
            ctx.bannerSalario.hidden = jaTemSalarioEsteMes;
        });

        ctx.perguntaSalario.textContent = ctx.primeiroNome
            ? `Olá, ${ctx.primeiroNome}! Já recebeu seu salário deste mês?`
            : "Já recebeu seu salário deste mês?";
        ctx.valorSalarioBanner.value = ctx.salarioPadrao.toFixed(2).replace(".", ",");
    }

    // Grava o salário já com o banco escolhido — o saldo de cada banco só
    // soma ganhos que têm "banco", então sem isso o salário não entrava
    // no Saldo do Mês (era o bug: antes era gravado sem banco nenhum)
    async function gravarSalarioRecebido(valor, nomeBanco) {
        await addDoc(collection(db, "usuarios", ctx.uidAtual, "lancamentos"), {
            tipo: "ganho",
            valor: valor,
            categoria: "Salário",
            descricao: "",
            data: Timestamp.fromDate(new Date()),
            mesReferencia: mesReferenciaString(new Date()),
            criadoEm: serverTimestamp(),
            ...(nomeBanco ? { banco: nomeBanco } : {})
        });
    }

    const fundoModalBancoSalario = document.getElementById("fundo-modal-banco-salario");
    const textoBancoSalario = document.getElementById("texto-banco-salario");
    const campoBancoSalario = document.getElementById("campo-banco-salario");
    const botaoConfirmarBancoSalario = document.getElementById("botao-confirmar-banco-salario");
    const botaoFecharBancoSalario = document.getElementById("botao-fechar-banco-salario");
    let valorSalarioPendente = 0;

    ctx.botaoConfirmarSalario.addEventListener("click", async () => {
        const valor = paraNumero(ctx.valorSalarioBanner.value);
        if (!valor || valor <= 0) return;

        // Sem nenhum banco cadastrado não tem pra onde mandar o dinheiro:
        // grava como antes (o saldo nesse caso é só ganhos − gastos do mês)
        if (ctx.bancosCustomizados.length === 0) {
            ctx.botaoConfirmarSalario.disabled = true;
            try { await gravarSalarioRecebido(valor, null); } finally { ctx.botaoConfirmarSalario.disabled = false; }
            return;
        }

        valorSalarioPendente = valor;
        textoBancoSalario.textContent = `Os ${formatarMoeda(valor)} vão entrar no saldo do banco que você escolher.`;
        campoBancoSalario.innerHTML = "";
        ctx.bancosCustomizados.forEach((banco) => {
            const opcao = document.createElement("option");
            opcao.value = banco.nome;
            opcao.textContent = banco.nome;
            if (banco.nome === ctx.nomeBancoPrincipalAtual) opcao.selected = true;
            campoBancoSalario.appendChild(opcao);
        });
        fundoModalBancoSalario.classList.add("aberto");
    });

    botaoConfirmarBancoSalario.addEventListener("click", async () => {
        botaoConfirmarBancoSalario.disabled = true;
        try {
            await gravarSalarioRecebido(valorSalarioPendente, campoBancoSalario.value);
            fundoModalBancoSalario.classList.remove("aberto");
            mostrarToast("Salário recebido ✓ — já entrou no saldo.");
        } catch (erro) {
            mostrarToast("Não deu pra registrar agora. Confere sua internet e tenta de novo.");
        } finally {
            botaoConfirmarBancoSalario.disabled = false;
        }
    });

    botaoFecharBancoSalario.addEventListener("click", () => {
        fundoModalBancoSalario.classList.remove("aberto");
    });
    fundoModalBancoSalario.addEventListener("click", (evento) => {
        if (evento.target === fundoModalBancoSalario) fundoModalBancoSalario.classList.remove("aberto");
    });

    // ==========================================================================
    // GASTO QUE USA DINHEIRO GUARDADO
    // O saldo de um banco inclui o que está guardado nele. Se a pessoa gasta
    // mais do que o "livre" (saldo − guardado), na prática está gastando
    // dinheiro do Guardado. Aqui a gente pergunta e, se ela topar, faz a
    // retirada automática (banco → o mesmo banco) antes de salvar o gasto.
    // Devolve true se pode seguir com o gasto, false se a pessoa cancelou.
    // ==========================================================================
    const fundoModalCobrirGuardado = document.getElementById("fundo-modal-cobrir-guardado");
    const textoCobrirGuardado = document.getElementById("texto-cobrir-guardado");
    const campoMetaCobrirGuardado = document.getElementById("campo-meta-cobrir-guardado");
    const botaoSimCobrirGuardado = document.getElementById("botao-sim-cobrir-guardado");
    const botaoNaoCobrirGuardado = document.getElementById("botao-nao-cobrir-guardado");
    const botaoFecharCobrirGuardado = document.getElementById("botao-fechar-cobrir-guardado");

    function perguntarSobreGuardado(texto, metas) {
        return new Promise((resolver) => {
            textoCobrirGuardado.textContent = texto;
            campoMetaCobrirGuardado.innerHTML = "";
            metas.forEach((meta) => {
                const opcao = document.createElement("option");
                opcao.value = meta.nome;
                opcao.textContent = `${meta.nome || "Sem meta"} — ${formatarMoeda(meta.total)}`;
                campoMetaCobrirGuardado.appendChild(opcao);
            });
            fundoModalCobrirGuardado.classList.add("aberto");

            const terminar = (resposta) => {
                fundoModalCobrirGuardado.classList.remove("aberto");
                botaoSimCobrirGuardado.removeEventListener("click", aoSim);
                botaoNaoCobrirGuardado.removeEventListener("click", aoNao);
                botaoFecharCobrirGuardado.removeEventListener("click", aoCancelar);
                fundoModalCobrirGuardado.removeEventListener("click", aoFundo);
                resolver(resposta);
            };
            const aoSim = () => terminar({ acao: "tirar", metaEscolhida: campoMetaCobrirGuardado.value });
            const aoNao = () => terminar({ acao: "nao" });
            const aoCancelar = () => terminar({ acao: "cancelar" });
            const aoFundo = (evento) => { if (evento.target === fundoModalCobrirGuardado) aoCancelar(); };

            botaoSimCobrirGuardado.addEventListener("click", aoSim);
            botaoNaoCobrirGuardado.addEventListener("click", aoNao);
            botaoFecharCobrirGuardado.addEventListener("click", aoCancelar);
            fundoModalCobrirGuardado.addEventListener("click", aoFundo);
        });
    }

    async function cobrirGastoComGuardado(nomeBanco, valorGasto) {
        const bancoDoc = ctx.bancosCustomizados.find((b) => b.nome === nomeBanco);
        if (!bancoDoc) return true;

        const snapshotBanco = await getDoc(doc(db, "usuarios", ctx.uidAtual, "bancos", bancoDoc.id));
        const saldoInicial = snapshotBanco.exists() ? (snapshotBanco.data().saldoInicial || 0) : 0;
        const saldo = await ctx.calcularSaldoBancoAgora(nomeBanco, saldoInicial);

        const snapshotLancamentos = await getDocs(collection(db, "usuarios", ctx.uidAtual, "lancamentos"));
        const totalPorMeta = {};
        snapshotLancamentos.forEach((documento) => {
            const d = documento.data();
            if (d.categoria === "Guardar Dinheiro" && d.banco === nomeBanco) {
                const chave = d.meta || "";
                totalPorMeta[chave] = (totalPorMeta[chave] || 0) + d.valor;
            }
        });

        // Tudo em centavos (inteiros) pra não errar por fração de centavo
        const metas = Object.keys(totalPorMeta)
            .map((nome) => ({ nome, centavos: Math.round(totalPorMeta[nome] * 100) }))
            .filter((m) => m.centavos > 0)
            .sort((a, b) => b.centavos - a.centavos);
        if (metas.length === 0) return true;

        const guardadoCentavos = metas.reduce((soma, m) => soma + m.centavos, 0);
        const livreCentavos = Math.round(saldo * 100) - guardadoCentavos;
        const faltaCentavos = Math.round(valorGasto * 100) - Math.max(livreCentavos, 0);
        if (faltaCentavos <= 0) return true;

        const retirarCentavos = Math.min(faltaCentavos, guardadoCentavos);
        const texto = `Esse gasto de ${formatarMoeda(valorGasto)} é maior do que você tem livre em ${nomeBanco}. `
            + `Pra não deixar o Guardado desatualizado, posso tirar ${formatarMoeda(retirarCentavos / 100)} dele agora.`;
        const resposta = await perguntarSobreGuardado(texto, metas.map((m) => ({ nome: m.nome, total: m.centavos / 100 })));

        if (resposta.acao === "cancelar") return false;
        if (resposta.acao === "nao") return true;

        // Meta escolhida primeiro; se não bastar, completa com as maiores
        const ordem = [
            ...metas.filter((m) => m.nome === resposta.metaEscolhida),
            ...metas.filter((m) => m.nome !== resposta.metaEscolhida)
        ];
        let restante = retirarCentavos;
        const lote = writeBatch(db);
        const agora = new Date();
        ordem.forEach((meta) => {
            if (restante <= 0) return;
            const parte = Math.min(restante, meta.centavos);
            restante -= parte;
            const valorParte = parte / 100;
            const refGasto = doc(collection(db, "usuarios", ctx.uidAtual, "lancamentos"));
            const refGanho = doc(collection(db, "usuarios", ctx.uidAtual, "lancamentos"));
            lote.set(refGasto, {
                tipo: "gasto", valor: -valorParte, categoria: "Guardar Dinheiro", descricao: "Retirada",
                banco: nomeBanco, meta: meta.nome || null,
                data: Timestamp.fromDate(agora), mesReferencia: mesReferenciaString(agora),
                criadoEm: serverTimestamp(), lancamentoParId: refGanho.id
            });
            lote.set(refGanho, {
                tipo: "ganho", valor: valorParte, categoria: "Retirada da Reserva", descricao: "",
                banco: nomeBanco,
                data: Timestamp.fromDate(agora), mesReferencia: mesReferenciaString(agora),
                criadoEm: serverTimestamp(), lancamentoParId: refGasto.id
            });
        });
        await lote.commit();
        return true;
    }

    // ==========================================================================
    // 11. DESENHAR A LISTA (só os últimos N, o resto fica no Extrato Completo)
    // ==========================================================================
    function renderizarLista(documentos) {
        ctx.listaLancamentos.innerHTML = "";

        // A "Retirada" (valor negativo em "Guardar Dinheiro") é só um registro
        // interno de controle do cofrinho — quem representa o dinheiro voltando
        // pro saldo, de forma visível pra pessoa, é a "Retirada da Reserva"
        const documentosParaExibir = documentos.filter(
            (documento) => !(documento.data().categoria === "Guardar Dinheiro" && documento.data().valor < 0)
        );

        ctx.listaVazia.hidden = documentosParaExibir.length > 0;

        const documentosVisiveis = documentosParaExibir.slice(0, LIMITE_ITENS_LISTA_INICIAL);

        documentosVisiveis.forEach((documento) => {
            const dados = documento.data();
            const dataObj = dados.data.toDate();
            const dataFormatada = dataObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
            const horaFormatada = dataObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
            const ehTransferencia = dados.tipo === "transferencia";
            const sinal = ehTransferencia ? "⇄" : (dados.tipo === "ganho" ? "+" : "-");

            const item = document.createElement("li");
            item.className = `item-lancamento tipo-${dados.tipo}${dados.categoria === "Guardar Dinheiro" ? " tipo-cofre" : ""}`;
            item.dataset.id = documento.id;
            if (dados.tipo === "gasto") {
                item.style.setProperty("--cor-categoria-item", corDaCategoria(dados.categoria));
            }

            // Pra depósitos do cofrinho, o título grande mostra a meta (é o
            // que realmente identifica "o que é" aquilo) em vez do nome
            // genérico da categoria "Guardar Dinheiro"
            const ehCofrinho = dados.categoria === "Guardar Dinheiro";
            const tituloGrande = ehCofrinho
                ? (dados.meta || "Guardado")
                : (ehTransferencia ? (dados.descricao || "Transferência") : (dados.descricao || dados.categoria));
            const textoMetaItem = ehTransferencia
                ? `${dados.bancoOrigem || "?"} → ${dados.banco || "?"}`
                : dados.categoria;

            const botaoDuplicarHtml = (ehCofrinho || ehTransferencia) ? "" : `
                <button class="botao-duplicar" data-id="${documento.id}" aria-label="Duplicar lançamento">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                </button>
            `;

            item.innerHTML = `
                <span class="ponto-categoria"></span>
                <div class="info-lancamento">
                    <div class="descricao-lancamento">${escaparHtml(tituloGrande)}</div>
                    <div class="meta-lancamento">${escaparHtml(textoMetaItem)} · ${dataFormatada} às ${horaFormatada}</div>
                </div>
                <span class="valor-lancamento">${sinal} ${formatarMoeda(dados.valor)}</span>
                ${botaoDuplicarHtml}
                <button class="botao-excluir" data-id="${documento.id}" aria-label="Excluir lançamento">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/>
                    </svg>
                </button>
            `;
            item.dataset.dados = JSON.stringify({ tipo: dados.tipo, valor: dados.valor, categoria: dados.categoria, descricao: dados.descricao || "" });
            item._dadosOriginais = dados;
            ctx.listaLancamentos.appendChild(item);
        });
    }

    // Clique no lançamento (fora do botão de excluir) abre edição
    ctx.listaLancamentos.addEventListener("click", async (evento) => {
        const botaoDuplicar = evento.target.closest(".botao-duplicar");
        if (botaoDuplicar) {
            const itemPai = botaoDuplicar.closest(".item-lancamento");
            const dadosDoItem = itemPai ? itemPai._dadosOriginais : null;
            if (!dadosDoItem) return;

            const descricaoOuCategoria = dadosDoItem.descricao || dadosDoItem.categoria;
            const confirmou = await confirmarComTelinha(`Duplicar "${descricaoOuCategoria}" (${formatarMoeda(dadosDoItem.valor)}) com a data de hoje?`);
            if (!confirmou) return;

            await addDoc(collection(db, "usuarios", ctx.uidAtual, "lancamentos"), {
                tipo: dadosDoItem.tipo,
                valor: dadosDoItem.valor,
                categoria: dadosDoItem.categoria,
                descricao: dadosDoItem.descricao || "",
                data: Timestamp.fromDate(new Date()), // duplicado sempre cai em "hoje"
                mesReferencia: mesReferenciaString(ctx.mesSelecionado),
                criadoEm: serverTimestamp()
            });

            mostrarToast("Lançamento duplicado pra hoje ✓");
            return;
        }

        const botaoExcluir = evento.target.closest(".botao-excluir");
        if (botaoExcluir) {
            const itemPai = botaoExcluir.closest(".item-lancamento");
            const dadosDoItem = itemPai ? itemPai._dadosOriginais : null;

            // Itens do cofrinho ("Guardar Dinheiro") só podem ser excluídos
            // pela tela "Saldo Guardado" — excluir daqui, sem querer, deixava
            // o total do cofrinho desbalanceado (podendo até ficar negativo)
            if (dadosDoItem && dadosDoItem.categoria === "Guardar Dinheiro") {
                window.alert("Esse lançamento faz parte do seu Saldo Guardado. Pra excluir ou ajustar, vai na aba Guardado, embaixo.");
                return;
            }

            const confirmou = await confirmarComTelinha("Tem certeza de que deseja excluir este lançamento?");
            if (!confirmou) return;

            // Guarda os dados ANTES de excluir, pra poder recriar se a pessoa
            // clicar em "Desfazer" nos próximos segundos
            const dadosParaDesfazer = dadosDoItem ? { ...dadosDoItem } : null;

            await deleteDoc(doc(db, "usuarios", ctx.uidAtual, "lancamentos", botaoExcluir.dataset.id));
            if (dadosDoItem && dadosDoItem.divisaoId) {
                const apagouOutra = await excluirOutraParte(ctx.uidAtual, "lancamentos", dadosDoItem.divisaoId, botaoExcluir.dataset.id, confirmarComTelinha);
                if (apagouOutra) { mostrarToast("As duas partes foram excluídas ✓"); return; }
            }

            if (dadosParaDesfazer) {
                mostrarToastComAcao("Lançamento excluído.", "Desfazer", async () => {
                    await addDoc(collection(db, "usuarios", ctx.uidAtual, "lancamentos"), {
                        tipo: dadosParaDesfazer.tipo,
                        valor: dadosParaDesfazer.valor,
                        categoria: dadosParaDesfazer.categoria,
                        descricao: dadosParaDesfazer.descricao || "",
                        data: dadosParaDesfazer.data,
                        mesReferencia: dadosParaDesfazer.mesReferencia || mesReferenciaString(dadosParaDesfazer.data.toDate()),
                        criadoEm: serverTimestamp()
                    });
                });
            }
            return;
        }

        const item = evento.target.closest(".item-lancamento");
        if (item && item._dadosOriginais) {
            if (item._dadosOriginais.categoria === "Guardar Dinheiro") {
                window.alert("Esse lançamento faz parte do seu Saldo Guardado e não pode ser editado por aqui.");
                return;
            }
            if (item._dadosOriginais.tipo === "transferencia") {
                mostrarToast("Transferência não edita. Exclua e faça de novo.", 3200);
                return;
            }
            ctx.abrirModalEdicao(item.dataset.id, item._dadosOriginais);
        }
    });

    // ==========================================================================
    // 12. CALCULAR OS TOTAIS DO MÊS
    // ==========================================================================
    function calcularTotais(documentos) {
        let totalGanhos = 0;
        let totalGastos = 0;
        let totalRepasses = 0;
        let temRepasses = false;

        documentos.forEach((documento) => {
            const dados = documento.data();

            // Transferência entre bancos: o dinheiro só mudou de lugar
            if (dados.tipo === "transferencia") return;

            // Repasse/acerto: fica de fora de Ganhos e Gastos, mas conta
            // no saldo do mês (o dinheiro realmente passou pela conta)
            if (ctx.ehForaDosTotais(dados.categoria)) {
                temRepasses = true;
                totalRepasses += dados.tipo === "ganho" ? dados.valor : -dados.valor;
                return;
            }

            // "Guardar Dinheiro" tem uma regra própria, pra fechar a conta certinho:
            // - Depósito (valor positivo): reduz o saldo, como se fosse um gasto —
            //   o dinheiro "saiu" do disponível e foi pra reserva.
            // - Retirada (valor negativo, gerado automaticamente ao resgatar): NÃO
            //   mexe no saldo aqui — quem devolve o dinheiro é o lançamento separado
            //   "Retirada da Reserva" (esse sim conta como ganho normal). Se
            //   contássemos os dois, o valor voltaria em dobro.
            if (dados.categoria === "Guardar Dinheiro") {
                if (dados.valor > 0) totalGastos += dados.valor;
                return;
            }

            if (dados.tipo === "ganho") {
                totalGanhos += dados.valor;
            } else {
                totalGastos += dados.valor;
            }
        });

        ctx.totalGanhosEl.textContent = formatarMoeda(totalGanhos);
        ctx.totalGastosEl.textContent = formatarMoeda(totalGastos);
        const itemRepasses = document.getElementById("item-repasses");
        if (itemRepasses) {
            itemRepasses.hidden = !temRepasses;
            document.getElementById("total-repasses").textContent = formatarMoeda(totalRepasses);
        }
        ctx.saldoAtualDoMes = totalGanhos - totalGastos + totalRepasses;
        ctx.atualizarNumeroGrandeDoSaldo();

        totalGastosAtual = totalGastos;
        atualizarComparacaoMesAnterior();
        atualizarIndicadorMesFechado();
    }

    // Mostra uma bolinha verde/vermelha do lado do nome do mês, só quando o
    // mês exibido já "fechou" (é anterior ao mês atual de verdade) — ajuda a
    // navegar pra trás e já ver de relance se cada mês foi bom ou ruim
    function atualizarIndicadorMesFechado() {
        const hoje = new Date();
        const ehMesAtualOuFuturo = ctx.mesSelecionado.getFullYear() > hoje.getFullYear()
            || (ctx.mesSelecionado.getFullYear() === hoje.getFullYear() && ctx.mesSelecionado.getMonth() >= hoje.getMonth());

        if (ehMesAtualOuFuturo) {
            ctx.indicadorMesFechado.hidden = true;
            return;
        }

        ctx.indicadorMesFechado.hidden = false;
        ctx.indicadorMesFechado.classList.toggle("positivo", ctx.saldoAtualDoMes >= 0);
        ctx.indicadorMesFechado.classList.toggle("negativo", ctx.saldoAtualDoMes < 0);
        ctx.indicadorMesFechado.title = ctx.saldoAtualDoMes >= 0 ? "Mês fechou no positivo" : "Mês fechou no negativo";
    }




    // ==========================================================================
    // GRÁFICO DE ROSCA — gastos por categoria do mês selecionado
    // Desenhado em SVG puro (sem biblioteca externa), pra não depender de
    // internet extra nem pesar o app.
    // ==========================================================================
    function renderizarGrafico(documentosDoMes) {
        const totaisPorCategoria = {};

        // Compras no cartão de crédito entram aqui pelo mês em que foram
        // feitas (só pra mostrar — não mexem no saldo, que só desce quando
        // a fatura é paga). Por isso o lançamento "Fatura do Cartão" fica
        // de fora do gráfico: ele é a soma dessas mesmas compras, e contar
        // os dois seria gastar em dobro.
        const nomesCartoes = {};
        ctx.cartoesCustomizados.forEach((cartao) => { nomesCartoes[cartao.id] = cartao.nome; });
        const mesDoGrafico = mesReferenciaString(ctx.mesSelecionado);
        const comprasDoCartaoNoMes = montarLancamentosDeCartao(ctx.docsCartaoParaGrafico, nomesCartoes)
            .filter((documento) => documento.data().mesReferencia === mesDoGrafico);
        const documentos = [...documentosDoMes, ...comprasDoCartaoNoMes];

        documentos.forEach((documento) => {
            const dados = documento.data();

            if (dados.categoria === "Fatura do Cartão") return;
            if (ctx.ehForaDosTotais(dados.categoria)) return;

            // Dinheiro guardado entra como uma fatia própria do gráfico, pra
            // mostrar o quanto foi poupado ao lado do que foi gasto
            if (dados.categoria === "Guardar Dinheiro") {
                totaisPorCategoria["Guardado"] = (totaisPorCategoria["Guardado"] || 0) + dados.valor;
                return;
            }

            if (dados.tipo !== "gasto") return;
            totaisPorCategoria[dados.categoria] = (totaisPorCategoria[dados.categoria] || 0) + dados.valor;
        });

        const categorias = Object.keys(totaisPorCategoria)
            .map((nome) => ({ nome, valor: totaisPorCategoria[nome] }))
            .filter((item) => item.valor > 0)
            .sort((a, b) => b.valor - a.valor);

        const totalGeral = categorias.reduce((soma, item) => soma + item.valor, 0);

        ctx.graficoDonut.innerHTML = "";
        ctx.legendaGrafico.innerHTML = "";

        if (totalGeral === 0) {
            ctx.graficoVazio.hidden = false;
            ctx.graficoDonut.closest(".cartao-grafico").hidden = true;
            return;
        }

        ctx.graficoVazio.hidden = true;
        ctx.graficoDonut.closest(".cartao-grafico").hidden = false;

        const raio = 50;
        const circunferencia = 2 * Math.PI * raio;
        let deslocamentoAcumulado = 0;

        registrarCategorias(categorias.map((item) => item.nome));
        categorias.forEach((item, indice) => {
            const percentual = item.valor / totalGeral;
            const cor = corDaCategoria(item.nome);
            const comprimentoFatia = percentual * circunferencia;

            const circulo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circulo.setAttribute("cx", "60");
            circulo.setAttribute("cy", "60");
            circulo.setAttribute("r", String(raio));
            circulo.setAttribute("fill", "none");
            circulo.setAttribute("stroke", cor);
            circulo.setAttribute("stroke-width", "16");
            circulo.setAttribute("stroke-dasharray", `${comprimentoFatia} ${circunferencia - comprimentoFatia}`);
            circulo.setAttribute("stroke-dashoffset", String(-deslocamentoAcumulado));
            circulo.addEventListener("click", () => irParaExtratoFiltrado(item.nome));
            ctx.graficoDonut.appendChild(circulo);

            deslocamentoAcumulado += comprimentoFatia;

            const itemLegenda = document.createElement("li");
            itemLegenda.className = "item-legenda";

            const limiteConfigurado = ctx.mapaOrcamentos[item.nome];
            let barraHtml = "";
            if (limiteConfigurado && limiteConfigurado > 0) {
                const percentualUsado = Math.min(100, (item.valor / limiteConfigurado) * 100);
                const classeCor = percentualUsado >= 100 ? "estourou" : (percentualUsado >= 80 ? "aviso" : "");
                barraHtml = `
                    <div class="barra-orcamento-item">
                        <div class="barra-orcamento-wrapper">
                            <div class="barra-orcamento-preenchida ${classeCor}" style="width: ${percentualUsado}%"></div>
                        </div>
                        <div class="texto-barra-orcamento">${formatarMoeda(item.valor)} de ${formatarMoeda(limiteConfigurado)}</div>
                    </div>
                `;
            }

            itemLegenda.innerHTML = `
                <span class="ponto-legenda" style="background-color: ${cor}"></span>
                <span class="nome-legenda">${escaparHtml(item.nome)}</span>
                <span class="percentual-legenda">${Math.round(percentual * 100)}%</span>
                ${barraHtml}
            `;
            itemLegenda.addEventListener("click", () => irParaExtratoFiltrado(item.nome));
            ctx.legendaGrafico.appendChild(itemLegenda);
        });
    }

    // Leva pro Extrato Completo já filtrado pelo mês em exibição + a
    // categoria clicada no gráfico (mostra tudo, sem o limite de 4 itens
    // da lista resumida da tela inicial)
    function irParaExtratoFiltrado(nomeCategoria) {
        const nomeReal = nomeCategoria === "Guardado" ? "Guardar Dinheiro" : nomeCategoria;
        const mesParaUrl = String(ctx.mesSelecionado.getMonth() + 1).padStart(2, "0");
        const url = `extrato.html?mes=${ctx.mesSelecionado.getFullYear()}-${mesParaUrl}&categoria=${encodeURIComponent(nomeReal)}`;
        window.location.href = url;
    }

    return { buscarGastosMesAnterior, escutarLancamentosDoMes, escutarSalarioDoMes, cobrirGastoComGuardado, calcularTotais, renderizarGrafico };
}
