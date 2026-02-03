// Monthly Payroll Management (ES Module)
const logger = window.logger || console;
const escapeHtml = window.escapeHtml || ((text) => String(text));
const getMonthName = window.getMonthName || ((m) => ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][m-1] || '');
const formatNumber = window.formatNumber || ((v) => String(v));
const formatCurrency = window.formatCurrency || ((v) => '$' + String(v));
const parseDecimalWithComma = window.parseDecimalWithComma || ((v) => parseFloat(String(v).replace(',', '.')) || null);
const formatDecimalWithComma = window.formatDecimalWithComma || ((v) => String(v).replace('.', ','));
const showSpinner = window.showSpinner || (() => {});
const hideSpinner = window.hideSpinner || (() => {});
const showConfirm = window.showConfirm || (() => Promise.resolve(false));
const showSuccess = window.showSuccess || (() => Promise.resolve());
const showError = window.showError || (() => Promise.resolve());

let employeesData = {};
let salariesData = {};
let currentView = 'list'; // 'list', 'form', 'detail'

/**
 * Initialize monthly payroll view
 */
export async function initializeMonthlyPayroll() {
  logger.debug('Initializing monthly payroll view');
  await loadAllData();
  await loadMonthlyPayrolls();
}

/**
 * Load all necessary data
 */
async function loadAllData() {
  const nrd = window.nrd;
  if (!nrd) {
    throw new Error('NRD service not available');
  }

  try {
    const [employees, salaries] = await Promise.all([
      nrd.employees.getAll().catch(() => []),
      nrd.salaries.getAll().catch(() => [])
    ]);

    // Process employees
    employeesData = Array.isArray(employees)
      ? employees.reduce((acc, emp) => {
          if (emp && emp.id) acc[emp.id] = emp;
          return acc;
        }, {})
      : employees || {};

    // Process salaries
    salariesData = Array.isArray(salaries)
      ? salaries.reduce((acc, sal) => {
          if (sal && sal.id) acc[sal.id] = sal;
          return acc;
        }, {})
      : salaries || {};

    logger.debug('Data loaded', {
      employees: Object.keys(employeesData).length,
      salaries: Object.keys(salariesData).length
    });
  } catch (error) {
    logger.error('Error loading data', error);
    throw error;
  }
}

/**
 * Load and display monthly payrolls list
 */
async function loadMonthlyPayrolls() {
  const container = document.getElementById('monthly-payroll-content');
  if (!container) return;

  await loadAllData();

  // Load roles to filter out employees with "socio" role
  const nrd = window.nrd;
  let rolesData = {};
  let socioRoleId = null;
  
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
      
      // Find "socio" role ID (case-insensitive)
      socioRoleId = Object.values(rolesData).find(role => 
        role && role.name && role.name.toLowerCase().trim() === 'socio'
      )?.id;
    }
  } catch (error) {
    logger.warn('Error loading roles for filtering', error);
  }

  // Group salaries by year and month (excluding employees with "socio" role)
  const payrollsMap = {};
  Object.values(salariesData).forEach(salary => {
    if (!salary.year || !salary.month) return;
    
    // Exclude if employee has "socio" role
    if (salary.employeeId && socioRoleId) {
      const employee = employeesData[salary.employeeId];
      if (employee) {
        const roleIds = employee.roleIds || (employee.roleId ? [employee.roleId] : []);
        if (roleIds.includes(socioRoleId)) {
          return; // Skip this salary
        }
      }
    }
    
    const key = `${salary.year}-${String(salary.month).padStart(2, '0')}`;
    if (!payrollsMap[key]) {
      payrollsMap[key] = {
        year: salary.year,
        month: salary.month,
        employeeCount: 0,
        totalAmount: 0,
        salaries: []
      };
    }
    
    payrollsMap[key].employeeCount++;
    const totalSalary = (salary.monthlySalary || salary.baseSalary30Days || 0) + (salary.extras || 0);
    payrollsMap[key].totalAmount += totalSalary;
    payrollsMap[key].salaries.push(salary);
  });

  // Convert to array and sort by year/month descending
  const payrolls = Object.values(payrollsMap).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });

  // Render list
  container.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
      <div>
        <h2 class="text-xl sm:text-2xl font-light text-gray-800 mb-1">Nómina Mensual</h2>
        <p class="text-sm text-gray-600">Gestión de nóminas por mes/año</p>
      </div>
      <button id="new-payroll-btn" 
        class="px-4 sm:px-6 py-2 bg-green-600 text-white border border-green-600 hover:bg-green-700 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light">
        Nueva Nómina
      </button>
    </div>

    <div id="payrolls-list" class="space-y-3 sm:space-y-4">
      ${payrolls.length === 0 ? `
        <div class="text-center py-12 border border-gray-200 p-8">
          <p class="text-gray-600 mb-4">No hay nóminas registradas</p>
          <p class="text-xs text-gray-500">Cree una nueva nómina para comenzar</p>
        </div>
      ` : payrolls.map(payroll => `
        <div class="border border-gray-200 p-4 sm:p-6 cursor-pointer hover:border-red-600 transition-colors payroll-item" 
             data-year="${payroll.year}" data-month="${payroll.month}">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div class="flex-1">
              <h3 class="text-lg sm:text-xl font-light text-gray-800 mb-1">
                ${getMonthName(payroll.month)} ${payroll.year}
              </h3>
              <p class="text-sm text-gray-600">
                ${payroll.employeeCount} empleado${payroll.employeeCount !== 1 ? 's' : ''} • 
                Total: ${formatCurrency(Math.round(payroll.totalAmount))}
              </p>
            </div>
            <div class="flex gap-2">
              <span class="px-3 py-1 text-xs uppercase tracking-wider bg-gray-100 text-gray-700">
                ${payroll.salaries.length} salario${payroll.salaries.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // Setup event listeners
  document.getElementById('new-payroll-btn')?.addEventListener('click', () => {
    showPayrollForm();
  });

  document.querySelectorAll('.payroll-item').forEach(item => {
    item.addEventListener('click', () => {
      const year = parseInt(item.dataset.year);
      const month = parseInt(item.dataset.month);
      viewPayrollDetail(year, month);
    });
  });

  currentView = 'list';
}

/**
 * Show payroll form (create new)
 */
async function showPayrollForm(year = null, month = null) {
  const container = document.getElementById('monthly-payroll-content');
  if (!container) return;

  await loadAllData();

  // Get current date if not provided
  const now = new Date();
  const selectedYear = year || now.getFullYear();
  const selectedMonth = month || (now.getMonth() + 1);

  // Load roles to filter out employees with "socio" role
  const nrd = window.nrd;
  let rolesData = {};
  let socioRoleId = null;
  
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
      
      // Find "socio" role ID (case-insensitive)
      socioRoleId = Object.values(rolesData).find(role => 
        role && role.name && role.name.toLowerCase().trim() === 'socio'
      )?.id;
    }
  } catch (error) {
    logger.warn('Error loading roles for filtering', error);
  }

  // Get active employees for the selected year/month (excluding "socio" role)
  const activeEmployees = Object.values(employeesData).filter(emp => {
    if (!emp) return false;
    
    // Exclude if employee has "socio" role
    if (socioRoleId) {
      const roleIds = emp.roleIds || (emp.roleId ? [emp.roleId] : []);
      if (roleIds.includes(socioRoleId)) {
        return false;
      }
    }
    
    // Check if employee was active in this year/month
    const empStartDate = emp.startDate ? new Date(emp.startDate) : null;
    const empEndDate = emp.endDate ? new Date(emp.endDate) : null;
    const payrollDate = new Date(selectedYear, selectedMonth - 1, 1);
    
    if (empStartDate && empStartDate > payrollDate) return false;
    if (empEndDate && empEndDate < payrollDate) return false;
    
    return true;
  });

  // Get existing salaries for this month/year
  const existingSalaries = Object.values(salariesData).filter(s => 
    s.year === selectedYear && s.month === selectedMonth
  );

  // Create a map of existing salaries by employeeId
  const salariesByEmployee = {};
  existingSalaries.forEach(s => {
    if (s.employeeId) salariesByEmployee[s.employeeId] = s;
  });

  container.innerHTML = `
    <div class="mb-4 sm:mb-6">
      <button id="back-to-list-btn" 
        class="mb-4 px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light">
        ← Volver
      </button>
      <h2 class="text-xl sm:text-2xl font-light text-gray-800 mb-1">
        ${year && month ? 'Editar' : 'Nueva'} Nómina - ${getMonthName(selectedMonth)} ${selectedYear}
      </h2>
    </div>

    <form id="payroll-form" class="space-y-4 sm:space-y-6">
      <div class="border border-gray-200 p-4 sm:p-6">
        <h3 class="text-base sm:text-lg font-light text-gray-800 mb-4">Período</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block mb-2 text-xs uppercase tracking-wider text-gray-600">Año</label>
            <input type="number" id="payroll-year" value="${selectedYear}" min="2000" max="2100" required
              class="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-red-600 text-sm sm:text-base">
          </div>
          <div>
            <label class="block mb-2 text-xs uppercase tracking-wider text-gray-600">Mes</label>
            <select id="payroll-month" required
              class="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-red-600 text-sm sm:text-base">
              ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `
                <option value="${m}" ${m === selectedMonth ? 'selected' : ''}>${getMonthName(m)}</option>
              `).join('')}
            </select>
          </div>
        </div>
      </div>

      <div class="border border-gray-200 p-4 sm:p-6">
        <h3 class="text-base sm:text-lg font-light text-gray-800 mb-4">Empleados Activos</h3>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b-2 border-gray-300">
                <th class="text-left py-3 px-4 text-xs uppercase tracking-wider text-gray-600 font-medium">Empleado</th>
                <th class="text-right py-3 px-4 text-xs uppercase tracking-wider text-gray-600 font-medium">Salario Base ($)</th>
                <th class="text-right py-3 px-4 text-xs uppercase tracking-wider text-gray-600 font-medium">Extras ($)</th>
                <th class="text-right py-3 px-4 text-xs uppercase tracking-wider text-gray-600 font-medium">Total ($)</th>
              </tr>
            </thead>
            <tbody>
              ${activeEmployees.length === 0 ? `
                <tr>
                  <td colspan="4" class="text-center py-8 text-sm text-gray-500">No hay empleados activos para este período</td>
                </tr>
              ` : activeEmployees.map(emp => {
                const existingSalary = salariesByEmployee[emp.id];
                const existingBase = existingSalary 
                  ? (existingSalary.monthlySalary || existingSalary.baseSalary30Days || 0)
                  : 0;
                const existingExtras = existingSalary ? (existingSalary.extras || 0) : 0;
                const existingTotal = existingBase + existingExtras;
                
                return `
                  <tr class="border-b border-gray-200 hover:bg-gray-50 employee-salary-row" data-employee-id="${emp.id}">
                    <td class="py-3 px-4 text-sm sm:text-base font-medium text-gray-800">${escapeHtml(emp.name || 'Sin nombre')}</td>
                    <td class="py-3 px-4">
                      <input type="text" 
                        class="employee-base-input w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-red-600 text-sm sm:text-base text-right"
                        value="${existingBase > 0 ? formatDecimalWithComma(Math.round(existingBase)) : ''}"
                        placeholder="0,00"
                        data-employee-id="${emp.id}">
                    </td>
                    <td class="py-3 px-4">
                      <input type="text" 
                        class="employee-extras-input w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-red-600 text-sm sm:text-base text-right"
                        value="${existingExtras > 0 ? formatDecimalWithComma(Math.round(existingExtras)) : ''}"
                        placeholder="0,00"
                        data-employee-id="${emp.id}">
                    </td>
                    <td class="py-3 px-4 text-right text-sm sm:text-base font-medium text-gray-800 employee-total-cell">
                      ${formatCurrency(Math.round(existingTotal))}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="flex gap-3 sm:gap-4">
        <button type="submit" 
          class="flex-1 px-4 sm:px-6 py-2 bg-green-600 text-white border border-green-600 hover:bg-green-700 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light">
          Guardar Nómina
        </button>
        <button type="button" id="cancel-payroll-btn"
          class="px-4 sm:px-6 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light">
          Cancelar
        </button>
      </div>
    </form>
  `;

  // Setup event listeners
  document.getElementById('back-to-list-btn')?.addEventListener('click', () => {
    loadMonthlyPayrolls();
  });

  document.getElementById('cancel-payroll-btn')?.addEventListener('click', () => {
    loadMonthlyPayrolls();
  });

  document.getElementById('payroll-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await savePayroll(year, month);
  });

  // Setup event listeners for base and extras inputs to calculate total
  document.querySelectorAll('.employee-base-input, .employee-extras-input').forEach(input => {
    input.addEventListener('input', () => {
      updateEmployeeTotal(input);
    });
  });

  currentView = 'form';
}

/**
 * Update total cell when base or extras change
 */
function updateEmployeeTotal(input) {
  const employeeId = input.dataset.employeeId;
  const row = input.closest('.employee-salary-row');
  if (!row) return;

  const baseInput = row.querySelector('.employee-base-input');
  const extrasInput = row.querySelector('.employee-extras-input');
  const totalCell = row.querySelector('.employee-total-cell');

  if (!baseInput || !extrasInput || !totalCell) return;

  const base = parseDecimalWithComma(baseInput.value.trim()) || 0;
  const extras = parseDecimalWithComma(extrasInput.value.trim()) || 0;
  const total = base + extras;

  totalCell.textContent = formatCurrency(Math.round(total));
}

/**
 * Save payroll (create/update salaries for all employees)
 */
async function savePayroll(existingYear = null, existingMonth = null) {
  const nrd = window.nrd;
  if (!nrd) {
    await showError('Servicio no disponible');
    return;
  }

  const year = parseInt(document.getElementById('payroll-year').value);
  const month = parseInt(document.getElementById('payroll-month').value);

  if (!year || !month) {
    await showError('Por favor complete año y mes');
    return;
  }

  showSpinner('Guardando nómina...');

  try {
    // Get all employee salary rows
    const salaryRows = document.querySelectorAll('.employee-salary-row');
    const employeesToProcess = [];

    salaryRows.forEach(row => {
      const employeeId = row.dataset.employeeId;
      const baseInput = row.querySelector('.employee-base-input');
      const extrasInput = row.querySelector('.employee-extras-input');
      
      if (!employeeId || !baseInput) return;

      const baseValue = baseInput.value.trim();
      const extrasValue = extrasInput?.value.trim() || '';
      
      if (baseValue) {
        const baseSalary = parseDecimalWithComma(baseValue) || 0;
        const extras = parseDecimalWithComma(extrasValue) || 0;
        const totalSalary = baseSalary + extras;
        
        if (totalSalary > 0) {
          employeesToProcess.push({ employeeId, baseSalary, extras, totalSalary });
        }
      }
    });

    if (employeesToProcess.length === 0) {
      hideSpinner();
      await showError('Debe ingresar al menos un salario');
      return;
    }

    // Get existing salaries for this month/year
    const existingSalaries = Object.values(salariesData).filter(s => 
      s.year === year && s.month === month
    );

    const salariesByEmployee = {};
    existingSalaries.forEach(s => {
      if (s.employeeId) salariesByEmployee[s.employeeId] = s;
    });

    // Process each employee
    for (const { employeeId, baseSalary, extras, totalSalary } of employeesToProcess) {
      const existingSalary = salariesByEmployee[employeeId];
      
      // Determine salary type and calculate values
      // If employee has previous salaries, try to maintain the type
      let salaryType = 'monthly';
      let monthlySalary = baseSalary;
      let baseSalary30Days = baseSalary;
      let dailyWage = baseSalary / 30;

      // Check if employee has previous salaries to determine type
      const employeeSalaries = Object.values(salariesData).filter(s => 
        s.employeeId === employeeId && s.id !== existingSalary?.id
      );
      
      if (employeeSalaries.length > 0) {
        // Use the type from the most recent salary
        const lastSalary = employeeSalaries.sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return b.month - a.month;
        })[0];
        
        if (lastSalary.type === 'daily') {
          salaryType = 'daily';
          dailyWage = baseSalary;
          baseSalary30Days = baseSalary * 30;
          monthlySalary = baseSalary * 30;
        } else {
          salaryType = 'monthly';
          monthlySalary = baseSalary;
          baseSalary30Days = baseSalary;
          dailyWage = baseSalary / 30;
        }
      } else if (existingSalary) {
        // Use existing salary type
        salaryType = existingSalary.type || 'monthly';
        if (salaryType === 'daily') {
          dailyWage = baseSalary;
          baseSalary30Days = baseSalary * 30;
          monthlySalary = baseSalary * 30;
        } else {
          monthlySalary = baseSalary;
          baseSalary30Days = baseSalary;
          dailyWage = baseSalary / 30;
        }
      }

      const salaryData = {
        employeeId,
        year,
        month,
        type: salaryType,
        monthlySalary,
        baseSalary30Days,
        dailyWage,
        extras
      };

      if (existingSalary) {
        // Update existing salary
        await nrd.salaries.update(existingSalary.id, salaryData);
        logger.debug('Updated salary', { employeeId, year, month, type: salaryType });
      } else {
        // Create new salary
        salaryData.createdAt = Date.now();
        await nrd.salaries.create(salaryData);
        logger.debug('Created salary', { employeeId, year, month, type: salaryType });
      }
    }

    // Reload data and return to list
    await loadAllData();
    hideSpinner();
    await showSuccess('Nómina guardada exitosamente');
    await loadMonthlyPayrolls();
  } catch (error) {
    hideSpinner();
    logger.error('Error saving payroll', error);
    await showError('Error al guardar la nómina: ' + (error.message || 'Error desconocido'));
  }
}

/**
 * View payroll detail
 */
async function viewPayrollDetail(year, month) {
  const container = document.getElementById('monthly-payroll-content');
  if (!container) return;

  await loadAllData();

  // Load roles to filter out employees with "socio" role
  const nrd = window.nrd;
  let rolesData = {};
  let socioRoleId = null;
  
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
      
      // Find "socio" role ID (case-insensitive)
      socioRoleId = Object.values(rolesData).find(role => 
        role && role.name && role.name.toLowerCase().trim() === 'socio'
      )?.id;
    }
  } catch (error) {
    logger.warn('Error loading roles for filtering', error);
  }

  // Get all salaries for this month/year (excluding employees with "socio" role)
  const payrollSalaries = Object.values(salariesData).filter(s => {
    if (s.year !== year || s.month !== month) return false;
    
    // Exclude if employee has "socio" role
    if (s.employeeId && socioRoleId) {
      const employee = employeesData[s.employeeId];
      if (employee) {
        const roleIds = employee.roleIds || (employee.roleId ? [employee.roleId] : []);
        if (roleIds.includes(socioRoleId)) {
          return false;
        }
      }
    }
    
    return true;
  });

  // Get employee names (only for non-socio employees)
  const employeeNames = {};
  payrollSalaries.forEach(s => {
    if (s.employeeId && employeesData[s.employeeId]) {
      employeeNames[s.employeeId] = employeesData[s.employeeId].name || 'Sin nombre';
    }
  });

  // Calculate totals
  const totalAmount = payrollSalaries.reduce((sum, s) => {
    return sum + (s.monthlySalary || s.baseSalary30Days || 0) + (s.extras || 0);
  }, 0);

  container.innerHTML = `
    <div class="mb-4 sm:mb-6">
      <h2 class="text-xl sm:text-2xl font-light text-gray-800 mb-1">
        Nómina - ${getMonthName(month)} ${year}
      </h2>
    </div>

    <div class="border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <p class="text-xs uppercase tracking-wider text-gray-600 mb-1">Empleados</p>
          <p class="text-lg sm:text-xl font-light text-gray-800">${payrollSalaries.length}</p>
        </div>
        <div>
          <p class="text-xs uppercase tracking-wider text-gray-600 mb-1">Total</p>
          <p class="text-lg sm:text-xl font-light text-gray-800">${formatCurrency(Math.round(totalAmount))}</p>
        </div>
        <div>
          <p class="text-xs uppercase tracking-wider text-gray-600 mb-1">Período</p>
          <p class="text-lg sm:text-xl font-light text-gray-800">${getMonthName(month)} ${year}</p>
        </div>
      </div>
    </div>

    <div class="border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
      <h3 class="text-base sm:text-lg font-light text-gray-800 mb-4">Detalle de Salarios</h3>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b-2 border-gray-300">
              <th class="text-left py-3 px-4 text-xs uppercase tracking-wider text-gray-600 font-medium">Empleado</th>
              <th class="text-right py-3 px-4 text-xs uppercase tracking-wider text-gray-600 font-medium">Base</th>
              <th class="text-right py-3 px-4 text-xs uppercase tracking-wider text-gray-600 font-medium">Extras</th>
              <th class="text-right py-3 px-4 text-xs uppercase tracking-wider text-gray-600 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            ${payrollSalaries.length === 0 ? `
              <tr>
                <td colspan="4" class="text-center py-8 text-sm text-gray-500">No hay salarios registrados</td>
              </tr>
            ` : payrollSalaries.map(s => {
              const employeeName = employeeNames[s.employeeId] || 'Sin nombre';
              const monthlySalary = s.monthlySalary || s.baseSalary30Days || 0;
              const extras = s.extras || 0;
              const total = monthlySalary + extras;
              
              return `
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td class="py-3 px-4 text-sm sm:text-base font-medium text-gray-800">${escapeHtml(employeeName)}</td>
                  <td class="py-3 px-4 text-right text-sm sm:text-base text-gray-700">${formatCurrency(Math.round(monthlySalary))}</td>
                  <td class="py-3 px-4 text-right text-sm sm:text-base text-gray-700">${formatCurrency(Math.round(extras))}</td>
                  <td class="py-3 px-4 text-right text-sm sm:text-base font-medium text-gray-800">${formatCurrency(Math.round(total))}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
      <button id="edit-payroll-btn" 
        class="w-full px-4 sm:px-6 py-2 bg-blue-600 text-white border border-blue-600 hover:bg-blue-700 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light">
        Editar
      </button>
      <button id="delete-payroll-btn" 
        class="w-full px-4 sm:px-6 py-2 bg-red-600 text-white border border-red-600 hover:bg-red-700 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light">
        Eliminar
      </button>
      <button id="print-payroll-btn" 
        class="w-full px-4 sm:px-6 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light">
        Imprimir
      </button>
      <button id="close-payroll-btn" 
        class="w-full px-4 sm:px-6 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light">
        Cerrar
      </button>
    </div>
  `;

  // Setup event listeners

  document.getElementById('edit-payroll-btn')?.addEventListener('click', () => {
    showPayrollForm(year, month);
  });

  document.getElementById('delete-payroll-btn')?.addEventListener('click', async () => {
    const confirmed = await showConfirm(
      'Eliminar Nómina',
      `¿Está seguro que desea eliminar la nómina de ${getMonthName(month)} ${year}? Esta acción eliminará todos los salarios registrados para este período.`
    );
    
    if (confirmed) {
      await deletePayroll(year, month);
    }
  });

  document.getElementById('print-payroll-btn')?.addEventListener('click', () => {
    window.print();
  });

  document.getElementById('close-payroll-btn')?.addEventListener('click', () => {
    loadMonthlyPayrolls();
  });

  currentView = 'detail';
}

/**
 * Delete payroll (delete all salaries for the month/year)
 */
async function deletePayroll(year, month) {
  const nrd = window.nrd;
  if (!nrd) {
    await showError('Servicio no disponible');
    return;
  }

  showSpinner('Eliminando nómina...');

  try {
    // Get all salaries for this month/year
    const payrollSalaries = Object.values(salariesData).filter(s => 
      s.year === year && s.month === month
    );

    // Delete each salary
    for (const salary of payrollSalaries) {
      if (salary.id) {
        await nrd.salaries.delete(salary.id);
      }
    }

    // Reload data and return to list
    await loadAllData();
    hideSpinner();
    await showSuccess('Nómina eliminada exitosamente');
    await loadMonthlyPayrolls();
  } catch (error) {
    hideSpinner();
    logger.error('Error deleting payroll', error);
    await showError('Error al eliminar la nómina: ' + (error.message || 'Error desconocido'));
  }
}
