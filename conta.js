import { auth } from "./firebase-config.js";
import {
    onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential,
    updateEmail, updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

document.addEventListener("DOMContentLoaded", function () {

    const campoSenhaAtual = document.getElementById("campo-senha-atual");
    const botaoOlhoAtual = document.getElementById("botao-olho-atual");

    const campoNovoEmail = document.getElementById("campo-novo-email");
    const mensagemAvisoEmail = document.getElementById("mensagem-aviso-email");
    const botaoSalvarEmail = document.getElementById("botao-salvar-email");
    const spinnerEmail = botaoSalvarEmail.querySelector(".spinner-botao");

    const campoNovaSenha = document.getElementById("campo-nova-senha");
    const campoConfirmarNovaSenha = document.getElementById("campo-confirmar-nova-senha");
    const mensagemAvisoSenha = document.getElementById("mensagem-aviso-senha");
    const botaoSalvarSenha = document.getElementById("botao-salvar-senha");
    const spinnerSenha = botaoSalvarSenha.querySelector(".spinner-botao");

    const toast = document.getElementById("toast");
    const toastMensagem = document.getElementById("toast-mensagem");
    const toastBotaoAcao = document.getElementById("toast-botao-acao");

    let usuarioAtual = null;

    onAuthStateChanged(auth, (usuario) => {
        if (!usuario) {
            window.location.href = "index.html";
            return;
        }
        usuarioAtual = usuario;
        campoNovoEmail.placeholder = usuario.email;
    });

    // Olhinho de mostrar/esconder em todos os campos de senha dessa tela
    [
        [botaoOlhoAtual, campoSenhaAtual],
        [document.getElementById("botao-olho-nova"), campoNovaSenha],
        [document.getElementById("botao-olho-confirmar-nova"), campoConfirmarNovaSenha]
    ].forEach(([botao, campo]) => {
        botao.addEventListener("click", () => {
            const estaEscondida = campo.type === "password";
            campo.type = estaEscondida ? "text" : "password";
            botao.setAttribute("aria-label", estaEscondida ? "Esconder senha" : "Mostrar senha");
        });
    });

    function mostrarToast(mensagem, duracaoMs = 2500) {
        toastBotaoAcao.hidden = true;
        toastMensagem.textContent = mensagem;
        toast.hidden = false;
        setTimeout(() => { toast.hidden = true; }, duracaoMs);
    }

    // Reautentica com a senha atual — o Firebase exige isso pra qualquer
    // troca de e-mail/senha, por segurança, mesmo se a pessoa já está logada
    async function reautenticar() {
        const senhaAtual = campoSenhaAtual.value;
        if (!senhaAtual) {
            throw new Error("Digita sua senha atual primeiro, ali em cima.");
        }
        const credencial = EmailAuthProvider.credential(usuarioAtual.email, senhaAtual);
        try {
            await reauthenticateWithCredential(usuarioAtual, credencial);
        } catch (erro) {
            throw new Error("Senha atual incorreta.");
        }
    }

    botaoSalvarEmail.addEventListener("click", async () => {
        mensagemAvisoEmail.classList.remove("visivel");
        const novoEmail = campoNovoEmail.value.trim();

        if (!novoEmail) {
            mensagemAvisoEmail.textContent = "Digita o novo e-mail.";
            mensagemAvisoEmail.classList.add("visivel");
            return;
        }

        botaoSalvarEmail.disabled = true;
        spinnerEmail.hidden = false;

        try {
            await reautenticar();
            await updateEmail(usuarioAtual, novoEmail);
            campoSenhaAtual.value = "";
            campoNovoEmail.value = "";
            campoNovoEmail.placeholder = novoEmail;
            mostrarToast("E-mail atualizado ✓");
        } catch (erro) {
            mensagemAvisoEmail.textContent = erro.message.includes("Senha atual")
                ? erro.message
                : (erro.code === "auth/email-already-in-use"
                    ? "Esse e-mail já está sendo usado por outra conta."
                    : erro.message || "Não deu pra trocar o e-mail agora. Tenta de novo.");
            mensagemAvisoEmail.classList.add("visivel");
        } finally {
            botaoSalvarEmail.disabled = false;
            spinnerEmail.hidden = true;
        }
    });

    botaoSalvarSenha.addEventListener("click", async () => {
        mensagemAvisoSenha.classList.remove("visivel");
        const novaSenha = campoNovaSenha.value;
        const confirmarSenha = campoConfirmarNovaSenha.value;

        if (!novaSenha || novaSenha.length < 6) {
            mensagemAvisoSenha.textContent = "A nova senha precisa ter pelo menos 6 caracteres.";
            mensagemAvisoSenha.classList.add("visivel");
            return;
        }
        if (novaSenha !== confirmarSenha) {
            mensagemAvisoSenha.textContent = "As duas senhas digitadas não são iguais.";
            mensagemAvisoSenha.classList.add("visivel");
            return;
        }

        botaoSalvarSenha.disabled = true;
        spinnerSenha.hidden = false;

        try {
            await reautenticar();
            await updatePassword(usuarioAtual, novaSenha);
            campoSenhaAtual.value = "";
            campoNovaSenha.value = "";
            campoConfirmarNovaSenha.value = "";
            mostrarToast("Senha atualizada ✓");
        } catch (erro) {
            mensagemAvisoSenha.textContent = erro.message || "Não deu pra trocar a senha agora. Tenta de novo.";
            mensagemAvisoSenha.classList.add("visivel");
        } finally {
            botaoSalvarSenha.disabled = false;
            spinnerSenha.hidden = true;
        }
    });

});
