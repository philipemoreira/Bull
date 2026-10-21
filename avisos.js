// ==========================================================================
// AVISOS NA TELA — telinha de confirmação e mensagens rápidas (toast).
// Usadas por várias telas; não dependem de nenhum estado do app.
// ==========================================================================

// Substitui o confirm() feio do navegador por uma telinha nas cores do app.
// Devolve uma promessa: true se a pessoa confirmou, false se cancelou.
export function confirmarComTelinha(mensagem, titulo = "Confirmar") {
    const fundo = document.getElementById("fundo-modal-confirmar");
    const tituloEl = document.getElementById("titulo-modal-confirmar");
    const textoEl = document.getElementById("texto-modal-confirmar");
    const botaoConfirmar = document.getElementById("botao-confirmar-acao");
    const botaoCancelar = document.getElementById("botao-cancelar-acao");
    const botaoFechar = document.getElementById("botao-fechar-confirmar");

    return new Promise((resolve) => {
        tituloEl.textContent = titulo;
        textoEl.textContent = mensagem;
        fundo.classList.add("aberto");

        function limpar() {
            fundo.classList.remove("aberto");
            botaoConfirmar.removeEventListener("click", aoConfirmar);
            botaoCancelar.removeEventListener("click", aoCancelar);
            botaoFechar.removeEventListener("click", aoCancelar);
        }
        function aoConfirmar() { limpar(); resolve(true); }
        function aoCancelar() { limpar(); resolve(false); }

        botaoConfirmar.addEventListener("click", aoConfirmar);
        botaoCancelar.addEventListener("click", aoCancelar);
        botaoFechar.addEventListener("click", aoCancelar);
    });
}

let temporizadorDoToast = null;

// Mensagem simples, some sozinha (ex: "Lançamento salvo ✓")
export function mostrarToast(mensagem, duracaoMs = 2200) {
    const toast = document.getElementById("toast");
    const mensagemEl = document.getElementById("toast-mensagem");
    const botaoAcao = document.getElementById("toast-botao-acao");
    if (temporizadorDoToast) clearTimeout(temporizadorDoToast);
    mensagemEl.textContent = mensagem;
    botaoAcao.hidden = true;
    botaoAcao.onclick = null;
    toast.hidden = false;
    temporizadorDoToast = setTimeout(() => { toast.hidden = true; }, duracaoMs);
}

// Mensagem com um botão de ação (ex: "Excluído. Desfazer?"); a ação só
// continua disponível enquanto o toast estiver na tela
export function mostrarToastComAcao(mensagem, textoBotao, aoClicar, duracaoMs = 5000) {
    const toast = document.getElementById("toast");
    const mensagemEl = document.getElementById("toast-mensagem");
    const botaoAcao = document.getElementById("toast-botao-acao");
    if (temporizadorDoToast) clearTimeout(temporizadorDoToast);
    mensagemEl.textContent = mensagem;
    botaoAcao.textContent = textoBotao;
    botaoAcao.hidden = false;
    botaoAcao.onclick = () => {
        clearTimeout(temporizadorDoToast);
        toast.hidden = true;
        aoClicar();
    };
    toast.hidden = false;
    temporizadorDoToast = setTimeout(() => { toast.hidden = true; }, duracaoMs);
}
