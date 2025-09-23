import React, { useState } from 'react';
import {
    Box,
    Grid,
    TextField,
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
    FormControlLabel,
    Checkbox,
} from '@mui/material';
import { parse, format } from 'date-fns';
import { es } from 'date-fns/locale';
import debounce from 'lodash.debounce';
import axios from 'axios';
import { useDropzone } from 'react-dropzone'; // aunque aquí no usamos Dropzone, queda importado por consistencia
import LawyerFilter from './LawyerFilter';
import IngresarObservacionModal from './common-plazos/observacion'; // ← Ruta corregida

// Formatea la fecha de audiencia (dd-MM-yyyy HH:mm → dd MMMM yyyy, HH:mm)
const formatAudiencia = (plazoAtencion) => {
    const regex = /^\d{2}-\d{2}-\d{4}\s\d{2}:\d{2}$/;
    if (regex.test(plazoAtencion)) {
        try {
            const parsedDate = parse(plazoAtencion, 'dd-MM-yyyy HH:mm', new Date());
            return format(parsedDate, 'dd MMMM yyyy, HH:mm', { locale: es });
        } catch {
            return 'NO ES AUDIENCIA';
        }
    }
    return 'NO ES AUDIENCIA';
};

// Divide “Expediente o caso” por comas y lo muestra en líneas separadas
const formatExpedienteField = (text) => {
    if (!text) return text;
    const parts = text.split(',').map((part) => part.trim());
    return (
        <Typography component="span" sx={{ whiteSpace: 'pre-line', textAlign: 'center' }}>
            {parts.join('\n')}
        </Typography>
    );
};

// Muestra “Registro PPU” y, debajo, “Denunciado”
const formatRegistroImputado = (row) => {
    const registro = row.registro_ppu || '';
    const denunciado = row.denunciado || '';
    return (
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
};

// Si existe “;” en el texto de abogado, muestra solo la parte posterior al “;”
const formatAbogadoField = (text) => {
    if (!text) return text;
    const idx = text.indexOf(';');
    return idx !== -1 ? text.substring(idx + 1).trim() : text;
};

export default function Vencidos(props) {
    const {
        queryPlazos,
        handleQueryPlazosChange,
        selectedAbogadoPlazos,
        setSelectedAbogadoPlazos,
        pagePlazos,
        setPagePlazos,
        debouncedBuscarPlazosData,
        mostrarArchivadosPlazos,
        setMostrarArchivadosPlazos,
        exportarExcelPlazos,
        loadingPlazos,
        errorPlazos,
        plazosData,
        getRowBackgroundColor,
        formatDate,
        handleOpenSeguimientoModal,
        handleBorrarFila,
        role,
        username,
        API_BASE_URL,
    } = props;

    // Permite alternar entre Hoja 1 y Hoja 2
    const [currentSheet, setCurrentSheet] = useState(1);

    // Estados para manejar el modal de Observación
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
    const exportarExcelVencidos = () => {
        // Si hay un abogado filtrado lo pasamos como query-string
        const qs = selectedAbogadoPlazos
            ? `?abogado=${encodeURIComponent(selectedAbogadoPlazos)}`
            : '';
        // Lanza la descarga en una pestaña nueva
        window.open(`${API_BASE_URL}/api/plazos/vencidos_excel${qs}`, '_blank');
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


    // Descarga el PDF desde la ruta proporcionada
    const downloadPDF = async (row) => {
        try {
            const response = await axios.get(
                `${API_BASE_URL}/api/descargar_pdf?ruta=${encodeURIComponent(row.ruta)}`,
                { responseType: 'blob' }
            );
            const pdfBlob = new Blob([response.data], { type: 'application/pdf' });
            const downloadURL = window.URL.createObjectURL(pdfBlob);

            // Formato de nombre: <abogado>_<registro_ppu>_<origen>_<dd-MM-yyyy>.pdf
            const fechaNotif = new Date(row.fecha_atencion);
            const fechaFormateada = format(fechaNotif, 'dd-MM-yyyy', { locale: es });
            const fileName = `${row.abogado}_${row.registro_ppu}_${row.origen}_${fechaFormateada}.pdf`;

            const link = document.createElement('a');
            link.href = downloadURL;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(downloadURL);
        } catch (err) {
            console.error('Error descargando PDF:', err);
        }
    };

    // Renderiza el contenido de “SEGUIMIENTO Y NOTIFICACIÓN” en Hoja 1:
    const renderSeguimientoNotificacion = (row) => (
        <Box display="flex" flexDirection="column" alignItems="center" gap={1}>
            <Button
                variant="contained"
                color="primary"
                size="small"
                onClick={() => handleOpenSeguimientoModal(row, 'plazos_vencidos')}
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

    // Genera cada celda según la columna actual
    const renderRowCells = (row, columns) =>
        columns.map((col, idx) => {
            let content;

            // Columna ID: mostramos el ID y debajo un botón amarillo pequeño
            if (col.accessor === 'id') {
                content = (
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
                                textTransform: 'none'
                            }}
                            onClick={() => handleOpenObservacion(row)}
                        >
                            Obs.
                        </Button>
                    </Box>
                );

                // Hoja 1: “SEGUIMIENTO Y NOTIFICACIÓN”
            } else if (col.custom === true && col.header === 'SEGUIMIENTO Y NOTIFICACIÓN') {
                content = renderSeguimientoNotificacion(row);

                // Hoja 2: “NOTIFICACIÓN” → botón “Ver PDF”
            } else if (col.custom === 'pdf') {
                content = (
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

                // Columna “Expediente o caso”
            } else if (col.custom === 'expediente') {
                content = formatExpedienteField(row[col.accessor]);

                // Columna “Registro PPU + IMPUTADO”
            } else if (col.custom === 'registro_imputado') {
                content = formatRegistroImputado(row);

                // Columna “ABOGADO”
            } else if (col.custom === 'abogado') {
                content = formatAbogadoField(row[col.accessor]);

                // Columnas con formatter (fechas)
            } else if (col.formatter) {
                content = col.formatter(row[col.accessor]);

                // Resto de columnas normales
            } else {
                content = row[col.accessor] ?? '';
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
                    {content}
                </TableCell>
            );
        });

    // Filtrar solo los “Vencido” y que no estén “ATENDIDA”
    const vencidosData = plazosData.filter((row) => {
        const seg = (row.seguimiento || '').trim().toUpperCase();
        return row.dias_restantes === 'Vencido' && seg !== 'ATENDIDA';
    });

    // Separar filas que ya vienen con seguimiento = "OBSERVADO"
    const observedRows = vencidosData
        .filter((row) => (row.seguimiento || '').toString().trim().toUpperCase() === 'OBSERVADO')
        .sort((a, b) => a.sortingValue - b.sortingValue);

    // El resto de “vencidos” que no estén aún observados
    const otherRows = vencidosData
        .filter((row) => row.seguimiento !== 'OBSERVADO')
        .sort((a, b) => a.sortingValue - b.sortingValue);

    // Concatenamos: primero los observados, luego los demás
    const sortedData = [...observedRows, ...otherRows];
    const totalVencidos = sortedData.length;

    return (
        <>
            {/* Controles de búsqueda y filtros */}
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
                                        setMostrarArchivadosPlazos(e.target.checked);
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
                            onClick={exportarExcelPlazos}   // función que recibes por props
                            fullWidth
                            sx={{ height: '56px' }}
                        >
                            Exportar No Vencidos
                        </Button>
                    </Grid>

                    {/* Exportar VENCIDOS (botón nuevo) */}
                    <Grid item xs={12} md={3}>
                        <Button
                            variant="contained"
                            color="error"
                            onClick={exportarExcelVencidos} // la función que acabas de crear
                            fullWidth
                            sx={{ height: '56px' }}
                        >
                            Exportar Vencidos
                        </Button>
                    </Grid>
                </Grid>
            </Box>

            {/* Botones para alternar entre Hoja 1 y Hoja 2 */}
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

            {/* Tabla de Vencidos */}
            {loadingPlazos ? (
                <Typography>Cargando...</Typography>
            ) : errorPlazos ? (
                <Typography color="error">{errorPlazos}</Typography>
            ) : (
                <Paper elevation={3} sx={{ p: 2 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        Total Vencidos: {totalVencidos}
                    </Typography>
                    <TableContainer component={Paper} sx={{ maxHeight: '60vh', overflow: 'auto' }}>
                        <Table stickyHeader aria-label="tabla de plazos vencidos" sx={{ minWidth: 1200 }}>
                            <TableHead>
                                <TableRow>
                                    {(
                                        currentSheet === 1
                                            ? [
                                                { header: 'ID', accessor: 'id' },
                                                { header: 'Expediente o caso', accessor: 'origen', custom: 'expediente' },
                                                { header: 'Registro PPU + IMPUTADO', accessor: 'registro_ppu', custom: 'registro_imputado' },
                                                { header: 'ACCION', accessor: 'accion' },
                                                { header: 'PLAZO RESTANTE', accessor: 'dias_restantes' },
                                                { header: 'Fecha del plazo', accessor: 'fecha_atencion', formatter: formatDate },
                                                { header: 'FECHA DE AUDIENCIA', accessor: 'plazo_atencion', formatter: formatAudiencia },
                                                { header: 'SEGUIMIENTO Y NOTIFICACIÓN', custom: true },
                                            ]
                                            : [
                                                { header: 'ID', accessor: 'id' },
                                                { header: 'Expediente o caso', accessor: 'origen', custom: 'expediente' },
                                                { header: 'Registro PPU + IMPUTADO', accessor: 'registro_ppu', custom: 'registro_imputado' },
                                                { header: 'INFORMACIÓN RELEVANTE', accessor: 'e_situacional' },
                                                { header: 'ABOGADO', accessor: 'abogado', custom: 'abogado' },
                                                { header: 'NOTIFICACIÓN', accessor: 'ruta', custom: 'pdf' },
                                                { header: 'Fiscalía', accessor: 'fiscalia' },
                                                { header: 'Juzgado', accessor: 'juzgado' },
                                                { header: 'Departamento', accessor: 'departamento' },
                                            ]
                                    ).map((col, idx) => (
                                        <TableCell key={idx} sx={{ textAlign: 'center', fontWeight: 'bold' }}>
                                            {col.header}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                                    <TableBody>
                                        {sortedData.map((row) => {
                                            const isObserved = (row.seguimiento || '')
                                                .toString()
                                                .trim()
                                                .toUpperCase() === 'OBSERVADO';
                                            const defaultColor = getRowBackgroundColor(row);
                                            // Si está observado, forzamos el morado con !important.
                                            const bgColor = isObserved
                                                ? 'purple !important'
                                                : defaultColor;

                                            return (
                                                <TableRow
                                                    key={row.id || row.registro_ppu}
                                                    hover
                                                    sx={{
                                                        backgroundColor: bgColor,
                                                        cursor: 'default',
                                                    }}
                                                >
                                            {renderRowCells(
                                                row,
                                                currentSheet === 1
                                                    ? [
                                                        { header: 'ID', accessor: 'id' },
                                                        { header: 'Expediente o caso', accessor: 'origen', custom: 'expediente' },
                                                        { header: 'Registro PPU + IMPUTADO', accessor: 'registro_ppu', custom: 'registro_imputado' },
                                                        { header: 'ACCION', accessor: 'accion' },
                                                        { header: 'PLAZO RESTANTE', accessor: 'dias_restantes' },
                                                        { header: 'Fecha del plazo', accessor: 'fecha_atencion', formatter: formatDate },
                                                        { header: 'FECHA DE AUDIENCIA', accessor: 'plazo_atencion', formatter: formatAudiencia },
                                                        { header: 'SEGUIMIENTO Y NOTIFICACIÓN', custom: true },
                                                    ]
                                                    : [
                                                        { header: 'ID', accessor: 'id' },
                                                        { header: 'Expediente o caso', accessor: 'origen', custom: 'expediente' },
                                                        { header: 'Registro PPU + IMPUTADO', accessor: 'registro_ppu', custom: 'registro_imputado' },
                                                        { header: 'INFORMACIÓN RELEVANTE', accessor: 'e_situacional' },
                                                        { header: 'ABOGADO', accessor: 'abogado', custom: 'abogado' },
                                                        { header: 'NOTIFICACIÓN', accessor: 'ruta', custom: 'pdf' },
                                                        { header: 'Fiscalía', accessor: 'fiscalia' },
                                                        { header: 'Juzgado', accessor: 'juzgado' },
                                                        { header: 'Departamento', accessor: 'departamento' },
                                                    ]
                                            )}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    <Box mt={2} display="flex" justifyContent="center">
                        <Pagination
                            count={Math.ceil(totalVencidos / 200)}
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

            {/* Modal de Observación */}
            <IngresarObservacionModal
                open={obsModalOpen}
                onClose={handleCloseObservacion}
                onSave={handleSaveObservacion}
                role={role}
                data={obsModalData}
                apiBaseUrl={API_BASE_URL}     // <-- Ahora le pasamos la URL base al modal
            />
        </>
    );
}
