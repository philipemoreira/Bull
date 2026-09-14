import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    const formulario = document.getElementById("formulario-onboarding");
    const campoNome = document.getElementById("campo-nome");
    const campoNascimento = document.getElementById("campo-nascimento");
    const campoSalario = document.getElementById("campo-salario");
    aplicarMascaraValor(campoSalario);
    const listaProfissoes = document.getElementById("lista-profissoes");
    const mensagemAviso = document.getElementById("mensagem-aviso");
    const botaoEnviar = document.getElementById("botao-enviar");
    const textoBotao = botaoEnviar.querySelector(".texto-botao");
    const spinnerBotao = botaoEnviar.querySelector(".spinner-botao");

    const etapaPerfil = document.getElementById("etapa-perfil");
    const etapaBancos = document.getElementById("etapa-bancos");
    const listaBancosOnboarding = document.getElementById("lista-bancos-onboarding");
    const botaoAdicionarBancoOnboarding = document.getElementById("botao-adicionar-banco-onboarding");
    const botaoFinalizarOnboarding = document.getElementById("botao-finalizar-onboarding");
    const botaoPularBancos = document.getElementById("botao-pular-bancos");
    const mensagemAvisoBancos = document.getElementById("mensagem-aviso-bancos");

    let uidAtual = null;

    // Converte texto digitado em número — remove pontos (separador de
    // milhar) antes de trocar a vírgula por ponto decimal
    function paraNumero(texto) {
        return parseFloat(String(texto).replace(/\./g, "").replace(",", "."));
    }

    // Aplica a máscara "tipo caixa eletrônico": os dígitos digitados
    // entram sempre da direita pra esquerda (representando centavos), sem
    // precisar digitar vírgula
    function aplicarMascaraValor(input) {
        function reformatar() {
            const digitos = input.value.replace(/\D/g, "");
            if (digitos === "") {
                input.value = "";
                return;
            }
            const centavos = parseInt(digitos, 10);
            const reais = Math.floor(centavos / 100);
            const centavosRestantes = centavos % 100;
            input.value = `${reais},${String(centavosRestantes).padStart(2, "0")}`;
        }
        input.addEventListener("input", () => {
            reformatar();
            input.setSelectionRange(input.value.length, input.value.length);
        });
        input.addEventListener("focus", () => {
            setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
        });
    }

    // ==========================================================================
    // ETAPA 2 — BANCOS (pulável)
    // ==========================================================================
    let contadorLinhasBanco = 0;

    function adicionarLinhaBanco() {
        contadorLinhasBanco++;
        const linha = document.createElement("div");
        linha.className = "linha-banco-onboarding";
        linha.innerHTML = `
            <div class="campo">
                <label>Nome do banco</label>
                <input type="text" class="input-nome-banco-onboarding" placeholder="Ex: Nubank, Sicredi...">
            </div>
            <div class="campo">
                <label>Saldo inicial</label>
                <div class="valor-wrapper">
                    <span class="prefixo-valor">R$</span>
                    <input type="text" inputmode="decimal" class="input-saldo-banco-onboarding" placeholder="0,00">
                </div>
            </div>
            <button type="button" class="botao-remover-linha-banco" aria-label="Remover">✕</button>
        `;
        // O rádio (marca só um por vez) fica numa linha própria, embaixo
        // dos dois campos — mais larga que a coluna de cada input
        const linhaRadio = document.createElement("label");
        linhaRadio.className = "item-checkbox";
        linhaRadio.style.cssText = "width: 100%; margin-top: -6px; margin-bottom: 14px;";
        linhaRadio.innerHTML = `<input type="radio" name="banco-principal-onboarding" class="input-principal-banco-onboarding" ${contadorLinhasBanco === 1 ? "checked" : ""}> Esse é meu banco principal`;
        linha.appendChild(linhaRadio);

        aplicarMascaraValor(linha.querySelector(".input-saldo-banco-onboarding"));

        linha.querySelector(".botao-remover-linha-banco").addEventListener("click", () => {
            const eraPrincipal = linha.querySelector(".input-principal-banco-onboarding").checked;
            linha.remove();
            // Se removeu a linha que estava marcada como principal, marca a
            // primeira que sobrou (pra nunca ficar sem nenhuma selecionada)
            if (eraPrincipal) {
                const primeiraRestante = listaBancosOnboarding.querySelector(".input-principal-banco-onboarding");
                if (primeiraRestante) primeiraRestante.checked = true;
            }
        });
        listaBancosOnboarding.appendChild(linha);
    }

    botaoAdicionarBancoOnboarding.addEventListener("click", adicionarLinhaBanco);

    async function salvarBancosOnboarding() {
        const linhas = listaBancosOnboarding.querySelectorAll(".linha-banco-onboarding");
        const bancosParaSalvar = [];

        linhas.forEach((linha) => {
            const nome = linha.querySelector(".input-nome-banco-onboarding").value.trim();
            const saldoTexto = linha.querySelector(".input-saldo-banco-onboarding").value;
            const principal = linha.querySelector(".input-principal-banco-onboarding").checked;
            // Linhas sem nome são simplesmente ignoradas — a pessoa pode ter
            // clicado "+ Adicionar" e desistido, sem preencher
            if (nome) {
                bancosParaSalvar.push({ nome, saldoInicial: paraNumero(saldoTexto) || 0, principal });
            }
        });

        // Garantia extra: nunca deixa salvar mais de um banco marcado como
        // principal (só o primeiro que encontrar continua marcado)
        let jaTemPrincipal = false;
        bancosParaSalvar.forEach((banco) => {
            if (banco.principal && jaTemPrincipal) banco.principal = false;
            if (banco.principal) jaTemPrincipal = true;
        });

        for (const banco of bancosParaSalvar) {
            await addDoc(collection(db, "usuarios", uidAtual, "bancos"), banco);
        }
    }

    botaoFinalizarOnboarding.addEventListener("click", async () => {
        mensagemAvisoBancos.classList.remove("visivel");
        const spinner = botaoFinalizarOnboarding.querySelector(".spinner-botao");
        botaoFinalizarOnboarding.disabled = true;
        spinner.hidden = false;

        try {
            await salvarBancosOnboarding();
            window.location.href = "dashboard.html";
        } catch (erro) {
            mensagemAvisoBancos.textContent = "Não deu pra salvar os bancos agora. Confere sua internet e tenta de novo, ou pula essa parte.";
            mensagemAvisoBancos.classList.add("visivel");
            botaoFinalizarOnboarding.disabled = false;
            spinner.hidden = true;
        }
    });

    botaoPularBancos.addEventListener("click", () => {
        window.location.href = "dashboard.html";
    });

    // Limita a seleção a no máximo 2 profissões marcadas ao mesmo tempo:
    // quando já tem 2 marcadas, desativa as demais até uma ser desmarcada.
    const checkboxesProfissao = listaProfissoes.querySelectorAll("input[type=checkbox]");
    checkboxesProfissao.forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            const marcados = listaProfissoes.querySelectorAll("input[type=checkbox]:checked");
            const atingiuLimite = marcados.length >= 2;

            checkboxesProfissao.forEach((outro) => {
                if (!outro.checked) {
                    outro.disabled = atingiuLimite;
                }
            });
        });
    });

    // Sem login, não tem como preencher onboarding — manda pra tela de login
    onAuthStateChanged(auth, (usuario) => {
        if (!usuario) {
            window.location.href = "index.html";
            return;
        }
        uidAtual = usuario.uid;
    });

    formulario.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        mensagemAviso.classList.remove("visivel");

        const nome = campoNome.value.trim();
        const dataNascimento = campoNascimento.value;
        const salarioPadrao = parseFloat(campoSalario.value.replace(",", "."));

        // Pega todas as caixinhas marcadas e monta uma lista com os valores delas
        const checkboxesMarcados = listaProfissoes.querySelectorAll("input[type=checkbox]:checked");
        const profissoes = Array.from(checkboxesMarcados).map((checkbox) => checkbox.value);

        if (!nome || !dataNascimento || isNaN(salarioPadrao)) {
            mensagemAviso.textContent = "Preenche nome, data de nascimento e salário pra continuar.";
            mensagemAviso.classList.add("visivel");
            return;
        }

        if (profissoes.length === 0) {
            mensagemAviso.textContent = "Marca pelo menos uma profissão.";
            mensagemAviso.classList.add("visivel");
            return;
        }

        botaoEnviar.disabled = true;
        spinnerBotao.hidden = false;
        textoBotao.style.opacity = "0.7";

        try {
            // "renda" vira "diaria" se Diarista estiver entre as marcadas (mesmo
            // combinada com outras profissões), senão fica "mensal". O dashboard
            // usa esse campo pra decidir se libera o fluxo de ganho diário.
            const renda = profissoes.includes("Diarista") ? "diaria" : "mensal";

            await setDoc(doc(db, "usuarios", uidAtual), {
                nome,
                dataNascimento,
                salarioPadrao,
                profissoes,
                renda,
                onboardingCompleto: true,
                atualizadoEm: serverTimestamp()
            }, { merge: true });

            // Perfil salvo — em vez de já ir pro dashboard, mostra a etapa
            // (pulável) de cadastrar bancos, pra quem quiser já começar
            // com os saldos certos
            etapaPerfil.hidden = true;
            etapaBancos.hidden = false;
            adicionarLinhaBanco(); // já deixa uma linha pronta pra preencher

        } catch (erro) {
            // "permission-denied" aqui normalmente significa que a sessão salva
            // no aparelho não corresponde mais a uma conta de verdade (ex: a
            // conta foi apagada direto no Firebase, mas o navegador ainda
            // "lembrava" de um login antigo) — desloga e explica, em vez de
            // deixar a pessoa perdida numa tela de cadastro que nunca vai salvar
            if (erro.code === "permission-denied") {
                mensagemAviso.textContent = "Sua sessão expirou ou não é mais válida. Redirecionando pro login...";
                mensagemAviso.classList.add("visivel");
                await signOut(auth);
                setTimeout(() => { window.location.href = "index.html"; }, 2000);
                return;
            }

            mensagemAviso.textContent = "Não deu pra salvar agora. Tenta de novo.";
            mensagemAviso.classList.add("visivel");
            botaoEnviar.disabled = false;
            spinnerBotao.hidden = true;
            textoBotao.style.opacity = "1";
        }
    });

});
