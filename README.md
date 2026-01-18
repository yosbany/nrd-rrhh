# NRD RRHH - Sistema de Gestión de Recursos Humanos

Sistema para gestionar empleados, licencias, salarios, salario vacacional y aguinaldo.

## Características

- **Empleados**: Gestión de empleados y sus datos básicos
- **Licencias**: Control de días y montos de licencias
- **Salarios**: Gestión de salarios mensuales, jornal diario y extras
- **Salario Vacacional**: Control de salario vacacional por empleado
- **Aguinaldo**: Gestión de aguinaldo (bonus de navidad)

## Estructura

```
nrd-rrhh/
├── index.html          # HTML principal
├── app.js              # Controlador principal de navegación
├── auth.js             # Autenticación
├── modal.js            # Sistema de modales y alertas
├── logger.js            # Sistema de logging
├── styles.css           # Estilos mínimos
├── manifest.json        # Configuración PWA
├── service-worker.js    # Service Worker para PWA
├── tabs/                # Módulos por funcionalidad
│   ├── dashboard.js     # Dashboard principal
│   ├── employees.js     # Gestión de empleados
│   ├── licenses.js      # Gestión de licencias
│   ├── salaries.js     # Gestión de salarios
│   ├── vacations.js    # Salario vacacional
│   └── aguinaldo.js    # Aguinaldo
└── tools/              # Herramientas del proyecto
```

## Desarrollo

La aplicación sigue el mismo patrón arquitectónico que las otras apps del sistema NRD:
- JavaScript ES6 nativo (sin frameworks)
- Tailwind CSS (via CDN)
- Firebase Realtime Database
- NRD Data Access Library

## Modelos de Datos

Ver `MODELOS-DATOS.md` para la definición completa de los modelos de datos necesarios.
