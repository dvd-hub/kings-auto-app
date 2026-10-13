# Fase 5: pruebas del CRM para David

Rama `dev`. No publicar en `main` durante estas pruebas. Los cambios hechos desde la app se guardan en Supabase: usa clientes de prueba para altas, cambios de estado y spam.

## Preparación en Chrome

1. En PowerShell, entra en `C:\Users\Valhalla\Proyectos\kings-auto-app`.
2. Ejecuta `npm run dev` y abre en Chrome la dirección que indique el terminal.
3. Inicia sesión con tu cuenta invitada y pulsa **ES**.
4. Comprueba que el menú muestra **Calendario → Leads → Órdenes de reparación**.

## Lista y alta manual

1. Abre **Leads**. Comprueba las siete columnas y el contador de nuevos.
2. El filtro inicial debe ser **Leads abiertos**, sin ganados, perdidos ni spam. Prueba cada estado y **Todos los estados**.
3. Pulsa **Nuevo lead** y busca un cliente existente. Si ya tiene un lead abierto, debe aparecer un aviso con enlaces a esos leads.
4. Elige un vehículo. Solo deben aparecer vehículos de ese cliente; también puedes dejarlo sin vehículo.
5. Escribe el resumen y elige teléfono, en persona, referido u otro. **Web** no debe aparecer como opción manual.
6. Si necesitas otro lead para ese cliente, marca la casilla de confirmación y pulsa **Crear lead**. Sin marcarla, el servidor debe impedir el alta duplicada accidental.
7. Para probar un cliente nuevo, usa **Nuevo cliente**, introduce nombre y al menos teléfono o correo y pulsa **Crear y elegir cliente**. Si el contacto ya existe, elige la ficha que se ofrece.

## Ficha e historial

1. Abre un lead de prueba y pulsa los enlaces del cliente y del vehículo.
2. Añade una **Nota** y una **Llamada**. Abre otro lead del mismo cliente: esas entradas no deben aparecer en su historial.
3. Cambia a **Contactado** y guarda. Debe aparecer una entrada de cambio de estado. Alterna **EN / ES** para comprobar que el evento cambia de idioma.
4. Selecciona **Perdido** y guarda sin motivo: debe pedirlo sin cambiar el estado guardado. Después elige motivo, escribe una nota y guarda.
5. Vuelve a **Contactado**. Recarga: el motivo y la nota de pérdida deben haberse limpiado.
6. Fija una próxima llamada para ayer. En la lista debe aparecer en rojo con **Vencida**, y en **Por llamar**. Prueba también hoy y mañana: hoy se incluye y mañana se excluye.
7. Usa **Quitar fecha de llamada**. El lead debe dejar de aparecer en **Por llamar**.

## Citas y órdenes

1. En la ficha, elige una cita existente y pulsa **Guardar enlace de cita**. Solo deben ofrecerse citas del cliente del lead.
2. Pulsa **Ver en calendario**: debe abrir la fecha de la cita y su detalle.
3. En un cliente de prueba, usa **Crear cita de presupuesto**. El formulario debe mantener fijo al cliente y ofrecer solo el tipo presupuesto.
4. Guarda la cita y comprueba que queda enlazada. Si se avisa de un fallo al enlazar, selecciónala entre las existentes; no la vuelvas a crear.
5. Pulsa **Crear orden** y comprueba que cliente y vehículo están precargados. Completa la orden con datos reales de prueba, sin inventar el kilometraje.
6. Vuelve al lead, selecciona **Ganado**, elige la orden del mismo cliente y guarda. Sin orden seleccionada, debe pedirla.

## Solicitudes web y spam

1. Abre un lead de origen web. Debe mostrar daño, fecha y franja preferidas, aseguradora, siniestro, grúa y fotos.
2. Abre una foto y cierra el visor. Las imágenes se leen mediante URLs firmadas del bucket privado.
3. En un lead de prueba, pulsa **Marcar como spam**. Lee la confirmación: indica que el cliente se archiva si no tiene citas ni órdenes. Cancela para comprobar que no cambia nada.
4. Confirma solo en datos de prueba. El lead debe quedar en spam y conservar su historial. Si el cliente tiene citas u órdenes, su ficha debe seguir activa.
5. Abre la ficha de un cliente activo y comprueba su sección **Leads**, con estado y enlace a cada lead.

## Comprobaciones automatizadas

`node --test tests/leads-actions.test.mjs` ejecuta las acciones y los esquemas reales con una frontera Supabase simulada en memoria; no escribe datos en la BD.

Ejecuta también `npx tsc --noEmit`, `npm run lint` y `npm run build`.
