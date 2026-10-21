import { formatarMoeda, aplicarMascaraValor } from "./util.js";
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { iniciarModoPrivacidade } from "./privacidade.js";

import { iniciarPendencias } from "./pendencias.js";
import { iniciarCategoriasEBancos } from "./categorias.js";
import { iniciarFormulario } from "./formulario.js";
import { iniciarLancamentos } from "./lancamentos.js";
import { iniciarMenuPeriodoERotinas } from "./menu.js";

document.addEventListener("DOMContentLoaded", function () {

    // ==========================================================================
    // 1. REFERÊNCIAS AOS ELEMENTOS DA TELA
    // ==========================================================================
    const emailUsuario = document.getElementById("email-usuario");

    const overlayMenu = document.getElementById("overlay-menu");
    const painelMenu = document.getElementById("painel-menu");
    const botaoFecharMenuLateral = document.getElementById("botao-fechar-menu-lateral");
    const botaoTema = document.getElementById("botao-tema");
    const botaoMaisNavInferior = document.getElementById("botao-mais-nav-inferior");

    iniciarModoPrivacidade();

    const anoAnteriorBtn = document.getElementById("ano-anterior");
    const anoProximoBtn = document.getElementById("ano-proximo");
    const mesAnteriorBtn = document.getElementById("mes-anterior");
    const mesProximoBtn = document.getElementById("mes-proximo");
    const rotuloMes = document.getElementById("rotulo-mes");
    const indicadorMesFechado = document.getElementById("indicador-mes-fechado");

    const totalGanhosEl = document.getElementById("total-ganhos");
    const totalGastosEl = document.getElementById("total-gastos");
    const totalSaldoEl = document.getElementById("total-saldo");

    const listaLancamentos = document.getElementById("lista-lancamentos");
    const listaVazia = document.getElementById("lista-vazia");
    const listaPendencias = document.getElementById("lista-pendencias");
    const pendenciasVazio = document.getElementById("pendencias-vazio");
    const botaoVerMaisPendencias = document.getElementById("botao-ver-mais-pendencias");
    const secaoFaturaCartao = document.getElementById("secao-fatura-cartao");
    const tituloFaturaCartao = document.getElementById("titulo-fatura-cartao");
    const valorFaturaCartao = document.getElementById("valor-fatura-cartao");
    const vencimentoFaturaCartao = document.getElementById("vencimento-fatura-cartao");
    const linkResumoFatura = document.getElementById("link-resumo-fatura");
    const linkResumoBancos = document.getElementById("link-resumo-bancos");
    const etiquetaBancoPrincipal = document.getElementById("etiqueta-banco-principal");
    const valorTotalBancos = document.getElementById("valor-total-bancos");
    const listaBancosCards = document.getElementById("lista-bancos-cards");
    const linkExtrato = document.getElementById("link-extrato");

    const fundoModalEditarCategoria = document.getElementById("fundo-modal-editar-categoria");
    const botaoFecharEditarCategoria = document.getElementById("botao-fechar-editar-categoria");
    const campoNovoNomeCategoria = document.getElementById("campo-novo-nome-categoria");
    const campoLimiteCategoriaWrapper = document.getElementById("campo-limite-categoria-wrapper");
    const campoLimiteCategoria = document.getElementById("campo-limite-categoria");
    const campoVencimentoCategoriaWrapper = document.getElementById("campo-vencimento-categoria-wrapper");
    const campoVencimentoCategoria = document.getElementById("campo-vencimento-categoria");
    const textoAvisoVencimento = document.getElementById("texto-aviso-vencimento");
    const mensagemAvisoEditarCategoria = document.getElementById("mensagem-aviso-editar-categoria");
    const botaoSalvarEditarCategoria = document.getElementById("botao-salvar-editar-categoria");
    const spinnerEditarCategoria = botaoSalvarEditarCategoria.querySelector(".spinner-botao");
    const fundoModalEditarPix = document.getElementById("fundo-modal-editar-pix");
    const botaoFecharEditarPix = document.getElementById("botao-fechar-editar-pix");
    const textoEditarPixContexto = document.getElementById("texto-editar-pix-contexto");
    const campoEditarChavePix = document.getElementById("campo-editar-chave-pix");
    const mensagemAvisoEditarPix = document.getElementById("mensagem-aviso-editar-pix");
    const botaoSalvarEditarPix = document.getElementById("botao-salvar-editar-pix");

    const fundoModalEditarFormaPagamento = document.getElementById("fundo-modal-editar-forma-pagamento");
    const botaoFecharEditarFormaPagamento = document.getElementById("botao-fechar-editar-forma-pagamento");
    const textoEditarFormaPagamentoContexto = document.getElementById("texto-editar-forma-pagamento-contexto");
    const campoEditarFormaPagamento = document.getElementById("campo-editar-forma-pagamento");
    const campoEditarBancoPagamentoWrapper = document.getElementById("campo-editar-banco-pagamento-wrapper");
    const campoEditarBancoPagamento = document.getElementById("campo-editar-banco-pagamento");
    const mensagemAvisoEditarFormaPagamento = document.getElementById("mensagem-aviso-editar-forma-pagamento");
    const botaoSalvarEditarFormaPagamento = document.getElementById("botao-salvar-editar-forma-pagamento");

    const fundoModalExcluirPendencia = document.getElementById("fundo-modal-excluir-pendencia");
    const botaoFecharExcluirPendencia = document.getElementById("botao-fechar-excluir-pendencia");
    const etapaEscopoExclusao = document.getElementById("etapa-escopo-exclusao");
    const textoPerguntaEscopo = document.getElementById("texto-pergunta-escopo");
    const botaoExcluirSoEssa = document.getElementById("botao-excluir-so-essa");
    const botaoExcluirTodas = document.getElementById("botao-excluir-todas");
    const etapaConfirmarExclusao = document.getElementById("etapa-confirmar-exclusao");
    const textoConfirmarExclusao = document.getElementById("texto-confirmar-exclusao");
    const botaoConfirmarExclusaoFinal = document.getElementById("botao-confirmar-exclusao-final");
    const botaoCancelarExclusao = document.getElementById("botao-cancelar-exclusao");
    const fundoModalConselho = document.getElementById("fundo-modal-conselho");
    const botaoFecharConselho = document.getElementById("botao-fechar-conselho");
    const fundoModalPendenciasAntigas = document.getElementById("fundo-modal-pendencias-antigas");
    const textoPendenciasAntigas = document.getElementById("texto-pendencias-antigas");
    const botaoVerPendenciasAntigas = document.getElementById("botao-ver-pendencias-antigas");
    const botaoFecharPendenciasAntigas = document.getElementById("botao-fechar-pendencias-antigas");
    const fundoModalAniversario = document.getElementById("fundo-modal-aniversario");
    const textoAniversario = document.getElementById("texto-aniversario");
    const botaoFecharAniversario = document.getElementById("botao-fechar-aniversario");
    const bannerSalario = document.getElementById("banner-salario");
    const valorSalarioBanner = document.getElementById("valor-salario-banner");
    const botaoConfirmarSalario = document.getElementById("confirmar-salario");
    const perguntaSalario = document.getElementById("pergunta-salario");

    const graficoDonut = document.getElementById("grafico-donut");
    const legendaGrafico = document.getElementById("legenda-grafico");
    const graficoVazio = document.getElementById("grafico-vazio");

    const botaoAbrirModal = document.getElementById("botao-abrir-modal");
    const botaoFecharModal = document.getElementById("botao-fechar-modal");
    const fundoModal = document.getElementById("fundo-modal");
    const tituloModal = document.getElementById("titulo-modal");

    const etapaEscolha = document.getElementById("etapa-escolha");
    const perguntaEscolha = document.getElementById("pergunta-escolha");
    const botoesEscolha = document.querySelectorAll(".botao-escolha-tipo");
    const botaoEscolhaExtra = document.getElementById("botao-escolha-extra");
    const botaoTrocarTipo = document.getElementById("botao-trocar-tipo");

    const formulario = document.getElementById("formulario-lancamento");
    const rotuloValor = document.getElementById("rotulo-valor");
    const campoValor = document.getElementById("campo-valor");
    const campoParcelasWrapper = document.getElementById("campo-parcelas-wrapper");
    const campoParcelas = document.getElementById("campo-parcelas");
    const previewParcela = document.getElementById("preview-parcela");
    const campoCategoriaWrapper = document.getElementById("campo-categoria-wrapper");
    const rotuloCategoria = document.getElementById("rotulo-categoria");
    const rotuloNovaCategoria = document.getElementById("rotulo-nova-categoria");
    const campoCategoria = document.getElementById("campo-categoria");
    const botaoExcluirCategoria = document.getElementById("botao-excluir-categoria");
    const botaoEditarCategoria = document.getElementById("botao-editar-categoria");
    const campoNovaCategoriaWrapper = document.getElementById("campo-nova-categoria-wrapper");
    const campoNovaCategoria = document.getElementById("campo-nova-categoria");
    const campoRepasseNovaCategoria = document.getElementById("campo-repasse-nova-categoria");
    const linhaRepasseNovaCategoria = document.getElementById("linha-repasse-nova-categoria");
    const campoRepasseCategoria = document.getElementById("campo-repasse-categoria");
    const campoVencimentoNovaCategoriaWrapper = document.getElementById("campo-vencimento-nova-categoria-wrapper");
    const campoVencimentoNovaCategoria = document.getElementById("campo-vencimento-nova-categoria");
    const campoBancoOrigemWrapper = document.getElementById("campo-banco-origem-wrapper");
    const campoBancoOrigem = document.getElementById("campo-banco-origem");
    const campoBancoWrapper = document.getElementById("campo-banco-wrapper");
    const campoBanco = document.getElementById("campo-banco");
    const campoFormaPagamentoWrapper = document.getElementById("campo-forma-pagamento-wrapper");
    const campoFormaPagamento = document.getElementById("campo-forma-pagamento");
    const campoBancoPagamentoWrapper = document.getElementById("campo-banco-pagamento-wrapper");
    const campoChavePixWrapper = document.getElementById("campo-chave-pix-wrapper");
    const campoChavePix = document.getElementById("campo-chave-pix");
    const rotuloBancoPagamento = document.getElementById("rotulo-banco-pagamento");
    const campoBancoPagamento = document.getElementById("campo-banco-pagamento");
    const campoCartaoPagamentoWrapper = document.getElementById("campo-cartao-pagamento-wrapper");
    const campoCartaoPagamento = document.getElementById("campo-cartao-pagamento");
    const campoDescricaoWrapper = document.getElementById("campo-descricao-wrapper");
    const campoDescricao = document.getElementById("campo-descricao");
    const campoData = document.getElementById("campo-data");
    const atalhoHoje = document.getElementById("atalho-hoje");
    const atalhoOntem = document.getElementById("atalho-ontem");
    const opcoesEspeciaisGasto = document.getElementById("opcoes-especiais-gasto");
    const campoFixo = document.getElementById("campo-fixo");
    const campoParcelado = document.getElementById("campo-parcelado");
    const campoVencimentoLancamentoWrapper = document.getElementById("campo-vencimento-lancamento-wrapper");
    const slotVencimentoFixo = document.getElementById("slot-vencimento-fixo");
    const slotVencimentoParcelado = document.getElementById("slot-vencimento-parcelado");
    const campoVencimentoLancamento = document.getElementById("campo-vencimento-lancamento");
    const mensagemAviso = document.getElementById("mensagem-aviso-modal");
    const botaoSalvar = document.getElementById("botao-salvar-lancamento");
    const textoBotaoSalvar = botaoSalvar.querySelector(".texto-botao");
    const spinnerSalvar = botaoSalvar.querySelector(".spinner-botao");

    // ==========================================================================
    // 2. ESTADO DA TELA
    let uidAtual = null;
    let mesSelecionado = new Date();
    let tipoSelecionado = "gasto";
    let categoriasCustomizadas = { gasto: [], ganho: [] };
    let metasCustomizadas = []; // [{nome, id}] — usadas só no fluxo de Guardar
    let bancosCustomizados = []; // [{nome, id}] — onde o dinheiro guardado fica de verdade
    let cartoesCustomizados = []; // [{nome, diaVencimento, id}] — cartões de crédito cadastrados
    let pararDeEscutar = null;
    let pararDeEscutarSalario = null;
    let salarioPadrao = 0;
    let mapaOrcamentos = {}; // {categoria: limite}
    let primeiroNome = "";
    let idEmEdicao = null; // null = criando novo | string = editando esse lançamento
    let dadosOriginaisEmEdicao = null; // guarda os dados ANTES da edição, pra comparações corretas
    let saldoAtualDoMes = 0; // ganhos - gastos do mês selecionado (cálculo de sempre)
    let saldoExibidoETravado = 0; // o que REALMENTE aparece na tela e trava o Guardar
    let bancoPrincipalResolvido = false; // vira true quando o app já sabe se existe banco principal e qual o saldo dele
    let saldoBancoPrincipalAtual = null; // null = sem banco principal (ou ainda não carregou)
    let nomeBancoPrincipalAtual = null;
    let pararDeEscutarSaldoBancoPrincipal = null;
    let modoGuardar = false; // true = a pessoa escolheu "Guardar" no modal

    // Só usa o saldo do banco principal quando a pessoa está vendo o mês
    // REAL de hoje — navegando pra outro mês (passado ou futuro), volta a
    // mostrar o cálculo de ganhos-gastos daquele mês específico, porque
    // "saldo do banco" não tem essa ideia de "como foi cada mês"
    function ehMesAtualReal() {
        const hoje = new Date();
        return mesSelecionado.getFullYear() === hoje.getFullYear() && mesSelecionado.getMonth() === hoje.getMonth();
    }

    // Decide o que realmente aparece no número grande — chamada tanto
    // depois de recalcular o mês (navegação) quanto quando o saldo do
    // banco principal muda (reativo) — as duas situações precisam
    // concordar em qual das duas fontes usar
    function atualizarNumeroGrandeDoSaldo() {
        // Mês atual: o número certo é o do banco principal. Enquanto ainda não
        // chegou, mostra um traço em vez de um valor errado (era o "-400"
        // que aparecia na abertura e só corrigia ao trocar de mês)
        if (ehMesAtualReal() && !bancoPrincipalResolvido) {
            totalSaldoEl.textContent = "—";
            return;
        }
        if (ehMesAtualReal() && saldoBancoPrincipalAtual !== null) {
            saldoExibidoETravado = saldoBancoPrincipalAtual;
            totalSaldoEl.textContent = formatarMoeda(saldoBancoPrincipalAtual);
            etiquetaBancoPrincipal.textContent = `Saldo do mês · ${nomeBancoPrincipalAtual}`;
            etiquetaBancoPrincipal.hidden = false;
        } else {
            saldoExibidoETravado = saldoAtualDoMes;
            totalSaldoEl.textContent = formatarMoeda(saldoAtualDoMes);
            // Esconde a etiqueta fora do mês atual — ela não pode dizer
            // "Sicredi" enquanto o número mostrado é o cálculo do mês
            // (isso daria a entender, errado, que é o saldo do Sicredi)
            etiquetaBancoPrincipal.hidden = true;
        }
    }

    // Dados do mês que a tela guarda pra redesenhar lista/gráfico
    let docsCartaoParaGrafico = []; // compras no cartão (pendências noCartao=true)
    let primeiroSnapshotDoMesChegou = false;
    let ultimosDocumentosDoMes = []; // lançamentos do mês selecionado, pra redesenhar o gráfico

    // ==========================================================================
    // 3. VERIFICAR LOGIN
    // ==========================================================================
    // Aplica a máscara de valor "tipo caixa eletrônico" em todo campo de
    // dinheiro dessa tela
    aplicarMascaraValor(campoValor);
    aplicarMascaraValor(valorSalarioBanner);
    aplicarMascaraValor(campoLimiteCategoria);

    onAuthStateChanged(auth, async (usuario) => {
        if (!usuario) {
            window.location.href = "index.html";
            return;
        }

        uidAtual = usuario.uid;
        emailUsuario.textContent = usuario.email;

        // Os dados principais começam a carregar JÁ, antes de qualquer outra
        // consulta. Antes, eles esperavam a busca do perfil terminar — e no
        // celular, com rede lenta, essa busca podia demorar ou travar e a
        // tela ficava vazia até trocar de mês.
        atualizarRotuloMes();
        escutarLancamentosDoMes();
        escutarPendenciasDoMes();
        buscarGastosMesAnterior();
        escutarSaldoBancoPrincipal();
        // As compras no cartão também entram no gráfico — começam a chegar
        // já, sem esperar a fila de consultas secundárias lá embaixo (era
        // isso que deixava o gráfico incompleto na abertura do app)
        escutarResumoFaturaCartoes();
        setTimeout(() => {
            if (!bancoPrincipalResolvido) { bancoPrincipalResolvido = true; atualizarNumeroGrandeDoSaldo(); }
        }, 5000);

        // Busca do perfil isolada num try/catch — se essa consulta falhar
        // por uma instabilidade de rede bem na abertura do app (o momento
        // mais comum pra isso acontecer), a gente NÃO quer que o app fique
        // travado numa tela em branco pra sempre: segue com um perfil vazio
        // (só perde nome/salário por essa sessão) em vez de travar tudo
        let perfil = {};
        try {
            const perfilSnapshot = await getDoc(doc(db, "usuarios", uidAtual));
            if (!perfilSnapshot.exists() || perfilSnapshot.data().onboardingCompleto !== true) {
                window.location.href = "onboarding.html";
                return;
            }
            perfil = perfilSnapshot.data();
        } catch (erro) {
            console.error("Bull: falha ao carregar o perfil na abertura do app —", erro);
        }

        primeiroNome = (perfil.nome || "").trim().split(" ")[0] || "";
        salarioPadrao = perfil.salarioPadrao || 0;

        // Pro perfil Diarista, o botão do meio continua mostrando "Ganho";
        // pra todo mundo, mostra "Extra"
        const ehDiarista = Array.isArray(perfil.profissoes) && perfil.profissoes.includes("Diarista");
        botaoEscolhaExtra.textContent = ehDiarista ? "Ganho" : "Extra";

        // ESSENCIAL PRIMEIRO — mostra o mês e os lançamentos/pendências
        // imediatamente ao abrir o app, sem depender de mais nada. Antes,
        // isso só rodava DEPOIS de uma sequência de "await" em cascata
        // (categorias, orçamentos, metas, bancos, cartões...): se qualquer
        // um desses falhasse (rede instável logo na abertura do PWA, por
        // exemplo), o erro não tratado interrompia a cadeia e a tela
        // ficava vazia — só voltava a funcionar quando a pessoa trocava de
        // mês, porque aí esse mesmo bloco rodava de novo (via mudarPeriodo)
        // isolado do resto. Rodando isso primeiro, sem depender de nada
        // secundário, a tela principal nunca fica em branco.
        // (os dados principais já foram iniciados lá em cima)

        // Dados secundários (categorias, orçamentos, metas, bancos,
        // cartões...) — cada um isolado num try/catch, pra um erro em
        // qualquer um deles não travar os outros. Antes, um "await" que
        // falhasse aqui impedia até o código essencial acima de rodar.
        async function carregarComSeguranca(nomeParaLog, funcao) {
            try {
                await funcao();
            } catch (erro) {
                console.error(`Bull: falha ao carregar "${nomeParaLog}" na abertura do app —`, erro);
            }
        }

        await carregarComSeguranca("categorias customizadas", carregarCategoriasCustomizadas);
        await carregarComSeguranca("orçamentos", carregarOrcamentos);
        await carregarComSeguranca("metas", carregarMetas);
        await carregarComSeguranca("bancos", carregarBancos);
        await carregarComSeguranca("resumo de bancos", atualizarResumoBancos);
        await carregarComSeguranca("cartões", carregarCartoes);
        await carregarComSeguranca("edição pedida pelo extrato", abrirEdicaoPedidaPelaUrl);
        // Agora que os cartões (dia de fechamento, nomes) estão carregados,
        // recomeça a escuta pra recalcular o resumo da fatura e o gráfico
        escutarResumoFaturaCartoes();
        if (!perfil.migracaoMesReferenciaConcluida) {
            await carregarComSeguranca("migração de lançamentos antigos", migrarLancamentosAntigos);
        }
        if (!perfil.migracaoNoCartaoConcluida) {
            await carregarComSeguranca("migração de pendências sem campo noCartao", migrarPendenciasSemCampoNoCartao);
        }

        verificarConselhoMensal(perfil);
        verificarAniversario(perfil);
        verificarPendenciasAntigas();

        // O banner de salário roda numa consulta separada, olhando pro mês
        // atual de verdade — independente de qual mês está sendo navegado
        if (salarioPadrao > 0) escutarSalarioDoMes();
    });

    // Menu lateral, tema, troca de mês e avisos automáticos (conselho, correções, aniversário): vive em menu.js
    const { atualizarRotuloMes, verificarConselhoMensal, migrarLancamentosAntigos, migrarPendenciasSemCampoNoCartao, verificarPendenciasAntigas, verificarAniversario } = iniciarMenuPeriodoERotinas({
        get overlayMenu() { return overlayMenu; },
        get painelMenu() { return painelMenu; },
        get botaoFecharMenuLateral() { return botaoFecharMenuLateral; },
        get botaoTema() { return botaoTema; },
        get botaoMaisNavInferior() { return botaoMaisNavInferior; },
        get anoAnteriorBtn() { return anoAnteriorBtn; },
        get anoProximoBtn() { return anoProximoBtn; },
        get mesAnteriorBtn() { return mesAnteriorBtn; },
        get mesProximoBtn() { return mesProximoBtn; },
        get rotuloMes() { return rotuloMes; },
        get linkExtrato() { return linkExtrato; },
        get fundoModalConselho() { return fundoModalConselho; },
        get botaoFecharConselho() { return botaoFecharConselho; },
        get fundoModalPendenciasAntigas() { return fundoModalPendenciasAntigas; },
        get textoPendenciasAntigas() { return textoPendenciasAntigas; },
        get botaoVerPendenciasAntigas() { return botaoVerPendenciasAntigas; },
        get botaoFecharPendenciasAntigas() { return botaoFecharPendenciasAntigas; },
        get fundoModalAniversario() { return fundoModalAniversario; },
        get textoAniversario() { return textoAniversario; },
        get botaoFecharAniversario() { return botaoFecharAniversario; },
        get uidAtual() { return uidAtual; },
        set uidAtual(v) { uidAtual = v; },
        get mesSelecionado() { return mesSelecionado; },
        set mesSelecionado(v) { mesSelecionado = v; },
        get primeiroNome() { return primeiroNome; },
        set primeiroNome(v) { primeiroNome = v; },
        get escutarPendenciasDoMes() { return escutarPendenciasDoMes; },
        get escutarResumoFaturaCartoes() { return escutarResumoFaturaCartoes; },
        get buscarGastosMesAnterior() { return buscarGastosMesAnterior; },
        get escutarLancamentosDoMes() { return escutarLancamentosDoMes; }
    });

    // Categorias, bancos e edição de categoria: vive em categorias.js
    const { carregarCategoriasCustomizadas, ehForaDosTotais, carregarOrcamentos, carregarMetas, carregarBancos, calcularSaldoBancoAgora, atualizarResumoBancos, escutarSaldoBancoPrincipal, carregarCartoes, popularSelectBancoPagamento, popularSelectCartaoPagamento, popularSelectCategorias, popularSelectMetas, popularSelectBancoGenerico } = iniciarCategoriasEBancos({
        get linkResumoBancos() { return linkResumoBancos; },
        get valorTotalBancos() { return valorTotalBancos; },
        get listaBancosCards() { return listaBancosCards; },
        get fundoModalEditarCategoria() { return fundoModalEditarCategoria; },
        get botaoFecharEditarCategoria() { return botaoFecharEditarCategoria; },
        get campoNovoNomeCategoria() { return campoNovoNomeCategoria; },
        get campoLimiteCategoriaWrapper() { return campoLimiteCategoriaWrapper; },
        get campoLimiteCategoria() { return campoLimiteCategoria; },
        get campoVencimentoCategoriaWrapper() { return campoVencimentoCategoriaWrapper; },
        get campoVencimentoCategoria() { return campoVencimentoCategoria; },
        get textoAvisoVencimento() { return textoAvisoVencimento; },
        get mensagemAvisoEditarCategoria() { return mensagemAvisoEditarCategoria; },
        get botaoSalvarEditarCategoria() { return botaoSalvarEditarCategoria; },
        get spinnerEditarCategoria() { return spinnerEditarCategoria; },
        get campoCategoria() { return campoCategoria; },
        get botaoExcluirCategoria() { return botaoExcluirCategoria; },
        get botaoEditarCategoria() { return botaoEditarCategoria; },
        get campoNovaCategoriaWrapper() { return campoNovaCategoriaWrapper; },
        get campoNovaCategoria() { return campoNovaCategoria; },
        get campoRepasseNovaCategoria() { return campoRepasseNovaCategoria; },
        get linhaRepasseNovaCategoria() { return linhaRepasseNovaCategoria; },
        get campoRepasseCategoria() { return campoRepasseCategoria; },
        get campoVencimentoNovaCategoriaWrapper() { return campoVencimentoNovaCategoriaWrapper; },
        get campoBancoPagamento() { return campoBancoPagamento; },
        get campoCartaoPagamento() { return campoCartaoPagamento; },
        get campoFixo() { return campoFixo; },
        get campoParcelado() { return campoParcelado; },
        get uidAtual() { return uidAtual; },
        set uidAtual(v) { uidAtual = v; },
        get tipoSelecionado() { return tipoSelecionado; },
        set tipoSelecionado(v) { tipoSelecionado = v; },
        get categoriasCustomizadas() { return categoriasCustomizadas; },
        set categoriasCustomizadas(v) { categoriasCustomizadas = v; },
        get metasCustomizadas() { return metasCustomizadas; },
        set metasCustomizadas(v) { metasCustomizadas = v; },
        get bancosCustomizados() { return bancosCustomizados; },
        set bancosCustomizados(v) { bancosCustomizados = v; },
        get cartoesCustomizados() { return cartoesCustomizados; },
        set cartoesCustomizados(v) { cartoesCustomizados = v; },
        get mapaOrcamentos() { return mapaOrcamentos; },
        set mapaOrcamentos(v) { mapaOrcamentos = v; },
        get bancoPrincipalResolvido() { return bancoPrincipalResolvido; },
        set bancoPrincipalResolvido(v) { bancoPrincipalResolvido = v; },
        get saldoBancoPrincipalAtual() { return saldoBancoPrincipalAtual; },
        set saldoBancoPrincipalAtual(v) { saldoBancoPrincipalAtual = v; },
        get nomeBancoPrincipalAtual() { return nomeBancoPrincipalAtual; },
        set nomeBancoPrincipalAtual(v) { nomeBancoPrincipalAtual = v; },
        get pararDeEscutarSaldoBancoPrincipal() { return pararDeEscutarSaldoBancoPrincipal; },
        set pararDeEscutarSaldoBancoPrincipal(v) { pararDeEscutarSaldoBancoPrincipal = v; },
        get modoGuardar() { return modoGuardar; },
        set modoGuardar(v) { modoGuardar = v; },
        get ultimosDocumentosDoMes() { return ultimosDocumentosDoMes; },
        set ultimosDocumentosDoMes(v) { ultimosDocumentosDoMes = v; },
        get atualizarNumeroGrandeDoSaldo() { return atualizarNumeroGrandeDoSaldo; },
        get calcularTotais() { return calcularTotais; },
        get renderizarGrafico() { return renderizarGrafico; },
        get atualizarVisibilidadeSecaoBancosCartoes() { return atualizarVisibilidadeSecaoBancosCartoes; }
    });

    // Formulário do + (criar, editar e salvar lançamentos): vive em formulario.js
    const { abrirModalEdicao, abrirEdicaoPedidaPelaUrl } = iniciarFormulario({
        get botaoAbrirModal() { return botaoAbrirModal; },
        get botaoFecharModal() { return botaoFecharModal; },
        get fundoModal() { return fundoModal; },
        get tituloModal() { return tituloModal; },
        get etapaEscolha() { return etapaEscolha; },
        get perguntaEscolha() { return perguntaEscolha; },
        get botoesEscolha() { return botoesEscolha; },
        get botaoEscolhaExtra() { return botaoEscolhaExtra; },
        get botaoTrocarTipo() { return botaoTrocarTipo; },
        get formulario() { return formulario; },
        get rotuloValor() { return rotuloValor; },
        get campoValor() { return campoValor; },
        get campoParcelasWrapper() { return campoParcelasWrapper; },
        get campoParcelas() { return campoParcelas; },
        get previewParcela() { return previewParcela; },
        get campoCategoriaWrapper() { return campoCategoriaWrapper; },
        get rotuloCategoria() { return rotuloCategoria; },
        get rotuloNovaCategoria() { return rotuloNovaCategoria; },
        get campoCategoria() { return campoCategoria; },
        get botaoExcluirCategoria() { return botaoExcluirCategoria; },
        get botaoEditarCategoria() { return botaoEditarCategoria; },
        get campoNovaCategoriaWrapper() { return campoNovaCategoriaWrapper; },
        get campoNovaCategoria() { return campoNovaCategoria; },
        get campoRepasseNovaCategoria() { return campoRepasseNovaCategoria; },
        get campoVencimentoNovaCategoriaWrapper() { return campoVencimentoNovaCategoriaWrapper; },
        get campoVencimentoNovaCategoria() { return campoVencimentoNovaCategoria; },
        get campoBancoOrigemWrapper() { return campoBancoOrigemWrapper; },
        get campoBancoOrigem() { return campoBancoOrigem; },
        get campoBancoWrapper() { return campoBancoWrapper; },
        get campoBanco() { return campoBanco; },
        get campoFormaPagamentoWrapper() { return campoFormaPagamentoWrapper; },
        get campoFormaPagamento() { return campoFormaPagamento; },
        get campoBancoPagamentoWrapper() { return campoBancoPagamentoWrapper; },
        get campoChavePixWrapper() { return campoChavePixWrapper; },
        get campoChavePix() { return campoChavePix; },
        get rotuloBancoPagamento() { return rotuloBancoPagamento; },
        get campoBancoPagamento() { return campoBancoPagamento; },
        get campoCartaoPagamentoWrapper() { return campoCartaoPagamentoWrapper; },
        get campoCartaoPagamento() { return campoCartaoPagamento; },
        get campoDescricaoWrapper() { return campoDescricaoWrapper; },
        get campoDescricao() { return campoDescricao; },
        get campoData() { return campoData; },
        get atalhoHoje() { return atalhoHoje; },
        get atalhoOntem() { return atalhoOntem; },
        get opcoesEspeciaisGasto() { return opcoesEspeciaisGasto; },
        get campoFixo() { return campoFixo; },
        get campoParcelado() { return campoParcelado; },
        get campoVencimentoLancamentoWrapper() { return campoVencimentoLancamentoWrapper; },
        get slotVencimentoFixo() { return slotVencimentoFixo; },
        get slotVencimentoParcelado() { return slotVencimentoParcelado; },
        get campoVencimentoLancamento() { return campoVencimentoLancamento; },
        get mensagemAviso() { return mensagemAviso; },
        get botaoSalvar() { return botaoSalvar; },
        get textoBotaoSalvar() { return textoBotaoSalvar; },
        get spinnerSalvar() { return spinnerSalvar; },
        get uidAtual() { return uidAtual; },
        set uidAtual(v) { uidAtual = v; },
        get mesSelecionado() { return mesSelecionado; },
        set mesSelecionado(v) { mesSelecionado = v; },
        get tipoSelecionado() { return tipoSelecionado; },
        set tipoSelecionado(v) { tipoSelecionado = v; },
        get categoriasCustomizadas() { return categoriasCustomizadas; },
        set categoriasCustomizadas(v) { categoriasCustomizadas = v; },
        get metasCustomizadas() { return metasCustomizadas; },
        set metasCustomizadas(v) { metasCustomizadas = v; },
        get bancosCustomizados() { return bancosCustomizados; },
        set bancosCustomizados(v) { bancosCustomizados = v; },
        get cartoesCustomizados() { return cartoesCustomizados; },
        set cartoesCustomizados(v) { cartoesCustomizados = v; },
        get primeiroNome() { return primeiroNome; },
        set primeiroNome(v) { primeiroNome = v; },
        get idEmEdicao() { return idEmEdicao; },
        set idEmEdicao(v) { idEmEdicao = v; },
        get dadosOriginaisEmEdicao() { return dadosOriginaisEmEdicao; },
        set dadosOriginaisEmEdicao(v) { dadosOriginaisEmEdicao = v; },
        get saldoExibidoETravado() { return saldoExibidoETravado; },
        set saldoExibidoETravado(v) { saldoExibidoETravado = v; },
        get modoGuardar() { return modoGuardar; },
        set modoGuardar(v) { modoGuardar = v; },
        get cobrirGastoComGuardado() { return cobrirGastoComGuardado; },
        get ehForaDosTotais() { return ehForaDosTotais; },
        get calcularSaldoBancoAgora() { return calcularSaldoBancoAgora; },
        get popularSelectBancoPagamento() { return popularSelectBancoPagamento; },
        get popularSelectCartaoPagamento() { return popularSelectCartaoPagamento; },
        get popularSelectCategorias() { return popularSelectCategorias; },
        get popularSelectMetas() { return popularSelectMetas; },
        get popularSelectBancoGenerico() { return popularSelectBancoGenerico; }
    });

    // Pagamentos pendentes do mês: vive em pendencias.js
    const { escutarPendenciasDoMes, escutarResumoFaturaCartoes, atualizarVisibilidadeSecaoBancosCartoes } = iniciarPendencias({
        get listaPendencias() { return listaPendencias; },
        get pendenciasVazio() { return pendenciasVazio; },
        get botaoVerMaisPendencias() { return botaoVerMaisPendencias; },
        get secaoFaturaCartao() { return secaoFaturaCartao; },
        get tituloFaturaCartao() { return tituloFaturaCartao; },
        get valorFaturaCartao() { return valorFaturaCartao; },
        get vencimentoFaturaCartao() { return vencimentoFaturaCartao; },
        get linkResumoFatura() { return linkResumoFatura; },
        get linkResumoBancos() { return linkResumoBancos; },
        get fundoModalEditarPix() { return fundoModalEditarPix; },
        get botaoFecharEditarPix() { return botaoFecharEditarPix; },
        get textoEditarPixContexto() { return textoEditarPixContexto; },
        get campoEditarChavePix() { return campoEditarChavePix; },
        get mensagemAvisoEditarPix() { return mensagemAvisoEditarPix; },
        get botaoSalvarEditarPix() { return botaoSalvarEditarPix; },
        get fundoModalEditarFormaPagamento() { return fundoModalEditarFormaPagamento; },
        get botaoFecharEditarFormaPagamento() { return botaoFecharEditarFormaPagamento; },
        get textoEditarFormaPagamentoContexto() { return textoEditarFormaPagamentoContexto; },
        get campoEditarFormaPagamento() { return campoEditarFormaPagamento; },
        get campoEditarBancoPagamentoWrapper() { return campoEditarBancoPagamentoWrapper; },
        get campoEditarBancoPagamento() { return campoEditarBancoPagamento; },
        get mensagemAvisoEditarFormaPagamento() { return mensagemAvisoEditarFormaPagamento; },
        get botaoSalvarEditarFormaPagamento() { return botaoSalvarEditarFormaPagamento; },
        get fundoModalExcluirPendencia() { return fundoModalExcluirPendencia; },
        get botaoFecharExcluirPendencia() { return botaoFecharExcluirPendencia; },
        get etapaEscopoExclusao() { return etapaEscopoExclusao; },
        get textoPerguntaEscopo() { return textoPerguntaEscopo; },
        get botaoExcluirSoEssa() { return botaoExcluirSoEssa; },
        get botaoExcluirTodas() { return botaoExcluirTodas; },
        get etapaConfirmarExclusao() { return etapaConfirmarExclusao; },
        get textoConfirmarExclusao() { return textoConfirmarExclusao; },
        get botaoConfirmarExclusaoFinal() { return botaoConfirmarExclusaoFinal; },
        get botaoCancelarExclusao() { return botaoCancelarExclusao; },
        get uidAtual() { return uidAtual; },
        set uidAtual(v) { uidAtual = v; },
        get mesSelecionado() { return mesSelecionado; },
        set mesSelecionado(v) { mesSelecionado = v; },
        get categoriasCustomizadas() { return categoriasCustomizadas; },
        set categoriasCustomizadas(v) { categoriasCustomizadas = v; },
        get cartoesCustomizados() { return cartoesCustomizados; },
        set cartoesCustomizados(v) { cartoesCustomizados = v; },
        get docsCartaoParaGrafico() { return docsCartaoParaGrafico; },
        set docsCartaoParaGrafico(v) { docsCartaoParaGrafico = v; },
        get ultimosDocumentosDoMes() { return ultimosDocumentosDoMes; },
        set ultimosDocumentosDoMes(v) { ultimosDocumentosDoMes = v; },
        get popularSelectBancoGenerico() { return popularSelectBancoGenerico; },
        get cobrirGastoComGuardado() { return cobrirGastoComGuardado; },
        get renderizarGrafico() { return renderizarGrafico; }
    });

    // Lançamentos do mês: lista, totais, gráfico, salário e guardado: vive em lancamentos.js
    const { buscarGastosMesAnterior, escutarLancamentosDoMes, escutarSalarioDoMes, cobrirGastoComGuardado, calcularTotais, renderizarGrafico } = iniciarLancamentos({
        get indicadorMesFechado() { return indicadorMesFechado; },
        get totalGanhosEl() { return totalGanhosEl; },
        get totalGastosEl() { return totalGastosEl; },
        get listaLancamentos() { return listaLancamentos; },
        get listaVazia() { return listaVazia; },
        get bannerSalario() { return bannerSalario; },
        get valorSalarioBanner() { return valorSalarioBanner; },
        get botaoConfirmarSalario() { return botaoConfirmarSalario; },
        get perguntaSalario() { return perguntaSalario; },
        get graficoDonut() { return graficoDonut; },
        get legendaGrafico() { return legendaGrafico; },
        get graficoVazio() { return graficoVazio; },
        get uidAtual() { return uidAtual; },
        set uidAtual(v) { uidAtual = v; },
        get mesSelecionado() { return mesSelecionado; },
        set mesSelecionado(v) { mesSelecionado = v; },
        get bancosCustomizados() { return bancosCustomizados; },
        set bancosCustomizados(v) { bancosCustomizados = v; },
        get cartoesCustomizados() { return cartoesCustomizados; },
        set cartoesCustomizados(v) { cartoesCustomizados = v; },
        get pararDeEscutar() { return pararDeEscutar; },
        set pararDeEscutar(v) { pararDeEscutar = v; },
        get pararDeEscutarSalario() { return pararDeEscutarSalario; },
        set pararDeEscutarSalario(v) { pararDeEscutarSalario = v; },
        get salarioPadrao() { return salarioPadrao; },
        set salarioPadrao(v) { salarioPadrao = v; },
        get mapaOrcamentos() { return mapaOrcamentos; },
        set mapaOrcamentos(v) { mapaOrcamentos = v; },
        get primeiroNome() { return primeiroNome; },
        set primeiroNome(v) { primeiroNome = v; },
        get saldoAtualDoMes() { return saldoAtualDoMes; },
        set saldoAtualDoMes(v) { saldoAtualDoMes = v; },
        get nomeBancoPrincipalAtual() { return nomeBancoPrincipalAtual; },
        set nomeBancoPrincipalAtual(v) { nomeBancoPrincipalAtual = v; },
        get docsCartaoParaGrafico() { return docsCartaoParaGrafico; },
        set docsCartaoParaGrafico(v) { docsCartaoParaGrafico = v; },
        get primeiroSnapshotDoMesChegou() { return primeiroSnapshotDoMesChegou; },
        set primeiroSnapshotDoMesChegou(v) { primeiroSnapshotDoMesChegou = v; },
        get ultimosDocumentosDoMes() { return ultimosDocumentosDoMes; },
        set ultimosDocumentosDoMes(v) { ultimosDocumentosDoMes = v; },
        get atualizarNumeroGrandeDoSaldo() { return atualizarNumeroGrandeDoSaldo; },
        get ehForaDosTotais() { return ehForaDosTotais; },
        get calcularSaldoBancoAgora() { return calcularSaldoBancoAgora; },
        get abrirModalEdicao() { return abrirModalEdicao; }
    });

});
