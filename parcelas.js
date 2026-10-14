// Depois de excluir uma parcela, refaz a contagem do parcelamento:
// "Parcela 3/4" vira "Parcela 3/3" etc. Também atualiza o total da compra.
import { db } from "./firebase-config.js";
import {
    collection, doc, getDocs, query, where, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function reajustarParcelas(uid, grupoId) {
    if (!grupoId) return;
    try {
        const resultado = await getDocs(query(collection(db, "usuarios", uid, "pendencias"), where("grupoId", "==", grupoId)));
        const parcelas = resultado.docs.filter((d) => d.data().origem === "parcelado");
        if (parcelas.length === 0) return;
        parcelas.sort((a, b) => (a.data().numeroParcela || 0) - (b.data().numeroParcela || 0));
        const total = parcelas.length;
        const somaValores = Math.round(parcelas.reduce((s, d) => s + (d.data().valor || 0), 0) * 100) / 100;
        const lote = writeBatch(db);
        parcelas.forEach((d, i) => {
            lote.update(doc(db, "usuarios", uid, "pendencias", d.id), {
                numeroParcela: i + 1,
                totalParcelas: total,
                valorTotalCompra: somaValores
            });
        });
        await lote.commit();
    } catch (erro) {
        console.error("Não deu pra reajustar as parcelas:", erro);
    }
}
