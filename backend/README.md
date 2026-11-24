# ⚙️ SHURI · Backend (API REST)

**Laravel 10 · PHP 8.1+ · MySQL 8.0 · Laravel Sanctum**

Documentación técnica del backend: modelo de datos completo, diccionario de datos e instalación.
Responsable: **Brisa Luna** (Backend & DBA). ← [Volver al README principal](../README.md)

## Índice

1. [Diagrama entidad-relación](#1-diagrama-entidad-relación)
2. [Diccionario de datos](#2-diccionario-de-datos)
3. [Reglas de integridad](#3-reglas-de-integridad)
4. [Instalación](#4-instalación)

---

## 1. Diagrama entidad-relación

Base de datos `shuri_db`: **51 tablas** organizadas en 7 módulos. Primero, un mapa general; después, un diagrama por módulo con todas sus columnas.

**Cómo leer las líneas:**

| Símbolo | Significado |
|---|---|
| `\|\|--o{` | Uno a muchos **obligatorio**: el registro hijo siempre pertenece a uno del padre (ej. todo equipo tiene un cliente dueño). |
| `\|o--o{` | Uno a muchos **opcional**: el hijo puede o no estar ligado al padre (ej. una venta puede no tener cliente). |

El texto sobre cada línea es la columna (llave foránea) que hace la conexión. **PK** = llave primaria, **FK** = llave foránea, **UK** = valor único.

### Mapa general

Vista simplificada con las tablas principales y cómo se conectan.

```mermaid
erDiagram
    cash_registers |o--o{ users : "cash_register_id"
    roles ||--o{ users : "role_id"
    customers ||--o{ devices : "customer_id"
    customers ||--o{ conversations : "customer_id"
    conversations ||--o{ messages : "conversation_id"
    users |o--o{ service_orders : "technician_id y otros"
    cash_registers |o--o{ service_orders : "cash_register_id"
    customers ||--o{ service_orders : "customer_id"
    devices ||--o{ service_orders : "device_id"
    order_statuses ||--o{ service_orders : "status_id"
    customers |o--o{ quotes : "customer_id"
    service_orders |o--o{ quotes : "service_order_id"
    order_statuses |o--o{ order_logs : "previous_status_id, new_status_id"
    warranties |o--o{ order_logs : "warranty_id"
    service_orders ||--o{ order_logs : "service_order_id"
    quotes |o--o{ order_logs : "quote_id"
    customers ||--o{ warranties : "customer_id"
    service_orders ||--o{ warranties : "service_order_id"
    service_orders ||--o{ order_parts : "service_order_id"
    products ||--o{ order_parts : "product_id"
    categories ||--o{ products : "category_id"
    suppliers |o--o{ products : "supplier_id"
    suppliers ||--o{ purchases : "supplier_id"
    purchases |o--o{ inventory_movements : "purchase_id"
    service_orders |o--o{ inventory_movements : "service_order_id"
    products ||--o{ inventory_movements : "product_id"
    sales |o--o{ inventory_movements : "sale_id"
    cash_registers ||--o{ cash_shifts : "cash_register_id"
    users |o--o{ cash_shifts : "user_id y otros"
    users |o--o{ sales : "cashier_id y otros"
    cash_registers |o--o{ sales : "cash_register_id"
    customers |o--o{ sales : "customer_id"
    invoices |o--o{ sales : "invoice_id"
    cash_shifts |o--o{ sales : "cash_shift_id"
    service_orders |o--o{ sale_items : "service_order_id"
    products |o--o{ sale_items : "product_id"
    sales ||--o{ sale_items : "sale_id"
    cash_shifts |o--o{ payments : "cash_shift_id"
    sales ||--o{ payments : "sale_id"
    customers |o--o{ invoices : "customer_id"
    invoices |o--o{ invoices : "replaced_by"
```

### Diagrama: Seguridad y personal

Usuarios internos (Administrador, Jefe de Técnicos, Técnico, Cajera), sus roles y permisos.

```mermaid
erDiagram
    roles {
        bigint id PK
        varchar slug UK
        varchar name
        varchar description
        timestamp created_at
        timestamp updated_at
    }
    permissions {
        bigint id PK
        varchar code UK
        varchar name
        varchar module
    }
    permission_role {
        bigint role_id PK, FK
        bigint permission_id PK, FK
    }
    users {
        bigint id PK
        bigint role_id FK
        bigint cash_register_id FK
        varchar name
        varchar username UK
        varchar email UK
        timestamp email_verified_at
        varchar password
        varchar phone
        varchar specialty
        enum shift
        date unavailable_until
        decimal max_discount_pct
        varchar authorization_code
        tinyint must_change_password
        tinyint failed_attempts
        datetime locked_until
        tinyint is_active
        timestamp last_login_at
        varchar remember_token
        timestamp created_at
        timestamp updated_at
    }
    password_reset_tokens {
        varchar email PK
        varchar token
        timestamp created_at
    }
    personal_access_tokens {
        bigint id PK
        varchar tokenable_type
        bigint tokenable_id
        varchar name
        varchar token UK
        text abilities
        timestamp last_used_at
        timestamp expires_at
        timestamp created_at
        timestamp updated_at
    }
    permissions ||--o{ permission_role : "permission_id"
    roles ||--o{ permission_role : "role_id"
    cash_registers |o--o{ users : "cash_register_id"
    roles ||--o{ users : "role_id"
```

### Diagrama: Clientes y portal

Clientes finales, su acceso al portal (correo + contraseña temporal enviada por correo), sus conversaciones del chat, sus equipos y datos fiscales.

```mermaid
erDiagram
    customers {
        bigint id PK
        varchar name
        varchar last_name
        varchar phone UK
        varchar email UK
        varchar address
        varchar neighborhood
        varchar city
        varchar state
        char postal_code
        varchar notes
        varchar password
        tinyint must_change_password
        datetime temporary_password_expires_at
        datetime password_changed_at
        datetime email_verified_at
        tinyint failed_attempts
        datetime locked_until
        datetime last_login_at
        datetime privacy_accepted_at
        tinyint is_active
        varchar remember_token
        timestamp created_at
        timestamp updated_at
    }
    customer_password_reset_tokens {
        bigint id PK
        bigint customer_id FK
        varchar token_hash
        datetime expires_at
        datetime used_at
        timestamp created_at
    }
    customer_tax_profiles {
        bigint id PK
        bigint customer_id FK
        varchar rfc
        varchar business_name
        char tax_regime
        char postal_code
        varchar cfdi_use
        varchar invoice_email
        tinyint is_default
        timestamp created_at
        timestamp updated_at
    }
    devices {
        bigint id PK
        bigint customer_id FK
        varchar type
        varchar brand
        varchar model
        varchar serial_number
        varchar color
        timestamp created_at
        timestamp updated_at
    }
    conversations {
        bigint id PK
        bigint customer_id FK
        bigint service_order_id FK
        enum status
        bigint handled_by FK
        datetime last_message_at
        timestamp created_at
        timestamp updated_at
    }
    messages {
        bigint id PK
        bigint conversation_id FK
        enum sender
        bigint user_id FK
        text body
        datetime read_at
        timestamp created_at
    }
    customers ||--o{ customer_password_reset_tokens : "customer_id"
    customers ||--o{ customer_tax_profiles : "customer_id"
    customers ||--o{ devices : "customer_id"
    customers ||--o{ conversations : "customer_id"
    service_orders |o--o{ conversations : "service_order_id"
    users |o--o{ conversations : "handled_by"
    conversations ||--o{ messages : "conversation_id"
    users |o--o{ messages : "user_id"
```

### Diagrama: Taller (órdenes de servicio)

Ciclo de vida de una reparación: recepción, asignación, diagnóstico, resguardo, entrega, abandono y garantía.

```mermaid
erDiagram
    order_statuses {
        bigint id PK
        varchar code UK
        varchar name
        varchar customer_message
        char color_hex
        tinyint sort_order
        tinyint portal_step
        tinyint is_final
        tinyint allows_work
        tinyint awaiting_pickup
    }
    service_orders {
        bigint id PK
        varchar folio UK
        bigint customer_id FK
        bigint device_id FK
        bigint status_id FK
        enum priority
        bigint cash_register_id FK
        text reported_issue
        varchar received_accessories
        json intake_checklist
        varchar physical_condition
        varchar device_pin
        text diagnosis
        varchar failure_cause
        enum labor_level_id
        smallint estimated_minutes
        tinyint is_paused
        varchar pause_reason
        varchar no_repair_reason
        decimal estimated_cost
        decimal deposit
        decimal labor_cost
        decimal parts_cost
        decimal total
        tinyint is_paid
        bigint received_by FK
        bigint assigned_by FK
        bigint technician_id FK
        bigint updated_by FK
        enum location
        datetime sent_to_storage_at
        tinyint storage_fee_waived
        bigint waived_by FK
        varchar waiver_reason
        decimal storage_fee
        smallint warranty_days
        date warranty_until
        bigint delivered_by FK
        varchar picked_up_by_name
        varchar picked_up_id_number
        varchar picked_up_relationship
        tinyint rating
        varchar rating_comment
        datetime rated_at
        date promised_date
        datetime assigned_at
        datetime quoting_started_at
        datetime approved_at
        datetime ready_at
        datetime delivered_at
        datetime abandoned_at
        datetime disposed_at
        bigint disposed_by FK
        timestamp created_at
        timestamp updated_at
    }
    order_time_logs {
        bigint id PK
        bigint service_order_id FK
        bigint technician_id FK
        enum type
        datetime starts_at
        datetime ends_at
        varchar pause_reason
        int minutes
        bigint active_technician_id UK
    }
    order_files {
        bigint id PK
        bigint service_order_id FK
        bigint quote_id FK
        bigint warranty_id FK
        bigint user_id FK
        enum type
        varchar path
        varchar original_name
        varchar mime_type
        int size_bytes
        tinyint visible_to_customer
        timestamp created_at
    }
    order_logs {
        bigint id PK
        bigint service_order_id FK
        bigint user_id FK
        enum type
        bigint previous_status_id FK
        bigint new_status_id FK
        bigint quote_id FK
        bigint warranty_id FK
        text description
        tinyint visible_to_customer
        timestamp created_at
    }
    warranties {
        bigint id PK
        varchar folio UK
        bigint service_order_id FK
        bigint customer_id FK
        enum request_channel
        text customer_reason
        enum status
        bigint received_by FK
        datetime received_at
        bigint technician_id FK
        text technician_review
        enum ruling
        bigint ruled_by FK
        datetime ruled_at
        varchar ruling_reason
        decimal extra_cost
        tinyint extra_cost_accepted
        datetime answered_at
        datetime finished_at
        bigint delivered_by FK
        datetime delivered_at
        timestamp created_at
        timestamp updated_at
    }
    users |o--o{ service_orders : "updated_by, assigned_by, waived_by, disposed_by, delivered_by, received_by, technician_id"
    cash_registers |o--o{ service_orders : "cash_register_id"
    customers ||--o{ service_orders : "customer_id"
    devices ||--o{ service_orders : "device_id"
    order_statuses ||--o{ service_orders : "status_id"
    service_orders ||--o{ order_time_logs : "service_order_id"
    users ||--o{ order_time_logs : "technician_id"
    warranties |o--o{ order_files : "warranty_id"
    service_orders ||--o{ order_files : "service_order_id"
    quotes |o--o{ order_files : "quote_id"
    users |o--o{ order_files : "user_id"
    order_statuses |o--o{ order_logs : "previous_status_id, new_status_id"
    warranties |o--o{ order_logs : "warranty_id"
    service_orders ||--o{ order_logs : "service_order_id"
    quotes |o--o{ order_logs : "quote_id"
    users |o--o{ order_logs : "user_id"
    customers ||--o{ warranties : "customer_id"
    users |o--o{ warranties : "ruled_by, delivered_by, received_by, technician_id"
    service_orders ||--o{ warranties : "service_order_id"
```

### Diagrama: Cotización y presupuestos

El técnico propone, el Jefe de Técnicos cotiza y el cliente aprueba o rechaza.

```mermaid
erDiagram
    quotes {
        bigint id PK
        varchar folio UK
        bigint service_order_id FK
        bigint customer_id FK
        enum type
        varchar device_description
        bigint technician_id FK
        text diagnosis
        varchar failure_cause
        enum labor_level_id
        smallint estimated_minutes
        text technician_notes
        text customer_note
        decimal labor_amount
        decimal parts_amount
        decimal discount
        decimal total
        smallint warranty_days
        date valid_until
        enum status
        bigint quoted_by FK
        datetime quoted_at
        datetime sent_at
        enum response_channel
        bigint answered_by FK
        varchar customer_comment
        datetime answered_at
        varchar response_ip
        bigint created_by FK
        timestamp created_at
        timestamp updated_at
    }
    quote_items {
        bigint id PK
        bigint quote_id FK
        enum type
        bigint product_id FK
        bigint service_id FK
        varchar concept
        int quantity
        decimal unit_price
        decimal subtotal
        tinyint out_of_stock
        enum origin
    }
    services {
        bigint id PK
        varchar name UK
        varchar description
        varchar device_type
        decimal price
        smallint estimated_minutes
        tinyint is_active
        timestamp created_at
        timestamp updated_at
    }
    customers |o--o{ quotes : "customer_id"
    users |o--o{ quotes : "quoted_by, created_by, answered_by, technician_id"
    service_orders |o--o{ quotes : "service_order_id"
    quotes ||--o{ quote_items : "quote_id"
    products |o--o{ quote_items : "product_id"
    services |o--o{ quote_items : "service_id"
```

### Diagrama: Inventario, refacciones y compras

Catálogo de productos, existencias, movimientos de stock, refacciones usadas en taller y compras a proveedores.

```mermaid
erDiagram
    categories {
        bigint id PK
        varchar name UK
        enum type
        timestamp created_at
        timestamp updated_at
    }
    products {
        bigint id PK
        bigint category_id FK
        bigint supplier_id FK
        varchar sku UK
        varchar barcode UK
        varchar name
        varchar brand
        varchar compatible_with
        varchar description
        enum type
        tinyint sellable_at_counter
        tinyint usable_in_workshop
        decimal purchase_price
        decimal sale_price
        int stock
        int min_stock
        varchar location
        varchar image_path
        tinyint is_active
        timestamp created_at
        timestamp updated_at
    }
    price_histories {
        bigint id PK
        bigint product_id FK
        bigint user_id FK
        decimal old_purchase_price
        decimal new_purchase_price
        decimal old_sale_price
        decimal new_sale_price
        varchar reason
        char batch_uuid
        timestamp created_at
    }
    inventory_movements {
        bigint id PK
        bigint product_id FK
        bigint user_id FK
        bigint authorized_by FK
        enum type
        int quantity
        int previous_stock
        int new_stock
        bigint sale_id FK
        bigint service_order_id FK
        bigint purchase_id FK
        bigint sale_return_id FK
        bigint reference_id
        varchar reason
        timestamp created_at
    }
    order_parts {
        bigint id PK
        bigint service_order_id FK
        bigint product_id FK
        bigint technician_id FK
        bigint part_request_id FK
        int quantity
        int returned_quantity
        decimal unit_price
        decimal subtotal
        timestamp created_at
        timestamp updated_at
    }
    part_requests {
        bigint id PK
        varchar folio UK
        bigint service_order_id FK
        bigint technician_id FK
        bigint product_id FK
        varchar description
        int quantity
        enum urgency
        enum status
        bigint handled_by FK
        datetime handled_at
        bigint purchase_order_id FK
        varchar rejection_reason
        varchar notes
        timestamp created_at
        timestamp updated_at
    }
    part_returns {
        bigint id PK
        bigint order_part_id FK
        bigint technician_id FK
        int quantity
        varchar reason
        enum status
        tinyint returns_to_stock
        bigint received_by FK
        datetime received_at
        timestamp created_at
        timestamp updated_at
    }
    suppliers {
        bigint id PK
        varchar name UK
        varchar contact_name
        varchar phone
        varchar email
        varchar rfc
        smallint credit_days
        varchar notes
        tinyint is_active
        timestamp created_at
        timestamp updated_at
    }
    purchase_orders {
        bigint id PK
        varchar folio UK
        bigint supplier_id FK
        bigint requested_by FK
        enum status
        date expected_date
        decimal estimated_total
        varchar notes
        timestamp created_at
        timestamp updated_at
    }
    purchase_order_items {
        bigint id PK
        bigint purchase_order_id FK
        bigint product_id FK
        varchar description
        int quantity
        int received_quantity
        decimal unit_cost
        decimal subtotal
    }
    purchases {
        bigint id PK
        varchar folio UK
        bigint supplier_id FK
        bigint purchase_order_id FK
        bigint user_id FK
        varchar supplier_invoice
        date purchase_date
        decimal subtotal
        decimal tax
        decimal total
        decimal amount_paid
        enum payment_status
        date due_date
        varchar notes
        timestamp created_at
        timestamp updated_at
    }
    purchase_items {
        bigint id PK
        bigint purchase_id FK
        bigint product_id FK
        int quantity
        decimal unit_cost
        decimal subtotal
    }
    supplier_payments {
        bigint id PK
        bigint purchase_id FK
        bigint user_id FK
        bigint cash_shift_id FK
        enum method
        decimal amount
        varchar reference
        timestamp created_at
    }
    categories ||--o{ products : "category_id"
    suppliers |o--o{ products : "supplier_id"
    products ||--o{ price_histories : "product_id"
    users ||--o{ price_histories : "user_id"
    users |o--o{ inventory_movements : "authorized_by, user_id"
    purchases |o--o{ inventory_movements : "purchase_id"
    sale_returns |o--o{ inventory_movements : "sale_return_id"
    service_orders |o--o{ inventory_movements : "service_order_id"
    products ||--o{ inventory_movements : "product_id"
    sales |o--o{ inventory_movements : "sale_id"
    service_orders ||--o{ order_parts : "service_order_id"
    products ||--o{ order_parts : "product_id"
    part_requests |o--o{ order_parts : "part_request_id"
    users ||--o{ order_parts : "technician_id"
    users |o--o{ part_requests : "handled_by, technician_id"
    service_orders |o--o{ part_requests : "service_order_id"
    purchase_orders |o--o{ part_requests : "purchase_order_id"
    products |o--o{ part_requests : "product_id"
    order_parts ||--o{ part_returns : "order_part_id"
    users |o--o{ part_returns : "received_by, technician_id"
    suppliers ||--o{ purchase_orders : "supplier_id"
    users ||--o{ purchase_orders : "requested_by"
    purchase_orders ||--o{ purchase_order_items : "purchase_order_id"
    products |o--o{ purchase_order_items : "product_id"
    purchase_orders |o--o{ purchases : "purchase_order_id"
    suppliers ||--o{ purchases : "supplier_id"
    users ||--o{ purchases : "user_id"
    purchases ||--o{ purchase_items : "purchase_id"
    products ||--o{ purchase_items : "product_id"
    purchases ||--o{ supplier_payments : "purchase_id"
    cash_shifts |o--o{ supplier_payments : "cash_shift_id"
    users ||--o{ supplier_payments : "user_id"
```

### Diagrama: Caja y punto de venta

Turnos de caja, ventas de mostrador, cobro de reparaciones, pagos, devoluciones y facturas.

```mermaid
erDiagram
    cash_registers {
        bigint id PK
        varchar name UK
        tinyint is_active
        timestamp created_at
        timestamp updated_at
    }
    cash_shifts {
        bigint id PK
        bigint cash_register_id FK
        bigint user_id FK
        datetime opened_at
        decimal opening_amount
        datetime closed_at
        bigint closed_by FK
        decimal expected_cash
        decimal counted_cash
        decimal difference
        decimal card_total
        decimal transfer_total
        varchar closing_notes
        enum status
        bigint reviewed_by FK
        datetime reviewed_at
        varchar review_comment
        bigint open_cash_register_id UK
        timestamp created_at
        timestamp updated_at
    }
    cash_movements {
        bigint id PK
        bigint cash_shift_id FK
        bigint user_id FK
        enum type
        decimal amount
        varchar reason
        bigint authorized_by FK
        timestamp created_at
    }
    sales {
        bigint id PK
        varchar folio UK
        bigint cash_shift_id FK
        bigint cash_register_id FK
        bigint cashier_id FK
        bigint customer_id FK
        bigint authorized_by FK
        decimal subtotal
        decimal discount
        decimal tax
        decimal total
        enum status
        varchar hold_note
        enum receipt_type
        bigint invoice_id FK
        datetime paid_at
        bigint cancelled_by FK
        datetime cancelled_at
        varchar cancellation_reason
        timestamp created_at
        timestamp updated_at
    }
    sale_items {
        bigint id PK
        bigint sale_id FK
        enum type
        bigint product_id FK
        bigint service_id FK
        bigint service_order_id FK
        varchar description
        int quantity
        decimal unit_price
        decimal discount_pct
        decimal discount_amount
        decimal subtotal
        int returned_quantity
        timestamp created_at
        timestamp updated_at
    }
    payments {
        bigint id PK
        bigint sale_id FK
        bigint cash_shift_id FK
        enum method
        decimal amount
        decimal amount_received
        decimal change_given
        varchar reference
        char card_last4
        bigint credit_note_id FK
        timestamp created_at
        timestamp updated_at
    }
    sale_returns {
        bigint id PK
        varchar folio UK
        bigint sale_id FK
        bigint cash_shift_id FK
        bigint user_id FK
        bigint authorized_by FK
        varchar reason
        decimal total
        enum refund_method
        bigint credit_note_id FK
        timestamp created_at
    }
    sale_return_items {
        bigint id PK
        bigint sale_return_id FK
        bigint sale_item_id FK
        int quantity
        decimal amount
        tinyint returns_to_inventory
    }
    credit_notes {
        bigint id PK
        varchar folio UK
        bigint customer_id FK
        decimal amount
        decimal balance
        date valid_until
        enum status
        bigint created_by FK
        timestamp created_at
        timestamp updated_at
    }
    invoices {
        bigint id PK
        varchar series UK
        int number UK
        char sat_uuid UK
        enum type
        char period
        bigint customer_id FK
        varchar rfc
        varchar business_name
        char tax_regime
        char postal_code
        varchar cfdi_use
        char payment_form
        char payment_method
        decimal subtotal
        decimal tax
        decimal total
        enum status
        enum origin
        varchar xml_path
        varchar pdf_path
        bigint issued_by FK
        datetime issued_at
        bigint cancelled_by FK
        datetime cancelled_at
        char cancellation_reason
        bigint replaced_by FK
        timestamp created_at
        timestamp updated_at
    }
    cash_registers ||--o{ cash_shifts : "cash_register_id"
    users |o--o{ cash_shifts : "closed_by, reviewed_by, user_id"
    users |o--o{ cash_movements : "authorized_by, user_id"
    cash_shifts ||--o{ cash_movements : "cash_shift_id"
    users |o--o{ sales : "authorized_by, cashier_id, cancelled_by"
    cash_registers |o--o{ sales : "cash_register_id"
    customers |o--o{ sales : "customer_id"
    invoices |o--o{ sales : "invoice_id"
    cash_shifts |o--o{ sales : "cash_shift_id"
    service_orders |o--o{ sale_items : "service_order_id"
    products |o--o{ sale_items : "product_id"
    services |o--o{ sale_items : "service_id"
    sales ||--o{ sale_items : "sale_id"
    credit_notes |o--o{ payments : "credit_note_id"
    cash_shifts |o--o{ payments : "cash_shift_id"
    sales ||--o{ payments : "sale_id"
    users |o--o{ sale_returns : "authorized_by, user_id"
    credit_notes |o--o{ sale_returns : "credit_note_id"
    cash_shifts |o--o{ sale_returns : "cash_shift_id"
    sales ||--o{ sale_returns : "sale_id"
    sale_returns ||--o{ sale_return_items : "sale_return_id"
    sale_items ||--o{ sale_return_items : "sale_item_id"
    customers |o--o{ credit_notes : "customer_id"
    users ||--o{ credit_notes : "created_by"
    users |o--o{ invoices : "cancelled_by, issued_by"
    customers |o--o{ invoices : "customer_id"
    invoices |o--o{ invoices : "replaced_by"
```

### Diagrama: Sistema, notificaciones y auditoría

Configuración, folios, correos enviados, notificaciones internas, colas de Laravel y registro de auditoría.

```mermaid
erDiagram
    settings {
        varchar key PK
        text value
        enum type
        varchar group
        varchar description
        bigint updated_by FK
        timestamp updated_at
    }
    sequences {
        varchar name PK
        smallint year PK
        int value
    }
    sent_emails {
        bigint id PK
        varchar recipient
        bigint customer_id FK
        bigint user_id FK
        bigint service_order_id FK
        enum type
        varchar subject
        enum status
        tinyint attempts
        varchar error
        datetime sent_at
        timestamp created_at
    }
    notifications {
        char id PK
        varchar type
        varchar notifiable_type
        bigint notifiable_id
        text data
        timestamp read_at
        timestamp created_at
        timestamp updated_at
    }
    jobs {
        bigint id PK
        varchar queue
        longtext payload
        tinyint attempts
        int reserved_at
        int available_at
        int created_at
    }
    failed_jobs {
        bigint id PK
        varchar uuid UK
        text connection
        text queue
        longtext payload
        longtext exception
        timestamp failed_at
    }
    audit_logs {
        bigint id PK
        bigint user_id FK
        varchar module
        varchar action
        varchar table_name
        bigint record_id
        varchar description
        json old_values
        json new_values
        varchar ip
        varchar user_agent
        timestamp created_at
    }
    users |o--o{ settings : "updated_by"
    customers |o--o{ sent_emails : "customer_id"
    service_orders |o--o{ sent_emails : "service_order_id"
    users |o--o{ sent_emails : "user_id"
    users |o--o{ audit_logs : "user_id"
```

---

## 2. Diccionario de datos

Explicación columna por columna. **Obligatorio** indica si el dato siempre debe capturarse; *Automático* = lo llena la base de datos. Convenciones: los importes son **dinero en pesos con 2 decimales**; los precios al público **incluyen IVA**; las contraseñas se guardan **cifradas con bcrypt**, nunca en texto plano.

| Módulo | Tablas |
|---|---|
| [2.1 Seguridad y personal](#21-seguridad-y-personal) | `roles`, `permissions`, `permission_role`, `users`, `password_reset_tokens`, `personal_access_tokens`, `two_factor_challenges`, `role_substitutions` |
| [2.2 Clientes y portal](#22-clientes-y-portal) | `customers`, `customer_password_reset_tokens`, `customer_tax_profiles`, `devices`, `conversations`, `messages`, `quick_replies` |
| [2.3 Taller](#23-taller-órdenes-de-servicio) | `order_statuses`, `service_orders`, `order_time_logs`, `order_files`, `order_logs`, `warranties` |
| [2.4 Cotización y presupuestos](#24-cotización-y-presupuestos) | `quotes`, `quote_items`, `services`, `labor_levels` |
| [2.5 Inventario, refacciones y compras](#25-inventario-refacciones-y-compras) | `categories`, `products`, `price_histories`, `inventory_movements`, `order_parts`, `part_requests`, `part_returns`, `suppliers`, `purchase_orders`, `purchase_order_items`, `purchases`, `purchase_items`, `supplier_payments` |
| [2.6 Caja y punto de venta](#26-caja-y-punto-de-venta) | `cash_registers`, `cash_shifts`, `cash_movements`, `sales`, `sale_items`, `payments`, `sale_returns`, `sale_return_items`, `credit_notes`, `invoices` |
| [2.7 Sistema, notificaciones y auditoría](#27-sistema-notificaciones-y-auditoría) | `settings`, `sequences`, `sent_emails`, `message_templates`, `notifications`, `jobs`, `failed_jobs`, `audit_logs` |

### 2.1 Seguridad y personal

Usuarios internos (Administrador, Jefe de Técnicos, Técnico, Cajera), sus roles y permisos.

##### `roles`

Catálogo de los 5 roles internos del sistema: Super usuario (una sola cuenta, acceso total), Administrador, Jefe de Técnicos, Técnico y Cajera.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `slug` | `varchar(30)` | Texto (letras y números), hasta 30 caracteres | Sí |  | Único | Clave interna del rol (super_admin, admin, head_technician, technician, cashier). |
| `name` | `varchar(50)` | Texto (letras y números), hasta 50 caracteres | Sí |  |  | Nombre visible del rol. |
| `description` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Explicación breve de lo que hace el rol. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `permissions`

Acciones que se pueden permitir o negar (ej. "Aplicar descuentos").

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `code` | `varchar(60)` | Texto (letras y números), hasta 60 caracteres | Sí |  | Único | Clave interna del permiso (ej. pos.discount). |
| `name` | `varchar(120)` | Texto (letras y números), hasta 120 caracteres | Sí |  |  | Nombre visible del permiso. |
| `module` | `varchar(40)` | Texto (letras y números), hasta 40 caracteres | Sí |  |  | Módulo al que pertenece (caja, taller, inventario…). |

##### `permission_role`

Qué permisos tiene cada rol (relación muchos a muchos).

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `role_id` | `bigint unsigned` | Número entero (id de `roles`) | Sí |  | PK, FK → `roles` | Rol que recibe el permiso. |
| `permission_id` | `bigint unsigned` | Número entero (id de `permissions`) | Sí |  | PK, FK → `permissions` | Permiso otorgado. |
| `limit_pct` | `decimal(5,2)` | Porcentaje con 2 decimales | No |  |  | Límite del permiso para ese rol (ej. descuento máximo de la cajera: 10 %). Vacío = sin límite. |
| `scope` | `varchar(40)` | Texto (letras y números), hasta 40 caracteres | No |  |  | Alcance del permiso para ese rol (ej. `against_order`: la cajera solo registra entradas contra un pedido; `workshop_only`: el jefe solo ve reportes del taller). |

##### `users`

Personal interno que inicia sesión en el sistema.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `role_id` | `bigint unsigned` | Número entero (id de `roles`) | Sí |  | FK → `roles` | Rol del usuario (Administrador, Jefe, Técnico o Cajera). |
| `cash_register_id` | `bigint unsigned` | Número entero (id de `cash_registers`) | No |  | FK → `cash_registers` | Caja asignada (solo cajeras). |
| `name` | `varchar(150)` | Texto (letras y números), hasta 150 caracteres | Sí |  |  | Nombre completo del empleado. |
| `username` | `varchar(40)` | Texto (letras y números), hasta 40 caracteres | Sí |  | Único | Nombre de usuario para iniciar sesión. No se repite. |
| `email` | `varchar(150)` | Texto con formato de correo, hasta 150 caracteres | Sí |  | Único | Correo del empleado. No se repite. |
| `email_verified_at` | `timestamp` | Fecha y hora | No |  |  | Fecha en que verificó su correo. |
| `password` | `varchar(255)` | Texto cifrado (no se puede leer a simple vista) | Sí |  |  | Contraseña cifrada con bcrypt (nunca en texto plano). |
| `phone` | `varchar(10)` | Texto de 10 dígitos numéricos | No |  |  | Teléfono del empleado, 10 dígitos. |
| `specialty` | `varchar(100)` | Texto (letras y números), hasta 100 caracteres | No |  |  | Especialidad del técnico (ej. "iPhone y microsoldadura"). |
| `shift` | `enum('morning','evening','full_day')` | Lista de opciones: morning, evening, full_day | No |  |  | Turno de trabajo. |
| `start_time` | `time` | Hora (HH:MM) | No |  |  | Hora de entrada del turno del empleado. |
| `end_time` | `time` | Hora (HH:MM) | No |  |  | Hora de salida del turno del empleado. |
| `unavailable_until` | `datetime` | Fecha y hora | No |  |  | Día en que el empleado se marcó «no disponible hoy». Si es la fecha actual, no recibe asignaciones y el chat avisa al cliente que el jefe no está disponible. |
| `unavailable_message` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Mensaje que ve el cliente en el chat cuando el jefe se marcó «no disponible hoy». |
| `max_discount_pct` | `decimal(5,2)` | Porcentaje con 2 decimales | Sí | `0.00` |  | Porcentaje máximo de descuento que puede aplicar sin autorización (0 a 20; el administrador no puede asignar más del 20 %). |
| `authorization_code` | `varchar(255)` | Texto cifrado (no se puede leer a simple vista) | No |  |  | Clave cifrada para autorizar descuentos o cancelaciones. |
| `must_change_password` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = tiene contraseña temporal y debe cambiarla al entrar. |
| `password_reset_requested_at` | `datetime` | Fecha y hora | No |  |  | Última vez que pidió recuperar su contraseña (para limitar solicitudes seguidas). |
| `chat_available` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = el jefe atiende el chat hoy; No = el portal avisa al cliente que no está disponible. |
| `failed_attempts` | `tinyint unsigned` | Número entero pequeño (0 a 255) | Sí | `0` |  | Intentos de inicio de sesión fallidos seguidos. |
| `locked_until` | `datetime` | Fecha y hora | No |  |  | Hasta cuándo está bloqueado por intentos fallidos. |
| `is_active` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = puede entrar; No = dado de baja (no se borra). |
| `last_login_at` | `timestamp` | Fecha y hora | No |  |  | Última vez que inició sesión. |
| `remember_token` | `varchar(100)` | Texto cifrado (no se puede leer a simple vista) | No |  |  | Token de Laravel para "recordarme". |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |
| `two_factor_enabled` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = al iniciar sesión se pide el código de 6 dígitos enviado por correo (MFA). |
| `security_question` | `varchar(40)` | Texto (letras y números), hasta 40 caracteres | No |  |  | Clave de la pregunta secreta elegida para recuperar la contraseña (ej. `first_pet`). |
| `security_answer_hash` | `varchar(255)` | Texto cifrado (no se puede leer a simple vista) | No |  |  | Respuesta secreta cifrada con bcrypt (se compara sin acentos ni mayúsculas). |

##### `password_reset_tokens`

Tokens de Laravel para que el personal restablezca su contraseña.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `email` | `varchar(150)` | Texto con formato de correo, hasta 150 caracteres | Sí |  | PK | Correo del empleado que pidió restablecer contraseña. |
| `token` | `varchar(255)` | Texto cifrado (no se puede leer a simple vista) | Sí |  |  | Token cifrado de restablecimiento. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `question_attempts` | `tinyint unsigned` | Número entero pequeño (0 a 255) | Sí | `0` |  | Respuestas incorrectas a la pregunta secreta en esta recuperación (a la 3.ª se anula). |

##### `personal_access_tokens`

Tokens de sesión de Laravel Sanctum (personal y clientes).

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `tokenable_type` | `varchar(255)` | Texto cifrado (no se puede leer a simple vista) | Sí |  |  | Tipo de dueño del token (User o Cliente). |
| `tokenable_id` | `bigint unsigned` | Número entero | Sí |  |  | Id del usuario o cliente dueño del token. |
| `name` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | Sí |  |  | Nombre del token (ej. "portal", "spa"). |
| `token` | `varchar(64)` | Texto cifrado (no se puede leer a simple vista) | Sí |  | Único | Token cifrado (hash SHA-256). |
| `abilities` | `text` | Texto largo | No |  |  | Permisos del token. |
| `last_used_at` | `timestamp` | Fecha y hora | No |  |  | Última vez que se usó. |
| `expires_at` | `timestamp` | Fecha y hora | No |  |  | Fecha de expiración. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |
| `ip_address` | `varchar(45)` | Dirección IP (IPv4 o IPv6) | No |  |  | Dirección IP desde la que se abrió la sesión (para «Mis sesiones»). |
| `user_agent` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Navegador y sistema del dispositivo de la sesión (para «Mis sesiones»). |

##### `two_factor_challenges`

Retos de la autenticación multifactor (MFA): cada vez que el personal inicia sesión se crea uno con el código de 6 dígitos que se manda por correo. Los vencidos se borran solos todos los días.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `user_id` | `bigint unsigned` | Número entero (id de `users`) | Sí |  | FK → `users` | Empleado que está iniciando sesión. |
| `challenge_hash` | `char(64)` | Texto cifrado (no se puede leer a simple vista) | Sí |  | Único | Identificador del reto cifrado con SHA-256 (el frontend solo conoce el original). |
| `code_hash` | `varchar(255)` | Texto cifrado (no se puede leer a simple vista) | Sí |  |  | Código de 6 dígitos cifrado con bcrypt (nunca en texto plano). |
| `device_name` | `varchar(100)` | Texto (letras y números), hasta 100 caracteres | No |  |  | Nombre del dispositivo con el que se inicia sesión. |
| `ip_address` | `varchar(45)` | Dirección IP (IPv4 o IPv6) | No |  |  | Dirección IP del intento de acceso. |
| `attempts` | `tinyint unsigned` | Número entero pequeño (0 a 255) | Sí | `0` |  | Códigos incorrectos escritos (a los 5 se anula el reto). |
| `expires_at` | `datetime` | Fecha y hora | Sí |  |  | Hasta cuándo vale el código (10 minutos). |
| `last_sent_at` | `datetime` | Fecha y hora | Sí |  |  | Última vez que se mandó el código (para reenviarlo una vez por minuto). |
| `consumed_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se usó el código correcto; después ya no sirve. |
| `created_at` | `timestamp` | Fecha y hora | Sí | Fecha y hora actual |  | Fecha y hora en que se creó el registro. |

##### `role_substitutions`

Suplencias de rol: un empleado cubre por un tiempo el rol de otro (por ejemplo, un técnico cubre al jefe en vacaciones) y recibe sus permisos mientras dure.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `user_id` | `bigint unsigned` | Número entero (id de `users`) | Sí |  | FK → `users` | Empleado que hace la suplencia. |
| `role_id` | `bigint unsigned` | Número entero (id de `roles`) | Sí |  | FK → `roles` | Rol que cubre durante la suplencia. |
| `substitutes_user_id` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Empleado al que sustituye (opcional). |
| `reason` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | Sí |  |  | Motivo de la suplencia (vacaciones, incapacidad…). |
| `starts_at` | `datetime` | Fecha y hora | Sí |  |  | Inicio de la suplencia. |
| `ends_at` | `datetime` | Fecha y hora | No |  |  | Fin de la suplencia. Vacío = hasta que se revoque. |
| `assigned_by` | `bigint unsigned` | Número entero (id de `users`) | Sí |  | FK → `users` | Administrador que asignó la suplencia. |
| `revoked_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Administrador que la terminó antes de tiempo. |
| `revoked_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se terminó antes de tiempo. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

### 2.2 Clientes y portal

Clientes finales, su acceso al portal (correo + contraseña temporal enviada por correo), sus conversaciones del chat, sus equipos y datos fiscales.

##### `customers`

Clientes finales. El **correo** es su usuario del portal.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `name` | `varchar(100)` | Texto (letras y números), hasta 100 caracteres | Sí |  |  | Nombre(s) del cliente. |
| `last_name` | `varchar(100)` | Texto (letras y números), hasta 100 caracteres | No |  |  | Apellidos del cliente. |
| `phone` | `varchar(10)` | Texto de 10 dígitos numéricos | Sí |  | Único | Teléfono del cliente, exactamente 10 dígitos. No se repite. |
| `email` | `varchar(150)` | Texto con formato de correo, hasta 150 caracteres | Sí |  | Único | Correo del cliente (obligatorio, no se repite). Es su USUARIO del portal y ahí se le envía la contraseña temporal. |
| `address` | `varchar(200)` | Texto (letras y números), hasta 200 caracteres | No |  |  | Calle y número. |
| `neighborhood` | `varchar(100)` | Texto (letras y números), hasta 100 caracteres | No |  |  | Colonia. |
| `city` | `varchar(100)` | Texto (letras y números), hasta 100 caracteres | No |  |  | Ciudad o municipio. |
| `state` | `varchar(60)` | Texto (letras y números), hasta 60 caracteres | No |  |  | Estado de la república. |
| `postal_code` | `char(5)` | Texto de 5 dígitos numéricos | No |  |  | Código postal de 5 dígitos. |
| `notes` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Observaciones internas sobre el cliente. |
| `password` | `varchar(255)` | Texto cifrado (no se puede leer a simple vista) | No |  |  | Contraseña del portal cifrada con bcrypt. Vacío = aún sin acceso. |
| `must_change_password` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = usa la contraseña temporal del correo y debe cambiarla al entrar. |
| `temporary_password_expires_at` | `datetime` | Fecha y hora | No |  |  | Hasta cuándo sirve la contraseña temporal. |
| `temporary_password_encrypted` | `varchar(512)` | Texto cifrado (no se puede leer a simple vista) | No |  |  | Contraseña temporal del portal cifrada con la llave de la aplicación, para reimprimirla en la hoja de recepción. Se borra cuando el cliente crea la suya. |
| `password_changed_at` | `datetime` | Fecha y hora | No |  |  | Cuándo puso su propia contraseña. |
| `email_verified_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se confirmó su correo (primer acceso correcto). |
| `failed_attempts` | `tinyint unsigned` | Número entero pequeño (0 a 255) | Sí | `0` |  | Intentos de acceso al portal fallidos seguidos. |
| `locked_until` | `datetime` | Fecha y hora | No |  |  | Hasta cuándo está bloqueado el acceso al portal. |
| `last_login_at` | `datetime` | Fecha y hora | No |  |  | Última vez que entró al portal. |
| `privacy_accepted_at` | `datetime` | Fecha y hora | No |  |  | Cuándo aceptó el aviso de privacidad. |
| `is_active` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = cliente activo. |
| `remember_token` | `varchar(100)` | Texto cifrado (no se puede leer a simple vista) | No |  |  | Token de Laravel para "recordarme". |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |
| `security_question` | `varchar(40)` | Texto (letras y números), hasta 40 caracteres | No |  |  | Clave de la pregunta secreta elegida para recuperar la contraseña del portal. |
| `security_answer_hash` | `varchar(255)` | Texto cifrado (no se puede leer a simple vista) | No |  |  | Respuesta secreta cifrada con bcrypt. |

##### `customer_password_reset_tokens`

Solicitudes de "Recuperar contraseña" del portal del cliente.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `customer_id` | `bigint unsigned` | Número entero (id de `customers`) | Sí |  | FK → `customers` | Cliente que pidió recuperar su contraseña. |
| `token_hash` | `varchar(255)` | Texto cifrado (no se puede leer a simple vista) | Sí |  |  | Token cifrado enviado por correo. |
| `expires_at` | `datetime` | Fecha y hora | Sí |  |  | Hasta cuándo es válido el token. |
| `used_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se usó (vacío = no usado). |
| `created_at` | `timestamp` | Fecha y hora · se calcula automáticamente | Automático | Fecha actual |  | Fecha y hora en que se creó el registro. |
| `question_attempts` | `tinyint unsigned` | Número entero pequeño (0 a 255) | Sí | `0` |  | Respuestas incorrectas a la pregunta secreta en esta recuperación (a la 3.ª se anula). |

##### `customer_tax_profiles`

Datos para facturar a un cliente (RFC, razón social, etc.).

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `customer_id` | `bigint unsigned` | Número entero (id de `customers`) | Sí |  | FK → `customers` | Cliente dueño de los datos fiscales. |
| `rfc` | `varchar(13)` | Texto (letras y números), hasta 13 caracteres | Sí |  |  | RFC (12 o 13 caracteres). |
| `business_name` | `varchar(200)` | Texto (letras y números), hasta 200 caracteres | Sí |  |  | Nombre o razón social para la factura. |
| `tax_regime` | `char(3)` | Texto de exactamente 3 caracteres | Sí |  |  | Clave del régimen fiscal del SAT (3 dígitos). |
| `postal_code` | `char(5)` | Texto de 5 dígitos numéricos | Sí |  |  | Código postal fiscal (5 dígitos). |
| `cfdi_use` | `varchar(4)` | Texto (letras y números), hasta 4 caracteres | Sí | `G03` |  | Clave de uso de CFDI del SAT (ej. G03). |
| `invoice_email` | `varchar(150)` | Texto con formato de correo, hasta 150 caracteres | No |  |  | Correo al que se envía la factura. |
| `is_default` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = son los datos que se usan por defecto. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `devices`

Dispositivos de los clientes (celulares, laptops, etc.).

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `customer_id` | `bigint unsigned` | Número entero (id de `customers`) | Sí |  | FK → `customers` | Cliente dueño del equipo. |
| `type` | `varchar(40)` | Texto (letras y números), hasta 40 caracteres | Sí |  |  | Tipo de equipo (Teléfono celular, Laptop, Tablet…). |
| `brand` | `varchar(60)` | Texto (letras y números), hasta 60 caracteres | Sí |  |  | Marca (Apple, Samsung, HP…). |
| `model` | `varchar(80)` | Texto (letras y números), hasta 80 caracteres | No |  |  | Modelo (iPhone 11, Galaxy A54…). |
| `serial_number` | `varchar(80)` | Texto (letras y números), hasta 80 caracteres | No |  |  | IMEI o número de serie. |
| `color` | `varchar(40)` | Texto (letras y números), hasta 40 caracteres | No |  |  | Color del equipo. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `conversations`

Chat del portal entre el cliente y el Jefe de Técnicos (pantallas P5 y J11).

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `customer_id` | `bigint unsigned` | Número entero (id de `customers`) | Sí |  | FK → `customers` | Cliente que inició la conversación. |
| `service_order_id` | `bigint unsigned` | Número entero (id de `service_orders`) | No |  | FK → `service_orders` | Orden sobre la que pregunta (vacío = consulta general). |
| `status` | `enum('open','closed')` | Lista de opciones: open, closed | Sí | `open` |  | Estado de la conversación. |
| `handled_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Jefe de Técnicos que atiende la conversación. |
| `awaiting_reply` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | No (0) |  | Sí = el último mensaje es del cliente y espera respuesta del jefe (bandeja J11). Lo actualiza un trigger. |
| `last_message_at` | `datetime` | Fecha y hora | No |  |  | Fecha del último mensaje; ordena la bandeja del jefe. |
| `closed_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se cerró la conversación. Se reabre sola si el cliente vuelve a escribir. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `messages`

Cada mensaje escrito en una conversación. Solo inserción: los mensajes no se editan ni se borran.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `conversation_id` | `bigint unsigned` | Número entero (id de `conversations`) | Sí |  | FK → `conversations` | Conversación a la que pertenece. |
| `sender` | `enum('customer','staff','system')` | Lista de opciones: customer, staff, system | Sí |  |  | Quién escribió el mensaje. |
| `user_id` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Empleado que respondió (vacío = lo escribió el cliente). |
| `type` | `enum('text','photo','status','notice')` | Lista de opciones: text, photo, status, notice | Sí | `text` |  | Tipo de mensaje: texto, foto, cambio de estado o aviso del sistema. |
| `body` | `text` | Texto largo | Sí |  |  | Contenido del mensaje. |
| `attachment_path` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Ruta del archivo adjunto (por ejemplo, una foto). |
| `data` | `json` | Datos estructurados (JSON) | No |  |  | Datos extra del mensaje en JSON (por ejemplo, el estado al que cambió la orden). |
| `message_template_id` | `bigint unsigned` | Número entero (id de `message_templates`) | No |  | FK → `message_templates` | Mensaje automático del que salió el texto, si es uno. |
| `read_at` | `datetime` | Fecha y hora | No |  |  | Cuándo lo leyó el destinatario (vacío = no leído). |
| `created_at` | `timestamp` | Fecha y hora · se calcula automáticamente | Automático | Fecha actual |  | Fecha y hora en que se envió. |

##### `quick_replies`

Respuestas rápidas que el jefe de técnicos usa en el chat con los clientes (J11).

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `title` | `varchar(60)` | Texto (letras y números), hasta 60 caracteres | Sí |  |  | Nombre corto de la respuesta (ej. «Pieza en camino»). |
| `body` | `varchar(500)` | Texto (letras y números), hasta 500 caracteres | Sí |  |  | Texto que se manda al cliente. |
| `sort_order` | `tinyint unsigned` | Número entero pequeño (0 a 255) | Sí | `0` |  | Orden en que aparece en la lista. |
| `is_active` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = aparece en el chat; No = oculta. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

### 2.3 Taller (órdenes de servicio)

Ciclo de vida de una reparación: recepción, asignación, diagnóstico, resguardo, entrega, abandono y garantía.

##### `order_statuses`

Catálogo de estados por los que pasa una orden de servicio.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero | Sí |  | PK | Identificador del estado (fijo, no autoincrementable). |
| `code` | `varchar(40)` | Texto (letras y números), hasta 40 caracteres | Sí |  | Único | Clave interna (recibido, en_cotizacion, en_abandono…). |
| `name` | `varchar(60)` | Texto (letras y números), hasta 60 caracteres | Sí |  |  | Nombre visible del estado. |
| `customer_message` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | Sí |  |  | Mensaje que ve el cliente en el portal. |
| `color_hex` | `char(7)` | Texto de 7 caracteres (#RRGGBB) | Sí |  |  | Color del estado en formato #RRGGBB. |
| `sort_order` | `tinyint unsigned` | Número entero pequeño (0 a 255) | Sí |  |  | Posición del estado en el flujo. |
| `portal_step` | `tinyint unsigned` | Número entero pequeño (0 a 255) | Sí | `0` |  | Paso del 1 al 6 en la barra de avance del portal (0 = no aplica). |
| `is_final` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | No (0) |  | Sí = la orden ya no puede cambiar de estado. |
| `allows_work` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = el técnico puede trabajar la orden en este estado. |
| `awaiting_pickup` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | No (0) |  | Sí = corre el tiempo de resguardo (7 días de gracia, 90 para abandono). |

##### `service_orders`

Cada equipo recibido para reparación (orden con folio único).

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `folio` | `varchar(20)` | Texto (letras y números), hasta 20 caracteres | Sí |  | Único | Folio único de la orden (letras y números, ej. SH26-00001). Se imprime y sirve para consultar. |
| `customer_id` | `bigint unsigned` | Número entero (id de `customers`) | Sí |  | FK → `customers` | Cliente que dejó el equipo. |
| `device_id` | `bigint unsigned` | Número entero (id de `devices`) | Sí |  | FK → `devices` | Equipo que se va a reparar. |
| `status_id` | `bigint unsigned` | Número entero (id de `order_statuses`) | Sí | `1` | FK → `order_statuses` | Estado actual de la orden. |
| `priority` | `enum('low','normal','high','urgent')` | Lista de opciones: low, normal, high, urgent | Sí | `normal` |  | Prioridad de la reparación. |
| `cash_register_id` | `bigint unsigned` | Número entero (id de `cash_registers`) | No |  | FK → `cash_registers` | Caja donde se recibió el equipo. |
| `reported_issue` | `text` | Texto largo | Sí |  |  | Falla que describe el cliente. |
| `received_accessories` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Accesorios que dejó el cliente (funda, cargador…). |
| `intake_checklist` | `json` | Datos estructurados (JSON) | No |  |  | Revisión física al recibir (enciende, pantalla, cámara…). |
| `physical_condition` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Descripción del estado físico al recibir (golpes, rayones). |
| `device_pin` | `varchar(512)` | Texto cifrado (no se puede leer a simple vista) | No |  |  | PIN o patrón de desbloqueo, CIFRADO. No se imprime. |
| `diagnosis` | `text` | Texto largo | No |  |  | Diagnóstico del técnico. |
| `failure_cause` | `varchar(120)` | Texto (letras y números), hasta 120 caracteres | No |  |  | Causa de la falla (golpe, humedad, desgaste…). |
| `labor_level_id` | `bigint unsigned` | Número entero (id de `labor_levels`) | No |  | FK → `labor_levels` | Nivel de mano de obra que eligió el técnico al diagnosticar. |
| `estimated_minutes` | `smallint unsigned` | Número entero | No |  |  | Tiempo estimado de reparación en minutos. |
| `diagnosis_due_at` | `datetime` | Fecha y hora | No |  |  | Fecha y hora límite para tener el diagnóstico (el tablero del jefe marca las atrasadas). |
| `is_paused` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | No (0) |  | Sí = el técnico pausó la orden. |
| `pause_reason` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Por qué se pausó. |
| `no_repair_reason` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Por qué el equipo no tiene reparación. |
| `charge_inspection` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = si no se repara o el cliente rechaza el presupuesto, se cobra la revisión. |
| `estimated_cost` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Costo aproximado que se le dijo al cliente al recibir (dinero). |
| `deposit` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Dinero que dejó el cliente al recibir. Se cobra como venta. |
| `labor_cost` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Costo final de mano de obra (dinero). |
| `parts_cost` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Costo final de refacciones (dinero). |
| `total` | `decimal(10,2)` | Dinero (pesos con 2 decimales) · se calcula automáticamente | Automático |  |  | Mano de obra + refacciones. Se calcula solo. |
| `is_paid` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | No (0) |  | Sí = la orden ya se liquidó. |
| `received_by` | `bigint unsigned` | Número entero (id de `users`) | Sí |  | FK → `users` | Cajera que recibió el equipo. |
| `assigned_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Jefe de Técnicos que asignó la orden. |
| `technician_id` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Técnico responsable de la reparación. |
| `updated_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Último usuario que modificó la orden. |
| `location` | `enum('workshop','counter','storage')` | Lista de opciones: workshop, counter, storage | Sí | `workshop` |  | Dónde está físicamente el equipo. |
| `sent_to_storage_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se envió a bodega. |
| `storage_fee_waived` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | No (0) |  | Sí = se perdonó el cobro de almacenaje. |
| `waived_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Quién perdonó el almacenaje. |
| `waiver_reason` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Por qué se perdonó el almacenaje. |
| `storage_fee` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Almacenaje cobrado al entregar (dinero). $10 por día después de 7 días de gracia (configurable). |
| `warranty_days` | `smallint unsigned` | Número entero | Sí | `30` |  | Días de garantía de la reparación. |
| `warranty_until` | `date` | Fecha (AAAA-MM-DD) | No |  |  | Fecha en que termina la garantía (se calcula al entregar). |
| `delivered_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Cajera que entregó el equipo. |
| `picked_up_by_name` | `varchar(150)` | Texto (letras y números), hasta 150 caracteres | No |  |  | Nombre de quien recogió el equipo (si no fue el cliente). |
| `picked_up_id_type` | `enum('ine','passport','drivers_license','other')` | Lista de opciones: ine, passport, drivers_license, other | No |  |  | Identificación que mostró quien recogió el equipo: INE, pasaporte, licencia u otra. |
| `picked_up_id_number` | `varchar(60)` | Texto (letras y números), hasta 60 caracteres | No |  |  | Identificación de quien recogió. |
| `picked_up_relationship` | `varchar(40)` | Texto (letras y números), hasta 40 caracteres | No |  |  | Parentesco con el cliente de quien recogió. |
| `has_power_of_attorney` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | No (0) |  | Sí = quien recogió trajo carta poder del dueño. |
| `has_owner_id_copy` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | No (0) |  | Sí = quien recogió trajo copia de la identificación del dueño. |
| `delivery_checklist` | `json` | Datos estructurados (JSON) | No |  |  | Lista de revisión al entregar el equipo, en JSON (ej. enciende, pantalla, carga). |
| `rating` | `tinyint unsigned` | Número entero pequeño (0 a 255) | No |  |  | Calificación del servicio, de 1 a 5 estrellas. |
| `rating_tags` | `json` | Datos estructurados (JSON) | No |  |  | Etiquetas que eligió el cliente al calificar el servicio, en JSON. |
| `rating_comment` | `varchar(500)` | Texto (letras y números), hasta 500 caracteres | No |  |  | Comentario del cliente al calificar. |
| `rated_at` | `datetime` | Fecha y hora | No |  |  | Cuándo calificó. |
| `promised_date` | `date` | Fecha (AAAA-MM-DD) | No |  |  | Fecha prometida de entrega. |
| `assigned_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se asignó a un técnico. |
| `quoting_started_at` | `datetime` | Fecha y hora | No |  |  | Cuándo entró a "En Cotización". |
| `approved_at` | `datetime` | Fecha y hora | No |  |  | Cuándo el cliente aprobó el presupuesto. |
| `ready_at` | `datetime` | Fecha y hora | No |  |  | Cuándo quedó lista para recoger. Desde aquí corre el resguardo. |
| `delivered_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se entregó al cliente. |
| `abandoned_at` | `datetime` | Fecha y hora | No |  |  | Cuándo pasó a "En Abandono" (90 días sin recoger). |
| `disposed_at` | `datetime` | Fecha y hora | No |  |  | Cuándo salió físicamente a desecho electrónico. |
| `disposed_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Quién registró el desecho. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `order_time_logs`

Cronómetro de trabajo del técnico por orden, incluidas las pausas.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `service_order_id` | `bigint unsigned` | Número entero (id de `service_orders`) | Sí |  | FK → `service_orders` | Orden que se está trabajando. |
| `technician_id` | `bigint unsigned` | Número entero (id de `users`) | Sí |  | FK → `users` | Técnico que trabaja. |
| `type` | `enum('diagnosis','repair','warranty')` | Lista de opciones: diagnosis, repair, warranty | Sí | `repair` |  | Tipo de trabajo. |
| `starts_at` | `datetime` | Fecha y hora | Sí |  |  | Cuándo empezó a trabajar. |
| `ends_at` | `datetime` | Fecha y hora | No |  |  | Cuándo terminó o pausó (vacío = en curso). |
| `pause_reason` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Por qué pausó. |
| `minutes` | `int` | Número entero · se calcula automáticamente | Automático |  |  | Minutos trabajados. Se calcula solo. |
| `active_technician_id` | `bigint unsigned` | Número entero · se calcula automáticamente | Automático |  | Único | Columna técnica que impide que un técnico tenga dos órdenes en curso. Se calcula sola. |

##### `order_files`

Fotos y archivos de una orden (recepción, evidencia, entrega, garantía).

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `service_order_id` | `bigint unsigned` | Número entero (id de `service_orders`) | Sí |  | FK → `service_orders` | Orden a la que pertenece el archivo. |
| `quote_id` | `bigint unsigned` | Número entero (id de `quotes`) | No |  | FK → `quotes` | Presupuesto relacionado (opcional). |
| `warranty_id` | `bigint unsigned` | Número entero (id de `warranties`) | No |  | FK → `warranties` | Garantía relacionada (opcional). |
| `user_id` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Quién subió el archivo. |
| `type` | `enum('intake','diagnosis','evidence','quote','progress','delivery','power_of_attorney','warranty')` | Lista de opciones: intake, diagnosis, evidence, quote, progress, delivery, power_of_attorney, warranty | Sí |  |  | Momento en que se tomó la foto. |
| `path` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | Sí |  |  | Ruta del archivo en el servidor. |
| `original_name` | `varchar(150)` | Texto (letras y números), hasta 150 caracteres | No |  |  | Nombre original del archivo. |
| `mime_type` | `varchar(80)` | Texto (letras y números), hasta 80 caracteres | No |  |  | Tipo de archivo (image/jpeg, application/pdf…). |
| `size_bytes` | `int unsigned` | Número entero | No |  |  | Tamaño del archivo en bytes. |
| `visible_to_customer` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | No (0) |  | Sí = el cliente lo ve en el portal. |
| `created_at` | `timestamp` | Fecha y hora · se calcula automáticamente | Automático | Fecha actual |  | Fecha y hora en que se creó el registro. |

##### `order_logs`

Historial inmutable de todo lo que pasa en una orden. Alimenta la línea de tiempo del portal.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `service_order_id` | `bigint unsigned` | Número entero (id de `service_orders`) | Sí |  | FK → `service_orders` | Orden a la que pertenece el evento. |
| `user_id` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Quién hizo la acción (vacío = cliente o sistema). |
| `type` | `enum('intake','status_change','assignment','diagnosis','quoting','note','part','quote','customer_response','info_request','pause','resume','warranty','storage','abandonment','disposal','delivery','rating','email')` | Lista de opciones: intake, status_change, assignment, diagnosis, quoting, note, part, quote, customer_response, info_request, pause, resume, warranty, storage, abandonment, disposal, delivery, rating, email | Sí |  |  | Tipo de evento. |
| `previous_status_id` | `bigint unsigned` | Número entero (id de `order_statuses`) | No |  | FK → `order_statuses` | Estado antes del cambio. |
| `new_status_id` | `bigint unsigned` | Número entero (id de `order_statuses`) | No |  | FK → `order_statuses` | Estado después del cambio. |
| `quote_id` | `bigint unsigned` | Número entero (id de `quotes`) | No |  | FK → `quotes` | Presupuesto relacionado (opcional). |
| `warranty_id` | `bigint unsigned` | Número entero (id de `warranties`) | No |  | FK → `warranties` | Garantía relacionada (opcional). |
| `description` | `text` | Texto largo | Sí |  |  | Descripción del evento. |
| `visible_to_customer` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | No (0) |  | Sí = aparece en la línea de tiempo del portal. |
| `created_at` | `timestamp` | Fecha y hora · se calcula automáticamente | Automático | Fecha actual |  | Fecha y hora en que se creó el registro. |

##### `warranties`

Solicitudes de garantía sobre una reparación ya entregada.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `folio` | `varchar(20)` | Texto (letras y números), hasta 20 caracteres | Sí |  | Único | Folio único de la garantía (letras y números). |
| `service_order_id` | `bigint unsigned` | Número entero (id de `service_orders`) | Sí |  | FK → `service_orders` | Orden original que se reclama. |
| `customer_id` | `bigint unsigned` | Número entero (id de `customers`) | Sí |  | FK → `customers` | Cliente que reclama. |
| `request_channel` | `enum('portal','counter')` | Lista de opciones: portal, counter | Sí |  |  | Por dónde se solicitó. |
| `customer_reason` | `text` | Texto largo | Sí |  |  | Qué falla reporta el cliente. |
| `status` | `enum('requested','received','in_review','awaiting_ruling','approved','rejected','in_repair','finished','delivered','cancelled')` | Lista de opciones: requested, received, in_review, awaiting_ruling, approved, rejected, in_repair, finished, delivered, cancelled | Sí | `requested` |  | Estado de la garantía. |
| `received_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Cajera que recibió el equipo en garantía. |
| `received_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se recibió. |
| `technician_id` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Técnico que revisa. |
| `technician_review` | `text` | Texto largo | No |  |  | Resultado de la revisión del técnico. |
| `ruling` | `enum('covered','not_covered','covered_with_cost')` | Lista de opciones: covered, not_covered, covered_with_cost | No |  |  | Decisión del Jefe de Técnicos. |
| `ruled_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Jefe que dictaminó. |
| `ruled_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se dictaminó. |
| `ruling_reason` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Explicación del dictamen. |
| `extra_cost` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Costo adicional si la garantía no cubre todo (dinero). |
| `extra_cost_accepted` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | No |  |  | Sí/No aceptó el costo extra (vacío = sin respuesta). |
| `answered_at` | `datetime` | Fecha y hora | No |  |  | Cuándo respondió el cliente. |
| `finished_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se terminó la reparación en garantía. |
| `delivered_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Quién entregó el equipo. |
| `delivered_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se entregó. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

### 2.4 Cotización y presupuestos

El técnico propone, el Jefe de Técnicos cotiza y el cliente aprueba o rechaza.

##### `quotes`

Cotizaciones: las que propone el técnico, las que cotiza el jefe y las de mostrador.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `folio` | `varchar(20)` | Texto (letras y números), hasta 20 caracteres | Sí |  | Único | Folio único del presupuesto (letras y números, ej. P26-00001). |
| `service_order_id` | `bigint unsigned` | Número entero (id de `service_orders`) | No |  | FK → `service_orders` | Orden cotizada (vacío = presupuesto de mostrador). |
| `customer_id` | `bigint unsigned` | Número entero (id de `customers`) | No |  | FK → `customers` | Cliente al que se le cotiza. |
| `type` | `enum('initial','additional','counter')` | Lista de opciones: initial, additional, counter | Sí | `initial` |  | initial = primera cotización; additional = daño nuevo encontrado durante la reparación; counter = cotización en mostrador sin orden. |
| `device_description` | `varchar(150)` | Texto (letras y números), hasta 150 caracteres | No |  |  | Equipo cotizado (solo presupuestos de mostrador). |
| `technician_id` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Técnico que propuso la reparación. |
| `diagnosis` | `text` | Texto largo | No |  |  | Diagnóstico que justifica el presupuesto. |
| `failure_cause` | `varchar(120)` | Texto (letras y números), hasta 120 caracteres | No |  |  | Causa de la falla. |
| `labor_level_id` | `bigint unsigned` | Número entero (id de `labor_levels`) | No |  | FK → `labor_levels` | Nivel de mano de obra del presupuesto. |
| `estimated_minutes` | `smallint unsigned` | Número entero | No |  |  | Tiempo estimado en minutos. |
| `is_urgent` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | No (0) |  | Sí = la orden es urgente y aparece primero en «Por cotizar» (J3). |
| `technician_notes` | `text` | Texto largo | No |  |  | Nota interna del técnico para el jefe. |
| `customer_note` | `text` | Texto largo | No |  |  | Explicación que ve el cliente al aprobar. |
| `return_reason` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Motivo por el que el jefe regresó el diagnóstico al técnico para revisarlo. |
| `estimated_delivery_date` | `date` | Fecha (AAAA-MM-DD) | No |  |  | Fecha estimada de entrega que se le muestra al cliente en el presupuesto. |
| `labor_amount` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Total de mano de obra (dinero). |
| `parts_amount` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Total de refacciones (dinero). |
| `discount` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Descuento aplicado (dinero). |
| `total` | `decimal(10,2)` | Dinero (pesos con 2 decimales) · se calcula automáticamente | Automático |  |  | Mano de obra + refacciones − descuento. Se calcula solo. |
| `warranty_days` | `smallint unsigned` | Número entero | Sí | `30` |  | Días de garantía ofrecidos. |
| `valid_until` | `date` | Fecha (AAAA-MM-DD) | No |  |  | Fecha hasta la que es válido el precio. |
| `status` | `enum('to_quote','returned_to_technician','pending','approved','rejected','expired','cancelled')` | Lista de opciones: to_quote, returned_to_technician, pending, approved, rejected, expired, cancelled | Sí | `to_quote` |  | to_quote = espera al jefe; returned_to_technician = el jefe lo regresó para revisar el diagnóstico; pending = espera al cliente; approved / rejected / expired / cancelled. |
| `quoted_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Jefe de Técnicos que puso los precios. |
| `quoted_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se cotizó. |
| `sent_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se envió al cliente. |
| `response_channel` | `enum('portal','counter','phone')` | Lista de opciones: portal, counter, phone | No |  |  | Por dónde respondió el cliente. |
| `answered_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Cajera que registró la respuesta (si fue en mostrador o por teléfono). |
| `customer_comment` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Comentario del cliente al responder. |
| `answered_at` | `datetime` | Fecha y hora | No |  |  | Cuándo respondió. |
| `response_ip` | `varchar(45)` | Texto (letras y números), hasta 45 caracteres | No |  |  | Dirección IP desde la que respondió en el portal. |
| `created_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Usuario que creó el presupuesto. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `quote_items`

Renglones de un presupuesto (refacciones y mano de obra).

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `quote_id` | `bigint unsigned` | Número entero (id de `quotes`) | Sí |  | FK → `quotes` | Presupuesto al que pertenece el renglón. |
| `type` | `enum('part','labor','service','other')` | Lista de opciones: part, labor, service, other | Sí | `part` |  | Tipo de concepto. |
| `product_id` | `bigint unsigned` | Número entero (id de `products`) | No |  | FK → `products` | Refacción del catálogo (si aplica). |
| `service_id` | `bigint unsigned` | Número entero (id de `services`) | No |  | FK → `services` | Servicio del tabulador (si aplica). |
| `labor_level_id` | `bigint unsigned` | Número entero (id de `labor_levels`) | No |  | FK → `labor_levels` | Nivel de mano de obra del renglón, si es de mano de obra. |
| `concept` | `varchar(150)` | Texto (letras y números), hasta 150 caracteres | Sí |  |  | Descripción del concepto. |
| `quantity` | `int` | Número entero | Sí | `1` |  | Cantidad (mayor a 0). |
| `unit_cost` | `decimal(10,2)` | Dinero en pesos con 2 decimales | No |  |  | Costo de compra de la refacción al cotizar (solo lo ve quien tiene permiso de ver costos). |
| `unit_price` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Precio por unidad (dinero). |
| `subtotal` | `decimal(10,2)` | Dinero (pesos con 2 decimales) · se calcula automáticamente | Automático |  |  | Cantidad × precio. Se calcula solo. |
| `out_of_stock` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | No (0) |  | Sí = no hay existencia y hay que pedirla. |
| `expected_arrival_date` | `date` | Fecha (AAAA-MM-DD) | No |  |  | Fecha en que se espera la refacción si no hay existencias. |
| `origin` | `enum('technician','head_technician')` | Lista de opciones: technician, head_technician | Sí | `technician` |  | Quién agregó el renglón (técnico o jefe). |

##### `services`

Tabulador de mano de obra y servicios con su precio.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `name` | `varchar(120)` | Texto (letras y números), hasta 120 caracteres | Sí |  | Único | Nombre del servicio (no se repite). |
| `description` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Descripción del servicio. |
| `device_type` | `varchar(40)` | Texto (letras y números), hasta 40 caracteres | No |  |  | Tipo de equipo al que aplica. |
| `price` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Precio del servicio (dinero). |
| `estimated_minutes` | `smallint unsigned` | Número entero | No |  |  | Duración estimada en minutos. |
| `is_active` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = se puede usar. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `labor_levels`

Niveles de mano de obra (AD9.4 / J9.1): el técnico elige uno al diagnosticar y su precio entra al presupuesto.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `name` | `varchar(40)` | Texto (letras y números), hasta 40 caracteres | Sí |  | Único | Nombre del nivel (Adicional, Bajo, Medio, Alto, Revisión). |
| `typical_time` | `varchar(40)` | Texto (letras y números), hasta 40 caracteres | No |  |  | Tiempo típico del trabajo (ej. «Hasta 1 h 30»). |
| `examples` | `varchar(200)` | Texto (letras y números), hasta 200 caracteres | No |  |  | Ejemplos de reparaciones de ese nivel. |
| `price` | `decimal(10,2)` | Dinero en pesos con 2 decimales | Sí | `0.00` |  | Precio de la mano de obra de ese nivel. |
| `is_inspection` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | No (0) |  | Sí = es el costo de revisión que se cobra si no hay reparación. |
| `sort_order` | `tinyint unsigned` | Número entero pequeño (0 a 255) | Sí | `0` |  | Orden en que aparece en la lista. |
| `is_active` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = se puede elegir; No = ya no se usa. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

### 2.5 Inventario, refacciones y compras

Catálogo de productos, existencias, movimientos de stock, refacciones usadas en taller y compras a proveedores.

##### `categories`

Agrupación de productos (Pantallas, Baterías, Audífonos…).

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `name` | `varchar(80)` | Texto (letras y números), hasta 80 caracteres | Sí |  | Único | Nombre de la categoría (no se repite). |
| `type` | `enum('part','accessory','consumable')` | Lista de opciones: part, accessory, consumable | Sí |  |  | Tipo de producto de la categoría. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `products`

Catálogo maestro de refacciones, accesorios y consumibles con su existencia.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `category_id` | `bigint unsigned` | Número entero (id de `categories`) | Sí |  | FK → `categories` | Categoría del producto. |
| `supplier_id` | `bigint unsigned` | Número entero (id de `suppliers`) | No |  | FK → `suppliers` | Proveedor habitual. |
| `sku` | `varchar(40)` | Texto (letras y números), hasta 40 caracteres | Sí |  | Único | Código interno del producto, letras y números (no se repite). |
| `barcode` | `varchar(50)` | Texto (letras y números), hasta 50 caracteres | No |  | Único | Código de barras para escanear en el POS (no se repite). |
| `name` | `varchar(150)` | Texto (letras y números), hasta 150 caracteres | Sí |  |  | Nombre del producto. |
| `brand` | `varchar(60)` | Texto (letras y números), hasta 60 caracteres | No |  |  | Marca del producto. |
| `compatible_with` | `varchar(150)` | Texto (letras y números), hasta 150 caracteres | No |  |  | Modelos compatibles. |
| `description` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Descripción del producto. |
| `type` | `enum('part','accessory','consumable')` | Lista de opciones: part, accessory, consumable | Sí |  |  | part = refacción para el taller; accessory = accesorio de venta; consumable = insumo. |
| `sellable_at_counter` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = aparece en el punto de venta. |
| `usable_in_workshop` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = el técnico lo puede usar en reparaciones. |
| `purchase_price` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Costo de compra sin IVA (dinero). |
| `sale_price` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Precio al público con IVA (dinero). |
| `stock` | `int` | Número entero | Sí | `0` |  | Existencia actual. Nunca puede ser negativa. |
| `min_stock` | `int` | Número entero | Sí | `0` |  | Existencia mínima; por debajo aparece alerta de stock bajo. |
| `location` | `varchar(40)` | Texto (letras y números), hasta 40 caracteres | No |  |  | Dónde está guardado (anaquel, cajón). |
| `image_path` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Ruta de la imagen del producto. |
| `is_active` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = producto vigente. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `price_histories`

Registro de cada cambio de costo o precio de un producto.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `product_id` | `bigint unsigned` | Número entero (id de `products`) | Sí |  | FK → `products` | Producto que cambió de precio. |
| `user_id` | `bigint unsigned` | Número entero (id de `users`) | Sí |  | FK → `users` | Quién hizo el cambio. |
| `old_purchase_price` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí |  |  | Costo anterior (dinero). |
| `new_purchase_price` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí |  |  | Costo nuevo (dinero). |
| `old_sale_price` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí |  |  | Precio de venta anterior (dinero). |
| `new_sale_price` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí |  |  | Precio de venta nuevo (dinero). |
| `reason` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Motivo del cambio. |
| `batch_uuid` | `char(36)` | Texto de exactamente 36 caracteres | No |  |  | Identificador común cuando se ajustan varios precios a la vez. |
| `created_at` | `timestamp` | Fecha y hora · se calcula automáticamente | Automático | Fecha actual |  | Fecha y hora en que se creó el registro. |

##### `inventory_movements`

Kardex: cada entrada o salida de stock con existencia antes y después.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `product_id` | `bigint unsigned` | Número entero (id de `products`) | Sí |  | FK → `products` | Producto que se movió. |
| `user_id` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Quién hizo el movimiento. |
| `authorized_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Quién autorizó (en ajustes). |
| `type` | `enum('stock_in','adjustment','sale','workshop_use','sale_return','workshop_return','supplier_return','shrinkage')` | Lista de opciones: stock_in, adjustment, sale, workshop_use, sale_return, workshop_return, supplier_return, shrinkage | Sí |  |  | Motivo del movimiento. |
| `quantity` | `int` | Número entero | Sí |  |  | Unidades: positivo = entra, negativo = sale. |
| `previous_stock` | `int` | Número entero | Sí |  |  | Existencia antes del movimiento. |
| `new_stock` | `int` | Número entero | Sí |  |  | Existencia después del movimiento (anterior + cantidad). |
| `sale_id` | `bigint unsigned` | Número entero (id de `sales`) | No |  | FK → `sales` | Venta que lo originó (si aplica). |
| `service_order_id` | `bigint unsigned` | Número entero (id de `service_orders`) | No |  | FK → `service_orders` | Orden de taller que lo originó (si aplica). |
| `purchase_id` | `bigint unsigned` | Número entero (id de `purchases`) | No |  | FK → `purchases` | Compra que lo originó (si aplica). |
| `sale_return_id` | `bigint unsigned` | Número entero (id de `sale_returns`) | No |  | FK → `sale_returns` | Devolución que lo originó (si aplica). |
| `reference_id` | `bigint unsigned` | Número entero | No |  |  | Id del renglón que lo originó. |
| `reason` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Explicación del movimiento. |
| `created_at` | `timestamp` | Fecha y hora · se calcula automáticamente | Automático | Fecha actual |  | Fecha y hora en que se creó el registro. |

##### `order_parts`

Refacciones usadas en una orden de servicio (descuentan stock).

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `service_order_id` | `bigint unsigned` | Número entero (id de `service_orders`) | Sí |  | FK → `service_orders` | Orden donde se usó la pieza. |
| `product_id` | `bigint unsigned` | Número entero (id de `products`) | Sí |  | FK → `products` | Pieza usada. |
| `technician_id` | `bigint unsigned` | Número entero (id de `users`) | Sí |  | FK → `users` | Técnico que la usó. |
| `part_request_id` | `bigint unsigned` | Número entero (id de `part_requests`) | No |  | FK → `part_requests` | Solicitud de refacción relacionada (opcional). |
| `status` | `enum('reserved','used','cancelled')` | Lista de opciones: reserved, used, cancelled | Sí | `used` |  | Estado de la pieza en la orden: reservada, usada o cancelada. |
| `quantity` | `int` | Número entero | Sí | `1` |  | Unidades usadas (mayor a 0). |
| `returned_quantity` | `int` | Número entero | Sí | `0` |  | Unidades regresadas al almacén. |
| `unit_price` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | No |  |  | Precio cobrado por unidad (dinero). |
| `subtotal` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Cantidad × precio (dinero). |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `part_requests`

Piezas que el técnico le pide al Jefe de Técnicos.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `folio` | `varchar(20)` | Texto (letras y números), hasta 20 caracteres | Sí |  | Único | Folio único de la solicitud (letras y números). |
| `service_order_id` | `bigint unsigned` | Número entero (id de `service_orders`) | No |  | FK → `service_orders` | Orden para la que se pide la pieza. |
| `technician_id` | `bigint unsigned` | Número entero (id de `users`) | Sí |  | FK → `users` | Técnico que la pide. |
| `product_id` | `bigint unsigned` | Número entero (id de `products`) | No |  | FK → `products` | Producto del catálogo (vacío si no existe aún). |
| `description` | `varchar(200)` | Texto (letras y números), hasta 200 caracteres | Sí |  |  | Descripción de la pieza pedida. |
| `quantity` | `int` | Número entero | Sí | `1` |  | Unidades pedidas. |
| `urgency` | `enum('normal','urgent')` | Lista de opciones: normal, urgent | Sí | `normal` |  | Urgencia de la solicitud. |
| `status` | `enum('pending','approved','delivered','ordered','rejected','cancelled')` | Lista de opciones: pending, approved, delivered, ordered, rejected, cancelled | Sí | `pending` |  | Estado de la solicitud. |
| `handled_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Jefe que la atendió. |
| `handled_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se atendió. |
| `purchase_order_id` | `bigint unsigned` | Número entero (id de `purchase_orders`) | No |  | FK → `purchase_orders` | Pedido a proveedor generado (si aplica). |
| `rejection_reason` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Por qué se rechazó. |
| `notes` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Notas adicionales. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `part_returns`

Piezas que el técnico regresa al almacén.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `order_part_id` | `bigint unsigned` | Número entero (id de `order_parts`) | Sí |  | FK → `order_parts` | Pieza usada que se devuelve. |
| `technician_id` | `bigint unsigned` | Número entero (id de `users`) | Sí |  | FK → `users` | Técnico que la devuelve. |
| `quantity` | `int` | Número entero | Sí | `1` |  | Unidades devueltas. |
| `reason` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | Sí |  |  | Motivo de la devolución. |
| `status` | `enum('pending','received','rejected')` | Lista de opciones: pending, received, rejected | Sí | `pending` |  | Estado de la devolución. |
| `condition` | `enum('new','open','damaged')` | Lista de opciones: new, open, damaged | No |  |  | Estado en que regresó la pieza: nueva, abierta o dañada (una dañada no vuelve al stock). |
| `returns_to_stock` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = vuelve al inventario; No = pieza dañada (merma). |
| `received_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Quién recibió la pieza. |
| `received_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se recibió. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `suppliers`

Empresas a las que se les compra mercancía.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `name` | `varchar(150)` | Texto (letras y números), hasta 150 caracteres | Sí |  | Único | Nombre del proveedor (no se repite). |
| `contact_name` | `varchar(120)` | Texto (letras y números), hasta 120 caracteres | No |  |  | Persona de contacto. |
| `phone` | `varchar(15)` | Texto (letras y números), hasta 15 caracteres | No |  |  | Teléfono del proveedor. |
| `email` | `varchar(150)` | Texto con formato de correo, hasta 150 caracteres | No |  |  | Correo del proveedor. |
| `rfc` | `varchar(13)` | Texto (letras y números), hasta 13 caracteres | No |  |  | RFC del proveedor. |
| `credit_days` | `smallint unsigned` | Número entero | Sí | `0` |  | Días de crédito que da el proveedor. |
| `notes` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Notas. |
| `is_active` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = proveedor vigente. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `purchase_orders`

Pedidos de mercancía hechos a un proveedor.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `folio` | `varchar(20)` | Texto (letras y números), hasta 20 caracteres | Sí |  | Único | Folio único del pedido (letras y números). |
| `supplier_id` | `bigint unsigned` | Número entero (id de `suppliers`) | Sí |  | FK → `suppliers` | Proveedor al que se pide. |
| `requested_by` | `bigint unsigned` | Número entero (id de `users`) | Sí |  | FK → `users` | Jefe que hizo el pedido. |
| `status` | `enum('draft','sent','partially_received','received','cancelled')` | Lista de opciones: draft, sent, partially_received, received, cancelled | Sí | `draft` |  | Estado del pedido. |
| `expected_date` | `date` | Fecha (AAAA-MM-DD) | No |  |  | Fecha estimada de llegada. |
| `payment_terms` | `enum('cash_on_delivery','transfer','credit')` | Lista de opciones: cash_on_delivery, transfer, credit | Sí | `cash_on_delivery` |  | Forma de pago acordada: contra entrega, transferencia o crédito. |
| `receive_at` | `enum('counter','workshop')` | Lista de opciones: counter, workshop | Sí | `counter` |  | Dónde se recibe la mercancía: mostrador o taller. |
| `notify_technician` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = al llegar la pieza se avisa al técnico que la pidió. |
| `supplier_folio` | `varchar(40)` | Texto (letras y números), hasta 40 caracteres | No |  |  | Folio o número de pedido que dio el proveedor. |
| `estimated_total` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Total estimado del pedido (dinero). |
| `notes` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Notas. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `purchase_order_items`

Renglones de un pedido a proveedor.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `purchase_order_id` | `bigint unsigned` | Número entero (id de `purchase_orders`) | Sí |  | FK → `purchase_orders` | Pedido al que pertenece. |
| `product_id` | `bigint unsigned` | Número entero (id de `products`) | No |  | FK → `products` | Producto pedido (si existe en catálogo). |
| `service_order_id` | `bigint unsigned` | Número entero (id de `service_orders`) | No |  | FK → `service_orders` | Orden de servicio para la que se pidió la pieza. |
| `part_request_id` | `bigint unsigned` | Número entero (id de `part_requests`) | No |  | FK → `part_requests` | Solicitud de refacción del técnico que originó el renglón. |
| `description` | `varchar(200)` | Texto (letras y números), hasta 200 caracteres | Sí |  |  | Descripción del producto pedido. |
| `quantity` | `int` | Número entero | Sí |  |  | Unidades pedidas. |
| `received_quantity` | `int` | Número entero | Sí | `0` |  | Unidades que ya llegaron. |
| `unit_cost` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Costo por unidad (dinero). |
| `subtotal` | `decimal(10,2)` | Dinero (pesos con 2 decimales) · se calcula automáticamente | Automático |  |  | Cantidad × costo. Se calcula solo. |

##### `purchases`

Entradas de mercancía con factura del proveedor (cuentas por pagar).

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `folio` | `varchar(20)` | Texto (letras y números), hasta 20 caracteres | Sí |  | Único | Folio único de la compra (letras y números). |
| `supplier_id` | `bigint unsigned` | Número entero (id de `suppliers`) | Sí |  | FK → `suppliers` | Proveedor que vendió. |
| `purchase_order_id` | `bigint unsigned` | Número entero (id de `purchase_orders`) | No |  | FK → `purchase_orders` | Pedido que se está recibiendo (si aplica). |
| `user_id` | `bigint unsigned` | Número entero (id de `users`) | Sí |  | FK → `users` | Quién registró la entrada. |
| `supplier_invoice` | `varchar(40)` | Texto (letras y números), hasta 40 caracteres | No |  |  | Número de factura del proveedor. |
| `purchase_date` | `date` | Fecha (AAAA-MM-DD) | Sí |  |  | Fecha de la compra. |
| `subtotal` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Subtotal sin IVA (dinero). |
| `tax` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | IVA de la compra (dinero). |
| `total` | `decimal(10,2)` | Dinero (pesos con 2 decimales) · se calcula automáticamente | Automático |  |  | Subtotal + IVA. Se calcula solo. |
| `amount_paid` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Cuánto se ha pagado (dinero). |
| `payment_status` | `enum('pending','partial','paid')` | Lista de opciones: pending, partial, paid | Sí | `pending` |  | Situación del pago. |
| `due_date` | `date` | Fecha (AAAA-MM-DD) | No |  |  | Fecha límite de pago. |
| `notes` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Notas. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `purchase_items`

Productos y cantidades de cada compra.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `purchase_id` | `bigint unsigned` | Número entero (id de `purchases`) | Sí |  | FK → `purchases` | Compra a la que pertenece. |
| `product_id` | `bigint unsigned` | Número entero (id de `products`) | Sí |  | FK → `products` | Producto comprado. |
| `quantity` | `int` | Número entero | Sí |  |  | Unidades compradas. |
| `unit_cost` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí |  |  | Costo por unidad (dinero). |
| `subtotal` | `decimal(10,2)` | Dinero (pesos con 2 decimales) · se calcula automáticamente | Automático |  |  | Cantidad × costo. Se calcula solo. |

##### `supplier_payments`

Pagos realizados a proveedores por una compra.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `purchase_id` | `bigint unsigned` | Número entero (id de `purchases`) | Sí |  | FK → `purchases` | Compra que se paga. |
| `user_id` | `bigint unsigned` | Número entero (id de `users`) | Sí |  | FK → `users` | Quién registró el pago. |
| `cash_shift_id` | `bigint unsigned` | Número entero (id de `cash_shifts`) | No |  | FK → `cash_shifts` | Turno de caja, si se pagó con efectivo de la caja. |
| `method` | `enum('cash','card','transfer')` | Lista de opciones: cash, card, transfer | Sí |  |  | Forma de pago. |
| `amount` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí |  |  | Monto pagado (dinero). |
| `reference` | `varchar(80)` | Texto (letras y números), hasta 80 caracteres | No |  |  | Referencia de la transferencia o comprobante. |
| `created_at` | `timestamp` | Fecha y hora · se calcula automáticamente | Automático | Fecha actual |  | Fecha y hora en que se creó el registro. |

### 2.6 Caja y punto de venta

Turnos de caja, ventas de mostrador, cobro de reparaciones, pagos, devoluciones y facturas.

##### `cash_registers`

Cajas registradoras físicas de la sucursal.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `name` | `varchar(40)` | Texto (letras y números), hasta 40 caracteres | Sí |  | Único | Nombre de la caja (Caja 01…). |
| `location` | `varchar(80)` | Texto (letras y números), hasta 80 caracteres | No |  |  | Dónde está la caja (ej. «Mostrador principal»). |
| `default_opening_amount` | `decimal(10,2)` | Dinero en pesos con 2 decimales | Sí | `0.00` |  | Fondo con el que se abre un turno si no se indica otro. |
| `shifts` | `varchar(60)` | Texto (letras y números), hasta 60 caracteres | No |  |  | Turnos que opera la caja (ej. «Matutino · Vespertino»). |
| `terminal` | `varchar(60)` | Texto (letras y números), hasta 60 caracteres | No |  |  | Terminal bancaria asociada a la caja. |
| `is_active` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = caja en uso. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `cash_shifts`

Apertura y corte de cada turno de caja.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `folio` | `varchar(20)` | Texto (letras y números), hasta 20 caracteres | No |  | Único | Folio del corte (CC-AAAA-NNNNN). Se asigna al cerrar el turno. |
| `cash_register_id` | `bigint unsigned` | Número entero (id de `cash_registers`) | Sí |  | FK → `cash_registers` | Caja del turno. |
| `user_id` | `bigint unsigned` | Número entero (id de `users`) | Sí |  | FK → `users` | Cajera que abrió el turno. |
| `shift` | `enum('morning','evening','full_day')` | Lista de opciones: morning, evening, full_day | Sí | `morning` |  | Turno: matutino, vespertino o completo. |
| `opened_at` | `datetime` | Fecha y hora | Sí |  |  | Cuándo se abrió. |
| `opening_amount` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Efectivo con el que inicia la caja (dinero). |
| `closed_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se cerró. |
| `closed_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Quién cerró. |
| `expected_cash` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | No |  |  | Efectivo que debería haber según el sistema (dinero). |
| `counted_cash` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | No |  |  | Efectivo contado físicamente al cerrar (dinero). |
| `difference` | `decimal(10,2)` | Dinero (pesos con 2 decimales) · se calcula automáticamente | Automático |  |  | Contado − esperado. Se calcula solo. |
| `card_total` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | No |  |  | Total cobrado con tarjeta (dinero). |
| `transfer_total` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | No |  |  | Total cobrado por transferencia (dinero). |
| `cash_left` | `decimal(10,2)` | Dinero en pesos con 2 decimales | No |  |  | Efectivo que se deja en la caja como fondo para el siguiente turno. |
| `cash_handed_over` | `decimal(10,2)` | Dinero en pesos con 2 decimales | No |  |  | Efectivo que se entrega al cerrar (contado − fondo que se queda). |
| `received_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Quién recibió el efectivo entregado. |
| `closing_notes` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Notas del cierre. |
| `status` | `enum('open','closed','reviewed')` | Lista de opciones: open, closed, reviewed | Sí | `open` |  | Estado del turno. |
| `reviewed_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Administrador que revisó el corte. |
| `reviewed_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se revisó. |
| `review_comment` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Comentario de la revisión. |
| `open_cash_register_id` | `bigint unsigned` | Número entero · se calcula automáticamente | Automático |  | Único | Columna técnica que impide abrir dos turnos en la misma caja. Se calcula sola. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `cash_movements`

Retiros o ingresos de efectivo durante un turno.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `folio` | `varchar(20)` | Texto (letras y números), hasta 20 caracteres | No |  | Único | Folio del retiro (RET-AAAA-NNNNN). |
| `cash_shift_id` | `bigint unsigned` | Número entero (id de `cash_shifts`) | Sí |  | FK → `cash_shifts` | Turno en el que ocurrió. |
| `user_id` | `bigint unsigned` | Número entero (id de `users`) | Sí |  | FK → `users` | Quién hizo el movimiento. |
| `type` | `enum('cash_out','cash_in')` | Lista de opciones: cash_out, cash_in | Sí |  |  | Retiro o ingreso de efectivo. |
| `amount` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí |  |  | Monto (dinero, mayor a 0). |
| `reason` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | Sí |  |  | Motivo del movimiento. |
| `cash_before` | `decimal(10,2)` | Dinero en pesos con 2 decimales | No |  |  | Efectivo en caja antes del movimiento. |
| `cash_after` | `decimal(10,2)` | Dinero en pesos con 2 decimales | No |  |  | Efectivo en caja después del movimiento. |
| `received_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Quién recibió el dinero retirado. |
| `authorized_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Quién autorizó. |
| `created_at` | `timestamp` | Fecha y hora · se calcula automáticamente | Automático | Fecha actual |  | Fecha y hora en que se creó el registro. |

##### `sales`

Cada cobro en mostrador (ticket): productos, reparaciones, anticipos, almacenaje.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `folio` | `varchar(20)` | Texto (letras y números), hasta 20 caracteres | Sí |  | Único | Folio único del ticket (letras y números, ej. V26-000001). |
| `cash_shift_id` | `bigint unsigned` | Número entero (id de `cash_shifts`) | No |  | FK → `cash_shifts` | Turno de caja en el que se cobró. |
| `cash_register_id` | `bigint unsigned` | Número entero (id de `cash_registers`) | No |  | FK → `cash_registers` | Caja en la que se cobró. |
| `cashier_id` | `bigint unsigned` | Número entero (id de `users`) | Sí |  | FK → `users` | Cajera que cobró. |
| `customer_id` | `bigint unsigned` | Número entero (id de `customers`) | No |  | FK → `customers` | Cliente (opcional, vacío = público general). |
| `authorized_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Quién autorizó el descuento con su clave. |
| `subtotal` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Importe sin IVA (dinero). |
| `discount` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Descuento sin IVA (dinero). |
| `tax` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | IVA (dinero). |
| `total` | `decimal(10,2)` | Dinero (pesos con 2 decimales) · se calcula automáticamente | Automático |  |  | Subtotal − descuento + IVA. Se calcula solo. |
| `status` | `enum('open','on_hold','paid','cancelled','returned','partially_returned')` | Lista de opciones: open, on_hold, paid, cancelled, returned, partially_returned | Sí | `open` |  | Estado de la venta. |
| `hold_note` | `varchar(120)` | Texto (letras y números), hasta 120 caracteres | No |  |  | Nota al pausar una venta. |
| `receipt_type` | `enum('ticket','invoice')` | Lista de opciones: ticket, invoice | Sí | `ticket` |  | Ticket o factura. |
| `invoice_id` | `bigint unsigned` | Número entero (id de `invoices`) | No |  | FK → `invoices` | Factura emitida para esta venta (si aplica). |
| `paid_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se pagó. |
| `cancelled_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Quién canceló. |
| `cancelled_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se canceló. |
| `cancellation_reason` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Motivo de la cancelación. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `sale_items`

Renglones de una venta.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `sale_id` | `bigint unsigned` | Número entero (id de `sales`) | Sí |  | FK → `sales` | Venta a la que pertenece el renglón. |
| `type` | `enum('product','service','service_order','deposit','additional_charge','storage_fee','custom_item')` | Lista de opciones: product, service, service_order, deposit, additional_charge, storage_fee, custom_item | Sí |  |  | Qué se cobra: producto, servicio, liquidación de orden, anticipo, cargo adicional, almacenaje o producto temporal. |
| `product_id` | `bigint unsigned` | Número entero (id de `products`) | No |  | FK → `products` | Producto vendido (si aplica). |
| `service_id` | `bigint unsigned` | Número entero (id de `services`) | No |  | FK → `services` | Servicio cobrado (si aplica). |
| `service_order_id` | `bigint unsigned` | Número entero (id de `service_orders`) | No |  | FK → `service_orders` | Orden de taller que se cobra (si aplica). |
| `description` | `varchar(200)` | Texto (letras y números), hasta 200 caracteres | Sí |  |  | Descripción que sale en el ticket. |
| `quantity` | `int` | Número entero | Sí | `1` |  | Unidades (mayor a 0). |
| `unit_price` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Precio por unidad con IVA (dinero). |
| `discount_pct` | `decimal(5,2)` | Porcentaje con 2 decimales | Sí | `0.00` |  | Porcentaje de descuento del renglón (0 a 100). |
| `discount_amount` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Descuento del renglón (dinero). |
| `subtotal` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí | `0.00` |  | Cantidad × precio − descuento (dinero). |
| `returned_quantity` | `int` | Número entero | Sí | `0` |  | Unidades devueltas de este renglón. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `payments`

Formas de pago de una venta (puede haber varias = pago mixto).

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `sale_id` | `bigint unsigned` | Número entero (id de `sales`) | Sí |  | FK → `sales` | Venta que se paga. |
| `cash_shift_id` | `bigint unsigned` | Número entero (id de `cash_shifts`) | No |  | FK → `cash_shifts` | Turno de caja. |
| `method` | `enum('cash','card','transfer','credit_note')` | Lista de opciones: cash, card, transfer, credit_note | Sí |  |  | Forma de pago. |
| `amount` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí |  |  | Monto pagado con esta forma (dinero, mayor a 0). |
| `amount_received` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | No |  |  | Efectivo que entregó el cliente (dinero). |
| `change_given` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | No |  |  | Cambio entregado (dinero). |
| `reference` | `varchar(80)` | Texto (letras y números), hasta 80 caracteres | No |  |  | Número de autorización o referencia. |
| `card_last4` | `char(4)` | Texto de exactamente 4 caracteres | No |  |  | Últimos 4 dígitos de la tarjeta. |
| `credit_note_id` | `bigint unsigned` | Número entero (id de `credit_notes`) | No |  | FK → `credit_notes` | Nota de crédito usada como pago (si aplica). |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `sale_returns`

Devoluciones de mercancía vendida.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `folio` | `varchar(20)` | Texto (letras y números), hasta 20 caracteres | Sí |  | Único | Folio único de la devolución (letras y números). |
| `sale_id` | `bigint unsigned` | Número entero (id de `sales`) | Sí |  | FK → `sales` | Venta que se devuelve. |
| `cash_shift_id` | `bigint unsigned` | Número entero (id de `cash_shifts`) | No |  | FK → `cash_shifts` | Turno en el que se devolvió. |
| `user_id` | `bigint unsigned` | Número entero (id de `users`) | Sí |  | FK → `users` | Quién registró la devolución. |
| `authorized_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Quién autorizó. |
| `reason` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | Sí |  |  | Motivo de la devolución. |
| `total` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí |  |  | Importe devuelto (dinero). |
| `refund_method` | `enum('cash','card','transfer','credit_note')` | Lista de opciones: cash, card, transfer, credit_note | Sí |  |  | Cómo se reembolsó. |
| `credit_note_id` | `bigint unsigned` | Número entero (id de `credit_notes`) | No |  | FK → `credit_notes` | Nota de crédito generada (si aplica). |
| `created_at` | `timestamp` | Fecha y hora · se calcula automáticamente | Automático | Fecha actual |  | Fecha y hora en que se creó el registro. |

##### `sale_return_items`

Qué renglones y cantidades se devolvieron.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `sale_return_id` | `bigint unsigned` | Número entero (id de `sale_returns`) | Sí |  | FK → `sale_returns` | Devolución a la que pertenece. |
| `sale_item_id` | `bigint unsigned` | Número entero (id de `sale_items`) | Sí |  | FK → `sale_items` | Renglón de la venta que se devuelve. |
| `quantity` | `int` | Número entero | Sí |  |  | Unidades devueltas. |
| `amount` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí |  |  | Importe devuelto del renglón (dinero). |
| `returns_to_inventory` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = el producto vuelve al stock. |

##### `credit_notes`

Saldo a favor del cliente generado por una devolución.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `folio` | `varchar(20)` | Texto (letras y números), hasta 20 caracteres | Sí |  | Único | Folio único de la nota de crédito (letras y números). |
| `customer_id` | `bigint unsigned` | Número entero (id de `customers`) | No |  | FK → `customers` | Cliente beneficiado. |
| `amount` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí |  |  | Monto original (dinero). |
| `balance` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí |  |  | Saldo disponible (dinero). |
| `valid_until` | `date` | Fecha (AAAA-MM-DD) | No |  |  | Fecha de vencimiento. |
| `status` | `enum('active','applied','expired','cancelled')` | Lista de opciones: active, applied, expired, cancelled | Sí | `active` |  | Estado de la nota. |
| `created_by` | `bigint unsigned` | Número entero (id de `users`) | Sí |  | FK → `users` | Quién la generó. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `invoices`

Facturas electrónicas (CFDI) individuales o globales.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `series` | `varchar(10)` | Texto (letras y números), hasta 10 caracteres | Sí | `A` | Único | Serie de la factura (ej. A). |
| `number` | `int unsigned` | Número entero | Sí |  | Único | Número consecutivo dentro de la serie. |
| `sat_uuid` | `char(36)` | Texto de exactamente 36 caracteres | No |  | Único | Folio fiscal (UUID) que asigna el SAT. |
| `type` | `enum('individual','global')` | Lista de opciones: individual, global | Sí | `individual` |  | individual = una venta; global = ventas del mes al público general. |
| `period` | `char(7)` | Texto de exactamente 7 caracteres | No |  |  | Mes de la factura global (AAAA-MM). |
| `customer_id` | `bigint unsigned` | Número entero (id de `customers`) | No |  | FK → `customers` | Cliente facturado (si aplica). |
| `rfc` | `varchar(13)` | Texto (letras y números), hasta 13 caracteres | Sí |  |  | RFC del receptor. |
| `business_name` | `varchar(200)` | Texto (letras y números), hasta 200 caracteres | Sí |  |  | Razón social del receptor. |
| `tax_regime` | `char(3)` | Texto de exactamente 3 caracteres | Sí |  |  | Régimen fiscal del receptor (clave SAT). |
| `postal_code` | `char(5)` | Texto de 5 dígitos numéricos | Sí |  |  | Código postal fiscal del receptor. |
| `cfdi_use` | `varchar(4)` | Texto (letras y números), hasta 4 caracteres | Sí |  |  | Uso de CFDI (clave SAT). |
| `payment_form` | `char(2)` | Texto de exactamente 2 caracteres | Sí |  |  | Forma de pago (clave SAT: 01 efectivo, 03 transferencia, 04 tarjeta). |
| `payment_method` | `char(3)` | Texto de exactamente 3 caracteres | Sí | `PUE` |  | Método de pago (PUE / PPD). |
| `subtotal` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí |  |  | Subtotal (dinero). |
| `tax` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí |  |  | IVA (dinero). |
| `total` | `decimal(10,2)` | Dinero (pesos con 2 decimales) | Sí |  |  | Total facturado (dinero). |
| `status` | `enum('pending','issued','cancelled','error')` | Lista de opciones: pending, issued, cancelled, error | Sí | `pending` |  | Estado de la factura. |
| `origin` | `enum('counter','portal','admin')` | Lista de opciones: counter, portal, admin | Sí | `counter` |  | Desde dónde se solicitó. |
| `xml_path` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Ruta del XML timbrado. |
| `pdf_path` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Ruta del PDF. |
| `issued_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Quién la emitió. |
| `issued_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se emitió. |
| `cancelled_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Quién la canceló. |
| `cancelled_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se canceló. |
| `cancellation_reason` | `char(2)` | Texto de exactamente 2 caracteres | No |  |  | Motivo de cancelación (clave SAT 01 a 04). |
| `replaced_by` | `bigint unsigned` | Número entero (id de `invoices`) | No |  | FK → `invoices` | Factura que la sustituye (si aplica). |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

### 2.7 Sistema, notificaciones y auditoría

Configuración, folios, correos enviados, notificaciones internas, colas de Laravel y registro de auditoría.

##### `settings`

Parámetros del sistema editables por el administrador (clave = valor).

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `key` | `varchar(60)` | Texto (letras y números), hasta 60 caracteres | Sí |  | PK | Nombre del parámetro (ej. dias_abandono). |
| `value` | `text` | Texto largo | Sí |  |  | Valor del parámetro. |
| `type` | `enum('text','integer','decimal','boolean','json')` | Lista de opciones: text, integer, decimal, boolean, json | Sí | `text` |  | Tipo de valor. |
| `group` | `varchar(30)` | Texto (letras y números), hasta 30 caracteres | Sí | `negocio` |  | Pantalla de configuración donde aparece. |
| `description` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Para qué sirve el parámetro. |
| `updated_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Quién lo modificó por última vez. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `sequences`

Contadores para generar folios consecutivos por año.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `name` | `varchar(20)` | Texto (letras y números), hasta 20 caracteres | Sí |  | PK | Tipo de folio (orden, venta, presupuesto…). |
| `year` | `smallint unsigned` | Número entero | Sí |  | PK | Año del consecutivo. |
| `value` | `int unsigned` | Número entero | Sí | `0` |  | Último número usado. |

##### `sent_emails`

Registro de cada correo enviado a clientes o personal. Nunca guarda contraseñas.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `recipient` | `varchar(150)` | Texto con formato de correo, hasta 150 caracteres | Sí |  |  | Correo al que se envió. |
| `customer_id` | `bigint unsigned` | Número entero (id de `customers`) | No |  | FK → `customers` | Cliente destinatario (si aplica). |
| `user_id` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Empleado relacionado (si aplica). |
| `service_order_id` | `bigint unsigned` | Número entero (id de `service_orders`) | No |  | FK → `service_orders` | Orden relacionada (si aplica). |
| `message_template_id` | `bigint unsigned` | Número entero (id de `message_templates`) | No |  | FK → `message_templates` | Mensaje automático del que salió el correo, si es uno. |
| `type` | `enum('temporary_password','password_recovery','password_changed','order_registered','quote_pending','info_request','additional_charge','ready_for_pickup','storage_reminder','storage_fee_notice','abandonment_notice','warranty','warranty_ruling','chat_reply','invoice','test')` | Lista de opciones: temporary_password, password_recovery, password_changed, order_registered, quote_pending, info_request, additional_charge, ready_for_pickup, storage_reminder, storage_fee_notice, abandonment_notice, warranty, warranty_ruling, chat_reply, invoice, test | Sí |  |  | Motivo del correo (contraseña temporal, listo para recoger, aviso de abandono…). |
| `subject` | `varchar(200)` | Texto (letras y números), hasta 200 caracteres | Sí |  |  | Asunto del correo. |
| `status` | `enum('pending','sent','failed')` | Lista de opciones: pending, sent, failed | Sí | `pending` |  | Estado del envío. |
| `attempts` | `tinyint unsigned` | Número entero pequeño (0 a 255) | Sí | `0` |  | Intentos de envío. |
| `error` | `varchar(500)` | Texto (letras y números), hasta 500 caracteres | No |  |  | Mensaje de error si falló. |
| `sent_at` | `datetime` | Fecha y hora | No |  |  | Cuándo se envió. |
| `created_at` | `timestamp` | Fecha y hora · se calcula automáticamente | Automático | Fecha actual |  | Fecha y hora en que se creó el registro. |

##### `message_templates`

Mensajes automáticos (AD9.6) que se muestran en el portal o se mandan por correo. El texto acepta variables como {cliente}, {folio}, {equipo} y {enlace}.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `code` | `varchar(40)` | Texto (letras y números), hasta 40 caracteres | Sí |  | Único | Clave interna del mensaje (ej. `ready_for_pickup`). |
| `name` | `varchar(80)` | Texto (letras y números), hasta 80 caracteres | Sí |  |  | Nombre visible del mensaje. |
| `sent_when` | `varchar(150)` | Texto (letras y números), hasta 150 caracteres | Sí |  |  | Cuándo se manda (ej. «Al marcar la orden como lista»). |
| `via_portal` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = se muestra en el portal del cliente. |
| `via_email` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | No (0) |  | Sí = también se manda por correo. |
| `is_active` | `tinyint(1)` | Sí / No (1 = sí, 0 = no) | Sí | Sí (1) |  | Sí = se manda; No = desactivado. |
| `email_subject` | `varchar(200)` | Texto (letras y números), hasta 200 caracteres | No |  |  | Asunto del correo. |
| `body` | `text` | Texto largo | Sí |  |  | Texto del mensaje con variables ({cliente}, {folio}, {equipo}, {enlace}…). |
| `updated_by` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Último usuario que editó el mensaje. |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `notifications`

Notificaciones internas (campanita) de Laravel.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `char(36)` | Texto de exactamente 36 caracteres | Sí |  | PK | Identificador único (UUID). |
| `type` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | Sí |  |  | Clase de la notificación en Laravel. |
| `notifiable_type` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | Sí |  |  | Tipo de destinatario (User). |
| `notifiable_id` | `bigint unsigned` | Número entero | Sí |  |  | Id del destinatario. |
| `data` | `text` | Texto largo | Sí |  |  | Contenido de la notificación. |
| `read_at` | `timestamp` | Fecha y hora | No |  |  | Cuándo se leyó (vacío = no leída). |
| `created_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora en que se creó el registro. |
| `updated_at` | `timestamp` | Fecha y hora | No |  |  | Fecha y hora de la última modificación. |

##### `jobs`

Cola de trabajos de Laravel (envío de correos en segundo plano).

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `queue` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | Sí |  |  | Nombre de la cola. |
| `payload` | `longtext` | Texto largo | Sí |  |  | Datos del trabajo. |
| `attempts` | `tinyint unsigned` | Número entero pequeño (0 a 255) | Sí |  |  | Intentos realizados. |
| `reserved_at` | `int unsigned` | Número entero | No |  |  | Momento en que un proceso lo tomó. |
| `available_at` | `int unsigned` | Número entero | Sí |  |  | Momento desde el que se puede ejecutar. |
| `created_at` | `int unsigned` | Número entero | Sí |  |  | Momento en que se creó. |

##### `failed_jobs`

Trabajos de la cola que fallaron.

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `uuid` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | Sí |  | Único | Identificador único del trabajo fallido. |
| `connection` | `text` | Texto largo | Sí |  |  | Conexión de cola. |
| `queue` | `text` | Texto largo | Sí |  |  | Nombre de la cola. |
| `payload` | `longtext` | Texto largo | Sí |  |  | Datos del trabajo. |
| `exception` | `longtext` | Texto largo | Sí |  |  | Error que provocó la falla. |
| `failed_at` | `timestamp` | Fecha y hora · se calcula automáticamente | Automático | Fecha actual |  | Cuándo falló. |

##### `audit_logs`

Registro inmutable de las acciones del personal (no se puede editar ni borrar).

| Columna | Tipo (MySQL) | Qué guarda | Obligatorio | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| `id` | `bigint unsigned` | Número entero (se genera solo) | Automático |  | PK | Identificador único del registro. |
| `user_id` | `bigint unsigned` | Número entero (id de `users`) | No |  | FK → `users` | Empleado que hizo la acción. |
| `module` | `varchar(50)` | Texto (letras y números), hasta 50 caracteres | Sí |  |  | Módulo donde ocurrió (caja, taller, usuarios…). |
| `action` | `varchar(50)` | Texto (letras y números), hasta 50 caracteres | Sí |  |  | Acción realizada (crear, editar, autorizar_descuento…). |
| `table_name` | `varchar(64)` | Texto (letras y números), hasta 64 caracteres | No |  |  | Tabla afectada. |
| `record_id` | `bigint unsigned` | Número entero | No |  |  | Id del registro afectado. |
| `description` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Detalle legible de la acción. |
| `old_values` | `json` | Datos estructurados (JSON) | No |  |  | Valores antes del cambio. |
| `new_values` | `json` | Datos estructurados (JSON) | No |  |  | Valores después del cambio. |
| `ip` | `varchar(45)` | Texto (letras y números), hasta 45 caracteres | No |  |  | Dirección IP del equipo. |
| `user_agent` | `varchar(255)` | Texto (letras y números), hasta 255 caracteres | No |  |  | Navegador o dispositivo usado. |
| `created_at` | `timestamp` | Fecha y hora · se calcula automáticamente | Automático | Fecha actual |  | Fecha y hora en que se creó el registro. |

---

## 3. Reglas de integridad

Las reglas que garantizan la consistencia del modelo (stock, transacciones, folios, inmutabilidad y seguridad) están en el [README principal, sección 15.2](../README.md#152-reglas-de-integridad).

---

## 4. Instalación

### 4.1 Requisitos

PHP 8.1+ (con las extensiones `pdo_mysql`, `mbstring`, `openssl`, `dom` y `fileinfo`), Composer 2 y **MySQL 8.0** (las vistas usan `WITH` y las tablas usan `CHECK`, que no existen en MySQL 5.7 ni funcionan igual en MariaDB).

### 4.2 Ejecutar en local

```bash
cd backend
composer install
cp .env.example .env          # en PowerShell: copy .env.example .env
php artisan key:generate
```

Crea las dos bases de datos (la segunda es solo para las pruebas automatizadas):

```sql
CREATE DATABASE shuri_db   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE shuri_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Edita en `.env` el usuario y la contraseña de tu MySQL (`DB_USERNAME`, `DB_PASSWORD`). Después:

```bash
php artisan migrate --seed    # tablas, vistas, triggers, procedimiento, catálogos y usuarios de prueba
php artisan serve             # API en http://localhost:8000/api/v1
```

Con `APP_ENV=local`, el seeder crea usuarios de prueba. Todos tienen la contraseña `password` y MFA activo:

| Usuario | Rol |
|---|---|
| `admin` | Administrador (clave de autorización de descuentos: `password`) |
| `jefe` | Jefe de técnicos (clave de autorización: `password`) |
| `carlos`, `laura` | Técnicos |
| `sofia` | Cajera (Caja 01) |

Con `MAIL_MAILER=log` (el valor de `.env.example`) los correos no salen: se escriben en `storage/logs/laravel.log`. Ahí aparecen el **código MFA** al iniciar sesión y las contraseñas temporales.

**Super usuario.** Rol por encima del administrador, con acceso total. Solo puede existir una cuenta y no se crea desde la pantalla de usuarios, sino en el servidor:

```bash
php artisan shuri:create-superuser <usuario> <correo> "<Nombre completo>"
```

El comando muestra una contraseña temporal; al entrar, el sistema pide el código MFA (que llega al correo indicado), crear una contraseña propia y elegir la pregunta secreta. Ningún administrador puede ver, editar ni bloquear esta cuenta.

Si el super usuario olvida su contraseña (nadie más puede asignarle una temporal), se regresa a su primer ingreso con:

```bash
php artisan shuri:reset-superuser
```

La cuenta no se puede borrar: la auditoría es inmutable y conserva sus acciones.

La guía de todos los endpoints para el frontend está en [`docs/api/endpoints.md`](../docs/api/endpoints.md).

### 4.3 Variables de entorno

| Variable | Para qué |
|---|---|
| `FRONTEND_URL` | Origen de Angular permitido por CORS (varios separados por coma). |
| `PORTAL_URL` · `STAFF_LOGIN_URL` | Enlaces que llevan los correos al portal del cliente y al acceso del personal. |
| `SANCTUM_EXPIRATION` | Minutos que dura un token de sesión (480 = 8 h). |
| `MAIL_*` | Servidor de correo. Para Gmail: `MAIL_MAILER=smtp`, `MAIL_HOST=smtp.gmail.com`, `MAIL_PORT=587`, `MAIL_ENCRYPTION=tls`, `MAIL_USERNAME` con la cuenta y `MAIL_PASSWORD` con una **contraseña de aplicación** de Google (16 letras, sin espacios). |

`.env` está en `.gitignore`: las contraseñas reales **nunca** se suben al repositorio. Solo se versiona `.env.example`, sin secretos.

### 4.4 Pruebas automatizadas

```bash
php artisan test
```

Usan la base `shuri_test` (configurada en `phpunit.xml`), que se borra y se vuelve a crear en cada prueba; `shuri_db` no se toca. Los correos se simulan, así que no hace falta configurar el correo para correrlas.

### 4.5 Proceso diario de resguardo

El paso de los equipos a "En Abandono" y los avisos de almacenaje corren todos los días a las 8:00 con el programador de Laravel:

```bash
php artisan schedule:work           # en desarrollo: deja corriendo el programador
php artisan shuri:process-storage   # o correrlo a mano una vez
```

### 4.6 Despliegue en un servidor

1. Copiar el proyecto y correr `composer install --no-dev --optimize-autoloader`.
2. En `.env`: `APP_ENV=production`, `APP_DEBUG=false` (nunca mostrar el detalle de los errores), `APP_URL` con el dominio en **HTTPS**, la base de datos de producción, el correo real y `FRONTEND_URL` con el dominio de Angular.
3. `php artisan key:generate` (solo la primera vez) y `php artisan migrate --force`. En producción el seeder **no** crea los usuarios de prueba: el primer administrador se crea a mano o con `php artisan tinker`.
4. `php artisan config:cache` y `php artisan route:cache`.
5. El servidor web (Nginx o Apache) debe apuntar a la carpeta `public/`, y `storage/` y `bootstrap/cache/` deben tener permiso de escritura.
6. Agregar al cron del servidor la línea del programador:

   ```
   * * * * * cd /ruta/a/backend && php artisan schedule:run >> /dev/null 2>&1
   ```
