# Guía de Despliegue Directo en Producción (Cloud-Native Fast-Track)

**Módulo:** Despliegue de Aplicaciones Web (2º DAW) / Proyecto Intermodular (2º DAW & DAM)  
**Ciclo Formativo:** Desarrollo de Aplicaciones Web / Multiplataforma  
**Proyecto:** Pizzería Bella Napoli  
**Tiempo estimado de despliegue:** 20 minutos  

---

## 1. Propósito de esta Guía

Esta guía está diseñada como un **camino directo ("Fast-Track")** para desplegar de una sola vez la arquitectura final en producción de la Pizzería Bella Napoli.

A diferencia del itinerario formativo progresivo ([Prácticas P01 a P06](P01_Despliegue_AWS.md)), pensado para que los alumnos descubran los problemas paso a paso mediante el contraste y la resolución iterativa de errores, este documento está dirigido a:
* **Docentes y compañeros de departamento:** Para desplegar el entorno de producción completo y validado en 20 minutos sin necesidad de recorrer las 6 prácticas secuenciales.
* **Alumnos de Proyecto Intermodular / Fin de Ciclo:** Para tomar como plantilla y memoria técnica de referencia un despliegue Cloud-Native profesional de 3 capas.
* **Metodología Didáctica "Top-Down" (Ingeniería Inversa):** Para arrancar el curso con el sistema completo ya funcionando en la nube y, a partir de ahí, diseccionar y estudiar cada componente en profundidad.

---

## 2. Arquitectura de Producción de 3 Capas

El despliegue implementa el estándar de la industria **Well-Architected Framework de AWS** y el modelo **Zero Trust** de Cloudflare:

```mermaid
graph TB
    subgraph CLIENTS ["1. Clientes y Perímetro Exterior"]
        Browser["Navegador Web / Móvil Clientes<br/>(https://daw-XX.guillermofoix.org)"]
        CF_Edge["Red Perimetral Anycast de Cloudflare<br/>(WAF, DDoS Shield, SSL Automático)"]
    end

    subgraph AWS_CLOUD ["2. Nube Pública Amazon Web Services (VPC us-east-1)"]
        subgraph EC2_INSTANCE ["Instancia AWS EC2 (t3.small - Ubuntu 24.04)"]
            subgraph DOCKER_NET ["Red Compartida Docker: pizzeria-network (bridge)"]
                Tunnel["pizzeria-prod-tunnel<br/>(cloudflared Zero Trust - Conexión Saliente)"]
                Nginx["pizzeria-prod-web<br/>(Nginx Proxy + Frontend Web + KDS)"]
                Backend["pizzeria-prod-backend<br/>(API REST Node.js Express :3000)"]
                QR["pizzeria-prod-qr<br/>(PWA Clientes Mesas :80)"]
                DbGate["pizzeria-prod-dbgate<br/>(Gestor Visual Web SQL :3000)"]
            end
        end

        subgraph RDS_CLUSTER ["3. Capa de Persistencia Gestionada: AWS RDS"]
            RDS["Amazon RDS PostgreSQL 16.15<br/>(pizzeria-db - db.t4g.micro)<br/>Publicly Accessible: NO<br/>Cifrado TLS/SSL Obligatorio"]
            Storage[("Almacenamiento gp3 20 GiB<br/>Backups Automatizados")]
        end
    end

    Browser -->|HTTPS :443| CF_Edge
    CF_Edge <==|Túnel Cifrado Bidireccional| Tunnel
    Tunnel --> Nginx
    Nginx -->|/api/*| Backend
    Nginx -->|/app/*| QR
    Nginx -->|/dbgate/* (Basic Auth)| DbGate
    Backend ==>|Pool TLS/SSL :5432| RDS
    DbGate ==>|Admin TLS/SSL :5432| RDS
    RDS --- Storage
```

---

## FASE 1: Aprovisionamiento Cloud en AWS (7 minutos)

### 1.1 Crear el Grupo de Seguridad de la Máquina Virtual (EC2)
1. En la consola de AWS (Región **N. Virginia `us-east-1`**), accede a **EC2** $\rightarrow$ **Grupos de seguridad** $\rightarrow$ **Crear grupo de seguridad**:
   * **Nombre:** `pizzeria-secgroup`
   * **Descripción:** `Acceso administrativo SSH para la pizzeria`
   * **Reglas de entrada:** Añade únicamente:
     * **Tipo:** `SSH` | **Puerto:** `22` | **Origen:** `Cualquier lugar - IPv4` (`0.0.0.0/0`)
2. Pulsa en **Crear grupo de seguridad**.  
*(Observa que **no** abrimos los puertos 80 ni 443; la web saldrá por el túnel de Cloudflare).*

---

### 1.2 Crear el Grupo de Seguridad de la Base de Datos (RDS)
1. En **EC2** $\rightarrow$ **Grupos de seguridad**, pulsa de nuevo en **Crear grupo de seguridad**:
   * **Nombre:** `pizzeria-rds-secgroup`
   * **Descripción:** `Acceso exclusivo a PostgreSQL desde la instancia EC2`
   * **Reglas de entrada:** Añade una regla con origen cruzado:
     * **Tipo:** `PostgreSQL` | **Puerto:** `5432`
     * **Origen:** Selecciona el identificador del grupo anterior: **`pizzeria-secgroup`** (ej. `sg-0295027...`).
2. Pulsa en **Crear grupo de seguridad**.

---

### 1.3 Lanzar la Instancia EC2
1. Ve a **EC2** $\rightarrow$ **Instancias** $\rightarrow$ **Lanzar instancias**:
   * **Nombre:** `Pizzeria-Produccion`
   * **AMI:** Selecciona **Ubuntu** (**Ubuntu Server 24.04 LTS**, 64-bit x86).  
     > [!TIP]
     > **Aviso de cambio de AMI:** Al cambiar de la opción por defecto (Amazon Linux) a Ubuntu, AWS mostrará una ventana emergente advirtiendo: *"Al cambiar la AMI, se restablecerán algunos ajustes configurados anteriormente a sus valores predeterminados..."*. Es un aviso normal de AWS: haz clic en **Confirmar / Continuar** con total tranquilidad.
   * **Tipo de instancia:** **`t3.small`** (2 vCPU, 2 GiB RAM).
   * **Par de claves:** `vockey` (o tu clave de AWS Academy).
   * **Configuración de red:** Pulsa *Editar* $\rightarrow$ *Seleccionar grupo de seguridad existente* $\rightarrow$ Selecciona **`pizzeria-secgroup`**.
   * **Almacenamiento:** **20 GiB** (gp3).
2. Pulsa **Lanzar instancia**.

---

### 1.4 Crear la Base de Datos Gestionada en Amazon RDS
1. En el buscador de AWS escribe **RDS** y accede a la sección **Bases de datos**.
2. Pulsa en el botón naranja **Crear base de datos** y selecciona **Configuración completa** (*Standard create*).  
   > [!WARNING]
   > **Evita "Configuración exprés" (*Easy create*):** Despliega el menú del botón naranja y asegúrate de elegir **Configuración completa**. La opción exprés intentará aprovisionar Aurora Serverless, no cubierto por la capa gratuita, y consumirá créditos rápidamente.
3. Configura los siguientes parámetros en el asistente:
   * **Método de creación:** **Configuración completa** (*Standard create*).
   * **Tipo de motor:** **PostgreSQL** (versión `PostgreSQL 16.X`).
   * **Plantillas:** **Capa gratuita** (*Free tier*).
   * **Identificador de instancia de base de datos:** `pizzeria-db`
   * **Usuario maestro:** `pizzeria_user`
   * **Gestión de credenciales:** Autogestionada (*Self managed*).
   * **Contraseña maestra:** `pizzeria_pass_2026!`
   * **Configuración de la instancia:** `db.t4g.micro` (o `db.t3.micro`).
   * **Almacenamiento:**
     * **Tipo de almacenamiento:** SSD de uso general (`gp2` o `gp3`).
     * **Almacenamiento asignado:** `20` GiB.
     * **Desplegable `▼ Configuración de almacenamiento adicional`:**  
       Haz clic sobre él para expandirlo y **DESMARCA** la casilla **«Habilitar escalado automático de almacenamiento»** (*Enable storage autoscaling*).  
       *(¡Importante! AWS la marca por defecto con un umbral de 1000 GiB; desmarcarla garantiza que el disco no aumente de tamaño y protege los créditos del laboratorio).*
   * **Conectividad:**
     * **Recurso de computación:** `No se conecte a un recurso informático de EC2` (lo enlazamos mediante grupos de seguridad).
     * **Nube privada virtual (VPC):** Mantener la VPC por defecto (`default`).
     * **Acceso público:** **No** (Imprescindible para seguridad: la base de datos queda aislada dentro de la VPC privada).
     * **Grupo de seguridad de VPC:** Selecciona **`pizzeria-rds-secgroup`** (si aparece el grupo `default`, quítalo para que solo quede este).
   * **Configuración adicional (Despliega la sección `▼ Configuración adicional` al final de la página):**
     * **Nombre de la base de datos inicial:** `pizzeria_db` (¡Crítico! Si se deja vacío, PostgreSQL no creará la BBDD inicial y la aplicación fallará).
     * **Copias de seguridad:** Desmarca *Habilitar copias de seguridad automáticas* (ahorro de créditos de laboratorio).
4. Pulsa el botón final naranja **Crear base de datos**.
5. **Localizar y copiar el Punto de enlace (*Endpoint*):**
   * Espera 4-5 minutos hasta que el estado de la base de datos cambie de *Creando* a **Disponible** (*Available*).
   * Haz clic sobre el enlace azul del nombre: 👉 **`pizzeria-db`** para entrar en su panel de detalles.
   * En la pestaña **Conectividad y seguridad** (*Connectivity & security*), observa el apartado superior *"Conectarse mediante"*.
   * Si por defecto viene marcada la tarjeta *Fragmentos de código*, haz clic en la tercera tarjeta: 👉 **`Puntos de conexión`** (*"Úselo cuando se conecte a través de cualquier interfaz IDE"*).
   * Justo debajo, en la sección **Punto de enlace y puerto**, localiza el campo **Punto de enlace** (*Endpoint*) y haz clic en el icono de copiar. Tendrá un formato similar a:  
     `pizzeria-db.crfj6um8vnsv.us-east-1.rds.amazonaws.com`
   * Guarda este valor; lo utilizaremos a continuación en el archivo `.env` de la EC2 (`DB_HOST`) y en la configuración de DbGate.

---

## FASE 2: Conectividad Zero Trust con Cloudflare (3 minutos)

Para conectar tu máquina a Internet sin exponer IPs públicas ni abrir puertos en AWS, utilizaremos un **Cloudflare Tunnel**:

1. Obtén tu **Token de Túnel** asignado por el profesor (o créalo en el panel de Cloudflare Zero Trust $\rightarrow$ *Networks* $\rightarrow$ *Tunnels* asociándolo a tu subdominio, ej: `daw-XX.guillermofoix.org` apuntando a `HTTP://localhost:80`).
2. Guarda el valor del token para el siguiente paso.

---

## FASE 3: Despliegue Automatizado en la Instancia EC2 (7 minutos)

### 3.1 Conectar a la EC2 e Instalar Docker Engine
1. En la consola de EC2, selecciona tu instancia y pulsa **Conectar** $\rightarrow$ **Conexión de la instancia EC2** $\rightarrow$ **Conectar**.
2. Ejecuta el script oficial de instalación de Docker:
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   rm get-docker.sh
   sudo usermod -aG docker $USER
   newgrp docker
   ```

---

### 3.2 Clonar el Repositorio y Configurar Variables de Entorno
1. Clona el repositorio del proyecto:
   ```bash
   git clone https://github.com/guillermofoix/pizzeria-base.git
   cd pizzeria-base
   ```

2. Crea el archivo de entorno `.env`:
   ```bash
   cp .env.example .env
   nano .env
   ```

3. Modifica los siguientes parámetros:
   * **`CLOUDFLARE_TUNNEL_TOKEN=`** $\rightarrow$ Pega tu token de Cloudflare.
   * **`DB_HOST=db`** $\rightarrow$ Sustituye `db` por el **Punto de enlace (*Endpoint*) de AWS RDS** que copiaste en el paso 1.4:
     ```ini
     DB_HOST=pizzeria-db.cujmuqw6zgcb.us-east-1.rds.amazonaws.com
     DB_PORT=5432
     DB_NAME=pizzeria_db
     DB_USER=pizzeria_user
     DB_PASSWORD=pizzeria_pass_2026!
     ```
     > [!TIP]
     > **Recordatorio:** Este valor proviene de la consola de RDS $\rightarrow$ *pizzeria-db* $\rightarrow$ pestaña *Conectividad y seguridad* $\rightarrow$ tarjeta **`Puntos de conexión`** $\rightarrow$ campo **Punto de enlace**.
   *(Guarda en nano con `Ctrl + O`, `Enter` y sal con `Ctrl + X`).*

---

### 3.3 Crear la Red Docker Externa
En nuestra arquitectura desacoplada, los contenedores se comunican a través de una red virtual compartida:
```bash
docker network create pizzeria-network
```

---

### 3.4 Inyectar la Configuración de DbGate con Cifrado SSL
Amazon RDS exige conexiones cifradas con TLS/SSL y no utiliza el contenedor local `db`. Para que DbGate cargue nuestra conexión a AWS RDS y no busque una base de datos local inexistente:

1. Limpia las variables estáticas locales de `docker-compose.db.yml`:
   ```bash
   sed -i '/- CONNECTIONS=pizzeria/,/- ENGINE_pizzeria=/d' docker-compose.db.yml
   ```
   *(Esto evita que DbGate intente conectarse al host `db` inexistente y desbloquea el gestor de conexiones con soporte SSL).*

2. Crea el volumen persistente y arranca el contenedor de DbGate:
   ```bash
   docker volume create pizzeria_prod_dbgate
   docker compose -f docker-compose.db.yml up -d --force-recreate dbgate
   ```

3. Inyecta la conexión a RDS con `"useSsl": true`:
   ```bash
   docker exec -i pizzeria-prod-dbgate sh -c 'cat > /root/.dbgate/connections.jsonl' << 'EOF'
   {"_id":"pizzeria_rds","engine":"postgres@dbgate-plugin-postgres","server":"pizzeria-db.cujmuqw6zgcb.us-east-1.rds.amazonaws.com","port":5432,"user":"pizzeria_user","password":"pizzeria_pass_2026!","defaultDatabase":"pizzeria_db","displayName":"AWS RDS Bella Napoli","useSsl":true}
   EOF
   ```
   > [!IMPORTANT]
   > * Sustituye el valor de `server` por tu **Punto de enlace (*Endpoint*) real** de AWS RDS copiado en el paso 1.4.
   > * **Sin barra final:** El endpoint debe terminar estrictamente en `.com` (ejemplo: `...rds.amazonaws.com`), **NUNCA añadas un slash `/` al final**.
   > *(Si utilizas el comando tradicional en una sola línea con `echo`, el símbolo `\"` que ves es únicamente una barra invertida de escape para las comillas del JSON en Linux, no forma parte del endpoint).*

4. Reinicia DbGate para aplicar la configuración:
   ```bash
   docker compose -f docker-compose.db.yml restart dbgate
   ```

5. Comprueba que el archivo se ha guardado correctamente:
   ```bash
   docker exec pizzeria-prod-dbgate cat /root/.dbgate/connections.jsonl
   ```
   *(Deberás ver una sola línea con tu endpoint limpio y `"useSsl":true`).*

---

### 3.5 (Opcional) Proteger el acceso a `/dbgate/` con HTTP Basic Auth
Para que nadie pueda acceder al panel de administración sin credenciales web:

1. Genera el archivo `.htpasswd`:
   ```bash
   echo "admin:$(openssl passwd -apr1 'PizzeriaAdmin_2026!')" > .htpasswd
   chmod 644 .htpasswd
   ```

2. Activa la autenticación en `frontend-web/nginx.conf`:
   ```bash
   sed -i '/location \/dbgate\/ {/a \        auth_basic "Acceso Restringido - Administracion";\n        auth_basic_user_file /etc/nginx/.htpasswd;' frontend-web/nginx.conf
   ```

3. Monta el archivo `.htpasswd` en `docker-compose.app.yml`:
   ```bash
   sed -i '/container_name: pizzeria-prod-web/a \    volumes:\n      - ./.htpasswd:/etc/nginx/.htpasswd:ro' docker-compose.app.yml
   ```

---

### 3.6 Compilar y Arrancar el Stack de Aplicación
Lanza la aplicación completa (Backend Node.js, Frontend Web, WebApp QR y Túnel Cloudflare):

```bash
docker compose -f docker-compose.app.yml up -d --build
```

> 💡 **Aprovisionamiento Automático de Datos:**  
> Al arrancar, el backend de Node.js se conecta a Amazon RDS mediante SSL, detecta que la base de datos está recién creada y ejecuta automáticamente la creación de tablas (`pizzas`, `ingredientes`, `mesas`, `pedidos`...) y la siembra de datos inicial. ¡No necesitas ejecutar scripts SQL manuales!

---

## FASE 4: Verificación y Auditoría de Salud (3 minutos)

Comprueba que la infraestructura está 100% operativa:

1. **Estado de los Contenedores:**
   ```bash
   docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
   ```
   *(Deberás ver activos: `pizzeria-prod-backend`, `pizzeria-prod-web`, `pizzeria-prod-qr`, `pizzeria-prod-tunnel` y `pizzeria-prod-dbgate`).*

2. **Diagnóstico de Salud de la API con conexión a RDS:**
   ```bash
   curl -s http://localhost/api/health
   ```
   **Salida esperada:**
   ```json
   {"status":"UP","service":"pizzeria-backend","database":{"connected":true,"db_time":"2026-09-23T..."}}
   ```

3. **Verificación en el Navegador:**
   * 👉 **Web Comercial & Cocina KDS:** `https://daw-XX.guillermofoix.org/` $\rightarrow$ Catálogo de pizzas cargado desde AWS RDS y panel KDS para gestionar comandas en tiempo real.
   * 👉 **WebApp QR Mesas:** `https://daw-XX.guillermofoix.org/pedido` (o `/app/`) $\rightarrow$ Interfaz móvil para comensales.
   * 👉 **Gestor Visual DbGate (`/dbgate/`):**
     1. Entra a `https://daw-XX.guillermofoix.org/dbgate/`.
     2. Introduce las credenciales de administración: Usuario `admin` | Contraseña `PizzeriaAdmin_2026!`.
     3. En el panel izquierdo de **Conexiones**, haz doble clic sobre: 👉 **`AWS RDS Bella Napoli`**.
     4. Se conectará mediante SSL a Amazon RDS y desplegará la carpeta **Tablas**: verás `pizzas`, `ingredientes`, `mesas`, `pedidos` y `lineas_pedido`.
     5. Haz doble clic sobre cualquier tabla (ej. `pizzas` o `pedidos`) para ver y editar registros en vivo, o pulsa en **Nueva consulta** (*New Query*) para lanzar sentencias SQL directas contra PostgreSQL.

4. **Prueba Transaccional:**
   Haz un pedido desde el TPV o desde la app móvil. Refresca la tabla `pedidos` en DbGate: el registro aparece guardado en tiempo real en la infraestructura gestionada de Amazon Web Services.

---

## FASE 5: Disección Didáctica y Matriz de Decisiones Arquitectónicas

Esta sección proporciona la justificación de ingeniería requerida en las **memorias técnicas de proyectos de fin de ciclo (DAW/DAM)**:

### 1. Capa de Cómputo: ¿Por qué Docker en EC2 frente a otras opciones?

| Solución Evaluada | Pros | Contras | Decisión Didáctica |
| :--- | :--- | :--- | :--- |
| **Docker Engine en AWS EC2 (Elegida)** | Control total del sistema operativo, coste fijo mínimo (`t3.small`), visibilidad directa de procesos Linux y red Docker bridge. | Mantenimiento manual del SO y parches de seguridad. | **Óptima para FP:** Los alumnos deben dominar la terminal Linux, comandos Docker y configuración de redes virtuales. |
| **AWS ECS con AWS Fargate (Serverless Containers)** | Cero gestión de instancias EC2, escalado automático horizontal según tráfico web. | Mayor coste por contenedor en reposo, abstracción excesiva que oculta el funcionamiento de la red. | Excelente para producción corporativa de alto tráfico; descartada aquí para mantener el control directo de la terminal. |
| **AWS Elastic Beanstalk** | Despliegue PaaS rápido tipo "subir y ejecutar". | Arquitectura "caja negra" poco flexible, errores difíciles de depurar en entornos multi-contenedor. | Desfasada frente a los enfoques modernos de orquestación con Docker Compose. |
| **Kubernetes (AWS EKS)** | Estándar absoluto para grandes corporaciones y microservicios complejos. | Complejidad cognitiva y técnica desmesurada, coste mínimo prohibitivo para laboratorios (~75$/mes solo por el plano de control). | Inviable para un taller de 20 minutos; reservado para cursos de especialización en Cloud/DevOps. |

---

### 2. Capa de Datos: ¿Por qué AWS RDS PostgreSQL frente a Base de Datos en Contenedor?

| Aspecto | PostgreSQL en Contenedor Docker (Local) | Amazon RDS PostgreSQL (Gestionada) |
| :--- | :--- | :--- |
| **Punto Único de Fallo (SPOF)** | Si la máquina virtual EC2 se apaga o se corrompe el disco EBS, la base de datos se destruye. | La base de datos vive en un clúster desacoplado e independiente de la máquina EC2. |
| **Alta Disponibilidad** | Manual y compleja de implementar. | Activación con un clic de **Multi-AZ** (réplica síncrona en otro centro de datos físico con failover < 60s). |
| **Copias de Seguridad (Backups)** | Requiere programar tareas cron con `pg_dump` y scripts bash. | Automatizadas diariamente por AWS con restauración a cualquier segundo (*Point-in-Time Recovery*). |
| **Seguridad de Red** | Comparte el mismo host y red que el servidor web. | Aislada en subredes privadas con cortafuegos por Security Group y forzado obligatorio de SSL/TLS. |
| **Rendimiento** | Compite por la memoria RAM y CPU de la EC2 con Nginx y Node.js. | Memoria RAM, CPU y disco NVMe dedicados exclusivamente al motor de base de datos. |

---

### 3. Capa Perimetral: ¿Por qué Cloudflare Tunnels frente a la Exposición Clásica (ALB + IP Pública)?

En el modelo tradicional de despliegue en AWS, se abrirían los puertos 80/443 en el Security Group, se asignaría una IP Elástica y se contrataría un **Application Load Balancer (ALB)** de AWS con certificados de **AWS Certificate Manager (ACM)**.

Hemos elegido **Cloudflare Zero Trust Tunnels** por motivos de peso:

```
Arquitectura Tradicional (ALB)      VS     Arquitectura Zero Trust (Cloudflare)
[Internet]                                 [Internet]
    │                                          │
    ▼ (Puertos 80/443 abiertos al mundo)       ▼ (WAF global de Cloudflare)
[AWS Security Group: 0.0.0.0/0]            [Cloudflare Edge]
    │                                          ▲
    ▼ (Expuesto a escaneos Shodan/DDoS)        ║ (Túnel saliente cifrado)
[AWS EC2 / ALB]                            [pizzeria-prod-tunnel (EC2)]
                                           * CERO puertos de entrada en AWS *
```

1. **Ahorro Radical de Costes (FinOps):** Un AWS ALB cuesta aproximadamente **18 a 22 $ al mes** solo por existir, sin contar el tráfico procesado. Cloudflare Tunnels es **100% gratuito** dentro del plan Zero Trust.
2. **Superficie de Ataque Cero:** En el Security Group de AWS solo se permite SSH (puerto 22). Los puertos 80 y 443 no existen; es matemáticamente imposible que un bot de Shodan o un ataque DDoS alcance la IP del servidor.
3. **Gestión de Certificados SSL:** Cloudflare emite y renueva automáticamente certificados TLS/SSL de borde sin necesidad de configurar Certbot ni tocar archivos de certificados en el servidor.

---

### 4. Matriz Resumen de Costes Mensuales Estimados (FinOps)

| Componente | Nivel Gratuito (AWS Free Tier / Lab) | Producción Pequeña Empresa (On-Demand) |
| :--- | :--- | :--- |
| **Cómputo:** Instancia EC2 `t3.small` (Ubuntu) | Incluida en créditos de laboratorio (~0.0208 $/hora) | ~15.00 $/mes |
| **Almacenamiento EC2:** 20 GiB EBS gp3 | Gratuito (hasta 30 GB en Free Tier) | ~1.60 $/mes |
| **Base de Datos:** AWS RDS `db.t4g.micro` | Incluida en créditos / 750h gratis primer año | ~13.50 $/mes |
| **Almacenamiento RDS:** 20 GiB gp3 | Gratuito (hasta 20 GB en Free Tier) | ~2.30 $/mes |
| **Perímetro:** Cloudflare Zero Trust Tunnel | **0.00 $ (Gratuito)** | **0.00 $ (Gratuito)** |
| **Balanceador AWS ALB (Evitado):** | **0.00 $ (Ahorrado)** | **~20.00 $/mes (Ahorrado)** |
| **TOTAL ESTIMADO:** | **0.00 $ (Cubierto por Lab / Free Tier)** | **~32.40 $/mes** |

---

## FASE 6: Protocolo FinOps de Apagado y Ahorro de Créditos

Cuando termines la demostración o sesión de clase:

1. **Detener los contenedores en la EC2:**
   ```bash
   docker compose -f docker-compose.app.yml stop
   docker compose -f docker-compose.db.yml stop
   ```
2. **Detener la instancia EC2 en la consola de AWS:**
   * Ve a **EC2** $\rightarrow$ **Instancias** $\rightarrow$ Selecciona tu máquina $\rightarrow$ **Estado de la instancia** $\rightarrow$ **Detener instancia** (*Stop instance*).
3. **Detener la instancia RDS en la consola de AWS:**
   * Ve a **RDS** $\rightarrow$ **Bases de datos** $\rightarrow$ Selecciona `pizzeria-db` $\rightarrow$ **Acciones** $\rightarrow$ **Detener temporalmente** (*Stop temporarily*).  
   *(AWS detendrá el cómputo de la base de datos por hasta 7 días sin consumir créditos horários).*
