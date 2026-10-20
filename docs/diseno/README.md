# Diseño UX/UI · SHURI

Diseño de interfaces del sistema SHURI (Reparaciones y Ventas), hecho en Figma por **Félix Gael Martínez Saldívar** (Frontend & UX/UI).

- Archivo en Figma: https://www.figma.com/design/wUFXid6RcC3a6H9iEdokWi/Untitled
- Marca: SHURI con su logo. Un solo negocio (una sucursal).
- Comunicación con el cliente: chat interno del portal (cliente ↔ jefe de técnicos) y avisos en el portal que también llegan por correo. Sin llamadas ni WhatsApp.
- Acceso: contraseña temporal (por correo e impresa en la hoja de recepción para el cliente; asignada por el administrador para el personal). Al primer ingreso se crea la contraseña definitiva, con indicador de seguridad.

## Estructura

| Carpeta | Contenido |
|---|---|
| `01-acceso/` | Login del personal: A.1–A.6 (datos incorrectos, olvidé mi contraseña, crear y cambiar contraseña) y nota de a dónde entra cada rol |
| `02-administrador/` | AD1–AD9: inicio, reportes, cortes, catálogo, proveedores, facturación, usuarios (incluye asignar contraseña temporal), bitácora, configuración (incluye correo) |
| `03-cajera/` | 01–11: caja, punto de venta, ventas, órdenes, nueva orden, entrega, inventario, clientes, estadísticas, corte, documentos impresos |
| `04-jefe-de-tecnicos/` | J1–J11: tablero, cotizar, garantías, refacciones, inventario, técnicos, terminados, configuración, celular y **mensajes de clientes** |
| `05-tecnico/` | T1–T7: equipos asignados, banco de trabajo, garantías, refacciones, historial, tablet |
| `06-portal-cliente/` | P1–P6: acceso con correo y contraseña temporal, seguimiento, garantía, información, **chat con el jefe de técnicos** y **correos al cliente** |
| `07-componentes/` | Componentes, tokens (color, espaciado, radios, sombras), reglas de comportamiento y versión 1366 px |
| `08-casos-de-uso/` | Diagrama de casos de uso (PNG y SVG) |

Cada imagen es una sección completa de Figma con todas sus pantallas en orden.

## Tamaños base
- Escritorio 1440×900 (menú lateral de 184 px) · compacto 1366×768 (riel de 72 px)
- Tablet 1180×820 · Celular 390×844
