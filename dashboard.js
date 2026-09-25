import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection, addDoc, updateDoc, setDoc, deleteDoc, doc, getDoc, getDocs,
    query, where, onSnapshot, Timestamp, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { iniciarModoPrivacidade } from "./privacidade.js";

const CATEGORIAS_PADRAO = {
    gasto: ["Outros"],
    ganho: ["Outros"]
};

// Cores fixas por categoria no gráfico de gastos — cada categoria sempre
// cai na mesma cor (calculada a partir do próprio nome), então "Mercado"
// é sempre a mesma cor em qualquer mês, em vez de mudar conforme o ranking
// de quem gastou mais. "Guardado" tem cor própria reservada, igual ao
// pontinho usado pra ele no resto do app.
const PALETA_CATEGORIAS = [
    "#3987E5", "#D95926", "#199E70", "#C98500", "#9085E9",
    "#D55181", "#E66767", "#5EEAD4", "#F5D76E", "#34D399"
];

function corDaCategoria(nomeCategoria) {
    if (nomeCategoria === "Guardado") return "#60A5FA";
    let hash = 0;
    for (let i = 0; i < nomeCategoria.length; i++) {
        hash = (hash * 31 + nomeCategoria.charCodeAt(i)) >>> 0;
    }
    return PALETA_CATEGORIAS[hash % PALETA_CATEGORIAS.length];
}

const NOMES_MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

// Mostramos só os últimos N lançamentos na tela inicial — o resto fica no Extrato Completo
const LIMITE_ITENS_LISTA_INICIAL = 4;

// Navegação do calendário: do início do ano atual até dezembro de 2028 —
// dá espaço suficiente pra parcelamentos longos (até 48x) não ficarem sem
// mês pra "morar"
const LIMITE_NAVEGACAO_SUPERIOR = new Date(2030, 11, 1);
const LIMITE_NAVEGACAO_INFERIOR = new Date(new Date().getFullYear(), 0, 1);

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
    const toast = document.getElementById("toast");
    const toastMensagem = document.getElementById("toast-mensagem");
    const toastBotaoAcao = document.getElementById("toast-botao-acao");
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

    const fundoModalConfirmar = document.getElementById("fundo-modal-confirmar");
    const tituloModalConfirmar = document.getElementById("titulo-modal-confirmar");
    const textoModalConfirmar = document.getElementById("texto-modal-confirmar");
    const botaoConfirmarAcao = document.getElementById("botao-confirmar-acao");
    const botaoCancelarAcao = document.getElementById("botao-cancelar-acao");
    const botaoFecharConfirmar = document.getElementById("botao-fechar-confirmar");
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
    const campoVencimentoNovaCategoriaWrapper = document.getElementById("campo-vencimento-nova-categoria-wrapper");
    const campoVencimentoNovaCategoria = document.getElementById("campo-vencimento-nova-categoria");
    const campoBancoOrigemWrapper = document.getElementById("campo-banco-origem-wrapper");
    const campoBancoOrigem = document.getElementById("campo-banco-origem");
    const campoBancoWrapper = document.getElementById("campo-banco-wrapper");
    const campoBanco = document.getElementById("campo-banco");
    const campoFormaPagamentoWrapper = document.getElementById("campo-forma-pagamento-wrapper");
    const rotuloFormaPagamento = document.getElementById("rotulo-forma-pagamento");
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
    // ==========================================================================
    // TELINHA DE CONFIRMAÇÃO GENÉRICA — substitui o confirm() feio do
    // navegador por uma telinha nas cores do app, em qualquer lugar do
    // dashboard que precise perguntar "tem certeza?"
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
        atualizarRotuloMes();
        escutarLancamentosDoMes();
        escutarPendenciasDoMes();
        buscarGastosMesAnterior();

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
        escutarSaldoBancoPrincipal();
        await carregarComSeguranca("cartões", carregarCartoes);
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

    // ==========================================================================
    // 4. MENU LATERAL
    // ==========================================================================
    function abrirMenuLateral() {
        painelMenu.classList.add("aberto");
        overlayMenu.classList.add("aberto");
    }

    function fecharMenuLateral() {
        painelMenu.classList.remove("aberto");
        overlayMenu.classList.remove("aberto");
    }

    botaoFecharMenuLateral.addEventListener("click", fecharMenuLateral);
    overlayMenu.addEventListener("click", fecharMenuLateral);
    if (botaoMaisNavInferior) {
        botaoMaisNavInferior.addEventListener("click", abrirMenuLateral);
    }

    // Quando o "Mais" é clicado em outra tela (Extrato, Guardado, Cartões,
    // Lembretes, Configurações), ela não tem o menu lateral construído — só
    // existe aqui no Dashboard. Por isso o link delas manda pra cá com
    // "?menu=1", e a gente abre o menu sozinho assim que a página carrega,
    // em vez de deixar a pessoa cair sem querer na tela inicial.
    if (new URLSearchParams(window.location.search).get("menu") === "1") {
        abrirMenuLateral();
        history.replaceState(null, "", window.location.pathname);
    }

    // ==========================================================================
    // TEMA CLARO / ESCURO — só troca a aparência, nada de dados. A escolha
    // fica salva no aparelho (localStorage), não na conta, então cada
    // aparelho lembra o tema dele.
    // ==========================================================================
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

    // ==========================================================================
    // 5. NAVEGAÇÃO ENTRE MESES E ANOS (com limite até dezembro do ano corrente)
    // ==========================================================================
    mesAnteriorBtn.addEventListener("click", () => mudarPeriodo(-1));
    mesProximoBtn.addEventListener("click", () => mudarPeriodo(1));
    anoAnteriorBtn.addEventListener("click", () => mudarPeriodo(-12));
    anoProximoBtn.addEventListener("click", () => mudarPeriodo(12));

    function mudarPeriodo(mesesParaSomar) {
        const novaData = new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth() + mesesParaSomar, 1);

        if (novaData > LIMITE_NAVEGACAO_SUPERIOR) {
            mesSelecionado = new Date(LIMITE_NAVEGACAO_SUPERIOR);
        } else if (novaData < LIMITE_NAVEGACAO_INFERIOR) {
            mesSelecionado = new Date(LIMITE_NAVEGACAO_INFERIOR);
        } else {
            mesSelecionado = novaData;
        }

        atualizarRotuloMes();
        escutarLancamentosDoMes();
        escutarPendenciasDoMes();
        buscarGastosMesAnterior();
    }

    function atualizarRotuloMes() {
        rotuloMes.textContent = `${NOMES_MESES[mesSelecionado.getMonth()]} ${mesSelecionado.getFullYear()}`;

        const noLimiteSuperior = mesSelecionado.getFullYear() === LIMITE_NAVEGACAO_SUPERIOR.getFullYear()
            && mesSelecionado.getMonth() === LIMITE_NAVEGACAO_SUPERIOR.getMonth();
        const noLimiteInferior = mesSelecionado.getFullYear() === LIMITE_NAVEGACAO_INFERIOR.getFullYear()
            && mesSelecionado.getMonth() === LIMITE_NAVEGACAO_INFERIOR.getMonth();

        mesProximoBtn.disabled = noLimiteSuperior;
        anoProximoBtn.disabled = noLimiteSuperior;
        mesAnteriorBtn.disabled = noLimiteInferior;
        anoAnteriorBtn.disabled = noLimiteInferior;

        // O link "Ver extrato completo" da tela inicial sempre abre já filtrado
        // no mês que está sendo visto no momento (o extrato em si permite trocar
        // o filtro depois, incluindo ver todos os meses)
        const mesParaUrl = String(mesSelecionado.getMonth() + 1).padStart(2, "0");
        linkExtrato.href = `extrato.html?mes=${mesSelecionado.getFullYear()}-${mesParaUrl}`;
    }

    // ==========================================================================
    // CONSELHO FINANCEIRO — checa se o total guardado (histórico completo) está
    // zerado, e mostra um aviso amigável uma vez por mês (nos primeiros dias)
    // ==========================================================================
    async function verificarConselhoMensal(perfil) {
        const hoje = new Date();
        if (hoje.getDate() > 3) return; // só nos primeiros dias do mês

        const chaveDoMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
        if (perfil.ultimoAvisoConselho === chaveDoMes) return; // já mostrou esse mês

        // consulta simples, sem índice composto: soma tudo que já foi guardado
        const referenciaLancamentos = collection(db, "usuarios", uidAtual, "lancamentos");
        const consultaGuardado = query(referenciaLancamentos, where("categoria", "==", "Guardar Dinheiro"));
        const resultado = await getDocs(consultaGuardado);

        let totalGuardado = 0;
        resultado.forEach((documento) => { totalGuardado += documento.data().valor; });

        if (totalGuardado <= 0) {
            fundoModalConselho.classList.add("aberto");
        }

        // Marca que já verificou esse mês, pra não mostrar de novo até o próximo
        await setDoc(doc(db, "usuarios", uidAtual), { ultimoAvisoConselho: chaveDoMes }, { merge: true });
    }

    botaoFecharConselho.addEventListener("click", () => {
        fundoModalConselho.classList.remove("aberto");
    });

    // ==========================================================================
    // PENDÊNCIAS ANTIGAS — avisa se tem gasto fixo/parcela de 2+ meses atrás
    // que nunca foi marcado como pago, pra pessoa não perder o controle do
    // saldo por esquecimento
    // ==========================================================================
    let mesMaisAntigoComPendencia = null;

    // ==========================================================================
    // CORREÇÃO AUTOMÁTICA — lançamentos criados antes da separação entre
    // "data exibida" e "mês que conta" (mesReferencia) não têm esse campo
    // ainda. Roda uma vez por login: qualquer lançamento sem mesReferencia
    // recebe um, calculado a partir da própria data dele — assim, nenhum
    // lançamento antigo "some" de nenhuma tela depois dessa atualização.
    // ==========================================================================
    async function migrarLancamentosAntigos() {
        const referencia = collection(db, "usuarios", uidAtual, "lancamentos");
        const todosOsLancamentos = await getDocs(referencia);

        const semMesReferencia = todosOsLancamentos.docs.filter((documento) => !documento.data().mesReferencia);

        if (semMesReferencia.length > 0) {
            // writeBatch aguenta até 500 operações — divide em pedaços por
            // segurança, caso alguém tenha uma quantidade grande de lançamentos
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

        // Marca no perfil que essa correção já rodou — sem isso, o app teria
        // que buscar TODOS os lançamentos (mesmo já corrigidos) todo santo
        // login, o que ia ficando cada vez mais lento conforme o histórico
        // crescesse. Com a marca, roda de verdade só uma vez na vida.
        await setDoc(doc(db, "usuarios", uidAtual), { migracaoMesReferenciaConcluida: true }, { merge: true });
    }

    // ==========================================================================
    // CORREÇÃO AUTOMÁTICA — pendências criadas antes de existir a função
    // "Comprar no Cartão" nunca ganharam o campo "noCartao" (ele só passou a
    // existir quando essa função foi criada). Sem esse campo, a consulta de
    // "Pagamentos Pendentes" (que filtra noCartao == false) nunca encontra
    // esses itens antigos — mesmo sendo gasto fixo/parcelado normal, ficam
    // invisíveis pra sempre. Roda uma vez por login: toda pendência sem o
    // campo recebe noCartao: false (não tem outra opção que ela possa ser,
    // já que "cartão" nem existia como conceito quando ela foi criada).
    // ==========================================================================
    async function migrarPendenciasSemCampoNoCartao() {
        const referencia = collection(db, "usuarios", uidAtual, "pendencias");
        const todasAsPendencias = await getDocs(referencia);

        const semCampoNoCartao = todasAsPendencias.docs.filter((documento) => documento.data().noCartao === undefined);

        if (semCampoNoCartao.length > 0) {
            for (let inicio = 0; inicio < semCampoNoCartao.length; inicio += 450) {
                const pedaco = semCampoNoCartao.slice(inicio, inicio + 450);
                const lote = writeBatch(db);
                pedaco.forEach((documento) => {
                    lote.update(documento.ref, { noCartao: false });
                });
                await lote.commit();
            }
        }

        await setDoc(doc(db, "usuarios", uidAtual), { migracaoNoCartaoConcluida: true }, { merge: true });
    }

    async function verificarPendenciasAntigas() {
        const referencia = collection(db, "usuarios", uidAtual, "pendencias");
        // Só um filtro de igualdade aqui — não precisa de índice composto
        const consulta = query(referencia, where("pago", "==", false));
        const resultado = await getDocs(consulta);

        const hoje = new Date();
        const chaveMesAtual = hoje.getFullYear() * 12 + hoje.getMonth();

        let contagemAntigas = 0;
        mesMaisAntigoComPendencia = null;
        let chaveMaisAntiga = Infinity;

        resultado.forEach((documento) => {
            const dados = documento.data();
            const [ano, mes] = dados.mesReferencia.split("-").map(Number);
            const chaveDoDocumento = ano * 12 + (mes - 1);

            // "Antiga" = de 2 meses atrás ou mais (dá uma folga de 1 mês,
            // que é normal a pessoa só confirmar depois que a fatura chega)
            if (chaveMesAtual - chaveDoDocumento >= 2) {
                contagemAntigas++;
                if (chaveDoDocumento < chaveMaisAntiga) {
                    chaveMaisAntiga = chaveDoDocumento;
                    mesMaisAntigoComPendencia = { ano, mes: mes - 1 };
                }
            }
        });

        if (contagemAntigas > 0) {
            textoPendenciasAntigas.textContent = `Você tem ${contagemAntigas} pendência${contagemAntigas > 1 ? "s" : ""} de gasto fixo/parcela de 2 meses atrás ou mais, ainda não confirmada${contagemAntigas > 1 ? "s" : ""}. Vale a pena revisar, pra manter o saldo certinho.`;
            fundoModalPendenciasAntigas.classList.add("aberto");
        }
    }

    botaoFecharPendenciasAntigas.addEventListener("click", () => {
        fundoModalPendenciasAntigas.classList.remove("aberto");
    });

    botaoVerPendenciasAntigas.addEventListener("click", () => {
        fundoModalPendenciasAntigas.classList.remove("aberto");
        if (mesMaisAntigoComPendencia) {
            mesSelecionado = new Date(mesMaisAntigoComPendencia.ano, mesMaisAntigoComPendencia.mes, 1);
            atualizarRotuloMes();
            escutarLancamentosDoMes();
            escutarPendenciasDoMes();
            buscarGastosMesAnterior();
        }
    });

    // ==========================================================================
    // ANIVERSÁRIO — compara dia/mês de nascimento com hoje; mostra 1x por ano
    // ==========================================================================
    async function verificarAniversario(perfil) {
        if (!perfil.dataNascimento) return;

        const hoje = new Date();
        const anoAtual = String(hoje.getFullYear());
        if (perfil.ultimoParabens === anoAtual) return; // já mostrou esse ano

        // dataNascimento vem como texto "AAAA-MM-DD" do campo de data
        const [, mesNascimento, diaNascimento] = perfil.dataNascimento.split("-").map(Number);

        const ehAniversario = (hoje.getMonth() + 1) === mesNascimento && hoje.getDate() === diaNascimento;
        if (!ehAniversario) return;

        textoAniversario.textContent = primeiroNome
            ? `Feliz aniversário, ${primeiroNome}! Que esse novo ano venha com muita saúde e as finanças sempre no verde. 🎂`
            : "Feliz aniversário! Que esse novo ano venha com muita saúde e as finanças sempre no verde. 🎂";

        fundoModalAniversario.classList.add("aberto");
        await setDoc(doc(db, "usuarios", uidAtual), { ultimoParabens: anoAtual }, { merge: true });
    }

    botaoFecharAniversario.addEventListener("click", () => {
        fundoModalAniversario.classList.remove("aberto");
    });

    // ==========================================================================
    // TOAST — mensagens rápidas no rodapé da tela
    // ==========================================================================
    let timeoutToast = null;

    // Mensagem simples, some sozinha (ex: "Lançamento salvo ✓")
    function mostrarToast(mensagem, duracaoMs = 2200) {
        if (timeoutToast) clearTimeout(timeoutToast);
        toastMensagem.textContent = mensagem;
        toastBotaoAcao.hidden = true;
        toastBotaoAcao.onclick = null;
        toast.hidden = false;
        timeoutToast = setTimeout(() => { toast.hidden = true; }, duracaoMs);
    }

    // Mensagem com um botão de ação (ex: "Excluído. Desfazer?") — a ação só
    // continua disponível enquanto o toast estiver na tela
    function mostrarToastComAcao(mensagem, textoBotao, aoClicar, duracaoMs = 5000) {
        if (timeoutToast) clearTimeout(timeoutToast);
        toastMensagem.textContent = mensagem;
        toastBotaoAcao.textContent = textoBotao;
        toastBotaoAcao.hidden = false;
        toastBotaoAcao.onclick = () => {
            clearTimeout(timeoutToast);
            toast.hidden = true;
            aoClicar();
        };
        toast.hidden = false;
        timeoutToast = setTimeout(() => { toast.hidden = true; }, duracaoMs);
    }

    // ==========================================================================
    // 6. CATEGORIAS
    // ==========================================================================
    async function carregarCategoriasCustomizadas() {
        const referencia = collection(db, "usuarios", uidAtual, "categorias");
        const resultado = await getDocs(referencia);

        // Guarda {nome, id} de cada categoria customizada — o id é o que
        // permite excluir depois lá no Firestore
        categoriasCustomizadas = { gasto: [], ganho: [] };
        resultado.forEach((documento) => {
            const dados = documento.data();
            if (dados.tipo === "gasto" || dados.tipo === "ganho") {
                categoriasCustomizadas[dados.tipo].push({ nome: dados.nome, id: documento.id });
            }
        });
    }

    async function carregarOrcamentos() {
        const referencia = collection(db, "usuarios", uidAtual, "orcamentos");
        const resultado = await getDocs(referencia);

        mapaOrcamentos = {};
        resultado.forEach((documento) => {
            mapaOrcamentos[documento.id] = documento.data().limite;
        });
    }

    async function carregarMetas() {
        const referencia = collection(db, "usuarios", uidAtual, "metas");
        const resultado = await getDocs(referencia);

        metasCustomizadas = [];
        resultado.forEach((documento) => {
            metasCustomizadas.push({ nome: documento.data().nome, id: documento.id });
        });
    }

    async function carregarBancos() {
        const referencia = collection(db, "usuarios", uidAtual, "bancos");
        const resultado = await getDocs(referencia);

        bancosCustomizados = [];
        resultado.forEach((documento) => {
            bancosCustomizados.push({ nome: documento.data().nome, id: documento.id });
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
        const referenciaLancamentos = collection(db, "usuarios", uidAtual, "lancamentos");
        const snapshotLancamentos = await getDocs(referenciaLancamentos);

        let total = saldoInicial || 0;
        snapshotLancamentos.forEach((documento) => {
            const dados = documento.data();
            const ehCategoriaEspecial = dados.categoria === "Guardar Dinheiro" || dados.categoria === "Retirada da Reserva";

            if (dados.tipo === "ganho" && !ehCategoriaEspecial && dados.banco === nomeBanco) {
                total += dados.valor;
            }
            if (dados.tipo === "gasto" && !ehCategoriaEspecial && (dados.formaPagamento === "pix" || dados.formaPagamento === "debito") && dados.banco === nomeBanco) {
                total -= dados.valor;
            }
            if (dados.categoria === "Fatura do Cartão" && dados.banco === nomeBanco) {
                total -= dados.valor;
            }
            if (ehCategoriaEspecial && dados.banco === nomeBanco) {
                total += dados.valor;
            }
            if (dados.categoria === "Guardar Dinheiro" && dados.valor > 0 && dados.bancoOrigem === nomeBanco) {
                total -= dados.valor;
            }
        });
        return total;
    }

    async function atualizarResumoBancos() {
        const referenciaBancos = collection(db, "usuarios", uidAtual, "bancos");
        const snapshotBancos = await getDocs(referenciaBancos);

        if (snapshotBancos.empty) {
            linkResumoBancos.hidden = true;
            if (listaBancosCards) listaBancosCards.innerHTML = "";
            atualizarVisibilidadeSecaoBancosCartoes();
            return;
        }

        const referenciaLancamentos = collection(db, "usuarios", uidAtual, "lancamentos");
        const snapshotLancamentos = await getDocs(referenciaLancamentos);

        let totalGeral = 0;
        const bancosComSaldo = [];
        snapshotBancos.forEach((bancoDoc) => {
            const banco = bancoDoc.data();
            let saldoBanco = banco.saldoInicial || 0;

            snapshotLancamentos.forEach((lancDoc) => {
                const dados = lancDoc.data();
                const ehCategoriaEspecial = dados.categoria === "Guardar Dinheiro" || dados.categoria === "Retirada da Reserva";

                if (dados.tipo === "ganho" && !ehCategoriaEspecial && dados.banco === banco.nome) {
                    saldoBanco += dados.valor;
                }
                if (dados.tipo === "gasto" && !ehCategoriaEspecial && (dados.formaPagamento === "pix" || dados.formaPagamento === "debito") && dados.banco === banco.nome) {
                    saldoBanco -= dados.valor;
                }
                if (dados.categoria === "Fatura do Cartão" && dados.banco === banco.nome) {
                    saldoBanco -= dados.valor;
                }
                if (ehCategoriaEspecial && dados.banco === banco.nome) {
                    saldoBanco += dados.valor;
                }
                if (dados.categoria === "Guardar Dinheiro" && dados.valor > 0 && dados.bancoOrigem === banco.nome) {
                    saldoBanco -= dados.valor;
                }
            });

            totalGeral += saldoBanco;
            bancosComSaldo.push({ nome: banco.nome, saldo: saldoBanco });
        });

        // Cartõezinhos individuais por banco, um do lado do outro, roláveis —
        // só faz sentido mostrar quando tem mais de um banco cadastrado
        if (listaBancosCards) {
            listaBancosCards.innerHTML = "";
            if (bancosComSaldo.length > 1) {
                bancosComSaldo.forEach((banco) => {
                    const card = document.createElement("a");
                    card.href = "cartao.html";
                    card.className = "cartao-banco-preview";
                    card.innerHTML = `
                        <span class="nome-banco-preview">${banco.nome}</span>
                        <span class="saldo-banco-preview">${formatarMoeda(banco.saldo)}</span>
                    `;
                    listaBancosCards.appendChild(card);
                });
            }
        }

        linkResumoBancos.hidden = false;
        valorTotalBancos.textContent = formatarMoeda(totalGeral);
        atualizarVisibilidadeSecaoBancosCartoes();
    }

    // ==========================================================================
    // SALDO DO MÊS = BANCO PRINCIPAL — quando existe um banco marcado como
    // principal, o número do "Saldo do Mês" PARA de ser ganhos-gastos do
    // mês, e passa a mostrar o saldo real desse banco, sempre — não importa
    // pra qual mês a pessoa estiver navegando na tela. Reativo (onSnapshot),
    // então atualiza sozinho a cada novo lançamento, sem precisar recarregar.
    // ==========================================================================
    function escutarSaldoBancoPrincipal() {
        const referenciaBancos = collection(db, "usuarios", uidAtual, "bancos");
        const consultaPrincipal = query(referenciaBancos, where("principal", "==", true));

        onSnapshot(consultaPrincipal, (snapshotBancos) => {
            // Para o "ouvinte" interno antigo (se tinha) antes de criar um
            // novo — evita dois rodando ao mesmo tempo, ou um vazando
            if (pararDeEscutarSaldoBancoPrincipal) {
                pararDeEscutarSaldoBancoPrincipal();
                pararDeEscutarSaldoBancoPrincipal = null;
            }

            if (snapshotBancos.empty) {
                saldoBancoPrincipalAtual = null;
                nomeBancoPrincipalAtual = null;
                atualizarNumeroGrandeDoSaldo();
                return;
            }

            const bancoPrincipal = { id: snapshotBancos.docs[0].id, ...snapshotBancos.docs[0].data() };
            nomeBancoPrincipalAtual = bancoPrincipal.nome;

            const referenciaLancamentos = collection(db, "usuarios", uidAtual, "lancamentos");
            pararDeEscutarSaldoBancoPrincipal = onSnapshot(referenciaLancamentos, (snapshotLancamentos) => {
                let total = bancoPrincipal.saldoInicial || 0;

                snapshotLancamentos.forEach((documento) => {
                    const dados = documento.data();
                    const ehCategoriaEspecial = dados.categoria === "Guardar Dinheiro" || dados.categoria === "Retirada da Reserva";

                    if (dados.tipo === "ganho" && !ehCategoriaEspecial && dados.banco === bancoPrincipal.nome) {
                        total += dados.valor;
                    }
                    if (dados.tipo === "gasto" && !ehCategoriaEspecial && (dados.formaPagamento === "pix" || dados.formaPagamento === "debito") && dados.banco === bancoPrincipal.nome) {
                        total -= dados.valor;
                    }
                    if (dados.categoria === "Fatura do Cartão" && dados.banco === bancoPrincipal.nome) {
                        total -= dados.valor;
                    }
                    if (ehCategoriaEspecial && dados.banco === bancoPrincipal.nome) {
                        total += dados.valor;
                    }
                    if (dados.categoria === "Guardar Dinheiro" && dados.valor > 0 && dados.bancoOrigem === bancoPrincipal.nome) {
                        total -= dados.valor;
                    }
                });

                saldoBancoPrincipalAtual = total;
                atualizarNumeroGrandeDoSaldo();
            });
        });
    }

    async function carregarCartoes() {
        const referencia = collection(db, "usuarios", uidAtual, "cartoes");
        const resultado = await getDocs(referencia);

        cartoesCustomizados = [];
        resultado.forEach((documento) => {
            cartoesCustomizados.push({ nome: documento.data().nome, diaVencimento: documento.data().diaVencimento, diaFechamento: documento.data().diaFechamento, id: documento.id });
        });
    }

    function popularSelectBancoPagamento() {
        campoBancoPagamento.innerHTML = "";

        if (bancosCustomizados.length === 0) {
            const opcaoVazia = document.createElement("option");
            opcaoVazia.value = "";
            opcaoVazia.disabled = true;
            opcaoVazia.selected = true;
            opcaoVazia.textContent = "Cria um banco primeiro (menu → Bancos e Cartões)";
            campoBancoPagamento.appendChild(opcaoVazia);
            return;
        }

        const opcaoPlaceholder = document.createElement("option");
        opcaoPlaceholder.value = "";
        opcaoPlaceholder.disabled = true;
        opcaoPlaceholder.selected = true;
        opcaoPlaceholder.textContent = "Selecione...";
        campoBancoPagamento.appendChild(opcaoPlaceholder);

        bancosCustomizados.forEach((banco) => {
            const opcao = document.createElement("option");
            opcao.value = banco.nome;
            opcao.textContent = banco.nome;
            campoBancoPagamento.appendChild(opcao);
        });
    }

    function popularSelectCartaoPagamento() {
        campoCartaoPagamento.innerHTML = "";

        if (cartoesCustomizados.length === 0) {
            const opcaoVazia = document.createElement("option");
            opcaoVazia.value = "";
            opcaoVazia.disabled = true;
            opcaoVazia.selected = true;
            opcaoVazia.textContent = "Cria um cartão primeiro (menu → Bancos e Cartões)";
            campoCartaoPagamento.appendChild(opcaoVazia);
            return;
        }

        const opcaoPlaceholder = document.createElement("option");
        opcaoPlaceholder.value = "";
        opcaoPlaceholder.disabled = true;
        opcaoPlaceholder.selected = true;
        opcaoPlaceholder.textContent = "Selecione...";
        campoCartaoPagamento.appendChild(opcaoPlaceholder);

        cartoesCustomizados.forEach((cartao) => {
            const opcao = document.createElement("option");
            opcao.value = cartao.id;
            opcao.textContent = cartao.nome;
            campoCartaoPagamento.appendChild(opcao);
        });
    }

    function popularSelectCategorias(categoriaAtual) {
        campoCategoria.innerHTML = "";

        // Categorias fixas (Outros, etc.) — nunca têm lixeira
        CATEGORIAS_PADRAO[tipoSelecionado].forEach((nomeCategoria) => {
            const opcao = document.createElement("option");
            opcao.value = nomeCategoria;
            opcao.textContent = nomeCategoria;
            campoCategoria.appendChild(opcao);
        });

        // Categorias criadas pela pessoa — essas sim podem ser excluídas
        categoriasCustomizadas[tipoSelecionado].forEach((categoria) => {
            const opcao = document.createElement("option");
            opcao.value = categoria.nome;
            opcao.textContent = categoria.nome;
            opcao.dataset.customizada = "true";
            opcao.dataset.categoriaId = categoria.id;
            campoCategoria.appendChild(opcao);
        });

        // Se a categoria do item sendo editado não estiver em nenhuma lista
        // (ex: já foi excluída depois), adiciona ela também, senão o select
        // perde o valor e some silenciosamente
        const todasAsOpcoes = [...campoCategoria.options].map((opcao) => opcao.value);
        if (categoriaAtual && !todasAsOpcoes.includes(categoriaAtual)) {
            const opcao = document.createElement("option");
            opcao.value = categoriaAtual;
            opcao.textContent = categoriaAtual;
            campoCategoria.appendChild(opcao);
        }

        const opcaoNova = document.createElement("option");
        opcaoNova.value = "__nova__";
        opcaoNova.textContent = "+ Nova categoria";
        campoCategoria.appendChild(opcaoNova);

        if (categoriaAtual) campoCategoria.value = categoriaAtual;
        atualizarBotaoExcluirCategoria();
    }

    // Reaproveita o mesmo select da categoria, só que com as metas de
    // "Guardar" no lugar — não tem categorias "fixas" aqui, só as criadas
    function popularSelectMetas() {
        campoCategoria.innerHTML = "";

        const opcaoSemMeta = document.createElement("option");
        opcaoSemMeta.value = "__sem_meta__";
        opcaoSemMeta.textContent = "Sem meta específica";
        campoCategoria.appendChild(opcaoSemMeta);

        metasCustomizadas.forEach((meta) => {
            const opcao = document.createElement("option");
            opcao.value = meta.nome;
            opcao.textContent = meta.nome;
            campoCategoria.appendChild(opcao);
        });

        const opcaoNova = document.createElement("option");
        opcaoNova.value = "__nova__";
        opcaoNova.textContent = "+ Nova meta";
        campoCategoria.appendChild(opcaoNova);
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

        bancosCustomizados.forEach((banco) => {
            const opcao = document.createElement("option");
            opcao.value = banco.nome;
            opcao.textContent = banco.nome;
            selectAlvo.appendChild(opcao);
        });
    }

    // Mostra a lixeira e o lápis só quando a categoria selecionada no momento
    // for uma que a própria pessoa criou (nunca nas fixas, tipo "Outros")
    function atualizarBotaoExcluirCategoria() {
        const opcaoSelecionada = campoCategoria.options[campoCategoria.selectedIndex];
        const ehCustomizada = opcaoSelecionada && opcaoSelecionada.dataset.customizada === "true";
        botaoExcluirCategoria.hidden = !ehCustomizada;
        botaoEditarCategoria.hidden = !ehCustomizada;
    }

    campoCategoria.addEventListener("change", () => {
        const criandoNova = campoCategoria.value === "__nova__";
        campoNovaCategoriaWrapper.hidden = !criandoNova;
        campoNovaCategoria.required = criandoNova;
        // Vencimento da categoria só aparece aqui quando Fixo/Parcelado NÃO
        // estão marcados — se estiverem, o vencimento já é perguntado uma
        // vez só ali embaixo (nos checkboxes), pra não duplicar a pergunta
        const jaPerguntaVencimentoAliBaixo = campoFixo.checked || campoParcelado.checked;
        campoVencimentoNovaCategoriaWrapper.hidden = !criandoNova || tipoSelecionado !== "gasto" || jaPerguntaVencimentoAliBaixo;
        atualizarBotaoExcluirCategoria();
    });

    botaoExcluirCategoria.addEventListener("click", async () => {
        const opcaoSelecionada = campoCategoria.options[campoCategoria.selectedIndex];
        if (!opcaoSelecionada || opcaoSelecionada.dataset.customizada !== "true") return;

        const confirmou = await confirmarComTelinha(`Tem certeza de que deseja excluir a categoria "${opcaoSelecionada.value}"? Lançamentos antigos que usam ela continuam salvos normalmente no extrato.`);
        if (!confirmou) return;

        const categoriaId = opcaoSelecionada.dataset.categoriaId;
        await deleteDoc(doc(db, "usuarios", uidAtual, "categorias", categoriaId));

        categoriasCustomizadas[tipoSelecionado] = categoriasCustomizadas[tipoSelecionado].filter((c) => c.id !== categoriaId);
        popularSelectCategorias();
        campoCategoria.value = "Outros";
        atualizarBotaoExcluirCategoria();
    });

    // ==========================================================================
    // EDITAR CATEGORIA — nome e limite mensal, no mesmo lugar em que a
    // categoria é usada (lápis ao lado do select, dentro do formulário)
    // ==========================================================================
    let categoriaEmEdicaoId = null;
    let categoriaEmEdicaoNomeAntigo = null;

    botaoEditarCategoria.addEventListener("click", async () => {
        const opcaoSelecionada = campoCategoria.options[campoCategoria.selectedIndex];
        if (!opcaoSelecionada || opcaoSelecionada.dataset.customizada !== "true") return;

        categoriaEmEdicaoId = opcaoSelecionada.dataset.categoriaId;
        categoriaEmEdicaoNomeAntigo = opcaoSelecionada.value;

        campoNovoNomeCategoria.value = categoriaEmEdicaoNomeAntigo;
        const limiteExistente = mapaOrcamentos[categoriaEmEdicaoNomeAntigo];
        campoLimiteCategoria.value = limiteExistente ? limiteExistente.toFixed(2).replace(".", ",") : "";
        mensagemAvisoEditarCategoria.classList.remove("visivel");

        // "Limite mensal" e "Vencimento" só fazem sentido pra categorias de
        // Gasto (não existe "limite"/"vencimento" pra Ganho/Extra)
        const ehGasto = tipoSelecionado === "gasto";
        campoLimiteCategoriaWrapper.hidden = !ehGasto;
        campoVencimentoCategoriaWrapper.hidden = !ehGasto;

        if (ehGasto) {
            // Busca o vencimento atual guardado na própria categoria
            const snapshotCategoria = await getDoc(doc(db, "usuarios", uidAtual, "categorias", categoriaEmEdicaoId));
            const vencimentoAtual = snapshotCategoria.exists() ? snapshotCategoria.data().diaVencimento : null;
            campoVencimentoCategoria.value = vencimentoAtual || "";
            textoAvisoVencimento.hidden = false;
        }

        fundoModalEditarCategoria.classList.add("aberto");
    });

    function fecharModalEditarCategoria() {
        fundoModalEditarCategoria.classList.remove("aberto");
    }

    botaoFecharEditarCategoria.addEventListener("click", fecharModalEditarCategoria);
    fundoModalEditarCategoria.addEventListener("click", (evento) => {
        if (evento.target === fundoModalEditarCategoria) fecharModalEditarCategoria();
    });

    botaoSalvarEditarCategoria.addEventListener("click", async () => {
        const novoNome = campoNovoNomeCategoria.value.trim();
        const novoLimite = paraNumero(campoLimiteCategoria.value);
        mensagemAvisoEditarCategoria.classList.remove("visivel");

        if (!novoNome) {
            mensagemAvisoEditarCategoria.textContent = "Digita um nome pra categoria.";
            mensagemAvisoEditarCategoria.classList.add("visivel");
            return;
        }

        botaoSalvarEditarCategoria.disabled = true;
        spinnerEditarCategoria.hidden = false;

        try {
            const nomeMudou = novoNome !== categoriaEmEdicaoNomeAntigo;

            if (nomeMudou) {
                // 1) Atualiza o nome no documento da própria categoria
                await updateDoc(doc(db, "usuarios", uidAtual, "categorias", categoriaEmEdicaoId), {
                    nome: novoNome
                });

                // 2) Atualiza TODOS os lançamentos antigos que usavam o nome
                // velho, pra manter o histórico consistente (decisão já
                // combinada: atualizar tudo, não deixar "misturado")
                const referenciaLancamentos = collection(db, "usuarios", uidAtual, "lancamentos");
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
                const referenciaPendencias = collection(db, "usuarios", uidAtual, "pendencias");
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
                if (tipoSelecionado === "gasto" && mapaOrcamentos[categoriaEmEdicaoNomeAntigo] !== undefined) {
                    await deleteDoc(doc(db, "usuarios", uidAtual, "orcamentos", categoriaEmEdicaoNomeAntigo)).catch(() => {});
                    delete mapaOrcamentos[categoriaEmEdicaoNomeAntigo];
                }
            }

            // Salva (ou remove) o limite mensal, só faz sentido pro lado Gasto
            if (tipoSelecionado === "gasto") {
                const referenciaOrcamento = doc(db, "usuarios", uidAtual, "orcamentos", novoNome);
                if (!novoLimite || novoLimite <= 0) {
                    await deleteDoc(referenciaOrcamento).catch(() => {});
                    delete mapaOrcamentos[novoNome];
                } else {
                    await setDoc(referenciaOrcamento, { categoria: novoNome, limite: novoLimite });
                    mapaOrcamentos[novoNome] = novoLimite;
                }

                // Salva o vencimento na própria categoria, e propaga pra todas
                // as pendências AINDA NÃO PAGAS dessa categoria — assim, se
                // você errou o dia na hora de criar, não precisa apagar e
                // recriar o gasto fixo/parcelamento inteiro, só corrigir aqui
                const novoVencimento = parseInt(campoVencimentoCategoria.value, 10) || null;
                await updateDoc(doc(db, "usuarios", uidAtual, "categorias", categoriaEmEdicaoId), {
                    diaVencimento: novoVencimento
                });

                if (novoVencimento) {
                    const referenciaPendenciasVencimento = collection(db, "usuarios", uidAtual, "pendencias");
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
            const categoriaLocal = categoriasCustomizadas[tipoSelecionado].find((c) => c.id === categoriaEmEdicaoId);
            if (categoriaLocal) categoriaLocal.nome = novoNome;

            popularSelectCategorias();
            campoCategoria.value = novoNome;
            atualizarBotaoExcluirCategoria();

            fecharModalEditarCategoria();

        } catch (erro) {
            mensagemAvisoEditarCategoria.textContent = "Não deu pra salvar agora. Confere sua internet e tenta de novo.";
            mensagemAvisoEditarCategoria.classList.add("visivel");
        } finally {
            botaoSalvarEditarCategoria.disabled = false;
            spinnerEditarCategoria.hidden = true;
        }
    });

    // ==========================================================================
    // 7. MODAL — ABRIR PARA CRIAR
    // ==========================================================================
    function abrirModalNovo() {
        idEmEdicao = null;
        dadosOriginaisEmEdicao = null;
        modoGuardar = false;
        tituloModal.textContent = "Novo lançamento";
        textoBotaoSalvar.textContent = "Salvar lançamento";

        etapaEscolha.hidden = false;
        formulario.hidden = true;
        formulario.reset();
        esconderAviso();
        campoCategoriaWrapper.hidden = false;
        campoCategoria.required = true;
        campoNovaCategoriaWrapper.hidden = true;
        campoVencimentoNovaCategoriaWrapper.hidden = true;
        campoNovaCategoria.required = false; // sem isso, ficava "grudado" de uma vez que criou categoria nova antes
        campoParcelasWrapper.hidden = true;
        campoParcelas.required = false; // mesmo problema, grudava depois de usar "Parcelar" uma vez
        campoVencimentoLancamentoWrapper.hidden = true;
        campoVencimentoLancamento.required = false;
        campoVencimentoLancamento.value = "";
        campoBancoOrigemWrapper.hidden = true;
        campoBancoOrigem.required = false;
        campoBancoWrapper.hidden = true;
        campoBanco.required = false;
        campoChavePixWrapper.hidden = true;
        campoChavePix.value = "";
        campoFixo.checked = false;
        campoFixo.disabled = false;
        campoParcelado.checked = false;
        campoParcelado.disabled = false;
        previewParcela.hidden = true;

        perguntaEscolha.textContent = primeiroNome
            ? `${primeiroNome}, deseja registrar um:`
            : "Deseja registrar um:";

        fundoModal.classList.add("aberto");
    }

    // ==========================================================================
    // MODAL — ABRIR PARA EDITAR (a partir de um clique num item da lista)
    // ==========================================================================
    function abrirModalEdicao(idLancamento, dados) {
        idEmEdicao = idLancamento;
        dadosOriginaisEmEdicao = dados;
        // Só o DEPÓSITO do Guardar (valor positivo) é editável com campos
        // próprios — a Retirada usa 2 lançamentos ligados, editar os dois
        // de forma consistente é um caso mais complexo, fica de fora por
        // enquanto (continua editável só por valor/descrição/data)
        const ehGuardarDeposito = dados.categoria === "Guardar Dinheiro" && dados.valor > 0;
        modoGuardar = ehGuardarDeposito;
        tituloModal.textContent = "Editar lançamento";
        textoBotaoSalvar.textContent = "Salvar alterações";

        tipoSelecionado = dados.tipo;
        etapaEscolha.hidden = true;
        formulario.hidden = false;
        esconderAviso();

        botaoTrocarTipo.hidden = true; // não dá pra trocar o tipo de um lançamento já existente
        rotuloValor.textContent = "Valor";
        opcoesEspeciaisGasto.hidden = true; // editar não deve gerar novas parcelas/repetições
        campoCategoriaWrapper.hidden = false;
        campoCategoria.required = true;
        campoNovaCategoriaWrapper.hidden = true;
        campoVencimentoNovaCategoriaWrapper.hidden = true;
        campoNovaCategoria.required = false;
        campoParcelas.required = false;

        campoValor.value = dados.valor.toFixed(2).replace(".", ",");
        campoDescricao.value = dados.descricao || "";
        campoDescricaoWrapper.hidden = false; // editar sempre mostra a descrição, mesmo pra Guardar
        campoData.value = formatarDataParaCampo(dados.data.toDate());

        if (ehGuardarDeposito) {
            rotuloCategoria.textContent = "Meta";
            popularSelectMetas();
            campoCategoria.value = dados.meta || "__sem_meta__";

            campoBancoOrigemWrapper.hidden = false;
            campoBancoOrigem.required = true;
            popularSelectBancoGenerico(campoBancoOrigem);
            campoBancoOrigem.value = dados.bancoOrigem || "__sem_banco__";

            campoBancoWrapper.hidden = false;
            campoBanco.required = true;
            popularSelectBancoGenerico(campoBanco);
            campoBanco.value = dados.banco || "__sem_banco__";
        } else {
            rotuloCategoria.textContent = "Categoria";
            popularSelectCategorias(dados.categoria);
            campoBancoOrigemWrapper.hidden = true;
            campoBancoOrigem.required = false;
            campoBancoWrapper.hidden = true;
            campoBanco.required = false;
        }

        // Forma de pagamento/banco só entram na edição pra Gasto e Extra
        // "normais" — Guardar já tem seus próprios campos (acima), e a
        // Fatura do Cartão é um agregado especial que não faz sentido
        // reclassificar por aqui
        const ehCategoriaEspecial = dados.categoria === "Guardar Dinheiro" || dados.categoria === "Retirada da Reserva" || dados.categoria === "Fatura do Cartão";
        campoFormaPagamentoWrapper.hidden = true;
        campoFormaPagamento.required = false;
        campoBancoPagamentoWrapper.hidden = true;
        campoBancoPagamento.required = false;
        campoCartaoPagamentoWrapper.hidden = true;
        campoCartaoPagamento.required = false;

        if (!ehCategoriaEspecial && dados.tipo === "gasto") {
            campoFormaPagamentoWrapper.hidden = false;
            campoFormaPagamento.required = true;
            // Não oferece "Crédito" na edição — compras no crédito têm um
            // fluxo próprio (viram pendência, depois fatura), não faz
            // sentido reclassificar um lançamento já feito pra lá
            Array.from(campoFormaPagamento.options).forEach((opcao) => {
                opcao.hidden = opcao.value === "credito";
            });
            campoFormaPagamento.value = dados.formaPagamento || "";

            if (dados.formaPagamento === "pix" || dados.formaPagamento === "debito") {
                rotuloBancoPagamento.textContent = "De qual banco";
                popularSelectBancoGenerico(campoBancoPagamento);
                campoBancoPagamentoWrapper.hidden = false;
                campoBancoPagamento.required = true;
                campoBancoPagamento.value = dados.banco || "__sem_banco__";
            }
        } else if (!ehCategoriaEspecial && dados.tipo === "ganho") {
            rotuloBancoPagamento.textContent = "Em qual banco entrou";
            popularSelectBancoPagamento();
            campoBancoPagamentoWrapper.hidden = false;
            campoBancoPagamento.required = true;
            campoBancoPagamento.value = dados.banco || "";
        }

        fundoModal.classList.add("aberto");
    }

    function fecharModal() {
        fundoModal.classList.remove("aberto");
        botaoTrocarTipo.hidden = false;
    }

    function irParaFormulario(tipoClicado) {
        // "guardar" não é um tipo de lançamento de verdade — por baixo dos
        // panos ele é um "ganho" com categoria fixa "Guardar Dinheiro".
        // "extra" também é só o nome do botão — internamente é "ganho" também.
        modoGuardar = tipoClicado === "guardar";
        tipoSelecionado = tipoClicado === "gasto" ? "gasto" : "ganho";

        etapaEscolha.hidden = true;
        formulario.hidden = false;

        const rotulosBotaoTrocar = {
            gasto: "← Gasto (trocar)",
            extra: `← ${botaoEscolhaExtra.textContent} (trocar)`,
            guardar: "← Guardar (trocar)"
        };
        botaoTrocarTipo.textContent = rotulosBotaoTrocar[tipoClicado];
        rotuloValor.textContent = "Valor";
        opcoesEspeciaisGasto.hidden = tipoClicado !== "gasto";

        // Forma de pagamento só existe em Gasto. Extra não pergunta "forma"
        // (não faz sentido pra quem tá recebendo) — pergunta só "em qual
        // banco entrou", direto, reaproveitando o mesmo campo de banco.
        // Reexibe "Crédito" caso tenha ficado escondido de uma edição
        // anterior (lá, ela não aparece de propósito)
        Array.from(campoFormaPagamento.options).forEach((opcao) => { opcao.hidden = false; });
        campoFormaPagamentoWrapper.hidden = tipoClicado !== "gasto";
        campoFormaPagamento.required = tipoClicado === "gasto";
        campoFormaPagamento.value = "";
        campoBancoPagamentoWrapper.hidden = true;
        campoBancoPagamento.required = false;
        campoCartaoPagamentoWrapper.hidden = true;
        campoCartaoPagamento.required = false;

        if (tipoClicado === "extra") {
            rotuloBancoPagamento.textContent = "Em qual banco entrou";
            campoBancoPagamentoWrapper.hidden = false;
            campoBancoPagamento.required = true;
            popularSelectBancoPagamento();
        }

        // No modo Guardar, o campo vira "Meta" em vez de "Categoria" —
        // reaproveita o mesmo select, só troca o rótulo e o conteúdo.
        // Importante: precisa desligar o "required" quando o campo tá
        // escondido (isso não acontece mais aqui, mas o padrão se mantém
        // por segurança), senão o navegador bloqueia o envio do formulário
        campoCategoriaWrapper.hidden = false;
        campoCategoria.required = true;
        campoNovaCategoriaWrapper.hidden = true;
        campoVencimentoNovaCategoriaWrapper.hidden = true;
        botaoExcluirCategoria.hidden = true;
        botaoEditarCategoria.hidden = true;

        if (modoGuardar) {
            rotuloCategoria.textContent = "Meta";
            rotuloNovaCategoria.textContent = "Nome da nova meta";
            popularSelectMetas();
        } else {
            rotuloCategoria.textContent = "Categoria";
            rotuloNovaCategoria.textContent = "Nome da nova categoria";
            popularSelectCategorias();
        }

        // Os campos de banco só aparecem no modo Guardar, junto com a Meta —
        // "De qual banco sai" e "Para qual banco vai" representam a
        // transferência de verdade entre bancos (ou dentro do mesmo banco,
        // se a pessoa só quer separar mentalmente, sem mover de verdade)
        campoBancoOrigemWrapper.hidden = !modoGuardar;
        campoBancoOrigem.required = modoGuardar;
        campoBancoWrapper.hidden = !modoGuardar;
        campoBanco.required = modoGuardar;
        if (modoGuardar) {
            popularSelectBancoGenerico(campoBancoOrigem);
            popularSelectBancoGenerico(campoBanco);
        }

        campoDescricaoWrapper.hidden = modoGuardar;
        campoDescricao.required = false;

        // A data padrão é sempre a de hoje de verdade — não importa qual mês
        // você esteja navegando na tela. Se quiser lançar em outra data,
        // você troca manualmente no campo, e o app respeita exatamente o
        // que for escolhido ali.
        const hoje = new Date();
        campoData.value = formatarDataParaCampo(hoje);
        campoValor.focus();
    }

    // Formata pro padrão AAAA-MM-DD que o input[type=date] espera, usando o
    // horário LOCAL do aparelho (evita o bug clássico de virar o dia errado
    // perto da meia-noite, que aconteceria usando toISOString diretamente
    // em fusos negativos como o do Brasil)
    function formatarDataParaCampo(data) {
        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, "0");
        const dia = String(data.getDate()).padStart(2, "0");
        return `${ano}-${mes}-${dia}`;
    }

    // Formata pro padrão "AAAA-MM" — usado no campo "mesReferencia", que
    // decide EM QUAL MÊS um lançamento conta (separado da data exibida nele)
    function mesReferenciaString(data) {
        return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
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

    // As duas funções abaixo são cópias das mesmas de cartao.js — o
    // resumo "Fatura Cartões de Crédito" da tela inicial PRECISA concordar
    // com o que a tela do Cartão mostra, então usa exatamente a mesma
    // lógica de fechamento (nada de comparar "mesReferencia" com o mês
    // sendo navegado no calendário, que são conceitos diferentes — ver
    // comentário em escutarResumoFaturaCartoes mais abaixo)
    function dataDeFechamento(mesReferenciaFatura, diaFechamento) {
        const [ano, mes] = mesReferenciaFatura.split("-").map(Number);
        const ultimoDiaDoMes = new Date(ano, mes, 0).getDate();
        const diaFinal = Math.min(diaFechamento, ultimoDiaDoMes);
        return new Date(ano, mes - 1, diaFinal);
    }

    function faturaJaFechou(mesReferenciaFatura, diaFechamento) {
        const hoje = new Date();
        const hojeSoData = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
        return hojeSoData >= dataDeFechamento(mesReferenciaFatura, diaFechamento);
    }

    atalhoHoje.addEventListener("click", () => {
        campoData.value = formatarDataParaCampo(new Date());
    });

    atalhoOntem.addEventListener("click", () => {
        const ontem = new Date();
        ontem.setDate(ontem.getDate() - 1);
        campoData.value = formatarDataParaCampo(ontem);
    });

    botoesEscolha.forEach((botao) => {
        botao.addEventListener("click", () => irParaFormulario(botao.dataset.tipo));
    });

    botaoTrocarTipo.addEventListener("click", () => {
        etapaEscolha.hidden = false;
        formulario.hidden = true;
    });

    botaoAbrirModal.addEventListener("click", abrirModalNovo);
    botaoFecharModal.addEventListener("click", fecharModal);

    fundoModal.addEventListener("click", (evento) => {
        if (evento.target === fundoModal) fecharModal();
    });

    campoFormaPagamento.addEventListener("change", () => {
        const formaEscolhida = campoFormaPagamento.value;
        rotuloBancoPagamento.textContent = "De qual banco";

        if (formaEscolhida === "pix" || formaEscolhida === "debito") {
            campoBancoPagamentoWrapper.hidden = false;
            campoBancoPagamento.required = true;
            campoCartaoPagamentoWrapper.hidden = true;
            campoCartaoPagamento.required = false;
            popularSelectBancoPagamento();
        } else if (formaEscolhida === "credito") {
            campoBancoPagamentoWrapper.hidden = true;
            campoBancoPagamento.required = false;
            campoCartaoPagamentoWrapper.hidden = false;
            campoCartaoPagamento.required = true;
            popularSelectCartaoPagamento();
        } else {
            // Dinheiro — nenhum dos dois é perguntado
            campoBancoPagamentoWrapper.hidden = true;
            campoBancoPagamento.required = false;
            campoCartaoPagamentoWrapper.hidden = true;
            campoCartaoPagamento.required = false;
        }

        // O campo de vencimento manual depende de saber se é Crédito ou
        // não (Crédito usa o vencimento do próprio cartão)
        atualizarVisibilidadeParcelas();
    });

    campoFixo.addEventListener("change", () => {
        if (campoFixo.checked) campoParcelado.checked = false;
        atualizarVisibilidadeParcelas();
    });

    campoParcelado.addEventListener("change", () => {
        if (campoParcelado.checked) campoFixo.checked = false;
        atualizarVisibilidadeParcelas();
    });

    function atualizarVisibilidadeParcelas() {
        const parcelando = campoParcelado.checked;
        campoParcelasWrapper.hidden = !parcelando;
        campoParcelas.required = parcelando;
        rotuloValor.textContent = parcelando ? "Valor total da compra" : "Valor";
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
        const noCredito = campoFormaPagamento.value === "credito";
        const precisaVencimento = (campoFixo.checked || campoParcelado.checked) && !noCredito;
        campoVencimentoLancamentoWrapper.hidden = !precisaVencimento;
        campoVencimentoLancamento.required = precisaVencimento;

        if (campoFixo.checked) {
            slotVencimentoFixo.appendChild(campoVencimentoLancamentoWrapper);
        } else if (campoParcelado.checked) {
            slotVencimentoParcelado.appendChild(campoVencimentoLancamentoWrapper);
        }

        if (precisaVencimento && !campoVencimentoLancamento.value) {
            const dataAtual = campoData.value ? new Date(campoData.value + "T00:00:00") : new Date();
            campoVencimentoLancamento.value = dataAtual.getDate();
        }

        // Se a categoria nova já estava com o campo de vencimento visível,
        // esconde ele agora que Fixo/Parcelado já pergunta isso ali embaixo
        // (evita perguntar o mesmo dia duas vezes, em lugares diferentes)
        if (precisaVencimento) campoVencimentoNovaCategoriaWrapper.hidden = true;

        // Chave PIX de quem recebe — só faz sentido pra Fixo/Parcelado
        // pagos via PIX especificamente (não em Débito, não em Crédito,
        // que usam a chave do próprio cartão/banco, não de terceiros)
        const mostrarChavePix = (campoFixo.checked || campoParcelado.checked) && campoFormaPagamento.value === "pix";
        campoChavePixWrapper.hidden = !mostrarChavePix;
    }

    // Mostra "= 6x de R$ 8,33" em tempo real, assim que a pessoa digita o
    // valor total e o número de parcelas — evita confusão tipo "coloquei 50
    // e apareceu 8,33" (o app está certo, só faltava deixar isso visível antes)
    function atualizarPreviewParcela() {
        if (!campoParcelado.checked) {
            previewParcela.hidden = true;
            return;
        }

        const total = paraNumero(campoValor.value);
        const numeroParcelas = parseInt(campoParcelas.value, 10);

        if (!total || total <= 0 || !numeroParcelas || numeroParcelas < 2) {
            previewParcela.hidden = true;
            return;
        }

        const valorPorParcela = total / numeroParcelas;
        previewParcela.textContent = `= ${numeroParcelas}x de ${formatarMoeda(valorPorParcela)}`;
        previewParcela.hidden = false;
    }

    campoValor.addEventListener("input", atualizarPreviewParcela);
    campoParcelas.addEventListener("input", atualizarPreviewParcela);

    // ==========================================================================
    // 8. MENSAGENS DE AVISO
    // ==========================================================================
    function mostrarAviso(texto) {
        mensagemAviso.textContent = texto;
        mensagemAviso.classList.add("visivel");
    }

    function esconderAviso() {
        mensagemAviso.classList.remove("visivel");
    }

    function definirCarregando(carregando) {
        botaoSalvar.disabled = carregando;
        spinnerSalvar.hidden = !carregando;
        textoBotaoSalvar.style.opacity = carregando ? "0.7" : "1";
    }

    // Junta a data escolhida no calendário com o horário real de agora —
    // resolve dois pontos ao mesmo tempo: mostra a que horas a pessoa
    // realmente registrou aquilo, e faz lançamentos ficarem ordenados
    // certinho (do mais recente pro mais antigo), com precisão até o
    // milissegundo — sem isso, dois lançamentos no mesmo minuto "empatavam"
    // e a ordem entre eles ficava meio aleatória
    function construirDataComHorarioReal(dataDoCampo) {
        const agora = new Date();
        const [ano, mes, dia] = dataDoCampo.split("-").map(Number);
        return new Date(ano, mes - 1, dia, agora.getHours(), agora.getMinutes(), agora.getSeconds(), agora.getMilliseconds());
    }

    // ==========================================================================
    // 9. SALVAR (criar novo, ou editar um existente)
    // ==========================================================================
    formulario.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        esconderAviso();

        const valorDigitado = paraNumero(campoValor.value);
        if (!valorDigitado || valorDigitado <= 0) {
            mostrarAviso("Digita um valor maior que zero.");
            return;
        }

        // Compara em centavos (números inteiros), mesmo motivo da correção
        // na tela de Saldo Guardado — evita erro de ponto flutuante
        if (modoGuardar && Math.round(valorDigitado * 100) > Math.round(saldoExibidoETravado * 100)) {
            mostrarAviso(`Esse valor é maior do que o seu saldo atual (${formatarMoeda(saldoExibidoETravado)}). Não dá pra guardar mais do que você tem.`);
            return;
        }

        let categoriaFinal = campoCategoria.value;
        let metaFinal = null;
        let bancoFinal = null;
        let bancoOrigemFinal = null;

        if (modoGuardar) {
            if (categoriaFinal === "__nova__") {
                const novaMeta = campoNovaCategoria.value.trim();
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

            bancoFinal = campoBanco.value === "__sem_banco__" ? null : campoBanco.value;
            bancoOrigemFinal = campoBancoOrigem.value === "__sem_banco__" ? null : campoBancoOrigem.value;

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
                const bancoOrigemDoc = bancosCustomizados.find((b) => b.nome === bancoOrigemFinal);
                if (bancoOrigemDoc) {
                    const snapshotOrigem = await getDoc(doc(db, "usuarios", uidAtual, "bancos", bancoOrigemDoc.id));
                    const saldoInicialOrigem = snapshotOrigem.exists() ? (snapshotOrigem.data().saldoInicial || 0) : 0;
                    let saldoRealOrigem = await calcularSaldoBancoAgora(bancoOrigemFinal, saldoInicialOrigem);

                    // Se estamos EDITANDO uma transferência que já tinha
                    // esse MESMO banco como origem, "devolve" o valor
                    // antigo antes de checar — senão o próprio efeito
                    // dessa transação (já contado no saldo atual) barraria
                    // uma edição que só corrige um detalhe, tipo a
                    // descrição, sem de fato mudar o valor
                    if (idEmEdicao && dadosOriginaisEmEdicao && dadosOriginaisEmEdicao.bancoOrigem === bancoOrigemFinal) {
                        saldoRealOrigem += dadosOriginaisEmEdicao.valor;
                    }

                    if (Math.round(valorDigitado * 100) > Math.round(saldoRealOrigem * 100)) {
                        mostrarAviso(`O ${bancoOrigemFinal} só tem ${formatarMoeda(saldoRealOrigem)} — não dá pra guardar mais do que isso de lá.`);
                        return;
                    }
                }
            }
        } else if (categoriaFinal === "__nova__") {
            const nomeNovaCategoria = campoNovaCategoria.value.trim();
            if (!nomeNovaCategoria) {
                mostrarAviso("Digita o nome da nova categoria.");
                return;
            }
            categoriaFinal = nomeNovaCategoria;
        }

        // ---- Fluxo de EDIÇÃO ----
        if (idEmEdicao) {
            const confirmou = await confirmarComTelinha("Tem certeza de que deseja salvar as alterações deste lançamento?");
            if (!confirmou) return;

            definirCarregando(true);
            try {
                if (campoCategoria.value === "__nova__" && !modoGuardar) {
                    const vencimentoNovaCategoria = parseInt(campoVencimentoNovaCategoria.value, 10) || null;
                    const referenciaCategoria = await addDoc(collection(db, "usuarios", uidAtual, "categorias"), {
                        nome: categoriaFinal,
                        tipo: tipoSelecionado,
                        diaVencimento: vencimentoNovaCategoria
                    });
                    categoriasCustomizadas[tipoSelecionado].push({ nome: categoriaFinal, id: referenciaCategoria.id });
                }

                if (modoGuardar && campoCategoria.value === "__nova__") {
                    const referenciaMeta = await addDoc(collection(db, "usuarios", uidAtual, "metas"), {
                        nome: metaFinal
                    });
                    metasCustomizadas.push({ nome: metaFinal, id: referenciaMeta.id });
                }

                const dadosAtualizados = {
                    valor: valorDigitado,
                    categoria: categoriaFinal,
                    descricao: campoDescricao.value.trim(),
                    data: Timestamp.fromDate(construirDataComHorarioReal(campoData.value))
                };

                // Guardar tem seus próprios campos (Meta + os 2 bancos da
                // transferência) — diferente de Gasto/Extra, que usam
                // forma de pagamento/banco
                if (modoGuardar) {
                    dadosAtualizados.meta = metaFinal;
                    dadosAtualizados.banco = bancoFinal;
                    dadosAtualizados.bancoOrigem = bancoOrigemFinal;
                } else if (!campoFormaPagamentoWrapper.hidden) {
                    dadosAtualizados.formaPagamento = campoFormaPagamento.value;
                    dadosAtualizados.banco = (campoFormaPagamento.value === "pix" || campoFormaPagamento.value === "debito")
                        ? (campoBancoPagamento.value === "__sem_banco__" ? null : campoBancoPagamento.value)
                        : null;
                } else if (!campoBancoPagamentoWrapper.hidden) {
                    dadosAtualizados.banco = campoBancoPagamento.value || null;
                }

                await updateDoc(doc(db, "usuarios", uidAtual, "lancamentos", idEmEdicao), dadosAtualizados);

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
        const ehParcelado = tipoSelecionado === "gasto" && campoParcelado.checked;
        const numeroParcelas = ehParcelado ? parseInt(campoParcelas.value, 10) : 1;
        const noCartaoCredito = tipoSelecionado === "gasto" && !modoGuardar && campoFormaPagamento.value === "credito";
        const cartaoEscolhidoId = noCartaoCredito ? campoCartaoPagamento.value : null;

        if (ehParcelado && (!numeroParcelas || numeroParcelas < 2)) {
            mostrarAviso("Informa um número de parcelas válido (mínimo 2).");
            return;
        }

        // Se for Gasto Fixo ou Parcelado, confere se já não existe um parecido
        // (mesma descrição/categoria) — evita duplicar por esquecimento
        if (ehParcelado || campoFixo.checked) {
            const origemNova = ehParcelado ? "parcelado" : "fixo";
            const descricaoNova = (campoDescricao.value.trim() || categoriaFinal).toLowerCase();

            const referenciaPendenciasExistentes = collection(db, "usuarios", uidAtual, "pendencias");
            const consultaOrigem = query(referenciaPendenciasExistentes, where("origem", "==", origemNova));
            const resultadoExistentes = await getDocs(consultaOrigem);

            const jaExisteParecido = resultadoExistentes.docs.some((documento) => {
                const dadosExistente = documento.data();
                const descricaoExistente = (dadosExistente.descricao || dadosExistente.categoria || "").toLowerCase();
                return descricaoExistente === descricaoNova;
            });

            if (jaExisteParecido) {
                const tipoTexto = ehParcelado ? "parcelamento" : "gasto fixo";
                const nomeParaMensagem = campoDescricao.value.trim() || categoriaFinal;
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
        if (!ehParcelado && !campoFixo.checked && !noCartaoCredito && !modoGuardar) {
            const dataParaChecarDuplicado = construirDataComHorarioReal(campoData.value);
            const consultaDuplicado = query(
                collection(db, "usuarios", uidAtual, "lancamentos"),
                where("mesReferencia", "==", mesReferenciaString(mesSelecionado)),
                where("valor", "==", valorDigitado),
                where("tipo", "==", tipoSelecionado)
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
            if (campoCategoria.value === "__nova__" && !modoGuardar) {
                // Se for Fixo/Parcelado, usa o mesmo vencimento já perguntado
                // ali embaixo (não pergunta de novo, os dois ficam sincronizados).
                // No Crédito, esse campo fica escondido (usa o vencimento do
                // próprio cartão) — busca ele ali, em vez do campo vazio.
                const usandoFixoOuParcelado = campoFixo.checked || campoParcelado.checked;
                let vencimentoNovaCategoria;
                if (noCartaoCredito) {
                    const cartaoEscolhidoParaCategoria = cartoesCustomizados.find((c) => c.id === cartaoEscolhidoId);
                    vencimentoNovaCategoria = (cartaoEscolhidoParaCategoria && cartaoEscolhidoParaCategoria.diaVencimento) || null;
                } else if (usandoFixoOuParcelado) {
                    vencimentoNovaCategoria = parseInt(campoVencimentoLancamento.value, 10) || null;
                } else {
                    vencimentoNovaCategoria = parseInt(campoVencimentoNovaCategoria.value, 10) || null;
                }
                const referenciaCategoria = await addDoc(collection(db, "usuarios", uidAtual, "categorias"), {
                    nome: categoriaFinal,
                    tipo: tipoSelecionado,
                    diaVencimento: vencimentoNovaCategoria
                });
                categoriasCustomizadas[tipoSelecionado].push({ nome: categoriaFinal, id: referenciaCategoria.id });
            }

            if (modoGuardar && campoCategoria.value === "__nova__") {
                const referenciaMeta = await addDoc(collection(db, "usuarios", uidAtual, "metas"), {
                    nome: metaFinal
                });
                metasCustomizadas.push({ nome: metaFinal, id: referenciaMeta.id });
            }

            const dataEscolhida = construirDataComHorarioReal(campoData.value);
            const descricaoBase = campoDescricao.value.trim();
            let mesDaFaturaCredito = null;

            if (noCartaoCredito) {
                mesDaFaturaCredito = await salvarNoCartao(valorDigitado, categoriaFinal, descricaoBase, cartaoEscolhidoId, campoFixo.checked, ehParcelado, numeroParcelas);
            } else if (ehParcelado) {
                await salvarParcelado(valorDigitado, numeroParcelas, categoriaFinal, descricaoBase, dataEscolhida, parseInt(campoVencimentoLancamento.value, 10), campoFormaPagamento.value, campoBancoPagamento.value, campoChavePix.value.trim());
            } else if (campoFixo.checked) {
                await salvarFixo(valorDigitado, categoriaFinal, descricaoBase, dataEscolhida, parseInt(campoVencimentoLancamento.value, 10), campoFormaPagamento.value, campoBancoPagamento.value, campoChavePix.value.trim());
            } else {
                const dadosLancamento = {
                    tipo: tipoSelecionado,
                    valor: valorDigitado,
                    categoria: categoriaFinal,
                    descricao: descricaoBase,
                    data: Timestamp.fromDate(dataEscolhida),
                    mesReferencia: mesReferenciaString(mesSelecionado),
                    criadoEm: serverTimestamp(),
                    ...(modoGuardar ? { meta: metaFinal, banco: bancoFinal, bancoOrigem: bancoOrigemFinal } : {})
                };

                // Forma de pagamento (Gasto) ou banco de entrada (Extra) —
                // nenhum dos dois se aplica ao modo Guardar, que já tem seu
                // próprio sistema de banco (meta/cofrinho)
                if (tipoSelecionado === "gasto" && !modoGuardar) {
                    dadosLancamento.formaPagamento = campoFormaPagamento.value;
                    if (campoFormaPagamento.value === "pix" || campoFormaPagamento.value === "debito") {
                        dadosLancamento.banco = campoBancoPagamento.value;
                    }
                }
                if (tipoSelecionado === "ganho" && !modoGuardar) {
                    dadosLancamento.banco = campoBancoPagamento.value;
                }

                await addDoc(collection(db, "usuarios", uidAtual, "lancamentos"), dadosLancamento);
            }

            fecharModal();

            if (noCartaoCredito) {
                mostrarToast("Compra no crédito registrada ✓ — entra na próxima fatura, não desconta o saldo agora.");
            } else if (ehParcelado) {
                mostrarToast(`Parcelamento criado ✓ (${numeroParcelas}x)`);
            } else if (campoFixo.checked) {
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
    async function salvarNoCartao(valor, categoria, descricaoBase, cartaoId, ehFixo, ehParcelado, numeroParcelas) {
        const cartaoEscolhido = cartoesCustomizados.find((c) => c.id === cartaoId);
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
                criadoEm: serverTimestamp()
            };
            if (ehParcelado) {
                dadosPendencia.valorTotalCompra = valor;
                dadosPendencia.numeroParcela = indice + 1;
                dadosPendencia.totalParcelas = numeroParcelas;
            }
            if (grupoId) dadosPendencia.grupoId = grupoId;

            await addDoc(collection(db, "usuarios", uidAtual, "pendencias"), dadosPendencia);
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

            await addDoc(collection(db, "usuarios", uidAtual, "pendencias"), {
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

            await addDoc(collection(db, "usuarios", uidAtual, "pendencias"), {
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
        const mesReferencia = `${mesSelecionado.getFullYear()}-${String(mesSelecionado.getMonth() + 1).padStart(2, "0")}`;
        const referencia = collection(db, "usuarios", uidAtual, "pendencias");
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

        const referencia = collection(db, "usuarios", uidAtual, "pendencias");
        const consulta = query(referencia, where("noCartao", "==", true));

        pararDeEscutarResumoFaturaCartoes = onSnapshot(consulta, (snapshot) => {
            const todosOsItens = snapshot.docs;
            let totalGeral = 0;

            // Um cartão por vez, do mesmo jeito que calcularEstadoCartao faz
            // em cartao.js — cada cartão tem seu próprio dia de fechamento,
            // então não dá pra somar tudo junto sem separar primeiro
            cartoesCustomizados.forEach((cartao) => {
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

                totalGeral += totalFechadoNaoPago + totalAcumulandoAgora;
            });

            renderizarFaturaCartao(totalGeral);
        });
    }

    const LIMITE_PENDENCIAS_RECOLHIDO = 3;
    let ultimosPendenciasNormaisRenderizadas = [];

    function renderizarListaPendenciasNormais(documentos) {
        ultimosPendenciasNormaisRenderizadas = documentos;
        listaPendencias.innerHTML = "";
        pendenciasVazio.hidden = documentos.length > 0;

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
            listaPendencias.appendChild(criarItemPendencia(documento, true));
        });

        // O botão sempre mostra quantidade + valor total, mesmo recolhido —
        // de propósito, pra nunca ficar "escondido" que existe conta
        // esperando, mesmo quando a lista tá fechada
        if (documentosOrdenados.length > LIMITE_PENDENCIAS_RECOLHIDO) {
            const totalPendencias = documentosOrdenados.reduce((soma, documento) => soma + documento.data().valor, 0);
            botaoVerMaisPendencias.hidden = false;
            botaoVerMaisPendencias.textContent = precisaRecolher
                ? `Ver mais (${documentosOrdenados.length} pendências · ${formatarMoeda(totalPendencias)}) ▼`
                : `Ver menos (${documentosOrdenados.length} pendências · ${formatarMoeda(totalPendencias)}) ▲`;
        } else {
            botaoVerMaisPendencias.hidden = true;
        }
    }

    botaoVerMaisPendencias.addEventListener("click", () => {
        const estaExpandidoAgora = localStorage.getItem("pendencias_expandido") === "true";
        localStorage.setItem("pendencias_expandido", String(!estaExpandidoAgora));
        renderizarListaPendenciasNormais(ultimosPendenciasNormaisRenderizadas);
    });

    // Monta o <li> de uma pendência. mostrarBotaoPago=false esconde o botão
    // "Marcar como paga" — usado pros itens "No Cartão", que só são pagos
    // em bloco, através da Fatura
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
            const descricaoEscapadaForma = (dados.descricao || "").replace(/"/g, "&quot;");
            const nomesFormaPagamento = { dinheiro: "Dinheiro", pix: "PIX", debito: "Débito" };
            const textoAtual = dados.formaPagamento ? (nomesFormaPagamento[dados.formaPagamento] || dados.formaPagamento) : null;
            const textoBotaoForma = textoAtual
                ? `Editar forma de pagamento (${textoAtual}${dados.banco ? " · " + dados.banco : ""})`
                : "+ Adicionar forma de pagamento";
            linhaFormaPagamentoHtml = `<div class="linha-acoes-pix" style="margin-top:6px;"><button type="button" class="link-botao-simples botao-editar-forma-pagamento" data-id="${documento.id}" data-grupo="${dados.grupoId || ""}" data-forma-atual="${dados.formaPagamento || ""}" data-banco-atual="${dados.banco || ""}" data-descricao="${descricaoEscapadaForma}">${textoBotaoForma}</button></div>`;
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
            const chaveEscapada = (dados.chavePix || "").replace(/"/g, "&quot;");
            const descricaoEscapada = (dados.descricao || "").replace(/"/g, "&quot;");
            const botaoCopiar = dados.chavePix
                ? `<button type="button" class="link-botao-simples botao-copiar-pix" data-chave="${chaveEscapada}">Copiar PIX</button>`
                : "";
            const botaoEditar = `<button type="button" class="link-botao-simples botao-editar-pix" data-id="${documento.id}" data-grupo="${dados.grupoId || ""}" data-chave-atual="${chaveEscapada}" data-descricao="${descricaoEscapada}">${dados.chavePix ? "Editar chave" : "+ Adicionar chave PIX"}</button>`;
            linhaChavePixHtml = `<div class="linha-acoes-pix" style="display:flex; gap:14px; margin-top:6px;">${botaoCopiar}${botaoEditar}</div>`;
        }

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
                <div class="nome-conta">${dados.descricao}${badgeParcela}${badgeQuaseAcabando}</div>
                <div class="meta-conta">${dados.categoria} · Vence dia ${dados.diaDoMes}</div>
                ${textoValorTotal}
                ${textoPagoEm}
                ${linhaFormaPagamentoHtml}
                ${linhaChavePixHtml}
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
        secaoFaturaCartao.hidden = linkResumoFatura.hidden && linkResumoBancos.hidden;
    }

    // Recebe o total já calculado (fatura fechada não paga + fatura
    // acumulando agora, somado de todos os cartões) — a mesma conta que a
    // tela do Cartão faz pra cada cartão individualmente
    function renderizarFaturaCartao(totalFatura) {
        if (totalFatura <= 0) {
            linkResumoFatura.hidden = true;
            atualizarVisibilidadeSecaoBancosCartoes();
            return;
        }
        linkResumoFatura.hidden = false;
        atualizarVisibilidadeSecaoBancosCartoes();

        // Combina o total de TODOS os cartões cadastrados — o detalhe de cada
        // um (nome, vencimento, fatura própria) fica na tela do Cartão
        tituloFaturaCartao.textContent = "Fatura Cartões de Crédito";
        valorFaturaCartao.textContent = formatarMoeda(totalFatura);
        vencimentoFaturaCartao.textContent = "Ver detalhes por cartão";
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
        campoEditarChavePix.value = chaveAtual || "";
        textoEditarPixContexto.textContent = grupoPixEmEdicao
            ? `Isso atualiza a chave em "${descricao}" e em todas as próximas ocorrências ainda não pagas.`
            : `Isso atualiza a chave em "${descricao}".`;
        mensagemAvisoEditarPix.classList.remove("visivel");
        fundoModalEditarPix.classList.add("aberto");
    }

    botaoFecharEditarPix.addEventListener("click", () => {
        fundoModalEditarPix.classList.remove("aberto");
    });
    fundoModalEditarPix.addEventListener("click", (evento) => {
        if (evento.target === fundoModalEditarPix) fundoModalEditarPix.classList.remove("aberto");
    });

    botaoSalvarEditarPix.addEventListener("click", async () => {
        const novaChave = campoEditarChavePix.value.trim();
        mensagemAvisoEditarPix.classList.remove("visivel");

        const spinner = botaoSalvarEditarPix.querySelector(".spinner-botao");
        botaoSalvarEditarPix.disabled = true;
        spinner.hidden = false;

        try {
            if (grupoPixEmEdicao) {
                // Propaga pra todas as ocorrências do mesmo grupo (Fixo ou
                // Parcelado) que ainda não foram pagas — senão a chave só
                // ficaria salva no mês que você editou, e os próximos meses
                // continuariam sem ela
                const referenciaPendencias = collection(db, "usuarios", uidAtual, "pendencias");
                const consultaGrupo = query(referenciaPendencias, where("grupoId", "==", grupoPixEmEdicao), where("pago", "==", false));
                const resultado = await getDocs(consultaGrupo);

                const lote = writeBatch(db);
                resultado.forEach((documento) => {
                    lote.update(documento.ref, { chavePix: novaChave || null });
                });
                await lote.commit();
            } else if (pendenciaPixEmEdicaoId) {
                // Sem grupo (compra avulsa) — atualiza só essa mesmo
                await updateDoc(doc(db, "usuarios", uidAtual, "pendencias", pendenciaPixEmEdicaoId), { chavePix: novaChave || null });
            }

            fundoModalEditarPix.classList.remove("aberto");
            mostrarToast("Chave PIX salva ✓");
        } catch (erro) {
            mensagemAvisoEditarPix.textContent = "Não deu pra salvar agora. Confere sua internet e tenta de novo.";
            mensagemAvisoEditarPix.classList.add("visivel");
        } finally {
            botaoSalvarEditarPix.disabled = false;
            spinner.hidden = true;
        }
    });
    let escopoExclusaoEscolhido = null; // "so-essa" | "todas"

    function abrirModalEditarFormaPagamento(id, grupoId, formaAtual, bancoAtual, descricao) {
        pendenciaFormaPagamentoEmEdicaoId = id;
        grupoFormaPagamentoEmEdicao = grupoId || null;
        campoEditarFormaPagamento.value = formaAtual || "";

        if (formaAtual === "pix" || formaAtual === "debito") {
            popularSelectBancoGenerico(campoEditarBancoPagamento);
            campoEditarBancoPagamentoWrapper.hidden = false;
            campoEditarBancoPagamento.required = true;
            campoEditarBancoPagamento.value = bancoAtual || "__sem_banco__";
        } else {
            campoEditarBancoPagamentoWrapper.hidden = true;
            campoEditarBancoPagamento.required = false;
        }

        textoEditarFormaPagamentoContexto.textContent = grupoFormaPagamentoEmEdicao
            ? `Isso atualiza a forma de pagamento em "${descricao}" e em todas as próximas ocorrências ainda não pagas.`
            : `Isso atualiza a forma de pagamento em "${descricao}".`;
        mensagemAvisoEditarFormaPagamento.classList.remove("visivel");
        fundoModalEditarFormaPagamento.classList.add("aberto");
    }

    campoEditarFormaPagamento.addEventListener("change", () => {
        if (campoEditarFormaPagamento.value === "pix" || campoEditarFormaPagamento.value === "debito") {
            popularSelectBancoGenerico(campoEditarBancoPagamento);
            campoEditarBancoPagamentoWrapper.hidden = false;
            campoEditarBancoPagamento.required = true;
        } else {
            campoEditarBancoPagamentoWrapper.hidden = true;
            campoEditarBancoPagamento.required = false;
        }
    });

    botaoFecharEditarFormaPagamento.addEventListener("click", () => {
        fundoModalEditarFormaPagamento.classList.remove("aberto");
    });
    fundoModalEditarFormaPagamento.addEventListener("click", (evento) => {
        if (evento.target === fundoModalEditarFormaPagamento) fundoModalEditarFormaPagamento.classList.remove("aberto");
    });

    botaoSalvarEditarFormaPagamento.addEventListener("click", async () => {
        const novaForma = campoEditarFormaPagamento.value;
        mensagemAvisoEditarFormaPagamento.classList.remove("visivel");

        if (!novaForma) {
            mensagemAvisoEditarFormaPagamento.textContent = "Escolhe uma forma de pagamento.";
            mensagemAvisoEditarFormaPagamento.classList.add("visivel");
            return;
        }
        if ((novaForma === "pix" || novaForma === "debito") && !campoEditarBancoPagamento.value) {
            mensagemAvisoEditarFormaPagamento.textContent = "Escolhe de qual banco.";
            mensagemAvisoEditarFormaPagamento.classList.add("visivel");
            return;
        }

        const novoBanco = (novaForma === "pix" || novaForma === "debito")
            ? (campoEditarBancoPagamento.value === "__sem_banco__" ? null : campoEditarBancoPagamento.value)
            : null;

        const spinner = botaoSalvarEditarFormaPagamento.querySelector(".spinner-botao");
        botaoSalvarEditarFormaPagamento.disabled = true;
        spinner.hidden = false;

        try {
            if (grupoFormaPagamentoEmEdicao) {
                // Propaga pra todas as ocorrências do mesmo grupo (Fixo ou
                // Parcelado) que ainda não foram pagas — os meses já pagos
                // no passado continuam sem essa informação, porque não tem
                // como "inventar" um dado que não existia na hora
                const referenciaPendencias = collection(db, "usuarios", uidAtual, "pendencias");
                const consultaGrupo = query(referenciaPendencias, where("grupoId", "==", grupoFormaPagamentoEmEdicao), where("pago", "==", false));
                const resultado = await getDocs(consultaGrupo);

                const lote = writeBatch(db);
                resultado.forEach((documento) => {
                    lote.update(documento.ref, { formaPagamento: novaForma, banco: novoBanco });
                });
                await lote.commit();
            } else if (pendenciaFormaPagamentoEmEdicaoId) {
                await updateDoc(doc(db, "usuarios", uidAtual, "pendencias", pendenciaFormaPagamentoEmEdicaoId), { formaPagamento: novaForma, banco: novoBanco });
            }

            fundoModalEditarFormaPagamento.classList.remove("aberto");
            mostrarToast("Forma de pagamento salva ✓");
        } catch (erro) {
            mensagemAvisoEditarFormaPagamento.textContent = "Não deu pra salvar agora. Confere sua internet e tenta de novo.";
            mensagemAvisoEditarFormaPagamento.classList.add("visivel");
        } finally {
            botaoSalvarEditarFormaPagamento.disabled = false;
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
            textoPerguntaEscopo.textContent = `Deseja excluir só essa ocorrência, ou todas as próximas desse ${tipoGrupo} (ainda não pagas)?`;
            escopoExclusaoEscolhido = null;
            etapaEscopoExclusao.hidden = false;
            etapaConfirmarExclusao.hidden = true;
        }

        fundoModalExcluirPendencia.classList.add("aberto");
    }

    function fecharModalExcluirPendencia() {
        fundoModalExcluirPendencia.classList.remove("aberto");
        pendenciaEmExclusao = null;
        escopoExclusaoEscolhido = null;
    }

    function mostrarEtapaConfirmacaoExclusao() {
        etapaEscopoExclusao.hidden = true;
        etapaConfirmarExclusao.hidden = false;

        textoConfirmarExclusao.textContent = escopoExclusaoEscolhido === "todas"
            ? "Tem certeza de que deseja excluir todas essas pendências? As que já foram marcadas como pagas continuam no seu histórico normalmente."
            : "Tem certeza de que deseja excluir essa pendência? Se ela já estava marcada como paga, o lançamento correspondente também será removido do saldo.";
    }

    botaoExcluirSoEssa.addEventListener("click", () => {
        escopoExclusaoEscolhido = "so-essa";
        mostrarEtapaConfirmacaoExclusao();
    });

    botaoExcluirTodas.addEventListener("click", () => {
        escopoExclusaoEscolhido = "todas";
        mostrarEtapaConfirmacaoExclusao();
    });

    botaoFecharExcluirPendencia.addEventListener("click", fecharModalExcluirPendencia);
    botaoCancelarExclusao.addEventListener("click", fecharModalExcluirPendencia);
    fundoModalExcluirPendencia.addEventListener("click", (evento) => {
        if (evento.target === fundoModalExcluirPendencia) fecharModalExcluirPendencia();
    });

    botaoConfirmarExclusaoFinal.addEventListener("click", async () => {
        if (!pendenciaEmExclusao) return;
        const { id, dados } = pendenciaEmExclusao;

        botaoConfirmarExclusaoFinal.disabled = true;

        if (escopoExclusaoEscolhido === "todas") {
            const referenciaPendencias = collection(db, "usuarios", uidAtual, "pendencias");
            const consultaGrupo = query(referenciaPendencias, where("grupoId", "==", dados.grupoId), where("pago", "==", false));
            const pendenciasDoGrupo = await getDocs(consultaGrupo);
            for (const documento of pendenciasDoGrupo.docs) {
                await deleteDoc(documento.ref);
            }
        } else {
            // Só essa: se já tinha sido marcada como paga, o lançamento real
            // vinculado a ela também precisa ser apagado — senão fica órfão
            if (dados.lancamentoId) {
                await deleteDoc(doc(db, "usuarios", uidAtual, "lancamentos", dados.lancamentoId)).catch(() => {});
            }
            await deleteDoc(doc(db, "usuarios", uidAtual, "pendencias", id));
        }

        botaoConfirmarExclusaoFinal.disabled = false;
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
            const referenciaPendenciaExcluir = doc(db, "usuarios", uidAtual, "pendencias", botaoExcluir.dataset.id);
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
        const referenciaPendencia = doc(db, "usuarios", uidAtual, "pendencias", idPendencia);

        if (jaEstavaPago) {
            const confirmouDesmarcar = await confirmarComTelinha("Tem certeza de que deseja desmarcar esse pagamento? O lançamento correspondente vai ser removido do saldo e do extrato.");
            if (!confirmouDesmarcar) return;

            // Desmarcar precisa apagar o lançamento real que foi criado quando
            // marcou como paga — senão ele fica "preso" pra sempre, afetando o
            // saldo mesmo depois de desmarcado (e duplicando se marcar de novo)
            const snapshotAtual = await getDoc(referenciaPendencia);
            const dadosAtuais = snapshotAtual.exists() ? snapshotAtual.data() : null;

            if (dadosAtuais && dadosAtuais.lancamentoId) {
                await deleteDoc(doc(db, "usuarios", uidAtual, "lancamentos", dadosAtuais.lancamentoId)).catch(() => {});
            }

            await updateDoc(referenciaPendencia, { pago: false, lancamentoId: null, pagoEm: null });
            return;
        }

        const confirmouPagar = await confirmarComTelinha("Tem certeza de que esse pagamento já foi feito? Isso vai descontar o valor do seu saldo.");
        if (!confirmouPagar) return;

        // Marcar como paga: busca os dados da própria pendência pra criar o
        // lançamento de verdade (é isso que desconta do saldo e aparece no extrato)
        const snapshotPendencia = await getDoc(referenciaPendencia);
        if (!snapshotPendencia.exists()) return;
        const dadosPendencia = snapshotPendencia.data();

        const [ano, mes] = dadosPendencia.mesReferencia.split("-").map(Number);
        const agoraDoPagamento = new Date();
        const dataDoPagamento = new Date(
            ano, mes - 1, dadosPendencia.diaDoMes,
            agoraDoPagamento.getHours(), agoraDoPagamento.getMinutes(),
            agoraDoPagamento.getSeconds(), agoraDoPagamento.getMilliseconds()
        );

        const novoLancamento = await addDoc(collection(db, "usuarios", uidAtual, "lancamentos"), {
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

    listaPendencias.addEventListener("click", handlerCliqueListaPendencias);

    // ==========================================================================
    // COMPARAÇÃO COM O MÊS ANTERIOR
    // ==========================================================================
    const comparacaoMesAnteriorEl = document.getElementById("comparacao-mes-anterior");
    let gastosMesAnterior = null;
    let totalGastosAtual = 0;

    async function buscarGastosMesAnterior() {
        const anoAnterior = mesSelecionado.getMonth() === 0 ? mesSelecionado.getFullYear() - 1 : mesSelecionado.getFullYear();
        const mesAnteriorIndice = mesSelecionado.getMonth() === 0 ? 11 : mesSelecionado.getMonth() - 1;
        const mesReferenciaAnterior = mesReferenciaString(new Date(anoAnterior, mesAnteriorIndice, 1));

        const referencia = collection(db, "usuarios", uidAtual, "lancamentos");
        const consulta = query(referencia, where("mesReferencia", "==", mesReferenciaAnterior));

        const resultado = await getDocs(consulta);
        let total = 0;
        resultado.forEach((documento) => {
            const dados = documento.data();
            if (dados.categoria === "Guardar Dinheiro") {
                if (dados.valor > 0) total += dados.valor;
                return;
            }
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
    function escutarLancamentosDoMes() {
        if (pararDeEscutar) pararDeEscutar();

        const mesReferenciaAtual = mesReferenciaString(mesSelecionado);

        const referencia = collection(db, "usuarios", uidAtual, "lancamentos");
        // Filtra por "mesReferencia" (o mês que a pessoa estava navegando na
        // hora de criar), não pela data exata — são coisas separadas de
        // propósito. Sem orderBy aqui (evitaria precisar de índice composto,
        // já que ordenar por "data" enquanto filtra por "mesReferencia" são
        // campos diferentes) — ordena do lado do app mesmo, é rapidinho.
        const consulta = query(referencia, where("mesReferencia", "==", mesReferenciaAtual));

        pararDeEscutar = onSnapshot(consulta, (snapshot) => {
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
            renderizarLista(documentosOrdenados);
            calcularTotais(documentosOrdenados);
            renderizarGrafico(documentosOrdenados);
        });
    }

    // ==========================================================================
    // BANNER DE SALÁRIO — consulta própria, olhando pro mês corrente de
    // verdade, independente de qual mês está sendo exibido na tela
    // ==========================================================================
    function escutarSalarioDoMes() {
        if (pararDeEscutarSalario) pararDeEscutarSalario();

        // Só um filtro aqui de propósito (categoria) — evita precisar de
        // índice composto no Firestore, igual já resolvemos no Saldo Guardado.
        // O "é desse mês?" é conferido do lado do app, depois que os dados chegam.
        const referencia = collection(db, "usuarios", uidAtual, "lancamentos");
        const consulta = query(referencia, where("categoria", "==", "Salário"));

        pararDeEscutarSalario = onSnapshot(consulta, (snapshot) => {
            const hoje = new Date();
            const jaTemSalarioEsteMes = snapshot.docs.some((documento) => {
                const dataDoDocumento = documento.data().data.toDate();
                return dataDoDocumento.getFullYear() === hoje.getFullYear()
                    && dataDoDocumento.getMonth() === hoje.getMonth();
            });
            bannerSalario.hidden = jaTemSalarioEsteMes;
        });

        perguntaSalario.textContent = primeiroNome
            ? `Olá, ${primeiroNome}! Já recebeu seu salário deste mês?`
            : "Já recebeu seu salário deste mês?";
        valorSalarioBanner.value = salarioPadrao.toFixed(2).replace(".", ",");
    }

    botaoConfirmarSalario.addEventListener("click", async () => {
        const valor = paraNumero(valorSalarioBanner.value);
        if (!valor || valor <= 0) return;

        botaoConfirmarSalario.disabled = true;

        await addDoc(collection(db, "usuarios", uidAtual, "lancamentos"), {
            tipo: "ganho",
            valor: valor,
            categoria: "Salário",
            descricao: "",
            data: Timestamp.fromDate(new Date()),
            mesReferencia: mesReferenciaString(new Date()),
            criadoEm: serverTimestamp()
        });

        botaoConfirmarSalario.disabled = false;
    });

    // ==========================================================================
    // 11. DESENHAR A LISTA (só os últimos N, o resto fica no Extrato Completo)
    // ==========================================================================
    function renderizarLista(documentos) {
        listaLancamentos.innerHTML = "";

        // A "Retirada" (valor negativo em "Guardar Dinheiro") é só um registro
        // interno de controle do cofrinho — quem representa o dinheiro voltando
        // pro saldo, de forma visível pra pessoa, é a "Retirada da Reserva"
        const documentosParaExibir = documentos.filter(
            (documento) => !(documento.data().categoria === "Guardar Dinheiro" && documento.data().valor < 0)
        );

        listaVazia.hidden = documentosParaExibir.length > 0;

        const documentosVisiveis = documentosParaExibir.slice(0, LIMITE_ITENS_LISTA_INICIAL);

        documentosVisiveis.forEach((documento) => {
            const dados = documento.data();
            const dataObj = dados.data.toDate();
            const dataFormatada = dataObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
            const horaFormatada = dataObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
            const sinal = dados.tipo === "ganho" ? "+" : "-";

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
                : (dados.descricao || dados.categoria);

            const botaoDuplicarHtml = ehCofrinho ? "" : `
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
                    <div class="descricao-lancamento">${tituloGrande}</div>
                    <div class="meta-lancamento">${dados.categoria} · ${dataFormatada} às ${horaFormatada}</div>
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
            listaLancamentos.appendChild(item);
        });
    }

    // Clique no lançamento (fora do botão de excluir) abre edição
    listaLancamentos.addEventListener("click", async (evento) => {
        const botaoDuplicar = evento.target.closest(".botao-duplicar");
        if (botaoDuplicar) {
            const itemPai = botaoDuplicar.closest(".item-lancamento");
            const dadosDoItem = itemPai ? itemPai._dadosOriginais : null;
            if (!dadosDoItem) return;

            const descricaoOuCategoria = dadosDoItem.descricao || dadosDoItem.categoria;
            const confirmou = await confirmarComTelinha(`Duplicar "${descricaoOuCategoria}" (${formatarMoeda(dadosDoItem.valor)}) com a data de hoje?`);
            if (!confirmou) return;

            await addDoc(collection(db, "usuarios", uidAtual, "lancamentos"), {
                tipo: dadosDoItem.tipo,
                valor: dadosDoItem.valor,
                categoria: dadosDoItem.categoria,
                descricao: dadosDoItem.descricao || "",
                data: Timestamp.fromDate(new Date()), // duplicado sempre cai em "hoje"
                mesReferencia: mesReferenciaString(mesSelecionado),
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

            await deleteDoc(doc(db, "usuarios", uidAtual, "lancamentos", botaoExcluir.dataset.id));

            if (dadosParaDesfazer) {
                mostrarToastComAcao("Lançamento excluído.", "Desfazer", async () => {
                    await addDoc(collection(db, "usuarios", uidAtual, "lancamentos"), {
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
            abrirModalEdicao(item.dataset.id, item._dadosOriginais);
        }
    });

    // ==========================================================================
    // 12. CALCULAR OS TOTAIS DO MÊS
    // ==========================================================================
    function calcularTotais(documentos) {
        let totalGanhos = 0;
        let totalGastos = 0;

        documentos.forEach((documento) => {
            const dados = documento.data();

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

        totalGanhosEl.textContent = formatarMoeda(totalGanhos);
        totalGastosEl.textContent = formatarMoeda(totalGastos);
        saldoAtualDoMes = totalGanhos - totalGastos;
        atualizarNumeroGrandeDoSaldo();

        totalGastosAtual = totalGastos;
        atualizarComparacaoMesAnterior();
        atualizarIndicadorMesFechado();
    }

    // Mostra uma bolinha verde/vermelha do lado do nome do mês, só quando o
    // mês exibido já "fechou" (é anterior ao mês atual de verdade) — ajuda a
    // navegar pra trás e já ver de relance se cada mês foi bom ou ruim
    function atualizarIndicadorMesFechado() {
        const hoje = new Date();
        const ehMesAtualOuFuturo = mesSelecionado.getFullYear() > hoje.getFullYear()
            || (mesSelecionado.getFullYear() === hoje.getFullYear() && mesSelecionado.getMonth() >= hoje.getMonth());

        if (ehMesAtualOuFuturo) {
            indicadorMesFechado.hidden = true;
            return;
        }

        indicadorMesFechado.hidden = false;
        indicadorMesFechado.classList.toggle("positivo", saldoAtualDoMes >= 0);
        indicadorMesFechado.classList.toggle("negativo", saldoAtualDoMes < 0);
        indicadorMesFechado.title = saldoAtualDoMes >= 0 ? "Mês fechou no positivo" : "Mês fechou no negativo";
    }

    // ==========================================================================
    // FORMATAR MOEDA
    // ==========================================================================
    function formatarMoeda(valor) {
        // Corrige o "zero negativo" do JavaScript — quando uma conta bate
        // exatamente em zero (tipo saldo - gastos - lembretes = 0), o
        // resultado às vezes vem como -0 tecnicamente, e sem isso aqui
        // apareceria "-R$ 0,00" na tela, o que é enganoso (não é negativo de verdade)
        const valorCorrigido = valor === 0 ? 0 : valor;
        return valorCorrigido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

    // Converte texto digitado em número — remove pontos (separador de
    // milhar) antes de trocar a vírgula por ponto decimal, então funciona
    // tanto com "1500,00" quanto com "1.500,00"
    function paraNumero(texto) {
        return parseFloat(String(texto).replace(/\./g, "").replace(",", "."));
    }

    // Aplica a máscara "tipo caixa eletrônico": os dígitos digitados
    // entram sempre da direita pra esquerda (representando centavos), sem
    // precisar digitar vírgula — cada novo número empurra os anteriores
    // pra esquerda, exatamente como um caixa eletrônico de banco
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
        // Ao focar, joga o cursor pro final — impede editar no meio do
        // número, que quebraria a lógica de "sempre entra pela direita"
        input.addEventListener("focus", () => {
            setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
        });
    }

    // ==========================================================================
    // GRÁFICO DE ROSCA — gastos por categoria do mês selecionado
    // Desenhado em SVG puro (sem biblioteca externa), pra não depender de
    // internet extra nem pesar o app.
    // ==========================================================================
    function renderizarGrafico(documentos) {
        const totaisPorCategoria = {};

        documentos.forEach((documento) => {
            const dados = documento.data();

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

        graficoDonut.innerHTML = "";
        legendaGrafico.innerHTML = "";

        if (totalGeral === 0) {
            graficoVazio.hidden = false;
            graficoDonut.closest(".cartao-grafico").hidden = true;
            return;
        }

        graficoVazio.hidden = true;
        graficoDonut.closest(".cartao-grafico").hidden = false;

        const raio = 50;
        const circunferencia = 2 * Math.PI * raio;
        let deslocamentoAcumulado = 0;

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
            graficoDonut.appendChild(circulo);

            deslocamentoAcumulado += comprimentoFatia;

            const itemLegenda = document.createElement("li");
            itemLegenda.className = "item-legenda";

            const limiteConfigurado = mapaOrcamentos[item.nome];
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
                <span class="nome-legenda">${item.nome}</span>
                <span class="percentual-legenda">${Math.round(percentual * 100)}%</span>
                ${barraHtml}
            `;
            itemLegenda.addEventListener("click", () => irParaExtratoFiltrado(item.nome));
            legendaGrafico.appendChild(itemLegenda);
        });
    }

    // Leva pro Extrato Completo já filtrado pelo mês em exibição + a
    // categoria clicada no gráfico (mostra tudo, sem o limite de 4 itens
    // da lista resumida da tela inicial)
    function irParaExtratoFiltrado(nomeCategoria) {
        const nomeReal = nomeCategoria === "Guardado" ? "Guardar Dinheiro" : nomeCategoria;
        const mesParaUrl = String(mesSelecionado.getMonth() + 1).padStart(2, "0");
        const url = `extrato.html?mes=${mesSelecionado.getFullYear()}-${mesParaUrl}&categoria=${encodeURIComponent(nomeReal)}`;
        window.location.href = url;
    }

});
