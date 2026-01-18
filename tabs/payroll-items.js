// Payroll Items Management - Consolidated view
(function() {
'use strict';

// Get nrd instance safely
var nrd = window.nrd;

let payrollItemsListener = null;
let employeesData = {};
let salariesData = {};
let licensesData = {};
let vacationsData = {};
let aguinaldoData = {};
let currentYear = new Date().getFullYear();
let selectedEmployeeId = null;

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Get month name
function getMonthName(month) {
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return months[month - 1] || '';
}

// Check if employee was active (vigente) during a specific year
function isEmployeeActiveInYear(employee, year) {
  if (!employee) return false;
  
  const yearStart = new Date(year, 0, 1); // January 1 of the year
  const yearEnd = new Date(year, 11, 31); // December 31 of the year
  
  // Check startDate: employee must have started before or during the year
  if (employee.startDate) {
    const startDate = new Date(employee.startDate);
    if (startDate > yearEnd) {
      return false; // Employee started after the year ended
    }
  }
  
  // Check endDate: if exists, employee must have ended after or during the year
  if (employee.endDate) {
    const endDate = new Date(employee.endDate);
    if (endDate < yearStart) {
      return false; // Employee ended before the year started
    }
  }
  
  // Employee was active during the year
  return true;
}

// Helper functions for decimal number handling with comma
function parseDecimalWithComma(value) {
  if (!value || value === '') return null;
  // Replace comma with dot for parsing
  const normalized = String(value).replace(',', '.');
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? null : parsed;
}

function formatDecimalWithComma(value) {
  if (value === null || value === undefined || isNaN(value)) return '';
  // Convert to string and replace dot with comma
  return String(value).replace('.', ',');
}

// Format number with comma for decimals and dot for thousands
function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return '0,00';
  const num = parseFloat(value);
  if (isNaN(num)) return '0,00';
  
  // Split into integer and decimal parts
  const parts = num.toFixed(decimals).split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1] || '';
  
  // Add thousand separators (dots) to integer part
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  // Return with comma for decimal separator
  return decimals > 0 ? `${formattedInteger},${decimalPart}` : formattedInteger;
}

// Format currency with $ symbol
function formatCurrency(value, decimals = 2) {
  return `$${formatNumber(value, decimals)}`;
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
function calculateEmployeeSummary(employeeId) {
  const displayYear = currentYear - 1; // Show data from previous year
  
  const yearSalaries = Object.values(salariesData).filter(s => 
    s.employeeId === employeeId && s.year === displayYear
  );
  
  // Get licenses from displayYear (the year we're showing data for)
  const yearLicenses = Object.values(licensesData).filter(l => 
    l.employeeId === employeeId && l.year === displayYear
  );
  
  // Get vacation record for this year (may contain vacation salary or license not taken)
  const vacation = Object.values(vacationsData).find(v => 
    v.employeeId === employeeId && v.year === displayYear
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
  
  // 1er semestre: December of display year + January to May of current year
  const displayYearDecSalaries = allEmployeeSalaries.filter(s => 
    s.year === displayYear && s.month === 12
  );
  const currentYearSalaries = Object.values(salariesData).filter(s => 
    s.employeeId === employeeId && s.year === currentYear
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
  // Formula: totalHaberesGravadosDelSemestre / 12
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
  // Formula: totalHaberesGravadosDelSemestre / 12
  let secondSemesterAguinaldo = 0;
  if (secondSemesterSalaries.length > 0) {
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
      // Example: viewing 2025, calculate for 2024 (based on years worked until Dec 31, 2023)
      let daysAccumulated = 0;
      try {
        // employee already declared above (line 216)
        if (employee && employee.startDate) {
          const start = new Date(employee.startDate);
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
          if (start <= yearEnd) {
            // If employee started before or during the year, calculate months worked
            const actualStart = start > yearStart ? start : yearStart;
            const actualEnd = yearEnd;
            
            // If employee started before the year, they worked the full year (12 months)
            if (start < yearStart) {
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
          if (start >= yearStart && start <= yearEnd) {
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
            } else if (monthsWorkedInYear > 0) {
              // Employee didn't work the full year: calculate proportionally
              // Legal: 1.66 days per month, use Math.floor()
              daysAccumulated = Math.floor(monthsWorkedInYear * 1.66);
              console.log('Employee started during displayYear - proportional calculation', {
                employeeId,
                displayYear,
                monthsWorkedInYear,
                daysAccumulated,
                startDate: employee.startDate,
                yearStart: yearStart.toISOString(),
                yearEnd: yearEnd.toISOString()
              });
            } else {
              daysAccumulated = 0;
              console.log('Employee started during displayYear but monthsWorkedInYear is 0', {
                employeeId,
                displayYear,
                startDate: employee.startDate
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
            } else if (monthsWorkedInYear > 0) {
              // Employee didn't work the full year: calculate proportionally
              // Legal: 1.66 days per month, use Math.floor() NOT Math.ceil()
              // This applies when employee already has years worked but didn't complete the full displayYear
              daysAccumulated = Math.floor(monthsWorkedInYear * 1.66);
              
              console.log('Employee started before displayYear but worked partial year - proportional calculation', {
                employeeId,
                displayYear,
                monthsWorkedInYear,
                daysAccumulated,
                startDate: employee.startDate
              });
            } else {
              // Employee didn't work during displayYear
              daysAccumulated = 0;
              
              console.log('Employee started before displayYear but didn\'t work during displayYear', {
                employeeId,
                displayYear,
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
      // Legal: Use proportional calculation: 1.66 days per month, use Math.floor()
      // Use months worked in displayYear
      const displayYearSalaries = Object.values(salariesData).filter(s => 
        s.employeeId === employeeId && s.year === displayYear
      );
      const monthsWorkedFallback = displayYearSalaries.length;
      daysAccumulated = Math.floor(monthsWorkedFallback * 1.66);
      
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
    daysAccumulated = Math.floor(monthsWorkedFallback * 1.66);
    
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
  
  // Also get days taken from currentYear for display purposes
  const currentYearLicenses = Object.values(licensesData).filter(l => 
    l.employeeId === employeeId && l.year === currentYear
  );
  const daysTakenCurrentYear = currentYearLicenses.reduce((sum, license) => sum + (license.daysTaken || 0), 0);
  
  // Calculate unused vacation days (saldo)
  // Subtract days taken from both displayYear and currentYear to get the actual balance
  // The balance should reflect days accumulated minus all days taken (from both years)
  const daysRemaining = Math.max(0, daysAccumulated - daysTakenDisplayYear - daysTakenCurrentYear);
  
  // Get salaries for currentYear to calculate jornal for vacation salary
  // These are calculated based on current year salaries, not displayYear
  const currentYearSalariesForCalculation = allEmployeeSalaries
    .filter(s => s.year === currentYear)
    .sort((a, b) => (b.month || 0) - (a.month || 0));
  
  // Calculate average daily wage from currentYear salaries (including extras)
  // This matches the calculation method for license not taken
  let averageDailyWageCurrentYear = 0;
  if (currentYearSalariesForCalculation.length > 0) {
    const totalHaberesCurrentYear = currentYearSalariesForCalculation.reduce((sum, s) => {
      const base = parseFloat(s.baseSalary30Days) || 0;
      const extras = parseFloat(s.extras) || 0;
      return sum + (base + extras);
    }, 0);
    const avgMonthlyCurrentYear = totalHaberesCurrentYear / currentYearSalariesForCalculation.length;
    averageDailyWageCurrentYear = avgMonthlyCurrentYear / 30;
  }
  
  // Also try to get direct dailyWage from last salary (fallback)
  const lastSalaryWithJornal = currentYearSalariesForCalculation.find(s => s.dailyWage && s.dailyWage > 0);
  const lastJornal = lastSalaryWithJornal ? parseFloat(lastSalaryWithJornal.dailyWage) : 0;
  
  // Use average daily wage (with extras) if available, otherwise use direct jornal
  const dailyWageForVacationSalary = averageDailyWageCurrentYear > 0 ? averageDailyWageCurrentYear : lastJornal;
  
  // Legal: Licencia No Gozada y Salario Vacacional son conceptos diferentes
  // - Licencia No Gozada: Solo se calcula al egreso (usar promedio últimos 12 meses)
  // - Salario Vacacional: Solo se calcula cuando se goza la licencia
  
  // hasEndDate already declared above (line 217)
  
  let licenseNotTakenSalary = 0;
  let vacationSalary = 0;
  
  // vacation already declared above (line 211)
  
  // Calculate license not taken (informative for all employees with remaining days)
  // This shows what the license not taken would be if the employee terminates
  // IMPORTANT: Only calculate if there are salaries in the current year
  // If no salaries exist for the current year, show $0,00
  const hasCurrentYearSalaries = allEmployeeSalaries.some(s => s && s.year === currentYear);
  
  if (daysRemaining > 0 && hasCurrentYearSalaries) {
    // Use average of last 12 months salaries (from current year and previous)
    const sortedSalaries = allEmployeeSalaries
      .filter(s => s && s.year && s.month)
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      })
      .slice(0, 12); // Last 12 months
    
    if (sortedSalaries.length > 0) {
      const totalHaberes = sortedSalaries.reduce((sum, salary) => {
        const base = parseFloat(salary.baseSalary30Days) || 0;
        const extras = parseFloat(salary.extras) || 0;
        return sum + (base + extras);
      }, 0);
      const avgMonthlySalary = totalHaberes / sortedSalaries.length;
      const averageDailyWage = avgMonthlySalary / 30;
      licenseNotTakenSalary = daysRemaining * averageDailyWage;
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
  
  // Calculate vacation salary (for active employees)
  // Both license not taken and vacation salary are based on daysRemaining (saldo de días)
  if (!hasEndDate) {
    // Employee is active - calculate vacation salary based on saldo de días
    if (vacation && !vacation.isLicenseNotTaken && vacation.year === displayYear) {
      // Use amount from vacation record if available for displayYear
      vacationSalary = parseFloat(vacation.amount) || 0;
    } else if (daysRemaining > 0 && dailyWageForVacationSalary > 0) {
      // Calculate vacation salary based on saldo de días (remaining days)
      // Use average daily wage (including extras) to match license not taken calculation
      // This shows what the vacation salary would be based on the remaining days
      vacationSalary = daysRemaining * dailyWageForVacationSalary;
    }
  }
  
  // TODO: Implementar cálculo de licencia no gozada solo en egreso
  // TODO: Implementar cálculo de salario vacacional solo cuando se goza licencia
  
  // Calculate total extras
  const totalExtras = yearSalaries.reduce((sum, salary) => sum + (salary.extras || 0), 0);
  
  return {
    daysAccumulated, // Keep as number for calculations
    daysTaken: daysTakenDisplayYear, // Days taken only from displayYear (legal: imputa al año que se genera)
    daysTakenCurrentYear, // Days taken from currentYear for display
    daysRemaining, // Keep as number for calculations
    vacationSalary: Math.round(vacationSalary * 100) / 100, // Round to 2 decimals
    licenseNotTakenSalary: Math.round(licenseNotTakenSalary * 100) / 100, // Round to 2 decimals
    firstSemesterAguinaldo: Math.round(firstSemesterAguinaldo * 100) / 100,
    secondSemesterAguinaldo: Math.round(secondSemesterAguinaldo * 100) / 100,
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

    // Add header
    const header = document.createElement('div');
    header.className = 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0 mb-4';
    header.innerHTML = `
      <div class="flex flex-wrap gap-2 w-full sm:w-auto">
        ${(() => {
          const today = new Date();
          const currentYearValue = today.getFullYear();
          const startYear = Math.max(2021, currentYearValue - 5);
          const years = [];
          for (let year = startYear; year <= currentYearValue; year++) {
            years.push(year);
          }
          return years.map(year => 
            `<button class="year-btn px-3 py-1.5 text-sm border rounded transition-colors ${
              year === currentYear 
                ? 'bg-red-600 text-white border-red-600 font-medium' 
                : 'bg-white text-gray-700 border-gray-300 hover:border-red-600 hover:text-red-600'
            }" data-year="${year}">${year}</button>`
          ).join('');
        })()}
      </div>
    `;
    payrollContent.appendChild(header);

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
    const activeEmployees = employees.filter(employee => 
      isEmployeeActiveInYear(employee, currentYear)
    );
    
    if (activeEmployees.length === 0) {
      cardsContainer.innerHTML = `
        <div class="col-span-full text-center py-12 border border-gray-200 rounded-lg p-8">
          <p class="text-gray-600 mb-2">No hay empleados vigentes en ${currentYear}</p>
          <p class="text-xs text-gray-500">Los empleados deben haber estado activos durante el año seleccionado</p>
        </div>
      `;
      payrollContent.appendChild(cardsContainer);
      return;
    }
    
    activeEmployees.forEach(employee => {
      const summary = calculateEmployeeSummary(employee.id);
      const totalSummary = calculateEmployeeTotalSummary(employee.id);
      
      const card = document.createElement('div');
      card.className = 'border border-gray-200 rounded-lg p-3 cursor-pointer hover:border-red-600 hover:shadow-md transition-all';
      card.dataset.employeeId = employee.id;
      
      const displayYear = summary.displayYear || (currentYear - 1);
      
      card.innerHTML = `
        <div class="mb-2 -m-3 px-3 py-2 mb-2 bg-red-600 text-white rounded-t-lg">
          <h3 class="text-base font-medium">${escapeHtml(employee.name)}</h3>
          <p class="text-xs text-red-100">${currentYear}</p>
        </div>
        
        <div class="space-y-1.5 text-xs">
          <div class="flex justify-between items-center py-1 border-b border-gray-100">
            <span class="text-gray-600">Días Acumulados:</span>
            <span class="font-medium">${formatNumber(summary.daysAccumulated, 2)}</span>
          </div>
          
          <div class="flex justify-between items-center py-1 border-b border-gray-100">
            <span class="text-gray-600">Licencia No Gozada:</span>
            <span class="font-medium text-green-600">${formatCurrency(summary.licenseNotTakenSalary || 0)}</span>
          </div>
          
          <div class="flex justify-between items-center py-1 border-b border-gray-100">
            <span class="text-gray-600">Salario Vacacional:</span>
            <span class="font-medium text-red-600">${formatCurrency(summary.vacationSalary)}</span>
          </div>
          
          <div class="flex justify-between items-center py-1 border-b border-gray-100">
            <span class="text-gray-600">Aguinaldo 12/${displayYear} - 05/${currentYear}:</span>
            <span class="font-medium text-red-600">${formatCurrency(summary.firstSemesterAguinaldo || 0)}</span>
          </div>
          
          <div class="flex justify-between items-center py-1">
            <span class="text-gray-600">Aguinaldo 06/${currentYear} - 11/${currentYear}:</span>
            <span class="font-medium text-red-600">${formatCurrency(summary.secondSemesterAguinaldo || 0)}</span>
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

// Show employee details
async function showEmployeeDetails(employeeId, successMessage = null) {
  // Remove any existing employee details modal first
  const existingModal = document.getElementById('employee-details-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  selectedEmployeeId = employeeId;
  await loadAllData();
  
  const employee = employeesData[employeeId];
  if (!employee) return;
  
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
  
  // Calculate summary with fresh data
  const summary = calculateEmployeeSummary(employeeId);
  // The displayYear is the year of the data being shown in the cards
  // When viewing year 2026, cards show data from 2025, so displayYear = 2025
  const displayYear = currentYear - 1;
  // recordsYear is the year for actual records (salaries and licenses)
  // When viewing year 2026, show records from 2026
  const recordsYear = currentYear;
  
  // Create details modal
  const modal = document.createElement('div');
  modal.id = 'employee-details-modal';
  modal.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
  modal.style.overflowY = 'auto';
  modal.style.scrollbarWidth = 'none'; // Firefox
  modal.style.msOverflowStyle = 'none'; // IE/Edge
  modal.innerHTML = `
    <style>
      #employee-details-modal::-webkit-scrollbar {
        display: none;
        width: 0;
        height: 0;
      }
      #employee-details-modal > div::-webkit-scrollbar {
        display: none;
        width: 0;
        height: 0;
      }
    </style>
    <div class="bg-white rounded-lg max-w-4xl w-full border border-gray-200 shadow-lg max-h-[90vh] overflow-y-auto my-4" 
      style="scrollbar-width: none; -ms-overflow-style: none; -webkit-overflow-scrolling: touch;">
      <div class="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200 bg-red-600">
        <div class="flex items-center justify-between">
          <h3 class="text-lg sm:text-xl font-semibold tracking-tight text-white">${escapeHtml(employee.name)} - ${recordsYear}</h3>
          <button id="close-employee-details" class="text-white hover:text-gray-200 text-2xl font-light w-8 h-8 flex items-center justify-center hover:bg-white/20 transition-colors">×</button>
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
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div class="bg-gray-50 p-3 rounded border border-gray-200">
            <div class="text-xs text-gray-600 mb-2 font-medium">Día de Licencia</div>
            <div class="space-y-1.5">
              <div class="flex justify-between items-center">
                <span class="text-xs text-gray-500">Días Acumulados:</span>
                <span class="text-sm font-medium">${formatNumber(summary.daysAccumulated, 2)}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-xs text-gray-500">Días Gozados:</span>
                <span class="text-sm font-medium">${formatNumber(summary.daysTakenCurrentYear || 0, 2)}</span>
              </div>
              <div class="flex justify-between items-center pt-1 border-t border-gray-200">
                <span class="text-xs text-gray-500">Saldo de Días ${currentYear}:</span>
                <span class="text-sm font-medium">${formatNumber(Math.max(0, (summary.daysAccumulated || 0) - (summary.daysTakenCurrentYear || 0)), 2)}</span>
              </div>
            </div>
          </div>
          <div class="bg-green-50 p-3 rounded border border-green-200">
            <div class="text-xs text-gray-600 mb-1">Licencia No Gozada:</div>
            <div class="text-lg font-medium text-green-600">${formatCurrency(summary.licenseNotTakenSalary || 0)}</div>
          </div>
          <div class="bg-red-50 p-3 rounded border border-red-200">
            <div class="text-xs text-gray-600 mb-1">Salario Vacacional:</div>
            <div class="text-lg font-medium text-red-600">${formatCurrency(summary.vacationSalary)}</div>
          </div>
          <div class="bg-yellow-50 p-3 rounded border border-yellow-200">
            <div class="text-xs text-gray-600 mb-1.5">Aguinaldo 12/${displayYear} - 05/${currentYear}:</div>
            <div class="text-sm font-medium text-yellow-600 mb-2">${formatCurrency(summary.firstSemesterAguinaldo || 0)}</div>
            <div class="text-xs text-gray-600 mb-1.5">Aguinaldo 06/${currentYear} - 11/${currentYear}:</div>
            <div class="text-sm font-medium text-yellow-600">${formatCurrency(summary.secondSemesterAguinaldo || 0)}</div>
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
              
              return yearSalaries.sort((a, b) => (a.month || 0) - (b.month || 0)).map(salary => `
                <div class="border border-gray-200 rounded p-3 flex justify-between items-center">
                  <div>
                    <div class="text-sm font-medium">${getMonthName(salary.month)} ${salary.year}</div>
                    <div class="text-xs text-gray-600">
                      ${salary.type === 'daily' ? 
                        `Jornal: ${formatCurrency(salary.dailyWage || 0)}` : 
                        `Mensual: ${formatCurrency(salary.monthlySalary || 0)}`}
                    </div>
                    <div class="text-xs text-gray-500">
                      Base 30 días: ${formatCurrency(salary.baseSalary30Days || 0)}
                      ${salary.extras ? ` | Extras: ${formatCurrency(salary.extras)}` : ''}
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
              `).join('');
            })()}
          </div>
        </div>
        
        <!-- Licenses Section -->
        <div>
          <div class="flex justify-between items-center mb-3">
            <h4 class="text-base font-light text-gray-800">Días de Licencia Tomados ${recordsYear}</h4>
            <button id="add-license-btn" class="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
              + Agregar Licencia
            </button>
          </div>
          <div id="licenses-list" class="space-y-2">
            ${(() => {
              // Get all licenses for this employee in recordsYear (the year being viewed)
              const allEmployeeLicenses = Object.values(licensesData).filter(l => 
                l.employeeId === employeeId
              );
              const yearLicenses = allEmployeeLicenses.filter(l => l.year === recordsYear);
              
              if (yearLicenses.length === 0) {
                return `<p class="text-sm text-gray-500 text-center py-4">No hay licencias registradas para ${recordsYear}</p>`;
              }
              
              return yearLicenses.map(license => `
                <div class="border border-gray-200 rounded p-3 flex justify-between items-center">
                  <div>
                    <div class="text-sm font-medium">
                      ${license.month ? `${getMonthName(license.month)} ` : ''}${license.year}
                    </div>
                    <div class="text-xs text-gray-600">
                      Días tomados: ${license.daysTaken || 0}
                    </div>
                    ${license.startDate ? `
                      <div class="text-xs text-gray-500">
                        ${new Date(license.startDate).toLocaleDateString('es-ES')} - 
                        ${license.endDate ? new Date(license.endDate).toLocaleDateString('es-ES') : ''}
                      </div>
                    ` : ''}
                  </div>
                  <div class="flex gap-2">
                    <button class="edit-license-btn px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors" 
                      data-license-id="${license.id}">
                      Editar
                    </button>
                    <button class="delete-license-btn px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors" 
                      data-license-id="${license.id}">
                      Eliminar
                    </button>
                  </div>
                </div>
              `).join('');
            })()}
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
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
    
    // Close handler
    const closeBtn = document.getElementById('close-employee-details');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (modal && modal.parentNode) {
          modal.remove();
          selectedEmployeeId = null;
        }
      });
    }
    
    // Prevent modal content clicks from closing the modal
    const modalContent = modal.querySelector('div > div');
    if (modalContent) {
      modalContent.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
  }, 0);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      if (modal && modal.parentNode) {
        modal.remove();
        selectedEmployeeId = null;
      }
    }
  });
  
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
}

// Show salary form (simplified version)
async function showSalaryForm(salaryId = null, employeeId = null) {
  // Remove any existing salary form modal first
  const existingModal = document.getElementById('salary-form-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  await loadAllData();
  
  const monthOptions = Array.from({length: 12}, (_, i) => {
    const m = i + 1;
    return `<option value="${m}">${getMonthName(m)}</option>`;
  }).join('');

  const formHtml = `
    <form id="salary-form-element" class="space-y-4">
      <input type="hidden" id="salary-id" value="${salaryId || ''}">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Año</label>
          <input type="number" id="salary-year" min="2020" max="2100" required 
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-600 bg-white text-sm"
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
      const salaryData = {
        employeeId,
        year,
        month,
        type,
        baseSalary30Days
      };

      if (type === 'daily') {
        salaryData.dailyWage = parseDecimalWithComma(dailyWageValue);
      } else {
        salaryData.monthlySalary = parseDecimalWithComma(monthlySalaryValue);
      }

      if (extras !== undefined) {
        salaryData.extras = extras;
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
        <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Días Tomados</label>
        <input type="text" id="license-days-taken" inputmode="decimal" required 
          class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-600 bg-white text-sm"
          placeholder="0,0">
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
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// Initialize payroll items tab
// Recalculate payroll items for a specific year
async function recalculateForYear(year) {
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

// Expose functions to global scope
window.initializePayrollItems = initializePayrollItems;
window.loadPayrollItems = loadPayrollItems;

})(); // End of IIFE
