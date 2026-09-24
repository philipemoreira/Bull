import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, doc, updateDoc, writeBatch, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    const botaoTema = document.getElementById("botao-tema");
    const CHAVE_TEMA = "bull_tema";
    const metaCorTema = document.querySelector('meta[name="theme-color"]');
    function atualizarMetaCorTema() {
        if (!metaCorTema) return;
        const temaClaro = document.documentElement.getAttribute("data-tema") === "claro";
        metaCorTema.setAttribute("content", temaClaro ? "#FAF9F5" : "#0A0A0A");
    }
    atualizarMetaCorTema();
    if (botaoTema) {
        botaoTema.addEventListener("click", () => {
            const estaClaro = document.documentElement.getAttribute("data-tema") === "claro";
            if (estaClaro) {
                document.documentElement.removeAttribute("data-tema");
                try { localStorage.setItem(CHAVE_TEMA, "escuro"); } catch (erro) { /* localStorage bloqueado */ }
            } else {
                document.documentElement.setAttribute("data-tema", "claro");
                try { localStorage.setItem(CHAVE_TEMA, "claro"); } catch (erro) { /* localStorage bloqueado */ }
            }
            atualizarMetaCorTema();
        });
    }

    const botaoSair = document.getElementById("botao-sair");
    const botaoExcluirConta = document.getElementById("botao-excluir-conta");
    const DIAS_DE_GRACA_EXCLUSAO = 7;

    const fundoModalConfirmar = document.getElementById("fundo-modal-confirmar");
    const tituloModalConfirmar = document.getElementById("titulo-modal-confirmar");
    const textoModalConfirmar = document.getElementById("texto-modal-confirmar");
    const botaoConfirmarAcao = document.getElementById("botao-confirmar-acao");
    const botaoCancelarAcao = document.getElementById("botao-cancelar-acao");
    const botaoFecharConfirmar = document.getElementById("botao-fechar-confirmar");

    const botaoAbrirTrocarPrincipal = document.getElementById("botao-abrir-trocar-principal");
    const fundoModalTrocarPrincipal = document.getElementById("fundo-modal-trocar-principal");
    const botaoFecharTrocarPrincipal = document.getElementById("botao-fechar-trocar-principal");
    const campoNovoBancoPrincipal = document.getElementById("campo-novo-banco-principal");
    const mensagemAvisoTrocarPrincipal = document.getElementById("mensagem-aviso-trocar-principal");
    const botaoContinuarTrocarPrincipal = document.getElementById("botao-continuar-trocar-principal");

    let uidAtual = null;
    let listaDeBancos = [];

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

    onAuthStateChanged(auth, (usuario) => {
        if (!usuario) {
            window.location.href = "index.html";
            return;
        }
        uidAtual = usuario.uid;
    });

    botaoSair.addEventListener("click", async () => {
        const confirmou = await confirmarComTelinha("Tem certeza de que deseja encerrar a sessão?");
        if (!confirmou) return;

        await signOut(auth);
        window.location.href = "index.html";
    });

    // ==========================================================================
    // EXCLUIR CONTA — não apaga na hora: só agenda a exclusão pra daqui a 7
    // dias e desloga. Se a pessoa entrar de novo antes desse prazo, a conta
    // volta ao normal sozinha (ver app.js, que faz essa checagem no login).
    // Só depois que o prazo passa é que os dados somem de vez.
    // ==========================================================================
    botaoExcluirConta.addEventListener("click", async () => {
        const confirmou = await confirmarComTelinha(
            `Sua conta vai ficar desativada por ${DIAS_DE_GRACA_EXCLUSAO} dias. Se você entrar de novo nesse período, ela volta ao normal automaticamente. Depois desse prazo, todos os seus dados são apagados de vez, sem volta. Quer continuar?`,
            "Excluir conta"
        );
        if (!confirmou) return;

        const dataExclusao = new Date();
        dataExclusao.setDate(dataExclusao.getDate() + DIAS_DE_GRACA_EXCLUSAO);

        botaoExcluirConta.disabled = true;
        try {
            await updateDoc(doc(db, "usuarios", uidAtual), {
                exclusaoAgendadaPara: Timestamp.fromDate(dataExclusao)
            });
            await signOut(auth);
            window.location.href = "index.html?contaExcluida=1";
        } catch (erro) {
            botaoExcluirConta.disabled = false;
            await confirmarComTelinha("Não deu pra processar isso agora. Confere sua internet e tenta de novo.", "Ops");
        }
    });

    // ==========================================================================
    // TROCAR BANCO PRINCIPAL — de propósito escondido aqui em Configurações,
    // e com uma etapa extra de confirmação, pra não ser fácil de trocar sem
    // querer (isso afeta direto o número do Saldo do Mês na tela inicial)
    // ==========================================================================
    botaoAbrirTrocarPrincipal.addEventListener("click", async () => {
        const referencia = collection(db, "usuarios", uidAtual, "bancos");
        const resultado = await getDocs(referencia);
        listaDeBancos = resultado.docs.map((documento) => ({ id: documento.id, ...documento.data() }));

        campoNovoBancoPrincipal.innerHTML = "";
        mensagemAvisoTrocarPrincipal.classList.remove("visivel");

        if (listaDeBancos.length === 0) {
            mensagemAvisoTrocarPrincipal.textContent = "Você ainda não tem nenhum banco cadastrado. Cria um primeiro, na tela Bancos e Cartões.";
            mensagemAvisoTrocarPrincipal.classList.add("visivel");
            botaoContinuarTrocarPrincipal.disabled = true;
        } else {
            botaoContinuarTrocarPrincipal.disabled = false;
            listaDeBancos.forEach((banco) => {
                const opcao = document.createElement("option");
                opcao.value = banco.id;
                opcao.textContent = banco.principal ? `${banco.nome} (atual)` : banco.nome;
                if (banco.principal) opcao.selected = true;
                campoNovoBancoPrincipal.appendChild(opcao);
            });
        }

        fundoModalTrocarPrincipal.classList.add("aberto");
    });

    botaoFecharTrocarPrincipal.addEventListener("click", () => {
        fundoModalTrocarPrincipal.classList.remove("aberto");
    });
    fundoModalTrocarPrincipal.addEventListener("click", (evento) => {
        if (evento.target === fundoModalTrocarPrincipal) fundoModalTrocarPrincipal.classList.remove("aberto");
    });

    botaoContinuarTrocarPrincipal.addEventListener("click", async () => {
        const idEscolhido = campoNovoBancoPrincipal.value;
        const bancoEscolhido = listaDeBancos.find((b) => b.id === idEscolhido);
        if (!bancoEscolhido) return;

        if (bancoEscolhido.principal) {
            mensagemAvisoTrocarPrincipal.textContent = "Esse já é o banco principal atual.";
            mensagemAvisoTrocarPrincipal.classList.add("visivel");
            return;
        }

        fundoModalTrocarPrincipal.classList.remove("aberto");

        const confirmou = await confirmarComTelinha(
            `Tem certeza de que quer trocar o banco principal pra "${bancoEscolhido.nome}"? Isso NÃO transfere nenhum dinheiro — só troca qual saldo aparece no "Saldo do Mês" da tela inicial.`,
            "Confirmar troca de banco principal"
        );
        if (!confirmou) return;

        const lote = writeBatch(db);
        listaDeBancos.forEach((banco) => {
            if (banco.principal && banco.id !== idEscolhido) {
                lote.update(doc(db, "usuarios", uidAtual, "bancos", banco.id), { principal: false });
            }
        });
        lote.update(doc(db, "usuarios", uidAtual, "bancos", idEscolhido), { principal: true });
        await lote.commit();
    });

});
