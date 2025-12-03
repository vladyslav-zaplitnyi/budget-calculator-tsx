import React from 'react';
import BudgetTracker from './components/BudgetTracker';
import { BudgetProvider } from './components/BudgetProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import './App.css';

function App() {
  return (
    <ErrorBoundary>
      <BudgetProvider>
        <BudgetTracker />
      </BudgetProvider>
    </ErrorBoundary>
  );
}

export default App;
