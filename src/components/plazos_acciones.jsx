import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Box,
    Grid,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Typography,
    Paper,
    Button,
    TableContainer,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Pagination,
    Modal,
    FormControlLabel,
    Checkbox,
} from '@mui/material';
import { parse, format } from 'date-fns';
import { es } from 'date-fns/locale';
import LawyerFilter from './LawyerFilter';
import debounce from 'lodash.debounce';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';
import IngresarObservacionModal from './common-plazos/observacion'; // ← ruta corregida

// Formatea “plazo_atencion” como fecha de audiencia
const formatAudiencia = (plazoAtencion) => {
    const regex = /^\d{2}-\d{2}-\d{4}\s\d{2}:\d{2}$/;
    if (regex.test(plazoAtencion)) {
        try {
            const parsedDate = parse(plazoAtencion, 'dd-MM-yyyy HH:mm', new Date());
            return format(parsedDate, 'dd MMMM yyyy, HH:mm', { locale: es });
        } catch (error) {
            return 'NO ES AUDIENCIA';
        }
    }
    return 'NO ES AUDIENCIA';
};

// Formatea fechas dentro de modales (sólo si es válido)
const formatModalDate = (dateStr) => {
    if (!dateStr) return '';
    const dateObj = new Date(dateStr);
    if (isNaN(dateObj.getTime())) {
        return dateStr;
    }
    return format(dateObj, "dd 'de' MMMM yyyy, HH:mm:ss", { locale: es });
};

// Etiquetas para la tabla de confirmación de “impulso”
const modalFieldLabels = {
    abogado: 'Abogado',
    delito: 'Delito',
    denunciado: 'Denunciado',
    departamento: 'Departamento',
    e_situacional: 'Situación',
    etiqueta: 'Etiqueta',
    fecha_de_archivo: 'Fecha de Archivo',
    fecha_e_situacional: 'Fecha de Estado',
    fecha_ingreso: 'Fecha de Ingreso',
    fiscalia: 'Fiscalía',
    informe_juridico: 'Informe Jurídico',
    item: 'Ítem',
    juzgado: 'Juzgado',
    last_modified: 'Última Modificación',
    'nr de exp completo': 'Número de Expediente Completo',
    origen: 'Origen',
    registro_ppu: 'Registro PPU',
    source: 'Fuente',
};

// Si el campo “Expediente o caso” viene con comas, se separa en líneas
const formatExpedienteField = (text) => {
    if (!text) return text;
    const parts = text.split(',').map((part) => part.trim());
    return (
        <Typography component="span" style={{ whiteSpace: 'pre-line', textAlign: 'center' }}>
            {parts.join('\n')}
        </Typography>
    );
};

// Si el campo “abogado” contiene “;”, se descarta la parte anterior
const formatAbogadoField = (text) => {
    if (!text) return text;
    const index = text.indexOf(';');
    if (index !== -1) {
        return text.substring(index + 1).trim();
    }
    return text;
};

const PlazosAcciones = (props) => {
    const {
        queryPlazos,
        handleQueryPlazosChange,
        selectedAbogadoPlazos,
        setSelectedAbogadoPlazos,
        pagePlazos,
        setPagePlazos,
        debouncedBuscarPlazosData,
        mostrarArchivadosPlazos,
        exportarExcelPlazos,
        loadingPlazos,
        errorPlazos,
        plazosData,
        getRowBackgroundColor, // función externa para otros colores
        formatDate, // formatea fecha “fecha_atencion”
        handleOpenSeguimientoModal,
        role,
        username,
        API_BASE_URL,
    } = props;

    // ---- Estado local ----
    const [currentSheet, setCurrentSheet] = useState(1);

    // Para la modal de Observación
    const [obsModalOpen, setObsModalOpen] = useState(false);
    const [obsModalData, setObsModalData] = useState({
        id: '',
        registroPpu: '',
        origen: '',
        imputado: '',
        fiscalia: '',
        juzgado: '',
        ruta: '',
        observacion_abogado: '',
    });

    // Para la modal de Impulso (búsqueda)
    const [openImpulsoModal, setOpenImpulsoModal] = useState(false);
    const [busquedaQuery, setBusquedaQuery] = useState('');
    const [busquedaTipo, setBusquedaTipo] = useState('casoJudicial');
    const [impulsoResults, setImpulsoResults] = useState([]);

    const [impulsoTempSeleccionado, setImpulsoTempSeleccionado] = useState(null);
    const [openImpulsoConfirmModal, setOpenImpulsoConfirmModal] = useState(false);
    const [openImpulsoUploadModal, setOpenImpulsoUploadModal] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [accionDetail, setAccionDetail] = useState('');

    // ---- Función para eliminar fila usando la API ----
    const handleBorrarFila = async (id) => {
        try {
            await axios.delete(`${API_BASE_URL}/api/borrar_plazo`, {
                params: { id },
            });
            // Refrescar la lista luego de borrar
            debouncedBuscarPlazosData(
                pagePlazos,
                queryPlazos,
                selectedAbogadoPlazos,
                mostrarArchivadosPlazos
            );
        } catch (error) {
            console.error('Error al borrar fila:', error);
            alert('No se pudo borrar la fila');
        }
    };

    // ---- Funciones para Observación ----
    const handleOpenObservacion = (row) => {
        setObsModalData({
            id: row.id,
            registroPpu: row.registro_ppu,
            origen: row.origen,
            imputado: row.denunciado || '',
            fiscalia: row.fiscalia || '',
            juzgado: row.juzgado || '',
            ruta: row.ruta || '',
            observacion_abogado: row.observacion_abogado || '',
        });
        setObsModalOpen(true);
    };

    const handleCloseObservacion = () => {
        setObsModalOpen(false);
    };

    const handleSaveObservacion = async ({ id, registroPpu, origen, observacion }) => {
        try {
            // Llamamos al endpoint que guarda en BD el campo observacion_abogado y fija seguimiento = 'OBSERVADO'
            await axios.post(`${API_BASE_URL}/api/guardar_observacion`, {
                id,
                registro_ppu: registroPpu,
                origen,
                observacion,
            });
            setObsModalOpen(false);
            // Refrescamos la lista de “plazos” para que recupere el nuevo seguimiento="OBSERVADO"
            debouncedBuscarPlazosData(
                pagePlazos,
                queryPlazos,
                selectedAbogadoPlazos,
                mostrarArchivadosPlazos
            );
        } catch (error) {
            console.error('Error al guardar observación:', error);
            alert('No se pudo guardar la observación');
        }
    };

    // ---- Función para descargar PDF ----
    const downloadPDF = async (row) => {
        try {
            const response = await axios.get(
                `${API_BASE_URL}/api/descargar_pdf?ruta=${encodeURIComponent(row.ruta)}`,
                { responseType: 'blob' }
            );
            const pdfBlob = new Blob([response.data], { type: 'application/pdf' });
            const downloadURL = window.URL.createObjectURL(pdfBlob);
            const fechaNotificacion = new Date(row.fecha_atencion);
            const fechaFormateada = format(fechaNotificacion, 'dd-MM-yyyy', { locale: es });
            const fileName = `${row.abogado}_${row.registro_ppu}_${row.origen}_${fechaFormateada}.pdf`;
            const anchor = document.createElement('a');
            anchor.href = downloadURL;
            anchor.download = fileName;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.URL.revokeObjectURL(downloadURL);
        } catch (error) {
            console.error('Error en la descarga del PDF:', error);
        }
    };

    // ---- Búsqueda “Impulso” con debounce ----
    const debouncedImpulsoSearch = useMemo(
        () =>
            debounce(async (query) => {
                if (query.trim() !== '') {
                    try {
                        const response = await axios.get(`${API_BASE_URL}/api/new_search`, {
                            params: { query, search_field: busquedaTipo },
                        });
                        setImpulsoResults(response.data);
                    } catch (error) {
                        console.error('Error en búsqueda de impulso:', error);
                        setImpulsoResults([]);
                    }
                } else {
                    setImpulsoResults([]);
                }
            }, 500),
        [busquedaTipo, API_BASE_URL]
    );

    // ---- Columnas para ambas “hojas” ----
    const sheet1Columns = [
        { header: 'ID', accessor: 'id' },
        { header: 'Expediente o caso', accessor: 'origen', custom: 'expediente' },
        { header: 'Registro PPU + IMPUTADO', accessor: 'registro_ppu', custom: 'registro_imputado' },
        { header: 'ACCION', accessor: 'accion' },
        { header: 'PLAZO RESTANTE', accessor: 'dias_restantes' },
        { header: 'Fecha cuando se notificó a RENIEC', accessor: 'fecha_atencion', formatter: formatDate },
        { header: 'FECHA DE AUDIENCIA', accessor: 'plazo_atencion', formatter: formatAudiencia },
        { header: 'SEGUIMIENTO Y NOTIFICACION', custom: true },
    ];

    const sheet2Columns = [
        { header: 'ID', accessor: 'id' },
        { header: 'Expediente o caso', accessor: 'origen', custom: 'expediente' },
        { header: 'Registro PPU + IMPUTADO', accessor: 'registro_ppu', custom: 'registro_imputado' },
        { header: 'INFORMACION RELEVANTE', accessor: 'e_situacional' },
        { header: 'ABOGADO', accessor: 'abogado' },
        { header: 'NOTIFICACION', accessor: 'ruta', custom: true },
        { header: 'Fiscalia', accessor: 'fiscalia' },
        { header: 'Juzgado', accessor: 'juzgado' },
        { header: 'Departamento', accessor: 'departamento' },
    ];

    // Estilo base para modal
    const modalStyle = {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: '#fff',
        border: '2px solid #000',
        boxShadow: 24,
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
    };

    // Resalta término buscado en “impulso”
    const highlightMatch = (text, query) => {
        if (!text || !query) return text;
        const regex = new RegExp(`(${query})`, 'gi');
        return text.split(regex).map((part, index) =>
            part.toLowerCase() === query.toLowerCase() ? (
                <span key={index} style={{ backgroundColor: '#FFFF00' }}>{part}</span>
            ) : (
                part
            )
        );
    };

    // Botones de “Seguimiento y Notificación”
    const renderSeguimientoNotificacion = (row) => (
        <Box display="flex" flexDirection="column" alignItems="center" gap={1}>
            <Button
                variant="contained"
                color="primary"
                size="small"
                onClick={() => handleOpenSeguimientoModal(row, 'plazos_acciones')}
            >
                Subir Seguimiento
            </Button>
            <a
                href="#"
                onClick={(e) => {
                    e.preventDefault();
                    downloadPDF(row);
                }}
                style={{ textDecoration: 'none', color: 'blue' }}
            >
                Ver PDF
            </a>
            {role === 'admin' && (
                <Button
                    variant="contained"
                    color="error"
                    size="small"
                    onClick={() => handleBorrarFila(row.id)}
                >
                    Borrar Fila
                </Button>
            )}
        </Box>
    );

    // Renderiza cada celda según la columna
    const renderRowCells = (row, columns) =>
        columns.map((col, idx) => {
            let cellContent;

            if (col.accessor === 'id') {
                cellContent = (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <Typography noWrap>{row.id}</Typography>
                        <Button
                            variant="contained"
                            size="small"
                            sx={{
                                backgroundColor: 'yellow',
                                color: 'black',
                                fontSize: '0.75rem',
                                mt: 0.5,
                                padding: '2px 4px',
                                textTransform: 'none',
                            }}
                            onClick={() => handleOpenObservacion(row)}
                        >
                            Obs.
                        </Button>
                    </Box>
                );
            } else if (col.custom === true && col.header === 'SEGUIMIENTO Y NOTIFICACION') {
                cellContent = renderSeguimientoNotificacion(row);
            } else if (col.custom === true && col.accessor === 'ruta') {
                cellContent = (
                    <a
                        href="#"
                        onClick={(e) => {
                            e.preventDefault();
                            downloadPDF(row);
                        }}
                        style={{ textDecoration: 'none', color: 'blue' }}
                    >
                        Ver PDF
                    </a>
                );
            } else if (col.custom === 'expediente') {
                cellContent = formatExpedienteField(row[col.accessor]);
            } else if (col.custom === 'registro_imputado') {
                const registro = row.registro_ppu || '';
                const denunciado = row.denunciado || '';
                cellContent = (
                    <Box sx={{ whiteSpace: 'pre-wrap', textAlign: 'center' }}>
                        <Typography variant="body2" component="span">
                            {registro}
                        </Typography>
                        <br />
                        <Typography variant="body2" component="span">
                            {denunciado}
                        </Typography>
                    </Box>
                );
            } else if (col.formatter) {
                cellContent = col.formatter(row[col.accessor]);
            } else {
                cellContent = row[col.accessor];
                if (col.accessor === 'abogado') {
                    cellContent = formatAbogadoField(cellContent);
                }
            }

            return (
                <TableCell
                    key={idx}
                    sx={{
                        textAlign: 'center',
                        wordBreak: col.accessor === 'id' ? 'keep-all' : 'break-word',
                        whiteSpace: col.accessor === 'id' ? 'nowrap' : 'normal',
                    }}
                >
                    {cellContent}
                </TableCell>
            );
        });

    // ==================== Después ====================

    // 1) Filtramos: no queremos ATENDIDA ni Vencidos
    const filteredData = plazosData.filter(
        (row) =>
            row.seguimiento !== 'ATENDIDA' &&
            row.dias_restantes !== 'Vencido'
    );

    // 2) Ordenamos TODO filteredData con un único sort que da prioridad a:
    //    – primero: filas “morado” (según seguimiento==='OBSERVADO' o texto en observacion_abogado)
    //    – luego, dentro de cada bloque, ordena por sortingValue
    const sortedData = [...filteredData].sort((a, b) => {
        const aObs = a.seguimiento === 'OBSERVADO' ||
            (a.observacion_abogado && a.observacion_abogado.trim() !== '');
        const bObs = b.seguimiento === 'OBSERVADO' ||
            (b.observacion_abogado && b.observacion_abogado.trim() !== '');

        if (aObs && !bObs) return -1;  // a es observado, b no → a primero
        if (!aObs && bObs) return 1;   // b es observado, a no → b primero

        // Si ambos son observados o ambos NO, desempata por sortingValue (urgencia)
        return a.sortingValue - b.sortingValue;
    });

    // 3) Total de registros a mostrar
    const totalRecordsNoVencidos = sortedData.length;



    //----- Funciones “Impulso” (selección / confirmación / upload) -----
    const handleImpulsoRowClick = (row) => {
        setImpulsoTempSeleccionado(row);
        setOpenImpulsoConfirmModal(true);
    };
    const handleConfirmImpulso = () => {
        setOpenImpulsoConfirmModal(false);
        setOpenImpulsoModal(false);
        setOpenImpulsoUploadModal(true);
    };
    const handleCancelImpulso = () => {
        setImpulsoTempSeleccionado(null);
        setOpenImpulsoConfirmModal(false);
    };

    const onDrop = useCallback(
        (acceptedFiles) => {
            const pdfFiles = acceptedFiles.filter((file) => file.type === 'application/pdf');
            if (uploadedFiles.length + pdfFiles.length > 4) {
                pdfFiles.splice(4 - uploadedFiles.length);
            }
            setUploadedFiles((prev) => [...prev, ...pdfFiles]);
        },
        [uploadedFiles]
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/pdf': ['.pdf'] },
        multiple: true,
    });

    const handleRemoveFile = (index) => {
        setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const handleUploadPDFs = async () => {
        if (!accionDetail || uploadedFiles.length === 0 || !impulsoTempSeleccionado) {
            alert('Es obligatorio ingresar la acción, seleccionar una fila de impulso y cargar al menos un PDF.');
            return;
        }
        const formData = new FormData();
        uploadedFiles.forEach((file) => {
            formData.append('pdfs', file);
        });
        formData.append('accion', accionDetail);
        formData.append('registro_ppu', impulsoTempSeleccionado.registro_ppu || '');
        formData.append('origen', impulsoTempSeleccionado.origen || '');
        formData.append('abogado', impulsoTempSeleccionado.abogado || '');
        formData.append('denunciado', impulsoTempSeleccionado.denunciado || '');
        formData.append('juzgado', impulsoTempSeleccionado.juzgado || '');
        formData.append('fiscalia', impulsoTempSeleccionado.fiscalia || '');
        formData.append('departamento', impulsoTempSeleccionado.departamento || '');
        formData.append('e_situacional', impulsoTempSeleccionado.e_situacional || '');
        formData.append('nr_de_exp_completo', impulsoTempSeleccionado['nr de exp completo'] || '');
        formData.append('delito', impulsoTempSeleccionado.delito || '');
        formData.append('informe_juridico', impulsoTempSeleccionado.informe_juridico || '');
        formData.append('item', impulsoTempSeleccionado.item || '');

        try {
            await axios.post(`${API_BASE_URL}/api/impulso/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            alert('Operación completada');
        } catch (error) {
            console.error('Error al cargar los PDF(s):', error);
            alert('Error en la operación');
        }
        setUploadedFiles([]);
        setAccionDetail('');
        setOpenImpulsoUploadModal(false);
    };

    return (
        <>
            {/* ===================== Controles de búsqueda y filtros ===================== */}
            <Box mb={2}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={4}>
                        <TextField
                            label="Buscar"
                            variant="outlined"
                            value={queryPlazos}
                            onChange={handleQueryPlazosChange}
                            fullWidth
                        />
                    </Grid>
                    <Grid item xs={12} md={3}>
                        <LawyerFilter
                            role={role}
                            selectedAbogadoPlazos={selectedAbogadoPlazos}
                            setSelectedAbogadoPlazos={setSelectedAbogadoPlazos}
                            debouncedBuscarPlazosData={debouncedBuscarPlazosData}
                            queryPlazos={queryPlazos}
                            mostrarArchivadosPlazos={mostrarArchivadosPlazos}
                            username={username}
                            setPagePlazos={setPagePlazos}
                        />
                    </Grid>
                    <Grid item xs={12} md={2}>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={mostrarArchivadosPlazos}
                                    onChange={(e) => {
                                        setPagePlazos(1);
                                        debouncedBuscarPlazosData(
                                            1,
                                            queryPlazos,
                                            selectedAbogadoPlazos,
                                            e.target.checked
                                        );
                                    }}
                                    color="primary"
                                />
                            }
                            label="¿Mostrar archivados?"
                        />
                    </Grid>
                    <Grid item xs={12} md={3}>
                        <Button
                            variant="contained"
                            color="success"
                            onClick={exportarExcelPlazos}
                            fullWidth
                            sx={{ height: '56px', mb: 1 }}
                        >
                            Exportar Excel (todos)
                        </Button>
                        <Button
                            variant="contained"
                            color="secondary"
                            onClick={() =>
                                window.open(
                                    `${API_BASE_URL}/api/plazos/no_vencidos_excel?abogado=${selectedAbogadoPlazos}`,
                                    '_blank'
                                )
                            }
                            fullWidth
                            sx={{ height: '56px' }}
                        >
                            Exportar NO vencidos
                        </Button>
                    </Grid>
                </Grid>
            </Box>

            {/* ===================== Botón para abrir modal de Impulso ===================== */}
            <Box mb={2} display="flex" justifyContent="flex-end">
                <Button variant="contained" color="primary" onClick={() => setOpenImpulsoModal(true)}>
                    Agregar Impulso
                </Button>
            </Box>

            {/* ===================== Botones “Hoja 1 / Hoja 2” ===================== */}
            <Box mb={2} display="flex" justifyContent="flex-end" gap={2}>
                <Button
                    variant={currentSheet === 1 ? 'contained' : 'outlined'}
                    onClick={() => setCurrentSheet(1)}
                >
                    Hoja 1
                </Button>
                <Button
                    variant={currentSheet === 2 ? 'contained' : 'outlined'}
                    onClick={() => setCurrentSheet(2)}
                >
                    Hoja 2
                </Button>
            </Box>

            {/* ===================== Tabla principal ===================== */}
            {loadingPlazos ? (
                <Typography>Cargando...</Typography>
            ) : errorPlazos ? (
                <Typography color="error">{errorPlazos}</Typography>
            ) : (
                <Paper elevation={3} sx={{ p: 2 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        Total de Procesos: {totalRecordsNoVencidos}
                    </Typography>
                    <TableContainer component={Paper}>
                        <Table stickyHeader aria-label="tabla plazos y acciones">
                            <TableHead>
                                <TableRow>
                                    {(currentSheet === 1 ? sheet1Columns : sheet2Columns).map((col, idx) => (
                                        <TableCell
                                            key={idx}
                                            sx={{ textAlign: 'center', fontWeight: 'bold' }}
                                        >
                                            {col.header}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {sortedData.map((row) => {
                                    // Si row.seguimiento === "OBSERVADO", pintamos morado.
                                    const isObserved = row.seguimiento === 'OBSERVADO';
                                    const rowBgColor = isObserved ? 'purple' : getRowBackgroundColor(row);

                                    return (
                                        <TableRow
                                            key={row.id || row.registro_ppu}
                                            hover
                                            sx={{
                                                backgroundColor: rowBgColor,
                                                cursor: 'default',
                                            }}
                                        >
                                            {renderRowCells(row, currentSheet === 1 ? sheet1Columns : sheet2Columns)}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    <Box mt={2} display="flex" justifyContent="center">
                        <Pagination
                            count={Math.ceil(totalRecordsNoVencidos / 200)}
                            page={pagePlazos}
                            onChange={(e, value) => {
                                setPagePlazos(value);
                                debouncedBuscarPlazosData(
                                    value,
                                    queryPlazos,
                                    selectedAbogadoPlazos,
                                    mostrarArchivadosPlazos
                                );
                            }}
                            color="primary"
                            showFirstButton
                            showLastButton
                        />
                    </Box>
                </Paper>
            )}

            {/* ===================== Modal: Buscar Impulso ===================== */}
            <Modal open={openImpulsoModal} onClose={() => setOpenImpulsoModal(false)}>
                <Box sx={{ ...modalStyle, width: 800 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        Buscar Impulso
                    </Typography>
                    <TextField
                        label="Consulta"
                        value={busquedaQuery}
                        onChange={(e) => {
                            setImpulsoTempSeleccionado(null);
                            setBusquedaQuery(e.target.value);
                            debouncedImpulsoSearch(e.target.value);
                        }}
                        fullWidth
                        margin="normal"
                    />
                    <FormControl fullWidth margin="normal">
                        <InputLabel id="busqueda-tipo-label">Tipo de búsqueda</InputLabel>
                        <Select
                            labelId="busqueda-tipo-label"
                            value={busquedaTipo}
                            label="Tipo de búsqueda"
                            onChange={(e) => setBusquedaTipo(e.target.value)}
                        >
                            <MenuItem value="casoJudicial">Expediente Judicial</MenuItem>
                            <MenuItem value="legajo">Registro PPU</MenuItem>
                            <MenuItem value="casoFiscalCompleto">Caso Fiscal</MenuItem>
                            <MenuItem value="denunciado">Denunciado</MenuItem>
                        </Select>
                    </FormControl>
                    {impulsoResults.length > 0 && (
                        <TableContainer component={Paper} sx={{ maxHeight: 400, mt: 2 }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Abogado</TableCell>
                                        <TableCell>Registro PPU</TableCell>
                                        <TableCell>Denunciado</TableCell>
                                        <TableCell>Origen</TableCell>
                                        <TableCell>Nr de exp completo</TableCell>
                                        <TableCell>Fiscalia</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {impulsoResults.map((row, index) => (
                                        <TableRow
                                            key={index}
                                            hover
                                            onClick={() => handleImpulsoRowClick(row)}
                                            sx={{ cursor: 'pointer' }}
                                        >
                                            <TableCell>{highlightMatch(row.abogado, busquedaQuery)}</TableCell>
                                            <TableCell>
                                                {highlightMatch(row.registro_ppu || row.consulta_ppu, busquedaQuery)}
                                            </TableCell>
                                            <TableCell>{highlightMatch(row.denunciado, busquedaQuery)}</TableCell>
                                            <TableCell>{highlightMatch(row.origen, busquedaQuery)}</TableCell>
                                            <TableCell>
                                                {highlightMatch(row['nr de exp completo'], busquedaQuery)}
                                            </TableCell>
                                            <TableCell>{highlightMatch(row.fiscalia, busquedaQuery)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Box>
            </Modal>

            {/* ===================== Modal: Confirmar selección de Impulso ===================== */}
            <Modal open={openImpulsoConfirmModal} onClose={handleCancelImpulso}>
                <Box sx={{ ...modalStyle, width: 600 }}>
                    <Typography variant="h5" sx={{ mb: 2 }}>
                        ¿Seguro que desea seleccionar esta fila?
                    </Typography>
                    <TableContainer>
                        <Table size="small">
                            <TableBody>
                                {Object.keys(modalFieldLabels).map((key) => {
                                    if (impulsoTempSeleccionado && impulsoTempSeleccionado.hasOwnProperty(key)) {
                                        let valor = impulsoTempSeleccionado[key] || '';
                                        if (
                                            ['fecha_de_archivo', 'fecha_e_situacional', 'fecha_ingreso', 'last_modified'].includes(
                                                key
                                            ) &&
                                            valor
                                        ) {
                                            valor = formatModalDate(valor);
                                        }
                                        return (
                                            <TableRow key={key}>
                                                <TableCell sx={{ fontWeight: 'bold', border: '1px solid #ccc' }}>
                                                    {modalFieldLabels[key]}
                                                </TableCell>
                                                <TableCell sx={{ border: '1px solid #ccc' }}>{valor}</TableCell>
                                            </TableRow>
                                        );
                                    }
                                    return null;
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    <Box display="flex" justifyContent="space-between" mt={2}>
                        <Button variant="outlined" onClick={handleCancelImpulso}>
                            Cancelar
                        </Button>
                        <Button variant="contained" color="primary" onClick={handleConfirmImpulso}>
                            Confirmar
                        </Button>
                    </Box>
                </Box>
            </Modal>

            {/* ===================== Modal: Carga de PDFs ===================== */}
            <Modal open={openImpulsoUploadModal} onClose={() => setOpenImpulsoUploadModal(false)}>
                <Box sx={{ ...modalStyle, width: 600 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        Detalle de Impulso
                    </Typography>
                    <Box sx={{ maxHeight: 200, overflowY: 'auto', mb: 2, border: '1px solid #ccc', padding: '8px' }}>
                        {impulsoTempSeleccionado &&
                            Object.entries(impulsoTempSeleccionado).map(([key, value], idx) => (
                                <Typography key={idx} variant="body1">
                                    {modalFieldLabels[key] || key}:{' '}
                                    {['fecha_de_archivo', 'fecha_e_situacional', 'fecha_ingreso', 'last_modified'].includes(key) &&
                                        value
                                        ? formatModalDate(value)
                                        : value}
                                </Typography>
                            ))}
                    </Box>
                    <Box
                        {...getRootProps()}
                        sx={{
                            border: '2px dashed #000',
                            padding: '20px',
                            textAlign: 'center',
                            mb: 2,
                            cursor: 'pointer',
                        }}
                    >
                        <input {...getInputProps()} />
                        {isDragActive ? (
                            <Typography>Soltar archivos PDF aquí</Typography>
                        ) : (
                            <Typography>Arrastre hasta 4 archivos PDF o haga clic para seleccionarlos</Typography>
                        )}
                    </Box>
                    {uploadedFiles.length > 0 && (
                        <Box sx={{ mb: 2 }}>
                            {uploadedFiles.map((file, index) => (
                                <Box key={index} display="flex" alignItems="center" justifyContent="space-between">
                                    <Typography variant="body2">{file.name}</Typography>
                                    <Button variant="text" color="error" onClick={() => handleRemoveFile(index)}>
                                        Eliminar
                                    </Button>
                                </Box>
                            ))}
                        </Box>
                    )}
                    <TextField
                        label="Acción"
                        value={accionDetail}
                        onChange={(e) => setAccionDetail(e.target.value)}
                        fullWidth
                        margin="normal"
                    />
                    <Button variant="contained" color="primary" onClick={handleUploadPDFs}>
                        Guardar PDF(s)
                    </Button>
                </Box>
            </Modal>

            {/* ===================== Modal: Observación ===================== */}
            <IngresarObservacionModal
                open={obsModalOpen}
                onClose={handleCloseObservacion}
                onSave={handleSaveObservacion}
                role={role}
                data={obsModalData}    // ahora obsModalData tiene { …, observacion_abogado }
                apiBaseUrl={API_BASE_URL} // ← le pasamos API_BASE_URL al modal para usar en “Ver PDF”
            />

        </>
    );
};

export default PlazosAcciones;
