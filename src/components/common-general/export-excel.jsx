// Archivo: src/components/common-general/export-excel.jsx
// Requiere: @mui/material, axios, date-fns
// Admin  -> abre popup profesional (fechas opcional + abogado opcional + tipo + archivados) y llama al backend (blob)
//          UX mejorado: SIN checkboxes. Si NO llenas fechas => histórico. Si llenas ambas => filtra.
// User   -> genera XLSX en frontend con exportarExcelCustom (selección actual)

import React, { useMemo, useState, useCallback } from "react";
import {
    Button,
    CircularProgress,
    Box,
    Snackbar,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Typography,
    Divider,
    TextField,
    Chip,
    Autocomplete,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import axios from "axios";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { exportarExcelCustom } from "../utils/exportarExcelCustom";

function parseFilenameFromContentDisposition(cd) {
    if (!cd) return "";
    const s = String(cd);

    const m =
        s.match(/filename\*\s*=\s*UTF-8''([^;]+)(?:;|$)/i) ||
        s.match(/filename\s*=\s*"?([^";]+)"?(?:;|$)/i);

    if (!m) return "";
    const raw = m[1] || "";
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

function downloadBlob(blob, fileName) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "export.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
}

const isValidISODate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

export default function ExportExcelButton({
    role,
    apiBaseUrl,
    buildBuscarParams,
    query, // compat, en admin NO se usa
    fromApplied, // compat, en admin NO se usa
    toApplied,
    datosFiltrados,
    fullColumns,
    sx,
    labelAdmin = "Exportación global",
    labelUser = "Exportar selección actual",
    forceMode, // "admin" | "user" | undefined

    // 👇 NUEVO: lista de abogados para el popup (si no se pasa, usa fallback local)
    abogadoOptions,
}) {
    const [exporting, setExporting] = useState(false);
    const [cooldown, setCooldown] = useState(false);

    const [toast, setToast] = useState({
        open: false,
        severity: "info",
        msg: "",
    });

    const mode = useMemo(() => {
        if (forceMode === "admin" || forceMode === "user") return forceMode;
        return role === "admin" ? "admin" : "user";
    }, [forceMode, role]);

    const isDisabled = exporting || cooldown;

    const buttonLabel = useMemo(() => {
        if (exporting) return "Exportando…";
        return mode === "admin" ? labelAdmin : labelUser;
    }, [exporting, mode, labelAdmin, labelUser]);

    // Mantener verde aunque esté disabled (evita “oscurecer feo”)
    const sxDisabledKeepGreen = useMemo(
        () => ({
            "&.Mui-disabled": {
                opacity: 0.92,
                color: "#fff",
                backgroundColor: sx?.backgroundColor ? sx.backgroundColor : undefined,
                boxShadow: "0 8px 18px rgba(0,0,0,0.25)",
            },
        }),
        [sx]
    );

    const spinnerSx = useMemo(() => ({ color: "rgba(255,255,255,0.95)" }), []);

    const shimmerWhenExporting = useMemo(
        () =>
            exporting
                ? {
                    "&::after": {
                        content: '""',
                        position: "absolute",
                        inset: 0,
                        background:
                            "linear-gradient(120deg, rgba(255,255,255,0.00), rgba(255,255,255,0.20), rgba(255,255,255,0.00))",
                        transform: "translateX(-120%)",
                        animation: "exportShimmer 1.05s linear infinite",
                        pointerEvents: "none",
                    },
                    "@keyframes exportShimmer": {
                        "0%": { transform: "translateX(-120%)" },
                        "100%": { transform: "translateX(120%)" },
                    },
                }
                : {},
        [exporting]
    );

    // ─────────────────────────────────────────────────────────────
    // POPUP ADMIN: fechas (opcional) + abogado (lista) + tipo + archivados
    // Default: histórico completo (NO manda from/to), tipo ALL, archivados true
    // ─────────────────────────────────────────────────────────────
    const [adminOpen, setAdminOpen] = useState(false);

    const [adminFrom, setAdminFrom] = useState("");
    const [adminTo, setAdminTo] = useState("");

    // abogado desde lista (string)
    const [adminAbogado, setAdminAbogado] = useState("");

    // tipo: ALL | LEGAJO | DENUNCIA
    const [adminTipo, setAdminTipo] = useState("ALL");

    // archivados: true (por defecto) / false
    const [adminMostrarArchivados, setAdminMostrarArchivados] = useState(true);

    // Fallback local si no te pasan abogadoOptions
    const abogadoList = useMemo(() => {
        const fallback = [
            "CUBA",
            "AGUILAR",
            "POLO",
            "MAU",
            "ASCURRA",
            "MARTINEZ",
            "FLORES",
            "PALACIOS",
            "POMAR",
            "ROJAS",
            "FRISANCHO",
            "NAVARRO",
        ];
        const raw = Array.isArray(abogadoOptions) ? abogadoOptions : fallback;
        // normaliza, quita vacíos, únicos, orden alfabético
        const clean = Array.from(
            new Set(
                raw
                    .map((x) => String(x || "").trim().toUpperCase())
                    .filter(Boolean)
            )
        );
        clean.sort((a, b) => a.localeCompare(b));
        return clean;
    }, [abogadoOptions]);

    const dateTouched = useMemo(
        () => Boolean(adminFrom || adminTo),
        [adminFrom, adminTo]
    );
    const dateRangeActive = useMemo(
        () => Boolean(adminFrom && adminTo),
        [adminFrom, adminTo]
    );

    const adminSummaryChips = useMemo(() => {
        const chips = [];

        chips.push(
            <Chip
                key="date"
                size="small"
                label={
                    !dateTouched
                        ? "Fechas: (histórico)"
                        : dateRangeActive
                            ? `Fechas: ${adminFrom} → ${adminTo}`
                            : "Fechas: (incompleto)"
                }
                sx={{ fontWeight: 900 }}
            />
        );

        chips.push(
            <Chip
                key="abg"
                size="small"
                label={adminAbogado ? `Abogado: ${adminAbogado}` : "Abogado: (todos)"}
                sx={{ fontWeight: 900 }}
            />
        );

        chips.push(
            <Chip
                key="tipo"
                size="small"
                label={
                    adminTipo === "ALL"
                        ? "Tipo: Todos"
                        : adminTipo === "LEGAJO"
                            ? "Tipo: Legajos"
                            : "Tipo: Denuncias"
                }
                sx={{ fontWeight: 900 }}
            />
        );

        chips.push(
            <Chip
                key="arch"
                size="small"
                label={
                    adminMostrarArchivados
                        ? "Archivados: Incluidos"
                        : "Archivados: Excluidos"
                }
                sx={{ fontWeight: 900 }}
            />
        );

        return chips;
    }, [dateTouched, dateRangeActive, adminFrom, adminTo, adminAbogado, adminTipo, adminMostrarArchivados]);

    const validateAdminOptions = useCallback(() => {
        // No tocó fechas => histórico OK
        if (!dateTouched) return { ok: true, msg: "" };

        // Tocó fechas pero no completó ambas
        if (!adminFrom || !adminTo) {
            return {
                ok: false,
                msg: "Completa ambas fechas para filtrar por rango (o limpia las dos para histórico).",
            };
        }

        if (!isValidISODate(adminFrom) || !isValidISODate(adminTo)) {
            return { ok: false, msg: "Fechas inválidas. Usa formato YYYY-MM-DD." };
        }

        if (adminTo < adminFrom) {
            return {
                ok: false,
                msg: "Rango inválido: 'Hasta' no puede ser menor que 'Desde'.",
            };
        }

        return { ok: true, msg: "" };
    }, [dateTouched, adminFrom, adminTo]);

    const buildAdminParams = useCallback(() => {
        const base =
            typeof buildBuscarParams === "function" ? buildBuscarParams("", {}) : {};

        // Por defecto histórico: NO mandar from/to
        delete base.from;
        delete base.to;

        // Si llenó ambas fechas => sí mandamos from/to
        if (adminFrom && adminTo) {
            base.from = adminFrom;
            base.to = adminTo;
        }

        // Abogado opcional (solo si eligió)
        const abg = String(adminAbogado || "").trim().toUpperCase();
        if (abg) base.abogado = abg;
        else delete base.abogado;

        // Tipo (ALL | LEGAJO | DENUNCIA)
        base.tipo = (adminTipo || "ALL").toUpperCase();

        // Archivados (true/false)
        base.mostrar_archivados = adminMostrarArchivados ? "true" : "false";

        // Admin: sin búsqueda global para no confundir
        base.query = "";

        return base;
    }, [
        buildBuscarParams,
        adminFrom,
        adminTo,
        adminAbogado,
        adminTipo,
        adminMostrarArchivados,
    ]);

    const runExportGlobal_admin = useCallback(async () => {
        if (!apiBaseUrl) throw new Error("apiBaseUrl no definido");

        const v = validateAdminOptions();
        if (!v.ok) throw new Error(v.msg);

        const params = buildAdminParams();

        const resp = await axios.get(`${apiBaseUrl}/api/exportar_excel`, {
            params,
            responseType: "blob",
            withCredentials: true,
        });

        const cd = resp.headers?.["content-disposition"] || "";
        let fileName = parseFilenameFromContentDisposition(cd);

        if (!fileName) {
            const fecha = format(new Date(), "dd-MM-yyyy HH'h'mm'm'", { locale: es });
            const rangeTxt = adminFrom && adminTo ? `${adminFrom}_a_${adminTo}` : "HISTORICO";
            const abgTxt = adminAbogado ? `-${String(adminAbogado).trim().toUpperCase()}` : "";
            const tipoTxt =
                adminTipo === "ALL" ? "-ALL" : adminTipo === "LEGAJO" ? "-LEGAJOS" : "-DENUNCIAS";
            const archTxt = adminMostrarArchivados ? "-CON_ARCHIVO" : "-SIN_ARCHIVO";
            fileName = `Penal - Export${abgTxt}${tipoTxt}${archTxt} - ${rangeTxt} - ${fecha}.xlsx`;
        }

        const blob = new Blob([resp.data], {
            type:
                resp.headers?.["content-type"] ||
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        downloadBlob(blob, fileName);
    }, [
        apiBaseUrl,
        validateAdminOptions,
        buildAdminParams,
        adminFrom,
        adminTo,
        adminAbogado,
        adminTipo,
        adminMostrarArchivados,
    ]);

    // ─────────────────────────────────────────────────────────────
    // USER export local (selección actual)
    // ─────────────────────────────────────────────────────────────
    const runExportSelection_user = useCallback(async () => {
        const cols = (fullColumns || []).filter((c) => c.field !== "acciones");

        if (!Array.isArray(datosFiltrados) || datosFiltrados.length === 0) {
            setToast({
                open: true,
                severity: "warning",
                msg: "No hay registros para exportar.",
            });
            return;
        }

        await exportarExcelCustom(
            datosFiltrados.map(({ id, ...rest }) => rest),
            cols
        );
    }, [datosFiltrados, fullColumns]);

    const doExport = useCallback(
        async (adminConfirmed = false) => {
            if (isDisabled) return;

            // Admin: si no está confirmado, abre popup
            if (mode === "admin" && !adminConfirmed) {
                setAdminFrom("");
                setAdminTo("");
                setAdminAbogado("");
                setAdminTipo("ALL");
                setAdminMostrarArchivados(true);
                setAdminOpen(true);
                return;
            }

            setExporting(true);
            setToast({ open: true, severity: "info", msg: "Generando Excel…" });

            try {
                if (mode === "admin") {
                    await runExportGlobal_admin();
                    setToast({ open: true, severity: "success", msg: "Excel descargado." });
                } else {
                    await runExportSelection_user();
                    setToast({ open: true, severity: "success", msg: "Excel generado." });
                }

                setCooldown(true);
                setTimeout(() => setCooldown(false), 900);
            } catch (err) {
                console.error("Error al exportar Excel:", err);

                // Si el backend te devuelve blob con JSON de error, intentamos leerlo
                let msg = err?.response?.data?.error || err?.message || "Error al exportar Excel.";
                const data = err?.response?.data;
                const isBlob = data instanceof Blob;

                if (isBlob) {
                    try {
                        const text = await data.text();
                        const j = JSON.parse(text);
                        msg = j?.error || msg;
                    } catch {
                        // ignora
                    }
                }

                setToast({
                    open: true,
                    severity: "error",
                    msg,
                });
            } finally {
                setExporting(false);
            }
        },
        [isDisabled, mode, runExportGlobal_admin, runExportSelection_user]
    );

    const handleExportClick = useCallback(() => {
        doExport(false);
    }, [doExport]);

    const handleAdminConfirmExport = useCallback(async () => {
        setAdminOpen(false);
        await doExport(true);
    }, [doExport]);

    const adminConfirmDisabled = useMemo(() => {
        if (exporting) return true;
        const v = validateAdminOptions();
        return !v.ok;
    }, [exporting, validateAdminOptions]);

    const adminValidationText = useMemo(() => {
        const v = validateAdminOptions();
        return v.ok ? "" : v.msg;
    }, [validateAdminOptions]);

    return (
        <>
            <Button
                size="small"
                variant="contained"
                startIcon={!exporting ? <DownloadIcon /> : null}
                onClick={handleExportClick}
                disabled={isDisabled}
                sx={{
                    position: "relative",
                    overflow: "hidden",
                    minWidth: 230,
                    minHeight: 36,
                    fontWeight: 950,
                    borderRadius: 1.8,
                    textTransform: "none",
                    boxShadow: "0 8px 18px rgba(0,0,0,0.25)",
                    ...(sx || {}),
                    ...sxDisabledKeepGreen,
                    ...shimmerWhenExporting,
                }}
            >
                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                    {exporting ? <CircularProgress size={18} thickness={5} sx={spinnerSx} /> : null}
                    <span>{buttonLabel}</span>
                </Box>
            </Button>

            {/* POPUP ADMIN */}
            <Dialog
                open={adminOpen}
                onClose={() => setAdminOpen(false)}
                fullWidth
                maxWidth="sm"
                PaperProps={{
                    sx: {
                        borderRadius: 3,
                        overflow: "hidden",
                        boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
                    },
                }}
            >
                <DialogTitle
                    sx={{
                        fontWeight: 950,
                        letterSpacing: 0.4,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 2,
                        pb: 1.2,
                    }}
                >
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                        <Typography sx={{ fontWeight: 950, fontSize: 16 }}>
                            Exportación Excel (Admin)
                        </Typography>
                        <Typography sx={{ opacity: 0.8, fontSize: 12 }}>
                            Por defecto: exporta TODO el histórico. Si llenas ambas fechas, filtra por fecha_ingreso.
                        </Typography>
                    </Box>

                    <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {adminSummaryChips}
                    </Box>
                </DialogTitle>

                <Divider />

                <DialogContent sx={{ pt: 2 }}>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.8 }}>
                        {/* Fechas */}
                        <Box
                            sx={{
                                border: "1px solid rgba(17,24,39,0.10)",
                                borderRadius: 2.2,
                                p: 1.4,
                            }}
                        >
                            <Typography sx={{ fontWeight: 900, mb: 0.6 }}>
                                Filtrar por fecha_ingreso <span style={{ opacity: 0.6 }}>(opcional)</span>
                            </Typography>

                            <Box
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr" },
                                    gap: 1.2,
                                }}
                            >
                                <TextField
                                    label="Desde"
                                    type="date"
                                    value={adminFrom}
                                    onChange={(e) => setAdminFrom(e.target.value)}
                                    size="small"
                                    InputLabelProps={{ shrink: true }}
                                />
                                <TextField
                                    label="Hasta"
                                    type="date"
                                    value={adminTo}
                                    onChange={(e) => setAdminTo(e.target.value)}
                                    size="small"
                                    InputLabelProps={{ shrink: true }}
                                />
                            </Box>

                            <Typography sx={{ mt: 1, fontSize: 12, opacity: 0.78 }}>
                                {!dateTouched
                                    ? "Si no indicas fechas, se exportará todo el histórico."
                                    : dateRangeActive
                                        ? "Se exportará únicamente el rango indicado."
                                        : "Te falta completar una de las fechas (o limpia ambas para histórico)."}
                            </Typography>

                            {adminValidationText ? (
                                <Typography sx={{ mt: 0.8, fontSize: 12, fontWeight: 900, color: "#B91C1C" }}>
                                    {adminValidationText}
                                </Typography>
                            ) : null}
                        </Box>

                        {/* Abogado (lista) */}
                        <Box
                            sx={{
                                border: "1px solid rgba(17,24,39,0.10)",
                                borderRadius: 2.2,
                                p: 1.4,
                            }}
                        >
                            <Typography sx={{ fontWeight: 900, mb: 0.6 }}>
                                Filtrar por abogado <span style={{ opacity: 0.6 }}>(opcional)</span>
                            </Typography>

                            <Autocomplete
                                options={abogadoList}
                                value={adminAbogado || null}
                                onChange={(_, v) => setAdminAbogado(String(v || "").toUpperCase())}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Selecciona abogado (opcional)"
                                        size="small"
                                        placeholder="(Todos)"
                                    />
                                )}
                                clearOnEscape
                                autoHighlight
                            />

                            <Typography sx={{ mt: 0.8, fontSize: 12, opacity: 0.78 }}>
                                Si lo dejas vacío, exporta todos los abogados (según permisos del backend).
                            </Typography>
                        </Box>

                        {/* Tipo (todos/legajos/denuncias) */}
                        <Box
                            sx={{
                                border: "1px solid rgba(17,24,39,0.10)",
                                borderRadius: 2.2,
                                p: 1.4,
                            }}
                        >
                            <Typography sx={{ fontWeight: 900, mb: 0.6 }}>
                                Tipo de registro <span style={{ opacity: 0.6 }}>(opcional)</span>
                            </Typography>

                            <Autocomplete
                                options={[
                                    { label: "Todos", value: "ALL" },
                                    { label: "Legajos", value: "LEGAJO" },
                                    { label: "Denuncias", value: "DENUNCIA" },
                                ]}
                                value={
                                    adminTipo === "LEGAJO"
                                        ? { label: "Legajos", value: "LEGAJO" }
                                        : adminTipo === "DENUNCIA"
                                            ? { label: "Denuncias", value: "DENUNCIA" }
                                            : { label: "Todos", value: "ALL" }
                                }
                                onChange={(_, v) => setAdminTipo(String(v?.value || "ALL").toUpperCase())}
                                renderInput={(params) => (
                                    <TextField {...params} label="Selecciona tipo" size="small" />
                                )}
                                isOptionEqualToValue={(a, b) => a?.value === b?.value}
                                clearOnEscape={false}
                            />

                            <Typography sx={{ mt: 0.8, fontSize: 12, opacity: 0.78 }}>
                                Por defecto: Todos (ALL).
                            </Typography>
                        </Box>

                        {/* Archivados (incluir / excluir) */}
                        <Box
                            sx={{
                                border: "1px solid rgba(17,24,39,0.10)",
                                borderRadius: 2.2,
                                p: 1.4,
                            }}
                        >
                            <Typography sx={{ fontWeight: 900, mb: 0.6 }}>
                                Archivados <span style={{ opacity: 0.6 }}>(opcional)</span>
                            </Typography>

                            <Autocomplete
                                options={[
                                    { label: "Incluir archivados", value: "true" },
                                    { label: "Excluir archivados", value: "false" },
                                ]}
                                value={
                                    adminMostrarArchivados
                                        ? { label: "Incluir archivados", value: "true" }
                                        : { label: "Excluir archivados", value: "false" }
                                }
                                onChange={(_, v) => setAdminMostrarArchivados((v?.value || "true") === "true")}
                                renderInput={(params) => (
                                    <TextField {...params} label="Selecciona" size="small" />
                                )}
                                isOptionEqualToValue={(a, b) => a?.value === b?.value}
                                clearOnEscape={false}
                            />

                            <Typography sx={{ mt: 0.8, fontSize: 12, opacity: 0.78 }}>
                                Por defecto: incluye archivados (mostrar_archivados=true).
                            </Typography>
                        </Box>
                    </Box>
                </DialogContent>

                <Divider />

                <DialogActions sx={{ p: 2, gap: 1 }}>
                    <Button
                        variant="outlined"
                        onClick={() => setAdminOpen(false)}
                        sx={{ textTransform: "none", fontWeight: 900, borderRadius: 2 }}
                    >
                        Cancelar
                    </Button>

                    <Button
                        variant="contained"
                        startIcon={<DownloadIcon />}
                        onClick={handleAdminConfirmExport}
                        disabled={adminConfirmDisabled || exporting}
                        sx={{
                            textTransform: "none",
                            fontWeight: 950,
                            borderRadius: 2,
                            minWidth: 220,
                            ...(sx || {}),
                            "&.Mui-disabled": {
                                opacity: 0.88,
                                color: "#fff",
                                backgroundColor: sx?.backgroundColor ? sx.backgroundColor : undefined,
                            },
                        }}
                    >
                        Descargar Excel
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={toast.open}
                autoHideDuration={toast.severity === "error" ? 4000 : 2200}
                onClose={() => setToast((p) => ({ ...p, open: false }))}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    onClose={() => setToast((p) => ({ ...p, open: false }))}
                    severity={toast.severity}
                    variant="filled"
                    sx={{ fontWeight: 800 }}
                >
                    {toast.msg}
                </Alert>
            </Snackbar>
        </>
    );
}
