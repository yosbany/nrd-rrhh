// Dashboard with summary totals
(function() {
'use strict';

// Get nrd instance safely
var nrd = window.nrd;

// Format number with comma for decimals and dot for thousands
// Always round to integer (0 decimals) and show as ,00
function formatNumber(value, decimals = 0) {
  if (value === null || value === undefined || isNaN(value)) return '0,00';
  const num = Math.round(parseFloat(value)); // Round to nearest integer
  if (isNaN(num)) return '0,00';
  
  // Add thousand separators (dots) to integer part
  const formattedInteger = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  // Always return with ,00 for consistency
  return `${formattedInteger},00`;
}

// Format currency with $ symbol
// Always round to integer (0 decimals) and show as ,00
function formatCurrency(value, decimals = 0) {
  return `$${formatNumber(value, decimals)}`;
}

let dashboardListener = null;
let currentYear = new Date().getFullYear();

// Load dashboard data
async function loadDashboard() {
  const dashboardContent = document.getElementById('dashboard-content');
  if (!dashboardContent) return;
  
  dashboardContent.innerHTML = '<p class="text-gray-500 text-sm">Cargando dashboard...</p>';

  if (!nrd) {
    dashboardContent.innerHTML = '<p class="text-gray-500 text-sm">Servicio no disponible</p>';
    return;
  }

  try {
    // Load all data
    const [employees, salaries, licenses, vacations, aguinaldos, roles] = await Promise.all([
      nrd.employees.getAll(),
      nrd.salaries.getAll(),
      nrd.licenses.getAll(),
      nrd.vacations.getAll(),
      nrd.aguinaldo.getAll(),
      nrd.roles.getAll().catch(() => [])
    ]);

    // Convert to arrays if needed
    let employeesArray = Array.isArray(employees) ? employees : Object.values(employees || {});
    const salariesArray = Array.isArray(salaries) ? salaries : Object.values(salaries || {});
    const licensesArray = Array.isArray(licenses) ? licenses : Object.values(licenses || {});
    const vacationsArray = Array.isArray(vacations) ? vacations : Object.values(vacations || {});
    const aguinaldosArray = Array.isArray(aguinaldos) ? aguinaldos : Object.values(aguinaldos || {});
    const rolesArray = Array.isArray(roles) ? roles : Object.values(roles || {});
    
    // Find "socio" role ID (case-insensitive) to exclude partners from count
    const socioRoleId = rolesArray.find(role => 
      role && role.name && role.name.toLowerCase().trim() === 'socio'
    )?.id;
    
    // Filter out employees with "socio" role
    if (socioRoleId) {
      employeesArray = employeesArray.filter(employee => {
        const roleIds = employee.roleIds || (employee.roleId ? [employee.roleId] : []);
        return !roleIds.includes(socioRoleId);
      });
    }
    
    // Create set of employee IDs without socios for filtering
    const employeesWithoutSociosIds = new Set(employeesArray.map(e => e.id));

    // Filter by current year and exclude salaries/licenses/vacations/aguinaldos from socios
    const yearSalaries = salariesArray.filter(s => 
      s.year === currentYear && employeesWithoutSociosIds.has(s.employeeId)
    );
    const yearLicenses = licensesArray.filter(l => 
      l.year === currentYear && employeesWithoutSociosIds.has(l.employeeId)
    );
    const yearVacations = vacationsArray.filter(v => 
      v.year === currentYear && employeesWithoutSociosIds.has(v.employeeId)
    );
    const yearAguinaldos = aguinaldosArray.filter(a => 
      a.year === currentYear && employeesWithoutSociosIds.has(a.employeeId)
    );

    // Calculate totals (already filtered to exclude socios)
    const totalEmployees = employeesArray.length;
    const totalSalaries = yearSalaries.length;
    const totalEmployeesWithSalaries = new Set(yearSalaries.map(s => s.employeeId)).size;
    
    // Calculate total salary amounts
    const totalBaseSalary = yearSalaries.reduce((sum, s) => sum + (s.baseSalary30Days || 0), 0);
    const totalExtras = yearSalaries.reduce((sum, s) => sum + (s.extras || 0), 0);
    const totalMonthlySalary = totalBaseSalary + totalExtras;
    
    // Get employees with salaries to filter licenses
    const employeesWithYearSalariesSet = new Set(yearSalaries.map(s => s.employeeId));
    
    // Calculate vacation salary - only count unpaid (where employee still has remaining days)
    // If all vacation days are taken (daysRemaining <= 0), vacation salary is already paid
    let totalVacationSalary = 0;
    let totalVacationSalaryPaid = 0;
    
    // Also get licenses to check days taken (for employees with salaries, excluding socios)
    const allLicenses = licensesArray.filter(l => 
      employeesWithYearSalariesSet.has(l.employeeId) && employeesWithoutSociosIds.has(l.employeeId)
    );
    
    // Calculate vacation salary for each employee based on remaining days
    employeesWithYearSalariesSet.forEach(employeeId => {
      // Skip if employee is a socio
      if (!employeesWithoutSociosIds.has(employeeId)) return;
      
      const employee = employeesArray.find(e => e.id === employeeId);
      if (!employee || employee.endDate) return; // Skip terminated employees
      
      const employeeVacation = yearVacations.find(v => v.employeeId === employeeId);
      const employeeLicenses = allLicenses.filter(l => l.employeeId === employeeId && l.year === currentYear);
      const daysTaken = employeeLicenses.reduce((sum, l) => sum + (l.daysTaken || 0), 0);
      
      let daysAccumulated = 0;
      let daysRemaining = 0;
      
      if (employeeVacation) {
        daysAccumulated = employeeVacation.daysAccumulated || 0;
        daysRemaining = employeeVacation.daysRemaining !== undefined 
          ? employeeVacation.daysRemaining 
          : Math.max(0, daysAccumulated - daysTaken);
      } else {
        // Calculate days accumulated if no vacation record exists
        // This is a simplified calculation - full logic is in calculateEmployeeSummary
        const employeeSalaries = yearSalaries.filter(s => s.employeeId === employeeId);
        if (employeeSalaries.length > 0 && employee.startDate) {
          // Simplified: assume 20 days for full year, proportional for partial year
          const monthsWorked = employeeSalaries.length;
          daysAccumulated = Math.floor(monthsWorked * 1.66);
          daysRemaining = Math.max(0, daysAccumulated - daysTaken);
        }
      }
      
      // Calculate vacation salary based on remaining days (what needs to be paid)
      // Use daily wage from last salary of currentYear (same as license not taken) for consistency
      if (daysRemaining > 0) {
        // Get salaries from currentYear for this employee
        const employeeSalaries = yearSalaries
          .filter(s => s.employeeId === employeeId && s.month)
          .sort((a, b) => (b.month || 0) - (a.month || 0)); // Sort by month descending
        
        if (employeeSalaries.length > 0) {
          // Get the last salary (most recent month) from currentYear
          const lastSalary = employeeSalaries[0];
          
          let dailyWage = 0;
          // Try to get dailyWage directly from the salary record
          if (lastSalary.dailyWage && lastSalary.dailyWage > 0) {
            dailyWage = parseFloat(lastSalary.dailyWage);
          } else {
            // Calculate daily wage from baseSalary30Days + extras
            const base = parseFloat(lastSalary.baseSalary30Days) || 0;
            const extras = parseFloat(lastSalary.extras) || 0;
            const totalMonthly = base + extras;
            dailyWage = totalMonthly / 30;
          }
          
          // Vacation salary = remaining days * daily wage (rounded to integer)
          const estimatedVacationSalary = Math.round(daysRemaining * dailyWage);
          totalVacationSalary += estimatedVacationSalary;
        }
      }
    });
    
    // Calculate aguinaldo - separate paid vs unpaid
    // Separate by semester and check if paid
    let totalAguinaldo = 0; // Unpaid aguinaldo
    let totalAguinaldoPaid = 0; // Paid aguinaldo
    let firstSemesterAguinaldo = 0; // Unpaid 1st semester
    let secondSemesterAguinaldo = 0; // Unpaid 2nd semester
    let firstSemesterAguinaldoPaid = 0; // Paid 1st semester
    let secondSemesterAguinaldoPaid = 0; // Paid 2nd semester
    
    // Calculate aguinaldo for each employee with salaries (excluding socios)
    employeesWithYearSalariesSet.forEach(employeeId => {
      // Skip if employee is a socio
      if (!employeesWithoutSociosIds.has(employeeId)) return;
      const employeeSalaries = yearSalaries.filter(s => s.employeeId === employeeId);
      
      // 1er semestre: December of previous year + January to May of current year
      const prevYear = currentYear - 1;
      const prevYearSalaries = salariesArray.filter(s => 
        s.employeeId === employeeId && s.year === prevYear && s.month === 12
      );
      const firstSemesterSalaries = [
        ...prevYearSalaries,
        ...employeeSalaries.filter(s => s.month >= 1 && s.month <= 5)
      ];
      
      // 2do semestre: June to November of current year
      const secondSemesterSalaries = employeeSalaries.filter(s => 
        s.month >= 6 && s.month <= 11
      );
      
      // Calculate aguinaldo amounts
      if (firstSemesterSalaries.length > 0) {
        const totalHaberes = firstSemesterSalaries.reduce((sum, s) => {
          const base = parseFloat(s.baseSalary30Days) || 0;
          const extras = parseFloat(s.extras) || 0;
          return sum + (base + extras);
        }, 0);
        const calculatedAmount = Math.round(totalHaberes / 12); // Round to integer
        
        // Check if this aguinaldo is paid
        const paidAguinaldo = aguinaldosArray.find(a => 
          a && a.employeeId === employeeId && 
          a.year === currentYear && 
          a.paidDate &&
          a.notes && (a.notes.includes('1er semestre') || a.notes.includes('primer semestre'))
        );
        
        if (paidAguinaldo) {
          firstSemesterAguinaldoPaid += calculatedAmount;
          totalAguinaldoPaid += calculatedAmount;
        } else {
          firstSemesterAguinaldo += calculatedAmount;
          totalAguinaldo += calculatedAmount;
        }
      }
      
      if (secondSemesterSalaries.length > 0) {
        const totalHaberes = secondSemesterSalaries.reduce((sum, s) => {
          const base = parseFloat(s.baseSalary30Days) || 0;
          const extras = parseFloat(s.extras) || 0;
          return sum + (base + extras);
        }, 0);
        const calculatedAmount = Math.round(totalHaberes / 12); // Round to integer
        
        // Check if this aguinaldo is paid
        const paidAguinaldo = aguinaldosArray.find(a => 
          a && a.employeeId === employeeId && 
          a.year === currentYear && 
          a.paidDate &&
          a.notes && (a.notes.includes('2do semestre') || a.notes.includes('segundo semestre'))
        );
        
        if (paidAguinaldo) {
          secondSemesterAguinaldoPaid += calculatedAmount;
          totalAguinaldoPaid += calculatedAmount;
        } else {
          secondSemesterAguinaldo += calculatedAmount;
          totalAguinaldo += calculatedAmount;
        }
      }
    });
    
    // Calculate total days - use calculated vacation data if available, otherwise calculate
    let totalVacationDaysAccumulated = 0;
    let totalVacationDaysRemaining = 0;
    
    // Try to get from calculated vacation records first
    if (yearVacations.length > 0) {
      totalVacationDaysAccumulated = yearVacations.reduce((sum, v) => sum + (v.daysAccumulated || 0), 0);
      totalVacationDaysRemaining = yearVacations.reduce((sum, v) => sum + (v.daysRemaining || 0), 0);
    } else {
      // Fallback: calculate based on employee start dates (only for employees without socios)
      const employeesWithSalaries = new Set(yearSalaries.map(s => s.employeeId));
      
      for (const employee of employeesArray) {
        if (employeesWithSalaries.has(employee.id) && employee.startDate) {
          const start = new Date(employee.startDate);
          // For year X, calculate based on years worked until end of year X-1
          // Example: For 2026, use years worked until Dec 31, 2025
          const previousYear = currentYear - 1;
          const previousYearEnd = new Date(previousYear, 11, 31); // December 31 of the previous year
          const yearStart = new Date(currentYear, 0, 1); // January 1 of the year
          const yearEnd = new Date(currentYear, 11, 31); // December 31 of the year
          
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
          
          let employeeDays = 0;
          
          if (!workedFullYear && monthsWorkedInYear > 0) {
            // Employee didn't work the full year: calculate proportionally
            // 1.66 days per month, rounded up
            employeeDays = Math.ceil(monthsWorkedInYear * 1.66);
          } else {
            // Employee worked the full year: calculate based on years of service
            // Calculate complete years worked up to the end of the PREVIOUS year
            // For year 2026, calculate years worked until Dec 31, 2025
            let yearsWorked = previousYearEnd.getFullYear() - start.getFullYear();
            const monthDiff = previousYearEnd.getMonth() - start.getMonth();
            const dayDiff = previousYearEnd.getDate() - start.getDate();
            
            if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
              yearsWorked--;
            }
            
            yearsWorked = Math.max(0, yearsWorked);
            
            // Calculate vacation days per year based on years of service
            // Years 1-4: 20 days/year, Year 5: 21 days, then +1 every 4 years
            let daysPerYear = 20;
            if (yearsWorked > 0) {
              if (yearsWorked <= 4) {
                daysPerYear = 20;
              } else {
                // Year 5: 21 days, then every 4 years add 1 day
                const yearsAfter5 = yearsWorked - 5;
                const additionalDays = Math.floor(yearsAfter5 / 4);
                daysPerYear = 21 + additionalDays;
              }
            }
            
            employeeDays = daysPerYear;
          }
          
          totalVacationDaysAccumulated += employeeDays;
        }
      }
      
      // If still no calculation, use old method as last resort
      if (totalVacationDaysAccumulated === 0) {
        // Use proportional calculation: 1.66 days per month, rounded up
        totalVacationDaysAccumulated = Math.ceil(yearSalaries.length * 1.66);
      }
    }
    
    const totalVacationDaysTaken = Math.round(yearLicenses.reduce((sum, l) => sum + (l.daysTaken || 0), 0));
    
    // If we didn't get remaining from vacation records, calculate it
    if (totalVacationDaysRemaining === 0) {
      totalVacationDaysRemaining = Math.round(Math.max(0, totalVacationDaysAccumulated - totalVacationDaysTaken));
    } else {
      totalVacationDaysRemaining = Math.round(totalVacationDaysRemaining);
    }
    
    // Round accumulated days to integer
    totalVacationDaysAccumulated = Math.round(totalVacationDaysAccumulated);
    
    // Calculate license not taken (for terminated employees, excluding socios)
    let totalLicenseNotTaken = 0;
    const terminatedEmployees = employeesArray.filter(e => e.endDate);
    terminatedEmployees.forEach(employee => {
      // Already filtered to exclude socios, but double-check just in case
      if (!employeesWithoutSociosIds.has(employee.id)) return;
      const employeeVacation = vacationsArray.find(v => 
        v.employeeId === employee.id && v.isLicenseNotTaken && v.year === currentYear
      );
      if (employeeVacation && employeeVacation.amount) {
        totalLicenseNotTaken += parseFloat(employeeVacation.amount) || 0;
      }
    });
    
    // Round all totals to integers
    totalVacationSalary = Math.round(totalVacationSalary);
    totalVacationSalaryPaid = Math.round(totalVacationSalaryPaid);
    totalAguinaldo = Math.round(totalAguinaldo);
    totalAguinaldoPaid = Math.round(totalAguinaldoPaid);
    firstSemesterAguinaldo = Math.round(firstSemesterAguinaldo);
    secondSemesterAguinaldo = Math.round(secondSemesterAguinaldo);
    firstSemesterAguinaldoPaid = Math.round(firstSemesterAguinaldoPaid);
    secondSemesterAguinaldoPaid = Math.round(secondSemesterAguinaldoPaid);
    totalLicenseNotTaken = Math.round(totalLicenseNotTaken);
    
    // Calculate total payroll cost (only unpaid items)
    const totalPayrollCost = Math.round(totalMonthlySalary + totalVacationSalary + totalAguinaldo + totalLicenseNotTaken);

    // Render dashboard
    dashboardContent.innerHTML = '';
    
    // Header with year selector
    const header = document.createElement('div');
    header.className = 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0 mb-6';
    header.innerHTML = `
      <div>
        <h2 class="text-xl sm:text-2xl font-light text-gray-800 mb-1">Dashboard</h2>
        <p class="text-sm text-gray-600">Resumen general de partidas salariales</p>
      </div>
      <div class="flex flex-wrap gap-2">
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
    dashboardContent.appendChild(header);

    // Year selector handlers
    document.querySelectorAll('.year-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const selectedYear = parseInt(e.target.dataset.year);
        if (selectedYear !== currentYear) {
          // Disable button to prevent double clicks
          btn.disabled = true;
          showSpinner('Cargando datos...');
          try {
            currentYear = selectedYear;
            await loadDashboard();
          } finally {
            hideSpinner();
            btn.disabled = false;
          }
        }
      });
    });

    // Summary cards grid
    const cardsGrid = document.createElement('div');
    cardsGrid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6';
    
    // Card 1: Total Employees
    const card1 = document.createElement('div');
    card1.className = 'bg-white border border-gray-200 rounded-lg p-4 sm:p-6';
    card1.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-light text-gray-600 uppercase tracking-wider">Total Empleados</h3>
        <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
          <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
          </svg>
        </div>
      </div>
      <div class="text-3xl font-light text-gray-800">${totalEmployees}</div>
      <div class="text-xs text-gray-500 mt-1">Empleados registrados</div>
    `;
    cardsGrid.appendChild(card1);

    // Card 2: Employees with Salaries
    const card2 = document.createElement('div');
    card2.className = 'bg-white border border-gray-200 rounded-lg p-4 sm:p-6';
    card2.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-light text-gray-600 uppercase tracking-wider">Con Salarios</h3>
        <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
          <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
      </div>
      <div class="text-3xl font-light text-gray-800">${totalEmployeesWithSalaries}</div>
      <div class="text-xs text-gray-500 mt-1">Empleados con salarios en ${currentYear}</div>
    `;
    cardsGrid.appendChild(card2);

    // Card 3: Total Salaries
    const card3 = document.createElement('div');
    card3.className = 'bg-white border border-gray-200 rounded-lg p-4 sm:p-6';
    card3.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-light text-gray-600 uppercase tracking-wider">Registros de Salario</h3>
        <div class="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
          <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
          </svg>
        </div>
      </div>
      <div class="text-3xl font-light text-gray-800">${totalSalaries}</div>
      <div class="text-xs text-gray-500 mt-1">Registros en ${currentYear}</div>
    `;
    cardsGrid.appendChild(card3);

    // Card 4: Total Monthly Salary
    const card4 = document.createElement('div');
    card4.className = 'bg-white border border-gray-200 rounded-lg p-4 sm:p-6';
    card4.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-light text-gray-600 uppercase tracking-wider">Total Salarios Mensuales</h3>
        <div class="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
          <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
      </div>
      <div class="text-3xl font-light text-red-600">${formatCurrency(totalMonthlySalary)}</div>
      <div class="text-xs text-gray-500 mt-1">Base + Extras en ${currentYear}</div>
    `;
    cardsGrid.appendChild(card4);

    // Card 5: Total Vacation Salary (Unpaid)
    const card5 = document.createElement('div');
    card5.className = 'bg-white border border-gray-200 rounded-lg p-4 sm:p-6';
    card5.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-light text-gray-600 uppercase tracking-wider">Salario Vacacional Pendiente</h3>
        <div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
          <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
        </div>
      </div>
      <div class="text-3xl font-light text-red-600">${formatCurrency(totalVacationSalary)}</div>
      <div class="text-xs text-gray-500 mt-1">
        ${totalVacationSalaryPaid > 0 ? `Pagado: ${formatCurrency(totalVacationSalaryPaid)}` : 'Salario vacacional pendiente'}
      </div>
    `;
    cardsGrid.appendChild(card5);

    // Card 6: Total Aguinaldo (Unpaid)
    const card6 = document.createElement('div');
    card6.className = 'bg-white border border-gray-200 rounded-lg p-4 sm:p-6';
    card6.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-light text-gray-600 uppercase tracking-wider">Aguinaldo Pendiente</h3>
        <div class="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
          <svg class="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"></path>
          </svg>
        </div>
      </div>
      <div class="text-3xl font-light text-red-600">${formatCurrency(totalAguinaldo)}</div>
      <div class="text-xs text-gray-500 mt-1">
        ${totalAguinaldoPaid > 0 ? `Pagado: ${formatCurrency(totalAguinaldoPaid)}` : 'Aguinaldo pendiente en ' + currentYear}
      </div>
      <div class="mt-2 space-y-1 text-xs">
        ${firstSemesterAguinaldo > 0 || firstSemesterAguinaldoPaid > 0 ? `
          <div class="flex justify-between">
            <span class="text-gray-600">1er Semestre:</span>
            <span class="${firstSemesterAguinaldo > 0 ? 'text-red-600 font-medium' : 'text-gray-500'}">
              ${formatCurrency(firstSemesterAguinaldo)}
              ${firstSemesterAguinaldoPaid > 0 ? ` (Pagado: ${formatCurrency(firstSemesterAguinaldoPaid)})` : ''}
            </span>
          </div>
        ` : ''}
        ${secondSemesterAguinaldo > 0 || secondSemesterAguinaldoPaid > 0 ? `
          <div class="flex justify-between">
            <span class="text-gray-600">2do Semestre:</span>
            <span class="${secondSemesterAguinaldo > 0 ? 'text-red-600 font-medium' : 'text-gray-500'}">
              ${formatCurrency(secondSemesterAguinaldo)}
              ${secondSemesterAguinaldoPaid > 0 ? ` (Pagado: ${formatCurrency(secondSemesterAguinaldoPaid)})` : ''}
            </span>
          </div>
        ` : ''}
      </div>
    `;
    cardsGrid.appendChild(card6);

    // Card 7: Total Payroll Cost
    const card7 = document.createElement('div');
    card7.className = 'bg-red-50 border-2 border-red-200 rounded-lg p-4 sm:p-6';
    card7.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-light text-red-800 uppercase tracking-wider">Costo Total de Nómina</h3>
        <div class="w-10 h-10 bg-red-200 rounded-full flex items-center justify-center">
          <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
          </svg>
        </div>
      </div>
      <div class="text-3xl font-light text-red-600">${formatCurrency(totalPayrollCost)}</div>
      <div class="text-xs text-red-700 mt-1">Total anual en ${currentYear}</div>
    `;
    cardsGrid.appendChild(card7);

    // Card 8: Vacation Days Summary
    const card8 = document.createElement('div');
    card8.className = 'bg-white border border-gray-200 rounded-lg p-4 sm:p-6';
    card8.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-light text-gray-600 uppercase tracking-wider">Días de Licencia</h3>
        <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
          <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
        </div>
      </div>
      <div class="space-y-2">
        <div class="flex justify-between items-center">
          <span class="text-sm text-gray-600">Acumulados:</span>
          <span class="text-lg font-medium">${formatNumber(totalVacationDaysAccumulated)}</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-sm text-gray-600">Tomados:</span>
          <span class="text-lg font-medium text-red-600">${formatNumber(totalVacationDaysTaken)}</span>
        </div>
        <div class="flex justify-between items-center pt-2 border-t border-gray-200">
          <span class="text-sm font-medium text-gray-800">Restantes:</span>
          <span class="text-xl font-medium text-green-600">${formatNumber(totalVacationDaysRemaining)}</span>
        </div>
      </div>
    `;
    cardsGrid.appendChild(card8);

    // Card 9: License Not Taken (for terminated employees)
    if (totalLicenseNotTaken > 0) {
      const card9 = document.createElement('div');
      card9.className = 'bg-green-50 border border-green-200 rounded-lg p-4 sm:p-6';
      card9.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-light text-green-800 uppercase tracking-wider">Licencia No Gozada</h3>
          <div class="w-10 h-10 bg-green-200 rounded-full flex items-center justify-center">
            <svg class="w-6 h-6 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
        </div>
        <div class="text-3xl font-light text-green-600">${formatCurrency(totalLicenseNotTaken)}</div>
        <div class="text-xs text-green-700 mt-1">Licencia no gozada pagada en ${currentYear}</div>
      `;
      cardsGrid.appendChild(card9);
    }

    dashboardContent.appendChild(cardsGrid);

  } catch (error) {
    logger.error('Error loading dashboard', error);
    dashboardContent.innerHTML = '<p class="text-red-500 text-sm">Error al cargar el dashboard</p>';
  }
}

// Initialize dashboard
function initializeDashboard() {
  loadDashboard();
}

// Expose functions to global scope
window.initializeDashboard = initializeDashboard;
window.loadDashboard = loadDashboard;

})(); // End of IIFE
