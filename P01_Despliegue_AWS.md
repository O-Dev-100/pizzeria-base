# Práctica: Despliegue en AWS EC2 de Aplicación Full-Stack
**Módulo:** Despliegue de Aplicaciones Web (2º DAW)  
**Proyecto:** Pizzería Bella Napoli

El objetivo de esta práctica es el despliegue en un entorno de producción (nube pública AWS) de una arquitectura multi-contenedor (frontend, backend, base de datos relacional y proxy inverso).

---

## FASE 1: Acceso y Activación del Entorno AWS Academy

El entorno de AWS Academy Learner Lab requiere la aceptación de los términos de servicio y la superación de una prueba de conocimientos previa para habilitar la infraestructura.

1. Acceder al correo electrónico institucional y localizar la invitación de **Instructure Canvas / AWS Academy**. Proceder al registro y creación de credenciales.
2. Acceder al curso en Canvas y navegar a la sección **Contenidos** (o *Modules*).
3. **Prueba de conocimientos obligatoria:** 
   * Desplegar el módulo **"Conformidad y seguridad del Laboratorio"**.
   * Realizar la **Prueba de conocimientos** sobre las políticas de uso aceptable del entorno. Es necesario obtener una calificación mínima de **70/100** para avanzar (se permiten múltiples intentos).
4. Tras superar la prueba, acceder al enlace **"Lanzamiento del Laboratorio para el alumnado de AWS Academy"**.
5. En la interfaz de Vocareum, aceptar los términos de servicio (botón **I Agree** situado en la parte inferior).
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
   * **Nombre:** `secgroup-pizzeria` *(Nota: AWS no permite nombres que comiencen por el prefijo reservado `sg-`)*
   * **Descripción:** `Reglas de entrada para servidor web y base de datos`
4. En **Reglas de entrada** (*Inbound rules*), añadir las siguientes reglas (seleccionando en origen `0.0.0.0/0` o *Cualquier lugar - IPv4*):

| Tipo | Intervalo de puertos | Propósito |
| :--- | :--- | :--- |
| **SSH** | `22` | Acceso por terminal remota. |
| **HTTP** | `80` | Tráfico del portal web y enrutamiento a la API. |
| **HTTPS** | `443` | Tráfico cifrado. |
| **TCP personalizado** | `8082` | Acceso a la interfaz de gestión de base de datos (Adminer). |

5. Pulsar **Crear grupo de seguridad**.

### 2. Lanzamiento de la Instancia EC2
1. En el panel izquierdo, acceder a **Instancias** y pulsar **Lanzar instancias**.
2. Configurar los siguientes parámetros:
   * **Nombre:** `Pizzeria-TuNombre`
   * **Imágenes de SO (AMI):** Seleccionar **Ubuntu** (Ubuntu Server 24.04 o 22.04 LTS, 64-bit x86).
   * **Tipo de instancia:** Seleccionar **`t3.small`** *(la opción 'micro' carece de los recursos necesarios para orquestar los contenedores).*
   * **Par de claves:** Seleccionar la clave predeterminada (`vockey`).
   * **Configuraciones de red:** Pulsar en *Editar* $\rightarrow$ *Seleccionar grupo de seguridad existente* $\rightarrow$ Seleccionar el grupo `secgroup-pizzeria`.
   * **Configurar almacenamiento:** Asignar **20 GiB** al volumen principal (gp3).
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
*(Nota: La plantilla ya viene configurada con los puertos estándar `HTTP_PORT=80` y `HTTPS_PORT=443`).*

---

### 5. Compilación y Puesta en Marcha
Orquestar y compilar los contenedores en segundo plano:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Verificar que los 5 servicios se encuentren en estado **Up**:

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

| Servicio | Ruta de acceso | Resultado esperado |
| :--- | :--- | :--- |
| **Portal Web & Cocina KDS** | `http://<IP_PUBLICA>` | Interfaz comercial interactiva y panel de pedidos de cocina. |
| **Diagnóstico de la API** | `http://<IP_PUBLICA>/api/health` | Respuesta JSON: `{"status":"UP","database":{"connected":true}}`. |
| **WebApp Móvil Clientes** | `http://<IP_PUBLICA>/app/` | Aplicación PWA para clientes y lectura de mesas QR. |
| **Gestión de Base de Datos** | `http://<IP_PUBLICA>:8082` | Interfaz Adminer (Servidor: `db`, Usuario: `pizzeria_user`). |

---

## FASE 6: Procedimiento de Cierre de Sesión

Para preservar los créditos asignados sin comprometer la persistencia de los datos:

1. **No ejecutar `docker compose down -v`:** La información de pedidos y productos reside en el volumen persistente `pizzeria_prod_pgdata`.
2. Para detener los contenedores en la máquina:
   ```bash
   docker compose -f docker-compose.prod.yml stop
   ```
3. En la consola de AWS: Seleccionar la instancia $\rightarrow$ **Estado de la instancia** $\rightarrow$ **Detener instancia**.
4. En el panel de Vocareum / AWS Academy: Pulsar **End Lab** o **Stop Lab**.

---

## SIGUIENTE PASO: Ciclo de Vida y Desarrollo Continuo

Una vez desplegada la infraestructura base, consulta la guía oficial de metodología de trabajo para realizar cambios y mejoras en la aplicación:
👉 **[WORKFLOW.md: Flujo de Desarrollo y Actualización de Despliegues](WORKFLOW.md)**

