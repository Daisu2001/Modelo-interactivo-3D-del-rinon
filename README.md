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

Para detenerlo: **Ctrl+C**. Si el puerto está ocupado, detén el otro servidor o usa:

```bash
PORT=8081 npm start
```

Luego abre http://localhost:8081.

## Sección Glucosa

La simulación ahora está integrada en el mismo visor 3D del Atlas, en la pestaña superior **Glucosa**. Sustituye las antiguas fórmulas de glucosa del panel derecho por:

- **01 Filtración**, **02 Reabsorción** y **03 Recorrido completo**, con la etapa actual resaltada.
- Estados **Bajo**, **Normal** y **Glucosuria**.
- Contadores de glucosa filtrada, reabsorbida y que llegó al colector.
- Opacidad de las paredes, mostrar vasos sanguíneos, pausar/continuar y reiniciar.

Normal y Glucosuria tienen la misma velocidad y frecuencia de aparición: una esfera cada 0,8 segundos. En Glucosuria una parte se reabsorbe y otra continúa por el recorrido tubular. Bajo usa menos partículas y menor velocidad.

Todos los estados comienzan desde el vaso central, sin prellenar el circuito. La sangre sigue únicamente por los vasos rojos y la glucosa filtrada pasa al túbulo. Las partículas reabsorbidas desaparecen en la zona proximal ajustada en la simulación anterior.

En Bajo y Normal, tras la primera reabsorción, el paso 02 queda activo. En Glucosuria, el paso 03 se activa cuando una partícula no reabsorbida supera la zona de reabsorción, después del paso 02, y queda activo. No es necesario esperar hasta la salida del colector.

Cambiar de estado o reiniciar limpia el recorrido y los contadores. La pausa se conserva. Al salir de Glucosa, el tiempo de esa simulación se detiene; al regresar, continúa desde donde estaba.

El aviso azul aparece únicamente durante la pausa en Glucosa. No hay slider de velocidad, control de ejes ni enlaces de fuentes al final del panel.

## Otras secciones

**Anatomía** permite alternar entre el riñón y el glomérulo mediante la miniatura en la esquina inferior derecha del visor. La miniatura siempre muestra el otro modelo. **Filtración** muestra ahora el GLB de glomérulo adjunto y conserva las dos subpestañas:

- **Glucosa (SGLT2/TmG)**: sliders de glucemia plasmática, TFG y TmG; presets Normal, Umbral renal, Glucosuria y TmG Máx; cuatro resultados de carga filtrada, reabsorción tubular, excreción urinaria y fracción excretada.
- **Filtración (Starling)**: sliders de las cuatro presiones y resultados de presión neta y TFG.

Al entrar por primera vez en Filtración se muestran las fórmulas de glucosa. Después se conserva la última subpestaña seleccionada. Estos parámetros controlan en vivo la nueva simulación del glomérulo en Filtración. La simulación de tres estados en la pestaña Glucosa conserva su comportamiento independiente.

Las herramientas de aislamiento y ocultación corresponden a Anatomía. En el riñón requieren activar el corte; en el glomérulo se pueden usar directamente. El botón de corte se oculta cuando está seleccionado el glomérulo. En Glucosa se utilizan los controles de opacidad y vasos del panel derecho. Rayos X y Anotar siguen disponibles.

El botón de menú de la esquina superior derecha permite volver a mostrar el panel después de cerrarlo.

## Archivos para integrar en tu repositorio

Actualiza el contenido de `Proyecto-Riñon`, incluyendo:

- `index.html`, `main.js` y `styles.css`.
- `anatomy-browser.js`: miniatura intercambiable, fichas y vistas previas 3D de las piezas.
- `glomerulus-structures.js`: nombres, colores, textos y segmentación compartida por Anatomía y Filtración.
- `glucose.js`: integración con el visor y los controles.
- `simulation.js`: motor de la simulación de tres estados.
- `routes.json` y `mesh-groups.json`: recorridos medidos y regiones de la nefrona.
- `filtration.js`, `glomerulus-simulation.js` y `renal-physiology.js`: nuevo glomérulo, animación y cálculo compartido por ambos paneles.
- `glomerulus-routes.json`: rutas extraídas del nuevo GLB.
- `Models/Glomerulo.glb` y `Models/Glomerulo_colores.txt`: modelo y guía de colores adjuntos.
- `tools/verify-glomerulus.mjs`: pruebas del cálculo y la animación del glomérulo.
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

Las pruebas comprueban la conservación de glucosa, el cambio de tasas con TFG, la proporción que continúa en glucosuria, el cese con PFN negativa, la circulación vascular y el reinicio. También se verificó en el navegador la carga del GLB, los siete sliders, los presets, las dos subpestañas, la vinculación/manual, la pausa, la opacidad, Rayos X, las anotaciones y el paso 03 de la simulación anterior.

Referencia sobre filtración y retorno tubular: [NIDDK · Your Kidneys & How They Work](https://www.niddk.nih.gov/health-information/kidney-disease/kidneys-how-they-work). Los enlaces no se muestran en el panel de la aplicación.


## Glomérulo en Anatomía

- Al entrar, se muestra el riñón y una miniatura del glomérulo en la esquina inferior derecha.
- Haz clic en esa miniatura para abrir el glomérulo en el visor principal. El recuadro pasa a mostrar el riñón y permite regresar a él.
- En el glomérulo están disponibles **Seleccionar**, **Aislar**, **Mostrar / ocultar**, **Rayos X** y **Anotar**. El botón de corte no aparece. Al regresar al riñón se recupera su última vista completa o de corte.
- Selecciona una pieza en el modelo o en la lista de la derecha. Su ficha muestra el nombre, una vista previa 3D aislada, una descripción breve y su función. La vista previa se puede girar arrastrándola.
- Las seis piezas son **arteriola aferente**, **arteriola eferente**, **capilares glomerulares**, **cápsula de Bowman**, **túbulo proximal** y **túbulo distal**. Los nombres y colores se basan en la guía del artista y en las regiones de COLOR_0 del GLB.
- La vista previa contiene exclusivamente las caras de la región seleccionada, con opacidad completa. No hereda las transparencias ni Rayos X del visor principal.
- Aislar mantiene opaca la pieza seleccionada y atenúa el contexto. Repite la selección de esa misma pieza para restaurar. Desde la lista puedes elegir otra pieza directamente. Mostrar / ocultar atenúa la pieza; vuelve a elegirla para mostrarla.
- Si una estructura está repartida entre varias mallas, aislar y mostrar / ocultar afectan a toda esa estructura.
- Las anotaciones de riñón y glomérulo se conservan por separado al alternar entre ambos.
- Anatomía usa una instancia propia del GLB, sin partículas. Sus cambios de materiales no alteran la simulación de Filtración. Volver a Anatomía conserva el modelo elegido.

Las regiones de médula renal y cálices mayores que no estén separadas con esos nombres en los GLB del riñón conservan su texto informativo y muestran un aviso en la vista previa. Las seis regiones del glomérulo sí están identificadas y extraídas.

### Validación de esta actualización

Se ejecutaron las pruebas previas de glucosa y filtración. Además, se cargaron los GLB reales en una comprobación programática de la aplicación para verificar las seis fichas y sus geometrías, la selección por raycasting, el intercambio de modelos, el aislamiento, la ocultación, Rayos X, las anotaciones, el corte exclusivo del riñón y la independencia de la simulación. Esta comprobación sustituye únicamente el contexto GPU; no verifica el aspecto final renderizado. El navegador de este entorno no pudo abrir el servidor local.

Fuentes de las descripciones anatómicas: [NIDDK · Los riñones y su funcionamiento](https://www.niddk.nih.gov/health-information/informacion-de-la-salud/enfermedades-rinones/rinones-funcionamiento), [NCBI Bookshelf · Bowman Capsule](https://www.ncbi.nlm.nih.gov/books/NBK554474/) y [NCBI Bookshelf · Renal Blood Flow and Filtration](https://www.ncbi.nlm.nih.gov/books/NBK482248/). Estos enlaces están en la documentación, no en el panel de la aplicación.
