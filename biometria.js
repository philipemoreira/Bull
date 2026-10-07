// ==========================================================================
// LOGIN COM BIOMETRIA (WebAuthn) — é um ATALHO local, não substitui o login.
//
// Importante entender: o Bull não tem servidor por trás (é só o app no
// navegador + Firebase). Isso significa que essa biometria NÃO é uma prova
// de identidade verificada por um servidor — é só um "cadeado" local: usa a
// digital, o Face ID ou o PIN do PRÓPRIO aparelho pra confirmar "é a mesma
// pessoa que ativou isso aqui" antes de continuar a sessão que o Firebase
// já mantém salva no navegador (ver firebase-config.js, browserLocalPersistence).
//
// Por causa disso, num aparelho novo a pessoa sempre vai precisar entrar
// com e-mail/senha (ou Google) normalmente, pelo menos uma vez. A biometria
// só acelera reaberturas do app NESSE MESMO aparelho/navegador.
// ==========================================================================

const PREFIXO_CREDENCIAL = "bull_biometria_credencial_";
const PREFIXO_ATIVA = "bull_biometria_ativa_";
const PREFIXO_PERGUNTADO = "bull_biometria_perguntado_";

function bufferParaBase64(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ParaBuffer(base64) {
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return bytes.buffer;
}

// Verifica se esse aparelho/navegador tem um leitor de biometria (ou PIN de
// sistema) disponível. Sempre confere isso antes de oferecer a opção.
export async function suportaBiometria() {
    if (!window.PublicKeyCredential || !navigator.credentials) return false;
    try {
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (erro) {
        return false;
    }
}

// Diz se JÁ existe uma biometria ativada, salva neste aparelho, pra esse uid
export function biometriaAtiva(uid) {
    try {
        return localStorage.getItem(PREFIXO_ATIVA + uid) === "1" && !!localStorage.getItem(PREFIXO_CREDENCIAL + uid);
    } catch (erro) {
        return false;
    }
}

export function desativarBiometria(uid) {
    try {
        localStorage.removeItem(PREFIXO_CREDENCIAL + uid);
        localStorage.removeItem(PREFIXO_ATIVA + uid);
    } catch (erro) { /* localStorage bloqueado — não tem o que fazer */ }
}

// Controla se a pergunta "quer ativar biometria?" já foi feita nesse
// aparelho pra esse uid — pra perguntar só uma vez, não toda hora que a
// pessoa loga de novo (ver app.js, logo após um login manual bem-sucedido)
export function biometriaJaPerguntada(uid) {
    try {
        return localStorage.getItem(PREFIXO_PERGUNTADO + uid) === "1";
    } catch (erro) {
        return false;
    }
}

export function marcarBiometriaPerguntada(uid) {
    try {
        localStorage.setItem(PREFIXO_PERGUNTADO + uid, "1");
    } catch (erro) { /* localStorage bloqueado */ }
}

// Cria uma credencial nova NESSE aparelho (o próprio sistema decide se pede
// digital, Face ID ou PIN — o Bull não escolhe isso)
export async function ativarBiometria(uid, email, nomeExibicao) {
    const desafio = crypto.getRandomValues(new Uint8Array(32));
    const idUsuario = new TextEncoder().encode(uid);

    const credencial = await navigator.credentials.create({
        publicKey: {
            challenge: desafio,
            rp: { name: "Bull", id: window.location.hostname },
            user: {
                id: idUsuario,
                name: email || "usuario@bull",
                displayName: nomeExibicao || email || "Usuário Bull"
            },
            pubKeyCredParams: [
                { type: "public-key", alg: -7 },   // ES256
                { type: "public-key", alg: -257 }  // RS256
            ],
            authenticatorSelection: {
                authenticatorAttachment: "platform",
                userVerification: "required"
            },
            timeout: 60000,
            attestation: "none"
        }
    });

    if (!credencial) throw new Error("Não foi possível criar a credencial biométrica.");

    try {
        localStorage.setItem(PREFIXO_CREDENCIAL + uid, bufferParaBase64(credencial.rawId));
        localStorage.setItem(PREFIXO_ATIVA + uid, "1");
    } catch (erro) {
        throw new Error("Não deu pra salvar a biometria nesse aparelho.");
    }
}

// Pede a confirmação biométrica pra "destravar" a sessão que já estava salva
export async function verificarBiometria(uid) {
    let idSalvoBase64;
    try {
        idSalvoBase64 = localStorage.getItem(PREFIXO_CREDENCIAL + uid);
    } catch (erro) {
        throw new Error("Não deu pra ler a biometria salva nesse aparelho.");
    }
    if (!idSalvoBase64) throw new Error("Nenhuma biometria ativada nesse aparelho.");

    const desafio = crypto.getRandomValues(new Uint8Array(32));

    const resultado = await navigator.credentials.get({
        publicKey: {
            challenge: desafio,
            allowCredentials: [{ id: base64ParaBuffer(idSalvoBase64), type: "public-key" }],
            userVerification: "required",
            timeout: 60000
        }
    });

    return !!resultado;
}
