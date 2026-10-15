const money = value =>
    Number(value || 0).toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    });

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

async function loadDashboard() {
    const errorMessage = document.getElementById("errorMessage");
    const recentProducts = document.getElementById("recentProducts");
    const todayEl = document.getElementById("today");

    if (todayEl) {
        todayEl.textContent = new Date().toLocaleDateString("en-IN", {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric"
        });
    }

    try {
        // Fetch dashboard summary KPIs and products in parallel
        const [summaryRes, productsRes, movementsRes] = await Promise.all([
            fetch("/api/dashboard-summary").catch(() => null),
            fetch("/api/products"),
            fetch("/api/stock-movements").catch(() => null)
        ]);

        if (!productsRes.ok) throw new Error("Could not load products catalog");
        const products = await productsRes.json();

        // If dashboard summary API is available, use it; otherwise compute locally
        let summary = null;
        if (summaryRes && summaryRes.ok) {
            summary = await summaryRes.json();
        }

        const totalProducts = summary ? Number(summary.total_products) : products.length;
        const totalUnits = summary ? Number(summary.total_units) : products.reduce((sum, p) => sum + Number(p.quantity), 0);
        const totalValue = summary ? Number(summary.total_value) : products.reduce((sum, p) => sum + Number(p.price) * Number(p.quantity), 0);
        const lowItems = summary ? Number(summary.low_stock_count) : products.filter(p => Number(p.quantity) > 0 && Number(p.quantity) <= 10).length;
        const outItems = summary ? Number(summary.out_of_stock_count) : products.filter(p => Number(p.quantity) === 0).length;
        const healthyItems = summary ? Number(summary.healthy_count) : (products.length - lowItems - outItems);
        const healthyPercent = summary ? Number(summary.healthy_percent) : (totalProducts ? Math.round((healthyItems / totalProducts) * 100) : 0);

        document.getElementById("productCount").textContent = totalProducts.toLocaleString("en-IN");
        document.getElementById("stockCount").textContent = totalUnits.toLocaleString("en-IN");
        document.getElementById("stockValue").textContent = money(totalValue);
        document.getElementById("lowStockCount").textContent = (lowItems + outItems).toLocaleString("en-IN");

        document.getElementById("healthyCount").textContent = healthyItems;
        document.getElementById("lowCount").textContent = lowItems;
        document.getElementById("outCount").textContent = outItems;
        document.getElementById("healthyPercent").textContent = healthyPercent + "%";
        document.getElementById("stockMeterFill").style.width = healthyPercent + "%";

        // Render Recent Products Table
        function renderProducts(query = "") {
            const filtered = products.filter(p =>
                String(p.product_name || "").toLowerCase().includes(query) ||
                String(p.category || "").toLowerCase().includes(query) ||
                String(p.product_id).includes(query)
            );

            if (filtered.length === 0) {
                recentProducts.innerHTML =
                    '<tr><td colspan="6" class="empty-state">No matching products found.</td></tr>';
                document.getElementById("tableSummary").textContent = "";
                return;
            }

            document.getElementById("tableSummary").textContent =
                `Showing ${Math.min(filtered.length, 8)} of ${products.length} products`;

            recentProducts.innerHTML = filtered.slice(0, 8).map(p => {
                const qty = Number(p.quantity);
                const status = qty === 0
                    ? '<span class="status-badge out">Out of stock</span>'
                    : qty <= 10
                    ? '<span class="status-badge low">Low stock</span>'
                    : '<span class="status-badge in">In stock</span>';

                const imgUrl = p.image_url && p.image_url.trim() ? escapeHTML(p.image_url.trim()) : '/images/placeholder.svg';

                return `
                    <tr>
                        <td>
                            <div class="product-cell">
                                <img src="${imgUrl}" class="product-thumb" alt="${escapeHTML(p.product_name)}"
                                     onerror="this.onerror=null; this.src='/images/placeholder.svg';"
                                     title="Click to view details">
                                <div class="product-cell-info">
                                    <strong>${escapeHTML(p.product_name)}</strong>
                                    <small>SKU #${p.product_id}</small>
                                </div>
                            </div>
                        </td>
                        <td><span class="category-badge">${escapeHTML(p.category || "Unassigned")}</span></td>
                        <td><strong>${money(p.price)}</strong></td>
                        <td><strong>${qty.toLocaleString("en-IN")}</strong></td>
                        <td>${status}</td>
                        <td style="text-align: right;">
                            <a href="/stock-in.html?product_id=${p.product_id}" class="action-button" style="color: var(--blue);" title="Receive stock">＋ In</a>
                            <a href="/stock-out.html?product_id=${p.product_id}" class="action-button" style="color: var(--amber);" title="Dispatch stock">− Out</a>
                        </td>
                    </tr>
                `;
            }).join("");
        }

        renderProducts();

        const searchInput = document.getElementById("productSearch");
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                renderProducts(e.target.value.trim().toLowerCase());
            });
        }

        // Render Recent Stock Movements Feed
        const movementsList = document.getElementById("recentMovementsList");
        if (movementsList && movementsRes && movementsRes.ok) {
            const movements = await movementsRes.json();
            if (!movements.length) {
                movementsList.innerHTML = '<small style="color: var(--text-muted);">No stock movements recorded yet.</small>';
            } else {
                movementsList.innerHTML = movements.slice(0, 5).map(m => {
                    const isIn = m.movement_type === "IN";
                    const badgeClass = isIn ? "in" : "out";
                    const badgeText = isIn ? `+${m.quantity} IN` : `-${m.quantity} OUT`;
                    const imgUrl = m.image_url && m.image_url.trim() ? escapeHTML(m.image_url.trim()) : '/images/placeholder.svg';
                    const timeStr = new Date(m.created_at).toLocaleDateString("en-IN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                    });

                    return `
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: #f8fafc; border-radius: 8px; border: 1px solid var(--border-subtle);">
                            <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                                <img src="${imgUrl}" style="width: 34px; height: 34px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border);" onerror="this.onerror=null; this.src='/images/placeholder.svg';">
                                <div style="display: flex; flex-direction: column; min-width: 0;">
                                    <strong style="font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;">${escapeHTML(m.product_name || "Product #" + m.product_id)}</strong>
                                    <small style="font-size: 11px; color: var(--text-muted);">${timeStr}</small>
                                </div>
                            </div>
                            <span class="status-badge ${badgeClass}" style="font-weight: 700; font-size: 11px;">${badgeText}</span>
                        </div>
                    `;
                }).join("");
            }
        }

    } catch (err) {
        console.error("Dashboard error:", err);
        if (errorMessage) {
            errorMessage.textContent = "Could not load dashboard data: " + err.message;
        }
    }
}

document.addEventListener("DOMContentLoaded", loadDashboard);
