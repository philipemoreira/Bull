// ==========================================================================
// MODO PRIVACIDADE
// Um botão de olho, sempre no topo da tela, que borra de uma vez só todos
// os valores em R$ visíveis ali — pra dar uma olhada rápida no app do lado
// de alguém sem mostrar quanto tem/gasta. A preferência fica salva no
// aparelho (localStorage, igual ao tema) e vale pra todas as telas: se
// ativar no Dashboard e for pro Extrato, continua borrado lá também.
//
// Esse arquivo é importado (não duplicado) por cada página que tem o botão,
// igual o firebase-config.js — só que sem precisar de nenhum dado do
// Firebase, então funciona mesmo antes do login confirmar.
// ==========================================================================

const CHAVE_PRIVACIDADE = "bull_privacidade_oculta";

const ICONE_OLHO_ABERTO = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/>
        <circle cx="12" cy="12" r="3"/>
    </svg>
`;

const ICONE_OLHO_FECHADO = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M3 3l18 18"/>
        <path d="M10.6 5.1A11.6 11.6 0 0 1 23 12s-1.7 3-4.6 5M6.6 6.6C3.9 8.4 1 12 1 12s4 7 11 7c1.6 0 3.1-.3 4.4-.9"/>
        <path d="M9.9 10a3 3 0 0 0 4.2 4.1"/>
    </svg>
`;

/**
 * Liga o botão de privacidade da página atual (se ela tiver um elemento
 * com id="botao-privacidade"). Chamar uma vez, ao carregar a página.
 */
export function iniciarModoPrivacidade() {
    const botao = document.getElementById("botao-privacidade");
    if (!botao) return;

    function aplicar(oculto) {
        document.documentElement.classList.toggle("privacidade-ativa", oculto);
        botao.innerHTML = oculto ? ICONE_OLHO_FECHADO : ICONE_OLHO_ABERTO;
        botao.setAttribute("aria-label", oculto ? "Mostrar valores" : "Esconder valores");
    }

    let oculto = false;
    try {
        oculto = localStorage.getItem(CHAVE_PRIVACIDADE) === "1";
    } catch (erro) {
        // localStorage bloqueado (raro) — só não lembra a preferência entre visitas
    }
    aplicar(oculto);

    botao.addEventListener("click", () => {
        oculto = !oculto;
        aplicar(oculto);
        try {
            localStorage.setItem(CHAVE_PRIVACIDADE, oculto ? "1" : "0");
        } catch (erro) {
            // segue funcionando nessa visita, só não salva pra próxima
        }
    });
}
