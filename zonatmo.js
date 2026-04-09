(async function () {
    let allItems = [];
    let page = 1;

    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    const activeElements = document.querySelector(".element-header-bar .element-header-bar-element.active a");
    const baseUrl = activeElements ? activeElements.href : "https://zonatmo.com/profile/read";
    const seleccionTitulo =
        activeElements?.querySelector("small.element-header-bar-element-title")?.textContent.trim() ||
        "Mi Lista de Manga";

    console.log(`URL: ${baseUrl}`);
    console.log(`TITULO: ${seleccionTitulo}`);

    while (true) {
        console.log(`Página: ${page}`);

        const response = await fetch(`${baseUrl}?page=${page}`);
        if (!response.ok) break;

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");

        const items = [...doc.querySelectorAll(".element.proyect-item")];
        if (items.length === 0) break;

        for (const item of items) {
            const title =
                item.querySelector(".thumbnail-title h4.text-truncate")?.getAttribute("title")?.trim() ||
                "Sin título";

            const link = item.querySelector("a")?.href || "#";

            const styleTag = item.querySelector("style");
            let imageUrl = "Sin imagen";

            if (styleTag) {
                const match = styleTag.textContent.match(/background-image:\s*url\(['"]?(.*?)['"]?\);/);
                if (match) imageUrl = match[1];
            }

            let progreso = "0/0";

            let intentos = 0;
            let success = false;

            while (intentos < 3 && !success) {
                try {
                    console.log(`Entrando a: ${title} (Intento ${intentos + 1})`);

                    const mangaRes = await fetch(link);

                    if (mangaRes.status === 429) {
                        console.warn("Rate limit, esperando...");
                        await delay(3000);
                        intentos++;
                        continue;
                    }

                    const mangaHtml = await mangaRes.text();
                    const mangaDoc = new DOMParser().parseFromString(mangaHtml, "text/html");

                    const chapterElements = [...mangaDoc.querySelectorAll("li.upload-link")];

                    const totalCaps = new Set();
                    const leidosCaps = new Set();

                    chapterElements.forEach(el => {
                        const titleEl = el.querySelector(".btn-collapse");
                        if (!titleEl) return;

                        const match = titleEl.textContent.match(/Cap[íi]tulo\s+(\d+(?:\.\d+)?)/i);
                        if (match) {
                            const numeroBase = Math.floor(parseFloat(match[1]));
                            totalCaps.add(numeroBase);

                            if (el.querySelector(".chapter-viewed-icon.viewed")) {
                                leidosCaps.add(numeroBase);
                            }
                        }
                    });

                    const minCap = Math.min(...totalCaps);
                    const total = totalCaps.size - (minCap === 0 ? 1 : 0);
                    const leidos = leidosCaps.size - (minCap === 0 && leidosCaps.has(0) ? 1 : 0);

                    progreso = `${leidos}/${total}`;

                    console.log(`${title}: ${progreso}`);

                    success = true;

                    await delay(1200);

                } catch (err) {
                    console.error(`Error en ${title}`, err);
                    intentos++;
                    await delay(2000);
                }
            }

            allItems.push({ title, link, imageUrl, progreso });
        }

        page++;
    }

    console.log("Generando HTML...");

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>${seleccionTitulo}</title>
        <style>
            body { background:#121212; color:#fff; font-family:Arial; text-align:center; }
            table { width:80%; margin:auto; border-collapse:collapse; background:#222; }
            th, td { padding:10px; border:1px solid #444; }
            a { color:#1e90ff; }
            img { width:60px; height:80px; }
        </style>
    </head>
    <body>

    <h1>${seleccionTitulo}</h1>

    <table>
        <thead>
            <tr>
                <th>Imagen</th>
                <th>Título</th>
                <th>Progreso</th>
            </tr>
        </thead>
        <tbody>
            ${allItems.map(item => `
                <tr>
                    <td><img src="${item.imageUrl}"></td>
                    <td><a href="${item.link}" target="_blank">${item.title}</a></td>
                    <td>${item.progreso}</td>
                </tr>
            `).join("")}
        </tbody>
    </table>

    </body>
    </html>
    `;

    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `Lista de ${seleccionTitulo}.html`;
    a.click();

    URL.revokeObjectURL(url);

    console.log("Archivo generado sin que te baneen (hopefully)");
})();
