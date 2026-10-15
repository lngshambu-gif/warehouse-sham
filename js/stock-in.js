async function apiJSON(url, options = {}) {
    const r = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || d.error || `Request failed (${r.status})`);
    return d;
}

const escHTML = v =>
    String(v ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[c]);

const form = document.getElementById("movementForm");
const productSelect = document.getElementById("productSelect");
const quantityInput = document.getElementById("quantity");
const noteInput = document.getElementById("note");
const submitButton = document.getElementById("submitButton");
const message = document.getElementById("message");
const historyBody = document.getElementById("history");
const refreshBtn = document.getElementById("refresh");

function say(text, type = "") {
    if (!message) return;
    message.textContent = text;
    message.className = type ? `notice ${type} show` : "notice";
    message.style.display = text ? "block" : "none";
}

let allProducts = [];

function updateSelectedPreview() {
    const previewCard = document.getElementById("productPreview");
    const previewImg = document.getElementById("previewImg");
    const previewName = document.getElementById("previewName");
    const previewStock = document.getElementById("previewStock");
    if (!previewCard) return;

    const selectedId = Number(productSelect.value);
    const prod = allProducts.find(p => Number(p.product_id) === selectedId);

    if (prod) {
        previewCard.style.display = "flex";
        previewImg.src = prod.image_url && prod.image_url.trim() ? prod.image_url.trim() : "/images/placeholder.svg";
        previewName.textContent = `#${prod.product_id} - ${prod.product_name}`;

        const incomingQty = Number(quantityInput.value) || 0;
        const newStock = Number(prod.quantity) + incomingQty;

        previewStock.innerHTML = `Category: <strong>${escHTML(prod.category || "Unassigned")}</strong> • Current Stock: <strong style="color: var(--emerald);">${prod.quantity} units</strong> ${incomingQty > 0 ? `→ <span style="color:var(--blue); font-weight:700;">New: ${newStock} units</span>` : ''}`;
    } else {
        previewCard.style.display = "none";
    }
}

productSelect.addEventListener("change", updateSelectedPreview);
quantityInput.addEventListener("input", updateSelectedPreview);

async function fillProductSelect(select) {
    allProducts = await apiJSON("/api/products");
    select.innerHTML =
        '<option value="">Choose a product from inventory...</option>' +
        allProducts
            .map(
                p =>
                    `<option value="${Number(p.product_id)}" data-quantity="${Number(p.quantity)}">
                        #${p.product_id} - ${escHTML(p.product_name)} (${Number(p.quantity)} in stock)
                    </option>`
            )
            .join("");

    const urlParams = new URLSearchParams(window.location.search);
    const pid = urlParams.get("product_id");
    if (pid) {
        select.value = pid;
    }
    updateSelectedPreview();
    return allProducts;
}

async function fillHistory(tbody) {
    try {
        const rows = await apiJSON("/api/stock-movements");
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No stock movements recorded yet.</td></tr>';
            return;
        }

        tbody.innerHTML = rows
            .map(m => {
                const imgUrl = m.image_url && m.image_url.trim() ? escHTML(m.image_url.trim()) : '/images/placeholder.svg';
                const isIn = m.movement_type === "IN";
                const badgeClass = isIn ? "in" : "out";
                const badgeText = isIn ? `+${m.quantity} IN` : `-${m.quantity} OUT`;

                return `
                    <tr>
                        <td><small style="color: var(--text-muted);">${new Date(m.created_at).toLocaleString("en-IN")}</small></td>
                        <td>
                            <div class="product-cell">
                                <img src="${imgUrl}" class="product-thumb" alt="${escHTML(m.product_name || 'Product')}"
                                     onerror="this.onerror=null; this.src='/images/placeholder.svg';">
                                <div class="product-cell-info">
                                    <strong>${escHTML(m.product_name || 'Product #' + m.product_id)}</strong>
                                    <small>ID: #${m.product_id}</small>
                                </div>
                            </div>
                        </td>
                        <td><span class="status-badge ${badgeClass}" style="font-weight:700;">${badgeText}</span></td>
                        <td><strong>${Number(m.quantity).toLocaleString("en-IN")} units</strong></td>
                        <td><span style="color: var(--text-muted);">${escHTML(m.note || "—")}</span></td>
                    </tr>
                `;
            })
            .join("");
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state">${escHTML(err.message)}</td></tr>`;
    }
}

form.addEventListener("submit", async e => {
    e.preventDefault();
    const pid = Number(productSelect.value);
    const qty = Number(quantityInput.value);
    const note = noteInput.value.trim();

    if (!pid || !qty || qty < 1) {
        say("Select a product and enter a positive whole quantity.", "error");
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Recording Shipment...";

    try {
        const res = await apiJSON("/api/stock-in", {
            method: "POST",
            body: JSON.stringify({ product_id: pid, quantity: qty, note })
        });

        say(res.message || "Stock received successfully!", "success");
        form.reset();
        await fillProductSelect(productSelect);
        await fillHistory(historyBody);
    } catch (err) {
        say(err.message, "error");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "＋ Receive Stock into Warehouse";
    }
});

refreshBtn.addEventListener("click", () => fillHistory(historyBody));

document.addEventListener("DOMContentLoaded", async () => {
    const todayEl = document.getElementById("today");
    if (todayEl) {
        todayEl.textContent = new Date().toLocaleDateString("en-IN", {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric"
        });
    }

    await fillProductSelect(productSelect);
    await fillHistory(historyBody);
});
