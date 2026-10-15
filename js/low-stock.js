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

const money = value =>
    Number(value || 0).toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    });

const thresholdSelect = document.getElementById("threshold");
const alertCountEl = document.getElementById("alertCount");
const subCountEl = document.getElementById("subCount");
const lowStockBody = document.getElementById("lowStockBody");
const refreshBtn = document.getElementById("refresh");
const exportReorderBtn = document.getElementById("exportReorderBtn");

const reorderModal = document.getElementById("reorderModal");
const modalProductImg = document.getElementById("modalProductImg");
const modalProductName = document.getElementById("modalProductName");
const modalCurrentStock = document.getElementById("modalCurrentStock");
const modalQuantity = document.getElementById("modalQuantity");
const modalNote = document.getElementById("modalNote");
const modalMessage = document.getElementById("modalMessage");
const cancelReorderBtn = document.getElementById("cancelReorderBtn");
const confirmReorderBtn = document.getElementById("confirmReorderBtn");
const closeReorderModal = document.getElementById("closeReorderModal");

let currentItems = [];
let targetProductId = null;

async function loadLowStock() {
    const threshold = Number(thresholdSelect.value) || 10;
    lowStockBody.innerHTML = '<tr><td colspan="7" class="empty-state">Scanning warehouse stock levels...</td></tr>';

    try {
        currentItems = await apiJSON(`/api/low-stock?threshold=${threshold}`);

        const outCount = currentItems.filter(p => Number(p.quantity) === 0).length;
        const lowCount = currentItems.length - outCount;

        alertCountEl.textContent = `${currentItems.length} Products Requiring Attention (${outCount} Out of Stock, ${lowCount} Low)`;
        subCountEl.textContent = `Showing products with inventory at or below ${threshold} units`;

        if (!currentItems.length) {
            lowStockBody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state">
                        <div style="padding: 30px; text-align: center;">
                            <div style="font-size: 32px; margin-bottom: 8px;">✅</div>
                            <h3 style="color: var(--emerald);">Inventory Healthy</h3>
                            <p style="color: var(--text-muted); font-size: 13px;">No products are currently at or below ${threshold} units.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        lowStockBody.innerHTML = currentItems.map(p => {
            const qty = Number(p.quantity);
            const imgUrl = p.image_url && p.image_url.trim() ? escHTML(p.image_url.trim()) : '/images/placeholder.svg';

            let urgencyBadge = '';
            if (qty === 0) {
                urgencyBadge = '<span class="status-badge out" style="font-weight:700;">● CRITICAL (0 units)</span>';
            } else if (qty <= 5) {
                urgencyBadge = '<span class="status-badge low" style="font-weight:700; background:#fee2e2; color:#b91c1c;">● HIGH URGENCY</span>';
            } else {
                urgencyBadge = '<span class="status-badge low">● WARNING</span>';
            }

            return `
                <tr>
                    <td><strong>#${p.product_id}</strong></td>
                    <td>
                        <div class="product-cell">
                            <img src="${imgUrl}" class="product-thumb" alt="${escHTML(p.product_name)}"
                                 onerror="this.onerror=null; this.src='/images/placeholder.svg';">
                            <div class="product-cell-info">
                                <strong>${escHTML(p.product_name)}</strong>
                                <small>SKU #${p.product_id}</small>
                            </div>
                        </div>
                    </td>
                    <td><span class="category-badge">${escHTML(p.category || "Unassigned")}</span></td>
                    <td><strong>${money(p.price)}</strong></td>
                    <td><strong style="color: ${qty === 0 ? 'var(--rose)' : 'var(--amber)'}; font-size: 15px;">${qty} units</strong></td>
                    <td>${urgencyBadge}</td>
                    <td style="text-align: right;">
                        <button class="primary-button" style="padding: 6px 12px; font-size: 12.5px;"
                                onclick="openReorderModal(${p.product_id})">
                            ＋ Restock Now
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    } catch (err) {
        lowStockBody.innerHTML = `<tr><td colspan="7" class="empty-state">${escHTML(err.message)}</td></tr>`;
    }
}

// ================= QUICK REORDER MODAL =================
window.openReorderModal = function(id) {
    const prod = currentItems.find(p => Number(p.product_id) === Number(id));
    if (!prod) return;

    targetProductId = id;
    modalProductName.textContent = `#${prod.product_id} - ${prod.product_name}`;
    modalProductImg.src = prod.image_url && prod.image_url.trim() ? prod.image_url.trim() : '/images/placeholder.svg';
    modalCurrentStock.textContent = `${prod.quantity} units`;
    modalQuantity.value = "25";
    modalNote.value = `Restock order for low stock alert (${prod.product_name})`;
    modalMessage.style.display = "none";
    reorderModal.classList.add("open");
};

function closeReorder() {
    targetProductId = null;
    reorderModal.classList.remove("open");
}

if (cancelReorderBtn) cancelReorderBtn.addEventListener("click", closeReorder);
if (closeReorderModal) closeReorderModal.addEventListener("click", closeReorder);

if (confirmReorderBtn) {
    confirmReorderBtn.addEventListener("click", async () => {
        if (!targetProductId) return;
        const qty = Number(modalQuantity.value);
        const note = modalNote.value.trim();

        if (!qty || qty < 1) {
            modalMessage.textContent = "Please enter a valid positive quantity.";
            modalMessage.className = "notice error show";
            modalMessage.style.display = "block";
            return;
        }

        confirmReorderBtn.disabled = true;
        confirmReorderBtn.textContent = "Processing Intake...";

        try {
            await apiJSON("/api/stock-in", {
                method: "POST",
                body: JSON.stringify({ product_id: targetProductId, quantity: qty, note })
            });

            closeReorder();
            await loadLowStock();
        } catch (e) {
            modalMessage.textContent = e.message;
            modalMessage.className = "notice error show";
            modalMessage.style.display = "block";
        } finally {
            confirmReorderBtn.disabled = false;
            confirmReorderBtn.textContent = "＋ Confirm Intake";
        }
    });
}

// ================= EXPORT REORDER SHEET =================
if (exportReorderBtn) {
    exportReorderBtn.addEventListener("click", () => {
        if (!currentItems.length) {
            alert("No low stock items to export.");
            return;
        }

        const headers = ["Product ID", "Product Name", "Category", "Current Stock", "Recommended Reorder Qty", "Unit Price (INR)", "Estimated Cost (INR)"];
        const rows = currentItems.map(p => {
            const reorderQty = Math.max(30 - Number(p.quantity), 10);
            const estCost = (reorderQty * Number(p.price)).toFixed(2);
            return [
                p.product_id,
                `"${String(p.product_name).replace(/"/g, '""')}"`,
                `"${String(p.category || '').replace(/"/g, '""')}"`,
                p.quantity,
                reorderQty,
                p.price,
                estCost
            ];
        });

        const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `sham_warehouse_reorder_sheet_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

thresholdSelect.addEventListener("change", loadLowStock);
refreshBtn.addEventListener("click", loadLowStock);

document.addEventListener("DOMContentLoaded", () => {
    const todayEl = document.getElementById("today");
    if (todayEl) {
        todayEl.textContent = new Date().toLocaleDateString("en-IN", {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric"
        });
    }
    loadLowStock();
});
