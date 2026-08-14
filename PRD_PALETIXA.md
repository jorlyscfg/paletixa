# PRD inicial: Migración funcional de la plataforma

**Versión:** 0.1  
**Estado:** Borrador basado en el comportamiento actual  
**Enfoque:** Implementar el producto en un stack nuevo e independiente  
**Fuente analizada:** Frontend actual y contratos funcionales del backend, usando este último únicamente para entender reglas que afectan a la experiencia del usuario.

## 1. Objetivo

Reconstruir la plataforma como una aplicación independiente y personalizada para un único cliente, conservando:

- Módulos visibles para el usuario.
- Flujos operativos actuales.
- Roles y permisos funcionales.
- Reglas de negocio observables.
- Estados y transiciones de cada operación.
- Experiencia responsive y portales públicos.

El nuevo sistema debe construirse sobre un modelo de dominio propio, definido a partir de las necesidades del negocio.

## 2. Alcance del producto

La plataforma administra las operaciones comerciales de una empresa con una o más sucursales:

- Punto de venta.
- Productos y precios.
- Control simple de unidades por sucursal.
- Ventas mayoristas.
- Reservas y eventos.
- Clientes.
- Reportes y auditoría.
- Configuración de empresa, usuarios y módulos.
- Portales públicos de ventas mayoristas y reservas.

## 3. Actores

| Actor | Responsabilidad |
|---|---|
| Administrador | Configurar la empresa, usuarios, sucursales y consultar reportes |
| Cajero | Operar el punto de venta y sus turnos |
| Cliente mayorista | Consultar catálogo y generar pedidos |
| Cliente de reservas | Solicitar una reserva o evento |
| Cliente general | Ser identificado en ventas o reservas |

En el sistema nuevo, los permisos deben depender de roles explícitos. No se deben conservar reglas basadas en prefijos de correo.

## 4. Estructura funcional

### 4.1 Autenticación

**Propósito:** permitir que cada usuario acceda directamente a las funciones que le corresponden.

**Flujo:**

1. El usuario ingresa email y contraseña.
2. El sistema valida sus credenciales y que su cuenta esté activa.
3. Se obtiene el rol y las capacidades del usuario.
4. Se redirige a su módulo principal.

**Redirecciones esperadas:**

| Rol | Destino |
|---|---|
| Administrador | Panel principal |
| Cajero | Punto de venta |
| Cliente mayorista | Portal mayorista |

**Requisitos:**

- Gestionar la sesión expirada globalmente.
- Cerrar todas las sesiones de manera confiable.
- No usar cookies modificables como mecanismo de autorización.
- Separar autenticación y autorización.

### 4.2 Panel principal

**Propósito:** mostrar el estado operativo de la empresa.

**Información:**

- Ventas del día.
- Ventas POS y mayoristas.
- Pedidos mayoristas pendientes.
- Reservas pendientes.
- Unidades vendidas por producto y sucursal.
- Distribución por medios de pago.
- Accesos rápidos a módulos habilitados.

### 4.3 Punto de venta

**Propósito:** registrar ventas presenciales y controlar turnos de caja.

**Flujo principal:**

1. Seleccionar perfil o sucursal.
2. Abrir turno indicando fondos iniciales y el tipo de cambio USD del día.
3. Buscar productos por texto, categoría o código de barras.
4. Agregar productos al carrito.
5. Seleccionar o crear cliente.
6. Seleccionar medio de pago.
7. Confirmar venta.
8. Descontar las unidades vendidas de la cantidad disponible en la sucursal.
9. Emitir ticket.
10. Al finalizar, declarar saldos y cerrar turno.

**Reglas:**

- Sólo cajeros y administradores autorizados.
- No vender una cantidad superior a las unidades disponibles en la sucursal.
- Una caja no puede tener dos turnos abiertos incompatibles.
- Evitar envíos duplicados.
- Validar nuevamente las unidades disponibles al confirmar.
- Permitir precio minorista y mayorista.
- Actualmente el precio mayorista se activa desde 10 unidades(modificable en configuracion) por categoría o producto.
- Permitir ventas a público general o cliente identificado.
- Calcular cambio para pagos en efectivo.

**Cobros en USD:**

- La moneda oficial y de registro del sistema es MXN.
- En el modal de apertura de turno, el cajero debe ingresar el tipo de cambio diario expresado como `MXN por 1 USD`.
- El campo debe mostrar `15 MXN por USD` como valor predeterminado.
- El administrador comunica al cajero el tipo de cambio que debe utilizar ese día.
- El tipo de cambio queda asociado al turno y no debe cambiar para las ventas ya registradas.
- Cuando el cliente paga en USD, el cajero ingresa la cantidad física de dólares recibida.
- El sistema convierte ese monto a MXN usando el tipo de cambio del turno para determinar el importe cubierto y el cambio correspondiente.
- La venta, sus productos, impuestos, total y pago contable se registran siempre en MXN.
- El sistema también conserva, como datos auxiliares de la venta, la cantidad de USD recibida y el tipo de cambio utilizado.
- El cierre de turno debe mostrar por separado el total físico de USD recibido(en caso de que hayan habiado pagos en USD) y su equivalente informativo en MXN.
- Una venta anulada debe descontar sus USD del acumulado del turno.
- No se requiere saldo, contabilidad ni conciliación bancaria en USD.

### 4.4 Clientes

**Propósito:** mantener el directorio comercial y su historial.

**Funciones:**

- Buscar por nombre, teléfono o identificador.
- Crear cliente rápidamente.
- Consultar pedidos y ventas anteriores.
- Generar o regenerar PIN mayorista.
- Invitar al portal mediante WhatsApp.
- Iniciar llamada telefónica.
- Consultar datos de contacto y clasificación.

**Reglas:**

- La gestión completa corresponde al administrador.
- Los módulos operativos pueden crear clientes de manera simplificada.
- El PIN no debería mostrarse permanentemente después de su creación.
- El sistema nuevo debería permitir revocación de sesiones mayoristas.

### 4.5 Ventas mayoristas

Tiene dos experiencias distintas.

#### Portal del cliente

**Flujo:**

1. Acceder mediante el enlace público mayorista de la empresa.
2. Autenticarse con teléfono y PIN.
3. Consultar catálogo.
4. Agregar productos al carrito.
5. Seleccionar forma de pago y entrega.
6. Enviar pedido.
7. Esperar confirmación administrativa.

**Reglas:**

- El pedido nace en estado `Pendiente`.
- El precio mayorista se aplica según cantidad.
- El servidor debe recalcular el precio y validar las unidades disponibles al confirmar.
- La credencial del cliente debe tener vencimiento y revocación.

#### Panel administrativo

**Flujo:**

1. Consultar pedidos pendientes.
2. Revisar cliente, productos, entrega y pago.
3. Seleccionar sucursal de despacho.
4. Confirmar y facturar, con pago inmediato o crédito.
5. Cancelar cuando corresponda.
6. Consultar pedidos completados.

**Estados propuestos:**

```text
Pendiente → Confirmado → Entregado
Pendiente → Cancelado
Confirmado → Cancelado con reversión
```

La confirmación del pedido y el descuento de unidades deben quedar representados como acciones explícitas.

### 4.6 Reservas y eventos

**Propósito:** reservar capacidad para eventos y controlar la entrega de productos o activos.

#### Flujo público

1. Elegir fecha.
2. Verificar disponibilidad.
3. Ingresar datos de contacto.
4. Seleccionar combo o productos.
5. Indicar anticipo y medio de pago cuando corresponda.
6. Crear solicitud pendiente.

#### Flujo administrativo

1. Revisar solicitudes.
2. Confirmar reserva.
3. Asignar recurso o almacén.
4. Registrar anticipo o dejar saldo pendiente.
5. Liberar o entregar el evento.
6. Cancelar con motivo y evidencia de devolución.

**Estados:**

```text
Pendiente
  → Confirmada
      → Entregada/Liberada
      → Cancelada
  → Cancelada
```

**Reglas:**

- La capacidad se bloquea desde la solicitud pendiente.
- La confirmación asigna el recurso físico.
- El descuento de unidades ocurre durante la entrega, no al confirmar.
- La disponibilidad debe validarse atómicamente para evitar sobreventa.
- Una cancelación confirmada debe registrar devolución o reversión.

### 4.7 Catálogo de productos

**Propósito:** administrar los productos utilizados en ventas, control de unidades y estadísticas.

**Submódulos:**

- Catálogo.
- Variantes.
- Categorías.

**Funciones:**

- Crear, editar, desactivar y reactivar productos.
- Configurar precio minorista y mayorista.
- Subir imagen, SKU y código de barras.
- Gestionar categorías.
- Crear productos plantilla.
- Configurar atributos y variantes.

**Reglas:**

- Código, nombre, categoría y precio son obligatorios.
- Precios y cantidades no pueden ser negativos.
- Producto, imágenes, precios y variantes deben guardarse en una única operación transaccional.
- Los productos usados históricamente deben desactivarse, no eliminarse físicamente.

### 4.8 Unidades por sucursal

**Propósito:** llevar un control simple de las unidades disponibles y vendidas por producto en cada sucursal.

**Flujo administrativo:**

1. Seleccionar una sucursal.
2. Definir una cantidad inicial diaria por defecto para sus productos, por ejemplo 100 unidades.
3. Definir una cantidad diferente para productos específicos cuando sea necesario.
4. Al comenzar cada día, inicializar automáticamente cada producto con la cantidad que le corresponda.
5. Permitir que el administrador corrija manualmente la cantidad disponible de un producto para el día actual.

**Cálculo diario:**

```text
Cantidad inicial del día
+ ajustes manuales
- unidades vendidas
= unidades disponibles
```

**Reglas:**

- Sólo el administrador puede configurar cantidades iniciales o realizar ajustes manuales.
- La cantidad específica de un producto tiene prioridad sobre la cantidad por defecto de la sucursal.
- Si un producto no tiene una cantidad específica, utiliza la cantidad por defecto de la sucursal.
- Cada venta confirmada descuenta automáticamente sus unidades de la sucursal correspondiente.
- Una venta cancelada debe devolver sus unidades.
- Las cantidades no pueden ser negativas.
- No existen transferencias entre sucursales en el alcance inicial.
- No se requiere gestionar lotes, costos, movimientos logísticos ni inventario contable.
- La interfaz debe ser una tabla o lista simple de productos con cantidad inicial, unidades vendidas y unidades disponibles.

### 4.9 Reportes y auditoría

**Acceso:** administrador.

**Secciones:**

- Ventas.
- Unidades por sucursal.
- Turnos de caja.
- Auditoría.

**Ventas:**

- Tendencia por fecha.
- Ventas por sucursal.
- Productos principales.
- Detalle de operaciones.
- Separación POS/mayorista.
- Exportación CSV.

**Unidades por sucursal:**

- Cantidad inicial diaria por producto y sucursal.
- Unidades vendidas por producto y sucursal.
- Unidades disponibles al cierre del día.
- Comparación de ventas entre sucursales.
- Productos más y menos vendidos.

**Turnos:**

- Apertura y cierre.
- Tipo de cambio USD utilizado durante el turno.
- Ventas del turno.
- Saldo esperado.
- Saldo declarado.
- Diferencia por medio de pago.
- Cantidad total de USD recibida durante el turno.
- Equivalente informativo en MXN de los USD recibidos.
- Detalle de ventas pagadas en USD, con dólares recibidos y tipo de cambio aplicado.
- Operaciones incluidas.

**Auditoría:**

- Ajustes manuales de cantidades.
- Cambios en ventas.
- Modificaciones de registros.
- Usuario, fecha, acción y valores anteriores/nuevos.

### 4.10 Configuración

**Secciones:**

1. Identidad y datos generales.
2. Módulos habilitados.
3. Sucursales y cantidades iniciales.
4. Usuarios y accesos.
5. Configuración de reservas.
6. Configuración de tickets.

**Datos configurables:**

- Nombre legal y nombre comercial.
- Logo.
- Identificación fiscal.
- Dirección, teléfono y email.
- País y moneda.
- Color principal.
- Cantidad inicial diaria por defecto de cada sucursal.
- Encabezado y pie de ticket.
- Datos visibles en impresión.
- Recursos máximos para reservas.
- Productos sugeridos para eventos.

**Módulos configurables:**

- POS.
- Productos.
- Unidades por sucursal.
- Mayoristas.
- Reservas.
- Localización fiscal.

**Reglas:**

- Habilitar un módulo no concede permisos automáticamente.
- Permiso, módulo habilitado y visibilidad de navegación deben ser conceptos separados.
- La identidad comercial debe almacenarse por separado de los identificadores internos de los registros.

### 4.11 Sucursales y usuarios

**Sucursales:**

- Crear y eliminar sucursal.
- Asignar cajeros.
- Activar o suspender.
- Configurar la cantidad inicial diaria por defecto.
- Configurar excepciones de cantidad para productos específicos.

**Usuarios:**

- Crear y editar.
- Activar o suspender acceso.
- Asignar uno o varios roles.
- Restablecer contraseña.
- Consultar actividad.

**Roles mínimos del nuevo sistema:**

```text
admin
cashier
customer
```

Los permisos deben modelarse como capacidades, por ejemplo:

```text
sales.create
cash_shift.close
branch_units.manage
catalog.manage
reports.view
settings.configure
```

## 5. Capacidades transversales

### Portales públicos

- El sistema debe ofrecer una URL pública estable para ventas mayoristas.
- El sistema debe ofrecer una URL pública estable para reservas.
- Las rutas públicas deben aplicar autenticación(ventas mayoristas), tokens y límites de solicitudes según el flujo.
- El acceso público no debe exponer funciones administrativas ni información interna.

### Notificaciones

- Nuevos pedidos mayoristas.
- Nuevas reservas.
- Unidades disponibles por debajo del nivel esperado.
- Diferencias de caja.
- Fallos operativos importantes.

Debe definirse lectura por usuario. Actualmente marcar una notificación puede afectar a todos los administradores.

### Manejo de errores

Estados globales requeridos:

- Cargando.
- Sin datos.
- Sin permisos.
- Módulo deshabilitado.
- Sesión expirada.
- Sin conexión.
- Error recuperable con reintento.
- Conflicto por datos modificados.
- Operación duplicada.

### PWA y conectividad

El comportamiento actual es sólo informativo:

- Detectar falta de conexión.
- Impedir operaciones críticas.
- Informar actualizaciones disponibles.
- No realizar ventas ni ajustes de unidades offline.

## 6. Modelo conceptual mínimo

Entidades independientes del stack:

```text
Branch
User
Role
Permission
Customer
Product
ProductCategory
ProductVariant
Price
BranchProductQuantity
DailyProductQuantity
CashShift
Sale
SaleItem
Payment
ForeignCashReceipt
WholesaleOrder
Reservation
ReservationResource
Notification
AuditEvent
Attachment
CompanySettings
```

Todas las ventas y ajustes manuales de unidades deben registrar:

- Estado.
- Sucursal.
- Usuario creador.
- Fecha de creación.
- Fecha de confirmación.
- Historial de cambios.
- Identificador idempotente.

## 7. Requisitos no funcionales iniciales

- Diseño mobile-first.
- Controles táctiles de al menos 44 px.
- Navegación accesible por teclado.
- Autorización validada en servidor.
- Operaciones críticas atómicas.
- Idempotencia en ventas, pagos y ajustes de unidades.
- Auditoría inmutable.
- Validación runtime de contratos API.
- Fechas y montos almacenados sin pérdida de precisión.
- El tipo de cambio y los montos en USD deben almacenarse como valores decimales, nunca como números de punto flotante.
- Zona horaria configurable para la empresa.
- Objetivo inicial de respuesta menor a 500 ms en operaciones de lectura comunes.
- Reportes grandes ejecutados de forma paginada o asíncrona.
- Pruebas de integración para todo flujo que altere unidades disponibles o dinero.

## 8. Fuera de alcance inicial

- Contabilidad general completa.
- Nómina.
- CRM avanzado.
- Gastos generales y reembolsos.
- Operación transaccional offline.
- Integraciones fiscales específicas hasta definir países objetivo.
- Migración histórica de datos, hasta cerrar el modelo destino.

## 9. Riesgos principales

1. Varias reglas actuales están implícitas en nombres de usuarios, listas de precios y estados.
2. Hay operaciones críticas sin pruebas suficientes, especialmente el POS.
3. El frontend actual mezcla identidad comercial con identificadores operativos.
4. Algunos procesos son secuencias no atómicas y pueden dejar datos parciales.
5. Las unidades disponibles deben validarse al confirmar una venta para evitar cantidades negativas por operaciones simultáneas.
6. Los estados del nuevo sistema deben definirse mediante máquinas de estado explícitas y coherentes.

## 10. Prioridad de migración sugerida

| Fase | Alcance |
|---|---|
| 1 | Autenticación, roles, configuración y sucursales |
| 2 | Productos, precios y unidades por sucursal |
| 3 | Clientes, POS, turnos y pagos |
| 4 | Mayoristas y portales públicos |
| 5 | Reservas y eventos |
| 6 | Reportes, notificaciones y auditoría |

La definición del stack destino queda abierta. Este PRD está planteado en términos de producto y dominio para mantener la implementación independiente de tecnologías concretas.
