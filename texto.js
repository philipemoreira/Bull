// ==========================================================================
// TEXTO SEGURO — nomes digitados pela pessoa (compra, categoria, banco...)
// passam por aqui antes de entrar no HTML da tela. Símbolos como < > & "
// viram texto comum, então nunca quebram o layout nem rodam como código.
// ==========================================================================
export function escaparHtml(texto) {
    return String(texto ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
