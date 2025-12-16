import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Select,
    TextField,
    Typography,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    TableContainer,
    Paper,
    LinearProgress,
    Tooltip,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { esES } from "@mui/x-data-grid/locales";
import axios from "axios";
import debounce from "lodash.debounce";
import { format, subMonths, parseISO, isValid as isValidDate } from "date-fns";
import { es } from "date-fns/locale";

// Icons
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded";

import LawyerFilter from "./LawyerFilter";
import BusquedaRapida from "./principal/common-principal/busqueda-rapida";
import Ingresos from "./principal/common-principal/ingresos";
import ExportExcelButton from "./common-general/export-excel";

const PENAL = {
    headerBg: "linear-gradient(180deg, #6B0F1A 0%, #3A0B12 55%, #22070C 100%)",
    headerEdge: "rgba(255,255,255,0.14)",
    outline: "#D1D5DB",
    textOnHdr: "#F9FAFB",

    controlBg: "rgba(255,255,255,0.10)",
    controlBgH: "rgba(255,255,255,0.16)",
    controlBorder: "rgba(255,255,255,0.38)",
    controlBorderH: "rgba(255,255,255,0.72)",
    controlLabel: "rgba(249,250,251,0.92)",
    controlPlaceholder: "rgba(249,250,251,0.80)",

    red: "#B91C1C",
    redH: "#991B1B",
    redA: "#7F1D1D",

    excel: "#1D6F42",
    excelH: "#155A34",
    excelA: "#0F4528",

    success: "#16A34A",
    successH: "#15803D",

    keyHeaderBg: "linear-gradient(180deg, #6B0F1A 0%, #3A0B12 55%, #22070C 100%)",
    keyHeaderBorder: "rgba(255,255,255,0.18)",
    keyHeaderText: "#F9FAFB",
    keyCellBgEven: "rgba(107, 15, 26, 0.055)",
    keyCellBgOdd: "rgba(107, 15, 26, 0.038)",
    keyCellText: "#111827",

    archivedRowBg: "#5B0A11",
    archivedRowBgHover: "#4A080E",
    archivedRowText: "#FFF1F2",
    archivedRowSubtle: "rgba(255,255,255,0.86)",

    rowEvenBg: "rgba(107, 15, 26, 0.020)",
    rowOddBg: "rgba(107, 15, 26, 0.035)",
    rowHoverBg: "rgba(107, 15, 26, 0.060)",

    gridCellBorder: "rgba(107, 15, 26, 0.18)",
    gridCellBorderStrong: "rgba(107, 15, 26, 0.26)",
};

const getRangoAnual = () => {
    const now = new Date();
    const from = format(new Date(now.getFullYear(), 0, 1), "yyyy-MM-dd");
    const to = format(now, "yyyy-MM-dd");
    return { from, to };
};

const safeMirrorFrom = (toStr) => {
    if (!toStr) return "";
    const d = parseISO(toStr);
    if (!isValidDate(d)) return "";
    return format(subMonths(d, 1), "yyyy-MM-dd");
};

const Principal = ({ isLoggedIn, role, username }) => {
    const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:5001`;
    const FIXED_PAGE_SIZE = 100;

    const [tab] = useState(0);

    const [query, setQuery] = useState("");
    const [queryApplied, setQueryApplied] = useState("");

    const [filtroTipo, setFiltroTipo] = useState("ALL");
    const [selectedAbogado, setSelectedAbogado] = useState("");

    const [mostrarArchivados, setMostrarArchivados] = useState(true);

    const initialRangeRef = useRef(getRangoAnual());
    const initialMirror = safeMirrorFrom(initialRangeRef.current.to);
    const initialManualOverride = initialMirror ? initialRangeRef.current.from !== initialMirror : true;

    const [fromApplied, setFromApplied] = useState(initialRangeRef.current.from);
    const [toApplied, setToApplied] = useState(initialRangeRef.current.to);
    const [fromUI, setFromUI] = useState(initialRangeRef.current.from);
    const [toUI, setToUI] = useState(initialRangeRef.current.to);
    const [dateError, setDateError] = useState("");

    const [fromManualOverride, setFromManualOverride] = useState(initialManualOverride);

    const [datos, setDatos] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const [openBusquedaRapida, setOpenBusquedaRapida] = useState(false);
    const [busquedaRapidaRegistroPPU, setBusquedaRapidaRegistroPPU] = useState("");

    const [editingRowId, setEditingRowId] = useState(null);
    const [editedData, setEditedData] = useState({});

    const [selectedRegistroPPU, setSelectedRegistroPPU] = useState("");

    // ✅ HISTORIAL SOLO DE SITUACIÓN
    const [openHistorial, setOpenHistorial] = useState(false);
    const [historyDetail, setHistoryDetail] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState("");

    const cancelRef = useRef(null);

    const [paginationModel, setPaginationModel] = useState({
        page: 0,
        pageSize: FIXED_PAGE_SIZE,
    });

    const handlePaginationModelChange = useCallback(
        (model) => {
            setPaginationModel({
                page: model?.page ?? 0,
                pageSize: FIXED_PAGE_SIZE,
            });
        },
        [FIXED_PAGE_SIZE]
    );

    // 🔥 Pulso visible
    const [gridPulse, setGridPulse] = useState(false);
    const gridPulseTimerRef = useRef(null);

    const pulseGrid = useCallback(() => {
        if (gridPulseTimerRef.current) clearTimeout(gridPulseTimerRef.current);
        setGridPulse(true);
        gridPulseTimerRef.current = setTimeout(() => setGridPulse(false), 380);
    }, []);

    useEffect(() => {
        return () => {
            if (gridPulseTimerRef.current) clearTimeout(gridPulseTimerRef.current);
        };
    }, []);

    useEffect(() => {
        axios.defaults.withCredentials = true;
    }, []);

    const procesarAbogado = useCallback((valor) => {
        if (!valor) return "";
        const s = String(valor);
        if (s.includes(";")) return s.split(";").slice(-1)[0].trim();
        return s.trim();
    }, []);

    const buildBuscarParams = useCallback(
        (queryTerm, overrides = {}) => {
            const abogadoFinal =
                role === "admin"
                    ? procesarAbogado(
                        overrides.selectedAbogado !== undefined ? overrides.selectedAbogado : selectedAbogado
                    )
                    : procesarAbogado(username);

            const q = String(queryTerm ?? "").trim();

            const params = {
                limit: 1000000,
                query: q,
                abogado: abogadoFinal,
                mostrar_archivados:
                    overrides.mostrarArchivados !== undefined ? overrides.mostrarArchivados : mostrarArchivados,
                tipo: overrides.filtroTipo !== undefined ? overrides.filtroTipo : filtroTipo,
            };

            const f = overrides.fromApplied !== undefined ? overrides.fromApplied : fromApplied;
            const t = overrides.toApplied !== undefined ? overrides.toApplied : toApplied;

            if (q) {
                params.from = "1900-01-01";
                params.to = "2100-12-31";
                return params;
            }

            if (f && t) {
                params.from = f;
                params.to = t;
            }

            return params;
        },
        [role, username, selectedAbogado, mostrarArchivados, filtroTipo, fromApplied, toApplied, procesarAbogado]
    );

    const BUSCAR_CACHE_TTL_MS = 5 * 60 * 1000;
    const buscarCacheRef = useRef(
        globalThis.__PPU_PENAL_BUSCAR_CACHE__ || (globalThis.__PPU_PENAL_BUSCAR_CACHE__ = new Map())
    );

    const buildCacheKey = useCallback((params) => {
        const entries = Object.entries(params || {}).sort(([a], [b]) => a.localeCompare(b));
        return entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v ?? ""))}`).join("&");
    }, []);

    const putCache = useCallback((key, value) => {
        const m = buscarCacheRef.current;
        m.set(key, value);
        if (m.size > 20) {
            const firstKey = m.keys().next().value;
            m.delete(firstKey);
        }
    }, []);

    const buscarDatos = useCallback(
        async (_paginaIgnorada, queryTerm, overrides = {}) => {
            if (!isLoggedIn) return;

            if (cancelRef.current) {
                cancelRef.current.cancel("Cancelando solicitud previa");
            }

            const params = buildBuscarParams(queryTerm, overrides);
            const key = buildCacheKey(params);

            const hit = buscarCacheRef.current.get(key);
            const now = Date.now();

            if (hit && now - hit.ts < BUSCAR_CACHE_TTL_MS) {
                setDatos(hit.rows);
                setIsLoading(false);
                pulseGrid();
                return;
            }

            const source = axios.CancelToken.source();
            cancelRef.current = source;

            setIsLoading(true);
            pulseGrid();

            try {
                const resp = await axios.get(`${API_BASE_URL}/api/buscar`, {
                    params,
                    cancelToken: source.token,
                });

                const payload = resp.data || {};
                const rows = Array.isArray(payload.data) ? payload.data : [];

                setDatos(rows);
                putCache(key, { ts: Date.now(), rows });

                pulseGrid();
            } catch (err) {
                if (axios.isCancel(err)) return;
                console.error("Error en /api/buscar:", err);
            } finally {
                setIsLoading(false);
                cancelRef.current = null;
            }
        },
        [API_BASE_URL, buildBuscarParams, buildCacheKey, putCache, isLoggedIn, pulseGrid]
    );

    const debouncedApplyQuery = useMemo(
        () =>
            debounce((v) => {
                setQueryApplied(String(v ?? "").trim());
            }, 450),
        []
    );

    useEffect(() => {
        return () => {
            if (debouncedApplyQuery?.cancel) debouncedApplyQuery.cancel();
        };
    }, [debouncedApplyQuery]);

    useEffect(() => {
        if (!isLoggedIn) return;

        buscarDatos(1, queryApplied);

        return () => {
            if (cancelRef.current) cancelRef.current.cancel("Unmount");
        };
    }, [
        isLoggedIn,
        selectedAbogado,
        mostrarArchivados,
        fromApplied,
        toApplied,
        filtroTipo,
        role,
        username,
        buscarDatos,
        queryApplied,
    ]);

    useEffect(() => {
        setPaginationModel((p) => ({ ...p, page: 0, pageSize: FIXED_PAGE_SIZE }));
    }, [fromApplied, toApplied, filtroTipo, queryApplied, selectedAbogado, mostrarArchivados, FIXED_PAGE_SIZE]);

    const handleQueryChange = (e) => {
        const v = e.target.value;
        setQuery(v);

        const trimmed = String(v ?? "").trim();
        if (!trimmed) {
            if (debouncedApplyQuery?.cancel) debouncedApplyQuery.cancel();
            setQueryApplied("");
            return;
        }

        debouncedApplyQuery(v);
    };

    const tryApplyRange = (nextFrom, nextTo) => {
        const f = (nextFrom || "").trim();
        const t = (nextTo || "").trim();

        if (!f || !t) {
            setDateError("Completa Desde y Hasta.");
            return;
        }

        if (t < f) {
            const fixedFrom = safeMirrorFrom(t) || t;
            setFromUI(fixedFrom);
            setFromApplied(fixedFrom);
            setToApplied(t);
            setDateError("");
            pulseGrid();
            return;
        }

        setDateError("");
        setFromApplied(f);
        setToApplied(t);
        pulseGrid();
    };

    const handleFromChange = (e) => {
        const v = e.target.value;
        setFromUI(v);

        const expected = safeMirrorFrom(toUI);
        const isBackToMirror = expected && v === expected;
        setFromManualOverride(!isBackToMirror);

        let nextTo = toUI;

        if (nextTo && v && nextTo < v) {
            nextTo = v;
            setToUI(v);
        }

        tryApplyRange(v, nextTo);
    };

    const handleToChange = (e) => {
        const v = e.target.value;
        setToUI(v);

        const mirrored = safeMirrorFrom(v);
        let nextFrom = fromUI;

        if (!fromManualOverride) {
            if (mirrored) {
                nextFrom = mirrored;
                setFromUI(mirrored);
            }
            tryApplyRange(nextFrom, v);
            return;
        }

        if (nextFrom && v && v < nextFrom) {
            nextFrom = mirrored || v;
            setFromUI(nextFrom);
            setFromManualOverride(false);
        }

        tryApplyRange(nextFrom, v);
    };

    const datosFiltrados = useMemo(() => {
        let rows = Array.isArray(datos) ? datos : [];
        const t = String(filtroTipo || "ALL").toUpperCase();

        if (t === "DENUNCIA") {
            rows = rows.filter((r) => String(r?.registro_ppu || "").toUpperCase().startsWith("D-"));
        } else if (t === "LEGAJO") {
            rows = rows.filter((r) => {
                const p = String(r?.registro_ppu || "").toUpperCase().trim();
                return p.startsWith("L") || p.startsWith("LEG-");
            });
        }

        return rows.map((r) => ({
            ...r,
            id: r?.registro_ppu || `${Math.random()}`,
        }));
    }, [datos, filtroTipo]);

    const totalVisible = datosFiltrados.length;

    // ==========================
    // ✅ HISTORIAL SOLO SITUACIÓN
    // ==========================
    const HISTORY_CACHE_TTL_MS = 10 * 60 * 1000;

    const historyDetailCacheRef = useRef(
        globalThis.__PPU_PENAL_SITUACION_HISTORY_CACHE__ ||
        (globalThis.__PPU_PENAL_SITUACION_HISTORY_CACHE__ = new Map())
    );
    const historyBaseOkRef = useRef(null);

    const historyRequest = useCallback(
        async ({ method, path, params, data }) => {
            const bases = historyBaseOkRef.current
                ? [historyBaseOkRef.current]
                : [`${API_BASE_URL}/api`, API_BASE_URL];

            let lastErr = null;

            for (const base of bases) {
                const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
                try {
                    const resp =
                        String(method || "GET").toUpperCase() === "POST"
                            ? await axios.post(url, data ?? null, { params, withCredentials: true })
                            : await axios.get(url, { params, withCredentials: true });

                    historyBaseOkRef.current = base;
                    return resp;
                } catch (err) {
                    lastErr = err;
                    const st = err?.response?.status;
                    if (st === 404 || st === 405) continue;
                    throw err;
                }
            }

            throw lastErr;
        },
        [API_BASE_URL]
    );

    const normalizeSituacionHistory = useCallback((arr) => {
        const list = Array.isArray(arr) ? arr : [];
        return list.map((it, idx) => ({
            version_id: it?.version_id ?? it?.id ?? it?.pk ?? idx + 1,
            fecha_version: it?.fecha_version ?? it?.fecha ?? it?.created_at ?? it?.ts ?? "",
            usuario_modificacion:
                it?.usuario_modificacion ?? it?.usuario ?? it?.user ?? it?.username ?? "",
            old_value: it?.old_value ?? it?.valor_anterior ?? it?.valor ?? it?.value ?? "",
            ruta: it?.ruta ?? it?.pdf_original ?? it?.pdf_path ?? it?.path ?? "",
        }));
    }, []);

    const loadSituacionHistory = useCallback(
        async (ppu) => {
            const p = String(ppu || "").trim();
            if (!p) return [];

            const now = Date.now();
            const hit = historyDetailCacheRef.current.get(p);
            if (hit && now - hit.ts < HISTORY_CACHE_TTL_MS) {
                return Array.isArray(hit.data) ? hit.data : [];
            }

            const candidates = ["e_situacional", "situacion_actual", "situacion", "SITUACION_ACTUAL"];
            let lastErr = null;

            for (const field of candidates) {
                try {
                    const resp = await historyRequest({
                        method: "GET",
                        path: "/busqueda_rapida_history",
                        params: { ppu: p, field },
                    });

                    const raw =
                        (Array.isArray(resp?.data?.data) && resp.data.data) ||
                        (Array.isArray(resp?.data?.history) && resp.data.history) ||
                        (Array.isArray(resp?.data?.items) && resp.data.items) ||
                        [];

                    const rows = normalizeSituacionHistory(raw);
                    historyDetailCacheRef.current.set(p, { ts: now, data: rows });
                    return rows;
                } catch (err) {
                    lastErr = err;
                    const st = err?.response?.status;
                    if (st === 400 || st === 404) continue;
                    break;
                }
            }

            throw lastErr;
        },
        [historyRequest, normalizeSituacionHistory]
    );

    const openPdfByRuta = useCallback(
        (ruta) => {
            const r = String(ruta || "").trim();
            if (!r) return;
            const base = historyBaseOkRef.current || `${API_BASE_URL}/api`;
            const url = `${base}/open_pdf_by_ruta?ruta=${encodeURIComponent(r)}`;
            window.open(url, "_blank", "noopener,noreferrer");
        },
        [API_BASE_URL]
    );

    const openHistoryForPPU = useCallback(
        async (ppu) => {
            const reg = String(ppu || "").trim();
            if (!reg) return;

            setSelectedRegistroPPU(reg);
            setHistoryError("");
            setHistoryDetail([]);
            setOpenHistorial(true);
            setHistoryLoading(true);

            try {
                const rows = await loadSituacionHistory(reg);
                setHistoryDetail(Array.isArray(rows) ? rows : []);
            } catch (err) {
                console.error("Error historial situación:", err);
                setHistoryError("No se pudo cargar el historial de SITUACIÓN.");
                setHistoryDetail([]);
            } finally {
                setHistoryLoading(false);
            }
        },
        [loadSituacionHistory]
    );

    const closeHistorial = useCallback(() => {
        setOpenHistorial(false);
        setHistoryError("");
        setHistoryDetail([]);
        setHistoryLoading(false);
    }, []);

    // ✅ Disponibilidad del botón HISTORIAL por fila (si existe al menos 1 PDF en historial)
    const historyAvailRef = useRef(
        globalThis.__PPU_PENAL_SITUACION_PDF_AVAIL__ ||
        (globalThis.__PPU_PENAL_SITUACION_PDF_AVAIL__ = new Map())
    );
    const historyAvailInflightRef = useRef(new Set());
    const [historyAvailTick, setHistoryAvailTick] = useState(0);
    const bumpHistoryAvail = useCallback(() => setHistoryAvailTick((t) => t + 1), []);

    const ensureHistoryPdfAvailability = useCallback(
        async (ppu) => {
            const p = String(ppu || "").trim();
            if (!p) return;

            const now = Date.now();
            const prev = historyAvailRef.current.get(p);

            if (prev && prev.state !== "unknown" && now - prev.ts < HISTORY_CACHE_TTL_MS) return;
            if (prev?.state === "loading") return;

            historyAvailRef.current.set(p, { state: "loading", ts: now });
            bumpHistoryAvail();

            try {
                const rows = await loadSituacionHistory(p);
                const hasPdf = (Array.isArray(rows) ? rows : []).some((x) => String(x?.ruta || "").trim());
                historyAvailRef.current.set(p, { state: hasPdf ? "yes" : "no", ts: Date.now() });
            } catch (e) {
                historyAvailRef.current.set(p, { state: "no", ts: Date.now() });
            } finally {
                bumpHistoryAvail();
            }
        },
        [HISTORY_CACHE_TTL_MS, loadSituacionHistory, bumpHistoryAvail]
    );

    // ==========================
    // Export Excel
    // ==========================
    const exportarExcelGlobal = async () => {
        try {
            const params = buildBuscarParams(queryApplied, {});
            const resp = await axios.get(`${API_BASE_URL}/api/exportar_excel`, {
                params,
                responseType: "blob",
                withCredentials: true,
            });

            const cd = resp.headers["content-disposition"] || "";
            let fileName = "";
            const m = cd.match(/filename="?(.+?)"?($|;)/);

            if (m) {
                fileName = m[1];
            } else {
                const fecha = format(new Date(), "dd-MM-yyyy HH'h'mm'm'", { locale: es });
                const rango = `${fromApplied}_a_${toApplied}`;
                fileName = `Penal - Exportación global (${rango}) - ${fecha}.xlsx`;
            }

            const blob = new Blob([resp.data], {
                type: resp.headers["content-type"] || "application/octet-stream",
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Error al exportar Excel:", err);
            alert(`Error al exportar Excel: ${err.response?.data?.error || err.message}`);
        }
    };

    const exportarSeleccionActual = () => {
        const cols = fullColumns.filter((c) => c.field !== "acciones");
        if (!datosFiltrados.length) {
            alert("No hay registros para exportar.");
            return;
        }
        void cols;
    };

    const onClickExport = () => {
        if (role === "admin") exportarExcelGlobal();
        else exportarSeleccionActual();
    };

    const handleEditClick = useCallback(
        (row) => {
            if (role === "admin") {
                setEditedData({
                    registro_ppu: row.registro_ppu,
                    e_situacional: row.e_situacional,
                    abogado: row.abogado,
                    denunciado: row.denunciado,
                    origen: row.origen,
                    "nr de exp completo": row["nr de exp completo"],
                    delito: row.delito,
                    departamento: row.departamento,
                    fiscalia: row.fiscalia,
                    juzgado: row.juzgado,
                    informe_juridico: row.informe_juridico,
                    fecha_ingreso: row.fecha_ingreso,
                    last_modified: row.last_modified,
                    etiqueta: row.etiqueta,
                });
            } else {
                setEditedData({
                    registro_ppu: row.registro_ppu,
                    etiqueta: row.etiqueta,
                });
            }
            setEditingRowId(row.registro_ppu);
        },
        [role]
    );

    const handleSaveClick = useCallback(async () => {
        if (!editedData?.registro_ppu) {
            alert("Error: Falta registro_ppu en los datos a actualizar.");
            return;
        }
        try {
            const dataToSend = { ...editedData };
            await axios.post(`${API_BASE_URL}/api/actualizar_caso`, {
                registro_ppu: dataToSend.registro_ppu,
                data: dataToSend,
            });

            setDatos((prev) =>
                prev.map((d) => (d.registro_ppu === dataToSend.registro_ppu ? { ...d, ...dataToSend } : d))
            );

            setEditingRowId(null);
            setEditedData({});
            alert("Caso actualizado.");
        } catch (err) {
            console.error("Error en la actualización:", err);
            alert(`Error: ${err.response?.data?.error || err.message}`);
        }
    }, [API_BASE_URL, editedData]);

    const handleCloseBusquedaRapida = useCallback(() => {
        setOpenBusquedaRapida(false);
        setBusquedaRapidaRegistroPPU("");
    }, []);

    const handleGridRowDoubleClick = useCallback(
        (params, event) => {
            if (editingRowId) return;

            const target = event?.target;
            if (target?.closest) {
                if (
                    target.closest("button") ||
                    target.closest("a") ||
                    target.closest("input") ||
                    target.closest("textarea") ||
                    target.closest(".MuiButtonBase-root")
                ) {
                    return;
                }
            }

            const reg = String(params?.row?.registro_ppu ?? params?.id ?? "").trim();
            if (!reg) return;

            setSelectedRegistroPPU(reg);
            setBusquedaRapidaRegistroPPU(reg);
            setOpenBusquedaRapida(true);
        },
        [editingRowId]
    );

    const renderEditable = useCallback(
        (params) => {
            if (editingRowId === params.row.registro_ppu) {
                if (role === "admin" || (role === "user" && params.field === "etiqueta")) {
                    return (
                        <TextField
                            value={editedData[params.field] ?? ""}
                            onChange={(e) => setEditedData({ ...editedData, [params.field]: e.target.value })}
                            variant="outlined"
                            size="small"
                            fullWidth
                            sx={{
                                "& .MuiOutlinedInput-root": {
                                    backgroundColor: "#fff",
                                    borderRadius: 1.5,
                                },
                            }}
                        />
                    );
                }
            }
            return params.value;
        },
        [editingRowId, role, editedData]
    );

    const renderSituacionConHistorial = useCallback(
        (params) => {
            const row = params?.row || {};
            const ppu = String(row?.registro_ppu || "").trim();
            const isEditing = editingRowId === row.registro_ppu;

            if (isEditing && role === "admin") {
                return (
                    <TextField
                        value={editedData["e_situacional"] ?? ""}
                        onChange={(e) => setEditedData({ ...editedData, e_situacional: e.target.value })}
                        variant="outlined"
                        size="small"
                        fullWidth
                        sx={{
                            "& .MuiOutlinedInput-root": {
                                backgroundColor: "#fff",
                                borderRadius: 1.5,
                            },
                        }}
                    />
                );
            }

            const value = String(params?.value ?? "").trim();
            const avail = historyAvailRef.current.get(ppu);
            const state = avail?.state || "unknown"; // unknown | loading | yes | no

            if (ppu && state === "unknown" && !historyAvailInflightRef.current.has(ppu)) {
                historyAvailInflightRef.current.add(ppu);
                Promise.resolve().then(async () => {
                    try {
                        await ensureHistoryPdfAvailability(ppu);
                    } finally {
                        historyAvailInflightRef.current.delete(ppu);
                    }
                });
            }

            const isLoadingBtn = state === "unknown" || state === "loading";
            const hasPdf = state === "yes";
            const disabled = !hasPdf;

            const disabledTip = isLoadingBtn
                ? "Verificando si existe PDF en historial…"
                : "No hay PDF disponible en el historial de este PPU.";

            return (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.9, width: "100%" }}>
                    <Box
                        sx={{
                            fontSize: "0.78rem",
                            fontWeight: 850,
                            lineHeight: "1.15rem",
                            // ✅ FIX REAL: NO PISAR COLOR DEL ROW ARCHIVADO
                            // (así en archivado hereda blanco del .row-archivo)
                            color: "inherit",
                            display: "-webkit-box",
                            WebkitLineClamp: 6,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            whiteSpace: "pre-wrap",
                        }}
                    >
                        {value || "—"}
                    </Box>

                    {!!ppu && (
                        <Tooltip title={disabled ? disabledTip : "Ver historial de SITUACIÓN (con PDF)"} arrow>
                            <span>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    disabled={disabled}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openHistoryForPPU(ppu);
                                    }}
                                    startIcon={
                                        isLoadingBtn ? (
                                            <CircularProgress size={14} />
                                        ) : hasPdf ? (
                                            <HistoryRoundedIcon fontSize="small" />
                                        ) : (
                                            <HistoryRoundedIcon fontSize="small" />
                                        )
                                    }
                                    sx={{
                                        textTransform: "none",
                                        fontWeight: 950,
                                        borderRadius: 1.7,
                                        height: 30,
                                        px: 1.25,
                                        borderColor: "#D1D5DB",
                                        color: "#111827",
                                        backgroundColor: "rgba(255,255,255,0.92)",
                                        boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
                                        "&:hover": {
                                            borderColor: "#9CA3AF",
                                            backgroundColor: "#F3F4F6",
                                        },
                                        "&.Mui-disabled": {
                                            color: "rgba(17,24,39,0.45)",
                                            borderColor: "#E5E7EB",
                                            backgroundColor: "#F3F4F6",
                                            boxShadow: "none",
                                        },
                                    }}
                                >
                                    Historial
                                </Button>
                            </span>
                        </Tooltip>
                    )}

                    {/* fuerza rerender por tick */}
                    <Box sx={{ display: "none" }}>{historyAvailTick}</Box>
                </Box>
            );
        },
        [editingRowId, role, editedData, openHistoryForPPU, ensureHistoryPdfAvailability, historyAvailTick]
    );

    const fullColumns = useMemo(
        () => [
            {
                field: "registro_ppu",
                headerName: "PPU",
                width: 130,
                headerClassName: "colhdr-key",
                cellClassName: "cell-key",
            },
            {
                field: "e_situacional",
                headerName: "SITUACIÓN",
                width: 240,
                headerClassName: "colhdr-key",
                cellClassName: "cell-key",
                sortable: false,
                renderCell: renderSituacionConHistorial,
            },
            {
                field: "abogado",
                headerName: "ABOGADO",
                width: 160,
                headerClassName: "colhdr-key",
                cellClassName: "cell-key",
            },
            { field: "denunciado", headerName: "Denunciado", minWidth: 240, flex: 1 },
            { field: "origen", headerName: "Fiscal corto / Exp.", minWidth: 200, flex: 1 },
            { field: "nr de exp completo", headerName: "Fiscal completo", minWidth: 220, flex: 1 },
            { field: "delito", headerName: "Delito", minWidth: 240, flex: 1 },
            { field: "departamento", headerName: "Dpto.", width: 120 },
            {
                field: "acciones",
                headerName: "Acciones",
                width: 150,
                sortable: false,
                filterable: false,
                renderCell: ({ row }) => {
                    const isEditing = editingRowId === row.registro_ppu;

                    return (
                        <Box sx={{ display: "flex", gap: 1 }}>
                            <Button
                                size="small"
                                variant="contained"
                                onClick={() => (isEditing ? handleSaveClick() : handleEditClick(row))}
                                sx={{
                                    textTransform: "none",
                                    fontWeight: 900,
                                    borderRadius: 1.7,
                                    backgroundColor: PENAL.red,
                                    boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
                                    "&:hover": { backgroundColor: PENAL.redH },
                                    "&:active": { backgroundColor: PENAL.redA },
                                }}
                            >
                                {isEditing ? "Guardar" : "Modificar"}
                            </Button>
                        </Box>
                    );
                },
            },
        ],
        [editingRowId, handleSaveClick, handleEditClick, renderSituacionConHistorial]
    );

    const columns = useMemo(() => {
        return fullColumns.map((col) => {
            if (col.field === "acciones") return col;
            if (col.field === "e_situacional") return col;
            return { ...col, renderCell: renderEditable };
        });
    }, [fullColumns, renderEditable]);

    const localeES = useMemo(
        () => ({
            ...esES.components.MuiDataGrid.defaultProps.localeText,
            noRowsLabel: "Sin filas",
            noResultsOverlayLabel: "Sin resultados",
            footerPaginationRowsPerPage: "Filas por página:",
        }),
        []
    );

    const isArchivado = (row) => {
        const etiqueta = String(row?.etiqueta || "").trim().toUpperCase();
        return etiqueta.startsWith("ARCHI");
    };

    const getRowClassName = (params) => {
        const parity = params.indexRelativeToCurrentPage % 2 === 0 ? "row-even" : "row-odd";
        const archivo = isArchivado(params.row) ? "row-archivo" : "";
        return `${parity} ${archivo}`.trim();
    };

    const limpiarFiltros = () => {
        const { from, to } = getRangoAnual();

        setQuery("");
        setQueryApplied("");
        if (debouncedApplyQuery?.cancel) debouncedApplyQuery.cancel();

        setFiltroTipo("ALL");
        setSelectedAbogado("");
        setMostrarArchivados(true);

        setFromManualOverride(true);
        setFromUI(from);
        setToUI(to);
        setDateError("");
        setFromApplied(from);
        setToApplied(to);

        buscarCacheRef.current?.clear?.();
        pulseGrid();
    };

    const sxOutlinedHdr = {
        minHeight: 36,
        color: "#fff",
        borderColor: PENAL.controlBorder,
        backgroundColor: PENAL.controlBg,
        textTransform: "none",
        "&:hover": { borderColor: PENAL.controlBorderH, backgroundColor: PENAL.controlBgH },
    };

    const sxTextFieldHdr = {
        flex: "1 1 320px",
        maxWidth: 540,
        minWidth: { xs: "100%", sm: 260, md: 320 },
        "& .MuiInputBase-input": { color: "#fff" },
        "& .MuiInputBase-input::placeholder": { color: PENAL.controlPlaceholder, opacity: 1 },
        "& .MuiInputLabel-root": { color: PENAL.controlLabel },
        "& .MuiOutlinedInput-notchedOutline": { borderColor: PENAL.controlBorder },
        "& .MuiOutlinedInput-root": { backgroundColor: PENAL.controlBg, borderRadius: 2 },
        "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: PENAL.controlBorderH },
        "&:hover .MuiOutlinedInput-root": { backgroundColor: PENAL.controlBgH },
        "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: PENAL.controlBorderH },
    };

    const sxDateFieldHdr = {
        flex: "0 1 170px",
        minWidth: { xs: "48%", sm: 165 },
        "& .MuiInputBase-input": { color: "#fff" },
        "& .MuiInputLabel-root": { color: PENAL.controlLabel },
        "& .MuiOutlinedInput-notchedOutline": { borderColor: PENAL.controlBorder },
        "& .MuiOutlinedInput-root": { backgroundColor: PENAL.controlBg, borderRadius: 2 },
        "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: PENAL.controlBorderH },
        "&:hover .MuiOutlinedInput-root": { backgroundColor: PENAL.controlBgH },
        "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: PENAL.controlBorderH },
    };

    const sxSelectHdr = {
        flex: "0 1 160px",
        minWidth: { xs: "48%", sm: 150 },
        "& .MuiInputBase-root": { color: "#fff", backgroundColor: PENAL.controlBg, borderRadius: 2 },
        "& .MuiInputLabel-root": { color: PENAL.controlLabel },
        "& .MuiOutlinedInput-notchedOutline": { borderColor: PENAL.controlBorder },
        "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: PENAL.controlBorderH },
        "&:hover .MuiInputBase-root": { backgroundColor: PENAL.controlBgH },
        "& .MuiSvgIcon-root": { color: "rgba(255,255,255,0.90)" },
    };

    const sxLawyerFilterWrap = {
        flex: "1 1 260px",
        minWidth: { xs: "100%", sm: 260 },
        maxWidth: 420,
        "& .MuiFormControl-root": { width: "100%" },
        "& .MuiInputLabel-root": { color: PENAL.controlLabel },
        "& .MuiInputBase-root": { color: "#fff", backgroundColor: PENAL.controlBg, borderRadius: 2 },
        "& .MuiOutlinedInput-notchedOutline": { borderColor: PENAL.controlBorder },
        "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: PENAL.controlBorderH },
        "&:hover .MuiInputBase-root": { backgroundColor: PENAL.controlBgH },
        "& .MuiSvgIcon-root": { color: "rgba(255,255,255,0.90)" },
        "& input": { color: "#fff" },
        "& input::placeholder": { color: PENAL.controlPlaceholder, opacity: 1 },
        "& .MuiAutocomplete-input": { color: "#fff" },
        "& .MuiAutocomplete-popupIndicator": { color: "rgba(255,255,255,0.90)" },
        "& .MuiAutocomplete-clearIndicator": { color: "rgba(255,255,255,0.90)" },
    };

    const totalHist = Array.isArray(historyDetail) ? historyDetail.length : 0;
    const totalHistPdf = (Array.isArray(historyDetail) ? historyDetail : []).filter((h) =>
        String(h?.ruta || "").trim()
    ).length;

    return (
        <Box
            className="data-penal"
            sx={{
                width: "100%",
                maxWidth: "100%",
                m: 0,
                p: 0,
                boxSizing: "border-box",
                backgroundColor: "#fff",
                height: "100vh",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
            }}
        >
            {tab === 0 && (
                <>
                    <Box
                        sx={{
                            width: "100%",
                            background: PENAL.headerBg,
                            color: PENAL.textOnHdr,
                            p: 2,
                            borderTopLeftRadius: 12,
                            borderTopRightRadius: 12,
                            border: `1px solid ${PENAL.headerEdge}`,
                            borderBottom: "none",
                            display: "flex",
                            flexDirection: "column",
                            gap: 1.25,
                            boxShadow: "0 12px 34px rgba(0,0,0,0.28)",
                            boxSizing: "border-box",
                            flex: "0 0 auto",
                        }}
                    >
                        <Typography
                            variant="h5"
                            align="center"
                            sx={{ fontWeight: 950, letterSpacing: 0.8, textTransform: "uppercase" }}
                        >
                            Seguimiento de Procesos Penales PPU
                        </Typography>

                        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                            <Box
                                sx={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    gap: 1,
                                    width: "100%",
                                }}
                            >
                                <Box
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        "& .MuiButton-root": {
                                            minHeight: 36,
                                            textTransform: "none",
                                            fontWeight: 800,
                                            borderRadius: 1.8,
                                        },
                                    }}
                                >
                                    <Ingresos onRefresh={() => buscarDatos(1, queryApplied)} query={queryApplied} />
                                </Box>

                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => {
                                        setSelectedRegistroPPU("");
                                        setBusquedaRapidaRegistroPPU("");
                                        setOpenBusquedaRapida(true);
                                    }}
                                    sx={{ ...sxOutlinedHdr, minWidth: 230, fontWeight: 900, borderRadius: 1.9 }}
                                >
                                    Edición rápida – recepción directa
                                </Button>

                                <TextField
                                    label="Búsqueda global"
                                    placeholder="PPU, denunciado, fiscalía, juzgado…"
                                    value={query}
                                    onChange={handleQueryChange}
                                    size="small"
                                    sx={sxTextFieldHdr}
                                />

                                <TextField
                                    label="Desde"
                                    type="date"
                                    value={fromUI}
                                    onChange={handleFromChange}
                                    size="small"
                                    InputLabelProps={{ shrink: true }}
                                    sx={sxDateFieldHdr}
                                />

                                <TextField
                                    label="Hasta"
                                    type="date"
                                    value={toUI}
                                    onChange={handleToChange}
                                    size="small"
                                    InputLabelProps={{ shrink: true }}
                                    sx={sxDateFieldHdr}
                                />

                                {dateError ? (
                                    <Typography
                                        sx={{
                                            flexBasis: "100%",
                                            textAlign: "center",
                                            fontSize: 12,
                                            color: "rgba(255,226,226,0.95)",
                                            mt: 0.25,
                                        }}
                                    >
                                        {dateError}
                                    </Typography>
                                ) : null}
                            </Box>

                            <Box
                                sx={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    gap: 1,
                                    width: "100%",
                                }}
                            >
                                <FormControl size="small" sx={sxSelectHdr}>
                                    <InputLabel id="filtro-tipo-label">Tipo</InputLabel>
                                    <Select
                                        labelId="filtro-tipo-label"
                                        value={filtroTipo}
                                        label="Tipo"
                                        onChange={(e) => setFiltroTipo(e.target.value)}
                                    >
                                        <MenuItem value="ALL">Todos</MenuItem>
                                        <MenuItem value="DENUNCIA">Denuncias</MenuItem>
                                        <MenuItem value="LEGAJO">Legajos</MenuItem>
                                    </Select>
                                </FormControl>

                                <Box sx={sxLawyerFilterWrap}>
                                    {role === "admin" ? (
                                        <LawyerFilter
                                            role={role}
                                            username={username}
                                            selectedAbogadoPlazos={selectedAbogado}
                                            setSelectedAbogadoPlazos={setSelectedAbogado}
                                            debouncedBuscarPlazosData={buscarDatos}
                                            queryPlazos={queryApplied}
                                            mostrarArchivadosPlazos={mostrarArchivados}
                                            setPagePlazos={() => { }}
                                        />
                                    ) : (
                                        <Typography
                                            variant="body2"
                                            sx={{ fontStyle: "italic", color: "#fff", opacity: 0.92 }}
                                        >
                                            Abogado: {String(username || "").toUpperCase()} (filtro forzado)
                                        </Typography>
                                    )}
                                </Box>

                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={mostrarArchivados}
                                            onChange={(e) => setMostrarArchivados(e.target.checked)}
                                            sx={{
                                                color: "rgba(255,255,255,0.85)",
                                                "&.Mui-checked": { color: PENAL.success },
                                            }}
                                        />
                                    }
                                    label="Mostrar archivados"
                                    sx={{
                                        color: "#fff",
                                        "& .MuiFormControlLabel-label": { fontWeight: 850, opacity: 0.96 },
                                    }}
                                />

                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={limpiarFiltros}
                                    sx={{ ...sxOutlinedHdr, minWidth: 150, fontWeight: 900, borderRadius: 1.9 }}
                                >
                                    Limpiar filtros
                                </Button>

                                <ExportExcelButton
                                    role={role}
                                    apiBaseUrl={API_BASE_URL}
                                    buildBuscarParams={buildBuscarParams}
                                    query={queryApplied}
                                    fromApplied={fromApplied}
                                    toApplied={toApplied}
                                    datosFiltrados={datosFiltrados}
                                    fullColumns={fullColumns}
                                    sx={{
                                        backgroundColor: PENAL.excel,
                                        color: "#fff",
                                        "&:hover": { backgroundColor: PENAL.excelH },
                                        "&:active": { backgroundColor: PENAL.excelA },
                                    }}
                                />

                                <Box
                                    sx={{
                                        px: 1.25,
                                        py: 0.7,
                                        borderRadius: 999,
                                        border: `1px solid ${PENAL.controlBorder}`,
                                        backgroundColor: "rgba(0,0,0,0.18)",
                                        color: "#fff",
                                        fontSize: 12,
                                        fontWeight: 900,
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    Total: {totalVisible}
                                    {isLoading ? " · Actualizando…" : ""}
                                </Box>
                            </Box>
                        </Box>
                    </Box>

                    <Box
                        sx={{
                            width: "100%",
                            border: `1px solid ${PENAL.outline}`,
                            borderTop: "none",
                            borderBottomLeftRadius: 12,
                            borderBottomRightRadius: 12,
                            bgcolor: "#fff",
                            flex: "1 1 auto",
                            minHeight: 0,
                            overflow: "hidden",
                            boxShadow: "0 10px 24px rgba(0,0,0,0.10)",
                            boxSizing: "border-box",
                        }}
                    >
                        <DataGrid
                            rows={datosFiltrados}
                            columns={columns}
                            localeText={localeES}
                            getRowId={(r) => r.id}
                            disableRowSelectionOnClick
                            loading={isLoading}
                            pagination
                            paginationModel={paginationModel}
                            onPaginationModelChange={handlePaginationModelChange}
                            pageSizeOptions={[FIXED_PAGE_SIZE]}
                            getRowClassName={getRowClassName}
                            getRowHeight={() => "auto"}
                            onRowDoubleClick={handleGridRowDoubleClick}
                            sx={{
                                height: "100%",
                                border: "none",
                                fontSize: "0.78rem",
                                transition: "opacity 220ms ease, transform 220ms ease, box-shadow 220ms ease",
                                opacity: isLoading ? 0.78 : gridPulse ? 0.92 : 1,
                                transform: isLoading ? "translateY(2px)" : "translateY(0px)",
                                boxShadow: gridPulse
                                    ? "inset 0 0 0 3px rgba(185,28,28,0.18), inset 0 0 0 1px rgba(17,24,39,0.08)"
                                    : "none",

                                "& .MuiDataGrid-columnHeaders": {
                                    background: PENAL.keyHeaderBg,
                                    borderBottom: `1px solid ${PENAL.keyHeaderBorder}`,
                                },
                                "& .MuiDataGrid-columnHeader": {
                                    background: PENAL.keyHeaderBg,
                                    color: PENAL.keyHeaderText,
                                    borderRight: `1px solid ${PENAL.keyHeaderBorder}`,
                                    borderBottom: `1px solid ${PENAL.keyHeaderBorder}`,
                                    whiteSpace: "normal",
                                    lineHeight: "1.1rem",
                                    padding: "10px 10px",
                                },
                                "& .MuiDataGrid-columnHeaderTitle": {
                                    fontWeight: 950,
                                    letterSpacing: 0.6,
                                    textTransform: "uppercase",
                                    whiteSpace: "normal",
                                    lineHeight: "1.1rem",
                                },
                                "& .MuiDataGrid-columnHeader .MuiSvgIcon-root": {
                                    color: "rgba(255,255,255,0.92)",
                                },
                                "& .MuiDataGrid-columnHeader .MuiDataGrid-menuIcon button": {
                                    color: "rgba(255,255,255,0.92)",
                                },
                                "& .MuiDataGrid-iconSeparator": { color: "rgba(255,255,255,0.35)" },
                                "& .MuiDataGrid-columnSeparator": { color: "rgba(255,255,255,0.35)" },

                                "& .MuiDataGrid-cell": {
                                    whiteSpace: "normal !important",
                                    wordBreak: "break-word",
                                    lineHeight: "1.25rem",
                                    padding: "8px 10px",
                                    alignItems: "flex-start",
                                    borderRight: `1px solid ${PENAL.gridCellBorder}`,
                                    borderBottom: `1px solid ${PENAL.gridCellBorder}`,
                                    color: "#111827",
                                },

                                "& .MuiDataGrid-columnHeader:last-of-type, & .MuiDataGrid-cell:last-of-type": {
                                    borderRight: "none",
                                },

                                "& .MuiDataGrid-virtualScroller": { backgroundColor: PENAL.rowEvenBg },
                                "& .MuiDataGrid-virtualScrollerContent": { backgroundColor: PENAL.rowEvenBg },

                                "& .row-even:not(.row-archivo) .MuiDataGrid-cell": { backgroundColor: PENAL.rowEvenBg },
                                "& .row-odd:not(.row-archivo) .MuiDataGrid-cell": { backgroundColor: PENAL.rowOddBg },

                                "& .MuiDataGrid-row:hover:not(.row-archivo) .MuiDataGrid-cell": {
                                    backgroundColor: PENAL.rowHoverBg,
                                },

                                "& .row-even:not(.row-archivo) .MuiDataGrid-cell.cell-key": {
                                    backgroundColor: PENAL.keyCellBgEven,
                                    color: PENAL.keyCellText,
                                },
                                "& .row-odd:not(.row-archivo) .MuiDataGrid-cell.cell-key": {
                                    backgroundColor: PENAL.keyCellBgOdd,
                                    color: PENAL.keyCellText,
                                },
                                "& .MuiDataGrid-row:hover:not(.row-archivo) .MuiDataGrid-cell.cell-key": {
                                    backgroundColor: "rgba(107, 15, 26, 0.085)",
                                },

                                "& .row-archivo .MuiDataGrid-cell": {
                                    backgroundColor: PENAL.archivedRowBg,
                                    color: PENAL.archivedRowText,
                                    borderRight: "1px solid rgba(255,255,255,0.10)",
                                    borderBottom: "1px solid rgba(255,255,255,0.12)",
                                },
                                "& .row-archivo .MuiDataGrid-cell .MuiTypography-root": {
                                    color: PENAL.archivedRowText,
                                },
                                "& .MuiDataGrid-row.row-archivo:hover .MuiDataGrid-cell": {
                                    backgroundColor: PENAL.archivedRowBgHover,
                                },

                                "& .MuiDataGrid-footerContainer": {
                                    borderTop: `1px solid ${PENAL.gridCellBorderStrong}`,
                                    backgroundColor: "#FFFFFF",
                                },

                                "& .MuiTablePagination-selectLabel, & .MuiTablePagination-input": { display: "none" },
                                "& .MuiTablePagination-actions": { marginLeft: "auto" },
                            }}
                        />
                    </Box>

                    <BusquedaRapida
                        key={`br-${openBusquedaRapida ? "open" : "closed"}-${busquedaRapidaRegistroPPU || "new"}`}
                        open={openBusquedaRapida}
                        onClose={handleCloseBusquedaRapida}
                        registro_ppu={busquedaRapidaRegistroPPU}
                    />

                    <Dialog open={openHistorial} onClose={closeHistorial} fullWidth maxWidth="lg">
                        <DialogTitle
                            sx={{
                                background: PENAL.keyHeaderBg,
                                color: "#fff",
                                borderBottom: `1px solid ${PENAL.keyHeaderBorder}`,
                                fontWeight: 950,
                                letterSpacing: 0.6,
                                textTransform: "uppercase",
                                py: 1.35,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 1,
                            }}
                        >
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <HistoryRoundedIcon />
                                <Box>
                                    <Box sx={{ lineHeight: "1.15rem" }}>Historial — Situación</Box>
                                    <Box sx={{ fontSize: 12, opacity: 0.9, fontWeight: 800, textTransform: "none" }}>
                                        PPU: {selectedRegistroPPU || "-"}
                                    </Box>
                                </Box>
                            </Box>

                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Chip
                                    size="small"
                                    label={`Versiones: ${historyLoading ? "…" : totalHist}`}
                                    sx={{
                                        fontWeight: 900,
                                        borderRadius: 999,
                                        backgroundColor: "rgba(255,255,255,0.16)",
                                        color: "#fff",
                                        border: "1px solid rgba(255,255,255,0.20)",
                                    }}
                                />
                                <Chip
                                    size="small"
                                    icon={<PictureAsPdfRoundedIcon sx={{ color: "#fff !important" }} />}
                                    label={`PDF: ${historyLoading ? "…" : totalHistPdf}`}
                                    sx={{
                                        fontWeight: 900,
                                        borderRadius: 999,
                                        backgroundColor: "rgba(255,255,255,0.16)",
                                        color: "#fff",
                                        border: "1px solid rgba(255,255,255,0.20)",
                                    }}
                                />
                            </Box>
                        </DialogTitle>

                        <DialogContent dividers sx={{ p: 2, bgcolor: "#fff" }}>
                            {historyLoading ? (
                                <Box sx={{ mb: 1.5 }}>
                                    <LinearProgress />
                                    <Typography sx={{ mt: 1, fontSize: 12, opacity: 0.8 }}>
                                        Cargando historial…
                                    </Typography>
                                </Box>
                            ) : null}

                            {historyError ? (
                                <Typography sx={{ color: "#B91C1C", fontWeight: 900, fontSize: 13, mb: 1.25 }}>
                                    {historyError}
                                </Typography>
                            ) : null}

                            {!historyLoading && !historyError && (!historyDetail || historyDetail.length === 0) ? (
                                <Typography sx={{ fontSize: 12.5, opacity: 0.85 }}>
                                    No hay versiones registradas para SITUACIÓN en este PPU.
                                </Typography>
                            ) : null}

                            {!historyLoading && !historyError && historyDetail && historyDetail.length > 0 ? (
                                <TableContainer
                                    component={Paper}
                                    elevation={0}
                                    sx={{
                                        border: "1px solid #E5E7EB",
                                        borderRadius: 2,
                                        overflow: "hidden",
                                    }}
                                >
                                    <Table size="small" stickyHeader>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 950, width: 70, backgroundColor: "#F9FAFB" }}>#</TableCell>
                                                <TableCell sx={{ fontWeight: 950, width: 170, backgroundColor: "#F9FAFB" }}>Fecha</TableCell>
                                                <TableCell sx={{ fontWeight: 950, width: 220, backgroundColor: "#F9FAFB" }}>Usuario</TableCell>
                                                <TableCell sx={{ fontWeight: 950, backgroundColor: "#F9FAFB" }}>Valor anterior</TableCell>
                                                <TableCell sx={{ fontWeight: 950, width: 170, backgroundColor: "#F9FAFB" }} align="right">
                                                    PDF
                                                </TableCell>
                                            </TableRow>
                                        </TableHead>

                                        <TableBody>
                                            {historyDetail.map((h, idx) => {
                                                const ruta = String(h?.ruta || "").trim();
                                                const fecha = String(h?.fecha_version || "").trim();
                                                const usuario = String(h?.usuario_modificacion || "").trim();
                                                const valor = String(h?.old_value ?? "").trim();
                                                const hasPdf = !!ruta;

                                                return (
                                                    <TableRow
                                                        key={`${h?.version_id ?? "v"}-${idx}`}
                                                        hover
                                                        sx={{
                                                            "&:nth-of-type(odd) td": { backgroundColor: "#FFFFFF" },
                                                            "&:nth-of-type(even) td": { backgroundColor: "#FAFAFA" },
                                                        }}
                                                    >
                                                        <TableCell sx={{ fontWeight: 950 }}>{idx + 1}</TableCell>
                                                        <TableCell sx={{ fontSize: 12 }}>{fecha || "—"}</TableCell>
                                                        <TableCell sx={{ fontSize: 12 }}>
                                                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                                                <Box sx={{ fontWeight: 800 }}>{usuario || "—"}</Box>
                                                                <Chip
                                                                    size="small"
                                                                    label={hasPdf ? "PDF" : "Sin PDF"}
                                                                    sx={{
                                                                        height: 22,
                                                                        fontWeight: 900,
                                                                        borderRadius: 999,
                                                                        backgroundColor: hasPdf ? "rgba(22,163,74,0.12)" : "#F3F4F6",
                                                                        color: hasPdf ? "#166534" : "rgba(17,24,39,0.55)",
                                                                        border: `1px solid ${hasPdf ? "rgba(22,163,74,0.25)" : "#E5E7EB"}`,
                                                                    }}
                                                                />
                                                            </Box>
                                                        </TableCell>
                                                        <TableCell sx={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
                                                            {valor || "—"}
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <Tooltip title={hasPdf ? "Abrir PDF" : "No hay PDF en esta versión"} arrow>
                                                                <span>
                                                                    <Button
                                                                        size="small"
                                                                        variant="outlined"
                                                                        disabled={!hasPdf}
                                                                        startIcon={<PictureAsPdfRoundedIcon fontSize="small" />}
                                                                        onClick={() => openPdfByRuta(ruta)}
                                                                        sx={{
                                                                            textTransform: "none",
                                                                            fontWeight: 950,
                                                                            borderRadius: 1.7,
                                                                            borderColor: "#D1D5DB",
                                                                            color: "#111827",
                                                                            backgroundColor: "rgba(255,255,255,0.92)",
                                                                            "&:hover": {
                                                                                borderColor: "#9CA3AF",
                                                                                backgroundColor: "#F9FAFB",
                                                                            },
                                                                            "&.Mui-disabled": {
                                                                                color: "rgba(17,24,39,0.45)",
                                                                                borderColor: "#E5E7EB",
                                                                                backgroundColor: "#F3F4F6",
                                                                            },
                                                                        }}
                                                                    >
                                                                        Abrir
                                                                    </Button>
                                                                </span>
                                                            </Tooltip>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            ) : null}
                        </DialogContent>

                        <DialogActions
                            sx={{
                                px: 2,
                                py: 1.25,
                                bgcolor: "#fff",
                                borderTop: "1px solid #E5E7EB",
                            }}
                        >
                            <Button
                                onClick={closeHistorial}
                                variant="outlined"
                                sx={{
                                    textTransform: "none",
                                    fontWeight: 950,
                                    borderRadius: 1.8,
                                    borderColor: "#D1D5DB",
                                    color: "#111827",
                                    backgroundColor: "#fff",
                                    "&:hover": { borderColor: "#9CA3AF", backgroundColor: "#F9FAFB" },
                                }}
                            >
                                Cerrar
                            </Button>
                        </DialogActions>
                    </Dialog>

                    <Box sx={{ display: "none" }}>
                        <Button onClick={onClickExport}>Export</Button>
                    </Box>
                </>
            )}
        </Box>
    );
};

export default Principal;
