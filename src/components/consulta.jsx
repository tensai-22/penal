
import React, { useEffect, useState, useCallback } from 'react';
import debounce from 'lodash/debounce';
import axios from 'axios';
import DecisionCoordinadorModal from './DecisionCoordinadorModal';


import {
    Box,
    Button,
    TextField,
    FormControl,
    Checkbox,
    FormControlLabel,
    Grid,
    Typography,
    Modal,
    Autocomplete
} from '@mui/material';
import './Consulta.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://10.50.5.49:5001/api';

function Consulta() {



    // Estados para la consulta
    const [constulas, setConstulas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const fetchFiscaliasNuevoCaso = useCallback(
        debounce(async (inputValue) => {
            if (!inputValue) {
                setFiscaliaOptionsNuevoCaso([]);
                return;
            }
            try {
                const response = await axios.get(`${API_BASE_URL}/get_fiscalias`, {
                    params: { query: inputValue },
                    withCredentials: true
                });
                setFiscaliaOptionsNuevoCaso(response.data.data || []);
            } catch (error) {
                console.error("Error al obtener fiscalías:", error);
            }
        }, 500),
        [API_BASE_URL]
    );



    const [pdfFile, setPdfFile] = useState(null);

    const handlePDFChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setPdfFile(e.target.files[0]);
        }
    };

    const [activeSheet, setActiveSheet] = useState(1);

    const sheet1Columns = [
        "consulta_ppu",
        "abogado",
        "denunciado",
        "origen",
        "nr_de_exp_completo",
        "fiscalia",
        "departamento",
        "juzgado",
        "delito"
    ];
    const sheet2Columns = [
        "consulta_ppu", // índice
        "informe_juridico",
        "item",
        "e_situacional",
        "fecha_ingreso",
        "fecha_e_situacional",
        "etiqueta",
        "registro_ppu",
        "decision_coordinador"
    ];






    // Estados para el modal de ingreso de nuevo caso
    const [openModal, setOpenModal] = useState(false);
    const [anioRegistro, setAnioRegistro] = useState(new Date().getFullYear().toString());
    const [registroGenerado, setRegistroGenerado] = useState('');
    const [registrosExistentes, setRegistrosExistentes] = useState([]);

    const [nuevoCaso, setNuevoCaso] = useState({
        abogado: '',
        consulta_ppu: '',
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

    const [mostrarExpedienteJuzgado, setMostrarExpedienteJuzgado] = useState(false);
    const [expedienteJuzgado, setExpedienteJuzgado] = useState({
        campo1: '',
        campo2: '',
        campo3: '',
        campo4: '',
        campo5: '',
        campo6: '',
        campo7: ''
    });
    const [erroresExpediente, setErroresExpediente] = useState({});
    const [despachoNumber, setDespachoNumber] = useState('');
    const [fiscaliaOptionsNuevoCaso, setFiscaliaOptionsNuevoCaso] = useState([]);

    // Obtención de datos para la tabla de consulta
    useEffect(() => {
        fetchConstulas();
    }, []);

    const fetchConstulas = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`${API_BASE_URL}/consulta_ppupenal`, {
                credentials: 'include'
            });
            const data = await response.json();
            if (data.success) {
                setConstulas(data.constulas);
            } else {
                setError(data.message || 'Error al obtener constulas');
            }
        } catch (err) {
            console.error("Error de red:", err);
            setError('Error de red al obtener constulas');
        } finally {
            setLoading(false);
        }
    };

    // Agregar estos estados al inicio del componente Consulta:
    const [openDecisionModal, setOpenDecisionModal] = useState(false);
    const [currentConsultaPPU, setCurrentConsultaPPU] = useState('');

    // Función para abrir el modal de decision_coordinador:
    const handleOpenDecisionModal = (consultaPPU) => {
        setCurrentConsultaPPU(consultaPPU);
        setOpenDecisionModal(true);
    };

    // Función para cerrar el modal:
    const handleCloseDecisionModal = () => {
        setOpenDecisionModal(false);
        setCurrentConsultaPPU('');
    };

    // Modificar la función renderTable:
    const renderTable = (columns) => (
        <div className="table-responsive">
            <table className="consulta-table">
                <thead>
                    <tr>
                        {columns.map((col, idx) => (
                            <th key={idx}>{col}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {constulas.map((row, index) => (
                        <tr key={index}>
                            {columns.map((col, idx) => (
                                <td key={idx}>
                                    {col === 'decision_coordinador' ? (
                                        <Button
                                            variant="outlined"
                                            onClick={() => handleOpenDecisionModal(row.consulta_ppu)}
                                        >
                                            Editar
                                        </Button>
                                    ) : (
                                        row[col] || ''
                                    )}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    // Se obtienen los registros existentes usando el nuevo endpoint
    const obtenerRegistros = async () => {
        try {
            const response = await fetch(
                `${API_BASE_URL}/get_registros_consulta?year=${anioRegistro}`,
                { credentials: 'include' }
            );
            const data = await response.json();
            if (data.data) {
                setRegistrosExistentes(data.data);
            } else {
                console.error("Error al obtener registros:", data.error);
            }
        } catch (err) {
            console.error("Error en obtenerRegistros:", err);
        }
    };

    useEffect(() => {
        if (openModal) {
            obtenerRegistros();
        }
    }, [openModal]);


    const handleModalClose = () => {
        setOpenModal(false);
        setRegistroGenerado('');
        setNuevoCaso({
            abogado: '',
            consulta_ppu: '',
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
        setPdfFile(null);
        setMostrarExpedienteJuzgado(false);
        setExpedienteJuzgado({
            campo1: '',
            campo2: '',
            campo3: '',
            campo4: '',
            campo5: '',
            campo6: '',
            campo7: ''
        });
        setErroresExpediente({});
        setDespachoNumber('');
    };


    const generarRegistroPPU = async () => {
        try {
            const payload = { year: anioRegistro };
            console.log("Enviando payload a /generar_registro_consulta:", payload);

            const response = await fetch(`${API_BASE_URL}/generar_registro_consulta`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            console.log("Respuesta HTTP de /generar_registro_consulta:", response);

            const result = await response.json();
            console.log("Resultado parseado de /generar_registro_consulta:", result);

            if (result.success) {
                // Copia los datos del estado nuevoCaso
                const dataToSend = { ...nuevoCaso };
                console.log("dataToSend:", dataToSend);

                // Se asegura que el campo consulta_ppu contenga el valor generado
                dataToSend.consulta_ppu = dataToSend.consulta_ppu || result.registro_ppu;

                console.log("Registro generado correctamente:", result.registro_ppu);
                setRegistroGenerado(result.registro_ppu);
                setNuevoCaso(prev => ({ ...prev, consulta_ppu: result.registro_ppu }));
            } else {
                console.warn("Error reportado en /generar_registro_consulta:", result.message);
                alert(result.message || 'Error al generar registro');
            }
        } catch (err) {
            console.error("Excepción al generar registro PPU:", err);
            alert("Error al generar registro PPU");
        }
    };




    const validateExpediente = (campo, valor) => {
        let error = '';
        switch (campo) {
            case 'campo1':
                if (!/^\d{5}$/.test(valor)) {
                    error = 'Debe tener exactamente 5 dígitos.';
                }
                break;
            case 'campo2': {
                const num2 = parseInt(valor, 10);
                if (!/^\d{4}$/.test(valor) || isNaN(num2) || num2 < 1900 || num2 > 3000) {
                    error = 'Debe tener 4 dígitos entre 1900 y 3000.';
                }
            }
                break;
            case 'campo3':
                if (!/^\d{1,3}$/.test(valor)) {
                    error = 'Debe tener entre 1 y 3 dígitos.';
                }
                break;
            case 'campo4':
                if (!/^\d{4}$/.test(valor)) {
                    error = 'Debe tener exactamente 4 dígitos.';
                }
                break;
            case 'campo5':
                if (!/^[A-Z]{2}$/.test(valor)) {
                    error = 'Debe tener exactamente 2 letras.';
                }
                break;
            case 'campo6':
                if (!/^[A-Z]{2}$/.test(valor)) {
                    error = 'Debe tener exactamente 2 letras.';
                }
                break;
            case 'campo7':
                if (!/^\d{1,2}$/.test(valor)) {
                    error = 'Debe tener entre 1 y 2 dígitos.';
                }
                break;
            default:
                break;
        }
        setErroresExpediente(prev => ({ ...prev, [campo]: error }));
    };

    const handleExpedienteChange = (campo, valor) => {
        setExpedienteJuzgado(prev => ({ ...prev, [campo]: valor }));
        validateExpediente(campo, valor);
    };

    const handleOrigenPasteExpediente = (e) => {
        const pastedData = e.clipboardData.getData('Text').trim();
        const parts = pastedData.split('-').map(part => part.trim());
        e.preventDefault();
        const newExpediente = { ...expedienteJuzgado };
        for (let i = 0; i < 7; i++) {
            const campoKey = `campo${i + 1}`;
            newExpediente[campoKey] = parts[i] || '';
            validateExpediente(campoKey, newExpediente[campoKey]);
        }
        setExpedienteJuzgado(newExpediente);
    };

    const handleFiscaliaInputChange = (event, newInputValue) => {
        setNuevoCaso(prev => ({ ...prev, fiscalia: newInputValue }));
        fetchFiscaliasNuevoCaso(newInputValue);
    };


    const handleFiscaliaChange = (event, newValue) => {
        if (newValue) {
            setNuevoCaso(prev => ({
                ...prev,
                fiscalia: newValue.fiscalia,
                departamento: newValue.departamento,
                'nr de exp completo': newValue.nr_de_exp_completo + '-'
            }));
        } else {
            setNuevoCaso(prev => ({
                ...prev,
                fiscalia: '',
                departamento: '',
                'nr de exp completo': ''
            }));
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
                setNuevoCaso(prev => ({ ...prev, 'nr de exp completo': nrExpCompleto }));
            }
        }
    }, [nuevoCaso['nr de exp completo'], nuevoCaso.origen]);

    const isDuplicateConsultaPPU = () => {
        return registrosExistentes.includes(nuevoCaso.consulta_ppu);
    };

    const agregarCaso = async () => {
        console.log("Inicio de agregarCaso");

        // Verificar duplicidad de consulta_ppu
        if (registrosExistentes.includes(nuevoCaso.consulta_ppu)) {
            alert("El valor de Consulta PPU ya existe. No se permiten duplicados.");
            return;
        }

        if (!pdfFile) {
            alert("Debe cargar un archivo PDF antes de agregar el caso.");
            return;
        }

        try {
            // Subida del archivo PDF
            console.log("Subiendo archivo PDF...");
            const formData = new FormData();
            formData.append("file", pdfFile);
            const uploadResponse = await fetch(
                `${API_BASE_URL.replace("/api", "")}/upload`,
                {
                    method: "POST",
                    body: formData,
                    credentials: "include",
                }
            );
            console.log("Respuesta de upload:", uploadResponse);
            const uploadResult = await uploadResponse.json();
            console.log("Resultado de upload:", uploadResult);
            if (!uploadResponse.ok) {
                throw new Error(uploadResult.error || "Error al subir el archivo PDF");
            }

            // Preparación del caso
            console.log("Preparando datos para agregar el caso...");
            let origenValue = nuevoCaso.origen || "";
            if (/^\d/.test(origenValue)) {
                origenValue = `CASO ${origenValue}`;
            }
            const { item, ...dataToSend } = nuevoCaso;
            dataToSend.origen = origenValue;
            if (mostrarExpedienteJuzgado) {
                const camposInvalidos = Object.values(erroresExpediente).filter(e => e !== "");
                const camposVacios = Object.values(expedienteJuzgado).some(v => !v.trim());
                console.log("Validando expediente. Invalidos:", camposInvalidos, "Vacios:", camposVacios);
                if (camposInvalidos.length > 0 || camposVacios) {
                    alert("Complete correctamente todos los campos del expediente.");
                    return;
                }
                dataToSend.expediente_juzgado = expedienteJuzgado;
            }
            if (dataToSend.fiscalia && despachoNumber) {
                dataToSend.fiscalia = `${dataToSend.fiscalia} - ${despachoNumber} DESPACHO`;
            }
            dataToSend.ruta = pdfFile.name; // Se registra el nombre del PDF subido
            console.log("Datos preparados para agregar_consulta:", dataToSend);

            // Llamada al endpoint agregar_consulta
            console.log("Llamando al endpoint /agregar_consulta");
            const response = await fetch(`${API_BASE_URL}/agregar_consulta`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(dataToSend),
            });
            console.log("Respuesta de agregar_consulta:", response);
            const result = await response.json();
            console.log("Resultado de agregar_consulta:", result);
            if (response.ok) {
                alert(result.message || "Caso agregado correctamente.");
                handleModalClose(); // ✅ Esto cierra el modal correctamente
                fetchConstulas();   // ✅ Actualiza la tabla
            } else {
                alert(result.message || "Error al agregar el caso.");
            }

            console.log("Caso agregado correctamente.");
            alert("Caso agregado correctamente.");

            // Resetear estados
            setNuevoCaso({
                abogado: "",
                consulta_ppu: "",
                denunciado: "",
                origen: "",
                "nr de exp completo": "",
                delito: "",
                departamento: "",
                fiscalia: "",
                juzgado: "",
                informe_juridico: "",
                e_situacional: "",
            });
            setRegistroGenerado("");
            setOpenModal(false);
            setPdfFile(null);
            setExpedienteJuzgado({
                campo1: "",
                campo2: "",
                campo3: "",
                campo4: "",
                campo5: "",
                campo6: "",
                campo7: "",
            });
            setErroresExpediente({});
            fetchConstulas();
        } catch (err) {
            console.error("Error en agregarCaso:", err);
            alert(`Error: ${err.message}`);
        }
    };



    const eliminarCaso = async () => {
        try {
            await axios.post(`${API_BASE_URL}/eliminar_consulta`, {
                consulta_ppu: nuevoCaso.consulta_ppu
            });

            alert("Caso eliminado.");
            setNuevoCaso({
                abogado: '',
                consulta_ppu: '',
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
            fetchConstulas();
        } catch (error) {
            console.error("Error:", error);
            alert(`Error: ${error.response?.data?.error || error.message}`);
        }
    };




    return (
        <div className="consulta-container">
            <h2>Consultas PPU Penal</h2>
            <Button
                variant="contained"
                color="primary"
                onClick={() => setOpenModal(true)}
                style={{ marginBottom: '20px' }}
            >
                Ingresar Nuevo Caso
            </Button>
            <div className="sheet-buttons" style={{ marginBottom: '20px' }}>
                <button onClick={() => setActiveSheet(1)} disabled={activeSheet === 1}>
                    Hoja 1
                </button>
                <button onClick={() => setActiveSheet(2)} disabled={activeSheet === 2} style={{ marginLeft: '10px' }}>
                    Hoja 2
                </button>
            </div>
            {loading ? (
                <p>Cargando...</p>
            ) : error ? (
                <p className="error">{error}</p>
            ) : constulas.length === 0 ? (
                <p className="text-center">No hay registros disponibles.</p>
            ) : (
                activeSheet === 1 ? renderTable(sheet1Columns) : renderTable(sheet2Columns)
            )}
            <Modal open={openModal} onClose={handleModalClose}>
                <Box
                    sx={{
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
                    }}
                >
                    <Typography variant="h6" component="h2">
                        Crear Consulta PPU
                    </Typography>
                    <TextField
                        label="Año de Consulta"
                        variant="outlined"
                        value={anioRegistro}
                        onChange={(e) => setAnioRegistro(e.target.value)}
                        fullWidth
                    />
                    <Button variant="contained" onClick={generarRegistroPPU} fullWidth>
                        Generar Registro PPU
                    </Button>
                    <Typography variant="subtitle1">Registros Existentes</Typography>
                    <ul style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {registrosExistentes.map((reg, index) => (
                            <li key={index}>{reg}</li>
                        ))}
                    </ul>
                    {registroGenerado ? (
                        <>
                            <Typography variant="h6">
                                Registro PPU Generado: {registroGenerado}
                            </Typography>
                            <Typography variant="subtitle1">
                                Completar Datos del Nuevo Caso
                            </Typography>
                            <TextField
                                label="ABOGADO"
                                variant="outlined"
                                value={nuevoCaso.abogado}
                                onChange={(e) =>
                                    setNuevoCaso(prev => ({ ...prev, abogado: e.target.value }))
                                }
                                fullWidth
                            />
                            <TextField
                                label="REGISTRO PPU"
                                variant="outlined"
                                value={nuevoCaso.consulta_ppu}
                                disabled
                                fullWidth
                            />
                            <TextField
                                label="DENUNCIADO"
                                variant="outlined"
                                value={nuevoCaso.denunciado}
                                onChange={(e) =>
                                    setNuevoCaso(prev => ({ ...prev, denunciado: e.target.value }))
                                }
                                fullWidth
                            />
                            <TextField
                                label="CASO FISCAL"
                                variant="outlined"
                                value={nuevoCaso.origen}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    if (/[^0-9-]/.test(value)) {
                                        alert("Error, solo ingresar números y guiones");
                                        return;
                                    }
                                    setNuevoCaso(prev => ({ ...prev, origen: value }));
                                }}
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
                                        <Grid item xs={12} sm={6} md={2}>
                                            <TextField
                                                label="Campo 1"
                                                variant="outlined"
                                                value={expedienteJuzgado.campo1}
                                                onChange={(e) =>
                                                    handleExpedienteChange('campo1', e.target.value)
                                                }
                                                inputProps={{ maxLength: 5 }}
                                                error={!!erroresExpediente.campo1}
                                                helperText={erroresExpediente.campo1}
                                                onPaste={handleOrigenPasteExpediente}
                                                fullWidth
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6} md={2}>
                                            <TextField
                                                label="Campo 2"
                                                variant="outlined"
                                                value={expedienteJuzgado.campo2}
                                                onChange={(e) =>
                                                    handleExpedienteChange('campo2', e.target.value)
                                                }
                                                inputProps={{ maxLength: 4 }}
                                                error={!!erroresExpediente.campo2}
                                                helperText={erroresExpediente.campo2}
                                                onPaste={handleOrigenPasteExpediente}
                                                fullWidth
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6} md={2}>
                                            <TextField
                                                label="Campo 3"
                                                variant="outlined"
                                                value={expedienteJuzgado.campo3}
                                                onChange={(e) =>
                                                    handleExpedienteChange('campo3', e.target.value)
                                                }
                                                inputProps={{ maxLength: 3 }}
                                                error={!!erroresExpediente.campo3}
                                                helperText={erroresExpediente.campo3}
                                                onPaste={handleOrigenPasteExpediente}
                                                fullWidth
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6} md={2}>
                                            <TextField
                                                label="Campo 4"
                                                variant="outlined"
                                                value={expedienteJuzgado.campo4}
                                                onChange={(e) =>
                                                    handleExpedienteChange('campo4', e.target.value)
                                                }
                                                inputProps={{ maxLength: 4 }}
                                                error={!!erroresExpediente.campo4}
                                                helperText={erroresExpediente.campo4}
                                                onPaste={handleOrigenPasteExpediente}
                                                fullWidth
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6} md={1}>
                                            <TextField
                                                label="Campo 5"
                                                variant="outlined"
                                                value={expedienteJuzgado.campo5}
                                                onChange={(e) =>
                                                    handleExpedienteChange('campo5', e.target.value.toUpperCase())
                                                }
                                                inputProps={{ maxLength: 2 }}
                                                error={!!erroresExpediente.campo5}
                                                helperText={erroresExpediente.campo5}
                                                onPaste={handleOrigenPasteExpediente}
                                                fullWidth
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6} md={1}>
                                            <TextField
                                                label="Campo 6"
                                                variant="outlined"
                                                value={expedienteJuzgado.campo6}
                                                onChange={(e) =>
                                                    handleExpedienteChange('campo6', e.target.value.toUpperCase())
                                                }
                                                inputProps={{ maxLength: 2 }}
                                                error={!!erroresExpediente.campo6}
                                                helperText={erroresExpediente.campo6}
                                                onPaste={handleOrigenPasteExpediente}
                                                fullWidth
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6} md={1}>
                                            <TextField
                                                label="Campo 7"
                                                variant="outlined"
                                                value={expedienteJuzgado.campo7}
                                                onChange={(e) =>
                                                    handleExpedienteChange('campo7', e.target.value)
                                                }
                                                inputProps={{ maxLength: 2 }}
                                                error={!!erroresExpediente.campo7}
                                                helperText={erroresExpediente.campo7}
                                                onPaste={handleOrigenPasteExpediente}
                                                fullWidth
                                            />
                                        </Grid>
                                    </Grid>
                                </Box>
                            )}
                            <TextField
                                label="DELITO"
                                variant="outlined"
                                value={nuevoCaso.delito}
                                onChange={(e) =>
                                    setNuevoCaso(prev => ({ ...prev, delito: e.target.value }))
                                }
                                fullWidth
                            />
                            <Autocomplete
                                options={fiscaliaOptionsNuevoCaso}
                                getOptionLabel={(option) => option.fiscalia || ''}
                                filterOptions={(x) => x} // evita el filtrado local para que solo use los datos del servidor
                                onInputChange={handleFiscaliaInputChange}
                                onChange={handleFiscaliaChange}
                                inputValue={nuevoCaso.fiscalia}
                                isOptionEqualToValue={(option, value) => option.fiscalia === value}
                                renderInput={(params) => (
                                    <TextField {...params} label="FISCALIA" variant="outlined" />
                                )}
                                fullWidth
                            />

                            <TextField
                                label="JUZGADO"
                                variant="outlined"
                                value={nuevoCaso.juzgado}
                                onChange={(e) =>
                                    setNuevoCaso(prev => ({ ...prev, juzgado: e.target.value }))
                                }
                                fullWidth
                            />
                            {nuevoCaso.fiscalia && (
                                <TextField
                                    label="DIGITE NUMERO DE DESPACHO"
                                    variant="outlined"
                                    value={despachoNumber}
                                    onChange={(e) => setDespachoNumber(e.target.value)}
                                    fullWidth
                                />
                            )}
                            <TextField
                                label="DEPARTAMENTO"
                                variant="outlined"
                                value={nuevoCaso.departamento}
                                onChange={(e) =>
                                    setNuevoCaso(prev => ({ ...prev, departamento: e.target.value }))
                                }
                                fullWidth
                            />
                            <TextField
                                label="CASO FISCAL COMPLETO"
                                variant="outlined"
                                value={nuevoCaso['nr de exp completo']}
                                onChange={(e) =>
                                    setNuevoCaso(prev => ({ ...prev, 'nr de exp completo': e.target.value }))
                                }
                                fullWidth
                            />
                            <Typography variant="subtitle1" style={{ marginTop: '10px' }}>
                                Cargar archivo PDF del caso (obligatorio)
                            </Typography>
                            <input
                                type="file"
                                accept="application/pdf"
                                onChange={handlePDFChange}
                                style={{ marginBottom: '10px' }}
                            />
                            {!pdfFile && (
                                <Typography variant="body2" color="error">
                                    Debe cargar un archivo PDF antes de continuar.
                                </Typography>
                            )}
                            <TextField
                                label="SITUACION"
                                variant="outlined"
                                value={nuevoCaso.e_situacional}
                                onChange={(e) =>
                                    setNuevoCaso(prev => ({ ...prev, e_situacional: e.target.value }))
                                }
                                fullWidth
                            />
                            <Grid container spacing={2} style={{ marginTop: '20px' }}>
                                <Grid item xs={6}>
                                    <Button
                                        onClick={agregarCaso}
                                        variant="contained"
                                        color="primary"
                                        fullWidth
                                        disabled={isDuplicateConsultaPPU()}
                                    >
                                        Agregar Caso
                                    </Button>
                                </Grid>
                                <Grid item xs={6}>
                                    <Button
                                        onClick={eliminarCaso}
                                        variant="contained"
                                        color="secondary"
                                        fullWidth
                                    >
                                        Eliminar Caso
                                    </Button>
                                </Grid>
                            </Grid>
                        </>
                    ) : null}
                </Box>
            </Modal>
            
            <DecisionCoordinadorModal
                open={openDecisionModal}
                handleClose={handleCloseDecisionModal}
                consultaPPU={currentConsultaPPU}
            />

        </div>
    );
}

export default Consulta;
