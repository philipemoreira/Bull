// ==========================================================================
// SENHA DE 8 DÍGITOS DO APP (o "PIN")
//
// É a senha que a pessoa usa pra ENTRAR NO APP depois de já ter logado na
// conta (a senha da conta serve só pro login). Nunca guardamos o número em
// si: só um "embaralhado" irreversível (hash PBKDF2 + sal aleatório), dentro
// do perfil da própria pessoa no Firestore. Assim vale em qualquer aparelho.
// ==========================================================================

const ITERACOES = 150000;

function paraBase64(bytes) {
    let texto = "";
    bytes.forEach((b) => { texto += String.fromCharCode(b); });
    return btoa(texto);
}

function deBase64(base64) {
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export function pinValido(pin) {
    return typeof pin === "string" && /^\d{8}$/.test(pin);
}

async function embaralhar(pin, sal, iteracoes) {
    const material = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: sal, iterations: iteracoes, hash: "SHA-256" }, material, 256
    );
    return paraBase64(new Uint8Array(bits));
}

// Devolve o objeto que vai pro Firestore (campo "pinSenha" do perfil)
export async function criarRegistroPin(pin) {
    if (!pinValido(pin)) throw new Error("A senha precisa ter exatamente 8 números.");
    const sal = crypto.getRandomValues(new Uint8Array(16));
    return { sal: paraBase64(sal), hash: await embaralhar(pin, sal, ITERACOES), iteracoes: ITERACOES };
}

export async function conferirPin(pin, registro) {
    if (!pinValido(pin) || !registro || !registro.sal || !registro.hash) return false;
    const hash = await embaralhar(pin, deBase64(registro.sal), registro.iteracoes || ITERACOES);
    return hash === registro.hash;
}
