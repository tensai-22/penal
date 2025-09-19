// common-plazos/observacion.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Box,
    Typography,
    TextField,
    Button,
    Modal,
    Tabs,
    Tab,
} from '@mui/material';

const modalStyle = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#fff',
    border: '2px solid #000',
    boxShadow: 24,
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    width: 500,
};

const DEFAULT_API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const IngresarObservacionModal = ({
    open,
    onClose,
    onSave,
    role, // 'admin' o 'user'
    data = {
        id: '',
        registroPpu: '',
        origen: '',
        imputado: '',
        fiscalia: '',
        juzgado: '',
        ruta: '',
        observacion_abogado: '',
    },
    apiBaseUrl, // URL base de la API, p.ej. "http://localhost:5000"
}) => {
    const baseUrl = apiBaseUrl || DEFAULT_API_BASE_URL;
    const [observacion, setObservacion] = useState('');
    const [loading, setLoading] = useState(false);
    const [tabIndex, setTabIndex] = useState(0);
    const [existingObs, setExistingObs] = useState('');

    const {
        id,
        registroPpu,
        origen,
        imputado,
        fiscalia,
        juzgado,
        ruta,
        observacion_abogado: obsFromProps,
    } = data;

    // Inicializa estado cuando se abre el modal
    useEffect(() => {
        if (open) {
            console.log('--- IngresarObservacionModal abierto ---');
            console.log('role:', role);
            console.log('data recibida:', data);

            setExistingObs(obsFromProps || '');
            setObservacion(obsFromProps || '');
            setLoading(false);

            // Para admin, pestañas disponibles; para user, fijamos tabIndex en 0
            setTabIndex(0);
        } else {
            console.log('IngresarObservacionModal cerrado');
        }
    }, [open, obsFromProps, role, data]);

    // Función genérica para pedir confirmación
    const confirmarAccion = (mensaje) => window.confirm(mensaje);

    // Llamada al backend para guardar o borrar la observación
    const guardarEnBackend = async (textoObs) => {
        try {
            const payload = { id, observacion: textoObs };
            const url = `${baseUrl}/api/guardar_observacion`;
            const headers = { 'Content-Type': 'application/json' };

            const resp = await axios.post(url, payload, { headers });
            return resp.data;
        } catch (err) {
            // Si el backend devuelve un response con datos, lo mostramos en consola
            if (err.response) {
                console.error('Respuesta con error del backend:', err.response.data);
            }
            throw err;
        }
    };

    // Guardar o actualizar la observación
    const handleGuardar = async () => {
        console.log('handleGuardar: observacion actual:', observacion);
        if (!observacion.trim()) {
            alert('La observación no puede estar vacía.');
            return;
        }
        if (!confirmarAccion('¿Seguro que desea guardar esta observación?')) return;

        setLoading(true);
        try {
            await guardarEnBackend(observacion.trim());
            alert('Observación guardada correctamente.');
            onClose();

            if (typeof onSave === 'function') {
                onSave({
                    id,
                    registroPpu,
                    origen,
                    observacion: observacion.trim(),
                });
            }
        } catch (err) {
            console.error('Error al guardar observación:', err);
            alert('No se pudo guardar la observación. Intente nuevamente.');
        } finally {
            setLoading(false);
        }
    };

    // Cancelar edición (modal)
    const handleCancelar = () => {
        console.log('handleCancelar: rol=', role);
        if (role === 'admin') {
            onClose();
        } else {
            if (confirmarAccion('¿Está seguro que quiere cancelar? Se perderá la observación escrita.')) {
                onClose();
            }
        }
    };

    // Eliminar la observación existente (solo admin)
    const handleCancelarObservacion = async () => {
        if (!existingObs) {
            alert('No hay ninguna observación registrada para cancelar.');
            return;
        }
        if (!confirmarAccion('¿Seguro que desea eliminar la observación existente?')) return;

        setLoading(true);
        try {
            await guardarEnBackend(''); // envia cadena vacía para borrar
            alert('Observación eliminada correctamente.');
            onClose();

            if (typeof onSave === 'function') {
                onSave({
                    id,
                    registroPpu,
                    origen,
                    observacion: '',
                });
            }
        } catch (err) {
            console.error('Error al eliminar observación:', err);
            alert('No se pudo eliminar la observación. Intente nuevamente.');
        } finally {
            setLoading(false);
        }
    };

    // Cambio de pestaña (solo admin)
    const handleTabChange = (event, newIndex) => {
        console.log('handleTabChange: nuevo índice de pestaña =', newIndex);
        setTabIndex(newIndex);
    };

    // Abrir PDF en nueva pestaña
    const handleOpenPDF = () => {
        console.log('handleOpenPDF: ruta del PDF =', ruta);
        if (!ruta) {
            alert('No hay PDF asociado.');
            return;
        }
        const encodedRuta = encodeURIComponent(ruta);
        const url = `${baseUrl}/api/descargar_pdf?ruta=${encodedRuta}`;
        window.open(url, '_blank');
    };

    // Evitar cierre con clic en backdrop
    const handleModalClose = (event, reason) => {
        if (reason === 'backdropClick') {
            return;
        }
        console.log('Modal onClose disparado con reason=', reason);
        handleCancelar();
    };

    return (
        <Modal open={open} onClose={handleModalClose}>
            <Box sx={modalStyle}>
                {role === 'admin' ? (
                    <>
                        <Tabs value={tabIndex} onChange={handleTabChange}>
                            <Tab label="Información de Observación" />
                            <Tab label="Editar Observación" />
                        </Tabs>

                        {tabIndex === 0 && (
                            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <Typography variant="h6" align="center">
                                    Datos del Registro
                                </Typography>
                                <Box>
                                    <Typography variant="body2">
                                        <strong>ID:</strong> {id}
                                    </Typography>
                                    <Typography variant="body2">
                                        <strong>Registro PPU:</strong> {registroPpu}
                                    </Typography>
                                    <Typography variant="body2">
                                        <strong>Origen:</strong> {origen}
                                    </Typography>
                                    {imputado && (
                                        <Typography variant="body2">
                                            <strong>Imputado:</strong> {imputado}
                                        </Typography>
                                    )}
                                    {fiscalia && (
                                        <Typography variant="body2">
                                            <strong>Fiscalía:</strong> {fiscalia}
                                        </Typography>
                                    )}
                                    {juzgado && (
                                        <Typography variant="body2">
                                            <strong>Juzgado:</strong> {juzgado}
                                        </Typography>
                                    )}
                                </Box>
                                <Box sx={{ mt: 2 }}>
                                    <Typography variant="subtitle1">
                                        <strong>Observación Registrada:</strong>
                                    </Typography>
                                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                                        {existingObs || '(No hay observación registrada)'}
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                                    <Button variant="contained" color="primary" onClick={handleOpenPDF}>
                                        Ver PDF
                                    </Button>
                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                        <Button variant="outlined" color="secondary" onClick={handleCancelar}>
                                            Cerrar
                                        </Button>
                                        {existingObs && (
                                            <Button
                                                variant="outlined"
                                                color="error"
                                                onClick={handleCancelarObservacion}
                                                disabled={loading}
                                            >
                                                Eliminar Observación
                                            </Button>
                                        )}
                                    </Box>
                                </Box>
                            </Box>
                        )}

                        {tabIndex === 1 && (
                            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Typography variant="h6" align="center">
                                    Editar Observación
                                </Typography>
                                <TextField
                                    label="Observación"
                                    value={observacion}
                                    onChange={(e) => {
                                        console.log('Cambio en TextField de observación:', e.target.value);
                                        setObservacion(e.target.value);
                                    }}
                                    multiline
                                    minRows={3}
                                    fullWidth
                                    disabled={loading}
                                />
                                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                                    <Button variant="outlined" onClick={handleCancelar} disabled={loading}>
                                        Cancelar
                                    </Button>
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        onClick={handleGuardar}
                                        disabled={loading}
                                    >
                                        {loading ? 'Guardando...' : 'Guardar'}
                                    </Button>
                                </Box>
                            </Box>
                        )}
                    </>
                ) : (
                    // Rol "user": solo campo para ingresar observación
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Typography variant="h6" align="center">
                            INGRESAR OBSERVACIÓN
                        </Typography>
                        <Box sx={{ mb: 1 }}>
                            <Typography variant="body2" color="textSecondary">
                                <strong>ID:</strong> {id}
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                                <strong>Registro PPU:</strong> {registroPpu}
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                                <strong>Origen:</strong> {origen}
                            </Typography>
                            {imputado && (
                                <Typography variant="body2" color="textSecondary">
                                    <strong>Imputado:</strong> {imputado}
                                </Typography>
                            )}
                            {fiscalia && (
                                <Typography variant="body2" color="textSecondary">
                                    <strong>Fiscalía:</strong> {fiscalia}
                                </Typography>
                            )}
                            {juzgado && (
                                <Typography variant="body2" color="textSecondary">
                                    <strong>Juzgado:</strong> {juzgado}
                                </Typography>
                            )}
                        </Box>
                        <TextField
                            label="Observación"
                            value={observacion}
                            onChange={(e) => {
                                console.log('Cambio en TextField de observación (user):', e.target.value);
                                setObservacion(e.target.value);
                            }}
                            multiline
                            minRows={3}
                            fullWidth
                            disabled={loading}
                        />
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                            <Button variant="outlined" onClick={handleCancelar} disabled={loading}>
                                Cancelar
                            </Button>
                            <Button
                                variant="contained"
                                color="primary"
                                onClick={handleGuardar}
                                disabled={loading}
                            >
                                {loading ? 'Guardando...' : 'Guardar'}
                            </Button>
                        </Box>
                    </Box>
                )}
            </Box>
        </Modal>
    );
};

export default IngresarObservacionModal;
