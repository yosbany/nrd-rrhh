// Utility functions specific to NRD RRHH

/**
 * Check if employee was active (vigente) during a specific year
 * @param {Object} employee - Employee object with startDate and optional endDate
 * @param {number} year - Target year to check
 * @returns {boolean} - True if employee was active during the year
 */
export function isEmployeeActiveInYear(employee, year) {
  if (!employee) return false;
  
  // Normalize year to ensure it's a number
  const targetYear = typeof year === 'number' ? year : parseInt(year);
  if (isNaN(targetYear)) return false;
  
  // CRITICAL: Check startDate - if employee started AFTER the target year, they were NOT active
  // Example: If employee started in 2025 and we're viewing 2024, they should NOT appear
  if (employee.startDate) {
    const startDate = new Date(employee.startDate);
    if (!isNaN(startDate.getTime())) {
      const startYear = startDate.getFullYear();
      // If employee started in a year strictly after the target year, they were not active
      // This means: startYear 2025 > targetYear 2024 → return false (correct)
      if (startYear > targetYear) {
        return false; // Employee started after the target year ended
      }
    }
  }
  
  // CRITICAL: Check endDate - if employee ended in a year BEFORE the target year, they were NOT active
  // Example: If employee ended in 2025 and we're viewing 2026, they should NOT appear
  // This is the key fix: employees with endDate in previous years should NOT appear in future years
  if (employee.endDate) {
    const endDate = new Date(employee.endDate);
    if (!isNaN(endDate.getTime())) {
      const endYear = endDate.getFullYear();
      // If employee ended in a year strictly before the target year, they were not active
      // This means: endYear 2025 < targetYear 2026 → return false (correct)
      // If employee ended in the same year or later, they were active (at least part of the year)
      if (endYear < targetYear) {
        return false; // Employee ended before the target year started
      }
    }
  }
  
  // Employee was active during the year
  // This means: they started before or during the year, and ended during or after the year (or didn't end yet)
  return true;
}

// Export to window for backward compatibility with existing code
if (typeof window !== 'undefined') {
  window.isEmployeeActiveInYear = isEmployeeActiveInYear;
}
