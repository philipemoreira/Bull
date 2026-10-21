// ==========================================================================
// Formulário do + (criar, editar e salvar lançamentos)
// (separado de dashboard.js; recebe da tela inicial só o que precisa, em "ctx")
// ==========================================================================
import { formatarMoeda, paraNumero, aplicarMascaraValor, mesReferenciaString } from "./util.js";
import { iniciarTransferencia } from "./transferencia.js";
import { confirmarComTelinha, mostrarToast } from "./avisos.js";
import { formatarDataParaCampo, construirDataComHorarioReal, calcularMesReferenciaFatura } from "./datas.js";
import { db } from "./firebase-config.js";
import { collection, addDoc, updateDoc, doc, getDoc, getDocs, query, where, Timestamp, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export function iniciarFormulario(ctx) {
    // ==========================================================================
    // 7. MODAL — ABRIR PARA CRIAR
    // ==========================================================================
    function abrirModalNovo() {
        ctx.idEmEdicao = null;
        ctx.dadosOriginaisEmEdicao = null;
        ctx.modoGuardar = false;
        ctx.tituloModal.textContent = "Novo lançamento";
        ctx.textoBotaoSalvar.textContent = "Salvar lançamento";

        ctx.etapaEscolha.hidden = false;
        ctx.formulario.hidden = true;
        ctx.formulario.reset();
        esconderAviso();
        ctx.campoCategoriaWrapper.hidden = false;
        ctx.campoCategoria.required = true;
        ctx.campoNovaCategoriaWrapper.hidden = true;
        ctx.campoVencimentoNovaCategoriaWrapper.hidden = true;
        ctx.campoNovaCategoria.required = false; // sem isso, ficava "grudado" de uma vez que criou categoria nova antes
        ctx.campoParcelasWrapper.hidden = true;
        ctx.campoParcelas.required = false; // mesmo problema, grudava depois de usar "Parcelar" uma vez
        ctx.campoVencimentoLancamentoWrapper.hidden = true;
        ctx.campoVencimentoLancamento.required = false;
        ctx.campoVencimentoLancamento.value = "";
        ctx.campoBancoOrigemWrapper.hidden = true;
        ctx.campoBancoOrigem.required = false;
        ctx.campoBancoWrapper.hidden = true;
        ctx.campoBanco.required = false;
        ctx.campoChavePixWrapper.hidden = true;
        ctx.campoChavePix.value = "";
        ctx.campoFixo.checked = false;
        ctx.campoFixo.disabled = false;
        ctx.campoParcelado.checked = false;
        ctx.campoParcelado.disabled = false;
        ctx.previewParcela.hidden = true;
        campoDividir.checked = false;
        campoValorRepasse.value = "";

        ctx.perguntaEscolha.textContent = ctx.primeiroNome
            ? `${ctx.primeiroNome}, deseja registrar um:`
            : "Deseja registrar um:";

        ctx.fundoModal.classList.add("aberto");
    }

    // ==========================================================================
    // MODAL — ABRIR PARA EDITAR (a partir de um clique num item da lista)
    // ==========================================================================
    function abrirModalEdicao(idLancamento, dados) {
        ctx.idEmEdicao = idLancamento;
        ctx.dadosOriginaisEmEdicao = dados;
        // Só o DEPÓSITO do Guardar (valor positivo) é editável com campos
        // próprios — a Retirada usa 2 lançamentos ligados, editar os dois
        // de forma consistente é um caso mais complexo, fica de fora por
        // enquanto (continua editável só por valor/descrição/data)
        const ehGuardarDeposito = dados.categoria === "Guardar Dinheiro" && dados.valor > 0;
        ctx.modoGuardar = ehGuardarDeposito;
        ctx.tituloModal.textContent = "Editar lançamento";
        ctx.textoBotaoSalvar.textContent = "Salvar alterações";

        ctx.tipoSelecionado = dados.tipo;
        ctx.etapaEscolha.hidden = true;
        ctx.formulario.hidden = false;
        esconderAviso();

        ctx.botaoTrocarTipo.hidden = true; // não dá pra trocar o tipo de um lançamento já existente
        ctx.rotuloValor.textContent = "Valor";
        ctx.opcoesEspeciaisGasto.hidden = true; // editar não deve gerar novas parcelas/repetições
        blocoDividir.style.display = "none";
        campoDividir.checked = false;
        ctx.campoCategoriaWrapper.hidden = false;
        ctx.campoCategoria.required = true;
        ctx.campoNovaCategoriaWrapper.hidden = true;
        ctx.campoVencimentoNovaCategoriaWrapper.hidden = true;
        ctx.campoNovaCategoria.required = false;
        ctx.campoParcelas.required = false;

        ctx.campoValor.value = dados.valor.toFixed(2).replace(".", ",");
        ctx.campoDescricao.value = dados.descricao || "";
        ctx.campoDescricaoWrapper.hidden = false; // editar sempre mostra a descrição, mesmo pra Guardar
        ctx.campoData.value = formatarDataParaCampo(dados.data.toDate());

        if (ehGuardarDeposito) {
            ctx.rotuloCategoria.textContent = "Meta";
            ctx.popularSelectMetas();
            ctx.campoCategoria.value = dados.meta || "__sem_meta__";

            ctx.campoBancoOrigemWrapper.hidden = false;
            ctx.campoBancoOrigem.required = true;
            ctx.popularSelectBancoGenerico(ctx.campoBancoOrigem);
            ctx.campoBancoOrigem.value = dados.bancoOrigem || "__sem_banco__";

            ctx.campoBancoWrapper.hidden = false;
            ctx.campoBanco.required = true;
            ctx.popularSelectBancoGenerico(ctx.campoBanco);
            ctx.campoBanco.value = dados.banco || "__sem_banco__";
        } else {
            ctx.rotuloCategoria.textContent = "Categoria";
            ctx.popularSelectCategorias(dados.categoria);
            ctx.campoBancoOrigemWrapper.hidden = true;
            ctx.campoBancoOrigem.required = false;
            ctx.campoBancoWrapper.hidden = true;
            ctx.campoBanco.required = false;
        }

        // Forma de pagamento/banco só entram na edição pra Gasto e Extra
        // "normais" — Guardar já tem seus próprios campos (acima), e a
        // Fatura do Cartão é um agregado especial que não faz sentido
        // reclassificar por aqui
        const ehCategoriaEspecial = dados.categoria === "Guardar Dinheiro" || dados.categoria === "Retirada da Reserva" || dados.categoria === "Fatura do Cartão";
        ctx.campoFormaPagamentoWrapper.hidden = true;
        ctx.campoFormaPagamento.required = false;
        ctx.campoBancoPagamentoWrapper.hidden = true;
        ctx.campoBancoPagamento.required = false;
        ctx.campoCartaoPagamentoWrapper.hidden = true;
        ctx.campoCartaoPagamento.required = false;

        if (!ehCategoriaEspecial && dados.tipo === "gasto") {
            ctx.campoFormaPagamentoWrapper.hidden = false;
            ctx.campoFormaPagamento.required = true;
            // Não oferece "Crédito" na edição — compras no crédito têm um
            // fluxo próprio (viram pendência, depois fatura), não faz
            // sentido reclassificar um lançamento já feito pra lá
            Array.from(ctx.campoFormaPagamento.options).forEach((opcao) => {
                opcao.hidden = opcao.value === "credito";
            });
            ctx.campoFormaPagamento.value = dados.formaPagamento || "";

            if (dados.formaPagamento === "pix" || dados.formaPagamento === "debito") {
                ctx.rotuloBancoPagamento.textContent = "De qual banco";
                ctx.popularSelectBancoGenerico(ctx.campoBancoPagamento);
                ctx.campoBancoPagamentoWrapper.hidden = false;
                ctx.campoBancoPagamento.required = true;
                ctx.campoBancoPagamento.value = dados.banco || "__sem_banco__";
            }
        } else if (!ehCategoriaEspecial && dados.tipo === "ganho") {
            ctx.rotuloBancoPagamento.textContent = "Em qual banco entrou";
            ctx.popularSelectBancoPagamento();
            ctx.campoBancoPagamentoWrapper.hidden = false;
            ctx.campoBancoPagamento.required = true;
            ctx.campoBancoPagamento.value = dados.banco || "";
        }

        ctx.fundoModal.classList.add("aberto");
    }

    // Veio do Extrato (?editar=ID): depois de salvar ou cancelar, volta pra lá
    let veioDoExtrato = false;

    function fecharModal() {
        ctx.fundoModal.classList.remove("aberto");
        ctx.botaoTrocarTipo.hidden = false;
        if (veioDoExtrato) {
            veioDoExtrato = false;
            setTimeout(() => { window.location.href = "extrato.html"; }, 700);
        }
    }

    async function abrirEdicaoPedidaPelaUrl() {
        const idPedido = new URLSearchParams(window.location.search).get("editar");
        if (!idPedido) return;
        // tira o parâmetro da URL, pra não reabrir ao atualizar a página
        window.history.replaceState({}, "", "dashboard.html");
        try {
            const snap = await getDoc(doc(db, "usuarios", ctx.uidAtual, "lancamentos", idPedido));
            if (!snap.exists()) { mostrarToast("Esse lançamento não existe mais."); return; }
            veioDoExtrato = true;
            abrirModalEdicao(snap.id, snap.data());
        } catch (erro) {
            mostrarToast("Não deu pra abrir esse lançamento agora.");
        }
    }

    // Transferir entre bancos: a lógica vive em transferencia.js
    const transferencia = iniciarTransferencia({
        uid: () => ctx.uidAtual,
        bancos: () => ctx.bancosCustomizados,
        mes: () => ctx.mesSelecionado,
        saldoDoBanco: (nome, saldoInicial) => ctx.calcularSaldoBancoAgora(nome, saldoInicial)
    });

    function irParaFormulario(tipoClicado) {
        // "guardar" não é um tipo de lançamento de verdade — por baixo dos
        // panos ele é um "ganho" com categoria fixa "Guardar Dinheiro".
        // "extra" também é só o nome do botão — internamente é "ganho" também.
        ctx.modoGuardar = tipoClicado === "guardar";
        ctx.tipoSelecionado = tipoClicado === "gasto" ? "gasto" : "ganho";

        ctx.etapaEscolha.hidden = true;
        ctx.formulario.hidden = false;

        const rotulosBotaoTrocar = {
            gasto: "← Gasto (trocar)",
            extra: `← ${ctx.botaoEscolhaExtra.textContent} (trocar)`,
            guardar: "← Guardar (trocar)"
        };
        ctx.botaoTrocarTipo.textContent = rotulosBotaoTrocar[tipoClicado];
        ctx.botaoTrocarTipo.dataset.tipo = tipoClicado;
        ctx.rotuloValor.textContent = "Valor";
        ctx.opcoesEspeciaisGasto.hidden = tipoClicado !== "gasto";
        atualizarVisibilidadeDividir();

        // Forma de pagamento só existe em Gasto. Extra não pergunta "forma"
        // (não faz sentido pra quem tá recebendo) — pergunta só "em qual
        // banco entrou", direto, reaproveitando o mesmo campo de banco.
        // Reexibe "Crédito" caso tenha ficado escondido de uma edição
        // anterior (lá, ela não aparece de propósito)
        Array.from(ctx.campoFormaPagamento.options).forEach((opcao) => { opcao.hidden = false; });
        ctx.campoFormaPagamentoWrapper.hidden = tipoClicado !== "gasto";
        ctx.campoFormaPagamento.required = tipoClicado === "gasto";
        ctx.campoFormaPagamento.value = "";
        ctx.campoBancoPagamentoWrapper.hidden = true;
        ctx.campoBancoPagamento.required = false;
        ctx.campoCartaoPagamentoWrapper.hidden = true;
        ctx.campoCartaoPagamento.required = false;

        if (tipoClicado === "extra") {
            ctx.rotuloBancoPagamento.textContent = "Em qual banco entrou";
            ctx.campoBancoPagamentoWrapper.hidden = false;
            ctx.campoBancoPagamento.required = true;
            ctx.popularSelectBancoPagamento();
        }

        // No modo Guardar, o campo vira "Meta" em vez de "Categoria" —
        // reaproveita o mesmo select, só troca o rótulo e o conteúdo.
        // Importante: precisa desligar o "required" quando o campo tá
        // escondido (isso não acontece mais aqui, mas o padrão se mantém
        // por segurança), senão o navegador bloqueia o envio do formulário
        ctx.campoCategoriaWrapper.hidden = false;
        ctx.campoCategoria.required = true;
        ctx.campoNovaCategoriaWrapper.hidden = true;
        ctx.campoVencimentoNovaCategoriaWrapper.hidden = true;
        ctx.botaoExcluirCategoria.hidden = true;
        ctx.botaoEditarCategoria.hidden = true;

        if (ctx.modoGuardar) {
            ctx.rotuloCategoria.textContent = "Meta";
            ctx.rotuloNovaCategoria.textContent = "Nome da nova meta";
            ctx.popularSelectMetas();
        } else {
            ctx.rotuloCategoria.textContent = "Categoria";
            ctx.rotuloNovaCategoria.textContent = "Nome da nova categoria";
            ctx.popularSelectCategorias();
        }

        // Os campos de banco só aparecem no modo Guardar, junto com a Meta —
        // "De qual banco sai" e "Para qual banco vai" representam a
        // transferência de verdade entre bancos (ou dentro do mesmo banco,
        // se a pessoa só quer separar mentalmente, sem mover de verdade)
        ctx.campoBancoOrigemWrapper.hidden = !ctx.modoGuardar;
        ctx.campoBancoOrigem.required = ctx.modoGuardar;
        ctx.campoBancoWrapper.hidden = !ctx.modoGuardar;
        ctx.campoBanco.required = ctx.modoGuardar;
        if (ctx.modoGuardar) {
            ctx.popularSelectBancoGenerico(ctx.campoBancoOrigem);
            ctx.popularSelectBancoGenerico(ctx.campoBanco);
        }

        ctx.campoDescricaoWrapper.hidden = ctx.modoGuardar;
        ctx.campoDescricao.required = false;

        // A data padrão é sempre a de hoje de verdade — não importa qual mês
        // você esteja navegando na tela. Se quiser lançar em outra data,
        // você troca manualmente no campo, e o app respeita exatamente o
        // que for escolhido ali.
        const hoje = new Date();
        ctx.campoData.value = formatarDataParaCampo(hoje);
        ctx.campoValor.focus();
    }

    // Formata pro padrão AAAA-MM-DD que o input[type=date] espera, usando o
    // horário LOCAL do aparelho (evita o bug clássico de virar o dia errado
    // perto da meia-noite, que aconteceria usando toISOString diretamente
    // em fusos negativos como o do Brasil)





    ctx.atalhoHoje.addEventListener("click", () => {
        ctx.campoData.value = formatarDataParaCampo(new Date());
    });

    ctx.atalhoOntem.addEventListener("click", () => {
        const ontem = new Date();
        ontem.setDate(ontem.getDate() - 1);
        ctx.campoData.value = formatarDataParaCampo(ontem);
    });

    ctx.botoesEscolha.forEach((botao) => {
        botao.addEventListener("click", () => {
            if (botao.dataset.tipo === "transferir") {
                fecharModal();
                transferencia.abrir();
                return;
            }
            irParaFormulario(botao.dataset.tipo);
        });
    });

    ctx.botaoTrocarTipo.addEventListener("click", () => {
        ctx.etapaEscolha.hidden = false;
        ctx.formulario.hidden = true;
    });

    ctx.botaoAbrirModal.addEventListener("click", abrirModalNovo);
    ctx.botaoFecharModal.addEventListener("click", fecharModal);

    ctx.fundoModal.addEventListener("click", (evento) => {
        if (evento.target === ctx.fundoModal) fecharModal();
    });

    ctx.campoFormaPagamento.addEventListener("change", () => {
        const formaEscolhida = ctx.campoFormaPagamento.value;
        ctx.rotuloBancoPagamento.textContent = "De qual banco";

        if (formaEscolhida === "pix" || formaEscolhida === "debito") {
            ctx.campoBancoPagamentoWrapper.hidden = false;
            ctx.campoBancoPagamento.required = true;
            ctx.campoCartaoPagamentoWrapper.hidden = true;
            ctx.campoCartaoPagamento.required = false;
            ctx.popularSelectBancoPagamento();
        } else if (formaEscolhida === "credito") {
            ctx.campoBancoPagamentoWrapper.hidden = true;
            ctx.campoBancoPagamento.required = false;
            ctx.campoCartaoPagamentoWrapper.hidden = false;
            ctx.campoCartaoPagamento.required = true;
            ctx.popularSelectCartaoPagamento();
        } else {
            // Dinheiro — nenhum dos dois é perguntado
            ctx.campoBancoPagamentoWrapper.hidden = true;
            ctx.campoBancoPagamento.required = false;
            ctx.campoCartaoPagamentoWrapper.hidden = true;
            ctx.campoCartaoPagamento.required = false;
        }

        // O campo de vencimento manual depende de saber se é Crédito ou
        // não (Crédito usa o vencimento do próprio cartão)
        atualizarVisibilidadeParcelas();
    });

    ctx.campoFixo.addEventListener("change", () => {
        if (ctx.campoFixo.checked) ctx.campoParcelado.checked = false;
        atualizarVisibilidadeParcelas();
    });

    ctx.campoParcelado.addEventListener("change", () => {
        if (ctx.campoParcelado.checked) ctx.campoFixo.checked = false;
        atualizarVisibilidadeParcelas();
    });

    // ---- Dividir com repasse (parte minha + parte de outra pessoa) ----
    const blocoDividir = document.getElementById("opcao-dividir-repasse");
    const campoDividir = document.getElementById("campo-dividir");
    const detalheDividir = document.getElementById("detalhe-dividir");
    const campoValorRepasse = document.getElementById("campo-valor-repasse");
    const campoCategoriaRepasse = document.getElementById("campo-categoria-repasse");
    const previewDividir = document.getElementById("preview-dividir");
    aplicarMascaraValor(campoValorRepasse);

    function atualizarVisibilidadeDividir() {
        const pode = ctx.tipoSelecionado === "gasto" && !ctx.modoGuardar && !ctx.idEmEdicao
            && !ctx.campoFixo.checked && !ctx.campoParcelado.checked;
        blocoDividir.style.display = pode ? "" : "none";
        if (!pode) campoDividir.checked = false;

        const repasses = ctx.categoriasCustomizadas.gasto.filter((c) => c.foraDosTotais).map((c) => c.nome);
        const escolhida = campoCategoriaRepasse.value;
        campoCategoriaRepasse.innerHTML = "";
        if (repasses.length === 0) {
            const op = document.createElement("option");
            op.value = "";
            op.textContent = "Nenhuma categoria de Gasto marcada como repasse";
            campoCategoriaRepasse.appendChild(op);
        } else {
            repasses.forEach((nome) => {
                const op = document.createElement("option");
                op.value = nome;
                op.textContent = nome;
                campoCategoriaRepasse.appendChild(op);
            });
            if (repasses.includes(escolhida)) campoCategoriaRepasse.value = escolhida;
        }
        detalheDividir.style.display = (pode && campoDividir.checked) ? "" : "none";
        atualizarPreviewDividir();
    }

    function atualizarPreviewDividir() {
        const total = paraNumero(ctx.campoValor.value);
        const repasse = paraNumero(campoValorRepasse.value);
        // Aviso na hora: a categoria da SUA parte não pode ser de repasse
        if (campoDividir.checked && ctx.ehForaDosTotais(ctx.campoCategoria.value)) {
            previewDividir.textContent = "⚠️ A categoria do gasto (lá em cima) é de repasse. Escolha uma categoria normal para a SUA parte.";
            previewDividir.style.color = "var(--gasto-cor, #F87171)";
            return;
        }
        previewDividir.style.color = "";
        if (!campoDividir.checked || !total || !repasse || repasse >= total) {
            previewDividir.textContent = campoDividir.checked && campoCategoriaRepasse.value === ""
                ? "Crie antes uma categoria de Gasto e marque \"Repasse ou acerto\"."
                : "";
            return;
        }
        const minha = Math.round((total - repasse) * 100) / 100;
        previewDividir.textContent = `Seu gasto: ${formatarMoeda(minha)} · Repasse: ${formatarMoeda(repasse)}`;
    }

    campoDividir.addEventListener("change", atualizarVisibilidadeDividir);
    campoValorRepasse.addEventListener("input", atualizarPreviewDividir);
    ctx.campoValor.addEventListener("input", atualizarPreviewDividir);
    campoCategoriaRepasse.addEventListener("change", atualizarPreviewDividir);
    ctx.campoCategoria.addEventListener("change", atualizarPreviewDividir);

    function atualizarVisibilidadeParcelas() {
        atualizarVisibilidadeDividir();
        const parcelando = ctx.campoParcelado.checked;
        ctx.campoParcelasWrapper.hidden = !parcelando;
        ctx.campoParcelas.required = parcelando;
        ctx.rotuloValor.textContent = parcelando ? "Valor total da compra" : "Valor";
        atualizarPreviewParcela();

        // O campo de vencimento aparece pra Fixo OU Parcelado — é um dia
        // separado da "Data" de propósito (Data = quando você registrou;
        // Vencimento = todo dia X do mês). Já vem pré-preenchido com o dia
        // que está na Data agora, só pra facilitar, mas pode ser trocado.
        // Ele se MOVE pra logo abaixo do checkbox marcado, em vez de ficar
        // sempre no mesmo lugar (fixo embaixo dos dois checkboxes) — assim
        // fica claro que é sobre a opção que você acabou de marcar.
        // EXCEÇÃO: se a forma de pagamento for Crédito, esse campo nem
        // aparece — o vencimento já vem do próprio cartão escolhido,
        // perguntar de novo aqui seria repetir a mesma coisa duas vezes.
        const noCredito = ctx.campoFormaPagamento.value === "credito";
        const precisaVencimento = (ctx.campoFixo.checked || ctx.campoParcelado.checked) && !noCredito;
        ctx.campoVencimentoLancamentoWrapper.hidden = !precisaVencimento;
        ctx.campoVencimentoLancamento.required = precisaVencimento;

        if (ctx.campoFixo.checked) {
            ctx.slotVencimentoFixo.appendChild(ctx.campoVencimentoLancamentoWrapper);
        } else if (ctx.campoParcelado.checked) {
            ctx.slotVencimentoParcelado.appendChild(ctx.campoVencimentoLancamentoWrapper);
        }

        if (precisaVencimento && !ctx.campoVencimentoLancamento.value) {
            const dataAtual = ctx.campoData.value ? new Date(ctx.campoData.value + "T00:00:00") : new Date();
            ctx.campoVencimentoLancamento.value = dataAtual.getDate();
        }

        // Se a categoria nova já estava com o campo de vencimento visível,
        // esconde ele agora que Fixo/Parcelado já pergunta isso ali embaixo
        // (evita perguntar o mesmo dia duas vezes, em lugares diferentes)
        if (precisaVencimento) ctx.campoVencimentoNovaCategoriaWrapper.hidden = true;

        // Chave PIX de quem recebe — só faz sentido pra Fixo/Parcelado
        // pagos via PIX especificamente (não em Débito, não em Crédito,
        // que usam a chave do próprio cartão/banco, não de terceiros)
        const mostrarChavePix = (ctx.campoFixo.checked || ctx.campoParcelado.checked) && ctx.campoFormaPagamento.value === "pix";
        ctx.campoChavePixWrapper.hidden = !mostrarChavePix;
    }

    // Mostra "= 6x de R$ 8,33" em tempo real, assim que a pessoa digita o
    // valor total e o número de parcelas — evita confusão tipo "coloquei 50
    // e apareceu 8,33" (o app está certo, só faltava deixar isso visível antes)
    function atualizarPreviewParcela() {
        if (!ctx.campoParcelado.checked) {
            ctx.previewParcela.hidden = true;
            return;
        }

        const total = paraNumero(ctx.campoValor.value);
        const numeroParcelas = parseInt(ctx.campoParcelas.value, 10);

        if (!total || total <= 0 || !numeroParcelas || numeroParcelas < 2) {
            ctx.previewParcela.hidden = true;
            return;
        }

        const valorPorParcela = total / numeroParcelas;
        ctx.previewParcela.textContent = `= ${numeroParcelas}x de ${formatarMoeda(valorPorParcela)}`;
        ctx.previewParcela.hidden = false;
    }

    ctx.campoValor.addEventListener("input", atualizarPreviewParcela);
    ctx.campoParcelas.addEventListener("input", atualizarPreviewParcela);

    // ==========================================================================
    // 8. MENSAGENS DE AVISO
    // ==========================================================================
    function mostrarAviso(texto) {
        ctx.mensagemAviso.textContent = texto;
        ctx.mensagemAviso.classList.add("visivel");
    }

    function esconderAviso() {
        ctx.mensagemAviso.classList.remove("visivel");
    }

    function definirCarregando(carregando) {
        ctx.botaoSalvar.disabled = carregando;
        ctx.spinnerSalvar.hidden = !carregando;
        ctx.textoBotaoSalvar.style.opacity = carregando ? "0.7" : "1";
    }

    // Junta a data escolhida no calendário com o horário real de agora —
    // resolve dois pontos ao mesmo tempo: mostra a que horas a pessoa
    // realmente registrou aquilo, e faz lançamentos ficarem ordenados
    // certinho (do mais recente pro mais antigo), com precisão até o
    // milissegundo — sem isso, dois lançamentos no mesmo minuto "empatavam"
    // e a ordem entre eles ficava meio aleatória

    // ==========================================================================
    // 9. SALVAR (criar novo, ou editar um existente)
    // ==========================================================================
    ctx.formulario.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        esconderAviso();

        const valorDigitado = paraNumero(ctx.campoValor.value);
        if (!valorDigitado || valorDigitado <= 0) {
            mostrarAviso("Digita um valor maior que zero.");
            return;
        }

        // Compara em centavos (números inteiros), mesmo motivo da correção
        // na tela de Saldo Guardado — evita erro de ponto flutuante
        if (ctx.modoGuardar && Math.round(valorDigitado * 100) > Math.round(ctx.saldoExibidoETravado * 100)) {
            mostrarAviso(`Esse valor é maior do que o seu saldo atual (${formatarMoeda(ctx.saldoExibidoETravado)}). Não dá pra guardar mais do que você tem.`);
            return;
        }

        let categoriaFinal = ctx.campoCategoria.value;
        let metaFinal = null;
        let bancoFinal = null;
        let bancoOrigemFinal = null;

        if (ctx.modoGuardar) {
            if (categoriaFinal === "__nova__") {
                const novaMeta = ctx.campoNovaCategoria.value.trim();
                if (!novaMeta) {
                    mostrarAviso("Digita o nome da nova meta.");
                    return;
                }
                metaFinal = novaMeta;
            } else if (categoriaFinal === "__sem_meta__") {
                metaFinal = null;
            } else {
                metaFinal = categoriaFinal;
            }
            categoriaFinal = "Guardar Dinheiro";

            bancoFinal = ctx.campoBanco.value === "__sem_banco__" ? null : ctx.campoBanco.value;
            bancoOrigemFinal = ctx.campoBancoOrigem.value === "__sem_banco__" ? null : ctx.campoBancoOrigem.value;

            // Não faz sentido "transferir" de um banco pra ele mesmo — se a
            // pessoa quer só separar mentalmente (sem mover de verdade),
            // isso já é resolvido escolhendo "Sem banco específico" nos
            // dois, não escolhendo o mesmo banco nomeado nos dois campos
            if (bancoFinal && bancoOrigemFinal && bancoFinal === bancoOrigemFinal) {
                mostrarAviso(`"De qual banco" e "Para qual banco" não podem ser o mesmo (${bancoFinal}). Se é pra só separar mentalmente, sem mover de verdade, escolhe "Sem banco específico" nos dois.`);
                return;
            }

            // Confere se o banco de origem realmente tem o valor que está
            // saindo dele — sem essa trava, dava pra "guardar" mais do que
            // o banco realmente tem, deixando ele negativo sem avisar nada
            if (bancoOrigemFinal) {
                const bancoOrigemDoc = ctx.bancosCustomizados.find((b) => b.nome === bancoOrigemFinal);
                if (bancoOrigemDoc) {
                    const snapshotOrigem = await getDoc(doc(db, "usuarios", ctx.uidAtual, "bancos", bancoOrigemDoc.id));
                    const saldoInicialOrigem = snapshotOrigem.exists() ? (snapshotOrigem.data().saldoInicial || 0) : 0;
                    let saldoRealOrigem = await ctx.calcularSaldoBancoAgora(bancoOrigemFinal, saldoInicialOrigem);

                    // Se estamos EDITANDO uma transferência que já tinha
                    // esse MESMO banco como origem, "devolve" o valor
                    // antigo antes de checar — senão o próprio efeito
                    // dessa transação (já contado no saldo atual) barraria
                    // uma edição que só corrige um detalhe, tipo a
                    // descrição, sem de fato mudar o valor
                    if (ctx.idEmEdicao && ctx.dadosOriginaisEmEdicao && ctx.dadosOriginaisEmEdicao.bancoOrigem === bancoOrigemFinal) {
                        saldoRealOrigem += ctx.dadosOriginaisEmEdicao.valor;
                    }

                    if (Math.round(valorDigitado * 100) > Math.round(saldoRealOrigem * 100)) {
                        mostrarAviso(`O ${bancoOrigemFinal} só tem ${formatarMoeda(saldoRealOrigem)} — não dá pra guardar mais do que isso de lá.`);
                        return;
                    }
                }
            }
        } else if (categoriaFinal === "__nova__") {
            const nomeNovaCategoria = ctx.campoNovaCategoria.value.trim();
            if (!nomeNovaCategoria) {
                mostrarAviso("Digita o nome da nova categoria.");
                return;
            }
            categoriaFinal = nomeNovaCategoria;
        }

        // ---- Fluxo de EDIÇÃO ----
        if (ctx.idEmEdicao) {
            const confirmou = await confirmarComTelinha("Tem certeza de que deseja salvar as alterações deste lançamento?");
            if (!confirmou) return;

            definirCarregando(true);
            try {
                if (ctx.campoCategoria.value === "__nova__" && !ctx.modoGuardar) {
                    const vencimentoNovaCategoria = parseInt(ctx.campoVencimentoNovaCategoria.value, 10) || null;
                    const referenciaCategoria = await addDoc(collection(db, "usuarios", ctx.uidAtual, "categorias"), {
                        nome: categoriaFinal,
                        tipo: ctx.tipoSelecionado,
                        diaVencimento: vencimentoNovaCategoria,
                        foraDosTotais: !!ctx.campoRepasseNovaCategoria.checked
                    });
                    ctx.categoriasCustomizadas[ctx.tipoSelecionado].push({ nome: categoriaFinal, id: referenciaCategoria.id, foraDosTotais: !!ctx.campoRepasseNovaCategoria.checked });
                }

                if (ctx.modoGuardar && ctx.campoCategoria.value === "__nova__") {
                    const referenciaMeta = await addDoc(collection(db, "usuarios", ctx.uidAtual, "metas"), {
                        nome: metaFinal
                    });
                    ctx.metasCustomizadas.push({ nome: metaFinal, id: referenciaMeta.id });
                }

                const dadosAtualizados = {
                    valor: valorDigitado,
                    categoria: categoriaFinal,
                    descricao: ctx.campoDescricao.value.trim(),
                    data: Timestamp.fromDate(construirDataComHorarioReal(ctx.campoData.value))
                };

                // Guardar tem seus próprios campos (Meta + os 2 bancos da
                // transferência) — diferente de Gasto/Extra, que usam
                // forma de pagamento/banco
                if (ctx.modoGuardar) {
                    dadosAtualizados.meta = metaFinal;
                    dadosAtualizados.banco = bancoFinal;
                    dadosAtualizados.bancoOrigem = bancoOrigemFinal;
                } else if (!ctx.campoFormaPagamentoWrapper.hidden) {
                    dadosAtualizados.formaPagamento = ctx.campoFormaPagamento.value;
                    dadosAtualizados.banco = (ctx.campoFormaPagamento.value === "pix" || ctx.campoFormaPagamento.value === "debito")
                        ? (ctx.campoBancoPagamento.value === "__sem_banco__" ? null : ctx.campoBancoPagamento.value)
                        : null;
                } else if (!ctx.campoBancoPagamentoWrapper.hidden) {
                    dadosAtualizados.banco = ctx.campoBancoPagamento.value || null;
                }

                await updateDoc(doc(db, "usuarios", ctx.uidAtual, "lancamentos", ctx.idEmEdicao), dadosAtualizados);

                fecharModal();
                mostrarToast("Alterações salvas ✓");
            } catch (erro) {
                mostrarAviso("Não deu pra salvar agora. Confere sua internet e tenta de novo.");
            } finally {
                definirCarregando(false);
            }
            return;
        }

        // ---- Fluxo de CRIAÇÃO ----
        const ehParcelado = ctx.tipoSelecionado === "gasto" && ctx.campoParcelado.checked;
        const numeroParcelas = ehParcelado ? parseInt(ctx.campoParcelas.value, 10) : 1;
        const noCartaoCredito = ctx.tipoSelecionado === "gasto" && !ctx.modoGuardar && ctx.campoFormaPagamento.value === "credito";
        const cartaoEscolhidoId = noCartaoCredito ? ctx.campoCartaoPagamento.value : null;

        if (ehParcelado && (!numeroParcelas || numeroParcelas < 2)) {
            mostrarAviso("Informa um número de parcelas válido (mínimo 2).");
            return;
        }

        // Divisão com repasse: confere os valores antes de qualquer coisa
        const dividindo = campoDividir.checked && blocoDividir.style.display !== "none";
        let valorRepasse = 0;
        let valorMeu = valorDigitado;
        let categoriaRepasse = "";
        let divisaoId = null;
        if (dividindo) {
            valorRepasse = paraNumero(campoValorRepasse.value);
            categoriaRepasse = campoCategoriaRepasse.value;
            if (!categoriaRepasse) {
                mostrarAviso("Pra dividir, crie antes uma categoria de Gasto marcada como \"Repasse ou acerto\".");
                return;
            }
            if (!valorRepasse || valorRepasse <= 0 || Math.round(valorRepasse * 100) >= Math.round(valorDigitado * 100)) {
                mostrarAviso("A parte de repasse precisa ser maior que zero e menor que o valor total.");
                return;
            }
            if (ctx.ehForaDosTotais(categoriaFinal)) {
                mostrarAviso("A categoria do gasto está marcada como \"Repasse ou acerto\". Escolha para a SUA parte uma categoria normal (a de repasse é só para a parte da sua mãe).");
                return;
            }
            valorMeu = Math.round((valorDigitado - valorRepasse) * 100) / 100;
            divisaoId = `div_${Date.now()}`;
        }

        // Se for Gasto Fixo ou Parcelado, confere se já não existe um parecido
        // (mesma descrição/categoria) — evita duplicar por esquecimento
        if (ehParcelado || ctx.campoFixo.checked) {
            const origemNova = ehParcelado ? "parcelado" : "fixo";
            const descricaoNova = (ctx.campoDescricao.value.trim() || categoriaFinal).toLowerCase();

            const referenciaPendenciasExistentes = collection(db, "usuarios", ctx.uidAtual, "pendencias");
            const consultaOrigem = query(referenciaPendenciasExistentes, where("origem", "==", origemNova));
            const resultadoExistentes = await getDocs(consultaOrigem);

            const jaExisteParecido = resultadoExistentes.docs.some((documento) => {
                const dadosExistente = documento.data();
                const descricaoExistente = (dadosExistente.descricao || dadosExistente.categoria || "").toLowerCase();
                return descricaoExistente === descricaoNova;
            });

            if (jaExisteParecido) {
                const tipoTexto = ehParcelado ? "parcelamento" : "gasto fixo";
                const nomeParaMensagem = ctx.campoDescricao.value.trim() || categoriaFinal;
                const confirmouMesmoAssim = await confirmarComTelinha(`Parece que você já tem um ${tipoTexto} chamado "${nomeParaMensagem}" criado antes. Tem certeza de que deseja criar de novo?`);
                if (!confirmouMesmoAssim) return;
            }
        }

        // Detecta lançamento duplicado nos gastos/ganhos avulsos (não fixo,
        // não parcelado, não cartão, não Guardado — esses já têm suas
        // próprias checagens acima ou não fazem sentido aqui): mesmo valor,
        // mesmo tipo e mesmo dia é um forte sinal de ter lançado 2x sem
        // querer (ex: apertar salvar duas vezes, ou esquecer que já tinha
        // lançado aquele gasto hoje mais cedo)
        if (!ehParcelado && !ctx.campoFixo.checked && !noCartaoCredito && !ctx.modoGuardar) {
            const dataParaChecarDuplicado = construirDataComHorarioReal(ctx.campoData.value);
            const consultaDuplicado = query(
                collection(db, "usuarios", ctx.uidAtual, "lancamentos"),
                where("mesReferencia", "==", mesReferenciaString(ctx.mesSelecionado)),
                where("valor", "==", valorDigitado),
                where("tipo", "==", ctx.tipoSelecionado)
            );
            const resultadoDuplicado = await getDocs(consultaDuplicado);
            const jaExisteDuplicado = resultadoDuplicado.docs.some((documento) => {
                const dataExistente = documento.data().data?.toDate();
                return dataExistente && dataExistente.toDateString() === dataParaChecarDuplicado.toDateString();
            });

            if (jaExisteDuplicado) {
                const confirmouMesmoAssim = await confirmarComTelinha(`Já existe um lançamento de ${formatarMoeda(valorDigitado)} nesse mesmo dia. Tem certeza de que quer salvar mesmo assim?`);
                if (!confirmouMesmoAssim) return;
            }
        }

        definirCarregando(true);

        try {
            if (ctx.campoCategoria.value === "__nova__" && !ctx.modoGuardar) {
                // Se for Fixo/Parcelado, usa o mesmo vencimento já perguntado
                // ali embaixo (não pergunta de novo, os dois ficam sincronizados).
                // No Crédito, esse campo fica escondido (usa o vencimento do
                // próprio cartão) — busca ele ali, em vez do campo vazio.
                const usandoFixoOuParcelado = ctx.campoFixo.checked || ctx.campoParcelado.checked;
                let vencimentoNovaCategoria;
                if (noCartaoCredito) {
                    const cartaoEscolhidoParaCategoria = ctx.cartoesCustomizados.find((c) => c.id === cartaoEscolhidoId);
                    vencimentoNovaCategoria = (cartaoEscolhidoParaCategoria && cartaoEscolhidoParaCategoria.diaVencimento) || null;
                } else if (usandoFixoOuParcelado) {
                    vencimentoNovaCategoria = parseInt(ctx.campoVencimentoLancamento.value, 10) || null;
                } else {
                    vencimentoNovaCategoria = parseInt(ctx.campoVencimentoNovaCategoria.value, 10) || null;
                }
                const referenciaCategoria = await addDoc(collection(db, "usuarios", ctx.uidAtual, "categorias"), {
                    nome: categoriaFinal,
                    tipo: ctx.tipoSelecionado,
                    diaVencimento: vencimentoNovaCategoria,
                    foraDosTotais: !!ctx.campoRepasseNovaCategoria.checked
                });
                ctx.categoriasCustomizadas[ctx.tipoSelecionado].push({ nome: categoriaFinal, id: referenciaCategoria.id, foraDosTotais: !!ctx.campoRepasseNovaCategoria.checked });
            }

            if (ctx.modoGuardar && ctx.campoCategoria.value === "__nova__") {
                const referenciaMeta = await addDoc(collection(db, "usuarios", ctx.uidAtual, "metas"), {
                    nome: metaFinal
                });
                ctx.metasCustomizadas.push({ nome: metaFinal, id: referenciaMeta.id });
            }

            const dataEscolhida = construirDataComHorarioReal(ctx.campoData.value);
            const descricaoBase = ctx.campoDescricao.value.trim();
            let mesDaFaturaCredito = null;

            if (noCartaoCredito) {
                mesDaFaturaCredito = await salvarNoCartao(valorMeu, categoriaFinal, descricaoBase, cartaoEscolhidoId, ctx.campoFixo.checked, ehParcelado, numeroParcelas, dividindo ? { divisaoId } : {});
                if (dividindo) {
                    await salvarNoCartao(valorRepasse, categoriaRepasse, descricaoBase || categoriaFinal, cartaoEscolhidoId, false, false, 1, { divisaoId });
                }
            } else if (ehParcelado) {
                await salvarParcelado(valorDigitado, numeroParcelas, categoriaFinal, descricaoBase, dataEscolhida, parseInt(ctx.campoVencimentoLancamento.value, 10), ctx.campoFormaPagamento.value, ctx.campoBancoPagamento.value, ctx.campoChavePix.value.trim());
            } else if (ctx.campoFixo.checked) {
                await salvarFixo(valorDigitado, categoriaFinal, descricaoBase, dataEscolhida, parseInt(ctx.campoVencimentoLancamento.value, 10), ctx.campoFormaPagamento.value, ctx.campoBancoPagamento.value, ctx.campoChavePix.value.trim());
            } else {
                const dadosLancamento = {
                    tipo: ctx.tipoSelecionado,
                    valor: valorMeu,
                    categoria: categoriaFinal,
                    descricao: descricaoBase,
                    data: Timestamp.fromDate(dataEscolhida),
                    mesReferencia: mesReferenciaString(ctx.mesSelecionado),
                    criadoEm: serverTimestamp(),
                    ...(ctx.modoGuardar ? { meta: metaFinal, banco: bancoFinal, bancoOrigem: bancoOrigemFinal } : {})
                };

                // Forma de pagamento (Gasto) ou banco de entrada (Extra) —
                // nenhum dos dois se aplica ao modo Guardar, que já tem seu
                // próprio sistema de banco (meta/cofrinho)
                if (ctx.tipoSelecionado === "gasto" && !ctx.modoGuardar) {
                    dadosLancamento.formaPagamento = ctx.campoFormaPagamento.value;
                    if (ctx.campoFormaPagamento.value === "pix" || ctx.campoFormaPagamento.value === "debito") {
                        dadosLancamento.banco = ctx.campoBancoPagamento.value;
                    }
                }
                if (ctx.tipoSelecionado === "ganho" && !ctx.modoGuardar) {
                    dadosLancamento.banco = ctx.campoBancoPagamento.value;
                }

                // Gasto à vista (pix/débito) que passa do "livre" do banco:
                // oferece tirar a diferença do Guardado
                if (dadosLancamento.tipo === "gasto" && !ctx.modoGuardar && dadosLancamento.banco) {
                    const podeSeguir = await ctx.cobrirGastoComGuardado(dadosLancamento.banco, valorDigitado);
                    if (!podeSeguir) return;
                }

                if (dividindo) {
                    dadosLancamento.divisaoId = divisaoId;
                    await addDoc(collection(db, "usuarios", ctx.uidAtual, "lancamentos"), {
                        ...dadosLancamento,
                        valor: valorRepasse,
                        categoria: categoriaRepasse,
                        descricao: descricaoBase || categoriaFinal
                    });
                }
                await addDoc(collection(db, "usuarios", ctx.uidAtual, "lancamentos"), dadosLancamento);
            }

            fecharModal();

            if (noCartaoCredito) {
                const [anoFatura, mesFatura] = mesDaFaturaCredito.split("-").map(Number);
                const nomeMesFatura = new Date(anoFatura, mesFatura - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
                mostrarToast(`Compra no crédito registrada ✓ — entra na fatura de ${nomeMesFatura}, não desconta o saldo agora.`);
            } else if (ehParcelado) {
                mostrarToast(`Parcelamento criado ✓ (${numeroParcelas}x)`);
            } else if (ctx.campoFixo.checked) {
                mostrarToast("Gasto fixo criado ✓");
            } else {
                mostrarToast("Lançamento salvo ✓");
            }

        } catch (erro) {
            mostrarAviso("Não deu pra salvar agora. Confere sua internet e tenta de novo.");
        } finally {
            definirCarregando(false);
        }
    });

    // Cria uma "pendência" por parcela — nenhuma delas mexe no saldo ainda.
    // Só quando a pessoa marcar como paga (lá na seção "Pagamentos Pendentes")
    // é que vira um lançamento de verdade.
    // Cria pendência(s) pro Crédito — SEMPRE a partir do MÊS SEGUINTE (compra
    // de hoje só aparece na próxima fatura, do jeito que cartão de crédito
    // de verdade funciona), usando o dia de vencimento que já está cadastrado
    // no cartão escolhido (não pergunta de novo). Cobre os 3 casos: compra
    // avulsa (uma vez só), fixo (repete 12 meses) e parcelado (N vezes).
    async function salvarNoCartao(valor, categoria, descricaoBase, cartaoId, ehFixo, ehParcelado, numeroParcelas, extra = {}) {
        const cartaoEscolhido = ctx.cartoesCustomizados.find((c) => c.id === cartaoId);
        const diaFechamentoCartao = (cartaoEscolhido && cartaoEscolhido.diaFechamento) || 1;
        const diaVencimentoCartao = (cartaoEscolhido && cartaoEscolhido.diaVencimento) || 1;
        const hoje = new Date();
        const nomeItem = descricaoBase || categoria;
        const quantasVezes = ehFixo ? 12 : (ehParcelado ? numeroParcelas : 1);
        const grupoId = (ehFixo || ehParcelado) ? `${ehFixo ? "fixo" : "parc"}_credito_${Date.now()}` : null;

        const valorParcela = ehParcelado ? Math.floor((valor / numeroParcelas) * 100) / 100 : valor;
        const diferencaCentavos = ehParcelado ? Math.round((valor - valorParcela * numeroParcelas) * 100) / 100 : 0;

        // A primeira ocorrência usa a regra de fechamento de verdade (antes
        // do dia de fechamento, fatura desse mês; no dia ou depois, pula
        // pra próxima) — as ocorrências seguintes (Fixo/Parcelado) só vão
        // avançando um mês de cada vez a partir dali
        const primeiroMesReferencia = calcularMesReferenciaFatura(hoje, diaFechamentoCartao);
        const [anoBase, mesBase] = primeiroMesReferencia.split("-").map(Number);

        for (let indice = 0; indice < quantasVezes; indice++) {
            const dataDestino = new Date(anoBase, (mesBase - 1) + indice, 1);
            const ultimoDiaDoMes = new Date(dataDestino.getFullYear(), dataDestino.getMonth() + 1, 0).getDate();
            const diaFinal = Math.min(diaVencimentoCartao, ultimoDiaDoMes);
            const mesReferencia = mesReferenciaString(dataDestino);
            const ehUltima = indice === quantasVezes - 1;
            const valorDessaVez = (ehParcelado && ehUltima) ? valorParcela + diferencaCentavos : valorParcela;

            const dadosPendencia = {
                valor: valorDessaVez,
                categoria,
                descricao: nomeItem,
                diaDoMes: diaFinal,
                mesReferencia,
                origem: ehFixo ? "fixo" : (ehParcelado ? "parcelado" : "avulsa"),
                noCartao: true,
                cartaoId,
                formaPagamento: "credito",
                pago: false,
                criadoEm: serverTimestamp(),
                ...extra
            };
            if (ehParcelado) {
                dadosPendencia.valorTotalCompra = valor;
                dadosPendencia.numeroParcela = indice + 1;
                dadosPendencia.totalParcelas = numeroParcelas;
            }
            if (grupoId) dadosPendencia.grupoId = grupoId;

            await addDoc(collection(db, "usuarios", ctx.uidAtual, "pendencias"), dadosPendencia);
        }

        return primeiroMesReferencia;
    }

    async function salvarParcelado(valorTotal, numeroParcelas, categoria, descricaoBase, dataInicial, diaVencimento, formaPagamento, banco, chavePix) {
        const valorParcela = Math.floor((valorTotal / numeroParcelas) * 100) / 100;
        const diferencaCentavos = Math.round((valorTotal - valorParcela * numeroParcelas) * 100) / 100;
        const grupoId = `parc_${Date.now()}`;
        const diaEscolhido = diaVencimento || dataInicial.getDate(); // reserva de segurança

        for (let indice = 0; indice < numeroParcelas; indice++) {
            const anoDestino = dataInicial.getFullYear();
            const mesDestino = dataInicial.getMonth() + indice;
            const ultimoDiaDoMes = new Date(anoDestino, mesDestino + 1, 0).getDate();
            const diaFinal = Math.min(diaEscolhido, ultimoDiaDoMes);
            const mesReferencia = `${new Date(anoDestino, mesDestino, 1).getFullYear()}-${String(new Date(anoDestino, mesDestino, 1).getMonth() + 1).padStart(2, "0")}`;

            const ehUltima = indice === numeroParcelas - 1;
            const valorDessaParcela = ehUltima ? valorParcela + diferencaCentavos : valorParcela;

            await addDoc(collection(db, "usuarios", ctx.uidAtual, "pendencias"), {
                valor: valorDessaParcela,
                valorTotalCompra: valorTotal,
                categoria,
                descricao: descricaoBase || categoria,
                diaDoMes: diaFinal,
                mesReferencia,
                origem: "parcelado",
                numeroParcela: indice + 1,
                totalParcelas: numeroParcelas,
                grupoId,
                noCartao: false,
                formaPagamento,
                ...(banco ? { banco } : {}),
                ...(chavePix ? { chavePix } : {}),
                pago: false,
                criadoEm: serverTimestamp()
            });
        }
    }

    async function salvarFixo(valor, categoria, descricaoBase, dataInicial, diaVencimento, formaPagamento, banco, chavePix) {
        const grupoId = `fixo_${Date.now()}`;
        const diaOriginal = diaVencimento || dataInicial.getDate(); // reserva de segurança

        for (let indice = 0; indice < 12; indice++) {
            const anoDestino = dataInicial.getFullYear();
            const mesDestino = dataInicial.getMonth() + indice;
            const ultimoDiaDoMes = new Date(anoDestino, mesDestino + 1, 0).getDate();
            const diaFinal = Math.min(diaOriginal, ultimoDiaDoMes);
            const mesReferencia = `${new Date(anoDestino, mesDestino, 1).getFullYear()}-${String(new Date(anoDestino, mesDestino, 1).getMonth() + 1).padStart(2, "0")}`;

            await addDoc(collection(db, "usuarios", ctx.uidAtual, "pendencias"), {
                valor,
                categoria,
                descricao: descricaoBase || categoria,
                diaDoMes: diaFinal,
                mesReferencia,
                origem: "fixo",
                grupoId,
                noCartao: false,
                formaPagamento,
                ...(banco ? { banco } : {}),
                ...(chavePix ? { chavePix } : {}),
                pago: false,
                criadoEm: serverTimestamp()
            });
        }
    }


    return { abrirModalEdicao, abrirEdicaoPedidaPelaUrl };
}
