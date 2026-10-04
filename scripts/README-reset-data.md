# Reinicio de datos conservando categorías y usuario maestro

El archivo `reset-data-keep-master-categories.sql` está diseñado para MySQL 8 y elimina todos los datos operativos de la base de Allora.

Conserva las categorías, el usuario maestro indicado, los roles/permisos indispensables y `SequelizeMeta`. Las categorías, roles y permisos se reconstruyen con IDs consecutivos; el usuario maestro y su rol `SUPER_ADMIN` quedan con ID `1`. Todas las tablas vacías reinician su `AUTO_INCREMENT` en `1`.

## Antes de usarlo

1. Detén el backend para impedir escrituras durante el reinicio.
2. Crea una copia de seguridad completa.
3. Abre el `.sql` y reemplaza `CAMBIAR_POR_CORREO_DEL_MASTER` por el correo real del usuario maestro.
4. Confirma que estás conectado a la base correcta con `SELECT DATABASE();`.

Ejemplo de copia de seguridad:

```powershell
mysqldump -u TU_USUARIO -p --single-transaction --routines --triggers NOMBRE_BASE > allora-antes-del-reinicio.sql
```

Ejemplo de ejecución desde PowerShell:

```powershell
Get-Content -Raw -LiteralPath backend/scripts/reset-data-keep-master-categories.sql | mysql --default-character-set=utf8mb4 -u TU_USUARIO -p NOMBRE_BASE
```

También puede abrirse y ejecutarse completo desde MySQL Workbench. No debe ejecutarse por fragmentos: las tablas temporales y el procedimiento requieren la misma conexión.

## Protecciones incluidas

- Se detiene antes de eliminar datos si el correo no fue configurado.
- Se detiene si el correo no corresponde exactamente a un único usuario `SUPER_ADMIN`.
- No modifica ni elimina el historial de migraciones.
- Restablece `FOREIGN_KEY_CHECKS` incluso si MySQL informa un error controlado.
- Muestra al final cuántas categorías quedaron y los IDs del maestro y su rol.

`TRUNCATE` no tiene rollback. Si se ejecuta contra una base equivocada o sin copia de seguridad, los datos eliminados no son recuperables.
