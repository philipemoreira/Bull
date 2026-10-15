// Gasto dividido (ex: parte minha + parte da minha mãe): os dois pedaços
// ficam ligados pelo mesmo "divisaoId". Ao excluir um, pergunta se quer
// excluir o outro também.
import { db } from "./firebase-config.js";
import {
    collection, doc, getDocs, deleteDoc, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// colecao: "lancamentos" ou "pendencias". Devolve true se apagou a outra parte.
export async function excluirOutraParte(uid, colecao, divisaoId, idAtual, perguntar) {
    if (!divisaoId) return false;
    try {
        const resultado = await getDocs(query(collection(db, "usuarios", uid, colecao), where("divisaoId", "==", divisaoId)));
        const outras = resultado.docs.filter((d) => d.id !== idAtual);
        if (outras.length === 0) return false;
        const quer = await perguntar(
            "Esse gasto foi dividido em duas partes (a sua e a de repasse). Quer excluir a outra parte também?",
            "Excluir a outra parte?"
        );
        if (!quer) return false;
        for (const d of outras) {
            const lancId = d.data().lancamentoId;
            if (colecao === "pendencias" && lancId) {
                await deleteDoc(doc(db, "usuarios", uid, "lancamentos", lancId)).catch(() => {});
            }
            await deleteDoc(d.ref);
        }
        return true;
    } catch (erro) {
        console.error("Não deu pra excluir a outra parte:", erro);
        return false;
    }
}
