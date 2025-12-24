// src/components/principal/common-principal/caso/caso.jsx
import React, { useEffect, useRef, useState } from "react";
import {
    Box,
    TextField,
    Button,
    Grid,
    Typography,
    Autocomplete,
    Paper,
    Divider,
    Stack,
    InputAdornment,
    Tooltip,
    Chip,
    CircularProgress,
} from "@mui/material";
import axios from "axios";

// =============================
// Constantes reutilizables
// =============================
const EXP_PATTERN_1 =
    /(\d{5}-\d{4}-\d{1,2}-\d{4}[A-Z]?-[A-Z]{2}-[A-Z]{2}-\d{1,2})/;
const EXP_PATTERN_2 =
    /(\d{5}-\d{4}-\d{1,2}-[A-Z\d]+-[A-Z]{2}-[A-Z]{2}-\d{1,2})/;

const CASO_PATTERN = /^([1-9]\d*)-(\d{4})$/;
const FISCALIA_CODE_PATTERN = /^(\d{6,10})/;

const ACCION_LABELS = {
    caso: "Carpeta fiscal",
    expediente: "Expediente judicial",
    nrExp: "Caso fiscal completo",
    fiscalia: "Fiscalía",
    departamento: "Departamento",
    despacho: "Despacho de fiscalía",
};

// =============================
// Helpers (NO bloquean escritura)
// =============================
function sanitizeCasoDraft(raw) {
    return String(raw || "")
        .replace(/^CASO\s*/i, "")
        .replace(/[^\d-]/g, "");
}

function finalizeCaso(raw) {
    let v = sanitizeCasoDraft(raw);
    v = v.replace(/-+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
    if (!v) return "";

    // NO recortes mientras escribe: solo al “asentar” (debounce)
    let parts = v.split("-").filter(Boolean);
    if (parts.length === 0) return "";
    if (parts.length === 1) {
        // parcial (aún digitando)
        return parts[0];
    }

    // asentado: solo 2 partes (numero-año)
    const numero = String(parts[0] || "").replace(/^0+/, "");
    let year = String(parts[1] || "").slice(0, 4);

    // si year quedó vacío, devuelve solo número (parcial)
    if (!year) return numero || "";
    return `${numero}-${year}`;
}

function sanitizeNrExpDraft(raw) {
    return String(raw || "").replace(/[^\d-]/g, "");
}

function finalizeNrExp(raw) {
    let v = sanitizeNrExpDraft(raw);
    v = v.replace(/-+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
    return v;
}

function sanitizeExpDraft(raw) {
    return String(raw || "")
        .toUpperCase()
        .replace(/EXP\.?\s*/gi, "") // quita "Exp." si lo pegan
        .replace(/[^0-9A-Z-]/g, "");
}

function extractExpedienteMatch(raw) {
    const up = sanitizeExpDraft(raw);
    const m1 = up.match(EXP_PATTERN_1);
    const m2 = up.match(EXP_PATTERN_2);
    return m1 ? m1[1] : m2 ? m2[1] : "";
}

function buildNrExpFromCaso(casoFinal, cod) {
    if (!cod || !casoFinal) return null;
    const M = String(casoFinal).match(CASO_PATTERN);
    if (!M) return null;

    const numero = M[1];
    const year = M[2];
    return `${cod}-${year}-${numero}-0`;
}

function buildFlexPatternFromExp(exp) {
    const up = String(exp || "").toUpperCase();
    const m = up.match(EXP_PATTERN_1) || up.match(EXP_PATTERN_2);
    if (!m) return null;

    const full = m[1];
    const parts = full.split("-");
    if (parts.length < 7) return null;

    // head = 5dig-YYYY, tail = (segment4)-(JR)-(PE)-(01)
    const head = `${parts[0]}-${parts[1]}`;
    const tail = `${parts[3]}-${parts[4]}-${parts[5]}-${parts[6]}`;

    return `${head}-[0-9]+-${tail}`;
}

export default function Caso({ initialData, onSave, onCancel }) {
    // ------------------ ESTADOS ------------------
    // ✅ Inputs (lo que el usuario teclea) — NO se bloquean
    const [casoInput, setCasoInput] = useState(
        sanitizeCasoDraft(initialData.casoParte || "")
    );
    const [expedienteInput, setExpedienteInput] = useState(
        sanitizeExpDraft(initialData.expedienteParte || "")
    );
    const [nrExp, setNrExp] = useState(finalizeNrExp(initialData.nr_de_exp_completo || ""));

    // ✅ Valores “asentados”/útiles para lógica (juzgado, build, etc.)
    const [casoParte, setCasoParte] = useState(finalizeCaso(initialData.casoParte || ""));
    const [expedienteParte, setExpedienteParte] = useState(
        extractExpedienteMatch(initialData.expedienteParte || "")
    );

    const [fiscalia, setFiscalia] = useState(initialData.fiscaliaOrigen || "");
    const [departamento, setDepartamento] = useState(initialData.departamento || "");

    // NUEVOS CAMPOS
    const [juzgado, setJuzgado] = useState(initialData.juzgado || "");
    const [despacho, setDespacho] = useState(initialData.despacho || "");

    const initCodigo =
        (finalizeNrExp(initialData.nr_de_exp_completo || "").match(FISCALIA_CODE_PATTERN)?.[1]) ||
        (initialData.nr_de_exp_completo?.split("-")[0] || "");

    const [codigoFiscalia, setCodigoFiscalia] = useState(initCodigo);
    const [fiscOptions, setFiscOptions] = useState([]);
    const [ultimaAccion, setUltimaAccion] = useState(null);

    const ultimaAccionRef = useRef(null);
    const setUltima = (k) => {
        ultimaAccionRef.current = k;
        setUltimaAccion(k);
    };

    // =============================
    // Spinners (animación cuando pega al backend)
    // =============================
    const [loadingFiscSearch, setLoadingFiscSearch] = useState(false);     // /api/get_fiscalias
    const [loadingFiscLookup, setLoadingFiscLookup] = useState(false);     // /api/fiscalia_incompleto
    const [loadingJuzgadoLookup, setLoadingJuzgadoLookup] = useState(false); // /api/juzgado_incompleto

    // =============================
    // Debounce refs
    // =============================
    const tCasoRef = useRef(null);
    const tNrExpRef = useRef(null);
    const tExpRef = useRef(null);
    const tJuzgadoRef = useRef(null);
    const tFiscSearchRef = useRef(null);

    // “stale guard” para no apagar/encender loaders en requests viejos
    const reqFiscSearchIdRef = useRef(0);
    const reqFiscLookupIdRef = useRef(0);
    const reqJuzgadoLookupIdRef = useRef(0);

    // =============================
    // AUTOCOMPLETE FISCALÍA
    // =============================
    const buscarFiscalias = async (q) => {
        const qq = String(q || "").trim();
        if (!qq) {
            setFiscOptions([]);
            setLoadingFiscSearch(false);
            return;
        }

        const myId = ++reqFiscSearchIdRef.current;
        setLoadingFiscSearch(true);

        try {
            const { data } = await axios.get(`/api/get_fiscalias`, {
                params: { query: qq },
            });
            if (myId !== reqFiscSearchIdRef.current) return; // request viejo
            setFiscOptions(data.data || []);
        } catch {
            if (myId !== reqFiscSearchIdRef.current) return;
            setFiscOptions([]);
        } finally {
            if (myId === reqFiscSearchIdRef.current) setLoadingFiscSearch(false);
        }
    };

    const buscarFiscaliasDebounced = (q) => {
        clearTimeout(tFiscSearchRef.current);
        tFiscSearchRef.current = setTimeout(() => buscarFiscalias(q), 250);
    };

    // =============================
    // SELECCIÓN DE FISCALÍA
    // =============================
    const handleSeleccionFiscalia = (sel) => {
        setUltima("fiscalia");
        if (!sel) return;

        const cod = sel.nr_de_exp_completo || "";
        setCodigoFiscalia(cod);

        setFiscalia(sel.fiscalia);
        setDepartamento(sel.departamento);

        // Si el usuario NO está editando nrExp manualmente, autocompleta nrExp desde CASO
        if (ultimaAccionRef.current !== "nrExp") {
            const casoFinal = finalizeCaso(casoInput);
            const built = buildNrExpFromCaso(casoFinal, cod);
            if (built) setNrExp(built);
        }
    };

    // =============================
    // CAMBIO EN CASO (Carpeta fiscal) — NO BLOQUEA
    // =============================
    const handleCambioCaso = (raw) => {
        setUltima("caso");
        const v = sanitizeCasoDraft(raw);
        setCasoInput(v);
    };

    // =============================
    // CAMBIO EN nrExp (Caso completo) — NO BLOQUEA
    // =============================
    const handleCambioNrExp = (raw) => {
        setUltima("nrExp");
        setNrExp(finalizeNrExp(raw));
    };

    // =============================
    // CAMBIO EN EXPEDIENTE — NO BLOQUEA
    // =============================
    const handleCambioExpediente = (raw) => {
        setUltima("expediente");
        const v = sanitizeExpDraft(raw);
        setExpedienteInput(v);
    };

    // =============================
    // MANEJO DE DESPACHO (solo 2 dígitos)
    // =============================
    const handleChangeDespacho = (raw) => {
        setUltima("despacho");
        const limpio = raw.replace(/\D/g, "").slice(0, 2);
        setDespacho(limpio);
    };

    // =====================================================================
    // ✅ DEBOUNCE: Asentar CASO y autocompletar nrExp (delay grande)
    // =====================================================================
    useEffect(() => {
        clearTimeout(tCasoRef.current);

        tCasoRef.current = setTimeout(() => {
            const finalCaso = finalizeCaso(casoInput);

            setCasoParte(finalCaso);

            if (finalCaso && finalCaso !== casoInput) {
                setCasoInput(finalCaso);
            }

            if (ultimaAccionRef.current !== "nrExp") {
                const built = buildNrExpFromCaso(finalCaso, codigoFiscalia);
                if (built && built !== nrExp) {
                    setNrExp(built);
                }
            }
        }, 900);

        return () => clearTimeout(tCasoRef.current);
       
    }, [casoInput, codigoFiscalia]);

    // =====================================================================
    // ✅ DEBOUNCE: Asentar/normalizar nrExp + lookup fiscalía (backend) (delay grande)
    // =====================================================================
    useEffect(() => {
        clearTimeout(tNrExpRef.current);

        tNrExpRef.current = setTimeout(async () => {
            const v = finalizeNrExp(nrExp);

            if (v !== nrExp) {
                setNrExp(v);
                return;
            }

            // 1) extraer código fiscalía
            const m = v.match(FISCALIA_CODE_PATTERN);
            const code = m ? m[1] : "";

            if (code && code !== codigoFiscalia) {
                setCodigoFiscalia(code);
            }

            // 2) buscar fiscalía (backend) con spinner
            if (code && ultimaAccionRef.current !== "fiscalia") {
                const myId = ++reqFiscLookupIdRef.current;
                setLoadingFiscLookup(true);

                try {
                    const { data } = await axios.get("/api/fiscalia_incompleto", {
                        params: { pattern: code },
                    });
                    if (myId !== reqFiscLookupIdRef.current) return;

                    const f = data?.[0]?.fiscalia || "";
                    const d = data?.[0]?.departamento || "";

                    if (f) setFiscalia(f);
                    if (d) setDepartamento(d);
                } catch {
                    // silenciar
                } finally {
                    if (myId === reqFiscLookupIdRef.current) setLoadingFiscLookup(false);
                }
            }

            // 3) autocompletar “-0” o construir desde CASO si corresponde
            if (code) {
                if (/^\d{6,10}-\d{4}-\d+-0$/.test(v)) return;

                if (/^\d{6,10}-\d{4}-\d+$/.test(v)) {
                    setNrExp(`${v}-0`);
                    return;
                }

                const casoFinal = finalizeCaso(casoInput);
                const built = buildNrExpFromCaso(casoFinal, code);
                if (built && built !== nrExp) {
                    setNrExp(built);
                }
            }
        }, 1200);

        return () => clearTimeout(tNrExpRef.current);
       
    }, [nrExp]);

    // =====================================================================
    // ✅ DEBOUNCE: validar EXPEDIENTE sin bloquear (y actualizar expedienteParte)
    // =====================================================================
    useEffect(() => {
        clearTimeout(tExpRef.current);

        tExpRef.current = setTimeout(() => {
            const match = extractExpedienteMatch(expedienteInput);

            if (match) {
                setExpedienteParte(match);
            } else {
                setExpedienteParte("");
                setJuzgado("");
            }
        }, 200);

        return () => clearTimeout(tExpRef.current);
    }, [expedienteInput]);

    const expedienteTieneTexto = Boolean((expedienteInput || "").trim());
    const expedienteEsValido = Boolean(expedienteParte);

    // =====================================================================
    // ✅ DEBOUNCE: autollenar JUZGADO (backend) solo si expedienteParte es válido
    // =====================================================================
    useEffect(() => {
        clearTimeout(tJuzgadoRef.current);

        tJuzgadoRef.current = setTimeout(async () => {
            if (!expedienteParte) {
                setJuzgado("");
                setLoadingJuzgadoLookup(false);
                return;
            }

            const flex = buildFlexPatternFromExp(expedienteParte);
            if (!flex) return;

            const myId = ++reqJuzgadoLookupIdRef.current;
            setLoadingJuzgadoLookup(true);

            try {
                const { data } = await axios.get("/api/juzgado_incompleto", {
                    params: { pattern: flex },
                });
                if (myId !== reqJuzgadoLookupIdRef.current) return;
                setJuzgado(data?.[0]?.juzgado_incompleto || "");
            } catch {
                // silenciar
            } finally {
                if (myId === reqJuzgadoLookupIdRef.current) setLoadingJuzgadoLookup(false);
            }
        }, 450);

        return () => clearTimeout(tJuzgadoRef.current);
    }, [expedienteParte]);

    // =====================================================================
    // GUARDAR
    // =====================================================================
    const handleGuardar = () => {
        const casoFinal = finalizeCaso(casoInput);

        const expMatch = extractExpedienteMatch(expedienteInput);
        const expFinal = expMatch || sanitizeExpDraft(expedienteInput);

        const expedienteConPrefijo =
            expFinal && expFinal.trim() !== "" ? `Exp. ${expFinal}` : "";

        const casoConPrefijo =
            casoFinal && casoFinal.trim() !== "" ? `CASO ${casoFinal}` : "";

        onSave({
            casoParte: casoConPrefijo,
            expedienteParte: expedienteConPrefijo,
            nr_de_exp_completo: finalizeNrExp(nrExp),
            fiscaliaOrigen: fiscalia,
            departamento,
            juzgado,
            despacho,
        });
    };

    // =====================================================================
    // UI
    // =====================================================================
    const showFiscaliaSpinner = loadingFiscSearch || loadingFiscLookup;

    return (
        <Box
            sx={(theme) => ({
                p: 1.25,
                borderRadius: 1.5,
                maxWidth: 1100,
                mx: "auto",
                backgroundColor:
                    theme.palette.mode === "light" ? "#f8fafc" : "rgba(15,23,42,0.97)",
                border: "1px solid",
                borderColor:
                    theme.palette.mode === "light"
                        ? "rgba(148,163,184,0.4)"
                        : "rgba(148,163,184,0.6)",
            })}
        >
            <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 0.75 }}
            >
                <Typography variant="subtitle2">Datos del caso</Typography>
                <Chip label="Rápido" size="small" color="primary" />
            </Stack>

            {/* Fila muy compacta de DEPARTAMENTO */}
            <Box
                sx={{
                    mb: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    flexWrap: "wrap",
                }}
            >
                <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ whiteSpace: "nowrap" }}
                >
                    Depto.:
                </Typography>
                <TextField
                    label="Departamento"
                    size="small"
                    value={departamento}
                    onChange={(e) => {
                        setUltima("departamento");
                        setDepartamento(e.target.value);
                    }}
                    sx={{ width: 180 }}
                    InputLabelProps={{ shrink: true }}
                    placeholder="Ej. Lima"
                />
            </Box>

            <Grid container spacing={1}>
                {/* ================= MINISTERIO PÚBLICO ================= */}
                <Grid item xs={12} md={7}>
                    <Paper
                        variant="outlined"
                        sx={(theme) => ({
                            p: 1,
                            borderRadius: 1.25,
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            gap: 0.75,
                            borderColor:
                                theme.palette.mode === "light"
                                    ? "rgba(148,163,184,0.35)"
                                    : "rgba(148,163,184,0.6)",
                            backgroundColor:
                                theme.palette.mode === "light"
                                    ? "#ffffff"
                                    : "rgba(15,23,42,0.95)",
                        })}
                    >
                        <Stack
                            direction="row"
                            alignItems="center"
                            spacing={0.5}
                            sx={{ mb: 0.25 }}
                        >
                            <Chip label="MP" size="small" color="primary" />
                            <Typography variant="caption">Ministerio Público</Typography>
                        </Stack>

                        <Grid container spacing={0.75}>
                            {/* CARPETA FISCAL */}
                            <Grid item xs={12} md={6}>
                                <TextField
                                    label="Carpeta fiscal"
                                    placeholder="173-2024"
                                    fullWidth
                                    size="small"
                                    value={casoInput}
                                    onChange={(e) => handleCambioCaso(e.target.value)}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">CASO</InputAdornment>
                                        ),
                                    }}
                                    InputLabelProps={{ shrink: true }}
                                />
                            </Grid>

                            {/* CASO COMPLETO */}
                            <Grid item xs={12} md={6}>
                                <Tooltip
                                    title="Autocompleta al dejar de teclear. Si consulta datos del MP, verás un spinner."
                                    placement="top"
                                    arrow
                                >
                                    <TextField
                                        label="Caso completo"
                                        placeholder="2406020602-2024-173-0"
                                        fullWidth
                                        size="small"
                                        value={nrExp}
                                        inputProps={{ inputMode: "numeric", pattern: "[0-9-]*" }}
                                        onChange={(e) => handleCambioNrExp(e.target.value)}
                                        InputLabelProps={{ shrink: true }}
                                        InputProps={{
                                            endAdornment: (
                                                <InputAdornment position="end">
                                                    {loadingFiscLookup ? (
                                                        <CircularProgress size={16} />
                                                    ) : null}
                                                </InputAdornment>
                                            ),
                                        }}
                                    />
                                </Tooltip>
                            </Grid>

                            {/* FISCALÍA + DESPACHO */}
                            <Grid item xs={12} md={9}>
                                <Autocomplete
                                    fullWidth
                                    size="small"
                                    freeSolo
                                    options={fiscOptions}
                                    getOptionLabel={(o) =>
                                        typeof o === "string" ? o : o.fiscalia
                                    }
                                    onInputChange={(_, v, r) => {
                                        if (r === "input") buscarFiscaliasDebounced(v);
                                        setFiscalia(v);
                                        setUltima("fiscalia");
                                    }}
                                    onChange={(_, sel) => handleSeleccionFiscalia(sel)}
                                    inputValue={fiscalia}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            label="Fiscalía"
                                            multiline
                                            maxRows={2}
                                            InputLabelProps={{
                                                ...params.InputLabelProps,
                                                shrink: true,
                                            }}
                                            placeholder="Ej. F.P. Corrupción de Funcionarios"
                                            InputProps={{
                                                ...params.InputProps,
                                                endAdornment: (
                                                    <>
                                                        {showFiscaliaSpinner ? (
                                                            <CircularProgress size={16} sx={{ mr: 1 }} />
                                                        ) : null}
                                                        {params.InputProps.endAdornment}
                                                    </>
                                                ),
                                            }}
                                            helperText={showFiscaliaSpinner ? "Buscando fiscalía…" : " "}
                                        />
                                    )}
                                />
                            </Grid>

                            <Grid
                                item
                                xs={12}
                                md={3}
                                sx={{
                                    display: "flex",
                                    alignItems: "flex-start",
                                    justifyContent: { xs: "flex-start", md: "flex-end" },
                                }}
                            >
                                <TextField
                                    label="Desp."
                                    size="small"
                                    value={despacho}
                                    onChange={(e) => handleChangeDespacho(e.target.value)}
                                    inputProps={{
                                        inputMode: "numeric",
                                        pattern: "[0-9]*",
                                        maxLength: 2,
                                        style: { textAlign: "center" },
                                    }}
                                    InputLabelProps={{ shrink: true }}
                                    placeholder="01"
                                    sx={{ width: 60 }}
                                />
                            </Grid>
                        </Grid>
                    </Paper>
                </Grid>

                {/* ================= PODER JUDICIAL ================= */}
                <Grid item xs={12} md={5}>
                    <Paper
                        variant="outlined"
                        sx={(theme) => ({
                            p: 1,
                            borderRadius: 1.25,
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            gap: 0.75,
                            borderColor:
                                theme.palette.mode === "light"
                                    ? "rgba(148,163,184,0.35)"
                                    : "rgba(148,163,184,0.6)",
                            backgroundColor:
                                theme.palette.mode === "light"
                                    ? "#ffffff"
                                    : "rgba(15,23,42,0.95)",
                        })}
                    >
                        <Stack
                            direction="row"
                            alignItems="center"
                            spacing={0.5}
                            sx={{ mb: 0.25 }}
                        >
                            <Chip label="PJ" size="small" color="secondary" />
                            <Typography variant="caption">Poder Judicial</Typography>
                        </Stack>

                        <Grid container spacing={0.75}>
                            {/* EXPEDIENTE JUDICIAL */}
                            <Grid item xs={12}>
                                <TextField
                                    label="Expediente judicial"
                                    placeholder="01365-2024-3-1702-JR-PE-01"
                                    fullWidth
                                    size="small"
                                    value={expedienteInput}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">Exp.</InputAdornment>
                                        ),
                                    }}
                                    InputLabelProps={{ shrink: true }}
                                    onChange={(e) => handleCambioExpediente(e.target.value)}
                                    error={expedienteTieneTexto && !expedienteEsValido}
                                    helperText={
                                        expedienteTieneTexto && !expedienteEsValido
                                            ? "Formato no válido (aún). Ej: 01365-2024-3-1702-JR-PE-01"
                                            : " "
                                    }
                                />
                            </Grid>

                            {/* JUZGADO (multilínea) */}
                            <Grid item xs={12}>
                                <TextField
                                    label="Juzgado"
                                    fullWidth
                                    size="small"
                                    value={juzgado}
                                    onChange={(e) => setJuzgado(e.target.value)}
                                    InputLabelProps={{ shrink: true }}
                                    placeholder="Ej. 3er Juzgado de Investigación Preparatoria"
                                    multiline
                                    minRows={2}
                                    maxRows={3}
                                    InputProps={{
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                {loadingJuzgadoLookup ? (
                                                    <CircularProgress size={16} />
                                                ) : null}
                                            </InputAdornment>
                                        ),
                                    }}
                                    helperText={loadingJuzgadoLookup ? "Buscando juzgado…" : " "}
                                />
                            </Grid>
                        </Grid>
                    </Paper>
                </Grid>
            </Grid>

            {ultimaAccion && (
                <Box sx={{ mt: 0.75 }}>
                    <Typography variant="caption" color="text.secondary">
                        Última: {ACCION_LABELS[ultimaAccion] || ultimaAccion}
                    </Typography>
                </Box>
            )}

            <Divider sx={{ my: 1.25 }} />

            <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 0.75 }}>
                <Button variant="outlined" size="small" onClick={onCancel}>
                    Cancelar
                </Button>
                <Button variant="contained" size="small" onClick={handleGuardar}>
                    Guardar
                </Button>
            </Box>
        </Box>
    );
}
