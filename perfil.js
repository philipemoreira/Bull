import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    const mensagemAviso = document.getElementById("mensagem-aviso");
    const formulario = document.getElementById("formulario-perfil");
    const campoNome = document.getElementById("campo-nome");
    const campoNascimento = document.getElementById("campo-nascimento");
    const campoSalario = document.getElementById("campo-salario");
    const listaProfissoes = document.getElementById("lista-profissoes");
    const botaoSalvar = document.getElementById("botao-salvar-perfil");
    const textoBotao = botaoSalvar.querySelector(".texto-botao");
    const spinnerBotao = botaoSalvar.querySelector(".spinner-botao");
    const emailAtual = document.getElementById("email-atual");

    let uidAtual = null;

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
    aplicarMascaraValor(campoSalario);

    // Limita a seleção a no máximo 2 profissões marcadas ao mesmo tempo
    const checkboxesProfissao = listaProfissoes.querySelectorAll("input[type=checkbox]");
    checkboxesProfissao.forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            const marcados = listaProfissoes.querySelectorAll("input[type=checkbox]:checked");
            const atingiuLimite = marcados.length >= 2;
            checkboxesProfissao.forEach((outro) => {
                if (!outro.checked) outro.disabled = atingiuLimite;
            });
        });
    });

    onAuthStateChanged(auth, async (usuario) => {
        if (!usuario) {
            window.location.href = "index.html";
            return;
        }
        uidAtual = usuario.uid;
        emailAtual.textContent = usuario.email;

        const perfilSnapshot = await getDoc(doc(db, "usuarios", uidAtual));
        if (!perfilSnapshot.exists()) return;

        const perfil = perfilSnapshot.data();
        campoNome.value = perfil.nome || "";
        campoNascimento.value = perfil.dataNascimento || "";
        campoSalario.value = perfil.salarioPadrao ? perfil.salarioPadrao.toFixed(2).replace(".", ",") : "";

        const profissoesAtuais = Array.isArray(perfil.profissoes) ? perfil.profissoes : [];
        checkboxesProfissao.forEach((checkbox) => {
            checkbox.checked = profissoesAtuais.includes(checkbox.value);
        });
    });

    formulario.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        mensagemAviso.classList.remove("visivel");

        const nome = campoNome.value.trim();
        const dataNascimento = campoNascimento.value;
        const salarioPadrao = parseFloat(campoSalario.value.replace(/\./g, "").replace(",", "."));
        const profissoes = [...listaProfissoes.querySelectorAll("input[type=checkbox]:checked")].map((c) => c.value);

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

        botaoSalvar.disabled = true;
        spinnerBotao.hidden = false;

        try {
            const renda = profissoes.includes("Diarista") ? "diaria" : "mensal";

            await setDoc(doc(db, "usuarios", uidAtual), {
                nome,
                dataNascimento,
                salarioPadrao,
                profissoes,
                renda,
                atualizadoEm: serverTimestamp()
            }, { merge: true });

            mensagemAviso.textContent = "Perfil atualizado com sucesso!";
            mensagemAviso.classList.add("visivel", "sucesso");
        } catch (erro) {
            mensagemAviso.textContent = "Não deu pra salvar agora. Tenta de novo.";
            mensagemAviso.classList.add("visivel");
        } finally {
            botaoSalvar.disabled = false;
            spinnerBotao.hidden = true;
        }
    });

});
