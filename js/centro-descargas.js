(function () {
    "use strict";

    function iniciarCatalogo() {
        if (document.getElementById("atlas-descargas")) {
            return;
        }

        if (
            typeof L === "undefined" ||
            typeof map === "undefined" ||
            !window.ATLAS_ARCHIVOS
        ) {
            console.error(
                "No se pudo iniciar el catálogo: falta Leaflet, el mapa o el listado."
            );
            return;
        }

        const categorias = {
            municipios: {
                titulo: "Municipios",
                carpeta: "Municipios",
                etiqueta: "Mapa municipal"
            },
            macrorregiones: {
                titulo: "Macrorregiones",
                carpeta: "Macrorregiones",
                etiqueta: "Mapa macrorregional"
            },
            microrregiones: {
                titulo: "Microrregiones",
                carpeta: "Microrregiones",
                etiqueta: "Mapa microrregional"
            }
        };

        const mapas = [];

        Object.keys(categorias).forEach(function (categoria) {
            const archivos = window.ATLAS_ARCHIVOS[categoria] || [];

            archivos.forEach(function (archivo) {
                const nombreBase = archivo.replace(/\.png$/i, "");
                const general =
                    archivo === "Macrorregiones.png" ||
                    archivo === "Microrregiones.png";

                let nombre = nombreBase;

                if (
                    categoria === "microrregiones" &&
                    archivo === "Tlatlauquitepec.png"
                ) {
                    nombre = "31 - Tlatlauquitepec";
                }

                mapas.push({
                    id: categoria + ":" + archivo,
                    categoria: categoria,
                    archivo: archivo,
                    nombre: nombre,
                    general: general,
                    ruta:
                        "mapas_descargables/" +
                        categorias[categoria].carpeta +
                        "/" +
                        archivo
                });
            });
        });

        const dialogo = document.createElement("dialog");

        dialogo.id = "atlas-descargas";
        dialogo.setAttribute("aria-labelledby", "ad-titulo");

        dialogo.innerHTML = `
            <div class="ad-contenido">
                <header class="ad-cabecera">
                    <div>
                        <div class="ad-institucion">
                            ATLAS DE PLANEACIÓN Y ESTADÍSTICA EDUCATIVA 2026
                        </div>

                        <h2 id="ad-titulo">Cartografía descargable</h2>

                        <p>
                            Consulta y descarga los mapas en formato PNG
                        </p>
                    </div>

                    <button
                        type="button"
                        class="ad-cerrar"
                        aria-label="Cerrar catálogo"
                    >×</button>
                </header>

                <nav
                    class="ad-categorias"
                    aria-label="Categorías de mapas"
                ></nav>

                <div class="ad-cuerpo">
                    <section
                        class="ad-explorador"
                        aria-label="Buscar mapas"
                    >
                        <label for="ad-busqueda">
                            Buscar mapa por nombre o número
                        </label>

                        <input
                            id="ad-busqueda"
                            type="search"
                            placeholder="Escribe el nombre del mapa…"
                            autocomplete="off"
                        >

                        <div
                            class="ad-conteo"
                            role="status"
                            aria-live="polite"
                        ></div>

                        <div
                            class="ad-lista"
                            aria-label="Mapas disponibles"
                        ></div>
                    </section>

                    <section
                        class="ad-detalle"
                        aria-label="Vista previa del mapa"
                    >
                        <div class="ad-tipo"></div>

                        <h3 class="ad-nombre"></h3>

                        <p class="ad-descripcion"></p>

                        <div class="ad-vista">
                            <span
                                class="ad-estado"
                                role="status"
                            ></span>

                            <img alt="" hidden>
                        </div>

                        <div class="ad-acciones">
                            <a
                                class="ad-abrir"
                                target="_blank"
                                rel="noopener"
                                hidden
                            >
                                Ampliar mapa ↗
                            </a>

                            <a class="ad-descargar" hidden>
                                Descargar PNG ↓
                            </a>
                        </div>
                    </section>
                </div>
            </div>
        `;

        document.body.appendChild(dialogo);

        function buscar(selector) {
            return dialogo.querySelector(selector);
        }

        const pestañas = buscar(".ad-categorias");
        const entrada = buscar("#ad-busqueda");
        const lista = buscar(".ad-lista");
        const conteo = buscar(".ad-conteo");
        const tipo = buscar(".ad-tipo");
        const titulo = buscar(".ad-nombre");
        const descripcion = buscar(".ad-descripcion");
        const vista = buscar(".ad-vista");
        const estado = buscar(".ad-estado");
        const abrirOriginal = buscar(".ad-abrir");
        const descargar = buscar(".ad-descargar");

        let categoriaActual = "municipios";
        let seleccionActual = null;
        let botonApertura = null;
        let imagenActual = buscar(".ad-vista img");
        let seleccionPendiente = null;
        const seleccionPorCategoria = {};
        let ultimoMapaMostrado = null;

        function normalizar(texto) {
            return String(texto)
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .trim();
        }

        function obtenerURL(ruta) {
            const rutaCodificada = ruta
                .split("/")
                .map(function (parte) {
                    return encodeURIComponent(parte);
                })
                .join("/");

            return new URL(rutaCodificada, document.baseURI).href;
        }

        function mostrarMapa(registro) {
            seleccionActual = registro ? registro.id : null;
            if (registro) seleccionPorCategoria[registro.categoria] = registro.id;

            lista.querySelectorAll("button").forEach(function (boton) {
                boton.setAttribute(
                    "aria-pressed",
                    String(boton.dataset.id === seleccionActual)
                );
            });

            // No repetir solicitudes al escribir o cambiar una búsqueda equivalente.
            if (registro && ultimoMapaMostrado === registro.id && imagenActual) return;
            ultimoMapaMostrado = registro ? registro.id : null;

            /* Retira la vista anterior y evita respuestas fuera de orden. */
            if (imagenActual) {
                imagenActual.onload = null;
                imagenActual.onerror = null;
                imagenActual.remove();
                imagenActual = null;
            }

            abrirOriginal.hidden = true;
            descargar.hidden = true;
            abrirOriginal.removeAttribute("href");
            descargar.removeAttribute("href");

            estado.hidden = false;

            if (!registro) {
                tipo.textContent = "";
                titulo.textContent = "Sin coincidencias";
                descripcion.textContent =
                    "Prueba con otro nombre o cambia de categoría.";
                estado.textContent =
                    "No hay mapas disponibles para esta búsqueda.";
                return;
            }

            tipo.textContent =
                categorias[registro.categoria].titulo +
                (registro.general ? " · MAPA GENERAL" : "");

            titulo.textContent = registro.nombre;

            descripcion.textContent = registro.general
                ? "Distribución territorial del estado de Puebla · PNG"
                : categorias[registro.categoria].etiqueta + " · PNG";

            estado.textContent = "Cargando mapa…";

            const direccion = obtenerURL(registro.ruta);
            const miniatura = (window.ATLAS_MINIATURAS || {})[registro.id];

            abrirOriginal.href = direccion;
            descargar.href = direccion;
            descargar.download = registro.archivo;

            abrirOriginal.hidden = false;
            descargar.hidden = false;

            const imagen = document.createElement("img");

            imagen.alt = "Mapa de " + registro.nombre;
            imagen.hidden = true;
            imagen.decoding = "async";

            imagenActual = imagen;

            imagen.onload = function () {
                if (imagenActual !== imagen) {
                    return;
                }

                imagen.hidden = false;
                estado.hidden = true;

                const ancho = miniatura ? miniatura.ancho : imagen.naturalWidth;
                const alto = miniatura ? miniatura.alto : imagen.naturalHeight;
                descripcion.textContent = "PNG original · " + ancho + " × " + alto + " píxeles";
            };

            imagen.onerror = function () {
                if (imagenActual !== imagen) {
                    return;
                }

                // Si falta la miniatura, usar el original permite seguir consultando.
                if (miniatura && imagen.dataset.original !== "true") {
                    imagen.dataset.original = "true";
                    imagen.src = direccion;
                    return;
                }
                imagen.hidden = true;
                estado.hidden = false;
                estado.textContent =
                    "No se pudo cargar el mapa. Comprueba que el PNG " +
                    "esté en la carpeta indicada y conserve su nombre exacto.";
            };

            vista.appendChild(imagen);
            imagen.src = miniatura ? obtenerURL(miniatura.ruta) : direccion;
        }

        function actualizarLista() {
            pestañas.querySelectorAll("button").forEach(function (boton) {
                boton.setAttribute(
                    "aria-pressed",
                    String(boton.dataset.categoria === categoriaActual)
                );
            });

            const texto = normalizar(entrada.value);

            const resultados = mapas.filter(function (registro) {
                return (
                    registro.categoria === categoriaActual &&
                    normalizar(registro.nombre).includes(texto)
                );
            });

            conteo.textContent =
                resultados.length +
                (resultados.length === 1
                    ? " mapa disponible"
                    : " mapas disponibles");

            lista.replaceChildren();

            resultados.forEach(function (registro) {
                const boton = document.createElement("button");

                boton.type = "button";
                boton.className = "ad-mapa";
                boton.dataset.id = registro.id;

                const nombre = document.createElement("span");
                nombre.textContent = registro.nombre;

                const etiqueta = document.createElement("small");

                etiqueta.textContent = registro.general
                    ? "MAPA GENERAL · ESTADO DE PUEBLA"
                    : categorias[registro.categoria].etiqueta;

                boton.appendChild(nombre);
                boton.appendChild(etiqueta);

                boton.addEventListener("click", function () {
                    mostrarMapa(registro);
                });

                lista.appendChild(boton);
            });

            if (!resultados.length) {
                const mensaje = document.createElement("p");

                mensaje.className = "ad-vacio";
                mensaje.textContent =
                    "No se encontraron mapas. Prueba con otro nombre.";

                lista.appendChild(mensaje);
            }

            const seleccion = resultados.find(function (registro) {
                return registro.id === seleccionPorCategoria[categoriaActual];
            });

            mostrarMapa(seleccion || resultados[0] || null);
        }

        Object.keys(categorias).forEach(function (categoria) {
            const boton = document.createElement("button");

            const cantidad = mapas.filter(function (registro) {
                return registro.categoria === categoria;
            }).length;

            boton.type = "button";
            boton.dataset.categoria = categoria;
            boton.setAttribute("aria-pressed", "false");

            boton.textContent =
                categorias[categoria].titulo + " · " + cantidad;

            boton.addEventListener("click", function () {
                categoriaActual = categoria;
                actualizarLista();
            });

            pestañas.appendChild(boton);
        });

        entrada.addEventListener("input", actualizarLista);

        buscar(".ad-cerrar").addEventListener("click", function () {
            dialogo.close();
        });

        /* Permite cerrar al pulsar el fondo exterior. */
        dialogo.addEventListener("click", function (evento) {
            if (evento.target !== dialogo) {
                return;
            }

            const limites = dialogo.getBoundingClientRect();

            const fuera =
                evento.clientX < limites.left ||
                evento.clientX > limites.right ||
                evento.clientY < limites.top ||
                evento.clientY > limites.bottom;

            if (fuera) {
                dialogo.close();
            }
        });

        /* Escape funciona de forma nativa por tratarse de un dialog. */
        dialogo.addEventListener("close", function () {
            if (botonApertura) {
                botonApertura.focus();
            }
        });

        function abrirCatalogo(boton) {
            botonApertura = boton;

            if (dialogo.open) {
                return;
            }

            if (seleccionPendiente) {
                const pendiente = seleccionPendiente;
                const registro = mapas.find(function (mapa) {
                    if (mapa.categoria !== pendiente.categoria || mapa.general) {
                        return false;
                    }
                    if (pendiente.categoria === "municipios") {
                        return normalizar(mapa.nombre) === normalizar(pendiente.nombre);
                    }
                    // El número distingue las microrregiones con nombres repetidos.
                    if (Number.isFinite(pendiente.codigo)) {
                        return parseInt(mapa.nombre, 10) === pendiente.codigo;
                    }
                    return normalizar(mapa.nombre) === normalizar(pendiente.nombre);
                });
                if (registro) {
                    categoriaActual = registro.categoria;
                    entrada.value = registro.nombre;
                    seleccionPorCategoria[registro.categoria] = registro.id;
                }
                seleccionPendiente = null;
            }
            dialogo.showModal();
            actualizarLista();
            entrada.focus();
        }

        // La selección proviene del visor: municipio, macro o microrregión.
        document.addEventListener("atlas:seleccion-territorial", function (evento) {
            seleccionPendiente = evento.detail;
        });

        const control = L.control({
            position: "topleft"
        });

        control.onAdd = function () {
            const contenedor = L.DomUtil.create(
                "div",
                "leaflet-control atlas-descargas-control"
            );

            const boton = document.createElement("button");

            boton.type = "button";
            boton.title = "Cartografía descargable";

            boton.setAttribute(
                "aria-label",
                "Abrir catálogo de descargas"
            );

            boton.setAttribute("aria-haspopup", "dialog");
            boton.setAttribute("aria-controls", "atlas-descargas");

            boton.innerHTML = `
                <svg
                    viewBox="0 0 24 24"
                    width="19"
                    height="19"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    aria-hidden="true"
                >
                    <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>
                </svg>
            `;

            boton.addEventListener("click", function () {
                abrirCatalogo(boton);
            });

            contenedor.appendChild(boton);

            L.DomEvent.disableClickPropagation(contenedor);
            L.DomEvent.disableScrollPropagation(contenedor);

            return contenedor;
        };

        control.addTo(map);

        /*
         * Tu botón Restablecer se crea con un temporizador.
         * Esperamos a que exista para colocar Descargas antes de Restablecer.
         */
        function colocarAntesDeRestablecer() {
            const botonHome = document.querySelector(
                ".leaflet-control-home"
            );

            if (!botonHome) {
                return false;
            }

            botonHome.insertAdjacentElement(
                "beforebegin",
                control.getContainer()
            );

            botonHome.addEventListener("click", function () {
                seleccionPendiente = null;
            });
            return true;
        }

        if (!colocarAntesDeRestablecer()) {
            const barra = document.querySelector(
                ".leaflet-top.leaflet-left"
            );

            if (barra) {
                const observador = new MutationObserver(function () {
                    if (colocarAntesDeRestablecer()) {
                        observador.disconnect();
                    }
                });

                observador.observe(barra, {
                    childList: true
                });
            }
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            iniciarCatalogo,
            { once: true }
        );
    } else {
        iniciarCatalogo();
    }
}());