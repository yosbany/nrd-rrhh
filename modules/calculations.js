// Payroll calculation utilities (ES Module)
// This module contains functions to automatically calculate:
// - Unused vacation days (licencia no gozada)
// - Vacation salary (salario vacacional)
// - Aguinaldo (Christmas bonus)

// Using NRDCommon from CDN (loaded in index.html)
const logger = window.logger || console;

// Get nrd instance (initialized in index.html)
const nrd = window.nrd;

// Helper to safely get service
function getService(serviceName) {
  if (!nrd) {
    logger.warn(`NRD instance not available`, { serviceName });
    return null;
  }
  const service = nrd[serviceName];
  if (!service) {
    logger.warn(`NRD service ${serviceName} not available`, { availableServices: Object.keys(nrd || {}) });
    return null;
  }
  return service;
}

// Constants for calculations
const VACATION_DAYS_PER_MONTH = 1.25; // ~20 days per year / 12 months (fallback, old method)
const VACATION_DAYS_PER_MONTH_PROPORTIONAL = 1.66; // Days per month when employee hasn't worked full year
const AGUINALDO_MONTHS = 1; // 1 month of salary per year (can be adjusted)

/**
 * Calculate vacation days per year based on years of service
 * Legal rules (Uruguay):
 * - Base: 20 days per year
 * - Increment: +1 day every 4 years of service
 * - Formula: 20 + Math.floor((yearsWorked - 1) / 4)
 * 
 * Examples:
 * - Years 1-4: 20 days
 * - Year 5: 21 days (20 + Math.floor((5-1)/4) = 21)
 * - Year 9: 22 days (20 + Math.floor((9-1)/4) = 22)
 * - Year 13: 23 days (20 + Math.floor((13-1)/4) = 23)
 * 
 * @param {number} yearsWorked - Complete years worked
 * @returns {number} - Days generated per year
 */
function calculateVacationDaysPerYear(yearsWorked) {
  if (yearsWorked <= 0) {
    return 0;
  }
  
  // Legal formula: 20 + Math.floor((yearsWorked - 1) / 4)
  return 20 + Math.floor((yearsWorked - 1) / 4);
}

/**
 * Calculate unused vacation days for an employee in a given year
 * Formula: Days per year based on years of service (from startDate) - days taken
 * Days per year: Years 1-4: 20, Year 5: 21, then +1 every 4 years
 */
async function calculateUnusedVacationDays(employeeId, year) {
  try {
    // Get employee data to access startDate
    const employeesService = getService('employees');
    if (!employeesService) {
      logger.warn('NRD employees service not available', { employeeId });
      return {
        monthsWorked: 0,
        daysAccumulated: 0,
        daysTaken: 0,
        daysRemaining: 0
      };
    }
    const employee = await employeesService.getById(employeeId);
    if (!employee) {
      logger.warn('Employee not found for vacation calculation', { employeeId });
      return {
        monthsWorked: 0,
        daysAccumulated: 0,
        daysTaken: 0,
        daysRemaining: 0
      };
    }

    // Get start date
    const startDate = employee.startDate;
    if (!startDate) {
      logger.warn('Employee has no start date', { employeeId });
      // Fallback to old calculation method if no start date
      let monthsWorked = 0;
      let daysTaken = 0;
      
      try {
        const salariesService = getService('salaries');
        if (!salariesService) {
          monthsWorked = 0;
        } else {
          const salaries = await salariesService.queryByChild('employeeId', employeeId);
          const yearSalaries = salaries && Array.isArray(salaries) 
            ? salaries.filter(s => s && s && s.year === year)
            : [];
          monthsWorked = yearSalaries.length;
        }
      } catch (salaryError) {
        logger.warn('Error getting salaries for fallback calculation', { 
          employeeId, 
          year, 
          error: salaryError?.message || String(salaryError),
          errorType: salaryError?.constructor?.name
        });
        monthsWorked = 0;
      }
      
      try {
        const licensesService = getService('licenses');
        if (!licensesService) {
          daysTaken = 0;
        } else {
          const licenses = await licensesService.queryByChild('employeeId', employeeId);
          const yearLicenses = licenses && Array.isArray(licenses)
            ? licenses.filter(l => l && l.year === year)
            : [];
          daysTaken = yearLicenses.reduce((sum, license) => {
            const days = parseFloat(license.daysTaken) || 0;
            return sum + days;
          }, 0);
        }
      } catch (licenseError) {
        logger.warn('Error getting licenses for fallback calculation', { 
          employeeId, 
          year, 
          error: licenseError?.message || String(licenseError),
          errorType: licenseError?.constructor?.name
        });
        daysTaken = 0;
      }
      
      // Use proportional calculation: 1.66 days per month
      // Calculate by days worked, then round up if fraction
      const daysPerDay = VACATION_DAYS_PER_MONTH_PROPORTIONAL / 30; // 1.66 / 30 = 0.0553
      // Estimate: assume monthsWorked represents full months (fallback calculation)
      const totalDaysAccumulated = monthsWorked * VACATION_DAYS_PER_MONTH_PROPORTIONAL;
      // Round up if there's a fraction
      const daysAccumulated = Math.ceil(totalDaysAccumulated);
      const daysRemaining = Math.max(0, daysAccumulated - daysTaken);
      
      return {
        monthsWorked,
        daysAccumulated,
        daysTaken,
        daysRemaining
      };
    }

    const start = new Date(startDate);
    // For year X, calculate based on years worked until end of year X-1
    // Example: For 2026, use years worked until Dec 31, 2025
    const previousYear = year - 1;
    const previousYearEnd = new Date(previousYear, 11, 31); // December 31 of the previous year
    const yearStart = new Date(year, 0, 1); // January 1 of the year
    const yearEnd = new Date(year, 11, 31); // December 31 of the year
    
    // Calculate months worked in the current year
    let monthsWorkedInYear = 0;
    if (start <= yearEnd) {
      const actualStart = start > yearStart ? start : yearStart;
      const actualEnd = yearEnd;
      
      // Calculate months difference: count from start month to end month (inclusive)
      let monthsDiff = (actualEnd.getFullYear() - actualStart.getFullYear()) * 12;
      monthsDiff += actualEnd.getMonth() - actualStart.getMonth();
      
      // Always add 1 to include both start and end months
      // This counts the month as worked if the employee worked any part of it
      monthsDiff++;
      
      monthsWorkedInYear = Math.max(0, monthsDiff);
    }
    
    // Check if employee worked the full year (12 months)
    const workedFullYear = monthsWorkedInYear >= 12;
    
    // Check if employee started during this year (not before)
    const startedDuringYear = start >= yearStart && start <= yearEnd;
    
    // Also check if employee worked any days in this year (even if monthsWorkedInYear is 0 due to calculation issues)
    const actualStart = start > yearStart ? start : yearStart;
    const actualEnd = yearEnd;
    const daysWorkedInYear = start <= yearEnd ? Math.floor((actualEnd - actualStart) / (1000 * 60 * 60 * 24)) + 1 : 0;
    
    let daysAccumulated = 0;
    
    // If employee started during the year OR didn't work full year, calculate proportionally
    // Also handle case where monthsWorkedInYear might be 0 but employee actually worked days
    if (startedDuringYear || (!workedFullYear && (monthsWorkedInYear > 0 || daysWorkedInYear > 0))) {
      // Employee started during the year or didn't work the full year: calculate proportionally by days worked
      // Legal: 1.66 days per month = 0.0553 days per day (1.66/30)
      
      let totalDaysAccumulated = 0;
      const daysPerDay = VACATION_DAYS_PER_MONTH_PROPORTIONAL / 30; // 1.66 / 30 = 0.0553
      
      // Use the calculated daysWorkedInYear
      const totalDaysWorked = daysWorkedInYear;
      
      // Only calculate if there are days worked
      if (totalDaysWorked > 0) {
        // Calculate accumulated days: days worked * days per day
        totalDaysAccumulated = totalDaysWorked * daysPerDay;
        
        // Round up if there's a fraction (if decimal part > 0, round up)
        daysAccumulated = Math.ceil(totalDaysAccumulated);
        
        logger.debug('Calculated proportional vacation days', {
          employeeId,
          year,
          startDate: startDate,
          startedDuringYear,
          monthsWorkedInYear,
          daysWorkedInYear: totalDaysWorked,
          daysPerDay,
          totalDaysAccumulated,
          daysAccumulated
        });
      } else {
        logger.warn('Employee started during year but daysWorkedInYear is 0', {
          employeeId,
          year,
          startDate: startDate,
          start: start.toISOString(),
          yearStart: yearStart.toISOString(),
          yearEnd: yearEnd.toISOString(),
          actualStart: actualStart.toISOString(),
          actualEnd: actualEnd.toISOString()
        });
      }
    } else if (workedFullYear) {
      // Employee worked the full year: calculate based on years of service
      // Calculate complete years worked up to the end of the PREVIOUS year
      // For year 2026, calculate years worked until Dec 31, 2025
      let yearsWorked = previousYearEnd.getFullYear() - start.getFullYear();
      
      // Adjust if the employee hasn't completed a full year yet
      const monthDiff = previousYearEnd.getMonth() - start.getMonth();
      const dayDiff = previousYearEnd.getDate() - start.getDate();
      
      if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
        yearsWorked--;
      }
      
      // Ensure at least 0 years
      yearsWorked = Math.max(0, yearsWorked);
      
      // Calculate days per year based on years of service
      const daysPerYear = calculateVacationDaysPerYear(yearsWorked);
      daysAccumulated = daysPerYear;
      
      logger.debug('Calculated full year vacation days', {
        employeeId,
        year,
        startDate: startDate,
        yearsWorked,
        daysPerYear,
        daysAccumulated
      });
    } else {
      // Employee didn't work during this year at all
      logger.debug('Employee did not work during this year', {
        employeeId,
        year,
        startDate: startDate,
        start: start.toISOString(),
        yearStart: yearStart.toISOString(),
        yearEnd: yearEnd.toISOString(),
        monthsWorkedInYear,
        daysWorkedInYear
      });
    }
    // If neither condition is met, daysAccumulated remains 0
    
    // Get licenses (days taken) for the employee in THIS YEAR ONLY
    // Legal rule: Licencia se imputa al año en que se genera
    // Solo descontar días gozados con cargo a ese año
    // NO descontar licencias de años futuros
    let daysTaken = 0;
    try {
      const licensesService = getService('licenses');
      if (!licensesService) {
        daysTaken = 0;
      } else {
        const licenses = await licensesService.queryByChild('employeeId', employeeId);
        const yearLicenses = licenses && Array.isArray(licenses)
          ? licenses.filter(l => l && l.year === year) // ONLY days taken in this year
          : [];
        
        // Sum days taken ONLY from this year
        daysTaken = yearLicenses.reduce((sum, license) => {
          const days = parseFloat(license.daysTaken) || 0;
          return sum + days;
        }, 0);
      }
    } catch (licenseError) {
      logger.warn('Error getting licenses for vacation calculation', { 
        employeeId, 
        year, 
        error: licenseError?.message || String(licenseError),
        errorType: licenseError?.constructor?.name
      });
      daysTaken = 0;
    }
    
    // Calculate remaining days (only subtract days taken from this year)
    const daysRemaining = Math.max(0, daysAccumulated - daysTaken);
    
    // Get months worked for reference (from salaries)
    let monthsWorked = 0;
    try {
      const salariesService = getService('salaries');
      if (salariesService) {
        const salaries = await salariesService.queryByChild('employeeId', employeeId);
        const yearSalaries = salaries && Array.isArray(salaries)
          ? salaries.filter(s => s && s.year === year)
          : [];
        monthsWorked = yearSalaries.length;
      } else {
        // Use the monthsWorkedInYear calculated earlier if available
        monthsWorked = monthsWorkedInYear || 0;
      }
    } catch (salaryError) {
      logger.warn('Error getting salaries for months worked calculation', { 
        employeeId, 
        year, 
        error: salaryError?.message || String(salaryError)
      });
      // Use the monthsWorkedInYear calculated earlier if available
      monthsWorked = monthsWorkedInYear || 0;
    }
    
    return {
      monthsWorked,
      daysAccumulated,
      daysTaken,
      daysRemaining: Math.max(0, daysRemaining) // Don't allow negative
    };
  } catch (error) {
    logger.error('Error calculating unused vacation days', error);
    return {
      monthsWorked: 0,
      daysAccumulated: 0,
      daysTaken: 0,
      daysRemaining: 0
    };
  }
}

/**
 * Calculate average monthly salary for an employee in a given year
 * Uses total monthly salary (baseSalary30Days + extras)
 */
async function calculateAverageMonthlySalary(employeeId, year) {
  try {
    if (!employeeId || !year) {
      logger.warn('Invalid parameters for calculateAverageMonthlySalary', { employeeId, year });
      return 0;
    }
    
    let salaries = null;
    try {
      const salariesService = getService('salaries');
      if (!salariesService) {
        return 0;
      }
      salaries = await salariesService.queryByChild('employeeId', employeeId);
    } catch (queryError) {
      logger.warn('Error querying salaries for average calculation', { 
        employeeId, 
        year, 
        error: queryError?.message || String(queryError),
        errorType: queryError?.constructor?.name
      });
      return 0;
    }
    
    if (!salaries || !Array.isArray(salaries)) {
      logger.warn('No salaries found or invalid format', { employeeId, year });
      return 0;
    }
    
    const yearSalaries = salaries.filter(s => s && s.year === year);
    
    if (yearSalaries.length === 0) {
      return 0;
    }
    
    // Calculate average of total monthly salary (baseSalary30Days + extras)
    const totalSalary = yearSalaries.reduce((sum, salary) => {
      if (!salary) return sum;
      const base = parseFloat(salary.baseSalary30Days) || 0;
      const extras = parseFloat(salary.extras) || 0;
      return sum + (base + extras);
    }, 0);
    
    if (yearSalaries.length === 0) {
      return 0;
    }
    
    return totalSalary / yearSalaries.length;
  } catch (error) {
    logger.error('Error calculating average monthly salary', { employeeId, year, error });
    return 0;
  }
}

/**
 * Calculate vacation salary (salario vacacional) for an employee
 * Legal: Solo se calcula cuando la licencia se goza
 * Formula: daily wage * days being taken
 * 
 * @param {string} employeeId - Employee ID
 * @param {number} year - Year
 * @param {number} daysGozados - Days being taken (gozados) in this period
 * @returns {Promise<Object>} Vacation salary data
 */
async function calculateVacationSalary(employeeId, year, daysGozados = null) {
  try {
    const vacationData = await calculateUnusedVacationDays(employeeId, year);
    const avgMonthlySalary = await calculateAverageMonthlySalary(employeeId, year);
    
    if (avgMonthlySalary === 0) {
      return {
        amount: 0,
        ...vacationData
      };
    }
    
    // Calculate daily wage
    const dailyWage = avgMonthlySalary / 30;
    
    // If daysGozados is specified, use that (for when license is being taken)
    // Otherwise, use remaining days (legacy behavior)
    const daysToCalculate = daysGozados !== null ? daysGozados : vacationData.daysRemaining;
    
    if (daysToCalculate === 0) {
      return {
        amount: 0,
        ...vacationData
      };
    }
    
    // Vacation salary = daily wage * days being taken
    const amount = dailyWage * daysToCalculate;
    
    return {
      amount: Math.round(amount * 100) / 100, // Round to 2 decimals
      ...vacationData,
      daysGozados: daysToCalculate
    };
  } catch (error) {
    logger.error('Error calculating vacation salary', error);
    return {
      amount: 0,
      monthsWorked: 0,
      daysAccumulated: 0,
      daysTaken: 0,
      daysRemaining: 0
    };
  }
}

/**
 * Calculate license not taken (licencia no gozada) for an employee
 * Legal: Solo se calcula al egreso del empleado
 * Formula: average daily wage of last 12 months * remaining days
 * 
 * @param {string} employeeId - Employee ID
 * @param {number} year - Year of calculation
 * @returns {Promise<Object>} License not taken data
 */
async function calculateLicenseNotTaken(employeeId, year) {
  try {
    const vacationData = await calculateUnusedVacationDays(employeeId, year);
    
    if (vacationData.daysRemaining === 0) {
      return {
        amount: 0,
        ...vacationData
      };
    }
    
    // Get salaries from last 12 months
    let salaries = null;
    try {
      const salariesService = getService('salaries');
      if (!salariesService) {
        return {
          amount: 0,
          ...vacationData
        };
      }
      salaries = await salariesService.queryByChild('employeeId', employeeId);
    } catch (queryError) {
      logger.warn('Error querying salaries for license not taken calculation', { 
        employeeId, 
        year, 
        error: queryError?.message || String(queryError)
      });
      return {
        amount: 0,
        ...vacationData
      };
    }
    
    if (!salaries || !Array.isArray(salaries)) {
      return {
        amount: 0,
        ...vacationData
      };
    }
    
    // Get last 12 months of salaries (sorted by year and month descending)
    const sortedSalaries = salaries
      .filter(s => s && s.year && s.month)
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      })
      .slice(0, 12); // Last 12 months
    
    if (sortedSalaries.length === 0) {
      // Fallback: use average monthly salary of the year
      const avgMonthlySalary = await calculateAverageMonthlySalary(employeeId, year);
      if (avgMonthlySalary === 0) {
        return {
          amount: 0,
          ...vacationData
        };
      }
      const dailyWage = avgMonthlySalary / 30;
      const amount = dailyWage * vacationData.daysRemaining;
      return {
        amount: Math.round(amount * 100) / 100,
        ...vacationData
      };
    }
    
    // Calculate average daily wage from last 12 months
    const totalHaberes = sortedSalaries.reduce((sum, salary) => {
      const base = parseFloat(salary.baseSalary30Days) || 0;
      const extras = parseFloat(salary.extras) || 0;
      return sum + (base + extras);
    }, 0);
    
    const avgMonthlySalary = totalHaberes / sortedSalaries.length;
    const averageDailyWage = avgMonthlySalary / 30;
    
    // License not taken = average daily wage * remaining days
    const amount = averageDailyWage * vacationData.daysRemaining;
    
    return {
      amount: Math.round(amount * 100) / 100, // Round to 2 decimals
      ...vacationData
    };
  } catch (error) {
    logger.error('Error calculating license not taken', error);
    return {
      amount: 0,
      monthsWorked: 0,
      daysAccumulated: 0,
      daysTaken: 0,
      daysRemaining: 0
    };
  }
}

/**
 * Calculate aguinaldo for an employee for a specific semester
 * Legal rules (Uruguay):
 * - 1er semestre: 1° diciembre → 31 mayo
 * - 2do semestre: 1° junio → 30 noviembre
 * - Formula: totalHaberesGravadosDelSemestre / 12
 * - NO usar promedios mensuales
 * - NO usar meses / 12
 * - El cálculo se basa en haberes reales percibidos
 * 
 * @param {string} employeeId - Employee ID
 * @param {number} year - Year for the semester
 * @param {number} semester - 1 for first semester (dec-may), 2 for second semester (jun-nov)
 * @returns {Promise<number>} Aguinaldo amount
 */
async function calculateAguinaldo(employeeId, year, semester = null) {
  try {
    if (!employeeId || !year) {
      logger.warn('Invalid parameters for calculateAguinaldo', { employeeId, year });
      return 0;
    }
    
    let salaries = null;
    try {
      const salariesService = getService('salaries');
      if (!salariesService) {
        return 0;
      }
      salaries = await salariesService.queryByChild('employeeId', employeeId);
    } catch (queryError) {
      logger.warn('Error querying salaries for aguinaldo calculation', { 
        employeeId, 
        year, 
        error: queryError?.message || String(queryError),
        errorType: queryError?.constructor?.name
      });
      return 0;
    }
    
    if (!salaries || !Array.isArray(salaries)) {
      logger.warn('No salaries found or invalid format', { employeeId, year });
      return 0;
    }
    
    // If semester is specified, calculate for that semester
    if (semester === 1) {
      // 1er semestre: December of previous year + January to May of current year
      const previousYear = year - 1;
      const decPreviousYear = salaries.filter(s => s && s.year === previousYear && s.month === 12);
      const janToMay = salaries.filter(s => s && s.year === year && s.month >= 1 && s.month <= 5);
      const semesterSalaries = [...decPreviousYear, ...janToMay];
      
      if (semesterSalaries.length === 0) {
        return 0;
      }
      
      // Sum ALL haberes gravados (baseSalary30Days + extras) of the semester
      const totalHaberesGravados = semesterSalaries.reduce((sum, salary) => {
        const base = parseFloat(salary.baseSalary30Days) || 0;
        const extras = parseFloat(salary.extras) || 0;
        return sum + (base + extras);
      }, 0);
      
      // Aguinaldo = totalHaberesGravados / 12
      return Math.round((totalHaberesGravados / 12) * 100) / 100;
      
    } else if (semester === 2) {
      // 2do semestre: June to November of current year
      const junToNov = salaries.filter(s => s && s.year === year && s.month >= 6 && s.month <= 11);
      
      if (junToNov.length === 0) {
        return 0;
      }
      
      // Sum ALL haberes gravados (baseSalary30Days + extras) of the semester
      const totalHaberesGravados = junToNov.reduce((sum, salary) => {
        const base = parseFloat(salary.baseSalary30Days) || 0;
        const extras = parseFloat(salary.extras) || 0;
        return sum + (base + extras);
      }, 0);
      
      // Aguinaldo = totalHaberesGravados / 12
      return Math.round((totalHaberesGravados / 12) * 100) / 100;
      
    } else {
      // Legacy: if no semester specified, calculate for full year (backward compatibility)
      // This should be deprecated in favor of semester-specific calculation
      const yearSalaries = salaries.filter(s => s && s.year === year);
      
      if (yearSalaries.length === 0) {
        return 0;
      }
      
      // Sum ALL haberes gravados of the year
      const totalHaberesGravados = yearSalaries.reduce((sum, salary) => {
        const base = parseFloat(salary.baseSalary30Days) || 0;
        const extras = parseFloat(salary.extras) || 0;
        return sum + (base + extras);
      }, 0);
      
      // Aguinaldo = totalHaberesGravados / 12
      return Math.round((totalHaberesGravados / 12) * 100) / 100;
    }
  } catch (error) {
    logger.error('Error calculating aguinaldo', { employeeId, year, semester, error });
    return 0;
  }
}

/**
 * Update or create vacation salary record for an employee/year
 * Legal: Solo calcular salario vacacional cuando se goza licencia
 * This should be called after saving a license (when license is taken)
 * 
 * @param {string} employeeId - Employee ID
 * @param {number} year - Year
 * @param {number} daysGozados - Days being taken (optional, will calculate from licenses if not provided)
 */
async function updateVacationSalary(employeeId, year, daysGozados = null) {
  try {
    if (!employeeId || !year) {
      logger.warn('Invalid parameters for updateVacationSalary', { employeeId, year });
      return null;
    }
    
    // Get employee to check if they have endDate (egreso)
    const employeesService = getService('employees');
    let employee = null;
    if (employeesService) {
      employee = await employeesService.getById(employeeId);
    }
    
    // If employee has endDate, this is an egreso - calculate license not taken instead
    if (employee && employee.endDate) {
      // Don't calculate vacation salary for terminated employees
      // They should use license not taken calculation
      logger.debug('Employee has endDate, skipping vacation salary calculation', { employeeId, year });
      return null;
    }
    
    // If daysGozados not provided, get from licenses for this year
    if (daysGozados === null) {
      const licensesService = getService('licenses');
      if (licensesService) {
        const licenses = await licensesService.queryByChild('employeeId', employeeId);
        const yearLicenses = licenses && Array.isArray(licenses)
          ? licenses.filter(l => l && l.year === year)
          : [];
        daysGozados = yearLicenses.reduce((sum, license) => {
          const days = parseFloat(license.daysTaken || license.days) || 0;
          return sum + days;
        }, 0);
      }
    }
    
    // Only calculate if there are days being taken (license is being used)
    if (daysGozados === 0 || daysGozados === null) {
      logger.debug('No days being taken, skipping vacation salary calculation', { employeeId, year });
      // Still update the record with 0 amount but keep the days data
      const vacationData = await calculateUnusedVacationDays(employeeId, year);
      const vacationRecord = {
        employeeId,
        year,
        amount: 0, // No vacation salary if no days are being taken
        daysAccumulated: parseFloat(vacationData.daysAccumulated) || 0,
        daysTaken: parseFloat(vacationData.daysTaken) || 0,
        daysRemaining: parseFloat(vacationData.daysRemaining) || 0,
        updatedAt: Date.now()
      };
      
      const vacationsService = getService('vacations');
      if (!vacationsService) {
        return null;
      }
      
      let existingVacation = null;
      try {
        const vacations = await vacationsService.queryByChild('employeeId', employeeId);
        existingVacation = vacations && Array.isArray(vacations) 
          ? vacations.find(v => v && v.year === year)
          : null;
      } catch (e) {
        // Continue
      }
      
      if (existingVacation && existingVacation.id) {
        if (existingVacation.paidDate) vacationRecord.paidDate = existingVacation.paidDate;
        if (existingVacation.notes) vacationRecord.notes = existingVacation.notes;
        if (existingVacation.createdAt) vacationRecord.createdAt = existingVacation.createdAt;
        await vacationsService.update(existingVacation.id, vacationRecord);
      } else {
        vacationRecord.createdAt = Date.now();
        await vacationsService.create(vacationRecord);
      }
      
      return vacationRecord;
    }
    
    // Calculate vacation salary for days being taken
    const vacationData = await calculateVacationSalary(employeeId, year, daysGozados);
    if (!vacationData) {
      logger.warn('No vacation data calculated', { employeeId, year });
      return null;
    }
    
    // Check if vacation record exists
    let existingVacation = null;
    try {
      const vacationsService = getService('vacations');
      if (vacationsService) {
        const vacations = await vacationsService.queryByChild('employeeId', employeeId);
        existingVacation = vacations && Array.isArray(vacations) 
          ? vacations.find(v => v && v.year === year)
          : null;
      }
    } catch (vacationQueryError) {
      logger.warn('Error querying vacations', { 
        employeeId, 
        year, 
        error: vacationQueryError?.message || String(vacationQueryError)
      });
      // Continue with null, will create new record
    }
    
    const vacationRecord = {
      employeeId,
      year,
      amount: parseFloat(vacationData.amount) || 0,
      daysAccumulated: parseFloat(vacationData.daysAccumulated) || 0,
      daysTaken: parseFloat(vacationData.daysTaken) || 0,
      daysRemaining: parseFloat(vacationData.daysRemaining) || 0,
      updatedAt: Date.now()
    };
    
    const vacationsService = getService('vacations');
    if (!vacationsService) {
      return null;
    }
    
    if (existingVacation && existingVacation.id) {
      // Preserve paidDate and notes if they exist
      if (existingVacation.paidDate) {
        vacationRecord.paidDate = existingVacation.paidDate;
      }
      if (existingVacation.notes) {
        vacationRecord.notes = existingVacation.notes;
      }
      if (existingVacation.createdAt) {
        vacationRecord.createdAt = existingVacation.createdAt;
      }
      
      await vacationsService.update(existingVacation.id, vacationRecord);
    } else {
      vacationRecord.createdAt = Date.now();
      await vacationsService.create(vacationRecord);
    }
    
    return vacationRecord;
  } catch (error) {
    logger.error('Error updating vacation salary', { 
      employeeId, 
      year, 
      error: error?.message || String(error),
      errorType: error?.constructor?.name
    });
    // Don't throw, just log the error to prevent breaking the flow
    return null;
  }
}

/**
 * Update or create license not taken record for an employee/year
 * Legal: Solo se calcula al egreso del empleado
 * This should be called when employee has endDate (termination)
 * 
 * @param {string} employeeId - Employee ID
 * @param {number} year - Year of termination
 */
async function updateLicenseNotTaken(employeeId, year) {
  try {
    if (!employeeId || !year) {
      logger.warn('Invalid parameters for updateLicenseNotTaken', { employeeId, year });
      return null;
    }
    
    // Get employee to verify they have endDate
    const employeesService = getService('employees');
    let employee = null;
    if (employeesService) {
      employee = await employeesService.getById(employeeId);
    }
    
    if (!employee || !employee.endDate) {
      logger.debug('Employee does not have endDate, skipping license not taken calculation', { employeeId, year });
      return null;
    }
    
    // Calculate license not taken using average of last 12 months
    const licenseNotTakenData = await calculateLicenseNotTaken(employeeId, year);
    if (!licenseNotTakenData || licenseNotTakenData.amount === 0) {
      logger.debug('No license not taken amount calculated', { employeeId, year });
      return null;
    }
    
    // Store in a separate collection or use vacations with a flag
    // For now, we'll use vacations collection but mark it differently
    // TODO: Consider creating a separate 'licenseNotTaken' collection
    
    const vacationsService = getService('vacations');
    if (!vacationsService) {
      return null;
    }
    
    // Check if record exists
    let existingVacation = null;
    try {
      const vacations = await vacationsService.queryByChild('employeeId', employeeId);
      existingVacation = vacations && Array.isArray(vacations) 
        ? vacations.find(v => v && v.year === year)
        : null;
    } catch (e) {
      // Continue
    }
    
    const licenseNotTakenRecord = {
      employeeId,
      year,
      amount: parseFloat(licenseNotTakenData.amount) || 0,
      daysAccumulated: parseFloat(licenseNotTakenData.daysAccumulated) || 0,
      daysTaken: parseFloat(licenseNotTakenData.daysTaken) || 0,
      daysRemaining: parseFloat(licenseNotTakenData.daysRemaining) || 0,
      isLicenseNotTaken: true, // Flag to distinguish from vacation salary
      updatedAt: Date.now()
    };
    
    if (existingVacation && existingVacation.id) {
      // Preserve paidDate and notes if they exist
      if (existingVacation.paidDate) {
        licenseNotTakenRecord.paidDate = existingVacation.paidDate;
      }
      if (existingVacation.notes) {
        licenseNotTakenRecord.notes = existingVacation.notes;
      }
      if (existingVacation.createdAt) {
        licenseNotTakenRecord.createdAt = existingVacation.createdAt;
      }
      
      await vacationsService.update(existingVacation.id, licenseNotTakenRecord);
    } else {
      licenseNotTakenRecord.createdAt = Date.now();
      await vacationsService.create(licenseNotTakenRecord);
    }
    
    return licenseNotTakenRecord;
  } catch (error) {
    logger.error('Error updating license not taken', { 
      employeeId, 
      year, 
      error: error?.message || String(error),
      errorType: error?.constructor?.name
    });
    return null;
  }
}

/**
 * Update or create aguinaldo record for an employee/year
 * This should be called after saving a salary
 */
async function updateAguinaldo(employeeId, year) {
  try {
    if (!employeeId || !year) {
      logger.warn('Invalid parameters for updateAguinaldo', { employeeId, year });
      return null;
    }
    
    const amount = await calculateAguinaldo(employeeId, year);
    
    // Check if aguinaldo record exists
    let existingAguinaldo = null;
    try {
      const aguinaldoService = getService('aguinaldo');
      if (aguinaldoService) {
        const aguinaldos = await aguinaldoService.queryByChild('employeeId', employeeId);
        existingAguinaldo = aguinaldos && Array.isArray(aguinaldos)
          ? aguinaldos.find(a => a && a.year === year)
          : null;
      }
    } catch (aguinaldoQueryError) {
      logger.warn('Error querying aguinaldo', { 
        employeeId, 
        year, 
        error: aguinaldoQueryError?.message || String(aguinaldoQueryError)
      });
      // Continue with null, will create new record
    }
    
    const aguinaldoRecord = {
      employeeId,
      year,
      amount: parseFloat(amount) || 0,
      updatedAt: Date.now()
    };
    
    const aguinaldoService = getService('aguinaldo');
    if (!aguinaldoService) {
      return null;
    }
    
    if (existingAguinaldo && existingAguinaldo.id) {
      // Preserve paidDate and notes if they exist
      if (existingAguinaldo.paidDate) {
        aguinaldoRecord.paidDate = existingAguinaldo.paidDate;
      }
      if (existingAguinaldo.notes) {
        aguinaldoRecord.notes = existingAguinaldo.notes;
      }
      if (existingAguinaldo.createdAt) {
        aguinaldoRecord.createdAt = existingAguinaldo.createdAt;
      }
      
      await aguinaldoService.update(existingAguinaldo.id, aguinaldoRecord);
    } else {
      aguinaldoRecord.createdAt = Date.now();
      await aguinaldoService.create(aguinaldoRecord);
    }
    
    return aguinaldoRecord;
  } catch (error) {
    logger.error('Error updating aguinaldo', { 
      employeeId, 
      year, 
      error: error?.message || String(error),
      errorType: error?.constructor?.name
    });
    // Don't throw, just log the error to prevent breaking the flow
    return null;
  }
}

/**
 * Recalculate all payroll items for an employee in a given year
 * Call this after saving a salary or license
 * Legal: Determina si calcular salario vacacional o licencia no gozada según el estado del empleado
 */
async function recalculatePayrollItems(employeeId, year) {
  try {
    if (!employeeId || !year) {
      logger.warn('Invalid parameters for recalculatePayrollItems', { employeeId, year });
      return;
    }
    
    // Get employee to check if they have endDate (egreso)
    const employeesService = getService('employees');
    let employee = null;
    if (employeesService) {
      employee = await employeesService.getById(employeeId);
    }
    
    // Use Promise.allSettled to continue even if one fails
    const promises = [
      updateAguinaldo(employeeId, year)
    ];
    
    // Legal: Solo calcular salario vacacional si NO hay egreso
    // Solo calcular licencia no gozada si HAY egreso
    if (employee && employee.endDate) {
      // Employee has terminated - calculate license not taken
      promises.push(updateLicenseNotTaken(employeeId, year));
    } else {
      // Employee is active - calculate vacation salary (only if license is being taken)
      promises.push(updateVacationSalary(employeeId, year));
    }
    
    const results = await Promise.allSettled(promises);
    
    // Log any failures but don't throw
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const operation = index === 0 ? 'updateAguinaldo' : (employee && employee.endDate ? 'updateLicenseNotTaken' : 'updateVacationSalary');
        logger.warn(`Error in ${operation}`, { employeeId, year, error: result.reason });
      }
    });
  } catch (error) {
    logger.error('Error recalculating payroll items', { employeeId, year, error });
    // Don't throw to prevent breaking the flow
  }
}

/**
 * Recalculate payroll items for all employees that have salaries in a given year
 * Useful for initial setup or bulk recalculation
 */
async function recalculateAllPayrollItems(year) {
  try {
    // Get all salaries for the year
    const salariesService = getService('salaries');
    if (!salariesService) {
      logger.warn('NRD salaries service not available for bulk recalculation', { year });
      return {
        total: 0,
        successful: 0,
        failed: 0
      };
    }
    const allSalaries = await salariesService.getAll();
    const yearSalaries = allSalaries.filter(s => s.year === year);
    
    // Get unique employee IDs
    const employeeIds = [...new Set(yearSalaries.map(s => s.employeeId))];
    
    // Recalculate for each employee
    const results = await Promise.allSettled(
      employeeIds.map(employeeId => recalculatePayrollItems(employeeId, year))
    );
    
    const errors = results.filter(r => r.status === 'rejected');
    if (errors.length > 0) {
      logger.warn('Some recalculations failed', errors);
    }
    
    return {
      total: employeeIds.length,
      successful: results.filter(r => r.status === 'fulfilled').length,
      failed: errors.length
    };
  } catch (error) {
    logger.error('Error recalculating all payroll items', error);
    throw error;
  }
}

// Export functions
export { 
  recalculatePayrollItems,
  recalculateAllPayrollItems,
  calculateVacationSalary,
  calculateLicenseNotTaken,
  calculateAguinaldo,
  updateVacationSalary,
  updateLicenseNotTaken,
  updateAguinaldo,
  calculateVacationDaysPerYear,
  calculateUnusedVacationDays,
  calculateAverageMonthlySalary
};

// Maintain compatibility with existing code
if (typeof window !== 'undefined') {
  window.recalculatePayrollItems = recalculatePayrollItems;
  window.recalculateAllPayrollItems = recalculateAllPayrollItems;
  window.calculateVacationSalary = calculateVacationSalary;
  window.calculateLicenseNotTaken = calculateLicenseNotTaken;
  window.calculateAguinaldo = calculateAguinaldo;
  window.updateVacationSalary = updateVacationSalary;
  window.updateLicenseNotTaken = updateLicenseNotTaken;
  window.updateAguinaldo = updateAguinaldo;
}
window.calculateUnusedVacationDays = calculateUnusedVacationDays;
