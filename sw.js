// ==========================================================================
// SERVICE WORKER
// Um "service worker" é um script que roda em segundo plano, separado da
// página. Ele é o que permite: (1) o navegador oferecer "Instalar app", e
// (2) o app abrir mesmo com internet fraca, usando uma cópia local (cache)
// dos arquivos principais.
// ==========================================================================

const NOME_DO_CACHE = "financas-familia-v131";

// Arquivos essenciais, guardados localmente no primeiro acesso
const ARQUIVOS_ESSENCIAIS = [
    "index.html",
    "onboarding.html",
    "dashboard.html",
    "extrato.html",
    "guardado.html",
    "anotacoes.html",
    "perfil.html",
    "configuracoes.html",
    "cartao.html",
    "conta.html",
    "historico-faturas.html",
    "variaveis.css",
    "style.css",
    "onboarding.css",
    "dashboard.css",
    "extrato.css",
    "anotacoes.css",
    "manifest.json",
    "icone-192.png",
    "icone-512.png",
    "favicon-32.png",
    "favicon-16.png"
];

// Quando o service worker é instalado pela primeira vez, guarda os arquivos essenciais
self.addEventListener("install", (evento) => {
    evento.waitUntil(
        caches.open(NOME_DO_CACHE).then((cache) => cache.addAll(ARQUIVOS_ESSENCIAIS))
    );
    self.skipWaiting();
});

// Remove caches antigos, caso a gente publique uma versão nova depois (NOME_DO_CACHE mudando)
self.addEventListener("activate", (evento) => {
    evento.waitUntil(
        caches.keys().then((chaves) =>
            Promise.all(chaves.filter((chave) => chave !== NOME_DO_CACHE).map((chave) => caches.delete(chave)))
        )
    );
    self.clients.claim();
});

// Estratégia: tenta buscar na internet primeiro; se falhar (sem sinal), usa a cópia local.
// Importante: só faz isso pros arquivos do PRÓPRIO site (mesma origem). Qualquer
// requisição pro Firebase/Google (login, banco de dados, renovação de sessão, etc.)
// passa direto, sem o Service Worker interferir — evita bugs de login "resetando"
// sozinho, que é o que acontecia quando a gente tentava listar domínio por domínio
// e acabava esquecendo algum (como aconteceu com o securetoken.googleapis.com,
// que é usado pra renovar a sessão por trás dos panos).
self.addEventListener("fetch", (evento) => {
    const urlDaRequisicao = new URL(evento.request.url);

    if (urlDaRequisicao.origin !== self.location.origin) {
        return; // não é do nosso site — deixa passar direto, sem mexer
    }

    evento.respondWith(
        fetch(evento.request, { cache: "no-store" }).catch(() => caches.match(evento.request))
    );
});
