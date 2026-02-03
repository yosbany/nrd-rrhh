// Main app controller (ES Module)
// Using NRDCommon from CDN (loaded in index.html)
const logger = window.logger || console;

import { initializeDashboard } from './views/dashboard/dashboard.js';
import { initializePayrollItems } from './views/payroll-items/payroll-items.js';
import { initializeMonthlyPayroll } from './views/monthly-payroll/monthly-payroll.js';

// Setup navigation buttons
function setupNavigationButtons() {
  const navContainer = document.getElementById('app-nav-container');
  if (!navContainer) {
    logger.warn('Navigation container not found');
    return;
  }
  
  navContainer.className = 'bg-white border-b border-gray-200 flex overflow-x-auto';
  
  navContainer.innerHTML = `
    <button class="nav-btn flex-1 px-3 sm:px-4 py-3 sm:py-3.5 border-b-2 border-red-600 text-red-600 bg-red-50 font-medium transition-colors uppercase tracking-wider text-xs sm:text-sm font-light" data-view="dashboard">Dashboard</button>
    <button class="nav-btn flex-1 px-3 sm:px-4 py-3 sm:py-3.5 border-b-2 border-transparent text-gray-600 hover:text-red-600 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light" data-view="payroll-items">Partidas Salariales</button>
    <button class="nav-btn flex-1 px-3 sm:px-4 py-3 sm:py-3.5 border-b-2 border-transparent text-gray-600 hover:text-red-600 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light" data-view="monthly-payroll">Nómina Mensual</button>
  `;
}

// Navigation service will be created when NRDCommon is available
let navigationService = null;

// Function to create and setup navigation service
function createNavigationService() {
  if (navigationService) {
    return navigationService; // Already created
  }
  
  const NavigationService = window.NRDCommon?.NavigationService;
  if (!NavigationService) {
    logger.warn('NavigationService not available in NRDCommon');
    return null;
  }
  
  navigationService = new NavigationService();
  window.navigationService = navigationService;
  
  // Register view handlers
  navigationService.registerView('dashboard', () => {
    if (typeof initializeDashboard === 'function') {
      initializeDashboard();
    }
  });

  navigationService.registerView('payroll-items', () => {
    if (typeof initializePayrollItems === 'function') {
      initializePayrollItems();
    }
  });

  navigationService.registerView('monthly-payroll', () => {
    if (typeof initializeMonthlyPayroll === 'function') {
      initializeMonthlyPayroll();
    }
  });
  
  logger.info('NavigationService created and views registered');
  return navigationService;
}

// Initialize app using NRD Data Access
// Note: AuthService handles showing/hiding app-screen, we just setup navigation
logger.info('app.js loaded, waiting for NRD to be available');

// Wait for window.nrd and NRDCommon to be available (they're initialized in index.html)
function waitForNRDAndInitialize() {
  const maxWait = 10000; // 10 seconds
  const startTime = Date.now();
  const checkInterval = 100; // Check every 100ms
  
  const checkNRD = setInterval(() => {
    const nrd = window.nrd;
    const NRDCommon = window.NRDCommon;
    
    if (nrd && nrd.auth && NRDCommon) {
      clearInterval(checkNRD);
      logger.info('NRD, auth, and NRDCommon available, setting up onAuthStateChanged');
      
      // Create navigation service now that NRDCommon is available
      createNavigationService();
      
      // Also listen to the current auth state immediately
      const currentUser = nrd.auth.getCurrentUser();
      if (currentUser) {
        logger.info('Current user found, initializing immediately', { uid: currentUser.uid, email: currentUser.email });
        initializeAppForUser(currentUser);
      }
      
      nrd.auth.onAuthStateChanged((user) => {
        logger.info('Auth state changed', { hasUser: !!user, uid: user?.uid, email: user?.email });
        if (user) {
          initializeAppForUser(user);
        } else {
          logger.debug('User not authenticated, app initialization skipped');
        }
      });
    } else if (Date.now() - startTime >= maxWait) {
      clearInterval(checkNRD);
      logger.error('NRD, auth, or NRDCommon not available after timeout', { 
        hasNrd: !!nrd, 
        hasAuth: !!(nrd && nrd.auth),
        hasNRDCommon: !!NRDCommon
      });
    }
  }, checkInterval);
}

// Start waiting for NRD and NRDCommon
waitForNRDAndInitialize();

function initializeAppForUser(user) {
  logger.info('Initializing app for user', { uid: user.uid, email: user.email });
  
  // Ensure app-screen is visible (AuthService should have done this, but double-check)
  const appScreen = document.getElementById('app-screen');
  const loginScreen = document.getElementById('login-screen');
  const redirectingScreen = document.getElementById('redirecting-screen');
  
  if (appScreen) {
    appScreen.classList.remove('hidden');
    logger.info('App screen shown');
  }
  if (loginScreen) {
    loginScreen.classList.add('hidden');
  }
  if (redirectingScreen) {
    redirectingScreen.classList.add('hidden');
  }
  
  // Wait a bit for DOM to be ready, then setup navigation
  setTimeout(() => {
    // Create navigation service if not already created
    const navService = createNavigationService();
    if (!navService) {
      logger.error('Could not create NavigationService');
      return;
    }
    
    logger.info('Setting up navigation and switching to dashboard');
    setupNavigationButtons();
    navService.setupNavButtons();
    navService.switchView('dashboard');
    
    // Double-check that app-screen is visible
    const appScreenCheck = document.getElementById('app-screen');
    if (appScreenCheck && appScreenCheck.classList.contains('hidden')) {
      logger.warn('App screen was hidden, showing it now');
      appScreenCheck.classList.remove('hidden');
    }
    
    // Also check that dashboard view is visible
    const dashboardView = document.getElementById('dashboard-view');
    if (dashboardView) {
      if (dashboardView.classList.contains('hidden')) {
        logger.warn('Dashboard view was hidden, showing it now');
        dashboardView.classList.remove('hidden');
      } else {
        logger.info('Dashboard view is visible');
      }
    } else {
      logger.error('Dashboard view element not found');
    }
  }, 300);
}

// AuthService is now initialized in index.html after NRDCommon loads
// This ensures it handles the redirecting screen immediately
// We don't need to initialize it here since it's already done in index.html
