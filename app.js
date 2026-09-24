import { auth, db } from "./firebase-config.js";
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    sendPasswordResetEmail,
    GoogleAuthProvider,
    signInWithPopup,
    deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    doc, getDoc, updateDoc, deleteDoc, deleteField,
    collection, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    const abaEntrar = document.getElementById("aba-entrar");
    const abaCadastro = document.getElementById("aba-cadastro");
    const telaLogin = document.querySelector(".tela-login");
    const botaoComecar = document.getElementById("botao-comecar");
    const botaoVoltarLogin = document.getElementById("botao-voltar-login");
    const campoConfirmar = document.getElementById("campo-confirmar");
    const campoConfirmarSenha = document.getElementById("campo-confirmar-senha");
    const formulario = document.getElementById("formulario-acesso");
    const campoEmail = document.getElementById("campo-email");
    const campoSenha = document.getElementById("campo-senha");
    const botaoEnviar = document.getElementById("botao-enviar");
    const botaoGoogle = document.getElementById("botao-google");
    const textoBotao = botaoEnviar.querySelector(".texto-botao");
    const spinnerBotao = botaoEnviar.querySelector(".spinner-botao");
    const mensagemAviso = document.getElementById("mensagem-aviso");
    const botaoOlho = document.getElementById("botao-olho");
    const botaoOlhoConfirmar = document.getElementById("botao-olho-confirmar");
    const linkEsqueciSenha = document.getElementById("link-esqueci-senha");
    const telaCarregamento = document.getElementById("tela-carregamento");

    const fundoModalReativar = document.getElementById("fundo-modal-reativar");
    const textoPrazoExclusao = document.getElementById("texto-prazo-exclusao");
    const botaoReativarConta = document.getElementById("botao-reativar-conta");
    const botaoSairSemReativar = document.getElementById("botao-sair-sem-reativar");

    // ==========================================================================
    // TELA DE CARREGAMENTO — com rede de segurança
    // A splash fica visível até o Firebase confirmar se a pessoa já está
    // logada. Só que, se por qualquer motivo isso demorar demais (internet
    // ruim, Firebase fora do ar, etc.), o TEMPO_MAXIMO_SEGURANCA garante que
    // ela some sozinha de qualquer jeito — nunca mais fica travada pra sempre.
    // ==========================================================================
    const TEMPO_MINIMO_VISIVEL = 7000; // a tela de carregamento fica visível por esse tempo, de propósito
    const TEMPO_MAXIMO_SEGURANCA = 8500; // rede de segurança: nunca passa disso, mesmo com internet ruim
    const inicioCarregamento = Date.now();
    let splashJaEscondida = false;

    function esconderSplash() {
        if (splashJaEscondida) return;
        splashJaEscondida = true;

        const decorrido = Date.now() - inicioCarregamento;
        const espera = Math.max(0, TEMPO_MINIMO_VISIVEL - decorrido);
        setTimeout(() => telaCarregamento.classList.add("oculto"), espera);
    }

    // Rede de segurança: dispara sozinha, independente de qualquer outra coisa
    setTimeout(esconderSplash, TEMPO_MAXIMO_SEGURANCA);

    // Troca o texto embaixo da barra em alguns momentos, pra dar sensação
    // de progresso de verdade ao longo dos 12 segundos (em vez de uma
    // frase parada o tempo todo)
    const textoStatusCarregamento = document.getElementById("texto-status-carregamento");
    if (textoStatusCarregamento) {
        setTimeout(() => { textoStatusCarregamento.textContent = "Organizando suas finanças"; }, 2500);
        setTimeout(() => { textoStatusCarregamento.textContent = "Quase lá"; }, 5000);
    }

    let modoAtual = "entrar";

    function mudarPara(modo) {
        modoAtual = modo;
        esconderAviso();

        const ehCadastro = modo === "cadastro";

        abaEntrar.classList.toggle("ativa", !ehCadastro);
        abaCadastro.classList.toggle("ativa", ehCadastro);
        abaEntrar.setAttribute("aria-selected", String(!ehCadastro));
        abaCadastro.setAttribute("aria-selected", String(ehCadastro));

        campoConfirmar.hidden = !ehCadastro;
        campoConfirmarSenha.required = ehCadastro;

        textoBotao.textContent = ehCadastro ? "Criar conta" : "Entrar";
        campoSenha.placeholder = ehCadastro ? "Crie uma senha (mín. 6 caracteres)" : "Sua senha";
        linkEsqueciSenha.hidden = ehCadastro;
    }

    abaEntrar.addEventListener("click", () => mudarPara("entrar"));
    abaCadastro.addEventListener("click", () => mudarPara("cadastro"));

    // Fluxo em 2 etapas, só existe visualmente no celular (o CSS ignora isso
    // no desktop, onde os dois painéis já ficam visíveis ao mesmo tempo).
    // "inert" impede a pessoa de navegar por Tab pro painel que está fora
    // da tela — sem isso, o teclado "vazaria" pro conteúdo escondido.
    const painelMarcaLogin = document.querySelector(".painel-marca");
    const painelFormularioLogin = document.querySelector(".painel-formulario");

    if (botaoComecar && telaLogin) {
        botaoComecar.addEventListener("click", () => {
            telaLogin.classList.add("mostrar-formulario");
            if (painelMarcaLogin) painelMarcaLogin.inert = true;
            if (painelFormularioLogin) painelFormularioLogin.inert = false;
        });
    }
    if (botaoVoltarLogin && telaLogin) {
        botaoVoltarLogin.addEventListener("click", () => {
            telaLogin.classList.remove("mostrar-formulario");
            if (painelMarcaLogin) painelMarcaLogin.inert = false;
            if (painelFormularioLogin) painelFormularioLogin.inert = true;
        });
    }

    botaoOlho.addEventListener("click", () => {
        const estaEscondida = campoSenha.type === "password";
        campoSenha.type = estaEscondida ? "text" : "password";
        botaoOlho.setAttribute("aria-label", estaEscondida ? "Esconder senha" : "Mostrar senha");
    });

    botaoOlhoConfirmar.addEventListener("click", () => {
        const estaEscondida = campoConfirmarSenha.type === "password";
        campoConfirmarSenha.type = estaEscondida ? "text" : "password";
        botaoOlhoConfirmar.setAttribute("aria-label", estaEscondida ? "Esconder senha" : "Mostrar senha");
    });

    function mostrarAviso(texto, tipo = "erro") {
        mensagemAviso.textContent = texto;
        mensagemAviso.classList.add("visivel");
        mensagemAviso.classList.toggle("sucesso", tipo === "sucesso");
    }

    function esconderAviso() {
        mensagemAviso.classList.remove("visivel", "sucesso");
    }

    // Vem do redirecionamento feito em Configurações, depois de agendar a
    // exclusão da conta (ver configuracoes.js)
    if (new URLSearchParams(window.location.search).get("contaExcluida") === "1") {
        mostrarAviso("Sua conta foi marcada para exclusão em 7 dias. Se você entrar de novo antes disso, ela volta ao normal.", "sucesso");
        history.replaceState(null, "", window.location.pathname);
    }

    // Considera "login recente" (interativo, feito agora) algo que aconteceu
    // nos últimos 2 minutos — o suficiente pra diferenciar de uma sessão
    // antiga que só foi restaurada sozinha ao abrir o app de novo. Isso
    // importa só pra decidir se é seguro apagar a conta definitivamente
    // (o Firebase exige um login recente de verdade pra isso).
    function loginFoiRecente(usuario) {
        const ultimoLogin = usuario.metadata && usuario.metadata.lastSignInTime
            ? new Date(usuario.metadata.lastSignInTime).getTime()
            : 0;
        return (Date.now() - ultimoLogin) < 2 * 60 * 1000;
    }

    function formatarDataPtBr(data) {
        return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    }

    const SUBCOLECOES_DO_USUARIO = ["lancamentos", "categorias", "metas", "pendencias", "anotacoes", "bancos", "cartoes", "faturasPagas", "orcamentos"];

    // Apaga todos os documentos de uma subcoleção, em lotes de 400 (o limite
    // do Firestore por lote é 500 — 400 dá uma folga de segurança)
    async function apagarColecaoInteira(uid, nomeColecao) {
        const instantaneo = await getDocs(collection(db, "usuarios", uid, nomeColecao));
        const referencias = instantaneo.docs.map((documento) => documento.ref);
        const TAMANHO_DO_LOTE = 400;
        for (let i = 0; i < referencias.length; i += TAMANHO_DO_LOTE) {
            const lote = writeBatch(db);
            referencias.slice(i, i + TAMANHO_DO_LOTE).forEach((referencia) => lote.delete(referencia));
            await lote.commit();
        }
    }

    // ==========================================================================
    // EXCLUSÃO DEFINITIVA — só roda quando o prazo de 7 dias já passou E o
    // login que acabou de acontecer é recente de verdade (ver loginFoiRecente).
    // Apaga todas as subcoleções, depois o documento de perfil, depois a
    // conta no Firebase Auth. Se algo falhar no meio, desloga em vez de
    // deixar a pessoa presa numa tela travada.
    // ==========================================================================
    async function apagarContaDefinitivamente(usuario) {
        try {
            for (const nomeColecao of SUBCOLECOES_DO_USUARIO) {
                await apagarColecaoInteira(usuario.uid, nomeColecao);
            }
            await deleteDoc(doc(db, "usuarios", usuario.uid));
            await deleteUser(usuario);
        } catch (erro) {
            try { await signOut(auth); } catch (erroAoDeslogar) { /* ignora */ }
            esconderSplash();
            mostrarAviso("Não deu pra concluir a exclusão agora. Tenta entrar de novo em instantes.");
            return;
        }
        esconderSplash();
        mostrarAviso("Sua conta e todos os seus dados foram apagados permanentemente. Obrigado por ter usado o Bull.", "sucesso");
    }

    // ==========================================================================
    // Mostra a telinha de reativação — a pessoa logou numa conta marcada pra
    // exclusão, mas ainda dentro do prazo de 7 dias.
    // ==========================================================================
    function abrirModalReativarConta(usuario, prazoExclusao, referenciaPerfil) {
        textoPrazoExclusao.textContent = `Se você não fizer nada, seus dados vão ser apagados definitivamente em ${formatarDataPtBr(prazoExclusao)}. Quer reativar sua conta e continuar usando o Bull normalmente?`;
        fundoModalReativar.classList.add("aberto");
        botaoReativarConta.disabled = false;

        function limpar() {
            fundoModalReativar.classList.remove("aberto");
            botaoReativarConta.removeEventListener("click", aoReativar);
            botaoSairSemReativar.removeEventListener("click", aoSair);
        }

        async function aoReativar() {
            botaoReativarConta.disabled = true;
            try {
                await updateDoc(referenciaPerfil, { exclusaoAgendadaPara: deleteField() });
                limpar();
                rotearAposLogin(usuario.uid);
            } catch (erro) {
                botaoReativarConta.disabled = false;
                mostrarAviso("Não deu pra reativar agora. Confere sua internet e tenta de novo.");
            }
        }

        async function aoSair() {
            limpar();
            await signOut(auth);
        }

        botaoReativarConta.addEventListener("click", aoReativar);
        botaoSairSemReativar.addEventListener("click", aoSair);
    }

    // Evita rodar a checagem duas vezes pro mesmo login (o app tem dois
    // caminhos que podem chamar isso quase ao mesmo tempo: o próprio
    // onAuthStateChanged, e o redirecionamento manual depois do formulário
    // de login — ver mais abaixo)
    const uidsJaVerificadosParaExclusao = new Set();

    async function verificarExclusaoAntesDeEntrar(usuario) {
        if (uidsJaVerificadosParaExclusao.has(usuario.uid)) return;
        uidsJaVerificadosParaExclusao.add(usuario.uid);

        const referenciaPerfil = doc(db, "usuarios", usuario.uid);
        const instantaneo = await getDoc(referenciaPerfil);
        const dados = instantaneo.exists() ? instantaneo.data() : null;
        const prazoExclusao = dados && dados.exclusaoAgendadaPara ? dados.exclusaoAgendadaPara.toDate() : null;

        if (!prazoExclusao) {
            rotearAposLogin(usuario.uid);
            return;
        }

        if (new Date() < prazoExclusao) {
            esconderSplash();
            abrirModalReativarConta(usuario, prazoExclusao, referenciaPerfil);
            return;
        }

        // O prazo já passou. Só apaga de vez se esse login foi de verdade
        // recente — senão desloga e pede pra entrar de novo com a senha,
        // porque o Firebase exige um login recente pra excluir a conta.
        if (!loginFoiRecente(usuario)) {
            await signOut(auth);
            esconderSplash();
            mostrarAviso("O prazo de exclusão da sua conta terminou. Entra de novo com e-mail e senha pra confirmarmos a exclusão definitiva.");
            return;
        }

        await apagarContaDefinitivamente(usuario);
    }

    function traduzirErro(codigoErro) {
        const mensagens = {
            "auth/invalid-email": "Esse e-mail não parece válido. Confere se digitou certinho.",
            "auth/user-not-found": "Não encontramos uma conta com esse e-mail.",
            "auth/wrong-password": "Senha incorreta. Tenta de novo.",
            "auth/invalid-credential": "E-mail ou senha incorretos.",
            "auth/email-already-in-use": "Já existe uma conta com esse e-mail. Tenta entrar em vez de criar uma nova.",
            "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
            "auth/too-many-requests": "Muitas tentativas seguidas. Espera um pouco antes de tentar de novo.",
            "auth/network-request-failed": "Falha de conexão. Confere sua internet e tenta de novo."
        };
        return mensagens[codigoErro] || "Algo deu errado. Tenta novamente em instantes.";
    }

    // ==========================================================================
    // ESQUECI MINHA SENHA — envia um e-mail com link pra redefinir
    // ==========================================================================
    linkEsqueciSenha.addEventListener("click", async () => {
        esconderAviso();

        const email = campoEmail.value.trim();
        if (!email) {
            mostrarAviso("Digita seu e-mail no campo acima primeiro, depois clica em \"Esqueci minha senha\".");
            return;
        }

        linkEsqueciSenha.disabled = true;

        try {
            await sendPasswordResetEmail(auth, email);
            mostrarAviso("E-mail de redefinição enviado! Confere sua caixa de entrada (e a pasta de spam).", "sucesso");
        } catch (erro) {
            mostrarAviso(traduzirErro(erro.code));
        } finally {
            linkEsqueciSenha.disabled = false;
        }
    });

    function definirCarregando(carregando) {
        botaoEnviar.disabled = carregando;
        spinnerBotao.hidden = !carregando;
        textoBotao.style.opacity = carregando ? "0.7" : "1";
    }

    // ==========================================================================
    // Decide pra onde mandar a pessoa depois do login: se o perfil (nome, idade,
    // profissão) ainda não foi preenchido, vai pro onboarding; se já foi, vai
    // direto pro dashboard.
    // ==========================================================================
    async function rotearAposLogin(uid) {
        const referenciaPerfil = doc(db, "usuarios", uid);
        const instantaneo = await getDoc(referenciaPerfil);

        const perfilCompleto = instantaneo.exists() && instantaneo.data().onboardingCompleto === true;
        window.location.href = perfilCompleto ? "dashboard.html" : "onboarding.html";
    }

    // ==========================================================================
    // LOGIN COM GOOGLE
    // Usa "popup" — o "redirect" depende de um mecanismo de armazenamento
    // entre domínios que navegadores modernos (Chrome, Safari, Firefox) vêm
    // bloqueando cada vez mais por padrão, o que trava o login no meio do
    // caminho (você confirma a conta, mas não completa). O popup não tem
    // essa dependência, e é o que o próprio Firebase recomenda pra isso.
    // O reroteamento em si (dashboard ou onboarding) acontece sozinho pelo
    // onAuthStateChanged lá embaixo, igual no login normal.
    // ==========================================================================
    botaoGoogle.addEventListener("click", async () => {
        const provedorGoogle = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provedorGoogle);
        } catch (erro) {
            if (erro.code === "auth/account-exists-with-different-credential") {
                mostrarAviso("Já existe uma conta com esse e-mail, feita com senha. Entra normalmente com e-mail e senha.");
            } else if (erro.code !== "auth/popup-closed-by-user" && erro.code !== "auth/cancelled-popup-request") {
                mostrarAviso("Não deu pra entrar com o Google agora. Tenta de novo.");
            }
        }
    });

    formulario.addEventListener("submit", async function (evento) {
        evento.preventDefault();
        esconderAviso();

        const email = campoEmail.value.trim();
        const senha = campoSenha.value;

        if (!email || !senha) {
            mostrarAviso("Preenche o e-mail e a senha pra continuar.");
            return;
        }

        if (senha.length < 6) {
            mostrarAviso("A senha precisa ter pelo menos 6 caracteres.");
            return;
        }

        if (modoAtual === "cadastro") {
            const confirmacao = campoConfirmarSenha.value;
            if (senha !== confirmacao) {
                mostrarAviso("As senhas digitadas não são iguais.");
                return;
            }
        }

        definirCarregando(true);

        try {
            if (modoAtual === "cadastro") {
                await createUserWithEmailAndPassword(auth, email, senha);

                // O Firebase loga a pessoa automaticamente ao criar a conta —
                // aqui a gente desloga de propósito, pra ela precisar entrar
                // manualmente na aba "Entrar" depois.
                await signOut(auth);

                mostrarAviso("Conta criada com sucesso! Vai na aba \"Entrar\" pra fazer login.", "sucesso");
                mudarPara("entrar");
                formulario.reset();
                definirCarregando(false);
                return;
            }

            const credencial = await signInWithEmailAndPassword(auth, email, senha);
            mostrarAviso("Login realizado! Redirecionando...", "sucesso");

            setTimeout(() => {
                verificarExclusaoAntesDeEntrar(credencial.user);
            }, 700);

        } catch (erro) {
            mostrarAviso(traduzirErro(erro.code));
        } finally {
            definirCarregando(false);
        }
    });

    // Se a pessoa já estiver logada (o Firebase lembra sozinho), pula a tela de
    // login e já decide pra onde mandar — a splash fica visível até a página
    // trocar de verdade. Se não estiver logada, esconde a splash e mostra o
    // formulário.
    onAuthStateChanged(auth, (usuario) => {
        if (usuario) {
            verificarExclusaoAntesDeEntrar(usuario);
        } else {
            esconderSplash();
        }
    });

});
