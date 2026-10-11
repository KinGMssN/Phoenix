import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { TravelPlanner } from './TravelPlanner';
import './style.css';
import './editor.css';
import { watchSystemTheme } from './theme';
watchSystemTheme();
const Page = location.pathname.startsWith('/travel') ? TravelPlanner : App;
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>,
);
