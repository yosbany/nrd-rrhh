// Payroll Items Management - Consolidated view (ES Module)
// Using NRDCommon from CDN (loaded in index.html)
const logger = window.logger || console;
const escapeHtml = window.escapeHtml || ((text) => String(text));
const getMonthName = window.getMonthName || ((m) => ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][m-1] || '');
// Use the function from nrd-rrhh/modules/utils.js (loaded in index.html)
const isEmployeeActiveInYear = window.isEmployeeActiveInYear || ((employee, year) => {
  // Fallback implementation if module not loaded
  if (!employee) return false;
  
  const targetYear = typeof year === 'number' ? year : parseInt(year);
  if (isNaN(targetYear)) return false;
  
  // Check startDate: if employee started AFTER the target year, they were NOT active
  if (employee.startDate) {
    const startDate = new Date(employee.startDate);
    if (!isNaN(startDate.getTime())) {
      const startYear = startDate.getFullYear();
      if (startYear > targetYear) {
        return false; // Employee started after the target year
      }
    }
  }
  
  // Check endDate: if employee ended BEFORE the target year, they were NOT active
  if (employee.endDate) {
    const endDate = new Date(employee.endDate);
    if (!isNaN(endDate.getTime())) {
      const endYear = endDate.getFullYear();
      if (endYear < targetYear) {
        return false; // Employee ended before the target year
      }
    }
  }
  
  return true; // Employee was active during the year
});
const formatNumber = window.formatNumber || ((v) => String(v));
const formatCurrency = window.formatCurrency || ((v) => '$' + String(v));
const parseDecimalWithComma = window.parseDecimalWithComma || ((v) => parseFloat(String(v).replace(',', '.')) || null);
const formatDecimalWithComma = window.formatDecimalWithComma || ((v) => String(v).replace('.', ','));
const showSpinner = window.showSpinner || (() => {});
const hideSpinner = window.hideSpinner || (() => {});
const showConfirm = window.showConfirm || (() => Promise.resolve(false));
const showSuccess = window.showSuccess || (() => Promise.resolve());
const showError = window.showError || (() => Promise.resolve());

// Get nrd instance (initialized in index.html)
// Get nrd instance dynamically (initialized in index.html)
// Don't cache it at module level as it may not be available yet

let payrollItemsListener = null;
let employeesData = {};
let salariesData = {};
let licensesData = {};
let vacationsData = {};
let aguinaldoData = {};
let currentYear = new Date().getFullYear();
let selectedEmployeeId = null;
let filteredEmployeeId = null; // For employee filter in payroll items view

// Helper functions to generate formula tooltips for payroll calculations
function getDaysAccumulatedFormula(summary, currentYear) {
  return `Días acumulados para ${currentYear}:\n` +
    `- Basado en años de servicio hasta fin de ${currentYear - 1}\n` +
    `- Fórmula: 20 días base + Math.floor((años trabajados - 1) / 4)\n` +
    `- Si trabajó año completo: cálculo por años\n` +
    `- Si trabajó parcial: cálculo proporcional por días trabajados (1.66/30 por día), redondeo hacia arriba`;
}

function getDaysRemainingFormula(summary, currentYear) {
  return `Saldo de días:\n` +
    `- Fórmula: Días Acumulados - Días Gozados\n` +
    `- Días Acumulados: ${summary.daysAccumulated || 0}\n` +
    `- Días Gozados: ${summary.daysTakenCurrentYear || 0}\n` +
    `- Resultado: ${Math.max(0, (summary.daysAccumulated || 0) - (summary.daysTakenCurrentYear || 0))}`;
}

function getVacationSalaryFormula(summary, lastSalaryInfo) {
  if (!lastSalaryInfo || !lastSalaryInfo.dailyWage) {
    return `Salario Vacacional:\n` +
      `- Fórmula: Días Restantes × Jornal Diario\n` +
      `- Días Restantes: ${summary.daysRemaining || 0}\n` +
      `- Jornal Diario: Último salario registrado del año actual\n` +
      `- Se calcula basado en el último recibo de salario del año`;
  }
  
  return `Salario Vacacional:\n` +
    `- Fórmula: Días Restantes × Jornal Diario\n` +
    `- Días Restantes: ${summary.daysRemaining || 0}\n` +
    `- Jornal Diario: $${formatNumber(lastSalaryInfo.dailyWage)}\n` +
    `- Último salario: ${getMonthName(lastSalaryInfo.month)} ${lastSalaryInfo.year}\n` +
    `- Cálculo: ${summary.daysRemaining || 0} × $${formatNumber(lastSalaryInfo.dailyWage)} = $${formatNumber((summary.daysRemaining || 0) * lastSalaryInfo.dailyWage)}`;
}

function getLicenseNotTakenFormula(summary, lastSalaryInfo) {
  if (!lastSalaryInfo || !lastSalaryInfo.dailyWage) {
    return `Licencia No Gozada:\n` +
      `- Fórmula: Días Restantes × Jornal Diario\n` +
      `- Días Restantes: ${summary.daysRemaining || 0}\n` +
      `- Jornal Diario: Último salario registrado del año actual\n` +
      `- Solo se calcula al egreso del empleado`;
  }
  
  return `Licencia No Gozada:\n` +
    `- Fórmula: Días Restantes × Jornal Diario\n` +
    `- Días Restantes: ${summary.daysRemaining || 0}\n` +
    `- Jornal Diario: $${formatNumber(lastSalaryInfo.dailyWage)}\n` +
    `- Último salario: ${getMonthName(lastSalaryInfo.month)} ${lastSalaryInfo.year}\n` +
    `- Cálculo: ${summary.daysRemaining || 0} × $${formatNumber(lastSalaryInfo.dailyWage)} = $${formatNumber((summary.daysRemaining || 0) * lastSalaryInfo.dailyWage)}\n` +
    `- Solo se calcula al egreso del empleado`;
}

function getAguinaldoFormula(summary, semester, displayYear, currentYear, semesterSalaries) {
  const semesterLabel = semester === 'first' 
    ? `1er Semestre (Dic ${displayYear} - May ${currentYear})`
    : `2do Semestre (Jun ${currentYear} - Nov ${currentYear})`;
  
  const amount = semester === 'first' 
    ? summary.firstSemesterAguinaldo || 0
    : summary.secondSemesterAguinaldo || 0;
  
  if (!semesterSalaries || semesterSalaries.length === 0) {
    return `Aguinaldo ${semesterLabel}:\n` +
      `- Fórmula: Total Haberes Gravados del Semestre / 12\n` +
      `- No hay salarios registrados para este semestre`;
  }
  
  const totalHaberes = semesterSalaries.reduce((sum, s) => {
    const base = parseFloat(s.baseSalary30Days) || 0;
    const extras = parseFloat(s.extras) || 0;
    return sum + (base + extras);
  }, 0);
  
  return `Aguinaldo ${semesterLabel}:\n` +
    `- Fórmula: Total Haberes Gravados del Semestre / 12\n` +
    `- Total Haberes: $${formatNumber(totalHaberes)}\n` +
    `- Meses en semestre: ${semesterSalaries.length}\n` +
    `- Cálculo: $${formatNumber(totalHaberes)} / 12 = $${formatNumber(amount)}`;
}

function setupDecimalInput(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  // Allow only numbers, comma, and dot
  input.addEventListener('input', (e) => {
    let value = e.target.value;
    // Replace dot with comma
    value = value.replace(/\./g, ',');
    // Remove any character that's not a digit or comma
    value = value.replace(/[^\d,]/g, '');
    // Only allow one comma
    const parts = value.split(',');
    if (parts.length > 2) {
      value = parts[0] + ',' + parts.slice(1).join('');
    }
    e.target.value = value;
  });
  
  // On blur, format the value
  input.addEventListener('blur', (e) => {
    const value = parseDecimalWithComma(e.target.value);
    if (value !== null) {
      e.target.value = formatDecimalWithComma(value);
    }
  });
}

// Load all data
async function loadAllData() {
  try {
    if (typeof logger !== 'undefined' && logger.debug) {
      logger.debug('Starting loadAllData');
    }
    
    // Get nrd instance dynamically
    const nrd = window.nrd;
    if (!nrd) {
      throw new Error('NRD service not available');
    }
    
    // Load all data in parallel with individual error handling
    const [employees, salaries, licenses, vacations, aguinaldos] = await Promise.allSettled([
      (nrd.employees?.getAll() || Promise.resolve([])).catch(e => { 
        if (typeof logger !== 'undefined' && logger.warn) logger.warn('Error loading employees', e); 
        return []; 
      }),
      (nrd.salaries?.getAll() || Promise.resolve([])).catch(e => { 
        if (typeof logger !== 'undefined' && logger.warn) logger.warn('Error loading salaries', e); 
        return []; 
      }),
      (nrd.licenses?.getAll() || Promise.resolve([])).catch(e => { 
        if (typeof logger !== 'undefined' && logger.warn) logger.warn('Error loading licenses', e); 
        return []; 
      }),
      (nrd.vacations?.getAll() || Promise.resolve([])).catch(e => { 
        if (typeof logger !== 'undefined' && logger.warn) logger.warn('Error loading vacations', e); 
        return []; 
      }),
      (nrd.aguinaldo?.getAll() || Promise.resolve([])).catch(e => { 
        if (typeof logger !== 'undefined' && logger.warn) logger.warn('Error loading aguinaldo', e); 
        return []; 
      })
    ]);
    
    // Process employees
    const employeesValue = employees.status === 'fulfilled' ? employees.value : [];
    employeesData = Array.isArray(employeesValue)
      ? employeesValue.reduce((acc, employee) => {
          if (employee && employee.id) acc[employee.id] = employee;
          return acc;
        }, {})
      : employeesValue || {};

    // Process salaries
    const salariesValue = salaries.status === 'fulfilled' ? salaries.value : [];
    salariesData = Array.isArray(salariesValue)
      ? salariesValue.reduce((acc, salary) => {
          if (salary && salary.id) acc[salary.id] = salary;
          return acc;
        }, {})
      : salariesValue || {};

    // Process licenses
    const licensesValue = licenses.status === 'fulfilled' ? licenses.value : [];
    licensesData = Array.isArray(licensesValue)
      ? licensesValue.reduce((acc, license) => {
          if (license && license.id) acc[license.id] = license;
          return acc;
        }, {})
      : licensesValue || {};

    // Process vacations
    const vacationsValue = vacations.status === 'fulfilled' ? vacations.value : [];
    vacationsData = Array.isArray(vacationsValue)
      ? vacationsValue.reduce((acc, vacation) => {
          if (vacation && vacation.id) acc[vacation.id] = vacation;
          return acc;
        }, {})
      : vacationsValue || {};

    // Process aguinaldo
    const aguinaldosValue = aguinaldos.status === 'fulfilled' ? aguinaldos.value : [];
    aguinaldoData = Array.isArray(aguinaldosValue)
      ? aguinaldosValue.reduce((acc, aguinaldo) => {
          if (aguinaldo && aguinaldo.id) acc[aguinaldo.id] = aguinaldo;
          return acc;
        }, {})
      : aguinaldosValue || {};

    if (typeof logger !== 'undefined' && logger.debug) {
      logger.debug('Finished loadAllData', {
        employees: Object.keys(employeesData).length,
        salaries: Object.keys(salariesData).length,
        licenses: Object.keys(licensesData).length,
        vacations: Object.keys(vacationsData).length,
        aguinaldo: Object.keys(aguinaldoData).length
      });
    }
  } catch (error) {
    if (typeof logger !== 'undefined' && logger.error) {
      logger.error('Error loading data', error);
    }
    console.error('Error loading data:', error);
    throw error; // Re-throw to be caught by caller
  }
}

// Calculate employee payroll summary
// When viewing year X, show data from year X-1
// Example: viewing 2026 shows 2025 data
function calculateEmployeeSummary(employeeId, viewingYear = null) {
  // If viewingYear is provided, use it; otherwise default to currentYear - 1
  // This allows the function to be called with a specific year when viewing employee details
  const displayYear = viewingYear !== null ? viewingYear - 1 : currentYear - 1;
  const recordsYearForCalculation = viewingYear !== null ? viewingYear : currentYear;
  
  const yearSalaries = Object.values(salariesData).filter(s => 
    s.employeeId === employeeId && s.year === displayYear
  );
  
  // Get licenses from displayYear (the year we're showing data for)
  const yearLicenses = Object.values(licensesData).filter(l => 
    l.employeeId === employeeId && l.year === displayYear
  );
  
  // Get vacation record for this year (may contain vacation salary or license not taken)
  // Note: We get it for displayYear but won't use its amount for active employees
  const vacation = Object.values(vacationsData).find(v => 
    v.employeeId === employeeId && v.year === displayYear
  );
  
  // Also check if there's a vacation record for recordsYearForCalculation (current year)
  // This might have more up-to-date information
  const vacationCurrentYear = Object.values(vacationsData).find(v => 
    v.employeeId === employeeId && v.year === recordsYearForCalculation
  );
  
  // Get employee to check if they have endDate (egreso)
  const employee = employeesData[employeeId];
  const hasEndDate = employee && employee.endDate;
  
  // Calculate aguinaldo for semesters
  // Legal (Uruguay):
  // - 1er semestre: 1° diciembre → 31 mayo
  // - 2do semestre: 1° junio → 30 noviembre
  // - Formula: totalHaberesGravadosDelSemestre / 12
  // - NO usar promedios mensuales
  // - NO usar meses / 12
  // - El cálculo se basa en haberes reales percibidos
  
  const allEmployeeSalaries = Object.values(salariesData).filter(s => 
    s.employeeId === employeeId
  );
  
  // 1er semestre: December of display year + January to May of recordsYearForCalculation
  const displayYearDecSalaries = allEmployeeSalaries.filter(s => 
    s.year === displayYear && s.month === 12
  );
  const recordsYearSalaries = Object.values(salariesData).filter(s => 
    s.employeeId === employeeId && s.year === recordsYearForCalculation
  );
  const firstSemesterRecordsYear = recordsYearSalaries.filter(s => 
    s.month >= 1 && s.month <= 5
  );
  const firstSemesterSalaries = [...displayYearDecSalaries, ...firstSemesterRecordsYear];
  
  // 2do semestre: June to November of recordsYearForCalculation
  const secondSemesterSalaries = recordsYearSalaries.filter(s => 
    s.month >= 6 && s.month <= 11
  );
  
  // Get aguinaldo records for this employee to check if they're already paid
  const allEmployeeAguinaldos = Object.values(aguinaldoData).filter(a => 
    a && a.employeeId === employeeId
  );
  
  // Check if first semester aguinaldo is already paid
  // First semester: December (displayYear) to May (recordsYearForCalculation)
  // The aguinaldo is paid in June of recordsYearForCalculation, so the record year should be recordsYearForCalculation
  const firstSemesterPaid = allEmployeeAguinaldos.some(a => {
    if (!a.paidDate) return false;
    // Check if notes indicate first semester
    const aguinaldoYear = a.year || (new Date(a.paidDate)).getFullYear();
    // First semester aguinaldo is paid in June, so year should be recordsYearForCalculation
    if (aguinaldoYear === recordsYearForCalculation && a.notes && 
        (a.notes.includes('1er semestre') || a.notes.includes('primer semestre'))) {
      return true;
    }
    return false;
  });
  
  // Check if second semester aguinaldo is already paid
  // Second semester: June to November (recordsYearForCalculation)
  // The aguinaldo is paid in December of recordsYearForCalculation, so the record year should be recordsYearForCalculation
  const secondSemesterPaid = allEmployeeAguinaldos.some(a => {
    if (!a.paidDate) return false;
    // Check if notes indicate second semester
    const aguinaldoYear = a.year || (new Date(a.paidDate)).getFullYear();
    // Second semester aguinaldo is paid in December, so year should be recordsYearForCalculation
    if (aguinaldoYear === recordsYearForCalculation && a.notes && 
        (a.notes.includes('2do semestre') || a.notes.includes('segundo semestre'))) {
      return true;
    }
    return false;
  });
  
  // Calculate aguinaldo for first semester
  // Formula: totalHaberesGravadosDelSemestre / 12
  // BUT: If already paid, return 0
  let firstSemesterAguinaldo = 0;
  if (!firstSemesterPaid && firstSemesterSalaries.length > 0) {
    const totalHaberesGravados = firstSemesterSalaries.reduce((sum, salary) => {
      const base = parseFloat(salary.baseSalary30Days) || 0;
      const extras = parseFloat(salary.extras) || 0;
      return sum + (base + extras);
    }, 0);
    firstSemesterAguinaldo = totalHaberesGravados / 12;
  }
  
  // Calculate aguinaldo for second semester
  // Formula: totalHaberesGravadosDelSemestre / 12
  // BUT: If already paid, return 0
  let secondSemesterAguinaldo = 0;
  if (!secondSemesterPaid && secondSemesterSalaries.length > 0) {
    const totalHaberesGravados = secondSemesterSalaries.reduce((sum, salary) => {
      const base = parseFloat(salary.baseSalary30Days) || 0;
      const extras = parseFloat(salary.extras) || 0;
      return sum + (base + extras);
    }, 0);
    secondSemesterAguinaldo = totalHaberesGravados / 12;
  }

  // Calculate months worked (from salaries)
  const monthsWorked = yearSalaries.length;

      // Calculate accumulated vacation days based on employee start date
      // Legal rule: La licencia se genera DESPUÉS de trabajar un año completo
      // When viewing year X, calculate for year X-1 (displayYear)
      // This is used for "Salario Vacacional" calculation (always uses normal calculation)
      let daysAccumulated = 0;
      
      // Separate calculation for "Licencia No Gozada" when employee has endDate in same year
      // This is ONLY used for license not taken calculation
      let daysAccumulatedForLicenseNotTaken = null;
      
      try {
        // employee already declared above (line 216)
        if (employee && employee.startDate) {
          const start = new Date(employee.startDate);
          
          // Check if employee has endDate in the same year being viewed
          // If so, calculate days accumulated ONLY for "Licencia No Gozada"
          if (hasEndDate && employee.endDate) {
            const endDate = new Date(employee.endDate);
            const endDateYear = endDate.getFullYear();
            
            // If endDate is in the same year as recordsYearForCalculation, calculate for that year
            if (endDateYear === recordsYearForCalculation) {
              const recordsYearStart = new Date(recordsYearForCalculation, 0, 1); // January 1
              const recordsYearEnd = new Date(recordsYearForCalculation, 11, 31); // December 31
              
              // Calculate months worked from start to end date (both in recordsYearForCalculation)
              const actualStart = start > recordsYearStart ? start : recordsYearStart;
              const actualEnd = endDate < recordsYearEnd ? endDate : recordsYearEnd;
              
              // Only calculate if start is before or equal to end
              if (actualStart <= actualEnd) {
                let monthsDiff = (actualEnd.getFullYear() - actualStart.getFullYear()) * 12;
                monthsDiff += actualEnd.getMonth() - actualStart.getMonth();
                monthsDiff++; // Include both start and end months
                
                const monthsWorkedInRecordsYear = Math.max(0, monthsDiff);
                
                // Calculate days accumulated proportionally by days worked
                // Legal: 1.66 days per month = 0.0553 days per day (1.66/30)
                // Calculate days worked from actualStart to actualEnd
                const daysPerDay = 1.66 / 30; // 0.0553
                const daysWorked = Math.floor((actualEnd - actualStart) / (1000 * 60 * 60 * 24)) + 1;
                const totalDaysAccumulated = daysWorked * daysPerDay;
                // Round up if there's a fraction
                daysAccumulatedForLicenseNotTaken = Math.ceil(totalDaysAccumulated);
                
                console.log('Employee with endDate in recordsYear - calculate for license not taken', {
                  employeeId,
                  recordsYearForCalculation,
                  startDate: employee.startDate,
                  endDate: employee.endDate,
                  monthsWorkedInRecordsYear,
                  daysAccumulatedForLicenseNotTaken
                });
              } else {
                daysAccumulatedForLicenseNotTaken = 0;
              }
            }
          }
          
          // Normal calculation logic (always used for "Salario Vacacional")
          // This runs regardless of whether we calculated daysAccumulatedForLicenseNotTaken
          // displayYear is already calculated at function start: currentYear - 1
          // For displayYear 2024, calculate years worked until Dec 31, 2023
          const calculationYear = displayYear - 1; // Years worked until end of calculationYear
          const calculationYearEnd = new Date(calculationYear, 11, 31); // December 31 of the calculation year
          const yearStart = new Date(displayYear, 0, 1); // January 1 of the display year
          const yearEnd = new Date(displayYear, 11, 31); // December 31 of the display year
          
          console.log('Calculating days accumulated', {
            employeeId,
            displayYear,
            calculationYear,
            startDate: employee.startDate,
            calculationYearEnd: calculationYearEnd.toISOString(),
            yearStart: yearStart.toISOString(),
            yearEnd: yearEnd.toISOString()
          });
      
          // Calculate months worked in displayYear
          // This is based ONLY on dates, not on salaries registered
          let monthsWorkedInYear = 0;
          if (start.getTime() <= yearEnd.getTime()) {
            // If employee started before or during the year, calculate months worked
            const actualStart = start.getTime() > yearStart.getTime() ? start : yearStart;
            const actualEnd = yearEnd;
            
            // If employee started before the year, they worked the full year (12 months)
            if (start.getTime() < yearStart.getTime()) {
              monthsWorkedInYear = 12;
            } else {
              // Employee started during the year: calculate months from start to end of year
              // Calculate months difference: count from start month to end month (inclusive)
              let monthsDiff = (actualEnd.getFullYear() - actualStart.getFullYear()) * 12;
              monthsDiff += actualEnd.getMonth() - actualStart.getMonth();
              
              // Always add 1 to include both start and end months
              // This counts the month as worked if the employee worked any part of it
              monthsDiff++;
              
              monthsWorkedInYear = Math.max(0, monthsDiff);
            }
          }
          
          // CRITICAL: Check if employee started during displayYear
          // If employee started during displayYear, calculate days based on months worked
          // The months worked are calculated from startDate to end of year
          if (start.getTime() >= yearStart.getTime() && start.getTime() <= yearEnd.getTime()) {
            // Employee started during displayYear
            // Check if they worked the full year (12 months) based on date calculation only
            const workedFullYear = monthsWorkedInYear >= 12;
            
            if (workedFullYear) {
              // Employee worked the full year: calculate based on years of service
              // When employee worked the full displayYear, they have at least 1 complete year
              // Calculate years worked up to the end of displayYear
              const displayYearEnd = new Date(displayYear, 11, 31); // December 31 of displayYear
              let yearsWorkedForFormula = displayYearEnd.getFullYear() - start.getFullYear();
              const monthDiffForFormula = displayYearEnd.getMonth() - start.getMonth();
              const dayDiffForFormula = displayYearEnd.getDate() - start.getDate();
              
              if (monthDiffForFormula < 0 || (monthDiffForFormula === 0 && dayDiffForFormula < 0)) {
                yearsWorkedForFormula--;
              }
              
              yearsWorkedForFormula = Math.max(1, yearsWorkedForFormula); // At least 1 year if worked full year
              
              // Legal formula: 20 + Math.floor((yearsWorked - 1) / 4)
              daysAccumulated = 20 + Math.floor((yearsWorkedForFormula - 1) / 4);
              
              console.log('Employee started during displayYear but worked full year - year-based calculation', {
                employeeId,
                displayYear,
                yearsWorkedForFormula,
                daysAccumulated,
                monthsWorkedInYear,
                startDate: employee.startDate
              });
            } else {
              // Employee didn't work the full year: calculate proportionally by days worked
              // Legal: 1.66 days per month = 0.0553 days per day (1.66/30)
              // Recalculate actualStart and actualEnd for this specific case
              const actualStart = start.getTime() > yearStart.getTime() ? start : yearStart;
              const actualEnd = yearEnd;
              const daysPerDay = 1.66 / 30; // 0.0553
              const daysWorked = Math.floor((actualEnd - actualStart) / (1000 * 60 * 60 * 24)) + 1;
              
              console.log('Employee started during displayYear - calculating proportionally', {
                employeeId,
                displayYear,
                startDate: employee.startDate,
                actualStart: actualStart.toISOString(),
                actualEnd: actualEnd.toISOString(),
                daysWorked,
                daysPerDay
              });
              
              // Only calculate if there are days worked
              if (daysWorked > 0) {
                const totalDaysAccumulated = daysWorked * daysPerDay;
                // Round up if there's a fraction
                daysAccumulated = Math.ceil(totalDaysAccumulated);
                console.log('Calculated days accumulated', {
                  employeeId,
                  displayYear,
                  totalDaysAccumulated,
                  daysAccumulated
                });
              } else {
                daysAccumulated = 0;
                console.warn('daysWorked is 0 or negative', {
                  employeeId,
                  displayYear,
                  actualStart: actualStart.toISOString(),
                  actualEnd: actualEnd.toISOString(),
                  daysWorked
                });
              }
              console.log('Employee started during displayYear - proportional calculation', {
                employeeId,
                displayYear,
                monthsWorkedInYear,
                daysAccumulated,
                startDate: employee.startDate,
                yearStart: yearStart.toISOString(),
                yearEnd: yearEnd.toISOString()
              });
            }
          } else {
            // Employee started before displayYear - calculate based on years worked
            // Calculate complete years worked up to the end of the calculation year
            // For display year 2025, calculate years worked until Dec 31, 2024
            let yearsWorked = calculationYearEnd.getFullYear() - start.getFullYear();
            const monthDiff = calculationYearEnd.getMonth() - start.getMonth();
            const dayDiff = calculationYearEnd.getDate() - start.getDate();
            
            if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
              yearsWorked--;
            }
            
            yearsWorked = Math.max(0, yearsWorked);
            
            // Check if employee worked the full year (12 months) based on date calculation only
            // If employee started before the year, they definitely worked the full year
            const workedFullYear = start < yearStart || monthsWorkedInYear >= 12;
            
            if (workedFullYear) {
              // Employee worked the full year: calculate based on years of service
              // When employee worked the full displayYear, they have at least 1 complete year
              // Calculate years worked up to the end of displayYear (not calculationYear)
              const displayYearEnd = new Date(displayYear, 11, 31); // December 31 of displayYear
              let yearsWorkedForFormula = displayYearEnd.getFullYear() - start.getFullYear();
              const monthDiffForFormula = displayYearEnd.getMonth() - start.getMonth();
              const dayDiffForFormula = displayYearEnd.getDate() - start.getDate();
              
              if (monthDiffForFormula < 0 || (monthDiffForFormula === 0 && dayDiffForFormula < 0)) {
                yearsWorkedForFormula--;
              }
              
              yearsWorkedForFormula = Math.max(1, yearsWorkedForFormula); // At least 1 year if worked full year
              
              // Legal formula: 20 + Math.floor((yearsWorked - 1) / 4)
              daysAccumulated = 20 + Math.floor((yearsWorkedForFormula - 1) / 4);
              
              console.log('Employee started before displayYear and worked full year - year-based calculation', {
                employeeId,
                displayYear,
                yearsWorked,
                yearsWorkedForFormula,
                daysAccumulated,
                monthsWorkedInYear,
                startDate: employee.startDate,
                startBeforeYear: start < yearStart
              });
            } else {
              // Employee didn't work the full year: calculate proportionally by days worked
              // Legal: 1.66 days per month = 0.0553 days per day (1.66/30)
              const actualStart = start > yearStart ? start : yearStart;
              const actualEnd = yearEnd;
              const daysPerDay = 1.66 / 30; // 0.0553
              const daysWorked = Math.floor((actualEnd - actualStart) / (1000 * 60 * 60 * 24)) + 1;
              
              // Only calculate if there are days worked
              if (daysWorked > 0) {
                const totalDaysAccumulated = daysWorked * daysPerDay;
                // Round up if there's a fraction
                daysAccumulated = Math.ceil(totalDaysAccumulated);
              } else {
                // Employee didn't work during displayYear
                daysAccumulated = 0;
              }
              
              console.log('Employee started before displayYear but worked partial year - proportional calculation', {
                employeeId,
                displayYear,
                monthsWorkedInYear,
                daysAccumulated,
                startDate: employee.startDate
              });
            }
            
            console.log('Days accumulated calculated', {
              employeeId,
              displayYear,
              yearsWorked,
              daysAccumulated,
              workedFullYear,
              monthsWorkedInYear
            });
          }
        } else {
          // Fallback to old calculation if no start date
      // Legal: Use proportional calculation: 1.66 days per month
      // Use months worked in displayYear (fallback - estimate as full months)
      const displayYearSalaries = Object.values(salariesData).filter(s => 
        s.employeeId === employeeId && s.year === displayYear
      );
      const monthsWorkedFallback = displayYearSalaries.length;
      const totalDaysAccumulated = monthsWorkedFallback * 1.66;
      // Round up if there's a fraction
      daysAccumulated = Math.ceil(totalDaysAccumulated);
      
      console.log('Days accumulated (fallback - no start date)', {
        employeeId,
        displayYear,
        monthsWorkedFallback,
        daysAccumulated
      });
    }
  } catch (error) {
    if (typeof logger !== 'undefined' && logger.warn) {
      logger.warn('Error calculating vacation days, using fallback', error);
    } else {
      console.warn('Error calculating vacation days, using fallback', error);
    }
    // Fallback: use proportional calculation based on months worked in displayYear
    // Legal: Use Math.floor() NOT Math.ceil()
    const displayYearSalaries = Object.values(salariesData).filter(s => 
      s.employeeId === employeeId && s.year === displayYear
    );
    const monthsWorkedFallback = displayYearSalaries.length;
    const totalDaysAccumulated = monthsWorkedFallback * 1.66;
    // Round up if there's a fraction
    daysAccumulated = Math.ceil(totalDaysAccumulated);
    
    console.log('Days accumulated (fallback - error)', {
      employeeId,
      displayYear,
      monthsWorkedFallback,
      daysAccumulated,
      error: error?.message
    });
  }
  
  // Calculate days taken
  // Legal: La licencia se imputa al año en que se genera
  // Para el cálculo del saldo, descontar días gozados del displayYear
  const daysTakenDisplayYear = yearLicenses.reduce((sum, license) => sum + (license.daysTaken || 0), 0);
  
  // Also get days taken from recordsYearForCalculation for display purposes
  const recordsYearLicenses = Object.values(licensesData).filter(l => 
    l.employeeId === employeeId && l.year === recordsYearForCalculation
  );
  const daysTakenRecordsYear = recordsYearLicenses.reduce((sum, license) => sum + (license.daysTaken || 0), 0);
  
  // For vacation salary calculation, we need days accumulated for the CURRENT YEAR (recordsYearForCalculation)
  // not displayYear, because vacation salary is calculated based on remaining days of the current year
  // Calculate days accumulated for recordsYearForCalculation (current year)
  let daysAccumulatedCurrentYear = 0;
  try {
    if (employee && employee.startDate) {
      const start = new Date(employee.startDate);
      const currentYearStart = new Date(recordsYearForCalculation, 0, 1); // January 1 of current year
      const currentYearEnd = new Date(recordsYearForCalculation, 11, 31); // December 31 of current year
      
      // Calculate months worked in current year
      let monthsWorkedCurrentYear = 0;
      if (start <= currentYearEnd) {
        const actualStart = start > currentYearStart ? start : currentYearStart;
        const actualEnd = currentYearEnd;
        
        if (start < currentYearStart) {
          monthsWorkedCurrentYear = 12;
        } else {
          let monthsDiff = (actualEnd.getFullYear() - actualStart.getFullYear()) * 12;
          monthsDiff += actualEnd.getMonth() - actualStart.getMonth();
          monthsDiff++;
          monthsWorkedCurrentYear = Math.max(0, monthsDiff);
        }
      }
      
      // Check if employee worked full year in current year
      const workedFullCurrentYear = start < currentYearStart || monthsWorkedCurrentYear >= 12;
      
      if (workedFullCurrentYear) {
        // Calculate years worked up to end of current year
        const currentYearEndDate = new Date(recordsYearForCalculation, 11, 31);
        let yearsWorkedForCurrentYear = currentYearEndDate.getFullYear() - start.getFullYear();
        const monthDiff = currentYearEndDate.getMonth() - start.getMonth();
        const dayDiff = currentYearEndDate.getDate() - start.getDate();
        
        if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
          yearsWorkedForCurrentYear--;
        }
        
        yearsWorkedForCurrentYear = Math.max(1, yearsWorkedForCurrentYear);
        daysAccumulatedCurrentYear = 20 + Math.floor((yearsWorkedForCurrentYear - 1) / 4);
      } else {
        // Calculate proportionally by days worked (even if monthsWorkedCurrentYear is 0)
        const actualStart = start > currentYearStart ? start : currentYearStart;
        const actualEnd = currentYearEnd;
        const daysPerDay = 1.66 / 30; // 0.0553
        const daysWorked = Math.floor((actualEnd - actualStart) / (1000 * 60 * 60 * 24)) + 1;
        
        if (daysWorked > 0) {
          const totalDaysAccumulated = daysWorked * daysPerDay;
          // Round up if there's a fraction
          daysAccumulatedCurrentYear = Math.ceil(totalDaysAccumulated);
        } else {
          daysAccumulatedCurrentYear = 0;
        }
      }
    } else {
      // Fallback: use salaries from current year
      const currentYearSalaries = Object.values(salariesData).filter(s => 
        s.employeeId === employeeId && s.year === recordsYearForCalculation
      );
      const totalDaysAccumulated = currentYearSalaries.length * 1.66;
      // Round up if there's a fraction
      daysAccumulatedCurrentYear = Math.ceil(totalDaysAccumulated);
    }
  } catch (error) {
    // Fallback: use salaries from current year
    const currentYearSalaries = Object.values(salariesData).filter(s => 
      s.employeeId === employeeId && s.year === recordsYearForCalculation
    );
    daysAccumulatedCurrentYear = Math.floor(currentYearSalaries.length * 1.66);
  }
  
  // Calculate days generated for current year (informative only, not used for salary calculations)
  // This shows days accumulated from start of current year until today
  let daysGeneratedCurrentYear = 0;
  try {
    if (employee && employee.startDate) {
      const start = new Date(employee.startDate);
      const currentYearStart = new Date(recordsYearForCalculation, 0, 1); // January 1 of current year
      const today = new Date(); // Today's date
      const currentYearEnd = new Date(recordsYearForCalculation, 11, 31); // December 31 of current year
      
      // Use today if we're in the current year, otherwise use end of year
      const calculationEnd = today.getFullYear() === recordsYearForCalculation && today <= currentYearEnd
        ? today
        : currentYearEnd;
      
      // Check if employee started before or during current year
      if (start.getTime() <= calculationEnd.getTime()) {
        const actualStart = start.getTime() > currentYearStart.getTime() ? start : currentYearStart;
        const actualEnd = calculationEnd;
        
        // Check if employee worked full year (from start of year to end of year)
        const workedFullYear = start.getTime() < currentYearStart.getTime() && calculationEnd.getTime() >= currentYearEnd.getTime();
        
        if (workedFullYear) {
          // Employee worked the full year: calculate based on years of service
          const calculationEndDate = new Date(recordsYearForCalculation, 11, 31);
          let yearsWorked = calculationEndDate.getFullYear() - start.getFullYear();
          const monthDiff = calculationEndDate.getMonth() - start.getMonth();
          const dayDiff = calculationEndDate.getDate() - start.getDate();
          
          if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
            yearsWorked--;
          }
          
          yearsWorked = Math.max(0, yearsWorked);
          
          // Calculate days per year based on years of service
          // Formula: 20 + Math.floor((yearsWorked - 1) / 4)
          daysGeneratedCurrentYear = yearsWorked > 0 ? 20 + Math.floor((yearsWorked - 1) / 4) : 0;
        } else {
          // Employee didn't work the full year: calculate proportionally by days worked
          const daysPerDay = 1.66 / 30; // 0.0553
          const daysWorked = Math.floor((actualEnd - actualStart) / (1000 * 60 * 60 * 24)) + 1;
          
          if (daysWorked > 0) {
            const totalDaysAccumulated = daysWorked * daysPerDay;
            // Round up if there's a fraction
            daysGeneratedCurrentYear = Math.ceil(totalDaysAccumulated);
          } else {
            daysGeneratedCurrentYear = 0;
          }
        }
      }
    }
  } catch (error) {
    logger.warn('Error calculating days generated for current year', { employeeId, error });
    daysGeneratedCurrentYear = 0;
  }
  
  // Calculate daily wage for vacation salary and license not taken
  // Use the last salary record from currentYear (recordsYearForCalculation) to get daily wage
  // This ensures both calculations use the same base (last salary of the year)
  let dailyWageForVacationSalary = 0;
  
  // Get salaries from currentYear (recordsYearForCalculation) for daily wage calculation
  // Use the last salary record (most recent month) to get daily wage
  const recordsYearSalariesForWage = allEmployeeSalaries
    .filter(s => s.year === recordsYearForCalculation && s.month)
    .sort((a, b) => {
      // Sort by month descending to get the last salary (most recent month)
      // If months are equal, prefer the one with dailyWage if available
      if ((b.month || 0) !== (a.month || 0)) {
        return (b.month || 0) - (a.month || 0);
      }
      // If same month, prefer one with dailyWage
      if (b.dailyWage && !a.dailyWage) return -1;
      if (a.dailyWage && !b.dailyWage) return 1;
      return 0;
    });
  
  if (recordsYearSalariesForWage.length > 0) {
    // Get the last salary (most recent month)
    const lastSalary = recordsYearSalariesForWage[0];
    
    // Try to get dailyWage directly from the salary record first
    if (lastSalary.dailyWage && lastSalary.dailyWage > 0) {
      dailyWageForVacationSalary = parseFloat(lastSalary.dailyWage);
    } else {
      // Calculate daily wage from baseSalary30Days + extras
      const base = parseFloat(lastSalary.baseSalary30Days) || 0;
      const extras = parseFloat(lastSalary.extras) || 0;
      const totalMonthly = base + extras;
      dailyWageForVacationSalary = totalMonthly / 30;
    }
    
    // Debug log to verify calculation
    if (typeof logger !== 'undefined' && logger.debug) {
      logger.debug('Daily wage calculation', {
        employeeId,
        recordsYearForCalculation,
        lastSalaryMonth: lastSalary.month,
        lastSalaryYear: lastSalary.year,
        dailyWage: lastSalary.dailyWage,
        baseSalary30Days: lastSalary.baseSalary30Days,
        extras: lastSalary.extras,
        calculatedDailyWage: dailyWageForVacationSalary,
        totalSalariesInYear: recordsYearSalariesForWage.length
      });
    }
  } else {
    // Debug log if no salaries found
    if (typeof logger !== 'undefined' && logger.debug) {
      logger.debug('No salaries found for daily wage calculation', {
        employeeId,
        recordsYearForCalculation,
        allEmployeeSalariesCount: allEmployeeSalaries.length
      });
    }
  }
  
  // Calculate "Saldo Días de Licencia" (same as displayed in cards)
  // If employee has endDate in the same year being viewed, use daysAccumulatedForLicenseNotTaken
  // Otherwise: días acumulados del displayYear - días tomados del recordsYearForCalculation
  // This matches what is shown in the "Saldo Días de Licencia" field
  // Note: This is used for display purposes and for "Licencia No Gozada" calculation
  const daysAccumulatedForDisplay = daysAccumulatedForLicenseNotTaken !== null 
    ? daysAccumulatedForLicenseNotTaken 
    : daysAccumulated;
  const displayedDaysRemaining = Math.max(0, (daysAccumulatedForDisplay || 0) - (daysTakenRecordsYear || 0));
  
  // Legal: Licencia No Gozada y Salario Vacacional son conceptos diferentes
  // - Licencia No Gozada: Solo se calcula al egreso (usar promedio últimos 12 meses)
  //   When employee has endDate in same year, use special calculation for months worked
  // - Salario Vacacional: Solo se calcula cuando se goza la licencia
  //   Always uses normal calculation (displayYear), NOT the special endDate calculation
  
  // hasEndDate already declared above (line 217)
  
  let licenseNotTakenSalary = 0;
  let vacationSalary = 0;
  
  // vacation already declared above (line 211)
  
  // Calculate license not taken (informative for all employees with remaining days)
  // This shows what the license not taken would be if the employee terminates
  // Legal: Solo se calcula al egreso, pero mostramos información si hay días pendientes
  // When employee has endDate in same year, use displayedDaysRemaining (which uses special calculation)
  // Otherwise, use normal displayedDaysRemaining
  if (displayedDaysRemaining > 0 && dailyWageForVacationSalary > 0) {
    licenseNotTakenSalary = displayedDaysRemaining * dailyWageForVacationSalary;
    
    // Debug log to verify calculation
    if (typeof logger !== 'undefined' && logger.debug) {
      logger.debug('License not taken calculation', {
        employeeId,
        displayedDaysRemaining,
        daysAccumulatedForDisplay,
        daysAccumulatedForLicenseNotTaken,
        daysAccumulated,
        daysTakenRecordsYear,
        dailyWageForVacationSalary,
        calculatedAmount: licenseNotTakenSalary
      });
    }
  }
  
  // If employee has terminated, prefer the calculated value from vacation record if available
  if (hasEndDate) {
    if (vacation && vacation.isLicenseNotTaken) {
      licenseNotTakenSalary = parseFloat(vacation.amount) || licenseNotTakenSalary;
    } else if (vacation && vacation.amount > 0 && vacation.isLicenseNotTaken !== false) {
      // If vacation record exists, prefer it (might be already calculated)
      licenseNotTakenSalary = parseFloat(vacation.amount) || licenseNotTakenSalary;
    }
  }
  
  // Calculate vacation salary (for all employees with remaining days)
  // Show the amount that needs to be paid based on remaining days (saldo de días)
  // This represents the vacation salary that will be paid when the employee takes their remaining vacation days
  // IMPORTANT: Vacation salary ALWAYS uses normal calculation (displayYear), NOT the special endDate calculation
  // This is different from "Licencia No Gozada" which uses special calculation when endDate is in same year
  const vacationDaysRemaining = Math.max(0, (daysAccumulated || 0) - (daysTakenRecordsYear || 0));
  const allDaysTaken = vacationDaysRemaining <= 0;
  
  if (!allDaysTaken && vacationDaysRemaining > 0) {
    // Employee has remaining days - calculate vacation salary for pending days
    // Always calculate based on normal daysAccumulated (displayYear), NOT the special endDate calculation
    // Don't use vacation record amount as it might be outdated
    if (dailyWageForVacationSalary > 0) {
      // Calculate vacation salary based on vacationDaysRemaining (normal calculation)
      // Uses daily wage from last salary of currentYear for consistency
      // This shows the estimated amount that will be paid when employee takes their remaining vacation
      vacationSalary = vacationDaysRemaining * dailyWageForVacationSalary;
      
      // Debug log to verify calculation
      if (typeof logger !== 'undefined' && logger.debug) {
        logger.debug('Vacation salary calculation', {
          employeeId,
          vacationDaysRemaining,
          displayedDaysRemaining,
          daysAccumulated,
          daysAccumulatedForLicenseNotTaken,
          daysTakenRecordsYear,
          dailyWageForVacationSalary,
          calculatedAmount: vacationSalary,
          displayYear,
          recordsYearForCalculation,
          hasEndDate
        });
      }
    }
  } else {
    // All vacation days have been taken - vacation salary should already be paid
    // Set to 0 to indicate it's already been paid
    vacationSalary = 0;
  }
  
  // Calculate total extras
  const totalExtras = yearSalaries.reduce((sum, salary) => sum + (salary.extras || 0), 0);
  
  return {
    daysAccumulated: Math.round(daysAccumulated), // Round to integer
    daysTaken: Math.round(daysTakenDisplayYear), // Days taken only from displayYear (legal: imputa al año que se genera), rounded to integer
    daysTakenCurrentYear: Math.round(daysTakenRecordsYear), // Days taken from recordsYearForCalculation for display, rounded to integer
    daysRemaining: Math.round(displayedDaysRemaining), // Round to integer - same as "Saldo Días de Licencia"
    daysGeneratedCurrentYear: Math.round(daysGeneratedCurrentYear), // Days generated for current year (informative)
    vacationSalary: Math.round(vacationSalary), // Round to integer
    licenseNotTakenSalary: Math.round(licenseNotTakenSalary), // Round to integer
    firstSemesterAguinaldo: Math.round(firstSemesterAguinaldo),
    secondSemesterAguinaldo: Math.round(secondSemesterAguinaldo),
    totalExtras,
    monthsWorked,
    salaries: yearSalaries,
    licenses: yearLicenses,
    displayYear,
    hasEndDate // Include flag for UI to show appropriate labels
  };
}

// Calculate employee total accumulated summary (all years)
function calculateEmployeeTotalSummary(employeeId) {
  // Get all salaries, licenses, vacations, and aguinaldo for this employee
  const allSalaries = Object.values(salariesData).filter(s => s.employeeId === employeeId);
  const allLicenses = Object.values(licensesData).filter(l => l.employeeId === employeeId);
  const allVacations = Object.values(vacationsData).filter(v => v.employeeId === employeeId);
  const allAguinaldo = Object.values(aguinaldoData).filter(a => a.employeeId === employeeId);
  
  // Calculate total vacation salary (sum of all years)
  const totalVacationSalary = allVacations.reduce((sum, v) => sum + (v.amount || 0), 0);
  
  // Calculate total aguinaldo (sum of all years)
  const totalAguinaldo = allAguinaldo.reduce((sum, a) => sum + (a.amount || 0), 0);
  
  // Calculate total extras (sum of all years)
  const totalExtras = allSalaries.reduce((sum, s) => sum + (s.extras || 0), 0);
  
  // Calculate total days accumulated (from all vacation records)
  const totalDaysAccumulated = allVacations.reduce((sum, v) => sum + (v.daysAccumulated || 0), 0);
  
  // Calculate total days taken (from all licenses)
  const totalDaysTaken = allLicenses.reduce((sum, l) => sum + (l.daysTaken || 0), 0);
  
  // Calculate total days remaining
  const totalDaysRemaining = totalDaysAccumulated - totalDaysTaken;
  
  return {
    totalDaysAccumulated, // Keep as number for calculations
    totalDaysTaken, // Keep as number for calculations
    totalDaysRemaining: Math.max(0, totalDaysRemaining), // Keep as number for calculations
    totalVacationSalary,
    totalAguinaldo,
    totalExtras
  };
}

// Load payroll items (cards view)
async function loadPayrollItems() {
  const payrollContent = document.getElementById('payroll-items-content');
  if (!payrollContent) return;
  
  // Clear content but don't show loading message - data will appear when ready
  payrollContent.innerHTML = '';

  // Get nrd instance dynamically
  const nrd = window.nrd;
  if (!nrd || !nrd.employees) {
    payrollContent.innerHTML = '<p class="text-gray-500 text-sm">Servicio no disponible</p>';
    return;
  }

  // Ensure data is loaded (but don't reload if already loaded)
  if (Object.keys(employeesData || {}).length === 0) {
    try {
      await Promise.race([
        loadAllData(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout loading data')), 15000))
      ]);
    } catch (error) {
      console.error('Error loading data in loadPayrollItems', error);
      // Continue with empty data rather than showing error
    }
  }
  
  const employees = Object.values(employeesData || {});
    
    if (employees.length === 0) {
      payrollContent.innerHTML = `
        <div class="text-center py-12 border border-gray-200 p-8">
          <p class="text-gray-600 mb-4">No hay empleados registrados</p>
          <p class="text-xs text-gray-500">Cree empleados primero para ver las partidas salariales</p>
        </div>
      `;
      return;
    }

    // Load roles to filter out employees with "socio" role (needed for filter dropdown)
    // nrd is already available from loadPayrollItems function scope
    let rolesData = {};
    try {
      if (nrd && nrd.roles) {
        const roles = await nrd.roles.getAll();
        if (Array.isArray(roles)) {
          roles.forEach(role => {
            if (role && role.id) rolesData[role.id] = role;
          });
        } else if (roles) {
          rolesData = roles;
        }
      }
    } catch (error) {
      console.warn('Error loading roles for filtering', error);
    }
    
    // Find "socio" role ID (case-insensitive)
    const socioRoleId = Object.values(rolesData).find(role => 
      role && role.name && role.name.toLowerCase().trim() === 'socio'
    )?.id;
    
    // Filter employees: only show those who were active (vigente) in the selected year
    // and exclude employees with "socio" role
    const activeEmployeesForFilter = employees.filter(employee => {
      // Check if employee is active in the year
      if (!isEmployeeActiveInYear(employee, currentYear)) {
        return false;
      }
      
      // Exclude if employee has "socio" role
      if (socioRoleId) {
        const roleIds = employee.roleIds || (employee.roleId ? [employee.roleId] : []);
        if (roleIds.includes(socioRoleId)) {
          return false;
        }
      }
      
      return true;
    });
    
    // Sort employees by name
    activeEmployeesForFilter.sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
    
    // Add header with year selector and employee filter
    const header = document.createElement('div');
    header.className = 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0 mb-6';
    header.innerHTML = `
      <div>
        <h2 class="text-xl sm:text-2xl font-light text-gray-800 mb-1">Partidas Salariales</h2>
        <p class="text-sm text-gray-600">Resumen de partidas salariales por empleado</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <select id="employee-filter-select" class="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 bg-white ${!filteredEmployeeId ? 'text-gray-500' : 'text-gray-700'}" style="min-height: 2rem;">
          <option value="" ${!filteredEmployeeId ? 'selected' : ''}>Filtrar por empleado</option>
          ${activeEmployeesForFilter.map(emp => `
            <option value="${emp.id}" ${filteredEmployeeId === emp.id ? 'selected' : ''}>${escapeHtml(emp.name)}</option>
          `).join('')}
        </select>
        ${(() => {
          const today = new Date();
          const currentYearValue = today.getFullYear();
          const startYear = Math.max(2021, currentYearValue - 5);
          const years = [];
          // First add current year
          years.push(currentYearValue);
          // Then add other years in descending order
          for (let year = currentYearValue - 1; year >= startYear; year--) {
            years.push(year);
          }
          return years.map(year => {
            const isCurrentYearValue = year === currentYearValue;
            const isSelectedYear = year === currentYear;
            
            // Year current has different border color, selected year has red background
            const borderClass = isCurrentYearValue ? 'border-red-500' : 'border-gray-300';
            const bgClass = isSelectedYear 
              ? 'bg-red-600 text-white border-red-600 font-medium' 
              : 'bg-white text-gray-700 ' + borderClass + ' hover:border-red-600 hover:text-red-600';
            
            return `<button class="year-btn px-3 py-1.5 border rounded transition-colors text-sm ${bgClass}" data-year="${year}">${year}</button>`;
          }).join('');
        })()}
      </div>
    `;
    payrollContent.appendChild(header);
    
    // Add event listener for employee filter
    const employeeFilterSelect = document.getElementById('employee-filter-select');
    if (employeeFilterSelect) {
      employeeFilterSelect.addEventListener('change', async (e) => {
        filteredEmployeeId = e.target.value || null;
        await loadPayrollItems();
      });
    }

    // Year selector handlers - remove old listeners first to prevent duplicates
    const oldButtons = payrollContent.querySelectorAll('.year-btn');
    oldButtons.forEach(btn => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
    });
    
    document.querySelectorAll('.year-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const selectedYear = parseInt(e.target.dataset.year);
        if (selectedYear !== currentYear && !btn.disabled) {
          // Disable all year buttons to prevent double clicks
          document.querySelectorAll('.year-btn').forEach(b => b.disabled = true);
          showSpinner('Calculando partidas salariales...');
          try {
            currentYear = selectedYear;
            // Recalculate for the selected year (with timeout)
            try {
              await Promise.race([
                recalculateForYear(selectedYear),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
              ]);
            } catch (recalcError) {
              console.warn('Error or timeout recalculating for year', recalcError);
              // Continue anyway
            }
            // Reload to show updated data
            await loadPayrollItems();
          } catch (error) {
            console.error('Error changing year', error);
            payrollContent.innerHTML = '<p class="text-red-500 text-sm">Error al cargar los datos del año seleccionado</p>';
          } finally {
            hideSpinner();
            document.querySelectorAll('.year-btn').forEach(b => b.disabled = false);
          }
        }
      });
    });

    // Create cards container
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'grid grid-cols-1 md:grid-cols-2 gap-3';
    
    // Filter employees: only show those who were active (vigente) in the selected year
    // and exclude employees with "socio" role
    // Also apply employee filter if selected
    const activeEmployees = activeEmployeesForFilter.filter(employee => {
      // Apply employee filter if one is selected
      if (filteredEmployeeId && employee.id !== filteredEmployeeId) {
        return false;
      }
      return true;
    });
    
    if (activeEmployees.length === 0) {
      cardsContainer.innerHTML = `
        <div class="col-span-full text-center py-12 border border-gray-200 p-8">
          <p class="text-gray-600 mb-2">No hay empleados vigentes en ${currentYear}</p>
          <p class="text-xs text-gray-500">Los empleados deben haber estado activos durante el año seleccionado</p>
        </div>
      `;
      payrollContent.appendChild(cardsContainer);
      return;
    }
    
    activeEmployees.forEach(employee => {
      // Use the same year as in showEmployeeDetails to ensure consistency
      const recordsYear = currentYear;
      const displayYear = currentYear - 1;
      const summary = calculateEmployeeSummary(employee.id, recordsYear);
      const totalSummary = calculateEmployeeTotalSummary(employee.id);
      
      // Get last salary info for tooltips
      const allEmployeeSalaries = Object.values(salariesData).filter(s => 
        s.employeeId === employee.id && s.year === recordsYear && s.month
      );
      const lastSalary = allEmployeeSalaries
        .sort((a, b) => (b.month || 0) - (a.month || 0))[0];
      
      const lastSalaryInfo = lastSalary ? {
        month: lastSalary.month,
        year: lastSalary.year,
        dailyWage: lastSalary.dailyWage || (lastSalary.baseSalary30Days && lastSalary.extras 
          ? (parseFloat(lastSalary.baseSalary30Days) + parseFloat(lastSalary.extras || 0)) / 30
          : lastSalary.baseSalary30Days ? parseFloat(lastSalary.baseSalary30Days) / 30 : 0)
      } : null;
      
      // Get semester salaries for aguinaldo formulas
      const displayYearDecSalaries = allEmployeeSalaries.filter(s => 
        s.year === displayYear && s.month === 12
      );
      const recordsYearSalaries = allEmployeeSalaries.filter(s => s.year === recordsYear);
      const firstSemesterSalaries = [
        ...displayYearDecSalaries,
        ...recordsYearSalaries.filter(s => s.month >= 1 && s.month <= 5)
      ];
      const secondSemesterSalaries = recordsYearSalaries.filter(s => 
        s.month >= 6 && s.month <= 11
      );
      
      // Generate formulas for tooltips
      const daysAccumulatedFormula = getDaysAccumulatedFormula(summary, recordsYear);
      const daysRemainingFormula = getDaysRemainingFormula(summary, recordsYear);
      const vacationSalaryFormula = getVacationSalaryFormula(summary, lastSalaryInfo);
      const licenseNotTakenFormula = getLicenseNotTakenFormula(summary, lastSalaryInfo);
      const firstSemesterAguinaldoFormula = getAguinaldoFormula(summary, 'first', displayYear, recordsYear, firstSemesterSalaries);
      const secondSemesterAguinaldoFormula = getAguinaldoFormula(summary, 'second', displayYear, recordsYear, secondSemesterSalaries);
      
      // Check if employee has pending days (días pendientes por tomar)
      // Use the SAME calculation that is displayed in the card to ensure consistency
      // The card shows: (daysAccumulated || 0) - (daysTakenCurrentYear || 0)
      // So we must use the same formula here, not summary.daysRemaining which uses a different calculation
      const displayedDaysRemaining = Math.round(Math.max(0, (summary.daysAccumulated || 0) - (summary.daysTakenCurrentYear || 0)));
      const hasPendingDays = displayedDaysRemaining > 0;
      
      // Check if vacation salary exists and is not paid
      // Only consider pending if vacationSalary is greater than 0
      // Use Math.round to avoid floating point comparison issues
      const vacationSalary = Math.round(Math.max(0, summary.vacationSalary || 0));
      const hasVacationSalary = vacationSalary > 0;
      let hasUnpaidVacationSalary = false;
      if (hasVacationSalary) {
        // Look for vacation records for the displayYear (the year being shown in the summary)
        const employeeVacations = Object.values(vacationsData).filter(v => 
          v && v.employeeId === employee.id && v.year === displayYear && !v.isLicenseNotTaken
        );
        const vacationSalaryPaid = employeeVacations.some(v => v.paidDate);
        hasUnpaidVacationSalary = !vacationSalaryPaid;
      }
      
      // Check if aguinaldo exists and is not paid (check both semesters)
      // Only consider pending if aguinaldo amount is greater than 0
      // Use Math.round to avoid floating point comparison issues
      const firstSemesterAguinaldo = Math.round(Math.max(0, summary.firstSemesterAguinaldo || 0));
      const secondSemesterAguinaldo = Math.round(Math.max(0, summary.secondSemesterAguinaldo || 0));
      const hasFirstSemesterAguinaldo = firstSemesterAguinaldo > 0;
      const hasSecondSemesterAguinaldo = secondSemesterAguinaldo > 0;
      let hasUnpaidAguinaldo = false;
      
      if (hasFirstSemesterAguinaldo || hasSecondSemesterAguinaldo) {
        const employeeAguinaldos = Object.values(aguinaldoData).filter(a => 
          a && a.employeeId === employee.id && a.year === recordsYear
        );
        
        // Check if each semester aguinaldo is paid
        const firstSemesterAguinaldoRecord = employeeAguinaldos.find(a => 
          a.notes && (a.notes.includes('1er semestre') || a.notes.includes('primer semestre'))
        );
        const secondSemesterAguinaldoRecord = employeeAguinaldos.find(a => 
          a.notes && (a.notes.includes('2do semestre') || a.notes.includes('segundo semestre'))
        );
        
        const firstSemesterPaid = firstSemesterAguinaldoRecord && firstSemesterAguinaldoRecord.paidDate;
        const secondSemesterPaid = secondSemesterAguinaldoRecord && secondSemesterAguinaldoRecord.paidDate;
        
        const hasUnpaidFirstSemester = hasFirstSemesterAguinaldo && !firstSemesterPaid;
        const hasUnpaidSecondSemester = hasSecondSemesterAguinaldo && !secondSemesterPaid;
        hasUnpaidAguinaldo = hasUnpaidFirstSemester || hasUnpaidSecondSemester;
      }
      
      // Employee has pending ONLY if they have actual pending items (days > 0 or amounts > 0)
      // All values must be checked to ensure we're not showing "Pendiente" when everything is 0
      // Double-check: if all displayed values are 0, hasPending should be false
      const hasPending = hasPendingDays || hasUnpaidVacationSalary || hasUnpaidAguinaldo;
      
      // Add special styling if has pending items
      const cardClass = hasPending 
        ? 'border-4 border-red-500 p-4 bg-white cursor-pointer hover:border-red-600 hover:shadow-lg hover:scale-[1.02] transition-all duration-200 relative' 
        : 'border-2 border-gray-200 p-4 bg-white cursor-pointer hover:border-green-600 hover:shadow-lg hover:scale-[1.02] transition-all duration-200';
      
      const card = document.createElement('div');
      card.className = cardClass;
      card.dataset.employeeId = employee.id;
      
      // displayYear is already declared above (line 1084)
      
      card.innerHTML = `
        <div class="-m-4 mb-3 px-4 py-3 ${hasPending ? 'bg-red-600' : 'bg-green-600'} text-white shadow-md">
          <h3 class="text-lg font-semibold tracking-tight">${escapeHtml(employee.name)}</h3>
          <p class="text-sm ${hasPending ? 'text-red-100' : 'text-green-100'} mt-0.5">${currentYear}</p>
        </div>
        
        <div class="space-y-2.5 text-sm px-1">
          <div class="py-2.5 px-2 border-b border-gray-200 hover:bg-green-50 transition-colors rounded">
            <div class="flex justify-between items-center">
              <span class="text-gray-700 font-medium">Saldo Días de Licencia:</span>
              <span class="font-semibold text-green-600 text-base cursor-help text-right" title="${escapeHtml(daysRemainingFormula)}">${formatNumber(Math.max(0, (summary.daysAccumulated || 0) - (summary.daysTakenCurrentYear || 0)))}</span>
            </div>
            <div class="pl-4 mt-1 space-y-1">
              <div class="flex justify-between items-center text-xs">
                <span class="text-gray-600">Días generados ${displayYear}:</span>
                <span class="font-semibold text-green-600 text-right">${formatNumber(summary.daysAccumulated || 0)}</span>
              </div>
              <div class="flex justify-between items-center text-xs">
                <span class="text-gray-500 italic">Días generados ${recordsYear}:</span>
                <span class="text-gray-500 italic text-right">${formatNumber(summary.daysGeneratedCurrentYear || 0)}</span>
              </div>
              <div class="flex justify-between items-center text-xs">
                <span class="text-gray-600">Días gozados:</span>
                <span class="font-semibold text-green-600 text-right">${formatNumber(summary.daysTakenCurrentYear || 0)}</span>
              </div>
            </div>
          </div>
          
          <div class="flex justify-between items-center py-2.5 px-2 border-b border-gray-200 hover:bg-blue-50 transition-colors rounded">
            <span class="text-gray-700 font-medium">Licencia No Gozada:</span>
            <span class="font-semibold text-blue-600 text-base cursor-help text-right" title="${escapeHtml(licenseNotTakenFormula)}">${formatCurrency(summary.licenseNotTakenSalary || 0)}</span>
          </div>
          
          <div class="flex justify-between items-center py-2.5 px-2 border-b border-gray-200 hover:bg-red-50 transition-colors rounded">
            <span class="text-gray-700 font-medium">Salario Vacacional:</span>
            <span class="font-semibold text-red-600 text-base cursor-help text-right" title="${escapeHtml(vacationSalaryFormula)}">${formatCurrency(summary.vacationSalary)}</span>
          </div>
          
          <div class="py-2.5 px-2 border-b border-gray-200 hover:bg-yellow-50 transition-colors rounded">
            <div class="flex justify-between items-center">
              <span class="text-gray-700 font-medium">Saldo de Aguinaldo:</span>
              <span class="font-semibold text-yellow-600 text-base text-right">${formatCurrency((summary.firstSemesterAguinaldo || 0) + (summary.secondSemesterAguinaldo || 0))}</span>
            </div>
            <div class="pl-4 mt-1 space-y-1">
              <div class="flex justify-between items-center text-xs">
                <span class="text-gray-600">12/${displayYear} - 05/${currentYear}:</span>
                <span class="font-semibold text-yellow-600 cursor-help" title="${escapeHtml(firstSemesterAguinaldoFormula)}">${formatCurrency(summary.firstSemesterAguinaldo || 0)}</span>
              </div>
              <div class="flex justify-between items-center text-xs">
                <span class="text-gray-600">06/${currentYear} - 11/${currentYear}:</span>
                <span class="font-semibold text-yellow-600 cursor-help" title="${escapeHtml(secondSemesterAguinaldoFormula)}">${formatCurrency(summary.secondSemesterAguinaldo || 0)}</span>
              </div>
            </div>
          </div>
        </div>
      `;
      
      card.addEventListener('click', async () => {
        // Prevent double clicks
        if (card.dataset.loading === 'true') return;
        card.dataset.loading = 'true';
        card.style.pointerEvents = 'none';
        showSpinner('Cargando detalles...');
        try {
          await showEmployeeDetails(employee.id);
        } finally {
          hideSpinner();
          card.dataset.loading = 'false';
          card.style.pointerEvents = 'auto';
        }
      });
      
      cardsContainer.appendChild(card);
    });
    
    payrollContent.appendChild(cardsContainer);
}

// Show employee details as full page
async function showEmployeeDetails(employeeId, successMessage = null) {
  const payrollContent = document.getElementById('payroll-items-content');
  if (!payrollContent) return;
  
  selectedEmployeeId = employeeId;
  await loadAllData();
  
  const employee = employeesData[employeeId];
  if (!employee) return;
  
  // Get nrd instance dynamically
  const nrd = window.nrd;
  if (!nrd) {
    await showError('Servicio no disponible');
    return;
  }
  
  // Recalculate payroll items for the current year before showing summary
  // This ensures the summary boxes show correct calculated values
  if (typeof window.recalculatePayrollItems === 'function') {
    try {
      await window.recalculatePayrollItems(employeeId, currentYear);
      // Reload data after recalculation to get updated values
      const [updatedVacations, updatedAguinaldos] = await Promise.all([
        nrd.vacations.queryByChild('employeeId', employeeId).catch(() => []),
        nrd.aguinaldo.queryByChild('employeeId', employeeId).catch(() => [])
      ]);
      
      if (Array.isArray(updatedVacations)) {
        updatedVacations.forEach(v => {
          if (v && v.id) vacationsData[v.id] = v;
        });
      }
      if (Array.isArray(updatedAguinaldos)) {
        updatedAguinaldos.forEach(a => {
          if (a && a.id) aguinaldoData[a.id] = a;
        });
      }
      
      // Also reload salaries to ensure we have the latest jornal values
      const updatedSalaries = await nrd.salaries.queryByChild('employeeId', employeeId).catch(() => []);
      if (Array.isArray(updatedSalaries)) {
        updatedSalaries.forEach(s => {
          if (s && s.id) salariesData[s.id] = s;
        });
      }
    } catch (recalcError) {
      console.warn('Error recalculating payroll items for employee', { employeeId, year: currentYear, error: recalcError });
      // Continue anyway with existing data
    }
  }
  
  // recordsYear is the year for actual records (salaries and licenses)
  // When viewing year 2026, show records from 2026
  const recordsYear = currentYear;
  // The displayYear is the year of the data being shown in the cards
  // When viewing year 2026, cards show data from 2025, so displayYear = 2025
  const displayYear = currentYear - 1;
  
  // Calculate summary with fresh data, passing the viewing year (recordsYear)
  const summary = calculateEmployeeSummary(employeeId, recordsYear);
  
  // Get last salary info for tooltips
  const allEmployeeSalaries = Object.values(salariesData).filter(s => 
    s.employeeId === employeeId && s.year === recordsYear && s.month
  );
  const lastSalary = allEmployeeSalaries
    .sort((a, b) => (b.month || 0) - (a.month || 0))[0];
  
  const lastSalaryInfo = lastSalary ? {
    month: lastSalary.month,
    year: lastSalary.year,
    dailyWage: lastSalary.dailyWage || (lastSalary.baseSalary30Days && lastSalary.extras 
      ? (parseFloat(lastSalary.baseSalary30Days) + parseFloat(lastSalary.extras || 0)) / 30
      : lastSalary.baseSalary30Days ? parseFloat(lastSalary.baseSalary30Days) / 30 : 0)
  } : null;
  
  // Get semester salaries for aguinaldo formulas
  const displayYearDecSalaries = allEmployeeSalaries.filter(s => 
    s.year === displayYear && s.month === 12
  );
  const recordsYearSalaries = allEmployeeSalaries.filter(s => s.year === recordsYear);
  const firstSemesterSalaries = [
    ...displayYearDecSalaries,
    ...recordsYearSalaries.filter(s => s.month >= 1 && s.month <= 5)
  ];
  const secondSemesterSalaries = recordsYearSalaries.filter(s => 
    s.month >= 6 && s.month <= 11
  );
  
  // Generate formulas for tooltips
  const daysAccumulatedFormula = getDaysAccumulatedFormula(summary, recordsYear);
  const daysRemainingFormula = getDaysRemainingFormula(summary, recordsYear);
  const vacationSalaryFormula = getVacationSalaryFormula(summary, lastSalaryInfo);
  const licenseNotTakenFormula = getLicenseNotTakenFormula(summary, lastSalaryInfo);
  const firstSemesterAguinaldoFormula = getAguinaldoFormula(summary, 'first', displayYear, recordsYear, firstSemesterSalaries);
  const secondSemesterAguinaldoFormula = getAguinaldoFormula(summary, 'second', displayYear, recordsYear, secondSemesterSalaries);
  
  // Calculate hasPending using the same logic as in employee cards
  const displayedDaysRemaining = Math.round(Math.max(0, (summary.daysAccumulated || 0) - (summary.daysTakenCurrentYear || 0)));
  const hasPendingDays = displayedDaysRemaining > 0;
  
  // Check if vacation salary exists and is not paid
  const vacationSalary = Math.round(Math.max(0, summary.vacationSalary || 0));
  const hasVacationSalary = vacationSalary > 0;
  let hasUnpaidVacationSalary = false;
  if (hasVacationSalary) {
    const employeeVacations = Object.values(vacationsData).filter(v => 
      v && v.employeeId === employeeId && v.year === displayYear && !v.isLicenseNotTaken
    );
    const vacationSalaryPaid = employeeVacations.some(v => v.paidDate);
    hasUnpaidVacationSalary = !vacationSalaryPaid;
  }
  
  // Check if aguinaldo exists and is not paid (check both semesters)
  const firstSemesterAguinaldo = Math.round(Math.max(0, summary.firstSemesterAguinaldo || 0));
  const secondSemesterAguinaldo = Math.round(Math.max(0, summary.secondSemesterAguinaldo || 0));
  const hasFirstSemesterAguinaldo = firstSemesterAguinaldo > 0;
  const hasSecondSemesterAguinaldo = secondSemesterAguinaldo > 0;
  let hasUnpaidAguinaldo = false;
  
  if (hasFirstSemesterAguinaldo || hasSecondSemesterAguinaldo) {
    const employeeAguinaldos = Object.values(aguinaldoData).filter(a => 
      a && a.employeeId === employeeId && a.year === recordsYear
    );
    
    // Check if each semester aguinaldo is paid
    const firstSemesterAguinaldoRecord = employeeAguinaldos.find(a => 
      a.notes && (a.notes.includes('1er semestre') || a.notes.includes('primer semestre'))
    );
    const secondSemesterAguinaldoRecord = employeeAguinaldos.find(a => 
      a.notes && (a.notes.includes('2do semestre') || a.notes.includes('segundo semestre'))
    );
    
    const firstSemesterPaid = firstSemesterAguinaldoRecord && firstSemesterAguinaldoRecord.paidDate;
    const secondSemesterPaid = secondSemesterAguinaldoRecord && secondSemesterAguinaldoRecord.paidDate;
    
    const hasUnpaidFirstSemester = hasFirstSemesterAguinaldo && !firstSemesterPaid;
    const hasUnpaidSecondSemester = hasSecondSemesterAguinaldo && !secondSemesterPaid;
    hasUnpaidAguinaldo = hasUnpaidFirstSemester || hasUnpaidSecondSemester;
  }
  
  // Employee has pending ONLY if they have actual pending items (days > 0 or amounts > 0)
  const hasPending = hasPendingDays || hasUnpaidVacationSalary || hasUnpaidAguinaldo;
  
  // Replace content with employee details page
  payrollContent.innerHTML = `
    <div class="bg-white border border-gray-200 shadow-sm">
      <div class="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200 ${hasPending ? 'bg-red-600' : 'bg-green-600'} relative">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <button id="back-to-employees-btn" class="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/20 hover:bg-white/30 text-white rounded transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
              </svg>
              Volver
            </button>
            <h3 class="text-lg sm:text-xl font-semibold tracking-tight text-white">${escapeHtml(employee.name)} - ${recordsYear}</h3>
          </div>
        </div>
      </div>
      
      <!-- Success Message Alert -->
      <div id="employee-details-success-alert" class="hidden mx-4 mt-4 mb-0 p-3 bg-green-600 text-white rounded shadow-lg transition-all duration-300">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium" id="employee-details-success-message"></span>
          <button id="close-success-alert" class="text-white hover:text-gray-200 text-lg font-light w-6 h-6 flex items-center justify-center">×</button>
        </div>
      </div>
      
      <!-- Employee Dates Info -->
      <div class="px-4 sm:px-6 pt-4 pb-2 border-b border-gray-200 bg-gray-50">
        <div class="flex flex-wrap gap-4 text-sm">
          ${employee.startDate ? `
            <div class="flex items-center gap-2">
              <span class="text-gray-600 font-medium">Fecha de Ingreso:</span>
              <span class="text-gray-800">${new Date(employee.startDate).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
            </div>
          ` : ''}
          ${employee.endDate ? `
            <div class="flex items-center gap-2">
              <span class="text-gray-600 font-medium">Fecha de Egreso:</span>
              <span class="text-gray-800">${new Date(employee.endDate).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
            </div>
          ` : ''}
        </div>
      </div>
      
      <div class="p-4 sm:p-6 space-y-6">
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div class="bg-green-50 p-2.5 sm:p-3 rounded border border-green-200">
            <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-1 gap-1">
              <div class="text-xs text-gray-600 leading-tight">Saldo Días de Licencia:</div>
              <div class="text-base sm:text-lg font-medium text-green-600 cursor-help sm:text-right" title="${escapeHtml(daysRemainingFormula)}">${formatNumber(Math.max(0, (summary.daysAccumulated || 0) - (summary.daysTakenCurrentYear || 0)))}</div>
            </div>
            <div class="pl-0 sm:pl-2 mt-2 space-y-1">
              <div class="flex justify-between items-center text-xs">
                <span class="text-gray-600">Días generados ${displayYear}:</span>
                <span class="font-medium text-green-600 sm:text-right">${formatNumber(summary.daysAccumulated || 0)}</span>
              </div>
              <div class="flex justify-between items-center text-xs">
                <span class="text-gray-500 italic">Días generados ${recordsYear}:</span>
                <span class="text-gray-500 italic sm:text-right">${formatNumber(summary.daysGeneratedCurrentYear || 0)}</span>
              </div>
              <div class="flex justify-between items-center text-xs">
                <span class="text-gray-600">Días gozados:</span>
                <span class="font-medium text-green-600 sm:text-right">${formatNumber(summary.daysTakenCurrentYear || 0)}</span>
              </div>
            </div>
          </div>
          <div class="bg-blue-50 p-2.5 sm:p-3 rounded border border-blue-200">
            <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <div class="text-xs text-gray-600 leading-tight">Licencia No Gozada:</div>
              <div class="text-base sm:text-lg font-medium text-blue-600 cursor-help sm:text-right break-words" title="${escapeHtml(licenseNotTakenFormula)}">${formatCurrency(summary.licenseNotTakenSalary || 0)}</div>
            </div>
          </div>
          <div class="bg-red-50 p-2.5 sm:p-3 rounded border border-red-200">
            <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <div class="text-xs text-gray-600 leading-tight">Salario Vacacional:</div>
              <div class="text-base sm:text-lg font-medium text-red-600 cursor-help sm:text-right break-words" title="${escapeHtml(vacationSalaryFormula)}">${formatCurrency(summary.vacationSalary)}</div>
            </div>
          </div>
          <div class="bg-yellow-50 p-2.5 sm:p-3 rounded border border-yellow-200">
            <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 gap-1">
              <div class="text-xs text-gray-600 leading-tight">Saldo de Aguinaldo:</div>
              <div class="text-base sm:text-lg font-medium text-yellow-600 sm:text-right break-words">${formatCurrency((summary.firstSemesterAguinaldo || 0) + (summary.secondSemesterAguinaldo || 0))}</div>
            </div>
            <div class="pl-0 sm:pl-2 space-y-1">
              <div class="flex justify-between items-center text-xs">
                <span class="text-gray-600">12/${displayYear} - 05/${currentYear}:</span>
                <span class="font-medium text-yellow-600 cursor-help break-words sm:text-right" title="${escapeHtml(firstSemesterAguinaldoFormula)}">${formatCurrency(summary.firstSemesterAguinaldo || 0)}</span>
              </div>
              <div class="flex justify-between items-center text-xs">
                <span class="text-gray-600">06/${currentYear} - 11/${currentYear}:</span>
                <span class="font-medium text-yellow-600 cursor-help break-words sm:text-right" title="${escapeHtml(secondSemesterAguinaldoFormula)}">${formatCurrency(summary.secondSemesterAguinaldo || 0)}</span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Salaries Section -->
        <div>
          <div class="flex justify-between items-center mb-3">
            <h4 class="text-base font-light text-gray-800">Registros de Salario ${recordsYear}</h4>
            <button id="add-salary-btn" class="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
              + Agregar Salario
            </button>
          </div>
          <div id="salaries-list" class="space-y-2">
            ${(() => {
              // Get all salaries for this employee in recordsYear (the year being viewed)
              const allEmployeeSalaries = Object.values(salariesData).filter(s => 
                s.employeeId === employeeId
              );
              const yearSalaries = allEmployeeSalaries.filter(s => s.year === recordsYear);
              
              if (yearSalaries.length === 0) {
                return `<p class="text-sm text-gray-500 text-center py-4">No hay salarios registrados para ${recordsYear}</p>`;
              }
              
              return yearSalaries.sort((a, b) => (a.month || 0) - (b.month || 0)).map(salary => {
                // Calculate values based on type
                let dailyWage = 0;
                let monthlySalary = 0;
                
                if (salary.type === 'daily') {
                  // If it's daily, use the registered dailyWage
                  dailyWage = parseFloat(salary.dailyWage || 0);
                  // Calculate monthly: dailyWage x 30
                  monthlySalary = dailyWage * 30;
                } else {
                  // If it's monthly, use the registered monthlySalary or calculate from baseSalary30Days
                  monthlySalary = parseFloat(salary.monthlySalary || salary.baseSalary30Days || 0);
                  // Calculate daily wage: baseSalary30Days / 30
                  const base30 = parseFloat(salary.baseSalary30Days || 0);
                  dailyWage = base30 / 30;
                }
                
                const extras = parseFloat(salary.extras || 0);
                const totalSalary = monthlySalary + extras;
                
                return `
                <div class="border border-gray-200 rounded p-3 flex justify-between items-center">
                  <div>
                    <div class="text-sm font-medium">${getMonthName(salary.month)} ${salary.year}</div>
                    <div class="text-xs text-gray-600">
                      Jornal diario: ${formatCurrency(dailyWage)}
                    </div>
                    <div class="text-xs text-gray-600">
                      Mensual: ${formatCurrency(monthlySalary)}
                    </div>
                    <div class="text-xs text-gray-600">
                      Extras: ${formatCurrency(extras)}
                    </div>
                    <div class="text-xs font-medium text-gray-800 mt-0.5">
                      Salario: ${formatCurrency(totalSalary)}
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <button class="edit-salary-btn px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors" 
                      data-salary-id="${salary.id}">
                      Editar
                    </button>
                    <button class="delete-salary-btn px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors" 
                      data-salary-id="${salary.id}">
                      Eliminar
                    </button>
                  </div>
                </div>
              `;
              }).join('');
            })()}
          </div>
        </div>
        
        <!-- Licenses Section -->
        <div>
          <div class="flex justify-between items-center mb-3">
            <h4 class="text-base font-light text-gray-800">Días Tomados o Partidas Pagas</h4>
            <div class="flex gap-2">
              <button id="add-license-btn" class="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
                + Agregar Licencia
              </button>
              <button id="add-aguinaldo-btn" class="px-3 py-1 text-xs bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors">
                + Agregar Aguinaldo
              </button>
            </div>
          </div>
          <div id="licenses-list" class="space-y-2">
            ${(() => {
              // Get all licenses for this employee in recordsYear (the year being viewed)
              const allEmployeeLicenses = Object.values(licensesData).filter(l => 
                l.employeeId === employeeId
              );
              const yearLicenses = allEmployeeLicenses.filter(l => l.year === recordsYear);
              
              // Get all aguinaldos for this employee in recordsYear
              const allEmployeeAguinaldos = Object.values(aguinaldoData).filter(a => 
                a && a.employeeId === employeeId && a.year === recordsYear && a.paidDate
              );
              
              // Combine licenses and aguinaldos, sort by date
              const allItems = [];
              
              // Add licenses
              yearLicenses.forEach(license => {
                allItems.push({
                  type: 'license',
                  id: license.id,
                  month: license.month || null,
                  year: license.year,
                  label: license.month ? `${getMonthName(license.month)} ${license.year}` : `${license.year}`,
                  details: `Días tomados: ${license.daysTaken || 0}`,
                  startDate: license.startDate,
                  endDate: license.endDate
                });
              });
              
              // Add aguinaldos (only if they have paidDate - meaning they were marked as paid)
              allEmployeeAguinaldos.forEach(aguinaldo => {
                // Extract semester from notes
                let semesterLabel = 'Aguinaldo';
                if (aguinaldo.notes) {
                  if (aguinaldo.notes.includes('1er semestre')) {
                    semesterLabel = '1er Semestre (Dic ' + (recordsYear - 1) + ' - May ' + recordsYear + ')';
                  } else if (aguinaldo.notes.includes('2do semestre')) {
                    semesterLabel = '2do Semestre (Jun ' + recordsYear + ' - Nov ' + recordsYear + ')';
                  }
                }
                
                allItems.push({
                  type: 'aguinaldo',
                  id: aguinaldo.id,
                  month: null,
                  year: aguinaldo.year,
                  label: semesterLabel,
                  details: `Aguinaldo: ${formatCurrency(aguinaldo.amount || 0)}`,
                  paidDate: aguinaldo.paidDate,
                  notes: aguinaldo.notes
                });
              });
              
              // Sort by date (paidDate or month/year)
              allItems.sort((a, b) => {
                if (a.paidDate && b.paidDate) {
                  return b.paidDate - a.paidDate;
                }
                if (a.paidDate) return -1;
                if (b.paidDate) return 1;
                if (a.year !== b.year) return b.year - a.year;
                if (a.month && b.month) return b.month - a.month;
                if (a.month) return -1;
                if (b.month) return 1;
                return 0;
              });
              
              if (allItems.length === 0) {
                return `<p class="text-sm text-gray-500 text-center py-4">No hay partidas registradas para ${recordsYear}</p>`;
              }
              
              return allItems.map(item => {
                if (item.type === 'license') {
                  return `
                    <div class="border border-gray-200 rounded p-3 flex justify-between items-center">
                      <div>
                        <div class="text-sm font-medium">
                          ${item.label}
                        </div>
                        <div class="text-xs text-gray-600">
                          ${item.details}
                        </div>
                        ${item.startDate ? `
                          <div class="text-xs text-gray-500">
                            ${new Date(item.startDate).toLocaleDateString('es-ES')} - 
                            ${item.endDate ? new Date(item.endDate).toLocaleDateString('es-ES') : ''}
                          </div>
                        ` : ''}
                      </div>
                      <div class="flex gap-2">
                        <button class="edit-license-btn px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors" 
                          data-license-id="${item.id}">
                          Editar
                        </button>
                        <button class="delete-license-btn px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors" 
                          data-license-id="${item.id}">
                          Eliminar
                        </button>
                      </div>
                    </div>
                  `;
                } else {
                  // Aguinaldo
                  return `
                    <div class="border border-yellow-200 rounded p-3 flex justify-between items-center bg-yellow-50">
                      <div>
                        <div class="text-sm font-medium">
                          ${item.label}
                        </div>
                        <div class="text-xs text-gray-600">
                          ${item.details}
                        </div>
                        ${item.paidDate ? `
                          <div class="text-xs text-gray-500">
                            Fecha de pago: ${new Date(item.paidDate).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </div>
                        ` : ''}
                      </div>
                      <div class="flex gap-2">
                        <button class="edit-aguinaldo-btn px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors" 
                          data-aguinaldo-id="${item.id}">
                          Editar
                        </button>
                        <button class="delete-aguinaldo-btn px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors" 
                          data-aguinaldo-id="${item.id}">
                          Eliminar
                        </button>
                      </div>
                    </div>
                  `;
                }
              }).join('');
            })()}
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Wait for DOM to be ready before attaching handlers
  setTimeout(() => {
    // Show success message if provided
    if (successMessage) {
      const alertDiv = document.getElementById('employee-details-success-alert');
      const messageSpan = document.getElementById('employee-details-success-message');
      if (alertDiv && messageSpan) {
        messageSpan.textContent = successMessage;
        alertDiv.classList.remove('hidden');
        
        // Auto-hide after 30 seconds
        let autoHideTimeout = setTimeout(() => {
          alertDiv.classList.add('hidden');
        }, 30000);
        
        // Close button handler
        const closeAlertBtn = document.getElementById('close-success-alert');
        if (closeAlertBtn) {
          closeAlertBtn.addEventListener('click', () => {
            clearTimeout(autoHideTimeout);
            alertDiv.classList.add('hidden');
          });
        }
      }
    }
    
    // Back button handler
    const backBtn = document.getElementById('back-to-employees-btn');
    if (backBtn) {
      backBtn.addEventListener('click', async () => {
        selectedEmployeeId = null;
        await loadPayrollItems();
      });
    }
  }, 0);
  
  // Add salary button
  const addSalaryBtn = document.getElementById('add-salary-btn');
  if (addSalaryBtn) {
    // Remove any existing listeners by cloning
    const newBtn = addSalaryBtn.cloneNode(true);
    addSalaryBtn.parentNode.replaceChild(newBtn, addSalaryBtn);
    
    newBtn.addEventListener('click', async () => {
      if (newBtn.disabled) return;
      newBtn.disabled = true;
      showSpinner('Cargando formulario...');
      try {
        await showSalaryForm(null, employeeId);
      } finally {
        hideSpinner();
        newBtn.disabled = false;
      }
    });
  }
  
  // Add license button
  const addLicenseBtn = document.getElementById('add-license-btn');
  if (addLicenseBtn) {
    // Remove any existing listeners by cloning
    const newLicenseBtn = addLicenseBtn.cloneNode(true);
    addLicenseBtn.parentNode.replaceChild(newLicenseBtn, addLicenseBtn);
    
    newLicenseBtn.addEventListener('click', async () => {
      if (newLicenseBtn.disabled) return;
      newLicenseBtn.disabled = true;
      showSpinner('Cargando formulario...');
      try {
        await showLicenseForm(null, employeeId);
      } finally {
        hideSpinner();
        newLicenseBtn.disabled = false;
      }
    });
  }
  
  // Add aguinaldo button (mark as paid)
  const addAguinaldoBtn = document.getElementById('add-aguinaldo-btn');
  if (addAguinaldoBtn) {
    const newAguinaldoBtn = addAguinaldoBtn.cloneNode(true);
    addAguinaldoBtn.parentNode.replaceChild(newAguinaldoBtn, addAguinaldoBtn);
    
    newAguinaldoBtn.addEventListener('click', async () => {
      if (newAguinaldoBtn.disabled) return;
      showSpinner('Cargando formulario...');
      try {
        await showAguinaldoPaymentForm(employeeId, recordsYear);
      } finally {
        hideSpinner();
      }
    });
  }
  
  // Edit salary buttons
  document.querySelectorAll('.edit-salary-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      btn.disabled = true;
      const salaryId = e.target.dataset.salaryId;
      showSpinner('Cargando formulario...');
      try {
        await showSalaryForm(salaryId, employeeId);
      } finally {
        hideSpinner();
        btn.disabled = false;
      }
    });
  });
  
  // Edit license buttons
  document.querySelectorAll('.edit-license-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      btn.disabled = true;
      const licenseId = e.target.dataset.licenseId;
      showSpinner('Cargando formulario...');
      try {
        await showLicenseForm(licenseId, employeeId);
      } finally {
        hideSpinner();
        btn.disabled = false;
      }
    });
  });
  
  // Delete salary buttons
  document.querySelectorAll('.delete-salary-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      const salaryId = e.target.dataset.salaryId;
      const salary = Object.values(salariesData).find(s => s.id === salaryId);
      
      if (!salary) {
        await showError('No se encontró el salario');
        return;
      }
      
      const monthName = getMonthName(salary.month);
      const confirmed = await showConfirm('Eliminar Salario', `¿Está seguro de eliminar el salario de ${monthName} ${salary.year}?`);
      
      if (!confirmed) return;
      
      btn.disabled = true;
      showSpinner('Eliminando salario...');
      
      try {
        const nrd = window.nrd;
        if (!nrd) {
          await showError('Servicio no disponible');
          return;
        }
        await nrd.salaries.delete(salaryId);
        
        // Recalculate payroll items
        if (typeof window.recalculatePayrollItems === 'function') {
          try {
            await window.recalculatePayrollItems(employeeId, salary.year);
          } catch (calcError) {
            logger.warn('Error recalculating payroll items after delete (non-blocking)', { employeeId, year: salary.year, error: calcError });
          }
        }
        
        // Reload employee details
        await showEmployeeDetails(employeeId, 'Salario eliminado exitosamente');
      } catch (error) {
        console.error('Error deleting salary', error);
        await showError('Error al eliminar el salario: ' + (error.message || 'Error desconocido'));
        btn.disabled = false;
      } finally {
        hideSpinner();
      }
    });
  });
  
  // Delete license buttons
  document.querySelectorAll('.delete-license-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      const licenseId = e.target.dataset.licenseId;
      const license = Object.values(licensesData).find(l => l.id === licenseId);
      
      if (!license) {
        await showError('No se encontró la licencia');
        return;
      }
      
      const monthName = license.month ? getMonthName(license.month) + ' ' : '';
      const confirmed = await showConfirm('Eliminar Licencia', `¿Está seguro de eliminar la licencia de ${monthName}${license.year} (${license.daysTaken || 0} días)?`);
      
      if (!confirmed) return;
      
      btn.disabled = true;
      showSpinner('Eliminando licencia...');
      
      try {
        const nrd = window.nrd;
        if (!nrd) {
          await showError('Servicio no disponible');
          return;
        }
        await nrd.licenses.delete(licenseId);
        
        // Recalculate payroll items
        if (typeof window.recalculatePayrollItems === 'function') {
          try {
            await window.recalculatePayrollItems(employeeId, license.year);
          } catch (calcError) {
            logger.warn('Error recalculating payroll items after delete (non-blocking)', { employeeId, year: license.year, error: calcError });
          }
        }
        
        // Reload employee details
        await showEmployeeDetails(employeeId, 'Licencia eliminada exitosamente');
      } catch (error) {
        console.error('Error deleting license', error);
        await showError('Error al eliminar la licencia: ' + (error.message || 'Error desconocido'));
        btn.disabled = false;
      } finally {
        hideSpinner();
      }
    });
  });
  
  // Edit aguinaldo buttons
  document.querySelectorAll('.edit-aguinaldo-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      btn.disabled = true;
      const aguinaldoId = e.target.dataset.aguinaldoId;
      showSpinner('Cargando formulario...');
      try {
        const aguinaldo = Object.values(aguinaldoData).find(a => a && a.id === aguinaldoId);
        if (aguinaldo) {
          // Determine semester from notes
          const isFirstSemester = aguinaldo.notes && aguinaldo.notes.includes('1er semestre');
          // Open form with the appropriate semester pre-selected
          await showAguinaldoPaymentForm(employeeId, recordsYear);
          // After modal loads, set the semester
          setTimeout(() => {
            const semesterSelect = document.getElementById('aguinaldo-semester');
            if (semesterSelect) {
              semesterSelect.value = isFirstSemester ? 'first' : 'second';
              semesterSelect.dispatchEvent(new Event('change'));
            }
          }, 200);
        }
      } finally {
        hideSpinner();
        btn.disabled = false;
      }
    });
  });
  
  // Delete aguinaldo buttons
  document.querySelectorAll('.delete-aguinaldo-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      const aguinaldoId = e.target.dataset.aguinaldoId;
      const aguinaldo = Object.values(aguinaldoData).find(a => a && a.id === aguinaldoId);
      
      if (!aguinaldo) {
        await showError('No se encontró el aguinaldo');
        return;
      }
      
      // Extract semester from notes
      const semesterText = aguinaldo.notes && aguinaldo.notes.includes('1er semestre') ? '1er Semestre' : '2do Semestre';
      const confirmed = await showConfirm('Eliminar Aguinaldo', `¿Está seguro de eliminar el aguinaldo del ${semesterText} ${aguinaldo.year}?`);
      
      if (!confirmed) return;
      
      btn.disabled = true;
      showSpinner('Eliminando aguinaldo...');
      
      try {
        // Delete the aguinaldo record (remove paidDate to unmark as paid)
        await nrd.aguinaldo.update(aguinaldoId, {
          paidDate: null,
          updatedAt: Date.now()
        });
        
        // Reload employee details to update display
        await showEmployeeDetails(employeeId, 'Aguinaldo eliminado exitosamente');
      } catch (error) {
        console.error('Error deleting aguinaldo', error);
        await showError('Error al eliminar el aguinaldo: ' + (error.message || 'Error desconocido'));
        btn.disabled = false;
      } finally {
        hideSpinner();
      }
    });
  });
}

// Show salary form (simplified version)
async function showSalaryForm(salaryId = null, employeeId = null) {
  // Remove any existing salary form modal first
  const existingModal = document.getElementById('salary-form-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  await loadAllData();
  
  // Function to get available months for an employee in a specific year
  function getAvailableMonths(empId, year, excludeSalaryId = null) {
    if (!empId || !year) {
      // If no employee or year, show all months
      return Array.from({length: 12}, (_, i) => i + 1);
    }
    
    // Get all salaries for this employee in this year
    const employeeSalaries = Object.values(salariesData).filter(s => 
      s.employeeId === empId && 
      s.year === year &&
      (!excludeSalaryId || s.id !== excludeSalaryId)
    );
    
    // Get months that are already used
    const usedMonths = new Set(employeeSalaries.map(s => s.month).filter(Boolean));
    
    // Return months that are not used
    return Array.from({length: 12}, (_, i) => i + 1).filter(m => !usedMonths.has(m));
  }
  
  // Function to generate month options HTML
  function generateMonthOptions(empId, year, excludeSalaryId = null) {
    const availableMonths = getAvailableMonths(empId, year, excludeSalaryId);
    return availableMonths.map(m => 
      `<option value="${m}">${getMonthName(m)}</option>`
    ).join('');
  }
  
  // Generate initial month options based on current year
  const monthOptions = generateMonthOptions(employeeId, currentYear, salaryId);

  const formHtml = `
    <form id="salary-form-element" class="space-y-4">
      <input type="hidden" id="salary-id" value="${salaryId || ''}">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Año</label>
          <input type="number" id="salary-year" min="2020" max="2100" required readonly
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-600 bg-gray-100 text-sm"
            value="${currentYear}">
        </div>
        <div>
          <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Mes</label>
          <select id="salary-month" required 
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-600 bg-white text-sm">
            <option value="">Seleccione...</option>
            ${monthOptions}
          </select>
        </div>
      </div>
      <div>
        <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Tipo</label>
        <select id="salary-type" required 
          class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-600 bg-white text-sm">
          <option value="daily">Jornal Diario</option>
          <option value="monthly">Salario Mensual</option>
        </select>
      </div>
      <div id="daily-wage-container">
        <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Jornal Diario</label>
        <input type="text" id="salary-daily-wage" inputmode="decimal" 
          class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-600 bg-white text-sm"
          placeholder="0,00">
      </div>
      <div id="monthly-salary-container" class="hidden">
        <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Salario Mensual</label>
        <input type="text" id="salary-monthly-salary" inputmode="decimal" 
          class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-600 bg-white text-sm"
          placeholder="0,00">
      </div>
      <div>
        <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Extras (opcional)</label>
        <input type="text" id="salary-extras" inputmode="decimal" 
          class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-600 bg-white text-sm"
          placeholder="0,00">
      </div>
      <div>
        <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Salario Base 30 días</label>
        <input type="text" id="salary-base-30-days" inputmode="decimal" required readonly
          class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-600 bg-gray-100 text-sm"
          placeholder="0,00">
      </div>
      <div class="flex gap-3 pt-4 border-t border-gray-200">
        <button type="submit" class="flex-1 px-4 py-2 bg-green-600 text-white border border-green-600 hover:bg-green-700 transition-colors uppercase tracking-wider text-xs font-light">
          Guardar
        </button>
        <button type="button" id="cancel-salary-btn" class="flex-1 px-4 py-2 border border-gray-300 hover:border-red-600 hover:text-red-600 transition-colors uppercase tracking-wider text-xs font-light">
          Cancelar
        </button>
      </div>
    </form>
  `;

  const modal = document.createElement('div');
  modal.id = 'salary-form-modal';
  modal.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
  modal.style.overflowY = 'auto';
  modal.style.scrollbarWidth = 'none'; // Firefox
  modal.style.msOverflowStyle = 'none'; // IE/Edge
  modal.innerHTML = `
    <style>
      #salary-form-modal::-webkit-scrollbar {
        display: none;
        width: 0;
        height: 0;
      }
      #salary-form-modal > div::-webkit-scrollbar {
        display: none;
        width: 0;
        height: 0;
      }
    </style>
    <div class="bg-white rounded-lg max-w-2xl w-full border border-gray-200 shadow-lg max-h-[90vh] overflow-y-auto" 
      style="scrollbar-width: none; -ms-overflow-style: none; -webkit-overflow-scrolling: touch;">
      <div class="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200 bg-green-600">
        <div class="flex items-center justify-between">
          <h3 class="text-lg sm:text-xl font-semibold tracking-tight text-white">${salaryId ? 'Editar Salario' : 'Nuevo Salario'}</h3>
          <button id="close-salary-form" class="text-white hover:text-gray-200 text-2xl font-light w-8 h-8 flex items-center justify-center hover:bg-white/20 transition-colors">×</button>
        </div>
      </div>
      <div class="p-4 sm:p-6">
        ${formHtml}
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Handle salary type change
  const salaryTypeSelect = document.getElementById('salary-type');
  const dailyWageContainer = document.getElementById('daily-wage-container');
  const monthlySalaryContainer = document.getElementById('monthly-salary-container');
  const dailyWageInput = document.getElementById('salary-daily-wage');
  const monthlySalaryInput = document.getElementById('salary-monthly-salary');
  const baseSalaryInput = document.getElementById('salary-base-30-days');
  
  function calculateBaseSalary() {
    if (!baseSalaryInput) return;
    const type = salaryTypeSelect ? salaryTypeSelect.value : 'daily';
    
    if (type === 'daily' && dailyWageInput) {
      const dailyWage = parseDecimalWithComma(dailyWageInput.value) || 0;
      baseSalaryInput.value = formatDecimalWithComma(dailyWage * 30);
    } else if (type === 'monthly' && monthlySalaryInput) {
      const monthlySalary = parseDecimalWithComma(monthlySalaryInput.value) || 0;
      baseSalaryInput.value = formatDecimalWithComma(monthlySalary);
    }
  }
  
  if (salaryTypeSelect) {
    salaryTypeSelect.addEventListener('change', () => {
      const type = salaryTypeSelect.value;
      if (type === 'daily') {
        dailyWageContainer.classList.remove('hidden');
        monthlySalaryContainer.classList.add('hidden');
        if (dailyWageInput) dailyWageInput.required = true;
        if (monthlySalaryInput) monthlySalaryInput.required = false;
      } else {
        dailyWageContainer.classList.add('hidden');
        monthlySalaryContainer.classList.remove('hidden');
        if (dailyWageInput) dailyWageInput.required = false;
        if (monthlySalaryInput) monthlySalaryInput.required = true;
      }
      calculateBaseSalary();
    });
  }
  
  if (dailyWageInput) dailyWageInput.addEventListener('input', calculateBaseSalary);
  if (monthlySalaryInput) monthlySalaryInput.addEventListener('input', calculateBaseSalary);
  
  // Setup decimal inputs with comma
  setupDecimalInput('salary-daily-wage');
  setupDecimalInput('salary-monthly-salary');
  setupDecimalInput('salary-extras');
  setupDecimalInput('salary-base-30-days');
  
  // Handle year change - update month options
  const yearInput = document.getElementById('salary-year');
  const monthSelect = document.getElementById('salary-month');
  if (yearInput && monthSelect) {
    yearInput.addEventListener('change', () => {
      const year = parseInt(yearInput.value);
      if (year && employeeId) {
        const currentMonthValue = monthSelect.value; // Save current selection
        const newOptions = generateMonthOptions(employeeId, year, salaryId);
        monthSelect.innerHTML = '<option value="">Seleccione...</option>' + newOptions;
        // Try to restore previous selection if still available
        if (currentMonthValue) {
          const option = monthSelect.querySelector(`option[value="${currentMonthValue}"]`);
          if (option) {
            monthSelect.value = currentMonthValue;
          }
        }
      } else {
        // If no year or employee, show all months
        const allMonths = Array.from({length: 12}, (_, i) => {
          const m = i + 1;
          return `<option value="${m}">${getMonthName(m)}</option>`;
        }).join('');
        monthSelect.innerHTML = '<option value="">Seleccione...</option>' + allMonths;
      }
    });
  }

  // Get nrd instance dynamically
  const nrd = window.nrd;
  if (!nrd) {
    await showError('Servicio no disponible');
    return;
  }
  
  // Load salary data if editing
  if (salaryId) {
    try {
      const salary = await nrd.salaries.getById(salaryId);
      if (salary) {
        document.getElementById('salary-year').value = salary.year || currentYear;
        document.getElementById('salary-month').value = salary.month || '';
        document.getElementById('salary-type').value = salary.type || 'daily';
        salaryTypeSelect.dispatchEvent(new Event('change'));
        
        if (salary.type === 'daily') {
          document.getElementById('salary-daily-wage').value = formatDecimalWithComma(salary.dailyWage);
        } else {
          document.getElementById('salary-monthly-salary').value = formatDecimalWithComma(salary.monthlySalary);
        }
        document.getElementById('salary-extras').value = formatDecimalWithComma(salary.extras);
        document.getElementById('salary-base-30-days').value = formatDecimalWithComma(salary.baseSalary30Days);
      }
    } catch (error) {
      logger.error('Error loading salary', error);
    }
  }

  // Form submit
  const formElement = document.getElementById('salary-form-element');
  formElement.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Prevent double submission
    const submitBtn = formElement.querySelector('button[type="submit"]');
    if (submitBtn && submitBtn.disabled) return;
    
    const year = parseInt(document.getElementById('salary-year').value);
    const month = parseInt(document.getElementById('salary-month').value);
    const type = document.getElementById('salary-type').value;
    const dailyWageValue = document.getElementById('salary-daily-wage').value.trim();
    const monthlySalaryValue = document.getElementById('salary-monthly-salary').value.trim();
    const extrasValue = document.getElementById('salary-extras').value.trim();
    const extras = extrasValue ? parseDecimalWithComma(extrasValue) : undefined;
    const baseSalary30Days = parseDecimalWithComma(document.getElementById('salary-base-30-days').value);

    if (!employeeId || !year || !month || !type || baseSalary30Days === null || baseSalary30Days <= 0) {
      await showError('Por favor complete todos los campos requeridos');
      return;
    }

    if (type === 'daily') {
      const dailyWage = parseDecimalWithComma(dailyWageValue);
      if (dailyWage === null || dailyWage <= 0) {
        await showError('Por favor ingrese un jornal diario válido');
        return;
      }
    } else {
      const monthlySalary = parseDecimalWithComma(monthlySalaryValue);
      if (monthlySalary === null || monthlySalary <= 0) {
        await showError('Por favor ingrese un salario mensual válido');
        return;
      }
    }

    // Disable submit button and show spinner
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }
    showSpinner('Guardando y calculando...');

    try {
      let salaryData = {};
      
      if (type === 'daily') {
        // If it's daily wage type
        const dailyWage = parseDecimalWithComma(dailyWageValue);
        // Calculate baseSalary30Days = dailyWage * 30
        const calculatedBase30 = dailyWage * 30;
        // Calculate monthlySalary = dailyWage * 30
        const calculatedMonthly = dailyWage * 30;
        
        salaryData = {
          employeeId,
          year,
          month,
          type: 'daily',
          dailyWage,
          baseSalary30Days: calculatedBase30,
          monthlySalary: calculatedMonthly
        };
      } else {
        // If it's monthly salary type
        const monthlySalary = parseDecimalWithComma(monthlySalaryValue);
        // Calculate baseSalary30Days = monthlySalary (same value)
        const calculatedBase30 = monthlySalary;
        // Calculate dailyWage = monthlySalary / 30
        const calculatedDailyWage = monthlySalary / 30;
        
        salaryData = {
          employeeId,
          year,
          month,
          type: 'monthly',
          monthlySalary,
          baseSalary30Days: calculatedBase30,
          dailyWage: calculatedDailyWage
        };
      }

      if (extras !== undefined) {
        salaryData.extras = extras;
      }

      // Get nrd instance dynamically
      const nrd = window.nrd;
      if (!nrd) {
        await showError('Servicio no disponible');
        return;
      }
      
      if (salaryId) {
        await nrd.salaries.update(salaryId, salaryData);
      } else {
        salaryData.createdAt = Date.now();
        await nrd.salaries.create(salaryData);
      }

      // Recalculate payroll items (don't block on errors)
      if (typeof window.recalculatePayrollItems === 'function') {
        try {
          await window.recalculatePayrollItems(employeeId, year);
        } catch (calcError) {
          logger.warn('Error recalculating payroll items (non-blocking)', { employeeId, year, error: calcError });
          // Continue anyway - don't block the user
        }
      }

      // Close salary form modal first
      modal.remove();
      
      // Keep spinner visible while reloading employee details
      const successMessage = salaryId ? 'Salario actualizado exitosamente' : 'Salario creado exitosamente';
      try {
        if (selectedEmployeeId) {
          await showEmployeeDetails(selectedEmployeeId, successMessage);
        } else {
          await loadPayrollItems();
        }
      } catch (reloadError) {
        logger.error('Error reloading after salary save', { error: reloadError });
        // Still show success message even if reload fails
      }
      
      // Hide spinner after everything is done
      hideSpinner();
    } catch (error) {
      logger.error('Error saving salary', { employeeId, year, error });
      hideSpinner();
      await showError('Error al guardar salario: ' + (error.message || 'Error desconocido'));
    } finally {
      // Always re-enable the button, even if there were errors
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar';
      }
    }
  });

  // Close handlers
  document.getElementById('close-salary-form').addEventListener('click', () => modal.remove());
  document.getElementById('cancel-salary-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// Show license form (simplified version)
async function showLicenseForm(licenseId = null, employeeId = null) {
  // Remove any existing license form modal first
  const existingModal = document.getElementById('license-form-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  await loadAllData();
  
  // Calculate daily wage for vacation salary calculation
  // Use the same logic as calculateEmployeeSummary: last salary of currentYear (most recent month)
  const allEmployeeSalaries = Object.values(salariesData).filter(s => 
    s.employeeId === employeeId
  );
  
  // Get salaries from currentYear, sorted by month descending to get the last salary
  const currentYearSalariesForWage = allEmployeeSalaries
    .filter(s => s.year === currentYear && s.month)
    .sort((a, b) => {
      // Sort by month descending to get the last salary (most recent month)
      // If months are equal, prefer the one with dailyWage if available
      if ((b.month || 0) !== (a.month || 0)) {
        return (b.month || 0) - (a.month || 0);
      }
      // If same month, prefer one with dailyWage
      if (b.dailyWage && !a.dailyWage) return -1;
      if (a.dailyWage && !b.dailyWage) return 1;
      return 0;
    });
  
  let dailyWageForVacationSalary = 0;
  
  if (currentYearSalariesForWage.length > 0) {
    // Get the last salary (most recent month)
    const lastSalary = currentYearSalariesForWage[0];
    
    // Try to get dailyWage directly from the salary record first
    if (lastSalary.dailyWage && lastSalary.dailyWage > 0) {
      dailyWageForVacationSalary = parseFloat(lastSalary.dailyWage);
    } else {
      // Calculate daily wage from baseSalary30Days + extras
      const base = parseFloat(lastSalary.baseSalary30Days) || 0;
      const extras = parseFloat(lastSalary.extras) || 0;
      const totalMonthly = base + extras;
      dailyWageForVacationSalary = totalMonthly / 30;
    }
  }
  
  // Calculate available days (Saldo Días de Licencia) for display in label
  const summary = calculateEmployeeSummary(employeeId, currentYear);
  const availableDays = Math.max(0, (summary.daysAccumulated || 0) - (summary.daysTakenCurrentYear || 0));
  
  const monthOptions = Array.from({length: 12}, (_, i) => {
    const m = i + 1;
    return `<option value="${m}">${getMonthName(m)}</option>`;
  }).join('');

  const formHtml = `
    <form id="license-form-element" class="space-y-4">
      <input type="hidden" id="license-id" value="${licenseId || ''}">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Año</label>
          <input type="number" id="license-year" min="2020" max="2100" required 
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-600 bg-white text-sm"
            value="${currentYear}">
        </div>
        <div>
          <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Mes (opcional)</label>
          <select id="license-month" 
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-600 bg-white text-sm">
            <option value="">Sin mes específico</option>
            ${monthOptions}
          </select>
        </div>
      </div>
      <div>
        <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Días Tomados (${formatNumber(availableDays)} disponibles)</label>
        <input type="text" id="license-days-taken" inputmode="decimal" required 
          class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-600 bg-white text-sm"
          placeholder="0,0">
      </div>
      <div class="bg-blue-50 border border-blue-200 rounded p-3 space-y-2">
        <div class="flex justify-between items-center">
          <span class="text-xs text-gray-600 font-medium">Jornal Diario para Cálculo:</span>
          <span class="text-sm font-semibold text-blue-700" id="license-daily-wage-display">${formatCurrency(dailyWageForVacationSalary || 0)}</span>
        </div>
        <div class="flex justify-between items-center pt-1 border-t border-blue-200">
          <span class="text-xs text-gray-600 font-medium">Salario Vacacional Estimado:</span>
          <span class="text-sm font-semibold text-blue-700" id="license-vacation-salary-estimate">$0,00</span>
        </div>
        <p class="text-xs text-gray-500 mt-1">Se calcula automáticamente: días tomados × jornal diario</p>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Fecha Inicio (opcional)</label>
          <input type="date" id="license-start-date" 
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-600 bg-white text-sm">
        </div>
        <div>
          <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Fecha Fin (opcional)</label>
          <input type="date" id="license-end-date" 
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-600 bg-white text-sm">
        </div>
      </div>
      <div>
        <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Notas (opcional)</label>
        <textarea id="license-notes" rows="3"
          class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-600 bg-white text-sm"></textarea>
      </div>
      <div class="flex gap-3 pt-4 border-t border-gray-200">
        <button type="submit" class="flex-1 px-4 py-2 bg-green-600 text-white border border-green-600 hover:bg-green-700 transition-colors uppercase tracking-wider text-xs font-light">
          Guardar
        </button>
        <button type="button" id="cancel-license-btn" class="flex-1 px-4 py-2 border border-gray-300 hover:border-red-600 hover:text-red-600 transition-colors uppercase tracking-wider text-xs font-light">
          Cancelar
        </button>
      </div>
    </form>
  `;

  const modal = document.createElement('div');
  modal.id = 'license-form-modal';
  modal.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
  modal.style.overflowY = 'auto';
  modal.style.scrollbarWidth = 'none'; // Firefox
  modal.style.msOverflowStyle = 'none'; // IE/Edge
  modal.innerHTML = `
    <style>
      #license-form-modal::-webkit-scrollbar {
        display: none;
        width: 0;
        height: 0;
      }
      #license-form-modal > div::-webkit-scrollbar {
        display: none;
        width: 0;
        height: 0;
      }
    </style>
    <div class="bg-white rounded-lg max-w-2xl w-full border border-gray-200 shadow-lg max-h-[90vh] overflow-y-auto" 
      style="scrollbar-width: none; -ms-overflow-style: none; -webkit-overflow-scrolling: touch;">
      <div class="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200 bg-green-600">
        <div class="flex items-center justify-between">
          <h3 class="text-lg sm:text-xl font-semibold tracking-tight text-white">${licenseId ? 'Editar Licencia' : 'Nueva Licencia'}</h3>
          <button id="close-license-form" class="text-white hover:text-gray-200 text-2xl font-light w-8 h-8 flex items-center justify-center hover:bg-white/20 transition-colors">×</button>
        </div>
      </div>
      <div class="p-4 sm:p-6">
        ${formHtml}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Setup decimal input with comma
  setupDecimalInput('license-days-taken');
  
  // Calculate and update vacation salary estimate when days taken changes
  const daysTakenInput = document.getElementById('license-days-taken');
  const vacationSalaryEstimate = document.getElementById('license-vacation-salary-estimate');
  
  function updateVacationSalaryEstimate() {
    if (!daysTakenInput || !vacationSalaryEstimate || !dailyWageForVacationSalary) return;
    
    const daysTaken = parseDecimalWithComma(daysTakenInput.value);
    if (daysTaken !== null && daysTaken > 0 && dailyWageForVacationSalary > 0) {
      const estimatedVacationSalary = daysTaken * dailyWageForVacationSalary;
      vacationSalaryEstimate.textContent = formatCurrency(estimatedVacationSalary);
    } else {
      vacationSalaryEstimate.textContent = '$0,00';
    }
  }
  
  if (daysTakenInput) {
    daysTakenInput.addEventListener('input', updateVacationSalaryEstimate);
  }

  // Get nrd instance dynamically
  const nrd = window.nrd;
  if (!nrd) {
    await showError('Servicio no disponible');
    return;
  }
  
  // Load license data if editing
  if (licenseId) {
    try {
      const license = await nrd.licenses.getById(licenseId);
      if (license) {
        document.getElementById('license-year').value = license.year || currentYear;
        document.getElementById('license-month').value = license.month || '';
        document.getElementById('license-days-taken').value = formatDecimalWithComma(license.daysTaken);
        if (license.startDate) {
          document.getElementById('license-start-date').value = new Date(license.startDate).toISOString().split('T')[0];
        }
        if (license.endDate) {
          document.getElementById('license-end-date').value = new Date(license.endDate).toISOString().split('T')[0];
        }
        document.getElementById('license-notes').value = license.notes || '';
        
        // Update vacation salary estimate after loading license data
        setTimeout(() => {
          updateVacationSalaryEstimate();
        }, 100);
      }
    } catch (error) {
      logger.error('Error loading license', error);
    }
  }

  // Form submit
  const formElement = document.getElementById('license-form-element');
  formElement.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Prevent double submission
    const submitBtn = formElement.querySelector('button[type="submit"]');
    if (submitBtn && submitBtn.disabled) return;
    
    const year = parseInt(document.getElementById('license-year').value);
    const daysTaken = parseDecimalWithComma(document.getElementById('license-days-taken').value);
    const monthValue = document.getElementById('license-month').value;
    const month = monthValue ? parseInt(monthValue) : null;
    const startDateInput = document.getElementById('license-start-date').value;
    const endDateInput = document.getElementById('license-end-date').value;
    const notes = document.getElementById('license-notes').value.trim();

    if (!employeeId || !year || daysTaken === null || daysTaken <= 0) {
      await showError('Por favor complete todos los campos requeridos');
      return;
    }

    // Disable submit button and show spinner
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }
    showSpinner('Guardando y calculando...');

    try {
      const licenseData = {
        employeeId,
        year,
        daysTaken
      };

      if (month) {
        licenseData.month = month;
      }
      if (startDateInput) {
        licenseData.startDate = new Date(startDateInput).getTime();
      }
      if (endDateInput) {
        licenseData.endDate = new Date(endDateInput).getTime();
      }
      if (notes) {
        licenseData.notes = notes;
      }

      // Get nrd instance dynamically
      const nrd = window.nrd;
      if (!nrd) {
        await showError('Servicio no disponible');
        return;
      }
      
      if (licenseId) {
        await nrd.licenses.update(licenseId, licenseData);
      } else {
        licenseData.createdAt = Date.now();
        await nrd.licenses.create(licenseData);
      }

      // Recalculate payroll items (don't block on errors)
      if (typeof window.recalculatePayrollItems === 'function') {
        try {
          await window.recalculatePayrollItems(employeeId, year);
        } catch (calcError) {
          logger.warn('Error recalculating payroll items (non-blocking)', { employeeId, year, error: calcError });
          // Continue anyway - don't block the user
        }
      }

      // Close license form modal first
      modal.remove();
      
      // Keep spinner visible while reloading employee details
      const successMessage = licenseId ? 'Licencia actualizada exitosamente' : 'Licencia creada exitosamente';
      try {
        if (selectedEmployeeId) {
          await showEmployeeDetails(selectedEmployeeId, successMessage);
        } else {
          await loadPayrollItems();
        }
      } catch (reloadError) {
        logger.error('Error reloading after license save', { error: reloadError });
        // Still show success message even if reload fails
      }
      
      // Hide spinner after everything is done
      hideSpinner();
    } catch (error) {
      logger.error('Error saving license', { employeeId, year, error });
      hideSpinner();
      await showError('Error al guardar licencia: ' + (error.message || 'Error desconocido'));
    } finally {
      // Always re-enable the button, even if there were errors
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar';
      }
    }
  });

  // Close handlers
  document.getElementById('close-license-form').addEventListener('click', () => modal.remove());
  document.getElementById('cancel-license-btn').addEventListener('click', () => modal.remove());
  
  // Close modal when clicking outside (on the backdrop only)
  // Prevent closing when clicking inside the modal content
  modal.addEventListener('click', (e) => {
    // Only close if clicking directly on the modal backdrop (not on any child elements)
    if (e.target === modal) {
      modal.remove();
    }
  });
  
  // Prevent clicks inside the modal content from bubbling up and closing the modal
  const modalContent = modal.querySelector('.bg-white');
  if (modalContent) {
    modalContent.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
}

// Show aguinaldo payment form (mark as paid)
async function showAguinaldoPaymentForm(employeeId, year) {
  const existingModal = document.getElementById('aguinaldo-payment-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  await loadAllData();
  
  // Calculate aguinaldos by semester
  const displayYear = year - 1;
  const allEmployeeSalaries = Object.values(salariesData).filter(s => 
    s.employeeId === employeeId
  );
  
  // 1er semestre: December of display year + January to May of current year
  const displayYearDecSalaries = allEmployeeSalaries.filter(s => 
    s.year === displayYear && s.month === 12
  );
  const currentYearSalaries = allEmployeeSalaries.filter(s => 
    s.year === year
  );
  const firstSemesterCurrentYear = currentYearSalaries.filter(s => 
    s.month >= 1 && s.month <= 5
  );
  const firstSemesterSalaries = [...displayYearDecSalaries, ...firstSemesterCurrentYear];
  
  // 2do semestre: June to November of current year
  const secondSemesterSalaries = currentYearSalaries.filter(s => 
    s.month >= 6 && s.month <= 11
  );
  
  // Calculate aguinaldo for first semester
  let firstSemesterAguinaldo = 0;
  if (firstSemesterSalaries.length > 0) {
    const totalHaberesGravados = firstSemesterSalaries.reduce((sum, salary) => {
      const base = parseFloat(salary.baseSalary30Days) || 0;
      const extras = parseFloat(salary.extras) || 0;
      return sum + (base + extras);
    }, 0);
    firstSemesterAguinaldo = totalHaberesGravados / 12;
  }
  
  // Calculate aguinaldo for second semester
  let secondSemesterAguinaldo = 0;
  if (secondSemesterSalaries.length > 0) {
    const totalHaberesGravados = secondSemesterSalaries.reduce((sum, salary) => {
      const base = parseFloat(salary.baseSalary30Days) || 0;
      const extras = parseFloat(salary.extras) || 0;
      return sum + (base + extras);
    }, 0);
    secondSemesterAguinaldo = totalHaberesGravados / 12;
  }
  
  // Find existing aguinaldo records
  const existingAguinaldos = Object.values(aguinaldoData).filter(a => 
    a && a.employeeId === employeeId && a.year === year
  );
  const firstSemesterAguinaldoRecord = existingAguinaldos.find(a => 
    a.notes && (a.notes.includes('1er semestre') || a.notes.includes('primer semestre'))
  );
  const secondSemesterAguinaldoRecord = existingAguinaldos.find(a => 
    a.notes && (a.notes.includes('2do semestre') || a.notes.includes('segundo semestre'))
  );
  
  // Check if each semester has pending balance (amount > 0 and not paid)
  const firstSemesterPaid = firstSemesterAguinaldoRecord && firstSemesterAguinaldoRecord.paidDate;
  const secondSemesterPaid = secondSemesterAguinaldoRecord && secondSemesterAguinaldoRecord.paidDate;
  
  const hasFirstSemesterPending = firstSemesterAguinaldo > 0 && !firstSemesterPaid;
  const hasSecondSemesterPending = secondSemesterAguinaldo > 0 && !secondSemesterPaid;
  
  const formHtml = `
    <form id="aguinaldo-payment-form-element" class="space-y-4">
      <div>
        <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Año</label>
        <input type="number" id="aguinaldo-year" min="2020" max="2100" required readonly
          class="w-full px-3 py-2 border border-gray-300 rounded bg-gray-100 text-sm"
          value="${year}">
      </div>
      <div>
        <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Período de Aguinaldo</label>
        <select id="aguinaldo-semester" required
          class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-600 bg-white text-sm">
          <option value="">Seleccione...</option>
          ${hasFirstSemesterPending ? `<option value="first" ${firstSemesterAguinaldoRecord ? 'data-record-id="' + firstSemesterAguinaldoRecord.id + '"' : ''}>1er Semestre (Dic ${displayYear} - May ${year})</option>` : ''}
          ${hasSecondSemesterPending ? `<option value="second" ${secondSemesterAguinaldoRecord ? 'data-record-id="' + secondSemesterAguinaldoRecord.id + '"' : ''}>2do Semestre (Jun ${year} - Nov ${year})</option>` : ''}
        </select>
      </div>
      <div>
        <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Monto</label>
        <input type="text" id="aguinaldo-amount" required readonly
          class="w-full px-3 py-2 border border-gray-300 rounded bg-gray-100 text-sm"
          value="$0,00">
        <p class="text-xs text-gray-500 mt-1">El monto se actualiza según el período seleccionado</p>
      </div>
      <div>
        <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Fecha de Pago</label>
        <input type="date" id="aguinaldo-paid-date" required
          class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-600 bg-white text-sm">
      </div>
      <div>
        <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Notas (opcional)</label>
        <textarea id="aguinaldo-notes" rows="3"
          class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-600 bg-white text-sm"></textarea>
      </div>
      <div class="flex gap-3 pt-4 border-t border-gray-200">
        <button type="submit" class="flex-1 px-4 py-2 bg-green-600 text-white border border-green-600 hover:bg-green-700 transition-colors uppercase tracking-wider text-xs font-light">
          Guardar
        </button>
        <button type="button" id="cancel-aguinaldo-payment-btn" class="flex-1 px-4 py-2 border border-gray-300 hover:border-red-600 hover:text-red-600 transition-colors uppercase tracking-wider text-xs font-light">
          Cancelar
        </button>
      </div>
    </form>
  `;

  const modal = document.createElement('div');
  modal.id = 'aguinaldo-payment-modal';
  modal.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
  modal.style.overflowY = 'auto';
  modal.innerHTML = `
    <div class="bg-white rounded-lg max-w-2xl w-full border border-gray-200 shadow-lg max-h-[90vh] overflow-y-auto">
      <div class="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200 bg-yellow-600">
        <div class="flex items-center justify-between">
          <h3 class="text-lg sm:text-xl font-semibold tracking-tight text-white">Marcar Aguinaldo como Pagado</h3>
          <button id="close-aguinaldo-payment-form" class="text-white hover:text-gray-200 text-2xl font-light w-8 h-8 flex items-center justify-center hover:bg-white/20 transition-colors">×</button>
        </div>
      </div>
      <div class="p-4 sm:p-6">
        ${formHtml}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Update amount when semester changes
  const semesterSelect = document.getElementById('aguinaldo-semester');
  const amountInput = document.getElementById('aguinaldo-amount');
  let selectedRecordId = null;
  
  if (semesterSelect && amountInput) {
    // Function to load record data when semester is selected
    function loadRecordData() {
      const semester = semesterSelect.value;
      const paidDateInput = document.getElementById('aguinaldo-paid-date');
      const notesInput = document.getElementById('aguinaldo-notes');
      
      if (semester === 'first' && firstSemesterAguinaldoRecord) {
        selectedRecordId = firstSemesterAguinaldoRecord.id;
        if (paidDateInput && firstSemesterAguinaldoRecord.paidDate) {
          paidDateInput.value = new Date(firstSemesterAguinaldoRecord.paidDate).toISOString().split('T')[0];
        }
        if (notesInput && firstSemesterAguinaldoRecord.notes) {
          const notesParts = firstSemesterAguinaldoRecord.notes.split(' | ');
          const customNotes = notesParts.length > 1 ? notesParts.slice(1).join(' | ') : '';
          notesInput.value = customNotes;
        }
      } else if (semester === 'second' && secondSemesterAguinaldoRecord) {
        selectedRecordId = secondSemesterAguinaldoRecord.id;
        if (paidDateInput && secondSemesterAguinaldoRecord.paidDate) {
          paidDateInput.value = new Date(secondSemesterAguinaldoRecord.paidDate).toISOString().split('T')[0];
        }
        if (notesInput && secondSemesterAguinaldoRecord.notes) {
          const notesParts = secondSemesterAguinaldoRecord.notes.split(' | ');
          const customNotes = notesParts.length > 1 ? notesParts.slice(1).join(' | ') : '';
          notesInput.value = customNotes;
        }
      } else {
        selectedRecordId = null;
        if (paidDateInput) paidDateInput.value = '';
        if (notesInput) notesInput.value = '';
      }
    }
    
    // Update amount and record data when semester changes
    semesterSelect.addEventListener('change', () => {
      const semester = semesterSelect.value;
      const selectedIndex = semesterSelect.selectedIndex;
      const selectedOption = selectedIndex >= 0 && selectedIndex < semesterSelect.options.length 
        ? semesterSelect.options[selectedIndex] 
        : null;
      selectedRecordId = selectedOption && selectedOption.dataset ? selectedOption.dataset.recordId || null : null;
      
      if (semester === 'first') {
        amountInput.value = formatCurrency(Math.round(firstSemesterAguinaldo * 100) / 100);
      } else if (semester === 'second') {
        amountInput.value = formatCurrency(Math.round(secondSemesterAguinaldo * 100) / 100);
      } else {
        amountInput.value = '$0,00';
        selectedRecordId = null;
      }
      
      // Load existing record data for the selected semester
      loadRecordData();
    });
    
    // Set initial value if there's only one pending period
    if (hasFirstSemesterPending && !hasSecondSemesterPending) {
      semesterSelect.value = 'first';
      semesterSelect.dispatchEvent(new Event('change'));
    } else if (hasSecondSemesterPending && !hasFirstSemesterPending) {
      semesterSelect.value = 'second';
      semesterSelect.dispatchEvent(new Event('change'));
    }
  }

  // Form submit
  const formElement = document.getElementById('aguinaldo-payment-form-element');
  formElement.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const semester = document.getElementById('aguinaldo-semester').value;
    const paidDateInput = document.getElementById('aguinaldo-paid-date').value;
    const notesInput = document.getElementById('aguinaldo-notes').value.trim();

    if (!semester) {
      await showError('Por favor seleccione el período de aguinaldo');
      return;
    }

    if (!paidDateInput) {
      await showError('Por favor ingrese la fecha de pago');
      return;
    }

    // Validate that payment date is in the month after the semester ends
    const paidDate = new Date(paidDateInput);
    const paidYear = paidDate.getFullYear();
    const paidMonth = paidDate.getMonth() + 1; // getMonth() returns 0-11, so add 1
    
    let isValidPaymentDate = false;
    let expectedPaymentMonth = null;
    let expectedPaymentYear = null;
    
    if (semester === 'first') {
      // 1er semestre: Dic displayYear - May year, se paga en Junio del year
      expectedPaymentMonth = 6; // Junio
      expectedPaymentYear = year;
      isValidPaymentDate = paidYear === expectedPaymentYear && paidMonth === expectedPaymentMonth;
    } else if (semester === 'second') {
      // 2do semestre: Jun year - Nov year, se paga en Diciembre del year
      expectedPaymentMonth = 12; // Diciembre
      expectedPaymentYear = year;
      isValidPaymentDate = paidYear === expectedPaymentYear && paidMonth === expectedPaymentMonth;
    }
    
    if (!isValidPaymentDate) {
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const expectedMonthName = monthNames[expectedPaymentMonth - 1];
      await showError(`El pago del ${semester === 'first' ? '1er' : '2do'} semestre debe realizarse en ${expectedMonthName} ${expectedPaymentYear}`);
      return;
    }

    showSpinner('Guardando...');
    const submitBtn = formElement.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      // Parse date string (YYYY-MM-DD) and create date in local timezone to avoid timezone issues
      const [year, month, day] = paidDateInput.split('-').map(Number);
      const paidDate = new Date(year, month - 1, day).getTime();
      const semesterText = semester === 'first' ? '1er semestre' : '2do semestre';
      const semesterAmount = semester === 'first' ? 
        Math.round(firstSemesterAguinaldo * 100) / 100 : 
        Math.round(secondSemesterAguinaldo * 100) / 100;
      
      // Combine notes
      let notes = `Período: ${semesterText}`;
      if (notesInput) {
        notes += ` | ${notesInput}`;
      }
      
      const aguinaldoRecord = {
        employeeId,
        year,
        amount: semesterAmount,
        paidDate,
        notes,
        updatedAt: Date.now()
      };

      // Get nrd instance dynamically
      const nrd = window.nrd;
      if (!nrd) {
        await showError('Servicio no disponible');
        return;
      }
      
      // Use existing record if editing, otherwise create new
      if (selectedRecordId) {
        const existingRecord = Object.values(aguinaldoData).find(a => a.id === selectedRecordId);
        if (existingRecord && existingRecord.createdAt) {
          aguinaldoRecord.createdAt = existingRecord.createdAt;
        }
        await nrd.aguinaldo.update(selectedRecordId, aguinaldoRecord);
      } else {
        aguinaldoRecord.createdAt = Date.now();
        await nrd.aguinaldo.create(aguinaldoRecord);
      }

      modal.remove();
      
      // Reload data to ensure we have the latest aguinaldo records
      await loadAllData();
      
      // Recalculate payroll items to update summary boxes
      if (typeof window.recalculatePayrollItems === 'function') {
        try {
          await window.recalculatePayrollItems(employeeId, year);
          await loadAllData(); // Reload again after recalculation
        } catch (calcError) {
          logger.warn('Error recalculating payroll items after aguinaldo save (non-blocking)', { employeeId, year, error: calcError });
        }
      }
      
      const successMessage = 'Aguinaldo marcado como pagado exitosamente';
      if (selectedEmployeeId) {
        await showEmployeeDetails(selectedEmployeeId, successMessage);
      } else {
        await loadPayrollItems();
      }
    } catch (error) {
      logger.error('Error saving aguinaldo payment', error);
      await showError('Error al guardar: ' + (error.message || 'Error desconocido'));
    } finally {
      hideSpinner();
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // Close handlers
  document.getElementById('close-aguinaldo-payment-form').addEventListener('click', () => modal.remove());
  document.getElementById('cancel-aguinaldo-payment-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// Initialize payroll items tab
// Recalculate payroll items for a specific year
async function recalculateForYear(year) {
  // Get nrd instance dynamically
  const nrd = window.nrd;
  if (!nrd) {
    logger.error('NRD service not available for recalculation');
    return;
  }
  
  if (typeof window.recalculatePayrollItems !== 'function') {
    logger.debug('recalculatePayrollItems function not available');
    return;
  }
  
  try {
    // Get employees with salaries for this year
    const employeesWithSalaries = Object.values(salariesData)
      .filter(s => s && s.year === year && s.employeeId)
      .map(s => s.employeeId);
    const uniqueEmployeeIds = [...new Set(employeesWithSalaries)];
    
    if (uniqueEmployeeIds.length === 0) {
      logger.debug('No employees with salaries for year', { year });
      return;
    }
    
    logger.debug('Recalculating payroll items for year', { year, employeeCount: uniqueEmployeeIds.length });
    
    // Recalculate for each employee in parallel (but limit concurrency)
    const batchSize = 3; // Process 3 employees at a time to avoid overwhelming
    for (let i = 0; i < uniqueEmployeeIds.length; i += batchSize) {
      const batch = uniqueEmployeeIds.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map(async (employeeId) => {
          try {
            const hasVacation = Object.values(vacationsData).some(v => 
              v && v.employeeId === employeeId && v.year === year
            );
            const hasAguinaldo = Object.values(aguinaldoData).some(a => 
              a && a.employeeId === employeeId && a.year === year
            );
            
            if (!hasVacation || !hasAguinaldo) {
              logger.debug('Recalculating for employee', { employeeId, year });
              await window.recalculatePayrollItems(employeeId, year);
              
              // Reload data after recalculation (with timeout to prevent hanging)
              // nrd is already available from recalculateForYear function scope
              try {
                const [updatedVacations, updatedAguinaldos] = await Promise.all([
                  nrd.vacations.queryByChild('employeeId', employeeId).catch(() => []),
                  nrd.aguinaldo.queryByChild('employeeId', employeeId).catch(() => [])
                ]);
                
                if (Array.isArray(updatedVacations)) {
                  updatedVacations.forEach(v => {
                    if (v && v.year === year && v.id) vacationsData[v.id] = v;
                  });
                }
                if (Array.isArray(updatedAguinaldos)) {
                  updatedAguinaldos.forEach(a => {
                    if (a && a.year === year && a.id) aguinaldoData[a.id] = a;
                  });
                }
              } catch (reloadError) {
                logger.warn('Error reloading data after recalculation', { employeeId, year, error: reloadError });
              }
            }
          } catch (calcError) {
            logger.warn('Error recalculating payroll items', { employeeId, year, error: calcError });
          }
        })
      );
    }
    
    logger.debug('Finished recalculating for year', { year });
  } catch (error) {
    logger.error('Error in recalculateForYear', { year, error });
  }
}

async function initializePayrollItems() {
  const payrollContent = document.getElementById('payroll-items-content');
  if (!payrollContent) {
    console.warn('payroll-items-content element not found');
    return;
  }
  
  try {
    // Load data silently (no loading message)
    try {
      await Promise.race([
        loadAllData(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
      ]);
    } catch (loadError) {
      console.error('Error or timeout loading data:', loadError);
      // Continue anyway with whatever data we have
    }
    
    // Load and display the payroll items (just show the UI, no calculations yet)
    try {
      await loadPayrollItems();
    } catch (loadError) {
      console.error('Error loading payroll items:', loadError);
      payrollContent.innerHTML = `
        <div class="text-center py-12">
          <p class="text-red-500 text-sm mb-2">Error al cargar las partidas salariales</p>
          <p class="text-xs text-gray-500">${loadError?.message || 'Error desconocido'}</p>
        </div>
      `;
      return;
    }
    
    // Don't recalculate automatically - wait for user to select a year
    // Calculations will happen when user clicks a year button
    
  } catch (error) {
    console.error('Error initializing payroll items', error);
    if (payrollContent) {
      payrollContent.innerHTML = `
        <div class="text-center py-12">
          <p class="text-red-500 text-sm mb-2">Error al inicializar las partidas salariales</p>
          <p class="text-xs text-gray-500">${error?.message || 'Error desconocido'}</p>
          <button onclick="window.initializePayrollItems()" class="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
            Reintentar
          </button>
        </div>
      `;
    }
  }
}

// Export functions
export { initializePayrollItems, loadPayrollItems };

// Maintain compatibility with existing code
if (typeof window !== 'undefined') {
  window.initializePayrollItems = initializePayrollItems;
  window.loadPayrollItems = loadPayrollItems;
}
