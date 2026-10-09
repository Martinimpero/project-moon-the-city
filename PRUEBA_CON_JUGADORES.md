# Prueba con jugadores reales: lista de comprobación

**Para qué sirve.** Todo lo de las salas (conexión, mapa, niebla, relojes, documentos, diario, Marcas) está probado con tests y con un solo navegador, pero **nunca con dos personas en dos dispositivos**. Esta lista lo comprueba. Tarda unos 30 minutos entera; los puntos marcados con ⭐ son el mínimo (unos 12 minutos).

**Qué necesitas**
- Dos personas: una hace de **DJ** y otra de **jugador**. Lo ideal es que el jugador esté en **otra red** (datos del móvil, no el mismo wifi) y en **otro aparato**. Eso es lo que más riesgo tiene.
- Enlace: https://martinimpero.github.io/project-moon-the-city/
- Edge o Chrome. Si puede ser, que el jugador use el móvil para el punto 12.
- Un papel o un chat para apuntar fallos (ver el final).

---

## 0. Preparación (3 min)

**DJ**
1. Abre la web. Pulsa **Kits**, elige "Sesión 01: El Cargamento de la Fila" y pulsa **Abrir**. Deja marcado "Añadir a lo que tengo" y pulsa **Importar kit**.
2. Pulsa **Añadir los 4 prefabricados**.

**Jugador**
1. Abre la web. Pulsa **Añadir los 4 prefabricados** y quédate con **Dax Verrin** (puedes ignorar a los otros).

---

## 1. ⭐ Conectar (3 min)

1. Los dos pulsan **Sala** → **Probar mi conexión**. Anota lo que dice cada uno (si sale un aviso en rojo, ya tenemos un dato).
2. **DJ:** Sala → "Soy el DJ: abrir una sala". Escribe tu nombre, deja el código que sale y una **contraseña** (por ejemplo `luna`). Pulsa **Ir**.
3. **Jugador:** Sala → "Soy jugador: unirme a una sala". Su nombre, el código y la contraseña.

**Debe pasar:** el botón de la cabecera pasa a poner "Sala CÓDIGO · 2" en los dos. El DJ ve a Dax en la lista de personajes con una marca de ajeno.
**Prueba la contraseña:** que el jugador intente entrar con una contraseña mala; debe salir un aviso de contraseña incorrecta.

## 2. ⭐ Tiradas y registro (2 min)

1. El jugador tira Combate con Dax (cualquier Dificultad).
2. El DJ tira en secreto (**Historial** → **Tirada secreta**) y luego otra tirada normal con una Amenaza.

**Debe pasar:** el DJ ve la tirada del jugador y el jugador ve la del DJ, con los mismos dados. **La tirada secreta no aparece en el aparato del jugador.** Luego el DJ pulsa **Mostrar a la mesa** en la secreta y ahora sí aparece.
**Idioma:** el jugador cambia a inglés (botón EN/ES). Las cartas del DJ deben leerse en inglés para él y en español para el DJ.

## 3. ⭐ Hojas y Marcas (2 min)

1. El jugador gasta 1 de E.G.O. o cambia el Estrés de Dax. El DJ debe ver el cambio en la lista de personajes en un par de segundos.
2. El DJ pulsa **Dar Marcas**, Riesgo 3, y marca a Dax. El jugador debe ver un aviso "Dax gana Marcas" y en la pestaña **Crecimiento** debe tener 2 sin gastar.
3. El jugador sube una Habilidad en **Crecimiento**. Debe salir una carta en el registro para los dos.

## 4. ⭐ Mapa y fichas (3 min)

1. El DJ: pestaña **Mapa**, escena "1. Encargo: Oficina Fixer". Pulsa **+ Personajes** (pone las fichas) y luego **Mostrar a la mesa**.
2. El jugador debe ver el mapa y la ficha de Dax.
3. El jugador arrastra **su** ficha (debe moverse, y el DJ la ve moverse). Luego intenta arrastrar la de otro personaje o la de un PNJ: **no debe moverse.**
4. Los dos usan **Señalar** en un punto del mapa: la señal debe aparecer en el otro aparato (con el nombre del jugador si la hizo él).

## 5. Niebla, muros y notas (4 min)

1. DJ: activa **Niebla de guerra** y **Visión automática**. Dibuja un **Muro** y una **Puerta** entre dos habitaciones.
2. El jugador mueve su ficha: debe ir descubriendo el mapa, y **no debe ver las líneas de los muros** (solo el DJ las ve).
3. El DJ abre la puerta con un clic: el jugador debe ver aparecer lo de detrás.
4. DJ: **Nota** en el mapa con etiqueta "Salida" y una nota privada "TRAMPA". Marca "Los jugadores ven esta chincheta". El jugador debe ver "Salida" y **nunca** el texto "TRAMPA".
5. DJ: **Dibujar** una línea con "Los jugadores ven los dibujos" **desmarcada**: el jugador no la ve. Marca la casilla y dibuja otra: sí la ve.
6. DJ: **Área** → cono de 4 casillas. Debe decir quién queda dentro. Con la casilla de los jugadores marcada, el jugador también lo ve dibujado.

## 6. Relojes (1 min)

1. DJ: pestaña **Relojes**. "Guerra Abierta" está visible; "Calor de Coldwater" y "Refuerzos" ocultos.
2. **Debe pasar:** el jugador solo ve Guerra Abierta. El DJ lo sube; el jugador lo ve subir. Al llenarlo sale una carta "Reloj completo" en el registro de los dos.

## 7. Documentos y diario (3 min)

1. DJ: pestaña **Documentos**, abre "El Cargamento de la Fila" y **Mostrar** solo a Dax. El jugador debe recibirlo. Luego el DJ lo **retira**: debe desaparecer del jugador.
2. DJ: vuelve a mostrarlo a todos. El jugador lo abre y lo lee en su idioma.
3. Diario: el jugador escribe una entrada. El DJ debe verla con la firma del jugador. El jugador **no** debe poder borrar la entrada del DJ ("Lo que sabemos").

## 8. Deshacer (1 min)

1. El jugador sube una Habilidad (o hace una tirada) y pulsa **Deshacer** (o Ctrl+Z).
2. **Debe pasar:** la hoja vuelve atrás y en el registro de los dos sale la carta "Deshecho: …". El DJ no puede deshacer lo del jugador.

## 9. ⭐ Cortes y recargas (4 min)

1. **El jugador recarga la página** (F5). Debe volver a la sala solo, con su personaje, sin pedirle el código.
2. **El DJ recarga la página.** Los jugadores deben reconectar solos en menos de un minuto (verás "Reconectando...").
3. **El jugador corta el wifi/datos 20 segundos** y los vuelve a poner. Debe volver a entrar.
4. Con la sala llena, el DJ pulsa **Copia** → mira que hay una copia reciente.

## 10. Móvil (2 min, el jugador)

Con la web abierta en el móvil: ¿se leen las pestañas de abajo (Gente, Hoja, Mesa)? ¿se puede arrastrar y hacer zoom en el mapa con el dedo? ¿se puede escribir en los diálogos sin que el teclado tape el botón?

## 11. Al final (1 min)

El DJ pulsa **Exportar** y guarda el archivo. Después **Imprimir** → una ficha → "Guardar como PDF" y mira que sale bien. (Opcional.)

---

## Cómo apuntar un fallo

Para cada cosa que no salga como dice la lista, apunta:
1. **El número del punto** (por ejemplo "5.2").
2. **Qué hiciste, qué esperabas y qué pasó.**
3. **Quién y con qué:** DJ o jugador, aparato y navegador, y si estaban en la misma red.
4. **Una captura de pantalla.** Si sale un error raro, pulsa F12 → pestaña *Consola* y copia las líneas en rojo.

Con eso puedo reproducirlo y arreglarlo. Si todo sale bien en los puntos ⭐, la web está lista para una primera sesión de verdad.

| Punto | ✔ / ✘ | Notas |
|---|---|---|
| 1 Conectar | | |
| 2 Tiradas | | |
| 3 Hojas y Marcas | | |
| 4 Mapa | | |
| 5 Niebla y notas | | |
| 6 Relojes | | |
| 7 Documentos y diario | | |
| 8 Deshacer | | |
| 9 Cortes | | |
| 10 Móvil | | |
