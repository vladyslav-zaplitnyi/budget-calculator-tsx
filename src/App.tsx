import React from 'react';
import BudgetTracker from './components/BudgetTracker';
import { BudgetProvider } from './components/BudgetProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './contexts/ThemeContext';
import './App.css';

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BudgetProvider>
          <BudgetTracker />
        </BudgetProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
