import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { TravelPlanner } from './TravelPlanner';
import './style.css';
import './editor.css';
import { watchSystemTheme } from './theme';
watchSystemTheme();
// Make Phoenix the public landing page; keep the OpenDots workspace on its own routes.
const Page = location.pathname === '/' || location.pathname.startsWith('/travel') ? TravelPlanner : App;
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>,
);
