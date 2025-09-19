import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import debounce from 'lodash.debounce';
import { useDropzone } from 'react-dropzone';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import {
    Box,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    Grid,
    InputLabel,
    MenuItem,
    Modal,
    Select,
    TextField,
    Typography,
    Autocomplete,
} from '@mui/material';

import BulkUpdateButton from '../../BOX-PLAZOS/BulkUpdateButton';

const API_BASE_URL = 'http://10.50.5.49:5001'; // ajusta si es necesario

axios.defaults.withCredentials = true;

const modalBoxSx = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 800,
    bgcolor: 'background.paper',
    border: '2px solid #000',
    boxShadow: 24,
    p: 4,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    maxHeight: '90vh',
    overflowY: 'auto'
};

export default function Ingresos({ onRefresh, query }) {
    // ─────────── Autocontenido: auth mínima sin props ───────────
    // ─────────── Autocontenido: auth mínima sin props ───────────
    const [whoami, setWhoami] = useState({ role: 'user', username: '' });

    useEffect(() => {
        (async () => {
            try {
                const { data } = await axios.get(`${API_BASE_URL}/api/me`, { withCredentials: true });
                setWhoami({
                    role: data?.role || 'user',
                    username: data?.username || ''
                });
            } catch {
                setWhoami({ role: 'user', username: '' });
            }
        })();
    }, []);

    const isAdmin = useMemo(() => whoami.role === 'admin', [whoami]);

    // ─────────── UI: botón que abre/cierra modal ───────────
    const [openModal, setOpenModal] = useState(false);
    const open = () => setOpenModal(true);
    const close = () => {
        setShowBulkStep(false);
        setOpenModal(false);
    };

    // ─────────── Estado principal del caso ───────────
    const [tipoRegistro, setTipoRegistro] = useState('LEGAJO');
    const [nuevoCaso, setNuevoCaso] = useState({
        abogado: '',
        registro_ppu: '',
        denunciado: '',
        origen: '',
        'nr de exp completo': '',
        delito: '',
        departamento: '',
        fiscalia: '',
        juzgado: '',
        informe_juridico: '',
        e_situacional: '',
        tipo_ingreso: ''
    });

    // PPU
    const [registroGenerado, setRegistroGenerado] = useState('');
    const [anioRegistro, setAnioRegistro] = useState('');
    const [casoEspecial, setCasoEspecial] = useState(false);
    const [numeroManual, setNumeroManual] = useState('');
    const [sufijo, setSufijo] = useState('');
    const [registrosExistentes, setRegistrosExistentes] = useState([]);

    // Fiscalía + expediente en juzgado
    const [fiscaliaOptions, setFiscaliaOptions] = useState([]);
    const [mostrarExpedienteJuzgado, setMostrarExpedienteJuzgado] = useState(false);
    const [expedienteJuzgado, setExpedienteJuzgado] = useState({
        campo1: '', campo2: '', campo3: '', campo4: '', campo5: '', campo6: '', campo7: ''
    });
    const [erroresExpediente, setErroresExpediente] = useState({});
    const [fiscaliaCode, setFiscaliaCode] = useState('');
    const [despachoNumber, setDespachoNumber] = useState('');

    // PDF + sugerencia de juzgado
    const [filePDF, setFilePDF] = useState(null);
    const [uploadDone, setUploadDone] = useState(false);
    const [suggestedJuzgado, setSuggestedJuzgado] = useState('');
    const [noPdf, setNoPdf] = useState(false);

    // Fase 2 (plazos)
    const [showBulkStep, setShowBulkStep] = useState(false);

    // ─────────── Utilidades ───────────
    const isFormValid = useCallback(() => {
        const {
            abogado = '',
            denunciado = '',
            delito = '',
            departamento = '',
            tipo_ingreso = '',
        } = nuevoCaso;

        return (
            abogado.trim() !== '' &&
            denunciado.trim() !== '' &&
            delito.trim() !== '' &&
            departamento.trim() !== '' &&
            tipo_ingreso.trim() !== '' &&
            (uploadDone || noPdf)
        );
    }, [nuevoCaso, uploadDone, noPdf]);

    const resetForm = () => {
        setNuevoCaso({
            abogado: '',
            registro_ppu: '',
            denunciado: '',
            origen: '',
            'nr de exp completo': '',
            delito: '',
            departamento: '',
            fiscalia: '',
            juzgado: '',
            informe_juridico: '',
            e_situacional: '',
            tipo_ingreso: ''
        });
        setRegistroGenerado('');
        setUploadDone(false);
        setFilePDF(null);
        setMostrarExpedienteJuzgado(false);
        setExpedienteJuzgado({ campo1: '', campo2: '', campo3: '', campo4: '', campo5: '', campo6: '', campo7: '' });
        setErroresExpediente({});
        setDespachoNumber('');
        setNoPdf(false);
    };

    // ─────────── Generar PPU ───────────
    const generarRegistroPPU = async () => {
        try {
            const payload = { tipo: tipoRegistro, year: anioRegistro, caso_especial: casoEspecial };
            if (casoEspecial) { payload.numero = numeroManual; payload.sufijo = sufijo; }

            const { data } = await axios.post(`${API_BASE_URL}/api/generar_registro`, payload);
            setRegistroGenerado(data.registro_ppu);
            setNuevoCaso(p => ({ ...p, registro_ppu: data.registro_ppu }));

            // opcional: traer existentes para visibilidad
            try {
                const r2 = await axios.get(`${API_BASE_URL}/api/registros_existentes`, { params: { year: anioRegistro, tipo: tipoRegistro } });
                setRegistrosExistentes(r2.data?.data || []);
            } catch { /* opcional */ }
        } catch (err) {
            alert(`Error: ${err.response?.data?.error || err.message}`);
        }
    };

    // ─────────── Upload PDF y sugerencia de juzgado ───────────
    const handlePDFChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) { setUploadDone(false); return; }
        setFilePDF(file);
        const form = new FormData();
        form.append('file', file);
        try {
            const { data } = await axios.post(`${API_BASE_URL}/api/upload_and_suggest`, form, { withCredentials: true });
            const sugerido = data.suggested_juzgado || '';
            setSuggestedJuzgado(sugerido);
            setNuevoCaso(prev => ({ ...prev, juzgado: sugerido }));
            setUploadDone(true);
        } catch {
            alert('Error al subir o procesar el PDF');
            setUploadDone(false);
        }
    };

    // ─────────── Fiscalía / expediente helpers ───────────
    const validateExpediente = (campo, valor) => {
        let error = '';
        switch (campo) {
            case 'campo1':
                if (!/^\d{5}$/.test(valor)) error = 'Debe tener exactamente 5 dígitos.'; break;
            case 'campo2': {
                const num2 = parseInt(valor, 10);
                if (!/^\d{4}$/.test(valor) || isNaN(num2) || num2 < 1900 || num2 > 3000) error = 'Debe tener 4 dígitos entre 1900 y 3000.';
                break;
            }
            case 'campo3':
                if (!/^\d{1,3}$/.test(valor)) error = 'Debe tener entre 1 y 3 dígitos.'; break;
            case 'campo4':
                if (!/^\d{4}$/.test(valor)) error = 'Debe tener exactamente 4 dígitos.'; break;
            case 'campo5':
                if (!/^[A-Z]{2}$/.test(valor)) error = 'Debe tener exactamente 2 letras.'; break;
            case 'campo6':
                if (!/^[A-Z]{2}$/.test(valor)) error = 'Debe tener exactamente 2 letras.'; break;
            case 'campo7':
                if (!/^\d{1,2}$/.test(valor)) error = 'Debe tener entre 1 y 2 dígitos.'; break;
            default: break;
        }
        setErroresExpediente(prev => ({ ...prev, [campo]: error }));
    };


    const handleExpedienteChange = (campo, valor) => {
        setExpedienteJuzgado(prev => ({ ...prev, [campo]: valor }));
        validateExpediente(campo, valor);
    };

    const handleOrigenPasteExpediente = (e) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('Text').trim();

        const regex = /(\d{5})-(\d{4})-(\d{1,2})-(\d{4}[A-Z\d]*)-([A-Z]{2})-([A-Z]{2})-(\d{1,2})/;
        const match = pastedData.match(regex);

        if (match) {
            const [, campo1, campo2, campo3, campo4, campo5, campo6, campo7] = match;
            const newExpediente = {
                campo1,
                campo2,
                campo3,
                campo4,
                campo5,
                campo6,
                campo7,
            };

            Object.entries(newExpediente).forEach(([key, value]) => {
                validateExpediente(key, value);
            });

            setExpedienteJuzgado(newExpediente);
        } else {
            alert('Formato de expediente inválido. Revise el texto copiado.');
        }
    };

    const [fiscaliaOptionsNuevoCaso, setFiscaliaOptionsNuevoCaso] = useState([]);

    const fetchFiscaliasNuevoCaso = useCallback(
        debounce(async (inputValue) => {
            if (!inputValue) {
                setFiscaliaOptionsNuevoCaso([]);
                return;
            }
            try {
                const response = await axios.get(`${API_BASE_URL}/api/get_fiscalias`, {
                    params: { query: inputValue }
                });
                setFiscaliaOptionsNuevoCaso(response.data.data);
            } catch (error) {
                console.error("Error al obtener fiscalias para el nuevo caso:", error);
            }
        }, 500),
        [API_BASE_URL]
    );

    const handleFiscaliaInputChange = (event, newInputValue) => {
        setNuevoCaso(prevCaso => ({ ...prevCaso, fiscalia: newInputValue }));
        fetchFiscaliasNuevoCaso(newInputValue);
    };



    const handleFiscaliaChange = (event, newValue) => {
        if (newValue) {
            const code = newValue.nr_de_exp_completo; // ej. "3006014505"
            setFiscaliaCode(code);

            const origen = nuevoCaso.origen || '';
            const m = origen.match(/^(\d+)-(\d{4})$/);
            // si coincide “123-2025” => m[1]==="123", m[2]==="2025"
            const full = m
                ? `${code}-${m[2]}-${m[1]}-0`
                : `${code}-`;

            setNuevoCaso(prev => ({
                ...prev,
                fiscalia: newValue.fiscalia,
                departamento: newValue.departamento,
                origen: origen,
                'nr de exp completo': full,
            }));
        } else {
            // limpieza completa al deseleccionar
            setFiscaliaCode('');
            setNuevoCaso(prev => ({
                ...prev,
                fiscalia: '',
                departamento: '',
                'nr de exp completo': '',
            }));
        }
    };
    const handleCasoCortoChange = e => {
        const value = e.target.value;
        if (/[^0-9-]/.test(value)) {
            alert('Sólo se permiten dígitos y guiones');
            return;
        }

        setNuevoCaso(prev => {
            const m = value.match(/^(\d+)-(\d{4})$/);
            const full = (fiscaliaCode && m)
                ? `${fiscaliaCode}-${m[2]}-${m[1]}-0`
                : '';
            return {
                ...prev,
                origen: value,
                'nr de exp completo': full,
            };
        });
    };





    // ─────────── Crear / Eliminar ───────────
    const agregarCaso = async () => {
        try {
            /* 1.  Validaciones & normalizaciones ─────────────────────────────── */
            let origenValue = nuevoCaso.origen || "";

            if (mostrarExpedienteJuzgado) {
                const hayErrores = Object.values(erroresExpediente).some((e) => e);
                if (hayErrores) {
                    alert("Corrija los errores en el expediente.");
                    return;
                }
                const vacíos = Object.values(expedienteJuzgado).some((v) => !v.trim());
                if (vacíos) {
                    alert("Complete todos los campos del expediente.");
                    return;
                }
            }

            if (/^\d/.test(origenValue)) origenValue = `CASO ${origenValue}`;

            /* 2.  Construimos el payload para /api/agregar ───────────────────── */
            const { item, ...dataToSend } = nuevoCaso;         // quitamos 'item'
            dataToSend.origen = origenValue;
            dataToSend.tipo_ingreso = nuevoCaso.tipo_ingreso;
            delete dataToSend.e_situacional;                   // lo pone el back-end

            if (dataToSend.fiscalia && despachoNumber) {
                dataToSend.fiscalia = `${dataToSend.fiscalia} - ${despachoNumber} DESPACHO`;
            }
            if (tipoRegistro === "LEGAJO") delete dataToSend.informe_juridico;
            if (tipoRegistro === "DENUNCIA") delete dataToSend.origen;
            if (mostrarExpedienteJuzgado) dataToSend.expediente_juzgado = expedienteJuzgado;

            /* 3.  Alta en el servidor ────────────────────────────────────────── */
            const { data } = await axios.post(`${API_BASE_URL}/api/agregar`, dataToSend);

            // 4.  Guardamos el PPU definitivo y pasamos a la Fase-2
            setRegistroGenerado(data.registro_ppu);   // <-- NECESARIO para BulkUpdate
            setShowBulkStep(true);                    // muestra el BulkUpdateButton

            // (NO limpiamos nada más; se limpiará al cerrar/guardar la Fase-2)
            onRefresh?.();                   // refresca la tabla principal
            alert("Caso agregado. Ahora ingresa los plazos.");
        } catch (error) {
            console.error("Error:", error);
            alert(`Error: ${error.response?.data?.error || error.message}`);
        }
    };

    const eliminarCaso = async () => {
        try {
            await axios.post(`${API_BASE_URL}/api/eliminar`, { registro_ppu: nuevoCaso.registro_ppu });
            alert("Caso eliminado.");
            setNuevoCaso({
                abogado: '',
                registro_ppu: '',
                denunciado: '',
                origen: '',
                'nr de exp completo': '',
                delito: '',
                departamento: '',
                fiscalia: '',
                juzgado: '',
                informe_juridico: '',
                e_situacional: ''
            });
            setRegistroGenerado('');
            setDespachoNumber('');
            onRefresh?.();
        } catch (error) {
            console.error("Error:", error);
            alert(`Error: ${error.response?.data?.error || error.message}`);
        }
    };

    // ─────────── Upload múltiple de PDFs para impulso (opcional) ───────────
    const [openImpulsoUpload, setOpenImpulsoUpload] = useState(false);
    const [accionDetail, setAccionDetail] = useState('');
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const onDrop = useCallback(
        files => {
            const pdfs = files.filter(f => f.type === 'application/pdf');
            if (uploadedFiles.length + pdfs.length > 4) {
                pdfs.splice(4 - uploadedFiles.length);
            }
            setUploadedFiles(prev => [...prev, ...pdfs]);
        },
        [uploadedFiles]
    );
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/pdf': ['.pdf'] },
        multiple: true
    });
    const handleRemoveFile = i => {
        setUploadedFiles(prev => prev.filter((_, idx) => idx !== i));
    };

    const handleUploadPDFs = async () => {
        if (!accionDetail || !impulsoTempSeleccionado || uploadedFiles.length === 0) {
            alert("Es obligatorio ingresar la acción, seleccionar una fila de impulso y cargar al menos un PDF.");
            return;
        }
        const form = new FormData();
        uploadedFiles.forEach(f => form.append('pdfs', f));
        form.append('accion', accionDetail);
        Object.entries(impulsoTempSeleccionado).forEach(([k, v]) => {
            form.append(k.replace(/\s+/g, '_'), v || '');
        });
        try {
            await axios.post(`${API_BASE_URL}/api/impulso/upload`, form, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            alert("Operación completada");
            setUploadedFiles([]);
            setAccionDetail('');
            setOpenImpulsoUploadModal(false);
        } catch {
            alert("Error en la operación");
        }
    };
    useEffect(() => {
        const nrExp = nuevoCaso['nr de exp completo'];
        const origen = nuevoCaso.origen;
        if (nrExp.endsWith('-') && origen.includes('-')) {
            const origenParts = origen.split('-');
            if (origenParts.length >= 2) {
                const numeros2 = origenParts[1];
                const numeros1 = origenParts[0];
                const nrExpCompleto = nrExp + numeros2 + '-' + numeros1 + '-0';
                setNuevoCaso(prevCaso => ({ ...prevCaso, 'nr de exp completo': nrExpCompleto }));
            }
        }
    }, [nuevoCaso['nr de exp completo'], nuevoCaso.origen]);

    // ─────────── Render ───────────
    return (
        <>
            {isAdmin && (
                <Button variant="contained" color="primary" onClick={open} fullWidth>
                    Ingresar Nuevo Caso
                </Button>
            )}

            <Modal open={openModal} onClose={close}>
                <Box sx={modalBoxSx}>
                    {!showBulkStep ? (
                        <>
                            <Typography variant="h6">Crear Registro PPU</Typography>

                            {/* tipo registro, año, caso especial … */}
                            <FormControl fullWidth>
                                <InputLabel>Tipo de Registro</InputLabel>
                                <Select
                                    value={tipoRegistro}
                                    label="Tipo de Registro"
                                    onChange={(e) => {
                                        setTipoRegistro(e.target.value);
                                        setMostrarExpedienteJuzgado(false);
                                        setExpedienteJuzgado({
                                            campo1: '', campo2: '', campo3: '',
                                            campo4: '', campo5: '', campo6: '', campo7: ''
                                        });
                                        setErroresExpediente({});
                                    }}
                                >
                                    <MenuItem value="LEGAJO">LEGAJO</MenuItem>
                                    <MenuItem value="DENUNCIA">DENUNCIA</MenuItem>
                                </Select>
                            </FormControl>

                            <TextField
                                label="Año de Registro"
                                value={anioRegistro}
                                onChange={(e) => setAnioRegistro(e.target.value)}
                                fullWidth
                            />

                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={casoEspecial}
                                        onChange={(e) => setCasoEspecial(e.target.checked)}
                                    />
                                }
                                label="¿Caso especial?"
                            />

                            {casoEspecial && (
                                <>
                                    <TextField
                                        label="Número"
                                        value={numeroManual}
                                        onChange={(e) => setNumeroManual(e.target.value)}
                                        fullWidth
                                    />
                                    <TextField
                                        label="Sufijo"
                                        value={sufijo}
                                        onChange={(e) => setSufijo(e.target.value)}
                                        fullWidth
                                    />
                                </>
                            )}

                            <Button variant="contained" onClick={generarRegistroPPU} fullWidth>
                                Generar Registro PPU
                            </Button>

                            <Typography variant="subtitle1">Registros Existentes</Typography>
                            <ul style={{ maxHeight: 200, overflowY: 'auto' }}>
                                {registrosExistentes.map((reg) => (
                                    <li key={reg}>{reg}</li>
                                ))}
                            </ul>

                            {registroGenerado && (
                                <>
                                    <Typography variant="h6">
                                        Registro PPU Generado: {registroGenerado}
                                    </Typography>

                                    {/* ─────── CAMPOS PRINCIPALES ─────── */}
                                    <TextField
                                        required
                                        label="ABOGADO"
                                        value={nuevoCaso.abogado}
                                        disabled={!isAdmin}
                                        onChange={isAdmin ? (e) => setNuevoCaso(p => ({ ...p, abogado: e.target.value })) : undefined}
                                        fullWidth
                                    />

                                    <TextField
                                        label="REGISTRO PPU"
                                        value={nuevoCaso.registro_ppu}
                                        disabled
                                        fullWidth
                                    />

                                    <TextField
                                        required
                                        label="DENUNCIADO"
                                        value={nuevoCaso.denunciado}
                                        onChange={(e) =>
                                            setNuevoCaso((p) => ({ ...p, denunciado: e.target.value }))
                                        }
                                        fullWidth
                                    />

                                    {/* —— campos específicos si es LEGAJO —— */}
                                    {tipoRegistro === 'LEGAJO' && (
                                        <>
                                            <TextField
                                                label="CASO FISCAL CORTO"
                                                value={nuevoCaso.origen}
                                                onChange={handleCasoCortoChange}
                                                fullWidth
                                            />

                                            <Autocomplete
                                                options={fiscaliaOptionsNuevoCaso}
                                                getOptionLabel={o => o.fiscalia || ''}
                                                isOptionEqualToValue={(option, value) =>
                                                    option.nr_de_exp_completo === value?.nr_de_exp_completo
                                                }
                                                onInputChange={handleFiscaliaInputChange}
                                                onChange={handleFiscaliaChange}
                                                inputValue={nuevoCaso.fiscalia}
                                                renderInput={(params) => (
                                                    <TextField {...params} label="FISCALÍA" fullWidth />
                                                )}
                                            />

                                            <TextField
                                                label="CASO FISCAL COMPLETO"
                                                value={nuevoCaso['nr de exp completo']}
                                                InputProps={{ readOnly: true }}
                                                fullWidth
                                            />

                                            <FormControlLabel
                                                control={
                                                    <Checkbox
                                                        checked={mostrarExpedienteJuzgado}
                                                        onChange={(e) => setMostrarExpedienteJuzgado(e.target.checked)}
                                                    />
                                                }
                                                label="Marcar si hay expediente en juzgado"
                                            />

                                            {mostrarExpedienteJuzgado && (
                                                <Box sx={{ mt: 2 }}>
                                                    <Typography variant="subtitle1">
                                                        Expediente en Juzgado
                                                    </Typography>
                                                    <Grid container spacing={2} alignItems="center">
                                                        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                                                            <Grid
                                                                item
                                                                xs={12}
                                                                sm={6}
                                                                md={i <= 4 ? 2 : 1}
                                                                key={`campo${i}`}
                                                            >
                                                                <TextField
                                                                    label={`Campo ${i}`}
                                                                    value={expedienteJuzgado[`campo${i}`]}
                                                                    onChange={(e) =>
                                                                        handleExpedienteChange(`campo${i}`, e.target.value)
                                                                    }
                                                                    error={!!erroresExpediente[`campo${i}`]}
                                                                    helperText={erroresExpediente[`campo${i}`]}
                                                                    onPaste={i === 1 ? handleOrigenPasteExpediente : undefined}
                                                                    fullWidth
                                                                />
                                                            </Grid>
                                                        ))}
                                                    </Grid>
                                                </Box>
                                            )}
                                        </>
                                    )}

                                    {/* —— campos comunes —— */}
                                    <TextField
                                        required
                                        label="DELITO"
                                        value={nuevoCaso.delito}
                                        onChange={(e) =>
                                            setNuevoCaso((p) => ({ ...p, delito: e.target.value }))
                                        }
                                        fullWidth
                                    />

                                    <TextField
                                        required
                                        label="DEPARTAMENTO"
                                        value={nuevoCaso.departamento}
                                        onChange={(e) =>
                                            setNuevoCaso((p) => ({ ...p, departamento: e.target.value }))
                                        }
                                        fullWidth
                                    />

                                    {/* PDF + juzgado sugerido */}
                                    <Box sx={{ mb: 2 }}>
                                        {!noPdf && (
                                            <>
                                                <input
                                                    type="file"
                                                    accept="application/pdf"
                                                    onChange={handlePDFChange}
                                                />
                                                {!uploadDone ? (
                                                    <Typography color="error" variant="body2">
                                                        * Debe subir un PDF para continuar o marcar "No hay evidencia virtual"
                                                    </Typography>
                                                ) : (
                                                    <Typography variant="body2">
                                                        ✔ PDF subido: {filePDF?.name}
                                                    </Typography>
                                                )}
                                            </>
                                        )}

                                        <Button
                                            variant="outlined"
                                            sx={{ mt: 1 }}
                                            onClick={() => {
                                                const next = !noPdf;
                                                setNoPdf(next);
                                                if (next) {
                                                    setFilePDF(null);
                                                    setUploadDone(false);
                                                }
                                            }}
                                        >
                                            {noPdf ? "Desmarcar 'No hay evidencia virtual'" : "No hay evidencia virtual"}
                                        </Button>
                                    </Box>

                                    <TextField
                                        label="JUZGADO"
                                        value={nuevoCaso.juzgado}
                                        onChange={(e) =>
                                            setNuevoCaso((p) => ({ ...p, juzgado: e.target.value }))
                                        }
                                        helperText={suggestedJuzgado ? `Sugerido: ${suggestedJuzgado}` : ""}
                                        fullWidth
                                    />

                                    {nuevoCaso.fiscalia && (
                                        <TextField
                                            label="DIGITE N° DE DESPACHO"
                                            value={despachoNumber}
                                            onChange={(e) => setDespachoNumber(e.target.value)}
                                            fullWidth
                                        />
                                    )}

                                    <FormControl required fullWidth>
                                        <InputLabel id="tipo-ingreso-label">Tipo de ingreso</InputLabel>
                                        <Select
                                            labelId="tipo-ingreso-label"
                                            value={nuevoCaso.tipo_ingreso}
                                            label="Tipo de ingreso"
                                            onChange={(e) =>
                                                setNuevoCaso((p) => ({ ...p, tipo_ingreso: e.target.value }))
                                            }
                                        >
                                            <MenuItem value="INGRESO NUEVO">Ingreso nuevo</MenuItem>
                                            <MenuItem value="CONSULTA">Consulta</MenuItem>
                                        </Select>
                                    </FormControl>

                                    <Grid container spacing={2}>
                                        <Grid item xs={12} md={6}>
                                            <Button
                                                variant="contained"
                                                color="success"
                                                onClick={agregarCaso}
                                                fullWidth
                                                disabled={!isFormValid()}
                                            >
                                                Guardar caso
                                            </Button>
                                        </Grid>
                                        <Grid item xs={12} md={6}>
                                            <Button
                                                variant="outlined"
                                                color="error"
                                                onClick={eliminarCaso}
                                                fullWidth
                                                disabled={!nuevoCaso.registro_ppu}
                                            >
                                                Eliminar caso
                                            </Button>
                                        </Grid>
                                    </Grid>

                                    <Box display="flex" justifyContent="flex-end" mt={1}>
                                        <Button variant="text" onClick={resetForm}>Limpiar formulario</Button>
                                    </Box>
                                </>
                            )}
                        </>
                    ) : (
                        <>
                            <Typography variant="h6">Fase 2: Plazos del caso</Typography>
                                <BulkUpdateButton
                                    registro={{ ...nuevoCaso, registro_ppu: registroGenerado }}
                                    pdfFile={filePDF}
                                    open
                                    onClose={() => {
                                        setShowBulkStep(false);
                                        setOpenModal(false);
                                        resetForm();
                                    }}
                                    onUpdated={() => {
                                        setShowBulkStep(false);
                                        setOpenModal(false);
                                        resetForm();
                                        onRefresh?.();   // ← usa el callback del padre
                                    }}
                                />


                        </>
                    )}
                </Box>
            </Modal>

            {/* (Opcional) Diálogo para subir PDFs de impulso ligados al PPU recién creado */}
            <Dialog open={openImpulsoUpload} onClose={() => setOpenImpulsoUpload(false)} fullWidth maxWidth="md">
                <DialogTitle>Adjuntar PDFs de impulso</DialogTitle>
                <DialogContent>
                    <TextField
                        label="Acción / Detalle"
                        value={accionDetail}
                        onChange={(e) => setAccionDetail(e.target.value)}
                        fullWidth
                        margin="dense"
                    />
                    <Box
                        {...getRootProps()}
                        sx={{ border: '2px dashed #999', borderRadius: 2, p: 2, mt: 2, textAlign: 'center', cursor: 'pointer' }}
                    >
                        <input {...getInputProps()} />
                        <Typography variant="body2">
                            {isDragActive ? 'Suelta los PDFs aquí...' : 'Arrastra PDFs o haz clic para seleccionar (máx. 4)'}
                        </Typography>
                    </Box>
                    <ul>
                        {uploadedFiles.map((f, i) => (
                            <li key={i}>
                                {f.name} <Button size="small" onClick={() => removeFileAt(i)}>Quitar</Button>
                            </li>
                        ))}
                    </ul>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenImpulsoUpload(false)}>Cancelar</Button>
                    <Button
                        variant="contained"
                        onClick={handleUploadPDFs}
                        disabled={!registroGenerado || uploadedFiles.length === 0 || !accionDetail.trim()}
                    >
                        Subir
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );

}
