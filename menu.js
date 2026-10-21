// ==========================================================================
// Menu lateral, tema, troca de mês e avisos automáticos (conselho, correções, aniversário)
// (separado de dashboard.js; recebe da tela inicial só o que precisa, em "ctx")
// ==========================================================================
import { mesReferenciaString } from "./util.js";
import { db } from "./firebase-config.js";
import { collection, setDoc, doc, getDocs, query, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { NOMES_MESES, LIMITE_NAVEGACAO_SUPERIOR, LIMITE_NAVEGACAO_INFERIOR } from "./constantes.js";

export function iniciarMenuPeriodoERotinas(ctx) {
    // ==========================================================================
    // 4. MENU LATERAL
    // ==========================================================================
    function abrirMenuLateral() {
        ctx.painelMenu.classList.add("aberto");
        ctx.overlayMenu.classList.add("aberto");
    }

    function fecharMenuLateral() {
        ctx.painelMenu.classList.remove("aberto");
        ctx.overlayMenu.classList.remove("aberto");
    }

    ctx.botaoFecharMenuLateral.addEventListener("click", fecharMenuLateral);
    ctx.overlayMenu.addEventListener("click", fecharMenuLateral);
    if (ctx.botaoMaisNavInferior) {
        ctx.botaoMaisNavInferior.addEventListener("click", abrirMenuLateral);
    }

    // Quando o "Mais" é clicado em outra tela (Extrato, Guardado, Cartões,
    // Lembretes, Configurações), ela não tem o menu lateral construído — só
    // existe aqui no Dashboard. Por isso o link delas manda pra cá com
    // "?menu=1", e a gente abre o menu sozinho assim que a página carrega,
    // em vez de deixar a pessoa cair sem querer na tela inicial.
    if (new URLSearchParams(window.location.search).get("menu") === "1") {
        abrirMenuLateral();
        history.replaceState(null, "", window.location.pathname);
    }

    // ==========================================================================
    // TEMA CLARO / ESCURO — só troca a aparência, nada de dados. A escolha
    // fica salva no aparelho (localStorage), não na conta, então cada
    // aparelho lembra o tema dele.
    // ==========================================================================
    const CHAVE_TEMA = "bull_tema";
    const metaCorTema = document.querySelector('meta[name="theme-color"]');

    function atualizarMetaCorTema() {
        if (!metaCorTema) return;
        const estaClaro = document.documentElement.getAttribute("data-tema") === "claro";
        metaCorTema.setAttribute("content", estaClaro ? "#FAF9F5" : "#0A0A0A");
    }
    atualizarMetaCorTema();

    if (ctx.botaoTema) {
        ctx.botaoTema.addEventListener("click", () => {
            const estaClaro = document.documentElement.getAttribute("data-tema") === "claro";
            if (estaClaro) {
                document.documentElement.removeAttribute("data-tema");
                localStorage.setItem(CHAVE_TEMA, "escuro");
            } else {
                document.documentElement.setAttribute("data-tema", "claro");
                localStorage.setItem(CHAVE_TEMA, "claro");
            }
            atualizarMetaCorTema();
        });
    }

    // ==========================================================================
    // 5. NAVEGAÇÃO ENTRE MESES E ANOS (com limite até dezembro do ano corrente)
    // ==========================================================================
    ctx.mesAnteriorBtn.addEventListener("click", () => mudarPeriodo(-1));
    ctx.mesProximoBtn.addEventListener("click", () => mudarPeriodo(1));
    ctx.anoAnteriorBtn.addEventListener("click", () => mudarPeriodo(-12));
    ctx.anoProximoBtn.addEventListener("click", () => mudarPeriodo(12));

    function mudarPeriodo(mesesParaSomar) {
        const novaData = new Date(ctx.mesSelecionado.getFullYear(), ctx.mesSelecionado.getMonth() + mesesParaSomar, 1);

        if (novaData > LIMITE_NAVEGACAO_SUPERIOR) {
            ctx.mesSelecionado = new Date(LIMITE_NAVEGACAO_SUPERIOR);
        } else if (novaData < LIMITE_NAVEGACAO_INFERIOR) {
            ctx.mesSelecionado = new Date(LIMITE_NAVEGACAO_INFERIOR);
        } else {
            ctx.mesSelecionado = novaData;
        }

        atualizarRotuloMes();
        ctx.escutarLancamentosDoMes();
        ctx.escutarPendenciasDoMes();
        ctx.buscarGastosMesAnterior();
    }

    // Volta do segundo plano (celular) ou da internet caindo: refaz as
    // escutas principais — o app aberto há muito tempo pode ficar com dados
    // velhos ou incompletos até a pessoa trocar de mês
    let ultimaVezEscondido = 0;
    function recarregarEscutasPrincipais() {
        if (!ctx.uidAtual) return;
        ctx.escutarLancamentosDoMes();
        ctx.escutarPendenciasDoMes();
        ctx.buscarGastosMesAnterior();
        ctx.escutarResumoFaturaCartoes();
    }
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) { ultimaVezEscondido = Date.now(); return; }
        if (ultimaVezEscondido && Date.now() - ultimaVezEscondido > 15000) recarregarEscutasPrincipais();
    });
    window.addEventListener("online", recarregarEscutasPrincipais);

    function atualizarRotuloMes() {
        ctx.rotuloMes.textContent = `${NOMES_MESES[ctx.mesSelecionado.getMonth()]} ${ctx.mesSelecionado.getFullYear()}`;

        const noLimiteSuperior = ctx.mesSelecionado.getFullYear() === LIMITE_NAVEGACAO_SUPERIOR.getFullYear()
            && ctx.mesSelecionado.getMonth() === LIMITE_NAVEGACAO_SUPERIOR.getMonth();
        const noLimiteInferior = ctx.mesSelecionado.getFullYear() === LIMITE_NAVEGACAO_INFERIOR.getFullYear()
            && ctx.mesSelecionado.getMonth() === LIMITE_NAVEGACAO_INFERIOR.getMonth();

        ctx.mesProximoBtn.disabled = noLimiteSuperior;
        ctx.anoProximoBtn.disabled = noLimiteSuperior;
        ctx.mesAnteriorBtn.disabled = noLimiteInferior;
        ctx.anoAnteriorBtn.disabled = noLimiteInferior;

        // O link "Ver extrato completo" da tela inicial sempre abre já filtrado
        // no mês que está sendo visto no momento (o extrato em si permite trocar
        // o filtro depois, incluindo ver todos os meses)
        const mesParaUrl = String(ctx.mesSelecionado.getMonth() + 1).padStart(2, "0");
        ctx.linkExtrato.href = `extrato.html?mes=${ctx.mesSelecionado.getFullYear()}-${mesParaUrl}`;
    }

    // ==========================================================================
    // CONSELHO FINANCEIRO — checa se o total guardado (histórico completo) está
    // zerado, e mostra um aviso amigável uma vez por mês (nos primeiros dias)
    // ==========================================================================
    async function verificarConselhoMensal(perfil) {
        const hoje = new Date();
        if (hoje.getDate() > 3) return; // só nos primeiros dias do mês

        const chaveDoMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
        if (perfil.ultimoAvisoConselho === chaveDoMes) return; // já mostrou esse mês

        // consulta simples, sem índice composto: soma tudo que já foi guardado
        const referenciaLancamentos = collection(db, "usuarios", ctx.uidAtual, "lancamentos");
        const consultaGuardado = query(referenciaLancamentos, where("categoria", "==", "Guardar Dinheiro"));
        const resultado = await getDocs(consultaGuardado);

        let totalGuardado = 0;
        resultado.forEach((documento) => { totalGuardado += documento.data().valor; });

        if (totalGuardado <= 0) {
            ctx.fundoModalConselho.classList.add("aberto");
        }

        // Marca que já verificou esse mês, pra não mostrar de novo até o próximo
        await setDoc(doc(db, "usuarios", ctx.uidAtual), { ultimoAvisoConselho: chaveDoMes }, { merge: true });
    }

    ctx.botaoFecharConselho.addEventListener("click", () => {
        ctx.fundoModalConselho.classList.remove("aberto");
    });

    // ==========================================================================
    // PENDÊNCIAS ANTIGAS — avisa se tem gasto fixo/parcela de 2+ meses atrás
    // que nunca foi marcado como pago, pra pessoa não perder o controle do
    // saldo por esquecimento
    // ==========================================================================
    let mesMaisAntigoComPendencia = null;

    // ==========================================================================
    // CORREÇÃO AUTOMÁTICA — lançamentos criados antes da separação entre
    // "data exibida" e "mês que conta" (mesReferencia) não têm esse campo
    // ainda. Roda uma vez por login: qualquer lançamento sem mesReferencia
    // recebe um, calculado a partir da própria data dele — assim, nenhum
    // lançamento antigo "some" de nenhuma tela depois dessa atualização.
    // ==========================================================================
    async function migrarLancamentosAntigos() {
        const referencia = collection(db, "usuarios", ctx.uidAtual, "lancamentos");
        const todosOsLancamentos = await getDocs(referencia);

        const semMesReferencia = todosOsLancamentos.docs.filter((documento) => !documento.data().mesReferencia);

        if (semMesReferencia.length > 0) {
            // writeBatch aguenta até 500 operações — divide em pedaços por
            // segurança, caso alguém tenha uma quantidade grande de lançamentos
            for (let inicio = 0; inicio < semMesReferencia.length; inicio += 450) {
                const pedaco = semMesReferencia.slice(inicio, inicio + 450);
                const lote = writeBatch(db);
                pedaco.forEach((documento) => {
                    const dataDoLancamento = documento.data().data.toDate();
                    lote.update(documento.ref, { mesReferencia: mesReferenciaString(dataDoLancamento) });
                });
                await lote.commit();
            }
        }

        // Marca no perfil que essa correção já rodou — sem isso, o app teria
        // que buscar TODOS os lançamentos (mesmo já corrigidos) todo santo
        // login, o que ia ficando cada vez mais lento conforme o histórico
        // crescesse. Com a marca, roda de verdade só uma vez na vida.
        await setDoc(doc(db, "usuarios", ctx.uidAtual), { migracaoMesReferenciaConcluida: true }, { merge: true });
    }

    // ==========================================================================
    // CORREÇÃO AUTOMÁTICA — pendências criadas antes de existir a função
    // "Comprar no Cartão" nunca ganharam o campo "noCartao" (ele só passou a
    // existir quando essa função foi criada). Sem esse campo, a consulta de
    // "Pagamentos Pendentes" (que filtra noCartao == false) nunca encontra
    // esses itens antigos — mesmo sendo gasto fixo/parcelado normal, ficam
    // invisíveis pra sempre. Roda uma vez por login: toda pendência sem o
    // campo recebe noCartao: false (não tem outra opção que ela possa ser,
    // já que "cartão" nem existia como conceito quando ela foi criada).
    // ==========================================================================
    async function migrarPendenciasSemCampoNoCartao() {
        const referencia = collection(db, "usuarios", ctx.uidAtual, "pendencias");
        const todasAsPendencias = await getDocs(referencia);

        const semCampoNoCartao = todasAsPendencias.docs.filter((documento) => documento.data().noCartao === undefined);

        if (semCampoNoCartao.length > 0) {
            for (let inicio = 0; inicio < semCampoNoCartao.length; inicio += 450) {
                const pedaco = semCampoNoCartao.slice(inicio, inicio + 450);
                const lote = writeBatch(db);
                pedaco.forEach((documento) => {
                    lote.update(documento.ref, { noCartao: false });
                });
                await lote.commit();
            }
        }

        await setDoc(doc(db, "usuarios", ctx.uidAtual), { migracaoNoCartaoConcluida: true }, { merge: true });
    }

    async function verificarPendenciasAntigas() {
        const referencia = collection(db, "usuarios", ctx.uidAtual, "pendencias");
        // Só um filtro de igualdade aqui — não precisa de índice composto
        const consulta = query(referencia, where("pago", "==", false));
        const resultado = await getDocs(consulta);

        const hoje = new Date();
        const chaveMesAtual = hoje.getFullYear() * 12 + hoje.getMonth();

        let contagemAntigas = 0;
        mesMaisAntigoComPendencia = null;
        let chaveMaisAntiga = Infinity;

        resultado.forEach((documento) => {
            const dados = documento.data();
            const [ano, mes] = dados.mesReferencia.split("-").map(Number);
            const chaveDoDocumento = ano * 12 + (mes - 1);

            // "Antiga" = de 2 meses atrás ou mais (dá uma folga de 1 mês,
            // que é normal a pessoa só confirmar depois que a fatura chega)
            if (chaveMesAtual - chaveDoDocumento >= 2) {
                contagemAntigas++;
                if (chaveDoDocumento < chaveMaisAntiga) {
                    chaveMaisAntiga = chaveDoDocumento;
                    mesMaisAntigoComPendencia = { ano, mes: mes - 1 };
                }
            }
        });

        if (contagemAntigas > 0) {
            ctx.textoPendenciasAntigas.textContent = `Você tem ${contagemAntigas} pendência${contagemAntigas > 1 ? "s" : ""} de gasto fixo/parcela de 2 meses atrás ou mais, ainda não confirmada${contagemAntigas > 1 ? "s" : ""}. Vale a pena revisar, pra manter o saldo certinho.`;
            ctx.fundoModalPendenciasAntigas.classList.add("aberto");
        }
    }

    ctx.botaoFecharPendenciasAntigas.addEventListener("click", () => {
        ctx.fundoModalPendenciasAntigas.classList.remove("aberto");
    });

    ctx.botaoVerPendenciasAntigas.addEventListener("click", () => {
        ctx.fundoModalPendenciasAntigas.classList.remove("aberto");
        if (mesMaisAntigoComPendencia) {
            ctx.mesSelecionado = new Date(mesMaisAntigoComPendencia.ano, mesMaisAntigoComPendencia.mes, 1);
            atualizarRotuloMes();
            ctx.escutarLancamentosDoMes();
            ctx.escutarPendenciasDoMes();
            ctx.buscarGastosMesAnterior();
        }
    });

    // ==========================================================================
    // ANIVERSÁRIO — compara dia/mês de nascimento com hoje; mostra 1x por ano
    // ==========================================================================
    async function verificarAniversario(perfil) {
        if (!perfil.dataNascimento) return;

        const hoje = new Date();
        const anoAtual = String(hoje.getFullYear());
        if (perfil.ultimoParabens === anoAtual) return; // já mostrou esse ano

        // dataNascimento vem como texto "AAAA-MM-DD" do campo de data
        const [, mesNascimento, diaNascimento] = perfil.dataNascimento.split("-").map(Number);

        const ehAniversario = (hoje.getMonth() + 1) === mesNascimento && hoje.getDate() === diaNascimento;
        if (!ehAniversario) return;

        ctx.textoAniversario.textContent = ctx.primeiroNome
            ? `Feliz aniversário, ${ctx.primeiroNome}! Que esse novo ano venha com muita saúde e as finanças sempre no verde. 🎂`
            : "Feliz aniversário! Que esse novo ano venha com muita saúde e as finanças sempre no verde. 🎂";

        ctx.fundoModalAniversario.classList.add("aberto");
        await setDoc(doc(db, "usuarios", ctx.uidAtual), { ultimoParabens: anoAtual }, { merge: true });
    }

    ctx.botaoFecharAniversario.addEventListener("click", () => {
        ctx.fundoModalAniversario.classList.remove("aberto");
    });


    return { atualizarRotuloMes, verificarConselhoMensal, migrarLancamentosAntigos, migrarPendenciasSemCampoNoCartao, verificarPendenciasAntigas, verificarAniversario };
}
