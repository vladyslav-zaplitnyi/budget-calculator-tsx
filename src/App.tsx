import React from 'react';
import BudgetTracker from './components/BudgetTracker';
import { BudgetProvider } from './components/BudgetProvider';
import './App.css';

function App() {
  return (
    <BudgetProvider>
      <BudgetTracker />
    </BudgetProvider>
  );
}

export default App;
