# Servicios Creados en nrd-data-access

## ✅ Servicios Implementados

Se han creado los siguientes servicios en `nrd-data-access` para el sistema de RRHH:

### 1. LicensesService (`nrd.licenses`)
- **Modelo**: `License`
- **Colección**: `licenses`
- **Métodos disponibles**:
  - `getAll()` - Obtener todas las licencias
  - `getById(id)` - Obtener licencia por ID
  - `create(data)` - Crear nueva licencia
  - `update(id, updates)` - Actualizar licencia
  - `delete(id)` - Eliminar licencia
  - `queryByChild('employeeId', employeeId)` - Obtener licencias de un empleado
  - `queryByChild('year', year)` - Obtener licencias de un año
  - `onValue(callback)` - Escuchar cambios en tiempo real
  - `onValueById(id, callback)` - Escuchar cambios de una licencia específica

### 2. SalariesService (`nrd.salaries`)
- **Modelo**: `Salary`
- **Colección**: `salaries`
- **Métodos disponibles**: (mismos que LicensesService)
  - `queryByChild('employeeId', employeeId)` - Obtener salarios de un empleado
  - `queryByChild('year', year)` - Obtener salarios de un año

### 3. VacationsService (`nrd.vacations`)
- **Modelo**: `Vacation`
- **Colección**: `vacations`
- **Métodos disponibles**: (mismos que LicensesService)
  - `queryByChild('employeeId', employeeId)` - Obtener salario vacacional de un empleado
  - `queryByChild('year', year)` - Obtener salario vacacional de un año

### 4. AguinaldoService (`nrd.aguinaldo`)
- **Modelo**: `Aguinaldo`
- **Colección**: `aguinaldo`
- **Métodos disponibles**: (mismos que LicensesService)
  - `queryByChild('employeeId', employeeId)` - Obtener aguinaldo de un empleado
  - `queryByChild('year', year)` - Obtener aguinaldo de un año

## Modelos de Datos

### License
```typescript
interface License {
  id?: string;
  employeeId: string;
  days: number;
  amount: number;
  startDate?: number;
  endDate?: number;
  year: number;
  notes?: string;
  createdAt?: number;
}
```

### Salary
```typescript
interface Salary {
  id?: string;
  employeeId: string;
  year: number;
  month: number; // 1-12
  dailyWage: number;
  extras?: number;
  baseSalary30Days: number;
  notes?: string;
  createdAt?: number;
}
```

### Vacation
```typescript
interface Vacation {
  id?: string;
  employeeId: string;
  amount: number;
  year: number;
  paidDate?: number;
  notes?: string;
  createdAt?: number;
}
```

### Aguinaldo
```typescript
interface Aguinaldo {
  id?: string;
  employeeId: string;
  amount: number;
  year: number;
  paidDate?: number;
  notes?: string;
  createdAt?: number;
}
```

## Ejemplos de Uso

### Obtener todas las licencias de un empleado
```javascript
const licenses = await nrd.licenses.queryByChild('employeeId', 'employee-id');
```

### Obtener salarios de un empleado para un año
```javascript
const allSalaries = await nrd.salaries.queryByChild('employeeId', 'employee-id');
const salaries2025 = allSalaries.filter(s => s.year === 2025);
```

### Obtener salario de un mes específico
```javascript
const allSalaries = await nrd.salaries.queryByChild('employeeId', 'employee-id');
const salary = allSalaries.find(s => s.year === 2025 && s.month === 6); // Junio 2025
```

### Crear una nueva licencia
```javascript
const license = {
  employeeId: 'employee-id',
  days: 7,
  amount: 22134,
  year: 2025,
  startDate: Date.now(),
  notes: 'Licencia por enfermedad'
};
const licenseId = await nrd.licenses.create(license);
```

### Crear salario mensual
```javascript
const salary = {
  employeeId: 'employee-id',
  year: 2025,
  month: 6, // Junio
  dailyWage: 3900.00,
  extras: 3500.00,
  baseSalary30Days: 99000.00
};
const salaryId = await nrd.salaries.create(salary);
```

### Escuchar cambios en tiempo real
```javascript
const unsubscribe = nrd.licenses.onValue((licenses) => {
  console.log('Licencias actualizadas:', licenses);
  // Actualizar UI aquí
});

// Para desuscribirse:
unsubscribe();
```

## Próximos Pasos

1. ✅ Modelos creados en `src/models/index.ts`
2. ✅ Servicios creados en `src/services/`
3. ✅ Servicios registrados en `src/index.ts`
4. ⏳ Compilar el proyecto: `npm run build` (en nrd-data-access)
5. ⏳ Actualizar módulos de nrd-rrhh para usar los nuevos servicios

## Notas

- Los servicios extienden `BaseService`, por lo que tienen todos los métodos estándar de CRUD
- `queryByChild` es muy útil para buscar por `employeeId` o `year`
- Los timestamps se manejan como números (milisegundos desde epoch)
- Los meses van de 1-12 (no 0-11 como en JavaScript Date)
