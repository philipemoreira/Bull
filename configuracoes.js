import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, doc, updateDoc, writeBatch, Timestamp, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { suportaBiometria, biometriaAtiva, ativarBiometria, desativarBiometria } from "./biometria.js";

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

    const botaoAlternarBiometria = document.getElementById("botao-alternar-biometria");
    const textoStatusBiometria = document.getElementById("texto-status-biometria");

    const botaoAbrirHistoricoAcessos = document.getElementById("botao-abrir-historico-acessos");
    const fundoModalHistoricoAcessos = document.getElementById("fundo-modal-historico-acessos");
    const botaoFecharHistoricoAcessos = document.getElementById("botao-fechar-historico-acessos");
    const listaHistoricoAcessos = document.getElementById("lista-historico-acessos");
    const historicoAcessosVazio = document.getElementById("historico-acessos-vazio");

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
        atualizarUiBiometria();
    });

    // ==========================================================================
    // LOGIN COM BIOMETRIA — liga/desliga o "atalho" de digital/Face ID/PIN
    // nesse aparelho. Ver biometria.js pra entender os limites (não troca
    // o login de verdade, só acelera reaberturas no mesmo aparelho).
    // ==========================================================================
    async function atualizarUiBiometria() {
        if (!uidAtual) return;

        const suportado = await suportaBiometria();
        if (!suportado) {
            botaoAlternarBiometria.disabled = true;
            textoStatusBiometria.textContent = "Esse aparelho ou navegador não tem suporte a biometria (digital, rosto ou PIN do sistema).";
            return;
        }

        botaoAlternarBiometria.disabled = false;
        const ativa = biometriaAtiva(uidAtual);
        botaoAlternarBiometria.textContent = ativa ? "Desativar Login com Biometria" : "Ativar Login com Biometria";
        textoStatusBiometria.textContent = ativa
            ? "Ativado neste aparelho. Ao reabrir o Bull aqui, ele vai pedir sua digital, rosto ou PIN antes de entrar."
            : "Depois de ativado, o Bull pede sua digital, rosto ou PIN do aparelho toda vez que você reabrir o app por aqui, sem precisar digitar a senha de novo. Só funciona neste aparelho/navegador — em um aparelho novo, o login continua sendo o normal.";
    }

    botaoAlternarBiometria.addEventListener("click", async () => {
        const ativa = biometriaAtiva(uidAtual);

        if (ativa) {
            const confirmou = await confirmarComTelinha(
                "Quer desativar o login com biometria neste aparelho? Você vai voltar a digitar sua senha normalmente ao abrir o app.",
                "Desativar biometria"
            );
            if (!confirmou) return;
            desativarBiometria(uidAtual);
            atualizarUiBiometria();
            return;
        }

        botaoAlternarBiometria.disabled = true;
        try {
            await ativarBiometria(uidAtual, auth.currentUser?.email, auth.currentUser?.displayName);
            await confirmarComTelinha(
                "Biometria ativada! Da próxima vez que você abrir o Bull neste aparelho, ele vai pedir sua digital, rosto ou PIN antes de entrar.",
                "Tudo certo"
            );
        } catch (erro) {
            await confirmarComTelinha(
                "Não deu pra ativar a biometria agora. Confere se seu aparelho tem digital, Face ID ou PIN configurado no sistema e tenta de novo.",
                "Ops"
            );
        } finally {
            atualizarUiBiometria();
        }
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
    // HISTÓRICO DE ACESSOS — só leitura. Os registros são criados em app.js,
    // toda vez que o app é aberto (uma vez por sessão do navegador).
    // ==========================================================================
    function formatarDataHoraAcesso(data) {
        const dataFormatada = data.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
        const horaFormatada = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        return `${dataFormatada}, ${horaFormatada}`;
    }

    botaoAbrirHistoricoAcessos.addEventListener("click", async () => {
        fundoModalHistoricoAcessos.classList.add("aberto");
        listaHistoricoAcessos.innerHTML = "";
        historicoAcessosVazio.hidden = true;

        try {
            const referenciaAcessos = collection(db, "usuarios", uidAtual, "acessos");
            const resultado = await getDocs(query(referenciaAcessos, orderBy("criadoEm", "desc"), limit(20)));

            if (resultado.empty) {
                historicoAcessosVazio.hidden = false;
                return;
            }

            resultado.docs.forEach((documento) => {
                const dados = documento.data();
                const dataAcesso = dados.criadoEm ? dados.criadoEm.toDate() : null;

                const item = document.createElement("li");
                item.className = "item-conta";
                item.innerHTML = `
                    <div class="info-conta">
                        <div class="nome-conta">${dados.dispositivo || "Aparelho desconhecido"}</div>
                        <div class="meta-conta">${dataAcesso ? formatarDataHoraAcesso(dataAcesso) : "Data não disponível"}</div>
                    </div>
                `;
                listaHistoricoAcessos.appendChild(item);
            });
        } catch (erro) {
            historicoAcessosVazio.textContent = "Não deu pra carregar o histórico agora. Confere sua internet e tenta de novo.";
            historicoAcessosVazio.hidden = false;
        }
    });

    botaoFecharHistoricoAcessos.addEventListener("click", () => {
        fundoModalHistoricoAcessos.classList.remove("aberto");
    });
    fundoModalHistoricoAcessos.addEventListener("click", (evento) => {
        if (evento.target === fundoModalHistoricoAcessos) fundoModalHistoricoAcessos.classList.remove("aberto");
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
