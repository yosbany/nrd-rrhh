# Herramientas de NRD RRHH

Este directorio contiene herramientas útiles para el desarrollo y despliegue de la aplicación.

## Generación de Iconos

### Requisitos

Para generar iconos, necesitas tener instalado `cairosvg`:

```bash
pip3 install --user --break-system-packages cairosvg
```

O usando un entorno virtual:

```bash
python3 -m venv venv
source venv/bin/activate
pip install cairosvg
```

### Uso

Para generar los iconos de la aplicación:

```bash
cd tools/generate-icons
python3 generate-icon.py "NRD Recursos Humanos"
```

O usando el script shell (recomendado):

```bash
./tools/generate-icons/generate-icon.sh "NRD Recursos Humanos"
```

Esto generará:
- `icon-192.png` (192x192 pixels)
- `icon-512.png` (512x512 pixels)

En el directorio raíz del proyecto.

## Servidor Local

### Uso

Para iniciar el servidor HTTP local:

```bash
./tools/nrd-rrhh-server/server.sh
```

El servidor se iniciará en el puerto **8006** y abrirá automáticamente el navegador en `http://localhost:8006`.

Para detener el servidor, ejecuta el mismo comando nuevamente.

### Características

- Actualiza automáticamente las versiones de los assets antes de iniciar
- Abre el navegador automáticamente
- Detecta si ya está corriendo y lo detiene

## Actualización de Versión

El script `tools/update-version/update-version.py` actualiza automáticamente los parámetros de versión en `index.html` para cache busting. Se ejecuta automáticamente cuando inicias el servidor local.
