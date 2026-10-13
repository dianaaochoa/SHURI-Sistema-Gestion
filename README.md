# 🛠️ SHURI - Sistema Integral de Reparaciones y Ventas
> **Asignatura:** Desarrollo Web Integral  
> **Profesor:** Jesús Del Toro Robledo  
> **Universidad:** Universidad Tecnológica de Torreón  

---

## 👥 Equipo de Desarrollo
* **Diana Paola Ochoa Altamirano** (Líder / Fullstack)
* **Brisa Daniela Luna Castañeda** (Backend Developer & DBA)
* **Félix Gael Martínez Saldívar** (Frontend Developer & UX/UI)

---

## 📌 1. Planteamiento del Problema
(AQUÍ COPIAS EL CONTENIDO DE TU DOCUMENTO DE LA UNIDAD 1)

---

## 🎯 2. Objetivos
### 2.1 Objetivo General
...

---

## 🔀 3. Flujo de Trabajo y Control de Versiones (Workflow)
Elegimos **Git** y **GitHub** porque nos permite trabajar de forma distribuida y paralela.  
Adoptamos el flujo **GitHub Flow**:
* `main`: Código estable de producción.
* `feature/backend-database`: Rama de desarrollo para Brisa[cite: 7].
* `feature/frontend-ui`: Rama de desarrollo para Félix[cite: 7].

---

## 📐 4. Diagramas del Sistema
### 4.1 Arquitectura de Software
![Arquitectura](./docs/images/arquitectura.png)

### 4.2 Diagrama Entidad-Relación (DER)
![DER](./docs/images/der.png)

### 4.3 Casos de Uso UML
![Casos de Uso](./docs/images/casos_de_uso.png)

---

## 🗄️ 5. Diccionario de Datos (MySQL)
| Tabla | Campo | Tipo | Longitud | Restricciones | Descripción |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `users` | `id` | BIGINT | 20 | PK, AUTO_INCREMENT | Identificador del usuario |
| `users` | `email` | VARCHAR | 255 | UNIQUE, NOT NULL | Correo de acceso |
| `ordenes` | `folio` | VARCHAR | 10 | UNIQUE, NOT NULL | Folio único de reparación |

*(Brisa completará la lista completa de tablas aquí)*[cite: 7]