import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { StyledEngineProvider, ThemeProvider, createTheme } from '@mui/material/styles';

const theme = createTheme();

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
    <React.StrictMode>
        {/* Inyecta primero el CSS de MUI para que funcione el contexto de estilos */}
        <StyledEngineProvider injectFirst>
            {/* Provee el tema a todos los componentes MUI */}
            <ThemeProvider theme={theme}>
                <App />
            </ThemeProvider>
        </StyledEngineProvider>
    </React.StrictMode>
);

reportWebVitals();
