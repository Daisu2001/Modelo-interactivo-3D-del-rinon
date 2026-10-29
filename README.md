# Atlas renal · Anatomía y fisiología

Herramienta interactiva para estudiar la anatomía renal, el recorrido de la glucosa y la filtración glomerular.

## Ejecutar en tu computador

1. Descomprime el ZIP.
2. Abre Git Bash dentro de la carpeta `Modelo-interactivo-3D-del-rinon`.
3. Ejecuta:

```bash
npm start
```

4. Abre **http://localhost:8080**.

También puedes ejecutar `npm start` dentro de `Proyecto-Riñon`.
Funciona con Node 20.15.0. No necesitas `npm install` ni Vite.
Three.js y sus complementos están incluidos, por lo que el visor no necesita descargar dependencias de internet.

El icono **Guardar** de la barra superior descarga una **captura PNG de la pantalla actual del Atlas renal**: modelo 3D, paneles, fórmulas y anotaciones visibles. Conserva la posición de la cámara, la opacidad, la pausa y los valores de la simulación. El archivo se identifica con la fecha y hora local. La captura utiliza html2canvas 1.4.1, incluido con su licencia MIT en `vendor`; no requiere instalar dependencias ni permisos para compartir pantalla.

Para detenerlo: **Ctrl+C**. Si el puerto está ocupado, detén el otro servidor o usa:

```bash
PORT=8081 npm start
```

Luego abre http://localhost:8081.

## Sección Glucosa

La pestaña superior **Glucosa** abre primero el **riñón texturizado en corte**, con un recorrido normal fijo. El panel muestra **Recorrido**, la explicación, la leyenda y los controles de opacidad, vasos, pausa y reinicio. No muestra estados, etapas de filtración ni contadores de reabsorción para el riñón.

La miniatura **Nefrona**, en la esquina inferior derecha, abre el recorrido detallado. Allí aparecen:

- **01 Filtración**, **02 Reabsorción** y **03 Recorrido completo**, con la etapa actual resaltada.
- Estados **Bajo**, **Normal** y **Glucosuria**.
- Contadores de glucosa filtrada, reabsorbida y que llegó al colector.
- Opacidad de las paredes, mostrar vasos sanguíneos, pausar/continuar y reiniciar.

Normal y Glucosuria tienen la misma velocidad y frecuencia de aparición: una esfera cada 0,8 segundos. En Glucosuria una parte se reabsorbe y otra continúa por el recorrido tubular. Bajo usa menos partículas y menor velocidad.

Todos los estados comienzan desde el vaso central, sin prellenar el circuito. La sangre sigue únicamente por los vasos rojos y la glucosa filtrada pasa al túbulo. Las partículas reabsorbidas desaparecen en la zona proximal ajustada en la simulación anterior.

En Bajo y Normal, tras la primera reabsorción, el paso 02 queda activo. En Glucosuria, el paso 03 se activa cuando una partícula no reabsorbida supera la zona de reabsorción, después del paso 02, y queda activo. No es necesario esperar hasta la salida del colector.

Cambiar de estado o reiniciar limpia el recorrido y los contadores. La pausa se conserva. Al salir de Glucosa, el tiempo de esa simulación se detiene; al regresar, continúa desde donde estaba.

El aviso azul aparece únicamente durante la pausa en Glucosa. No hay slider de velocidad, control de ejes ni enlaces de fuentes al final del panel.

### Recorrido del riñón y cambio de escala

La entrada se representa sobre las ramas de `Arteria_Corte.glb`. La sangre de retorno sigue por separado las ramas de `Vena_Corte.glb`, orientadas hacia la salida renal. Se eliminaron tanto los puentes interpolados entre arteria y vena como la curva externa desde la salida venosa hasta el cáliz.

Las partículas naranjas se distribuyen por diez rutas de entrada, todas compuestas por tramos de los vasos del modelo. Sus trayectos terminan cerca de las regiones de cálices mayores: allí se reducen y desaparecen. No recorren el retorno venoso ni se trasladan fuera de los vasos. La sangre roja sí continúa por las ramas de retorno. La orina conserva su recorrido turquesa independiente por los cálices, la pelvis y el uréter.

La ocultación de las partículas naranjas señala el cambio didáctico a la vista de la nefrona; no significa que la sangre venosa carezca de glucosa. Cuando desaparece la primera partícula aparece **Ahora ve a la nefrona**, junto a la miniatura. El mensaje permanece durante la pausa y se oculta al reiniciar o cambiar de vista. No se cambia de modelo automáticamente.

La miniatura alterna entre **Nefrona** y **Riñón en corte**. Cambiar de escala reinicia el recorrido que se abre y conserva por separado su pausa, opacidad y visibilidad de vasos. Las anotaciones de ambas vistas también usan capas independientes. Solo avanza la vista activa. Anatomía conserva sus materiales, texturas, herramientas y luces.

`kidney-routes.json` versión 2 separa los árboles de entrada y retorno, refina su profundidad mediante intersecciones con las paredes 3D y conserva las versiones exactas de los GLB mediante hashes. Los tramos sanguíneos comunes se dibujan una sola vez. Las pruebas verifican que cada segmento de glucosa pertenece al árbol de entrada, que los puntos de desaparición están próximos al cáliz real, que no hay partículas naranjas en el retorno y que el aviso y los controles mantienen su comportamiento. También pasan las pruebas de 30/60 FPS, Glucosa, Filtración y Nefrona. La revisión se realizó con los GLB reales y las capturas del usuario; no se pudo renderizar la aplicación en el navegador de este entorno.

Referencias fisiológicas consultadas:

- [NIDDK · Los riñones y su funcionamiento](https://www.niddk.nih.gov/health-information/informacion-de-la-salud/enfermedades-rinones/rinones-funcionamiento).
- [NIDDK · Reabsorción renal de glucosa](https://www.niddk.nih.gov/news/archive/2016/story-discovery-sglt2-inhibitors-harnessing-kidneys-help-treat-diabetes).

## Otras secciones

**Anatomía** permite escoger entre **Riñón**, **Glomérulo** y **Nefrona** mediante las miniaturas de los otros dos modelos en la esquina inferior derecha del visor. Cada modelo tiene su propia lista de estructuras, descripciones, funciones y vista previa 3D aislada. **Filtración** muestra el GLB de glomérulo adjunto y conserva las dos subpestañas:

- **Glucosa (SGLT2/TmG)**: sliders de glucemia plasmática, TFG y TmG; presets Normal, Umbral renal, Glucosuria y TmG Máx; cuatro resultados de carga filtrada, reabsorción tubular, excreción urinaria y fracción excretada.
- **Filtración (Starling)**: sliders de las cuatro presiones y resultados de presión neta y TFG.

Al entrar por primera vez en Filtración se muestran las fórmulas de glucosa. Después se conserva la última subpestaña seleccionada. Estos parámetros controlan en vivo la nueva simulación del glomérulo en Filtración. La simulación de tres estados en la pestaña Glucosa conserva su comportamiento independiente.

Las herramientas de aislamiento y ocultación corresponden a Anatomía. En el riñón requieren activar el corte; en el glomérulo y la nefrona se pueden usar directamente. El botón de corte se oculta al explorar el glomérulo o la nefrona. En Glucosa se utilizan los controles de opacidad y vasos del panel derecho. Anotar sigue disponible; los trazos de cada modelo anatómico se conservan por separado durante la sesión.

### Nefrona en Anatomía · versión 3.3.0

Se incorpora el modelo `Nefron_vertex.glb` del ZIP adjunto como `Models/Nefrona_anatomia.glb`, junto con su guía original `Models/Nefrona_colores.txt`. Esta instancia es independiente del modelo de la simulación de Glucosa.

Las caras se separan por los colores de la guía, conservando los 31.116 triángulos originales. Se puede seleccionar desde la lista o directamente sobre el modelo: arteriola aferente, glomérulo, cápsula de Bowman, arteriola eferente, red capilar, túbulo proximal, asa de Henle, túbulo contorneado distal y conductos colectores. La vista previa de cada ficha contiene únicamente las caras de esa región y se puede girar.

La guía y el modelo tienen estas limitaciones, indicadas también en las fichas:

- **Colector cortical y conducto de Bellini:** comparten el color `#3EBDBD`; aparecen juntos como **Conductos colectores**. Hace falta una delimitación adicional del autor para seleccionarlos por separado con fidelidad.
- **Red capilar:** la guía la identifica tentativamente como capilares. Se conserva esa incertidumbre en su descripción.
- **Dos regiones adicionales:** el archivo contiene superficies verdes y blancas sin nombre en el TXT. Se pueden seleccionar, aislar, ocultar y previsualizar como regiones sin identificar, sin atribuirles una función anatómica.

Verificado en Chromium: selección directa sobre el modelo y desde la lista, las once vistas aisladas, ocultación y aislamiento, anotaciones separadas, cambio entre los tres modelos, regreso desde Glucosa y Filtración, y selector a 1440 y 900 píxeles. También pasa `npm test`.

`nephron-structures.js` contiene los nombres, fichas y equivalencias entre los colores lineales del GLB y la guía sRGB. Los textos son síntesis educativas apoyadas en [NIDDK](https://www.niddk.nih.gov/health-information/kidney-disease/kidneys-how-they-work), [OpenStax: reabsorción tubular](https://openstax.org/books/anatomy-and-physiology-2e/pages/25-6-tubular-reabsorption) y [NCBI: conductos colectores](https://www.ncbi.nlm.nih.gov/books/NBK549766/).

El botón de menú de la esquina superior derecha permite volver a mostrar el panel después de cerrarlo.

## Archivos para integrar en tu repositorio

Actualiza el contenido de `Proyecto-Riñon`, incluyendo:

- `index.html`, `main.js` y `styles.css`.
- `anatomy-browser.js`: miniatura intercambiable, fichas y vistas previas 3D de las piezas.
- `glomerulus-structures.js`: nombres, colores, textos y segmentación compartida por Anatomía y Filtración.
- `nephron-structures.js`, `Models/Nefrona_anatomia.glb` y `Models/Nefrona_colores.txt`: nueva anatomía de nefrona y guía original.
- `glucose.js`: integración con el visor y los controles.
- `simulation.js`: motor de la simulación de tres estados.
- `routes.json` y `mesh-groups.json`: recorridos medidos y regiones de la nefrona.
- `filtration.js`, `glomerulus-simulation.js` y `renal-physiology.js`: nuevo glomérulo, animación y cálculo compartido por ambos paneles.
- `glomerulus-routes.json`: rutas extraídas del nuevo GLB.
- `Models/Glomerulo.glb` y `Models/Glomerulo_colores.txt`: modelo y guía de colores adjuntos.
- `tools/verify-glomerulus.mjs`: pruebas del cálculo y la animación del glomérulo.
- `tools/verify-nephron.mjs`: comprueba las 11 regiones contra el GLB real, sin perder ni duplicar caras.
- `vendor/`: Three.js y complementos locales.
- `server.mjs`, `package.json` y `tools/verify.mjs`.

Los GLB originales permanecen en `Models/`. Para un hosting estático, publica todo el contenido de `Proyecto-Riñon` y usa su `index.html`. El servidor Node solo sirve archivos para la prueba local.

La carpeta `.git` del ZIP original se omite: conserva la de tu propio repositorio al actualizarlo. El archivo `formulas.js` de la raíz se conserva como archivo original; el visor no lo importa.

## Verificación

```bash
npm test
```

Comprueba las rutas, el inicio progresivo, la cadencia compartida por Normal y Glucosuria, la reabsorción, la llegada al colector y el avance de etapas sin retrocesos.

Los contadores son eventos de partículas, no medidas clínicas. El tamaño, los tiempos y la desaparición de las esferas son representaciones educativas.

## Nuevo glomérulo en Filtración

La sangre entra por la arteriola aferente, recorre tres ramas de capilares y sale por la eferente. La glucosa que se filtra atraviesa de forma esquemática hacia el espacio de Bowman y entra al túbulo proximal. La sangre y sus células permanecen en el recorrido vascular.

La geometría y la guía de colores del ZIP adjunto se conservan. Las paredes son transparentes para poder observar el interior; el control de opacidad solo cambia la visualización.

### Los sliders controlan la animación

**Vincular TFG a Starling** está activo inicialmente:

- PFN = (PGC − PBS) − (πGC − πBS).
- TFG = max(0, 12,5 × PFN).
- Carga filtrada = TFG × glucemia / 100.
- Reabsorción = min(carga filtrada, TmG).
- Excreción = max(0, carga filtrada − reabsorción).
- Fracción excretada = excreción / carga filtrada; se muestra como porcentaje.

Cambiar cualquiera de las cuatro presiones actualiza la TFG del slider, los cuatro resultados de glucosa, los estados informativos y la animación. Más TFG aumenta el paso de glucosa hacia Bowman y la velocidad del filtrado. Más glucemia aumenta la cantidad de glucosa en el flujo. La proporción que se reabsorbe depende de R / carga filtrada, y la que continúa depende de E / carga filtrada.

Al mover directamente el slider TFG, se desactiva la vinculación y aparece **TFG manual**. En ese modo las presiones siguen calculando la TFG de Starling en su tarjeta, mientras la simulación usa el valor manual. Reactiva la casilla para volver a vincular ambos paneles.

Los presets de glucosa modifican glucemia y TmG sin sobrescribir las presiones ni la TFG activa. **Umbral renal** se calcula como TmG × 100 / TFG, y el botón queda desactivado si ese valor está fuera del rango del slider o TFG es cero. El modelo usa el límite idealizado TmG de las fórmulas, no una predicción clínica de umbral individual.

Se corrigió el antiguo cálculo intermedio de splay, que podía producir R mayor que la carga filtrada. Ahora el resultado coincide con la ecuación de la tarjeta y mantiene carga filtrada = reabsorción + excreción.

### Inicio, cambios de parámetros y controles

- El recorrido comienza vacío y avanza desde la aferente.
- Con PFN ≤ 0 y vinculación activa, TFG y carga filtrada son cero: ninguna nueva partícula pasa al filtrado. La sangre continúa por los vasos. El filtrado ya presente queda detenido; reiniciar limpia todo el recorrido.
- Los cambios de parámetros no reinician los contadores. Las partículas que aún no han tomado una decisión responden a los nuevos valores al llegar a la filtración o a la reabsorción. Las decisiones ya completadas se conservan.
- Pausar detiene toda la animación del glomérulo. Reiniciar limpia los contadores y el recorrido, conservando los parámetros y la pausa.
- Al salir de Filtración su simulación deja de avanzar. Los valores y la pausa se conservan al regresar.

### Alcance de esta primera integración

El GLB contiene glomérulo, un tramo proximal y el túbulo distal como referencia anatómica. La glucosa no reabsorbida sale del extremo proximal y se contabiliza como **Continúan**, hacia el resto de la nefrona. No se la envía directamente al tubo distal, porque el asa y el recorrido intermedio no están en este archivo.

Las rutas vasculares se obtuvieron de los anillos de la geometría. Hay uniones cortas entre extremos de mallas discontinuas para representar la conexión con la eferente. Las rutas y la geometría comparten los mismos ejes y traslaciones del GLB.

La simulación utiliza una escala visual fija: emisión × probabilidad de filtración = carga filtrada / 100 partículas por segundo. Los contadores son eventos ilustrativos; no son miligramos ni mediciones de un paciente. Los valores de TFG y TmG pertenecen al modelo agregado de las fórmulas del proyecto, no a una escala hidráulica real de este único glomérulo.

### Validación

Las pruebas comprueban la conservación de glucosa, el cambio de tasas con TFG, la proporción que continúa en glucosuria, el cese con PFN negativa, la circulación vascular y el reinicio. También se verificó en el navegador la carga del GLB, los siete sliders, los presets, las dos subpestañas, la vinculación/manual, la pausa, la opacidad, las anotaciones y el paso 03 de la simulación anterior.

Referencia sobre filtración y retorno tubular: [NIDDK · Your Kidneys & How They Work](https://www.niddk.nih.gov/health-information/kidney-disease/kidneys-how-they-work). Los enlaces no se muestran en el panel de la aplicación.


## Glomérulo en Anatomía

- Al entrar, se muestra el riñón y una miniatura del glomérulo en la esquina inferior derecha.
- Haz clic en esa miniatura para abrir el glomérulo en el visor principal. El recuadro pasa a mostrar el riñón y permite regresar a él.
- En el glomérulo están disponibles **Seleccionar**, **Aislar**, **Mostrar / ocultar**, **Anotar**. El botón de corte no aparece. Al regresar al riñón se recupera su última vista completa o de corte.
- Selecciona una pieza en el modelo o en la lista de la derecha. Su ficha muestra el nombre, una vista previa 3D aislada, una descripción breve y su función. La vista previa se puede girar arrastrándola.
- Las seis piezas son **arteriola aferente**, **arteriola eferente**, **capilares glomerulares**, **cápsula de Bowman**, **túbulo proximal** y **túbulo distal**. Los nombres y colores se basan en la guía del artista y en las regiones de COLOR_0 del GLB.
- La vista previa contiene exclusivamente las caras de la región seleccionada, con opacidad completa. No hereda las transparencias del visor principal.
- Aislar mantiene opaca la pieza seleccionada y atenúa el contexto. Repite la selección de esa misma pieza para restaurar. Desde la lista puedes elegir otra pieza directamente. Mostrar / ocultar atenúa la pieza; vuelve a elegirla para mostrarla.
- Si una estructura está repartida entre varias mallas, aislar y mostrar / ocultar afectan a toda esa estructura.
- Las anotaciones de riñón y glomérulo se conservan por separado al alternar entre ambos.
- Anatomía usa una instancia propia del GLB, sin partículas. Sus cambios de materiales no alteran la simulación de Filtración. Volver a Anatomía conserva el modelo elegido.

Las regiones de médula renal y cálices mayores que no estén separadas con esos nombres en los GLB del riñón conservan su texto informativo y muestran un aviso en la vista previa. Las seis regiones del glomérulo sí están identificadas y extraídas.

### Validación de esta actualización

Se ejecutaron las pruebas previas de glucosa y filtración. Además, se cargaron los GLB reales en una comprobación programática de la aplicación para verificar las seis fichas y sus geometrías, la selección por raycasting, el intercambio de modelos, el aislamiento, la ocultación, las anotaciones, el corte exclusivo del riñón y la independencia de la simulación. Esta comprobación sustituye únicamente el contexto GPU; no verifica el aspecto final renderizado. El navegador de este entorno no pudo abrir el servidor local.

Fuentes de las descripciones anatómicas: [NIDDK · Los riñones y su funcionamiento](https://www.niddk.nih.gov/health-information/informacion-de-la-salud/enfermedades-rinones/rinones-funcionamiento), [NCBI Bookshelf · Bowman Capsule](https://www.ncbi.nlm.nih.gov/books/NBK554474/) y [NCBI Bookshelf · Renal Blood Flow and Filtration](https://www.ncbi.nlm.nih.gov/books/NBK482248/). Estos enlaces están en la documentación, no en el panel de la aplicación.


## Biblioteca: documentos, diagramas y videos

En Home, abre **Biblioteca**. Los tres módulos mantienen el estilo del Atlas:

1. **Libros y documentos:** los seis enlaces originales de Google Drive, todos con apertura en el visor interno, descarga y **Anotar**. Vander ya tiene habilitado el botón de apertura.
2. **Ilustraciones y diagramas:** tres esquemas SVG locales de anatomía renal, circulación/filtrado y balance de glucosa. Se pueden abrir, descargar y anotar.
3. **Videos:** 78 clases de Medizi (Dr. Eduardo Paiva), agrupadas en diez temas: celular, muscular, neurofisiología, cardíaca, circulatoria, sanguínea, respiratoria, renal, gastrointestinal y endocrina. El tema inicial es renal, con sus 12 clases divididas en bases anatómicas, filtración, transporte tubular y concentración/depuración/agua. Hay búsqueda por título sin distinguir acentos.

### Orden y fuentes del catálogo

Los identificadores, títulos, duraciones y posiciones se obtuvieron directamente de las listas públicas de [Medizi](https://www.youtube.com/@doctor.paiva./playlists), consultadas el 14 de octubre de 2026 (UTC). Se conserva el orden de las listas originales salvo dos ajustes de estudio: Neurofisiología va de clase 10 a 15; Celular agrupa versiones de un mismo tema, coloca ósmosis antes de los potenciales y presenta la clase 4 antes de la 5. Se mantienen las versiones antiguas, identificadas expresamente en los títulos. El catálogo es una selección de las diez listas temáticas de fisiología; no pretende transcribir ni cubrir todos los videos del canal.

`Proyecto-Riñon/library-videos.json` conserva los títulos originales, enlaces, listas y posiciones originales. Las listas renal, muscular, respiratoria, sanguínea, circulatoria, gastrointestinal, cardíaca y endocrina mantienen su orden de origen. No se descargan ni redistribuyen los videos; la reproducción usa YouTube y la atribución al creador permanece visible.

### Anotaciones

El visor tiene color, grosor, borrador, deshacer, limpiar y terminar anotación, como la pizarra del modelo 3D. Usa ratón, lápiz o pantalla táctil. Los trazos se guardan en el almacenamiento local del navegador y se recuperan al abrir el mismo recurso y la misma página o momento. Si el navegador bloquea ese almacenamiento, se mantienen durante la sesión y aparece un aviso. Las anotaciones de Biblioteca son independientes de las de Anatomía, Glucosa y Filtración.

- **PDF:** el lector abre cada documento en **Página completa**. Usa Anterior/Siguiente o el campo **Página** para navegar. Puedes elegir Ajustar al ancho o los botones de zoom. Anotar permite dibujar sobre la página seleccionada; los trazos se adaptan al zoom y al tamaño de ventana. Termina la anotación para cambiar de página.
- **Video:** Anotar pausa el reproductor mediante la API oficial de YouTube. Los trazos se asocian al tiempo preciso del video y aparecen como marcadores en **Mis anotaciones**. Al seleccionar un marcador se busca ese momento, se pausa y se recupera la pizarra. Terminar anotación deja el video en pausa; usa los controles del reproductor para continuar. Cerrar el visor detiene y elimina el reproductor.
- **Diagrama:** abre el esquema y activa Anotar. Sus trazos se guardan separados de los otros recursos.

La pizarra es una capa de la aplicación: no modifica el archivo PDF de Drive ni incorpora los dibujos al PDF descargado. Las capas usan coordenadas normalizadas para adaptarse al tamaño de la ventana. En el lector nuevo, las anotaciones se vinculan a la página y se adaptan al zoom. El visor de respaldo de Drive requiere conservar la misma posición y zoom para recuperar sus trazos. Las anotaciones no se sincronizan entre navegadores ni dispositivos.

### Conexión y disponibilidad

Los modelos 3D y los diagramas son locales. Los documentos necesitan acceso a Google Drive y los videos necesitan conexión a YouTube. Los permisos de Drive se mantienen: abrir dentro de la app no vuelve público un documento privado. El enlace **Abrir original** permite resolver un problema de acceso. Si un video deja de estar disponible o el autor impide su reproducción embebida, el visor lo informa y ofrece el enlace original. No se necesita una API key ni instalar dependencias para estas funciones.

### Archivos añadidos y cambios

- `library.js`: módulos, búsqueda, visor interno y control del reproductor.
- `library-annotations.js`: pizarra persistente de Biblioteca.
- `library-videos.json`: catálogo verificable y editable.
- `illustrations/`: tres diagramas y una miniatura de respaldo para conexión fallida.
- `index.html`, `styles.css`, `main.js` y `server.mjs`: integración, estilos, tipos de archivo y eliminación de Rayos X.

El botón de Rayos X y su lógica se retiraron de Anatomía, Glucosa y Filtración. Los sliders de opacidad de las simulaciones siguen funcionando.

Los diagramas son esquemáticos y se dibujaron para este Atlas. El balance de glucosa reproduce las fórmulas idealizadas del proyecto. Referencia del recorrido vascular y tubular: [NIDDK · Your Kidneys & How They Work](https://www.niddk.nih.gov/health-information/kidney-disease/kidneys-how-they-work). Control de reproducción: [API oficial de YouTube](https://developers.google.com/youtube/iframe_api_reference).


### Verificación de Biblioteca

Se comprobó en Chromium la apertura interna de los seis documentos, los controles de dibujo, la separación de páginas y recursos, el guardado tras recargar, los diez temas, la búsqueda, el orden de las clases y las vistas de escritorio/móvil. La pausa y recuperación por tiempo se comprobaron con una instancia de prueba de la API; también se probó la conexión al reproductor real de YouTube. Los seis enlaces originales de Drive respondieron con metadatos de PDF. Las simulaciones previas pasaron `npm test`, y Anatomía, Glucosa y Filtración se volvieron a abrir en el navegador sin errores.

Mientras Biblioteca está abierta, el visor 3D oculto deja de renderizar y avanzar para evitar consumir recursos de forma innecesaria. Al regresar se conserva el punto del recorrido.


## Corrección del visor PDF

La ventana está centrada y bloquea el desplazamiento del fondo. El lector local de PDF.js abre cada página ajustando sus dimensiones reales a la altura y anchura disponibles. El modo inicial es **Página completa**, con opciones de **Ajustar al ancho**, acercar/alejar y navegación por número de página. La pizarra se coloca sobre la propia página, para conservar la posición de los trazos al cambiar el zoom o el tamaño de la ventana.

PDF.js y sus recursos están incluidos en `Proyecto-Riñon/vendor/pdfjs/`, con su licencia Apache 2.0. Se añaden `library-pdf.js` (lector) y `library-pdf-proxy.mjs` (entrega por bloques desde Drive). Ejecutar `npm start` inicia también esa ruta local; no hace falta instalar paquetes, Python, claves ni otros programas. El servidor solo permite los seis documentos del catálogo. La carga combina transmisión progresiva y solicitudes por rangos para que los libros grandes puedan abrirse con fluidez; no se incluyen copias de los libros dentro del ZIP.

Para publicar el lector en un hosting estático, la apertura directa depende de que Drive permita las solicitudes desde el dominio. Si Drive las bloquea, se conserva el visor de respaldo. Para ofrecer el lector nuevo con el mismo comportamiento de la prueba local, publica también el servidor Node o una ruta equivalente `/api/library-pdf/:id`.

Se comprobó con el PDF renal real (109 páginas) que la primera página cabe completa sin recortes, la ventana queda centrada, funciona la navegación y la pizarra se adapta al zoom y a la vista móvil.


Se corrigió también la carga inicial de libros grandes: se usa el flujo progresivo de PDF.js y se incluyen los perfiles de color ICC. En la comprobación individual, Vander abrió sus 830 páginas correctamente y la primera se ajustó al visor. El estado de carga desaparece una vez que la primera página está visible; el flujo restante no vuelve a ocupar espacio en la cabecera.

La verificación final cargó los seis PDF originales con el ajuste Página completa: Fisiología renal (109 páginas), Berne y Levy (11), Ganong (729), Guyton y Hall (1046), Vander (830) y Silverthorn (960). También pasaron la navegación, el zoom, las anotaciones y el ajuste en móvil.


## Riñón completo y de corte con texturas

Las diez piezas de Anatomía se sustituyen por los GLB de `Rinon_textu.zip`: arteria, vena, cálices, pirámides y riñón, en sus variantes completa y de corte. Se conservan los nombres de archivo que usa el proyecto y la alineación entre variantes. Los mapas de color, normales y metalicidad/rugosidad se incluyen en cada GLB y se muestran también en las vistas previas. Las luces conservan su configuración.

La selección utiliza los colores de segmentación como identificadores, sin multiplicarlos sobre las texturas. Se reconocen los nuevos identificadores de las piezas completas y las regiones de corte, y aislar u ocultar actúa sobre todas las superficies con el mismo nombre anatómico. La superficie exterior conjunta de cálices, pelvis y uréter se presenta como **Sistema colector**, con su ficha; sus regiones internas siguen seleccionándose por separado en la vista de corte. La médula conserva la ficha y el aviso previo, porque no se entrega como una región independiente.

## Recorrido de glucosa en el riñón: geometría 3D

El recorrido renal se reconstruye desde los GLB texturizados. El tronco hueco tiene una superficie interna y otra externa: se separan por sus bordes, se cierran las aberturas de los tubos y se calcula un árbol de caminos dentro de la unión tridimensional de sus luces. Las bifurcaciones comparten los mismos puntos para sangre y glucosa. No se utiliza un esqueleto de una proyección plana ni se estima después su profundidad.

Las partículas adaptan su radio al espacio disponible. La glucosa recorre únicamente las ramas arteriales de entrada, desaparece cerca de la región de los cálices y activa **Ahora ve a la nefrona**. La sangre roja conserva un recorrido venoso independiente. La opacidad, pausa, reinicio y selección de la nefrona mantienen sus controles anteriores.

Las pruebas normales se ejecutan con `npm test`. Para revisar o reconstruir las rutas durante el desarrollo se incluyen herramientas opcionales en `Proyecto-Riñon/tools/`:

- `verify-kidney-geometry.py`: contrasta muestras densas de los segmentos y de la envolvente de las partículas con las superficies originales del vaso. El resultado queda en `kidney-geometry-validation.json`.
- `build-kidney-routes.py`: reconstruye `kidney-routes.json` desde las mallas; después se debe ejecutar la verificación geométrica.

Estas herramientas de desarrollo necesitan Python 3, NumPy, SciPy y VTK. El Atlas continúa funcionando con `npm start`, sin esas dependencias.

La comprobación geométrica incluyó 48.781 muestras de trayectoria y 1.268.306 muestras de envolvente de partículas; ninguna quedó fuera. También se comprobaron 193.270 vértices de las estelas generadas por Three.js, sin salidas del vaso. Las tapas coloreadas de los GLB vasculares se identifican como parte de su arteria o vena, para conservar la ficha correcta al seleccionarlas.

## Normal y Glucosuria en el recorrido del riñón

El panel de Glucosa del riñón tiene dos estados:

- **Normal:** conserva la entrada arterial y el aviso para abrir la nefrona. No emite partículas naranjas en la vía urinaria.
- **Glucosuria:** después del paso por las nefronas, una parte de las partículas naranjas recorre los cálices, la pelvis renal y el uréter hasta su abertura de salida. Conserva la entrada arterial del estado Normal. El reparto de partículas sigue la representación visual del escenario de glucosuria de la nefrona.

Cambiar de estado inicia un recorrido limpio. Pausa, reinicio, opacidad y el selector de modelo conservan su funcionamiento. Ocultar los vasos sanguíneos permite seguir observando la salida urinaria de glucosa. La nefrona mantiene sus tres estados y su selección independiente.

`kidney-urinary-routes.json` añade siete caminos medidos dentro de la luz del modelo `Caliz_Corte.glb`, con un árbol común de salida hacia el uréter. El archivo de rutas arteriales y venosas aceptado anteriormente se conserva sin cambios. Las partículas desaparecen al entrar en la escala de la nefrona y, en Glucosuria, se representan después en la vía urinaria; no se dibuja una conexión directa entre los vasos y los cálices.

Las herramientas opcionales `tools/build-kidney-urinary-routes.py` y `tools/verify-kidney-urinary-geometry.py` permiten reconstruir y comprobar estas rutas. Se contrastaron 27.270 muestras de trayectoria y 709.020 muestras de la envolvente de las partículas con la geometría original, sin puntos fuera de la luz. `npm test` comprueba los dos estados, la conservación del recorrido Normal, el movimiento hacia la salida, la eliminación de partículas al salir, los cambios/reinicios y la equivalencia entre 30 y 60 FPS. También se verificó la integración con los GLB y los controles reales mediante una comprobación programática de la aplicación.

Referencias: [NIDDK · Glucosa y reabsorción renal](https://www.niddk.nih.gov/news/archive/2016/story-discovery-sglt2-inhibitors-harnessing-kidneys-help-treat-diabetes) y [NIDDK · Riñones y salida de orina por los uréteres](https://www.niddk.nih.gov/health-information/kidney-disease/kidneys-how-they-work).

## Sangre arterial con avance continuo

La sangre avanza desde la entrada de la arteria renal hacia sus ramificaciones. Cada rama espera a que el frente de sangre llegue a su bifurcación. Los tiempos de inicio convierten ahora las distancias del modelo a las mismas unidades que utiliza la velocidad de la animación.

Cada glóbulo rojo conserva su identidad y su posición de instancia desde que entra hasta que sale de su tramo. Se elimina el reinicio periódico de toda la fila de partículas hacia el inicio. La separación entre células y los pulsos de color del recorrido renal facilitan distinguir el sentido del avance cuando baja la frecuencia de imagen. El retorno venoso conserva su propio recorrido de salida.

Se mantienen la geometría medida, los estados Normal/Glucosuria, la salida de glucosa por el uréter, la pausa, el reinicio y la opacidad. La animación anterior de glomérulo y nefrona conserva sus parámetros.

`npm test` incluye `tools/verify-kidney-blood-direction.mjs`: verifica que no haya aristas arteriales invertidas ni ciclos de retorno, que las ramas empiecen al llegar el frente de sangre y que las mismas partículas avancen sin saltos hacia atrás. Se comprobaron 127.564 avances de glóbulos rojos a 12, 20, 30 y 60 FPS, además del reinicio y la conservación de Glucosuria. Las pruebas de integración con los GLB y los controles también pasaron.

## Sustitución por Glomerulo_fixed.glb

El archivo entregado `Glomerulo_fixed.glb` sustituye al glomérulo de Anatomía y Filtración. Se guarda con el nombre de carga existente `Proyecto-Riñon/Models/Glomerulo.glb`, conservando exactamente sus bytes. Sus mapas de color, normales y metalicidad/rugosidad se mantienen en la escena y en las vistas previas.

El modelo nuevo reúne las piezas en una malla de 10.800 triángulos. `COLOR_0` es blanco y se utiliza para el aspecto texturizado; las etiquetas anatómicas están en `COLOR_1`. La selección conserva las seis estructuras con nombre, descripción, función y vista previa. La pequeña tapa de la unión vascular se agrupa con la arteriola eferente. La rotación y el desplazamiento de exportación se normalizan al marco del Atlas sin alterar los vértices ni las UV.

La sangre y la glucosa entran por el conducto único, identificado como arteriola aferente, atraviesan los capilares y salen por el vaso ramificado, identificado como arteriola eferente. Las cuatro salidas siguen las trayectorias medidas dentro de la luz 3D; las rutas capilares se orientan de forma continua entre entrada y salida. Se conservan el trayecto proximal, las fórmulas y los controles de Filtración. Las partículas ajustan su tamaño al diámetro disponible. Se comprobaron 12.959 muestras de las nuevas trayectorias y 336.934 muestras de su envolvente, sin puntos fuera de los conductos reconstruidos.

`glomerulus-asset.json` identifica la versión del modelo, su huella digital, la capa de selección y su alineación. Las herramientas opcionales `tools/build-glomerulus-outlets.py` y `tools/verify-glomerulus-outlets.py` reconstruyen y verifican las salidas; necesitan las mismas dependencias de desarrollo que las herramientas geométricas del riñón. `npm test` incluye `tools/verify-glomerulus-asset.mjs`, que comprueba el archivo, la conservación de todas las caras y UV, los mapas PBR, las seis vistas previas, la selección por raycasting y la entrada única y las cuatro salidas de simulación.

También se cargaron ambas instancias con GLTFLoader y se decodificaron sus PNG para comprobar la integración real de materiales, la orientación/escala, las fórmulas, Glucosuria, pausa, reinicio y opacidad independiente. Esta comprobación es programática, sin renderizado GPU. Las luces y los modelos del riñón y de la nefrona se conservan.

## Retorno de glucosa a las ramificaciones

Las partículas reabsorbidas dejan el proximal y se desplazan de forma visible hasta las cuatro ramificaciones eferentes; al incorporarse siguen la sangre hacia fuera del modelo. No se desvanecen antes de volver al vaso. La conexión entre el proximal y las ramas representa de forma esquemática el lecho peritubular, ausente en esta malla; el tramo dentro de las ramas conserva el recorrido geométrico medido. La interfaz indica esta simplificación. La glucosa que supera la capacidad de reabsorción sigue por el túbulo en Glucosuria.

Las etiquetas, fichas y vistas previas identifican ahora el conducto único como aferente y el vaso ramificado como eferente. La sangre conserva el avance de cada emisión sin reiniciar periódicamente su fila. `tools/verify-glomerulus-return.mjs` comprueba continuidad del retorno, entrada en el sentido sanguíneo, las cuatro ramas, ausencia de desapariciones anticipadas, conservación de partículas, Glucosuria y reinicio a 20/30/60 FPS.

Referencia: [OpenStax · Circulación renal](https://openstax.org/books/biology/pages/41-2-the-kidneys-and-osmoregulatory-organs) y [OpenStax · Reabsorción tubular](https://openstax.org/books/anatomy-and-physiology-2e/pages/25-6-tubular-reabsorption).

## Nefrona 85% en Fisiología y Glucosa

`Models/Nefrona_85.glb` conserva exactamente el archivo `Nefrona_fixed_2.glb` entregado, con sus tres mapas de textura. Fisiología añade **Nefrona 85%** a las opciones existentes; la nefrona anterior sigue disponible. Sus once regiones se conservan en la malla. La lista de Anatomía ofrece únicamente las estructuras identificadas con descripción, función y vista previa texturizada. El archivo nuevo solo identifica unas pocas caras mediante color; `nephron85-regions.json` conserva la correspondencia de superficies con el modelo anterior y aplica restricciones de conectividad a los vasos y al asa modificados.

Glucosa utiliza ahora esta nefrona. Bajo, Normal y Glucosuria comparten una única entrada para sangre y glucosa por la aferente. La sangre continúa por el vaso de salida y sus cuatro ramas. La glucosa filtrada llega al proximal: la fracción reabsorbida se desplaza de forma visible hasta esas ramas y sigue hacia sus extremos, sin desvanecerse antes del retorno. En Glucosuria, el exceso continúa por el asa corta real del archivo nuevo, el distal y el colector. La etiqueta «85%» identifica esta opción de modelo; no modifica los porcentajes de reabsorción de los escenarios.

El tramo entre el proximal y las ramas representa de forma esquemática la captación por los capilares peritubulares; la interfaz lo indica. Los trayectos dentro de los vasos proceden de su luz 3D. El asa corta se reconstruye dentro de su envolvente tubular reservando margen para la pared; proximal y distal se alinean con el archivo nuevo. La rotación y traslación de exportación se normalizan para alinear las rutas y las texturas en ambos módulos.

Se comprobaron 7.624 centros vasculares y 198.224 puntos de su envolvente, además de 5.842 centros tubulares y 151.892 puntos de su envolvente, sin salidas de los conductos comprobados. El interior glomerular y los enlaces de reabsorción son representaciones esquemáticas y se excluyen de esa certificación geométrica. Las herramientas opcionales `tools/build-nephron85.py` y `tools/verify-nephron85-geometry.py` requieren NumPy, SciPy y VTK; la aplicación no necesita esas dependencias.

`npm test` incluye `tools/verify-nephron85.mjs`: confirma el archivo, las 22.272 caras y UV, los mapas PBR, las once vistas aisladas, los tres estados, el retorno continuo a las cuatro ramas, la conservación de partículas, el reinicio y la equivalencia entre 30 y 60 FPS. También se verificó la integración con GLTFLoader y la decodificación de los PNG, las instancias de Fisiología y Glucosa, la alineación, los cambios de estado/vista, la pausa, el reinicio, la opacidad y la visibilidad vascular independientes. Esta validación es programática, sin renderizado GPU.

## Glucosa: visibilidad y distribución de controles

En Glucosa se oculta la barra de selección del visor. Los estados, pausa/reinicio, opacidad y visibilidad de los vasos se presentan en un panel izquierdo; el recorrido, los tres contadores y la leyenda quedan a la derecha. El botón compacto **Anotar** aparece en la esquina superior izquierda del visor y abre allí las herramientas de dibujo. Cambiar de módulo cierra el modo de dibujo y conserva los trazos. La distribución se adapta a pantallas estrechas sin eliminar controles.

La nefrona emite partículas cada 1,6 s en Bajo y cada 0,55 s en Normal/Glucosuria, aproximadamente un 38% y un 45% más, respectivamente. Se mantienen velocidades, trayectorias y fracciones de reabsorción. Las partículas que regresan a la sangre se destacan con un borde naranja y centro ámbar, visibles a través de la pared del vaso. Su radio sigue ajustándose al conducto, con un máximo del 78% del margen medido y una reducción suave al salir por la abertura. La nueva envolvente se comprueba con la herramienta geométrica de la nefrona.

**Fisiología** pasa a llamarse **Anatomía** en el inicio y en la navegación. Las fichas anatómicas se filtran por identificación, descripción, función y geometría de vista previa. Se omiten la médula cuando no tiene una región separada y las zonas sin identificar o con identificación tentativa. Las superficies siguen en el modelo. Al cambiar entre riñón completo y corte, la lista se actualiza y mantiene una selección válida. Los clics en regiones sin ficha no abren un panel vacío.

`npm test` incluye `tools/verify-viewer-ui.mjs`, que prueba el filtrado de fichas, completo/corte, el cambio de módulos, la anotación flotante y la conservación de trazos. La prueba de la nefrona también comprueba las nuevas cadencias, los contornos de retorno, su reinicio y la conservación de velocidades y fracciones. Las comprobaciones de integración se realizan con los GLB, las texturas y los controles reales, sin renderizado GPU.

## Glucosa que se filtra y glucosa que continúa en sangre

La nefrona muestra ambos recorridos en Bajo, Normal y Glucosuria: las partículas que se filtran pasan al proximal, mientras las que no se filtran atraviesan el circuito glomerular y salen por las cuatro ramas vasculares. La asignación de reabsorción se hace de forma independiente entre las partículas filtradas, manteniendo las proporciones de cada escenario. La emisión pasa a una partícula cada 1,2 s en Bajo y cada 0,4 s en Normal/Glucosuria. Los contornos naranjas y los centros ámbar destacan la glucosa en el recorrido de salida. Un nuevo contador indica cuánta glucosa continuó en la sangre.

El reparto visual del 60% filtrado es pedagógico y se indica como esquemático en el visor; no sustituye las tasas calculadas en Filtración ni representa una medición clínica. Se comprueba conservación de partículas, ausencia de paso tubular de las partículas no filtradas, continuidad y las cuatro ramas en los tres estados.

## Glomerulo_fixed_2 e interfaz de Filtración

`Glomerulo_fixed_2.glb` sustituye al glomérulo de Anatomía y Filtración, conservando exactamente los bytes entregados. Mantiene sus seis partes, texturas y vistas previas. La forma del vaso eferente cambia; sus cuatro rutas se reconstruyen y se certifican contra el nuevo modelo. Se conservan los tramos de entrada, capilares y proximal. La certificación comprende 17.719 centros y 460.694 puntos de envolvente de las salidas reconstruidas, sin puntos fuera de la luz.

Los controles de opacidad, pausa y reinicio de Filtración quedan a la izquierda, junto al estado de la simulación. Los siete parámetros y las dos familias de fórmulas quedan a la derecha. El visor reserva un área superior para el glomérulo y un recuadro inferior centrado con un carrusel vertical: cuatro fórmulas de glucosa y dos de Starling. Se navega con rueda, gesto táctil, botones arriba/abajo o teclado. Los resultados se actualizan con los mismos sliders y se conservan al cambiar de tarjeta; la TFG manual y la vinculación a Starling mantienen su funcionamiento. La anotación compacta también está disponible sobre el visor de Filtración.

Los iconos de la aplicación utilizan ahora SVG locales de trazo uniforme y rojo oscuro, incluidos selección, aislamiento, corte, visibilidad, anotación, inicio, guardar, biblioteca y controles de documentos. `icons.js` comparte las figuras con los controles dinámicos, sin una dependencia de red.

Las pruebas `tools/verify-filtration-ui.mjs` y `tools/verify-formula-live.mjs` comprueban navegación del carrusel, teclado, movimiento reducido, persistencia de valores, actualización de los seis resultados, TFG de Starling/manual/cero, iconos y encuadre del modelo con el espacio disponible. Las verificaciones de GLTFLoader comprueban los modelos y PNG reales junto a los controles. La validación de integración es programática, sin renderizado GPU.
