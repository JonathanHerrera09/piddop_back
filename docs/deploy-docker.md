# Despliegue en el VPS de Lumefy

Esta guía sigue el patrón del proyecto Lumefy que ya tienes en el servidor: el repositorio vive en el VPS, Nginx Proxy Manager (NPM) y las aplicaciones se conectan a una red Docker externa compartida, y GitHub Actions se conecta por SSH para actualizar al commit publicado y construir la imagen en el servidor. No usa GHCR.

El backend corre en Docker Compose junto a MySQL 8.4. La base de datos y los archivos que sube la API quedan en volúmenes persistentes. El contenedor API no publica un puerto en el host: NPM lo alcanza por la red Docker `nginx-proxy-manager_default` mediante el alias `piddop-backend`.

## 1. Red Docker de NPM en este servidor

Conéctate por SSH al VPS y ejecuta:

```bash
docker network ls
```

En el servidor actual, Nginx Proxy Manager y el backend de Lumefy comparten `nginx-proxy-manager_default`. Usa ese nombre como `PROXY_NETWORK`:

```bash
docker network inspect nginx-proxy-manager_default
```

Si la red cambia más adelante, actualiza `PROXY_NETWORK` en el `.env` de este proyecto.

## 2. Clona el backend en una carpeta independiente

No lo instales dentro de la carpeta de Lumefy. Usa un directorio separado para que cada `docker compose` administre solo sus propios servicios:

```bash
sudo mkdir -p /srv/piddop-back
sudo chown TU_USUARIO:TU_USUARIO /srv/piddop-back
git clone URL_DE_TU_REPOSITORIO /srv/piddop-back
cd /srv/piddop-back
```

El usuario SSH de despliegue necesita permiso para hacer `git fetch`, ejecutar Docker sin interacción y leer `.env`. Si el repositorio es privado, configura en el VPS una deploy key de solo lectura para que ese usuario pueda hacer `git fetch origin main`; la clave de Actions solo permite entrar al servidor, no autentica al VPS con GitHub.

## 3. Crea el `.env` de producción

Guárdalo en `/srv/piddop-back/.env`. Este archivo no debe subirse al repositorio:

```dotenv
NODE_ENV=production
PORT=3000
SWAGGER_ENABLED=false
TRUST_PROXY=1
CORS_ORIGIN=https://TU-FRONTEND.example.com

PROXY_NETWORK=nginx-proxy-manager_default

DB_HOST=mysql
DB_PORT=3306
DB_NAME=allorajd
DB_USER=allora_app
DB_PASSWORD=CONTRASENA_LARGA_Y_UNICA
DB_SSL=false
# En MySQL local del stack el certificado es autofirmado; el tráfico sigue cifrado.
DB_SSL_REJECT_UNAUTHORIZED=false
MYSQL_ROOT_PASSWORD=OTRA_CONTRASENA_LARGA_Y_UNICA

JWT_ACCESS_SECRET=SECRETO_ALEATORIO_DE_AL_MENOS_32_CARACTERES
JWT_REFRESH_SECRET=OTRO_SECRETO_ALEATORIO_DE_AL_MENOS_32_CARACTERES
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

SUPER_ADMIN_NAME=Platform
SUPER_ADMIN_LAST_NAME=Admin
SUPER_ADMIN_EMAIL=admin@TU-DOMINIO.example
SUPER_ADMIN_PHONE=3000000000
SUPER_ADMIN_PASSWORD=CAMBIA_ESTA_CONTRASENA
```

Añade también las variables opcionales que uses para SMTP, Google OAuth y Wompi; están documentadas en `.env.example`. Genera secretos diferentes con `openssl rand -hex 32` y protégelos:

```bash
chmod 600 .env
```

`DB_SSL_REJECT_UNAUTHORIZED=false` es para el MySQL privado de este Compose, cuyo certificado es local. Para una base MySQL externa, configura la CA en `DB_SSL_CA` y pon `DB_SSL_REJECT_UNAUTHORIZED=true`.

## 4. Configura el Proxy Host en NPM

En Nginx Proxy Manager crea un Proxy Host para el subdominio de la API:

1. **Domain Names:** `api.TU-DOMINIO.example`.
2. **Scheme:** `http`.
3. **Forward Hostname / IP:** `piddop-backend`.
4. **Forward Port:** `3000`.
5. Activa **Websockets Support** y configura el certificado SSL/Let's Encrypt.

El alias `piddop-backend` se registra en `nginx-proxy-manager_default`, compartida por NPM y el backend de Lumefy en tu servidor. No publiques el puerto 3000 en Internet. NPM y este backend deben pertenecer a esa misma red.

Configura `CORS_ORIGIN` con el origen exacto del frontend, sin ruta final. Para varios orígenes, sepáralos con comas. `TRUST_PROXY=1` permite que Express reciba la IP cliente desde el proxy.

## 5. Prepara SSH para GitHub Actions

Usa una clave SSH dedicada para despliegues. Añade su clave pública al usuario de despliegue del VPS (`~/.ssh/authorized_keys`). En GitHub, abre **Settings → Secrets and variables → Actions** y crea:

| Secreto | Valor |
|---|---|
| `DEPLOY_HOST` | IP o dominio SSH del VPS |
| `DEPLOY_USER` | Usuario SSH que tiene acceso a Docker y al repositorio |
| `DEPLOY_SSH_KEY` | Clave privada SSH dedicada para Actions |
| `DEPLOY_KNOWN_HOSTS` | Clave de host SSH verificada del VPS |
| `DEPLOY_PATH` | Ruta del clone, por ejemplo `/srv/piddop-back` |
| `DEPLOY_PORT` | Puerto SSH, si es distinto de 22 |

Obtén la clave de host en el servidor con `sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` y confirma su huella por un canal confiable. Guarda en `DEPLOY_KNOWN_HOSTS` la línea `host ssh-ed25519 clave...` correspondiente (usa `ssh-keyscan -p PUERTO HOST` para obtener la línea y verifica que coincide con la huella). El workflow valida esa clave antes de conectarse.

## 6. Primer despliegue y actualizaciones

Haz push a `main`. GitHub Actions valida los secretos, se conecta por SSH, verifica que el commit pertenece a `main`, actualiza el checkout del VPS, construye la imagen y ejecuta `docker compose up`. También puedes iniciar **Actions → Deploy to VPS → Run workflow**.

En el VPS puedes revisar los servicios y la API:

```bash
cd /srv/piddop-back
docker compose ps
docker compose logs -f api
docker compose exec api node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(async r => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1); })"
```

La API aplica las migraciones de Sequelize antes de iniciar. Si fallan, el contenedor no arranca y los logs de `api` muestran el error. Las actualizaciones conservan los volúmenes `mysql_data` y `uploads`; no uses `docker compose down -v` al desplegar.

Haz respaldos de MySQL y de `uploads`, y almacena una copia fuera del VPS. El volumen local no protege contra pérdida del servidor.
