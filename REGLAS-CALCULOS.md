# Reglas de Cálculo de RRHH - Sistema NRD

Este documento describe todas las reglas de cálculo implementadas en el sistema NRD RRHH según la legislación uruguaya.

---

## 1. Días Acumulados de Licencia (Licencia Anual)

### Regla Fundamental
**La licencia se genera en función del trabajo realizado durante el año; su goce corresponde al año siguiente, salvo licencia proporcional en el primer año.**

### Cálculo de Días Acumulados

#### Caso 1: Empleado que ingresó durante el año que se está viendo

**Condición**: `startDate >= inicio del año` Y `startDate <= fin del año`

- **Si NO tiene salarios del año**: `díasAcumulados = 0`
- **Si tiene salarios del año**: Cálculo proporcional
  ```
  mesesTrabajados = meses desde fechaIngreso hasta fin del año (inclusive)
  díasAcumulados = Math.floor(mesesTrabajados * 1.66)
  ```

**Ejemplo**:
- Empleado ingresó el 15 de marzo de 2022
- Tiene salarios de marzo-diciembre 2022 (10 meses)
- Días acumulados 2022: `Math.floor(10 * 1.66) = 16 días`

#### Caso 2: Empleado que ingresó antes del año que se está viendo

**Condición**: `startDate < inicio del año`

**Subcaso 2.1: No trabajó el año completo (año parcial)**

```
mesesTrabajados = meses trabajados en el año (basado en salarios o fecha)
díasAcumulados = Math.floor(mesesTrabajados * 1.66)
```

**Subcaso 2.2: Trabajó el año completo (12 meses)**

Se calcula basándose en los años completos trabajados hasta el final del año anterior:

```
añosCompletos = años trabajados hasta 31 de diciembre del año anterior
díasAcumulados = 20 + Math.floor((añosCompletos - 1) / 4)
```

**Fórmula de años completos trabajados**:
- Calcular diferencia entre `31 de diciembre del año anterior` y `fecha de ingreso`
- Ajustar si no ha completado el año completo (mes/día)

**Ejemplos de días por años completos**:
- Años 1-4: **20 días**
- Año 5: **21 días** (20 + Math.floor((5-1)/4) = 21)
- Año 9: **22 días** (20 + Math.floor((9-1)/4) = 22)
- Año 13: **23 días** (20 + Math.floor((13-1)/4) = 23)
- Año 17: **24 días** (20 + Math.floor((17-1)/4) = 24)

#### Caso 3: Empleado sin fecha de ingreso (fallback)

```
mesesTrabajados = cantidad de salarios registrados en el año
díasAcumulados = Math.floor(mesesTrabajados * 1.66)
```

### Reglas Importantes

1. **Redondeo**: Siempre usar `Math.floor()`, NUNCA `Math.ceil()`
2. **Cálculo de meses**: 
   - Un mes se considera trabajado si existe al menos un salario registrado en ese mes.
   - La fecha de ingreso se utiliza solo como fallback cuando no hay salarios registrados.
   - **Motivo**: Evita inconsistencias entre cálculo por fecha vs cálculo por salarios. Unifica criterio para todo el sistema.
3. **Año de visualización vs Año de generación**:
   - **Año de visualización**: En la interfaz, al visualizar el año X, se muestran los días de licencia generados en X-1, ya que la licencia se goza al año siguiente.
   - **Motivo**: Evita confundir regla de UI con regla legal de cálculo. Aclara que es una decisión de presentación, no de negocio.

---

## 2. Días Tomados y Saldo de Licencia

### Regla Fundamental
**La licencia se imputa al año en que se genera.**

### Cálculo de Días Tomados

```
díasTomados = suma de días tomados (licencias) del año específico
```

**IMPORTANTE**: Solo se descuentan días gozados del año que se está calculando. NO se descuentan licencias de años futuros.

### Cálculo de Saldo (Días Restantes)

```
saldo = Math.max(0, díasAcumulados - díasTomados)
```

**Ejemplo**:
- Año 2022: Se generaron 20 días
- Año 2022: Se gozaron 15 días
- **Saldo 2022**: 20 - 15 = 5 días
- **NO descontar** días gozados en 2023 del saldo de 2022

---

## 3. Salario Vacacional vs Licencia No Gozada

### Conceptos Diferentes

**NO son el mismo concepto.** Son dos conceptos legales distintos que se calculan en momentos diferentes.

### Salario Vacacional

**Cuándo se calcula**: Solo cuando la licencia se **goza** (se toma)

**Cuándo se paga**: Durante el período de goce de licencia

**Fórmula**:
```
salarioPromedioMensual = promedio de salarios de los últimos 12 meses o meses disponibles
jornalDiario = salarioPromedioMensual / 30
salarioVacacional = jornalDiario * díasGozados
```

**Nota**: Se recomienda usar el promedio de los últimos 12 meses para alinear el criterio con el usado en licencia no gozada y reducir riesgo de subestimación.

**Condición**: Solo se calcula si el empleado está **activo** (no tiene `endDate`)

### Licencia No Gozada

**Cuándo se calcula**: Solo al **egreso** del empleado (`endDate` existe)

**Cuándo se paga**: Al momento del egreso

**Fórmula**:
```
promedioÚltimos12Meses = promedio de haberes de últimos 12 meses
  (suma de baseSalary30Days + extras de últimos 12 meses) / cantidad de meses
jornalDiarioPromedio = promedioÚltimos12Meses / 30
licenciaNoGozada = jornalDiarioPromedio * díasRestantes
```

**Condición**: Solo se calcula si el empleado tiene `endDate` (terminó su relación laboral)

### Regla Crítica

**Nunca calcular ambos a la vez.**

- Si el empleado está **activo** y goza licencia → Solo calcular **Salario Vacacional**
- Si el empleado **egresa** → Solo calcular **Licencia No Gozada**

---

## 4. Aguinaldo

### Períodos Legales (Uruguay)

**1er semestre**: 1° diciembre del año anterior → 31 mayo del año actual
- Ejemplo: Para año 2023: 1° dic 2022 → 31 may 2023

**2do semestre**: 1° junio → 30 noviembre del año actual
- Ejemplo: Para año 2023: 1° jun 2023 → 30 nov 2023

### Fórmula Correcta

**NO usar promedios mensuales**
**NO usar meses / 12**

**El cálculo se basa en haberes reales percibidos**

```
1er semestre:
  salarios = salarios de diciembre (año anterior) + enero a mayo (año actual)
  totalHaberesGravados = suma(baseSalary30Days + extras) de todos los salarios del semestre
  aguinaldo = totalHaberesGravados / 12

2do semestre:
  salarios = salarios de junio a noviembre (año actual)
  totalHaberesGravados = suma(baseSalary30Days + extras) de todos los salarios del semestre
  aguinaldo = totalHaberesGravados / 12
```

### Ejemplo

**1er semestre 2023**:
- Dic 2022: $1,000,000
- Ene 2023: $1,000,000
- Feb 2023: $1,000,000
- Mar 2023: $1,000,000
- Abr 2023: $1,000,000
- May 2023: $1,000,000
- Total: $6,000,000
- Aguinaldo: $6,000,000 / 12 = **$500,000**

**2do semestre 2023**:
- Jun 2023: $1,000,000
- Jul 2023: $1,000,000
- Ago 2023: $1,000,000
- Sep 2023: $1,000,000
- Oct 2023: $1,000,000
- Nov 2023: $1,000,000
- Total: $6,000,000
- Aguinaldo: $6,000,000 / 12 = **$500,000**

### NO Hacer

❌ Promedio mensual * (meses/12)
❌ Promedio mensual * 0.5
❌ Usar meses trabajados / 12

---

## 5. Filtrado de Empleados por Año

### Regla de Visualización

**En las partidas salariales por año, solo se muestran los empleados vigentes en ese año.**

### Criterio de Vigencia

Un empleado está vigente en un año si:

1. **Fecha de ingreso**: Debe haber comenzado antes o durante el año
   ```
   startDate <= 31 de diciembre del año
   ```

2. **Fecha de egreso** (si existe): Debe haber terminado después o durante el año
   ```
   endDate >= 1 de enero del año
   ```
   O no tener `endDate` (empleado activo)

### Ejemplo

**Año 2022**:
- ✅ Empleado ingresó en marzo 2022 → Vigente
- ✅ Empleado ingresó en enero 2021, sin egreso → Vigente
- ✅ Empleado ingresó en enero 2021, egresó en octubre 2022 → Vigente
- ❌ Empleado ingresó en enero 2023 → NO vigente
- ❌ Empleado ingresó en enero 2021, egresó en diciembre 2021 → NO vigente

---

## 6. Recalculación Automática

### Cuándo se Recalcula

Los cálculos se recalculan automáticamente cuando:

1. **Se guarda un salario**: Recalcula aguinaldo y salario vacacional/licencia no gozada
2. **Se guarda una licencia**: Recalcula salario vacacional (si empleado activo)
3. **Se actualiza fecha de egreso**: Recalcula licencia no gozada (si tiene `endDate`)

### Lógica de Recalculación

```javascript
if (empleado tiene endDate) {
  calcularLicenciaNoGozada()
} else {
  calcularSalarioVacacional() // Solo si hay días gozados
}
calcularAguinaldo() // Siempre
```

**Nota técnica**: El aguinaldo se recalcula siempre que se guarda un salario, ya que cualquier cambio en los haberes gravados afecta el cálculo del semestre correspondiente.

---

## 7. Redondeo y Precisión

### Reglas de Redondeo

1. **Días acumulados**: `Math.floor()` (nunca hacia arriba)
2. **Montos monetarios**: Redondeo a 2 decimales
   ```
   monto = Math.round(monto * 100) / 100
   ```

### Ejemplos de Redondeo

- `Math.floor(9.96)` = 9 días (no 10)
- `Math.floor(4.98)` = 4 días (no 5)
- `$1234.567` → `$1234.57`
- `$1000.001` → `$1000.00`

---

## 8. Separación de Conceptos Temporales

### Mantener Separados

- **Año de generación de licencia**: Año en que se generan los días
- **Año de goce**: Año en que se gozan los días
- **Año de liquidación**: Año en que se liquida/paga
- **Año de egreso**: Año en que el empleado egresa (si aplica)

### Regla Crítica

**NO cruzar años sin criterio legal.**

Cada concepto debe calcularse para su año correspondiente sin mezclar años arbitrariamente.

---

## 9. Resumen de Fórmulas

| Concepto | Fórmula |
|----------|---------|
| **Días Generados (año completo)** | `20 + Math.floor((añosCompletos - 1) / 4)` |
| **Días Generados (año incompleto)** | `Math.floor(mesesTrabajados * 1.66)` |
| **Saldo de Licencia** | `Math.max(0, díasAcumulados - díasTomadosDelAño)` |
| **Salario Vacacional** | `(promedioSalarioMensual / 30) * díasGozados` |
| **Licencia No Gozada** | `(promedioÚltimos12Meses / 30) * díasRestantes` |
| **Aguinaldo Semestre** | `sumaHaberesGravadosDelSemestre / 12` |

---

## 10. Casos Especiales

### Empleado sin fecha de ingreso

- Usar cantidad de salarios registrados como meses trabajados
- Calcular proporcionalmente: `Math.floor(meses * 1.66)`

### Empleado sin salarios del año

- Si ingresó durante el año pero no tiene salarios → 0 días acumulados
- Si ingresó antes del año pero no trabajó → 0 días acumulados

### Empleado con menos de 12 meses de salarios

- Para licencia no gozada: Usar promedio de los meses disponibles (no forzar 12 meses)

### Aguinaldo con meses faltantes

- Si faltan meses del semestre, se calcula con los meses disponibles
- No se extrapola ni se promedia

---

## 11. Validaciones y Errores

### Validaciones Implementadas

1. Verificar que `employeeId` y `year` sean válidos
2. Verificar que los servicios de datos estén disponibles
3. Manejar errores sin romper el flujo (usar `Promise.allSettled`)
4. Logging de errores para debugging

### Manejo de Errores

- Si falla un cálculo, se registra el error pero no se detiene el proceso
- Se usan valores por defecto (0) cuando no hay datos disponibles
- Se mantienen datos existentes si el cálculo falla

---

## 12. Archivos de Implementación

- **`utils/payroll-calculations.js`**: Funciones de cálculo principales
- **`tabs/payroll-items.js`**: Cálculos en la interfaz y visualización
- **`tabs/dashboard.js`**: Cálculos para el dashboard general

---

## Notas Finales

- Todas las fórmulas están basadas en la legislación uruguaya
- Los cálculos se realizan automáticamente al guardar datos
- Los valores se redondean según las reglas establecidas
- Se mantiene separación entre conceptos legales distintos
