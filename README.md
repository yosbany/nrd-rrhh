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
├── manifest.json        # Configuración PWA
├── service-worker.js    # Service Worker para PWA
├── assets/              # Archivos estáticos
│   ├── icons/          # Iconos de la aplicación
│   └── styles/         # Estilos CSS
├── modules/             # Módulos específicos del negocio
│   └── business/       # Lógica de negocio (payroll)
└── views/               # Vistas de la aplicación
    ├── dashboard/      # Vista de dashboard
    └── payroll-items/  # Vista de partidas salariales
```

## Desarrollo

La aplicación sigue el mismo patrón arquitectónico que las otras apps del sistema NRD:
- JavaScript ES6 nativo (sin frameworks)
- Tailwind CSS (via CDN)
- Firebase Realtime Database
- NRD Data Access Library (desde CDN)
- NRD Common Library (desde CDN) - módulos comunes (logger, UI, utils, services)

## Modelos de Datos

Ver `MODELOS-DATOS.md` para la definición completa de los modelos de datos necesarios.
