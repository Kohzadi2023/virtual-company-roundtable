import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { repairMeetingOrchestrationStorage } from './lib/meetingOrchestrationRecovery';
import './index.css';

// Meeting orchestration lives outside the main workspace snapshot and has
// evolved over time. Repair legacy/partial state before any component or
// prompt builder reads it so a stale desktop install cannot crash on render.
repairMeetingOrchestrationStorage();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
