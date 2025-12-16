// src/components/principal/common-principal/caso/caso.jsx

import React, { useState, useEffect } from "react";
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

export default function Caso({ initialData, onSave, onCancel }) {
    // ------------------ ESTADOS ------------------
    const [casoParte, setCasoParte] = useState(initialData.casoParte || "");
    const [expedienteParte, setExpedienteParte] = useState(
        initialData.expedienteParte || ""
    );

    const [nrExp, setNrExp] = useState(initialData.nr_de_exp_completo || "");
    const [fiscalia, setFiscalia] = useState(initialData.fiscaliaOrigen || "");
    const [departamento, setDepartamento] = useState(
        initialData.departamento || ""
    );

    // NUEVOS CAMPOS
    const [juzgado, setJuzgado] = useState(initialData.juzgado || "");
    const [despacho, setDespacho] = useState(initialData.despacho || "");

    const [codigoFiscalia, setCodigoFiscalia] = useState(
        initialData.nr_de_exp_completo?.split("-")[0] || ""
    );

    const [fiscOptions, setFiscOptions] = useState([]);

    const [ultimaAccion, setUltimaAccion] = useState(null);

    // =====================================================================
    // 🔥 CONSTRUIR CASO FISCAL COMPLETO
    // =====================================================================
    const buildCasoFiscalCompleto = (
        nuevoCaso = casoParte,
        cod = codigoFiscalia
    ) => {
        if (!cod || !nuevoCaso) return;

        const M = nuevoCaso.match(CASO_PATTERN);
        if (!M) return;

        const numero = M[1];
        const year = M[2];

        setNrExp(`${cod}-${year}-${numero}-0`);
    };

    // =====================================================================
    // AUTOCOMPLETE FISCALÍA
    // =====================================================================
    const buscarFiscalias = async (q) => {
        if (!q.trim()) {
            setFiscOptions([]);
            return;
        }
        try {
            const { data } = await axios.get(`/api/get_fiscalias`, {
                params: { query: q },
            });
            setFiscOptions(data.data);
        } catch {
            setFiscOptions([]);
        }
    };

    // =====================================================================
    // SELECCIÓN DE FISCALÍA
    // =====================================================================
    const handleSeleccionFiscalia = (sel) => {
        setUltimaAccion("fiscalia");
        if (!sel) return;

        const cod = sel.nr_de_exp_completo || "";
        setCodigoFiscalia(cod);

        setFiscalia(sel.fiscalia);
        setDepartamento(sel.departamento);

        buildCasoFiscalCompleto(casoParte, cod);
    };

    // =====================================================================
    // CAMBIO EN CASO (Carpeta fiscal)
    // =====================================================================
    const handleCambioCaso = (raw) => {
        setUltimaAccion("caso");

        let v = raw.replace(/[^0-9-]/g, "");

        let parts = v.split("-");
        if (parts.length > 2) parts = [parts[0], parts[1]];

        if (parts[0]?.startsWith("0")) {
            parts[0] = parts[0].replace(/^0+/, "");
        }

        if (parts[1] && parts[1].length > 4) {
            parts[1] = parts[1].substring(0, 4);
        }

        const limpio = parts.join("-");
        setCasoParte(limpio);

        buildCasoFiscalCompleto(limpio, codigoFiscalia);
    };

    // =====================================================================
    // 🔥 DETECTAR Y LIMPIAR EXPEDIENTE COMPLEJO (nrExp)
    // =====================================================================
    const handleCambioNrExp = async (raw) => {
        setUltimaAccion("nrExp");

        const soloNumerosGuiones = raw.replace(/[^0-9-]/g, "");
        setNrExp(soloNumerosGuiones);

        // 1) EXTRAER CÓDIGO DE FISCALÍA (primer bloque numérico)
        const m = soloNumerosGuiones.match(FISCALIA_CODE_PATTERN);
        const code = m ? m[1] : null;

        if (code) setCodigoFiscalia(code);

        // 2) BUSCAR FISCALÍA — mismo backend de antes
        if (code) {
            try {
                const { data } = await axios.get("/api/fiscalia_incompleto", {
                    params: { pattern: code },
                });

                const f = data[0]?.fiscalia || fiscalia;
                const d = data[0]?.departamento || departamento;

                setFiscalia(f);
                setDepartamento(d);
            } catch (err) {
                // silenciar
            }
        }

        // 3) RECONSTRUIR CASO FISCAL COMPLETO (lógica original)

        // Detectar año
        let year = null;

        // Intento 1 → año desde expediente
        const mExp = expedienteParte.match(/\b(\d{4})\b/);
        if (mExp) year = mExp[1];

        // Intento 2 → año desde caso (NNNN-AAAA)
        const mCaso = casoParte.match(/-(\d{4})$/);
        if (!year && mCaso) year = mCaso[1];

        // Si nada → año actual
        if (!year) year = String(new Date().getFullYear());

        // Número del caso limpio
        const casoLimpio = casoParte.replace(/^caso\s*/i, "").trim();

        if (code && casoLimpio) {
            setNrExp(`${code}-${year}-${casoLimpio}-0`);
        }
    };

    // =====================================================================
    // GUARDAR
    // =====================================================================
    const handleGuardar = () => {
        const expedienteConPrefijo =
            expedienteParte && expedienteParte.trim() !== ""
                ? `Exp. ${expedienteParte}`
                : "";

        const casoConPrefijo =
            casoParte && casoParte.trim() !== "" ? `CASO ${casoParte}` : "";

        onSave({
            casoParte: casoConPrefijo,
            expedienteParte: expedienteConPrefijo,
            nr_de_exp_completo: nrExp,
            fiscaliaOrigen: fiscalia,
            departamento,
            juzgado,
            despacho,
        });
    };

    // =====================================================================
    // MANEJO DE DESPACHO (solo 2 dígitos)
    // =====================================================================
    const handleChangeDespacho = (raw) => {
        setUltimaAccion("despacho");
        const limpio = raw.replace(/\D/g, "").slice(0, 2);
        setDespacho(limpio);
    };

    // 🔥 SANEAR TODO APENAS SE ABRE EL POPUP
    useEffect(() => {
        // --- 1) Sanear CARPETA FISCAL (casoParte) ---
        if (initialData.casoParte) {
            let raw = initialData.casoParte;
            let v = raw.replace(/[^0-9-]/g, "");
            let parts = v.split("-");
            if (parts.length > 2) parts = [parts[0], parts[1]];
            if (parts[0]?.startsWith("0")) {
                parts[0] = parts[0].replace(/^0+/, "");
            }
            if (parts[1] && parts[1].length > 4) {
                parts[1] = parts[1].substring(0, 4);
            }
            const limpioCaso = parts.join("-");
            setCasoParte(limpioCaso);
            buildCasoFiscalCompleto(limpioCaso, codigoFiscalia);
        }

        // --- 2) Sanear EXPEDIENTE ---
        if (initialData.expedienteParte) {
            const raw = (initialData.expedienteParte || "").toUpperCase();

            const m1 = raw.match(EXP_PATTERN_1);
            const m2 = raw.match(EXP_PATTERN_2);

            const limpioExp = m1 ? m1[1] : m2 ? m2[1] : "";
            setExpedienteParte(limpioExp);

            // Buscar juzgado si expediente limpio existe
            if (limpioExp) {
                const match =
                    limpioExp.match(EXP_PATTERN_1) || limpioExp.match(EXP_PATTERN_2);
                if (match) {
                    const flex = match[1].replace(
                        /(\d{5}-\d{4})-\d+-(\d{4}-[A-Z]{2}-[A-Z]{2}-\d{1,2})/,
                        "$1-[0-9]+-$2"
                    );
                    axios
                        .get("/api/juzgado_incompleto", { params: { pattern: flex } })
                        .then(({ data }) => {
                            setJuzgado(data?.[0]?.juzgado_incompleto || "");
                        })
                        .catch(() => {
                            /* silenciar */
                        });
                }
            }
        }
    }, []); // ← SOLO LA PRIMERA VEZ

    // ▶ AUTOLLENAR JUZGADO CUANDO HAYA EXPEDIENTE LIMPIO (nrExp o expedienteParte)
    useEffect(() => {
        const exp = (expedienteParte || nrExp || "").toUpperCase();

        // si ya no hay expediente ni nrExp, limpia también el juzgado
        if (!exp) {
            setJuzgado("");
            return;
        }

        const match = exp.match(EXP_PATTERN_1) || exp.match(EXP_PATTERN_2);
        if (!match) return;

        const flex = match[1].replace(
            /(\d{5}-\d{4})-\d+-(\d{4}-[A-Z]{2}-[A-Z]{2}-\d{1,2})/,
            "$1-[0-9]+-$2"
        );

        axios
            .get("/api/juzgado_incompleto", { params: { pattern: flex } })
            .then(({ data }) => {
                setJuzgado(data?.[0]?.juzgado_incompleto || "");
            })
            .catch(() => {
                /* silenciar */
            });
    }, [expedienteParte, nrExp]);

    // =====================================================================
    // UI (EXTRA COMPACTO, CARD MÁS ANCHA)
    // =====================================================================
    return (
        <Box
            sx={(theme) => ({
                p: 1.25,
                borderRadius: 1.5,
                maxWidth: 1100,   // ⬅️ MÁS ANCHO
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
                        setUltimaAccion("departamento");
                        setDepartamento(e.target.value);
                    }}
                    sx={{ width: 180 }}
                    InputLabelProps={{ shrink: true }}
                    placeholder="Ej. Lima"
                />
            </Box>

            <Grid container spacing={1}>
                {/* ================= MINISTERIO PÚBLICO (más ancho) ================= */}
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
                                theme.palette.mode === "light" ? "#ffffff" : "rgba(15,23,42,0.95)",
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
                            {/* CARPETA FISCAL (casoParte) + CASO COMPLETO (nrExp) */}
                            <Grid item xs={12} md={6}>
                                <TextField
                                    label="Carpeta fiscal"
                                    placeholder="173-2024"
                                    fullWidth
                                    size="small"
                                    value={casoParte}
                                    onChange={(e) => handleCambioCaso(e.target.value)}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">CASO</InputAdornment>
                                        ),
                                    }}
                                    InputLabelProps={{ shrink: true }}
                                />
                            </Grid>

                            <Grid item xs={12} md={6}>
                                <Tooltip
                                    title="Código fiscalía + año + carpeta + 0"
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
                                        if (r === "input") buscarFiscalias(v);
                                        setFiscalia(v);
                                        setUltimaAccion("fiscalia");
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

                {/* ================= PODER JUDICIAL (más angosto) ================= */}
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
                                theme.palette.mode === "light" ? "#ffffff" : "rgba(15,23,42,0.95)",
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
                                    value={expedienteParte}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">Exp.</InputAdornment>
                                        ),
                                    }}
                                    InputLabelProps={{ shrink: true }}
                                    onChange={(e) => {
                                        setUltimaAccion("expediente");

                                        const raw = (e.target.value || "").toUpperCase();

                                        const m1 = raw.match(EXP_PATTERN_1);
                                        const m2 = raw.match(EXP_PATTERN_2);

                                        let limpio = "";
                                        if (m1) limpio = m1[1];
                                        else if (m2) limpio = m2[1];

                                        setExpedienteParte(limpio);

                                        if (!limpio) {
                                            setJuzgado("");
                                            return;
                                        }

                                        const match =
                                            limpio.match(EXP_PATTERN_1) || limpio.match(EXP_PATTERN_2);
                                        if (!match) return;

                                        const flex = match[1].replace(
                                            /(\d{5}-\d{4})-\d+-(\d{4}-[A-Z]{2}-[A-Z]{2}-\d{1,2})/,
                                            "$1-[0-9]+-$2"
                                        );

                                        axios
                                            .get("/api/juzgado_incompleto", {
                                                params: { pattern: flex },
                                            })
                                            .then(({ data }) => {
                                                setJuzgado(data?.[0]?.juzgado_incompleto || "");
                                            })
                                            .catch(() => {
                                                /* silenciar */
                                            });
                                    }}
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
