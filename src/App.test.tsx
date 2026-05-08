import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders budget tracker app', () => {
  render(<App />);
  expect(screen.getAllByText(/Бюджетний трекер/i).length).toBeGreaterThan(0);
});
