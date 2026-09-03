
        let carrito = JSON.parse(localStorage.getItem('carritoRF')) || [];
        let todosLosArreglos = []; // Memoria global para el catálogo

        function escaparHtml(valor) {
            return String(valor ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
        }

        function obtenerImagenes(producto) {
            const principal = String(producto.imagen_url || '').trim();
            const extras = String(producto.imagenes || '')
                .split(/[\n,]+/)
                .map(x => x.trim())
                .filter(Boolean);
            return [...new Set([principal, ...extras].filter(Boolean))];
        }

        function obtenerVariantes(producto) {
            const raw = String(producto.variante_personalizada || '').trim();
            if (!raw) return [];

            // Formato recomendado: "Color: Rosa, Rojo | Tamaño: Mediano, Grande"
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    return parsed.map(g => ({ nombre: String(g.nombre || 'Opciones'), opciones: Array.isArray(g.opciones) ? g.opciones.map(String).filter(Boolean) : [] })).filter(g => g.opciones.length);
                }
                if (parsed && Array.isArray(parsed.grupos)) {
                    return parsed.grupos.map(g => ({ nombre: String(g.nombre || 'Opciones'), opciones: Array.isArray(g.opciones) ? g.opciones.map(String).filter(Boolean) : [] })).filter(g => g.opciones.length);
                }
                if (parsed && Array.isArray(parsed.opciones) && parsed.opciones.length) {
                    return [{ nombre: parsed.nombre || 'Opciones', opciones: parsed.opciones.map(String).filter(Boolean) }];
                }
            } catch (_) {}

            const grupos = raw.split(/\s*\|\s*/).map(x => x.trim()).filter(Boolean).map(grupo => {
                const pos = grupo.indexOf(':');
                if (pos === -1) return { nombre: 'Opciones', opciones: grupo.split(/\s*[,;]\s*/).map(x => x.trim()).filter(Boolean) };
                return { nombre: grupo.slice(0, pos).trim() || 'Opciones', opciones: grupo.slice(pos + 1).split(/\s*[,;]\s*/).map(x => x.trim()).filter(Boolean) };
            }).filter(g => g.opciones.length);
            return grupos;
        }

        function prepararVariantes(producto) {
            const bloque = document.getElementById('modal-variantes');
            const variante = obtenerVariantes(producto);
            if (!variante.length) {
                bloque.classList.add('hidden');
                bloque.innerHTML = '';
                return null;
            }

            bloque.classList.remove('hidden');
            bloque.innerHTML = '';
            const seleccionadas = {};
            productoVariantesSeleccionadas = {};
            const activeClass = 'px-4 py-2 border-2 border-brandFuchsia text-brandFuchsia font-medium rounded-full text-sm';
            const normalClass = 'px-4 py-2 border border-gray-300 rounded-full text-sm hover:border-brandFuchsia transition';

            variante.forEach((grupo, groupIndex) => {
                const wrapper = document.createElement('div');
                wrapper.className = groupIndex ? 'mt-5' : '';
                const titulo = document.createElement('h4');
                titulo.className = 'font-medium text-sm text-brandDark mb-3';
                titulo.innerText = grupo.nombre;
                const texto = document.createElement('p');
                texto.className = 'text-xs text-gray-600 mb-2';
                texto.innerHTML = 'Elige una opción: <span class="font-semibold text-brandDark"></span>';
                const opciones = document.createElement('div');
                opciones.className = 'flex flex-wrap gap-3';
                const spanSeleccion = texto.querySelector('span');
                seleccionadas[grupo.nombre] = grupo.opciones[0];
                productoVariantesSeleccionadas[grupo.nombre] = grupo.opciones[0];
                spanSeleccion.innerText = grupo.opciones[0];

                grupo.opciones.forEach((opcion, index) => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.dataset.opcion = opcion;
                    button.innerText = opcion;
                    button.className = index === 0 ? activeClass : normalClass;
                    button.onclick = () => {
                        seleccionadas[grupo.nombre] = opcion;
                        productoVariantesSeleccionadas[grupo.nombre] = opcion;
                        spanSeleccion.innerText = opcion;
                        actualizarSeleccionDescripcionRF();
                        opciones.querySelectorAll('button').forEach(b => b.className = b === button ? activeClass : normalClass);
                    };
                    opciones.appendChild(button);
                });
                wrapper.append(titulo, texto, opciones);
                bloque.appendChild(wrapper);
            });

            return () => Object.entries(seleccionadas).map(([nombre, opcion]) => `${nombre}: ${opcion}`).join(' | ');
        }

        function mostrarGaleria(producto) {
            const imagenes = obtenerImagenes(producto);
            const principal = imagenes[0] || 'https://images.unsplash.com/photo-1591886960571-74d43a9d4166?auto=format&fit=crop&w=600&q=80';
            const main = document.getElementById('modal-img');
            const thumbs = document.getElementById('modal-thumbnails');
            main.src = principal;
            main.onerror = () => { main.onerror = null; main.src = 'https://images.unsplash.com/photo-1591886960571-74d43a9d4166?auto=format&fit=crop&w=600&q=80'; };
            thumbs.innerHTML = '';
            imagenes.forEach((url, index) => {
                const wrap = document.createElement('button');
                wrap.type = 'button';
                wrap.className = `aspect-square bg-white ${index === 0 ? 'border-2 border-brandFuchsia' : 'border border-gray-200'} rounded-lg overflow-hidden cursor-pointer`;
                const img = document.createElement('img');
                img.src = url;
                img.className = 'w-full h-full object-cover';
                img.onerror = () => { img.onerror = null; img.src = 'https://via.placeholder.com/100?text=Foto'; };
                wrap.appendChild(img);
                wrap.onclick = () => {
                    main.src = url;
                    thumbs.querySelectorAll('button').forEach(b => b.className = 'aspect-square bg-white border border-gray-200 rounded-lg overflow-hidden cursor-pointer');
                    wrap.className = 'aspect-square bg-white border-2 border-brandFuchsia rounded-lg overflow-hidden cursor-pointer';
                };
                thumbs.appendChild(wrap);
            });
        }

        function formatearPrecio(valor) {
            const numero = Number(valor) || 0;
            return numero.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        async function cargarInventario(filtroCategoria = null) {
            try {
                const respuesta = await fetch('/api/catalogo');
                todosLosArreglos = await respuesta.json();
                let arreglos = todosLosArreglos;

                if (filtroCategoria) {
                    arreglos = arreglos.filter(arreglo => arreglo.categoria === filtroCategoria);
                    document.getElementById('titulo-catalogo').innerText = "Colección: " + filtroCategoria;
                } else {
                    document.getElementById('titulo-catalogo').innerText = "Tus favoritos de Reserva Floral";
                    // La sección destacada muestra una selección breve; el catálogo completo vive en "Ver todos".
                    arreglos = [...arreglos].sort(() => Math.random() - 0.5).slice(0, 8);
                }

                const contenedor = document.getElementById('contenedor-arreglos');
                contenedor.innerHTML = '';

                if (arreglos.length === 0) {
                    contenedor.innerHTML = '<p class="text-gray-500 py-10">No hay arreglos disponibles en este momento.</p>';
                    actualizarFlechasFavoritosRF();
                    return;
                }

                arreglos.forEach(arreglo => {
                    const urlImagen = (obtenerImagenes(arreglo)[0]) || 'https://images.unsplash.com/photo-1591886960571-74d43a9d4166?auto=format&fit=crop&w=600&q=80';
                    const arregloData = encodeURIComponent(JSON.stringify(arreglo));
                    contenedor.innerHTML += `
                        <div onclick="abrirProducto('${arregloData}', '${urlImagen}')" class="rf-favorite-card group cursor-pointer">
                            <div class="rf-favorite-card-image">
                                <img src="${urlImagen}" alt="${arreglo.nombre}" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1591886960571-74d43a9d4166?auto=format&fit=crop&w=600&q=80'">
                            </div>
                            <div class="rf-favorite-card-body">
                                <h3 class="font-medium text-sm text-gray-800 leading-tight">${arreglo.nombre}</h3>
                                <div class="flex items-center justify-between gap-3">
                                    <span class="font-bold text-gray-900 text-sm">$${formatearPrecio(arreglo.precio)}</span>
                                    <span class="text-brandLightPink font-medium text-xs">Agregar</span>
                                </div>
                            </div>
                        </div>
                    `;
                });
                actualizarUI();
                actualizarFlechasFavoritosRF();
            } catch (error) { console.error("Error cargando el catálogo", error); }
        }

        function abrirProducto(dataStr, urlImagen) {
            const productoActual = JSON.parse(decodeURIComponent(dataStr));
            mostrarProducto(productoActual);
        }

        function obtenerUbicacionGuardadaRF() {
            try {
                const datos = JSON.parse(localStorage.getItem('rf_ubicacion_entrega') || 'null');
                return (datos && datos.estado && datos.ciudad && datos.fecha) ? datos : null;
            } catch (_) {
                return null;
            }
        }

        function formatearFechaProductoRF(fecha) {
            if (!fecha) return 'Fecha de entrega';
            const d = new Date(fecha + 'T00:00:00');
            return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
        }

        function actualizarUbicacionProductoRF() {
            const ciudad = document.getElementById('producto-ciudad-seleccionada');
            const fecha = document.getElementById('producto-fecha-seleccionada');
            if (!ciudad || !fecha) return;
            const datos = obtenerUbicacionGuardadaRF();
            ciudad.innerText = datos?.ciudad || 'Selecciona tu ciudad';
            fecha.innerText = datos?.fecha ? formatearFechaProductoRF(datos.fecha) : 'Selecciona fecha de entrega';
        }

        function abrirSelectorUbicacionDesdeProducto() {
            // Mantiene abierto el producto detrás del selector para que, al confirmar,
            // el usuario vuelva directamente al mismo producto con los datos actualizados.
            abrirModalUbicacion(() => actualizarUbicacionProductoRF());
        }

        let productoDescripcionActual = null;
        let productoVariantesSeleccionadas = {};

        function escaparHtmlRF(valor) {
            return String(valor ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
        }

        function listaEspecificacionesRF(valor) {
            return String(valor || '').split(/\r?\n|\s*;\s*/).map(x => x.trim().replace(/^[-•*]\s*/, '')).filter(Boolean);
        }

        function actualizarSeleccionDescripcionRF() {
            const wrap = document.getElementById('panel-seleccion-wrap');
            const panel = document.getElementById('panel-seleccion');
            if (!wrap || !panel) return;

            const entradas = Object.entries(productoVariantesSeleccionadas || {}).filter(([, opcion]) => String(opcion || '').trim());
            if (!entradas.length) {
                wrap.classList.add('hidden');
                panel.innerHTML = '';
                return;
            }

            wrap.classList.remove('hidden');
            panel.innerHTML = entradas.map(([nombre, opcion]) =>
                `<div class="px-4 py-3 flex justify-between gap-4 bg-white"><span class="text-xs font-medium text-gray-700">${escaparHtmlRF(nombre)}</span><span class="text-xs text-gray-600 text-right">${escaparHtmlRF(opcion)}</span></div>`
            ).join('');
        }

        function abrirPanelDescripcionRF(producto, mostrarSeleccion = false, seleccion = null) {
            if (!producto) return;

            document.getElementById('panel-descripcion-nombre').innerText = producto.nombre || '';
            document.getElementById('panel-descripcion-texto').innerText = producto.descripcion || 'Este arreglo está preparado con cuidado y atención a cada detalle.';

            const specs = listaEspecificacionesRF(producto.especificaciones);
            const specsWrap = document.getElementById('panel-especificaciones-wrap');
            const specsList = document.getElementById('panel-especificaciones');
            if (specs.length) {
                specsWrap.classList.remove('hidden');
                specsList.innerHTML = specs.map(x => `<li>${escaparHtmlRF(x)}</li>`).join('');
            } else {
                specsWrap.classList.add('hidden');
                specsList.innerHTML = '';
            }

            const seleccionWrap = document.getElementById('panel-seleccion-wrap');
            const seleccionPanel = document.getElementById('panel-seleccion');
            const datosSeleccion = seleccion || productoVariantesSeleccionadas || {};
            const entradas = mostrarSeleccion ? Object.entries(datosSeleccion).filter(([, valor]) => valor) : [];
            if (entradas.length) {
                seleccionWrap.classList.remove('hidden');
                seleccionPanel.innerHTML = entradas.map(([nombre, opcion]) =>
                    `<div class="px-4 py-3 flex justify-between gap-4 bg-white"><span class="text-xs font-medium text-gray-700">${escaparHtmlRF(nombre)}</span><span class="text-xs text-gray-600 text-right">${escaparHtmlRF(opcion)}</span></div>`
                ).join('');
            } else {
                seleccionWrap.classList.add('hidden');
                seleccionPanel.innerHTML = '';
            }

            const panel = document.getElementById('panel-descripcion-producto');
            const content = document.getElementById('panel-descripcion-content');
            panel.classList.remove('hidden');
            panel.setAttribute('aria-hidden', 'false');
            requestAnimationFrame(() => content.classList.remove('translate-x-full'));
        }

        function abrirDescripcionProducto() {
            if (!productoDescripcionActual) return;
            const tieneVariantes = obtenerVariantes(productoDescripcionActual).length > 0;
            abrirPanelDescripcionRF(productoDescripcionActual, tieneVariantes, productoVariantesSeleccionadas);
        }

        function cerrarDescripcionProducto() {
            const panel = document.getElementById('panel-descripcion-producto');
            const content = document.getElementById('panel-descripcion-content');
            content.classList.add('translate-x-full');
            panel.setAttribute('aria-hidden', 'true');
            setTimeout(() => panel.classList.add('hidden'), 300);
        }

        function mostrarProducto(productoActual) {
            productoDescripcionActual = productoActual;
            const imagenes = obtenerImagenes(productoActual);
            const urlImagen = imagenes[0] || 'https://images.unsplash.com/photo-1591886960571-74d43a9d4166?auto=format&fit=crop&w=600&q=80';
            document.getElementById('modal-id').innerText = '00' + productoActual.id;
            document.getElementById('modal-nombre').innerText = productoActual.nombre;
            document.getElementById('modal-precio').innerText = '$' + formatearPrecio(productoActual.precio);
            document.getElementById('modal-desc').innerText = productoActual.descripcion || 'Un hermoso arreglo preparado con las mejores flores de temporada.';
            mostrarGaleria(productoActual);
            actualizarUbicacionProductoRF();
            productoVariantesSeleccionadas = {};
            const obtenerSeleccion = prepararVariantes(productoActual);
            document.getElementById('btn-modal-agregar').onclick = () => {
                const variante = obtenerSeleccion ? obtenerSeleccion() : null;
                ejecutarConUbicacionRF(() => {
                    agregarAlCarrito(productoActual.id, productoActual.nombre, productoActual.precio, urlImagen, variante);
                });
            };
            const modal = document.getElementById('modal-producto');
            const content = document.getElementById('modal-content');
            modal.classList.remove('hidden');
            setTimeout(() => {
                content.classList.remove('scale-95', 'opacity-0');
                content.classList.add('scale-100', 'opacity-100');
            }, 10);
            document.body.style.overflow = 'hidden';
        }

        function cerrarProducto() {
            const modal = document.getElementById('modal-producto');
            const content = document.getElementById('modal-content');
            content.classList.remove('scale-100', 'opacity-100');
            content.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                modal.classList.add('hidden');
                document.body.style.overflow = 'auto';
            }, 300);
        }

        function ejecutarConUbicacionRF(accion) {
            if (ubicacionRFCompleta()) {
                if (typeof accion === 'function') accion();
                return true;
            }

            // No se agrega nada al carrito hasta que exista estado, ciudad y fecha válidos.
            abrirModalUbicacion(() => {
                if (ubicacionRFCompleta() && typeof accion === 'function') accion();
            });
            return false;
        }

        function tieneVarianteCarrito(variante) {
            if (variante === null || variante === undefined) return false;
            if (typeof variante === 'string') return variante.trim() !== '';
            if (Array.isArray(variante)) return variante.length > 0;
            if (typeof variante === 'object') return Object.keys(variante).length > 0;
            return true;
        }

        function agregarItemCarrito(item) {
            const varianteReal = tieneVarianteCarrito(item.variante);
            const existente = !varianteReal
                ? carrito.find(x => String(x.id) === String(item.id) && !tieneVarianteCarrito(x.variante))
                : null;

            if (existente) {
                existente.cantidad = Math.max(1, Number(existente.cantidad) || 1) + 1;
                // Conservamos los datos actuales del producto y solo acumulamos cantidad.
            } else {
                carrito.push({
                    id: item.id,
                    nombre: item.nombre,
                    precio: parseFloat(item.precio),
                    imagen: item.imagen,
                    variante: varianteReal ? item.variante : null,
                    cantidad: 1
                });
            }

            localStorage.setItem('carritoRF', JSON.stringify(carrito));
            actualizarUI();
        }

        function agregarAlCarrito(id, nombre, precio, imagen, variante = null) {
            agregarItemCarrito({ id, nombre, precio, imagen, variante });
            cerrarProducto();
            abrirConfirmacion(nombre, imagen);
        }

        function abrirConfirmacion(nombre, imagen) {
            document.getElementById('conf-nombre').innerText = nombre;
            document.getElementById('conf-img').src = imagen;
            
            // Inyectar complementos dinámicos desde la base de datos
            const contenedorComp = document.getElementById('complementos-container');
            contenedorComp.innerHTML = '';
            
            // Filtramos para no mostrar el producto actual, y tomamos 6 opciones para poder scrollear
            const complementos = todosLosArreglos.filter(a => a.nombre !== nombre).slice(0, 6);
            
            if (complementos.length > 0) {
                complementos.forEach(comp => {
                    const urlImagenComp = comp.imagen_url || 'https://images.unsplash.com/photo-1591886960571-74d43a9d4166?auto=format&fit=crop&w=200&q=80';
                    const compData = encodeURIComponent(JSON.stringify(comp));
                    contenedorComp.innerHTML += `
                        <div onclick="abrirComplemento('${compData}')" class="min-w-[110px] w-[110px] border border-gray-200 rounded-xl p-3 text-center cursor-pointer hover:border-brandFuchsia transition-colors flex flex-col justify-between group/comp">
                            <img src="${urlImagenComp}" class="w-12 h-12 mx-auto object-cover rounded mb-2 shadow-sm group-hover/comp:scale-105 transition-transform">
                            <p class="text-[11px] text-gray-700 leading-tight h-8 overflow-hidden">${comp.nombre}</p>
                            <p class="font-bold text-xs mt-1 text-brandDark">$${formatearPrecio(comp.precio)}</p>
                            <span class="text-[10px] font-bold text-brandLightPink mt-1 hover:underline hidden md:block">+ Detalle</span>
                        </div>
                    `;
                });
            } else {
                contenedorComp.innerHTML = '<p class="text-xs text-gray-500">Agrega más productos a tu inventario para ver complementos aquí.</p>';
            }

            const modal = document.getElementById('modal-confirmacion');
            const content = document.getElementById('modal-confirmacion-content');
            
            modal.classList.remove('hidden');
            modal.classList.add('flex'); 
            
            setTimeout(() => {
                content.classList.remove('scale-95', 'opacity-0');
                content.classList.add('scale-100', 'opacity-100');
            }, 10);
            document.body.style.overflow = 'hidden';
        }

        // Función para abrir el modal del complemento
        function abrirComplemento(dataStr) {
            const comp = JSON.parse(decodeURIComponent(dataStr));
            const urlImagen = comp.imagen_url || 'https://images.unsplash.com/photo-1591886960571-74d43a9d4166?auto=format&fit=crop&w=600&q=80';
            
            document.getElementById('comp-modal-nombre').innerText = comp.nombre;
            document.getElementById('comp-modal-precio').innerText = "$" + formatearPrecio(comp.precio);
            document.getElementById('comp-modal-desc').innerText = comp.descripcion || "Complemento perfecto para tu regalo.";
            document.getElementById('comp-modal-img').src = urlImagen;
            
            document.getElementById('btn-modal-comp-detalles').onclick = () => {
                abrirPanelDescripcionRF(comp, false);
            };

            document.getElementById('btn-modal-comp-agregar').onclick = () => {
                ejecutarConUbicacionRF(() => {
                    agregarItemCarrito({ id: comp.id, nombre: comp.nombre, precio: comp.precio, imagen: urlImagen, variante: null });
                    cerrarComplemento();
                });
            };

            const modal = document.getElementById('modal-complemento');
            const content = document.getElementById('modal-complemento-content');
            
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            
            setTimeout(() => {
                content.classList.remove('scale-95', 'opacity-0');
                content.classList.add('scale-100', 'opacity-100');
            }, 10);
        }

        function cerrarComplemento() {
            const modal = document.getElementById('modal-complemento');
            const content = document.getElementById('modal-complemento-content');
            
            content.classList.remove('scale-100', 'opacity-100');
            content.classList.add('scale-95', 'opacity-0');
            
            setTimeout(() => {
                modal.classList.remove('flex');
                modal.classList.add('hidden');
            }, 300);
        }

        // Función para scrollear el carrusel de complementos
        function scrollComplementos(direccion) {
            const container = document.getElementById('complementos-container');
            const scrollAmount = 150; // Ancho aproximado de una tarjeta de complemento
            if (direccion === 'left') {
                container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
            } else {
                container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
            }
        }

        function cerrarConfirmacion() {
            const modal = document.getElementById('modal-confirmacion');
            const content = document.getElementById('modal-confirmacion-content');
            
            content.classList.remove('scale-100', 'opacity-100');
            content.classList.add('scale-95', 'opacity-0');
            
            setTimeout(() => {
                modal.classList.remove('flex');
                modal.classList.add('hidden');
                document.body.style.overflow = 'auto';
            }, 300);
        }

        function totalUnidadesCarrito() {
            return carrito.reduce((sum, item) => sum + (Number(item.cantidad) || 1), 0);
        }

        function normalizarCarrito() {
            const normalizado = [];
            carrito.forEach(item => {
                const limpio = { ...item, cantidad: Math.max(1, Number(item.cantidad) || 1) };
                const varianteReal = tieneVarianteCarrito(limpio.variante);
                const existente = !varianteReal
                    ? normalizado.find(x => String(x.id) === String(limpio.id) && !tieneVarianteCarrito(x.variante))
                    : null;

                if (existente) {
                    existente.cantidad += limpio.cantidad;
                } else {
                    limpio.variante = varianteReal ? limpio.variante : null;
                    normalizado.push(limpio);
                }
            });
            carrito = normalizado;
        }

        function irAlCarrito() {
            cerrarConfirmacion();
            setTimeout(() => {
                const panel = document.getElementById('carrito-lateral');
                if (!panel) return;
                actualizarUI();
                panel.classList.remove('carrito-cerrado');
                panel.classList.add('carrito-abierto');
            }, 320);
        }

        function actualizarUI() {
            normalizarCarrito();
            localStorage.setItem('carritoRF', JSON.stringify(carrito));
            const unidades = totalUnidadesCarrito();
            document.getElementById('contador-carrito').innerText = unidades;
            const boton = document.getElementById('contador-carrito-boton');
            if (boton) boton.innerText = unidades;

            const contenedor = document.getElementById('items-carrito');
            contenedor.innerHTML = '';
            let total = 0;

            if (carrito.length === 0) {
                contenedor.innerHTML = '<div class="py-8 text-center text-sm text-gray-500">Tu carrito está vacío</div>';
            } else {
                carrito.forEach((item, index) => {
                    const cantidad = Math.max(1, Number(item.cantidad) || 1);
                    total += Number(item.precio) * cantidad;
                    const sku = String(item.id ?? '').padStart(3, '0');
                    contenedor.innerHTML += `
                        <div class="flex items-start gap-3 py-3 border-b border-gray-100 last:border-b-0">
                            <img src="${escaparHtml(item.imagen || '')}" onerror="this.style.visibility='hidden'" class="w-[82px] h-[82px] object-cover rounded-md bg-gray-100 flex-shrink-0">
                            <div class="min-w-0 flex-1 pt-0.5">
                                <h4 class="font-medium text-[12px] leading-tight text-brandDark line-clamp-2">${escaparHtml(item.nombre)}</h4>
                                <p class="font-semibold text-[11px] text-brandDark mt-1">$${formatearPrecio(item.precio)}<span class="text-[7px] align-top ml-0.5">MXN</span></p>
                                <p class="text-[10px] text-gray-500 mt-1">Cantidad: ${cantidad}</p>
                                <p class="text-[10px] text-gray-500">SKU: ${escaparHtml(sku)}</p>
                                ${item.variante ? `<p class="text-[10px] text-gray-500 truncate mt-0.5">${escaparHtml(formatearVarianteCarrito(item.variante))}</p>` : ''}
                            </div>
                            <div class="flex flex-col items-end justify-between self-stretch">
                                <div class="flex items-center border border-gray-900 rounded-[4px] h-7 overflow-hidden bg-white">
                                    <button type="button" onclick="event.preventDefault(); event.stopPropagation(); cambiarCantidadCarrito(${index}, -1)" class="w-7 h-full text-sm font-semibold hover:bg-gray-100">−</button>
                                    <span class="w-6 text-center text-[11px] font-semibold">${cantidad}</span>
                                    <button type="button" onclick="event.preventDefault(); event.stopPropagation(); cambiarCantidadCarrito(${index}, 1)" class="w-7 h-full text-sm font-semibold hover:bg-gray-100">+</button>
                                </div>
                                <button type="button" onclick="event.preventDefault(); event.stopPropagation(); eliminarDelCarrito(${index})" class="mt-2 w-8 h-8 flex items-center justify-center rounded-md text-gray-700 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer" aria-label="Eliminar producto" title="Eliminar producto">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 7h12M9 7V5h6v2m2 0v13H7V7m3 4v6m4-6v6"></path></svg>
                                </button>
                            </div>
                        </div>
                    `;
                });
            }
            document.getElementById('total-carrito').innerText = formatearPrecio(total);
        }

        function formatearVarianteCarrito(variante) {
            if (!variante) return '';
            if (typeof variante === 'string') return variante;
            if (Array.isArray(variante)) return variante.join(', ');
            if (typeof variante === 'object') return Object.entries(variante).map(([k,v]) => `${k}: ${v}`).join(' · ');
            return String(variante);
        }

        function cambiarCantidadCarrito(index, cambio) {
            if (!carrito[index]) return;
            const actual = Math.max(1, Number(carrito[index].cantidad) || 1);
            const nueva = actual + cambio;
            if (nueva <= 0) {
                eliminarDelCarrito(index);
                return;
            }
            carrito[index].cantidad = nueva;
            localStorage.setItem('carritoRF', JSON.stringify(carrito));
            actualizarUI();
        }

        function eliminarDelCarrito(index) {
            carrito.splice(index, 1);
            localStorage.setItem('carritoRF', JSON.stringify(carrito));
            actualizarUI();
        }

        function toggleCarrito() {
            const panel = document.getElementById('carrito-lateral');
            if (!panel) return;
            const abrir = panel.classList.contains('carrito-cerrado');
            if (abrir) {
                actualizarUI();
                panel.classList.remove('carrito-cerrado');
                panel.classList.add('carrito-abierto');
            } else {
                panel.classList.remove('carrito-abierto');
                panel.classList.add('carrito-cerrado');
            }
        }

        function procesarPago() {
            if (carrito.length === 0) return alert('Por favor, agrega un arreglo antes de continuar.');
            window.location.href = '/checkout.html';
        }

        async function abrirProductoDesdeRuta() {
            const match = window.location.pathname.match(/^\/producto\/(\d+)\/?$/);
            if (!match) return;
            try {
                const respuesta = await fetch('/api/catalogo/' + match[1]);
                if (!respuesta.ok) return;
                const producto = await respuesta.json();
                mostrarProducto(producto);
            } catch (error) {
                console.error('Error cargando producto desde URL', error);
            }
        }


        // Selector principal de ubicación de la página de inicio
        let rfHome = { estado: '', ciudad: '', tipoFecha: '', fecha: '' };
        const RF_HOME_CIUDADES = {
            'Ciudad de México': ['Benito Juárez', 'Cuauhtémoc', 'Miguel Hidalgo', 'Coyoacán'],
            'Tamaulipas': ['Ciudad Madero', 'Tampico', 'Altamira', 'Ciudad Victoria', 'Matamoros', 'Reynosa', 'Nuevo Laredo'],
            'Nuevo León': ['Monterrey', 'San Pedro Garza García', 'Guadalupe', 'San Nicolás de los Garza', 'Apodaca']
        };
        function rfHomeIsoDate(d = new Date()) {
            const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0,10);
        }
        function cerrarMenusHomeRF() {
            document.querySelectorAll('.rf-home-menu').forEach(menu => menu.classList.add('hidden'));
            document.querySelectorAll('.rf-home-trigger').forEach(trigger => trigger.setAttribute('aria-expanded','false'));
        }
        function abrirMenuHomeRF(id) {
            const triggerForMenu = document.getElementById(id.replace('-menu','-trigger'));
            if (triggerForMenu?.disabled) return;
            const menu = document.getElementById(id); if (!menu) return;
            const trigger = document.querySelector(`[data-home-menu="${id}"]`) || document.getElementById(id.replace('-menu','-trigger'));
            const open = !menu.classList.contains('hidden');
            cerrarMenusHomeRF();
            if (!open) {
                menu.classList.remove('hidden');
                if (trigger) trigger.setAttribute('aria-expanded','true');
            }
        }
        function seleccionarEstadoHomeRF(valor) {
            rfHome.estado = valor; rfHome.ciudad = '';
            document.getElementById('home-estado-trigger').innerHTML = `${valor}<span class="rf-home-chevron"></span>`;
            const menu = document.getElementById('home-ciudad-menu');
            menu.innerHTML = (RF_HOME_CIUDADES[valor] || []).map(c => `<button type="button" class="rf-home-option" data-value="${c.replace(/"/g,'&quot;')}">${c}</button>`).join('');
            menu.querySelectorAll('.rf-home-option').forEach(o => o.addEventListener('click', () => seleccionarCiudadHomeRF(o.dataset.value)));
            const cityTrigger = document.getElementById('home-ciudad-trigger');
            cityTrigger.disabled = false;
            cityTrigger.innerHTML = 'Ciudad<span class="rf-home-chevron"></span>';
            const fechaTrigger = document.getElementById('home-fecha-trigger');
            fechaTrigger.disabled = true;
            fechaTrigger.innerHTML = 'Fecha de entrega<span class="rf-home-chevron"></span>';
            rfHome.tipoFecha = '';
            rfHome.fecha = '';
            document.getElementById('home-otra-fecha-wrap').classList.add('hidden');
            document.getElementById('home-otra-fecha').value = '';
            cerrarMenusHomeRF();
        }
        function seleccionarCiudadHomeRF(valor) {
            rfHome.ciudad = valor;
            document.getElementById('home-ciudad-trigger').innerHTML = `${valor}<span class="rf-home-chevron"></span>`;
            const fechaTrigger = document.getElementById('home-fecha-trigger');
            fechaTrigger.disabled = false;
            fechaTrigger.innerHTML = 'Fecha de entrega<span class="rf-home-chevron"></span>';
            rfHome.tipoFecha = '';
            rfHome.fecha = '';
            document.getElementById('home-otra-fecha-wrap').classList.add('hidden');
            document.getElementById('home-otra-fecha').value = '';
            cerrarMenusHomeRF();
        }
        function seleccionarFechaHomeRF(tipo) {
            rfHome.tipoFecha = tipo;
            const wrap = document.getElementById('home-otra-fecha-wrap');
            const trigger = document.getElementById('home-fecha-trigger');
            if (tipo === 'hoy') { rfHome.fecha = rfHomeIsoDate(); trigger.innerHTML = 'Hoy<span class="rf-home-chevron"></span>'; wrap.classList.add('hidden'); cerrarMenusHomeRF(); }
            else if (tipo === 'manana') { const d=new Date(); d.setDate(d.getDate()+1); rfHome.fecha=rfHomeIsoDate(d); trigger.innerHTML='Mañana<span class="rf-home-chevron"></span>'; wrap.classList.add('hidden'); cerrarMenusHomeRF(); }
            else { rfHome.fecha=''; trigger.innerHTML='Otro día<span class="rf-home-chevron"></span>'; wrap.classList.remove('hidden'); document.getElementById('home-otra-fecha').focus(); }
        }
        function inicializarSelectorHomeRF() {
            // Limpia datos de versiones anteriores para que la primera carga de esta versión
            // realmente comience vacía. Después, la selección se conserva durante la sesión.
            try {
                const version = 'rf-location-v3';
                if (sessionStorage.getItem('rf_location_ui_version') !== version) {
                    localStorage.removeItem('rf_ubicacion_entrega');
                    localStorage.removeItem('rf_ubicacion_entrega');
                    sessionStorage.setItem('rf_location_ui_version', version);
                }
            } catch (_) {}
            // El selector inicia vacío en una instalación nueva. Una vez completada, la ubicación
            // se conserva en el navegador para navegar entre categorías sin volver a pedirla.
            const saved = (() => { try{return JSON.parse(localStorage.getItem('rf_ubicacion_entrega')||'null')}catch(_){return null} })();
            rfHome.estado = saved?.estado || '';
            rfHome.ciudad = saved?.ciudad || '';
            rfHome.fecha = saved?.fecha || '';
            rfHome.tipoFecha = saved?.tipoFecha || '';
            const estadoTrigger = document.getElementById('home-estado-trigger');
            const ciudadTrigger = document.getElementById('home-ciudad-trigger');
            if (rfHome.estado) {
                estadoTrigger.innerHTML = `${rfHome.estado}<span class="rf-home-chevron"></span>`;
                const cities=RF_HOME_CIUDADES[rfHome.estado]||[];
                document.getElementById('home-ciudad-menu').innerHTML=cities.map(c=>`<button type="button" class="rf-home-option" data-value="${c.replace(/"/g,'&quot;')}">${c}</button>`).join('');
                document.getElementById('home-ciudad-menu').querySelectorAll('.rf-home-option').forEach(o=>o.addEventListener('click',()=>seleccionarCiudadHomeRF(o.dataset.value)));
                ciudadTrigger.disabled = false;
                ciudadTrigger.innerHTML=`${rfHome.ciudad||'Ciudad'}<span class="rf-home-chevron"></span>`;
                document.getElementById('home-fecha-trigger').disabled = !rfHome.ciudad;
            } else {
                estadoTrigger.innerHTML='Estado<span class="rf-home-chevron"></span>';
                ciudadTrigger.disabled = true;
                ciudadTrigger.innerHTML='Ciudad<span class="rf-home-chevron"></span>';
                document.getElementById('home-fecha-trigger').disabled = true;
                document.getElementById('home-fecha-trigger').innerHTML='Fecha de entrega<span class="rf-home-chevron"></span>';
                rfHome.tipoFecha = ''; rfHome.fecha = '';
            }
            if(saved?.fecha && rfHome.estado){
                const today=rfHomeIsoDate(), tomorrow=new Date(); tomorrow.setDate(tomorrow.getDate()+1);
                if(saved.fecha===today) document.getElementById('home-fecha-trigger').innerHTML='Hoy<span class="rf-home-chevron"></span>';
                else if(saved.fecha===rfHomeIsoDate(tomorrow)) document.getElementById('home-fecha-trigger').innerHTML='Mañana<span class="rf-home-chevron"></span>';
                else { document.getElementById('home-fecha-trigger').innerHTML='Otro día<span class="rf-home-chevron"></span>'; document.getElementById('home-otra-fecha').value=saved.fecha; document.getElementById('home-otra-fecha-wrap').classList.remove('hidden'); }
            }
            document.getElementById('home-otra-fecha').min=rfHomeIsoDate();
            document.getElementById('home-estado-trigger').onclick=()=>abrirMenuHomeRF('home-estado-menu');
            document.getElementById('home-ciudad-trigger').onclick=()=>abrirMenuHomeRF('home-ciudad-menu');
            document.getElementById('home-fecha-trigger').onclick=()=>abrirMenuHomeRF('home-fecha-menu');
            document.querySelectorAll('#home-estado-menu .rf-home-option').forEach(o=>o.addEventListener('click',()=>seleccionarEstadoHomeRF(o.dataset.value)));
            document.querySelectorAll('#home-fecha-menu > .rf-home-option').forEach(o=>o.addEventListener('click',()=>seleccionarFechaHomeRF(o.dataset.value)));
            document.getElementById('home-otra-fecha').addEventListener('change',e=>{rfHome.fecha=e.target.value; if(e.target.value) document.getElementById('home-fecha-trigger').innerHTML=`${new Date(e.target.value+'T00:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'short'})}<span class="rf-home-chevron"></span>`;});
        }
        function confirmarSelectorHomeRF() {
            if(rfHome.tipoFecha==='otro') rfHome.fecha=document.getElementById('home-otra-fecha').value;
            if(!rfHome.estado || !rfHome.ciudad || !rfHome.fecha) { abrirModalUbicacion(()=>{}); return; }
            if(rfHome.fecha < rfHomeIsoDate()) return;
            localStorage.setItem('rf_ubicacion_entrega', JSON.stringify({...rfHome, actualizadoEn:new Date().toISOString()}));
            const target=document.getElementById('seccion-catalogo'); if(target) target.scrollIntoView({behavior:'smooth'});
        }
        document.addEventListener('click',e=>{if(!e.target.closest('.rf-home-select')) cerrarMenusHomeRF();});

        // ---------------------------------------------------------------------
        // ---------------------------------------------------------------------
        // Ubicación obligatoria para navegar por categorías
        // ---------------------------------------------------------------------
        let rfAccionPendiente = null;
        const RF_UBICACION_KEY = 'rf_ubicacion_entrega';
        const RF_CIUDADES = {
            'Ciudad de México': ['Benito Juárez', 'Cuauhtémoc', 'Miguel Hidalgo', 'Coyoacán'],
            'Tamaulipas': ['Ciudad Madero', 'Tampico', 'Altamira', 'Ciudad Victoria', 'Matamoros', 'Reynosa', 'Nuevo Laredo'],
            'Nuevo León': ['Monterrey', 'San Pedro Garza García', 'Guadalupe', 'San Nicolás de los Garza', 'Apodaca']
        };

        function fechaIsoRF(d = new Date()) {
            const x = new Date(d);
            x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
            return x.toISOString().slice(0, 10);
        }
        function ubicacionRFCompleta() {
            try {
                const data = JSON.parse(localStorage.getItem(RF_UBICACION_KEY) || 'null');
                return !!(data && data.estado && data.ciudad && data.fecha);
            } catch (_) { return false; }
        }

        function portalDropdownRF(menu) {
            if (!menu || menu.classList.contains('rf-portaled')) return;
            const ph = document.createComment('rf-dropdown-' + menu.id);
            menu._rfPlaceholder = ph;
            menu.parentNode.insertBefore(ph, menu);
            document.body.appendChild(menu);
            menu.classList.add('rf-portaled');
        }
        function devolverDropdownRF(menu) {
            if (!menu || !menu._rfPlaceholder) return;
            const ph = menu._rfPlaceholder;
            if (ph.parentNode) ph.parentNode.insertBefore(menu, ph.nextSibling);
            ph.remove();
            menu._rfPlaceholder = null;
            menu.classList.remove('rf-portaled');
            ['position','left','top','width','max-height','z-index'].forEach(k => menu.style.removeProperty(k));
        }
        function posicionarDropdownRFFlotante(menu, trigger) {
            if (!menu || !trigger) return;
            const r = trigger.getBoundingClientRect();
            const gap = 7, margin = 12;
            const desired = Math.min(230, Math.max(120, menu.scrollHeight || 210));
            const below = Math.max(0, window.innerHeight - r.bottom - margin - gap);
            const above = Math.max(0, r.top - margin - gap);
            const up = below < Math.min(190, desired) && above > below;
            const h = Math.max(90, Math.min(desired, up ? above : below));
            menu.style.setProperty('position','fixed','important');
            menu.style.setProperty('left',`${Math.round(r.left)}px`,'important');
            menu.style.setProperty('width',`${Math.round(r.width)}px`,'important');
            menu.style.setProperty('max-height',`${Math.round(h)}px`,'important');
            menu.style.setProperty('top',`${Math.round(up ? r.top-h-gap : r.bottom+gap)}px`,'important');
            menu.style.setProperty('z-index','2147483647','important');
        }
        function cerrarDropdownsRF(excepto = null) {
            document.querySelectorAll('.rf-custom-select.is-open').forEach(field => field.classList.remove('is-open'));
            document.querySelectorAll('.rf-custom-menu').forEach(menu => {
                if (menu === excepto) return;
                const trigger = document.querySelector(`[data-target="${menu.id}"]`);
                if (trigger) trigger.setAttribute('aria-expanded','false');
                menu.classList.add('hidden');
                devolverDropdownRF(menu);
            });
        }
        function abrirDropdownRF(menuId, trigger) {
            const menu = document.getElementById(menuId);
            if (!menu || !trigger || trigger.disabled) return;
            const field = trigger.closest('.rf-custom-select');
            const wasOpen = !menu.classList.contains('hidden');
            cerrarDropdownsRF(wasOpen ? menu : null);
            if (wasOpen) {
                menu.classList.add('hidden');
                trigger.setAttribute('aria-expanded','false');
                field?.classList.remove('is-open');
                devolverDropdownRF(menu);
                return;
            }
            menu.classList.remove('hidden');
            trigger.setAttribute('aria-expanded','true');
            field?.classList.add('is-open');
            portalDropdownRF(menu);
            requestAnimationFrame(() => posicionarDropdownRFFlotante(menu, trigger));
        }
        function reposicionarDropdownAbertoRF() {
            const field = document.querySelector('.rf-custom-select.is-open');
            const menu = document.querySelector('.rf-custom-menu.rf-portaled:not(.hidden)');
            const trigger = field?.querySelector('.rf-select-trigger');
            if (trigger && menu) posicionarDropdownRFFlotante(menu, trigger);
        }
        window.addEventListener('resize', reposicionarDropdownAbertoRF);
        window.addEventListener('scroll', reposicionarDropdownAbertoRF, {passive:true});

        function cargarUbicacionGuardadaEnModal() {
            let guardada = null;
            try { guardada = JSON.parse(localStorage.getItem(RF_UBICACION_KEY) || 'null'); } catch (_) {}
            const estado = document.getElementById('rf-ubicacion-estado');
            const ciudad = document.getElementById('rf-ubicacion-ciudad');
            const fecha = document.getElementById('rf-ubicacion-fecha');
            const et = document.getElementById('rf-estado-trigger');
            const ct = document.getElementById('rf-ciudad-trigger');
            const ft = document.getElementById('rf-fecha-trigger');
            const otra = document.getElementById('rf-otra-fecha');
            const wrap = document.getElementById('rf-otra-fecha-wrap');
            if (!estado || !ciudad || !fecha || !et || !ct || !ft) return;
            cerrarDropdownsRF();
            estado.value=''; ciudad.value=''; fecha.value='';
            et.innerHTML='Estado <span class="text-brandLightPink">*</span><span class="rf-custom-chevron"></span>';
            ct.innerHTML='Ciudad <span class="text-brandLightPink">*</span><span class="rf-custom-chevron"></span>'; ct.disabled=true; ct.classList.add('is-disabled');
            ft.innerHTML='Fecha de entrega <span class="text-brandLightPink">*</span><span class="rf-custom-chevron"></span>'; ft.disabled=true; ft.classList.add('is-disabled');
            if (otra) otra.value=''; wrap?.classList.add('hidden');
            if (!guardada?.estado) return;
            seleccionarEstadoRF(guardada.estado);
            if (!guardada.ciudad) return;
            seleccionarCiudadRF(guardada.ciudad);
            if (!guardada.fecha) return;
            let tipo=guardada.tipoFecha;
            const hoy=fechaIsoRF(); const d=new Date(); d.setDate(d.getDate()+1); const manana=fechaIsoRF(d);
            if (!tipo) tipo=guardada.fecha===hoy?'hoy':(guardada.fecha===manana?'manana':'otro');
            seleccionarFechaRF(tipo);
            if (tipo==='otro' && otra) { otra.value=guardada.fecha; wrap?.classList.remove('hidden'); }
        }
        function abrirModalUbicacion(accion) {
            rfAccionPendiente=typeof accion==='function'?accion:null;
            cargarUbicacionGuardadaEnModal();
            const modal=document.getElementById('modal-ubicacion'); const error=document.getElementById('rf-ubicacion-error');
            if(!modal)return; error?.classList.add('hidden'); if(error)error.innerText='';
            modal.classList.remove('hidden'); modal.classList.add('flex'); document.body.style.overflow='hidden';
        }
        function cerrarModalUbicacion() {
            rfAccionPendiente=null; cerrarDropdownsRF();
            const modal=document.getElementById('modal-ubicacion'); if(!modal)return;
            modal.classList.remove('flex'); modal.classList.add('hidden'); document.body.style.overflow='';
        }
        function seleccionarEstadoRF(valor) {
            const input=document.getElementById('rf-ubicacion-estado'); const trigger=document.getElementById('rf-estado-trigger'); if(!input||!trigger)return;
            input.value=valor; trigger.innerHTML=`${valor}<span class="rf-custom-chevron"></span>`; actualizarCiudadesRF();
            const ft=document.getElementById('rf-fecha-trigger'); ft.disabled=true; ft.classList.add('is-disabled'); document.getElementById('rf-ubicacion-fecha').value='';
            document.getElementById('rf-otra-fecha-wrap')?.classList.add('hidden'); const otra=document.getElementById('rf-otra-fecha'); if(otra)otra.value=''; cerrarDropdownsRF();
        }
        function actualizarCiudadesRF() {
            const estado=document.getElementById('rf-ubicacion-estado').value, input=document.getElementById('rf-ubicacion-ciudad'), trigger=document.getElementById('rf-ciudad-trigger'), menu=document.getElementById('rf-ciudad-menu');
            input.value=''; trigger.innerHTML='Ciudad <span class="text-brandLightPink">*</span><span class="rf-custom-chevron"></span>';
            const ciudades=RF_CIUDADES[estado]||[];
            menu.innerHTML=ciudades.map(n=>`<button type="button" class="rf-option" data-value="${n.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}">${n}</button>`).join('');
            trigger.disabled=!ciudades.length; trigger.classList.toggle('is-disabled',!ciudades.length);
            menu.querySelectorAll('.rf-option').forEach(o=>o.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();seleccionarCiudadRF(o.dataset.value);}));
        }
        function seleccionarCiudadRF(valor) {
            const input=document.getElementById('rf-ubicacion-ciudad'), trigger=document.getElementById('rf-ciudad-trigger'); if(!input||!trigger)return;
            input.value=valor; trigger.innerHTML=`${valor}<span class="rf-custom-chevron"></span>`;
            const ft=document.getElementById('rf-fecha-trigger'); ft.disabled=false; ft.classList.remove('is-disabled'); cerrarDropdownsRF();
        }
        function seleccionarFechaRF(tipo) {
            const input=document.getElementById('rf-ubicacion-fecha'), trigger=document.getElementById('rf-fecha-trigger'), wrap=document.getElementById('rf-otra-fecha-wrap'); if(!input||!trigger)return;
            input.value=tipo; const labels={hoy:'Hoy',manana:'Mañana',otro:'Otro día'}; trigger.innerHTML=`${labels[tipo]||'Fecha de entrega'}<span class="rf-custom-chevron"></span>`;
            wrap?.classList.toggle('hidden',tipo!=='otro');
            document.querySelectorAll('#rf-fecha-menu > .rf-option').forEach(o=>o.classList.toggle('is-selected',o.dataset.value===tipo));
            if(tipo!=='otro') cerrarDropdownsRF();
        }
        function fechaEntregaRF() {
            const tipo=document.getElementById('rf-ubicacion-fecha')?.value;
            if(tipo==='hoy')return fechaIsoRF();
            if(tipo==='manana'){const d=new Date();d.setDate(d.getDate()+1);return fechaIsoRF(d);}
            if(tipo==='otro')return document.getElementById('rf-otra-fecha')?.value||'';
            return '';
        }
        function confirmarUbicacion() {
            const estado=document.getElementById('rf-ubicacion-estado')?.value||''; const ciudad=document.getElementById('rf-ubicacion-ciudad')?.value||''; const tipoFecha=document.getElementById('rf-ubicacion-fecha')?.value||''; const fecha=fechaEntregaRF(); const error=document.getElementById('rf-ubicacion-error');
            if(!estado||!ciudad||!tipoFecha||!fecha){error.innerText=tipoFecha==='otro'&&!fecha?'Selecciona la fecha de entrega.':'Completa estado, ciudad y fecha de entrega para continuar.';error.classList.remove('hidden');return;}
            const fechaObj=new Date(fecha+'T00:00:00'); const hoy=new Date(); hoy.setHours(0,0,0,0);
            if(fechaObj<hoy){error.innerText='La fecha de entrega no puede ser anterior a hoy.';error.classList.remove('hidden');return;}
            localStorage.setItem(RF_UBICACION_KEY,JSON.stringify({estado,ciudad,fecha,tipoFecha,actualizadoEn:new Date().toISOString()})); actualizarUbicacionProductoRF();
            const accion=rfAccionPendiente; rfAccionPendiente=null; cerrarModalUbicacion(); if(accion)setTimeout(accion,0);
        }

        // Rutas de catálogo: se mantienen los mega menús y su diseño, pero ahora todos los enlaces navegan a páginas reales.
        const RF_CATEGORY_ROUTES = {
            'Cumpleaños':'/categoria/cumpleanos','Ocasiones':'/categoria/ocasiones','Flores y plantas':'/categoria/flores-y-plantas','Globos':'/categoria/globos','Regalos':'/categoria/regalos',
            'Todas las flores':'/categoria/flores-y-plantas','Rosas':'/categoria/flores-y-plantas/rosas','Gerberas':'/categoria/flores-y-plantas/gerberas','Tulipanes':'/categoria/flores-y-plantas/tulipanes','Orquídeas':'/categoria/flores-y-plantas/orquideas','Combinados':'/categoria/flores-y-plantas/combinados','Premium':'/categoria/flores-y-plantas/flores-premium','Plantas':'/categoria/flores-y-plantas/plantas','Girasoles':'/categoria/flores-y-plantas/girasoles','Lilys y Stargazer':'/categoria/flores-y-plantas/lilys-y-stargazer','Tulipanes y Cala Lilies':'/categoria/flores-y-plantas/tulipanes-y-cala-lilies','Ramos':'/categoria/flores-y-plantas/ramos','Jarrón':'/categoria/flores-y-plantas/jarron','Cajas':'/categoria/flores-y-plantas/cajas','Coronas Funerarias':'/categoria/flores-y-plantas/coronas-funerarias','Caneas':'/categoria/flores-y-plantas/caneas','Flores premium':'/categoria/flores-y-plantas/flores-premium','Servicios Funerarios':'/categoria/flores-y-plantas/servicios-funerarios','Consuelo en Casa':'/categoria/flores-y-plantas/consuelo-en-casa','Mini plantas':'/categoria/flores-y-plantas/mini-plantas','Plantas medianas':'/categoria/flores-y-plantas/plantas-medianas','Plantas con regalos':'/categoria/flores-y-plantas/plantas-con-regalos',
            'Todos los globos':'/categoria/globos','Globos Personalizados':'/categoria/globos/para-ella','Combos con globo':'/categoria/globos/combos','Graduación':'/categoria/globos/graduacion','Nacimiento':'/categoria/globos/nacimiento','Just Because':'/categoria/globos/just-because','Mejórate Pronto':'/categoria/globos/mejorate-pronto','Metálicos':'/categoria/globos/metalicos','Esfera':'/categoria/globos/esfera','Burbuja':'/categoria/globos/burbuja','Ramilletes':'/categoria/globos/ramilletes','Para ella':'/categoria/globos/para-ella','Para Él':'/categoria/globos/para-el',
            'Para Ella':'/categoria/regalos/para-ella','Para Él':'/categoria/regalos/para-el','Para Mamá':'/categoria/regalos/para-mama','Para Papá':'/categoria/regalos/para-papa','Para Niños':'/categoria/regalos/para-ninos','Collares':'/categoria/regalos/collares','Pulseras':'/categoria/regalos/pulseras','Aretes':'/categoria/regalos/aretes','Sets':'/categoria/regalos/sets','Combos':'/categoria/regalos/combos','Osos':'/categoria/regalos/osos','Otros Peluches':'/categoria/regalos/otros-peluches','Combos de peluches':'/categoria/regalos/combos-de-peluches','Mascarillas':'/categoria/regalos/mascarillas','Cremas':'/categoria/regalos/cremas','Sets de Belleza':'/categoria/regalos/sets-de-belleza','Perfumes':'/categoria/regalos/perfumes','Velas y Aromas':'/categoria/regalos/velas-y-aromas','Personalizados':'/categoria/regalos/personalizados','Flores y Plantas':'/categoria/regalos/flores-y-plantas','Cajas de Regalo':'/categoria/regalos/cajas-de-regalo','Diarios y Agendas':'/categoria/regalos/diarios-y-agendas','Certificados':'/categoria/regalos/certificados'
        };

        function prepararRutasCategorias() {
            const topRoutes = { 'Cumpleaños':'/categoria/cumpleanos','Ocasiones':'/categoria/ocasiones','Flores y plantas':'/categoria/flores-y-plantas','Globos':'/categoria/globos','Regalos':'/categoria/regalos' };
            document.querySelectorAll('nav .nav-item').forEach(item => {
                const top = (item.querySelector(':scope > .nav-link')?.textContent || '').trim();
                const topHref = topRoutes[top];
                if (topHref) {
                    const link = item.querySelector(':scope > .nav-link');
                    link.href = topHref;
                    link.dataset.categoryChild = '1';
                    link.removeAttribute('onclick');
                }
                item.querySelectorAll('.mega-menu a').forEach(link => {
                    const label = link.textContent.trim().replace(/\s*>\s*$/, '');
                    if (label === 'Ver todo') {
                        if (topHref) { link.href = topHref; link.dataset.categoryChild = '1'; }
                        link.removeAttribute('onclick');
                        return;
                    }
                    const href = RF_CATEGORY_ROUTES[label];
                    if (href) { link.href = href; link.dataset.categoryChild = '1'; }
                    else if (link.getAttribute('href') === '#') link.addEventListener('click', e => e.preventDefault());
                });
            });
        }

        function instalarBloqueoCategorias() {
            const nav = document.querySelector('nav');
            if (!nav) return;
            nav.addEventListener('click', function(e) {
                const link = e.target.closest('a');
                if (!link) return;
                const item = link.closest('.nav-item');
                if (!item) return;
                const textoItem = (item.querySelector('.nav-link')?.innerText || '').trim();
                if (!textoItem || textoItem === 'Inicio') return;
                if (ubicacionRFCompleta()) return;
                e.preventDefault();
                e.stopPropagation();
                abrirModalUbicacion(() => {
                    if (typeof link.onclick === 'function') link.onclick.call(link, e);
                    else if (link.getAttribute('href') && link.getAttribute('href') !== '#') window.location.href = link.href;
                });
            }, true);

            document.querySelectorAll('a[href="#seccion-catalogo"]').forEach(link => {
                link.addEventListener('click', function(e) {
                    if (ubicacionRFCompleta()) return;
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    const accionOriginal = this.onclick;
                    abrirModalUbicacion(() => {
                        if (typeof accionOriginal === 'function') accionOriginal.call(this, e);
                        const href = this.getAttribute('href');
                        if (href && href !== '#') window.location.hash = href.substring(1);
                    });
                }, true);
            });
        }

        document.addEventListener('DOMContentLoaded', () => {

            const rfOccTrack = document.getElementById('rf-occasion-track');
            const rfOccPrev = document.querySelector('.rf-occasion-prev');
            const rfOccNext = document.querySelector('.rf-occasion-next');
            if (rfOccTrack && rfOccPrev && rfOccNext) {
                const updateRfOccasionArrows = () => {
                    const max = rfOccTrack.scrollWidth - rfOccTrack.clientWidth - 2;
                    rfOccPrev.disabled = rfOccTrack.scrollLeft <= 2;
                    rfOccNext.disabled = rfOccTrack.scrollLeft >= max;
                };
                const scrollRfOccasions = (direction) => {
                    const card = rfOccTrack.querySelector('.rf-occasion-card');
                    const amount = (card ? card.getBoundingClientRect().width : rfOccTrack.clientWidth * 0.8) + 18;
                    rfOccTrack.scrollBy({left: direction * amount, behavior: 'smooth'});
                };
                rfOccPrev.addEventListener('click', () => scrollRfOccasions(-1));
                rfOccNext.addEventListener('click', () => scrollRfOccasions(1));
                rfOccTrack.addEventListener('scroll', updateRfOccasionArrows, {passive:true});
                window.addEventListener('resize', updateRfOccasionArrows);
                updateRfOccasionArrows();
            }
            document.querySelectorAll('.rf-occasion-link').forEach(link => {
                link.addEventListener('click', e => {
                    if (ubicacionRFCompleta()) return;
                    e.preventDefault();
                    e.stopPropagation();
                    abrirModalUbicacion(() => { window.location.href = link.href; });
                }, true);
            });

            const rfFavTrack = document.getElementById('contenedor-arreglos');
            const rfFavPrev = document.querySelector('.rf-favorite-prev');
            const rfFavNext = document.querySelector('.rf-favorite-next');
            window.actualizarFlechasFavoritosRF = function() {
                if (!rfFavTrack || !rfFavPrev || !rfFavNext) return;
                const max = rfFavTrack.scrollWidth - rfFavTrack.clientWidth - 2;
                rfFavPrev.disabled = rfFavTrack.scrollLeft <= 2;
                rfFavNext.disabled = rfFavTrack.scrollLeft >= max;
            };
            if (rfFavTrack && rfFavPrev && rfFavNext) {
                const scrollFav = direction => {
                    const card = rfFavTrack.querySelector('.rf-favorite-card');
                    const amount = (card ? card.getBoundingClientRect().width : rfFavTrack.clientWidth * .8) + 18;
                    rfFavTrack.scrollBy({left: direction * amount, behavior:'smooth'});
                };
                rfFavPrev.addEventListener('click', () => scrollFav(-1));
                rfFavNext.addEventListener('click', () => scrollFav(1));
                rfFavTrack.addEventListener('scroll', window.actualizarFlechasFavoritosRF, {passive:true});
                window.addEventListener('resize', window.actualizarFlechasFavoritosRF);
            }
            document.querySelectorAll('.rf-view-all-catalog').forEach(link => {
                link.addEventListener('click', e => {
                    if (ubicacionRFCompleta()) return;
                    e.preventDefault();
                    e.stopPropagation();
                    abrirModalUbicacion(() => { window.location.href = link.href; });
                }, true);
            });

            const rfTrack = document.getElementById('rf-category-track');
            const rfPrev = document.querySelector('.rf-category-prev');
            const rfNext = document.querySelector('.rf-category-next');
            if (rfTrack && rfPrev && rfNext) {
                const updateRfCategoryArrows = () => {
                    const max = rfTrack.scrollWidth - rfTrack.clientWidth - 2;
                    rfPrev.disabled = rfTrack.scrollLeft <= 2;
                    rfNext.disabled = rfTrack.scrollLeft >= max;
                };
                const scrollRfCategories = (direction) => {
                    const card = rfTrack.querySelector('.rf-category-card');
                    const amount = (card ? card.getBoundingClientRect().width : rfTrack.clientWidth * 0.8) + 18;
                    rfTrack.scrollBy({left: direction * amount, behavior: 'smooth'});
                };
                rfPrev.addEventListener('click', () => scrollRfCategories(-1));
                rfNext.addEventListener('click', () => scrollRfCategories(1));
                rfTrack.addEventListener('scroll', updateRfCategoryArrows, {passive:true});
                window.addEventListener('resize', updateRfCategoryArrows);
                updateRfCategoryArrows();
            }
            normalizarCarrito();
            actualizarUI();
            inicializarSelectorHomeRF();
            document.querySelectorAll('#modal-ubicacion .rf-select-trigger').forEach(trigger => {
                trigger.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); abrirDropdownRF(trigger.dataset.target, trigger); });
            });
            document.querySelectorAll('#rf-estado-menu .rf-option').forEach(option => option.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); seleccionarEstadoRF(option.dataset.value); }));
            document.querySelectorAll('#rf-fecha-menu > .rf-option').forEach(option => option.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); seleccionarFechaRF(option.dataset.value); }));
            // Carrito: listener directo para evitar que otros manejadores globales interfieran.
            const carritoBotonHeader = document.getElementById('btn-carrito-header');
            if (carritoBotonHeader) {
                carritoBotonHeader.addEventListener('click', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleCarrito();
                });
            }

            document.addEventListener('click', e => {
                if (!e.target.closest('.rf-custom-select') && !e.target.closest('.rf-custom-menu')) cerrarDropdownsRF();
                const carritoPanel = document.getElementById('carrito-lateral');
                if (carritoPanel && !carritoPanel.contains(e.target) && !e.target.closest('#btn-carrito-header')) {
                    carritoPanel.classList.remove('carrito-abierto');
                    carritoPanel.classList.add('carrito-cerrado');
                }
            });
            const otraFecha = document.getElementById('rf-otra-fecha');
            if (otraFecha) {
                otraFecha.min = fechaIsoRF();
                otraFecha.addEventListener('change', () => {
                    if (otraFecha.value) {
                        document.getElementById('rf-ubicacion-fecha').value = 'otro';
                    }
                });
            }
            prepararRutasCategorias();
            instalarBloqueoCategorias();
        });

        cargarInventario();
        abrirProductoDesdeRuta();
    