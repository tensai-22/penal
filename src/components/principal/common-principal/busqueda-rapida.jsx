// src/components/common-principal/BusquedaRapida.jsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Modal, Box, TextField, Typography, IconButton, Button,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TableContainer, Table, TableHead, TableRow, TableCell, TableBody, CircularProgress,
  Chip, Tooltip, Stack
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import HistoryIcon from '@mui/icons-material/History';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';

import CloseIcon from '@mui/icons-material/Close';
import { DataGrid, useGridApiRef } from '@mui/x-data-grid';
import { Autocomplete } from '@mui/material';
import debounce from 'lodash.debounce';
import axios from 'axios';

// ⟵ importa tu componente de caso
import Caso from './caso/caso';


import RestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';    // ⟵ NUEVO (icono botón Scan)

import { Paper, Popper } from '@mui/material';
import { usePermisos } from '../../../hooks/usePermisos';
// Estilos para el modal de pantalla completa
const fullScreenModalStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    bgcolor: 'background.paper',
    p: 1,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
};

// Patrones para extraer expediente
const expPattern1 = /(\d{5}-\d{4}-\d{1,2}-\d{4}[A-Z]?-([A-Z]{2})-[A-Z]{2}-\d{1,2})/;
const expPattern2 = /(\d{5}-\d{4}-\d{1,2}-[A-Z\d]+-[A-Z]{2}-[A-Z]{2}-\d{1,2})/;

// Crea patrón flexible para REGEXP
function createFlexiblePattern(expediente) {
    return expediente.replace(
        /(\d{5}-\d{4})-\d+-(\d{4}-[A-Z]{2}-[A-Z]{2}-\d{1,2})/,
        '$1-[0-9]+-$2'
    );
}
// arriba del archivo, junto con imports/consts
const API_BASE_URL = 'http://10.50.5.49:5001/api';



export default function BusquedaRapida({ open, onClose, registro_ppu = "" }) {

    const apiRef = useGridApiRef(); 
    // Estados de filtros y datos
    // Estados de filtros y datos
    const [query, setQuery] = useState('');
    const [origenFilter, setOrigen] = useState('');
    const [deptoFilter, setDepto] = useState('');

    /* ✅ NUEVO: ref + seed/focus al abrir */
    const inputRef = useRef(null);

    useEffect(() => {
        if (!open) return;

        const v = String(registro_ppu ?? "").trim();
        setQuery(v);

        requestAnimationFrame(() => {
            if (inputRef.current) {
                inputRef.current.focus();
                inputRef.current.select?.();
            }
        });
    }, [open, registro_ppu]);

    const [rows, setRows] = useState([]);
    const [editState, setEditState] = useState({ cell: null, value: '' });
const [histModal, setHistModal] = useState({
  open: false, ppu: '', field: '', data: null, progress: 0
});

/* ==== Visor PDF (modal + spinner Chrome) ==== */
const [showPdfModal, setShowPdfModal] = useState(false);
const [pdfUrl, setPdfUrl] = useState('');
const [loadingPdf, setLoadingPdf] = useState(false);
const loadTimerRef = useRef(null);
const lastBlobUrlRef = useRef(null);

/* (Opcional) meta para cabecera del visor */
const [viewerMeta, setViewerMeta] = useState(null);

/* Abrir en nueva pestaña vía Blob */
    const [openingNewTab, setOpeningNewTab] = useState(false);
    const [scanning, setScanning] = useState(false);

    const [historyAvail, setHistoryAvail] = useState({});
    const [historyData, setHistoryData] = useState({});   // «ppu|field» -> detalle
    const [historyProgress, setHistoryProgress] = useState({});  // «ppu|field» -> detalle
    const [modifiedRows, setModifiedRows] = useState([]);
    const fiscClickCountRef = useRef(0);
    const originalJuzgado = useRef({});
    const originalDeps = useRef({});
    const autoFlags = useRef({})
    const containerRef = useRef(null);
    // ─── Hooks de estado y debounce ───
    // Estado para las opciones de fiscalía
    const [fiscOptions, setFiscOptions] = useState([]);

    // Función debounced que llama a tu API de get_fiscalias
    const fetchFiscalias = useMemo(
        () =>
            debounce(async (q) => {
                if (!q.trim()) {
                    setFiscOptions([]);
                    return;
                }
                try {
                    const { data } = await axios.get('/api/get_fiscalias', { params: { query: q } });
                    setFiscOptions(data.data);
                } catch {
                    setFiscOptions([]);
                }
            }, 300),
        []
    );

    const { role, loading } = usePermisos();   // usa tu hook ya importado
    const isAdmin = !loading && role === 'admin';


    // 1) Nuevo handler en mousedown: cierra la edición previa al instante y mueve foco
    const handleCellMouseDown = (params, event) => {
        event.stopPropagation();

        if (editState.editing) {
            // confirmamos la edición pendiente pasando el nuevo valor
            apiRef.current.commitCellChange({
                id: editState.cell.id,
                field: editState.cell.field,
                value: editState.value
            });

            // 2) cerramos la edición sin ignorar modificaciones
            apiRef.current.stopCellEditMode({
                id: editState.cell.id,
                field: editState.cell.field,
                ignoreModifications: false
            });
        }

        apiRef.current.setCellFocus({
            id: params.id,
            field: params.field
        });
        setEditState({ cell: { id: params.id, field: params.field }, value: params.value ?? '', editing: false });
    };

    // 2) Doble click: inicia la edición de la celda
    const handleCellDoubleClick = (params) => {
        if (params.field === 'fiscaliaOrigen') {
            fiscClickCountRef.current = 0;
        }
        apiRef.current.startCellEditMode({
            id: params.id,
            field: params.field
        });
        setEditState({
            cell: { id: params.id, field: params.field },
            value: params.value ?? '',
            editing: true
        });
    };


    // 3) FocusOut: cierra la edición tan pronto la celda pierde foco
    // ── handleCellFocusOut ──
    const handleCellFocusOut = (params) => {
        // 1) // confirmamos el cambio pasando el valor en vivo
        apiRef.current.commitCellChange({
            id: params.id,
            field: params.field,
            value: editState.value
        });

        // 2) cerramos edición permitiendo que commitCellChange se aplique
        apiRef.current.stopCellEditMode({
            id: params.id,
            field: params.field,
            ignoreModifications: false,
            cellToFocusAfter: 'cell'
        });
        setEditState({
            cell: null,
            value: '',
            editing: false
        });
    };
 
    // Mostrar siempre el valor completo al hacer clic

    // Manejo de foco y edición al hacer clic en celdas
    // Dentro de BusquedaRapida…








    // Debounced backend search
    // ⟵ Helper reutilizable para sembrar/normalizar filas desde backend
    const normalizeRowsFromBackend = (dataArray) => {
        return (dataArray || []).map((r, i) => {
            const id = i;

            // Guarda valores originales para resaltado/restore
            Object.keys(r).forEach((field) => {
                const key = `${id}-${field}`;
                if (originalValues.current[key] === undefined) {
                    originalValues.current[key] = r[field];
                }
            });

            // Origen → expediente/caso
            const origenText = r.origen ?? '';
            const startsWithCaso = /^Caso/i.test(origenText.trim());
            const expMatch = startsWithCaso ? null : origenText.match(/Exp\.[^,]*/i);

            const expedienteParte = expMatch ? expMatch[0].trim() : '';
            const resto = origenText.split(/,\s*/).filter(p => !/^Exp\./i.test(p));
            const casoParte = expMatch ? resto.join(', ').trim() : origenText.trim();

            // Guarda originales también de los derivados (para el Popper/restore)
            originalValues.current[`${id}-expedienteParte`] = expedienteParte;
            originalValues.current[`${id}-casoParte`] = casoParte;

            // Fiscalía limpia + despacho
            let despacho = '';
            let fiscaliaLimpia = r.fiscaliaOrigen ?? '';
            const dm = fiscaliaLimpia.match(/\s*-\s*(\d+)\s+DESPACHO$/i);
            if (dm) {
                despacho = dm[1];
                fiscaliaLimpia = fiscaliaLimpia.replace(/\s*-\s*\d+\s+DESPACHO$/i, '').trim();
            }

            // Guarda originales de fiscalía/departamento
            originalDeps.current[`${id}-fiscaliaOrigen`] = r.fiscaliaOrigen;
            originalDeps.current[`${id}-departamento`] = r.departamento;

            return {
                id,
                ...r,
                fiscaliaOrigen: fiscaliaLimpia,
                expedienteParte,
                casoParte,
                despacho,
                _historyFields: []
            };
        });
    };

    // Debounced backend search (usando el helper)
    const debouncedSearch = useMemo(
        () =>
            debounce(async (q, origen, depto) => {
                const qq = String(q || "").trim();
                if (!qq) {
                    setRows([]);
                    return;
                }

                const key = brKey(qq, origen, depto);
                const hit = brCacheRef.current.get(key);
                const now = Date.now();

                if (hit && now - hit.ts < BR_CACHE_TTL_MS) {
                    originalJuzgado.current = {};
                    originalValues.current = {};
                    originalDeps.current = {};
                    setRows(normalizeRowsFromBackend(hit.list || []));
                    return;
                }

                const params = { q: qq };
                if (origen) params.origen = origen;
                if (depto) params.departamento = depto;

                try {
                    const { data } = await axios.get("/api/busqueda_rapida", { params });

                    originalJuzgado.current = {};
                    originalValues.current = {};
                    originalDeps.current = {};

                    const list = Array.isArray(data) ? data : data?.rows || [];
                    brCacheRef.current.set(key, { ts: now, list });

                    if (brCacheRef.current.size > 30) {
                        const firstKey = brCacheRef.current.keys().next().value;
                        brCacheRef.current.delete(firstKey);
                    }

                    setRows(normalizeRowsFromBackend(list));
                } catch {
                    setRows([]);
                }
            }, 300),
        []
    );




    // ⟵ NUEVO: handler que llama a /api/busqueda_rapida_scan y llena la grilla
    const handleScanCarpeta = async () => {
        try {
            setScanning(true);

            // Si tu backend soporta opciones:
            // const body = { move: true, root: '\\\\agarciaf\\NOTIFICACIONES RENIEC\\MESA DE PARTES\\Correo\\A pasar' };
            const body = { move: true };
            const { data } = await axios.post('/api/busqueda_rapida_scan', body);

            // Reinicia caches antes de sembrar nuevas filas
            originalJuzgado.current = {};
            originalValues.current = {};
            originalDeps.current = {};

            // El backend puede retornar { rows: [...] } o directamente un array
            const rowsIn = Array.isArray(data) ? data : (data.rows || []);
            setRows(normalizeRowsFromBackend(rowsIn));

            // (Opcional) feedback de conteos si tu API los devuelve
            if (data?.scanned_count != null) {
                const found = data?.ppus_count ?? data?.found_count ?? rowsIn.length;
                const moved = data?.moved_count ?? 0;
                console.log(`Escaneados: ${data.scanned_count} | PPUs: ${found} | Movidos: ${moved}`);
            }
        } catch (e) {
            console.error('Fallo el escaneo', e);
            alert('No se pudo completar el escaneo.');
        } finally {
            setScanning(false);
        }
    };


    useEffect(() => {
        debouncedSearch(query, origenFilter, deptoFilter);
    }, [query, origenFilter, deptoFilter, debouncedSearch]);

    /* 1️⃣  clave memoizada que SÓLO cambia cuando cambia la lista de PPUs */
    const rowKey = useMemo(() =>
        rows.map(r => r.registro_ppu).join('|'),
        [rows]
    );

    useEffect(() => {
        if (!rows.length) return;

        const ppus = rows.map(r => r.registro_ppu);

        axios.post('/api/busqueda_rapida_history_available_bulk', ppus)
            .then(async ({ data }) => {
                setHistoryAvail(data);

                const initProg = {};
                const initCache = {};

                Object.entries(data).forEach(([ppu, fields]) => {
                    fields.forEach(field => {
                        const key = `${ppu}|${field}`;
                        if (historyProgress[key] === undefined) initProg[key] = 0;   // 0 %
                        if (historyData[key] === undefined) initCache[key] = undefined;
                    });
                });

                if (Object.keys(initProg).length) setHistoryProgress(p => ({ ...p, ...initProg }));
                if (Object.keys(initCache).length) setHistoryData(p => ({ ...p, ...initCache }));

                /* 2️⃣  sólo actualiza la fila si cambió _historyFields */
                setRows(rs => {
                    let changed = false;
                    const next = rs.map(row => {
                        const fresh = data[row.registro_ppu] || [];
                        const same =
                            fresh.length === row._historyFields.length &&
                            fresh.every((v, i) => v === row._historyFields[i]);

                        if (same) return row;        // mantiene referencia → no dispara efecto
                        changed = true;
                        return { ...row, _historyFields: fresh };
                    });
                    return changed ? next : rs;
                });
            })
            .catch(() => { /* silenciar error si falla */ });
    }, [rowKey]);     
  

    // Handlers de filtros
    const handleChangeQuery = e => setQuery(e.target.value);
    const handleChangeOrigen = e => setOrigen(e.target.value);
    const handleChangeDepto = e => setDepto(e.target.value);

    // Cierra modal y reinicia todo
    const BR_CACHE_TTL_MS = 5 * 60 * 1000;
    const brCacheRef = useRef(
        globalThis.__PPU_BR_SEARCH_CACHE__ ||
        (globalThis.__PPU_BR_SEARCH_CACHE__ = new Map())
    );

    const brKey = (q, origen, depto) =>
        `${String(q || "").trim().toUpperCase()}|${String(origen || "")
            .trim()
            .toUpperCase()}|${String(depto || "").trim().toUpperCase()}`;

    const resetBusqueda = () => {
        setQuery("");
        setOrigen("");
        setDepto("");
        setRows([]);
        setEditState({ cell: null, value: "", editing: false });
        originalJuzgado.current = {};
        originalValues.current = {};
        originalDeps.current = {};
    };

    const handleClose = () => {
        onClose();
        setEditState((p) => ({ ...p, editing: false }));
    };


    // Se dispara al entrar en modo edición
    const handleCellEditStart = params => {
        if (params.field === 'origen' && originalJuzgado.current[params.id] === undefined) {
            originalJuzgado.current[params.id] = params.row.juzgado ?? '';
        }
        if (params.field === 'fiscaliaOrigen' || params.field === 'departamento')
            autoFlags.current[`${params.id}-fisc`] = false;
    };

    const originalValues = useRef({});



    // Normaliza cada valor para ignorar prefijos y sufijos al comparar
    const normalizeCell = (field, val = '') => {
        if (val == null) return '';
        const s = String(val).trim();
        if (field === 'expedienteParte') return s.replace(/^Exp\.\s*/i, '');
        if (field === 'casoParte') return s.replace(/^caso\s*/i, '');
        if (field === 'fiscaliaOrigen') return s.replace(/\s*-\s*\d+\s+DESPACHO$/i, '');
        return s;
    };


    
const parseFecha = (s) => {
  if (!s || typeof s !== 'string') return null;
  const [fecha, hora = '00:00:00'] = s.trim().split(/\s+/);
  // Detecta formato por la primera parte
  // Caso 1: DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(fecha)) {
    const [dd, mm, yyyy] = fecha.split('-').map(Number);
    const [HH, MM, SS] = hora.split(':').map(Number);
    const t = new Date(yyyy, mm - 1, dd, HH || 0, MM || 0, SS || 0).getTime();
    return Number.isNaN(t) ? null : t;
  }
  // Caso 2: YYYY-MM-DD (o si viene ya ISO-like)
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const [yyyy, mm, dd] = fecha.split('-').map(Number);
    const [HH, MM, SS] = hora.split(':').map(Number);
    const t = new Date(yyyy, mm - 1, dd, HH || 0, MM || 0, SS || 0).getTime();
    return Number.isNaN(t) ? null : t;
  }
  // Último intento: remplaza espacio por 'T' y delega
  const isoish = s.replace(' ', 'T');
  const t = Date.parse(isoish);
  return Number.isNaN(t) ? null : t;
};

/* ==== helpers visor PDF (modal) ==== */
const isChromeBrowser = () => {
  const ua = navigator.userAgent || '';
  return ua.includes('Chrome') && !ua.includes('Edg/') && !ua.includes('OPR/');
};

const revokeLastBlobUrl = () => {
  if (lastBlobUrlRef.current) {
    URL.revokeObjectURL(lastBlobUrlRef.current);
    lastBlobUrlRef.current = null;
  }
};

/* Abre visor con una RUTA (UNC o absoluta de servidor) */
/* helpers visor PDF */
const openPdfFromRuta = (ruta, meta = null) => {
  const url = `${API_BASE_URL}/open_pdf_by_ruta?ruta=${encodeURIComponent(ruta)}`; // ⟵ URL ABSOLUTA AL BACKEND
  setPdfUrl(url);
  setViewerMeta(meta || null);
  setShowPdfModal(true);

  if (isChromeBrowser()) {
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    loadTimerRef.current = setTimeout(() => setLoadingPdf(true), 700);
  } else {
    setLoadingPdf(false);
  }
};


const closePdfViewer = () => {
  setShowPdfModal(false);
  setPdfUrl('');
  setViewerMeta(null);
  setLoadingPdf(false);
  revokeLastBlobUrl();
  if (loadTimerRef.current) {
    clearTimeout(loadTimerRef.current);
    loadTimerRef.current = null;
  }
};

const handleIframeLoad = () => {
  if (loadTimerRef.current) {
    clearTimeout(loadTimerRef.current);
    loadTimerRef.current = null;
  }
  setLoadingPdf(false);
};

const handleIframeError = () => {
  if (loadTimerRef.current) {
    clearTimeout(loadTimerRef.current);
    loadTimerRef.current = null;
  }
  setLoadingPdf(false);
  console.error('No se pudo cargar el PDF en iframe; abriendo en nueva pestaña.');
  // ⬇ Esto ya lo tienes implementado
  openInNewTabViaBlob();
};


const openInNewTabViaBlob = async () => {
  try {
    setOpeningNewTab(true);
    const resp = await fetch(pdfUrl, { credentials: 'include' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const buf = await resp.arrayBuffer();

    const blob = new Blob([buf], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    revokeLastBlobUrl();
    lastBlobUrlRef.current = blobUrl;
    window.open(blobUrl, '_blank', 'noopener,noreferrer');
  } catch (e) {
    console.error('Error abriendo en nueva pestaña:', e);
  } finally {
    setOpeningNewTab(false);
  }
};

/* Limpieza al desmontar */
useEffect(() => {
  return () => {
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    revokeLastBlobUrl();
  };
}, []);

    const handleProcessRowUpdate = (newRow, oldRow) => {
        const id = newRow.id;

        // ⇣  NUEVO – garantiza que siempre conozcamos el Juzgado original
        if (originalJuzgado.current[id] === undefined) {
            originalJuzgado.current[id] = oldRow.juzgado ?? '';
        }

        // ——— 1) Autocompletar “juzgado” SÓLO si el origen cambió ———
        const origenCambio =
            newRow.origen !== oldRow.origen ||
            newRow.expedienteParte !== oldRow.expedienteParte ||
            newRow.casoParte !== oldRow.casoParte;

        if (origenCambio) {
            const origen = newRow.origen?.trim() ?? '';
            const originalJ = originalJuzgado.current[id] ?? oldRow.juzgado ?? '';

            if (!originalJuzgado.current[id]) {
                originalJuzgado.current[id] = originalJ;
            }

            const matchExp = expPattern1.exec(origen) || expPattern2.exec(origen);

            if (matchExp) {
                const flexPat = createFlexiblePattern(matchExp[1]);

                axios
                    .get('/api/juzgado_incompleto', { params: { pattern: flexPat } })
                    .then(({ data }) => {
                        const sugerido = data[0]?.juzgado_incompleto ?? originalJ;

                        apiRef.current.updateRows([{ id, juzgado: sugerido }]);
                        setRows(prev =>
                            prev.map(r => (r.id === id ? { ...r, juzgado: sugerido } : r))
                        );
                        // 👆 YA NO se pisa el valor guardado en originalJuzgado
                        autoFlags.current[`${id}-juzgado`] = true;
                    })
                    .catch(() => {
                        apiRef.current.updateRows([{ id, juzgado: originalJ }]);
                        setRows(prev =>
                            prev.map(r => (r.id === id ? { ...r, juzgado: originalJ } : r))
                        );
                    });

            } else {
                // si el usuario dejó vacío expedienteParte → vuelve al juzgado original
                if ((newRow.expedienteParte ?? '').trim() === '') {
                    newRow.juzgado = originalJ;          // ← ❶ valor correcto EN la fila que se devuelve
                }
                autoFlags.current[`${id}-juzgado`] = false;
            }
        }

        // ——— 2) “Caso Fiscal completo” + fiscalía/depto en background ———
        const prevExp = oldRow.nr_de_exp_completo?.trim() ?? '';
        const originalExp = originalValues.current[`${id}-nr_de_exp_completo`] ?? '';
        const rawExp = newRow.nr_de_exp_completo?.trim() ?? '';
        const origF = originalDeps.current[`${id}-fiscaliaOrigen`] ?? '';
        const origD = originalDeps.current[`${id}-departamento`] ?? '';

        if (rawExp !== prevExp) {
            if (!rawExp || rawExp.toUpperCase() === 'NA') {
                if (autoFlags.current[`${id}-fisc`]) {
                    newRow.nr_de_exp_completo = '';
                    newRow.fiscaliaOrigen = origF;
                    newRow.departamento = origD;
                    autoFlags.current[`${id}-fisc`] = false;
                }
            } else {
                if (rawExp === originalExp && prevExp === originalExp) return newRow;

                const numMatch = rawExp.match(/\d{6,10}/);
                if (numMatch) {
                    const code = numMatch[0];
                    const casoText = apiRef.current.getCellValue(id, 'casoParte')?.trim() ?? '';

                    const m = /(\d+)-(\d{4})/.exec(casoText);
                    const fullExp = m
                        ? `${code}-${m[2]}-${m[1]}-0`
                        : rawExp;

                    newRow.nr_de_exp_completo = fullExp;
                    newRow.fiscaliaOrigen = origF;
                    newRow.departamento = origD;

                    axios
                        .get('/api/fiscalia_incompleto', { params: { pattern: code } })
                        .then(({ data }) => {
                            const item = data[0] || {};
                            const f = item.fiscalia ?? origF;
                            const d = item.departamento ?? origD;

                            apiRef.current.updateRows([{ id, fiscaliaOrigen: f, departamento: d }]);
                            setRows(prev =>
                                prev.map(r =>
                                    r.id === id ? { ...r, fiscaliaOrigen: f, departamento: d } : r
                                )
                            );
                            originalDeps.current[`${id}-fiscaliaOrigen`] = f;
                            originalDeps.current[`${id}-departamento`] = d;
                            autoFlags.current[`${id}-fisc`] = true;   // marcado como autocompletado
                        })
                        .catch(() => {
                            apiRef.current.updateRows([{ id, fiscaliaOrigen: origF, departamento: origD }]);
                            setRows(prev =>
                                prev.map(r =>
                                    r.id === id ? { ...r, fiscaliaOrigen: origF, departamento: origD } : r
                                )
                            );
                        });
                } else if (autoFlags.current[`${id}-fisc`]) {
                    newRow.nr_de_exp_completo = '';
                    newRow.fiscaliaOrigen = origF;
                    newRow.departamento = origD;
                    autoFlags.current[`${id}-fisc`] = false;
                }
            }
        }

        // ——— 3) Recalcular 'origen' preservando “CASO” si ya estaba en `origen` ———
        // ——— 3) Recalcular 'origen' preservando “CASO” si ya estaba en `origen` ———
        const expPart = newRow.expedienteParte?.trim() ?? '';
        const casoPart = newRow.casoParte?.trim() ?? '';

        // 🔥 NUEVO — Abre el popup siempre que CASO cambie
        if (newRow.casoParte !== oldRow.casoParte) {
            setCasoDialog({
                open: true,
                row: newRow,
            });
        }

        const parts = [];

        if (expPart) parts.push(expPart.startsWith('Exp.') ? expPart : `Exp. ${expPart}`);

        if (casoPart) {
            const cambioCaso = newRow.casoParte !== oldRow.casoParte;
            const teniaCasoEnOrigenAntes = /(^|,\s*)CASO\s/i.test((oldRow.origen ?? '').trim());
            const limpio = casoPart.replace(/^caso\s*/i, '').trim();

            if (cambioCaso) {
                if (limpio) parts.push(`CASO ${limpio}`);
            } else {
                if (teniaCasoEnOrigenAntes) {
                    if (limpio) parts.push(`CASO ${limpio}`);
                } else if (limpio) {
                    parts.push(limpio);
                }
            }
        }
        newRow.origen = parts.join(', ');
        setModifiedRows(prev => (prev.includes(id) ? prev : [...prev, id]));
        setRows(prev => prev.map(r => (r.id === id ? { ...newRow } : r)));

        return newRow;
    };
// Reemplaza tu cmpDesc por este:
const isActualRow = (r) =>
  String(r?.usuario_modificacion || '').trim() === '(actual)' || Number(r?.version_id) === 0;

const cmpDesc = (a, b) => {
  // 0) Prioriza "Actual" al tope
  const aIs = isActualRow(a);
  const bIs = isActualRow(b);
  if (aIs && !bIs) return -1;
  if (!aIs && bIs) return 1;

  // 1) Luego por fecha (desc)
  const tb = parseFecha(b?.fecha_version);
  const ta = parseFecha(a?.fecha_version);
  if (tb != null && ta != null && tb !== ta) return tb - ta;

  // 2) Luego por version_id (desc)
  const vb = Number(b?.version_id);
  const va = Number(a?.version_id);
  if (!Number.isNaN(vb) && !Number.isNaN(va) && vb !== va) return vb - va;

  // 3) Opcional: "sistema" después de usuarios humanos
  const ua = String(a?.usuario_modificacion || '').toLowerCase();
  const ub = String(b?.usuario_modificacion || '').toLowerCase();
  if (ua !== ub) {
    if (ua === 'sistema') return 1;
    if (ub === 'sistema') return -1;
  }
  return 0;
};



    // Nuevo handleSync: lee todas las filas y las envía al backend
    const handleSync = async () => {
        /* 0) si alguna celda sigue editándose, ciérrala de forma “nativa” */
        if (editState.editing && editState.cell) {
            const { id, field } = editState.cell;

            // cierra la edición ⇒ ejecuta valueSetter + processRowUpdate
            apiRef.current.stopCellEditMode({ id, field, ignoreModifications: false });

            // espera a que el commit asíncrono actualice la fila
            await new Promise((r) => setTimeout(r, 0));
        }

        console.log('======= ENVÍO DE SINCRONIZACIÓN =======');

        /* 1) todas las filas actuales del grid */
        const rowModels = Array.from(apiRef.current.getRowModels().values());

        /* 2) payload con los campos que tu backend espera */
        const payload = rowModels.map((row) => {
            // --- 1) Partes del origen para sync: conserva “CASO” si estaba en `origen` ---
            const exp = (row.expedienteParte ?? '').trim();
            const casoRaw = (row.casoParte ?? '').trim();
            const teniaCasoEnOrigen = /(^|,\s*)CASO\s/i.test((row.origen ?? '').trim());
            const casoForSync = casoRaw
                ? (teniaCasoEnOrigen
                    ? (/^caso\s/i.test(casoRaw) ? casoRaw : `CASO ${casoRaw}`)
                    : casoRaw)
                : '';
            let origen = '';

            if (exp && casoForSync) origen = `${exp}, ${casoForSync}`;
            else if (exp) origen = exp;
            else if (casoForSync) origen = casoForSync;

            // --- 2) Fiscalía + despacho (si hay número) ---
            const numDespacho = parseInt(row.despacho ?? 0, 10);
            const fiscaliaSync = numDespacho > 0
                ? `${row.fiscaliaOrigen} - ${numDespacho} DESPACHO`
                : (row.fiscaliaOrigen ?? '');

            // --- 3) Objeto final ---
      
            return {
                registroPpu: row.registro_ppu ?? '',
                abogado: row.abogado ?? '',
                denunciado: row.denunciado ?? '',
                origen,
                juzgado: row.juzgado ?? '',
                departamento: row.departamento ?? '',
                nrDeExpCompleto: row.nr_de_exp_completo ?? '',
                fiscaliaOrigen: fiscaliaSync,
                delito: row.delito ?? '',
                eSituacional: row.e_situacional ?? '',
                etiqueta: row.etiqueta ?? '',                 // 👈 ahora sí se envía
                informeJuridico: row.informeJuridico ?? '',   // opcional
                item: row.item ?? '',                         // opcional
                fechaIngreso: row.fechaIngreso ?? null,        // opcional (backend normaliza fecha)
                 razonArchivo: row.razonArchivo ?? ''
            };

        });

        /* 3) POST al backend + refresco de historial para los PPUs realmente modificados */
        try {
            const { data: resp } = await axios.post('/api/busqueda_rapida_sync', payload);
            alert(`Registros actualizados: ${resp.updated.join(', ')}`);
            rowModels.forEach((row) => {
                Object.keys(row).forEach((f) => {
                    originalValues.current[`${row.id}-${f}`] = row[f];
                });
                originalDeps.current[`${row.id}-fiscaliaOrigen`] = row.fiscaliaOrigen;
                originalDeps.current[`${row.id}-departamento`] = row.departamento;
                originalJuzgado.current[row.id] = row.juzgado;   // guarda el nuevo “original” del juzgado
            });

            // Fuerza re-render de todas las filas para que se recalcule getCellClassName
            // y se elimine el resaltado también en columnas extra seleccionables.
            setRows(prev => prev.map(r => ({ ...r })));

            /* si el backend devuelve qué PPUs tuvieron cambios de versión… */
            const updatedPPUs = resp.updated || [];
            if (updatedPPUs.length) {
                /* …pedimos en UN solo request los campos con historial para esos PPUs */
                axios
                    .post('/api/busqueda_rapida_history_available_bulk', updatedPPUs)
                    .then(({ data: fresh }) => {
                        // 1) actualiza caché global
                        setHistoryAvail(prev => ({ ...prev, ...fresh }));

                        /* ----  invalidate  historyData / historyProgress  ---- */
                        Object.entries(fresh).forEach(([ppu, fields]) => {
                            fields.forEach(field => {
                                const k = `${ppu}|${field}`;
                                delete historyDataRef.current[k];      // borra caché en el ref
                            });
                        });

                        setHistoryData(prev => {
                            const next = { ...prev };
                            Object.entries(fresh).forEach(([ppu, fields]) => {
                                fields.forEach(field => delete next[`${ppu}|${field}`]);
                            });
                            return next;                             // react-state sin los viejos detalles
                        });

                        setHistoryProgress(prev => {
                            const next = { ...prev };
                            Object.entries(fresh).forEach(([ppu, fields]) => {
                                fields.forEach(field => delete next[`${ppu}|${field}`]);
                            });
                            return next;                             // reinicia la barra de progreso
                        });

                        /* 2) injerta _historyFields … (tal y como estaba) */
                        setRows(rs => rs.map(row =>
                            updatedPPUs.includes(row.registro_ppu)
                                ? { ...row, _historyFields: fresh[row.registro_ppu] || [] }
                                : row
                        ));
                    })
                    .catch(() => { /* opcional: silenciar error */ });
            }
        } catch (error) {
            console.error('Error al sincronizar cambios:', error);
            alert('Error al sincronizar cambios');
        }
    };


    // --- helper: editor flotante ----------------------------------------
    function EditPopper({ params, children, width = 420 }) {
        const { api, id, field } = params;
        const [anchorEl, setAnchorEl] = React.useState(null);

        // localiza el <div> de la celda para anclar el Popper
        React.useEffect(() => {
            setAnchorEl(api.getCellElement(id, field));
        }, [api, id, field]);

        if (!anchorEl) return null; // mientras no exista la celda original

        return (
            <Popper
                open
                anchorEl={anchorEl}
                placement="bottom-start"
                modifiers={[{ name: 'offset', options: { offset: [0, 4] } }]}
                style={{ zIndex: 2000 }}          // sobre todo lo demás
            >
                <Paper sx={{ p: 1, width, maxWidth: '90vw', boxShadow: 6 }}>
                    {children}
                </Paper>
            </Popper>
        );
    }


    // justo debajo de tu const handleSync = …
    // ───── editor con Popper que NO cierra al restaurar ─────
    const renderWithRestore = (params) => {
        const { id, field, value, api } = params;

        // valores originales
        const key = `${id}-${field}`;
        const original = originalValues.current[key] ?? '';
        const origExp = originalValues.current[`${id}-expedienteParte`] ?? '';
        const origCaso = (originalValues.current[`${id}-casoParte`] ?? '')
            .replace(/^caso\s*/i, '').trim();

        // restaurar sin provocar blur → seguimos en edición
        const restore = (e, val) => {
            e.stopPropagation();
            e.preventDefault();           // ← evita que el foco salga del TextField
            api.setEditCellValue({ id, field, value: val }, e);
            setEditState(p => ({ ...p, value: val }));
            // ¡y listo! (el modo edición nunca se perdió)
        };

        // enter = guardar; esc = cancelar
        const handleKeyDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // ← evita salto de celda
                e.stopPropagation(); // ← evita que el grid procese la tecla
                api.setEditCellValue({ id, field, value: e.target.value }, e);
                api.stopCellEditMode({ id, field, ignoreModifications: false });
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                api.stopCellEditMode({ id, field, ignoreModifications: true });
            }
        };


        const inner = (
            <Box
                onMouseDown={e => e.stopPropagation()}
                onDoubleClick={e => e.stopPropagation()}
                sx={{ display: 'flex', alignItems: 'center', width: '100%' }}
            >
                <TextField
                    autoFocus
                    multiline
                    minRows={3}
                    maxRows={8}
                    variant="outlined"
                    size="small"
                    value={value}
                    sx={{ flex: '1 1 auto', minWidth: 0 }}
                    onFocus={e => e.target.select()}
                    onChange={(e) => {
                        const v = e.target.value;
                        api.setEditCellValue({ id, field, value: v }, e);
                        setEditState(p => ({ ...p, value: v }));
                    }}
                    onKeyDown={handleKeyDown}
                />

                {/* botón restaurar: usa ONLY onMouseDown */}
                <IconButton
                    size="small"
                    tabIndex={-1}
                    disableRipple
                    disableFocusRipple
                    sx={{ ml: 0.5, flexShrink: 0 }}
                    onMouseDown={(e) => {
                        const val =
                            field === 'expedienteParte' ? origExp :
                                field === 'casoParte' ? origCaso :
                                    original;
                        restore(e, val);
                    }}
                >
                    <RestoreIcon fontSize="small" />
                </IconButton>
            </Box>
        );

        return (
            <EditPopper params={params} width={480}>
                {inner}
            </EditPopper>
        );
    };





    /* ====== columnas extra: ocultas por defecto; activables bajo demanda ====== */
    const [extraCols, setExtraCols] = useState([]);
    const [columnVisibilityModel, setColumnVisibilityModel] = useState({
        nr_de_exp_completo: false,   // 👈 Caso Fiscal completo oculto por defecto
        despacho: false,             // 👈 Despacho oculto por defecto
        informeJuridico: false,
        item: false,
        fechaIngreso: false,
        etiqueta: false,
        fechaDeArchivo: false,
        razonArchivo: false,
    });


    // ⟵ NUEVO: diálogo externo para editar CASO
    const [casoDialog, setCasoDialog] = useState({
        open: false,
        row: null,
    });


    /* opciones para el selector */
    const EXTRA_OPTIONS = [
        { field: 'nr_de_exp_completo', label: 'Caso Fiscal completo' }, // 👈 PRIMERO
        { field: 'despacho', label: 'Despacho' },                       // 👈 SEGUNDO
        { field: 'informeJuridico', label: 'Informe jurídico' },
        { field: 'item', label: 'Item' },
        { field: 'fechaIngreso', label: 'Fecha ingreso' },
        { field: 'etiqueta', label: 'Etiqueta' },
        { field: 'fechaDeArchivo', label: 'Fecha archivo' },
        { field: 'razonArchivo', label: 'Razón de archivo' },
    ];

    /* definiciones de columnas extra (simples; sin ensanchar la grilla) */
    const EXTRA_COLUMNS = [
        {
            field: 'nr_de_exp_completo',
            headerName: 'Caso Fiscal completo',
            width: 220,
            editable: true,
            renderCell: (p) => withHistoryButton(
                p,
                (q) => <Typography>{q.value}</Typography>
            ),
            renderEditCell: (p) => withHistoryButton(p, renderWithRestore),
        },
        {
            field: 'despacho',
            headerName: 'Desp.',
            width: 90,
            type: 'number',
            headerAlign: 'center',
            align: 'center',
            editable: true,
            renderEditCell: renderWithRestore,
        },
        { field: 'informeJuridico', headerName: 'Informe jurídico', width: 180, editable: true, renderEditCell: renderWithRestore },
        { field: 'item', headerName: 'Item', width: 110, editable: true, renderEditCell: renderWithRestore },
        { field: 'fechaIngreso', headerName: 'F. ingreso', width: 120, editable: true, renderEditCell: renderWithRestore },
        { field: 'etiqueta', headerName: 'Etiqueta', width: 100, editable: true, renderEditCell: renderWithRestore },
        { field: 'fechaDeArchivo', headerName: 'F. archivo', width: 130, editable: false },
        { field: 'razonArchivo', headerName: 'Razón archivo', width: 100, editable: true, renderEditCell: renderWithRestore },
    ];




    // Columnas con filtros inline
    // Luego, tu definición completa de columnas:
    // Dentro de BusquedaRapida, reemplaza tu definición de `columns` por esta:
    // Columnas con filtros inline
    const columns = useMemo(() => [



        {
            field: 'abogado',
            headerName: 'Abogado',
            flex: 0.89,
            editable: true,
            /* botón “ⓘ” si hay historial */
            renderCell: p => withHistoryButton(
                p,
                q => <Typography>{q.value}</Typography>
            ),
            renderEditCell: p => withHistoryButton(p, renderWithRestore)
        },
        {
            field: 'registro_ppu',
            headerName: 'PPU',
            flex: 1,
            sortable: true,
            renderCell: (params) => {
                const row = params.row;

                // --- construimos el mismo "origen" que usabas en el botón ---
                // --- "origen" para copiar: respeta si ya había “CASO” en `origen` ---
                const exp = (row.expedienteParte ?? '').trim();
                const casoRaw = (row.casoParte ?? '').trim();
                const teniaCasoEnOrigen = /(^|,\s*)CASO\s/i.test((row.origen ?? '').trim());
                const casoForCopy = casoRaw
                    ? (teniaCasoEnOrigen
                        ? (/^caso\s/i.test(casoRaw) ? casoRaw : `CASO ${casoRaw}`)
                        : casoRaw)
                    : '';

                let origen = '';
                if (exp && casoForCopy) origen = `${exp}, ${casoForCopy}`;
                else if (exp) origen = exp;
                else if (casoForCopy) origen = casoForCopy;

                const textoACopiar = `${row.abogado ?? ''} ${row.registro_ppu ?? ''} ${origen}`.trim();

                const handleCopy = (e) => {
                    // evita que el grid intente enfocar/seleccionar
                    e.stopPropagation();
                    // intenta clipboard; si falla, usa prompt como antes
                    const doPrompt = () => prompt('❗ Copia manualmente este texto:', textoACopiar);
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(textoACopiar).catch(doPrompt);
                    } else {
                        doPrompt();
                    }
                };

                return (
                    <Typography
                        component="span"
                        onClick={handleCopy}
                        onDoubleClick={handleCopy}   // opcional: también con doble clic
                        sx={{
                            cursor: 'pointer',
                            color: 'primary.main',
                            textDecoration: 'underline',
                            '&:hover': { opacity: 0.85 }
                        }}
                        title="Click para copiar"
                    >
                        {params.value}
                    </Typography>
                );
            },
        },

        {
            field: 'denunciado',
            headerName: 'Denunciado',
            flex: 1.2,
            editable: true,
            renderCell: p => withHistoryButton(
                p,
                q => <Typography>{q.value}</Typography>
            ),
            renderEditCell: p => withHistoryButton(p, renderWithRestore)
        },
        // ---------- Parte "Expediente" de origen ----------
        {
            field: 'expedienteParte',
            headerName: 'Expediente',
            flex: 1,
            editable: true,

            // 👇 AHORA LEE LO QUE ESTÁ EN LA FILA (lo que cambia el popup)
            valueGetter: (params) => {
                const v = (params.row.expedienteParte || '').trim();
                if (!v) return '';
                return v.startsWith('Exp.') ? v : `Exp. ${v}`;
            },

            // 👇 SE MANTIENE la lógica para cuando EDITAS EN LA GRILLA
            valueSetter: params => {
                const origen = params.row.origen || '';
                const raw = (params.value || '').trim();

                const m = expPattern1.exec(raw) || expPattern2.exec(raw);
                if (!m) {
                    const resto = origen
                        .split(/,\s*/)
                        .filter(p => !/^Exp\./i.test(p));
                    return {
                        ...params.row,
                        origen: resto.join(', '),
                        expedienteParte: ''
                    };
                }

                const code = m[1];
                const nuevaExp = code.startsWith('Exp.') ? code : `Exp. ${code}`;
                const resto = origen
                    .split(/,\s*/)
                    .filter(p => !/^Exp\./i.test(p));

                return {
                    ...params.row,
                    origen: [nuevaExp, ...resto].filter(Boolean).join(', '),
                    expedienteParte: nuevaExp
                };
            },

            renderEditCell: renderWithRestore
        },


        // ---------- Parte "Caso" de origen ----------
        {
            field: 'casoParte',
            headerName: 'Caso',
            flex: 1,
            editable: true,

            // 👇 AHORA MUESTRA DIRECTO LO QUE GUARDA LA FILA
            valueGetter: (params) => {
                const v = (params.row.casoParte || '').trim();
                if (!v) return '';
                return v.toUpperCase().startsWith('CASO') ? v : `CASO ${v}`;
            },


            // 👇 SE MANTIENE la lógica para mantener `origen` en sync cuando editas en la grilla
            valueSetter: params => {
                const origen = params.row.origen ?? '';

                const resto = origen
                    .split(/,\s*/)
                    .filter(p => !/^CASO/i.test(p));

                const rawOriginal = params.value?.trim() || '';
                const rawSinPref = rawOriginal.replace(/^caso\s*/i, '').trim();

                const parts = [];
                const expPart = origen.match(/Exp\.[^,]*/i)?.[0]?.trim();
                if (expPart) parts.push(expPart);
                if (rawSinPref) parts.push(`CASO ${rawSinPref}`);

                return {
                    ...params.row,
                    origen: parts.join(', '),
                    casoParte: rawSinPref
                };
            },

            renderEditCell: renderWithRestore
        },

       
        // ----- Fiscalía original, renombrada -----
        {
            field: 'fiscaliaOrigen',
            headerName: 'Fiscalía origen',
            width: 237,
            minWidth: 237,
            headerAlign: 'center',
            align: 'center',
            editable: true,
            renderCell: (params) => {
                // ¿trae historial este campo para la fila?
                const showInfo = (params.row._historyFields || [])
                    .includes('fiscaliaOrigen');

                return (
                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        {/* contenido de la celda */}
                        <Typography
                            sx={{ flexGrow: 1, whiteSpace: 'normal', wordBreak: 'break-word' }}
                        >
                            {params.value}
                        </Typography>

                        {/* botón ⓘ solo si hay historial */}
                        {showInfo && (
                            <IconButton
                                size="small"
                                sx={{ ml: .5 }}
                                onClick={(e) => {
                                    e.stopPropagation();                // evita selección
                                    fetchHistory(
                                        params.row.registro_ppu,         // clave de la fila
                                        'fiscaliaOrigen'                 // campo consultado
                                    );
                                }}
                            >
                                <InfoIcon fontSize="inherit" />
                            </IconButton>
                        )}
                    </Box>
                );
            },

            renderEditCell: (params) => {
                const { id, value, api, row } = params;

                /* ――― Valores originales guardados ――― */
                const originalF = originalDeps.current[`${id}-fiscaliaOrigen`] ?? '';
                const originalD = originalDeps.current[`${id}-departamento`] ?? '';
                const originalExp = originalValues.current[`${id}-nr_de_exp_completo`] ?? '';

                /* Restaurar los tres campos a sus valores iniciales */
                const handleRestore = (e) => {
                    e.stopPropagation();
                    api.updateRows([{
                        id,
                        fiscaliaOrigen: originalF,
                        departamento: originalD,
                        nr_de_exp_completo: originalExp
                    }]);
                    api.stopCellEditMode({
                        id,
                        field: 'fiscaliaOrigen',
                        ignoreModifications: true
                    });
                };

                return (
                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        {/* ──────── AUTOCOMPLETE ──────── */}
                        <Autocomplete
                            freeSolo
                            openOnFocus
                            options={fiscOptions}
                            getOptionLabel={(opt) =>
                                typeof opt === 'string' ? opt : opt.fiscalia
                            }
                            /* Mantén igualdad de opción/valor para evitar warnings */
                            isOptionEqualToValue={(opt, val) =>
                                (typeof opt === 'string' ? opt : opt.fiscalia) ===
                                (typeof val === 'string' ? val : val?.fiscalia)
                            }
                            inputValue={value || ''}
                            onInputChange={(_, newInput, reason) => {
                                if (reason === 'input') fetchFiscalias(newInput);

                                api.setEditCellValue({
                                    id,
                                    field: 'fiscaliaOrigen',
                                    value: newInput,
                                });
                                setEditState((prev) => ({ ...prev, value: newInput }));
                            }}
                            onChange={(_, sel) => {
                                /* 1️⃣ – valores finales */
                                const nuevaF =
                                    sel && typeof sel !== 'string' ? sel.fiscalia : originalF;
                                const nuevaD =
                                    sel && typeof sel !== 'string' ? sel.departamento : originalD;

                                /* 2️⃣ – posible nr_de_exp_completo */
                                const rawExp =
                                    sel && typeof sel !== 'string'
                                        ? sel.nr_de_exp_completo || ''
                                        : '';

                                /* 3️⃣ – texto del caso (sin “caso ”) */
                                const casoLimpio = (row.casoParte || '')
                                    .replace(/^caso\s*/i, '')
                                    .trim();

                                /* 4️⃣ – construir nr_de_exp_completo */
                                let fullExp = originalExp;
                                if (rawExp) {
                                    if (/^\d+$/.test(rawExp)) {
                                        const m = /^(\d+)-(\d{4})$/.exec(casoLimpio);
                                        fullExp = m ? `${rawExp}-${m[2]}-${m[1]}-0` : rawExp;
                                    } else {
                                        fullExp = rawExp;
                                    }
                                } else {
                                    const m = /^(\d+)-(\d{4})$/.exec(casoLimpio);
                                    if (m) fullExp = `${m[1]}-${m[2]}-${m[1]}-0`;
                                }

                                /* 5️⃣ – aplicar cambios y cerrar edición */
                                api.setEditCellValue({
                                    id,
                                    field: 'fiscaliaOrigen',
                                    value: nuevaF,
                                });
                                api.updateRows([
                                    {
                                        id,
                                        fiscaliaOrigen: nuevaF,
                                        departamento: nuevaD,
                                        nr_de_exp_completo: fullExp,
                                    },
                                ]);
                                api.stopCellEditMode({ id, field: 'fiscaliaOrigen' });
                            }}
                            renderInput={(p) => (
                                <TextField
                                    {...p}
                                    autoFocus
                                    placeholder="Busca fiscalía…"
                                    size="small"
                                />
                            )}
                            sx={{ flex: '1 1 auto', minWidth: 0 }}
                            /* Deja el portal por defecto, solo sube el z-index */
                            PopperProps={{
                                sx: { zIndex: 2000 },
                            }}
                        />

                        {/* ──────── BOTÓN RESTAURAR ──────── */}
                        <IconButton
                            size="small"
                            sx={{ ml: 0.5, flexShrink: 0 }}
                            onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                            }}
                            onClick={handleRestore}
                        >
                            <RestoreIcon fontSize="small" />
                        </IconButton>
                    </Box>
                );
            }
        }
,



        /* ─── columnas que SÍ deben mostrar el botón ⓘ ─── */
        {
            field: 'departamento',
            headerName: 'Depto.',
            flex: 1,
            editable: true,
            renderHeader: () => (
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="caption">Depto.</Typography>
                    <TextField
                        variant="standard"
                        placeholder="filtrar…"
                        value={deptoFilter}
                        onChange={handleChangeDepto}
                        InputProps={{
                            disableUnderline: true,
                            style: { fontSize: '0.75rem', lineHeight: 1 }
                        }}
                    />
                </Box>
            ),
            /* ⓘ historial */
            renderCell: p => withHistoryButton(p, q => <Typography>{q.value}</Typography>),
            renderEditCell: p => withHistoryButton(p, renderWithRestore)
        },
        {
            field: 'juzgado',
            headerName: 'Juzgado',
            flex: 1,
            editable: true,
            renderCell: p => withHistoryButton(p, q => <Typography>{q.value}</Typography>),
            renderEditCell: p => withHistoryButton(p, renderWithRestore)
        },
        {
            field: 'delito',
            headerName: 'Delito',
            flex: 1,
            editable: true,
            renderCell: p => withHistoryButton(p, q => <Typography>{q.value}</Typography>),
            renderEditCell: p => withHistoryButton(p, renderWithRestore)
        },
        {
            field: 'e_situacional',
            headerName: 'Situación',
            flex: 1,
            editable: true,
            renderCell: p => withHistoryButton(p, q => <Typography>{q.value}</Typography>),
            renderEditCell: p => withHistoryButton(p, renderWithRestore)
        },
  // 👇 Aquí agregas todas las columnas extra que definiste arriba
  ...EXTRA_COLUMNS
    ], [deptoFilter, fiscOptions]);




    const closeHist = () =>
        setHistModal({ open: false, ppu: '', field: '', data: [] });
    // ─── 1. añade este ref junto a tus otros estados ───
    const historyDataRef = useRef({});

    // y sincronízalo cada vez que cambie el estado
    useEffect(() => {
        historyDataRef.current = historyData;
    }, [historyData]);
    /* trae el detalle de un campo */
    /* ───────── fetchHistory: muestra el % solo en el diálogo ───────── */
    const fetchHistory = async (ppu, field) => {
    const key = `${ppu}|${field}`;
    const cached = historyDataRef.current[key];



    /* 1️⃣ – Ya tenemos el resultado final: ordenar y mostrar */
    if (Array.isArray(cached)) {
        const sorted = [...cached].sort(cmpDesc);
        // actualiza el cache para mantener orden consistente en re-aperturas
        historyDataRef.current[key] = sorted;
        setHistoryData(p => ({ ...p, [key]: sorted }));
        setHistModal({ open: true, ppu, field, data: sorted, progress: 100 });
        return;
    }

    /* 2️⃣ – Descarga en curso: solo re-abre el diálogo */
    if (cached === null) {
        setHistModal({
            open: true,
            ppu,
            field,
            data: null,
            progress: historyProgress[key] ?? 10
        });
        return;
    }

    /* 3️⃣ – Primera vez: marca “loading” */
    historyDataRef.current[key] = null;
    setHistoryData(prev => ({ ...prev, [key]: null }));
    setHistoryProgress(prev => ({ ...prev, [key]: 10 }));
    setHistModal({ open: true, ppu, field, data: null, progress: 10 });

    /* 4️⃣ – Petición al backend */
    try {
        const { data } = await axios.get('/api/busqueda_rapida_history', {
            params: { ppu, field },
            onDownloadProgress: () => {
                setHistoryProgress(p => ({ ...p, [key]: 50 }));
                setHistModal(m => ({ ...m, progress: 50 }));
            }
        });

        const detalle = data.data || [];
        const sorted = [...detalle].sort(cmpDesc);

        // ✅ NADA de “Actualidad”, ni _ruta ni _isActualidad: sólo lo que da el backend
        historyDataRef.current[key] = sorted;
        setHistoryData(p => ({ ...p, [key]: sorted }));
        setHistoryProgress(p => ({ ...p, [key]: 100 }));
        setHistModal({ open: true, ppu, field, data: sorted, progress: 100 });

  } catch (err) {
    console.error('Error al cargar historial:', err);
    historyDataRef.current[key] = [];
    setHistoryData(p => ({ ...p, [key]: [] }));
    setHistoryProgress(p => ({ ...p, [key]: 100 }));
    setHistModal({ open: true, ppu, field, data: [], progress: 100 });
  }
}; // ✅ CIERRA const fetchHistory = async (ppu, field) => { ... }

/* dibuja la celda + botón “ⓘ” si hay historial */




    /* dibuja la celda + botón “ⓘ” si hay historial */
    // ────────────────────────────────────────────────────────────────
    // Envuelve la celda y decide si muestra el icono de historial ⓘ
    // – Muestra ⓘ solo si:
    //     1) la fila/columna tiene historial         (_historyFields)
    //     2) la celda está en modo "view" (no "edit")
    // ────────────────────────────────────────────────────────────────
    const withHistoryButton = (params, defaultRenderer) => {
        /* datos de la fila */
        const { _historyFields = [] } = params.row;
        const field = params.field;
        const id = params.id;

        /* ¿la celda está editándose ahora mismo? */
        const isEditing =
            apiRef.current.getCellMode(id, field) === 'edit';

        /* solo mostramos ⓘ si hay historial Y no está en edición */
      const showInfo =
  !isEditing &&
  (
    _historyFields.includes(field) ||
    (field === 'e_situacional' && (params.value ?? '').toString().trim() !== '')
  );


        return (
            <Box
                sx={{
                    position: 'relative',
                    width: '100%'
                }}
            >
                <Box
                    sx={{
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                        overflow: 'visible',
                        pr: 3
                    }}
                >
                    {defaultRenderer(params)}
                </Box>

                {showInfo && (
                    <IconButton
                        size="small"
                        sx={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            m: 0.5
                        }}
                        tabIndex={-1}
                        onKeyDown={e => e.stopPropagation()}
                        onClick={e => {
                            e.stopPropagation();
                            fetchHistory(params.row.registro_ppu, field);
                        }}
                    >
                        <InfoIcon fontSize="inherit" />
                    </IconButton>
                )}
            </Box>
        );
    };



        // Título de la columna de detalle en el modal de historial
const headerDetalle = useMemo(() => {
  if (histModal.field === 'e_situacional') return 'Situación / Resolución';
  // busca el headerName desde las columnas del DataGrid
  const col = (columns || []).find(c => c.field === histModal.field);
  if (col?.headerName) return col.headerName;
  // fallback: formatea el nombre del campo
  const f = (histModal.field || 'Valor').replace(/_/g, ' ');
  return f.replace(/\b\w/g, (m) => m.toUpperCase());
}, [histModal.field, columns]);



    return (
        <Modal open={open} onClose={handleClose}>
            <Box sx={fullScreenModalStyle} ref={containerRef} tabIndex={0}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Typography variant="h6" sx={{ flexShrink: 0 }}>Búsqueda Rápida</Typography>
                    <TextField
                        inputRef={inputRef}
                        placeholder="Registro PPU"
                        value={query}
                        onChange={handleChangeQuery}
                        size="small"
                        sx={{ flex: 1 }}
                    />


                    {/* Selector dinámico de columnas extra (no afecta estructura base) */}
                    <Autocomplete
                        multiple
                        size="small"
                        disableCloseOnSelect
                        options={EXTRA_OPTIONS}
                        getOptionLabel={(o) => o.label}
                        value={EXTRA_OPTIONS.filter(o => extraCols.includes(o.field))}
                        onChange={(_, vals) => {
                            const fields = vals.map(v => v.field);
                            const withPair = fields.includes('etiqueta')
                                ? Array.from(new Set([...fields, 'razonArchivo']))
                                : fields;
                            setExtraCols(withPair);
                            /* sincroniza visibilidad: etiqueta fuerza también razónArchivo */
                            const next = { ...columnVisibilityModel };
                            EXTRA_OPTIONS.forEach(({ field }) => { next[field] = withPair.includes(field); });
                            setColumnVisibilityModel(next);
                        }}
                        renderInput={(params) => (
                            <TextField {...params} placeholder="Agregar columnas puntuales…" />
                        )}
                        sx={{ minWidth: 280 }}
                    />
                    {/* ⟵ NUEVO: Botón de escaneo (admin) */}
                    {isAdmin && (
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<ManageSearchIcon />}
                            onClick={handleScanCarpeta}
                            disabled={scanning}
                        >
                            {scanning ? 'Escaneando…' : 'Escanear carpeta'}
                        </Button>
                    )}

                    {isAdmin && (
                        <Button variant="contained" size="small" onClick={handleSync}>
                            Sincronizar
                        </Button>
                    )}
                    <IconButton size="small" onClick={handleClose}><CloseIcon /></IconButton>
                </Box>



                {/* ================================================================ */}
                {/*  CONTENEDOR COMPLETO CON DISEÑO Y MÁRGENES – Copia / pega tal cual */}
                {/* ================================================================ */}

                <Box sx={{ flex: 1, minHeight: 0, px: 1, pb: 2 /* ← márgenes exteriores */ }}>
                    {/* ---------- “tarjeta” que envuelve al DataGrid ---------- */}
                    <Paper
                        elevation={3}
                        sx={{
                            height: '100%',
                            borderRadius: 3,
                            overflow: 'hidden',
                            border: (t) => `1px solid ${t.palette.divider}`,
                        }}
                    >
                        <DataGrid
                            rowHeight={60}
                            headerHeight={50}
                            apiRef={apiRef}
                            getCellClassName={(p) =>
                                normalizeCell(p.field, p.value) !==
                                    normalizeCell(p.field, originalValues.current[`${p.id}-${p.field}`])
                                    ? 'dg-modified'
                                    : ''
                            }
                            rows={rows}
                            columns={columns}
                            /* visibilidad dinámica de columnas extra */
                            columnVisibilityModel={columnVisibilityModel}
                            onColumnVisibilityModelChange={(m) => setColumnVisibilityModel(m)}
                            editMode="cell"
                            /* ⬇⬇⬇ SOLO los admin pueden editar, y solo si la columna es editable */
                            isCellEditable={(params) => {
                                if (!isAdmin) return false;
                                const col = apiRef.current.getColumn(params.field);
                                return !!col?.editable;
                            }}
                            processRowUpdate={handleProcessRowUpdate}
                            onCellMouseDown={handleCellMouseDown}
                            onCellFocusOut={handleCellFocusOut}
                            /* ---------- estado de edición en vivo ---------- */
                            onStateChange={(state) => {
                                const focused = state.focus;
                                if (focused.cell) {
                                    const { id, field } = focused.cell;
                                    const mode = apiRef.current.getCellMode(id, field);
                                    const value = apiRef.current.getCellValue(id, field);
                                    setEditState({
                                        cell: { id, field },
                                        value: value ?? '',
                                        editing: mode === 'edit',
                                    });
                                } else {
                                    setEditState({ cell: null, value: '', editing: false });
                                }
                            }}
                            /* ---------- click: foco / commit ---------- */
                            onCellClick={(params, event) => {
                                if (!isAdmin) return;                  // ⬅ corta cualquier intento de edición
                                const { id, field } = params;
                                const mode = apiRef.current.getCellMode(id, field);
                                const colDef = apiRef.current.getColumn(field);
                                if (!colDef.editable) return;

                                if (mode !== 'edit') {
                                    setEditState({
                                        cell: { id, field },
                                        value: params.value ?? '',
                                        editing: false,
                                    });
                                    return;
                                }

                                if (field === 'fiscaliaOrigen' && event.detail === 2) {
                                    apiRef.current.setEditCellValue({ id, field, value: editState.value }, event);
                                    apiRef.current.stopCellEditMode({ id, field, ignoreModifications: false });
                                } else if (field !== 'fiscaliaOrigen') {
                                    apiRef.current.setEditCellValue({
                                        id: editState.cell.id,
                                        field: editState.cell.field,
                                        value: editState.value,
                                    }, event);
                                    apiRef.current.stopCellEditMode({
                                        id: editState.cell.id,
                                        field: editState.cell.field,
                                        ignoreModifications: false,
                                    });
                                }

                                setEditState({
                                    cell: { id: params.id, field: params.field },
                                    value: params.value ?? '',
                                    editing: false,
                                });
                            }}
                            /* ---------- doble-click: comenzar edición ---------- */
                            onCellDoubleClick={(params, event) => {
                                if (!isAdmin) return;
                                event.stopPropagation();

                                // ⟵ SI ES LA COLUMNA CASO, ABRIMOS EL DIÁLOGO Y NO ENTRAMOS EN EDICIÓN DE CELDA
                                if (params.field === 'casoParte') {
                                    setCasoDialog({
                                        open: true,
                                        row: params.row,   // toda la fila actual
                                    });
                                    return;
                                }

                                const mode = apiRef.current.getCellMode(params.id, params.field);
                                const colDef = apiRef.current.getColumn(params.field);
                                if (mode === 'view' && colDef.editable) {
                                    apiRef.current.startCellEditMode({
                                        id: params.id,
                                        field: params.field,
                                    });
                                }
                                setEditState({
                                    cell: { id: params.id, field: params.field },
                                    value: params.value ?? '',
                                    editing: true,
                                });
                            }}

                            /* ---------- detener edición ---------- */
                            onCellEditStop={(params) => {
                                apiRef.current.stopCellEditMode({
                                    id: params.id,
                                    field: params.field,
                                });
                                setEditState((prev) => ({ ...prev, editing: false }));
                            }}
                            experimentalFeatures={{ newEditingApi: true }}
                            columnGroupingModel={[
                                {
                                    groupId: 'origenGroup',
                                    headerName: 'Origen',
                                    children: [
                                        { field: 'juzgado' },
                                        { field: 'fiscaliaOrigen' },
                                    ],
                                },
                            ]}
                            hideFooter
                            disableSelectionOnClick
                            /* ==================================================== */
                            /*  ESTILOS – se mantienen los tuyos + mejoras visuales */
                            /* ==================================================== */
                            sx={{
                                /* ===== CABECERA AZUL + TEXTO BLANCO ===== */
                                '& .MuiDataGrid-columnHeaders, & .MuiDataGrid-columnHeader': {
                                    backgroundColor: '#0D47A1',   // azul oscuro
                                    color: '#fff',
                                },
                                '& .MuiDataGrid-columnHeaderTitle': {
                                    color: '#fff',
                                    fontWeight: 700,
                                    whiteSpace: 'normal',
                                    lineHeight: 1.1,
                                },
                                '& .MuiDataGrid-sortIcon, & .MuiDataGrid-filterIcon, & .MuiDataGrid-menuIcon': {
                                    color: '#fff',
                                    opacity: 1,
                                },
                                '& .MuiDataGrid-columnHeaders': {
                                    borderBottom: '2px solid #082B6B', // línea inferior combinada
                                },
                                '& .MuiDataGrid-columnHeader': {
                                    borderRight: '1px solid #082B6B',
                                    '&:last-of-type': { borderRight: 'none' },
                                },

                                /* ===== FILAS ZEBRA + HOVER ===== */
                                '& .MuiDataGrid-row:nth-of-type(odd)': {
                                    backgroundColor: (t) =>
                                        t.palette.mode === 'light'
                                            ? t.palette.grey[50]
                                            : t.palette.grey[900],
                                },
                                '& .MuiDataGrid-row:hover': {
                                    backgroundColor: (t) => t.palette.action.hover,
                                },

                                /* ===== BORDES COMPLETOS ===== */
                                '& .MuiDataGrid-cell, & .MuiDataGrid-editCell': {
                                    borderRight: '1px solid #000',
                                    borderBottom: '1px solid #000',
                                    '&:last-of-type': { borderRight: 'none' }
                                },
                                '& .MuiDataGrid-row:last-of-type .MuiDataGrid-cell': {
                                    borderBottom: '1px solid #000'
                                },

                                /* ===== CELDAS (modo vista) ===== */
                                '& .MuiDataGrid-cell': {
                                    display: 'flex',
                                    alignItems: 'flex-start!important',
                                    padding: '8px 12px!important',
                                    lineHeight: '1.2!important',
                                    whiteSpace: 'normal!important',
                                    wordBreak: 'break-word',
                                    fontSize: '0.87rem',
                                },
                                '& .MuiDataGrid-cell .MuiTypography-root': {
                                    fontSize: 'inherit',
                                },

                                /* ===== CELDAS EN EDICIÓN ===== */
                                '& .MuiDataGrid-cell--editing': {
                                    display: 'flex',
                                    alignItems: 'center',
                                    overflow: 'visible',
                                    position: 'relative',
                                    zIndex: 1,
                                },
                                '& .MuiDataGrid-cell--editing .MuiInputBase-root': {
                                    flex: '1 1 auto',
                                    minWidth: 80,
                                    paddingRight: '10px!important',
                                },
                                '& .MuiDataGrid-cell--editing .MuiIconButton-root': {
                                    flexShrink: 0,
                                    marginLeft: 0.5,
                                },

                                /* ===== ANCHOS ESPECÍFICOS ===== */
                                '& .MuiDataGrid-cell[data-field="fiscaliaOrigen"].MuiDataGrid-cell--editing': {
                                    width: '600px!important',
                                },
                                '& .MuiDataGrid-cell[data-field="nr_de_exp_completo"].MuiDataGrid-cell--editing': {
                                    width: '600px!important',
                                },
                                '& .MuiDataGrid-cell[data-field="denunciado"      ].MuiDataGrid-cell--editing, \
.MuiDataGrid-cell[data-field="abogado"         ].MuiDataGrid-cell--editing, \
.MuiDataGrid-cell[data-field="expedienteParte" ].MuiDataGrid-cell--editing, \
.MuiDataGrid-cell[data-field="casoParte"       ].MuiDataGrid-cell--editing, \
.MuiDataGrid-cell[data-field="despacho"        ].MuiDataGrid-cell--editing, \
.MuiDataGrid-cell[data-field="juzgado"         ].MuiDataGrid-cell--editing, \
.MuiDataGrid-cell[data-field="delito"          ].MuiDataGrid-cell--editing, \
.MuiDataGrid-cell[data-field="departamento"    ].MuiDataGrid-cell--editing': {
                                    width: '500px!important',
                                },

                                /* —— resalte celdas modificadas —— */
                                '& .dg-modified': {
                                    backgroundColor: '#fff7d6!important'
                                },
                            }}
                        />

                    </Paper>

                    {/* -------------------------------------------------------- */}
                    {/*            DIÁLOGO DE HISTORIAL (sin cambios)            */}
                    {/* -------------------------------------------------------- */}
<Dialog
  open={histModal.open}
  onClose={closeHist}
  fullWidth
  maxWidth="lg"
  keepMounted
  transitionDuration={0}
  PaperProps={{
    sx: {
      width: 'min(100vw - 48px, 980px)',      // ⬅ aprovecha mejor el ancho de pantalla
      maxHeight: 'calc(100vh - 64px)',
      borderRadius: 2,
      overflow: 'hidden'
    }
  }}
>

<DialogTitle
  sx={{
    display: 'flex', alignItems: 'center', gap: 1,
    bgcolor: (t) => t.palette.mode === 'light' ? t.palette.grey[100] : t.palette.grey[900],
    borderBottom: (t) => `1px solid ${t.palette.divider}`
  }}
>
  {histModal.progress < 100 ? (
    <Stack direction="row" spacing={1} alignItems="center">
      <CircularProgress size={22} variant="determinate" value={histModal.progress} />
      <Typography variant="body2">{`${Math.round(histModal.progress)} %`}</Typography>
    </Stack>
  ) : (
    <Stack direction="row" spacing={1} alignItems="center">
      <HistoryIcon fontSize="small" />
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        Historial — {histModal.field === 'e_situacional' ? 'Situación procesal' : histModal.field}
      </Typography>
      <Typography variant="body2" sx={{ opacity: .8 }}>
        · PPU <strong>{histModal.ppu}</strong>
      </Typography>
    </Stack>
  )}
</DialogTitle>


<DialogContent
  dividers
  sx={{
    p: 0,
    overflowY: 'auto',                         // ⬅ solo scroll vertical
    overflowX: 'hidden',                       // ⬅ NO scroll horizontal
    maxHeight: 'calc(100vh - 180px)',
    '& table': {
      tableLayout: 'fixed',                    // ⬅ columnas fijas → sin “bailes”
      width: '100%'                            // ⬅ ocupa todo el ancho disponible
    },
    '& td, & th': {
      wordBreak: 'break-word',
      whiteSpace: 'normal',
      overflowWrap: 'anywhere'                 // ⬅ evita desbordes por textos largos
    }
  }}
>
    {histModal.data === null ? (
        <Typography variant="body2" sx={{ py: 2 }}>
            Cargando…
        </Typography>
    ) : Array.isArray(histModal.data) && histModal.data.length ? (
<TableContainer
  sx={{
    borderRadius: 2,
    border: (t) => `1px solid ${t.palette.divider}`,
    maxWidth: '100%',              // ⬅ no más ancho que el diálogo
    overflowX: 'hidden'            // ⬅ bloquea scroll horizontal del contenedor
  }}
>
  <Table size="small" stickyHeader aria-label="Historial de cambios">

<TableHead>
  <TableRow
    sx={{
      '& th': {
        // ✅ usa 'background' (o 'backgroundImage'), NO 'bgcolor'
        background: (t) =>
          t.palette.mode === 'light'
            ? 'linear-gradient(180deg, #0D47A1 0%, #08306B 100%)'
            : 'linear-gradient(180deg, #1565c0 0%, #0d47a1 100%)',
        color: '#fff',
        fontWeight: 800,
        letterSpacing: .2,
        borderBottom: 'none',
        py: 1.1,
        position: 'sticky',   // extra por si acaso
        top: 0,               // pega el header arriba (con stickyHeader)
        zIndex: 2
      }
    }}
  >

    {/* ≈ 12% */}
    <TableCell sx={{ width: 120, minWidth: 110 }}>Estado</TableCell>
    {/* ≈ 48–60% (flexible) */}
<TableCell sx={{ minWidth: 360 }}>{headerDetalle}</TableCell>

    {/* ≈ 15% */}
    <TableCell sx={{ width: 180, minWidth: 160 }}>Fecha y hora</TableCell>
    {/* ≈ 15% */}
    <TableCell sx={{ width: 180, minWidth: 150 }}>Registrado por</TableCell>
    {/* ≈ 12% (si aplica) */}
    {histModal.field === 'e_situacional' && (
      <TableCell sx={{ width: 130, minWidth: 120 }} align="center">Documento PDF</TableCell>
    )}
  </TableRow>
</TableHead>


  <TableBody>
  {(histModal.data || []).slice().sort(cmpDesc).map((r, idx) => {
    const isActual =
      String(r?.usuario_modificacion || '').trim() === '(actual)' || r?.version_id === 0;
    const canOpen = !!r?.ruta;

    return (
      <TableRow
        key={`${r.version_id}-${idx}`}
        hover
        sx={{
          transition: 'background 120ms ease, transform 120ms ease',
          '&:hover': { backgroundColor: (t) => t.palette.action.hover },
          '&:nth-of-type(odd)': {
            backgroundColor: (t) =>
              t.palette.mode === 'light' ? t.palette.grey[50] : t.palette.grey[900]
          },
          ...(isActual ? {
            boxShadow: (t) => `inset 0 0 0 1px ${t.palette.success.light}`,
            '& td:first-of-type .MuiChip-root': {
              boxShadow: (t) => `0 0 0 1px ${t.palette.success.main} inset`
            },
          } : {})
        }}
      >
        <TableCell sx={{ verticalAlign: 'top', pt: 1.25 }}>
          {isActual ? (
            <Chip
              icon={<CheckCircleIcon />}
              label="Actual"
              color="success"
              size="small"
              sx={{ fontWeight: 700 }}
            />
          ) : (
            <Chip
              label={`v${r.version_id ?? '?'}`}
              size="small"
              variant="outlined"
              sx={{
                fontWeight: 700,
                borderColor: (t) => t.palette.primary.main,
                color: (t) => t.palette.primary.main,
              }}
            />
          )}
        </TableCell>

        <TableCell sx={{ py: 1.25 }}>
          <Typography
            variant="body2"
            sx={{
              whiteSpace: 'pre-wrap',
              lineHeight: 1.25,
              '& b, & strong': { fontWeight: 700 }
            }}
          >
            {r.old_value}
          </Typography>
        </TableCell>

        <TableCell sx={{ fontVariantNumeric: 'tabular-nums', py: 1.25 }}>
          <Typography variant="body2">{r.fecha_version}</Typography>
        </TableCell>

        <TableCell sx={{ py: 1.25 }}>
          <Typography variant="body2">
            {r.usuario_modificacion}
          </Typography>
        </TableCell>

        {histModal.field === 'e_situacional' && (
          <TableCell align="center" sx={{ py: 1.25 }}>
            {canOpen ? (
              <Tooltip title="Abrir documento PDF">
                <span>
                  <IconButton
                    color="secondary"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      const rowByPPU = rows.find(x => x.registro_ppu === histModal.ppu);
                      openPdfFromRuta(r.ruta, {
                        abogado: rowByPPU?.abogado ?? 'N.A',
                        registro_ppu: histModal.ppu || 'N.A',
                        demandante: rowByPPU?.denunciante ?? rowByPPU?.demandante ?? 'N.A',
                        origen: rowByPPU?.origen ?? histModal.field ?? 'N.A',
                        fecha_hora: r.fecha_version || 'N.A',
                      });
                    }}
                    sx={{
                      bgcolor: (t) => t.palette.secondary.light,
                      color: '#fff',
                      '&:hover': { bgcolor: (t) => t.palette.secondary.main }
                    }}
                  >
                    <PictureAsPdfIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            ) : (
              <Typography variant="caption" color="text.secondary">—</Typography>
            )}
          </TableCell>
        )}
      </TableRow>
    );
  })}
</TableBody>
  </Table>
</TableContainer>

    ) : (
<Typography variant="body2" sx={{ py: 2, color: 'text.secondary' }}>
  {histModal.field === 'e_situacional'
    ? 'Sin movimientos registrados. Cuando exista, verás aquí el valor actual y sus resoluciones previas.'
    : 'No se registran cambios para este campo respecto al valor actual.'}
</Typography>

    )}
</DialogContent>


                        <DialogActions>
                            <Button onClick={closeHist}>Cerrar</Button>
                        </DialogActions>
                    </Dialog>
                </Box>

                {editState.cell && (
                    <Box sx={{ mt: 2, flex: '0 0 auto' }}>
                        <Typography variant="subtitle2">
                            Valor completo de {editState.cell.field} (en vivo)
                        </Typography>
                        <TextField
                            fullWidth
                            multiline
                            rows={3}
                            value={editState.value}
                            onChange={(e) => {
                                const val = e.target.value;
                                setEditState(prev => ({ ...prev, value: val }));
                            }}
                            disabled
                            sx={{
                                '& .MuiInputBase-inputMultiline': {
                                    overflow: 'auto',
                                    maxHeight: 160,               // límite visual estable
                                    whiteSpace: 'pre-wrap',
                                }
                            }}
                        />
                    </Box>
                )}

                <Box sx={{
                    position: 'sticky',
                    bottom: 0,
                    bgcolor: 'background.paper',
                    py: 1,
                    textAlign: 'right',
                    borderTop: theme => `1px solid ${theme.palette.divider}`
                }}>
                    <Button variant="outlined" onClick={handleClose}>Cancelar</Button>
                </Box>
                {/* ===== Modal visor PDF ===== */}
{showPdfModal && (
  <Dialog
    open={showPdfModal}
    onClose={closePdfViewer}
    fullWidth
    maxWidth="lg"
  >
    <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Typography variant="h6">Visor de PDF</Typography>
      <Button onClick={closePdfViewer}>Cerrar</Button>
    </DialogTitle>

    {/* Cabecera de metadatos opcional */}
    {viewerMeta && (
      <Box sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1,
        px: 2,
        pb: 1
      }}>
        <Box sx={{ bgcolor: 'grey.100', borderRadius: 1, px: 1, py: .5 }}>
          <Typography variant="caption"><strong>Abogado:</strong> {viewerMeta.abogado}</Typography>
        </Box>
        <Box sx={{ bgcolor: 'grey.100', borderRadius: 1, px: 1, py: .5 }}>
          <Typography variant="caption"><strong>PPU:</strong> {viewerMeta.registro_ppu}</Typography>
        </Box>
        <Box sx={{ bgcolor: 'grey.100', borderRadius: 1, px: 1, py: .5 }}>
          <Typography variant="caption"><strong>Expediente:</strong> {viewerMeta.origen}</Typography>
        </Box>
        <Box sx={{ bgcolor: 'grey.100', borderRadius: 1, px: 1, py: .5 }}>
          <Typography variant="caption"><strong>Fecha:</strong> {viewerMeta.fecha_hora}</Typography>
        </Box>
      </Box>
    )}

    {/* Spinner sólo si Chrome y demoró */}
    {loadingPdf && (
      <Box sx={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 2,
        bgcolor: 'rgba(255,255,255,0.4)'
      }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Cargando PDF…</Typography>
      </Box>
    )}

    <DialogContent dividers sx={{ p: 0, height: '80vh' }}>
      <iframe
        title="pdf-viewer"
        src={pdfUrl}
        onLoad={handleIframeLoad}
        onError={handleIframeError}
        style={{ border: 'none', width: '100%', height: '100%' }}
      />
    </DialogContent>

    <DialogActions>
      <Button onClick={closePdfViewer}>Cerrar</Button>
      <Button variant="outlined" onClick={openInNewTabViaBlob} disabled={openingNewTab}>
        {openingNewTab ? 'Preparando…' : 'Abrir en nueva pestaña'}
      </Button>
    </DialogActions>
  </Dialog>
)}

                {/* ======================================================= */}
                {/*    DIÁLOGO EXTERNO PARA EDITAR CASO (usa <Caso />)       */}
                {/* ======================================================= */}
                <Dialog
                    open={casoDialog.open}
                    onClose={() => setCasoDialog({ open: false, row: null })}
                    fullWidth
                    maxWidth="xl"
                >
                    <DialogTitle>
                        Editar caso — PPU {casoDialog.row?.registro_ppu || ''}
                    </DialogTitle>

                    <DialogContent dividers sx={{ p: 0 }}>
                        {casoDialog.row && (
                            <Caso
                                // ⟵ datos iniciales para el componente grande
                                initialData={casoDialog.row}

                                // ⟵ callback cuando el usuario guarda dentro de Caso
                                onSave={(updatedFields) => {
                                    // updatedFields debería traer al menos:
                                    //  casoParte, nr_de_exp_completo, departamento/provincia, fiscaliaOrigen, etc.
                                    setRows(prev =>
                                        prev.map(r =>
                                            r.id === casoDialog.row.id
                                                ? { ...r, ...updatedFields }
                                                : r
                                        )
                                    );

                                    setCasoDialog({ open: false, row: null });
                                }}

                                // ⟵ cerrar sin guardar
                                onCancel={() => setCasoDialog({ open: false, row: null })}
                            />
                        )}
                    </DialogContent>

                    <DialogActions>
                        <Button onClick={() => setCasoDialog({ open: false, row: null })}>
                            Cerrar
                        </Button>
                    </DialogActions>
                </Dialog>
            </Box>
   
        </Modal>
    );
}




