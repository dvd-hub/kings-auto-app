# Kings Auto Collision — guía para agentes de código

App interna de gestión para Kings Auto Collision Inc., taller de carrocería, pintura y restauración de clásicos en Pittsburg, California (EE. UU.). Un solo taller hoy, diseñada para varios.

## Stack

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- Supabase: auth, Postgres con RLS, Storage. Proyecto `yhwcsppyrovbvxoxzopd` (región us-west-1)
- Netlify (hosting), Stripe (pagos), next-intl (inglés por defecto, español)

## Flujo de trabajo

- Trabaja SOLO en la rama `dev`. `main` es producción y solo se toca al publicar.
- NO hagas commit ni push: lo revisa el dueño del proyecto.
- Windows con PowerShell: no uses `find`, `grep` ni `cat` de Unix.
- Antes de dar algo por terminado, pega el OUTPUT LITERAL de: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `git status`, `git diff --stat`. Nunca un resumen en prosa.
- Si algo no existe o no se puede hacer, escribe `NO ENCONTRADO` y explica por qué. No supongas.
- Haz exactamente lo que pide la tarea. No refactorices ni "mejores" otras partes.

## Base de datos

- NO crees ni modifiques tablas, migraciones, policies ni la carpeta `supabase/`. Los cambios de esquema se hacen fuera de este agente y se versionan en `supabase/migrations/`.
- Todas las tablas tienen `shop_id`; el RLS filtra por `public.current_shop_id()`.
- Borrado lógico con `deleted_at`. Nunca DELETE.
- Números de RO y de factura los genera la base de datos. Nunca los calcules en el frontend.
- Dinero en centavos (integer). Fechas en UTC en la base de datos.

## Reglas de negocio que el código debe respetar

- Cada línea de pieza lleva dos datos obligatorios (exigencia legal de la BAR de California): estado (`part_condition`: new, used, rebuilt, reconditioned) y si es pieza de carrocería (`is_crash_part`); si lo es, origen obligatorio (`crash_part_origin`: oem o non_oem_aftermarket). Nunca uses términos como LKQ, Opt-OEM, Alt-OEM u OEM surplus.
- Descripciones de presupuesto en lenguaje llano, sin siglas del sector (nada de "R&R" o "R&I").
- El sales tax NO va en el presupuesto, solo en la factura. Prohibido cobrar "shop supplies" genéricos.
- Ningún trabajo se factura por encima de lo autorizado. Cada suplemento necesita su propia autorización registrada.
- Un presupuesto autorizado queda bloqueado: no se edita, se crea un suplemento.
- Un presupuesto solo pasa a `authorized` o `declined` insertando una fila en `authorizations`; la base de datos calcula importe y huella y lo bloquea. Nunca actualices `status` a esos valores ni `locked_at` desde la app. Las autorizaciones no se modifican nunca.
- Tipos de presupuesto: `teardown` (desmontaje), `repair` y `supplement`. Las restricciones de la base de datos reflejan la normativa de la BAR: valida en zod antes para dar mensajes claros.
- Un clásico es una orden de tipo `classic` con fases; no hay un sistema de presupuestos aparte.
- El impuesto se calcula por línea según `taxable`. No asumas qué tributa.
- Suplementos: el padre debe ser una reparación o suplemento autorizado de la misma orden. Cada suplemento tiene su autorización propia; muestra el total aprobado de la cadena anterior, el importe adicional y el nuevo total. Sin `teardown_role`. El aviso a la aseguradora (`payor_notified_at`) se registra una sola vez.
- Persona designada: firma del cliente y contacto obligatorio; solo puede autorizar suplementos (`by_designee`). Una vez firmada no se cambia ni se cambia el cliente o vehículo de la orden. Firma sin `estimate_id`; copia en `/orders/[id]/designation/pdf`.
- Resultado del desmontaje: definitivo, exige desmontaje autorizado; `repair` exige reparación autorizada. Guarda resultado y fecha juntos. Plazo de remontaje desde la autorización del desmontaje, en días de la hora del taller.
- Pérdida total: solo desde `open` o `in_progress`, con `total_loss_at`; no aparece en `editableOrderStatuses` y oculta el selector. Aviso de recogida en `completed` o `total_loss`, una sola vez; sin aviso no se puede cobrar almacenaje.
- Citas enlazadas: `appointments.repair_order_id`, mismo cliente que la orden. No cambies el cliente de una orden con citas enlazadas no borradas; al crear, enlazar o quitar enlace registra actividad y revalida orden y calendario.

## Formato y zona horaria

- Todo se muestra en la hora del taller, `America/Los_Angeles` (`SHOP_TIMEZONE` en `src/lib/config.ts`), nunca en la del navegador.
- Formatos de EE. UU. en ambos idiomas: `$1,234.56`, `MM/DD/YYYY`, hora 12h, `(925) 555-0123`, `12,345 mi`. Usa las funciones de `src/lib/format.ts`.
- Ningún texto visible escrito a mano en componentes: todo en `messages/en.json` y `messages/es.json`.

## Diseño

Mockups aprobados: dashboard, orden de reparación, tablero de producción y constructor de presupuestos. Ningún color escrito a mano: siempre por token de `src/app/globals.css`.

| Token | Valor |
| --- | --- |
| Fondo app | `#F4F3F1` |
| Superficie | `#FFFFFF` |
| Borde / borde input | `#E4E2DE` / `#D6D3CE` |
| Texto principal / secundario | `#1B1A19` / `#5F5B56` |
| Menú lateral | `#171817`, texto `#CFCBC6`, activo blanco con icono `#FF3B42` |
| Acción principal (marca) | `#D3000D`, texto blanco. Solo una por pantalla |
| Enlaces | `#1A4FA8` |
| Info / Warning / Success / Danger / Neutral (fondo · texto) | `#E6EEFB·#1A4FA8` / `#FFF4DE·#8A5300` / `#E3F3EA·#17633A` / `#FDE8E8·#A3000A` / `#EFEDEA·#4A4743` |

- Tipografías: Barlow (cuerpo), Barlow Semi Condensed (títulos), IBM Plex Mono (RO, facturas, VIN). Nunca Inter, Roboto ni Arial.
- Estados siempre con etiqueta escrita, nunca solo color (`status-badge`).
- Objetivos táctiles mínimo 44px. Se usa en tablets dentro del taller.
- Logo en `public/logo.png`: no lo modifiques.

## Seguridad

- Nunca expongas la service role key en el cliente. Solo la anon key va en `NEXT_PUBLIC_*`.
- No hay registro público: los usuarios entran por invitación.
- Páginas públicas (firma por enlace, galería de clásicos, formulario de leads): tokens firmados con caducidad y límite de peticiones.

## Patrones establecidos (fases 1 y 2)

- Escrituras con Server Actions (`"use server"`) que validan con los esquemas zod de `src/lib/validation.ts`. Lecturas en Server Components.
- Tipos de la base de datos en `src/lib/database.types.ts`: los genera Claude desde Supabase después de cada migración. NO los edites a mano; si falta una columna, escribe `NO ENCONTRADO`.
- Clientes de Supabase tipados con `Database` en `src/lib/supabase/`. Nunca envíes `shop_id` ni `created_by`: la base de datos los rellena.
- Traducciones en el servidor con `getT()` de `src/i18n/server.ts`.
- Fechas de formularios: interpretar en la hora del taller con `fromZonedTime(..., SHOP_TIMEZONE)`; mostrar con `formatInTimeZone`.
- Eventos importantes (cita creada, reprogramada, cambio de estado) se registran en `activities` con `kind = 'system'`.
- Errores de la base de datos se traducen a mensajes claros; `23505` (duplicado) se trata de forma específica.
- Rutas de módulos propios fuera de `src/app/(app)/[section]`: al crear un módulo nuevo, quítalo de la lista de esa ruta.
- Next.js 16: `src/proxy.ts` (no `middleware.ts`).
- Errores de restricciones (`23514`): tradúcelos por nombre de restricción a una clave de `errors`; nunca muestres el texto crudo de Postgres.
- Archivos en Supabase Storage: bucket privado `documents`, ruta `<shop_id>/...`, solo subir y leer (nunca sobrescribir ni borrar). Cada archivo tiene su fila en `documents`.
- Citas pedidas desde la web: estado `requested` y `source = 'web'`. El taller las confirma (pasan a `scheduled`); el servidor solo confirma si la cita sigue en `requested`.
- Solicitudes web (`web_requests`): solo lectura en la app (como mucho se cambia `status` o `deleted_at`). Se muestran en el detalle de la cita del calendario con `src/lib/web-requests.ts`; las fotos se leen con URLs firmadas (`createSignedUrls`, 1 h) y `<img>` normal, nunca `next/image`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
