# Práctica: Despliegue en AWS EC2 de Aplicación Full-Stack

**Módulo:** Despliegue de Aplicaciones Web (2º DAW)  
**Proyecto:** Pizzería Bella Napoli

El objetivo de esta práctica es el despliegue en un entorno de producción (nube pública AWS) de una arquitectura multi-contenedor (frontend, backend, base de datos relacional y proxy inverso).

---

## FASE 1: Acceso y Activación del Entorno AWS Academy

El entorno de AWS Academy Learner Lab requiere la aceptación de los términos de servicio y la superación de una prueba de conocimientos previa para habilitar la infraestructura.

1. Acceder al correo electrónico institucional y localizar la invitación de **Instructure Canvas / AWS Academy**. Proceder al registro y creación de credenciales.
2. Acceder al curso en Canvas y navegar a la sección **Contenidos** (o _Modules_).
3. _(Opcional)_ **Prueba de conocimientos:**
   - Si lo deseas, puedes consultar el módulo **"Conformidad y seguridad del Laboratorio"** y realizar el cuestionario orientativo sobre las políticas de uso aceptable del entorno. No es obligatoria para arrancar el laboratorio.
4. Acceder al enlace **"Lanzamiento del Laboratorio para el alumnado de AWS Academy"**.
5. En la interfaz de Vocareum, aceptar los términos de servicio (botón **I Agree** situado en la parte inferior si es el primer acceso).
6. En la parte superior derecha, pulsar **Start Lab**. Cuando el indicador situado junto a la etiqueta "AWS" cambie a color **verde**, pulsar sobre el texto "AWS" para abrir la Consola de Administración.
7. Verificar en la esquina superior derecha que la región activa sea **N. Virginia (`us-east-1`)**.

---

## FASE 2: Preparación del Repositorio de Trabajo (Fork)

El desarrollo se realizará sobre una bifurcación independiente del repositorio oficial.

1. Iniciar sesión en la plataforma [GitHub](https://github.com).
2. Acceder al repositorio base de la práctica:  
   `https://github.com/guillermofoix/pizzeria-base`
3. En la esquina superior derecha, pulsar el botón **Fork**.
4. Mantener seleccionada la opción "Copy the `main` branch only" y pulsar **Create fork**.
5. El repositorio de trabajo personal quedará disponible en la ruta: `https://github.com/TU_USUARIO/pizzeria-base`.

---

## FASE 3: Aprovisionamiento de la Infraestructura en AWS

### 1. Configuración del Grupo de Seguridad (Security Group)

1. En el buscador superior de la consola de AWS, introducir **EC2** y acceder al servicio.
2. En el panel de navegación izquierdo, sección **Red y seguridad**, seleccionar **Grupos de seguridad**.
3. Pulsar **Crear grupo de seguridad**:
   - **Nombre:** `pizzeria-secgroup`
   - **Descripción:** `Reglas de entrada para servidor web de la pizzeria`

> ⚠️ **Aviso crítico de nomenclatura en AWS:**  
> **No utilices nombres que empiecen por `sg-`** (como `sg-pizzeria`). El prefijo `sg-` está estrictamente reservado por Amazon Web Services para los identificadores de sistema (ej. `sg-0123456789abcdef0`) y la consola dará error impidiéndote crearlo. Utiliza siempre `pizzeria-secgroup`.

4. En **Reglas de entrada** (_Inbound rules_), añadir las siguientes reglas (seleccionando en origen `0.0.0.0/0` o _Cualquier lugar - IPv4_):

| Tipo     | Intervalo de puertos | Propósito                                          |
| :------- | :------------------- | :------------------------------------------------- |
| **SSH**  | `22`                 | Acceso por terminal remota (EC2 Instance Connect). |
| **HTTP** | `80`                 | Tráfico web directo y comprobación inicial por IP. |

_(Nota de seguridad perimetral: Gracias a la arquitectura de proxy inverso unificado y Cloudflare Tunnels, **no es necesario abrir puertos adicionales para la base de datos**; PostgreSQL y DbGate se comunican internamente y el túnel opera por conexión saliente cifrada)._

5. Pulsar **Crear grupo de seguridad**.

### 2. Lanzamiento de la Instancia EC2

1. En el panel izquierdo, acceder a **Instancias** y pulsar **Lanzar instancias**.
2. Configurar los siguientes parámetros:
   - **Nombre:** `Pizzeria-TuNombre`
   - **Imágenes de SO (AMI):** Seleccionar **Ubuntu** (Ubuntu Server 24.04 o 22.04 LTS, 64-bit x86).
   - **Tipo de instancia:** Seleccionar **`t3.small`** _(la opción 'micro' carece de los recursos necesarios para orquestar los contenedores)._
   - **Par de claves:** Seleccionar la clave predeterminada (`vockey`).
   - **Configuraciones de red:** Pulsar en _Editar_ → _Seleccionar grupo de seguridad existente_ → Seleccionar el grupo `pizzeria-secgroup`.
   - **Configurar almacenamiento:** Asignar **20 GiB** al volumen principal (gp3).
3. Pulsar **Lanzar instancia**.

---

## FASE 4: Configuración y Despliegue de Servicios

### 1. Acceso a la Terminal Remota

1. En la vista de **Instancias**, marcar la casilla correspondiente al servidor creado.
2. Pulsar el botón superior **Conectar**.
3. En la pestaña **Conexión de la instancia EC2**, mantener el usuario `ubuntu` y pulsar el botón **Conectar**. Se abrirá la consola de comandos del servidor Linux.

### 2. Instalación de Docker y Permisos

Ejecutar los siguientes comandos de forma secuencial.

> **Nota técnica:** Al pegar texto en la terminal web, verifique que no se inserten caracteres de escape (ej. `200~`) al inicio de la línea. Si esto ocurre, bórrelos antes de pulsar Enter.

```bash
# 1. Instalación de Docker Engine oficial
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
rm get-docker.sh

# 2. Configuración de privilegios del usuario
sudo usermod -aG docker $USER
newgrp docker

# 3. Verificación de la instalación
docker compose version
```

---

### 3. Clonación del Repositorio Personal

Clonar la bifurcación propia (reemplazar `TU_USUARIO` por la cuenta personal de GitHub):

```bash
git clone https://github.com/O-Dev-100/pizzeria-base.git https://github.com//pizzeria-base
cd pizzeria-base
```

---

### 4. Variables de Entorno de Producción

Generar el archivo `.env` a partir de la plantilla preconfigurada para producción:

```bash
cp .env.example .env
```

_(Nota: La plantilla ya viene preconfigurada con el puerto estándar `HTTP_PORT=80` y las credenciales seguras)._

---

### 5. Compilación y Puesta en Marcha

Orquestar y compilar los contenedores en segundo plano:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Verificar que los servicios se encuentren en estado **Up**:

```bash
docker compose -f docker-compose.prod.yml ps
```

---

## FASE 5: Verificación y Rutas de Acceso

Obtener la dirección IP pública asignada a la instancia:

```bash
curl -s ifconfig.me
```

Comprobar el funcionamiento desde un navegador web mediante las siguientes direcciones:

| Servicio                              | Ruta de acceso                   | Resultado esperado                                                        |
| :------------------------------------ | :------------------------------- | :------------------------------------------------------------------------ |
| **Portal Web & Cocina KDS**           | `http://<IP_PUBLICA>`            | Interfaz comercial interactiva y panel de pedidos de cocina.              |
| **Diagnóstico de la API**             | `http://<IP_PUBLICA>/api/health` | Respuesta JSON: `{"status":"UP","database":{"connected":true}}`.          |
| **WebApp Móvil Clientes**             | `http://<IP_PUBLICA>/app/`       | Aplicación PWA para clientes y lectura de mesas QR.                       |
| **Gestión de Base de Datos (DbGate)** | `http://<IP_PUBLICA>/dbgate/`    | Gestor visual DbGate con la base de datos `pizzeria_db` ya autoconectada. |

---

## FASE 6: Procedimiento de Cierre y Ahorro de Créditos

El entorno de AWS Academy Learner Lab cuenta con un temporizador de sesión de **4 horas**: si no haces nada, al cumplirse ese tiempo el laboratorio detiene automáticamente las instancias para proteger tu saldo de 100$.

Sin embargo, para ahorrar créditos de forma proactiva al terminar la clase o tu sesión de estudio, es recomendable detener los servicios nosotros mismos con los siguientes pasos:

### 1. Parada manual ordenada
1. **Detener los contenedores desde la terminal:**
   ```bash
   docker compose -f docker-compose.prod.yml stop
   ```
   *(Al volver a arrancar la máquina en la siguiente sesión, los contenedores se iniciarán automáticamente gracias a la política `restart: unless-stopped` o ejecutando `docker compose -f docker-compose.prod.yml start`).*

2. **Detener la instancia en la consola de AWS:**
   - En el menú superior accede a **EC2** → **Instancias**.
   - Selecciona la casilla de tu servidor `Pizzeria-TuNombre`.
   - Pulsa en **Estado de la instancia** → **Detener instancia** (_Stop instance_).
   - Cuando el estado cambie a **Detenido** (_Stopped_), el consumo de cómputo se pausa y ya puedes cerrar la pestaña del navegador.

---

### ⚠️ Reglas importantes para no perder tu trabajo:

* **NUNCA pulsar "End Lab":**  
  En el panel de control de Vocareum / AWS Academy, **jamás hagas clic en el botón rojo "End Lab"**. Si lo pulsas, **se destruirá y borrará de forma irreversible** toda tu infraestructura (la máquina EC2, los volúmenes de disco y todo el código configurado). Para finalizar tu jornada únicamente debes detener la instancia en AWS y cerrar la pestaña.

* **No utilizar `docker compose down -v`:**  
  El modificador `-v` (_volumes_) eliminaría el volumen persistente `pizzeria_prod_pgdata`, provocando la pérdida de la base de datos con los pedidos y productos creados.

---

## SIGUIENTE PASO: Ciclo de Vida y Desarrollo Continuo

Una vez desplegada la infraestructura base, consulta la guía oficial de metodología de trabajo para realizar cambios y mejoras en la aplicación:
👉 **[WORKFLOW.md: Flujo de Desarrollo y Actualización de Despliegues](WORKFLOW.md)**
