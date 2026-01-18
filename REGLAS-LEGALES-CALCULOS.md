# Reglas Legales para Cálculos de RRHH

Este documento establece las reglas legales correctas para los cálculos de licencias, salario vacacional y aguinaldo según la legislación uruguaya.

## 1. Licencia Anual (Días Generados)

### Licencia Legal Completa (año completo trabajado)

**Base legal**: 20 días corridos por año trabajado.

**Incremento por antigüedad**: Se incrementa +1 día cada 4 años de antigüedad.

**Fórmula correcta**:
```javascript
daysGenerated = 20 + Math.floor((yearsWorked - 1) / 4)
```

**Ejemplos**:
- Años 1-4: 20 días
- Año 5: 21 días (20 + Math.floor((5-1)/4) = 20 + 1 = 21)
- Año 9: 22 días (20 + Math.floor((9-1)/4) = 20 + 2 = 22)
- Año 13: 23 días (20 + Math.floor((13-1)/4) = 20 + 3 = 23)
- Año 17: 24 días (20 + Math.floor((17-1)/4) = 20 + 4 = 24)

### Licencia Proporcional (año incompleto)

**Base legal**: Se genera a razón de 1,66 días por mes trabajado.

**IMPORTANTE**: NO redondear siempre hacia arriba.

**Fórmula correcta**:
```javascript
daysGenerated = Math.floor(monthsWorked * 1.66)
// O alternativamente:
daysGenerated = Math.round(monthsWorked * 1.66)
```

**NO usar**: `Math.ceil()` (redondeo hacia arriba automático)

**Ejemplos**:
- 6 meses: Math.floor(6 * 1.66) = Math.floor(9.96) = 9 días
- 3 meses: Math.floor(3 * 1.66) = Math.floor(4.98) = 4 días

## 2. Licencia Gozada / Saldo

### Regla Fundamental

**La licencia se imputa al año en que se genera.**

Al calcular un año específico (ej. 2024), **solo descontar días gozados con cargo a ese año**.

**NO descontar licencias de años futuros.**

**Fórmula correcta**:
```javascript
daysRemaining = daysGenerated - daysTakenFromThatYear
```

**Ejemplo**:
- Año 2024: Se generan 20 días
- Año 2024: Se gozaron 15 días
- **Saldo 2024**: 20 - 15 = 5 días
- **NO descontar** días gozados en 2025 del saldo de 2024

## 3. Licencia No Gozada vs Salario Vacacional

### Conceptos Diferentes

**NO son el mismo concepto.**

### Licencia No Gozada

- **Cuándo se calcula**: Solo al egreso del empleado
- **Qué representa**: Días de licencia acumulados que no fueron gozados
- **Cuándo se paga**: Al momento del egreso

### Salario Vacacional

- **Cuándo se calcula**: Solo cuando la licencia se goza
- **Qué representa**: Pago correspondiente a los días de licencia que se están gozando
- **Cuándo se paga**: Durante el período de goce de licencia

### Regla Crítica

**Nunca calcular ambos a la vez.**

- Si el empleado está activo y goza licencia → Solo calcular **Salario Vacacional**
- Si el empleado egresa → Solo calcular **Licencia No Gozada**

## 4. Monto de Licencia No Gozada

### Cálculo Solo en Egreso

**Base legal**: Usar promedio de haberes de los últimos 12 meses (o criterio equivalente).

**NO usar automáticamente el último jornal.**

**Fórmula correcta**:
```javascript
// Calcular promedio diario de los últimos 12 meses
averageDailyWageLast12Months = totalHaberesLast12Months / (12 * 30)

// Calcular licencia no gozada
licenciaNoGozada = daysRemaining * averageDailyWageLast12Months
```

**Alternativa (si no hay 12 meses)**:
- Usar promedio de los meses disponibles
- O usar criterio legal equivalente

## 5. Aguinaldo (Uruguay)

### Períodos Correctos

**1er semestre**: 1° diciembre → 31 mayo (6 meses)

**2do semestre**: 1° junio → 30 noviembre (6 meses)

### Fórmula Correcta

**NO usar promedios mensuales**

**NO usar meses / 12**

**El cálculo se basa en haberes reales percibidos**

**Fórmula correcta**:
```javascript
// Sumar TODOS los haberes gravados del semestre
totalHaberesGravadosDelSemestre = sum(salaries.baseSalary30Days + salaries.extras)

// Dividir entre 12
aguinaldoSemestre = totalHaberesGravadosDelSemestre / 12
```

**Ejemplo**:
- 1er semestre (dic-may): 6 salarios de $1,000,000 cada uno
- Total haberes: $6,000,000
- Aguinaldo: $6,000,000 / 12 = $500,000

**NO hacer**:
- ❌ Promedio mensual * (meses/12)
- ❌ Promedio mensual * 0.5

## 6. Separación de Conceptos Temporales

### Mantener Separados

- **Año de generación de licencia**: Año en que se generan los días
- **Año de goce**: Año en que se gozan los días
- **Año de liquidación**: Año en que se liquida/paga
- **Año de egreso**: Año en que el empleado egresa (si aplica)

### Regla Crítica

**NO cruzar años sin criterio legal.**

Cada concepto debe calcularse para su año correspondiente sin mezclar años arbitrariamente.

## 7. Reglas Generales

### No Redondear en Beneficio Automático

- Usar `Math.floor()` o `Math.round()` según corresponda
- NO usar `Math.ceil()` automáticamente

### No Mezclar Conceptos Legales Distintos

- Licencia no gozada ≠ Salario vacacional
- Aguinaldo ≠ Licencia
- Mantener cada concepto separado

### El Modelo Debe Soportar

1. **Empleado activo**: Cálculo de días generados y saldo
2. **Licencia gozada**: Cálculo de salario vacacional
3. **Egreso**: Cálculo de licencia no gozada
4. **Liquidación final**: Cálculo de todos los conceptos pendientes

## Resumen de Fórmulas Correctas

| Concepto | Fórmula |
|----------|---------|
| **Días Generados (año completo)** | `20 + Math.floor((yearsWorked - 1) / 4)` |
| **Días Generados (año incompleto)** | `Math.floor(monthsWorked * 1.66)` |
| **Saldo de Licencia** | `daysGenerated - daysTakenFromThatYear` |
| **Licencia No Gozada (egreso)** | `daysRemaining * averageDailyWageLast12Months` |
| **Salario Vacacional (goce)** | `daysGozados * dailyWage` |
| **Aguinaldo Semestre** | `totalHaberesGravadosDelSemestre / 12` |

## Implementación

Ver archivos:
- `utils/payroll-calculations.js`: Funciones de cálculo
- `tabs/payroll-items.js`: Cálculos en la interfaz
