(async function () {
    let allItems = [];
    let page = 1;
    const baseUrl = window.location.href.split('?')[0];
    const seleccionTitulo = document.querySelector("h2.text-primary, h1")?.textContent.trim() || "Mi Lista de Manga";
    const MAX_RETRIES = 10;

    console.log(`%c 📑 EXPORTANDO LISTA CON ESTADO Y TÍTULOS: ${seleccionTitulo}`, "color: #00ff00; font-weight: bold;");

    // 1. Primera pasada: recolectar todos los links de manga
    while (true) {
        console.log(`%c Buscando en página ${page}...`, "color: #1e90ff;");

        try {
            const response = await fetch(`${baseUrl}?page=${page}`);
            if (!response.ok) break;

            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const items = [...doc.querySelectorAll(".element, .card, .thumbnail")];
            let encontradosEnPagina = 0;

            items.forEach(item => {
                const linkElement = item.querySelector("a[href*='/library/manga/']");
                
                if (linkElement) {
                    const title = linkElement.getAttribute("title")?.trim() || 
                                  item.querySelector(".text-truncate")?.textContent.trim() || 
                                  "Sin título";
                    
                    const link = linkElement.getAttribute("href");

                    if (title !== "Sin título" && !allItems.some(i => i.link === link)) {
                        allItems.push({ 
                            title, 
                            link, 
                            status: "Pendiente...", 
                            chapter: "-", 
                            altTitles: [],
                            siteStatus: "Pendiente",
                            retries: 0,
                            done: false
                        });
                        encontradosEnPagina++;
                    }
                }
            });

            if (encontradosEnPagina === 0) {
                console.log("%c Fin de la lista alcanzada.", "color: #ffa500;");
                break;
            }

            console.log(`✅ Página ${page}: ${encontradosEnPagina} mangas añadidos.`);
            page++;
            await new Promise(r => setTimeout(r, 400));

        } catch (error) {
            console.error("Error en la descarga de la lista:", error);
            break;
        }
    }

    if (allItems.length === 0) {
        alert("No se encontró nada.");
        return;
    }

    console.log(`%c 🔄 Iniciando verificación de estado y títulos para ${allItems.length} mangas...`, "color: #ff00ff; font-weight: bold;");

    // 2. Función para procesar un item individual
    async function processItem(item, index, total) {
        console.log(`[${index+1}/${total}] Verificando: ${item.title}${item.retries > 0 ? ` (Reintento ${item.retries}/${MAX_RETRIES})` : ''}...`);

        try {
            const detailUrl = item.link.startsWith('http') ? item.link : (window.location.origin + item.link);
            const res = await fetch(detailUrl);
            
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const detailHtml = await res.text();
            const detailDoc = new DOMParser().parseFromString(detailHtml, 'text/html');

            // --- A. EXTRAER ESTADO ---
            let statusText = "Desconocido";
            const allH5 = detailDoc.querySelectorAll("h5");
            for (let h5 of allH5) {
                if (h5.textContent.includes("Estado:")) {
                    const span = h5.querySelector("span");
                    if (span) {
                        statusText = span.textContent.trim();
                    }
                    break;
                }
            }

            // --- B. EXTRAER TÍTULOS ALTERNATIVOS ---
            const altTitles = [];
            let foundAltHeader = false;
            const allElements = detailDoc.body.querySelectorAll("*");
            
            for (let elem of allElements) {
                if (elem.tagName === "H5" && elem.textContent.includes("Títulos alternativos")) {
                    foundAltHeader = true;
                    continue;
                }
                
                if (foundAltHeader) {
                    if (["H1","H2","H3","H4","H5"].includes(elem.tagName)) {
                        foundAltHeader = false;
                        break;
                    }
                    
                    if (elem.classList.contains("badge") && elem.classList.contains("text-truncate")) {
                        const titleText = elem.textContent.trim();
                        if (titleText && !altTitles.includes(titleText)) {
                            altTitles.push(titleText);
                        }
                    }
                }
            }

            // --- C. EXTRAER ÚLTIMO CAPÍTULO ---
            let lastChapterName = "-";
            let readStatus = "En curso";

            const rows = detailDoc.querySelectorAll(".col-2.col-md-1");
            let lastRowWithIcon = null;
            let lastRowOverall = null;

            rows.forEach(row => {
                const icon = row.querySelector(".chapter-viewed-icon.far.fa-eye-slash");
                if (icon) {
                    lastRowWithIcon = row;
                }
                lastRowOverall = row;
            });

            if (lastRowWithIcon) {
                const parentRow = lastRowWithIcon.closest("tr") || lastRowWithIcon.closest(".row");
                if (parentRow) {
                    const titleCol = parentRow.querySelector(".col-10.col-md-11 .mt-2.text-truncate");
                    if (titleCol) {
                        lastChapterName = titleCol.textContent.trim();
                        readStatus = "Leído";
                    }
                }
            }

            if (!lastRowWithIcon && lastRowOverall) {
                const parentRow = lastRowOverall.closest("tr") || lastRowOverall.closest(".row");
                if (parentRow) {
                    const titleCol = parentRow.querySelector(".col-10.col-md-11 .mt-2.text-truncate");
                    if (titleCol) {
                        lastChapterName = titleCol.textContent.trim();
                        readStatus = "En curso";
                    }
                }
            }

            // Asignar valores
            item.status = readStatus;
            item.chapter = lastChapterName;
            item.altTitles = altTitles;
            item.siteStatus = statusText;
            item.done = true;

            console.log(`   ✅ Estado sitio: ${statusText}, Cap: ${lastChapterName}, Alt: ${altTitles.length > 0 ? altTitles.join(", ") : "Ninguno"}`);

            // Éxito: esperar 0.5 segundos
            await new Promise(r => setTimeout(r, 500));

        } catch (err) {
            item.retries++;
            console.warn(`   ⚠️ ERROR verificando ${item.title} (Intento ${item.retries}/${MAX_RETRIES}):`, err.message);
            
            if (item.retries >= MAX_RETRIES) {
                item.status = "Error";
                item.chapter = "-";
                item.altTitles = [];
                item.siteStatus = "Error";
                item.done = true;
                console.error(`   ❌ ${item.title} falló definitivamente tras ${MAX_RETRIES} intentos.`);
            } else {
                item.done = false;
            }
            
            // Esperar 10 segundos en caso de error
            console.log(`   ⏳ Esperando 10 segundos antes de continuar...`);
            await new Promise(r => setTimeout(r, 10000));
        }
    }

    // 3. Bucle principal con reintentos
    let round = 1;
    while (true) {
        const pending = allItems.filter(i => !i.done);
        
        if (pending.length === 0) {
            console.log(`%c ✅ Todos los mangas procesados.`, "color: #00ff00; font-weight: bold;");
            break;
        }

        if (round > 1) {
            console.log(`%c 🔄 Ronda ${round}: Quedan ${pending.length} mangas pendientes...`, "color: #ff9800; font-weight: bold;");
        }

        for (let i = 0; i < pending.length; i++) {
            const globalIndex = allItems.indexOf(pending[i]);
            await processItem(pending[i], globalIndex, allItems.length);
        }

        round++;
    }

    // 4. Generar HTML final
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Respaldo TMO Completo - ${seleccionTitulo}</title>
        <style>
            body { background: #0f0f0f; color: #ffffff; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px; line-height: 1.6; }
            .container { max-width: 1200px; margin: auto; }
            h1 { color: #1e90ff; border-bottom: 2px solid #333; padding-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; }
            .stats { color: #888; font-size: 0.9em; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; background: #1a1a1a; border-radius: 8px; overflow: hidden; }
            th { background: #222; color: #1e90ff; padding: 15px; text-align: left; font-size: 14px; white-space: nowrap; }
            td { padding: 15px; border-bottom: 1px solid #2a2a2a; vertical-align: top; }
            tr:last-child td { border-bottom: none; }
            tr:hover { background: #252525; }
            a { color: #ffffff; text-decoration: none; background: #1e90ff; padding: 6px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; transition: 0.2s; }
            a:hover { background: #007acc; }
            .manga-name { font-size: 16px; font-weight: 500; }
            .status-read { color: #4caf50; font-weight: bold; }
            .status-progress { color: #ff9800; font-weight: bold; }
            .status-error { color: #f44336; }
            .site-status { font-size: 0.85em; color: #888; display: block; margin-top: 2px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>${seleccionTitulo}</h1>
            <p class="stats">Total de títulos: <strong>${allItems.length}</strong> | Errores: <strong>${allItems.filter(i => i.status === 'Error').length}</strong></p>
            <table>
                <thead>
                    <tr>
                        <th>Título Principal</th>
                        <th>Estado (Sitio)</th>
                        <th>Último Capítulo</th>
                        <th>Títulos Alternativos</th>
                        <th style="text-align: right;">Acceso</th>
                    </tr>
                </thead>
                <tbody>
                    ${allItems.map(i => `
                        <tr>
                            <td class="manga-name">${i.title}</td>
                            <td>
                                <span class="${i.status === 'Leído' ? 'status-read' : (i.status === 'En curso' ? 'status-progress' : 'status-error')}">${i.status}</span>
                                <span class="site-status">Sitio: ${i.siteStatus}</span>
                            </td>
                            <td>${i.chapter}</td>
                            <td>
                                ${i.altTitles.length > 0 
                                    ? i.altTitles.map(t => `<span style="background:#333;color:#ccc;padding:3px 8px;border-radius:10px;font-size:12px;margin:2px;display:inline-block;">${t}</span>`).join(" ") 
                                    : '<span style="color:#555">-</span>'}
                            </td>
                            <td style="text-align: right;"><a href="${i.link}" target="_blank">IR AL MANGA</a></td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    </body>
    </html>`;

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Backup_Completo_${seleccionTitulo.replace(/\s+/g, '_')}.html`;
    a.click();
    
    console.log("%c ✨ ¡LISTO! Archivo generado con estado, capítulos y títulos alternativos.", "color: #00ff00; font-size: 14px;");
})();