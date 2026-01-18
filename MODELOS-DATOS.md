# Modelos de Datos para NRD RRHH

Este documento define los modelos de datos necesarios para el sistema de gestión de recursos humanos.

## Modelos Existentes (en nrd-data-access)

### Employee
```typescript
interface Employee extends BaseEntity {
  name: string;
  roleIds?: string[];
  startDate?: number; // Fecha de ingreso (timestamp) - usada para calcular días de licencia
  endDate?: number;   // Fecha de egreso (timestamp) - usada para calcular licencia no gozada al egreso
}
```

## Modelos Nuevos Necesarios

### License (Licencia)
```typescript
interface License extends BaseEntity {
  employeeId: string;        // ID del empleado
  days: number;              // Días de licencia
  amount: number;            // Monto de la licencia
  startDate?: number;        // Fecha de inicio (timestamp)
  endDate?: number;          // Fecha de fin (timestamp)
  year: number;              // Año de la licencia (ej: 2025)
  notes?: string;            // Notas adicionales
  createdAt?: number;
}
```

### Salary (Salario Mensual)
```typescript
interface Salary extends BaseEntity {
  employeeId: string;        // ID del empleado
  year: number;              // Año (ej: 2025)
  month: number;             // Mes (1-12)
  dailyWage: number;         // Jornal diario
  extras?: number;           // Extras/periodos (opcional)
  baseSalary30Days: number;  // Salario base 30 días (calculado)
  notes?: string;            // Notas adicionales
  createdAt?: number;
}
```

### Vacation (Salario Vacacional)
```typescript
interface Vacation extends BaseEntity {
  employeeId: string;        // ID del empleado
  amount: number;            // Monto del salario vacacional
  year: number;              // Año (ej: 2025)
  paidDate?: number;         // Fecha de pago (timestamp, opcional)
  notes?: string;            // Notas adicionales
  createdAt?: number;
}
```

### Aguinaldo
```typescript
interface Aguinaldo extends BaseEntity {
  employeeId: string;        // ID del empleado
  amount: number;            // Monto del aguinaldo
  year: number;              // Año (ej: 2025)
  paidDate?: number;         // Fecha de pago (timestamp, opcional)
  notes?: string;            // Notas adicionales
  createdAt?: number;
}
```

## Relaciones

- **Employee** → tiene muchas **Licenses**
- **Employee** → tiene muchos **Salaries** (uno por mes)
- **Employee** → tiene un **Vacation** por año
- **Employee** → tiene un **Aguinaldo** por año

## Servicios Necesarios en nrd-data-access

Se necesitan crear los siguientes servicios en `nrd-data-access`:

1. `nrd.licenses` - Servicio para gestionar licencias
2. `nrd.salaries` - Servicio para gestionar salarios
3. `nrd.vacations` - Servicio para gestionar salario vacacional
4. `nrd.aguinaldo` - Servicio para gestionar aguinaldo

Cada servicio debe extender `BaseService` y tener los métodos estándar:
- `getAll()`
- `getById(id)`
- `create(data)`
- `update(id, updates)`
- `delete(id)`
- `queryByChild(childPath, value)` - útil para buscar por `employeeId` o `year`
- `onValue(callback)`
- `onValueById(id, callback)`

## Consultas Comunes

### Obtener todas las licencias de un empleado
```javascript
const licenses = await nrd.licenses.queryByChild('employeeId', employeeId);
```

### Obtener salarios de un empleado por año
```javascript
const salaries = await nrd.salaries.queryByChild('employeeId', employeeId);
const salaries2025 = salaries.filter(s => s.year === 2025);
```

### Obtener salario de un empleado para un mes específico
```javascript
const salaries = await nrd.salaries.queryByChild('employeeId', employeeId);
const salary = salaries.find(s => s.year === 2025 && s.month === 6);
```

### Obtener aguinaldo de un empleado por año
```javascript
const aguinaldos = await nrd.aguinaldo.queryByChild('employeeId', employeeId);
const aguinaldo2025 = aguinaldos.find(a => a.year === 2025);
```
