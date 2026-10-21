// ==========================================================================
// Pagamentos pendentes do mês
// (separado de dashboard.js; recebe da tela inicial só o que precisa, em "ctx")
// ==========================================================================
import { formatarMoeda, paraNumero, aplicarMascaraValor, faturaJaFechou } from "./util.js";
import { escaparHtml } from "./texto.js";
import { reajustarParcelas } from "./parcelas.js";
import { excluirOutraParte } from "./divisao.js";
import { confirmarComTelinha, mostrarToast } from "./avisos.js";
import { db } from "./firebase-config.js";
import { collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, query, where, onSnapshot, Timestamp, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { corDaCategoria } from "./cores.js";
import { CATEGORIAS_PADRAO } from "./constantes.js";

export function iniciarPendencias(ctx) {
    // ==========================================================================
    // PAGAMENTOS PENDENTES — gastos fixos e parcelas do mês selecionado.
    // Ficam separados dos lançamentos normais até serem marcados como pagos.
    // ==========================================================================
    let pararDeEscutarPendencias = null;

    function escutarPendenciasDoMes() {
        if (pararDeEscutarPendencias) pararDeEscutarPendencias();

        // Só pendências NORMAIS aqui (gasto fixo/parcelado pago em banco) —
        // pra essas, "mesReferencia" é mesmo o mês do calendário, então
        // filtrar pelo mês sendo navegado faz sentido. Itens de CARTÃO
        // (noCartao=true) NÃO entram nessa consulta — "mesReferencia" pra
        // eles é o CICLO da fatura (pode ser o mês que vem, se a compra foi
        // depois do fechamento), um conceito diferente de "mês navegado no
        // calendário". Eles têm a própria consulta, em escutarResumoFaturaCartoes.
        const mesReferencia = `${ctx.mesSelecionado.getFullYear()}-${String(ctx.mesSelecionado.getMonth() + 1).padStart(2, "0")}`;
        const referencia = collection(db, "usuarios", ctx.uidAtual, "pendencias");
        const consulta = query(referencia, where("mesReferencia", "==", mesReferencia), where("noCartao", "==", false));

        pararDeEscutarPendencias = onSnapshot(consulta, (snapshot) => {
            const documentosOrdenados = [...snapshot.docs].sort((a, b) => a.data().diaDoMes - b.data().diaDoMes);
            renderizarListaPendenciasNormais(documentosOrdenados);
        });
    }

    // ==========================================================================
    // RESUMO "FATURA CARTÕES DE CRÉDITO" — usa EXATAMENTE a mesma lógica de
    // fechamento da tela do Cartão (calcularEstadoCartao em cartao.js), pra
    // nunca mais mostrar um valor diferente do que aparece lá. Antes, esse
    // resumo somava pendências de cartão filtrando só por "mesReferencia ==
    // mês navegado no calendário" — só que "mesReferencia" de um item de
    // cartão é o CICLO da fatura (pode já ser o mês que vem, se a compra foi
    // feita depois do dia de fechamento), não o mês do calendário. Isso
    // fazia esse resumo somar itens que não tinham nada a ver com a fatura
    // atual, ou deixar de somar a fatura certa — dependendo do dia do mês
    // ==========================================================================
    let pararDeEscutarResumoFaturaCartoes = null;

    function escutarResumoFaturaCartoes() {
        if (pararDeEscutarResumoFaturaCartoes) pararDeEscutarResumoFaturaCartoes();

        const referencia = collection(db, "usuarios", ctx.uidAtual, "pendencias");
        const consulta = query(referencia, where("noCartao", "==", true));

        pararDeEscutarResumoFaturaCartoes = onSnapshot(consulta, (snapshot) => {
            const todosOsItens = snapshot.docs;
            let totalFechadoGeral = 0;
            let totalAcumulandoGeral = 0;

            // As compras no cartão também entram no gráfico por categoria
            // (ver renderizarGrafico) — redesenha quando elas mudarem
            ctx.docsCartaoParaGrafico = todosOsItens;
            ctx.renderizarGrafico(ctx.ultimosDocumentosDoMes);

            // Um cartão por vez, do mesmo jeito que calcularEstadoCartao faz
            // em cartao.js — cada cartão tem seu próprio dia de fechamento,
            // então não dá pra somar tudo junto sem separar primeiro
            ctx.cartoesCustomizados.forEach((cartao) => {
                const diaFechamento = cartao.diaFechamento || 1;
                const itensDoCartao = todosOsItens.filter((documento) => documento.data().cartaoId === cartao.id);

                const itensFechados = itensDoCartao.filter((documento) => faturaJaFechou(documento.data().mesReferencia, diaFechamento));
                const itensNaoFechados = itensDoCartao.filter((documento) => !faturaJaFechou(documento.data().mesReferencia, diaFechamento));

                let proximoMesReferencia = null;
                itensNaoFechados.forEach((documento) => {
                    const mesRef = documento.data().mesReferencia;
                    if (!proximoMesReferencia || mesRef < proximoMesReferencia) proximoMesReferencia = mesRef;
                });
                const itensAcumulandoAgora = itensNaoFechados.filter((documento) => documento.data().mesReferencia === proximoMesReferencia);

                const totalFechadoNaoPago = itensFechados
                    .filter((documento) => !documento.data().pago)
                    .reduce((soma, documento) => soma + documento.data().valor, 0);
                const totalAcumulandoAgora = itensAcumulandoAgora.reduce((soma, documento) => soma + documento.data().valor, 0);

                totalFechadoGeral += totalFechadoNaoPago;
                totalAcumulandoGeral += totalAcumulandoAgora;
            });

            renderizarFaturaCartao(totalFechadoGeral, totalAcumulandoGeral);
        });
    }

    const LIMITE_PENDENCIAS_RECOLHIDO = 3;
    let ultimosPendenciasNormaisRenderizadas = [];

    function renderizarListaPendenciasNormais(documentos) {
        ultimosPendenciasNormaisRenderizadas = documentos;
        ctx.listaPendencias.innerHTML = "";
        ctx.pendenciasVazio.hidden = documentos.length > 0;

        // Gasto Fixo aparece sempre antes de Parcelado, pra não ficar
        // misturado — dentro de cada grupo, mantém a ordem que já veio
        const documentosOrdenados = [...documentos].sort((a, b) => {
            const ehFixoA = a.data().origem !== "parcelado" ? 0 : 1;
            const ehFixoB = b.data().origem !== "parcelado" ? 0 : 1;
            return ehFixoA - ehFixoB;
        });

        // Lembra se a pessoa deixou recolhido ou expandido da última vez —
        // guardado no aparelho, persiste entre sessões
        const estaExpandido = localStorage.getItem("pendencias_expandido") === "true";
        const precisaRecolher = !estaExpandido && documentosOrdenados.length > LIMITE_PENDENCIAS_RECOLHIDO;
        const visiveis = precisaRecolher ? documentosOrdenados.slice(0, LIMITE_PENDENCIAS_RECOLHIDO) : documentosOrdenados;

        visiveis.forEach((documento) => {
            ctx.listaPendencias.appendChild(criarItemPendencia(documento, true));
        });

        // O botão sempre mostra quantidade + valor total, mesmo recolhido —
        // de propósito, pra nunca ficar "escondido" que existe conta
        // esperando, mesmo quando a lista tá fechada
        if (documentosOrdenados.length > LIMITE_PENDENCIAS_RECOLHIDO) {
            const totalPendencias = documentosOrdenados.reduce((soma, documento) => soma + documento.data().valor, 0);
            ctx.botaoVerMaisPendencias.hidden = false;
            ctx.botaoVerMaisPendencias.textContent = precisaRecolher
                ? `Ver mais (${documentosOrdenados.length} pendências · ${formatarMoeda(totalPendencias)}) ▼`
                : `Ver menos (${documentosOrdenados.length} pendências · ${formatarMoeda(totalPendencias)}) ▲`;
        } else {
            ctx.botaoVerMaisPendencias.hidden = true;
        }
    }

    ctx.botaoVerMaisPendencias.addEventListener("click", () => {
        const estaExpandidoAgora = localStorage.getItem("pendencias_expandido") === "true";
        localStorage.setItem("pendencias_expandido", String(!estaExpandidoAgora));
        renderizarListaPendenciasNormais(ultimosPendenciasNormaisRenderizadas);
    });

    // Monta o <li> de uma pendência. mostrarBotaoPago=false esconde o botão
    // "Marcar como paga" — usado pros itens "No Cartão", que só são pagos
    // em bloco, através da Fatura
    const ICONE_LAPIS = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
    const ICONE_LAPIS_PEQUENO = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;

    function criarItemPendencia(documento, mostrarBotaoPago) {
        const dados = documento.data();
        const parcelasRestantes = dados.origem === "parcelado" ? dados.totalParcelas - dados.numeroParcela : null;
        const badgeParcela = dados.origem === "parcelado"
            ? `<span class="badge-parcela">Parcela ${dados.numeroParcela}/${dados.totalParcelas}</span>`
            : (dados.origem === "avulsa" ? `<span class="badge-parcela">Compra única</span>` : `<span class="badge-parcela">Fixo</span>`);

        const badgeQuaseAcabando = (parcelasRestantes !== null && parcelasRestantes <= 1)
            ? `<span class="badge-parcela badge-quase-acabando">Quase acabando!</span>`
            : "";

        let textoPagoEm = "";
        if (dados.pago && dados.pagoEm) {
            const dataPagamento = dados.pagoEm.toDate();
            const dataFormatadaPagamento = dataPagamento.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
            const horaFormatadaPagamento = dataPagamento.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
            textoPagoEm = `<div class="texto-pago-em">Pago em ${dataFormatadaPagamento} às ${horaFormatadaPagamento}</div>`;
        }

        let textoValorTotal = "";
        if (dados.origem === "parcelado") {
            const totalDaCompra = dados.valorTotalCompra ?? (dados.valor * dados.totalParcelas);
            textoValorTotal = `<div class="texto-pago-em" style="color: var(--text-muted);">Total da compra: ${formatarMoeda(totalDaCompra)}</div>`;
        }

        // Forma de pagamento — sempre editável, pra pendências recorrentes
        // que nasceram antes dessa funcionalidade existir, ou pra quando a
        // pessoa simplesmente muda de banco depois. Só não aparece nos
        // itens do cartão (crédito já tem seu próprio fluxo, fixo).
        let linhaFormaPagamentoHtml = "";
        if (!dados.noCartao) {
            const descricaoEscapadaForma = escaparHtml(dados.descricao || "");
            const nomesFormaPagamento = { dinheiro: "Dinheiro", pix: "PIX", debito: "Débito" };
            const textoAtual = dados.formaPagamento ? (nomesFormaPagamento[dados.formaPagamento] || dados.formaPagamento) : null;
            const textoBotaoForma = textoAtual
                ? `${textoAtual}${dados.banco ? " · " + escaparHtml(dados.banco) : ""}`
                : "+ Forma de pagamento";
            linhaFormaPagamentoHtml = `<button type="button" class="chip-acao botao-editar-forma-pagamento" title="Editar forma de pagamento" data-id="${documento.id}" data-grupo="${dados.grupoId || ""}" data-forma-atual="${dados.formaPagamento || ""}" data-banco-atual="${escaparHtml(dados.banco || "")}" data-descricao="${descricaoEscapadaForma}">${textoBotaoForma}${textoAtual ? ICONE_LAPIS_PEQUENO : ""}</button>`;
        }

        // Chave PIX: se a forma de pagamento for PIX, sempre oferece um
        // jeito de adicionar/editar a chave — e, se já tiver uma salva,
        // mostra o botão de copiar também, pra usar na hora de pagar sem
        // precisar ir atrás em outro lugar (WhatsApp, etc.)
        let linhaChavePixHtml = "";
        if (dados.formaPagamento === "pix") {
            // Escapa aspas nos dois campos que viram atributo HTML — sem
            // isso, uma descrição ou chave com aspas (tipo Aluguel "novo
            // apto") quebraria o atributo e bagunçaria o botão inteiro
            const chaveEscapada = escaparHtml(dados.chavePix || "");
            const descricaoEscapada = escaparHtml(dados.descricao || "");
            const botaoCopiar = dados.chavePix
                ? `<button type="button" class="chip-acao botao-copiar-pix" data-chave="${chaveEscapada}">Copiar PIX</button>`
                : "";
            const botaoEditar = `<button type="button" class="chip-acao botao-editar-pix" data-id="${documento.id}" data-grupo="${dados.grupoId || ""}" data-chave-atual="${chaveEscapada}" data-descricao="${descricaoEscapada}">${dados.chavePix ? "Editar chave" : "+ Chave PIX"}</button>`;
            linhaChavePixHtml = `${botaoCopiar}${botaoEditar}`;
        }

        const botaoEditarPendenciaHtml = dados.noCartao ? "" : `<button type="button" class="botao-lapis botao-editar-pendencia" data-id="${documento.id}" aria-label="Editar nome ou valor" title="Editar nome ou valor">${ICONE_LAPIS}</button>`;
        const temChips = linhaFormaPagamentoHtml || linhaChavePixHtml;

        const botaoPagoHtml = mostrarBotaoPago ? `
                <button class="botao-marcar-pago ${dados.pago ? "pago" : ""}" data-id="${documento.id}" data-pago="${dados.pago}">
                    ${dados.pago ? "✓ Paga" : "Marcar como paga"}
                </button>` : "";

        const item = document.createElement("li");
        item.className = "item-conta";
        item.style.setProperty("--cor-categoria-item", corDaCategoria(dados.categoria));
        item.innerHTML = `
            <span class="ponto-categoria ponto-categoria-conta"></span>
            <div class="info-conta">
                <div class="nome-conta">${escaparHtml(dados.descricao)}${badgeParcela}${badgeQuaseAcabando}${botaoEditarPendenciaHtml}</div>
                <div class="meta-conta">${escaparHtml(dados.categoria)} · Vence dia ${dados.diaDoMes}</div>
                ${textoValorTotal}
                ${textoPagoEm}
                ${temChips ? `<div class="chips-conta">${linhaFormaPagamentoHtml}${linhaChavePixHtml}</div>` : ""}
            </div>
            <span class="valor-conta">${formatarMoeda(dados.valor)}</span>
            <div class="status-conta">
                ${botaoPagoHtml}
                <button class="botao-excluir-conta" data-id="${documento.id}" aria-label="Excluir pendência">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/>
                    </svg>
                </button>
            </div>
        `;
        return item;
    }

    // Mostra só um resumo (nome do cartão + valor total da fatura) com link
    // pra tela própria do Cartão de Crédito, onde toda a gestão acontece —
    // adicionar item, marcar fatura como paga, editar nome do cartão, etc.
    // A seção "Bancos e Cartões" na tela inicial só fica escondida se as
    // DUAS linhas (bancos e fatura) não tiverem nada pra mostrar — cada uma
    // controla a própria visibilidade, essa função só combina as duas
    function atualizarVisibilidadeSecaoBancosCartoes() {
        ctx.secaoFaturaCartao.hidden = ctx.linkResumoFatura.hidden && ctx.linkResumoBancos.hidden;
    }

    // Recebe o total já calculado (fatura fechada não paga + fatura
    // acumulando agora, somado de todos os cartões) — a mesma conta que a
    // tela do Cartão faz pra cada cartão individualmente
    function renderizarFaturaCartao(totalFechado, totalAcumulando) {
        if (totalFechado <= 0 && totalAcumulando <= 0) {
            ctx.linkResumoFatura.hidden = true;
            atualizarVisibilidadeSecaoBancosCartoes();
            return;
        }
        ctx.linkResumoFatura.hidden = false;
        atualizarVisibilidadeSecaoBancosCartoes();

        // O número grande é a fatura FECHADA, a que você vai pagar (igual ao
        // app do banco). O que está se formando pra próxima aparece embaixo.
        // O detalhe de cada cartão fica na tela do Cartão.
        if (totalFechado > 0) {
            ctx.tituloFaturaCartao.textContent = "Fatura fechada · a pagar";
            ctx.valorFaturaCartao.textContent = formatarMoeda(totalFechado);
            ctx.vencimentoFaturaCartao.textContent = totalAcumulando > 0
                ? `Próxima fatura: ${formatarMoeda(totalAcumulando)} · ver detalhes por cartão`
                : "Ver detalhes por cartão";
        } else {
            ctx.tituloFaturaCartao.textContent = "Fatura em aberto";
            ctx.valorFaturaCartao.textContent = formatarMoeda(totalAcumulando);
            ctx.vencimentoFaturaCartao.textContent = "Ver detalhes por cartão";
        }
    }

    // ==========================================================================
    // TELINHA DE EXCLUIR PENDÊNCIA (substitui os confirm() feios do navegador)
    // ==========================================================================
    let pendenciaEmExclusao = null; // { id, dados }
    let pendenciaPixEmEdicaoId = null;
    let pendenciaFormaPagamentoEmEdicaoId = null;
    let grupoFormaPagamentoEmEdicao = null;
    let grupoPixEmEdicao = null;

    function abrirModalEditarPix(id, grupoId, chaveAtual, descricao) {
        pendenciaPixEmEdicaoId = id;
        grupoPixEmEdicao = grupoId || null;
        ctx.campoEditarChavePix.value = chaveAtual || "";
        ctx.textoEditarPixContexto.textContent = grupoPixEmEdicao
            ? `Isso atualiza a chave em "${descricao}" e em todas as próximas ocorrências ainda não pagas.`
            : `Isso atualiza a chave em "${descricao}".`;
        ctx.mensagemAvisoEditarPix.classList.remove("visivel");
        ctx.fundoModalEditarPix.classList.add("aberto");
    }

    ctx.botaoFecharEditarPix.addEventListener("click", () => {
        ctx.fundoModalEditarPix.classList.remove("aberto");
    });
    ctx.fundoModalEditarPix.addEventListener("click", (evento) => {
        if (evento.target === ctx.fundoModalEditarPix) ctx.fundoModalEditarPix.classList.remove("aberto");
    });

    ctx.botaoSalvarEditarPix.addEventListener("click", async () => {
        const novaChave = ctx.campoEditarChavePix.value.trim();
        ctx.mensagemAvisoEditarPix.classList.remove("visivel");

        const spinner = ctx.botaoSalvarEditarPix.querySelector(".spinner-botao");
        ctx.botaoSalvarEditarPix.disabled = true;
        spinner.hidden = false;

        try {
            if (grupoPixEmEdicao) {
                // Propaga pra todas as ocorrências do mesmo grupo (Fixo ou
                // Parcelado) que ainda não foram pagas — senão a chave só
                // ficaria salva no mês que você editou, e os próximos meses
                // continuariam sem ela
                const referenciaPendencias = collection(db, "usuarios", ctx.uidAtual, "pendencias");
                const consultaGrupo = query(referenciaPendencias, where("grupoId", "==", grupoPixEmEdicao), where("pago", "==", false));
                const resultado = await getDocs(consultaGrupo);

                const lote = writeBatch(db);
                resultado.forEach((documento) => {
                    lote.update(documento.ref, { chavePix: novaChave || null });
                });
                await lote.commit();
            } else if (pendenciaPixEmEdicaoId) {
                // Sem grupo (compra avulsa) — atualiza só essa mesmo
                await updateDoc(doc(db, "usuarios", ctx.uidAtual, "pendencias", pendenciaPixEmEdicaoId), { chavePix: novaChave || null });
            }

            ctx.fundoModalEditarPix.classList.remove("aberto");
            mostrarToast("Chave PIX salva ✓");
        } catch (erro) {
            ctx.mensagemAvisoEditarPix.textContent = "Não deu pra salvar agora. Confere sua internet e tenta de novo.";
            ctx.mensagemAvisoEditarPix.classList.add("visivel");
        } finally {
            ctx.botaoSalvarEditarPix.disabled = false;
            spinner.hidden = true;
        }
    });
    // ==========================================================================
    // EDITAR NOME OU VALOR DE UM PAGAMENTO PENDENTE
    // ==========================================================================
    const fundoModalEditarPendencia = document.getElementById("fundo-modal-editar-pendencia");
    const campoEditarPendenciaNome = document.getElementById("campo-editar-pendencia-nome");
    const campoEditarPendenciaValor = document.getElementById("campo-editar-pendencia-valor");
    const campoEditarPendenciaCategoria = document.getElementById("campo-editar-pendencia-categoria");
    const linhaEditarPendenciaGrupo = document.getElementById("linha-editar-pendencia-grupo");
    const campoEditarPendenciaGrupo = document.getElementById("campo-editar-pendencia-grupo");
    const mensagemAvisoEditarPendencia = document.getElementById("mensagem-aviso-editar-pendencia");
    const botaoSalvarEditarPendencia = document.getElementById("botao-salvar-editar-pendencia");
    const botaoFecharEditarPendencia = document.getElementById("botao-fechar-editar-pendencia");
    let pendenciaEmEdicao = null; // { id, dados }

    aplicarMascaraValor(campoEditarPendenciaValor);

    async function abrirModalEditarPendencia(id) {
        const snapshot = await getDoc(doc(db, "usuarios", ctx.uidAtual, "pendencias", id));
        if (!snapshot.exists()) return;
        const dados = snapshot.data();
        pendenciaEmEdicao = { id, dados };

        campoEditarPendenciaNome.value = dados.descricao || "";
        campoEditarPendenciaValor.value = dados.valor.toFixed(2).replace(".", ",");

        // Categorias de gasto (as padrão + as suas). Se a categoria atual do
        // item não estiver na lista (apagada, por exemplo), ela aparece mesmo assim
        const nomesCategorias = [...new Set([
            ...CATEGORIAS_PADRAO.gasto,
            ...ctx.categoriasCustomizadas.gasto.map((c) => c.nome)
        ])];
        if (dados.categoria && !nomesCategorias.includes(dados.categoria)) nomesCategorias.push(dados.categoria);
        campoEditarPendenciaCategoria.innerHTML = "";
        nomesCategorias.forEach((nome) => {
            const opcao = document.createElement("option");
            opcao.value = nome;
            opcao.textContent = nome;
            campoEditarPendenciaCategoria.appendChild(opcao);
        });
        campoEditarPendenciaCategoria.value = dados.categoria || "Outros";

        linhaEditarPendenciaGrupo.hidden = !dados.grupoId;
        linhaEditarPendenciaGrupo.style.display = dados.grupoId ? "flex" : "none";
        campoEditarPendenciaGrupo.checked = true;
        mensagemAvisoEditarPendencia.classList.remove("visivel");
        fundoModalEditarPendencia.classList.add("aberto");
    }

    function fecharModalEditarPendencia() {
        fundoModalEditarPendencia.classList.remove("aberto");
        pendenciaEmEdicao = null;
    }
    botaoFecharEditarPendencia.addEventListener("click", fecharModalEditarPendencia);
    fundoModalEditarPendencia.addEventListener("click", (evento) => {
        if (evento.target === fundoModalEditarPendencia) fecharModalEditarPendencia();
    });

    botaoSalvarEditarPendencia.addEventListener("click", async () => {
        if (!pendenciaEmEdicao) return;
        const novoNome = campoEditarPendenciaNome.value.trim();
        const novoValor = paraNumero(campoEditarPendenciaValor.value);
        mensagemAvisoEditarPendencia.classList.remove("visivel");

        if (!novoNome) {
            mensagemAvisoEditarPendencia.textContent = "Digita um nome.";
            mensagemAvisoEditarPendencia.classList.add("visivel");
            return;
        }
        if (!novoValor || novoValor <= 0) {
            mensagemAvisoEditarPendencia.textContent = "Digita um valor maior que zero.";
            mensagemAvisoEditarPendencia.classList.add("visivel");
            return;
        }

        const spinner = botaoSalvarEditarPendencia.querySelector(".spinner-botao");
        botaoSalvarEditarPendencia.disabled = true;
        spinner.hidden = false;

        try {
            const { id, dados } = pendenciaEmEdicao;
            const lote = writeBatch(db);
            const mudancas = { descricao: novoNome, valor: novoValor, categoria: campoEditarPendenciaCategoria.value || dados.categoria };
            const idsAtualizados = new Set([id]);

            // Parcelado aplicado em todas: o "Total da compra" acompanha o novo valor da parcela
            const mudancasPendencia = (dados.origem === "parcelado" && dados.grupoId && campoEditarPendenciaGrupo.checked)
                ? { ...mudancas, valorTotalCompra: Math.round(novoValor * dados.totalParcelas * 100) / 100 }
                : mudancas;

            lote.update(doc(db, "usuarios", ctx.uidAtual, "pendencias", id), mudancasPendencia);

            // Se essa já estava paga, o lançamento que ela gerou no extrato
            // também precisa acompanhar — senão saldo e extrato ficam errados
            if (dados.pago && dados.lancamentoId) {
                lote.update(doc(db, "usuarios", ctx.uidAtual, "lancamentos", dados.lancamentoId), mudancas);
            }

            // Fixo/Parcelado: aplica também nas próximas ainda não pagas
            if (dados.grupoId && campoEditarPendenciaGrupo.checked) {
                const resultado = await getDocs(query(
                    collection(db, "usuarios", ctx.uidAtual, "pendencias"),
                    where("grupoId", "==", dados.grupoId),
                    where("pago", "==", false)
                ));
                resultado.forEach((documento) => {
                    if (idsAtualizados.has(documento.id)) return;
                    lote.update(documento.ref, mudancasPendencia);
                    idsAtualizados.add(documento.id);
                });
            }

            await lote.commit();
            fecharModalEditarPendencia();
            mostrarToast("Pagamento atualizado ✓");
        } catch (erro) {
            mensagemAvisoEditarPendencia.textContent = "Não deu pra salvar agora. Confere sua internet e tenta de novo.";
            mensagemAvisoEditarPendencia.classList.add("visivel");
        } finally {
            botaoSalvarEditarPendencia.disabled = false;
            spinner.hidden = true;
        }
    });

    let escopoExclusaoEscolhido = null; // "so-essa" | "todas"

    function abrirModalEditarFormaPagamento(id, grupoId, formaAtual, bancoAtual, descricao) {
        pendenciaFormaPagamentoEmEdicaoId = id;
        grupoFormaPagamentoEmEdicao = grupoId || null;
        ctx.campoEditarFormaPagamento.value = formaAtual || "";

        if (formaAtual === "pix" || formaAtual === "debito") {
            ctx.popularSelectBancoGenerico(ctx.campoEditarBancoPagamento);
            ctx.campoEditarBancoPagamentoWrapper.hidden = false;
            ctx.campoEditarBancoPagamento.required = true;
            ctx.campoEditarBancoPagamento.value = bancoAtual || "__sem_banco__";
        } else {
            ctx.campoEditarBancoPagamentoWrapper.hidden = true;
            ctx.campoEditarBancoPagamento.required = false;
        }

        ctx.textoEditarFormaPagamentoContexto.textContent = grupoFormaPagamentoEmEdicao
            ? `Isso atualiza a forma de pagamento em "${descricao}" e em todas as próximas ocorrências ainda não pagas.`
            : `Isso atualiza a forma de pagamento em "${descricao}".`;
        ctx.mensagemAvisoEditarFormaPagamento.classList.remove("visivel");
        ctx.fundoModalEditarFormaPagamento.classList.add("aberto");
    }

    ctx.campoEditarFormaPagamento.addEventListener("change", () => {
        if (ctx.campoEditarFormaPagamento.value === "pix" || ctx.campoEditarFormaPagamento.value === "debito") {
            ctx.popularSelectBancoGenerico(ctx.campoEditarBancoPagamento);
            ctx.campoEditarBancoPagamentoWrapper.hidden = false;
            ctx.campoEditarBancoPagamento.required = true;
        } else {
            ctx.campoEditarBancoPagamentoWrapper.hidden = true;
            ctx.campoEditarBancoPagamento.required = false;
        }
    });

    ctx.botaoFecharEditarFormaPagamento.addEventListener("click", () => {
        ctx.fundoModalEditarFormaPagamento.classList.remove("aberto");
    });
    ctx.fundoModalEditarFormaPagamento.addEventListener("click", (evento) => {
        if (evento.target === ctx.fundoModalEditarFormaPagamento) ctx.fundoModalEditarFormaPagamento.classList.remove("aberto");
    });

    ctx.botaoSalvarEditarFormaPagamento.addEventListener("click", async () => {
        const novaForma = ctx.campoEditarFormaPagamento.value;
        ctx.mensagemAvisoEditarFormaPagamento.classList.remove("visivel");

        if (!novaForma) {
            ctx.mensagemAvisoEditarFormaPagamento.textContent = "Escolhe uma forma de pagamento.";
            ctx.mensagemAvisoEditarFormaPagamento.classList.add("visivel");
            return;
        }
        if ((novaForma === "pix" || novaForma === "debito") && !ctx.campoEditarBancoPagamento.value) {
            ctx.mensagemAvisoEditarFormaPagamento.textContent = "Escolhe de qual banco.";
            ctx.mensagemAvisoEditarFormaPagamento.classList.add("visivel");
            return;
        }

        const novoBanco = (novaForma === "pix" || novaForma === "debito")
            ? (ctx.campoEditarBancoPagamento.value === "__sem_banco__" ? null : ctx.campoEditarBancoPagamento.value)
            : null;

        const spinner = ctx.botaoSalvarEditarFormaPagamento.querySelector(".spinner-botao");
        ctx.botaoSalvarEditarFormaPagamento.disabled = true;
        spinner.hidden = false;

        try {
            if (grupoFormaPagamentoEmEdicao) {
                // Propaga pra todas as ocorrências do mesmo grupo (Fixo ou
                // Parcelado) que ainda não foram pagas — os meses já pagos
                // no passado continuam sem essa informação, porque não tem
                // como "inventar" um dado que não existia na hora
                const referenciaPendencias = collection(db, "usuarios", ctx.uidAtual, "pendencias");
                const consultaGrupo = query(referenciaPendencias, where("grupoId", "==", grupoFormaPagamentoEmEdicao), where("pago", "==", false));
                const resultado = await getDocs(consultaGrupo);

                const lote = writeBatch(db);
                resultado.forEach((documento) => {
                    lote.update(documento.ref, { formaPagamento: novaForma, banco: novoBanco });
                });
                await lote.commit();
            } else if (pendenciaFormaPagamentoEmEdicaoId) {
                await updateDoc(doc(db, "usuarios", ctx.uidAtual, "pendencias", pendenciaFormaPagamentoEmEdicaoId), { formaPagamento: novaForma, banco: novoBanco });
            }

            ctx.fundoModalEditarFormaPagamento.classList.remove("aberto");
            mostrarToast("Forma de pagamento salva ✓");
        } catch (erro) {
            ctx.mensagemAvisoEditarFormaPagamento.textContent = "Não deu pra salvar agora. Confere sua internet e tenta de novo.";
            ctx.mensagemAvisoEditarFormaPagamento.classList.add("visivel");
        } finally {
            ctx.botaoSalvarEditarFormaPagamento.disabled = false;
            spinner.hidden = true;
        }
    });

    function abrirModalExcluirPendencia() {
        const temGrupo = !!pendenciaEmExclusao.dados.grupoId;

        // Se não faz parte de um grupo, pula direto pra confirmação final —
        // não faz sentido perguntar "só essa ou todas" se só existe essa
        if (!temGrupo) {
            escopoExclusaoEscolhido = "so-essa";
            mostrarEtapaConfirmacaoExclusao();
        } else {
            const tipoGrupo = pendenciaEmExclusao.dados.origem === "parcelado" ? "parcelamento" : "gasto fixo";
            ctx.textoPerguntaEscopo.textContent = `Deseja excluir só essa ocorrência, ou todas as próximas desse ${tipoGrupo} (ainda não pagas)?`;
            escopoExclusaoEscolhido = null;
            ctx.etapaEscopoExclusao.hidden = false;
            ctx.etapaConfirmarExclusao.hidden = true;
        }

        ctx.fundoModalExcluirPendencia.classList.add("aberto");
    }

    function fecharModalExcluirPendencia() {
        ctx.fundoModalExcluirPendencia.classList.remove("aberto");
        pendenciaEmExclusao = null;
        escopoExclusaoEscolhido = null;
    }

    function mostrarEtapaConfirmacaoExclusao() {
        ctx.etapaEscopoExclusao.hidden = true;
        ctx.etapaConfirmarExclusao.hidden = false;

        ctx.textoConfirmarExclusao.textContent = escopoExclusaoEscolhido === "todas"
            ? "Tem certeza de que deseja excluir todas essas pendências? As que já foram marcadas como pagas continuam no seu histórico normalmente."
            : "Tem certeza de que deseja excluir essa pendência? Se ela já estava marcada como paga, o lançamento correspondente também será removido do saldo.";
    }

    ctx.botaoExcluirSoEssa.addEventListener("click", () => {
        escopoExclusaoEscolhido = "so-essa";
        mostrarEtapaConfirmacaoExclusao();
    });

    ctx.botaoExcluirTodas.addEventListener("click", () => {
        escopoExclusaoEscolhido = "todas";
        mostrarEtapaConfirmacaoExclusao();
    });

    ctx.botaoFecharExcluirPendencia.addEventListener("click", fecharModalExcluirPendencia);
    ctx.botaoCancelarExclusao.addEventListener("click", fecharModalExcluirPendencia);
    ctx.fundoModalExcluirPendencia.addEventListener("click", (evento) => {
        if (evento.target === ctx.fundoModalExcluirPendencia) fecharModalExcluirPendencia();
    });

    ctx.botaoConfirmarExclusaoFinal.addEventListener("click", async () => {
        if (!pendenciaEmExclusao) return;
        const { id, dados } = pendenciaEmExclusao;

        ctx.botaoConfirmarExclusaoFinal.disabled = true;

        if (escopoExclusaoEscolhido === "todas") {
            const referenciaPendencias = collection(db, "usuarios", ctx.uidAtual, "pendencias");
            const consultaGrupo = query(referenciaPendencias, where("grupoId", "==", dados.grupoId), where("pago", "==", false));
            const pendenciasDoGrupo = await getDocs(consultaGrupo);
            for (const documento of pendenciasDoGrupo.docs) {
                await deleteDoc(documento.ref);
            }
        } else {
            // Só essa: se já tinha sido marcada como paga, o lançamento real
            // vinculado a ela também precisa ser apagado — senão fica órfão
            if (dados.lancamentoId) {
                await deleteDoc(doc(db, "usuarios", ctx.uidAtual, "lancamentos", dados.lancamentoId)).catch(() => {});
            }
            await deleteDoc(doc(db, "usuarios", ctx.uidAtual, "pendencias", id));
            if (dados.divisaoId) await excluirOutraParte(ctx.uidAtual, "pendencias", dados.divisaoId, id, confirmarComTelinha);
        }
        if (dados.origem === "parcelado") await reajustarParcelas(ctx.uidAtual, dados.grupoId);

        ctx.botaoConfirmarExclusaoFinal.disabled = false;
        fecharModalExcluirPendencia();
    });

    async function handlerCliqueListaPendencias(evento) {
        const botaoCopiarPix = evento.target.closest(".botao-copiar-pix");
        if (botaoCopiarPix) {
            try {
                await navigator.clipboard.writeText(botaoCopiarPix.dataset.chave);
                mostrarToast("Chave PIX copiada ✓");
            } catch (erro) {
                mostrarToast("Não deu pra copiar automaticamente — copia manualmente.");
            }
            return;
        }

        const botaoEditarPendencia = evento.target.closest(".botao-editar-pendencia");
        if (botaoEditarPendencia) {
            abrirModalEditarPendencia(botaoEditarPendencia.dataset.id);
            return;
        }

        const botaoEditarPix = evento.target.closest(".botao-editar-pix");
        if (botaoEditarPix) {
            abrirModalEditarPix(botaoEditarPix.dataset.id, botaoEditarPix.dataset.grupo, botaoEditarPix.dataset.chaveAtual, botaoEditarPix.dataset.descricao);
            return;
        }

        const botaoEditarFormaPagamento = evento.target.closest(".botao-editar-forma-pagamento");
        if (botaoEditarFormaPagamento) {
            abrirModalEditarFormaPagamento(
                botaoEditarFormaPagamento.dataset.id,
                botaoEditarFormaPagamento.dataset.grupo,
                botaoEditarFormaPagamento.dataset.formaAtual,
                botaoEditarFormaPagamento.dataset.bancoAtual,
                botaoEditarFormaPagamento.dataset.descricao
            );
            return;
        }

        const botaoExcluir = evento.target.closest(".botao-excluir-conta");
        if (botaoExcluir) {
            const referenciaPendenciaExcluir = doc(db, "usuarios", ctx.uidAtual, "pendencias", botaoExcluir.dataset.id);
            const snapshotExcluir = await getDoc(referenciaPendenciaExcluir);
            const dadosExcluir = snapshotExcluir.exists() ? snapshotExcluir.data() : null;
            if (!dadosExcluir) return;

            pendenciaEmExclusao = { id: botaoExcluir.dataset.id, dados: dadosExcluir };
            abrirModalExcluirPendencia();
            return;
        }

        const botaoPago = evento.target.closest(".botao-marcar-pago");
        if (!botaoPago) return;

        const jaEstavaPago = botaoPago.dataset.pago === "true";
        const idPendencia = botaoPago.dataset.id;
        const referenciaPendencia = doc(db, "usuarios", ctx.uidAtual, "pendencias", idPendencia);

        if (jaEstavaPago) {
            const confirmouDesmarcar = await confirmarComTelinha("Tem certeza de que deseja desmarcar esse pagamento? O lançamento correspondente vai ser removido do saldo e do extrato.");
            if (!confirmouDesmarcar) return;

            // Desmarcar precisa apagar o lançamento real que foi criado quando
            // marcou como paga — senão ele fica "preso" pra sempre, afetando o
            // saldo mesmo depois de desmarcado (e duplicando se marcar de novo)
            const snapshotAtual = await getDoc(referenciaPendencia);
            const dadosAtuais = snapshotAtual.exists() ? snapshotAtual.data() : null;

            if (dadosAtuais && dadosAtuais.lancamentoId) {
                await deleteDoc(doc(db, "usuarios", ctx.uidAtual, "lancamentos", dadosAtuais.lancamentoId)).catch(() => {});
            }

            await updateDoc(referenciaPendencia, { pago: false, lancamentoId: null, pagoEm: null });
            return;
        }

        // Marcar como paga: busca os dados da própria pendência pra criar o
        // lançamento de verdade (é isso que desconta do saldo e aparece no extrato)
        const snapshotPendencia = await getDoc(referenciaPendencia);
        if (!snapshotPendencia.exists()) return;
        const dadosPendencia = snapshotPendencia.data();

        // Sem forma de pagamento (ou PIX/Débito sem banco), o app não sabe
        // DE ONDE sair o dinheiro — o gasto até entra no mês, mas não desce
        // o saldo do banco. Então pede isso antes de marcar como paga.
        const precisaDeBanco = dadosPendencia.formaPagamento === "pix" || dadosPendencia.formaPagamento === "debito";
        if (!dadosPendencia.formaPagamento || (precisaDeBanco && !dadosPendencia.banco)) {
            mostrarToast("Antes, diga como vai pagar (PIX, Débito, Dinheiro...) pra eu saber de onde descontar.");
            abrirModalEditarFormaPagamento(
                idPendencia, dadosPendencia.grupoId || "", dadosPendencia.formaPagamento || "",
                dadosPendencia.banco || "", dadosPendencia.descricao || ""
            );
            return;
        }

        const confirmouPagar = await confirmarComTelinha("Tem certeza de que esse pagamento já foi feito? Isso vai descontar o valor do seu saldo.");
        if (!confirmouPagar) return;

        const [ano, mes] = dadosPendencia.mesReferencia.split("-").map(Number);
        const agoraDoPagamento = new Date();
        const dataDoPagamento = new Date(
            ano, mes - 1, dadosPendencia.diaDoMes,
            agoraDoPagamento.getHours(), agoraDoPagamento.getMinutes(),
            agoraDoPagamento.getSeconds(), agoraDoPagamento.getMilliseconds()
        );

        if (dadosPendencia.banco && (dadosPendencia.formaPagamento === "pix" || dadosPendencia.formaPagamento === "debito")) {
            const podeSeguir = await ctx.cobrirGastoComGuardado(dadosPendencia.banco, dadosPendencia.valor);
            if (!podeSeguir) return;
        }

        const novoLancamento = await addDoc(collection(db, "usuarios", ctx.uidAtual, "lancamentos"), {
            tipo: "gasto",
            valor: dadosPendencia.valor,
            categoria: dadosPendencia.categoria,
            descricao: dadosPendencia.descricao,
            data: Timestamp.fromDate(dataDoPagamento),
            mesReferencia: dadosPendencia.mesReferencia,
            criadoEm: serverTimestamp(),
            ...(dadosPendencia.formaPagamento ? { formaPagamento: dadosPendencia.formaPagamento } : {}),
            ...(dadosPendencia.banco ? { banco: dadosPendencia.banco } : {})
        });

        await updateDoc(referenciaPendencia, { pago: true, lancamentoId: novoLancamento.id, pagoEm: serverTimestamp() });
    }

    ctx.listaPendencias.addEventListener("click", handlerCliqueListaPendencias);


    return { escutarPendenciasDoMes, escutarResumoFaturaCartoes, atualizarVisibilidadeSecaoBancosCartoes };
}
